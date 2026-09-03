# 宝宝成长记录 — 代码与仓库维护规范

目标：让当前主分支只保留真正参与运行、迁移、验证和维护的内容，避免历史实验代码继续增加认知成本。

## 1. 清理优先级

按下面顺序处理，不反过来：

1. 删除确定不可达的旧实现和旧资源；
2. 消除仍在运行的兼容层；
3. 拆分/收敛过大的核心模块；
4. 合并零散样式和重复工具函数；
5. 功能与数据迁移稳定后，再考虑重写 Git 历史。

不要为了“目录看起来干净”误删仍承担升级职责的迁移文件。

## 2. 当前运行入口

主要入口：

- `index.html`
- `app.js`
- `export-ipad.js`
- `sw.js`

`tests/repository-hygiene.test.mjs` 会从这些入口构建本地 JS 引用图。根目录出现无法从运行入口到达的 JS 时，发布前验证应失败。

CSS 也必须至少被 HTML、当前 JS、其它 CSS 或 Service Worker app shell 引用。

## 3. 已清理的历史文件

以下文件已确认不再属于当前运行链，因此应保持删除状态：

- `export-v2.js`
- `json-import-v2.js`
- `sleep-v2.js`
- `sleep-v2.css`
- `sleep-method.js`
- `sleep-ui-bridge.js`
- `icons/baby-neutral.svg`

`tests/repository-hygiene.test.mjs` 会阻止这些旧文件被无意重新加入。

其中 `sleep-ui-bridge.js` 已通过结构性改造删除：早安、昨晚小结、晚安现在直接存在于 `index.html` 的最终位置，不再运行时生成后搬运。

## 4. 不能仅因为名字旧就删除的文件

### `migration-v2.js`

仍是历史安装从旧数据结构升级到 v3 的迁移链组成部分。只要还需要支持可能停留在旧 dataVersion 的本机数据，就必须保留。

迁移文件的删除条件不是“当前版本已经是 v3”，而是明确决定不再支持对应历史版本，且已有可靠备份/恢复方案。

### `export-v2.css`

文件名旧，但当前 `data-io-v3.js` 仍然实际引用它。它不是死文件。后续整理 Data I/O 模块时应改名为语义化名称，例如 `data-io.css`，而不是直接删除。

### 隐藏的旧睡眠字段

`index.html` 当前仍保留隐藏的 `nightSleepAt / nightWakeAt / nightSleepEntries`，仅用于兼容尚未拆完的 `app.js` 与 `sleep-v3` 旧挂载逻辑。

它们不参与可见布局，也不会再生成或搬运可见按钮。下一阶段删除 `app.js` 旧 sleep modal / `day.nightSleep` 兼容代码后，这几个隐藏挂载点也应一起删除。

## 5. 后续代码结构优化目标

### `app.js`

目前仍过大，后续优先按职责拆分，而不是按代码行数机械切文件。

已经完成的职责外移：

- History → `history.js`

History 的新功能只允许进入 `history.js`。旧 `app.js::renderHistory()` 已经不再是导航入口，只作为待删除死代码存在；禁止继续修改或扩展它。下一轮拆 `app.js` 时应直接物理删除。

仍待拆分：

- Today 页面控制器
- 通用记录编辑器 / 弹窗路由
- Profile
- Context
- 基础 app shell / navigation

拆分完成后，`app.js` 只保留轻量启动与页面协调职责。

### History

当前长期浏览策略：

- 按 `YYYY-MM` 浏览；
- 上下月自然跨年；
- 年份在导航中显式显示；
- 单次只读取一个月的数据范围；
- 不做“最近 30 天”硬截断；
- 支持直接跳到具体日期；
- `tests/history.test.mjs` 必须持续覆盖跨年、闰年、禁止全库扫描。

不要再增加“先 getAllRecords() 再前端筛选”的 History 实现。

### Sleep

当前已完成：

- 夜间入口最终 DOM 不再运行时搬运；
- `sleep-ui-bridge.js` 已删除；
- 可见结构固定为：早安 → 昨晚小结 → 晚安。

下一步：

- `sleep-v3.js` 只负责睡眠业务、编辑器和睡眠 projection；
- 删除 `app.js` 中旧 sleep modal / `day.nightSleep` 兼容代码；
- 删除隐藏 legacy sleep 挂载点；
- 时间事实只来源于 canonical temporal model。

### Styles

小型、稳定、只服务单一模块的 CSS 可暂时独立；当模块边界稳定后，再评估合并，避免为了减少文件数反而制造一个无法维护的大 CSS。

## 6. Git 历史与仓库体积

删除当前分支上的文件不会立刻从 Git 历史中移除旧 blob，因此仓库 `.git` 体积可能不会同步明显下降。

但是：当前仓库主要是小型源码文件，仅为了几十 KB 的旧 JS/CSS 重写历史，收益通常小于风险。历史压缩应等功能、数据结构和迁移链稳定后统一进行。

### 推荐做法 A：稳定里程碑后创建“干净主线”

适用于希望保留当前最终快照，但不再需要早期大量试验提交的情况。

操作前：

1. 导出 / 备份当前仓库；
2. 创建永久备份 tag 或独立 archive 仓库；
3. 确认 Pages、CI、PWA 更新与数据迁移全部稳定；
4. 通知所有仍持有旧 clone 的设备 / 开发环境。

然后可创建 orphan branch，只提交当前最终文件树，再将 main 指向这个新根提交。

这是最彻底的“提交历史归零”方式，但会改变所有 commit SHA，需要强制更新远端分支，旧 clone 不能普通 pull 后继续使用。

### 推荐做法 B：`git filter-repo`

只有当历史中存在明显的大二进制文件、误提交数据包、视频、压缩包等时更有价值。

可以从所有历史提交中删除指定大文件 / 目录，同时保留其余提交历史。操作同样会重写 SHA，需要 force push。

### 不要把 `git gc` 当成 GitHub 远端瘦身方案

`git gc` / `git gc --aggressive` 主要优化本地对象库；GitHub 远端对象回收由 GitHub 管理。它不能替代历史重写。

## 7. 什么时候允许重写历史

满足以下条件后再考虑：

- 数据模型至少连续多个版本无迁移事故；
- 临时兼容层已经删除或明确收敛；
- 自动验证覆盖启动、数据、核心交互和 repository hygiene；
- 当前 Pages 版本经过稳定使用；
- 已建立完整仓库备份；
- 确认没有其他协作者依赖旧 commit SHA / PR 分支。

在此之前，优先优化当前代码树，不为了 Git 历史“好看”承担不必要风险。
