import "./icon-theme.js";
import "./profile-save-guard.js";
import "./baby-name.js";
import "./time-behavior.js";
import "./recent-milk-template.js";
import "./update-coordinator.js";
import "./gesture-guard.js";
import "./remote-quick-config.js";
import {runDataMigrationV2} from "./migration-v2.js";

const layoutFix=document.createElement("link");
layoutFix.rel="stylesheet";
layoutFix.href=new URL("./layout-fix.css?v=1.1.8",import.meta.url).href;
layoutFix.dataset.tabletLayout="1.1.8";
document.head.appendChild(layoutFix);

// The legacy markup is replaced by the sleep module. Keep the card invisible while
// migration/modules initialize so refresh does not visibly step through old -> v3 -> bridge layouts.
const sleepCard=document.getElementById("nightSleepAt")?.closest(".card.pad")||null;
if(sleepCard)sleepCard.style.visibility="hidden";

const migrated=await runDataMigrationV2();
if(migrated){
  location.reload();
}else{
  await import("./sleep-v3.js");
  await import("./sleep-ui-bridge.js");
  if(sleepCard)sleepCard.style.removeProperty("visibility");
  await import("./json-import-v2.js");
  await import("./export-v2.js");
}
