from pathlib import Path

root=Path('.')
sleep_path=root/'sleep-v3.js'
test_path=root/'tests/sleep-metrics-owner.test.mjs'

sleep=sleep_path.read_text(encoding='utf-8')

old='import {recentConfirmed} from "./record-entry-utils.js";\n'
new='import {recentConfirmed} from "./record-entry-utils.js";\nimport {isStrictDayNap} from "./record-model.js";\n'
assert old in sleep
sleep=sleep.replace(old,new,1)

old='''function basicClassify(r){\n  if(r.nightAnchor)return {kind:"night",confidence:1};\n  const mins=duration(r);if(mins==null)return {kind:"uncertain",confidence:0};\n  const sm=minuteOf(tpart(r.startDateTime)),em=minuteOf(tpart(r.endDateTime)),cross=dpart(r.startDateTime)!==dpart(r.endDateTime);\n  if(cross&&mins>=120)return {kind:"night",confidence:.98};\n  if(mins>=300&&(sm>=17*60||em<=10*60))return {kind:"night",confidence:.94};\n  if(!cross&&mins<=210&&sm>=6*60&&em<=18*60+30)return {kind:"nap",confidence:.96};\n  if(!cross&&mins<=150&&sm>=7*60&&em<=20*60)return {kind:"nap",confidence:.86};\n  return {kind:"uncertain",confidence:.45};\n}\n'''
new='''function basicClassify(r){\n  if(r.nightAnchor)return {kind:"night",confidence:1};\n  const mins=duration(r);if(mins==null)return {kind:"uncertain",confidence:0};\n  const sm=minuteOf(tpart(r.startDateTime)),em=minuteOf(tpart(r.endDateTime)),cross=dpart(r.startDateTime)!==dpart(r.endDateTime);\n  if(cross&&mins>=120)return {kind:"night",confidence:.98};\n  if(mins>=300&&(sm>=17*60||em<=10*60))return {kind:"night",confidence:.94};\n  if(isStrictDayNap(r))return {kind:"nap",confidence:.98};\n  return {kind:"uncertain",confidence:.45};\n}\n'''
assert old in sleep
sleep=sleep.replace(old,new,1)

old='''function refreshAppDay(){\n  const pageDate=$("pageDate");\n  if(pageDate)pageDate.dispatchEvent(new Event("change",{bubbles:true}));\n  scheduleRefresh(0);\n}\n'''
new='''async function refreshAppDay(){\n  const pageDate=$("pageDate");\n  if(pageDate)pageDate.dispatchEvent(new Event("change",{bubbles:true}));\n  const revision=++refreshRevision;\n  clearTimeout(refreshTimer);\n  await refreshAll(revision);\n}\n'''
assert old in sleep
sleep=sleep.replace(old,new,1)

sleep=sleep.replace('async function persistOrdinary(c){await putRecord(c);hideModal();refreshAppDay();showToast("睡眠已保存");}',
                    'async function persistOrdinary(c){await putRecord(c);hideModal();await refreshAppDay();showToast("睡眠已保存");}')
sleep=sleep.replace('  hideModal();refreshAppDay();showToast("重叠睡眠已合并");',
                    '  hideModal();await refreshAppDay();showToast("重叠睡眠已合并");')
sleep=sleep.replace('  await putRecord(record);hideModal();refreshAppDay();showToast(old.id?"晚安已更新":"晚安已记录");',
                    '  await putRecord(record);hideModal();await refreshAppDay();showToast(old.id?"晚安已更新":"晚安已记录");')
sleep=sleep.replace('  await putRecord(record);hideModal();refreshAppDay();showToast(record.endDateTime?"早安已记录":"夜间睡眠已保存");',
                    '  await putRecord(record);hideModal();await refreshAppDay();showToast(record.endDateTime?"早安已记录":"夜间睡眠已保存");')

# Clean an unrelated stale fallback while this owner is open: only wakeNightKey belongs here.
sleep=sleep.replace('function selectedWakeNightKey(){return document.querySelector("#wakeNightChoice [data-wake-night-key].active")?.dataset.sleepV3Method||document.querySelector("#wakeNightChoice [data-wake-night-key].active")?.dataset.wakeNightKey||"";}',
                    'function selectedWakeNightKey(){return document.querySelector("#wakeNightChoice [data-wake-night-key].active")?.dataset.wakeNightKey||"";}')

sleep_path.write_text(sleep,encoding='utf-8')

test=test_path.read_text(encoding='utf-8')
needle='assert.match(sleep,/function renderSleepMetrics\\(a\\)/,"Sleep owner must render sleep metrics");\n'
insert='''assert.match(sleep,/import \\{isStrictDayNap\\} from "\\.\\/record-model\\.js"/,"Today sleep metrics must reuse the canonical strict-day-nap classifier");\nassert.match(sleep,/if\\(isStrictDayNap\\(r\\)\\)return \\{kind:"nap",confidence:\\.98\\}/,"Today nap classification must flow through isStrictDayNap");\nassert.match(sleep,/async function refreshAppDay\\(\\)[\\s\\S]*?await refreshAll\\(revision\\)/,"sleep writes must synchronously hand off to the Sleep owner refresh rather than rely on a timer");\nassert.match(sleep,/persistOrdinary\\(c\\)[\\s\\S]*?await refreshAppDay\\(\\)/,"ordinary sleep save must await sleep metric refresh");\n'''
assert needle in test
test=test.replace(needle,insert+needle,1)
test_path.write_text(test,encoding='utf-8')
