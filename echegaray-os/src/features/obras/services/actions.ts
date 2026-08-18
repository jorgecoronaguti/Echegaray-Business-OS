'use server'

// OBRA Y CRONOGRAMA — las acciones que ESCRIBEN.
//
// ═══ LAS TRES REGLAS QUE NO SE NEGOCIAN ═══
//
// 1. UNA ACTIVIDAD NO SE BORRA: SE ARCHIVA. Borrarla se lleva su avance, su línea base y su lugar
//    en la historia de la obra. `archivada = true` la saca del Gantt y de todos los promedios.
// 2. LA LÍNEA BASE SE SELLA UNA VEZ Y NO LA PISA NADIE. Ni el sincronizador de Drive ni una
//    reprogramación: si el plan aprobado se moviera con cada replanificación, el desvío daría
//    siempre cero y el módulo entero perdería sentido.
// 3. LO QUE SE EDITA ACÁ QUEDA MARCADO `editado_a_mano`, y el sincronizador de Drive no lo pisa.
//    Lo que una persona corrigió le gana al tracker.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { claveDeActividad } from './claves'

export type Resultado = { ok: true; id?: string } | { ok: false; error: string }

const fechaOpt = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'), z.literal('')]).optional()
const numOpt = z.union([z.coerce.number().nonnegative(), z.literal('')]).optional()
const vacioANull = <T,>(v: T | '' | undefined) => (v === '' || v === undefined ? null : v)

// ── OBRA ─────────────────────────────────────────────────────────────────────

const obraSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre de la obra es obligatorio'),
  cliente_id: z.string().uuid('Elegí un cliente'),
  ubicacion: z.string().trim().optional(),
  jefe_obra: z.string().trim().optional(),
  // LA ETAPA SIN DECLARAR ES UNA RESPUESTA VÁLIDA, y por eso el vacío entra en el esquema.
  // `z.enum(...).optional()` acepta que el campo NO VENGA, pero un <select> con la opción "sin
  // declarar" manda cadena vacía, no ausencia: el alta de obra moría con "Invalid enum value.
  // Expected 'previo' | ... received ''" cada vez que alguien no elegía etapa. Mismo criterio que
  // `fechaOpt` y `numOpt` acá arriba.
  etapa: z.union([z.enum(['previo', 'inicio', 'desarrollo', 'terminacion', 'cierre']), z.literal('')]).optional(),
  estado: z.enum(['activa', 'pausada', 'cerrada']).optional(),
  monto_contratado: numOpt,
  fecha_inicio_plan: fechaOpt,
  fecha_fin_plan: fechaOpt,
  fecha_inicio_real: fechaOpt,
  fecha_fin_real: fechaOpt,
  drive_carpeta_id: z.string().trim().optional(),
})

function idDeObra(nombre: string): string {
  return nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
}

export async function crearObra(form: FormData): Promise<Resultado> {
  const parsed = obraSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()

  // El id de la obra es su identificador canónico y va en la URL. Si ya existe, se avisa: dos obras
  // con el mismo id harían que una de las dos fuera inalcanzable.
  const id = idDeObra(d.nombre)
  const { data: existe } = await supabase.from('obra_canonica').select('id').eq('id', id).maybeSingle()
  if (existe) return { ok: false, error: `Ya existe una obra con el identificador "${id}"` }

  const { data: cli } = await supabase.from('clientes').select('nombre').eq('id', d.cliente_id).maybeSingle()
  const { error } = await supabase.from('obra_canonica').insert({
    id,
    nombre: d.nombre,
    cliente_id: d.cliente_id,
    cliente_texto: (cli?.nombre as string) ?? null,
    estado: d.estado ?? 'activa',
    tipo: 'obra',
    etapa: vacioANull(d.etapa),
    jefe_obra: d.jefe_obra || null,
    monto_contratado: vacioANull(d.monto_contratado),
    fecha_inicio_plan: vacioANull(d.fecha_inicio_plan),
    fecha_fin_plan: vacioANull(d.fecha_fin_plan),
    drive_carpeta_id: d.drive_carpeta_id || null,
    ubicacion: d.ubicacion || null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout'); revalidatePath('/obras')
  return { ok: true, id }
}

export async function editarObra(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = obraSchema.partial({ cliente_id: true }).safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('obra_canonica').update({
    nombre: d.nombre,
    ...(d.cliente_id ? { cliente_id: d.cliente_id } : {}),
    estado: d.estado,
    etapa: vacioANull(d.etapa),
    jefe_obra: d.jefe_obra || null,
    monto_contratado: vacioANull(d.monto_contratado),
    fecha_inicio_plan: vacioANull(d.fecha_inicio_plan),
    fecha_fin_plan: vacioANull(d.fecha_fin_plan),
    fecha_inicio_real: vacioANull(d.fecha_inicio_real),
    fecha_fin_real: vacioANull(d.fecha_fin_real),
    drive_carpeta_id: d.drive_carpeta_id || null,
    ubicacion: d.ubicacion || null,
  }).eq('id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`); revalidatePath('/obras'); revalidatePath('/clientes', 'layout')
  return { ok: true }
}

/**
 * ARCHIVAR LA OBRA — sacarla de la cartera sin perder un solo dato.
 *
 * ═══ POR QUÉ NO HAY COLUMNA `archivada` ═══
 *
 * `obra_actividad` archiva con una columna booleana porque una actividad no tiene ciclo de vida
 * propio. Una obra sí lo tiene, y ya vive en `estado`: `activa` es la que se trabaja, `pausada` la
 * que sigue en la cartera aunque hoy no avance, y `cerrada` la que terminó. Agregar `archivada` al
 * lado de `estado` crearía DOS respuestas a la misma pregunta —una obra `cerrada` y no `archivada`,
 * ¿está en la cartera?— y el OS no admite dos versiones del mismo concepto.
 *
 * Por eso archivar ES cerrar: la obra `cerrada` desaparece del portafolio y de la ficha del cliente,
 * sigue entrando por su URL, y se restaura con el mismo botón.
 *
 * ═══ LO QUE ESTA ACCIÓN NO RECUERDA ═══
 *
 * Restaurar devuelve la obra a `activa`, aunque antes estuviera `pausada`: no hay dónde guardar el
 * estado anterior y no se inventa uno. Es una pérdida chica y declarada; la alternativa era una
 * columna más para un caso que todavía no se dio.
 *
 * NO BORRA NADA. El cronograma, las HH, los costos imputados y los certificados quedan enteros, y
 * las vistas que suman por obra los siguen contando: el cliente sigue mostrando lo que esa obra
 * costó. Archivar cambia dónde se ve, nunca qué pasó.
 */
export async function archivarObra(obraId: string, archivar: boolean): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('obra_canonica')
    .update({ estado: archivar ? 'cerrada' : 'activa' }).eq('id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`); revalidatePath('/obras'); revalidatePath('/clientes', 'layout')
  return { ok: true }
}

// ── ACTIVIDADES DEL CRONOGRAMA ───────────────────────────────────────────────

const actividadSchema = z.object({
  nombre: z.string().trim().min(2, 'La actividad necesita un nombre'),
  seccion: z.string().trim().optional(),
  inicio_plan: fechaOpt,
  fin_plan: fechaOpt,
  dias_plan: numOpt,
  pct: numOpt,
  hh_plan: numOpt,
  hh_real: numOpt,
  responsable_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  cuadrilla: z.string().trim().optional(),
  comentario: z.string().trim().optional(),
  es_hito: z.union([z.literal('on'), z.literal('')]).optional(),
})

export async function crearActividad(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = actividadSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()

  // La clave sale del contenido —sección y nombre—, igual que la que genera el sincronizador de
  // Drive. Así una actividad creada en la web y una traída del tracker se identifican con la misma
  // regla, y ninguna de las dos depende de su posición en una lista.
  const clave = claveDeActividad(d.seccion ?? null, d.nombre)
  const { data: choque } = await supabase.from('obra_actividad')
    .select('id').eq('obra_id', obraId).eq('clave', clave).maybeSingle()
  if (choque) return { ok: false, error: `Ya hay una actividad "${d.nombre}" en esa sección` }

  const { data: ultima } = await supabase.from('obra_actividad')
    .select('orden').eq('obra_id', obraId).order('orden', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await supabase.from('obra_actividad').insert({
    obra_id: obraId,
    clave,
    seccion: d.seccion || null,
    nombre: d.nombre,
    tipo: d.es_hito === 'on' ? 'hito' : 'tarea',
    orden: ((ultima?.orden as number) ?? 0) + 1,
    inicio_plan: vacioANull(d.inicio_plan),
    fin_plan: vacioANull(d.fin_plan),
    dias_plan: d.es_hito === 'on' ? 0 : vacioANull(d.dias_plan),
    pct: vacioANull(d.pct),
    hh_plan: vacioANull(d.hh_plan),
    hh_real: vacioANull(d.hh_real),
    responsable_id: d.responsable_id || null,
    cuadrilla: d.cuadrilla || null,
    comentario: d.comentario || null,
    fuente: 'web',
    creada_en_web: true,
    // Nace protegida del sincronizador: la cargó una persona, no el tracker.
    editado_a_mano: true,
  }).select('id').single()
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true, id: data.id as string }
}

export async function editarActividad(obraId: string, actividadId: string, form: FormData): Promise<Resultado> {
  const parsed = actividadSchema.partial({ nombre: true }).safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('obra_actividad').update({
    ...(d.nombre ? { nombre: d.nombre } : {}),
    inicio_plan: vacioANull(d.inicio_plan),
    fin_plan: vacioANull(d.fin_plan),
    dias_plan: vacioANull(d.dias_plan),
    pct: vacioANull(d.pct),
    hh_plan: vacioANull(d.hh_plan),
    hh_real: vacioANull(d.hh_real),
    responsable_id: d.responsable_id || null,
    cuadrilla: d.cuadrilla || null,
    comentario: d.comentario || null,
    // LO QUE TOCÓ UNA PERSONA LE GANA AL TRACKER. Sin esto, la próxima corrida del sincronizador
    // pisaría la corrección con lo que dice el Sheet.
    editado_a_mano: true,
  }).eq('id', actividadId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

/** Sólo el avance — es la edición más frecuente y la que hace el jefe de obra desde el teléfono. */
export async function registrarAvance(obraId: string, actividadId: string, pct: number): Promise<Resultado> {
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { ok: false, error: 'El avance va de 0 a 100' }
  const supabase = await createClient()
  const { error } = await supabase.from('obra_actividad')
    .update({ pct: Math.round(pct), editado_a_mano: true })
    .eq('id', actividadId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`); revalidatePath('/obras'); revalidatePath('/clientes', 'layout')
  return { ok: true }
}

/**
 * MARCAR (O DESMARCAR) UNA ACTIVIDAD COMO HITO. Va aparte de `editarActividad` a propósito.
 *
 * `editarActividad` valida con el esquema en `partial`, y un checkbox que no viaja en el FormData es
 * indistinguible de uno desmarcado. Si el tipo se editara ahí, abrir el panel de una fila de
 * RESUMEN y guardar cualquier cambio la convertiría en tarea y se llevaría puesta la estructura del
 * cronograma. Acá el tipo se cambia sólo cuando alguien lo pidió, y nunca sobre un resumen.
 */
export async function marcarHito(obraId: string, actividadId: string, esHito: boolean): Promise<Resultado> {
  const supabase = await createClient()
  const { data: act } = await supabase.from('obra_actividad')
    .select('tipo').eq('id', actividadId).eq('obra_id', obraId).maybeSingle()
  if (!act) return { ok: false, error: 'No encontré esa actividad en esta obra' }
  if (act.tipo === 'resumen') {
    return { ok: false, error: 'Una fila de resumen agrupa a otras: no puede ser un hito.' }
  }
  const { error } = await supabase.from('obra_actividad')
    // El hito no dura: si tuviera días de plan, el Gantt dibujaría un rombo y una barra a la vez.
    .update({ tipo: esHito ? 'hito' : 'tarea', ...(esHito ? { dias_plan: 0 } : {}), editado_a_mano: true })
    .eq('id', actividadId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

/** Archivar, NUNCA borrar: se lleva el avance, la línea base y la historia. */
export async function archivarActividad(obraId: string, actividadId: string, archivada: boolean): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('obra_actividad')
    .update({ archivada, editado_a_mano: true }).eq('id', actividadId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

/**
 * SELLAR LA LÍNEA BASE. Congela el plan actual como el plan aprobado, una sola vez.
 *
 * Es la acción con más consecuencias del módulo: a partir de acá, mover una fecha produce un
 * desvío medible. Por eso NO se re-sella: si se pudiera volver a sellar, cualquier reprogramación
 * dejaría el desvío en cero y el tablero diría que siempre vamos en fecha.
 */
export async function sellarBaseline(obraId: string): Promise<Resultado> {
  const supabase = await createClient()
  const { data: yaSelladas } = await supabase.from('obra_actividad')
    .select('id').eq('obra_id', obraId).not('sellada_en', 'is', null).limit(1)
  if (yaSelladas && yaSelladas.length) {
    return { ok: false, error: 'Esta obra ya tiene línea base sellada. No se vuelve a sellar: el desvío se mide contra el plan que se aprobó.' }
  }
  const { data: acts, error: eLectura } = await supabase.from('obra_actividad')
    .select('id, inicio_plan, fin_plan').eq('obra_id', obraId).eq('archivada', false)
  if (eLectura) return { ok: false, error: eLectura.message }
  const conFecha = (acts ?? []).filter((a) => a.inicio_plan || a.fin_plan)
  if (!conFecha.length) return { ok: false, error: 'No hay ninguna actividad con fecha: no hay plan que sellar.' }

  const sello = new Date().toISOString()
  for (const a of conFecha) {
    const { error } = await supabase.from('obra_actividad')
      .update({ inicio_base: a.inicio_plan, fin_base: a.fin_plan, sellada_en: sello })
      .eq('id', a.id)
    if (error) return { ok: false, error: error.message }
  }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

// ── IMPEDIMENTOS ─────────────────────────────────────────────────────────────

const impedimentoSchema = z.object({
  descripcion: z.string().trim().min(3, 'Decí qué está frenando el trabajo'),
  tipo: z.string().trim().min(1),
  // Sin responsable y sin fecha comprometida no es gestión: es una queja anotada. Los dos son
  // obligatorios desde el día uno, y por eso el formulario no deja mandar sin ellos.
  responsable: z.string().trim().min(2, 'Un impedimento sin responsable no se resuelve solo'),
  fecha_compromiso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '¿Para cuándo se compromete?'),
  actividad_id: z.union([z.string().uuid(), z.literal('')]).optional(),
})

export async function crearImpedimento(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = impedimentoSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('obra_restriccion').insert({
    obra_id: obraId,
    actividad_id: d.actividad_id || null,
    tipo: d.tipo,
    descripcion: d.descripcion,
    responsable: d.responsable,
    fecha_compromiso: d.fecha_compromiso,
    estado: 'abierta',
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`); revalidatePath('/obras')
  return { ok: true }
}

export async function liberarImpedimento(obraId: string, restriccionId: string): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('obra_restriccion')
    .update({ estado: 'liberada', fecha_liberacion: new Date().toISOString().slice(0, 10) })
    .eq('id', restriccionId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`); revalidatePath('/obras')
  return { ok: true }
}
