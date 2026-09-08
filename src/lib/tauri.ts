/**
 * Typed wrappers around Tauri `invoke()`.
 *
 * Rule: never call `invoke()` directly in features/components. Always
 * add a named wrapper here so the command name is a single search hit
 * and the signature is a compile-time contract. Backends are in
 * `src-tauri/src/commands/*.rs`.
 */

import { invoke } from "@tauri-apps/api/core";

import type {
  BackupEntry,
  BrowseResult,
  BuildingPlacementsSnapshot,
  BuildingsSnapshot,
  CeImportEntry,
  ConnectionTestResult,
  DiffSummary,
  FilePreview,
  ReviewPlan,
  SyncSide,
  DynamicEvent,
  EventPayload,
  EventSpawnGroup,
  EventsSnapshot,
  GearSetsSnapshot,
  GenerateFromInitCResult,
  IzurviveMapType,
  MapDownloadResult,
  ModsScan,
  Globals,
  GlobalsSnapshot,
  ImportPlan,
  InitCScan,
  PlayerSpawnGear,
  ServerCfg,
  ServerCfgSnapshot,
  ImportRequest,
  ImportResult,
  ItemType,
  ItemsSnapshot,
  LimitsDefinition,
  LimitsSnapshot,
  LoadoutsSnapshot,
  PlayerSpawnPoints,
  PlayerSpawnsSnapshot,
  ProfileDraft,
  ProfileSecrets,
  PullResult,
  PushResult,
  RandomPreset,
  RemoveImportRequest,
  RemoveImportResult,
  SecretsPresence,
  ServerProfile,
  ServerRootScan,
  SpawnableType,
  CfgEnvironment,
  TerritoriesSnapshot,
  TerritoryBinding,
  TerritoryFile,
  WorkspaceCommit,
  WorkspaceStatus,
} from "@/types/ipc";

// ---------- Profiles ----------

export function profilesList(): Promise<ServerProfile[]> {
  return invoke("profiles_list");
}

export function profilesCreate(
  draft: ProfileDraft,
  secrets: ProfileSecrets,
): Promise<ServerProfile> {
  return invoke("profiles_create", { draft, secrets });
}

export function profilesUpdate(
  id: string,
  draft: ProfileDraft,
  secrets: ProfileSecrets | null,
): Promise<ServerProfile> {
  return invoke("profiles_update", { id, draft, secrets });
}

export function profilesDuplicate(id: string): Promise<ServerProfile> {
  return invoke("profiles_duplicate", { id });
}

export function profilesDelete(id: string): Promise<void> {
  return invoke("profiles_delete", { id });
}

export function profilesGet(id: string): Promise<ServerProfile> {
  return invoke("profiles_get", { id });
}

export function profilesOpenWorkspace(id: string): Promise<void> {
  return invoke("profiles_open_workspace", { id });
}

export function profilesSecretsPresence(id: string): Promise<SecretsPresence> {
  return invoke("profiles_secrets_presence", { id });
}

// ---------- Server root auto-detect ----------

export function serverRootScan(rootPath: string): Promise<ServerRootScan> {
  return invoke("server_root_scan", { rootPath });
}

// ---------- Connection ----------

export function connectionTest(id: string): Promise<ConnectionTestResult> {
  return invoke("connection_test", { id });
}

export function connectionTestDraft(args: {
  draft: ProfileDraft;
  secrets?: ProfileSecrets | null;
  existingId?: string | null;
}): Promise<ConnectionTestResult> {
  return invoke("connection_test_draft", {
    draft: args.draft,
    secrets: args.secrets ?? null,
    existingId: args.existingId ?? null,
  });
}

export function sftpBrowseDraft(args: {
  draft: ProfileDraft;
  secrets?: ProfileSecrets | null;
  existingId?: string | null;
  path: string;
}): Promise<BrowseResult> {
  return invoke("sftp_browse_draft", {
    draft: args.draft,
    secrets: args.secrets ?? null,
    existingId: args.existingId ?? null,
    path: args.path,
  });
}

// ---------- Sync ----------

export function syncPull(id: string): Promise<PullResult> {
  return invoke("sync_pull", { id });
}

export function syncPush(id: string): Promise<PushResult> {
  return invoke("sync_push", { id });
}

export function syncBackupsList(id: string): Promise<BackupEntry[]> {
  return invoke("sync_backups_list", { id });
}

export function syncBackupOpen(id: string, backupId: string): Promise<void> {
  return invoke("sync_backup_open", { id, backupId });
}

export function syncStatus(id: string): Promise<WorkspaceStatus> {
  return invoke("sync_status", { id });
}

export function syncDiffAgainstRemote(id: string): Promise<DiffSummary> {
  return invoke("sync_diff_against_remote", { id });
}

export function syncLocalDiff(id: string): Promise<DiffSummary> {
  return invoke("sync_local_diff", { id });
}

export function syncProbe(id: string, side: SyncSide): Promise<ReviewPlan> {
  return invoke("sync_probe", { id, side });
}

export function syncWrite(
  id: string,
  side: SyncSide,
  paths: string[],
  adoptPaths: string[],
): Promise<PushResult> {
  return invoke("sync_write", { id, side, paths, adoptPaths });
}

export function syncFetch(
  id: string,
  side: SyncSide,
  adoptPaths: string[],
): Promise<number> {
  return invoke("sync_fetch", { id, side, adoptPaths });
}

export function syncReset(id: string, side: SyncSide): Promise<PullResult> {
  return invoke("sync_reset", { id, side });
}

export function syncBootstrap(id: string): Promise<PullResult | null> {
  return invoke("sync_bootstrap", { id });
}

export function syncFilePreview(
  id: string,
  side: SyncSide,
  path: string,
): Promise<FilePreview> {
  return invoke("sync_file_preview", { id, side, path });
}

export function syncWorkspaceLog(id: string): Promise<WorkspaceCommit[]> {
  return invoke("sync_workspace_log", { id });
}

export function syncWorkspaceCommitPreview(
  id: string,
  sha: string,
  path: string,
): Promise<FilePreview> {
  return invoke("sync_workspace_commit_preview", { id, sha, path });
}

// ---------- Items (types.xml) ----------

export function itemsList(id: string): Promise<ItemsSnapshot> {
  return invoke("items_list", { id });
}

export function itemsGet(id: string, name: string): Promise<ItemType> {
  return invoke("items_get", { id, name });
}

export function itemsUpsert(
  id: string,
  items: ItemType[],
): Promise<ItemsSnapshot> {
  return invoke("items_upsert", { id, items });
}

export function itemsDelete(
  id: string,
  names: string[],
): Promise<ItemsSnapshot> {
  return invoke("items_delete", { id, names });
}

export function itemsDisable(
  id: string,
  names: string[],
): Promise<ItemsSnapshot> {
  return invoke("items_disable", { id, names });
}

export function itemsRawXml(id: string, name: string): Promise<string> {
  return invoke("items_raw_xml", { id, name });
}

export function itemsSerializePreview(
  id: string,
  items: ItemType[],
): Promise<string> {
  return invoke("items_serialize_preview", { id, items });
}

// ---------- CE import ----------

export function ceImportScan(
  id: string,
  sourceDir: string,
): Promise<ImportPlan> {
  return invoke("ce_import_scan", { id, sourceDir });
}

export function ceImportApply(
  id: string,
  request: ImportRequest,
): Promise<ImportResult> {
  return invoke("ce_import_apply", { id, request });
}

export function ceImportsList(id: string): Promise<CeImportEntry[]> {
  return invoke("ce_imports_list", { id });
}

export function ceImportsRemove(
  id: string,
  request: RemoveImportRequest,
): Promise<RemoveImportResult> {
  return invoke("ce_imports_remove", { id, request });
}

// ---------- Events ----------

export function eventsList(id: string): Promise<EventsSnapshot> {
  return invoke("events_list", { id });
}

export function eventsGet(id: string, name: string): Promise<EventPayload> {
  return invoke("events_get", { id, name });
}

export function eventsUpsert(
  id: string,
  events: DynamicEvent[],
  spawns: EventSpawnGroup[],
): Promise<EventsSnapshot> {
  return invoke("events_upsert", { id, events, spawns });
}

export function eventsDelete(
  id: string,
  names: string[],
): Promise<EventsSnapshot> {
  return invoke("events_delete", { id, names });
}

export function eventsRawXml(id: string, name: string): Promise<string> {
  return invoke("events_raw_xml", { id, name });
}

// ---------- Loadouts (spawnables + random presets) ----------

export function loadoutsList(id: string): Promise<LoadoutsSnapshot> {
  return invoke("loadouts_list", { id });
}

export function spawnablesGet(id: string, name: string): Promise<SpawnableType> {
  return invoke("spawnables_get", { id, name });
}

export function spawnablesUpsert(
  id: string,
  spawnables: SpawnableType[],
): Promise<LoadoutsSnapshot> {
  return invoke("spawnables_upsert", { id, spawnables });
}

export function spawnablesDelete(
  id: string,
  names: string[],
): Promise<LoadoutsSnapshot> {
  return invoke("spawnables_delete", { id, names });
}

export function spawnablesRawXml(id: string, name: string): Promise<string> {
  return invoke("spawnables_raw_xml", { id, name });
}

export function presetsGet(id: string, name: string): Promise<RandomPreset> {
  return invoke("presets_get", { id, name });
}

export function presetsUpsert(
  id: string,
  presets: RandomPreset[],
): Promise<LoadoutsSnapshot> {
  return invoke("presets_upsert", { id, presets });
}

export function presetsDelete(
  id: string,
  names: string[],
): Promise<LoadoutsSnapshot> {
  return invoke("presets_delete", { id, names });
}

export function presetsRawXml(id: string, name: string): Promise<string> {
  return invoke("presets_raw_xml", { id, name });
}

// ---------- Limits definition ----------

export function limitsGet(id: string): Promise<LimitsSnapshot> {
  return invoke("limits_get", { id });
}

export function limitsUpdate(
  id: string,
  definition: LimitsDefinition,
): Promise<LimitsSnapshot> {
  return invoke("limits_update", { id, definition });
}

// ---------- Player spawn points ----------

export function playerSpawnsGet(id: string): Promise<PlayerSpawnsSnapshot> {
  return invoke("player_spawns_get", { id });
}

export function playerSpawnsUpdate(
  id: string,
  data: PlayerSpawnPoints,
): Promise<PlayerSpawnsSnapshot> {
  return invoke("player_spawns_update", { id, data });
}

/** Mirror the frontend profile store's active selection into shared
 *  backend state so capability checks (and any future headless
 *  caller) resolve the same profile the user is looking at. Pass
 *  `null` to clear (logout / no profile). */
export function profilesSetActive(id: string | null): Promise<void> {
  return invoke("profiles_set_active", { id });
}

// ---------- Capability tiers ----------

/** Returns the readiness of all five prep tiers (connection,
 *  workspace, game data, mods, build tools) in a single round-trip.
 *  Used by Setup hub + the per-page CapabilityGate. */
export function capabilitiesStatus(): Promise<
  import("@/types/ipc").CapabilitiesStatus
> {
  return invoke("capabilities_status");
}

/** Walk a folder for `@*` mod directories and summarise each one
 *  (PBO count, key files, CE files, already-scanned-for-reskin
 *  flag). Read-only — the operator decides which import flows to
 *  run on each result. */
export function installedModsScan(
  root: string,
): Promise<import("@/types/ipc").InstalledModsScan> {
  return invoke("installed_mods_scan", { root });
}

/** Profile-aware variant of `installedModsScan`. Auto-resolves the
 *  scan root from the profile's connection mode: local profiles
 *  scan `profile.local.root_path`, SFTP profiles scan the workspace
 *  mod-CE cache populated during pull. Errors with a friendly hint
 *  when neither source is available. */
export function installedModsScanForProfile(
  profileId: string,
): Promise<import("@/types/ipc").InstalledModsScan> {
  return invoke("installed_mods_scan_for_profile", { profileId });
}

/** Read the persisted per-tool path overrides. Empty when the
 *  operator hasn't pointed any tool at a custom location. */
export function toolOverridesGet(): Promise<
  import("@/types/ipc").ToolOverrides
> {
  return invoke("tool_overrides_get");
}

export function toolOverrideSet(
  toolId: import("@/types/ipc").ToolId,
  path: string,
): Promise<import("@/types/ipc").ToolOverrides> {
  return invoke("tool_override_set", { toolId, path });
}

export function toolOverrideClear(
  toolId: import("@/types/ipc").ToolId,
): Promise<import("@/types/ipc").ToolOverrides> {
  return invoke("tool_override_clear", { toolId });
}

// ---------- CE zone overlays (from areaflags.map) ----------

/** Load the live areaflags.map for a profile. Reads the mission
 *  override first (`<workspace>/<mission>/areaflags.map`) and
 *  falls back to the vanilla file on the P: drive. */
export function ceZonesList(
  profileId: string,
): Promise<import("@/types/ipc").CeZoneAtlas> {
  return invoke("ce_zones_list", { profileId });
}

/** Apply an optional tier transform to the current source and
 *  write the result to `<mission>/areaflags.map`. Pass `null` /
 *  omit to pass the source through unchanged (useful for
 *  resetting a customised file to vanilla — pairs with a prior
 *  manual delete of the mission override). Push the workspace
 *  to deploy to the server. */
export function ceZonesWriteOverride(
  profileId: string,
  tierOverride?: import("@/types/ipc").TierOverride | null,
  usageOverride?: import("@/types/ipc").UsageOverride | null,
): Promise<import("@/types/ipc").CeZonesWriteResult> {
  return invoke("ce_zones_write_override", {
    profileId,
    tierOverride: tierOverride ?? null,
    usageOverride: usageOverride ?? null,
  });
}

// ---------- Territories (env/*.xml + cfgenvironment.xml) ----------

export function territoriesList(id: string): Promise<TerritoriesSnapshot> {
  return invoke("territories_list", { id });
}

export function territoriesUpdate(
  id: string,
  filename: string,
  data: TerritoryFile,
): Promise<TerritoriesSnapshot> {
  return invoke("territories_update", { id, filename, data });
}

export function cfgenvironmentUpdate(
  id: string,
  data: CfgEnvironment,
): Promise<TerritoriesSnapshot> {
  return invoke("cfgenvironment_update", { id, data });
}

export function territoriesAddAnimal(
  id: string,
  filename: string,
  binding: TerritoryBinding,
): Promise<TerritoriesSnapshot> {
  return invoke("territories_add_animal", { id, filename, binding });
}

export function territoriesRemoveAnimal(
  id: string,
  filename: string,
): Promise<TerritoriesSnapshot> {
  return invoke("territories_remove_animal", { id, filename });
}

// ---------- Gear Sets ----------

export function gearSetsGet(id: string): Promise<GearSetsSnapshot> {
  return invoke("gear_sets_get", { id });
}

export function gearSetsUpdate(
  id: string,
  data: PlayerSpawnGear,
): Promise<GearSetsSnapshot> {
  return invoke("gear_sets_update", { id, data });
}

export function gearSetsUpdateKits(
  id: string,
  kits: import("@/types/ipc").SpawnKit[],
): Promise<GearSetsSnapshot> {
  return invoke("gear_sets_update_kits", { id, kits });
}

export function gearSetsScanInitC(id: string): Promise<InitCScan> {
  return invoke("gear_sets_scan_init_c", { id });
}

export function gearSetsGenerateFromInitC(
  id: string,
): Promise<GenerateFromInitCResult> {
  return invoke("gear_sets_generate_from_init_c", { id });
}

// ---------- Globals ----------

export function globalsGet(id: string): Promise<GlobalsSnapshot> {
  return invoke("globals_get", { id });
}

export function globalsUpdate(
  id: string,
  data: Globals,
): Promise<GlobalsSnapshot> {
  return invoke("globals_update", { id, data });
}

// ---------- Server Config (serverDZ.cfg) ----------

export function serverCfgGet(id: string): Promise<ServerCfgSnapshot> {
  return invoke("server_cfg_get", { id });
}

export function serverCfgUpdate(
  id: string,
  data: ServerCfg,
): Promise<ServerCfgSnapshot> {
  return invoke("server_cfg_update", { id, data });
}

// ---------- Buildings ----------

export function buildingsGet(id: string): Promise<BuildingsSnapshot> {
  return invoke("buildings_get", { id });
}

export function buildingsPlacementsGet(
  id: string,
): Promise<BuildingPlacementsSnapshot> {
  return invoke("buildings_placements_get", { id });
}

// ---------- iZurvive map download ----------

export function mapDownloadIzurvive(args: {
  map: string;
  mapType: IzurviveMapType;
  resolution: number;
  version: string;
}): Promise<MapDownloadResult> {
  return invoke("map_download_izurvive", args);
}

// ---------- Mods ----------

export function modsScan(id: string): Promise<ModsScan> {
  return invoke("mods_scan", { id });
}

export function expansionSettingsRead(
  id: string,
  relativePath: string,
): Promise<string> {
  return invoke("expansion_settings_read", { id, relativePath });
}

export function expansionSettingsWrite(
  id: string,
  relativePath: string,
  content: string,
): Promise<void> {
  return invoke("expansion_settings_write", { id, relativePath, content });
}

export function expansionListDir(
  id: string,
  relativePath: string,
): Promise<import("@/types/ipc").ExpansionDirListing> {
  return invoke("expansion_list_dir", { id, relativePath });
}

// ---------- Mod activation store ----------

export function modsActivationGet(
  id: string,
): Promise<import("@/types/ipc").ModsActivationStore> {
  return invoke("mods_activation_get", { id });
}

export function modsActivationSet(
  id: string,
  modId: string,
  active: boolean,
): Promise<import("@/types/ipc").ModsActivationStore> {
  return invoke("mods_activation_set", { id, modId, active });
}

export function modsActivationAddUserMod(
  id: string,
  spec: import("@/types/ipc").UserAddedModInput,
): Promise<import("@/types/ipc").ModsActivationStore> {
  return invoke("mods_activation_add_user_mod", { id, spec });
}

export function modsActivationRemoveUserMod(
  id: string,
  modId: string,
): Promise<import("@/types/ipc").ModsActivationStore> {
  return invoke("mods_activation_remove_user_mod", { id, modId });
}

export function modsActivationToRelativePath(
  id: string,
  absolutePath: string,
): Promise<string> {
  return invoke("mods_activation_to_relative_path", { id, absolutePath });
}

// ---------- Expansion mission-side (mpmissions/<map>/expansion) ----------

export function expansionMissionScan(
  id: string,
): Promise<import("@/types/ipc").ExpansionMissionInventory | null> {
  return invoke("expansion_mission_scan", { id });
}

export function expansionMissionListDir(
  id: string,
  relativePath: string,
): Promise<import("@/types/ipc").MissionDirListing> {
  return invoke("expansion_mission_list_dir", { id, relativePath });
}

export function expansionMissionRead(
  id: string,
  relativePath: string,
): Promise<string> {
  return invoke("expansion_mission_read", { id, relativePath });
}

export function expansionMissionWrite(
  id: string,
  relativePath: string,
  content: string,
): Promise<void> {
  return invoke("expansion_mission_write", { id, relativePath, content });
}

export function traderPlacementsRead(
  id: string,
  relativePath: string,
): Promise<import("@/types/ipc").TraderMapFile> {
  return invoke("trader_placements_read", { id, relativePath });
}

export function traderPlacementsWrite(
  id: string,
  relativePath: string,
  file: import("@/types/ipc").TraderMapFile,
): Promise<void> {
  return invoke("trader_placements_write", { id, relativePath, file });
}

// ---------- Expansion CE install ----------

export function expansionCeStatus(
  id: string,
): Promise<import("@/types/ipc").ExpansionCeStatus> {
  return invoke("expansion_ce_status", { id });
}

export function expansionCeInstall(
  id: string,
): Promise<import("@/types/ipc").ExpansionCeInstallReport> {
  return invoke("expansion_ce_install", { id });
}

// ---------- cfggameplay.json ----------

export function cfgGameplayGet(
  id: string,
): Promise<import("@/types/ipc").CfgGameplaySnapshot> {
  return invoke("cfg_gameplay_get", { id });
}

export function cfgGameplayUpdate(
  id: string,
  data: import("@/types/ipc").CfgGameplay,
): Promise<import("@/types/ipc").CfgGameplaySnapshot> {
  return invoke("cfg_gameplay_update", { id, data });
}

export function cfgGameplayCreateDefault(
  id: string,
): Promise<import("@/types/ipc").CfgGameplaySnapshot> {
  return invoke("cfg_gameplay_create_default", { id });
}

// ---------- cfgignorelist.xml ----------

export function cfgIgnorelistGet(
  id: string,
): Promise<import("@/types/ipc").IgnoreListSnapshot> {
  return invoke("cfg_ignorelist_get", { id });
}

export function cfgIgnorelistUpdate(
  id: string,
  classnames: string[],
): Promise<import("@/types/ipc").IgnoreListSnapshot> {
  return invoke("cfg_ignorelist_update", { id, classnames });
}

// ---------- Reskin addon ----------

export function reskinEnvCheck(): Promise<
  import("@/types/ipc").ReskinEnvironment
> {
  return invoke("reskin_env_check");
}

export function reskinVanillaIndexStatus(): Promise<
  import("@/types/ipc").VanillaIndexStatus
> {
  return invoke("reskin_vanilla_index_status");
}

export function reskinVanillaIndexBuild(): Promise<
  import("@/types/ipc").VanillaIndexBuildSummary
> {
  return invoke("reskin_vanilla_index_build");
}

export function reskinVanillaIndexLoad(): Promise<
  import("@/types/ipc").VanillaClassIndex | null
> {
  return invoke("reskin_vanilla_index_load");
}

export function reskinVanillaClassList(): Promise<
  import("@/types/ipc").VanillaClassSummary[]
> {
  return invoke("reskin_vanilla_class_list");
}

export function reskinVanillaClassGet(
  name: string,
): Promise<import("@/types/ipc").SkinnableClass | null> {
  return invoke("reskin_vanilla_class_get", { name });
}

// ---------- Reskin · third-party mod sources ----------

/** List currently registered mod sources + the classes each one
 *  contributed on its last scan. Empty `sources[]` is normal —
 *  reskinning vanilla items doesn't require any mod sources at
 *  all; this is opt-in for operators who want to reskin modded
 *  weapons / clothing / vehicles too. */
export function reskinModsList(): Promise<
  import("@/types/ipc").ModClassIndex
> {
  return invoke("reskin_mods_list");
}

/** Add a new mod source by absolute folder path, OR refresh an
 *  existing source pointed at the same path. The folder is
 *  walked for `*.pbo` files; each one is unpacked + parsed and
 *  classes that expose `hiddenSelections*` are added to the
 *  reskin browser. */
export function reskinModsAdd(
  folder: string,
): Promise<import("@/types/ipc").ModScanSummary> {
  return invoke("reskin_mods_add", { folder });
}

export function reskinModsRemove(id: string): Promise<boolean> {
  return invoke("reskin_mods_remove", { id });
}

export function reskinExtractTexture(args: {
  className: string;
  slotIndex: number;
  selection: string;
  texturePath: string;
}): Promise<import("@/types/ipc").ExtractedTexture> {
  return invoke("reskin_extract_texture", args);
}

export function reskinRevealExtracted(
  className?: string,
): Promise<void> {
  return invoke("reskin_reveal_extracted", {
    className: className ?? null,
  });
}

export function reskinRegistryGet(): Promise<
  import("@/types/ipc").ReskinRegistry
> {
  return invoke("reskin_registry_get");
}

export function reskinRegistryUpsert(
  entry: import("@/types/ipc").ReskinEntry,
): Promise<import("@/types/ipc").ReskinEntry> {
  return invoke("reskin_registry_upsert", { entry });
}

export function reskinRegistryRemove(classname: string): Promise<boolean> {
  return invoke("reskin_registry_remove", { classname });
}

export function reskinRegistrySetModName(
  modName: string,
): Promise<import("@/types/ipc").ReskinRegistry> {
  return invoke("reskin_registry_set_mod_name", { modName });
}

export function reskinBuildAll(): Promise<
  import("@/types/ipc").ReskinBuildResult
> {
  return invoke("reskin_build_all");
}

export function reskinOpenBuild(modPath: string): Promise<void> {
  return invoke("reskin_open_build", { modPath });
}

// ---------- Modpack: external PBOs ----------

export function reskinExternalPboAdd(args: {
  sourcePath: string;
  displayName?: string | null;
  notes?: string | null;
}): Promise<import("@/types/ipc").ExternalPboEntry> {
  return invoke("reskin_external_pbo_add", {
    sourcePath: args.sourcePath,
    displayName: args.displayName ?? null,
    notes: args.notes ?? null,
  });
}

export function reskinExternalPboUpdate(
  entry: import("@/types/ipc").ExternalPboEntry,
): Promise<import("@/types/ipc").ExternalPboEntry> {
  return invoke("reskin_external_pbo_update", { entry });
}

export function reskinExternalPboRemove(id: string): Promise<boolean> {
  return invoke("reskin_external_pbo_remove", { id });
}

export function reskinExternalPboSetInclude(
  id: string,
  include: boolean,
): Promise<boolean> {
  return invoke("reskin_external_pbo_set_include", { id, include });
}

// ---------- Modpack: config.cpp class overrides ----------

export function reskinConfigClassUpsert(
  entry: import("@/types/ipc").ConfigClassEntry,
): Promise<import("@/types/ipc").ConfigClassEntry> {
  return invoke("reskin_config_class_upsert", { entry });
}

export function reskinConfigClassRemove(id: string): Promise<boolean> {
  return invoke("reskin_config_class_remove", { id });
}
