/**
 * Shrinks a camera photo before upload (phones produce 4–12 MB images).
 * Returns a JPEG Blob, max `maxSize` px on the long edge.
 */
export async function compressImage(file, maxSize = 1280, quality = 0.82) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await loadViaImg(file)
  }
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  return new Promise((res) => canvas.toBlob((b) => res(b || file), 'image/jpeg', quality))
}

function loadViaImg(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

export const blobToDataURL = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(blob)
  })

/**
 * Profile photos: center-crop to a square and shrink to 512×512 JPEG.
 * A 4 MB phone photo usually ends up around 40–80 KB.
 */
export async function compressAvatar(file, size = 512, quality = 0.85) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await loadViaImg(file)
  }
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  const out = Math.min(size, side)
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out)
  bitmap.close?.()
  const blob = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', quality))
  const result = new File([blob || file], 'avatar.jpg', { type: 'image/jpeg' })
  result.compressed = true
  return result
}

/** Already small JPEGs we made ourselves don't need squeezing again. */
export const isCompressed = (file) => file?.compressed === true

export function formatBytes(n) {
  if (!n && n !== 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
