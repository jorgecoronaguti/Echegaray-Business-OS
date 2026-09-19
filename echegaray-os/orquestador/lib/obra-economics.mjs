// PRP-017 — CUADRO ECONÓMICO POR OBRA. Ensambla, para una obra, la única lectura
// coherente que pide el CLAUDE.md (Control Económico): Contratado ↔ Presupuestado ↔
// Costo Real ↔ Adicionales, y calcula margen esperado vs real y desvío de costo.
//
// Disciplina de evidencia (regla de oro: nunca fabricar): cada número se etiqueta
// DATO (viene de una tabla), CÁLCULO (derivado) o DESCONOCIDO (no hay dato cargado).
// El costo real de una obra EN CURSO es parcial → el margen real es "a la fecha",
// no final; se dice explícitamente. Lee de Supabase (0 API). Fuente de verdad de
// fondo: la decide la skill de dominio; acá solo se ensambla lo ya cargado.
import { query } from './db.mjs'

const ars = (n) =>
  n == null ? 'sin dato'
    : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n))
const pct = (n) => (n == null ? 'sin dato' : `${(Number(n) * 100).toFixed(1)}%`)
const num = (v) => (v == null ? null : Number(v))

/** Busca obras por nombre aproximado. Devuelve [] si ninguna coincide. */
export async function findObras(nombre) {
  const like = `%${String(nombre || '').trim().replace(/\s+/g, '%')}%`
  const { rows } = await query(
    `select id, nombre, estado, monto_contratado, fecha_inicio, fecha_fin_objetivo
       from public.obras
      where ($1 = '%%') or nombre ilike $1
      order by monto_contratado desc nulls last`,
    [like],
  )
  return rows
}

/** Junta todos los números económicos de UNA obra ya identificada (por id). */
async function ensamblar(obra) {
  const [{ rows: presRows }, { rows: crRows }, { rows: adRows }, { rows: cobRows }] = await Promise.all([
    query(
      `select monto_presupuestado, costo_directo_presupuestado, costo_indirecto_presupuestado,
              margen_esperado, hh_estimada, version, fecha_presupuesto
         from public.presupuestos where obra_id = $1 order by version desc nulls last, fecha_presupuesto desc nulls last limit 1`,
      [obra.id],
    ),
    query(`select coalesce(sum(monto),0) costo, count(*)::int n from public.costos_reales where obra_id = $1`, [obra.id]),
    query(
      `select
         coalesce(sum(case when monto_cotizado  is not null then monto_cotizado  else 0 end),0) cotizado,
         coalesce(sum(case when monto_aprobado  is not null then monto_aprobado  else 0 end),0) aprobado,
         coalesce(sum(case when monto_facturado is not null then monto_facturado else 0 end),0) facturado,
         coalesce(sum(case when monto_cobrado   is not null then monto_cobrado   else 0 end),0) cobrado,
         count(*)::int n
       from public.adicionales where obra_id = $1`,
      [obra.id],
    ),
    query(
      `select coalesce(sum(case when tipo='ingreso' and estado='real' then monto else 0 end),0) cobrado
         from public.movimientos_caja where obra_id = $1`,
      [obra.id],
    ),
  ])
  const p = presRows[0] || null
  const costoPresup = p ? (num(p.costo_directo_presupuestado) || 0) + (num(p.costo_indirecto_presupuestado) || 0) : null
  const costoReal = num(crRows[0].costo)
  const contratado = num(obra.monto_contratado)
  const enCurso = !['cerrada', 'terminada', 'finalizada'].includes(String(obra.estado || '').toLowerCase())
  return {
    obra,
    enCurso,
    contratado,
    // margen_esperado está en PESOS (monto − costo), no en fracción. Guardamos el monto
    // y derivamos el % sobre el monto presupuestado para poder comparar contra el real.
    presup: p
      ? {
          monto: num(p.monto_presupuestado),
          costo: costoPresup,
          margenMonto: num(p.margen_esperado),
          margenPct: num(p.margen_esperado) != null && num(p.monto_presupuestado) ? num(p.margen_esperado) / num(p.monto_presupuestado) : null,
          version: p.version,
        }
      : null,
    costoReal: crRows[0].n ? costoReal : null,
    nCostos: crRows[0].n,
    adic: adRows[0].n ? adRows[0] : null,
    cobradoCaja: num(cobRows[0].cobrado),
  }
}

/** Cuadro económico legible de una obra. `d` = salida de ensamblar(). */
function formatCuadro(d) {
  const { obra, contratado, presup, costoReal, enCurso } = d
  const L = []
  L.push(`**${obra.nombre}** · estado: ${obra.estado || '?'}${enCurso ? ' (en curso → cifras a la fecha, parciales)' : ' (cerrada → cifras finales)'}`)
  L.push('')
  L.push(`• Contratado: **${ars(contratado)}**  _(DATO)_`)
  if (presup) {
    L.push(`• Presupuestado (v${presup.version ?? '?'}): ${ars(presup.monto)} · costo previsto ${ars(presup.costo)} · margen esperado ${presup.margenMonto != null ? `${ars(presup.margenMonto)} (${pct(presup.margenPct)})` : 'sin dato'}  _(DATO)_`)
  } else {
    L.push('• Presupuesto: **sin presupuesto cargado** _(DESCONOCIDO — cargar para medir desvío)_')
  }
  L.push(`• Costo real acumulado: ${costoReal != null ? `**${ars(costoReal)}** (${d.nCostos} movimientos)` : '**sin costos cargados** _(DESCONOCIDO)_'}  _(DATO)_`)

  // Cálculos (solo si hay insumos): margen y desvío
  if (contratado != null && costoReal != null) {
    const margenReal = contratado - costoReal
    const margenPct = contratado ? margenReal / contratado : null
    L.push('')
    L.push(`→ Margen ${enCurso ? 'a la fecha (parcial)' : 'real'}: **${ars(margenReal)}** (${pct(margenPct)})  _(CÁLCULO = contratado − costo real)_`)
    if (presup && presup.costo != null && presup.costo > 0) {
      const desvio = costoReal - presup.costo
      L.push(`→ Desvío de costo vs presupuesto: **${ars(desvio)}** (${pct(desvio / presup.costo)})  _(CÁLCULO)_${desvio > 0 ? ' ⚠️ sobre-costo' : ''}`)
    }
    if (presup && presup.margenPct != null && margenPct != null) {
      const gap = margenPct - presup.margenPct
      L.push(`→ Margen ${enCurso ? 'parcial ' : ''}vs esperado (${pct(presup.margenPct)}): ${gap >= 0 ? '+' : ''}${pct(gap)}  _(CÁLCULO)_${gap < -0.03 ? ' ⚠️ por debajo de lo esperado' : ''}`)
    }
  }
  if (d.adic) {
    L.push('')
    L.push(`• Adicionales (${d.adic.n}): cotizado ${ars(d.adic.cotizado)} · aprobado ${ars(d.adic.aprobado)} · facturado ${ars(d.adic.facturado)} · cobrado ${ars(d.adic.cobrado)}  _(DATO)_`)
  }
  if (d.cobradoCaja) L.push(`• Cobrado (caja, ingresos reales): ${ars(d.cobradoCaja)}  _(DATO)_`)
  if (!presup || costoReal == null) {
    L.push('')
    L.push('_Faltan datos para el cuadro completo. Puedo leer el presupuesto/costos del Drive de esta obra si me lo pedís._')
  }
  return L.join('\n')
}

/** Desvíos económicos YA CALCULADOS de todas las obras, para alimentar la vigilancia
 *  autónoma con números concretos (no "andá a buscar el desvío"). Determinístico, 1 query.
 *  Marca: sobre-costo (costo real > presupuesto) y margen real por debajo del esperado.
 *  Devuelve [] si no hay desvío material o falta dato. En curso ⇒ desvío "a la fecha". */
export async function desviosObras({ margenGapMin = 0.03, sobreCostoMin = 0.05, soloCerradas = false } = {}) {
  const { rows } = await query(`
    select o.id, o.nombre, o.estado, o.monto_contratado,
      p.monto_presupuestado, p.margen_esperado,
      coalesce(p.costo_directo_presupuestado,0) + coalesce(p.costo_indirecto_presupuestado,0) as costo_presup,
      (select coalesce(sum(cr.monto),0) from public.costos_reales cr where cr.obra_id = o.id) as costo_real,
      (select count(*) from public.costos_reales cr where cr.obra_id = o.id) as n_costos
    from public.obras o
    left join lateral (
      select monto_presupuestado, margen_esperado, costo_directo_presupuestado, costo_indirecto_presupuestado
        from public.presupuestos where obra_id = o.id order by version desc nulls last, fecha_presupuesto desc nulls last limit 1
    ) p on true`)
  const alerts = []
  for (const r of rows) {
    if (!Number(r.n_costos)) continue // sin costo real cargado → nada que comparar aún
    const contratado = num(r.monto_contratado)
    const costoReal = num(r.costo_real)
    const costoPresup = num(r.costo_presup)
    const enCurso = !['cerrada', 'terminada', 'finalizada'].includes(String(r.estado || '').toLowerCase())
    if (soloCerradas && enCurso) continue // aprendizaje de Post Mortem: solo obras cerradas
    const flags = []
    if (costoPresup && costoReal != null) {
      const desvio = (costoReal - costoPresup) / costoPresup
      if (desvio > sobreCostoMin) flags.push(`sobre-costo ${pct(desvio)} (real ${ars(costoReal)} vs presup ${ars(costoPresup)})`)
    }
    if (contratado && costoReal != null && num(r.monto_presupuestado) && num(r.margen_esperado) != null) {
      const margenRealPct = (contratado - costoReal) / contratado
      const margenEspPct = num(r.margen_esperado) / num(r.monto_presupuestado)
      const gap = margenRealPct - margenEspPct
      if (!enCurso && gap < -margenGapMin) flags.push(`margen real ${pct(margenRealPct)} vs esperado ${pct(margenEspPct)} (${pct(gap)})`)
    }
    if (flags.length) alerts.push(`${r.nombre} (${r.estado}${enCurso ? ', en curso→parcial' : ''}): ${flags.join('; ')}`)
  }
  return alerts
}

/** APRENDIZAJE DE POST-MORTEM (0 API): los desvíos REALES y el cambio sugerido de cotización de
 *  las obras YA CERRADas, leídos de public.post_mortems. Distinto de desviosObras (que calcula
 *  desde costos_reales, hoy casi vacío): esto trae el aprendizaje RICO que ya se documentó al
 *  cerrar (ej. Galpones: HH +19%, costo +23%, "ajustar coeficientes de rendimiento Civil"). Es lo
 *  que hace que cada obra cerrada mejore la próxima cotización (interés compuesto de la misión). */
export async function aprendizajesPostMortem() {
  const { rows } = await query(
    `select coalesce(o.nombre,'obra') nombre, to_char(p.fecha_cierre,'DD/MM/YYYY') cierre,
            p.causas_desvio, p.cambios_sugeridos_cotizacion
       from public.post_mortems p left join public.obras o on o.id = p.obra_id
      where p.estado = 'cerrado' order by p.fecha_cierre desc nulls last limit 6`)
  return rows.map((r) => {
    const causa = String(r.causas_desvio || '').replace(/\s+/g, ' ').trim()
    const cambio = String(r.cambios_sugeridos_cotizacion || '').replace(/\s+/g, ' ').trim()
    const causaCorta = causa.slice(0, 190) // inicio de las causas (trae los % de desvío HH/costo)
    return `${r.nombre} (cerrada ${r.cierre}): ${causaCorta}${cambio ? ' → Cambio para cotizar: ' + cambio.slice(0, 240) : ''}`
  })
}

/** API principal: cuadro económico. Sin nombre → lista todas las obras con 1 línea c/u.
 *  Con nombre → cuadro completo de la que coincide (o desambigua si hay varias). */
export async function cuadroEconomico(nombre) {
  const obras = await findObras(nombre)
  if (!obras.length) {
    return nombre
      ? `No encontré ninguna obra que coincida con "${nombre}". Probá con parte del nombre, o pedime "lista de obras".`
      : 'No hay obras cargadas todavía.'
  }
  // Preferencia por match EXACTO: si el nombre coincide exacto con una obra, es esa
  // (aunque otras la contengan como substring, ej. "Pisos" vs "Cambio de Pisos - RRHH").
  const exacta = nombre ? obras.find((o) => o.nombre.trim().toLowerCase() === String(nombre).trim().toLowerCase()) : null
  if (exacta) return formatCuadro(await ensamblar(exacta))
  // Sin nombre (o match múltiple ambiguo y sin filtro) → resumen de todas.
  if (!nombre || obras.length > 1) {
    if (nombre && obras.length > 1) {
      // Varias coinciden con el filtro → desambiguar listando las candidatas.
      const nombres = obras.map((o) => `"${o.nombre}"`).join(', ')
      return `Hay varias obras que coinciden con "${nombre}": ${nombres}. ¿Cuál querés?`
    }
    const lines = ['**Cuadro económico — todas las obras**  _(cifras cargadas hoy; parcial donde falta dato)_', '']
    for (const o of obras) {
      const d = await ensamblar(o)
      const m = d.contratado != null && d.costoReal != null ? ` · margen ${d.enCurso ? 'parcial ' : ''}${ars(d.contratado - d.costoReal)}` : ' · margen sin dato'
      lines.push(`• **${o.nombre}** (${o.estado || '?'}): contratado ${ars(d.contratado)}${m}${d.presup ? '' : ' · sin presup.'}`)
    }
    lines.push('', 'Pedime el cuadro de una obra puntual (ej. "cómo va Galpones económicamente") para el detalle con desvíos.')
    return lines.join('\n')
  }
  return formatCuadro(await ensamblar(obras[0]))
}
