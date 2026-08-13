// EL PUENTE NO-PURO ENTRE LAS OBRAS VENDIDAS Y LA PESTAÑA DE JORNALES.
//
// lib/jornales-demanda-obras.mjs es puro y recibe las obras por parámetro; lib/obras-datos.mjs (la
// fuente, de otra rama) puede NO existir todavía en este árbol. Este archivo es el único que junta
// las dos puntas, con un guard: si la fuente no está, la demanda queda en 0, se AVISA por consola, y
// la pestaña sigue proyectando sólo el piso al convenio — exactamente lo que emitía hasta hoy. Una
// rama tiene que testear y mergear sola, sin esperar a la otra.

import { demandaPorQuincena, costoDemanda, ESCALON_RESPALDO } from './jornales-demanda-obras.mjs'

/**
 * Las obras vendidas/futuras de lib/obras-datos.mjs, o [] si el módulo no existe en esta rama.
 * Se aceptan las formas razonables de exportarlas (función, arreglo, default): el contrato del shape
 * de cada obra está acordado; el nombre exacto del export, todavía no.
 */
export async function cargarObrasVendidas() {
  try {
    const m = await import('./obras-datos.mjs')
    const bruto = m.obrasVendidas ?? m.OBRAS_VENDIDAS ?? m.OBRAS ?? m.default
    const obras = typeof bruto === 'function' ? await bruto() : bruto
    return Array.isArray(obras) ? obras : []
  } catch {
    console.warn('  ⚠ lib/obras-datos.mjs no está en esta rama: demanda de obras en 0 — la proyección usa sólo el piso al convenio')
    return []
  }
}

/**
 * LA DEMANDA VALUADA, LISTA PARA LA PESTAÑA: un mapa clave-de-quincena → costo revaluado.
 *
 * `obras` se puede inyectar (tests); si no, se cargan de la fuente. La escala es el escalón vigente
 * que la pestaña ya parseó de `_UOCRA_RAW` —la misma que valúa el piso, ninguna escala nueva— y el
 * respaldo verificado sólo si la réplica no dio ninguno.
 *
 * @param {{hoy?: Date, escalon?: Object|null, escalones?: Array, hastaMeses?: number, obras?: Array|null}} args
 * @returns {Promise<{porQuincena: Map<string, Object>, sinFechas: Array, nObras: number}>}
 */
export async function demandaParaJornales({ hoy = new Date(), escalon = null, escalones = [], hastaMeses = 6, obras = null } = {}) {
  const lista = obras ?? await cargarObrasVendidas()
  const porQuincena = new Map()
  if (!lista.length) return { porQuincena, sinFechas: [], nObras: 0 }
  const { quincenas, sinFechas } = demandaPorQuincena(lista, { desde: hoy, hastaMeses })
  const escala = escalon?.categorias ? escalon : ESCALON_RESPALDO
  for (const q of quincenas) {
    if (!q.nObras) continue
    const c = costoDemanda(q, escala, escalones)
    if (c && c.total > 0) {
      porQuincena.set(q.clave, { ...c, nObras: q.nObras, plantel: q.plantel, desde: q.desde, hasta: q.hasta })
    }
    if (c?.sinEscala?.length) console.warn(`  ⚠ demanda ${q.clave}: sin escala para ${c.sinEscala.join(', ')} — esas horas NO entran valuadas en $0, entran sin valuar`)
  }
  return { porQuincena, sinFechas, nObras: lista.length }
}
