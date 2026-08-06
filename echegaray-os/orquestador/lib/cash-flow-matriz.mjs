// EL VOCABULARIO DE LAS DOS VISTAS DE CASH FLOW — FILAS DE CONCEPTO, COLUMNAS DE TIEMPO.
//
// ═══ QUÉ REEMPLAZA, Y POR QUÉ (06/08/2026) ═══
//
// A `cash-flow-bloques.mjs`, que definía la misma medida para una vista de BLOQUES VERTICALES: un día
// (o un mes) era un bloque de siete líneas que se leía de arriba abajo. El dueño lo rechazó con el
// número en la mano: 98 filas para catorce días, 96 para doce meses, y para comparar dos períodos
// había que recordar el número del bloque de arriba mientras se leía el de abajo. La referencia de
// claridad es la de siempre en un cash flow: **una fila por concepto, todo el tiempo a la derecha**.
//
// Lo que NO cambia es de dónde sale la plata. Todo número sigue siendo `terminoLibro` sobre
// `_MOVIMIENTOS` (libro-sumas.mjs) con una ventana [desde, hasta). Este archivo es lo que las dos
// vistas COMPARTEN, y existe por la misma razón que existía el anterior: si la vista semanal y la
// mensual definen cada una qué es "un ingreso proyectado", en tres meses hay dos definiciones y la
// conciliación entre las dos pestañas deja de significar nada.
//
// ═══ LA COHERENCIA QUE SE PUEDE PROBAR ═══
//
// Las dos vistas piden el MISMO filtro al MISMO libro, y lo único que cambia es la ventana. Las
// ventanas de las dos salen de la misma función (`ventanas`), y sus fórmulas de la misma
// (`expresionVentana`). Como la ventana de una semana y la de un mes son uniones de las MISMAS
// ventanas diarias (`particionExacta` lo verifica), ningún período puede sumar distinto en una vista
// que en la otra: coincide por aritmética, no por casualidad.
//
// Lo que NO es cierto —y por eso no se testea— es que "la suma de las semanas de un mes dé el mes":
// una semana cruza el fin de mes y sus movimientos caen a los dos lados. Repartirla es una
// convención, y cualquiera que se elija genera diferencias de borde que no son defectos. Lo que sí
// tiene que cerrar es la definición, y eso es lo que se prueba.

import { terminoLibro } from './libro-sumas.mjs'

/** Un día en milisegundos. Todas las fechas se manejan en UTC: el huso del proceso no decide un mes. */
export const DIA_MS = 86400000

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
 * LAS CUATRO MEDIDAS DE FLUJO. El orden es el de las filas de la matriz: primero lo que entra.
 *
 * `signoNeto` es cómo entra la medida en el resultado; `medida:'magnitud'` es cómo se MUESTRA. Los
 * egresos se muestran en positivo —un pago de $3M se lee "$3.000.000", no "($3.000.000)"— y restan igual.
 */
export const MEDIDAS = Object.freeze([
  { clave: 'ingresoReal', signo: 1, estados: ESTADOS_REALES, medida: 'neto', signoNeto: 1 },
  { clave: 'ingresoProyectado', signo: 1, estados: ESTADOS_PENDIENTES, medida: 'neto', signoNeto: 1 },
  { clave: 'egresoReal', signo: -1, estados: ESTADOS_REALES, medida: 'magnitud', signoNeto: -1 },
  { clave: 'egresoProyectado', signo: -1, estados: ESTADOS_PENDIENTES, medida: 'magnitud', signoNeto: -1 },
])

/** El filtro que se le pide al libro para una medida dentro de una ventana. PURO. */
export function filtroDeMedida(m, desde, hasta) {
  return { desde, hasta, signo: m.signo, estados: [...m.estados], medida: m.medida }
}

/** La fórmula de una medida sobre una ventana. `desde` incluida, `hasta` EXCLUIDA. PURA. */
export function formulaMedida(m, desde, hasta) {
  return `=${terminoLibro(filtroDeMedida(m, desde, hasta))}`
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LAS FILAS: UN CONCEPTO CADA UNA, EN EL ORDEN EN QUE SE LEEN
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Los rótulos son los que pidió el dueño, literales. No llevan sangría ni prefijo: en una matriz la
// columna A es una sola lista de conceptos, y el "   · " de las vistas de bloques servía para marcar
// jerarquía DENTRO de un bloque — jerarquía que acá la da la fila, no la sangría.

/** `total: true` = la columna TOTAL suma la fila. Un saldo es un stock: sumarlo no significa nada. */
export const CONCEPTOS = Object.freeze([
  { clave: 'saldoInicial', rotulo: 'Saldo inicial', total: false },
  { clave: 'ingresoReal', rotulo: 'Ingresos reales', medida: 0, total: true },
  { clave: 'ingresoProyectado', rotulo: 'Ingresos proyectados', medida: 1, total: true },
  { clave: 'egresoReal', rotulo: 'Egresos reales', medida: 2, total: true },
  { clave: 'egresoProyectado', rotulo: 'Egresos proyectados', medida: 3, total: true },
  { clave: 'resultado', rotulo: 'Resultado', total: true },
  { clave: 'saldoFinal', rotulo: 'Saldo final', total: false },
  // Las dos variaciones son del cuadro anual: una semana no tiene presupuesto cargado ni "semana
  // anterior" con la que compararse dentro del horizonte.
  { clave: 'variacionPresupuesto', rotulo: 'Variación vs presupuesto', total: false, soloMes: true },
  { clave: 'variacionMesAnterior', rotulo: 'Variación vs mes anterior', total: false, soloMes: true },
])

/** Las filas que lleva cada vista, en orden. PURA. */
export const conceptosDe = (tipo) => CONCEPTOS.filter((c) => tipo === 'mes' || !c.soloMes)

/**
 * LA GEOMETRÍA, DECLARADA UNA VEZ Y COMPARTIDA POR LAS DOS VISTAS.
 *
 * Las dos filas del hero y la del encabezado son las mismas en las dos pestañas a propósito: quien
 * abre una y después la otra no tiene que volver a buscar dónde está cada cosa.
 */
export const FILA = Object.freeze({
  titulo: 1, subtitulo: 2, heroRotulo: 4, heroValor: 5, cabecera: 7, concepto: 8,
})
/** La columna del concepto y la primera de tiempo, contadas desde 0. */
export const COL = Object.freeze({ concepto: 0, tiempo0: 1 })

/** En qué fila queda un concepto de una vista. PURA — nadie cuenta filas a mano. */
export function filaDeConcepto(tipo, clave) {
  const i = conceptosDe(tipo).findIndex((c) => c.clave === clave)
  if (i < 0) throw new Error(`la vista "${tipo}" no tiene el concepto "${clave}"`)
  return FILA.concepto + i
}

/** Cuántas columnas de tiempo tiene cada vista. 13 semanas = la corriente + 12; 12 meses = el ejercicio. */
export const SEMANAS_HORIZONTE = 13
export const MESES_DEL_ANIO = 12
export const columnasDeTiempo = (tipo) => (tipo === 'mes' ? MESES_DEL_ANIO : SEMANAS_HORIZONTE)

/** La columna de TOTAL: la que sigue a la última de tiempo. */
export const colTotal = (tipo) => COL.tiempo0 + columnasDeTiempo(tipo)

/**
 * EL FOOTPRINT REAL DE CADA VISTA — lo que el generador se declara dueño, limpia, y ACHICA.
 *
 * Las dos pestañas venían de 220×65 y 220×62 con 86 filas muertas y quince columnas auxiliares
 * ocultas. Acá el ancho es exactamente el de la matriz (concepto + tiempo + total) y el alto es el
 * contenido más el sitio de los gráficos: sin declararlo, el resto de la hoja se queda para siempre
 * con la mitad derecha del diseño anterior.
 *
 * `filas` incluye el espacio de los gráficos, que se anclan DEBAJO de la matriz: `anchorCell` es una
 * celda real y si la hoja no llega, la API devuelve 400 y se cae el lote entero.
 */
export const FOOTPRINT = Object.freeze({
  semana: Object.freeze({ filas: 34, cols: 1 + SEMANAS_HORIZONTE + 1 }),
  mes: Object.freeze({ filas: 50, cols: 1 + MESES_DEL_ANIO + 1 }),
})
/** La fila donde arranca el primer gráfico: dos renglones debajo de la última del cuadro. */
export const filaGraficos = (tipo) => FILA.concepto + conceptosDe(tipo).length + 1

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LAS VENTANAS DE TIEMPO — LA MISMA FUNCIÓN PARA LAS DOS VISTAS
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const enUTC = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

/** El lunes de la semana que contiene `d`. La semana ISO: el lunes es el primer día. */
export function lunesDe(d) {
  const x = enUTC(new Date(d))
  while (x.getUTCDay() !== 1) x.setUTCDate(x.getUTCDate() - 1)
  return x
}

/**
 * NÚCLEO PURO: las ventanas de una vista. `desde` incluida, `hasta` EXCLUIDA — el mismo criterio que
 * `terminoLibro`, y por eso un movimiento no puede caer en dos columnas.
 *
 * @param {'semana'|'mes'} tipo
 * @param {{hoy?:Date, anio?:number, n?:number}} p
 * @returns {Array<{desde:Date, hasta:Date}>}
 */
export function ventanas(tipo, { hoy = new Date(), anio = null, n = null } = {}) {
  if (tipo === 'mes') {
    const a = anio ?? hoy.getUTCFullYear()
    return Array.from({ length: MESES_DEL_ANIO }, (_, m) => ({
      desde: new Date(Date.UTC(a, m, 1)), hasta: new Date(Date.UTC(a, m + 1, 1)),
    }))
  }
  const l0 = lunesDe(hoy)
  return Array.from({ length: n ?? SEMANAS_HORIZONTE }, (_, i) => {
    const desde = new Date(l0.getTime() + i * 7 * DIA_MS)
    return { desde, hasta: new Date(desde.getTime() + 7 * DIA_MS) }
  })
}

/** Las ventanas de un día dentro de [desde, hasta). Es la unidad atómica de las otras dos. PURA. */
export function ventanasDiarias(desde, hasta) {
  const out = []
  for (let d = enUTC(new Date(desde)); d.getTime() < new Date(hasta).getTime(); d = new Date(d.getTime() + DIA_MS)) {
    out.push({ desde: new Date(d), hasta: new Date(d.getTime() + DIA_MS) })
  }
  return out
}

/**
 * LA EXPRESIÓN de la ventana de una columna, a partir de la celda de su encabezado. PURA.
 *
 * El encabezado ES la fecha (un serial, no un texto): de ahí sale la ventana, así que no puede haber
 * una columna cuyo título diga una cosa y cuyo filtro sume otra.
 */
export function expresionVentana(celdaCab, tipo) {
  return tipo === 'mes'
    ? { desde: celdaCab, hasta: `EOMONTH(${celdaCab};0)+1` }
    : { desde: celdaCab, hasta: `${celdaCab}+7` }
}

/**
 * NÚCLEO PURO: ¿las ventanas cubren [inicio, fin) sin huecos ni solapamientos?
 *
 * Es la condición que hace que las dos vistas no puedan discrepar. Se verifica sobre las FECHAS con
 * las que se generan las ventanas, antes de que existan las fórmulas.
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
    if (t(ventanas[i - 1].hasta) !== t(ventanas[i].desde)) huecos.push(`entre la ventana ${i} y la ${i + 1} hay un salto`)
  }
  if (fin && t(ventanas[ventanas.length - 1].hasta) !== t(fin)) huecos.push('la última ventana no termina en el fin del período')
  return { ok: huecos.length === 0, huecos }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL MOVIMIENTO QUE EXPLICA EL PERÍODO — CON SU FILTRO DE ESTADO
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ═══ EL DEFECTO QUE ESTO CIERRA (06/08/2026) ═══
//
// La versión de bloques pedía "el mayor movimiento del día" SIN filtro de estado y lo escribía al
// lado de una medida que sí filtraba: la glosa decía "Mayor pago: ARCOR · $12.500.000" pegada a un
// "Pagado —". Las dos celdas eran correctas por separado y juntas mentían. Un "mayor X" lleva
// SIEMPRE los mismos estados que la medida que acompaña, y por eso `estados` no tiene default.
//
// POR QUÉ CON `FILTER` Y NO CON `SORTN` SOBRE UN ARRAY LITERAL. La forma corta de "el mayor con su
// contraparte" es `SORTN({contraparte\importe};1;0;2;FALSO)`, y ese `\` es el separador de COLUMNAS
// del locale es-AR. Un array literal mal separado no da error: devuelve una sola columna y la
// contraparte sale vacía. Dos FILTER escalares no tienen esa trampa.
//
// Y NINGUNO DERRAMA: todo va envuelto en MAX/INDEX, así que cada fórmula ocupa SU celda.

import { LIBRO, rangoLibro } from './libro-sumas.mjs'

const R = rangoLibro

/** Las condiciones de FILTER para los movimientos de un signo y unos estados dentro de una ventana. */
function condiciones(desde, hasta, signo, estados) {
  const cond = [
    `${R(LIBRO.col.fecha)}>=${desde}`,
    `${R(LIBRO.col.fecha)}<${hasta}`,
    `${R(LIBRO.col.signo)}=${signo}`,
  ]
  if (!estados?.length) throw new Error('un "mayor movimiento" sin filtro de estado contradice a la medida que acompaña')
  cond.push(`(${estados.map((e) => `(${R(LIBRO.col.estado)}="${e}")`).join('+')})`)
  return cond.join(';')
}

/** El importe del mayor movimiento del signo y los estados pedidos dentro de la ventana. */
export function formulaMayorImporte(desde, hasta, signo, estados) {
  return `=IFERROR(MAX(FILTER(${R(LIBRO.col.importe)};${condiciones(desde, hasta, signo, estados)}));0)`
}

/**
 * Con quién es ese movimiento. Se busca por el importe que ya calculó la celda de al lado: así las dos
 * celdas no pueden describir movimientos distintos (si empatan dos, toma el primero del libro).
 */
export function formulaMayorContraparte(desde, hasta, signo, estados, celdaImporte) {
  const cond = `${condiciones(desde, hasta, signo, estados)};${R(LIBRO.col.importe)}=${celdaImporte}`
  return `=IFERROR(INDEX(FILTER(${R(LIBRO.col.contraparte)};${cond});1);"")`
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA GRILLA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO: normaliza la grilla al rectángulo del footprint, con el centinela de "es mía y va vacía".
 *
 * `VACIO` (preservar-anotaciones) es lo que distingue "esta celda es mía y quedó vacía" —se limpia—
 * de "esta celda no es mía" —se preserva—. Sin él, el resto del cuadro viejo sobrevive a la fusión.
 */
export function rectangulo(filas, vacio, { alto, ancho }) {
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
/** Un rango horizontal de la misma fila, en absoluto. */
export const rangoFila = (fila, col0, col1) => `${celda(col0, fila)}:${celda(col1, fila)}`

/**
 * EL ENCABEZADO DE TIEMPO ES UN SERIAL, NUNCA UN TEXTO (06/08).
 *
 * La versión de bloques escribía la fecha como "1/12/2026" y confiaba en que Sheets la parseara. En el
 * Mensual real, E21 —diciembre— quedó como TEXTO: el rango con nombre CF_MESES prometía doce fechas y
 * entregaba once fechas y una cadena, así que el MATCH del anexo de CAJA no encontraba diciembre y no
 * daba ningún error. Un serial escrito como número no depende del locale ni del parser.
 */
export const serialDeFecha = (d) => Math.round((new Date(d).getTime() - Date.UTC(1899, 11, 30)) / DIA_MS)

const MESES_AR = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** "Agosto 2026" — para los logs y los tests, nunca para una celda: en la celda va el serial. */
export const rotuloMes = (d) => `${MESES_AR[d.getUTCMonth()][0].toUpperCase()}${MESES_AR[d.getUTCMonth()].slice(1)} ${d.getUTCFullYear()}`
/** "5/8/2026" — la fecha como la escribe el archivo (es-AR). Sólo para textos, no para celdas de tiempo. */
export const fechaAR = (d) => `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`
