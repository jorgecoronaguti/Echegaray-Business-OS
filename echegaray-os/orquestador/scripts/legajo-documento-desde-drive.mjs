#!/usr/bin/env node
// UN PAPEL QUE YA ESTÁ EN DRIVE ENTRA AL LEGAJO DEL OS.
//
// El dueño (16/09/2026) subió dos certificados de licencia a la carpeta de Drive de la persona
// porque el legajo no tenía por dónde recibirlos. Este script los trae al OS: dado un file id de
// Drive, copia los bytes al bucket privado `documentos-legajo` y crea la fila en
// `entidad_documento` (tipo persona), ya `copiado` y apuntando al file id de origen.
//
//   node orquestador/scripts/legajo-documento-desde-drive.mjs \
//     --file <driveFileId> --persona <uuid> --como jorge@ecsas.com.ar \
//     [--categoria certificado_medico] [--desde 2026-09-08 --hasta 2026-09-12] [--fecha AAAA-MM-DD] \
//     [--notas "…"] [--aplicar]
//
// ENSAYO POR DEFECTO. Sin `--aplicar` lee Drive y la base, imprime el plan y no escribe nada.
// DRIVE ES SÓLO LECTURA: no mueve, no renombra, no borra. Las reglas puras viven en
// `lib/legajo-documento-drive.mjs` y tienen test; acá va lo que toca la red.
//
// LA EVIDENCIA ES DEL EFECTO: con `--aplicar` el cierre es la fila LEÍDA de vuelta y el objeto
// LEÍDO del bucket, no el «ok» del insert.

import path from 'node:path'
import { makeGoogleClient } from '../lib/google.mjs'
import { closePool, query } from '../lib/db.mjs'
import { APP_DIR } from '../lib/config.mjs'
import { bajarDeStorage, subirAStorage } from '../lib/storage-supabase.mjs'
import { loadEnvLocalInto } from '../../scripts/lib/env-file.mjs'
import {
  BUCKET, filaDeEntidadDocumento, leerArgs, md5De, revisarArchivo, revisarPedido, rutaDeObjeto,
} from '../lib/legajo-documento-drive.mjs'

loadEnvLocalInto(process.env, process.env.ORQ_ENV_FILE ?? path.join(APP_DIR, '.env.local'))

const MOTIVOS_CON_CERTIFICADO = ['enfermedad', 'accidente', 'accidente_in_itinere']

function salir(msg, codigo = 1) {
  console.error(msg)
  process.exitCode = codigo
}

async function main() {
  const args = leerArgs(process.argv.slice(2))
  const APLICAR = args.aplicar === true
  const pedido = revisarPedido(args)
  if (!pedido.ok) return salir(`No corro:\n  · ${pedido.errores.join('\n  · ')}`)
  const p = pedido.pedido

  // ── Quién firma y de quién es el legajo ─────────────────────────────────
  const { rows: usuarios } = await query('select id from auth.users where lower(email) = lower($1) limit 1', [p.como])
  if (!usuarios[0]) return salir(`No hay usuario con email ${p.como}: --como tiene que ser una cuenta del OS.`)
  const uid = usuarios[0].id
  const { rows: personas } = await query('select id, nombre, drive_folder_id from public.personas where id = $1', [p.persona])
  if (!personas[0]) return salir(`No existe la persona ${p.persona}.`)
  const persona = personas[0]

  // ── El archivo en Drive (sólo lectura) ─────────────────────────────────
  const google = makeGoogleClient({})
  const meta = await google.getMeta(p.file)
  const archivo = revisarArchivo(meta)
  if (!archivo.ok) return salir(`El archivo no entra: ${archivo.error}`)
  const enSuCarpeta = persona.drive_folder_id && (meta.parents ?? []).includes(persona.drive_folder_id)
  // LOS BYTES SE BAJAN TAMBIÉN EN ENSAYO: es lectura, pesan como mucho 25 MB, y la huella es lo
  // único que permite decir «este papel ya está» sin confiar en el nombre del archivo.
  const bytes = await google.descargarBytes(p.file)
  const md5 = md5De(bytes)
  if (bytes.length !== archivo.bytes) return salir(`Drive dice ${archivo.bytes} bytes y bajaron ${bytes.length}: no escribo.`)

  // ── ¿Ya está? Por file id o por huella: el mismo papel dos veces es una sola cosa ──
  const { rows: previas } = await query(
    `select id, nombre_archivo, storage_path, md5 from public.entidad_documento
      where entidad_tipo = 'persona' and entidad_id = $1 and eliminado_en is null
        and (drive_file_id = $2 or md5 = $3)`,
    [p.persona, p.file, md5],
  )

  // ── Cobertura: los días de licencia declarada que el certificado respalda ──
  let cobertura = null
  if (p.desde && p.hasta) {
    const { rows } = await query(
      `select fecha::text, motivo from public.asistencia_dia
        where persona_id = $1 and estado = 'licencia' and fecha between $2 and $3 and motivo = any($4)
        order by fecha`,
      [p.persona, p.desde, p.hasta, MOTIVOS_CON_CERTIFICADO],
    )
    cobertura = rows.map((r) => r.fecha)
  }

  const ruta = rutaDeObjeto({ uid, personaId: p.persona, extension: archivo.extension })
  console.log(`${APLICAR ? 'APLICAR' : 'ENSAYO'} · ${persona.nombre} (${p.persona})`)
  console.log(`  archivo   ${meta.name} · ${meta.mimeType} · ${(archivo.bytes / 1024).toFixed(0)} kB · md5 ${md5}`)
  console.log(`  en Drive  ${enSuCarpeta ? 'en la carpeta del legajo' : 'FUERA de la carpeta del legajo (se copia igual, se avisa)'}`)
  console.log(`  categoría ${p.categoria}${p.desde ? ` · ${p.desde} → ${p.hasta}` : ''}${p.fecha ? ` · fecha del papel ${p.fecha}` : ''}`)
  if (cobertura) console.log(`  cubre     ${cobertura.length} día(s) de licencia declarada${cobertura.length ? `: ${cobertura.join(', ')}` : ' — el jefe no marcó la licencia en ese rango'}`)
  console.log(`  destino   ${BUCKET}/${ruta} · firma ${p.como}`)
  if (previas.length) {
    console.log(`  YA ESTÁ   ${previas.map((x) => `${x.nombre_archivo} (${x.id})`).join(' · ')} — no se duplica`)
    return
  }
  if (!APLICAR) { console.log('  (ensayo: nada escrito; repetí con --aplicar)'); return }

  // ── Escribir: bytes al bucket primero, fila después (la misma decisión que la app) ──
  const subida = await subirAStorage({ bucket: BUCKET, path: ruta, data: bytes, mediaType: meta.mimeType })
  if (!subida.ok) return salir(`Storage: ${subida.error}`)

  const fila = filaDeEntidadDocumento({ pedido: p, meta, archivo, uid, ruta, md5 })
  const columnas = Object.keys(fila)
  const { rows: insertadas } = await query(
    `insert into public.entidad_documento (${columnas.join(', ')}, drive_visto_en)
     values (${columnas.map((_, i) => `$${i + 1}`).join(', ')}, now()) returning id`,
    columnas.map((c) => fila[c]),
  )

  // ── La evidencia: leer lo escrito ─────────────────────────────────────
  const { rows: leidas } = await query(
    'select id, nombre_archivo, categoria, licencia_desde::text, licencia_hasta::text, drive_estado, tamano_bytes, md5 from public.entidad_documento where id = $1',
    [insertadas[0].id],
  )
  const objeto = await bajarDeStorage({ bucket: BUCKET, path: ruta })
  const md5Leido = objeto.ok ? md5De(Buffer.from(objeto.data, 'base64')) : null
  console.log(`  fila      ${JSON.stringify(leidas[0])}`)
  console.log(`  bucket    ${objeto.ok
    ? `${objeto.bytes} bytes leídos de vuelta · md5 ${md5Leido === md5 ? 'coincide' : `NO COINCIDE (${md5Leido})`}`
    : `NO SE PUDO LEER: ${objeto.error}`}`)
}

main().catch((e) => salir(`Falló: ${e?.message ?? e}`)).finally(() => closePool())
