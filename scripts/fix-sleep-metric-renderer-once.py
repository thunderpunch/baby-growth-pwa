from pathlib import Path

ROOT=Path('.')

def read(path): return (ROOT/path).read_text(encoding='utf-8')
def write(path,text): (ROOT/path).write_text(text,encoding='utf-8')
def replace_once(path,old,new,label):
    text=read(path)
    count=text.count(old)
    if count!=1:
        raise RuntimeError(f'{label}: expected 1 occurrence in {path}, got {count}')
    write(path,text.replace(old,new,1))

replace_once('sleep-v3.js',
'''function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}\nfunction overlapMinutes(a,b){''',
'''function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}\nfunction setText(node,text){\n  if(node&&node.textContent!==text)node.textContent=text;\n}\nfunction overlapMinutes(a,b){''',
'define sleep metric text helper')

replace_once('tests/sleep-metrics-owner.test.mjs',
'''assert.match(sleep,/function renderSleepMetrics\\(a\\)/,"Sleep owner must render sleep metrics");\nassert.match(sleep,/metricNapCountValue/,"Sleep owner must address stable nap metric IDs");''',
'''assert.match(sleep,/function renderSleepMetrics\\(a\\)/,"Sleep owner must render sleep metrics");\nassert.match(sleep,/function setText\\(node,text\\)\\{[\\s\\S]*?node\\.textContent!==text[\\s\\S]*?node\\.textContent=text[\\s\\S]*?\\}/,"Sleep metric renderer helper must exist and update text idempotently");\nassert.match(sleep,/metricNapCountValue/,"Sleep owner must address stable nap metric IDs");''',
'lock sleep metric helper definition')
