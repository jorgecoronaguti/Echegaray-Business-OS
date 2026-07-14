#!/usr/bin/env node
// MOTOR INTERACTIVO del OS. A diferencia del worker (razonamiento profundo 24×7 con
// toda la organización), esto responde una DIRECTIVA en SEGUNDOS: un solo agente,
// modelo rápido (haiku por defecto), con manos de lectura sobre Drive y la memoria
// acumulada del cerebro. Es la base que consume la extensión de Chrome (y mañana
// WhatsApp / el cockpit). No ejecuta Nivel E: lo prepara y lo deja para aprobación.
//
//   POST /ask  { directive, fileId?, fast? }  ->  { answer, model, cost }
//   GET  /health
//
// Auth: header 'authorization: Bearer <INTERACTIVE_TOKEN>' (env). CORS abierto para
// que la extensión pueda llamarlo. Corre como servicio systemd aparte del worker.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from './lib/config.mjs'
import { createLogger } from './lib/logger.mjs'
import { query } from './lib/db.mjs'
import { resolveContext } from './lib/identity.mjs'
import { resolveEngine } from './engines/index.mjs'
import { assembleReasoningSystem, ROLE_FRAMING } from './lib/context-assembler.mjs'
import { decide } from './lib/policy.mjs'
import { makeGoogleClient } from './lib/google.mjs'
import { driveReadTools } from './lib/tools/drive.mjs'
import { driveWriteTools } from './lib/tools/drive-write.mjs'
import { makeToolExecutor } from './lib/tool-executor.mjs'
import { enqueuePendingOperation, listPendingOperations, decidePendingOperation } from './lib/pending-ops.mjs'
import { classifyDirective } from './lib/classify-directive.mjs'
import { skillsForCapability } from './lib/skill-map.mjs'

const cfg = loadConfig()
const log = createLogger({ component: 'interactive' })
const PORT = Number(process.env.ORQ_INTERACTIVE_PORT ?? 8790)
const TOKEN = process.env.ORQ_INTERACTIVE_TOKEN ?? ''
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ZIP_PATH = path.join(REPO, 'extension.zip')
const PUBLIC_URL = process.env.ORQ_PUBLIC_URL || `http://64.176.22.159:${PORT}`

// Página simple de descarga de la extensión (servida desde la propia VM).
const DOWNLOAD_PAGE = () => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Echegaray OS — Extensión</title>
<style>body{font-family:system-ui,sans-serif;background:#0e1118;color:#e6eaf2;max-width:640px;margin:0 auto;padding:40px 24px;line-height:1.6}
h1{letter-spacing:-.02em}a.btn{display:inline-block;background:#6f9dea;color:#0b1220;font-weight:700;padding:12px 20px;border-radius:10px;text-decoration:none;margin:12px 0}
ol{padding-left:20px}code{background:#161b25;padding:2px 6px;border-radius:5px;border:1px solid #2a323f}li{margin:8px 0}.soft{color:#aab3c5}</style></head>
<body><h1>Echegaray OS — Extensión de Chrome</h1>
<p class="soft">Un panel para darle directivas al OS sobre tus archivos de Drive, desde el navegador.</p>
<a class="btn" href="/extension.zip">⬇ Descargar la extensión</a>
<h3>Cómo instalarla</h3>
<ol>
<li>Descargá el .zip y <b>descomprimilo</b> en una carpeta.</li>
<li>Abrí Chrome en <code>chrome://extensions</code>.</li>
<li>Activá <b>“Modo de desarrollador”</b> (arriba a la derecha).</li>
<li>Clic en <b>“Cargar descomprimida”</b> y elegí la carpeta.</li>
<li>Clic en el ícono de la extensión → se abre el panel. En ⚙ pegá tu <b>llave de acceso</b>.</li>
</ol>
<p class="soft">La extensión le habla a este mismo servidor (<code>${PUBLIC_URL}</code>). Todo corre acá, en tu VM.</p>
</body></html>`

let CTX = null
let DIRECTOR_PRINCIPAL = null

async function boot() {
  CTX = { logger: log, config: cfg, context: await resolveContext() }
  const { rows } = await query("select id from orq.principals where slug = 'agent:director-general' limit 1")
  DIRECTOR_PRINCIPAL = rows[0]?.id ?? CTX.context.systemPrincipalId
  log.info('motor interactivo listo', { port: PORT, tenant: CTX.context.tenantId })
}

/** Resumen corto de lo que el OS ya sabe (memoria acumulada), para dar contexto. */
async function memoriaBrief() {
  const { rows } = await query(
    `select afirmacion from public.conocimiento_empresa where vigente
      order by veces_confirmado desc, updated_at desc limit 10`).catch(() => ({ rows: [] }))
  return rows.length ? '\n\nLO QUE EL OS YA SABE DE LA EMPRESA:\n' + rows.map((r) => `- ${r.afirmacion}`).join('\n') : ''
}

/** Registro de tools de Drive: lectura (auto) + escritura (requieren aprobación) +
 *  búsqueda por índice. Las de escritura no se ejecutan acá: el tool-executor las
 *  encola como operaciones pendientes (Nivel E). */
function driveRegistry() {
  const google = makeGoogleClient({ config: cfg })
  const registry = { ...driveReadTools(google), ...driveWriteTools(google) }
  registry['drive.find'] = {
    capability: 'drive.read', account: 'ecsas',
    schema: {
      name: 'drive_find',
      description: 'Busca archivos por nombre en el índice completo de la carpeta administración (~1.658 archivos). Devuelve nombre, ruta y file_id.',
      input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
    async run(input) {
      const term = String(input?.query ?? '').trim()
      if (!term) return { error: 'falta query' }
      const { rows } = await query(
        `select name, path, tipo, drive_file_id from public.drive_index where name ilike $1 order by is_folder desc, name limit 30`,
        [`%${term}%`])
      return { count: rows.length, items: rows.map((r) => ({ name: r.name, ruta: r.path, tipo: r.tipo, file_id: r.drive_file_id })) }
    },
  }
  return registry
}

/** Construye el bloque de contenido de visión/documento para un adjunto (foto/PDF).
 *  Imágenes → type 'image'; PDF → type 'document'. Otros formatos no se interpretan
 *  por visión (se avisa honestamente en el prompt). */
function attachmentBlock(att) {
  if (!att?.data || !att?.media_type) return null
  if (att.media_type === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.data } }
  }
  if (/^image\/(jpeg|png|webp|gif)$/.test(att.media_type)) {
    return { type: 'image', source: { type: 'base64', media_type: att.media_type, data: att.data } }
  }
  return null
}

async function ask({ directive, fileId, fast, attachment }) {
  const att = attachmentBlock(attachment)
  // Con adjunto conviene más precisión (OCR de factura/remito): sonnet.
  const model = att ? 'sonnet' : fast === false ? 'sonnet' : 'haiku'
  const engine = resolveEngine('anthropic-api')

  // Fase 3: rutear al especialista correcto. Clasificamos la directiva a un dominio
  // e inyectamos SUS skills (mismo skill-map que el worker). Si es general, el
  // asistente administrativo de siempre. Si falla la clasificación, degrada a general.
  const capability = await classifyDirective(directive, CTX)
  const skillNames = capability === 'general' ? [] : skillsForCapability(capability)
  const roleFraming = skillNames.length
    ? ROLE_FRAMING.specialist
    : 'Sos el asistente operativo del Business OS de Echegaray Construcciones: respondés directivas del dueño sobre sus archivos y su operación, con criterio y datos reales.'
  const { system, skillsLoaded } = await assembleReasoningSystem({
    rootPath: CTX.context.repository.rootPath, config: cfg,
    roleFraming,
    skillNames: skillNames.length ? skillNames : undefined,
    logger: log,
  })
  log.info('directiva ruteada', { capability, skills: skillsLoaded || [] })
  const registry = driveRegistry()
  const toolExecutor = makeToolExecutor({
    decide, tools: registry, principalId: DIRECTOR_PRINCIPAL, logger: log,
    // Enqueue REAL: una escritura propuesta (drive.write) se registra en
    // orq.pending_operations con su cambio concreto y queda esperando aprobación.
    enqueue: (op) => enqueuePendingOperation({ ...op, tenantId: CTX.context.tenantId, agentSlug: 'interactive' }),
  })
  const memoria = await memoriaBrief()
  const prompt =
    `DIRECTIVA DEL DUEÑO:\n${directive}\n` +
    (fileId ? `\nEstá mirando el archivo de Drive con file_id=${fileId}. Leélo con drive_read si la directiva lo requiere.\n` : '') +
    memoria +
    `\n\nRespondé en español, claro y directo, como un buen administrativo. Si necesitás un dato de un archivo, LEELO con las tools antes de responder (no inventes). ` +
    `Distinguí hecho/estimación; si falta algo decilo. ` +
    `Si la directiva pide ESCRIBIR/ordenar/completar/corregir/registrar en un archivo, usá drive_update / drive_append / drive_create con el cambio CONCRETO (leé antes el archivo para no pisar datos): la operación queda PENDIENTE de tu aprobación, no se ejecuta sola. Avisá qué dejaste pendiente. ` +
    (att
      ? `\n\nTE ADJUNTARON UN ARCHIVO (foto/PDF): interpretalo. Si es una factura/remito/comprobante, extraé proveedor, fecha, importe total, número y concepto. Si la directiva pide registrarlo, encontrá el Sheet correcto (ej. "Flujo de Caja - Cash Flow", pestaña de compras/gastos), LEÉ su estructura con drive_read y proponé la fila con drive_append. No inventes lo que no ves; si un dato no está en la imagen, decilo.\n`
      : '') +
    `Lo demás con efecto económico/fiscal/legal externo (Nivel E) tampoco lo ejecutes: proponelo. Sé breve.`

  // Con adjunto, el prompt es un array de bloques (visión/documento + texto). El
  // engine acepta content como array sin cambios.
  const promptContent = att ? [att, { type: 'text', text: prompt }] : prompt

  const eng = await engine.run(
    { system, prompt: promptContent, worktreePath: CTX.context.repository.rootPath, model, maxCostUsd: 0.6,
      maxToolIterations: att ? 8 : fast === false ? 10 : 6, allowedTools: 'Read',
      task: { id: 'interactive', capability_slug: 'advise.admin' },
      tools: Object.values(registry).map((t) => t.schema), toolExecutor, agentSlug: 'interactive' },
    CTX)
  return { answer: eng.result, model, cost: eng.cost?.usd ?? 0, capability, skills: skillsLoaded || [] }
}

function send(res, code, obj) {
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
  })
  res.end(JSON.stringify(obj))
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, ready: !!CTX })
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return res.end(DOWNLOAD_PAGE())
  }
  if (req.method === 'GET' && req.url === '/extension.zip') {
    try {
      const zip = await readFile(ZIP_PATH)
      res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="echegaray-os-extension.zip"' })
      return res.end(zip)
    } catch { return send(res, 404, { error: 'extensión no empaquetada todavía' }) }
  }
  // A partir de acá, rutas protegidas por el token de la extensión.
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: 'no autorizado' })

  // Operaciones pendientes de aprobación (la extensión las lista y las decide).
  if (req.method === 'GET' && req.url === '/pending') {
    try {
      const items = await listPendingOperations({ status: 'awaiting_approval' })
      return send(res, 200, { items })
    } catch (e) { return send(res, 500, { error: e.message }) }
  }

  if (req.method !== 'POST' || (req.url !== '/ask' && req.url !== '/operation')) {
    return send(res, 404, { error: 'no encontrado' })
  }

  let body = ''
  // Techo de 12MB: alcanza para una foto reducida o un PDF chico en base64. (El
  // proxy de Vercel corta antes, ~4.5MB, por eso la extensión reduce las imágenes.)
  req.on('data', (c) => { body += c; if (body.length > 12e6) req.destroy() })
  req.on('end', async () => {
    try {
      const data = JSON.parse(body || '{}')

      // Aprobar/Rechazar una operación pendiente. La extensión usa Bearer token (no
      // tiene auth.uid()), por eso va por el motor y no por el RPC orq_operation_action.
      if (req.url === '/operation') {
        const { id, action, note } = data
        if (!id || !['approve', 'reject'].includes(action)) return send(res, 400, { error: 'faltan id / action (approve|reject)' })
        const out = await decidePendingOperation({ id, action, note, decidedBy: DIRECTOR_PRINCIPAL })
        log.info('operación decidida', { id, action })
        return send(res, 200, { ok: true, ...out })
      }

      // Directiva normal (opcionalmente con un archivo adjunto: {media_type, data(base64), name}).
      const { directive, fileId, fast, attachment } = data
      if (!directive || typeof directive !== 'string') return send(res, 400, { error: 'falta "directive"' })
      const t0 = Date.now()
      const out = await ask({ directive: directive.slice(0, 4000), fileId, fast, attachment })
      log.info('directiva respondida', { ms: Date.now() - t0, model: out.model, cost: out.cost })
      send(res, 200, { ...out, ms: Date.now() - t0 })
    } catch (e) {
      log.error('request falló', { url: req.url, error: e.message })
      send(res, 500, { error: e.message })
    }
  })
})

boot().then(() => server.listen(PORT, '0.0.0.0', () => log.info('escuchando (público)', { port: PORT, url: PUBLIC_URL })))
  .catch((e) => { log.error('boot falló', { error: e.message }); process.exit(1) })
