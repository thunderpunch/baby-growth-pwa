import {runDataMigrationV3} from "./migration-v3.js";

// Progressive boot: the static/default UI remains visible while local data and feature modules
// initialize. Feature modules update the existing DOM in place. Never blank the whole app during
// boot; a partially hydrated page is preferable to default -> blank -> real-content flashing.
try{
  await import("./icon-theme.js");
  await import("./profile-save-guard.js");
  await import("./baby-name.js");
  await import("./time-behavior.js");
  await import("./recent-milk-template.js");
  await import("./update-coordinator.js");
  await import("./gesture-guard.js");
  await import("./remote-quick-config.js");

  const layoutFix=document.createElement("link");
  layoutFix.rel="stylesheet";
  layoutFix.href=new URL("./layout-fix.css?v=1.1.8",import.meta.url).href;
  layoutFix.dataset.tabletLayout="1.1.8";
  document.head.appendChild(layoutFix);

  await runDataMigrationV3();
  await import("./sleep-v3.js");
  await import("./sleep-ui-bridge.js");
  await import("./timeline-v3.js");
  await import("./data-io-v3.js");
}catch(error){
  console.error("App feature boot failed",error);
}
