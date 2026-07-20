#!/usr/bin/env node
// Rehace el Cash Flow Semanal y el Mensual desde UNA sola lista de líneas.
//
// Antes cada pestaña tenía su propia lista escrita a mano y no coincidían: el Mensual se comía
// $9.825.332 de servicios recurrentes, los dos leían Estructura de un rango muerto ($33.223.269 en
// cero) y la nómina estaba abierta en el Semanal y junta en el Mensual. Ahora las dos salen de
// cash-flow-lineas.mjs y cada línea es un rubro de la columna "Rubro de caja" de Compras, que es
// una partición: duplicar es imposible, y lo que quedara afuera lo muestra el control del pie.
//
//   node orquestador/scripts/cash-flow-rehacer.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import {
  lineasEgreso, formulaRubroEnVentana, formulaJornales, formulaCobranzas, bloqueControl,
} from '../lib/cash-flow-lineas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const AÑO = 2026

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

// ── Las 53 semanas del año, arrancando el lunes ───────────────────────────────────────────────────
function semanas() {
  const d = new Date(Date.UTC(AÑO, 0, 1))
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1) // retroceder al lunes
  const out = []
  for (let i = 0; i < 53; i++) { out.push(new Date(d)); d.setUTCDate(d.getUTCDate() + 7) }
  return out
}
const fechaAR = (d) => `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`

/**
 * Arma la grilla de una pestaña de cash flow.
 * @param {'semanal'|'mensual'} periodo
 */
function grilla(periodo) {
  const cols = periodo === 'semanal' ? semanas() : Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(AÑO, m, 1)))
  const n = cols.length
  const colTotal = letra(n + 1) // A + n períodos → la siguiente es el total
  const FILA_CAB = 3
  // Ventana de cada columna: el mes usa el primero del mes siguiente como límite excluyente, así
  // ningún día cae entre dos meses ni se cuenta dos veces (febrero no tiene 30).
  const desde = (i) => `${letra(i + 1)}$${FILA_CAB}`
  const hasta = (i) => (periodo === 'semanal' ? `${letra(i + 1)}$${FILA_CAB}+7` : `EOMONTH(${letra(i + 1)}$${FILA_CAB};0)+1`)

  const filas = []
  const meta = {} // dónde quedó cada cosa, para las fórmulas de totales
  const push = (celdas) => { filas.push(celdas); return filas.length }

  push([periodo === 'semanal' ? `Cash Flow Semanal ${AÑO} — cuándo entra y sale la plata` : `Cash Flow Mensual ${AÑO} — cuándo entra y sale la plata`])
  // A2 = el atajo a la semana de hoy. En una grilla de 53 semanas, sin esto hay que buscar a mano
  // dónde estamos cada vez que se abre la pestaña. El dueño lo pidió de vuelta después de que se lo
  // borré al rehacer el cuadro. HYPERLINK a la celda de la columna cuya semana contiene HOY.
  const irASemana = periodo === 'semanal'
    ? `=HYPERLINK("#gid=SEMGID&range="&SUBSTITUTE(ADDRESS(1;MATCH(1;ARRAYFORMULA((${letra(1)}$${FILA_CAB}:${letra(n)}$${FILA_CAB}<=TODAY())*(${letra(1)}$${FILA_CAB}:${letra(n)}$${FILA_CAB}+7>TODAY()));0)+1;4);"1";"");"📅 IR A LA SEMANA DE HOY — "&TEXT(TODAY();"dd/mm/yyyy"))`
    : `=HYPERLINK("#gid=SEMGID&range="&SUBSTITUTE(ADDRESS(1;MONTH(TODAY())+1;4);"1";"");"📅 IR AL MES DE HOY — "&TEXT(TODAY();"mmmm yyyy"))`
  push([irASemana, 'Cada línea de egreso es un rubro de la columna "Rubro de caja" de Compras. Esa columna es la ÚNICA definición: si un gasto cambia de rubro ahí, cambia acá.'])
  push(['Período', ...cols.map(fechaAR), `Total ${AÑO}`])

  push([])
  push(['INGRESOS DE CAJA (pestaña Cobranzas — por fecha de cobro, no de facturación)'])
  meta.ing0 = push(['Cobranzas Civil', ...cols.map((_, i) => formulaCobranzas('civil', desde(i), hasta(i)))])
  push(['Cobranzas Mantenimiento', ...cols.map((_, i) => formulaCobranzas('mantenimiento', desde(i), hasta(i)))])
  meta.ing1 = push(['Otras cobranzas', ...cols.map((_, i) => formulaCobranzas('otras', desde(i), hasta(i)))])
  meta.totIng = push(['TOTAL INGRESOS', ...cols.map((_, i) => `=SUM(${letra(i + 1)}${meta.ing0}:${letra(i + 1)}${meta.ing1})`)])

  push([])
  push(['EGRESOS DE CAJA — un renglón por rubro. El detalle de cada uno está en la pestaña que se indica.'])
  const lineas = lineasEgreso()
  meta.egr0 = filas.length + 1
  for (const l of lineas) {
    const f = l.paga === 'compras'
      ? cols.map((_, i) => formulaRubroEnVentana('$A' + (filas.length + 1), desde(i), hasta(i)))
      : cols.map((_, i) => formulaJornales(desde(i), hasta(i)))
    push([l.rubro, ...f])
  }
  meta.egr1 = filas.length
  meta.totEgr = push(['TOTAL EGRESOS', ...cols.map((_, i) => `=SUM(${letra(i + 1)}${meta.egr0}:${letra(i + 1)}${meta.egr1})`)])
  push([])
  meta.neto = push(['FLUJO NETO DEL PERÍODO', ...cols.map((_, i) => `=${letra(i + 1)}${meta.totIng}-${letra(i + 1)}${meta.totEgr}`)])
  meta.acum = push(['Flujo acumulado del año', ...cols.map((_, i) => (i === 0 ? `=${letra(1)}${meta.neto}` : `=${letra(i)}${filas.length + 1}+${letra(i + 1)}${meta.neto}`))])

  push([])
  const filaRef = push(['DÓNDE ESTÁ EL DETALLE DE CADA LÍNEA'])
  for (const l of lineas) {
    push([l.rubro, l.paga === 'compras' ? `Compras (rubro "${l.rubro}") · detalle en la pestaña ${l.detalle}` : `Pestaña ${l.paga} — el monto NO sale de Compras`])
  }

  push([])
  push(['CONTROL — que no falte ni sobre nada'])
  const filaCtrl = filas.length + 1
  for (const c of bloqueControl(meta.egr0, meta.egr1, 'B', filaCtrl)) push([c.etiqueta, c.formula, c.nota])

  // El total del año, columna por columna, para las filas que lo tienen sentido.
  const conTotal = [meta.ing0, meta.ing0 + 1, meta.ing1, meta.totIng, meta.totEgr, meta.neto]
  for (let f = meta.egr0; f <= meta.egr1; f++) conTotal.push(f)
  for (const f of conTotal) {
    filas[f - 1][n + 1] = `=SUM(${letra(1)}${f}:${letra(n)}${f})`
  }

  return { filas, meta, n, colTotal, filaCtrl, filaRef }
}

// clearValues borra el contenido pero NO el formato: la grilla nueva cae sobre celdas que tenían el
// formato de la grilla vieja y quedan números crudos al lado de importes. Se reformatea entero.
async function formatear(google, data) {
  const meta = await google.getSheetMeta(ID)
  const AZUL = { red: 0.17, green: 0.25, blue: 0.37 }
  const GRIS = { red: 0.93, green: 0.94, blue: 0.95 }
  const req = []
  for (const d of data) {
    const p = d.range.split('!')[0]
    const h = meta.find((s) => s.title === p)
    if (!h) continue
    const { sheetId } = h
    const g = d.g
    const filas = d.values.length
    const cols = d.values[0].length
    const rango = (r0, r1, c0 = 0, c1 = cols) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
    const fmt = (r, fields, format) => req.push({ repeatCell: { range: r, cell: { userEnteredFormat: format }, fields } })

    // El layout viejo tenía celdas combinadas. Congelar una columna que parte una combinación es un
    // error duro de la API, y una combinación suelta descoloca toda la fila que se escriba encima.
    req.push({ unmergeCells: { range: rango(0, filas) } })

    // Base: todo el cuadro en pesos, sin decimales, con el guion para el cero (así el ojo va a lo que sí pasó).
    fmt(rango(3, filas, 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
    // Título y subtítulo.
    fmt(rango(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 13 } })
    fmt(rango(1, 2), 'userEnteredFormat.textFormat', { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } } })
    // Fila de períodos: fecha corta y fondo oscuro.
    fmt(rango(2, 3), 'userEnteredFormat', {
      backgroundColor: AZUL,
      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 },
      numberFormat: { type: 'DATE', pattern: 'dd/mm' },
      horizontalAlignment: 'CENTER',
    })
    fmt({ ...rango(2, 3), startColumnIndex: cols - 1, endColumnIndex: cols }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
    // Encabezados de sección y totales.
    for (const [r, fondo] of [[4, GRIS], [9, GRIS]]) fmt(rango(r, r + 1), 'userEnteredFormat', { backgroundColor: fondo, textFormat: { bold: true, fontSize: 9 } })
    for (const r of [g.meta.totIng, g.meta.totEgr, g.meta.neto, g.meta.acum]) {
      fmt(rango(r - 1, r), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
        { textFormat: { bold: true }, backgroundColor: { red: 0.89, green: 0.91, blue: 0.94 } })
    }
    // El bloque de referencias y el de control son texto, no plata.
    fmt(rango(g.filaRef - 1, filas, 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' })
    fmt({ ...rango(g.filaCtrl - 1, g.filaCtrl + 4), startColumnIndex: 1, endColumnIndex: 2 },
      'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' }, horizontalAlignment: 'RIGHT' })
    fmt(rango(g.filaCtrl - 2, g.filaCtrl - 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true } })
    // Columna A ancha (los rubros tienen nombre largo), períodos angostos.
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 260 }, fields: 'pixelSize' } })
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: cols }, properties: { pixelSize: 96 }, fields: 'pixelSize' } })
    // Congelar el encabezado y la columna de rubros: sin esto, en la semana 40 no se sabe qué se está mirando.
    req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 3, frozenColumnCount: 1 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } })
  }
  await google.spreadsheetBatchUpdate(ID, req)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const data = []
  for (const [pestaña, periodo] of [['Cash Flow Semanal', 'semanal'], ['Cash Flow Mensual', 'mensual']]) {
    const g = grilla(periodo)
    const ancho = Math.max(...g.filas.map((f) => f.length))
    // Normalizar el rectángulo: si una fila es más corta, la API deja lo viejo debajo.
    const cuadro = g.filas.map((f) => { const r = [...f]; while (r.length < ancho) r.push(''); return r })
    console.log(`${pestaña}: ${cuadro.length} filas x ${ancho} columnas · egresos ${g.meta.egr0}-${g.meta.egr1} · control fila ${g.filaCtrl}`)
    data.push({ range: `${pestaña}!A1:${letra(ancho - 1)}${cuadro.length}`, values: cuadro, g, pestaña })
  }
  if (DRY) {
    console.log('\n--dry. Muestra de las primeras líneas del semanal:')
    for (const f of data[0].values.slice(0, 12)) console.log('  ', f.slice(0, 3).map((x) => String(x).slice(0, 60)).join(' | '))
    return
  }

  // Limpiar primero lo viejo: la grilla nueva es más corta que la que había y quedarían restos
  // (incluidas las columnas auxiliares BE/BF, que ahora viven en Compras).
  // El HYPERLINK necesita el gid REAL de la pestaña: se resuelve acá, no se adivina.
  const metaGid = await google.getSheetMeta(ID)
  for (const d of data) {
    const gid = metaGid.find((s) => s.title === d.pestaña)?.sheetId
    d.values = d.values.map((f) => f.map((c) => (typeof c === 'string' ? c.replace('SEMGID', String(gid)) : c)))
  }
  for (const p of ['Cash Flow Semanal', 'Cash Flow Mensual']) await google.clearValues(ID, `${p}!A1:BZ200`)
  await google.batchUpdateValues(ID, data.map(({ range, values }) => ({ range, values })))
  await formatear(google, data)
  console.log('\nEscrito. Verificando contra el Sheet…')

  for (const p of ['Cash Flow Semanal', 'Cash Flow Mensual']) {
    const v = await google.readSheetValues(ID, `${p}!A1:BZ120`)
    const err = []
    v.forEach((f, i) => (f || []).forEach((c, j) => {
      if (/^#(REF|ERROR|N\/A|VALUE|¡|DIV|NAME|NUM|NULL)/.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`)
    }))
    const ctrl = v.findIndex((f) => String(f?.[0] ?? '').startsWith('⇒ Diferencia'))
    console.log(`\n${p}: ${err.length ? '⚠ ' + err.length + ' celdas en error: ' + err.slice(0, 6).join(' ') : '✓ sin errores'}`)
    if (ctrl >= 0) {
      console.log(`  Compras total:        ${v[ctrl - 2]?.[1]}`)
      console.log(`  Suma de las líneas:   ${v[ctrl - 1]?.[1]}`)
      console.log(`  ⇒ Diferencia:         ${v[ctrl]?.[1]}`)
      console.log(`  Sin fecha de pago:    ${v[ctrl + 1]?.[1]}`)
    }
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
