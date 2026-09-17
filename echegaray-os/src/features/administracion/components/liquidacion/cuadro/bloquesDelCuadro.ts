// LOS CUATRO BLOQUES DEL CUADRO DE LA QUINCENA — horas · recibo blanco · recibo negro · resto del cálculo.
//
// Dueño, 17/09/2026, textual: *«necesito que se distinga la sección de hs, recibo blanco, recibo negro y el resto
// de cálculo»*. Hasta hoy sólo blanco y negro tenían banda; los días, «Horas» y las seis columnas del final se leían
// como una sola tira de 34 columnas. Cada columna pertenece ahora a UN bloque, el bloque tiene su rótulo arriba y un
// fondo tenue que baja hasta el total, y la fila se lee en el orden en que se arma el sueldo.
//
// ═══ ACÁ VIVE LA LISTA, NO EN LA PANTALLA ═══
//
// Las columnas, su ancho y su bloque salen de este archivo para que un test pueda afirmar sin montar React que
// NINGUNA columna pedida por el dueño se fue («lo pedido no se quita», 16/09/2026) y que los bloques cubren la
// grilla entera sin huecos ni solapes. Si una columna cambia de bloque, cambia acá y la grilla la sigue.

/** Los cuatro bloques, en el orden de la fila. */
export type ClaveDeBloque = 'horas' | 'blanco' | 'negro' | 'resto'

export interface Bloque {
  clave: ClaveDeBloque
  rotulo: string
  /**
   * EL FONDO DEL BLOQUE, SIEMPRE DE UN TOKEN Y CON ALFA. Con alfa y no opaco porque la fila pagada se pinta
   * entera de verde (`V.posSuave`): un fondo opaco la taparía justo en blanco y negro, que es donde se paga.
   * Alternan —nada · tenue · un poco más · nada— para que dos bloques vecinos nunca tengan el mismo fondo, y el
   * negro es el más oscuro porque así se lo nombra.
   */
  fondo: string | undefined
}

export const BLOQUES: readonly Bloque[] = [
  { clave: 'horas', rotulo: 'Horas', fondo: undefined },
  { clave: 'blanco', rotulo: 'Recibo blanco', fondo: 'rgb(var(--os-surface-sunken-rgb) / 0.55)' },
  { clave: 'negro', rotulo: 'Recibo negro · plataforma', fondo: 'rgb(var(--os-accent-rgb) / 0.1)' },
  { clave: 'resto', rotulo: 'Resto del cálculo', fondo: undefined },
]

/**
 * LAS COLUMNAS DE LA PLATA, CADA UNA EN SU BLOQUE (dueño, 15, 16 y 17/09/2026).
 *
 * Blanco y negro tienen las mismas cinco —cuánto, cuánto se pagó, cuánto falta— y se leen en paralelo. El resto
 * del cálculo junta lo que no es de un solo recibo: el presentismo (sale del negro pero es una regla aparte), los
 * billetes redondeados, y Total · Pagado · Saldo · Saldo red., que es donde se decide el pago.
 *
 *   «EFECT. RED. ✎»  vuelve el 16/09 («¿por qué quitaste la columna de efectivo redondeado?»): no se quita.
 *   «SALDO RED.»     16/09: «saldo redondeado como si lo que resta pagar se pagara en efectivo». Derivada, no se
 *                    edita ni se guarda. Distinta de «Efect. red.», que redondea el lado negro.
 *   Anchos 72 y 64   Horas y Hs negro se escriben (15/09) y la marca «manual» no entra en 56 y 48.
 *   120 del $/h negro el botón del $/h con el «+8%» al lado.
 */
export const PLATA = [
  { clave: 'horas', rotulo: 'Horas ✎', px: 72, bloque: 'horas' },
  { clave: 'hsBlanco', rotulo: 'Hs recibo ✎', px: 72, bloque: 'blanco' },
  { clave: 'horaCategoria', rotulo: '$/h cat. ✎', px: 96, bloque: 'blanco' },
  { clave: 'neto', rotulo: 'Banco ✎', px: 124, bloque: 'blanco' },
  { clave: 'pagadoBanco', rotulo: 'Pagado ✎', px: 112, bloque: 'blanco' },
  { clave: 'saldoBanco', rotulo: 'Saldo', px: 112, bloque: 'blanco' },
  { clave: 'hsNegro', rotulo: 'Hs ✎', px: 64, bloque: 'negro' },
  { clave: 'horaNegro', rotulo: '$/h negro ✎', px: 120, bloque: 'negro' },
  { clave: 'negro', rotulo: 'Importe ✎', px: 104, bloque: 'negro' },
  { clave: 'pagadoEfectivo', rotulo: 'Pagado ✎', px: 112, bloque: 'negro' },
  { clave: 'saldoEfectivo', rotulo: 'Saldo', px: 112, bloque: 'negro' },
  { clave: 'presentismo', rotulo: 'Presentismo', px: 120, bloque: 'resto' },
  { clave: 'efectivoRedondeado', rotulo: 'Efect. red. ✎', px: 108, bloque: 'resto' },
  { clave: 'total', rotulo: 'Total', px: 124, bloque: 'resto' },
  { clave: 'pagado', rotulo: 'Pagado', px: 112, bloque: 'resto' },
  { clave: 'saldo', rotulo: 'Saldo', px: 120, bloque: 'resto' },
  { clave: 'saldoRedondeado', rotulo: 'Saldo red.', px: 120, bloque: 'resto' },
] as const satisfies readonly { clave: string; rotulo: string; px: number; bloque: ClaveDeBloque }[]

export type ColumnaDePlata = (typeof PLATA)[number]

/** El ancho de la columna de un día. */
export const DIA = 36
/** El aire entre columnas: un paso de la grilla de 8. */
export const GAP = 8

/** Las columnas de plata de un bloque, en orden. */
export const columnasDelBloque = (bloque: ClaveDeBloque): ColumnaDePlata[] =>
  PLATA.filter((c) => c.bloque === bloque)

/** Cuántas columnas de la grilla ocupa un bloque. Horas suma los días. */
export const anchoDelBloque = (bloque: ClaveDeBloque, nDias: number): number =>
  columnasDelBloque(bloque).length + (bloque === 'horas' ? nDias : 0)

export interface TramoDeBloque extends Bloque {
  /** La línea de la grilla donde empieza (1 = Persona). */
  inicio: number
  /** Cuántas columnas cubre. */
  span: number
}

/**
 * DÓNDE CAE CADA BLOQUE EN LA GRILLA. Persona es la columna 1 y no es de ningún bloque: queda fija a la
 * izquierda. Los bloques son contiguos y en orden, así que el primero empieza en 2 y cada uno donde terminó el
 * anterior.
 */
export function tramosDeBloques(nDias: number): TramoDeBloque[] {
  let inicio = 2
  return BLOQUES.map((b) => {
    const span = anchoDelBloque(b.clave, nDias)
    const tramo = { ...b, inicio, span }
    inicio += span
    return tramo
  })
}

/**
 * DÓNDE EMPIEZA UN BLOQUE Y CUÁNTO MIDE, EN PX, CONTADO DESDE EL BORDE DERECHO DE PERSONA. Persona mide una variable
 * CSS (el dueño la arrastra) pero no importa: el rótulo que sigue al desplazamiento se mueve con
 * `corrimiento − desde`, y Persona está a los dos lados de esa resta.
 */
export function geometriaDelBloque(clave: ClaveDeBloque, nDias: number): { desde: number; ancho: number } {
  const anchos = [...Array.from({ length: nDias }, () => ({ bloque: 'horas' as ClaveDeBloque, px: DIA })), ...PLATA]
  let desde = GAP
  let ancho = 0
  let visto = false
  for (const c of anchos) {
    if (c.bloque === clave) { ancho += (visto ? GAP : 0) + c.px; visto = true; continue }
    if (!visto) desde += c.px + GAP
  }
  return { desde, ancho }
}

/**
 * CUÁNTO SE CORRE EL RÓTULO DE UN BLOQUE para seguir a la vista mientras el bloque esté en pantalla (17/09/2026: al
 * desplazar la cinta, «RECIBO BLANCO» se iba por la izquierda y quedaba una banda gris sin nombre). Nunca antes de
 * su bloque (0) y nunca más allá de su ancho: la última posición la recorta CSS contra el ancho del propio rótulo.
 */
export const corrimientoDelRotulo = (corrimiento: number, g: { desde: number; ancho: number }): number =>
  Math.max(0, Math.min(corrimiento - g.desde, g.ancho))

// LOS DÍAS ADELANTE, COMO EN LA PLANILLA: Persona · días · plata.
export const columnasDe = (nDias: number): string =>
  `minmax(var(--liq-persona,200px),1fr) repeat(${nDias},${DIA}px) ${PLATA.map((c) => `${c.px}px`).join(' ')}`

/** El ancho mínimo de la tabla: la columna Persona (variable) más todo lo demás (fijo). */
export const anchoDe = (nDias: number): string =>
  `calc(var(--liq-persona,200px) + ${nDias * DIA + PLATA.reduce((s, c) => s + c.px, 0) + (nDias + PLATA.length) * GAP}px)`
