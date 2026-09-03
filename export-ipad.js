// Progressive boot: static/default UI stays visible while local data and feature modules hydrate it.
// app-ready is set before any awaited import so the old boot-gating CSS cannot create a blank
// interval while modules or IndexedDB are loading. The CSS gate is now compatibility-only.
document.documentElement.classList.add("app-ready");

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

  const {runDataMigrationV3}=await import("./migration-v3.js");
  await runDataMigrationV3();
  await import("./sleep-v3.js");
  await import("./sleep-ui-bridge.js");
  await import("./timeline-v3.js");
  await import("./data-io-v3.js");
}catch(error){
  console.error("App feature boot failed",error);
}
