#!/usr/bin/env node
// ¿TODAS LAS PESTAÑAS SIGUEN EL MISMO DISEÑO? — el control que faltaba, medido contra el archivo.
//
// POR QUÉ (05/09/2026). El dueño pidió unificar el diseño de todo el archivo y, en la misma vuelta,
// «minimalismo extremo … sin aclaraciones ni explicaciones de nada». Había cuatro auditores y
// ninguno podía contestar ninguna de las dos cosas: `auditar-pantalla` mide defectos (texto cortado,
// fecha como moneda), `censo-numeros-pegados` mide fórmulas, `auditar-rangos-fosilizados` mide
// rangos y `auditar-reglas-de-oro` mide las nueve reglas. La FORMA —el encabezado, la numeración de
// bloques y la prosa— no la miraba nadie.
//
// LEE Y NO ESCRIBE. Una sola llamada de valores por pestaña (`readSheetValues` con render FORMULA,
// para ver también los literales escondidos adentro de un `=IF(...;"…";"…")`, que es donde estaban
// las glosas más largas de Jornales).
//
//   node orquestador/scripts/auditar-diseno-unificado.mjs [pestaña] [--detalle]
//
// Sale con 1 si hay hallazgos, para poder encadenarlo. Es un REPORTE: su ≠0 no rompe el pipeline.

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { auditarDiseno, resumen, enAlcance, EXCLUIDAS } from '../lib/diseno-unificado.mjs'
import { PESTANAS, avisarSinCobertura } from './formato-pestanas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const SOLO = process.argv.slice(2).find((a) => !a.startsWith('--'))
const DETALLE = process.argv.includes('--detalle')

const colLetra = (n) => { let s = ''; for (let i = n - 1; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  avisarSinCobertura(meta.map((h) => h.title))
  const alto = new Map(meta.map((h) => [h.title, h.rows ?? 0]))

  const lista = (SOLO ? PESTANAS.filter((p) => p.titulo.toLowerCase().includes(SOLO.toLowerCase())) : PESTANAS)
  let total = 0
  let miradas = 0

  for (const p of lista) {
    // LAS EXCLUIDAS SE NOMBRAN, NO SE SALTEAN EN SILENCIO. Un control que omite sin decirlo es
    // indistinguible de uno que revisó y no encontró nada: es el defecto que ya dejó OBRAS fuera de
    // todos los controles durante un mes.
    if (!enAlcance(p.titulo)) { console.log(`· ${p.titulo.padEnd(26)} fuera de alcance — ${EXCLUIDAS[p.titulo]}`); continue }
    const hasta = alto.get(p.titulo) || p.hastaFila
    const filas = await google
      .readSheetValues(ID, `${p.titulo}!A1:${colLetra(p.cols)}${hasta}`, { render: 'FORMULA' })
      .catch(() => null)
    if (!filas) { console.log(`  ${p.titulo.padEnd(26)} no pude leerla`); continue }
    miradas++
    const h = auditarDiseno(filas, { pestana: p.titulo })
    total += h.length
    if (!h.length) { console.log(`✓ ${p.titulo.padEnd(26)} conforme`); continue }
    console.log(`✖ ${p.titulo.padEnd(26)} ${h.length} desvío(s)`)
    for (const r of resumen(h)) {
      const donde = r.ejemplo.col ? `${r.ejemplo.col}${r.ejemplo.fila}` : `fila ${r.ejemplo.fila}`
      console.log(`     ${String(r.n).padStart(3)}× ${r.regla.padEnd(22)} ej. ${donde} — ${r.ejemplo.detalle}`)
    }
    if (DETALLE) for (const x of h) console.log(`        ${(x.col ?? '') + x.fila} · ${x.regla} · ${x.detalle}`)
  }

  console.log(`\n${total} desvío(s) del contrato en ${miradas} pestaña(s) del alcance `
    + `· ${Object.keys(EXCLUIDAS).length} excluidas por decisión del dueño`)
  process.exit(total ? 1 : 0)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(2) })
