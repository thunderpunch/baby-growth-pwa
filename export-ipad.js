import {runDataMigrationV3} from "./migration-v3.js";

// The base stylesheet hides .app until html.app-ready is set. Because CSS is render-blocking,
// the browser never paints legacy/default content first and then hides it with JavaScript.
// Keep imports inside the guarded boot so a failed optional module still reaches finally and
// reveals the page instead of leaving the app permanently invisible.
const root=document.documentElement;

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

  // Keep the legacy night-sleep card invisible during the compatibility phase. The bridge only
  // detaches approved visible widgets; it no longer owns timeline/data behavior.
  const sleepCard=document.getElementById("nightSleepAt")?.closest(".card.pad")||null;
  if(sleepCard)sleepCard.style.visibility="hidden";

  // Migration writes canonical v3 records directly. Continue in the same boot instead of
  // reloading the document and starting the whole render pipeline a second time.
  await runDataMigrationV3();
  await import("./sleep-v3.js");
  await import("./sleep-ui-bridge.js");
  await import("./timeline-v3.js");
  await import("./data-io-v3.js");

  // Let synchronous DOM setup and the bridge's first animation-frame pass settle before the
  // first app paint. The background is already visible, so this does not create a white flash.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
}catch(error){
  console.error("App feature boot failed",error);
}finally{
  root.classList.add("app-ready");
}
