# 宝宝成长记录 — 代码与仓库维护规范

目标：当前主分支只保留真正参与运行、迁移、验证和维护的内容，避免历史实验代码、重复业务实现和过时文档继续增加认知成本。

## 1. 清理顺序

固定顺序：

1. 删除确定不可达的旧实现和旧资源；
2. 消除仍在运行的兼容层；
3. 拆分/收敛过大的核心模块；
4. 合并重复样式和工具函数；
5. 功能、迁移、备份都稳定后，再考虑重写 Git 历史。

不要为了目录“看起来新”误删仍承担升级职责的迁移文件。

## 2. 当前运行入口

主要入口：

- `index.html`
- `app.js`
- `export-ipad.js`
- `sw.js`

`tests/repository-hygiene.test.mjs` 从运行入口检查 JS 可达性和 CSS 引用，阻止根目录孤儿运行文件继续堆积。

## 3. 已物理删除的历史实现

应保持删除：

- `export-v2.js`
- `json-import-v2.js`
- `sleep-v2.js`
- `sleep-v2.css`
- `sleep-method.js`
- `sleep-ui-bridge.js`
- `icons/baby-neutral.svg`
- 旧 History `renderHistory()`
- History 批量补录 UI / handler
- `app.js` 旧 v1 JSON I/O
- `app.js` 旧普通 Sleep modal
- `app.js` `saveNightSleep()` / `day.nightSleep` 新写入路径
- `app.js` 重复 Service Worker 注册
- `index.html` 隐藏 `nightSleepAt / nightWakeAt / nightSleepEntries`
- `sleep-v3.js` `ensureNightCard()` legacy DOM 适配
- `sleep-v3.css` legacy hidden styles
- 过时且重复的 `DATA_PROTOCOL.md`

旧功能不应通过 hidden DOM 或重复 handler 重新引入。

## 4. 仍必须保留的“旧名字”

### `migration-v2.js`

它仍是旧安装进入当前 v3 数据模型的升级链组成部分。删除条件不是“当前代码已经 v3”，而是明确停止支持对应历史安装，并且已有可靠恢复方案。

### `export-v2.css`

名字旧，但当前 `data-io-v3.js` 仍实际引用。后续整理 Data I/O 时应语义化改名为 `data-io.css`，不是直接删除。

## 5. 当前技术债优先级

### A. 继续拆 `app.js`

`app.js` 已经删除 History / Sleep / Data I/O / SW update 等重复职责，但仍承担：

- Today controller
- 通用非 Sleep 记录弹窗
- Profile
- Context
- 基础导航 / 日期协调

下一步按职责拆，不按行数机械切：

- `today-controller.js`
- `record-dialogs.js`
- `profile-controller.js`
- `context-controller.js`
- `app-shell.js`

拆分时保持数据/service owner 单一，不允许互相直接复制逻辑。

### B. legacy 时间投影

IndexedDB 运行时仍可能保留：

- `time`
- `startTime/endTime`
- `startDateTime/endDateTime`
- `wakeTime/resleepTime`

它们由 canonical temporal 推导，不再进入 JSON 1.2。

只有当所有运行模块都直接读取 canonical temporal 且迁移覆盖充分后，再逐步删除这些兼容投影。

### C. Data I/O 样式命名

将 `export-v2.css` 语义化为 `data-io.css`，同步更新引用和 app shell。

### D. CSS 启动链

`styles.css -> @import styles-base.css` 仍有一次 CSS 依赖串行机会。测量实际 waterfall 后再决定拆成两个 `<link>` 还是合并；不要只为理论优化增加维护复杂度。

## 6. History 当前约束

History 由 `history.js` 唯一负责。

当前：

- 默认最近 30 个连续自然日；
- 可切按月浏览；
- 上下月跨年；
- 当年可省略年份，非当年必须显示年份；
- 范围查询只用 `getRecordsInRange()/getDaysInRange()`；
- 禁止 lifetime `getAllRecords()/getAllDays()`；
- 禁止 `.slice(0,30)` 伪装“最近30天”；
- 不增加重复“跳到日期”控件；
- 批量补录入口已删除。

未来图表必须先定义问题。当前更值得验证的是 30 天睡眠节律图，而不是通用 dashboard。

## 7. Sleep 当前约束

Sleep 由 `sleep-v3.js` 唯一负责。

首页最终 DOM：

`早安 → 昨晚摘要 → 晚安 → 当天例外`

`sleep-v3.js` 直接渲染 `#lastNightSummary`。当前已经没有：

- sleep DOM bridge
- 隐藏 sleep inputs
- 备用生成的 Good Night / Good Morning buttons
- `ensureNightCard()`

禁止以“兼容旧 DOM”为理由重新创建上述结构。

## 8. 文档洁癖

文档也必须收敛。

权威入口：

- `AGENTS.md`：所有 Agent 必读；长期产品/工程原则。
- `ARCHITECTURE.md`：当前实现结构。
- `JSON_DATA_SCHEMA.md`：当前 JSON 协议唯一权威说明。
- `MAINTENANCE.md`：本文件，技术债与清理状态。
- `TESTING.md`：验证策略。
- `SECURITY.md`：安全边界。

不要维护两个重复的协议文档。旧文档若与当前代码矛盾，必须修正、合并或删除。

架构/协议/核心交互/发布机制发生变化时，对应文档必须在同一轮更新。

## 9. Git 历史与仓库体积

当前删除源码并不会立即从 Git 历史移除旧 blob，但现阶段历史主要是小型文本代码，仅为几十 KB 重写 SHA 收益有限。

### 方案 A：稳定里程碑后创建干净主线

适用于最终希望移除早期大量试验提交：

1. 备份当前仓库；
2. 建永久 backup tag 或 archive repo；
3. 确认 Pages、CI、PWA 更新、迁移、JSON 恢复稳定；
4. 确认没有协作者依赖旧 SHA；
5. 创建 orphan branch，仅提交最终文件树；
6. 将 `main` 指向新根提交。

会改变全部历史 SHA，旧 clone 需要重新同步/重克隆。

### 方案 B：`git filter-repo`

仅在历史中存在明显大型二进制、视频、ZIP、数据集等时更有价值。它可以定向清除大对象，但同样重写 SHA。

### `git gc`

主要优化本地对象库。GitHub 远端对象回收由 GitHub 管理，不能替代历史重写。

## 10. 允许重写历史的条件

至少满足：

- canonical 数据模型连续多个版本无迁移事故；
- 临时兼容层已经基本消失；
- 自动验证覆盖启动、数据、History、Sleep、缓存和 repository hygiene；
- 当前 Pages 版本稳定使用；
- JSON 恢复实际验证过；
- 已建立完整仓库备份；
- 没有其它协作者依赖旧 commit SHA / PR。

在此之前，优先优化当前文件树，不为了 Git 历史“好看”承担数据与协作风险。
