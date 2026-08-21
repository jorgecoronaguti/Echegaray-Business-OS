#!/usr/bin/env node
// EL CORREDOR: la documentación técnica de una obra, contestada contra las fuentes reales.
//
// No decide nada — toda la decisión vive en `lib/documentacion-obra.mjs` y
// `lib/documentacion-obra-vinculo.mjs`, que se testean en frío. Acá sólo se leen las dos fuentes
// que ya existen y no se duplican:
//   · `obra_canonica.drive_carpeta_id` → la carpeta de la obra en el data room
//   · `drive_index`                    → los 3.593 archivos ya indexados (nombre, ruta, fecha)
//   · `obra_actividad`                 → el plan de la obra
//
// USO
//   node orquestador/scripts/documentacion-obra.mjs --obra san-francisco
//   node orquestador/scripts/documentacion-obra.mjs --obra quattropani --json
//   node orquestador/scripts/documentacion-obra.mjs --leer <drive_file_id> [--hoja X] [--buscar "texto"]
//
// `--leer` es lo único que toca Google, y es READ-ONLY: este corredor NO escribe en Drive ni en
// Sheets ni en la base. La memoria del repo tiene seis pérdidas de trabajo por escrituras desde
// worktrees; acá no hay ninguna ruta de escritura que pueda equivocarse.

import { query } from '../lib/db.mjs'
import {
  clasificarDocumento, legibilidadDe, agruparRevisiones, citarDocumento,
  coberturaDocumental, TIPO_DOC,
} from '../lib/documentacion-obra.mjs'
import { vincularDocumentoAActividad } from '../lib/documentacion-obra-vinculo.mjs'

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }
const tiene = (n) => process.argv.includes(n)

async function documentosDeObra(obraId) {
  const { rows: obras } = await query(
    `select o.id, o.nombre, o.estado, o.cliente_texto, o.drive_carpeta_id, d.path carpeta
       from obra_canonica o left join drive_index d on d.drive_file_id = o.drive_carpeta_id
      where o.id = $1`, [obraId])
  const obra = obras[0]
  if (!obra) throw new Error(`no existe la obra "${obraId}" en obra_canonica`)
  if (!obra.drive_carpeta_id) return { obra, carpeta: null, documentos: [], actividades: [] }
  if (!obra.carpeta) return { obra, carpeta: null, documentos: [], actividades: [], aviso: `la obra apunta a la carpeta ${obra.drive_carpeta_id}, que NO está en drive_index — el indexador no llegó ahí` }

  const { rows: documentos } = await query(
    `select drive_file_id, name, path, mime_type, tipo, size_bytes, modified_time
       from drive_index where path like $1 || '/%' and not is_folder order by path`, [obra.carpeta])
  const { rows: actividades } = await query(
    `select id, nombre, seccion, tipo, unidad, cantidad_objetivo, partida_codigo, analisis_id
       from obra_actividad where obra_id = $1 and not archivada order by orden`, [obraId])
  return { obra, carpeta: obra.carpeta, documentos, actividades }
}

function informe({ obra, carpeta, documentos, actividades, aviso }) {
  const conClase = documentos.map((d) => ({
    ...d,
    clasificacion: clasificarDocumento(d, { carpetaObra: carpeta ?? '' }),
    lectura: legibilidadDe(d),
  }))
  const cobertura = coberturaDocumental(conClase, { carpetaObra: carpeta ?? '' })
  const revisiones = agruparRevisiones(conClase).filter((f) => f.superadas.length || f.ambigua)
  const mismoDocDosFormatos = agruparRevisiones(conClase).filter((f) => f.formatos.length)
  const vinculos = conClase.map((d) => ({
    documento: d.name,
    tipo: d.clasificacion.tipo,
    ...vincularDocumentoAActividad(d, actividades, { carpetaObra: carpeta ?? '' }),
    cita: citarDocumento(d),
  }))
  return { obra, carpeta, aviso, total: documentos.length, cobertura, revisiones, mismoDocDosFormatos, vinculos, actividades: actividades.length }
}

function imprimir(r) {
  const { obra } = r
  console.log(`\n══ ${obra.id} — ${obra.nombre} (${obra.estado}) · cliente: ${obra.cliente_texto ?? 'sin cliente'}`)
  if (!r.carpeta) {
    console.log(`  ✖ SIN CARPETA CONSULTABLE. ${r.aviso ?? 'obra_canonica.drive_carpeta_id está en NULL: el OS no sabe dónde vive su documentación.'}`)
    console.log('  No se puede decir qué documentación tiene ni qué le falta. No es que no tenga: es que no se puede mirar.')
    return
  }
  console.log(`  carpeta: ${r.carpeta}`)
  console.log(`  ${r.total} archivos indexados · ${r.actividades} actividades en el plan\n`)

  console.log('  ── QUÉ DOCUMENTACIÓN HAY')
  for (const p of r.cobertura.presentes) console.log(`     ✔ ${p.tipo} (${p.cantidad}) — ej. ${p.ejemplo}`)
  for (const p of r.cobertura.solo_por_carpeta) console.log(`     ~ ${p.tipo} (${p.cantidad}) — SÓLO por carpeta, el nombre no lo declara: ${p.ejemplo}`)
  console.log('\n  ── QUÉ FALTA')
  if (!r.cobertura.faltantes.length) console.log('     (nada de lo exigido falta)')
  for (const f of r.cobertura.faltantes) console.log(`     ✖ ${f}`)

  if (r.cobertura.no_legibles.length) {
    console.log('\n  ── LO QUE EL OS NO PUEDE LEER (existe, no se interpreta)')
    for (const n of r.cobertura.no_legibles) console.log(`     · ${n.name} — ${n.motivo}`)
  }
  if (r.revisiones.length) {
    console.log('\n  ── REVISIONES: cuál rige')
    for (const f of r.revisiones) {
      console.log(`     · ${f.vigente?.name} RIGE — ${f.criterio}`)
      for (const s of f.superadas) console.log(`         superada: ${s.name}${s.superadaPorRuta ? ' (carpeta de archivos viejos)' : ''}`)
      if (f.ambigua) console.log(`         ⚠ ${f.ambigua}`)
    }
  }
  if (r.mismoDocDosFormatos.length) {
    console.log('\n  ── MISMO DOCUMENTO EN DOS FORMATOS (no es una versión superada)')
    for (const f of r.mismoDocDosFormatos) console.log(`     · ${f.vigente.name} + ${f.formatos.map((x) => x.name).join(', ')}`)
  }
  const conFrente = r.vinculos.filter((v) => v.frente)
  console.log(`\n  ── VÍNCULO CON EL PLAN: ${conFrente.length}/${r.total} documentos caen en un frente de la obra`)
  const porFrente = new Map()
  for (const v of conFrente) porFrente.set(v.frente, (porFrente.get(v.frente) ?? 0) + 1)
  for (const [f, n] of [...porFrente].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`     · ${f}: ${n}`)
  const sinTipo = r.cobertura.sin_clasificar.length
  if (sinTipo) console.log(`\n  ── ${sinTipo} archivos quedaron SIN CLASIFICAR (el nombre y la ruta no declaran qué son). No se les inventa un tipo.`)
}

async function leer(fileId) {
  const { googleDe } = await import('../comunicacion/asistente/google-cliente.mjs')
  const { loadConfig } = await import('../lib/config.mjs')
  const google = await googleDe({ identidad: null, config: loadConfig() })
  if (!google) throw new Error('sin cliente de Google: no hay credenciales cargadas en este entorno')
  const { rows } = await query('select drive_file_id, name, path, mime_type, modified_time from drive_index where drive_file_id = $1', [fileId])
  const doc = rows[0] ?? { drive_file_id: fileId, name: null, path: null }
  const meta = await google.fileMeta(fileId).catch(() => null)
  const nombre = doc.name ?? meta?.name ?? null
  const l = legibilidadDe({ name: nombre ?? '', mime_type: doc.mime_type ?? meta?.mimeType ?? '' })
  if (!l.puede) {
    console.log(JSON.stringify({ documento: nombre, legible: false, motivo: l.motivo, cita: citarDocumento({ ...doc, name: nombre }) }, null, 2))
    return
  }
  if (l.forma === 'planilla') {
    const x = await google.readExcel(fileId, { sheet: arg('--hoja') ?? undefined, maxRows: Number(arg('--filas') ?? 40) })
    console.log(JSON.stringify({ documento: nombre, hojas: x.sheets, hoja: x.sheet, filas_totales: x.total_rows, filas: x.rows, cita: citarDocumento({ ...doc, name: nombre }, { hoja: x.sheet }) }, null, 2))
    return
  }
  const p = await google.readPdfText(fileId, { maxChars: Number(arg('--chars') ?? 12000) })
  if (p.scanned) {
    console.log(JSON.stringify({ documento: nombre, legible: false, paginas: p.pages, motivo: 'PDF sin capa de texto (escaneado): haría falta visión/OCR. No se afirma nada sobre su contenido.', cita: citarDocumento({ ...doc, name: nombre }) }, null, 2))
    return
  }
  const buscar = arg('--buscar')
  const texto = buscar
    ? p.text.split('\n').filter((l2) => l2.toLowerCase().includes(buscar.toLowerCase())).join('\n')
    : p.text
  console.log(JSON.stringify({ documento: nombre, paginas: p.pages, caracteres: p.chars, truncado: p.truncated, buscado: buscar, texto, cita: citarDocumento({ ...doc, name: nombre }) }, null, 2))
}

const obraId = arg('--obra')
const fileId = arg('--leer')
try {
  if (fileId) await leer(fileId)
  else if (obraId) {
    const r = informe(await documentosDeObra(obraId))
    if (tiene('--json')) console.log(JSON.stringify(r, null, 2)); else imprimir(r)
  } else {
    const { rows } = await query('select id, nombre, estado, drive_carpeta_id is not null tiene_carpeta from obra_canonica order by id')
    console.log('obras:', rows.map((o) => `${o.id}${o.tiene_carpeta ? '' : ' (SIN carpeta)'}`).join(', '))
    console.log('uso: --obra <id> | --leer <drive_file_id>')
  }
} finally { process.exit(0) }
