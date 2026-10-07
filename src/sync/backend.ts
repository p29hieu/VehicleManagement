import { DriveBackend } from './backends/drive'
import type { SyncBackend } from './types'

/**
 * One backend for the whole app.
 *
 * Shared rather than built per component for two reasons. DriveBackend caches the id of
 * the state file, and a fresh instance throws that away and spends a round trip re-finding
 * a file whose id never changes. And it has to outlive the Settings screen, which is lazy
 * loaded and unmounts the moment you navigate away — the auto-sync scheduler keeps running
 * either way, so it cannot depend on a component's lifetime.
 */
export const backend: SyncBackend = new DriveBackend()
