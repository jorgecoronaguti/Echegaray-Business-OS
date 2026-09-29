/**
 * router.mjs — EL DEVELOPMENT ROUTER.
 *
 * QUÉ ES Y QUÉ NO ES
 * ──────────────────
 * Es la capa que decide QUIÉN hace cada trabajo de DESARROLLO del Business OS. No es el runtime
 * del producto: `app.ecsas.com.ar` / XSAS es otra cosa y no se mezcla. Sus métricas tampoco se
 * mezclan: el Autonomy Rate del ERP no dice nada sobre esto, y acá no se usa.
 *
 * Existe por un problema del dueño, textual: «cuando Claude Code se queda sin tokens/cuota, hoy se
 * detiene la construcción de TODO el Echegaray Business OS». El router no reemplaza a Claude:
 * lo saca del camino crítico de lo que no lo necesita.
 *
 * EL BUCLE
 *   tarea → clasificar → contexto mínimo → riesgo → elegir ejecutor → ejecutar → VERIFICAR
 *        → aceptar | reparar | escalar → bitácora
 *
 * LOS NIVELES DE RIESGO, adaptados a este repo
 *   D0  determinística   — el resultado se puede escribir como una función pura y verificar con un
 *                          test. Sin Claude, sin modelo, sin red. Es la que hay que ganar.
 *   D1  bajo riesgo      — edición acotada de UI, tests, docs, tipos. HF/local primero.
 *   D2  riesgo medio     — lógica de un feature, refactor de varios archivos. HF si pasa el gate.
 *   D3  alto riesgo      — arquitectura, seguridad, RLS, finanzas, migraciones destructivas,
 *                          cambios transversales, el Sheet real. Claude o revisión fuerte. NUNCA
 *                          se degrada sola a un modelo más chico.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { claudeDisponible, ClaudeNoDisponible, ejecutorClaude } from './ejecutores.mjs'
import { verificar } from './verificar.mjs'
import { dominioDe } from './politica-codigo.mjs'

export const RIESGO = Object.freeze({ D0: 'D0', D1: 'D1', D2: 'D2', D3: 'D3' })

export const ESTADO = Object.freeze({
  ACEPTADA: 'aceptada',
  REPARADA: 'reparada',            // pasó, pero después de al menos una reparación
  ESCALADA_A_CLAUDE: 'escalada-a-claude',
  BLOQUEADA_ESPERA_CLAUDE: 'bloqueada-espera-claude',  // CLAUDE_UNAVAILABLE: no se simula
  RECHAZADA: 'rechazada',
})

/**
 * Señales que fuerzan D3. Falla hacia arriba, pero por el EFECTO del cambio, no por una palabra:
 * hasta el 29/09 «token», «caja» o «timer» en el título subían a D3 una tarea que sólo medía
 * tokens o mostraba un número. Tres familias:
 *  - SIEMPRE (texto o ruta): DDL/migraciones, RLS y permisos.
 *  - POR RUTA: el archivo mismo escribe el Sheet, calcula plata, instala un timer o despliega.
 *  - POR TEXTO sólo con verbo de efecto: escribir/cargar/borrar sobre el Sheet o la plata,
 *    corregir un cálculo financiero, instalar un timer, desplegar, rotar una credencial.
 */
const SENALES_SIEMPRE = [
  [/supabase\/migrations|drop table|drop column|truncate|delete from|alter table/i, 'migración o DDL destructivo'],
  [/\brls\b|row level security|security_invoker|\bgrant\b|\bpolicy\b|\bpermisos?\b/i, 'RLS o permisos'],
]
// Con \b adelante: sin él «iva» dispara en «activa» y «arca» en «marca».
const DINERO = '\\b(?:caja|cash.?flow|n[oó]mina|liquidaci[oó]n|sueldo|cobranza|cheque|banco|arca|afip|iva|tesorer[ií]a|pagos?)\\b'
const SENALES_RUTA = [
  [/(^|\/)(sheets?|drive)[-_/]|spreadsheet|_RAW\b|escribir-?sheet|flujo-de-fondos/i, 'el archivo escribe el Sheet real'],
  [/\.(timer|service)$|systemd|vercel\.json|(^|\/)deploy|desplegar/i, 'unidad o despliegue de producción'],
  [/(^|\/)(auth|middleware)\b|secret|credencial/i, 'autenticación o credenciales'],
]
const RUTA_DINERO = /caja|cash.?flow|nomina|liquidacion|sueldo|cobranza|cheque|banco|afip|tesoreria|\barca\b|\biva\b/i
const SENALES_TEXTO = [
  [/(escrib|carg|actualiz|borr|modific|replic|sincroniz|import|pis)\w*\b.{0,40}(sheets?|spreadsheet|drive|_RAW\b)/i, 'escribe en el Sheet real'],
  [new RegExp(`(escrib|carg|actualiz|borr|modific|imput|concili|emit)\\w*\\b.{0,40}(${DINERO})`, 'i'), 'escritura con efecto financiero o fiscal'],
  [new RegExp(`(c[aá]lculo|calcul|f[oó]rmula|saldo|proyecci[oó]n|devengad|percibid).{0,40}(${DINERO})|(${DINERO}).{0,40}(c[aá]lculo|calcul|f[oó]rmula)`, 'i'), 'cálculo financiero'],
  [/\b(deploy|desplegar|despliegue|systemd|vercel)\b|(nuevo|crear|agregar|instalar|activar|reiniciar)\w*\b.{0,20}\btimer|\btimer\b.{0,20}(nuevo|en producci[oó]n)/i, 'producción'],
  [/secreto|credencial|password|contraseña|api.?key|service.?role|(access|refresh)[ _-]?token|(rotar|revocar|filtr)\w*\b.{0,20}(token|clave)/i, 'seguridad'],
]

/** Primera señal D3 que dispara, o null. Exportada para poder probar cada familia por separado. */
export function senalD3(tarea) {
  const archivos = tarea.archivos || []
  const texto = `${tarea.titulo || ''} ${tarea.objetivo || ''}`
  const todo = `${texto} ${archivos.join(' ')}`
  for (const [re, porQue] of SENALES_SIEMPRE) if (re.test(todo)) return porQue
  for (const a of archivos) {
    for (const [re, porQue] of SENALES_RUTA) if (re.test(a)) return porQue
    // Un archivo de cálculo (no una pantalla, un test ni un tipo) cuyo nombre es plata.
    const d = dominioDe(a)
    if (RUTA_DINERO.test(a) && (d === 'codigo-nucleo' || d === 'codigo-utilidades')) return 'módulo de cálculo financiero'
  }
  for (const [re, porQue] of SENALES_TEXTO) if (re.test(texto)) return porQue
  return null
}

/**
 * Clasifica una tarea en categoría y riesgo. Determinística y testeable: es la pieza que decide
 * si Claude entra o no, y una decisión así no puede depender de un modelo.
 */
export function clasificar(tarea) {
  const senal = senalD3(tarea)
  if (senal) return { riesgo: RIESGO.D3, porQue: `señal de alto riesgo: ${senal}`, categoria: tarea.categoria || 'desconocida' }
  if (tarea.transformar) return { riesgo: RIESGO.D0, porQue: 'la tarea se expresa como una transformación pura', categoria: tarea.categoria || 'cambio-mecanico' }

  const dominios = [...new Set((tarea.archivos || []).map(dominioDe))]
  if (dominios.some((d) => d === 'migraciones' || d === 'datos-negocio')) {
    return { riesgo: RIESGO.D3, porQue: `toca ${dominios.join(', ')}`, categoria: tarea.categoria || 'datos' }
  }
  const soloUnArchivo = (tarea.archivos || []).length <= 1
  const livianos = dominios.every((d) => d === 'codigo-ui' || d === 'codigo-tests' || d === 'codigo-tipos')
  if (livianos && soloUnArchivo) return { riesgo: RIESGO.D1, porQue: `un solo archivo ${dominios[0]}`, categoria: tarea.categoria || 'edicion-acotada' }
  if (livianos) return { riesgo: RIESGO.D2, porQue: `${dominios.length} dominios livianos, ${tarea.archivos.length} archivos`, categoria: tarea.categoria || 'refactor' }
  return { riesgo: RIESGO.D2, porQue: `dominios: ${dominios.join(', ') || 'ninguno'}`, categoria: tarea.categoria || 'desconocida' }
}

/**
 * Qué ejecutores se pueden intentar, EN ORDEN, para este riesgo.
 * Claude nunca es el primero. En D3 es el único, y si no está, la tarea espera.
 */
export function escaleraDe(riesgo) {
  switch (riesgo) {
    case RIESGO.D0: return ['deterministico']
    case RIESGO.D1: return ['deterministico', 'hf', 'claude']
    case RIESGO.D2: return ['deterministico', 'hf', 'claude']
    case RIESGO.D3: return ['claude']
    default: return ['claude']
  }
}

// ───────────────────────────────── BITÁCORA ─────────────────────────────────

const DIR_ESTADO = (raiz) => path.join(raiz, '.claude', 'estado')
const BITACORA = (raiz) => path.join(DIR_ESTADO(raiz), 'dev-router.jsonl')
const PENDIENTES = (raiz) => path.join(DIR_ESTADO(raiz), 'dev-router-bloqueadas.json')

export function anotar(raiz, fila) {
  mkdirSync(DIR_ESTADO(raiz), { recursive: true })
  appendFileSync(BITACORA(raiz), `${JSON.stringify({ ts: new Date().toISOString(), ...fila })}\n`)
}

/**
 * Persistir lo que quedó bloqueado esperando a Claude. Sin esto, «el router siguió» no sirve:
 * cuando Claude vuelve nadie sabe qué le tocaba. Se integra con `.claude/estado/` — el traspaso
 * que ya existe —, NO se construye otro sistema de handoff en paralelo.
 */
export function guardarBloqueadas(raiz, filas) {
  mkdirSync(DIR_ESTADO(raiz), { recursive: true })
  const previas = existsSync(PENDIENTES(raiz)) ? JSON.parse(readFileSync(PENDIENTES(raiz), 'utf8')) : []
  const porId = new Map(previas.map((f) => [f.id, f]))
  for (const f of filas) porId.set(f.id, f)
  writeFileSync(PENDIENTES(raiz), `${JSON.stringify([...porId.values()], null, 2)}\n`)
  return PENDIENTES(raiz)
}

/**
 * Sacar de la lista de bloqueadas lo que después se resolvió.
 * Sin esto la lista sólo crece y el handoff miente: Claude vuelve y rehace trabajo ya hecho.
 * Encontrado el 16/09/2026 mirando el JSON después de la prueba de fuego, no en un test.
 */
export function desbloquear(raiz, id) {
  if (!existsSync(PENDIENTES(raiz))) return
  const quedan = JSON.parse(readFileSync(PENDIENTES(raiz), 'utf8')).filter((f) => f.id !== id)
  writeFileSync(PENDIENTES(raiz), `${JSON.stringify(quedan, null, 2)}\n`)
}

export function leerBloqueadas(raiz) {
  return existsSync(PENDIENTES(raiz)) ? JSON.parse(readFileSync(PENDIENTES(raiz), 'utf8')) : []
}

// ─────────────────────────────── EL BUCLE ───────────────────────────────

/**
 * Corre UNA tarea.
 *
 * @param tarea {
 *   id, titulo, objetivo, categoria, archivos[],
 *   intentos: { deterministico?: fn, hf?: fn },   // devuelven la forma de `ejecutores.mjs`
 *   plan: [fn],                                   // el plan de verificación
 *   maxReparaciones
 * }
 */
export async function correrTarea(raiz, tarea, { maxReparaciones = 2 } = {}) {
  const id = tarea.id || randomUUID().slice(0, 8)
  const t0 = Date.now()
  const { riesgo, porQue, categoria } = clasificar(tarea)
  const escalera = escaleraDe(riesgo)
  const traza = { id, titulo: tarea.titulo, riesgo, porQueRiesgo: porQue, categoria, escalera, pasos: [] }
  let costoUsd = 0

  for (const nombre of escalera) {
    const fn = nombre === 'claude' ? ejecutorClaude : tarea.intentos?.[nombre]
    if (!fn) { traza.pasos.push({ ejecutor: nombre, saltado: 'la tarea no define este ejecutor' }); continue }

    for (let reparacion = 0; reparacion <= maxReparaciones; reparacion += 1) {
      let r
      try {
        r = await fn({ reparacion, ultimoFallo: traza.ultimoFallo || null })
      } catch (e) {
        if (e instanceof ClaudeNoDisponible) {
          // NO SE SIMULA Y NO SE SUSTITUYE. Se persiste y se sigue con lo demás.
          traza.pasos.push({ ejecutor: 'claude', bloqueado: e.message })
          traza.estado = ESTADO.BLOQUEADA_ESPERA_CLAUDE
          traza.ms = Date.now() - t0; traza.costoUsd = costoUsd
          guardarBloqueadas(raiz, [{ id, titulo: tarea.titulo, riesgo, porQue: e.message, objetivo: tarea.objetivo, archivos: tarea.archivos, desde: new Date().toISOString() }])
          anotar(raiz, traza)
          return traza
        }
        throw e
      }
      costoUsd += r.costoUsd || 0
      const paso = { ejecutor: nombre, reparacion, ok: r.ok, modelo: r.modelo, proveedor: r.proveedor, ms: r.ms, costoUsd: r.costoUsd, porQue: r.porQue, uso: r.uso || null, bloqueadoPorPolitica: r.bloqueadoPorPolitica || false }

      if (!r.ok) { traza.pasos.push(paso); break }   // este ejecutor no pudo: al siguiente

      // ── EL VERIFICADOR. El ejecutor no se acepta a sí mismo. ──
      const v = await verificar(raiz, tarea.plan || [])
      paso.verificacion = v.pasos.map((p) => ({ nombre: p.nombre, verde: p.verde, ms: p.ms, comando: p.comando, cola: p.verde ? null : p.cola }))
      traza.pasos.push(paso)
      if (v.verde) {
        traza.estado = reparacion > 0 ? ESTADO.REPARADA : ESTADO.ACEPTADA
        traza.ejecutorQueLaHizo = nombre; traza.modelo = r.modelo; traza.proveedor = r.proveedor
        traza.reparaciones = reparacion
        traza.ms = Date.now() - t0; traza.costoUsd = costoUsd
        desbloquear(raiz, id)
        anotar(raiz, traza)
        return traza
      }
      traza.ultimoFallo = { paso: v.fallo.nombre, comando: v.fallo.comando, cola: v.fallo.cola }
      if (typeof tarea.revertir === 'function') await tarea.revertir()
    }
  }

  traza.estado = claudeDisponible() ? ESTADO.ESCALADA_A_CLAUDE : ESTADO.RECHAZADA
  traza.ms = Date.now() - t0; traza.costoUsd = costoUsd
  if (traza.estado === ESTADO.ESCALADA_A_CLAUDE) {
    guardarBloqueadas(raiz, [{ id, titulo: tarea.titulo, riesgo, porQue: 'agotó los ejecutores sin Claude', objetivo: tarea.objetivo, archivos: tarea.archivos, ultimoFallo: traza.ultimoFallo, desde: new Date().toISOString() }])
  }
  anotar(raiz, traza)
  return traza
}
