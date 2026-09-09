#!/usr/bin/env node
// EXPORTA UNA PESTAÑA DEL SHEET A PDF PARA VERLA COMO SE VE DE VERDAD.
//
// POR QUÉ EXISTE (22/07). El OS escribía y formateaba pestañas a ciegas: leía celdas y formatos por
// API, pero NUNCA veía el render. Y una planilla no se ve como un mockup HTML — un "panel" de dos
// columnas que en HTML queda lindo, en la grilla queda como texto desparramado. Rediseñar sin ver el
// resultado es adivinar; el dueño rechazó una pestaña cuatro veces por eso. Con esto, el OS exporta
// la pestaña a PDF y la MIRA (el visor de PDF lee el archivo), y recién ahí decide si quedó bien.
//
// Usa el endpoint de export de Google Sheets (docs.google.com/.../export?format=pdf) con el token del
// Service Account. Devuelve la ruta del PDF para inspeccionarlo.
//
//   node orquestador/scripts/exportar-pestana-pdf.mjs "Impuestos y Financieros" [A1:J46] [salida.pdf]

import { GoogleAuth } from 'google-auth-library'
import { writeFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES, resolveKeyPath } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const TITULO = process.argv[2]
const RANGO = process.argv[3] || 'A1:Z60'
const SALIDA = process.argv[4] || '/tmp/pestana.pdf'

/**
 * EXPORTA UNA PESTAÑA A PDF Y DEVUELVE LA RUTA Y EL TAMAÑO.
 *
 * Se separó de `main` el 09/09/2026 porque `pestana-retirar.mjs` necesita el PDF ANTES de borrar una
 * pestaña, y hasta hoy este archivo corría `main()` con sólo importarlo: quien lo citara se llevaba
 * puesta una exportación con los argumentos de SU línea de comandos. Un módulo que actúa al ser
 * importado no se puede reusar, y el guard de abajo es lo que lo arregla.
 *
 * Devuelve `{ salida, bytes }`. NO atrapa el error: quien exporta un respaldo antes de borrar algo
 * tiene que enterarse de que no lo pudo escribir.
 */
export async function exportarPestanaPdf({ titulo, rango = 'A1:Z60', salida = '/tmp/pestana.pdf', id = ID } = {}) {
  if (!titulo) throw new Error('exportarPestanaPdf: falta el título de la pestaña')
  const cfg = loadConfig()
  const g = makeGoogleClient({ config: cfg, scopes: WRITE_SCOPES })
  const hoja = (await g.getSheetMeta(id)).find((h) => h.title?.toLowerCase() === titulo.toLowerCase() || h.title?.toLowerCase().includes(titulo.toLowerCase()))
  if (!hoja) throw new Error(`No encontré la pestaña "${titulo}"`)
  // Token del Service Account (mismo mecanismo interno del cliente; el export no está en la API JSON).
  const client = await new GoogleAuth({ keyFile: resolveKeyPath(cfg), scopes: WRITE_SCOPES }).getClient()
  const t = await client.getAccessToken()
  const token = typeof t === 'string' ? t : t?.token
  // fitw + gridlines off + sin encabezados/pies de página: lo más parecido a lo que se ve en pantalla.
  const params = new URLSearchParams({ format: 'pdf', gid: String(hoja.sheetId), size: 'A4', portrait: 'true', fitw: 'true', scale: '4', gridlines: 'false', printtitle: 'false', sheetnames: 'false', fzr: 'false', range: rango })
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?${params}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`export falló: ${res.status} ${await res.text().catch(() => '')}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(salida, buf)
  return { salida, bytes: buf.length, titulo: hoja.title }
}

async function main() {
  if (!TITULO) { console.error('Falta el nombre de la pestaña. Uso: exportar-pestana-pdf.mjs "Titulo" [A1:J46] [salida.pdf]'); process.exit(1) }
  const r = await exportarPestanaPdf({ titulo: TITULO, rango: RANGO, salida: SALIDA })
  console.log(`✔ ${r.titulo} → ${r.salida} (${r.bytes} bytes, rango ${RANGO})`)
}

// SÓLO CORRE SI SE LO INVOCA DIRECTO. Sin este guard, importar el módulo exportaba una pestaña.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exitCode = 1 })
}
