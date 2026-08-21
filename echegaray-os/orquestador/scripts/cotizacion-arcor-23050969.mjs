#!/usr/bin/env node
// COTIZACIÓN ARCOR — PEDIDO N° 23050969, en el formulario real de la empresa.
//
// ═══ QUÉ ES ═══
//
// El mail de Sergio Cuevas (18/08/2026) pide cotizar CINCO ítems para la planta La Campagnola de
// San Juan, todos ejecutados en febrero de 2026, e indicar precio, condición de pago (mínimo 70
// días fecha factura) y plazo de entrega. Los cinco ya estaban presupuestados en tres documentos
// sueltos de enero y febrero; el dueño aprobó el 21/08/2026 la recotización que los actualiza por
// el ICC-INDEC hasta julio de 2026. Este script emite ESA cotización, en un solo documento con el
// número de pedido, con el formato del presupuesto que la empresa ya manda.
//
// ═══ DE DÓNDE SALE CADA NÚMERO ═══
//
// De la pestaña de cada trabajo del Sheet «RECOTIZACIÓN ARCOR 23050969». Acá se transcribe el
// SUBTOTAL recotizado de cada línea —el número aprobado— y el unitario se DERIVA de él, para que
// cantidad × unitario dé el subtotal impreso. En los presupuestos originales eso no pasaba: a dos
// renglones les faltaban $100.000 exactos. Ver `cuadrar()` en lib/presupuesto/formato-echegaray.
//
// ═══ LO QUE ESTE ARCHIVO NO DECIDE, Y NO SIMULA DECIDIR ═══
//
// El costo de estirar la condición de pago de 60 a 70 días en los dos trabajos que se cotizaron a
// 60 no está en el precio. Es una decisión comercial del dueño y ponerla acá sin que él la tome
// sería inventar el precio. El script la IMPRIME como aviso al final de la corrida, con el número,
// para que se decida sobre un dato y no sobre una sensación.
//
//   node orquestador/scripts/cotizacion-arcor-23050969.mjs [--local] [--png]
//
// `--local` deja el PDF en /tmp y no toca Drive. Sin él, sube a la carpeta del pedido.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { getTokenFor, OAUTH_SCOPES } from '../lib/google-oauth.mjs'
import { imagenesDe, png, conTransparencia, dataUri } from '../lib/presupuesto/imagenes-pdf.mjs'
import { presupuestoHtml } from '../lib/presupuesto/html.mjs'
import { cuadrar, fechaLarga } from '../lib/presupuesto/formato-echegaray.mjs'

const CUENTA = process.env.ORQ_COTIZACION_CUENTA || 'jorge@ecsas.com.ar'
const CARPETA = '1yktMWU91QQgTeg_DhNsUFhTHjV3sJR47'
// El documento del que se leen el formulario y sus imágenes: un presupuesto real de la empresa.
const MODELO = '1vxT9_Vq6jUotS9f4XlsS-HJirZxxvanH' // «CAMBIO DE CORTINAS Y DEMAS.pdf»
const NOMBRE = 'COTIZACION ARCOR 23050969 - Reparaciones y mantenimiento en gral.pdf'

// ── LOS SUBTOTALES APROBADOS, A JULIO 2026 ────────────────────────────────────────────────────
// Cada uno es el subtotal original del presupuesto multiplicado por el factor del capítulo del
// ICC-INDEC que le corresponde, compuesto mes a mes desde el mes siguiente al del presupuesto.
// Están transcritos del Sheet aprobado; el orden es el del mail de ARCOR.
export const ITEMS = [
  { tarea: 'BOLSAS DE CAL VIVA', unidad: 'UN', cantidad: 50, subtotal: 632816.77 },
  { tarea: 'MOCHILAS DE FUMIGAR', unidad: 'UN', cantidad: 2, subtotal: 660330.54 },
  { tarea: 'HIDROLAVADORA', unidad: 'UN', cantidad: 1, subtotal: 616944.63 },
  { tarea: 'REPARACIONES VARIAS - MANO DE OBRA', unidad: 'GL', cantidad: 1, subtotal: 1594994.75 },
  { tarea: 'REPARACIONES VARIAS - MATERIALES', unidad: 'GL', cantidad: 1, subtotal: 932896.59 },
  { tarea: 'REPARACIONES VARIAS - TECNICO DE HYS', unidad: 'GL', cantidad: 1, subtotal: 393719.36 },
  { tarea: 'REPARACION DE CIELORASO EN VESTUARIOS', unidad: 'HR', cantidad: 12, subtotal: 927399.07 },
]

// El total que aprobó el dueño, sin IVA. Sirve de canario: si alguien toca un subtotal de arriba
// sin pasar por la recotización, la corrida se detiene en vez de emitir un precio que nadie aprobó.
export const APROBADO_SIN_IVA = 5759101.71

// Las notas entran en UN renglón cada una: el formulario no las hace saltar de línea, así que un
// texto largo se saldría de la hoja. El tope está medido y se verifica en `notas.test.mjs`.
export const NOTAS = [
  'Trabajos ejecutados y materiales entregados en FEBRERO 2026, Planta La Campagnola, San Juan.',
  'Precios actualizados por ICC-INDEC desde cada presupuesto original hasta JULIO 2026.',
  'Unifica los presupuestos del 30/01/2026, 03/02/2026 y 23/06/2026 (REQ 22929405). Validez: 15 dias.',
]

// ARCOR pide el plazo de entrega. La respuesta honesta es que no hay plazo: los cinco items ya se
// ejecutaron y se entregaron en febrero. Inventar «15 dias» seria cotizar algo que ya paso.
export const PLAZO = 'Ejecutado. Trabajos realizados y materiales entregados en FEBRERO 2026.'

async function main() {
  const local = process.argv.includes('--local')
  const google = makeGoogleClient({
    config: loadConfig(), scopes: OAUTH_SCOPES, getToken: getTokenFor(CUENTA), soloUsuario: true,
  })

  const cuadro = cuadrar(ITEMS)
  const deriva = Math.abs(cuadro.subtotal - APROBADO_SIN_IVA)
  // Un peso de tolerancia: lo único que puede mover el número es el redondeo de los unitarios.
  if (deriva > 1) throw new Error(`el subtotal (${cuadro.subtotal}) se apartó del aprobado (${APROBADO_SIN_IVA}) en ${deriva}`)

  console.log('· leyendo el formulario del presupuesto modelo…')
  const modelo = Buffer.from(await google.descargarBytes(MODELO))
  const imgs = imagenesDe(modelo)
  const rgb = imgs.filter((i) => !i.gris)
  const gris = imgs.filter((i) => i.gris)
  const logo = rgb.find((i) => i.w === 576 && i.h === 430)
  const firma = rgb.find((i) => i.w === 485 && i.h === 648)
  const isotipo = rgb.find((i) => i.w === 360 && i.h === 360)
  const mascara = gris.find((i) => i.w === 360 && i.h === 360)
  if (!logo || !firma || !isotipo || !mascara) {
    throw new Error('el PDF modelo cambió: no encontré alguna de sus cuatro imágenes')
  }

  const html = presupuestoHtml({
    cliente: 'ARCOR S.A.I.C.',
    planta: 'PLANTA DE SAN JUAN',
    req: '23050969',
    titulo: 'REPARACIONES / MANTENIMIENTO EN GRAL',
    cuadro,
    notas: NOTAS,
    formaPago: 'Pago a 70 DIAS FF.',
    plazoEntrega: PLAZO,
    fecha: fechaLarga(new Date()),
    serie: '2,72',
    img: {
      logo: dataUri(png(logo.w, logo.h, logo.datos, 3)),
      firma: dataUri(png(firma.w, firma.h, firma.datos, 3)),
      cliente: dataUri(conTransparencia(isotipo, mascara)),
    },
  })

  console.log('· dibujando la página…')
  const navegador = await chromium.launch()
  const pagina = await navegador.newPage({ viewport: { width: 794, height: 1123 } })
  await pagina.setContent(html, { waitUntil: 'load' })
  await pagina.evaluate(() => document.fonts.ready)
  const pdf = await pagina.pdf({ width: `${595 / 72}in`, height: `${842 / 72}in`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } })
  if (process.argv.includes('--png')) {
    await pagina.screenshot({ path: path.join(os.tmpdir(), 'cotizacion-arcor.png'), fullPage: true })
    console.log('  captura:', path.join(os.tmpdir(), 'cotizacion-arcor.png'))
  }
  await navegador.close()

  const destino = path.join(os.tmpdir(), NOMBRE)
  await writeFile(destino, pdf)
  console.log('  PDF:', destino, `(${pdf.length} bytes)`)

  if (!local) {
    const subido = await google.uploadFile(NOMBRE, pdf.toString('base64'), 'application/pdf', { parentId: CARPETA })
    console.log(`\n✓ en Drive: ${subido.link}`)
  }

  console.log('\n── LO QUE ESTE DOCUMENTO NO RESUELVE ──')
  console.log(`Deriva por redondeo de los unitarios: $${cuadro.derivaPorRedondeo.toFixed(2)} sobre el subtotal aprobado.`)
  console.log('Los 10 días extra de plazo (de 60 a 70) en «Reparaciones varias» y en los tres materiales')
  console.log('NO están en el precio. Es una decisión comercial y la toma el dueño.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('falló:', e.message); process.exit(1) })
}
