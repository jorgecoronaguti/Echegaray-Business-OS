// TOPE DE GASTO (budget cap) que DEGRADA, NUNCA BLOQUEA. Regla dura del dueño: la persona
// usando la extensión NUNCA se queda sin respuesta. El tope aprieta el gasto AUTÓNOMO de
// fondo (vigilancia) y baja el modelo de los análisis caros on-demand a haiku — pero las
// respuestas determinísticas (0 API) y el chat con haiku funcionan SIEMPRE, sin importar
// el tope. Fuente del gasto de hoy: worker (orq.tasks.result.cost.usd) + chat (en memoria).
import { query } from './db.mjs'

// Tope diario en USD (configurable). Default holgado; el dueño lo ajusta con la variable.
export const CAP_DIARIO_USD = Number(process.env.ORQ_COST_DAILY_CAP_USD || 5)
const UMBRAL_AHORRO = 0.8 // a partir del 80% del tope entra en modo ahorro

/** Gasto real de HOY (día local): worker (orq.tasks) + chat (orq.chat_cost, persistido).
 *  Ya NO depende del contador en memoria del server (que se borraba en cada reinicio y
 *  hacía que el tope sub-contara o saltara de golpe). El parámetro chatUsd se mantiene por
 *  compatibilidad pero se ignora: el gasto del chat ahora se lee de la DB. */
export async function costoHoy() {
  let worker = 0, chat = 0
  try {
    const { rows } = await query(
      `select coalesce(sum(coalesce((result->'cost'->>'usd')::numeric,0)),0) usd
         from orq.tasks where created_at >= date_trunc('day', now())`)
    worker = Number(rows[0].usd) || 0
  } catch { worker = 0 }
  try {
    const { rows } = await query(`select coalesce(sum(usd),0) usd from orq.chat_cost where ts >= date_trunc('day', now())`)
    chat = Number(rows[0].usd) || 0
  } catch { chat = 0 }
  return worker + chat
}

/** Estado del presupuesto: modo 'normal' | 'ahorro' | 'tope'. NUNCA bloquea; el modo solo
 *  decide si un análisis caro on-demand baja a haiku y si el autónomo de fondo se pausa. */
export async function estadoPresupuesto(_chatUsd = 0, cap = CAP_DIARIO_USD) {
  const usado = await costoHoy()
  const ratio = cap > 0 ? usado / cap : 0
  const modo = ratio >= 1 ? 'tope' : ratio >= UMBRAL_AHORRO ? 'ahorro' : 'normal'
  return { usado: Math.round(usado * 100) / 100, cap, ratio, modo }
}

/** ¿Se debe bajar a haiku un análisis caro on-demand? (ahorro o tope). Nunca bloquea. */
export function degradarModeloOnDemand(modo) {
  return modo === 'ahorro' || modo === 'tope'
}

/** ¿Se debe pausar el trabajo AUTÓNOMO de fondo (vigilancia/especialistas)? (solo en tope). */
export function pausarAutonomo(modo) {
  return modo === 'tope'
}

// ── INTERRUPTOR DE AUTONOMÍA (nivel del negocio, no del tope diario) ──────────────
// El tope diario aprieta el gasto. Este interruptor decide CUÁNTA organización autónoma
// corre, independiente del tope. Existe porque hoy hay UN usuario probando y el equipo NO
// está adentro: un directorio de IA razonando 4×/día para un público de cero es puro gasto.
// La regla del CLAUDE.md: una capacidad sin público no es progreso.
//
//   off    → NO se dispara vigilancia (0 API de fondo). El chat y las respuestas
//            determinísticas (briefing/caja/desvíos) siguen intactas y gratis. ← bootstrap
//   digest → vigilancia corre, PERO el Director hace UNA pasada barata (haiku) y NO abre
//            especialistas: informe corto con lo ya calculado. Costo mínimo.
//   full   → organización completa (Director + especialistas). Para cuando el equipo
//            consume la salida y cada especialista deja conocimiento reutilizable.
export function modoAutonomia() {
  const m = String(process.env.ORQ_AUTONOMIA || 'off').toLowerCase()
  return ['off', 'digest', 'full'].includes(m) ? m : 'off'
}

// Tope DURO de especialistas que un Director puede abrir por ronda, pase lo que pase (el
// prompt de "0-2" lo ignora el modelo y abre 38). En 'digest' es 0; en 'full', configurable.
export function maxEspecialistasPorRonda() {
  if (modoAutonomia() === 'digest') return 0
  return Math.max(0, Number(process.env.ORQ_MAX_ESPECIALISTAS || 2))
}
