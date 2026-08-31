#!/usr/bin/env node
// _RECIBOS_RAW — LOS RECIBOS DE SUELDO ADENTRO DEL SHEET. Hermana de _BANCO_RAW, _ARCA_RAW y _UOCRA_RAW.
//
// ═══ POR QUÉ (31/08/2026) ═══
//
// El 31/08 el dueño ordenó que la columna «POR BANCO» de la Nómina deje de ser el 50% calculado y
// pase a ser lo que dice el recibo del estudio contable. Se hizo — y se hizo mal: el generador leía
// el neto de Postgres y **pegaba el número** en la pestaña.
//
// Eso viola la regla de oro 5, que dice textual: *«Nunca un número pegado: todo en celda referenciada
// y/o fórmula. El dato de ORIGEN sí se pega, pero declarado (fecha + fuente) y en su pestaña
// réplica»*. El censo lo midió en cuanto la Nómina entró al registro de pestañas: **601 números
// calculados y pegados**.
//
// La regla que gobierna las otras tres réplicas es la misma y es la respuesta acá: **si el insumo no
// está en el archivo, se trae el INSUMO, no se pega el RESULTADO.** Los recibos viven en Postgres
// (`nomina_recibo_neto`, `nomina_adelanto`), o sea fuera del Sheet, así que la Nómina no tenía a qué
// apuntar. Ahora sí: esta pestaña es el insumo declarado y la Nómina la cita por fórmula.
//
// ═══ QUÉ ES DATO DE ORIGEN ACÁ, Y QUÉ NO ═══
//
// El neto de un recibo y el importe de una transferencia son HECHOS de afuera —los produce el
// estudio contable y el banco— y por eso se pegan, con su fuente al lado. Todo lo que el OS calcula
// a partir de ellos —el efectivo que completa, el total, los subtotales— es cálculo y va por fórmula
// en la pestaña que lo muestra. La línea está donde tiene que estar: acá termina el hecho.
//
//   node orquestador/scripts/recibos-raw-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { conColaMedidaLeida, avisoDeCola } from '../lib/cola-de-rango.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = '_RECIBOS_RAW'
const ANCHO = 8
const DRY = process.argv.includes('--dry')

/** Las dos tablas, una debajo de la otra, con el mismo ancho. */
export async function filasDeRecibos({ recibos = [], adelantos = [] } = {}) {
  const f = []
  const fila = (...c) => f.push([...c, ...Array(Math.max(0, ANCHO - c.length)).fill('')].slice(0, ANCHO))

  fila('_RECIBOS_RAW')
  fila('Réplica de lo que dice cada recibo de sueldo y cada transferencia a cuenta. Es INSUMO: la pestaña Nómina lo cita por fórmula.')
  fila(`Fuente: los PDF del estudio contable y el extracto del Santander · leído de Postgres el ${new Date().toLocaleDateString('es-AR')}`)
  fila('')
  fila('1 · LO QUE DICE CADA RECIBO')
  fila('CUIL', 'Período', 'Nombre del recibo', 'Legajo', 'Neto', 'Etiqueta', 'Fecha de pago', 'De dónde salió')
  for (const r of recibos) {
    fila(r.cuil, r.periodo, r.nombre_recibo, r.legajo ?? '', Number(r.neto), r.etiqueta ?? '',
      r.fecha_pago ? new Date(r.fecha_pago).toLocaleDateString('es-AR') : '', r.fuente)
  }
  fila('')
  fila('2 · LO YA TRANSFERIDO A CUENTA')
  fila('Referencia', 'Fecha', 'CUIL', 'Beneficiario', 'Importe', 'Concepto', '', 'De dónde salió')
  for (const a of adelantos) {
    fila(a.referencia, new Date(a.fecha).toLocaleDateString('es-AR'), a.cuil ?? '', a.beneficiario,
      Number(a.importe), a.concepto, '', a.fuente)
  }
  return f
}

async function main() {
  const recibos = (await query(
    `select distinct on (cuil, periodo) cuil, periodo, nombre_recibo, legajo, neto, etiqueta, fecha_pago, fuente
       from public.nomina_recibo_neto order by cuil, periodo, cargado_en desc`)).rows
  const adelantos = (await query(
    'select referencia, fecha, cuil, beneficiario, importe, concepto, fuente from public.nomina_adelanto order by fecha, referencia')).rows
  const filas = await filasDeRecibos({ recibos, adelantos })
  console.log(`${recibos.length} recibo(s) · ${adelantos.length} transferencia(s) a cuenta · ${filas.length} filas`)
  if (DRY) { for (const x of filas) console.log('   ', x.filter(Boolean).join(' | ').slice(0, 150)); return }

  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  let meta = await google.getSheetMeta(ID)
  if (!meta.find((h) => h.title === PESTANA)) {
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: {
      title: PESTANA, gridProperties: { rowCount: filas.length + 60, columnCount: ANCHO, frozenRowCount: 3 },
    } } }])
    meta = await google.getSheetMeta(ID)
  }
  // La cola se marca para limpiar lo que dejó una corrida anterior más larga, sin tocar nada ajeno.
  const cola = await conColaMedidaLeida(google, ID, `'${PESTANA}'`, filas, { ancho: ANCHO })
  if (avisoDeCola(cola, PESTANA)) console.log(avisoDeCola(cola, PESTANA))
  // `espejo: true` — es una réplica de un insumo, no una pantalla que alguien edite a mano.
  //
  // `respetar: false` CON EL MOTIVO, que es lo que exige la Regla 0: acá no hay un solo rótulo
  // escrito por una persona. Cada texto de esta pestaña es el nombre de un campo del recibo o del
  // extracto —CUIL, Período, Neto, Referencia— y las filas son hechos de afuera que se reemplazan
  // enteros en cada corrida. Preservar una edición manual sobre un dato de origen sería conservar
  // una corrección que después nadie puede explicar contra el papel. Si alguien necesita anotar
  // algo, el lugar es la pestaña que LEE esta réplica, no la réplica.
  await google.updateSheetValues(ID, `'${PESTANA}'!A1`, cola.filas, { espejo: true, respetar: false })
  // No se cree lo que devolvió la API: se relee.
  const leido = await google.readSheetValues(ID, `'${PESTANA}'!A1:H400`)
  console.log(`✓ releído del archivo: ${leido.filter((r) => String(r?.[0] ?? '').trim()).length} filas con contenido`)
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main().finally(closePool)
}
