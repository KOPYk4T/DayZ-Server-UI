import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  FileJson2,
  Gauge,
  Hammer,
  Loader2,
  Map as MapIcon,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  Sliders,
  Users,
  Waves,
} from "lucide-react";
import { toast } from "sonner";

import { InfoTooltip } from "@/components/InfoTooltip";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import * as tauri from "@/lib/tauri";
import { errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type {
  CfgGameplay,
  CfgGameplayBaseBuildingData,
  CfgGameplayGeneralData,
  CfgGameplayHitIndicationData,
  CfgGameplayMapData,
  CfgGameplayPlayerData,
  CfgGameplayStaminaData,
  CfgGameplayUIData,
  CfgGameplayVehicleData,
  CfgGameplayWorldsData,
} from "@/types/ipc";

/**
 * `cfggameplay.json` editor — mission-level gameplay tuning.
 *
 * The page presents every section we model as a tabbed typed form.
 * Sections have a "enabled" toggle that shows/hides their subfields
 * — unset fields are omitted from the saved JSON, which matches how
 * Bohemia's vanilla file looks (partial coverage). Fields we don't
 * know about pass through via the `[extra: string]: unknown` bag
 * on every shape, so mod-added knobs and future Bohemia additions
 * survive editing untouched.
 *
 * A raw-JSON tab lets operators drop down for the long tail.
 */
export function GameplayPage() {
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: profileId
      ? ["cfg-gameplay", profileId]
      : ["cfg-gameplay", "none"],
    queryFn: () => tauri.cfgGameplayGet(profileId!),
    enabled: !!profileId,
  });

  const update = useMutation({
    mutationFn: (data: CfgGameplay) => tauri.cfgGameplayUpdate(profileId!, data),
    onSuccess: (r) => {
      if (profileId) {
        qc.setQueryData(["cfg-gameplay", profileId], r);
      }
      toast.success("cfggameplay.json saved");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const createDefault = useMutation({
    mutationFn: () => tauri.cfgGameplayCreateDefault(profileId!),
    onSuccess: (r) => {
      if (profileId) {
        qc.setQueryData(["cfg-gameplay", profileId], r);
      }
      toast.success("cfggameplay.json created with defaults");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const [draft, setDraft] = useState<CfgGameplay | null>(null);
  useEffect(() => {
    if (query.data?.data) setDraft(query.data.data);
    else setDraft(null);
  }, [query.data?.data]);

  if (!active) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Pick a profile first.
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{errorMessage(query.error)}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const snapshot = query.data;
  if (!snapshot) return null;

  if (!snapshot.fileExists) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          icon={Sliders}
          title="Gameplay"
          description="Mission-level gameplay tuning (cfggameplay.json)."
          badges={
            <Badge
              variant="outline"
              className="border-severity-warning/40 text-severity-warning"
            >
              file not found
            </Badge>
          }
          path={snapshot.fileDisplay}
        />
        <div className="flex flex-col gap-4 p-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              No <code>cfggameplay.json</code> in the mission folder yet.
              Most vanilla missions ship one automatically; older or
              minimal mission templates don't.
            </AlertDescription>
          </Alert>
          <div className="flex gap-2">
            <Button
              onClick={() => createDefault.mutate()}
              disabled={createDefault.isPending}
            >
              {createDefault.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Create cfggameplay.json from defaults
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Will create <code>{snapshot.fileDisplay}</code> with Bohemia's
            default section layout so you can start editing.
          </p>
        </div>
      </div>
    );
  }

  if (!draft) return null;

  const dirty =
    snapshot.data != null &&
    JSON.stringify(draft) !== JSON.stringify(snapshot.data);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Sliders}
        title="Gameplay"
        description="Mission-level gameplay tuning. Unset fields are omitted from the saved JSON; Bohemia defaults apply at runtime."
        badges={
          dirty ? (
            <Badge
              variant="outline"
              className="border-severity-warning/40 text-severity-warning"
            >
              unsaved
            </Badge>
          ) : null
        }
        path={snapshot.fileDisplay}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => snapshot.data && setDraft(snapshot.data)}
              disabled={!dirty || update.isPending}
            >
              <RotateCcw className="mr-1 h-3 w-3" /> Revert
            </Button>
            <Button
              size="sm"
              onClick={() => update.mutate(draft)}
              disabled={!dirty || update.isPending}
            >
              {update.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Save className="mr-1 h-3 w-3" />
              )}
              Save
            </Button>
          </>
        }
      />

      <Tabs
        defaultValue="general"
        className="flex min-h-0 flex-1 flex-col px-6 pt-3"
      >
        <TabsList className="self-start">
          <TabsTrigger value="general">
            <SettingsIcon className="mr-1 h-3 w-3" /> General
          </TabsTrigger>
          <TabsTrigger value="player">
            <Users className="mr-1 h-3 w-3" /> Player
          </TabsTrigger>
          <TabsTrigger value="worlds">
            <Waves className="mr-1 h-3 w-3" /> Worlds
          </TabsTrigger>
          <TabsTrigger value="basebuilding">
            <Hammer className="mr-1 h-3 w-3" /> Base building
          </TabsTrigger>
          <TabsTrigger value="ui">
            <Gauge className="mr-1 h-3 w-3" /> UI
          </TabsTrigger>
          <TabsTrigger value="map">
            <MapIcon className="mr-1 h-3 w-3" /> Map
          </TabsTrigger>
          <TabsTrigger value="raw">
            <FileJson2 className="mr-1 h-3 w-3" /> Raw JSON
          </TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1 pt-3">
          <TabsContent value="general" className="space-y-3">
            <GeneralForm
              value={draft.GeneralData ?? null}
              onChange={(v) => setDraft({ ...draft, GeneralData: v })}
            />
            <VehicleForm
              value={draft.VehicleData ?? null}
              onChange={(v) => setDraft({ ...draft, VehicleData: v })}
            />
          </TabsContent>
          <TabsContent value="player" className="space-y-3">
            <PlayerForm
              value={draft.PlayerData ?? null}
              onChange={(v) => setDraft({ ...draft, PlayerData: v })}
            />
          </TabsContent>
          <TabsContent value="worlds" className="space-y-3">
            <WorldsForm
              value={draft.WorldsData ?? null}
              onChange={(v) => setDraft({ ...draft, WorldsData: v })}
            />
          </TabsContent>
          <TabsContent value="basebuilding" className="space-y-3">
            <BaseBuildingForm
              value={draft.BaseBuildingData ?? null}
              onChange={(v) => setDraft({ ...draft, BaseBuildingData: v })}
            />
          </TabsContent>
          <TabsContent value="ui" className="space-y-3">
            <UIForm
              value={draft.UIData ?? null}
              onChange={(v) => setDraft({ ...draft, UIData: v })}
            />
          </TabsContent>
          <TabsContent value="map" className="space-y-3">
            <MapForm
              value={draft.MapData ?? null}
              onChange={(v) => setDraft({ ...draft, MapData: v })}
            />
          </TabsContent>
          <TabsContent value="raw" className="space-y-2">
            <RawJsonTab draft={draft} setDraft={setDraft} />
          </TabsContent>
        </div>
      </Tabs>

      <p className="text-[10px] text-muted-foreground">
        <FileJson2 className="mr-0.5 inline h-2.5 w-2.5" />
        Fields not modelled by the form (mod-added or future Bohemia
        knobs) round-trip unchanged via the Raw JSON tab.{" "}
        <Link
          to="https://community.bistudio.com/wiki/DayZ:cfgGameplay.json"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 hover:underline"
        >
          Bohemia wiki reference
        </Link>
        .
      </p>
    </div>
  );
}

// ---------- Typed sub-forms ----------

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function BoolField({
  label,
  value,
  onChange,
  hint,
  tooltip,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (v: boolean | null) => void;
  hint?: string;
  tooltip?: React.ReactNode;
}) {
  const isSet = value !== null && value !== undefined;
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
      <Switch
        checked={value === true}
        onCheckedChange={(v) => onChange(v)}
        disabled={!isSet}
      />
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <Label className="text-[11px]">{label}</Label>
          {tooltip ? <InfoTooltip>{tooltip}</InfoTooltip> : null}
        </div>
        {hint ? (
          <p className="text-[10px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <button
        type="button"
        className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={() => onChange(isSet ? null : false)}
      >
        {isSet ? "unset" : "set"}
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
  hint,
  tooltip,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  step?: number;
  hint?: string;
  tooltip?: React.ReactNode;
}) {
  const isSet = value !== null && value !== undefined;
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <Label className="text-[11px]">{label}</Label>
          {tooltip ? <InfoTooltip>{tooltip}</InfoTooltip> : null}
        </div>
        {hint ? (
          <p className="text-[10px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <Input
        type="number"
        step={step ?? "any"}
        value={isSet ? value : ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") onChange(null);
          else {
            const n = Number(raw);
            if (Number.isFinite(n)) onChange(n);
          }
        }}
        className="h-7 w-28 text-right font-mono text-xs"
        placeholder="unset"
      />
    </div>
  );
}

function StringField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  tooltip,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  hint?: string;
  placeholder?: string;
  tooltip?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Label className="text-[11px]">{label}</Label>
        {tooltip ? <InfoTooltip>{tooltip}</InfoTooltip> : null}
      </div>
      {hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
      <Input
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : e.target.value)
        }
        className="h-7 font-mono text-xs"
        placeholder={placeholder}
      />
    </div>
  );
}

function NumberArrayField({
  label,
  value,
  expected,
  onChange,
  hint,
  tooltip,
}: {
  label: string;
  value: number[] | null | undefined;
  expected?: number;
  onChange: (v: number[] | null) => void;
  hint?: string;
  tooltip?: React.ReactNode;
}) {
  const [draft, setDraft] = useState<string>(value?.join(", ") ?? "");
  useEffect(() => {
    setDraft(value?.join(", ") ?? "");
  }, [value]);
  const current = value ?? [];
  const warn =
    expected != null && current.length !== 0 && current.length !== expected;
  return (
    <div className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-[11px]">{label}</Label>
        {tooltip ? <InfoTooltip>{tooltip}</InfoTooltip> : null}
      </div>
      {hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const parts = draft
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (parts.length === 0) {
            onChange(null);
            return;
          }
          const numbers = parts.map(Number);
          if (numbers.every((n) => Number.isFinite(n))) {
            onChange(numbers);
          }
        }}
        placeholder={
          expected != null
            ? `${expected} comma-separated numbers`
            : "comma-separated numbers"
        }
        className="h-7 font-mono text-xs"
      />
      {warn ? (
        <p className="text-[10px] text-severity-warning">
          expected {expected} values, got {current.length}
        </p>
      ) : null}
    </div>
  );
}

function StringListField({
  label,
  value,
  onChange,
  hint,
  tooltip,
}: {
  label: string;
  value: string[] | null | undefined;
  onChange: (v: string[] | null) => void;
  hint?: string;
  tooltip?: React.ReactNode;
}) {
  const [draft, setDraft] = useState(value?.join("\n") ?? "");
  useEffect(() => {
    setDraft(value?.join("\n") ?? "");
  }, [value]);
  return (
    <div className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-[11px]">{label}</Label>
        {tooltip ? <InfoTooltip>{tooltip}</InfoTooltip> : null}
      </div>
      {hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const list = draft
            .split(/\n+/)
            .map((s) => s.trim())
            .filter(Boolean);
          onChange(list.length === 0 ? null : list);
        }}
        className="h-24 font-mono text-[11px]"
        placeholder="one classname per line"
      />
    </div>
  );
}

// ---------- General + Vehicle ----------

function GeneralForm({
  value,
  onChange,
}: {
  value: CfgGameplayGeneralData | null;
  onChange: (v: CfgGameplayGeneralData | null) => void;
}) {
  const v = value ?? {};
  const patch = (p: Partial<CfgGameplayGeneralData>) =>
    onChange({ ...v, ...p });
  return (
    <SectionCard title="GeneralData" icon={<SettingsIcon className="h-4 w-4" />}>
      <BoolField
        label="Disable base damage"
        value={v.disableBaseDamage}
        onChange={(x) => patch({ disableBaseDamage: x })}
        hint="When on, bases don't take damage from any source."
        tooltip="Globally disables damage on base-building parts — walls, fences, watchtowers, gates. Useful for PvE or when tuning raid balance, but combined with disableContainerDamage it means nothing you build can be destroyed."
      />
      <BoolField
        label="Disable container damage"
        value={v.disableContainerDamage}
        onChange={(x) => patch({ disableContainerDamage: x })}
        hint="Tents / barrels / crates invulnerable."
        tooltip="Makes storage containers (tents, barrels, crates, sea chests) invulnerable. Often combined with disableBaseDamage on PvE servers. Doesn't affect container lifetime or persistence — containers still despawn on the normal schedule."
      />
      <BoolField
        label="Disable respawn dialog"
        value={v.disableRespawnDialog}
        onChange={(x) => patch({ disableRespawnDialog: x })}
        tooltip="When true, the Respawn button on the pause menu is hidden. Players who die still respawn normally; they just can't voluntarily suicide back to a fresh spawn mid-session."
      />
      <BoolField
        label="Disable respawn in unconsciousness"
        value={v.disableRespawnInUnconsciousness}
        onChange={(x) => patch({ disableRespawnInUnconsciousness: x })}
        tooltip="When true, an unconscious player can't respawn — they must either recover or be killed by another player / bleed-out. Forces the full unconscious-recovery loop instead of instant suicide as an escape."
      />
    </SectionCard>
  );
}

function VehicleForm({
  value,
  onChange,
}: {
  value: CfgGameplayVehicleData | null;
  onChange: (v: CfgGameplayVehicleData | null) => void;
}) {
  const v = value ?? {};
  return (
    <SectionCard title="VehicleData" icon={<Sliders className="h-4 w-4" />}>
      <NumberField
        label="Boat decay multiplier"
        value={v.boatDecayMultiplier}
        onChange={(x) => onChange({ ...v, boatDecayMultiplier: x })}
        step={0.1}
        tooltip="Multiplier on the damage-over-time boats take from being left in water / beached. 1.0 is vanilla; lower values extend boat lifetime, higher values make abandoned boats sink faster."
      />
    </SectionCard>
  );
}

// ---------- Player ----------

function PlayerForm({
  value,
  onChange,
}: {
  value: CfgGameplayPlayerData | null;
  onChange: (v: CfgGameplayPlayerData | null) => void;
}) {
  const v = value ?? {};
  const patch = (p: Partial<CfgGameplayPlayerData>) =>
    onChange({ ...v, ...p });
  return (
    <>
      <SectionCard title="PlayerData" icon={<Users className="h-4 w-4" />}>
        <BoolField
          label="Disable personal light"
          value={v.disablePersonalLight}
          onChange={(x) => patch({ disablePersonalLight: x })}
          hint="Turn off the flashlight players carry by default."
          tooltip="When on, DayZ's built-in 'personal light' (a faint point light around the player in dark areas) is suppressed. Common on hardcore / realism servers where night should actually be dark."
        />
      </SectionCard>

      <StaminaForm
        value={v.StaminaData ?? null}
        onChange={(x) => patch({ StaminaData: x })}
      />

      <SectionCard
        title="ShockHandlingData"
        icon={<Gauge className="h-4 w-4" />}
      >
        <ShockForm
          value={v.ShockHandlingData ?? null}
          onChange={(x) => patch({ ShockHandlingData: x })}
        />
      </SectionCard>

      <SectionCard title="MovementData" icon={<Gauge className="h-4 w-4" />}>
        <MovementForm
          value={v.MovementData ?? null}
          onChange={(x) => patch({ MovementData: x })}
        />
      </SectionCard>

      <SectionCard title="DrowningData" icon={<Waves className="h-4 w-4" />}>
        <DrowningForm
          value={v.DrowningData ?? null}
          onChange={(x) => patch({ DrowningData: x })}
        />
      </SectionCard>
    </>
  );
}

function StaminaForm({
  value,
  onChange,
}: {
  value: CfgGameplayStaminaData | null;
  onChange: (v: CfgGameplayStaminaData | null) => void;
}) {
  const v = value ?? {};
  const patch = (p: Partial<CfgGameplayStaminaData>) => onChange({ ...v, ...p });
  return (
    <SectionCard title="StaminaData" icon={<Gauge className="h-4 w-4" />}>
      <NumberField
        label="Stamina max"
        value={v.staminaMax}
        onChange={(x) => patch({ staminaMax: x })}
        hint="Total stamina pool. Vanilla: 100."
        tooltip="Maximum stamina a fresh character can hold, before weight penalties. Raising this gives players longer sprint windows; lowering makes traversal more punishing. Most PvP servers keep this at 100–150."
      />
      <NumberField
        label="Sprint modifier (standing)"
        value={v.sprintStaminaModifierErc}
        onChange={(x) => patch({ sprintStaminaModifierErc: x })}
        step={0.05}
        tooltip="Multiplier on stamina drained per second while sprinting upright. 1.0 is vanilla. Values above 1.0 drain faster (shorter sprints); below 1.0 drain slower."
      />
      <NumberField
        label="Sprint modifier (crouched)"
        value={v.sprintStaminaModifierCro}
        onChange={(x) => patch({ sprintStaminaModifierCro: x })}
        step={0.05}
        tooltip="Same as the standing modifier but applied to crouched sprint. Typically set higher than the standing value since crouched sprint is a tactical movement that should cost more."
      />
      <NumberField
        label="Weight limit threshold"
        value={v.staminaWeightLimitThreshold}
        onChange={(x) => patch({ staminaWeightLimitThreshold: x })}
        hint="Grams before carried weight starts eating into stamina."
        tooltip="Carried mass (in grams) below which there's no stamina penalty. Go over this and every kilogram past the threshold trims your stamina cap via 'Kg → stamina % penalty'. Vanilla ~6000g (6kg)."
      />
      <NumberField
        label="Kg → stamina % penalty"
        value={v.staminaKgToStaminaPercentPenalty}
        onChange={(x) => patch({ staminaKgToStaminaPercentPenalty: x })}
        step={0.05}
        tooltip="Percentage of stamina-max reduced per kilogram of load above the weight threshold. Higher values punish heavy loadouts more aggressively; the penalty compounds with the stamina-min cap."
      />
      <NumberField
        label="Stamina min cap"
        value={v.staminaMinCap}
        onChange={(x) => patch({ staminaMinCap: x })}
        tooltip="Floor the weight-penalty can reduce stamina-max to. Even a heavily overloaded player won't drop below this number, preventing '0 stamina' states where sprint is impossible regardless of loadout."
      />
      <NumberField
        label="Sprint swimming modifier"
        value={v.sprintSwimmingStaminaModifier}
        onChange={(x) => patch({ sprintSwimmingStaminaModifier: x })}
        step={0.05}
        tooltip="Drain multiplier while swimming at sprint speed. Swimming is intentionally exhausting in vanilla; reducing this makes long-distance swims viable."
      />
      <NumberField
        label="Sprint ladder modifier"
        value={v.sprintLadderStaminaModifier}
        onChange={(x) => patch({ sprintLadderStaminaModifier: x })}
        step={0.05}
        tooltip="Drain multiplier while climbing a ladder fast. Rarely tuned."
      />
      <NumberField
        label="Melee modifier"
        value={v.meleeStaminaModifier}
        onChange={(x) => patch({ meleeStaminaModifier: x })}
        step={0.05}
        tooltip="Stamina cost per melee swing. Increase to make brawls more exhausting, decrease for faster combat."
      />
      <NumberField
        label="Obstacle traversal modifier"
        value={v.obstacleTraversalStaminaModifier}
        onChange={(x) => patch({ obstacleTraversalStaminaModifier: x })}
        step={0.05}
        tooltip="Cost of vaulting / climbing low obstacles. Bump this on servers where parkour traversal of walls makes base-building feel too porous."
      />
      <NumberField
        label="Hold breath modifier"
        value={v.holdBreathStaminaModifier}
        onChange={(x) => patch({ holdBreathStaminaModifier: x })}
        step={0.05}
        tooltip="Drain multiplier while holding breath to steady aim. Lower = longer sniper-scope hold windows."
      />
    </SectionCard>
  );
}

function ShockForm({
  value,
  onChange,
}: {
  value: NonNullable<CfgGameplayPlayerData["ShockHandlingData"]> | null;
  onChange: (v: NonNullable<CfgGameplayPlayerData["ShockHandlingData"]> | null) => void;
}) {
  const v = value ?? {};
  const patch = (p: Partial<NonNullable<CfgGameplayPlayerData["ShockHandlingData"]>>) =>
    onChange({ ...v, ...p });
  return (
    <>
      <NumberField
        label="Refill speed (conscious)"
        value={v.shockRefillSpeedConscious}
        onChange={(x) => patch({ shockRefillSpeedConscious: x })}
        tooltip="Rate at which the shock bar refills per second while the player is conscious. Higher = recover from concussions / impact shock faster."
      />
      <NumberField
        label="Refill speed (unconscious)"
        value={v.shockRefillSpeedUnconscious}
        onChange={(x) => patch({ shockRefillSpeedUnconscious: x })}
        tooltip="Rate at which shock refills while unconscious. Governs how long an unconscious state lasts before the player auto-wakes. Vanilla is slow on purpose — increase to let downed players recover faster."
      />
      <BoolField
        label="Allow refill speed modifier"
        value={v.allowRefillSpeedModifier}
        onChange={(x) => patch({ allowRefillSpeedModifier: x })}
        tooltip="Enables the dynamic multiplier on shock refill based on the player's health and blood levels. Disable for a flat, predictable shock curve; enable for the vanilla behaviour where low-health players recover shock slower."
      />
    </>
  );
}

function MovementForm({
  value,
  onChange,
}: {
  value: NonNullable<CfgGameplayPlayerData["MovementData"]> | null;
  onChange: (v: NonNullable<CfgGameplayPlayerData["MovementData"]> | null) => void;
}) {
  const v = value ?? {};
  const patch = (p: Partial<NonNullable<CfgGameplayPlayerData["MovementData"]>>) =>
    onChange({ ...v, ...p });
  return (
    <>
      <NumberField
        label="Time to strafe (jog)"
        value={v.timeToStrafeJog}
        onChange={(x) => patch({ timeToStrafeJog: x })}
        step={0.05}
        tooltip="Seconds to transition sideways while jogging — the feel of 'how snappy does strafing feel'. Lower = tighter, more responsive; higher = heavier, more realistic weight."
      />
      <NumberField
        label="Rotation speed (jog)"
        value={v.rotationSpeedJog}
        onChange={(x) => patch({ rotationSpeedJog: x })}
        step={0.05}
        tooltip="How fast the character can turn while jogging. Affects aim tracking and general responsiveness. Part of the 'fluid vs weighty' feel."
      />
      <NumberField
        label="Time to sprint"
        value={v.timeToSprint}
        onChange={(x) => patch({ timeToSprint: x })}
        step={0.05}
        tooltip="Seconds from standing still to full sprint speed. Higher = more commitment to sprinting, harder to suddenly dash for cover."
      />
      <NumberField
        label="Time to strafe (sprint)"
        value={v.timeToStrafeSprint}
        onChange={(x) => patch({ timeToStrafeSprint: x })}
        step={0.05}
        tooltip="Seconds to complete a strafe while sprinting. Significantly affects PvP feel — tight strafes make dodging easier."
      />
      <NumberField
        label="Rotation speed (sprint)"
        value={v.rotationSpeedSprint}
        onChange={(x) => patch({ rotationSpeedSprint: x })}
        step={0.05}
        tooltip="How fast the character can turn while sprinting. Usually lower than jog-rotation to simulate momentum."
      />
      <BoolField
        label="Stamina affects inertia"
        value={v.allowStaminaAffectInertia}
        onChange={(x) => patch({ allowStaminaAffectInertia: x })}
        tooltip="When on, low stamina makes movement feel heavier (slower strafes, lazier rotation). Vanilla behaviour. Turn off for consistent responsiveness regardless of stamina."
      />
    </>
  );
}

function DrowningForm({
  value,
  onChange,
}: {
  value: NonNullable<CfgGameplayPlayerData["DrowningData"]> | null;
  onChange: (v: NonNullable<CfgGameplayPlayerData["DrowningData"]> | null) => void;
}) {
  const v = value ?? {};
  const patch = (p: Partial<NonNullable<CfgGameplayPlayerData["DrowningData"]>>) =>
    onChange({ ...v, ...p });
  return (
    <>
      <NumberField
        label="Stamina depletion speed"
        value={v.staminaDepletionSpeed}
        onChange={(x) => patch({ staminaDepletionSpeed: x })}
        tooltip="How fast stamina drains per second while the player's head is underwater. Higher = faster exhaustion during long swims."
      />
      <NumberField
        label="Health depletion speed"
        value={v.healthDepletionSpeed}
        onChange={(x) => patch({ healthDepletionSpeed: x })}
        tooltip="Health lost per second once stamina has run out underwater. Governs how long after exhaustion a player can survive before drowning."
      />
      <NumberField
        label="Shock depletion speed"
        value={v.shockDepletionSpeed}
        onChange={(x) => patch({ shockDepletionSpeed: x })}
        tooltip="Shock lost per second underwater after stamina runs out — effectively the 'blacking out' rate, which can render the player unconscious while drowning."
      />
    </>
  );
}

// ---------- Worlds ----------

function WorldsForm({
  value,
  onChange,
}: {
  value: CfgGameplayWorldsData | null;
  onChange: (v: CfgGameplayWorldsData | null) => void;
}) {
  const v = value ?? {};
  const patch = (p: Partial<CfgGameplayWorldsData>) => onChange({ ...v, ...p });
  return (
    <SectionCard title="WorldsData" icon={<Waves className="h-4 w-4" />}>
      <NumberField
        label="Lighting config"
        value={v.lightingConfig}
        onChange={(x) => patch({ lightingConfig: x })}
        step={1}
        hint="Bohemia preset index. Vanilla: 0."
        tooltip="Selects which lighting preset the engine uses for sun/moon intensity, night darkness, and colour. 0 is vanilla. Other indices toggle brighter-night / harder-night variants shipped by Bohemia."
      />
      <NumberArrayField
        label="Environment min temps (°C per month)"
        value={v.environmentMinTemps}
        expected={12}
        onChange={(x) => patch({ environmentMinTemps: x })}
        tooltip="Per-month floor temperatures used by the weather system. 12 values, January to December. Lower temps trigger cold / hypothermia mechanics more aggressively."
      />
      <NumberArrayField
        label="Environment max temps (°C per month)"
        value={v.environmentMaxTemps}
        expected={12}
        onChange={(x) => patch({ environmentMaxTemps: x })}
        tooltip="Per-month ceiling temperatures used by the weather system. 12 values. Higher temps drive evaporation and dry out wet clothes faster."
      />
      <NumberArrayField
        label="Wetness weight modifiers"
        value={v.wetnessWeightModifiers}
        expected={5}
        onChange={(x) => patch({ wetnessWeightModifiers: x })}
        hint="5 values: dry / damp / wet / soaked / drenched."
        tooltip="Multipliers applied to an item's weight at each wetness step. 1.0 = weight unchanged. Common tweak: raise 'soaked'/'drenched' so waterlogged gear actually slows players down."
      />
      <StringListField
        label="Object spawners (classnames)"
        value={v.objectSpawnersArr}
        onChange={(x) => patch({ objectSpawnersArr: x })}
        tooltip="Classnames the engine treats as dynamic object spawners (tents, vehicles, etc. that get persisted per player interaction). Usually only touched when adding mod-added spawn systems."
      />
    </SectionCard>
  );
}

// ---------- Base building ----------

function BaseBuildingForm({
  value,
  onChange,
}: {
  value: CfgGameplayBaseBuildingData | null;
  onChange: (v: CfgGameplayBaseBuildingData | null) => void;
}) {
  const v = value ?? {};
  const patch = (p: Partial<CfgGameplayBaseBuildingData>) =>
    onChange({ ...v, ...p });
  const holo = v.HologramData ?? {};
  const patchHolo = (p: Partial<NonNullable<CfgGameplayBaseBuildingData["HologramData"]>>) =>
    patch({ HologramData: { ...holo, ...p } });
  const con = v.ConstructionData ?? {};
  const patchCon = (p: Partial<NonNullable<CfgGameplayBaseBuildingData["ConstructionData"]>>) =>
    patch({ ConstructionData: { ...con, ...p } });
  return (
    <>
      <SectionCard title="HologramData" icon={<Hammer className="h-4 w-4" />}>
        <BoolField
          label="Disable bbox collision check"
          value={holo.disableIsCollidingBboxCheck}
          onChange={(x) => patchHolo({ disableIsCollidingBboxCheck: x })}
          tooltip="When on, the placement preview stops rejecting placements that intersect another object's bounding box. Allows building through vehicles, rocks, and existing walls. Common on cluttered PvE servers."
        />
        <BoolField
          label="Disable player collision check"
          value={holo.disableIsCollidingPlayerCheck}
          onChange={(x) => patchHolo({ disableIsCollidingPlayerCheck: x })}
          tooltip="Lets walls/gates be placed while a player is standing in the footprint. Useful for griefing-free base builds; risky on PvP servers since it allows trapping players."
        />
        <BoolField
          label="Disable roof clipping check"
          value={holo.disableIsClippingRoofCheck}
          onChange={(x) => patchHolo({ disableIsClippingRoofCheck: x })}
          tooltip="Allows placements to overlap existing roofs. Enables stacked-floor bases with tighter geometry than vanilla allows."
        />
        <BoolField
          label="Disable base viable check"
          value={holo.disableIsBaseViableCheck}
          onChange={(x) => patchHolo({ disableIsBaseViableCheck: x })}
          tooltip="Skips the 'is this a valid surface for a base?' sanity check. Enables building on inclines, beaches, and other terrain the engine normally refuses."
        />
        <BoolField
          label="Disable gplot collision check"
          value={holo.disableIsCollidingGPlotCheck}
          onChange={(x) => patchHolo({ disableIsCollidingGPlotCheck: x })}
          tooltip="Allows placements to overlap garden-plot / crop-plot footprints. Normally blocked so farming tiles stay accessible."
        />
        <BoolField
          label="Disable angle check"
          value={holo.disableIsCollidingAngleCheck}
          onChange={(x) => patchHolo({ disableIsCollidingAngleCheck: x })}
          tooltip="Removes the ground-angle tolerance. With this on, players can place walls on much steeper slopes — at the cost of geometry that looks like it's floating."
        />
        <BoolField
          label="Disable placement permitted check"
          value={holo.disableIsPlacementPermittedCheck}
          onChange={(x) => patchHolo({ disableIsPlacementPermittedCheck: x })}
          tooltip="Master override on the 'is this spot permitted at all?' check. Turning it on basically lets players place anywhere — use with extreme caution on public servers."
        />
        <BoolField
          label="Disable height placement check"
          value={holo.disableHeightPlacementCheck}
          onChange={(x) => patchHolo({ disableHeightPlacementCheck: x })}
          tooltip="Removes the vertical-distance cap that stops players placing objects high above their head. Enables towering builds but opens up skyboxing."
        />
        <BoolField
          label="Disable underwater check"
          value={holo.disableIsUnderwaterCheck}
          onChange={(x) => patchHolo({ disableIsUnderwaterCheck: x })}
          tooltip="Allows placement below the waterline. Useful for dock builds or 'secret underwater base' gimmicks; vanilla refuses."
        />
        <BoolField
          label="Disable in-terrain check"
          value={holo.disableIsInTerrainCheck}
          onChange={(x) => patchHolo({ disableIsInTerrainCheck: x })}
          tooltip="Lets placements clip into rocks and terrain. Normally blocked to prevent pieces from ending up floating or half-buried after a server restart."
        />
        <BoolField
          label="Disable cold-area building check"
          value={holo.disableColdAreaBuildingCheck}
          onChange={(x) => patchHolo({ disableColdAreaBuildingCheck: x })}
          tooltip="Allows base-building in Livonia / Namalsk-style cold biomes that would otherwise refuse certain structures. Mostly relevant to modded cold-weather maps."
        />
        <StringListField
          label="Disallowed types underground"
          value={holo.disallowedTypesInUnderground}
          onChange={(x) =>
            patchHolo({ disallowedTypesInUnderground: x })
          }
          hint="Classnames that can't be placed in underground zones."
          tooltip="Explicit blacklist of classnames the build hologram refuses underground. Useful for walling off specific items from cave / tunnel exploits."
        />
      </SectionCard>

      <SectionCard
        title="ConstructionData"
        icon={<Hammer className="h-4 w-4" />}
      >
        <BoolField
          label="Disable perform roof check"
          value={con.disablePerformRoofCheck}
          onChange={(x) => patchCon({ disablePerformRoofCheck: x })}
          tooltip="Applies to the post-placement construction step (actually raising the wall / roof part). Disables the same roof clipping check as the hologram pass, so parts can't be rejected mid-build."
        />
        <BoolField
          label="Disable is-colliding check"
          value={con.disableIsCollidingCheck}
          onChange={(x) => patchCon({ disableIsCollidingCheck: x })}
          tooltip="Disables the runtime collision check during actual construction. Matters for edge cases where the hologram allowed placement but the build action would otherwise fail."
        />
        <BoolField
          label="Disable distance check"
          value={con.disableDistanceCheck}
          onChange={(x) => patchCon({ disableDistanceCheck: x })}
          tooltip="Removes the 'is the player close enough?' tolerance during construction. Enables telekinetic builds from further away; exploit risk."
        />
      </SectionCard>
    </>
  );
}

// ---------- UI + Hit indicator ----------

function UIForm({
  value,
  onChange,
}: {
  value: CfgGameplayUIData | null;
  onChange: (v: CfgGameplayUIData | null) => void;
}) {
  const v = value ?? {};
  const patch = (p: Partial<CfgGameplayUIData>) => onChange({ ...v, ...p });
  const hit = v.HitIndicationData ?? {};
  const patchHit = (p: Partial<CfgGameplayHitIndicationData>) =>
    patch({ HitIndicationData: { ...hit, ...p } });
  return (
    <>
      <SectionCard title="UIData" icon={<Gauge className="h-4 w-4" />}>
        <BoolField
          label="Use 3D map"
          value={v.use3DMap}
          onChange={(x) => patch({ use3DMap: x })}
          hint="Switch the in-game map from flat to 3D."
          tooltip="When on, the in-game map opens as a 3D scene (tilted, with terrain relief) rather than a flat parchment. Pure UI preference."
        />
      </SectionCard>

      <SectionCard
        title="HitIndicationData"
        icon={<Gauge className="h-4 w-4" />}
      >
        <BoolField
          label="Override enabled"
          value={hit.hitDirectionOverrideEnabled}
          onChange={(x) => patchHit({ hitDirectionOverrideEnabled: x })}
          tooltip="Master switch for the custom hit-direction indicator. When off, the remaining fields in this section are ignored and vanilla behaviour applies."
        />
        <NumberField
          label="Behaviour"
          value={hit.hitDirectionBehaviour}
          onChange={(x) => patchHit({ hitDirectionBehaviour: x })}
          step={1}
          tooltip="Enum: 0 = disabled, 1 = screen splash, 2 = directional arrow, 3 = both. Check the DayZ Enforce Script source if a specific value isn't behaving as expected."
        />
        <NumberField
          label="Style"
          value={hit.hitDirectionStyle}
          onChange={(x) => patchHit({ hitDirectionStyle: x })}
          step={1}
          tooltip="Visual preset index — different styles render the direction indicator as an arrow, a fading wedge, a radial pulse, etc. Numeric enum; consult community docs for the per-index appearance."
        />
        <StringField
          label="Indicator colour (ARGB hex)"
          value={hit.hitDirectionIndicatorColorStr}
          onChange={(x) => patchHit({ hitDirectionIndicatorColorStr: x })}
          placeholder="0xffbb0a1e"
          tooltip="ARGB hex colour for the indicator. Format: 0xAARRGGBB. Default is a muted blood-red (0xffbb0a1e). The AA byte is alpha — use low values for a subtle indicator."
        />
        <NumberField
          label="Max duration (s)"
          value={hit.hitDirectionMaxDuration}
          onChange={(x) => patchHit({ hitDirectionMaxDuration: x })}
          step={0.1}
          tooltip="Seconds the hit-direction indicator stays on screen after a shot lands. Longer = easier to identify incoming fire; shorter = more realistic ambiguity."
        />
        <NumberField
          label="Break point (relative)"
          value={hit.hitDirectionBreakPointRelative}
          onChange={(x) => patchHit({ hitDirectionBreakPointRelative: x })}
          step={0.05}
          tooltip="Normalised time (0..1) within the indicator's lifetime where it transitions from bright to fade-out. Lower values = snappier fade."
        />
        <NumberField
          label="Scatter"
          value={hit.hitDirectionScatter}
          onChange={(x) => patchHit({ hitDirectionScatter: x })}
          step={1}
          tooltip="Angular noise (degrees) added to the indicator's direction so it can't be used to pinpoint the shooter exactly. Higher = more forgiving to the shooter, harder for the victim to counter-snap."
        />
        <BoolField
          label="Post-process enabled"
          value={hit.hitIndicationPostProcessEnabled}
          onChange={(x) => patchHit({ hitIndicationPostProcessEnabled: x })}
          tooltip="Enables a screen-space post-process tint (vignette / red flash) on hit. Turn off for minimalist HUDs."
        />
      </SectionCard>
    </>
  );
}

// ---------- Map ----------

function MapForm({
  value,
  onChange,
}: {
  value: CfgGameplayMapData | null;
  onChange: (v: CfgGameplayMapData | null) => void;
}) {
  const v = value ?? {};
  const patch = (p: Partial<CfgGameplayMapData>) => onChange({ ...v, ...p });
  return (
    <SectionCard title="MapData" icon={<MapIcon className="h-4 w-4" />}>
      <BoolField
        label="Ignore map ownership"
        value={v.ignoreMapOwnership}
        onChange={(x) => patch({ ignoreMapOwnership: x })}
        hint="Lets players see the map without picking up a physical map."
        tooltip="When on, every player can open the in-game map regardless of whether they're carrying one. Common on community PvE servers; disables the vanilla 'orienteering' loop."
      />
      <BoolField
        label="Ignore nav-items ownership"
        value={v.ignoreNavItemsOwnership}
        onChange={(x) => patch({ ignoreNavItemsOwnership: x })}
        tooltip="Same idea as map ownership, but for compass / GPS / other nav items. With it off and maps disabled, players have to actually find these items to navigate."
      />
      <BoolField
        label="Display player position"
        value={v.displayPlayerPosition}
        onChange={(x) => patch({ displayPlayerPosition: x })}
        tooltip="Adds a 'you are here' marker on the map. Convenience feature popular on casual servers; hardcore rulesets usually leave it off so players have to triangulate."
      />
      <BoolField
        label="Display nav info"
        value={v.displayNavInfo}
        onChange={(x) => patch({ displayNavInfo: x })}
        tooltip="Shows compass heading / bearing readout when the map is open. Pairs well with 'Display player position' for a full turn-by-turn feel."
      />
    </SectionCard>
  );
}

// ---------- Raw JSON fallback ----------

function RawJsonTab({
  draft,
  setDraft,
}: {
  draft: CfgGameplay;
  setDraft: (v: CfgGameplay) => void;
}) {
  const serialized = useMemo(() => JSON.stringify(draft, null, 2), [draft]);
  const [text, setText] = useState(serialized);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setText(serialized);
  }, [serialized]);
  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setErr(null);
        }}
        spellCheck={false}
        className="h-[480px] font-mono text-[11px]"
      />
      {err ? (
        <p className="text-[11px] text-severity-error">{err}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setText(serialized)}
        >
          Revert to form state
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            try {
              const parsed = JSON.parse(text) as CfgGameplay;
              setDraft(parsed);
              setErr(null);
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Apply to form
        </Button>
      </div>
    </div>
  );
}
