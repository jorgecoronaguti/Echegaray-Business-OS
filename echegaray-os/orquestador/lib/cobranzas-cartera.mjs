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
// ⚠ POR QUÉ NO SE USA QUERY NI SORT+UNIQUE, QUE ES LO QUE PEDIRÍA EL MANUAL. Las dos DERRAMAN: una
// sola celda escribe tantas filas como clientes haya. Esta pestaña se escribe con fusión preservadora
// FILA POR FILA, así que un derrame de cinco filas pisa las cinco de abajo y corrompe el bloque
// siguiente sin dar un solo error — y el día que entre un cliente nuevo, el derrame crece y rompe
// otra fila más. Un ranking de altura fija (LARGE + INDEX sobre cinco filas escritas) devuelve UN
// valor por celda: no puede pisar nada, y el "otros" absorbe lo que quede afuera sin perder un peso.
//
// EL DEDUPE ES EL PROBLEMA REAL, y se resuelve sin columnas auxiliares: se arma una clave por fila
// (el cliente si la fila califica, un carácter fijo si no) y sólo sobrevive la PRIMERA aparición de
// cada clave. Las filas que no califican comparten la clave fija, así que sobrevive una sola — y esa
// se anula porque el término se multiplica por la condición.

/** El total por cliente, deduplicado, como array de una sola columna. PURA. */
export function arrayTotalPorCliente(clave = 'pendiente') {
  const cli = rango(COB.cliente)
  const est = rango(COB.estado)
  const cond = `(${est}="${ESTADOS[clave]}")`
  // La clave de dedupe: el cliente cuando la fila califica, "·" cuando no. Nunca vacío: MATCH sobre
  // "" contra celdas realmente vacías da resultados distintos según la fila y el dedupe se rompe.
  const llave = `IF(${cond};${cli};"·")`
  const orden = `(ROW(${cli})-ROW(${COB.pestaña}!$${COB.cliente}$${COB.primera})+1)`
  const total = `SUMIFS(${rango(COB.monto)};${cli};${cli};${est};"${ESTADOS[clave]}")`
  return `ARRAYFORMULA(${cond}*(MATCH(${llave};${llave};0)=${orden})*${total})`
}

/** NÚCLEO PURO: el importe del k-ésimo cliente. Vacío si hay menos de k clientes. */
export function formulaMontoRanking(k, clave = 'pendiente') {
  return `=IFERROR(LARGE(${arrayTotalPorCliente(clave)};${k});"")`
}

/**
 * NÚCLEO PURO: el nombre del cliente cuyo total está en `celdaMonto`.
 * Se busca por el monto ya calculado y no se recalcula el LARGE: la mitad del costo, y las dos celdas
 * de la fila no se pueden contradecir. Ante un empate exacto de dos clientes, INDEX devuelve el
 * primero y las dos filas mostrarían el mismo nombre — está declarado en la nota de la celda.
 */
export function formulaClienteRanking(puesto, celdaMonto, clave = 'pendiente') {
  return `=IF(${celdaMonto}="";"";"${puesto}  "&IFERROR(INDEX(${rango(COB.cliente)};`
    + `MATCH(${celdaMonto};${arrayTotalPorCliente(clave)};0));"(sin nombre)"))`
}
