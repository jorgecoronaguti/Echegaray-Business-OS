'use server'

// REGISTRAR AVANCE DESDE EL TELÉFONO — J03 y J04.
//
// ═══ QUÉ ESCRIBE, Y QUÉ NO ═══
//
//   la producción del día  → `obra_ejecucion`, CON SU FIRMA: método, criterio, si fue masivo
//   los pasos ejecutados   → `obra_actividad_paso.hecho_en`
//   las horas              → `registros_hh`, llamando a `imputarHHMasivo`, que ya existe
//
// Las horas NO se escriben acá ni de casualidad. `registros_hh` es la fuente canónica del tiempo y
// la escribe UNA sola función; si este archivo insertara sus propias filas, la misma hora quedaría
// cargada dos veces y la liquidación no sabría cuál contar. Es la misma regla que ya aplica el
// parte de escritorio.
//
// ═══ POR QUÉ NO ES `registrarEjecucion` ═══
//
// El parte de escritorio (`features/obras/services/actionsEjecucion`) es ANTERIOR a las columnas de
// firma —`metodo`, `criterio`, `cuadrilla_id`, `masivo`— y no sabe medir por pasos. Escribe partes
// válidos y sin firma. Reutilizarlo tal cual dejaría al teléfono cargando registros que dentro de
// seis meses nadie puede interpretar, que es justo lo que las columnas nuevas vinieron a arreglar.
// Unificar los dos escritores es trabajo aparte y tiene su propia superficie de regresión: queda
// DICHO acá, no resuelto en silencio.
//
// ═══ LO QUE LA BASE RECHAZA NO SE INTENTA ═══
//
// Un contenedor no se mide (trigger) y el método manual exige criterio escrito (CHECK). Las dos se
// anticipan con un mensaje que se entiende parado en la obra, en vez de dejar que vuelva el error
// de Postgres — que es correcto y no le sirve a nadie con un casco puesto.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { imputarHHMasivo } from '@/features/obras/services/actionsHH'
import type { Resultado } from '@/features/obras/services/actions'
import { leerReparto } from '@/features/obras/services/repartoHH'
import { AVISO_CRITERIO, deltaHasta, elPorcentajeMueveElAvance } from './medicion.ts'
import type { Metodo } from './medicion.ts'
import { aplicarPlan, planDePasos } from './pasos.ts'
import type { PasoDeLaTarea } from './pasos.ts'

const esquema = z.object({
  actividad_id: z.string().uuid('Elegí la tarea'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí el día'),
  /** Los pasos marcados AHORA, en la pantalla. Es el estado completo, no un delta. */
  pasos: z.string().optional(),
  cantidad: z.string().optional(),
  avance_pct: z.string().optional(),
  criterio: z.string().trim().max(500).optional(),
  comentario: z.string().trim().max(500).optional(),
})

const numero = (v: string | undefined): number | null => {
  const s = (v ?? '').trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export async function registrarAvance(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = esquema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()

  const { data: act, error: errAct } = await supabase
    .from('obra_actividad_control')
    .select('actividad_id, obra_id, nombre, tipo, metodo_avance, unidad, avance_pct')
    .eq('actividad_id', d.actividad_id).maybeSingle()
  if (errAct) return { ok: false, error: errAct.message }
  if (!act) return { ok: false, error: 'Esa tarea no existe o no es de una obra tuya.' }
  const a = act as {
    obra_id: string; nombre: string; tipo: string
    metodo_avance: Metodo | null; unidad: string | null; avance_pct: number | null
  }
  if (a.obra_id !== obraId) return { ok: false, error: 'Esa tarea es de otra obra.' }
  if (a.tipo === 'resumen') {
    return { ok: false, error: `«${a.nombre}» agrupa otras tareas: el avance se carga en las que agrupa.` }
  }
  if (!a.metodo_avance) {
    return { ok: false, error: `«${a.nombre}» no declara cómo se mide. Elegí el método desde la planificación.` }
  }

  const escrito = a.metodo_avance === 'pasos'
    ? await guardarPasos(supabase, obraId, d, a.metodo_avance)
    : await guardarMedicion(supabase, obraId, d, a)
  if (!escrito.ok) return escrito

  const efectos = [escrito.mensaje ?? 'avance guardado']
  if (leerReparto(form.entries()).length > 0) {
    // El parte ENTRA aunque las horas reboten: la producción ya está escrita y perder el dato de
    // campo por un choque de horas sería cambiar lo importante por lo accesorio.
    const horas = await imputarHHMasivo(obraId, form)
    efectos.push(horas.ok ? 'horas imputadas' : `las horas NO se cargaron: ${horas.error}`)
  }

  revalidatePath('/obra/hoy')
  revalidatePath('/obra/tareas')
  return { ok: true, mensaje: efectos.join(' · ') }
}

type Cliente = Awaited<ReturnType<typeof createClient>>

/**
 * Los pasos ejecutados. Marcar y DESMARCAR: el jefe se equivoca de renglón con el pulgar.
 *
 * QUÉ SE ESCRIBE Y EN QUÉ ORDEN LO DECIDE `pasos.ts`, que es puro y está probado. Acá queda sólo la
 * conversación con la base: leer los pasos —CON SU PESO, que es de donde sale cuánto aporta cada
 * uno— y ejecutar las tres escrituras del plan. La firma va SIEMPRE primero: el porqué, en
 * `aplicarPlan`.
 */
async function guardarPasos(
  supabase: Cliente, obraId: string, d: z.infer<typeof esquema>, metodo: Metodo,
): Promise<Resultado> {
  const marcados = new Set((d.pasos ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  const { data: pasos, error } = await supabase
    .from('obra_actividad_paso').select('id, nombre, peso, hecho_en').eq('actividad_id', d.actividad_id)
  if (error) return { ok: false, error: error.message }
  const lista = (pasos ?? []).map((p) => ({
    id: String(p.id), nombre: String(p.nombre),
    // `peso` es numeric y la cuenta que sigue es una división: se convierte una sola vez acá, en la
    // frontera, y no en el medio del cálculo. Igual que el `Number(pct)` de `getMisTareas`.
    peso: Number(p.peso ?? 0), hecho_en: (p.hecho_en as string | null) ?? null,
  })) as PasoDeLaTarea[]

  const plan = planDePasos(lista, marcados)
  if (!plan.ok) return { ok: false, error: plan.error }

  return aplicarPlan(plan, {
    // Un registro de ejecución POR PASO, con lo que ese paso aporta: es el rastro de quién y cuándo
    // lo firmó, y sin `avance_pct` la base lo rechaza (`obra_ejecucion_dice_algo`).
    firmar: async (firmas) => {
      const { error: e } = await supabase.from('obra_ejecucion').insert(firmas.map((f) => ({
        obra_id: obraId, actividad_id: d.actividad_id, fecha: d.fecha,
        metodo, paso_id: f.paso_id, avance_pct: f.avance_pct,
        comentario: d.comentario || null, fuente: 'jefe_telefono',
      })))
      return { error: e?.message ?? null }
    },
    marcar: async (ids, cuando) => {
      const { error: e } = await supabase.from('obra_actividad_paso')
        .update({ hecho_en: cuando }).in('id', [...ids])
      return { error: e?.message ?? null }
    },
    desmarcar: async (ids) => {
      const { error: e } = await supabase.from('obra_actividad_paso')
        .update({ hecho_en: null }).in('id', [...ids])
      return { error: e?.message ?? null }
    },
  }, new Date().toISOString())
}

/** Cantidad, partes o manual. El método decide qué columna se llena y qué se exige. */
async function guardarMedicion(
  supabase: Cliente, obraId: string, d: z.infer<typeof esquema>,
  a: { metodo_avance: Metodo | null; unidad: string | null; avance_pct: number | null; nombre: string },
): Promise<Resultado> {
  const metodo = a.metodo_avance as Metodo
  const criterio = d.criterio?.trim() || null
  // El CHECK de la base, anticipado con su texto literal.
  if (metodo === 'manual' && !criterio) return { ok: false, error: AVISO_CRITERIO }

  let cantidad: number | null = null
  let avance: number | null = null
  if (metodo === 'cantidad') {
    cantidad = numero(d.cantidad)
    if (cantidad == null || cantidad <= 0) {
      return { ok: false, error: `«${a.nombre}» se mide en ${a.unidad ?? 'unidades'}: poné cuánto se hizo hoy.` }
    }
  } else {
    const objetivo = numero(d.avance_pct)
    if (objetivo == null) return { ok: false, error: 'Poné a cuánto llegó la tarea.' }
    if (objetivo < 0 || objetivo > 100) return { ok: false, error: 'El avance va de 0 a 100.' }
    // Lo que se carga es el DELTA: `avance_partes` suma los partes, no los reemplaza.
    avance = deltaHasta(objetivo, a.avance_pct)
    if (avance == null) {
      return { ok: false, error: `«${a.nombre}» ya está en ${a.avance_pct ?? 0} %: no hay avance nuevo que cargar.` }
    }
  }

  const { error } = await supabase.from('obra_ejecucion').insert({
    obra_id: obraId, actividad_id: d.actividad_id, fecha: d.fecha,
    cantidad, avance_pct: avance, metodo, criterio,
    comentario: d.comentario || null, fuente: 'jefe_telefono',
  })
  if (error) return { ok: false, error: error.message }

  // CARGAR UN AVANCE ES ELEGIR EL MÉTODO. Sin esto, el jefe carga toda la semana y el porcentaje no
  // se mueve porque sigue mandando el número que declaró el Sheet. Es la misma regla del parte de
  // escritorio; `manual` NO se toca, porque ahí el número declarado ES el método.
  if (metodo === 'partes' && elPorcentajeMueveElAvance(metodo)) {
    await supabase.from('obra_actividad').update({ metodo_avance: 'partes' }).eq('id', d.actividad_id)
  }
  return {
    ok: true,
    mensaje: cantidad != null ? `+${cantidad} ${a.unidad ?? ''}`.trim() : `+${avance} % de avance`,
  }
}
