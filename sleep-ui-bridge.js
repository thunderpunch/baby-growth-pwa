const $=id=>document.getElementById(id);

// Temporary compatibility adapter: app.js still owns hidden legacy night-sleep fields.
// The visible sleep widgets are direct siblings in sidecol; behavior belongs to sleep-v3.
function detachSleepWidgets(){
  const legacyInput=$("nightSleepAt");
  const legacyCard=legacyInput?.closest(".card.pad");
  const sidecol=legacyCard?.parentElement;
  const entries=$("nightSleepEntries");
  const summary=$("lastNightSummary");
  const morning=entries?.querySelector("[data-night-morning]");
  const goodnight=entries?.querySelector("[data-night-goodnight]");
  if(!legacyCard||!sidecol||!morning||!summary||!goodnight)return false;

  if(morning.parentElement!==sidecol)sidecol.insertBefore(morning,legacyCard);
  if(summary.parentElement!==sidecol)sidecol.insertBefore(summary,legacyCard);
  if(goodnight.parentElement!==sidecol)sidecol.insertBefore(goodnight,legacyCard);
  legacyCard.classList.add("sleep-v3-legacy-card");
  legacyCard.style.display="none";
  return true;
}

function init(){
  let attempts=0;
  const attach=()=>{
    if(detachSleepWidgets()||++attempts>=12)return;
    requestAnimationFrame(attach);
  };
  attach();
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
