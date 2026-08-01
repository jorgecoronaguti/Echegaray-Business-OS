// CADA PESO QUE SALIÓ DEL BANCO TIENE UNA PESTAÑA DONDE DEBERÍA ESTAR.
//
// POR QUÉ EXISTE (21/07). La conciliación de CAJA quedó con un residuo de $13.420.991 "sin
// explicar" — el único número del bloque que es un problema de verdad, después de separar lo que es
// futuro. Un residuo global no se puede investigar: hay que abrirlo por naturaleza.
//
// El extracto trae 70 movimientos y 65 son egresos. Agrupados por lo que SON —no por su concepto
// literal, que el banco escribe de veinte maneras— quedan nueve grupos, y cada uno tiene una
// pestaña dueña:
//
//   Cheques y echeq ............ Cheques Emitidos (los que dicen DEBITADO = SI)
//   AFIP ....................... Impuestos y Financieros
//   Sueldos .................... Jornales por Quincena
//   Pago de la tarjeta ......... Tarjeta de Credito
//   Transferencias a proveedores Compras, por fecha de caja
//   Compras con tarjeta de débito Compras, por fecha de caja
//   Préstamo prendario ......... Compras (rubro financiero) o Recurrentes
//   Débitos automáticos ........ Compras (seguros)
//   Costo financiero e impuesto al cheque ... ⚠ NINGUNA
//
// EL ÚLTIMO GRUPO ES EL HALLAZGO. El impuesto al cheque, el interés del descubierto y sus IVA no
// tienen pestaña dueña: son plata que sale todos los meses y que ningún cuadro del archivo espera.
// Por eso el cash flow proyecta un saldo que la cuenta nunca tiene.
//
// LO QUE NO HACE: no acusa. Una diferencia entre el banco y una pestaña puede ser trabajo de carga
// pendiente, un corte de fechas distinto o un movimiento que corresponde a otro mes. Lo que no puede
// pasar es que nadie la mire.

/** La columna de la réplica donde vive cada dato. Es contrato con banco-raw-pestana.mjs. */
export const RAW = { hoja: '_BANCO_RAW', fecha: 'A', concepto: 'B', importe: 'C', signo: 'E', naturaleza: 'F', desde: 4 }

/**
 * Los grupos, en el orden en que se muestran, con la pestaña que tiene que explicarlos.
 *
 * `formula` recibe las expresiones de la ventana del extracto y devuelve lo que esa pestaña dice
 * haber pagado en esos mismos días. `null` = no hay pestaña dueña, y eso es el aviso.
 */
export const GRUPOS = [
  {
    naturaleza: 'Cheques y echeq',
    pestana: 'Cheques Emitidos',
    formula: (d, h) => `SUMIFS('Cheques Emitidos'!$F$2:$F$400;'Cheques Emitidos'!$K$2:$K$400;"SI";'Cheques Emitidos'!$I$2:$I$400;">="&${d};'Cheques Emitidos'!$I$2:$I$400;"<="&${h})`,
    nota: 'Los cheques propios que el banco ya debitó, contra los que la pestaña marca DEBITADO = SI en esos días.',
    // LA DIFERENCIA DE ESTE GRUPO SE PUEDE ACCIONAR, así que se lista. Un desvío de $899.154 no le
    // sirve a nadie; "el cheque 218 de Corralón Progreso, $200.000, con fecha 07/07" sí. Son cheques
    // que el banco ya cobró y la pestaña sigue mostrando pendientes: la disponibilidad neta los
    // resta como compromiso futuro cuando la plata ya salió, así que la caja se ve peor de lo que es.
    detalle: () => '=IFERROR(TEXTJOIN("   ·   ";1;ARRAYFORMULA(IF((UPPER(\'Cheques Emitidos\'!$K$2:$K$400)<>"SI")*ISNUMBER(\'Cheques Emitidos\'!$I$2:$I$400)*(\'Cheques Emitidos\'!$I$2:$I$400>=' + VENTANA.desde + ')*(\'Cheques Emitidos\'!$I$2:$I$400<=' + VENTANA.hasta + ')*ISNUMBER(\'Cheques Emitidos\'!$F$2:$F$400);"N° "&\'Cheques Emitidos\'!$B$2:$B$400&" "&\'Cheques Emitidos\'!$E$2:$E$400&" "&TEXT(\'Cheques Emitidos\'!$F$2:$F$400;"$#,##0");"")));"")',
    detalleNota: 'Cheques con fecha de pago dentro de la ventana del extracto que la pestaña NO marca como debitados. Si el banco ya los cobró, hay que marcarlos: mientras figuren pendientes, la disponibilidad neta los descuenta como si la plata todavía estuviera.',
  },
  {
    naturaleza: 'Pago de la tarjeta',
    pestana: 'Tarjeta de Credito',
    formula: (d, h) => `SUMIFS('Tarjeta de Credito'!$E$3:$E$400;'Tarjeta de Credito'!$J$3:$J$400;"SI";'Tarjeta de Credito'!$I$3:$I$400;">="&${d};'Tarjeta de Credito'!$I$3:$I$400;"<="&${h})`,
    nota: 'El débito automático del resumen contra los consumos que la pestaña da por debitados.',
  },
  {
    naturaleza: 'Transferencias a proveedores',
    pestana: 'Compras',
    formula: (d, h) => `SUMIFS(Compras!$O$4:$O;Compras!$AD$4:$AD;">="&${d};Compras!$AD$4:$AD;"<="&${h})`,
    nota: '⚠ Compara contra TODAS las compras con fecha de caja en la ventana, no sólo las pagadas por transferencia: la pestaña no distingue el medio de pago. Sirve como orden de magnitud, no como cuadre exacto.',
  },
  {
    naturaleza: 'Compras con tarjeta de débito',
    pestana: 'Compras',
    formula: null,
    nota: '⚠ Compras de mostrador pagadas con débito. No hay forma de aislarlas en Compras: la pestaña no registra el medio de pago. Si no están cargadas, son costo que no aparece en ningún rubro.',
  },
  {
    naturaleza: 'AFIP',
    pestana: 'Impuestos y Financieros',
    formula: null,
    nota: 'Los pagos a AFIP del período. La pestaña de Impuestos lleva el devengado (lo que se declara), no la fecha en que se debita: son dos cosas distintas y compararlas al peso sería mezclar criterios.',
  },
  {
    naturaleza: 'Sueldos',
    pestana: 'Jornales por Quincena',
    // ═══ EL CONTROL QUE FALTABA, Y QUE YA SE PUEDE HACER (01/08) ═══
    //
    // La nota decía "Jornales lleva la quincena devengada, no el día del pago", y por eso esta fila
    // no tenía contraste. Era cierto y dejó de serlo: la pestaña tiene ahora "Pagado el" —el día en
    // que la plata salió— y la columna Banco —cuánto de esa quincena salió por transferencia—. Con
    // esas dos, comparar contra el extracto es exactamente la misma cuenta que las demás filas.
    //
    // POR QUÉ IMPORTA, MEDIDO. Al 31/07 el extracto no muestra NINGUNA acreditación de haberes y
    // Jornales registra dos quincenas pagadas ese día con $7.621.808 por banco. Sin esta fila, esos
    // $7,6 millones no aparecían en ningún control: ni en el saldo (el extracto no los tiene) ni en
    // el desvío (esta celda estaba vacía). El dinero más regular de la empresa, sin cuadrar.
    formula: (d, h) => `SUMPRODUCT(ISNUMBER(JORNALES_REAL_PAGADO)*(JORNALES_REAL_PAGADO>=${d})*(JORNALES_REAL_PAGADO<=${h})*N(JORNALES_REAL_BANCO))`,
    nota: 'La acreditación de haberes: columna Banco de las quincenas con fecha en "Pagado el" dentro de la ventana del extracto. Sólo la parte bancaria — lo que se pagó en billetes (Adelanto y Total recibo) sale de la caja física, no de la cuenta.',
  },
  {
    naturaleza: 'Préstamo prendario',
    pestana: 'Recurrentes',
    formula: null,
    nota: 'La cuota del prendario. Está proyectada en el cash flow como línea propia.',
  },
  {
    naturaleza: 'Débitos automáticos (seguros)',
    pestana: 'Compras',
    formula: null,
    nota: 'Seguros y coberturas que se debitan solos. Si no están en Compras, no están en ningún rubro del cash flow.',
  },
  {
    naturaleza: 'Impuesto al cheque (Ley 25.413)',
    pestana: 'Cash Flow Mensual',
    formula: null,
    // ME CORRIJO SOBRE HACE UN RATO. Escribí que ninguna pestaña lo esperaba y llegué a publicarlo
    // en CAJA: es falso. El Cash Flow Mensual tiene su línea propia —"Impuesto al cheque (Ley
    // 25.413, 0,6% de cada lado)"— que proyecta $992.327 para julio. No se compara al peso porque
    // el cuadro es MENSUAL y el extracto cubre 16 días, y porque el cuadro aplica la alícuota a
    // TODO el movimiento proyectado, incluido el que no pasa por el banco.
    nota: 'Tiene su línea en el Cash Flow Mensual, dentro de Actividades de Financiación. La alícuota no se inventó: el propio extracto la declara (0,6%) y medida sobre estos movimientos da 0,595% sobre los débitos y 0,600% sobre los créditos.',
  },
  {
    naturaleza: 'Comisiones y gastos bancarios',
    pestana: 'Cash Flow Mensual',
    formula: null,
    // EL GRUPO QUE FALTABA (31/07). Estos movimientos estaban dentro de "Transferencias a proveedores",
    // así que la fila de Compras de arriba los reclamaba como pagos a proveedor y el desvío de ese
    // grupo salía $381.649,64 más grande de lo que era. Sin fórmula de contraste a propósito: NO hay
    // pestaña que los pueda tener. El banco los debita sin factura, así que no existen en Compras y
    // nunca van a existir — el único registro es el extracto, y por eso la línea del Cash Flow los lee
    // de _BANCO_RAW. La columna "Según la pestaña" se deja vacía en vez de escribir un 0, que se leería
    // como "cuadra" cuando lo correcto es "no hay nada del otro lado".
    nota: 'Comisión de cuenta, de clearing, de cuenta en dólares y de compensación de cheques, con su IVA 21% y su percepción RG 2408 al 3%. Tienen línea propia en Actividades de Financiación del Cash Flow, que las lee de acá: el banco las debita sin factura y NUNCA van a estar en Compras. Medido: $113.794,80 en junio y $267.854,84 en julio.',
  },
  {
    naturaleza: 'Costo financiero del descubierto',
    pestana: 'Cash Flow Mensual',
    formula: null,
    // ACÁ SÍ HAY UN HALLAZGO, Y ES MÁS FINO QUE EL QUE CREÍ TENER. La línea existe, pero su fórmula
    // sólo cobra interés cuando el saldo de CIERRE del mes queda negativo. En julio proyecta $0 y
    // el banco cobró $282.621, más $252.340 del período anterior: la cuenta estuvo en descubierto
    // DURANTE el mes aunque cierre en positivo. Un interés que se cobra por día no se puede
    // proyectar mirando una sola foto del último día.
    nota: '⚠ Tiene línea en el Cash Flow Mensual, pero proyecta $0 para julio: su fórmula mira el saldo de CIERRE del mes y la cuenta estuvo en rojo durante el mes aunque cierre en positivo. El interés corre por día, no por cierre.',
  },
]

const r = (col) => `${RAW.hoja}!$${col}$${RAW.desde}:$${col}`

/**
 * NÚCLEO PURO: lo que el banco muestra para una naturaleza, en la ventana del extracto.
 *
 * Devuelve el importe en POSITIVO —los egresos vienen negativos del extracto— para que la
 * comparación contra la pestaña sea entre dos números del mismo signo. Restar un negativo de un
 * positivo daría el doble y parecería un desvío enorme.
 *
 * @param {string} naturaleza
 * @returns {string} fórmula es-AR, sin el `=`
 */
export function segunBanco(naturaleza) {
  return `-SUMIFS(${r(RAW.importe)};${r(RAW.naturaleza)};"${naturaleza}";${r(RAW.signo)};"sale")`
}

/**
 * NÚCLEO PURO: las expresiones de la ventana que cubre el extracto.
 * Se leen de la propia réplica: una ventana escrita a mano queda vieja en el próximo extracto y
 * empieza a comparar días distintos de cada lado, que es la forma más silenciosa de descuadrar.
 */
export const VENTANA = {
  desde: `MIN(${r(RAW.fecha)})`,
  hasta: `MAX(${r(RAW.fecha)})`,
}

/**
 * NÚCLEO PURO: ¿cuántos grupos del extracto no tienen ninguna pestaña que los espere?
 * Es la medida de la regla "no tiene que haber dato sin contemplar" del lado del banco.
 */
export function sinPestanaDuena(grupos = GRUPOS) {
  return grupos.filter((g) => !g.pestana)
}
