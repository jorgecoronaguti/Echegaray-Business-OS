// EL DESPLEGABLE DE LA COLUMNA «OBRA»: LA PESTAÑA AUXILIAR `_OBRAS_OS` Y LAS DOS VALIDACIONES.
//
// ═══ POR QUÉ HACE FALTA (15/09/2026) ═══
//
// La columna se inserta heredando el formato de la de al lado (`inheritFromBefore: true`), y el formato
// NO trae lista. Sin esto el dueño queda con una columna «Obra» que se tipea a mano, y una obra tipeada
// a mano es exactamente lo que `resolverCeldaObra` no puede resolver: «OB-21», «Playón», el nombre
// viejo de una obra renombrada. La celda entra como inconsistencia y la fila sigue sin obra, que es el
// problema que la columna vino a cerrar. El desplegable es lo que hace que la celda sea SIEMPRE una
// opción del catálogo.
//
// ═══ POR QUÉ UNA PESTAÑA Y NO `ONE_OF_LIST` ═══
//
// `ONE_OF_LIST` guarda las opciones DENTRO de la regla: cada obra nueva obliga a reescribir la
// validación de las dos columnas enteras, o sea un `batchUpdate` sobre las pestañas del dueño cada vez
// que se da de alta una obra. Con `ONE_OF_RANGE` la lista son datos en una pestaña oculta del OS:
// refrescar el catálogo es escribir una columna en `_OBRAS_OS` y las validaciones no se tocan nunca más.
//
// ═══ `strict: false`, Y QUÉ SIGNIFICA DE VERDAD ═══
//
// `strict: true` RECHAZA lo que no está en la lista: rompería pegar un bloque de filas, una importación
// o cualquier valor viejo que ya estuviera en la celda, y el dueño se quedaría sin poder escribir.
// `strict: false` deja entrar el valor y lo marca con el triangulito de advertencia. Quien nombra lo que
// está mal es el sync (`obra_inconsistencia`), que sabe contra qué catálogo comparar; la validación
// sólo ofrece la lista. El universo de opciones es el de `opcionesDeObra` — la MISMA definición que la
// app y que `public.obra_celda_resolver`.
//
// Núcleo puro: acá no hay red ni base. Quien lee la base y llama a la API es `scripts/obras-lista-sheet.mjs`.

import { letraDeColumna } from './formula-insertar-columna.mjs'

/** La pestaña oculta del OS con la lista. El guion bajo es la convención de las auxiliares del archivo. */
export const AUX = '_OBRAS_OS'
export const ENCABEZADO_AUX = Object.freeze(['Obra'])

/** Filas mínimas que se escriben: borrar una obra del catálogo tiene que limpiar su fila vieja. */
export const ALTO_MINIMO_AUX = 300

/** El rango de la lista, en A1 y absoluto: es lo que va dentro de la condición ONE_OF_RANGE. */
export const RANGO_LISTA = `'${AUX}'!$A$2:$A`

/**
 * LAS FILAS DE LA AUXILIAR, encabezado incluido. Se ordenan como vienen de `opcionesDeObra` (fijos,
 * obras por código, «Sin obra – cliente»): ese orden es el que ve el dueño al abrir el desplegable.
 * Un duplicado se descarta —dos veces la misma opción en la lista es la misma opción— y un vacío
 * también: una opción vacía en el desplegable es indistinguible de no elegir nada.
 * @param {string[]} opciones @returns {string[][]}
 */
export function filasDeLaLista(opciones = []) {
  const vistas = new Set()
  const limpias = []
  for (const o of opciones) {
    const t = String(o ?? '').trim()
    if (!t || vistas.has(t)) continue
    vistas.add(t)
    limpias.push(t)
  }
  return [[...ENCABEZADO_AUX], ...limpias.map((t) => [t])]
}

/**
 * El `updateCells` que deja la auxiliar EXACTAMENTE con esta lista y nada más.
 *
 * Las filas de sobra van con `userEnteredValue: null` explícito: es lo único que BORRA la opción de una
 * obra que ya no está en el catálogo. Sin eso, el desplegable seguiría ofreciendo una obra fusionada.
 */
export function requestDeLaLista({ sheetId, filas = [], alto = ALTO_MINIMO_AUX }) {
  if (!Number.isInteger(sheetId)) throw new Error(`${AUX}: sin sheetId, no escribo la lista a ciegas`)
  const total = Math.max(filas.length, alto)
  return {
    updateCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: total, startColumnIndex: 0, endColumnIndex: 1 },
      rows: [
        ...filas.map(([t]) => ({ values: [{ userEnteredValue: { stringValue: String(t) } }] })),
        ...Array.from({ length: Math.max(0, total - filas.length) }, () => ({ values: [{ userEnteredValue: null }] })),
      ],
      fields: 'userEnteredValue',
    },
  }
}

/** El rango de datos de una inserción, en A1 — para el log y para la relectura. `Compras!L4:L`. */
export function rangoDeDatos(ins) {
  return `${ins.pestana}!${letraDeColumna(ins.indice)}${ins.filaEncabezado + 1}:${letraDeColumna(ins.indice)}`
}

/** La PRIMERA celda de datos: `Compras!L4`. Es la que se relee para probar que la regla quedó puesta. */
export function celdaPrimerDato(ins) {
  return `${ins.pestana}!${letraDeColumna(ins.indice)}${ins.filaEncabezado + 1}`
}

/** La regla, una sola vez: la misma para las dos columnas. */
const REGLA = Object.freeze({
  condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: `=${RANGO_LISTA}` }] },
  showCustomUi: true,
  strict: false,
})

/**
 * LAS VALIDACIONES DE LAS DOS COLUMNAS, EN DOS REQUESTS CADA UNA. Empiezan en la fila SIGUIENTE al
 * encabezado: una validación sobre la celda del rótulo le pondría desplegable a la palabra «Obra».
 *
 * ═══ POR QUÉ DOS Y NO UNA (medido en la copia de ensayo, 15/09/2026) ═══
 *
 * El request SIN `endRowIndex` fija el default de la columna: una fila agregada mañana nace con el
 * desplegable. Pero a la celda que ya trae una regla PROPIA no la pisa, y al insertar en Cobranzas H
 * con `inheritFromBefore` cada celda hereda la regla de la G («Administracion|Almacen|…»). Con un solo
 * request quedaban celdas ofreciendo la lista equivocada.
 *
 * El request ACOTADO a las filas de la grilla escribe la regla celda por celda y sí las pisa. Van los
 * dos, en este orden: primero el default, después las celdas.
 * @param {Array<{pestana:string, filaEncabezado:number, indice:number}>} inserciones
 * @param {(pestana:string) => number|undefined} sheetIdDe
 * @param {(pestana:string) => number|undefined} filasDe cuántas filas tiene la grilla de esa pestaña
 */
export function requestsDeValidacion(inserciones = [], sheetIdDe = () => undefined, filasDe = () => undefined) {
  return inserciones.flatMap((ins) => {
    const sheetId = sheetIdDe(ins.pestana)
    if (!Number.isInteger(sheetId)) throw new Error(`${ins.pestana}: sin sheetId, no pongo el desplegable a ciegas`)
    const filas = filasDe(ins.pestana)
    if (!Number.isInteger(filas) || filas <= ins.filaEncabezado) throw new Error(`${ins.pestana}: no sé cuántas filas tiene la grilla`)
    const base = { sheetId, startRowIndex: ins.filaEncabezado, startColumnIndex: ins.indice, endColumnIndex: ins.indice + 1 }
    return [
      { setDataValidation: { range: { ...base }, rule: REGLA } },
      { setDataValidation: { range: { ...base, endRowIndex: filas }, rule: REGLA } },
    ]
  })
}

/** ¿ESTA CELDA quedó con el desplegable? El problema, o `null`. */
export function problemaDeCelda(dv, donde) {
  if (!dv) return `${donde}: sin ninguna validación`
  if (dv.condition?.type !== 'ONE_OF_RANGE') return `${donde}: la validación es ${dv.condition?.type ?? '(sin tipo)'}, no ONE_OF_RANGE`
  const valor = String(dv.condition?.values?.[0]?.userEnteredValue ?? '')
  if (!valor.includes(AUX)) return `${donde}: la lista apunta a «${valor}», no a ${AUX}`
  if (dv.strict) return `${donde}: quedó estricta (rechazaría lo que el dueño pegue)`
  return null
}

/**
 * ¿LA COLUMNA ENTERA quedó con el desplegable? Se le pasa lo que devuelve `readSheetValidations` para
 * UNA pestaña, leyendo la columna completa. Devuelve los problemas, con `tope` de ejemplos.
 *
 * ═══ POR QUÉ LA COLUMNA Y NO LA PRIMERA CELDA (medido, 15/09/2026) ═══
 *
 * Esta verificación miraba la primera fila de datos y decía «puesto». En la copia de ensayo, 28 celdas
 * de Cobranzas H habían quedado con la lista heredada de la G y el control dio verde igual: eran filas
 * ESCONDIDAS POR EL FILTRO de la pestaña, y a una fila escondida Google no le aplica la validación —y
 * contesta 200—. Un control que mira una celda no puede decir nada de las otras 347.
 */
export function problemasDeLaColumna(hoja, ins, { tope = 10 } = {}) {
  const datos = (hoja?.data ?? [])[0]
  const filas = datos?.rowData ?? []
  if (!filas.length) return [`${rangoDeDatos(ins)}: no pude releer la columna`]
  const desde = (datos.startRow ?? 0) + 1
  const malas = filas.flatMap((f, i) => {
    const p = problemaDeCelda((f?.values ?? [])[0]?.dataValidation, `${ins.pestana}!${letraDeColumna(ins.indice)}${desde + i}`)
    return p ? [p] : []
  })
  if (!malas.length) return []
  return [`${rangoDeDatos(ins)}: ${malas.length} de ${filas.length} celda(s) sin el desplegable`, ...malas.slice(0, tope)]
}
