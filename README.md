# local-ocr —— 离线本地 OCR 技能（Skill）

在 Windows 上**离线**识别图片/PDF 中的文字，输出结构化文本。**零云端成本、离线可用**，专为"模型无视觉输入、须以 OCR 文本喂模型"的 Agent 环境设计。

## 特性

- 引擎自动选择：**Windows 原生 OCR**（微软官方引擎，中文精度最高）→ RapidOCR → Tesseract
- 支持图片：PNG / JPG / JPEG / BMP / WebP / TIFF / GIF；PDF 逐页转图片识别
- 结构化 JSON 输出：图片返回 `lines`（text+score）与 `text`；PDF 返回 `pages`
- 预处理增强（放大/灰度/二值化/降噪）、引擎对比自测

## 目录结构

```
local-ocr/
├── SKILL.md              # 技能指令（agent 加载后按其执行）
├── scripts/
│   ├── ocr_tool.py       # OCR 实现（唯一真源，本仓库快照）
│   └── ocr.bat           # 便捷包装（%~dp0 定位，可整体移动）
├── README.md
└── LICENSE               # MIT
```

## 依赖

- **Python 3.11**（系统 `python`；勿用 onnxruntime 兼容差的 3.14 venv）
- `pip install winocr pillow`（winocr 为首选引擎；pillow 用于预处理/自测）
- Tesseract（可选兜底，需 chi_sim + eng 语言包）
- Windows 中文 OCR 语言包（zh-Hans-CN，Win11 通常自带）

## 用法

```bash
# 图片或 PDF，输出结构化 JSON（推荐）
python scripts/ocr_tool.py "<文件路径>" --json

# 或直接用批处理包装
scripts\ocr.bat "<文件路径>" --json

# 自测：生成中文测试图并对比各引擎
python scripts/ocr_tool.py --selftest
```

### 参数

| 参数 | 说明 |
|------|------|
| `--json` | 结构化 JSON 输出 |
| `--engine auto\|win\|rapid\|tess` | 引擎选择（默认 auto） |
| `--preprocess` | 图片预处理（放大/增强），低清图用 |
| `--selftest` | 中文测试图引擎对比 |

## 常见问题

- **控制台乱码**：GBK 解码 UTF-8 所致，文件内容正确；用 `--json` 或写文件确认
- **Windows OCR 中文间自动加空格**（`探 索`）：脚本已自动清理 CJK 间空格
- **dsh 上传附件无扩展名**：先复制为 `.png`/`.jpg` 临时文件再识别
- **形近字误差**（L/I、全角点、漏字）：结合上下文静默纠正，只给最终结果

## 验证记录

- Windows 原生 OCR 对中文测试图 5 行 100% 置信度（自测通过）
- 真实业务截图识别：供应商/零件号/不良率/电话，手机号 100% 正确
- Agent 端到端调用退出码 0

## 许可

MIT
