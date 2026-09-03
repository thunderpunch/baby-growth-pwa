import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const css=await readFile(path.join(root,"layout-fix.css"),"utf8");

// Classic iPad landscape is 1024 CSS px. Profile must already be in its safe
// single-column layout there; the old 1020px breakpoint left a fragile 4px gap.
assert.match(css,/#profileView,[\s\S]*#profileView \.profile-grid,[\s\S]*#profileView \.right-profile-column[\s\S]*min-width\s*:\s*0[\s\S]*max-width\s*:\s*100%/,"Profile root and major columns must remain shrinkable");
assert.match(css,/@media\s*\(max-width:1100px\)[\s\S]*#profileView \.profile-grid\s*\{[\s\S]*grid-template-columns\s*:\s*minmax\(0,1fr\)!important/,"Profile must stack before the 1024px iPad landscape boundary");

console.log("iPad layout regression tests passed");
