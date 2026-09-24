#!/usr/bin/env node
// EL CUADRO 6 DE «Nómina»: EL PUENTE QUE HACE QUE NÓMINA MANDE SOBRE LO PROYECTADO DEL CASH FLOW.
//
// Pedido del dueño, 24/09/2026: «(A) Nómina manda: lo que edites es lo que sale en el Cash Flow, en el
// momento … pero tenés que cablear todo bien». El criterio entero está en `lib/nomina-puente.mjs`.
//
// «Nómina» está hecha a mano: este script toca SÓLO su cuadro 6 (lo agrega al pie la primera vez y
// después lo reescribe en el mismo lugar, ubicado por su rótulo) y los cinco rangos con nombre. Todo
// lo demás se lee para anclar las fórmulas y no se escribe.
//
//   node orquestador/scripts/nomina-puente-cash-flow.mjs           → muestra qué escribiría
//   node orquestador/scripts/nomina-puente-cash-flow.mjs --aplicar → lo escribe, publica los nombres y relee
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { bloquear, desbloquear, estaBloqueada } from '../lib/pestana-bloqueada.mjs'
import { pedidos } from '../lib/rangos-nombrados.mjs'
import { NOMBRES_PUENTE, NOMBRES_NOMINA_BASE, ROTULOS_FILAS_PUENTE, ubicarNomina, cuadroPuente } from '../lib/nomina-puente.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Nómina'
const APLICAR = process.argv.includes('--aplicar')
const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const grilla = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:A300`, { render: 'UNFORMATTED_VALUE' })
  const u = ubicarNomina(grilla)
  if (u.falta.length) throw new Error(`no encuentro en «${PESTAÑA}»: ${u.falta.join(' · ')}. No escribo nada.`)
  const { filas, filaInicio, filaDe, orden } = cuadroPuente(u)
  const rango = `'${PESTAÑA}'!A${filaInicio}:P${filaInicio + filas.length - 1}`
  console.log(`cuadro 6 → ${rango} (${u.filaPuente ? 'reescribe el que ya está' : 'nuevo, al pie'})`)
  console.log(`  anclas: parámetros f${u.filaParametros} · personas f${u.primeraPersona}–${u.ultimaPersona} · Oficina f${u.filaOficina} · TOTAL f${u.filaTotal} · cargas f${u.filaTotalCargas} · Dirección f${u.filaDireccion}`)
  if (!APLICAR) { for (const f of filas) console.log('  ', JSON.stringify(f).slice(0, 220)); return }

  const hoja = (await google.getSheetMeta(ID)).find((h) => h.title === PESTAÑA)
  if (!hoja) throw new Error(`no existe la pestaña ${PESTAÑA}`)
  const candada = await estaBloqueada({ query }, ID, PESTAÑA).catch(() => false)
  if (candada) await desbloquear({ query }, ID, PESTAÑA)
  try {
    const res = await google.updateSheetValues(ID, rango, filas, { yaGuardado: true })
    if (res?.protegido) throw new Error(`la guarda no dejó escribir el cuadro 6: ${res.motivo ?? 'sin motivo'}`)
    const existentes = await google.getNamedRanges(ID)
    const lista = Array.isArray(existentes) ? existentes : existentes?.namedRanges ?? []
    const destinos = [
      ...orden.map((k) => ({ name: NOMBRES_PUENTE[k], fila: filaDe(k), col: 4, cols: 12 })),
      // Lo que «Cargas Sociales» lee para seguir a Nómina (remuneración proyectada).
      { name: NOMBRES_NOMINA_BASE.total, fila: u.filaTotal, col: 4, cols: 12 },
      { name: NOMBRES_NOMINA_BASE.aportes, fila: u.filaParametros, col: 4 },
    ]
    await google.spreadsheetBatchUpdate(ID, pedidos(hoja.sheetId, destinos, lista))
  } finally {
    if (candada) await bloquear({ query }, ID, PESTAÑA, { motivo: 'el dueño edita — re-candada tras escribir el cuadro 6 (puente al Cash Flow)', por: 'OS' })
  }

  // ── LA EVIDENCIA: cada nombre releído por NOMBRE, con doce números ────────────────────────────────
  let mal = 0
  for (const k of orden) {
    const v = await google.readSheetValues(ID, NOMBRES_PUENTE[k], { render: 'UNFORMATTED_VALUE' })
    const fila = v?.[0] ?? []
    const nums = fila.filter((x) => typeof x === 'number')
    if (nums.length !== 12) { mal++; console.log(`  ✗ ${NOMBRES_PUENTE[k]}: ${JSON.stringify(fila).slice(0, 160)}`); continue }
    console.log(`  ✓ ${ROTULOS_FILAS_PUENTE[k].padEnd(20)} sep ${pesos(fila[8])} · oct ${pesos(fila[9])} · nov ${pesos(fila[10])} · dic ${pesos(fila[11])}`)
  }
  if (mal) { process.exitCode = 1; console.log('NO QUEDÓ BIEN: el libro va a caer a la proyección de antes en esas líneas.') }
}

main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1 }).finally(() => closePool().catch(() => {}))
