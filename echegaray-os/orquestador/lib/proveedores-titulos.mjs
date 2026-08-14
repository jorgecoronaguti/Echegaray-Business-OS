// LOS TÍTULOS DE LAS DOS SECCIONES DINÁMICAS: QUIÉN LOS REPONE CUANDO NO ESTÁN.
//
// ═══ EL DEFECTO QUE ESTO CIERRA (05/08) ═══
//
// "1 · QUÉ SE DEBE Y CUÁNDO" y "2 · CUENTA CORRIENTE POR PROVEEDOR" no los escribe NADIE. El
// generador de texto los construye pero quedan arriba de la frontera y se descartan al partir; las
// dos dinámicas los BUSCAN para ubicarse y fallan cerrado si no están. Fallar cerrado es lo correcto
// —sin ancla, escribir es destruir— pero el resultado es que un borrado de una celda congela dos
// secciones por tiempo indefinido y en silencio. Ya pasó con el título de la frontera ("3 · NOTAS DE
// CRÉDITO"), y ahí el bloque de abajo se quedó quieto DÍAS mostrando restos de corridas viejas.
//
// LA VÍA OBVIA NO SIRVE, y por eso esto es un paso aparte. Extender el generador de texto para que
// escriba también esas dos filas es incompatible con su mecanismo de limpieza: `aAnchoCompleto`
// rellena cada fila con el centinela VACIO hasta el ancho del bloque, y un VACIO sobre el cuerpo de
// una tabla dinámica LA BORRA. El modo de falla no es "queda feo": es la pestaña destruida.
//
// ENTONCES SE ESCRIBE UNA SOLA CELDA, Y SÓLO SI ESTÁ VACÍA. El sembrador no rehace un bloque, no
// limpia un ancho, no inserta filas: pone el texto del título en la celda A que le corresponde y no
// toca ni una más. Si esa celda tiene algo —cualquier cosa, de cualquier dueño— no escribe y lo
// reporta: una celda ocupada significa que la pestaña no tiene la forma que este módulo cree.
//
// ═══ DÓNDE VA EL TÍTULO: SALE DEL CONTRATO DE LA PESTAÑA, NO DE UNA BÚSQUEDA ═══
//
// Cada sección declara la distancia entre su título y su fila de rótulos, y es la MISMA que ya usan
// las dos geometrías para ubicarse:
//
//   sección 1 · título · aire · aviso · rótulos   ⇒ 3 filas (AVISO + 1, de proveedores-pivot-seccion1)
//   sección 2 · título · rótulos                  ⇒ 1 fila
//
// La fila de rótulos sobrevive al borrado del título —es salida de la corrida anterior, que sigue
// ahí porque el generador se frenó— y se reconoce por el NOMBRE DE SU COLUMNA DE VALOR, que lo
// declara el generador. De ahí que los nombres vivan acá: son la identidad de la sección, y el
// sembrador y el generador tienen que estar diciendo el mismo.

import { nSeccion } from './proveedores-frontera.mjs'
import { AVISO } from './proveedores-pivot-seccion1.mjs'

/** El separador de los títulos de esta pestaña. Lo mismo que exige `TITULO_DE_SECCION`. */
const SEPARADOR = '·'

/**
 * LA IDENTIDAD DE LAS DOS SECCIONES DINÁMICAS.
 *
 * `valores` son los `name` de los valores del pivot: van al pivot Y a la fila de rótulos, y acá
 * sirven para RECONOCER esa fila. El año de "Comprado 2026" es parte del contrato de la sección 2:
 * si cambia, cambia en un solo lugar y el sembrador lo sigue.
 */
export const SECCIONES_DINAMICAS = Object.freeze([
  Object.freeze({
    clave: 'deuda',
    texto: 'QUÉ SE DEBE Y CUÁNDO',
    // "Se le debe": el cuadro que abre la sección tiene una línea por PROVEEDOR y el rótulo dice de
    // qué habla la fila. Fue "Sale ese día" durante las doce horas en que el eje fue la fecha de
    // pago, y el dueño lo rechazó. Es el `name` del valor del pivot, así que se cambia acá y llega
    // solo al pivot y a la fila de rótulos.
    //
    // UN SOLO VALOR: "Facturas" (el conteo) se fue porque no cambia ninguna decisión —el cuadro de
    // detalle las lista una por una— y cada valor de más empuja una columna al vencimiento y a la
    // nota, que son las que sí deciden. Ver `lib/proveedores-cuadro-a.mjs`.
    valores: Object.freeze(['Se le debe']),
    aRotulos: AVISO + 1,
  }),
  Object.freeze({
    clave: 'cuentaCorriente',
    texto: 'CUENTA CORRIENTE POR PROVEEDOR',
    valores: Object.freeze(['Comprado 2026', 'Comprobantes']),
    aRotulos: 1,
  }),
])

/** Los valores del cuadro de detalle de la sección 1, que no tiene título propio (es un subtítulo). */
export const VALORES_DETALLE = Object.freeze(['Importe'])

const norm = (v) => String(v ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const sinNumero = (v) => norm(v).replace(/^\d{1,2}\s*[·.\-]\s*/, '')
const vacia = (f) => (f ?? []).every((c) => String(c ?? '').trim() === '')

/** El título completo, con su número. El número sale del orden de las secciones, nunca de acá. */
export const tituloCompleto = (texto, n) => `${n} ${SEPARADOR} ${texto}`

/**
 * EL TÍTULO DE UNA SECCIÓN DINÁMICA, TAL CUAL VA A LA PESTAÑA.
 *
 * Lo usan el sembrador y el generador de texto: son los dos que escriben ese string, y tienen que
 * estar diciendo el mismo. Estaba tipeado en los dos lados y ésa es la forma en que un ancla se
 * desincroniza de quien la busca.
 */
export function tituloDeSeccion(clave) {
  const s = SECCIONES_DINAMICAS.find((x) => x.clave === clave)
  if (!s) throw new Error(`tituloDeSeccion: "${clave}" no es una sección dinámica`)
  return tituloCompleto(s.texto, nSeccion(clave))
}

/**
 * QUÉ HAY QUE SEMBRAR Y DÓNDE. Núcleo puro: decide sin tocar nada.
 *
 * Estados posibles, y todos menos `siembra` terminan en NO ESCRIBIR:
 *
 *   presente    · el título está y dice lo que tiene que decir.
 *   renumerado  · el texto está pero con otro número. Se reescribe esa celda: el número es de
 *                 `SECCIONES_PROVEEDORES` y las dos geometrías se anclan a él ("^2 ·").
 *   siembra     · falta, y la celda donde va está vacía.
 *   sin-rotulos · falta el título Y la fila de rótulos: no hay de dónde deducir la posición.
 *   ocupada     · la celda calculada tiene algo. La pestaña no tiene la forma esperada.
 *
 * @param {{filas:any[][], secciones?:object[], numero:(clave:string)=>number}} o
 *        `filas` la pestaña leída con FORMATTED_VALUE, desde la fila 1
 * @returns {Array<{clave:string, estado:string, fila:number, texto:string}>}
 */
export function planDeSiembra({ filas = [], secciones = SECCIONES_DINAMICAS, numero }) {
  if (typeof numero !== 'function') throw new Error('planDeSiembra: falta `numero(clave)`')
  return secciones.map((s) => {
    const texto = tituloCompleto(s.texto, numero(s.clave))
    const iTitulo = filas.findIndex((f) => sinNumero((f ?? [])[0]) === norm(s.texto))
    if (iTitulo >= 0) {
      const igual = norm((filas[iTitulo] ?? [])[0]) === norm(texto)
      return { clave: s.clave, estado: igual ? 'presente' : 'renumerado', fila: iTitulo + 1, texto }
    }
    const iRot = filas.findIndex((f) => (f ?? []).some((c) => norm(c) === norm(s.valores[0])))
    if (iRot < 0) return { clave: s.clave, estado: 'sin-rotulos', fila: 0, texto }
    const fila = iRot + 1 - s.aRotulos
    if (fila < 1) return { clave: s.clave, estado: 'ocupada', fila, texto }
    return { clave: s.clave, estado: vacia(filas[fila - 1]) ? 'siembra' : 'ocupada', fila, texto }
  })
}

/** Lo que hay que escribir: sólo lo que se puede sembrar o renumerar. */
export const aEscribir = (plan = []) => plan.filter((p) => p.estado === 'siembra' || p.estado === 'renumerado')
