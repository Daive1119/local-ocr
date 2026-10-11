# local-ocr —— 离线本地 OCR 技能（Skill）

在 Windows 上**离线**识别图片/PDF 中的文字，输出结构化文本。**零云端成本、离线可用**，专为"模型无视觉输入、须以 OCR 文本喂模型"的 Agent 环境设计。

- 引擎自动选择：**Windows 原生 OCR**（微软官方引擎，中文精度最高）→ RapidOCR → Tesseract
- 支持图片：PNG / JPG / JPEG / BMP / WebP / TIFF / GIF；PDF 逐页转图片识别
- 结构化 JSON 输出、预处理增强、引擎对比自测

---

## 作为 dsh 插件安装（v1.1.0+）

本仓库同时是一个可安装的 DeepSeek Harness 插件：`package.json` 声明了 `dsh.bundle`，`cordis.patch.yml` 插入一行插件条目。装上后，模型拿到**一个 `ocr` 工具**，直接对图片/PDF 做离线识别，不需要模型自己具备视觉输入。

```bash
# 从 GitHub 安装（本插件无构建步骤，不需要 allowBuilds 授权）
dsh plugin --profile <profile> add github:Daive1119/local-ocr

# 或者从本地克隆安装
dsh plugin --profile <profile> add <本仓库路径>
```

注册的工具：

| 参数 | 必填 | 说明 |
|------|------|------|
| `path` | ✅ | 一张图片或一个 PDF 的路径 |
| `engine` | | `auto`（默认）/ `win` / `rapid` / `tess`，传给脚本的引擎偏好 |
| `preprocess` | | 识别前预处理（2x 放大/灰度/对比度/降噪），低清图用；PDF 忽略 |

返回值与脚本的 `--json` 同构：图片返回 `text` + 逐行 `lines`（含 `score`），PDF 返回逐页 `pages`。
`engine` 字段回显的是**请求的**引擎偏好，不是实际产出文字的引擎——脚本不报告后者。

可选配置（写在插件条目里）：

```yaml
- id: local-ocr
  name: dsh-local-ocr
  config:
    python: python        # 解释器（默认 python）
    scriptPath: ...       # 换用别的 ocr_tool.py 副本
    timeoutMs: 120000     # 单次识别墙钟上限
```

> 注意：插件的 `ocr` 工具与 `SKILL.md` 是同一套能力的两种用法。`SKILL.md` 仍可单独复制到技能目录，按技能方式使用。

---

## 目录结构

```
local-ocr/
├── SKILL.md              # 技能指令（agent 加载后按其执行）
├── index.js              # dsh 插件宿主半：注册 ocr 工具（v1.1.0+）
├── cordis.patch.yml      # 插件条目（dsh.bundle.patch 指向它）
├── package.json          # 声明 dsh.bundle，使本仓库可被 dsh plugin add 安装
├── scripts/
│   ├── ocr_tool.py       # OCR 实现（本仓库快照，约 430 行，无第三方框架依赖）
│   └── ocr.bat           # 便捷包装（%~dp0 定位同目录脚本，可整体移动）
├── README.md
└── LICENSE               # MIT
```

## 依赖

- **Python 3.11**（系统 `python`；勿用 onnxruntime 兼容差的 3.14 venv）
- `pip install winocr pillow`（winocr 为首选引擎；pillow 用于预处理/自测/PDF 渲染辅助）
- Tesseract（可选兜底：`scoop install tesseract` 或 `Program Files\Tesseract-OCR`，需 chi_sim + eng 语言包）
- PDF 渲染（三选一）：pypdfium2（首选）→ PyMuPDF（fitz）→ pypdf（仅文本层）
- Windows 中文 OCR 语言包（zh-Hans-CN，Win11 通常自带；Win10 需在"设置→语言"中手动添加）

## 用法

```bash
# 图片或 PDF，输出结构化 JSON（推荐）
python scripts/ocr_tool.py "<文件路径>" --json

# 或直接用批处理包装
scripts\ocr.bat "<文件路径>" --json

# 自测：生成中文测试图并对比各引擎
python scripts/ocr_tool.py --selftest

# 指定引擎 / 低清图预处理
python scripts/ocr_tool.py "<图片>" --json --engine tess --preprocess
```

### 参数

| 参数 | 说明 |
|------|------|
| `--json` | 结构化 JSON 输出（推荐） |
| `--engine auto\|win\|rapid\|tess` | 引擎选择（默认 auto） |
| `--preprocess` | 图片预处理（放大 2x/灰度/对比度/降噪），低清图用 |
| `--selftest` | 生成含中文测试图并对比各引擎 |

---

## AI 阅读配置（模型如何消费 OCR 输出）

本技能的核心场景：**把图片/PDF 转成文本喂给不具备视觉输入的模型**（如 DeepSeek-V4-Flash 等文本模型），或作为视觉通道的备用/交叉验证。

### 五步阅读流程

1. **定位文件**：dsh 附件在 `~/.dsh/attachments/v1/objects/<xx>/<sha256>`，无扩展名先复制为 `.png`/`.jpg` 再识别
2. **执行识别**：`python scripts/ocr_tool.py "<文件路径>" --json`
3. **解析 JSON**：读 `lines`/`pages` 字段（勿依赖控制台文本，防 GBK 显示乱码）
4. **静默纠正**：形近字（L/I、O/0、全角点、漏字）结合上下文纠正
5. **汇报**：完整文字 + 低置信行备注

### 置信度语义（勿混用）

| score 来源 | 语义 | 使用建议 |
|---|---|---|
| win | 恒 100.0（API 不提供置信度） | **不能**作为质量依据 |
| tess | 真实平均置信度 | <80 需复核 |
| rapid | 检测模型分数 | 与 tess 不可直接比较 |

> 引擎选择、预处理、输出结构等细节见下方「工作原理」各节。

---

## 工作原理（详细）

### 1. 总体流程

```
CLI 入口 (argparse)
  └─ ocr_file(path, engine, preprocess)        # 统一入口
       ├─ 扩展名校验: .pdf → PDF 管线; 图片扩展名 → 图片管线; 其他 → 报错
       ├─ 图片: ocr_image() → 引擎链 → [(text, score), ...]
       └─ PDF:   pdf_to_images() 渲染每页 → 逐页 ocr_image() → pages
       └─ 组装 {ok, type, engine, lines|pages, text}
```

全程离线：不调用任何云端 API，无网络依赖（仅首次 `pip install` 需要网络）。

### 2. 引擎选择与降级链（auto 语义）

各引擎可用性**惰性探测并缓存**（进程内只探测一次）：

| 探测函数 | 判定方式 | 失败后果 |
|---|---|---|
| `_winocr_ready()` | `import winocr` + 枚举系统 OCR 语言 | win 不可用 |
| `_rapidocr_ready()` | `import rapidocr` | rapid 不可用 |
| `_find_tesseract()` | 依次试 PATH → `scoop/shims/tesseract.exe` → `Program Files/Tesseract-OCR` | tess 不可用 |

**auto 模式的执行链**（`ocr_image`）：

1. **win**（可用时）：识别 → 有结果立即返回
2. **rapid**（可用时）：win 无结果才轮到它
3. **tess**（兜底）：前两者无结果或不可用时

关键语义：**"有结果" = 返回非空行列表**。win 可用但输出为空（如空白图、异常图），会静默继续走 rapid/tess——这是自动降级，不报错。

### 3. Windows 原生 OCR（winocr）★首选

- 封装系统内置 `Windows.Media.Ocr`（WinRT/UWP API），调用 `winocr.recognize_pil_sync(img, lang)`
- **语言选择**：`_winocr_pick_lang()` 从系统可用语言中优先挑含 `zh/hans/cn` 的标签；**一个都没有时退回第一个可用语言**（可能不是中文！）
- **置信度语义**：Windows OCR API 不提供逐行置信度，脚本对每行标记 `score=100.0`——**100 分不代表"完美"，只代表"该行已返回"**
- 中文精度最高、零下载、系统内置
- 已知行为：中文之间会自动插空格（`探 索`），由 `_clean_win_text()` 清理（见第 8 节）

### 4. Tesseract（兜底）

- 定位方式见上表；命令行调用：`tesseract <图> <out> -l chi_sim+eng --psm 3 tsv`（psm 3 = 自动分页）
- 解析 TSV 输出（text/conf/left/top 列）：
  - 按 `top // 8` 分桶（纵向 8px 内视为同一行）
  - 桶内按 `left` 排序拼接 → 得到行文本
  - 行置信度 = 桶内各词 conf 的**平均值**（真实置信度，可作质量参考）
- 低清图敏感：`engine==tess` 时**强制**走预处理管线（见第 7 节）
- 中文精度明显低于 Windows 原生 OCR，仅作回退

### 5. RapidOCR（可选增强）

- `rapidocr.RapidOCR()` 惰性单例（进程内只初始化一次），基于 onnxruntime + PaddleOCR 检测/识别模型
- 适合复杂版式/表格（检测框更细）；未安装时自动跳过
- 依赖 onnxruntime：**Python 3.14 无兼容 wheel**，这是"必须用 3.11"的根本原因

### 6. PDF 处理

三级策略（`pdf_to_images`，dpi=200）：

1. **pypdfium2**：逐页渲染为位图 → OCR（扫描件也能识别，首选）
2. **PyMuPDF (fitz)**：pypdfium2 缺失时兜底渲染
3. **pypdf**：仅在前两者都缺失时，尝试直接抽取**文本层**（对扫描件/图片型 PDF 无效，返回空）

注意：即使渲染成功，**扫描件若无文字层、图片又模糊**，OCR 结果可能为空页——结果里空文本页会被过滤（`if t`）。

### 7. 图像预处理管线（`preprocess_image`）

`--preprocess` 或 tess 引擎时执行，顺序：

1. **放大 2x**（LANCZOS 高质量重采样）——小字变清晰
2. 转 RGB → **灰度**（去除色彩干扰）
3. **自动对比度拉伸**（autocontrast）
4. **对比度增强 1.5x**
5. **高斯模糊 0.5**（轻微降噪，去椒盐/扫描噪点）

另外：win/auto 引擎即使不预处理，也会做 **1.5x LANCZOS 放大（保留色彩）**，因为 Windows OCR 对尺寸敏感。

### 8. CJK 空格清理（`_clean_win_text`）

两条正则：

- 删除 **CJK 字符之间**的空格：`探 索 未 至 之 境` → `探索未至之境`
- 删除 **CJK 与中文标点之间**的空格（，。！？；：等）

英文单词之间的空格**保留**（如 `P/N: 12345` 不乱拼）——这是设计上"只清 CJK"的原因。

### 9. 输出结构

```jsonc
// 图片
{ "ok": true, "type": "image", "engine": "auto",
  "lines": [ { "text": "供应商: 延锋 ASQE", "score": 100.0 } ],
  "text": "供应商: 延锋 ASQE\n零件编号 P/N: 1234567890" }

// PDF
{ "ok": true, "type": "pdf", "engine": "auto",
  "pages": [ { "page": 1, "text": "第 1 页文字" } ] }

// 失败（统一形态）
{ "ok": false, "error": "不支持的扩展名 .xyz" }
```

stdout 强制 UTF-8 输出（`sys.stdout.reconfigure`），避免控制台编码问题。

---

## 可能出现的错误与排查

### A. 环境 / 依赖类

| 现象 | 原因 | 处理 |
|---|---|---|
| `ModuleNotFoundError: winocr` | 首选引擎未装 | `pip install winocr`；装前会自动降级 tess，不影响使用 |
| 中文识别乱码/全是拼音 | 系统缺 zh-Hans OCR 语言包，winocr 退回第一个可用语言 | Win10：设置→语言→添加"中文(简体)"→安装 OCR 组件；Win11 通常自带 |
| `ModuleNotFoundError: onnxruntime` 或 rapidocr 导入失败 | rapidocr 依赖安装不全，或 Python 3.14 无 wheel | 用系统 Python 3.11；`pip install rapidocr onnxruntime` |
| 引擎列表为空（`--selftest` 输出"无可用引擎"） | winocr 未装 且 tesseract 未装/未在 PATH | 至少装 winocr 或 tesseract 之一 |
| Tesseract 报语言错误 | 缺 chi_sim 语言包 | `scoop install tesseract-languages` 或手动放 tessdata |

### B. 输入文件类

| 现象 | 原因 | 处理 |
|---|---|---|
| `不支持的扩展名` | 扩展名不在白名单（含 **dsh 附件无扩展名** 的情况） | 复制为 `.png`/`.jpg` 临时文件再识别 |
| `文件不存在: ...` | 路径错/相对路径基准不对 | 用绝对路径，先 `Test-Path` 确认 |
| OCR 结果全空 | 图片损坏、纯色图、或内容极小 | 换图；`--preprocess` 放大后重试 |
| PDF 每页都空 | 扫描件且渲染库缺失，或图片极模糊 | 装 pypdfium2；确认 PDF 非加密 |

### C. 引擎行为类

| 现象 | 原因 | 处理 |
|---|---|---|
| 明明 win 可用，结果却是 tess 风格（中文被拆碎） | auto 链中 win 返回空（图异常）静默降级 | 用 `--engine win` 强制；或 `--json` 看 `engine` 字段确认实际引擎 |
| 同一张图两次结果不同 | 引擎不同（auto 降级） | 固定 `--engine` |
| tess 输出把两行并成一行 | TSV 行合并按 `top//8` 分桶，行距 <8px 的会合并 | 预处理放大后重试（行距拉开） |
| 大 PDF 内存暴涨/变慢 | 全部页面一次性渲染（dpi=200） | 拆分 PDF 分批识别 |

### D. 输出 / 编码类

| 现象 | 原因 | 处理 |
|---|---|---|
| PowerShell 控制台中文乱码 | PS 5.1 默认 GBK 解码 UTF-8 输出 | 内容本身正确；用 `--json` 或重定向到 UTF-8 文件读取 |
| JSON 里中文变 `\uXXXX` | 正常转义（`ensure_ascii=False` 已关，但终端显示可能转义） | 程序解析时自动还原，不影响 |

### E. 精度类（务必理解评分语义）

- **win 的 score 恒为 100.0**：不是置信度！Windows OCR 不提供；**不能靠分数判断质量**
- **tess 的 score 是真实平均置信度**（TSV conf 均值），<80 的行要留意
- **rapid 的 score 来自检测模型**，语义与 tess 不同
- **形近字误差**（高置信度也可能错）：L/I、O/0、全角"．"vs 半角"."、漏字（"示例"→"小例"）→ 结合上下文静默纠正，只给最终结果
- 数字/零件号等关键字段：识别后**必须对照上下文校验**（如 8 vs B、1 vs l）
- 低清/斜体/艺术字：预处理可救一部分；旋转超过 15° 建议先人工摆正

---

## 验证记录

- Windows 原生 OCR 对中文测试图 5 行全部 100% 识别（自测通过：探索未至之境 / 中文识别精度测试 / 供应商: 延锋 ASQE / 零件编号 P/N: 1234567890）
- 真实业务截图：供应商/零件号/不良率/电话 5 行识别，手机号 `13800138000` 100% 正确
- Agent 端到端调用退出码 0；dsh 附件（无扩展名）复制为 .png 后识别成功

## 许可

MIT
