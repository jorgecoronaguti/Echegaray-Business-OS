// LA LECTURA DEL PANEL «IMPUTAR UN COMPROBANTE YA CARGADO» (24/09/2026). Se pide sólo con el panel abierto.
//
// Tres cosas, todas de la base: las compras en Efectivo de los últimos 30 días (`compra_sheet`, la réplica
// de la pestaña), qué claves ya están imputadas a CUALQUIER entrega (`efectivo_rendicion`) y qué filas tienen
// un pago de la app esperando al Sheet (`compra_obra_cambio`). La lista la arma `logica/imputar.ts`.

import { createClient } from '@/lib/supabase/server'
import type { Rendicion } from '../types'
import { candidatasDe, desdeDia, enSheetDe, type Candidata, type EnSheet, type FilaCandidata } from '../logica/imputar'

export interface Reimputada {
  rendicion: string
  clave: string
  fila: number | null
  fecha: string | null
  proveedor: string | null
  total: number
  enSheet: EnSheet
}

export type LecturaImputar =
  | { estado: 'ok'; candidatas: Candidata[]; sinNumero: number; reimputadas: Reimputada[]; desde: string }
  | { estado: 'error'; mensaje: string }

/** Tope de filas: 30 días de compras en efectivo son decenas, no miles. */
const TOPE = 1_000

export async function leerParaImputar(rendiciones: readonly Rendicion[], hoy: string): Promise<LecturaImputar> {
  try {
    const supabase = await createClient()
    const desde = desdeDia(hoy)
    const propias = rendiciones.filter((r) => r.origen === 'reimputada')
    const [filas, tomadas, cola] = await Promise.all([
      supabase.from('compra_sheet')
        .select('fila, clave, fecha, proveedor, concepto, comprobante, obra_texto, total, tipo_pago, anulada')
        .eq('tipo_pago', 'Efectivo').gte('fecha', desde).order('fecha', { ascending: false }).limit(TOPE),
      supabase.from('efectivo_rendicion').select('compra_clave').limit(10_000),
      supabase.from('compra_obra_cambio').select('id, fila, estado, tipo')
        .eq('tipo', 'pago').in('estado', ['pendiente', 'procesando']).limit(TOPE),
    ])
    for (const r of [filas, tomadas, cola]) if (r.error) return { estado: 'error', mensaje: r.error.message }
    const enCola = new Set(((cola.data ?? []) as { fila: number }[]).map((c) => c.fila))
    const { candidatas, sinNumero } = candidatasDe(
      ((filas.data ?? []) as (Omit<FilaCandidata, 'obra'> & { obra_texto: string | null })[])
        .map((f) => ({ ...f, obra: f.obra_texto, total: f.total == null ? null : Number(f.total) })),
      new Set(((tomadas.data ?? []) as { compra_clave: string }[]).map((t) => t.compra_clave)),
      enCola,
    )

    // LAS YA IMPUTADAS DESDE ACÁ, con dónde está su cambio de Tipo pago: «pendiente de Sheet» hasta que el
    // worker lo escribe y lo relee. Afirmar «A rendir» antes sería decir un efecto que no ocurrió.
    const claves = propias.map((r) => r.compra_clave)
    const cambios = propias.map((r) => r.cambio_id).filter((x): x is string => !!x)
    const [compras, estados] = await Promise.all([
      claves.length
        ? supabase.from('compra_sheet').select('fila, clave, fecha, proveedor, total').in('clave', claves)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      cambios.length
        ? supabase.from('compra_obra_cambio').select('id, estado').in('id', cambios)
        : Promise.resolve({ data: [] as unknown[], error: null }),
    ])
    const porClave = new Map(((compras.data ?? []) as { fila: number; clave: string; fecha: string | null; proveedor: string | null; total: number | null }[])
      .map((c) => [c.clave, c]))
    const estadoDe = new Map(((estados.data ?? []) as { id: string; estado: string }[]).map((c) => [c.id, c.estado]))
    const reimputadas: Reimputada[] = propias.map((r) => {
      const c = porClave.get(r.compra_clave)
      return {
        rendicion: r.id, clave: r.compra_clave, fila: c?.fila ?? null, fecha: c?.fecha ?? null, proveedor: c?.proveedor ?? null,
        total: c?.total != null ? Number(c.total) : Number(r.monto), enSheet: enSheetDe(r.cambio_id ? estadoDe.get(r.cambio_id) : null),
      }
    })
    return { estado: 'ok', candidatas, sinNumero, reimputadas, desde }
  } catch (err) {
    return { estado: 'error', mensaje: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}
