import { useEffect, useState } from "react";
import { useForm, type Resolver, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  CheckCircle2,
  FolderOpen,
  FolderSearch,
  Loader2,
  PlugZap,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/StatusBadge";
import { RemoteBrowserDialog } from "@/features/profiles/RemoteBrowserDialog";
import * as tauri from "@/lib/tauri";
import type { ConnectionTestResult, ServerRootScan } from "@/types/ipc";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCreateProfile,
  useTestConnectionDraft,
  useUpdateProfile,
} from "@/hooks/useProfiles";
import type {
  ProfileDraft,
  ProfileSecrets,
  ServerProfile,
} from "@/types/ipc";

const schema = z
  .object({
    name: z.string().min(1, "name is required"),
    mode: z.enum(["sftp", "local"]),
    host: z.string().optional(),
    port: z.coerce.number().int().min(1).max(65535).optional(),
    username: z.string().optional(),
    authType: z.enum(["password", "privateKey"]).optional(),
    privateKeyPath: z.string().optional(),
    password: z.string().optional(),
    keyPassphrase: z.string().optional(),
    remoteRoot: z.string().optional(),
    rootPath: z.string().optional(),
    mpmissionsRelative: z.string().min(1, "mpmissions path is required"),
    profilesRelative: z.string().min(1, "profiles path is required"),
    map: z.enum(["chernarusplus", "enoch", "sakhal", "custom"]),
    customMapId: z.string().optional(),
    customMapSizeM: z.coerce
      .number()
      .int()
      .min(1)
      .max(50000)
      .optional(),
    workDir: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "sftp") {
      if (!v.host) ctx.addIssue({ code: "custom", path: ["host"], message: "host is required" });
      if (!v.username)
        ctx.addIssue({ code: "custom", path: ["username"], message: "username is required" });
      if (!v.authType)
        ctx.addIssue({ code: "custom", path: ["authType"], message: "auth type is required" });
      if (v.authType === "privateKey" && !v.privateKeyPath)
        ctx.addIssue({
          code: "custom",
          path: ["privateKeyPath"],
          message: "private key path is required",
        });
    }
    if (v.mode === "local" && !v.rootPath) {
      ctx.addIssue({ code: "custom", path: ["rootPath"], message: "root path is required" });
    }
    if (v.map === "custom" && !v.customMapId) {
      ctx.addIssue({
        code: "custom",
        path: ["customMapId"],
        message: "custom map id is required",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  profile?: ServerProfile | null;
}

const DEFAULTS: FormValues = {
  name: "",
  mode: "sftp",
  host: "",
  port: 22,
  username: "",
  authType: "password",
  privateKeyPath: "",
  password: "",
  keyPassphrase: "",
  remoteRoot: "",
  rootPath: "",
  mpmissionsRelative: "mpmissions/dayzOffline.chernarusplus",
  profilesRelative: "profiles",
  map: "chernarusplus",
  customMapId: "",
  customMapSizeM: undefined,
  workDir: "",
};

export function ProfileFormDialog(props: Props) {
  // Keying by target profile identity forces a full remount when the
  // caller switches between editing different profiles or between
  // edit and create. That guarantees useForm / useState / useMutation
  // all get fresh instances, so we don't leak form values or mutation
  // state from a previous open cycle (seen as "Create profile opened
  // the last-edited profile's data").
  return (
    <ProfileFormDialogInner
      key={props.profile?.id ?? "__new__"}
      {...props}
    />
  );
}

function ProfileFormDialogInner({ open, onOpenChange, profile }: Props) {
  const create = useCreateProfile();
  const update = useUpdateProfile();
  const isEdit = !!profile;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (!open) return;
    if (profile) {
      form.reset({
        name: profile.name,
        mode: profile.mode,
        host: profile.sftp?.host ?? "",
        port: profile.sftp?.port ?? 22,
        username: profile.sftp?.username ?? "",
        authType: profile.sftp?.authType ?? "password",
        privateKeyPath: profile.sftp?.privateKeyPath ?? "",
        password: "",
        keyPassphrase: "",
        remoteRoot: profile.sftp?.remoteRoot ?? "",
        rootPath: profile.local?.rootPath ?? "",
        mpmissionsRelative: profile.paths.mpmissionsRelative,
        profilesRelative: profile.paths.profilesRelative,
        map: profile.map,
        customMapId: profile.customMapId ?? "",
        customMapSizeM: profile.customMapSizeM ?? undefined,
        workDir: profile.workDir ?? "",
      });
    } else {
      form.reset(DEFAULTS);
    }
  }, [open, profile, form]);

  const mode = form.watch("mode");
  const authType = form.watch("authType");
  const map = form.watch("map");
  const rootPath = form.watch("rootPath");
  const mpmissionsRelative = form.watch("mpmissionsRelative");
  const profilesRelative = form.watch("profilesRelative");
  // Subscribe to SFTP-gate fields so the Browse / Test buttons'
  // `disabled` props re-evaluate as the user types. Without these
  // watches `canBrowse(form.getValues())` reads stale values on
  // re-render and the buttons stay disabled after typing a host.
  form.watch("host");
  form.watch("username");
  form.watch("privateKeyPath");

  const [scan, setScan] = useState<ServerRootScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualPaths, setManualPaths] = useState(false);
  const showManualInputs = manualPaths || !scan?.rootExists;

  const testConnection = useTestConnectionDraft();
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [browsePurpose, setBrowsePurpose] = useState<BrowsePurpose | null>(
    null,
  );
  // Fingerprint captured by a successful in-modal test. Persisted into
  // the draft on save so Pull / Push don't error with "no host
  // fingerprint on file" on the first sync after profile creation.
  const [capturedFingerprint, setCapturedFingerprint] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!open) {
      setScan(null);
      setManualPaths(false);
      setScanning(false);
      setTestResult(null);
      setCapturedFingerprint(null);
    }
  }, [open]);

  // Only auto-fill when the form holds a blank or placeholder value —
  // we mustn't overwrite an edit in progress, and must not mark the
  // form dirty by writing the same value back.
  const fillIfDefault = <K extends keyof FormValues>(
    field: K,
    next: FormValues[K] | undefined,
  ) => {
    if (next === undefined) return;
    const current = form.getValues(field);
    const isDefault = !current || current === DEFAULTS[field];
    if (isDefault && next !== current) {
      // react-hook-form's setValue uses a `PathValue<FormValues, Path<...>>`
      // mapped-conditional that doesn't narrow through generic `K`, so
      // the field-generic form loses inference. Cast through a simpler
      // signature — runtime behaviour is identical.
      (
        form.setValue as (
          f: keyof FormValues,
          v: FormValues[keyof FormValues],
          o?: { shouldValidate?: boolean },
        ) => void
      )(field, next, { shouldValidate: true });
    }
  };

  const runScan = async (pathOverride?: string) => {
    const p = (pathOverride ?? rootPath ?? "").trim();
    if (!p) {
      setScan(null);
      return;
    }
    setScanning(true);
    try {
      const result = await tauri.serverRootScan(p);
      setScan(result);
      if (result.rootExists) {
        const mission = result.missions[0];
        if (mission) {
          fillIfDefault("mpmissionsRelative", mission.relativePath);
          if (mission.mapHint) fillIfDefault("map", mission.mapHint);
        }
        const profileFolder = result.profileFolders[0];
        if (profileFolder) {
          fillIfDefault("profilesRelative", profileFolder.relativePath);
        }
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setScanning(false);
    }
  };

  const pickRootPath = async () => {
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked === "string") {
      form.setValue("rootPath", picked);
      void runScan(picked);
    }
  };

  const pickKeyPath = async () => {
    const picked = await openDialog({ directory: false, multiple: false });
    if (typeof picked === "string") form.setValue("privateKeyPath", picked);
  };

  const pickWorkDir = async () => {
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked === "string") form.setValue("workDir", picked);
  };

  const buildDraftAndSecrets = (
    v: FormValues,
  ): { draft: ProfileDraft; secrets: ProfileSecrets } => {
    // form.getValues() returns raw form data; number inputs come back
    // as strings even though the zod schema coerces them on validation.
    // Coerce explicitly before handing to the backend (serde on the
    // Rust side rejects `"22"` where `u16` is expected).
    const portNum = Number(v.port);
    const port = Number.isFinite(portNum) && portNum > 0 ? portNum : 22;
    const draft: ProfileDraft = {
      name: v.name.trim(),
      mode: v.mode,
      sftp:
        v.mode === "sftp"
          ? {
              host: v.host?.trim() ?? "",
              port,
              username: v.username?.trim() ?? "",
              authType: v.authType ?? "password",
              privateKeyPath: v.privateKeyPath?.trim() || null,
              // Prefer a just-captured fingerprint from an in-modal
              // test; fall back to the saved profile's trusted one.
              knownHostFingerprint:
                capturedFingerprint ??
                profile?.sftp?.knownHostFingerprint ??
                null,
              remoteRoot: v.remoteRoot?.trim() || null,
            }
          : null,
      local:
        v.mode === "local" ? { rootPath: v.rootPath?.trim() ?? "" } : null,
      paths: {
        mpmissionsRelative: v.mpmissionsRelative.trim(),
        profilesRelative: v.profilesRelative.trim(),
      },
      map: v.map,
      customMapId: v.map === "custom" ? v.customMapId?.trim() || null : null,
      customMapSizeM:
        v.map === "custom" && v.customMapSizeM != null
          ? Number(v.customMapSizeM)
          : null,
      workDir: v.workDir?.trim() || null,
      remoteCommands: profile?.remoteCommands ?? null,
    };

    const secrets: ProfileSecrets = {
      password: v.mode === "sftp" && v.authType === "password" ? v.password || null : null,
      keyPassphrase:
        v.mode === "sftp" && v.authType === "privateKey" && v.keyPassphrase
          ? v.keyPassphrase
          : null,
    };

    return { draft, secrets };
  };

  const runTest = () => {
    setTestResult(null);
    const values = form.getValues();
    const { draft, secrets } = buildDraftAndSecrets(values);
    // Per-mode minimum: must have enough to attempt a connection. Skip
    // the full zod validation so the user can test even with a blank
    // name / map field.
    if (values.mode === "sftp") {
      const gate = sftpConnectGate(values);
      if (!gate.ok) {
        toast.error(gate.reason);
        return;
      }
    } else if (!draft.local?.rootPath) {
      toast.error("pick a server root folder to test");
      return;
    }
    testConnection.mutate(
      {
        draft,
        secrets,
        existingId: profile?.id ?? null,
      },
      {
        onSuccess: (r) => {
          setTestResult(r);
          // Remember the fingerprint only on a clean pass so Save
          // persists it to the profile. Don't memorise a mismatched
          // one — the user should investigate first.
          if (r.ok && r.fingerprint) {
            setCapturedFingerprint(r.fingerprint);
          }
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  const onSubmit = (v: FormValues) => {
    const { draft, secrets } = buildDraftAndSecrets(v);
    const hasNewSecrets = !!(secrets.password || secrets.keyPassphrase);

    const onSuccess = () => {
      toast.success(isEdit ? "profile updated" : "profile created");
      onOpenChange(false);
    };
    const onError = (err: unknown) => {
      toast.error(errorMessage(err));
    };

    if (isEdit && profile) {
      update.mutate(
        {
          id: profile.id,
          draft,
          secrets: hasNewSecrets ? secrets : null,
        },
        { onSuccess, onError },
      );
    } else {
      create.mutate({ draft, secrets }, { onSuccess, onError });
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit server profile" : "New server profile"}
          </DialogTitle>
          <DialogDescription>
            Pull-edit-push workspace. Secrets are stored in the OS keychain.
          </DialogDescription>
        </DialogHeader>

        <form
          id="profile-form"
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="My Chernarus server"
              {...form.register("name")}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-severity-error">
                {form.formState.errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Connection mode</Label>
            <Tabs
              value={mode}
              onValueChange={(v) =>
                form.setValue("mode", v as FormValues["mode"], {
                  shouldValidate: true,
                })
              }
            >
              <TabsList>
                <TabsTrigger value="sftp">SFTP (remote)</TabsTrigger>
                <TabsTrigger value="local">Local folder</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {mode === "sftp" ? (
            <div className="grid grid-cols-6 gap-3 rounded-md border border-border/60 p-3">
              <div className="col-span-4 space-y-1.5">
                <Label htmlFor="host">Host</Label>
                <Input id="host" placeholder="server.example.com" {...form.register("host")} />
                {form.formState.errors.host ? (
                  <p className="text-xs text-severity-error">
                    {form.formState.errors.host.message}
                  </p>
                ) : null}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="port">Port</Label>
                <Input id="port" type="number" {...form.register("port")} />
              </div>

              <div className="col-span-3 space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input id="username" {...form.register("username")} />
                {form.formState.errors.username ? (
                  <p className="text-xs text-severity-error">
                    {form.formState.errors.username.message}
                  </p>
                ) : null}
              </div>
              <div className="col-span-3 space-y-1.5">
                <Label>Auth</Label>
                <Select
                  value={authType ?? "password"}
                  onValueChange={(v) =>
                    form.setValue("authType", v as NonNullable<FormValues["authType"]>)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="password">Password</SelectItem>
                    <SelectItem value="privateKey">Private key</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {authType === "password" ? (
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="password">
                    Password
                    {isEdit ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (leave blank to keep existing)
                      </span>
                    ) : null}
                  </Label>
                  <Input id="password" type="password" {...form.register("password")} />
                </div>
              ) : (
                <>
                  <div className="col-span-6 space-y-1.5">
                    <Label htmlFor="privateKeyPath">Private key path</Label>
                    <div className="flex gap-2">
                      <Input id="privateKeyPath" {...form.register("privateKeyPath")} />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        onClick={pickKeyPath}
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </div>
                    {form.formState.errors.privateKeyPath ? (
                      <p className="text-xs text-severity-error">
                        {form.formState.errors.privateKeyPath.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <Label htmlFor="keyPassphrase">
                      Key passphrase{" "}
                      <span className="text-xs text-muted-foreground">
                        (optional; leave blank to keep existing)
                      </span>
                    </Label>
                    <Input
                      id="keyPassphrase"
                      type="password"
                      {...form.register("keyPassphrase")}
                    />
                  </div>
                </>
              )}

              <div className="col-span-6 space-y-1.5">
                <Label htmlFor="remoteRoot">
                  Server root path{" "}
                  <span className="text-xs text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="remoteRoot"
                    placeholder="/opt/dayz  or  /home/gameserver/dayz-server"
                    {...form.register("remoteRoot")}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={() => setBrowsePurpose("serverRoot")}
                    title="Browse remote filesystem"
                    disabled={!canBrowse(form.getValues())}
                  >
                    <FolderSearch className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fill this in when the DayZ install doesn't sit
                  directly under the SSH login user's home. Mission
                  and profiles paths below are resolved against this
                  root. Leave blank if your paths are already
                  home-relative or absolute (start with{" "}
                  <code>/</code>). Click the folder icon to browse the
                  server.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-md border border-border/60 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="rootPath">Server root folder</Label>
                <div className="flex gap-2">
                  <Input
                    id="rootPath"
                    placeholder="C:\\path\\to\\server-root"
                    {...form.register("rootPath")}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={pickRootPath}
                    title="Pick folder"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void runScan()}
                    disabled={!rootPath?.trim() || scanning}
                    title="Re-scan for missions + profiles"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`}
                    />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Point at the DayZ server install root (the folder
                  that contains <code>serverDZ.cfg</code>,{" "}
                  <code>mpmissions/</code>, and one or more profile
                  directories). We scan automatically and offer
                  dropdowns for mission + profile below.
                </p>
                {form.formState.errors.rootPath ? (
                  <p className="text-xs text-severity-error">
                    {form.formState.errors.rootPath.message}
                  </p>
                ) : null}
              </div>

              {scan && scan.rootExists ? (
                <ScanSummary
                  scan={scan}
                  manual={manualPaths}
                  onToggleManual={() => setManualPaths((m) => !m)}
                />
              ) : scan && !scan.rootExists ? (
                <p className="text-xs text-severity-error">
                  Path doesn't exist on disk.
                </p>
              ) : null}

              {showManualInputs ? (
                <RelativePathInputs form={form} />
              ) : scan ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Mission folder</Label>
                    <Select
                      value={mpmissionsRelative}
                      onValueChange={(v) => {
                        form.setValue("mpmissionsRelative", v, {
                          shouldValidate: true,
                        });
                        const pick = scan.missions.find(
                          (m) => m.relativePath === v,
                        );
                        if (
                          pick?.mapHint &&
                          pick.mapHint !== form.getValues("map")
                        ) {
                          form.setValue("map", pick.mapHint, {
                            shouldValidate: true,
                          });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a mission" />
                      </SelectTrigger>
                      <SelectContent>
                        {scan.missions.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            None detected — tick "Type manually"
                          </SelectItem>
                        ) : (
                          scan.missions.map((m) => (
                            <SelectItem
                              key={m.relativePath}
                              value={m.relativePath}
                            >
                              {m.relativePath}
                              {m.mapHint ? ` · ${m.mapHint}` : ""}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Profiles folder</Label>
                    <Select
                      value={profilesRelative}
                      onValueChange={(v) =>
                        form.setValue("profilesRelative", v, {
                          shouldValidate: true,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a profile folder" />
                      </SelectTrigger>
                      <SelectContent>
                        {scan.profileFolders.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            None detected — tick "Type manually"
                          </SelectItem>
                        ) : (
                          scan.profileFolders.map((p) => (
                            <SelectItem
                              key={p.relativePath}
                              value={p.relativePath}
                            >
                              {p.relativePath}
                              {p.markers.length > 0
                                ? ` · ${p.markers.join(", ")}`
                                : ""}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {mode === "sftp" ? (
            <div className="space-y-2 rounded-md border border-border/60 p-3">
              <RelativePathInputs
                form={form}
                onBrowseMissions={() => setBrowsePurpose("missions")}
                onBrowseProfiles={() => setBrowsePurpose("profiles")}
                browseDisabled={!canBrowse(form.getValues())}
              />
              <p className="text-xs text-muted-foreground">
                Click the folder icon next to each field to browse
                the server. Enter absolute paths (starting with{" "}
                <code>/</code>), paths relative to the server root
                above, or relative to the SSH login user's home.
              </p>
            </div>
          ) : null}

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Map</Label>
              <Select
                value={map}
                onValueChange={(v) => form.setValue("map", v as FormValues["map"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chernarusplus">Chernarus+</SelectItem>
                  <SelectItem value="enoch">Livonia</SelectItem>
                  <SelectItem value="sakhal">Sakhal</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {map === "custom" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="customMapId">Custom map id</Label>
                  <Input id="customMapId" {...form.register("customMapId")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="customMapSizeM">
                    Map size (m){" "}
                    <span className="text-xs text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="customMapSizeM"
                    type="number"
                    min={1}
                    max={50000}
                    placeholder="15360"
                    {...form.register("customMapSizeM")}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    World-metre extent of your custom terrain. Defaults
                    to Chernarus (15360) when blank — set this so the
                    map canvas, grid, and clamp match your actual
                    playfield.
                  </p>
                </div>
              </>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="workDir">
              Working directory{" "}
              <span className="text-xs text-muted-foreground">
                (optional)
              </span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="workDir"
                placeholder="e.g. D:\\DayZ\\my-server"
                {...form.register("workDir")}
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={pickWorkDir}
                title="Pick folder"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Where this profile writes build outputs — modpack PBOs,
              CE-zone override PBOs, extracted files. Absolute path.
              Leave blank to use the app's data directory.
            </p>
            {form.formState.errors.workDir ? (
              <p className="text-xs text-severity-error">
                {form.formState.errors.workDir.message}
              </p>
            ) : null}
          </div>
        </form>

        {testResult ? <TestResultBanner result={testResult} /> : null}

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="secondary"
            onClick={runTest}
            disabled={testConnection.isPending || isPending}
          >
            {testConnection.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing…
              </>
            ) : (
              <>
                <PlugZap className="mr-2 h-4 w-4" />
                Test connection
              </>
            )}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="profile-form" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Create profile"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      <RemoteBrowserDialog
        open={browsePurpose !== null}
        onOpenChange={(v) => {
          if (!v) setBrowsePurpose(null);
        }}
        purpose={browsePurpose ?? "serverRoot"}
        existingId={profile?.id ?? null}
        initialPath={
          browsePurpose
            ? form.getValues(BROWSE_PURPOSE_TO_FIELD[browsePurpose]) ?? ""
            : ""
        }
        buildDraft={() => buildDraftAndSecrets(form.getValues())}
        onSelect={(picked) => {
          if (browsePurpose) {
            form.setValue(BROWSE_PURPOSE_TO_FIELD[browsePurpose], picked, {
              shouldValidate: true,
            });
          }
          setBrowsePurpose(null);
        }}
      />
    </Dialog>
  );
}

function RelativePathInputs({
  form,
  onBrowseMissions,
  onBrowseProfiles,
  browseDisabled,
}: {
  form: UseFormReturn<FormValues>;
  onBrowseMissions?: () => void;
  onBrowseProfiles?: () => void;
  browseDisabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="mpmissionsRelative">Mission folder (relative)</Label>
        <div className="flex gap-2">
          <Input
            id="mpmissionsRelative"
            placeholder="mpmissions/dayzOffline.chernarusplus"
            {...form.register("mpmissionsRelative")}
          />
          {onBrowseMissions ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onBrowseMissions}
              disabled={browseDisabled}
              title="Browse remote"
            >
              <FolderSearch className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profilesRelative">Profiles folder (relative)</Label>
        <div className="flex gap-2">
          <Input
            id="profilesRelative"
            placeholder="profiles"
            {...form.register("profilesRelative")}
          />
          {onBrowseProfiles ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onBrowseProfiles}
              disabled={browseDisabled}
              title="Browse remote"
            >
              <FolderSearch className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type BrowsePurpose = "serverRoot" | "missions" | "profiles";

const BROWSE_PURPOSE_TO_FIELD: Record<
  BrowsePurpose,
  "remoteRoot" | "mpmissionsRelative" | "profilesRelative"
> = {
  serverRoot: "remoteRoot",
  missions: "mpmissionsRelative",
  profiles: "profilesRelative",
};

/** Minimum fields required to attempt an SFTP connection — shared by
 *  the Test button's error toasts and the browse/browse-disabled
 *  gate so both paths stay in sync. */
function sftpConnectGate(
  v: FormValues,
): { ok: true } | { ok: false; reason: string } {
  if (v.mode !== "sftp") {
    return { ok: false, reason: "SFTP mode required" };
  }
  if (!v.host?.trim() || !v.username?.trim()) {
    return { ok: false, reason: "host and username are required to test" };
  }
  if (v.authType === "privateKey" && !v.privateKeyPath?.trim()) {
    return { ok: false, reason: "private key path is required to test" };
  }
  return { ok: true };
}

function canBrowse(v: FormValues): boolean {
  return sftpConnectGate(v).ok;
}

function TestResultBanner({ result }: { result: ConnectionTestResult }) {
  const ok = result.ok;
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
        ok
          ? "border-severity-success/40 bg-severity-success/10 text-severity-success"
          : "border-severity-error/40 bg-severity-error/10 text-severity-error"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="mt-[1px] h-4 w-4 shrink-0" />
      ) : (
        <XCircle className="mt-[1px] h-4 w-4 shrink-0" />
      )}
      <div className="space-y-1">
        <p className="font-medium">{result.message}</p>
        {result.fingerprint ? (
          <p className="break-all font-mono text-[11px] opacity-80">
            {result.fingerprint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---------- Scan summary ----------

function ScanSummary({
  scan,
  manual,
  onToggleManual,
}: {
  scan: ServerRootScan;
  manual: boolean;
  onToggleManual: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          ok={scan.serverCfgFound}
          label="serverDZ.cfg"
          missingLabel="serverDZ.cfg missing"
        />
        <StatusBadge
          ok={scan.mpmissionsDirExists}
          label={`${scan.missions.length} mission${scan.missions.length === 1 ? "" : "s"}`}
          missingLabel="mpmissions/ not found"
        />
        <StatusBadge
          ok={scan.profileFolders.length > 0}
          label={`${scan.profileFolders.length} profile folder${scan.profileFolders.length === 1 ? "" : "s"}`}
          missingLabel="no profile folders matched"
        />
        <button
          type="button"
          onClick={onToggleManual}
          className="ml-auto text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {manual ? "Use dropdowns" : "Type manually"}
        </button>
      </div>
      {!scan.serverCfgFound ? (
        <p className="text-[11px] text-muted-foreground">
          No <code>serverDZ.cfg</code> / <code>server.cfg</code> at
          this root — the Server Config page will offer to create it
          on first save.
        </p>
      ) : null}
      {!scan.mpmissionsDirExists ? (
        <p className="text-[11px] text-severity-warning">
          <code>mpmissions/</code> doesn't exist at this root — pick
          the server install dir that contains it.
        </p>
      ) : null}
    </div>
  );
}

