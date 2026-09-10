// EL DICCIONARIO QUE NECESITA `resolverObraDeCobranza`, LEÍDO DE POSTGRES UNA SOLA VEZ.
//
// ═══ POR QUÉ EXISTE (10/09/2026) ═══
//
// `cobranza-obra.mjs` es la regla PURA —«a qué obra va esta fila»— y no lee ninguna fuente: recibe
// el diccionario ya recortado al cliente. Hasta hoy ese armado vivía SUELTO dentro de
// `cobranza-obra.pg.test.mjs`, así que el único que sabía construirlo era un test. Cuando el lector
// del contratado (`obras-economia-sync.mjs`) necesitó la MISMA imputación, la alternativa era
// copiar treinta líneas de consultas — y copiar el armado es copiar el criterio: cuál orden cuenta
// (no eliminada, tipo orden_compra), qué alias entra al texto libre, y cómo se resuelve una obra
// fusionada. Dos copias se separan sin dar error y publican dos contratados distintos.
//
// ═══ POR QUÉ NO SE LEE `public.cobranza_imputacion` DIRECTAMENTE ═══
//
// La vista lleva `ve_economia()` en el WHERE. El sync corre con la conexión de servicio, sin
// `request.jwt.claims`: la vista le devolvería CERO FILAS y la imputación saldría vacía sin un solo
// error — el verde falso del barrido que no encuentra archivos, con plata adentro. Las tablas base
// (`cliente_orden`, `obra_alias`, `obra_canonica`) sí se leen, y la equivalencia entre la regla en
// JS y la vista en SQL la sostiene `cobranza-obra.pg.test.mjs`, que corre las dos sobre las mismas
// filas y exige que coincidan.

import { numeroCanonico } from './ordenes-identidad.mjs'
import { normObra } from './obra-operacion.mjs'
import { resolverObraDeCobranza } from './cobranza-obra.mjs'

/** Las clasificaciones de alias que la vista acepta — mismo recorte que 20260822T6200. */
const CLASES = ['obra', 'mantenimiento']

/**
 * EL DICCIONARIO DE LA IMPUTACIÓN, LEÍDO DE LAS TABLAS BASE.
 *
 * @param {(sql:string)=>Promise<Array<object>>} q ejecuta una consulta y devuelve las filas
 * @returns {Promise<{diccDe:(clienteId:string|null)=>object, bolsaDe:(etiqueta:string)=>string|null,
 *   obras:number, ordenes:number}>}
 */
export async function cargarDiccionarios(q) {
  const fusion = new Map((await q(`select id, fusionada_en from public.obra_canonica`))
    .map((o) => [o.id, o.fusionada_en ?? o.id]))
  const ordenes = await q(`select cliente_id, numero, numero_canonico, obra_id from public.cliente_orden
                            where tipo = 'orden_compra' and eliminado_en is null and obra_id is not null`)
  const alias = await q(`select a.alias, a.obra_id, a.en_texto_libre, a.clasificacion, o.cliente_id
                           from public.obra_alias a join public.obra_canonica o on o.id = a.obra_id`)
  const bolsas = alias.filter((a) => a.obra_id && CLASES.includes(a.clasificacion))

  const cache = new Map()
  const diccDe = (clienteId) => {
    if (!cache.has(clienteId)) cache.set(clienteId, armarDicc(clienteId, { fusion, ordenes, alias }))
    return cache.get(clienteId)
  }
  const bolsaDe = (etiqueta) => {
    const b = bolsas.find((x) => x.alias === normObra(etiqueta))
    return b ? fusion.get(b.obra_id) ?? null : null
  }
  return { diccDe, bolsaDe, obras: fusion.size, ordenes: ordenes.length }
}

/** El diccionario de UN cliente: sus órdenes por número canónico y sus alias de texto libre. */
function armarDicc(clienteId, { fusion, ordenes, alias }) {
  const obraPorOc = new Map()
  for (const o of ordenes) {
    if (o.cliente_id !== clienteId) continue
    const canon = numeroCanonico(o.numero_canonico ?? o.numero)
    const viva = fusion.get(o.obra_id)
    if (!canon || !viva) continue
    // Dos obras para la misma orden ⇒ la orden no distingue nada y se cae. Igual que la SQL.
    obraPorOc.set(canon, obraPorOc.has(canon) && obraPorOc.get(canon) !== viva ? null : viva)
  }
  for (const [k, v] of obraPorOc) if (!v) obraPorOc.delete(k)
  return {
    obraPorOc,
    aliasesLibres: alias
      .filter((a) => a.en_texto_libre && a.cliente_id === clienteId && CLASES.includes(a.clasificacion))
      .map((a) => ({ alias: a.alias, obraId: fusion.get(a.obra_id) })),
  }
}

/**
 * A QUÉ OBRA VA CADA FILA LEÍDA DEL SHEET — los índices agrupados por obra.
 *
 * Es el mismo `resolverObraDeCobranza` que especifica `public.cobranza_imputacion`, aplicado sobre
 * las filas crudas de la pestaña Cobranzas en vez de sobre las filas ya replicadas en Postgres. Se
 * hace acá y no contra la réplica porque el lector del contratado trabaja sobre la LECTURA VIVA del
 * Sheet: emparejar por `sheet_id` contra una réplica de la corrida anterior imputaría con datos de
 * ayer una fila que el dueño editó hoy.
 *
 * @param {Array<Array>} filas filas de datos de Cobranzas (sin encabezado)
 * @param {{cliente:number, concepto:number, oc:number}} cols índices 0-based
 * @param {{diccDe:Function, bolsaDe:Function, clienteDe:(etiqueta:string)=>string|null}} ctx
 * @returns {{porObra:Map<string,number[]>, imputadas:number, sinObra:number}}
 */
export function imputarFilas(filas = [], cols = {}, ctx = {}) {
  const porObra = new Map()
  let imputadas = 0
  let sinObra = 0
  filas.forEach((f, i) => {
    const etiqueta = String(f?.[cols.cliente] ?? '').trim()
    if (!etiqueta) return
    const fila = {
      cliente_id: ctx.clienteDe?.(etiqueta) ?? null,
      obra_cliente: etiqueta,
      orden_compra: f?.[cols.oc] ?? null,
      concepto: f?.[cols.concepto] ?? null,
    }
    const dicc = { ...ctx.diccDe(fila.cliente_id), bolsa: ctx.bolsaDe(etiqueta) }
    const r = resolverObraDeCobranza(fila, dicc)
    if (!r.obraId) { sinObra++; return }
    if (!porObra.has(r.obraId)) porObra.set(r.obraId, [])
    porObra.get(r.obraId).push(i)
    imputadas++
  })
  return { porObra, imputadas, sinObra }
}
