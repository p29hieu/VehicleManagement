/**
 * Google Identity Services token client.
 *
 * The token model, not the code model: the code model needs a server to exchange the code,
 * and Google's "Web application" client type has no public-client variant, so PKCE does not
 * rescue it for a static site. The price is that tokens last an hour with no refresh token
 * — renewal needs the user, which is why sync is a button and not a background job
 * (docs/04-RESEARCH.md).
 *
 * The access token lives in memory only. localStorage is readable by any script that gets
 * injected into the page, and a bearer token sitting there is a standing offer.
 */

import { STORAGE_PREFIX } from '../../db'
import { SyncAuthError } from '../types'

/** appDataFolder only. Not `drive.file`, which this never touches, and not
 *  `openid email profile`, which would only serve to display the account name — the
 *  consent popup already shows the user which account they are picking. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const CONNECTED_KEY = `${STORAGE_PREFIX}sync:drive-connected`
/** Renew a little early rather than discover expiry halfway through an upload. */
const EXPIRY_BUFFER_MS = 60_000

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback?: (error: { type?: string; message?: string }) => void
  }): TokenClient
  revoke(token: string, done?: () => void): void
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } }
  }
}

export const clientId = (): string =>
  ((import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string | undefined) ?? '').trim()

export const isConfigured = (): boolean => clientId().length > 0

let scriptPromise: Promise<GoogleOAuth2> | null = null

function loadGis(): Promise<GoogleOAuth2> {
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<GoogleOAuth2>((resolve, reject) => {
    const existing = window.google?.accounts?.oauth2
    if (existing) {
      resolve(existing)
      return
    }

    const el = document.createElement('script')
    el.src = GIS_SRC
    el.async = true
    el.onload = () => {
      const api = window.google?.accounts?.oauth2
      if (api) resolve(api)
      else reject(new SyncAuthError('Google Identity Services loaded but exposed no oauth2'))
    }
    el.onerror = () => {
      // Offline, or the script is blocked. Not a permanent failure, so the cached promise
      // is cleared and the next attempt gets to retry.
      scriptPromise = null
      reject(new SyncAuthError('Không tải được Google Identity Services'))
    }
    document.head.appendChild(el)
  })

  return scriptPromise
}

let token: { value: string; expiresAt: number } | null = null

const valid = (): string | null =>
  token && Date.now() < token.expiresAt - EXPIRY_BUFFER_MS ? token.value : null

/**
 * @param prompt '' asks Google to reuse an existing grant without showing anything;
 *        'consent' forces the picker and therefore needs a user gesture, or the popup
 *        is blocked.
 */
function request(api: GoogleOAuth2, prompt: '' | 'consent'): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const client = api.initTokenClient({
      client_id: clientId(),
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new SyncAuthError(response.error_description ?? response.error ?? 'Bị từ chối'))
          return
        }
        token = {
          value: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
        }
        try {
          localStorage.setItem(CONNECTED_KEY, '1')
        } catch {
          // Private mode or blocked storage. The token still works for this session.
        }
        resolve(response.access_token)
      },
      error_callback: (err) => reject(new SyncAuthError(err.message ?? err.type ?? 'Bị từ chối')),
    })
    client.requestAccessToken({ prompt })
  })
}

/** Has the user ever granted on this device? Not proof a token can still be had — the
 *  grant may have been revoked from the Google account page since. */
export function hasConnected(): boolean {
  try {
    return localStorage.getItem(CONNECTED_KEY) === '1'
  } catch {
    return false
  }
}

/** Opens the Google account picker. Must be called from a user gesture. */
export async function connect(): Promise<void> {
  if (!isConfigured()) throw new SyncAuthError('Chưa cấu hình VITE_GOOGLE_CLIENT_ID')
  const api = await loadGis()
  await request(api, 'consent')
}

/**
 * A usable access token, renewed silently if the grant is still live.
 *
 * Silent renewal is the part with no official answer inside an installed PWA on iOS; the
 * popup has been reported to escape into a Safari tab. When it fails the caller gets a
 * SyncAuthError and the UI asks for a tap, which is the one thing that always works.
 */
export async function accessToken(): Promise<string> {
  const cached = valid()
  if (cached) return cached

  if (!isConfigured()) throw new SyncAuthError('Chưa cấu hình VITE_GOOGLE_CLIENT_ID')
  const api = await loadGis()
  return request(api, '')
}

export function forget(): void {
  const current = token?.value
  token = null
  try {
    localStorage.removeItem(CONNECTED_KEY)
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
  // Best effort: tell Google to drop the grant too, so "Ngắt kết nối" means it.
  if (current) window.google?.accounts?.oauth2?.revoke(current)
}
