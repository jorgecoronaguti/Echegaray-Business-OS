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
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { loadEnvLocalInto } from './lib/env-file.mjs'
import { mismosDatosReales } from './lib/snapshot-diff.mjs'
import { COBRANZAS, COMPRAS, PESTANAS, rangoFilas } from '../orquestador/lib/columnas-por-encabezado.mjs'
import { conEncabezado } from '../orquestador/lib/columnas-lectura.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SALIDA = join(ROOT, 'src/features/flujo-caja/data/calendario-snapshot.json')
const SPREADSHEET_ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

// Carga .env.local (si existe) sin pisar variables ya presentes en el entorno
// real: en la VM mandan las env vars del sistema; en local, el archivo las cubre.
// El parser (scripts/lib/env-file.mjs) interpreta comillas y escapes del formato
// de Vercel; por ejemplo, GOOGLE_SERVICE_ACCOUNT_JSON entre comillas.
loadEnvLocalInto(process.env, join(ROOT, '.env.local'))

// Credencial de Google: primero GOOGLE_SERVICE_ACCOUNT_JSON (contenido JSON o
// ruta a un archivo); si no está, el archivo local (gitignorado).
function cargarServiceAccount() {
  const desdeEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (desdeEnv) {
    const crudo = desdeEnv.startsWith('{') ? desdeEnv : readFileSync(desdeEnv, 'utf8')
    return JSON.parse(crudo)
  }
  const credPath = join(ROOT, 'scripts/google_workspace/credentials/service-account.json')
  if (!existsSync(credPath)) {
    console.error(
      'No hay credencial de Google: definí GOOGLE_SERVICE_ACCOUNT_JSON (JSON o ruta) ' +
        'o proveé scripts/google_workspace/credentials/service-account.json',
    )
    process.exit(1)
  }
  return JSON.parse(readFileSync(credPath, 'utf8'))
}

const sa = cargarServiceAccount()
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

// Rangos alineados a la estructura REAL del Sheet (25/07). El rediseño de las pestañas del Flujo de
// Caja renombró/partió varias: 02_Cobranzas→Cobranzas, Cheques→Cheques Emitidos/Recibidos, Caja→CAJA,
// y RESUMEN dejó de existir. Un solo rango a una pestaña inexistente tira 400 en TODO el batchGet y la
// web se queda sin calendario — por eso este script quedó fallando. El saldo de arranque ahora sale de
// CAJA!A5 (DISPONIBILIDADES). Cheques Emitidos tiene banda-resumen arriba: se lee desde A1 y el filtro
// por tipo (ECHEQ/CHEQUE) del loop saltea el encabezado.
// Cobranzas y Compras se leen DESDE SU FILA DE RÓTULOS (14/09/2026): cada índice sale de esa fila.
const rangos = [rangoFilas('Cobranzas', PESTANAS.Cobranzas.filaEncabezado, 200), rangoFilas('Compras', PESTANAS.Compras.filaEncabezado, 940), 'Cheques Emitidos!A1:N997', "'Tarjeta de Credito'!A3:K200", 'CAJA!A5']
const params = rangos.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
const res = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params}&valueRenderOption=UNFORMATTED_VALUE`,
  { headers: { Authorization: `Bearer ${access_token}` } },
)
// El cuerpo del 400 nombra el rango culpable ("Unable to parse range: …"): incluirlo hace que la
// próxima vez que una pestaña se renombre, el error diga cuál, en vez de un "sheets: 400" mudo.
if (!res.ok) throw new Error(`sheets: ${res.status} — ${(await res.text()).slice(0, 300)}`)
const data = await res.json()
const [cobranzas, compras, cheques, tarjeta, caja] = data.valueRanges.map((v) => v.values ?? [])
// Con «Obra» insertada (Compras L, Cobranzas H) los índices fijos leían la columna de al lado. Un rótulo
// que falta rompe la corrida con su nombre: el calendario no se publica con montos de otra columna.
const cob = conEncabezado(cobranzas, 'Cobranzas', { estado: COBRANZAS.estado, fecha: COBRANZAS.fechaCobro, total: COBRANZAS.total, cliente: COBRANZAS.cliente, unidad: 'Unidad' })
const cmp = conEncabezado(compras, 'Compras', {
  estado: COMPRAS.estado, tipoPago: COMPRAS.tipoPago, vence: 'Fecha prevista de pago (día)', total: COMPRAS.total,
  proveedor: COMPRAS.proveedor, unidad: COMPRAS.unidad, concepto: COMPRAS.concepto, detalle: COMPRAS.detalle,
})

const texto = (r, i) => String((r.length > i ? r[i] : null) ?? '').trim()
const numero = (r, i) => (typeof r[i] === 'number' ? r[i] : null)
const serialAIso = (s) => new Date(Math.round((s - 25569) * 86400 * 1000)).toISOString().slice(0, 10)

const movimientos = []
for (const r of cob.datos) {
  const estado = texto(r, cob.idx.estado)
  const fecha = numero(r, cob.idx.fecha)
  const monto = numero(r, cob.idx.total)
  if (!estado || estado === 'Cobrado' || fecha === null || !monto) continue
  movimientos.push({
    fecha: serialAIso(fecha),
    tipo: 'cobro',
    quien: texto(r, cob.idx.cliente) || 'Cliente sin nombre',
    detalle: `${texto(r, cob.idx.unidad)} · ${estado}`,
    monto,
  })
}
const MEDIOS_APARTE = new Set(['cheque', 'echeq', 'tarjeta crédito'])
for (const r of cmp.datos) {
  // Estado por RÓTULO desde el 14/09/2026. Se leía por posición: la col 24, y cuando se insertó una columna Y(24) pasó a ser
  // "Tipo de Costo" (Directo/Indirecto): leer 24 hacía que el filtro NUNCA diera true y Compras
  // aportara CERO pagos al calendario, incluso con el 400 ya resuelto.
  const estado = texto(r, cmp.idx.estado)
  if (estado !== 'Pendiente' && estado !== 'Proyectado') continue
  if (MEDIOS_APARTE.has(texto(r, cmp.idx.tipoPago).toLowerCase())) continue
  const fecha = numero(r, cmp.idx.vence)
  const monto = numero(r, cmp.idx.total)
  if (fecha === null || !monto) continue
  movimientos.push({
    fecha: serialAIso(fecha),
    tipo: 'pago',
    quien: texto(r, cmp.idx.proveedor) || 'Proveedor sin nombre',
    detalle: [texto(r, cmp.idx.unidad), texto(r, cmp.idx.concepto) || texto(r, cmp.idx.detalle), estado === 'Proyectado' ? 'proyectado' : '']
      .filter(Boolean)
      .join(' · '),
    monto: -monto,
  })
}
for (const r of cheques) {
  const tipo = texto(r, 0).toUpperCase()
  if (tipo !== 'ECHEQ' && tipo !== 'CHEQUE') continue // saltea la banda-resumen y el encabezado
  if (texto(r, 10).toUpperCase() === 'SI') continue // K = DEBITADO: ya salió de la cuenta
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
// Saldo de arranque = DISPONIBILIDADES de la pestaña CAJA (CAJA!A5): bancos + caja + valores, BRUTO
// (antes de restar los cheques emitidos). Es el mismo número que "Plata disponible hoy". A partir de
// acá el calendario resta día a día los cheques/pagos futuros — por eso el arranque debe ser el bruto
// y no la LIQUIDEZ NETA (que ya descuenta los cheques emitidos), o se contarían dos veces.
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

// Evitar reescrituras (y por lo tanto commits/deploys) cuando lo único que
// cambiaría es `leidoEn`: se compara contra el snapshot existente ignorando ese
// campo. Solo si cambió algún dato real (saldoHoy/vencidos/dias/totales) se
// reescribe todo el archivo, incluido leidoEn.
const anterior = existsSync(SALIDA) ? JSON.parse(readFileSync(SALIDA, 'utf8')) : null
if (anterior && mismosDatosReales(snapshot, anterior)) {
  console.log(`sin cambios de datos: ${movimientos.length} movimientos, ${vencidos.length} vencidos (no se reescribe el snapshot)`)
  process.exit(0)
}

mkdirSync(dirname(SALIDA), { recursive: true })
writeFileSync(SALIDA, JSON.stringify(snapshot, null, 1))
console.log(`snapshot actualizado: ${movimientos.length} movimientos, ${vencidos.length} vencidos -> ${SALIDA}`)
