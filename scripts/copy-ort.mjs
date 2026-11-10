// Copies onnxruntime-web's wasm runtime into public/ort/<version>/ so Find's
// embedding worker loads it from this app's own origin instead of jsDelivr
// (see src/lib/search/ort-paths.ts and docs/adr/0012).
//
// Both variants are copied: transformers.js uses the asyncify build, except
// in Safari < 26 without WebGPU, where it uses the plain one. The version is
// part of the path because transformers.js caches the wasm in the Cache API
// keyed by URL: an unversioned URL would keep serving an old runtime to a new
// library after an upgrade.
//
// Runs as predev and prebuild (package.json), so dev, CI, Playwright's
// webServer and Vercel all have the files. public/ort/ is gitignored.
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

// The copy transformers.js itself resolves: its own nested one if npm
// couldn't dedupe, otherwise the top-level one.
const candidates = [
  path.join(root, "node_modules", "@huggingface", "transformers", "node_modules", "onnxruntime-web"),
  path.join(root, "node_modules", "onnxruntime-web"),
];
const packageDir = candidates.find((dir) => existsSync(path.join(dir, "package.json")));
if (!packageDir) {
  console.error("copy-ort: onnxruntime-web is not installed; run npm install first.");
  process.exit(1);
}

// Read with a pattern rather than JSON.parse, whose `any` the linter won't
// let past; package.json's top-level "version" is always the first one.
const manifest = await readFile(path.join(packageDir, "package.json"), "utf8");
const version = /"version"\s*:\s*"([^"]+)"/.exec(manifest)?.[1];
if (version === undefined) {
  console.error(`copy-ort: no version in ${packageDir}/package.json`);
  process.exit(1);
}
const FILES = [
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
];

const outRoot = path.join(root, "public", "ort");
const outDir = path.join(outRoot, version);

// Clear older versions so public/ never carries more than one runtime.
await rm(outRoot, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await Promise.all(FILES.map((file) => cp(path.join(packageDir, "dist", file), path.join(outDir, file))));

console.log(`copy-ort: onnxruntime-web ${version} -> public/ort/${version}/ (${FILES.length.toString()} files)`);
