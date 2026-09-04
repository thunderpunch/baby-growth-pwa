import {readFile,writeFile,unlink} from "node:fs/promises";

async function edit(path,fn){
  const before=await readFile(path,"utf8"),after=fn(before);
  if(after===before)throw new Error(`No change applied to ${path}`);
  await writeFile(path,after);
}
function replaceOne(text,oldValue,newValue,label){
  const count=text.split(oldValue).length-1;
  if(count!==1)throw new Error(`${label}: expected 1 occurrence, got ${count}`);
  return text.replace(oldValue,newValue);
}

await edit("AGENTS.md",text=>{
  text=replaceOne(text,
    '- Good Morning：完成昨夜睡眠；若没有 Good Night，则补睡着时间 + 醒来时间 + 入睡方式。',
    '- Good Morning：完成昨夜睡眠；若没有 Good Night，则补睡着时间 + 醒来时间 + 入睡方式。\n- 普通睡眠、晚安、早安都可选填 `roomTemperatureC`（宝宝实际睡眠区域室温，℃）；留空不影响保存。温度只作为后续分析变量，不直接用于 nap/night 分类或因果诊断。',
    "document sleep room temperature"
  );
  text=replaceOne(text,"## 6. History 长期浏览",
`## 6. 档案与近期规律

档案只保存系统无法可靠从日常记录推断、且会持续一段时间的背景。

当前人工维护字段：

- 宝宝名、出生日期、性别；
- 当前饮食阶段；
- 长期喂养方式；
- 平日 / 周末主要照护者；
- 长期睡眠环境；
- 当前主要问题。

以下字段已退出当前档案 UI，不得恢复为需要长期手填的核心字段：

- 通常放床 / 手填典型入睡时间；
- 入睡耗时；
- 典型小睡次数；
- 常用哄睡方式。

原因：这些作息特征应优先从真实记录推导，手填值容易过时并与事实冲突。

`profile-insights.js` 负责“近期规律”，当前使用最近 14 天已确认睡眠，以有界范围查询推导夜间入睡、夜间主睡、白天小睡和主要入睡方式；样本不足时明确显示不足，不虚构规律。

旧 `profileVersions` 里已经存在的 `stage.weekday/weekend.{bedtime,latency,naps,caregiver}` 或 `settlingMethod` 属于历史事实，应继续可读取 / 导出，不做破坏性迁移；新档案不再生成这些字段。

## 7. History 长期浏览`,"add profile policy");
  text=text.replace("## 7. PWA 与缓存","## 8. PWA 与缓存")
    .replace("## 8. 仓库文档是产品的一部分","## 9. 仓库文档是产品的一部分")
    .replace("## 9. 当前模块所有权","## 10. 当前模块所有权")
    .replace("## 10. 修改方式","## 11. 修改方式");
  text=replaceOne(text,
    '- `record-templates.js`：吃奶 / 饮食待确认模板策略唯一实现。',
    '- `record-templates.js`：吃奶 / 饮食待确认模板策略唯一实现。\n- `profile-insights.js`：档案页最近 14 天作息推导唯一实现；只读，不写回事实记录或 Profile。',
    "document profile insight owner"
  );
  return text;
});

await edit("ARCHITECTURE.md",text=>{
  text=replaceOne(text,
    '后续仍按职责继续拆分，不把已外移能力重新吸回。\n\n### `sleep-v3.js`',
`后续仍按职责继续拆分，不把已外移能力重新吸回。

当前 Profile 只维护长期背景：饮食阶段、长期喂养方式、平日/周末主要照护者、长期睡眠环境、当前主要问题，以及基础资料。通常放床、入睡耗时、典型小睡、常用哄睡方式不再作为当前手填档案字段。

### \`profile-insights.js\`

档案页“近期规律”唯一 owner。

- 只在进入档案页时读取最近 14 天范围，不阻塞 Today 首屏；
- 只使用 confirmed / nondeleted Sleep；
- 夜间入睡和夜间主睡优先使用明确 `nightAnchor`；
- 白天小睡和主要入睡方式从近期事实推导；
- 至少 3 个有效样本才展示规律；
- 只读 projection，不把推导结果写回 Profile 或原始记录；
- 禁止 `getAllRecords()` lifetime 扫描。

历史 profile 中旧 `weekday/weekend` 作息字段继续保留在旧版本数据中，仅作为历史兼容事实，新档案不再生成。

### \`sleep-v3.js\``,"add profile insights architecture");
  text=replaceOne(text,
    '- 小睡/夜间/待判断 projection。',
    '- 小睡/夜间/待判断 projection；\n- 可选睡眠区域室温 `roomTemperatureC`；\n- Sleep 分类不依赖人工维护的 Profile“通常放床时间”。',
    "document sleep profile independence"
  );
  text=replaceOne(text,
`- 系统文件分享必须先通过 \`navigator.canShare({files})\` 验证，不假设存在 \`navigator.share\` 就等于支持文件附件
- 标准归档始终保存 \`.json\`；若 Android 浏览器不能直接分享 \`.json\`，可临时用内容完全相同的 \`.json.txt\` / \`text/plain\` 作为传输兼容层
- 导入按 JSON 内容校验，允许选择 \`.json\` 或该 \`.txt\` 兼容附件；这不是第二套数据格式`,
`- 系统文件分享必须先通过 \`navigator.canShare({files})\` 验证，不假设存在 \`navigator.share\` 就等于支持文件附件
- 正式分享 / 保存格式只维护标准 \`.json\`；不创建第二种 \`text/plain\` 附件格式
- 浏览器不支持文件型 Web Share 时明确回退为标准 JSON 文件保存`,
    "correct file share architecture"
  );
  return text;
});

await edit("JSON_DATA_SCHEMA.md",text=>{
  const oldBlock=`  "stage": {
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
  }`;
  const newBlock=`  "stage": {
    "dietStage": "辅食",
    "feedingMode": "配方奶为主",
    "caregivers": {
      "weekday": "爷爷奶奶",
      "weekend": "父母"
    },
    "sleepEnvironment": "同房婴儿床，遮光，白噪音",
    "mainIssue": "最近凌晨4点左右醒后难以重新入睡"
  }`;
  text=replaceOne(text,oldBlock,newBlock,"update current profile schema example");
  text=replaceOne(text,
`- \`stage.feedingMode\`：长期喂养方式。
- \`stage.sleepEnvironment\`：长期睡眠环境。
- \`stage.settlingMethod\`：常用哄睡方式。
- \`stage.weekday / weekend\`：平日与周末典型作息和照护背景。
- \`stage.mainIssue\`：当前持续关注的问题。

历史分析应按 \`effectiveFrom\` 选择当时有效的 profile。`,
`- \`stage.feedingMode\`：长期喂养方式。
- \`stage.caregivers.weekday / weekend\`：平日与周末主要照护者。
- \`stage.sleepEnvironment\`：长期睡眠环境。
- \`stage.mainIssue\`：当前持续关注的问题。

当前档案不再保存“通常放床 / 入睡耗时 / 典型小睡 / 常用哄睡方式”作为人工维护字段；这些近期特征由记录分析层推导。

历史导出的 \`profileVersions\` 可能仍包含旧版 \`stage.weekday/weekend.{bedtime,latency,naps,caregiver}\` 或 \`stage.settlingMethod\`。它们属于已有历史 Profile 的原始数据，应原样保留并可用于历史分析，但当前 UI 不再生成这些字段。旧 caregiver 读取时可回退到 \`stage.weekday/weekend.caregiver\`。

历史分析应按 \`effectiveFrom\` 选择当时有效的 profile。`,
    "document profile current and legacy fields"
  );
  return text;
});

await edit("TESTING.md",text=>{
  text=replaceOne(text,
    '`tests/record-templates.test.mjs`',
    '`tests/record-templates.test.mjs`\n\n`tests/profile-contract.test.mjs`\n\n`tests/profile-insights.test.mjs`',
    "list profile tests"
  );
  text=replaceOne(text,
    '- 奶和饮食模板策略独立，模板生成不得使用 `getAllRecords()` 全历史扫描，也不得恢复 DOM 监听桥；',
    '- 奶和饮食模板策略独立，模板生成不得使用 `getAllRecords()` 全历史扫描，也不得恢复 DOM 监听桥；\n- Profile 当前 UI 不得恢复手填“通常放床 / 入睡耗时 / 典型小睡 / 常用哄睡方式”；长期背景字段必须保持明确；\n- `profile-insights.js` 只做最近 14 天有界查询，样本不足不宣称规律，且不得写回 Profile/事实记录；\n- Sleep 分类不得重新依赖手填 Profile bedtime；',
    "add profile test coverage"
  );
  return text;
});

await edit("MAINTENANCE.md",text=>{
  text=replaceOne(text,
`### C. Data I/O 样式命名`,
`### C. 历史 Profile 字段

旧 profileVersion 中可能存在 \`stage.weekday/weekend.{bedtime,latency,naps,caregiver}\` 与 \`settlingMethod\`。当前 UI 已不再生成这些字段，但它们属于历史事实，不做破坏性迁移或批量删除。

运行时只为旧 caregiver 提供读取回退；近期睡眠规律由 \`profile-insights.js\` 从最近 14 天事实推导，不把推导值回写旧 Profile。

### D. Data I/O 样式命名`,"add legacy profile maintenance note");
  text=text.replace("### D. CSS 启动链","### E. CSS 启动链");
  return text;
});

await edit("tests/documentation-contract.test.mjs",text=>replaceOne(text,
  'assert.match(agents,/聊天记忆不是唯一事实源/,"AGENTS.md must require repository documentation as durable context");',
  'assert.match(agents,/聊天记忆不是唯一事实源/,"AGENTS.md must require repository documentation as durable context");\nassert.match(agents,/档案与近期规律[\\s\\S]*最近 14 天|档案与近期规律[\\s\\S]*最近14天/,"AGENTS.md must preserve derived Profile insight policy");\nassert.match(agents,/通常放床[\\s\\S]*退出当前档案 UI|已退出当前档案 UI[\\s\\S]*通常放床/,"AGENTS.md must preserve removal of redundant manual Profile routines");\nassert.match(schema,/caregivers[\\s\\S]*weekday[\\s\\S]*weekend/,"JSON schema docs must describe current caregiver profile structure");\nassert.match(schema,/历史导出的 `profileVersions`[\\s\\S]*settlingMethod/,"JSON docs must preserve legacy Profile fields as historical data");',
  "lock profile documentation"
));

await unlink("scripts/sync-profile-docs-once.mjs");
await unlink(".github/workflows/sync-profile-docs-once.yml");
console.log("Profile documentation synchronized.");
