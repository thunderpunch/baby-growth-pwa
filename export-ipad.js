import "./icon-theme.js";
import "./profile-save-guard.js";
import "./baby-name.js";
import "./time-behavior.js";
import "./recent-milk-template.js";
import "./update-coordinator.js";
import "./gesture-guard.js";
import "./remote-quick-config.js";
import "./sleep-method.js";
import {runDataMigrationV2} from "./migration-v2.js";

const layoutFix=document.createElement("link");
layoutFix.rel="stylesheet";
layoutFix.href=new URL("./layout-fix.css?v=1.1.8",import.meta.url).href;
layoutFix.dataset.tabletLayout="1.1.8";
document.head.appendChild(layoutFix);

const migrated=await runDataMigrationV2();
if(migrated){
  location.reload();
}else{
  await import("./sleep-v2.js");
  await import("./json-import-v2.js");
  await import("./export-v2.js");
}
