/**
 * Smart photo analysis: reads ALL the text on the photo (OCR) and recognises
 * what's in it (image AI) at the same time, then decides:
 *  - it's a receipt → items, total, store, invoice number
 *  - it's a single purchase → name, category and any price visible on it
 * Everything runs on the phone (free, no API key).
 */
import { scanReceipt, findPrice } from './receipt'
import { identify, warmUpModel } from './ai'

async function loadImage(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }
}

export async function analyzePhoto(file, { onProgress, placePromise, forceReceipt = false } = {}) {
  warmUpModel().catch(() => {})
  const place = placePromise ? await Promise.race([placePromise, new Promise((r) => setTimeout(() => r(null), 2500))]) : null

  const [ocr, seen] = await Promise.all([
    scanReceipt(file, onProgress, { mode: forceReceipt ? 'receipt' : 'auto' }).catch(() => null),
    forceReceipt ? Promise.resolve([]) : loadImage(file).then((img) => identify(img, place)).catch(() => []),
  ])

  const items = ocr?.items || []
  const isReceipt = forceReceipt || items.length >= 2 || (ocr?.total != null && items.length >= 1)

  // For single purchases: combine what the text says (store/brand) with what the picture shows
  const suggestions = []
  const add = (s) => s?.title && !suggestions.some((x) => x.title.toLowerCase() === s.title.toLowerCase()) && suggestions.push(s)
  if (ocr?.store) add({ title: ocr.store, category: ocr.category || seen[0]?.category || 'Other', source: 'text' })
  seen.forEach(add)

  return {
    isReceipt,
    receipt: ocr,
    suggestions: suggestions.slice(0, 5),
    price: isReceipt ? null : ocr?.total ?? findPrice(ocr?.text),
    place,
  }
}
