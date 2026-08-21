#!/usr/bin/env node
// EL ESQUEMA DE COBROS DE LAS TRES OBRAS DE SAN FRANCISCO.
//
//   node orquestador/scripts/cobranzas-san-francisco-anticipos.mjs [--aplicar]
//
// Sin `--aplicar` muestra el plan celda por celda y NO escribe. La decisión del dueño (21/08/2026):
//
//   · los anticipos por inicio de obra se COBRAN —no se amortizan contra las certificaciones— y
//     tienen que quedar cancelados el 15/09/2026;
//   · de ahí en adelante todo es certificación de avance, QUINCENAL desde el 30/09;
//   · cambian las FECHAS de las certificaciones, no el criterio de avance: cada certificación
//     conserva su número y su importe.
//
// ═══ QUÉ SE TOCA Y QUÉ NO ═══
//
// Cobranzas es fuente: se lee, no se reescribe. Acá se tocan **once filas en estado Pendiente y
// ninguna Cobrada**. Ninguna fila con plata que ya entró cambia. Lo que se edita es la proyección,
// que es exactamente para lo que existe la columna Q.
//
// La columna que manda es **Q · Fecha cobro**. `R · Mes cobro` es `=TEXT(Q;"mmm-yy")` y se recalcula
// sola, y de ahí salen el Calendario de Cobros, CAJA y los dos Cash Flow. Por eso no hay que tocar
// ninguna de esas pestañas: se mueven porque se movió su origen. Escribir el mismo número en cuatro
// lugares es la forma de que cuatro lugares dejen de coincidir.
//
// ═══ EL ANTICIPO SE PARTE EN DOS, Y SIGUE SIENDO UNA FÓRMULA ═══
//
// `J67` no dice 20.000.000: dice `=40000000*50%`. El número tiene su origen escrito al lado, que es
// la regla de oro del archivo. Al partir el anticipo en dos quincenas las filas dicen
// `=40000000*25%`, no `10000000`. Si mañana cambia el contrato, cambia un lugar.
import { makeGoogleClient } from '../lib/google.mjs'
import { accessTokenFor } from '../lib/google-oauth.mjs'

const FLUJO = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const CUENTA = process.env.ORQ_SHEET_CUENTA || 'jorge@ecsas.com.ar'

/** Serial de Google Sheets: días desde el 30/12/1899. */
export const serie = (iso) => {
  const [a, m, d] = iso.split('-').map(Number)
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}

// Las fechas del esquema. Quincenal: fin de mes y mitad de mes.
export const F = {
  ANT_1: '2026-08-31',
  ANT_2: '2026-09-15', // ← los anticipos quedan cancelados acá
  CERT_1: '2026-09-30',
  CERT_2: '2026-10-15',
  CERT_3: '2026-10-30',
  CERT_4: '2026-11-14',
}

/** Las nueve certificaciones ya emitidas: sólo se mueve Q. */
export const CERTIFICACIONES = [
  { fila: 71, que: 'Pisos 1/4', q: F.CERT_1 },
  { fila: 72, que: 'Pisos 2/4', q: F.CERT_2 },
  { fila: 73, que: 'Pisos 3/4', q: F.CERT_3 },
  { fila: 74, que: 'Pisos 4/4', q: F.CERT_4 },
  { fila: 75, que: 'Instalaciones 1/4', q: F.CERT_1 },
  { fila: 76, que: 'Instalaciones 2/4', q: F.CERT_2 },
  { fila: 77, que: 'Instalaciones 3/4', q: F.CERT_3 },
  { fila: 78, que: 'Instalaciones 4/4', q: F.CERT_4 },
  { fila: 79, que: 'Entrepiso 1/1', q: F.CERT_1 },
]

/** Los dos anticipos pendientes se parten en dos quincenas cada uno. */
export const ANTICIPOS = [
  { fila: 67, filaNueva: 96, obra: 'Instalaciones Eléctricas', contrato: 40000000,
    h1: 'Anticipo inicio obra 50% $ 40.000.000 — 1ª de 2 cuotas quincenales',
    h2: 'Anticipo inicio obra 50% $ 40.000.000 — 2ª de 2 cuotas quincenales · cancela el anticipo' },
  { fila: 68, filaNueva: 97, obra: 'Entrepiso y Escaleras', contrato: 7728254,
    h1: 'Anticipo inicio obra 50% $ 7.728.254 — 1ª de 2 cuotas quincenales',
    h2: 'Anticipo inicio obra 50% $ 7.728.254 — 2ª de 2 cuotas quincenales · cancela el anticipo' },
]

/** La fila nueva copia la anatomía de su hermana: mismas fórmulas, con su propio número de fila. */
export function filaDeAnticipo(a, n) {
  return [
    `=IF(C${n}="";"";ROW()-4)`,                       // A · ID
    'N',                                              // B · Categoría
    serie('2026-07-31'),                              // C · Fecha emisión
    '', '',                                           // D, E
    'Civil',                                          // F · Unidad
    'San Francisco',                                  // G
    a.h2,                                             // H
    a.obra,                                           // I · Concepto
    `=${a.contrato}*25%`,                             // J · Monto neto — la mitad del anticipo del 50%
    '',                                               // K · IVA
    `=IF(SUM(X${n}:AA${n})=0;"";SUM(X${n}:AA${n}))`,  // L · Retenciones
    `=J${n}+K${n}-L${n}`,                             // M · TOTAL
    'Efectivo',                                       // N
    'Pendiente',                                      // O
    serie('2026-07-31'),                              // P · Fecha de Venta
    serie(F.ANT_2),                                   // Q · Fecha cobro
    `=TEXT(Q${n};"mmm-yy")`,                          // R · Mes cobro
    1,                                                // S · Probabilidad
    `=IF(M${n}="";"";M${n}*S${n})`,                   // T · Monto ponderado
    `=IF(J${n}="";"";IF(O${n}="Cobrado";"Cobrado";IF(O${n}="Pendiente";IF(Q${n}<TODAY();"Vencido";Q${n}-TODAY());O${n})))`,
    `=IF(J${n}="";"";IF(O${n}="Cobrado";"✓ Cobrado";IF(O${n}="Vencido";"▲ Vencido";IF(O${n}="Proyectado";"⊘ Proyectado";IF(Q${n}<TODAY();"▲ Vencido";IF(Q${n}-TODAY()<=7;"⇒ Por vencer";"· Vigente"))))))`,
  ]
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const g = makeGoogleClient({ auth: { getAccessToken: () => accessTokenFor(CUENTA) } })

  const antes = await g.readSheetValues(FLUJO, 'Cobranzas!A66:R97', { render: 'FORMATTED_VALUE' })
  console.log('═══ ANTES ═══')
  for (const r of [66, 67, 68, 71, 72, 73, 74, 75, 76, 77, 78, 79]) {
    const f = antes[r - 66] || []
    console.log(`  f${r}  ${String(f[14] || '').padEnd(10)} Q=${String(f[16] || '—').padEnd(12)} ${String(f[12] || '').padStart(16)}  ${String(f[8] || '').slice(0, 34)}`)
  }

  const escrituras = []
  for (const c of CERTIFICACIONES) {
    escrituras.push({ rango: `Cobranzas!Q${c.fila}`, valores: [[serie(c.q)]], que: `${c.que} → ${c.q}` })
  }
  for (const a of ANTICIPOS) {
    escrituras.push({ rango: `Cobranzas!H${a.fila}`, valores: [[a.h1]], que: `${a.obra} · rótulo 1ª cuota` })
    escrituras.push({ rango: `Cobranzas!J${a.fila}`, valores: [[`=${a.contrato}*25%`]], que: `${a.obra} · 1ª cuota = ${a.contrato}*25%` })
    escrituras.push({ rango: `Cobranzas!Q${a.fila}`, valores: [[serie(F.ANT_1)]], que: `${a.obra} · 1ª cuota → ${F.ANT_1}` })
    escrituras.push({ rango: `Cobranzas!A${a.filaNueva}:V${a.filaNueva}`, valores: [filaDeAnticipo(a, a.filaNueva)], que: `${a.obra} · 2ª cuota → ${F.ANT_2} (fila nueva ${a.filaNueva})` })
  }

  console.log('\n═══ EL PLAN ═══')
  escrituras.forEach((e) => console.log(`  ${e.rango.padEnd(24)} ${e.que}`))

  if (!aplicar) { console.log('\n(sin --aplicar) no escribí nada.'); return }

  for (const e of escrituras) {
    await g.updateSheetValues(FLUJO, e.rango, e.valores)
  }
  console.log(`\n✓ ${escrituras.length} escrituras hechas.`)

  const despues = await g.readSheetValues(FLUJO, 'Cobranzas!A66:R97', { render: 'FORMATTED_VALUE' })
  console.log('\n═══ DESPUÉS, releído del Sheet ═══')
  for (const r of [66, 67, 68, 71, 72, 73, 74, 75, 76, 77, 78, 79, 96, 97]) {
    const f = despues[r - 66] || []
    if (!String(f[8] || '').trim()) continue
    console.log(`  f${r}  ${String(f[14] || '').padEnd(10)} Q=${String(f[16] || '—').padEnd(12)} R=${String(f[17] || '—').padEnd(9)} ${String(f[12] || '').padStart(16)}  ${String(f[8] || '').slice(0, 34)}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error('falló:', e.message); process.exit(1) })
