# 宝宝成长记录 — JSON Data Schema 1.2

这是当前 JSON 导出 / 恢复协议的唯一字段说明，供其它 Agent、脚本和分析流程快速理解数据。

**只维护当前结构，不提供旧 schema 迁移或兼容。**

## 1. 当前协议

- `appId = "baby-growth-tracker"`
- `schemaVersion = "1.2.0"`
- `timeModelVersion = 1`

导入文件必须与以上版本完全一致。

## 2. 顶层结构

```json
{
  "schemaVersion": "1.2.0",
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

- `range.start/end`：导出日期范围，包含首尾，格式 `YYYY-MM-DD`。
- `createdAt / updatedAt / exportedAt`：元数据时间，不代表事件发生时间。
- `profileVersions`：成长阶段档案版本。
- `days`：每天的背景信息。
- `records`：实际流水记录与待确认模板。

## 3. Canonical temporal

事件真实时间统一存在 `record.temporal`：

```json
{
  "version": 1,
  "zone": "Asia/Shanghai",
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

不同记录使用不同节点：

- 单点事件：`occurred`
- `sleep`：`start` / `end`
- `wake`：`wake` / `resleep`

节点字段：

- `atMs`：epoch milliseconds，绝对时间。
- `date`：本地日历日期 `YYYY-MM-DD`。
- `time`：本地时间 `HH:mm`，未知时可为空字符串。
- `offsetMinutes`：JavaScript `Date#getTimezoneOffset()` 语义。
- `temporal.zone`：记录时设备 IANA timezone。

排序、时长和跨午夜判断优先使用 `temporal`，不要使用 `createdAt / updatedAt` 推断事件时间。

## 4. Record 公共字段

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

- `confirmed`：用户确认过的事实，可用于统计和分析。
- `pending`：系统预填 / 模板，不可当成事实统计。

### 删除 tombstone

```json
{
  "deleted": true,
  "deletedAt": "...",
  "updatedAt": "..."
}
```

删除记录保留稳定 ID，便于重复导入时传播删除状态。

## 5. Record 类型

当前类型：

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
  "roomTemperatureC": 24.5,
  "note": "",
  "nightAnchor": false,
  "nightKey": null,
  "temporal": {
    "version": 1,
    "zone": "Asia/Shanghai",
    "start": {"atMs": 0, "date": "2026-09-03", "time": "10:20", "offsetMinutes": -480},
    "end": {"atMs": 0, "date": "2026-09-03", "time": "11:05", "offsetMinutes": -480}
  }
}
```

- `nightAnchor: true`：由“晚安 / 早安”明确形成的夜间主睡。
- `nightKey`：该晚夜间睡眠最终结束 / 早安日期。
- `roomTemperatureC`：可选数值，单位 ℃。表示宝宝实际睡眠区域的室温；未知时字段可以不存在。它属于睡眠环境事实，不参与 nap / night 分类，也不应单独用于因果诊断。
- 晚安与早安编辑的是同一条 `nightAnchor`；早安应继承晚安已填写的 `roomTemperatureC`，用户仍可修正。

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
    "zone": "Asia/Shanghai",
    "wake": {"atMs": 0, "date": "2026-09-03", "time": "02:10", "offsetMinutes": -480},
    "resleep": {"atMs": 0, "date": "2026-09-03", "time": "02:35", "offsetMinutes": -480}
  }
}
```

### 单点事件业务字段

时间都在 `temporal.occurred`，业务字段直接放在 record 上：

- `milk`：`amount`, `feedType`
- `diet`：`dietType`, `amount`, `content`, `note`
- `diaper`：`diaperType`, `urineAmount`, `stoolAmount`, `stoolColor`, `stoolForm`, `note`。当前 UI 的 `stoolForm` 词汇为 `水样 / 稀 / 糊状 / 较稠 / 成形 / 偏硬 / 其它`；其中“较稠”表示仍未成形但明显比普通糊状更厚。历史已有字符串原样保留。
- `health`：`temperature`, `symptoms`, `medication`
- `growth`：`weight`, `height`, `headCircumference`, `sourceNote`
- `medical`：`eventType`, `content`, `note`
- `milestone`：`milestone`, `description`
- `activity`：`activityType`, `duration`, `note`

## 6. 奶 / 饮食模板

模板仍属于 `records`，但状态为 `pending`。

常见字段：

```json
{
  "status": "pending",
  "source": "recent_day_template",
  "templateSourceId": "...",
  "templateSourceDate": "2026-09-02"
}
```

分析时不要把 `pending` 算入奶量、次数或作息事实。

## 7. Day

`days` 保存当天背景，不保存普通流水事件：

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
    "name": "小满",
    "birthDate": "2026-01-26",
    "sex": "female"
  },
  "stage": {
    "dietStage": "辅食",
    "feedingMode": "配方奶为主",
    "caregivers": {
      "weekday": "爷爷奶奶",
      "weekend": "父母"
    },
    "sleepEnvironment": "同房婴儿床，遮光，白噪音",
    "mainIssue": "最近凌晨4点左右醒后难以重新入睡"
  }
}
```

关键字段：

- `base.name`：宝宝名 / 昵称。
- `base.birthDate`：出生日期。
- `base.sex`：`female` / `male` / 空字符串。
- `stage.dietStage`：`辅食` / `正餐`。
- `stage.feedingMode`：长期喂养方式。
- `stage.caregivers.weekday / weekend`：平日与周末主要照护者。
- `stage.sleepEnvironment`：长期睡眠环境。
- `stage.mainIssue`：当前持续关注的问题。

当前档案不再保存“通常放床 / 入睡耗时 / 典型小睡 / 常用哄睡方式”作为人工维护字段；这些近期特征由记录分析层推导。

历史导出的 `profileVersions` 可能仍包含旧版 `stage.weekday/weekend.{bedtime,latency,naps,caregiver}` 或 `stage.settlingMethod`。它们属于已有历史 Profile 的原始数据，应原样保留并可用于历史分析，但当前 UI 不再生成这些字段。旧 caregiver 读取时可回退到 `stage.weekday/weekend.caregiver`。

历史分析应按 `effectiveFrom` 选择当时有效的 profile。

## 9. 合并规则

同一稳定 ID：

- 本地不存在 → 新增。
- `incoming.updatedAt > local.updatedAt` → incoming 覆盖。
- 否则保留本地。

重复导入同一当前结构快照应保持幂等。

## 10. Agent 分析规则

- 只把 `status: "confirmed" && deleted: false` 当事实。
- `pending` 只表示待确认建议。
- `deleted: true` 不计入统计。
- 不根据缺失字段虚构事实。
- nap / night 分类可由分析层推断，但不要改写原始记录。
- `roomTemperatureC` 只作为睡眠环境变量参与相关性观察；不要因为单次温度值直接推断夜醒、早醒或睡眠质量的因果关系。
- 持续背景优先结合当时生效的 profile version，而不是只看最新档案。
