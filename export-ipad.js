import "./icon-theme.js";
import "./profile-save-guard.js";
import "./baby-name.js";
import "./time-behavior.js";
import "./recent-milk-template.js";
import "./update-coordinator.js";
import "./gesture-guard.js";
import "./remote-quick-config.js";
import {runDataMigrationV3} from "./migration-v3.js";

// app.js and the feature modules still initialize asynchronously. Keep that work off-screen
// and reveal the page once the final DOM is ready, so users never see intermediate layouts.
const root=document.documentElement;
const previousVisibility=root.style.visibility;
root.style.visibility="hidden";

const layoutFix=document.createElement("link");
layoutFix.rel="stylesheet";
layoutFix.href=new URL("./layout-fix.css?v=1.1.8",import.meta.url).href;
layoutFix.dataset.tabletLayout="1.1.8";
document.head.appendChild(layoutFix);

// Keep the legacy night-sleep card invisible during the compatibility phase. The bridge only
// detaches approved visible widgets; it no longer owns timeline/data behavior.
const sleepCard=document.getElementById("nightSleepAt")?.closest(".card.pad")||null;
if(sleepCard)sleepCard.style.visibility="hidden";

try{
  // Migration writes the canonical v3 records directly. A full page reload is unnecessary:
  // modules imported below read the freshly migrated IndexedDB state.
  await runDataMigrationV3();
  await import("./sleep-v3.js");
  await import("./sleep-ui-bridge.js");
  await import("./timeline-v3.js");
  await import("./data-io-v3.js");

  // Let synchronous DOM setup from the imported modules settle, then paint exactly once.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
}finally{
  root.style.visibility=previousVisibility;
}
