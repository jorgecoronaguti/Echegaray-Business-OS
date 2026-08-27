// EL ORDEN DE LOS COMPROBANTES — facturas y recibos, por su número y no por su texto.
//
// ═══ POR QUÉ NO ALCANZA CON ORDENAR EL STRING (27/08/2026) ═══
//
// «Las facturas y los recibos salen desordenados.» Salían: la pantalla de Facturas las dibujaba en
// el orden en que aparecían en el cronograma —por `orden` de la línea, después por fecha— así que a
// Inter Motor le publicaba 201, 228, 211. Y ordenar el texto tampoco alcanza, porque administración
// no tipea el número siempre igual: en la misma tabla conviven `FA 01-00000201`, `FA 01-0000202`
// (un dígito menos de relleno) y `FA 219` (sin punto de venta). Alfabéticamente `FA 01-00000228`
// cae ANTES que `FA 01-0000202` —compara el noveno carácter, `0` contra `2`— y `FA 219` cae después
// de todas las que sí escriben el punto de venta. El número tiene que salir como número.
//
// ═══ QUÉ ES EL «NÚMERO» DE UN COMPROBANTE ═══
//
// En ARCA un comprobante se identifica por punto de venta + número (`0003-00001234`). Los dos
// campos se leen y los dos ordenan, pero el que manda es el NÚMERO: en los datos reales de
// Echegaray hay un solo punto de venta (01) y tres filas lo omiten al tipearlo. Poniendo el punto de
// venta primero, esas tres —219, 220 y 53— saltarían al principio de la lista, separadas de su
// propia serie. El punto de venta desempata; no encabeza.

/** Punto de venta y número de un comprobante. `puntoDeVenta` `null` = el texto no lo declara. */
export type NumeroDeComprobante = { puntoDeVenta: number | null; numero: number }

/** `0003-00001234`, `01_00000220`… la ÚLTIMA pareja gana: el nombre que pone ARCA es
 *  `CUIT_tipo_puntoDeVenta_numero` y las dos primeras no son lo que se busca. */
const PAREJA = /(\d{1,5})[-_](\d{1,10})(?!\d)/g
/** Sin pareja, el último grupo de dígitos: `FA 219` declara el número y nada más. */
const SUELTO = /(\d{1,10})(?!\d)/g

/** El último resultado de una expresión global, o `null`. */
function ultimo(texto: string, re: RegExp): RegExpExecArray | null {
  re.lastIndex = 0
  let m: RegExpExecArray | null = null
  for (let x = re.exec(texto); x; x = re.exec(texto)) m = x
  return m
}

/**
 * EL NÚMERO DE UNA FACTURA, leído de como la escribió administración.
 *
 * `null` cuando el texto no trae ningún número: `FA ANTICIPO FINANCIERO.pdf` existe y no se le puede
 * inventar una posición en la serie. La extensión del archivo se saca antes de mirar, para que
 * `.pdf` no aporte dígitos que no son del comprobante.
 */
export function numeroDeFactura(texto: string | null | undefined): NumeroDeComprobante | null {
  const limpio = String(texto ?? '').replace(/\.[a-z0-9]{1,5}$/i, '')
  const pareja = ultimo(limpio, PAREJA)
  if (pareja) return { puntoDeVenta: Number(pareja[1]), numero: Number(pareja[2]) }
  const suelto = ultimo(limpio, SUELTO)
  return suelto ? { puntoDeVenta: null, numero: Number(suelto[1]) } : null
}

/**
 * EL NÚMERO DE UN RECIBO — y `null` cuando lo que sigue a la palabra es una FECHA.
 *
 * Los archivos de Drive se llaman `Recibo 12.pdf`, `RECIBO 10 - 30:6:26.pdf`… y también
 * `RECIBO 22:9.pdf`, que NO es el recibo 22: es el recibo del 22/9. Sacar «el primer número» los
 * mezclaría en la misma serie y publicaría el recibo 27 (que es 27/10) detrás del 11. Los dígitos
 * seguidos de `:` o `/` son un día, no un número de comprobante, y por eso quedan sin número: la
 * pantalla los ordena por fecha, que es lo único que ese nombre declara.
 */
export function numeroDeRecibo(titulo: string | null | undefined): number | null {
  const m = /recibo\s*n?[°ºo]?\s*(\d{1,6})(?![\d:/])/i.exec(String(titulo ?? ''))
  return m ? Number(m[1]) : null
}

/**
 * FACTURAS EN ORDEN DE SERIE, ascendente.
 *
 * Las que no declaran número van al final —no al principio— y entre ellas por su texto: sin número
 * no hay lugar en la serie, y ponerlas primero las haría pasar por las más viejas.
 */
export function porNumeroDeFactura<T extends { facturaNumero: string | null }>(a: T, b: T): number {
  const x = numeroDeFactura(a.facturaNumero)
  const y = numeroDeFactura(b.facturaNumero)
  if (!x || !y) return Number(!x) - Number(!y) || (a.facturaNumero ?? '').localeCompare(b.facturaNumero ?? '', 'es')
  return x.numero - y.numero || (x.puntoDeVenta ?? 0) - (y.puntoDeVenta ?? 0)
}

/**
 * RECIBOS EN ORDEN DE SERIE, ascendente, y los que no la declaran después por fecha.
 *
 * Es el mismo criterio que las facturas y la misma razón: el cliente busca «el recibo 12», no «el
 * séptimo de la lista». Los que sólo tienen fecha en el nombre van al final, en orden cronológico,
 * y los que no tienen ni número ni fecha después de todo — no se les inventa un lugar.
 */
export function porNumeroDeRecibo<T extends { titulo: string; fecha: string | null }>(a: T, b: T): number {
  const x = numeroDeRecibo(a.titulo)
  const y = numeroDeRecibo(b.titulo)
  if (x != null && y != null) return x - y
  if (x != null || y != null) return Number(x == null) - Number(y == null)
  if (!a.fecha || !b.fecha) return Number(!a.fecha) - Number(!b.fecha) || a.titulo.localeCompare(b.titulo, 'es')
  return a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo, 'es')
}
