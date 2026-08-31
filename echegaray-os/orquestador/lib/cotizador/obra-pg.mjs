// EL BORDE DE LA OBRA — lo único de §16/§17/§18 que toca la base.
//
// Mismo criterio que `pg.mjs`: los tres módulos de obra son puros y por eso se pueden probar sin
// red. Acá se traduce entre las filas y esa forma, y NADA se corrige en el camino. Si
// `obra_ejecucion.cantidad` viene en NULL —247 de 251 filas hoy—, llega como NULL; el que decide
// qué significa es `plan-vs-real.mjs`, y ya sabe.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ NO ES PARA LA WEB. LA RLS NO APLICA ACÁ.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `query` es en la práctica el POOL del servidor, que no pasa por row-level security. Uso legítimo:
// scripts, informes, tests, el worker. Uso prohibido: una ruta de Next o una server action — ahí la
// escritura la hace el caller con SU credencial. `obra-pg.pg.test.mjs` prueba las policies aparte,
// con `set local role authenticated`.

import { MOTOR } from './plan-vs-real.mjs'

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LECTURA
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** LA GENEALOGÍA DE UNA OBRA. `null` si nunca se estableció — y eso NO se completa adivinando cuál
 *  de las cotizaciones «adjudicada» era la buena. */
export async function leerGenealogia({ query }, obraId, { alcance = 'ORIGINAL' } = {}) {
  const filas = await query(
    `select o.*, c.numero, c.obra_nombre
       from public.obra_origen_cotizacion o
       join public.cotizaciones c on c.id = o.cotizacion_id
      where o.obra_id = $1 and o.alcance = $2`, [obraId, alcance])
  return filas[0] ?? null
}

/** EL PLAN CONGELADO, en la forma que `consolidarEjecucion` consume. */
export async function leerPlanDeObra({ query }, obraId) {
  const filas = await query(
    `select id, origen_id, obra_id, cotizacion_partida_id, actividad_id, codigo, descripcion, unidad,
            cantidad_plan, hs_unitarias_plan, hh_plan, costo_unitario_plan, costo_plan, dias_plan,
            subcontratada, precio_subcontrato_plan
       from public.obra_partida_plan where obra_id = $1 order by codigo`, [obraId])
  const n = (v) => (v === null || v === undefined ? null : Number(v))
  return filas.map((f) => ({
    id: f.id,
    cotizacionPartidaId: f.cotizacion_partida_id,
    actividadId: f.actividad_id,
    codigo: f.codigo, descripcion: f.descripcion, unidad: f.unidad,
    cantidadPlan: n(f.cantidad_plan), hsUnitariasPlan: n(f.hs_unitarias_plan), hhPlan: n(f.hh_plan),
    costoUnitarioPlan: n(f.costo_unitario_plan), costoPlan: n(f.costo_plan), diasPlan: n(f.dias_plan),
    subcontratada: f.subcontratada, precioSubcontratoPlan: n(f.precio_subcontrato_plan),
  }))
}

/**
 * LA EJECUCIÓN REAL CRUDA. CINCO consultas fijas, no N+1.
 *
 * Los equipos se traen ya enganchados a su actividad: `obra_ejecucion_equipo` apunta al PARTE
 * (`ejecucion_id`) y no a la actividad, así que la unión la hace la consulta y no un bucle.
 */
export async function leerEjecucionReal({ query }, obraId, { partidaIds = [] } = {}) {
  const [ejecuciones, horas, equipos, costos, composicion] = await Promise.all([
    query(`select id, actividad_id, fecha, cantidad, avance_pct, causa_desvio, comentario, fuente, metodo, cuadrilla_id
             from public.obra_ejecucion where obra_id = $1`, [obraId]),
    query(`select h.id, h.actividad_id, h.fecha, h.fecha_inicio_semana, h.horas, h.persona_id,
                  h.trabajador_o_cuadrilla, h.tipo_hora, h.improductiva, h.causa_desvio, h.notas
             from public.registros_hh h
             join public.obra_actividad a on a.id = h.actividad_id
            where a.obra_id = $1`, [obraId]),
    query(`select q.id, e.actividad_id, e.fecha, q.equipo, q.horas
             from public.obra_ejecucion_equipo q
             join public.obra_ejecucion e on e.id = q.ejecucion_id
            where q.obra_id = $1`, [obraId]),
    query(`select id, cotizacion_partida_id, actividad_id, tipo, recurso_codigo, recurso_nombre,
                  unidad, cantidad, precio_unitario, monto, moneda, fecha, proveedor, comprobante, fuente
             from public.obra_partida_costo_real where obra_id = $1`, [obraId]),
    partidaIds.length
      ? query(`select partida_id, recurso_codigo, recurso_nombre, tipo, unidad, cantidad, desperdicio, costo_unitario
                 from public.cotizacion_partida_composicion where partida_id = any($1::uuid[]) order by partida_id, orden`, [partidaIds])
      : Promise.resolve([]),
  ])
  return { ejecuciones, horas, equipos, costos, composicion }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ESCRITURA
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** GUARDAR LA GENEALOGÍA. Idempotente por (obra, cotización): correr el enganche dos veces no crea
 *  dos orígenes. El índice parcial de la base impide además una segunda ORIGINAL. */
export async function guardarGenealogia({ query }, g) {
  const filas = await query(
    `insert into public.obra_origen_cotizacion
       (obra_id, cotizacion_id, alcance, version, congelada_en, huella_sha256, adjudicada_en,
        adjudicada_por, costo_estimado, meta_ingreso, nota)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (obra_id, cotizacion_id) do update set nota = excluded.nota
     returning *`,
    [g.obraId, g.cotizacionId, g.alcance, g.version, g.congeladaEn, g.huellaSha256, g.adjudicadaEn,
      g.adjudicadaPor, g.costoEstimado, g.metaIngreso, g.nota])
  return filas[0]
}

/** GUARDAR EL PLAN HEREDADO. `do nothing` en conflicto y NO `do update`: el plan es congelado, y un
 *  upsert que lo pisara sería exactamente lo que el trigger de la base impide. */
export async function guardarPlan({ query }, { origenId, obraId, filas }) {
  if (!filas.length) return []
  const cols = [[], [], [], [], [], [], [], [], [], [], [], [], []]
  for (const f of filas) {
    const v = [origenId, obraId, f.cotizacionPartidaId, f.codigo, f.descripcion, f.unidad,
      f.cantidadPlan, f.hsUnitariasPlan, f.hhPlan, f.costoUnitarioPlan, f.costoPlan, f.diasPlan, f.subcontratada]
    v.forEach((x, i) => cols[i].push(x))
  }
  return query(
    `insert into public.obra_partida_plan
       (origen_id, obra_id, cotizacion_partida_id, codigo, descripcion, unidad, cantidad_plan,
        hs_unitarias_plan, hh_plan, costo_unitario_plan, costo_plan, dias_plan, subcontratada)
     select * from unnest($1::uuid[], $2::text[], $3::uuid[], $4::text[], $5::text[], $6::text[],
                          $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[], $11::numeric[],
                          $12::numeric[], $13::boolean[])
     on conflict (obra_id, cotizacion_partida_id) do nothing
     returning id, cotizacion_partida_id, codigo`, cols)
}

/** ENLAZAR UNA PARTIDA DEL PLAN CON SU ACTIVIDAD. Es el ÚNICO update permitido sobre el plan; el
 *  resto lo rechaza el trigger `obra_partida_plan_congelado`. */
export async function enlazarActividad({ query }, { obraId, cotizacionPartidaId, actividadId }) {
  const filas = await query(
    `update public.obra_partida_plan set actividad_id = $3
      where obra_id = $1 and cotizacion_partida_id = $2 returning id, actividad_id`,
    [obraId, cotizacionPartidaId, actividadId])
  return filas[0] ?? null
}

/** IMPUTAR UN COSTO REAL A UNA PARTIDA. `cotizacionPartidaId` puede ser null: entra igual y sale en
 *  SIN_IMPUTAR. Rechazarlo lo haría desaparecer del costo de la obra. */
export async function imputarCostoReal({ query }, c) {
  const filas = await query(
    `insert into public.obra_partida_costo_real
       (obra_id, cotizacion_partida_id, actividad_id, tipo, recurso_codigo, recurso_nombre, unidad,
        cantidad, precio_unitario, monto, moneda, fecha, proveedor, comprobante, fuente, fuente_id, imputado_por)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11,'ARS'),$12,$13,$14,$15,$16,$17)
     on conflict do nothing
     returning id`,
    [c.obraId, c.cotizacionPartidaId ?? null, c.actividadId ?? null, c.tipo, c.recursoCodigo ?? null,
      c.recursoNombre, c.unidad ?? null, c.cantidad ?? null, c.precioUnitario ?? null, c.monto,
      c.moneda ?? null, c.fecha, c.proveedor ?? null, c.comprobante ?? null, c.fuente, c.fuenteId ?? null,
      c.imputadoPor ?? null])
  return filas[0] ?? null
}

/** GUARDAR LAS OBSERVACIONES DE UNA CORRIDA. Append-only: no pisa las corridas anteriores, porque
 *  dos corridas con resultados distintos son un dato y no un error. */
export async function guardarObservaciones({ query }, { obraId, observaciones, corridaId, motor = MOTOR }) {
  if (!observaciones.length) return 0
  const c = Array.from({ length: 13 }, () => [])
  for (const o of observaciones) {
    // La evidencia viaja como TEXTO y se castea por fila. Como `jsonb[]` el driver arma un literal
    // de array y las llaves y comas del JSON lo rompen: la evidencia llegaba vacía o la fila fallaba.
    const v = [obraId, o.cotizacionPartidaId, o.concepto, o.unidad, o.plan, o.real, o.desvio,
      o.desvioPct, o.comparable, o.motivoNoComparable, o.causa, o.estado,
      o.evidencia ? JSON.stringify(o.evidencia) : null]
    v.forEach((x, i) => c[i].push(x))
  }
  const filas = await query(
    `insert into public.obra_plan_real_observacion
       (obra_id, cotizacion_partida_id, concepto, unidad, plan, real_medido, desvio, desvio_pct,
        comparable, motivo_no_comparable, causa, estado, evidencia, corrida_id, motor_version)
     select t.obra_id, t.partida_id, t.concepto, t.unidad, t.plan, t.real_medido, t.desvio, t.desvio_pct,
            t.comparable, t.motivo, t.causa, t.estado, t.evidencia::jsonb, $14::uuid, $15::text
       from unnest($1::text[], $2::uuid[], $3::text[], $4::text[], $5::numeric[], $6::numeric[],
                   $7::numeric[], $8::numeric[], $9::boolean[], $10::text[], $11::text[], $12::text[],
                   $13::text[])
         as t(obra_id, partida_id, concepto, unidad, plan, real_medido, desvio, desvio_pct,
              comparable, motivo, causa, estado, evidencia)
     returning id`, [...c, corridaId, motor])
  return filas.length
}
