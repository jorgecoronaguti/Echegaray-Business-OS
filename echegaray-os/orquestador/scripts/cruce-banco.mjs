#!/usr/bin/env node
// EL EXTRACTO CONTRA EL SHEET: ¿QUÉ SE MOVIÓ DE VERDAD Y QUÉ NO ESTÁ CARGADO?
//
// POR QUÉ (21/07). Compras dice lo que se compró y Cobranzas lo que se facturó. Los dos son
// intenciones hasta que el banco las confirma. El extracto es el único documento que dice qué pasó,
// y hasta hoy el OS no lo miraba: el cash flow podía estar perfecto contra sí mismo y equivocado
// contra la cuenta.
//
// LO QUE HACE: agrupa el extracto por tipo de movimiento y, para cada grupo, busca cuánto de eso ve
// el Sheet en la misma ventana de fechas. No concilia comprobante por comprobante —el extracto no
// trae número de factura— sino masa contra masa, que es lo que alcanza para encontrar un agujero.
//
// LO QUE NO HACE: no escribe nada ni corrige nada. Varias diferencias son trabajo de carga, no
// defectos, y taparlas automáticamente sería inventar.
//
//   node orquestador/scripts/cruce-banco.mjs

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { MOVIMIENTOS, verificarCadena, porTipo, CUENTA, CORTE, ORIGEN, enCartera, endosados, totalEcheqs } from '../lib/banco-santander.mjs'
import { parseMonto, parseFecha } from '../lib/cash-briefing.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const ars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`
const DESDE = new Date(2026, 6, 4)   // el extracto arranca después del último movimiento del 03/07
const HASTA = new Date(2026, 6, 22)  // exclusivo

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // ── LO PRIMERO: ¿la transcripción del extracto es exacta? ─────────────────────────────────────
  const cadena = verificarCadena()
  console.log(`EXTRACTO ${ORIGEN}`)
  if (cadena.rotas.length) {
    console.log(`  ⚠ ${cadena.rotas.length} filas donde el saldo no encadena — la transcripción tiene un error y NO se puede usar`)
    cadena.rotas.slice(0, 5).forEach((r) => console.log(`     ${r.fecha} ${r.concepto}: calculé ${ars(r.calculado)} y el extracto dice ${ars(r.saldo)}`))
    process.exitCode = 1
    return
  }
  console.log(`  ✓ ${MOVIMIENTOS.length} movimientos, la cadena de saldos cierra en ${ars(cadena.saldoFinal)} = el saldo del banco`)

  // ── EL EXTRACTO POR TIPO ──────────────────────────────────────────────────────────────────────
  console.log('\nQUÉ SE MOVIÓ, POR TIPO (04/07 al 21/07)')
  for (const t of porTipo()) console.log(`  ${t.tipo.padEnd(38)}${String(t.cantidad).padStart(3)} mov  ${ars(t.monto).padStart(16)}`)

  // ── CONTRA COMPRAS ────────────────────────────────────────────────────────────────────────────
  const compras = await google.readSheetValues(ID, 'Compras!A4:AD800')
  const enVentana = compras.filter((f) => {
    const d = parseFecha(f?.[29])
    return d && d >= DESDE && d < HASTA
  })
  const egresoSheet = enVentana.reduce((s, f) => s + parseMonto(f?.[14]), 0)
  const egresoBanco = MOVIMIENTOS.filter((m) => m.importe < 0).reduce((s, m) => s + m.importe, 0)
  console.log('\nEGRESOS — el banco contra Compras, misma ventana')
  console.log(`  banco:   ${ars(-egresoBanco).padStart(16)}  (${MOVIMIENTOS.filter((m) => m.importe < 0).length} débitos)`)
  console.log(`  Compras: ${ars(egresoSheet).padStart(16)}  (${enVentana.length} filas con fecha de caja en la ventana)`)
  console.log(`  ⇒ diferencia: ${ars(-egresoBanco - egresoSheet)}`)
  console.log('     No tienen por qué dar igual: un pago con cheque sale del banco el día que se debita y de')
  console.log('     Compras el día que dice su fecha de caja. La diferencia sirve para buscar, no para acusar.')

  // ── LO QUE NO PUEDE ESTAR EN COMPRAS ──────────────────────────────────────────────────────────
  // Son costos del BANCO, no compras a proveedores. Si no están en ningún lado, son egresos que el
  // cash flow no ve y que se repiten todos los meses.
  const bancarios = porTipo().filter((t) => /Impuesto al cheque|Costo financiero/.test(t.tipo))
  const totalBancario = bancarios.reduce((s, t) => s + t.monto, 0)
  console.log('\nCOSTOS BANCARIOS — los que no son una compra a nadie')
  for (const t of bancarios) console.log(`  ${t.tipo.padEnd(38)}${String(t.cantidad).padStart(3)} mov  ${ars(t.monto).padStart(16)}`)
  const enComprasBancario = enVentana.filter((f) => /ley 25|impuesto al cheque|descubierto|interes|interés/i.test(`${f?.[4] ?? ''} ${f?.[11] ?? ''}`))
  console.log(`  ${ars(-totalBancario)} en 18 días. Compras tiene ${enComprasBancario.length} filas que se le parezcan.`)
  if (!enComprasBancario.length) {
    console.log('  ⚠ NINGUNA. El impuesto al cheque y el costo del descubierto no están en ninguna línea del')
    console.log(`     cash flow. Al ritmo de estos 18 días son del orden de ${ars(-totalBancario / 18 * 30)} por mes.`)
  }

  // ── INGRESOS ──────────────────────────────────────────────────────────────────────────────────
  const cob = await google.readSheetValues(ID, 'Cobranzas!A5:R300')
  const cobVentana = cob.filter((f) => {
    const d = parseFecha(f?.[16])
    return d && d >= DESDE && d < HASTA
  })
  const ingresoSheet = cobVentana.reduce((s, f) => s + parseMonto(f?.[12]), 0)
  const ingresoBanco = MOVIMIENTOS.filter((m) => m.importe > 0).reduce((s, m) => s + m.importe, 0)
  console.log('\nINGRESOS — el banco contra Cobranzas, misma ventana')
  console.log(`  banco:     ${ars(ingresoBanco).padStart(16)}`)
  for (const m of MOVIMIENTOS.filter((x) => x.importe > 0)) console.log(`     ${m.fecha}  ${m.concepto.slice(0, 52).padEnd(54)}${ars(m.importe).padStart(14)}`)
  console.log(`  Cobranzas: ${ars(ingresoSheet).padStart(16)}  (${cobVentana.length} filas con fecha de cobro en la ventana)`)
  for (const f of cobVentana) console.log(`     ${String(f?.[16]).padEnd(12)}${String(f?.[6] ?? '').slice(0, 34).padEnd(36)}${String(f?.[13] ?? '').padEnd(14)}${ars(parseMonto(f?.[12])).padStart(14)}`)
  console.log(`  ⇒ diferencia: ${ars(ingresoBanco - ingresoSheet)}`)

  // ── LOS VALORES DE TERCEROS ───────────────────────────────────────────────────────────────────
  console.log('\nVALORES DE TERCEROS — lo que Cobranzas no puede saber')
  console.log(`  en cartera según el banco: ${ars(totalEcheqs(enCartera()))} (${enCartera().length} echeq)`)
  console.log(`  ENDOSADOS a un tercero:    ${ars(totalEcheqs(endosados()))} (${endosados().length} echeq)`)
  for (const e of endosados()) console.log(`     ${e.numero} vence ${e.pago} → ${e.beneficiario}: se entregó, no va a entrar a la cuenta`)
  const echeqFuturos = cob.filter((f) => {
    const d = parseFecha(f?.[16])
    return /eche?q/i.test(String(f?.[13] ?? '')) && d && d > new Date()
  })
  const esperado = echeqFuturos.reduce((s, f) => s + parseMonto(f?.[12]), 0)
  console.log(`  Cobranzas espera cobrar en echeq, de acá en adelante: ${ars(esperado)} (${echeqFuturos.length} filas)`)
  console.log(`  ⇒ el cash flow cuenta ${ars(esperado - totalEcheqs(enCartera()))} de ingreso que ya se entregó`)

  console.log(`\nSaldo del banco al ${CORTE}: ${ars(CUENTA.saldoPesos)} en pesos · U$S ${CUENTA.saldoDolares} en dólares`)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
