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
//
// ═══ DOS RETIROS CONFIRMADOS QUE ESTE BLOQUE NO ASIGNA A NINGÚN MES (06/08) ═══
//
// El extracto del Santander tiene dos débitos que el dueño confirmó como retiros:
//
//     01/06   $3.000.000
//     02/07   $2.000.000
//
// Quedan DECLARADOS acá y fuera del cuadro, a propósito. La celda "Pagado" de un mes suma filas de
// COMPRAS, y estos dos débitos no tienen fila de Compras que diga a qué mes de retiro corresponden ni
// a cuál de los tres socios. Imputarlos por la fecha —el de junio al mes de mayo, el de julio al de
// junio— sería elegir por ellos: encendería como PAGADOS dos meses que nadie marcó, apagaría su
// proyección y bajaría el compromiso del año en $5.000.000 sobre una suposición mía.
//
// La regla del archivo es la de siempre: un hecho entra al cuadro por su fuente, no por parecerse a
// uno. Cuando esas dos salidas se carguen en Compras con su persona y su mes, el bloque las va a
// tomar solo y sin tocar una línea de código — que es la prueba de que el criterio está bien puesto.

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
  // Sólo filas CON importe: una proyección ELIMINADA (O=0) o sin cargar no es "la última carga" —
  // el 06/08 las filas de julio (importes viejos, fecha de caja posterior) taparon el pago real.
  `=IFERROR(INDEX(SORT(FILTER({${COL_IMPORTE}\\${COL_FECHA_CAJA}};LOWER(${COL_PERSONA}&"")=LOWER(${celdaNombre});IF(ISNUMBER(${COL_IMPORTE});${COL_IMPORTE};0)>0);2;0);1;1);"")`

/**
 * NÚCLEO PURO: la fecha de caja MÁS TEMPRANA de un retiro de Dirección — desde cuándo corre.
 * Si no hay ninguna fila cargada devuelve "" y toda la proyección queda apagada: sin evidencia de
 * que el retiro exista, el cuadro no lo inventa.
 */
export const formulaPrimerRetiro = (nombres = NOMBRES_DIRECCION) =>
  `=IFERROR(MIN(FILTER(${COL_FECHA_CAJA};REGEXMATCH(LOWER(${COL_PERSONA}&"");"${regexDireccion(nombres)}");ISNUMBER(${COL_FECHA_CAJA})));"")`

/**
 * NÚCLEO PURO: desde cuándo corre el retiro DE UNA PERSONA — su fecha de caja más temprana en Compras.
 *
 * El bloque publicaba un solo "Desde" —el del conjunto, en la fila de total— y el encabezado quedaba
 * coronando tres celdas vacías. Una columna con título y sin dato se lee como un cuadro a medio
 * llenar, y el dato existe: los tres socios no empezaron a cobrar el mismo día.
 *
 * Compara por igualdad y no por regex, como `formulaRetiroMensual`: acá el nombre sale de la celda de
 * al lado, así que no hay nada que reconocer.
 *
 * @param {string} celdaNombre la celda con el nombre de la persona (ej. "$A$47")
 */
export const formulaPrimerRetiroDe = (celdaNombre) =>
  `=IFERROR(MIN(FILTER(${COL_FECHA_CAJA};LOWER(${COL_PERSONA}&"")=LOWER(${celdaNombre});ISNUMBER(${COL_FECHA_CAJA})));"")`

/**
 * NÚCLEO PURO: LAS FILAS DE COMPRAS QUE PAGAN EL RETIRO DEL MES `mes` — definidas UNA sola vez.
 *
 * Las condiciones viven acá y no adentro de cada fórmula porque DOS celdas de la misma fila del
 * cuadro tienen que hablar de las MISMAS filas de Compras: "Pagado" (cuánta plata salió) y "Se paga
 * el" (cuándo salió). Cuando cada una definía su propia ventana, el cuadro dijo las dos cosas a la
 * vez —julio pagado $9.000.000 y "se paga el 10/08", una fecha que todavía no llegó— y el libro
 * partió $3.000.000 como COMPROMETIDO fantasma. Con una definición sola, ese desacuerdo no se puede
 * volver a escribir.
 *
 * Mira el ESTADO de pago, no que la fecha ya haya pasado: una fila con fecha de caja vencida y
 * estado "🟢 Vigente" es un pago previsto que todavía no salió. Confundirlos apagaría la proyección
 * de un mes que se sigue debiendo — el error caro, porque desaparece plata sin dejar rastro.
 *
 * ═══ LA VENTANA ES LA DEL MES SIGUIENTE (06/08, pagado en vivo) ═══
 *
 * El retiro del mes M sale el DIA_PAGO de M+1 — la proyección ya lo dice así ("se paga el 10/08"
 * para julio) y la propia nota del bloque lo midió en Compras. Pero esto buscaba pagos con fecha de
 * caja DENTRO de M: los $9M pagados el 03-04/08 cayeron en el balde "Agosto", "Julio" siguió
 * proyectado, y la tarjeta COMPROMETIDA pidió plata que ya había salido. Un pago confirma la
 * proyección más vieja: la ventana de pagado es la MISMA que la de pago.
 *
 * `IF(ISNUMBER(x);x;0)` y no `N(x)`: dentro de SUMPRODUCT, N() no se expande sobre un rango.
 *
 * @returns {string[]} las condiciones, en orden. Se unen con `*` para SUMPRODUCT y con `;` para FILTER.
 */
export function condicionesPagoDelMes(mes, anio, nombres = NOMBRES_DIRECCION) {
  const desde = fechaDeMes(anio, mes + 1, '1')
  const hasta = fechaDeMes(anio, mes + 2, '1')
  const f = `IF(ISNUMBER(${COL_FECHA_CAJA});${COL_FECHA_CAJA};0)`
  return [
    `REGEXMATCH(LOWER(${COL_PERSONA}&"");"${regexDireccion(nombres)}")`,
    `(${f}>=${desde})`,
    `(${f}<${hasta})`,
    `REGEXMATCH(${COL_ESTADO_PAGO}&"";"Pagado")`,
  ]
}

/** NÚCLEO PURO: lo REALMENTE pagado a Dirección en un mes, según Compras. */
export function formulaPagadoMes(mes, anio, nombres = NOMBRES_DIRECCION) {
  return `=SUMPRODUCT(${condicionesPagoDelMes(mes, anio, nombres).join('*')}`
    + `*IF(ISNUMBER(${COL_IMPORTE});${COL_IMPORTE};0))`
}

/**
 * NÚCLEO PURO: cuándo sale de la caja el retiro del mes `mes`.
 *
 * ═══ UN MES PAGADO NO TIENE FECHA PREVISTA: TIENE FECHA (06/08) ═══
 *
 * Esta celda devolvía SIEMPRE el día DIA_PAGO del mes siguiente, estuviera el mes pagado o no. El
 * caso real: julio figuraba pagado $9.000.000 y "se paga el" 10/08 — una fecha FUTURA para plata que
 * ya había salido. Los pagos, verificados contra el extracto y confirmados por el dueño ("sí fueron
 * retiros"), fueron dos débitos de $3.000.000 el 03/08 (uno a nombre de Ana Laura Echegaray, que es
 * el retiro de Jorge Corona) y el retiro de Jorge Echegaray EN EFECTIVO el 04/08.
 *
 * Como el cash flow imputa este bloque por DIRECCION_PAGO, esos $9.000.000 quedaban parados en una
 * fecha que no había llegado y el libro los partía como COMPROMETIDO fantasma. El importe estaba
 * bien, la plata estaba pagada, y el cuadro igual pedía caja para el 10/08: ningún error, ningún
 * descuadre, un compromiso inventado.
 *
 * LA FECHA DE UN HECHO SALE DEL HECHO. Si hay filas de Compras que pagaron el mes —exactamente las
 * mismas que suma "Pagado", por `condicionesPagoDelMes`— la fecha es la de esas filas. Si no las
 * hay, FILTER da #N/A y la celda cae en la fecha PREVISTA, que es lo correcto para un mes que
 * todavía se debe.
 *
 * MÁX Y NO MÍN. Un mes se termina de pagar cuando salió el último peso: con caja el 03/08 y efectivo
 * el 04/08, el compromiso se cierra el 04/08. El MÍN diría que el mes estaba saldado un día antes de
 * que lo estuviera.
 *
 * Diciembre da enero del año que viene, y está bien: es percibido, y ese pago no es caja de este año.
 */
export function formulaSePagaElDireccion(mes, anio, nombres = NOMBRES_DIRECCION) {
  const prevista = fechaDeMes(anio, mes + 1, RANGO_DIA_PAGO)
  return `=IFERROR(MAX(FILTER(${COL_FECHA_CAJA};${condicionesPagoDelMes(mes, anio, nombres).join(';')}));${prevista})`
}

/**
 * NÚCLEO PURO: `DATE(año;mes;día)` con el mes SIEMPRE entre 1 y 12.
 *
 * POR QUÉ (06/08, defecto B7 de la auditoría). Diciembre se paga en enero, y el código escribía
 * `DATE(2026;13;10)`. Sheets lo resuelve por desborde y da 10/01/2027, así que el número está bien —
 * pero la celda dice "mes 13", que no existe, y el día que alguien copie esa fórmula a otra pestaña o
 * la traduzca a SQL, el desborde no lo va a salvar. Se corrige donde se genera, no donde se lee.
 */
export function fechaDeMes(anio, mes, dia) {
  const y = anio + Math.floor((mes - 1) / 12)
  const m = ((mes - 1) % 12) + 1
  return `DATE(${y};${m};${dia})`
}

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
