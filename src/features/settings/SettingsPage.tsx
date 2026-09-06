import { Settings as SettingsIcon } from "lucide-react";

import { getAllAddons } from "@/addons";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAddonsStore } from "@/stores/addonsStore";
import { useUIStore } from "@/stores/uiStore";

export function SettingsPage() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={SettingsIcon}
        title="Preferences"
        description="App-wide preferences: appearance, activated modules."
      />
      <div className="space-y-6 overflow-y-auto p-6">

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>Dark mode is the default.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <Label htmlFor="dark-mode">Dark mode</Label>
          <Switch
            id="dark-mode"
            checked={theme === "dark"}
            onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
          />
        </CardContent>
      </Card>

      <AddonsCard />
      </div>
    </div>
  );
}

function AddonsCard() {
  const addons = getAllAddons();
  const enabled = useAddonsStore((s) => s.enabled);
  const setEnabled = useAddonsStore((s) => s.setEnabled);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">Modules</CardTitle>
        <CardDescription>
          Optional feature bundles. Toggle any module on or off — the
          choice is stored locally on this install.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {addons.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No modules registered.
          </div>
        ) : (
          addons.map((addon) => {
            const isOn = enabled[addon.id] === true;
            return (
              <div
                key={addon.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`addon-${addon.id}`} className="text-sm">
                      {addon.name}
                    </Label>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {addon.description}
                  </p>
                </div>
                <Switch
                  id={`addon-${addon.id}`}
                  checked={isOn}
                  onCheckedChange={(v) => setEnabled(addon.id, v)}
                />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
