// Recurrencias / agenda del OS (PRP-015 Fase 4). El dueño programa directivas y el
// worker las dispara en su cadencia. Zona horaria fija America/Argentina (UTC-3, sin
// DST desde 2009), así que las horas de las cadencias se interpretan en hora AR.
import { query } from './db.mjs'

const AR_OFFSET_MS = -3 * 3600 * 1000 // AR = UTC-3
const DOW = { dom: 0, lun: 1, mar: 2, mie: 3, mié: 3, jue: 4, vie: 5, sab: 6, sáb: 6 }

/** Próximo instante (UTC) de una cadencia, interpretada en hora AR.
 *  'daily:HH:MM' | 'weekly:<dia>:HH:MM' | 'monthly:DD:HH:MM' | 'once' (→ null). */
export function computeNextRun(cadence, from = new Date()) {
  const p = String(cadence || '').toLowerCase().split(':')
  const kind = p[0]
  const ar = new Date(from.getTime() + AR_OFFSET_MS) // sus campos UTC = hora de pared AR
  const toUTC = (d) => new Date(d.getTime() - AR_OFFSET_MS)
  const setHM = (d, hh, mm) => { d.setUTCHours(hh, mm, 0, 0); return d }

  if (kind === 'once') return null
  if (kind === 'daily') {
    const c = setHM(new Date(ar), Number(p[1] ?? 8), Number(p[2] ?? 0))
    if (c <= ar) c.setUTCDate(c.getUTCDate() + 1)
    return toUTC(c)
  }
  if (kind === 'weekly') {
    const target = DOW[p[1]] ?? 1
    const c = setHM(new Date(ar), Number(p[2] ?? 8), Number(p[3] ?? 0))
    let add = (target - c.getUTCDay() + 7) % 7
    if (add === 0 && c <= ar) add = 7
    c.setUTCDate(c.getUTCDate() + add)
    return toUTC(c)
  }
  if (kind === 'monthly') {
    const c = setHM(new Date(ar), Number(p[2] ?? 8), Number(p[3] ?? 0))
    c.setUTCDate(Number(p[1] ?? 1))
    if (c <= ar) c.setUTCMonth(c.getUTCMonth() + 1)
    return toUTC(c)
  }
  // fallback: mañana 08:00 AR
  return toUTC(setHM(new Date(ar.getTime() + 86400000), 8, 0))
}

export async function createSchedule({ tenantId, createdBy = null, title, directive, cadence, nextRunAt }) {
  const next = nextRunAt ? new Date(nextRunAt) : computeNextRun(cadence) || new Date(Date.now() + 60000)
  const { rows } = await query(
    `insert into orq.schedules (tenant_id, created_by, title, directive, cadence, next_run_at)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [tenantId, createdBy, title, directive, cadence, next.toISOString()],
  )
  return rows[0]
}

export async function listSchedules({ enabledOnly = false } = {}) {
  const { rows } = await query(
    `select id, title, directive, cadence, next_run_at, last_run_at, last_result, enabled
       from orq.schedules ${enabledOnly ? 'where enabled' : ''} order by next_run_at asc limit 100`,
  )
  return rows
}

/** Recurrencias vencidas y habilitadas (para que el disparador las encole). */
export async function dueSchedules(now = new Date()) {
  const { rows } = await query(
    `select id, title, directive, cadence, next_run_at from orq.schedules
      where enabled and next_run_at <= $1 order by next_run_at asc limit 50`,
    [now.toISOString()],
  )
  return rows
}

/** Reprograma tras disparar: calcula el próximo run (o deshabilita si es 'once'). */
export async function rescheduleAfterFire(id, cadence) {
  const next = computeNextRun(cadence)
  if (next) {
    await query(`update orq.schedules set next_run_at=$2, last_run_at=now(), updated_at=now() where id=$1`, [id, next.toISOString()])
  } else {
    await query(`update orq.schedules set enabled=false, last_run_at=now(), updated_at=now() where id=$1`, [id])
  }
}

export async function setScheduleResult(id, result) {
  await query(`update orq.schedules set last_result=$2, updated_at=now() where id=$1`, [id, String(result ?? '').slice(0, 2000)])
}

export async function toggleSchedule(id, enabled) {
  const { rows } = await query(`update orq.schedules set enabled=$2, updated_at=now() where id=$1 returning id, enabled`, [id, !!enabled])
  return rows[0]
}
