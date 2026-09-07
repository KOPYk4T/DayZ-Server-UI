import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronRight,
  Download,
  FileCode,
  Hammer,
  Link as LinkIcon,
  Map as MapIcon,
  Package,
  Palette,
  PawPrint,
  Search,
  Target,
  Upload,
} from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Difficulty = "beginner" | "intermediate" | "advanced";

interface TutorialStep {
  text: React.ReactNode;
  /** Optional button that navigates to a page in the app. */
  goto?: { path: string; label: string };
}

interface Tutorial {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  summary: string;
  duration: string;
  difficulty: Difficulty;
  /** Prerequisites the operator needs satisfied before the steps
   *  work — e.g. "Mikero Tools + P: drive", "active profile". */
  requires?: string;
  /** Tags used by the search filter — think synonyms. "item" matches
   *  the item tutorial, "purple bear" finds the SuperBear one. */
  tags: string[];
  steps: TutorialStep[];
  /** Optional "next: try this" pointer that links to another
   *  tutorial by id. Displayed below the step list. */
  next?: { id: string; label: string };
}

const TUTORIALS: Tutorial[] = [
  {
    id: "sync-local-push",
    icon: Upload,
    title: "Edit, test local, push remote",
    summary:
      "Workspace is the cache. Sync to local copies a reviewed diff to your dedicated server. Push uploads that diff to SFTP.",
    duration: "4 min",
    difficulty: "beginner",
    requires: "A profile with Local server set. SFTP optional for Push.",
    tags: ["sync", "push", "local", "workspace", "sftp"],
    steps: [
      {
        text: "Set Remote (SFTP) and Local server (your DayZ dedicated folder) on the profile.",
        goto: { path: "/profiles", label: "Profiles" },
      },
      {
        text: "Open Sync. The first visit imports the workspace from Local server if it is empty.",
        goto: { path: "/app/sync", label: "Open Sync" },
      },
      {
        text: "Edit types or other mission files in the app. Those writes stay in the workspace.",
      },
      {
        text: "Sync to local — review the file list (and diffs), then confirm. Restart the dedicated server to test.",
      },
      {
        text: "Push to Remote when you are happy. Same review. FileZilla is not required for those files.",
      },
    ],
  },
  {
    id: "adjust-item",
    icon: Boxes,
    title: "Adjust an item's loot settings",
    summary:
      "Change how often a vanilla item spawns, how long it lingers, what usage zones it appears in.",
    duration: "~2 min",
    difficulty: "beginner",
    requires: "active profile · mission pulled",
    tags: ["item", "types", "nominal", "lifetime", "loot"],
    steps: [
      {
        text: "Open the Items page from the sidebar.",
        goto: { path: "/app/items", label: "Types" },
      },
      {
        text: (
          <>
            Search for the classname (e.g. <code>AKM</code>) in the top
            filter bar.
          </>
        ),
      },
      {
        text: "Click the row to open the detail drawer on the right.",
      },
      {
        text: (
          <>
            Tune the fields you care about — <code>nominal</code> (how
            many the server maintains),{" "}
            <code>min</code> (never below this count),{" "}
            <code>lifetime</code> (seconds before CE despawns a
            stockpiled one), usage zones, value tiers.
          </>
        ),
      },
      {
        text: (
          <>
            Press <strong>Save</strong>. Vanilla items get an override
            row written to <code>custom/types_custom.xml</code>; your
            original file is untouched. Mod items save back to their
            own mod file.
          </>
        ),
      },
      {
        text: "Open Sync and Push to Remote when you're ready to ship changes.",
        goto: { path: "/app/sync", label: "Open Sync" },
      },
    ],
    next: { id: "custom-item-variant", label: "Create a custom item variant" },
  },

  {
    id: "custom-item-variant",
    icon: FileCode,
    title: "Create a custom item override for a classname",
    summary:
      "Force a specific classname into your custom types with your own spawn settings (even if it's not already in types.xml).",
    duration: "~3 min",
    difficulty: "beginner",
    requires: "active profile · mission pulled · classname exists in configs",
    tags: ["custom", "types", "override", "types_custom.xml"],
    steps: [
      {
        text: "Open the Items page.",
        goto: { path: "/app/items", label: "Types" },
      },
      {
        text: (
          <>
            Hit the <strong>New item</strong> button in the header. A
            blank drawer opens with the classname field editable.
          </>
        ),
      },
      {
        text: (
          <>
            Type the classname (e.g. <code>SuperBear</code>,{" "}
            <code>NVGoggles</code>), set your nominal/min/lifetime, pick
            category and usage zones.
          </>
        ),
      },
      {
        text: (
          <>
            Save — lands in <code>custom/types_custom.xml</code> and
            registers in <code>cfgeconomycore.xml</code> so CE loads
            it.
          </>
        ),
      },
    ],
    next: { id: "new-event", label: "Add an event that spawns it" },
  },

  {
    id: "new-event",
    icon: Target,
    title: "Add a new dynamic event + spawn points",
    summary:
      "Register a custom event (e.g. a heli crash, a special animal spawn) and place its positions on the map.",
    duration: "~5 min",
    difficulty: "intermediate",
    requires:
      "active profile · mission pulled · event children already in types.xml (vanilla or custom)",
    tags: ["event", "events.xml", "cfgeventspawns", "spawn", "position"],
    steps: [
      {
        text: "Open the Events page.",
        goto: { path: "/app/events", label: "Events" },
      },
      {
        text: (
          <>
            Click the <strong>＋ New event</strong> button in the
            header. The drawer opens in create mode.
          </>
        ),
      },
      {
        text: (
          <>
            Fill in the event name (e.g.{" "}
            <code>StaticSuperBear</code>). Tune{" "}
            <code>nominal</code>/<code>min</code>/<code>max</code> —
            those control how many can be alive at once.{" "}
            <code>lifetime</code> is how long the spawned entity sticks
            around before CE despawns it.
          </>
        ),
      },
      {
        text: (
          <>
            Switch to the <strong>Children</strong> tab — add one or
            more <code>&lt;child&gt;</code> entries. The classname
            picker lists every class in your types.xml, so your custom
            ones appear there too.
          </>
        ),
      },
      {
        text: (
          <>
            Switch to <strong>Positions</strong>. You can enter
            coordinates manually, or drop them visually from the Map
            page → Event Positions panel once the event is saved.
          </>
        ),
      },
      {
        text: (
          <>
            Press <strong>Create</strong>. Writes to{" "}
            <code>custom/events_custom.xml</code> and{" "}
            <code>cfgeventspawns.xml</code> if you added positions.
          </>
        ),
      },
      {
        text: "Switch to the Map editor, enable the Event Positions layer, and verify the spawn points look right.",
        goto: { path: "/app/map", label: "Map editor" },
      },
    ],
  },

  {
    id: "custom-animal",
    icon: PawPrint,
    title: "Create a custom animal variant (Super Bear, Dire Wolf, etc.)",
    summary:
      "Subclass a vanilla animal with custom stats (HP, scale, speed), register it in types.xml, and spawn it via events. No modding required.",
    duration: "~10 min",
    difficulty: "intermediate",
    requires: "active profile · mission pulled",
    tags: [
      "animal",
      "bear",
      "super",
      "giant",
      "wolf",
      "config class",
      "modpack",
      "purple",
    ],
    steps: [
      {
        text: "Open Server Modpack → Config Classes.",
        goto: { path: "/app/reskin/config", label: "Config Classes" },
      },
      {
        text: (
          <>
            Click <strong>New class</strong>. From the quick-start
            templates pick <em>Animal: Giant purple bear</em> or{" "}
            <em>Animal: Stronger bear</em> as a starting body.
          </>
        ),
      },
      {
        text: (
          <>
            Classname <code>SuperBear</code>, parent{" "}
            <code>Animal_UrsusArctos</code>, container{" "}
            <code>CfgVehicles</code>. Tune the body — <code>scale</code>{" "}
            for size, <code>hitpoints</code> under{" "}
            <code>DamageSystem</code> for HP,{" "}
            <code>hiddenSelectionsTextures[]</code> with a procedural
            colour for recolouring (comment in the template shows the
            syntax).
          </>
        ),
      },
      {
        text: (
          <>
            Press <strong>Create class</strong>. Saves the config
            class AND auto-registers a{" "}
            <code>&lt;type&gt;</code> entry in the mission's{" "}
            <code>custom/types_custom.xml</code>, shaped like vanilla's
            <code>Animal_UrsusArctos</code> row (
            <code>nominal=0, min=0, lifetime=1800, count_in_map=1</code>
            ) so CE reads it consistently with the surrounding vanilla
            animals. This makes SuperBear addressable from Events /
            Loadouts / cfgeventspawns. The class is NOT loot-spawnable
            on its own with these defaults — that's intentional.
          </>
        ),
      },
      {
        text: (
          <>
            Register the AI behaviour via{" "}
            <strong>Map editor → Territories panel → ＋ Add custom
            animal</strong>. Slug <code>super_bear</code>, display name{" "}
            <code>Super Bear</code>, type <code>Herd</code>, behaviour{" "}
            <code>BlishBearGroupBeh</code>. Under Agents add one: type{" "}
            <code>Male</code>, spawn configName{" "}
            <code>SuperBear</code>. Under Territory parameters:{" "}
            <code>globalCountMax=5</code>,{" "}
            <code>zoneCountMin=1</code>, <code>zoneCountMax=2</code>.
            Create.
          </>
        ),
        goto: { path: "/app/map", label: "Map editor" },
      },
      {
        text: "A starter zone lands at map centre already selected. Drag its centre marker to where you want the spawn area; drag the edge marker to resize. Click the + next to the Super Bear row in the Territories panel to add more zones. This is what hooks the bear AI (BlishBearGroupBeh) to your custom class — without the Territory binding, even a spawned SuperBear will just stand in idle.",
      },
      {
        text: (
          <>
            (Optional) If you want a one-off world spawn — e.g. a boss
            encounter at a fixed location — add a dynamic event on
            the Events page with a <code>&lt;child&gt;</code> pointing
            at <code>SuperBear</code>. The Territory system handles
            normal patrols; dynamic events handle scripted encounters.
            Both coexist cleanly.
          </>
        ),
        goto: { path: "/app/events", label: "Events" },
      },
      {
        text: "Modpack → Overview & build → Build mod. Copies the config.cpp + signed PBO into the modpack folder, ready to ship.",
        goto: { path: "/app/reskin/library", label: "Modpack Overview" },
      },
      {
        text: "Open Sync and Push to Remote.",
        goto: { path: "/app/sync", label: "Open Sync" },
      },
    ],
    next: {
      id: "territory-ai",
      label: "Wire custom animal/infected AI via Territories",
    },
  },

  {
    id: "territory-ai",
    icon: PawPrint,
    title: "Wire a custom animal/infected to AI via Territories",
    summary:
      "Why your SuperBear spawns idle, and the one step that fixes it — register the class in cfgenvironment so DayZ attaches its scripted AI (patrol, aggro, flocking).",
    duration: "~5 min",
    difficulty: "intermediate",
    requires: "the custom class exists as a Config Class · active profile",
    tags: [
      "ai",
      "territory",
      "cfgenvironment",
      "passive",
      "idle",
      "aggro",
      "behavior",
      "group behavior",
    ],
    steps: [
      {
        text: (
          <>
            <strong>The problem:</strong> DayZ has two separate spawn
            systems. <em>Dynamic events</em> (events.xml +
            cfgeventspawns.xml) spawn entities at positions but don't
            attach AI. <em>Territories</em> (cfgenvironment.xml +
            env/*_territories.xml) wire entities to a{" "}
            <code>GroupBehavior</code> script class that drives
            scripted AI (patrol, aggro, flocking). Vanilla bears /
            wolves / infected come pre-registered in cfgenvironment,
            which is why they work out of the box. Your custom class
            isn't — so the agent manager has nothing to hook into.
          </>
        ),
      },
      {
        text: "Open the Map editor and expand the Territories panel in the left sidebar.",
        goto: { path: "/app/map", label: "Map editor" },
      },
      {
        text: (
          <>
            Click <strong>＋ Add custom animal</strong> at the bottom
            of the Territories list.
          </>
        ),
      },
      {
        text: (
          <>
            Fill in the dialog:
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>
                <strong>Slug</strong>: <code>super_bear</code> (becomes
                the filename{" "}
                <code>env/super_bear_territories.xml</code>)
              </li>
              <li>
                <strong>Display name</strong>: <code>Super Bear</code>
              </li>
              <li>
                <strong>Type</strong>: <code>Herd</code> for fauna,{" "}
                <code>Ambient</code> for the hen/hare/fox scatter
                family
              </li>
              <li>
                <strong>Behaviour class</strong>: the scripted AI
                driver. Use the vanilla one for the closest matching
                kind — <code>BlishBearGroupBeh</code> for
                bear-likes, <code>DZWolfGroupBeh</code> for wolf
                packs, <code>DZDeerGroupBeh</code> for herd
                animals, <code>DZdomesticGroupBeh</code> for infected.
              </li>
            </ul>
          </>
        ),
      },
      {
        text: (
          <>
            Under <strong>Agents</strong>, add one entry. Type{" "}
            <code>Male</code>, spawn configName =
            <strong> your custom class</strong> (e.g.{" "}
            <code>SuperBear</code>). This is the step that tells the
            agent manager <em>"when this territory activates, spawn
            this class with the AI behaviour above"</em>.
          </>
        ),
      },
      {
        text: (
          <>
            Under <strong>Territory parameters</strong>, add{" "}
            <code>globalCountMax</code> (hard cap on alive entities),{" "}
            <code>zoneCountMin</code> / <code>zoneCountMax</code>{" "}
            (how many spawn per zone),{" "}
            <code>playerSpawnRadiusNear</code> /{" "}
            <code>playerSpawnRadiusFar</code> (distance band from
            players where territory activates). Reasonable starters:
            globalCountMax=5, zoneCountMin=1, zoneCountMax=2,
            radiusNear=100, radiusFar=400.
          </>
        ),
      },
      {
        text: (
          <>
            Press <strong>Create animal</strong>. Writes{" "}
            <code>env/super_bear_territories.xml</code> (empty
            zones, you draw them next) and appends the binding to{" "}
            <code>cfgenvironment.xml</code> in one git commit.
          </>
        ),
      },
      {
        text: "Enable the Territories layer on the map (sidebar or keyboard 4). Click the ＋ icon next to your new category to drop a starter zone, then drag its centre / edge handles to position + resize. Add as many zones as you want — each is an independent spawn area.",
      },
      {
        text: "Save in the header, then Sync to local to test, and Push to Remote when ready. Once the server reloads the mission, your SuperBear will spawn from the territory system with working AI — patrol behaviour, sight-based aggro, proper target pursuit.",
        goto: { path: "/app/sync", label: "Open Sync" },
      },
      {
        text: (
          <>
            <strong>Keep the dynamic event too</strong>, or drop it —
            both systems run in parallel. Territory spawns are the
            ones that'll behave like real bears; event-spawned ones
            stay idle unless you also register them in the territory
            binding.
          </>
        ),
      },
    ],
    next: { id: "build-modpack", label: "Build & deploy the Server Modpack" },
  },

  {
    id: "reskin",
    icon: Palette,
    title: "Reskin a vanilla item with a custom texture",
    summary:
      "Clone an existing item (weapon, clothing, vehicle with camo slots) and give it a new name + your own .paa textures.",
    duration: "~10–20 min",
    difficulty: "advanced",
    requires:
      "Mikero Tools in `tools/` · P: drive mounted with unpacked DayZ data · source image (.paa, .png, or .tga)",
    tags: [
      "reskin",
      "paa",
      "texture",
      "clone",
      "camo",
      "weapon",
      "clothing",
      "modpack",
    ],
    steps: [
      {
        text: "Server Modpack → Setup — verify the environment is green (tools found + P: drive mounted).",
        goto: { path: "/app/reskin", label: "Modpack Setup" },
      },
      {
        text: "Server Modpack → Vanilla classes. Browse or search for the class you want to reskin. Look for the palette badge — only reskinnable classes have texture slots.",
        goto: { path: "/app/reskin/classes", label: "Vanilla classes" },
      },
      {
        text: "Server Modpack → New reskin. Pick the source class. Give the clone a new name (e.g. AKM_Desert).",
        goto: { path: "/app/reskin/wizard", label: "New reskin" },
      },
      {
        text: (
          <>
            Step 3 — pick <em>Coexist</em> (both source and reskin
            spawn) or <em>Replace</em> (the source gets added to the CE
            ignore list, so only your variant spawns).
          </>
        ),
      },
      {
        text: "Step 4 — per slot, supply an image file (PNG / TGA / PAA) or pick a procedural colour. Slots you leave blank fall back to the vanilla texture.",
      },
      {
        text: (
          <>
            Save. Your reskin lives in{" "}
            <code>Server Modpack → Overview & build</code> as a
            library entry, ready to pack.
          </>
        ),
      },
      {
        text: (
          <>
            Overview & build → <strong>Build mod</strong>. The app
            generates <code>config.cpp</code>, converts your source
            images to PAA, packs + signs the PBO, emits a{" "}
            <code>types.xml</code> stub.
          </>
        ),
        goto: { path: "/app/reskin/library", label: "Modpack Overview" },
      },
      {
        text: "Items page → Import mod files — point at the generated types.xml so the CE knows about your reskinned class.",
        goto: { path: "/app/items", label: "Types" },
      },
      {
        text: "Copy the built @ModName folder onto your server alongside other mods. Load with -mod= in the startup line.",
      },
    ],
  },

  {
    id: "external-pbo",
    icon: Package,
    title: "Add an external .pbo to your Server Modpack",
    summary:
      "Ship a third-party content PBO alongside your own reskins / config classes in a single mod folder.",
    duration: "~3 min",
    difficulty: "beginner",
    requires: "the .pbo file on disk · optionally its .bisign / .bikey siblings",
    tags: ["pbo", "external", "mod", "modpack", "bikey"],
    steps: [
      {
        text: "Server Modpack → External PBOs.",
        goto: { path: "/app/reskin/pbos", label: "External PBOs" },
      },
      {
        text: "Click Add PBO — pick one or more .pbo files from the file picker.",
      },
      {
        text: (
          <>
            (Optional) Tick/untick the Include checkbox to
            temporarily exclude a PBO from the next build without
            removing it from the modpack.
          </>
        ),
      },
      {
        text: (
          <>
            When you Build the modpack, each included PBO is copied
            into <code>addons/</code>. Sibling <code>.pbo.bisign</code>{" "}
            and <code>.bikey</code> files next to the source are
            carried along automatically — so a{" "}
            <code>@SomeMod/addons/x.pbo</code> + matching keys round-
            trip cleanly.
          </>
        ),
      },
    ],
    next: { id: "build-modpack", label: "Build & deploy" },
  },

  {
    id: "import-mod-ce",
    icon: Download,
    title: "Import a mod's CE files (types.xml / events.xml)",
    summary:
      "Register a mod's loot + event definitions in your mission without pasting them into vanilla files.",
    duration: "~3 min",
    difficulty: "beginner",
    requires: "active profile · folder containing the mod's CE XML files",
    tags: ["import", "ce", "mod", "types", "events", "cfgeconomycore"],
    steps: [
      {
        text: "Items page → Import mod files (top-right action).",
        goto: { path: "/app/items", label: "Types" },
      },
      {
        text: "Pick the source folder. The scanner detects types / events / spawnabletypes / randompresets / eventposdef by filename + content — fragment files without a <types> root are auto-wrapped.",
      },
      {
        text: "Review the preview — each file shows the detected kind + record count. Untick anything you don't want to import.",
      },
      {
        text: "Set the destination folder name (e.g. helis_ce). Press Import.",
      },
      {
        text: (
          <>
            Each file is copied into{" "}
            <code>&lt;mission&gt;/&lt;destFolder&gt;/</code> and a{" "}
            <code>&lt;ce folder&gt;</code> block is added to{" "}
            <code>cfgeconomycore.xml</code> — CE loads it next mission
            load.
          </>
        ),
      },
      {
        text: "If the import result shows 0 files imported, check the per-file log at the bottom of the dialog for the actual skip reason.",
      },
    ],
  },

  {
    id: "pull-edit-push",
    icon: Upload,
    title: "Edit → Sync to local → Push",
    summary:
      "You always edit the workspace cache. Sync to local copies a reviewed diff to the dedicated folder. Push uploads that diff to SFTP.",
    duration: "~3 min",
    difficulty: "beginner",
    requires: "A profile with Local server set. SFTP optional for Push.",
    tags: ["pull", "push", "sync", "deploy", "workflow", "local"],
    steps: [
      {
        text: "Make sure you have a profile selected (top of sidebar).",
      },
      {
        text: "Open Sync. First visit imports the workspace from Local server if it is empty.",
        goto: { path: "/app/sync", label: "Open Sync" },
      },
      {
        text: "Do whatever editing you need — Items, Events, Map, Modpack — all changes land in the workspace.",
      },
      {
        text: "Sync to local. Review Write / Adopt / Conflict, then confirm. Restart the dedicated server to test.",
        goto: { path: "/app/sync", label: "Open Sync" },
      },
      {
        text: "Push to Remote when you are happy. Same review. A pre-push backup is saved under History & Backups for local writes.",
      },
    ],
  },

  {
    id: "build-modpack",
    icon: Hammer,
    title: "Build & deploy the Server Modpack",
    summary:
      "Turn your reskins + config classes + external PBOs into a single signed mod folder ready to load.",
    duration: "~5 min",
    difficulty: "intermediate",
    requires:
      "Mikero Tools in `tools/` · at least one of: reskin / config class / external PBO",
    tags: ["build", "modpack", "pbo", "sign", "deploy"],
    steps: [
      {
        text: "Server Modpack → Overview & build. Verify the mod folder name (e.g. @MyServerPack) — this becomes the addons/ prefix.",
        goto: { path: "/app/reskin/library", label: "Overview & build" },
      },
      {
        text: "Check the summary card — reskins, config classes, external PBOs included. Any one of the three is enough to build.",
      },
      {
        text: (
          <>
            Click <strong>Build mod</strong>. The pipeline:
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Stages the mod folder under the app data dir</li>
              <li>Converts source images to PAA for reskin slots</li>
              <li>
                Generates <code>config.cpp</code> (CfgPatches + reskin
                classes + config classes, grouped by container)
              </li>
              <li>Packs the addon with MakePbo (mirrors to P: drive for texture validation)</li>
              <li>
                Signs with the first <code>.biprivatekey</code> next
                to DSSignFile (DayZ Tools or Setup → Locate)
              </li>
              <li>
                Copies external PBOs into <code>addons/</code> with
                their <code>.bisign</code> / <code>.bikey</code>{" "}
                siblings
              </li>
              <li>
                Emits a <code>types.xml</code> for the reskin classes
              </li>
            </ul>
          </>
        ),
      },
      {
        text: "Result card shows the mod path + every step of the log. Click Open mod folder to inspect on disk.",
      },
      {
        text: "Copy the @ModName folder onto your server. Add to -mod= in the startup line. Drop the .bikey into the server's keys/ if your server runs verifySignatures=2.",
      },
    ],
  },

  {
    id: "map-calibrate",
    icon: MapIcon,
    title: "Calibrate the map backdrop image",
    summary:
      "Align your iZurvive / topo render backdrop to the actual playfield so clicks translate to correct world coordinates.",
    duration: "~4 min",
    difficulty: "beginner",
    requires: "active profile · a backdrop image (PNG / JPG) on disk",
    tags: ["map", "calibrate", "backdrop", "izurvive", "alignment"],
    steps: [
      {
        text: "Open the Map editor.",
        goto: { path: "/app/map", label: "Map editor" },
      },
      {
        text: (
          <>
            In the Map Settings panel (left sidebar), click{" "}
            <strong>Pick image</strong> — point at your PNG/JPG.
            Alternatively click <strong>Download from iZurvive</strong>{" "}
            to fetch one directly.
          </>
        ),
      },
      {
        text: "Expand Alignment → Start 2-point calibration.",
      },
      {
        text: "Click a landmark on the backdrop. Type its real DayZ coordinates — or click the 'pick from map' shortcut and select a known building (mapgrouppos.xml must be loaded).",
      },
      {
        text: "Repeat for a second landmark on the opposite side of the map.",
      },
      {
        text: "Apply — the app solves the alignment transform and sets offsetX / offsetY / scale. Every subsequent click on the backdrop gives you correct world coordinates.",
      },
    ],
  },
];

export function TutorialsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TUTORIALS;
    return TUTORIALS.filter((t) => {
      if (t.title.toLowerCase().includes(q)) return true;
      if (t.summary.toLowerCase().includes(q)) return true;
      if (t.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [query]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openAll = () => setExpanded(new Set(TUTORIALS.map((t) => t.id)));
  const collapseAll = () => setExpanded(new Set());

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={BookOpen}
        title="Tutorials"
        description="Hands-on walkthroughs for the workflows the app supports. Each one links straight to the page where you'd perform the step. Follow them top-to-bottom or jump to the one you need."
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={openAll}>
              Expand all
            </Button>
            <Button size="sm" variant="ghost" onClick={collapseAll}>
              Collapse all
            </Button>
          </>
        }
      />

      <div className="border-b border-border/60 bg-card/30 px-6 py-2">
        <div className="relative max-w-md">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="search tutorials — try 'purple bear', 'reskin', 'push'…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 pl-7"
          />
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {filtered.length} of {TUTORIALS.length} shown
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-3 p-6">
          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              No tutorials match "{query}". Try a broader term.
            </div>
          ) : (
            filtered.map((t) => (
              <TutorialCard
                key={t.id}
                tutorial={t}
                expanded={expanded.has(t.id)}
                onToggle={() => toggle(t.id)}
                onNavigate={(path) => navigate(path)}
                onJumpTo={(id) => {
                  setExpanded(new Set([id]));
                  // Scroll the target card into view.
                  requestAnimationFrame(() => {
                    document
                      .getElementById(`tutorial-${id}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  });
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TutorialCard({
  tutorial,
  expanded,
  onToggle,
  onNavigate,
  onJumpTo,
}: {
  tutorial: Tutorial;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (path: string) => void;
  onJumpTo: (id: string) => void;
}) {
  const Icon = tutorial.icon;
  return (
    <section
      id={`tutorial-${tutorial.id}`}
      className="rounded-md border border-border/60 bg-card/30"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-section">{tutorial.title}</span>
            <DifficultyBadge level={tutorial.difficulty} />
            <Badge variant="outline" className="text-[10px]">
              {tutorial.duration}
            </Badge>
          </div>
          <p className="type-hint mt-1">{tutorial.summary}</p>
        </div>
      </button>
      {expanded ? (
        <div className="space-y-4 border-t border-border/60 px-4 py-4">
          {tutorial.requires ? (
            <p className="rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
              <strong className="text-foreground">Requires:</strong>{" "}
              {tutorial.requires}
            </p>
          ) : null}
          <ol className="space-y-3">
            {tutorial.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 font-mono text-[11px] text-muted-foreground">
                  {i + 1}
                </span>
                <div className="flex-1 space-y-1.5 pt-0.5 text-sm">
                  <div>{step.text}</div>
                  {step.goto ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => onNavigate(step.goto!.path)}
                    >
                      <LinkIcon className="mr-1.5 h-3 w-3" />
                      Go to {step.goto.label}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {tutorial.next ? (
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px]">
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="type-hint">Next, try:</span>
              <button
                className="type-section underline-offset-2 hover:underline"
                onClick={() => onJumpTo(tutorial.next!.id)}
              >
                {tutorial.next.label}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DifficultyBadge({ level }: { level: Difficulty }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px]",
        level === "beginner" && "border-severity-success/40 text-severity-success",
        level === "intermediate" && "border-severity-warning/40 text-severity-warning",
        level === "advanced" && "border-severity-error/40 text-severity-error",
      )}
    >
      {level}
    </Badge>
  );
}

