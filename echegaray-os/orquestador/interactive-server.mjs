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
import { assembleReasoningSystem } from './lib/context-assembler.mjs'
import { decide } from './lib/policy.mjs'
import { makeGoogleClient } from './lib/google.mjs'
import { driveReadTools } from './lib/tools/drive.mjs'
import { driveWriteTools } from './lib/tools/drive-write.mjs'
import { makeToolExecutor } from './lib/tool-executor.mjs'
import { enqueuePendingOperation, listPendingOperations, decidePendingOperation, getPendingOperationById } from './lib/pending-ops.mjs'
import { classifyDirective } from './lib/classify-directive.mjs'
import { skillsForCapability } from './lib/skill-map.mjs'
import { createSchedule, listSchedules, toggleSchedule } from './lib/schedules.mjs'

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

// Progreso en vivo. Mientras el motor razona y usa tools, guardamos pasos legibles
// indexados por runId (que genera la extensión). La extensión hace polling a
// /progress?id= y muestra "trabajando: Leyendo Compras…". Se limpia solo al terminar.
const PROGRESS = new Map()
// Resultados de directivas largas que se resolvieron en segundo plano (tras superar el
// techo de 45s inline). La extensión los recoge por /result?id=. Se limpian solos.
const RESULTS = new Map()
function progressInit(runId) { if (runId) PROGRESS.set(runId, { steps: ['Pensando…'], done: false, updated: Date.now() }) }
function progressPush(runId, step) { const p = runId && PROGRESS.get(runId); if (p) { p.steps.push(step); p.updated = Date.now() } }
function progressDone(runId) { const p = runId && PROGRESS.get(runId); if (p) { p.done = true; p.updated = Date.now() } if (runId) setTimeout(() => PROGRESS.delete(runId), 30000) }
function friendlyStep(name, input) {
  const i = input || {}
  switch (name) {
    case 'drive_read': return `Leyendo ${i.range || 'el archivo'}`
    case 'drive_tabs': return 'Viendo las pestañas del archivo'
    case 'drive_find': case 'drive_list': case 'drive_search': return `Buscando en Drive${i.name ? ` "${i.name}"` : ''}`
    case 'drive_last_row': return 'Ubicando la última fila con datos'
    case 'drive_excel': return 'Leyendo el Excel'
    case 'drive_update': return `Preparando el cambio en ${i.range || 'el archivo'}`
    case 'drive_append': return 'Preparando el registro nuevo'
    case 'drive_create': return `Preparando crear ${i.tipo || 'el archivo'}${i.name ? ` "${i.name}"` : ''}`
    case 'drive_rename': return `Preparando renombrar${i.new_name ? ` a "${i.new_name}"` : ''}`
    case 'drive_move': return 'Preparando mover el archivo'
    case 'drive_batch_update': return `Preparando ${Array.isArray(i.updates) ? i.updates.length : 'varios'} bloques de cambios`
    case 'drive_insert_rows': return `Preparando insertar ${i.count || ''} filas en ${i.tab || ''}`
    case 'drive_delete_rows': return `Preparando borrar ${i.count || ''} filas de ${i.tab || ''}`
    case 'drive_clear': return `Preparando vaciar ${i.range || 'un rango'}`
    case 'drive_copy': return `Preparando duplicar${i.name ? ` como "${i.name}"` : ''}`
    case 'drive_trash': return 'Preparando dar de baja (papelera)'
    case 'navigate_to': return `Buscando dónde está${i.query ? ` "${i.query}"` : ''} en Drive`
    default: return `Trabajando (${name})`
  }
}

async function ask({ directive, fileId, fast, attachment, history, runId }) {
  progressInit(runId)
  const att = attachmentBlock(attachment)
  // Intención de escritura SIGUIENDO EL HILO: cuando el dueño responde "a"/"dale"/
  // "la 2"/"hacelo", la intención de escribir vive en el turno ANTERIOR, no en el
  // literal. Antes se miraba solo la directiva actual → un "a" caía como charla
  // trivial (modelo tímido, pocas iteraciones) y el OS reseteaba en vez de ejecutar
  // la opción elegida. Ahora miramos la directiva Y el historial reciente.
  const WRITE_RE = /\b(registr|agreg|añad|anot|escrib|orden|complet|corrig|carg|aplic|hacelo|hac[eé]|modific|pon[eé]|actualiz|edit|arregl|reemplaz|renombr|mov[eé]|crea|mejor)/i
  const CONFIRM_RE = /^\s*(s[ií]|dale|ok(ay)?|listo|hacelo|hazlo|aplicalo?|proced[eé]|adelante|confirmo|de una|opci[oó]n\s*)?[\s,.:]*([abc]|[123]|la\s*[123]|el\s*[123]|es[ae]|aquel[la]?)?\s*$/i
  const histText = Array.isArray(history) ? history.slice(-4).map((m) => String(m.text || '')).join('\n') : ''
  const directiveWrite = WRITE_RE.test(String(directive || ''))
  // Confirmación/elección corta ("a", "dale", "la 2") + la charla previa proponía una
  // acción u opciones → el dueño está eligiendo: hay que ACTUAR, no re-preguntar.
  const followUpAction = CONFIRM_RE.test(String(directive || '')) && WRITE_RE.test(histText)
  const writeIntent = directiveWrite || followUpAction
  // MODELO POR NIVELES (ahorro de API): sonnet (potente, caro) solo cuando hace falta
  // criterio real — escribir, interpretar un adjunto, o presupuestar; haiku (barato,
  // rápido) para consultas simples y de charla. Antes era sonnet-siempre y quemaba
  // crédito hasta en un "hola". `fast === false` fuerza sonnet si el pedido lo pide.
  const budgetingKw = /presupuest|cotiz|c[oó]mputo|precio unitario|an[aá]lisis de precio|arm[aá].*(presupuesto|oferta)|apu\b/i.test(directive)
  const model = writeIntent || att || budgetingKw || fast === false ? 'sonnet' : 'haiku'
  const engine = resolveEngine('anthropic-api')

  // Fase 3: rutear al especialista correcto. Clasificamos la directiva a un dominio
  // e inyectamos SUS skills (mismo skill-map que el worker). Si es general, el
  // asistente administrativo de siempre. Si falla la clasificación, degrada a general.
  const capability = classifyDirective(directive) // instantáneo (keywords)
  const skillNames = capability === 'general' ? [] : skillsForCapability(capability)
  // Contexto de PRESUPUESTACIÓN: jornales UOCRA Zona A verificados (jul-2026) + flujo
  // FLEXIBLE (guía, se puede saltear) + disciplina. Solo cuando la directiva es de armar
  // presupuesto/cotizar. Los jornales van acá para que use los vigentes y no los del
  // archivo viejo; si cambian, se actualizan en un solo lugar.
  // Presupuestación detectada por KEYWORDS (no por el clasificador ganador: "jornal"
  // caía en RRHH y respondía con jornales viejos). Los jornales UOCRA verificados se
  // inyectan siempre que el tema toque mano de obra, aunque haya ruteado a RRHH.
  const isBudgeting = /presupuest|cotiz|c[oó]mputo|precio unitario|an[aá]lisis de precio|arm[aá].*(presupuesto|oferta)|apu\b/i.test(directive) || capability === 'advise.estimating'
  const needsUocra = isBudgeting || /jornal|uocra|categor[ií]a|oficial|ayudante|medio oficial|mano de obra|costo.*(hora|mo)\b/i.test(directive)
  const uocraRates = needsUocra
    ? '\n\nJORNALES UOCRA ZONA A VIGENTES (jul-2026, CCT 76/75, VERIFICADO — usá ESTOS, NO los de un archivo viejo): Oficial Especializado $6.800/h · Oficial $5.817/h · Medio Oficial $5.375/h · Ayudante $4.948/h. Sumas no remunerativas jul: Of.Esp $72.900 · Of $67.100 · M.Of $61.500 · Ayudante $57.900. Sobre el jornal van cargas sociales + adicionales de convenio (asistencia, Art.56 hormigonado 15%, EPP, ropa).'
    : ''
  const budgetingContext = uocraRates + (isBudgeting
    ? '\n\nPRESUPUESTACIÓN (método Echegaray) — MODO GUÍA: cuando el dueño quiere ARMAR un presupuesto, LIDERÁ la conversación PASO A PASO. NO pidas todo junto ni tires el presupuesto entero de una. Arrancá confirmando la obra y su alcance/partidas (podés tomarlas de un presupuesto anterior si te lo señala — carpeta PRESUPUESTOS, cada obra tiene su subcarpeta). Después construí PARTIDA POR PARTIDA: para cada una armá el APU (material + desperdicio, MO = rendimiento HH/unidad × costo horario UOCRA Zona A, equipos, subcontrato), mostrá el subtotal, CONFIRMÁ con el dueño y seguí a la próxima. Mantené un TOTAL CORRIENTE visible. Preguntá SOLO lo que necesitás para el paso actual (una cosa a la vez). ' +
      'El FLUJO completo (es GUÍA, el dueño puede saltear pasos): alcance → cómputo → APU por partida → costo directo → gastos generales → beneficio → financiación → impuestos → oferta → control vs histórico. ' +
      'DISCIPLINA: no mezclar costo directo / GG / beneficio / impuestos; MO siempre desde el convenio vigente (Zona A de arriba); dejar el alcance por escrito (para cobrar adicionales). ' +
      'Armá el presupuesto EN EL CHAT con tablas claras (no necesitás una planilla). Si el dueño tiene una planilla nativa compartida y te lo pide, además la completás con drive_batch_update (queda en Pendientes). Si falta un precio de material y no te lo dan, DECILO y pedilo — no inventes precios.'
    : '')
  // Framing conciso SIEMPRE (aunque cargue skills): queremos el CONOCIMIENTO del
  // especialista pero una entrega corta y directa, no el análisis extenso del worker.
  const roleFraming =
    'Sos el asistente operativo del OS de Echegaray Construcciones: respondés directivas del dueño con criterio experto y datos reales, pero DIRECTO y CONCISO — pocas palabras, al grano, sin relleno.'
  const { system, skillsLoaded } = await assembleReasoningSystem({
    rootPath: CTX.context.repository.rootPath, config: cfg,
    roleFraming,
    skillNames: skillNames.length ? skillNames : undefined,
    logger: log,
  })
  log.info('directiva ruteada', { capability, skills: skillsLoaded || [] })
  const registry = driveRegistry()
  const baseExecutor = makeToolExecutor({
    decide, tools: registry, principalId: DIRECTOR_PRINCIPAL, logger: log,
    // Enqueue REAL: una escritura propuesta (drive.write) se registra en
    // orq.pending_operations con su cambio concreto y queda esperando aprobación.
    enqueue: (op) => enqueuePendingOperation({ ...op, tenantId: CTX.context.tenantId, agentSlug: 'interactive' }),
  })
  // Cada tool que el modelo invoca deja un paso legible para el indicador en vivo;
  // si una tool devuelve un destino de navegación (navigate_to), lo capturamos para
  // que la extensión abra ese archivo/carpeta en la pestaña del dueño.
  let navTarget = null
  const toolExecutor = async (name, input, meta) => {
    progressPush(runId, friendlyStep(name, input))
    const out = await baseExecutor(name, input, meta)
    if (out && out.navigate && out.navigate.url) navTarget = out.navigate
    return out
  }
  const hoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  // Historial de la charla: seguir el hilo ("aplicá la 2", "hacelo", "y el otro?").
  const hist = Array.isArray(history) && history.length
    ? 'CONVERSACIÓN PREVIA (seguí el hilo; "hacelo"/"aplicá eso" se refieren a lo último que propusiste):\n' +
      history.slice(-8).map((m) => `${m.role === 'me' ? 'Dueño' : 'OS'}: ${String(m.text || '').slice(0, 700)}`).join('\n') + '\n\n'
    : ''
  const threadNudge = followUpAction
    ? 'IMPORTANTE — SEGUÍ EL HILO: el dueño está CONFIRMANDO o ELIGIENDO una opción de lo que propusiste recién (ver CONVERSACIÓN PREVIA). Interpretá "a/b/c", "la 2", "dale", "hacelo", "sí" como esa elección. NO vuelvas a preguntar, NO reinicies, NO respondas un estado genérico: EJECUTÁ ahora esa opción — leé el archivo si hace falta y dejá la operación concreta (drive_update en la fila/rango exacto) en Pendientes, avisando en una línea qué cambio y dónde.\n\n'
    : ''
  const prompt =
    `HOY: ${hoy} (San Juan, Argentina). Usá esta fecha; no la inventes.\n\n` +
    hist +
    threadNudge +
    `DIRECTIVA DEL DUEÑO:\n${directive}\n` +
    (fileId ? `\nEstá mirando el archivo de Drive con file_id=${fileId}. Leélo con drive_read si la directiva lo requiere.\n` : '') +
    `\n\nESTILO OBLIGATORIO: respondé en español, MUY conciso y específico. Sin preámbulos, sin repetir la pregunta, sin explicar tu proceso ("leí el archivo…", "voy a…"), sin cierres de cortesía. Andá directo al dato o a la acción. Números concretos. Por defecto 1–3 líneas o pocos bullets; solo extendé si te piden el detalle. Si necesitás un dato de un archivo, LEELO con las tools antes de responder (no inventes). ` +
    `Distinguí hecho/estimación; si falta algo, decilo en pocas palabras. ` +
    `Si la directiva pide ESCRIBIR/ordenar/completar/corregir/registrar/mejorar un archivo: ` +
    `(1) descubrí la estructura con drive_tabs — ojo: las pestañas como "Compras", "Caja", "Sueldos" son parte del MISMO archivo, NO archivos distintos — y leé la pestaña con drive_read para ver los encabezados y DÓNDE terminan los datos (ej. range "Compras!A1:M60"). ` +
    `(2) NO pidas aclaraciones que puedas resolver leyendo el archivo: ACTUÁ. ` +
    `(3) Para AGREGAR un registro (proceso EXACTO, sin loopear): drive_tabs → leé los encabezados con UNA sola drive_read (ej. "Compras!A1:M10") → drive_last_row(pestaña) te da next_empty_row → drive_update en "Pestaña!A<next>:M<next>" con la fila en el orden de los encabezados. NUNCA drive_append con rango abierto "A:M" (se ancla al título e inserta desplazando/rompiendo fórmulas). ` +
    `(4) Ojo con las columnas que son FÓRMULAS (ej. un ID autonumérico): no las pises con un valor fijo, dejá esa celda vacía o replicá la fórmula. ` +
    `REGLA CRÍTICA — ACTUÁ, NO NARRES: para que un cambio ocurra TENÉS QUE LLAMAR la tool de escritura (drive_update/drive_append/drive_rename/drive_move) AHORA MISMO. Describir el cambio en prosa ("Reescribo…", "Voy a…") NO crea NADA. Solo la llamada a la tool deja la operación en Pendientes. NO pidas confirmación en el chat ("¿confirmo?", "¿te muestro fila por fila?", "¿querés que…?"): la aprobación ES el botón de Pendientes, ahí el dueño revisa y aprueba/rechaza. Cuando tengas el cambio listo, LLAMÁ la tool con los values REALES y COMPLETOS (si es una reescritura grande de muchas filas, emití la matriz entera, no la resumas), y recién después avisá en UNA línea qué quedó pendiente y en qué rango. Solo preguntá si falta un dato que no está en NINGÚN archivo. ` +
    `Para LLEVAR al dueño a un archivo/carpeta ("llevame a", "abrí", "andá a", "mostrame la carpeta", "dónde está X", "quiero ver Y"): usá navigate_to (query = el nombre) — abre el destino en su navegador. Es también cómo se MUEVE entre carpetas del Drive: navegás a la carpeta y podés listar su contenido con drive_list. ` +
    `EDICIÓN POTENTE (usala, no vayas celda por celda): drive_batch_update escribe VARIOS rangos/bloques en UNA operación (preferila para completar secciones enteras); drive_insert_rows / drive_delete_rows agregan/quitan filas; drive_clear vacía un rango; drive_copy DUPLICA una plantilla o un presupuesto anterior; drive_trash da de baja a la papelera (reversible). Todo queda en Pendientes. ` +
    `Para ADMINISTRAR/ORGANIZAR Drive: mirá con drive_list/drive_find y usá drive_create (tipo "carpeta"), drive_rename o drive_move (todo pendiente de aprobación). Podés crear CARPETAS y renombrar/mover archivos existentes; NO podés crear documentos/planillas nuevos desde cero (la cuenta no tiene almacenamiento propio) — para eso el dueño crea el archivo y lo comparte. ` +
    (att
      ? `\n\nTE ADJUNTARON UN ARCHIVO (foto/PDF): interpretalo. Si es una factura/remito/comprobante, extraé proveedor, fecha, importe total, número y concepto. Si la directiva pide registrarlo, encontrá el Sheet correcto (ej. "Flujo de Caja - Cash Flow", pestaña de compras/gastos), LEÉ su estructura con drive_read y proponé la fila con drive_append. No inventes lo que no ves; si un dato no está en la imagen, decilo.\n`
      : '') +
    `Lo demás con efecto económico/fiscal/legal externo (Nivel E) tampoco lo ejecutes: proponelo en una línea.` +
    budgetingContext +
    (isBudgeting
      ? ' Para presupuestar podés extenderte lo necesario (tablas, partidas, APU) — acá la claridad importa más que la brevedad.'
      : ' Recordá: máxima concisión.')

  // Con adjunto, el prompt es un array de bloques (visión/documento + texto). El
  // engine acepta content como array sin cambios.
  const promptContent = att ? [att, { type: 'text', text: prompt }] : prompt

  const eng = await engine.run(
    { system, prompt: promptContent, worktreePath: CTX.context.repository.rootPath, model, maxCostUsd: 1.2, maxTokens: writeIntent || att || isBudgeting ? 4096 : 900,
      maxToolIterations: att || writeIntent || isBudgeting ? 16 : 10, allowedTools: 'Read',
      task: { id: 'interactive', capability_slug: 'advise.admin' },
      tools: Object.values(registry).map((t) => t.schema), toolExecutor, agentSlug: 'interactive' },
    CTX)
  return { answer: eng.result, model, cost: eng.cost?.usd ?? 0, capability, skills: skillsLoaded || [], navigate: navTarget }
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
  // Versión de la extensión publicada: la extensión la compara con la suya y avisa si
  // hay que actualizar (los unpacked no se auto-actualizan). Sin auth: es solo un número.
  if (req.method === 'GET' && req.url === '/version') {
    try {
      const m = JSON.parse(await readFile(path.join(REPO, 'extension', 'manifest.json'), 'utf8'))
      return send(res, 200, { version: m.version })
    } catch { return send(res, 200, { version: null }) }
  }
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

  // Progreso en vivo de una directiva en curso (polling desde la extensión).
  if (req.method === 'GET' && req.url.startsWith('/progress')) {
    const rid = new URL(req.url, 'http://x').searchParams.get('id')
    const p = rid && PROGRESS.get(rid)
    return send(res, 200, p ? { steps: p.steps.slice(-6), done: p.done } : { steps: [], done: false })
  }

  // Resultado de una directiva que se fue a segundo plano (fallback asíncrono).
  if (req.method === 'GET' && req.url.startsWith('/result')) {
    const rid = new URL(req.url, 'http://x').searchParams.get('id')
    const r = rid && RESULTS.get(rid)
    if (!r) return send(res, 200, { done: false })
    if (r.error) return send(res, 200, { done: true, error: r.error })
    return send(res, 200, { done: true, ...r.out })
  }

  // Estado de una operación por id: la extensión lo consulta tras aprobar para avisar
  // si se ejecutó o falló (antes fallaba en silencio y el dueño no se enteraba).
  if (req.method === 'GET' && req.url.startsWith('/operation-status')) {
    try {
      const id = new URL(req.url, 'http://x').searchParams.get('id')
      if (!id) return send(res, 400, { error: 'falta id' })
      const op = await getPendingOperationById(id)
      if (!op) return send(res, 404, { error: 'operación inexistente' })
      return send(res, 200, op)
    } catch (e) { return send(res, 500, { error: e.message }) }
  }

  // Agenda: recurrencias programadas por el dueño.
  if (req.method === 'GET' && req.url === '/schedules') {
    try {
      return send(res, 200, { items: await listSchedules() })
    } catch (e) { return send(res, 500, { error: e.message }) }
  }

  if (req.method !== 'POST' || !['/ask', '/operation', '/schedule', '/schedule/toggle'].includes(req.url)) {
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

      // Crear una recurrencia (ej. "todos los lunes revisá cobranzas").
      if (req.url === '/schedule') {
        const { title, directive, cadence } = data
        if (!directive || !cadence) return send(res, 400, { error: 'faltan directive y cadence' })
        const s = await createSchedule({
          tenantId: CTX.context.tenantId, createdBy: DIRECTOR_PRINCIPAL,
          title: (title || directive).slice(0, 120), directive: directive.slice(0, 2000), cadence,
        })
        log.info('recurrencia creada', { id: s.id, cadence })
        return send(res, 200, { ok: true, schedule: s })
      }

      // Habilitar/deshabilitar una recurrencia.
      if (req.url === '/schedule/toggle') {
        const { id, enabled } = data
        if (!id) return send(res, 400, { error: 'falta id' })
        return send(res, 200, { ok: true, schedule: await toggleSchedule(id, enabled) })
      }

      // Directiva normal. La extensión 0.6.0+ manda wantsAsync + extVersion.
      const { directive, fileId, fast, attachment, history, runId, wantsAsync, extVersion } = data
      if (!directive || typeof directive !== 'string') return send(res, 400, { error: 'falta "directive"' })
      log.info('directiva recibida', { extVersion: extVersion || 'desconocida', wantsAsync: !!wantsAsync })
      const t0 = Date.now()
      const rid = runId || (`srv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      const work = ask({ directive: directive.slice(0, 4000), fileId, fast, attachment, history, runId: rid })
        .then((out) => { RESULTS.set(rid, { done: true, out }); return out })
        .catch((e) => { RESULTS.set(rid, { done: true, error: e.message }); throw e })
        .finally(() => { progressDone(rid); setTimeout(() => RESULTS.delete(rid), 120000) })
      if (wantsAsync) {
        // FALLBACK ASÍNCRONO (extensión 0.6.0+): un análisis profundo puede pasar los ~55s
        // donde Vercel corta. Si no termina en 48s, respondemos { async } y la seguimos en
        // segundo plano; la extensión trae el resultado por /result?id=.
        let timer
        const timeout = new Promise((r) => { timer = setTimeout(() => r('__async__'), 48000) })
        const winner = await Promise.race([work.catch((e) => ({ __error__: e.message })), timeout])
        clearTimeout(timer)
        if (winner === '__async__') {
          log.info('directiva larga → segundo plano', { rid })
          send(res, 200, { async: true, runId: rid, note: 'Es una tarea larga; la sigo trabajando y te traigo el resultado acá mismo.' })
        } else if (winner && winner.__error__) {
          send(res, 500, { error: winner.__error__ })
        } else {
          log.info('directiva respondida', { ms: Date.now() - t0, model: winner.model, cost: winner.cost })
          send(res, 200, { ...winner, ms: Date.now() - t0 })
        }
      } else {
        // Cliente viejo (no entiende { async }): esperamos el resultado real. Si la tarea es
        // muy larga, el proxy corta a ~55s — por eso conviene actualizar la extensión.
        try {
          const out = await work
          log.info('directiva respondida (sync)', { ms: Date.now() - t0, model: out.model })
          send(res, 200, { ...out, ms: Date.now() - t0 })
        } catch (e) { send(res, 500, { error: e.message }) }
      }
    } catch (e) {
      log.error('request falló', { url: req.url, error: e.message })
      send(res, 500, { error: e.message })
    }
  })
})

boot().then(() => server.listen(PORT, '0.0.0.0', () => log.info('escuchando (público)', { port: PORT, url: PUBLIC_URL })))
  .catch((e) => { log.error('boot falló', { error: e.message }); process.exit(1) })
