/**
 * Receipt reader. Uses Tesseract.js (OCR that runs on the phone, free, no API key).
 * The OCR engine + English data (~4 MB) download the first time someone scans,
 * then the browser caches them.
 */
import { compressImage } from './image'
import { uuid } from './id'

let workerPromise = null
const onProgressRef = { current: null }

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      return createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') onProgressRef.current?.(0.35 + m.progress * 0.65)
          else if (m.progress != null) onProgressRef.current?.(Math.min(0.35, m.progress * 0.35))
        },
      })
    })().catch((e) => {
      workerPromise = null
      throw e
    })
  }
  onProgressRef.current = onProgress
  return workerPromise
}

/** Grayscale + contrast boost: makes thermal-paper receipts much easier to read. */
async function prepare(file) {
  const blob = await compressImage(file, 2000, 0.92)
  const bmp = await createImageBitmap(blob)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bmp, 0, 0)
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const v = Math.max(0, Math.min(255, (g - 128) * 1.5 + 140))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/**
 * Read a receipt photo.
 * @returns {Promise<{store:string|null, items:Array, total:number|null, text:string}>}
 */
export async function scanReceipt(file, onProgress) {
  onProgress?.(0.02)
  const [worker, canvas] = await Promise.all([getWorker(onProgress), prepare(file)])
  const { data } = await worker.recognize(canvas)
  onProgress?.(1)
  return { ...parseReceipt(data.text || ''), text: data.text || '' }
}

// ---------------- parsing ----------------

// A price at the end of a line: 125.00 · 1,250.00 · P125.00 · ₱ 1 250.00 · 125.00 V · -50.00
const PRICE_END = /(-)?\s*(?:₱|php|p|\$)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)[.,]\d{2})\s*-?\s*[a-z*]{0,3}\s*$/i

const TOTAL_WORDS = /\b(grand\s*total|total\s*(amount|due|sales)?|amount\s*due|total\s*bill|net\s*total)\b/i
const SKIP_WORDS = new RegExp(
  [
    'sub\\s*-?\\s*total', 'vat(able)?', 'v\\.?a\\.?t', 'tax', 'zero\\s*rated', 'exempt', 'change', 'cash', 'card', 'visa', 'master',
    'tender', 'payment', 'paid', 'gcash', 'maya', 'paymaya', 'balance', 'due', 'items?\\s*(sold|count)', 'no\\.?\\s*of\\s*items', 'qty',
    'invoice', '\\btin\\b', '\\bor\\s*#', 'o\\.r', 'receipt', 'thank', 'server', 'table', 'guest', 'cashier', 'date', 'time', 'tel',
    'phone', 'pos\\b', 'terminal', 'trans', 'ref', 'points', 'rounding', 'amount',
  ].join('|'),
  'i',
)
const DISCOUNT_WORDS = /\b(discount|disc\.?|less|promo|voucher|senior|pwd)\b/i
const FEE_WORDS = /\b(service\s*charge|svc|delivery\s*fee|packaging|corkage)\b/i

const toNumber = (s) => {
  const clean = s.replace(/\s/g, '')
  // "1,250.00" → 1250.00 ; "1.250,00" → 1250.00
  const m = clean.match(/^(.*)[.,](\d{2})$/)
  return Number(`${m[1].replace(/[.,]/g, '')}.${m[2]}`)
}

const tidyName = (s) => {
  let n = s
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[|_~=*#]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s.:,-]+$/, '')
    .trim()
  if (n === n.toUpperCase() && /[A-Z]/.test(n)) n = n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  return n
}

export function parseReceipt(text) {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const items = []
  const totals = []
  let store = null
  let pendingName = null

  lines.forEach((line, idx) => {
    const m = line.match(PRICE_END)

    // Store name: first wordy line near the top without a price
    if (!store && idx < 5 && !m && /[a-z]{3,}/i.test(line) && !SKIP_WORDS.test(line) && line.length <= 40) {
      store = tidyName(line)
      return
    }

    if (!m) {
      // A name on its own line, the price comes on the next line ("2 @ 65.00   130.00")
      if (/[a-z]{3,}/i.test(line) && !SKIP_WORDS.test(line) && !TOTAL_WORDS.test(line) && line.length <= 40) pendingName = line
      else pendingName = null
      return
    }

    const value = toNumber(m[2]) * (m[1] ? -1 : 1)
    let label = line.slice(0, m.index).trim()

    if (TOTAL_WORDS.test(label) && !/sub/i.test(label)) {
      totals.push(Math.abs(value))
      pendingName = null
      return
    }
    if (SKIP_WORDS.test(label) && !DISCOUNT_WORDS.test(label) && !FEE_WORDS.test(label)) {
      pendingName = null
      return
    }

    // quantity: "2 x Burger", "2 @ 65.00", "Burger x2"
    let qty = 1
    const lead = label.match(/^(\d{1,2})\s*(?:x|pcs?|@)?\s+(?=\D)/i)
    if (lead) {
      qty = Number(lead[1])
      label = label.slice(lead[0].length)
    }
    const trail = label.match(/\s+x\s?(\d{1,2})$/i)
    if (trail) {
      qty = Number(trail[1])
      label = label.slice(0, trail.index)
    }
    // "2 @ 65.00" style unit-price line → name is on the line before
    const unitLine = /^\d{1,2}\s*[@x]\s*[\d.,]+$/i.test(line.slice(0, m.index).trim())
    if ((unitLine || !/[a-z]{2,}/i.test(label)) && pendingName) {
      const q = line.match(/^(\d{1,2})\s*[@x]/i)
      if (q) qty = Number(q[1])
      label = pendingName
    }
    label = label.replace(/\s+[\d.,]+\s*$/, '') // drop a unit price left before the line total
    pendingName = null

    const name = tidyName(label)
    if (!/[a-z]{2,}/i.test(name) || Math.abs(value) > 1_000_000) return

    items.push({
      id: uuid(),
      name,
      qty,
      price: DISCOUNT_WORDS.test(name) ? -Math.abs(value) : value,
      checked: true,
      shared: DISCOUNT_WORDS.test(name) || FEE_WORDS.test(name) || value < 0,
    })
  })

  return { store, items, total: totals.length ? Math.max(...totals) : null }
}
