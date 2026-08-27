#!/usr/bin/env node
// APLICA UNA MIGRACIÓN Y DEJA CONSTANCIA DE QUE SE APLICÓ.
//
//   node orquestador/scripts/aplicar-migracion.mjs <archivo.sql> [--aplicar]
//   node orquestador/scripts/aplicar-migracion.mjs --estado
//
// Sin `--aplicar` corre la migración dentro de una transacción y la DESHACE. Es un ensayo real:
// los errores de sintaxis, las claves foráneas que no cierran y los CHECK que la data viola
// aparecen igual, pero la base queda como estaba.
//
// ═══ POR QUÉ EXISTE ESTE SCRIPT ═══
//
// `.claude/rules/migraciones.md` lo dice con una frase que ya costó medio día: **una migración en el
// repo no es una migración aplicada**. El archivo commiteado y la base real son dos cosas distintas,
// y no había forma de preguntarle a la base cuáles corrió. Ahora la hay: cada aplicación deja una
// fila en `public.migracion_aplicada` con el hash del archivo, así que un archivo EDITADO DESPUÉS de
// aplicarse se delata solo — el hash no coincide y `--estado` lo marca.
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'
import { getPool } from '../lib/db.mjs'

const DIR = 'supabase/migrations'

const LEDGER = `
create table if not exists public.migracion_aplicada (
  archivo     text primary key,
  hash        text not null,
  aplicada_en timestamptz not null default now(),
  aplicada_por text
);
comment on table public.migracion_aplicada is
  'Qué migraciones corrió esta base. El hash es del archivo tal como se aplicó: si alguien lo edita '
  'después, deja de coincidir y aplicar-migracion.mjs --estado lo dice.';`

const hashDe = (sql) => createHash('sha256').update(sql).digest('hex').slice(0, 16)

async function estado(pool) {
  await pool.query(LEDGER)
  const { rows } = await pool.query('select archivo, hash, aplicada_en from public.migracion_aplicada')
  const aplicadas = new Map(rows.map((r) => [r.archivo, r]))
  const enRepo = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  let sinAplicar = 0
  let cambiadas = 0
  for (const f of enRepo) {
    const a = aplicadas.get(f)
    if (!a) { sinAplicar++; continue }
    if (a.hash !== hashDe(readFileSync(join(DIR, f), 'utf8'))) {
      cambiadas++
      console.log(`  ⚠ EDITADA DESPUÉS DE APLICARSE  ${f}`)
    }
  }
  console.log(`\n${enRepo.length} migraciones en el repo · ${aplicadas.size} con constancia de aplicación`)
  console.log(`${sinAplicar} sin constancia · ${cambiadas} editadas después de aplicarse`)
  if (sinAplicar) {
    console.log('\nSIN CONSTANCIA (puede ser que se hayan aplicado antes de que existiera el registro):')
    for (const f of enRepo) if (!aplicadas.has(f)) console.log('  · ' + f)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const pool = getPool()
  if (args.includes('--estado')) { await estado(pool); await pool.end(); return }

  const archivo = args.find((a) => !a.startsWith('--'))
  if (!archivo) throw new Error('falta el archivo de migración')
  const aplicar = args.includes('--aplicar')
  const ruta = archivo.includes('/') ? archivo : join(DIR, archivo)
  const sql = readFileSync(ruta, 'utf8')
  if (!sql.trim()) throw new Error(`${ruta} está vacío: una migración vacía no se aplica`)
  const nombre = basename(ruta)
  const hash = hashDe(sql)

  await pool.query(LEDGER)
  const previa = await pool.query('select hash, aplicada_en from public.migracion_aplicada where archivo = $1', [nombre])
  if (previa.rows.length) {
    const p = previa.rows[0]
    console.log(`ya aplicada el ${p.aplicada_en.toISOString().slice(0, 16).replace('T', ' ')}` +
      (p.hash === hash ? ' con este mismo contenido.' : ` con OTRO contenido (hash ${p.hash} ≠ ${hash}).`))
    if (p.hash === hash && !args.includes('--forzar')) { await pool.end(); return }
  }

// ═══ UN ENSAYO QUE APLICA NO ES UN ENSAYO (27/08/2026) ═══
//
// El ensayo envuelve la migración en `begin … rollback`. Si el ARCHIVO trae su propio `commit;`, ese
// commit cierra la transacción de afuera y el `rollback` posterior no deshace nada: la migración
// quedó aplicada y la pantalla dijo «NO se aplicó». Pasó con dos archivos, y hay 8 más en el repo
// escritos así.
//
// No se corrigen solos borrándoles el `commit` desde acá: una migración que se auto-transacciona
// puede estar contando con eso. Se rechaza, se nombra el problema y la escribe quien la manda.
function transaccionaSola(sql) {
  const limpio = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // comentarios de bloque
    .replace(/^[ \t]*--.*$/gm, " ")         // comentarios de línea
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')   // cuerpos de do $$ … $$
  return /(^|;|\s)(begin|commit|end)\s*;/i.test(limpio)
}

  if (transaccionaSola(sql)) {
    console.log(`✗ ${nombre} maneja su propia transacción (begin/commit). Sacale el begin/commit: este`)
    console.log('  script ya envuelve la migración, y un commit adentro rompe el ensayo — se aplicaría de verdad.')
    await pool.end()
    process.exitCode = 1
    return
  }

  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    await cliente.query(sql)
    await cliente.query(
      `insert into public.migracion_aplicada (archivo, hash, aplicada_por) values ($1, $2, $3)
       on conflict (archivo) do update set hash = excluded.hash, aplicada_en = now(), aplicada_por = excluded.aplicada_por`,
      [nombre, hash, process.env.USER || 'os'])
    if (aplicar) {
      await cliente.query('commit')
      console.log(`✓ aplicada y registrada: ${nombre}`)
    } else {
      await cliente.query('rollback')
      console.log(`✓ el ensayo corrió entero sin error. NO se aplicó (falta --aplicar): ${nombre}`)
    }
  } catch (e) {
    await cliente.query('rollback').catch(() => {})
    console.error(`✗ ${nombre} falló y no se aplicó nada:\n  ${e.message}`)
    process.exitCode = 1
  } finally {
    cliente.release()
    await pool.end()
  }
}

main().catch((e) => { console.error('falló:', e.message); process.exit(1) })
