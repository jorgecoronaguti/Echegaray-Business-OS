#!/usr/bin/env node
// SYNC de SALDOS de caja: Sheet "Flujo de Caja - Cash Flow" → public.cuentas_financieras.
// El Sheet es la FUENTE DE VERDAD (arquitectura-integracion-finanzas-obras); Supabase es el ESPEJO
// que la web lee. Problema que resuelve: Supabase mostraba la caja en −$3,18M (saldo seed viejo
// $6,21M + una nómina real −$9,39M sumada sobre un saldo que YA la reflejaba = doble conteo)
// cuando la caja real del ledger es +$17,69M. Esto rompía la confianza y bloqueaba usar la web.
//
// Qué hace (seguro, reversible, NO destructivo):
//   - Lee el ledger de saldos (pestaña Caja) → saldo real por cuenta + fecha del ledger.
//   - Setea cuentas_financieras.saldo_inicial = saldo REAL del ledger (valor con origen, NO calculado)
//     y saldo_fecha = fecha del ledger. La posición de caja (caja-alertas.saldoActual) NO re-suma los
//     movimientos reales con fecha <= saldo_fecha (ya están en ese saldo) → sin doble conteo, sin
//     número mágico y sin borrar filas (los reales están referenciados por obligaciones).
//   - Cuentas que NO están en el ledger → saldo_inicial 0, saldo_fecha null (no se borran).
//   - NO toca movimientos_caja (16 proyectado están referenciados por obligaciones; su refresh
//     necesita un upsert FK-safe y es un follow-up aparte — ver memoria).
//
// Uso:  node orquestador/scripts/sync-caja.mjs            (DRY-RUN: lee, respalda, imprime el plan)
//       node orquestador/scripts/sync-caja.mjs --apply    (ejecuta)
import { writeFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { CASHFLOW_ID, parseMonto, parseFecha } from '../lib/cash-briefing.mjs'

const APPLY = process.argv.includes('--apply')
const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null)
const money = (n) => '$' + Math.round(n).toLocaleString('es-AR')
const tipoCuenta = (nombre) => /banco|santander|galicia|naci[oó]n|cuenta|cta/i.test(nombre) ? 'banco' : 'caja'

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // 1) LEDGER → saldo real por cuenta (último por fecha) + fecha ancla (máx fecha del ledger).
  const caja = await google.readSheetValues(CASHFLOW_ID, 'Caja!A5:D200').catch(() => [])
  const cuentas = new Map() // nombre -> { saldo, f }
  let fechaAncla = null
  for (const r of caja) {
    const nombre = String(r?.[1] ?? '').trim()
    if (!nombre || r?.[2] == null || String(r?.[2]).trim() === '') continue
    const f = parseFecha(r?.[0]); const prev = cuentas.get(nombre)
    if (!prev || (f && (!prev.f || f >= prev.f))) cuentas.set(nombre, { saldo: parseMonto(r?.[2]), f })
    if (f && (!fechaAncla || f > fechaAncla)) fechaAncla = f
  }
  if (!cuentas.size) { console.error('el ledger (pestaña Caja) no tiene saldos legibles — abortando'); await closePool(); process.exit(1) }
  const ancla0 = fechaAncla ? new Date(fechaAncla.getFullYear(), fechaAncla.getMonth(), fechaAncla.getDate()) : new Date()
  const saldoReal = [...cuentas.values()].reduce((s, c) => s + c.saldo, 0)

  // 2) neto de movimientos 'real' PRE-ancla (informativo: es lo que la fecha del ledger ya absorbe;
  //    con saldo_fecha, la fórmula deja de sumarlos, así que NO se toca el saldo_inicial por esto).
  const { rows: pra } = await query(
    "select coalesce(sum(case when tipo='cobro' then monto when tipo='pago' then -monto else 0 end),0)::float neto from public.movimientos_caja where estado='real' and coalesce(fecha_real,fecha_esperada) <= $1",
    [iso(ancla0)])
  const preAnchorRealNet = Number(pra[0].neto)

  // 3) BACKUP (rollback) antes de tocar nada.
  const { rows: bkCta } = await query('select * from public.cuentas_financieras')
  const bkPath = `orquestador/scripts/.caja-backup-${Date.now()}.json`
  writeFileSync(bkPath, JSON.stringify({ cuentas_financieras: bkCta }, null, 2))

  console.log(`fecha ledger (saldo_fecha): ${iso(ancla0)}`)
  console.log(`cuentas del ledger (${cuentas.size}): ${[...cuentas.entries()].map(([n, c]) => `${n}=${money(c.saldo)}`).join(' · ')}`)
  console.log(`saldo real total: ${money(saldoReal)}`)
  console.log(`neto real pre-ancla (ya en el saldo; la fórmula deja de sumarlo vía saldo_fecha): ${money(preAnchorRealNet)}`)
  console.log(`cuentas actuales en Supabase: ${bkCta.map((c) => `${c.nombre}=${money(Number(c.saldo_inicial))}`).join(' · ')}`)
  console.log(`backup: ${bkPath}`)

  if (!APPLY) { console.log('\n[DRY-RUN] no se tocó la DB. Corré con --apply para ejecutar.'); await closePool(); return }

  // 4) APLICAR (transacción). saldo_inicial = saldo REAL del ledger (no calculado) + saldo_fecha.
  await query('begin')
  try {
    for (const [nombre, c] of cuentas) {
      const ex = await query('select id from public.cuentas_financieras where lower(nombre)=lower($1) limit 1', [nombre])
      if (ex.rows[0]) await query('update public.cuentas_financieras set saldo_inicial=$1, saldo_fecha=$2, tipo=$3, actualizado_en=now() where id=$4', [c.saldo, iso(ancla0), tipoCuenta(nombre), ex.rows[0].id])
      else await query('insert into public.cuentas_financieras (nombre, tipo, saldo_inicial, saldo_fecha) values ($1,$2,$3,$4)', [nombre, tipoCuenta(nombre), c.saldo, iso(ancla0)])
    }
    const low = [...cuentas.keys()].map((n) => n.toLowerCase())
    await query('update public.cuentas_financieras set saldo_inicial=0, saldo_fecha=null, actualizado_en=now() where lower(nombre) <> all($1)', [low])
    await query('commit')
  } catch (e) { await query('rollback'); console.error('sync falló, ROLLBACK:', e.message); process.exit(1) }

  // 5) marca de integración + verificación (saldoActual de caja-alertas debe = saldo real).
  await query(
    `insert into public.integraciones (slug, nombre, estado, salud, ultimo_sync, notas)
     values ('flujo_caja_sheet','Flujo de Caja - Cash Flow','en_curso','ok',now(),$1)
     on conflict (slug) do update set estado='en_curso', salud='ok', ultimo_sync=now(), notas=excluded.notas`,
    [`Saldos de caja espejados del Sheet. Saldo real ${money(saldoReal)} al ${iso(ancla0)}. Movimientos proyectado: refresh FK-safe pendiente.`],
  ).catch((e) => console.log('(nota: no pude marcar integraciones:', e.message + ')'))
  const { rows: chk } = await query(
    `select (select coalesce(sum(saldo_inicial),0) from public.cuentas_financieras)
          + coalesce(sum(case when tipo='cobro' then monto when tipo='pago' then -monto else 0 end),0) s
       from public.movimientos_caja
      where estado='real' and ($1::date is null or coalesce(fecha_real, fecha_esperada) > $1::date)`,
    [iso(ancla0)])
  const saldoActual = Math.round(Number(chk[0].s))
  console.log(`\n[APPLY] cuentas actualizadas. saldoActual tras sync: ${money(saldoActual)} (esperado ${money(saldoReal)}) → ${saldoActual === Math.round(saldoReal) ? 'OK ✓' : 'DISCREPANCIA ✗'}`)
  await closePool()
}
main().catch((e) => { console.error('sync falló:', e.message); process.exit(1) })
