#!/usr/bin/env node
// ENSAYO DE LA MIGRACIÓN DE `orq.drive_audit`, SIN APLICARLA.
//
// El agente que construye no aplica migraciones — eso lo decide quien tiene la vista del
// conjunto. Pero «la migración está escrita» no es evidencia de nada: este repo ya pagó el
// «migración en el repo ≠ migración aplicada». Lo que sí se puede probar sin tocar el esquema:
// que el SQL corre contra la base REAL, que el auditor escribe de verdad y que las consultas de
// la historia devuelven lo escrito. Todo dentro de una transacción que TERMINA EN ROLLBACK.
//
// Al salir, el esquema queda exactamente como estaba. Se verifica que así sea.
//
//   node orquestador/scripts/drive-audit-migracion-ensayo.mjs

import fs from 'node:fs'
import path from 'node:path'
import { query, withTx } from '../lib/db.mjs'
import { APP_DIR } from '../lib/config.mjs'
import { crearAuditorPg, TABLA } from '../lib/drive/auditoria.mjs'

const MIGRACION = path.join(APP_DIR, 'supabase', 'migrations', '20260901T1200_la_escritura_en_drive_deja_rastro.sql')

const existe = async () => {
  const { rows } = await query("select to_regclass('orq.drive_audit') is not null as hay")
  return rows[0].hay
}

async function main() {
  const antes = await existe()
  console.log(`orq.drive_audit ANTES del ensayo: ${antes ? 'EXISTE (la migración ya está aplicada)' : 'NO existe'}`)

  const sql = fs.readFileSync(MIGRACION, 'utf8')
  let filas = []
  let historia = []
  let error = null

  try {
    await withTx(async (cli) => {
      await cli.query(sql)
      console.log('✔ el SQL de la migración corre contra la base real')

      const { rows: cols } = await cli.query(
        "select column_name from information_schema.columns where table_schema='orq' and table_name='drive_audit' order by ordinal_position")
      console.log(`  columnas (${cols.length}): ${cols.map((c) => c.column_name).join(', ')}`)

      const { rows: caps } = await cli.query(
        "select slug, required_clearance, blast_radius, idempotency, disposition_override from orq.capabilities where slug like 'drive.files%' order by slug")
      console.log('  capacidades registradas:')
      for (const c of caps) console.log(`    ${c.slug.padEnd(22)} clearance ${c.required_clearance} · blast ${c.blast_radius} · ${c.idempotency} · ${c.disposition_override ?? '(policy)'}`)

      // El auditor de verdad, contra esta transacción.
      const auditor = crearAuditorPg({ db: cli, actor: 'jorge@ecsas.com.ar', actorTipo: 'persona', correlationId: '22222222-2222-2222-2222-222222222222' })
      await auditor.registrar({
        operacion: 'mover', referencia: { file_id: '1F9m7', folder_id: 'SUB', mime_type: 'text/plain', revision_id: '0By', hash: 'md5' },
        antes: { parents: ['RAIZ'] }, despues: { parents: ['SUB'] }, verificado_campos: ['parents'],
      })
      await auditor.registrar({
        operacion: 'renombrar', referencia: { file_id: '1F9m7', mime_type: 'text/plain' },
        antes: { name: 'remito.txt' }, despues: { name: 'remito-0001.txt' }, verificado_campos: ['name'],
      })
      historia = await auditor.historia('1F9m7')
      const { rows } = await cli.query(`select seq, operacion, actor, actor_tipo, file_id, verificado, verificado_campos from ${TABLA} order by seq`)
      filas = rows

      // LA POLICY, contra la función real: que la capacidad esté registrada no sirve si
      // `orq.policy_decide` no sabe qué hacer con ella.
      const { rows: [pr] } = await cli.query("select id from orq.principals where slug='agent:director-general' limit 1")
      if (pr) {
        for (const slug of ['drive.files.read', 'drive.files.manage', 'drive.files.archive']) {
          const { rows: [d] } = await cli.query('select orq.policy_decide($1,$2,null) as d', [slug, pr.id])
          console.log(`  policy_decide(${slug.padEnd(20)}, director-general) = ${d.d}`)
        }
      }

      // La regla que la tabla impone: el libro NO se corrige, se le agrega una fila.
      const { rows: pol } = await cli.query(
        "select cmd from pg_policies where schemaname='orq' and tablename='drive_audit' and roles::text like '%service_role%'")
      console.log(`  policies de service_role: ${pol.map((r) => r.cmd).join(', ')} (sin UPDATE ni DELETE a propósito)`)

      throw new Error('__ROLLBACK_A_PROPOSITO__')
    })
  } catch (e) {
    if (e.message !== '__ROLLBACK_A_PROPOSITO__') { error = e; }
  }

  if (error) { console.error('✖ el ensayo falló:', error.message); process.exit(1) }

  console.log('\n  filas escritas por el auditor DENTRO de la transacción:')
  for (const f of filas) console.log(`    ${f.operacion.padEnd(10)} ${f.file_id} · ${f.actor} (${f.actor_tipo}) · verificado=${f.verificado} ${JSON.stringify(f.verificado_campos)}`)
  console.log(`  historia('1F9m7') devolvió ${historia.length} fila(s), la más nueva primero: ${historia.map((h) => h.operacion).join(' → ')}`)

  const despues = await existe()
  console.log(`\norq.drive_audit DESPUÉS del ensayo: ${despues ? 'EXISTE' : 'NO existe'}`)
  if (antes !== despues) { console.error('✖ EL ENSAYO CAMBIÓ EL ESQUEMA. No tenía que pasar.'); process.exit(1) }
  console.log('✔ el esquema quedó como estaba: el ensayo NO aplicó la migración')
  process.exit(0)
}

main().catch((e) => { console.error('✖', e); process.exit(1) })
