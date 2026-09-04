import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const [css,boot,sw]=await Promise.all([
  readFile(path.join(root,"large-text.css"),"utf8"),
  readFile(path.join(root,"export-ipad.js"),"utf8"),
  readFile(path.join(root,"sw.js"),"utf8")
]);

assert.match(css,/body\.large-text\{[^}]*--base-font:20px[^}]*--control-h:56px/,
  "large-text mode must make the base text and controls materially larger");
assert.match(css,/\.large-text \.primary,[\s\S]*\.large-text \.filelabel\{[^}]*height:auto[^}]*min-height:54px[^}]*font-size:18px/,
  "important actions and selectors must scale beyond the old small button text");
assert.match(css,/\.large-text \.rowmain\{[^}]*font-size:20px[^}]*white-space:normal/,
  "large timeline labels must wrap instead of being clipped");
assert.match(css,/\.large-text \.modulecopy b\{[^}]*white-space:normal[^}]*overflow:visible/,
  "large setting labels must remain fully readable");
assert.match(css,/\.large-text \.sleep-v3-time button,[\s\S]*\.large-text \.wake-night-choice button\{[^}]*height:auto[^}]*min-height:52px[^}]*font-size:17px/,
  "sleep choices and actions must participate in large-text mode");
assert.match(css,/\.large-text \.custom-date-trigger:not\(\.custom-date-trigger-compact\)\{height:var\(--control-h\)\}/,
  "form date controls must grow with the large control height");
assert.match(css,/@media\(max-width:560px\)[\s\S]*\.large-text \.quickbar\{grid-template-columns:1fr\}/,
  "large text must adapt the compact layout instead of forcing horizontal clipping");
assert.ok(boot.includes('ensureStylesheet("./large-text.css"'),"large-text.css must load before user settings hydrate the large class");
assert.ok(sw.includes('"./large-text.css"'),"large-text.css must be available in the offline app shell");

console.log("large-text regression tests passed");
