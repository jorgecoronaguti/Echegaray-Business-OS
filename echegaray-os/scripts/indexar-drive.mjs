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
//  4. NO BORRA NADA (10/09/2026). Antes sacaba del catálogo lo que no veía, con un piso del
//     70%. Ese piso cubre el fallo grosero —quedarse sin token a mitad del recorrido— y no
//     el real: UNA carpeta que contesta 403 y doscientas filas buenas que desaparecen para
//     siempre. Ahora se MARCA `ausente_en_drive`, y sólo lo que faltó en una carpeta que se
//     pudo listar ENTERA (ver planDeAusencia). Es la disciplina que `legajos-sincronizar`
//     usa sobre los papeles de legajo desde el 19/08.
//
//  5. VE LA PAPELERA Y EL CONTENIDO. El listado ya no pide `trashed=false`: un archivo en la
//     papelera se indexa CON la marca, porque «está en la papelera» y «no está» son dos
//     hechos distintos y quien los mire decide distinto. Y guarda `md5`, la huella del
//     contenido que el `hash` de metadatos no puede dar.
//
// SÓLO LEE DE DRIVE. El scope es `drive.readonly` a propósito: este script no puede escribir
// en Google ni aunque tuviera un error. CERO IA: no hay una sola llamada a un modelo.
//
// Uso:  DATABASE_URL=... node scripts/indexar-drive.mjs [--dry]
import { GoogleAuth } from 'google-auth-library'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import pg from 'pg'
import { parseConnectionString } from '../orquestador/lib/db.mjs'
import { resolveKeyPath, MissingGoogleCredential } from '../orquestador/lib/google.mjs'
import {
  FOLDER, CAMPOS_DRIVE, PROFUNDIDAD_MAX,
  raicesDesdeEnv, filaIndice, decidirEscritura, planDeAusencia, porQueLaRaizNoSirve,
} from '../orquestador/lib/drive-indice.mjs'

const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run')
const T0 = Date.now()

/** La base todavía no tiene las columnas de 20260910T1930. Sólo se tolera en seco. */
let MODO_COMPAT = false

// ── Qué código es este ───────────────────────────────────────────────────────
// El commit va en la primera línea del log. Cuando una corrida sale rara, la primera
// pregunta es "¿qué versión corrió?", y responderla mirando el journal es más barato que
// deducirla del árbol en el que alguien cree que está parado.
function commitDelCodigo() {
  try {
    return execFileSync('git', ['-C', new URL('..', import.meta.url).pathname, 'rev-parse', '--short', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch { return '(sin git)' }
}

// ── Lo que necesita para arrancar ────────────────────────────────────────────
// Falla CLARO y antes de tocar nada. Sin esto, un EnvironmentFile mal cargado se manifestaba
// como un error de conexión doscientas líneas más abajo.
if (!process.env.DATABASE_URL) {
  console.error('falta DATABASE_URL: el indexador no sabe a qué base escribir')
  process.exit(2)
}

// ── Drive (sólo lectura) ─────────────────────────────────────────────────────
//
// LA CREDENCIAL SE RESUELVE POR EL MECANISMO DEL OS, NO POR EL DIRECTORIO DE TRABAJO.
//
// Acá decía `keyFile: 'scripts/google_workspace/credentials/service-account.json'` — una
// ruta RELATIVA al cwd. Eso ataba la indexación al árbol desde el que se la lanzara, y como
// ese archivo está gitignoreado, el único árbol donde existía era el personal del dueño. La
// consecuencia no era un error: era que el timer corriera el código de una rama de trabajo,
// en silencio, durante meses. `resolveKeyPath` es la resolución que ya usa todo el resto del
// OS (GOOGLE_SA_KEY_PATH primero, y ~/.config/echegaray-orq/google-sa.json como último
// candidato): reutilizarla deja UNA sola definición de dónde vive la credencial.
const keyFile = resolveKeyPath(null)
if (!fs.existsSync(keyFile)) throw new MissingGoogleCredential(keyFile)
console.log(`indexar-drive ${commitDelCodigo()} · credencial ${keyFile}`)

const auth = new GoogleAuth({
  keyFile,
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
      // SIN `trashed=false`: la papelera se indexa con su marca. Filtrarla acá la volvía
      // indistinguible de una desaparición, que es justo lo que el plan de ausencia tiene
      // que poder diferenciar.
      q: `'${id}' in parents`,
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
  url.searchParams.set('fields', 'id,name,mimeType,modifiedTime,owners(emailAddress),trashed,md5Checksum,webViewLink')
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

// ── Qué columnas existen de verdad ───────────────────────────────────────────
//
// UNA MIGRACIÓN EN EL REPO NO ES UNA MIGRACIÓN APLICADA. Este script y
// `20260910T1930_drive_index_ausente_md5.sql` se despliegan por caminos distintos, y el
// orden entre los dos no está garantizado. Sin esta comprobación, el primer upsert contra la
// base vieja falla con «column md5 does not exist» a mitad del recorrido y deja el catálogo
// como quedó.
//
// Sin la migración: en seco AVISA y sigue en modo compatibilidad (los números del dry son
// igual de válidos: se calculan de lo que Drive contestó); escribiendo, ABORTA. Un catálogo
// escrito a medias es peor que una corrida que no corrió.
const COLUMNAS_NUEVAS = ['md5', 'web_view_link', 'trashed', 'ausente_en_drive', 'ausente_desde', 'origen']

async function columnasFaltantes(pool) {
  const { rows } = await pool.query(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='drive_index' and column_name = any($1::text[])`,
    [COLUMNAS_NUEVAS])
  const hay = new Set(rows.map((r) => r.column_name))
  return COLUMNAS_NUEVAS.filter((c) => !hay.has(c))
}

const COLUMNAS_BASE = ['drive_file_id', 'name', 'path', 'mime_type', 'is_folder', 'tipo', 'size_bytes',
  'modified_time', 'parent_id', 'depth', 'nombre_norm', 'path_norm', 'tokens', 'owner_email', 'hash']

// `origen` NO se escribe a propósito, ni siquiera con su valor por defecto: desde H3 la app
// va a indexar lo que ella misma sube con `origen='app'`, y un `excluded.origen` en el
// on-conflict lo pisaría con 'drive' en la primera corrida del timer.
const COLUMNAS_CONTENIDO = ['md5', 'web_view_link', 'trashed']

// ── Recorrido ────────────────────────────────────────────────────────────────
const stats = { insertados: 0, actualizados: 0, sinCambios: 0, errores: 0, enPapelera: 0, sinMd5: 0, sinMd5NoNativo: 0 }
const vistos = new Set()
/** Las carpetas que se listaron ENTERAS y sin error en esta corrida. Es la única evidencia
 *  que habilita a decir «este archivo ya no está»: de una carpeta que no se pudo leer no se
 *  afirma nada. Se llena únicamente cuando `listar` devolvió, con toda su paginación hecha. */
const carpetasEnteras = new Set()

/** Lo que ya está guardado: para decidir si cada fila cambió sin volver a escribirla, y para
 *  el plan de ausencia, que necesita de qué carpeta cuelga cada fila y si ya estaba marcada. */
async function cargarEstado() {
  const extra = MODO_COMPAT ? '' : ', md5, trashed, ausente_en_drive'
  const { rows } = await pool.query(
    `select drive_file_id, hash, path, owner_email, parent_id${extra} from public.drive_index`)
  return new Map(rows.map((r) => [r.drive_file_id, {
    hash: r.hash, path: r.path, owner_email: r.owner_email, parent_id: r.parent_id,
    md5: r.md5 ?? null, trashed: r.trashed, ausente_en_drive: r.ausente_en_drive === true,
  }]))
}

async function guardar(fila, enBase) {
  vistos.add(fila.drive_file_id)
  if (fila.trashed) stats.enPapelera++
  // Un Doc/Sheet/Slide nativo NO tiene bytes propios y Drive no le da checksum: su md5 en
  // null es lo esperado. Un BINARIO sin md5 sí es una señal —Drive no lo informó— y por eso
  // se cuentan por separado: mezclarlos convertiría 1.500 «normales» en una falsa alarma.
  if (!fila.is_folder && !fila.md5) {
    stats.sinMd5++
    if (!fila.mime_type.startsWith('application/vnd.google-apps')) stats.sinMd5NoNativo++
  }
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
  carpetasEnteras.add(id)
  for (const f of hijos) {
    const rutaHijo = `${path}/${f.name}`
    await guardar(filaIndice(f, { path: rutaHijo, depth, parentId: id }), enBase)
    // NO se entra a una carpeta que está en la papelera. Se la indexa con su marca —existe y
    // se sabe dónde está—, pero recorrerla arrastraría la papelera entera al catálogo y la
    // pondría en los resultados de búsqueda. Sus hijos, al no haberse listado su carpeta,
    // quedan intactos: ni marcados ausentes ni revividos.
    if (f.mimeType === FOLDER && f.trashed !== true) await recorrer(f.id, rutaHijo, depth + 1, enBase)
  }
}

// ── La ausencia, que reemplazó al borrado ────────────────────────────────────
//
// Ya no hace falta recortar por prefijo de ruta («sólo lo que cuelga de las raíces
// recorridas»): la condición es más fuerte y más simple. Sólo se marca lo que faltó en una
// carpeta que ESTA corrida listó entera, así que una raíz que se sacó de la configuración, o
// una carpeta que devolvió 403, no puede producir una sola marca. El recorte por `path` era
// un proxy de eso; el `parent_id` es la cosa misma.
async function marcarAusencias(enBase) {
  const indiceActual = [...enBase].map(([drive_file_id, v]) => ({
    drive_file_id, parent_id: v.parent_id, ausente_en_drive: v.ausente_en_drive,
  }))
  const plan = planDeAusencia({ indiceActual, vistos, carpetasListadasEnteras: carpetasEnteras })
  if (DRY) {
    console.log(`— dry: marcaría ${plan.marcar.length} ausente(s) · reviviría ${plan.revivir.length} · `
      + `${plan.intactas} sin novedad`)
    if (plan.marcar.length) console.log(`  primeros: ${plan.marcar.slice(0, 5).join(', ')}`)
    console.log(`— dry: ${stats.sinMd5} archivo(s) quedarían sin md5 `
      + `(${stats.sinMd5NoNativo} de ellos no son formatos nativos de Google)`)
    // DE QUÉ NO SE PUDO AFIRMAR NADA, Y DÓNDE. Un «132 sin novedad» a secas es un número que
    // no se puede auditar: puede ser sano (carpetas fuera de las raíces) o ser el síntoma de
    // que el plan nunca va a poder marcar nada. Se muestran las carpetas padre involucradas.
    const porPadre = new Map()
    for (const [id, v] of enBase) {
      if (vistos.has(id) || !v.parent_id || carpetasEnteras.has(v.parent_id)) continue
      const padre = enBase.get(v.parent_id)?.path ?? `(padre ${v.parent_id} no está en el índice)`
      porPadre.set(padre, (porPadre.get(padre) ?? 0) + 1)
    }
    for (const [padre, n] of [...porPadre].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`    · ${n} bajo «${padre}» — esa carpeta no se listó entera en esta corrida`)
    }
    return { marcadas: 0, revividas: 0 }
  }
  let marcadas = 0
  let revividas = 0
  if (plan.marcar.length) {
    // `ausente_desde` sólo se fija donde todavía es null: la fecha es «desde cuándo falta»,
    // y pisarla en cada corrida la volvería «hace seis horas» para siempre.
    const r = await pool.query(
      `update public.drive_index
          set ausente_en_drive = true,
              ausente_desde = coalesce(ausente_desde, now()),
              actualizado_at = now()
        where drive_file_id = any($1::text[])`, [plan.marcar])
    marcadas = r.rowCount
  }
  if (plan.revivir.length) {
    const r = await pool.query(
      `update public.drive_index
          set ausente_en_drive = false, ausente_desde = null, actualizado_at = now()
        where drive_file_id = any($1::text[])`, [plan.revivir])
    revividas = r.rowCount
  }
  console.log(`✓ ${marcadas} marcada(s) ausente(s) · ${revividas} revivida(s). ${plan.motivo}`)
  return { marcadas, revividas }
}

// ── Un solo indexador a la vez ───────────────────────────────────────────────
//
// El timer no puede solaparse consigo mismo (systemd no arranca dos veces un `oneshot` que
// sigue corriendo), pero eso no cubre lo que de verdad pasa: alguien corre el indexador a
// mano mientras el timer está adentro. Dos recorridos concurrentes compiten por las mismas
// filas y, peor, cada uno ve un conjunto PARCIAL de lo visitado por el otro — que es
// exactamente la entrada del borrado. El lock es de la base, no del filesystem, así que
// también protege si alguna vez esto corre desde otra máquina.
const LOCK = 4_198_231_007   // arbitrario y fijo: identifica a "indexar-drive"

// El lock se toma sobre un cliente PROPIO y ese cliente no se devuelve al pool hasta el
// final. Un advisory lock vive en la SESIÓN: pedido con `pool.query` podría tomarse en una
// conexión y liberarse en otra —o soltarse solo al reciclarse la conexión— y entonces el
// candado no candaría nada. Es la clase de guarda que parece funcionar hasta el día que
// importa.
const clienteLock = await pool.connect()
const { rows: [lock] } = await clienteLock.query('select pg_try_advisory_lock($1) as tomado', [LOCK])
if (!lock.tomado) {
  console.error('ya hay una indexación en curso: esta corrida no hace nada')
  clienteLock.release()
  await pool.end()
  process.exit(0)
}

// ── Main ─────────────────────────────────────────────────────────────────────
const faltan = await columnasFaltantes(pool)
if (faltan.length && !DRY) {
  console.error(`la migración 20260910T1930_drive_index_ausente_md5.sql NO está aplicada `
    + `(faltan: ${faltan.join(', ')}). No escribo un catálogo a medias.`)
  await clienteLock.query('select pg_advisory_unlock($1)', [LOCK])
  clienteLock.release()
  await pool.end()
  process.exit(2)
}
MODO_COMPAT = faltan.length > 0
if (faltan.length) {
  console.warn(`⚠ modo compatibilidad: faltan ${faltan.join(', ')} — los números de abajo salen `
    + 'de lo que contestó Drive, pero esta corrida no podría escribirlas.')
}
const COLUMNAS = MODO_COMPAT ? COLUMNAS_BASE : [...COLUMNAS_BASE, ...COLUMNAS_CONTENIDO]
const SQL_UPSERT = `insert into public.drive_index (${COLUMNAS.join(',')},indexed_at,actualizado_at)
  values (${COLUMNAS.map((_, i) => `$${i + 1}`).join(',')},now(),now())
  on conflict (drive_file_id) do update set
    ${COLUMNAS.slice(1).map((c) => `${c}=excluded.${c}`).join(',')},
    indexed_at=now(), actualizado_at=now()`

const raices = raicesDesdeEnv(process.env)
console.log(`indexando ${raices.length} raíz/raíces${DRY ? ' (dry-run: no escribe)' : ''}…`)
const enBase = await cargarEstado()

for (const raiz of raices) {
  const meta = await metaRaiz(raiz.id)
  // UNA RAÍZ EN LA PAPELERA SE LEE VACÍA Y SIN ERROR, y con el plan de ausencia eso ya no es
  // «no pasó nada»: sería marcar ausente el data room entero. Se corta acá, con el motivo.
  const mal = porQueLaRaizNoSirve(meta)
  if (mal) {
    throw new Error(`la raíz ${raiz.rotulo ?? ''} (${raiz.id}) ${mal}. `
      + 'No indexo: una corrida sobre una raíz así produce ausencias falsas, no un catálogo.')
  }
  const rotulo = raiz.rotulo || meta.name
  console.log(`· ${rotulo} (${raiz.id})`)
  const carpeta = { ...meta, mimeType: meta.mimeType ?? FOLDER }
  await guardar(filaIndice(carpeta, { path: rotulo, depth: 0, parentId: null }), enBase)
  await recorrer(raiz.id, rotulo, 1, enBase)
}

const { marcadas, revividas } = await marcarAusencias(enBase)

// ═══ Y SE REHACE EL REPARTO DE PAPELES POR OBRA ═══
//
// `public.obra_papel` es el cruce ya resuelto entre estos archivos y las obras (20260911T2300). El
// índice acaba de cambiar: si no se refresca acá, la ficha del cliente muestra el reparto de hace
// seis horas —un archivo subido hoy no existe para la pantalla— y nadie se entera, porque una lista
// desactualizada se ve igual que una lista correcta.
const { rows: [{ f: hayRefresco }] } = await pool.query(
  `select to_regprocedure('public.refrescar_obra_papel()') f`)
if (hayRefresco) {
  const { rows: [{ n }] } = await pool.query('select public.refrescar_obra_papel() n')
  console.log(`· papeles por obra refrescados: ${n}`)
}
const tot = (await pool.query('select count(*)::int n from public.drive_index')).rows[0].n
const seg = ((Date.now() - T0) / 1000).toFixed(1)
console.log(
  `OK: ${vistos.size} vistos · ${stats.insertados} nuevos · ${stats.actualizados} actualizados · `
  + `${stats.sinCambios} sin cambios · ${marcadas} ausentes · ${revividas} revividos · `
  + `${stats.enPapelera} en papelera · ${stats.sinMd5} archivos sin md5 `
  + `(${stats.sinMd5NoNativo} de ellos NO son nativos de Google) · `
  + `${stats.errores} errores · ${seg}s. Total en tabla: ${tot}`)
await clienteLock.query('select pg_advisory_unlock($1)', [LOCK])
clienteLock.release()
await pool.end()
if (stats.errores) process.exitCode = 1
