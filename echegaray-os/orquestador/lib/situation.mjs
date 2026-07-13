// Situation Assembler (Etapa 3). Ensambla el estado integral de la empresa y del
// sistema para que el Director IA razone sobre datos REALES (no inventados). Lee
// señales agregadas de las tablas de negocio existentes en `public` y la salud
// del Work Fabric en `orq`. Cada bloque es defensivo: si una tabla/columna no
// está, devuelve el bloque en null sin romper el conjunto.
import { query } from './db.mjs'

async function safe(fn, fallback = null) {
  try { return await fn() } catch { return fallback }
}
const rows = (sql, p) => query(sql, p).then((r) => r.rows)
const groupCount = async (sql, p) => {
  const r = await rows(sql, p)
  return Object.fromEntries(r.map((x) => [x.k ?? '(null)', Number(x.n)]))
}

async function negocio() {
  const backlog = await safe(async () => ({
    total: (await rows('select count(*)::int n from public.backlog_autonomo'))[0].n,
    por_estado: await groupCount('select estado k, count(*) n from public.backlog_autonomo group by estado'),
    por_impacto: await groupCount('select impacto k, count(*) n from public.backlog_autonomo group by impacto'),
  }))
  const acciones = await safe(async () => ({
    total: (await rows('select count(*)::int n from public.acciones'))[0].n,
    por_estado: await groupCount('select estado k, count(*) n from public.acciones group by estado'),
    bloqueadas: (await rows('select count(*)::int n from public.acciones where bloqueada is true'))[0].n,
    vencidas: (await rows("select count(*)::int n from public.acciones where fecha_limite < now() and coalesce(estado,'') not in ('resuelta','cerrada','cancelada')"))[0].n,
  }))
  const obras = await safe(async () => ({
    total: (await rows('select count(*)::int n from public.obras'))[0].n,
    por_estado: await groupCount('select estado k, count(*) n from public.obras group by estado'),
    monto_contratado_total: Number((await rows('select coalesce(sum(monto_contratado),0) s from public.obras'))[0].s),
  }))
  // tipo real: 'cobro' (ingreso) / 'pago' (egreso); estado: 'proyectado' / 'real'
  const caja = await safe(async () => ({
    cuentas: (await rows('select count(*)::int n from public.cuentas_financieras'))[0].n,
    movimientos_por_estado: await groupCount('select estado k, count(*) n from public.movimientos_caja group by estado'),
    cobros_esperados_30d: Number((await rows("select coalesce(sum(monto),0) s from public.movimientos_caja where tipo='cobro' and fecha_esperada between now() and now()+interval '30 days'"))[0].s),
    pagos_esperados_30d: Number((await rows("select coalesce(sum(monto),0) s from public.movimientos_caja where tipo='pago' and fecha_esperada between now() and now()+interval '30 days'"))[0].s),
  }))
  const obligaciones = await safe(async () => ({
    total: (await rows('select count(*)::int n from public.obligaciones'))[0].n,
    monto_total: Number((await rows('select coalesce(sum(monto_total),0) s from public.obligaciones'))[0].s),
    vencidas: (await rows('select count(*)::int n from public.obligaciones where fecha_vencimiento < now()'))[0].n,
  }))
  // bloqueante es TEXTO (nota de bloqueo); nivel_actual es entero 1..7
  const scorecard = await safe(async () => ({
    dominios: (await rows('select count(*)::int n from public.scorecard_dominios'))[0].n,
    con_bloqueo: (await rows("select count(*)::int n from public.scorecard_dominios where bloqueante is not null and length(trim(bloqueante)) > 0"))[0].n,
    nivel_promedio: Number((await rows('select round(avg(nivel_actual),1) a from public.scorecard_dominios'))[0].a),
    por_nivel: await groupCount('select nivel_actual::text k, count(*) n from public.scorecard_dominios group by nivel_actual order by nivel_actual'),
  }))
  const fuentes = await safe(async () => ({
    total: (await rows('select count(*)::int n from public.fuentes_datos'))[0].n,
    por_estado: await groupCount('select estado k, count(*) n from public.fuentes_datos group by estado'),
    criticas: (await rows("select count(*)::int n from public.fuentes_datos where criticidad ilike '%alt%' or criticidad ilike '%crit%'"))[0].n,
  }))
  // Catálogo REAL de fuentes (con drive_file_id) para que el especialista sepa QUÉ
  // fuentes existen y pueda leer la correcta con drive_read/drive_list. Sin esto
  // sólo veía un conteo ("hay 23 fuentes") y adivinaba dónde estaba el dato.
  const fuentes_catalogo = await safe(async () =>
    rows(`select nombre, area, naturaleza_dato, drive_file_id, criticidad, estado, proceso_negocio
            from public.fuentes_datos
           order by (criticidad ilike '%alt%' or criticidad ilike '%crit%') desc nulls last, nombre
           limit 40`), [])
  return { backlog, acciones, obras, caja, obligaciones, scorecard, fuentes, fuentes_catalogo }
}

async function sistema() {
  return await safe(async () => ({
    cola: await groupCount('select state k, count(*) n from orq.tasks group by state'),
    dead_letter: (await rows("select count(*)::int n from orq.tasks where state='dead_letter'"))[0].n,
    tareas_totales: (await rows('select count(*)::int n from orq.tasks'))[0].n,
    agentes: (await rows('select count(*)::int n from orq.agents where enabled'))[0].n,
    workers_activos_1h: (await rows("select count(distinct worker_id)::int n from orq.task_attempts where started_at > now() - interval '1 hour'"))[0].n,
    postmortems_24h: (await rows("select count(*)::int n from orq.events where type='task.postmortem' and created_at > now() - interval '24 hours'"))[0].n,
  }))
}

/** Snapshot situacional completo (negocio + sistema). */
export async function assembleSituation() {
  const [neg, sis] = await Promise.all([negocio(), sistema()])
  return { generated_at: new Date().toISOString(), negocio: neg, sistema: sis }
}

// Dominio del especialista -> qué bloques del estado mirar con prioridad. No
// fabrica datos: enfoca la lectura sobre las señales reales que sí existen.
const DOMAIN_FOCUS = {
  finanzas:      'Enfocá CAJA, OBLIGACIONES y el contratado de OBRAS. Criterio percibido (nunca mezcles con devengado).',
  contabilidad:  'Enfocá el contratado de OBRAS, CAJA y OBLIGACIONES. Criterio devengado (P&L), separado de caja.',
  compras:       'Enfocá OBRAS activas y OBLIGACIONES a proveedores; evaluá riesgo de abastecimiento y subcontratos.',
  comercial:     'Enfocá OBRAS (pipeline/backlog contratado) y BACKLOG; riesgo de cliente y de concentración.',
  planificacion: 'Enfocá OBRAS (avance/estado), ACCIONES bloqueadas/vencidas y SCORECARD; cuellos de botella de producción.',
  arquitectura:  'Enfocá OBRAS y SCORECARD; calidad, especificación y no conformidades.',
  ingenieria:    'Enfocá OBRAS y SCORECARD; viabilidad técnica, métodos y patologías.',
  legal:         'Enfocá OBRAS (contratos), OBLIGACIONES y ACCIONES; exigibilidad de adicionales, reclamos y garantías.',
  rrhh:          'Enfocá OBLIGACIONES (UOCRA/IERIC/Fondo de Cese) y ACCIONES; régimen laboral de construcción.',
}

/** Digest enfocado por dominio para el prompt de un especialista: el estado real
 *  completo + una guía de qué mirar con prioridad. Cae al digest general si el
 *  dominio no está mapeado. */
export function domainDigest(s, domain) {
  const focus = DOMAIN_FOCUS[domain]
  const base = situationDigest(s)
  return focus ? `FOCO DE TU DOMINIO (${domain}): ${focus}\n\n${base}` : base
}

/** Cataloga las fuentes reales en texto: nombre, área/naturaleza, file_id y estado.
 *  Es lo que permite al especialista ir a leer la fuente CORRECTA con drive_read. */
function catalogoTexto(catalogo) {
  if (!catalogo || !catalogo.length) return ''
  const lineas = catalogo.map((f) => {
    const meta = [f.area, f.naturaleza_dato].filter(Boolean).join('/')
    const id = f.drive_file_id ? ` · file_id:${f.drive_file_id}` : ''
    const est = f.estado ? ` · ${f.estado}` : ''
    return `  - ${f.nombre}${meta ? ` [${meta}]` : ''}${id}${est}`
  })
  return (
    'FUENTES DE DATOS REALES DE LA EMPRESA — la verdad vive acá, en Drive. Los conteos de arriba ' +
    'son un índice PARCIAL de Supabase (incompleto: hay muchas más obras/legajos/presupuestos en Drive). ' +
    'Para responder con precisión, LEÉ la fuente que corresponda con drive_read (por su file_id) o navegá ' +
    'con drive_list. NO te quedes con el conteo parcial:\n' + lineas.join('\n')
  )
}

/** Resumen compacto en texto para el prompt del Director (barato de leer). */
export function situationDigest(s) {
  const n = s.negocio ?? {}
  const y = s.sistema ?? {}
  const lines = [
    `SISTEMA: ${y.tareas_totales ?? 0} tareas (dead-letter ${y.dead_letter ?? 0}), ${y.agentes ?? 0} agentes, ${y.workers_activos_1h ?? 0} workers/1h, ${y.postmortems_24h ?? 0} post-mortems/24h.`,
    `ÍNDICE PARCIAL (Supabase — NO es el total real, sólo lo ya cargado):`,
    `  BACKLOG: ${n.backlog?.total ?? '?'} items ${JSON.stringify(n.backlog?.por_estado ?? {})}.`,
    `  ACCIONES: ${n.acciones?.total ?? '?'} (bloqueadas ${n.acciones?.bloqueadas ?? '?'}, vencidas ${n.acciones?.vencidas ?? '?'}).`,
    `  OBRAS: ${n.obras?.total ?? '?'} ${JSON.stringify(n.obras?.por_estado ?? {})}, contratado ${n.obras?.monto_contratado_total ?? '?'} (parcial: el detalle real está en PRESUPUESTOS/obras de Drive).`,
    `  CAJA: ${n.caja?.cuentas ?? '?'} cuentas, cobros30d ${n.caja?.cobros_esperados_30d ?? '?'}, pagos30d ${n.caja?.pagos_esperados_30d ?? '?'} (el saldo y flujo real están en el Sheet Flujo de Caja).`,
    `  OBLIGACIONES: ${n.obligaciones?.total ?? '?'} (vencidas ${n.obligaciones?.vencidas ?? '?'}, monto ${n.obligaciones?.monto_total ?? '?'}).`,
    `  SCORECARD: ${n.scorecard?.dominios ?? '?'} dominios, nivel prom ${n.scorecard?.nivel_promedio ?? '?'}, con bloqueo ${n.scorecard?.con_bloqueo ?? '?'}.`,
  ]
  const cat = catalogoTexto(n.fuentes_catalogo)
  return cat ? `${lines.join('\n')}\n\n${cat}` : lines.join('\n')
}
