#!/usr/bin/env node
// LA SECCIÓN 4 DE PROVEEDORES: EL RESPALDO FISCAL, CONTRA EL LIBRO DE IVA DE ARCA.
//
// La pestaña cerraba en «TOTAL COMPRADO A PROVEEDORES COMERCIALES» y ahí terminaba: un cuadro de con
// quién se gasta, sin una sola línea que dijera cuánto de eso ARCA respalda. «Materiales» y
// «Estructura» cierran las dos con ese control desde el 04/08 y «Proveedores» —que es la vista más
// ancha de las tres— no lo tenía. El dueño lo vio renderizado y lo dijo así: no es uniforme.
//
// NO HAY UN BLOQUE NUEVO ACÁ. El bloque es `lib/control-arca-bloque.mjs`, el MISMO que emiten las
// otras dos pestañas, con los mismos ocho renglones y las mismas fórmulas sobre `_ARCA_RAW` y
// `_CRUCE_ARCA`. Lo único propio de esta pestaña es QUÉ universo mira: `RUBROS_COMERCIALES`, que es
// el mismo conjunto que la columna derivada «¿Proveedor comercial? (OS)» con la que se arma la
// sección 3. Escribir un cruce propio para esta vista es cómo se termina con dos cifras parecidas y
// distintas para lo mismo — ya pasó, y por eso el cruce vive en una sola lib.
//
// ═══ DÓNDE VA: ANCLADO AL RÓTULO DE ARRIBA, NUNCA A UNA FILA ═══
//
// La sección 3 es una tabla dinámica y cambia de alto cada vez que aparece un proveedor nuevo. Este
// bloque se ubica buscando el rótulo con el que ESA sección cierra y se pone una fila más abajo. Si
// el rótulo no está, no escribe: sin ancla, escribir es destruir.
//
// Es idempotente: si el bloque ya está donde va, reescribe sus ocho filas y nada más. Si quedó más
// abajo —porque la dinámica se achicó— devuelve las filas de aire que sobran, y sólo después de
// releerlas vacías en TODO el ancho.
//
//   node orquestador/scripts/proveedores-respaldo-fiscal.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-respaldo-fiscal.mjs --aplicar  → escribe y verifica

import { loadConfig } from '../lib/config.mjs'
import {
  ALTO_BLOQUE, bloqueControlArca, FILA_BLOQUE, MONTOS_BLOQUE,
} from '../lib/control-arca-bloque.mjs'
import { RUBROS_COMERCIALES } from '../lib/cruce-arca-compras.mjs'
import { CONTADOR, MONEDA_CONTROL, MONEDA_TOTAL, PORCENTAJE } from '../lib/formato-statement.mjs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { nSeccion, normalizarTitulo } from '../lib/proveedores-frontera.mjs'
import { ROTULO_TOTAL_COMERCIALES } from '../lib/proveedores-seccion2-pie.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'
const APLICAR = process.argv.includes('--aplicar')
/** Hasta dónde se mira para decidir que una fila está vacía. Bien a la derecha del bloque. */
const ANCHO_LECTURA = 'AZ'
/** Las columnas de las que este bloque es dueño: rótulo, número y las dos que usa la sección 3. */
const ANCHO = 4
/** El texto del título, sin su número. El número sale de `nSeccion` y nunca se tipea. */
export const TITULO_RESPALDO = 'RESPALDO FISCAL — contra el libro de IVA de ARCA'
/** Una sola fila de aire entre el TOTAL de la sección 3 y este título. */
const AIRE = 1

const vacia = (f) => (f ?? []).every((c) => String(c ?? '').trim() === '')

/**
 * NÚCLEO PURO: DÓNDE VA EL BLOQUE Y QUÉ HAY QUE MOVER PARA QUE ENTRE.
 *
 * Dos anclas de TEXTO: el rótulo con el que cierra la sección 3 (de otro dueño, y por eso confiable
 * aunque lo mío esté roto) y —si ya existe— el título propio. Ninguna posición supuesta.
 *
 * `mueve` es cuántas filas hay que insertar (positivo) o devolver (negativo) entre el TOTAL y el
 * título de este bloque para dejar exactamente una fila de aire. Cero = ya está donde va.
 *
 * @param {any[][]} visible la pestaña leída con FORMATTED_VALUE desde la fila 1
 * @returns {{filaTotal:number, fila0:number, mio:number, existe:boolean, mueve:number}} base 1
 */
export function ubicarRespaldo(visible = []) {
  const t = (f) => String((f ?? [])[0] ?? '').trim()
  const iTotal = (visible ?? []).findIndex((f) => t(f).toUpperCase() === ROTULO_TOTAL_COMERCIALES)
  if (iTotal < 0) {
    throw new Error(`no encontré "${ROTULO_TOTAL_COMERCIALES}" en la columna A: sin el cierre de la`
      + ' sección 3 no sé dónde empieza lo mío, y una posición supuesta escribe encima. NO escribo.')
  }
  const filaTotal = iTotal + 1
  const buscado = normalizarTitulo(TITULO_RESPALDO)
  const iMio = (visible ?? []).findIndex((f) => normalizarTitulo(t(f)) === buscado)
  const mio = iMio < 0 ? 0 : iMio + 1
  if (mio && mio <= filaTotal) {
    throw new Error(`el bloque está en la fila ${mio}, ARRIBA del cierre de la sección 3 (fila`
      + ` ${filaTotal}): la pestaña no tiene la forma que este generador cree. NO escribo.`)
  }
  const fila0 = filaTotal + AIRE + 1
  return { filaTotal, fila0, mio, existe: Boolean(mio), mueve: mio ? fila0 - mio : 0 }
}

/**
 * NÚCLEO PURO: LAS FILAS QUE ESTE BLOQUE VA A OCUPAR Y QUE TIENEN QUE ESTAR LIBRES.
 *
 * Sólo cuando el bloque NO existe todavía. Si ya está, esas filas son suyas y reescribirlas es su
 * trabajo; si no está, escribir sin mirar es la forma de comerse un bloque de otro dueño.
 *
 * @returns {number[]} las filas (base 1) que tienen algo. Vacío = se puede escribir.
 */
export function filasOcupadas(visible = [], { fila0, alto = ALTO_BLOQUE }) {
  const mal = []
  for (let f = fila0; f < fila0 + alto; f++) if (!vacia((visible ?? [])[f - 1])) mal.push(f)
  return mal
}

/** Una celda como `userEnteredValue`. `null` limpia; lo que arranca con "=" es fórmula. */
const valor = (c) => {
  if (c === null || c === undefined) return { userEnteredValue: null }
  const s = String(c)
  return { userEnteredValue: s.startsWith('=') ? { formulaValue: s } : { stringValue: s } }
}

const aAncho = (fila) => Array.from({ length: ANCHO }, (_, i) => fila[i] ?? null)

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const visible = await google.readSheetValues(ID, `${PESTAÑA}!A1:${ANCHO_LECTURA}400`, { render: 'FORMATTED_VALUE' })
  const sitio = ubicarRespaldo(visible ?? [])
  const n = nSeccion('respaldoFiscal')

  console.log(`la sección 3 cierra en la fila ${sitio.filaTotal} · ${n} · ${TITULO_RESPALDO}`
    + ` va en la ${sitio.fila0}${sitio.existe ? ` (hoy está en la ${sitio.mio})` : ' (no existe todavía)'}`)
  console.log(`rubros: ${RUBROS_COMERCIALES.join(' · ')}`)
  if (sitio.mueve > 0) console.log(`⚠ se insertan ${sitio.mueve} fila(s) de aire antes del bloque`)
  if (sitio.mueve < 0) console.log(`⚠ se devuelven ${-sitio.mueve} fila(s) de aire (sólo si están vacías al releer)`)

  const filas = bloqueControlArca({ titulo: `${n} · ${TITULO_RESPALDO}`, rubros: [...RUBROS_COMERCIALES], fila0: sitio.fila0 })
  if (!APLICAR) {
    console.log('\nEL BLOQUE QUE SE ESCRIBIRÍA:')
    for (const [i, f] of filas.entries()) console.log(`  ${sitio.fila0 + i}  ${f[0]}`)
    console.log('\n(sin --aplicar: no se escribió nada)')
    return
  }
  await escribir({ google, sitio })
}

async function escribir({ google, sitio }) {
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((s) => s.title === PESTAÑA)
  if (!Number.isInteger(hoja?.sheetId)) throw new Error('no pude resolver la pestaña Proveedores: no escribo a ciegas')
  const sheetId = hoja.sheetId

  if (sitio.mueve > 0) {
    await google.spreadsheetBatchUpdate(ID, [{ insertDimension: { range: {
      sheetId, dimension: 'ROWS', startIndex: sitio.filaTotal, endIndex: sitio.filaTotal + sitio.mueve },
    inheritFromBefore: true } }], { espejo: true })
  } else if (sitio.mueve < 0 && !(await devolverElAire({ google, sheetId, sitio }))) return

  // LA COMPROBACIÓN SE HACE CON LA LECTURA DE DESPUÉS DE MOVER, no con la de antes: mover filas es
  // exactamente lo que invalida una lectura previa, y escribir contra la vieja es escribir corrido.
  // Se relee en `FORMULA` porque es lo único que ve una celda cuyo contenido es una fórmula que
  // devuelve "": para `FORMATTED_VALUE` está vacía, y una fila así NO está libre.
  const ahora = await google.readSheetValues(ID, `${PESTAÑA}!A1:${ANCHO_LECTURA}400`, { render: 'FORMULA' })
  const puesto = ubicarRespaldo(ahora ?? [])
  if (puesto.mueve !== 0) {
    console.error(`✗✗ después de mover, el bloque sigue descolocado (${puesto.mueve} fila(s)). NO escribo.`)
    process.exitCode = 1
    return
  }
  if (!puesto.existe) {
    const ocupadas = filasOcupadas(ahora, { fila0: puesto.fila0 })
    if (ocupadas.length) {
      console.error(`✗✗ las filas ${ocupadas.join(', ')} tienen contenido de otro dueño: ahí va el bloque. NO escribo.`)
      process.exitCode = 1
      return
    }
  }

  // UNA HOJA PUEDE NO TENER LAS FILAS. `updateCells` fuera de la grilla falla entera, y con ella la
  // corrida del pipeline; agregarlas es barato y no toca una sola celda escrita.
  const falta = puesto.fila0 - 1 + ALTO_BLOQUE - (hoja.rows ?? 0)
  if (falta > 0) {
    await google.spreadsheetBatchUpdate(ID, [{ appendDimension: { sheetId, dimension: 'ROWS', length: falta } }], { espejo: true })
    console.log(`la hoja tenía ${hoja.rows} filas: se agregaron ${falta} para que el bloque entre`)
  }

  // LAS FÓRMULAS SE ARMAN CON LA FILA REAL DE DESTINO, no con la de la primera lectura: las del
  // bloque se referencian entre sí y una fila de diferencia deja la cobertura dividiendo otra cosa.
  const filas = bloqueControlArca({
    titulo: `${nSeccion('respaldoFiscal')} · ${TITULO_RESPALDO}`,
    rubros: [...RUBROS_COMERCIALES], fila0: puesto.fila0,
  })

  await google.spreadsheetBatchUpdate(ID, [
    { updateCells: {
      range: { sheetId, startRowIndex: puesto.fila0 - 1, endRowIndex: puesto.fila0 - 1 + ALTO_BLOQUE,
        startColumnIndex: 0, endColumnIndex: ANCHO },
      rows: filas.map((f) => ({ values: aAncho(f).map(valor) })),
      fields: 'userEnteredValue' } },
    ...formatos({ sheetId, fila0: puesto.fila0 }),
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS',
      startIndex: puesto.fila0 - 1, endIndex: puesto.fila0 - 1 + ALTO_BLOQUE },
    properties: { hiddenByUser: false }, fields: 'hiddenByUser' } },
  ], { espejo: true })

  await verificar({ google, fila0: puesto.fila0 })
}

/**
 * LAS FILAS DE AIRE QUE SOBRAN ENTRE EL TOTAL Y ESTE BLOQUE. Se borra sólo lo que se releyó VACÍO EN
 * TODO EL ANCHO —no hasta la D—: un generador que se cree dueño hasta su última columna ya le borró
 * al dueño catorce fechas que vivían más a la derecha. Borrar no tiene vuelta.
 *
 * @returns {Promise<boolean>} `false` = no se pudo borrar y el resto de la corrida no debe seguir.
 */
async function devolverElAire({ google, sheetId, sitio }) {
  const ancho = await google.readSheetValues(ID, `${PESTAÑA}!A1:${ANCHO_LECTURA}${sitio.mio}`, { render: 'FORMULA' })
  const sucias = []
  for (let f = sitio.filaTotal + AIRE + 1; f < sitio.mio; f++) if (!vacia((ancho ?? [])[f - 1])) sucias.push(f)
  if (sucias.length) {
    console.error(`✗ NO borro: las filas ${sucias.join(', ')} tienen datos — el bloque queda con más aire del previsto`)
    return false
  }
  await google.spreadsheetBatchUpdate(ID, [{ deleteDimension: { range: {
    sheetId, dimension: 'ROWS', startIndex: sitio.filaTotal + AIRE, endIndex: sitio.filaTotal + AIRE - sitio.mueve } } }], { espejo: true })
  return true
}

/**
 * QUÉ UNIDAD DIBUJA CADA FILA. Los desplazamientos NO se tipean: salen de `FILA_BLOQUE`, que es quien
 * decide el orden de las filas del bloque y tiene un test que lo ata a los rótulos. Es el mismo
 * mapeo que aplican «Materiales» y «Estructura» — una fila de más acá y la cobertura se dibuja «$1».
 */
function formatos({ sheetId, fila0 }) {
  const f = (i) => fila0 - 1 + i
  const rango = (desde, hasta, col) => ({ sheetId, startRowIndex: desde, endRowIndex: hasta, startColumnIndex: col, endColumnIndex: col + 1 })
  const campos = 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment'
  const num = (desde, hasta, numberFormat) => ({ repeatCell: {
    range: rango(desde, hasta, 1),
    cell: { userEnteredFormat: { numberFormat, horizontalAlignment: 'RIGHT' } }, fields: campos } })
  return [
    // La columna A es texto de punta a punta: sin declararlo hereda el formato de lo que estuvo antes
    // en esas celdas, que en esta pestaña ya convirtió un rótulo en `31/12/1899`.
    { repeatCell: { range: rango(f(0), f(ALTO_BLOQUE), 0),
      cell: { userEnteredFormat: { numberFormat: { type: 'TEXT', pattern: '@' }, horizontalAlignment: 'LEFT' } }, fields: campos } },
    num(f(MONTOS_BLOQUE.desde), f(MONTOS_BLOQUE.hasta), MONEDA_TOTAL),
    num(f(FILA_BLOQUE.cobertura), f(FILA_BLOQUE.cobertura + 1), PORCENTAJE),
    num(f(FILA_BLOQUE.global), f(FILA_BLOQUE.global + 1), MONEDA_CONTROL),
    // LA ÚLTIMA FILA CUENTA FILAS, NO PESOS: con el formato de moneda de arriba, un 3 sale «$3».
    num(f(FILA_BLOQUE.veredicto), f(FILA_BLOQUE.veredicto + 1), CONTADOR),
    { repeatCell: { range: { sheetId, startRowIndex: f(0), endRowIndex: f(1), startColumnIndex: 0, endColumnIndex: 1 },
      cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
  ]
}

/**
 * LA EVIDENCIA ES DEL EFECTO: se relee el bloque publicado. Una fórmula que devuelve `#REF!` o un
 * control mudo —la cobertura en blanco porque sus dos insumos no llegaron— es un bloque que promete
 * respaldo fiscal y no mira nada.
 */
async function verificar({ google, fila0 }) {
  const leido = await google.readSheetValues(ID, `${PESTAÑA}!A${fila0}:B${fila0 + ALTO_BLOQUE - 1}`)
  const celdas = (leido ?? []).flat().map((c) => String(c ?? ''))
  const rotos = celdas.filter((c) => /#(REF|NAME|VALUE|DIV|N\/A|ERROR|¿NOMBRE)/i.test(c))
  if (rotos.length) {
    console.error(`✗✗ ${rotos.length} celda(s) con error: ${[...new Set(rotos)].join(' · ')}`)
    process.exitCode = 1
  }
  const mudas = []
  for (const i of [FILA_BLOQUE.universo, FILA_BLOQUE.conRespaldo, FILA_BLOQUE.sinRespaldo,
    FILA_BLOQUE.cobertura, FILA_BLOQUE.global, FILA_BLOQUE.veredicto]) {
    const v = String((leido?.[i] ?? [])[1] ?? '').trim()
    if (v === '') mudas.push(fila0 + i)
  }
  if (mudas.length) {
    console.error(`✗✗ las filas ${mudas.join(', ')} publican un rótulo y ninguna cifra: el control está mudo`)
    process.exitCode = 1
  }
  for (const [i, f] of (leido ?? []).entries()) console.log(`  ${fila0 + i}  ${f?.[0] ?? ''} | ${f?.[1] ?? ''}`)
  if (!rotos.length && !mudas.length) console.log('✓ las 8 filas del bloque publican rótulo y número, leídas del archivo')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error(e); process.exit(1) })
}
