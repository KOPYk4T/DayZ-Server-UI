//! Download iZurvive tile pyramids into a single stitched JPG the
//! Map page can use as its backdrop (Phase 8c follow-up).
//!
//! Based on samg381's `getmap.sh` shell script — same URL shape:
//!
//! ```
//! https://maps.izurvive.com/maps/{Map}-{Type}/{Version}/tiles/{Res}/{X}/{Y}.jpg
//! ```
//!
//! where `{Map}` is `ChernarusPlus` / `Livonia` / `Sakhal`, `{Type}`
//! is `Sat` / `Top`, `{Res}` is 1..8, and the grid is
//! `(2^Res) × (2^Res)` tiles at 256 × 256 px each.
//!
//! We cap resolution at 5 by default — res 6 already needs ~1 GB of
//! RAM to stitch, res 8 is the quad-gigapixel case the script warns
//! about. Stitched image is saved as JPG (quality 85) under
//! `<app_data_dir>/maps/`.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures::stream::{self, StreamExt};
use image::codecs::jpeg::JpegEncoder;
use image::{ImageBuffer, Rgb};
use reqwest::Client;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

const TILE_SIZE: u32 = 256;
/// How many tiles to fetch in parallel. iZurvive handles this fine
/// and it matches a reasonable browser-like load.
const CONCURRENT: usize = 8;
/// Max resolution exposed to the UI. Res 7 is 16 384 tiles at
/// 32 768 × 32 768 px — already the most the stock JPG encoder can
/// handle per-dimension (its internal limit is 65 500 px, so res 8
/// at 65 536 px overshoots by 36 px and needs per-tile resize to
/// fit). Res 6 (~4k tiles, ~16 k px, ~1 GB during stitch) is the
/// recommended upper bound for typical machines; res 7 runs but
/// needs more RAM.
const MAX_RESOLUTION: u32 = 7;
const JPEG_QUALITY: u8 = 85;
/// Emitted to the frontend so the UI can draw a progress bar.
pub const PROGRESS_EVENT: &str = "map-download-progress";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub completed: u32,
    pub total: u32,
    /// One of `downloading` / `stitching` / `saving` / `done`.
    pub stage: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapDownloadResult {
    pub saved_path: String,
    pub width: u32,
    pub height: u32,
    pub tile_count: u32,
    pub bytes: u64,
}

#[tauri::command]
pub async fn map_download_izurvive(
    map: String,
    map_type: String,
    resolution: u32,
    version: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<MapDownloadResult> {
    // ---- Input validation ----------------------------------------
    if !(1..=MAX_RESOLUTION).contains(&resolution) {
        return Err(AppError::Internal(format!(
            "resolution must be 1..{MAX_RESOLUTION} (got {resolution})"
        )));
    }
    let map = map.trim();
    let map_type = map_type.trim();
    if !matches!(map_type, "Sat" | "Top") {
        return Err(AppError::Internal(format!(
            "map_type must be 'Sat' or 'Top' (got {map_type:?})"
        )));
    }
    if map.is_empty() || version.trim().is_empty() {
        return Err(AppError::Internal("map + version are required".into()));
    }

    let tiles_per_side: u32 = 1u32 << resolution;
    let total_tiles = tiles_per_side * tiles_per_side;

    // ---- HTTP client ---------------------------------------------
    let client = Client::builder()
        .user_agent("dayz-config-manager/0.1")
        .timeout(Duration::from_secs(30))
        .build()?;

    emit_progress(&app, 0, total_tiles, "downloading");

    // ---- Download all tiles, bounded concurrency -----------------
    let base_url = format!(
        "https://maps.izurvive.com/maps/{map}-{map_type}/{version}/tiles/{resolution}"
    );
    let completed = Arc::new(AtomicU32::new(0));

    let tiles: Vec<(u32, u32)> = (0..tiles_per_side)
        .flat_map(|y| (0..tiles_per_side).map(move |x| (x, y)))
        .collect();

    let fetched: Vec<AppResult<(u32, u32, image::DynamicImage)>> =
        stream::iter(tiles.into_iter().map(|(x, y)| {
            let url = format!("{base_url}/{x}/{y}.jpg");
            let client = client.clone();
            let completed = completed.clone();
            let app = app.clone();
            async move {
                let resp = client.get(&url).send().await?;
                if !resp.status().is_success() {
                    return Err(AppError::Connection(format!(
                        "tile {x}/{y}: HTTP {} — is version \"{version_check}\" available?",
                        resp.status(),
                        version_check = url_version(&url),
                    )));
                }
                let bytes = resp.bytes().await?;
                let img = image::load_from_memory(&bytes)?;
                let done = completed.fetch_add(1, Ordering::Relaxed) + 1;
                // Emit every ~2% so the UI doesn't flood but still
                // moves steadily.
                let step = (total_tiles / 50).max(1);
                if done % step == 0 || done == total_tiles {
                    emit_progress(&app, done, total_tiles, "downloading");
                }
                Ok((x, y, img))
            }
        }))
        .buffer_unordered(CONCURRENT)
        .collect()
        .await;

    // Bubble up any tile-level failure — one broken tile makes the
    // whole montage unusable, so fail fast rather than paper over it.
    let mut decoded: Vec<(u32, u32, image::DynamicImage)> =
        Vec::with_capacity(total_tiles as usize);
    for r in fetched {
        decoded.push(r?);
    }

    // ---- Stitch --------------------------------------------------
    emit_progress(&app, total_tiles, total_tiles, "stitching");

    let full_side = tiles_per_side * TILE_SIZE;
    let mut canvas: ImageBuffer<Rgb<u8>, Vec<u8>> =
        ImageBuffer::new(full_side, full_side);
    for (tx, ty, img) in decoded {
        let rgb = img.to_rgb8();
        let off_x = tx * TILE_SIZE;
        let off_y = ty * TILE_SIZE;
        image::imageops::replace(&mut canvas, &rgb, off_x as i64, off_y as i64);
    }

    // ---- Save ----------------------------------------------------
    emit_progress(&app, total_tiles, total_tiles, "saving");

    let maps_dir = state.app_data_dir.join("maps");
    std::fs::create_dir_all(&maps_dir)?;
    let filename = format!(
        "{}_{}_v{}_res{}.jpg",
        map.replace(' ', "_"),
        map_type,
        version.replace('.', "_"),
        resolution,
    );
    let out_path: PathBuf = maps_dir.join(&filename);

    // Encode JPG at quality 85 — noticeably smaller than PNG while
    // staying sharp enough at Leaflet zoom levels we actually render.
    let file = std::fs::File::create(&out_path)?;
    let mut writer = std::io::BufWriter::new(file);
    let mut encoder = JpegEncoder::new_with_quality(&mut writer, JPEG_QUALITY);
    encoder
        .encode(
            canvas.as_raw(),
            canvas.width(),
            canvas.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| AppError::Internal(format!("encoding jpg: {e}")))?;
    drop(writer);

    let bytes = std::fs::metadata(&out_path)?.len();

    emit_progress(&app, total_tiles, total_tiles, "done");

    Ok(MapDownloadResult {
        saved_path: out_path.to_string_lossy().into_owned(),
        width: full_side,
        height: full_side,
        tile_count: total_tiles,
        bytes,
    })
}

fn emit_progress(
    app: &AppHandle,
    completed: u32,
    total: u32,
    stage: &'static str,
) {
    let _ = app.emit(
        PROGRESS_EVENT,
        DownloadProgress {
            completed,
            total,
            stage,
        },
    );
}

/// Pull the version segment out of a tile URL for error reporting —
/// `…/ChernarusPlus-Top/1.26.0/tiles/…` → `1.26.0`. Best-effort;
/// returns an empty string if the path shape is unexpected.
fn url_version(url: &str) -> String {
    let after_maps = url.split("/maps/").nth(1).unwrap_or("");
    after_maps
        .split('/')
        .nth(1)
        .unwrap_or("")
        .to_string()
}
