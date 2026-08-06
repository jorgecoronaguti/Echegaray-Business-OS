// LOS RETIROS MENSUALES DE DIRECCIÓN — LA MITAD DE LA NÓMINA QUE NO ESTABA EN NINGUNA PLANILLA.
//
// ═══ POR QUÉ EXISTE (01/08) ═══
//
// El dueño: *"el concepto jornales de obra en cash flow semanal y mensual no refleja los valores
// correctos que se le ha abonado a obreros y oficina, revisar todo"*. Medido, la mitad de obra
// estaba bien —la línea "Jornales de obra" da $34.252.600 en julio y la planilla, sumando por fecha
// de pago real, da $34.252.600, al peso y en los seis meses— y la de administración no.
//
// La causa quedó a la vista al abrir Compras fila por fila. Las cinco filas de agosto (concepto
// "Julio", todas 🟢 Vigente, fecha de caja 10/08) dicen a quién:
//
//     Emiliano Maldonado   $1.700.000  ┐ están en la planilla JORNALES, pestaña "Oficina 26"
//     Juan Pablo Nievas    $1.600.000  ┘
//     Jorge Corona         $3.000.000  ┐
//     Jorge Echegaray      $1.500.000  ├ NO están en ninguna planilla: sólo existían en Compras
//     Rodrigo Echegaray    $2.000.000  ┘
//                          $9.800.000
//
// Por eso los dos números del mismo sueldo no coincidían y ninguno era "el correcto": la planilla
// tenía DOS personas y Compras tenía CINCO. No era un error de fórmula, era media nómina sin fuente.
// El dueño lo confirmó y decidió dónde va: *"agregalos a jornales por quincena, como pagos mensuales
// a jorge echegaray, rodrigo echegaray y jorge corona, de ahí tiene que salir"*.
//
// ═══ EL DEFECTO QUE ESTO ARREGLA NO ES DE PRESENTACIÓN: SON $26.000.000 ═══
//
// Los retiros están cargados en Compras UNA sola vez —el mes de julio, a pagar el 10/08—. De
// septiembre a diciembre Compras sólo tiene el renglón viejo de $3.000.000/mes, así que el cash flow
// proyectaba $3.000.000 donde el compromiso real es $9.800.000. Cuatro meses × $6.500.000 =
// **$26.000.000 de egreso que el cuadro no mostraba**, y no había forma de que se notara: el número
// existía, era plausible y estaba en la línea correcta.
//
// Un compromiso mensual fijo no se modela cargándolo a mano doce veces al año en Compras — se carga
// una vez y se proyecta. Es exactamente lo que ya hacen los otros dos bloques de la pestaña.
//
// ═══ DE DÓNDE SALE CADA COSA (NINGÚN NÚMERO PEGADO) ═══
//
//   · el importe mensual de cada persona → la ÚLTIMA carga suya en Compras (LOOKUP(2;1/…)). Si el
//     dueño le sube el retiro a alguien, lo carga donde ya lo carga y el bloque se mueve solo.
//   · desde qué mes corre           → la fecha de caja MÁS TEMPRANA de esas filas. Antes de esa
//     fecha no había retiro y proyectarlo hacia atrás sería inventar plata que nadie pagó.
//   · qué mes ya está pagado        → las filas de Compras marcadas "Pagado". Es un HECHO y le gana
//     a la proyección, igual que "Pagado el" le gana a "Se paga el" en el bloque de obra.
//   · cuándo sale de la caja        → DIRECCION_DIA_PAGO, un parámetro de la pestaña Parámetros.
//
// SIN CELDAS DE CARGA MANUAL, A PROPÓSITO. La primera versión de este bloque tenía la columna
// "Pagado" como celda del dueño. Con el historial de esta semana —le borré datos cargados a mano dos
// veces el mismo día— agregar una celda nueva que un generador tiene que aprender a no pisar es
// agregar una superficie de error a cambio de nada: el dato de si se pagó ya vive en Compras, que es
// donde él lo carga hoy. Todo el bloque es fórmula.
//
// UN MES ESTÁ PAGADO O PROYECTADO, NUNCA LOS DOS. La proyección se apaga sola en cuanto la celda de
// pagado tiene plata (`IF(N(pagado)>0;"";…)`), así que sumar las dos columnas —que es lo que hace el
// cash flow— es correcto por construcción y no por disciplina de quien carga.

/** Las tres personas de Dirección. Definidas UNA vez: de acá salen el rótulo, el regex y el total. */
export const NOMBRES_DIRECCION = ['Jorge Echegaray', 'Rodrigo Echegaray', 'Jorge Corona']

/** El nombre del parámetro con el día del mes en que salen los retiros. */
export const RANGO_DIA_PAGO = 'DIRECCION_DIA_PAGO'
/** MEDIDO en Compras: las cinco filas de sueldos de administración tienen fecha de caja 10/08. */
export const DIA_PAGO_DEFAULT = 10

export const PARAMETRO_DIA_PAGO = {
  rango: RANGO_DIA_PAGO,
  rotulo: 'Día del mes en que se pagan los retiros de Dirección',
  valor: DIA_PAGO_DEFAULT,
  nota: 'Los retiros de un mes se pagan este día del mes SIGUIENTE. MEDIDO en Compras: los cinco sueldos de administración de julio tienen fecha de caja 10/08. Cambiá este número y el cash flow semanal se recalcula.',
}

// Las columnas de Compras que mira este bloque. Las mismas que ya usa el cash flow (COL_TOTAL,
// COL_RUBRO, COL_FECHA de cash-flow-lineas.mjs) más las dos que identifican a la persona y el estado.
export const COL_PERSONA = "'Compras'!$K$4:$K" // "Detalles / Obra" — ahí está el nombre
export const COL_IMPORTE = "'Compras'!$O$4:$O" // "Total"
export const COL_FECHA_CAJA = "'Compras'!$AD$4:$AD" // cuándo sale la plata
export const COL_ESTADO_PAGO = "'Compras'!$Z$4:$Z" // "✅ Pagado" / "🟢 Vigente"

/** NÚCLEO PURO: escapa lo que en un regex de Sheets significaría otra cosa. */
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * NÚCLEO PURO: el regex que reconoce a las tres personas en la columna de Compras.
 * Anclado en los dos extremos: "Jorge Corona" no puede matchear "Corona de arranque y bomba", que
 * es una compra real de Zabala Repuestos por $310.000 y que sin el ancla entraba como un retiro.
 */
export const regexDireccion = (nombres = NOMBRES_DIRECCION) => `^(${nombres.map((n) => esc(n.toLowerCase())).join('|')})$`

/** NÚCLEO PURO: ¿es una fila de retiro de Dirección? La versión JS del regex de arriba, para los tests. */
export const esRetiro = (persona, nombres = NOMBRES_DIRECCION) =>
  nombres.some((n) => n.toLowerCase() === String(persona ?? '').trim().toLowerCase())

/**
 * NÚCLEO PURO: el importe mensual de una persona = el de su carga MÁS RECIENTE en Compras.
 *
 * ═══ POR QUÉ NO ES `LOOKUP(2;1/cond;rango)` ═══
 *
 * Ese es el idioma estándar para "el último que cumple" y fue la primera versión de esta línea.
 * PROBADO CONTRA EL SHEET REAL (en una copia, 01/08): devuelve error para las tres personas, con los
 * datos cargados y la condición bien escrita. `SUMIFS` sobre la MISMA condición devuelve $3.000.000 y
 * `COUNTIF` devuelve 1 — o sea que la fila existe y el match es correcto; lo que falla es LOOKUP, que
 * hace búsqueda BINARIA y no está garantizado sobre un rango con errores intercalados. Es el mismo
 * defecto que ya dejó un saldo falso en CAJA una vez.
 *
 * Y "el último" por ORDEN DE FILA tampoco era lo que corresponde: lo que vale es el retiro más
 * reciente, que es el de la fecha de caja más alta. Una fila cargada fuera de orden habría ganado.
 * Se ordena por fecha y se toma el primero: dice lo que significa y no depende de cómo se cargó.
 *
 * @param {string} celdaNombre la celda con el nombre de la persona (ej. "$A$47")
 */
export const formulaRetiroMensual = (celdaNombre) =>
  `=IFERROR(INDEX(SORT(FILTER({${COL_IMPORTE}\\${COL_FECHA_CAJA}};LOWER(${COL_PERSONA}&"")=LOWER(${celdaNombre}));2;0);1;1);"")`

/**
 * NÚCLEO PURO: la fecha de caja MÁS TEMPRANA de un retiro de Dirección — desde cuándo corre.
 * Si no hay ninguna fila cargada devuelve "" y toda la proyección queda apagada: sin evidencia de
 * que el retiro exista, el cuadro no lo inventa.
 */
export const formulaPrimerRetiro = (nombres = NOMBRES_DIRECCION) =>
  `=IFERROR(MIN(FILTER(${COL_FECHA_CAJA};REGEXMATCH(LOWER(${COL_PERSONA}&"");"${regexDireccion(nombres)}");ISNUMBER(${COL_FECHA_CAJA})));"")`

/**
 * NÚCLEO PURO: lo REALMENTE pagado a Dirección en un mes, según Compras.
 *
 * Mira el estado de pago, no la fecha: una fila con fecha de caja pasada y estado "Vigente" es un
 * pago previsto que todavía no salió. Confundirlos apagaría la proyección de un mes que sigue
 * debiéndose — el error caro, porque desaparece plata del cuadro sin dejar rastro.
 *
 * `IF(ISNUMBER(x);x;0)` y no `N(x)`: dentro de SUMPRODUCT, N() no se expande sobre un rango.
 */
export function formulaPagadoMes(mes, anio, nombres = NOMBRES_DIRECCION) {
  // ═══ LA VENTANA ES LA DEL MES SIGUIENTE (06/08, pagado en vivo) ═══
  //
  // El retiro del mes M sale el DIA_PAGO de M+1 — la proyección ya lo dice así ("se paga el
  // 10/08" para julio) y la propia nota del bloque lo midió en Compras. Pero esta fórmula buscaba
  // pagos con fecha de caja DENTRO de M: los $9M pagados el 03-04/08 cayeron en el balde "Agosto",
  // "Julio" siguió proyectado $9M al 10/08, y la tarjeta COMPROMETIDA pidió plata que ya salió.
  // Un pago confirma la proyección más vieja: la ventana de pagado es la MISMA que la de pago.
  const desde = `DATE(${anio};${mes + 1};1)`
  const hasta = `DATE(${anio};${mes + 2};1)`
  const f = `IF(ISNUMBER(${COL_FECHA_CAJA});${COL_FECHA_CAJA};0)`
  return `=SUMPRODUCT(REGEXMATCH(LOWER(${COL_PERSONA}&"");"${regexDireccion(nombres)}")`
    + `*(${f}>=${desde})*(${f}<${hasta})`
    + `*REGEXMATCH(${COL_ESTADO_PAGO}&"";"Pagado")`
    + `*IF(ISNUMBER(${COL_IMPORTE});${COL_IMPORTE};0))`
}

/**
 * NÚCLEO PURO: cuándo sale de la caja el retiro del mes `mes` — el día DIA_PAGO del mes siguiente.
 * Diciembre da enero del año que viene, y está bien: es percibido, y ese pago no es caja de este año.
 */
export const formulaSePagaElDireccion = (mes, anio) => `=DATE(${anio};${mes + 1};${RANGO_DIA_PAGO})`

/**
 * NÚCLEO PURO: lo proyectado de un mes. Vacío —no cero— cuando no corresponde proyectar.
 *
 * Tres apagados, en orden, y cada uno tapa una forma distinta de inventar plata:
 *   · sin importe mensual cargado  → no sé cuánto es;
 *   · el mes ya está pagado        → el hecho le gana a la proyección (y evita contarlo dos veces);
 *   · el mes es anterior al primer retiro → antes de eso no había retiro que pagar.
 *
 * El tercero también es el que se cae para el lado seguro: si la celda "desde" quedó vacía, la
 * comparación `fecha < ""` es VERDADERA en Sheets (un número siempre es menor que un texto) y el
 * cuadro proyecta CERO en vez de doce meses de plata sin respaldo.
 */
export const formulaProyectadoMes = (celdaPago, celdaPagado, celdaTotal, celdaDesde) =>
  `=IF(N(${celdaTotal})=0;"";IF(N(${celdaPagado})>0;"";IF(${celdaPago}<${celdaDesde};"";${celdaTotal})))`

// ═══ LO QUE LEE EL CASH FLOW ═══
//
// Los tres rangos con nombre que publica la pestaña. Misma forma que OFICINA_*: una fecha de caja,
// lo pagado y lo proyectado. El cash flow los referencia por nombre y no cita ni un número de fila.
export const DIR = { pago: 'DIRECCION_PAGO', pagado: 'DIRECCION_PAGADO', proyectado: 'DIRECCION_PROYECTADO' }

/**
 * NÚCLEO PURO: los retiros de Dirección que caen en una ventana de caja.
 * @param {string} desde expresión de inicio · @param {string} hasta límite EXCLUYENTE
 */
export function formulaDireccion(desde, hasta) {
  const f = DIR.pago
  const en = `ISNUMBER(${f})*(${f}>=${desde})*(${f}<${hasta})`
  const pagado = `IF(ISNUMBER(${DIR.pagado});${DIR.pagado};0)`
  const proy = `IF(ISNUMBER(${DIR.proyectado});${DIR.proyectado};0)`
  return `=SUMPRODUCT(${en}*(${pagado}+${proy}))`
}
