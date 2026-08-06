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
import { TASAS } from './costo-descubierto.mjs'
import { RANGO_ALICUOTA_IVA } from './iva-libre-disponibilidad.mjs'

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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// POSICIÓN DE FINANCIAMIENTO — LAS CUATRO FUENTES
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// La pestaña se llama "Impuestos y Financieros" y mostraba DOS de las cuatro fuentes de
// financiamiento de la empresa: el prendario y los planes. El acuerdo en descubierto ($18,2M de
// línea, 62,78% de costo financiero total) vivía sólo en una fila del Cash Flow, y la tarjeta ($10M
// de cupo) sólo en su propia pestaña. Las dos que faltaban son justamente las DISPONIBLES: la
// pregunta "con qué cuento si mañana no entra la cobranza" no se podía contestar acá.

/**
 * NÚCLEO PURO: el costo de un peso de descubierto por día, con impuestos. Es el número con el que se
 * compara cualquier alternativa de financiamiento.
 */
export const costoDescubiertoDiario = () =>
  (TASAS.tna / TASAS.base) * (1 + TASAS.iva + TASAS.percepcion)

/**
 * NÚCLEO PURO: las filas de la posición de financiamiento.
 * @param {{acuerdo:object, tarjeta:object, celdaPrendario:string, celdaPlanes:string}} f
 * @returns {Array<{rotulo, limite, usado, disponible, origen}>} `usado` y `disponible` son fórmulas
 *   o números; el prendario y los planes no tienen "límite" porque ya están tomados enteros.
 */
export function filasFinanciamiento({ acuerdo, tarjeta, celdaPrendario, celdaPlanes, celdaUsoDescubierto }) {
  const ar = (n, d = 2) => n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })
  // DOS NÚMEROS, NO UNO: el interés puro y el que sale de la cuenta. Publicar uno solo es cómo
  // aparece una tercera versión del mismo peso — el interés solo subestima el costo un 12%.
  const interesMillon = (TASAS.tna / TASAS.base) * 1e6
  const costoMillon = costoDescubiertoDiario() * 1e6
  return [
    {
      // ⚠ EN EL RÓTULO: esta pestaña no mide cuánto del acuerdo está tomado hoy. Sin la marca, el
      // "disponible" se lee como plata que está y puede no estar — y es la línea con la que se
      // decide no salir a pedir un adelanto.
      rotulo: `Descubierto Santander ${acuerdo.numero} ⚠ uso: lo mide CAJA`,
      limite: acuerdo.importe,
      usado: celdaUsoDescubierto ? `=MIN(${acuerdo.importe};MAX(0;-${celdaUsoDescubierto}))` : '',
      disponible: null, // lo calcula el generador como límite − usado, en la propia grilla
      origen: `Vence ${acuerdo.vence} · TNA ${ar(acuerdo.tna * 100, 0)}% · costo financiero total ${ar(acuerdo.cft * 100)}%`
        + ` · cada millón en rojo cuesta $${ar(interesMillon)} de interés por día, $${ar(costoMillon)} con IVA y percepción`
        + ' (× 1,12, verificado al centavo contra el cargo del banco del 14/07).',
    },
    {
      // ═══ EL DISPONIBLE SALE POR FÓRMULA, COMO EL DE ARRIBA (06/08) ═══
      //
      // D46 estaba PEGADO en 8.693.073,70 mientras B46 − C46 daba 8.693.074,00: treinta centavos de
      // diferencia entre la celda y su propia fila, en la única línea del cuadro que no calculaba. El
      // origen no era el pegado sino el REDONDEO del tomado —`Math.round`— que rompía la identidad
      // límite − tomado = disponible y obligaba a pegar el disponible para no perderlo.
      //
      // El dato primario sigue siendo el DISPONIBLE que declara el banco: el tomado se despeja de él,
      // ahora al centavo, y el disponible vuelve a salir de la resta como en las otras tres filas.
      rotulo: `Tarjeta de crédito · ${tarjeta.cuenta}`,
      limite: tarjeta.limite,
      usado: Math.round((tarjeta.limite - tarjeta.disponible) * 100) / 100,
      disponible: null, // = límite − tomado, en la propia grilla
      origen: `Resumen del banco al ${tarjeta.al} · cierra ${tarjeta.cierra}, vence ${tarjeta.vence}.`
        + ' El dato del banco es el DISPONIBLE; el "tomado" se despeja de él (límite − disponible) y NO es'
        + ' el consumido que lista el resumen: difieren $60.433 y no se inventa el motivo.'
        + ' FOTO CAPTURADA A MANO: no hay puerta de carga para el resumen de la tarjeta.',
    },
    {
      rotulo: 'Prendario Ford XLS · Santander (ya tomado)',
      limite: null,
      usado: `=${celdaPrendario}`,
      disponible: 0,
      origen: 'Compras, rubro "Financiero" · sólo las cuotas con vencimiento posterior al corte. Ya está tomado entero: no queda línea disponible.',
    },
    {
      rotulo: 'Planes de pago F931 · ARCA (ya tomados)',
      limite: null,
      usado: `=${celdaPlanes}`,
      disponible: 0,
      origen: 'Compras, rubro "Deuda previsional (planes de pago)" · sólo las cuotas con vencimiento posterior al corte.',
    },
  ]
}

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

/** NÚCLEO PURO: lo VENCIDO e impago — la primera mitad del riesgo. */
export function formulaVencidoImpago(filas = []) {
  const v = filas.filter((f) => f.vencido && f.celdaImporte)
  return v.length ? `=${v.map((f) => f.celdaImporte).join('+')}` : '=0'
}

/**
 * NÚCLEO PURO: la deuda fiscal-financiera PENDIENTE. Sólo futuro, y se dice.
 * El hero REFERENCIA estas dos celdas: no vuelve a sumar Compras por su cuenta. Dos sumas del mismo
 * concepto en la misma pestaña es cómo se llega a dos verdades.
 */
export const formulaDeudaPendiente = (celdaPrendario, celdaPlanes) => `=${celdaPrendario}+${celdaPlanes}`

/**
 * NÚCLEO PURO: el próximo vencimiento, como las tres piezas que se muestran.
 * @returns {{fecha:string, concepto:string, formulaImporte:string}|null}
 */
export function proximoVencimiento(filas = []) {
  const f = filas.find((x) => !x.vencido)
  if (!f) return null
  return { fecha: f.fecha, concepto: f.concepto, formulaImporte: f.celdaImporte ? `=${f.celdaImporte}` : '=0' }
}
