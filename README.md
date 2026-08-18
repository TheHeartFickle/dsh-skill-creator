# DSH Skill Creator

用于创建、评测和改进 DSH skill 的项目，同时以 DSH 插件形式分发。

## 功能

- 提供一个开箱即用的 DSH skill（`dsh-skill-creator/`），覆盖从访谈、起草、评测、评审到迭代改进的完整流程。
- 内置纯 Node.js 的 CLI 工具（`validate` / `benchmark` / `review`），零第三方依赖。
- 通过本地 Web viewer 查看评测输出、量化结果并收集反馈。
- 已封装为 DSH 插件：`@theheartfickle/dsh-skill-creator-plugin`，安装后自动注册 `dsh-skill-creator` skill。

## 安装

### 官方 npm / DSH CLI（发布 npm 后）

```sh
dsh plugin --profile web add @theheartfickle/dsh-skill-creator-plugin@latest
```

### plugin-registry（可选）

仓库已提供 `dsh.plugin.json`（id：`theheartfickle/dsh-skill-creator`），为后续接入 `dsh registry` 通道做好准备。

## 磁盘写入说明

- **不会写入 skill 安装目录**：插件不会在 `.dsh/skills`、`.agents/skills` 或任何 skill 安装位置保存/修改文件。
- **使用 skill 创建/评测/评审时**：只会在你指定的工作区或系统临时目录产生实际项目文件，例如：
  - 新 skill 草稿：`SKILL.md`、`evals/`、`references/`、`agents/` 等
  - 评测 workspace：`iteration-N/`、`eval-*/with_skill/outputs/`、`grading.json`、`execution.json`
  - benchmark 结果：`benchmark.json`、`benchmark.md`
  - 评审反馈：`feedback.json`
- 如果系统临时目录不可写，会回退到工作区 `.dsh-skill-creator-tmp/` 存放临时数据。

## 现状

- 当前包含 **1 个 skill**：`dsh-skill-creator`，已可用。
- skill 使用方式见 [`dsh-skill-creator/SKILL.md`](dsh-skill-creator/SKILL.md)。
- CLI 脚本位于 `dsh-skill-creator/scripts/`。
- 测试：根目录和 `dsh-skill-creator/scripts/` 共 **27 个** `node --test` 用例全部通过。

## 未来计划

- 将插件发布到 npm，支持 `dsh plugin add` 一键安装。
- 补充 `dsh registry` 打包脚本，接入 plugin-registry 安装通道。
- 后续可扩展更多 skill 开发相关能力，但会保持 CLI 零依赖和轻量维护。
