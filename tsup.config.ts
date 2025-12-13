import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: false,
  minify: false,
  splitting: false,
  treeshake: true,
  external: [],
  esbuildOptions(options) {
    options.conditions = ["browser", "worker"];
  },
});
