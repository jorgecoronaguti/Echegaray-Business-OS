#!/usr/bin/env node
// ¿HAY EN EL ARCHIVO UN CONTROL QUE NO PUEDA DAR ROJO? — sólo lee, nunca escribe.
//
// Corre `controlesMudos` (lib/control-mudo.mjs, con el porqué entero) sobre todas las pestañas del
// alcance. El defecto que lo hizo nacer: `Estructura!B28` y `Recurrentes!B24` publican «⇒ Cobertura
// fiscal de esta pestaña» con la fórmula viva y las cinco filas de insumo vacías, así que devuelven
// `""` pase lo que pase. Los cuatro auditores del archivo dan verde sobre las dos.
//
// Salida 0 si no hay ninguno, 1 si hay.
//
//   node orquestador/scripts/auditar-controles-mudos.mjs [pestaña]

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { PESTANAS } from './formato-pestanas.mjs'
import { controlesMudos } from '../lib/control-mudo.mjs'
import { enAlcance } from '../lib/diseno-unificado.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const SOLO = process.argv[2]
// LECTURA Y NADA MÁS, TAMBIÉN EN EL PERMISO: el token no alcanza para escribir aunque el código
// quisiera. Mismo criterio que `auditar-cuadre-cash-flow.mjs`.
const SCOPES_LECTURA = ['https://www.googleapis.com/auth/spreadsheets.readonly']
const colLetra = (n) => { let s = ''; for (let i = n - 1; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: SCOPES_LECTURA })
  const lista = PESTANAS
    .filter((p) => enAlcance(p.titulo))
    .filter((p) => !SOLO || p.titulo.toLowerCase().includes(SOLO.toLowerCase()))

  // El alto se pregunta, no se declara: es la lección de `censo-numeros-pegados`, donde un
  // `hastaFila` viejo dejó 45 defectos abajo del rango que el auditor miraba.
  const meta = await google.getSheetMeta(ID)
  const alto = new Map(meta.map((h) => [h.title, h.rows ?? 0]))

  let total = 0
  for (const p of lista) {
    const hasta = alto.get(p.titulo) || p.hastaFila
    const grid = await google.readSheetGrid(ID, `'${p.titulo}'!A1:${colLetra(p.cols)}${hasta}`).catch(() => null)
    if (!grid) { console.log(`  ${p.titulo.padEnd(24)} no pude leerla`); continue }
    const mudos = controlesMudos(grid)
    if (!mudos.length) { console.log(`✓ ${p.titulo}`); continue }
    total += mudos.length
    console.log(`✖ ${p.titulo.padEnd(24)} ${mudos.length} control(es) que no pueden dar rojo`)
    for (const m of mudos) {
      console.log(`     ${m.col}${m.fila}  ${m.rotulo.slice(0, 46)}`)
      console.log(`        ${m.formula.slice(0, 78)}`)
      console.log(`        vacías: ${m.vacias.join(' · ')}`)
    }
  }
  console.log(`\n${total ? `⚠ ${total} control(es) publicados que no pueden dar rojo` : '✓ ningún control mudo'}`)
  if (total) process.exitCode = 1
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
