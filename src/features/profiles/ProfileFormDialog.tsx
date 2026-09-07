import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useForm, type Resolver, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  ArrowLeftRight,
  CheckCircle2,
  FolderOpen,
  FolderSearch,
  HardDrive,
  Loader2,
  PlugZap,
  RefreshCw,
  Server,
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
    localProfilesRelative: z.string().optional(),
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
    const hasRemote = !!v.host?.trim();
    const hasLocal = !!(v.workDir?.trim() || v.rootPath?.trim());
    if (!hasRemote && !hasLocal) {
      ctx.addIssue({
        code: "custom",
        path: ["host"],
        message: "set Remote (SFTP) or Local server",
      });
      ctx.addIssue({
        code: "custom",
        path: ["workDir"],
        message: "set Remote (SFTP) or Local server",
      });
    }
    if (hasRemote) {
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
  localProfilesRelative: "profiles",
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
        localProfilesRelative:
          profile.paths.localProfilesRelative
          ?? profile.paths.profilesRelative,
        map: profile.map,
        customMapId: profile.customMapId ?? "",
        customMapSizeM: profile.customMapSizeM ?? undefined,
        workDir: profile.workDir ?? profile.local?.rootPath ?? "",
      });
    } else {
      form.reset(DEFAULTS);
    }
  }, [open, profile, form]);

  const authType = form.watch("authType");
  const map = form.watch("map");
  const workDir = form.watch("workDir");
  const host = form.watch("host");
  const hasRemote = !!host?.trim();
  const mpmissionsRelative = form.watch("mpmissionsRelative");
  const profilesRelative = form.watch("profilesRelative");
  const localProfilesRelative = form.watch("localProfilesRelative");
  // Subscribe to SFTP-gate fields so the Browse / Test buttons'
  // `disabled` props re-evaluate as the user types. Without these
  // watches `canBrowse(form.getValues())` reads stale values on
  // re-render and the buttons stay disabled after typing a host.
  const username = form.watch("username");
  const privateKeyPath = form.watch("privateKeyPath");
  const password = form.watch("password");
  const remoteReady = canLoadRemote(
    { host, username, authType, privateKeyPath, password },
    isEdit,
  );

  const [scan, setScan] = useState<ServerRootScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualPaths, setManualPaths] = useState(false);

  const testConnection = useTestConnectionDraft();
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [browsePurpose, setBrowsePurpose] = useState<BrowsePurpose | null>(
    null,
  );
  const [remoteFolders, setRemoteFolders] = useState<string[] | null>(null);
  const [loadingRemoteFolders, setLoadingRemoteFolders] = useState(false);
  // Fingerprint captured by a successful in-modal test. Persisted into
  // the draft on save so Sync / Push don't error with "no host
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
      setRemoteFolders(null);
      setLoadingRemoteFolders(false);
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
    const p = (pathOverride ?? workDir ?? "").trim();
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
          const hostNow = (form.getValues("host") ?? "").trim();
          const name = folderName(profileFolder.relativePath);
          fillIfDefault("localProfilesRelative", name);
          if (!hostNow) {
            fillIfDefault("profilesRelative", name);
          }
        }
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setScanning(false);
    }
  };

  const pickKeyPath = async () => {
    const picked = await openDialog({ directory: false, multiple: false });
    if (typeof picked === "string") form.setValue("privateKeyPath", picked);
  };

  const loadRemoteProfileFolders = async () => {
    const values = form.getValues();
    if (!canLoadRemote(values, isEdit)) {
      toast.error("fill host, username, and auth before loading remote folders");
      return;
    }
    setLoadingRemoteFolders(true);
    try {
      const { draft, secrets } = buildDraftAndSecrets(values);
      const listed = await tauri.sftpBrowseDraft({
        draft,
        secrets,
        existingId: profile?.id ?? null,
        path: "",
      });
      const names = remoteProfileNames(listed.entries);
      setRemoteFolders(names);
      if (names.length === 1) {
        fillIfDefault("profilesRelative", names[0]);
      }
      if (names.length === 0) {
        toast.error("no profile folders found at the server root");
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingRemoteFolders(false);
    }
  };

  const pickWorkDir = async () => {
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked === "string") {
      form.setValue("workDir", picked, { shouldValidate: true });
      void runScan(picked);
    }
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
    const remoteHost = v.host?.trim() ?? "";
    const localFolder = (v.workDir?.trim() || v.rootPath?.trim() || "");
    const asSftp = remoteHost.length > 0;
    const draft: ProfileDraft = {
      name: v.name.trim(),
      mode: asSftp ? "sftp" : "local",
      sftp: asSftp
        ? {
            host: remoteHost,
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
      local: asSftp ? null : { rootPath: localFolder },
      paths: {
        mpmissionsRelative: v.mpmissionsRelative.trim(),
        profilesRelative: asSftp
          ? (folderName(v.profilesRelative) || "profiles")
          : (folderName(v.localProfilesRelative)
            || folderName(v.profilesRelative)
            || "profiles"),
        localProfilesRelative: asSftp
          ? localProfilesAlias(
              folderName(v.profilesRelative) || "profiles",
              folderName(v.localProfilesRelative),
            )
          : null,
      },
      map: v.map,
      customMapId: v.map === "custom" ? v.customMapId?.trim() || null : null,
      customMapSizeM:
        v.map === "custom" && v.customMapSizeM != null
          ? Number(v.customMapSizeM)
          : null,
      workDir: localFolder || null,
      remoteCommands: profile?.remoteCommands ?? null,
    };

    const secrets: ProfileSecrets = {
      password: asSftp && v.authType === "password" ? v.password || null : null,
      keyPassphrase:
        asSftp && v.authType === "privateKey" && v.keyPassphrase
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
    if (values.host?.trim()) {
      const gate = sftpConnectGate(values);
      if (!gate.ok) {
        toast.error(gate.reason);
        return;
      }
    } else if (!values.workDir?.trim()) {
      toast.error("set Local server to test a folder");
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
      <DialogContent className="flex max-h-[90vh] flex-col gap-5 overflow-hidden sm:max-w-5xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="type-section text-base">
            {isEdit ? "Edit server profile" : "New server profile"}
          </DialogTitle>
          <DialogDescription className="type-hint">
            Two places, one workspace. Set Local to test. Set Remote to push.
            Secrets stay in the OS keychain.
          </DialogDescription>
        </DialogHeader>

        <form
          id="profile-form"
          onSubmit={form.handleSubmit(onSubmit)}
          className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1"
          noValidate
        >
          <div className="grid gap-3 sm:grid-cols-2">
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
                  <Label htmlFor="customMapSizeM">Map size (m)</Label>
                  <Input
                    id="customMapSizeM"
                    type="number"
                    min={1}
                    max={50000}
                    placeholder="15360"
                    {...form.register("customMapSizeM")}
                  />
                  <p className="type-hint">
                    World metres. Blank uses Chernarus (15360).
                  </p>
                </div>
              </>
            ) : null}
          </div>

          <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
            <PlacePanel
              icon={HardDrive}
              title="Local server"
              hint="Dedicated folder on this PC. Needed for Sync to local."
            >
              <div className="space-y-1.5">
                <Label htmlFor="workDir">Folder</Label>
                <div className="flex gap-2">
                  <Input
                    id="workDir"
                    placeholder="C:\\path\\to\\dedicated-server"
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void runScan()}
                    disabled={!workDir?.trim() || scanning}
                    title="Re-scan for missions + profiles"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`}
                    />
                  </Button>
                </div>
                <p className="type-hint">
                  The folder with serverDZ.cfg and mpmissions. Not the workspace.
                </p>
                {form.formState.errors.workDir ? (
                  <p className="text-xs text-severity-error">
                    {form.formState.errors.workDir.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="localProfilesRelative">Profiles folder</Label>
                <Input
                  id="localProfilesRelative"
                  placeholder="instances"
                  {...form.register("localProfilesRelative", {
                    setValueAs: (v: string) => folderName(v) || v,
                  })}
                />
                <p className="type-hint">
                  Folder name on this PC. Often instances.
                </p>
                {scan?.profileFolders.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {scan.profileFolders.map((f) => {
                      const name = folderName(f.relativePath);
                      return (
                        <button
                          key={name}
                          type="button"
                          className="type-mono rounded-md border border-border px-2 py-1 hover:border-foreground/30 hover:text-foreground"
                          onClick={() =>
                            form.setValue("localProfilesRelative", name, {
                              shouldValidate: true,
                            })
                          }
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
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
            </PlacePanel>

            <PlaceConnector
              localName={localProfilesRelative || "profiles"}
              remoteName={profilesRelative || "profiles"}
            />

            <PlacePanel
              icon={Server}
              title="Remote"
              hint="SFTP. Needed for Push to Remote."
            >
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="host">Host</Label>
                  <Input
                    id="host"
                    placeholder="server.example.com"
                    {...form.register("host")}
                  />
                  {form.formState.errors.host ? (
                    <p className="text-xs text-severity-error">
                      {form.formState.errors.host.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="port">Port</Label>
                  <Input id="port" type="number" {...form.register("port")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" {...form.register("username")} />
                  {form.formState.errors.username ? (
                    <p className="text-xs text-severity-error">
                      {form.formState.errors.username.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
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
              </div>

              {authType === "password" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="password">
                    Password
                    {isEdit ? (
                      <span className="type-hint font-normal">
                        leave blank to keep
                      </span>
                    ) : null}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    {...form.register("password")}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="privateKeyPath">Private key</Label>
                    <div className="flex gap-2">
                      <Input
                        id="privateKeyPath"
                        {...form.register("privateKeyPath")}
                      />
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
                  <div className="space-y-1.5">
                    <Label htmlFor="keyPassphrase">
                      Key passphrase
                      <span className="type-hint font-normal">optional</span>
                    </Label>
                    <Input
                      id="keyPassphrase"
                      type="password"
                      {...form.register("keyPassphrase")}
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="remoteRoot">Server root</Label>
                <div className="flex gap-2">
                  <Input
                    id="remoteRoot"
                    placeholder="/opt/dayz"
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
                <p className="type-hint">
                  Optional. DayZ install if it is not the SSH home.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profilesRelative">Profiles folder</Label>
                <div className="flex gap-2">
                  <Input
                    id="profilesRelative"
                    placeholder="profiles"
                    {...form.register("profilesRelative", {
                      setValueAs: (v: string) => folderName(v) || v,
                    })}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!remoteReady || loadingRemoteFolders}
                    onClick={() => void loadRemoteProfileFolders()}
                    title={
                      remoteReady
                        ? "List folders on the SFTP server"
                        : "Fill host, username, and auth first"
                    }
                  >
                    {loadingRemoteFolders ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Load folders
                  </Button>
                </div>
                {remoteReady ? (
                  <p className="type-hint">
                    Folder name only. Load folders lists the server root.
                  </p>
                ) : (
                  <p className="type-hint">
                    Disabled until host, username, and auth are set.
                  </p>
                )}
                {remoteFolders?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {remoteFolders.map((name) => (
                      <button
                        key={name}
                        type="button"
                        className="type-mono rounded-md border border-border px-2 py-1 hover:border-foreground/30 hover:text-foreground"
                        onClick={() =>
                          form.setValue("profilesRelative", name, {
                            shouldValidate: true,
                          })
                        }
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </PlacePanel>
          </div>

          <section className="space-y-3 rounded-md border border-border bg-card p-5">
            <div className="space-y-1">
              <h3 className="type-section">Mission</h3>
              <p className="type-hint">
                Same relative path on Local, Remote, and the workspace.
              </p>
            </div>
            {scan && scan.rootExists && !manualPaths ? (
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
                        None detected. Use Type manually.
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
            ) : (
              <RelativePathInputs
                form={form}
                onBrowseMissions={
                  hasRemote ? () => setBrowsePurpose("missions") : undefined
                }
                browseDisabled={!canBrowse(form.getValues())}
              />
            )}
          </section>
        </form>

        {testResult ? <TestResultBanner result={testResult} /> : null}

        <DialogFooter className="shrink-0 sm:justify-between">
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

function sameFolderName(a: string, b: string): boolean {
  const n = (s: string) =>
    s.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
  return n(a) === n(b);
}

function localProfilesAlias(
  canon: string,
  local?: string,
): string | null {
  const t = (local ?? "").trim();
  if (!t || sameFolderName(t, canon)) return null;
  return t;
}

function PlacePanel({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-md border border-border bg-card p-5">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="type-section">{title}</h3>
        </div>
        <p className="type-hint">{hint}</p>
      </header>
      <div className="flex flex-1 flex-col gap-4">{children}</div>
    </section>
  );
}

function PlaceConnector({
  localName,
  remoteName,
}: {
  localName: string;
  remoteName: string;
}) {
  const differ = !sameFolderName(localName, remoteName);
  return (
    <div
      className="flex items-center gap-3 py-1 lg:flex-col lg:justify-center lg:gap-2 lg:px-1 lg:py-0"
      aria-hidden
    >
      <div className="h-px flex-1 bg-border lg:h-16 lg:w-px lg:flex-none" />
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background">
          <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        {differ ? (
          <p className="type-mono max-w-24 text-center">
            {localName} / {remoteName}
          </p>
        ) : null}
      </div>
      <div className="h-px flex-1 bg-border lg:h-16 lg:w-px lg:flex-none" />
    </div>
  );
}

function RelativePathInputs({
  form,
  onBrowseMissions,
  browseDisabled,
}: {
  form: UseFormReturn<FormValues>;
  onBrowseMissions?: () => void;
  browseDisabled?: boolean;
}) {
  return (
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
  );
}

type BrowsePurpose = "serverRoot" | "missions";

const BROWSE_PURPOSE_TO_FIELD: Record<
  BrowsePurpose,
  "remoteRoot" | "mpmissionsRelative"
> = {
  serverRoot: "remoteRoot",
  missions: "mpmissionsRelative",
};

function folderName(path: string | undefined): string {
  const n = (path ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!n) return "";
  return n.split("/").pop() ?? n;
}

const SKIP_REMOTE_DIRS = new Set([
  "mpmissions",
  "keys",
  "addons",
  "battleye",
  "bliss",
  "dta",
  "db",
  "mods",
  ".git",
  ".dzmgr",
]);

const LIKELY_PROFILE_NAMES = new Set(["profiles", "profile", "instances"]);

function remoteProfileNames(
  entries: { name: string; isDir: boolean }[],
): string[] {
  const names = entries
    .filter((e) => e.isDir)
    .map((e) => folderName(e.name))
    .filter((n) => {
      if (!n || n.startsWith(".") || n.startsWith("@")) return false;
      return !SKIP_REMOTE_DIRS.has(n.toLowerCase());
    });
  const likely = names.filter((n) =>
    LIKELY_PROFILE_NAMES.has(n.toLowerCase()),
  );
  const shown = likely.length > 0 ? likely : names;
  return [...new Set(shown)].sort((a, b) => {
    const sa = LIKELY_PROFILE_NAMES.has(a.toLowerCase()) ? 1 : 0;
    const sb = LIKELY_PROFILE_NAMES.has(b.toLowerCase()) ? 1 : 0;
    return sb - sa || a.localeCompare(b);
  });
}

/** Minimum fields required to attempt an SFTP connection — shared by
 *  the Test button's error toasts and the browse/browse-disabled
 *  gate so both paths stay in sync. */
type SftpGateFields = Pick<
  FormValues,
  "host" | "username" | "authType" | "privateKeyPath" | "password"
>;

function sftpConnectGate(
  v: SftpGateFields,
): { ok: true } | { ok: false; reason: string } {
  if (!v.host?.trim()) {
    return { ok: false, reason: "host is required to test SFTP" };
  }
  if (!v.host?.trim() || !v.username?.trim()) {
    return { ok: false, reason: "host and username are required to test" };
  }
  if (v.authType === "privateKey" && !v.privateKeyPath?.trim()) {
    return { ok: false, reason: "private key path is required to test" };
  }
  return { ok: true };
}

function canBrowse(v: SftpGateFields): boolean {
  return sftpConnectGate(v).ok;
}

function canLoadRemote(v: SftpGateFields, isEdit: boolean): boolean {
  if (!sftpConnectGate(v).ok) return false;
  if (v.authType === "privateKey") return true;
  if (v.password?.trim()) return true;
  return isEdit;
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

