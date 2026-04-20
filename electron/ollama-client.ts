import { Ollama, type Message } from 'ollama'
import { BrowserWindow } from 'electron'
import { saveTranslation } from './db'
import { getModel, getThinking } from './settings'

const ollama = new Ollama({ host: 'http://localhost:11434' })
const MAX_INPUT_LENGTH = 16000
const KEEP_ALIVE = '30m'
const MAX_RETRIES = 2

/**
 * Gemma 4 공식 가이드 준수.
 * - thinking 제어: system prompt 첫 자리의 `<|think|>` 리터럴 토큰. 있으면 ON, 없으면 OFF.
 * - Ollama 의 `think: true/false` 파라미터는 이론상 같은 효과여야 하지만, 현재(v0.21.0) Gemma 4 에서는 매핑이
 *   간헐적으로 실패하는 것이 실측됐다. 따라서 안정적 제어를 위해 system 문자열에 리터럴을 직접 삽입한다.
 * - chat API 를 써야 system 슬롯이 실제 주입되며 thinking reasoning 은 `part.message.thinking` 으로 분리된다.
 */

const THINK_TOKEN = '<|think|>'
const TEXT_SYSTEM_PROMPT =
  'You are a professional translator. Output ONLY the translation, no explanations or notes.'

function buildTextMessages(text: string, targetLang: string, thinking: boolean): Message[] {
  return [
    { role: 'system', content: (thinking ? THINK_TOKEN : '') + TEXT_SYSTEM_PROMPT },
    { role: 'user', content: `Translate the following text to ${targetLang}.\n\n${text}` }
  ]
}

/**
 * thinking OFF 전용 경로. Ollama 의 gemma4 RENDERER 개입을 피하기 위해 raw:true 로 공식 Gemma 4 chat format 을
 * 수동 구성한다. 실측상 이 경로에서는 `<|channel>thought` 블록이 일절 생성되지 않는다.
 */
function buildRawGemma4Prompt(text: string, targetLang: string): string {
  return [
    '<|turn>system',
    TEXT_SYSTEM_PROMPT,
    '<turn|>',
    '<|turn>user',
    `Translate the following text to ${targetLang}.\n\n${text}`,
    '<turn|>',
    '<|turn>model',
    ''
  ].join('\n')
}

function buildImageSystemPrompt(targetLang: string): string {
  return [
    'You extract text from images and translate it.',
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

function buildImageMessages(imageBase64: string, targetLang: string): Message[] {
  return [
    // 이미지 번역은 정확도를 위해 항상 thinking ON
    { role: 'system', content: THINK_TOKEN + buildImageSystemPrompt(targetLang) },
    {
      role: 'user',
      content: `Extract the main text from this image and translate it into ${targetLang}.`,
      images: [imageBase64]
    }
  ]
}

/**
 * 스트리밍 응답에서 thinking/reasoning 블록을 걸러내는 파서.
 * - Gemma 4: `<|channel>thought ... <channel|>`
 * - 일반 reasoning 모델: `<think> ... </think>`
 *
 * 동작:
 * - 기본은 passthrough. 태그 밖 텍스트는 onOutput 으로 즉시 송출.
 * - 열림 태그 감지 → suppress 모드 진입, 닫힘 태그까지 폐기.
 * - Ollama가 열림 토큰을 삼키고 닫힘 토큰만 응답에 흘리는 경우가 있어, passthrough 상태에서 닫힘 태그를
 *   단독으로 만나면 "앞부분 전체가 thinking이었다"로 간주하여 onReset 을 호출해 UI 누적을 비우고,
 *   태그 이후부터 다시 passthrough 한다.
 */
export class ThinkingFilterStream {
  private static readonly TAGS: Array<{ open: string; close: string }> = [
    { open: '<|channel>thought', close: '<channel|>' },
    { open: '<think>', close: '</think>' }
  ]
  private static readonly MAX_TAG_LEN = Math.max(
    ...ThinkingFilterStream.TAGS.flatMap((t) => [t.open.length, t.close.length])
  )

  private buffer = ''
  private inThinking = false
  private currentClose = ''

  constructor(
    private onOutput: (chunk: string) => void,
    private onReset?: () => void
  ) {}

  feed(chunk: string): void {
    this.buffer += chunk
    this.drain()
  }

  /** 스트림 종료 시 남은 버퍼를 내보낸다 (thinking 내부면 폐기) */
  flush(): void {
    if (!this.inThinking && this.buffer) {
      this.onOutput(this.buffer)
    }
    this.buffer = ''
  }

  private drain(): void {
    while (true) {
      if (this.inThinking) {
        const idx = this.buffer.indexOf(this.currentClose)
        if (idx !== -1) {
          this.buffer = this.buffer.slice(idx + this.currentClose.length)
          this.inThinking = false
          continue
        }
        const keep = this.currentClose.length - 1
        if (this.buffer.length > keep) {
          this.buffer = this.buffer.slice(this.buffer.length - keep)
        }
        return
      }

      // passthrough 상태: 열림/닫힘 태그 중 가장 빠른 것을 찾는다.
      let earliestIdx = -1
      let earliestTag: string = ''
      let earliestIsOpen = false
      let earliestClose = ''

      for (const tag of ThinkingFilterStream.TAGS) {
        const openIdx = this.buffer.indexOf(tag.open)
        if (openIdx !== -1 && (earliestIdx === -1 || openIdx < earliestIdx)) {
          earliestIdx = openIdx
          earliestTag = tag.open
          earliestIsOpen = true
          earliestClose = tag.close
        }
        const closeIdx = this.buffer.indexOf(tag.close)
        if (closeIdx !== -1 && (earliestIdx === -1 || closeIdx < earliestIdx)) {
          earliestIdx = closeIdx
          earliestTag = tag.close
          earliestIsOpen = false
          earliestClose = ''
        }
      }

      if (earliestIdx !== -1) {
        if (earliestIsOpen) {
          if (earliestIdx > 0) this.onOutput(this.buffer.slice(0, earliestIdx))
          this.buffer = this.buffer.slice(earliestIdx + earliestTag.length)
          this.inThinking = true
          this.currentClose = earliestClose
          continue
        }
        // 단독 닫힘 태그 — 여태 UI에 흘려보낸 thinking 을 비우고 뒤부터 재개
        this.onReset?.()
        this.buffer = this.buffer.slice(earliestIdx + earliestTag.length)
        continue
      }

      const keep = ThinkingFilterStream.MAX_TAG_LEN - 1
      if (this.buffer.length > keep) {
        this.onOutput(this.buffer.slice(0, this.buffer.length - keep))
        this.buffer = this.buffer.slice(this.buffer.length - keep)
      }
      return
    }
  }
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
    await ollama.chat({ model, messages: [], keep_alive: 0 })
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

  let cleanText = ''
  const filter = new ThinkingFilterStream(
    (chunk) => {
      cleanText += chunk
      window.webContents.send('translate:stream-chunk', chunk)
    },
    () => {
      cleanText = ''
      window.webContents.send('translate:stream-reset')
    }
  )
  const model = getModel()
  const thinkingRequested = getThinking()
  let sawThinking = false
  let thinkingChars = 0
  const started = Date.now()
  const mode = thinkingRequested ? 'chat' : 'raw'

  try {
    if (thinkingRequested) {
      // ON: chat API 의 Gemma 4 renderer 를 통해 thinking 을 활성화. thinking 토큰은 part.message.thinking 으로 분리됨.
      const response = await ollama.chat({
        model,
        messages: buildTextMessages(text, targetLang, true),
        stream: true,
        keep_alive: KEEP_ALIVE
      })
      for await (const part of response) {
        const t = part.message?.thinking
        if (t) {
          sawThinking = true
          thinkingChars += t.length
        }
        const chunk = part.message?.content
        if (chunk) filter.feed(chunk)
      }
    } else {
      // OFF: raw:true + 수동 Gemma 4 format 으로 renderer 개입을 차단. thinking 이 모델 레벨에서 생성되지 않음.
      const response = await ollama.generate({
        model,
        prompt: buildRawGemma4Prompt(text, targetLang),
        raw: true,
        stream: true,
        keep_alive: KEEP_ALIVE
      })
      for await (const part of response) {
        if (part.response) filter.feed(part.response)
      }
    }
    filter.flush()

    const ms = Date.now() - started
    const mark = thinkingRequested === sawThinking ? '✓' : '⚠'
    console.log(
      `[translate] ${mark} mode=${mode} req=${thinkingRequested} actual=${sawThinking}` +
        ` | thinking=${thinkingChars}ch | output=${cleanText.length}ch | ${ms}ms | ${model}`
    )

    // ON 요청인데 실제로는 thinking 이 수행되지 않은 경우 사용자에게 알린다
    if (thinkingRequested && !sawThinking) {
      window.webContents.send('translate:thinking-skipped')
    }

    window.webContents.send('translate:complete', cleanText)
    saveTranslation(text, cleanText, 'auto', targetLang, model)
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

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const fullText = await attemptImageTranslation(window, model, imageBase64, targetLang)

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
  imageBase64: string,
  targetLang: string
): Promise<string> {
  let fullText = ''
  let sawThinking = false
  let thinkingChars = 0
  const started = Date.now()

  const parser = new StreamingTagParser({
    onSource: (chunk) => window.webContents.send('translate:source-chunk', chunk),
    onSourceComplete: () => window.webContents.send('translate:source-complete'),
    onTranslation: (chunk) => window.webContents.send('translate:stream-chunk', chunk)
  })

  const response = await ollama.chat({
    model,
    messages: buildImageMessages(imageBase64, targetLang),
    stream: true,
    keep_alive: KEEP_ALIVE
  })

  for await (const part of response) {
    const t = part.message?.thinking
    if (t) {
      sawThinking = true
      thinkingChars += t.length
    }
    const chunk = part.message?.content
    if (!chunk) continue
    fullText += chunk
    parser.feed(chunk)
  }

  const ms = Date.now() - started
  const mark = sawThinking ? '✓' : '⚠'
  console.log(
    `[translate-image] ${mark} thinking requested=true actual=${sawThinking}` +
      ` | thinking=${thinkingChars}ch | output=${fullText.length}ch | ${ms}ms | ${model}`
  )

  return fullText
}
