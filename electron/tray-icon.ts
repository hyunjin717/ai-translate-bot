import { nativeImage } from 'electron'

// 16x16 Template Image for macOS menubar
// "A→" 컨셉의 미니멀 번역 아이콘
// macOS Template Image: 검은색 픽셀만 사용, 시스템이 자동으로 다크/라이트 모드 처리
const ICON_16_BASE64 = (() => {
  // 16x16 PNG를 직접 생성하는 대신, 간단한 텍스트 기반 아이콘 사용
  // Electron은 createFromBuffer로 PNG를 받음
  return null
})()

export function createTrayIcon(): Electron.NativeImage {
  // macOS의 내장 시스템 아이콘 사용 시도
  const icon = nativeImage.createFromNamedImage(
    'NSImageNameTouchBarTranslateTemplate',
    [-1, 0, 1]
  )

  if (!icon.isEmpty()) {
    return icon
  }

  // fallback: 텍스트로 16x16 아이콘 생성
  // Electron에서는 canvas가 없으므로, 최소한의 PNG를 하드코딩
  // 이 PNG는 16x16, "文" 글자를 단순화한 형태
  const size = 16
  const canvas = createMinimalPNG(size)
  const img = nativeImage.createFromBuffer(canvas, { width: size, height: size })
  img.setTemplateImage(true)
  return img
}

// 최소한의 16x16 PNG 생성 (1비트 흑백)
function createMinimalPNG(size: number): Buffer {
  // "A" 글자 모양의 16x16 비트맵 (1 = 검정, 0 = 투명)
  const bitmap = [
    0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,
    0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,
    0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,
    0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0,
    0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0,
    0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,
    0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,
    0,0,1,0,0,0,0,0,0,1,0,1,1,1,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,1,1,1,1,0,1,1,0,1,0,0,1,0,0,
    0,0,1,0,0,0,0,1,0,1,0,0,0,1,0,0,
    0,0,1,0,1,1,0,1,1,0,0,0,1,0,0,0,
    0,0,1,0,0,1,0,1,0,1,0,1,0,0,0,0,
    0,0,1,1,1,0,0,1,0,0,1,1,1,1,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  ]

  // RGBA 데이터 생성
  const rgba = Buffer.alloc(size * size * 4)
  for (let i = 0; i < bitmap.length; i++) {
    const offset = i * 4
    if (bitmap[i]) {
      rgba[offset] = 0     // R
      rgba[offset + 1] = 0 // G
      rgba[offset + 2] = 0 // B
      rgba[offset + 3] = 255 // A
    } else {
      rgba[offset + 3] = 0 // transparent
    }
  }

  return rgbaToPNG(rgba, size, size)
}

// 최소한의 PNG 인코더 (의존성 없음)
function rgbaToPNG(data: Buffer, width: number, height: number): Buffer {
  const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  function crc32(buf: Buffer): number {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) {
      c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff]
    }
    return c ^ 0xffffffff
  }

  const crcTable: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c
  }

  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeB = Buffer.from(type, 'ascii')
    const crcB = Buffer.alloc(4)
    crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])) >>> 0)
    return Buffer.concat([len, typeB, data, crcB])
  }

  // IHDR
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  // IDAT - raw image data with filter byte per row
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0 // filter: none
    data.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4)
  }

  const { deflateSync } = require('zlib')
  const compressed = deflateSync(raw)

  const iend = Buffer.alloc(0)

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', iend)
  ])
}
