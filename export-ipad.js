import "./icon-theme.js";
import "./profile-save-guard.js";
import "./baby-name.js";
import "./time-behavior.js";
import "./recent-milk-template.js";
import "./update-coordinator.js";
import "./gesture-guard.js";
import "./remote-quick-config.js";
import {runDataMigrationV3} from "./migration-v3.js";

const layoutFix=document.createElement("link");
layoutFix.rel="stylesheet";
layoutFix.href=new URL("./layout-fix.css?v=1.1.8",import.meta.url).href;
layoutFix.dataset.tabletLayout="1.1.8";
document.head.appendChild(layoutFix);

// Keep the legacy night-sleep card invisible from first module execution. The bridge only
// detaches approved visible widgets; it no longer owns timeline/data behavior.
const sleepCard=document.getElementById("nightSleepAt")?.closest(".card.pad")||null;
if(sleepCard)sleepCard.style.visibility="hidden";

const migrated=await runDataMigrationV3();
if(migrated){
  location.reload();
}else{
  await import("./sleep-v3.js");
  await import("./sleep-ui-bridge.js");
  await import("./timeline-v3.js");
  await import("./data-io-v3.js");
}
