// EL NETO A PAGAR DE LA FILA QUE DECIDE UN PAGO — y por qué restar el adelanto puede ser un error.
//
// ═══ EL DEFECTO (31/08/2026) ═══
//
// El cuadro «LO QUE HAY QUE PAGAR» de `Jornales por Quincena` calculaba siempre
// `neto = total − adelanto entregado`. Es la cuenta correcta cuando el total es BRUTO.
//
// Desde el 31/08 la fila de obreros dejó de calcular y pasa a CITAR el `TOTAL A PAGAR` de `Nómina`.
// Ese número YA viene neto: la fórmula de la columna «EN EFECTIVO» de Nómina resta el adelanto, lo
// ya transferido y lo que va por banco antes de publicarlo. Restarlo otra vez acá lo descuenta dos
// veces.
//
// Medido ese día, quincena 17/08→31/08: Nómina publicaba $6.331.859 a pagar con $2.786.533 por banco
// y $3.545.326 en efectivo. Jornales, con los mismos datos, publicaba $5.123.215 de neto y
// **$2.336.682 en efectivo** — $1.208.644 menos. Quien pagara mirando esta pestaña le daba de menos
// esa plata a la cuadrilla, y las dos pestañas «coincidían» en el total mientras diferían en lo
// único que se opera.
//
// ═══ POR QUÉ NO SE RESUELVE BORRANDO LA RESTA ═══
//
// Porque la resta sigue haciendo falta cuando Nómina no contesta. La celda del total tiene un
// respaldo: si la pestaña no está o el rótulo cambió, cae al registro de la quincena, que sí es
// BRUTO. Sacar la resta arreglaría hoy y rompería el día que el respaldo entre en juego —y ese día
// nadie estaría mirando.
//
// Así que la condición viaja EN LA FÓRMULA y la evalúa la hoja, no el generador: es la misma prueba
// que decide de dónde salió el total.

/**
 * La fórmula del «Neto a pagar» de una fila de pago.
 *
 * @param {object} o
 * @param {number} o.fila            fila (base 1) donde vive la fórmula
 * @param {string} [o.colTotal]      columna del total
 * @param {string} [o.colAdelanto]   columna de lo ya entregado
 * @param {string|null} [o.yaNeto]   expresión que la HOJA evalúa: verdadera cuando el total ya viene
 *                                   neto. `null` = el total es siempre bruto (comportamiento viejo).
 * @returns {string}
 */
export function formulaNetoAPagar({ fila, colTotal = 'D', colAdelanto = 'E', yaNeto = null } = {}) {
  const T = `${colTotal}${fila}`
  const A = `N(${colAdelanto}${fila})`
  const bruto = `${T}-${A}`
  const cuerpo = yaNeto ? `IF(${yaNeto};${T};${bruto})` : bruto
  return `=IF(N(${T})=0;"";${cuerpo})`
}

/**
 * El efectivo es el RESTO del neto, nunca un 50% calculado aparte: así la identidad
 * `banco + efectivo = neto` cierra aunque el banco venga de un dato cargado y no del acuerdo.
 */
export function formulaEnEfectivo({ fila, colTotal = 'D', colNeto = 'F', colBanco = 'G' } = {}) {
  return `=IF(OR(N(${colTotal}${fila})=0;NOT(ISNUMBER(${colBanco}${fila})));"";${colNeto}${fila}-${colBanco}${fila})`
}

/**
 * LO QUE SE LE TRANSFIERE A OFICINA — y por qué no es la mitad.
 *
 * ═══ EL DEFECTO (31/08/2026) ═══
 *
 * La fila de Oficina publicaba `total/2`: el 50/50 calculado. Con $3.600.000 de neto acordado daba
 * $1.800.000 por banco y $1.800.000 en efectivo. Pero los recibos de los dos dicen $663.141,56 cada
 * uno — $1.326.283 de blanco— y el resto, $2.273.716, se completa en billetes. El acuerdo del dueño
 * es textual: **«lo blanco es lo que indica su recibo y el resto se completa en efectivo»**.
 *
 * O sea: $473.717 de más por transferencia y esa misma plata de menos en la mano. Es el mismo 50/50
 * que él mandó dejar de usar en la fila de obra, que había quedado vivo en la de al lado.
 *
 * La mitad se conserva SÓLO como respaldo: si Nómina no está o el rótulo cambió, una celda vacía se
 * leería como «a oficina no se le transfiere nada», que es peor que un reparto aproximado.
 *
 * `/2` y NUNCA `*0,5`: un literal decimal escrito por API viaja en el locale es_AR del archivo, donde
 * la coma es el separador de argumentos — el `0,5` se parte en dos y la celda queda en #ERROR.
 *
 * @param {{fila:number, colTotal?:string, cita:string}} o  `cita` = la expresión que trae el POR BANCO
 *   publicado en Nómina.
 */
export function formulaBancoOficina({ fila, colTotal = 'D', cita } = {}) {
  const T = `${colTotal}${fila}`
  return `=IF(N(${T})=0;"";IF(N(${cita})>0;${cita};${T}/2))`
}
