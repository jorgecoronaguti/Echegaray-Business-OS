// LA CABECERA DE "Cheques Emitidos" — NÚCLEO PURO, VERIFICABLE EN FRÍO.
//
//        DE LO QUE FIRMÉ, ¿CUÁNTO TODAVÍA NO SALIÓ Y CUÁNDO SALE?
//
// ═══ POR QUÉ SE REHIZO OTRA VEZ (06/08) ═══
//
// La versión anterior contestaba bien y se leía mal. Tenía una columna entera de prosa ("Qué
// significa") al lado de cada número, un subtítulo de un renglón y medio, y los tramos de vencimiento
// escritos como oraciones. Eso es un informe, no un tablero: para saber cuánta plata vence esta
// semana había que LEER. Un tablero de tesorería se contesta con el ojo, en menos de cinco segundos.
//
// Lo que cambia:
//   · SIETE INDICADORES en una sola fila, con el rótulo arriba y el número abajo. Nada más.
//   · UN CALENDARIO DEL MES. Un total mensual no se puede accionar; "el 14 vencen $12,3M" sí. Es la
//     forma en que un tesorero mira un vencimiento y la que ninguna versión anterior tenía.
//   · EL RESUMEN, en tres columnas y sin una sola palabra de explicación.
//   · CERO prosa. Si un rótulo necesita una aclaración, el rótulo está mal.
//
// ═══ LO QUE ESTA BANDA NO PUEDE HACER NUNCA (contrato con CAJA, que está CONGELADA) ═══
//
//   CAJA!B14 = SUMIFS('Cheques Emitidos'!$F$2:$F ; $K$2:$K;"SI" ; $I$2:$I;">"&fecha)
//   CAJA!H15 = SUMPRODUCT(($M$2:$M$400="⚠ sin N° de comprobante — no se puede cruzar") * … * F…)
//
// Las dos leen DESDE LA FILA 2, o sea DESDE ADENTRO DE ESTA BANDA. De ahí salen tres prohibiciones:
//
//   1. Ninguna celda de la banda puede decir "SI" en la columna K.
//   2. Ninguna celda de la banda puede contener esa marca exacta en la columna M.
//   3. El registro no puede pasar de la fila 400.
//
// Cumpliendo eso, un número en cualquier columna de la banda es inofensivo: los dos controles filtran
// por K y por M antes de mirar F. Y ES IMPORTANTE, porque esta banda SÍ escribe en la columna F —el
// jueves del calendario y el indicador de 30 días caen ahí—. La versión anterior tenía la regla "la
// banda nunca escribe en F"; se levanta a propósito y se reemplaza por la regla verdadera, que es la
// de K y M. El test `ninguna celda de la banda dice "SI" en K …` es el que la hace cumplir: si
// alguien vuelve a poner un SUM pelado sobre F en CAJA, ese test no lo va a atajar — hay que mirar
// CAJA.
//
// ═══ ES-AR ═══
// Todas las fórmulas van con `;`. La coma es el separador DECIMAL de este archivo.

import { BANDA, rangoAbierto } from './cheques-emitidos-geometria.mjs'
import { formulaUltimaFecha, formulaFrescuraDe } from './fecha-de-frescura.mjs'
import { total } from './patron-pestana.mjs'

/** Ancho de la grilla: A..M, el ancho real de la pestaña. */
export const COLS = 13

/**
 * Dónde vive cada cosa dentro de la banda (filas 1-based de la pestaña).
 *
 * Se exportan porque las fórmulas del calendario y las reglas de formato condicional necesitan
 * DIRECCIONES ("$B$7", "$G$5") y escribirlas a mano ya rompió tres cuadros de este archivo: el día
 * que se agrega un renglón, el número queda apuntando a la celda de al lado sin dar error.
 */
export const FILAS = Object.freeze({
  titulo: 1,
  corte: 2,
  rotulosKpi: 4,
  kpi: 5,
  calendario: 7,
  diasSemana: 8,
  semana0: 9,
  resumenHdr: 16,
  vencido: 17,
  hoy: 18,
  siete: 19,
  restoMes: 20,
  posteriores: 21,
  sinFecha: 22,
  total: 23,
  registro: 25,
})

// La última fila de la banda es "REGISTRO" y tiene que ser exactamente la última: si no, el generador
// insertaría o borraría filas por una cuenta y escribiría por otra, y la banda quedaría corrida
// respecto del encabezado del registro. Romper acá es infinitamente más barato que descubrirlo en el
// Sheet.
if (FILAS.registro !== BANDA) throw new Error(`cheques-emitidos-cabecera: FILAS.registro (${FILAS.registro}) tiene que ser la última fila de la banda (${BANDA})`)

/** Columna del selector de mes (B, 0-based 1) y primera columna del calendario (la misma). */
export const COL_SELECTOR = 1
/** 6 semanas × 7 días: seis alcanzan para cualquier mes, incluido febrero que arranca domingo. */
export const SEMANAS = 6
export const DIAS = 7

/** La fórmula que el generador pone en el selector cuando la celda está vacía: el mes corriente.
 *  Es fórmula y no un número para que el default SIGA AL RELOJ. Un `DATE(2026;8;1)` pegado dejaría
 *  la pestaña mostrando agosto en diciembre, y nadie se daría cuenta hasta que el calendario vacío
 *  hiciera pensar que no hay cheques. */
export const SELECTOR_DEFECTO = '=EOMONTH(TODAY();-1)+1'

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/** La celda del selector en notación A1 absoluta ("$B$7"). Todo lo que mira el mes pasa por acá. */
export const SEL = `$${letra(COL_SELECTOR)}$${FILAS.calendario}`
/** La celda del mayor vencimiento diario ("$G$5"): la usa la regla de concentración del calendario. */
export const CELDA_PICO = `$${letra(6)}$${FILAS.kpi}`

// ── LAS COLUMNAS DEL REGISTRO, COMO RANGOS ABIERTOS ANCLADOS EN LA GEOMETRÍA ─────────────────────
const C = rangoAbierto('C') // fecha de emisión
const F = rangoAbierto('F') // monto
const I = rangoAbierto('I') // fecha de pago
const K = rangoAbierto('K') // DEBITADO SI/No

/** NO DEBITADO = todo lo que NO dice "SI". Un DEBITADO en blanco es un cheque que todavía no salió
 *  de la cuenta: es el default seguro y es el mismo criterio que usa CAJA. */
const NO_DEB = `(UPPER(${K})<>"SI")`
/** El importe, neutralizando el texto y el vacío del rango abierto: sin esto un rótulo que caiga
 *  dentro del rango tumba la multiplicación entera con #VALUE!. */
const MONTO = `IF(ISNUMBER(${F});${F};0)`
const CON_FECHA = `ISNUMBER(${I})`

/**
 * ═══ LOS BORDES DE LOS TRAMOS — PARTICIÓN EXACTA, SIN HUECO NI SOLAPAMIENTO ═══
 *
 * El total del resumen tiene que dar EXACTAMENTE igual que el indicador COMPROMETIDO. Para eso los
 * seis tramos tienen que cubrir toda la recta del tiempo Y no pisarse:
 *
 *   vencido     I < HOY
 *   hoy         I = HOY
 *   próx. 7     HOY < I <= HOY+7
 *   resto mes   HOY+7 < I < FIN_MES
 *   posteriores I >= FIN_MES
 *   sin fecha   I no es número            ← el que hace que la suma cierre igual con datos incompletos
 *
 * FIN_MES = MAX(HOY+8; primer día del mes que viene). El MAX no es cosmético: si hoy es 28, el primer
 * día del mes que viene cae ANTES de HOY+7, y "posteriores" empezaría adentro de "próximos 7 días" —
 * la misma plata contada dos veces y el control cerrando igual porque el total se calcularía sobre
 * las mismas filas. Con el +8 el arranque de "posteriores" siempre queda después del cierre de los 7
 * días. Las fechas son enteros, así que `> HOY+7` y `>= HOY+8` son lo mismo.
 */
const FIN_MES = 'MAX(TODAY()+8;EOMONTH(TODAY();0)+1)'
export const TRAMOS = Object.freeze({
  vencido: `${CON_FECHA}*(${I}<TODAY())`,
  hoy: `${CON_FECHA}*(${I}=TODAY())`,
  siete: `${CON_FECHA}*(${I}>TODAY())*(${I}<=TODAY()+7)`,
  restoMes: `${CON_FECHA}*(${I}>TODAY()+7)*(${I}<${FIN_MES})`,
  posteriores: `${CON_FECHA}*(${I}>=${FIN_MES})`,
  sinFecha: `(NOT(${CON_FECHA}))`,
})

/** Monto no debitado que cumple una condición de array. Con `=`: sin él la celda queda como TEXTO y
 *  el tramo muestra la fórmula en vez del importe, sin dar error (defecto real, visto en un --dry). */
const monto = (cond) => `=SUMPRODUCT(${NO_DEB}*${cond}*${MONTO})`
/** Cantidad de cheques del mismo tramo. Cuenta filas CON IMPORTE: una fila a medio cargar no es un
 *  cheque todavía, y contarla haría que la columna de cantidad no se pueda cruzar con la de monto. */
const cantidad = (cond) => `=SUMPRODUCT(${NO_DEB}*${cond}*ISNUMBER(${F})*1)`

/** El comprometido: la definición ÚNICA de "lo que firmé y todavía no salió de la cuenta". */
export const COMPROMETIDO = `SUMPRODUCT(${NO_DEB}*${MONTO})`

/**
 * ═══ EL NETO NO DEBITADO DE UN DÍA — UNA SOLA DEFINICIÓN, TRES CONSUMIDORES ═══
 *
 * La usan el calendario (42 celdas), el indicador "mayor venc. diario" y la regla de formato
 * condicional que marca el día pico. Si se escribiera tres veces, el día que cambie el criterio dos
 * de los tres seguirían diciendo lo de antes.
 *
 * SE RESTA LO DEBITADO EN VEZ DE FILTRAR CON "<>SI". Un SUMIFS con criterio `"<>SI"` depende de cómo
 * trata Sheets los vacíos, y el caso normal de un cheque recién cargado es DEBITADO en blanco: si el
 * criterio los excluyera, el calendario mostraría de menos justo los cheques más nuevos. `"SI"` es
 * una igualdad exacta y no admite interpretación; el complemento sale por resta.
 */
const montoDelDia = (dia) => `SUMIF(${I};${dia};${F})-SUMIFS(${F};${I};${dia};${K};"SI")`
const cantidadDelDia = (dia) => `COUNTIF(${I};${dia})-COUNTIFS(${I};${dia};${K};"SI")`

/**
 * MAYOR VENCIMIENTO DIARIO: el peor día que viene. Es la cifra que dice si hace falta conseguir plata
 * para UN día puntual aunque el mes entero cierre bien.
 *
 * Recorre FILAS, no días del calendario. La alternativa era generar una secuencia de N días
 * (`TODAY()+SEQUENCE(120)`) y quedarse con el máximo: se descartó porque un cheque diferido más allá
 * del horizonte desaparecería del indicador EN SILENCIO, que es exactamente el defecto que este
 * archivo viene arrastrando. Recorriendo filas no hay horizonte que elegir.
 *
 * La otra alternativa —leer los 42 días del calendario de abajo— se descartó porque el calendario
 * muestra UN mes, el que el dueño eligió: el indicador cambiaría de significado al mover el selector.
 *
 * El MAX colapsa el array a un escalar, así que el ARRAYFORMULA no derrama sobre la celda de al lado.
 */
const PICO_DIARIO = `=MAX(ARRAYFORMULA(IF(${CON_FECHA}*${NO_DEB}*(${I}>=TODAY());${montoDelDia(I)};0)))`

/**
 * NÚCLEO PURO: la grilla de la banda, BANDA filas × COLS columnas.
 *
 * @param {{selector?: string|number}} [opts] qué poner en el selector de mes. Sale de la pestaña:
 *        ver `selectorAConservar`. Se pasa por parámetro para que la grilla siga siendo pura.
 * @returns {(string|number)[][]}
 */
export function bandaFilas({ selector = SELECTOR_DEFECTO } = {}) {
  const filas = Array.from({ length: BANDA }, () => new Array(COLS).fill(''))
  const set = (fila, col, valor) => { filas[fila - 1][col] = valor }
  const poner = (fila, col0, valores) => valores.forEach((v, i) => set(fila, col0 + i, v))

  set(FILAS.titulo, 0, 'CHEQUES EMITIDOS')

  // ═══ EL CORTE SALE DEL REGISTRO, NO DEL RELOJ DE LA CORRIDA ═══
  // El registro lo carga el dueño A MANO y cambia sin que corra nadie: una fecha estampada se queda
  // atrás para siempre. Y son DOS puertas, no una: cargar un cheque (emisión, columna C) y marcarlo
  // DEBITADO=SI desde el extracto (columna I). La segunda va FILTRADA por DEBITADO="SI" porque la
  // fecha de pago de un cheque que el banco todavía no debitó es una PREVISIÓN, no un hecho: sin el
  // filtro el rótulo declararía frescura de algo que no ocurrió.
  const corte = formulaFrescuraDe([
    formulaUltimaFecha(C),
    formulaUltimaFecha(I, { cuando: `(UPPER(${K})="SI")` }),
  ])
  const vivos = `SUMPRODUCT(${NO_DEB}*ISNUMBER(${F})*1)`
  // Un MAX vacío formateado como fecha da 30/12/1899: una fecha plausible y falsa, que es lo peor que
  // puede publicar esta celda. Se ataja el cero ANTES del TEXT.
  set(FILAS.corte, 0, `=LET(cor_;${corte};IF(cor_=0;"⚠ sin cheques cargados";"al "&TEXT(cor_;"dd/mm/yyyy"))`
    + `&" · "&TEXT(${vivos};"0")&" cheques vivos")`)

  // ── LOS SIETE INDICADORES ─────────────────────────────────────────────────────────────────────
  // PRÓX. 7 DÍAS y PRÓX. 30 DÍAS incluyen HOY y el último día del tramo. La inclusión del borde no es
  // un detalle: "próximos 7 días" del indicador tiene que dar exactamente `hoy + próx. 7` del resumen
  // de abajo, o la pestaña publica dos números distintos con el mismo nombre.
  const entreHoyY = (dias) => `${CON_FECHA}*(${I}>=TODAY())*(${I}<=TODAY()+${dias})`
  poner(FILAS.rotulosKpi, 0, ['DISPONIBLE', 'COMPROMETIDO', 'PROYECTADO', 'VENCIDO', 'PRÓX. 7 DÍAS', 'PRÓX. 30 DÍAS', 'MAYOR VENC. DIARIO'])
  poner(FILAS.kpi, 0, [
    // La plata disponible es de CAJA y se cita POR RANGO CON NOMBRE: un nombre sobrevive a que CAJA
    // se reescriba entera y a que le cambien el rótulo al total. Ya se rompió una vez por citarla con
    // un MATCH sobre un texto.
    '=N(CAJA_TOTAL_DISPONIBLE)',
    `=${COMPROMETIDO}`,
    // El saldo del banco NO descontó los cheques firmados: ésta es la cifra con la que se decide.
    `=${letra(0)}${FILAS.kpi}-${letra(1)}${FILAS.kpi}`,
    monto(TRAMOS.vencido),
    monto(entreHoyY(7)),
    monto(entreHoyY(30)),
    PICO_DIARIO,
  ])

  // ── EL CALENDARIO ─────────────────────────────────────────────────────────────────────────────
  set(FILAS.calendario, 0, 'CALENDARIO')
  set(FILAS.calendario, COL_SELECTOR, selector)
  poner(FILAS.diasSemana, COL_SELECTOR, ['L', 'M', 'M', 'J', 'V', 'S', 'D'])
  for (let s = 0; s < SEMANAS; s++) {
    for (let d = 0; d < DIAS; d++) {
      set(FILAS.semana0 + s, COL_SELECTOR + d, celdaDelDia(s * DIAS + d))
    }
  }

  // ── EL RESUMEN ────────────────────────────────────────────────────────────────────────────────
  poner(FILAS.resumenHdr, 0, ['', 'MONTO', 'CHEQUES'])
  const linea = (fila, rotulo, cond) => {
    set(fila, 0, rotulo)
    set(fila, 1, monto(cond))
    set(fila, 2, cantidad(cond))
  }
  linea(FILAS.vencido, 'Vencido', TRAMOS.vencido)
  linea(FILAS.hoy, 'Hoy', TRAMOS.hoy)
  linea(FILAS.siete, 'Próximos 7 días', TRAMOS.siete)
  linea(FILAS.restoMes, 'Resto del mes', TRAMOS.restoMes)
  linea(FILAS.posteriores, 'Posteriores', TRAMOS.posteriores)
  linea(FILAS.sinFecha, 'Sin fecha de pago', TRAMOS.sinFecha)
  // ═══ "PRÓXIMOS 30 DÍAS" NO ESTÁ ACÁ, Y ES UNA DECISIÓN ═══
  // Solapa con "vencido no", pero sí con hoy + 7 días + parte del resto del mes: sumarlo rompería la
  // partición, y ponerlo como memo agrega un renglón que no suma en una tabla donde todos los demás
  // suman — que es cómo se lee mal un cuadro. Vive arriba, como indicador, donde nadie espera que la
  // columna cierre.
  set(FILAS.total, 0, total('TOTAL COMPROMETIDO'))
  set(FILAS.total, 1, `=SUM(B${FILAS.vencido}:B${FILAS.sinFecha})`)
  set(FILAS.total, 2, `=SUM(C${FILAS.vencido}:C${FILAS.sinFecha})`)

  set(FILAS.registro, 0, 'REGISTRO')
  return filas
}

/**
 * La fórmula de UNA celda del calendario. `n` es el desplazamiento en días desde el lunes de la
 * primera semana mostrada (0..41).
 *
 * WEEKDAY(x;3) devuelve 0 el lunes y 6 el domingo, así que `1° del mes − WEEKDAY(1° del mes;3)` es el
 * lunes de la semana en que cae el 1°. La semana arranca lunes porque así se leen los vencimientos
 * acá: el fin de semana no se paga.
 *
 * Devuelve texto de dos renglones —día, y abajo monto y cantidad— porque una celda de calendario
 * tiene que caber en el ancho de una columna del registro, y el registro no se toca. Fuera del mes,
 * cadena vacía; sin cheques, sólo el número de día.
 *
 * Los montos van en MILLONES con un decimal: "$12,3M". Un importe entero no entra en la celda y
 * partirlo en tres renglones haría el calendario ilegible, que es peor que perder el detalle — el
 * detalle está tres filas más abajo, en el registro.
 */
export function celdaDelDia(n) {
  const dia = 'dia_'
  const cuerpo = `TEXT(DAY(${dia});"0")&IF(cnt_=0;"";CHAR(10)&TEXT(mto_/1000000;"$#,##0.0")&"M · "&TEXT(cnt_;"0"))`
  // El `N(SEL)=0` ataja el selector vacío: sin él, DATE(YEAR(0);MONTH(0);1) da diciembre de 1899 y el
  // calendario se llenaría de días de un mes que no existe. El `+` es un O lógico.
  return `=LET(ini_;DATE(YEAR(${SEL});MONTH(${SEL});1);${dia};ini_-WEEKDAY(ini_;3)+${n};`
    + `mto_;${montoDelDia(dia)};cnt_;${cantidadDelDia(dia)};`
    + `IF((N(${SEL})=0)+(MONTH(${dia})<>MONTH(${SEL}));"";${cuerpo}))`
}

/**
 * NÚCLEO PURO: qué escribir en el selector de mes, dado lo que ya hay en la celda.
 *
 * ES UNA CELDA DE ENTRADA DEL USUARIO dentro de un bloque que el generador reescribe entero. La
 * regla del repo vale igual acá: lo que el dueño eligió manda. Sólo hay dos casos en que el
 * generador pone lo suyo — la celda está vacía, o tiene la fórmula por defecto de una corrida
 * anterior (que es idéntica escribirla de nuevo).
 *
 * No alcanza con "no escribir nada": el escritor de esta pestaña manda la banda como un rectángulo
 * de `updateCells`, y una celda vacía en la grilla BORRA la celda del Sheet. Por eso el valor viejo
 * se devuelve para que se reescriba tal cual.
 *
 * @param {string} formulaPrevia lo que devuelve la lectura con render FORMULA (fórmula o texto)
 * @param {unknown} valorPrevio lo que devuelve la lectura con UNFORMATTED_VALUE (serial de fecha)
 * @returns {string|number}
 */
export function selectorAConservar(formulaPrevia, valorPrevio) {
  const f = String(formulaPrevia ?? '').trim()
  if (f.startsWith('=')) return f
  // Un mes elegido del desplegable queda como SERIAL DE FECHA. Se devuelve como número: escribirlo
  // como texto lo convertiría en una cadena y el calendario entero pasaría a decir #VALUE!.
  const n = typeof valorPrevio === 'number' ? valorPrevio : Number(String(valorPrevio ?? '').trim())
  if (Number.isFinite(n) && n > 0) return n
  return SELECTOR_DEFECTO
}

/**
 * NÚCLEO PURO: los doce meses del desplegable, como texto dd/mm/aaaa (es-AR).
 *
 * Van como FECHA y no como "agosto 2026" a propósito: el calendario necesita un mes que se pueda
 * meter en un DATE(), y hacerle parsear el nombre del mes en castellano metería una dependencia del
 * locale adentro de 42 fórmulas. La celda se ve "agosto 2026" por su formato de número.
 */
export function mesesDelSelector(hoy = new Date()) {
  const dd = (n) => String(n).padStart(2, '0')
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1)
    return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`
  })
}

/** El request que instala el desplegable del selector. `strict:false` a propósito: el dueño puede
 *  querer mirar un mes fuera de los doce y una validación que rechaza es una pestaña que pelea. */
export function validacionDelSelector(sheetId, hoy = new Date()) {
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex: FILAS.calendario - 1, endRowIndex: FILAS.calendario, startColumnIndex: COL_SELECTOR, endColumnIndex: COL_SELECTOR + 1 },
      rule: {
        condition: { type: 'ONE_OF_LIST', values: mesesDelSelector(hoy).map((v) => ({ userEnteredValue: v })) },
        showCustomUi: true,
        strict: false,
      },
    },
  }
}

/**
 * NÚCLEO PURO: cuáles de las reglas condicionales que hoy tiene la pestaña son MÍAS.
 *
 * Mía = todos sus rangos caen enteros dentro de la banda. Una regla que toca aunque sea una fila del
 * registro es del dueño y no se toca: borrar el formato condicional de otro es la versión visual de
 * borrarle los datos, y en este archivo eso ya pasó seis veces por reglas que parecían inocentes.
 * Una regla sin `endRowIndex` cubre la hoja entera → no es mía.
 *
 * @param {{ranges?: {endRowIndex?:number}[]}[]} conditionalFormats tal como los devuelve la API
 * @returns {number[]} índices 0-based, en el orden en que vienen
 */
export function indicesPropios(conditionalFormats = []) {
  const dentro = (r) => Number.isInteger(r?.endRowIndex) && r.endRowIndex <= BANDA
  return conditionalFormats.flatMap((cf, i) => {
    const rangos = cf?.ranges || []
    return rangos.length && rangos.every(dentro) ? [i] : []
  })
}

/** La expresión de la fecha de una celda del calendario, escrita con ROW()/COLUMN() para que sirva en
 *  una regla de formato condicional (que se evalúa celda por celda sobre todo el rango). */
const FECHA_DE_LA_CELDA = (() => {
  const ini = `DATE(YEAR(${SEL});MONTH(${SEL});1)`
  const n = `(ROW()-${FILAS.semana0})*${DIAS}+(COLUMN()-${COL_SELECTOR + 1})`
  return `${ini}-WEEKDAY(${ini};3)+${n}`
})()

/**
 * NÚCLEO PURO: las reglas de formato condicional del calendario.
 *
 * TRES, y ninguna más. Cada regla de color que se agrega le quita fuerza a las que ya están.
 *   · HOY            → la columna vertebral: dónde estoy parado.
 *   · VENCIDO CON PLATA → rojo tenue. Un cheque con fecha pasada y sin debitar es una pregunta abierta.
 *   · EL DÍA PICO    → negrita. Es el día que puede romper la caja aunque el mes cierre bien.
 *
 * `addConditionalFormatRule` SIEMPRE AGREGA: sin borrar antes, cada corrida del agente deja un juego
 * más de reglas encima. Pero acá NO se borran todas las de la pestaña como hace `caja-pestana.mjs`:
 * CAJA es íntegramente generada y ésta no — abajo vive el registro, que es del dueño, y una regla
 * suya sobre sus cheques no es basura del OS. Se borran sólo las que caen enteras dentro de la banda
 * (ver `indicesPropios`).
 *
 * Un `LEN(celda)>2` distingue un día con plata de un día pelado: la celda del día trae "14" y la del
 * día con cheques trae "14\n$12,3M · 3". Se prefiere al SEARCH de un glifo porque no depende del
 * texto que arme la fórmula.
 *
 * @param {number} sheetId
 * @param {number[]} indicesABorrar los que devuelve `indicesPropios`
 */
export function reglasDelCalendario(sheetId, indicesABorrar = []) {
  const rango = {
    sheetId,
    startRowIndex: FILAS.semana0 - 1,
    endRowIndex: FILAS.semana0 - 1 + SEMANAS,
    startColumnIndex: COL_SELECTOR,
    endColumnIndex: COL_SELECTOR + DIAS,
  }
  // La celda ancla del rango: en un CUSTOM_FORMULA la referencia relativa se reevalúa por celda.
  const ancla = `${letra(COL_SELECTOR)}${FILAS.semana0}`
  const regla = (formula, format) => ({
    addConditionalFormatRule: {
      index: 0,
      rule: { ranges: [rango], booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format } },
    },
  })
  // De MAYOR a MENOR índice: `deleteConditionalFormatRule` reindexa las que quedan por encima, así
  // que borrando de atrás para adelante los índices que faltan borrar siguen siendo válidos.
  const borrar = [...indicesABorrar].sort((a, b) => b - a)
    .map((i) => ({ deleteConditionalFormatRule: { sheetId, index: i } }))
  // EL ORDEN ESTÁ AL REVÉS A PROPÓSITO. Cada regla entra con `index: 0` y empuja a la anterior hacia
  // abajo, así que la ÚLTIMA de esta lista termina PRIMERA en la pestaña — y la primera que matchea
  // gana el fondo. HOY va al final justamente para ganarle al rojo de vencido: si hoy hay un cheque
  // que vence, lo que el ojo tiene que encontrar es el día de hoy.
  return [
    ...borrar,
    regla(`=AND(LEN(${ancla})>2;${FECHA_DE_LA_CELDA}<TODAY())`,
      { backgroundColor: { red: 0.99, green: 0.93, blue: 0.92 }, textFormat: { foregroundColor: { red: 0.65, green: 0.16, blue: 0.13 } } }),
    regla(`=AND(LEN(${ancla})>2;${CELDA_PICO}>0;${montoDelDia(FECHA_DE_LA_CELDA)}=${CELDA_PICO})`,
      { textFormat: { bold: true } }),
    regla(`=${FECHA_DE_LA_CELDA}=TODAY()`,
      { backgroundColor: { red: 0.94, green: 0.96, blue: 0.99 }, textFormat: { bold: true } }),
  ]
}
