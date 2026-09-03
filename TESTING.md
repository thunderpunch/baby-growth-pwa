# 宝宝成长记录 — 验证与发布规范

目标：尽量让明显回归在 CI 里失败，而不是发布后由用户发现。

原则：每个真实出现过、且可以自动判断的问题，都尽量转成长期执行的 regression / contract。

## 1. 一键验证

Node.js 22 或兼容版本：

```bash
node scripts/verify.mjs
```

成功时：

```text
All pre-release verification checks passed.
```

本地与 GitHub Actions 使用同一命令，不维护第二套发布验证。

## 2. 当前 7 组自动验证

### 1. JavaScript syntax

所有 `.js` 文件按 ES Module 语法解析，防止模板字符串、括号、手工替换等导致启动级 SyntaxError。

### 2. Repository hygiene

`tests/repository-hygiene.test.mjs`

覆盖：

- 已删除旧文件不能重新出现；
- 根目录运行 JS 必须从实际运行入口可达；
- CSS 必须有真实引用；
- 避免实验文件、孤儿模块继续堆积。

### 3. App structure contracts

`tests/app-contract.test.mjs`

`tests/ipad-layout.test.mjs`

`tests/date-picker.test.mjs`

`tests/record-templates.test.mjs`

覆盖：

- DOM ID 不重复；
- Today / History / Sleep 等关键挂载存在；
- 顶部日期控制只在 Today 激活时可见，其它页面不能出现无效全局日期选择器；
- iPad Profile 页面在经典 1024 CSS px 横屏宽度前必须进入安全单列布局，Profile 根容器和主要列必须允许收缩，不能制造页面级横向滚动；
- 自定义日期选择器固定渲染 6 周 / 42 格，5 周月和 6 周月切换不能改变面板高度；
- 日期选择器显示可直接选择的前后月日期，支持 iPad 左右滑动切月，并让上月 / 下月 / 今天动作遵守输入的 min/max；
- 吃奶自动模板只看当天是否已有吃奶，不得被尿布、辅食、睡眠等其它记录阻断；最多回看 3 个自然日并取最近一个“已完成处理”的确认吃奶日期；
- 某来源日仍有未处理吃奶 pending 时不能向后传播，避免只确认部分模板就产生半成品下一日模板；全部确认/跳过后，剩余 confirmed milk 才能成为后续来源；
- 奶和饮食模板策略独立，模板生成不得使用 `getAllRecords()` 全历史扫描，也不得恢复 DOM 监听桥；
- 早安 → 昨夜摘要 → 晚安顺序固定；
- hidden legacy sleep mounts 不允许重新出现；
- `sleep-v3.js` 必须直接渲染 `#lastNightSummary`，不能恢复 `ensureNightCard()` bridge；
- History 批量补录旧 DOM 不允许恢复；
- `app.js` 不允许重新吸收 History、Sleep、Data I/O、SW update 的旧实现；
- 文件选择按钮必须抑制 Android/WebKit 蓝色 tap highlight，并有自己明确的 pressed state；
- JSON 文件分享必须先通过 `navigator.canShare({files})` 验证；不能把“有 navigator.share”误认为“支持文件附件”；
- 当前正式分享/保存格式保持标准 `.json`，不生成第二种 `text/plain` 兼容附件；不支持文件 Web Share 时明确回退到标准文件保存；
- JSON 导出在生成文件前必须执行 stringify → parse → 当前 schema 校验的自检；
- 本地 ESM import 必须指向真实文件；
- Service Worker `APP_SHELL` 中的文件必须真实存在；
- iPad 应用外壳继续抑制普通文本长按 callout，同时输入/显式可复制区域保留原生文本能力。

### 4. Documentation contracts

`tests/documentation-contract.test.mjs`

覆盖：

- `AGENTS.md` 与 README 必须指向权威文档；
- “代码收敛”“部署双门禁”“按自然年完整 JSON 备份”“仓库文档是长期事实源”等规则不能丢失；
- `JSON_DATA_SCHEMA.md` 的 schemaVersion 必须和 `data-io-v3.js` 实际运行版本一致；
- timeModelVersion / canonical temporal 必须有文档；
- 当前 JSON 协议明确只维护当前结构，不恢复旧 schema 迁移兼容；
- 已删除的 `DATA_PROTOCOL.md` 不能作为第二份过时协议重新出现；
- Architecture / Maintenance 不能继续声称已删除 legacy sleep mounts 仍是当前结构。

文档错误会和代码错误一样阻断发布。

### 5. Page-load performance contracts

`tests/performance-contract.test.mjs`

目标是防止结构性性能退化，不追求某台机器上的固定毫秒数。

重点：

- 可并行 feature 不退化成长串 `await import()` waterfall；
- Today 不等待 Data I/O；
- 首屏 CSS 尽早请求；
- Sleep 正常 refresh 不做 lifetime 全库扫描；
- Sleep 不用 `setInterval()` 轮询日期；
- 一次 refresh 只做一次当天 analysis；
- Timeline 一次按日查询，不逐行 `getRecord()`；
- observer 不监听会被自身 projection 修改的深层 DOM；
- 待确认模板只能做有限日期范围查询，不能回到 lifetime `getAllRecords()`；
- 代码类资源在线时优先获取/重新验证网络新版本，离线才回退缓存；
- `home-config.json` 保持 network-first；
- 稳定图标等资源可 cache-first。

### 6. Cross-year History regressions

`tests/history.test.mjs`

覆盖：

- 12 月 → 1 月；
- 1 月 → 前一年 12 月；
- 闰年 2 月；
- 最近30天是连续自然日范围，不是 `.slice(0,30)`；
- History 不允许 `getAllRecords()/getAllDays()` 全库读取；
- 今年年份可省略、非今年必须明确显示；
- 不恢复重复的“跳到日期”控件。

### 7. Temporal model regressions

`tests/record-model.test.mjs`

覆盖：

- 夜间主睡跨午夜，例如 `19:42 → 05:35`；
- 普通小睡流水排序；
- 旧 `date + startTime/endTime` 数据 canonicalize；
- wake/resleep 跨午夜；
- 单点事件统一时间模型；
- 无具体时刻时不虚构排序时间；
- canonicalize 幂等；
- JSON canonical export → import round-trip 不改变真实时间点。

## 3. GitHub Actions 与部署门禁

`.github/workflows/static-check.yml` 在 main push 和 PR 上执行：

```bash
node scripts/verify.mjs
```

只有同一 HEAD 同时满足：

1. `static-check` — `completed / success`
2. `pages build and deployment` — `completed / success`

才允许说“部署完成”。

以下都不算：

- 只提交到 main；
- static-check 还在跑；
- Pages queued；
- Pages in_progress；
- CI success 但 Pages 还是旧 HEAD。

## 4. 改动类型对应验证

### 时间 / Sleep / Wake / Timeline

至少检查：

- 同日；
- 跨午夜；
- 不完整事实；
- 编辑后重新 canonicalize；
- timeline point。

如果 bug 是“这条记录应该显示在几点”，测试直接断言 temporal / `recordTimelineClock()` / `recordTimelineMs()`，不要只测 UI 字符串。

### 待确认模板 / 吃奶自动填充

至少覆盖：

- 当天有已确认吃奶时不生成；
- 当天只有其它类型记录时仍允许生成吃奶模板；
- 昨天无吃奶、前天有吃奶时能找到前天；
- 最多回看 3 个自然日，并正确跨月 / 跨年；
- 多个历史日期都有吃奶时只取最近一个已经完成待确认处理的日期；
- 来源日仍有未处理吃奶 pending 时不能向后传播；
- 来源日 pending 全部确认/跳过后，剩余 confirmed milk 才可向后传播；
- 奶与饮食模板互不阻断；
- 用户已经处理过当天模板后不重复生成；
- 禁止 `getAllRecords()` 与 DOM 事件桥接。

### History

至少覆盖：

- 最近30天范围；
- 月范围；
- 跨年；
- 闰年；
- current-year label；
- 禁止全库扫描；
- 不恢复已经删除的重复控件。

### iPad / 响应式布局 / 日期选择器

至少确认：

- 1024 CSS px 横屏边界；
- Profile / Data 的主要 grid item 都允许 `min-width:0` 收缩；
- 原生表单控件或自定义日期触发器不会撑宽 grid；
- 不用单纯 `overflow-x:hidden` 掩盖本应消除的内容溢出；
- 日历始终保持 6 行，跨月份切换没有高度跳变；
- 相邻月份日期可直接选择；
- iPad 左右滑动可以切月，同时垂直手势不被误判为切月；
- min/max 会禁用完全不可选的相邻月份和不可用的“今天”。

### 模块拆分 / DOM 清理

同时看：

- `app-contract.test.mjs`
- `repository-hygiene.test.mjs`
- `performance-contract.test.mjs`

旧实现被新模块取代后，优先物理删除，再把“不能回来”写进 contract。

### Service Worker / 缓存

必须确认：

- `update-coordinator.js` 仍是注册唯一 owner；
- `APP_SHELL` 没有不存在的文件；
- 页面/业务 JS/CSS 在线时能拿到新版本；
- 离线仍有缓存回退；
- 不依赖人工记忆 bump cache name 才能更新业务代码。

### JSON / Excel / 数据结构

至少确认：

- schemaVersion / timeModelVersion；
- `JSON_DATA_SCHEMA.md` 同步更新；
- canonical round-trip；
- 导出文件先通过当前 schema 自校验；
- 导入幂等；
- 当前协议不重新引入旧 schema/dataVersion 迁移层。

### 架构 / 产品原则 / 发布流程

更新对应仓库文档，并确保 Documentation Contract 仍通过。

聊天中的重要决策如果会影响后续 Agent，不能只留在聊天里。

## 5. 最小人工 Smoke Test

自动测试通过后，涉及交互时仍建议真实 iPad/PWA 与 Android 最小验证：

- 页面能启动，无白屏；
- Today 能看到日期前后切换和“今天”，切到 History / 档案 / 数据后日期控件消失；
- iPad 横屏进入档案页不能横向拖动整个页面；
- 打开日期选择器，在不同月份之间切换时面板高度保持稳定；左右滑动能切月，前后月淡化日期可以直接选择；
- 当天没有吃奶时，昨天没记录但前天有记录，首页应出现来自前天的吃奶待确认模板；当天已有尿布/辅食等其它记录也不能阻止它；
- 只确认一部分吃奶模板后，下一天不能只继承已确认的半套；当天剩余模板全部处理完成后，最终确认事实集合才允许向后传播；
- 新增一条普通记录；
- 睡眠、早安、晚安、夜醒打开/保存；
- History 最近30天与按月切换；
- JSON 导出/导入入口可用；
- Android 点击“选择文件”不出现蓝色 Web 按压前景；
- 支持文件 Web Share 的 Android 可调起系统分享；不支持时明确回退到标准 JSON 文件保存；
- 长按普通 UI 不出现廉价 Web 选择菜单，输入框仍可粘贴；
- PWA 更新后业务 JS/CSS 能看到新版。

人工 smoke 是最后保险，不替代自动 contract。