#!/usr/bin/env node
// ¿EL CASH FLOW SEMANAL Y EL MENSUAL CUENTAN LA MISMA EMPRESA? — SOLO LECTURA, nunca escribe.
//
// El criterio es el del dueño: "que la suma de las semanas de cada mes dé el mes". Se audita sobre
// el TOTAL DEL AÑO porque una semana cruza el fin de mes y repartirla es una convención; el año no
// tiene ese problema. El porqué completo, en lib/cash-flow-cuadre.mjs.
//
//   node orquestador/scripts/auditar-cuadre-cash-flow.mjs
//
// Sale con código 1 si algún renglón no cuadra: sirve como verificación ejecutable, no como informe.

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { mesesDeColumnas, cuadrarFila, TOLERANCIA } from '../lib/cash-flow-cuadre.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const SEMANAL = 'Cash Flow Semanal'
const MENSUAL = 'Cash Flow Mensual'

/** LAS FILAS SE UBICAN POR SU RÓTULO. Las dos pestañas comparten el mismo esqueleto de conceptos,
 *  así que el rótulo de la columna A es el contrato; el número de fila cambia cuando se regeneran. */
const LINEAS = [
  'Cobros por ventas y servicios (ya cobrado)',
  'Cobranzas esperadas — de este mes en adelante (proyección, suma al flujo)',
  '(–) Pagos al personal y cargas sociales',
  '(–) Pagos a proveedores de obra',
  '(–) Gastos de estructura y servicios',
  '(–) Pagos de impuestos',
  'IVA e Ingresos Brutos a pagar',
  'FLUJO NETO DE ACTIVIDADES OPERATIVAS',
  '(–) Adquisición de bienes de uso',
  '(–) Servicio de deuda financiera',
  'AUMENTO / (DISMINUCIÓN) NETA DEL EFECTIVO',
]

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const filaDe = (grid, rotulo) => grid.findIndex((f) => norm(f?.[0]) === norm(rotulo)) + 1
const money = (n) => Math.round(n).toLocaleString('es-AR')

async function main() {
  const google = makeGoogleClient({ config: loadConfig() })
  const sem = await google.readSheetValues(ID, `'${SEMANAL}'!A1:BZ60`)
  const men = await google.readSheetValues(ID, `'${MENSUAL}'!A1:N60`)
  const iCab = sem.findIndex((f) => norm(f?.[0]) === 'período')
  if (iCab < 0) { console.error(`no encuentro la fila "Período" en "${SEMANAL}" — sin ella no sé de qué mes es cada semana`); process.exit(2) }
  const meses = mesesDeColumnas(sem[iCab])

  console.log(`Cuadre ${SEMANAL} ↔ ${MENSUAL} · total del año · tolerancia $${TOLERANCIA}\n`)
  console.log('concepto'.padEnd(60), 'MENSUAL'.padStart(16), 'SEMANAL'.padStart(16), 'DIFERENCIA'.padStart(16))
  let malos = 0
  const noEncontradas = []
  for (const rotulo of LINEAS) {
    const fs = filaDe(sem, rotulo)
    const fm = filaDe(men, rotulo)
    // Una fila que no está NO se saltea en silencio: puede ser justamente la que el dueño borró.
    if (!fs || !fm) { noEncontradas.push(`${rotulo} (semanal:${fs || 'no está'} · mensual:${fm || 'no está'})`); continue }
    const r = cuadrarFila(sem[fs - 1], men[fm - 1], meses)
    const mal = Math.abs(r.diferencia) > TOLERANCIA
    if (mal) malos++
    console.log((mal ? '⚠ ' : '  ') + rotulo.slice(0, 58).padEnd(58),
      money(r.mensual).padStart(16), money(r.semanal).padStart(16), money(r.diferencia).padStart(16))
  }
  for (const n of noEncontradas) console.log(`⚠ sin comparar — la línea no está en las dos pestañas: ${n}`)
  console.log(malos
    ? `\n⚠ ${malos} renglón(es) donde los dos cuadros NO cuentan lo mismo.\n`
      + '  Causa conocida: el mensual proyecta los egresos de los meses futuros y el semanal no\n'
      + '  (formulaRubroEnVentana sólo suma filas reales; no tiene rama de proyección).'
    : '\n✓ los dos cuadros cuentan lo mismo en todos los renglones')
  process.exit(malos || noEncontradas.length ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(2) })
}
