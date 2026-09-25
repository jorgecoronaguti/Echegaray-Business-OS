// LO QUE UNA PERSONA TIENE DE EPP Y ROPA, Y EL CATÁLOGO DE DONDE SE LE ENTREGA — para la solapa
// «EPP y Ropa de Trabajo» del legajo (dueño, 25/09/2026).
//
// Lee el MISMO parque que las pantallas de Herramientas (`leerParque`): el stock que ve el legajo y el
// que ve el Inventario no pueden ser dos cuentas distintas. Devuelve filas planas (nada de `Map`) porque
// viajan a un componente de cliente.

import type { SupabaseClient } from '@supabase/supabase-js'
import { leerParque } from './datos'
import { autorDe, rotuloUbicacion, type Parque } from '../logica/parque'
import {
  campoDeTalle, historialDePersona, prendas, rotuloConTalle, tenencias,
  type CampoTalle, type ClasePersonal, type TallesPersona, type TipoEvento,
} from '../logica/vestimenta'

export const MIGRACION_VESTIMENTA = '20260925T1100'

export interface FilaTiene {
  activoId: string
  codigo: string
  nombre: string
  talle: string | null
  clase: ClasePersonal
  cantidad: number
  fecha: string | null
  quien: string | null
  /** «Ya la tenía» si se registró sin descontar del inventario. */
  yaLaTenia: boolean
}

export interface OrigenPlano { ubicacionId: string; rotulo: string; cantidad: number }
export interface TallePlano { activoId: string; codigo: string; talle: string | null; disponible: number; origenes: OrigenPlano[] }
export interface PrendaPlana { nombre: string; campo: CampoTalle | null; talles: TallePlano[] }

export interface FilaHistorial {
  fecha: string
  tipo: TipoEvento
  nombre: string
  cantidad: number
  quien: string | null
  lugar: string | null
  nota: string | null
}

export type VestimentaDePersona =
  | {
      estado: 'ok'
      ubicacionPersona: string | null
      tallerId: string | null
      tiene: FilaTiene[]
      catalogo: Record<ClasePersonal, PrendaPlana[]>
      historial: FilaHistorial[]
      talles: TallesPersona | null
      /** `persona_talle` no existe todavía: la pantalla lo dice en vez de ofrecer guardar. */
      tallesSinBase: boolean
    }
  | { estado: 'falta_migracion' }
  | { estado: 'error'; mensaje: string }

function catalogoDe(p: Parque, clase: ClasePersonal): PrendaPlana[] {
  const tipoDe = (id: string) => p.ubicacionPorId.get(id)?.tipo ?? null
  return prendas(p.activos, p.existencias ?? [], tipoDe, clase).map((g) => ({
    nombre: g.nombre,
    campo: campoDeTalle(g),
    talles: g.talles.map((t) => ({
      activoId: t.activo.id,
      codigo: t.activo.codigo,
      talle: t.talle,
      disponible: t.disponible,
      // De dónde puede salir: los lugares con unidades que no son una persona, de donde hay más.
      origenes: (p.existDe.get(t.activo.id) ?? [])
        .filter((e) => tipoDe(e.ubicacion_id) !== 'persona')
        .map((e) => ({ ubicacionId: e.ubicacion_id, rotulo: rotuloUbicacion(p, e.ubicacion_id), cantidad: e.cantidad })),
    })),
  }))
}

export async function leerVestimentaDePersona(supabase: SupabaseClient, personaId: string): Promise<VestimentaDePersona> {
  const [lectura, talles] = await Promise.all([
    leerParque(),
    supabase.from('persona_talle').select('camisa, pantalon, calzado').eq('persona_id', personaId).maybeSingle(),
  ])
  if (lectura.estado === 'falta_migracion') return { estado: 'falta_migracion' }
  if (lectura.estado === 'error') {
    // Sin la columna `talle` (migración sin aplicar) el parque no se lee: es la migración, no un error.
    return /talle|persona_id/.test(lectura.mensaje) ? { estado: 'falta_migracion' } : lectura
  }
  const p = lectura.parque
  const u = p.ubicaciones.find((x) => x.tipo === 'persona' && x.persona_id === personaId) ?? null
  const ubicacionPersona = u?.id ?? null
  const eventos = historialDePersona(ubicacionPersona, p.movimientos, p.ajustes ?? [])
  const tiene = tenencias(ubicacionPersona, p.activos, p.existencias ?? [], eventos).map((t): FilaTiene => ({
    activoId: t.activo.id,
    codigo: t.activo.codigo,
    nombre: t.activo.nombre,
    talle: t.activo.talle ?? null,
    clase: t.activo.clase as ClasePersonal,
    cantidad: t.cantidad,
    fecha: t.ultima?.fecha ?? null,
    quien: t.ultima ? autorDe(p, { usuario_id: t.ultima.usuarioId, usuario_texto: null }) : null,
    yaLaTenia: t.ultima?.tipo === 'ya_la_tenia',
  }))
  const historial = eventos.map((e): FilaHistorial => {
    const a = p.activoPorId.get(e.activoId)
    return {
      fecha: e.fecha, tipo: e.tipo, nombre: a ? rotuloConTalle(a) : 'ítem desconocido', cantidad: e.cantidad,
      quien: autorDe(p, { usuario_id: e.usuarioId, usuario_texto: null }),
      lugar: e.otroLugar ? rotuloUbicacion(p, e.otroLugar) : null,
      nota: e.nota,
    }
  })
  const sinTabla = !!talles.error && /persona_talle|PGRST205|42P01/.test(`${talles.error.code} ${talles.error.message}`)
  if (talles.error && !sinTabla) return { estado: 'error', mensaje: talles.error.message }
  return {
    estado: 'ok',
    ubicacionPersona,
    tallerId: p.ubicaciones.find((x) => x.tipo === 'taller' && !x.archivada)?.id ?? null,
    tiene,
    catalogo: { epp: catalogoDe(p, 'epp'), ropa: catalogoDe(p, 'ropa') },
    historial,
    talles: (talles.data as TallesPersona | null) ?? null,
    tallesSinBase: sinTabla,
  }
}
