#!/usr/bin/env node
// SONDA DE LOS DOCUMENTOS DE PROVEEDOR — prueba el circuito completo contra la base VIVA.
//
//   node orquestador/scripts/proveedor-documentos-sonda.mjs --escribir
//
// ═══ POR QUÉ EXISTE ═══
//
// Lo que esta feature promete no se puede probar con `node --test`: que la policy del bucket niegue
// la subida a quien no es Administración, que la URL firmada devuelva 200 con los bytes que se
// subieron y que la baja lógica no borre el objeto son hechos del sistema vivo. Un test unitario
// sobre las reglas puras —que existe, `documentosProveedor.test.ts`— no dice nada de eso.
//
// Y existe además porque NINGÚN TRABAJO LO CIERRA QUIEN LO CONSTRUYÓ: quien tenga que firmar el
// cierre necesita poder volver a producir la evidencia, no leer la captura de otro.
//
// ═══ QUÉ ESCRIBE Y QUÉ BORRA ═══
//
// Crea dos proveedores marcados `es_prueba`, un usuario de prueba con rol `campo`, un objeto en el
// bucket y su fila; al terminar borra TODO y lo verifica contando. Corre contra la base a la que
// apunte `DATABASE_URL`. Por eso pide `--escribir` explícito: sin la bandera no toca nada.
//
// NO TOCA EL SHEET, no llama a ningún modelo y no manda nada hacia afuera.
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { APP_DIR } from '../lib/config.mjs'
import { getPool } from '../lib/db.mjs'
import { loadEnvLocalInto } from '../../scripts/lib/env-file.mjs'

// `config.mjs` hidrata `.env.local` del checkout donde corre. UN WORKTREE NO TIENE `.env.local`
// —no se versiona—, así que la sonda arrancaba con `supabaseUrl is required` sin decir por qué. Se
// admite señalarlo con `SONDA_ENV_FILE`, que es exactamente el caso de quien audita desde un
// worktree.
loadEnvLocalInto(process.env, process.env.SONDA_ENV_FILE ?? path.join(APP_DIR, '.env.local'))

const BUCKET = 'proveedores-documentos'
const CUIT_A = '30999999997'
const CUIT_B = '30999999998'
// La cuenta de prueba del OS (la misma que usa `scripts/perf/medir-carga.mjs`). Rol `direccion`.
const EMAIL = process.env.SONDA_EMAIL ?? 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASS = process.env.SONDA_PASS ?? 'TestPassword123!'

if (!process.argv.includes('--escribir')) {
  console.log('Esta sonda ESCRIBE en la base viva (y limpia al final). Corrala con --escribir.')
  process.exit(0)
}

let fallas = 0
const chequear = (t, ok, extra = '') => {
  if (!ok) fallas++
  console.log(`${ok ? '✓' : '✗'} ${t}${extra ? ' — ' + extra : ''}`)
}

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!URL_SB || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY. Desde un worktree: SONDA_ENV_FILE=<ruta a .env.local del checkout principal>.')
  process.exit(1)
}

const pool = getPool()
const admin = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = () => createClient(URL_SB, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

const nuevoProveedor = async (nombre, cuit) => (await pool.query(
  `insert into public.proveedores (nombre, cuit, activo, es_prueba) values ($1, $2, true, true) returning id`,
  [nombre, cuit],
)).rows[0].id

const provId = await nuevoProveedor('PRUEBA DOCUMENTOS (borrar)', CUIT_A)
const otroProvId = await nuevoProveedor('PRUEBA DOCUMENTOS 2 (borrar)', CUIT_B)

const sb = anon()
const entrada = await sb.auth.signInWithPassword({ email: EMAIL, password: PASS })
if (entrada.error) { console.error('no pude entrar:', entrada.error.message); process.exit(1) }
const uid = entrada.data.user.id

const docId = crypto.randomUUID()
const ruta = `${uid}/${provId}/${docId}.txt`
const contenido = new Blob([`contrato de prueba ${docId}\n`], { type: 'text/plain' })
const bytes = contenido.size

const subida = await sb.storage.from(BUCKET).upload(ruta, contenido, { contentType: 'text/plain', upsert: false })
chequear('subida al bucket', !subida.error, subida.error?.message ?? ruta)

const alta = await sb.from('proveedor_documento').insert({
  proveedor_id: provId, storage_path: ruta, nombre_archivo: 'Contrato de prueba.txt',
  tipo_mime: 'text/plain', tamano_bytes: bytes, categoria: 'contrato',
  descripcion: 'sonda', subido_por: uid,
}).select('id').single()
chequear('alta de la fila', !alta.error, alta.error?.message ?? alta.data?.id)

// ── LEER EL EFECTO, NO LA RESPUESTA. Un 204 de PostgREST no prueba una escritura. ───────────────
const fila = await pool.query('select id from public.proveedor_documento where storage_path = $1', [ruta])
chequear('la fila está en proveedor_documento', fila.rows.length === 1)
const obj = await pool.query(
  "select metadata->>'size' as size from storage.objects where bucket_id = $1 and name = $2", [BUCKET, ruta],
)
chequear('el objeto está en storage.objects con su tamaño', Number(obj.rows[0]?.size) === bytes,
  `${obj.rows[0]?.size} vs ${bytes}`)

const firma = await sb.storage.from(BUCKET).createSignedUrl(ruta, 600, { download: 'Contrato de prueba.txt' })
chequear('URL firmada', !firma.error && !!firma.data?.signedUrl, firma.error?.message)
if (firma.data?.signedUrl) {
  const r = await fetch(firma.data.signedUrl)
  const cuerpo = await r.arrayBuffer()
  chequear('HTTP 200 al bajar', r.status === 200, String(r.status))
  chequear('los bytes bajados son los subidos', cuerpo.byteLength === bytes, `${cuerpo.byteLength} vs ${bytes}`)
  // El bucket acepta cualquier tipo: si la firma sirviera inline, un .html subido por error se
  // renderizaría en el origen de Storage.
  chequear('la bajada es descarga, no render', /attachment/i.test(r.headers.get('content-disposition') ?? ''),
    r.headers.get('content-disposition') ?? 'sin header')
}

const ariete = await sb.from('proveedor_documento').insert({
  proveedor_id: otroProvId, storage_path: ruta, nombre_archivo: 'robado.txt',
  tipo_mime: 'text/plain', tamano_bytes: bytes, categoria: 'contrato', subido_por: uid,
})
chequear('la policy rebota el path de otro proveedor', !!ariete.error, ariete.error?.message ?? 'ENTRÓ (mal)')

// ── EL NEGATIVO: alguien sin rol de Administración ──────────────────────────────────────────────
const mailCampo = `jorge.o.corona+campo-doc-${Date.now()}@gmail.com`
const creado = await admin.auth.admin.createUser({ email: mailCampo, password: PASS, email_confirm: true })
const uidCampo = creado.data?.user?.id
await pool.query(
  `insert into public.perfiles (id, nombre, rol, es_prueba) values ($1, 'Prueba campo (borrar)', 'campo', true)
   on conflict (id) do update set rol = 'campo'`, [uidCampo],
)
const sbCampo = anon()
const entradaCampo = await sbCampo.auth.signInWithPassword({ email: mailCampo, password: PASS })
chequear('el usuario de campo entró', !entradaCampo.error, entradaCampo.error?.message)

// SIN ESTE CONTROL, EL «0 FILAS» DE ABAJO SERÍA UNA CONSTANTE: una tabla vacía se lee igual que una
// policy que niega.
const leeDireccion = await sb.from('proveedor_documento').select('id').eq('id', alta.data.id)
chequear('dirección SÍ lee la fila', (leeDireccion.data ?? []).length === 1)

const leeCampo = await sbCampo.from('proveedor_documento').select('id')
chequear('campo NO lee ningún documento', (leeCampo.data ?? []).length === 0, `${(leeCampo.data ?? []).length} filas`)

const subeCampo = await sbCampo.storage.from(BUCKET).upload(
  `${uidCampo}/${provId}/${crypto.randomUUID()}.txt`, new Blob(['no'], { type: 'text/plain' }),
  { contentType: 'text/plain' },
)
chequear('campo NO puede subir al bucket', !!subeCampo.error, subeCampo.error?.message ?? 'SUBIÓ (mal)')

const insertaCampo = await sbCampo.from('proveedor_documento').insert({
  proveedor_id: provId, storage_path: `${uidCampo}/${provId}/x.txt`, nombre_archivo: 'x.txt',
  tipo_mime: 'text/plain', tamano_bytes: 2, categoria: 'otro', subido_por: uidCampo,
})
chequear('campo NO puede registrar una fila', !!insertaCampo.error, insertaCampo.error?.message ?? 'ENTRÓ (mal)')

const firmaCampo = await sbCampo.storage.from(BUCKET).createSignedUrl(ruta, 60)
chequear('campo NO puede firmar el archivo de otro', !!firmaCampo.error, firmaCampo.error?.message ?? 'FIRMÓ (mal)')

// ── LA BAJA ES LÓGICA Y NO SE REVIERTE ──────────────────────────────────────────────────────────
const baja = await sb.from('proveedor_documento').update({
  eliminado_en: new Date().toISOString(), eliminado_por: uid,
}).eq('id', alta.data.id).is('eliminado_en', null).select('id').maybeSingle()
chequear('la baja lógica se escribió', !baja.error && !!baja.data, baja.error?.message ?? '')
const trasBaja = await pool.query('select eliminado_en from public.proveedor_documento where id = $1', [alta.data.id])
chequear('la fila quedó marcada en la base', !!trasBaja.rows[0]?.eliminado_en)
const objVivo = await pool.query('select name from storage.objects where bucket_id = $1 and name = $2', [BUCKET, ruta])
chequear('el objeto SIGUE en el bucket', objVivo.rows.length === 1)

const resucita = await sb.from('proveedor_documento').update({ eliminado_en: null, eliminado_por: null })
  .eq('id', alta.data.id).select('id')
chequear('no se puede resucitar desde la web', !!resucita.error || (resucita.data ?? []).length === 0)

const pisar = await sb.from('proveedor_documento').update({ storage_path: 'otra/ruta/x.txt' }).eq('id', alta.data.id)
chequear('no se puede reescribir el storage_path', !!pisar.error, pisar.error?.message ?? 'ESCRIBIÓ (mal)')

// ── LIMPIEZA, Y SE VERIFICA CONTANDO ────────────────────────────────────────────────────────────
await admin.storage.from(BUCKET).remove([ruta])
await pool.query('delete from public.proveedor_documento where storage_path = $1', [ruta])
await pool.query('delete from public.proveedores where id = any($1)', [[provId, otroProvId]])
await pool.query('delete from public.perfiles where id = $1', [uidCampo])
if (uidCampo) await admin.auth.admin.deleteUser(uidCampo)
const quedo = await pool.query(
  `select (select count(*) from public.proveedores where nombre like 'PRUEBA DOCUMENTOS%') provs,
          (select count(*) from public.proveedor_documento where descripcion = 'sonda') docs,
          (select count(*) from storage.objects where bucket_id = $1 and name = $2) objs`, [BUCKET, ruta],
)
const limpio = Object.values(quedo.rows[0]).every((n) => Number(n) === 0)
chequear('la sonda no dejó nada atrás', limpio, JSON.stringify(quedo.rows[0]))

await pool.end()
console.log(fallas ? `\n${fallas} CONTROLES EN ROJO` : '\nTODOS LOS CONTROLES EN VERDE')
process.exit(fallas ? 1 : 0)
