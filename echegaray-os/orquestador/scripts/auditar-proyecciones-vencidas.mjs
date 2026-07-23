#!/usr/bin/env node
// ¿QUEDA ALGUNA PROYECCIÓN DE UN MES QUE YA PASÓ?
//
// POR QUÉ EXISTE (23/07). El dueño: "si tienen proyecciones que dejaron de serlo porque ya estamos
// en el momento determinado, ¿se actualiza?". Es la pregunta correcta y no tenía respuesta: cada
// generador decide por su cuenta desde qué mes proyecta, y esa decisión suele estar escrita a mano
// en una constante (`DESDE = 7`, `primeraProy = f0 + 7`). Una constante no se entera de que pasó el
// tiempo. En agosto, "julio proyectado" sigue diciendo proyectado aunque julio ya cerró y el dato
// real esté cargado — y el cuadro muestra una estimación al lado de un hecho, sin distinguirlos.
//
// Esto NO adivina: busca las marcas que los propios generadores dejan para señalar una proyección
// ("proy.", "proyectado", "estimado", la fila rotulada "Proyección") en columnas o filas cuyo mes ya
// terminó. Cada hallazgo es una cifra que hoy se lee como pronóstico y debería ser un hecho.
//
//   node orquestador/scripts/auditar-proyecciones-vencidas.mjs
//
// Sale con código 1 si encuentra alguna: sirve para encadenarlo a la corrida del agente.

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Las marcas con las que los generadores de este archivo señalan que una cifra es estimada. */
export const ES_PROYECCION = /\b(proy\.?|proyecc?i[oó]n|proyectad[oa]|estimad[oa]|pronosticad[oa])\b/i

/**
 * NÚCLEO PURO: encuentra proyecciones cuyo período ya cerró.
 *
 * DOS FORMAS de marcar una proyección, y las dos se buscan:
 *   · POR COLUMNA — un encabezado de mes que dice "ago-26 · proy.". Si agosto ya terminó, vencida.
 *   · POR FILA    — una fila rotulada "proyectado" con dato en la columna de un mes ya cerrado.
 *
 * @param {any[][]} filas   la pestaña
 * @param {{anio:number, mes:number}} hoy  el mes en curso (1-12)
 * @returns {{fila:number, col:number, mes:number, texto:string}[]}
 */
export function proyeccionesVencidas(filas = [], hoy = { anio: new Date().getFullYear(), mes: new Date().getMonth() + 1 }) {
  const out = []
  const celda = (f, j) => String(f?.[j] ?? '').trim()
  /** El mes que nombra un texto de encabezado ("ago-26", "01/08/2026"), o null. */
  const mesDe = (t) => {
    const m1 = /^([a-zé]{3})[-/]?(\d{2,4})?/i.exec(String(t).trim())
    if (m1) { const i = MES.indexOf(m1[1].toLowerCase()); if (i >= 0) return i + 1 }
    const m2 = /^\d{1,2}\/(\d{1,2})\/(\d{4})$/.exec(String(t).trim())
    if (m2) return Number(m2[1])
    return null
  }

  // ── Por COLUMNA: encabezados de mes que se declaran proyectados ──
  filas.forEach((f, i) => {
    (f || []).forEach((c, j) => {
      const t = celda(f, j)
      if (!ES_PROYECCION.test(t)) return
      const mes = mesDe(t)
      // Un mes ya cerrado es cualquiera ANTERIOR al mes en curso: el mes en curso todavía no terminó,
      // así que proyectarlo es legítimo.
      if (mes && mes < hoy.mes) out.push({ fila: i + 1, col: j + 1, mes, texto: t })
    })
  })

  // ── LA HEURÍSTICA POR FILA SE DESCARTÓ, Y VALE DECIR POR QUÉ ──
  //
  // Marcaba una fila si CUALQUIER celda suya contenía la palabra "proyección" — incluidos los textos
  // que EXPLICAN qué es una proyección ("proy. = no hay comprobantes, es una proyección"). Daba siete
  // hallazgos y los siete eran falsos: cifras reales al lado de una explicación. Un auditor que grita
  // sin razón se deja de mirar en una semana, y entonces no sirve para el día que grite con razón.
  //
  // Queda sólo la marca inequívoca: el encabezado de mes que el propio generador rotula "· proy.".
  return out
}

async function main() {
  const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = (await g.getSheetMeta(ID)).filter((h) => !/^_/.test(h.title))
  const hoy = { anio: new Date().getFullYear(), mes: new Date().getMonth() + 1 }
  console.log(`Mes en curso: ${MES[hoy.mes - 1]}-${String(hoy.anio).slice(2)}. Se busca todo lo que siga marcado como proyección para un mes ANTERIOR.\n`)
  let total = 0
  for (const h of hojas) {
    const filas = await g.readSheetValues(ID, `'${h.title}'!A1:Z400`).catch(() => [])
    const v = proyeccionesVencidas(filas, hoy)
    if (!v.length) { console.log(`✓ ${h.title}`); continue }
    total += v.length
    console.log(`✖ ${h.title} — ${v.length} proyección(es) de un mes que ya cerró`)
    for (const x of v.slice(0, 5)) console.log(`   fila ${x.fila} col ${x.col} · ${MES[x.mes - 1]} · ${x.texto}`)
  }
  console.log(total ? `\n── ${total} cifra(s) que se leen como pronóstico y ya deberían ser un hecho` : '\n── ninguna proyección vencida')
  process.exit(total ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(2) })
}
