// D08 · CUÁNTO SE LE PAGÓ A UN PROVEEDOR CON EFECTIVO DE OBRA, Y POR MANO DE QUIÉN.
//
// La pregunta que contesta esta pantalla no es contable, es de proceso: si a un proveedor se le paga
// el 14 % de lo que se le compra con plata que alguien llevó en el bolsillo, esa es plata que sale de
// la caja física, que no pasa por el banco y que depende de que una persona rinda un ticket. Saberlo
// cambia una decisión concreta —abrirle cuenta corriente, pagarle por transferencia, o seguir así—.
//
// ═══ EL PORCENTAJE NO SE DIBUJA SIEMPRE ═══
//
// Es `rendido / comprado`, y las dos cifras tienen que venir de la MISMA lectura de Compras. Sin
// `comprado` —o con `comprado` en cero, que pasa cuando la ficha no pudo leer la pestaña— el
// porcentaje no existe: NO es 0 % ni 100 %. Devuelve `null` y la pantalla no lo escribe (regla de
// oro 2: una estimación no se presenta como hecho, y un cero fabricado es peor que un hueco).
//
// ═══ LA CUENTA ES DEL MONTO RENDIDO, NO DEL TOTAL DE LA COMPRA ═══
//
// `monto_rendido` es lo que esa entrega puso sobre esa fila de Compras al imputarla. Puede ser menor
// que el total del comprobante —una compra pagada mitad en efectivo y mitad por transferencia—, y
// sumar el total inflaría lo que salió de la caja.

export type EfectivoRendidoDelProveedor = {
  clave: string | null
  fecha: string | null
  comprobante: string | null
  concepto: string | null
  monto_rendido: number | string | null
  entrega: string | null
  obra: string | null
  rindio: string | null
}

export type ResumenEfectivoProveedor = {
  /** Lo que salió de la caja física para este proveedor. `null` si no hay ninguna compra rendida. */
  rendido: number | null
  /** Cuántas compras suyas se pagaron así. */
  comprobantes: number
  /** `rendido / comprado`, en porcentaje entero. `null` cuando no se puede calcular. */
  porcentaje: number | null
  /** Quiénes llevaron esa plata, sin repetir y en orden de aparición. */
  manos: string[]
}

const numero = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

export function resumirEfectivoDelProveedor(
  filas: EfectivoRendidoDelProveedor[], comprado: number | null,
): ResumenEfectivoProveedor {
  if (filas.length === 0) return { rendido: null, comprobantes: 0, porcentaje: null, manos: [] }
  const rendido = filas.reduce((a, f) => a + numero(f.monto_rendido), 0)
  const manos: string[] = []
  for (const f of filas) {
    const n = f.rindio?.trim()
    if (n && !manos.includes(n)) manos.push(n)
  }
  // SIN `comprado` NO HAY PORCENTAJE. Dividir por cero, o por null tratado como cero, escribe en la
  // pantalla un número que nadie midió.
  const porcentaje = comprado !== null && comprado > 0 ? Math.round((rendido / comprado) * 100) : null
  return { rendido, comprobantes: filas.length, porcentaje, manos }
}

/**
 * La entrega de cada compra, por clave de fila: es lo que deja a la lista de Compras ganar la columna
 * «Entrega» sin una segunda consulta por fila. Una compra puede haber sido rendida por MÁS DE UNA
 * entrega (dos personas ponen plata sobre el mismo comprobante); en ese caso lleva las dos, porque
 * quedarse con la primera escondería la mitad de la plata.
 */
export function entregaPorClave(filas: EfectivoRendidoDelProveedor[]): Record<string, string[]> {
  const mapa: Record<string, string[]> = {}
  for (const f of filas) {
    if (!f.clave || !f.entrega) continue
    const ya = mapa[f.clave] ?? (mapa[f.clave] = [])
    if (!ya.includes(f.entrega)) ya.push(f.entrega)
  }
  return mapa
}

/** El título del dato: «14 % de lo comprado · 11 comprobantes · R. Sosa, D. Funes». */
export function tituloDelEfectivo(r: ResumenEfectivoProveedor): string | undefined {
  if (r.rendido === null) return undefined
  const partes = [
    r.porcentaje === null ? null : `${r.porcentaje} % de lo comprado`,
    `${r.comprobantes} ${r.comprobantes === 1 ? 'comprobante' : 'comprobantes'}`,
    r.manos.length === 0 ? null : r.manos.join(', '),
  ].filter(Boolean)
  return partes.join(' · ')
}
