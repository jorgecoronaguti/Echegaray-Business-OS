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

/** Señales que fuerzan D3 sin importar lo que diga la tarea. Falla hacia arriba, no hacia abajo. */
const SENALES_D3 = [
  [/supabase\/migrations|drop table|drop column|truncate|delete from/i, 'migración o DDL destructivo'],
  [/\brls\b|row level security|security_invoker|\bgrant\b|\bpolicy\b/i, 'RLS o permisos'],
  [/sheets?|spreadsheet|drive|_RAW\b/i, 'toca el Sheet real de Google'],
  [/caja|cash.?flow|liquidacion.*pago|nomina|nómina|cobranza|cheque|banco|arca|afip/i, 'efecto financiero o fiscal'],
  [/deploy|producción|produccion|vercel|systemd|timer/i, 'producción'],
  [/auth|token|secreto|credencial|password/i, 'seguridad'],
]

/**
 * Clasifica una tarea en categoría y riesgo. Determinística y testeable: es la pieza que decide
 * si Claude entra o no, y una decisión así no puede depender de un modelo.
 */
export function clasificar(tarea) {
  const texto = `${tarea.titulo || ''} ${tarea.objetivo || ''} ${(tarea.archivos || []).join(' ')}`
  for (const [re, porQue] of SENALES_D3) {
    if (re.test(texto)) return { riesgo: RIESGO.D3, porQue: `señal de alto riesgo: ${porQue}`, categoria: tarea.categoria || 'desconocida' }
  }
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
