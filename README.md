# 宝宝成长记录 PWA

宝宝成长记录的正式静态 PWA。页面程序部署在 GitHub Pages，宝宝实际记录默认只保存在使用设备的 IndexedDB 中，不自动上传到 GitHub。

## 开发 / Agent 入口

修改代码前先读：

1. `AGENTS.md` — 产品原则、用户长期偏好、开发与发布门禁；所有 Agent 第一入口。
2. `ARCHITECTURE.md` — 当前模块边界、canonical temporal 与运行结构。
3. `JSON_DATA_SCHEMA.md` — 当前 JSON 导出/恢复协议唯一权威说明。
4. `MAINTENANCE.md` — 技术债、代码收敛、Git 历史策略。
5. `TESTING.md` — 自动验证与回归策略。
6. `SECURITY.md` — local-first 与 Web 安全边界。

发布前统一运行：

```bash
node scripts/verify.mjs
```

只有同一 HEAD 的 `static-check` 与 GitHub Pages 都 `completed / success` 后，才视为部署完成。
