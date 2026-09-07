//! CE zone overlays — loot tiers from `areaflags.map`.
//!
//! DayZ bakes each world's per-cell loot tier + usage flags into a
//! single binary file. The engine checks the **mission folder**
//! first (`<mission>/areaflags.map`) and falls back to the vanilla
//! copy inside `dz_worlds.pbo` (unpacked on the P: drive at
//! `P:\DZ\worlds\<map>\ce\areaflags.map`). That mission-level
//! override is how DayZ lets operators customise tier geography
//! without PBO packaging — drop a modified file in the mission
//! root and the server picks it up next boot.
//!
//! This module owns both sides of that pipeline:
//!   - **Read**: decode whichever file is live (mission override →
//!     vanilla), render per-tier PNG overlays for the Leaflet map.
//!   - **Write**: apply a `TierOverride` transform to the live
//!     source and save to `<mission>/areaflags.map`.
//!
//! Format (reverse-engineered empirically — no official spec).
//! We read the mission copy the operator already has (pull / import);
//! we do **not** fetch Bohemia's GitHub at runtime. Official
//! `dayzOffline.*` missions ship the same bytes as
//! BohemiaInteractive/DayZ-Central-Economy.
//!
//!   Offset 0   u32 LE  fine_width   (4096 on Chernarus / Enoch / Sakhal)
//!   Offset 4   u32 LE  fine_height  (4096)
//!   Offset 8   u32 LE  coarse_width (Chernarus: 60 cells; Enoch: 12800
//!                                   — world metres, not CE cells)
//!   Offset 12  u32 LE  coarse_height (same units as coarse_width)
//!   Offset 16  u32 LE  usage_bits   (32)
//!   Offset 20  u32 LE  reserved     (0)
//!   Offset 24  4 × (fine_width × fine_height) bytes  — usage bitmask
//!                                                     planes (1 byte
//!                                                     each, 4 bytes =
//!                                                     32 bits per cell)
//!   Then the tier plane, in one of two layouts:
//!     Chernarus / Sakhal — 1 byte per cell (`W×H` bytes).
//!     Livonia (Enoch)    — 2 cells per byte (`W×H/2` bytes), low
//!                          nibble = even column. Only bits 0..=3
//!                          (Tier1..Tier4); Unique is not stored.
//!
//! Tier plane byte layout:
//!   bit 0 = Tier1, bit 1 = Tier2, bit 2 = Tier3, bit 3 = Tier4,
//!   bit 4 = Unique. Cells can hold overlapping tiers (common on
//!   boundaries); we split the file into one PNG overlay per tier
//!   level so the frontend can toggle them independently.
//!
//! Usage bits aren't surfaced yet — the 32 bits don't map 1:1 onto
//! the 17 entries in `cfglimitsdefinition.xml`'s `<usageflags>` and
//! we're not shipping guesses as labels.
//!
//! Row order in the file stores row 0 at world Z=0 (south). Leaflet
//! renders PNGs with row 0 at lat=max (north), so we flip vertically
//! on PNG encode. Writes preserve the original row order.

use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use image::codecs::png::PngEncoder;
use image::{ColorType, ImageEncoder};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::profiles::{MapId, ServerProfile};
use crate::reskin::vanilla_index;
use crate::state::AppState;

/// Overlay downsample factor. 4096 / 2 = 2048 px PNG — small enough
/// (~200–400 KB compressed) to embed as a base64 data URL and big
/// enough that tier boundaries stay crisp on a fully zoomed-in
/// Leaflet canvas.
const DOWNSAMPLE: usize = 2;
const RASTER_DIM: u32 = 4096;
/// Chernarus / Sakhal: bits 0..=4 (Tier1..Unique).
const TIER_BITS_BYTE: u8 = 0b0001_1111;
/// Livonia packed nibble: bits 0..=3 (Tier1..Tier4). Unique is absent.
const TIER_BITS_NIBBLE: u8 = 0b0000_1111;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CeZoneOverlay {
    /// `Tier1`, `Tier2`, `Tier3`, `Tier4`, `Unique`.
    pub name: String,
    /// Suggested tint. Frontend can override.
    pub color: String,
    /// Fraction of the map this tier covers, 0..1. Displayed as a
    /// badge in the sidebar so operators see at a glance how much
    /// of the map is tagged Tier4 vs Tier1.
    pub coverage: f32,
    /// `data:image/png;base64,…`. Alpha channel is binary (cell
    /// belongs to this tier → opaque, otherwise transparent). The
    /// frontend applies opacity uniformly via Leaflet's
    /// ImageOverlay `opacity` prop.
    pub png_data_url: String,
}

/// Which file the overlay data came from. `Mission` means the
/// operator has already written a custom file (we render their
/// current state). `Vanilla` means we fell back to the P: drive.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CeZoneSource {
    Mission,
    Vanilla,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CeZoneAtlas {
    /// `true` when `areaflags.map` parsed cleanly. `false` when
    /// neither the mission-level override nor the P: fallback was
    /// found — the UI renders an explanation in either case.
    pub available: bool,
    /// Which file we actually read from; `null` when `available`
    /// is false.
    pub source: Option<CeZoneSource>,
    /// Absolute path of the file we read, for display in the UI.
    pub source_path: Option<String>,
    pub overlays: Vec<CeZoneOverlay>,
    /// Reason surface: which file we couldn't read, or why.
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CeZonesWriteResult {
    /// Absolute path of the `areaflags.map` we wrote. Always inside
    /// the mission folder in the local workspace — sync the
    /// workspace to the server (Push) to deploy.
    pub path: String,
    pub bytes: u64,
    /// Where the source data came from before the transform
    /// (mission override if it already existed, else the vanilla
    /// baseline). Nice to know before deployment — writing with
    /// `Vanilla` source means first-ever override for this map.
    pub source_was: CeZoneSource,
    /// Description of what `apply` did to the tier plane, or
    /// `null` when the writer copied the source through untouched.
    pub tier_override_summary: Option<String>,
}

/// Tier-plane transformation applied before writing. Variants cover
/// the whole-map operations (Fill/Clear/Reassign) plus the painter's
/// sparse per-cell edits. Tier indices: 0=Tier1, 1=Tier2, 2=Tier3,
/// 3=Tier4, 4=Unique.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TierOverride {
    /// Replace every land cell's tier bits with just `tier`. Cells
    /// outside any tier stay 0 so no-loot regions (ocean / edges)
    /// are preserved.
    FillTier { tier: u8 },
    /// Clear `tier`'s bit everywhere. Cells that had ONLY this
    /// tier become 0; cells that overlapped with other tiers lose
    /// the bit and keep the rest.
    ClearTier { tier: u8 },
    /// Every cell with the `from` bit set gets it cleared and the
    /// `to` bit set instead. Other tier bits untouched.
    ReassignTier { from: u8, to: u8 },
    /// Sparse per-cell edits emitted by the painter. Each entry
    /// replaces the single byte at `(row, col)` with `bits`. Out-of-
    /// range coordinates are rejected before any byte is written so
    /// a malformed entry can't half-apply. Row 0 is world Z=0
    /// (south); col 0 is world X=0 (west).
    EditCells { cells: Vec<TierEditCell> },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierEditCell {
    pub row: u32,
    pub col: u32,
    pub bits: u8,
}

impl TierOverride {
    fn apply(&self, tier_plane: &mut [u8]) -> AppResult<()> {
        self.apply_on(tier_plane, RASTER_DIM, RASTER_DIM, TIER_BITS_BYTE)
    }

    fn apply_on(
        &self,
        tier_plane: &mut [u8],
        width: u32,
        height: u32,
        valid_bits: u8,
    ) -> AppResult<()> {
        let max_tier = valid_bits.trailing_ones().saturating_sub(1) as u8;
        fn validate_tier(name: &str, tier: u8, max_tier: u8) -> AppResult<u8> {
            if tier > max_tier {
                return Err(AppError::Internal(format!(
                    "tier index {tier} out of range for {name} (must be 0..={max_tier})"
                )));
            }
            Ok(1u8 << tier)
        }
        match self {
            TierOverride::FillTier { tier } => {
                let set_mask = validate_tier("fillTier", *tier, max_tier)?;
                for b in tier_plane.iter_mut() {
                    if *b != 0 {
                        *b = set_mask;
                    }
                }
            }
            TierOverride::ClearTier { tier } => {
                let bit = validate_tier("clearTier", *tier, max_tier)?;
                let clear = !bit;
                for b in tier_plane.iter_mut() {
                    *b &= clear;
                }
            }
            TierOverride::ReassignTier { from, to } => {
                let from_mask = validate_tier("reassignTier.from", *from, max_tier)?;
                let to_mask = validate_tier("reassignTier.to", *to, max_tier)?;
                let clear_from = !from_mask;
                for b in tier_plane.iter_mut() {
                    if *b & from_mask != 0 {
                        *b = (*b & clear_from) | to_mask;
                    }
                }
            }
            TierOverride::EditCells { cells } => {
                // Validate everything up-front: any out-of-range row,
                // col or bits aborts before we touch the plane so a
                // bad payload can't leave the file half-written.
                for c in cells {
                    if c.row >= height || c.col >= width {
                        return Err(AppError::Internal(format!(
                            "edit cell out of range: row={}, col={} (raster is {width}×{height})",
                            c.row, c.col
                        )));
                    }
                    if c.bits & !valid_bits != 0 {
                        return Err(AppError::Internal(format!(
                            "edit cell has invalid bits {:#010b} at ({},{}) — valid mask {valid_bits:#010b}",
                            c.bits, c.row, c.col
                        )));
                    }
                }
                let w = width as usize;
                for c in cells {
                    let idx = (c.row as usize) * w + (c.col as usize);
                    tier_plane[idx] = c.bits;
                }
            }
        }
        Ok(())
    }

    fn summary(&self) -> String {
        fn name(t: u8) -> String {
            match t {
                0 => "Tier1".into(),
                1 => "Tier2".into(),
                2 => "Tier3".into(),
                3 => "Tier4".into(),
                4 => "Unique".into(),
                _ => format!("tier?{t}"),
            }
        }
        match self {
            TierOverride::FillTier { tier } => {
                format!("fill every land cell with {}", name(*tier))
            }
            TierOverride::ClearTier { tier } => {
                format!("remove {} from every cell", name(*tier))
            }
            TierOverride::ReassignTier { from, to } => {
                format!("reassign {} → {}", name(*from), name(*to))
            }
            TierOverride::EditCells { cells } => {
                if cells.len() == 1 {
                    "painted 1 cell".into()
                } else {
                    format!("painted {} cells", cells.len())
                }
            }
        }
    }
}

/// Resolve the live `areaflags.map` for a profile. Mission-level
/// override wins — that's what the server actually reads. Falls
/// back to the vanilla file on the P: drive when no override
/// exists. Returns `Err` when neither is reachable so the caller
/// can surface a clean error.
fn resolve_source(
    workspace: &Path,
    profile: &ServerProfile,
) -> AppResult<(PathBuf, CeZoneSource)> {
    let mission_file = workspace
        .join(&profile.paths.mpmissions_relative)
        .join("areaflags.map");
    if mission_file.is_file() {
        return Ok((mission_file, CeZoneSource::Mission));
    }
    let map_folder = match profile.map {
        MapId::Chernarusplus => "chernarusplus",
        MapId::Enoch => "enoch",
        MapId::Sakhal => "sakhal",
        MapId::Custom => profile
            .custom_map_id
            .as_deref()
            .unwrap_or("")
            .trim(),
    };
    if map_folder.is_empty() {
        return Err(AppError::Internal(
            "profile has a custom map without a customMapId \
             — set one on the profile to resolve vanilla areaflags.map"
                .into(),
        ));
    }
    let dz = vanilla_index::dz_root();
    if !dz.is_dir() {
        return Err(AppError::Internal(
            "no mission override and P: drive not mounted — \
             mount the P: drive via Setup or pull a mission that \
             already contains an areaflags.map"
                .into(),
        ));
    }
    let vanilla = dz
        .join("worlds")
        .join(map_folder)
        .join("ce")
        .join("areaflags.map");
    if !vanilla.is_file() {
        return Err(AppError::Internal(format!(
            "no mission override and vanilla file not found at {}",
            vanilla.display()
        )));
    }
    Ok((vanilla, CeZoneSource::Vanilla))
}

#[tauri::command]
pub async fn ce_zones_list(
    profile_id: String,
    state: State<'_, AppState>,
) -> AppResult<CeZoneAtlas> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&profile_id)?
    };
    let workspace = state.workspace_for(&profile_id);
    let (path, source) = match resolve_source(&workspace, &profile) {
        Ok(x) => x,
        Err(e) => {
            return Ok(CeZoneAtlas {
                available: false,
                source: None,
                source_path: None,
                overlays: Vec::new(),
                note: Some(e.to_string()),
            });
        }
    };
    match parse_areaflags(&path) {
        Ok(overlays) => Ok(CeZoneAtlas {
            available: true,
            source: Some(source),
            source_path: Some(path.to_string_lossy().into_owned()),
            overlays,
            note: None,
        }),
        Err(e) => Err(AppError::Internal(format!(
            "areaflags.map parse failed ({}): {e}",
            path.display()
        ))),
    }
}

/// Apply a tier transform (or a no-op copy when `tier_override` is
/// `None`) to the current source and write the result into the
/// mission folder. The output path is `<workspace>/<mpmissions_
/// relative>/areaflags.map` — the server reads this on next boot
/// (after Push for remote profiles, or immediately for local
/// profiles if the workspace IS the server tree).
#[tauri::command]
pub async fn ce_zones_write_override(
    profile_id: String,
    tier_override: Option<TierOverride>,
    state: State<'_, AppState>,
) -> AppResult<CeZonesWriteResult> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&profile_id)?
    };
    let workspace = state.workspace_for(&profile_id);
    let mission_dir = workspace.join(&profile.paths.mpmissions_relative);
    if !mission_dir.is_dir() {
        return Err(AppError::Internal(format!(
            "mission folder does not exist — pull the profile first: {}",
            mission_dir.display()
        )));
    }

    let (source_path, source_kind) = resolve_source(&workspace, &profile)?;

    // Load whichever file is live, apply the transform (or pass
    // through), then write into the mission folder. Writing to the
    // same path we just read from is fine — AreaflagsFile buffers
    // the whole file in memory before emitting.
    let mut af = AreaflagsFile::load(&source_path)
        .map_err(|e| AppError::Internal(format!("load source: {e}")))?;
    let summary = match &tier_override {
        Some(op) => {
            let fine_w = af.fine_w;
            let fine_h = af.fine_h;
            let valid_bits = af.valid_tier_bits();
            op.apply_on(&mut af.tier_plane, fine_w, fine_h, valid_bits)?;
            Some(op.summary())
        }
        None => None,
    };

    let out_path = mission_dir.join("areaflags.map");
    af.write(&out_path)
        .map_err(|e| AppError::Internal(format!("write mission file: {e}")))?;
    let bytes = std::fs::metadata(&out_path).map(|m| m.len()).unwrap_or(0);

    Ok(CeZonesWriteResult {
        path: out_path.to_string_lossy().into_owned(),
        bytes,
        source_was: source_kind,
        tier_override_summary: summary,
    })
}

/// Per-tier palette — same hex values the frontend uses by default.
/// Surfaced from the backend so the sidebar badges match the
/// rendered overlay without the frontend needing to know the tier
/// colour convention.
fn tier_color(idx: u8) -> &'static str {
    match idx {
        0 => "#22c55e", // Tier1 — green
        1 => "#eab308", // Tier2 — yellow
        2 => "#f97316", // Tier3 — orange
        3 => "#dc2626", // Tier4 — red
        4 => "#8b5cf6", // Unique — violet
        _ => "#6b7280",
    }
}

fn tier_name(idx: u8) -> &'static str {
    match idx {
        0 => "Tier1",
        1 => "Tier2",
        2 => "Tier3",
        3 => "Tier4",
        4 => "Unique",
        _ => "Tier?",
    }
}

/// How the on-disk tier plane is packed. In memory `tier_plane` is
/// always 1 byte per cell so the painter / PNG encoder stay simple.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TierPacking {
    /// 1 byte per cell (Chernarus, Sakhal).
    Byte,
    /// 2 cells per byte, low nibble = even column (Livonia / Enoch).
    Nibble,
}

/// Parsed `areaflags.map` split into its three logical chunks.
/// Exposed so the build pipeline can substitute a modified tier
/// plane without needing to re-derive the header or re-read the
/// usage planes each time.
pub(crate) struct AreaflagsFile {
    /// Raw 24-byte header. Kept verbatim so we round-trip every
    /// reserved byte / field we don't interpret — DayZ has no
    /// documented spec so "don't touch what you don't understand"
    /// is the safer default.
    pub header: [u8; 24],
    pub fine_w: u32,
    pub fine_h: u32,
    packing: TierPacking,
    /// 4 × (fine_w × fine_h) bytes of usage bitmasks. Opaque to this
    /// module — usage bit decoding is deferred. When we write out
    /// a modified file these bytes flow through untouched so
    /// vanilla usage geometry is preserved.
    pub usage_planes: Vec<u8>,
    /// Unpacked 1-byte-per-cell tier bitmask (bit 0=Tier1 … bit 4=
    /// Unique on Byte packing; Unique is never set on Nibble).
    /// This is the plane the painter mutates.
    pub tier_plane: Vec<u8>,
}

impl AreaflagsFile {
    pub(crate) fn plane_size() -> usize {
        (RASTER_DIM as usize) * (RASTER_DIM as usize)
    }

    fn cell_count(&self) -> usize {
        self.fine_w as usize * self.fine_h as usize
    }

    fn valid_tier_bits(&self) -> u8 {
        match self.packing {
            TierPacking::Byte => TIER_BITS_BYTE,
            TierPacking::Nibble => TIER_BITS_NIBBLE,
        }
    }

    /// Parse the binary areaflags.map on disk. Layout follows the
    /// header's `fine_w`/`fine_h` plus the leftover size after the
    /// four usage planes: a full `W×H` leftover is Chernarus/Sakhal;
    /// a half leftover is Livonia's packed nibble plane.
    pub(crate) fn load(path: &Path) -> anyhow::Result<Self> {
        let bytes = std::fs::read(path)?;
        if bytes.len() < 24 {
            anyhow::bail!("file too small ({} bytes)", bytes.len());
        }
        let fine_w = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
        let fine_h = u32::from_le_bytes(bytes[4..8].try_into().unwrap());
        if fine_w == 0 || fine_h == 0 || fine_w > 8192 || fine_h > 8192 {
            anyhow::bail!("unexpected raster dims: {fine_w}x{fine_h}");
        }
        let cell_count = fine_w as usize * fine_h as usize;
        let usage_len = 4 * cell_count;
        if bytes.len() < 24 + usage_len {
            anyhow::bail!(
                "file too small for {fine_w}×{fine_h} usage planes ({} bytes)",
                bytes.len()
            );
        }
        let rest = bytes.len() - 24 - usage_len;
        let byte_size = 24 + usage_len + cell_count;
        let nibble_size = 24 + usage_len + cell_count / 2;
        let (packing, tier_plane) = if rest == cell_count {
            (
                TierPacking::Byte,
                bytes[24 + usage_len..].to_vec(),
            )
        } else if rest == cell_count / 2 && fine_w % 2 == 0 {
            (
                TierPacking::Nibble,
                unpack_nibble_plane(&bytes[24 + usage_len..], cell_count),
            )
        } else {
            anyhow::bail!(
                "unexpected file size {} for {fine_w}×{fine_h} header \
                 (Chernarus/Sakhal = {byte_size} bytes, 1 byte/cell; \
                 Livonia/Enoch = {nibble_size} bytes, packed 2 cells/byte)",
                bytes.len()
            );
        };
        let mut header = [0u8; 24];
        header.copy_from_slice(&bytes[..24]);
        let usage_planes = bytes[24..24 + usage_len].to_vec();
        Ok(Self {
            header,
            fine_w,
            fine_h,
            packing,
            usage_planes,
            tier_plane,
        })
    }

    /// Serialise back to the original on-disk packing. Exposed for
    /// round-trip tests; callers that want to write to disk should
    /// use `write`.
    pub(crate) fn to_bytes(&self) -> Vec<u8> {
        let mut out =
            Vec::with_capacity(24 + self.usage_planes.len() + self.tier_plane.len());
        out.extend_from_slice(&self.header);
        out.extend_from_slice(&self.usage_planes);
        match self.packing {
            TierPacking::Byte => out.extend_from_slice(&self.tier_plane),
            TierPacking::Nibble => out.extend_from_slice(&pack_nibble_plane(&self.tier_plane)),
        }
        out
    }

    pub(crate) fn write(&self, path: &Path) -> anyhow::Result<()> {
        let cells = self.cell_count();
        if self.usage_planes.len() != 4 * cells {
            anyhow::bail!(
                "usage_planes len {} ≠ expected {}",
                self.usage_planes.len(),
                4 * cells
            );
        }
        if self.tier_plane.len() != cells {
            anyhow::bail!(
                "tier_plane len {} ≠ expected {}",
                self.tier_plane.len(),
                cells
            );
        }
        std::fs::write(path, self.to_bytes())?;
        Ok(())
    }
}

/// Low nibble = even column. Confirmed on official Livonia
/// `areaflags.map` by fewer horizontal seams than the inverse.
fn unpack_nibble_plane(packed: &[u8], cell_count: usize) -> Vec<u8> {
    let mut out = vec![0u8; cell_count];
    for (i, &b) in packed.iter().enumerate() {
        let idx = i * 2;
        if idx < cell_count {
            out[idx] = b & 0x0F;
        }
        if idx + 1 < cell_count {
            out[idx + 1] = (b >> 4) & 0x0F;
        }
    }
    out
}

fn pack_nibble_plane(plane: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(plane.len().div_ceil(2));
    let mut i = 0;
    while i < plane.len() {
        let lo = plane[i] & 0x0F;
        let hi = if i + 1 < plane.len() {
            plane[i + 1] & 0x0F
        } else {
            0
        };
        out.push(lo | (hi << 4));
        i += 2;
    }
    out
}

fn parse_areaflags(path: &Path) -> anyhow::Result<Vec<CeZoneOverlay>> {
    let af = AreaflagsFile::load(path)?;
    let mut overlays = Vec::new();
    for tier_idx in 0u8..5 {
        let mask = 1u8 << tier_idx;
        let (png, coverage) = encode_tier_png(
            &af.tier_plane,
            af.fine_w as usize,
            af.fine_h as usize,
            mask,
            tier_color(tier_idx),
        )?;
        if coverage <= 0.0 {
            continue;
        }
        let data_url = format!(
            "data:image/png;base64,{}",
            BASE64_STANDARD.encode(&png)
        );
        overlays.push(CeZoneOverlay {
            name: tier_name(tier_idx).into(),
            color: tier_color(tier_idx).into(),
            coverage,
            png_data_url: data_url,
        });
    }
    Ok(overlays)
}

/// Emit an RGBA PNG for one tier bit. Tile colours are the tint
/// hex, alpha is 255 for "this cell is this tier" and 0 otherwise.
/// Row order is flipped so the returned raster has north-up
/// orientation (matches Leaflet's lat-increases-upward convention
/// with world Z growing northward).
fn encode_tier_png(
    plane: &[u8],
    w: usize,
    h: usize,
    mask: u8,
    color_hex: &str,
) -> anyhow::Result<(Vec<u8>, f32)> {
    let (r, g, b) = hex_to_rgb(color_hex).unwrap_or((128, 128, 128));
    let out_w = w / DOWNSAMPLE;
    let out_h = h / DOWNSAMPLE;
    let mut rgba = vec![0u8; out_w * out_h * 4];
    let mut hits: u64 = 0;

    // Max-pool each `DOWNSAMPLE × DOWNSAMPLE` block: a block is "in
    // this tier" if ANY sub-cell had the bit set. Preserves thin
    // boundary shapes better than averaging.
    for oy in 0..out_h {
        // Vertical flip: source row = (h - 1) - (oy * DOWNSAMPLE + ...)
        // so row 0 of the output image is world Z=max (north).
        let src_y_base = h - 1 - oy * DOWNSAMPLE;
        for ox in 0..out_w {
            let src_x_base = ox * DOWNSAMPLE;
            let mut hit = false;
            for dy in 0..DOWNSAMPLE {
                // Clamp towards zero — src_y_base is top of the
                // block (largest source row in the flipped space);
                // we sample downward into smaller source rows.
                let sy = src_y_base.saturating_sub(dy);
                let row_off = sy * w;
                for dx in 0..DOWNSAMPLE {
                    let sx = src_x_base + dx;
                    if sx >= w {
                        continue;
                    }
                    if plane[row_off + sx] & mask != 0 {
                        hit = true;
                        break;
                    }
                }
                if hit {
                    break;
                }
            }
            let i = (oy * out_w + ox) * 4;
            if hit {
                rgba[i] = r;
                rgba[i + 1] = g;
                rgba[i + 2] = b;
                rgba[i + 3] = 255;
                hits += 1;
            }
            // else: stays (0,0,0,0) transparent — no need to write.
        }
    }

    let mut buf = Vec::new();
    let encoder = PngEncoder::new(&mut buf);
    encoder.write_image(
        &rgba,
        out_w as u32,
        out_h as u32,
        ColorType::Rgba8.into(),
    )?;
    let coverage = hits as f32 / (out_w as f32 * out_h as f32);
    Ok((buf, coverage))
}

fn hex_to_rgb(hex: &str) -> Option<(u8, u8, u8)> {
    let s = hex.trim_start_matches('#');
    if s.len() != 6 {
        return None;
    }
    let n = u32::from_str_radix(s, 16).ok()?;
    Some((
        ((n >> 16) & 0xff) as u8,
        ((n >> 8) & 0xff) as u8,
        (n & 0xff) as u8,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_real_chernarus_file_when_available() {
        // Skip when P: isn't populated in the CI / dev box — this is
        // an opportunistic integration check, not a gate.
        let p = std::path::PathBuf::from(
            "P:/DZ/worlds/chernarusplus/ce/areaflags.map",
        );
        if !p.is_file() {
            return;
        }
        let overlays = parse_areaflags(&p).expect("parse");
        // Chernarus always has at least Tier1..Tier4 regions.
        let names: Vec<&str> =
            overlays.iter().map(|o| o.name.as_str()).collect();
        assert!(names.contains(&"Tier1"), "tier1 should be present");
        assert!(names.contains(&"Tier4"), "tier4 should be present");
        // Coverage should sum to well more than 0 and each overlay's
        // PNG data URL should begin with the right prefix.
        for o in &overlays {
            assert!(o.png_data_url.starts_with("data:image/png;base64,"));
            assert!(o.coverage > 0.0);
        }
    }

    #[test]
    fn hex_to_rgb_handles_common_values() {
        assert_eq!(hex_to_rgb("#22c55e"), Some((0x22, 0xc5, 0x5e)));
        assert_eq!(hex_to_rgb("ffffff"), Some((0xff, 0xff, 0xff)));
        assert_eq!(hex_to_rgb("bad"), None);
    }

    /// Writer round-trip against the live Chernarus file: re-emitting
    /// the original tier plane must reproduce the source byte-for-byte.
    /// Catches any silent corruption in the load/write pipeline
    /// (truncated planes, swapped chunks, dropped trailing bytes, …).
    #[test]
    fn writer_roundtrip_is_byte_identical() {
        let src = std::path::PathBuf::from(
            "P:/DZ/worlds/chernarusplus/ce/areaflags.map",
        );
        if !src.is_file() {
            return;
        }
        let original = std::fs::read(&src).expect("read src");
        let tmp = tempfile::NamedTempFile::new().expect("tmpfile");
        let out_path = tmp.path().to_path_buf();

        let af = AreaflagsFile::load(&src).expect("load");
        af.write(&out_path).expect("write");

        let rewritten = std::fs::read(&out_path).expect("read out");
        assert_eq!(
            rewritten.len(),
            original.len(),
            "file size should match"
        );
        assert_eq!(
            rewritten, original,
            "round-trip should be byte-identical"
        );
    }

    /// Flipping a single cell's tier bit should result in exactly
    /// one byte of difference vs the source file. Verifies that
    /// writes are precise (no accidental diffs elsewhere) and that
    /// reload after write restores the mutation.
    #[test]
    fn writer_preserves_precise_mutation() {
        let src = std::path::PathBuf::from(
            "P:/DZ/worlds/chernarusplus/ce/areaflags.map",
        );
        if !src.is_file() {
            return;
        }
        let original = std::fs::read(&src).expect("read src");
        let tmp = tempfile::NamedTempFile::new().expect("tmpfile");
        let out_path = tmp.path().to_path_buf();

        let mut af = AreaflagsFile::load(&src).expect("load");
        // Pick a cell near the centre that in vanilla is Tier2/3
        // mixed; flip every tier bit to Tier4 (0x08) so we can test
        // both "bit was set → cleared" and "bit was unset → set".
        let target_idx = (2000usize * RASTER_DIM as usize) + 2000;
        let before_byte = af.tier_plane[target_idx];
        let mutated_byte = 0x08u8;
        af.tier_plane[target_idx] = mutated_byte;

        af.write(&out_path).expect("write");
        let rewritten = std::fs::read(&out_path).expect("read out");

        // Byte-level diff: exactly one byte should differ, at the
        // expected position inside the tier plane (offset 24 + 4·plane).
        let diffs: Vec<(usize, u8, u8)> = original
            .iter()
            .zip(rewritten.iter())
            .enumerate()
            .filter_map(|(i, (a, b))| {
                if a != b {
                    Some((i, *a, *b))
                } else {
                    None
                }
            })
            .collect();
        assert_eq!(diffs.len(), 1, "exactly one byte should differ, got {diffs:?}");
        let (off, a, b) = diffs[0];
        let expected_off = 24 + 4 * AreaflagsFile::plane_size() + target_idx;
        assert_eq!(off, expected_off, "diff should be at the mutated offset");
        assert_eq!(a, before_byte);
        assert_eq!(b, mutated_byte);

        // Reload and confirm we can round-trip through a second load.
        let af2 = AreaflagsFile::load(&out_path).expect("reload");
        assert_eq!(af2.tier_plane[target_idx], mutated_byte);
    }

    /// Mismatched tier-plane length should fail loudly rather than
    /// silently truncating or padding the output file.
    #[test]
    fn writer_rejects_wrong_sized_tier_plane() {
        let src = std::path::PathBuf::from(
            "P:/DZ/worlds/chernarusplus/ce/areaflags.map",
        );
        if !src.is_file() {
            return;
        }
        let tmp = tempfile::NamedTempFile::new().expect("tmpfile");
        let mut af = AreaflagsFile::load(&src).expect("load");
        af.tier_plane = vec![0u8; 100];
        let err = af.write(tmp.path());
        assert!(err.is_err(), "should reject short tier plane");
    }

    #[test]
    fn fill_tier_preserves_no_loot_cells() {
        // 0x00 = no tier (ocean / no-loot). Zeros must stay zeros,
        // all other bytes become the target bit.
        let mut plane = vec![0x00, 0x03, 0x04, 0x08, 0x00];
        TierOverride::FillTier { tier: 3 }.apply(&mut plane).unwrap();
        assert_eq!(plane, vec![0x00, 0x08, 0x08, 0x08, 0x00]);
    }

    #[test]
    fn clear_tier_zeroes_only_that_bit() {
        let mut plane = vec![0x01, 0x03, 0x02, 0x04];
        TierOverride::ClearTier { tier: 0 }.apply(&mut plane).unwrap();
        assert_eq!(plane, vec![0x00, 0x02, 0x02, 0x04]);
    }

    #[test]
    fn reassign_tier_only_moves_requested_bit() {
        let mut plane = vec![0x01, 0x03, 0x02, 0x05];
        TierOverride::ReassignTier { from: 0, to: 3 }
            .apply(&mut plane)
            .unwrap();
        assert_eq!(plane, vec![0x08, 0x0a, 0x02, 0x0c]);
    }

    #[test]
    fn tier_override_rejects_out_of_range_indices() {
        let mut plane = vec![0x01];
        assert!(TierOverride::FillTier { tier: 8 }.apply(&mut plane).is_err());
        assert!(TierOverride::ClearTier { tier: 5 }
            .apply(&mut plane)
            .is_err());
    }

    #[test]
    fn edit_cells_replaces_addressed_bytes() {
        // Indices stay within row 0 so the address arithmetic
        // (row * 4096 + col) lands inside the small test plane.
        let mut plane = vec![0x01u8, 0x02, 0x04, 0x08, 0x10];
        TierOverride::EditCells {
            cells: vec![
                TierEditCell { row: 0, col: 0, bits: 0x08 },
                TierEditCell { row: 0, col: 2, bits: 0x00 },
                TierEditCell { row: 0, col: 4, bits: 0x03 },
            ],
        }
        .apply(&mut plane)
        .unwrap();
        assert_eq!(plane, vec![0x08, 0x02, 0x00, 0x08, 0x03]);
    }

    #[test]
    fn edit_cells_rejects_out_of_range_coords_atomically() {
        // The plane must not be touched if any cell is invalid —
        // operators relying on this for transactional brushes
        // shouldn't see partial writes.
        let mut plane = vec![0x01u8, 0x02];
        let before = plane.clone();
        let err = TierOverride::EditCells {
            cells: vec![
                TierEditCell { row: 0, col: 0, bits: 0x08 },
                TierEditCell { row: RASTER_DIM, col: 0, bits: 0x08 },
            ],
        }
        .apply(&mut plane);
        assert!(err.is_err());
        assert_eq!(plane, before);
    }

    #[test]
    fn edit_cells_rejects_invalid_bits() {
        // Only the low 5 bits (Tier1..Unique) are addressable;
        // anything else is a frontend bug we want to refuse.
        let mut plane = vec![0x00u8];
        let err = TierOverride::EditCells {
            cells: vec![TierEditCell { row: 0, col: 0, bits: 0xFF }],
        }
        .apply(&mut plane);
        assert!(err.is_err());
        assert_eq!(plane, vec![0x00]);
    }

    #[test]
    fn nibble_pack_is_low_nibble_even_column() {
        let plane = vec![0x01, 0x02, 0x04, 0x08, 0x03, 0x06, 0x0c, 0x00];
        let packed = pack_nibble_plane(&plane);
        assert_eq!(packed, vec![0x21, 0x84, 0x63, 0x0c]);
        assert_eq!(unpack_nibble_plane(&packed, plane.len()), plane);
    }

    #[test]
    fn livonia_layout_round_trips_packed_file() {
        // 4×2 raster: 4 usage planes × 8 cells + 4 packed tier bytes.
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&4u32.to_le_bytes());
        bytes.extend_from_slice(&2u32.to_le_bytes());
        bytes.extend_from_slice(&12800u32.to_le_bytes());
        bytes.extend_from_slice(&12800u32.to_le_bytes());
        bytes.extend_from_slice(&32u32.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&[0u8; 4 * 8]);
        bytes.extend_from_slice(&[0x21, 0x84, 0x63, 0x0c]);

        let tmp = tempfile::NamedTempFile::new().expect("tmpfile");
        std::fs::write(tmp.path(), &bytes).expect("write fixture");

        let mut af = AreaflagsFile::load(tmp.path()).expect("load packed");
        assert_eq!(af.fine_w, 4);
        assert_eq!(af.fine_h, 2);
        assert_eq!(af.packing, TierPacking::Nibble);
        assert_eq!(
            af.tier_plane,
            vec![0x01, 0x02, 0x04, 0x08, 0x03, 0x06, 0x0c, 0x00]
        );

        af.tier_plane[0] = 0x04;
        af.write(tmp.path()).expect("rewrite");
        let rewritten = std::fs::read(tmp.path()).expect("reread");
        assert_eq!(rewritten.len(), bytes.len(), "must stay packed size");
        assert_eq!(&rewritten[24 + 32..], &[0x24, 0x84, 0x63, 0x0c]);

        let err = TierOverride::FillTier { tier: 4 }.apply_on(
            &mut af.tier_plane,
            af.fine_w,
            af.fine_h,
            af.valid_tier_bits(),
        );
        assert!(err.is_err(), "Unique is not stored in Livonia packing");
    }
}
