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
 * EL ESTADO QUE FIJA LA BASE, y sólo cuando fija algo que la fecha no puede decir.
 *
 * `a_vencer` y `vencido` NO se fijan: son la misma fila con la fecha de un lado o del otro de hoy, y
 * `estadoDePago` los deriva de la fecha —que es la palanca que administración acaba de mover—. Es la
 * misma decisión que ya toma `estadoVigente` en la pantalla 32; tomarla distinto acá haría que la
 * ficha y el portal pintaran de dos colores la misma fila.
 *
 * `previsto` sí se fija: es «acordado pero todavía sin emitir», y una fecha pasada de algo que
 * nosotros no facturamos no es una mora del cliente.
 */
export function estadoFijadoDe(f: Pick<FilaEsquema, 'estado'>): EstadoPago | null {
  return f.estado === 'previsto' ? 'sin_factura' : null
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
  pagos.map((p) => ({ ...p, monto: null }))

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
