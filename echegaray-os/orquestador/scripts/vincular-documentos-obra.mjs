#!/usr/bin/env node
// POBLAR `obra_documento` DESDE LA CARPETA DE DRIVE DE LA OBRA.
//
//   node orquestador/scripts/vincular-documentos-obra.mjs --obra quattropani            (ensayo)
//   node orquestador/scripts/vincular-documentos-obra.mjs --obra quattropani --aplicar
//   node orquestador/scripts/vincular-documentos-obra.mjs                               (todas, ensayo)
//
// SIN `--aplicar` NO ESCRIBE NADA: lista los candidatos leyendo `obra_documento_candidato`. Ése es
// el default a propósito — un script que escribe por omisión es un script que ya escribió.
//
// ═══ QUÉ HACE, EXACTAMENTE ═══
//
// Llama a `vincular_documentos_por_carpeta()` (20260822T6500). La regla está EN LA BASE y no acá:
// si viviera en este archivo, la misma vinculación hecha desde la web daría otro resultado, y ya
// habría dos definiciones de «qué documento es de esta obra».
//
// Es idempotente: la segunda corrida devuelve 0 vinculados y los cuenta en `ya_estaban`. No pisa
// ningún vínculo existente —ni el rol ni el origen que escribió una persona— y saltea los ambiguos
// (dos obras que declaran la misma carpeta de Drive).
//
// ═══ LO QUE NO HACE ═══
//
// No toca Drive, no copia archivos y no adivina. Un archivo que no está en `drive_index` no existe
// para este script: se sincroniza el índice primero.

import { getPool } from '../lib/db.mjs'

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
const iObra = args.indexOf('--obra')
const obra = iObra >= 0 ? args[iObra + 1] ?? null : null

if (iObra >= 0 && !obra) {
  console.error('Falta el id de la obra después de --obra (por ejemplo: --obra quattropani).')
  process.exit(1)
}

const n = (v) => Number(v ?? 0)

async function ensayo(pool) {
  const { rows } = await pool.query(
    `select obra_id,
            count(*) filter (where not ambiguo and not ya_vinculado)::int as se_vincularian,
            count(*) filter (where ya_vinculado)::int                     as ya_estaban,
            count(*) filter (where ambiguo)::int                          as ambiguos,
            min(carpeta_obra)                                             as carpeta
       from obra_documento_candidato
      where $1::text is null or obra_id = $1
      group by obra_id order by obra_id`, [obra])

  if (!rows.length) {
    console.log(obra
      ? `Sin candidatos para «${obra}». O la obra no declara drive_carpeta_id, o esa carpeta no está en drive_index.`
      : 'Sin candidatos: ninguna obra declara una carpeta de Drive indexada.')
    return
  }

  console.log('ENSAYO — no se escribió nada.\n')
  for (const r of rows) {
    console.log(`${r.obra_id.padEnd(28)} se vincularían ${String(n(r.se_vincularian)).padStart(4)}` +
      `  ·  ya estaban ${String(n(r.ya_estaban)).padStart(4)}` +
      `  ·  ambiguos ${String(n(r.ambiguos)).padStart(4)}   [${r.carpeta}]`)
  }
  const ambiguos = rows.reduce((a, r) => a + n(r.ambiguos), 0)
  if (ambiguos > 0) {
    console.log(`\n${ambiguos} archivo(s) AMBIGUO(s): su carpeta la declara más de una obra, así que ` +
      'no identifica a ninguna. Ésos se confirman a mano desde la obra, con la acción de vincular.')
  }
  console.log('\nPara escribir: agregá --aplicar')
}

async function aplicarVinculos(pool) {
  const { rows } = await pool.query('select * from vincular_documentos_por_carpeta($1)', [obra])
  if (!rows.length) {
    console.log('No había candidatos: no se escribió nada.')
    return
  }
  for (const r of rows) {
    console.log(`${r.obra_id.padEnd(28)} vinculados ${String(n(r.vinculados)).padStart(4)}` +
      `  ·  ya estaban ${String(n(r.ya_estaban)).padStart(4)}` +
      `  ·  ambiguos sin tocar ${String(n(r.ambiguos)).padStart(4)}`)
  }

  // LA EVIDENCIA ES DEL EFECTO, NO DEL INTENTO: se relee el destino después de escribir. Un
  // `insert` que devolvió sin error y una tabla con las filas adentro no son la misma afirmación.
  const { rows: dest } = await pool.query(
    `select obra_id, count(*)::int as documentos,
            count(*) filter (where origen='carpeta_drive')::int as por_carpeta
       from obra_documento where $1::text is null or obra_id = $1
      group by obra_id order by obra_id`, [obra])
  console.log('\nLEÍDO EN EL DESTINO (obra_documento):')
  for (const d of dest) console.log(`  ${d.obra_id.padEnd(28)} ${d.documentos} documento(s), ${d.por_carpeta} por carpeta`)
}

const pool = getPool()
try {
  if (aplicar) await aplicarVinculos(pool)
  else await ensayo(pool)
} catch (err) {
  // Una migración en el repo NO es una migración aplicada, y «relation does not exist» no le dice
  // eso a nadie: se traduce a lo único accionable que hay.
  if (err.code === '42P01' || err.code === '42883') {
    console.error('Falta aplicar en la base la migración 20260822T6500 ' +
      '(el_documento_es_de_la_obra_cuya_carpeta_lo_contiene). Detalle: ' + err.message)
  } else {
    console.error(`No pude correr: ${err.message}`)
  }
  process.exitCode = 1
} finally {
  await pool.end()
}
