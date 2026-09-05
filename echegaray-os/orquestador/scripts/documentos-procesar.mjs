#!/usr/bin/env node
// LEER LOS DOCUMENTOS DEL DRIVE Y DEJAR SU CONTENIDO BUSCABLE.
//
// Es el trabajo por lotes del motor documental. No procesa los 3.042 PDF de una: toma un lote,
// saltea lo que ya leyó (por hash del contenido) y se puede volver a correr cuantas veces haga
// falta sin duplicar nada.
//
// ═══ LOS DOCUMENTOS SENSIBLES NO SALEN DE LA VM ═══
//
// Todo esto corre local: PyMuPDF lee el PDF, las reglas lo clasifican, las expresiones regulares
// sacan los campos. NO hay una llamada a Hugging Face remoto ni a Claude en este camino, y por eso
// un libro de sueldos o un F.931 se pueden procesar sin pedirle permiso a nadie: nunca salieron.
//
//   node orquestador/scripts/documentos-procesar.mjs [--lote 60] [--tipo pdf] [--max-paginas 6] [--rehacer]

import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { toma } from '../lib/candado-base.mjs'
import { procesarDocumento, guardarDocumento, yaLeido } from '../lib/documentos/procesar.mjs'
import { resolverLote, claveConsulta, vincula, drenarTrazas } from '../lib/ml/identidad-lote.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const LOTE = Number(arg('--lote', 60))
const MAX_PAGINAS = Number(arg('--max-paginas', 6))
const REHACER = process.argv.includes('--rehacer')

async function main() {
  // TURNO DE BASE ANTES DE ESCRIBIR. Este script hace UPDATE/INSERT sobre tablas que la suite de
  // tests tambien toca; correr los dos a la vez le da a Postgres un «deadlock detected» y mata a
  // uno de los dos al azar. El rojo que sale de ahi no es de nadie —el codigo esta bien y el test
  // esta bien— y un rojo que no es de nadie entrena a ignorar los rojos.
  const soltarTurno = await toma({ quien: 'documentos-procesar' })
  try {
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })

  // Los que todavía no se leyeron primero, y dentro de eso los más chicos: un lote que arranca por
  // un PDF de 20 MB tarda diez minutos antes de mostrar el primer resultado.
  const q = await query(`
    select d.drive_file_id, d.name, d.path, d.mime_type, d.size_bytes
      from public.drive_index d
      left join public.documento_leido l on l.drive_file_id = d.drive_file_id
     where not d.is_folder and d.tipo in ('pdf','imagen')
       and coalesce(d.size_bytes, 0) between 1000 and 25000000
       and ($1 or l.drive_file_id is null)
     order by (l.drive_file_id is null) desc, coalesce(d.size_bytes, 0)
     limit $2`, [REHACER, LOTE])

  console.log(`LOTE       ${q.rows.length} documentos${REHACER ? ' (rehaciendo)' : ' pendientes'}\n`)
  if (!q.rows.length) { console.log('No queda nada por leer.'); return }

  const procesados = []
  const r = { ok: 0, fallaron: 0, salteados: 0, ocr: 0, sinTipo: 0, fragmentos: 0, ms: 0 }
  const porTipo = new Map()

  for (const f of q.rows) {
    let bytes
    try {
      bytes = await google.descargarBytes(f.drive_file_id)
    } catch (e) {
      r.fallaron += 1
      console.log(`  ✖ ${String(f.name).slice(0, 50).padEnd(51)} descarga: ${e.message.slice(0, 40)}`)
      continue
    }
    const d = await procesarDocumento(bytes, {
      driveFileId: f.drive_file_id, nombre: f.name, path: f.path,
      mimeDeclarado: f.mime_type, maxPaginas: MAX_PAGINAS,
    })
    r.ms += d.ms

    if (!REHACER && d.hash && await yaLeido(f.drive_file_id, d.hash)) { r.salteados += 1; continue }
    if (!d.ok) {
      r.fallaron += 1
      await guardarDocumento({ ...d, fragmentos: [] }).catch(() => {})
      console.log(`  ✖ ${String(f.name).slice(0, 50).padEnd(51)} ${d.error}`)
      continue
    }
    if (d.necesitaOcr) r.ocr += 1
    if (!d.tipo) r.sinTipo += 1
    porTipo.set(d.tipo ?? '(sin reconocer)', (porTipo.get(d.tipo ?? '(sin reconocer)') ?? 0) + 1)
    // SE GUARDA ACÁ, NO AL FINAL. Guardar todo el lote junto al terminar significaba tener 300
    // documentos con sus fragmentos en memoria y perderlos enteros si el proceso se caía en el
    // 299 — que con PDF de 60 fragmentos cada uno no es hipotético. Cada documento se persiste en
    // cuanto está listo; la identidad se resuelve despues y solo actualiza dos columnas.
    await guardarDocumento(d)
    procesados.push(d)
    r.ok += 1
    r.fragmentos += d.fragmentos.length
    const marca = d.necesitaOcr ? 'OCR' : d.tipo ? '✔' : '?'
    console.log(`  ${marca.padEnd(4)} ${String(f.name).slice(0, 46).padEnd(47)} ${String(d.tipo ?? '—').padEnd(18)} ${String(d.fragmentos.length).padStart(3)} frag · ${d.campos.cuit ?? '—'}`)
  }

  // ── LA IDENTIDAD, EN UN SOLO LOTE Y CON LA CAPA QUE YA EXISTE ──
  const conCuit = procesados.filter((d) => d.campos?.cuit)
  if (conCuit.length) {
    const { porClave, metricas } = await resolverLote(
      conCuit.map((d) => ({ nombre: d.campos.emisor ?? d.nombre, cuit: d.campos.cuit })),
      { entidad: 'proveedor', fuente: 'documentos-procesar' })
    for (const d of conCuit) {
      const res = porClave.get(claveConsulta({ nombre: d.campos.emisor ?? d.nombre, cuit: d.campos.cuit }))
      if (res && vincula(res.estado) && res.match) { d.entidadId = String(res.match.id); d.entidadEstado = res.estado }
      else if (res) d.entidadEstado = res.estado
      // Solo las dos columnas de identidad: el documento ya esta guardado y no se reescribe entero.
      // Reescribirlo borraria y recrearia todos sus fragmentos por nada.
      if (d.entidadEstado) {
        await query('update public.documento_leido set entidad_id = $2, entidad_estado = $3 where drive_file_id = $1',
          [d.driveFileId, d.entidadId ?? null, d.entidadEstado])
      }
    }
    console.log(`\nIDENTIDAD  ${conCuit.length} documentos con CUIT · ${metricas.porEstado.auto_resuelto} vinculados a un proveedor`)
  }

  console.log(`\n═══ LOTE PROCESADO ═══`)
  console.log(`  leídos ${r.ok} · fallaron ${r.fallaron} · ya estaban ${r.salteados} · necesitan OCR ${r.ocr} · sin tipo reconocido ${r.sinTipo}`)
  console.log(`  ${r.fragmentos} fragmentos indexados · ${Math.round(r.ms / Math.max(1, r.ok))} ms por documento`)
  console.log('\n  POR TIPO:')
  for (const [t, n] of [...porTipo].sort((a, b) => b[1] - a[1])) console.log(`    ${String(t).padEnd(20)} ${n}`)
  } finally {
    soltarTurno()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cerrar = async (c) => { await drenarTrazas().catch(() => {}); process.exit(c) }
  main().then(() => cerrar(0)).catch((e) => { console.error('ERROR:', e.stack || e.message); cerrar(1) })
}
