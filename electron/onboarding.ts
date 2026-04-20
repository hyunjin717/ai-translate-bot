import { BrowserWindow, shell, app } from 'electron'
import { exec, execSync, ChildProcess } from 'child_process'
import { promisify } from 'util'
import { createWriteStream, existsSync } from 'fs'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { IncomingMessage } from 'http'
import https from 'https'

const execAsync = promisify(exec)

// Ollama.app 내부 바이너리 경로 (zip 설치 시 사용)
const OLLAMA_APP_BIN = '/Applications/Ollama.app/Contents/Resources/ollama'

// 빌드된 .app에서는 PATH가 제한적이므로 ollama가 설치될 수 있는 경로를 모두 포함
const EXTRA_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].join(':')
const EXEC_OPTS = { env: { ...process.env, PATH: `${EXTRA_PATH}:${process.env.PATH || ''}` } }

const MODEL = 'gemma4:e4b'
const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download/mac'
const OLLAMA_ZIP_URL = 'https://ollama.com/download/Ollama-darwin.zip'

let ollamaProcess: ChildProcess | null = null
let ollamaStartedByUs = false

type OllamaStatus = {
  installed: boolean
  running: boolean
  modelReady: boolean
}

/** ollama 실행 가능한 경로를 찾아 반환 */
function findOllamaBin(): string | null {
  // 1. Ollama.app 내부 바이너리 (zip 설치)
  if (existsSync(OLLAMA_APP_BIN)) return OLLAMA_APP_BIN
  // 2. PATH에서 찾기 (brew 등)
  try {
    const bin = execSync('which ollama', EXEC_OPTS).toString().trim()
    if (bin) return bin
  } catch { /* not found */ }
  return null
}

export async function checkOllamaStatus(): Promise<OllamaStatus> {
  const status: OllamaStatus = { installed: false, running: false, modelReady: false }

  const bin = findOllamaBin()
  if (!bin) return status
  status.installed = true

  try {
    const response = await fetch('http://localhost:11434/api/tags')
    if (response.ok) {
      status.running = true
      const data = await response.json() as { models?: { name: string }[] }
      const models = data.models || []
      status.modelReady = models.some((m) => m.name.includes('gemma4') && m.name.includes('e4b'))
    }
  } catch {
    // 서버 미실행
  }

  return status
}

export async function startOllama(): Promise<boolean> {
  // 이미 실행 중인지 먼저 확인
  try {
    const res = await fetch('http://localhost:11434/api/tags')
    if (res.ok) return true
  } catch { /* 실행 안 됨 */ }

  const bin = findOllamaBin()
  if (!bin) return false

  try {
    ollamaProcess = exec(`"${bin}" serve`, EXEC_OPTS)
    ollamaStartedByUs = true

    ollamaProcess.on('error', (err) => {
      console.log('[ollama] process error:', err.message)
    })
    ollamaProcess.on('exit', (code) => {
      console.log(`[ollama] process exited with code ${code}`)
      ollamaProcess = null
    })

    // 서버가 뜰 때까지 대기 (최대 15초)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500))
      try {
        const res = await fetch('http://localhost:11434/api/tags')
        if (res.ok) {
          console.log('[ollama] server started successfully')
          return true
        }
      } catch { /* 아직 안 뜸 */ }
    }
    return false
  } catch {
    return false
  }
}

export function stopOllama(): void {
  if (ollamaStartedByUs && ollamaProcess) {
    console.log('[ollama] stopping server (started by us)')
    ollamaProcess.kill()
    ollamaProcess = null
    ollamaStartedByUs = false
  } else {
    console.log('[ollama] not stopping (not started by us)')
  }
}

export async function pullModel(window: BrowserWindow): Promise<boolean> {
  try {
    window.webContents.send('onboarding:progress', `${MODEL} 모델 다운로드 중... (약 9.6GB)`)

    const response = await fetch('http://localhost:11434/api/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: MODEL, stream: true })
    })

    if (!response.ok || !response.body) return false

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const json = JSON.parse(line)
          if (json.total && json.completed) {
            const pct = Math.round((json.completed / json.total) * 100)
            window.webContents.send('onboarding:progress', `모델 다운로드 중... ${pct}%`)
          } else if (json.status) {
            window.webContents.send('onboarding:progress', json.status)
          }
        } catch { /* skip */ }
      }
    }

    return true
  } catch {
    return false
  }
}

export function openOllamaDownload(): void {
  shell.openExternal(OLLAMA_DOWNLOAD_URL)
}

/** HTTPS GET with redirect following */
function httpsGet(url: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpsGet(res.headers.location).then(resolve, reject)
      } else {
        resolve(res)
      }
    }).on('error', reject)
  })
}

/** Ollama를 자동 다운로드하고 /Applications에 설치 */
export async function installOllama(window: BrowserWindow): Promise<boolean> {
  const tmpZip = join(app.getPath('temp'), 'Ollama-darwin.zip')
  const tmpExtractDir = join(app.getPath('temp'), 'ollama-extract')

  try {
    // 1. 다운로드
    window.webContents.send('onboarding:progress', 'Ollama 다운로드 중...')

    const res = await httpsGet(OLLAMA_ZIP_URL)
    if (res.statusCode !== 200) {
      throw new Error(`Download failed: ${res.statusCode}`)
    }

    const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
    let downloadedBytes = 0

    await new Promise<void>((resolve, reject) => {
      const file = createWriteStream(tmpZip)
      res.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length
        if (totalBytes > 0) {
          const pct = Math.round((downloadedBytes / totalBytes) * 100)
          window.webContents.send('onboarding:progress', `Ollama 다운로드 중... ${pct}%`)
        }
      })
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', reject)
      res.on('error', reject)
    })

    // 2. 압축 해제 + /Applications로 이동
    window.webContents.send('onboarding:progress', 'Ollama 설치 중...')

    // 기존 추출 폴더 정리
    await execAsync(`rm -rf "${tmpExtractDir}"`)
    await execAsync(`mkdir -p "${tmpExtractDir}"`)
    await execAsync(`unzip -o -q "${tmpZip}" -d "${tmpExtractDir}"`)

    // 기존 Ollama.app이 있으면 제거 후 이동
    if (existsSync('/Applications/Ollama.app')) {
      await execAsync('rm -rf /Applications/Ollama.app')
    }
    await execAsync(`mv "${tmpExtractDir}/Ollama.app" /Applications/Ollama.app`)

    // 3. CLI 심볼릭 링크 생성 (Ollama.app 내부의 ollama 바이너리)
    const cliBin = '/Applications/Ollama.app/Contents/Resources/ollama'
    if (existsSync(cliBin)) {
      try {
        await execAsync(`ln -sf "${cliBin}" /usr/local/bin/ollama`)
      } catch {
        // /usr/local/bin 쓰기 권한 없으면 무시 — serve로 직접 실행
      }
    }

    // 정리
    await unlink(tmpZip).catch(() => {})
    await execAsync(`rm -rf "${tmpExtractDir}"`).catch(() => {})

    window.webContents.send('onboarding:progress', 'Ollama 설치 완료')
    return true
  } catch (err) {
    console.log('[onboarding] install error:', err)
    await unlink(tmpZip).catch(() => {})
    await execAsync(`rm -rf "${tmpExtractDir}"`).catch(() => {})
    return false
  }
}

/** 원클릭 자동 셋업: 설치 → 시작 → 모델 다운로드 */
export async function autoSetup(window: BrowserWindow): Promise<boolean> {
  try {
    // Step 1: Ollama 상태 확인
    window.webContents.send('onboarding:progress', '환경 확인 중...')
    window.webContents.send('onboarding:step', 'checking')
    let status = await checkOllamaStatus()

    // Step 2: 설치 (필요 시)
    if (!status.installed) {
      window.webContents.send('onboarding:step', 'installing')
      const installed = await installOllama(window)
      if (!installed) {
        window.webContents.send('onboarding:step', 'error')
        window.webContents.send('onboarding:progress', 'Ollama 설치에 실패했습니다.')
        return false
      }
      status = await checkOllamaStatus()
    }

    // Step 3: 서버 시작 (필요 시)
    if (!status.running) {
      window.webContents.send('onboarding:step', 'starting')
      window.webContents.send('onboarding:progress', 'Ollama 서버 시작 중...')

      const started = await startOllama()
      if (!started) {
        window.webContents.send('onboarding:step', 'error')
        window.webContents.send('onboarding:progress', 'Ollama 서버를 시작할 수 없습니다.')
        return false
      }
      status = await checkOllamaStatus()
    }

    // Step 4: 모델 다운로드 (필요 시)
    if (!status.modelReady) {
      window.webContents.send('onboarding:step', 'pulling')
      const pulled = await pullModel(window)
      if (!pulled) {
        window.webContents.send('onboarding:step', 'error')
        window.webContents.send('onboarding:progress', '모델 다운로드에 실패했습니다.')
        return false
      }
    }

    window.webContents.send('onboarding:step', 'ready')
    window.webContents.send('onboarding:progress', '준비 완료!')
    return true
  } catch (err) {
    console.log('[onboarding] autoSetup error:', err)
    window.webContents.send('onboarding:step', 'error')
    window.webContents.send('onboarding:progress', '설정 중 오류가 발생했습니다.')
    return false
  }
}
