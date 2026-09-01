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
//
// ═══ ESCUCHA EN LOOPBACK, NO EN 0.0.0.0 (27/08/2026) ═══
//
// Escuchaba en `0.0.0.0`, es decir en TODAS las interfaces, incluida la pública.
//
// Lo que hoy lo tapaba NO era este código: es un cortafuegos delante de la VM. Medido desde un
// cliente que no es esta máquina —una sonda efímera en el borde de Cloudflare, con control
// positivo—: `chat.ecsas.com.ar:443` contestó 200; un puerto abierto a propósito en `0.0.0.0:8799`
// dio TIMEOUT desde afuera y contestaba local; y la misma sonda alcanza puertos no estándar en
// otros hosts, así que el timeout es del filtro, no de la sonda. O sea: la exposición era LATENTE
// —el socket estaba abierto al mundo y sólo un filtro que este repo no controla lo salvaba—, no
// activa. (Una auditoría anterior la reportó como alcanzable con un 200 desde la IP pública: eso
// se midió DESDE la propia VM, donde el filtro no interviene. No era cierto.)
//
// Igual se cierra, y por la razón de fondo: un bind es la única defensa que viaja con el proceso.
// Un filtro vive en la consola del proveedor, lo puede cambiar cualquiera y no deja rastro acá.
//
// La exposición NO hacía falta para nada. Los tres clientes reales entran por loopback:
//   · el túnel saliente de cloudflared, que se conecta a `http://localhost:8790`;
//   · `handlers/scheduled_directive.mjs`, que corre en esta misma VM;
//   · la extensión y el OAuth de Google, que van a Vercel y Vercel entra por el túnel.
// Ninguno se rompe al cerrar el borde, porque ninguno lo usaba.
//
// Y el borde abierto tenía superficie ANTES del token: `/`, `/extension.zip`, `/version`,
// `/oauth/start` y `/oauth/exchange` contestan sin `authorization`. Que la API exija Bearer no
// alcanza cuando cinco rutas no lo piden; el arreglo es no estar en la red pública, no confiar en
// que cada ruta se acuerde de chequear.
//
// `ORQ_INTERACTIVE_HOST` existe para un despliegue detrás de un proxy en otra máquina. El DEFAULT
// es loopback: quien quiera abrirlo tiene que escribirlo.
import http from 'node:http'
import { bloqueUocra } from './lib/uocra-bloque-prompt.mjs'
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
import { sheetsFormatTools } from './lib/tools/sheets-format.mjs'
import { docsFormatTools } from './lib/tools/docs-format.mjs'
import { osDataTools } from './lib/tools/os-data.mjs'
import { jornalesTools } from './lib/tools/jornales-tool.mjs'
import { certificacionesTools } from './lib/tools/certificaciones-tool.mjs'
import { comprasTools } from './lib/tools/compras-tool.mjs'
import { cuitTools } from './lib/tools/cuit-tool.mjs'
import { obligacionesTools } from './lib/tools/obligaciones-tool.mjs'
import { adicionalesTools } from './lib/tools/adicionales-tool.mjs'
import { legajosTools } from './lib/tools/legajos-tool.mjs'
import { pylTools } from './lib/tools/pyl-tool.mjs'
import { cotizacionesTools } from './lib/tools/cotizaciones-tool.mjs'
import { cajaVencidoTools } from './lib/tools/caja-vencido-tool.mjs'
import { controlAdministrativoTools } from './lib/tools/control-administrativo-tool.mjs'
import { auditarPestanaTools } from './lib/tools/auditar-pestana-tool.mjs'
import { estadoEmpresaTools } from './lib/tools/estado-empresa-tool.mjs'
import { tomarSnapshot } from './lib/sheet-snapshot.mjs'
import { deshacerSheetTools } from './lib/tools/deshacer-sheet-tool.mjs'
import { operacionesSheetTools } from './lib/tools/operaciones-sheet-tool.mjs'
import { reclamoCobranzaTools } from './lib/tools/reclamo-cobranza-tool.mjs'
import { cotizacionesHistorialTools } from './lib/tools/cotizaciones-historial-tool.mjs'
import { slidesPdfTools } from './lib/tools/slides-pdf-tool.mjs'
import { presentacionTools } from './lib/tools/presentacion-tool.mjs'
import { imagenTools } from './lib/tools/imagen-tool.mjs'
import { noConformidadesTools } from './lib/tools/no-conformidades-tool.mjs'
import { webSearchTools } from './lib/tools/web.mjs'
import { learnTools } from './lib/tools/learn.mjs'
import { rendimientoTools } from './lib/tools/rendimiento.mjs'
import { cuadroEconomico } from './lib/obra-economics.mjs'
import { obraTools } from './lib/tools/obra.mjs'
import { workspaceTools } from './lib/tools/workspace.mjs'
import { proposeSkillImprovement } from './lib/skill-proposals.mjs'
import { briefingEjecutivo } from './lib/briefing.mjs'
import { cerebroDisponible } from './lib/estado-cerebro.mjs'
import { recallResumen } from './lib/memory.mjs'
import { priorizarCajaResumen, proyeccionCajaResumen } from './lib/caja-alertas.mjs'
import { registerChatGap, registerRespuestaFallida } from './lib/emergence.mjs'
import { avanceResumen } from './lib/avance-fisico.mjs'
import { decidirAcceso } from './lib/os-auth.mjs'
import { libroIvaResumen, comprobantesSinRegistrar, parsePeriodo, conciliarProveedoresArca } from './lib/libro-iva.mjs'
import { pedidosResumen } from './lib/pedidos-materiales.mjs'
import { appsheetPedidosTools } from './lib/tools/appsheet-pedidos.mjs'
import { gastoSheetTools } from './lib/tools/gasto-sheet.mjs'
import { sheetRenderTools } from './lib/tools/sheet-render.mjs'
import { sheetDropdownTools } from './lib/tools/sheet-dropdowns.mjs'
import { bibliotecaAreaTools } from './lib/tools/biblioteca-area-tool.mjs'
import { operatingReviewTools } from './lib/tools/operating-review-tool.mjs'
import { egresosTools } from './lib/tools/egresos-tool.mjs'
import { cargasSocialesTools } from './lib/tools/cargas-sociales-tool.mjs'
import { nominaSyncTools } from './lib/tools/nomina-sync-tool.mjs'
import { abrirReview, formatReview } from './lib/operating-review.mjs'
import { areaMencionada, bibliotecaArea, formatBiblioteca, bloqueContextoArea, pideAccion } from './lib/biblioteca-area.mjs'
import { briefingCajaTools } from './lib/tools/briefing-caja-tool.mjs'
import { estadoOperativoObra, esObraOperativa } from './lib/obra-operativa.mjs'
import { findObras, desviosObras, aprendizajesPostMortem } from './lib/obra-economics.mjs'
import { agendaResumen, mailsResumen } from './lib/agenda-mail.mjs'
import { estadoPresupuesto, degradarModeloOnDemand, pausarAutonomo } from './lib/budget.mjs'
import { fichaObra } from './lib/ficha-obra.mjs'
import { carteraResumen } from './lib/cartera.mjs'
import { resolveUsuario, puede, capClasificadorSensible } from './lib/usuarios.mjs'
import { authUrl, exchangeCode, operadorEmail, operadorPara, getTokenFor } from './lib/google-oauth.mjs'
import { WORKSPACE_SCOPES } from './lib/google.mjs'
import { makeToolExecutor } from './lib/tool-executor.mjs'
import { enqueuePendingOperation, listPendingOperations, decidePendingOperation, getPendingOperationById } from './lib/pending-ops.mjs'
import { classifyDirective, classifyDirectiveMulti, textoParaRutear, esContinuacion } from './lib/classify-directive.mjs'
import { cacheGet, cachePut, cacheClearAll } from './lib/chat-cache.mjs'
import { skillsForCapability, skillsParaDirectiva, skillsSegunProfundidad, mencionaSheet, SKILL_SHEETS } from './lib/skill-map.mjs'
import { resolucionDeRespuesta, nivelDeLaRespuesta, registrarPedidoDelChat } from './lib/skill-metricas.mjs'
import { extraerRestricciones, DOCTRINA_EDICION, VERIFICACION_EDICION } from './lib/doc-edit-guardrails.mjs'
import { isMailComposeIntent, isCalendarWriteIntent } from './lib/chat-intents.mjs'
import { stripPreamble } from './lib/chat-format.mjs'
import { personaParaConsulta } from './lib/chat-persona.mjs'
import { crearCacheLecturaPorCorrida } from './lib/run-read-cache.mjs'
import { isWriteIntent, isProposedWrite } from './lib/write-intent.mjs'
import { isBudgetingIntent } from './lib/budget-intent.mjs'
import { parseScheduleRequest, describeCadence } from './lib/schedule-intent.mjs'
import { scheduleTools } from './lib/tools/schedule-tools.mjs'
import { propuestasMejoraResumen } from './lib/mejoras.mjs'
import { createSchedule, listSchedules, toggleSchedule } from './lib/schedules.mjs'
import { enqueueTask } from './lib/ledger.mjs'
import { route } from './lib/router.mjs'

const cfg = loadConfig()
const log = createLogger({ component: 'interactive' })
const HOST = process.env.ORQ_INTERACTIVE_HOST ?? '127.0.0.1' // nunca 0.0.0.0 por defecto
const PORT = Number(process.env.ORQ_INTERACTIVE_PORT ?? 8790)
const TOKEN = process.env.ORQ_INTERACTIVE_TOKEN ?? ''
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ZIP_PATH = path.join(REPO, 'extension.zip')
// El frente estable de cara al mundo es Vercel, no esta VM: el puerto local ya no es alcanzable
// desde afuera y publicarlo en una página sería mandar al usuario a una puerta cerrada.
const PUBLIC_URL = process.env.ORQ_PUBLIC_URL || 'https://app.ecsas.com.ar/api/os'

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
  // TIPO HECHO: esto no lo dedujo un modelo, lo dijo el dueño («recordá que…»). Es la única vía
  // por la que una afirmación entra como hecho desde el chat, y por eso es la única que suma
  // `veces_confirmado` cuando se repite: que el dueño lo diga dos veces sí es confirmación.
  const { rows } = await query("select id from orq.principals where slug = 'agent:director-general' limit 1")
  DIRECTOR_PRINCIPAL = rows[0]?.id ?? CTX.context.systemPrincipalId
  log.info('motor interactivo listo', { port: PORT, tenant: CTX.context.tenantId })
}

/** Registro de tools de Drive: lectura (auto) + escritura (requieren aprobación) +
 *  búsqueda por índice. Las de escritura no se ejecutan acá: el tool-executor las
 *  encola como operaciones pendientes (Nivel E). */
async function driveRegistry(attachment, userEmail) {
  // OAuth por usuario (PRP-024): si hay una cuenta autorizada, el cliente de Drive actúa
  // COMO ella (crear/copiar/editar donde sea, leer Docs/Gmail/Calendar) en vez del Service
  // Account sin storage. Si nadie autorizó todavía, cae al SA (comportamiento previo).
  // Si el USUARIO que pide autorizó su propia cuenta, el OS actúa COMO ÉL (su Drive, su
  // Gmail); si no, usa la cuenta operadora del OS.
  const op = await operadorPara(userEmail)
  const google = op
    ? makeGoogleClient({ config: cfg, scopes: WORKSPACE_SCOPES, getToken: getTokenFor(op) })
    : makeGoogleClient({ config: cfg })
  // El ACTOR de la auditoría de Drive es la persona que está preguntando, no "sistema": es la
  // única forma de que el libro conteste "quién". `db` enciende la auditoría y el índice del
  // buscador determinístico. Ver `lib/drive/index.mjs`.
  const ctxDrive = { db: { query }, actor: userEmail || (op ?? 'chat:anonimo'), actorTipo: 'persona' }
  const registry = { ...driveReadTools(google, ctxDrive), ...driveWriteTools(google, ctxDrive), ...sheetsFormatTools(op ? google : null), ...docsFormatTools(op ? google : null), ...osDataTools(), ...jornalesTools(google), ...certificacionesTools(), ...comprasTools(), ...cuitTools(), ...obligacionesTools(), ...adicionalesTools(), ...legajosTools(), ...pylTools(google), ...cotizacionesTools(), ...noConformidadesTools(), ...cajaVencidoTools(), ...controlAdministrativoTools(), ...auditarPestanaTools(op ? google : null), ...estadoEmpresaTools(op ? google : null), ...deshacerSheetTools(op ? google : null), ...operacionesSheetTools(op ? google : null), ...reclamoCobranzaTools(op ? google : null), ...cotizacionesHistorialTools(), ...slidesPdfTools(op ? google : null), ...presentacionTools(op ? google : null), ...imagenTools(op ? google : null), ...webSearchTools(), ...learnTools(), ...rendimientoTools(), ...obraTools(), ...workspaceTools({ google: op ? google : null }), ...appsheetPedidosTools({ google: op ? google : null }), ...gastoSheetTools(op ? google : null), ...sheetRenderTools(op ? google : null), ...sheetDropdownTools(op ? google : null), ...briefingCajaTools(op ? google : null), ...bibliotecaAreaTools(), ...operatingReviewTools(), ...egresosTools(op ? google : null), ...cargasSocialesTools(op ? google : null), ...nominaSyncTools(op ? google : null) }
  // Si el dueño adjuntó una imagen/archivo, exponer una tool para GUARDARLO en su Drive.
  if (attachment?.data && attachment?.media_type) {
    registry['drive.upload_adjunto'] = {
      capability: 'drive.write', account: 'ecsas',
      schema: {
        name: 'guardar_adjunto_en_drive',
        description: 'Guarda el archivo/imagen que el dueño ADJUNTÓ en este mensaje, dentro de su Drive. Pasá name (nombre del archivo, con extensión) y folder_id opcional (carpeta destino). Devuelve el link.',
        input_schema: { type: 'object', properties: { name: { type: 'string' }, folder_id: { type: 'string' } }, required: ['name'] },
      },
      async run(input) {
        if (!input?.name) return { error: 'falta name' }
        try { const r = await google.uploadFile(input.name, attachment.data, attachment.media_type, { parentId: input.folder_id }); return { ok: true, ...r } }
        catch (e) { return { error: `no pude guardar el adjunto: ${String(e?.message ?? e).slice(0, 160)}` } }
      },
    }
  }
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
  // El cliente de Google se expone aparte (no como tool) para que el ejecutor pueda tomar el
  // snapshot de la pestaña antes de escribir. No enumerable: no debe aparecer como una tool más.
  Object.defineProperty(registry, "__google", { value: google, enumerable: false })
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
// Telemetría de costo del CHAT (en memoria, desde el arranque): para que el dueño vea
// en qué se le va el crédito sin entrar a la consola. Aproximado; el total real vive en
// console.anthropic.com. Se resetea al reiniciar el servicio.
const COST = { since: Date.now(), total: 0, n: 0, byModel: {} }
function trackCost(usd, model, rol, motivo) {
  const u = Number(usd) || 0
  COST.total += u; COST.n++; COST.byModel[model] = (COST.byModel[model] || 0) + u
  // Persistir para que el TOPE diario sea honesto entre reinicios (no solo en memoria).
  if (u > 0) query(`insert into orq.chat_cost (model, usd, rol, motivo) values ($1, $2, $3, $4)`, [model, u, rol || null, motivo || null]).catch(() => {})
}
// Cerebro que compone: cuántas preguntas respondió la caché con 0 API (y el ahorro estimado).
const CACHE_STATS = { hits: 0, misses: 0 }
// Eficiencia global del cerebro: respuestas resueltas SIN modelo (detecciones determinísticas
// + caché) vs. respuestas que pagaron API. Es la métrica de "cuánto se autoabastece el OS".
const USAGE = { zeroApi: 0 }
// Cuenta cada respuesta REAL una sola vez (se llama en el .then del askPromise). Los estados
// transitorios (trabajando/cancelado/error) no cuentan. Lo pago ya lo cuenta trackCost (COST.n).
function countAnswer(model) {
  // La regla vive en lib/skill-metricas.mjs (la misma que etiqueta `resolucion` en chat_request):
  // dos copias de "esto pagó un modelo" se corrigen una sola vez y la vieja miente sin avisar.
  if (resolucionDeRespuesta(model) === 'determinista') USAGE.zeroApi++
}
async function costSummary() {
  const hrs = Math.max(0.01, (Date.now() - COST.since) / 3.6e6)
  const per = Object.entries(COST.byModel).map(([m, u]) => `${m}: US$${u.toFixed(4)}`).join(' · ')
  // Costo REAL de los agentes autónomos (worker), de la DB: hoy y 7 días, por tipo. Es
  // el 90% del gasto (los especialistas), invisible hasta ahora en el chat.
  let auto = ''
  try {
    const { rows: hoy } = await query(`select round(sum(coalesce((result->'cost'->>'usd')::numeric,0))::numeric,2) usd, count(*) filter (where result ? 'cost') n from orq.tasks where created_at >= date_trunc('day', now())`)
    const { rows: sem } = await query(`select round(sum(coalesce((result->'cost'->>'usd')::numeric,0))::numeric,2) usd from orq.tasks where created_at > now() - interval '7 days'`)
    const { rows: porTipo } = await query(`select type, round(sum(coalesce((result->'cost'->>'usd')::numeric,0))::numeric,2) usd from orq.tasks where created_at > now() - interval '7 days' and result ? 'cost' group by type order by usd desc nulls last limit 4`)
    const tipos = porTipo.filter((r) => Number(r.usd) > 0).map((r) => `${r.type} $${r.usd}`).join(' · ')
    const pres = await estadoPresupuesto(COST.total).catch(() => null)
    const capLinea = pres ? `\n• Tope diario: US$${pres.cap} — usado hoy US$${pres.usado} (${Math.round(pres.ratio * 100)}%) → modo **${pres.modo}**${pres.modo !== 'normal' ? ' (análisis caros bajan a haiku; la vigilancia no despacha especialistas; el chat nunca se corta)' : ''}` : ''
    auto = `\n\n**Agentes autónomos (worker) — costo REAL:**\n• Hoy: US$${hoy[0].usd || 0} (${hoy[0].n || 0} tareas) · Últimos 7 días: US$${sem[0].usd || 0}\n• Por tipo (7d): ${tipos || 'sin datos'}${capLinea}\n_El 90% es la vigilancia diaria disparando especialistas. Es lo que más pesa._`
  } catch { auto = '' }
  // Eficiencia del cerebro: qué proporción de respuestas salió SIN pagar modelo (detecciones
  // determinísticas + caché) y hit-rate del caché. Es la métrica de autoabastecimiento.
  let cacheLinea = ''
  const totalResp = USAGE.zeroApi + COST.n
  if (totalResp > 0) {
    const avg = COST.n > 0 ? COST.total / COST.n : 0.03
    const pct0 = Math.round((USAGE.zeroApi / totalResp) * 100)
    const ahorro = (USAGE.zeroApi * avg).toFixed(2)
    const cacheTot = CACHE_STATS.hits + CACHE_STATS.misses
    const hitRate = cacheTot > 0 ? `${Math.round((CACHE_STATS.hits / cacheTot) * 100)}% (${CACHE_STATS.hits}/${cacheTot})` : 'sin datos aún'
    cacheLinea = `\n\n**Eficiencia del cerebro:** ${USAGE.zeroApi}/${totalResp} respuestas (**${pct0}%**) salieron con **0 API** (detecciones + memoria), ${COST.n} pagaron modelo. Ahorro estimado US$${ahorro}. Hit-rate del caché: ${hitRate}. Cuanto más se usa, más barato responde.`
  }
  return `**Chat** desde que arrancó el OS (hace ${hrs.toFixed(1)}h): US$${COST.total.toFixed(4)} en ${COST.n} pedidos.\n${per || ''}${cacheLinea}${auto}\n\n_Estimado desde el uso de tokens; el total exacto está en console.anthropic.com._`
}
const PROGRESS = new Map()
// Resultados de directivas largas que se resolvieron en segundo plano (tras superar el
// techo de 45s inline). La extensión los recoge por /result?id=. Se limpian solos.
const RESULTS = new Map()
// Pedidos EN CURSO por (usuario+directiva): si llega un reenvío idéntico mientras el
// primero sigue trabajando, lo ADJUNTAMOS al run existente en vez de arrancar de cero.
// Rompe el bucle real "se corta y empieza de nuevo y se vuelve a cortar".
const INFLIGHT = new Map()
// Runs DETENIDOS por el usuario (botón Stop): se ignora su entrega tardía y se libera el
// pedido. La tarea de fondo termina sola (acotada) pero su resultado ya no se muestra.
const CANCELLED = new Set()
function progressInit(runId) { if (runId) PROGRESS.set(runId, { steps: ['Pensando…'], done: false, updated: Date.now() }) }
function progressPush(runId, step) { const p = runId && PROGRESS.get(runId); if (p) { p.steps.push(step); p.updated = Date.now() } }
function progressDone(runId) { const p = runId && PROGRESS.get(runId); if (p) { p.done = true; p.updated = Date.now() } if (runId) setTimeout(() => PROGRESS.delete(runId), 30000) }
// DURABILIDAD: guardar el resultado en DB para que sobreviva un reinicio del proceso
// (si el server muere entremedio, /result lo recupera de acá en vez de dar "se perdió").
function persistResult(rid, payload) {
  if (!rid) return
  query(`insert into orq.chat_result (rid, payload) values ($1, $2::jsonb)
         on conflict (rid) do update set payload = excluded.payload, created_at = now()`,
    [rid, JSON.stringify(payload)]).catch(() => {})
}
// F0.1 INSTRUMENTAR: un registro por pedido con su TEXTO + desenlace + latencia. Es el instrumento
// que faltaba (el OS no guardaba qué se le pedía → no podía medir qué falla ni qué hacer instantáneo).
// Fire-and-forget, nunca rompe la respuesta. El desenlace se deriva de la respuesta real.
function outcomeDe(out) {
  if (!out) return 'error'
  if (out.error) return 'error'
  if (out.__working__ || out.async) return 'async'
  const a = String(out.answer || '')
  if (/frené para no gastar|tope de costo/i.test(a)) return 'corte_costo'
  if (/agot[oó] iteraciones|demasiados pasos/i.test(a)) return 'corte_iter'
  if (a.length < 40) return 'corta'
  return 'normal'
}
function logChatRequest({ rid, directive, user, surface, out, latencyMs, extVersion }) {
  if (!rid) return
  // Cuando el pedido se despacha a un especialista, `out.skills` trae el SLUG DEL AGENTE, no una
  // skill. Guardarlo en la misma columna mezclaría dos vocabularios y la métrica por capacidad
  // contaría un agente como si fuera una skill; quién atendió ya queda en `capability`.
  const skills = /^agente/i.test(String(out?.model || '')) ? [] : (Array.isArray(out?.skills) ? out.skills : [])
  // `skills` y `resolucion` son la instrumentación por CAPACIDAD: sin ellas se podía medir el
  // costo del chat pero no cuánto se usa cada skill ni cuánta de esa demanda se resolvió sin pagar
  // un modelo. Van en la misma fila y en el mismo insert: no cuesta una escritura más.
  // El `nivel` sale del catálogo (cacheado en memoria), por eso la fila se arma en una promesa.
  // Sigue siendo fire-and-forget: la telemetría nunca demora ni rompe la respuesta al dueño. El
  // insert (y su degradación si la migración todavía no se aplicó) vive en lib/skill-metricas.mjs.
  nivelDeLaRespuesta(out?.model, skills).then((nivel) => registrarPedidoDelChat([
    rid, String(directive || '').slice(0, 2000), user || 'anon', surface || 'extension',
    out?.capability || null, out?.model || null, out?.cost ?? null,
    latencyMs ?? null, outcomeDe(out), extVersion || null,
    skills, resolucionDeRespuesta(out?.model), nivel,
  ])).catch(() => {})
}
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

// Lista viva de lo que el OS sabe hacer hoy. Se responde sin llamar a la API (gratis) y
// se actualiza acá cuando el cerebro gana una capacidad — la extensión la refleja sola.
const CAPABILITIES_HELP = [
  'Esto es lo que podés pedirme (escribí en lenguaje normal):',
  '',
  '🗞️ **Briefing ejecutivo** — "¿cómo estamos?", "resumen", "qué hay hoy". Una foto: caja vencida + desvíos de obra + lo que el OS detectó y propuso solo. 0 API.',
  '📊 **Consultar datos reales** — "¿cuánto tengo en caja?", "mostrame el avance de la obra X", "qué dice el presupuesto de Y".',
  '📐 **Avance físico de obra** — "avance físico", "avance de obra San Francisco". Lee el tracker real "Avances de Obra" y da el % de actividades completas por obra.',
  '💰 **Cuadro económico por obra** — "cuadro económico", "¿cómo va Galpones económicamente?", "margen de la obra X". Contratado vs presupuesto vs costo real vs adicionales, con margen y desvío, marcando qué es dato y qué es cálculo.',
  '🧾 **Libro IVA (ARCA)** — "libro IVA de junio", "¿cuánto IVA pagamos?", "comprobantes recibidos". IVA ventas/compras y posición (débito − crédito) desde los comprobantes reales de ARCA, y qué comprobantes de compra podrían estar sin registrar. 0 API. (Solo Dirección.)',
  '📦 **Pedidos de materiales** — "pedidos de materiales", "pedidos pendientes", "qué se pidió para la obra X". Lee la app de campo (AppSheet) espejada en el OS: material, cantidad, obra y estado. 0 API.',
  '✅ **Modificar la app de Pedidos (AppSheet)** — "marcá el pedido 1 como entregado", "agregá 10 bolsas de cemento para Galpones". Escribo en la app real; como lo ve el campo, cae en Pendientes para tu OK y recién ahí se aplica.',
  '🧠 **Aprender de vos** — "recordá que…" o corregime en pleno trabajo y lo guardo; "¿qué sabés de la empresa?" te muestro lo aprendido.',
  '📄 **Leer PDFs del Drive** — "leé el contrato/cotización/remito/plano X y resumímelo". Interpreto contratos, cotizaciones, facturas y planos con texto.',
  '🧮 **Armar presupuestos guiado** — "armemos el presupuesto de la obra X, guiame". Te llevo paso a paso con jornales UOCRA Zona A vigentes, APU, GG y margen.',
  '✏️ **Editar y ordenar Drive** — "completá esta planilla", "agregá esta fila", "copiá esta plantilla", "renombrá/mové este archivo". Todo queda en Pendientes para tu OK.',
  '🧭 **Llevarte a un archivo** — "llevame a la carpeta administración", "abrí el Cash Flow".',
  '👷 **Especialistas por tema** — finanzas, impuestos, laboral/UOCRA, legal/contratos, ingeniería, calidad, seguridad, compras, dirección de obra. Activo los que correspondan a tu pedido.',
  '📎 **Interpretar una foto/PDF que subas** — adjuntá una factura y "registrala en el Cash Flow".',
  '📅 **Tu agenda** — "qué tengo hoy / esta semana", "mi calendario", "próximas reuniones". Lee tu Google Calendar. 0 API. (Crear/editar eventos: con tu aprobación.)',
  '📬 **Tus mails** — "mis mails de hoy", "mails sin leer", "correos recientes". Lee tu Gmail. 0 API. (Responder/archivar: pedímelo.)',
  '⏰ **Agenda** — "todos los lunes revisá cobranzas y avisame".',
  '',
  'Para trabajo profundo de un especialista, pedí "hacé un análisis en profundidad de…" (tarda más, razona hondo).',
].join('\n')

// PRP-016 — APRENDIZAJE. Guarda un hecho que el DUEÑO enseña ("recordá que…") en
// conocimiento_empresa con origen_task_id NULL (así queda separado del ruido de la
// vigilancia autónoma, que sí setea origen_task_id). Dedup por clave normalizada.
async function saveKnowledge(area, afirmacion) {
  const clave = String(afirmacion).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200)
  if (!clave) return
  const { rows } = await query(
    `insert into public.conocimiento_empresa (area, afirmacion, clave, confianza, tipo, fuente)
     values ($1, $2, $3, 'alta', 'HECHO', 'dueño:chat')
     on conflict (clave) do update set veces_confirmado = public.conocimiento_empresa.veces_confirmado + 1, updated_at = now(), vigente = true
     returning veces_confirmado`,
    [area, String(afirmacion).slice(0, 1000), clave],
  )
  // El conocimiento cambió ⇒ invalidar la caché de respuestas (las viejas pueden quedar
  // desactualizadas frente a lo que el dueño acaba de enseñar). Se repuebla sola.
  cacheClearAll().catch(() => {})
  // PRP-016 F3: recurrencia (≥2) ⇒ proponer revisar la skill del dominio (no la muta).
  const veces = rows[0]?.veces_confirmado ?? 0
  if (veces >= 2) await proposeSkillImprovement({ area, afirmacion, veces })
}
/** Trae lo que el dueño le enseñó (solo owner-taught: origen_task_id NULL), acotado. */
async function ownerTaughtFacts(limit = 10) {
  try {
    const { rows } = await query(
      `select afirmacion from public.conocimiento_empresa
        where vigente = true and origen_task_id is null
        order by veces_confirmado desc, updated_at desc limit $1`, [limit])
    return rows.map((r) => r.afirmacion)
  } catch { return [] }
}
// Memoria RELEVANTE al pedido actual: trae de TODA la memoria (owner-taught + lo que el OS
// dedujo) los hechos que mencionan las palabras significativas de la directiva. Así el chat
// "recuerda" lo específico del tema que estás tocando, no solo los top-N fijos. 0 API.
const MEM_STOP = new Set('para con los las una unos unas que del por como cuando donde cual esta este esto esa ese sobre según sino pero más muy hay son está están fue han sido'.split(' '))
async function relevantMemory(directive, limit = 6) {
  try {
    const words = String(directive || '').toLowerCase().replace(/[^\wáéíóúñ\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 3 && !MEM_STOP.has(w)).slice(0, 8)
    if (!words.length) return []
    const ors = words.map((_, i) => `afirmacion ilike $${i + 2}`).join(' or ')
    const { rows } = await query(
      `select afirmacion, case when origen_task_id is null then 'vos' else 'OS' end as fuente
         from public.conocimiento_empresa
        where vigente = true and (${ors})
        order by veces_confirmado desc, updated_at desc limit $1`,
      [limit, ...words.map((w) => `%${w}%`)])
    return rows.map((r) => `${r.afirmacion} _(${r.fuente})_`)
  } catch { return [] }
}

/** PRP-016 F4: mide y muestra lo APRENDIDO del dueño (owner-taught) — cuántos hechos,
 *  por área, y cuándo fue el último. Determinístico (0 API): así el dueño puede auditar
 *  qué "sabe" el OS de su empresa y ver el interés compuesto del aprendizaje. */
async function learnedSummary() {
  try {
    const { rows } = await query(
      `select area, afirmacion, veces_confirmado, updated_at
         from public.conocimiento_empresa
        where vigente = true and origen_task_id is null
        order by updated_at desc`)
    const total = rows.length
    if (!total) {
      return 'Todavía no aprendí ningún hecho durable de la empresa.\n\nEnseñame cosas y las voy a recordar y usar en próximas respuestas: "recordá que el margen objetivo es 18%", o corregime en pleno trabajo ("ojo que el proveedor de hierro es X") y lo guardo solo. Cada hecho me hace preguntar menos y gastar menos API.'
    }
    const byArea = {}
    for (const r of rows) byArea[r.area || 'general'] = (byArea[r.area || 'general'] || 0) + 1
    const areasLine = Object.entries(byArea).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} (${n})`).join(', ')
    const recientes = rows.slice(0, 5).map((r) => `• ${String(r.afirmacion).slice(0, 140)}`).join('\n')
    const confirmados = rows.filter((r) => (r.veces_confirmado || 0) > 0).length
    return [
      `Sé **${total}** ${total === 1 ? 'hecho durable' : 'hechos durables'} de la empresa que me enseñaste.`,
      `Por área: ${areasLine}.`,
      confirmados ? `Reconfirmados al menos una vez: ${confirmados}.` : null,
      '',
      'Lo más reciente:',
      recientes,
      '',
      'Todo esto lo uso solo en cada respuesta (no vuelvo a preguntarlo). Si algo cambió, corregime y lo actualizo.',
    ].filter((l) => l !== null).join('\n')
  } catch (e) {
    return `No pude leer lo aprendido: ${String(e?.message ?? e).slice(0, 160)}`
  }
}

/** Da formato legible a la salida estructurada de un especialista (analysis + recos). */
function formatSpecialistResult(result, who) {
  if (!result || typeof result !== 'object') return String(result || 'Sin resultado.')
  const parts = []
  if (result.analysis) parts.push(String(result.analysis))
  if (Array.isArray(result.recommendations) && result.recommendations.length) parts.push('\n**Recomendaciones:**\n' + result.recommendations.map((r) => '• ' + (typeof r === 'string' ? r : r.text || JSON.stringify(r))).join('\n'))
  if (Array.isArray(result.approval_requests) && result.approval_requests.length) parts.push('\n**Requiere tu aprobación:** ' + result.approval_requests.map((a) => a.titulo || a).join('; '))
  return parts.join('\n') || 'Trabajo completado (sin salida estructurada).'
}

/** F1: despacha una directiva al AGENTE durable real del Work Fabric (creado por el
 *  Director para respetar el invariante) y espera su resultado. Tarda (razona hondo en
 *  el worker); por eso solo se invoca en pedidos explícitamente profundos. */
async function dispatchToSpecialist({ directive, capability, runId }) {
  const { agent } = await route({ tenantId: CTX.context.tenantId, capabilitySlug: capability })
  const agentSlug = agent?.slug || null
  const who = agent?.org_title || agent?.role || agentSlug || 'especialista'
  progressPush(runId, `Derivando al ${who}`)
  const taskId = await enqueueTask({
    tenant_id: CTX.context.tenantId, type: 'specialist', title: directive.slice(0, 120),
    capability_slug: capability, agent_slug: agentSlug, created_by: DIRECTOR_PRINCIPAL,
    inputs: { directive, from: 'interactive' }, dedupe_key: `chat-spec:${runId}:${Date.now()}`,
  })
  for (let i = 0; i < 90; i++) { // hasta ~6 min
    await new Promise((r) => setTimeout(r, 4000))
    const { rows } = await query('select state, result, error from orq.tasks where id = $1', [taskId])
    const t = rows[0]
    progressPush(runId, `El ${who} está trabajando… (${t?.state || '?'})`)
    if (t?.state === 'succeeded') return { answer: formatSpecialistResult(t.result, who), model: `agente:${agentSlug}`, capability, skills: [agentSlug], navigate: null }
    if (t?.state === 'failed' || t?.state === 'dead_letter') return { answer: `No pude completar el trabajo del ${who}: ${String(t?.error || 'error').slice(0, 200)}`, model: `agente:${agentSlug}`, capability, skills: [] }
  }
  return { answer: `El ${who} sigue trabajando; tardó más de lo esperado. Reintentá en un momento.`, model: 'agente', capability, skills: [] }
}

async function ask({ directive, fileId, fast, attachments, attachment, history, runId, userEmail }) {
  // PRP-022 — ROL del usuario. Sin email (extensión actual con token compartido) →
  // super_admin (comportamiento del dueño de hoy, compatible hacia atrás). Con email →
  // se resuelve de usuarios_os. Un 'usuario' no recibe caja/fiscal/costo ni aprueba.
  const rol = userEmail ? (await resolveUsuario(userEmail)).rol || 'no_autorizado' : 'super_admin'
  const denegar = (cap) => ({ answer: `Tu rol (${rol}) no tiene acceso a esto. Pedíselo a Dirección.`, model: 'rol-denegado', capability: 'general', skills: [], navigate: null, denegadoPor: cap })
  if (rol === 'no_autorizado') { progressInit(runId); return { answer: 'Tu cuenta no está autorizada para usar el OS. Pedile a Dirección que te agregue.', model: 'no-autorizado', capability: 'general', skills: [], navigate: null } }
  progressInit(runId)
  // Adjuntos: la extensión ahora manda VARIAS imágenes (attachments[]) — el dueño saca foto a
  // un fajo de facturas y las sube juntas. Compat hacia atrás: si vino el viejo `attachment`
  // singular, lo envolvemos. Cada adjunto → un bloque de visión/documento en el mismo mensaje.
  const atts = Array.isArray(attachments) ? attachments.filter(Boolean) : (attachment ? [attachment] : [])
  const attBlocks = atts.map(attachmentBlock).filter(Boolean)
  const hasAtt = attBlocks.length > 0
  // Intención de escritura SIGUIENDO EL HILO: cuando el dueño responde "a"/"dale"/
  // "la 2"/"hacelo", la intención de escribir vive en el turno ANTERIOR, no en el
  // literal. Antes se miraba solo la directiva actual → un "a" caía como charla
  // trivial (modelo tímido, pocas iteraciones) y el OS reseteaba en vez de ejecutar
  // la opción elegida. Ahora miramos la directiva Y el historial reciente.
  // isWriteIntent vive en ./lib/write-intent.mjs (guard de costo testeable): un falso positivo
  // manda un READ barato a sonnet. Quita participios-dato ("cargado", "registrado") antes de
  // testear, para no confundir un descriptor con una orden ("cargá", "registrá").
  const CONFIRM_RE = /^\s*(s[ií]|dale|ok(ay)?|listo|hacelo|hazlo|aplicalo?|proced[eé]|adelante|confirmo|de una|opci[oó]n\s*)?[\s,.:]*([abc]|[123]|la\s*[123]|el\s*[123]|es[ae]|aquel[la]?)?\s*$/i
  const histText = Array.isArray(history) ? history.slice(-4).map((m) => String(m.text || '')).join('\n') : ''
  // AUTO-MEJORA (0-API, fire-and-forget): si el dueño RECHAZA la respuesta anterior ("no sirve",
  // "sigue mal", "es una mierda"), registrar la señal de fallo para que el OS lo proponga como
  // mejora. Va temprano y no bloquea: captura el rechazo sea cual sea el camino de la respuesta.
  registerRespuestaFallida({ directive, history }).catch(() => {})
  const directiveWrite = isWriteIntent(directive)
  // Confirmación/elección corta ("a", "dale", "la 2") + la charla previa proponía una
  // acción u opciones → el dueño está eligiendo: hay que ACTUAR, no re-preguntar.
  // Ejecutar cuando el dueño CONFIRMA corto ("dale/ok/hacelo") y el turno previo pedía O PROPONÍA
  // una escritura. isWriteIntent(histText) cubre la orden del dueño; isProposedWrite cubre la
  // PROPUESTA del OS ("uso SUMIFS…", "la estrategia es referenciar…") — antes esto no se detectaba
  // y el "dale" iba a haiku sin herramientas → "me propone y no lo hace" (el CF Semanal quedó sin fórmulas).
  const followUpAction = CONFIRM_RE.test(String(directive || '')) && (isWriteIntent(histText) || isProposedWrite(histText))
  const writeIntent = directiveWrite || followUpAction
  // PEDIDO DE ESCRIBIR EN UN DOCUMENTO (Sheet/Doc): verbo de acción + referencia a un
  // documento concreto (pestaña/planilla/rango/celda/URL de Drive) O un archivo abierto.
  // CLAVE: cuando el dueño pide TOCAR una planilla, NINGUNA detección determinística de
  // LECTURA (caja, briefing, cuadro, cartera, avance, libro IVA…) debe contestarle con un
  // texto canned — eso le come el pedido y nunca se aplica el cambio (causa real de "le
  // pido algo y no lo hace / me responde otra cosa"). Estos pedidos se saltean las
  // respuestas de lectura y fluyen al AGENTE, que tiene las tools de Drive. Las escrituras
  // de la app de Pedidos son narrow (no nombran sheet/pestaña) y siguen intactas.
  const docRef = /\b(pesta[ñn]a|solapa|hoja(s)?|sheet|planilla|spreadsheet|celda|rango|columna|fila|tabla(s)?\s+din[aá]mic|drive|documento|gdoc|gsheet)\b/i.test(String(directive || ''))
    || /https?:\/\/[^\s]*(docs\.google|drive\.google)/i.test(String(directive || ''))
  // CONTINUACIÓN de una edición ya en curso: "segui"/"dale" no tienen verbo ni referencia a
  // documento, así que perdían la intención de escritura y se les asignaba el tope de costo de una
  // consulta simple ($0,80) en medio de reescribir una pestaña. Resultado real (2026-07-19): frenó
  // a mitad y dejó la Caja del dueño a medio hacer — peor que no haber empezado. Si el mensaje es
  // una continuación y lo anterior era una edición de documento, la intención se HEREDA.
  const editandoDoc = /\b(pesta[ñn]a|planilla|sheet|celda|rango|columna|fila|documento)\b/i.test(
    (Array.isArray(history) ? history.slice(-4).map((m) => String(m?.text || '')).join(' ') : ''))
  const writeToDocIntent = (writeIntent && (docRef || !!fileId))
    || (esContinuacion(directive) && editandoDoc)
  // PEDIDO DE COMPONER/ENVIAR/REENVIAR UN MAIL: menciona mail/correo + un verbo de envío o un
  // campo de composición (asunto/cuerpo/adjunto/destinatario). Va al MODELO con las tools de
  // Gmail (no a la lectura de mails) y usa sonnet (redactar bien). Cubre el follow-up "el cuerpo
  // del mail…", "con adjunto…" cuando la charla previa ya venía armando un envío. WRITE_RE no
  // trae verbos de mail (mandar/enviar), así que sin esto el envío caía en haiku y se colgaba.
  // Intención de ACCIÓN de mail/agenda (raíces de verbo, robusto al voseo): lógica en el lib
  // chat-intents.mjs, testeada (chat-intents.test) para que este bug no regrese nunca más.
  const mailComposeIntent = isMailComposeIntent(directive, histText)
  const calendarWriteIntent = isCalendarWriteIntent(directive)
  // AGENDA / TAREAS PROGRAMABLES (0-API): "todos los lunes revisá cobranzas", "programá…".
  // El backend (orq.schedules + timer) ya existe; acá se detecta el pedido en lenguaje natural.
  // list/stop se responden determinístico (baratos); CREATE va al modelo con MODO AGENDA para un
  // diálogo que deje la tarea bien definida (alcance/expectativa/cronograma/costo) antes de dejarla
  // corriendo sola. Es la funcionalidad de agenda pedida por el dueño, sin formularios ni código.
  const sched = parseScheduleRequest(directive)
  const scheduleCreateIntent = sched?.action === 'create'
  // Clasificación de dominio (0-API) TEMPRANA: una CONSULTA DE CRITERIO de dominio (finanzas,
  // laboral, ingeniería…) se razona como ESE especialista y con sonnet; y NO debe ser secuestrada
  // por una detección determinística de lectura (ej. "me conviene una obra que paga a 90 días…"
  // lo agarraba la detección de cuadro económico y buscaba una obra "es 18%"). Por eso entra en
  // la compuerta readBlocked de abajo.
  // Se rutea con el CONTEXTO: un "segui" hereda el dominio de lo que se venía hablando en vez de
  // caer a 'general' sin skills (bug real del 2026-07-19: perdía la skill de Sheets a mitad de una edición).
  const textoRuteo = textoParaRutear(directive, history)
  const capabilities = classifyDirectiveMulti(textoRuteo)
  const capability = capabilities[0] || 'general' // principal (para isBudgeting, telemetría)
  const { persona: personaExperta, asesoria: asesoriaProfunda } = personaParaConsulta(capability, directive)
  // COMPUERTA ÚNICA de lectura: NINGUNA respuesta determinística 0-API (avance, caja, briefing,
  // cartera, IVA, cuadro, pedidos, agenda, mails…) debe dispararse cuando el dueño pide una
  // ACCIÓN (editar doc, componer/enviar mail, agendar) o una CONSULTA DE CRITERIO experta. Antes
  // cada detección guardaba solo writeToDocIntent → un "redactá un mail sobre el AVANCE de obra"
  // lo secuestraba la detección de avance. Este bloqueo cubre TODAS de una: fix sistémico.
  const readBlocked = writeToDocIntent || mailComposeIntent || calendarWriteIntent || asesoriaProfunda || !!sched
  // MODELO POR NIVELES (ahorro de API): sonnet (potente, caro) solo cuando hace falta
  // criterio real — escribir, interpretar un adjunto, o presupuestar; haiku (barato,
  // rápido) para consultas simples y de charla. Antes era sonnet-siempre y quemaba
  // crédito hasta en un "hola". `fast === false` fuerza sonnet si el pedido lo pide.
  // CREAR/cotizar un presupuesto (no consultar uno existente) → sonnet + método. isBudgetingIntent
  // vive en ./lib/budget-intent.mjs (guard de costo testeable): exige el VERBO de la acción
  // (cotizá/presupuestar) o un verbo de crear cerca del sustantivo, NO el sustantivo "presupuesto"
  // solo — que aparece en reads ("mostrame el presupuesto", "cuánto cotizamos") y fugaba a sonnet.
  const budgetingKw = isBudgetingIntent(directive)
  // Intención de enseñar/corregir → sonnet, que llama la tool "aprender" de forma confiable
  // (haiku a veces no la invoca). Así la captura automática de correcciones funciona.
  const teachingIntent = /\b(ten[eé] en cuenta|en realidad|ojo que|que quede claro|te corrijo|corrijo|est[aá] mal|te equivocaste|no es as[ií]|acord[aá]te|record[aá]|aprend[eé]|anot[aá])\b/i.test(directive)
  // Investigar-y-guardar (mejores prácticas): necesita web_search + la tool "aprender" de
  // forma confiable → sonnet (haiku a veces no invoca las tools y el aprendizaje se pierde).
  const researchLearnIntent = /\b(mejores?\s+pr[aá]cticas|best\s+practices|investig|research)\b/i.test(directive)
    || (/\bbusc[aá]\b.*\b(internet|web|online)\b/i.test(directive) && /\b(guard|aprend|anot|record)\b/i.test(directive))
  // Si hay un ARCHIVO ABIERTO (fileId), el dueño casi siempre quiere TRABAJAR sobre él
  // (reordenar, completar, rehacer, analizar a fondo) → sonnet, que lee y ACTÚA con las
  // tools de forma confiable. haiku propone/pregunta en vez de ejecutar (causa real de
  // "le pido que haga algo y no lo hace"). Vale el costo: la acción tiene que salir.
  let model = writeIntent || mailComposeIntent || calendarWriteIntent || hasAtt || budgetingKw || teachingIntent || researchLearnIntent || asesoriaProfunda || scheduleCreateIntent || fast === false || fileId ? 'sonnet' : 'haiku'
  // TOPE DE GASTO (degrada, NUNCA bloquea): si el gasto de hoy pasó el umbral, un pedido
  // que iba a usar sonnet baja a haiku. La respuesta SIEMPRE llega — solo cambia el modelo.
  // Las respuestas determinísticas (0 API) ya devolvieron antes; nunca pagan esto.
  const presupuesto = await estadoPresupuesto(COST.total).catch(() => ({ modo: 'normal' }))
  let degradadoPorCosto = false
  // EXCEPCIÓN: NO degradar a haiku cuando el dueño está EDITANDO un documento (writeToDocIntent,
  // archivo abierto o adjunto). Ese trabajo NECESITA sonnet para salir bien; bajarlo a haiku lo
  // rompe (más iteraciones fallidas = MÁS gasto y peor resultado). Degradar solo consultas/charla.
  // asesoriaProfunda entra acá a propósito: una CONSULTA DE CRITERIO de dominio es donde el
  // dueño MÁS quiere el cerebro experto (sonnet). Son pocas y valen el costo; no se degradan a
  // haiku aunque el día esté sobre el tope. Los lookups y la charla sí se degradan (baratos).
  const tareaCritica = writeToDocIntent || hasAtt || !!fileId || mailComposeIntent || calendarWriteIntent || asesoriaProfunda || scheduleCreateIntent
  // La edición de documentos NUNCA se degrada a haiku: haiku la ROMPE (no hace pivots, no
  // formatea) y el dueño termina con una tabla a medias — peor que gastar. El gasto se controla
  // ahora por el lado correcto: contexto acotado (tope de tool_result) + tope de costo por
  // tarea, que dejan una edición en centavos. Solo se degrada lo NO crítico (charla/consulta).
  if (model === 'sonnet' && !tareaCritica && degradarModeloOnDemand(presupuesto.modo)) { model = 'haiku'; degradadoPorCosto = true }
  // MOTIVO de la elección de modelo (telemetría de costo — se persiste en chat_cost). Distingue,
  // sobre todo, el ADJUNTO de LECTURA (chequear "¿está cargado?", candidato a haiku) del ADJUNTO
  // de ESCRITURA (cargar el gasto, necesita sonnet). Así "sum(usd) by motivo" dice qué mover.
  const motivoModelo = degradadoPorCosto ? 'degradado'
    : model === 'haiku' ? 'simple'
      : hasAtt ? (writeIntent ? 'adjunto_escritura' : 'adjunto_lectura')
        : writeToDocIntent ? 'escritura_sheet' : writeIntent ? 'escritura' : fileId ? 'archivo_abierto'
          : budgetingKw ? 'presupuesto' : asesoriaProfunda ? 'criterio' : mailComposeIntent ? 'mail'
            : teachingIntent ? 'ensenar' : researchLearnIntent ? 'investigar' : scheduleCreateIntent ? 'agenda'
              : fast === false ? 'fast_off' : 'otro'
  // DEGRADACIÓN CON GRACIA (24/07): si el razonador está SIN CRÉDITO, no tiramos un error — llegamos
  // acá sólo cuando el pedido necesita el LLM (las capacidades 0-API ya respondieron antes). Le damos
  // lo mejor que se puede calcular solo (el briefing ejecutivo determinístico) con un aviso claro. El
  // OS sigue operando; el razonamiento libre vuelve solo cuando vuelve el crédito. Ver estado-cerebro.
  if (!(await cerebroDisponible()).disponible) {
    const brief = await briefingEjecutivo().catch(() => '')
    const aviso = '⚠️ **El razonador está sin crédito ahora**, así que no puedo redactar/analizar libremente en este momento. Te dejo lo que el OS calcula solo — la caja, los vencimientos y lo que detectó — y el razonamiento vuelve apenas se reponga el crédito.'
    return { answer: brief ? `${aviso}\n\n---\n\n${brief}` : aviso, model: 'sin-credito', capability: 'general', skills: [], navigate: null }
  }
  const engine = resolveEngine('anthropic-api')

  // Fase 3: rutear al especialista correcto. Clasificamos la directiva a un dominio
  // e inyectamos SUS skills (mismo skill-map que el worker). Si es general, el
  // asistente administrativo de siempre. Si falla la clasificación, degrada a general.
  // Multi-dominio: un pedido puede cruzar varias skills (cotizar = costos + ingeniería +
  // legal + finanzas). Activamos TODAS las que correspondan, acotado a 4 por costo/prompt.
  // Editar un documento NO necesita las skills de DOMINIO (finanzas, impuestos…) — sólo inflan.
  // PERO editar un SHEET SÍ necesita la skill EXPERTA DE SHEETS (google-sheets-business-systems:
  // arquitectura, fórmulas vs. números pegados, tablas dinámicas, no romper celdas combinadas,
  // presentación). Antes la cortaba junto con las de dominio "por ahorro" → editaba SIN criterio
  // de Sheet (reclamo real del dueño: "hay super skill de sheet y le pido algo simple y nada").
  // El system va CACHEADO (cache_control) → esa skill se paga ~una vez, no 26; y el corte por
  // costo + anti-espiral acotan el downside. Un Doc/Word (no Sheet) sigue sin skill.
  const editaDoc = /\b(doc|documento|gdoc|word|carta|memo)\b/i.test(String(directive || ''))
  const skillNames = (writeToDocIntent && !budgetingKw)
    ? (editaDoc ? [] : ['google-sheets-business-systems'])
    // skillsParaDirectiva garantiza que, si se habla de un Sheet/planilla, el criterio de Sheets
    // entre SIEMPRE junto al dominio dueño del dato (regla obligatoria del CLAUDE.md raíz). Antes
    // se perdía: 7 de 8 áreas quedaban sin él porque la capacidad de dominio ganaba la clasificación.
    : capabilities.length
      ? skillsSegunProfundidad(capabilities, textoRuteo, { asesoria: asesoriaProfunda })
      : (mencionaSheet(directive) ? [SKILL_SHEETS] : [])
  // "¿Qué podés hacer?" — respuesta DETERMINÍSTICA (0 API, siempre actualizada): así la
  // extensión refleja las capacidades del cerebro sin reinstalarse y sin gastar crédito.
  if (/^\s*(qu[eé] pod[eé]s hacer|qu[eé] sab[eé]s hacer|ayuda\b|help\b|para qu[eé] serv|qu[eé] (te )?puedo pedir|capacidades|qu[eé] hac[eé]s)/i.test(directive)) {
    return { answer: CAPABILITIES_HELP, model: 'ayuda', capability: 'general', skills: [], navigate: null }
  }
  // "¿Cuánto gasté en API/chat?" — telemetría de costo del chat, sin llamar a la API.
  // OJO: exige un CONTEXTO de costo (api/crédito/chat/token/plata/gastando) — antes los verbos
  // genéricos "llev"/"va" + contexto OPCIONAL secuestraban preguntas reales ("cuánto LLEVamos
  // cobrado", "cuánto VA la obra") y devolvían el reporte de gasto en vez de la respuesta.
  if (/cu[aá]nto (gast[eé]|consum[ií]|cuesta|sale).{0,25}\b(api|cr[eé]dit|chat|token|plata|d[oó]lar|us\$|gastando)\b|gasto de (api|chat|token)|consumo de (api|chat|token)|cu[aá]nto (me )?(sale|cuesta) (el|la|usar) (chat|os|api)/i.test(directive)) {
    if (!puede(rol, 'costo_api')) return denegar('costo_api')
    return { answer: await costSummary(), model: 'costo', capability: 'general', skills: [], navigate: null }
  }
  // AGENDA — LISTAR (0 API): "mis tareas programadas", "qué tengo agendado".
  if (sched?.action === 'list') {
    const items = await listSchedules().catch(() => [])
    if (!items.length) return { answer: 'No tenés ninguna tarea programada todavía. Podés crear una diciéndome, por ejemplo: *"todos los lunes a las 8 revisá cobranzas y avisame"*.', model: 'agenda', capability: 'general', skills: [], navigate: null }
    const linea = (s) => `• ${s.enabled ? '🟢' : '⏸️'} **${s.title}** — ${describeCadence(s.cadence)}${s.enabled ? ` (próxima: ${new Date(s.next_run_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})` : ' — frenada'} · id \`${String(s.id).slice(0, 8)}\``
    return { answer: `**Tareas programadas (${items.length}):**\n${items.map(linea).join('\n')}\n\n_Para frenar una: "pará la tarea de <nombre>"._`, model: 'agenda', capability: 'general', skills: [], navigate: null }
  }
  // AGENDA — FRENAR (0 API): "pará la tarea de cobranzas".
  if (sched?.action === 'stop') {
    const items = await listSchedules().catch(() => [])
    const q = (sched.targetName || '').toLowerCase().trim()
    const match = q ? items.filter((s) => String(s.title || '').toLowerCase().includes(q) || String(s.directive || '').toLowerCase().includes(q)) : []
    if (!q || match.length === 0) return { answer: `¿Cuál tarea querés frenar? Decime el nombre. ${items.length ? 'Tenés: ' + items.map((s) => `*${s.title}*`).join(', ') + '.' : 'No hay tareas programadas.'}`, model: 'agenda', capability: 'general', skills: [], navigate: null }
    if (match.length > 1) return { answer: `Hay varias que coinciden con "${sched.targetName}": ${match.map((s) => `*${s.title}*`).join(', ')}. Decime cuál exacto.`, model: 'agenda', capability: 'general', skills: [], navigate: null }
    await toggleSchedule(match[0].id, false).catch(() => {})
    return { answer: `Frené **${match[0].title}**. Dejó de correr; se puede reactivar cuando quieras.`, model: 'agenda', capability: 'general', skills: [], navigate: null }
  }
  // MEMORIA TOTAL (PRP-023) — "¿qué sabemos de X?" / "¿qué sabés sobre X?" → recupera de
  // TODA la memoria (hechos + hallazgos) por tema (0 API). Va ANTES del resumen de empresa;
  // si el tema es "la empresa/nosotros" se deja pasar a learnedSummary.
  {
    const rec = String(directive).match(/\bqu[eé]\s+(?:sab(?:emos|[eé]s|e el os)|ten(?:emos|[eé]s)|hay|conoc(?:emos|[eé]s))\s+(?:de|sobre|acerca de|respecto a|hay de)\s+(.+)/i)
    if (rec) {
      let tema = rec[1].replace(/\b(la\s+obra|el\s+cliente|la\s+)\b/gi, ' ').replace(/[?¿!¡.]+$/g, '').trim()
      if (!/^(la\s+)?(empresa|nosotros|echegaray|todo)$/i.test(tema) && tema.length >= 2) {
        return { answer: await recallResumen(tema), model: 'memoria', capability: 'general', skills: [], navigate: null }
      }
    }
  }
  // REVISIÓN OPERATIVA (0 API) — "abrí/prepará la revisión operativa de X". Es una capacidad
  // DETERMINÍSTICA: junta hallazgos que ya existen y les pone la estructura. Se resuelve acá y no
  // por el modelo porque en haiku alucinaba un "bloqueo de arquitectura" y no llamaba la tool
  // (medido el 20/07). El modelo sigue teniendo la tool para los casos que no matchean esto.
  if (/\b(revisi[oó]n\s+operativa|operating\s+review)\b/i.test(directive)) {
    const areaRev = areaMencionada(directive)
    if (areaRev) {
      const rev = await abrirReview({ area: areaRev }).catch((e) => ({ error: String(e?.message ?? e) }))
      if (!rev.error) {
        return { answer: formatReview(rev), model: 'review', capability: 'general', skills: [], navigate: null }
      }
    }
  }
  // BIBLIOTECA POR ÁREA (0 API) — si la pregunta NOMBRA una de las 8 áreas, la respuesta es la
  // biblioteca de ESA área, no el volcado general de lo aprendido. Va ANTES de learnedSummary:
  // "¿qué sabés del área de personas?" caía en el resumen global y contestaba con la taxonomía
  // vieja (defecto real medido el 20/07). areaMencionada() devuelve null si no hay área o si hay
  // más de una, y entonces sigue el camino de siempre.
  if (/\b(qu[eé]\s+(sab[eé]s|sabemos|ten[eé]s|tenemos|hay|le\s+falta|falta)|biblioteca|conocimiento|pendientes?)\b/i.test(directive)) {
    // Si pide ACCIÓN (abrir un review, preparar una reunión, decidir), NO se contesta con la
    // biblioteca: eso lo resuelve el modelo con las tools. La biblioteca es sólo lectura.
    const areaClave = pideAccion(directive) ? null : areaMencionada(directive)
    if (areaClave) {
      const r = await bibliotecaArea(areaClave)
      return { answer: formatBiblioteca(r), model: 'biblioteca', capability: 'general', skills: [], navigate: null }
    }
  }
  // "¿Cuánto aprendiste / qué sabés de la empresa?" — mide el aprendizaje (0 API).
  if (/\b(cu[aá]nto (aprend|sab[eé]s)|qu[eé] (aprendiste|sab[eé]s|ten[eé]s (guardado|aprendido|anotado))|qu[eé] (cosas )?record[aá]s|qu[eé] conoc[eé]s de (la empresa|nosotros|echegaray)|hechos (aprendidos|que sab[eé]s))/i.test(directive)) {
    return { answer: await learnedSummary(), model: 'aprendizaje', capability: 'general', skills: [], navigate: null }
  }
  // AUTO-MEJORA (0 API) — "en qué puedo/podés mejorar", "propuestas de mejora", "tus gaps/huecos",
  // "en qué mejorar el OS", "mejorate". Lista lo que el OS ya detectó solo (backlog_autonomo).
  // Meta/interno → gateado a Dirección (mismo criterio que la telemetría de costo).
  if (!readBlocked && /\b(propuestas?\s+de\s+mejora|en\s+qu[eé]\s+(pod[eé]s|puedo|podemos|te\s+puedo\s+ayudar\s+a)?\s*mejorar|qu[eé]\s+(pod[eé]s|puedo|podemos|hay\s+para)\s+mejorar|mejorar\s+el\s+os|tus\s+(gaps|huecos|falencias|fallas)|en\s+qu[eé]\s+fall[aá]s|qu[eé]\s+te\s+falta\s+mejorar|mejorate|auto\s*mejora)\b/i.test(directive)) {
    if (!puede(rol, 'costo_api')) return denegar('costo_api')
    return { answer: await propuestasMejoraResumen(), model: 'auto-mejora', capability: 'general', skills: [], navigate: null }
  }
  // AGENDA (Calendar) — respuesta determinística (0 API modelo): "agenda", "qué tengo hoy/
  // esta semana", "mi calendario", "próximos eventos/reuniones". Lee Google Calendar del usuario.
  if (!readBlocked && !calendarWriteIntent
      && /\b(agenda|calendario|qu[eé]\s+tengo\s+(hoy|esta\s+semana|ma[ñn]ana|programad)|pr[oó]xim[oa]s?\s+(eventos?|reuniones?|citas?)|reuniones?\s+(de\s+)?(hoy|esta\s+semana|la\s+semana)|qu[eé]\s+hay\s+en\s+(mi\s+)?(agenda|calendario))/i.test(directive)) {
    const days = /\bhoy\b/i.test(directive) ? 1 : /ma[ñn]ana/i.test(directive) ? 2 : /\bmes\b/i.test(directive) ? 30 : 7
    return { answer: await agendaResumen(userEmail, { days }), model: 'agenda', capability: 'advise.general', skills: [], navigate: null }
  }
  // MAILS (Gmail) — respuesta determinística (0 API modelo): "mis mails/correos", "mails sin
  // leer / de hoy". Lee Gmail (solo lectura). GUARDA con mailComposeIntent (def arriba): un
  // pedido de COMPONER/enviar/reenviar un mail NO se secuestra acá — va al modelo con las tools.
  if (!readBlocked && !mailComposeIntent && /\b(mis\s+)?(mails?|correos?|emails?)\b/i.test(directive) && !/\b(envi|mand|reenvi|respond|redact|escrib|adjunt)/i.test(directive)) {
    const sinLeer = /\bsin\s+leer|no\s+le[ií]dos?|unread\b/i.test(directive)
    const query = sinLeer ? 'is:unread in:inbox' : /\bhoy\b/i.test(directive) ? 'in:inbox newer_than:1d' : 'in:inbox newer_than:3d'
    const titulo = sinLeer ? 'Mails sin leer' : /\bhoy\b/i.test(directive) ? 'Mails de hoy' : 'Mails recientes'
    return { answer: await mailsResumen(userEmail, { query, titulo }), model: 'mails', capability: 'advise.general', skills: [], navigate: null }
  }
  // PEDIDOS DE MATERIALES (Plan 2 — AppSheet) — respuesta determinística (0 API) desde el
  // espejo public.pedidos_materiales. "pedidos de materiales", "qué se pidió", "pedidos
  // pendientes de la obra X". Dato operativo de obra → accesible también al rol 'usuario'.
  // Ojo: sin \b final — un token que termina en vocal acentuada (marcá, agregá, pasá) no
  // tiene frontera de palabra ASCII antes del espacio siguiente, y el \b lo rompería.
  const pedidoEstadoIntent = /\b(marc[aá]|cambi[aá]|actualiz[aá]|pas[aá]|pon[eé])/i.test(directive)
    && /\bpedido\b/i.test(directive)
  // Alta: verbo de agregar + una obra, excluyendo contextos de Drive/planilla para no pisar
  // "agregá una fila al Sheet de Compras".
  const pedidoAltaIntent = /\b(agreg[aá]|a[ñn]ad[ií]|carg[aá]|nuevo\s+pedido)/i.test(directive)
    && /(pedido|para\s+(la\s+)?obra)/i.test(directive)
    && !/\b(fila|columna|celda|sheet|planilla|hoja|drive|archivo|compras?|cash|caja|presupuesto)\b/i.test(directive)
  const pedidoWriteIntent = pedidoEstadoIntent || pedidoAltaIntent
  // ESCRITURA de la app de Pedidos (AppSheet) — DETERMINÍSTICO (0 API, fiable: no depende de
  // que el modelo llame la tool). Encola la operación en Pendientes (appsheet.write =
  // requires_approval); recién al aprobar se escribe en el Sheet y lo ve el campo.
  if (pedidoWriteIntent) {
    const encolarPedido = async (tool, args, resumen) => {
      const opId = await enqueuePendingOperation({
        tenantId: CTX.context.tenantId, agentSlug: 'interactive', capability_slug: 'appsheet.write',
        account: 'ecsas', target: { app: 'Pedidos de Materiales' }, payload: { tool, args },
      })
      return { answer: `${resumen}\n\nQuedó en **Pendientes** para tu aprobación (id \`${opId}\`). Cuando lo apruebes se escribe en la app y lo ve el campo.`, model: 'appsheet-write', capability: 'appsheet.write', skills: [], navigate: null }
    }
    // Cambio de estado: "marcá el pedido 3 como entregado".
    const mNum = directive.match(/pedido\s+(?:n[°º.]?\s*)?(\d+)/i)
    let estado = /entregad/i.test(directive) ? 'ENTREGADO' : /pendiente/i.test(directive) ? 'PENDIENTE' : (directive.match(/\bcomo\s+([\wáéíóúñ]+)/i)?.[1] || '').toUpperCase()
    if (mNum && estado) return await encolarPedido('appsheet_pedido_estado', { id_pedido: mNum[1], estado }, `Pedido ${mNum[1]} → **${estado}**.`)
    // Alta: "agregá 10 bolsas de cemento para la obra Galpones". Se ancla en "para" para no
    // partir el material por el "de" de la unidad ("bolsas DE cemento").
    const mCant = directive.match(/(\d+(?:[.,]\d+)?)\s+(.+?)\s+para\s+(?:la\s+)?(?:obra\s+)?([\wáéíóúñ][\wáéíóúñ .\-]{1,30})/i)
    if (mCant) {
      const cant = Number(mCant[1].replace(',', '.'))
      const material = mCant[2].trim()
      const obra = mCant[3].replace(/[?¿!¡.]+$/g, '').trim()
      return await encolarPedido('appsheet_pedido_nuevo', { obra, material, cantidad: cant }, `Nuevo pedido: ${cant} ${material} para ${obra}.`)
    }
    return { answer: 'Puedo modificar la app de pedidos, pero necesito el dato claro. Ejemplos: **"marcá el pedido 3 como entregado"** · **"agregá 10 bolsas de cemento para la obra Galpones"**. Todo cae en Pendientes para tu OK antes de tocar la app.', model: 'appsheet-write', capability: 'appsheet.write', skills: [], navigate: null }
  }
  if (!pedidoWriteIntent && !readBlocked
      && (/\bpedidos?\s+(de\s+)?(materiales?|obra|la\s+obra)\b|\bmateriales?\s+pedidos?\b|\bpedidos?\s+pendientes?\b|\bqu[eé]\s+(se\s+)?pidi[oó]/i.test(directive))) {
    const soloPendientes = /\bpendientes?\b/i.test(directive)
    const mo = String(directive).match(/\b(?:de\s+la\s+obra|obra|para)\s+([\wáéíóúñ][\wáéíóúñ .\-]{1,30})/i)
    let obra = (mo?.[1] || '').replace(/^(la\s+)?obra\s+/i, '').replace(/^la\s+/i, '').replace(/\b(pendientes?|materiales?)\b/gi, '').replace(/[?¿!¡.]+$/g, '').trim()
    if (/^(materiales?|pendientes?)?$/i.test(obra)) obra = ''
    return { answer: await pedidosResumen({ obra: obra || null, soloPendientes }), model: 'pedidos-mat', capability: 'advise.site', skills: [], navigate: null }
  }
  // LIBRO IVA (Plan 1 F1 — ARCA) — respuesta determinística (0 API) desde los comprobantes
  // reales extraídos de ARCA. "libro iva", "iva de junio", "cuánto iva pagamos", "posición
  // de iva", "comprobantes recibidos/emitidos". Sensible (fiscal) → un 'usuario' no accede.
  {
    const pideIva = !readBlocked && (/\blibro\s+iva\b|\biva\b.*\b(mes|per[ií]odo|junio|mayo|abril|marzo|febrero|enero|julio|agosto|septiembre|octubre|noviembre|diciembre|\d{4}|pag|deb[ií]to|cr[eé]dito|posici[oó]n|ventas|compras)|\b(posici[oó]n|d[eé]bito|cr[eé]dito)\s+(de\s+)?iva|\bcu[aá]nto\s+iva\b|comprobantes?\s+(recibidos|emitidos|de\s+arca|arca)/i.test(directive))
    if (pideIva) {
      if (!puede(rol, 'fiscal')) return denegar('fiscal')
      const per = parsePeriodo(directive)
      let tipo = null
      if (/\b(compras?|recibidos)\b/i.test(directive) && !/\bventas?\b/i.test(directive)) tipo = 'R'
      else if (/\b(ventas?|emitidos)\b/i.test(directive) && !/\bcompras?\b/i.test(directive)) tipo = 'E'
      let ans = await libroIvaResumen(per, tipo)
      // Si preguntó por compras / recibidos, sumo la señal de comprobantes sin registrar.
      if ((tipo === 'R' || /sin\s+registrar|faltan?|no\s+registrad|conciliar|cruce|cruz[aá]/i.test(directive)) && per) {
        const cr = await comprobantesSinRegistrar(per)
        if (cr.total && cr.sinMatch.length) {
          const top = cr.sinMatch.slice(0, 8).map((c) => `- ${c.emisor_nombre || c.emisor_cuit} — ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(c.imp_total))}`).join('\n')
          ans += `\n\n**Posibles comprobantes sin registrar** (heurística por nombre de proveedor, no es un hecho): ${cr.sinMatch.length} de ${cr.total} comprobantes de compra de ARCA no encuentran un proveedor con costo cargado en el OS.\n${top}${cr.sinMatch.length > 8 ? `\n_…y ${cr.sinMatch.length - 8} más._` : ''}\n\n_Para confirmar hace falta cargar el CUIT en proveedores; hoy el match es por nombre aproximado._`
        }
      }
      return { answer: ans, model: 'libro-iva', capability: 'advise.tax', skills: [], navigate: null }
    }
  }
  // CONCILIACIÓN DE PROVEEDORES con ARCA (Plan 1 F1) — "conciliá proveedores con arca",
  // "proveedores de arca", "qué proveedores faltan dar de alta". Determinístico (0 API):
  // propone completar CUIT / dar de alta, NO escribe. Sensible (fiscal) → 'usuario' denegado.
  if (!readBlocked && /(concili[aá]|complet[aá]|carg[aá]).*(proveedor|cuit).*(arca|afip)|proveedor(es)?\s+(de\s+)?(arca|afip)|proveedor(es)?\s+(sin|para)\s+(registrar|dar de alta|alta)|qu[eé]\s+proveedor(es)?\s+(faltan?|no\s+(est[aá]n|tengo|tenemos))/i.test(directive)) {
    if (!puede(rol, 'fiscal')) return denegar('fiscal')
    const c = await conciliarProveedoresArca()
    const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n || 0))
    const out = [`## Conciliación de proveedores con ARCA`, `De ${c.emisores} emisores en tus comprobantes de compra de ARCA:`]
    out.push(`- **${c.conCuit.length}** ya tienen CUIT cargado en el OS (conciliados por hecho).`)
    out.push(`- **${c.candidatosCuit.length}** matchean un proveedor existente por nombre → falta cargarles el CUIT.`)
    out.push(`- **${c.candidatosAlta.length}** no existen como proveedor en el OS → candidatos a dar de alta.`)
    if (c.candidatosAlta.length) {
      out.push('', '**Candidatos a dar de alta** (mayor gasto primero):')
      out.push(...c.candidatosAlta.slice(0, 12).map((e) => `- ${e.nombre} — CUIT ${e.emisor_cuit} — ${e.n} comprob., ${money(e.tot)}`))
      if (c.candidatosAlta.length > 12) out.push(`_…y ${c.candidatosAlta.length - 12} más._`)
    }
    if (c.candidatosCuit.length) {
      out.push('', '**Proveedores existentes a los que les falta el CUIT:**')
      out.push(...c.candidatosCuit.slice(0, 10).map((e) => `- ${e.proveedor} ← ARCA: ${e.nombre} (CUIT ${e.emisor_cuit})`))
    }
    out.push('', '_Propuesta, no aplicada: no asigno un CUIT ni doy de alta un proveedor por parecido de nombre (sería fabricar dato). Decime "dá de alta / cargá el CUIT de X" y lo hago con tu OK._')
    return { answer: out.join('\n'), model: 'conciliar-prov', capability: 'advise.tax', skills: [], navigate: null }
  }
  // CAJA — PROYECCIÓN (PRP-021 F2): "proyección/proyectá la caja", "cómo viene la caja",
  // "alcanza la caja", "flujo/cash proyectado" → saldo hoy + semanas + gap (0 API, percibido).
  if (!readBlocked
      && /\b(proyecci[oó]n|proyect[aá]|alcanza|va a alcanzar|c[oó]mo (viene|va a venir)|flujo (de caja )?proyect|cash ?flow proyect|saldo proyect)/i.test(directive)
      && /\b(caja|flujo|cash|saldo|plata|fondos)\b/i.test(directive)) {
    if (!puede(rol, 'caja')) return denegar('caja')
    return { answer: await proyeccionCajaResumen(), model: 'caja-proyeccion', capability: 'advise.finance', skills: [], navigate: null }
  }
  // CAJA — PRIORIZACIÓN (PRP-021 F1): "qué cobro/pago primero", "priorizá la caja",
  // "qué gestiono de caja" → ranking por impacto (0 API). Va antes del briefing (más específico).
  if (!readBlocked
      && /\b(qu[eé]\s+(cobro|pago|cobr[aá]s|pag[aá]s|gestiono|gestion[aá]s|prioriz)|prioriz[aá].*(caja|cobr|pag)|qu[eé].*(primero).*(cobr|pag|caja)|orden.*(cobr|pag))\b/i.test(directive)
      && /\b(caja|cobr|pag|cobranza|vencid|primero)\b/i.test(directive)) {
    if (!puede(rol, 'caja')) return denegar('caja')
    return { answer: await priorizarCajaResumen(), model: 'caja-prioridad', capability: 'advise.finance', skills: [], navigate: null }
  }
  // BRIEFING EJECUTIVO (0 API) — "¿cómo estamos?" / "resumen" / "qué hay hoy" → foto
  // unificada de caja vencida + desvíos de obra + backlog autónomo (lo que el OS detectó
  // solo). Debe ir ANTES del cuadro económico (más específico) para no ser tapado.
  if (!readBlocked
      && /^\s*(?:d[aá]me\s+|hac[eé]me\s+|quiero\s+)?(?:un\s+)?(briefing|resumen ejecutivo|resumen del d[ií]a|c[oó]mo (estamos|venimos|va todo|anda todo)|qu[eé] (hay|tenemos) (hoy|para hoy)|estado (general|de la empresa)|situaci[oó]n general|poneme al d[ií]a|puesta al d[ií]a)\b/i.test(directive)) {
    return { answer: await briefingEjecutivo(), model: 'briefing', capability: 'general', skills: [], navigate: null }
  }
  // MACRO DE CARTERA (PRP-020) — "cartera", "macro de obras", "portfolio", "estado de la
  // cartera", "todas las obras juntas" → la foto agregada de todas las obras (0 API).
  if (!readBlocked
      && /\b(cartera|portfolio|macro de obras?|estado (de|de la) (cartera|obras)|todas las obras juntas|resumen de (la )?cartera|panorama de obras)\b/i.test(directive)) {
    return { answer: await carteraResumen(), model: 'cartera', capability: 'advise.commercial', skills: [], navigate: null }
  }
  // FICHA DE OBRA (PRP-019) — "ficha de la obra X", "todo de la obra X", "obra X completa"
  // → económico + caja + avance + alertas en una respuesta (0 API). Va antes de avance/cuadro.
  {
    const f = readBlocked ? null : String(directive).match(/(?:ficha|todo|resumen completo|informe completo|panorama)\s+(?:de\s+|sobre\s+)?(?:la\s+)?obra\s+([\wáéíóúñ][\wáéíóúñ .\-]{1,30})|obra\s+([\wáéíóúñ .\-]{2,30})\s+(?:completa|entera|todo)/i)
    if (f) {
      const nombre = (f[1] || f[2] || '').replace(/[?¿!¡.]+$/g, '').trim()
      if (nombre) return { answer: await fichaObra(nombre), model: 'ficha-obra', capability: 'advise.site', skills: [], navigate: null }
    }
  }
  // AVANCE FÍSICO (PRP-017 F4) — lee el archivo real "Avances de Obra" y da el % de
  // actividades completas por obra. Debe ir ANTES del cuadro económico (que captura
  // "cómo va X"). Solo dispara si menciona avance/físico explícitamente.
  {
    const av = readBlocked ? null : String(directive).match(/\bavance(s)?\s+(f[ií]sic|de\s+obra|de\s+la\s+obra|de\s+las\s+obras)|\b(avance|%\s*de\s*avance|porcentaje de avance)\b.*\bobra|\bc[oó]mo\s+va(n)?\s+las\s+obras\b/i)
    if (av) {
      const m = String(directive).match(/avance\s+(?:f[ií]sic[ao]\s+)?(?:de\s+)?(?:la\s+)?(?:obra\s+)?([\wáéíóúñ][\wáéíóúñ .\-]{1,30})?/i)
      let nombre = (m?.[1] || '').replace(/\b(f[ií]sic[ao]|de obra|las obras|obras|obra)\b/gi, '').replace(/[?¿!¡.]+$/g, '').trim()
      return { answer: await avanceResumen(nombre || null), model: 'avance-fisico', capability: 'advise.site', skills: [], navigate: null }
    }
  }
  // CUADRO ECONÓMICO POR OBRA (PRP-017) — respuesta determinística (0 API) que ensambla
  // contratado↔presupuesto↔costo real↔adicionales con margen y desvío, desde Supabase.
  // "cuadro económico" / "cómo va (la obra) X (económicamente)" / "margen/situación de X".
  {
    const econ = readBlocked ? null : String(directive).match(
      /(?:cuadro\s+econ[oó]mico|situaci[oó]n\s+econ[oó]mica|resultado\s+econ[oó]mico|c[oó]mo\s+(?:va|viene|est[aá]|anda)\b|margen|desv[ií]o|rentabilidad|gan(?:amos|ancia|é))\s*(?:de\s+|en\s+|la\s+obra\s+|de\s+la\s+obra\s+|econ[oó]mic[ao]?\s+(?:de\s+)?)?([\wáéíóúñ][\wáéíóúñ .\-]{1,40})?/i,
    )
    const mentionsObra = /\bobra(s)?\b|cuadro\s+econ[oó]mico|econ[oó]mic/i.test(directive)
    if (econ && mentionsObra) {
      let nombre = (econ[1] || '').trim()
        .replace(/\b(econ[oó]mic[ao]?(mente)?|financier[ao]?(mente)?|la obra|de la obra|hoy|ahora|va|viene|anda|est[aá])\b/gi, '')
        .replace(/[?¿!¡.]+$/g, '').trim()
      // "todas las obras" / "mis obras" / "las obras" → resumen de todas (nombre vacío).
      if (/^((tod[ao]s?|l[ao]s?|mis?)\s+)*obras?$/i.test(nombre) || /^tod[ao]s?$/i.test(nombre)) nombre = ''
      // Obra ACTIVA no cargada en el maestro económico (decisión: solo operativo por ahora):
      // en vez de "no encontré la obra", devolver la vista operativa (avance + pedidos).
      if (nombre) {
        const enMaestro = (await findObras(nombre).catch(() => [])).length > 0
        if (!enMaestro && (await esObraOperativa(nombre).catch(() => false))) {
          return { answer: await estadoOperativoObra(nombre), model: 'obra-operativa', capability: 'advise.site', skills: [], navigate: null }
        }
      }
      return { answer: await cuadroEconomico(nombre || null), model: 'obra-econ', capability: 'advise.finance', skills: [], navigate: null }
    }
  }
  // APRENDIZAJE (PRP-016): "recordá/aprendé/acordate/anotá que X" → guarda el hecho y lo
  // usará en próximas respuestas. Sin llamar a la API (0 costo) — pura captura.
  // Saca el verbo gatillo Y el relleno ("en tu/la memoria", "esto", "lo siguiente") para que
  // el hecho guardado quede autocontenido y prolijo (no "en tu memoria que al proveedor…").
  const learn = String(directive).match(/^\s*(?:record[aá]|aprend[eé]|acord[aá]te|anot[aá]|ten[eé] en cuenta|guard[aá])(?:\s+(?:en\s+(?:tu|la|mi)\s+memoria|esto|lo siguiente))?(?:\s+que)?[\s:,-]+(.{4,})/i)
  if (learn) {
    const hecho = learn[1].trim()
    await saveKnowledge(capability === 'general' ? 'general' : capability.replace('advise.', ''), hecho)
    return { answer: `✅ Anotado, lo voy a recordar y usar: "${hecho.slice(0, 200)}"`, model: 'aprendizaje', capability, skills: [], navigate: null }
  }
  // F1: si el pedido pide trabajo PROFUNDO de un dominio, lo despachamos al AGENTE durable
  // real (tarda, razona en el worker); si no, seguimos con el razonamiento rápido en canal.
  const dispatchDeep = capability !== 'general' && /\b(dictam|informe (complet|t[eé]cnic|detallad)|an[aá]lisis (profund|complet|detallad)|en profundidad|estudi[aá][^.]{0,25}(a fondo|profund)|que (lo|la) (trabaje|analice|estudie|revise) (a fondo|en profundidad|de verdad))\b/i.test(directive)
  // En modo TOPE no despachamos al especialista (caro); respondemos inline con haiku
  // (ya degradado). Nunca se bloquea: el dueño obtiene una respuesta, más económica.
  if (dispatchDeep && !pausarAutonomo(presupuesto.modo)) return await dispatchToSpecialist({ directive, capability, runId })
  // ENFORCEMENT en el CAMINO GENERAL: un 'usuario' que llegó hasta acá con un pedido
  // financiero/fiscal/contable (que esquivó las detecciones permitidas — cuadro de obra,
  // avance, briefing ya respondieron antes) se deniega. Cierra el hueco de sacar caja/costo/
  // fiscal por el razonamiento libre. super_admin pasa.
  if (rol === 'usuario' && capClasificadorSensible(capability)) return denegar(capability)
  // Contexto de PRESUPUESTACIÓN: jornales UOCRA Zona A verificados (jul-2026) + flujo
  // FLEXIBLE (guía, se puede saltear) + disciplina. Solo cuando la directiva es de armar
  // presupuesto/cotizar. Los jornales van acá para que use los vigentes y no los del
  // archivo viejo; si cambian, se actualizan en un solo lugar.
  // Presupuestación detectada por KEYWORDS (no por el clasificador ganador: "jornal"
  // caía en RRHH y respondía con jornales viejos). Los jornales UOCRA verificados se
  // inyectan siempre que el tema toque mano de obra, aunque haya ruteado a RRHH.
  // Misma detección de CREAR presupuesto que el modelo. Antes OR-eaba `capability ===
  // 'advise.estimating'`, pero esa capability la dispara el SUSTANTIVO en un read ("mostrame el
  // presupuesto") → inyectaba el método + UOCRA + desactivaba caché en una simple consulta. Ahora
  // solo cuando hay intención real de crear/cotizar; el read de un presupuesto queda barato.
  const isBudgeting = isBudgetingIntent(directive)

  // ── CEREBRO QUE COMPONE — caché de respuestas (0 API en la repetición) ──────────
  // Solo es cacheable el subconjunto SEGURO: pregunta standalone (sin hilo), sin adjunto,
  // sin archivo fijado, sin intención de escritura/confirmación, sin presupuestación
  // interactiva. Los datos vivos (caja/avance/briefing) ya se respondieron determinístico
  // antes y nunca llegan acá. Si el dueño pide refrescar, se saltea la caché y recalcula.
  const pideRefrescar = /(actualiz|recalcul|de nuevo|otra vez|sin cache|sin cach[eé]|[uú]ltima versi[oó]n|volv[eé] a|de cero|refresc)/i.test(directive)
  const cacheable = !hasAtt && !fileId && !writeIntent && !followUpAction && !isBudgeting
    && !dispatchDeep && !(Array.isArray(history) && history.length) && !pideRefrescar
  if (cacheable) {
    const hit = await cacheGet(rol, directive)
    if (hit) {
      CACHE_STATS.hits++
      progressPush(runId, 'Respondiendo desde la memoria del OS (0 API)')
      const nota = hit.edadMin >= 20 ? `\n\n_↻ Respuesta reutilizada de la memoria del OS (0 API). Si algo cambió, pedime "actualizá"._` : ''
      return { answer: hit.respuesta + nota, model: 'cache', cost: 0, capability, skills: [], navigate: null }
    }
    CACHE_STATS.misses++
  }
  const needsUocra = isBudgeting || /jornal|uocra|categor[ií]a|oficial|ayudante|medio oficial|mano de obra|costo.*(hora|mo)\b/i.test(directive)
  // LA ESCALA SALE DE LA FUENTE, NO DE ESTE TEXTO (26/08/2026). Estaba pegada acá con los valores
  // de JULIO y el rótulo «VIGENTES … VERIFICADO»; la canónica de agosto es 9,1 % más alta, así que
  // todo presupuesto que el chat ayudó a armar este mes subestimó la mano de obra. Un dato dentro de
  // un prompt no da error, no rompe un test y no se entera de que cambió el mes.
  const uocraRates = needsUocra ? bloqueUocra() : ''
  // APRENDIZAJE COMPUESTO (misión): antes de cotizar, traer los desvíos REALES de las
  // obras YA CERRADAS para no repetir el error. Determinístico (0 API). Si Galpones cerró
  // 23% sobre-costo, el presupuestador lo tiene delante al armar una obra parecida.
  let learningBudget = ''
  if (isBudgeting) {
    try {
      // Dos fuentes: aprendizajesPostMortem (RICO: causas + cambio sugerido de cotización, de
      // public.post_mortems) + desviosObras (calculado de costos_reales). Post-mortem primero;
      // dedup por nombre de obra para no repetir. Antes desviosObras NI se importaba → ReferenceError
      // tragado por el catch = la cotización nunca veía el aprendizaje (falla silenciosa, arreglada).
      const [pm, cerradas] = await Promise.all([
        aprendizajesPostMortem().catch(() => []),
        desviosObras({ soloCerradas: true }).catch(() => []),
      ])
      const vistos = new Set(pm.map((s) => String(s).split(' (cerrada')[0].trim().toLowerCase()))
      const items = [...pm, ...cerradas.filter((s) => !vistos.has(String(s).split(' (')[0].trim().toLowerCase()))]
      if (items.length) {
        learningBudget =
          '\n\nAPRENDIZAJE DE OBRAS YA CERRADAS (usalo para NO repetir el error en esta cotización; es dato real, no lo recalcules): ' +
          items.join(' | ') +
          '. Si la obra que estás presupuestando se parece a alguna, avisale al dueño el desvío histórico, ajustá los rendimientos HH y precios según el CAMBIO SUGERIDO, y considerá un colchón en los rubros que se dispararon. Esto es interés compuesto: cada obra cerrada mejora la próxima cotización.'
      }
    } catch { /* si falla, la cotización sigue sin el aprendizaje */ }
  }
  const budgetingContext = uocraRates + learningBudget + (isBudgeting
    ? '\n\nPRESUPUESTACIÓN (método Echegaray) — MODO GUÍA: cuando el dueño quiere ARMAR un presupuesto, LIDERÁ la conversación PASO A PASO. NO pidas todo junto ni tires el presupuesto entero de una. Arrancá confirmando la obra y su alcance/partidas (podés tomarlas de un presupuesto anterior si te lo señala — carpeta PRESUPUESTOS, cada obra tiene su subcarpeta). Después construí PARTIDA POR PARTIDA: para cada una armá el APU (material + desperdicio, MO = rendimiento HH/unidad × costo horario UOCRA Zona A, equipos, subcontrato), mostrá el subtotal, CONFIRMÁ con el dueño y seguí a la próxima. Mantené un TOTAL CORRIENTE visible. Preguntá SOLO lo que necesitás para el paso actual (una cosa a la vez). ' +
      'El FLUJO completo (es GUÍA, el dueño puede saltear pasos): alcance → cómputo → APU por partida → costo directo → gastos generales → beneficio → financiación → impuestos → oferta → control vs histórico. ' +
      'DISCIPLINA: no mezclar costo directo / GG / beneficio / impuestos; MO siempre desde el convenio vigente (Zona A de arriba); dejar el alcance por escrito (para cobrar adicionales). ' +
      'Armá el presupuesto EN EL CHAT con tablas claras (no necesitás una planilla). Si el dueño tiene una planilla nativa compartida y te lo pide, además la completás con drive_batch_update (queda en Pendientes). Si falta un precio de material y no está en los archivos, BUSCALO en internet con web_search (ej. "precio m3 hormigón H21 San Juan 2026") — es precio de REFERENCIA con fuente, a verificar, NUNCA inventes un precio. Para jornales usá los UOCRA Zona A de arriba (ya verificados).'
    : '')
  // Framing conciso SIEMPRE (aunque cargue skills): queremos el CONOCIMIENTO del
  // especialista pero una entrega corta y directa, no el análisis extenso del worker.
  const roleFraming = personaExperta
    ? `Sos ${personaExperta}. Respondé al dueño con tu CRITERIO EXPERTO de ese dominio y datos reales: razoná CON tu conocimiento (no lo recites), distinguí HECHO / ESTIMACIÓN / RECOMENDACIÓN, y si hay un riesgo o una mejor opción, decilo. DIRECTO y CONCISO — al grano, sin relleno ni preámbulo.`
    : 'Sos el asistente operativo del OS de Echegaray Construcciones: respondés directivas del dueño con criterio experto y datos reales, pero DIRECTO y CONCISO — pocas palabras, al grano, sin relleno.'
  const { system, skillsLoaded } = await assembleReasoningSystem({
    rootPath: CTX.context.repository.rootPath, config: cfg,
    roleFraming,
    skillNames: skillNames.length ? skillNames : undefined,
    logger: log,
    // El chat es la vía rápida y sensible a costo: carga el extracto operativo de cada skill
    // (sin las secciones meta/gobernanza), ~22% menos tokens sin perder criterio. El worker
    // de análisis profundo sigue cargando la skill completa.
    compact: true,
  })
  log.info('directiva ruteada', { capability, skills: skillsLoaded || [] })
  const registry = await driveRegistry(atts[0], userEmail)
  // AGENDA: solo cuando el dueño está programando una tarea, sumamos las tools de recurrencia
  // (crear/listar/frenar). Condicional para no inflar el prompt del resto de los pedidos.
  if (scheduleCreateIntent) Object.assign(registry, scheduleTools({ tenantId: CTX.context.tenantId, createdBy: DIRECTOR_PRINCIPAL }))
  const baseExecutor = makeToolExecutor({
    decide, tools: registry, principalId: DIRECTOR_PRINCIPAL, logger: log,
    // Enqueue REAL: una escritura propuesta (drive.write) se registra en
    // orq.pending_operations con su cambio concreto y queda esperando aprobación.
    enqueue: (op) => enqueuePendingOperation({ ...op, tenantId: CTX.context.tenantId, agentSlug: 'interactive' }),
    // RED DE SEGURIDAD: guarda cómo estaba la pestaña ANTES de cada escritura, para poder deshacer.
    // El OS toca planillas reales de la empresa; el 2026-07-19 una edición frenó por tope de costo
    // y dejó la Caja medio reescrita sin forma de volver.
    snapshot: (args) => tomarSnapshot({ ...args, google: registry.__google, directive, runId, logger: log }),
  })
  // Cada tool que el modelo invoca deja un paso legible para el indicador en vivo;
  // si una tool devuelve un destino de navegación (navigate_to), lo capturamos para
  // que la extensión abra ese archivo/carpeta en la pestaña del dueño.
  let navTarget = null
  // Si el modelo TOCÓ el Drive (crear/editar/mover/copiar/subir), la respuesta NO es
  // cacheable: replayarla después no re-ejecutaría el efecto y mentiría diciendo que lo hizo.
  let didWrite = false
  const WRITE_TOOLS = /^(drive_update|drive_append|drive_create|drive_write_doc|drive_batch_update|drive_insert_rows|drive_delete_rows|drive_clear|drive_copy|drive_rename|drive_move|drive_trash|guardar_adjunto_en_drive)$/
  // F5: caché de LECTURAS por-corrida — no releer el mismo rango 7 veces en una edición
  // (costo + 429). Se invalida ante CUALQUIER escritura, así una lectura posterior a un
  // cambio re-consulta. No cambia ninguna respuesta.
  const readCache = crearCacheLecturaPorCorrida()
  const toolExecutor = async (name, input, meta) => {
    if (WRITE_TOOLS.test(String(name))) { didWrite = true; readCache.invalidar() }
    progressPush(runId, friendlyStep(name, input))
    if (readCache.cacheable(name)) {
      const k = readCache.key(name, input)
      if (readCache.has(k)) return readCache.get(k)
      const out = await baseExecutor(name, input, meta)
      if (out && !out.error) readCache.set(k, out) // no cachear errores (429/transitorios)
      if (out && out.navigate && out.navigate.url) navTarget = out.navigate
      return out
    }
    const out = await baseExecutor(name, input, meta)
    if (out && out.navigate && out.navigate.url) navTarget = out.navigate
    return out
  }
  const hoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  // Historial de la charla: seguir el hilo ("aplicá la 2", "hacelo", "y el otro?").
  // Contexto reciente acotado: 8 mensajes (≈4 idas y vueltas) y 800 chars c/u alcanzan para el
  // hilo ("hacelo"/"aplicá eso"). Antes 14×1100 (~4000 tokens) se re-mandaba en CADA pedido:
  // caro y distractivo (turnos viejos hacen divagar). Menos historia = más barato y más enfocado.
  const hist = Array.isArray(history) && history.length
    ? 'CONVERSACIÓN PREVIA (seguí el hilo; "hacelo"/"aplicá eso" se refieren a lo último que propusiste):\n' +
      history.slice(-8).map((m) => `${m.role === 'me' ? 'Dueño' : 'OS'}: ${String(m.text || '').slice(0, 800)}`).join('\n') + '\n\n'
    : ''
  // MEMORIA (PRP-016/023): lo que el dueño enseñó (top, referencia) + lo RELEVANTE al pedido
  // actual (recuperado por tema, de toda la memoria) → el chat "recuerda" lo específico.
  // BIBLIOTECA DEL ÁREA (0 API extra, ~200 tokens cacheables): si el pedido nombra un área, el
  // contexto recibe lo que el OS YA SABE de ella. Antes el conocimiento llegaba sólo por
  // coincidencia de palabras (relevantMemory), así que el CFO podía salir a buscar dónde están
  // los saldos teniéndolo anotado. Esto cierra ese circuito.
  const areaDelPedido = areaMencionada(directive)
  const [known, relevante, bibArea] = await Promise.all([
    ownerTaughtFacts(),
    relevantMemory(directive),
    areaDelPedido ? bibliotecaArea(areaDelPedido).catch(() => null) : Promise.resolve(null),
  ])
  const areaBlock = bibArea ? bloqueContextoArea(bibArea) : ''
  const memoria = [...new Set([...relevante, ...known.map((k) => k + ' _(vos)_')])].slice(0, 12)
  const knownBlock = memoria.length
    ? 'MEMORIA DEL OS (lo que sabés de la empresa; _(vos)_ = te lo enseñó el dueño, _(OS)_ = lo dedujo el OS; usalo si viene al caso, no lo repitas porque sí):\n' + memoria.map((k) => '• ' + k).join('\n') + '\n\n'
    : ''
  const threadNudge = followUpAction
    ? 'IMPORTANTE — SEGUÍ EL HILO: el dueño está CONFIRMANDO o ELIGIENDO una opción de lo que propusiste recién (ver CONVERSACIÓN PREVIA). Interpretá "a/b/c", "la 2", "dale", "hacelo", "sí" como esa elección. NO vuelvas a preguntar, NO reinicies, NO respondas un estado genérico: EJECUTÁ ahora esa opción — leé el archivo si hace falta y dejá la operación concreta (drive_update en la fila/rango exacto) en Pendientes, avisando en una línea qué cambio y dónde.\n\n'
    : ''
  // ── P0 (jul-2026) — la edición fallaba por FALTA DE CRITERIO, no por falta de skills ──
  // Los 3 bloques de abajo arreglan los 3 reclamos concretos del dueño (inunda de color /
  // ignora "sin gráficos" / canta "listo" sin verificar) SIN subir el costo de API: son
  // ~400 tokens que se cachean (cache_control ephemeral), muchísimo menos que cargar las
  // 4 SKILL.md completas (~10k tokens), y el tope de costo/iteración por tarea NO se mueve.
  // (1) DOCTRINA DE DISEÑO — destilado operativo de google-sheets-business-systems: da el
  //     criterio que faltaba (sobriedad, jerarquía sin relleno, un dato en un solo lugar).
  const docEditDoctrine = writeToDocIntent ? DOCTRINA_EDICION : ''
  // (2) RESTRICCIONES EXPLÍCITAS — parsear el texto del dueño es GRATIS en API y evita el
  //     re-pedido (que sí cuesta el doble). Ignorar un "sacá los gráficos" es el reclamo #2.
  const restricciones = writeToDocIntent ? extraerRestricciones(directive) : []
  const restriccionesBlock = restricciones.length
    ? '\n\nRESTRICCIONES EXPLÍCITAS DEL DUEÑO (son ÓRDENES; cumplí CADA UNA sí o sí — ignorar una es lo que más lo enoja):\n' + restricciones.map((r) => '• ' + r).join('\n') + '\n'
    : ''
  // (3) VERIFICACIÓN — dentro de la MISMA tarea (mismo tope de iteraciones/costo, no suma
  //     una llamada nueva): releer lo que tocó y corregir antes de cantar "listo".
  const verifBlock = writeToDocIntent ? VERIFICACION_EDICION : ''
  // GUÍA DE MAIL/AGENDA/TAREAS (solo cuando el pedido lo toca): que EJECUTE con las tools, no
  // que tire un preámbulo ni liste mails. Si falta UN dato imprescindible, lo pide en 1 línea.
  const mailGuidance = mailComposeIntent
    ? '\n\nESTÁS COMPONIENDO/ENVIANDO UN MAIL — EJECUTÁ YA, no narres ni listes la bandeja. Con destinatario + asunto + cuerpo, LLAMÁ la tool AHORA: gmail_enviar (envío → Pendientes para su OK) o gmail_borrador (si piden borrador); gmail_responder para responder, gmail_reenviar para reenviar. El asunto y el cuerpo son TEXTO que te da el dueño ("el cuerpo dice X" ⇒ body=X); NO los interpretes como un archivo a buscar. ADJUNTAR es OPCIONAL y SOLO si el dueño lo pide explícitamente ("adjuntá el archivo Y"): ahí buscás Y con drive_find PRIMERO, y pasás el file_id EXACTO que devuelve en "adjuntos". Si NO pidió adjunto, no busques ningún archivo. HONESTIDAD ABSOLUTA CON EL ADJUNTO: NUNCA digas "va con el archivo adjunto" / "adjunto en PDF" si drive_find no te devolvió un file_id real. Si el archivo NO aparece en Drive, NO lo adjuntes y NO afirmes que lo hiciste: decí "no encontré el archivo X" y pedí el nombre exacto. El mail se puede mandar SIN adjunto si el dueño confirma, pero jamás mientas que adjuntaste algo. Preguntá (UNA línea, sin preámbulos ni recitar tu rol) SOLO si falta un dato imprescindible: el destinatario, o —cuando pidieron adjuntar y no aparece— cuál es el archivo. NUNCA respondas "Entendido, estoy listo" ni un resumen de capacidades: o llamás la tool, o hacés esa única pregunta.'
    : ''
  // GUÍA DE REPLICAR MOVIMIENTOS/EXTRACTO BANCARIO EN UNA PESTAÑA (pegados como texto o foto/PDF):
  // capacidad GENERAL, no un parser fijo — el OS LEE la estructura del destino y mapea según lo
  // que esa hoja guarda. Previene el error real: volcar 200 transacciones en un ledger de SALDOS
  // (ej. Caja del Cash Flow, que guarda 1 fila por saldo). 0-API (cacheado), solo cuando aplica.
  const bancoSaldoKw = /\b(movimient|extracto|saldo|banco|santander|galicia|naci[oó]n|acredit|d[eé]bito|cr[eé]dito|conciliaci)\b/i.test(String(directive || '') + ' ' + histText)
  const saldoGuidance = ((writeToDocIntent || hasAtt) && bancoSaldoKw)
    ? '\n\nREPLICAR MOVIMIENTOS/EXTRACTO BANCARIO EN UNA PESTAÑA — LEÉ EL DESTINO ANTES DE ESCRIBIR. (1) Con drive_tabs + drive_read mirá los ENCABEZADOS, las filas de ejemplo y la fila de INSTRUCCIONES de la pestaña destino, y entendé QUÉ guarda. Si es un ledger de SALDOS (columnas tipo Fecha·Cuenta·Saldo·Fuente, "una fila nueva por saldo"): NO vuelques cada transacción — del extracto pegado sacá el SALDO resultante y agregá UNA sola fila nueva. Si fuese una pestaña de movimientos-detalle, ahí sí una fila por transacción. (2) Respetá EXACTO el formato que ya usa esa hoja: fecha DD/MM/YYYY, montos con el mismo estilo ($ y coma decimal si así están), y completá la columna Fuente indicando de dónde salió (ej. "Santander Empresas — pantalla DD/MM/YYYY HH:MMh"). (3) NUNCA inventes un número que no esté en lo que te pegaron; si el saldo no se ve claro, pedilo en UNA línea. (4) Agregá fila NUEVA (drive_last_row → drive_update en la fila vacía), NO edites ni borres las anteriores. La escritura cae en Pendientes para su OK.'
    : ''
  // GUÍA MODO AGENDA — el dueño quiere PROGRAMAR una tarea recurrente. NO la crees de una:
  // primero un diálogo CORTO que la deje BIEN DEFINIDA, y recién ahí llamás programar_tarea.
  const agendaGuidance = scheduleCreateIntent
    ? `\n\nMODO AGENDA — vas a dejar una tarea corriendo SOLA (recurrente). NO la programes hasta que esté BIEN DEFINIDA en estas 4 dimensiones; preguntá SOLO las que falten, UNA por vez, conciso (no interrogues de más si el dueño ya las dio):\n• ALCANCE: qué tiene que hacer exactamente, sobre qué datos/obra/fuente.\n• EXPECTATIVA: qué entrega y CÓMO/A QUIÉN (¿solo mostrarlo en el chat?, ¿mail a quién?, ¿qué formato?). Si va por mail necesitás el destinatario.\n• CRONOGRAMA: cada cuánto y a qué hora (ej. "todos los lunes a las 8"). Si falta la hora, asumí 08:00 y confirmá.\n• COSTO: cada corrida gasta API. Estimá y decilo en una línea: un lookup simple + aviso ≈ US$0.02–0.10/corrida; un análisis pesado ≈ US$0.30–1. Que el dueño sepa el gasto recurrente antes de activarla (regla del OS: nada corre de fondo si no da utilidad clara).\nCuando las 4 estén claras, LLAMÁ programar_tarea con: directiva = la orden COMPLETA y autocontenida (como si se la dieras al OS cada vez, incluyendo a quién avisar), cadencia_texto en palabras, y un titulo corto. Después confirmá en 1–2 líneas qué quedó programado, cuándo corre y el costo estimado. Para ver o frenar tareas ya existen listar_tareas_programadas y frenar_tarea. NADA de efecto externo (mails, pagos) se ejecuta solo: cuando la tarea corra, esas acciones igual caerán en Pendientes.`
    : ''

  // LECTURA vs ESCRITURA. El manual pesado de ESCRIBIR Drive (crear/editar/pivots/formato,
  // ~1500 tokens) sólo sirve cuando el pedido escribe/edita. Para una LECTURA ("cuánto es X",
  // "mis obras", "cheques pendientes a Corralón") mandarlo infla el prompt, lo hace lento, le
  // diluye el "sé conciso" y lo hace divagar. Se manda SOLO cuando hay intención de escribir o
  // un archivo abierto para actuar; la lectura lleva una guía corta. Baja costo y latencia.
  const necesitaEscritura = writeIntent || !!fileId
  const guiaEscritura = necesitaEscritura
    ? `\n\nREGLA DE ORO DEL SHEET (UNIVERSAL, aplica a TODO lo que se pida del Sheet, NUNCA se rompe): todo valor que el dueño NO te dio como dato crudo va como FÓRMULA (=SUM, =SUMIF, =QUERY, =A2*B2, ='Otra Pestaña'!X) o como celda que muestra su ORIGEN — JAMÁS un número calculado por código y pegado. Un total, subtotal, %, promedio, saldo derivado o cualquier dato que venga de otra pestaña SIEMPRE es fórmula o referencia, así queda vivo y trazable. Número tipeado SÓLO si es un dato de origen que te pasó el dueño o que sale de un comprobante/foto (y aun así, la celda debería dejar ver su fuente). Sin excepción. ` +
      `FÓRMULAS SIEMPRE EN FORMATO CANÓNICO (crítico es-AR): escribí las fórmulas con COMA como separador de argumentos y PUNTO como decimal (ej. \`=SUM(A1,A2)\`, \`=G62*1.02\`, \`=ROUND(A1*1.05,2)\`). El OS las LOCALIZA solo al es-AR del sheet (coma→';', punto→','). NO escribas vos el formato es-AR (ni ';' ni decimal con coma) — si escribís \`=G62*1,02\` el sistema lo rompe. Y ojo: \`=G62*1.02\` es 2%; nunca lo escribas como un número entero raro. ` +
      `REGLA DE ORO — CASO DE FALLA (crítico, reclamo real): si una fórmula da #ERROR!/#VALUE! (causa típica: la celda de ORIGEN está guardada como TEXTO — un "$248.000" con formato moneda que en realidad es texto), NUNCA te caigas a PEGAR el número calculado como "para entregar algo" — eso ROMPE la regla. En vez de eso: (a) coercioná el texto DENTRO de la fórmula en formato canónico, ej. \`=VALUE(SUBSTITUTE(SUBSTITUTE(G62,"$",""),".",""))*1.02\` (o \`=IF(ISNUMBER(G62),G62,VALUE(SUBSTITUTE(SUBSTITUTE(G62,"$",""),".","")))*1.02\`); o (b) arreglá la columna de origen para que sea numérica y dejá el formato a la celda. Si aun así no podés formularlo, DECÍLO en una línea ("no pude, G está como texto") — NUNCA pegues el resultado. Y si te estás por cortar por costo, entregá lo que tenga FÓRMULA, jamás un número pegado a último momento. ` +
      `REGLA #1 — EJECUTÁ, NO PROPONGAS NI PREGUNTES: si el dueño te pide HACER algo (rehacer/reordenar/reconstruir/mejorar/completar una planilla o pestaña), NO respondas con un plan ("Propongo…", "Podría…") ni con una pregunta ("¿Querés que…?"). HACELO YA con las tools de escritura (drive_read para ver la estructura → drive_batch_update para aplicar). LAS ESCRITURAS EN SHEET/DOC SE APLICAN AL INSTANTE al llamar la tool — NO hay cola de aprobación para editar una planilla (eso es solo para mail/pagos externos). PROHIBIDO decir "pendiente de tu aprobación", "quedó pendiente de aprobación", o pedir el OK antes de escribir: si el dueño te lo pidió (o dio "dale/ok/hacelo"), LLAMÁ la tool y queda aplicado en su Sheet. Si escribís "ahora ejecuto…" en prosa pero NO llamás la tool, NO pasó NADA — el cambio solo existe si la tool corre.Si te falta UN dato real que no podés inventar (ej. el saldo de hoy), hacé TODO el resto y dejá ESA celda con un placeholder claro ("← cargar saldo Santander"); después, en UNA línea, avisá qué falta. Nunca entregues solo una propuesta cuando se pidió una acción. ` +
      `CÓMO ESCRIBIR SIN ROMPER: (1) drive_tabs para ver las pestañas ("Compras","Caja","Sueldos" son pestañas del MISMO archivo) y drive_read para los encabezados y dónde terminan los datos. (2) Para AGREGAR un registro: drive_last_row(pestaña) → drive_update en "Pestaña!A<next>:…" con la fila en orden de encabezados. NUNCA drive_append con rango abierto "A:M" (rompe fórmulas). (3) No pises columnas que son FÓRMULAS (dejalas vacías o replicá la fórmula). (4) Varios rangos = UN solo drive_batch_update con TODO junto (no decenas de llamadas de una celda). (5) DESPLEGABLES: antes de cargar una fila, corré drive_desplegables(pestaña) para ver qué columnas tienen desplegable con opciones precargadas (Proveedor, Categoría, Unidad, Modalidad, Tipo…). En esas columnas ELEGÍ la opción de la lista que corresponde al dato — NUNCA escribas texto libre ni una opción nueva (rompe la validación): "HORMISERV SRL"→"Hormiserv", "ALVARADO MARIEL EDIT"→"Alvarado Mariel Edith", "FACTURA A"→"F A", "Contado"→"Pago". Si ninguna opción encaja, avisá al dueño que falta esa opción; no la inventes. ACTUÁ, NO NARRES: el cambio sólo ocurre si LLAMÁS la tool; describirlo en prosa NO crea nada. Llamá la tool PRIMERO, y al final UNA línea de resumen. Pestaña nueva: drive_add_tab ANTES de escribirla. ` +
      `CONTROL TOTAL DE DRIVE (actuás COMO el dueño): podés crear/leer/escribir/editar/copiar/mover/renombrar/enviar a papelera cualquier archivo. Tools: drive_create, drive_add_tab, drive_write_doc (+ drive_doc_style_text / drive_doc_replace_text / drive_doc_insert_table para Docs prolijos), drive_batch_update / drive_insert_rows / drive_delete_rows / drive_clear (Sheets), formato con drive_format_cells / drive_table_style / drive_merge_cells / drive_freeze / drive_auto_resize / drive_add_chart / drive_add_pivot, drive_copy, drive_rename, drive_move, drive_trash. Al rehacer una planilla dejala presentable (encabezados en negrita, moneda, freeze, anchos). Lo único que NO hacés es el borrado permanente. ` +
      `COMPONER CON DATOS DEL OS: si te piden ARMAR una tabla/planilla con datos que el OS calcula (ej. IVA con os_iva_posicion_anual), traé los números REALES con la tool, creá/ubicá el Sheet y volcá los valores prolijos. Lo que la tool marca "sin datos" va como "sin datos" — NUNCA lo rellenes. ` +
      `ARMAR/REHACER TABLAS Y PESTAÑAS — REGLA #0 (la más importante, reclamo del dueño): para construir o rehacer contenido de un Sheet, NO vayas celda por celda con drive_update/drive_format_cells/drive_merge_cells (eso son 26 idas y vueltas, quema créditos y queda desalineado). Usá drive_render_tabla: DECLARÁS toda la tabla de una (filas con {t|n|f, estilo, combinar}) y se escribe en UNA sola pasada alineada. Para REHACER UNA PESTAÑA ENTERA: (1) leé TODA la pestaña con drive_read para entender su contenido y estructura completa; (2) armá TODAS las filas de la pestaña (todas las secciones, con las MISMAS columnas alineadas entre secciones); (3) escribila entera con drive_render_tabla(limpiar_pestana:true). Contemplá la pestaña COMPLETA, no un pedazo. Los totales van como {f:"=SUM(...)"}. `
      + `TABLAS DINÁMICAS Y TOTALES — INTELIGENCIA DE SHEET (crítico, es un reclamo del dueño): (a) si piden una TABLA DINÁMICA / "resumen por X" / "total por proveedor/mes/obra" → usá la tool drive_add_pivot sobre el rango de datos (pasá los encabezados y qué agrupar/sumar). NO armes a mano una tabla con números tipeados: eso NO es una tabla dinámica y queda muerto. (b) Todo número que sea el RESULTADO DE UN CÁLCULO (un total, un subtotal, un %, un promedio) va como FÓRMULA que referencia las celdas de origen (=SUM(rango), =SUMIF, =QUERY, =A2*B2), NUNCA como número pegado a mano — así queda vivo y se recalcula. Un número tipeado sólo si es un dato de origen que el dueño te dio. (c) Antes de escribir, mirá con drive_read qué columnas ya son fórmulas y no las pises con valores fijos. Si una operación de FORMATO falla (celdas combinadas, gráfico), salteá ESE paso y seguí — no la repitas.`
    : ''
  const guiaInvestigar = researchLearnIntent
    ? ` INVESTIGAR Y GUARDAR: revisá primero lo que el OS YA SABE ("qué sabés de X", 0 API). Si te piden buscar mejores prácticas: usá web_search, sintetizá lo aplicable a una constructora de San Juan, y GUARDALO con la tool "aprender" (una afirmación durable por práctica, con su área). Guardar no es opcional: si no lo guardás, el OS no se hace más inteligente. PERO GUARDAR NO ES RESPONDER: el dueño hizo una pregunta y espera la respuesta EN PANTALLA. Escribí primero las prácticas completas y aplicadas a su caso, y recién después guardalas. Contestar sólo "Guardado" es una falla: le cobraste una consulta y no le diste nada.`
    : ''

  const prompt =
    `HOY: ${hoy} (San Juan, Argentina). Usá esta fecha; no la inventes.\n\n` +
    areaBlock +
    knownBlock +
    hist +
    threadNudge +
    `DIRECTIVA DEL DUEÑO:\n${directive}\n` +
    restriccionesBlock +
    (fileId ? `\nEstá mirando el archivo de Drive con file_id=${fileId}. Leélo con drive_read si la directiva lo requiere.\n` : '') +
    `\n\nESTILO OBLIGATORIO — CRÍTICO: respondé en español, MUY conciso. ARRANCÁ POR LA RESPUESTA (el dato o el resultado), NUNCA con un preámbulo. PROHIBIDO empezar con "Ahora tengo…", "Tengo todos los datos…", "Perfecto…", "Listo…", "Dale…", "Voy a…", "Ahora armo/filtro/cruzo…", "Del archivo X…" ni ningún relato de tu proceso: eso es lo que más enfurece al dueño. Nada de repetir la pregunta ni cierres de cortesía. Por defecto 1–3 líneas o pocos bullets; una tabla SOLO si te piden un listado. Distinguí hecho/estimación; si falta un dato, decilo en pocas palabras. ` +
    `APRENDÉ: si el dueño te CORRIGE o te enseña un HECHO DURABLE de la empresa (un proveedor clave, un criterio/preferencia, un precio de referencia, un dato estable de una obra/cliente), llamá a la tool "aprender" con ese hecho. NO para acciones puntuales, saldos del día, ni datos que ya están en un archivo. ` +
    `PARA RESPONDER, LEÉ CON LAS TOOLS (no inventes): un Sheet/Excel/PDF con drive_read (drive_tabs primero para ver las pestañas del archivo); tus obras con list_obras + drive_list (viven en la carpeta PRESUPUESTOS) y leé su presupuesto/avance con drive_read; la memoria de la empresa con "qué sabés de X". FILTRÁ: contestá SOLO lo que se pidió (el dato puntual, esa fila, ese proveedor), NO vuelques la planilla entera. Para LLEVAR al dueño a un archivo/carpeta ("llevame a", "abrí", "mostrame X") usá navigate_to. ` +
    guiaEscritura +
    guiaInvestigar +
    (hasAtt
      ? `\n\nTE ADJUNTARON ${attBlocks.length > 1 ? `${attBlocks.length} ARCHIVOS` : 'UN ARCHIVO'} (foto/PDF): interpretá CADA UNO y PRIMERO identificá QUÉ TIPO es, porque define DÓNDE se registra:\n▸ CAPTURA DE SALDO BANCARIO / HOME BANKING / cuenta (dice "saldo", "disponible", nombre de banco, un único importe de cuenta): NO es un gasto. Va a la pestaña **Caja** del Cash Flow (ledger de SALDOS, una fila por saldo) — seguí la guía de saldos: leé el destino, sacá el SALDO y agregá UNA fila (Fecha·Cuenta·Saldo·Fuente). NO lo cargues como compra.\n▸ FACTURA/REMITO/COMPROBANTE de compra: es un GASTO → pestaña de compras. Extraé proveedor, CUIT, fecha, número, neto, IVA, total, concepto. Puede venir MÁS DE UNA factura por imagen Y varias imágenes: procesá TODAS, una por una, e identificá cada una por proveedor+número+importe.\nIMPORTANTE (para no perder el hilo entre turnos): las imágenes NO quedan en la conversación de mensajes siguientes. Así que en ESTE turno, apenas la veas, EXTRAÉ y ESCRIBÍ en tu respuesta los datos clave (proveedor, número, importe/saldo) — así quedan en el hilo y podés seguir trabajando aunque después no tengas la foto. Según lo que pida el dueño:\n• CHEQUEAR si un gasto YA ESTÁ CARGADO ("¿está registrado esto?", "¿dónde está?", "¿ya lo cargué?", "¿está en el flujo de fondos?"): por cada factura extraé proveedor, número e importe y llamá buscar_gasto_en_flujo (busca en el Flujo de Fondos real, pestaña Compras). Si aparece, decí que SÍ está cargado, en qué FILA y con qué OBRA, y PASALE EL LINK directo a esa fila (viene en la respuesta de la tool). Si da 0, decí que NO figura en el Flujo de Fondos. Complemento fiscal: si además pregunta si está facturado/en ARCA, usá buscar_comprobante (comprobantes_arca). NO propongas cargar nada salvo que te lo pidan.\n• REGISTRAR/cargar/corregir el gasto: EJECUTÁ una carga COMPLETA, no preguntes lo que ya está en la factura. Pasos: (1) leé la estructura con drive_read (encabezados, dónde terminan los datos, qué columnas son fórmulas) Y los DESPLEGABLES con drive_desplegables. (2) Extraé de la factura TODOS los campos: proveedor, CUIT, fecha, número, neto, IVA, total, concepto. Si un valor está borroso/no se lee, sacá el que falte de ARCA con buscar_comprobante — NO le pidas al dueño un dato que está en la factura o en ARCA. (3) En columnas con desplegable ELEGÍ la opción de la lista (Proveedor "HORMISERV SRL"→"Hormiserv", Tipo "FACTURA A"→"F A", Modalidad "Contado"→"Pago"/"Cta Cte"→"Cuenta Corriente", Categoría/Unidad según corresponda); si ninguna encaja, avisá, no inventes. (4) Los importes que son CÁLCULO van como FÓRMULA, no número tipeado (Total = neto+IVA → {f:"=M<fila>+N<fila>"}); no pises columnas que ya son fórmula. (5) Respetá el idioma/formato de la planilla (es-AR: moneda "$#.##0,00", separador de miles ".", decimal ","; fechas DD/MM/AAAA). (6) Escribí la fila COMPLETA con drive_update (queda en Pendientes) — dejá en blanco SOLO un campo genuinamente ausente en todos lados, con nota clara; NO frenes a preguntar por algo que podés obtener. Al final, UNA línea de resumen.\nNo inventes lo que no ves; si un dato no está en la imagen, decilo.\n`
      : '') +
    ` Lo que tenga efecto económico/fiscal/legal externo (Nivel E) no lo ejecutes: proponelo en una línea.` +
    docEditDoctrine +
    verifBlock +
    mailGuidance +
    saldoGuidance +
    agendaGuidance +
    budgetingContext +
    (isBudgeting
      ? ' Para presupuestar podés extenderte lo necesario (tablas, partidas, APU) — acá la claridad importa más que la brevedad.'
      : ' Recordá: máxima concisión, sin preámbulo.')

  // Con adjunto, el prompt es un array de bloques (visión/documento + texto). El
  // engine acepta content como array sin cambios.
  const promptContent = hasAtt ? [...attBlocks, { type: 'text', text: prompt }] : prompt

  const eng = await engine.run(
    { system, prompt: promptContent, worktreePath: CTX.context.repository.rootPath, model, maxCostUsd: (writeToDocIntent || (hasAtt && writeIntent)) ? 2.0 : (hasAtt ? 1.5 : 0.8), maxTokens: writeIntent || hasAtt || isBudgeting ? 8192 : 900,
      // Un pedido REAL de cargar/editar una planilla (leer estructura + desplegables + ARCA +
      // escribir la fila) se estaba CORTANDO a mitad por el tope de costo/iteraciones (revisión
      // interna: 15 cortes en 6h) → "no completa el dato". Le damos aire suficiente a esa ruta
      // (escritura o carga con adjunto): tope más alto y más iteraciones. El resto queda ajustado.
      // El breaker anti-espiral + la guía "no preguntes lo que ya está" evitan que el aire se malgaste.
      maxToolIterations: (writeToDocIntent || (hasAtt && writeIntent)) ? 32 : (hasAtt || writeIntent || isBudgeting ? 22 : 10), allowedTools: 'Read',
      task: { id: 'interactive', capability_slug: 'advise.admin' },
      // Etiqueta de telemetría: si esta ruta se CORTA (tope de costo/iteraciones), el engine la
      // loguea junto a qué tools usó → mi rutina interna (revisar-logs) rankea qué operaciones se
      // cortan más, para convertir esas a 0-API (plan de costo/velocidad/eficiencia).
      label: `${capability || 'general'}${hasAtt ? '+adj' : ''}${writeIntent ? '+escr' : ''}:${String(directive || '').replace(/\s+/g, ' ').slice(0, 70)}`,
      tools: Object.values(registry).map((t) => t.schema), toolExecutor, agentSlug: 'interactive' },
    CTX)
  trackCost(eng.cost?.usd ?? 0, model, rol, motivoModelo)
  // PRP-018 F3: si el pedido no lo cubrió ningún dominio y el modelo admitió no poder,
  // registrar el gap (propone capacidad solo ante recurrencia). Fire-and-forget: nunca
  // demora ni rompe la respuesta al dueño.
  registerChatGap({ directive, answer: eng.result, capability }).catch(() => {})
  const respuestaLimpia = stripPreamble(eng.result)
  const answerFinal = degradadoPorCosto
    ? `${respuestaLimpia}\n\n_(Nota: hoy el gasto de API superó el umbral, así que respondí con el modelo económico. Si necesitás el análisis profundo igual, decímelo y lo corro.)_`
    : respuestaLimpia
  // CEREBRO QUE COMPONE: guardar la respuesta para que la próxima pregunta igual salga con
  // 0 API. Solo si era cacheable Y el modelo no escribió en Drive Y no fue una navegación
  // (esos son efectos/one-off que no se deben replayar). Fire-and-forget: nunca demora.
  if (cacheable && !didWrite && !navTarget) cachePut(rol, directive, eng.result, model).catch(() => {})
  return { answer: answerFinal, model, cost: eng.cost?.usd ?? 0, capability, skills: skillsLoaded || [], navigate: navTarget }
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
  // PRP-024 OAuth por usuario — sin auth (el retorno de Google no trae el token del OS).
  // /oauth/start: devuelve la URL de consentimiento. /oauth/exchange: canjea el code y
  // guarda el refresh_token (lo llama el callback de Vercel). El code es de un solo uso.
  if (req.method === 'GET' && req.url.startsWith('/oauth/start')) {
    // `state` viaja hasta el callback y vuelve: sirve para saber quién arrancó el pedido.
    const quien = new URL(req.url, 'http://x').searchParams.get('state') || 'os'
    try { return send(res, 200, { url: authUrl(quien) }) } catch (e) { return send(res, 400, { error: String(e.message) }) }
  }
  if (req.method === 'GET' && req.url.startsWith('/oauth/exchange')) {
    const code = new URL(req.url, 'http://x').searchParams.get('code')
    if (!code) return send(res, 400, { error: 'falta code' })
    try { const r = await exchangeCode(code); return send(res, 200, { ok: true, email: r.email }) }
    catch (e) { return send(res, 400, { error: String(e.message).slice(0, 200) }) }
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
  // A partir de acá, rutas protegidas. Acepta (1) el token compartido (dueño, super_admin)
  // o (2) una LLAVE POR USUARIO (usuarios_os.access_key) → identidad y rol atados a la llave
  // (seguro: el email no se auto-declara). authEmail queda para el /ask.
  // FALLA CERRADO. Antes el rechazo era `else if (TOKEN)`: con la variable de entorno vacía, una
  // petición SIN `Authorization` no entraba a ningún 401 y seguía de largo con la identidad del
  // dueño — y este servidor está publicado a internet por el proxy `/api/os/*`. La decisión vive
  // en `lib/os-auth.mjs` justamente para tener un test que lo demuestre. Ver ese archivo.
  const acceso = await decidirAcceso({
    token: TOKEN,
    authorization: req.headers.authorization,
    buscarUsuario: async (llave) => {
      const { rows } = await query(
        `select email from public.usuarios_os where access_key = $1 and activo = true limit 1`, [llave])
      return rows[0]?.email ?? null
    },
  })
  if (!acceso.ok) return send(res, acceso.status, { error: acceso.error })
  const authEmail = acceso.email

  // Operaciones pendientes de aprobación (la extensión las lista y las decide).
  if (req.method === 'GET' && req.url === '/pending') {
    try {
      const items = await listPendingOperations({ status: 'awaiting_approval' })
      return send(res, 200, { items })
    } catch (e) { return send(res, 500, { error: e.message }) }
  }

  // Gasto de API del chat + eficiencia (0-API vs pago) + costo del worker hoy. Todo para que
  // la extensión muestre el gasto del día y avise al acercarse al tope (0 API).
  if (req.method === 'GET' && req.url === '/cost') {
    const totalResp = USAGE.zeroApi + COST.n
    let workerHoy = 0
    let cap = null
    let usadoHoy = COST.total
    try {
      const { rows } = await query(`select round(sum(coalesce((result->'cost'->>'usd')::numeric,0))::numeric,4) usd from orq.tasks where created_at >= date_trunc('day', now())`)
      workerHoy = Number(rows[0]?.usd || 0)
      const pres = await estadoPresupuesto(COST.total).catch(() => null)
      if (pres) { cap = pres.cap; usadoHoy = pres.usado }
    } catch { /* si falla la DB, devolvemos solo lo del chat */ }
    // usadoHoy (de estadoPresupuesto) ya es worker+chat del día leído de la DB; NO sumar
    // workerHoy otra vez (doble conteo). worker_hoy_usd se expone aparte para el desglose.
    const diaUsd = cap != null ? usadoHoy : COST.total + workerHoy
    const capRatio = cap ? Math.min(1, diaUsd / cap) : null
    return send(res, 200, {
      since: COST.since,
      total_usd: Number(COST.total.toFixed(6)),
      requests: COST.n,
      by_model: COST.byModel,
      zero_api: USAGE.zeroApi,
      zero_api_pct: totalResp > 0 ? Math.round((USAGE.zeroApi / totalResp) * 100) : null,
      cache: { hits: CACHE_STATS.hits, misses: CACHE_STATS.misses },
      worker_hoy_usd: workerHoy,
      dia_usd: Number(diaUsd.toFixed(4)),
      cap_diario_usd: cap,
      cap_ratio: capRatio,
      alerta: capRatio != null && capRatio >= 0.8,
    })
  }

  // Progreso en vivo de una directiva en curso (polling desde la extensión).
  if (req.method === 'GET' && req.url.startsWith('/progress')) {
    const rid = new URL(req.url, 'http://x').searchParams.get('id')
    const p = rid && PROGRESS.get(rid)
    return send(res, 200, p ? { steps: p.steps.slice(-6), done: p.done } : { steps: [], done: false })
  }

  // Resultado de una directiva que se fue a segundo plano (fallback asíncrono).
  // STOP (botón Detener de la extensión): marca el run como cancelado, libera el pedido
  // duplicado y devuelve un resultado 'detenido'. La tarea de fondo termina sola (acotada)
  // pero su entrega tardía se ignora (CANCELLED). Así el usuario recupera el control ya.
  if (req.method === 'GET' && req.url.startsWith('/cancel')) {
    const rid = new URL(req.url, 'http://x').searchParams.get('id')
    if (rid) {
      CANCELLED.add(rid)
      for (const [k, v] of INFLIGHT) if (v.rid === rid) INFLIGHT.delete(k)
      const msg = { answer: '⏹ Tarea detenida por vos.', model: 'cancelado', cost: 0, capability: 'general', skills: [], navigate: null }
      RESULTS.set(rid, { done: true, out: msg }); persistResult(rid, { done: true, ...msg })
      progressDone(rid)
      log.info('run cancelado por el usuario', { rid })
    }
    return send(res, 200, { ok: true })
  }
  if (req.method === 'GET' && req.url.startsWith('/result')) {
    const rid = new URL(req.url, 'http://x').searchParams.get('id')
    const r = rid && RESULTS.get(rid)
    if (!r) {
      // No está en memoria: buscar en DB (sobrevive reinicios). Si la tarea TERMINÓ antes
      // de que el proceso muriera, el resultado sigue acá y se lo damos igual.
      if (rid) {
        try {
          const { rows } = await query(`select payload from orq.chat_result where rid = $1 limit 1`, [rid])
          if (rows.length) return send(res, 200, rows[0].payload)
        } catch { /* si la DB falla, cae al comportamiento previo */ }
      }
      // Ni en memoria ni en DB: la tarea se PERDIÓ (reinicio a mitad de ejecución) o sigue
      // corriendo. Avisamos 'lost' para que la extensión corte y pida reintentar.
      const stillWorking = rid && PROGRESS.has(rid)
      return send(res, 200, { done: false, lost: !stillWorking })
    }
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
  // Techo de 24MB: alcanza para VARIAS fotos reducidas (el dueño sube un fajo de facturas)
  // o un PDF chico en base64. (El proxy de Vercel corta antes, ~4.5MB, por eso la extensión
  // reduce cada imagen; varias reducidas siguen entrando muy por debajo de este techo.)
  req.on('data', (c) => { body += c; if (body.length > 24e6) req.destroy() })
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
      const { directive, fileId, fast, attachment, attachments, history, runId, wantsAsync, extVersion, userEmail } = data
      // La identidad de la LLAVE (authEmail) manda sobre el email tipeado (seguro).
      const identidad = authEmail || userEmail
      if (!directive || typeof directive !== 'string') return send(res, 400, { error: 'falta "directive"' })
      log.info('directiva recibida', { extVersion: extVersion || 'desconocida', wantsAsync: !!wantsAsync, user: userEmail || 'anon' })
      const t0 = Date.now()
      const rid = runId || (`srv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      // WATCHDOG: ninguna tarea puede colgarse para siempre. Si el trabajo (incluida una
      // tool que se cuelga, ej. una llamada a Google que no responde) pasa el techo duro,
      // devolvemos un mensaje CLARO en vez de dejar el spinner infinito. La tarea de fondo
      // puede seguir y aplicar lo que ya hizo, pero el dueño nunca queda esperando sin fin.
      // Reconstruir/editar una pestaña de un Sheet legítimamente lleva más que una consulta:
      // el agente lee la estructura y escribe varios rangos. Con archivo abierto o referencia
      // a un documento + verbo de acción, damos un techo mayor (300s) para que NO se corte a
      // mitad (causa real de "reconstruí la planilla y me cortó"). El resto sigue en 180s.
      const esEscrituraDocReq = !!fileId
        || (/\b(registr|agreg|escrib|complet|carg|hac[eé]|hacelo|modific|actualiz|arregl|reemplaz|reconstru|rehac|rehag|rearm|arm[aá]|gener[aá]|limpi|f[oó]rmula|borr|elimin|duplic|marc[aá]|reorden)\b/i.test(String(directive || ''))
            && /\b(pesta[ñn]a|solapa|hoja|sheet|planilla|spreadsheet|celda|rango|columna|fila|tabla|drive|documento)\b|https?:\/\/[^\s]*(docs|drive)\.google/i.test(String(directive || '')))
      const HARD_MS = Number(process.env.ORQ_TASK_TIMEOUT_MS || (esEscrituraDocReq ? 300000 : 180000))
      // DEDUP: ¿este MISMO pedido ya está en curso? Entonces NO arranco otro run (eso es el
      // bucle "se corta y empieza de nuevo"): devuelvo el runId existente para que el cliente
      // siga esperando el mismo trabajo. Ventana = HARD_MS + colchón; si es más viejo, es
      // basura y arranco fresco.
      const dedupKey = `${identidad || 'anon'}::${String(directive).trim().slice(0, 4000)}`
      const enCurso = INFLIGHT.get(dedupKey)
      if (enCurso && Date.now() - enCurso.since < HARD_MS + 90000) {
        log.info('pedido idéntico ya en curso → adjunto al run existente', { rid: enCurso.rid })
        return send(res, 200, { async: true, runId: enCurso.rid, note: 'Ese mismo pedido ya lo estoy trabajando — no lo reinicio, te traigo el resultado acá mismo en cuanto termine.' })
      }
      INFLIGHT.set(dedupKey, { rid, since: Date.now() })
      // ENTREGA TARDÍA: la tarea SIEMPRE termina sola (el motor está acotado por iteraciones
      // y costo). Guardamos el resultado REAL cuando termina, aunque haya pasado el watchdog
      // —así el trabajo largo NO se descarta y el dueño no tiene que reintentar (causa real
      // del bucle de reinicio: antes, al vencer el watchdog se marcaba "cortado" y lo que
      // terminaba después se perdía).
      const askPromise = ask({ directive: directive.slice(0, 4000), fileId, fast, attachment, attachments, history, runId: rid, userEmail: identidad })
        .then((out) => { countAnswer(out?.model); if (!CANCELLED.has(rid)) { RESULTS.set(rid, { done: true, out }); persistResult(rid, { done: true, ...out }) } logChatRequest({ rid, directive, user: identidad, surface: extVersion ? 'extension' : 'web', out, latencyMs: Date.now() - t0, extVersion }); return out })
        .catch((e) => { if (!CANCELLED.has(rid)) { RESULTS.set(rid, { done: true, error: e.message }); persistResult(rid, { done: true, error: e.message }) } logChatRequest({ rid, directive, user: identidad, surface: extVersion ? 'extension' : 'web', out: { error: e.message }, latencyMs: Date.now() - t0, extVersion }); throw e })
        .finally(() => { progressDone(rid); INFLIGHT.delete(dedupKey); setTimeout(() => { RESULTS.delete(rid); CANCELLED.delete(rid) }, 120000) })
      // WATCHDOG SUAVE: NO mata la tarea (sigue en segundo plano y entrega tarde). Solo evita
      // el spinner infinito con un aviso que INVITA A ESPERAR, no a reenviar (reenviar reinicia).
      const watchdog = new Promise((resolve) => setTimeout(() => resolve({
        __working__: true, answer: 'Es un pedido grande y lo sigo trabajando en segundo plano — **no lo reenvíes** (reenviarlo lo reinicia). En un momento te traigo el resultado acá mismo.', model: 'trabajando', cost: 0, capability: 'general', skills: [], navigate: null,
      }), HARD_MS))
      const work = Promise.race([askPromise.catch((e) => ({ __error__: e.message })), watchdog])
      if (wantsAsync) {
        // FALLBACK ASÍNCRONO (extensión 0.6.0+): si no termina en 48s, respondemos { async } y
        // la seguimos en segundo plano; la extensión trae el resultado por /result?id=.
        let timer
        const timeout = new Promise((r) => { timer = setTimeout(() => r('__async__'), 48000) })
        const winner = await Promise.race([work, timeout])
        clearTimeout(timer)
        if (winner === '__async__' || winner.__working__) {
          log.info('directiva larga → segundo plano (sigue y entrega tarde)', { rid })
          send(res, 200, { async: true, runId: rid, note: 'Es un pedido grande; lo sigo trabajando y te traigo el resultado acá mismo. No lo reenvíes.' })
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
          const out = await askPromise
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

boot().then(() => server.listen(PORT, HOST, () => log.info('escuchando', { host: HOST, port: PORT, frente: PUBLIC_URL })))
  .catch((e) => { log.error('boot falló', { error: e.message }); process.exit(1) })
