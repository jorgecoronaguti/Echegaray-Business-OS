'use server'

// CREAR LA ESTRUCTURA DE UNA OBRA (diseño ERP Obras C02–C10) — las acciones que ESCRIBEN.
//
// ═══ LA REGLA ═══
//
// Cada acción valida con Zod lo que llega del navegador, exige permiso de Administración (falla
// CERRADA: sin perfil legible no se toca la estructura) y acota toda escritura por `obra_id`. Los
// triggers de la base son la última palabra; acá se anticipan con una frase en castellano.
//
// Ninguna inventa un dato: un campo vacío se guarda como NULL y NUNCA como 0.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import type { Rol } from '@/features/auth/types'
import { claveDeActividad, slug } from './claves'
import { coefDe, costoMODeLaPartida, type ComponenteMO } from './partidasParaConvertir'
import { sellarBaseline, type Resultado } from './actions'
import { leerPlanilla } from './planillaPegada'
import { correrDiasHabiles, METODOS_REPARTO, vistaPreviaFrentes } from './estructura'
import { conservaLaCantidad } from './panelTarea'
import { versionQueVale } from './versionDelPresupuesto'

type Cliente = Awaited<ReturnType<typeof createClient>>

const SIN_PERMISO = 'Crear o cambiar la estructura de la obra es de Administración y de la jefatura de obra.'

async function esAdmin(supabase: Cliente): Promise<boolean> {
  const perfil = await getPerfilActual(supabase)
  if (perfil.error || !perfil.data) return false
  return esAdministracion((perfil.data as { rol?: Rol | null }).rol ?? null)
}

async function ordenSiguiente(supabase: Cliente, obraId: string): Promise<number> {
  const { data } = await supabase.from('obra_actividad')
    .select('orden').eq('obra_id', obraId).order('orden', { ascending: false }).limit(1).maybeSingle()
  return ((data?.orden as number) ?? 0) + 1
}


// ── C02 · CONVERTIR PARTIDAS DESDE LA OBRA ───────────────────────────────────

const convertirSchema = z.object({
  partidas: z.array(z.string().uuid()).min(1, 'Elegí al menos una partida').max(500),
  frentes: z.string().trim().max(600).optional(),
})

/**
 * CONVERTIR LAS PARTIDAS ELEGIDAS EN HISTORIAS DE ESTA OBRA (C02, serie B).
 *
 *   Rubro del presupuesto → Rubro (se reusa el que ya existe con ese nombre) · Partida → Historia.
 *   Las épicas se arman después, a mano. Unidad y cantidad se conservan; HH plan = HH unitarias del
 *   análisis × cantidad (sin análisis: sin HH plan, marcada). Cada historia guarda su partida y su
 *   análisis. Fechas: sin cargar. Ponderación: por costo de MO.
 *   COSTO DE MO: la suma de mano de obra y cargas sociales de la composición CONGELADA de la partida
 *   × la cantidad. Sin composición congelada, NULL («sin costo de MO · no pesa»): nunca un número
 *   inventado.
 *   FRENTES (opcional): cada historia recibe una tarea por frente con la cantidad repartida en partes
 *   iguales, medida por cantidad; si la suma no cierra en diezmilésimos, esa partida no se convierte.
 */
export async function convertirPartidasDesdeLaObra(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = convertirSchema.safeParse({
    partidas: form.getAll('partida').map(String),
    frentes: String(form.get('frentes') ?? ''),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  if (!await esAdmin(supabase)) return { ok: false, error: SIN_PERMISO }

  // La misma regla que la pantalla C02: la versión adjudicada, no la última editada.
  const { data: versiones, error: eC } = await supabase.from('cotizaciones')
    .select('id, estado, congelada_en, vigente, version').eq('obra_canonica_id', obraId)
  if (eC) return { ok: false, error: eC.message }
  const cab = versionQueVale((versiones ?? []) as { id: string; estado: string | null; congelada_en: string | null; vigente: boolean | null; version: number }[])
  if (!cab) return { ok: false, error: 'Esta obra no tiene presupuesto vinculado.' }
  if (cab.estado !== 'adjudicada') return { ok: false, error: 'El presupuesto todavía no está adjudicado.' }
  if (!cab.congelada_en) return { ok: false, error: 'Congelá el presupuesto antes de convertir: el plan y su costo de MO salen de lo que se ofertó.' }

  const [{ data: filas, error: eF }, { data: comp }, { data: yaEn }] = await Promise.all([
    supabase.from('cotizacion_partida').select('id, rubro, codigo, descripcion, unidad, cantidad, hs_unitarias, analisis_id, cotizacion_id, coef_ajuste').in('id', parsed.data.partidas),
    supabase.from('cotizacion_partida_composicion').select('partida_id, tipo, cantidad, costo_unitario, desperdicio').in('partida_id', parsed.data.partidas),
    supabase.from('obra_actividad').select('id, nombre, nivel, cotizacion_partida_id').eq('obra_id', obraId).eq('archivada', false),
  ])
  if (eF) return { ok: false, error: eF.message }
  const porId = new Map((filas ?? []).map((f) => [String(f.id), f]))
  const compPorPartida = new Map<string, ComponenteMO[]>()
  for (const c of (comp ?? []) as (ComponenteMO & { partida_id: string })[]) {
    compPorPartida.set(c.partida_id, [...(compPorPartida.get(c.partida_id) ?? []), c])
  }
  const vivos = (yaEn ?? []) as { id: string; nombre: string; nivel: string | null; cotizacion_partida_id: string | null }[]
  const convertidas = new Set(vivos.map((v) => v.cotizacion_partida_id).filter(Boolean) as string[])
  const rubros = new Map(vivos.filter((v) => v.nivel === 'rubro').map((v) => [v.nombre.trim().toLowerCase(), v.id]))
  const nombresFrentes = vistaPreviaFrentes('', null, parsed.data.frentes ?? '').nombres
  let orden = await ordenSiguiente(supabase, obraId)

  let hechas = 0
  let sinCosto = 0
  let sinHH = 0
  let hh: number | null = null
  const fallas: string[] = []
  for (const id of parsed.data.partidas) {
    const p = porId.get(id)
    const nombre = p ? String(p.descripcion ?? 'partida') : id
    if (!p || String(p.cotizacion_id) !== String(cab.id)) { fallas.push(`«${nombre}»: no es de este presupuesto`); continue }
    if (convertidas.has(id)) { fallas.push(`«${nombre}»: ya está en el plan`); continue }
    const cantidad = p.cantidad == null ? null : Number(p.cantidad)
    let partes: number[] | null = null
    if (nombresFrentes.length >= 2) {
      if (cantidad == null) { fallas.push(`«${nombre}»: sin cómputo, no hay cantidad que repartir en frentes`); continue }
      partes = vistaPreviaFrentes(nombre, cantidad, parsed.data.frentes ?? '').filas.map((f) => f.cantidad ?? 0)
      if (!conservaLaCantidad(partes, cantidad)) { fallas.push(`«${nombre}»: el reparto en frentes no conserva la cantidad`); continue }
    }
    // El rubro del presupuesto: el que ya existe con ese nombre, o uno nuevo.
    const nombreRubro = String(p.rubro ?? 'Sin rubro').trim() || 'Sin rubro'
    let rubroId = rubros.get(nombreRubro.toLowerCase()) ?? null
    if (!rubroId) {
      const { data: r, error } = await supabase.from('obra_actividad').insert({
        obra_id: obraId, clave: `conv:rubro:${slug(nombreRubro)}`, nombre: nombreRubro, nivel: 'rubro', tipo: 'resumen', rol_estructura: 'rubro',
        orden: orden++, metodo_avance: 'manual', estado: 'pendiente', fuente: 'conversion_presupuesto', creada_en_web: true,
      }).select('id').single()
      if (error) { fallas.push(`rubro «${nombreRubro}»: ${error.message}`); continue }
      rubroId = String(r.id)
      rubros.set(nombreRubro.toLowerCase(), rubroId)
    }
    // El coeficiente de ajuste de la planilla multiplica la MO, las cargas y las horas de la partida.
    const coef = coefDe(p.coef_ajuste == null ? null : Number(p.coef_ajuste))
    const hhPlan = p.hs_unitarias != null && cantidad != null ? Number(p.hs_unitarias) * cantidad * coef : null
    const mo = costoMODeLaPartida(compPorPartida.get(id) ?? [], cantidad, coef)
    const { data: h, error: eH } = await supabase.from('obra_actividad').insert({
      obra_id: obraId, clave: `conv:${id}:historia`, nombre, nivel: 'historia', tipo: 'resumen', seccion: nombreRubro,
      orden: orden++, actividad_padre_id: rubroId, unidad: p.unidad ?? null, cantidad_objetivo: cantidad, hh_plan: hhPlan,
      costo_mo: mo, analisis_id: p.analisis_id ?? null, cotizacion_partida_id: id, partida_codigo: p.codigo ?? null,
      partida_cantidad: cantidad, metodo_avance: 'manual', estado: 'pendiente', fuente: 'conversion_presupuesto', creada_en_web: true,
    }).select('id').single()
    if (eH) { fallas.push(`«${nombre}»: ${eH.message}`); continue }
    if (partes && nombresFrentes.length >= 2) {
      const tareas = nombresFrentes.map((f, k) => ({
        obra_id: obraId, clave: `conv:${id}:${slug(f)}`, nombre: `${nombre} · ${f}`, nivel: 'tarea', tipo: 'tarea', seccion: nombreRubro,
        orden: orden++, actividad_padre_id: String(h.id), unidad: p.unidad ?? null, cantidad_objetivo: partes![k],
        hh_plan: hhPlan == null ? null : Math.round((hhPlan * partes![k] / (cantidad as number)) * 100) / 100,
        metodo_avance: p.unidad ? 'cantidad' : 'manual', analisis_id: p.analisis_id ?? null, cotizacion_partida_id: id, partida_codigo: p.codigo ?? null,
        estado: 'pendiente', fuente: 'conversion_presupuesto', creada_en_web: true,
      }))
      const { error: eT } = await supabase.from('obra_actividad').insert(tareas)
      if (eT) fallas.push(`«${nombre}»: la historia se creó pero los frentes no: ${eT.message}`)
    }
    hechas++
    if (mo == null) sinCosto++
    if (hhPlan == null) sinHH++; else hh = (hh ?? 0) + hhPlan
  }
  if (hechas > 0) {
    await supabase.from('obra_canonica').update({ metodo_ponderacion: 'costo_mo' }).eq('id', obraId)
    revalidatePath(`/obras/${obraId}`, 'layout')
  }
  const resumen = `${hechas} ${hechas === 1 ? 'partida convertida en historia' : 'partidas convertidas en historias'}`
    + `${hh == null ? ' · sin HH: ninguna tiene análisis' : ` · ${Math.round(hh).toLocaleString('es-AR')} HH${sinHH ? ` (${sinHH} sin análisis)` : ''}`}`
    + `${sinCosto ? ` · ${sinCosto} sin costo de MO (el presupuesto no trae su composición): no pesan hasta cargarlo` : ''}`
  if (fallas.length > 0) return { ok: false, error: `${resumen}. Quedaron sin convertir ${fallas.length}: ${fallas.join(' · ')}` }
  return { ok: true, mensaje: resumen }
}

// ── C03 · CREAR PEGANDO LA PLANILLA ──────────────────────────────────────────

const planillaSchema = z.object({ planilla: z.string().min(3, 'Pegá la planilla').max(200_000) })

/**
 * CREAR LA ESTRUCTURA DESDE EL TEXTO PEGADO. Se vuelve a leer en el servidor con la MISMA función
 * que dibujó la vista previa (`leerPlanilla`): lo que se prometió es lo que se escribe. Los padres
 * se insertan antes que sus hijas, nivel por nivel, y cada fila lleva `actividad_padre_id`.
 */
export async function crearEstructuraDesdePlanilla(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = planillaSchema.safeParse({ planilla: String(form.get('planilla') ?? '') })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  if (!await esAdmin(supabase)) return { ok: false, error: SIN_PERMISO }

  const { data: obra } = await supabase.from('obra_panel')
    .select('fecha_inicio_plan, fecha_fin_plan').eq('obra_id', obraId).maybeSingle()
  const lectura = leerPlanilla(parsed.data.planilla, {
    inicio: (obra?.fecha_inicio_plan as string | null) ?? null,
    fin: (obra?.fecha_fin_plan as string | null) ?? null,
  })
  if (lectura.filas.length === 0) return { ok: false, error: 'No reconocí ninguna fila: la planilla va como «#  Actividad  Uni  Cant  Comienzo  Fin  Días».' }
  if (lectura.filas[0].nivel !== 'rubro') return { ok: false, error: 'La primera fila tiene que ser un rubro (numerado «1», «2»…).' }

  let orden = await ordenSiguiente(supabase, obraId)
  const ids: (string | null)[] = []
  let creadas = 0
  for (const [i, f] of lectura.filas.entries()) {
    const padreId = f.padre == null ? null : ids[f.padre]
    if (f.padre != null && !padreId) { ids.push(null); continue }
    const esContenedor = f.nivel === 'rubro' || f.nivel === 'epica' || f.nivel === 'historia'
    const rubro = lectura.filas[raizDe(lectura.filas, i)].nombre
    const medible = !esContenedor && f.unidad != null && f.cantidad != null
    const { data, error } = await supabase.from('obra_actividad').insert({
      obra_id: obraId,
      clave: `${claveDeActividad(f.codigo ?? rubro, f.nombre)}${f.codigo ? '' : `/${slug(String(i))}`}`,
      nombre: f.nombre,
      tipo: esContenedor ? 'resumen' : 'tarea',
      rol_estructura: f.nivel === 'rubro' ? 'rubro' : null,
      seccion: f.nivel === 'rubro' ? null : rubro,
      codigo: f.codigo,
      orden: orden++,
      actividad_padre_id: padreId,
      unidad: esContenedor ? null : f.unidad,
      cantidad_objetivo: esContenedor ? null : f.cantidad,
      metodo_avance: esContenedor ? 'manual' : medible ? 'cantidad' : 'manual',
      inicio_plan: f.inicio,
      fin_plan: f.fin,
      dias_plan: esContenedor ? null : f.dias,
      estado: 'pendiente',
      fuente: 'web',
      creada_en_web: true,
      editado_a_mano: true,
    }).select('id').single()
    if (error) {
      return { ok: false, error: `Se crearon ${creadas} y se cortó en «${f.nombre}»: ${error.message}` }
    }
    ids.push(data.id as string)
    creadas++
  }
  // La ponderación se reparte por días teóricos hasta que alguien la cargue (C03).
  await supabase.from('obra_canonica').update({ metodo_ponderacion: 'dias_teoricos' }).eq('id', obraId)
  revalidatePath(`/obras/${obraId}`, 'layout')
  return { ok: true, mensaje: `${creadas} ${creadas === 1 ? 'ítem creado' : 'ítems creados'}.` }
}

function raizDe(filas: ReturnType<typeof leerPlanilla>['filas'], i: number): number {
  let k = i
  while (filas[k].padre != null) k = filas[k].padre as number
  return k
}

// C04 · CREAR UN ÍTEM A MANO: vive en `actionsItem.ts` (serie B: el nivel lo decide el padre, la historia
// trae su costo de MO y la tarea sus insumos y subtareas).

// ── C05 · GUARDAR EL REPARTO ─────────────────────────────────────────────────

const repartoSchema = z.object({
  metodo: z.enum(METODOS_REPARTO.map((m) => m.id) as [string, ...string[]]),
})

/**
 * GUARDAR LA PONDERACIÓN DE LAS HIJAS DE UN PADRE. Cada `pond_<id>` es el peso de una hija (0–100);
 * lo que no viene se deja como estaba. La obra pasa a `metodo_ponderacion = 'manual'`: desde acá, el
 * peso de una historia es el producto de su cadena, y una hermana sin cargar no pesa.
 */
export async function guardarPonderacion(obraId: string, padreId: string, form: FormData): Promise<Resultado> {
  const parsed = repartoSchema.safeParse({ metodo: String(form.get('metodo') ?? 'mano') })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  if (!await esAdmin(supabase)) return { ok: false, error: SIN_PERMISO }

  const { data: hijas, error } = await supabase.from('obra_actividad').select('id')
    .eq('obra_id', obraId).eq('actividad_padre_id', padreId).eq('archivada', false)
  if (error) return { ok: false, error: error.message }
  if (!hijas?.length) return { ok: false, error: 'Ese ítem no tiene hijas que repartir.' }

  const valores: { id: string; pond: number | null }[] = []
  for (const h of hijas) {
    const crudo = form.get(`pond_${h.id}`)
    if (crudo == null) continue
    const t = String(crudo).trim().replace(',', '.')
    if (t === '') { valores.push({ id: String(h.id), pond: null }); continue }
    const n = Number(t)
    if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: 'Cada ponderación va de 0 a 100.' }
    valores.push({ id: String(h.id), pond: Math.round(n * 10) / 10 })
  }
  if (valores.length === 0) return { ok: false, error: 'No llegó ningún valor.' }
  const suma = valores.reduce((s, v) => s + (v.pond ?? 0), 0)

  let tocadas = 0
  for (const v of valores) {
    const { data, error: e } = await supabase.from('obra_actividad').update({ ponderacion: v.pond, editado_a_mano: true })
      .eq('obra_id', obraId).eq('id', v.id).select('id')
    if (e) return { ok: false, error: `Se guardaron ${tocadas} y se cortó: ${e.message}` }
    tocadas += (data ?? []).length
  }
  const { error: eObra } = await supabase.from('obra_canonica').update({ metodo_ponderacion: 'manual' }).eq('id', obraId)
  if (eObra) return { ok: false, error: `El reparto se guardó pero la obra no pasó a ponderación a mano: ${eObra.message}` }
  revalidatePath(`/obras/${obraId}`, 'layout')
  const redondeada = Math.round(suma * 10) / 10
  return {
    ok: true,
    mensaje: redondeada === 100 ? `Reparto guardado: ${tocadas} hermanas cierran en 100 %.` : `Reparto guardado: ${tocadas} hermanas suman ${redondeada.toLocaleString('es-AR')} %.`,
  }
}

// ── C08 · SUBTAREAS ──────────────────────────────────────────────────────────

const subtareasSchema = z.object({
  metodo: z.enum(['cantidad', 'pasos', 'manual']),
  nuevas: z.array(z.string().trim().min(2).max(200)).max(50),
  hechas: z.array(z.string().uuid()).max(200),
})

/**
 * GUARDAR EL MÉTODO Y LAS SUBTAREAS DE UNA TAREA. Las nuevas se insertan colgadas de la tarea (la
 * misma fila que `crearTarea`); las tildadas pasan a `hecha` y las destildadas a `pendiente`. Con
 * método «pasos», cada subtarea es un paso de igual peso en `obra_actividad_paso`, que es de donde
 * el avance lee la fracción hecha.
 */
export async function guardarSubtareas(obraId: string, tareaId: string, form: FormData): Promise<Resultado> {
  const parsed = subtareasSchema.safeParse({
    metodo: String(form.get('metodo') ?? 'manual'),
    nuevas: form.getAll('nueva').map(String).filter((t) => t.trim().length > 0),
    hechas: form.getAll('hecha').map(String),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  if (!await esAdmin(supabase)) return { ok: false, error: SIN_PERMISO }

  const { data: tarea, error: eT } = await supabase.from('obra_actividad')
    .select('id, tipo, orden, seccion, unidad, cantidad_objetivo').eq('obra_id', obraId).eq('id', tareaId).maybeSingle()
  if (eT) return { ok: false, error: eT.message }
  if (!tarea) return { ok: false, error: 'Esa tarea no es de esta obra.' }
  if (tarea.tipo === 'resumen') return { ok: false, error: 'Es un contenedor: las subtareas se agregan a una tarea.' }
  if (d.metodo === 'cantidad' && (!tarea.unidad || tarea.cantidad_objetivo == null)) {
    return { ok: false, error: 'Para medir por cantidad la tarea necesita unidad y cantidad objetivo.' }
  }

  let creadas = 0
  for (const nombre of d.nuevas) {
    const { error } = await supabase.from('obra_actividad').insert({
      obra_id: obraId, actividad_padre_id: tareaId, nombre, nivel: 'subtarea', tipo: 'tarea', orden: tarea.orden, seccion: tarea.seccion,
      clave: `${tareaId}/${nombre.toLowerCase().slice(0, 60)}`, fuente: 'web', creada_en_web: true, estado: 'pendiente',
      metodo_avance: 'manual', editado_a_mano: true,
    })
    if (error) {
      if (error.code === '23505') return { ok: false, error: `Ya hay una subtarea llamada «${nombre}».` }
      return { ok: false, error: `Se crearon ${creadas} y se cortó en «${nombre}»: ${error.message}` }
    }
    creadas++
  }

  const { data: subs, error: eS } = await supabase.from('obra_actividad').select('id, nombre, estado')
    .eq('obra_id', obraId).eq('actividad_padre_id', tareaId).eq('archivada', false).order('orden', { ascending: true })
  if (eS) return { ok: false, error: eS.message }
  const hechas = new Set(d.hechas)
  for (const s of subs ?? []) {
    const debe = hechas.has(String(s.id)) ? 'hecha' : 'pendiente'
    if (s.estado === debe) continue
    const { error } = await supabase.from('obra_actividad').update({ estado: debe }).eq('obra_id', obraId).eq('id', s.id)
    if (error) return { ok: false, error: error.message }
  }

  const { error: eM } = await supabase.from('obra_actividad').update({ metodo_avance: d.metodo, editado_a_mano: true })
    .eq('obra_id', obraId).eq('id', tareaId)
  if (eM) return { ok: false, error: eM.message }

  // Con «pasos», los pasos son las subtareas: uno por subtarea, peso parejo, hecho si la subtarea lo está.
  if (d.metodo === 'pasos') {
    const lista = subs ?? []
    if (lista.length === 0) return { ok: false, error: 'Medir por pasos necesita al menos una subtarea.' }
    const { error: eBorrar } = await supabase.from('obra_actividad_paso').delete().eq('actividad_id', tareaId)
    if (eBorrar) return { ok: false, error: eBorrar.message }
    const ahora = new Date().toISOString()
    const { error: ePasos } = await supabase.from('obra_actividad_paso').insert(lista.map((s, k) => ({
      actividad_id: tareaId, orden: k + 1, nombre: String(s.nombre), peso: Math.round((100 / lista.length) * 100) / 100,
      hecho_en: hechas.has(String(s.id)) ? ahora : null,
    })))
    if (ePasos) return { ok: false, error: ePasos.message }
  }
  revalidatePath(`/obras/${obraId}`, 'layout')
  const total = (subs ?? []).length
  return { ok: true, mensaje: `${creadas > 0 ? `${creadas} ${creadas === 1 ? 'subtarea nueva' : 'subtareas nuevas'} · ` : ''}${hechas.size} de ${total} hechas.` }
}

// ── C09 · ACCIONES MASIVAS ───────────────────────────────────────────────────

const idsSchema = z.array(z.string().uuid()).min(1, 'No hay ninguna seleccionada').max(2000)

const masivaSchema = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('mover'), padre_id: z.union([z.string().uuid(), z.literal('')]) }),
  z.object({ accion: z.literal('cuadrilla'), cuadrilla_id: z.union([z.string().uuid(), z.literal('')]) }),
  z.object({ accion: z.literal('fechas'), dias: z.coerce.number().int().min(-60).max(60) }),
  z.object({ accion: z.literal('metodo'), metodo: z.enum(['cantidad', 'pasos', 'manual']) }),
  z.object({ accion: z.literal('responsable'), responsable_id: z.union([z.string().uuid(), z.literal('')]) }),
  z.object({ accion: z.literal('archivar') }),
])

/**
 * APLICAR UNA ACCIÓN A VARIAS A LA VEZ (C09/MC10). El resultado es el EFECTO: cuántas filas quedaron
 * escritas, no cuántas se tildaron. Correr fechas mueve `inicio_plan`/`fin_plan` en días hábiles y
 * NO toca la línea base; una fila sin fechas queda afuera y se informa.
 */
export async function aplicarAccionMasiva(obraId: string, form: FormData): Promise<Resultado> {
  const ids = idsSchema.safeParse(form.getAll('id').map(String))
  if (!ids.success) return { ok: false, error: ids.error.issues[0].message }
  const parsed = masivaSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  if (!await esAdmin(supabase)) return { ok: false, error: SIN_PERMISO }

  const { data: filas, error } = await supabase.from('obra_actividad')
    .select('id, tipo, inicio_plan, fin_plan, unidad, cantidad_objetivo, actividad_padre_id')
    .eq('obra_id', obraId).eq('archivada', false).in('id', ids.data)
  if (error) return { ok: false, error: error.message }
  const propias = (filas ?? []) as { id: string; tipo: string; inicio_plan: string | null; fin_plan: string | null; unidad: string | null; cantidad_objetivo: number | null; actividad_padre_id: string | null }[]
  if (propias.length === 0) return { ok: false, error: 'Ninguna de las seleccionadas es de esta obra.' }
  const ajenas = ids.data.length - propias.length
  const motivos: string[] = []
  if (ajenas > 0) motivos.push(`${ajenas} archivadas o de otra obra`)

  let tocadas = 0
  const escribir = async (id: string, cambio: Record<string, unknown>) => {
    const { data, error: e } = await supabase.from('obra_actividad').update({ ...cambio, editado_a_mano: true })
      .eq('obra_id', obraId).eq('id', id).select('id')
    if (e) throw new Error(`Se aplicó a ${tocadas} y se cortó: ${e.message}`)
    tocadas += (data ?? []).length
  }

  try {
    if (d.accion === 'mover') {
      if (d.padre_id) {
        const { data: padre } = await supabase.from('obra_actividad').select('id, tipo').eq('obra_id', obraId).eq('id', d.padre_id).maybeSingle()
        if (!padre) return { ok: false, error: 'Ese destino no es de esta obra.' }
        if (padre.tipo !== 'resumen') return { ok: false, error: 'Sólo se puede mover adentro de un contenedor.' }
        if (ids.data.includes(String(padre.id))) return { ok: false, error: 'Un ítem no puede moverse adentro de sí mismo.' }
      }
      for (const f of propias) await escribir(f.id, { actividad_padre_id: d.padre_id || null })
    } else if (d.accion === 'cuadrilla') {
      for (const f of propias) await escribir(f.id, { cuadrilla_id: d.cuadrilla_id || null })
    } else if (d.accion === 'fechas') {
      let sinFechas = 0
      for (const f of propias) {
        if (!f.inicio_plan && !f.fin_plan) { sinFechas++; continue }
        await escribir(f.id, {
          inicio_plan: f.inicio_plan ? correrDiasHabiles(f.inicio_plan, d.dias) : null,
          fin_plan: f.fin_plan ? correrDiasHabiles(f.fin_plan, d.dias) : null,
        })
      }
      if (sinFechas > 0) motivos.push(`${sinFechas} sin fechas`)
    } else if (d.accion === 'metodo') {
      let incompletas = 0
      for (const f of propias) {
        if (f.tipo === 'resumen') { incompletas++; continue }
        if (d.metodo === 'cantidad' && (!f.unidad || f.cantidad_objetivo == null)) { incompletas++; continue }
        await escribir(f.id, { metodo_avance: d.metodo })
      }
      if (incompletas > 0) motivos.push(`${incompletas} ${d.metodo === 'cantidad' ? 'sin unidad y cantidad, o contenedores' : 'contenedores'}`)
    } else if (d.accion === 'responsable') {
      if (d.responsable_id) {
        const { data: p } = await supabase.from('personas').select('id').eq('id', d.responsable_id).maybeSingle()
        if (!p) return { ok: false, error: 'Esa persona no está en el legajo.' }
      }
      for (const f of propias) await escribir(f.id, { responsable_id: d.responsable_id || null })
    } else {
      for (const f of propias) await escribir(f.id, { archivada: true })
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No pude escribir.' }
  }
  revalidatePath(`/obras/${obraId}`, 'layout')
  const rotulo: Record<typeof d.accion, string> = {
    mover: 'movidas', cuadrilla: 'con cuadrilla', fechas: 'corridas', metodo: 'con método', responsable: 'con responsable', archivar: 'archivadas',
  }
  return { ok: true, mensaje: `${tocadas} ${rotulo[d.accion]}${motivos.length ? ` · ${ids.data.length - tocadas} afuera: ${motivos.join(' · ')}` : ''}.` }
}

// ── C10 · SELLAR Y PRODUCIR ──────────────────────────────────────────────────

/**
 * SELLAR LA LÍNEA BASE Y PASAR LA OBRA DE PREVIO A DESARROLLO. Es `sellarBaseline` (la única que
 * escribe `inicio_base`/`fin_base`, una sola vez) más el cambio de etapa que el diseño C10 promete.
 */
export async function sellarYProducir(obraId: string): Promise<Resultado> {
  const supabase = await createClient()
  if (!await esAdmin(supabase)) return { ok: false, error: SIN_PERMISO }
  const r = await sellarBaseline(obraId)
  if (!r.ok) return r
  const { data, error } = await supabase.from('obra_canonica').update({ etapa: 'desarrollo' })
    .eq('id', obraId).eq('etapa', 'previo').select('id')
  if (error) return { ok: false, error: `La línea base quedó sellada pero la obra no cambió de etapa: ${error.message}` }
  revalidatePath(`/obras/${obraId}`, 'layout'); revalidatePath('/obras')
  return { ok: true, mensaje: (data ?? []).length ? 'Línea base sellada. La obra pasó a Desarrollo.' : 'Línea base sellada.' }
}
