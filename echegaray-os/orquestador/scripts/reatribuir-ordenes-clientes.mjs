#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS ÓRDENES QUE QUEDARON SIN OBRA — segunda pasada, sobre el PDF que ya está en el bucket
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
//   node orquestador/scripts/reatribuir-ordenes-clientes.mjs            # ENSAYO
//   node orquestador/scripts/reatribuir-ordenes-clientes.mjs --aplicar  # escribe cliente_orden
//
// Pedido del dueño (10/09/2026): «necesito identificarlas con la obra a simple vista». Nueve de las
// dieciséis órdenes de Messina colgaban del cliente porque el asunto del mail no nombra la obra.
// El PDF sí la nombra —o nombra la OC / la factura que la nombra—, y eso ya estaba guardado.
//
// NO BAJA MAIL. Lee lo que el bucket ya tiene: correr esto no depende de Gmail ni puede duplicar
// nada. Lo único que escribe son tres campos de una fila existente (obra_id, numero, fecha), y sólo
// cuando estaban vacíos: una obra puesta a mano por una persona NUNCA se pisa.
//
// SEGUNDA PASADA (10/09/2026): además de la obra, esto CORRIGE lo que el primer parser leyó mal y
// quedó escrito como si fuera un hecho — el importe en locale equivocado y la factura nuestra
// disfrazada de orden de compra. Un dato falso no es un dato faltante: no se puede esperar a que
// alguien lo note. Lo que una PERSONA eligió (`origen = 'manual'`) nunca se pisa.
//
// LAS TRES REGLAS, EN ORDEN, Y NINGUNA ADIVINA:
//   1. El texto del PDF nombra la obra   → `resolverObraDeTexto` (misma función que la ingesta).
//   2. El documento cita una OC o una factura que YA tiene obra → hereda esa obra.
//   3. Otra fila tiene el mismo número canónico y tiene obra → hereda (es la misma orden).
// Cuando la referencia cae en DOS obras distintas, o no cae en ninguna conocida, la orden se queda
// a nivel cliente y se imprime POR QUÉ. Nueve órdenes sin obra y sin motivo no sirven para decidir.
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { APP_DIR } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { leerPdf } from '../lib/ingesta/pdf.mjs'
import { loadEnvLocalInto } from '../../scripts/lib/env-file.mjs'
import {
  agruparPorNumero, comprobantePropio, comprobantesCitados, extraerImporte, extraerNumero,
  extraerFechaDeOrden, facturaPropiaDe, fechaImposible, mapaDeCitas, mapaDeEvidencia,
  numeroCanonico, obraPorReferencia, ocsCitadas, resolverObraDeTexto,
} from '../lib/ordenes-cliente.mjs'

loadEnvLocalInto(process.env, process.env.ORDENES_ENV_FILE ?? path.join(APP_DIR, '.env.local'))

const BUCKET = 'obras-documentos'
const APLICAR = process.argv.includes('--aplicar')
const fechaISO = (v) => (v ? String(new Date(v).toISOString()).slice(0, 10) : null)
const fmt = (v, n) => String(v ?? '').replace(/\s+/g, ' ').slice(0, n).padEnd(n)

async function textoDe(sb, ruta) {
  const { data } = await sb.storage.from(BUCKET).download(ruta)
  if (!data) return ''
  try {
    const { leidas } = await leerPdf(Buffer.from(await data.arrayBuffer()), { conGeometria: false, hasta: 3 })
    return leidas.map((p) => p.textos.map((t) => t.texto).join(' ')).join('\n')
  } catch { return '' }
}

async function main() {
  const { rows: clientes } = await query('select id, nombre_comercial from public.clientes')
  const { rows: obras } = await query('select id, nombre, cliente_id from public.obra_canonica where cliente_id is not null')
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre_comercial]))
  const { rows } = await query(`select id, cliente_id, obra_id, tipo, numero, fecha, importe, moneda,
    cita, origen, nombre_archivo, archivo_path, asunto
    from public.cliente_orden where eliminado_en is null order by nombre_archivo`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const sb = createClient(url, key, { auth: { persistSession: false } })

  // ── 1. LEER LO QUE CADA PDF DICE ──────────────────────────────────────────────────────────────
  const docs = []
  for (const r of rows) {
    const texto = await textoDe(sb, r.archivo_path)
    const manual = r.origen === 'manual'
    // QUÉ ES ESTE PAPEL, según su propio encabezado y no según cómo se llama el archivo. Una
    // factura nuestra guardada como `orden_compra` duplicaba la orden del cliente en la pantalla.
    const fac = manual ? null : facturaPropiaDe(texto)
    // EL IMPORTE SE RECALCULA SIEMPRE, no sólo cuando falta: el guardado se leyó con el locale
    // equivocado («78,650,000.00» → $ 78,65) y está mal escrito, no ausente.
    const { importe, moneda } = extraerImporte(texto)
    docs.push({
      ...r,
      texto,
      tipo: fac?.tipo ?? r.tipo,
      numero: fac?.numero ?? r.numero ?? extraerNumero(texto),
      cita: fac?.cita ?? r.cita ?? null,
      importe: manual || importe === null ? (r.importe === null ? null : Number(r.importe)) : importe,
      moneda: manual || importe === null ? r.moneda : moneda,
      // La fecha guardada se PISA cuando es imposible: las cinco OC de Messina quedaron en 2086
      // porque el parser leyó «Fecha Inicio Act. 22-08-86» del encabezado.
      fecha: fechaImposible(fechaISO(r.fecha)) || !r.fecha ? extraerFechaDeOrden(texto) : fechaISO(r.fecha),
      comprobante: comprobantePropio(texto),
      citadas: [...ocsCitadas(texto), ...comprobantesCitados(texto)],
      obraOriginal: r.obra_id,
      porque: r.obra_id ? 'ya la tenía' : null,
    })
  }

  // ── 2. HEREDAR, HASTA QUE NADIE MÁS PUEDA ─────────────────────────────────────────────────────
  // Se repite porque la cadena tiene eslabones: la factura le da la obra a la OC, y recién entonces
  // la OC se la puede dar a la orden de pago que la cita. Tres vueltas alcanzan y el punto fijo se
  // detecta solo; sin repetir, la herencia dependería del orden en que Gmail devolvió los mails.
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const mapa = mapaDeEvidencia(docs)
    const citas = mapaDeCitas(docs)
    let cambios = 0
    for (const d of docs) {
      if (d.obra_id) continue
      const delCliente = obras.filter((o) => o.cliente_id === d.cliente_id)
      const porTexto = resolverObraDeTexto(delCliente, `${d.asunto ?? ''} ${d.texto}`, { nombreCliente: nombreCliente.get(d.cliente_id) ?? '' })
      if (porTexto) { d.obra_id = porTexto.id; d.porque = 'el PDF nombra la obra'; cambios++; continue }
      const ref = obraPorReferencia(d.citadas, mapa)
      d.porque = ref.porque
      if (ref.obraId) { d.obra_id = ref.obraId; cambios++; continue }
      // EL CAMINO INVERSO: la factura que CITA esta OC ya tiene obra (describe el trabajo y nombra
      // el playón; la OC del cliente sólo trae el código de centro de costo). Antes esto pasaba
      // solo, porque la factura quedaba guardada con el número de la OC y `agruparPorNumero` las
      // confundía; separados los tipos, la herencia tiene que estar escrita.
      const propio = numeroCanonico(d.numero)
      const porCita = propio ? citas.get(propio) : null
      if (porCita) { d.obra_id = porCita; d.porque = `una factura que cita ${propio} tiene esa obra`; cambios++ }
    }
    // Misma orden, dos papeles: el que tiene obra se la pasa al que no. `agruparPorNumero` es la
    // que decide qué es «la misma orden» — la pantalla agrupa con esa misma función.
    for (const g of agruparPorNumero(docs)) {
      const conObra = g.filas.find((f) => f.obra_id)
      if (!conObra) continue
      for (const f of g.filas) {
        if (f.obra_id) continue
        f.obra_id = conObra.obra_id
        f.porque = `misma orden que ${conObra.nombre_archivo}`
        cambios++
      }
    }
    if (!cambios) break
  }

  // ── 3. LA TABLA ───────────────────────────────────────────────────────────────────────────────
  const nombreObra = new Map(obras.map((o) => [o.id, o.nombre]))
  const antesDe = new Map(rows.map((r) => [r.id, r]))
  const difiere = (d) => {
    const a = antesDe.get(d.id)
    return d.obra_id !== a.obra_id || d.numero !== a.numero || d.fecha !== fechaISO(a.fecha)
      || d.tipo !== a.tipo || d.cita !== a.cita
      || (d.importe === null) !== (a.importe === null)
      || (d.importe !== null && Math.abs(d.importe - Number(a.importe)) > 0.005)
  }
  const cambia = docs.filter(difiere)
  console.log(`\ndocumentos: ${docs.length} · con obra: ${docs.filter((d) => d.obra_id).length} · sin obra: ${docs.filter((d) => !d.obra_id).length}\n`)
  console.log(`${fmt('ARCHIVO', 34)} ${fmt('TIPO', 13)} ${fmt('NÚMERO', 16)} ${fmt('FECHA', 11)} ${fmt('IMPORTE', 16)} ${fmt('OBRA', 30)} POR QUÉ`)
  for (const d of docs) {
    const imp = d.importe === null ? '—' : d.importe.toLocaleString('es-AR', { minimumFractionDigits: 2 })
    console.log(`${fmt(d.nombre_archivo, 34)} ${fmt(d.tipo, 13)} ${fmt(d.numero, 16)} ${fmt(d.fecha, 11)} ${String(imp).padStart(16)} ${fmt(nombreObra.get(d.obra_id) ?? '— nivel cliente', 30)} ${d.porque ?? ''}`)
  }

  if (!APLICAR) { console.log(`\nENSAYO — ${cambia.length} filas cambiarían. Nada se escribió. Con --aplicar.`); return }

  let escritas = 0
  for (const d of cambia) {
    const patch = {}
    const antes = antesDe.get(d.id)
    if (!antes.obra_id && d.obra_id) patch.obra_id = d.obra_id
    if (d.fecha && (!antes.fecha || fechaImposible(fechaISO(antes.fecha)))) patch.fecha = d.fecha
    // EL TIPO Y EL NÚMERO VIAJAN JUNTOS. Reclasificar una factura sin corregir su número la dejaría
    // como «Factura 2162», que es el número de la OC ajena: media corrección miente distinto.
    if (d.tipo !== antes.tipo) { patch.tipo = d.tipo; patch.numero = d.numero; patch.cita = d.cita }
    else if (!antes.numero && d.numero) patch.numero = d.numero
    // El importe es el único campo que se PISA aunque ya tuviera valor: estaba mal leído.
    if (d.importe !== null && (antes.importe === null || Math.abs(d.importe - Number(antes.importe)) > 0.005)) {
      patch.importe = d.importe
      patch.moneda = d.moneda
    }
    if (!Object.keys(patch).length) continue
    const { error } = await sb.from('cliente_orden').update(patch).eq('id', d.id)
    if (error) console.log(`  ✗ ${d.nombre_archivo}: ${error.message}`)
    else escritas++
  }
  console.log(`\nAPLICADO — filas actualizadas: ${escritas}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
