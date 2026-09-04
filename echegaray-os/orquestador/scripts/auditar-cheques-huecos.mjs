// QUÉ LE FALTA AL CRUCE DE CHEQUES PARA CERRAR. Read-only: no escribe una sola celda.
//
//   node orquestador/scripts/auditar-cheques-huecos.mjs
//
// Sale 1 si hay un PAGADO SIN BAJA, que es el único hueco que ensucia un número publicado.
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { huecosDeCruce } from '../lib/cheques-huecos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const $ = (n) => `$${Math.round(n).toLocaleString('es-AR')}`
const num = (x) => {
  const s = String(x ?? '').replace(/[$\s.]/g, '').replace(',', '.').replace(/[()]/g, '')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig() })
  // El REGISTRO de Cheques Emitidos arranca en la 27 (26 es su encabezado propio, no el de la hoja).
  const ch = await google.readSheetValues(ID, "'Cheques Emitidos'!A27:M300")
  const cheques = (ch ?? []).filter((f) => f && f[4]).map((f, i) => ({
    fila: i + 27, proveedor: f[4], monto: num(f[5]), comprobante: f[7], debitado: f[10], estadoOs: f[12],
  }))
  const co = await google.readSheetValues(ID, 'Compras!A4:AN2000')
  const compras = (co ?? []).filter((f) => f && f[4]).map((f, i) => ({
    fila: i + 4, proveedor: f[4], monto: num(f[14]), comprobante: f[7], saldoPendiente: num(f[37]),
  }))

  const r = huecosDeCruce(cheques, compras)
  const t = r.totales
  console.log(`CHEQUES ${t.cheques} · sin N° de comprobante ${t.sinNumeroDeComprobante} (${$(t.montoSinNumero)})`)

  console.log(`\n① DEUDA QUE YA SE PAGÓ Y SIGUE MARCADA — ${$(t.montoPagadoSinBaja)}`)
  if (!r.pagadoSinBaja.length) console.log('   ✓ ninguna')
  for (const h of r.pagadoSinBaja) {
    console.log(`   ▲ ${h.proveedor}: pendiente ${$(h.pendienteUsd)} y cheques DEBITADOS por ${$(h.chequesUsd)}`)
    console.log(`      cheques  fila(s) ${h.cheques.map((c) => `${c.fila} (${$(c.monto)})`).join(' · ')}`)
    console.log(`      facturas fila(s) ${h.facturas.map((c) => `${c.fila} (${$(c.pendiente)})`).join(' · ')}`)
  }

  console.log(`\n② CHEQUES DE UN PROVEEDOR QUE NO ESTÁ EN COMPRAS — ${$(t.montoSinFactura)}`)
  if (!r.sinFactura.length) console.log('   ✓ ninguno')
  for (const h of r.sinFactura) console.log(`   ▲ ${h.proveedor.padEnd(30)} ${$(h.monto).padStart(13)}  fila(s) ${h.filas.join(', ')}`)

  console.log(`\n③ CHEQUES SIN DIAGNÓSTICO (ni ✓ ni ▲) — ${$(t.montoMudo)}`)
  if (!r.mudos.length) console.log('   ✓ ninguno')
  for (const c of r.mudos) console.log(`   ▲ fila ${String(c.fila).padStart(3)} ${c.proveedor.padEnd(28)} ${$(c.monto).padStart(13)}${c.debitado ? '  DEBITADO' : ''}`)

  console.log('\nNinguno de estos se arregla solo: el número de comprobante lo carga una persona.')
  if (r.pagadoSinBaja.length) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exitCode = 2 })
}
