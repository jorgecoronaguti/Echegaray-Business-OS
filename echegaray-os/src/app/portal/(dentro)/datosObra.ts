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
    .select('id, orden, tipo, rotulo, monto, fecha_prevista, fecha_pago, factura_numero, recibo_numero, devolucion_en, devuelto_en, estado')
    .eq('obra_id', obraId).order('orden')
  return (data ?? []).map((r) => ({
    id: String(r.id),
    orden: Number(r.orden),
    tipo: r.tipo as Pago['tipo'],
    rotulo: String(r.rotulo),
    monto: r.monto == null ? null : Number(r.monto),
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
