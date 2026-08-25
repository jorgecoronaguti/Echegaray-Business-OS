// ENSAYO EN FRÍO de las 9 migraciones de 28–32. NO APLICA NADA: abre una transacción, corre la
// cadena entera en orden, simula el sync con su regla real, consulta la vista, y hace ROLLBACK
// pase lo que pase. Es la evidencia de que la cadena CORRE y de que la vista CALCULA — no de que
// las migraciones estén aplicadas, que es otra cosa y la decide el dueño.
//
//   node orquestador/scripts/ensayo-frio-28-32.mjs
//
// Se puede volver a correr cuantas veces haga falta: no deja nada. Y se corre ANTES de aplicar,
// porque una migración que falla a la mitad deja la base en un estado que nadie planeó.
//
// `lock_timeout` corto a propósito: `alter table public.cobranzas add column` toma un ACCESS
// EXCLUSIVE, y esta base tiene un timer horario escribiendo esa tabla. Antes que esperar a que se
// libere —bloqueando al sync— el ensayo prefiere fallar y decirlo.
import { query, closePool } from '../lib/db.mjs'
import { readFileSync, readdirSync } from 'node:fs'
import { resolverCliente } from '../lib/portal/cobranzas-a-cliente.mjs'

const DIR = new URL('../../supabase/migrations', import.meta.url).pathname
const LAS_NUEVE = readdirSync(DIR)
  .filter((f) => /^20260825T12(00_el_cliente|10_cliente|20_cliente|30_cert|40_esq|50_cobranza|60_pago|70_mail|80_cliente)/.test(f))
  .sort()

let fallo = null
console.log(`ensayo en frío de ${LAS_NUEVE.length} migraciones\n`)

await query('begin')
try {
  await query("set local lock_timeout = '4s'")
  await query("set local statement_timeout = '60s'")
  for (const f of LAS_NUEVE) {
    const t0 = Date.now()
    await query(readFileSync(`${DIR}/${f}`, 'utf8'))
    console.log(`  OK  ${f}  (${Date.now() - t0} ms)`)
  }

  console.log('\n— la vista, dentro de la misma transacción —')
  const cols = await query(
    `select column_name, data_type from information_schema.columns
      where table_name = 'cliente_cuenta_corriente' order by ordinal_position`)
  console.log(`  cliente_cuenta_corriente publica ${cols.rows.length} columnas: `
    + cols.rows.map((c) => c.column_name).join(', '))

  const filas = await query('select count(*)::int as n from public.cliente_cuenta_corriente')
  console.log(`  filas que devuelve TAL CUAL, sin correr el sync: ${filas.rows[0].n}`)
  console.log('  (la vista sale de cobranzas.cliente_id, que lo llena sync-esquema-cliente.mjs)')

  // ── SE SIMULA EL SYNC, DENTRO DE LA MISMA TRANSACCIÓN QUE SE VA A DESHACER ─────────────────
  // Con la regla REAL (`resolverCliente` del propio módulo del sync) sobre las filas reales. Sin
  // esto, el ensayo sólo probaría que el SQL parsea; con esto prueba que la vista calcula.
  const { rows: indice } = await query(
    `select a.alias, o.cliente_id from public.obra_alias a
       join public.obra_canonica o on o.id = a.obra_id where o.cliente_id is not null`)
  const { rows: cobranzas } = await query(
    `select sheet_id, obra_cliente from public.cobranzas where origen = 'cobranzas_sheet'`)
  let resueltas = 0
  const motivos = {}
  for (const c of cobranzas) {
    const { cliente_id, motivo } = resolverCliente(c.obra_cliente, indice)
    motivos[motivo] = (motivos[motivo] ?? 0) + 1
    if (!cliente_id) continue
    await query('update public.cobranzas set cliente_id = $1 where sheet_id = $2', [cliente_id, c.sheet_id])
    resueltas += 1
  }
  console.log(`\n— simulando el sync: ${indice.length} alias · ${cobranzas.length} filas —`)
  console.log(`  resueltas a un cliente: ${resueltas} · ${JSON.stringify(motivos)}`)

  const muestra = await query(
    `select nombre_comercial, saldo, vencido, por_vencer, comprobantes_pendientes,
            aging_por_vencer, aging_1_30, aging_31_60, aging_61_90, aging_mas_90,
            dso, efectividad_pct, dias_cobro_promedio, fondo_reparo
       from public.cliente_cuenta_corriente order by saldo desc nulls last limit 5`)
  console.table(muestra.rows)

  const suma = await query(
    `select coalesce(sum(saldo),0)::numeric as saldo,
            coalesce(sum(aging_por_vencer + aging_1_30 + aging_31_60 + aging_61_90 + aging_mas_90),0)::numeric as aging
       from public.cliente_cuenta_corriente`)
  const { saldo, aging } = suma.rows[0]
  console.log(`\n  CONTROL: suma de saldos = ${saldo} · suma de las 5 bandas = ${aging}`)
  console.log(`  ${Number(saldo) === Number(aging) ? 'CIERRAN' : 'NO CIERRAN — el aging no explica el saldo'}`)

  const sinCliente = await query(
    `select count(*)::int as n, coalesce(sum(total_bruto),0)::numeric as plata from public.cobranzas
      where cliente_id is null and total_bruto is not null and estado <> 'CANCELAR'`)
  console.log(`  filas sin cliente resoluble (quedan FUERA de la vista): ${sinCliente.rows[0].n}`
    + ` · $${Number(sinCliente.rows[0].plata).toLocaleString('es-AR')}`)
} catch (e) {
  fallo = e
} finally {
  await query('rollback')
  console.log('\nROLLBACK hecho: la base quedó como estaba.')
}

if (fallo) { console.error('\nFALLÓ:', fallo.message); await closePool(); process.exit(1) }
await closePool()
