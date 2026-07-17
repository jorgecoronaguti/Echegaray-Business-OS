// Watcher determinístico de CAJA para la vigilancia autónoma (0 API). Detecta lo que
// el CLAUDE.md marca como palanca inmediata: cobranzas vencidas (ingreso proyectado con
// fecha pasada, sin marcarse real) y pagos vencidos/pendientes. Le da al Director los
// NÚMEROS concretos en vez de "revisá la caja". Fuente: public.movimientos_caja
// (estados 'proyectado'/'real'). No decide ni ejecuta: solo lee y resume.
import { query } from './db.mjs'

const ars = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n || 0))

/** Cobros y pagos vencidos (proyectados con fecha_esperada pasada). Devuelve [] si no hay. */
export async function alertasCaja({ maxItems = 4 } = {}) {
  const { rows } = await query(`
    select tipo,
           count(*)::int n,
           coalesce(sum(monto),0) as total,
           min(fecha_esperada) as mas_vieja
      from public.movimientos_caja
     where estado = 'proyectado' and fecha_esperada is not null and fecha_esperada < now()
     group by tipo`)
  if (!rows.length) return []
  const out = []
  for (const r of rows) {
    const dias = r.mas_vieja ? Math.floor((Date.now() - new Date(r.mas_vieja).getTime()) / 86400000) : null
    const label = r.tipo === 'cobro' ? 'COBRANZAS vencidas' : r.tipo === 'pago' ? 'PAGOS vencidos/pendientes' : `${r.tipo} vencidos`
    // Top ítems concretos de ese tipo (los de mayor monto).
    const { rows: items } = await query(
      `select monto, concepto, fecha_esperada from public.movimientos_caja
        where estado = 'proyectado' and fecha_esperada < now() and tipo = $1
        order by monto desc limit $2`,
      [r.tipo, maxItems],
    )
    const detalle = items
      .map((i) => `${ars(i.monto)} ${(i.concepto || '').slice(0, 40)} (venc. ${String(i.fecha_esperada).slice(0, 10)})`)
      .join('; ')
    out.push(`${label}: ${r.n} por ${ars(r.total)}${dias != null ? `, la más vieja hace ${dias} días` : ''} — ${detalle}`)
  }
  return out
}

// PRP-021 F1 — PRIORIZACIÓN de cobros y pagos vencidos por impacto en caja. Determinístico
// (0 API): score = monto × factor(días de atraso) × criticidad. Criticidad sube por
// palabras clave del CLAUDE.md (nómina/sueldos, ARCA/AFIP/fiscal, aceleración bancaria,
// echeq). Responde "qué cobrar/pagar primero y por qué" — NO ejecuta nada.
function criticidad(concepto) {
  const c = String(concepto || '').toLowerCase()
  const tags = []
  if (/n[oó]mina|sueldo|jornal|salario/.test(c)) tags.push('nómina')
  if (/arca|afip|iva|fiscal|dgr|impuest/.test(c)) tags.push('fiscal')
  if (/santander|banco|acelerac|pagar[eé]|ejecut|embargo/.test(c)) tags.push('banco')
  if (/echeq|cheque/.test(c)) tags.push('echeq')
  // multiplicador: fiscal/banco pesan más (riesgo de intereses/ejecución)
  const mult = 1 + (tags.includes('fiscal') ? 0.6 : 0) + (tags.includes('banco') ? 0.6 : 0) + (tags.includes('nómina') ? 0.4 : 0) + (tags.includes('echeq') ? 0.2 : 0)
  return { tags, mult }
}

/** Ranking de qué gestionar primero. tipo: 'cobro' | 'pago' | ambos (null). */
export async function priorizarCaja({ tipo = null, limit = 8 } = {}) {
  const { rows } = await query(
    `select tipo, monto, concepto, fecha_esperada,
            extract(day from (now() - fecha_esperada))::int as dias
       from public.movimientos_caja
      where estado = 'proyectado' and fecha_esperada is not null and fecha_esperada < now()
        ${tipo ? 'and tipo = $1' : ''}
      order by fecha_esperada asc`,
    tipo ? [tipo] : [],
  )
  const scored = rows.map((r) => {
    const dias = Math.max(1, Number(r.dias) || 1)
    const factorDias = 1 + Math.min(dias, 60) / 30 // hasta 3× a 60 días
    const { tags, mult } = criticidad(r.concepto)
    const score = Number(r.monto || 0) * factorDias * mult
    return { ...r, dias, tags, score }
  }).sort((a, b) => b.score - a.score).slice(0, limit)
  return scored
}

/** Respuesta lista para el chat: qué cobrar y qué pagar primero (0 API). */
export async function priorizarCajaResumen() {
  const [cobros, pagos] = await Promise.all([priorizarCaja({ tipo: 'cobro', limit: 5 }), priorizarCaja({ tipo: 'pago', limit: 5 })])
  if (!cobros.length && !pagos.length) return 'No hay cobros ni pagos vencidos para priorizar.'
  const linea = (r, i) =>
    `  ${i + 1}. ${ars(r.monto)} — ${(r.concepto || '').slice(0, 46)} (${r.dias}d de atraso${r.tags.length ? ', ' + r.tags.join('/') : ''})`
  const L = ['**Qué gestionar primero en caja**  _(prioridad = monto × atraso × criticidad; 0 API)_', '']
  if (cobros.length) { L.push('💰 **Cobrar primero** (acelera caja):'); cobros.forEach((r, i) => L.push(linea(r, i))) }
  if (pagos.length) { L.push('', '📤 **Pagar primero** (evita intereses/ejecución):'); pagos.forEach((r, i) => L.push(linea(r, i))) }
  L.push('', '_Es una recomendación de prioridad. Mover plata real es Nivel E: requiere tu aprobación._')
  return L.join('\n')
}

// PRP-021 F2 — PROYECCIÓN DE CAJA CORTA (0 API, criterio PERCIBIDO). Saldo actual estimado
// (saldo_inicial de las cuentas + neto de movimientos REALES) proyectado semana a semana con
// los cobros/pagos PROYECTADOS, marcando dónde la caja se pone negativa (gap). El saldo
// inicial es un GAP conocido (hay que confirmar el extracto real) → se declara ESTIMADO.
async function saldoActual() {
  // saldo_inicial = saldo REAL del ledger del Sheet a la fecha saldo_fecha (sincronizado por
  // sync-caja.mjs). Los movimientos reales con fecha <= saldo_fecha YA están en ese saldo → no se
  // recuentan (evita el doble conteo, ej. la nómina 30/06 ya reflejada en el saldo del 17/07). Si
  // saldo_fecha es null (sin sync), se comporta como antes (cuenta todos los reales). Ancla global
  // = la fecha de saldo más nueva entre las cuentas (todas se cargan del mismo snapshot del ledger).
  const { rows: a } = await query(`select coalesce(sum(saldo_inicial),0) s, max(saldo_fecha) anchor from public.cuentas_financieras`)
  const { rows: b } = await query(
    `select coalesce(sum(case when tipo='cobro' then monto when tipo='pago' then -monto else 0 end),0) s
       from public.movimientos_caja
      where estado='real' and ($1::date is null or coalesce(fecha_real, fecha_esperada) > $1::date)`,
    [a[0].anchor])
  return Number(a[0].s) + Number(b[0].s)
}

/** Proyección semanal: [{semana, cobros, pagos, neto, saldoProyectado, negativo}]. */
export async function proyeccionCaja({ semanas = 6 } = {}) {
  const saldo0 = await saldoActual()
  // Vencidos (fecha pasada, aún proyectados) + futuros, agrupados por semana ISO.
  const { rows } = await query(`
    select greatest(date_trunc('week', fecha_esperada), date_trunc('week', now()))::date as semana,
           coalesce(sum(case when tipo='cobro' then monto else 0 end),0) as cobros,
           coalesce(sum(case when tipo='pago'  then monto else 0 end),0) as pagos
      from public.movimientos_caja
     where estado='proyectado' and fecha_esperada is not null
       and fecha_esperada < now() + ($1 || ' weeks')::interval
     group by 1 order by 1`, [String(semanas)])
  let saldo = saldo0
  const out = []
  for (const r of rows) {
    const cobros = Number(r.cobros), pagos = Number(r.pagos), neto = cobros - pagos
    saldo += neto
    out.push({ semana: r.semana, cobros, pagos, neto, saldoProyectado: saldo, negativo: saldo < 0 })
  }
  return { saldo0, semanas: out }
}

/** Resumen para el chat (0 API): saldo hoy + proyección + primer gap. */
export async function proyeccionCajaResumen() {
  const { saldo0, semanas } = await proyeccionCaja()
  const L = ['**Proyección de caja (corto plazo)**  _(criterio percibido; 0 API)_', '']
  L.push(`Saldo actual: **${ars(saldo0)}**  _(saldo real del ledger del Sheet Flujo de Caja + movimientos reales posteriores)_`)
  if (!semanas.length) { L.push('', 'No hay cobros/pagos proyectados en el horizonte.'); return L.join('\n') }
  L.push('', 'Semana | Cobros | Pagos | Saldo proyectado')
  L.push('---|---|---|---')
  for (const s of semanas) {
    const fecha = new Date(s.semana).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    L.push(`${fecha} | ${ars(s.cobros)} | ${ars(s.pagos)} | ${s.negativo ? '⚠️ ' : ''}${ars(s.saldoProyectado)}`)
  }
  const gap = semanas.find((s) => s.negativo)
  L.push('')
  if (gap) L.push(`🔴 La caja queda **negativa** desde la semana del ${new Date(gap.semana).toLocaleDateString('es-AR')} (${ars(gap.saldoProyectado)}). Gestioná los cobros de esas semanas o corré pagos.`)
  else L.push('🟢 La caja se mantiene positiva en el horizonte proyectado (con estos cobros/pagos).')
  L.push('', '_Depende de que los cobros proyectados entren en fecha. Pedime "qué cobro primero" para accionar._')
  return L.join('\n')
}
