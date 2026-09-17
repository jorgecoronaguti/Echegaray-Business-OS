#!/usr/bin/env node
// CARGA EL COSTO COTIZADO DE LAS OBRAS ACTIVAS EN `presupuestos` + `partidas_presupuesto`.
//
//   node orquestador/scripts/cargar-presupuestos-cotizados.mjs                         (ensayo: begin … rollback)
//   node orquestador/scripts/cargar-presupuestos-cotizados.mjs --con-migracion <sql>   (ensayo con la migración adentro)
//   node orquestador/scripts/cargar-presupuestos-cotizados.mjs --aplicar               (commit)
//
// Los datos y su validación viven en `lib/presupuestos-cotizados.mjs` (puro, con tests). Este script
// sólo escribe y relee.
//
// IDEMPOTENTE: la clave es (obra_canonica_id, version). Un presupuesto igual al guardado no se toca
// (`is distinct from`), una partida igual tampoco, y una partida que ya no está en el módulo se borra.
// La segunda corrida informa 0 cambios.
//
// LA EVIDENCIA ES EL DATO LEÍDO: con --aplicar, después del commit se relee `obra_economia` con
// OTRA conexión. Lo que devolvió el insert no cuenta.
import fs from 'node:fs'
import { getPool, closePool } from '../lib/db.mjs'
import { PRESUPUESTOS, OBRAS_ACTIVAS, problemasDelConjunto, filaDe } from '../lib/presupuestos-cotizados.mjs'

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
const iMig = args.indexOf('--con-migracion')
const migracion = iMig >= 0 ? args[iMig + 1] : null
if (aplicar && migracion) {
  console.error('--con-migracion es sólo para ensayar: la migración se aplica con aplicar-migracion.mjs.')
  process.exit(1)
}

const COLUMNAS = [
  'obra_canonica_id', 'version', 'estado', 'monto_presupuestado', 'costo_directo_presupuestado',
  'costo_indirecto_presupuestado', 'margen_esperado', 'hh_estimada', 'fecha_presupuesto', 'fuente_legacy',
  'notas', 'costo_pendiente_motivo', 'moneda_original', 'monto_moneda_original', 'tipo_cambio', 'tipo_cambio_origen',
]
const ACTUALIZABLES = COLUMNAS.filter((c) => c !== 'obra_canonica_id' && c !== 'version')

const SQL_PRESUPUESTO = `
insert into public.presupuestos (${COLUMNAS.join(', ')})
values (${COLUMNAS.map((_, i) => `$${i + 1}`).join(', ')})
on conflict (obra_canonica_id, version) do update set
  ${ACTUALIZABLES.map((c) => `${c} = excluded.${c}`).join(',\n  ')}
where (${ACTUALIZABLES.map((c) => `presupuestos.${c}`).join(', ')})
  is distinct from (${ACTUALIZABLES.map((c) => `excluded.${c}`).join(', ')})
returning id, (xmax = 0) as insertado`

/** Orden de escritura: primero lo que NO es aprobado, para no chocar con el único-aprobado-por-obra. */
const ORDEN = { reemplazado: 0, cotizado: 1, borrador: 1, aprobado: 2 }

async function cargar(c) {
  const res = { insertados: 0, actualizados: 0, sinCambios: 0, partidas: { insertadas: 0, actualizadas: 0, borradas: 0, iguales: 0 } }
  for (const x of [...PRESUPUESTOS].sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado])) {
    const f = filaDe(x)
    const r = await c.query(SQL_PRESUPUESTO, COLUMNAS.map((k) => f[k]))
    let id
    if (r.rows.length) {
      id = r.rows[0].id
      if (r.rows[0].insertado) res.insertados++; else res.actualizados++
    } else {
      res.sinCambios++
      id = (await c.query('select id from public.presupuestos where obra_canonica_id = $1 and version = $2', [x.obra, x.version])).rows[0].id
    }
    const codigos = x.partidas.map((q) => q.codigo)
    res.partidas.borradas += (await c.query(
      'delete from public.partidas_presupuesto where presupuesto_id = $1 and not (coalesce(codigo, \'\') = any ($2::text[]))',
      [id, codigos])).rowCount
    for (const q of x.partidas) {
      const u = await c.query(
        `update public.partidas_presupuesto set descripcion = $3, monto = $4
          where presupuesto_id = $1 and codigo = $2 and (descripcion, monto) is distinct from ($3::text, $4::numeric)`,
        [id, q.codigo, q.descripcion, q.monto])
      if (u.rowCount) { res.partidas.actualizadas++; continue }
      const existe = await c.query('select 1 from public.partidas_presupuesto where presupuesto_id = $1 and codigo = $2', [id, q.codigo])
      if (existe.rowCount) { res.partidas.iguales++; continue }
      await c.query('insert into public.partidas_presupuesto (presupuesto_id, codigo, descripcion, monto) values ($1, $2, $3, $4)',
        [id, q.codigo, q.descripcion, q.monto])
      res.partidas.insertadas++
    }
  }
  return res
}

const LECTURA = `
select e.obra_id, e.costo_objetivo, e.costo_indirecto_objetivo, e.venta_total, e.margen_cotizado, e.costo_objetivo_origen,
       (select round(sum(pp.monto), 2) from public.presupuestos p join public.partidas_presupuesto pp on pp.presupuesto_id = p.id
         where p.obra_canonica_id = e.obra_id and p.estado = 'aprobado') as suma_partidas_aprobado
  from public.obra_economia e where e.obra_id = any ($1::text[]) order by e.obra_id`

function imprimir(filas) {
  for (const f of filas) {
    console.log(`  ${f.obra_id.padEnd(31)} costo_objetivo=${f.costo_objetivo ?? 'NULL'} · GG=${f.costo_indirecto_objetivo ?? 'NULL'} · partidas=${f.suma_partidas_aprobado ?? '—'} · margen_cotizado=${f.margen_cotizado ?? 'NULL'}`)
    console.log(`  ${''.padEnd(31)} origen: ${f.costo_objetivo_origen}`)
  }
}

async function main() {
  const problemas = problemasDelConjunto()
  if (problemas.length) {
    console.error('NO SE CARGA: el módulo de datos tiene problemas:\n  ' + problemas.join('\n  '))
    process.exit(1)
  }
  const pool = getPool()
  const c = await pool.connect()
  try {
    await c.query('begin')
    await c.query("set local lock_timeout = '5s'")
    if (migracion) await c.query(fs.readFileSync(migracion, 'utf8'))
    const res = await cargar(c)
    console.log(`presupuestos: ${res.insertados} insertados · ${res.actualizados} actualizados · ${res.sinCambios} sin cambios`)
    console.log(`partidas: ${res.partidas.insertadas} insertadas · ${res.partidas.actualizadas} actualizadas · ${res.partidas.borradas} borradas · ${res.partidas.iguales} iguales`)
    if (!aplicar) {
      console.log('\nLECTURA DENTRO DE LA TRANSACCIÓN (se deshace):')
      imprimir((await c.query(LECTURA, [OBRAS_ACTIVAS])).rows)
      await c.query('rollback')
      console.log('\n✓ ensayo: nada quedó escrito (rollback). Para escribir: --aplicar')
      return
    }
    await c.query('commit')
  } catch (e) {
    await c.query('rollback').catch(() => {})
    throw e
  } finally {
    c.release()
  }
  // Otra conexión: lo que quedó en la base, no lo que contestó el insert.
  const otra = await pool.connect()
  try {
    console.log('\nLEÍDO EN DESTINO (otra conexión, después del commit):')
    imprimir((await otra.query(LECTURA, [OBRAS_ACTIVAS])).rows)
  } finally {
    otra.release()
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1 }).finally(() => closePool())
