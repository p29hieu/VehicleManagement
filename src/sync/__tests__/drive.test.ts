import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DriveBackend } from '../backends/drive'
import { SyncAuthError, SyncConflictError, emptySnapshot } from '../types'

vi.mock('../google/gis', () => ({
  accessToken: async () => 'fake-token',
  connect: async () => undefined,
  forget: () => undefined,
  hasConnected: () => true,
  isConfigured: () => true,
  DRIVE_SCOPE: 'https://www.googleapis.com/auth/drive.appdata',
}))

const SNAP = emptySnapshot('2026-01-01T00:00:00.000Z')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

interface Call {
  url: string
  method: string
  body: string | null
  auth: string | null
}

/** Answers each request from a list of handlers, and records what was asked. */
function fakeFetch(handlers: Array<(url: string, init?: RequestInit) => Response | null>) {
  const calls: Call[] = []
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : null,
      auth: headers['Authorization'] ?? null,
    })
    for (const handler of handlers) {
      const response = handler(url, init)
      if (response) return response
    }
    throw new Error(`unexpected request: ${init?.method ?? 'GET'} ${url}`)
  }) as unknown as typeof fetch
  return { impl, calls }
}

// Must not match the UPLOAD endpoint, whose URL also ends in "/files?..." — getting this
// wrong made the create test read a file listing as its upload response.
const LIST = 'https://www.googleapis.com/drive/v3/files?'
const isList = (url: string) => url.startsWith(LIST)

const listEmpty = (url: string) => (isList(url) ? json({ files: [] }) : null)
const listFound = (id: string, version: string) => (url: string) =>
  isList(url) ? json({ files: [{ id, version }] }) : null

describe('DriveBackend', () => {
  let backend: DriveBackend

  beforeEach(() => {
    backend = new DriveBackend()
  })

  it('pulls null when the app folder holds no state file yet', async () => {
    const { impl } = fakeFetch([listEmpty])
    backend = new DriveBackend(impl)

    expect(await backend.pull()).toBeNull()
  })

  it('pulls the snapshot and uses the file version as the token', async () => {
    const { impl, calls } = fakeFetch([
      listFound('file-1', '7'),
      (url) => (url.includes('alt=media') ? json(SNAP) : null),
    ])
    backend = new DriveBackend(impl)

    const result = await backend.pull()

    expect(result?.token).toBe('7')
    expect(result?.snapshot.format).toBe('vehicle-management/sync')
    expect(calls[0]?.url).toContain('spaces=appDataFolder')
    expect(calls.every((c) => c.auth === 'Bearer fake-token')).toBe(true)
  })

  it('creates the file parented to appDataFolder when there is none', async () => {
    const { impl, calls } = fakeFetch([
      listEmpty,
      (url, init) =>
        url.startsWith('https://www.googleapis.com/upload/') && init?.method === 'POST'
          ? json({ id: 'file-new', version: '1' })
          : null,
    ])
    backend = new DriveBackend(impl)

    const token = await backend.push(SNAP, null)

    expect(token).toBe('1')
    const upload = calls.find((c) => c.method === 'POST')
    expect(upload?.url).toContain('uploadType=multipart')
    expect(upload?.body).toContain('"parents":["appDataFolder"]')
    expect(upload?.body).toContain('vehicle-management/sync')
  })

  it('updates the existing file with PATCH', async () => {
    const { impl, calls } = fakeFetch([
      listFound('file-1', '7'),
      (url, init) =>
        url.includes('/upload/') && init?.method === 'PATCH'
          ? json({ id: 'file-1', version: '8' })
          : null,
    ])
    backend = new DriveBackend(impl)

    expect(await backend.push(SNAP, '7')).toBe('8')
    expect(calls.find((c) => c.method === 'PATCH')?.url).toContain('uploadType=media')
  })

  // The whole reason push() takes a token: Drive has no If-Match, so this check is the
  // only thing standing between two devices and a silent overwrite.
  it('refuses to overwrite when the file moved since the pull', async () => {
    const { impl, calls } = fakeFetch([listFound('file-1', '9')])
    backend = new DriveBackend(impl)

    await expect(backend.push(SNAP, '7')).rejects.toBeInstanceOf(SyncConflictError)
    expect(calls.some((c) => c.method === 'POST' || c.method === 'PATCH')).toBe(false)
  })

  it('refuses when another device created the file after our pull found none', async () => {
    const { impl } = fakeFetch([listFound('file-1', '1')])
    backend = new DriveBackend(impl)

    await expect(backend.push(SNAP, null)).rejects.toBeInstanceOf(SyncConflictError)
  })

  it('turns a revoked grant into SyncAuthError rather than an HTTP code', async () => {
    const { impl } = fakeFetch([() => json({ error: 'nope' }, 401)])
    backend = new DriveBackend(impl)

    await expect(backend.pull()).rejects.toBeInstanceOf(SyncAuthError)
  })

  it('re-finds the file when the cached id has been deleted from Drive', async () => {
    let deleted = false
    const { impl } = fakeFetch([
      (url) =>
        url.includes('/files/file-1?fields=')
          ? deleted
            ? json({}, 404)
            : json({ id: 'file-1', version: '1' })
          : null,
      (url) => (url.includes('/files/file-2?fields=') ? json({ id: 'file-2', version: '3' }) : null),
      (url) => (isList(url) ? json({ files: [{ id: 'file-2', version: '3' }] }) : null),
      (url) => (url.includes('alt=media') ? json(SNAP) : null),
    ])
    backend = new DriveBackend(impl)

    await backend.pull() // caches file-1
    deleted = true
    const again = await backend.pull()

    expect(again?.token).toBe('3')
  })
})
