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
import { makeToolExecutor } from './lib/tool-executor.mjs'

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

/** Registro de tools de lectura de Drive + búsqueda por índice (idéntico al especialista). */
function driveRegistry() {
  const google = makeGoogleClient({ config: cfg })
  const registry = driveReadTools(google)
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

async function ask({ directive, fileId, fast }) {
  const model = fast === false ? 'sonnet' : 'haiku' // rápido por defecto
  const engine = resolveEngine('anthropic-api')
  const { system } = await assembleReasoningSystem({
    rootPath: CTX.context.repository.rootPath, config: cfg,
    roleFraming: 'Sos el asistente operativo del Business OS de Echegaray Construcciones: respondés directivas del dueño sobre sus archivos y su operación, con criterio y datos reales.',
    logger: log,
  })
  const registry = driveRegistry()
  const toolExecutor = makeToolExecutor({
    decide, tools: registry, principalId: DIRECTOR_PRINCIPAL, logger: log,
    enqueue: async () => 'pendiente-de-aprobacion', // Nivel E no se ejecuta acá
  })
  const memoria = await memoriaBrief()
  const prompt =
    `DIRECTIVA DEL DUEÑO:\n${directive}\n` +
    (fileId ? `\nEstá mirando el archivo de Drive con file_id=${fileId}. Leélo con drive_read si la directiva lo requiere.\n` : '') +
    memoria +
    `\n\nRespondé en español, claro y directo, como un buen administrativo. Si necesitás un dato de un archivo, LEELO con las tools antes de responder (no inventes). ` +
    `Distinguí hecho/estimación; si falta algo decilo. Lo que tenga efecto económico/fiscal/legal real o escritura de un archivo NO lo ejecutes: proponelo y aclaralo como "requiere tu aprobación". Sé breve.`

  const eng = await engine.run(
    { system, prompt, worktreePath: CTX.context.repository.rootPath, model, maxCostUsd: 0.5,
      maxToolIterations: fast === false ? 10 : 6, allowedTools: 'Read',
      task: { id: 'interactive', capability_slug: 'advise.admin' },
      tools: Object.values(registry).map((t) => t.schema), toolExecutor, agentSlug: 'interactive' },
    CTX)
  return { answer: eng.result, model, cost: eng.cost?.usd ?? 0 }
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
  if (req.method !== 'POST' || req.url !== '/ask') return send(res, 404, { error: 'no encontrado' })
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: 'no autorizado' })

  let body = ''
  req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy() })
  req.on('end', async () => {
    try {
      const { directive, fileId, fast } = JSON.parse(body || '{}')
      if (!directive || typeof directive !== 'string') return send(res, 400, { error: 'falta "directive"' })
      const t0 = Date.now()
      const out = await ask({ directive: directive.slice(0, 4000), fileId, fast })
      log.info('directiva respondida', { ms: Date.now() - t0, model: out.model, cost: out.cost })
      send(res, 200, { ...out, ms: Date.now() - t0 })
    } catch (e) {
      log.error('directiva falló', { error: e.message })
      send(res, 500, { error: e.message })
    }
  })
})

boot().then(() => server.listen(PORT, '0.0.0.0', () => log.info('escuchando (público)', { port: PORT, url: PUBLIC_URL })))
  .catch((e) => { log.error('boot falló', { error: e.message }); process.exit(1) })
