import { lazy, Suspense } from "react";

import { useUIStore } from "@/stores/uiStore";

// Monaco ships ~2MB; lazy-load it so the initial bundle stays light.
const Editor = lazy(() =>
  import("@monaco-editor/react").then((m) => ({ default: m.Editor })),
);

interface Props {
  value: string;
  language?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  height?: string | number;
}

export function MonacoXmlViewer({
  value,
  language = "xml",
  readOnly = true,
  onChange,
  height = "100%",
}: Props) {
  const theme = useUIStore((s) => s.theme);
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Loading editor…
        </div>
      }
    >
      <Editor
        height={height}
        language={language}
        value={value}
        theme={theme === "dark" ? "vs-dark" : "light"}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 12,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          wordWrap: "on",
          renderLineHighlight: "all",
          automaticLayout: true,
        }}
        onChange={(v) => {
          if (onChange && typeof v === "string") onChange(v);
        }}
      />
    </Suspense>
  );
}
