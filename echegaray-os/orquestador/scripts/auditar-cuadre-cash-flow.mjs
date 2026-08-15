#!/usr/bin/env node
// ¿DICEN LO MISMO EL CASH FLOW SEMANAL Y EL MENSUAL? — sin escribir una sola celda.
//
// El control vive dentro del generador (`cash-flow-vistas.mjs` lo corre después de escribir, y si no
// cuadra el paso falla). Esto es la MISMA comparación, sobre la misma librería, en modo lectura: sirve
// para preguntarle al archivo cómo está AHORA sin tener que rehacer las dos pestañas — que es
// justamente lo que no se puede hacer para averiguarlo.
//
// ═══ LÍMITE DECLARADO: "✓ cuadran" NO PRUEBA QUE `CAJA_TOTAL_DISPONIBLE` ESTÉ BIEN (15/08/2026) ═══
//
// Las dos vistas anclan su saldo inicial al MISMO rango con nombre (`=N(CAJA_TOTAL_DISPONIBLE)`, ver
// `cash-flow-ancla-saldo.mjs`): si ese número está mal —de hecho estuvo mal $51.286.662 mientras el
// efectivo de CAJA se calculaba con el modelo viejo (sellado contra el histórico, no contra el conteo
// manual)—, Semanal y Mensual se mueven JUNTOS al mismo valor incorrecto y este control sigue diciendo
// "✓ cuadran": UN CONTROL NUNCA SE VALIDA CONTRA LA MISMA INFORMACIÓN QUE PRODUCE, y acá las dos
// "fuentes" comparadas comparten ese único origen. Este auditor prueba que Semanal y Mensual son
// CONSISTENTES ENTRE SÍ — no que el número del que parten sea correcto.
//
// EL CONTROL QUE SÍ LO DETECTARÍA: uno que recalcule `CAJA_TOTAL_DISPONIBLE` desde el dato crudo —el
// conteo manual, el extracto del banco (`_BANCO_RAW`) y `_MOVIMIENTOS`— SIN leer el nombre publicado,
// y compare ese recálculo contra lo que CAJA publica hoy (la misma idea que `conciliar-caja-vs-
// cashflow.mjs` ya aplica al PISO futuro, aplicada a la FOTO de hoy). No es barato: la fórmula de
// `CAJA_TOTAL_DISPONIBLE` vive repartida en `caja-grilla.mjs` + `caja-disponibilidades.mjs` +
// `caja-posterior-al-corte.mjs` (~1.400 líneas), y reimplementarla aparte para "verificarla" es
// exactamente el riesgo que este archivo ya pagó una vez ("dos modelos que deberían describir la
// misma realidad" — dos cálculos independientes del mismo libro que YA divergieron por su cuenta).
// Por ahora esto queda como límite escrito, no como código: que el próximo que lea "✓ cuadran" sepa
// qué pregunta esa firma NO contesta.
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
  // "Cuadran" = son consistentes entre sí, NO que el saldo del que arrancan sea correcto (ver el
  // límite declarado en la cabecera): las dos leen el mismo CAJA_TOTAL_DISPONIBLE.
  if (r.ok && g.ok) return console.log('✓ cuadran entre sí: las dos vistas dicen lo mismo del ejercicio (no valida CAJA_TOTAL_DISPONIBLE — ver la cabecera).')
  const total = r.fuera.reduce((s, l) => s + Math.abs(l.delta), 0)
  console.log(`\n⛔ NO CUADRAN — ${r.fuera.length} fila(s), ${peso(total)} de diferencia absoluta acumulada.`)
  // Independientes en CÓMO se arman fila a fila (dos grillas, dos fórmulas), NO en de dónde arrancan:
  // las dos anclan al mismo CAJA_TOTAL_DISPONIBLE. Ver el límite declarado arriba, en la cabecera.
  console.log('   Son dos cálculos que arman su propia grilla fila a fila: si no dan igual, uno de los dos miente.')
  process.exitCode = 1
}

main().catch((e) => { console.error(`⛔ ${e.message}`); process.exitCode = 1 })
