#!/usr/bin/env node
// Descarga IVA Ventas (emitidos, t:E) e IVA Compras (recibidos, t:R) vía la
// automation "mis-comprobantes" de Afip SDK. Usa la CLAVE FISCAL (no certificado):
// Afip SDK scrapea el portal Mis Comprobantes en su servidor y devuelve el listado
// estructurado -- la única vía que lista comprobantes RECIBIDOS, que ARCA no expone
// por web service oficial.
//
// Requiere:
//   credentials/clave-fiscal.txt  -> CUIT / CLAVE
//   credentials/afipsdk-token.txt -> ACCESS_TOKEN (cuenta gratis en app.afipsdk.com)
//
// Uso:
//   node scripts/arca/afipsdk-comprobantes.mjs R 01/06/2026 30/06/2026   # compras junio
//   node scripts/arca/afipsdk-comprobantes.mjs E 01/06/2026 30/06/2026   # ventas junio
// Salida: out/comprobantes-<t>-<desde>-<hasta>.json  (+ resumen IVA por consola)

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const DIR = dirname(fileURLToPath(import.meta.url))
const CRED = join(DIR, 'credentials')
const OUT = join(DIR, 'out')
mkdirSync(OUT, { recursive: true })

const readKV = (f) =>
  Object.fromEntries(
    readFileSync(join(CRED, f), 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
      }),
  )

const cred = readKV('clave-fiscal.txt')
let token
try {
  token = readKV('afipsdk-token.txt').ACCESS_TOKEN
} catch {
  console.error('Falta credentials/afipsdk-token.txt con ACCESS_TOKEN (cuenta gratis en https://app.afipsdk.com).')
  process.exit(2)
}

const tipo = (process.argv[2] || 'R').toUpperCase() // R recibidos (compras) | E emitidos (ventas)
const desde = process.argv[3] || '01/06/2026'
const hasta = process.argv[4] || '30/06/2026'

const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

async function crear() {
  const res = await fetch('https://app.afipsdk.com/api/v1/automations', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      automation: 'mis-comprobantes',
      params: {
        cuit: cred.CUIT,
        username: cred.CUIT,
        password: cred.CLAVE,
        filters: { t: tipo, fechaEmision: `${desde} - ${hasta}` },
      },
    }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`crear automation: ${res.status} ${JSON.stringify(j).slice(0, 300)}`)
  return j
}

async function esperar(id) {
  for (let intento = 0; intento < 60; intento++) {
    await new Promise((r) => setTimeout(r, 5000))
    const res = await fetch(`https://app.afipsdk.com/api/v1/automations/${id}`, { headers })
    const j = await res.json()
    if (j.status && j.status !== 'in_process') return j
    process.stdout.write('.')
  }
  throw new Error('timeout: la automation no terminó en 5 min')
}

const parseMonto = (v) => {
  if (typeof v === 'number') return v
  if (!v) return 0
  return Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0
}

// Suma IVA de un array de comprobantes tolerando distintos nombres de columna.
function resumirIva(items) {
  let neto = 0
  let iva = 0
  let total = 0
  for (const c of items) {
    const g = (...keys) => keys.map((k) => c[k]).find((x) => x !== undefined)
    neto += parseMonto(g('Imp. Neto Gravado', 'Neto Gravado', 'Imp Neto Gravado', 'neto'))
    iva += parseMonto(g('IVA', 'Imp. IVA', 'iva'))
    total += parseMonto(g('Imp. Total', 'Total', 'total'))
  }
  return { neto, iva, total, cantidad: items.length }
}

const inicio = await crear()
console.log(`automation creada (${inicio.id ?? 'sin id'}), esperando resultado…`)
const resultado = inicio.status === 'in_process' && inicio.id ? await esperar(inicio.id) : inicio
console.log('')

if (resultado.status && resultado.status !== 'success' && resultado.status !== 'finished') {
  console.error(`la automation terminó con estado "${resultado.status}": ${JSON.stringify(resultado).slice(0, 400)}`)
  process.exit(1)
}
const items = Array.isArray(resultado.data) ? resultado.data : (resultado.data?.comprobantes ?? resultado.comprobantes ?? [])
const salida = join(OUT, `comprobantes-${tipo}-${desde.replace(/\//g, '')}-${hasta.replace(/\//g, '')}.json`)
writeFileSync(salida, JSON.stringify(items, null, 1))

const r = resumirIva(items)
const etiqueta = tipo === 'R' ? 'IVA COMPRAS (recibidos)' : 'IVA VENTAS (emitidos)'
console.log(`${etiqueta} ${desde}–${hasta}: ${r.cantidad} comprobantes`)
console.log(`  Neto gravado: $ ${r.neto.toLocaleString('es-AR')}`)
console.log(`  IVA:          $ ${r.iva.toLocaleString('es-AR')}`)
console.log(`  Total:        $ ${r.total.toLocaleString('es-AR')}`)
console.log(`  Detalle -> ${salida}`)
