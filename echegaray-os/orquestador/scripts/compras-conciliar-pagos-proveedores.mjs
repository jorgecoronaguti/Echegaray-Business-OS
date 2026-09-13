#!/usr/bin/env node
// PAGOS QUE YA SALIERON Y COMPRAS NO REFLEJA — propone (y con --aplicar escribe) V/W fila por fila.
//
//   node orquestador/scripts/compras-conciliar-pagos-proveedores.mjs             → ensayo: tabla, no escribe
//   node orquestador/scripts/compras-conciliar-pagos-proveedores.mjs --aplicar   → escribe con bisturí
//
// POR QUÉ (13/09/2026). Reclamo del dueño del 11/09: Proveedores le muestra más deuda que la real.
// «Se le debe» es `Compras!AL` = O − T − W y lee bien; lo que nadie hacía es llevar el pago del mundo
// (débito del Santander, echeq del registro, comprobante del mail) a la W de la factura que cancela.
// Las reglas del cruce —CUIT, fecha ≥ factura, importe exacto, «ya aplicado gana», ambiguo no se
// elige— viven y se prueban en `lib/conciliar-pagos-proveedores.mjs`.
//
// CÓMO ESCRIBE. V («Fecha prevista de pago 2») ← fecha del pago · W («Monto Parcial 2») ← O − T. X
// sólo si es un valor pisado (si es fórmula se recalcula sola). Nunca T, nunca AB–AN. Antes de escribir
// relee la pestaña y exige que cada fila siga siendo la del cruce (`celdasDeFila`); respalda lo que
// había en V/W/X en JSON; después relee y exige AL = 0.
//
// Se corre desde el checkout principal, NUNCA desde un worktree (regla del Sheet real). Las tres
// consultas a la base van de a una: la instancia es chica y la comparten el bot y la web.
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { COL, cent, conciliar, filasDeCompras, pagosDeFuentes, resumenPorProveedor, celdasDeFila, isoDe } from '../lib/conciliar-pagos-proveedores.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Compras'
const FILA0 = 4
const APLICAR = process.argv.includes('--aplicar')
const $ = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')
const LETRA = { V: COL.fecha2, W: COL.parcial2, X: COL.estado }

async function leerCompras(google) {
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTANA)
  if (!hoja) throw new Error(`no encontré la pestaña «${PESTANA}»`)
  const rango = `'${PESTANA}'!A${FILA0}:AM${hoja.rows}`
  const valores = await google.readSheetValues(ID, rango, { render: 'UNFORMATTED_VALUE' })
  const formulas = await google.readSheetValues(ID, rango, { render: 'FORMULA' })
  return { hoja, rango, valores, formulas, filas: filasDeCompras(valores, FILA0) }
}

/** Las tres fuentes, secuenciales. `desde` acota al tramo donde hay facturas pendientes. */
async function leerPagos(desde) {
  const { rows: banco } = await query(
    `select fecha::text, concepto, importe::float8, referencia from public.banco_movimientos
      where importe < 0 and fecha >= $1`, [desde])
  // `cheques` no guarda la fecha de EMISIÓN: `emision` sale null y el cheque se declara sin aplicar.
  const { rows: cheques } = await query(
    `select numero, contraparte, contraparte_cuit, fecha_pago::text, importe::float8, estado, null::text as emision
       from public.cheques where tipo = 'emitido' and fecha_pago >= $1`, [desde])
  const { rows: transferencias } = await query(
    `select p.nombre, p.cuit, d.comprobante_fecha::text, d.comprobante_importe::float8, d.comprobante_numero
       from public.proveedor_documento d join public.proveedores p on p.id = d.proveedor_id
      where d.categoria = 'transferencia' and d.eliminado_en is null and d.comprobante_fecha >= $1`, [desde])
  return pagosDeFuentes({ banco, cheques, transferencias })
}

function imprimir(filas, r) {
  console.log('═══ POR PROVEEDOR ═══')
  console.log('proveedor'.padEnd(26) + 'publicada'.padStart(14) + 'pagos s/aplicar'.padStart(17) + 'deuda real'.padStart(14) + '  nota')
  for (const t of resumenPorProveedor(filas, r.propuestas)) {
    const nota = t.sinCuit ? 'sin CUIT en AM: no se puede conciliar' : ''
    console.log(t.proveedor.slice(0, 25).padEnd(26) + $(t.publicada).padStart(14) + $(t.sinAplicar).padStart(17) + $(t.real).padStart(14) + '  ' + nota)
  }
  console.log('\n═══ PROPUESTAS (fila por fila) ═══')
  if (!r.propuestas.length) console.log('  ninguna')
  for (const p of r.propuestas) {
    const pagos = p.pagos.map((x) => `${x.fuente} ${x.ref || ''} ${x.fecha} ${$(x.importe)}`).join(' + ')
    for (const f of p.filas) console.log(`  f${f.fila} ${f.proveedor} ${f.fecha} saldo ${$(f.saldo)} ← ${pagos} [${p.regla}]`)
  }
  console.log('\n═══ YA APLICADOS (el pago explica filas que dicen Pagado) ═══')
  for (const y of r.yaAplicados) console.log(`  ${y.pago.detalle.slice(0, 50)} ${$(y.pago.importe)} = ${y.filas.map((f) => 'f' + f.fila).join('+')}${y.ambiguo ? ' (más de un conjunto)' : ''}`)
  console.log('\n═══ AMBIGUOS · SIN FECHA · HUÉRFANOS (no se escriben) ═══')
  for (const a of r.ambiguos) console.log(`  ⚠ ${a.pago.detalle.slice(0, 50)} ${$(a.pago.importe)} — ${a.motivo}`)
  for (const s of r.sinFecha) console.log(`  · ${s.detalle.slice(0, 70)} ${$(s.importe)} — sin fecha de emisión`)
  for (const h of r.huerfanos) console.log(`  · ${h.fuente} ${h.fecha} ${h.detalle.slice(0, 50)} ${$(h.importe)} — ninguna fila pendiente da el importe`)
}

/** Plan de escritura contra la pestaña releída. */
function planDeEscritura(r, lectura) {
  const porFila = new Map(lectura.filas.map((f) => [f.fila, f]))
  const plan = []; const problemas = []
  for (const p of r.propuestas) {
    const fecha = p.pagos.map((x) => x.fecha).sort().at(-1)
    for (const f of p.filas) {
      const formulaX = lectura.formulas[f.fila - FILA0]?.[COL.estado]
      const d = celdasDeFila(f, porFila.get(f.fila), formulaX, fecha)
      if (d.problema) { problemas.push({ fila: f.fila, motivo: d.problema }); continue }
      const antes = Object.fromEntries(Object.keys(d.celdas).map((k) => [k, lectura.formulas[f.fila - FILA0]?.[LETRA[k]] ?? '']))
      plan.push({ fila: f.fila, proveedor: f.proveedor, celdas: d.celdas, antes })
    }
  }
  return { plan, problemas }
}

function requests(plan, sheetId) {
  return plan.flatMap((e) => Object.entries(e.celdas).map(([k, v]) => ({ updateCells: {
    range: { sheetId, startRowIndex: e.fila - 1, endRowIndex: e.fila, startColumnIndex: LETRA[k], endColumnIndex: LETRA[k] + 1 },
    rows: [{ values: [{ userEnteredValue: typeof v === 'number' ? { numberValue: v } : { stringValue: v } }] }],
    fields: 'userEnteredValue',
  } })))
}

async function aplicar(google, r) {
  const lectura = await leerCompras(google)
  const { plan, problemas } = planDeEscritura(r, lectura)
  for (const p of problemas) console.error(`  ✖ f${p.fila}: ${p.motivo}`)
  if (!plan.length) return console.log('\nNada que escribir.')
  const respaldo = `orquestador/datos/respaldos/compras-conciliar-pagos-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`
  mkdirSync(dirname(respaldo), { recursive: true })
  writeFileSync(respaldo, JSON.stringify({ archivo: ID, pestana: PESTANA, cuando: new Date().toISOString(), filas: plan }, null, 1))
  console.log(`  respaldo: ${respaldo}`)
  const w = await google.spreadsheetBatchUpdate(ID, requests(plan, lectura.hoja.sheetId))
  if (w?.congelado || w?.protegido) return console.log(`  no escribí: ${w.congelado ? 'freno de mano puesto' : 'pestaña candada'}`)
  // LA EVIDENCIA ES DEL EFECTO: se relee y AL tiene que haber caído a 0 en cada fila.
  const despues = filasDeCompras(await google.readSheetValues(ID, lectura.rango, { render: 'UNFORMATTED_VALUE' }), FILA0)
  let mal = 0
  for (const e of plan) {
    const f = despues.find((x) => x.fila === e.fila)
    const ok = f && cent(f.parcial2) === cent(e.celdas.W) && cent(f.saldo) === 0 && isoDe(f.fecha2)
    console.log(`  ${ok ? '✓' : '✖'} f${e.fila} ${e.proveedor} · W ${$(f?.parcial2)} · AL ${$(f?.saldo)} · X ${f?.estado}`)
    if (!ok) mal++
  }
  if (mal) { console.error(`\n✖ ${mal} fila(s) no dicen lo que escribí. Revertir con ${respaldo}.`); process.exitCode = 1 }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const { filas } = await leerCompras(google)
  const pend = filas.filter((f) => /^pendiente$/i.test(f.estado) && f.saldo > 0 && f.fecha).map((f) => f.fecha).sort()
  if (!pend.length) return console.log('No hay filas pendientes con saldo.')
  const r = conciliar(filas, await leerPagos(pend[0]))
  imprimir(filas, r)
  if (!APLICAR) return console.log('\n(ensayo: sin --aplicar no escribo nada)')
  await aplicar(google, r)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => closePool()).catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; return closePool() })
}
