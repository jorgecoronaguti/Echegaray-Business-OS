#!/usr/bin/env node
// CARGA MANUAL DE CHEQUES EMITIDOS — la puerta de entrada de un cheque librado, sin tocar nada más.
//
// POR QUÉ EXISTE (23/07). El dueño fotografió dos cheques de pago diferido recién librados. La
// pestaña "Cheques Emitidos" es de CARGA MANUAL (columnas A–L las llena él; la M la escribe el OS
// al cruzar contra Compras), así que cargarlos "a mano desde el chat" es exactamente el trabajo
// humano que el OS tiene que absorber — pero con las tres garantías que una carga a mano no da:
//
//   1. NO DUPLICAR. Antes de escribir, mira el registro entero y descarta el cheque que ya esté
//      (mismo Nº + mismo importe). Un cheque contado dos veces es plata comprometida que no existe.
//   2. NO PISAR. Escribe SOLO en las filas vacías del final, y sólo en las columnas de dato:
//      A:C, E:I, K:L. NO toca D ni J —que ya traen la fórmula =C / =I del mes— ni la M del OS.
//      Nunca reescribe una fila cargada por una persona.
//   3. VERIFICAR EL EFECTO. Lee el comprometido no debitado ANTES y DESPUÉS y falla si no subió
//      exactamente la suma de lo cargado. La banda-resumen es fórmula viva sobre el propio
//      registro: si el número no se movió lo que tenía que moverse, algo entró mal (una fecha en la
//      columna del importe, un número como texto) y hay que verlo, no descubrirlo en un mes.
//
// LO QUE NO SE INVENTA. Un cheque sin beneficiario legible se carga con el proveedor DESCONOCIDO,
// nunca deducido de un pago cercano. Igual las columnas que la foto no muestra: van vacías.
//
//   node orquestador/scripts/cheques-emitidos-cargar.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Cheques Emitidos'
const DRY = process.argv.includes('--dry')

// Los cheques a cargar. Cada campo se leyó de la foto; lo que la foto no muestra queda ''.
// FUENTE: fotos del 23/07/2026, chequera H17 C-VI/26 serie M, cta 179-091383/6, Santander.
// BENEFICIARIO EN BLANCO en los dos, y firmados → al portador de hecho (Ley 24.452, arts. 6 y 54:
// es un cheque VÁLIDO, no un defecto formal; el riesgo es económico, lo cobra quien lo tenga).
const CHEQUES = [
  {
    tipo: 'FISICO', nro: 328, emision: '22/07/2026', pago: '22/08/2026', monto: 1000000,
    proveedor: 'DESCONOCIDO — cheque firmado sin beneficiario (al portador)',
    tipoComp: '', nroComp: '', unidad: '',
  },
  {
    tipo: 'FISICO', nro: 327, emision: '22/07/2026', pago: '22/09/2026', monto: 1000000,
    proveedor: 'DESCONOCIDO — cheque firmado sin beneficiario (al portador)',
    tipoComp: '', nroComp: '', unidad: '',
  },
]

const money = (n) => `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // El encabezado del registro se DEDUCE (col A = "TIPO"): la banda-resumen de arriba puede cambiar
  // de alto sin que esta carga escriba en el lugar equivocado.
  const colA = await google.readSheetValues(ID, `'${PESTANA}'!A1:A40`)
  const iHdr = (colA || []).findIndex((f) => /^TIPO$/i.test(String(f?.[0] ?? '').trim()))
  if (iHdr < 0) { console.error(`No encuentro el encabezado (col A = "TIPO") en ${PESTANA}`); process.exit(1) }
  const HDR = iHdr + 1

  // El registro entero, para (a) saber dónde termina y (b) descartar duplicados.
  const reg = await google.readSheetValues(ID, `'${PESTANA}'!A${HDR + 1}:L1000`, { render: 'UNFORMATTED_VALUE' })
  let ultima = HDR
  const existentes = new Set()
  ;(reg || []).forEach((f, i) => {
    const hayDato = (f || []).some((c) => String(c ?? '').trim() !== '')
    if (hayDato) ultima = HDR + 1 + i
    const nro = String(f?.[1] ?? '').trim()
    const monto = Number(f?.[5] ?? 0)
    if (nro) existentes.add(`${nro}|${monto}`)
  })

  const antes = Number((await google.readSheetValues(ID, `'${PESTANA}'!B6`, { render: 'UNFORMATTED_VALUE' }))?.[0]?.[0] ?? NaN)
  console.log(`Registro: encabezado fila ${HDR}, última fila con dato ${ultima} (${existentes.size} cheques con Nº).`)
  console.log(`Comprometido no debitado ANTES: ${money(antes)}`)

  const nuevos = CHEQUES.filter((c) => {
    const dup = existentes.has(`${c.nro}|${c.monto}`)
    if (dup) console.log(`  ⏭ Nº ${c.nro} por ${money(c.monto)} YA está cargado — no lo duplico.`)
    return !dup
  })
  if (!nuevos.length) { console.log('Nada para cargar.'); return }

  const esperado = antes + nuevos.reduce((s, c) => s + c.monto, 0)
  const inicio = ultima + 1
  for (const [i, c] of nuevos.entries()) {
    console.log(`  + fila ${inicio + i}: ${c.tipo} Nº ${c.nro} · emitido ${c.emision} · pagadero ${c.pago} · ${money(c.monto)} · ${c.proveedor} · DEBITADO NO`)
  }
  if (DRY) { console.log(`(--dry) no escribo. Esperado después: ${money(esperado)}`); return }

  // Tres rangos, NO uno: D (mes de emisión) y J (mes de pago) ya traen la fórmula =C / =I de la
  // fila, y la M es la columna del OS. Escribir A:L de corrido las pisaría con un vacío.
  const data = []
  nuevos.forEach((c, i) => {
    const r = inicio + i
    data.push({ range: `'${PESTANA}'!A${r}:C${r}`, values: [[c.tipo, c.nro, c.emision]] })
    data.push({ range: `'${PESTANA}'!E${r}:I${r}`, values: [[c.proveedor, c.monto, c.tipoComp, c.nroComp, c.pago]] })
    data.push({ range: `'${PESTANA}'!K${r}:L${r}`, values: [['NO', c.unidad]] })
  })
  await google.batchUpdateValues(ID, data)

  // ── VERIFICAR: releer las filas escritas y el efecto sobre la posición ──────────────────────────
  const escrito = await google.readSheetGrid(ID, `'${PESTANA}'!A${inicio}:M${inicio + nuevos.length - 1}`)
  let malas = 0
  escrito.filas.forEach((f, i) => {
    const c = nuevos[i]
    const monto = f?.[5]?.numero
    const pago = f?.[8]?.numero
    const err = (f || []).some((x) => /#(REF|VALUE|ERROR|N\/A|NAME|DIV)/i.test(String(x?.valor ?? '')))
    const ok = monto === c.monto && Number.isFinite(pago) && !err
    if (!ok) malas++
    console.log(`  ${ok ? '✔' : '✖'} fila ${inicio + i}: monto ${f?.[5]?.valor} · pago ${f?.[8]?.valor} · mes ${f?.[9]?.valor} · debitado ${f?.[10]?.valor}`)
  })

  const despues = Number((await google.readSheetValues(ID, `'${PESTANA}'!B6`, { render: 'UNFORMATTED_VALUE' }))?.[0]?.[0] ?? NaN)
  const delta = despues - antes
  console.log(`Comprometido no debitado DESPUÉS: ${money(despues)} (subió ${money(delta)}, esperado ${money(esperado - antes)})`)
  if (malas || Math.abs(despues - esperado) > 0.005) {
    console.error('✖ La carga NO cuadra: revisar antes de dar por buena.')
    process.exitCode = 1
    return
  }
  console.log('✔ Carga verificada.')
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
