// EL VOCABULARIO DE LAS DOS VISTAS DE CASH FLOW — un bloque, seis líneas, una sola fuente.
//
// ═══ POR QUÉ EXISTE (05/08/2026) ═══
//
// El dueño, sobre las dos pestañas: *"no quiero que parezcan una planilla"*. Las dos eran una matriz
// de 53 columnas por 60 filas donde cada celda era un SUMPRODUCT distinto contra otra pestaña. Se
// rehacen como BLOQUES: un día (o un mes) es un bloque de seis líneas que se lee de arriba abajo —
// saldo inicial, lo que entró, lo que va a entrar, lo que salió, lo que va a salir, saldo al cierre.
//
// Este archivo es lo que las dos vistas COMPARTEN, y existe por la misma razón que `libro-sumas`: si
// la agenda diaria y el cuadro mensual definen cada uno qué es "un ingreso proyectado", en tres meses
// hay dos definiciones y la conciliación entre las dos pestañas deja de significar nada. Acá se
// define UNA vez; las dos vistas componen bloques con estas medidas y una ventana de tiempo.
//
// ═══ LA IDENTIDAD QUE SE PUEDE PROBAR ═══
//
// Un mes sumado día por día tiene que dar el mismo número que el bloque de ese mes. Con estas medidas
// eso deja de ser una coincidencia y pasa a ser aritmética: las dos vistas piden el MISMO filtro al
// MISMO libro, y lo único que cambia es la ventana [desde, hasta). Como las ventanas diarias de un mes
// son una partición exacta de la ventana del mes (`particionExacta` lo verifica), la suma coincide por
// construcción. El test compara los filtros generados, no los resultados: no hace falta la red.
//
// ═══ LO QUE NO SALE DEL LIBRO, SE DECLARA ═══
//
// El interés del descubierto, las comisiones bancarias y el impuesto al cheque NO son movimientos
// cargados: los modela el OS. No se disfrazan de línea del libro — van como líneas propias, rotuladas
// como estimadas, y sus fórmulas siguen viniendo de sus módulos (costo-descubierto, impuesto-cheque).

import { terminoLibro, LIBRO, rangoLibro } from './libro-sumas.mjs'
import { INSTRUMENTOS } from './libro-movimientos.mjs'

/**
 * CON QUÉ SE MOVIÓ LA PLATA CUANDO EL MOVIMIENTO PASA POR EL BANCO.
 *
 * Existe para una sola cosa: el impuesto al cheque (Ley 25.413) grava débitos y créditos en CUENTA
 * BANCARIA. Un pago en efectivo no lo paga, y cobrárselo infla el costo financiero de todos los meses.
 * Se deriva de la lista del libro en vez de copiarla, así un instrumento nuevo entra solo; el único
 * que se saca es el efectivo. El instrumento sin identificar QUEDA ADENTRO a propósito: en un costo, el
 * error barato es sobreestimar (mismo criterio que el interés del descubierto).
 */
export const INSTRUMENTOS_BANCARIOS = Object.freeze(INSTRUMENTOS.filter((i) => i !== 'efectivo'))
/** Lo que YA pasó: entró o salió de la cuenta. */
export const ESTADOS_REALES = Object.freeze(['REAL'])
/**
 * Lo que TODAVÍA NO pasó, en las tres formas en que el libro lo registra. Los tres van juntos en la
 * línea "proyectado" porque los tres son plata que no está en la cuenta; la diferencia entre un cheque
 * emitido (COMPROMETIDO) y un cobro esperado (PROYECTADO) se lee en el detalle, no en el saldo.
 * VENCIDO entra acá y no en real: una fecha que pasó sin conciliar NO es plata que se movió.
 */
export const ESTADOS_PENDIENTES = Object.freeze(['PROYECTADO', 'VENCIDO', 'COMPROMETIDO'])

/**
 * LAS CUATRO MEDIDAS DE UN BLOQUE. El orden es el de lectura: primero lo que entra, después lo que sale.
 *
 * `signoNeto` es cómo entra la medida en el saldo; `medida:'magnitud'` es cómo se MUESTRA. Los egresos
 * se muestran en positivo —un pago de $3M se lee "$3.000.000", no "($3.000.000)"— y restan igual.
 */
export const MEDIDAS = Object.freeze([
  { clave: 'ingresoReal', rotulo: 'Cobrado', signo: 1, estados: ESTADOS_REALES, medida: 'neto', signoNeto: 1 },
  { clave: 'ingresoProyectado', rotulo: 'A cobrar', signo: 1, estados: ESTADOS_PENDIENTES, medida: 'neto', signoNeto: 1 },
  { clave: 'egresoReal', rotulo: 'Pagado', signo: -1, estados: ESTADOS_REALES, medida: 'magnitud', signoNeto: -1 },
  { clave: 'egresoProyectado', rotulo: 'A pagar', signo: -1, estados: ESTADOS_PENDIENTES, medida: 'magnitud', signoNeto: -1 },
])

/** El filtro que se le pide al libro para una medida dentro de una ventana. PURO. */
export function filtroDeMedida(m, desde, hasta) {
  return { desde, hasta, signo: m.signo, estados: [...m.estados], medida: m.medida }
}

/** La fórmula de una medida sobre una ventana. `desde` incluida, `hasta` EXCLUIDA. PURA. */
export function formulaMedida(m, desde, hasta) {
  return `=${terminoLibro(filtroDeMedida(m, desde, hasta))}`
}

/**
 * NÚCLEO PURO: ¿las ventanas cubren [inicio, fin) sin huecos ni solapamientos?
 *
 * Es la condición que hace que la agenda diaria y el cuadro mensual no puedan discrepar. Se verifica
 * sobre las FECHAS con las que se generan las ventanas, antes de que existan las fórmulas.
 *
 * @param {Array<{desde:Date, hasta:Date}>} ventanas en orden
 * @returns {{ok:boolean, huecos:string[]}}
 */
export function particionExacta(ventanas = [], inicio = null, fin = null) {
  const t = (d) => new Date(d).getTime()
  const huecos = []
  if (!ventanas.length) return { ok: false, huecos: ['no hay ventanas'] }
  if (inicio && t(ventanas[0].desde) !== t(inicio)) huecos.push('la primera ventana no arranca en el inicio del período')
  for (let i = 1; i < ventanas.length; i++) {
    if (t(ventanas[i - 1].hasta) !== t(ventanas[i].desde)) {
      huecos.push(`entre la ventana ${i} y la ${i + 1} hay un salto`)
    }
  }
  if (fin && t(ventanas[ventanas.length - 1].hasta) !== t(fin)) huecos.push('la última ventana no termina en el fin del período')
  return { ok: huecos.length === 0, huecos }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL SALDO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * EL SALDO CON EL QUE ARRANCA EL PRIMER BLOQUE — el único que no encadena.
 *
 * Sale del saldo declarado de CAJA (rango con nombre) más lo REAL registrado entre el corte de ese
 * saldo y el arranque del bloque. Lo pendiente NO se suma: el saldo de hoy es lo que hay en la cuenta,
 * no lo que debería haber. Sumarle un cobro proyectado que venció y nadie concilió es exactamente el
 * doble conteo que la skill de tesorería marca como el error clásico del forecast.
 *
 * @param {object} p
 * @param {string} p.refSaldo rango con nombre (o celda) del saldo declarado
 * @param {string} p.refFecha rango con nombre (o celda) de la fecha de ese saldo
 * @param {string} p.hasta expresión del primer día del bloque (EXCLUIDA de la puesta al día)
 */
export function formulaSaldoAncla({ refSaldo, refFecha, hasta }) {
  const puestaAlDia = terminoLibro({ desde: `${refFecha}+1`, hasta, estados: ESTADOS_REALES, medida: 'neto' })
  return `=N(${refSaldo})+${puestaAlDia}`
}

/** El saldo al cierre de un bloque: lo que arrancó más lo que se movió. PURA. */
export function formulaSaldoCierre(celdaInicio, celdasMedidas) {
  const term = MEDIDAS.map((m, i) => `${m.signoNeto > 0 ? '+' : '-'}N(${celdasMedidas[i]})`).join('')
  return `=N(${celdaInicio})${term}`
}

/** El neto del bloque: entra menos sale, sin el saldo. PURA. */
export function formulaNeto(celdasMedidas) {
  const term = MEDIDAS.map((m, i) => `${m.signoNeto > 0 ? '+' : '-'}N(${celdasMedidas[i]})`).join('')
  return `=${term.replace(/^\+/, '')}`
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL MOVIMIENTO QUE EXPLICA EL DÍA
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ CON `FILTER` Y NO CON `SORTN` SOBRE UN ARRAY LITERAL. La forma corta de "el mayor del día
// con su contraparte" es `SORTN({contraparte\importe};1;0;2;FALSO)`, y ese `\` es el separador de
// COLUMNAS del locale es-AR. Un array literal mal separado no da error: devuelve una sola columna y la
// contraparte sale vacía. Dos FILTER escalares no tienen esa trampa y se leen igual de bien.
//
// Y NINGUNO DERRAMA. Todo va envuelto en MAX/INDEX, así que cada fórmula ocupa SU celda: una fórmula
// que derrama sobre las celdas de abajo se rompe con #REF! la próxima vez que el generador escriba el
// rectángulo entero (memoria del proyecto: "nunca escribir el derrame de ARRAYFORMULA").

const R = rangoLibro

/** Las condiciones de FILTER para los movimientos de un signo dentro de una ventana. PURA. */
const condiciones = (desde, hasta, signo) => [
  `${R(LIBRO.col.fecha)}>=${desde}`,
  `${R(LIBRO.col.fecha)}<${hasta}`,
  `${R(LIBRO.col.signo)}=${signo}`,
].join(';')

/** El importe del mayor movimiento del signo pedido dentro de la ventana. Cero si no hay ninguno. */
export function formulaMayorImporte(desde, hasta, signo) {
  return `=IFERROR(MAX(FILTER(${R(LIBRO.col.importe)};${condiciones(desde, hasta, signo)}));0)`
}

/**
 * Con quién es ese movimiento. Se busca por el importe que ya calculó la celda de al lado: así las dos
 * celdas no pueden describir movimientos distintos (si empatan dos, toma el primero del libro).
 */
export function formulaMayorContraparte(desde, hasta, signo, celdaImporte) {
  const cond = `${condiciones(desde, hasta, signo)};${R(LIBRO.col.importe)}=${celdaImporte}`
  return `=IFERROR(INDEX(FILTER(${R(LIBRO.col.contraparte)};${cond});1);"")`
}

/**
 * LA LÍNEA QUE SE LEE AL LADO DEL IMPORTE: "Mayor: ARCOR · $12.500.000".
 *
 * Se acota a 28 caracteres de contraparte a propósito: la columna de la nota mide 320px y un texto más
 * largo se derrama sobre el bloque de al lado. El patrón de número se escribe en convención US
 * (`#,##0`) porque los PATRONES no dependen del locale — el separador de argumentos sí, y por eso es `;`.
 */
export function formulaGlosaMayor(celdaImporte, celdaContraparte, prefijo = 'Mayor') {
  return `=IF(N(${celdaImporte})=0;"";"${prefijo}: "&LEFT(${celdaContraparte};28)&" · "&TEXT(${celdaImporte};"$ #,##0"))`
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA GRILLA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** El ancho de la parte VISIBLE: concepto, importe, nota. Nada más entra en una vista de bloques. */
export const ANCHO_VISTA = 3
/** Dónde arranca la zona auxiliar (columna E, 0-based 4): la D queda de aire y se oculta con ella. */
export const COL_AUX = 4

/**
 * EL FOOTPRINT QUE EL GENERADOR SE DECLARA DUEÑO Y LIMPIA.
 *
 * Las dos pestañas eran una matriz de ~56 columnas. La vista nueva usa 11: sin declarar el footprint
 * viejo, las columnas L..BD se quedan con la mitad derecha del cuadro anterior para siempre.
 *
 * ES SEGURO PORQUE LA PROTECCIÓN NO ES ÉSTA: si el dueño editó cualquier celda de la pestaña, la FIRMA
 * la detecta y la escritura no ocurre (escribirPreservando aborta antes de tocar nada). Este footprint
 * sólo decide qué limpia una corrida que ya tiene permiso de escribir.
 */
export const FOOTPRINT = Object.freeze({ filas: 220, cols: 58 })

/**
 * NÚCLEO PURO: normaliza la grilla al rectángulo del footprint, con el centinela de "es mía y va vacía".
 *
 * `VACIO` (preservar-anotaciones) es lo que distingue "esta celda es mía y quedó vacía" —se limpia—
 * de "esta celda no es mía" —se preserva—. Sin él, el resto del cuadro viejo sobrevive a la fusión.
 */
export function rectangulo(filas, vacio, { alto = FOOTPRINT.filas, ancho = FOOTPRINT.cols } = {}) {
  const out = []
  for (let i = 0; i < Math.max(alto, filas.length); i++) {
    const f = filas[i] || []
    const r = []
    for (let j = 0; j < ancho; j++) {
      const v = f[j]
      r.push(v === undefined || v === null || v === '' ? vacio : v)
    }
    out.push(r)
  }
  return out
}

/** Índice 0 → letra de columna. Igual que en el resto del repo: una sola forma de nombrar una columna. */
export function letra(i) {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}

/** La celda A1 de una fila/columna del cuadro, en absoluto. */
export const celda = (col, fila) => `$${letra(col)}$${fila}`

/** Un rótulo de sub-ítem del bloque, con la misma sangría en las dos vistas. */
export const item = (texto) => `   · ${texto}`

const MESES_AR = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS_AR = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** "martes 5 de agosto" — el título de un bloque de día. En oración, nunca en versalita. */
export const rotuloDia = (d) => `${DIAS_AR[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES_AR[d.getUTCMonth()]}`
/** "Agosto 2026" — el título de un bloque de mes. */
export const rotuloMes = (d) => `${MESES_AR[d.getUTCMonth()][0].toUpperCase()}${MESES_AR[d.getUTCMonth()].slice(1)} ${d.getUTCFullYear()}`
/** La fecha como la escribe el archivo (es-AR, DD/MM/YYYY). Se escribe como VALOR, no como texto. */
export const fechaAR = (d) => `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`
