#!/usr/bin/env node
// AUDITOR DE LOS COMPROBANTES YA CARGADOS — SÓLO LECTURA. NO ESCRIBE NI UNA CELDA.
//
// «tengo muchos comprobantes mal cargados, y tampoco me arreglas eso».
//
// Corre las reglas que hoy están en código contra las filas que YA están en Compras y lista, fila por
// fila, qué dice hoy, qué debería decir y de dónde sale la corrección. La corrección la aplica una
// persona: Compras es la pestaña donde el dueño carga a mano —«compras es una pestaña q las cargas
// son realizadas desde aca, no hay revision valida»— y ningún script la reescribe.
//
// Este archivo NO importa `makeGoogleClient` para escribir: la única llamada a Google es
// `readSheetValues`. El freno de mano de Sheets no lo afecta porque no hay nada que frenar.
//
//   node orquestador/scripts/auditar-comprobantes-cargados.mjs           # informe en markdown
//   node orquestador/scripts/auditar-comprobantes-cargados.mjs --json    # para consumirlo
//   node orquestador/scripts/auditar-comprobantes-cargados.mjs --todas   # sin filtrar por el bot

import { auditarCompras, informe, RANGO, correlativo } from '../lib/comprobantes/auditoria.mjs'

export const ID_CASHFLOW = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/**
 * Las filas que cargó el bot, de `comunicacion.comprobantes_cargados`.
 *
 * Devuelve null —no una lista vacía— cuando no se puede consultar: son cosas distintas y confundirlas
 * haría que un Postgres caído se leyera como "el bot no cargó nada" y el auditor no mirara ni una
 * fila. Sin registro se auditan todas y se declara el alcance.
 */
export async function registroDelBot(port) {
  if (typeof port?.query !== 'function') return null
  try {
    const { rows } = await port.query(
      `select clave, proveedor, tipo, numero, total, fila, creado_at
         from comunicacion.comprobantes_cargados
        where coalesce(hoja,'Compras') = 'Compras'
        order by creado_at`)
    return rows.map((r) => ({ ...r, total: r.total == null ? null : Number(r.total) }))
  } catch { return null }
}

/**
 * EL LIBRO FISCAL, que es el único árbitro válido de "¿esto es un duplicado o un reparto?".
 *
 * Devuelve `correlativo → totales`. Se agrupa por correlativo y no por (proveedor, punto de venta)
 * a propósito: ARCA guarda la RAZÓN SOCIAL del emisor —Corralón Progreso factura como PEREZ GARCIA
 * MARISOL BIBIANA— y el punto de venta es justo lo que se tipea distinto de un lado y del otro. El
 * correlativo sí discrimina, y cuando trae más de un total el auditor no afirma nada.
 *
 * Devuelve null si no se puede consultar: sin libro no se declara ningún duplicado, se declara "a
 * revisar". Confundir "no pude mirar" con "no está" es lo que produce una lista que nadie cree.
 */
export async function librofiscalPorCorrelativo(port) {
  if (typeof port?.query !== 'function') return null
  try {
    const { rows } = await port.query(
      `select numero, imp_total from public.comprobantes_arca
        where tipo_libro = 'R' and imp_total is not null and imp_total <> 0`)
    const m = new Map()
    for (const r of rows) {
      const c = correlativo(r.numero)
      if (!c) continue
      const t = Math.round(Number(r.imp_total) * 100) / 100
      if (!m.has(c)) m.set(c, [])
      if (!m.get(c).includes(t)) m.get(c).push(t)
    }
    return m
  } catch { return null }
}

/**
 * La auditoría entera. `google` y `port` entran inyectados: es lo que permite probarla con un doble
 * que EXPLOTA ante cualquier escritura, que es la única forma de demostrar que no escribe.
 */
export async function auditar({ google, port, todas = false } = {}) {
  // SIN `render`: los valores llegan FORMATEADOS en es-AR, que es el contrato de toda la pila de
  // comprobantes (`compras-vivas.mjs` lee el mismo rango igual). Con UNFORMATTED_VALUE el punto
  // decimal del número crudo se lee como separador de miles y $6.693,39 pasa a ser 6.693.389.999.
  const filas = await google.readSheetValues(ID_CASHFLOW, RANGO)
  const registro = todas ? null : await registroDelBot(port)
  const totalesFiscales = await librofiscalPorCorrelativo(port)
  return auditarCompras(filas ?? [], {
    registro,
    totalesFiscales,
    motivoTodas: todas ? 'pedido con --todas' : 'no se pudo leer el registro del bot',
  })
}

async function main() {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const todas = args.includes('--todas')

  const { makeGoogleClient } = await import('../lib/google.mjs')
  const google = await makeGoogleClient()
  // La base entra por el mismo `query` que usa todo el orquestador. Si no responde, `filasDelBot`
  // devuelve null y el auditor DECLARA que auditó la pestaña entera, en vez de leer el silencio como
  // "el bot no cargó nada" y no mirar ni una fila.
  let db = null
  try { db = await import('../lib/db.mjs') } catch { db = null }
  const port = db ? { query: (...a) => db.query(...a) } : null

  const r = await auditar({ google, port, todas })
  process.stdout.write(json ? `${JSON.stringify(r, null, 2)}\n` : `${informe(r)}\n`)
  await db?.closePool?.().catch?.(() => {})
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e?.stack ?? e); process.exitCode = 1 })
}
