#!/usr/bin/env node
// ¿DICEN LO MISMO EL CASH FLOW SEMANAL Y EL MENSUAL? — sin escribir una sola celda.
//
// El control vive dentro del generador (`cash-flow-vistas.mjs` lo corre después de escribir, y si no
// cuadra el paso falla). Esto es la MISMA comparación, sobre la misma librería, en modo lectura: sirve
// para preguntarle al archivo cómo está AHORA sin tener que rehacer las dos pestañas — que es
// justamente lo que no se puede hacer para averiguarlo.
//
// Salida 0 si cuadra, 1 si no. Lee; nunca escribe.
//
//   node orquestador/scripts/auditar-cuadre-cash-flow.mjs

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { ref as refPestana } from '../lib/partir-pestana.mjs'
import { letra } from '../lib/cash-flow-matriz.mjs'
import { cuadre, guardaDeCobertura, linea, totalesDeVista } from '../lib/cash-flow-cuadre.mjs'
import { grillaSemanal } from '../lib/cash-flow-semanas.mjs'
import { grillaMeses } from '../lib/cash-flow-meses.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const AÑO = Number(process.env.ORQ_CF_ANIO || 2026)
// LECTURA Y NADA MÁS, TAMBIÉN EN EL PERMISO: el token que se emite no alcanza para escribir aunque el
// código quisiera. Mismo criterio que `auditar-conexion-flujo.mjs`.
const SCOPES_LECTURA = ['https://www.googleapis.com/auth/spreadsheets.readonly']
const peso = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: SCOPES_LECTURA })
  const hoy = new Date()
  const metas = [
    grillaSemanal({ hoy, anio: AÑO, refs: {} }).meta,
    grillaMeses({ anio: AÑO, refs: {}, hoy }).meta,
  ]
  const g = guardaDeCobertura(metas)
  for (const m of g.motivos) console.error(`⛔ geometría: ${m}`)

  const lecturas = []
  for (const meta of metas) {
    const fp = meta.footprint
    // UNFORMATTED_VALUE: los importes tienen que llegar como números. Un "$ 364.126.253" obligaría a
    // adivinar el separador decimal, y adivinarlo mal da un desvío inventado.
    const v = await google.readSheetValues(ID, `${refPestana(meta.pestana)}!A1:${letra(fp.cols - 1)}${fp.filas}`,
      { render: 'UNFORMATTED_VALUE' })
    lecturas.push(totalesDeVista(v, meta))
  }
  const r = cuadre(lecturas[0], lecturas[1])
  const [a, b] = metas.map((m) => m.pestana)
  console.log(`${r.comparadas} fila(s) comparadas entre "${a}" y "${b}" · tolerancia $1`)
  for (const l of r.fuera) console.log(`  ✗ ${linea(l, a, b)}`)
  for (const p of r.problemas.slice(0, 8)) console.log(`  ⚠ ${p}`)
  if (r.problemas.length > 8) console.log(`  ⚠ …y ${r.problemas.length - 8} fila(s) más que no se pudieron leer`)
  if (r.ok && g.ok) return console.log('✓ cuadran: las dos vistas dicen lo mismo del ejercicio.')
  const total = r.fuera.reduce((s, l) => s + Math.abs(l.delta), 0)
  console.log(`\n⛔ NO CUADRAN — ${r.fuera.length} fila(s), ${peso(total)} de diferencia absoluta acumulada.`)
  console.log('   Son dos cálculos independientes del mismo libro: si no dan igual, uno de los dos miente.')
  process.exitCode = 1
}

main().catch((e) => { console.error(`⛔ ${e.message}`); process.exitCode = 1 })
