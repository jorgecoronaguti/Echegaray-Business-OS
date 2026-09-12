#!/usr/bin/env node
// ¿LA PANTALLA /documentos ENCUENTRA LO QUE EL CHAT ENCUENTRA? — la medida, no la impresión.
//
// El 11/09/2026, dentro del mandato de optimización, apareció que la pantalla de Documentos buscaba
// con `name ilike '%la frase entera%'` mientras el chat bajaba una escalera de peldaños sobre el
// mismo data room. Esto lo mide: las mismas 30 consultas contra las dos caras, sobre el Drive real.
//
//   node orquestador/scripts/documentos-busqueda-baseline.mjs [--detalle] [--json <archivo>]
//
// DESDE UN WORKTREE hace falta `--env <ruta al .env.local del checkout principal>`: la clave de
// servicio de Supabase vive ahí y un worktree no tiene `.env.local`. NO se usa `ORQ_ENV_FILE` para
// eso: esa variable REEMPLAZA el EnvironmentFile donde vive `DATABASE_URL`, y sin base el índice del
// chat se carga vacío y la columna `chat` da 0/30 sin un solo error — medido, 12/09.
//
// LAS TRES COLUMNAS QUE IMPRIME
//   web_ilike    la búsqueda ANTERIOR de la pantalla, reproducida acá en tres líneas (`name ilike` /
//                `path ilike`, orden por fecha, tope 100). Es una RÉPLICA, y se valida sola: correr
//                este mismo script sobre un checkout de `main` tiene que dar web_actual = web_ilike.
//   web_actual   la pantalla de VERDAD: se llama a `getDocumentos`, el mismo servicio que renderiza
//                `/documentos`, contra el mismo PostgREST. No se reimplementa nada.
//   chat         `crearIndice` + `buscar` de `orquestador/lib/drive-busqueda`, el motor del bot @os.
//
// ACIERTO = alguno de los `esperados` de la consulta aparece en los 5 PRIMEROS resultados. Cinco
// porque es lo que una persona ve sin desplazarse y lo que el chat ofrece como opciones.
//
// LA BÚSQUEDA POR CONTENIDO DEL CHAT QUEDA AFUERA salvo `--contenido`: carga el modelo de
// embeddings en una VM de 4 núcleos y mide otra cosa (lo que el papel dice adentro, no cómo se
// llama). Lo que se compara acá es la búsqueda por nombre y ruta, que es la que la pantalla tiene.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { loadEnvLocalInto } from '../../scripts/lib/env-file.mjs'

const tiene = (f) => process.argv.includes(f)
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : d }
// ANTES de importar lo que lee la configuración: `config.mjs` valida al cargarse.
const ENV = arg('--env', null)
if (ENV) loadEnvLocalInto(process.env, ENV)

const { query, closePool } = await import('../lib/db.mjs')
const { crearIndice, buscar } = await import('../lib/drive-busqueda/buscar.mjs')

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '../..')
const CONSULTAS = path.join(RAIZ, 'orquestador/datos/perf/documentos-consultas.json')

const DETALLE = tiene('--detalle')
const CON_CONTENIDO = tiene('--contenido')
const TOPE_ACIERTO = 5

/** El servicio REAL de la pantalla. Es un `.ts`: lo importa Node despojando los tipos, igual que
 *  `node --test` con los tests de `src/`. Si este import falla, la medición no vale — no se
 *  reemplaza por una reimplementación «equivalente», que es justamente lo que no se quiere medir. */
const { getDocumentos } = await import(path.join(RAIZ, 'src/features/documentos/services/documentosService.ts'))

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_SB || !CLAVE) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.'
    + ' Desde un worktree: ORQ_ENV_FILE=<ruta al .env.local del checkout principal>.')
  process.exit(1)
}
const sb = createClient(URL_SB, CLAVE, { auth: { persistSession: false } })

/**
 * LA BÚSQUEDA VIEJA DE LA PANTALLA, TAL CUAL ERA.
 *
 * Copiada del commit anterior a la escalera: un `or` de dos `ilike` con la frase entera, orden por
 * fecha de modificación y tope de una página. Se deja escrita acá —y no se borra cuando la pantalla
 * cambie otra vez— porque es la línea de base contra la que se mide cualquier mejora futura.
 */
async function webIlike(texto) {
  const seguro = texto.replace(/[,()*]/g, ' ').trim()
  const { data, error } = await sb
    .from('drive_index')
    .select('drive_file_id, name, path')
    .eq('is_folder', false)
    .or(`name.ilike.%${seguro}%,path.ilike.%${seguro}%`)
    .order('modified_time', { ascending: false, nullsFirst: false })
    .limit(100)
  if (error) throw new Error(`web_ilike: ${error.message}`)
  return (data ?? []).map((f) => f.drive_file_id)
}

async function webActual(texto) {
  const r = await getDocumentos(sb, { q: texto })
  if (r.error) throw new Error(`web_actual: ${r.error}`)
  return (r.data?.documentos ?? []).map((d) => d.drive_file_id)
}

function chat(indice) {
  return async (texto) => {
    const r = await buscar({ indice, texto, limite: TOPE_ACIERTO })
    const ids = (r.opciones ?? []).map((o) => o.drive_file_id)
    if (r.ganador && !ids.includes(r.ganador.drive_file_id)) ids.unshift(r.ganador.drive_file_id)
    for (const d of r.porContenido ?? []) if (!ids.includes(d.drive_file_id)) ids.push(d.drive_file_id)
    return { ids, etapa: r.etapa }
  }
}

const acierta = (ids, esperados) => ids.slice(0, TOPE_ACIERTO).some((id) => esperados.includes(id))
const pos = (ids, esperados) => { const i = ids.findIndex((id) => esperados.includes(id)); return i < 0 ? null : i + 1 }

const { consultas } = JSON.parse(fs.readFileSync(CONSULTAS, 'utf8'))
const indice = crearIndice({ port: { query: (sql, params) => query(sql, params) } })
// Sin la búsqueda por contenido el chat mide lo MISMO que la pantalla: nombre y ruta. Se apaga
// quitándole la capacidad al índice, que es el único lugar donde `buscar` la consulta.
if (!CON_CONTENIDO) indice.buscarContenido = undefined
// UNA COLUMNA EN CERO ES UN DEFECTO DEL MEDIDOR HASTA QUE SE DEMUESTRE LO CONTRARIO. `filasVigentes`
// se traga cualquier error de lectura y devuelve [], así que sin esta comprobación el chat mide 0/30
// y parece un resultado. Pasó en la primera corrida.
const filasIndice = await indice.filasVigentes()
if (filasIndice.length === 0) {
  console.error('El índice del chat se cargó VACÍO: sin DATABASE_URL no hay medición. Ver --env.')
  process.exit(1)
}
const buscarChat = chat(indice)

const filas = []
for (const c of consultas) {
  const t0 = Date.now()
  const [ilike, actual, elChat] = [await webIlike(c.consulta), await webActual(c.consulta), await buscarChat(c.consulta)]
  filas.push({
    id: c.id,
    consulta: c.consulta,
    origen: c.origen,
    esperado: c.esperado_nombre,
    web_ilike: acierta(ilike, c.esperados),
    web_actual: acierta(actual, c.esperados),
    chat: acierta(elChat.ids, c.esperados),
    etapa: elChat.etapa,
    pos_web: pos(actual, c.esperados),
    pos_chat: pos(elChat.ids, c.esperados),
    // LA EQUIVALENCIA NO SE AFIRMA, SE MIDE: los 5 primeros de la web contra los 5 del chat.
    mismo_top: JSON.stringify(actual.slice(0, TOPE_ACIERTO)) === JSON.stringify(elChat.ids.slice(0, TOPE_ACIERTO)),
    ms: Date.now() - t0,
  })
}

const cuenta = (k) => filas.filter((f) => f[k]).length
const pad = (s, n) => String(s).padEnd(n).slice(0, n)

console.log(`\n  ACIERTOS SOBRE ${filas.length} CONSULTAS (el esperado entre los ${TOPE_ACIERTO} primeros)\n`)
console.log(`    web (ilike de la frase entera) ....  ${cuenta('web_ilike')}/${filas.length}`)
console.log(`    web (escalera compartida) ........  ${cuenta('web_actual')}/${filas.length}`)
console.log(`    chat (@os) .......................  ${cuenta('chat')}/${filas.length}`)
console.log(`    web y chat con el MISMO top ${TOPE_ACIERTO} ....  ${cuenta('mismo_top')}/${filas.length}`)

if (DETALLE) {
  console.log(`\n  ${pad('consulta', 48)}${pad('ilike', 7)}${pad('web', 5)}${pad('chat', 6)}${pad('=', 3)}${pad('etapa', 17)}ms`)
  for (const f of filas) {
    const m = (b) => (b ? '  ✓  ' : '  ·  ')
    console.log(`  ${pad(f.consulta, 48)}${pad(m(f.web_ilike), 7)}${pad(m(f.web_actual), 5)}${pad(m(f.chat), 6)}${pad(f.mismo_top ? '=' : '≠', 3)}${pad(f.etapa ?? '—', 17)}${f.ms}`)
  }
  const fallan = filas.filter((f) => !f.web_actual)
  if (fallan.length) {
    console.log('\n  LO QUE SIGUE SIN ENCONTRARSE:')
    for (const f of fallan) console.log(`    · ${f.consulta}  →  ${f.esperado}`)
  }
}

const salida = arg('--json', null)
if (salida) {
  fs.writeFileSync(salida, `${JSON.stringify({ medido_en: new Date().toISOString(), tope: TOPE_ACIERTO, filas }, null, 2)}\n`)
  console.log(`\n  detalle en ${salida}`)
}
console.log('')
await closePool()
