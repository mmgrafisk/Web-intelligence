import { cp, mkdir, rm } from "node:fs/promises";

import { build } from "esbuild";

const outputDirectory = new URL("./dist/", import.meta.url);

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });

await build({
  bundle: true,
  entryPoints: {
    options: "src/options.ts",
    popup: "src/popup.ts",
    "service-worker": "src/service-worker.ts",
  },
  format: "esm",
  minify: false,
  outdir: "dist",
  sourcemap: true,
  target: "chrome120",
});

await Promise.all(
  ["manifest.json", "options.html", "popup.html"].map((file) =>
    cp(
      new URL(`./src/${file}`, import.meta.url),
      new URL(file, outputDirectory),
    ),
  ),
);
