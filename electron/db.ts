import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

export function initDB(): void {
  const dbPath = join(app.getPath('userData'), 'translations.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      source_lang TEXT NOT NULL DEFAULT 'auto',
      target_lang TEXT NOT NULL DEFAULT 'ko',
      model TEXT NOT NULL DEFAULT '',
      timestamp INTEGER NOT NULL
    )
  `)

  // 기존 테이블에 누락된 컬럼 추가
  const columns = db.prepare("PRAGMA table_info(translations)").all() as { name: string }[]
  if (!columns.some((c) => c.name === 'model')) {
    db.exec("ALTER TABLE translations ADD COLUMN model TEXT NOT NULL DEFAULT ''")
  }
  if (!columns.some((c) => c.name === 'source_image')) {
    db.exec("ALTER TABLE translations ADD COLUMN source_image TEXT DEFAULT NULL")
  }
}

export function saveTranslation(
  sourceText: string,
  translatedText: string,
  sourceLang: string,
  targetLang: string,
  model: string,
  sourceImage?: string
): number {
  const stmt = db.prepare(
    'INSERT INTO translations (source_text, translated_text, source_lang, target_lang, model, source_image, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const result = stmt.run(sourceText, translatedText, sourceLang, targetLang, model, sourceImage ?? null, Date.now())

  // 최근 50개만 유지, 나머지 삭제
  db.prepare(
    'DELETE FROM translations WHERE id NOT IN (SELECT id FROM translations ORDER BY timestamp DESC, id DESC LIMIT 50)'
  ).run()

  return result.lastInsertRowid as number
}

export function listTranslations(limit = 50) {
  return db.prepare('SELECT * FROM translations ORDER BY timestamp DESC, id DESC LIMIT ?').all(limit)
}

export function searchTranslations(query: string) {
  const pattern = `%${query}%`
  return db
    .prepare(
      'SELECT * FROM translations WHERE source_text LIKE ? OR translated_text LIKE ? ORDER BY timestamp DESC, id DESC LIMIT 50'
    )
    .all(pattern, pattern)
}

export function getTranslation(id: number) {
  return db.prepare('SELECT * FROM translations WHERE id = ?').get(id)
}

export function closeDB(): void {
  if (db) db.close()
}
