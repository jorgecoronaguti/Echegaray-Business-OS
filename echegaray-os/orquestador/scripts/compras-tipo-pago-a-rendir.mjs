#!/usr/bin/env node
// «A RENDIR» EN EL DESPLEGABLE DE «TIPO PAGO» DE COMPRAS — decisión del dueño del 22/09/2026 («si»).
//
// Efectivo a rendir: el gasto pagado con plata que la empresa ya entregó a una persona va a Compras
// con Tipo pago «A rendir», que NO resta de la caja física (la entrega ya la restó). Sin el valor en
// el desplegable estricto, el cargador vacía la celda (`tipoPagoValido` contra la lista viva) y el
// gasto entraría sin medio — o alguien escribiría «Efectivo» y el billete saldría dos veces.
//
// QUÉ HACE, Y SÓLO ESO. Lee la regla ONE_OF_LIST viva de la columna «Tipo pago» (por RÓTULO, no por
// letra: con «Obra» insertada es la Q), le AGREGA «A rendir» al final y la vuelve a poner en las MISMAS
// filas donde estaba, con el mismo `strict` y el mismo `showCustomUi`. No toca ningún valor, ninguna
// otra columna ni ninguna fila donde el desplegable no estaba. Si «A rendir» ya está, no hace nada.
//
//   ORQ_CASHFLOW_ID=<copia> node orquestador/scripts/compras-tipo-pago-a-rendir.mjs [--aplicar]
//   node orquestador/scripts/compras-tipo-pago-a-rendir.mjs --aplicar --real      ← el Sheet real
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { COMPRAS, PESTANAS, columnasDe, rangoEncabezado } from '../lib/columnas-por-encabezado.mjs'

const REAL = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const ID = process.env.ORQ_CASHFLOW_ID || REAL
const APLICAR = process.argv.includes('--aplicar')
export const VALOR = 'A rendir'

/**
 * NÚCLEO PURO: los tramos contiguos de filas (0-based, fin exclusivo) que tienen la regla, y la regla.
 * @param {Array} filas rowData de la columna, desde `fila0` (0-based)
 */
export function tramosConRegla(filas = [], fila0 = 0) {
  const tramos = []
  let regla = null
  filas.forEach((r, i) => {
    const dv = r?.values?.[0]?.dataValidation
    if (dv?.condition?.type !== 'ONE_OF_LIST') return
    regla = regla ?? dv
    const f = fila0 + i
    const ult = tramos.at(-1)
    if (ult && ult.fin === f) ult.fin = f + 1
    else tramos.push({ inicio: f, fin: f + 1 })
  })
  return { tramos, regla }
}

/** NÚCLEO PURO: la regla nueva — la misma, con «A rendir» al final. null si ya lo tenía. */
export function reglaConARendir(regla) {
  const valores = (regla?.condition?.values ?? []).map((v) => v.userEnteredValue)
  if (!valores.length || valores.includes(VALOR)) return null
  return { ...regla, condition: { ...regla.condition, values: [...valores, VALOR].map((v) => ({ userEnteredValue: v })) } }
}

async function main() {
  if (ID === REAL && APLICAR && !process.argv.includes('--real')) {
    console.error('✗ es el Sheet REAL: hace falta --real además de --aplicar'); process.exit(2)
  }
  const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const enc = (await g.readSheetValues(ID, rangoEncabezado('Compras')))?.[0] ?? []
  const { tipoPago } = columnasDe(enc, { tipoPago: COMPRAS.tipoPago }, 'Compras')
  const p = PESTANAS.Compras.primeraFila
  const alto = (await g.getSheetMeta(ID)).find((h) => h.title === 'Compras')
  const hasta = alto?.rows ?? 3000
  const hojas = await g.readSheetValidations(ID, `Compras!${tipoPago.letra}${p}:${tipoPago.letra}${hasta}`)
  const d = hojas?.[0]?.data?.[0] ?? {}
  const { tramos, regla } = tramosConRegla(d.rowData ?? [], d.startRow ?? p - 1)
  const nueva = reglaConARendir(regla)
  console.log(`Compras · «${COMPRAS.tipoPago}» = columna ${tipoPago.letra} · ${tramos.length} tramo(s) con desplegable: `
    + tramos.map((t) => `${t.inicio + 1}–${t.fin}`).join(', '))
  console.log(`lista actual: ${(regla?.condition?.values ?? []).map((v) => v.userEnteredValue).join(' · ') || '(sin regla)'}`)
  if (!regla) { console.error('✗ no encontré el desplegable: no toco nada'); process.exit(1) }
  if (!nueva) return console.log(`✓ «${VALOR}» ya estaba: nada que hacer`)
  if (!APLICAR) return console.log(`(sin --aplicar) agregaría «${VALOR}» en esos tramos, con strict=${regla.strict ?? false}`)
  const sheetId = alto.sheetId
  await g.spreadsheetBatchUpdate(ID, tramos.map((t) => ({
    setDataValidation: { range: { sheetId, startRowIndex: t.inicio, endRowIndex: t.fin, startColumnIndex: tipoPago.indice, endColumnIndex: tipoPago.indice + 1 }, rule: nueva },
  })))
  // VERIFICACIÓN POR EFECTO: se relee la regla en su destino, en la primera y la última fila.
  const v = await g.readSheetValidations(ID, [`Compras!${tipoPago.letra}${tramos[0].inicio + 1}`, `Compras!${tipoPago.letra}${tramos.at(-1).fin}`])
  const ok = v?.[0]?.data?.every((x) => x?.rowData?.[0]?.values?.[0]?.dataValidation?.condition?.values?.some((y) => y.userEnteredValue === VALOR))
  console.log(ok ? `✓ «${VALOR}» quedó en el desplegable (releído en la primera y la última fila)` : '✗ NO se ve en el destino')
  if (!ok) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
