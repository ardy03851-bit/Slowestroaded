import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";

const license = await readFile(new URL("../node_modules/three/LICENSE", import.meta.url), "utf8");
const result = await build({
  entryPoints: ["src/mods.js"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["safari15", "chrome100", "firefox100"],
  legalComments: "inline",
  banner: { js: `/*! Three.js bundled under the following license:\n${license.trim()}\n*/` },
  write: false,
});
const path = "static/js/mods.v2.js";
await writeFile(path, result.outputFiles[0].text.replace(/[ \t]+$/gm, ""));
console.log(`Built ${path}`);
