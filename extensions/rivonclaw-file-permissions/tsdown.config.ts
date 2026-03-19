import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    "rivonclaw-file-permissions": "src/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: false,
  external: [/^@mariozechner\/openclaw/],
  noExternal: ["@rivonclaw/plugin-sdk"],
  // Copy openclaw.plugin.json to dist
  onSuccess: async () => {
    const { copyFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    copyFileSync(
      join(process.cwd(), "openclaw.plugin.json"),
      join(process.cwd(), "dist", "openclaw.plugin.json")
    );
  },
});
