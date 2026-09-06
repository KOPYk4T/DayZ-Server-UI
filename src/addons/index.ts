/**
 * Addon barrel — imported once from `App.tsx` so every addon file's
 * `registerAddon(...)` side effect runs before the app shell mounts.
 *
 * Add new addons here (order here is the order they appear in
 * Settings and the sidebar).
 */

import { applyDefaultAddons } from "@/stores/addonsStore";

import "./mods.addon";
import "./reskin.addon";

import { getAllAddons } from "./registry";

applyDefaultAddons(getAllAddons().map((a) => a.id));

export { getAllAddons, useEnabledAddons, registerAddon } from "./registry";
export type { Addon, AddonRoute } from "./types";
