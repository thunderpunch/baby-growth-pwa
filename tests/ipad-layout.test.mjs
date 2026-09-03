import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const css=await readFile(path.join(root,"layout-fix.css"),"utf8");

// Profile is the only desktop page that previously reserved a hard 330px
// secondary track. Wide iPads can remain in two-column mode, so correctness
// must not depend on a viewport breakpoint: both tracks themselves must shrink.
assert.match(css,/#profileView,[\s\S]*#profileView \.profile-grid,[\s\S]*#profileView \.right-profile-column[\s\S]*min-width\s*:\s*0[\s\S]*max-width\s*:\s*100%/,"Profile root and major columns must remain shrinkable");
assert.match(css,/#profileView \.profile-grid\s*\{[\s\S]*grid-template-columns\s*:\s*minmax\(0,1\.2fr\)\s+minmax\(0,\.8fr\)!important/,"Profile two-column mode must use two shrinkable tracks");
assert.doesNotMatch(css,/#profileView \.profile-grid[^}]*minmax\(330px/i,"Profile iPad hardening must not restore a 330px minimum secondary track");
assert.match(css,/@media\s*\(max-width:1100px\)[\s\S]*#profileView \.profile-grid\s*\{[\s\S]*grid-template-columns\s*:\s*minmax\(0,1fr\)!important/,"Profile may stack below 1100px as a layout preference");

console.log("iPad layout regression tests passed");
