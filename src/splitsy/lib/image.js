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
