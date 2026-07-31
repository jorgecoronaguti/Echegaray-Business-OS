// Indexa el data room de Drive a public.drive_index — el catálogo completo de archivos que
// el OS usa para encontrar cualquier cosa sin navegar carpeta por carpeta.
//
// Qué cambió respecto de la versión original:
//
//  1. YA NO INDEXA UNA SOLA CARPETA. Las raíces salen de `ORQ_DRIVE_INDEX_ROOTS` (ids
//     separados por coma, opcionalmente `id:rotulo`). Sin la variable, la única raíz sigue
//     siendo `administracion`: la corrida de hoy no cambia. Varias carpetas o unidades
//     compartidas forman UN SOLO índice lógico — el `path` sigue siendo la ruta completa
//     desde su propia raíz.
//
//  2. GUARDA LAS COLUMNAS DE BÚSQUEDA (nombre_norm, path_norm, tokens, hash, owner_email),
//     calculadas con orquestador/lib/drive-busqueda/normalizar.mjs — el MISMO módulo que
//     usa el buscador. Si las dos puntas normalizaran distinto, el índice y la consulta no
//     se encontrarían nunca.
//
//  3. ES INCREMENTAL. Si el hash de un archivo no cambió, la fila no se reescribe: antes
//     eran 2.465 UPDATEs cada 6 horas para dejar todo exactamente igual.
//
//  4. SACA LO QUE DESAPARECIÓ DE DRIVE, y sólo si la corrida terminó entera, sin errores y
//     viendo al menos el 70% de lo que ya había (ver planDeBorrado). Un enlace muerto en un
//     resultado de búsqueda es peor que no encontrar nada, pero borrar por un recorrido
//     parcial es irreversible.
//
// SÓLO LEE DE DRIVE. El scope es `drive.readonly` a propósito: este script no puede escribir
// en Google ni aunque tuviera un error. CERO IA: no hay una sola llamada a un modelo.
//
// Uso:  DATABASE_URL=... node scripts/indexar-drive.mjs [--dry]
import { GoogleAuth } from 'google-auth-library'
import pg from 'pg'
import { parseConnectionString } from '../orquestador/lib/db.mjs'
import {
  FOLDER, CAMPOS_DRIVE, PROFUNDIDAD_MAX,
  raicesDesdeEnv, filaIndice, decidirEscritura, planDeBorrado,
} from '../orquestador/lib/drive-indice.mjs'

const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run')

// ── Drive (sólo lectura) ─────────────────────────────────────────────────────
const auth = new GoogleAuth({
  keyFile: 'scripts/google_workspace/credentials/service-account.json',
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
})
const token = (await (await auth.getClient()).getAccessToken()).token

async function drive(params) {
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 150)}`)
  return r.json()
}

// `supportsAllDrives` + `includeItemsFromAllDrives` hacen que una consulta por carpeta padre
// también devuelva lo que vive en una unidad compartida. Para My Drive no cambian nada, así
// que es seguro dejarlos siempre puestos. `corpora` NO se fija por defecto: forzarlo a
// 'allDrives' cambia el significado de la consulta y podría romper la corrida actual — se
// deja como escotilla en `ORQ_DRIVE_INDEX_CORPORA` para cuando haga falta.
const UNIDADES = { supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' }
const CORPORA = process.env.ORQ_DRIVE_INDEX_CORPORA
  ? { corpora: process.env.ORQ_DRIVE_INDEX_CORPORA }
  : {}

async function listar(id) {
  const out = []
  let pt
  do {
    const res = await drive({
      q: `'${id}' in parents and trashed=false`,
      fields: CAMPOS_DRIVE,
      pageSize: '500',
      orderBy: 'folder,name',
      ...UNIDADES, ...CORPORA,
      ...(pt ? { pageToken: pt } : {}),
    })
    out.push(...(res.files || []))
    pt = res.nextPageToken
  } while (pt)
  return out
}

/** Metadata de una raíz: hace falta su nombre para armar el primer segmento del `path`. */
async function metaRaiz(id) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`)
  url.searchParams.set('fields', 'id,name,mimeType,modifiedTime,owners(emailAddress)')
  url.searchParams.set('supportsAllDrives', 'true')
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`raíz ${id} → ${r.status}: ${(await r.text()).slice(0, 120)}`)
  return r.json()
}

// ── Base ─────────────────────────────────────────────────────────────────────
const p = parseConnectionString(process.env.DATABASE_URL)
const pool = new pg.Pool({
  host: p.host, port: p.port, user: p.user, password: p.password, database: p.database,
  ssl: { rejectUnauthorized: false }, max: 4,
})

const COLUMNAS = ['drive_file_id', 'name', 'path', 'mime_type', 'is_folder', 'tipo', 'size_bytes',
  'modified_time', 'parent_id', 'depth', 'nombre_norm', 'path_norm', 'tokens', 'owner_email', 'hash']

const SQL_UPSERT = `insert into public.drive_index (${COLUMNAS.join(',')},indexed_at,actualizado_at)
  values (${COLUMNAS.map((_, i) => `$${i + 1}`).join(',')},now(),now())
  on conflict (drive_file_id) do update set
    ${COLUMNAS.slice(1).map((c) => `${c}=excluded.${c}`).join(',')},
    indexed_at=now(), actualizado_at=now()`

// ── Recorrido ────────────────────────────────────────────────────────────────
const stats = { insertados: 0, actualizados: 0, sinCambios: 0, errores: 0 }
const vistos = new Set()

/** Lo que ya está guardado, para poder decidir si cada fila cambió sin volver a escribirla. */
async function cargarEstado() {
  const { rows } = await pool.query(
    'select drive_file_id, hash, path, owner_email from public.drive_index')
  return new Map(rows.map((r) => [r.drive_file_id, { hash: r.hash, path: r.path, owner_email: r.owner_email }]))
}

async function guardar(fila, enBase) {
  vistos.add(fila.drive_file_id)
  const accion = decidirEscritura(fila, enBase)
  if (accion === 'omitir') { stats.sinCambios++; return }
  if (!DRY) await pool.query(SQL_UPSERT, COLUMNAS.map((c) => fila[c]))
  if (accion === 'insertar') stats.insertados++
  else stats.actualizados++
}

async function recorrer(id, path, depth, enBase) {
  if (depth > PROFUNDIDAD_MAX) return
  let hijos
  try {
    hijos = await listar(id)
  } catch (e) {
    // Una carpeta ilegible no puede tirar abajo la corrida entera, pero sí tiene que
    // bloquear el borrado: si no la pudimos leer, no sabemos qué hay adentro.
    stats.errores++
    console.error(`  ✗ no pude leer ${path}: ${e.message}`)
    return
  }
  for (const f of hijos) {
    const rutaHijo = `${path}/${f.name}`
    await guardar(filaIndice(f, { path: rutaHijo, depth, parentId: id }), enBase)
    if (f.mimeType === FOLDER) await recorrer(f.id, rutaHijo, depth + 1, enBase)
  }
}

// ── Borrado seguro ───────────────────────────────────────────────────────────
/** Sólo se evalúa lo que cuelga de las raíces recorridas: si mañana se saca una raíz de la
 *  configuración, sus filas quedan como estaban en vez de desaparecer sin que nadie lo pida. */
function idsBajoLasRaices(enBase, prefijos) {
  const salida = []
  for (const [id, v] of enBase) {
    const ruta = v.path ?? ''
    if (prefijos.some((pre) => ruta === pre || ruta.startsWith(`${pre}/`))) salida.push(id)
  }
  return salida
}

async function borrarDesaparecidos(enBase, prefijos) {
  const previos = idsBajoLasRaices(enBase, prefijos)
  const plan = planDeBorrado({ vistos, enBase: previos, corridaCompleta: true, errores: stats.errores })
  if (!plan.borrar.length) { console.log(`— borrado: ${plan.motivo}`); return 0 }
  if (DRY) { console.log(`— dry: borraría ${plan.borrar.length} fila(s) (${plan.motivo})`); return 0 }
  const { rowCount } = await pool.query(
    'delete from public.drive_index where drive_file_id = any($1::text[])', [plan.borrar])
  console.log(`✓ borradas ${rowCount} fila(s): ${plan.motivo}`)
  return rowCount
}

// ── Main ─────────────────────────────────────────────────────────────────────
const raices = raicesDesdeEnv(process.env)
console.log(`indexando ${raices.length} raíz/raíces${DRY ? ' (dry-run: no escribe)' : ''}…`)
const enBase = await cargarEstado()
const prefijos = []

for (const raiz of raices) {
  const meta = await metaRaiz(raiz.id)
  const rotulo = raiz.rotulo || meta.name
  prefijos.push(rotulo)
  console.log(`· ${rotulo} (${raiz.id})`)
  const carpeta = { ...meta, mimeType: meta.mimeType ?? FOLDER }
  await guardar(filaIndice(carpeta, { path: rotulo, depth: 0, parentId: null }), enBase)
  await recorrer(raiz.id, rotulo, 1, enBase)
}

const borradas = await borrarDesaparecidos(enBase, prefijos)
const tot = (await pool.query('select count(*)::int n from public.drive_index')).rows[0].n
console.log(
  `OK: ${vistos.size} vistos · ${stats.insertados} nuevos · ${stats.actualizados} actualizados · `
  + `${stats.sinCambios} sin cambios · ${borradas} borrados · ${stats.errores} errores. Total en tabla: ${tot}`)
await pool.end()
if (stats.errores) process.exitCode = 1
