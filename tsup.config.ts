import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["@astreus-ai/sdk"],
  banner: {
    js: "#!/usr/bin/env node",
  },
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
