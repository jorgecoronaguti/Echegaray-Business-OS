#!/usr/bin/env node
// Exporta el calendario de cobros y pagos del Sheet real a un JSON commiteable.
// Es el gemelo de src/features/flujo-caja/services/calendarioReader.ts (misma
// lógica de mapeo; si se cambia una regla acá, cambiarla allá). Existe porque
// Vercel no tiene la credencial de Google como env var y el login de Vercel es
// interactivo: la web sirve el snapshot commiteado y, si la env var aparece
// algún día, pasa sola a lectura viva.
//
// Uso: node scripts/sync-calendario.mjs   (desde echegaray-os/)

import crypto from 'crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CRED = join(ROOT, 'scripts/google_workspace/credentials/service-account.json')
const SALIDA = join(ROOT, 'src/features/flujo-caja/data/calendario-snapshot.json')
const SPREADSHEET_ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

const sa = JSON.parse(readFileSync(CRED, 'utf8'))
const now = Math.floor(Date.now() / 1000)
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const input = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
})}`
const sig = crypto.createSign('RSA-SHA256').update(input).sign(sa.private_key).toString('base64url')
const tokRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${input}.${sig}` }),
})
const { access_token } = await tokRes.json()

const rangos = ['02_Cobranzas!A5:Q200', 'Compras!A5:Y940', 'Cheques!A2:L997', "'Tarjeta de Credito'!A3:K200", 'Caja!I7']
const params = rangos.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
const res = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params}&valueRenderOption=UNFORMATTED_VALUE`,
  { headers: { Authorization: `Bearer ${access_token}` } },
)
if (!res.ok) throw new Error(`sheets: ${res.status}`)
const data = await res.json()
const [cobranzas, compras, cheques, tarjeta, caja] = data.valueRanges.map((v) => v.values ?? [])

const texto = (r, i) => String((r.length > i ? r[i] : null) ?? '').trim()
const numero = (r, i) => (typeof r[i] === 'number' ? r[i] : null)
const serialAIso = (s) => new Date(Math.round((s - 25569) * 86400 * 1000)).toISOString().slice(0, 10)

const movimientos = []
for (const r of cobranzas) {
  const estado = texto(r, 14)
  const fecha = numero(r, 16)
  const monto = numero(r, 12)
  if (!estado || estado === 'Cobrado' || fecha === null || !monto) continue
  movimientos.push({
    fecha: serialAIso(fecha),
    tipo: 'cobro',
    quien: texto(r, 6) || 'Cliente sin nombre',
    detalle: `${texto(r, 5)} · ${estado}`,
    monto,
  })
}
const MEDIOS_APARTE = new Set(['cheque', 'echeq', 'tarjeta crédito'])
for (const r of compras) {
  const estado = texto(r, 24)
  if (estado !== 'Pendiente' && estado !== 'Proyectado') continue
  if (MEDIOS_APARTE.has(texto(r, 15).toLowerCase())) continue
  const fecha = numero(r, 16)
  const monto = numero(r, 14)
  if (fecha === null || !monto) continue
  movimientos.push({
    fecha: serialAIso(fecha),
    tipo: 'pago',
    quien: texto(r, 4) || 'Proveedor sin nombre',
    detalle: [texto(r, 8), texto(r, 11) || texto(r, 10), estado === 'Proyectado' ? 'proyectado' : '']
      .filter(Boolean)
      .join(' · '),
    monto: -monto,
  })
}
for (const r of cheques) {
  if (texto(r, 10).toUpperCase() === 'SI') continue
  const fecha = numero(r, 8)
  const monto = numero(r, 5)
  if (fecha === null || !monto) continue
  movimientos.push({
    fecha: serialAIso(fecha),
    tipo: 'cheque',
    quien: texto(r, 4) || 'Proveedor sin nombre',
    detalle: `${texto(r, 0)} N° ${texto(r, 1)}`,
    monto: -monto,
  })
}
for (const r of tarjeta) {
  if (texto(r, 9).toUpperCase() === 'SI') continue
  const fecha = numero(r, 7)
  const monto = numero(r, 4)
  if (fecha === null || !monto) continue
  movimientos.push({
    fecha: serialAIso(fecha),
    tipo: 'tarjeta',
    quien: texto(r, 2) || 'Proveedor sin nombre',
    detalle: 'débito de tarjeta',
    monto: -monto,
  })
}

const hoyIso = new Date().toISOString().slice(0, 10)
const vencidos = movimientos.filter((m) => m.fecha < hoyIso).sort((a, b) => a.fecha.localeCompare(b.fecha))
const futuros = movimientos.filter((m) => m.fecha >= hoyIso).sort((a, b) => a.fecha.localeCompare(b.fecha))
const saldoHoy = caja.length && typeof caja[0][0] === 'number' ? caja[0][0] : null

const porDia = new Map()
for (const m of futuros) {
  if (!porDia.has(m.fecha)) porDia.set(m.fecha, [])
  porDia.get(m.fecha).push(m)
}
let acumulado = saldoHoy ?? 0
const dias = [...porDia.entries()].map(([fecha, movs]) => {
  const neto = movs.reduce((s, m) => s + m.monto, 0)
  acumulado += neto
  return { fecha, movimientos: movs, neto, acumulado }
})

const snapshot = {
  saldoHoy,
  vencidos,
  dias,
  totalCobros: movimientos.filter((m) => m.monto > 0).reduce((s, m) => s + m.monto, 0),
  totalPagos: movimientos.filter((m) => m.monto < 0).reduce((s, m) => s + m.monto, 0),
  leidoEn: new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/San_Juan' }),
}

mkdirSync(dirname(SALIDA), { recursive: true })
writeFileSync(SALIDA, JSON.stringify(snapshot, null, 1))
console.log(`snapshot OK: ${movimientos.length} movimientos, ${vencidos.length} vencidos -> ${SALIDA}`)
