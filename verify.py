from pathlib import Path
import json, sys

root=Path(__file__).parent
required=[
    "index.html","styles.css","app.js","db.js","sw.js",
    "manifest.webmanifest","README.md","DATA_PROTOCOL.md",
    "icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png",
    "SECURITY.md","robots.txt",".nojekyll"
]

missing=[x for x in required if not (root/x).exists()]
if missing:
    print("缺失文件:")
    for x in missing: print(" -",x)
    sys.exit(1)

manifest=json.loads((root/"manifest.webmanifest").read_text(encoding="utf-8"))
assert manifest["name"]=="宝宝成长记录"
assert manifest["start_url"]=="./"

html=(root/"index.html").read_text(encoding="utf-8")
for forbidden in ["原型 V","女娃主题 ·","横屏优先 ·"]:
    assert forbidden not in html, f"正式页面仍包含设计标注: {forbidden}"

assert "Content-Security-Policy" in html
assert "noindex,nofollow" in html
app=(root/"app.js").read_text(encoding="utf-8")
assert "MAX_IMPORT_BYTES" in app and "validatePayload" in app
sw=(root/"sw.js").read_text(encoding="utf-8")
assert "url.origin!==self.location.origin" in sw
print("OK: 文件完整、正式页面无原型标注，并包含 Public Hosting 安全加固。")
