# 宝宝成长记录 — 验证与发布规范

这份文档用于减少“发布后再由用户发现问题”的情况。

原则：**每个真实出现过的回归问题，都尽量转成一个以后自动执行的验证项。**

## 1. 发布前一键验证

本机需要 Node.js 22 或兼容版本。

在仓库根目录运行：

```bash
node scripts/verify.mjs
```

成功时最后会输出：

```text
All pre-release verification checks passed.
```

这个命令同时也是 GitHub Actions 使用的标准，不维护第二套 CI 命令。

## 2. 当前自动验证内容

### JavaScript 语法

检查仓库中的所有 `.js` 文件能否按 ES Module 语法解析。

主要防止：

- 手工替换导致括号/模板字符串损坏；
- 发布后浏览器直接因为 SyntaxError 无法启动。

### App Structure Contract

执行：

```bash
node --experimental-default-type=module tests/app-contract.test.mjs
```

当前覆盖：

- `index.html` 不允许出现重复 ID；
- 首页关键挂载点必须存在；
- `app.js` / `export-ipad.js` 必须以 module 加载；
- 初始化入口不能因为数据迁移主动 `location.reload()` 造成二次启动；
- 关键启动模块必须仍在 boot chain；
- 所有本地 ESM import 必须指向真实文件；
- Service Worker `APP_SHELL` 中每个缓存文件都必须真实存在。

特别说明：`cache.addAll()` 只要有一个文件不存在，整个 Service Worker install 就可能失败，所以 APP_SHELL 是发布契约，不是普通列表。

### Temporal Model Regression

执行：

```bash
node --experimental-default-type=module tests/record-model.test.mjs
```

当前覆盖：

- 昨夜睡眠 `19:42 → 05:35` 在早安所在日按 `05:35` 进入流水；
- 普通小睡按睡着时间进入流水；
- 旧版 `date + startTime/endTime` 跨午夜数据迁移正确；
- 夜醒跨午夜后 `resleepDate` 正确；
- 单点事件使用统一时间模型；
- 没有具体时刻的记录不会为了排序虚构时间；
- canonicalize 重复执行保持幂等；
- JSON canonical export → import round-trip 不改变真实时间点。

## 3. GitHub Actions

`.github/workflows/static-check.yml` 在以下情况自动执行：

- push 到 `main`；
- Pull Request。

CI 运行的就是：

```bash
node scripts/verify.mjs
```

**发布判断规则：**

只有同时满足下面两项，才可以说“发布完成”：

1. `static-check` completed / success；
2. `pages build and deployment` completed / success。

只提交到 main、Pages queued、Pages in_progress 都不算部署完成。

## 4. 改动类型 → 必须验证什么

### 修改时间 / 睡眠 / 夜醒 / 流水

至少新增或修改 `tests/record-model.test.mjs`，覆盖：

- 正常同日；
- 跨午夜；
- 不完整记录；
- 旧数据迁移；
- 编辑后重新 canonicalize；
- 流水排序点。

如果 bug 是“某条记录应该出现在几点”，测试必须直接断言 `recordTimelineClock()` 或 `recordTimelineMs()`，不能只测显示字符串。

### 修改启动流程 / 模块拆分

更新 `tests/app-contract.test.mjs`。

重点检查：

- boot module 是否仍能找到；
- import 是否都存在；
- 是否新增不必要的 `location.reload()`；
- 是否产生重复 DOM ID；
- 是否新增运行时 DOM 搬运/重复初始化。

### 修改 Service Worker / 新增删除资源文件

必须运行一键验证，确保 `APP_SHELL` 不含不存在的文件。

更新缓存版本后再发布。

### 修改 JSON / Excel / 数据结构

至少确认：

- schemaVersion / dataVersion 是否需要变化；
- canonical JSON round-trip；
- 旧本地数据迁移幂等；
- migration 只有全部成功后才写版本号；
- migration 不应把结构迁移伪装成用户修改，不随意改 `updatedAt`。

## 5. 最小人工 Smoke Test

自动测试通过后，涉及首页交互时仍建议在真实浏览器做一次最小检查：

1. 刷新首页一次：不应看到多轮布局变化或自动再次刷新；
2. 普通睡眠：弹窗只出现睡着、醒来、入睡方式、备注；
3. 晚安：只记录今晚入睡；
4. 早安：能带出昨晚晚安，并形成完整夜间睡眠；
5. 流水：昨夜睡眠按最终醒来时间排序；
6. 夜醒：昨晚/今晚归属能正确保存；
7. 切换前一天/后一天后，摘要与流水同步更新；
8. PWA 刷新后结构不闪烁、不层层叠加。

人工 smoke 主要验证浏览器 DOM、视觉和真实 IndexedDB 联动，不能替代数据单测；数据单测也不能完全替代浏览器 smoke。

## 6. Bug 修复规则

发现 bug 时不要只改代码：

1. 先定位是数据事实、projection、UI、启动、缓存中的哪一层；
2. 能写自动测试的，先或同时写一个能复现问题的 regression case；
3. 修复后运行 `node scripts/verify.mjs`；
4. 等 CI success；
5. 等 Pages success；
6. 再宣布发布完成。

对于曾经发生过的问题，例如：

- `?～?`；
- 昨夜睡眠跑到流水最后；
- 旧睡眠弹窗抢事件；
- MutationObserver 自触发；
- 页面刷新层层变形；
- migration 后再次 reload；
- Service Worker 缓存引用旧文件；

后续如果可以用纯逻辑/结构契约描述，都应逐步加入自动验证，而不是只留在对话记忆里。
