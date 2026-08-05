// LA CARTERA POR COBRAR, LEÍDA COMO LA LEE UN TESORERO — no como "todo lo que no dice Cobrado".
//
// ═══ POR QUÉ EXISTE (05/08/2026) ═══
//
// La columna Estado de `Cobranzas` tiene CINCO valores, no dos. Medido el 05/08:
//
//   Cobrado      45 filas   $441.507.276   ya está adentro del saldo del banco
//   Pendiente    38 filas   $345.200.985   facturado y no cobrado: la cartera de verdad
//   Proyectado    3 filas     $6.075.303   ARCOR al 30/09 — todavía no hay factura
//   Facturado     1 fila      $1.391.500   emitida, sin fecha de cobro comprometida
//   CANCELAR      1 fila              $0   IMOTOR/San Francisco: no se va a cobrar nunca
//
// El filtro que había en el archivo —"todo lo que no dice Cobrado ni Endosado"— mete las cuatro
// restantes en la misma bolsa. Hoy no cuesta plata porque la fila CANCELAR está en $0, pero es una
// bomba con la espoleta puesta: el día que alguien cancele una factura de $20M con importe cargado,
// el calendario de caja la va a seguir esperando como ingreso y el piso va a mentir hacia arriba —
// que es el error caro. Y "Endosado" no existe en esa columna: es una exclusión muerta desde hace
// semanas, o sea que nadie estaba mirando esta lista.
//
// LA REGLA DE LA SKILL DE TESORERÍA, LITERAL: nunca se suman dos categorías distintas en la misma
// columna sin distinguirlas. Por eso acá NO hay una constante "lo que falta cobrar": hay cinco
// estados con nombre, y cada cuadro elige explícitamente cuáles usa y lo dice en su rótulo.
//
// ═══ Y FALLA CERRADO CON AVISO, NO EN SILENCIO ═══
//
// Una lista blanca de estados tiene un riesgo propio: el día que alguien tipee un sexto valor, esas
// filas dejan de contarse y nadie se entera. Por eso `formulaEstadoDesconocido` publica en la propia
// pestaña cuántas filas tienen un estado que el OS no conoce. Una lista blanca sin ese contador es
// peor que la lista negra que reemplaza.

/** Dónde vive cada cosa en la pestaña `Cobranzas`. Se lee, NUNCA se escribe: es fuente. */
export const COB = {
  pestaña: 'Cobranzas',
  primera: 5,
  ultima: 400,
  cliente: 'G',
  monto: 'M',
  estado: 'O',
  fecha: 'Q',
}

/** Los cinco estados reales de la columna O, con el texto EXACTO que está cargado en el Sheet. */
export const ESTADOS = {
  cobrado: 'Cobrado',
  pendiente: 'Pendiente',
  proyectado: 'Proyectado',
  facturado: 'Facturado',
  cancelado: 'CANCELAR',
}

/**
 * Los estados en los que la plata TODAVÍA SE ESPERA. Cada uno con su grado de certeza, y por eso
 * cada cuadro los muestra en su propia fila en vez de sumarlos.
 *
 * `cancelado` NO está y ésa es la corrección: una factura cancelada no es un ingreso futuro.
 * `cobrado` tampoco: ya está adentro del saldo del banco, sumarla sería contarla dos veces.
 */
export const ESPERADOS = ['pendiente', 'facturado', 'proyectado']

/** El rango absoluto de una columna de Cobranzas. PURA. */
export const rango = (col) => `${COB.pestaña}!$${col}$${COB.primera}:$${col}$${COB.ultima}`

/**
 * NÚCLEO PURO: la condición SUMPRODUCT de "la fila está en alguno de estos estados".
 * Se suman las pertenencias, no los importes: `(O="a")+(O="b")` da 1 en las filas que califican.
 * @param {Array<string>} claves claves de ESTADOS
 */
export const esAlgunoDe = (claves) =>
  `(${claves.map((k) => `(${rango(COB.estado)}="${ESTADOS[k]}")`).join('+')}>0)`

/** NÚCLEO PURO: el importe de la fila, con las celdas no numéricas en cero. */
export const importe = () => `IF(ISNUMBER(${rango(COB.monto)});${rango(COB.monto)};0)`

/**
 * NÚCLEO PURO: el total de un solo estado, opcionalmente acotado por fecha de cobro.
 * @param {string} clave clave de ESTADOS
 * @param {{hasta?:string, desde?:string}} ventana expresiones es-AR; límites EXCLUYENTES
 */
export function formulaTotalEstado(clave, { desde = null, hasta = null } = {}) {
  const cond = [`(${rango(COB.estado)}="${ESTADOS[clave]}")`]
  if (desde || hasta) cond.push(`ISNUMBER(${rango(COB.fecha)})`)
  if (desde) cond.push(`(${rango(COB.fecha)}>=${desde})`)
  if (hasta) cond.push(`(${rango(COB.fecha)}<${hasta})`)
  return `=SUMPRODUCT(${cond.join('*')}*${importe()})`
}

/** NÚCLEO PURO: cuántas filas hay en ese estado y ventana. Un monto sin cantidad no se puede auditar. */
export function formulaCantidadEstado(clave, { desde = null, hasta = null } = {}) {
  const cond = [`(${rango(COB.estado)}="${ESTADOS[clave]}")`]
  if (desde || hasta) cond.push(`ISNUMBER(${rango(COB.fecha)})`)
  if (desde) cond.push(`(${rango(COB.fecha)}>=${desde})`)
  if (hasta) cond.push(`(${rango(COB.fecha)}<${hasta})`)
  return `=SUMPRODUCT(${cond.join('*')}*1)`
}

/**
 * NÚCLEO PURO: cuántas filas tienen un estado que el OS NO conoce.
 *
 * Es el precio de usar una lista blanca, y hay que pagarlo a la vista. Si esta celda deja de dar
 * cero, hay plata en Cobranzas que ningún cuadro de esta pestaña está sumando.
 */
export function formulaEstadoDesconocido() {
  const conocidos = Object.values(ESTADOS).map((v) => `(${rango(COB.estado)}="${v}")`).join('+')
  return `=SUMPRODUCT((${rango(COB.estado)}<>"")*((${conocidos})=0)*1)`
}

/**
 * NÚCLEO PURO: la fecha del ÚLTIMO cobro efectivamente registrado.
 *
 * SIN ESTO, UN CERO MIENTE. "No hay nada vencido sin conciliar" y "hace tres semanas que nadie carga
 * un cobro" se dibujan igual: cero. Esta fecha es lo que distingue una cosa de la otra, y por eso el
 * bloque de vencidos la muestra al lado del total en vez de festejar el cero.
 */
export function formulaUltimoCobroRegistrado() {
  return `=IFERROR(MAX(IF((${rango(COB.estado)}="${ESTADOS.cobrado}")*ISNUMBER(${rango(COB.fecha)});${rango(COB.fecha)}));"")`
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CONCENTRACIÓN POR CLIENTE — UN RANKING QUE NO DERRAMA
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ═══ ME CORRIJO SOBRE LA VERSIÓN DEL 05/08 DE LA MAÑANA, Y ESTABA MAL EN PANTALLA ═══
//
// La primera versión evitaba QUERY con este argumento: "QUERY, SORT y UNIQUE DERRAMAN; esta pestaña se
// escribe con fusión preservadora fila por fila, así que un derrame de cinco filas pisa las cinco de
// abajo". El riesgo es real y está bien identificado. La conclusión no: **una función que devuelve un
// array sólo derrama si NADIE la consume.** `INDEX(QUERY(…);k;2)` devuelve UN valor — INDEX consume el
// array— y no puede pisar una celda. Este mismo archivo ya lo usa así, en producción, en
// `cash-flow-tesoreria.mjs`, para el mismo ranking sobre la misma pestaña.
//
// Y la alternativa que se eligió para no usar QUERY NO FUNCIONA. Era:
//
//     ARRAYFORMULA( (O="Pendiente") * (MATCH(clave;clave;0)=fila) * SUMIFS(M;G;G;O;"Pendiente") )
//
// **SUMIFS no se vectoriza adentro de ARRAYFORMULA.** SUMIF sí acepta un criterio en forma de array;
// SUMIFS no. Con un criterio array devuelve un escalar o un error, y el LARGE de arriba se comía el
// #VALUE! con su IFERROR: las cinco filas del ranking salieron VACÍAS en el Sheet real, con el total
// intacto en $345.200.985 y la fila "Los demás clientes" absorbiéndolo entero. O sea el defecto exacto
// que este bloque existía para evitar: una línea muda de trescientos cuarenta y cinco millones.
//
// No dio ningún error visible. Lo encontró el render de la pestaña escrita, no un test — y por eso el
// test de abajo ahora prohíbe el patrón `SUMIFS` dentro de `ARRAYFORMULA`, que es la causa y no el
// síntoma.
//
// LA REGLA QUE QUEDA: no se prohíbe QUERY, se exige que esté CONSUMIDA. Un array que entra a INDEX, a
// LARGE o a SUM no derrama; uno que queda solo en la celda, sí.

/** El rango que ve la consulta. G=Col1 … M=Col7 … O=Col9. Si cambia el orden de columnas de Cobranzas
 *  esto se rompe FUERTE (da otro número, no un error), y por eso vive al lado del mapa COB. */
const Q_RANGO = `${COB.pestaña}!$${COB.cliente}$${COB.primera}:$${COB.estado}$${COB.ultima}`
/** Sin el label vacío, QUERY agrega una fila de encabezado para la columna agregada y el ranking se
 *  corre un puesto: el primer cliente desaparecería sin dar error. */
const Q_LABEL = "label sum(Col7) ''"

/**
 * NÚCLEO PURO: el ranking de clientes por total en un estado, agrupado y ordenado.
 *
 * Devuelve la CONSULTA, no la celda: siempre tiene que entrar a un INDEX. Sola en una celda derrama.
 * `Col1 is not null` deja afuera las filas sin cliente, que si no se agrupan todas en un mismo bucket
 * anónimo y pueden ganarle el primer puesto a un cliente real.
 */
export function consultaPorCliente(clave = 'pendiente') {
  const estado = String(ESTADOS[clave]).replace(/'/g, "''")
  return `QUERY(${Q_RANGO};"select Col1,sum(Col7) where Col9 = '${estado}' and Col1 is not null`
    + ` group by Col1 order by sum(Col7) desc ${Q_LABEL}";0)`
}

/** NÚCLEO PURO: el importe del k-ésimo cliente. Vacío si hay menos de k clientes. */
export function formulaMontoRanking(k, clave = 'pendiente') {
  return `=IFERROR(INDEX(${consultaPorCliente(clave)};${k};2);"")`
}

/**
 * NÚCLEO PURO: el nombre del k-ésimo cliente.
 *
 * SALE DEL MISMO PUESTO QUE EL IMPORTE, no de buscar ese importe en la lista. La versión anterior
 * hacía `MATCH(importe; array; 0)` para ahorrarse una consulta, y con eso dos clientes empatados en el
 * mismo total mostraban el mismo nombre en dos filas. Ir por el puesto no puede empatar.
 *
 * La fila igual se apaga si no hay importe: sin plata no hay nombre, y una fila a medias se lee como
 * un dato roto.
 */
export function formulaClienteRanking(puesto, k, celdaMonto, clave = 'pendiente') {
  return `=IF(${celdaMonto}="";"";"${puesto}  "&IFERROR(INDEX(${consultaPorCliente(clave)};${k};1);"(sin nombre)"))`
}
