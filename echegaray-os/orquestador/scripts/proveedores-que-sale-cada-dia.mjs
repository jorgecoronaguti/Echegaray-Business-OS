#!/usr/bin/env node
// LA SECCIÓN 2 DE PROVEEDORES: "A QUIÉNES Y CÓMO DEBO PAGAR UN DETERMINADO DÍA".
//
// El pedido (14/08), textual: *"el cuadro de pestaña proveedores esta incompleto aun tengo q seguir
// usando algunos filtros en pestaña compras … para saber exactamente A QUIENES Y COMO DEBO PAGAR UN
// DETERMINADO DIA. no me sirve — rehacer respetando mi regla de oro de diseño"*.
//
// La sección 1 ya agrupa el detalle por día, pero es una dinámica nativa y por eso NINGÚN día tiene
// total: la API no emite el subtotal de un nivel externo (medido, `proveedores-pivot-seccion1.mjs`).
// Un cuadro de pagos sin el total del día no decide nada. El criterio y las fórmulas, en
// `lib/proveedores-por-dia.mjs`; acá sólo vive la plomería de dónde va y cómo se verifica.
//
// ═══ LO QUE ESTE SCRIPT NO HACE, Y ES A PROPÓSITO ═══
//
// No toca la sección 1, no toca la columna H (es del dueño) y no escribe una sola celda fuera de su
// propio rectángulo A..G. Cuando su alto cambia —un día de pago más, uno menos— inserta o borra filas
// ENTRE su bloque y el título de la sección que sigue, nunca dentro de otro bloque, y sólo borra
// filas que releyó vacías en TODO el ancho.
//
//   node orquestador/scripts/proveedores-que-sale-cada-dia.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-que-sale-cada-dia.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { COLCHON_FINAL, filasNoVacias } from '../lib/proveedores-colchon.mjs'
import { ANCHOS_PROVEEDORES, nSeccion } from '../lib/proveedores-frontera.mjs'
import { requestsDeRotulos, rotulosQueNoEntran } from '../lib/proveedores-rotulos.mjs'
import { tituloDeSeccion } from '../lib/proveedores-titulos.mjs'
import {
  bloqueQueSaleCadaDia, COL_QUIENES, COL_TOTAL_DIA, diasSinNombre, filasQueNecesita,
  formatosDelBloque, MEDIOS_DEL_DIA, mediosSinColumna, ROTULOS_POR_DIA, TITULO_POR_DIA,
  tramosQueNoEntran, ubicarBloque,
} from '../lib/proveedores-por-dia.mjs'
import { ALERTA } from '../lib/glifos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'
const APLICAR = process.argv.includes('--aplicar')
/** Hasta dónde se mira para decidir que una fila está vacía. Bien a la derecha del bloque. */
const ANCHO_LECTURA = 'AZ'
const ANCHO = ROTULOS_POR_DIA.length

const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

/** Una celda del bloque como `userEnteredValue`. `null` limpia; lo que arranca con "=" es fórmula. */
const valor = (c) => {
  if (c === null || c === undefined) return { userEnteredValue: null }
  const s = String(c)
  return { userEnteredValue: s.startsWith('=') ? { formulaValue: s } : { stringValue: s } }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const compras = await google.readSheetValues(ID, 'Compras!A4:AL', { render: 'UNFORMATTED_VALUE' })
  const visible = await google.readSheetValues(ID, `${PESTAÑA}!A1:R400`, { render: 'FORMATTED_VALUE' })

  const n = nSeccion('salePorDia')
  const bloque = bloqueQueSaleCadaDia({ filas: compras ?? [], filaTitulo: 1, numeroDeSeccion: n })
  const { dias, sinDia, total } = bloque.modelo
  const sitio = ubicarBloque(visible ?? [])
  const necesita = filasQueNecesita(bloque)

  console.log(`${tituloDeSeccion('deuda')} termina antes de la fila ${sitio.siguiente}`)
  console.log(`${n} · ${TITULO_POR_DIA} → ${dias.length} día(s) · ${plata(total)} · alto ${bloque.alto}`
    + ` filas${sitio.existe ? ` (el bloque ya está en la fila ${sitio.filaTitulo})` : ' (no existe todavía)'}`)
  console.log(`necesita ${necesita} filas (bloque + ${COLCHON_FINAL} de aire) y tiene ${sitio.disponibles}`)
  avisos({ compras: compras ?? [], dias, sinDia })

  const delta = necesita - sitio.disponibles
  if (delta > 0) console.log(`⚠ se insertan ${delta} fila(s) antes de la fila ${sitio.siguiente}`)
  if (delta < 0) console.log(`⚠ se devuelven ${-delta} fila(s) de aire (sólo si están vacías al releer)`)
  if (!APLICAR) {
    console.log('\nEL CUADRO QUE SE ESCRIBIRÍA:')
    for (const d of dias) {
      console.log(`  ${fechaLegible(d.dia)} | ${plata(d.total).padStart(14)} | ${d.proveedores.join(' · ').slice(0, 70)}`)
    }
    console.log('\n(sin --aplicar: no se escribió nada)')
    return
  }
  await escribir({ google, bloque, sitio, delta })
}

/** Lo que hay que decir ANTES de escribir. Ninguno aborta: esconder deuda es peor que mostrarla mal. */
function avisos({ compras, dias, sinDia }) {
  if (sinDia.n) {
    console.log(`  ${ALERTA} ${sinDia.n} factura(s) por ${plata(sinDia.monto)} SIN fecha de pago`
      + ` (${sinDia.proveedores.join(' · ') || 'sin nombre'}) — no entran a ningún día. El control del pie las denuncia.`)
  }
  for (const d of diasSinNombre({ dias })) {
    console.log(`  ${ALERTA} el día ${fechaLegible(d.dia)} sale con ${plata(d.total)} y SIN nombre de proveedor`
      + ' — la fila está sin cargar en Compras!E, y "A quiénes" va a salir vacío.')
  }
  for (const m of mediosSinColumna(compras)) {
    console.log(`  ○ ${plata(m.monto)} salen por "${m.medio}", que no tiene columna: entran al TOTAL DEL DÍA igual.`)
  }
  for (const t of tramosQueNoEntran(compras)) {
    console.log(`  ${ALERTA} ${t.proveedor}: el segundo tramo (${plata(t.tramo2)}) es mayor que el saldo`
      + ` (${plata(t.saldo)}) — el primer tramo va a salir en negativo. Se corrige en Compras!W.`)
  }
  const noFecha = dias.filter((d) => !d.esFecha)
  for (const d of noFecha) {
    console.log(`  ${ALERTA} "${d.dia}" donde va una fecha de pago (${plata(d.total)}): sale como un día propio.`)
  }
}

const fechaLegible = (d) => (typeof d === 'number'
  ? new Date(Date.UTC(1899, 11, 30) + d * 86400000).toISOString().slice(0, 10).split('-').reverse().join('/')
  : String(d))

async function escribir({ google, bloque, sitio, delta }) {
  const meta = await google.getSheetMeta(ID)
  const sheetId = meta.find((s) => s.title === PESTAÑA)?.sheetId
  if (!Number.isInteger(sheetId)) throw new Error('no pude resolver la pestaña Proveedores: no escribo a ciegas')

  if (delta > 0) {
    await google.spreadsheetBatchUpdate(ID, [{ insertDimension: {
      range: { sheetId, dimension: 'ROWS', startIndex: sitio.siguiente - 1, endIndex: sitio.siguiente - 1 + delta },
      inheritFromBefore: true } }], { espejo: true })
  } else if (delta < 0) {
    await devolverElAire({ google, sheetId, sitio, sobran: -delta })
  }

  // El bloque se recoloca sobre su fila real: `bloqueQueSaleCadaDia` calcula sus fórmulas con las
  // filas donde va a vivir, y una fila de diferencia deja el TOTAL sumando el rango de al lado.
  const puesto = bloqueQueSaleCadaDia({
    filas: await google.readSheetValues(ID, 'Compras!A4:AL', { render: 'UNFORMATTED_VALUE' }),
    filaTitulo: sitio.filaTitulo, numeroDeSeccion: nSeccion('salePorDia'),
  })
  if (puesto.alto !== bloque.alto) {
    console.error(`✗✗ Compras cambió entre la lectura y la escritura (${bloque.alto} → ${puesto.alto} filas). NO escribo.`)
    process.exitCode = 1
    return
  }
  for (const r of rotulosQueNoEntran([...ROTULOS_POR_DIA], ANCHOS_PROVEEDORES)) {
    console.log(`⚠ el rótulo "${r.texto}" necesita ${r.lineas} líneas en su columna`)
  }

  await google.spreadsheetBatchUpdate(ID, [
    { updateCells: {
      range: { sheetId, startRowIndex: puesto.filaTitulo - 1, endRowIndex: puesto.filaTitulo - 1 + puesto.alto,
        startColumnIndex: 0, endColumnIndex: ANCHO },
      rows: puesto.filas.map((f) => ({ values: f.map(valor) })),
      fields: 'userEnteredValue' } },
    ...formatosDelBloque({ sheetId, bloque: puesto }),
    ...requestsDeRotulos({ sheetId, fila: puesto.filaRotulos, textos: [...ROTULOS_POR_DIA],
      anchos: ANCHOS_PROVEEDORES, derecha: [...MEDIOS_DEL_DIA.map((_, i) => i + 1), COL_TOTAL_DIA] }),
    { repeatCell: {
      range: { sheetId, startRowIndex: puesto.filaTitulo - 1, endRowIndex: puesto.filaTitulo, startColumnIndex: 0, endColumnIndex: 1 },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: 'userEnteredFormat.textFormat.bold' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS',
      startIndex: puesto.filaTitulo - 1, endIndex: puesto.filaTitulo - 1 + puesto.alto },
    properties: { hiddenByUser: false }, fields: 'hiddenByUser' } },
  ], { espejo: true })

  await verificar({ google, puesto })
}

/**
 * DEVOLVER EL AIRE QUE SOBRA. Se borra sólo lo que se releyó VACÍO EN TODO EL ANCHO —no hasta la G—:
 * un generador que se cree dueño hasta su última columna ya le borró al dueño catorce fechas que
 * vivían más a la derecha. Borrar no tiene vuelta.
 */
async function devolverElAire({ google, sheetId, sitio, sobran }) {
  const ancho = await google.readSheetValues(ID, `${PESTAÑA}!A1:${ANCHO_LECTURA}${sitio.siguiente}`, { render: 'FORMULA' })
  const rango = { desdeBorrar: sitio.siguiente - sobran, hastaBorrar: sitio.siguiente }
  const sucias = filasNoVacias(ancho ?? [], rango)
  if (sucias.length) {
    console.error(`✗ NO borro: las filas ${sucias.join(', ')} tienen datos — el bloque queda con más aire del previsto`)
    return
  }
  await google.spreadsheetBatchUpdate(ID, [{ deleteDimension: { range: {
    sheetId, dimension: 'ROWS', startIndex: rango.desdeBorrar - 1, endIndex: rango.hastaBorrar - 1 } } }], { espejo: true })
}

/**
 * LA EVIDENCIA ES DEL EFECTO: se relee el bloque y se compara contra el modelo que lo produjo.
 *
 * Es lo único que prueba que la lista viva de días (`SORT(UNIQUE(FILTER({Q;V};…)))`) hace en el
 * archivo lo que dice hacer: si el literal de array no se comportara como se espera en un archivo
 * es_AR, acá salta —días de menos, o el total que no cierra— en vez de publicarse un cuadro que
 * manda a pagar mal.
 */
async function verificar({ google, puesto }) {
  const letraG = String.fromCharCode(65 + ANCHO - 1)
  const leido = await google.readSheetValues(ID,
    `${PESTAÑA}!A${puesto.filaTitulo}:${letraG}${puesto.filaTitulo + puesto.alto - 1}`)
  const rotos = (leido ?? []).flat().filter((c) => /#(REF|NAME|VALUE|DIV|N\/A|ERROR|¿NOMBRE)/i.test(String(c ?? '')))
  if (rotos.length) {
    console.error(`✗✗ ${rotos.length} celda(s) con error: ${[...new Set(rotos)].join(' · ')}`)
    process.exitCode = 1
  }
  const cuerpo = (leido ?? []).slice(2, 2 + (puesto.ultimaFila - puesto.primeraFila + 1))
  const conDia = cuerpo.filter((f) => String((f ?? [])[0] ?? '').trim() !== '')
  const esperados = puesto.modelo.dias.length
  if (conDia.length !== esperados) {
    console.error(`✗✗ el archivo publicó ${conDia.length} días y el modelo calculó ${esperados}:`
      + ' la lista viva de días no está haciendo lo que se espera. NO se puede pagar con este cuadro.')
    process.exitCode = 1
  }
  // Un día sin nombres es un defecto MÍO sólo si el modelo tenía nombres para poner. Cuando la fila
  // de Compras no tiene proveedor cargado, la columna sale vacía porque el dato no está — eso ya se
  // gritó antes de escribir y no lo arregla este script.
  const conNombreEsperado = puesto.modelo.dias.filter((d) => d.proveedores.length > 0).length
  const conNombre = conDia.filter((f) => String((f ?? [])[COL_QUIENES] ?? '').trim() !== '').length
  if (conNombre < conNombreEsperado) {
    console.error(`✗✗ ${conNombreEsperado - conNombre} día(s) publicados SIN nombres en "A quiénes"`
      + ' y el modelo sí los tenía: la fórmula de nombres no está encontrando su día.')
    process.exitCode = 1
  }
  const control = String((leido ?? [])[puesto.alto - 1]?.[0] ?? '')
  console.log(`✓ ${conDia.length} día(s) publicados en A${puesto.primeraFila}:${letraG}${puesto.ultimaFila}`)
  console.log(`  control: ${control}`)
  if (control.startsWith(ALERTA)) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exit(1) })
