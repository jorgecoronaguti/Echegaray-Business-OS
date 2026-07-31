#!/usr/bin/env node
// RELLENA LAS COLUMNAS DE BÚSQUEDA de las filas que ya están en public.drive_index.
//
// El índice ya tiene el catálogo entero (~2.465 filas), pero se escribió antes de que
// existieran `nombre_norm`, `path_norm`, `tokens` y `hash`. Sin ellas, el buscador nuevo no
// encuentra NADA: no porque el archivo no esté, sino porque su forma comparable está vacía.
//
// NO LLAMA A LA API DE DRIVE. Todo sale de `name` y `path`, que ya están guardados — así el
// backfill se puede correr cuando se quiera, no cuesta cuota y no depende de que el service
// account tenga permiso hoy. Lo único que no puede completar es `owner_email`, que sí vive
// en Drive: lo rellena la próxima corrida del indexador (ver `decidirEscritura`).
//
// IDEMPOTENTE: recalcula y compara; sólo escribe las filas cuyo valor cambiaría. Correrlo
// dos veces seguidas deja "0 filas actualizadas" la segunda vez, y eso es la prueba.
//
//   node orquestador/scripts/backfill-drive-busqueda.mjs [--dry-run] [--lote=500]
//
// CERO IA: es aritmética de strings.

import { query, closePool } from '../lib/db.mjs'
import { filaIndice } from '../lib/drive-indice.mjs'

const DRY = process.argv.includes('--dry-run') || process.argv.includes('--dry')
const LOTE = Math.max(1, Number(process.argv.find((a) => a.startsWith('--lote='))?.split('=')[1]) || 500)

/** ¿Las columnas de búsqueda de esta fila ya son las correctas? */
function coincide(guardada, calculada) {
  const tokensGuardados = Array.isArray(guardada.tokens) ? guardada.tokens : []
  return guardada.nombre_norm === calculada.nombre_norm
    && guardada.path_norm === calculada.path_norm
    && guardada.hash === calculada.hash
    && tokensGuardados.length === calculada.tokens.length
    && tokensGuardados.every((t, i) => t === calculada.tokens[i])
}

/**
 * La fila guardada, en la forma que espera `filaIndice`.
 *
 * `modified_time` vuelve a ISO porque así es exactamente como lo manda Drive, y el hash
 * tiene que dar IGUAL en las dos puntas. Si difiriera, la próxima corrida del indexador
 * vería 2.465 hashes distintos y reescribiría todo una vez — no rompe nada, pero es
 * justamente el trabajo que este diseño vino a evitar.
 */
function comoDrive(r) {
  return {
    id: r.drive_file_id,
    name: r.name,
    mimeType: r.mime_type,
    size: r.size_bytes,
    modifiedTime: r.modified_time ? new Date(r.modified_time).toISOString() : null,
  }
}

async function main() {
  const { rows } = await query(
    `select drive_file_id, name, path, mime_type, size_bytes, modified_time, parent_id, depth,
            nombre_norm, path_norm, tokens, hash
       from public.drive_index order by drive_file_id`)
  console.log(`${rows.length} filas en public.drive_index${DRY ? ' (dry-run: no escribe)' : ''}`)

  const pendientes = []
  let sinTokens = 0
  for (const r of rows) {
    const calc = filaIndice(comoDrive(r), { path: r.path, depth: r.depth, parentId: r.parent_id })
    if (!calc.tokens.length) sinTokens++
    if (!coincide(r, calc)) pendientes.push(calc)
  }

  console.log(`· ${pendientes.length} fila(s) a rellenar · ${rows.length - pendientes.length} ya estaban bien`)
  if (sinTokens) console.log(`· ⚠ ${sinTokens} fila(s) quedan con 0 tokens (no se pueden encontrar por texto)`)
  if (DRY || !pendientes.length) { console.log(DRY ? '— dry-run: no se escribió nada' : '— nada que hacer'); return }

  // Un UPDATE por lote: 2.465 filas en 5 viajes en vez de 2.465. Va por JSON y no por
  // `unnest` de arreglos paralelos porque uno de los valores ES un arreglo (`tokens`), y
  // `unnest` de un text[][] aplana todo y desalinea las filas en silencio.
  //
  // La fila completa no se toca — sólo las columnas de búsqueda. `name`, `path`, `tipo` y
  // demás siguen siendo lo que dijo Drive: este script no es dueño de esos datos.
  let hechas = 0
  for (let i = 0; i < pendientes.length; i += LOTE) {
    const lote = pendientes.slice(i, i + LOTE)
    await query(
      `update public.drive_index d set
         nombre_norm = v.nombre_norm, path_norm = v.path_norm,
         tokens = array(select jsonb_array_elements_text(v.tokens)),
         hash = v.hash, actualizado_at = now()
       from jsonb_to_recordset($1::jsonb)
            as v(id text, nombre_norm text, path_norm text, tokens jsonb, hash text)
       where d.drive_file_id = v.id`,
      [JSON.stringify(lote.map((f) => ({
        id: f.drive_file_id, nombre_norm: f.nombre_norm, path_norm: f.path_norm,
        tokens: f.tokens, hash: f.hash,
      })))])
    hechas += lote.length
    console.log(`  … ${hechas}/${pendientes.length}`)
  }
  console.log(`✓ ${hechas} fila(s) rellenadas`)
}

await main().finally(() => closePool())
