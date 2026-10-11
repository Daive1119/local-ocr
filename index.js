/**
 * dsh-local-ocr — host half.
 *
 * Registers the model-facing `ocr` tool. The tool runs the bundled
 * `scripts/ocr_tool.py` as a local subprocess; that script recognizes text
 * offline with the Windows native OCR engine first, then RapidOCR, then
 * Tesseract, and prints one JSON result. No network request is made, and the
 * recognized text is the only thing read back from the subprocess.
 */
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** Stable Loader identity. */
export const name = 'local-ocr'

/** Services used by the registered tool. */
export const inject = ['tools']

/** Engine preferences `ocr_tool.py` accepts. */
const ENGINES = ['auto', 'win', 'rapid', 'tess']

/** Default wall-clock budget for one recognition. */
const DEFAULT_TIMEOUT_MS = 120_000

/** Upper bound on one run's stdout; recognized text only, but PDFs can be large. */
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024

/** The bundled script, resolved relative to this module. */
const BUNDLED_SCRIPT = fileURLToPath(new URL('./scripts/ocr_tool.py', import.meta.url))

/**
 * Run the OCR script once and resolve its stdout.
 * @param options - interpreter, script path, CLI arguments, budget, and caller signal.
 * @returns The stdout of a successful run.
 */
function runScript({ python, script, argv, timeoutMs, signal }) {
  return new Promise((resolve, reject) => {
    execFile(python, [script, ...argv], {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
      signal,
    }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(stdout)
        return
      }
      if (error.name === 'AbortError') {
        reject(new Error('ocr call aborted'))
        return
      }
      if (error.killed) {
        reject(new Error(`ocr timed out after ${timeoutMs} ms; raise config.timeoutMs or pass a smaller input`))
        return
      }
      const detail = String(stderr ?? '').trim() || error.message
      reject(new Error(`ocr could not run "${python}" on ${script}: ${detail}`))
    })
  })
}

/**
 * Render one recognized result as the text the model reads.
 * @param value - the tool's own return value.
 * @returns The recognized text, or an explicit note when nothing was recognized.
 */
function renderText(value) {
  if (value.type === 'pdf') {
    const text = value.pages.map((page) => `--- page ${page.page} ---\n${page.text}`).join('\n')
    return text.trim() === '' ? '(no text recognized in this PDF)' : text
  }
  return value.text.trim() === '' ? '(no text recognized in this image)' : value.text
}

/**
 * Register `ocr`.
 * @param ctx - host context carrying the tool registry.
 * @param config - optional `python`, `scriptPath`, and `timeoutMs` overrides.
 */
export function apply(ctx, config = {}) {
  const python = config.python ?? 'python'
  const script = config.scriptPath ?? BUNDLED_SCRIPT
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (typeof python !== 'string' || python.trim() === '') {
    throw new Error('local-ocr: config.python must be a non-empty string')
  }
  if (typeof script !== 'string' || script.trim() === '') {
    throw new Error('local-ocr: config.scriptPath must be a non-empty string')
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('local-ocr: config.timeoutMs must be a positive integer')
  }

  ctx.tools.register(defineTool({
    name: 'ocr',
    description: 'Extract text from an image (PNG/JPG/BMP/WebP/TIFF/GIF) or a PDF with the bundled offline OCR script. Recognition runs locally: Windows native OCR first, then RapidOCR, then Tesseract. Returns the recognized text, with per-line results for images and per-page results for PDFs.',
    parameters: {
      path: {
        type: 'string',
        required: true,
        description: 'Path to one image or PDF file. Relative paths resolve against the working directory of the Harness process.',
      },
      engine: {
        type: 'string',
        enum: ENGINES,
        description: "Engine preference passed to the script. 'auto' (the default) tries the Windows native engine, then RapidOCR, then Tesseract.",
      },
      preprocess: {
        type: 'boolean',
        description: 'Preprocess the image before recognition (2x upscale, grayscale, contrast stretch, denoise). Useful for small or low-quality images; ignored for PDFs.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: {
            type: 'string',
            required: true,
            enum: ['image', 'pdf'],
            description: 'Input kind, inferred from the file extension.',
          },
          engine: {
            type: 'string',
            required: true,
            enum: ENGINES,
            description: 'The engine preference that was requested. The script echoes the request; it does not report which engine actually produced the text.',
          },
          text: {
            type: 'string',
            description: 'Recognized text, for an image input. Lines are joined with newlines.',
          },
          lines: {
            type: 'array',
            description: 'Per-line results, for an image input.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                text: { type: 'string', required: true },
                score: {
                  type: 'number',
                  required: true,
                  description: 'The Windows engine always reports 100 because its API exposes no confidence; Tesseract reports a real average confidence; RapidOCR reports a detection score.',
                },
              },
            },
          },
          pages: {
            type: 'array',
            description: 'Per-page results, for a PDF input. Pages whose recognition was empty are omitted.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                page: { type: 'integer', required: true },
                text: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderText(value) }],
    },
    async execute(args, exec) {
      const argv = [args.path, '--json']
      if (args.engine !== undefined) argv.push('--engine', args.engine)
      if (args.preprocess === true) argv.push('--preprocess')
      const stdout = await runScript({ python, script, argv, timeoutMs, signal: exec.signal })
      let result
      try {
        result = JSON.parse(stdout)
      } catch {
        throw new Error(`ocr returned output that is not JSON: ${stdout.slice(0, 200)}`)
      }
      if (result?.ok !== true) throw new Error(result?.error ?? 'ocr failed')
      if (result.type === 'pdf') {
        return { type: 'pdf', engine: result.engine, pages: result.pages ?? [] }
      }
      return {
        type: 'image',
        engine: result.engine,
        text: result.text ?? '',
        lines: result.lines ?? [],
      }
    },
  }))
}
