// Device identity — spec §3.2, §3.3: "which person this device claims to be" lives ONLY in
// localStorage on this device. It is a soft signal for the UI (own-page treatment, default
// landing person) and is NEVER sent to the server as authorization — every write still carries
// the acting user explicitly (§9 X-Acting-User) and the server enforces nothing based on this
// value. Losing it (new phone, cleared Safari data) costs one tap on /whoami; no history is lost
// because none of it lives here.

const STORAGE_KEY_ACTIVE_USER_ID = 'hhc:active-user-id'

function readLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

/** The userId this device last claimed, or null if this device has never picked an identity. */
export function getActiveUserId(): string | null {
  return readLocalStorage()?.getItem(STORAGE_KEY_ACTIVE_USER_ID) ?? null
}

/** Called after a successful claim (spec §3.2: "writes activeUserId to localStorage"). */
export function setActiveUserId(userId: string): void {
  readLocalStorage()?.setItem(STORAGE_KEY_ACTIVE_USER_ID, userId)
}

/** Used by "Switch person" flows (Settings, or the header avatar long-press affordance). */
export function clearActiveUserId(): void {
  readLocalStorage()?.removeItem(STORAGE_KEY_ACTIVE_USER_ID)
}
