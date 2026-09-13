#!/usr/bin/env node
// ANTES / DESPUÉS DEL COSTO A LA FECHA POR OBRA, SIN DDL. Sólo lectura.
//
// «Después» corre el CUERPO de las funciones de 20260913T1550 con la tabla `compra_obra_asignada`
// reemplazada por la asignación calculada en memoria con la MISMA regla que escribe el sync. «Antes»
// es el puente viejo (`obra_alias` contra la columna J). La IDENTIDAD se controla contra una consulta
// que NO pasa por la asignación: las filas de Compras cuyo cliente (columna J → `cliente_alias`) es el
// cliente, con los mismos filtros de fila. Un control no se valida contra lo que produce.
//
//   node orquestador/scripts/verificar-costo-a-la-fecha.mjs

import { readFileSync } from 'node:fs'
import { query, closePool } from '../lib/db.mjs'
import { asignadorDeCompras, catalogosDeAsignacion, planDeAsignacion } from '../lib/compras-obra-asignada.mjs'
import { normAlias } from '../lib/jornales-a-registros-hh.mjs'

const MIGRACION = new URL('../../supabase/migrations/20260913T1550_compra_obra_asignada_y_costo_a_la_fecha.sql', import.meta.url)
const CLIENTES = ['SAN FRANCISCO', 'MESSINA', 'LA ESTRELLA', 'QUATTROPANI', 'ARCOR']
const TABLA = '(select * from jsonb_to_recordset($2::jsonb) as z(referencia text, cliente text, obra_id text, via text, porque text))'
const $ = (n) => (n == null ? '—' : Math.round(Number(n)).toLocaleString('es-AR'))

/** El cuerpo `$function$ … $function$` de una función de la migración. */
function cuerpo(sql, nombre) {
  const desde = sql.indexOf(`function public.${nombre}(`)
  const a = sql.indexOf('$function$', desde) + '$function$'.length
  return sql.slice(a, sql.indexOf('$function$', a))
}

const FILTROS_DE_FILA = `c.origen = 'compras_sheet'
  and c.area is distinct from 'personas' and c.area is distinct from 'contabilidad_legales'
  and c.area is distinct from 'administracion_finanzas'
  and coalesce(s.anulada, false) = false and upper(trim(coalesce(s.estado, ''))) <> 'ELIMINADO'`

async function main() {
  const sql = readFileSync(MIGRACION, 'utf8')
  const catalogos = await catalogosDeAsignacion(query)
  const { rows: compras } = await query('select fila, sheet_id, obra_texto, detalle_obra, total, importe, estado, anulada from public.compra_sheet')
  const plan = planDeAsignacion(compras, asignadorDeCompras(catalogos))
  const clienteDeObra = (o) => catalogos.clienteAlias.get(normAlias(o.cliente_texto))
  const obras = catalogos.canonicas.filter((o) => !o.fusionada_en && CLIENTES.includes(clienteDeObra(o)))
  const ids = obras.map((o) => o.id)

  const despues = cuerpo(sql, 'costo_de_obras_a_la_fecha').replaceAll('public.compra_obra_asignada', TABLA).replaceAll('p_obras', '$1::text[]')
  const { rows: [{ j: dRows }] } = await query(`select (${despues}) j`, [ids, JSON.stringify(plan)])
  const antesSql = despues.replace('and r.fecha <= current_date', '')
  // EL PUENTE VIEJO: J contra obra_alias, sin fecha de corte.
  const { rows: antesMat } = await query(`
    select a.obra_id, sum(c.total) filter (where coalesce(s.familia_material,'') <> 'Subcontratos y mano de obra') materiales
      from public.costos_obra c
      join public.obra_alias a on a.alias = public.norm_obra(c.obra_texto) and a.clasificacion in ('obra','mantenimiento')
      left join public.compra_sheet s on c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
     where ${FILTROS_DE_FILA} group by a.obra_id`)
  // De esta corrida se lee SÓLO `mano_obra`: es la regla de 20260913T1400 sin el corte de fecha.
  const { rows: [{ j: aRows }] } = await query(`select (${antesSql}) j`, [ids, JSON.stringify(plan)])
  const d = new Map((dRows ?? []).map((r) => [r.obra_id, r]))
  const aMo = new Map((aRows ?? []).map((r) => [r.obra_id, r.mano_obra]))
  const aMat = new Map(antesMat.map((r) => [r.obra_id, r.materiales]))

  const { rows: panel } = await query('select c.cliente_id, ca.cliente_canonico from public.cliente_alias ca join public.cliente_panel c on c.slug = ca.rotulo where ca.fuente = $1', ['OS'])
  const idDe = new Map(panel.map((r) => [r.cliente_canonico, r.cliente_id]))
  const sinObraSql = cuerpo(sql, 'compras_sin_obra_de_clientes').replaceAll('public.compra_obra_asignada', TABLA).replaceAll('p_clientes', '$1::uuid[]')
  const { rows: [{ j: sRows }] } = await query(`select (${sinObraSql}) j`, [CLIENTES.map((c) => idDe.get(c)).filter(Boolean), JSON.stringify(plan)])
  const sinObra = new Map((sRows ?? []).map((r) => [r.cliente_id, r]))

  // LA CUENTA INDEPENDIENTE: Compras del cliente por la columna J, sin tocar la asignación.
  const { rows: jRows } = await query(`
    select c.obra_texto, sum(c.total) filter (where not coalesce(c.fecha > current_date, false)) total
      from public.costos_obra c left join public.compra_sheet s on c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
     where ${FILTROS_DE_FILA} group by 1`)
  const totalJ = new Map()
  for (const r of jRows) {
    const cl = catalogos.clienteAlias.get(normAlias(r.obra_texto))
    if (cl) totalJ.set(cl, (totalJ.get(cl) ?? 0) + Number(r.total ?? 0))
  }

  let rojo = false
  for (const cliente of CLIENTES) {
    console.log(`\n## ${cliente}`)
    console.log(`  ${'obra'.padEnd(40)} ${'mat. antes'.padStart(13)} ${'mat. después'.padStart(13)} ${'MO antes'.padStart(12)} ${'MO después'.padStart(12)}`)
    let suma = 0
    for (const o of obras.filter((x) => clienteDeObra(x) === cliente)) {
      const r = d.get(o.id)
      suma += Number(r?.materiales ?? 0) + Number(r?.subcontratos ?? 0)
      console.log(`  ${o.nombre.slice(0, 40).padEnd(40)} ${$(aMat.get(o.id)).padStart(13)} ${$(r?.materiales).padStart(13)} ${$(aMo.get(o.id)).padStart(12)} ${$(r?.mano_obra).padStart(12)}`)
    }
    const s = sinObra.get(idDe.get(cliente))
    suma += Number(s?.materiales ?? 0) + Number(s?.subcontratos ?? 0)
    console.log(`  ${'Gastos del cliente sin obra asignada'.padEnd(40)} ${'—'.padStart(13)} ${$(s?.materiales).padStart(13)}`)
    if (s?.detalles?.length) console.log(`    title: ${s.detalles.map((x) => `${x.detalle.slice(0, 30)} $ ${$(x.total)}`).join(' · ')}`)
    const j = totalJ.get(cliente) ?? 0
    const ok = Math.abs(suma - j) < 0.005
    rojo ||= !ok
    console.log(`  IDENTIDAD obras + sin obra = ${suma.toFixed(2)} · Compras del cliente (J) = ${j.toFixed(2)} → ${ok ? 'OK' : 'ROJO'}`)
  }
  await closePool()
  if (rojo) process.exit(1)
}
main().catch(async (e) => { console.error('verificación falló:', e.message); await closePool().catch(() => {}); process.exit(1) })
