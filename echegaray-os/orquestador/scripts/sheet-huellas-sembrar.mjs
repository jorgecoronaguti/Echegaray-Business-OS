#!/usr/bin/env node
// SIEMBRA LAS HUELLAS QUE LOS ESCRITORES CRUDOS NUNCA DEJARON.
//
// ═══ EL PROBLEMA QUE RESUELVE ═══
//
// La propiedad por celda decide con una evidencia POSITIVA: "esta celda la escribí yo". Los pasos que
// escriben con `updateCells` o con `values` crudos nunca dejaron esa evidencia —la huella vivía sólo
// adentro de `escribirPreservando`—, así que al enchufar la guarda universal sus celdas caen en el
// último cuadrante: **sin huella y con contenido → es del dueño → no la piso**. Medido por la
// auditoría: ~470 celdas CALCULADAS quedarían congeladas en la primera corrida (Tarjeta de Credito
// 161, Cash Flow Semanal 54, Jornales 46, Nómina 42, Impuestos 30, Parámetros 26…) sin que nadie las
// hubiera editado. Eso es el "candado de mierda" que el dueño mandó a apagar el 05/08, por otra vía.
//
// ═══ LA EVIDENCIA: EL GRID QUE EL OS DEJÓ SELLADO (`sheet_tab_firma.grid`) ═══
//
// La PRIMERA versión de este script comparaba el snapshot pre-corrida contra la hoja viva y sembraba
// lo que hubiera cambiado. Medido contra el archivo real: **sembraba 1 huella en todo el Sheet**. La
// causa es que los generadores son idempotentes — reescriben el mismo valor — así que "cambió" no es
// lo mismo que "lo escribí yo", y el diff no ve casi nada. Era la evidencia equivocada.
//
// La correcta ya estaba guardada. Después de cada escritura, `sellarFirma` RELEE la pestaña entera
// con render FORMULA y guarda ese grid en `sheet_tab_firma.grid`: es, literalmente, *lo que el OS
// dejó escrito*. Hay grid para las 25 pestañas del archivo.
//
//   grid sellado con contenido  +  la hoja viva dice LO MISMO   →  la escribió el OS y nadie la tocó
//                                                                  → se siembra su huella
//   grid sellado con contenido  +  la hoja viva dice otra cosa   →  la editaste vos DESPUÉS del sello
//                                                                  → NO se siembra (queda protegida)
//   grid sellado vacío          +  la hoja viva con contenido    →  nunca fue del OS → NO se siembra
//
// Las tres son la misma regla que usa la guarda, con la misma comparación (`contenidoComparable`, que
// ignora el locale de la fórmula y los espacios). No se inventa evidencia: se cosecha la que el
// propio OS venía dejando y nadie estaba usando.
//
// ═══ EL CRITERIO DE ACEPTACIÓN, MEDIBLE ═══
//
// La "ventana del generador" de una pestaña es el rectángulo que ocupan las celdas con contenido de
// su grid sellado: exactamente lo que el OS escribe hoy. El objetivo es CERO pestañas con más de
// `TOPE_SIN_HUELLA` celdas con contenido y sin huella dentro de esa ventana. El script lo mide antes
// y después, y si no se llega lo dice POR PESTAÑA en vez de dar un total tranquilizador.
//
//   node orquestador/scripts/sheet-huellas-sembrar.mjs [--dry] [--pestana "CAJA"]
//
// SE CORRE UNA VEZ, desde el árbol principal. No es un paso del pipeline.

import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { contenidoComparable, formaDe, LARGO_FORMA } from '../lib/huella-forma.mjs'
import { huellaDe } from '../lib/huella-celda.mjs'
import { letraCol } from '../lib/preservar-anotaciones.mjs'
// El mismo tope que usa la guarda en tiempo de escritura (`decidirVentana`, `propiedad-celda.mjs`):
// no se duplica el número, se REUSA, para que el "cero pestañas por encima del tope" que mide este
// script sea EXACTAMENTE el punto en el que la guarda deja de necesitar la salvaguarda B3.
import { TOPE_SIN_HUELLA } from '../lib/propiedad-celda.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const SOLO = (() => { const i = process.argv.indexOf('--pestana'); return i > 0 ? process.argv[i + 1] : null })()

export { TOPE_SIN_HUELLA }

/** Una celda del grid sellado o de la hoja viva, como texto comparable. Puro. */
export function textoDe(c) {
  if (c === null || c === undefined) return ''
  if (typeof c === 'object') return String(c.f ?? c.v ?? c.formula ?? c.valor ?? '')
  return String(c)
}

/**
 * NÚCLEO PURO: qué sembrar y qué queda sin huella, comparando el grid que el OS selló contra la hoja
 * viva. `tieneHuella(fila, col)` responde por el registro que ya existe.
 *
 * @returns {{sembrar:Array, editadas:number, ajenas:number, ventana:object|null, sinHuella:Array}}
 */
export function planDeSiembra(gridSellado = [], vivo = [], tieneHuella = () => false) {
  const sembrar = []; const sinHuella = []
  let editadas = 0; let ajenas = 0
  let ventana = null
  const filas = Math.max(gridSellado.length, vivo.length)
  for (let i = 0; i < filas; i++) {
    const fs = gridSellado[i] ?? []; const fv = vivo[i] ?? []
    for (let j = 0; j < Math.max(fs.length, fv.length); j++) {
      const mio = textoDe(fs[j]); const hoy = textoDe(fv[j])
      const eraMia = formaDe(mio) !== ''
      if (eraMia) {
        // La ventana del generador: el rectángulo de lo que el OS dejó escrito.
        ventana = ventana
          ? { fila0: Math.min(ventana.fila0, i + 1), col0: Math.min(ventana.col0, j), filaFin: Math.max(ventana.filaFin, i + 1), colFin: Math.max(ventana.colFin, j) }
          : { fila0: i + 1, col0: j, filaFin: i + 1, colFin: j }
      }
      if (!formaDe(hoy)) continue                 // hoy está vacía: no hay nada que reclamar
      if (tieneHuella(i + 1, j)) continue         // ya tiene registro: el suyo manda
      if (!eraMia) { if (formaDe(hoy)) ajenas++; continue } // nunca la escribí: es del dueño
      if (contenidoComparable(mio) !== contenidoComparable(hoy)) { editadas++; continue } // la editó él
      sembrar.push({ fila: i + 1, col: j, valor: hoy })
    }
  }
  // Lo que queda sin huella DENTRO de la ventana, que es lo que el criterio de aceptación mide.
  if (ventana) {
    const sembradas = new Set(sembrar.map((c) => `${c.fila}:${c.col}`))
    for (let f = ventana.fila0; f <= ventana.filaFin; f++) {
      for (let c = ventana.col0; c <= ventana.colFin; c++) {
        const hoy = textoDe((vivo[f - 1] ?? [])[c])
        if (!formaDe(hoy)) continue
        if (tieneHuella(f, c) || sembradas.has(`${f}:${c}`)) continue
        sinHuella.push({ fila: f, col: c, valor: hoy })
      }
    }
  }
  return { sembrar, editadas, ajenas, ventana, sinHuella }
}

/** Cuántas celdas con contenido y SIN huella hay hoy dentro de la ventana. Para la tabla "antes". */
export function sinHuellaHoy(gridSellado = [], vivo = [], tieneHuella = () => false) {
  const p = planDeSiembra(gridSellado, vivo, tieneHuella)
  return p.sinHuella.length + p.sembrar.length
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  const { rows: firmas } = await query(
    'select pestana, grid from public.sheet_tab_firma where file_id = $1 and grid is not null order by pestana', [ID])
  const pestanas = firmas.filter((f) => (!SOLO || f.pestana === SOLO) && !f.pestana.startsWith('_'))
  if (!pestanas.length) { console.log('no hay grid sellado para este archivo'); return }

  console.log(`${pestanas.length} pestaña(s) con grid sellado${DRY ? ' — (--dry) no escribo nada en la base' : ''}\n`)
  console.log('pestaña                      sin huella  sembrar  editadas  ajenas  → quedan')
  console.log('─'.repeat(82))

  let total = 0; const incumplen = []
  for (const f of pestanas) {
    let vivo
    try {
      const g = await google.readSheetGrid(ID, f.pestana)
      vivo = (g.filas || []).map((fila) => (fila || []).map((c) => c?.formula ?? c?.valor ?? ''))
    } catch (e) {
      console.log(`  ${f.pestana.padEnd(26)} NO PUDE LEERLA (${String(e.message).slice(0, 50)})`)
      continue
    }
    const { rows } = await query('select fila, col from public.sheet_huella_celda where file_id = $1 and pestana = $2', [ID, f.pestana])
    const existentes = new Set(rows.map((r) => `${r.fila}:${r.col}`))
    const tiene = (fila, col) => existentes.has(`${fila}:${col}`)
    const grid = typeof f.grid === 'string' ? JSON.parse(f.grid) : f.grid
    const p = planDeSiembra(grid ?? [], vivo, tiene)
    const antes = p.sinHuella.length + p.sembrar.length
    const quedan = p.sinHuella.length
    total += p.sembrar.length
    if (quedan > TOPE_SIN_HUELLA) incumplen.push({ pestana: f.pestana, quedan, muestra: p.sinHuella.slice(0, 6).map((c) => `${letraCol(c.col)}${c.fila}`) })
    console.log(`  ${f.pestana.padEnd(26)} ${String(antes).padStart(9)} ${String(p.sembrar.length).padStart(8)} `
      + `${String(p.editadas).padStart(9)} ${String(p.ajenas).padStart(7)}  ${String(quedan).padStart(7)}`)
    if (DRY || !p.sembrar.length) continue
    for (let i = 0; i < p.sembrar.length; i += 400) {
      const tanda = p.sembrar.slice(i, i + 400)
      const vals = tanda.map((_, k) => `($1,$2,$${k * 5 + 3},$${k * 5 + 4},$${k * 5 + 5},$${k * 5 + 6},$${k * 5 + 7}, now())`).join(',')
      await query(
        `insert into public.sheet_huella_celda (file_id, pestana, fila, col, forma, huella, valor, escrito_en)
         values ${vals} on conflict (file_id, pestana, fila, col) do nothing`,
        [ID, f.pestana, ...tanda.flatMap((c) => [c.fila, c.col, formaDe(c.valor).slice(0, LARGO_FORMA), huellaDe(c.valor) ?? '', String(c.valor).slice(0, LARGO_FORMA)])])
    }
  }

  console.log('─'.repeat(82))
  console.log(`${DRY ? '(--dry) sembraría' : 'sembré'} ${total} huella(s).`)
  console.log('· «editadas» = el OS la escribió y hoy dice otra cosa: son TUYAS, no se siembran.')
  console.log('· «ajenas» = nunca estuvieron en lo que el OS dejó sellado: tampoco.')
  if (incumplen.length) {
    console.log(`\n⚠ ${incumplen.length} pestaña(s) siguen con más de ${TOPE_SIN_HUELLA} celdas con contenido y sin huella`)
    console.log('  dentro de la ventana de su generador. Ahí la primera corrida va a respetar de más:')
    for (const x of incumplen) console.log(`   · ${x.pestana}: ${x.quedan} (${x.muestra.join(', ')}…)`)
  } else {
    console.log(`\n✓ ninguna pestaña queda con más de ${TOPE_SIN_HUELLA} celdas sin huella dentro de la ventana de su generador.`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => closePool()).catch(async (e) => { console.error('ERROR:', e.message); await closePool(); process.exit(1) })
}
