#!/usr/bin/env node
// ¿CUÁNTOS NÚMEROS DE ESTE ARCHIVO ESTÁN PEGADOS A MANO?
//
// POR QUÉ (21/07). El dueño abrió F8 de Proveedores y Materiales, vio "700000" en la barra de
// fórmulas y escribió: "no se respeta la regla de oro respecto a celdas referenciadas o fórmulas, la
// pestaña no es un documento que se actualice de manera automática, lo cual esto me genera dudas
// respecto a TODO el sheet".
//
// La duda es exactamente la correcta, y la respuesta no puede ser una opinión mía sobre una celda.
// Tiene que ser un censo del archivo entero, repetible, que cualquiera pueda volver a correr.
//
// ═══ LO QUE PASA CON ESA CELDA EN PARTICULAR ═══
//
// F8 no tiene NADA escrito adentro. Es una celda DERRAMADA por el QUERY que vive en A8. Google
// Sheets muestra el valor en la barra de fórmulas cuando seleccionás una celda derramada, igual que
// si fuera un número tipeado: no hay forma de distinguirlos mirando la pantalla.
//
// La API sí distingue, y es lo que usa este censo:
//   · tiene `userEnteredValue` con fórmula        → FÓRMULA
//   · NO tiene `userEnteredValue` pero SÍ valor   → DERRAMADA (la produjo una fórmula vecina)
//   · tiene `userEnteredValue` numérico           → PEGADO A MANO  ← lo que la regla prohíbe
//
// ═══ QUÉ CUENTA COMO VIOLACIÓN Y QUÉ NO ═══
//
// La regla dice: "en el Sheet NUNCA números sueltos calculados por código; fórmulas o celdas con
// ORIGEN TRAZABLE". O sea que un número pegado NO es automáticamente una violación:
//
//   · Un dato de ORIGEN —lo que alguien carga: una factura, un cobro, un saldo de extracto— es un
//     número pegado y está bien. Es el dato primario del que todo lo demás se calcula.
//   · Un número CALCULADO y pegado por el código es la violación: envejece en silencio y nadie se
//     entera. Es lo que rompió el espejo de JORNALES y el IPC.
//
// La diferencia no se puede adivinar desde el valor: depende de la pestaña. Por eso cada pestaña
// declara si es de CARGA (sus números pegados son datos de origen) o CALCULADA (no debería tener
// ninguno). Las calculadas son las que el OS arma, y ahí el número pegado es indefendible.
//
//   node orquestador/scripts/censo-numeros-pegados.mjs [pestaña]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { PESTANAS } from './formato-pestanas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const SOLO = process.argv[2]

function colLetra(n) { let s = ''; for (let i = n - 1; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

/**
 * NÚCLEO PURO: clasifica cada celda de una grilla.
 * @param {{filas:Array}} grid salida de readSheetGrid
 */
export function censar(grid) {
  const r = { formula: 0, derramada: 0, pegadoNumero: 0, fecha: 0, texto: 0, pegados: [] }
  if (!grid?.filas) return r
  const L = (n) => { let s = ''; for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }
  grid.filas.forEach((fila, i) => (fila || []).forEach((c, j) => {
    if (!c) return
    if (c.formula) { r.formula++; return }
    if (c.derivada) { r.derramada++; return }
    const v = String(c.valor ?? '').trim()
    if (!v) return
    // Un número pegado: hay valor numérico y nadie escribió una fórmula ni lo derramó otra celda.
    if (c.numero !== null && c.numero !== undefined) {
      // UNA FECHA DE ENCABEZADO NO ES UN NÚMERO CALCULADO. Los rótulos de período —la semana que
      // arranca el 6/7, el mes de agosto— son fechas escritas, y escribir una fecha es declarar de
      // qué período habla la columna, no pegar un resultado. Contarlas como violación tapaba las
      // que sí lo son: la primera versión de este censo dio 407 y la mitad eran encabezados.
      if (c.formato === 'DATE' || c.formato === 'DATE_TIME') { r.fecha++; return }
      r.pegadoNumero++
      r.pegados.push({ celda: `${L(j)}${i + 1}`, valor: c.numero, formato: c.formato })
      return
    }
    r.texto++
  }))
  return r
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const lista = SOLO ? PESTANAS.filter((p) => p.titulo.toLowerCase().includes(SOLO.toLowerCase())) : PESTANAS

  // EL AUDITOR NO PUEDE MIRAR MENOS QUE LA PESTAÑA ENTERA.
  //
  // Este censo leía hasta el `hastaFila` declarado a mano en formato-pestanas.mjs. Para Proveedores y
  // Materiales decía 140 y la pestaña llega a la fila 200: informó 34 números pegados cuando eran 79.
  // Los 45 que faltaban eran justo el bloque de notas de crédito y el de facturas de ARCA sin cargar.
  //
  // Un control que mira una ventana fija da una tranquilidad falsa que es peor que no tenerlo: la
  // pestaña crece, el defecto entra por abajo y el número sigue diciendo lo mismo. El alto se
  // pregunta, no se declara.
  const meta = await google.getSheetMeta(ID)
  const alto = new Map(meta.map((h) => [h.title, h.rows ?? 0]))

  console.log('PESTAÑA'.padEnd(26) + 'FÓRMULAS'.padStart(10) + 'DERRAM.'.padStart(9) + 'FECHAS'.padStart(8) + 'PEGADOS'.padStart(9) + '   QUÉ SIGNIFICA')
  let malos = 0
  for (const p of lista) {
    // La pestaña entera es el rowCount REAL de la grilla: el dato no puede vivir más abajo de las
    // filas asignadas, y pedir más allá hace fallar la API ("exceeds grid limits"). El hastaFila
    // declarado es sólo un piso por si la meta no vino.
    const hasta = alto.get(p.titulo) || p.hastaFila
    const grid = await google.readSheetGrid(ID, `${p.titulo}!A1:${colLetra(p.cols)}${hasta}`).catch(() => null)
    if (!grid) { console.log(`  ${p.titulo.padEnd(24)} no pude leerla`); continue }
    const c = censar(grid)
    // ── LOS RANGOS DECLARADOS COMO DATO DE ORIGEN ────────────────────────────────────────────────
    // La regla 3 dice: "el dato de ORIGEN sí se pega, y se declara". Una columna que por definición
    // contiene lo que alguien leyó de un extracto no es una violación — contarla como tal hacía que
    // el número del censo mintiera y que las violaciones REALES se perdieran entre ellas.
    const declarados = (p.origen ?? []).map((o) => o.col)
    const deOrigen = c.pegados.filter((x) => declarados.includes(x.celda.replace(/\d+/g, '')))
    c.pegadoNumero -= deOrigen.length
    c.pegados = c.pegados.filter((x) => !deOrigen.includes(x))

    const veredicto = p.carga
      ? `pestaña de CARGA: sus ${c.pegadoNumero} números son el dato de origen`
      : c.pegadoNumero === 0
        ? `✓ ni un número calculado y pegado${deOrigen.length ? ` (${deOrigen.length} son dato de origen declarado)` : ': todo se recalcula solo'}`
        : `⚠ ${c.pegadoNumero} número(s) calculado(s) y pegado(s) — VIOLA LA REGLA`
    if (!p.carga && c.pegadoNumero) malos += c.pegadoNumero
    console.log(`  ${p.titulo.padEnd(24)}${String(c.formula).padStart(10)}${String(c.derramada).padStart(9)}${String(c.fecha).padStart(8)}${String(c.pegadoNumero).padStart(9)}   ${veredicto}`)
    if (!p.carga && c.pegadoNumero) {
      for (const x of c.pegados.slice(0, 12)) console.log(`        ${x.celda.padEnd(6)} ${String(x.valor).slice(0, 20)}`)
      if (c.pegados.length > 12) console.log(`        … y ${c.pegados.length - 12} más`)
    }
  }
  console.log(`\n${malos ? `⚠ ${malos} número(s) pegado(s) en pestañas que el OS calcula` : '✓ ninguna pestaña calculada tiene números pegados'}`)
  if (malos) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
