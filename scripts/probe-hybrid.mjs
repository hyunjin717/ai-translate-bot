// 하이브리드 translateText 를 그대로 재현: OFF 는 raw generate, ON 은 chat.
import { Ollama } from '../node_modules/ollama/dist/index.mjs'

const ollama = new Ollama({ host: 'http://localhost:11434' })
const MODEL = 'gemma4:e4b'
const TEXT = '荷物をまとめてクレイトン家に向かうなり家を出て行くなり好きにするがいい'
const TARGET = '한국어'

const THINK_TOKEN = '<|think|>'
const SYSTEM = 'You are a professional translator. Output ONLY the translation, no explanations or notes.'

function buildRawPrompt(text, targetLang) {
  return [
    '<|turn>system',
    SYSTEM,
    '<turn|>',
    '<|turn>user',
    `Translate the following text to ${targetLang}.\n\n${text}`,
    '<turn|>',
    '<|turn>model',
    ''
  ].join('\n')
}

async function run(label, thinking) {
  const started = Date.now()
  let content = ''
  let reasoning = ''

  if (thinking) {
    const resp = await ollama.chat({
      model: MODEL,
      messages: [
        { role: 'system', content: THINK_TOKEN + SYSTEM },
        { role: 'user', content: `Translate the following text to ${TARGET}.\n\n${TEXT}` }
      ],
      stream: true,
      keep_alive: '2m'
    })
    for await (const part of resp) {
      content += part.message?.content ?? ''
      reasoning += part.message?.thinking ?? ''
    }
  } else {
    const resp = await ollama.generate({
      model: MODEL,
      prompt: buildRawPrompt(TEXT, TARGET),
      raw: true,
      stream: true,
      keep_alive: '2m'
    })
    for await (const part of resp) {
      content += part.response ?? ''
    }
    // raw 응답에 혹시 섞였을 thinking 블록 감지
    const m = content.match(/<\|channel>thought([\s\S]*?)<channel\|>/)
    if (m) reasoning = m[1]
  }

  const ms = Date.now() - started
  const mode = thinking ? 'chat' : 'raw'
  const mark = thinking === (reasoning.length > 0) ? '✓' : '⚠'
  console.log(
    `${mark} ${label.padEnd(8)} mode=${mode.padEnd(4)} thinking=${reasoning.length}ch` +
      ` | output=${content.length}ch | ${ms.toString().padStart(5)}ms | ${content.slice(0, 40).replace(/\n/g, ' ')}`
  )
}

// OFF 여러 번, ON 여러 번 섞어서 안정성 확인
for (let i = 0; i < 3; i++) {
  await run(`OFF-${i + 1}`, false)
}
for (let i = 0; i < 3; i++) {
  await run(`ON-${i + 1}`, true)
}
for (let i = 0; i < 2; i++) {
  await run(`OFF-mix-${i + 1}`, false)
}
