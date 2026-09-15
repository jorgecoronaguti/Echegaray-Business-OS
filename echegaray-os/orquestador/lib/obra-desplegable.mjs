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

/**
 * LAS VALIDACIONES DE LAS DOS COLUMNAS. Empiezan en la fila SIGUIENTE al encabezado: una validación
 * sobre la celda del rótulo le pondría desplegable a la palabra «Obra».
 *
 * Sin `endRowIndex`: el rango llega hasta el fin de la pestaña, así una fila nueva nace con el
 * desplegable puesto. Con un fin fijo, la primera fila agregada después de esta corrida no lo tendría.
 * @param {Array<{pestana:string, filaEncabezado:number, indice:number}>} inserciones
 * @param {(pestana:string) => number|undefined} sheetIdDe
 */
export function requestsDeValidacion(inserciones = [], sheetIdDe = () => undefined) {
  return inserciones.map((ins) => {
    const sheetId = sheetIdDe(ins.pestana)
    if (!Number.isInteger(sheetId)) throw new Error(`${ins.pestana}: sin sheetId, no pongo el desplegable a ciegas`)
    return {
      setDataValidation: {
        range: { sheetId, startRowIndex: ins.filaEncabezado, startColumnIndex: ins.indice, endColumnIndex: ins.indice + 1 },
        rule: {
          condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: `=${RANGO_LISTA}` }] },
          showCustomUi: true,
          strict: false,
        },
      },
    }
  })
}

/**
 * ¿LA CELDA QUEDÓ CON EL DESPLEGABLE? Se le pasa lo que devuelve `readSheetValidations` para UNA
 * pestaña. Devuelve el problema o `null`.
 *
 * Esto es la prueba del EFECTO: que el `batchUpdate` haya contestado 200 no dice que la regla esté
 * puesta —un rango mal armado se acepta y no valida nada—. Lo que prueba es la regla releída.
 */
export function problemaDeValidacion(hoja, ins) {
  const datos = (hoja?.data ?? [])[0]
  const fila = (datos?.rowData ?? [])[0]
  const dv = (fila?.values ?? [])[0]?.dataValidation
  if (!dv) return `${rangoDeDatos(ins)}: la celda no tiene ninguna validación`
  if (dv.condition?.type !== 'ONE_OF_RANGE') return `${rangoDeDatos(ins)}: la validación es ${dv.condition?.type ?? '(sin tipo)'}, no ONE_OF_RANGE`
  const valor = String(dv.condition?.values?.[0]?.userEnteredValue ?? '')
  if (!valor.includes(AUX)) return `${rangoDeDatos(ins)}: la lista apunta a «${valor}», no a ${AUX}`
  if (dv.strict) return `${rangoDeDatos(ins)}: quedó estricta (rechazaría lo que el dueño pegue)`
  return null
}
