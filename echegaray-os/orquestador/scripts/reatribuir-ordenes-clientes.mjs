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
  clasificarAdjunto, comprobanteDelNombre, extraerImporte, extraerNumero, extraerFechaDeOrden,
  fechaImposible, numeroDeRetencion,
} from '../lib/ordenes-cliente.mjs'
import {
  comprobantePropio, comprobantesCitados, facturaPropiaDe, numeroCanonico, ocsCitadas,
} from '../lib/ordenes-identidad.mjs'
import { CUIT_ECSAS } from '../lib/transferencias-proveedores.mjs'
import { heredarObras } from '../lib/ordenes-atribucion.mjs'

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
  // UNA OBRA FUSIONADA YA NO EXISTE COMO DESTINO. `bsa-planta` se fusionó en `ME - BSA` y
  // `pisos-120m2` en `ME - PISOS 120 M² Y RAMPA` (decisión del dueño, 10/09/2026): siguen en la
  // tabla para que sus alias resuelvan, pero colgar una orden nueva de ellas la esconde de la obra
  // viva. Se buscan sólo las canónicas, y `aDondeFueron` traduce una obra vieja a su destino.
  const { rows: obras } = await query(
    'select id, nombre, cliente_id from public.obra_canonica where cliente_id is not null and fusionada_en is null')
  const { rows: fusionadas } = await query(
    'select id, fusionada_en from public.obra_canonica where fusionada_en is not null')
  const aDondeFue = new Map(fusionadas.map((f) => [f.id, f.fusionada_en]))
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre_comercial]))
  const { rows } = await query(`select id, cliente_id, obra_id, tipo, numero, numero_canonico, fecha,
    importe, moneda, cita, origen, nombre_archivo, archivo_path, asunto
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
    // Y SI NO ES UNA FACTURA, PUEDE SER UN CERTIFICADO DE RETENCIÓN. La OP 4865 y la OP 5156 tienen
    // dos filas cada una: la segunda es el certificado que Messina manda con el pago, guardado como
    // `orden_pago` con el número de la orden. Se reclasifica y se le devuelve SU número, que es lo
    // único que impide que dos papeles distintos compartan identidad.
    // Y SI NO SE DEJA LEER EL ENCABEZADO, EL NOMBRE PUEDE PROBAR LO MISMO: `30716304643_201_…pdf`
    // lleva nuestro CUIT adelante porque el comprobante lo emitimos nosotros. `facturaPropiaDe` sólo
    // reconoce «FACTURA A» y no la factura de crédito electrónica MiPyME.
    const propio = manual || fac ? null : comprobanteDelNombre(r.nombre_archivo, CUIT_ECSAS)
    const clase = manual || fac || propio ? null : clasificarAdjunto({ nombreArchivo: r.nombre_archivo, textoPdf: texto })
    const esRetencion = clase?.tipo === 'retencion'
    // ═══ UN PAPEL QUE NO SE DECLARA ORDEN Y NUNCA TUVO NÚMERO NO ES UNA ORDEN ═══
    //
    // MEDIDO el 10/09/2026: 108 de las 148 filas de ARCOR con `tipo = 'orden_compra'` son pliegos,
    // planillas de cotización, planos, `image001.png` y dos `Requisitos_Ingreso.zip`. Ninguna trae
    // número: entraron porque el ASUNTO del mail decía «GENERACION OC» y esa señal se aplicó a todos
    // los adjuntos. La ficha del cliente contaba «148 OC · $524.163.838» donde hay 40 · $449.246.223.
    //
    // La degradación exige LAS DOS cosas —que el papel no se declare orden Y que nunca haya tenido
    // número— porque un PDF protegido o corrupto se lee vacío y se vería igual que un pliego. Una
    // orden real llegó siempre con su número, sea del nombre que le puso el emisor o de su texto:
    // sin esa segunda condición, un PDF ilegible bastaría para borrar una orden de la cartera.
    const degradar = clase?.tipo === 'otro' && !r.numero
    // EL IMPORTE SE RECALCULA SIEMPRE, no sólo cuando falta: el guardado se leyó con el locale
    // equivocado («78,650,000.00» → $ 78,65) y está mal escrito, no ausente.
    const { importe, moneda } = extraerImporte(texto)
    docs.push({
      ...r,
      texto,
      tipo: fac?.tipo ?? (propio ? 'factura' : (esRetencion ? 'retencion' : (degradar ? 'otro' : r.tipo))),
      numero: fac?.numero
        ?? propio
        ?? (esRetencion ? (numeroDeRetencion({ nombreArchivo: r.nombre_archivo, textoPdf: texto }) ?? r.numero) : (r.numero ?? extraerNumero(texto))),
      cita: fac?.cita ?? r.cita ?? null,
      importe: manual || importe === null ? (r.importe === null ? null : Number(r.importe)) : importe,
      moneda: manual || importe === null ? r.moneda : moneda,
      // La fecha guardada se PISA cuando es imposible: las cinco OC de Messina quedaron en 2086
      // porque el parser leyó «Fecha Inicio Act. 22-08-86» del encabezado.
      fecha: fechaImposible(fechaISO(r.fecha)) || !r.fecha ? extraerFechaDeOrden(texto) : fechaISO(r.fecha),
      comprobante: comprobantePropio(texto),
      citadas: [...ocsCitadas(texto), ...comprobantesCitados(texto)],
      // Una fila que ya apunta a una obra FUSIONADA se traduce al destino: no es reasignarla, es
      // el mismo lugar con su nombre vivo. `bsa-planta` → `messina-bsa`.
      obra_id: aDondeFue.get(r.obra_id) ?? r.obra_id,
      obraOriginal: r.obra_id,
      porque: r.obra_id ? (aDondeFue.has(r.obra_id) ? `la obra se fusionó en ${aDondeFue.get(r.obra_id)}` : 'ya la tenía') : null,
    })
  }

  // ── 2. HEREDAR, HASTA QUE NADIE MÁS PUEDA ─────────────────────────────────────────────────────
  // La regla vive en `lib/ordenes-atribucion.mjs` y la usa TAMBIÉN la ingesta: hasta el 10/09 estaba
  // escrita sólo acá, y una orden de pago recién bajada quedaba sin obra hasta que alguien corriera
  // este script. Dos caminos, una definición de «esta OP es de esta obra».
  heredarObras(docs, { obras, nombreClientePorId: nombreCliente })

  // ── 3. LA TABLA ───────────────────────────────────────────────────────────────────────────────
  const nombreObra = new Map(obras.map((o) => [o.id, o.nombre]))
  const antesDe = new Map(rows.map((r) => [r.id, r]))
  const difiere = (d) => {
    const a = antesDe.get(d.id)
    return d.obra_id !== a.obra_id || d.numero !== a.numero || d.fecha !== fechaISO(a.fecha)
      || numeroCanonico(d.numero) !== (a.numero_canonico ?? null)
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
    // EL CANÓNICO VIAJA CON EL NÚMERO, SIEMPRE. Es la columna con la que la base impide que la
    // misma orden entre dos veces, y una fila con número y sin canónico deja ese guardián dormido.
    const canon = numeroCanonico(patch.numero ?? d.numero)
    if (canon !== (antes.numero_canonico ?? null)) patch.numero_canonico = canon
    if (!Object.keys(patch).length) continue
    const { error } = await sb.from('cliente_orden').update(patch).eq('id', d.id)
    if (error) console.log(`  ✗ ${d.nombre_archivo}: ${error.message}`)
    else escritas++
  }
  console.log(`\nAPLICADO — filas actualizadas: ${escritas}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
