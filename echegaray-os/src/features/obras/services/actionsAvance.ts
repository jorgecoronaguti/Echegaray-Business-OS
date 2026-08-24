'use server'

// REGISTRAR UN AVANCE — pantalla 05, y su versión en lote de la 06.
//
// ═══ CADA MÉTODO ESCRIBE EN SU LUGAR, O NO ESCRIBE NADA ═══
//
// `obra_actividad_control` calcula el avance de cuatro maneras distintas y cada una lee una fuente
// distinta (ver la cabecera de `avance.ts`). Escribir en el lugar equivocado NO da error: deja el
// registro firmado, con autor y hora, y la actividad quieta en el mismo porcentaje. Es la peor
// falla posible porque parece un éxito.
//
//   pasos    → se tildan los pasos, y el registro guarda el porcentaje resultante como foto
//   cantidad → se guarda la DIFERENCIA contra lo ya acumulado, nunca el acumulado
//   partes   → se guarda la DIFERENCIA de porcentaje, nunca el porcentaje objetivo
//   manual   → se escribe `obra_actividad.pct`, y el registro exige criterio (CHECK en la base)
//
// ═══ EL REGISTRO SE FIRMA SOLO ═══
//
// `creado_por` tiene `default auth.uid()` desde el 21/08/2026 y por eso NO se manda desde acá: un
// autor que viaja en el formulario es un autor que se puede editar desde el navegador.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './actions'
import type { ResultadoMasivo } from './actionsMasivas'
import { avancePorPasos, deltaDeAvance, deltaDeCantidad, operacionCompatible, OPERACIONES_MASIVAS } from './avance'
import type { MetodoAvance } from '../types'

const METODOS_REGISTRABLES = ['pasos', 'cantidad', 'manual'] as const

const registroSchema = z.object({
  metodo: z.enum(METODOS_REGISTRABLES),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí el día'),
  cantidad_ejecutada: z.union([z.coerce.number().min(0), z.literal('')]).optional(),
  avance_pct: z.union([z.coerce.number().min(0).max(100), z.literal('')]).optional(),
  criterio: z.string().trim().max(500).optional(),
  cuadrilla_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  comentario: z.string().trim().max(500).optional(),
})

/** Lo que la actividad necesita decir de sí misma antes de que se le escriba un avance. */
interface Medida {
  tipo: string
  metodo_avance: MetodoAvance
  cantidad_objetivo: number | null
  cantidad_ejecutada: number | null
  avance_partes: number | null
  avance_pct: number | null
  nombre: string
}

async function leerMedida(
  supabase: Awaited<ReturnType<typeof createClient>>, obraId: string, actividadId: string,
): Promise<{ m: Medida } | { error: string }> {
  const { data, error } = await supabase.from('obra_actividad_control')
    .select('tipo, metodo_avance, cantidad_objetivo, cantidad_ejecutada, avance_partes, avance_pct, nombre, obra_id')
    .eq('actividad_id', actividadId).maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Esa actividad no existe.' }
  if (data.obra_id !== obraId) return { error: 'Esa actividad es de otra obra.' }
  // La base también lo rechaza (`obra_ejecucion_no_va_al_contenedor`). Acá se dice en castellano.
  if (data.tipo === 'resumen') {
    return { error: 'Es un contenedor: el avance se registra en las actividades que agrupa.' }
  }
  return { m: data as unknown as Medida }
}

/** Marca los pasos tildados y destilda el resto. Devuelve el avance que queda. */
async function escribirPasos(
  supabase: Awaited<ReturnType<typeof createClient>>, actividadId: string, tildados: Set<string>,
): Promise<{ avance: number | null } | { error: string }> {
  const { data, error } = await supabase.from('obra_actividad_paso')
    .select('id, peso, hecho_en').eq('actividad_id', actividadId)
  if (error) return { error: error.message }
  const pasos = (data ?? []) as { id: string; peso: number; hecho_en: string | null }[]
  if (pasos.length === 0) return { error: 'Esta actividad no tiene pasos cargados todavía.' }
  const ahora = new Date().toISOString()
  for (const p of pasos) {
    const debeEstarHecho = tildados.has(p.id)
    if (debeEstarHecho === (p.hecho_en !== null)) continue
    const { error: e } = await supabase.from('obra_actividad_paso')
      .update({ hecho_en: debeEstarHecho ? ahora : null }).eq('id', p.id)
    if (e) return { error: e.message }
  }
  return { avance: avancePorPasos(pasos.map((p) => ({ peso: Number(p.peso), hecho: tildados.has(p.id) }))) }
}

/**
 * REGISTRAR EL AVANCE DE UNA ACTIVIDAD.
 *
 * El `actividad_id` viaja atado por `bind`, nunca en un campo del formulario: un id editable desde
 * el navegador dejaría escribir el avance de la actividad de al lado.
 */
export async function registrarAvance(
  obraId: string, actividadId: string, form: FormData,
): Promise<Resultado> {
  const parsed = registroSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  // EL CRITERIO DEL MÉTODO MANUAL NO ES UNA REGLA DE FORMULARIO. La base tiene el CHECK porque la
  // misma fila entra por el teléfono, por el parte diario y por una acción en lote; acá se valida
  // para poder decirlo en castellano en vez de mostrar el error de Postgres.
  const criterio = (d.criterio ?? '').trim()
  if (d.metodo === 'manual' && !criterio) {
    return {
      ok: false,
      error: 'El método manual exige un criterio escrito. Sin eso el porcentaje no se puede interpretar después.',
    }
  }

  const supabase = await createClient()
  const leida = await leerMedida(supabase, obraId, actividadId)
  if ('error' in leida) return { ok: false, error: leida.error }
  const m = leida.m

  let cantidad: number | null = null
  let avance: number | null = null
  let efecto = ''

  if (d.metodo === 'pasos') {
    const tildados = new Set(form.getAll('paso').map(String))
    const r = await escribirPasos(supabase, actividadId, tildados)
    if ('error' in r) return { ok: false, error: r.error }
    avance = r.avance
    efecto = `${tildados.size} paso(s) ejecutados · ${avance ?? '—'} %`
  } else if (d.metodo === 'cantidad') {
    if (d.cantidad_ejecutada === '' || d.cantidad_ejecutada === undefined) {
      return { ok: false, error: 'Poné la cantidad ejecutada acumulada.' }
    }
    if (m.cantidad_objetivo === null) {
      return { ok: false, error: 'Esta actividad no tiene cantidad objetivo: sin el total no hay porcentaje.' }
    }
    cantidad = deltaDeCantidad(Number(d.cantidad_ejecutada), m.cantidad_ejecutada)
    if (cantidad === 0) return { ok: false, error: 'Ese acumulado ya está registrado: no hay nada nuevo que guardar.' }
    efecto = `${cantidad > 0 ? '+' : ''}${cantidad} sobre lo acumulado`
  } else {
    if (d.avance_pct === '' || d.avance_pct === undefined) {
      return { ok: false, error: 'Elegí el porcentaje declarado.' }
    }
    avance = Number(d.avance_pct)
    efecto = `${avance} % declarado`
  }

  const evidencia = form.getAll('evidencia').map(String).filter(Boolean)
  const { error } = await supabase.from('obra_ejecucion').insert({
    obra_id: obraId,
    actividad_id: actividadId,
    fecha: d.fecha,
    cantidad,
    avance_pct: avance,
    metodo: d.metodo,
    criterio: criterio || null,
    cuadrilla_id: d.cuadrilla_id || null,
    evidencia: evidencia.length > 0 ? evidencia : null,
    comentario: d.comentario || null,
    fuente: 'web',
    masivo: false,
  })
  if (error) return { ok: false, error: error.message }

  // REGISTRAR ES ELEGIR EL MÉTODO. Sin esto, alguien tilda pasos toda la semana y el porcentaje no
  // se mueve porque la actividad sigue leyendo el número que declaró el Sheet.
  const cambios: Record<string, unknown> = { metodo_avance: d.metodo }
  if (d.metodo === 'manual') cambios.pct = avance
  const { error: eAct } = await supabase.from('obra_actividad')
    .update(cambios).eq('id', actividadId).eq('obra_id', obraId)
  if (eAct) return { ok: false, error: eAct.message }

  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: `Registrado: ${efecto}.` }
}

const masivoSchema = z.object({
  operacion: z.enum(OPERACIONES_MASIVAS),
  valor: z.string().trim().min(1, 'Elegí el valor a aplicar'),
  ids: z.array(z.string().uuid()).min(1, 'No hay ninguna actividad seleccionada').max(2000),
})

interface FilaLote {
  actividad_id: string
  tipo: string
  metodo_avance: MetodoAvance
  cantidad_objetivo: number | null
  cantidad_ejecutada: number | null
  avance_partes: number | null
  avance_pct: number | null
  inicio_plan: string | null
  fin_plan: string | null
}

/** Correr una fecha N días. Días de calendario: el calendario laboral por obra lo aplica el motor
 *  de cronograma, y hacerlo distinto acá sería una segunda definición del plazo. */
function correr(iso: string | null, dias: number): string | null {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Qué escribir en UNA fila para la operación pedida. `null` = esta fila no se toca. */
function cambioDeFila(f: FilaLote, op: string, valor: string): Record<string, unknown> | null {
  if (op === 'estado') return { estado: valor }
  if (op === 'responsable') return { cuadrilla_id: valor || null }
  if (op === 'fechas') {
    const dias = Number(valor)
    if (!Number.isFinite(dias) || dias === 0) return null
    if (!f.inicio_plan && !f.fin_plan) return null
    return { inicio_plan: correr(f.inicio_plan, dias), fin_plan: correr(f.fin_plan, dias) }
  }
  return null
}

/**
 * APLICAR UNA OPERACIÓN A MUCHAS ACTIVIDADES — pantalla 06.
 *
 * ═══ SE INFORMA EL EFECTO, NO UN «LISTO» ═══
 *
 * Devuelve cuántas se tocaron, cuántas quedaron afuera y por qué. Un «listo» genérico sobre una
 * selección de veinte es exactamente el caso en el que una escritura toca la mitad y nadie se
 * entera. Las que quedan afuera son las que se miden por pasos —ahí el porcentaje lo produce el
 * tildado, no un número general— y las que no tienen cantidad objetivo.
 *
 * LOS IDS VIENEN DEL CLIENTE porque los eligió una persona; por eso la lectura vuelve a acotar por
 * `obra_id` antes de escribir una sola fila.
 */
export async function aplicarEnLote(obraId: string, form: FormData): Promise<ResultadoMasivo> {
  const parsed = masivoSchema.safeParse({
    operacion: form.get('operacion'),
    valor: form.get('valor'),
    ids: form.getAll('id').map(String),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { operacion, valor, ids } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.from('obra_actividad_control')
    .select('actividad_id, tipo, metodo_avance, cantidad_objetivo, cantidad_ejecutada, avance_partes, avance_pct, inicio_plan, fin_plan')
    .eq('obra_id', obraId).in('actividad_id', ids)
  if (error) return { ok: false, error: error.message }
  const filas = (data ?? []) as FilaLote[]

  const aptas = filas.filter((f) => operacionCompatible({
    id: f.actividad_id,
    metodo_avance: f.metodo_avance,
    cantidad_objetivo: f.cantidad_objetivo,
    avance_pct: f.avance_pct,
    es_contenedor: f.tipo === 'resumen',
    es_subcontrato: false,
    n_pasos: 0,
  }, operacion))
  const salteadas = ids.length - aptas.length

  const tocadas = operacion === 'avance'
    ? await escribirAvanceEnLote(supabase, obraId, aptas, Number(valor))
    : await escribirAtributoEnLote(supabase, obraId, aptas, operacion, valor)
  if (typeof tocadas === 'string') return { ok: false, error: tocadas }

  revalidatePath(`/obras/${obraId}`)
  return {
    ok: true,
    tocadas,
    salteadas,
    motivo: salteadas > 0
      ? 'se miden por pasos o no tienen cantidad objetivo: un porcentaje general no movería su número'
      : null,
  }
}

/** El avance en lote, cada método por su camino. Devuelve cuántas se escribieron, o el error. */
async function escribirAvanceEnLote(
  supabase: Awaited<ReturnType<typeof createClient>>, obraId: string, filas: FilaLote[], pct: number,
): Promise<number | string> {
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return 'El avance va de 0 a 100.'
  const hoy = new Date().toISOString().slice(0, 10)
  let n = 0
  for (const f of filas) {
    const registro: Record<string, unknown> = {
      obra_id: obraId, actividad_id: f.actividad_id, fecha: hoy,
      metodo: f.metodo_avance, fuente: 'web', masivo: true,
    }
    if (f.metodo_avance === 'cantidad') {
      const objetivo = f.cantidad_objetivo as number
      registro.cantidad = deltaDeCantidad((pct / 100) * objetivo, f.cantidad_ejecutada)
      registro.avance_pct = null
    } else if (f.metodo_avance === 'partes') {
      registro.avance_pct = deltaDeAvance(pct, f.avance_partes)
      // Un delta de 0 sería una fila que no cambia nada y ensucia el historial.
      if (registro.avance_pct === 0) continue
    } else {
      registro.avance_pct = pct
      // El método manual EXIGE criterio, también en lote — y sobre todo en lote.
      registro.criterio = `Avance aplicado en lote a ${filas.length} actividades desde el panel.`
    }
    const { error } = await supabase.from('obra_ejecucion').insert(registro)
    if (error) return error.message
    if (f.metodo_avance === 'manual') {
      const { error: e } = await supabase.from('obra_actividad')
        .update({ pct }).eq('id', f.actividad_id).eq('obra_id', obraId)
      if (e) return e.message
    }
    n += 1
  }
  return n
}

/** Estado, responsable y fechas: son atributos de la fila y se escriben en la tabla. */
async function escribirAtributoEnLote(
  supabase: Awaited<ReturnType<typeof createClient>>, obraId: string,
  filas: FilaLote[], operacion: string, valor: string,
): Promise<number | string> {
  let n = 0
  for (const f of filas) {
    const cambio = cambioDeFila(f, operacion, valor)
    if (!cambio) continue
    const { error } = await supabase.from('obra_actividad')
      .update(cambio).eq('id', f.actividad_id).eq('obra_id', obraId)
    if (error) return error.message
    n += 1
  }
  return n
}

// ═══ LOS CAMPOS QUE SE CORRIGEN EN LA CELDA ═══
//
// Sin esto, una actividad no puede llegar nunca a medirse por cantidad desde el workspace: el
// objetivo y la unidad sólo se cargaban desde el panel viejo del cronograma. Y son exactamente los
// dos datos que faltan en las 275 actividades de las tres obras.
//
// El campo viaja como literal ACOTADO por Zod y el nombre de la columna sale de un mapa cerrado: un
// campo libre desde el navegador sería un `update` a la columna que se le ocurra a quien lo mande.
const CAMPOS_EDITABLES = {
  // EL NOMBRE SE CORRIGE EN LA LISTA (24/08): un typo en el nombre de una actividad obligaba a
  // abrir otra pantalla, y por eso no se corregía nunca. No puede quedar VACÍO —la columna es NOT
  // NULL y una actividad sin nombre desaparece de la lista, del Gantt y del panel a la vez—, así
  // que es el único campo cuyo vacío es un error y no un «sin cargar».
  nombre: 'texto_obligatorio',
  cantidad_objetivo: 'numero',
  unidad: 'texto',
  hh_plan: 'numero',
  cuadrilla_id: 'uuid',
  fin_plan: 'fecha',
  inicio_plan: 'fecha',
} as const

const campoSchema = z.object({
  campo: z.enum(['nombre', 'cantidad_objetivo', 'unidad', 'hh_plan', 'cuadrilla_id', 'fin_plan', 'inicio_plan']),
  valor: z.string().trim().max(120),
})

/** Un vacío se guarda como NULL, nunca como 0 ni como cadena vacía: «sin cargar» es un estado real
 *  y confundirlo con cero ya guardó una vez un contrato de $0 en este repositorio. */
function valorTipado(campo: keyof typeof CAMPOS_EDITABLES, crudo: string): unknown | { error: string } {
  if (CAMPOS_EDITABLES[campo] === 'texto_obligatorio') {
    return crudo.length >= 2 ? crudo : { error: 'La actividad no puede quedarse sin nombre.' }
  }
  if (crudo === '') return null
  switch (CAMPOS_EDITABLES[campo]) {
    case 'numero': {
      const n = Number(crudo)
      if (!Number.isFinite(n) || n < 0) return { error: 'Tiene que ser un número que no sea negativo.' }
      return n
    }
    case 'fecha':
      return /^\d{4}-\d{2}-\d{2}$/.test(crudo) ? crudo : { error: 'La fecha va como AAAA-MM-DD.' }
    case 'uuid':
      return /^[0-9a-f-]{36}$/i.test(crudo) ? crudo : { error: 'Esa cuadrilla no existe.' }
    default:
      return crudo
  }
}

export async function editarCampoDeTarea(
  obraId: string, actividadId: string, campoRaw: string, valorRaw: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = campoSchema.safeParse({ campo: campoRaw, valor: valorRaw })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const valor = valorTipado(parsed.data.campo, parsed.data.valor)
  if (valor !== null && typeof valor === 'object' && 'error' in valor) {
    return { ok: false, error: (valor as { error: string }).error }
  }

  const supabase = await createClient()
  const cambio: Record<string, unknown> = { [parsed.data.campo]: valor }

  // ═══ MEDIR POR CANTIDAD EXIGE LAS DOS MITADES ═══
  //
  // La base tiene el CHECK `obra_actividad_medible_completa`: `metodo_avance = 'cantidad'` sin
  // unidad **o** sin objetivo se rechaza —y con razón, porque «48» sin decir de qué es un número
  // que nadie puede interpretar—. Por eso el método se elige mirando cómo queda la fila DESPUÉS del
  // cambio, no sólo el campo que se tocó: cargar la unidad sobre una actividad que ya tenía el
  // objetivo también la deja medible, y al revés.
  //
  // Y elegir el método es la mitad del trabajo: sin esto, alguien carga producción todos los días y
  // el porcentaje no se mueve porque la actividad sigue leyendo el número que declaró el Sheet.
  if (parsed.data.campo === 'cantidad_objetivo' || parsed.data.campo === 'unidad') {
    const { data: antes } = await supabase.from('obra_actividad')
      .select('unidad, cantidad_objetivo, metodo_avance')
      .eq('id', actividadId).eq('obra_id', obraId).maybeSingle()
    if (!antes) return { ok: false, error: 'Esa actividad no existe o no es de esta obra.' }
    const unidad = parsed.data.campo === 'unidad' ? valor : antes.unidad
    const objetivo = parsed.data.campo === 'cantidad_objetivo' ? valor : antes.cantidad_objetivo
    const medible = unidad !== null && unidad !== '' && objetivo !== null
    if (medible) cambio.metodo_avance = 'cantidad'
    // Y si se BORRA una de las dos, la actividad deja de poder medirse así: vuelve a declararse a
    // mano en vez de quedar con un método que la base ya no acepta.
    else if (antes.metodo_avance === 'cantidad') cambio.metodo_avance = 'manual'
  }

  const { error } = await supabase.from('obra_actividad')
    .update(cambio).eq('id', actividadId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}
