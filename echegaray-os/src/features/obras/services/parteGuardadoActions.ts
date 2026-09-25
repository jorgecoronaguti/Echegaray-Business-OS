'use server'

// EL PARTE YA GUARDADO — leerlo, editarlo (a mano o por voz) y borrarlo. Las MISMAS tablas y puertas.
//
// Dueño, 25/09/2026: «vas a tener que dar la posibilidad de editar o borrar el parte diario por voz,
// para usuarios y para admin» · «usá Supabase con las mismas tablas, que no se crucen datos ni se
// cargue dos veces nada». Jefe y Administración; el operario no (la cerradura es la de cada puerta y
// `registrar_cambio_parte`, que exigen `es_administracion()` y `ve_obra()`).
//
//   asistencia y horas  → guardarJornada (corrige, no duplica; `vaciar` saca la jornada de ESTA obra)
//                         + quitarPresencia (la marca del día, sólo si es de esta obra)
//   avance              → guardarParteDiario (actualiza el renglón del día) / borrarParte
//   novedad             → la nota del parte: borrarNota + la nueva por guardarParteDiario
//   material            → borrarPedidos (sólo lo que nadie procesó) / pedirMaterialAction
//   historial           → entidad_cambio por `registrar_cambio_parte` (quién cambió qué)
//
// Lo que el server decide lo decide `parteGuardado.ts` (puro, probado): acá se LEE lo guardado de
// nuevo —nunca se confía en lo que dice el navegador que estaba— y se ejecuta cada diferencia.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { nombreDePersona } from '@/shared/personas/nombre'
import { guardarJornada } from '@/features/administracion/services/jornadaPorObraActions'
import { quitarPresencia } from '@/features/administracion/services/presenciaDelDiaActions'
import { borrarPedidos, pedirMaterialAction } from '@/features/materiales/services/acciones'
import { borrarParte, guardarParteDiario } from './actionsEjecucion'
import { borrarNota } from './actionsNotas'
import { comentarioDeTarea, numeroParaElParte, type Propuesta, type Revision } from './dictadoParte'
import { diferencias, resumenParaBitacora, type ParteGuardado, type PersonaGuardada } from './parteGuardado'
import { SIN_PERMISO_DE_PARTE, editaPartesDeLaObra } from '@/shared/auth/obraPropia'

export type R<T = undefined> = { ok: true; dato: T } | { ok: false; error: string }
type Supa = Awaited<ReturnType<typeof createClient>>

const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Obra = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)

/** La nota con la que el parte pide material: es como se lo encuentra después para editarlo o cancelarlo. */
export const notaDelPedido = async (fecha: string) => `Parte diario del ${fecha.split('-').reverse().join('/')}`

const SIN_PROCESAR = new Set(['PEDIDO', 'PENDIENTE'])

/** Lo último que se dijo de ESTE parte: quién estuvo en qué tarea y cuál es su nota. */
async function ultimoRegistro(supabase: Supa, obraId: string, fecha: string) {
  const [dictados, bitacora] = await Promise.all([
    supabase.from('parte_dictado').select('id, cerrado_en, resultado').eq('obra_id', obraId).eq('fecha', fecha)
      .eq('estado', 'guardado').order('cerrado_en', { ascending: false }).limit(20),
    supabase.from('entidad_cambio').select('en, campo, despues').eq('entidad', 'parte_diario').eq('entidad_id', `${obraId}/${fecha}`)
      .order('en', { ascending: false }).limit(1),
  ])
  const ds = (dictados.data ?? []) as { id: string; cerrado_en: string; resultado: { tareas?: Record<string, string>; nota_id?: string | null } | null }[]
  const b = (bitacora.data ?? [])[0] as { en: string; campo: string; despues: string } | undefined
  let tareas: Record<string, string> = {}
  let notaId: string | null = null
  const d0 = ds[0]
  if (b && (!d0 || b.en > d0.cerrado_en)) {
    if (b.campo !== 'borrado') {
      try { const j = JSON.parse(b.despues) as { tareas?: Record<string, string>; nota_id?: string | null }; tareas = j.tareas ?? {}; notaId = j.nota_id ?? null } catch { /* bitácora vieja */ }
    }
  } else if (d0?.resultado) {
    tareas = d0.resultado.tareas ?? {}
    notaId = d0.resultado.nota_id ?? null
  }
  return { dictados: ds.map((d) => d.id), tareas, notaId }
}

async function leer(supabase: Supa, obraId: string, fecha: string): Promise<R<ParteGuardado>> {
  const [hh, marcas, ejec, acts, pedidos, reg] = await Promise.all([
    supabase.from('registros_hh').select('persona_id, horas').eq('obra_canonica_id', obraId).eq('fecha', fecha)
      .eq('tipo_hora', 'normal').is('actividad_id', null).not('improductiva', 'is', true),
    supabase.from('asistencia_dia').select('persona_id, estado').eq('obra_canonica_id', obraId).eq('fecha', fecha),
    supabase.from('obra_ejecucion').select('id, actividad_id, cantidad, avance_pct').eq('obra_id', obraId).eq('fecha', fecha).eq('fuente', 'web'),
    supabase.from('obra_actividad_control').select('actividad_id, nombre, metodo_avance, unidad, avance_pct, cantidad_ejecutada, actividad_padre_id').eq('obra_id', obraId).limit(2000),
    supabase.from('pedidos_materiales').select('id_pedido, material, cantidad, unidad, estado').eq('obra_canonica_id', obraId)
      .eq('nota', await notaDelPedido(fecha)).is('borrado_en', null),
    ultimoRegistro(supabase, obraId, fecha),
  ])
  const error = [hh, marcas, ejec, acts, pedidos].find((x) => x.error)?.error
  if (error) return { ok: false, error: error.message }

  const horas = new Map<string, number>()
  for (const f of (hh.data ?? []) as { persona_id: string; horas: number | string }[]) horas.set(f.persona_id, (horas.get(f.persona_id) ?? 0) + Number(f.horas))
  const ausentes = new Set(((marcas.data ?? []) as { persona_id: string; estado: string }[]).filter((m) => m.estado !== 'presente').map((m) => m.persona_id))
  const ids = [...new Set([...horas.keys(), ...ausentes])]
  const nombres = new Map<string, string>()
  if (ids.length) {
    const { data } = await supabase.from('personas').select('id, nombre_completo, nombre_para_mostrar').in('id', ids)
    for (const p of (data ?? []) as { id: string; nombre_completo: string; nombre_para_mostrar: string | null }[]) nombres.set(p.id, nombreDePersona(p))
  }
  const actividades = new Map(((acts.data ?? []) as { actividad_id: string; nombre: string; metodo_avance: string; unidad: string | null; avance_pct: number | null; cantidad_ejecutada: number | null; actividad_padre_id: string | null }[]).map((a) => [a.actividad_id, a]))
  const etiqueta = (id: string | null) => {
    const a = id ? actividades.get(id) : undefined
    if (!a) return null
    const padre = a.actividad_padre_id ? actividades.get(a.actividad_padre_id)?.nombre : null
    return padre ? `${padre} › ${a.nombre}` : a.nombre
  }
  const personas: PersonaGuardada[] = ids.map((id): PersonaGuardada => {
    const h = horas.get(id)
    const presente = h != null && h > 0
    const tarea = presente ? (reg.tareas[id] ?? null) : null
    return { persona_id: id, nombre: nombres.get(id) ?? 'sin nombre', estado: presente ? 'presente' : 'ausente', horas: presente ? h : null, tarea_id: tarea, tarea_nombre: etiqueta(tarea) }
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const avances = ((ejec.data ?? []) as { id: string; actividad_id: string; cantidad: number | null; avance_pct: number | null }[]).map((e) => {
    const a = actividades.get(e.actividad_id)
    const metodo = a?.metodo_avance ?? 'manual'
    return {
      ejecucion_id: e.id, tarea_id: e.actividad_id, tarea_nombre: etiqueta(e.actividad_id) ?? 'tarea',
      produccion: Number(metodo === 'cantidad' ? e.cantidad : e.avance_pct) || 0, metodo, unidad: a?.unidad ?? '',
      actual: Number(metodo === 'cantidad' ? a?.cantidad_ejecutada : a?.avance_pct) || 0,
    }
  })
  const materiales = ((pedidos.data ?? []) as { id_pedido: string; material: string; cantidad: number; unidad: string | null; estado: string | null }[]).map((m) => ({
    id_pedido: m.id_pedido, material: m.material, cantidad: Number(m.cantidad), unidad: m.unidad ?? 'un', estado: m.estado ?? '',
    procesado: !SIN_PROCESAR.has(String(m.estado ?? '').toUpperCase()),
  }))
  let novedad: ParteGuardado['novedad'] = null
  if (reg.notaId) {
    const { data } = await supabase.from('obra_actividad_nota').select('id, texto').eq('id', reg.notaId).eq('obra_id', obraId).maybeSingle()
    if (data) novedad = { nota_id: String((data as { id: string }).id), texto: String((data as { texto: string }).texto) }
  }
  return {
    ok: true,
    dato: {
      obra_id: obraId, fecha, personas, avances, materiales, novedad, dictados: reg.dictados,
      vacio: !personas.length && !avances.length && !materiales.length && !novedad,
    },
  }
}

export async function leerParteGuardado(obraId: string, fecha: string): Promise<R<ParteGuardado>> {
  const o = Obra.safeParse(obraId); const f = Fecha.safeParse(fecha)
  if (!o.success || !f.success) return { ok: false, error: 'Obra o día inválidos.' }
  return leer(await createClient(), o.data, f.data)
}

const RevisionSchema = z.object({
  personas: z.array(z.object({
    persona_id: z.string().uuid().nullable(), nombre: z.string(), estado: z.enum(['presente', 'ausente']),
    horas: z.number().positive().max(24).nullable(), tarea_id: z.string().uuid().nullable(), tarea_nombre: z.string().nullable(),
    incluida: z.boolean(), candidatos: z.array(z.object({ id: z.string(), nombre: z.string() })).optional(),
  }).passthrough()).max(200),
  avances: z.array(z.object({ tarea_id: z.string().uuid(), produccion: z.number().positive().max(1e7).nullable(), incluida: z.boolean() }).passthrough()).max(200),
  materiales: z.array(z.object({ material: z.string().max(160), cantidad: z.number().min(0).max(1e7), unidad: z.string().max(24), incluida: z.boolean(), id_pedido: z.string().optional() }).passthrough()).max(50),
  urgencia: z.enum(['hoy', 'semana', 'cuando_se_pueda']),
  novedad: z.string().max(1000),
}).passthrough()

export interface AcuseEdicion { hecho: string[]; noHecho: string[] }

/**
 * GUARDAR LO EDITADO (a mano, o una corrección dictada ya revisada). Sólo lo que CAMBIÓ viaja a cada
 * puerta; lo que no cambió no se reescribe. `correccionId` = el dictado de «Dictar corrección».
 */
export async function guardarEdicionDelParte(obraId: string, fecha: string, entrada: Revision, correccionId: string | null): Promise<R<AcuseEdicion>> {
  const o = Obra.safeParse(obraId); const f = Fecha.safeParse(fecha); const r = RevisionSchema.safeParse(entrada)
  if (!o.success || !f.success) return { ok: false, error: 'Obra o día inválidos.' }
  if (!r.success) return { ok: false, error: `Algo del parte vino mal: ${r.error.issues[0].message}` }
  const rev = r.data as unknown as Revision
  const supabase = await createClient()
  // El jefe edita los partes de SU obra (dueño 25/09/2026); se pregunta antes de escribir nada.
  if (!(await editaPartesDeLaObra(supabase, o.data))) return { ok: false, error: SIN_PERMISO_DE_PARTE }
  const leido = await leer(supabase, o.data, f.data)
  if (!leido.ok) return leido
  const g = leido.dato

  // SÓLO PERSONAS QUE YA ESTABAN EN EL PARTE O QUE SALIERON DEL DICTADO DE ESTA OBRA.
  const permitidas = new Set(g.personas.map((p) => p.persona_id))
  let correccion: { propuesta: Propuesta } | null = null
  if (correccionId) {
    const { data } = await supabase.from('parte_dictado').select('obra_id, fecha, estado, propuesta, es_correccion').eq('id', correccionId).maybeSingle()
    const c = data as { obra_id: string; fecha: string; estado: string; propuesta: Propuesta | null; es_correccion: boolean } | null
    if (!c || c.obra_id !== o.data || c.fecha !== f.data || c.estado !== 'listo' || !c.propuesta) return { ok: false, error: 'Esa corrección no es de este parte o ya se cerró.' }
    correccion = { propuesta: c.propuesta }
    for (const p of c.propuesta.personas) { if (p.persona_id) permitidas.add(p.persona_id); for (const k of p.candidatos ?? []) permitidas.add(k.id) }
  }
  if (rev.personas.some((p) => p.incluida && p.persona_id && !permitidas.has(p.persona_id))) {
    return { ok: false, error: 'Hay una persona que no estaba en el parte ni salió del dictado. No se guardó nada.' }
  }
  const d = diferencias(g, rev)
  if (!d.hayCambios && !correccionId) return { ok: false, error: 'No cambiaste nada.' }

  const { data: obra } = await supabase.from('obra_canonica').select('jornada_horas').eq('id', o.data).maybeSingle()
  const jornada = Number((obra as { jornada_horas?: number | string | null } | null)?.jornada_horas) || 8
  const hecho: string[] = []
  const noHecho: string[] = []
  const anotar = (que: string, x: { ok: boolean; error?: string | null; mensaje?: string | null }) => (x.ok ? hecho.push(que) : noHecho.push(`${que}: ${x.error ?? x.mensaje ?? 'no entró'}`))

  // 1 · ASISTENCIA
  const quitarPresentes = d.quitarPersonas.filter((id) => g.personas.find((p) => p.persona_id === id)?.estado === 'presente')
  if (d.marcas.length || quitarPresentes.length) {
    const j = await guardarJornada({
      obra_id: o.data, fecha: f.data,
      marcas: d.marcas.map((m) => (m.estado === 'presente'
        ? { persona_id: m.persona_id, estado: 'presente' as const, horas: m.horas as number }
        : { persona_id: m.persona_id, estado: 'ausente' as const, horas: jornada, motivo: null })),
      vaciar: quitarPresentes,
    })
    anotar('asistencia', j.ok ? { ok: true } : { ok: false, error: j.error })
  }
  for (const id of d.quitarPersonas) {
    const { data: marca } = await supabase.from('asistencia_dia').select('obra_canonica_id').eq('persona_id', id).eq('fecha', f.data).maybeSingle()
    if ((marca as { obra_canonica_id?: string } | null)?.obra_canonica_id === o.data) {
      const q = await quitarPresencia({ persona_id: id, fecha: f.data })
      anotar('marca del día', q.ok ? { ok: true } : { ok: false, error: q.error })
    }
  }

  // 2 · AVANCE Y NOVEDAD
  const personasFinal = rev.personas.filter((p) => p.incluida && p.persona_id).map((p) => ({ persona_id: p.persona_id as string, estado: p.estado, horas: p.horas, tarea_id: p.tarea_id }))
  const nombres = new Map(rev.personas.filter((p) => p.persona_id).map((p) => [p.persona_id as string, p.nombre]))
  let notaNueva: string | null = null
  if (d.novedad.borrar) {
    const b = await borrarNota(o.data, d.novedad.borrar)
    anotar('novedad anterior', b.ok ? { ok: true } : { ok: false, error: b.error })
  }
  if (d.avances.length || (d.novedad.cambia && d.novedad.nueva)) {
    const fd = new FormData()
    fd.set('fecha', f.data)
    fd.set('novedad', d.novedad.cambia ? d.novedad.nueva : '')
    fd.set('novedad_actividad', rev.avances.find((a) => a.incluida)?.tarea_id ?? g.avances[0]?.tarea_id ?? '')
    for (const a of d.avances) {
      fd.set(`produccion_${a.tarea_id}`, numeroParaElParte(a.produccion))
      const c = comentarioDeTarea(a.tarea_id, personasFinal, nombres)
      if (c) fd.set(`comentario_${a.tarea_id}`, c)
    }
    if (!fd.get('novedad_actividad') && d.novedad.cambia && d.novedad.nueva) {
      const { data: una } = await supabase.from('obra_actividad').select('id').eq('obra_id', o.data).limit(1).maybeSingle()
      fd.set('novedad_actividad', (una as { id?: string } | null)?.id ?? '')
    }
    const p = await guardarParteDiario(o.data, fd)
    anotar('avance y novedad', p.ok ? { ok: true } : { ok: false, error: p.error })
    if (p.ok && d.novedad.cambia && d.novedad.nueva) {
      const { data: u } = await supabase.auth.getUser()
      const { data: n } = await supabase.from('obra_actividad_nota').select('id').eq('obra_id', o.data).eq('texto', d.novedad.nueva)
        .eq('creado_por', u?.user?.id ?? '').order('creado_en', { ascending: false }).limit(1).maybeSingle()
      notaNueva = (n as { id?: string } | null)?.id ?? null
    }
  }
  for (const id of d.borrarEjecuciones) {
    const b = await borrarParte(o.data, id)
    anotar('avance quitado', b.ok ? { ok: true } : { ok: false, error: b.error })
  }

  // 3 · MATERIAL
  if (d.cancelar.length) {
    const b = await borrarPedidos(d.cancelar)
    anotar(`${d.cancelar.length} pedido(s) cancelado(s)`, b.ok ? { ok: true } : { ok: false, error: b.error })
  }
  if (d.pedir.length) {
    const fd = new FormData()
    fd.set('obra_id', o.data); fd.set('urgencia', rev.urgencia); fd.set('nota', await notaDelPedido(f.data))
    for (const m of d.pedir) { fd.append('material', m.material); fd.append('cantidad', String(m.cantidad)); fd.append('unidad', m.unidad) }
    const p = await pedirMaterialAction({ error: null }, fd)
    anotar(`${d.pedir.length} pedido(s) nuevo(s)`, p.ok ? { ok: true } : { ok: false, error: p.error })
  }
  for (const m of d.noSeCancela) noHecho.push(`«${m}» ya lo procesaron en Material: no se cambió desde el parte`)

  // 4 · HISTORIAL Y DICTADO
  const tareas = Object.fromEntries(personasFinal.filter((p) => p.estado === 'presente' && p.tarea_id).map((p) => [p.persona_id, p.tarea_id as string]))
  const notaVigente = d.novedad.cambia ? notaNueva : (g.novedad?.nota_id ?? null)
  const despues = {
    resumen: resumenParaBitacora({
      personas: rev.personas.filter((p) => p.incluida && p.persona_id).map((p) => ({ persona_id: p.persona_id as string, nombre: p.nombre, estado: p.estado, horas: p.horas, tarea_id: p.tarea_id, tarea_nombre: p.tarea_nombre })),
      avances: rev.avances.filter((a) => a.incluida).map((a) => ({ ejecucion_id: '', tarea_id: a.tarea_id, tarea_nombre: a.tarea_nombre, produccion: a.produccion ?? 0, metodo: a.metodo, unidad: a.unidad, actual: a.actual })),
      materiales: rev.materiales.filter((m) => m.incluida).map((m) => ({ id_pedido: '', material: m.material, cantidad: m.cantidad, unidad: m.unidad, estado: '', procesado: false })),
      novedad: rev.novedad.trim() ? { nota_id: '', texto: rev.novedad.trim() } : null,
    }),
    tareas, nota_id: notaVigente,
  }
  const campo = correccionId ? 'corregido por voz' : 'editado'
  const bit = await supabase.rpc('registrar_cambio_parte', { p_obra: o.data, p_fecha: f.data, p_campo: campo, p_antes: resumenParaBitacora(g), p_despues: JSON.stringify(despues) })
  if (bit.error) noHecho.push(`historial: ${bit.error.message}`)
  if (correccionId && correccion) {
    const { error } = await supabase.from('parte_dictado').update({ estado: 'guardado', resultado: { edicion: { hecho, noHecho }, tareas, nota_id: notaVigente } }).eq('id', correccionId).eq('estado', 'listo')
    if (error) noHecho.push(`la corrección no quedó marcada como guardada: ${error.message}`)
  }
  if (!hecho.length && noHecho.length) return { ok: false, error: `No se guardó nada: ${noHecho.join(' · ')}` }
  revalidatePath(`/obras/${o.data}`)
  return { ok: true, dato: { hecho, noHecho } }
}

/**
 * BORRAR EL PARTE DEL DÍA, con UNA confirmación en la pantalla. Propaga por las mismas puertas: saca la
 * asistencia y las horas de ESTA obra, borra los renglones de avance (el avance de la tarea se recalcula
 * solo: es la suma de sus partes), la novedad del parte y los pedidos que nadie procesó. Los dictados
 * de ese día quedan `anulado` (el audio no se borra). Queda en el historial.
 */
export async function borrarParteDelDia(obraId: string, fecha: string): Promise<R<AcuseEdicion>> {
  const o = Obra.safeParse(obraId); const f = Fecha.safeParse(fecha)
  if (!o.success || !f.success) return { ok: false, error: 'Obra o día inválidos.' }
  const supabase = await createClient()
  // El jefe borra los partes de SU obra (dueño 25/09/2026); se pregunta antes de borrar nada.
  if (!(await editaPartesDeLaObra(supabase, o.data))) return { ok: false, error: SIN_PERMISO_DE_PARTE }
  const leido = await leer(supabase, o.data, f.data)
  if (!leido.ok) return leido
  const g = leido.dato
  if (g.vacio) return { ok: false, error: 'Ese día no tiene parte guardado.' }
  const hecho: string[] = []
  const noHecho: string[] = []
  const anotar = (que: string, ok: boolean, error?: string | null) => (ok ? hecho.push(que) : noHecho.push(`${que}: ${error ?? 'no entró'}`))

  const presentes = g.personas.filter((p) => p.estado === 'presente').map((p) => p.persona_id)
  if (presentes.length) {
    const j = await guardarJornada({ obra_id: o.data, fecha: f.data, marcas: [], vaciar: presentes })
    anotar(`horas de ${presentes.length} persona(s)`, j.ok, j.ok ? null : j.error)
  }
  for (const p of g.personas) {
    const { data: marca } = await supabase.from('asistencia_dia').select('obra_canonica_id').eq('persona_id', p.persona_id).eq('fecha', f.data).maybeSingle()
    if ((marca as { obra_canonica_id?: string } | null)?.obra_canonica_id !== o.data) continue
    const q = await quitarPresencia({ persona_id: p.persona_id, fecha: f.data })
    anotar(`marca de ${p.nombre}`, q.ok, q.ok ? null : q.error)
  }
  for (const a of g.avances) {
    const b = await borrarParte(o.data, a.ejecucion_id)
    anotar(`avance de ${a.tarea_nombre}`, b.ok, b.ok ? null : b.error)
  }
  if (g.novedad) {
    const b = await borrarNota(o.data, g.novedad.nota_id)
    anotar('novedad', b.ok, b.ok ? null : b.error)
  }
  const cancelables = g.materiales.filter((m) => !m.procesado).map((m) => m.id_pedido)
  if (cancelables.length) {
    const b = await borrarPedidos(cancelables)
    anotar(`${cancelables.length} pedido(s) cancelado(s)`, b.ok === true, b.error)
  }
  for (const m of g.materiales.filter((x) => x.procesado)) noHecho.push(`«${m.material}» ya lo procesaron en Material: queda`)
  for (const id of g.dictados) {
    const { error } = await supabase.from('parte_dictado').update({ estado: 'anulado' }).eq('id', id).eq('estado', 'guardado')
    if (error) noHecho.push(`dictado: ${error.message}`)
  }
  const bit = await supabase.rpc('registrar_cambio_parte', { p_obra: o.data, p_fecha: f.data, p_campo: 'borrado', p_antes: resumenParaBitacora(g), p_despues: JSON.stringify({ hecho, noHecho }) })
  if (bit.error) noHecho.push(`historial: ${bit.error.message}`)
  if (!hecho.length) return { ok: false, error: `No se borró nada: ${noHecho.join(' · ')}` }
  revalidatePath(`/obras/${o.data}`)
  return { ok: true, dato: { hecho, noHecho } }
}
