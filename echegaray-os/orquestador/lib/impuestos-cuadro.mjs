// LAS FÓRMULAS DE "IMPUESTOS Y FINANCIEROS" — cada concepto con SU driver, ninguna con promedio.
//
// POR QUÉ EXISTE (06/08). El generador de la pestaña tenía 1.253 líneas y adentro, mezcladas con la
// orquestación, las fórmulas que deciden plata. Tres de ellas estaban mal y no se veía:
//
//   · el prendario "proyectaba" repitiendo `SUMIF(_BANCO_RAW; "Préstamo prendario")` sin variar por
//     mes. Esa suma barre TODO el extracto, y el extracto ya cubre dos débitos: declaraba
//     $2.567.315,91 de cuota donde la cuota es $1.282.810,54, cinco veces, o sea $6,4M de más;
//   · la "deuda pendiente" sumaba las doce cuotas del año —siete YA PAGADAS— y las declaraba
//     pendientes: $31,9M contra $14,4M reales, $17,5M de sobredeclaración en el número con el que se
//     decide si hay que salir a cubrir un bache;
//   · el IIBB no proyectaba NADA: seis meses en blanco en un impuesto cuyo driver (base × alícuota)
//     ya estaba medido y replicado en el archivo.
//
// Todo lo de acá es PURO y devuelve texto de fórmula en locale es-AR (separador `;`). Nada lee el
// Sheet, nada escribe: se prueba con un assert de string y el defecto se ve sin abrir el archivo.

import { rango } from './compras-columnas.mjs'
import { terminoLibro } from './libro-sumas.mjs'
import { ALICUOTA as ALICUOTA_25413 } from './impuesto-cheque.mjs'
import { RANGO_ALICUOTA_IVA } from './iva-libre-disponibilidad.mjs'
import { ALERTA } from './glifos.mjs'

/** El rubro de Compras donde vive el cuadro de amortización del prendario. Contrato con Compras. */
export const RUBRO_PRENDARIO = 'Financiero'

/** La ventana del mes m como par de expresiones de fecha del Sheet. */
export const ventana = (anio, m) => ({
  desde: `DATE(${anio};${m};1)`,
  hasta: `EOMONTH(DATE(${anio};${m};1);0)`,
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// PRENDARIO — POR SU CUADRO DE AMORTIZACIÓN, NUNCA POR EL EXTRACTO
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Compras tiene las doce cuotas del préstamo del Ford XLS (cuota 15 a la 26), una por mes, cada una
// con su "Fecha prevista de pago" el día 7 y su importe. Es el cuadro de amortización del banco,
// cargado. El extracto sólo prueba las que YA se debitaron — sirve para conciliar, no para proyectar.
//
// LA DIFERENCIA NO ES DE MÉTODO, ES DE PLATA: la cuota que ARRASTRA el extracto crece cada vez que
// llega un mes nuevo de banco, porque suma un débito más. Es una fórmula cuyo resultado depende de
// cuánto extracto se haya importado. Eso no es un importe: es un accidente.

/** NÚCLEO PURO: la cuota del prendario del mes m, del cuadro de amortización de Compras. */
export function formulaCuotaPrendario(C, anio, m) {
  const v = ventana(anio, m)
  return `=SUMIFS(${rango(C.total)};${rango(C.rubro)};"${RUBRO_PRENDARIO}";`
    + `${rango(C.fechaPrev)};">="&${v.desde};${rango(C.fechaPrev)};"<="&${v.hasta})`
}

/**
 * EL CORTE DE "PENDIENTE" ES HOY, Y LO EVALÚA LA PLANILLA — NO LA CORRIDA (06/08).
 *
 * Estas dos celdas llevaban el serial del día de la corrida TIPEADO (`">"&46240`). Mientras la
 * pestaña se regenere a diario da lo mismo; el día que el timer no corre, "cuotas que todavía no
 * vencieron" empieza a contar cuotas ya debitadas, y esas dos celdas son las que el hero publica como
 * DEUDA PENDIENTE — el número con el que se decide si hay que salir a cubrir un bache. Un cuadro que
 * envejece mal en el número que decide es peor que uno que se ve viejo.
 *
 * LA ASIMETRÍA CON EL CALENDARIO ES DELIBERADA Y SE DECLARA: el calendario de arriba (qué vence,
 * cuándo, qué está vencido, las ventanas 30/60/90) se arma en JavaScript con la fecha de la corrida,
 * porque ordenar y elegir vencimientos no es expresable en una celda sin rehacer el cuadro entero en
 * fórmula. Así que si la pestaña se queda vieja, la deuda pendiente sigue exacta y el calendario se
 * ve viejo — con sus fechas pasadas marcadas "⚠ VENCIDO", que es visible. La alternativa (todo
 * anclado al día de la corrida) esconde el envejecimiento justo en el número que decide.
 *
 * TODAY() y no HOY(): la API de Sheets recibe SIEMPRE los nombres de función en inglés y los muestra
 * traducidos según el locale. Lo que sí va en es-AR es el separador de argumentos (`;`).
 */
export const CORTE_VIVO = 'TODAY()'

/**
 * NÚCLEO PURO: lo que FALTA pagar del prendario. Sólo cuotas con vencimiento POSTERIOR a hoy.
 *
 * "Pendiente" quiere decir pendiente. La versión anterior sumaba el rubro entero —las doce cuotas,
 * las pagadas incluidas— y el hero lo publicaba como deuda. Un saldo que sólo crece no es un saldo.
 */
export function formulaPrendarioPendiente(C) {
  return `=SUMIFS(${rango(C.total)};${rango(C.rubro)};"${RUBRO_PRENDARIO}";${rango(C.fechaPrev)};">"&${CORTE_VIVO})`
}

/**
 * NÚCLEO PURO: lo que FALTA pagar de los planes F931. Mismo criterio que el prendario.
 * @param {Array<{patron:string, campo:'concepto'|'detalle'}>} planes
 */
export function formulaPlanesPendiente(C, planes = []) {
  const conPatron = planes.filter((p) => p.patron)
  if (!conPatron.length) return '=0'
  const term = (p) => `SUMIFS(${rango(C.total)};${rango(p.campo === 'concepto' ? C.concepto : C.detalle)};"*${p.patron}*";`
    + `${rango(C.fechaPrev)};">"&${CORTE_VIVO})`
  return `=${conPatron.map(term).join('+')}`
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// IIBB PROYECTADO — BASE × ALÍCUOTA, EL DRIVER REAL
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// EL CRITERIO, DECLARADO. La base imponible que la empresa DECLARA ante Rentas es devengada
// (facturación del mes). El Libro no tiene facturación: tiene COBRANZAS. Así que la proyección usa
// las cobranzas del mes —cobradas y esperadas— netas de IVA, y eso es un criterio DISTINTO del de la
// DDJJ, no el mismo número calculado de otra forma.
//
// Se elige igual, y por dos motivos: es el único driver medido que existe hacia adelante, y es el
// MISMO que ya usa el débito fiscal de IVA dos bloques más arriba — así los dos impuestos proyectados
// se mueven juntos cuando el dueño mueve una cobranza, en vez de contarse cada uno por su lado.
//
// La alícuota NO se tipea: sale de `_IIBB_RAW`, que es la réplica de la última DDJJ presentada. Si
// Rentas la cambia, la DDJJ nueva la trae y todo el bloque se recalcula solo.

/** El rango ABIERTO de una columna de la réplica de IIBB. Cerrarlo en la fila 40 ya dejaba afuera la DDJJ N° 37. */
export const rangoIibb = (hoja, fila0, col) => `${hoja}!$${col}$${fila0}:$${col}`

/**
 * NÚCLEO PURO: la alícuota declarada del último período con DDJJ, referenciada — no pegada.
 * El período lo pasa el generador (ya parseó los PDF): un MATCH explícito es determinístico, y
 * "la última fila" sería anclar en la posición, que es como se rompen estas cosas en silencio.
 */
export function formulaAlicuotaIibbVigente(hoja, fila0, col, periodo) {
  if (!periodo) return '=0'
  return `=INDEX(${rangoIibb(hoja, fila0, col.alicuota)};MATCH("${periodo}";${rangoIibb(hoja, fila0, col.periodo)};0))`
}

/**
 * NÚCLEO PURO: la base imponible proyectada del mes = cobranzas del Libro, netas de IVA.
 * @param {string} celdaAlicuotaIva la celda (o rango con nombre) de la alícuota de IVA
 */
export function formulaBaseIibbProyectada(anio, m, celdaAlicuotaIva = RANGO_ALICUOTA_IVA) {
  const bruto = terminoLibro({
    desde: `DATE(${anio};${m};1)`, hasta: `EOMONTH(DATE(${anio};${m};1);0)+1`,
    signo: 1, rubros: ['Cobranzas'], medida: 'magnitud',
  })
  return `=(${bruto})/(1+${celdaAlicuotaIva})`
}

/**
 * NÚCLEO PURO: el impuesto determinado de un mes proyectado = base × alícuota.
 * NO es un promedio de los meses anteriores: es el driver, aplicado al mes que se proyecta.
 */
export const formulaIibbDeterminado = (celdaBase, celdaAlicuota) => `=${celdaBase}*${celdaAlicuota}`

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LEY 25.413 — DENTRO DEL MODELO, DERIVADO DEL MOVIMIENTO BANCARIO PROYECTADO
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// LO QUE SE DESENCHUFA (06/08). `lib/impuesto-cheque.mjs` existe, está verificado contra el extracto
// (99,1% del cargo real de 18 días) y esta pestaña no lo usaba: proyectaba con un `AVERAGEIF` de los
// meses con extracto, en una fila que estaba DEBAJO del total —o sea fuera de la suma—, que excluía
// agosto y cuyo total coincidía al centavo con el de la fila real. Un bloque muerto que además
// parecía un duplicado.
//
// Ahora el impuesto sale de su driver: el 0,6% de CADA lado de cada movimiento de la cuenta. El
// movimiento proyectado del mes es lo que el Libro ya tiene cargado y comprometido, entra más sale.
// Y la fila vive DENTRO del total, que es donde tiene que estar un impuesto que se paga.

/** NÚCLEO PURO: el impuesto de la Ley 25.413 de un mes, sobre el movimiento proyectado del Libro. */
export function formulaImpuestoChequeProyectado(anio, m) {
  const v = { desde: `DATE(${anio};${m};1)`, hasta: `EOMONTH(DATE(${anio};${m};1);0)+1` }
  const movimiento = terminoLibro({ ...v, medida: 'magnitud' })
  return `=(${movimiento})*${ALICUOTA_25413}*2`
}

/** NÚCLEO PURO: lo que el banco YA debitó por Ley 25.413 en el mes, del extracto. */
export function formulaImpuestoChequeReal(hoja, anio, m) {
  return `=SUMPRODUCT((YEAR(${hoja}!$A$4:$A)=${anio})*(MONTH(${hoja}!$A$4:$A)=${m})`
    + `*ISNUMBER(SEARCH("Impuesto al cheque";${hoja}!$F$4:$F))*-IF(ISNUMBER(${hoja}!$C$4:$C);${hoja}!$C$4:$C;0))`
}

/**
 * NÚCLEO PURO: el impuesto del mes = lo REAL si el extracto llega hasta ahí, y si no lo PROYECTADO.
 *
 * MAX y no una elección por mes: lo que el banco ya cobró es un hecho y no puede quedar afuera; la
 * proyección manda donde todavía no hay extracto. Es el mismo criterio que `formulaInteresMes` del
 * descubierto, y por la misma razón — una línea de costo nunca subestima.
 */
export const formulaImpuestoCheque = (hoja, anio, m) =>
  `=MAX(${formulaImpuestoChequeReal(hoja, anio, m).slice(1)};${formulaImpuestoChequeProyectado(anio, m).slice(1)})`

// ═══ EL CUADRO DE FINANCIAMIENTO SE FUE, Y CON ÉL `filasFinanciamiento` (04/09/2026) ═══
//
// El dueño, mirando la pestaña renderizada: *"no me sirven del cuadro 1 al 3"*. El 3 era el
// financiamiento. La función que armaba sus cuatro líneas no la llama nadie más, así que se borra en
// vez de quedar como capa fósil de un cuadro retirado — que es cómo un generador termina teniendo
// código que nadie ejecuta y que la próxima lectura confunde con algo vigente.
//
// LO QUE NO SE PERDIÓ: el acuerdo en descubierto y el límite de la tarjeta viven en
// `banco-santander.mjs` y los consume CAJA, que además mide cuánto del descubierto está TOMADO hoy —
// cosa que esta pestaña nunca supo hacer y declaraba en el rótulo. El costo del descubierto verificado
// (×1,12) vive en `costo-descubierto.mjs`, con su test, y se sigue consumiendo desde CAJA.

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ¿CUÁNDO EL IVA EMPIEZA A SALIR DE LA CAJA? — LA PREGUNTA QUE LA PESTAÑA EXISTÍA PARA CONTESTAR
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// En 2026 el IVA NUNCA salió en efectivo: marzo y julio quedaron a favor de ARCA por $10,75M y
// $9,52M y los absorbió el saldo de libre disponibilidad. Pero ese colchón cae —$19,3M en junio,
// $9,86M al cierre de julio, $4,0M en agosto— y el día que se agote, el IVA pide caja como
// cualquier otro pago. Hasta hoy había que deducirlo leyendo la fila del saldo mes por mes.
//
// SE RESUELVE CON UNA FÓRMULA Y NO EN LA CORRIDA, a propósito: la fila del "IVA a pagar en efectivo"
// tiene meses que escribe una persona y meses que calcula la planilla, así que el primer mes que
// pide caja se mueve cuando el dueño edita una celda. Un mes calculado en JavaScript quedaría viejo
// hasta la corrida siguiente, justo en la línea que decide si hay que salir a buscar plata.
//
// EL RANGO ARRANCA EN B Y TERMINA EN M: los doce meses, sin la columna del Total —que suma la fila
// entera y daría "positivo" aunque ningún mes suelto lo sea.

/**
 * El texto de la celda cuando ningún mes del año pide caja. Es un hecho —el crédito de libre
 * disponibilidad lo absorbió todo—, no un hueco: no lleva ⚠.
 *
 * CORTO A PROPÓSITO (04/09/2026): va en la columna del mes, que mide 108 px ≈ 18 caracteres, y con
 * la de al lado ocupada no hay adónde derramar. "ninguno en el año" se dibujaba cortado en "ninguno
 * en el" — y un rótulo cortado al medio dice otra cosa que el rótulo entero. El renglón se lee
 * completo: «EL IVA EMPIEZA A SALIR DE LA CAJA EN … ningún mes».
 */
export const IVA_SIN_SALIDA = 'ningún mes'

/**
 * NÚCLEO PURO: la posición (1..12) del primer mes con un importe POSITIVO en la fila `f`.
 *
 * `IF(ISNUMBER(...))` no es decorativo: esa fila puede tener texto —el mes que escribió una persona,
 * una leyenda— y en Sheets cualquier texto es MAYOR que cualquier número, así que sin el filtro una
 * leyenda se leería como "acá el IVA pide caja" y publicaría el mes equivocado.
 */
const primerMesPositivo = (f) => `MATCH(TRUE;INDEX(IF(ISNUMBER($B$${f}:$M$${f});$B$${f}:$M$${f};0)>0;0);0)`

/** NÚCLEO PURO: el MES en que el IVA empieza a salir de la caja, leído del encabezado del cuadro. */
export const formulaMesQueElIvaPideCaja = (fAPagar, fCabecera) =>
  `=IFERROR(INDEX($B$${fCabecera}:$M$${fCabecera};${primerMesPositivo(fAPagar)});"${IVA_SIN_SALIDA}")`

/** NÚCLEO PURO: CUÁNTO pide ese primer mes. Cero si ninguno pide: es la verdad, no un hueco. */
export const formulaIvaQuePideCaja = (fAPagar) =>
  `=IFERROR(INDEX($B$${fAPagar}:$M$${fAPagar};${primerMesPositivo(fAPagar)});0)`

/**
 * NÚCLEO PURO: el colchón de libre disponibilidad que queda al cierre del mes ANTERIOR — el que se
 * agota. Si ningún mes pide caja, el colchón vigente es el último que la fila publica: `LOOKUP(9^99)`
 * devuelve el último valor numérico de la fila, que es lo que un saldo acumulado significa.
 */
export const formulaColchonQueSeAgota = (fAPagar, fLibre) =>
  `=IFERROR(INDEX($B$${fLibre}:$M$${fLibre};MAX(1;${primerMesPositivo(fAPagar)}-1));LOOKUP(9^99;$B$${fLibre}:$M$${fLibre}))`

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL HERO Y LA VENTANA — REFERENCIAS, NUNCA RECÁLCULOS
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO: la suma de las celdas del calendario que caen dentro de una ventana de días.
 *
 * SUMA CELDAS NOMBRADAS UNA POR UNA, no un rango. El calendario está ordenado por fecha, así que un
 * `SUM(B16:B21)` andaría hoy y mentiría el día que se agregue una obligación en el medio. Y si no cae
 * ninguna en la ventana devuelve 0 explícito, no una celda vacía que después alguien suma de buena fe.
 *
 * @param {Array<{dias:number, vencido:boolean, celdaImporte:string}>} filas
 */
export function formulaVentana(filas = [], dias) {
  const dentro = filas.filter((f) => !f.vencido && f.dias <= dias && f.celdaImporte)
  return dentro.length ? `=${dentro.map((f) => f.celdaImporte).join('+')}` : '=0'
}

/**
 * NÚCLEO PURO: la deuda fiscal-financiera PENDIENTE. Sólo futuro, y se dice.
 * El hero REFERENCIA estas dos celdas: no vuelve a sumar Compras por su cuenta. Dos sumas del mismo
 * concepto en la misma pestaña es cómo se llega a dos verdades.
 */
export const formulaDeudaPendiente = (celdaPrendario, celdaPlanes) => `=${celdaPrendario}+${celdaPlanes}`

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS SALDOS A FAVOR — UNA SUMA QUE NO SE ROMPE, Y QUE TAMPOCO MIENTE (17/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// EL DEFECTO QUE VIO EL DUEÑO. La fila "⇒ IMPUESTOS A FAVOR" era `=$H$57+$G$67` y publicaba
// `#VALUE!` en la primera pantalla de la pestaña, porque H57 —el saldo de libre disponibilidad de
// julio— tiene la leyenda "⚠ vence 20/08" que alguien tipeó ahí.
//
// LA CAUSA DE FONDO SE ARREGLA EN OTRO LADO (`esNumero`, en iva-libre-disponibilidad.mjs: el ancla
// ya no se para en una leyenda, así que el hero vuelve a apuntar a junio). Esto es la SEGUNDA
// defensa: la celda de destino la escribe una persona y puede volver a tener texto mañana.
//
// POR QUÉ NO UN IFERROR. Dejaría $0 donde hay $20,2M a favor. Un cero se lee como "no tengo nada a
// favor" y nadie va a verificarlo — es peor que el #VALUE!, que al menos grita. La regla del repo es
// que un hueco se vea como un hueco: la celda dice qué término falta y en qué impuesto ir a mirar.
//
// Locale es_AR: separador `;`.

/** El texto del hueco, nombrando cuál de los dos términos no es un importe. */
const faltante = (celdaIva, celdaIibb) =>
  `"${ALERTA} falta el saldo de "&IF(ISNUMBER(${celdaIva});"";"IVA ")&IF(ISNUMBER(${celdaIibb});"";"IIBB ")`
  + '&"— hay texto donde va un importe"'

/**
 * NÚCLEO PURO: los dos saldos a favor sumados, o el hueco declarado. `COUNT` cuenta números y sólo
 * números: si cualquiera de los dos términos es texto, la suma no se hace y no hay #VALUE!.
 *
 * NO SE PUBLICA UNA SUMA PARCIAL. Mostrar el término que sí está, bajo el rótulo del total, sería un
 * total falso con aspecto de total. El sub-ítem de abajo ya muestra el que sobrevive.
 */
export const formulaSaldoAFavor = (celdaIva, celdaIibb) =>
  `=IF(COUNT(${celdaIva};${celdaIibb})=2;${celdaIva}+${celdaIibb};${faltante(celdaIva, celdaIibb)})`

/**
 * NÚCLEO PURO: un saldo suelto del hero. Si la celda tiene un importe, manda el importe; si tiene
 * texto, se muestra ESE texto precedido del glifo —el dueño tiene que poder leer qué hay puesto ahí
 * para ir a corregirlo— y si está vacía se declara el hueco en vez de dibujar un $0.
 */
export const formulaSaldoDeclarado = (celda) =>
  `=IF(ISNUMBER(${celda});${celda};IF(${celda}="";"${ALERTA} sin dato";"${ALERTA} "&${celda}))`

/**
 * NÚCLEO PURO: el próximo vencimiento, como las tres piezas que se muestran.
 * @returns {{fecha:string, concepto:string, formulaImporte:string}|null}
 */
export function proximoVencimiento(filas = []) {
  const f = filas.find((x) => !x.vencido)
  if (!f) return null
  return { fecha: f.fecha, concepto: f.concepto, formulaImporte: f.celdaImporte ? `=${f.celdaImporte}` : '=0' }
}
