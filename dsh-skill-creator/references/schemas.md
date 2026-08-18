# JSON Schemas

本文档定义 dsh-skill-creator 使用的 JSON 数据结构。写 evals、grading、execution、benchmark 或读取 feedback 时，以本文件为准。

---

## evals.json

定义待评测的测试用例。位于草稿 skill 目录的 `evals/evals.json`。

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": "eval-1",
      "prompt": "User's example prompt",
      "expected_output": "Description of expected result",
      "files": ["evals/files/sample1.pdf"],
      "expectations": [
        "The output includes X",
        "The skill used script Y"
      ]
    }
  ]
}
```

字段：

- `skill_name`: 与 skill frontmatter 的 `name` 一致。
- `evals[].id`: 唯一字符串 ID。
- `evals[].prompt`: 要执行的用户任务。
- `evals[].expected_output`: 人类可读的成功描述。
- `evals[].files`: 可选，输入文件路径列表（相对 skill 根目录）。
- `evals[].expectations`: 可选，可验证的断言列表。

---

## eval_metadata.json

每个 eval 运行目录的元数据。位于 `<iteration>/<eval-dir>/eval_metadata.json`。

```json
{
  "eval_id": "eval-1",
  "eval_name": "descriptive-name-here",
  "prompt": "The user's task prompt",
  "assertions": []
}
```

字段：

- `eval_id`: 字符串，对应 `evals.json` 的 `id`。
- `eval_name`: 简短、描述性的名称，用作 viewer 中的标题。
- `prompt`: 实际执行的 prompt。
- `assertions`: 初始可为空；并行运行期间补上可客观验证的断言。

---

## grading.json

Grader agent 的输出。位于每个 run 目录（如 `<eval-dir>/with_skill/grading.json`）。

```json
{
  "expectations": [
    {
      "text": "The output includes the name 'John Smith'",
      "passed": true,
      "evidence": "Found in transcript Step 3: 'Extracted names: John Smith, Sarah Johnson'"
    },
    {
      "text": "The spreadsheet has a SUM formula in cell B10",
      "passed": false,
      "evidence": "No spreadsheet was created. The output was a text file."
    }
  ],
  "summary": {
    "passed": 2,
    "failed": 1,
    "total": 3,
    "pass_rate": 0.67
  },
  "claims": [
    {
      "claim": "The form has 12 fillable fields",
      "type": "factual",
      "verified": true,
      "evidence": "Counted 12 fields in field_info.json"
    }
  ],
  "user_notes_summary": {
    "uncertainties": ["Used 2023 data, may be stale"],
    "needs_review": [],
    "workarounds": ["Fell back to text overlay for non-fillable fields"]
  },
  "eval_feedback": {
    "suggestions": [
      {
        "assertion": "The output includes the name 'John Smith'",
        "reason": "A hallucinated document that mentions the name would also pass"
      }
    ],
    "overall": "Assertions check presence but not correctness."
  }
}
```

字段：

- `expectations[]`: 每条必须包含 `text`、`passed`、`evidence`。viewer 依赖这三个字段名。
- `summary`: `passed`、`failed`、`total`、`pass_rate`。
- `claims`: `claim`、`type`（factual/process/quality）、`verified`、`evidence`。
- `user_notes_summary`: executor 标记的不确定、需复查、绕过点。
- `eval_feedback`: 可选，grader 对 eval 本身的改进建议。

> 时间、token、工具调用等执行数据不再放入 grading.json，统一写入 run 根目录的 `execution.json`。

---

## execution.json

每次 subagent 完成时记录执行数据。位于每个 run 根目录（与 `grading.json` 同级）。

```json
{
  "run_number": 1,
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3,
  "total_tool_calls": 15,
  "errors_encountered": 0,
  "tool_calls": {
    "Read": 5,
    "Write": 2,
    "Bash": 8
  },
  "total_steps": 6,
  "files_created": ["filled_form.pdf", "field_values.json"],
  "output_chars": 12450,
  "transcript_chars": 3200,
  "executor_start": "2026-01-15T10:30:00Z",
  "executor_end": "2026-01-15T10:32:45Z",
  "executor_duration_seconds": 165.0,
  "grader_start": "2026-01-15T10:32:46Z",
  "grader_end": "2026-01-15T10:33:12Z",
  "grader_duration_seconds": 26.0
}
```

字段：

- `run_number`: 整数，该 run 在 configuration 下的第几次运行；缺省时脚本会从路径 `run-N` 推导，直接配置目录默认为 1。
- `total_tokens`: 总 token 消耗。
- `duration_ms` / `total_duration_seconds`: 总时长。
- `total_tool_calls` / `errors_encountered`: 工具调用数与错误数。
- 其余字段可选，供分析和 viewer 展示。

---

## benchmark.json

`dsh-skill-creator benchmark` 的输出。位于 `<iteration>/benchmark.json`。

```json
{
  "metadata": {
    "skill_name": "example-skill",
    "skill_path": "/path/to/example-skill",
    "executor_model": "<model-name>",
    "analyzer_model": "<model-name>",
    "timestamp": "2026-01-15T10:30:00Z",
    "evals_run": ["eval-1", "eval-2", "eval-3"],
    "runs_per_configuration": 1
  },
  "runs": [
    {
      "eval_id": "eval-1",
      "eval_name": "Ocean",
      "configuration": "with_skill",
      "run_number": 1,
      "result": {
        "pass_rate": 0.85,
        "passed": 6,
        "failed": 1,
        "total": 7,
        "time_seconds": 42.5,
        "tokens": 3800,
        "tool_calls": 18,
        "errors": 0
      },
      "expectations": [
        {"text": "...", "passed": true, "evidence": "..."}
      ],
      "notes": [
        "Used 2023 data, may be stale"
      ]
    }
  ],
  "run_summary": {
    "with_skill": {
      "pass_rate": {"mean": 0.85, "stddev": 0.05, "min": 0.80, "max": 0.90},
      "time_seconds": {"mean": 45.0, "stddev": 12.0, "min": 32.0, "max": 58.0},
      "tokens": {"mean": 3800, "stddev": 400, "min": 3200, "max": 4100}
    },
    "without_skill": {
      "pass_rate": {"mean": 0.35, "stddev": 0.08, "min": 0.28, "max": 0.45},
      "time_seconds": {"mean": 32.0, "stddev": 8.0, "min": 24.0, "max": 42.0},
      "tokens": {"mean": 2100, "stddev": 300, "min": 1800, "max": 2500}
    },
    "delta": {
      "pass_rate": "+0.50",
      "time_seconds": "+13.0",
      "tokens": "+1700"
    }
  },
  "notes": []
}
```

字段：

- `metadata`: skill 名称、路径、时间戳、运行的 eval 列表、每配置 run 数量。
- `runs[]`: 每个 run 的指标与 expectations。
  - `eval_id`: 字符串。
  - `configuration`: 通常是 `with_skill`、`without_skill` 或 `old_skill`。
  - `result.pass_rate/passed/failed/total/time_seconds/tokens/tool_calls/errors`: viewer 依赖这些字段名。
- `run_summary`: 每个配置的 mean/stddev/min/max，以及 delta。
- `notes`: analyzer 的观察，初始为空。

---

## feedback.json

Viewer 提交后的反馈。位于 `<iteration>/feedback.json`。

```json
{
  "reviews": [
    {
      "run_id": "eval-0-with_skill",
      "feedback": "the chart is missing axis labels",
      "timestamp": "2026-01-15T10:35:00.000Z"
    },
    {
      "run_id": "eval-1-with_skill",
      "feedback": "",
      "timestamp": "2026-01-15T10:35:01.000Z"
    }
  ],
  "status": "complete"
}
```

字段：

- `reviews[].run_id`: 与 viewer 中显示 run 的 id 一致。
- `reviews[].feedback`: 用户反馈；空字符串表示该 run 没问题。
- `reviews[].timestamp`: ISO 时间戳。
- `status`: `complete` 表示用户已提交。
