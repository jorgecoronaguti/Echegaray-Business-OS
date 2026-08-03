// SOLO LECTURA — verifica los números del dueño contra el Sheet real. Se borra al terminar.
import { makeGoogleClient, WORKSPACE_SCOPES } from './orquestador/lib/google.mjs'
import { loadConfig } from './orquestador/lib/config.mjs'
import { cashBriefing, CASHFLOW_ID, parseMonto, parseFecha } from './orquestador/lib/cash-briefing.mjs'

const fmt = (n) => '$' + Math.round(n).toLocaleString('es-AR')
const google = makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES })
const hoy = new Date('2026-08-03T12:00:00')
const hoy0 = new Date(2026, 7, 3)
const d30 = new Date(2026, 7, 3 + 30)
const d90 = new Date(2026, 7, 3 + 90)

const b = await cashBriefing(google, hoy)
console.log('=== CAJA (cuentas) ===')
for (const c of b.caja.cuentas) console.log(`  ${c.cuenta.padEnd(45)} ${fmt(c.saldo).padStart(18)}  al ${c.al}`)
console.log('  TOTAL DISPONIBILIDADES:', fmt(b.caja.total))

// COBRANZAS
const cob = await google.readSheetValues(CASHFLOW_ID, 'Cobranzas!A5:R2000')
let venc = 0, e30 = 0, e3190 = 0, sinFecha = 0, mas90 = 0
const clientes30 = []
for (const r of cob) {
  if (/cobrado/i.test(String(r?.[14] ?? ''))) continue
  const m = parseMonto(r?.[12]); if (!(m > 0)) continue
  const f = parseFecha(r?.[16])
  if (!f) { sinFecha += m; continue }
  if (f < hoy0) venc += m
  else if (f <= d30) { e30 += m; clientes30.push([String(r?.[6] ?? '').trim(), m, String(r?.[16]).trim()]) }
  else if (f <= d90) e3190 += m
  else mas90 += m
}
console.log('\n=== COBRANZAS (sin cobrar, por fecha de cobro col Q) ===')
console.log('  VENCIDAS      :', fmt(venc))
console.log('  <=30 dias     :', fmt(e30))
console.log('  31-90 dias    :', fmt(e3190))
console.log('  >90 dias      :', fmt(mas90))
console.log('  sin fecha     :', fmt(sinFecha))

// CHEQUES EMITIDOS no debitados
const chq = await google.readSheetValues(CASHFLOW_ID, 'Cheques Emitidos!A1:L997')
let chTot = 0, ch30 = 0, chVenc = 0, ch3190 = 0, chMas90 = 0, chSinFecha = 0
for (const r of chq) {
  if (!/^(fisico|echeq)$/i.test(String(r?.[0] ?? '').trim())) continue
  if (/^si$/i.test(String(r?.[10] ?? '').trim())) continue
  const m = parseMonto(r?.[5]); if (!(m > 0)) continue
  chTot += m
  const f = parseFecha(r?.[8])
  if (!f) { chSinFecha += m; continue }
  if (f < hoy0) chVenc += m
  else if (f <= d30) ch30 += m
  else if (f <= d90) ch3190 += m
  else chMas90 += m
}
console.log('\n=== CHEQUES EMITIDOS sin debitar ===')
console.log('  TOTAL         :', fmt(chTot))
console.log('  ya vencidos   :', fmt(chVenc))
console.log('  <=30 dias     :', fmt(ch30))
console.log('  31-90 dias    :', fmt(ch3190))
console.log('  >90 dias      :', fmt(chMas90))
console.log('  sin fecha     :', fmt(chSinFecha))
console.log('  vencidos+<=30 :', fmt(chVenc + ch30))

// MODELO LIQUIDEZ
const { modeloLiquidez } = await import('./orquestador/lib/ingenieria-financiera.mjs')
const { leerFlujoDeFondos, vencidoComercialDe } = await import('./orquestador/lib/tesoreria/lectura-flujo.mjs')
const flujo = await leerFlujoDeFondos({ google }, { hoy, dias: 90 })
console.log('\n=== FLUJO ===', flujo.estado, flujo.movimientos?.length, 'movs')
const vc = vencidoComercialDe(flujo)
console.log('  vencido comercial:', vc ? fmt(vc.monto) + ` (${vc.n})` : 'null')
const mod = await modeloLiquidez({ google }, hoy, { vencidoComercial: vc })
console.log('  caja_hoy:', fmt(mod.disponible?.caja_hoy ?? 0), 'estado', mod.disponible?.estado)
console.log('  comprometido:', JSON.stringify(mod.comprometido))
console.log('  deuda_comercial:', JSON.stringify(mod.deuda_comercial))

// POLITICAS
try {
  const { query } = await import('./orquestador/lib/db.mjs')
  const { politicaVigente, filaCajaRestringida } = await import('./orquestador/lib/tesoreria/ledger.mjs')
  console.log('\n=== POLITICAS ===')
  console.log('  reserva:', JSON.stringify(await politicaVigente(query, 'reserva_minima').catch((e) => String(e.message))))
  console.log('  restringida:', JSON.stringify(await filaCajaRestringida(query).catch((e) => String(e.message))))
  await (await import('./orquestador/lib/db.mjs')).closePool()
} catch (e) { console.log('  sin base:', e.message) }
