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
 * 2. remove blue/purple pen marks (circles, ticks) so they don't hide numbers
 * 3. grayscale + auto-contrast (stretches faded thermal print)
 * 4. "binary" mode: adaptive threshold, black text on white even with shadows
 *    "soft" mode: contrast only (a second opinion when the first read doesn't add up)
 */
async function loadGray(file) {
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
  const d = ctx.getImageData(0, 0, W, H).data
  const n = W * H
  const g = new Float32Array(n)
  const hist = new Uint32Array(256)
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const r = d[i], gr = d[i + 1], b = d[i + 2]
    let v = 0.299 * r + 0.587 * gr + 0.114 * b
    if (b - (r + gr) / 2 > 18) v = Math.max(v, 235) // pen ink → paper
    g[j] = v
    hist[v | 0]++
  }
  let lo = 0, hi = 255, acc = 0
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.02) { lo = v; break } }
  acc = 0
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.02) { hi = v; break } }
  const span = Math.max(1, hi - lo)
  for (let j = 0; j < n; j++) g[j] = Math.max(0, Math.min(255, ((g[j] - lo) * 255) / span))
  return { g, W, H }
}

function toCanvas({ g, W, H }, mode) {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(W, H)
  const d = img.data
  if (mode === 'soft') {
    for (let j = 0, k = 0; j < W * H; j++, k += 4) { d[k] = d[k + 1] = d[k + 2] = g[j]; d[k + 3] = 255 }
  } else {
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
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Collect every recognised word with its position (and which OCR line it came from). */
function wordsFrom(data) {
  if (data.words?.length && !data.blocks?.length) return data.words
  const out = []
  let lineId = 0
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    lineId++
    for (const w of l.words || []) out.push({ ...w, lineId })
  }
  return out.length ? out : data.words || []
}

/** How tilted the photo is: median slope of words that the OCR put on the same line. */
function estimateSlope(ws) {
  const byLine = {}
  for (const w of ws) if (w.lineId != null) (byLine[w.lineId] ||= []).push(w)
  const slopes = []
  for (const line of Object.values(byLine)) {
    if (line.length < 2) continue
    line.sort((a, b) => a.xc - b.xc)
    const a = line[0], b = line[line.length - 1]
    const dx = b.xc - a.xc
    if (dx > 150) slopes.push((b.yc - a.yc) / dx)
  }
  if (slopes.length < 2) return 0
  slopes.sort((x, y) => x - y)
  const m = slopes[Math.floor(slopes.length / 2)]
  return Math.abs(m) < 0.15 ? m : 0
}

/**
 * Rebuild receipt rows from word positions. Tesseract sometimes reads the
 * name column and the price column separately; grouping words by their
 * vertical position (corrected for a tilted photo) puts
 * "Kare-Kare ......... 1,250.00" back on one row.
 */
export function rowsFromWords(words) {
  let ws = words
    .filter((w) => w.text && w.text.trim() && w.bbox && (w.confidence ?? 100) > 15)
    .map((w) => ({ text: w.text.trim(), lineId: w.lineId, x0: w.bbox.x0, x1: w.bbox.x1, xc: (w.bbox.x0 + w.bbox.x1) / 2, yc: (w.bbox.y0 + w.bbox.y1) / 2, h: w.bbox.y1 - w.bbox.y0 }))
  if (!ws.length) return []
  const slope = estimateSlope(ws)
  ws = ws.map((w) => ({ ...w, yc: w.yc - slope * w.xc }))
  const hs = ws.map((w) => w.h).sort((a, b) => a - b)
  const medH = hs[Math.floor(hs.length / 2)] || 10
  ws.sort((a, b) => a.yc - b.yc)
  const rows = []
  for (const w of ws) {
    const row = rows.slice(-3).find((r) => Math.abs(r.yc - w.yc) < medH * 0.55)
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

async function readPass(worker, canvas) {
  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true })
  const rows = rowsFromWords(wordsFrom(data))
  const fromRows = rows.length ? parseReceipt(rows) : null
  const fromText = parseReceipt(data.text || '')
  const best = !fromRows ? fromText : score(fromRows) >= score(fromText) ? fromRows : fromText
  return { ...best, text: data.text || '' }
}

const reconciles = (r) => r.total != null && Math.abs(r.items.reduce((s, i) => s + i.price, 0) - r.total) < 0.05

function score(r) {
  const named = r.items.filter((i) => i.name && i.name !== 'Item').length
  return (reconciles(r) ? 100 : 0) + named * 2 + r.items.length + (r.title ? 1 : 0)
}

/**
 * Read a receipt photo. Reads once; if the items don't add up to the printed
 * total, reads again with a different clean-up and keeps the better result.
 * @returns {Promise<{store, invoice, title, items, total, text}>}
 */
export async function scanReceipt(file, onProgress, { mode = 'receipt' } = {}) {
  onProgress?.(0.02)
  const [worker, gray] = await Promise.all([getWorker((p) => onProgress?.(p * 0.75)), loadGray(file)])
  let best = await readPass(worker, toCanvas(gray, 'binary'))
  // 'auto' (any photo): only re-read if this looks like a receipt that doesn't add up yet
  const wantSecond = mode === 'receipt' ? !reconciles(best) : best.items.length >= 1 && !reconciles(best)
  if (wantSecond) {
    onProgressRef.current = (p) => onProgress?.(0.75 + p * 0.25)
    try {
      const second = await readPass(worker, toCanvas(gray, 'soft'))
      const pick = score(second) > score(best) ? second : best
      const other = pick === best ? second : best
      best = {
        ...pick,
        total: pick.total ?? other.total,
        title: pick.title || other.title,
        invoice: pick.invoice || other.invoice,
        store: pick.store || other.store,
        category: pick.category || other.category,
      }
    } catch { /* keep the first read */ }
  }
  onProgress?.(1)
  return best
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
    .replace(/\s*\.\s*\//g, '/')
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

// Well-known stores, recognised from any line (logos can't be read, but the company name,
// website or email on the receipt usually can).
const BRANDS = [
  [/thesmstore|sm\s*store|metro\s*main\s*star/i, 'SM Store', 'Shopping'],
  [/sm\s*supermarket|supervalue/i, 'SM Supermarket', 'Groceries'],
  [/sm\s*hypermarket|super\s*shopping\s*market/i, 'SM Hypermarket', 'Groceries'],
  [/savemore|sanford\s*marketing/i, 'Savemore', 'Groceries'],
  [/puregold/i, 'Puregold', 'Groceries'],
  [/robinsons\s*supermarket/i, 'Robinsons Supermarket', 'Groceries'],
  [/robinsons\s*(department|dept)/i, 'Robinsons Department Store', 'Shopping'],
  [/jollibee/i, 'Jollibee', 'Food'],
  [/mc\s*donald|golden\s*arches/i, 'McDonald’s', 'Food'],
  [/mang\s*inasal/i, 'Mang Inasal', 'Food'],
  [/chowking/i, 'Chowking', 'Food'],
  [/greenwich/i, 'Greenwich', 'Food'],
  [/starbucks/i, 'Starbucks', 'Drinks'],
  [/7-?eleven|philippine\s*seven/i, '7-Eleven', 'Groceries'],
  [/ministop/i, 'Ministop', 'Groceries'],
  [/mercury\s*drug/i, 'Mercury Drug', 'Health'],
  [/watsons/i, 'Watsons', 'Health'],
  [/uniqlo/i, 'Uniqlo', 'Clothing'],
  [/national\s*book\s*store/i, 'National Book Store', 'Shopping'],
  [/ace\s*hardware/i, 'Ace Hardware', 'Shopping'],
  [/landers/i, 'Landers', 'Groceries'],
  [/s\s*&\s*r\s*membership|s&r/i, 'S&R', 'Groceries'],
  [/shakey/i, 'Shakey’s', 'Food'],
  [/max'?s\s*restaurant/i, 'Max’s', 'Food'],
  [/kfc/i, 'KFC', 'Food'],
  [/petron/i, 'Petron', 'Transport'],
  [/shell/i, 'Shell', 'Transport'],
]

const INVOICE_RES = [
  /(?:sales\s*)?invoice\s*(?:number|no\.?|#)\s*[:.]?\s*([A-Z0-9-]{4,})/i,
  /\b(?:official\s*receipt|o\.?\s*r\.?|s\.?\s*i\.?|receipt)\s*(?:number|no\.?|#)\s*[:.]?\s*([A-Z0-9-]{4,})/i,
  /\bOR\s*#\s*([A-Z0-9-]{4,})/i,
]

// Column headers / currency labels that are never item names
const HEADER_WORDS = /^(php|usd|peso|pesos|price|qty|quantity|description|item|items|amount|amt|total|unit|sales\s*invoice|invoice|receipt|official\s*receipt)$/i

const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
const PCT = /(\d{1,2}(?:\.\d+)?)\s*%/

/**
 * Turn receipt text (or rows rebuilt from word positions) into
 * { store, invoice, title, items, total }.
 * Handles both layouts: "Name ..... 99.00" and the department-store style
 * where the price line (with a barcode) comes first and the name below it,
 * followed by item discounts ("10% DISCOUNT 551.90-").
 * @param {string | Array<{text:string, h?:number}>} input
 */
export function parseReceipt(input) {
  const raw = typeof input === 'string' ? input.split('\n').map((text) => ({ text })) : input
  let rows = raw.map((r) => ({ ...r, text: fixLine(r.text || '') })).filter((r) => r.text)

  const decimals = rows.filter((r) => PRICE_END.test(r.text)).length
  const useInt = decimals < 2
  if (!useInt) rows = rows.map((r) => ({ ...r, text: r.text.replace(/([a-z].*\s\d{1,5}) (\d{2})$/i, '$1.$2') }))
  const PRICE = useInt ? PRICE_INT : PRICE_END
  const allText = rows.map((r) => r.text).join('\n')

  // ---- store, branch, invoice number ----
  const brandHit = BRANDS.find(([re]) => re.test(allText))
  const brand = brandHit?.[1] || null
  const category = brandHit?.[2] || null
  const top = rows.slice(0, 6).filter((r) => /[a-z]{3,}/i.test(r.text) && !SKIP_WORDS.test(r.text) && !PRICE_END.test(r.text) && r.text.length <= 40)
  const sized = top.filter((r) => r.h != null).sort((a, b) => b.h - a.h)
  const storeRow = sized[0] && sized[0].h >= 1.15 ? sized[0] : top[0]
  let store = brand || (storeRow ? tidyName(storeRow.text) : null)
  if (brand) {
    // Branch: a short one-word line near the top, e.g. "BAGUIO"
    const squash = (t) => t.toLowerCase().replace(/[^a-z]/g, '')
    const branch = rows.slice(0, 6).map((r) => r.text.trim()).find((t) => /^[A-Za-z]{3,14}$/.test(t) && !squash(brand).includes(squash(t)) && !squash(t).includes(squash(brand)) && !HEADER_WORDS.test(t) && !SKIP_WORDS.test(t))
    if (branch) store = `${brand} ${titleCase(branch)}`
  }
  let invoice = null
  for (const re of INVOICE_RES) {
    const m = allText.match(re)
    if (m && /\d/.test(m[1])) { invoice = m[1]; break }
  }
  const title = store ? (invoice ? `${store} Invoice: ${invoice}` : store) : invoice ? `Invoice: ${invoice}` : null

  // ---- items ----
  const items = []
  const totals = []
  let pendingName = null
  let current = null // the item that discounts / a following name attach to
  let itemsDone = false
  let expectTotal = false

  const newItem = (name, qty, base) => {
    const it = { id: uuid(), name, qty, base, discounts: [], awaitingName: !name }
    items.push(it)
    current = it
    return it
  }
  const shared = (name, value) => {
    items.push({ id: uuid(), name: tidyName(name), qty: 1, base: value, discounts: [], shared: true })
    current = null
  }

  for (const row of rows) {
    const line = row.text
    if (row === storeRow && !brand) continue
    const m = line.match(PRICE)
    const value = m ? toNumber(m[2]) : null
    const negative = m ? Boolean(m[1]) || /\d\s*-\s*[a-z*]{0,3}\s*$/i.test(line) : false
    const label = m ? line.slice(0, m.index).trim() : line

    // TOTAL (amount may be on this line, or missing/misplaced)
    if (TOTAL_WORDS.test(label) && !/sub/i.test(label)) {
      const last = items[items.length - 1]
      if (value != null) totals.push(value)
      else if (last && last === current && last.awaitingName && !last.discounts.length && !last.shared) {
        // the amount was printed just above the word TOTAL: it wasn't an item
        items.pop()
        totals.push(last.base)
      } else expectTotal = true
      itemsDone = true
      current = null
      pendingName = null
      continue
    }
    if (/sub\s*-?\s*total/i.test(line)) { itemsDone = true; current = null; pendingName = null; continue }

    // Discounts: right after an item → belongs to that item; otherwise a bill-wide line
    if (DISCOUNT_WORDS.test(label)) {
      const pct = label.match(PCT)?.[1]
      if (current && !itemsDone) {
        const running = current.base - current.discounts.reduce((s2, d) => s2 + d, 0)
        let amount = value != null ? Math.abs(value) : null
        if (pct) {
          const computed = Math.round(running * Number(pct)) / 100
          // trust the percentage when the printed amount is missing or misread
          if (amount == null || Math.abs(amount - computed) > Math.max(0.05, computed * 0.02)) amount = computed
        }
        if (amount) current.discounts.push(amount)
      } else if (value != null) {
        shared(label, -Math.abs(value))
      }
      pendingName = null
      continue
    }
    if (FEE_WORDS.test(label) && value != null) { shared(label, value); pendingName = null; continue }
    if (SKIP_WORDS.test(label)) { pendingName = null; continue }

    if (!m) {
      if (/^[\d\s-]{5,}$/.test(line)) continue // a barcode on its own line
      if (HEADER_WORDS.test(line.replace(/[^a-z\s]/gi, '').trim())) { pendingName = null; continue }
      if (/[a-z]{3,}/i.test(line) && !TOTAL_WORDS.test(line) && line.length <= 44) {
        if (current?.awaitingName && !itemsDone) {
          current.name = tidyName(line).replace(/\/(nodim|nosize|na)$/i, '')
          current.awaitingName = false
          continue
        }
        pendingName = pendingName && /^(w\/|with|&|\(|-|and\b)/i.test(line) ? `${pendingName} ${line}` : line
      } else pendingName = null
      continue
    }

    // A bare amount right after a "TOTAL" whose number was on another line
    if (expectTotal && !/[a-z]{2,}/i.test(label)) {
      totals.push(value)
      expectTotal = false
      continue
    }
    if (itemsDone) continue // payment lines after the total

    if (useInt && ((!/[a-z]{2,}/i.test(label) && !pendingName) || (/^\d{4}$/.test(m[2]) && Number(m[2]) > 1900 && Number(m[2]) < 2100))) {
      pendingName = null
      continue
    }

    // quantity: "2 x Burger", "2 Burger", "Burger x2", "2 @ 65.00 130.00", "2 x 65.00"
    let qty = 1
    let name = label
    let price = value * (negative ? -1 : 1)
    const lead = name.match(/^(\d{1,2})\s*(?:x|pcs?|@)?\s+(?=\D)/i)
    if (lead) { qty = Number(lead[1]); name = name.slice(lead[0].length) }
    const trail = name.match(/\s+x\s?(\d{1,2})$/i)
    if (trail) { qty = Number(trail[1]); name = name.slice(0, trail.index) }
    const unitMatch = line.match(/^(\d{1,2})\s*[@x]\s*([\d,]+[.,]\d{2}|\d+)\s*(?:$|\s)/i)
    if (unitMatch && pendingName) {
      qty = Number(unitMatch[1])
      if (line.slice(unitMatch[0].length).trim() === '') price = Math.round(qty * toNumber(unitMatch[2]) * 100) / 100
      name = pendingName
    } else if (!/[a-z]{2,}/i.test(tidyName(name)) && pendingName) {
      name = pendingName
    } else if (pendingName && /^(w\/|with|&|\(|and\b)/i.test(name)) {
      name = `${pendingName} ${name}`
    }
    name = name.replace(/\s+[\d.,]+\s*$/, '')
    pendingName = null

    const clean = tidyName(name)
    if (Math.abs(price) > 1_000_000 || price === 0) continue
    // No name yet (department-store layout: barcode + price, name on the next line)
    newItem(/[a-z]{2,}/i.test(clean) ? clean : null, qty, price)
  }

  const out = items
    .filter((it) => it.name || it.base)
    .map((it) => {
      const discount = Math.round(it.discounts.reduce((s2, d) => s2 + d, 0) * 100) / 100
      const price = Math.round((it.base - discount) * 100) / 100
      const name = it.name || 'Item'
      return {
        id: it.id,
        name,
        qty: it.qty,
        price,
        ...(discount ? { original: it.base, discount } : {}),
        checked: true,
        shared: Boolean(it.shared) || (price < 0 && !discount),
      }
    })
    .filter((it) => it.price !== 0)

  return { store, invoice, title, category, items: out, total: totals.length ? Math.max(...totals) : null }
}

/**
 * The most likely price on a non-receipt photo (price tag, menu board, ticket):
 * a currency-marked amount, or one after "price/total/amount/SRP", or the only amount there.
 */
export function findPrice(text) {
  if (!text) return null
  const lines = text.split('\n').map((l) => fixLine(l))
  const nums = []
  for (const l of lines) {
    const marked = l.match(/(?:₱|php|p|\$|srp|price|total|amount|now)\s*:?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:[.,]\d{2})?)\b/i)
    if (marked) nums.push({ v: toNumber(marked[1]), w: 3 })
    for (const m of l.matchAll(/(?:^|\s)((?:\d{1,3}(?:,\d{3})+|\d+)[.,]\d{2})(?=\s|$|[a-z])/gi)) nums.push({ v: toNumber(m[1]), w: 1 })
  }
  const ok = nums.filter((n) => n.v > 0 && n.v < 1_000_000)
  if (!ok.length) return null
  const best = Math.max(...ok.map((n) => n.w))
  const top = [...new Set(ok.filter((n) => n.w === best).map((n) => n.v))]
  return top.length === 1 || best === 3 ? Math.max(...top) : null
}
