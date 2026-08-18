# DSH Skill Creator

用于创建、评测和改进 DSH skill 的项目。

## 功能

- 提供一个开箱即用的 DSH skill（`dsh-skill-creator/`），覆盖从访谈、起草、评测、评审到迭代改进的完整流程。
- 内置纯 Node.js 的 CLI 工具（`validate` / `benchmark` / `review`），零第三方依赖。
- 通过本地 Web viewer 查看评测输出、量化结果并收集反馈。

## 现状

- 当前包含 **1 个 skill**：`dsh-skill-creator`，已可用。
- skill 使用方式见 [`dsh-skill-creator/SKILL.md`](dsh-skill-creator/SKILL.md)。
- CLI 脚本位于 `dsh-skill-creator/scripts/`，自带 `node --test` 测试（22 个用例全部通过）。

## 未来计划

- 将当前 skill 封装为 **DSH 专用插件**，方便通过 DSH 插件机制直接安装/加载。
- 后续可扩展更多 skill 开发相关能力，但会保持零依赖和轻量维护。
