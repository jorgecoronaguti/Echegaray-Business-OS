// EL BORDE DEL CLASIFICADOR — lee la evidencia, aplica el veredicto, escribe una sola columna.
//
// ═══ POR QUÉ ESTÁ SEPARADO DEL VEREDICTO ═══
//
// `clasificar-actividades.mjs` decide y no toca la base; `clasificar-senales.mjs` sabe leer la
// evidencia y tampoco. Acá está lo único que habla con Postgres, y por eso acá está también la
// única escritura: `tarea_tipo_id` con sus cuatro columnas de rastro, o `propuesta_tarea_tipo_id`
// cuando la decisión no fue de una regla.
//
// Lo usan dos llamadores con permisos distintos y a propósito:
//   · el ciclo de XSAS, por timer, SÓLO con reglas — no gasta un token y corre con el proveedor caído.
//   · `xsas-clasificar-actividades.mjs`, a mano, que además manda la zona gris a un modelo.

import { veredictoDe, UMBRAL } from './clasificar-actividades.mjs'
import { OBRAS_NO_REALES } from './xsas-aprendizaje.mjs'

/**
 * TODA LA EVIDENCIA DE CADA ACTIVIDAD SIN CLASIFICAR, EN UNA CONSULTA.
 *
 * Las hermanas son las actividades del MISMO frente: mismo `seccion` o mismo padre. No se toma
 * «misma obra» a secas —serían 124 en San Francisco— porque un frente comparte secuencia
 * constructiva y una obra entera no: el veto por hermana dejaría de significar algo.
 */
export async function actividadesSinClasificar({ query }, { obras = null } = {}) {
  const { rows } = await query(`
    with a as (
      select x.id, x.nombre, x.unidad, x.obra_id, x.seccion, x.actividad_padre_id,
             x.cotizacion_partida_id, x.analisis_id,
             -- ¿ESTA FILA ES TRABAJO? Un 'resumen' agrupa a otras y un 'hito' es una fecha. Se
             -- exige además que no tenga hijas: el rótulo miente menos que la estructura.
             (x.tipo = 'tarea' and not exists (
                select 1 from public.obra_actividad h where h.actividad_padre_id = x.id)) as es_tarea
        from public.obra_actividad x
       where x.tarea_tipo_id is null and x.archivada is not true
         and x.obra_id <> all($2::text[])
         and ($3::text[] is null or x.obra_id = any($3::text[]))),
    cand as (
      select a.id, t.id tid, t.nombre tnombre, t.unidad tunidad,
             similarity(upper(a.nombre), upper(t.nombre)) s,
             row_number() over (partition by a.id
               order by similarity(upper(a.nombre), upper(t.nombre)) desc, t.codigo) rn
        from a join public.tarea_tipo t on t.activo is not false
       where similarity(upper(a.nombre), upper(t.nombre)) >= $1),
    herm as (
      select a.id, jsonb_agg(distinct jsonb_build_object(
               'nombre', h.nombre, 'tareaTipoId', h.tarea_tipo_id)) hermanas
        from a
        join public.obra_actividad h
          on h.obra_id = a.obra_id and h.archivada is not true and h.id <> a.id
         and ((a.seccion is not null and h.seccion = a.seccion)
              or (a.actividad_padre_id is not null and h.actividad_padre_id = a.actividad_padre_id))
       group by a.id),
    dur as (select actividad_id, count(*)::int n from public.duracion_historica group by 1)
    select a.id, a.nombre, a.unidad, a.obra_id, a.seccion, a.es_tarea,
           o.nombre as obra,
           cp.tarea_tipo_id as partida_tarea_tipo_id, cp.codigo as partida_codigo,
           an.tarea_tipo_id as analisis_tarea_tipo_id,
           coalesce(dur.n, 0) as hechos_duracion,
           coalesce(herm.hermanas, '[]'::jsonb) as hermanas,
           (select jsonb_agg(jsonb_build_object('tareaTipoId', c.tid, 'nombre', c.tnombre,
                     'unidad', c.tunidad, 'similitud', c.s) order by c.s desc)
              from cand c where c.id = a.id and c.rn <= 6) as candidatas
      from a
      left join public.obra_canonica o on o.id = a.obra_id
      left join public.cotizacion_partida cp on cp.id = a.cotizacion_partida_id
      left join public.analisis an on an.id = a.analisis_id
      left join herm on herm.id = a.id
      left join dur on dur.actividad_id = a.id
     order by a.obra_id, a.nombre`, [UMBRAL.MIRAR, OBRAS_NO_REALES, obras])
  return rows.map(aContexto)
}

/** De la fila cruda al contexto que entiende el núcleo puro. */
function aContexto(f) {
  return {
    actividadId: f.id,
    nombre: f.nombre,
    unidad: f.unidad,
    obraId: f.obra_id,
    obra: f.obra ?? f.obra_id,
    seccion: f.seccion,
    partidaTareaTipoId: f.partida_tarea_tipo_id,
    partidaCodigo: f.partida_codigo,
    analisisTareaTipoId: f.analisis_tarea_tipo_id,
    hermanas: (f.hermanas ?? []).filter((h) => h?.nombre),
    hechosDeDuracion: Number(f.hechos_duracion ?? 0),
    esTarea: f.es_tarea === true,
    candidatas: (f.candidatas ?? []).map((c) => ({ ...c, similitud: Number(c.similitud) })),
  }
}

/**
 * EL PASO DETERMINÍSTICO. Cero tokens: reglas, similitud y las señales de la obra.
 *
 * Escribe únicamente lo que decidió una REGLA. Lo que quedó en zona gris se devuelve para que lo
 * mire quien pueda —una persona o el modelo, desde el script de a mano— pero el timer no lo toca:
 * una inferencia que entra sola a la base cuatro veces por día no la revisa nadie.
 */
export async function clasificarPorRegla({ query }, { aplicar = false, obras = null } = {}) {
  const filas = await actividadesSinClasificar({ query }, { obras })
  const resueltas = filas.map((f) => ({ ...f, decision: veredictoDe(f, f.candidatas) }))
  const aAsignar = resueltas.filter((r) => r.decision.tareaTipoId)
  const sinResolver = resueltas.filter((r) => !r.decision.tareaTipoId)

  if (aplicar) {
    for (const r of aAsignar) await asignar({ query }, r)
    // ═══ EL MOTIVO DE UN «NO PUDE» TAMBIÉN ES UN RESULTADO (auditoría, 27/08/2026) ═══
    //
    // Antes, un AMBIGUO se devolvía en memoria y se perdía al terminar la corrida. La pantalla que
    // mira la persona —`actividades_sin_clasificar`— mostraba la actividad con la evidencia vacía:
    // ni una palabra de por qué el OS no pudo decidir. La persona tenía que redescubrir a mano
    // exactamente el razonamiento que el OS ya había hecho cuatro veces ese día.
    //
    // Ahora se escribe el motivo, y sólo el motivo: `propuesta_tarea_tipo_id` sigue en null porque
    // no hay propuesta que hacer. Que el OS diga «la única parecida era X y no corresponde porque
    // agrega condiciones que la actividad no dice» convierte un vacío en media decisión tomada.
    for (const r of sinResolver) await registrarSinResolver({ query }, r)
  }

  const porVeredicto = {}
  for (const r of resueltas) porVeredicto[r.decision.veredicto] = (porVeredicto[r.decision.veredicto] ?? 0) + 1
  return {
    miradas: resueltas.length,
    asignadas: aAsignar.length,
    porVeredicto,
    // Las que ninguna regla resolvió: son la materia prima de las propuestas de tarea maestra.
    sinResolver,
    filas: resueltas,
  }
}

/** Escribe el vínculo. `where tarea_tipo_id is null` no es decorativo: entre la lectura y la
 *  escritura alguien pudo haber clasificado la actividad a mano, y una decisión de una persona le
 *  gana siempre a una regla. */
export async function asignar({ query }, r) {
  await query(
    `update public.obra_actividad
        set tarea_tipo_id = $2, tarea_tipo_origen = $3, tarea_tipo_confianza = $4,
            tarea_tipo_evidencia = $5, tarea_tipo_asignado_en = now()
      where id = $1 and tarea_tipo_id is null`,
    [r.actividadId, r.decision.tareaTipoId, r.decision.origen, r.decision.confianza,
      JSON.stringify({ ...(r.decision.evidencia ?? {}), por_que: r.decision.porQue })])
}

/** Deja la inferencia del modelo como PROPUESTA. Nunca como vínculo: aceptarla es un acto de una
 *  persona, y esa distinción es la que impide que una inferencia se vuelva dato maestro sola. */
export async function proponer({ query }, r) {
  await query(
    `update public.obra_actividad
        set propuesta_tarea_tipo_id = $2, propuesta_evidencia = $3, propuesta_en = now()
      where id = $1 and tarea_tipo_id is null`,
    [r.actividadId, r.decision.tareaTipoId,
      JSON.stringify({ ...(r.decision.evidencia ?? {}), por_que: r.decision.porQue })])
}

/**
 * DEJA ESCRITO POR QUÉ NO SE PUDO — sin proponer nada.
 *
 * `propuesta_tarea_tipo_id` se queda en null a propósito: no hay una tarea que sugerir, hay una
 * explicación que dar. Y no pisa una propuesta ya hecha por el modelo: esa es una decisión de otro
 * camino y la persona la tiene que ver como está.
 */
export async function registrarSinResolver({ query }, r) {
  await query(
    `update public.obra_actividad
        set propuesta_evidencia = $2, propuesta_en = now()
      where id = $1 and tarea_tipo_id is null and propuesta_tarea_tipo_id is null`,
    [r.actividadId, JSON.stringify({
      ...(r.decision.evidencia ?? {}),
      veredicto: r.decision.veredicto,
      por_que: r.decision.porQue,
      vetadas: r.decision.vetadas ?? undefined,
      sin_propuesta: true,
    })])
}
