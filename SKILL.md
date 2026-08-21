---
name: local-ocr
slug: local-ocr
version: 1.0.0
displayName: 本地OCR文字识别
description: "离线本地 OCR：识别图片（PNG/JPG/BMP/WebP/TIFF/GIF）和 PDF 中的文字，返回结构化文本。优先用 Windows 原生 OCR 引擎（微软官方，中文精度最高），回退 RapidOCR / Tesseract。当用户需要从图片或 PDF 提取文字、识别截图/扫描件/票据/表格文字、做 OCR 识别，或把图片文字喂给模型理解时使用。零云端成本、离线可用。"
dependency:
  python:
    - winocr
    - pillow
metadata:
  platforms: ["windows"]
  requires:
    bins: ["python", "tesseract"]
---

# 本地 OCR 文字识别（离线）

> 在 Windows 上离线识别图片/PDF 中的文字，输出结构化文本，供模型理解。**零云端成本、离线可用**，替代不可用的云端视觉（DeepSeek-V4-Flash 不支持 image 输入，须用 OCR 文本喂模型）。
>
> **★ 本技能是图片理解统一通道（环境级政策）**：当前部署环境无可用视觉模型（describe_image 报 baseURL 未配置、read_image 需要模型支持图像输入），所有"图片上是什么 / 看图 / 描述图片 / 截图含义"请求一律走本技能，不得尝试其他视觉通道。

## 前置准备

### 依赖（系统 Python 3.11，勿用项目 .venv 3.14——onnxruntime 兼容差）

```bash
# winocr：封装 Windows.Media.Ocr 原生引擎（首选，中文精度最高）
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple winocr
# pillow：自测图生成与预处理
pip install pillow
# Tesseract（兜底）：scoop install tesseract，语言包 chi_sim+eng
# 系统需装 Windows 中文 OCR 语言包（zh-Hans-CN，Win11 通常自带）
```

### 核心脚本位置

- 主脚本：本仓库 `scripts/ocr_tool.py`（与仓库同目录结构部署时无需改路径）
- `scripts/ocr.bat` 是便捷包装（`%~dp0` 定位同目录脚本，可整体移动）

## 引擎策略（自动选择，无需手动指定）

1. **Windows 原生 OCR（winocr）** ★首选：中文精度最高，系统内置零下载
2. **RapidOCR**：若已安装（onnxruntime + PaddleOCR 模型），复杂版式/表格好
3. **Tesseract**：兜底（中文精度差，仅回退）

## 操作步骤

### 标准流程（图片）

1. **确认文件存在**：`Test-Path <路径>`
2. **运行 OCR**（仓库根目录下执行）：
   ```bash
   python scripts/ocr_tool.py "<图片路径>" --json
   ```
   或 `scripts\ocr.bat "<图片路径>" --json`
3. **读取结果**：返回 JSON，含 `lines`（每行 text+score）和 `text`（合并全文）
4. **数字/易混淆字校验**：OCR 偶有形近字误差（如"零件"→"零亻牛"、全角"．"vs"."、L/I 混淆），**静默**结合上下文纠正，只给最终结果
5. **汇报**：把完整文字列给用户；备注低置信行

### 标准流程（PDF）

```bash
python scripts/ocr_tool.py "<pdf路径>" --json
```
返回 `pages`（每页 text）。依赖 pypdfium2 / PyMuPDF / pypdf 之一。

## 参数

| 参数 | 说明 |
|------|------|
| `--json` | 输出结构化 JSON（推荐，供程序/模型解析） |
| `--engine auto\|win\|rapid\|tess` | 指定引擎（默认 auto） |
| `--preprocess` | 图片预处理（放大/增强），Tesseract 低清图用 |
| `--selftest` | 生成含中文测试图并对比各引擎 |

## 常见坑（务必遵守）

- **用系统 Python 3.11**（`python`），不是项目 `.venv`（3.14，onnxruntime 无 wheel）
- **PowerShell 控制台乱码**是 GBK 解码 UTF-8 所致，文件内容正确；dsh 工具调用无此问题。确认真实内容用 `--json` 或写 UTF-8 文件再读
- **Windows OCR 中文间会自动加空格**（`探 索`），`ocr_tool.py` 已自动清理 CJK 间空格
- **模版/截图放大后再识别**能显著提升小字精度（`--preprocess` 或先放大 2x）
- 若 `winocr` 未装，`_winocr_ready()` 返回 False 会自动回退 Tesseract，不影响使用
- **dsh 上传附件无扩展名**（如 `~/.dsh/attachments/v1/objects/44/<sha256>`）：脚本按扩展名校验会拒（"不支持的扩展名"），先复制为带 `.png`/`.jpg` 扩展名的临时文件再 OCR

## 验证记录

- 自测：Windows OCR 完整识别「探索未至之境 / 中文识别精度测试 / 供应商: 延锋 ASQE / 零件编号 P/N: 1234567890」
- 真实业务图：识别出 5 行（供应商/零件号/不良率/电话），手机号 `13800138000` 100% 正确
- dsh 端到端：模型通过工具调用 `ocr_tool.py` 自动识别并汇报（退出码 0）
