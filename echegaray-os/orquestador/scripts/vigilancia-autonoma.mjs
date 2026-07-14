#!/usr/bin/env node
// ARRANQUE AUTÓNOMO — encola el objetivo de VIGILANCIA permanente que hace que la
// organización IA trabaje SOLA, sin que un humano abra /direccion. Pensado para un
// timer de systemd (como sync-calendario): el worker 24×7 lo procesa, el Director
// arma el DAG mínimo, los especialistas analizan sobre dato real y lo Nivel E cae
// en la cola de aprobación. NO ejecuta nada externo (techo A–C/D).
//
// Idempotente por FRANJA: dedupe_key = auto-vigilancia:YYYY-MM-DD-HH. Re-disparar
// dentro de la misma hora NO crea un objetivo nuevo (enqueue_task respeta el dedupe);
// una cadencia round-the-clock (cada 6h) genera 4 objetivos distintos por día.
//
// Uso:  node orquestador/scripts/vigilancia-autonoma.mjs         (encola)
//       node orquestador/scripts/vigilancia-autonoma.mjs --dry   (muestra, no encola)
import { enqueueTask } from '../lib/ledger.mjs'
import { query, closePool } from '../lib/db.mjs'
import { createLogger } from '../lib/logger.mjs'

const log = createLogger({ component: 'vigilancia-autonoma' })
const DRY = process.argv.includes('--dry')

// Lo YA REGISTRADO por el OS (detección pg_cron + trabajo humano): el Director debe
// TRIAGEARLO y surfacear sólo DELTAS, no repetir. Conecta las señales autónomas del
// backlog (que hoy no llegan al Work Fabric) con la organización IA. Defensivo: si una
// tabla no está, devuelve el bloque vacío sin romper el disparo.
async function contextoAbierto() {
  const safe = async (sql, p) => { try { return (await query(sql, p)).rows } catch { return [] } }
  const backlog = await safe(
    `select titulo, impacto, tipo from public.backlog_autonomo
      where estado = 'abierto' order by (impacto='alta') desc, updated_at desc limit 15`)
  const acciones = await safe(
    `select titulo, estado,
            case when bloqueada then 'bloqueada'
                 when fecha_limite < now() then 'vencida'
                 when responsable is null then 'sin responsable' else 'abierta' end as situacion
       from public.acciones
      where coalesce(estado,'') not in ('resuelta','cerrada','cancelada')
        and (bloqueada or fecha_limite < now() or responsable is null)
      order by fecha_limite asc nulls last limit 15`)
  if (!backlog.length && !acciones.length) return ''
  const b = backlog.map((r) => `  - [${r.impacto}/${r.tipo}] ${r.titulo}`).join('\n')
  const a = acciones.map((r) => `  - [${r.situacion}] ${r.titulo}`).join('\n')
  return (
    `\n\nYA REGISTRADO POR EL OS (revisá y NO lo repitas — deltas, no duplicados):\n` +
    (backlog.length ? `BACKLOG AUTÓNOMO abierto (${backlog.length}):\n${b}\n` : '') +
    (acciones.length ? `ACCIONES que requieren atención (${acciones.length}):\n${a}\n` : '') +
    `INSTRUCCIÓN sobre esto: para cada ítem ya registrado, decidí si (a) sigue vigente y hay algo NUEVO que aportar, ` +
    `(b) ya está resuelto y hay que proponer cerrarlo, o (c) no amerita trabajo hoy. NO vuelvas a levantar un hallazgo ` +
    `que ya está en esta lista salvo que haya un cambio material. Priorizá lo NUEVO por sobre lo ya conocido.`
  )
}

// Fecha+hora local (America/Argentina), sin depender del TZ del proceso.
function partesLocales() {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  })
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]))
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: p.hour === '24' ? '00' : p.hour }
}

const OBJETIVO = (fecha) =>
  `VIGILANCIA OPERATIVA AUTÓNOMA del ${fecha}. Nadie te pidió esto: es tu ronda diaria como Dirección. ` +
  `Revisá el estado REAL de la empresa y del OS y detectá lo MATERIAL — desvíos, riesgos, vencimientos y oportunidades ` +
  `que aparecieron o cambiaron. Asigná SÓLO lo que amerite a los especialistas de su dominio (no barras todo por rutina). ` +
  `Priorizá, en este orden: (1) CAJA y OBLIGACIONES/vencimientos próximos; (2) OBRAS activas con desvío de margen/HH; ` +
  `(3) SEGURIDAD e higiene de obras en curso (ARCOR); (4) CONFIABILIDAD de las fuentes de datos; (5) FISCAL (IVA/vencimientos). ` +
  `Cada especialista debe LEER su fuente real en Drive antes de opinar y declarar qué miró. ` +
  `Sólo análisis y preparación (Nivel A–C). Todo lo que tenga efecto económico/fiscal/laboral/legal/contractual real o ` +
  `comunicación externa (Nivel E) NO se ejecuta: va en approval_requests. Mantené el DAG MÍNIMO: si no hay nada material ` +
  `en un dominio, no le asignes trabajo. Si el día está tranquilo, un informe corto "sin novedades materiales" es una salida válida y deseable.`

async function main() {
  const { fecha, hora } = partesLocales()
  const contexto = await contextoAbierto()
  const task = {
    type: 'direction',
    title: `Vigilancia autónoma — ${fecha} ${hora}:00`,
    goal: OBJETIVO(`${fecha} ${hora}:00`) + contexto,
    dedupe_key: `auto-vigilancia:${fecha}-${hora}`,
  }
  if (DRY) {
    log.info('DRY-RUN (no se encola)', { dedupe_key: task.dedupe_key, contexto_chars: contexto.length })
    console.log(JSON.stringify(task, null, 2))
    await closePool()
    return
  }
  const id = await enqueueTask(task)
  log.info('objetivo de vigilancia encolado', { id, dedupe_key: task.dedupe_key, contexto_chars: contexto.length })
  await closePool()
}

main().catch((err) => { log.error('vigilancia-autonoma falló', { error: err.message }); process.exitCode = 1 })
