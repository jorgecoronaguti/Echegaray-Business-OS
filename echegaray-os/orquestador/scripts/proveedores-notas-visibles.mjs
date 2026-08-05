#!/usr/bin/env node
// LAS NOTAS DEL DUEÑO, AL LADO DE LA DEUDA DE CADA PROVEEDOR.
//
// ═══ POR QUÉ HIZO FALTA ═══
//
// El cuadro de deuda pasó a ser una tabla dinámica nativa. Una dinámica escribe sus propias filas y
// no admite columnas ajenas adentro, así que el generador que respaldaba y volvía a pintar las notas
// dejó de correr para esta pestaña: las doce notas del dueño quedaron vivas en `public.proveedor_notas`
// y desaparecieron de la vista. Son instrucciones operativas —"Contactar. pagar con cheque a 15",
// "no es prioridad", "Confirmar trueque con chatarra propia"—: sin ellas, el cuadro dice cuánto se
// debe y no dice qué hacer.
//
// ═══ ANCLADAS AL PROVEEDOR, NUNCA A LA FILA ═══
//
// Escribir la nota en la fila 22 porque hoy ahí está Mariana SA es el defecto que ya se pagó tres
// veces en este archivo: mañana la dinámica reordena por monto, Mariana baja dos filas y su nota
// queda al lado de otro proveedor. La nota se resuelve por BÚSQUEDA sobre el nombre que la propia
// dinámica escribió en la columna A. Si el proveedor se mueve, su nota se mueve con él.
//
//   node orquestador/scripts/proveedores-notas-visibles.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-notas-visibles.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { geometriaDeLaSeccion, altoEmitido } from '../lib/proveedores-pivot-seccion1.mjs'
import { ANCHOS_PROVEEDORES } from '../lib/proveedores-frontera.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'
const AUX = '_PROVEEDORES_OS'
const APLICAR = process.argv.includes('--aplicar')
/** La dinámica del cuadro A ocupa A·B·C. La nota va en la D, pegada y fuera de su cuerpo. */
const COL_NOTA = 3
// ═══ EL ANCHO DE LA D NO SE FIJA ACÁ (04/08) ═══
//
// Este script ponía la D en 300px y proveedores-encabezado-aplicar.mjs la ponía en 80: ganaba el que
// corriera último, y nadie podía decir cuánto medía la columna sin saber el orden de la corrida. Un
// ancho es de la columna entera, así que su definición es una sola —ANCHOS_PROVEEDORES en
// lib/proveedores-frontera.mjs— y la aplica un solo generador. Acá se LEE, para no escribir una nota
// más larga de lo que entra.
const ROTULO = 'Qué hacer'
/** Filas de más que se preparan: si mañana entra un proveedor, su nota ya lo espera. */
const COLCHON = 4

const formulaNota = (fila) =>
  `=IF($A${fila}="";"";IFERROR(VLOOKUP($A${fila};${AUX}!$A:$C;3;FALSE);""))`

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  const { rows: notas } = await query(
    "select proveedor, nota from public.proveedor_notas where trim(coalesce(nota,'')) <> '' order by proveedor")
  const { rows: provs } = await query(
    "select nombre, cuit from public.proveedores where trim(coalesce(nombre,'')) <> '' order by nombre")

  const porNombre = new Map(notas.map((n) => [String(n.proveedor).trim(), String(n.nota).trim()]))
  // Un proveedor con nota que no está en `proveedores` igual tiene que llegar a la pestaña auxiliar:
  // si no, la nota existe en la base y no se ve en ningún lado, que es el problema que vino a
  // resolver esta capacidad.
  const nombres = [...new Set([...provs.map((p) => String(p.nombre).trim()), ...porNombre.keys()])].sort()
  const cuits = new Map(provs.map((p) => [String(p.nombre).trim(), p.cuit]))
  const conGuiones = (c) => {
    const d = String(c ?? '').replace(/\D/g, '')
    return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : String(c ?? '')
  }

  console.log(`NOTAS ${notas.length} · PROVEEDORES en la auxiliar ${nombres.length}`)
  for (const n of notas) console.log(`  ${String(n.proveedor).padEnd(34)} ${String(n.nota).slice(0, 62)}`)

  const visible = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMATTED_VALUE' })
  const geo = geometriaDeLaSeccion(visible)
  // El alto sale de lo que la dinámica EMITIÓ, releído — no de una estimación. Una estimación corta
  // deja proveedores sin su nota y una larga escribe fórmulas dentro del cuadro de abajo.
  const cuerpo = visible.slice(geo.filaEncabezado) // desde la fila siguiente a los rótulos
  const desde = geo.filaEncabezado + 1
  // EL TECHO ES EL SUBTÍTULO DEL CUADRO B, buscado por su texto.
  //
  // `altoEmitido` cuenta hasta la primera fila en blanco, y una fila de separación con un resto en
  // cualquier columna deja de ser blanco: acá devolvió 31 donde el cuadro tiene 11, y las fórmulas
  // habrían caído adentro del cuadro de detalle. El subtítulo es un ancla de verdad.
  const iSub = visible.findIndex((f, i) => i >= geo.filaEncabezado
    && /^cada operaci[oó]n/i.test(String(f?.[0] ?? '').trim()))
  if (iSub < 0) throw new Error('no encontré el subtítulo "Cada operación": sin techo no escribo')
  const hasta = Math.min(desde + altoEmitido(cuerpo) + COLCHON, iSub) // iSub es base 0 = la fila anterior en base 1
  // ═══ Y SE USA PARA AVISAR LO QUE NO VA A ENTRAR ═══
  //
  // Leer el ancho compartido sirve para algo más que no pisarlo: a fontSize 9 en itálica entran unos
  // 7px por carácter, así que una nota más larga que eso se va a ver CORTADA en la pestaña. El dueño
  // escribe estas notas para leerlas; que una quede a medias es el mismo defecto de pantalla que el
  // resto del archivo persigue, sólo que en un texto suyo. No se trunca —es su texto— pero se avisa.
  const CARACTERES = Math.floor(ANCHOS_PROVEEDORES[COL_NOTA] / 7)
  const largas = [...porNombre.entries()].filter(([, t]) => t.length > CARACTERES)
  if (largas.length) {
    console.log(`\n⚠ ${largas.length} nota(s) más largas que los ${ANCHOS_PROVEEDORES[COL_NOTA]}px de la columna `
      + `(~${CARACTERES} caracteres): se van a ver cortadas en la pestaña.`)
    for (const [n, t] of largas) console.log(`     ${n.padEnd(26)} ${t.length} car.: "${t.slice(0, CARACTERES)}…"`)
  }
  console.log(`\nCUADRO A: rótulos en la fila ${geo.filaEncabezado} · "Cada operación" en la ${iSub + 1}`
    + ` · la nota va en D${desde}:D${hasta - 1}`)
  if (hasta - desde < 1) throw new Error('el cuadro A no tiene filas entre los rótulos y el subtítulo: no escribo')
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((s) => s.title === PESTAÑA)
  const aux = meta.find((s) => s.title === AUX)
  if (!hoja || !aux) throw new Error(`no encontré ${!hoja ? PESTAÑA : AUX}: no escribo a ciegas`)

  // ── 1. La auxiliar gana una tercera columna con la nota. Es del OS: se rehace entera.
  // La grilla se agranda ANTES: escribir en una columna que no existe da 400 y no escribe nada.
  const alto = Math.max(nombres.length + 1, 200)
  const crecer = []
  if ((aux.cols ?? 0) < 3) crecer.push({ appendDimension: { sheetId: aux.sheetId, dimension: 'COLUMNS', length: 3 - (aux.cols ?? 0) } })
  if ((aux.rows ?? 0) < alto) crecer.push({ appendDimension: { sheetId: aux.sheetId, dimension: 'ROWS', length: alto - (aux.rows ?? 0) } })
  if (crecer.length) {
    await google.spreadsheetBatchUpdate(ID, crecer, { espejo: true })
    console.log(`  ${AUX}: grilla agrandada a ${alto} filas × 3 columnas`)
  }
  await google.spreadsheetBatchUpdate(ID, [{ updateCells: {
    range: { sheetId: aux.sheetId, startRowIndex: 0, endRowIndex: alto, startColumnIndex: 0, endColumnIndex: 3 },
    rows: [
      { values: ['Proveedor', 'CUIT', 'Qué hacer'].map((v) => ({ userEnteredValue: { stringValue: v } })) },
      ...nombres.map((n) => ({ values: [n, conGuiones(cuits.get(n)), porNombre.get(n) ?? ''].map((v) => ({
        userEnteredValue: v ? { stringValue: String(v) } : null })) })),
      ...Array.from({ length: Math.max(0, alto - nombres.length - 1) },
        () => ({ values: Array.from({ length: 3 }, () => ({ userEnteredValue: null })) })),
    ],
    fields: 'userEnteredValue' } }], { espejo: true })

  // ── 2. El rótulo y la columna de búsqueda, sobre todo el footprint del cuadro A.
  const FMT = 'userEnteredFormat'
  await google.spreadsheetBatchUpdate(ID, [
    { updateCells: {
      range: { sheetId: hoja.sheetId, startRowIndex: geo.filaEncabezado - 1, endRowIndex: geo.filaEncabezado, startColumnIndex: COL_NOTA, endColumnIndex: COL_NOTA + 1 },
      rows: [{ values: [{ userEnteredValue: { stringValue: ROTULO } }] }], fields: 'userEnteredValue' } },
    { updateCells: {
      range: { sheetId: hoja.sheetId, startRowIndex: desde - 1, endRowIndex: hasta - 1, startColumnIndex: COL_NOTA, endColumnIndex: COL_NOTA + 1 },
      rows: Array.from({ length: hasta - desde }, (_, i) => ({
        values: [{ userEnteredValue: { formulaValue: formulaNota(desde + i) } }] })),
      fields: 'userEnteredValue' } },
    { repeatCell: {
      range: { sheetId: hoja.sheetId, startRowIndex: geo.filaEncabezado - 1, endRowIndex: hasta - 1, startColumnIndex: COL_NOTA, endColumnIndex: COL_NOTA + 1 },
      cell: { userEnteredFormat: { numberFormat: { type: 'TEXT', pattern: '@' }, horizontalAlignment: 'LEFT',
        textFormat: { fontSize: 9, italic: true, foregroundColor: { red: 0.45, green: 0.45, blue: 0.45 } } } },
      fields: `${FMT}.numberFormat,${FMT}.horizontalAlignment,${FMT}.textFormat` } },
  ], { espejo: true })

  // ── LA EVIDENCIA: qué proveedor con deuda quedó con su nota a la vista.
  const leido = await google.readSheetValues(ID, `${PESTAÑA}!A${geo.filaEncabezado}:D${hasta - 1}`)
  console.log('\nLEÍDO DEL ARCHIVO')
  let conNota = 0
  for (const f of (leido ?? []).slice(1)) {
    const prov = String(f?.[0] ?? '').trim()
    if (!prov) continue
    const nota = String(f?.[3] ?? '').trim()
    if (nota) conNota++
    console.log(`  ${prov.padEnd(26)} ${String(f?.[1] ?? '').padStart(12)}  ${nota || '—'}`.slice(0, 118))
  }
  const sinVer = [...porNombre.keys()].filter((n) => !(leido ?? []).some((f) => String(f?.[0] ?? '').trim() === n))
  console.log(`\n✓ ${conNota} proveedor(es) con deuda muestran su nota`)
  if (sinVer.length) console.log(`○ ${sinVer.length} nota(s) de proveedores SIN deuda hoy (no tienen fila en el cuadro): ${sinVer.slice(0, 6).join(' · ')}`)
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
