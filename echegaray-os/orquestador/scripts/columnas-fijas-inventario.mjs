#!/usr/bin/env node
// LA LISTA DE PENDIENTES DE LETRAS FIJAS (Compras/Cobranzas) — medida del código, no a mano.
//
//   node orquestador/scripts/columnas-fijas-inventario.mjs            ← muestra, no escribe
//   node orquestador/scripts/columnas-fijas-inventario.mjs --escribir ← reescribe el JSON
//
// Escribe sólo `orquestador/datos/columnas-fijas-pendientes.json` (un archivo del repo, no el Sheet).
// Conserva `grupo` y `estado` de lo que ya estaba en la lista; lo nuevo entra con grupo sugerido y
// estado «pendiente». El diff se revisa antes de commitear: una entrada nueva es un archivo que
// agregó letras fijas, y eso es lo que el guardián existe para cazar.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { escanear } from '../lib/columnas-fijas.mjs'

const RAIZ = join(import.meta.dirname, '..', '..')
const DESTINO = join(RAIZ, 'orquestador', 'datos', 'columnas-fijas-pendientes.json')
const ESCRIBIR = process.argv.includes('--escribir')

/** Los retirados que MAPA.md declara: no se migran, se borran. */
const RETIRADOS = new Set(['orquestador/scripts/proveedores-materiales-pestana.mjs'])

function grupoSugerido(f, fuente) {
  if (f.startsWith('src/')) return 'pantallas'
  if (/comprobantes/.test(f)) return 'cargador'
  const cobranzas = /Cobranzas/.test(fuente)
  const compras = /Compras/.test(fuente)
  const escribe = /batchUpdateValues|updateSheetValues|appendSheetValues|spreadsheetBatchUpdate|escribirPreservando|updateCells/.test(fuente)
  if (/cash-flow-lineas|cash-flow-rehacer/.test(f)) return 'cash-flow'
  if (cobranzas && !compras) return 'cobranzas'
  if (cobranzas && compras && /caja-|conciliacion|impuestos/.test(f)) return 'cobranzas'
  return escribe ? 'generadores-compras' : 'lectores'
}

const previo = existsSync(DESTINO) ? JSON.parse(readFileSync(DESTINO, 'utf8')).archivos ?? {} : {}
const vivo = escanear(RAIZ)
const archivos = {}
for (const [f, d] of Object.entries(vivo).sort(([a], [b]) => a.localeCompare(b))) {
  const fuente = readFileSync(join(RAIZ, f), 'utf8')
  archivos[f] = {
    grupo: previo[f]?.grupo ?? grupoSugerido(f, fuente),
    estado: RETIRADOS.has(f) ? 'retirado' : (previo[f]?.estado ?? 'pendiente'),
    ...d,
  }
}
const porGrupo = Object.values(archivos).reduce((m, a) => ({ ...m, [a.grupo]: (m[a.grupo] ?? 0) + 1 }), {})
console.log(`${Object.keys(archivos).length} archivos con letras/índices fijos · por grupo: ${JSON.stringify(porGrupo)}`)
const salieron = Object.keys(previo).filter((f) => !archivos[f])
if (salieron.length) console.log(`quedaron limpios: ${salieron.join(', ')}`)
if (ESCRIBIR) {
  writeFileSync(DESTINO, `${JSON.stringify({
    descripcion: 'Archivos que todavía nombran columnas de Compras/Cobranzas por letra o índice fijo. '
      + 'Guardián: orquestador/lib/columnas-fijas.test.mjs. Regenerar: node orquestador/scripts/columnas-fijas-inventario.mjs --escribir',
    archivos,
  }, null, 2)}\n`)
  console.log(`escrito ${DESTINO}`)
}
