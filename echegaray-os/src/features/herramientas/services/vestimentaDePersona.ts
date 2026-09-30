// LO QUE UNA PERSONA TIENE DE EPP Y ROPA, Y EL CATÁLOGO DE DONDE SE LE ENTREGA — para la solapa
// «EPP y Ropa de Trabajo» del legajo (dueño, 25/09/2026).
//
// Lee el MISMO parque que las pantallas de Herramientas (`leerParque`): el stock que ve el legajo y el
// que ve el Inventario no pueden ser dos cuentas distintas. Devuelve filas planas (nada de `Map`) porque
// viajan a un componente de cliente.
//
// 30/09 (20260930T2100): la persona NO es un lugar. Lo que tiene es `existencia.persona_id = ella` y está
// en la obra donde trabaja (su asignación vigente) o en el Taller; `dondeRecibe` dice dónde va a quedar
// lo que se le entregue, con la misma regla que `_lugar_de_persona` en la base.

import type { SupabaseClient } from '@supabase/supabase-js'
import { leerParque } from './datos'
import { MOTIVO_BAJA, autorDe, lugaresDe, rotuloUbicacion, type Parque } from '../logica/parque'
import { rotuloDeObra } from '@/shared/utils/obra'
import {
  campoDeTalle, historialDePersona, prendas, rotuloConTalle, tenencias,
  type CampoTalle, type ClasePersonal, type TallesPersona, type TipoEvento,
} from '../logica/vestimenta'

export const MIGRACION_VESTIMENTA = '20260930T2100'

export interface FilaTiene {
  activoId: string
  /** DÓNDE está lo que tiene (la obra donde trabaja o el Taller). */
  dondeId: string
  donde: string
  codigo: string
  nombre: string
  marca: string | null
  modelo: string | null
  talle: string | null
  clase: ClasePersonal
  cantidad: number
  fecha: string | null
  quien: string | null
  /** «Ya la tenía» si se registró sin descontar del inventario. */
  yaLaTenia: boolean
  /** Entrega de antes del sistema, cargada de la constancia firmada. */
  historica: boolean
  /** La constancia en Drive (enlace), si la última entrega la tiene. */
  respaldo: string | null
  /** Talle null en una prenda que se talla: el papel no lo decía. Se muestra «sin talle», no «único». */
  sinTalle: boolean
}

/** Lo que tenía una persona que se fue: cerrado como «egresó · no devuelto» (20260925T1500). */
export interface FilaCerrada {
  nombre: string
  clase: ClasePersonal
  cantidad: number
  fecha: string
  detalle: string | null
}

export interface OrigenPlano { ubicacionId: string; rotulo: string; cantidad: number }
export interface TallePlano { activoId: string; codigo: string; talle: string | null; disponible: number; origenes: OrigenPlano[] }

/** El enlace a un archivo de Drive por su id. */
const enlaceDrive = (id: string | null) => (id ? `https://drive.google.com/file/d/${id}/view` : null)
export interface PrendaPlana { nombre: string; campo: CampoTalle | null; talles: TallePlano[] }

export interface FilaHistorial {
  fecha: string
  tipo: TipoEvento
  nombre: string
  cantidad: number
  quien: string | null
  /** De dónde salió (entrega) o de qué obra venía (cambio de obra). */
  lugar: string | null
  /** Dónde quedó. */
  donde: string | null
  nota: string | null
  /** Baja: por qué («pérdida», «descarte», «robo»). null en lo que no es baja. */
  motivo: string | null
  respaldo: string | null
}

export type VestimentaDePersona =
  | {
      estado: 'ok'
      /** Dónde queda lo que se le entregue hoy: su obra vigente o el Taller. null = no se pudo saber. */
      dondeRecibe: { ubicacionId: string | null; rotulo: string } | null
      tallerId: string | null
      tiene: FilaTiene[]
      cerradas: FilaCerrada[]
      catalogo: Record<ClasePersonal, PrendaPlana[]>
      historial: FilaHistorial[]
      talles: TallesPersona | null
      /** `persona_talle` no existe todavía: la pantalla lo dice en vez de ofrecer guardar. */
      tallesSinBase: boolean
    }
  | { estado: 'falta_migracion' }
  | { estado: 'error'; mensaje: string }

function catalogoDe(p: Parque, clase: ClasePersonal): PrendaPlana[] {
  return prendas(p.activos, p.existencias ?? [], clase).map((g) => ({
    nombre: g.nombre,
    campo: campoDeTalle(g),
    talles: g.talles.map((t) => ({
      activoId: t.activo.id,
      codigo: t.activo.codigo,
      talle: t.talle,
      disponible: t.disponible,
      // De dónde puede salir: los lugares con unidades LIBRES (que no tiene nadie), de donde hay más.
      origenes: lugaresDe(p, t.activo.id)
        .filter((e) => e.libre > 0)
        .map((e) => ({ ubicacionId: e.ubicacion_id, rotulo: rotuloUbicacion(p, e.ubicacion_id), cantidad: e.libre })),
    })),
  }))
}

/** La fecha de hoy en Argentina (UTC−3), como la compara `asignacion_vigente` en la base. */
const hoyAR = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)

interface AsignacionFila { obra_id: string; desde: string | null; hasta: string | null; creado_en: string | null }

/**
 * Dónde queda lo que se le entrega: la obra activa de su asignación vigente (la más reciente); si no hay,
 * el Taller. Es `_lugar_de_persona` leído desde acá (la base es la que decide al entregar).
 */
function dondeRecibe(p: Parque, asignaciones: readonly AsignacionFila[], hoy: string): { ubicacionId: string | null; rotulo: string } | null {
  const vigentes = asignaciones
    .filter((a) => (!a.desde || a.desde <= hoy) && (!a.hasta || a.hasta >= hoy) && p.obraPorId.get(a.obra_id)?.estado === 'activa')
    .sort((x, y) => (y.desde ?? '').localeCompare(x.desde ?? '') || (y.creado_en ?? '').localeCompare(x.creado_en ?? ''))
  const obra = vigentes[0]?.obra_id
  if (obra) {
    const u = p.ubicaciones.find((x) => x.obra_id === obra)
    if (!u) return { ubicacionId: null, rotulo: rotuloDeObra(p.obraPorId.get(obra)!) }
    if (!u.archivada) return { ubicacionId: u.id, rotulo: rotuloUbicacion(p, u.id) }
  }
  const taller = p.ubicaciones.find((x) => x.tipo === 'taller' && !x.archivada)
  return taller ? { ubicacionId: taller.id, rotulo: rotuloUbicacion(p, taller.id) } : null
}

export async function leerVestimentaDePersona(supabase: SupabaseClient, personaId: string): Promise<VestimentaDePersona> {
  const [lectura, talles, asignaciones] = await Promise.all([
    leerParque(),
    supabase.from('persona_talle').select('camisa, pantalon, calzado').eq('persona_id', personaId).maybeSingle(),
    supabase.from('obra_asignacion').select('obra_id, desde, hasta, creado_en').eq('persona_id', personaId).limit(200),
  ])
  if (lectura.estado === 'falta_migracion') return { estado: 'falta_migracion' }
  if (lectura.estado === 'error') {
    // Sin la columna `talle` (migración sin aplicar) el parque no se lee: es la migración, no un error.
    return /talle|persona_id/.test(lectura.mensaje) ? { estado: 'falta_migracion' } : lectura
  }
  const p = lectura.parque
  const eventos = historialDePersona(personaId, p.movimientos, p.ajustes ?? [])
  const tiene = tenencias(personaId, p.activos, p.existencias ?? [], eventos).map((t): FilaTiene => ({
    activoId: t.activo.id,
    dondeId: t.dondeId,
    donde: rotuloUbicacion(p, t.dondeId),
    codigo: t.activo.codigo,
    nombre: t.activo.nombre,
    marca: t.activo.marca ?? null,
    modelo: t.activo.modelo ?? null,
    talle: t.activo.talle ?? null,
    clase: t.activo.clase as ClasePersonal,
    cantidad: t.cantidad,
    fecha: t.ultima?.fecha ?? null,
    quien: t.ultima ? autorDe(p, { usuario_id: t.ultima.usuarioId, usuario_texto: null }) : null,
    yaLaTenia: t.ultima?.tipo === 'ya_la_tenia',
    historica: t.ultima?.tipo === 'historica',
    respaldo: enlaceDrive(t.ultima?.respaldo ?? null),
    sinTalle: !t.activo.talle && p.activos.some((x) => x.id !== t.activo.id && x.estado !== 'baja' && x.clase === t.activo.clase
      && x.nombre.trim().toLowerCase() === t.activo.nombre.trim().toLowerCase() && !!x.talle),
  }))
  const cerradas = eventos.filter((e) => e.tipo === 'egreso').map((e): FilaCerrada => {
    const a = p.activoPorId.get(e.activoId)
    return { nombre: a ? rotuloConTalle(a) : 'ítem desconocido', clase: (a?.clase ?? 'epp') as ClasePersonal, cantidad: e.cantidad, fecha: e.fecha, detalle: e.nota }
  })
  const historial = eventos.map((e): FilaHistorial => {
    const a = p.activoPorId.get(e.activoId)
    return {
      fecha: e.fecha, tipo: e.tipo, nombre: a ? rotuloConTalle(a) : 'ítem desconocido', cantidad: e.cantidad,
      quien: autorDe(p, { usuario_id: e.usuarioId, usuario_texto: null }),
      lugar: e.otroLugar ? rotuloUbicacion(p, e.otroLugar) : null,
      donde: e.donde ? rotuloUbicacion(p, e.donde) : null,
      nota: e.nota,
      motivo: e.motivo ? (MOTIVO_BAJA[e.motivo] ?? e.motivo) : null,
      respaldo: enlaceDrive(e.respaldo),
    }
  })
  const sinTabla = !!talles.error && /persona_talle|PGRST205|42P01/.test(`${talles.error.code} ${talles.error.message}`)
  if (talles.error && !sinTabla) return { estado: 'error', mensaje: talles.error.message }
  return {
    estado: 'ok',
    // Una asignación que no se pudo leer (RLS) no inventa lugar: la base decide al entregar.
    dondeRecibe: asignaciones.error ? null : dondeRecibe(p, (asignaciones.data ?? []) as AsignacionFila[], hoyAR()),
    tallerId: p.ubicaciones.find((x) => x.tipo === 'taller' && !x.archivada)?.id ?? null,
    tiene,
    cerradas,
    catalogo: { epp: catalogoDe(p, 'epp'), ropa: catalogoDe(p, 'ropa') },
    historial,
    talles: (talles.data as TallesPersona | null) ?? null,
    tallesSinBase: sinTabla,
  }
}
