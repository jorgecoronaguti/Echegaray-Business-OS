// EL ESQUEMA DE PAGO, LEÍDO POR EL PORTAL — `public.esquema_pago` es la fuente, no `pago_programado`.
//
// ═══ POR QUÉ (26/08/2026) ═══
//
// El portal nació con `pago_programado`, una tabla propia. La pantalla 32 de la ficha del cliente ya
// administraba el mismo concepto en `esquema_pago`: administración movía una fecha ahí y el cliente
// seguía viendo la vieja. LA FICHA DEL CLIENTE GANA — el portal lee lo que ella publica.
//
// ═══ EL PREDICADO DE PUBLICACIÓN NO SE INVENTA ACÁ ═══
//
// Está escrito en la policy `esquema_pago_select` de la migración `20260825T1240`: el cliente ve
// `visible_portal AND publicado_at IS NOT NULL`. Se copia tal cual y por eso se copia: el portal
// entra con la clave de servicio —el cliente no tiene usuario de Supabase— y esa clave NO pasa por
// RLS. Si acá el predicado fuera distinto, el portal mostraría exactamente lo que la base le prohíbe
// al mismo cliente cuando entra por el otro camino.
//
// `cambio_pendiente` NO oculta la fila: significa que hay ediciones posteriores a la publicación, y
// la policy no lo mira. Esconder la fila dejaría al cliente sin un pago que ya le fue comunicado.

import type { EstadoPago, Pago, TipoPago } from './cronograma'

/**
 * La fila de `esquema_pago` como llega de la base.
 *
 * `moneda`, `factura_numero` y `recibo_numero` son OPCIONALES en el tipo porque llegan en una
 * migración que todavía no se aplicó. Un tipo que las diera por seguras haría que, el día que
 * falten, el portal sume dólares como pesos sin avisar.
 */
export interface FilaEsquema {
  id: string
  obra_id: string | null
  concepto: string
  fecha: string | null
  neto?: string | number | null
  iva?: string | number | null
  historico?: boolean | null
  monto: number | string | null
  reparo: number | string | null
  estado: string
  medio: string | null
  visible_portal: boolean
  publicado_at: string | null
  cambio_pendiente: boolean
  orden: number
  moneda?: string | null
  factura_numero?: string | null
  recibo_numero?: string | null
}

/** Un pago del portal que sabe de qué obra es. `obraId` `null` = la fila no tiene obra asignada. */
export type PagoConObra = Pago & { obraId: string | null; obraNombre: string }

/** LO QUE EL CLIENTE PUEDE VER. Copia literal de la policy `esquema_pago_select`. Ver arriba. */
export const publicadoAlPortal = (f: Pick<FilaEsquema, 'visible_portal' | 'publicado_at'>): boolean =>
  f.visible_portal === true && f.publicado_at !== null

/**
 * QUÉ CLASE DE PAGO ES. `esquema_pago` no tiene columna `tipo` —la pestaña Cobranzas tampoco— así
 * que sale del `estado` y, en último lugar, del texto que escribió administración.
 *
 * `retenido` ES el fondo de reparo: lo dice el CHECK de la columna («retenido = fondo de reparo
 * esperando recepción definitiva»). La columna `reparo` NO alcanza para marcarlo: ahí vive cuánto se
 * le retiene A UN PAGO, y un certificado con retención sigue siendo un certificado que el cliente
 * debe pagar. Sacarlo de «pendiente» por tener reparo subestimaría la deuda.
 */
export function tipoDelPago(f: Pick<FilaEsquema, 'estado' | 'concepto'>): TipoPago {
  if (f.estado === 'retenido') return 'fondo_reparo'
  if (/anticipo/i.test(f.concepto)) return 'anticipo'
  if (/certificad/i.test(f.concepto)) return 'certificado'
  return 'otro'
}

/**
 * EL ESTADO QUE FIJA LA BASE — que es el que declaró la columna O de Cobranzas.
 *
 * ═══ LA PANTALLA NO PUEDE CONTRADECIR AL SHEET (26/08/2026) ═══
 *
 * El estado se decidía en TRES lugares: el Sheet lo declaraba, el sembrador lo tiraba y volvía a
 * derivarlo de la fecha, y acá se derivaba una tercera vez. El resultado es que la columna O no
 * llegaba nunca al cliente: las filas marcadas «Proyectado» —acordadas y todavía sin facturar— se
 * publicaban con la misma cara que una deuda exigible. Ahora `esquema_pago.estado` ES lo que dice el
 * Sheet, y acá sólo se traduce.
 *
 * `a_vencer` y `vencido` son la ÚNICA excepción, y no es una segunda opinión: son la misma fila con
 * la fecha de un lado o del otro de hoy, el propio Sheet los calcula así en su columna V
 * (`Q<TODAY()`), y la fecha es la palanca que administración mueve en la ficha del cliente. Si acá
 * se leyera el estado guardado, una fecha corrida al futuro dejaría la fila en rojo hasta la próxima
 * corrida del sync. Es la misma decisión que toma `estadoVigente` en la pantalla 32.
 *
 * `retenido` es el fondo de reparo: plata que la empresa retiene, no una deuda que el cliente tenga
 * que pagar. Pintarlo «vencido» porque pasó su fecha le reclamaría algo que nadie le está pidiendo.
 */
export function estadoFijadoDe(f: Pick<FilaEsquema, 'estado'>): EstadoPago | null {
  if (f.estado === 'cobrado') return 'pagado'
  if (f.estado === 'previsto') return 'sin_factura'
  if (f.estado === 'retenido') return 'programado'
  return null
}

/** `numeric` de Postgres llega como string. `null` sigue siendo `null`, nunca 0. */
const aNumero = (v: number | string | null | undefined): number | null =>
  v == null || v === '' ? null : Number(v)

/**
 * Una fila del esquema como la dibuja el portal.
 *
 * `fecha` es UNA sola columna —espejo de la columna Q de Cobranzas— y hace de las dos del portal: es
 * la fecha de cobro cuando el estado es `cobrado` y la prevista en todos los demás casos. Copiarla a
 * las dos a la vez haría que un pago cobrado apareciera además como pendiente.
 *
 * @param obraNombre `''` cuando la fila no tiene obra o su id no resuelve. NO se rellena con un
 *   texto inventado: un rótulo fabricado en una tabla de cobranzas se lee como el nombre real.
 */
export function aPagoDelPortal(f: FilaEsquema, obraNombre: string): PagoConObra {
  const cobrado = f.estado === 'cobrado'
  return {
    id: f.id,
    obraId: f.obra_id,
    obraNombre,
    orden: f.orden,
    tipo: tipoDelPago(f),
    rotulo: f.concepto,
    monto: aNumero(f.monto),
    // El cliente factura con IVA discriminado: un único importe no le sirve para conciliar contra su
    // propia contabilidad. Se publican los tres y la pantalla los muestra juntos.
    neto: aNumero(f.neto),
    iva: aNumero(f.iva),
    historico: f.historico === true,
    // Sin la columna `moneda` (migración sin aplicar) se asume ARS, que es su default declarado.
    moneda: f.moneda === 'USD' ? 'USD' : 'ARS',
    // `esquema_pago` guarda UNA fecha: la del pago. Cuando está cobrado ES la fecha en que se pagó,
    // y también es la que ese pago tenía prevista — no son dos hechos distintos, es el mismo día.
    // Ponerla sólo en `fechaPago` dejaba la columna de fechas del cronograma en «sin fecha» para
    // todo lo ya pagado: el cliente veía su anticipo cobrado sin poder decir cuándo lo pagó.
    fechaPrevista: f.fecha,
    fechaPago: cobrado ? f.fecha : null,
    facturaNumero: f.factura_numero ?? null,
    reciboNumero: f.recibo_numero ?? null,
    // El esquema no guarda la devolución del fondo de reparo: la pantalla 32 no la administra. Se
    // deja en null en vez de derivarla de la fecha, que sería inventar un compromiso con el cliente.
    devolucionEn: null,
    devueltoEn: null,
    estadoFijado: estadoFijadoDe(f),
  }
}

/**
 * TODO LO QUE ESTE ACCESO PUEDE VER DEL ESQUEMA, ya ordenado.
 *
 * `orden` primero y `fecha` de desempate: es el mismo criterio de `getEsquema` en la pantalla 32, y
 * ordenar distinto haría que administración y el cliente leyeran el plan en dos secuencias.
 *
 * @param alcanza qué obras abre este acceso. Se aplica ACÁ y no en el `where`: el filtro por obra es
 *   una decisión de permiso y tiene que poder probarse sin base.
 */
export function pagosDelEsquema(
  filas: FilaEsquema[],
  nombres: Map<string, string>,
  alcanza: (obraId: string | null) => boolean,
): PagoConObra[] {
  return filas
    .filter((f) => publicadoAlPortal(f) && alcanza(f.obra_id))
    .sort((a, b) => a.orden - b.orden || (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999'))
    .map((f) => aPagoDelPortal(f, (f.obra_id ? nombres.get(f.obra_id) : null) ?? ''))
}

/**
 * SEGUNDA CERRADURA DE `puede_ver_montos`: el importe NO SALE de la capa de datos.
 *
 * Las pantallas ya no dibujan ni una columna de plata cuando el acceso no la tiene, y aun así el
 * monto se retira acá. No es redundancia decorativa: la pantalla se cambia todos los días y basta
 * un `pesos(p.monto)` distraído en una fila nueva para publicarle a un contacto del cliente lo que
 * su empresa está pagando. Si el dato no viajó, no hay nada que se pueda escapar.
 *
 * Se pone en `null`, NO en 0. Cero afirma que no vale nada; null es «acá no hay dato para vos», y
 * la pantalla que lo recibe no imprime ningún número.
 */
export const sinImportes = (pagos: PagoConObra[]): PagoConObra[] =>
  // NETO E IVA TAMBIÉN SON PLATA. Retirar sólo el total dejaba el importe publicado en la columna de
  // al lado a un contacto que justamente no puede verlo.
  pagos.map((p) => ({ ...p, monto: null, neto: null, iva: null }))

export interface BloqueDeObra {
  /** `null` = las filas que el esquema dejó sin obra. */
  obraId: string | null
  nombre: string
  pagos: PagoConObra[]
}

export const SIN_OBRA = 'Sin obra asignada'

/**
 * LOS PAGOS AGRUPADOS POR OBRA, con las filas sin obra en su propio bloque y al final.
 *
 * `esquema_pago` es POR CLIENTE y su `obra_id` es opcional: hay pagos acordados con el cliente que
 * no cuelgan de ninguna obra todavía. Descartarlos escondería plata comprometida, y repartirlos
 * entre las obras inventaría a cuál pertenece cada uno. Van juntos, dichos como lo que son.
 */
export function agruparPorObra(pagos: PagoConObra[]): BloqueDeObra[] {
  const bloques = new Map<string, BloqueDeObra>()
  for (const p of pagos) {
    // Una obra cuyo id no resolvió a nombre cae en el mismo bloque que las que no tienen obra: el
    // portal no puede nombrarla, y un bloque con título vacío no le dice nada al cliente.
    const clave = p.obraId && p.obraNombre ? p.obraId : ' sin-obra'
    const previo = bloques.get(clave)
    if (previo) previo.pagos.push(p)
    else bloques.set(clave, { obraId: clave === ' sin-obra' ? null : p.obraId, nombre: p.obraNombre || SIN_OBRA, pagos: [p] })
  }
  return [...bloques.values()].sort(
    (a, b) => Number(a.obraId === null) - Number(b.obraId === null) || a.nombre.localeCompare(b.nombre, 'es'),
  )
}

/**
 * EL CONTRATO DEL CLIENTE ES LA SUMA DE LOS DE SUS OBRAS — y `null` si falta alguno.
 *
 * Sumar los que están y callar los que no daría un contrato más chico que el real, presentado con la
 * misma cara de dato cierto. Prefiere no decir nada antes que decir un número al que le falta una obra.
 *
 * Un bloque sin obra (`obraId === null`) NO tiene contra qué contrato compararse: alcanza para que
 * todo el conjunto no lo tenga.
 */
export function contratoDelConjunto(bloques: BloqueDeObra[], contratos: Map<string, number | null>): number | null {
  // EL CONTRATO ES DE LAS OBRAS, NO DE LOS PAGOS (26/08/2026). Antes bastaba UN bloque sin obra para
  // devolver `null`, y desde que los cobros que no nombran obra se publican —«Saldo obras San
  // Francisco», «de todas las obras»— ese bloque existe casi siempre: el portal escribía «CONTRATO
  // sin cargar» a un cliente cuyo contrato la ficha muestra en $299,68 M. Que un COBRO no tenga obra
  // no dice nada sobre cuánto se contrató.
  //
  // Lo que sí lo anula sigue en pie: una OBRA sin contrato cargado. Sumar las que están y callar la
  // que falta daría un contrato más chico que el real con cara de dato cierto.
  const conObra = bloques.filter((b) => b.obraId !== null)
  if (!conObra.length) return null
  let total = 0
  for (const b of conObra) {
    const c = contratos.get(b.obraId as string)
    if (c == null) return null
    total += c
  }
  return total
}
