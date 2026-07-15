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

// Scopes de ESCRITURA. GOTCHA REAL (verificado 2026-07-14): `drive.file` solo da acceso
// a archivos CREADOS por la app o abiertos vía Picker — NO a archivos existentes del
// dueño aunque estén compartidos como editor. Por eso mover/renombrar una carpeta que
// ya existía devolvía 403 "app has not been granted write access", mientras crear
// carpetas y editar Sheets (scope `spreadsheets`) sí funcionaba. Para reorganizar el
// Drive real del dueño (mover/renombrar/editar cualquier archivo COMPARTIDO como editor
// con la SA) hace falta el scope `drive` completo. Es un service account SIN delegación:
// el acceso real lo sigue gobernando el COMPARTIR de cada archivo, no el scope — el scope
// amplio no da acceso a nada que no esté compartido con la cuenta. No requiere re-consent.
export const WRITE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
]

// PRP-024 — Workspace completo (Drive + Gmail lectura/borradores + Calendar). SOLO funcionan
// con domain-wide delegation activa (admin de @ecsas.com.ar autoriza el client-id del SA para
// estos scopes) e impersonando una cuenta real. Sin eso, las llamadas dan 403 (claro, no rompe).
export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar',
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
export function makeGoogleClient({ config, auth, fetchImpl, impersonate, scopes } = {}) {
  const doFetch = fetchImpl || globalThis.fetch
  const authScopes = scopes || READONLY_SCOPES
  // Cuenta a impersonar (domain-wide delegation). Si no se pasa explícita, sale de la env
  // ORQ_GOOGLE_IMPERSONATE (ej. una cuenta @ecsas.com.ar). Sin cuenta => sin impersonación.
  const subject = impersonate || process.env.ORQ_GOOGLE_IMPERSONATE || null
  let _auth = auth || null

  async function accessToken() {
    if (!_auth) {
      const keyPath = resolveKeyPath(config)
      if (!fs.existsSync(keyPath)) throw new MissingGoogleCredential(keyPath)
      const ga = new GoogleAuth({ keyFile: keyPath, scopes: authScopes, clientOptions: subject ? { subject } : {} })
      _auth = await ga.getClient()
    }
    const t = await _auth.getAccessToken()
    return typeof t === 'string' ? t : t?.token
  }

  /** POST/PUT/PATCH con cuerpo JSON. Devuelve el JSON de respuesta. Error CLARO con
   *  el status y el cuerpo (para distinguir p.ej. 403 sin permiso de edición sobre
   *  el archivo destino — el Gotcha del Service Account). */
  async function apiSend(url, method, body) {
    const token = await accessToken()
    const res = await doFetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      const text = String(await res.text()).slice(0, 300)
      const err = new Error(`google api ${res.status}: ${text}`)
      err.status = res.status
      throw err
    }
    return res.json()
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

  /** Descarga los bytes crudos de un archivo (alt=media). Para Excel/binarios. */
  async function downloadBytes(fileId) {
    const token = await accessToken()
    const res = await doFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const err = new Error(`google download ${res.status}`)
      err.status = res.status
      throw err
    }
    return Buffer.from(await res.arrayBuffer())
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
    // ---- PRP-024: GMAIL (lectura) — requiere delegation + impersonación activa ----
    /** Busca hilos/mensajes por query estilo Gmail (ej. "from:proveedor factura vencida").
     *  Devuelve [{id, from, subject, date, snippet}]. Vacío si no hay o si falta acceso. */
    async gmailSearch(queryStr, { max = 8 } = {}) {
      const list = await apiGet(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(queryStr || '')}&maxResults=${max}`)
      const out = []
      for (const m of (list.messages || []).slice(0, max)) {
        const msg = await apiGet(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)
        const h = Object.fromEntries((msg.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]))
        out.push({ id: m.id, from: h.from || '', subject: h.subject || '(sin asunto)', date: h.date || '', snippet: msg.snippet || '' })
      }
      return out
    },
    /** Texto plano de un mensaje por id (para leer el cuerpo). Acotado. */
    async gmailGet(id, { maxChars = 4000 } = {}) {
      const msg = await apiGet(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`)
      const parts = []
      const walk = (p) => {
        if (!p) return
        if (p.mimeType === 'text/plain' && p.body?.data) parts.push(Buffer.from(p.body.data, 'base64').toString('utf8'))
        for (const c of p.parts || []) walk(c)
      }
      walk(msg.payload)
      return { id, snippet: msg.snippet || '', text: parts.join('\n').slice(0, maxChars) }
    },
    // ---- PRP-024: CALENDAR (lectura) ----
    /** Próximos eventos del calendario primario. Devuelve [{summary, start, end}]. */
    async calendarUpcoming({ max = 10, days = 30 } = {}) {
      const timeMin = new Date().toISOString()
      const timeMax = new Date(Date.now() + days * 86400000).toISOString()
      const j = await apiGet(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=${max}`)
      return (j.items || []).map((e) => ({ summary: e.summary || '(sin título)', start: e.start?.dateTime || e.start?.date || '', end: e.end?.dateTime || e.end?.date || '' }))
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
    /** Metadata de un archivo (id, name, mimeType, size, link para abrirlo). */
    async getMeta(fileId) {
      return apiGet(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink&supportsAllDrives=true`)
    },
    /** Lee un archivo Excel (.xlsx/.xlsm) descargándolo y parseándolo. Acotado a
     *  maxRows para no explotar tokens. Devuelve pestañas + filas de la elegida. */
    async readExcel(fileId, { sheet, maxRows = 50 } = {}) {
      const XLSX = await import('xlsx')
      const buf = await downloadBytes(fileId)
      const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
      const sheets = wb.SheetNames
      const target = sheet && sheets.includes(sheet) ? sheet : sheets[0]
      const ws = wb.Sheets[target]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null })
      return { sheets, sheet: target, total_rows: rows.length, rows: rows.slice(0, maxRows) }
    },
    /** Lee el TEXTO de un PDF extrayéndolo LOCALMENTE (0 costo de API — no manda el PDF
     *  al modelo). Acotado a maxChars para no explotar tokens. Un PDF escaneado (imagen)
     *  devuelve poco/nada de texto: se marca `scanned` para que el que llama lo sepa. */
    async readPdfText(fileId, { maxChars = 20000 } = {}) {
      const { PDFParse } = await import('pdf-parse')
      const buf = await downloadBytes(fileId)
      const parser = new PDFParse({ data: new Uint8Array(buf) })
      try {
        const r = await parser.getText()
        const text = String(r.text || '')
        return { pages: r.total ?? null, chars: text.length, text: text.slice(0, maxChars), truncated: text.length > maxChars, scanned: text.trim().length < 40 }
      } finally { try { await parser.destroy() } catch { /* noop */ } }
    },

    // ---- ESCRITURA (requiere scopes de WRITE_SCOPES; cada efecto pasó por aprobación) ----

    /** Sobrescribe un rango A1 de un Sheet con `values` (matriz de filas).
     *  USER_ENTERED: respeta fórmulas y formatos de número como si lo tipearas. */
    async updateSheetValues(fileId, range, values) {
      return apiSend(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
        'PUT',
        { range, majorDimension: 'ROWS', values },
      )
    },
    /** Agrega filas al final de la tabla que arranca en `range` (INSERT_ROWS: no pisa
     *  lo que haya debajo). Devuelve el rango efectivamente escrito. */
    async appendSheetValues(fileId, range, values) {
      return apiSend(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        'POST',
        { range, majorDimension: 'ROWS', values },
      )
    },
    /** Crea un archivo propio del OS (Doc/Sheet nativo o carpeta) vía Drive metadata.
     *  Con `parents` lo ubica en una carpeta. Devuelve {id,name,mimeType,webViewLink}. */
    async createFile({ name, mimeType, parents } = {}) {
      if (!name || !mimeType) throw new Error('createFile: faltan name o mimeType')
      return apiSend(
        'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink&supportsAllDrives=true',
        'POST',
        { name, mimeType, ...(parents ? { parents } : {}) },
      )
    },
    /** Renombra un archivo/carpeta existente. */
    async renameFile(fileId, name) {
      return apiSend(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name&supportsAllDrives=true`,
        'PATCH',
        { name },
      )
    },
    /** Mueve un archivo/carpeta a otra carpeta (saca de sus padres actuales). */
    async moveFile(fileId, folderId) {
      const meta = await apiGet(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=parents&supportsAllDrives=true`)
      const remove = (meta.parents || []).join(',')
      const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?addParents=${encodeURIComponent(folderId)}` +
        (remove ? `&removeParents=${encodeURIComponent(remove)}` : '') + '&fields=id,name,parents&supportsAllDrives=true'
      return apiSend(url, 'PATCH', {})
    },

    // ---- ABM POTENTE de Sheets/Drive (todas pasan por aprobación vía la policy) ----

    /** Escribe VARIOS rangos de un Sheet en UNA sola operación (batch). `data` = matriz de
     *  { range, values }. Mucho más rápido y menos "escueto" que una celda por vez. */
    async batchUpdateValues(fileId, data) {
      return apiSend(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}/values:batchUpdate`,
        'POST',
        { valueInputOption: 'USER_ENTERED', data },
      )
    },
    /** Limpia (vacía) el contenido de un rango sin borrar formato. */
    async clearValues(fileId, range) {
      return apiSend(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}/values/${encodeURIComponent(range)}:clear`,
        'POST',
        {},
      )
    },
    /** Propiedades de las pestañas: [{ sheetId, title }]. El sheetId numérico hace falta
     *  para operaciones estructurales (insertar/borrar filas, formato). */
    async getSheetMeta(fileId) {
      const j = await apiGet(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}?fields=sheets.properties(sheetId,title,gridProperties)`)
      return (j.sheets || []).map((s) => ({ sheetId: s.properties?.sheetId, title: s.properties?.title, rows: s.properties?.gridProperties?.rowCount }))
    },
    /** Operaciones ESTRUCTURALES de un Sheet (insertar/borrar filas o columnas, formato)
     *  vía batchUpdate. `requests` = array de requests de la Sheets API. */
    async spreadsheetBatchUpdate(fileId, requests) {
      return apiSend(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}:batchUpdate`,
        'POST',
        { requests },
      )
    },
    /** Copia/duplica un archivo (para partir de una plantilla o de un presupuesto previo). */
    async copyFile(fileId, name, parents) {
      return apiSend(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy?fields=id,name,webViewLink,mimeType&supportsAllDrives=true`,
        'POST',
        { ...(name ? { name } : {}), ...(parents ? { parents } : {}) },
      )
    },
    /** Baja REVERSIBLE: manda el archivo a la papelera (no borra definitivo). */
    async trashFile(fileId) {
      return apiSend(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,trashed&supportsAllDrives=true`,
        'PATCH',
        { trashed: true },
      )
    },
  }
}
