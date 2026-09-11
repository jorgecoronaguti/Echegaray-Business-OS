// EL HUECO ENTRE EL SALDO QUE DECLARA EL BANCO Y EL DETALLE QUE TENEMOS CARGADO — DECLARADO EN LA
// PESTAÑA, NO SÓLO EN UN LOG.
//
// ═══ POR QUÉ EXISTE (14/08/2026) ═══
//
// CAJA muestra el saldo DECLARADO por el extracto ($15.982.032,70 al 13/08) y eso está bien: es el
// dato del banco, no un cálculo del OS. Pero los 386 movimientos cargados de `_BANCO_RAW` suman
// $15.936.952,70 — faltan **$45.080**. Ya se investigó: la cadena de saldos se corta en 47 puntos y
// ninguno solo lo explica, es anterior al primer movimiento cargado (28/05) y no hay extracto para
// cerrarlo. `auditar-saldo-banco.mjs` lo dice en cada corrida… en el log del pipeline, que nadie abre.
//
// Un hueco declarado es información: dice hasta dónde llega lo que el archivo puede reconstruir. Un
// hueco callado es una bomba — el día que alguien reconcilie el detalle contra el saldo y le falten
// $45.080 va a buscar un error de carga que no existe, o peor, va a "ajustar" algo para que cierre.
//
// ═══ POR QUÉ NO SE ARREGLA, Y POR QUÉ NO ES UN NÚMERO PEGADO ═══
//
// Arreglarlo requiere un movimiento que sólo tiene el banco. Lo que sí se puede es MEDIRLO en la
// pestaña, con la misma identidad que usa el auditor (`banco-cadena-saldos.mjs · auditarCuenta`):
//
//     saldo inicial + Σ importes = saldo declarado
//
// donde el inicial se deduce de la primera fila (su saldo después menos su propio importe). Todo sale
// de `_BANCO_RAW` con rangos abiertos, así que el día que se cargue el movimiento que falta la línea
// se apaga sola. Ni un importe escrito a mano.

import { DEP, formulaUltimoSaldo } from './caja-posterior-al-corte.mjs'

/** La columna del saldo corrido de la réplica. Las otras tres ya viven en `DEP`. */
export const COL_SALDO = 'D'

/** Un rango abierto de la réplica: `_BANCO_RAW!$C$4:$C`. */
const rango = (col, hoja = DEP.hoja, desde = DEP.desde) => `${hoja}!$${col}$${desde}:$${col}`

/**
 * NÚCLEO PURO: el saldo que el detalle cargado reconstruye — inicial + Σ importes.
 *
 * El inicial NO es un parámetro ni una constante: es `saldo después de la primera fila − su importe`.
 * Escrito como número, envejecería en cuanto se cargue un extracto que empieza antes.
 */
export function expresionDetalle({ importe = DEP.importe, saldo = COL_SALDO } = {}) {
  const C = rango(importe)
  const D = rango(saldo)
  // ═══ LO QUE EL BANCO NO ACREDITÓ NO ENTRA AL DETALLE (10/09/2026) ═══
  //
  // Un depósito de eCheq retenido 48 hs está LISTADO —tiene fecha, concepto e importe— y no está
  // disponible. Sumarlo dejaba esta línea denunciando un hueco de $38.572.526,23 que no existe: la
  // alarma más rápida de silenciar es la que grita cuando todo está bien.
  //
  // La resta sale de `expresionRetenido`, que es la MISMA definición que ahora usa CAJA para no
  // publicarlo como disponible. Escrita dos veces, el día que la marca cambie de forma una de las dos
  // seguiría sumándolo y la otra no, y el archivo tendría dos saldos del mismo banco.
  return `(INDEX(${D};1)-INDEX(${C};1))+SUM(${C})-${expresionRetenido({ importe, saldo })}`
}

/**
 * NÚCLEO PURO, Y LA ÚNICA DEFINICIÓN: cuánto de `_BANCO_RAW` es plata que el banco LISTÓ y NO ACREDITÓ.
 *
 * ═══ POR QUÉ EXISTE Y QUÉ DECIDE (11/09/2026) ═══
 *
 * Regla de oro del dueño: el Cash Flow es PERCIBIDO. Un eCheq depositado y retenido 48 hs no es plata
 * disponible hasta que el banco lo acredita — no se puede pagar un cheque con él mañana. El 11/09 CAJA
 * publicaba $79.521.755,29 de «CAJA DISPONIBLE» con **$38.572.526,23** adentro que el propio
 * `_BANCO_RAW` declaraba pendientes de acreditación, y como el cierre de los dos Cash Flow se ancla en
 * la caja de hoy, ese ancla se llevó el cierre del 31/12 de $61,3 M a $91,9 M de una corrida a la otra.
 *
 * LA MARCA EN LA PESTAÑA ES LA CELDA DE SALDO VACÍA. La escribe así `banco-raw-pestana.mjs` para las
 * filas retenidas —«un saldo que no existe va vacío, no en cero»— y `marcarAcreditacionPendiente` la
 * sostiene en la base. No hace falta una columna nueva ni un número escrito a mano: cuando el banco
 * acredita, el extracto siguiente trae el saldo corrido, `acreditarPendientes` lo copia, la celda deja
 * de estar vacía y **el saldo vuelve a incluirlo sin que nadie toque nada**.
 *
 * Las filas vacías de abajo del rango no molestan: su importe es vacío y `SUMIFS` suma 0.
 */
export function expresionRetenido({ importe = DEP.importe, saldo = COL_SALDO } = {}) {
  return `SUMIFS(${rango(importe)};${rango(saldo)};"")`
}

/**
 * LA MISMA REGLA, DEL LADO DE JAVASCRIPT: ¿esta fila de `_BANCO_RAW` es plata listada y no acreditada?
 *
 * ═══ POR QUÉ VIVE ACÁ Y NO EN EL EXTRACTOR QUE LA USA (11/09/2026) ═══
 *
 * Son dos caras de UNA definición —la celda de saldo vacía— y tienen que estar pegadas: la fórmula de
 * arriba es la que CAJA usa para no publicar esa plata como disponible, y este predicado es el que el
 * Libro usa para emitirla como ingreso proyectado a la fecha en que el banco la acredita. El día que
 * la marca cambie de forma (una columna nueva, un rótulo) hay que cambiar las dos, y una al lado de la
 * otra eso es imposible de olvidar. Escritas en archivos distintos, CAJA restaría y el Libro no
 * emitiría: $38.572.526,23 que desaparecen del cierre proyectado, que es el defecto del 11/09 a las 12:50.
 *
 * EL SALDO VACÍO ES LA MARCA, Y EL CERO NO. `banco-raw-pestana.mjs` escribe vacío a propósito para las
 * filas retenidas —«un saldo que no existe va vacío, no en cero»— y un 0 sería un saldo real de cero.
 *
 * @param {{importe:unknown, saldo:unknown}} fila los dos valores de la réplica, sin formatear
 * @returns {boolean}
 */
export function esRetenida({ importe, saldo } = {}) {
  const vacio = saldo === '' || saldo === null || saldo === undefined
  return vacio && typeof importe === 'number' && Number.isFinite(importe) && importe !== 0
}

/**
 * NÚCLEO PURO: el saldo del banco que CAJA puede gastar — el DECLARADO menos lo retenido.
 *
 * `formulaUltimoSaldo` devuelve el último saldo corrido de la réplica, que es el que el banco declara
 * (`banco-raw-pestana` lo pisa sobre la última fila cuando la cadena del día no cierra). Ese número
 * INCLUYE los depósitos retenidos —medido: declarado $41.561.209,16, retenido $38.572.526,23,
 * disponible real $2.988.682,93— así que la resta no es una precaución: es la diferencia entre lo que
 * se puede pagar y lo que no.
 *
 * @returns {string} fórmula con `=`, separador es-AR
 */
export function formulaSaldoDisponibleBanco({ hoja = DEP.hoja, saldo = COL_SALDO, desde = DEP.desde, importe = DEP.importe } = {}) {
  const declarado = formulaUltimoSaldo(hoja, saldo, desde).slice(1)
  return `=${declarado}-${expresionRetenido({ importe, saldo })}`
}

/**
 * NÚCLEO PURO: cuánto falta para que el detalle llegue al saldo declarado. Positivo = faltan ingresos
 * cargados (o sobra un egreso); negativo = al revés.
 */
export function expresionDiferencia(opts = {}) {
  // ═══ LOS DOS LADOS TIENEN QUE EXCLUIR LO RETENIDO, O EL CONTROL MIDE PERAS CONTRA MANZANAS ═══
  //
  // Medido el 11/09/2026: el detalle ya restaba lo retenido (arriba) y el declarado NO, así que esta
  // línea publicaba **$38.572.526,23** de hueco y lo rotulaba «el faltante es anterior al 28/5/2026,
  // y no hay extracto para cerrarlo» — una causa falsa para una plata que estaba perfectamente
  // identificada dos filas más arriba. Ese número fue el que el dueño vio y no pudo explicar.
  //
  // `formulaSaldoDisponibleBanco` es la MISMA expresión que ahora consume CAJA: si un día cambia la
  // forma de tomar «el último» o la marca de retención, este control cambia con ella en vez de quedar
  // midiendo contra otra cosa. Con los dos lados netos, el hueco que queda es el hueco de verdad.
  const disponible = formulaSaldoDisponibleBanco({ saldo: opts.saldo ?? COL_SALDO, importe: opts.importe ?? DEP.importe }).slice(1)
  return `${disponible}-(${expresionDetalle(opts)})`
}

/**
 * La fila del anexo que DECLARA el hueco. Devuelve `[rótulo, moneda, importe, '', '', fecha, origen]`
 * — el mismo ancho de las demás filas del bloque A1.
 *
 * EL RÓTULO ES UNA FÓRMULA y no un texto fijo: cuando el hueco se cierre, la línea tiene que decir
 * que cerró. Un aviso que sigue puesto después de resuelto es la forma más rápida de que se deje de
 * leer el resto de la pestaña.
 *
 * @param {number} [tolerancia] pesos por debajo de los cuales el hueco es redondeo, no un faltante.
 */
export function filaHuecoDelExtracto(tolerancia = 1) {
  const dif = expresionDiferencia()
  const C = rango(DEP.importe)
  const A = rango(DEP.fecha)
  const rotulo = `=IF(COUNT(${C})=0;"⚠ Sin extracto cargado: no puedo verificar el saldo del banco";`
    + `IF(ABS(ROUND(${dif};2))<${tolerancia};"✓ El detalle del extracto cierra contra el saldo declarado por el banco";`
    + `"⚠ El detalle del extracto NO cierra contra el saldo que declara el banco — el faltante es anterior al "`
    + `&TEXT(MIN(${A});"d/m/yyyy")&", y no hay extracto para cerrarlo"))`
  return [
    rotulo, 'ARS', `=IF(COUNT(${C})=0;"";ROUND(${dif};2))`, '', '',
    `=IF(COUNT(${A})=0;"";MIN(${A}))`,
    'Saldo declarado por el banco − (saldo inicial + suma de los movimientos de _BANCO_RAW, sin los depósitos que el banco todavía no acreditó: los que van con la celda de saldo vacía). '
    + 'NO se resta de ninguna disponibilidad: CAJA muestra el saldo del banco, que es el dato real. '
    + 'Mide hasta dónde llega el detalle que el archivo puede reconstruir. Detalle por movimiento: auditar-saldo-banco.mjs.',
  ]
}

/**
 * La fila del anexo que dice CUÁNTO retuvo el banco. Mismo ancho que las demás del bloque A1.
 *
 * ═══ POR QUÉ SE PUBLICA, SI YA SE RESTA (11/09/2026) ═══
 *
 * Porque una plata que desaparece de CAJA sin que nadie diga cuánta es indistinguible de un error. El
 * 11/09 pasó al revés —$38.572.526,23 sumados sin decir que estaban retenidos— y el dueño vio el
 * cierre del año saltar $30 M sin una línea que lo explicara. Se resta Y se dice, con el número.
 *
 * EL RÓTULO ES UNA FÓRMULA: cuando el banco acredita, el extracto siguiente trae el saldo corrido,
 * `acreditarPendientes` lo copia, la celda de saldo deja de estar vacía y esta línea se apaga sola —
 * sin que nadie toque nada. Un aviso que sigue puesto después de resuelto enseña a no leer la pestaña.
 */
export function filaRetenidoPorElBanco(tolerancia = 1) {
  const ret = expresionRetenido()
  const D = rango(COL_SALDO)
  const rotulo = `=IF(ROUND(${ret};2)<${tolerancia};"✓ El banco no tiene depósitos sin acreditar";`
    + `"⏳ Retenido por el banco — depósitos listados y todavía NO acreditados: FUERA de CAJA hasta que los acredite")`
  return [
    rotulo, 'ARS', `=IF(ROUND(${ret};2)<${tolerancia};"";ROUND(${ret};2))`, '', '',
    // La fecha del depósito retenido más NUEVO: es la que dice desde cuándo se está esperando.
    `=IF(ROUND(${ret};2)<${tolerancia};"";MAXIFS(${rango(DEP.fecha)};${D};""))`,
    'Suma de los movimientos de _BANCO_RAW con la celda "Saldo después" VACÍA — la marca con la que el '
    + 'banco los lista sin acreditar. SE RESTA del saldo de «Santander · cta cte ARS» de CAJA: un eCheq '
    + 'retenido 48 hs no paga un cheque mañana (Cash Flow percibido). Vuelve solo cuando el extracto '
    + 'siguiente trae su saldo corrido.',
  ]
}
