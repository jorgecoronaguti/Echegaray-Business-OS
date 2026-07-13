// Cliente Google (Drive/Sheets) del worker — READ-ONLY en esta fase. Autentica
// con el SERVICE ACCOUNT del Workspace (key JSON fuera de git, en la VM) y llama
// a las REST APIs con fetch (evita la dependencia pesada `googleapis`).
//
// La credencial NUNCA vive en el repo ni se loguea: se lee de un archivo cuyo path
// llega por env (GOOGLE_SA_KEY_PATH), patrón `-EnvironmentFile` de systemd. Si el
// archivo no está, falla CLARO y NO reintentable (como MissingSecretError del motor).
//
// Acceso: el service account lee los archivos que le fueron COMPARTIDOS en Drive
// (o, con domain-wide delegation, impersonando una cuenta @ecsas vía `subject`).
import { GoogleAuth } from 'google-auth-library'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const READONLY_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
]

// Raíz del repo (orquestador/lib -> ../..), para localizar la credencial existente
// sin depender del cwd. La integración real de Google (2026-07-09) ya dejó la key
// del service account acá; la REUSAMOS (no creamos una nueva).
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const EXISTING_SA_KEY = path.join(REPO_ROOT, 'scripts', 'google_workspace', 'credentials', 'service-account.json')

/** Falta la key del service account. Tipada para fallar claro y NO reintentar. */
export class MissingGoogleCredential extends Error {
  constructor(path) {
    super(`credencial de Google ausente: falta el key JSON del service account en ${path || '(GOOGLE_SA_KEY_PATH)'}. Definila en la VM, nunca en git.`)
    this.name = 'MissingGoogleCredential'
    this.code = 'MISSING_GOOGLE_CREDENTIAL'
    this.retryable = false
  }
}

/** Path del key JSON: primer candidato que exista. Prioriza el env explícito, luego
 *  la credencial de la integración real ya existente, luego el default del worker. */
export function resolveKeyPath(config) {
  const candidates = [
    config?.GOOGLE_SA_KEY_PATH,
    process.env.GOOGLE_SA_KEY_PATH,
    EXISTING_SA_KEY,
    `${process.env.HOME || '/root'}/.config/echegaray-orq/google-sa.json`,
  ].filter(Boolean)
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c } catch { /* sigue */ }
  }
  return candidates[candidates.length - 1]
}

/**
 * Fábrica del cliente. En producción se construye con la key real; en tests se
 * inyecta `auth` (con getAccessToken) y `fetchImpl` para no tocar red ni disco.
 * @param {object} deps
 * @param {object} [deps.config]
 * @param {object} [deps.auth]       override para tests (debe exponer getAccessToken())
 * @param {function} [deps.fetchImpl] override de fetch para tests
 * @param {string}  [deps.impersonate] cuenta @ecsas a impersonar (domain-wide delegation)
 */
export function makeGoogleClient({ config, auth, fetchImpl, impersonate } = {}) {
  const doFetch = fetchImpl || globalThis.fetch
  let _auth = auth || null

  async function accessToken() {
    if (!_auth) {
      const keyPath = resolveKeyPath(config)
      if (!fs.existsSync(keyPath)) throw new MissingGoogleCredential(keyPath)
      const ga = new GoogleAuth({ keyFile: keyPath, scopes: READONLY_SCOPES, clientOptions: impersonate ? { subject: impersonate } : {} })
      _auth = await ga.getClient()
    }
    const t = await _auth.getAccessToken()
    return typeof t === 'string' ? t : t?.token
  }

  async function apiGet(url) {
    const token = await accessToken()
    const res = await doFetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const body = String(await res.text()).slice(0, 200)
      const err = new Error(`google api ${res.status}: ${body}`)
      err.status = res.status
      throw err
    }
    return res.json()
  }

  return {
    /** Busca archivos cuyo nombre CONTIENE el texto (robusto a espacios/variantes del
     *  título; el match exacto falla, p.ej., por el espacio final de "Flujo de Caja - Cash Flow ").
     *  Devuelve [{id,name,mimeType}]. */
    async searchFile(name) {
      const q = encodeURIComponent(`name contains '${String(name).replace(/'/g, "\\'")}' and trashed = false`)
      const j = await apiGet(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=10`)
      return j.files || []
    },
    /** Lee valores de un rango A1 de un Sheet. Devuelve matriz de filas. */
    async readSheetValues(fileId, range) {
      const j = await apiGet(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}/values/${encodeURIComponent(range)}`,
      )
      return j.values || []
    },
    /** Lista los nombres de pestañas de un Sheet. */
    async listTabs(fileId) {
      const j = await apiGet(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}?fields=sheets.properties.title`,
      )
      return (j.sheets || []).map((s) => s.properties?.title).filter(Boolean)
    },
    /** Encuentra una carpeta por nombre (contains). Devuelve {id,name} o null. */
    async findFolder(name) {
      const q = encodeURIComponent(`name contains '${String(name).replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)
      const j = await apiGet(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=10`)
      return (j.files || [])[0] || null
    },
    /** Lista el contenido inmediato de una carpeta (archivos y subcarpetas). */
    async listFolder(folderId) {
      const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
      const j = await apiGet(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=folder,name&pageSize=1000`)
      return j.files || []
    },
  }
}
