import { Ollama } from 'ollama'
import { BrowserWindow } from 'electron'
import { saveTranslation } from './db'
import { getModel, getThinking } from './settings'

const ollama = new Ollama({ host: 'http://localhost:11434' })
const MAX_INPUT_LENGTH = 8000
const KEEP_ALIVE = '30m'
const MAX_RETRIES = 2

function buildPrompt(text: string, targetLang: string): string {
  return `You are a professional translator. Translate the following text to ${targetLang}. Output ONLY the translation, no explanations or notes.\n\n${text}`
}

function buildImagePrompt(targetLang: string): string {
  return [
    'Look at the provided image. Extract all visible text and translate it.',
    '',
    '## Step 1: Distinguish main text from furigana by SIZE',
    'CRITICAL: Japanese text has two visual layers:',
    '- MAIN TEXT: large characters (kanji, katakana, hiragana) — this is what you extract.',
    '- FURIGANA: tiny/small kana characters printed next to kanji as reading aids — IGNORE these completely.',
    '',
    'How to tell them apart:',
    '- Furigana is roughly 50% the size of the main text or smaller.',
    '- In vertical text: furigana appears to the RIGHT of the kanji column.',
    '- In horizontal text: furigana appears ABOVE the kanji.',
    '- Furigana is always hiragana (or rarely katakana) and always adjacent to kanji.',
    '',
    'RULE: Only extract the LARGE characters. If you see small kana next to a kanji, that small kana is furigana — do NOT include it in the extracted text.',
    '',
    'Example: If you see large 大図書館 with small だいとしょかん beside it, extract only: 大図書館',
    'Example: If you see large 人物 with small じんぶつ beside it, extract only: 人物',
    '',
    '## Step 2: Reading direction',
    '- Vertical Japanese/Chinese: read top-to-bottom, columns right-to-left.',
    '- Horizontal: left-to-right.',
    '- Arabic/Hebrew: right-to-left.',
    '',
    '## Step 3: Extract ONLY the main (large) text',
    '- Follow the correct reading order.',
    '- Combine visually connected text into natural sentences.',
    '- Keep katakana exactly as written (ヴ is ヴ, not ウ).',
    '- Do NOT include furigana in the extraction.',
    '',
    `## Step 4: Translate into ${targetLang}`,
    'Translate naturally. Use furigana readings to understand correct pronunciation/meaning for translation, but do not include them in the extracted text.',
    'Keep proper nouns and brand names as-is.',
    '',
    '## Output format (MANDATORY)',
    '<EXTRACTED>',
    'main text only (no furigana)',
    '</EXTRACTED>',
    '<TRANSLATED>',
    `${targetLang} translation`,
    '</TRANSLATED>',
    '',
    'No commentary, no markdown, nothing outside the tags.'
  ].join('\n')
}

/** 응답에서 <EXTRACTED>와 <TRANSLATED> 태그를 파싱 */
function parseImageResponse(text: string): { extracted: string; translated: string } | null {
  const extractedMatch = text.match(/<EXTRACTED>([\s\S]*?)<\/EXTRACTED>/)
  const translatedMatch = text.match(/<TRANSLATED>([\s\S]*?)<\/TRANSLATED>/)

  if (!extractedMatch || !translatedMatch) return null

  const extracted = extractedMatch[1].trim()
  const translated = translatedMatch[1].trim()

  if (!extracted || !translated) return null

  return { extracted, translated }
}

/** 스트리밍 중 태그 위치를 추적하는 파서 */
class StreamingTagParser {
  private buffer = ''
  private phase: 'before-extracted' | 'in-extracted' | 'between' | 'in-translated' | 'done' = 'before-extracted'
  private onSource: (chunk: string) => void
  private onSourceComplete: () => void
  private onTranslation: (chunk: string) => void

  constructor(handlers: {
    onSource: (chunk: string) => void
    onSourceComplete: () => void
    onTranslation: (chunk: string) => void
  }) {
    this.onSource = handlers.onSource
    this.onSourceComplete = handlers.onSourceComplete
    this.onTranslation = handlers.onTranslation
  }

  feed(chunk: string): void {
    this.buffer += chunk

    while (true) {
      if (this.phase === 'before-extracted') {
        const idx = this.buffer.indexOf('<EXTRACTED>')
        if (idx === -1) break
        this.buffer = this.buffer.slice(idx + '<EXTRACTED>'.length)
        // 태그 직후 줄바꿈 제거
        if (this.buffer.startsWith('\n')) this.buffer = this.buffer.slice(1)
        this.phase = 'in-extracted'
        continue
      }

      if (this.phase === 'in-extracted') {
        const idx = this.buffer.indexOf('</EXTRACTED>')
        if (idx !== -1) {
          const content = this.buffer.slice(0, idx)
          if (content) this.onSource(content)
          this.onSourceComplete()
          this.buffer = this.buffer.slice(idx + '</EXTRACTED>'.length)
          this.phase = 'between'
          continue
        }
        // 닫는 태그가 걸칠 수 있으니 여유분 남기고 전송
        const safe = Math.max(0, this.buffer.length - '</EXTRACTED>'.length)
        if (safe > 0) {
          this.onSource(this.buffer.slice(0, safe))
          this.buffer = this.buffer.slice(safe)
        }
        break
      }

      if (this.phase === 'between') {
        const idx = this.buffer.indexOf('<TRANSLATED>')
        if (idx === -1) break
        this.buffer = this.buffer.slice(idx + '<TRANSLATED>'.length)
        if (this.buffer.startsWith('\n')) this.buffer = this.buffer.slice(1)
        this.phase = 'in-translated'
        continue
      }

      if (this.phase === 'in-translated') {
        const idx = this.buffer.indexOf('</TRANSLATED>')
        if (idx !== -1) {
          const content = this.buffer.slice(0, idx)
          if (content) this.onTranslation(content)
          this.buffer = ''
          this.phase = 'done'
          break
        }
        const safe = Math.max(0, this.buffer.length - '</TRANSLATED>'.length)
        if (safe > 0) {
          this.onTranslation(this.buffer.slice(0, safe))
          this.buffer = this.buffer.slice(safe)
        }
        break
      }

      break // 'done'
    }
  }
}

function handleOllamaError(window: BrowserWindow, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)

  const model = getModel()
  if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
    window.webContents.send(
      'translate:error',
      'Ollama가 실행되지 않았습니다. `ollama serve`를 실행해주세요.'
    )
  } else if (message.includes('not found') || message.includes('does not exist')) {
    window.webContents.send(
      'translate:error',
      `${model} 모델이 없습니다. \`ollama pull ${model}\`를 실행해주세요.`
    )
  } else {
    window.webContents.send('translate:error', `번역 중 오류가 발생했습니다: ${message}`)
  }
}

export async function unloadModel(model: string): Promise<void> {
  try {
    await ollama.generate({ model, prompt: '', keep_alive: 0 })
  } catch {
    // 모델이 이미 언로드되었거나 없는 경우 무시
  }
}

export async function translateText(
  window: BrowserWindow,
  text: string,
  targetLang = '한국어'
): Promise<void> {
  if (!text || text.trim().length === 0) {
    window.webContents.send('translate:error', '번역할 텍스트가 없습니다.')
    return
  }

  if (text.length > MAX_INPUT_LENGTH) {
    window.webContents.send(
      'translate:error',
      `텍스트가 너무 깁니다. (최대 ${MAX_INPUT_LENGTH.toLocaleString()}자)`
    )
    return
  }

  window.webContents.send('translate:source', text)

  let fullText = ''
  const model = getModel()

  try {
    const response = await ollama.generate({
      model,
      prompt: buildPrompt(text, targetLang),
      stream: true,
      keep_alive: KEEP_ALIVE,
      think: getThinking()
    })

    for await (const part of response) {
      fullText += part.response
      window.webContents.send('translate:stream-chunk', part.response)
    }

    window.webContents.send('translate:complete', fullText)
    saveTranslation(text, fullText, 'auto', targetLang, model)
  } catch (err: unknown) {
    handleOllamaError(window, err)
  }
}

export async function translateImage(
  window: BrowserWindow,
  imageBase64: string,
  targetLang = '한국어'
): Promise<void> {
  window.webContents.send('translate:image-start')

  const model = getModel()
  const prompt = buildImagePrompt(targetLang)

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const fullText = await attemptImageTranslation(window, model, prompt, imageBase64)

      // 파싱 검증
      const parsed = parseImageResponse(fullText)
      if (parsed) {
        window.webContents.send('translate:complete', parsed.translated)
        saveTranslation(
          parsed.extracted || '[이미지]',
          parsed.translated,
          'auto',
          targetLang,
          model,
          imageBase64
        )
        return
      }

      // 파싱 실패 — 재시도
      if (attempt < MAX_RETRIES) {
        console.log(`[ollama] image translation parse failed (attempt ${attempt + 1}), retrying...`)
        window.webContents.send('translate:retry', attempt + 1)
        continue
      }

      // 최종 실패
      console.log('[ollama] image translation parse failed after all retries')
      window.webContents.send('translate:error', '이미지 번역에 실패했습니다. 다시 시도해주세요.')
    } catch (err: unknown) {
      if (attempt < MAX_RETRIES) {
        console.log(`[ollama] image translation error (attempt ${attempt + 1}), retrying...`)
        window.webContents.send('translate:retry', attempt + 1)
        continue
      }
      handleOllamaError(window, err)
    }
  }
}

/** 이미지 번역 단일 시도 — 스트리밍으로 UI 업데이트하면서 전체 텍스트 반환 */
async function attemptImageTranslation(
  window: BrowserWindow,
  model: string,
  prompt: string,
  imageBase64: string
): Promise<string> {
  let fullText = ''

  const parser = new StreamingTagParser({
    onSource: (chunk) => window.webContents.send('translate:source-chunk', chunk),
    onSourceComplete: () => window.webContents.send('translate:source-complete'),
    onTranslation: (chunk) => window.webContents.send('translate:stream-chunk', chunk)
  })

  const response = await ollama.generate({
    model,
    prompt,
    images: [imageBase64],
    stream: true,
    keep_alive: KEEP_ALIVE,
    think: true // 이미지 번역은 항상 thinking 사용
  })

  for await (const part of response) {
    if (!part.response) continue
    fullText += part.response
    parser.feed(part.response)
  }

  return fullText
}
