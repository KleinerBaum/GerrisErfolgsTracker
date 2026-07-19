import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const webRoot = fileURLToPath(new URL("../", import.meta.url));

await mkdir(new URL("../public/", import.meta.url), { recursive: true });
await build({
  absWorkingDir: webRoot,
  entryPoints: [
    { in: "widget/index.tsx", out: "widget" },
    { in: "widget/widget.css", out: "widget" },
  ],
  outdir: "public",
  bundle: true,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  format: "esm",
  legalComments: "none",
  minify: true,
  platform: "browser",
  target: "es2022",
});
