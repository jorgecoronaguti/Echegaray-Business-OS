import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Pago } from '../cronograma'

// LO QUE SE LE PREGUNTA A LA BASE POR UNA OBRA. Una sola vez, para las tres pantallas de plata.

export type ObraDetalle = {
  id: string
  nombre: string
  contrato: number | null
  fechaInicio: string | null
  fechaCierre: string | null
  estado: string
  driveCarpetaId: string | null
}

export async function obraDetalle(obraId: string): Promise<ObraDetalle | null> {
  const { data } = await createAdminClient()
    .from('obras')
    .select('id, nombre, monto_contratado, fecha_inicio, fecha_cierre, estado, drive_carpeta_id')
    .eq('id', obraId).maybeSingle()
  if (!data) return null
  return {
    id: String(data.id),
    nombre: String(data.nombre),
    // `monto_contratado` puede no estar: NULL no es cero, y la pantalla lo dice.
    contrato: data.monto_contratado == null ? null : Number(data.monto_contratado),
    fechaInicio: data.fecha_inicio ?? null,
    fechaCierre: data.fecha_cierre ?? null,
    estado: String(data.estado),
    driveCarpetaId: data.drive_carpeta_id ?? null,
  }
}

export async function pagosDeObra(obraId: string): Promise<Pago[]> {
  const { data } = await createAdminClient()
    .from('pago_programado')
    .select('id, orden, tipo, rotulo, monto, moneda, fecha_prevista, fecha_pago, factura_numero, recibo_numero, devolucion_en, devuelto_en, estado')
    .eq('obra_id', obraId).order('orden')
  return (data ?? []).map((r) => ({
    id: String(r.id),
    orden: Number(r.orden),
    tipo: r.tipo as Pago['tipo'],
    rotulo: String(r.rotulo),
    monto: r.monto == null ? null : Number(r.monto),
    moneda: (r.moneda === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
    fechaPrevista: r.fecha_prevista ?? null,
    fechaPago: r.fecha_pago ?? null,
    facturaNumero: r.factura_numero ?? null,
    reciboNumero: r.recibo_numero ?? null,
    devolucionEn: r.devolucion_en ?? null,
    devueltoEn: r.devuelto_en ?? null,
    estadoFijado: (r.estado as Pago['estadoFijado']) ?? null,
  }))
}

/** Hoy, en la zona de San Juan. Comparar contra UTC corre el vencimiento tres horas. */
export function hoyEnObra(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

// ── LAS OBRAS DE UN CLIENTE, DE UNA VEZ ──────────────────────────────────────────────────────
//
// El portal muestra TODAS las obras del cliente juntas. Pedirlas de a una es una consulta por obra en
// cada pantalla: con cuatro obras son cuatro viajes a la base para dibujar una lista.

/** Un pago con la obra a la que pertenece: sin esto, juntar cuatro cronogramas pierde de cuál es cada fila. */
export type PagoConObra = Pago & { obraId: string; obraNombre: string }

export async function obrasDetalle(obraIds: string[]): Promise<ObraDetalle[]> {
  if (!obraIds.length) return []
  const { data } = await createAdminClient()
    .from('obras')
    .select('id, nombre, monto_contratado, fecha_inicio, fecha_cierre, estado, drive_carpeta_id')
    .in('id', obraIds)
  return (data ?? []).map((d) => ({
    id: String(d.id),
    nombre: String(d.nombre),
    // `monto_contratado` puede no estar: NULL no es cero, y la pantalla lo dice.
    contrato: d.monto_contratado == null ? null : Number(d.monto_contratado),
    fechaInicio: d.fecha_inicio ?? null,
    fechaCierre: d.fecha_cierre ?? null,
    estado: String(d.estado),
    driveCarpetaId: d.drive_carpeta_id ?? null,
  }))
}

/** Los cronogramas de varias obras en UNA consulta, indexados por obra. */
export async function pagosDeObras(obras: { id: string; nombre: string }[]): Promise<Map<string, PagoConObra[]>> {
  const porObra = new Map<string, PagoConObra[]>()
  for (const o of obras) porObra.set(o.id, [])
  if (!obras.length) return porObra

  const { data } = await createAdminClient()
    .from('pago_programado')
    .select('id, obra_id, orden, tipo, rotulo, monto, moneda, fecha_prevista, fecha_pago, factura_numero, recibo_numero, devolucion_en, devuelto_en, estado')
    .in('obra_id', obras.map((o) => o.id))
    .order('orden')

  const nombre = new Map(obras.map((o) => [o.id, o.nombre]))
  for (const r of data ?? []) {
    const obraId = String(r.obra_id)
    porObra.get(obraId)?.push({
      id: String(r.id),
      obraId,
      obraNombre: nombre.get(obraId) ?? '',
      orden: Number(r.orden),
      tipo: r.tipo as Pago['tipo'],
      rotulo: String(r.rotulo),
      monto: r.monto == null ? null : Number(r.monto),
      moneda: (r.moneda === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
      fechaPrevista: r.fecha_prevista ?? null,
      fechaPago: r.fecha_pago ?? null,
      facturaNumero: r.factura_numero ?? null,
      reciboNumero: r.recibo_numero ?? null,
      devolucionEn: r.devolucion_en ?? null,
      devueltoEn: r.devuelto_en ?? null,
      estadoFijado: (r.estado as Pago['estadoFijado']) ?? null,
    })
  }
  return porObra
}
