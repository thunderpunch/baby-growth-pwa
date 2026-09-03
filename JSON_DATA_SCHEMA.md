# Baby Growth Tracker JSON Data Schema

This file is the quick reference for any agent, script, or analysis workflow that receives exported JSON from this project.

## 1. Parsing rules

- `appId` must be `baby-growth-tracker`.
- Current `schemaVersion` is `1.0.0`.
- Treat unknown extra fields as forward-compatible extensions. Do not reject the whole payload only because a newer export contains fields not listed here.
- Dates are local calendar dates in `YYYY-MM-DD`.
- Clock times are local wall-clock values in `HH:mm` using 24-hour time. They do not carry a timezone offset.
- ISO timestamps such as `createdAt`, `updatedAt`, and `exportedAt` are absolute timestamps and are used for merge conflict resolution.
- Empty string generally means “not recorded / unknown”, not zero.
- Only records with `status: "confirmed"` and `deleted: false` should be treated as actual observed events for statistics and behavioral analysis.
- `status: "pending"` is a suggested/template row awaiting caregiver confirmation. Do not count it as fact.
- `deleted: true` is a tombstone and should be preserved during merge so a deleted record is not resurrected by an older copy.

## 2. Top-level export object

```json
{
  "schemaVersion": "1.0.0",
  "appId": "baby-growth-tracker",
  "deviceId": "...",
  "exportId": "...",
  "exportedAt": "2026-09-03T00:00:00.000Z",
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

### Top-level fields

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Export contract version. |
| `appId` | Stable application identifier: `baby-growth-tracker`. |
| `deviceId` | Stable identifier for the local installation/device. Not a user identity. |
| `exportId` | Unique ID for this export operation. |
| `exportedAt` | ISO timestamp when the JSON was generated. |
| `range.start` / `range.end` | Inclusive local-date range requested by the user. |
| `profileVersions` | Profile versions relevant to the selected date range. |
| `currentProfileVersionId` | ID of the profile version currently active on the exporting device. May be `null`. |
| `days` | Day-level background facts such as night sleep and exceptional context. |
| `records` | Event-like records such as milk, naps, diapers, wake events, health, growth, etc. Deleted records may also be present as tombstones. |

## 3. Profile versions

Profiles are versioned because long-running background conditions can change over time. A new version is created for a lasting phase change; simple corrections update the current version.

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
    "weekday": {
      "bedtime": "19:30",
      "latency": "约60分钟",
      "naps": "3觉",
      "caregiver": "爷爷奶奶"
    },
    "weekend": {
      "bedtime": "19:30",
      "latency": "约20分钟",
      "naps": "3觉",
      "caregiver": "父母"
    },
    "mainIssue": "最近凌晨4点左右醒后难以重新入睡"
  }
}
```

### Profile fields

| Field | Meaning |
| --- | --- |
| `id` | Stable profile-version ID. |
| `version` | Human-readable increasing version number. |
| `effectiveFrom` | First local date for which this phase should be considered effective. |
| `createdAt` / `updatedAt` | ISO timestamps. |
| `base.name` | Baby name/nickname shown in the UI. Optional for older exports; empty/missing means unnamed. |
| `base.birthDate` | Birth date. Empty string is allowed when unknown. |
| `base.sex` | `female`, `male`, or empty string. |
| `stage.dietStage` | Current main diet stage: `辅食` or `正餐`. |
| `stage.weekday` | Typical weekday sleep/care context. |
| `stage.weekend` | Typical weekend sleep/care context. |
| `stage.*.bedtime` | Typical put-down/bedtime value in `HH:mm`, or empty. |
| `stage.*.latency` | Free-text typical sleep-onset latency. |
| `stage.*.naps` | Free-text typical nap pattern/count. |
| `stage.*.caregiver` | Free-text main caregiver/environment context. |
| `stage.mainIssue` | Current main concern or observation focus. |

For analysis across a date range, choose the profile version whose `effectiveFrom` applies to the date being analyzed. Do not assume the newest profile describes earlier history.

## 4. Day-level objects (`days`)

A day object stores facts that belong to the date as a whole instead of a point-in-time event.

```json
{
  "date": "2026-09-03",
  "nightSleep": {
    "sleepAt": "19:45",
    "wakeAt": "05:10"
  },
  "context": {
    "tags": ["长牙", "外出多"],
    "note": "下午外出时间较长"
  },
  "templateGenerated": true,
  "templateGeneratedFrom": "2026-09-02",
  "updatedAt": "..."
}
```

### Day fields

| Field | Meaning |
| --- | --- |
| `date` | Local date this day object belongs to. |
| `nightSleep.sleepAt` | Actual night sleep onset for the sleep period ending on this day. Can be empty. |
| `nightSleep.wakeAt` | Final morning wake time for this day. Can be empty. |
| `context.tags` | Zero or more daily exception tags. Current values may include `长牙`, `不舒服`, `疫苗后`, `外出多`, `环境变化`, `照护者不同`. |
| `context.note` | Free-text exceptional context for the day. |
| `templateGenerated` | Internal UI state indicating whether automatic template generation was already attempted. Not an observed baby fact. |
| `templateGeneratedFrom` | Source date used by the legacy previous-day template mechanism, or `null`. Internal metadata. |
| `updatedAt` | ISO timestamp for merge comparison. |

Night sleep is filed by the date of the final morning wake. Therefore `sleepAt` may refer to the previous calendar evening.

## 5. Common record envelope (`records`)

Most record objects share these fields:

```json
{
  "id": "record-id",
  "date": "2026-09-03",
  "type": "milk",
  "status": "confirmed",
  "deleted": false,
  "createdAt": "...",
  "updatedAt": "..."
}
```

| Field | Meaning |
| --- | --- |
| `id` | Stable record ID. Primary merge key. |
| `date` | Local day to which the record belongs. |
| `type` | Record type; see sections below. |
| `status` | `confirmed` or `pending`. |
| `deleted` | Tombstone flag. |
| `createdAt` | ISO creation timestamp. |
| `updatedAt` | ISO last-update timestamp. Use this to resolve same-ID conflicts. |
| `deletedAt` | Optional ISO deletion timestamp. |
| `deleteReason` | Optional reason, e.g. `not_occurred` when a pending template is marked “今天没有”. |
| `source` | Optional provenance such as `previous_day_template` or `recent_day_template`. |
| `templateSourceId` | Optional source record ID for an automatically generated pending template. |
| `templateSourceDate` | Optional source date used by the recent-history milk template mechanism. |
| `note` | Optional free text on record types that support notes. |

## 6. Record types

### `sleep` — daytime sleep / nap

```json
{
  "type": "sleep",
  "startTime": "09:25",
  "endTime": "10:05",
  "note": ""
}
```

- `startTime`: actual sleep onset, may be empty.
- `endTime`: actual wake time, may be empty.
- `note`: optional note.
- Incomplete sleep records are valid. Do not invent the missing endpoint.
- When both times exist and `endTime < startTime`, duration logic treats the interval as crossing midnight.

### `milk` — milk feeding

```json
{
  "type": "milk",
  "time": "07:05",
  "amount": "180",
  "feedType": "配方奶"
}
```

- `time`: feeding time.
- `amount`: milk volume in ml, stored as a numeric-like string in normal UI-created records; may be empty.
- `feedType`: currently typically `配方奶`, `母乳瓶喂`, or `母乳亲喂`.

Pending milk templates copy `time`, `amount`, and `feedType` from a historical confirmed milk day. A template remains non-factual until confirmed.

### `diet` — complementary food / meal / snack / water

```json
{
  "type": "diet",
  "time": "12:10",
  "dietType": "辅食",
  "content": "米糊 + 南瓜泥",
  "amount": "半碗"
}
```

- `time`: eating/drinking time.
- `dietType`: current stage or category, e.g. `辅食`, `正餐`, `水果`, `饮水`, `加餐`, `其它`.
- `content`: what was eaten/drunk.
- `amount`: free-text amount for diet records.

### `diaper` — diaper / urine / stool

```json
{
  "type": "diaper",
  "time": "08:40",
  "diaperType": "尿 + 便",
  "urineAmount": "中",
  "stoolAmount": "少",
  "stoolColor": "黄",
  "stoolForm": "糊状",
  "note": ""
}
```

- `diaperType`: `尿`, `便`, or `尿 + 便`.
- `urineAmount`: typically `少`, `中`, `多`; empty when not applicable/unknown.
- `stoolAmount`: typically `少`, `中`, `多`; empty when not applicable/unknown.
- `stoolColor`: current UI options include `黄`, `棕`, `绿`, `黑`, `红`, `灰白`, `其它`.
- `stoolForm`: current UI options include `稀`, `糊状`, `成形`, `偏硬`, `水样`, `其它`.

### `wake` — night awakening

```json
{
  "type": "wake",
  "wakeTime": "04:05",
  "resleepTime": "",
  "result": "no_resleep",
  "resultLabel": "一直没再睡到起床",
  "note": ""
}
```

- `wakeTime`: night wake time.
- `resleepTime`: time the baby fell asleep again, or empty.
- `result`: `reslept`, `no_resleep`, or `unknown`.
- `resultLabel`: UI-readable label corresponding to `result`; analysis should prefer the stable `result` code.
- `note`: handling/context note.

### `health` — health / medication

```json
{
  "type": "health",
  "time": "14:20",
  "temperature": "37.6",
  "symptoms": "鼻塞",
  "medication": ""
}
```

- `time`: observation/medication time.
- `temperature`: Celsius, numeric-like value or empty.
- `symptoms`: free text.
- `medication`: medicine + actual dose as free text.

### `growth` — growth measurement

```json
{
  "type": "growth",
  "time": "",
  "weight": "8.20",
  "height": "69.5",
  "headCircumference": "44",
  "sourceNote": "社区体检"
}
```

- `weight`: kg.
- `height`: cm.
- `headCircumference`: cm.
- `sourceNote`: measurement source/context.
- `time` is currently normally empty; the local date is the important time key.

### `medical` — vaccine / medical visit

```json
{
  "type": "medical",
  "time": "",
  "eventType": "疫苗",
  "content": "...",
  "note": "..."
}
```

- `eventType`: current UI categories include `疫苗`, `儿保`, `门诊`, `急诊`, `其它`.
- `content`: event details.
- `note`: follow-up/doctor advice/context.

### `milestone` — developmental milestone

```json
{
  "type": "milestone",
  "time": "",
  "milestone": "独坐",
  "description": "第一次可以稳定独坐约1分钟"
}
```

- `milestone`: current UI categories include `翻身`, `独坐`, `爬行`, `扶站`, `出牙`, `语言`, `其它`.
- `description`: free-text observation.

### `activity` — activity / outdoor time

```json
{
  "type": "activity",
  "time": "16:10",
  "activityType": "户外",
  "duration": "约45分钟",
  "note": ""
}
```

- `time`: start time.
- `activityType`: current UI categories include `户外`, `大运动`, `亲子活动`, `其它`.
- `duration`: deliberately free text / rough duration.
- `note`: optional context.

## 7. Automatic-template semantics

The app uses pending templates to reduce repetitive caregiver entry cost.

Important rules for analysis:

1. A generated template has `status: "pending"` and is not factual.
2. Confirming it changes the same record to `status: "confirmed"`.
3. Choosing “今天没有” marks the record deleted, typically with `deleteReason: "not_occurred"`.
4. `previous_day_template` is the older previous-day mechanism.
5. `recent_day_template` is used by the newer milk-prefill rule. For a blank page not later than tomorrow, the app searches backward for the most recent date containing confirmed milk records and creates pending copies. If no historical confirmed milk exists, nothing is generated.
6. Pending/deleted templates must never be used as evidence that the feeding actually happened.

## 8. Merge / restore rules

Recommended idempotent merge for records and profiles:

1. Match by stable `id`.
2. If the ID does not exist locally, add it.
3. If it exists on both sides, compare `updatedAt`.
4. Keep the object with the newer valid `updatedAt`.
5. Preserve `deleted: true` tombstones; never silently resurrect an older non-deleted copy.
6. Re-importing the same export should result in no duplicate records.

Day objects are keyed by `date`; when merging conflicting day objects, use `updatedAt` with the same newest-wins principle.

## 9. Analysis guidance for agents

- Prefer longitudinal patterns over a single day.
- Separate weekday and weekend context when the profile indicates they differ.
- Compute derived metrics yourself; caregivers are not expected to enter them.
- Useful derived metrics include 24-hour sleep, night/day sleep allocation, nap count, nap duration, wake windows, last-nap end, night waking frequency, early-wake pattern, daily confirmed milk total, and changes around exceptional context.
- Never infer a missing time as zero or fabricate an endpoint for an incomplete sleep record.
- Treat `days.context` as contextual evidence, not a diagnosis.
- When a profile version changes, avoid projecting the newer stage backward onto dates before `effectiveFrom`.

## 10. Backward/forward compatibility

- Older exports may not contain `base.name`.
- Future exports may add optional fields or new metadata.
- Parsers should validate core identifiers/types but preserve unknown fields when possible.
- If `schemaVersion` changes to a value the consumer does not understand, prefer explicit compatibility handling rather than silently reinterpreting fields.
