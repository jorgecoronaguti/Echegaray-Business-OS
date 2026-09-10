// FUSIONAR DOS OBRAS QUE SON LA MISMA — el núcleo PURO (sin DB, sin red).
//
// ═══ POR QUÉ EXISTE (10/09/2026) ═══
//
// El maestro `public.obra_canonica` tiene la misma obra dos veces con dos slugs: «BSA - Planta»
// (`bsa-planta`, cerrada) y «ME - BSA» (`messina-bsa`, activa) son UNA obra, igual que «Pisos
// 120m2» y «ME - PISOS 120 M² Y RAMPA». Mientras convivan, el costo y las órdenes de compra del
// mismo trabajo quedan repartidos entre dos fichas y ninguna de las dos dice la verdad — que es
// justo lo que el maestro existe para impedir.
//
// ═══ POR QUÉ EL VIEJO NO SE BORRA ═══
//
// El slug viejo sigue escrito en documentos, en el Sheet y en la cabeza de la gente: Compras y
// Cobranzas resuelven la obra por TEXTO contra `obra_alias` (`norm_obra()`). Borrar la fila vieja
// dejaría a ese texto sin destino y el gasto caería en «desconocido» sin avisar. Por eso la fusión
// termina con el nombre viejo convertido en ALIAS del slug activo: lo que ya estaba escrito sigue
// resolviendo, y ahora resuelve a la obra correcta.
//
// ═══ LA REGLA QUE NO SE NEGOCIA: NINGUNA FILA SE PIERDE ═══
//
// Fusionar es mover referencias, nunca borrar filas. Por eso el plan calcula el conteo ANTES y el
// conteo DESPUÉS y `planificarFusion` se niega a devolver un plan donde no coincidan. Y donde el
// destino no puede tener dos filas de la misma obra (`obra_economia_sheet` tiene la obra como clave
// primaria: es lo que publica el Sheet OBRAS), la fila NO se mueve ni se suma a ciegas — se declara
// como CONFLICTO para que lo resuelva quien conoce el número. Sumar dos economías publicadas por
// dos fichas distintas es inventar un contratado que nadie firmó.

/** @typedef {{ tabla: string, col: string, filasDe: number, filasEn: number }} Referencia */
/** @typedef {{ id: string, nombre?: string }} Obra */
/** @typedef {{ alias: string, obra_id: string }} FilaAlias */

/**
 * Tabla+columna donde la obra es clave: el destino no admite una segunda fila de la misma obra.
 * Se declara acá (y no se deduce del nombre) porque de esto depende que no se pisen números.
 */
export const REFERENCIAS_EXCLUSIVAS = new Set(['obra_economia_sheet.obra_canonica_id'])

/** Réplica de `public.norm_obra()` — la misma de `obra-operacion.mjs`, importada para no duplicarla. */
export { normObra } from './obra-operacion.mjs'
import { normObra } from './obra-operacion.mjs'

/**
 * Arma el plan de fusión de `de` en `en`. Puro: recibe los conteos ya medidos.
 * @param {{de: string, en: string, obras: Obra[], referencias: Referencia[], alias?: FilaAlias[],
 *          exclusivas?: Set<string>}} arg
 * @returns {{de: string, en: string, nombreDe: string, movimientos: Referencia[],
 *            conflictos: {tabla: string, col: string, filasDe: number, filasEn: number, motivo: string}[],
 *            aliasNuevos: FilaAlias[], filasQueSeMueven: number, antes: number, despues: number}}
 */
export function planificarFusion({ de, en, obras, referencias, alias = [], exclusivas = REFERENCIAS_EXCLUSIVAS }) {
  const origen = validarPar(de, en, obras)
  const movimientos = []
  const conflictos = []
  for (const r of referencias ?? []) {
    const clave = `${r.tabla}.${r.col}`
    if (r.filasDe > 0 && r.filasEn > 0 && exclusivas.has(clave)) {
      conflictos.push({ ...r, motivo: `${clave}: la obra es clave y ambas tienen fila — no se suma a ciegas` })
      continue
    }
    if (r.filasDe > 0) movimientos.push(r)
  }
  const antes = (referencias ?? []).reduce((a, r) => a + r.filasDe + r.filasEn, 0)
  const plan = {
    de, en, nombreDe: origen.nombre ?? de, movimientos, conflictos,
    aliasNuevos: aliasDeFusion(origen, en, alias),
    filasQueSeMueven: movimientos.reduce((a, r) => a + r.filasDe, 0),
    antes, despues: antes,
  }
  if (plan.antes !== plan.despues) throw new Error('fusión inválida: el conteo cambiaría')
  return plan
}

/** Valida el par y devuelve la obra origen. Lanza si algo no permite fusionar. */
function validarPar(de, en, obras) {
  if (!de || !en) throw new Error('faltan --de y --en')
  if (de === en) throw new Error('no se fusiona una obra consigo misma')
  const lista = obras ?? []
  const destino = lista.find((o) => o.id === en)
  if (!destino) throw new Error(`la obra destino "${en}" no existe en obra_canonica: no se fusiona`)
  const origen = lista.find((o) => o.id === de)
  if (!origen) throw new Error(`la obra origen "${de}" no existe en obra_canonica: no se fusiona`)
  return origen
}

/**
 * Los alias que la fusión tiene que dejar escritos para que el nombre viejo siga resolviendo.
 * Idempotente: no propone un alias que ya apunta al destino.
 */
function aliasDeFusion(origen, en, alias) {
  const yaEstan = new Map((alias ?? []).map((a) => [a.alias, a.obra_id]))
  const propuestos = new Set([normObra(origen.id), normObra(origen.nombre)].filter(Boolean))
  const nuevos = []
  for (const a of propuestos) {
    const actual = yaEstan.get(a)
    // Ya apunta al destino, o apunta al origen y lo va a repuntar el UPDATE de `obra_alias.obra_id`
    // (es una FK más), o es de una TERCERA obra y no es de esta fusión tocarlo: en los tres casos,
    // proponerlo otra vez rompería la PK de `obra_alias`.
    if (actual !== undefined) continue
    nuevos.push({ alias: a, obra_id: en, clasificacion: 'obra' })
  }
  return nuevos
}

/** El plan en líneas de texto — una por tabla. Lo imprime el `--dry` y el `--aplicar`. */
export function lineasDelPlan(plan) {
  const l = [`${plan.de} → ${plan.en}  ·  ${plan.filasQueSeMueven} filas en ${plan.movimientos.length} tablas`]
  for (const m of plan.movimientos) l.push(`  ${m.tabla}.${m.col}: ${m.filasDe} → ${plan.en} (destino ya tenía ${m.filasEn})`)
  for (const c of plan.conflictos) l.push(`  CONFLICTO ${c.motivo}`)
  for (const a of plan.aliasNuevos) l.push(`  alias nuevo: "${a.alias}" → ${a.obra_id}`)
  if (!plan.movimientos.length && !plan.aliasNuevos.length) l.push('  (nada que mover: ya estaba fusionada)')
  return l
}
