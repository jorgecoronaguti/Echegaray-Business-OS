#!/usr/bin/env node
// AUDITORÍA RENGLÓN POR RENGLÓN: ¿EL CASH FLOW SEMANAL Y EL MENSUAL MUESTRAN LO QUE DICE EL LIBRO?
//
// Pedido del dueño (24/09/2026): «tenés que auditar que las pestañas de cash flow semanal y mensual
// estén reflejando bien todo, porque voy a tocar las pestañas de nómina, cargas sociales e impuestos».
//
// Un control nunca se valida contra la misma información que produce: acá NO se leen las fórmulas del
// Sheet para creerles. Se relee `_MOVIMIENTOS` (valores ya calculados, incluidas las fórmulas vivas
// que apuntan a Nómina) y se RECALCULA en código cada celda de cada renglón por rubro de las dos
// vistas, con la misma regla que declaran sus encabezados:
//   · real       = Σ movimientos REAL del período y del rubro
//   · proyectado = Σ PROYECTADO + COMPROMETIDO del período, + los VENCIDOS en el período que contiene
//                  la fecha del saldo (CAJA_FECHA_SALDO)
// y se compara contra lo que la vista muestra. Sólo lee.
//
//   node orquestador/scripts/auditar-cash-flow-contra-libro.mjs
import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const pesos = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')
const iso = (s) => new Date(Date.UTC(1899, 11, 30) + s * 86400000).toISOString().slice(0, 10)

/** El fin (exclusivo) del período que empieza en `d`: mes calendario o semana. */
const finMes = (d) => { const f = new Date(Date.UTC(1899, 11, 30) + d * 86400000); return Math.round((Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 1) - Date.UTC(1899, 11, 30)) / 86400000) }

function auditar(nombre, grilla, libro, fechaSaldo, fin) {
  const cab = grilla[6] ?? []
  const cols = cab.map((v, j) => (typeof v === 'number' && v > 40000 ? { j, d: v } : null)).filter(Boolean)
  let seccion = null
  const fallas = []
  let celdas = 0
  grilla.forEach((r, i) => {
    const rot = String(r?.[0] ?? '').trim()
    if (/^(Ingresos|Egresos) (reales|proyectados)$/.test(rot)) { seccion = rot; return }
    if (/^(Variación|Saldo final|Por cliente)/.test(rot)) { seccion = null; return }
    if (!seccion || !rot.startsWith('· ') || rot === '· Otros') return
    const rubro = rot.slice(2)
    const real = /reales/.test(seccion)
    const entra = /^Ingresos/.test(seccion)
    for (const { j, d } of cols) {
      const hasta = fin(d)
      let esperado = 0
      for (const m of libro) {
        if (m.rubro !== rubro) continue
        // Los renglones de INGRESOS cuentan sólo lo que entra (su fórmula filtra signo +1); los de
        // egresos, todo el rubro con su signo — igual que la vista.
        if (entra && m.signo !== 1) continue
        const enPeriodo = m.fecha >= d && m.fecha < hasta
        if (real) { if (enPeriodo && m.estado === 'REAL') esperado += m.signo * m.importe; continue }
        if (enPeriodo && (m.estado === 'PROYECTADO' || m.estado === 'COMPROMETIDO')) esperado += m.signo * m.importe
        if (m.estado === 'VENCIDO' && d <= fechaSaldo && hasta > fechaSaldo) esperado += m.signo * m.importe
      }
      if (!entra) esperado = -esperado
      const visto = Number(r[j]) || 0
      celdas++
      if (Math.abs(visto - esperado) >= 1) fallas.push({ fila: i + 1, rubro, seccion, periodo: iso(d), visto, esperado })
    }
  })
  console.log(`\n${nombre}: ${celdas} celda(s) de rubro auditadas · ${fallas.length} no coinciden con el libro`)
  for (const f of fallas.slice(0, 40)) console.log(`  ✗ f${f.fila} ${f.seccion} · ${f.rubro} · ${f.periodo}: muestra ${pesos(f.visto)}, el libro da ${pesos(f.esperado)}`)
  return fallas.length
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  const [mov, men, sem, fs] = await Promise.all([
    google.readSheetValues(ID, "'_MOVIMIENTOS'!A2:H", { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, "'Cash Flow Mensual'!A1:N60", { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, "'Cash Flow Semanal'!A1:BF60", { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, 'CAJA_FECHA_SALDO', { render: 'UNFORMATTED_VALUE' }),
  ])
  const libro = (mov ?? []).filter((r) => typeof r[0] === 'number' && Number.isFinite(Number(r[2])))
    .map((r) => ({ fecha: r[0], signo: Number(r[1]), importe: Number(r[2]), rubro: String(r[5] ?? ''), estado: String(r[7] ?? '') }))
  const fechaSaldo = Number(fs?.[0]?.[0])
  console.log(`libro: ${libro.length} movimiento(s) · saldo al ${iso(fechaSaldo)}`)
  const a = auditar('Cash Flow Mensual', men, libro, fechaSaldo, finMes)
  // El Semanal corta en el 31/12 del año (su última semana es `MIN(inicio+7; 1/1 del año siguiente)`):
  // lo que sale en enero del año siguiente no está en ninguna de las dos vistas. Es el horizonte.
  const finAnio = (d) => { const a = new Date(Date.UTC(1899, 11, 30) + d * 86400000).getUTCFullYear(); return Math.round((Date.UTC(a + 1, 0, 1) - Date.UTC(1899, 11, 30)) / 86400000) }
  const b = auditar('Cash Flow Semanal', sem, libro, fechaSaldo, (d) => Math.min(d + 7, finAnio(d)))
  const fuera = libro.filter((m) => iso(m.fecha) >= '2027-01-01' && m.signo === -1 && m.estado !== 'REAL')
  if (fuera.length) {
    console.log(`\nHORIZONTE: ${fuera.length} egreso(s) por ${pesos(fuera.reduce((x, m) => x + m.importe, 0))} salen en 2027 y no se ven en ninguna vista:`)
    for (const m of fuera.slice(0, 12)) console.log(`  · ${iso(m.fecha)} ${m.rubro} ${pesos(m.importe)}`)
  }
  if (a + b) process.exitCode = 1
  else console.log('\n✓ las dos vistas muestran exactamente lo que dice el libro, renglón por renglón')
}

main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1 })
