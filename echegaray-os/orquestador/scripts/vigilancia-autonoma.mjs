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
import { desviosObras } from '../lib/obra-economics.mjs'

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
  // CEREBRO — acumular: subo a la base de conocimiento las conclusiones de las últimas
  // consolidaciones (dedup por clave normalizada; si se repite, sube veces_confirmado).
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 220)
  const cierres = await safe(
    `select id, result->'key_points' as puntos from orq.tasks
      where type='direction_consolidate' and state='succeeded' order by updated_at desc limit 6`)
  for (const c of cierres) {
    for (const p of (Array.isArray(c.puntos) ? c.puntos : [])) {
      const af = String(p).trim().slice(0, 400); const clave = norm(af)
      if (af.length < 8) continue
      await query(
        `insert into public.conocimiento_empresa (area, afirmacion, clave, origen_task_id) values ('direccion',$1,$2,$3)
         on conflict (clave) do update set veces_confirmado = public.conocimiento_empresa.veces_confirmado + 1, updated_at = now(), vigente = true`,
        [af, clave, c.id]).catch(() => {})
    }
  }
  // CEREBRO — recordar: lo que el OS ya sabe (más confirmado primero).
  const saber = await safe(
    `select afirmacion, veces_confirmado from public.conocimiento_empresa
      where vigente order by veces_confirmado desc, updated_at desc limit 14`)

  // DESVÍOS DE OBRA YA CALCULADOS (determinístico, 0 API): le damos al Director los
  // números concretos en vez de pedirle que "vaya a buscar el desvío". Grounding real.
  let desvios = []
  try { desvios = await desviosObras() } catch { desvios = [] }

  if (!backlog.length && !acciones.length && !saber.length && !desvios.length) return ''
  const b = backlog.map((r) => `  - [${r.impacto}/${r.tipo}] ${r.titulo}`).join('\n')
  const a = acciones.map((r) => `  - [${r.situacion}] ${r.titulo}`).join('\n')
  const m = saber.map((r) => `  - ${r.afirmacion}${r.veces_confirmado > 1 ? ` (confirmado ${r.veces_confirmado}×)` : ''}`).join('\n')
  const d = desvios.map((x) => `  - ${x}`).join('\n')
  return (
    (desvios.length
      ? `\n\nDESVÍOS ECONÓMICOS DE OBRA YA CALCULADOS (dato real, no los recalcules — decidí si ameritan trabajo hoy):\n${d}\n`
      : '') +
    (m ? `\n\nLO QUE EL OS YA SABE DE LA EMPRESA (memoria acumulada — construí sobre esto, no lo re-descubras):\n${m}\n` : '') +
    `\n\nYA REGISTRADO POR EL OS (revisá y NO lo repitas — deltas, no duplicados):\n` +
    (backlog.length ? `BACKLOG AUTÓNOMO abierto (${backlog.length}):\n${b}\n` : '') +
    (acciones.length ? `ACCIONES que requieren atención (${acciones.length}):\n${a}\n` : '') +
    `INSTRUCCIÓN sobre esto: para cada ítem ya registrado, decidí si (a) sigue vigente y hay algo NUEVO que aportar, ` +
    `(b) ya está resuelto y hay que proponer cerrarlo, o (c) no amerita trabajo hoy. NO vuelvas a levantar un hallazgo ` +
    `que ya está en esta lista salvo que haya un cambio material. Priorizá lo NUEVO por sobre lo ya conocido. ` +
    `Y CONECTÁ ENTRE ÁREAS: si dos hallazgos de dominios distintos son parte del mismo problema (ej. un vencimiento ` +
    `de caja + una obra parada + un pago a proveedor), decilo como UN solo cuadro, no como alertas sueltas.`
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
