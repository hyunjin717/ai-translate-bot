import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

type Settings = {
  shortcut: string
  targetLang: string
  model: string
  thinking: boolean
}

const DEFAULTS: Settings = {
  shortcut: 'CommandOrControl+Option+T',
  targetLang: '한국어',
  model: 'gemma4:e4b',
  thinking: false
}

function getPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function load(): Settings {
  const path = getPath()
  if (!existsSync(path)) return { ...DEFAULTS }
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(path, 'utf-8')) }
  } catch {
    return { ...DEFAULTS }
  }
}

function save(settings: Settings): void {
  writeFileSync(getPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

export function getSettings(): Settings {
  return load()
}

export function setShortcut(shortcut: string): void {
  const s = load()
  s.shortcut = shortcut
  save(s)
}

export function setTargetLang(lang: string): void {
  const s = load()
  s.targetLang = lang
  save(s)
}

export function getTargetLang(): string {
  return load().targetLang
}

export function setModel(model: string): void {
  const s = load()
  s.model = model
  save(s)
}

export function getModel(): string {
  return load().model
}

export function setThinking(thinking: boolean): void {
  const s = load()
  s.thinking = thinking
  save(s)
}

export function getThinking(): boolean {
  return load().thinking
}
