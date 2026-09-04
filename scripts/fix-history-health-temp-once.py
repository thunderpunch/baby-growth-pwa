from pathlib import Path

def patch(path,old,new):
    p=Path(path); text=p.read_text(encoding='utf-8')
    if text.count(old)!=1: raise RuntimeError(f'{path}: expected one match, got {text.count(old)}')
    p.write_text(text.replace(old,new,1),encoding='utf-8')

patch('history.js',
'  const temperatures=health.map(record=>Number(record.temperature)).filter(Number.isFinite);',
'  const temperatures=health.map(record=>String(record.temperature??"").trim()).filter(Boolean).map(Number).filter(Number.isFinite);')

p=Path('tests/history.test.mjs'); text=p.read_text(encoding='utf-8')
needle='assert.equal(summary.maxTemperature,38.2);\n'
addition='''assert.equal(summary.maxTemperature,38.2);\nconst healthWithoutTemperature=summarizeHistoryDay("2026-09-04",[{id:"h2",date:"2026-09-04",type:"health",status:"confirmed",deleted:false,time:"20:00",temperature:"",symptoms:"鼻塞"}],null);\nassert.equal(healthWithoutTemperature.healthCount,1);\nassert.equal(healthWithoutTemperature.maxTemperature,null,"blank temperature must not become a fake 0℃ maximum");\n'''
if text.count(needle)!=1: raise RuntimeError('history health regression marker mismatch')
p.write_text(text.replace(needle,addition,1),encoding='utf-8')
print('History health summary edge fixed.')
