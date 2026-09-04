#!/usr/bin/env node
// LEE LAS ÓRDENES DE COMPRA DE DRIVE Y DEJA ESCRITO QUÉ PLAZO PACTA CADA UNA.
//
// SOLO LECTURA SOBRE EL SHEET. La pestaña `Cobranzas` es la fuente y el contrato del área prohíbe
// escribirla: de acá sale un archivo de datos versionado (`orquestador/datos/plazos-cobro-oc.json`),
// nunca una celda.
//
// QUÉ HACE, EN ORDEN: lee la columna H de Cobranzas → saca los números de OC distintos → busca cada
// PDF en Drive por la clave sin guiones (`OC_32_0000200002266.pdf`) → extrae `Cond.Compra` → guarda
// la condición CON su evidencia (el id del archivo, el texto literal y la fecha de lectura).
//
// LO QUE NO ENCUENTRA QUEDA ESCRITO COMO NO ENCONTRADO. Una OC sin PDF archivado es trabajo
// pendiente del área —reclamarla— y tiene que verse; borrarla del archivo la haría desaparecer.
//
//   node orquestador/scripts/plazo-cobro-leer-oc.mjs [--dry]

import { writeFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { numeroDeOrdenDeCompra, claveDeBusquedaDrive, condicionDeOrdenDeCompra } from '../lib/plazo-cobro.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const RANGO = 'Cobranzas!A5:S200'
const SALIDA = new URL('../datos/plazos-cobro-oc.json', import.meta.url).pathname
const DRY = process.argv.includes('--dry')

/** Las OC distintas que declara la pestaña, con el cliente y las filas donde aparecen. */
export function ocsDeclaradas(filas = [], filaBase = 5) {
  const mapa = new Map()
  filas.forEach((r, i) => {
    if (!r?.[12]) return  // sin monto no es una fila de cobranza
    const oc = numeroDeOrdenDeCompra(r?.[7])
    if (!oc) return
    if (!mapa.has(oc)) mapa.set(oc, { orden_compra: oc, cliente: String(r?.[6] ?? '').trim(), filas: [] })
    mapa.get(oc).filas.push(filaBase + i)
  })
  return [...mapa.values()]
}

async function leerUna(g, item) {
  const clave = claveDeBusquedaDrive(item.orden_compra)
  const archivos = await g.searchFile(clave).catch(() => [])
  const pdfs = archivos.filter((f) => f.mimeType === 'application/pdf')
  if (!pdfs.length) {
    return { ...item, estado: 'sin_pdf_en_drive', dias: null, motivo: 'no hay ningún PDF cuyo nombre contenga ' + clave }
  }
  for (const f of pdfs) {
    const t = await g.readPdfText(f.id, { maxChars: 8000 }).catch(() => null)
    if (!t) continue
    if (t.scanned) return { ...item, estado: 'pdf_escaneado', dias: null, drive_file_id: f.id, archivo: f.name, motivo: 'el PDF no tiene texto: haría falta OCR' }
    const c = condicionDeOrdenDeCompra(t.text)
    if (!c) continue
    return {
      ...item, estado: c.dias === null ? 'condicion_sin_dias' : 'leida',
      codigo: c.codigo, descripcion: c.descripcion, tipo: c.tipo, dias: c.dias,
      instrumento: c.instrumento, drive_file_id: f.id, archivo: f.name,
    }
  }
  return { ...item, estado: 'sin_campo_condicion', dias: null, drive_file_id: pdfs[0].id, archivo: pdfs[0].name, motivo: 'el PDF no declara "Cond.Compra"' }
}

async function main() {
  const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const filas = await g.readSheetValues(ID, RANGO)
  const pedidas = ocsDeclaradas(filas)
  const leidas = []
  for (const item of pedidas) leidas.push(await leerUna(g, item))

  const resumen = leidas.reduce((a, l) => { a[l.estado] = (a[l.estado] ?? 0) + 1; return a }, {})
  const doc = {
    generado_por: 'orquestador/scripts/plazo-cobro-leer-oc.mjs',
    leido_el: new Date().toISOString().slice(0, 10),
    fuente: `Sheet ${ID} · ${RANGO} (SOLO LECTURA) + los PDF de las OC en Drive`,
    resumen,
    ordenes: leidas.sort((a, b) => a.orden_compra.localeCompare(b.orden_compra)),
  }
  for (const l of doc.ordenes) {
    console.log(String(l.orden_compra).padEnd(15), String(l.estado).padEnd(20), String(l.dias ?? '—').padStart(4), ' ', l.descripcion ?? l.motivo ?? '')
  }
  console.log('\n', JSON.stringify(resumen))
  if (DRY) { console.log('(--dry: no se escribió el archivo)'); return }
  writeFileSync(SALIDA, JSON.stringify(doc, null, 1) + '\n')
  console.log('→', SALIDA)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exitCode = 1 })
