// raw: true 로 Ollama 의 chat template 개입을 완전히 제거하고 Gemma 4 format 을 수동 구성.
// 이러면 "OFF 인데 thinking 이 계속 일어나는 원인" 이 template 인지 모델 자체 특성인지 분리 가능.
// 추가로 cold-start 영향 확인을 위해 언로드 후 첫 호출도 포함.
import { Ollama } from '../node_modules/ollama/dist/index.mjs'

const ollama = new Ollama({ host: 'http://localhost:11434' })
const MODEL = 'gemma4:e4b'
const TEXT = '荷物をまとめてクレイトン家に向かうなり家を出て行くなり好きにするがいい'
const TARGET = '한국어'

// Gemma 4 공식 chat template (https://ai.google.dev/gemma/docs/core/prompt-formatting-gemma4)
function buildRawPrompt({ thinking, systemExtra = '' }) {
  const thinkTag = thinking ? '<|think|>' : ''
  const systemBody = thinkTag + 'You are a professional translator. Output ONLY the translation, no explanations or notes.' + systemExtra
  return [
    '<|turn>system',
    systemBody,
    '<turn|>',
    '<|turn>user',
    `Translate the following text to ${TARGET}.\n\n${TEXT}`,
    '<turn|>',
    '<|turn>model',
    ''
  ].join('\n')
}

async function runRaw(label, { thinking, systemExtra = '' }) {
  console.log(`\n========== ${label} ==========`)
  const prompt = buildRawPrompt({ thinking, systemExtra })
  console.log('--- prompt (first 300) ---')
  console.log(prompt.slice(0, 300))

  const started = Date.now()
  let response = ''
  let chunks = 0

  const resp = await ollama.generate({
    model: MODEL,
    prompt,
    raw: true,
    stream: true,
    keep_alive: '2m'
  })

  for await (const part of resp) {
    chunks++
    if (part.response) response += part.response
  }

  const ms = Date.now() - started
  // raw 모드는 thinking 분리 없음. response 안에 <|channel>thought ... <channel|> 블록이 있는지로 판단.
  const channelMatch = response.match(/<\|channel>thought([\s\S]*?)<channel\|>/)
  const thinkingFromChannel = channelMatch ? channelMatch[1].length : 0
  const finalAnswer = channelMatch
    ? response.slice(channelMatch.index + channelMatch[0].length).trim()
    : response.trim()

  console.log(`chunks: ${chunks}, ${ms}ms, total response: ${response.length}ch`)
  console.log(`thinking (in <|channel>): ${thinkingFromChannel}ch`)
  console.log(`final answer: ${finalAnswer.slice(0, 150)}`)
  if (!channelMatch && response.length > 100) {
    console.log(`(no channel tag. raw response preview): ${response.slice(0, 200)}`)
  }
}

// 언로드로 cold start 강제
console.log('unloading model for cold start...')
try {
  await ollama.generate({ model: MODEL, prompt: '', keep_alive: 0 })
} catch (e) {
  // ignore
}

await runRaw('1. cold + OFF (no <|think|>)', { thinking: false })
await runRaw('2. warm + OFF (no <|think|>)', { thinking: false })
await runRaw('3. warm + ON (<|think|>)', { thinking: true })
await runRaw('4. warm + OFF + anti-reasoning instruction', {
  thinking: false,
  systemExtra: ' Do not reason step-by-step. Output the translation directly and only.'
})
