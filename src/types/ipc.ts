/**
 * TypeScript mirrors of Rust structs exposed over Tauri IPC.
 *
 * Keep these in sync with `src-tauri/src/commands/*.rs` and the domain
 * structs under `src-tauri/src/domain/`. These types are the contract
 * between frontend and backend — every `invoke()` argument and return
 * shape lives here.
 */

// ---------- Server profiles ----------

export type ConnectionMode = "sftp" | "local";
export type AuthType = "password" | "privateKey";
export type MapId = "chernarusplus" | "enoch" | "sakhal" | "custom";

export interface SftpConnection {
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  privateKeyPath?: string | null;
  knownHostFingerprint?: string | null;
  /** Optional absolute path on the server that mission / profiles /
   *  root-file paths are resolved against. Leave blank when the DayZ
   *  install sits under the SSH login user's home; set to e.g.
   *  `/opt/dayz` or `/home/gameserver/dayz-server` when it doesn't. */
  remoteRoot?: string | null;
}

export interface LocalConnection {
  rootPath: string;
}

export interface ProfilePaths {
  mpmissionsRelative: string;
  profilesRelative: string;
  /** Local dedicated folder name when it differs from
   *  `profilesRelative` (workspace + SFTP). Example: `instances`. */
  localProfilesRelative?: string | null;
}

export interface ModRef {
  id: string;
  version?: string | null;
  detectedFiles: string[];
}

export interface RemoteCommand {
  label: string;
  cmd: string;
}

export interface RemoteCommands {
  restart?: string | null;
  custom: RemoteCommand[];
}

export interface ServerProfile {
  id: string;
  name: string;
  mode: ConnectionMode;
  sftp?: SftpConnection | null;
  local?: LocalConnection | null;
  paths: ProfilePaths;
  map: MapId;
  customMapId?: string | null;
  /** World-metre extent override for `map === "custom"`. Sets the
   *  map canvas size + clamp bounds. Ignored for vanilla maps. */
  customMapSizeM?: number | null;
  /** Absolute local path where this profile's build outputs land
   *  (modpack PBOs, CE-zone overrides, extractions). `null` falls
   *  back to the app's data directory — keeps behavior backwards-
   *  compatible for profiles created before this field existed. */
  workDir?: string | null;
  mods: ModRef[];
  remoteCommands?: RemoteCommands | null;
  createdAt: string;
  lastPullAt?: string | null;
  lastPushAt?: string | null;
}

export interface ProfileDraft {
  name: string;
  mode: ConnectionMode;
  sftp?: SftpConnection | null;
  local?: LocalConnection | null;
  paths: ProfilePaths;
  map: MapId;
  customMapId?: string | null;
  customMapSizeM?: number | null;
  workDir?: string | null;
  remoteCommands?: RemoteCommands | null;
}

export interface ProfileSecrets {
  password?: string | null;
  keyPassphrase?: string | null;
}

export interface SecretsPresence {
  hasPassword: boolean;
  hasKeyPassphrase: boolean;
  /** Present when the OS credential store itself errored out on read
   *  (distinct from "there's simply nothing stored"). UI should warn. */
  error?: string | null;
}

// ---------- Server-root scanner ----------

export interface MissionCandidate {
  relativePath: string;
  mapHint: MapId | null;
  markers: string[];
}

export interface ProfileCandidate {
  relativePath: string;
  markers: string[];
  confidence: number;
}

export interface ServerRootScan {
  rootPath: string;
  rootExists: boolean;
  serverCfgFound: boolean;
  mpmissionsDirExists: boolean;
  missions: MissionCandidate[];
  profileFolders: ProfileCandidate[];
}

// ---------- Connection testing ----------

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  fingerprint?: string | null;
  fingerprintChanged?: boolean;
  latencyMs?: number;
}

export interface RemoteEntry {
  name: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number;
}

export interface BrowseResult {
  /** Absolute (or home-relative) path of the listed directory. */
  path: string;
  entries: RemoteEntry[];
  /** True when the request used no path and we fell back to the
   *  session's default working directory (the login home). */
  isHomeFallback: boolean;
}

// ---------- Sync (pull / push) ----------

export type ChangeKind = "added" | "modified" | "deleted";

export interface FileChange {
  path: string; // workspace-relative
  kind: ChangeKind;
  oldSize?: number;
  newSize?: number;
  oldHash?: string;
  newHash?: string;
}

export interface DiffSummary {
  changes: FileChange[];
  addedCount: number;
  modifiedCount: number;
  deletedCount: number;
  totalBytes: number;
}

export interface SkippedItem {
  /** Remote path the server refused. */
  path: string;
  /** Raw error string from the SFTP server. */
  reason: string;
}

export interface SftpCandidateDir {
  dir: string;
  listed: boolean;
  entryCount: number;
  sampleEntries: string[];
}

export interface SftpRootFileStatus {
  name: string;
  /** `"pulled"` | `"skipped"` | `"notFound"`. */
  status: string;
  /** Remote path the pull tried; empty when no match was found. */
  remotePath?: string;
  /** Error text on failure. */
  reason?: string;
}

export interface SftpLayoutReport {
  candidates: SftpCandidateDir[];
  rootFiles: SftpRootFileStatus[];
}

export interface PullResult {
  profileId: string;
  workspacePath: string;
  filesCount: number;
  totalBytes: number;
  gitCommit: string;
  completedAt: string;
  /** Files the remote refused to open during pull (typically binaries
   *  the running game server is holding open). Empty on a clean pull. */
  skipped: SkippedItem[];
  /** SFTP-only: diagnostic report on which server-root dirs were
   *  scanned, which root files were pulled, and why any were
   *  skipped. Undefined for local-mode pulls. */
  sftpLayout?: SftpLayoutReport | null;
  /** Post-pull reconciliation of the operator's edits ledger against
   *  the freshly-pulled mission files. Positions the user had added
   *  (or removed) to `cfgeventspawns.xml` get re-applied here so
   *  they survive upstream overwrites. Undefined when no mission
   *  context could be resolved. */
  reconciled?: ReconcileReport | null;
}

export interface PositionRef {
  eventName: string;
  x: number;
  y: number;
  z: number;
  a: number;
  group?: string | null;
}

export interface ReconcileReport {
  /** Ledger additions that were missing from the pulled file and
   *  got re-applied. */
  added: PositionRef[];
  /** Ledger removals that had come back in the pulled file and got
   *  stripped again. */
  removed: PositionRef[];
  /** Ledger additions already present in the pulled file. */
  skippedAdditions: PositionRef[];
  /** Ledger removals already absent from the pulled file. */
  skippedRemovals: PositionRef[];
}

export interface PushResult {
  profileId: string;
  uploadedCount: number;
  deletedCount: number;
  totalBytes: number;
  gitCommit: string;
  completedAt: string;
  backup?: BackupEntry | null;
}

export interface BackupEntry {
  id: string;
  timestamp: string;
  path: string;
  fileCount: number;
  bytes: number;
  note?: string | null;
}

export interface WorkspaceStatus {
  profileId: string;
  workspacePath: string;
  exists: boolean;
  lastPullAt?: string | null;
  lastPushAt?: string | null;
  dirty: boolean;
  unpushedCount: number;
  headCommit?: string | null;
  lastPushedCommit?: string | null;
  localServerPath?: string | null;
  localServerExists: boolean;
  hasSftp: boolean;
  remoteLabel: string;
}

export type SyncSide = "local" | "remote";
export type ReviewAction = "write" | "adopt" | "conflict";

export interface ReviewItem {
  path: string;
  action: ReviewAction;
  baseHash?: string | null;
  destHash?: string | null;
  workspaceHash?: string | null;
}

export interface ReviewPlan {
  write: ReviewItem[];
  adopt: ReviewItem[];
  conflicts: ReviewItem[];
}

export interface FilePreview {
  path: string;
  workspaceText?: string | null;
  destText?: string | null;
  binary: boolean;
}

export interface WorkspaceCommit {
  sha: string;
  message: string;
  committedAt: string;
  files: string[];
}

// ---------- Items (types.xml) ----------

export type ItemSource = "vanilla" | "mod" | "custom";

export interface ItemFlags {
  count_in_cargo: 0 | 1;
  count_in_hoarder: 0 | 1;
  count_in_map: 0 | 1;
  count_in_player: 0 | 1;
  crafted: 0 | 1;
  deloot: 0 | 1;
}

export interface ItemType {
  name: string;
  nominal: number;
  lifetime: number;
  restock: number;
  min: number;
  quantmin: number;
  quantmax: number;
  cost: number;
  flags: ItemFlags;
  category?: string | null;
  tags: string[];
  usage: string[];
  value: string[];
  source: ItemSource;
  modId?: string | null;
  file: string;
}

export interface FileOriginOut {
  relative: string;
  source: ItemSource;
  count: number;
}

export type IssueSeverity = "error" | "warning" | "info";

export interface Issue {
  severity: IssueSeverity;
  code: string;
  message: string;
  file: string;
  entity?: string | null;
}

export interface ItemsSnapshot {
  items: ItemType[];
  files: FileOriginOut[];
  validation: Issue[];
  categories: string[];
  usages: string[];
  values: string[];
  tags: string[];
}

// ---------- Events (events.xml + cfgeventspawns.xml) ----------

export interface EventFlags {
  deletable: 0 | 1;
  init_random: 0 | 1;
  remove_damaged: 0 | 1;
}

export type PositionKind = "fixed" | "random" | "player" | "uniform";
export type EventLimit = "mixed" | "child" | "parent" | "custom";

export interface EventChild {
  lootmax: number;
  lootmin: number;
  max: number;
  min: number;
  /** Classname reference — must exist in the items registry to spawn. */
  type: string;
}

export interface DynamicEvent {
  name: string;
  nominal: number;
  min: number;
  max: number;
  lifetime: number;
  restock: number;
  saferadius: number;
  distanceradius: number;
  cleanupradius: number;
  secondary?: string | null;
  flags: EventFlags;
  position: PositionKind;
  limit: EventLimit;
  active: number;
  children: EventChild[];
  childrenEx: EventChild[];
  source: ItemSource;
  modId?: string | null;
  file: string;
}

export interface EventPosition {
  x: number;
  /** Terrain elevation. Stripping this on round-trip crashes DayZ
   *  CE when it ground-clamps vehicle events on spawn — preserve
   *  it through every edit flow. */
  y: number;
  z: number;
  a: number;
  group?: string | null;
}

export interface EventSpawnGroup {
  eventName: string;
  positions: EventPosition[];
  source: ItemSource;
  modId?: string | null;
  file: string;
}

export interface EventsFileOrigin {
  relative: string;
  source: ItemSource;
  kind: string;
  count: number;
}

export interface EventsSnapshot {
  events: DynamicEvent[];
  spawns: EventSpawnGroup[];
  files: EventsFileOrigin[];
  validation: Issue[];
  knownClassnames: string[];
}

export interface EventPayload {
  event: DynamicEvent;
  spawns?: EventSpawnGroup | null;
}

// ---------- Limits definition (cfglimitsdefinition.xml) ----------

export interface LimitName {
  name: string;
}

export interface LimitFlag {
  name: string;
  value?: number | null;
}

export interface LimitsDefinition {
  categories: LimitName[];
  tags: LimitName[];
  usageflags: LimitFlag[];
  valueflags: LimitFlag[];
}

export interface LimitsImpact {
  /** Count of items referencing each declared name. */
  categories: Record<string, number>;
  tags: Record<string, number>;
  usageflags: Record<string, number>;
  valueflags: Record<string, number>;
  /** Names used on items but NOT declared in the definition. */
  orphanCategories: string[];
  orphanTags: string[];
  orphanUsageflags: string[];
  orphanValueflags: string[];
}

export interface LimitsSnapshot {
  definition: LimitsDefinition;
  impact: LimitsImpact;
  missingFile: boolean;
}

// ---------- Player spawns (cfgplayerspawnpoints.xml) ----------

export interface SpawnPosition {
  x: number;
  z: number;
  /** Yaw in degrees. 0 = facing north. */
  a: number;
}

/** Entry-element form present in the source file. Detected on read,
 *  written back in the same form to keep round-trips faithful.
 *  - `posBubble`: modern vanilla `<pos_bubble pos="x z" z_rot="a"/>`.
 *  - `pos`: older / alternative `<pos x="…" z="…" a="…"/>`. */
export type PosFormat = "posBubble" | "pos";

export interface PlayerSpawnPoints {
  fresh: SpawnPosition[];
  hop: SpawnPosition[];
  travel: SpawnPosition[];
  /** True if the file contains generator kinds we don't edit — a save
   *  from here would strip them. Frontend must gate the save until the
   *  user acknowledges. */
  hasUnsupportedGenerators: boolean;
  /** Entry-element form detected on read and written back on save. */
  posFormat: PosFormat;
}

export interface PlayerSpawnsSnapshot {
  data: PlayerSpawnPoints;
  missingFile: boolean;
}

// ---------- Territories (<mission>/env/*.xml) ----------

export interface TerritoryZone {
  name: string;
  x: number;
  z: number;
  r: number;
  smin: number;
  smax: number;
  dmin: number;
  dmax: number;
}

export interface Territory {
  /** RGBA packed integer, preserved verbatim as a string so operator-
   *  set custom colours round-trip exactly. */
  color: string;
  zones: TerritoryZone[];
}

export interface TerritoryFile {
  territories: Territory[];
}

export interface TerritoryFileEntry {
  /** Base filename, e.g. `bear_territories.xml`. */
  filename: string;
  /** Canonical category derived from the filename stem (bear, zombie,
   *  wolf, …). Used as a stable key in the UI. */
  category: string;
  /** Human label — "Bear", "Wolf", "Zombie". */
  displayName: string;
  data: TerritoryFile;
}

// cfgenvironment.xml — behaviour registry that ties territory files
// to the entities that spawn in them. Without this file the zones
// under env/ exist but never produce an animal or zombie.

/** Free-form `<item name="…" val="…"/>` pair used at every level of
 *  cfgenvironment: on the territory itself (global count caps,
 *  player-spawn radii) and on individual agents (per-zone counts). */
export interface EnvItemKv {
  name: string;
  val: string;
}

export interface EnvSpawn {
  /** Entity classname — `Animal_CervusElaphus`, `ZombieMale3_NewAI`,
   *  etc. Must resolve in the game's class config. */
  configName: string;
  /** Weight for picking this spawn within its agent. Absent = 1. */
  chance?: string | null;
}

export interface EnvAgent {
  /** Typically `Male` / `Female`, though the schema allows any
   *  string that starts with `AgentType:` — we preserve whatever
   *  the operator wrote. */
  type: string;
  chance?: string | null;
  spawns: EnvSpawn[];
  /** Agent-scoped items like `countMin` / `countMax`. */
  items: EnvItemKv[];
}

export interface TerritoryBinding {
  /** `Herd` or `Ambient` — or any other string a mod introduces. */
  type: string;
  /** Internal binding name (unique within cfgenvironment). */
  name: string;
  /** GroupBehavior class — DZDeerGroupBeh / BlissBearGroupBeh /
   *  DZAmbientLifeGroupBeh / DZdomesticGroupBeh / etc. */
  behavior: string;
  /** Stem of the `_territories.xml` file this binding drives. */
  fileUsable: string;
  agents: EnvAgent[];
  /** Territory-scoped items — globalCountMax, zoneCountMin/Max,
   *  playerSpawnRadiusNear/Far, herdsCount, … */
  items: EnvItemKv[];
}

export interface CfgEnvironment {
  /** Geometry files the game should load (relative to mission root,
   *  e.g. `env/wolf_territories.xml`). */
  filePaths: string[];
  bindings: TerritoryBinding[];
}

export interface TerritoriesSnapshot {
  files: TerritoryFileEntry[];
  /** Null when the mission doesn't ship a cfgenvironment.xml. */
  environment: CfgEnvironment | null;
  missingEnvironment: boolean;
}

// ---------- CE zone overlays (from areaflags.map) ----------

export type CeZoneKind = "tier" | "usage";

export interface CeZoneOverlay {
  /** Tier: `Tier1`…`Unique`. Usage: the `<usage name>` from
   *  `cfglimitsdefinition.xml`. */
  name: string;
  kind: CeZoneKind;
  /** Hex tint the backend already baked into the PNG. Surfaced so
   *  the sidebar legend matches the painted overlay. */
  color: string;
  /** Fraction of the world this tier covers, 0..1. Shown as a
   *  badge so operators see at a glance that (say) 68% of
   *  Chernarus is Tier2. */
  coverage: number;
  /** `data:image/png;base64,…`. Transparent where the cell isn't
   *  part of this tier. Handed straight to Leaflet's ImageOverlay. */
  pngDataUrl: string;
}

/** Which file the overlay data came from. `mission` = operator's
 *  existing customisation under `<mission>/areaflags.map`;
 *  `vanilla` = fell back to `P:\DZ\worlds\<map>\ce\areaflags.map`
 *  because no override is deployed yet. */
export type CeZoneSource = "mission" | "vanilla";

export interface CeZoneAtlas {
  /** `true` when `areaflags.map` parsed. `false` when neither the
   *  mission override nor the P: fallback was reachable — the UI
   *  shows an explainer in that case rather than an empty toggle
   *  list. */
  available: boolean;
  source: CeZoneSource | null;
  /** Absolute path of the file we read from; `null` when the atlas
   *  is unavailable. Shown in the UI so operators can confirm. */
  sourcePath: string | null;
  overlays: CeZoneOverlay[];
  /** `<usage>` names from cfglimitsdefinition.xml, declaration
   *  order = bit index. Painter uses this even when coverage is 0. */
  usageNames: string[];
  /** Reason surface when `available: false`. */
  note: string | null;
}

export interface CeZonesWriteResult {
  /** Absolute path of the `areaflags.map` we wrote — always inside
   *  the mission folder in the local workspace. Push the workspace
   *  to the server to deploy. */
  path: string;
  bytes: number;
  /** Where the source data came from before the transform.
   *  `vanilla` means first-ever override; `mission` means the
   *  operator had previously customised and we edited on top. */
  sourceWas: CeZoneSource;
  /** Description of what was applied, or `null` for a verbatim
   *  pass-through (e.g. restore-from-vanilla). */
  tierOverrideSummary: string | null;
  usageOverrideSummary: string | null;
}

export interface UsageEditCell {
  row: number;
  col: number;
  set: boolean;
}

export type UsageOverride = {
  kind: "editCells";
  bit: number;
  cells: UsageEditCell[];
};

/** A single per-cell edit emitted by the painter. `(row, col)` is in
 *  fine-cell coordinates (4096×4096 raster); `bits` is the new tier
 *  bitmask for that cell (bit 0 = Tier1 … bit 4 = Unique, 0 = empty). */
export interface TierEditCell {
  row: number;
  col: number;
  bits: number;
}

/** Tier-plane transform applied before writing. The first three
 *  variants run over every cell; `editCells` is the painter's sparse
 *  per-cell write. Tier indices: 0=Tier1, 1=Tier2, 2=Tier3, 3=Tier4,
 *  4=Unique. */
export type TierOverride =
  | { kind: "fillTier"; tier: number }
  | { kind: "clearTier"; tier: number }
  | { kind: "reassignTier"; from: number; to: number }
  | { kind: "editCells"; cells: TierEditCell[] };

// ---------- Buildings (mapgroupproto.xml) ----------

export interface BuildingPrototype {
  name: string;
  containerCount: number;
  pointCount: number;
  categories: string[];
  tags: string[];
  usages: string[];
  values: string[];
  placementCount: number;
}

export interface BuildingsData {
  prototypes: BuildingPrototype[];
  totalPlacements: number;
  unknownPlacementGroups: string[];
}

export interface BuildingsSnapshot {
  data: BuildingsData;
  missingFile: boolean;
  fileDisplay: string;
  missingPosFile: boolean;
  posFileDisplay: string;
  totalContainers: number;
  totalPoints: number;
}

/** One entry per `<group>` in `mapgrouppos.xml`. The Leaflet map is
 *  flat `(x, z)`, but `y` (elevation, metres) is kept so Expansion
 *  placement editors can suggest a height from the nearest building
 *  when the user drops a new pin. */
export interface BuildingPlacement {
  name: string;
  x: number;
  y: number;
  z: number;
}

export interface BuildingPlacementsSnapshot {
  placements: BuildingPlacement[];
  missingFile: boolean;
  fileDisplay: string;
}

// ---------- Mods (Phase 9a) ----------

export type KnownModKind =
  | "traderPlus"
  | "expansion"
  | "drJones"
  | "communityFramework"
  | "other";

export interface ModCeAvailability {
  /** Total CE-importable XML files found in the mod's own folder. */
  fileCount: number;
  /** Sum of <type> records across every `types` file shipped by
   *  this mod. 0 for mods that only add events / spawnables. */
  typesRecordCount: number;
  /** Per-kind breakdown, e.g. `{"types": 12, "spawnabletypes": 3}`. */
  byKind: Record<string, number>;
  /** Absolute local filesystem path `ce_import_scan` can hand to
   *  the existing CE import flow. */
  sourcePath: string;
  /** True when the mod already has at least one CE folder in
   *  `cfgeconomycore.xml` — rough heuristic for "imported". */
  alreadyRegistered: boolean;
}

export interface ModInfo {
  name: string;
  folderName: string;
  path: string;
  addonCount: number;
  bikeyCount: number;
  known: KnownModKind;
  ceFolders: string[];
  /** Preview of CE XML fragments the mod ships in its own folder
   *  (typically `@ModName/files/`). `null` / absent when the mod
   *  has nothing to import. */
  ceAvailability?: ModCeAvailability | null;
}

export interface ExpansionSettingsFile {
  /** Display name derived from the file stem — `"CoreSettings.json"`
   *  → `"Core"`. Falls back to the full stem if no `Settings` suffix. */
  name: string;
  /** Raw filename with extension. */
  fileName: string;
  /** Workspace-relative forward-slashed path. */
  relativePath: string;
  sizeBytes: number;
}

export interface ExpansionDataFolder {
  name: string;
  relativePath: string;
  fileCount: number;
}

export interface ExpansionInventory {
  /** Workspace-relative path to `ExpansionMod/`. */
  settingsRoot: string;
  /** Editable per-sub-module settings files from
   *  `ExpansionMod/Settings/`. */
  settingsFiles: ExpansionSettingsFile[];
  /** Content / data folders (AI, Market, Quests, Traders…) other
   *  than Settings. Browse + edit via the data browser. */
  dataFolders: ExpansionDataFolder[];
  /** Settings files sitting directly in `ExpansionMod/` (not under
   *  Settings/ or a data folder). */
  topLevelFiles: number;
}

export interface ExpansionDirEntry {
  relativePath: string;
  name: string;
  isDir: boolean;
  sizeBytes: number;
  extension?: string;
}

export interface ExpansionDirListing {
  relativePath: string;
  entries: ExpansionDirEntry[];
}

export type ProfileJsonOverride = "include" | "exclude";
export type ProfileJsonOverrideAction = "include" | "exclude" | "auto";

export interface ProfileJsonFile {
  name: string;
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  autoOn: boolean;
  reason: string;
  enabled: boolean;
  overrideState?: ProfileJsonOverride | null;
  dedicatedRoute?: string | null;
}

export interface ProfileJsonGroup {
  folder: string;
  files: ProfileJsonFile[];
}

export interface ProfileJsonCatalog {
  profilesRoot: string;
  missing: boolean;
  groups: ProfileJsonGroup[];
  enabledCount: number;
  totalCount: number;
}

// ---------- Expansion mission-side (mpmissions/<map>/expansion) ----------

// ---------- Mod activation store ----------

export type ModActivationState = "on" | "off";

export interface UserAddedMod {
  id: string;
  displayName: string;
  folderPath: string;
  createdAt: string;
}

export interface ModsActivationStore {
  activation: Record<string, ModActivationState>;
  userAdded: UserAddedMod[];
}

export interface UserAddedModInput {
  id: string;
  displayName: string;
  folderPath: string;
}

export interface ExpansionMissionFolder {
  name: string;
  relativePath: string;
  fileCount: number;
}

export interface ExpansionMissionInventory {
  missionExpansionRoot: string;
  folders: ExpansionMissionFolder[];
}

export interface MissionDirEntry {
  relativePath: string;
  name: string;
  isDir: boolean;
  sizeBytes: number;
  extension?: string;
}

export interface MissionDirListing {
  relativePath: string;
  entries: MissionDirEntry[];
}

// ---------- Trader NPC placements (.map files) ----------

export interface TraderPlacement {
  entityClass: string;
  traderFile: string;
  /** `[X, Y, Z]` world coordinates (Y is elevation in metres). */
  position: [number, number, number];
  /** `[yaw, pitch, roll]` in degrees. */
  orientation: [number, number, number];
  /** Raw gear tokens preserved in source order. Parse out
   *  `name:`/`loadout:`/`faction:` keywords lazily; attachments are
   *  joined with `+` inside a single token. */
  gear: string[];
}

export type TraderMapLine =
  | { kind: "placement"; value: TraderPlacement }
  | { kind: "other"; value: string };

export interface TraderMapFile {
  lines: TraderMapLine[];
}

export type InventorySource = "localDisk" | "remoteSnapshot" | "missing";

export interface ModsScan {
  mods: ModInfo[];
  /** CE folders with no matching mod — typically the user's custom
   *  hand-authored overrides. */
  orphanCeFolders: string[];
  /** DayZ-Expansion sub-module inventory, populated when the pulled
   *  workspace contains a `profiles/ExpansionMod/` tree. Null means
   *  Expansion isn't installed (or the workspace hasn't been pulled
   *  yet). */
  expansion?: ExpansionInventory | null;
  /** Where the mod-folder / bikey data came from: live disk,
   *  pull-time snapshot, or "no snapshot yet — pull first". The UI
   *  uses this to surface a hint when the inventory is stale /
   *  missing rather than pushing workarounds onto the user. */
  inventorySource: InventorySource;
}

// ---------- iZurvive map download ----------

export type IzurviveMapType = "Sat" | "Top";

export interface DownloadProgress {
  completed: number;
  total: number;
  stage: "downloading" | "stitching" | "saving" | "done";
}

export interface MapDownloadResult {
  savedPath: string;
  width: number;
  height: number;
  tileCount: number;
  bytes: number;
}

// ---------- Server Config (serverDZ.cfg) ----------

export type CfgValueKind = "string" | "integer" | "float" | "ident";

export type CfgSegment =
  | { kind: "blank" }
  | { kind: "comment"; text: string }
  | {
      kind: "scalar";
      key: string;
      rawValue: string;
      valueKind: CfgValueKind;
      leadingComments: string[];
      trailingComment?: string | null;
    }
  | {
      kind: "array";
      key: string;
      elements: string[];
      leadingComments: string[];
      trailingComment?: string | null;
    }
  | {
      kind: "classBlock";
      name: string;
      base?: string | null;
      raw: string;
      leadingComments: string[];
    }
  | { kind: "raw"; text: string };

export interface ServerCfg {
  segments: CfgSegment[];
}

export interface ServerCfgSnapshot {
  data: ServerCfg;
  missingFile: boolean;
  fileDisplay: string;
  searchedPaths: string[];
}

// ---------- Globals (globals.xml) ----------

export type GlobalVarType = "integer" | "float" | "string";

export interface GlobalVar {
  name: string;
  varType: GlobalVarType;
  value: string;
}

export interface Globals {
  vars: GlobalVar[];
}

export interface GlobalsSnapshot {
  data: Globals;
  missingFile: boolean;
  fileDisplay: string;
}

// ---------- Gear Sets (cfgPlayerSpawnGear.json) ----------

export interface SpawnEntry {
  label: string;
  chance: number;
  items: string[];
}

export interface GearLoadout {
  characterTypes: string[];
  attachmentEntries: SpawnEntry[];
  cargoEntries: SpawnEntry[];
  classnames: string[];
}

export interface PlayerSpawnGear {
  version?: string | null;
  loadouts: GearLoadout[];
}

export type GearSetsSource =
  | "spawnPresets"
  | "cfgPlayerSpawnGear"
  | "missing";

export interface SpawnKitItem {
  itemType: string;
  spawnWeight: number;
  healthMin: number;
  healthMax: number;
  quantityMin: number;
  quantityMax: number;
  quickBarSlot: number;
}

export interface SpawnKitSlot {
  slotName: string;
  items: SpawnKitItem[];
}

export interface SpawnKitPocket {
  name: string;
  spawnWeight: number;
  items: SpawnKitItem[];
}

export interface SpawnKit {
  relPath: string;
  name: string;
  spawnWeight: number;
  characterTypes: string[];
  worn: SpawnKitSlot[];
  pockets: SpawnKitPocket[];
}

export interface GearSetsSnapshot {
  data: PlayerSpawnGear;
  missingFile: boolean;
  /** Live file the engine reads. `spawnPresets` = cfggameplay.json list. */
  source: GearSetsSource;
  fileDisplay: string;
  allClassnames: string[];
  kits: SpawnKit[];
}

// ---------- init.c importer (Phase 6c) ----------

export type InitCCallKind =
  | "createInInventory"
  | "createAttachment"
  | "arrayElement";

export interface InitCCall {
  lineNumber: number;
  kind: InitCCallKind;
  classname: string;
  contextLine: string;
}

export interface StringArrayDecl {
  name: string;
  lineNumber: number;
  values: string[];
}

export interface InitCScan {
  fileDisplay: string;
  fileExists: boolean;
  totalLines: number;
  calls: InitCCall[];
  arrays: StringArrayDecl[];
  classnames: string[];
}

export interface GenerateFromInitCResult {
  writtenPath: string;
  classnamesCount: number;
  overwroteExisting: boolean;
}

// ---------- Loadouts (cfgspawnabletypes + cfgrandompresets) ----------

export interface SpawnableItem {
  name: string;
  chance: number;
  preset?: string | null;
}

export interface AttachmentGroup {
  chance: number;
  slotName?: string | null;
  items: SpawnableItem[];
}

export interface CargoGroup {
  chance: number;
  items: SpawnableItem[];
}

export interface SpawnableType {
  name: string;
  hoarder: boolean;
  attachments: AttachmentGroup[];
  cargo: CargoGroup[];
  source: ItemSource;
  modId?: string | null;
  file: string;
}

export type PresetKind = "cargo" | "attachments";

export interface PresetItem {
  name: string;
  chance: number;
}

export interface RandomPreset {
  name: string;
  kind: PresetKind;
  chance: number;
  items: PresetItem[];
  source: ItemSource;
  modId?: string | null;
  file: string;
}

export interface LoadoutsFileOrigin {
  relative: string;
  source: ItemSource;
  kind: string;
  count: number;
}

export interface LoadoutsSnapshot {
  spawnables: SpawnableType[];
  presets: RandomPreset[];
  files: LoadoutsFileOrigin[];
  validation: Issue[];
  knownClassnames: string[];
  presetNamesAttachments: string[];
  presetNamesCargo: string[];
}

// ---------- CE import (mod files → mission folder) ----------

export type ClassificationSignal =
  /** Filename and content both pointed at the same kind. */
  | "filename_agreed"
  /** Content was authoritative; filename was ambiguous. */
  | "content"
  /** Filename hinted a known kind but content was unparseable — we
   *  trust the filename but warn. */
  | "filename_only"
  /** Filename hint and content kind disagree — content wins but UI
   *  surfaces the mismatch so operator can investigate. */
  | "filename_mismatch"
  /** Neither signal matched. */
  | "unknown";

export type CeFileKind =
  | "types"
  | "spawnabletypes"
  | "events"
  | "eventposdef"
  | "randompresets"
  | "economy_core"
  | "unknown";

export interface ScannedFile {
  sourcePath: string;
  relativePath: string;
  kind: CeFileKind;
  kindLabel: string;
  importable: boolean;
  sizeBytes: number;
  /** How the classifier arrived at `kind`. Powers the evidence
   *  badge in the import dialog. */
  classification: ClassificationSignal;
  recordCount: number;
}

export interface ImportPlan {
  sourceRoot: string;
  suggestedDestFolder: string;
  files: ScannedFile[];
  importableCount: number;
  unknownCount: number;
}

export interface ImportRequest {
  sourceRoot: string;
  destFolder: string;
  relativePaths: string[];
  overwrite: boolean;
}

export type ImportStatus = "imported" | "skipped" | "failed";

export interface ImportEntry {
  source: string;
  destination: string;
  kind: CeFileKind;
  status: ImportStatus;
  message?: string | null;
}

export interface ImportResult {
  importedCount: number;
  skippedCount: number;
  cfgeconomycoreUpdated: boolean;
  destFolder: string;
  entries: ImportEntry[];
}

// ---------- CE imports — list / uninstall ----------

export interface CeFileStatus {
  name: string;
  fileType: string;
  existsOnDisk: boolean;
  sizeBytes: number;
}

export interface CeBlockInfo {
  folder: string;
  files: CeFileStatus[];
}

export interface CeImportEntry {
  folderTop: string;
  blocks: CeBlockInfo[];
  missionDirExists: boolean;
  totalFiles: number;
  totalBytes: number;
  isCustom: boolean;
}

export interface RemoveImportRequest {
  folderTop: string;
  deleteFiles: boolean;
  allowCustom?: boolean;
}

export interface RemoveImportResult {
  folderTop: string;
  blocksRemoved: number;
  filesDeleted: number;
  directoryRemoved: boolean;
  cfgeconomycoreUpdated: boolean;
}

// ---------- cfggameplay.json ----------

/** Each section carries an `extra` bag of fields we don't explicitly
 *  model — preserves future Bohemia additions + mod-added knobs on
 *  round-trip. Every field is optional on the wire; the editor only
 *  writes what's been set. */
export interface CfgGameplayStaminaData {
  sprintStaminaModifierErc?: number | null;
  sprintStaminaModifierCro?: number | null;
  staminaWeightLimitThreshold?: number | null;
  staminaMax?: number | null;
  staminaKgToStaminaPercentPenalty?: number | null;
  staminaMinCap?: number | null;
  sprintSwimmingStaminaModifier?: number | null;
  sprintLadderStaminaModifier?: number | null;
  meleeStaminaModifier?: number | null;
  obstacleTraversalStaminaModifier?: number | null;
  holdBreathStaminaModifier?: number | null;
  [extra: string]: unknown;
}

export interface CfgGameplayShockHandlingData {
  shockRefillSpeedConscious?: number | null;
  shockRefillSpeedUnconscious?: number | null;
  allowRefillSpeedModifier?: boolean | null;
  [extra: string]: unknown;
}

export interface CfgGameplayMovementData {
  timeToStrafeJog?: number | null;
  rotationSpeedJog?: number | null;
  timeToSprint?: number | null;
  timeToStrafeSprint?: number | null;
  rotationSpeedSprint?: number | null;
  allowStaminaAffectInertia?: boolean | null;
  [extra: string]: unknown;
}

export interface CfgGameplayDrowningData {
  staminaDepletionSpeed?: number | null;
  healthDepletionSpeed?: number | null;
  shockDepletionSpeed?: number | null;
  [extra: string]: unknown;
}

export interface CfgGameplayWeaponObstructionData {
  staticMode?: number | null;
  dynamicMode?: number | null;
  [extra: string]: unknown;
}

export interface CfgGameplayPlayerData {
  disablePersonalLight?: boolean | null;
  StaminaData?: CfgGameplayStaminaData | null;
  ShockHandlingData?: CfgGameplayShockHandlingData | null;
  MovementData?: CfgGameplayMovementData | null;
  DrowningData?: CfgGameplayDrowningData | null;
  WeaponObstructionData?: CfgGameplayWeaponObstructionData | null;
  [extra: string]: unknown;
}

export interface CfgGameplayGeneralData {
  disableBaseDamage?: boolean | null;
  disableContainerDamage?: boolean | null;
  disableRespawnDialog?: boolean | null;
  disableRespawnInUnconsciousness?: boolean | null;
  [extra: string]: unknown;
}

export interface CfgGameplayWorldsData {
  lightingConfig?: number | null;
  objectSpawnersArr?: string[] | null;
  /** 12 values — one per calendar month. */
  environmentMinTemps?: number[] | null;
  environmentMaxTemps?: number[] | null;
  wetnessWeightModifiers?: number[] | null;
  [extra: string]: unknown;
}

export interface CfgGameplayHologramData {
  disableIsCollidingBboxCheck?: boolean | null;
  disableIsCollidingPlayerCheck?: boolean | null;
  disableIsClippingRoofCheck?: boolean | null;
  disableIsBaseViableCheck?: boolean | null;
  disableIsCollidingGPlotCheck?: boolean | null;
  disableIsCollidingAngleCheck?: boolean | null;
  disableIsPlacementPermittedCheck?: boolean | null;
  disableHeightPlacementCheck?: boolean | null;
  disableIsUnderwaterCheck?: boolean | null;
  disableIsInTerrainCheck?: boolean | null;
  disableColdAreaBuildingCheck?: boolean | null;
  disallowedTypesInUnderground?: string[] | null;
  [extra: string]: unknown;
}

export interface CfgGameplayConstructionData {
  disablePerformRoofCheck?: boolean | null;
  disableIsCollidingCheck?: boolean | null;
  disableDistanceCheck?: boolean | null;
  [extra: string]: unknown;
}

export interface CfgGameplayBaseBuildingData {
  HologramData?: CfgGameplayHologramData | null;
  ConstructionData?: CfgGameplayConstructionData | null;
  [extra: string]: unknown;
}

export interface CfgGameplayHitIndicationData {
  hitDirectionOverrideEnabled?: boolean | null;
  hitDirectionBehaviour?: number | null;
  hitDirectionStyle?: number | null;
  hitDirectionIndicatorColorStr?: string | null;
  hitDirectionMaxDuration?: number | null;
  hitDirectionBreakPointRelative?: number | null;
  hitDirectionScatter?: number | null;
  hitIndicationPostProcessEnabled?: boolean | null;
  [extra: string]: unknown;
}

export interface CfgGameplayUIData {
  use3DMap?: boolean | null;
  HitIndicationData?: CfgGameplayHitIndicationData | null;
  [extra: string]: unknown;
}

export interface CfgGameplayMapData {
  ignoreMapOwnership?: boolean | null;
  ignoreNavItemsOwnership?: boolean | null;
  displayPlayerPosition?: boolean | null;
  displayNavInfo?: boolean | null;
  [extra: string]: unknown;
}

export interface CfgGameplayVehicleData {
  boatDecayMultiplier?: number | null;
  [extra: string]: unknown;
}

export interface CfgGameplay {
  version?: number | null;
  GeneralData?: CfgGameplayGeneralData | null;
  PlayerData?: CfgGameplayPlayerData | null;
  WorldsData?: CfgGameplayWorldsData | null;
  BaseBuildingData?: CfgGameplayBaseBuildingData | null;
  UIData?: CfgGameplayUIData | null;
  MapData?: CfgGameplayMapData | null;
  VehicleData?: CfgGameplayVehicleData | null;
  [extra: string]: unknown;
}

export interface CfgGameplaySnapshot {
  data: CfgGameplay | null;
  fileDisplay: string;
  fileExists: boolean;
}

// ---------- cfgignorelist.xml ----------

export interface IgnoreListSnapshot {
  classnames: string[];
  fileDisplay: string;
  fileExists: boolean;
}

// ---------- Reskin addon environment ----------

export interface ReskinToolStatus {
  id: string;
  displayName: string;
  expectedRelative: string;
  resolvedPath?: string | null;
  present: boolean;
}

export interface ReskinPDriveStatus {
  mounted: boolean;
  hasScripts: boolean;
  hasDz: boolean;
  privateKeyPresent: boolean;
  signingKeyPath: string | null;
}

export interface ReskinEnvironment {
  toolsDir: string;
  toolsDirExists: boolean;
  tools: ReskinToolStatus[];
  pDrive: ReskinPDriveStatus;
  ready: boolean;
}

export interface SkinnableClass {
  name: string;
  parent: string | null;
  containers: string[];
  hiddenSelections: string[];
  hiddenSelectionsTextures: string[];
  hiddenSelectionsMaterials: string[];
  /** `@-folder name` of the third-party mod this class came from
   *  (`@ExpansionMod`, `@CF`, …). Absent for vanilla / modpack
   *  classes. The build pipeline uses this to declare the mod's
   *  CfgPatches identifiers in the generated addon's
   *  `requiredAddons[]`. */
  sourceMod?: string | null;
}

export interface SkippedAddon {
  addon: string;
  reason: string;
}

export interface VanillaIndexStatus {
  cached: boolean;
  builtAt?: string | null;
  addonCount: number;
  classCount: number;
  skipped: SkippedAddon[];
}

export interface VanillaIndexBuildSummary {
  addonCount: number;
  classCount: number;
  skipped: number;
  durationMs: number;
  cachePath: string;
}

/** Where a class in the reskin wizard's picker came from:
 *  `vanilla` = parsed from DayZ's P: drive (reskinnable ones only;
 *   the parse is scoped to classes with hidden-selection slots so
 *   the list doesn't balloon with internal pool / config classes);
 *  `modpack` = user-authored config class with `kind === "new"`,
 *   included so the operator can reskin their own derived classes;
 *  `items` = class registered in the mission's types.xml (via
 *   cfgeconomycore). Shows up so the Classes page scope matches
 *   what the Items page lists — animals, vehicles, and everything
 *   else the CE manages — even when they can't actually be
 *   reskinned. */
export type ClassSource = "vanilla" | "modpack" | "items" | "mod";

// ---------- Capability tier model ----------

/** The five prep dependency tiers the app gates features on. Kept
 *  as a string union so frontend code can declare a route's
 *  prerequisites declaratively without importing a Rust-generated
 *  enum. Wire-format mirrors the Rust `CapabilityTier`. */
export type CapabilityTier =
  | "connection"
  | "workspace"
  | "game_data"
  | "mods"
  | "build_tools";

export type TierState = "ready" | "stale" | "todo" | "warn" | "blocked";

export interface CapabilityStep {
  id: string;
  label: string;
  state: TierState;
  /** One-liner under the row. May be empty for nominal rows. */
  detail: string;
}

export interface CapabilityTierStatus {
  tier: CapabilityTier;
  state: TierState;
  title: string;
  description: string;
  /** Routes that gate on this tier becoming ready. The Setup page
   *  surfaces these as "Unlocks: …" so operators see the
   *  consequence of running each step before they take action. */
  unlocks: string[];
  steps: CapabilityStep[];
}

export interface CapabilitiesStatus {
  tiers: CapabilityTierStatus[];
  /** True when the basic editing flow (T1 + T2) is ready. */
  allRequiredReady: boolean;
}

// ---------- Installed-mods scan (Setup hub Tier 4 initiator) ----------

export interface InstalledMod {
  /** Folder name including the `@` prefix. */
  displayName: string;
  /** Absolute folder path on disk. */
  sourcePath: string;
  pboCount: number;
  pboBytes: number;
  hasBikey: boolean;
  /** True when the mod ships types.xml / events.xml /
   *  cfgspawnabletypes.xml / similar — i.e. the operator probably
   *  needs the "Import CE files" flow for it. */
  hasCeFiles: boolean;
  /** True when this mod's folder is already registered in the
   *  reskin mod-index (so we don't offer to scan it twice). */
  reskinScanned: boolean;
}

export interface InstalledModsScan {
  root: string;
  mods: InstalledMod[];
  warnings: string[];
}

// ---------- Tool path overrides ----------

/** Stable tool ids the override registry recognises. New tools land
 *  in the Rust `TOOL_IDS` constant; this union mirrors them so the
 *  frontend can type the calls without going to the wire as raw
 *  strings. */
export type ToolId =
  | "derap"
  | "extract_pbo"
  | "make_pbo"
  | "image_to_paa"
  | "ds_sign"
  | "ds_create_key";

export interface ToolOverrides {
  /** Tool id → absolute path on disk. Missing keys mean "use the
   *  bundled default under tools/". */
  paths: Record<string, string>;
}

export interface VanillaClassSummary {
  name: string;
  parent: string | null;
  container: string | null;
  selectionCount: number;
  /** True when the class exposes at least one hidden-selection slot
   *  that the reskin wizard can target. Classes with
   *  `reskinnable: false` show in the browser for reference + parent
   *  picking but aren't selectable as reskin sources. Optional —
   *  older cached indexes don't have the field; absent == false. */
  reskinnable?: boolean;
  /** Optional because older Rust builds didn't emit this field — any
   *  absent value falls back to treating the class as vanilla. */
  source?: ClassSource | null;
  /** When `source === "mod"`, the `@-folder name` of the contributing
   *  mod. Lets the UI render "AKM_Variant · @ExpansionMod" so
   *  operators can disambiguate when multiple mod sources contribute
   *  classes with overlapping names. */
  sourceMod?: string | null;
}

/** Per-mod scan result. One row per `@-folder` the operator has
 *  registered as a mod source. */
export interface ModSource {
  id: string;
  /** Leaf folder name (`@ExpansionMod`). Same string used as
   *  `sourceMod` on each contributed class. */
  displayName: string;
  /** Absolute path the operator picked. */
  sourcePath: string;
  addedAt: string;
  lastScannedAt?: string | null;
  /** Hash of (pbo_path, mtime) tuples — when this changes the next
   *  scan re-extracts; otherwise it's a cache hit. */
  inventoryHash: string;
  addonCount: number;
  classCount: number;
  classes: SkinnableClass[];
  skipped: ModSkippedAddon[];
  /** CfgPatches identifiers declared anywhere in the mod's PBOs,
   *  surfaced so the build can populate `requiredAddons[]`. */
  cfgPatches: string[];
}

/** Mod-scan equivalent of `SkippedAddon` — reports per-PBO failures
 *  (addon-prefix-relative path + reason). Distinct from the vanilla
 *  index's `SkippedAddon` because that one keys on the addon-folder
 *  name rather than a PBO file. */
export interface ModSkippedAddon {
  pbo: string;
  reason: string;
}

export interface ModClassIndex {
  sources: ModSource[];
}

export interface ModScanSummary {
  sourceId: string;
  addonCount: number;
  classCount: number;
  skipped: number;
  durationMs: number;
  /** `true` when the cache was reused because nothing changed
   *  since the last scan. UI can surface "no change" instead of
   *  "X classes" so operators understand a refresh was a no-op. */
  cacheHit: boolean;
}

export interface VanillaClassIndex {
  builtAt: string;
  dzRoot: string;
  inventoryHash: string;
  addonCount: number;
  classCount: number;
  classes: SkinnableClass[];
  skipped: SkippedAddon[];
}

export interface ExtractedTexture {
  sourcePaa: string;
  extractedPng: string;
}

// ---------- Reskin build pipeline ----------

export type ReskinMode = "coexist" | "replace";

export interface ReskinProceduralColor {
  r: number;
  g: number;
  b: number;
  a: number;
  type: string;
}

export interface ReskinSlotOverride {
  slotIndex: number;
  selection: string;
  sourceFile?: string | null;
  sourceColor?: ReskinProceduralColor | null;
}

export interface ReskinEntry {
  source: SkinnableClass;
  newClassname: string;
  mode: ReskinMode;
  slots: ReskinSlotOverride[];
  createdAt: string;
  updatedAt: string;
}

export interface ReskinRegistry {
  modName: string;
  reskins: ReskinEntry[];
  /** User-supplied PBO files that ship inside the modpack alongside
   *  the auto-packed addon. */
  externalPbos: ExternalPboEntry[];
  /** Author-written config.cpp class blocks, merged into the same
   *  generated config as the reskins at build time. */
  configClasses: ConfigClassEntry[];
}

export interface ExternalPboEntry {
  id: string;
  displayName: string;
  /** Absolute local filesystem path to the `.pbo`. The build step
   *  re-reads this at pack time, so moving the source file between
   *  add and build means the build fails with a clear message. */
  sourcePath: string;
  /** Toggle for temporarily excluding without losing the entry. */
  include: boolean;
  /** Operator-authored notes (plain text). */
  notes?: string;
  addedAt: string;
  sizeBytes: number;
}

/** Explicit intent for a config-class entry:
 *  `new` introduces a brand-new class symbol — it shows up as a
 *   selectable entry in the reskin wizard's class picker, CfgPatches
 *   lists it, and the auto-generated types.xml emits a `<type>` for
 *   it.
 *  `override` rewrites an existing class of the same name — it does
 *   NOT create a new symbol, so downstream views treat it as a
 *   modifier on the vanilla class, not a standalone addition. */
export type ConfigClassKind = "new" | "override";

export interface ConfigClassEntry {
  id: string;
  displayName: string;
  /** New class symbol, e.g. `SuperBear`. Must match C++ identifier
   *  rules — starts with a letter, no spaces. */
  classname: string;
  /** Parent class this extends (`Animal_UrsusArctos`, etc.). Required
   *  when `kind === "new"`; ignored when `kind === "override"`. */
  parent: string;
  /** Config container block: `CfgVehicles`, `CfgWeapons`, `CfgAmmo`,
   *  `CfgMagazines`. Defaults to `CfgVehicles`. */
  container: string;
  /** Whether the entry introduces a new class (derived from a
   *  parent) or overrides an existing one. Absent in pre-kind
   *  registry data; the backend back-fills by inferring from
   *  `parent` on load, so treat `null | undefined` as "legacy". */
  kind?: ConfigClassKind | null;
  /** Raw body that sits between the class braces. Operator is
   *  expected to know the syntax — no sanitisation or validation
   *  beyond a basic classname check. */
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReskinBuildResult {
  modPath: string;
  pboPath: string;
  addonName: string;
  classesWritten: string[];
  texturesConverted: number;
  signed: boolean;
  durationMs: number;
  typesXmlPath: string;
  externalPbosCopied: number;
  configClassesWritten: number;
  notes: string[];
  log: string[];
}

// ---------- Expansion CE install ----------

export interface ExpansionCeStatus {
  upstreamTemplate: string;
  upstreamBase: string;
  typesFileExists: boolean;
  spawnableTypesFileExists: boolean;
  eventsFileExists: boolean;
  registeredInCfg: boolean;
  eventspawnsSentinelPresent: boolean;
  fullyInstalled: boolean;
}

export interface ExpansionCeInstallReport {
  upstreamTemplate: string;
  wroteTypes: boolean;
  wroteSpawnableTypes: boolean;
  wroteEvents: boolean;
  registeredInCfg: boolean;
  eventspawnsAdded: string[];
  eventspawnsSkipped: string[];
  /** Set when the install had to rewrite cfgeventspawns.xml to
   *  repair upstream's trailing-whitespace attribute bug even when
   *  no new events were appended. Surface this so operators know
   *  a prior broken install was fixed. */
  eventspawnsFileRepaired: boolean;
  typesBytes: number;
  spawnableTypesBytes: number;
  eventsBytes: number;
}

// ---------- Generic ----------

export interface AppError {
  kind: string;
  message: string;
  detail?: string | null;
}
