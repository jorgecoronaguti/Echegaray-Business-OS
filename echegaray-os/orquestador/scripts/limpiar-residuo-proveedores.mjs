#!/usr/bin/env node
// LIMPIAR UNA COPIA HUÉRFANA QUE YA ESTÁ PUBLICADA — CON EL DUEÑO MIRANDO, FILA POR FILA.
//
// ═══ QUÉ ARREGLA ESTO Y QUÉ NO ═══
//
// El defecto que producía las copias está arreglado en el generador (`no-borrar.mjs` +
// `residuo-propio.mjs`): a partir de ahora la cola de un layout anterior se limpia sola. Lo que YA
// quedó publicado dentro del bloque no se cura solo, porque el generador no puede saber cuál de dos
// copias idénticas es la viva — las dos son suyas y las dos tienen la misma pinta.
//
// Eso lo decide una persona. Este script no elige: MUESTRA, y limpia únicamente las filas que se le
// nombran. Sin `--aplicar` no escribe una sola celda.
//
// ═══ POR QUÉ NO LIMPIA "TODO LO QUE PAREZCA RESIDUO" ═══
//
// Porque el bloque VIVO también es del generador y también pasa la prueba de propiedad. Un barrido
// automático sobre la región lo borraría junto con el fósil. La prueba de propiedad sirve para no
// tocar lo del dueño; no sirve para decidir cuál copia sobra.
//
//   1) node orquestador/scripts/limpiar-residuo-proveedores.mjs --desde 100 --hasta 240
//   2) mirás la salida, elegís las filas del fósil
//   3) node orquestador/scripts/limpiar-residuo-proveedores.mjs --filas 126,229,230 --aplicar
//
// GUARDA DURA: ninguna fila por encima del fin de la última tabla dinámica entra, ni nombrada a mano.
// Escribir ahí reemplaza un pivot por texto y lo mata sin un solo error.

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { letraCol } from '../lib/preservar-anotaciones.mjs'
import { residuosPropios } from '../lib/residuo-propio.mjs'
import { leerRegistro } from '../lib/respetar-ediciones.mjs'
import { anclasDeDinamicas, finDeDinamica } from '../lib/proveedores-frontera.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const ANCHO = 16   // el ancho declarado del bloque en la pestaña (16 columnas, A..P)

const arg = (n, def = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def
}
const PESTANA = arg('pestana', 'Proveedores')
const DESDE = Number(arg('desde', 100))
const HASTA = Number(arg('hasta', 260))
const FILAS = (arg('filas', '') || '').split(',').map((s) => Number(s.trim())).filter(Boolean)
const APLICAR = process.argv.includes('--aplicar')
// LAS COLUMNAS SE PUEDEN ACOTAR, Y CASI SIEMPRE HAY QUE HACERLO. Una fila puede tener el fósil en
// A/B y contenido VIVO en C/D —pasa en la fila 126 real, donde A/B son la copia del bloque de ARCA y
// C/D son la factura que la sección 4 muestra hoy—. Sin `--cols` se limpia el ancho entero y el
// generador tiene que reponer lo vivo en la corrida siguiente; con `--cols A,B` no se toca.
const COLS = (arg('cols', '') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
const indiceDeCol = (letras) => [...letras].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1
const COLS_IDX = COLS.length ? new Set(COLS.map(indiceDeCol)) : null
const ref = /[^A-Za-z0-9_]/.test(PESTANA) ? `'${PESTANA}'` : PESTANA

/** El piso: ninguna escritura de este script puede caer en el derrame de una tabla dinámica. */
async function pisoDeDinamicas(google, visible) {
  const grid = await google.getGridData(ID, `${ref}!A1:Z${Math.max(HASTA, 400)}`).catch(() => null)
  if (!grid) throw new Error('no pude leer la estructura de la pestaña: sin saber dónde terminan las dinámicas NO escribo')
  const anclas = anclasDeDinamicas(grid)
  return anclas.reduce((m, a) => Math.max(m, finDeDinamica(visible, a.fila)), 0)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const visible = await google.readSheetValues(ID, `${ref}!A1:Z${HASTA}`)
  const piso = await pisoDeDinamicas(google, visible)
  const { mios } = await leerRegistro(ID, PESTANA).catch(() => ({ mios: [] }))
  console.log(`  pestaña "${PESTANA}" · ${mios.length} rótulo(s) en el registro · la última dinámica termina en la fila ${piso}`)

  if (!FILAS.length) {
    // MODO VER. Se dice fila por fila qué se podría probar del generador y qué no, para que la
    // elección la haga alguien que sabe cuál copia es la viva.
    const region = visible.slice(DESDE - 1, HASTA).map((f) => (f || []).slice(0, ANCHO))
    const { vaciables, conservadas } = residuosPropios(region, new Set(mios))
    console.log(`\n  filas ${DESDE}–${HASTA}: qué se podría vaciar si nombrás esa fila\n`)
    region.forEach((fila, i) => {
      const n = DESDE + i
      const propias = fila.map((_, j) => j).filter((j) => vaciables.has(`${i}:${j}`))
      const suyas = conservadas.filter((c) => c.fila === i)
      if (!propias.length && !suyas.length) return
      const texto = fila.map((c) => String(c ?? '').slice(0, 28)).filter(Boolean).join(' | ')
      console.log(`  ${String(n).padStart(4)} ${n <= piso ? '🔒' : '  '} ${texto.slice(0, 110)}`)
      if (propias.length) console.log(`        mío: ${propias.map((j) => letraCol(j) + n).join(' ')}`)
      for (const s of suyas) console.log(`        ✋ TUYO ${letraCol(s.col)}${n}: "${s.valor}"`)
    })
    console.log('\n  Elegí las filas del fósil y volvé con:  --filas 126,229,230 --aplicar')
    return
  }

  const bajoDinamica = FILAS.filter((f) => f <= piso)
  if (bajoDinamica.length) {
    throw new Error(`las filas ${bajoDinamica.join(', ')} caen dentro de una tabla dinámica (termina en la ${piso}). `
      + 'Escribir ahí la reemplaza por texto y la mata en silencio. NO escribo ninguna.')
  }
  // Una celda fuera de `--cols` se manda con su valor ACTUAL, no vacía: así ni la guarda ni la API la
  // ven como un borrado y queda exactamente como está.
  const filaAEscribir = (f) => {
    const hoy = (visible[f - 1] || [])
    return Array.from({ length: ANCHO }, (_, j) => (!COLS_IDX || COLS_IDX.has(j) ? '' : (hoy[j] ?? '')))
  }
  const data = FILAS.map((f) => ({ range: `${ref}!A${f}`, values: [filaAEscribir(f)] }))
  if (!APLICAR) {
    console.log(`\n  (ensayo) vaciaría lo probado mío en las filas ${FILAS.join(', ')}${COLS.length ? `, sólo columnas ${COLS.join(' ')}` : ''} — agregá --aplicar para escribir`)
    for (const f of FILAS) {
      const fila = (visible[f - 1] || []).slice(0, ANCHO)
      const { vaciables, conservadas } = residuosPropios([fila], new Set(mios))
      const enAlcance = [...vaciables].filter((k) => !COLS_IDX || COLS_IDX.has(Number(k.split(':')[1])))
      console.log(`  ${f}: se vaciarían ${enAlcance.length} celda(s) — ${enAlcance.map((k) => letraCol(Number(k.split(':')[1])) + f).join(' ')}`)
      for (const c of conservadas) console.log(`      ✋ ${letraCol(c.col)}${f} = "${c.valor}" — NO se toca`)
    }
    return
  }
  // La escritura pasa por la MISMA guarda que el generador: `vaciarPropio` no es un permiso, es el
  // insumo con el que `no-borrar` decide sobre el destino que ella misma relee. Lo que no se pruebe
  // mío vuelve intacto aunque esté nombrado en --filas.
  const r = await google.batchUpdateValues(ID, data, { vaciarPropio: { mios } })
  if (r?.protegido) console.warn(`  ⛔ la guarda no dejó pasar la escritura: ${r.motivo ?? 'sin motivo'}`)
  else console.log(`  ✅ escrito. Releé la pestaña: lo que quedó es la evidencia, no este mensaje.`)
}

main().catch((e) => { console.error(`  ⛔ ${e.message}`); process.exitCode = 1 })
