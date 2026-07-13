// Indexa TODOS los archivos de la carpeta administracion de Drive a public.drive_index.
// Recorre recursivamente con el service account y hace upsert. Idempotente: re-correr
// actualiza. Uso: DATABASE_URL=... node scripts/indexar-drive.mjs
import { GoogleAuth } from 'google-auth-library'
import pg from 'pg'
import { parseConnectionString } from '../orquestador/lib/db.mjs'

const ROOT = '1a_3sIbioAQm0EcuJTbu3L6q_hy_LHUXs' // administracion
const FOLDER = 'application/vnd.google-apps.folder'
const tipoLegible = (m) =>
  m === FOLDER ? 'carpeta' : m.includes('spreadsheet') || m.includes('excel') ? 'planilla' : m.includes('document') || m.includes('word') ? 'documento' : m.includes('pdf') ? 'pdf' : m.includes('image') ? 'imagen' : 'archivo'

const auth = new GoogleAuth({ keyFile: 'scripts/google_workspace/credentials/service-account.json', scopes: ['https://www.googleapis.com/auth/drive.readonly'] })
const token = (await (await auth.getClient()).getAccessToken()).token
async function drive(params) {
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 150)}`)
  return r.json()
}
async function listAll(id) {
  const out = []; let pt
  do {
    const res = await drive({ q: `'${id}' in parents and trashed=false`, fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)', pageSize: '500', orderBy: 'folder,name', ...(pt ? { pageToken: pt } : {}) })
    out.push(...(res.files || [])); pt = res.nextPageToken
  } while (pt)
  return out
}

const p = parseConnectionString(process.env.DATABASE_URL)
const pool = new pg.Pool({ host: p.host, port: p.port, user: p.user, password: p.password, database: p.database, ssl: { rejectUnauthorized: false }, max: 4 })

let count = 0
async function upsert(f, path, depth) {
  const isFolder = f.mimeType === FOLDER
  await pool.query(
    `insert into public.drive_index (drive_file_id,name,path,mime_type,is_folder,tipo,size_bytes,modified_time,parent_id,depth,indexed_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
     on conflict (drive_file_id) do update set name=excluded.name,path=excluded.path,mime_type=excluded.mime_type,
       is_folder=excluded.is_folder,tipo=excluded.tipo,size_bytes=excluded.size_bytes,modified_time=excluded.modified_time,
       parent_id=excluded.parent_id,depth=excluded.depth,indexed_at=now()`,
    [f.id, f.name, path, f.mimeType, isFolder, tipoLegible(f.mimeType), f.size ? Number(f.size) : null, f.modifiedTime ?? null, f.parentId ?? null, depth],
  )
  count++
}
async function walk(id, path, depth) {
  if (depth > 7) return
  const kids = await listAll(id)
  for (const f of kids) {
    f.parentId = id
    const childPath = `${path}/${f.name}`
    await upsert(f, childPath, depth)
    if (f.mimeType === FOLDER) await walk(f.id, childPath, depth + 1)
  }
}

console.log('indexando administracion…')
await pool.query(`insert into public.drive_index (drive_file_id,name,path,mime_type,is_folder,tipo,depth,indexed_at)
  values ($1,'administracion','administracion',$2,true,'carpeta',0,now()) on conflict (drive_file_id) do update set indexed_at=now()`, [ROOT, FOLDER])
await walk(ROOT, 'administracion', 1)
const tot = (await pool.query('select count(*)::int n from public.drive_index')).rows[0].n
console.log(`OK: ${count} archivos/carpetas indexados. Total en tabla: ${tot}`)
await pool.end()
