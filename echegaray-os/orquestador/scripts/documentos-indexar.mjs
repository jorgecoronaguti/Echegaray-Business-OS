#!/usr/bin/env node
// PONER LOS DOCUMENTOS EN `ml_embedding` PARA QUE SE PUEDAN BUSCAR POR SIGNIFICADO.
//
// ═══ QUÉ NO SE INDEXA, Y POR QUÉ IMPORTA MÁS QUE QUÉ SÍ ═══
//
// Un índice semántico se arruina con basura mucho más rápido que con falta de datos. En este corpus
// la basura tiene nombre y apellido:
//   · encabezados y pies repetidos — «Conserve este Acuse de Recibo como comprobante» aparece en 102
//     documentos idénticos; indexado, es la respuesta más parecida a cualquier pregunta sobre acuses
//     y no distingue ninguno.
//   · fragmentos que son sólo números — un código de barras no contesta una pregunta.
//   · el mismo texto exacto ya indexado desde otro documento.
//   · páginas sin texto y OCR que salió vacío.
//
// Se cuenta cuántos se saltearon y por qué: un índice que no dice qué dejó afuera no se puede
// auditar.
//
//   node orquestador/scripts/documentos-indexar.mjs [--modelo e5-small] [--lote 400] [--rehacer]

import { createHash } from 'node:crypto'
import { query } from '../lib/db.mjs'
import { CANDIDATOS, embeber, cargar } from '../lib/ml/motor-embeddings.mjs'
import { drenarTrazas, registrarTraza } from '../lib/ml/traza.mjs'
import { randomUUID } from 'node:crypto'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const MODELO = arg('--modelo', 'e5-small')
const LOTE = Number(arg('--lote', 400))
const REHACER = process.argv.includes('--rehacer')

/** Cuántas veces tiene que repetirse un texto para considerarlo plantilla y no contenido. */
const REPETICIONES_PLANTILLA = 5
const MINIMO_CARACTERES = 60
/** Al menos esta proporción de letras: un fragmento que es casi todo dígitos es un código, no texto. */
const MINIMO_LETRAS = 0.35

const hashDe = (t) => createHash('sha1').update(t).digest('hex')

function esIndexable(texto) {
  const t = String(texto ?? '').trim()
  if (t.length < MINIMO_CARACTERES) return { ok: false, porQue: 'demasiado corto' }
  const letras = (t.match(/[a-záéíóúñA-ZÁÉÍÓÚÑ]/g) ?? []).length
  if (letras / t.length < MINIMO_LETRAS) return { ok: false, porQue: 'casi todo números: es un código, no texto' }
  return { ok: true }
}

async function main() {
  const c = CANDIDATOS[MODELO]
  if (!c) throw new Error(`no hay un modelo declarado con la clave «${MODELO}»`)
  const motor = await cargar(MODELO)
  console.log(`MODELO     ${c.id} @ ${c.revision.slice(0, 12)} · ${c.dimensiones} dims · ${c.licencia}`)
  console.log(`           cargado en ${motor.msCarga} ms · RSS ${motor.rssMb} MB\n`)

  const q = await query(`
    select f.id, f.drive_file_id, f.pagina, f.texto, l.tipo, l.sensibilidad
      from public.documento_fragmento f
      join public.documento_leido l using (drive_file_id)
     where l.error is null
       and ($1 or not exists (
             select 1 from public.ml_embedding e
              where e.entidad = 'documento' and e.entidad_id = f.drive_file_id
                and e.fragmento = f.id and e.modelo = $2))
     order by f.id
     limit $3`, [REHACER, c.id, LOTE])

  // ── LAS PLANTILLAS SE DETECTAN CONTANDO, no con una lista escrita a mano ──
  // Una lista de frases a excluir envejece con el primer proveedor nuevo. Contar cuántas veces
  // aparece EXACTAMENTE el mismo texto en documentos distintos no envejece nunca.
  const repes = await query(`
    select md5(texto) h, count(distinct drive_file_id)::int n
      from public.documento_fragmento group by 1 having count(distinct drive_file_id) >= $1`,
  [REPETICIONES_PLANTILLA])
  const plantillas = new Set(repes.rows.map((r) => r.h))
  const md5 = (t) => createHash('md5').update(t).digest('hex')

  const salteados = { corto: 0, numeros: 0, plantilla: 0, duplicado: 0 }
  const vistos = new Set()
  const aIndexar = []
  for (const f of q.rows) {
    const t = String(f.texto ?? '').trim()
    const i = esIndexable(t)
    if (!i.ok) { salteados[i.porQue.startsWith('demasiado') ? 'corto' : 'numeros'] += 1; continue }
    if (plantillas.has(md5(t))) { salteados.plantilla += 1; continue }
    const h = hashDe(t)
    if (vistos.has(h)) { salteados.duplicado += 1; continue }
    vistos.add(h)
    aIndexar.push({ ...f, hash: h })
  }

  console.log(`FRAGMENTOS ${q.rows.length} candidatos · ${aIndexar.length} a indexar`)
  console.log(`SALTEADOS  cortos ${salteados.corto} · sólo números ${salteados.numeros} · plantillas repetidas ${salteados.plantilla} · duplicados ${salteados.duplicado}\n`)
  if (!aIndexar.length) { console.log('No queda nada por indexar.'); return }

  const t0 = Date.now()
  const vecs = await embeber(MODELO, aIndexar.map((f) => f.texto), { rol: 'documento', lote: 8 })
  const msEmb = Date.now() - t0

  for (let i = 0; i < aIndexar.length; i += 1) {
    const f = aIndexar[i]
    await query(
      `insert into public.ml_embedding
         (entidad, entidad_id, fragmento, texto, modelo, revision, dimensiones, vector, origen, pagina, hash, actualizado, creado_en)
       values ('documento',$1,$2,$3,$4,$5,$6,$7::vector,'documentos-indexar',$8,$9, now(), now())
       on conflict (entidad, entidad_id, fragmento, modelo) do update set
         texto = excluded.texto, vector = excluded.vector, revision = excluded.revision,
         hash = excluded.hash, pagina = excluded.pagina, actualizado = now()`,
      [f.drive_file_id, f.id, f.texto.slice(0, 4000), CANDIDATOS[MODELO].id, CANDIDATOS[MODELO].revision,
       CANDIDATOS[MODELO].dimensiones, JSON.stringify(vecs[i]), f.pagina, f.hash])
  }

  registrarTraza({ traceId: randomUUID(), capacidad: 'embed', metodo: 'ml-local', modelo: CANDIDATOS[MODELO].id,
    proveedor: 'local', ms: msEmb, accion: 'aplicar', sensibilidad: 'confidencial' }, { modulo: 'documentos-indexar' })

  const total = await query("select count(*)::int n from public.ml_embedding where modelo = $1", [CANDIDATOS[MODELO].id])
  console.log(`═══ INDEXADO ═══`)
  console.log(`  ${aIndexar.length} fragmentos en ${msEmb} ms (${Math.round(msEmb / aIndexar.length)} ms cada uno)`)
  console.log(`  ${total.rows[0].n} vectores en total para este modelo · RSS ${Math.round(process.memoryUsage().rss / 1048576)} MB`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cerrar = async (c) => { await drenarTrazas().catch(() => {}); process.exit(c) }
  main().then(() => cerrar(0)).catch((e) => { console.error('ERROR:', e.stack || e.message); cerrar(1) })
}
