// EL PLAN DE TESORERÍA VIGENTE — la frontera entre "recalcular" (automático) y "ejecutar" (autorizado).
//
// POR QUÉ (24/07). El dueño fijó la regla: el plan se recalcula solo y se muestra marcado como
// PENDIENTE DE EJECUCIÓN, pero NADIE crea tareas operativas hasta que una autoridad lo autorice
// (el dueño, el Director IA, el CFO IA, o una aprobación explícita desde la interfaz). Este módulo es
// esa frontera: guarda el snapshot del plan, detecta cuándo CAMBIÓ (por su huella), y lleva el estado
// pendiente_ejecucion → autorizado → ejecutado. No crea tareas: eso es del orquestador, y sólo con
// autorización.

import { createHash } from 'node:crypto'

/** Quiénes pueden autorizar la ejecución. La interfaz autoriza como 'interfaz'. */
export const AUTORIZANTES = ['dueño', 'dueno', 'director', 'director-ia', 'cfo', 'cfo-ia', 'interfaz']

/** ¿Es una autorización válida para ejecutar? Sin esto, el orquestador sólo muestra, no crea tareas. */
export function esAutorizacionValida(quien) {
  return AUTORIZANTES.includes(String(quien || '').toLowerCase().trim())
}

/**
 * NÚCLEO PURO: la huella del plan EJECUTABLE. No hashea el plan entero (que incluye timestamps y
 * números que cambian a cada rato): hashea el conjunto de ACCIONES del horizonte por su identidad
 * estable —qué hay que hacer— para que "cambió el plan" signifique "cambió lo que hay que ejecutar",
 * no "pasó un minuto". Dos planes con las mismas acciones tienen la misma huella.
 *
 * @param {object} plan resultado de planTesoreria()
 * @param {string} horizonte
 */
export function huellaPlan(plan = {}, horizonte = 'dias_7') {
  const acciones = plan?.horizontes?.[horizonte]?.acciones || []
  const claves = acciones.map((a) => `${a.fecha}|${a.tipo}|${a.descripcion}`).sort()
  return createHash('sha256').update(claves.join('\n')).digest('hex').slice(0, 32)
}

/** Identidad de una acción para comparar planes: qué se hace y a quién, sin el importe exacto. */
const idAccion = (a) => `${a.tipo}|${(a.descripcion || '').replace(/\$[\d.,]+/g, '').trim()}`

/**
 * NÚCLEO PURO: qué cambió entre el plan nuevo y el anterior. Lo calcula el Business OS —no React— para
 * que la Web sólo lo muestre. Agregadas: acciones que antes no estaban. Eliminadas: estaban y ya no.
 * Reprogramadas: la misma acción en otra fecha.
 *
 * @returns {{agregadas:Array, eliminadas:Array, reprogramadas:Array}}
 */
export function compararPlanes(nuevo = {}, viejo = {}, horizonte = 'dias_7') {
  const an = nuevo?.horizontes?.[horizonte]?.acciones || []
  const av = viejo?.horizontes?.[horizonte]?.acciones || []
  const mapV = new Map(av.map((a) => [idAccion(a), a]))
  const mapN = new Map(an.map((a) => [idAccion(a), a]))
  const agregadas = []; const reprogramadas = []
  for (const a of an) {
    const v = mapV.get(idAccion(a))
    if (!v) agregadas.push({ fecha: a.fecha, descripcion: a.descripcion })
    else if (v.fecha !== a.fecha) reprogramadas.push({ descripcion: a.descripcion, de: v.fecha, a: a.fecha })
  }
  const eliminadas = av.filter((a) => !mapN.has(idAccion(a))).map((a) => ({ fecha: a.fecha, descripcion: a.descripcion }))
  return { agregadas, eliminadas, reprogramadas }
}

/** El query real por defecto; inyectable para tests. */
async function q(deps) { return deps?.query || (await import('./db.mjs')).query }

async function asegurarTabla(query) {
  await query(`
    create table if not exists public.finanzas_plan_vigente (
      id int primary key default 1 check (id = 1),
      horizonte text not null, plan_hash text not null, plan jsonb not null, cambios jsonb,
      estado text not null default 'pendiente_ejecucion'
        check (estado in ('pendiente_ejecucion','autorizado','ejecutado')),
      calculado_en timestamptz not null default now(),
      autorizado_por text, autorizado_en timestamptz, ejecutado_en timestamptz,
      correlation_id uuid,
      actualizado_en timestamptz not null default now()
    )`)
  await query('alter table public.finanzas_plan_vigente add column if not exists cambios jsonb')
  await query('alter table public.finanzas_plan_vigente add column if not exists correlation_id uuid')
}

/**
 * RECÁLCULO AUTOMÁTICO (sin crear tareas): guarda el snapshot del plan y decide su estado.
 *
 * Si la huella CAMBIÓ respecto de lo guardado, el plan nuevo entra como 'pendiente_ejecucion' —hay que
 * volver a autorizar, porque lo que había que hacer cambió—. Si la huella es la misma, se conserva el
 * estado (si ya estaba autorizado/ejecutado, no se reabre por un recálculo idéntico).
 *
 * @returns {{cambio:boolean, estado:string, hash:string}}
 */
export async function snapshotPlan(deps, plan, horizonte = 'dias_7') {
  const query = await q(deps)
  await asegurarTabla(query)
  const hash = huellaPlan(plan, horizonte)
  const { rows } = await query('select plan_hash, estado, plan from public.finanzas_plan_vigente where id = 1')
  const previo = rows[0]
  const cambio = !previo || previo.plan_hash !== hash
  // Cambió lo ejecutable → vuelve a pendiente. No cambió → se conserva el estado que tenía.
  const estado = cambio ? 'pendiente_ejecucion' : (previo?.estado || 'pendiente_ejecucion')
  // Qué cambió vs el plan anterior — calculado acá, en el OS, no en React. Sólo si de verdad cambió.
  const cambios = cambio && previo?.plan ? compararPlanes(plan, previo.plan, horizonte) : null
  await query(
    `insert into public.finanzas_plan_vigente (id, horizonte, plan_hash, plan, cambios, estado, calculado_en, actualizado_en)
     values (1, $1, $2, $3::jsonb, $4::jsonb, $5, now(), now())
     on conflict (id) do update set horizonte=excluded.horizonte, plan_hash=excluded.plan_hash,
       plan=excluded.plan, cambios=excluded.cambios, estado=excluded.estado, calculado_en=now(), actualizado_en=now()`,
    [horizonte, hash, JSON.stringify(plan), cambios ? JSON.stringify(cambios) : null, estado])
  return { cambio, estado, hash, cambios }
}

/** El plan vigente guardado (para mostrarlo sin recalcular). */
export async function planVigente(deps) {
  const query = await q(deps)
  await asegurarTabla(query)
  const { rows } = await query('select * from public.finanzas_plan_vigente where id = 1')
  return rows[0] || null
}

/** Marca que una autoridad autorizó ejecutar el plan vigente (aún no se crean tareas acá). */
export async function autorizarEjecucion(deps, quien) {
  const query = await q(deps)
  await asegurarTabla(query)
  await query(
    `update public.finanzas_plan_vigente set estado='autorizado', autorizado_por=$1, autorizado_en=now(), actualizado_en=now()
      where id = 1`, [String(quien)])
  return { ok: true }
}

/** Marca el plan vigente como ejecutado y guarda el correlation_id de sus tareas (para el seguimiento). */
export async function marcarEjecutado(deps, quien, correlationId = null) {
  const query = await q(deps)
  await asegurarTabla(query)
  await query(
    `update public.finanzas_plan_vigente set estado='ejecutado', autorizado_por=coalesce(autorizado_por,$1),
       autorizado_en=coalesce(autorizado_en,now()), ejecutado_en=now(), correlation_id=$2, actualizado_en=now() where id = 1`,
    [String(quien), correlationId])
  return { ok: true }
}
