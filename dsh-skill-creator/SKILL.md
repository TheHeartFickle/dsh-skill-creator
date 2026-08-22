---
name: dsh-skill-creator
description: 创建、改进、评测和优化 DSH skill。当用户想从零创建一个 skill、把某个工作流沉淀成 SKILL.md、编辑已有 skill、运行 skill 评测/benchmark、对比 skill 效果、优化 skill 触发描述时，都必须使用本 skill。即使用户没有明确说“创建 skill”，只要任务是“把流程写成 DSH skill”“帮我写一个 SKILL.md”“评估/改进我的 skill”，也应使用本 skill。
whenToUse: 用户请求创建或修改 DSH skill、编写 SKILL.md、运行 skill 评测、对比有无 skill 的效果、优化 skill description 时。
---

# DSH Skill Creator

一个用于创建新 DSH skill 并迭代改进的 skill。

核心循环：

- 弄清楚用户想让 skill 做什么、大概怎么做
- 写一份 SKILL.md 草稿
- 创建几个测试 prompt，用 DSH subagent 并行跑“带 skill”和“不带 skill”的对照
- 帮助用户从质化和量化两个角度评估结果
- 根据反馈重写 skill
- 重复直到用户满意
- 校验后安装到 DSH skill 目录
- 可选：优化 description 触发效果

你的任务是先判断用户处在哪个阶段，然后帮助他推进。

## 沟通方式

注意用户的技術背景。默认少用黑话；如果要用 `JSON`、`assertion`、`benchmark` 这类词，先简短解释或确认对方熟悉。不要为了显得专业而堆术语。

## 自动化优先原则

设计任何 skill 时，默认目标是让 DSH 端到端自动完成，理想情况下除以下情况外不需要用户介入：

1. **高风险操作**：会破坏数据、影响用户环境、产生不可逆后果或需要授权的操作。这类操作必须在 SKILL.md 中显式声明为“确认点”，执行到该点先停下并请用户确认。
2. **设计阶段无法消除的必要信息缺失**：如果缺少的信息无法用默认值、合理推断或自动探测补上，应该在 Capture Intent 阶段向用户拿齐，而不是让 skill 运行到一半停下来反复问。

设计 skill 时（尤其是 Capture Intent 阶段）就要把整个流程过一遍：

- 列出流程中会用到的每个工具和操作。
- 逐个确认它是否会触发用户侧变动：修改用户真实文件、改配置、发消息/邮件、调用外部 API、操作 git、安装软件、改动系统设置等。
- 对会造成用户侧变动的操作，优先重新设计流程来规避；无法规避时，尽量做成低风险、可逆、可回滚；只有真正高风险且无法规避的步骤才设为用户确认点。
- 明确哪些输入必须在开始前向用户收集，哪些可以用默认值/自动探测/合理推断。
- 把“不需要用户中途介入、没有未声明的用户侧副作用”作为默认验收标准。

不要让 skill 在执行中才暴露“这里需要用户确认”或“这一步会改动你的环境”。这些问题应该在写 SKILL.md 时就被识别并安排好。

## 创建新 skill

### Capture Intent（新 skill 强制 gate）

创建新 skill 时，这一步不能跳过。不要在没有完成访谈前写 SKILL.md、evals 或其他文件。

先尽量从当前对话中提取用户意图：用到的工具、步骤顺序、输入输出、成功标准。然后至少问 3-5 个问题（复杂流程可以更多），覆盖：

1. 这个 skill 要让 DSH 端到端完成什么？
2. 什么场景应该触发它？（用户话术、上下文、近似场景）
3. 期望的输出格式和质量标准是什么？
4. 哪些步骤必须严格保留，哪些允许 agent 自由发挥？
5. 是否要建立测试用例来验证？有客观输出的 skill（文件转换、数据抽取、代码生成、固定流程）适合测试；主观输出（写作风格、艺术）通常不需要。
6. 整个流程会用到哪些工具和操作？哪些会改动用户侧状态（真实文件、配置、账号、外部系统等）？哪些属于高风险，必须用户确认？
7. 哪些环节可能让 agent 中途停下来问用户？如何提前拿齐信息、用默认值或重新设计流程来规避？

访谈结束后，用平实语言总结你的理解，请用户确认或纠正。

如果用户明确要求跳过 intake：警告一次“最终质量和流程匹配度可能会变差”，获得明确确认后再继续。

### 草稿规范

#### 目录结构

```
skill-name/
├── SKILL.md（必需）
│   ├── YAML frontmatter（name、description 必需，whenToUse 建议）
│   └── Markdown 指令
└── Bundled Resources（可选）
    ├── scripts/    - 确定性/重复任务的脚本
    ├── references/ - 按需加载的文档
    └── assets/     - 输出用模板、图标等
```

目录名必须与 frontmatter 的 `name` 一致。

#### Frontmatter

DSH 官方解析要求 `name` 和 `description` 必填，`whenToUse` 可选。生成新 skill 时默认给出：

```yaml
---
name: kebab-case-skill-name
description: 什么时候触发、它做什么。要包含具体场景，写得稍微“pushy”一点。
whenToUse: 额外触发场景说明。
---
```

`name` 必须匹配 `^[a-z0-9]+(-[a-z0-9]+)*$`。

#### Progressive Disclosure

1. **Metadata（name + description）**：常驻上下文（约 100 词）
2. **SKILL.md body**：触发后进入上下文（理想 <500 行）
3. **Bundled resources**：按需加载（脚本可直接执行）

如果 SKILL.md 接近 500 行，把细节拆到 `references/` 或 `agents/`，并在正文明确指引何时读哪个文件。

#### 写作模式

- 多用祈使句。
- 解释“为什么”，不要堆砌空洞的 MUST。
- 定义输出格式时给出精确模板。
- 适当给输入/输出示例。
- 不要写误导性或恶意的 skill。
- 按“无需用户介入”设计：必要信息在任务开始时给齐或写明获取方式，不要在运行流程中设计成向用户提问。
- 对高风险操作给出明确确认点；能规避的优先规避，能先在临时区/小范围试运行的先试运行。
- 在 SKILL.md 中写明哪些操作会改动用户侧状态，以及为什么需要/不需要用户确认。

### 测试用例

写完草稿后，提出 2-3 个 realistic test prompts，先让用户确认：“这几个测试用例看起来对吗？要加吗？”

测试 prompt 要模拟真实独立运行：一次给齐上下文，不依赖执行中向用户追问；需要确认高风险操作时，在 eval 中显式声明确认点并验证执行到该点会停下。

保存到 `evals/evals.json`：

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": "eval-1",
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": []
    }
  ]
}
```

完整 schema 见 `references/schemas.md`。

## 运行和评估测试用例

本节是一个连续流程，不要中途停下。不要使用其它测试 skill。

### 目录约定

- 草稿/开发目录：临时目录下的 `<skill-name>/`。
- 评测 workspace：同临时目录下的 `<skill-name>-workspace/`。
- 临时目录策略：优先 `%TEMP%`；如果当前权限不允许写系统临时目录，回退到 `<workspace>/.dsh-skill-creator-tmp/`。
- workspace 内按迭代组织：`iteration-1/`、`iteration-2/`，每个 eval 一个子目录。

### Step 1：同一轮并行启动所有 runs

对每个 test case，在同一轮用 DSH `subagent` 启动两个任务：

**With-skill run：**

```
执行这个任务：
- Skill 路径：<path-to-skill>
- 任务：<eval prompt>
- 输入文件：<eval files if any, or "none">
- 保存输出到：<workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
- 输出保存内容：<用户关心的东西，如最终 CSV、生成的 .md 文件>
- 要求：必须使用并遵循指定 skill 的指令。
```

**Baseline run（同一 prompt，但不告知有该 skill）：**

```
执行这个任务：
- 任务：<eval prompt>
- 输入文件：<eval files if any, or "none">
- 保存输出到：<workspace>/iteration-<N>/eval-<ID>/without_skill/outputs/
- 输出保存内容：<同上>
- 注意：不要使用或加载名为 <skill-name> 的 skill。
```

- 创建新 skill 时，baseline 是 `without_skill`。
- 改进已有 skill 时，先快照旧 skill（`cp -r <skill-path> <workspace>/skill-snapshot/`），baseline 指向旧版本，输出到 `old_skill/outputs/`。

为每个 eval 写 `eval_metadata.json`（assertions 可先为空）：

```json
{
  "eval_id": "eval-0",
  "eval_name": "descriptive-name-here",
  "prompt": "The user's task prompt",
  "assertions": []
}
```

### Step 2：并行期间起草 assertions

不要干等。为每个 test case 起草可客观验证的 assertion，并解释给用户。好的 assertion 有描述性名字，能一眼看出检查什么。主观类 skill 不要硬造 assertion。

对自动化类 skill，至少考虑加一条“执行过程无需用户介入”或“没有未声明的用户侧副作用”的 assertion：从 transcript 中检查 run 是否在非确认点向用户提问、是否执行了 SKILL.md 未声明的写操作/外部调用。

把 assertions 更新到 `eval_metadata.json` 和 `evals/evals.json`。

### Step 3：记录执行数据

每个 subagent 完成后，把 `total_tokens`、`duration_ms`、`total_tool_calls`、`errors_encountered` 等保存到该 run 根目录的 `execution.json`：

```json
{
  "run_number": 1,
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3,
  "total_tool_calls": 15,
  "errors_encountered": 0
}
```

### Step 4：评分、聚合、启动 viewer

**配对门禁**：进入评审前，每个 eval 必须同时有 `with_skill` 和一个 baseline（`without_skill` 或 `old_skill`）。缺少配对时不要继续，除非用户明确接受部分数据。

1. **评分**：用 subagent 读取 `agents/grader.md`，对每个 assertion 评估输出。结果保存到每个 run 目录的 `grading.json`。`grading.json` 的 expectations 数组必须使用 `text`、`passed`、`evidence` 字段。
2. **聚合**：运行
   ```bash
   node <skill-creator-path>/scripts/dsh-skill-creator.mjs benchmark <workspace>/iteration-N \
     --skill-name <name> \
     --executor-model <model> --analyzer-model <model>
   ```
   生成 `benchmark.json` 和 `benchmark.md`，包含 pass_rate、time、tokens、mean±stddev、delta。
3. **Analyst pass**：读取 `agents/analyzer.md`，分析 benchmark 数据，找出“不管有没有 skill 都通过的断言”、高方差 eval、时间/token 权衡等。
4. **启动 viewer**：
   ```bash
   node <skill-creator-path>/scripts/dsh-skill-creator.mjs review <workspace>/iteration-N \
     --skill-name "my-skill"
   ```
   review 会自动读取同目录 `benchmark.json`。脚本会启动本地 HTTP server，尝试打开浏览器；如果打不开会打印 URL。用户提交反馈后，`feedback.json` 会写到 workspace。
5. **告诉用户**类似：“评审页已打开，Outputs 标签逐个看输出，Benchmark 标签看量化对比；完成后回来告诉我。”

### Step 5：读取反馈

用户完成后，读取 `feedback.json`：

```json
{
  "reviews": [
    {"run_id": "eval-0-with_skill", "feedback": "the chart is missing axis labels", "timestamp": "..."},
    {"run_id": "eval-1-with_skill", "feedback": "", "timestamp": "..."}
  ],
  "status": "complete"
}
```

空反馈表示用户觉得没问题。针对有具体意见的 test case 做改进。

## 改进 skill

这是循环的核心。

### 如何思考改进

1. **从反馈中泛化**：不要只修那几个例子，要想想 skill 能否被复用一百万次。
2. **保持精简**：删除不产生价值的指令。读 transcripts 而不只看最终输出。
3. **解释为什么**：告诉模型为什么要这样做，比堆砌 MUST 更有效。
4. **寻找重复工作**：如果多个 test case 都写了类似 helper 脚本，考虑把脚本收进 skill 的 `scripts/`。
5. **消除不必要的用户介入**：如果执行中需要向用户提问，或产生了未声明的用户侧副作用，优先通过设计（补全输入、给默认值、规避高风险步骤）消除，而不是让模型临场处理。

### 迭代循环

1. 应用改进
2. 重跑所有 test cases 到新的 `iteration-<N+1>/`，包含 baseline
3. 启动 viewer，传入 `--previous-workspace <workspace>/iteration-<N>`
4. 等用户反馈
5. 读取新反馈，继续改进

停止条件：

- 用户说满意
- 反馈全空
- 没有有意义的进展

## 校验与安装

### 校验

安装/交付前必须通过本地校验：

```bash
node <skill-creator-path>/scripts/dsh-skill-creator.mjs validate <path-to-skill>
```

如果校验失败，先修复再安装。

### 安装位置

- 默认：项目级 `.dsh/skills/<skill-name>/`
- 可选：全局 `~/.dsh/skills/<skill-name>/` 或 `~/.agents/skills/<skill-name>/`

把最终 skill 目录复制到目标位置，目录名必须与 `name` 一致。草稿和评测产物留在临时目录，不要把中间文件复制进安装目录。

## Description 优化（可选）

核心 skill 通过评审后，向用户提议做 description 优化。用户同意才做。

1. **生成 20 条 trigger eval queries**：8-10 条 should-trigger，8-10 条 should-not-trigger。查询要 realistic、具体，包含 near-miss。
2. **用户确认**：把查询集给用户看，允许增删改。
3. **DSH agent 内循环**：用当前 agent/subagent 迭代描述，最多 5 轮。
4. **应用结果**：把选出的最佳 description 写回 SKILL.md frontmatter，展示前后对比和分数。

## 已有 skill 的改进

如果用户要改已有 skill：

- **保留原 name**，不要改成新名字。
- 先把旧版本快照到 workspace 作为 baseline。
- 按上面的评测循环改进。
- 安装时覆盖原目录或按用户选择的位置安装。

## 临时目录与权限

- 优先使用系统临时目录（Windows `%TEMP%`，Unix `$TMPDIR`/`/tmp`）下的 `<skill-name>/` 与 `<skill-name>-workspace/`。
- 如果系统临时目录不可写（例如 workspace-write 沙箱限制），回退到 `<workspace>/.dsh-skill-creator-tmp/`，同样使用 `<skill-name>/` 与 `<skill-name>-workspace/`。
- 每次会话开始时先探测可写位置，避免中途失败。

## 工具与脚本

本 skill 目录提供：

- `scripts/dsh-skill-creator.mjs`：统一 CLI，子命令 `validate` / `benchmark` / `review`。
- `scripts/lib/`：共享实现。
- `scripts/test/`：`node --test` 单元与冒烟测试。
- `agents/grader.md`：如何用 subagent 评断言。
- `agents/analyzer.md`：如何分析 benchmark 结果。
- `references/schemas.md`：evals/grading/benchmark/feedback 的 JSON schema。

## 参考文件

- `agents/grader.md` — 需要评分时读取。
- `agents/analyzer.md` — 需要分析 benchmark 时读取。
- `references/schemas.md` — 需要写/校验 JSON 结构时读取。

## TodoList

这是一个多阶段流程，必须使用 DSH 的 `todo` 工具维护任务进度。至少包含：

- Capture Intent / intake（含自动化与用户介入边界确认）
- 写 SKILL.md 草稿
- 创建 evals JSON 并启动评测 viewer，让用户评审测试用例
- 根据反馈迭代
- 校验并安装

## 再次强调核心循环

- 弄清楚 skill 要做什么
- 默认目标：skill 端到端自动完成，除非高风险或设计阶段确认的必要确认点，不让用户介入
- 草拟或编辑 skill
- 用 DSH subagent 跑测试 prompts（带 skill + baseline）
- 和用户一起评估输出：
  - 运行 `dsh-skill-creator benchmark` 生成 benchmark
  - 启动 `dsh-skill-creator review` viewer 让用户评审
  - 跑量化 evals
- 重复直到用户满意
- 校验并安装最终 skill
- 可选：优化 description

祝你好运！
