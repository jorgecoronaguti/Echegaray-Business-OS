// LA LECTURA DEL PANEL «IMPUTAR UN COMPROBANTE YA CARGADO» (24/09/2026). Se pide sólo con el panel abierto.
//
// Tres cosas, todas de la base: las compras de los últimos 90 días con cualquier medio de pago (`compra_sheet`,
// la réplica de la pestaña), qué claves y qué filas ya están atadas a CUALQUIER entrega (`efectivo_rendicion`) y
// qué filas tienen un pago de la app esperando al Sheet (`compra_obra_cambio`). La lista la arma `logica/imputar.ts`.

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
  | { estado: 'ok'; candidatas: Candidata[]; sinPagar: number; reimputadas: Reimputada[]; desde: string }
  | { estado: 'error'; mensaje: string }

/** Tope de filas: 90 días de compras son unos cientos (la pestaña entera ronda las mil). */
const TOPE = 2_000

export async function leerParaImputar(rendiciones: readonly Rendicion[], hoy: string): Promise<LecturaImputar> {
  try {
    const supabase = await createClient()
    const desde = desdeDia(hoy)
    const propias = rendiciones.filter((r) => r.origen === 'reimputada' || r.origen === 'iniciales')
    const [filas, tomadas, cola] = await Promise.all([
      supabase.from('compra_sheet')
        .select('fila, clave, fecha, proveedor, concepto, comprobante, obra_texto, total, tipo_pago, estado, anulada')
        .gte('fecha', desde).order('fecha', { ascending: false }).limit(TOPE),
      supabase.from('efectivo_rendicion').select('compra_clave, fila').limit(10_000),
      supabase.from('compra_obra_cambio').select('id, fila, estado, tipo')
        .eq('tipo', 'pago').in('estado', ['pendiente', 'procesando']).limit(TOPE),
    ])
    for (const r of [filas, tomadas, cola]) if (r.error) return { estado: 'error', mensaje: r.error.message }
    const enCola = new Set(((cola.data ?? []) as { fila: number }[]).map((c) => c.fila))
    const atadas = (tomadas.data ?? []) as { compra_clave: string; fila: number | null }[]
    const { candidatas, sinPagar } = candidatasDe(
      ((filas.data ?? []) as (Omit<FilaCandidata, 'obra'> & { obra_texto: string | null })[])
        .map((f) => ({ ...f, obra: f.obra_texto, total: f.total == null ? null : Number(f.total) })),
      { claves: new Set(atadas.map((t) => t.compra_clave)), filas: new Set(atadas.map((t) => t.fila).filter((x): x is number => x != null)) },
      enCola,
    )

    // LAS YA IMPUTADAS DESDE ACÁ, con dónde está su cambio de Tipo pago: «pendiente de Sheet» hasta que el
    // worker lo escribe y lo relee. Afirmar «A rendir» antes sería decir un efecto que no ocurrió.
    // Con número se busca por clave; la atada por fila (sin número), por su fila.
    const claves = propias.filter((r) => r.fila == null).map((r) => r.compra_clave)
    const porSuFila = propias.map((r) => r.fila).filter((x): x is number => x != null)
    const cambios = propias.map((r) => r.cambio_id).filter((x): x is string => !!x)
    const [compras, comprasPorFila, estados] = await Promise.all([
      claves.length
        ? supabase.from('compra_sheet').select('fila, clave, fecha, proveedor, concepto, total').in('clave', claves)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      porSuFila.length
        ? supabase.from('compra_sheet').select('fila, clave, fecha, proveedor, concepto, total').in('fila', porSuFila)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      cambios.length
        ? supabase.from('compra_obra_cambio').select('id, estado').in('id', cambios)
        : Promise.resolve({ data: [] as unknown[], error: null }),
    ])
    type Compra = { fila: number; clave: string | null; fecha: string | null; proveedor: string | null; concepto: string | null; total: number | null }
    const porClave = new Map(((compras.data ?? []) as Compra[]).map((c) => [c.clave, c]))
    const porFila = new Map(((comprasPorFila.data ?? []) as Compra[]).map((c) => [c.fila, c]))
    const estadoDe = new Map(((estados.data ?? []) as { id: string; estado: string }[]).map((c) => [c.id, c.estado]))
    const reimputadas: Reimputada[] = propias.map((r) => {
      const c = r.fila != null ? porFila.get(r.fila) : porClave.get(r.compra_clave)
      return {
        rendicion: r.id, clave: r.compra_clave, fila: c?.fila ?? r.fila ?? null, fecha: c?.fecha ?? null, proveedor: c?.proveedor ?? c?.concepto ?? null,
        total: c?.total != null ? Number(c.total) : Number(r.monto),
        // Por iniciales SIN pedido en cola: el bot la escribió «A rendir» al cargarla, y el vínculo nace
        // recién cuando la carga terminó (`vincular_rendiciones_pendientes`). Ya está en el Sheet.
        // Sin pedido en cola y a mano: la fila YA decía «A rendir» y se ató sin tocar el Sheet (20261001T0100).
        enSheet: r.cambio_id ? enSheetDe(estadoDe.get(r.cambio_id)) : 'en_sheet',
      }
    })
    return { estado: 'ok', candidatas, sinPagar, reimputadas, desde }
  } catch (err) {
    return { estado: 'error', mensaje: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}
