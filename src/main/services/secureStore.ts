import keytar from 'keytar'

const SERVICE_NAME = '1cc-desktop'
const LEGACY_SERVICE_NAME = '1cc-overlay'
const ACCOUNT_NAME = 'api-key'

export async function getApiKey(): Promise<string | null> {
  const primary = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME)
  if (primary && primary.trim().length > 0) return primary

  // Backward compatibility: read old keychain service name and migrate.
  const legacy = await keytar.getPassword(LEGACY_SERVICE_NAME, ACCOUNT_NAME)
  if (legacy && legacy.trim().length > 0) {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, legacy)
    return legacy
  }

  return null
}

export async function setApiKey(apiKey: string): Promise<void> {
  const normalized = apiKey.trim()
  await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, normalized)

  const readBack = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME)
  if (!readBack) throw new Error('Impossible de relire la clé API après sauvegarde')
}

export async function clearApiKey(): Promise<void> {
  await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME)
  await keytar.deletePassword(LEGACY_SERVICE_NAME, ACCOUNT_NAME)
}
