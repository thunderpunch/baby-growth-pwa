import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const [js,css]=await Promise.all([
  readFile(path.join(root,"date-picker.js"),"utf8"),
  readFile(path.join(root,"date-picker.css"),"utf8")
]);

// Calendar height must not change between five- and six-week months.
assert.match(js,/const\s+CALENDAR_CELLS\s*=\s*42/,"date picker must render a fixed six-week calendar");
assert.match(js,/for\s*\(let i=0;i<CALENDAR_CELLS;i\+\+\)/,"date picker must render all 42 calendar cells");
assert.match(css,/\.custom-date-grid\{[^}]*grid-template-rows\s*:\s*repeat\(6,42px\)[^}]*min-height\s*:\s*277px/,"desktop/iPad calendar must keep a fixed six-row height");
assert.match(css,/@media\s*\(max-width:560px\)[\s\S]*\.custom-date-grid\{[^}]*grid-template-rows\s*:\s*repeat\(6,40px\)/,"compact calendar must also keep six fixed rows");
assert.doesNotMatch(js,/custom-date-blank/,"variable blank-cell calendar must not return");

// Leading/trailing dates improve cross-month selection without changing layout height.
assert.match(js,/classList\.add\("is-outside-month"\)/,"adjacent-month dates must be rendered explicitly");
assert.match(css,/\.custom-date-day\.is-outside-month\{/,"adjacent-month dates must have a distinct muted style");

// Touch-first iPad navigation and input bounds are part of the picker contract.
assert.match(js,/addEventListener\("touchstart"/,"date picker must support touch swipe navigation");
assert.match(js,/addEventListener\("touchend"/,"date picker must finish touch swipe navigation");
assert.match(js,/Math\.abs\(dx\)<48/,"date picker swipe must use a deliberate horizontal threshold");
assert.match(js,/function\s+monthHasAllowedDate\b/,"date picker must understand whole-month min/max availability");
assert.match(js,/prevButton\.disabled=!monthHasAllowedDate/,"previous-month control must respect input bounds");
assert.match(js,/nextButton\.disabled=!monthHasAllowedDate/,"next-month control must respect input bounds");
assert.match(js,/todayButton\.disabled=!dateAllowed/,"Today action must respect input bounds");

console.log("date picker regression tests passed");
