// LA ESCRITURA DEL CONTRATO DE ALTA: lee los orígenes, decide (contratoDeAlta.ts) y siembra.
//
// `obra_contrato` no tiene GRANT de escritura para `authenticated` (sólo `service_role`): la única
// puerta es `fijar_contrato_obra()`, que lleva `ve_economia()` adentro y NO pisa una fila ya cargada
// (una carga manual desde el papel vale más que este pase automático). Por eso acá no hay upsert.
//
// No es un archivo `'use server'`: lo llaman las acciones del alta, con su propio cliente.

import type { SupabaseClient } from '@supabase/supabase-js'
import { invalidarFichaCliente } from '@/features/clientes/services/invalidarFicha'
import {
  decidirContratoDeAlta, type OrdenDeCompra, type PresupuestoAprobado,
} from './contratoDeAlta'

export type ResultadoSiembra =
  | { estado: 'creado' | 'ya_estaba' }
  /** No se escribió nada y `motivo` dice por qué; la pantalla lo muestra, no se calla. */
  | { estado: 'sin_precio'; motivo: string }

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

/**
 * NUNCA lanza ni devuelve error a la acción: la obra ya existe y el contrato es un complemento. Lo
 * que no se pudo se dice en `sin_precio.motivo` (incluido un error de lectura o de la RPC), porque
 * callar dejaría la obra sin precio y nadie sabría por qué.
 */
export async function sembrarContratoDeObra(
  supabase: SupabaseClient, obraId: string, clienteId: string | null,
): Promise<ResultadoSiembra> {
  const { data: yaHay, error: eYa } = await supabase.from('obra_contrato').select('obra_id').eq('obra_id', obraId).maybeSingle()
  if (eYa) return { estado: 'sin_precio', motivo: `No se pudo mirar el contrato: ${eYa.message}` }
  if (yaHay) return { estado: 'ya_estaba' }

  const [pres, ocs] = await Promise.all([
    supabase.from('presupuestos').select('id, version, monto_presupuestado, moneda_original')
      .eq('obra_canonica_id', obraId).eq('estado', 'aprobado'),
    supabase.from('cliente_orden').select('id, numero, importe, moneda, importe_es_neto, drive_file_id, nombre_archivo')
      .eq('obra_id', obraId).eq('tipo', 'orden_compra').is('eliminado_en', null),
  ])
  if (pres.error || ocs.error) {
    return { estado: 'sin_precio', motivo: `No se pudo leer el origen del precio: ${(pres.error ?? ocs.error)?.message}` }
  }
  const aprobados: PresupuestoAprobado[] = (pres.data ?? []).map((p) => ({
    id: String(p.id), version: num(p.version), monto: num(p.monto_presupuestado),
    moneda_original: (p.moneda_original as string | null) ?? null,
  }))
  const ordenes: OrdenDeCompra[] = (ocs.data ?? []).map((o) => ({
    id: String(o.id), numero: (o.numero as string | null) ?? null, importe: num(o.importe),
    moneda: (o.moneda as string | null) ?? null, importe_es_neto: (o.importe_es_neto as boolean | null) ?? null,
    drive_file_id: (o.drive_file_id as string | null) ?? null, nombre_archivo: (o.nombre_archivo as string | null) ?? null,
  }))

  const d = decidirContratoDeAlta(aprobados, ordenes)
  if (d.tipo === 'sin_precio') return { estado: 'sin_precio', motivo: d.motivo }

  const { data, error } = await supabase.rpc('fijar_contrato_obra', {
    p_obra_id: obraId, p_mano_obra: d.fila.mano_obra, p_materiales: d.fila.materiales,
    p_fuente_tipo: d.fila.fuente_tipo, p_fuente_drive_id: d.fila.fuente_drive_id,
    p_fuente_nombre: d.fila.fuente_nombre, p_cita: d.fila.cita, p_nota: d.fila.nota,
  })
  if (error) return { estado: 'sin_precio', motivo: `No se pudo guardar el contrato: ${error.message}` }
  // La ficha del cliente se lee de una caché en la base: sin esto, «Contratado» seguiría viejo.
  await invalidarFichaCliente(supabase, clienteId)
  return { estado: data === true ? 'creado' : 'ya_estaba' }
}

/** El aviso visible para la pantalla; `null` si no hay nada que avisar. */
export function avisoDeSiembra(r: ResultadoSiembra): string | null {
  return r.estado === 'sin_precio'
    ? `La obra quedó SIN fila en el contrato y la ficha del cliente no podrá sumar su precio: ${r.motivo}`
    : null
}
