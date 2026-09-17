// LAS COLUMNAS Y LOS BLOQUES DE LOS DOS CUADROS DE LA QUINCENA — jornaleros y mensuales (dueño, 17/09/2026).
//
// *«que se distingan HORAS, RECIBO BLANCO, RECIBO NEGRO y RESTO DEL CÁLCULO»*, y que los jefes de obra no queden en la
// grilla por hora con las celdas vacías. Son dos cuadros porque sus columnas significan cosas distintas: el jornalero
// cobra horas × $/h con un recibo por categoría y el resto en negro; el mensual cobra un sueldo del mes, con el recibo
// por banco y el efectivo hasta el sueldo.
//
// ═══ LA LISTA VIVE ACÁ, NO EN LA PANTALLA ═══
//
// Sin JSX para que un test pueda afirmar sin montar React que ninguna columna pedida se fue («lo pedido no se quita»,
// 16/09/2026), que cada columna tiene un bloque, y dónde cae cada bloque en px para saltar a él.

export type ClaveDeBloque = 'horas' | 'blanco' | 'negro' | 'resto' | 'sueldo' | 'efectivo'

/** Cómo se pinta el fondo del bloque. El color sale de un token en la pantalla; acá sólo el tono. */
export type TonoDeBloque = 'ninguno' | 'claro' | 'hundido'

export interface Bloque { clave: ClaveDeBloque; rotulo: string; corto: string; tono: TonoDeBloque }

export interface Columna { clave: string; rotulo: string; px: number; bloque: ClaveDeBloque }

export interface DefinicionDeCuadro {
  bloques: readonly Bloque[]
  columnas: readonly Columna[]
  /** Si las columnas de los días van adelante y pertenecen a este bloque. Sólo jornaleros. */
  bloqueDeLosDias: ClaveDeBloque | null
}

/**
 * JORNALEROS. Blanco y negro tienen las mismas cinco —cuánto, pagado, saldo— y se leen en paralelo. «Resto del
 * cálculo» junta lo que no es de un solo recibo: presentismo, billetes redondeados, y Total · Pagado · Saldo · Saldo
 * red., donde se decide el pago. Los tonos alternan para que dos bloques vecinos no tengan el mismo fondo, y el negro
 * es el más oscuro porque así se lo nombra.
 *
 *   «EFECT. RED. ✎»  vuelve el 16/09 («¿por qué quitaste la columna de efectivo redondeado?»): no se quita.
 *   «SALDO RED.»     16/09: «saldo redondeado como si lo que resta pagar se pagara en efectivo». No se edita.
 *   72 y 64          Horas y Hs negro se escriben (15/09) y la marca «manual» no entra en 56 y 48.
 *   120 del $/h negro el botón del $/h con el «+8%» al lado.
 */
export const CUADRO_JORNALEROS: DefinicionDeCuadro = {
  bloqueDeLosDias: 'horas',
  bloques: [
    { clave: 'horas', rotulo: 'Horas', corto: 'Horas', tono: 'ninguno' },
    { clave: 'blanco', rotulo: 'Recibo blanco', corto: 'Blanco', tono: 'claro' },
    { clave: 'negro', rotulo: 'Recibo negro · plataforma', corto: 'Negro', tono: 'hundido' },
    { clave: 'resto', rotulo: 'Resto del cálculo', corto: 'Resto', tono: 'ninguno' },
  ],
  columnas: [
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
    { clave: 'presentismo', rotulo: 'Presentismo', px: 112, bloque: 'resto' },
    { clave: 'efectivoRedondeado', rotulo: 'Efect. red. ✎', px: 108, bloque: 'resto' },
    { clave: 'total', rotulo: 'Total', px: 124, bloque: 'resto' },
    { clave: 'pagado', rotulo: 'Pagado', px: 112, bloque: 'resto' },
    { clave: 'saldo', rotulo: 'Saldo', px: 120, bloque: 'resto' },
    { clave: 'saldoRedondeado', rotulo: 'Saldo red.', px: 120, bloque: 'resto' },
  ],
}

/**
 * MENSUALES (jefes de obra y quien tiene neto mensual). Sin grilla de días: no cobran por hora, y quince columnas de
 * horas que no mueven un peso se leían como dato de pago. La asistencia queda como referencia en una celda.
 *
 *   Sueldo    la asistencia (referencia) y el sueldo del mes, que se escribe (neto mensual).
 *   Recibo    lo que va por banco: el recibo del estudio. Sin recibo se dice «sin recibo todavía».
 *   Efectivo  sueldo − recibo (regla del dueño para Oficina, 01/09/2026). Sin recibo no se inventa el reparto.
 *   Resto     las mismas columnas que jornaleros, con el presentismo «no aplica · mensual».
 */
export const CUADRO_MENSUALES: DefinicionDeCuadro = {
  bloqueDeLosDias: null,
  bloques: [
    { clave: 'sueldo', rotulo: 'Sueldo mensual', corto: 'Sueldo', tono: 'ninguno' },
    { clave: 'blanco', rotulo: 'Recibo blanco', corto: 'Blanco', tono: 'claro' },
    { clave: 'efectivo', rotulo: 'Efectivo · fuera del recibo', corto: 'Efectivo', tono: 'hundido' },
    { clave: 'resto', rotulo: 'Resto del cálculo', corto: 'Resto', tono: 'ninguno' },
  ],
  columnas: [
    { clave: 'asistencia', rotulo: 'Asistencia', px: 104, bloque: 'sueldo' },
    { clave: 'sueldo', rotulo: 'Sueldo del mes ✎', px: 128, bloque: 'sueldo' },
    { clave: 'banco', rotulo: 'Banco', px: 120, bloque: 'blanco' },
    { clave: 'pagadoBanco', rotulo: 'Pagado ✎', px: 112, bloque: 'blanco' },
    { clave: 'saldoBanco', rotulo: 'Saldo', px: 112, bloque: 'blanco' },
    { clave: 'efectivo', rotulo: 'Importe', px: 120, bloque: 'efectivo' },
    { clave: 'pagadoEfectivo', rotulo: 'Pagado ✎', px: 112, bloque: 'efectivo' },
    { clave: 'saldoEfectivo', rotulo: 'Saldo', px: 112, bloque: 'efectivo' },
    { clave: 'presentismo', rotulo: 'Presentismo', px: 112, bloque: 'resto' },
    { clave: 'efectivoRedondeado', rotulo: 'Efect. red. ✎', px: 108, bloque: 'resto' },
    { clave: 'total', rotulo: 'Total', px: 124, bloque: 'resto' },
    { clave: 'pagado', rotulo: 'Pagado', px: 112, bloque: 'resto' },
    { clave: 'saldo', rotulo: 'Saldo', px: 120, bloque: 'resto' },
    { clave: 'saldoRedondeado', rotulo: 'Saldo red.', px: 120, bloque: 'resto' },
  ],
}

/** El ancho de la columna de un día. */
export const DIA = 36
/** El aire entre columnas: un paso de la grilla de 8. */
export const GAP = 8

const diasDe = (d: DefinicionDeCuadro, nDias: number): number => (d.bloqueDeLosDias == null ? 0 : nDias)

/** Persona · días · plata. La columna Persona mide la variable CSS que el dueño arrastra. */
export const columnasDe = (d: DefinicionDeCuadro, nDias: number): string => {
  const dias = diasDe(d, nDias)
  return `minmax(var(--liq-persona,200px),1fr)${dias > 0 ? ` repeat(${dias},${DIA}px)` : ''} ${d.columnas.map((c) => `${c.px}px`).join(' ')}`
}

/** El ancho mínimo de la tabla: la columna Persona (variable) más todo lo demás (fijo). */
export const anchoDe = (d: DefinicionDeCuadro, nDias: number): string => {
  const dias = diasDe(d, nDias)
  return `calc(var(--liq-persona,200px) + ${dias * DIA + d.columnas.reduce((s, c) => s + c.px, 0) + (dias + d.columnas.length) * GAP}px)`
}

export interface TramoDeBloque extends Bloque {
  /** La línea de la grilla donde empieza (1 = Persona). */
  inicio: number
  /** Cuántas columnas cubre. */
  span: number
  /** Dónde empieza, en px desde el borde derecho de Persona (incluye el aire que lo separa). */
  desde: number
  /** Cuánto mide en px, con los aires de adentro. */
  ancho: number
}

/**
 * DÓNDE CAE CADA BLOQUE. Persona es la columna 1 y no es de ningún bloque: queda fija. Los bloques son contiguos y en
 * el orden de la definición; si una columna quedara fuera de orden, el tramo lo delata en el test.
 */
export function tramosDeBloques(d: DefinicionDeCuadro, nDias: number): TramoDeBloque[] {
  const pistas = [
    ...Array.from({ length: diasDe(d, nDias) }, () => ({ bloque: d.bloqueDeLosDias as ClaveDeBloque, px: DIA })),
    ...d.columnas,
  ]
  let desde = 0
  let linea = 2
  let i = 0
  return d.bloques.map((b) => {
    const inicio = linea
    const inicioPx = desde + GAP
    let ancho = 0
    let span = 0
    while (i < pistas.length && pistas[i].bloque === b.clave) {
      ancho += (span > 0 ? GAP : 0) + pistas[i].px
      desde += GAP + pistas[i].px
      span++; i++
    }
    linea += span
    return { ...b, inicio, span, desde: inicioPx, ancho }
  })
}

/**
 * CUÁNTO SE CORRE EL RÓTULO DE UN BLOQUE para seguir a la vista mientras el bloque esté en pantalla (17/09/2026: al
 * desplazar la cinta «RECIBO BLANCO» se iba por la izquierda y quedaba una banda sin nombre). Nunca antes de su
 * bloque y nunca más allá de su ancho.
 */
export const corrimientoDelRotulo = (corrimiento: number, t: { desde: number; ancho: number }): number =>
  Math.max(0, Math.min(corrimiento - t.desde, t.ancho))

/** Cuánto hay que desplazar la cinta para que el bloque quede pegado a Persona. */
export const desplazamientoHasta = (t: { desde: number }, primero: boolean): number => (primero ? 0 : Math.max(0, t.desde - GAP))

/**
 * EL BLOQUE QUE SE ESTÁ MIRANDO: el que más px ocupa en la ventana visible a la derecha de Persona. «El último cuyo
 * comienzo ya pasó» fallaba al final de la cinta: Resto no llega nunca a pegarse a Persona y el salto marcaba Negro
 * con Resto entero a la vista (QA, 17/09/2026). Sin ancho medido todavía, el primero.
 */
export function bloqueEnVista(tramos: readonly TramoDeBloque[], corrimiento: number, anchoVisible: number): ClaveDeBloque | null {
  if (tramos.length === 0) return null
  if (!(anchoVisible > 0)) return tramos[0].clave
  const desde = corrimiento
  const hasta = corrimiento + anchoVisible
  let mejor = tramos[0]
  let mejorPx = -1
  for (const t of tramos) {
    const px = Math.min(hasta, t.desde + t.ancho) - Math.max(desde, t.desde)
    if (px > mejorPx) { mejor = t; mejorPx = px }
  }
  return mejor.clave
}
