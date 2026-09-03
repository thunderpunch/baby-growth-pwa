# Baby Growth Tracker JSON Data Schema

Quick reference for agents/scripts that receive JSON exported by this project.

## 1. Core parsing rules

- `appId` must be `baby-growth-tracker`.
- Current `schemaVersion` is `1.0.0`.
- Dates are local calendar dates: `YYYY-MM-DD`.
- Clock times are local wall-clock values: `HH:mm` (24-hour), without timezone offset.
- `createdAt` / `updatedAt` / `exportedAt` are ISO timestamps and are used for merge ordering.
- Empty string usually means “not recorded / unknown”, not zero.
- Unknown extra fields should be treated as forward-compatible extensions; do not reject an export only because it contains newer optional fields.
- For analysis, only `status: "confirmed"` + `deleted: false` records are factual observations.
- `status: "pending"` is a suggested/template row awaiting caregiver confirmation and must not be counted as fact.
- `deleted: true` is a tombstone and should be preserved during merge.

## 2. Top-level export

```json
{
  "schemaVersion": "1.0.0",
  "appId": "baby-growth-tracker",
  "deviceId": "...",
  "exportId": "...",
  "exportedAt": "2026-09-03T00:00:00.000Z",
  "range": {"start": "2026-09-01", "end": "2026-09-03"},
  "profileVersions": [],
  "currentProfileVersionId": "...",
  "days": [],
  "records": []
}
```

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Export contract version. |
| `appId` | Stable app identifier. |
| `deviceId` | Local installation/device identifier; not a human identity. |
| `exportId` | Unique ID of this export operation. |
| `exportedAt` | ISO export timestamp. |
| `range.start/end` | Inclusive local-date range. |
| `profileVersions` | Profile versions relevant to the range. |
| `currentProfileVersionId` | Currently active profile version ID; may be `null`. |
| `days` | Day-level background facts. |
| `records` | Event-like records and deletion tombstones. |

## 3. Profile versions

Profiles are versioned because long-running background conditions can change. Use a new version for a lasting phase change; simple corrections update the current version.

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
    "sleepEnvironment": "同房婴儿床，遮光，白噪音",
    "settlingMethod": "抱哄后放床，必要时拍睡",
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
| `version` | Increasing human-readable version number. |
| `effectiveFrom` | First local date for which this profile phase applies. |
| `createdAt/updatedAt` | ISO timestamps. |
| `base.name` | Baby name/nickname shown in UI. Optional in older exports. |
| `base.birthDate` | Birth date; may be empty. |
| `base.sex` | `female`, `male`, or empty string. |
| `stage.dietStage` | Current primary diet stage: `辅食` or `正餐`. |
| `stage.feedingMode` | Long-term feeding mode/background, free text, e.g. 配方奶为主 / 混合喂养 / 母乳亲喂. |
| `stage.sleepEnvironment` | Long-term sleep environment, free text, e.g. 同房婴儿床 / 遮光 / 白噪音. |
| `stage.settlingMethod` | Usual settling method, free text, e.g. 抱哄后放床 / 拍睡 / 奶睡. |
| `stage.weekday` | Typical weekday sleep/care context. |
| `stage.weekend` | Typical weekend sleep/care context. |
| `stage.*.bedtime` | Typical bedtime / put-down value in `HH:mm`, or empty. |
| `stage.*.latency` | Free-text typical sleep-onset latency. |
| `stage.*.naps` | Free-text typical nap pattern/count. |
| `stage.*.caregiver` | Main caregiver/context. |
| `stage.mainIssue` | Current main concern or analysis focus. |

For historical analysis, use the profile version whose `effectiveFrom` applies to the date being analyzed. Do not apply the newest profile retroactively to older dates.

## 4. Day-level objects (`days`)

```json
{
  "date": "2026-09-03",
  "nightSleep": {"sleepAt": "19:45", "wakeAt": "05:10"},
  "context": {
    "tags": ["长牙", "外出多"],
    "note": "下午外出时间较长"
  },
  "templateGenerated": true,
  "templateGeneratedFrom": "2026-09-02",
  "updatedAt": "..."
}
```

| Field | Meaning |
| --- | --- |
| `date` | Local date. |
| `nightSleep.sleepAt` | Actual night sleep onset for the sleep period ending on this date; may be empty. |
| `nightSleep.wakeAt` | Final morning wake time; may be empty. |
| `context.tags` | Daily exceptional-context tags such as `长牙`, `不舒服`, `疫苗后`, `外出多`, `环境变化`, `照护者不同`. |
| `context.note` | Free-text daily exceptional context. |
| `templateGenerated` | Internal UI/template metadata, not an observed baby fact. |
| `templateGeneratedFrom` | Internal source date for template generation; may be `null`. |
| `updatedAt` | ISO timestamp used for merge ordering. |

Night sleep is filed by the date of the final morning wake, so `sleepAt` may refer to the previous calendar evening.

## 5. Common record envelope

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

Common optional metadata:

- `deletedAt`: ISO deletion timestamp.
- `deleteReason`: e.g. `not_occurred` when a pending template is marked “今天没有”.
- `source`: provenance such as `previous_day_template` or `recent_day_template`.
- `templateSourceId`: source record ID used to create a pending template.
- `templateSourceDate`: source date for recent-history milk template.
- `note`: free text where supported.

Primary merge key is `id`.

## 6. Record types

### `sleep` — nap/daytime sleep

```json
{"type":"sleep","startTime":"09:25","endTime":"10:05","note":""}
```

- `startTime`: actual sleep onset; may be empty.
- `endTime`: actual wake time; may be empty.
- Incomplete sleep records are valid; do not invent missing endpoints.
- If both exist and end < start, duration logic treats it as crossing midnight.

### `milk` — milk feeding

```json
{"type":"milk","time":"07:05","amount":"180","feedType":"配方奶"}
```

- `time`: feeding time.
- `amount`: ml, usually a numeric-like string; may be empty.
- `feedType`: typically `配方奶`, `母乳瓶喂`, `母乳亲喂`.

### `diet` — complementary food / meal / snack / water

```json
{"type":"diet","time":"12:10","dietType":"辅食","content":"米糊 + 南瓜泥","amount":"半碗"}
```

- `dietType`: e.g. `辅食`, `正餐`, `水果`, `饮水`, `加餐`, `其它`.
- `content`: what was eaten/drunk.
- `amount`: free-text amount.

### `diaper`

```json
{
  "type":"diaper",
  "time":"08:40",
  "diaperType":"尿 + 便",
  "urineAmount":"中",
  "stoolAmount":"少",
  "stoolColor":"黄",
  "stoolForm":"糊状",
  "note":""
}
```

- `diaperType`: `尿`, `便`, or `尿 + 便`.
- Urine/stool amount values are typically `少`, `中`, `多`.
- Stool color UI may include `黄`, `棕`, `绿`, `黑`, `红`, `灰白`, `其它`.
- Stool form UI may include `稀`, `糊状`, `成形`, `偏硬`, `水样`, `其它`.

### `wake` — night awakening

```json
{
  "type":"wake",
  "wakeTime":"04:05",
  "resleepTime":"",
  "result":"no_resleep",
  "resultLabel":"一直没再睡到起床",
  "note":""
}
```

- `result`: `reslept`, `no_resleep`, or `unknown`.
- Prefer stable `result` code over `resultLabel` during analysis.

### `health` — health / medication

```json
{"type":"health","time":"14:20","temperature":"37.6","symptoms":"鼻塞","medication":""}
```

- `temperature`: Celsius, numeric-like or empty.
- `symptoms`: free text.
- `medication`: medicine + actual dose/context, free text.

### `growth` — growth measurement

```json
{"type":"growth","time":"","weight":"8.20","height":"69.5","headCircumference":"44","sourceNote":"社区体检"}
```

- `weight`: kg.
- `height`: cm.
- `headCircumference`: cm.
- `sourceNote`: measurement source/context.

### `medical` — vaccine / medical visit

```json
{"type":"medical","time":"","eventType":"疫苗","content":"...","note":"..."}
```

`eventType` may include `疫苗`, `儿保`, `门诊`, `急诊`, `其它`.

### `milestone` — developmental milestone

```json
{"type":"milestone","time":"","milestone":"独坐","description":"第一次可以稳定独坐约1分钟"}
```

Milestone categories may include `翻身`, `独坐`, `爬行`, `扶站`, `出牙`, `语言`, `其它`.

### `activity` — activity / outdoor time

```json
{"type":"activity","time":"16:10","activityType":"户外","duration":"约45分钟","note":""}
```

`duration` is deliberately rough/free text.

## 7. Automatic-template semantics

The app uses pending templates to reduce repeated caregiver input.

1. Generated templates use `status: "pending"`; they are not factual.
2. Confirming a template changes it to `status: "confirmed"`.
3. Choosing “今天没有” creates/preserves a deleted tombstone, typically with `deleteReason: "not_occurred"`.
4. `previous_day_template` is the older previous-day mechanism.
5. `recent_day_template` is the newer milk-prefill mechanism: for a blank page not later than tomorrow, search backward for the most recent historical date containing confirmed milk records and create pending copies. If no confirmed historical milk exists, generate nothing.
6. Pending/deleted templates must never be used as evidence that feeding happened.

## 8. Merge / restore rules

Recommended idempotent merge:

1. Match records/profiles by stable `id`.
2. If ID does not exist locally, add it.
3. If ID exists on both sides, compare valid `updatedAt` values.
4. Keep the newer object.
5. Preserve deletion tombstones; never resurrect an older non-deleted copy.
6. Re-importing the same export should not create duplicates.
7. Day objects are keyed by `date`; for conflicts use newest `updatedAt`.

## 9. Analysis guidance

- Prefer longitudinal patterns over one-day conclusions.
- Use profile versions as context, especially `feedingMode`, `sleepEnvironment`, `settlingMethod`, weekday/weekend routines, caregiver, and diet stage.
- Compute derived metrics yourself; caregivers are not expected to enter totals or wake windows.
- Useful derived metrics include: 24h sleep, night/day sleep allocation, nap count/duration, wake windows, final wake window, sleep-onset latency, night-wake duration, suspected early wake, total confirmed milk, feeding intervals, and weekday/weekend differences.
- Missing fields are missing data, not zero and not negative evidence.
- Do not count `pending` or `deleted` records as observed events.
