/**
 * Catalog of NPC prefab class names Expansion ships, scraped from
 * `[Server-Hosting]-Setting-up-Trader-Entities-and-NPCs.md` in the
 * wiki. Used by the trader-placement editor to power a typeable
 * dropdown — custom / mod-added prefabs can still be typed directly.
 *
 * The AI variants are identical human models wrapped in the eAI base
 * so bandits / guards can attack / be attacked during raids; static
 * ones are purely cosmetic shopkeepers.
 */

/** Static (non-AI) shopkeeper NPCs and a couple of decorative props
 *  (pumpkin, zucchini, lockers) that the mod also ships as trader
 *  targets so operators can use them as static 'drop box' traders. */
export const STATIC_TRADER_CLASSES: string[] = [
  // Props / static fixtures usable as trader entities.
  "ExpansionTraderPumpkin",
  "ExpansionTraderZucchini",
  "ExpansionTraderLockerClosedBlueV1",
  "ExpansionTraderLockerClosedBlueV2",
  "ExpansionTraderLockerClosedBlueV3",
  "ExpansionTraderLockerClosedV1",
  "ExpansionTraderLockerClosedV2",
  "ExpansionTraderLockerClosedV3",
  // Human shopkeepers.
  "ExpansionTraderMirek",
  "ExpansionTraderDenis",
  "ExpansionTraderBoris",
  "ExpansionTraderBaty",
  "ExpansionTraderCyril",
  "ExpansionTraderElias",
  "ExpansionTraderEva",
  "ExpansionTraderFrancis",
  "ExpansionTraderGuo",
  "ExpansionTraderHassan",
  "ExpansionTraderIndar",
  "ExpansionTraderJose",
  "ExpansionTraderKaito",
  "ExpansionTraderKeiko",
  "ExpansionTraderLewis",
  "ExpansionTraderManua",
  "ExpansionTraderNaomi",
  "ExpansionTraderNiki",
  "ExpansionTraderOliver",
  "ExpansionTraderPeter",
  "ExpansionTraderQuinn",
  "ExpansionTraderRolf",
  "ExpansionTraderSeth",
  "ExpansionTraderTaiki",
  "ExpansionTraderLinda",
  "ExpansionTraderMaria",
  "ExpansionTraderFrida",
  "ExpansionTraderGabi",
  "ExpansionTraderHelga",
  "ExpansionTraderIrena",
  "ExpansionTraderJudy",
];

/** AI-capable variants — bandits / guards can attack them and they
 *  reload animations / faction defence triggers if configured. */
export const AI_TRADER_CLASSES: string[] = [
  "ExpansionTraderAIBaty",
  "ExpansionTraderAIBoris",
  "ExpansionTraderAICyril",
  "ExpansionTraderAIDenis",
  "ExpansionTraderAIElias",
  "ExpansionTraderAIEva",
  "ExpansionTraderAIFrancis",
  "ExpansionTraderAIFrida",
  "ExpansionTraderAIGabi",
  "ExpansionTraderAIGuo",
  "ExpansionTraderAIHassan",
  "ExpansionTraderAIHelga",
  "ExpansionTraderAIIndar",
  "ExpansionTraderAIIrena",
  "ExpansionTraderAIJose",
  "ExpansionTraderAIJudy",
  "ExpansionTraderAIKaito",
  "ExpansionTraderAIKeiko",
  "ExpansionTraderAILewis",
  "ExpansionTraderAILinda",
  "ExpansionTraderAIManua",
  "ExpansionTraderAIMaria",
  "ExpansionTraderAIMirek",
  "ExpansionTraderAINaomi",
  "ExpansionTraderAINiki",
  "ExpansionTraderAIOliver",
  "ExpansionTraderAIPeter",
  "ExpansionTraderAIQuinn",
  "ExpansionTraderAIRolf",
  "ExpansionTraderAISeth",
  "ExpansionTraderAITaiki",
];

export const ALL_TRADER_ENTITY_CLASSES: string[] = [
  ...STATIC_TRADER_CLASSES,
  ...AI_TRADER_CLASSES,
];

export function isAiTraderClass(cls: string): boolean {
  return cls.includes("AI");
}
