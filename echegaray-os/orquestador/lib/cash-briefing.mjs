// BRIEFING DE CAJA (mañanero) — determinístico sobre datos LIMPIOS del Cash Flow (0 razonamiento
// del modelo). Piso firme: cada número sale de una columna estructurada, verificable, barato y
// rápido, para correr solo cada mañana. NUNCA inventa. Complementa al briefingEjecutivo (DB) con
// la foto de CAJA real de la planilla: saldo hoy, cobranzas del mes, vencimientos de la semana.
export const CASHFLOW_ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function parseMonto(s) {
  const n = Number(String(s ?? '').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
/** "DD/MM/YYYY" o "DD/MM/YY" (es-AR) → Date, o null. */
export function parseFecha(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(s ?? '').trim())
  if (!m) return null
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const d = new Date(y, Number(m[2]) - 1, Number(m[1]))
  return Number.isNaN(d.getTime()) ? null : d
}
export const fmt = (n) => '$' + Math.round(n).toLocaleString('es-AR')

/** Lee SOLO columnas estructuradas del Cash Flow. `hoy` inyectable para test. */
export async function cashBriefing(google, hoy = new Date()) {
  const ID = CASHFLOW_ID
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const fin7 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 7)
  const dentro7 = (d) => d && d >= hoy0 && d <= fin7
  const mesActual = `${MESES[hoy.getMonth()]}-${String(hoy.getFullYear()).slice(2)}` // "jul-26"

  // 1) CAJA — último saldo por cuenta (ledger Fecha·Cuenta·Saldo)
  const caja = await google.readSheetValues(ID, 'Caja!A5:D200').catch(() => [])
  const saldos = new Map()
  for (const r of caja) {
    const cuenta = String(r?.[1] ?? '').trim()
    if (!cuenta || r?.[2] == null || String(r?.[2]).trim() === '') continue
    const f = parseFecha(r?.[0]); const prev = saldos.get(cuenta)
    if (!prev || (f && (!prev.f || f >= prev.f))) saldos.set(cuenta, { saldo: parseMonto(r?.[2]), f, fecha: String(r?.[0] ?? '').trim() })
  }
  const cajaTotal = [...saldos.values()].reduce((s, v) => s + v.saldo, 0)

  // 2) COBRANZAS del mes en curso (02_Cobranzas: R idx17 "Mes cobro", O idx14 Estado, M idx12 Total,
  //    G idx6 Obra/Cliente, Q idx16 "Fecha cobro" fecha real) + VENCIDAS (fecha de cobro ya pasó y
  //    sin cobrar = plata que debería estar y no está). "Vencida" NO interpreta la taxonomía de
  //    estados (Pendiente/Proyectado/Facturado…): solo "no Cobrado" + fecha de cobro < hoy. Honesto.
  const cob = await google.readSheetValues(ID, '02_Cobranzas!A5:R2000').catch(() => [])
  let cobrado = 0, porCobrar = 0, entra7 = 0
  const vencidas = []
  for (const r of cob) {
    const estado = String(r?.[14] ?? '').trim()
    const cobradoYa = /cobrado/i.test(estado)
    const monto = parseMonto(r?.[12])
    // cobranzas del mes en curso (por "Mes cobro (auto)")
    if (String(r?.[17] ?? '').trim().toLowerCase() === mesActual) {
      if (cobradoYa) cobrado += monto; else porCobrar += monto
    }
    // Por "Fecha cobro" real (idx16), sin cobrar: VENCIDA (pasada) o ENTRA esta semana (dentro 7d)
    if (!cobradoYa && monto > 0) {
      const fc = parseFecha(r?.[16])
      if (fc && fc < hoy0) vencidas.push({ cliente: String(r?.[6] ?? '').trim() || '(sin cliente)', estado, fecha: String(r?.[16]).trim(), monto, dias: Math.round((hoy0 - fc) / 86400000) })
      else if (dentro7(fc)) entra7 += monto
    }
  }
  vencidas.sort((a, z) => z.dias - a.dias)
  const totalVencido = vencidas.reduce((s, v) => s + v.monto, 0)

  // 3) VENCIMIENTOS próximos 7 días — Cheques (I idx8 fecha pago, F idx5 monto) +
  //    Tarjeta (H idx7 fecha pago, E idx4 monto, J idx9 DEBITADO)
  const chq = await google.readSheetValues(ID, 'Cheques!A2:J997').catch(() => [])
  const cheques = []
  for (const r of chq) { const f = parseFecha(r?.[8]); if (dentro7(f)) cheques.push({ proveedor: String(r?.[4] ?? '').trim(), monto: parseMonto(r?.[5]), fecha: String(r?.[8]).trim() }) }
  const tar = await google.readSheetValues(ID, 'Tarjeta de Credito!A3:J998').catch(() => [])
  const tarjeta = []
  for (const r of tar) { if (/^si$/i.test(String(r?.[9] ?? '').trim())) continue; const f = parseFecha(r?.[7]); if (dentro7(f)) tarjeta.push({ proveedor: String(r?.[2] ?? '').trim(), monto: parseMonto(r?.[4]), fecha: String(r?.[7]).trim() }) }
  const totalVenc = [...cheques, ...tarjeta].reduce((s, v) => s + v.monto, 0)

  return {
    fecha: hoy.toLocaleDateString('es-AR'),
    caja: { total: cajaTotal, cuentas: [...saldos.entries()].map(([cuenta, v]) => ({ cuenta, saldo: v.saldo, al: v.fecha })) },
    cobranzas_mes: { mes: mesActual, cobrado, por_cobrar: porCobrar },
    cobranzas_vencidas: { total: totalVencido, items: vencidas },
    vencimientos_7dias: { total: totalVenc, cheques, tarjeta },
    // PROYECCIÓN de caja a 7 días (ESTIMADA, no hecho): caja hoy + lo que tiene fecha de cobro esta
    // semana (sin cobrar) − lo que hay que pagar esta semana. Asume que se cobra lo prometido; NO
    // incluye lo vencido (fecha ya fallada = incierto). Responde "¿cierro la semana en positivo?".
    proyeccion_7dias: { caja_hoy: cajaTotal, entra: entra7, sale: totalVenc, proyectado: cajaTotal + entra7 - totalVenc },
  }
}

/** Texto listo para mostrar (markdown breve). */
export function formatBriefing(b) {
  const L = [`☀️ **Briefing de caja — ${b.fecha}** _(dato real, 0 API)_`, '']
  L.push('💵 **Caja hoy**')
  for (const c of b.caja.cuentas) L.push(`  • ${c.cuenta}: ${fmt(c.saldo)} _(al ${c.al})_`)
  if (b.caja.cuentas.length > 1) L.push(`  • **Total: ${fmt(b.caja.total)}**`)
  L.push('', `📥 **Cobranzas ${b.cobranzas_mes.mes}**: cobrado ${fmt(b.cobranzas_mes.cobrado)} · por cobrar ${fmt(b.cobranzas_mes.por_cobrar)}`)
  const venc = b.cobranzas_vencidas
  if (venc && venc.items.length) {
    L.push('', `🔴 **Cobranzas VENCIDAS: ${fmt(venc.total)}** _(fecha de cobro ya pasó, sin cobrar — llamar hoy)_`)
    for (const v of venc.items.slice(0, 8)) L.push(`  • ${v.cliente}: ${fmt(v.monto)} _(vencía ${v.fecha}, hace ${v.dias}d, ${v.estado})_`)
    if (venc.items.length > 8) L.push(`  • …y ${venc.items.length - 8} más`)
  }
  L.push('', `📤 **A pagar en 7 días: ${fmt(b.vencimientos_7dias.total)}**`)
  const items = [...b.vencimientos_7dias.cheques.map((c) => ({ ...c, t: 'cheque' })), ...b.vencimientos_7dias.tarjeta.map((c) => ({ ...c, t: 'tarjeta' }))]
    .sort((a, z) => (parseFecha(a.fecha) || 0) - (parseFecha(z.fecha) || 0))
  for (const it of items.slice(0, 12)) L.push(`  • ${it.fecha} · ${it.proveedor}: ${fmt(it.monto)} _(${it.t})_`)
  if (items.length > 12) L.push(`  • …y ${items.length - 12} más`)
  if (!items.length) L.push('  • Nada por vencer esta semana.')
  const p = b.proyeccion_7dias
  if (p) {
    const signo = p.proyectado < 0 ? '⚠️ ' : ''
    L.push('', `🔮 **Proyección caja 7 días (estimada): ${signo}${fmt(p.proyectado)}**`)
    L.push(`  _caja ${fmt(p.caja_hoy)} + entra ${fmt(p.entra)} − paga ${fmt(p.sale)} · asume que se cobra lo de esta semana; no cuenta lo vencido_`)
  }
  return L.join('\n')
}
