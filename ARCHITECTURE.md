# 宝宝成长记录 — Architecture v3

## 目标

- 录入层保持简单，数据事实保持完整。
- 所有记录使用同一套时间事实模型，不再由每个 UI 模块自行解释时间。
- `date` 只承担 IndexedDB 的“页面/业务归档桶”索引职责；排序、区间计算、重叠判断使用 canonical temporal 数据。
- 迁移与用户编辑分离：结构迁移不得修改 `updatedAt`。

## 模块边界

### `record-model.js`
唯一的记录时间模型。

所有记录写入后都包含：

```js
temporal: {
  version: 1,
  zone: "Asia/Singapore", // 示例，实际取设备 IANA timezone
  occurred: { atMs, date, time, offsetMinutes }, // 单点事件
  start:    { atMs, date, time, offsetMinutes }, // 睡眠
  end:      { atMs, date, time, offsetMinutes },
  wake:     { atMs, date, time, offsetMinutes }, // 夜醒
  resleep:  { atMs, date, time, offsetMinutes }
}
```

不同记录只使用与自己有关的节点。

`createdAt / updatedAt` 是记录元数据时间，不是事件发生时间。

### `db.js`
持久化边界。

所有 `putRecord()` 在写入 IndexedDB 前调用 `canonicalizeRecord()`。因此普通录入、睡眠、模板、导入都不再各自决定数据结构。

IndexedDB `DB_VERSION` 仍为 1；当前没有新增 object store/index。

### `migration-v3.js`
内容数据版本：`dataVersion = 3`。

- 先完成 v2 睡眠迁移。
- 再为所有历史记录补齐 canonical temporal。
- 完成全部记录后才写入 `dataVersion = 3`。
- 不修改业务记录的 `updatedAt`。

### `sleep-v3.js`
睡眠业务与录入 UI：普通睡眠、晚安、早安、夜醒关联、昨夜摘要。

它仍保留 `startDateTime/endDateTime` 等兼容投影供当前 UI 使用，但这些字段已经不是最终时间事实来源。

### `timeline-v3.js`
当天流水 projection。

- 统一通过 `recordTimelineMs()` 排序。
- 普通睡眠按开始时间。
- 夜间主睡按最终早安时间进入“早安所在日”的流水。
- 夜醒按真实夜醒时间。
- 不再由 `sleep-ui-bridge` 修正排序。

### `sleep-ui-bridge.js`
临时兼容层，只负责把旧 `app.js` 夜间睡眠卡里的可见节点移动到已确认的最终布局。

它不读写数据、不做统计、不排序流水。

### `data-io-v3.js`
统一数据 I/O：

- JSON schema `1.2.0`
- `dataVersion = 3`
- JSON 只输出 canonical temporal，不输出可推导的旧时间字段。
- Excel 由 canonical temporal 生成。
- 导入经过 `putRecord()` 再次规范化。

## `date` 与真实时间的区别

`date` 目前保留是因为 IndexedDB 已有 `date` index，并且页面按日读取。

它表示“这条记录属于哪个页面/业务日”，不代表唯一真实发生时间。

例如：

```text
9/2 19:42 晚安
9/3 05:35 早安
```

夜间睡眠：

```js
date: "2026-09-03"
nightKey: "2026-09-03"
temporal.start.atMs // 9/2 19:42 的真实时间点
temporal.end.atMs   // 9/3 05:35 的真实时间点
```

当天流水使用 `temporal.end.atMs`，因此显示在 05:35，而不是页面最后或 19:42。

## 兼容字段策略

当前 `app.js` 仍使用 `time/startTime/endTime/wakeTime` 等字段，因此 `db.putRecord()` 会从 canonical temporal 生成这些兼容投影。

JSON 1.2.0 不再输出这些重复字段。

待 UI 稳定后的下一阶段可删除：

- `app.js` 内旧 sleep modal 分支
- `day.nightSleep` 相关死代码
- legacy 时间字段读取
- `sleep-ui-bridge.js`

届时可以把 `app.js` 再拆为：`today-controller / record-dialogs / history / profile / context`，而无需再次改变数据模型。
