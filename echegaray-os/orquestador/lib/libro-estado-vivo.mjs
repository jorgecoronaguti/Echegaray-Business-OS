// EL ESTADO DE UNA FILA DE COMPRAS, VIVO EN LA PESTAÑA — la columna H deja de ser una foto.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO CIERRA (07/08/2026) ═══
//
// El dueño paga un proveedor y marca "Pagado" en la columna Estado de Compras. La tarjeta CAJA
// DISPONIBLE reacciona en el acto —sus fórmulas leen Compras y `_BANCO_RAW` en vivo—, pero CAJA
// COMPROMETIDA cuelga de `_MOVIMIENTOS`, y ahí el estado es un TEXTO PEGADO: lo escribe el generador
// y no vuelve a moverse hasta la corrida siguiente. Entre una regeneración y otra, un pago ya hecho
// sigue contado como comprometido. Medido contra el archivo vivo el 07/08: 5 pagos por $3.553.544.
//
// El dueño, textual: *"si tenemos dinero comprometido que expone la tarjeta de caja es porque sale de
// saldos de pagos que tenía pendiente a proveedores"*.
//
// La corrección es que la celda se pregunte sola: si la fila de Compras de la que salió ya dice
// "Pagado", el movimiento vale REAL — y un REAL no lo mira ninguna vista de proyección. La fila se
// autopromueve sin esperar al generador.
//
// ═══ QUÉ NO HACE, Y ES A PROPÓSITO ═══
//
// · **No mueve la FECHA.** La fila autopromovida conserva la fecha PROYECTADA hasta la regeneración
//   siguiente, que es la que trae la fecha de caja real desde Compras. Inventar acá una fecha —hoy,
//   por ejemplo— sería fabricar un dato. Y no cambia ningún número: lo REAL ya vive dentro del saldo
//   del banco y ninguna proyección lo suma, así que su fecha no mueve nada. Se declara, no se
//   "arregla".
// · **No modela la vuelta atrás.** Si el dueño DESMARCA un pago, la fórmula vuelve sola al estado
//   escrito —es simétrica— y la regeneración siguiente reescribe lo que corresponda. Las filas que
//   ya salen REAL quedan como valor pegado: no hay nada que promover en ellas.
// · **No cambia el importe.** Una compra parcialmente pagada viaja en el libro por su SALDO
//   (`pendienteDeCompra`), y eso no se toca: al marcarla "Pagado", la fórmula promueve el SALDO a
//   REAL, que es exactamente la plata que dejó de estar comprometida. En la regeneración siguiente
//   esa fila pasa a valer el TOTAL —es lo que `pendienteDeCompra` ya hace con una fila cerrada— y
//   ningún número de proyección se mueve, porque lo REAL no lo suma nadie. Semántica de hoy, sin una
//   regla nueva.
//
// ═══ POR QUÉ SÓLO PROYECTADO Y VENCIDO, Y NO COMPROMETIDO ═══
//
// Parece que el COMPROMETIDO tendría que autopromoverse igual. NO: un COMPROMETIDO que sale de
// Compras **ya tiene la fila marcada "Pagado"**. `estadoDeEgreso` sólo devuelve COMPROMETIDO cuando
// `pagado === true` y el instrumento es diferido con fecha posterior al corte del extracto — es el
// cheque entregado que todavía no debitó, el arreglo del 06/08 que rescató $2.569.676 que no estaban
// en ninguna parte del cuadro. Ponerle la fórmula lo pasaría a REAL EN EL ACTO y reabriría ese
// agujero el mismo día que se cierra este otro. Su promoción tiene su propio circuito y su propio
// testigo: el extracto (`chequesCubiertosPorBanco`).
//
// Por la misma razón quedan afuera las CUOTAS EN CHEQUE (`cuotasEnCheque`), que se reconocen porque
// su `origen.fila` no es un número sino "457 · cheque 12": también salen de filas ya "Pagado".
//
// ═══ LA COLUMNA SALE DEL RÓTULO, NO DE LA LETRA ═══
//
// El resto del repo resuelve las columnas de Compras por su encabezado (`columnasDeCompras`). Si acá
// se escribiera "X" a mano, el día que la planilla mueva una columna el extractor se adaptaría y la
// fórmula seguiría leyendo la columna vieja: dos lecturas distintas de la misma fila, y la de la
// fórmula sin un solo error a la vista. La letra se DERIVA del mismo mapa por rótulo.

import { letra, resolverColumnas } from './compras-columnas.mjs'
import { columnasDeCompras, estaPagada, NOMBRES_COMPRAS } from './libro-extractores-compras.mjs'

/** La pestaña de la que sale el estado vivo. Es la única fuente con un estado editable a mano. */
export const PESTANA_COMPRAS = 'Compras'

/**
 * LA MARCA QUE PROMUEVE. Es el contrato que escribe el cargador de comprobantes (Pagado/Pendiente).
 *
 * ═══ LA ASIMETRÍA CON `estaPagada`, DECLARADA ═══
 *
 * `estaPagada` tolera decoración alrededor de la palabra ("✅ Pagado") porque compara sólo lo
 * alfabético. La fórmula compara el texto completo —el archivo ignora mayúsculas, no los adornos—,
 * así que una celda decorada NO autopromueve y la fila espera a la regeneración siguiente:
 * exactamente el comportamiento de hoy. Falla del lado seguro, nunca al revés (hay un test que fija
 * esa dirección).
 *
 * No se replicó `estaPagada` con REGEXREPLACE a propósito: una sola celda de la columna H en error
 * envenena TODOS los SUMPRODUCT que leen el libro —las cinco tarjetas y la escalera entera—, y el
 * comportamiento de una clase de caracteres acentuada en el motor de expresiones del archivo no se
 * puede verificar sin escribir en el archivo real. Se elige la comparación cuya semántica es segura.
 * `estadosDecorados` mide el hueco en cada corrida para que no quede escondido.
 */
export const MARCA_PAGADO = 'Pagado'

/**
 * LOS ESTADOS QUE SE AUTOPROMUEVEN. Ver el bloque de arriba: COMPROMETIDO queda afuera porque su
 * fila ya está marcada "Pagado" y la fórmula lo promovería en el acto.
 */
export const ESTADOS_VIVOS = Object.freeze(['PROYECTADO', 'VENCIDO'])

/**
 * NÚCLEO PURO: la letra A1 de la columna "Estado" de Compras, resuelta por su rótulo.
 *
 * @param {Array<Array>} filas Compras entera (el encabezado real vive en la fila 3)
 * @returns {string} 'X' hoy — y lo que corresponda el día que la planilla mueva la columna
 */
export function columnaEstadoDeCompras(filas = []) {
  return letra(columnasDeCompras(filas).estado)
}

/**
 * NÚCLEO PURO: las tres letras que las celdas vivas necesitan de Compras — estado, total y monto
 * pagado — resueltas por rótulo. Con cualquiera sin resolver, devuelve null y todo cae al valor
 * pegado (falla cerrado, comportamiento anterior).
 */
export function columnasVivasDeCompras(filas = []) {
  try {
    const c = columnasDeCompras(filas)
    return { estado: letra(c.estado), total: letra(c.importe), montoPagado: letra(c.montoPagado) }
  } catch { return null }
}

/**
 * EL RÓTULO REAL DE LA FECHA DEL COMPROBANTE EN COMPRAS. Es "Fecha factura" (col C hoy), NO "Fecha".
 *
 * ═══ EL DEFECTO QUE ESTA CONSTANTE CIERRA (13/08/2026) ═══
 *
 * Acá decía `{ fecha: 'Fecha' }`, y en el encabezado de Compras NO existe ninguna columna con ese
 * nombre exacto: hay "Fecha factura", "Fecha factura (mes)", "Fecha prevista de pago (día)" y "Fecha
 * de caja". `resolverColumnas` devolvía `faltan` y esta función `null` — SIEMPRE, desde el primer
 * día—, así que el neteo vivo de las obras futuras nunca se armó: cada corrida del libro imprimía
 * *"no pude resolver las columnas de Compras para el neteo — los importes van PEGADOS"* y seguía. Un
 * importe pegado se cuenta DOS VECES en el instante en que la factura real entra a Compras.
 *
 * Se usa el MISMO rótulo que `scripts/obras-pestana.mjs` para su columna de real acumulado, y eso no
 * es una coincidencia de estilo: si la pestaña OBRAS absorbe una factura y el libro netea contra otra
 * fecha, las dos vistas de la misma obra dejan de coincidir sin que ninguna dé error.
 *
 * NO se usa "Fecha de caja": lo que descuenta la proyección es que la factura ENTRÓ, no que se pagó
 * (la impaga ya proyecta su propia salida por su fila real).
 */
export const ROTULO_FECHA_COMPRAS = 'Fecha factura'

/**
 * LOS CINCO RÓTULOS QUE EL NETEO NECESITA DE COMPRAS, y ninguno más.
 *
 * Los cuatro que ya viven en `NOMBRES_COMPRAS` se importan de ahí —una sola definición: el día que la
 * planilla renombre "Monto Pagado" se renombra en un lugar y los dos lectores se enteran—. La fecha
 * del comprobante se declara acá porque ningún extractor la lee en JS: meterla en `NOMBRES_COMPRAS` la
 * volvería obligatoria para TODOS los lectores de Compras por una fórmula que sólo el neteo emite.
 */
export const ROTULOS_NETEO = Object.freeze({
  proveedor: NOMBRES_COMPRAS.proveedor,
  cliente: NOMBRES_COMPRAS.cliente,
  fecha: ROTULO_FECHA_COMPRAS,
  total: NOMBRES_COMPRAS.importe,
  pagado: NOMBRES_COMPRAS.montoPagado,
})

/**
 * NÚCLEO PURO: las letras del neteo Y LOS RÓTULOS QUE NO APARECIERON, juntos.
 *
 * ═══ POR QUÉ DEVUELVE `faltan` Y NO SÓLO `null` (13/08/2026) ═══
 *
 * El llamador aborta la corrida entera cuando no resuelve, y un aborto que dice *"no pude resolver las
 * columnas"* obliga a abrir la planilla y comparar cinco rótulos a ojo. Con el nombre exacto adentro
 * del mensaje —"Fecha factura"— el arreglo es de un minuto: se mira ESA celda del encabezado. El
 * diagnóstico sale del MISMO cómputo que la resolución, no de una lista paralela que se desincroniza.
 *
 * Se resuelven los cinco rótulos derecho, sin pasar por `columnasDeCompras`: esa exige el mapa
 * COMPLETO de Compras y hacía que un "CUIT (OS)" ausente —que el neteo no usa— apagara el neteo y
 * ahora abortaría el libro por una columna que no le importa.
 *
 * @param {Array<Array>} filas Compras entera (el encabezado real vive en la fila 3)
 * @returns {{cols:{proveedor:string,cliente:string,fecha:string,total:string,pagado:string}|null, faltan:string[]}}
 */
export function neteoDeCompras(filas = []) {
  const { col, faltan } = resolverColumnas(filas?.[2] ?? [], ROTULOS_NETEO)
  return { cols: faltan.length ? null : col, faltan }
}

/**
 * NÚCLEO PURO: las letras que el NETEO de obras futuras necesita de Compras — proveedor, cliente,
 * fecha del comprobante, total y monto pagado — resueltas por rótulo. `null` si falta alguna.
 *
 * Es la forma corta para quien sólo quiere las letras (`deObras` las recibe por parámetro y falla
 * cerrado con null). Quien vaya a PUBLICAR usa `exigirColumnasNeteo`, que aborta con el nombre.
 */
export const columnasNeteoDeCompras = (filas = []) => neteoDeCompras(filas).cols

/**
 * LAS LETRAS DEL NETEO O UN ABORTO CON NOMBRE Y APELLIDO.
 *
 * ═══ DEGRADAR A UN DATO MUERTO ES PEOR QUE FALLAR (13/08/2026) ═══
 *
 * Acá abajo hubo un `console.warn` y la corrida seguía con los importes de obra PEGADOS. Eso no es
 * fallar cerrado: un egreso de obra pegado se cuenta DOS VECES desde el instante en que su factura
 * entra a Compras —la fila real entra al libro por su propia puerta y la proyección sigue entera— y el
 * aviso se pierde entre setenta líneas de log. El libro es la fuente de los tres cuadros con los que
 * se decide: publicar uno con doble conteo conocido es peor que no publicarlo.
 *
 * El mensaje NOMBRA el rótulo que no encontró, que es exactamente lo que hace falta para arreglarlo.
 *
 * @param {Array<Array>} filas Compras entera
 * @returns {{proveedor:string,cliente:string,fecha:string,total:string,pagado:string}}
 */
export function exigirColumnasNeteo(filas = []) {
  const { cols, faltan } = neteoDeCompras(filas)
  if (cols) return cols
  throw new Error('obras futuras: no encontré en el encabezado de Compras (fila 3) '
    + `${faltan.map((n) => `"${n}"`).join(' · ')}. Sin el neteo vivo los egresos proyectados se cuentan `
    + 'dos veces cuando la factura real entra: no escribo el libro.')
}

/**
 * NÚCLEO PURO: el IMPORTE de la fila, vivo cuando el saldo puede cambiar entre corridas.
 *
 * ═══ EL PAGO PARCIAL TAMBIÉN BAJA LA COMPROMETIDA — EN EL ACTO (07/08, textual del dueño) ═══
 *
 * "cuando se pagan los compromisos deben salir de ahí". El estado vivo cubría el pago TOTAL (X pasa
 * a "Pagado" → la fila se promueve a REAL), pero un pago PARCIAL deja la fila en "Pendiente" con el
 * Monto Pagado cargado: el libro seguía mostrando el saldo de la última regeneración, DISPONIBLE
 * bajaba en vivo por el otro camino, y la diferencia se la comía LIBRE. Con el importe como fórmula
 * MAX(0; Total − Monto Pagado), cargar un parcial descuenta la COMPROMETIDA en el mismo instante.
 *
 * SÓLO para la fila cuyo importe de generación ES el saldo puro (`saldoVivo`): una fila partida por
 * cheques en vuelo lleva `debe − enVuelo`, y pisarla con O−T contaría dos veces lo que ya viaja en
 * las cuotas del cheque.
 *
 * @param {{importe:number, signo:number, estado:string, saldoVivo?:boolean, origen:{pestana:string, fila:number|string|null}}} m
 * @param {{estado:string, total:string, montoPagado:string}|null} cols
 * @returns {number|string}
 */
export function celdaImporte(m = {}, cols = null) {
  if (!cols?.total || !cols?.montoPagado) return m?.importe
  if (m?.origen?.pestana !== PESTANA_COMPRAS) return m?.importe
  if (!ESTADOS_VIVOS.includes(m?.estado)) return m?.importe
  if (m?.signo !== -1 || m?.saldoVivo !== true) return m?.importe
  const fila = m?.origen?.fila
  if (!Number.isInteger(fila) || fila < 1) return m?.importe
  return `=MAX(0;N(${PESTANA_COMPRAS}!$${cols.total}$${fila})-N(${PESTANA_COMPRAS}!$${cols.montoPagado}$${fila}))`
}

/**
 * NÚCLEO PURO: lo que va escrito en la columna H de `_MOVIMIENTOS` para este movimiento.
 *
 * Devuelve el estado como TEXTO PLANO en todos los casos salvo uno: la fila que salió de Compras sin
 * pagar, que se va como FÓRMULA VIVA contra la celda que el dueño marca. Para los consumidores no
 * hay diferencia — `terminoLibro` compara `$H:$H="REAL"` y una fórmula rinde su resultado igual que
 * un valor pegado, tanto para las fórmulas del archivo como para el portón, que relee la pestaña con
 * `UNFORMATTED_VALUE` (valores calculados, no el texto de la fórmula).
 *
 * FALLA CERRADO: sin la letra de la columna (no se pudo resolver el encabezado de Compras) devuelve
 * el valor pegado, que es el comportamiento anterior. Nunca escribe una referencia adivinada.
 *
 * @param {{estado:string, origen:{pestana:string, fila:number|string|null}}} m
 * @param {string|null} colEstado la letra de la columna Estado de Compras
 * @returns {string}
 */
export function celdaEstado(m = {}, colEstado = null) {
  const estado = m?.estado
  if (!colEstado || typeof estado !== 'string') return estado
  if (m?.origen?.pestana !== PESTANA_COMPRAS) return estado
  if (!ESTADOS_VIVOS.includes(estado)) return estado
  // Una cuota en cheque trae "457 · cheque 12": no es una fila, y su promoción la decide el extracto.
  const fila = m?.origen?.fila
  if (!Number.isInteger(fila) || fila < 1) return estado
  // Separador `;`: el archivo es es-AR y la coma es el decimal.
  return `=IF(INDEX(${PESTANA_COMPRAS}!$${colEstado}:$${colEstado};${fila})="${MARCA_PAGADO}";"REAL";"${estado}")`
}

/**
 * NÚCLEO PURO: EL CONTROL DEL HUECO. Las filas de Compras que `estaPagada` da por pagadas y que la
 * fórmula NO reconocería, porque la celda trae decoración alrededor de la palabra.
 *
 * No es un error: esas filas ya salen como REAL del generador (la memoria usa `estaPagada`), así que
 * lo único que pierden es la autopromoción entre corridas, y sólo si antes estaban sin pagar. Se
 * mide igual, porque una limitación que nadie cuenta es una limitación que crece sola: el día que la
 * planilla empiece a escribir "✅ Pagado" en esa columna, la corrida lo dice — y no se descubre seis
 * meses después dentro de un descuadre.
 *
 * @param {Array<Array>} filas Compras entera
 * @returns {Array<{fila:number, valor:string}>}
 */
export function estadosDecorados(filas = []) {
  const c = columnasDeCompras(filas)
  const out = []
  for (let i = 3; i < filas.length; i++) {
    const crudo = filas[i]?.[c.estado]
    const t = String(crudo ?? '').trim()
    if (!t || !estaPagada(crudo)) continue
    if (t.toLowerCase() === MARCA_PAGADO.toLowerCase()) continue
    out.push({ fila: i + 1, valor: t })
  }
  return out
}
