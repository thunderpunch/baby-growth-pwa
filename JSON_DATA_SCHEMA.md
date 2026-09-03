# 宝宝成长记录 — JSON Data Schema 1.2

这是当前 JSON 导出/恢复协议的唯一权威说明。实现以 `data-io-v3.js`、`record-model.js` 和 `db.js` 为准。

## 1. 版本

当前：

- `appId = "baby-growth-tracker"`
- `schemaVersion = "1.2.0"`
- `dataVersion = 3`
- `timeModelVersion = 1`

导入目前兼容 schema `1.1.0` 和 `1.2.0`；旧数据导入后会经过 canonicalize。

## 2. 顶层结构

```json
{
  "schemaVersion": "1.2.0",
  "dataVersion": 3,
  "timeModelVersion": 1,
  "appId": "baby-growth-tracker",
  "deviceId": "...",
  "exportId": "...",
  "exportedAt": "2026-09-03T09:00:00.000Z",
  "range": {
    "start": "2026-09-01",
    "end": "2026-09-03"
  },
  "profileVersions": [],
  "currentProfileVersionId": "...",
  "days": [],
  "records": []
}
```

`range.start/end` 是包含首尾的本地日历日期范围。

`createdAt / updatedAt / exportedAt` 是元数据时间，不代表事件真实发生时间。

## 3. Canonical temporal

所有事件真实时间统一存在 `record.temporal`：

```json
{
  "version": 1,
  "zone": "Asia/Singapore",
  "occurred": {
    "atMs": 1788400000000,
    "date": "2026-09-03",
    "time": "08:15",
    "offsetMinutes": -480
  },
  "start": null,
  "end": null,
  "wake": null,
  "resleep": null
}
```

不同记录只使用相关节点：

- 单点事件：`occurred`
- `sleep`：`start` / `end`
- `wake`：`wake` / `resleep`

### temporal node

- `atMs`：epoch milliseconds，绝对时间事实。
- `date`：用户所在地看到的 `YYYY-MM-DD`。
- `time`：用户所在地看到的 `HH:mm`；未知可为空字符串。
- `offsetMinutes`：与 JavaScript `Date#getTimezoneOffset()` 同语义的分钟偏移。
- `temporal.zone`：记录时设备的 IANA timezone。

排序、时长、跨午夜判断优先使用 canonical temporal，不使用 `createdAt/updatedAt`。

## 4. `date` 字段

每条 record 仍保留顶层：

```json
"date": "2026-09-03"
```

它主要用于 IndexedDB `date` index 和页面业务归档，不是唯一真实事件时间。

例如：

- 9 月 2 日 19:42 晚安
- 9 月 3 日 05:35 早安

夜间主睡可归档为：

```json
{
  "date": "2026-09-03",
  "nightKey": "2026-09-03",
  "temporal": {
    "start": {"date":"2026-09-02","time":"19:42","atMs":0,"offsetMinutes":-480},
    "end": {"date":"2026-09-03","time":"05:35","atMs":0,"offsetMinutes":-480}
  }
}
```

示例中的 `atMs` 仅为占位；真实导出是实际 epoch milliseconds。

## 5. Record 公共字段

```json
{
  "id": "stable-id",
  "date": "2026-09-03",
  "type": "milk",
  "status": "confirmed",
  "deleted": false,
  "createdAt": "...",
  "updatedAt": "...",
  "temporal": {}
}
```

### `status`

- `confirmed`：用户确认过的事实，可用于统计/分析。
- `pending`：系统建议/昨日模板，不能当事实统计。

### 删除 tombstone

删除记录不会在 JSON 中直接消失：

```json
{
  "deleted": true,
  "deletedAt": "...",
  "updatedAt": "..."
}
```

这样重复导入或跨备份合并仍能传播删除。

## 6. 记录类型

当前 record types：

- `sleep`
- `milk`
- `diet`
- `diaper`
- `wake`
- `health`
- `growth`
- `medical`
- `milestone`
- `activity`

### Sleep

```json
{
  "type": "sleep",
  "sleepMethod": "抱睡",
  "note": "",
  "nightAnchor": false,
  "nightKey": null,
  "temporal": {
    "version": 1,
    "zone": "Asia/Singapore",
    "start": {"atMs":0,"date":"2026-09-03","time":"10:20","offsetMinutes":-480},
    "end": {"atMs":0,"date":"2026-09-03","time":"11:05","offsetMinutes":-480}
  }
}
```

`nightAnchor: true` 表示明确由晚安/早安形成的夜间主睡事实；`nightKey` 使用该夜最终早安/结束日期。

普通 sleep 不在 JSON 中持久化 `startTime/endTime/startDateTime/endDateTime` 兼容投影；这些字段仅可在运行时由 canonical temporal 推导。

### Wake

```json
{
  "type": "wake",
  "nightKey": "2026-09-03",
  "result": "reslept",
  "resultLabel": "后来重新睡着",
  "note": "",
  "temporal": {
    "version": 1,
    "zone": "Asia/Singapore",
    "wake": {"atMs":0,"date":"2026-09-03","time":"02:10","offsetMinutes":-480},
    "resleep": {"atMs":0,"date":"2026-09-03","time":"02:35","offsetMinutes":-480}
  }
}
```

`nightKey` 来自用户对“属于昨晚 / 属于今晚”的选择；不要根据 Good Night 是否存在来决定。

JSON 不持久化 `wakeTime/resleepTime` 兼容投影。

### 单点事件

`milk/diet/diaper/health/growth/medical/milestone/activity` 的事件时间存放在 `temporal.occurred`。

各类型的业务字段继续直接保存在 record 上，例如：

- milk：`amount`, `feedType`
- diet：`dietType`, `amount`, `content`, `note`
- diaper：`diaperType`, `urineAmount`, `stoolAmount`, `stoolColor`, `stoolForm`, `note`
- health：`temperature`, `symptoms`, `medication`
- growth：`weight`, `height`, `headCircumference`, `sourceNote`
- medical：`eventType`, `content`, `note`
- milestone：`milestone`, `description`
- activity：`activityType`, `duration`, `note`

JSON 不持久化旧顶层 `time` 投影。

## 7. Day

`days` 只保存“当天背景”，不是流水事件。

```json
{
  "date": "2026-09-03",
  "context": {
    "tags": ["长牙", "外出多"],
    "note": "下午外出明显比平时久"
  },
  "templateGenerated": true,
  "templateGeneratedFrom": "2026-09-02",
  "updatedAt": "..."
}
```

旧版 `day.nightSleep` 不再导出。夜间睡眠事实属于 `records` 中的 canonical `sleep`。

## 8. Profile version

成长阶段使用版本化 profile：

```json
{
  "id": "profile-id",
  "version": 2,
  "effectiveFrom": "2026-08-20",
  "createdAt": "...",
  "updatedAt": "...",
  "base": {
    "name": "",
    "birthDate": "2026-01-26",
    "sex": "female"
  },
  "stage": {
    "dietStage": "辅食",
    "weekday": {},
    "weekend": {},
    "mainIssue": ""
  }
}
```

历史分析按 `effectiveFrom` 选择当时有效的 profile，不把最新阶段倒灌到过去。

## 9. 合并规则

同一稳定 ID：

- 本地不存在 → 新增；
- `incoming.updatedAt > local.updatedAt` → incoming 覆盖；
- 否则保留本地。

重复导入同一快照应保持幂等。

所有写入最终都经过 `db.putRecord()` → `canonicalizeRecord()`，避免导入逻辑自行产生第二套时间结构。

## 10. 分析规则

用于分析时：

- 只把 `status: "confirmed" && deleted: false` 当事实；
- `pending` 只能作为待确认建议；
- `deleted: true` 仅用于合并/审计，不计入统计；
- 不根据字段缺失自行虚构事实；
- 睡眠 nap/night 分类可以由分析层推断，但不要改写原始事实。
