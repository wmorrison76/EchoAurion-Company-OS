import { describe, expect, it } from 'vitest'
import { stripJpegExif } from '@/lib/help-desk-attachments'

/** Minimal JPEG: SOI + APP1 (EXIF) + SOS + EOI — large tail must not stack-overflow. */
function minimalJpegWithExif(tailSize: number): Buffer {
  const exifPayload = Buffer.alloc(10, 0x00)
  const app1Len = exifPayload.length + 2
  const head = Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xe1, // APP1
    (app1Len >> 8) & 0xff,
    app1Len & 0xff,
    ...exifPayload,
    0xff, 0xda, // SOS
    0x00, 0x08, // segment length
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ])
  const tail = Buffer.alloc(tailSize, 0xab)
  const eoi = Buffer.from([0xff, 0xd9])
  return Buffer.concat([head, tail, eoi])
}

describe('stripJpegExif', () => {
  it('strips APP1 without stack overflow on large SOS tail (~1.5MB)', () => {
    const input = minimalJpegWithExif(1_500_000)
    expect(() => stripJpegExif(input)).not.toThrow()
    const out = stripJpegExif(input)
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]).toBe(0xff)
    expect(out[1]).toBe(0xd8)
    expect(out.length).toBeLessThan(input.length)
  })

  it('returns non-JPEG buffers unchanged', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    expect(stripJpegExif(png)).toEqual(png)
  })
})
