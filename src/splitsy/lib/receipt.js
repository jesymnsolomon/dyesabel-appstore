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
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') onProgressRef.current?.(0.35 + m.progress * 0.65)
          else if (m.progress != null) onProgressRef.current?.(Math.min(0.35, m.progress * 0.35))
        },
      })
      // PSM 4 = "a single column of text of variable sizes", which is exactly what a receipt is.
      await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1', user_defined_dpi: '300' })
      return worker
    })().catch((e) => {
      workerPromise = null
      throw e
    })
  }
  onProgressRef.current = onProgress
  return workerPromise
}

/**
 * Cleans the photo for OCR:
 * 1. resize so text is big enough (≈1800 px wide)
 * 2. grayscale + auto-contrast (stretches faded thermal print)
 * 3. adaptive threshold: black text on white, even with shadows or crumpled paper
 */
async function prepare(file) {
  const blob = await compressImage(file, 2400, 0.95)
  const bmp = await createImageBitmap(blob)
  const scale = bmp.width < 1600 ? 1600 / bmp.width : 1
  const W = Math.round(bmp.width * scale)
  const H = Math.round(bmp.height * scale)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, W, H)
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  const n = W * H
  const g = new Uint8ClampedArray(n)
  const hist = new Uint32Array(256)
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const v = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0
    g[j] = v
    hist[v]++
  }
  // auto-contrast between the 2nd and 98th percentile
  let lo = 0, hi = 255, acc = 0
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.02) { lo = v; break } }
  acc = 0
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.02) { hi = v; break } }
  const span = Math.max(1, hi - lo)
  for (let j = 0; j < n; j++) g[j] = ((g[j] - lo) * 255) / span

  // Bradley adaptive threshold using an integral image
  const integral = new Float64Array((W + 1) * (H + 1))
  for (let y = 1; y <= H; y++) {
    let row = 0
    for (let x = 1; x <= W; x++) {
      row += g[(y - 1) * W + (x - 1)]
      integral[y * (W + 1) + x] = integral[(y - 1) * (W + 1) + x] + row
    }
  }
  const r = Math.max(8, Math.round(W / 16))
  const T = 0.15
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1)
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1)
      const count = (x1 - x0) * (y1 - y0)
      const sum = integral[y1 * (W + 1) + x1] - integral[y0 * (W + 1) + x1] - integral[y1 * (W + 1) + x0] + integral[y0 * (W + 1) + x0]
      const v = g[y * W + x] * count < sum * (1 - T) ? 0 : 255
      const k = (y * W + x) * 4
      d[k] = d[k + 1] = d[k + 2] = v
      d[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Collect every recognised word with its position, whatever shape tesseract.js returns. */
function wordsFrom(data) {
  if (data.words?.length) return data.words
  const out = []
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) out.push(...(l.words || []))
  return out
}

/**
 * Rebuild receipt rows from word positions. Tesseract sometimes reads the
 * name column and the price column separately; grouping words by their
 * vertical position puts "Kare-Kare ......... 1,250.00" back on one row.
 */
export function rowsFromWords(words) {
  const ws = words
    .filter((w) => w.text && w.text.trim() && w.bbox && (w.confidence ?? 100) > 15)
    .map((w) => ({ text: w.text.trim(), x0: w.bbox.x0, x1: w.bbox.x1, yc: (w.bbox.y0 + w.bbox.y1) / 2, h: w.bbox.y1 - w.bbox.y0 }))
  if (!ws.length) return []
  const hs = ws.map((w) => w.h).sort((a, b) => a - b)
  const medH = hs[Math.floor(hs.length / 2)] || 10
  ws.sort((a, b) => a.yc - b.yc)
  const rows = []
  for (const w of ws) {
    const row = rows.slice(-3).find((r) => Math.abs(r.yc - w.yc) < medH * 0.6)
    if (row) {
      row.words.push(w)
      row.yc = (row.yc * (row.words.length - 1) + w.yc) / row.words.length
    } else rows.push({ yc: w.yc, words: [w] })
  }
  return rows.map((r) => {
    r.words.sort((a, b) => a.x0 - b.x0)
    let text = ''
    r.words.forEach((w, i) => {
      if (i) text += w.x0 - r.words[i - 1].x1 > medH * 2.2 ? '   ' : ' '
      text += w.text
    })
    const h = r.words.map((w) => w.h).sort((a, b) => a - b)[Math.floor(r.words.length / 2)]
    return { text, h: h / medH }
  })
}

/**
 * Read a receipt photo.
 * @returns {Promise<{store:string|null, items:Array, total:number|null, text:string}>}
 */
export async function scanReceipt(file, onProgress) {
  onProgress?.(0.02)
  const [worker, canvas] = await Promise.all([getWorker(onProgress), prepare(file)])
  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true })
  onProgress?.(1)
  const rows = rowsFromWords(wordsFrom(data))
  const fromRows = rows.length ? parseReceipt(rows) : null
  const fromText = parseReceipt(data.text || '')
  // Use whichever reading found more priced items (ties → the one that matches the total)
  const best = !fromRows ? fromText : score(fromRows) >= score(fromText) ? fromRows : fromText
  return { ...best, text: data.text || '' }
}

function score(r) {
  const sum = r.items.reduce((s, i) => s + i.price, 0)
  const matches = r.total != null && Math.abs(sum - r.total) < 0.05
  return r.items.length + (matches ? 100 : 0)
}

// ---------------- parsing ----------------

// A price at the end of a line: 125.00 · 1,250.00 · P125.00 · 125.00 V · -50.00 · 49,00
const PRICE_END = /(-)?\s*(?:₱|php|p|\$)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)[.,]\d{2})\s*-?\s*[a-z*]{0,3}\s*$/i
// Receipts that print whole pesos: "Burger Steak   99"
const PRICE_INT = /(-)?\s*(?:₱|php|p|\$)?\s*(\d{1,3}(?:,\d{3})+|\d{2,6})\s*[a-z*]{0,2}\s*$/i

const TOTAL_WORDS = /\b(grand\s*total|total\s*(amount|due|sales)?|amount\s*due|total\s*bill|net\s*total|total\s*php)\b/i
const SKIP_WORDS = new RegExp(
  [
    'sub\\s*-?\\s*total', 'vat(able)?', 'v\\.?a\\.?t', 'tax', 'zero\\s*rated', 'exempt', 'change', 'cash', 'card', 'visa', 'master',
    'tender', 'payment', 'paid', 'gcash', 'maya', 'paymaya', 'balance', 'due', 'items?\\s*(sold|count)', 'no\\.?\\s*of\\s*items', '\\bqty\\b',
    'invoice', '\\btin\\b', '\\bor\\s*#', '\\bo\\.r', 'receipt', 'thank', 'server', 'table', 'guest', 'cashier', 'date', 'time', '\\btel',
    'phone', '\\bpos\\b', 'terminal', '\\btrans', '\\bref', 'points', 'rounding', 'amount', 'item\\(s\\)', 'min\\b', '\\bsn\\b', 'serial',
    'permit', 'accred', 'customer', 'address', 'business style',
  ].join('|'),
  'i',
)
const DISCOUNT_WORDS = /\b(discount|disc\.?|less|promo|voucher|senior|pwd)\b/i
const FEE_WORDS = /\b(service\s*charge|svc|delivery\s*fee|packaging|corkage)\b/i

const toNumber = (s) => {
  const clean = s.replace(/\s/g, '')
  const m = clean.match(/^(.*)[.,](\d{2})$/)
  if (!m) return Number(clean.replace(/[.,]/g, ''))
  return Number(`${m[1].replace(/[.,]/g, '')}.${m[2]}`)
}

const tidyName = (s) => {
  let n = s
    .replace(/^\d{5,}\s+/, '') // barcode / SKU in front of the name
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[|_~=*#]+/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s.:,-]+$/, '')
    .trim()
  if (n === n.toUpperCase() && /[A-Z]/.test(n)) n = n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  return n
}

const OCR_DIGITS = { O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', '|': '1', i: '1', S: '5', s: '5', B: '8', Z: '2', z: '2', g: '9' }

/** Fixes classic OCR slips inside the price at the end of a line: "l65.O0" → "165.00", "125 . 00" → "125.00". */
export function fixLine(line) {
  let l = line.replace(/\s+/g, ' ').trim()
  l = l.replace(/(\d)\s*([.,])\s*(\d{2})(\s*[a-z*]{0,3})$/i, '$1$2$3$4')
  const m = l.match(/(?:^|\s)([\dOoDQIl|iSsBZzg][\dOoDQIl|iSsBZzg,.]*[\dOoDQIl|iSsBZzg])(\s*[a-zA-Z*]{0,2})$/)
  if (m) {
    const token = m[1]
    const digits = (token.match(/\d/g) || []).length
    const letters = token.replace(/[\d.,]/g, '').length
    if (digits >= 2 && letters <= 2 && digits > letters) {
      const fixed = token.replace(/[OoDQIl|iSsBZzg]/g, (c) => OCR_DIGITS[c])
      l = l.slice(0, l.length - m[0].length) + (m[0].startsWith(' ') ? ' ' : '') + fixed + m[2]
    }
  }
  return l
}

/**
 * Turn receipt text (or rows rebuilt from word positions) into items.
 * @param {string | Array<{text:string, h?:number}>} input
 */
export function parseReceipt(input) {
  const raw = typeof input === 'string' ? input.split('\n').map((text) => ({ text })) : input
  let rows = raw.map((r) => ({ ...r, text: fixLine(r.text || '') })).filter((r) => r.text)

  // Does this receipt use centavos? Most do; some print whole pesos only.
  const decimals = rows.filter((r) => PRICE_END.test(r.text)).length
  const useInt = decimals < 2
  if (!useInt) rows = rows.map((r) => ({ ...r, text: r.text.replace(/([a-z].*\s\d{1,5}) (\d{2})$/i, '$1.$2') })) // "125 00" → "125.00"
  const PRICE = useInt ? PRICE_INT : PRICE_END

  const items = []
  const totals = []
  let store = null
  let pendingName = null

  // Store name: the biggest text near the top (if we know sizes), else the first wordy line
  const top = rows.slice(0, 6).filter((r) => /[a-z]{3,}/i.test(r.text) && !SKIP_WORDS.test(r.text) && !PRICE_END.test(r.text) && r.text.length <= 40)
  const sized = top.filter((r) => r.h != null).sort((a, b) => b.h - a.h)
  const storeRow = sized[0] && sized[0].h >= 1.15 ? sized[0] : top[0]
  if (storeRow) store = tidyName(storeRow.text)

  for (const row of rows) {
    const line = row.text
    if (row === storeRow) continue
    const m = line.match(PRICE)

    if (!m) {
      // A name on its own line; the price comes on the next line
      if (/[a-z]{3,}/i.test(line) && !SKIP_WORDS.test(line) && !TOTAL_WORDS.test(line) && line.length <= 44) {
        // continuation of a long name: "w/ Rice", "& Fries", "(Large)"
        pendingName = pendingName && /^(w\/|with|&|\(|-|and\b)/i.test(line) ? `${pendingName} ${line}` : line
      } else pendingName = null
      continue
    }

    let value = toNumber(m[2]) * (m[1] ? -1 : 1)
    let label = line.slice(0, m.index).trim()

    if (TOTAL_WORDS.test(label) && !/sub/i.test(label)) {
      totals.push(Math.abs(value))
      pendingName = null
      continue
    }
    if (SKIP_WORDS.test(label) && !DISCOUNT_WORDS.test(label) && !FEE_WORDS.test(label)) {
      pendingName = null
      continue
    }
    // whole-peso mode: ignore numbers that look like codes, phone numbers or years
    if (useInt && (!/[a-z]{2,}/i.test(label) && !pendingName || /^\d{4}$/.test(m[2]) && Number(m[2]) > 1900 && Number(m[2]) < 2100)) {
      pendingName = null
      continue
    }

    // quantity: "2 x Burger", "2 Burger", "Burger x2", "2 @ 65.00 130.00", "2 x 65.00"
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
    const unitOnly = line.slice(0, m.index).trim() === '' && /^(\d{1,2})\s*[@x]/i.test(line) === false
    const unitMatch = line.match(/^(\d{1,2})\s*[@x]\s*([\d,]+[.,]\d{2}|\d+)\s*(?:$|\s)/i)
    if (unitMatch && pendingName) {
      qty = Number(unitMatch[1])
      // "2 x 65.00" with no line total → total = qty × unit
      if (line.slice(unitMatch[0].length).trim() === '' ) value = Math.round(qty * toNumber(unitMatch[2]) * 100) / 100
      label = pendingName
    } else if ((!/[a-z]{2,}/i.test(label) || unitOnly) && pendingName) {
      label = pendingName
    } else if (pendingName && /^(w\/|with|&|\(|and\b)/i.test(label)) {
      label = `${pendingName} ${label}`
    }
    label = label.replace(/\s+[\d.,]+\s*$/, '') // drop a unit price left before the line total
    pendingName = null

    const name = tidyName(label)
    if (!/[a-z]{2,}/i.test(name) || Math.abs(value) > 1_000_000 || value === 0) continue

    items.push({
      id: uuid(),
      name,
      qty,
      price: DISCOUNT_WORDS.test(name) ? -Math.abs(value) : value,
      checked: true,
      shared: DISCOUNT_WORDS.test(name) || FEE_WORDS.test(name) || value < 0,
    })
  }

  return { store, items, total: totals.length ? Math.max(...totals) : null }
}
