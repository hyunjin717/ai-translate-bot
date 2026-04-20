// Probe 2: chat API + system prompt 조합으로 thinking 활성화 여부 검증.
// Gemma 4 공식 문서: thinking은 system prompt 첫 자리의 `<|think|>` 토큰으로 제어.
// 가설: /api/generate 는 raw prompt 라 system 이 없어 `think: true` 가 무력.
//      /api/chat 에 system 메시지를 주면 Ollama 가 template 에 `<|think|>` 를 주입해 thinking 활성.
import { Ollama } from '../node_modules/ollama/dist/index.mjs'

const ollama = new Ollama({ host: 'http://localhost:11434' })
const MODEL = 'gemma4:e4b'
const TEXT = '荷物をまとめてクレイトン家に向かうなり家を出て行くなり好きにするがいい'
const USER_PROMPT = `Translate the following text to 한국어. Output ONLY the translation.\n\n${TEXT}`

async function runChat(label, messages, options) {
  console.log(`\n========== ${label} ==========`)
  console.log('options:', JSON.stringify(options))
  console.log('messages[0]:', JSON.stringify(messages[0]).slice(0, 120))

  let content = ''
  let thinking = ''
  let chunks = 0
  let firstKeys = null

  const resp = await ollama.chat({
    model: MODEL,
    messages,
    stream: true,
    keep_alive: '2m',
    ...options
  })

  for await (const part of resp) {
    chunks++
    if (!firstKeys) firstKeys = Object.keys(part.message ?? part)
    content += part.message?.content ?? ''
    thinking += part.message?.thinking ?? ''
    if (chunks <= 2) {
      console.log(`  chunk ${chunks}:`, JSON.stringify(part).slice(0, 240))
    }
  }

  console.log('first message keys:', firstKeys)
  console.log('chunks:', chunks, '/ content len:', content.length, '/ thinking len:', thinking.length)
  console.log('--- content preview ---')
  console.log(content.slice(0, 400))
  if (thinking) {
    console.log('--- thinking preview ---')
    console.log(thinking.slice(0, 400))
  }
}

try {
  // A. chat, system 없음, think: false
  await runChat('A. chat / no system / think:false',
    [{ role: 'user', content: USER_PROMPT }],
    { think: false })

  // B. chat, system 있음, think: false
  await runChat('B. chat / system / think:false',
    [
      { role: 'system', content: 'You are a professional translator.' },
      { role: 'user', content: USER_PROMPT }
    ],
    { think: false })

  // C. chat, system 있음, think: true  (← 이게 핵심)
  await runChat('C. chat / system / think:true',
    [
      { role: 'system', content: 'You are a professional translator.' },
      { role: 'user', content: USER_PROMPT }
    ],
    { think: true })

  // D. chat, system에 `<|think|>` 직접 삽입, think 파라미터 없음 (공식 문서 방식)
  await runChat('D. chat / system with <|think|> literal / no think param',
    [
      { role: 'system', content: '<|think|>You are a professional translator.' },
      { role: 'user', content: USER_PROMPT }
    ],
    {})
} catch (err) {
  console.error('ERROR:', err)
  process.exit(1)
}
