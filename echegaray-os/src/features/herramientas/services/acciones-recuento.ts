'use server'

// EL RECUENTO FÍSICO DEL LUGAR (migración 20260923T1700) — por `abrir_recuento`, `contar_en_recuento` y
// `cerrar_recuento`, en ese orden y en una sola acción: la pantalla cuenta todo y recién al final
// escribe. Si algo falla a mitad de camino el recuento queda ABIERTO en la base y el próximo intento
// sobre el mismo lugar lo retoma (`abrir_recuento` devuelve el abierto), así que no se pierde nada.
//
// La base decide: rechaza un lugar archivado o vacío, un activo que no está en el recuento, un cierre
// vacío y, con «ajustar», una existencia que se movió mientras se contaba. Acá sólo la forma, con Zod.

import { z } from 'zod'
import { MAX_CONTADO, MIGRACION_RECUENTO, type CierreRecuento } from '../logica/recuento'
import { rpcHerramientas, type Resultado } from './rpc'

const schema = z.object({
  ubicacion: z.string().uuid(),
  lineas: z.array(z.object({
    activo: z.string().uuid(),
    contado: z.number().int('Lo contado es un número entero').min(0, 'Lo contado es 0 o más').max(MAX_CONTADO, 'Ese número no es un recuento'),
    nota: z.string().trim().max(400).optional(),
  })).min(1, 'No se contó nada: contá al menos uno'),
  aplicar: z.boolean(),
  observaciones: z.string().trim().max(1000).optional().transform((v) => v || null),
})

export type EntradaRecuento = z.input<typeof schema>

/** Abre (o retoma) el recuento del lugar, carga lo contado y lo cierra. Devuelve el resumen de la base. */
export async function registrarRecuentoAction(entrada: EntradaRecuento): Promise<Resultado<CierreRecuento>> {
  const p = schema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const abierto = await rpcHerramientas<string>('abrir_recuento', { p_ubicacion: p.data.ubicacion }, MIGRACION_RECUENTO)
  if (!abierto.ok) return abierto
  const recuento = abierto.dato
  for (const l of p.data.lineas) {
    const r = await rpcHerramientas<null>('contar_en_recuento', { p_recuento: recuento, p_activo: l.activo, p_contado: l.contado, p_nota: l.nota ?? null }, MIGRACION_RECUENTO)
    if (!r.ok) return r
  }
  const cierre = await rpcHerramientas<CierreRecuento>('cerrar_recuento', { p_recuento: recuento, p_aplicar: p.data.aplicar, p_observaciones: p.data.observaciones }, MIGRACION_RECUENTO)
  if (!cierre.ok) return cierre
  const c = cierre.dato
  return { ok: true, dato: { contados: c.contados, con_diferencia: c.con_diferencia, ajustadas: c.ajustadas, sin_ajustar: c.sin_ajustar ?? [] } }
}
