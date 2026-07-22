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

async function main() {
  if (!TITULO) { console.error('Falta el nombre de la pestaña. Uso: exportar-pestana-pdf.mjs "Titulo" [A1:J46] [salida.pdf]'); process.exit(1) }
  const cfg = loadConfig()
  const g = makeGoogleClient({ config: cfg, scopes: WRITE_SCOPES })
  const hoja = (await g.getSheetMeta(ID)).find((h) => h.title?.toLowerCase() === TITULO.toLowerCase() || h.title?.toLowerCase().includes(TITULO.toLowerCase()))
  if (!hoja) { console.error(`No encontré la pestaña "${TITULO}"`); process.exit(1) }
  // Token del Service Account (mismo mecanismo interno del cliente; el export no está en la API JSON).
  const client = await new GoogleAuth({ keyFile: resolveKeyPath(cfg), scopes: WRITE_SCOPES }).getClient()
  const t = await client.getAccessToken()
  const token = typeof t === 'string' ? t : t?.token
  // fitw + gridlines off + sin encabezados/pies de página: lo más parecido a lo que se ve en pantalla.
  const params = new URLSearchParams({ format: 'pdf', gid: String(hoja.sheetId), size: 'A4', portrait: 'true', fitw: 'true', scale: '4', gridlines: 'false', printtitle: 'false', sheetnames: 'false', fzr: 'false', range: RANGO })
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${ID}/export?${params}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) { console.error(`export falló: ${res.status} ${await res.text().catch(() => '')}`); process.exit(1) }
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(SALIDA, buf)
  console.log(`✔ ${hoja.title} → ${SALIDA} (${buf.length} bytes, rango ${RANGO})`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
