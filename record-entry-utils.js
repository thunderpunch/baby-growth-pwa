function clockMinutes(value){
  if(!/^\d{2}:\d{2}$/.test(value||""))return null;
  const [hour,minute]=value.split(":").map(Number);
  return hour*60+minute;
}
export function recordEntryClock(record){
  return record?.time||record?.wakeTime||record?.startTime||record?.temporal?.occurred?.time||record?.temporal?.wake?.time||record?.temporal?.start?.time||"";
}
export function recentConfirmed(records,type,{excludeId="",limit=3}={}){
  return (records||[])
    .filter(record=>record?.type===type&&record.status==="confirmed"&&!record.deleted&&record.id!==excludeId)
    .sort((a,b)=>{
      const clock=recordEntryClock(b).localeCompare(recordEntryClock(a));
      if(clock)return clock;
      return String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||""));
    })
    .slice(0,Math.max(0,limit));
}
export function entryPreview(record,{dietStage="饮食"}={}){
  const time=recordEntryClock(record)||"—";
  if(record?.type==="milk")return {time,main:record.amount?`${record.amount}ml`:"吃奶",sub:record.feedType||""};
  if(record?.type==="diet")return {time,main:[record.dietType||dietStage,record.content].filter(Boolean).join(" · ")||dietStage,sub:record.amount||""};
  if(record?.type==="diaper")return {time,main:`换尿布 · ${record.diaperType||"未选择"}`,sub:[record.stoolColor,record.stoolForm,record.stoolAmount&&`便量${record.stoolAmount}`,record.urineAmount&&`尿量${record.urineAmount}`].filter(Boolean).join(" · ")};
  return {time,main:record?.type||"记录",sub:""};
}
function closeInTime(a,b,maxMinutes){
  const x=clockMinutes(recordEntryClock(a)),y=clockMinutes(recordEntryClock(b));
  if(x==null||y==null)return false;
  const delta=Math.abs(x-y);
  return Math.min(delta,1440-delta)<=maxMinutes;
}
function sameText(a,b){
  const x=String(a||"").trim().toLowerCase(),y=String(b||"").trim().toLowerCase();
  return !x||!y||x===y;
}
export function potentialDuplicate(candidate,records){
  if(!candidate||!["milk","diet","diaper"].includes(candidate.type))return null;
  const peers=(records||[]).filter(record=>record?.type===candidate.type&&record.status==="confirmed"&&!record.deleted&&record.id!==candidate.id&&record.date===candidate.date);
  for(const record of peers){
    if(candidate.type==="milk"){
      if(!closeInTime(candidate,record,20)||!sameText(candidate.feedType,record.feedType))continue;
      const a=Number(candidate.amount),b=Number(record.amount);
      if(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)>20)continue;
      return record;
    }
    if(candidate.type==="diet"){
      if(!closeInTime(candidate,record,20))continue;
      if(!sameText(candidate.dietType,record.dietType)||!sameText(candidate.content,record.content))continue;
      return record;
    }
    if(candidate.type==="diaper"){
      if(closeInTime(candidate,record,15)&&sameText(candidate.diaperType,record.diaperType))return record;
    }
  }
  return null;
}
