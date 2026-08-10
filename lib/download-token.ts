import crypto from 'node:crypto'

const TOKEN_SECRET = process.env.DOWNLOAD_LINK_SECRET || 'lonewolf2026'
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 180

function encode(value: string) {
  return Buffer.from(value).toString('base64url')
}

function signature(payload: string) {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url')
}

export function createDownloadToken(id: string, kind: string) {
  const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  const payload = `${id}.${kind}.${expires}`
  return `${encode(payload)}.${signature(payload)}`
}

export function verifyDownloadToken(token: string | null, id: string, kind: string) {
  if (!token) return false
  const [encoded, providedSignature] = token.split('.')
  if (!encoded || !providedSignature) return false
  try {
    const payload = Buffer.from(encoded, 'base64url').toString('utf8')
    const [tokenId, tokenKind, expiresText] = payload.split('.')
    const expires = Number(expiresText)
    const expectedSignature = signature(payload)
    return tokenId === id && tokenKind === kind && Number.isFinite(expires) && expires > Math.floor(Date.now() / 1000) && crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))
  } catch {
    return false
  }
}

export function isAdminRequest(request: Request, token: string | null, id: string, kind: string) {
  return request.headers.get('x-admin-pass') === 'lonewolf2026' || verifyDownloadToken(token, id, kind)
}

export function downloadTokenTtlSeconds() {
  return TOKEN_TTL_SECONDS
}
