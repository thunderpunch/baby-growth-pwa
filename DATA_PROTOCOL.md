# 数据协议 1.0

## 顶层

```json
{
  "schemaVersion": "1.0.0",
  "appId": "baby-growth-tracker",
  "deviceId": "...",
  "exportId": "...",
  "exportedAt": "...",
  "range": {"start":"2026-09-01","end":"2026-09-07"},
  "profileVersions": [],
  "currentProfileVersionId": "...",
  "days": [],
  "records": []
}
```

## 档案版本

每个成长阶段一个稳定 ID：

```json
{
  "id": "profile-id",
  "version": 2,
  "effectiveFrom": "2026-09-01",
  "createdAt": "...",
  "updatedAt": "...",
  "base": {
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

判断历史阶段优先使用 `effectiveFrom`，不是导出日期。

## Record

所有流水记录有稳定 ID：

```json
{
  "id": "...",
  "date": "2026-09-02",
  "type": "milk",
  "status": "confirmed",
  "createdAt": "...",
  "updatedAt": "...",
  "deleted": false
}
```

### `status`

- `confirmed`：真实已确认记录
- `pending`：昨日模板，不能作为真实数据分析

### 昨日模板

吃奶模板会继承：
- 时间
- 奶量
- 喂养类型

饮食模板会继承：
- 时间
- 当前饮食阶段

不会继承：
- 今日具体食物
- 今日摄入量

`pending` 必须经用户确认或修改后才变为 `confirmed`。

## 删除

不立即从数据协议中消失：

```json
{
  "deleted": true,
  "deletedAt": "...",
  "updatedAt": "..."
}
```

因此跨设备/跨批次合并时可以正确传播删除。

## 幂等合并

同一 ID：
- 本地不存在 → 新增
- `incoming.updatedAt > local.updatedAt` → 更新
- 否则 → 保持本地

相同批次重复导入不会重复生成记录。

## Day

按日期保存非流水背景：

```json
{
  "date": "2026-09-02",
  "nightSleep": {
    "sleepAt": "19:50",
    "wakeAt": "06:20"
  },
  "context": {
    "tags": ["长牙", "外出多"],
    "note": "..."
  },
  "templateGenerated": true,
  "templateGeneratedFrom": "2026-09-01",
  "updatedAt": "..."
}
```

`context` 是“一天一份背景”，不是流水事件。
