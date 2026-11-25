// Unambiguous alphabet (no 0/O, 1/I/L)
const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export function randomCode(len = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  let out = ''
  for (const b of bytes) out += ALPHA[b % ALPHA.length]
  return out
}

/** Unique transaction id shown to users, e.g. SPL-7F3K9Q */
export const transactionRef = () => `SPL-${randomCode(6)}`

export const inviteCode = () => randomCode(8)

export const uuid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${randomCode(10)}`
