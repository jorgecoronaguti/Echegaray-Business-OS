import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { celdasDeOtraEspecie } from './arca-reapuntar-nombres.mjs'
import { LINEAS_ARCA } from '../lib/bloque-arca-nombres.mjs'
import { especieDe } from '../lib/rangos-nombrados.mjs'
import { formaDe } from '../lib/huella-forma.mjs'

const SRC = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')

/** Las columnas B y C de las seis líneas tal como se leyeron del archivo vivo el 15/08/2026. */
const BC_REAL = [
  [559, 220340664.13000003],        // 177 · comprobantes de compra
  [20, -23268255.770000003],        // 178 · notas de crédito
  ['380', '126944007.80000003'],    // 179 · cargados en Compras          ← TEXTO
  ['8', '38391091.4'],              // 180 · cargados sin su N°           ← TEXTO
  [39, 0],                          // 181 · sin cargar en Compras
  [21, 317175420.46000004],         // 182 · ventas
]

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO QUE NINGUNA DE LAS DOS EVIDENCIAS DEL REPO PUEDE VER
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('la huella sella lo mismo para el número y para el texto: no puede ver este defecto', () => {
  assert.equal(formaDe(126944008), formaDe('126944007.80000003'))
  assert.equal(formaDe(380), formaDe('380'))
})

test('especieDe tampoco lo ve: acepta el texto numérico como importe, y con razón', () => {
  assert.equal(especieDe('126944007.80000003'), 'numero')
  assert.equal(especieDe('380'), 'entero')
})

// Por eso este control mira el TIPO que devuelve la API, que es lo único que lo delata.
test('las cuatro celdas de texto del bloque vivo se detectan', () => {
  const mal = celdasDeOtraEspecie(BC_REAL, 177)
  assert.deepEqual(mal.map((m) => `${m.col}${m.fila}`), ['B179', 'C179', 'B180', 'C180'])
  assert.ok(mal.every((m) => m.encontro === 'texto'))
})

test('las celdas que son número de verdad no se reportan, incluido el 0 y el negativo', () => {
  const bc = [[559, 220340664.13], [20, -23268255.77], [380, 126944008], [8, 38391091], [39, 0], [21, 317175420.46]]
  assert.deepEqual(celdasDeOtraEspecie(bc, 177), [])
})

// EL DEFECTO QUE ATRAPA: una línea que esta corrida no produjo deja su celda vacía, y contarla como
// "de otra especie" convertiría el control en ruido permanente sobre un bloque a medio escribir.
test('una celda vacía no es un defecto de especie', () => {
  const bc = [[null, ''], [20, 1], [380, 2], [8, 3], [39, 0], [21, 4]]
  assert.deepEqual(celdasDeOtraEspecie(bc, 177), [])
})

// EL DEFECTO QUE ATRAPA: un número de comprobante en la columna de plata es el caso del 13/08. Llega
// como texto, así que lo agarra la primera puerta; que se siga reportando es lo que importa.
test('un número de comprobante en la columna de plata sigue siendo un defecto', () => {
  const bc = [[559, 1], [20, 2], [380, 3], [8, 4], [39, '0010-00000001'], [21, 5]]
  const mal = celdasDeOtraEspecie(bc, 177)
  assert.equal(mal.length, 1)
  assert.equal(mal[0].col + mal[0].fila, 'C181')
})

test('el control cubre las seis líneas del bloque, no un subconjunto tipeado', () => {
  const bc = LINEAS_ARCA.map(() => ['x', 'x'])
  assert.equal(celdasDeOtraEspecie(bc, 177).length, LINEAS_ARCA.length * 2)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA CAUSA RAÍZ, FIJADA CONTRA EL FUENTE
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El generador escribe los VALORES por `batchUpdateValues` (USER_ENTERED, o sea "como si lo tipearas")
// y recién DESPUÉS aplica el `numberFormat` con `formatear`. Cuando la celda arrastra el formato TEXTO
// de un layout anterior, lo tipeado se guarda como texto — y un `numberFormat` posterior NO reconvierte
// un texto ya guardado. La corrida siguiente lo lee como texto, lo vuelve a mandar, y el ciclo no se
// corta solo: por eso redondear a pesos enteros (`pesosEnteros`, 15/08) no alcanzó.
//
// Este test no arregla el orden: lo DEJA MEDIDO. Si alguien lo invierte, se pone rojo y hay que venir
// a leer esto; mientras siga así, el número de línea documenta el defecto abierto.
test('hoy el valor se escribe ANTES que el formato — la causa de las celdas de texto', () => {
  const iValor = SRC.indexOf('await google.batchUpdateValues(')
  const iFormato = SRC.indexOf('await formatear(google, hoja.sheetId')
  assert.ok(iValor > 0 && iFormato > 0, 'no encontré las dos llamadas en el generador')
  assert.ok(iValor < iFormato,
    'si el formato pasó a ir primero, este defecto está arreglado: actualizá el comentario y el criterio de PASOS_RETIRADOS')
})
