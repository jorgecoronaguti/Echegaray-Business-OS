// EQUIPOS DE LA OBRA (11 · M14) — leídos del modelo nuevo de Herramientas, NUNCA del espejo viejo.
//
// `ubicacion` (tipo obra) → `activo_existencia` → `activo`, y los viajes en `activo_movimiento` con
// origen o destino en esa ubicación. `herramientas` y `movimientos_herramienta` son el espejo del
// Sheet que se retiró: la solapa dejó de leerlos el 23/09/2026 (mandato del dueño).
//
// Lo que sale de acá ya está ROTULADO (lugar de origen, quién) para que el componente no resuelva
// ids: la regla de qué se dice cuando falta un dato vive en `operacionCanon.ts`.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '../types'
import type { ActivoDibujable, MovimientoDibujable } from './operacionCanon'

export interface EquiposDeObra {
  /** La obra no tiene ubicación en Herramientas todavía: no hay nada que listar y se dice así. */
  sinUbicacion: boolean
  enObra: ActivoDibujable[]
  /** Todos los viajes que tocan esta obra, del más nuevo al más viejo. */
  movimientos: MovimientoDibujable[]
}

type FilaUbic = { id: string; tipo: string; nombre: string | null; obra_id: string | null; activo_id: string | null }
type FilaMov = {
  id: string; activo_id: string; origen_id: string | null; destino_id: string; fecha_hora: string
  usuario_id: string | null; usuario_texto: string | null
}
type FilaActivo = { id: string; nombre: string; codigo: string; clase: string; estado: string }

const TIPO_LUGAR: Record<string, string> = {
  taller: 'Taller', servicio_tecnico: 'Servicio técnico', tercero: 'Tercero', rodado: 'Rodado',
}

export async function getEquiposDeObra(supabase: SupabaseClient, obraId: string): Promise<ServiceResult<EquiposDeObra>> {
  const { data: ubic, error: eU } = await supabase.from('ubicacion')
    .select('id').eq('tipo', 'obra').eq('obra_id', obraId).maybeSingle()
  if (eU) return { data: null, error: eU.message }
  if (!ubic) return { data: { sinUbicacion: true, enObra: [], movimientos: [] }, error: null }
  const ubicId = (ubic as { id: string }).id

  const [exist, movs] = await Promise.all([
    supabase.from('activo_existencia')
      .select('activo_id, cantidad, activo:activo_id(id, nombre, codigo, clase, estado)')
      .eq('ubicacion_id', ubicId).gt('cantidad', 0).limit(500),
    supabase.from('activo_movimiento')
      .select('id, activo_id, origen_id, destino_id, fecha_hora, usuario_id, usuario_texto')
      .or(`destino_id.eq.${ubicId},origen_id.eq.${ubicId}`)
      .order('fecha_hora', { ascending: false }).limit(500),
  ])
  if (exist.error) return { data: null, error: exist.error.message }
  if (movs.error) return { data: null, error: movs.error.message }
  const movimientos = (movs.data ?? []) as FilaMov[]

  // Los activos que viajaron pero ya no están se necesitan para rotular sus movimientos.
  const activosPorId = new Map<string, FilaActivo>()
  for (const fila of exist.data ?? []) {
    const crudo = (fila as unknown as { activo: unknown }).activo
    const a = (Array.isArray(crudo) ? crudo[0] : crudo) as FilaActivo | null | undefined
    if (a && a.estado !== 'baja') activosPorId.set(a.id, a)
  }
  const faltan = [...new Set(movimientos.map((m) => m.activo_id))].filter((id) => !activosPorId.has(id))
  const lugares = new Set<string>()
  for (const m of movimientos) { if (m.origen_id) lugares.add(m.origen_id); lugares.add(m.destino_id) }
  lugares.delete(ubicId)
  const usuarios = [...new Set(movimientos.map((m) => m.usuario_id).filter((u): u is string => Boolean(u)))]

  const [otros, ubics, perfiles] = await Promise.all([
    faltan.length ? supabase.from('activo').select('id, nombre, codigo, clase, estado').in('id', faltan) : null,
    lugares.size ? supabase.from('ubicacion').select('id, tipo, nombre, obra_id, activo_id').in('id', [...lugares]) : null,
    // `perfiles` puede estar recortada por RLS a la fila propia: lo que no vuelve queda «sin registrar».
    usuarios.length ? supabase.from('perfiles').select('id, nombre').in('id', usuarios) : null,
  ])
  for (const a of (otros?.data ?? []) as FilaActivo[]) activosPorId.set(a.id, a)
  const ubicPorId = new Map(((ubics?.data ?? []) as FilaUbic[]).map((u) => [u.id, u]))
  const obrasRef = [...ubicPorId.values()].map((u) => u.obra_id).filter((o): o is string => Boolean(o))
  const obras = obrasRef.length ? await supabase.from('obra_canonica').select('id, nombre').in('id', obrasRef) : null
  const nombreObra = new Map(((obras?.data ?? []) as { id: string; nombre: string }[]).map((o) => [o.id, o.nombre]))
  const nombrePerfil = new Map(((perfiles?.data ?? []) as { id: string; nombre: string | null }[]).map((p) => [p.id, p.nombre]))

  const rotuloLugar = (id: string | null): string | null => {
    if (!id) return null
    const u = ubicPorId.get(id)
    if (!u) return null
    if (u.tipo === 'obra') return (u.obra_id && nombreObra.get(u.obra_id)) || null
    return u.nombre ?? TIPO_LUGAR[u.tipo] ?? u.tipo
  }
  const quien = (m: FilaMov): string | null => (m.usuario_id && nombrePerfil.get(m.usuario_id)) || m.usuario_texto || null

  const dibujables: MovimientoDibujable[] = movimientos.map((m) => ({
    id: m.id,
    activoId: m.activo_id,
    fechaHora: m.fecha_hora,
    activoNombre: activosPorId.get(m.activo_id)?.nombre ?? 'activo sin nombre',
    sentido: m.destino_id === ubicId ? 'entro' : 'salio',
    otroLugar: rotuloLugar(m.destino_id === ubicId ? m.origen_id : m.destino_id),
    quien: quien(m),
  }))

  const enObra: ActivoDibujable[] = []
  for (const fila of exist.data ?? []) {
    const a = activosPorId.get((fila as { activo_id: string }).activo_id)
    if (!a) continue
    const entrada = movimientos.find((m) => m.activo_id === a.id && m.destino_id === ubicId)
    enObra.push({
      id: a.id, nombre: a.nombre, codigo: a.codigo, estado: a.estado,
      desde: entrada ? entrada.fecha_hora.slice(0, 10) : null,
      desdeLugar: entrada ? rotuloLugar(entrada.origen_id) : null,
      quien: entrada ? quien(entrada) : null,
    })
  }
  enObra.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
  return { data: { sinUbicacion: false, enObra, movimientos: dibujables }, error: null }
}
