#!/usr/bin/env node
// REEMPLAZA SÓLO LA FILA DEL ANCLA DE CAJA EN LOS DOS CASH FLOWS. Nada más.
//
// ═══ POR QUÉ CON BISTURÍ Y NO REHACIENDO LA PESTAÑA ═══
//
// El defecto está en UNA fila —"Efectivo y equivalentes al inicio del período"— y `cash-flow-rehacer`
// ya lo corrige. Pero ese generador reescribe la pestaña ENTERA, y el dueño borró líneas a mano en
// los dos cash flows: "no podés volver a escribir algo si yo ya lo borré, pasó en los dos cash
// flows". Mientras no exista la huella por celda que impide resucitar lo borrado, correr el
// generador completo es apostar a que esta vez no pasa. Esta corrección no necesita apostar: toca
// una fila y se verifica releyendo la cadena entera.
//
// ═══ EL DEFECTO ═══
//
// Las CINCO semanas de agosto arrancaban con el mismo saldo, $115.548.463. El ancla se decidía con
// `EOMONTH(col;0)=EOMONTH(CAJA_FECHA_SALDO;0)` —criterio MENSUAL— y en la semanal hay cinco columnas
// dentro del mismo mes: las cinco se declaraban "el mes del saldo" y ninguna encadenaba con la
// anterior. Cuatro eslabones perdidos, $84.148.028 de error arrastrados a las semanas siguientes.
//
//   node orquestador/scripts/cash-flow-ancla-bisturi.mjs            → muestra qué haría
//   node orquestador/scripts/cash-flow-ancla-bisturi.mjs --aplicar  → escribe y verifica la cadena

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { expresionInicio, verificarCadena } from '../lib/cash-flow-ancla-saldo.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const FILA_CAB = 3
const ROTULO = /inicio del per[íi]odo/i
const SALDO = 'CAJA_TOTAL_DISPONIBLE'
const FECHA = 'CAJA_FECHA_SALDO'

const letra = (n) => { let s = ''; let x = n + 1; while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = (x - 1 - r) / 26 } return s }
const plata = (n) => (n === null || n === undefined ? '—' : '$' + Math.round(Number(n)).toLocaleString('es-AR'))

const PESTAÑAS = [
  { nombre: 'Cash Flow Semanal', hasta: (i) => `${letra(i + 1)}$${FILA_CAB}+7` },
  { nombre: 'Cash Flow Mensual', hasta: (i) => `EOMONTH(${letra(i + 1)}$${FILA_CAB};0)+1` },
]

async function unaPestaña(google, meta, { nombre, hasta }) {
  const hoja = meta.find((s) => s.title === nombre)
  if (!hoja) throw new Error(`no encontré la pestaña "${nombre}"`)

  const formulas = await google.readSheetValues(ID, `${nombre}!A1:BZ80`, { render: 'FORMULA' })
  const iInicio = (formulas ?? []).findIndex((f) => ROTULO.test(String(f?.[0] ?? '')))
  if (iInicio < 0) throw new Error(`${nombre}: no encontré la fila "…al inicio del período"`)
  // El cierre es la fila de abajo y el neto la de arriba: es el contrato del cuadro, y si no se
  // cumple no toco nada — escribir el ancla apuntando a la fila equivocada es peor que no tocar.
  const filaInicio = iInicio + 1
  const filaCierre = filaInicio + 1
  const filaNeto = filaInicio - 1
  if (!/cierre del per[íi]odo/i.test(String(formulas[iInicio + 1]?.[0] ?? ''))) {
    throw new Error(`${nombre}: debajo del inicio no está el cierre; la pestaña cambió de forma`)
  }

  const cabeceras = (await google.readSheetValues(ID, `${nombre}!A${FILA_CAB}:BZ${FILA_CAB}`, { render: 'FORMATTED_VALUE' }))?.[0] ?? []
  const nCols = cabeceras.filter((c, i) => i > 0 && String(c ?? '').trim()).length
  if (nCols < 2) throw new Error(`${nombre}: sólo ${nCols} columna(s) de período`)

  const nuevas = Array.from({ length: nCols }, (_, i) => expresionInicio({
    desde: `${letra(i + 1)}$${FILA_CAB}`,
    hasta: hasta(i),
    refSaldo: SALDO,
    refFecha: FECHA,
    anterior: i === 0 ? null : `${letra(i)}${filaCierre}`,
  }))
  const viejas = (formulas[iInicio] ?? []).slice(1, nCols + 1).map((c) => String(c ?? ''))
  const cambian = nuevas.filter((f, i) => f !== viejas[i]).length

  console.log(`\n═══ ${nombre} · fila ${filaInicio} · ${nCols} columnas · ${cambian} fórmula(s) cambian`)
  console.log(`  antes  ${viejas[8] ?? viejas[0]}`)
  console.log(`  ahora  ${nuevas[8] ?? nuevas[0]}`)
  if (!APLICAR) return

  await google.spreadsheetBatchUpdate(ID, [{ updateCells: {
    range: { sheetId: hoja.sheetId, startRowIndex: filaInicio - 1, endRowIndex: filaInicio, startColumnIndex: 1, endColumnIndex: nCols + 1 },
    rows: [{ values: nuevas.map((f) => ({ userEnteredValue: { formulaValue: f } })) }],
    fields: 'userEnteredValue' } }], { espejo: true })

  // ── LA EVIDENCIA: la cadena releída del archivo, verificada con un criterio que no es el suyo.
  const vals = await google.readSheetValues(ID, `${nombre}!A${filaNeto}:BZ${filaCierre}`, { render: 'UNFORMATTED_VALUE' })
  const num = (v) => (typeof v === 'number' ? v : null)
  const filas = Array.from({ length: nCols }, (_, i) => ({
    periodo: String(cabeceras[i + 1] ?? ''),
    neto: num(vals?.[0]?.[i + 1]) ?? 0,
    inicio: num(vals?.[1]?.[i + 1]),
    cierre: num(vals?.[2]?.[i + 1]),
  }))
  const { identidad, enlace } = verificarCadena(filas)
  const conDato = filas.filter((f) => f.inicio !== null)
  console.log(`  ${conDato.length} período(s) con saldo · primero ${conDato[0]?.periodo} ${plata(conDato[0]?.inicio)}`
    + ` · último ${conDato.at(-1)?.periodo} ${plata(conDato.at(-1)?.cierre)}`)
  for (const r of [...identidad, ...enlace].slice(0, 8)) console.error(`  ✗ ${r.periodo ?? ''} ${JSON.stringify(r)}`)
  if (identidad.length || enlace.length) {
    console.error(`  ✗✗ ${identidad.length} período(s) donde inicio+neto≠cierre · ${enlace.length} eslabón(es) rotos`)
    process.exitCode = 1
  } else {
    console.log('  ✓ la cadena cierra entera: inicio+neto=cierre en cada período, y cada cierre es el inicio del siguiente')
  }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  for (const p of PESTAÑAS) await unaPestaña(google, meta, p)
  if (!APLICAR) console.log('\n(sin --aplicar: no se escribió nada)')
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
