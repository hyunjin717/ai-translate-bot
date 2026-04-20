import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'

let db: Database.Database

function initTestDB() {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      source_lang TEXT NOT NULL DEFAULT 'auto',
      target_lang TEXT NOT NULL DEFAULT 'ko',
      timestamp INTEGER NOT NULL
    )
  `)
}

function saveTranslation(src: string, translated: string, srcLang: string, tgtLang: string) {
  const stmt = db.prepare(
    'INSERT INTO translations (source_text, translated_text, source_lang, target_lang, timestamp) VALUES (?, ?, ?, ?, ?)'
  )
  return stmt.run(src, translated, srcLang, tgtLang, Date.now())
}

function listTranslations(limit = 50) {
  return db.prepare('SELECT * FROM translations ORDER BY timestamp DESC, id DESC LIMIT ?').all(limit) as any[]
}

function searchTranslations(query: string) {
  const pattern = `%${query}%`
  return db.prepare(
    'SELECT * FROM translations WHERE source_text LIKE ? OR translated_text LIKE ? ORDER BY timestamp DESC LIMIT 50'
  ).all(pattern, pattern) as any[]
}

function getTranslation(id: number) {
  return db.prepare('SELECT * FROM translations WHERE id = ?').get(id) as any
}

describe('Database operations', () => {
  beforeEach(() => initTestDB())
  afterEach(() => db.close())

  it('creates table successfully', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
    expect(tables.map((t: any) => t.name)).toContain('translations')
  })

  it('inserts a translation record', () => {
    const result = saveTranslation('Hello', '안녕하세요', 'en', 'ko')
    expect(result.lastInsertRowid).toBe(1)
  })

  it('lists translations in descending order by id', () => {
    saveTranslation('First', '첫 번째', 'en', 'ko')
    saveTranslation('Second', '두 번째', 'en', 'ko')
    const records = listTranslations()
    expect(records).toHaveLength(2)
    // Both may have same timestamp (same ms), but id order is guaranteed
    expect(records[0].id).toBeGreaterThan(records[1].id)
  })

  it('returns empty array for empty DB', () => {
    const records = listTranslations()
    expect(records).toHaveLength(0)
  })

  it('respects the limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      saveTranslation(`Text ${i}`, `텍스트 ${i}`, 'en', 'ko')
    }
    const records = listTranslations(3)
    expect(records).toHaveLength(3)
  })

  it('searches by source text', () => {
    saveTranslation('Hello world', '안녕 세계', 'en', 'ko')
    saveTranslation('Goodbye', '안녕히', 'en', 'ko')
    const results = searchTranslations('Hello')
    expect(results).toHaveLength(1)
    expect(results[0].source_text).toBe('Hello world')
  })

  it('searches by translated text', () => {
    saveTranslation('Hello', '안녕하세요', 'en', 'ko')
    saveTranslation('Bye', '잘가', 'en', 'ko')
    const results = searchTranslations('안녕')
    expect(results).toHaveLength(1)
  })

  it('returns empty for no search matches', () => {
    saveTranslation('Hello', '안녕', 'en', 'ko')
    const results = searchTranslations('존재하지않는')
    expect(results).toHaveLength(0)
  })

  it('gets a specific translation by id', () => {
    saveTranslation('Test', '테스트', 'en', 'ko')
    const record = getTranslation(1)
    expect(record).toBeDefined()
    expect(record.source_text).toBe('Test')
  })

  it('returns undefined for non-existent id', () => {
    const record = getTranslation(999)
    expect(record).toBeUndefined()
  })
})
