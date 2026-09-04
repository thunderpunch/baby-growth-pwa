import {getRecord,getRecordsByDate,putDay,putRecord} from "./db.js";

const MILK_LOOKBACK_DAYS=3;

function parseDateKey(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||""))return null;
  const [year,month,day]=value.split("-").map(Number);
  const date=new Date(year,month-1,day,12,0,0,0);
  return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?date:null;
}
export function shiftDateKey(value,days){
  const date=parseDateKey(value);
  if(!date)return "";
  date.setDate(date.getDate()+days);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
export function recentDateKeys(dateKey,days=MILK_LOOKBACK_DAYS){
  return Array.from({length:Math.max(0,days)},(_,index)=>shiftDateKey(dateKey,-index-1));
}
function confirmedOfType(records,type){
  return records.filter(record=>!record.deleted&&record.status==="confirmed"&&record.type===type);
}
function unresolvedPendingOfType(records,type){
  return records.filter(record=>!record.deleted&&record.status==="pending"&&record.type===type);
}
export function settledConfirmedOfType(records,type){
  const confirmed=confirmedOfType(records,type);
  if(!confirmed.length||unresolvedPendingOfType(records,type).length)return [];
  return confirmed;
}
function isTemplate(record,type){
  return record?.type===type&&(
    record.source==="recent_milk_template"||record.source==="previous_day_template"||record.templateSourceId
  );
}
function isUserProcessedMilkTemplate(record){
  if(!isTemplate(record,"milk"))return false;
  if(record.status==="confirmed")return true;
  return !!record.deleted&&record.deleteReason!=="template_source_changed";
}
function hasProcessedTemplate(records,type){
  return records.some(record=>record?.type===type&&(
    (isTemplate(record,type)&&record.status==="pending"&&!record.deleted)||
    record.source==="recent_milk_template"||record.source==="previous_day_template"
  ));
}
async function markGenerated(day,type,sourceDate,nowISO){
  day.templateGeneratedTypes={...(day.templateGeneratedTypes||{}),[type]:true};
  day.templateGeneratedFromByType={...(day.templateGeneratedFromByType||{}),[type]:sourceDate||null};
  day.updatedAt=nowISO();
  await putDay(day);
}
async function findNearestSettledConfirmed(dateKey,type,maxDays){
  for(const sourceDate of recentDateKeys(dateKey,maxDays)){
    const records=await getRecordsByDate(sourceDate,{includeDeleted:true});
    const confirmed=settledConfirmedOfType(records,type);
    if(confirmed.length)return {sourceDate,records:confirmed};
  }
  return null;
}
export function milkTemplateProjection(source,sourceDate){
  return {
    templateSourceId:source.id,
    templateSourceDate:sourceDate,
    time:source.time||"",
    amount:source.amount||"",
    feedType:source.feedType||""
  };
}
function sameMilkProjection(record,projection){
  return record.templateSourceId===projection.templateSourceId&&
    record.templateSourceDate===projection.templateSourceDate&&
    (record.time||"")===(projection.time||"")&&
    (record.amount||"")===(projection.amount||"")&&
    (record.feedType||"")===(projection.feedType||"");
}
async function reconcileMilkTemplates({date,day,current,source,nowISO}){
  const existingTemplates=current.filter(record=>isTemplate(record,"milk"));
  if(existingTemplates.some(isUserProcessedMilkTemplate)){
    const sourceDate=existingTemplates.find(record=>record.templateSourceDate)?.templateSourceDate||null;
    await markGenerated(day,"milk",sourceDate,nowISO);
    return;
  }
  if(confirmedOfType(current,"milk").length){
    await markGenerated(day,"milk",null,nowISO);
    return;
  }

  if(!source){
    for(const template of existingTemplates){
      if(template.deleted&&template.deleteReason==="template_source_changed")continue;
      await putRecord({...template,deleted:true,deleteReason:"template_source_changed",updatedAt:nowISO()});
    }
    return;
  }

  const wantedIds=new Set();
  for(const sourceRecord of source.records){
    const id=`tpl:${date}:${sourceRecord.id}`;
    wantedIds.add(id);
    const projection=milkTemplateProjection(sourceRecord,source.sourceDate);
    const existing=await getRecord(id);
    if(existing&&existing.status==="pending"&&!existing.deleted&&sameMilkProjection(existing,projection))continue;
    if(existing&&isUserProcessedMilkTemplate(existing))continue;
    await putRecord({
      ...(existing||{}),
      id,date,type:"milk",status:"pending",source:"recent_milk_template",
      ...projection,
      createdAt:existing?.createdAt||nowISO(),updatedAt:nowISO(),deleted:false,
      deletedAt:null,deleteReason:null
    });
  }

  for(const template of existingTemplates){
    if(wantedIds.has(template.id)||isUserProcessedMilkTemplate(template))continue;
    if(template.deleted&&template.deleteReason==="template_source_changed")continue;
    await putRecord({...template,deleted:true,deleteReason:"template_source_changed",updatedAt:nowISO()});
  }
  await markGenerated(day,"milk",source.sourceDate,nowISO);
}
async function ensureMilkTemplates({date,day,nowISO}){
  const current=await getRecordsByDate(date,{includeDeleted:true});
  if(current.filter(record=>isTemplate(record,"milk")).some(isUserProcessedMilkTemplate)){
    const sourceDate=current.find(record=>isTemplate(record,"milk")&&record.templateSourceDate)?.templateSourceDate||null;
    await markGenerated(day,"milk",sourceDate,nowISO);
    return;
  }
  if(confirmedOfType(current,"milk").length){
    await markGenerated(day,"milk",null,nowISO);
    return;
  }
  const source=await findNearestSettledConfirmed(date,"milk",MILK_LOOKBACK_DAYS);
  await reconcileMilkTemplates({date,day,current,source,nowISO});
}
async function ensureDietTemplates({date,day,dietStage,nowISO}){
  if(day.templateGeneratedTypes?.diet)return;
  /* A legacy day.templateGenerated=true means the old previous-day diet policy
     already ran for this day. Keep that decision while allowing milk to use the
     new independent 3-day policy. */
  if(day.templateGenerated===true){
    await markGenerated(day,"diet",day.templateGeneratedFrom||null,nowISO);
    return;
  }
  const current=await getRecordsByDate(date,{includeDeleted:true});
  if(confirmedOfType(current,"diet").length||hasProcessedTemplate(current,"diet")){
    await markGenerated(day,"diet",null,nowISO);
    return;
  }
  const sourceDate=shiftDateKey(date,-1);
  const sources=confirmedOfType(await getRecordsByDate(sourceDate,{includeDeleted:false}),"diet");
  for(const record of sources){
    const id=`tpl:${date}:${record.id}`;
    if(await getRecord(id))continue;
    await putRecord({
      id,date,type:"diet",status:"pending",source:"previous_day_template",
      templateSourceId:record.id,templateSourceDate:sourceDate,
      time:record.time||"",dietType:dietStage,content:"",amount:"",
      createdAt:nowISO(),updatedAt:nowISO(),deleted:false
    });
  }
  await markGenerated(day,"diet",sources.length?sourceDate:null,nowISO);
}
export async function ensureRecordTemplates({date,day,dietStage,nowISO}){
  await ensureMilkTemplates({date,day,nowISO});
  await ensureDietTemplates({date,day,dietStage,nowISO});
}
export function templateSourceLabel(sourceDate,targetDate){
  if(!sourceDate||!targetDate)return "近期记录";
  const source=parseDateKey(sourceDate),target=parseDateKey(targetDate);
  if(!source||!target)return "近期记录";
  const days=Math.round((target-source)/86400000);
  if(days===1)return "昨天";
  if(days===2)return "前天";
  if(days===3)return "大前天";
  return `${source.getMonth()+1}月${source.getDate()}日`;
}
