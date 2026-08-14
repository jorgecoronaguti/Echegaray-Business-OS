#!/usr/bin/env node
// ¿QUÉ COMPRA ESTÁ RESTANDO DOS VECES DE LA CAJA?
//
// POR QUÉ (14/08). Con el extracto del 14/08 cargado, la fila 844 de Compras —Trielec, $2.205.400,34,
// "Débito", "Pagado"— tenía la Fecha de caja en 15/08 y el banco la había debitado el 12/08, o sea
// ANTES del corte del extracto. El saldo de _BANCO_RAW ya venía sin esa plata, y encima
// `formulaComprasPagadasPosteriores` la volvía a restar porque su condición es `Fecha de caja > corte`.
// $2,2M de menos en el número con el que se decide qué se paga esta semana, y ni un solo error.
//
// SÓLO LEE. Cruza `banco_movimientos` (Postgres) contra la pestaña Compras y dice qué fila mirar y por
// qué. NO corrige la Fecha de caja ni el Tipo pago: esas celdas son del dueño, el emparejamiento es por
// importe (probable, no cierto) y corregir sobre una coincidencia probable ya duplicó $2,1M en este repo.
//
//   node orquestador/scripts/auditar-doble-conteo-compras.mjs

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { auditarDobleConteo, comprasDeLaGrilla, COL } from '../lib/compras-doble-conteo.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Compras'
const FILA_ENCABEZADO = 3
const PRIMERA = FILA_ENCABEZADO + 1
const $ = (n) => `$${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Los rótulos que tienen que estar donde `COL` dice, o el control estaría leyendo otra columna. */
const ESPERADO = {
  [COL.fechaComprobante]: /fecha factura$/i,
  [COL.proveedor]: /^proveedor$/i,
  [COL.total]: /^total$/i,
  [COL.medioPago]: /^tipo pago$/i,
  [COL.estado]: /^estado$/i,
  [COL.fechaCaja]: /^fecha de caja$/i,
}

/** NÚCLEO PURO: ¿el encabezado sigue siendo el que `COL` asume? Devuelve los problemas. */
export function verificarEncabezado(fila = []) {
  const problemas = []
  for (const [i, re] of Object.entries(ESPERADO)) {
    const visto = String(fila?.[Number(i)] ?? '').trim()
    if (!re.test(visto)) problemas.push(`índice ${i} dice "${visto || '∅'}" y se esperaba ${re}`)
  }
  return problemas
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const encab = (await google.readSheetValues(ID, `${PESTANA}!A${FILA_ENCABEZADO}:AJ${FILA_ENCABEZADO}`))[0] ?? []
  // SI EL DUEÑO MOVIÓ UNA COLUMNA, ABORTA. Leer el "Tipo pago" de la columna de al lado no da error:
  // da un informe que absuelve filas culpables y acusa filas sanas. Misma defensa que el sync de cheques.
  const problemas = verificarEncabezado(encab)
  if (problemas.length) {
    console.error(`ABORTA: el encabezado de "${PESTANA}" (fila ${FILA_ENCABEZADO}) no es el que este control asume:`)
    problemas.forEach((p) => console.error(`   ${p}`))
    process.exitCode = 1
    return
  }

  // UNFORMATTED_VALUE: la Fecha de caja viene mixta (serie y texto) y el total como número. Pedir el
  // valor formateado obligaría a des-formatear plata, que es donde se pierden los centavos.
  const grid = await google.readSheetValues(ID, `${PESTANA}!A${PRIMERA}:AJ2000`, { render: 'UNFORMATTED_VALUE' })
  const compras = comprasDeLaGrilla(grid, PRIMERA)

  const { rows: debitos } = await query(
    `select fecha::text, concepto, importe::float8, referencia
       from public.banco_movimientos where importe < 0 order by fecha, id`)
  const { rows: [{ corte }] } = await query('select max(fecha)::text corte from public.banco_movimientos')
  if (!corte) { console.error('no hay movimientos del banco cargados: sin corte no hay control.'); process.exitCode = 1; return }

  const { hallazgos, montoDobleConteo, montoEfectivo } = auditarDobleConteo(compras, debitos, { corte })
  console.log(`${compras.length} compras con importe · ${debitos.length} débitos del banco · corte del extracto ${corte}\n`)

  const porMotivo = (m) => hallazgos.filter((h) => h.motivo === m)
  const dobles = porMotivo('doble_conteo_banco')
  console.log('═══ CAJA LAS RESTA DOS VECES: el banco ya las debitó y la Fecha de caja quedó después del corte ═══')
  if (!dobles.length) console.log('  ninguna')
  for (const h of dobles) {
    const c = h.candidatos[0]
    console.log(`  fila ${String(h.fila).padStart(4)}  ${String(h.proveedor).slice(0, 24).padEnd(26)} ${$(h.monto).padStart(16)}  ${h.medioPago}`)
    console.log(`            Fecha de caja ${h.fechaCaja} > corte ${corte}, pero el banco lo debitó el ${c.fecha} (ref ${c.referencia ?? '—'}: "${String(c.concepto).slice(0, 52)}")`)
  }
  if (dobles.length) console.log(`  ⇒ la disponibilidad de CAJA está ${$(montoDobleConteo)} MÁS BAJA de lo que es.`)

  const efectivo = porMotivo('medio_efectivo_pero_salio_del_banco')
  console.log('\n═══ DICEN "Efectivo" Y SALIERON DEL BANCO: bajan la caja física por un billete que no salió ═══')
  if (!efectivo.length) console.log('  ninguna')
  for (const h of efectivo) {
    const c = h.candidatos[0]
    console.log(`  fila ${String(h.fila).padStart(4)}  ${String(h.proveedor).slice(0, 24).padEnd(26)} ${$(h.monto).padStart(16)}`)
    console.log(`            el banco lo debitó el ${c.fecha} (ref ${c.referencia ?? '—'}: "${String(c.concepto).slice(0, 52)}")`)
  }
  if (efectivo.length) console.log(`  ⇒ ${$(montoEfectivo)} de caja física que en realidad salió por el banco.`)

  console.log('\nEste script NO escribe. Las celdas de Compras son del dueño y el cruce es por importe: probable, no cierto.')
  if (hallazgos.length) process.exitCode = 1
}

main()
  .catch((e) => { console.error(`Falló: ${String(e?.message ?? e)}`); process.exitCode = 1 })
  .finally(() => closePool?.())
