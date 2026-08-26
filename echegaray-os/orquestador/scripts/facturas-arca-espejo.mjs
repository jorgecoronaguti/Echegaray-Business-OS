#!/usr/bin/env node
// LAS FACTURAS DE ARCA, ATADAS A SU COBRO POR EL NÚMERO.
//
// ═══ POR QUÉ HACE FALTA UN CAMINO PROPIO ═══
//
// El espejo general recorre la carpeta de cada cliente y de cada obra. Las facturas emitidas no
// viven ahí: están todas juntas en una carpeta de ARCA, con el nombre que pone el fisco —
// `30716304643_001_00001_00000201.pdf`— y sin ninguna referencia a la obra ni al cliente.
//
// LO QUE LAS ATA ES EL NÚMERO, y es un dato exacto, no una coincidencia de texto: el último grupo
// del nombre es el número de comprobante y el anteúltimo el punto de venta. `esquema_pago` guarda
// «FA 01-00000201», que es el mismo par. Si no calza con ninguna fila, el archivo NO se publica: una
// factura colgada del cliente equivocado es peor que una factura que falta.
//
//   node orquestador/scripts/facturas-arca-espejo.mjs [--aplicar]

import { query, closePool } from '../lib/db.mjs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { createClient } from '@supabase/supabase-js'

const APLICAR = process.argv.includes('--aplicar')
const CARPETA = process.env.ARCA_FACTURAS_CARPETA || '1tAY4RtcGVZ_S-_bpTOVMkIH8rql_y4_G'
const BUCKET = 'documentos-cliente'

/**
 * NÚCLEO PURO: el punto de venta y el número que declara el nombre de ARCA.
 *
 * `30716304643_001_00001_00000201.pdf` → { ptoVta: 1, numero: 201 }. Se comparan como NÚMEROS y no
 * como texto: «01» y «0001» son el mismo punto de venta, y compararlos con `===` haría fallar la
 * mitad de los archivos por un cero.
 */
export function comprobanteDelNombre(nombre) {
  const partes = String(nombre ?? '').replace(/\.[a-z0-9]+$/i, '').split('_')
  if (partes.length < 4) return null
  const numero = Number(partes.at(-1))
  const ptoVta = Number(partes.at(-2))
  if (!Number.isFinite(numero) || !Number.isFinite(ptoVta) || numero <= 0) return null
  return { ptoVta, numero }
}

/** «FA 01-00000201» → { ptoVta: 1, numero: 201 }. El mismo par, escrito como lo escribe el Sheet. */
export function comprobanteDelCobro(texto) {
  const m = String(texto ?? '').match(/(\d{1,5})\s*[-_]\s*(\d{1,8})/)
  if (!m) return null
  return { ptoVta: Number(m[1]), numero: Number(m[2]) }
}

export const mismoComprobante = (a, b) =>
  Boolean(a && b && a.ptoVta === b.ptoVta && a.numero === b.numero)

async function main() {
  const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)

  // Los cobros que declaran un número de factura: son el único destino posible de estos archivos.
  const { rows: cobros } = await query(
    `select e.id, e.cliente_id, e.obra_id, e.factura_numero, c.nombre_comercial
       from public.esquema_pago e join public.clientes c on c.id = e.cliente_id
      where e.factura_numero is not null`)
  const conNumero = cobros.map((c) => ({ ...c, comp: comprobanteDelCobro(c.factura_numero) })).filter((c) => c.comp)
  console.log(`cobros con número de factura: ${conNumero.length}`)

  const archivos = []
  async function recorrer(id) {
    for (const f of await g.listarCarpeta(id, { campos: 'id,name,mimeType,size' })) {
      if (f.mimeType === 'application/vnd.google-apps.folder') await recorrer(f.id)
      else archivos.push(f)
    }
  }
  await recorrer(CARPETA)
  console.log(`archivos en la carpeta de ARCA: ${archivos.length}`)

  let atados = 0
  const huerfanos = []
  for (const a of archivos) {
    const comp = comprobanteDelNombre(a.name)
    const destino = comp && conNumero.find((c) => mismoComprobante(c.comp, comp))
    if (!destino) { huerfanos.push(a.name); continue }
    atados += 1
    console.log(`  ✓ ${a.name}  ⇒  ${destino.factura_numero}  ·  ${destino.nombre_comercial}`)
    if (!APLICAR) continue

    const ruta = `${destino.cliente_id}/${destino.obra_id ?? '_cliente'}/${a.id}-${a.name}`
    const buf = await g.descargarBytes(a.id)
    const up = await sb.storage.from(BUCKET).upload(ruta, buf, { contentType: a.mimeType, upsert: true })
    if (up.error) throw new Error(`no se pudo subir ${a.name}: ${up.error.message}`)
    await query(
      `insert into public.documento_cliente
         (cliente_id, obra_id, titulo, categoria, drive_file_id, storage_path, mime, bytes,
          visible_portal, origen, sincronizado_en)
       values ($1,$2,$3,'factura',$4,$5,$6,$7,true,'arca_drive', now())
       on conflict (coalesce(obra_id,'_cliente'), drive_file_id) do update set
         titulo = excluded.titulo, categoria = 'factura', storage_path = excluded.storage_path,
         mime = excluded.mime, bytes = excluded.bytes, sincronizado_en = now(), actualizado_at = now()`,
      [destino.cliente_id, destino.obra_id, destino.factura_numero, a.id, ruta, a.mimeType, buf.length])
  }

  console.log(`\n${atados} archivo(s) atados a su cobro.`)
  if (huerfanos.length) {
    console.log(`\n⚠ ${huerfanos.length} sin cobro que los reclame — NO se publican:`)
    for (const h of huerfanos.slice(0, 12)) console.log(`   ${h}`)
    if (huerfanos.length > 12) console.log(`   … y ${huerfanos.length - 12} más`)
  }
  if (!APLICAR) { console.log('\n(en seco: no se escribió nada — agregá --aplicar)'); return }

  // LA EVIDENCIA ES EL DATO LEÍDO EN SU DESTINO.
  const { rows } = await query(
    `select c.nombre_comercial, count(*)::int n from public.documento_cliente d
       join public.clientes c on c.id = d.cliente_id
      where d.origen = 'arca_drive' group by 1 order by 1`)
  console.log('\n══ LEÍDO DE documento_cliente ══')
  for (const r of rows) console.log(`  ${r.nombre_comercial}: ${r.n} factura(s)`)
}

main().catch((e) => { console.error('✖', e.message); process.exitCode = 1 }).finally(() => closePool())
