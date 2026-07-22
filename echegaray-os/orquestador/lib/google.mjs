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
  'https://www.googleapis.com/auth/tasks',
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

// Dominio interno por defecto (Echegaray). Configurable por env. Se usa para COMPLETAR
// destinatarios que el dueño escribe abreviados: "rodrigo" → rodrigo@ecsas.com.ar,
// "rodrigo@ecsas" (sin TLD) → rodrigo@ecsas.com.ar. Sin esto, Gmail devuelve
// 400 "Invalid To header" al ENVIAR (falla recién en la aprobación, no al componer).
export const DEFAULT_MAIL_DOMAIN = String(process.env.ORQ_MAIL_DOMAIN || 'ecsas.com.ar').toLowerCase()
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** ¿Es una dirección de mail sintácticamente válida? (no verifica que exista). */
export function esEmailValido(s) { return EMAIL_RE.test(String(s || '').trim()) }

/** Completa UN destinatario abreviado a un mail interno válido, sin adivinar de más:
 *  - "Nombre <mail>" → extrae el mail
 *  - "rodrigo"        → rodrigo@DEFAULT_DOMAIN (token simple, sin @)
 *  - "rodrigo@ecsas"  → rodrigo@ecsas.com.ar (dominio sin punto que es PREFIJO del interno)
 *  - "juan@gmail.com" → intacto (dominio externo válido, no se toca)
 *  - "juan@gmail"     → intacto (dominio externo incompleto: NO lo forzamos a interno; que
 *                        falle la validación y se pida el mail completo, no mandar a la persona equivocada)
 *  Devuelve el string tal cual si no puede completarlo con seguridad. */
export function completarDestinatario(raw, domain = DEFAULT_MAIL_DOMAIN) {
  let s = String(raw || '').trim()
  if (!s) return s
  const ang = s.match(/<([^>]+)>/)
  if (ang) s = ang[1].trim()
  if (!s.includes('@')) {
    return /^[a-z0-9._%+-]+$/i.test(s) ? `${s}@${domain}` : s
  }
  const at = s.lastIndexOf('@')
  const local = s.slice(0, at)
  const dom = s.slice(at + 1).toLowerCase()
  if (local && dom && !dom.includes('.') && domain.startsWith(dom)) return `${local}@${domain}`
  return s
}

/** Normaliza una lista de destinatarios (separados por coma o punto y coma), completando
 *  cada uno. Devuelve { lista, invalidos }: `lista` es el string listo para el header To/Cc;
 *  `invalidos` son los que ni completados quedaron válidos (para avisar y NO enviar). */
export function normalizarDestinatarios(raw) {
  const partes = String(raw || '').split(/[,;]+/).map((p) => p.trim()).filter(Boolean)
  const ok = [], invalidos = []
  for (const p of partes) {
    const c = completarDestinatario(p)
    if (esEmailValido(c)) ok.push(c); else invalidos.push(p)
  }
  return { lista: ok.join(', '), invalidos }
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
export function makeGoogleClient({ config, auth, fetchImpl, impersonate, scopes, getToken } = {}) {
  const rawFetch = fetchImpl || globalThis.fetch
  // Toda llamada a Google se acota en el tiempo (AbortController): una llamada colgada (red,
  // API que no responde) falla RÁPIDO y claro en vez de colgar la tarea entera del dueño.
  const FETCH_MS = Number(process.env.ORQ_GOOGLE_FETCH_TIMEOUT_MS || 45000)
  const doFetch = async (url, opts = {}) => {
    if (opts.signal) return rawFetch(url, opts) // respeta un signal ya provisto (tests)
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), FETCH_MS)
    try { return await rawFetch(url, { ...opts, signal: ac.signal }) }
    catch (e) { if (e?.name === 'AbortError') { const err = new Error(`google api timeout (${FETCH_MS}ms) — la llamada no respondió`); err.status = 504; throw err } throw e }
    finally { clearTimeout(t) }
  }
  const authScopes = scopes || READONLY_SCOPES
  // OAuth POR USUARIO (PRP-024): si se pasa getToken (async → access token del usuario que
  // autorizó), el cliente actúa COMO ese usuario en vez del Service Account. Cacheamos el
  // token ~50 min para no refrescar en cada llamada. Es el cable que hace que el OS opere
  // el Drive/Gmail/Calendar del dueño (crear/copiar donde sea), no la cuenta sin storage.
  let _tokCache = null
  async function userToken() {
    if (_tokCache && _tokCache.exp > Date.now()) return _tokCache.val
    const val = await getToken()
    if (val) _tokCache = { val, exp: Date.now() + 50 * 60 * 1000 }
    return val
  }
  // Cuenta a impersonar (domain-wide delegation) — SOLO si se pasa EXPLÍCITA (la usan las
  // tools de Gmail/Calendar). NO se toma de la env global: los clientes de Drive/Sheets
  // acceden por archivo compartido con el SA y NO deben impersonar (si lo hicieran antes de
  // que la delegación esté activa, romperían las lecturas que hoy funcionan).
  const subject = impersonate || null
  let _auth = auth || null

  async function accessToken() {
    // OAuth por usuario: si hay getToken y devuelve token, se actúa COMO el usuario.
    if (getToken) { const ut = await userToken(); if (ut) return ut }
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
  // Reintento con backoff ante límites transitorios de Google: 429 (Quota exceeded —
  // "Read requests per minute per user", que salta cuando el agente lee muchos rangos
  // seguidos al reconstruir una planilla) y 5xx. Sin esto, una ráfaga de lecturas rompe
  // toda la tarea a mitad. Hasta 4 intentos, espera creciente (0.6s, 1.4s, 3s, 6s).
  async function withRetry(doer) {
    const esperas = [600, 1400, 3000, 6000]
    for (let intento = 0; ; intento++) {
      const res = await doer()
      if (res.ok || res.status === 204) return res
      const transitorio = res.status === 429 || (res.status >= 500 && res.status < 600)
      if (!transitorio || intento >= esperas.length) return res
      await new Promise((r) => setTimeout(r, esperas[intento]))
    }
  }

  async function apiSend(url, method, body) {
    const token = await accessToken()
    const res = await withRetry(() => doFetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }))
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
    const res = await withRetry(() => doFetch(url, { headers: { Authorization: `Bearer ${token}` } }))
    if (!res.ok) {
      const body = String(await res.text()).slice(0, 200)
      const err = new Error(`google api ${res.status}: ${body}`)
      err.status = res.status
      throw err
    }
    return res.json()
  }

  async function apiDelete(url) {
    const token = await accessToken()
    const res = await doFetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok && res.status !== 204) {
      const body = String(await res.text()).slice(0, 200)
      const err = new Error(`google api ${res.status}: ${body}`)
      err.status = res.status
      throw err
    }
    return { ok: true }
  }

  // Construye un mensaje RFC 2822 y lo codifica base64url para la Gmail API. Asunto en
  // encoded-word UTF-8 para no romper con acentos (común en español).
  function buildRawEmail({ to, cc, bcc, subject, body, attachments = [] }) {
    const encWord = (s) => `=?UTF-8?B?${Buffer.from(String(s || ''), 'utf8').toString('base64')}?=`
    // Completar destinatarios abreviados (rodrigo@ecsas → rodrigo@ecsas.com.ar) para no
    // mandar un header inválido a Gmail. Si tras completar sigue habiendo inválidos, cortamos
    // acá con un error CLARO (mejor fallar honesto que enviar a una dirección rota/equivocada).
    const nTo = normalizarDestinatarios(to), nCc = normalizarDestinatarios(cc), nBcc = normalizarDestinatarios(bcc)
    const malos = [...nTo.invalidos, ...nCc.invalidos, ...nBcc.invalidos]
    if (malos.length) throw new Error(`destinatario inválido: ${malos.join(', ')}. Dame el mail completo (ej. nombre@ecsas.com.ar).`)
    if (!nTo.lista) throw new Error('falta el destinatario (to) del mail.')
    const h = []
    h.push(`To: ${nTo.lista}`)
    if (nCc.lista) h.push(`Cc: ${nCc.lista}`)
    if (nBcc.lista) h.push(`Bcc: ${nBcc.lista}`)
    h.push(`Subject: ${encWord(subject)}`)
    h.push('MIME-Version: 1.0')
    let mime
    if (Array.isArray(attachments) && attachments.length) {
      // multipart/mixed: cuerpo de texto + cada adjunto en base64.
      const bnd = `b_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const p = [`Content-Type: multipart/mixed; boundary="${bnd}"`, '', `--${bnd}`,
        'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', String(body || '')]
      for (const a of attachments) {
        const b64 = String(a.dataBase64 || '').replace(/[\r\n]/g, '')
        p.push(`--${bnd}`,
          `Content-Type: ${a.mimeType || 'application/octet-stream'}; name="${a.filename || 'adjunto'}"`,
          'Content-Transfer-Encoding: base64',
          `Content-Disposition: attachment; filename="${a.filename || 'adjunto'}"`, '',
          b64.replace(/(.{76})/g, '$1\r\n'))
      }
      p.push(`--${bnd}--`)
      mime = h.join('\r\n') + '\r\n' + p.join('\r\n')
    } else {
      h.push('Content-Type: text/plain; charset="UTF-8"')
      h.push('Content-Transfer-Encoding: 8bit')
      mime = h.join('\r\n') + '\r\n\r\n' + String(body || '')
    }
    return Buffer.from(mime, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  /** Resuelve un archivo de Drive (por file_id) a un adjunto de mail: {filename, mimeType,
   *  dataBase64}. Un archivo nativo de Google (Doc/Sheet/Slides) NO se puede adjuntar "como
   *  gdoc" (es un archivo en la nube, no un binario), hay que EXPORTARLO: por defecto al
   *  formato Office equivalente que RESPETA el documento y es editable (Doc→docx, Sheet→xlsx,
   *  Slides→pptx); con formato='pdf' sale como PDF (final, no editable). El resto se baja tal
   *  cual. Para "mandá el mail con el archivo X adjunto". */
  async function fetchAttachment(fileId, { formato = 'documento' } = {}) {
    const token = await accessToken()
    const meta = await (await doFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,mimeType&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })).json()
    const nativo = /application\/vnd\.google-apps\./.test(meta.mimeType || '')
    if (nativo) {
      // Mapa formato Office (respeta el tipo de documento, editable). Si el nativo no tiene
      // equivalente Office (Form, Drawing…), cae a PDF.
      const OFFICE = {
        'application/vnd.google-apps.document': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
        'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
        'application/vnd.google-apps.presentation': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' },
      }
      const office = OFFICE[meta.mimeType]
      const usarPdf = formato === 'pdf' || !office
      const exportMime = usarPdf ? 'application/pdf' : office.mime
      const ext = usarPdf ? 'pdf' : office.ext
      const res = await doFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`export ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      return { filename: `${meta.name || 'documento'}.${ext}`, mimeType: exportMime, dataBase64: buf.toString('base64') }
    }
    const res = await doFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`download ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    return { filename: meta.name || 'adjunto', mimeType: meta.mimeType || 'application/octet-stream', dataBase64: buf.toString('base64') }
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

  // LOCALIZACIÓN DE FÓRMULAS: en un Sheet es_AR (y la mayoría no-inglés) el separador de
  // argumentos es ';' y la coma es DECIMAL. Escribir "=SUM(1,2)" da #ERROR!. USER_ENTERED
  // parsea según el idioma del sheet. Convertimos la coma separadora → ';' (respetando
  // strings) SOLO si el sheet no es inglés. Cacheamos el separador por fileId.
  const _sepCache = new Map()
  async function argSeparator(fileId) {
    if (_sepCache.has(fileId)) return _sepCache.get(fileId)
    let sep = ';'
    try {
      const j = await apiGet(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}?fields=properties.locale`)
      sep = /^en[_-]/i.test(j.properties?.locale || '') ? ',' : ';'
    } catch { sep = ';' }
    _sepCache.set(fileId, sep)
    return sep
  }
  function convertFormula(s) {
    if (typeof s !== 'string' || s[0] !== '=') return s
    // El modelo escribe fórmulas en formato CANÓNICO (coma = separador de argumentos, punto =
    // decimal). En un sheet es_AR hay que convertir a ';' = separador y ',' = decimal. Antes SOLO
    // se hacía coma→';' y el PUNTO DECIMAL quedaba intacto → "=A1*1.02" se leía como A1*102 (en
    // es_AR el punto es separador de miles) = número MAL (reclamo real del dueño: "pone mal los
    // números"). Se respetan los literales de string (comillas dobles Y simples, ej. nombres de
    // pestaña 'Hoja.2'!A1, o el "." dentro de SUBSTITUTE(...;".";"")).
    //
    // BUG REAL (auditoría 18/07): un modelo en español a veces escribe la fórmula ya en es_AR
    // ("=G62*1,02") en vez de canónico. Convertir ESA coma decimal en ';' daba "=G62*1;02" →
    // #ERROR!. La defensa era un regex: "un número que sigue a un operador aritmético es decimal".
    //
    // BUG REAL MÁS GRAVE (20/07): ese regex rompía cualquier ARGUMENTO numérico que viniera
    // después de una cuenta, que es lo más común que hay:
    //     DATE(YEAR(A1),MONTH(A1)+1,1)     → "+1,1" se leía decimal → DATE con 2 args → #N/A
    //     OFFSET($D$5,COUNTA(X)-4,0,4,1)   → "-4,0" se leía decimal → OFFSET perdía un argumento
    // Se escribía mal y el error aparecía lejos, en la celda que lo usaba.
    //
    // La regla que SÍ distingue los dos casos es la PROFUNDIDAD DE PARÉNTESIS: dentro de una lista
    // de argumentos, una coma es un separador. Sólo es decimal si
    //   (a) está fuera de todo paréntesis  → "=G62*1,02", el caso que motivó la defensa; o
    //   (b) la fórmula ya usa ';' como separador → el modelo escribió en es_AR, sus comas son
    //       decimales ("=SUMAR.SI(A:A;\"x\";B:B)*1,02").
    //
    // Y el punto: sólo es DECIMAL entre dígitos ("1.5"). Los nombres de función españoles llevan
    // punto entre letras — SUMAR.SI, SI.ERROR, FIN.MES — y convertirlos los rompía (bug 20/07).
    const esDigito = (c) => c >= '0' && c <= '9'
    // ¿La fórmula ya viene con ';' de separador? (fuera de strings)
    let usaPuntoYComa = false
    for (let i = 0, dentro = false, q = ''; i < s.length; i++) {
      const c = s[i]
      if (dentro) { if (c === q) dentro = false; continue }
      if (c === '"' || c === "'") { dentro = true; q = c; continue }
      if (c === ';') { usaPuntoYComa = true; break }
    }
    let out = '', inStr = false, quote = '', prof = 0
    for (let i = 0; i < s.length; i++) {
      const c = s[i]
      if (inStr) { out += c; if (c === quote) inStr = false; continue }
      if (c === '"' || c === "'") { inStr = true; quote = c; out += c; continue }
      if (c === '(') { prof++; out += c; continue }
      if (c === ')') { prof--; out += c; continue }
      if (c === ',') {
        const entreDigitos = esDigito(s[i - 1]) && esDigito(s[i + 1])
        out += entreDigitos && (prof === 0 || usaPuntoYComa) ? ',' : ';'
      } else if (c === '.' && esDigito(s[i - 1]) && esDigito(s[i + 1])) out += ','
      else out += c
    }
    return out
  }
  async function localizeValues(fileId, values) {
    if (!Array.isArray(values)) return values
    // ¿Hay alguna fórmula? (evita el fetch de locale si son solo datos)
    const hayFormula = values.some((r) => Array.isArray(r) && r.some((c) => typeof c === 'string' && c[0] === '='))
    if (!hayFormula) return values
    if ((await argSeparator(fileId)) === ',') return values // sheet inglés: coma es correcta
    return values.map((r) => (Array.isArray(r) ? r.map(convertFormula) : r))
  }

  return {
    /** Convierte una fórmula al separador del sheet (coma→; en es_AR). Expuesto para tests
     *  y para que las tools puedan localizar antes de mostrar/escribir. */
    _convertFormula: convertFormula,
    /** Localiza las fórmulas de una matriz de valores al separador del sheet. Expuesto porque el
     *  renderizador escribe con updateCells (formulaValue), que NO pasa por batchUpdateValues y por
     *  eso se saltaba la localización: escribía "INDEX(a,b)" en un sheet es-AR → #ERROR!. Bug real
     *  20/07: el agente de nómina reescribió el cuadro de quincenas y dejó 14 celdas en error. */
    localizeFormulas: localizeValues,
    /** Busca archivos cuyo nombre CONTIENE el texto (robusto a espacios/variantes del
     *  título; el match exacto falla, p.ej., por el espacio final de "Flujo de Caja - Cash Flow ").
     *  Devuelve [{id,name,mimeType}]. */
    async searchFile(name) {
      const q = encodeURIComponent(`name contains '${String(name).replace(/'/g, "\\'")}' and trashed = false`)
      const j = await apiGet(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=10`)
      return j.files || []
    },
    /** Metadata liviana de un archivo por id (existe? cómo se llama?). Lanza si NO existe (404).
     *  Para VALIDAR un adjunto antes de encolar un mail — así el OS no afirma haber adjuntado
     *  un archivo inexistente. */
    async fileMeta(fileId) {
      const j = await apiGet(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,trashed&supportsAllDrives=true`)
      if (!j || !j.id || j.trashed) throw new Error(`archivo no encontrado: ${fileId}`)
      return { id: j.id, name: j.name, mimeType: j.mimeType }
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
      return (j.items || []).map((e) => ({ id: e.id, summary: e.summary || '(sin título)', start: e.start?.dateTime || e.start?.date || '', end: e.end?.dateTime || e.end?.date || '' }))
    },
    // ---- GMAIL (escritura) — el OS actúa COMO el usuario (OAuth). Enviar/borrar pasan por
    //      aprobación (Nivel E); borrador/etiquetar/archivar son reversibles e internos. ----
    /** Resuelve file_ids de Drive a adjuntos de mail. formato: 'documento' (default, respeta
     *  el tipo: Doc→docx, Sheet→xlsx) o 'pdf'. */
    async resolveAttachments(attachmentFileIds = [], formato = 'documento') {
      const out = []
      for (const id of attachmentFileIds || []) { if (id) out.push(await fetchAttachment(String(id), { formato })) }
      return out
    },
    /** Envía un mail. to/cc/bcc son strings. threadId opcional (responder en hilo).
     *  attachmentFileIds: file_ids de Drive para ADJUNTAR; attachmentFormat 'documento'|'pdf'. */
    async gmailSend({ to, cc, bcc, subject, body, threadId, attachmentFileIds, attachmentFormat } = {}) {
      const { attachments, links } = await this.prepareAttachments(attachmentFileIds, { formato: attachmentFormat, shareWith: to })
      const finalBody = links.length ? `${body || ''}\n\n${links.map((l) => `📎 ${l.name}: ${l.url}`).join('\n')}` : body
      const raw = buildRawEmail({ to, cc, bcc, subject, body: finalBody, attachments })
      const payload = threadId ? { raw, threadId } : { raw }
      const r = await apiSend('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', 'POST', payload)
      return { id: r.id, threadId: r.threadId, to, subject, adjuntos: [...attachments.map((a) => a.filename), ...links.map((l) => `${l.name} (link Drive)`)] }
    },
    /** Crea un BORRADOR (no envía). Reversible, sin efecto externo. Soporta adjuntos de Drive. */
    async gmailCreateDraft({ to, cc, bcc, subject, body, attachmentFileIds, attachmentFormat } = {}) {
      const { attachments, links } = await this.prepareAttachments(attachmentFileIds, { formato: attachmentFormat, shareWith: to })
      const finalBody = links.length ? `${body || ''}\n\n${links.map((l) => `📎 ${l.name}: ${l.url}`).join('\n')}` : body
      const raw = buildRawEmail({ to, cc, bcc, subject, body: finalBody, attachments })
      const r = await apiSend('https://gmail.googleapis.com/gmail/v1/users/me/drafts', 'POST', { message: { raw } })
      return { draft_id: r.id, to, subject, adjuntos: [...attachments.map((a) => a.filename), ...links.map((l) => `${l.name} (link Drive)`)] }
    },
    /** Modifica etiquetas de un mensaje (agregar/quitar). Archivar = quitar INBOX. */
    async gmailModifyLabels(id, { add = [], remove = [] } = {}) {
      const r = await apiSend(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}/modify`, 'POST', { addLabelIds: add, removeLabelIds: remove })
      return { id: r.id, labels: r.labelIds || [] }
    },
    /** Archiva un mensaje (lo saca de INBOX; reversible). */
    async gmailArchive(id) {
      const r = await apiSend(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}/modify`, 'POST', { removeLabelIds: ['INBOX'] })
      return { id: r.id, archived: true }
    },
    /** Manda un mensaje a la PAPELERA de Gmail (reversible 30 días). */
    async gmailTrash(id) {
      const r = await apiSend(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}/trash`, 'POST', {})
      return { id: r.id, trashed: true }
    },
    // ---- CALENDAR (escritura) — crear/editar/borrar; si hay invitados, avisa a todos. ----
    /** Crea un evento. start/end: "YYYY-MM-DD" (día completo) o ISO datetime. attendees: [emails]. */
    async calendarCreateEvent({ summary, description, location, start, end, attendees = [] } = {}) {
      const when = (v) => (String(v).length <= 10 ? { date: String(v) } : { dateTime: String(v) })
      const ev = { summary, description, location, start: when(start), end: when(end) }
      if (attendees.length) ev.attendees = attendees.map((e) => ({ email: e }))
      const q = attendees.length ? '?sendUpdates=all' : ''
      const r = await apiSend(`https://www.googleapis.com/calendar/v3/calendars/primary/events${q}`, 'POST', ev)
      return { id: r.id, summary: r.summary, start: r.start, end: r.end, link: r.htmlLink }
    },
    /** Modifica un evento existente (patch parcial). */
    async calendarUpdateEvent(id, patch = {}) {
      const body = { ...patch }
      if (patch.start) body.start = String(patch.start).length <= 10 ? { date: String(patch.start) } : { dateTime: String(patch.start) }
      if (patch.end) body.end = String(patch.end).length <= 10 ? { date: String(patch.end) } : { dateTime: String(patch.end) }
      if (Array.isArray(patch.attendees)) body.attendees = patch.attendees.map((e) => ({ email: e }))
      const r = await apiSend(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}?sendUpdates=all`, 'PATCH', body)
      return { id: r.id, summary: r.summary, start: r.start, end: r.end, link: r.htmlLink }
    },
    /** Borra un evento (avisa a los invitados). */
    async calendarDeleteEvent(id) {
      await apiDelete(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}?sendUpdates=all`)
      return { id, deleted: true }
    },
    /** Alta RÁPIDA por lenguaje natural ("Reunión con Pérez el martes 15hs"). Google parsea la
     *  fecha/hora. Ideal cuando el dueño tira el evento en una frase. */
    async calendarQuickAdd(text) {
      const r = await apiSend(`https://www.googleapis.com/calendar/v3/calendars/primary/events/quickAdd?text=${encodeURIComponent(String(text || ''))}`, 'POST', {})
      return { id: r.id, summary: r.summary, start: r.start, end: r.end, link: r.htmlLink }
    },
    // ---- GOOGLE TASKS — lista de pendientes del dueño. Requiere el scope tasks (re-consent
    //      OAuth). Crear/completar una tarea es interno y reversible (no notifica a nadie). ----
    /** Listas de tareas del usuario. Devuelve [{id, title}]. La default suele ser "Mis tareas". */
    async tasksLists() {
      const j = await apiGet('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=50')
      return (j.items || []).map((l) => ({ id: l.id, title: l.title }))
    },
    /** Crea una TAREA (título, notas y vencimiento opcional "YYYY-MM-DD"). tasklist def '@default'.
     *  parent = id de otra tarea → la crea como SUBTAREA (Google soporta 1 nivel de anidado). */
    async taskCreate({ title, notes, due, tasklist = '@default', parent } = {}) {
      const body = { title }
      if (notes) body.notes = notes
      if (due) body.due = String(due).length <= 10 ? `${due}T00:00:00.000Z` : String(due)
      const q = parent ? `?parent=${encodeURIComponent(parent)}` : ''
      const r = await apiSend(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklist)}/tasks${q}`, 'POST', body)
      return { id: r.id, title: r.title, due: r.due || null, status: r.status, parent: r.parent || null }
    },
    /** Lista tareas de una lista (por defecto pendientes). */
    async tasksList({ tasklist = '@default', includeCompleted = false, max = 50 } = {}) {
      const q = `showCompleted=${includeCompleted}&showHidden=${includeCompleted}&maxResults=${max}`
      const j = await apiGet(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklist)}/tasks?${q}`)
      return (j.items || []).map((t) => ({ id: t.id, title: t.title || '(sin título)', due: t.due || null, status: t.status, notes: t.notes || '' }))
    },
    /** Marca una tarea como completada (o la reabre con status='needsAction'). */
    async taskComplete(id, { tasklist = '@default', status = 'completed' } = {}) {
      const r = await apiSend(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklist)}/tasks/${encodeURIComponent(id)}`, 'PATCH', { status })
      return { id: r.id, title: r.title, status: r.status }
    },
    /** Borra una tarea (reversible sólo desde la papelera de Tasks; efecto interno). */
    async taskDelete(id, { tasklist = '@default' } = {}) {
      await apiDelete(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklist)}/tasks/${encodeURIComponent(id)}`)
      return { id, deleted: true }
    },
    // ---- GMAIL (más acciones) — el scope modify habilita responder, marcar leído y destacar. ----
    /** RESPONDE un mail en su hilo: toma remitente y asunto del original y envía "Re:". */
    async gmailReply(id, body) {
      const msg = await apiGet(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID`)
      const h = Object.fromEntries((msg.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]))
      const to = h.from || ''
      const subject = /^re:/i.test(h.subject || '') ? h.subject : `Re: ${h.subject || ''}`
      const raw = buildRawEmail({ to, subject, body })
      const r = await apiSend('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', 'POST', { raw, threadId: msg.threadId })
      return { id: r.id, threadId: r.threadId, to, subject }
    },
    /** Marca un mensaje como leído (quita UNREAD) o no leído. */
    async gmailMarkRead(id, read = true) {
      const mod = read ? { removeLabelIds: ['UNREAD'] } : { addLabelIds: ['UNREAD'] }
      const r = await apiSend(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}/modify`, 'POST', mod)
      return { id: r.id, read }
    },
    /** Destaca (STARRED) o quita la estrella de un mensaje. */
    async gmailStar(id, star = true) {
      const mod = star ? { addLabelIds: ['STARRED'] } : { removeLabelIds: ['STARRED'] }
      const r = await apiSend(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}/modify`, 'POST', mod)
      return { id: r.id, starred: star }
    },
    /** REENVÍA un mail a otro destinatario, con el cuerpo original citado y una nota opcional
     *  arriba. Efecto externo (envía). Preserva adjuntos si se pasan file_ids de Drive. */
    async gmailForward(id, to, note = '', { attachmentFileIds, attachmentFormat } = {}) {
      const meta = await apiGet(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`)
      const h = Object.fromEntries((meta.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]))
      const orig = await this.gmailGet(id, { maxChars: 12000 })
      const subject = /^fwd:/i.test(h.subject || '') ? h.subject : `Fwd: ${h.subject || ''}`
      const body = `${note ? note + '\n\n' : ''}---------- Mensaje reenviado ----------\nDe: ${h.from || ''}\nFecha: ${h.date || ''}\nAsunto: ${h.subject || ''}\n\n${orig.text || ''}`
      const attachments = await this.resolveAttachments(attachmentFileIds, attachmentFormat)
      const raw = buildRawEmail({ to, subject, body, attachments })
      const r = await apiSend('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', 'POST', { raw })
      return { id: r.id, to, subject }
    },
    /** Franjas OCUPADAS del calendario en un rango (freeBusy). Para buscar hueco: el modelo
     *  pide el rango y ve los huecos libres entre las franjas ocupadas. */
    async calendarBusy({ start, end } = {}) {
      const timeMin = String(start).length <= 10 ? `${start}T00:00:00-03:00` : String(start)
      const timeMax = String(end).length <= 10 ? `${end}T23:59:59-03:00` : String(end)
      const r = await apiSend('https://www.googleapis.com/calendar/v3/freeBusy', 'POST', { timeMin, timeMax, items: [{ id: 'primary' }] })
      return { ocupado: (r.calendars?.primary?.busy || []).map((b) => ({ desde: b.start, hasta: b.end })), rango: { desde: timeMin, hasta: timeMax } }
    },
    /** Lee valores de un rango A1 de un Sheet. Devuelve matriz de filas. */
    async readSheetValues(fileId, range) {
      const j = await apiGet(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}/values/${encodeURIComponent(range)}`,
      )
      return j.values || []
    },
    /**
     * Lee la PESTAÑA COMO ES: fórmula y valor de cada celda, celdas combinadas y formato numérico.
     *
     * `readSheetValues` devuelve sólo el valor calculado — con eso es IMPOSIBLE distinguir un
     * número pegado a mano de una celda con fórmula, que es exactamente la distinción que manda en
     * este proyecto ("en el Sheet nunca números sueltos: fórmulas o celdas con origen trazable").
     * Sin esto, cualquier "analizá esta pestaña y mejorala" es opinión sobre una foto.
     */
    async readSheetGrid(fileId, range) {
      const campos = 'sheets(properties(title,gridProperties),merges,data(startRow,startColumn,rowData(values(formattedValue,userEnteredValue,effectiveValue,userEnteredFormat/numberFormat))))'
      const j = await apiGet(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}?ranges=${encodeURIComponent(range)}&fields=${encodeURIComponent(campos)}`,
      )
      const s = (j.sheets || [])[0]
      if (!s) return { titulo: null, filas: [], merges: [] }
      const d = (s.data || [])[0] || {}
      const filas = (d.rowData || []).map((r) => (r.values || []).map((c) => ({
        // La fórmula sólo existe si el usuario la escribió; si no, el contenido es literal.
        formula: c?.userEnteredValue?.formulaValue ?? null,
        valor: c?.formattedValue ?? null,
        numero: c?.effectiveValue?.numberValue ?? null,
        formato: c?.userEnteredFormat?.numberFormat?.type ?? null,
        // DERRAMADA: tiene valor calculado pero NADIE escribió nada en ella — es el resultado de una
        // fórmula matricial vecina (IMPORTRANGE, ARRAYFORMULA, QUERY, IMPORTHTML). Sin esta marca,
        // auditar contaba cada celda derramada como "número escrito a mano": una IMPORTRANGE de 990
        // filas aparecía como 5.593 números tipeados. Es exactamente lo contrario de lo que es.
        derivada: !c?.userEnteredValue && !!c?.effectiveValue,
      })))
      return {
        titulo: s.properties?.title ?? null,
        filas,
        merges: (s.merges || []).map((m) => ({
          fila: m.startRowIndex, filaFin: m.endRowIndex, col: m.startColumnIndex, colFin: m.endColumnIndex,
        })),
        offset: { fila: d.startRow || 0, col: d.startColumn || 0 },
      }
    },
    /**
     * El FORMATO VISUAL de un rango: fondo, tipografía, alineación, bordes, más los anchos de
     * columna, las filas congeladas y los grupos.
     *
     * POR QUÉ EXISTE (21/07). El dueño: "revisar el formato de todas las pestañas y hacerlas
     * coincidir". No se podía: `readSheetGrid` trae el formato de NÚMERO y nada más, así que el OS
     * escribía formatos pero era ciego a lo que había escrito. Comparar catorce pestañas entre sí
     * era imposible, y por eso cada una terminó con su propia paleta y su propio tamaño de letra.
     *
     * Lee `effectiveFormat` —lo que se VE— y no `userEnteredFormat`, que puede estar vacío cuando el
     * formato viene heredado de la fila o la columna.
     */
    async readSheetFormats(fileId, range) {
      const campos = 'sheets(properties(title,sheetId,gridProperties(frozenRowCount,frozenColumnCount,columnCount)),'
        + 'data(startRow,startColumn,columnMetadata(pixelSize),rowMetadata(pixelSize),'
        + 'rowData(values(formattedValue,effectiveFormat(backgroundColor,horizontalAlignment,wrapStrategy,numberFormat,textFormat(fontFamily,fontSize,bold,italic,foregroundColor))))))'
      const j = await apiGet(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}?ranges=${encodeURIComponent(range)}&fields=${encodeURIComponent(campos)}`)
      const s = (j.sheets || [])[0]
      if (!s) return null
      const d = (s.data || [])[0] || {}
      return {
        titulo: s.properties?.title ?? null,
        sheetId: s.properties?.sheetId,
        congeladas: {
          filas: s.properties?.gridProperties?.frozenRowCount ?? 0,
          columnas: s.properties?.gridProperties?.frozenColumnCount ?? 0,
        },
        anchos: (d.columnMetadata || []).map((c) => c?.pixelSize ?? null),
        altos: (d.rowMetadata || []).map((r) => r?.pixelSize ?? null),
        filas: (d.rowData || []).map((r) => (r.values || []).map((c) => ({
          valor: c?.formattedValue ?? null,
          formato: c?.effectiveFormat ?? null,
        }))),
        offset: { fila: d.startRow || 0, col: d.startColumn || 0 },
      }
    },
    /** Lee las reglas de VALIDACIÓN DE DATOS (desplegables) de un rango. Devuelve la data
     *  cruda de la Sheets API (sheets[].data[].rowData[].values[].dataValidation) para que el
     *  llamador extraiga, por celda, las opciones permitidas. Sirve para NO pisar un desplegable
     *  al cargar un dato: primero se leen las opciones válidas y se elige la que corresponde. */
    async readSheetValidations(fileId, ranges) {
      const rs = (Array.isArray(ranges) ? ranges : [ranges]).map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
      const j = await apiGet(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}?${rs}&fields=${encodeURIComponent('sheets.properties.title,sheets.data(startRow,startColumn,rowData.values.dataValidation)')}`,
      )
      return j.sheets || []
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

    /** Sube un archivo BINARIO (imagen, PDF, cualquier formato) a Drive vía multipart.
     *  data = base64. Devuelve {id, link}. Requiere actuar como usuario (OAuth) o Shared Drive. */
    async uploadFile(name, base64Data, mimeType, { parentId } = {}) {
      const token = await accessToken()
      const meta = { name, mimeType }
      if (parentId) meta.parents = [parentId]
      const boundary = 'echeg' + Math.random().toString(36).slice(2)
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Data}\r\n--${boundary}--`
      const res = await doFetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink',
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
      if (!res.ok) { const b = String(await res.text()).slice(0, 200); const e = new Error(`google upload ${res.status}: ${b}`); e.status = res.status; throw e }
      const j = await res.json()
      return { id: j.id, link: j.webViewLink || `https://drive.google.com/file/d/${j.id}/view` }
    },
    /** EXPORTA un archivo nativo de Google (Sheet/Doc/Slides) a PDF y lo GUARDA en Drive.
     *  Devuelve {id, link, nombre}. Si se pasa `parentId`, queda en esa carpeta (ej. la del cliente
     *  en el data room). Es lo que permite mandar un presupuesto o un informe como PDF. */
    async exportarComoPdf(fileId, { nombre, parentId } = {}) {
      const token = await accessToken()
      const res = await withRetry(() => doFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }))
      if (!res.ok) {
        const t = String(await res.text()).slice(0, 200)
        const e = new Error(`google export pdf ${res.status}: ${t}`); e.status = res.status; throw e
      }
      const b64 = Buffer.from(await res.arrayBuffer()).toString('base64')
      let base = nombre
      if (!base) {
        const meta = await apiGet(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name&supportsAllDrives=true`).catch(() => null)
        base = meta?.name || 'documento'
      }
      const final = /\.pdf$/i.test(base) ? base : `${base}.pdf`
      const up = await this.uploadFile(final, b64, 'application/pdf', { parentId })
      return { ...up, nombre: final }
    },

    /** Crea una PRESENTACIÓN de Google Slides. `slides` = [{titulo, cuerpo}]. La primera queda como
     *  portada. Devuelve {id, link}. Requiere actuar como usuario (OAuth). */
    async createSlides(name, slides = [], { parentId } = {}) {
      const pres = await apiSend('https://slides.googleapis.com/v1/presentations', 'POST', { title: name })
      const id = pres.presentationId
      if (parentId) {
        await apiSend(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?addParents=${encodeURIComponent(parentId)}&supportsAllDrives=true`, 'PATCH', {}).catch(() => {})
      }
      // La presentación nace con 1 slide en blanco: se usa para la portada.
      const primera = pres.slides?.[0]?.objectId
      const requests = []
      const conTexto = (slideId, titulo, cuerpo, i) => {
        // Cada slide creada con layout TITLE_AND_BODY trae placeholders; se rellenan por índice.
        if (titulo) requests.push({ insertText: { objectId: `titulo_${i}`, text: String(titulo) } })
        if (cuerpo) requests.push({ insertText: { objectId: `cuerpo_${i}`, text: String(cuerpo) } })
      }
      slides.forEach((s, i) => {
        if (i === 0 && primera) {
          // portada: se reemplaza la slide inicial por una con layout de título
          requests.push({ deleteObject: { objectId: primera } })
        }
        requests.push({
          createSlide: {
            objectId: `slide_${i}`,
            slideLayoutReference: { predefinedLayout: i === 0 ? 'TITLE' : 'TITLE_AND_BODY' },
            placeholderIdMappings: [
              { layoutPlaceholder: { type: i === 0 ? 'CENTERED_TITLE' : 'TITLE', index: 0 }, objectId: `titulo_${i}` },
              ...(i === 0 ? [] : [{ layoutPlaceholder: { type: 'BODY', index: 0 }, objectId: `cuerpo_${i}` }]),
            ],
          },
        })
        conTexto(`slide_${i}`, s?.titulo, i === 0 ? null : s?.cuerpo, i)
      })
      if (requests.length) {
        await apiSend(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(id)}:batchUpdate`, 'POST', { requests })
      }
      return { id, link: `https://docs.google.com/presentation/d/${id}/edit` }
    },

    /** Inserta una imagen (por URL pública accesible por Google) en un Google Doc. */
    async insertImageInDoc(fileId, imageUrl, { index = 1 } = {}) {
      return apiSend(
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}:batchUpdate`,
        'POST',
        { requests: [{ insertInlineImage: { location: { index }, uri: imageUrl } }] })
    },
    /** Documento Docs COMPLETO (estructura con índices) — para ubicar texto, tablas, fin. */
    async getDoc(fileId) {
      return apiGet(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}`)
    },
    /** batchUpdate genérico de la Docs API: `requests` = array de requests de Docs. Un solo
     *  lugar para formato, tablas, imágenes, reemplazos — igual que spreadsheetBatchUpdate. */
    async docsBatchUpdate(fileId, requests) {
      return apiSend(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}:batchUpdate`, 'POST', { requests })
    },
    /** Lee un GOOGLE DOC nativo exportándolo a texto plano (Drive export). Cubre contratos,
     *  notas, informes en Docs. Acotado a maxChars. */
    async readDocText(fileId, { maxChars = 20000 } = {}) {
      const token = await accessToken()
      const res = await doFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
        { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { const b = String(await res.text()).slice(0, 200); const e = new Error(`google export ${res.status}: ${b}`); e.status = res.status; throw e }
      const text = await res.text()
      return { chars: text.length, text: text.slice(0, maxChars), truncated: text.length > maxChars }
    },
    /** Crea un GOOGLE DOC con título y contenido de texto. Devuelve {id, link}. Requiere
     *  poder crear en Drive (OAuth por usuario o Unidad Compartida). */
    async createDoc(name, text, { parentId } = {}) {
      const meta = { name, mimeType: 'application/vnd.google-apps.document' }
      if (parentId) meta.parents = [parentId]
      const created = await apiSend(`https://www.googleapis.com/drive/v3/files?supportsAllDrives=true`, 'POST', meta)
      if (text) {
        await apiSend(
          `https://docs.googleapis.com/v1/documents/${encodeURIComponent(created.id)}:batchUpdate`,
          'POST',
          { requests: [{ insertText: { location: { index: 1 }, text: String(text) } }] })
      }
      return { id: created.id, link: `https://docs.google.com/document/d/${created.id}/edit` }
    },
    /** Inserta texto en un Google Doc existente (al inicio por defecto). */
    async appendToDoc(fileId, text, { index = 1 } = {}) {
      return apiSend(
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}:batchUpdate`,
        'POST',
        { requests: [{ insertText: { location: { index }, text: String(text) } }] })
    },
    /** Escribe en un Google Doc con modo: 'insertar' (inicio), 'agregar' (final) o
     *  'reemplazar' (borra todo y escribe). Los Docs SÍ se escriben vía la Docs API. */
    async writeDoc(fileId, text, { modo = 'insertar' } = {}) {
      const doc = await apiGet(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}`)
      const content = doc.body?.content || []
      const endIndex = content.length ? (content[content.length - 1].endIndex || 1) : 1
      const requests = []
      if (modo === 'reemplazar' && endIndex > 2) requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } })
      const at = modo === 'agregar' ? Math.max(1, endIndex - 1) : 1
      requests.push({ insertText: { location: { index: at }, text: String(text) } })
      await apiSend(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}:batchUpdate`, 'POST', { requests })
      return { escrito: text.length }
    },

    // ---- ESCRITURA (requiere scopes de WRITE_SCOPES; cada efecto pasó por aprobación) ----

    /** Sobrescribe un rango A1 de un Sheet con `values` (matriz de filas).
     *  USER_ENTERED: respeta fórmulas y formatos de número como si lo tipearas. */
    async updateSheetValues(fileId, range, values) {
      values = await localizeValues(fileId, values)
      return apiSend(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
        'PUT',
        { range, majorDimension: 'ROWS', values },
      )
    },
    /** Agrega filas al final de la tabla que arranca en `range` (INSERT_ROWS: no pisa
     *  lo que haya debajo). Devuelve el rango efectivamente escrito. */
    async appendSheetValues(fileId, range, values) {
      values = await localizeValues(fileId, values)
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
      const f = await apiSend(
        'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink&supportsAllDrives=true',
        'POST',
        { name, mimeType, ...(parents ? { parents } : {}) },
      )
      // Un Sheet creado por API nace en_US (formato inglés: coma decimal, fechas MM/DD, fórmulas
      // con coma). Todo el Drive de la empresa es es_AR → lo fijamos para que nazca en el
      // formato correcto (fechas DD/MM/YYYY, decimales con coma, fórmulas con ';').
      if (mimeType.includes('spreadsheet') && f?.id) {
        const locale = process.env.ORQ_SHEET_LOCALE || 'es_AR'
        const timeZone = process.env.ORQ_SHEET_TZ || 'America/Argentina/San_Juan'
        try {
          await apiSend(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(f.id)}:batchUpdate`, 'POST',
            { requests: [{ updateSpreadsheetProperties: { properties: { locale, timeZone }, fields: 'locale,timeZone' } }] })
          _sepCache.set(f.id, /^en[_-]/i.test(locale) ? ',' : ';')
        } catch { /* si falla, la localización al escribir igual detecta el locale */ }
      }
      return f
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
      const loc = []
      for (const d of data) loc.push({ ...d, values: await localizeValues(fileId, d.values) })
      return apiSend(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}/values:batchUpdate`,
        'POST',
        { valueInputOption: 'USER_ENTERED', data: loc },
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
      return (j.sheets || []).map((s) => ({ sheetId: s.properties?.sheetId, title: s.properties?.title, rows: s.properties?.gridProperties?.rowCount, cols: s.properties?.gridProperties?.columnCount }))
    },
    /**
     * Los grupos de filas (+/-) que ya tiene cada pestaña: [{ title, grupos:[{startIndex, endIndex, depth}] }].
     *
     * Hace falta para poder BORRARLOS antes de crear los nuevos. La API no reemplaza un grupo: lo
     * apila. Un script que agrega grupos sin limpiar los anteriores deja el margen izquierdo con una
     * escalera de +/- que crece en cada corrida — y este cuadro lo rehace un agente cada 2 horas.
     */
    async getRowGroups(fileId) {
      const j = await apiGet(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}?fields=sheets(properties(sheetId,title),rowGroups)`)
      return (j.sheets || []).map((s) => ({
        sheetId: s.properties?.sheetId,
        title: s.properties?.title,
        grupos: (s.rowGroups || []).map((g) => ({
          startIndex: g.range?.startIndex ?? 0,
          endIndex: g.range?.endIndex ?? 0,
          depth: g.depth ?? 1,
        })),
      }))
    },
    /**
     * El ancho en píxeles de cada columna de una pestaña. Sirve para VERIFICAR el formato en vez de
     * suponerlo: una columna descolocada no se ve en los valores, sólo en el ancho, y sin poder
     * leerlo el diagnóstico de "quedó descuadrado" es adivinanza.
     */
    async getColumnWidths(fileId, titulo) {
      const j = await apiGet(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}?ranges=${encodeURIComponent(`${titulo}!A1:BZ1`)}&fields=${encodeURIComponent('sheets(properties.title,data(columnMetadata(pixelSize)))')}`)
      const s = (j.sheets || [])[0]
      return ((s?.data || [])[0]?.columnMetadata || []).map((c) => c.pixelSize)
    },
    /**
     * Los rangos con NOMBRE del archivo: [{ namedRangeId, name, range }].
     *
     * Hacen falta para que un concepto que se define en una pestaña y se usa en otra no dependa del
     * número de fila. Las pestañas de este archivo las reescribe un agente cada 2 horas: una fórmula
     * que apunta a 'CAJA'!$C$8 queda apuntando a otra cosa el día que el cuadro crece una fila, y no
     * avisa. Un nombre sobrevive a la reescritura.
     */
    /**
     * Las TABLAS DINÁMICAS nativas que ya tiene una pestaña, con su definición completa.
     *
     * POR QUÉ HACE FALTA (21/07). El dueño: "en pestaña resumen esta mejor esto al ser tablas
     * dinámicas". RESUMEN usa pivots nativos —agrupan, colapsan y subtotalan solos, y el usuario
     * puede reordenarlos sin tocar una fórmula— mientras que las pestañas que yo armé son listas
     * planas generadas con QUERY. Para copiar bien esa forma hay que poder LEER la definición
     * existente, no adivinarla.
     *
     * @returns {Array<{fila:number, col:number, pivot:object}>} en coordenadas absolutas del rango.
     */
    async getPivotTables(fileId, range) {
      const j = await apiGet(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}`
        + `?includeGridData=true&ranges=${encodeURIComponent(range)}`
        + '&fields=sheets(data(startRow,startColumn,rowData(values(pivotTable))))')
      const out = []
      for (const sh of j.sheets || []) {
        for (const d of sh.data || []) {
          const r0 = d.startRow ?? 0, c0 = d.startColumn ?? 0
          ;(d.rowData || []).forEach((row, i) => (row.values || []).forEach((cel, k) => {
            if (cel?.pivotTable) out.push({ fila: r0 + i + 1, col: c0 + k, pivot: cel.pivotTable })
          }))
        }
      }
      return out
    },
    async getNamedRanges(fileId) {
      const j = await apiGet(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}?fields=namedRanges`)
      return j.namedRanges || []
    },
    /** Cuántas reglas de formato condicional tiene cada pestaña: [{sheetId, title, reglas}].
     *  Hace falta para reemplazarlas de forma idempotente (borrar las que hay antes de re-agregar),
     *  porque addConditionalFormatRule apila y en cada corrida del agente se duplicarían. */
    async getConditionalFormats(fileId) {
      const j = await apiGet(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}?fields=sheets(properties(sheetId,title),conditionalFormats)`)
      return (j.sheets || []).map((s) => ({
        sheetId: s.properties?.sheetId,
        title: s.properties?.title,
        reglas: (s.conditionalFormats || []).length,
      }))
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
    /** Comparte un archivo con un email (rol reader por defecto), para que el destinatario de
     *  un mail pueda abrir el link al Doc real. sendNotificationEmail=false: no manda el mail
     *  automático de Drive (el aviso va en NUESTRO mail). Silencioso si ya estaba compartido. */
    async shareFile(fileId, email, role = 'reader') {
      if (!email) return { shared: false }
      return apiSend(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
        'POST',
        { type: 'user', role, emailAddress: String(email) },
      )
    },
    /** Prepara los adjuntos de un mail RESPETANDO el formato: un archivo NATIVO de Google
     *  (Doc/Sheet/Slides) NO se puede adjuntar como binario → va como LINK al documento real
     *  (y se comparte con el destinatario). Un binario (docx/xlsx/pdf subido) se adjunta tal
     *  cual. formato 'pdf'|'word' fuerza una copia exportada. Devuelve {attachments, links}. */
    async prepareAttachments(fileIds = [], { formato = 'documento', shareWith } = {}) {
      const attachments = []
      const links = []
      for (const id of fileIds || []) {
        if (!id) continue
        const meta = await this.fileMeta(String(id))
        const nativo = /application\/vnd\.google-apps\./.test(meta.mimeType || '')
        if (nativo && formato !== 'pdf' && formato !== 'word') {
          if (shareWith) { try { await this.shareFile(String(id), String(shareWith), 'reader') } catch { /* ya compartido o sin permiso: igual mandamos el link */ } }
          links.push({ name: meta.name, url: `https://drive.google.com/open?id=${id}` })
        } else {
          attachments.push(await fetchAttachment(String(id), { formato: formato === 'word' ? 'documento' : formato }))
        }
      }
      return { attachments, links }
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
