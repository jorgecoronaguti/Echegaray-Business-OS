'use server'

// DICTAR PARTE — las acciones. Registrar el audio que ya subió el navegador, leer cómo va la
// transcripción, y GUARDAR la propuesta revisada por las MISMAS puertas que el parte tipeado.
//
// ═══ EL AUDIO NO PASA POR ACÁ ═══
//
// La Server Action tiene 1 MB de techo y tres minutos de WAV son 5,8 MB. El navegador sube el objeto
// al bucket `partes-dictados` con la sesión del usuario (como las fotos del parte) y acá llega sólo el
// renglón. La cerradura es Postgres: `es_administracion() and ve_obra()` en el bucket y en la tabla.
//
// ═══ GUARDAR NO ES UNA ESCRITURA NUEVA ═══
//
//   asistencia y horas   → `guardarJornada` (la puerta de Gente / Cargar asistencia)
//   avance y novedad     → `guardarParteDiario` (la puerta del Parte diario tipeado)
//   material que falta   → `pedirMaterialAction` (la puerta de Herramientas › Material)
//
// Cada una conserva sus reglas (quincena cerrada, obra cerrada, actividad de otra obra, validación
// del pedido) y su acuse. Si una rebota, las otras igual entran y el acuse dice cuál no: perder la
// asistencia porque un material vino mal escrito sería cambiar lo importante por lo accesorio.
//
// LAS HORAS NO SE IMPUTAN A LA TAREA en `registros_hh`: la asistencia las registra como jornada (sin
// tarea, a propósito) y una segunda fila con tarea las contaría dos veces en el costo de mano de obra
// y en la liquidación. La tarea de cada persona queda en el comentario del renglón de avance y en
// `parte_dictado.resultado.horasPorTarea`.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { guardarJornada } from '@/features/administracion/services/jornadaPorObraActions'
import { pedirMaterialAction } from '@/features/materiales/services/acciones'
import { guardarParteDiario } from './actionsEjecucion'
import { notaDelPedido } from './parteGuardadoActions'
import {
  comentarioDeTarea, horasPorTarea, numeroParaElParte, textoDeMaterial,
  type Dictado, type Envio, type Propuesta, type ResultadoGuardado,
} from './dictadoParte'

export type R<T = undefined> = { ok: true; dato: T } | { ok: false; error: string }

const BUCKET = 'partes-dictados'
const Id = z.string().uuid()
const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Obra = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)
const COLUMNAS = 'id, obra_id, fecha, estado, motivo, duracion_s, transcripcion, propuesta, creado_en, cerrado_en, resultado, es_correccion'

const Alta = z.object({
  obraId: Obra,
  fecha: Fecha,
  audioPath: z.string().min(10).max(300),
  bytes: z.number().int().positive().max(12582912),
  duracionS: z.number().positive().max(200),
  /** «Dictar corrección»: se aplica como cambio sobre el parte que ya existe. */
  esCorreccion: z.boolean().optional(),
})

function traducir(msg: string): string {
  if (/row-level security|permission denied|42501/i.test(msg)) return 'No tenés permiso para dictar el parte de esta obra.'
  return msg
}

/** REGISTRAR EL AUDIO QUE YA ESTÁ EN EL BUCKET. La VM lo toma en los próximos 15 s. */
export async function crearDictado(entrada: z.infer<typeof Alta>): Promise<R<string>> {
  const p = Alta.safeParse(entrada)
  if (!p.success) return { ok: false, error: 'Faltan datos del audio o son inválidos.' }
  const { obraId, fecha, audioPath, bytes, duracionS, esCorreccion } = p.data
  if (!audioPath.startsWith(`obra/${obraId}/${fecha}/`) || !audioPath.endsWith('.wav')) {
    return { ok: false, error: 'Ese audio no corresponde a esta obra y este día.' }
  }
  const supabase = await createClient()
  const { data: u } = await supabase.auth.getUser()
  if (!u?.user) return { ok: false, error: 'Tenés que iniciar sesión.' }
  const { data, error } = await supabase.from('parte_dictado').insert({
    obra_id: obraId, fecha, dictado_por: u.user.id, audio_path: audioPath, audio_bytes: bytes,
    duracion_s: Math.round(duracionS * 10) / 10, es_correccion: esCorreccion === true,
  }).select('id').single()
  if (error) return { ok: false, error: traducir(error.message) }
  return { ok: true, dato: String(data.id) }
}

/** CÓMO VA. La pantalla lo pregunta cada dos segundos mientras la VM transcribe. */
export async function leerDictado(id: string): Promise<R<Dictado>> {
  const i = Id.safeParse(id)
  if (!i.success) return { ok: false, error: 'Ese dictado no existe.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('parte_dictado').select(COLUMNAS).eq('id', i.data).maybeSingle()
  if (error) return { ok: false, error: traducir(error.message) }
  if (!data) return { ok: false, error: 'Ese dictado no existe o no lo ves.' }
  return { ok: true, dato: data as unknown as Dictado }
}

/**
 * LOS DICTADOS DE UN DÍA: los guardados (para «ver lo que dijo») y el último que quedó sin cerrar
 * (para retomar la revisión si se recargó la página). Los descartados no se listan.
 */
export async function dictadosDelDia(obraId: string, fecha: string): Promise<R<Dictado[]>> {
  const o = Obra.safeParse(obraId); const f = Fecha.safeParse(fecha)
  if (!o.success || !f.success) return { ok: false, error: 'Obra o día inválidos.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('parte_dictado').select(COLUMNAS)
    .eq('obra_id', o.data).eq('fecha', f.data).not('estado', 'in', '(descartado,anulado)')
    .order('creado_en', { ascending: false }).limit(20)
  if (error) return { ok: false, error: traducir(error.message) }
  return { ok: true, dato: (data ?? []) as unknown as Dictado[] }
}

/** EL AUDIO, FIRMADO POR DIEZ MINUTOS. Nunca bucket público. */
export async function audioDelDictado(id: string): Promise<R<string>> {
  const d = await leerDictado(id)
  if (!d.ok) return d
  const supabase = await createClient()
  const { data: fila } = await supabase.from('parte_dictado').select('audio_path').eq('id', d.dato.id).maybeSingle()
  const ruta = (fila as { audio_path?: string } | null)?.audio_path
  if (!ruta) return { ok: false, error: 'No encontré el audio.' }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 600)
  if (error || !data?.signedUrl) return { ok: false, error: 'No se pudo abrir el audio.' }
  return { ok: true, dato: data.signedUrl }
}

/** DESCARTAR LO DICTADO. El audio queda (sin borrado): es lo que se dijo. */
export async function descartarDictado(id: string): Promise<R> {
  const i = Id.safeParse(id)
  if (!i.success) return { ok: false, error: 'Ese dictado no existe.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('parte_dictado').update({ estado: 'descartado' })
    .eq('id', i.data).in('estado', ['pendiente', 'transcribiendo', 'listo', 'error']).select('id').maybeSingle()
  if (error) return { ok: false, error: traducir(error.message) }
  if (!data) return { ok: false, error: 'Ese dictado ya estaba cerrado.' }
  return { ok: true, dato: undefined }
}

const EnvioSchema = z.object({
  fecha: Fecha,
  personas: z.array(z.object({
    persona_id: z.string().uuid(),
    estado: z.enum(['presente', 'ausente']),
    horas: z.number().positive().max(24).nullable(),
    tarea_id: z.string().uuid().nullable(),
  })).max(200),
  avances: z.array(z.object({ tarea_id: z.string().uuid(), produccion: z.number().positive().max(1e7) })).max(200),
  materiales: z.array(z.object({
    material: z.string().trim().min(1).max(160), cantidad: z.number().positive().max(1e7), unidad: z.string().trim().max(24),
  })).max(50),
  urgencia: z.enum(['hoy', 'semana', 'cuando_se_pueda']),
  novedad: z.string().max(1000),
})

/**
 * GUARDAR EL PARTE DICTADO. Sólo lo que la persona revisó y confirmó (`armarEnvio` ya rechazó lo que
 * quedaba naranja); acá se vuelve a controlar lo que el navegador no puede garantizar: que el dictado
 * sea de esta obra y siga abierto, y que cada persona sea una de las que la propuesta ofreció.
 */
export async function guardarDictado(obraId: string, id: string, entrada: Envio, novedadActividad: string | null): Promise<R<ResultadoGuardado>> {
  const o = Obra.safeParse(obraId); const i = Id.safeParse(id); const e = EnvioSchema.safeParse(entrada)
  if (!o.success || !i.success) return { ok: false, error: 'Obra o dictado inválidos.' }
  if (!e.success) return { ok: false, error: `Algo del parte vino mal: ${e.error.issues[0].message}` }
  const envio = e.data
  const leido = await leerDictado(i.data)
  if (!leido.ok) return leido
  const d = leido.dato
  if (d.obra_id !== o.data) return { ok: false, error: 'Ese dictado es de otra obra.' }
  if (d.fecha !== envio.fecha) return { ok: false, error: 'Ese dictado es de otro día.' }
  if (d.estado !== 'listo' || !d.propuesta) return { ok: false, error: d.estado === 'guardado' ? 'Ese parte ya se guardó.' : 'Ese dictado todavía no está listo.' }

  // SÓLO PERSONAS QUE LA PROPUESTA OFRECIÓ (y ella sólo conoce el plantel de ESTA obra).
  const propuesta = d.propuesta as Propuesta
  const ofrecidas = new Set(propuesta.personas.flatMap((f) => [f.persona_id, ...(f.candidatos ?? []).map((c) => c.id)]).filter(Boolean) as string[])
  const ajena = envio.personas.find((p) => !ofrecidas.has(p.persona_id))
  if (ajena) return { ok: false, error: 'Hay una persona que no salió del dictado de esta obra. No se guardó nada.' }
  const nombres = new Map<string, string>()
  for (const f of propuesta.personas) {
    if (f.persona_id) nombres.set(f.persona_id, f.nombre)
    for (const c of f.candidatos ?? []) nombres.set(c.id, c.nombre)
  }

  const supabase = await createClient()
  const { data: obra } = await supabase.from('obra_canonica').select('jornada_horas').eq('id', o.data).maybeSingle()
  const jornada = Number((obra as { jornada_horas?: number | string | null } | null)?.jornada_horas) || 8
  const { data: tareasObra } = await supabase.from('obra_actividad').select('id, nombre').eq('obra_id', o.data).limit(2000)
  const tareas = new Map(((tareasObra ?? []) as { id: string; nombre: string }[]).map((t) => [t.id, t.nombre]))
  if ([...envio.avances.map((a) => a.tarea_id), ...envio.personas.map((p) => p.tarea_id)].some((t) => t && !tareas.has(t))) {
    return { ok: false, error: 'Hay una tarea que no es de esta obra. No se guardó nada.' }
  }

  const resultado: ResultadoGuardado = {
    asistencia: null, parte: null, material: null,
    horasPorTarea: horasPorTarea(envio.personas.map((p) => ({ ...p, tarea_nombre: p.tarea_id ? tareas.get(p.tarea_id) ?? null : null }))),
    presentes: envio.personas.filter((p) => p.estado === 'presente').length,
    tareas: Object.fromEntries(envio.personas.filter((p) => p.estado === 'presente' && p.tarea_id).map((p) => [p.persona_id, p.tarea_id as string])),
    nota_id: null,
    ausentes: envio.personas.filter((p) => p.estado === 'ausente').length,
    pedido: null,
  }

  // 1 · ASISTENCIA Y HORAS — la puerta de Gente.
  if (envio.personas.length) {
    const r = await guardarJornada({
      obra_id: o.data, fecha: envio.fecha,
      marcas: envio.personas.map((p) => p.estado === 'presente'
        ? { persona_id: p.persona_id, estado: 'presente' as const, horas: p.horas as number }
        // La falta dictada no trae motivo: se registra sin motivo, que es lo honesto (`planDeJornada`).
        : { persona_id: p.persona_id, estado: 'ausente' as const, horas: jornada, motivo: null }),
    })
    resultado.asistencia = r.ok ? { ok: true, mensaje: r.mensaje || 'Asistencia cargada.' } : { ok: false, mensaje: r.error }
  }

  // 2 · AVANCE Y NOVEDAD — la puerta del Parte diario.
  if (envio.avances.length || envio.novedad.trim()) {
    const f = new FormData()
    f.set('fecha', envio.fecha)
    f.set('novedad', envio.novedad.trim())
    f.set('novedad_actividad', novedadActividad && tareas.has(novedadActividad) ? novedadActividad : '')
    for (const a of envio.avances) {
      f.set(`produccion_${a.tarea_id}`, numeroParaElParte(a.produccion))
      const c = comentarioDeTarea(a.tarea_id, envio.personas, nombres)
      if (c) f.set(`comentario_${a.tarea_id}`, c)
    }
    const r = await guardarParteDiario(o.data, f)
    resultado.parte = r.ok ? { ok: true, mensaje: r.mensaje ?? 'Parte guardado.' } : { ok: false, mensaje: r.error }
    // La nota que dejó el parte, para poder editarla o borrarla con el parte (no tiene fecha propia).
    if (r.ok && envio.novedad.trim()) {
      const { data: u } = await supabase.auth.getUser()
      const { data: n } = await supabase.from('obra_actividad_nota').select('id').eq('obra_id', o.data).eq('texto', envio.novedad.trim())
        .eq('creado_por', u?.user?.id ?? '').order('creado_en', { ascending: false }).limit(1).maybeSingle()
      resultado.nota_id = (n as { id?: string } | null)?.id ?? null
    }
  }

  // 3 · MATERIAL QUE FALTA — la puerta de Herramientas › Material.
  if (envio.materiales.length) {
    const f = new FormData()
    f.set('obra_id', o.data)
    f.set('urgencia', envio.urgencia)
    // La nota es la llave con la que el parte vuelve a encontrar su pedido para editarlo o cancelarlo.
    f.set('nota', await notaDelPedido(envio.fecha))
    for (const m of envio.materiales) { f.append('material', m.material); f.append('cantidad', numeroParaElParte(m.cantidad).replace(',', '.')); f.append('unidad', m.unidad) }
    const r = await pedirMaterialAction({ error: null }, f)
    resultado.material = r.ok ? { ok: true, mensaje: r.mensaje ?? 'Pedido cargado.' } : { ok: false, mensaje: r.error ?? 'El pedido no entró.' }
    resultado.pedido = envio.materiales.map(textoDeMaterial).join(', ')
  }

  const puertas = [resultado.asistencia, resultado.parte, resultado.material].filter((x) => x != null)
  if (puertas.length && puertas.every((x) => !x.ok)) {
    return { ok: false, error: `No se guardó nada: ${puertas.map((x) => x.mensaje).join(' · ')}` }
  }

  // Lo que entró queda escrito en el dictado. Si esto fallara, el parte YA está guardado: se dice.
  const { error } = await supabase.from('parte_dictado').update({ estado: 'guardado', resultado }).eq('id', i.data).eq('estado', 'listo')
  if (error) resultado.parte = { ok: resultado.parte?.ok ?? true, mensaje: `${resultado.parte?.mensaje ?? ''} (el dictado no quedó marcado como guardado: ${error.message})`.trim() }
  revalidatePath(`/obras/${o.data}`)
  return { ok: true, dato: resultado }
}
