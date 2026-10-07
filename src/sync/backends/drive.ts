/**
 * Google Drive appDataFolder as a SyncBackend.
 *
 * appDataFolder is a per-app hidden folder inside the user's own Drive. It costs the
 * developer nothing at any number of users, because the bytes land in each user's own
 * 15 GB quota, and it needs only the non-sensitive `drive.appdata` scope, so there is no
 * OAuth verification and therefore no 100-user cap — which matters because *.github.io
 * structurally cannot pass domain verification (docs/04-RESEARCH.md).
 *
 * The cost of that deal is concurrency. Drive v3 has no If-Match and no conditional write,
 * so the version is re-read immediately before uploading and the write refused if it
 * moved. That leaves a window of a few hundred milliseconds in which another device could
 * still slip in. It is not closable from a client — but it is survivable, because the blob
 * is only a transport: every device keeps its own full copy in IndexedDB, so a row
 * clobbered in the file is pushed straight back up by whoever still has it.
 */

import {
  SyncAuthError,
  SyncConflictError,
  type RemoteSnapshot,
  type RemoteToken,
  type SyncAccount,
  type SyncBackend,
  type SyncSnapshot,
} from '../types'
import { accessToken, connect, forget, hasConnected, isConfigured } from '../google/gis'

const FILES = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
export const STATE_FILE = 'state.json'

interface DriveFile {
  id: string
  version?: string
}

export class DriveBackend implements SyncBackend {
  readonly id = 'drive'
  readonly label = 'Google Drive'

  /** Cached so a sync does not spend a round trip re-finding a file whose id never
   *  changes. Cleared whenever Drive says it is gone. */
  private fileId: string | null = null

  constructor(private readonly fetchImpl: typeof fetch = fetch.bind(globalThis)) {}

  isConfigured(): boolean {
    return isConfigured()
  }

  async currentAccount(): Promise<SyncAccount | null> {
    return hasConnected() ? { label: this.label } : null
  }

  async connect(): Promise<SyncAccount> {
    await connect()
    return { label: this.label }
  }

  async disconnect(): Promise<void> {
    forget()
    this.fileId = null
  }

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await accessToken()
    const response = await this.fetchImpl(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    })

    // 401/403 means the grant died — revoked from the Google account page, or expired
    // beyond silent renewal. Surfacing it as an auth error lets the UI ask for a tap
    // instead of showing a raw HTTP code.
    if (response.status === 401 || response.status === 403) {
      throw new SyncAuthError(`Google từ chối (${response.status})`)
    }
    return response
  }

  private async findFile(): Promise<DriveFile | null> {
    if (this.fileId) {
      const meta = await this.readMeta(this.fileId)
      if (meta) return meta
      this.fileId = null // deleted from under us; fall through to a fresh search
    }

    const query = new URLSearchParams({
      spaces: 'appDataFolder',
      q: `name='${STATE_FILE}' and trashed=false`,
      fields: 'files(id,version)',
      pageSize: '1',
    })
    const response = await this.call(`${FILES}?${query}`)
    if (!response.ok) throw new Error(`Drive tìm file thất bại (${response.status})`)

    const body = (await response.json()) as { files?: DriveFile[] }
    const file = body.files?.[0] ?? null
    if (file) this.fileId = file.id
    return file
  }

  private async readMeta(id: string): Promise<DriveFile | null> {
    const response = await this.call(`${FILES}/${id}?fields=id,version`)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Drive đọc metadata thất bại (${response.status})`)
    return (await response.json()) as DriveFile
  }

  async pull(): Promise<RemoteSnapshot | null> {
    const file = await this.findFile()
    if (!file) return null

    const response = await this.call(`${FILES}/${file.id}?alt=media`)
    if (response.status === 404) {
      this.fileId = null
      return null
    }
    if (!response.ok) throw new Error(`Drive tải file thất bại (${response.status})`)

    const snapshot = (await response.json()) as SyncSnapshot
    return { snapshot, token: file.version ?? '' }
  }

  async push(snapshot: SyncSnapshot, expected: RemoteToken | null): Promise<RemoteToken> {
    const file = await this.findFile()
    const actual = file?.version ?? null

    // Covers both races: someone wrote since our pull, and someone created the file when
    // our pull found none.
    if (actual !== expected) {
      throw new SyncConflictError(`expected ${expected}, Drive has ${actual}`)
    }

    const body = JSON.stringify(snapshot)
    const written = file ? await this.update(file.id, body) : await this.create(body)

    this.fileId = written.id
    return written.version ?? ''
  }

  private async create(body: string): Promise<DriveFile> {
    const boundary = `vm${Math.random().toString(36).slice(2)}`
    const metadata = JSON.stringify({ name: STATE_FILE, parents: ['appDataFolder'] })
    const multipart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n` +
      `--${boundary}--`

    const response = await this.call(`${UPLOAD}?uploadType=multipart&fields=id,version`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    })
    if (!response.ok) throw new Error(`Drive tạo file thất bại (${response.status})`)
    return (await response.json()) as DriveFile
  }

  private async update(id: string, body: string): Promise<DriveFile> {
    const response = await this.call(`${UPLOAD}/${id}?uploadType=media&fields=id,version`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    if (!response.ok) throw new Error(`Drive ghi file thất bại (${response.status})`)
    return (await response.json()) as DriveFile
  }
}
