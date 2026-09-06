pub mod commands;
pub mod domain;
pub mod edits;
pub mod error;
pub mod git_ops;
pub mod mission;
pub mod parsers;
pub mod profiles;
pub mod reskin;
pub mod sftp;
pub mod state;
pub mod sync;
pub mod validation;
pub mod vault;

use std::sync::Arc;

use tauri::Manager;
use tokio::sync::Mutex;

use crate::profiles::ProfileStore;
use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("could not resolve app data dir");
            std::fs::create_dir_all(&app_data_dir)?;
            let config_dir = app_data_dir.join("config");
            std::fs::create_dir_all(&config_dir)?;
            let profiles_path = config_dir.join("profiles.json");

            // Open (or create) the Stronghold vault. SFTP secrets are
            // stored encrypted here instead of plaintext JSON. The vault
            // is protected by a machine-bound password so the file is
            // unreadable if copied to another machine.
            let vault = vault::VaultState::open(
                app_data_dir.join("vault.hold"),
                vault::machine_password(),
            )
            .expect("failed to open credential vault");
            // One-time migration: import any pre-Stronghold plaintext
            // secrets.json then delete it.
            vault
                .migrate_plaintext(&config_dir)
                .unwrap_or_else(|e| log::warn!("vault migration: {e}"));
            app.manage(vault);

            let store = ProfileStore::load(profiles_path)
                .unwrap_or_else(|err| panic!("failed to load profiles: {err}"));

            app.manage(AppState {
                app_data_dir,
                profiles: Arc::new(Mutex::new(store)),
                // Starts unset — the frontend writes the active id
                // immediately on app boot via `profile_set_active`.
                active_profile_id: Arc::new(tokio::sync::RwLock::new(None)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::profiles::profiles_list,
            commands::profiles::profiles_set_active,
            commands::profiles::profiles_get_active,
            commands::profiles::profiles_get,
            commands::profiles::profiles_create,
            commands::profiles::profiles_update,
            commands::profiles::profiles_duplicate,
            commands::profiles::profiles_delete,
            commands::profiles::profiles_secrets_presence,
            commands::profiles::profiles_open_workspace,
            commands::connection::connection_test,
            commands::connection::connection_test_draft,
            commands::connection::sftp_browse_draft,
            commands::sync::sync_status,
            commands::sync::sync_pull,
            commands::sync::sync_push,
            commands::sync::sync_backups_list,
            commands::sync::sync_backup_open,
            commands::sync::sync_local_diff,
            commands::sync::sync_diff_against_remote,
            commands::items::items_list,
            commands::items::items_get,
            commands::items::items_upsert,
            commands::items::items_delete,
            commands::items::items_disable,
            commands::items::items_raw_xml,
            commands::items::items_serialize_preview,
            commands::ce_import::ce_import_scan,
            commands::ce_import::ce_import_apply,
            commands::ce_import::ce_imports_list,
            commands::ce_import::ce_imports_remove,
            commands::capabilities::capabilities_status,
            commands::installed_mods::installed_mods_scan,
            commands::installed_mods::installed_mods_scan_for_profile,
            commands::tool_overrides::tool_overrides_get,
            commands::tool_overrides::tool_override_set,
            commands::tool_overrides::tool_override_clear,
            commands::ce_zones::ce_zones_list,
            commands::ce_zones::ce_zones_write_override,
            commands::events::events_list,
            commands::events::events_get,
            commands::events::events_upsert,
            commands::events::events_delete,
            commands::events::events_raw_xml,
            commands::loadouts::loadouts_list,
            commands::loadouts::spawnables_get,
            commands::loadouts::spawnables_upsert,
            commands::loadouts::spawnables_delete,
            commands::loadouts::spawnables_raw_xml,
            commands::loadouts::presets_get,
            commands::loadouts::presets_upsert,
            commands::loadouts::presets_delete,
            commands::loadouts::presets_raw_xml,
            commands::limits::limits_get,
            commands::limits::limits_update,
            commands::player_spawns::player_spawns_get,
            commands::player_spawns::player_spawns_update,
            commands::territories::territories_list,
            commands::territories::territories_update,
            commands::territories::cfgenvironment_update,
            commands::territories::territories_add_animal,
            commands::territories::territories_remove_animal,
            commands::gear_sets::gear_sets_get,
            commands::gear_sets::gear_sets_update,
            commands::gear_sets::gear_sets_scan_init_c,
            commands::gear_sets::gear_sets_generate_from_init_c,
            commands::globals::globals_get,
            commands::globals::globals_update,
            commands::server_cfg::server_cfg_get,
            commands::server_cfg::server_cfg_update,
            commands::server_root::server_root_scan,
            commands::buildings::buildings_get,
            commands::buildings::buildings_placements_get,
            commands::map_download::map_download_izurvive,
            commands::mods::mods_scan,
            commands::mods::expansion_settings_read,
            commands::mods::expansion_settings_write,
            commands::mods::expansion_list_dir,
            commands::mods_activation::mods_activation_get,
            commands::mods_activation::mods_activation_set,
            commands::mods_activation::mods_activation_add_user_mod,
            commands::mods_activation::mods_activation_remove_user_mod,
            commands::mods_activation::mods_activation_to_relative_path,
            commands::reskin_env::reskin_env_check,
            commands::reskin_vanilla::reskin_vanilla_index_status,
            commands::reskin_vanilla::reskin_vanilla_index_build,
            commands::reskin_vanilla::reskin_vanilla_index_load,
            commands::reskin_vanilla::reskin_vanilla_class_list,
            commands::reskin_vanilla::reskin_vanilla_class_get,
            commands::reskin_mods::reskin_mods_list,
            commands::reskin_mods::reskin_mods_add,
            commands::reskin_mods::reskin_mods_remove,
            commands::reskin_extract::reskin_extract_texture,
            commands::reskin_extract::reskin_reveal_extracted,
            commands::reskin_build::reskin_registry_get,
            commands::reskin_build::reskin_registry_upsert,
            commands::reskin_build::reskin_registry_remove,
            commands::reskin_build::reskin_registry_set_mod_name,
            commands::reskin_build::reskin_build_all,
            commands::reskin_build::reskin_open_build,
            commands::reskin_build::reskin_external_pbo_add,
            commands::reskin_build::reskin_external_pbo_update,
            commands::reskin_build::reskin_external_pbo_remove,
            commands::reskin_build::reskin_external_pbo_set_include,
            commands::reskin_build::reskin_config_class_upsert,
            commands::reskin_build::reskin_config_class_remove,
            commands::expansion_mission::expansion_mission_scan,
            commands::expansion_mission::expansion_mission_list_dir,
            commands::expansion_mission::expansion_mission_read,
            commands::expansion_mission::expansion_mission_write,
            commands::expansion_mission::trader_placements_read,
            commands::expansion_mission::trader_placements_write,
            commands::expansion_ce_install::expansion_ce_status,
            commands::expansion_ce_install::expansion_ce_install,
            commands::cfg_gameplay::cfg_gameplay_get,
            commands::cfg_gameplay::cfg_gameplay_update,
            commands::cfg_gameplay::cfg_gameplay_create_default,
            commands::ignorelist::cfg_ignorelist_get,
            commands::ignorelist::cfg_ignorelist_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
