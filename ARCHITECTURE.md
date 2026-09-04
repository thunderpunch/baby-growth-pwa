# 宝宝成长记录 — Architecture v3

## 目标

- 录入层保持简单，数据事实保持完整。
- 所有记录使用统一 canonical temporal；UI 不自行发明第二套时间事实。
- `date` 主要承担 IndexedDB 页面/业务归档桶职责；排序、区间、时长、重叠判断优先使用 canonical temporal。
- 可见页面结构尽量由初始 DOM 或单一 controller 直接表达，不靠运行时 bridge、hidden legacy mount 或重复 handler 形成最终布局。
- local-first 数据安全优先于 PWA 安装便利和视觉更新。

## App Shell

顶部栏只承载真正的全局/当前页面操作：

- Today：显示前一天 / 日期 / 后一天 / 今天，因为这些控件直接改变当前记录日。
- History / 档案 / 数据：隐藏全局日期控件，页面使用各自已有的浏览或编辑语义，不显示无效日期选择器。
- 页面标题仍由页面内容区负责，Topbar 不重复制造第二套“历史 / 档案 / 数据”标题。

普通 App 外壳应抑制浏览器式长按/蓝色 tap highlight；真正需要输入、复制、粘贴的控件显式恢复原生能力。

## 模块边界

### `record-model.js`

唯一时间事实模型。

```js
temporal: {
  version: 1,
  zone: "Asia/Singapore", // 示例；实际取设备 IANA timezone
  occurred: { atMs, date, time, offsetMinutes },
  start:    { atMs, date, time, offsetMinutes },
  end:      { atMs, date, time, offsetMinutes },
  wake:     { atMs, date, time, offsetMinutes },
  resleep:  { atMs, date, time, offsetMinutes }
}
```

不同类型只使用相关节点。

`createdAt / updatedAt` 是元数据时间，不是事件发生时间。

`canonicalRecordForExport()` 会删除可从 temporal 推导的旧时间投影。

### `db.js`

持久化规范化边界。

所有 `putRecord()` 在写入 IndexedDB 前调用 `canonicalizeRecord()`；普通录入、睡眠、模板、导入都不能各自决定时间结构。

IndexedDB 当前 `DB_VERSION = 1`，仍使用既有 `date` index。

### `migration-v2.js` / `migration-v3.js`

历史安装升级链。

- v2 迁移仍是旧安装进入当前数据结构所需步骤，不能仅因为文件名旧而删除。
- v3 最终写入 `dataVersion = 3`。
- 迁移与用户编辑分离；结构迁移不得为了“刷新”数据而修改业务 `updatedAt`。

### `app.js`

当前核心 Today / Profile / Context / 通用非 Sleep 记录 controller。

已经从 `app.js` 物理删除：

- 旧 History 全库扫描与渲染；
- 批量补录；
- 旧 v1 JSON 导入导出；
- 旧普通 Sleep 弹窗；
- `day.nightSleep` 写入；
- 重复 Service Worker 注册。

后续仍按职责继续拆分，不把已外移能力重新吸回。

当前 Profile 只维护长期背景：饮食阶段、长期喂养方式、平日/周末主要照护者、长期睡眠环境、当前主要问题，以及基础资料。通常放床、入睡耗时、典型小睡、常用哄睡方式不再作为当前手填档案字段。

### `profile-insights.js`

档案页“近期规律”唯一 owner。

- 只在进入档案页时读取最近 14 天范围，不阻塞 Today 首屏；
- 只使用 confirmed / nondeleted Sleep；
- 夜间入睡和夜间主睡优先使用明确 `nightAnchor`；
- 白天小睡和主要入睡方式从近期事实推导；
- 至少 3 个有效样本才展示规律；
- 只读 projection，不把推导结果写回 Profile 或原始记录；
- 禁止 `getAllRecords()` lifetime 扫描。

历史 profile 中旧 `weekday/weekend` 作息字段继续保留在旧版本数据中，仅作为历史兼容事实，新档案不再生成。

### `sleep-v3.js`

Sleep 唯一业务 owner：

- 普通 sleep；
- Good Night；
- Good Morning；
- Wake “属于昨晚 / 属于今晚”关联；
- 昨夜摘要；
- 小睡/夜间/待判断 projection；
- 可选睡眠区域室温 `roomTemperatureC`；
- Sleep 分类不依赖人工维护的 Profile“通常放床时间”。

首页可见结构直接存在于 `index.html`：

`早安 → #lastNightSummary → 晚安 → 当天例外`

`sleep-v3.js` 直接渲染 `#lastNightSummary`；旧 `nightSleepAt / nightWakeAt / nightSleepEntries` 隐藏挂载已经删除，也不再存在 `ensureNightCard()` DOM 兼容逻辑。

### `timeline-v3.js`

当天流水 projection。

- 统一通过 `recordTimelineMs()` 排序；
- 普通 sleep 按开始时间；
- 夜间主睡按最终早安时间进入早安所在日；
- wake 按真实夜醒时间；
- 每次按日 IndexedDB 查询，不逐行 `getRecord()`。

### `history.js`

History 唯一控制器。

当前浏览模式：

- 默认最近 30 个连续自然日；
- 可切换按月；
- 上下月自然跨年；
- 当前年份文案省略年份，非当前年份明确显示；
- 每次只通过 `getRecordsInRange()` / `getDaysInRange()` 读取当前范围；
- 不进行 lifetime `getAllRecords()/getAllDays()`；
- 不再提供重复的“跳到日期”控件；具体日期仍通过历史卡进入 Today，并复用全局 `pageDate`；
- 已删除无实质能力的“批量补录”入口。

### `data-io-v3.js`

JSON / Excel I/O 唯一实现。

当前：

- JSON schema `1.2.0`
- `dataVersion = 3`
- `timeModelVersion = 1`
- JSON 只输出 canonical temporal，不输出可推导旧时间字段
- Excel 从 canonical temporal 生成
- 导入最终经过 `putRecord()` 再次规范化
- 正常 Today 首屏不等待 Data I/O 模块
- 系统文件分享必须先通过 `navigator.canShare({files})` 验证，不假设存在 `navigator.share` 就等于支持文件附件
- 正式分享 / 保存格式只维护标准 `.json`；不创建第二种 `text/plain` 附件格式
- 浏览器不支持文件型 Web Share 时明确回退为标准 JSON 文件保存

对外 JSON 协议只以 `JSON_DATA_SCHEMA.md` 为权威文档；不要再维护第二份重复协议说明。

### `export-ipad.js`

feature boot / hydration 协调入口。

- 静态 UI 先显示；
- feature 模块并行加载；
- migration 完成后再启动依赖 canonical 数据的 Sleep / Timeline projection；
- History controller 启动时注册，但只有进入 History 后查询范围数据；
- Data I/O 空闲加载或进入 Data 页时加载；
- 不存在 sleep DOM bridge。

### `update-coordinator.js`

Service Worker 注册和版本切换唯一 owner。

`app.js` 不允许再次注册 Service Worker。

在线时页面/代码资源优先网络新鲜度，离线回退缓存；稳定图标等资源可 cache-first。

## `date` 与真实时间

`date` 保留用于 IndexedDB date index 和业务日归档。

例如：

```text
9/2 19:42 晚安
9/3 05:35 早安
```

夜间主睡：

```js
date: "2026-09-03"
nightKey: "2026-09-03"
temporal.start.atMs // 9/2 19:42
temporal.end.atMs   // 9/3 05:35
```

流水使用真实 temporal，所以显示在 05:35，而不是按照记录创建时间或数组位置。

## 兼容字段策略

IndexedDB 中暂时仍可能存在 `time/startTime/endTime/startDateTime/endDateTime/wakeTime/resleepTime` 等兼容投影，用于当前 UI 与旧数据升级。

这些字段由 `db.putRecord()` / `canonicalizeRecord()` 从 temporal 推导，不是权威事实。

JSON 1.2 不输出这些重复字段。

后续删除兼容投影的前提是所有运行模块都已经只读取 canonical temporal，并且历史安装迁移路径有回归覆盖。

## 文档边界

- `AGENTS.md`：项目原则、用户长期偏好、开发门禁。
- `ARCHITECTURE.md`：本文件，当前代码/模块结构。
- `JSON_DATA_SCHEMA.md`：JSON 协议唯一权威说明。
- `MAINTENANCE.md`：清理计划、技术债、Git 历史策略。
- `TESTING.md`：发布前验证策略。
- `SECURITY.md`：local-first 与 Web 安全边界。

任何架构或协议改动都必须同步更新对应权威文档，避免聊天记忆成为唯一信息源。