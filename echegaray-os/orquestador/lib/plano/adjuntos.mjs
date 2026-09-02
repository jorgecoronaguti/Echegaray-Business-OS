// SUBIR PLANOS AL DRIVE DEL PROYECTO — SÓLO A PEDIDO EXPLÍCITO DEL DUEÑO. NUNCA AUTOMÁTICO.
//
// ═══ RETIRADO DEL FLUJO AUTOMÁTICO (dueño, 02/09/2026) ═══
//
// «no quiero que haga eso: ir a una carpeta y pegarle cosas por su cuenta». `plano.cotizar` YA NO
// llama a este módulo: los adjuntos entran al pipeline EN MEMORIA (`correr({adjuntos})`), con
// identidad por hash de contenido y bytes persistidos en `orq.xsas_adjunto` — la genealogía no
// necesita que el archivo esté en Drive. Escribir en el Drive del dueño es una acción externa
// sobre una fuente compartida: se ejecuta únicamente cuando él la pide con esas palabras.
// Este módulo queda como la capacidad para ESE pedido explícito, con su contrato probado.
//
// ═══ DÓNDE ATERRIZA ═══
//
// 1. Si el proyecto YA tiene carpeta en el índice, adentro de ella (la de path más corto que
//    matchea: la raíz del proyecto, no una subcarpeta accidental).
// 2. Si no la tiene, se crea «COTIZACIONES XSAS/<proyecto>» bajo la primera raíz indexada — el path
//    lleva el nombre del proyecto, así `documentosDelProyecto` lo encuentra por el mismo término.
//
// El upsert al índice es el MISMO contrato que verifica `drive-indice.pg.test.mjs`: si el índice
// cambiara de columnas, ese test y éste módulo fallan juntos.

import { filaIndice, raicesDesdeEnv } from '../drive-indice.mjs'

const COLUMNAS = ['drive_file_id', 'name', 'path', 'mime_type', 'is_folder', 'tipo', 'size_bytes',
  'modified_time', 'parent_id', 'depth', 'nombre_norm', 'path_norm', 'tokens', 'owner_email', 'hash']

const SQL_UPSERT = `insert into public.drive_index (${COLUMNAS.join(',')},indexed_at,actualizado_at)
  values (${COLUMNAS.map((_, i) => `$${i + 1}`).join(',')},now(),now())
  on conflict (drive_file_id) do update set
    ${COLUMNAS.slice(1).map((c) => `${c}=excluded.${c}`).join(',')},
    indexed_at=now(), actualizado_at=now()`

const MIME_POR_EXTENSION = Object.freeze({
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff',
})

export function mimeDeAdjunto(nombre) {
  const ext = String(nombre ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  return MIME_POR_EXTENSION[ext] ?? 'application/octet-stream'
}

/** Normaliza igual que `documentosDelProyecto`: sin tildes, minúsculas. PURA. */
function norma(t) {
  return String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * La carpeta raíz del proyecto en el índice: la de path MÁS CORTO que matchea el término.
 * Devuelve null si el proyecto no tiene carpeta todavía.
 */
export async function carpetaDelProyecto({ query }, proyecto) {
  const t = `%${norma(proyecto)}%`
  // La preferencia por «presupuesto» evita aterrizar en un matcheo accidental (la carpeta de
  // facturas o el legajo de un homónimo): si el proyecto tiene carpeta comercial, gana ésa.
  const r = await query(
    `select drive_file_id, name, path
       from public.drive_index
      where is_folder = true and (path_norm like $1 or nombre_norm like $1)
      order by (path_norm like '%presupuesto%') desc, length(path) asc
      limit 1`, [t])
  return r.rows[0] ?? null
}

/**
 * Sube los adjuntos al Drive del proyecto y los deja en `drive_index`, listos para el pipeline.
 *
 * @param {object} deps         { query, google }
 * @param {string} proyecto     término del proyecto (el mismo que consume el pipeline)
 * @param {Array}  archivos     [{ nombre, contenido_base64 | contenido }]
 * @returns {{ carpetaId, carpetaPath, subidos: [{ id, name }], errores: [string] }}
 */
export async function subirPlanosAlProyecto({ query, google }, proyecto, archivos = []) {
  const termino = String(proyecto ?? '').trim()
  if (!termino) throw new Error('subirPlanosAlProyecto: falta el proyecto')

  let carpeta = await carpetaDelProyecto({ query }, termino)
  if (!carpeta) {
    const raiz = raicesDesdeEnv()[0]
    const creada = await google.createFile({
      name: `COTIZACIONES XSAS - ${termino}`,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [raiz.id],
    })
    carpeta = { drive_file_id: creada.id, name: creada.name, path: `COTIZACIONES XSAS - ${termino}` }
    await query(SQL_UPSERT, COLUMNAS.map((c) => filaIndice(
      { id: creada.id, name: creada.name, mimeType: 'application/vnd.google-apps.folder', modifiedTime: new Date().toISOString(), owners: [] },
      { path: carpeta.path, depth: 1, parentId: raiz.id },
    )[c]))
  }

  const subidos = []
  const errores = []
  for (const a of archivos) {
    const nombre = String(a?.nombre ?? 'adjunto.pdf')
    const base64 = a?.contenido_base64
      ?? (typeof a?.contenido === 'string' ? Buffer.from(a.contenido, 'utf8').toString('base64') : null)
    if (!base64) { errores.push(`${nombre}: sin contenido`); continue }
    try {
      const s = await google.uploadFile(nombre, base64, mimeDeAdjunto(nombre), { parentId: carpeta.drive_file_id })
      const fila = filaIndice(
        {
          id: s.id, name: nombre, mimeType: mimeDeAdjunto(nombre),
          modifiedTime: new Date().toISOString(), owners: [],
          size: String(Buffer.byteLength(base64, 'base64')),
        },
        { path: `${carpeta.path}/${nombre}`, depth: (carpeta.path?.split('/').length ?? 1) + 1, parentId: carpeta.drive_file_id },
      )
      await query(SQL_UPSERT, COLUMNAS.map((c) => fila[c]))
      subidos.push({ id: s.id, name: nombre })
    } catch (e) {
      errores.push(`${nombre}: ${String(e?.message ?? e).slice(0, 120)}`)
    }
  }
  return { carpetaId: carpeta.drive_file_id, carpetaPath: carpeta.path, subidos, errores }
}
