#!/usr/bin/env node
// ANTES / DESPUÉS DE LA FICHA COMO LA VE DIRECCIÓN, SIN DDL. Sólo lectura, de a una consulta.
//
// «Antes» es `pantalla_cliente_en_vivo(slug, 'obras')` VIVA, llamada con la sesión de un usuario de
// Dirección real (rol `authenticated` + claims), o sea con la RLS y las guardas que ve la pantalla.
// «Después» es el cuerpo de las funciones de 20260913T1550 corrido en la MISMA sesión, con la tabla
// `compra_obra_asignada` reemplazada por la asignación que calcula la regla del sync. La IDENTIDAD
// se controla contra Compras del cliente por la columna J, sin pasar por la asignación.
//
//   node orquestador/scripts/verificar-costo-a-la-fecha-como-direccion.mjs --uid <perfil de Dirección>

import { readFileSync } from 'node:fs'
import { query, withTx, closePool } from '../lib/db.mjs'
import { asignadorDeCompras, catalogosDeAsignacion, planDeAsignacion } from '../lib/compras-obra-asignada.mjs'
import { normAlias } from '../lib/jornales-a-registros-hh.mjs'

const i = process.argv.indexOf('--uid')
const UID = i > 0 ? process.argv[i + 1] : null
if (!UID || !/^[0-9a-f-]{36}$/.test(UID)) throw new Error('--uid <uuid del perfil de Dirección> es obligatorio')
const SLUGS = ['san-francisco', 'messina', 'la-estrella', 'quattropani', 'arcor']
const MIGRACION = new URL('../../supabase/migrations/20260913T1550_compra_obra_asignada_y_costo_a_la_fecha.sql', import.meta.url)
const TABLA = '(select * from jsonb_to_recordset($2::jsonb) as z(referencia text, cliente text, obra_id text, via text, porque text))'
const $ = (n) => (n == null ? '—' : Math.round(Number(n)).toLocaleString('es-AR'))
const num = (x) => Number(x ?? 0)

function cuerpo(sql, nombre) {
  const desde = sql.indexOf(`function public.${nombre}(`)
  const a = sql.indexOf('$function$', desde) + '$function$'.length
  return sql.slice(a, sql.indexOf('$function$', a))
}

async function main() {
  const sql = readFileSync(MIGRACION, 'utf8')
  const catalogos = await catalogosDeAsignacion(query)
  const { rows: compras } = await query('select fila, sheet_id, obra_texto, detalle_obra, total, importe, estado, anulada from public.compra_sheet')
  const plan = JSON.stringify(planDeAsignacion(compras, asignadorDeCompras(catalogos)))
  const costoSql = cuerpo(sql, 'costo_de_obras_a_la_fecha').replaceAll('public.compra_obra_asignada', TABLA).replaceAll('p_obras', '$1::text[]')
  const sinObraSql = cuerpo(sql, 'compras_sin_obra_de_clientes').replaceAll('public.compra_obra_asignada', TABLA).replaceAll('p_clientes', '$1::uuid[]')

  let rojo = false
  await withTx(async (db) => {
    await db.query('set local role authenticated')
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: UID, role: 'authenticated' })])
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [UID])
    const { rows: [yo] } = await db.query('select public.current_rol() rol, public.es_administracion() admin')
    console.log(`sesión: rol ${yo.rol} · es_administracion ${yo.admin}`)

    for (const slug of SLUGS) {
      const { rows: [{ f }] } = await db.query("select public.pantalla_cliente_en_vivo($1, 'obras') f", [slug])
      if (!f?.cliente) { console.log(`\n## ${slug}: la ficha no devolvió cliente`); rojo = true; continue }
      const obras = f.obras ?? []
      const antes = new Map((f.costo_obra ?? []).map((r) => [r.obra_id, r]))
      const { rows: [{ j: dRows }] } = await db.query(`select (${costoSql}) j`, [obras.map((o) => o.obra_id), plan])
      const despues = new Map((dRows ?? []).map((r) => [r.obra_id, r]))
      const clienteId = f.cliente.cliente_id
      const { rows: [{ j: sRows }] } = await db.query(`select (${sinObraSql}) j`, [[clienteId], plan])
      const sinObra = (sRows ?? [])[0] ?? null

      console.log(`\n## ${f.cliente.nombre_comercial} (${slug})${f.costo_obra == null ? ' — costo_obra null: la sesión no ve costos' : ''}`)
      console.log(`  ${'obra'.padEnd(40)} ${'mat. antes'.padStart(13)} ${'mat. después'.padStart(13)} ${'MO antes'.padStart(12)} ${'MO después'.padStart(12)}`)
      let suma = 0
      for (const o of obras) {
        const a = antes.get(o.obra_id); const d = despues.get(o.obra_id)
        suma += num(d?.materiales) + num(d?.subcontratos)
        console.log(`  ${String(o.nombre).slice(0, 40).padEnd(40)} ${$(a?.materiales).padStart(13)} ${$(d?.materiales).padStart(13)} ${$(a?.mano_obra).padStart(12)} ${$(d?.mano_obra).padStart(12)}`)
      }
      suma += num(sinObra?.materiales) + num(sinObra?.subcontratos)
      console.log(`  ${'Gastos del cliente sin obra asignada'.padEnd(40)} ${'—'.padStart(13)} ${$(sinObra?.materiales).padStart(13)}`)

      // LA CUENTA INDEPENDIENTE: Compras del cliente por la columna J, sin la asignación.
      const { rows: jRows } = await db.query(`
        select c.obra_texto, sum(c.total) total
          from public.costos_obra c
          left join public.compra_sheet s on c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
         where c.origen = 'compras_sheet' and not coalesce(c.fecha > current_date, false)
           and c.area is distinct from 'personas' and c.area is distinct from 'contabilidad_legales'
           and c.area is distinct from 'administracion_finanzas'
           and coalesce(s.anulada, false) = false and upper(trim(coalesce(s.estado, ''))) <> 'ELIMINADO'
         group by 1`)
      const canon = catalogos.clienteAlias.get(normAlias(slug.replaceAll('-', ' ')))
      const totalJ = jRows.filter((r) => catalogos.clienteAlias.get(normAlias(r.obra_texto)) === canon)
        .reduce((s, r) => s + num(r.total), 0)
      const ok = Math.abs(suma - totalJ) < 0.005
      rojo ||= !ok
      console.log(`  IDENTIDAD obras + sin obra = ${suma.toFixed(2)} · Compras del cliente (J) = ${totalJ.toFixed(2)} → ${ok ? 'OK' : 'ROJO'}`)
    }
    // NADA SE ESCRIBE: la transacción se descarta aunque no haya escrito nada.
    throw Object.assign(new Error('rollback'), { esRollback: true })
  }).catch((e) => { if (!e.esRollback) throw e })
  await closePool()
  if (rojo) process.exit(1)
}
main().catch(async (e) => { console.error('verificación falló:', e.message); await closePool().catch(() => {}); process.exit(1) })
