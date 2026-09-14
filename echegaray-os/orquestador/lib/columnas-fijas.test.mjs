// EL GUARDIÁN DE LAS LETRAS FIJAS DE COMPRAS Y COBRANZAS (inserción de «Obra», 14/09/2026).
//
// Rojo cuando: (1) un archivo que NO está en la lista de pendientes nombra una columna por su letra;
// (2) un pendiente suma letras, mapas o índices; (3) un pendiente quedó limpio y sigue en la lista
// (así la lista refleja el avance real y no se puede volver a ensuciar en silencio).
// La lista: `orquestador/datos/columnas-fijas-pendientes.json`. Se regenera con
// `node orquestador/scripts/columnas-fijas-inventario.mjs --escribir`, y el diff se revisa.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compararConPendientes, detectar, escanear } from './columnas-fijas.mjs'

const RAIZ = join(import.meta.dirname, '..', '..')
const LISTA = JSON.parse(readFileSync(join(RAIZ, 'orquestador', 'datos', 'columnas-fijas-pendientes.json'), 'utf8'))

test('el detector ve la letra en una fórmula-texto y no en un comentario ni en un rango armado por rótulo', () => {
  assert.equal(detectar("const f = '=SUMIFS(Compras!$O$4:$O;Compras!$AD$4:$AD;\">=\")'").letras, 2)
  assert.equal(detectar("const r = `'Compras'!$AC$4:$AC`").letras, 1)
  assert.equal(detectar('// Compras!AD es la fecha de caja\nconst x = 1').letras, 0)
  assert.equal(detectar('/* Cobranzas!M5 */ const y = rangoAbierto(pestana, cols.total)').letras, 0)
  assert.equal(detectar("const CLAVE = { cliente: 'G', monto: 'M', estado: 'O' }\nconst p = 'Cobranzas'").mapas, 3)
})

test('ningún archivo NUEVO nombra una columna de Compras o Cobranzas por su letra', () => {
  const { nuevos } = compararConPendientes(escanear(RAIZ), LISTA.archivos)
  assert.deepEqual(nuevos, [], `letras fijas fuera de la lista de pendientes — resolvé la columna por su rótulo con columnas-por-encabezado.mjs:\n${nuevos.join('\n')}`)
})

test('ningún pendiente suma letras fijas', () => {
  const { crecieron } = compararConPendientes(escanear(RAIZ), LISTA.archivos)
  assert.deepEqual(crecieron, [], `pendientes que agregaron letras fijas:\n${crecieron.join('\n')}`)
})

test('lo que ya quedó limpio sale de la lista (la lista es el avance, no un permiso)', (t) => {
  const vivo = escanear(RAIZ)
  const { limpios } = compararConPendientes(vivo, LISTA.archivos)
  assert.deepEqual(limpios, [], `ya no tienen letras fijas — sacalos de columnas-fijas-pendientes.json:\n${limpios.join('\n')}`)
  const n = Object.keys(LISTA.archivos).length
  t.diagnostic(`pendientes: ${n} archivos · ${Object.values(vivo).reduce((s, d) => s + d.letras, 0)} letras literales`)
})

// El detector de índices es heurístico: en estos archivos lo que queda son filas de OTRA pestaña
// (Cheques Emitidos, Tarjeta), una lectura de una sola columna o la grilla propia del generador.
test('los migrados el 14/09 tienen CERO letras y CERO mapas de letras de Compras/Cobranzas', () => {
  for (const f of [
    'orquestador/lib/comprobantes/contrato-columnas.mjs', 'orquestador/lib/carga-comprobantes.mjs',
    'orquestador/scripts/cargar-comprobantes-compras.mjs', 'orquestador/lib/comprobantes/verificacion.mjs',
    'orquestador/lib/proveedores-bloque-vivo.mjs', 'orquestador/scripts/cheques-cobertura-sheet.mjs',
    'orquestador/scripts/estructura-pestana.mjs',
  ]) {
    const d = detectar(readFileSync(join(RAIZ, f), 'utf8'))
    assert.equal(d.letras + d.mapas, 0, `${f}: ${JSON.stringify(d)}`)
  }
})
