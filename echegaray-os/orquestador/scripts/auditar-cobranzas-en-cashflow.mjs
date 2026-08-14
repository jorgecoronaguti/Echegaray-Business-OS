#!/usr/bin/env node
// ¿CADA COBRO DE COBRANZAS LLEGA AL CASH FLOW, Y AL MES QUE CORRESPONDE?
//
// POR QUÉ EXISTE (21/07). El dueño: "hay montos que salen en cobranzas que tienen fechas
// actualizadas y no se están viendo reflejados los cambios en cash flows y demás, revisar en
// profundidad".
//
// Comparar los TOTALES no alcanza y es engañoso: el total de las tres líneas del cash flow cuadraba
// al peso con Cobranzas, y aun así puede haber un cobro contado en el mes equivocado —dos errores
// que se compensan dan diferencia cero—. La única verificación que sirve es fila por fila: dónde
// dice Cobranzas que entra cada peso, y dónde lo pone el cuadro.
//
// LO QUE MIRA, QUE ES DONDE SE ESCONDEN LOS DESVÍOS:
//   · el cobro que no aparece en ninguna columna (queda fuera de la ventana del cuadro);
//   · el que aparece en un mes distinto al de su fecha de cobro;
//   · el que el cuadro descarta por una marca del OS que quedó vieja (endosado);
//   · el que no se puede clasificar porque le falta la unidad de negocio.
//
//   node orquestador/scripts/auditar-cobranzas-en-cashflow.mjs

// SIN `scopes`: un auditor no tiene con qué escribir. Pedía los de escritura sin usarlos nunca.
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { auditar } from '../lib/cobranzas-en-cashflow.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const ars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

async function main() {
  const google = makeGoogleClient({ config: loadConfig() })
  const [cob, cf] = await Promise.all([
    google.readSheetGrid(ID, 'Cobranzas!A5:BC400'),
    // DESDE LA FILA 1 Y CON MARGEN: el cuadro se lee entero y `ubicarCuadro` busca sus anclas de
    // texto adentro. El rango viejo (`A3:N9`) era el layout de antes de la matriz y ya no existía.
    google.readSheetGrid(ID, 'Cash Flow Mensual!A1:N40'),
  ])

  const r = auditar(cob.filas, cf.filas)
  if (r.noPudoUbicar) {
    console.error(`✖ NO PUDE UBICAR EL CUADRO: ${r.noPudoUbicar}`)
    console.error('  No audito contra una ventana que no encontré: un "todo fuera del cuadro" sería inventado.')
    process.exitCode = 1
    return
  }

  console.log(`${r.cobros.length} cobros cargados por ${ars(r.totalCobranzas)}`)
  console.log(`el cash flow muestra ${ars(r.totalCashFlow)} en sus ${r.meses.length} columnas`)
  console.log(`(líneas de ingreso leídas: ${r.ingreso.map((i) => `${i.de} → fila ${i.fila + 1}`).join(' · ')})\n`)

  const bloques = [
    ['⚠ NO LLEGAN AL CUADRO — fuera de la ventana de meses', r.fueraDeVentana],
    ['⚠ DESCARTADOS por la marca de endosado del OS', r.endosados],
    ['⚠ SIN UNIDAD DE NEGOCIO — no se pueden clasificar', r.sinUnidad],
    ['⚠ SIN FECHA DE COBRO NI DE VENTA — el cuadro no sabe cuándo entran', r.sinFecha],
  ]
  for (const [titulo, filas] of bloques) {
    if (!filas.length) continue
    const suma = filas.reduce((s, f) => s + f.monto, 0)
    console.log(`${titulo}: ${filas.length} por ${ars(suma)}`)
    for (const f of filas.slice(0, 12)) console.log(`   fila ${String(f.fila).padStart(3)}  ${ars(f.monto).padStart(15)}  ${f.cliente.slice(0, 30)}  ${f.motivo ?? ''}`)
    if (filas.length > 12) console.log(`   … y ${filas.length - 12} más`)
    console.log()
  }

  console.log('MES A MES — lo que dice Cobranzas contra lo que muestra el cuadro:')
  let malos = 0
  for (const m of r.porMes) {
    const dif = m.cobranzas - m.cashflow
    if (Math.abs(dif) >= 1) malos++
    console.log(`   ${m.mes}  Cobranzas ${ars(m.cobranzas).padStart(15)}  cuadro ${ars(m.cashflow).padStart(15)}  ${Math.abs(dif) < 1 ? '✓' : `⚠ ${ars(dif)}`}`)
  }

  console.log()
  if (!malos && !r.fueraDeVentana.length && !r.sinFecha.length) {
    console.log('✓ cada cobro llega al cuadro y al mes de su fecha de cobro')
  } else {
    console.log(`⚠ ${malos} mes(es) no coinciden`)
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
