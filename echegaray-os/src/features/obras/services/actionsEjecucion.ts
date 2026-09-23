'use server'

// EJECUCIÓN — el parte diario de una obra. UNA CARGA, MUCHOS EFECTOS.
//
// ═══ QUÉ ES UN PARTE ═══
//
// Lo que pasó un día en una actividad: cuánto se produjo, quiénes trabajaron y cuántas horas. Es un
// HECHO con fecha y NO SE REESCRIBE para representar el acumulado — el acumulado se suma. Es la
// misma regla por la que `registros_hh` guarda las horas de cada día en vez de un total.
//
// ═══ LAS HORAS NO SE ESCRIBEN ACÁ ═══
//
// `obra_ejecucion` no tiene columna de horas ni de personas. Las horas de esa jornada van a
// `registros_hh` —la fuente canónica de tiempo desde el 19/08— llamando a la MISMA acción que usa
// la pestaña Personal. No es una comodidad: si el parte escribiera sus propias horas, la misma hora
// quedaría cargada dos veces y la liquidación futura no sabría cuál contar.
//
// Por eso este archivo hace dos escrituras y no una sola con todo adentro: cada hecho a su fuente.
//
//   +15 m² de mampostería      → obra_ejecucion   → avance de la actividad, acumulado, productividad
//   5 personas × 8 h           → registros_hh     → HH de la actividad, de la obra, de cada persona
//
// ═══ EL PARTE ENTRA AUNQUE LAS HORAS FALLEN ═══
//
// Si la imputación de horas rebota —alguien ya tenía esas horas cargadas ese día—, la producción NO
// se pierde: ya está escrita y se dice qué pasó con las horas. Perder el dato de campo por un
// choque de horas sería cambiar lo importante por lo accesorio.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { MENSAJE_CONFLICTO } from '@/shared/lib/pilaDeDeshacer'
import { actualizarSiSigueIgual } from '@/shared/lib/escrituraCondicional'
import type { Resultado } from './actions'
import { imputarHHMasivo } from './actionsHH'
import { leerReparto, totalDelReparto } from './repartoHH'
import { leerEquipos, rotuloEquipo } from './equiposDelParte'
import { crearImpedimento } from './actions'
import { vincularDocumento } from './actionsDocumentos'
import { leerMedicion, metodoTrasMedir } from './medicionEnLote'
import { filaDeEjecucion, leerParteDiario, type DestinoNovedad } from './parteDiario'
import { agregarNota } from './actionsNotas'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import type { Rol } from '@/features/auth/types'

const parteSchema = z.object({
  actividad_id: z.string().uuid('Elegí la actividad'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí el día'),
  // Una u otra según el método de la actividad. Las dos vacías no es un parte: es nada.
  cantidad: z.union([z.coerce.number().min(0, 'La cantidad no puede ser negativa'), z.literal('')]).optional(),
  avance_pct: z.union([
    z.coerce.number().min(0, 'El avance va de 0 a 100').max(100, 'El avance va de 0 a 100'),
    z.literal(''),
  ]).optional(),
  comentario: z.string().trim().max(500).optional(),
})

const vacio = (v: unknown) => v === '' || v === undefined || v === null

/**
 * Registrar la ejecución de un día.
 *
 * El formulario trae el parte y, opcionalmente, el reparto de horas por persona (`hh_<uuid>`), que
 * es exactamente el mismo formato que usa la carga masiva de Personal. Se reenvía tal cual: una
 * segunda implementación de "imputar horas a una cuadrilla" sería la segunda definición de las HH.
 */
export async function registrarEjecucion(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = parteSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  if (vacio(d.cantidad) && vacio(d.avance_pct)) {
    return { ok: false, error: 'Poné la cantidad ejecutada o el avance del día.' }
  }

  const supabase = await createClient()

  // EL MÉTODO DE LA ACTIVIDAD MANDA. Cargar cantidad en una actividad que se mide por porcentaje
  // guardaría un número que después nadie usa para nada, y al revés dejaría el avance quieto
  // mientras alguien carga producción todos los días sin entender por qué no se mueve.
  const { data: act, error: errAct } = await supabase
    .from('obra_actividad_control')
    .select('actividad_id, nombre, metodo_avance, unidad, cantidad_objetivo, obra_id')
    .eq('actividad_id', d.actividad_id).maybeSingle()
  if (errAct) return { ok: false, error: errAct.message }
  if (!act) return { ok: false, error: 'Esa actividad no existe o no es de esta obra.' }
  const a = act as { metodo_avance: string; unidad: string | null; obra_id: string; nombre: string }
  if (a.obra_id !== obraId) return { ok: false, error: 'Esa actividad es de otra obra.' }

  const porCantidad = a.metodo_avance === 'cantidad'
  if (porCantidad && vacio(d.cantidad)) {
    return { ok: false, error: `«${a.nombre}» se mide en ${a.unidad ?? 'unidades'}: poné la cantidad ejecutada.` }
  }
  if (!porCantidad && vacio(d.avance_pct) && vacio(d.cantidad)) {
    return { ok: false, error: 'Poné el avance del día.' }
  }

  const { data: parte, error } = await supabase.from('obra_ejecucion').insert({
    obra_id: obraId,
    actividad_id: d.actividad_id,
    fecha: d.fecha,
    cantidad: vacio(d.cantidad) ? null : Number(d.cantidad),
    avance_pct: vacio(d.avance_pct) ? null : Number(d.avance_pct),
    comentario: d.comentario || null,
    fuente: 'web',
  }).select('id').single()
  if (error) return { ok: false, error: error.message }

  // CARGAR UN AVANCE DEL DÍA ES ELEGIR EL MÉTODO. Sin esto, alguien carga partes toda la semana y el
  // porcentaje de la actividad no se mueve porque sigue mandando el número que declaró el Sheet.
  if (!porCantidad && !vacio(d.avance_pct) && a.metodo_avance === 'manual') {
    await supabase.from('obra_actividad')
      .update({ metodo_avance: 'partes' }).eq('id', d.actividad_id)
  }

  const efectos = [porCantidad ? `+${d.cantidad} ${a.unidad ?? ''}`.trim() : `+${d.avance_pct}% de avance`]

  const reparto = leerReparto(form.entries())
  if (reparto.length > 0) {
    const horas = await imputarHHMasivo(obraId, form)
    efectos.push(horas.ok
      ? `${totalDelReparto(reparto)} HH de ${reparto.length} persona(s)`
      : `las horas NO se cargaron: ${horas.error}`)
  }

  // ── EL EQUIPO QUE TRABAJÓ ESE DÍA ──────────────────────────────────────────
  // Cuelga del PARTE y no de la actividad: «la hormigonera hizo 4 h» es un hecho de una jornada,
  // igual que la producción. Va después del insert porque necesita el id del parte.
  const equipos = leerEquipos(form.entries())
  if (equipos.length > 0 && parte?.id) {
    const { error: eEq } = await supabase.from('obra_ejecucion_equipo').insert(
      equipos.map((e) => ({ ejecucion_id: parte.id as string, obra_id: obraId, equipo: e.equipo, horas: e.horas })),
    )
    efectos.push(eEq ? `el equipo NO se cargó: ${eEq.message}` : equipos.map(rotuloEquipo).join(', '))
  }

  // ── LO QUE FRENÓ LA JORNADA ────────────────────────────────────────────────
  // Un impedimento anotado al cerrar el parte es el que se anota de verdad: el que hay que ir a
  // cargar a otra pantalla se anota mañana o nunca. Se reusa `crearImpedimento` —una sola
  // definición de qué es un impedimento y qué campos exige— atándolo a ESTA actividad.
  const impedimento = String(form.get('impedimento') ?? '').trim()
  if (impedimento) {
    const fImp = new FormData()
    fImp.set('descripcion', impedimento)
    fImp.set('tipo', String(form.get('impedimento_tipo') ?? 'otro'))
    fImp.set('responsable', String(form.get('impedimento_responsable') ?? '').trim())
    fImp.set('fecha_compromiso', String(form.get('impedimento_compromiso') ?? ''))
    fImp.set('actividad_id', d.actividad_id)
    const r = await crearImpedimento(obraId, fImp)
    efectos.push(r.ok ? 'impedimento anotado' : `el impedimento NO se anotó: ${r.error}`)
  }

  // ── LA EVIDENCIA ───────────────────────────────────────────────────────────
  // La foto o el remito quedan colgados de la actividad, no sueltos en la obra. El archivo NO se
  // copia: se guarda el vínculo de Drive, igual que en Documentos.
  const evidencia = String(form.get('evidencia') ?? '').trim()
  if (evidencia) {
    const fDoc = new FormData()
    fDoc.set('enlace', evidencia)
    fDoc.set('nombre', String(form.get('evidencia_nombre') ?? '').trim() || `Evidencia ${d.fecha} · ${a.nombre}`)
    fDoc.set('rol', 'evidencia')
    fDoc.set('actividad_id', d.actividad_id)
    const r = await vincularDocumento(obraId, fDoc)
    efectos.push(r.ok ? 'evidencia vinculada' : `la evidencia NO se vinculó: ${r.error}`)
  }

  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: `Parte del ${d.fecha}: ${efectos.join(' · ')}.` }
}

/** Borrar un parte. Se corrige un error de carga; no se usa para "cerrar" una actividad. */
export async function borrarParte(obraId: string, parteId: string): Promise<Resultado> {
  const supabase = await createClient()
  // El `eq('obra_id')` no sobra: sin él, un id de otra obra borraría un parte ajeno.
  const { error } = await supabase
    .from('obra_ejecucion').delete().eq('id', parteId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: 'Parte borrado.' }
}

const medicionSchema = z.object({
  unidad: z.string().trim().max(12).optional(),
  cantidad_objetivo: z.union([z.coerce.number().positive('La cantidad objetivo tiene que ser mayor que cero'), z.literal('')]).optional(),
  metodo_avance: z.enum(['cantidad', 'partes', 'manual']),
})

/**
 * Cómo se mide esta actividad.
 *
 * Medir en cantidad exige unidad y objetivo: sin el total, el porcentaje no existe. La base tiene el
 * mismo CHECK — acá se valida para poder decirlo en castellano en vez de mostrar el error de Postgres.
 */
export async function definirMedicion(obraId: string, actividadId: string, form: FormData): Promise<Resultado> {
  const parsed = medicionSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const objetivo = vacio(d.cantidad_objetivo) ? null : Number(d.cantidad_objetivo)
  if (d.metodo_avance === 'cantidad' && (!d.unidad || objetivo === null)) {
    return { ok: false, error: 'Para medir por cantidad hacen falta la unidad y la cantidad objetivo.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('obra_actividad').update({
    unidad: d.unidad || null,
    cantidad_objetivo: objetivo,
    metodo_avance: d.metodo_avance,
  }).eq('id', actividadId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: 'Guardado.' }
}

const ESTADOS = ['pendiente', 'lista', 'en_curso', 'hecha'] as const

/**
 * Mover una actividad de estado.
 *
 * NO EXISTE «bloqueada» ACÁ, y es a propósito: bloqueada se deriva de tener un impedimento abierto.
 * Un botón que la marcara dejaría la actividad trabada para siempre el día que el impedimento se
 * resuelva, porque nadie se acuerda de volver a tocarlo.
 */
export async function cambiarEstado(obraId: string, actividadId: string, estado: string): Promise<Resultado> {
  if (!(ESTADOS as readonly string[]).includes(estado)) {
    return { ok: false, error: 'Ese estado no existe. Una actividad bloqueada se destraba resolviendo su impedimento.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('obra_actividad')
    .update({ estado }).eq('id', actividadId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

const tareaSchema = z.object({
  nombre: z.string().trim().min(2, 'Poné el nombre de la tarea').max(200),
})

/**
 * Agregar una tarea a una actividad.
 *
 * NO PIDE NADA MÁS QUE EL NOMBRE. Una tarea con fecha, responsable, unidad y estimación es una
 * actividad, y para eso ya está el cronograma. Acá la fricción tiene que ser cero o no se usa.
 *
 * La tarea es una fila de `obra_actividad` con `actividad_padre_id`: la misma entidad, el mismo
 * estado, el mismo RLS. Una tabla aparte sería una segunda entidad de trabajo con su propia manera
 * de quedarse vieja. Un trigger de la base impide que una tarea tenga tareas.
 */
export async function crearTarea(obraId: string, actividadId: string, form: FormData): Promise<Resultado> {
  const parsed = tareaSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: padre, error: errPadre } = await supabase
    .from('obra_actividad').select('id, obra_id, orden, seccion, codigo_padre')
    .eq('id', actividadId).eq('obra_id', obraId).maybeSingle()
  if (errPadre) return { ok: false, error: errPadre.message }
  if (!padre) return { ok: false, error: 'Esa actividad no existe o no es de esta obra.' }
  const p = padre as { orden: number; seccion: string | null; codigo_padre: string | null }

  const { error } = await supabase.from('obra_actividad').insert({
    obra_id: obraId,
    actividad_padre_id: actividadId,
    nombre: parsed.data.nombre,
    tipo: 'tarea',
    // Hereda el orden del padre para que, si algún día se listan juntas, caigan al lado suyo.
    orden: p.orden,
    seccion: p.seccion,
    // `clave` es la identidad de la fila y tiene índice único por obra: se arma con el id del padre
    // para que dos tareas del mismo nombre en dos actividades distintas no choquen.
    clave: `${actividadId}/${parsed.data.nombre.toLowerCase().slice(0, 60)}`,
    fuente: 'web',
    creada_en_web: true,
    estado: 'pendiente',
  })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Esa actividad ya tiene una tarea con ese nombre.' }
    return { ok: false, error: error.message }
  }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: 'Tarea agregada.' }
}

/** Marcar una tarea hecha, o reabrirla. Es `cambiarEstado` con el obraId ya atado. */
export async function cambiarEstadoTarea(obraId: string, tareaId: string, estado: string): Promise<Resultado> {
  return cambiarEstado(obraId, tareaId, estado)
}

/**
 * MEDIR MUCHAS ACTIVIDADES DE UNA VEZ, desde la Lista.
 *
 * Ponerle unidad y cantidad a cuarenta actividades de a una, abriendo el panel cada vez, son
 * cuarenta idas y vueltas. Acá se cargan todas y se guarda una sola vez.
 *
 * SÓLO SE ESCRIBE LO QUE CAMBIÓ (`cambiosDeMedicion`): mandar las cuarenta pisaría con el mismo
 * valor lo que alguien acaba de corregir en otra pestaña.
 *
 * Y CARGAR LA MEDICIÓN ES ELEGIR EL MÉTODO: una actividad con unidad y objetivo pasa a calcular su
 * avance desde la producción. Sin eso habría que volver a entrar al panel de cada una para decirlo,
 * y la carga masiva no serviría de nada.
 */
export async function medirEnLote(obraId: string, form: FormData): Promise<Resultado> {
  const supabase = await createClient()
  const { data: actuales, error: errLectura } = await supabase
    .from('obra_actividad').select('id, unidad, cantidad_objetivo, metodo_avance').eq('obra_id', obraId)
  if (errLectura) return { ok: false, error: errLectura.message }

  const filas = (actuales ?? []) as { id: string; unidad: string | null; cantidad_objetivo: number | null; metodo_avance: string }[]
  const { cambios, ilegibles } = leerMedicion(form.entries(), filas)
  // UNA CANTIDAD ILEGIBLE FRENA EL LOTE (auditoría, 18/09/2026): antes se leía `null` y vaciaba la medición
  // que había. Se dice cuál, y no se guarda nada: a medias, la persona creería que cargó todo.
  if (ilegibles.length > 0) {
    const cuales = ilegibles.slice(0, 3).map((i) => `«${i.texto}»`).join(', ')
    return {
      ok: false,
      error: `No entendí ${ilegibles.length === 1 ? 'la cantidad' : 'las cantidades'} ${cuales}${ilegibles.length > 3 ? '…' : ''}: `
        + 'escribí un número mayor a cero, con coma para los decimales (12,5) y punto para los miles (1.500). No se guardó nada.',
    }
  }
  if (cambios.length === 0) return { ok: true, mensaje: 'No había nada que cambiar.' }

  const metodoDe = new Map(filas.map((f) => [f.id, f.metodo_avance]))
  for (const c of cambios) {
    const { error } = await supabase.from('obra_actividad').update({
      unidad: c.unidad,
      cantidad_objetivo: c.cantidad_objetivo,
      metodo_avance: metodoTrasMedir(c, metodoDe.get(c.actividad_id) ?? 'manual'),
    }).eq('id', c.actividad_id).eq('obra_id', obraId)
    if (error) return { ok: false, error: error.message }
  }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: `${cambios.length} actividad(es) medidas.` }
}

/**
 * DECIR PARA QUÉ ACTIVIDAD ES UN PEDIDO.
 *
 * El pedido sigue siendo de la OBRA —es su eje operativo y económico— y `actividad_id` es opcional:
 * esto sólo agrega la respuesta a «¿qué está esperando esta actividad?» cuando alguien la sabe.
 *
 * NO TOCA NINGÚN OTRO CAMPO. Los pedidos se sincronizan desde el Sheet de AppSheet y esta columna no
 * está en ese contrato: escribirla acá no compite con el origen, y el sync no la pisa.
 *
 * `esperado` (deshacer, 18/09/2026): la actividad que la pantalla tenía como vigente. Si la base tiene
 * otra —la cambió otra persona—, no se escribe: la auditoría encontró un Cmd+Z que dejó en NULL una
 * actividad que otro había cargado. La comparación viaja DENTRO del `update` (`actualizarSiSigueIgual`):
 * comparar antes y escribir después deja pasar a dos que deshacen a la vez.
 */
export async function asignarActividadAPedido(
  obraId: string, idPedido: string, actividadId: string, esperado?: string,
): Promise<Resultado> {
  const supabase = await createClient()
  if (actividadId) {
    // La actividad tiene que ser DE ESTA OBRA. Sin este chequeo, un id de otra obra colgaría el
    // pedido de un trabajo que nadie de acá puede ver.
    const { data: act } = await supabase
      .from('obra_actividad').select('id').eq('id', actividadId).eq('obra_id', obraId).maybeSingle()
    if (!act) return { ok: false, error: 'Esa actividad no es de esta obra.' }
  }
  const cambios = { actividad_id: actividadId || null }
  if (esperado !== undefined) {
    const r = await actualizarSiSigueIgual(supabase, {
      tabla: 'pedidos_materiales', donde: { id_pedido: idPedido }, campo: 'actividad_id', esperado, cambios,
    })
    if (r.estado === 'conflicto') return { ok: false, error: MENSAJE_CONFLICTO }
    if (r.estado === 'no_existe') return { ok: false, error: 'Ese pedido ya no existe, o no lo ves.' }
    if (r.estado !== 'escrito') return { ok: false, error: r.error }
  } else {
    const { error } = await supabase.from('pedidos_materiales').update(cambios).eq('id_pedido', idPedido)
    if (error) return { ok: false, error: error.message }
  }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL PARTE DIARIO ENTERO DE UNA VEZ — diseño ERP Obras 06 / M08 (dueño, 23/09/2026).
//
// Un renglón por frente en curso, «Quién vino» con horas, y una novedad con destino. Todo viaja
// en UN formulario y se guarda con UNA acción:
//
//   hecho_<actividad>    → obra_ejecucion (cantidad → la fracción la deduce `parte_tarea`;
//                          manual → fraccion + declarada = true)
//   personas_<actividad> → obra_ejecucion_persona (horas = las de «Quién vino» de esa persona)
//   activos_<actividad>  → obra_ejecucion_equipo.activo_id (rótulo = nombre del activo)
//   hh_<persona>         → registros_hh, por la MISMA acción que Personal (`imputarHHMasivo`): las
//                          horas de la liquidación tienen una sola fuente
//   novedad + destino    → Impedimento: obra_restriccion (`crearImpedimento`, mismos campos)
//                          Pedido: pedidos_materiales por `pedir_material` + actividad_id
//                          Sólo nota: obra_actividad_nota
//
// EL MISMO DÍA SE CORRIGE, NO SE DUPLICA: si ya hay un parte web de esa actividad en esa fecha, se
// actualiza —y su gente y sus activos se reemplazan—. Volver a guardar no suma dos veces.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const parteDiarioSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí el día'),
  novedad: z.string().trim().max(1000).optional(),
  novedad_destino: z.enum(['impedimento', 'pedido', 'nota']).optional(),
  novedad_actividad: z.union([z.string().uuid(), z.literal('')]).optional(),
})

export async function guardarParteDiario(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = parteDiarioSchema.safeParse({
    fecha: form.get('fecha'), novedad: form.get('novedad') ?? '',
    novedad_destino: form.get('novedad_destino') || undefined,
    novedad_actividad: form.get('novedad_actividad') ?? '',
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const leido = leerParteDiario(form.entries())
  if (leido.ilegibles.length > 0) {
    const cuales = leido.ilegibles.slice(0, 3).map((i) => `«${i.texto}»`).join(', ')
    return { ok: false, error: `No entendí ${cuales}: escribí un número, con coma para los decimales. No se guardó nada.` }
  }
  const hayHoras = [...form.keys()].some((k) => /^hh_[0-9a-f-]{36}$/.test(k) && String(form.get(k) ?? '').trim() !== '')
  const novedad = (d.novedad ?? '').trim()
  if (leido.renglones.length === 0 && !hayHoras && !novedad) {
    return { ok: false, error: 'El parte está vacío: cargá lo hecho, las horas o una novedad.' }
  }

  const supabase = await createClient()
  const { data: actsData, error: errActs } = await supabase.from('obra_actividad_control')
    .select('actividad_id, nombre, metodo_avance, unidad, cantidad_objetivo, obra_id')
    .eq('obra_id', obraId).limit(2000)
  if (errActs) return { ok: false, error: errActs.message }
  const acts = new Map((actsData ?? []).map((a) => {
    const f = a as { actividad_id: string; nombre: string; metodo_avance: string; unidad: string | null }
    return [f.actividad_id, f]
  }))

  // Las horas de cada persona, para colgarlas del parte de cada tarea en la que estuvo.
  const horasDe = new Map<string, number>()
  for (const [k, v] of form.entries()) {
    const m = /^hh_([0-9a-f-]{36})$/.exec(k)
    if (!m || typeof v !== 'string' || !v.trim()) continue
    const h = Number(v.trim().replace(',', '.'))
    if (Number.isFinite(h) && h > 0) horasDe.set(m[1], h)
  }

  const activosPedidos = [...new Set(leido.renglones.flatMap((r) => r.activos))]
  const nombreActivo = new Map<string, string>()
  if (activosPedidos.length > 0) {
    const { data } = await supabase.from('activo').select('id, nombre').in('id', activosPedidos)
    for (const a of data ?? []) nombreActivo.set((a as { id: string }).id, (a as { nombre: string }).nombre)
  }

  const efectos: string[] = []
  let guardados = 0
  for (const r of leido.renglones) {
    const a = acts.get(r.actividad_id)
    if (!a) { efectos.push('un renglón no es de esta obra y no se guardó'); continue }
    const fila = filaDeEjecucion(a.metodo_avance, r.hecho)
    const { data: previo } = await supabase.from('obra_ejecucion').select('id')
      .eq('obra_id', obraId).eq('actividad_id', r.actividad_id).eq('fecha', d.fecha).eq('fuente', 'web')
      .order('creado_en', { ascending: false }).limit(1).maybeSingle()
    let parteId: string
    if (previo) {
      parteId = (previo as { id: string }).id
      const { error } = await supabase.from('obra_ejecucion').update({ ...fila }).eq('id', parteId)
      if (error) return { ok: false, error: `«${a.nombre}»: ${error.message}` }
      await supabase.from('obra_ejecucion_persona').delete().eq('ejecucion_id', parteId)
      await supabase.from('obra_ejecucion_equipo').delete().eq('ejecucion_id', parteId).not('activo_id', 'is', null)
    } else {
      const { data: nuevo, error } = await supabase.from('obra_ejecucion').insert({
        obra_id: obraId, actividad_id: r.actividad_id, fecha: d.fecha, fuente: 'web', ...fila,
      }).select('id').single()
      if (error) return { ok: false, error: `«${a.nombre}»: ${error.message}` }
      parteId = (nuevo as { id: string }).id
    }
    // Cargar un avance a mano es elegir el método, igual que en `registrarEjecucion`.
    if (fila.declarada && a.metodo_avance === 'manual') {
      await supabase.from('obra_actividad').update({ metodo_avance: 'partes' }).eq('id', r.actividad_id)
    }
    if (r.personas.length > 0) {
      const { error } = await supabase.from('obra_ejecucion_persona').insert(
        r.personas.map((p) => ({ ejecucion_id: parteId, obra_id: obraId, persona_id: p, horas: horasDe.get(p) ?? null })))
      if (error) efectos.push(`la gente de «${a.nombre}» NO se guardó: ${error.message}`)
    }
    if (r.activos.length > 0) {
      const { error } = await supabase.from('obra_ejecucion_equipo').insert(
        r.activos.map((id) => ({ ejecucion_id: parteId, obra_id: obraId, activo_id: id, equipo: nombreActivo.get(id) ?? 'activo', horas: null })))
      if (error) efectos.push(`los equipos de «${a.nombre}» NO se guardaron: ${error.message}`)
    }
    guardados++
  }
  if (guardados > 0) efectos.unshift(`${guardados} ${guardados === 1 ? 'renglón' : 'renglones'}`)

  if (hayHoras) {
    const fHH = new FormData()
    fHH.set('fecha', d.fecha)
    fHH.set('tipo_hora', 'normal')
    for (const [k, v] of form.entries()) if (/^hh_[0-9a-f-]{36}$/.test(k)) fHH.set(k, v)
    const r = await imputarHHMasivo(obraId, fHH)
    efectos.push(r.ok ? (r.mensaje ?? 'horas cargadas') : `las horas NO se cargaron: ${r.error}`)
  }

  if (novedad) {
    const destino: DestinoNovedad = d.novedad_destino ?? 'nota'
    const actividadId = d.novedad_actividad || leido.renglones[0]?.actividad_id || ''
    if (destino === 'impedimento') {
      const fImp = new FormData()
      fImp.set('descripcion', novedad)
      fImp.set('tipo', String(form.get('impedimento_tipo') ?? 'otro'))
      fImp.set('responsable', String(form.get('impedimento_responsable') ?? '').trim())
      fImp.set('fecha_compromiso', String(form.get('impedimento_compromiso') ?? ''))
      fImp.set('actividad_id', actividadId)
      const r = await crearImpedimento(obraId, fImp)
      efectos.push(r.ok ? 'impedimento anotado' : `el impedimento NO se anotó: ${r.error}`)
    } else if (destino === 'pedido') {
      const material = String(form.get('pedido_material') ?? '').trim()
      const cantidad = String(form.get('pedido_cantidad') ?? '').trim().replace(',', '.')
      const unidad = String(form.get('pedido_unidad') ?? '').trim()
      const urgencia = String(form.get('pedido_urgencia') ?? 'semana')
      if (!material) efectos.push('el pedido NO se hizo: falta decir qué material')
      else {
        const { data: grupo, error } = await supabase.rpc('pedir_material', {
          p_obra: obraId, p_items: [{ material, cantidad, unidad }], p_urgencia: urgencia, p_nota: novedad,
        })
        if (error) efectos.push(`el pedido NO se hizo: ${error.message}`)
        else {
          if (actividadId) await supabase.from('pedidos_materiales').update({ actividad_id: actividadId }).eq('pedido_grupo', grupo as string)
          efectos.push('pedido de material hecho')
        }
      }
    } else {
      if (!actividadId) efectos.push('la nota NO se guardó: no hay tarea a la que colgarla')
      else {
        // La MISMA acción que el panel de la tarea: una sola definición de qué es una nota y quién la firma.
        const fNota = new FormData()
        fNota.set('texto', novedad)
        const r = await agregarNota(obraId, actividadId, fNota)
        efectos.push(r.ok ? 'nota guardada' : `la nota NO se guardó: ${r.error}`)
      }
    }
  }

  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: `Parte del ${d.fecha}: ${efectos.join(' · ')}.` }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// GUARDAR FECHAS DEL CRONOGRAMA — C06 / MC7 (diseño ERP Obras, 23/09/2026).
//
// El editor arrastra extremos en días hábiles y manda SÓLO lo que cambió (`inicio_<id>` / `fin_<id>`).
// La duración se vuelve a contar en la base con `dias_habiles(obra, inicio, fin)` —la única
// definición de día hábil de la obra— y la fila queda `editado_a_mano`, como en `editarDuracion`.
// Es de Administración y de la jefatura: la misma guarda que `actionsPlan`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const ISO = /^\d{4}-\d{2}-\d{2}$/

export async function guardarFechasPlan(obraId: string, form: FormData): Promise<Resultado> {
  const cambios = new Map<string, { inicio?: string | null; fin?: string | null }>()
  for (const [k, v] of form.entries()) {
    const m = /^(inicio|fin)_([0-9a-f-]{36})$/.exec(k)
    if (!m || typeof v !== 'string') continue
    const valor = v.trim() === '' ? null : v.trim()
    if (valor != null && !ISO.test(valor)) return { ok: false, error: `No entendí la fecha «${v}».` }
    cambios.set(m[2], { ...(cambios.get(m[2]) ?? {}), [m[1]]: valor })
  }
  if (cambios.size === 0) return { ok: true, mensaje: 'No había fechas que cambiar.' }

  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  if (perfil.error || !perfil.data || !esAdministracion((perfil.data as { rol?: Rol | null }).rol ?? null)) {
    return { ok: false, error: 'Reprogramar el plan de la obra es de Administración y de la jefatura de obra.' }
  }

  const ids = [...cambios.keys()]
  const { data: actuales, error: eLectura } = await supabase.from('obra_actividad')
    .select('id, inicio_plan, fin_plan').eq('obra_id', obraId).eq('archivada', false).in('id', ids)
  if (eLectura) return { ok: false, error: eLectura.message }
  const porId = new Map((actuales ?? []).map((a) => [(a as { id: string }).id, a as { inicio_plan: string | null; fin_plan: string | null }]))
  if (porId.size !== ids.length) return { ok: false, error: 'Alguna de esas actividades no es de esta obra.' }

  let tocadas = 0
  for (const [id, c] of cambios) {
    const actual = porId.get(id)!
    const inicio = c.inicio === undefined ? actual.inicio_plan : c.inicio
    const fin = c.fin === undefined ? actual.fin_plan : c.fin
    if (inicio && fin && fin < inicio) return { ok: false, error: 'El fin no puede ser antes que el inicio.' }
    let dias: number | null = null
    if (inicio && fin) {
      const { data } = await supabase.rpc('dias_habiles', { p_obra_id: obraId, p_desde: inicio, p_hasta: fin })
      dias = data == null ? null : Number(data)
    }
    const { error } = await supabase.from('obra_actividad')
      .update({ inicio_plan: inicio, fin_plan: fin, dias_plan: dias, editado_a_mano: true })
      .eq('id', id).eq('obra_id', obraId)
    if (error) return { ok: false, error: error.message }
    tocadas++
  }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: `${tocadas} ${tocadas === 1 ? 'fecha guardada' : 'fechas guardadas'}.` }
}
