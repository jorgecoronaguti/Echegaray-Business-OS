import { test } from 'node:test'
import assert from 'node:assert/strict'
import { columnasDeEstado, planDePantalla, QUIEN_LO_ARREGLA, GENERADOR_DE_FORMATO } from './reparar-pantalla.mjs'

const cel = (valor, type) => ({ valor, formato: type ? { numberFormat: { type } } : null })
const def = (tipo, col, fila, extra = {}) => ({ tipo, col, fila, valor: '', que: '', ...extra })

/**
 * `Cobranzas!U` tal como está en el archivo real: encabezado sin formato, y debajo una fórmula que
 * por diseño devuelve un NÚMERO de días o una PALABRA de estado. Medido: 90 palabras contra 1 número.
 */
function cobranzasU({ palabras = 30, numeros = 1 } = {}) {
  const filas = [[], [], [], [cel('Días hasta vto.')]]
  for (let i = 0; i < numeros; i++) filas.push([cel('6', 'NUMBER')])
  for (let i = 0; i < palabras; i++) filas.push([cel('Cobrado', 'NUMBER')])
  return filas
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// UNA COLUMNA DE ESTADO CON FORMATO DE NÚMERO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('EL DEFECTO: una columna de estado con formato NUMBER se reparaba celda por celda, no en la causa', () => {
  const filas = cobranzasU()
  // El detector sólo reporta desde la primera celda que tiene un número ARRIBA (esRotuloDeColumna).
  const defectos = Array.from({ length: 20 }, (_, i) => def('texto_en_numero', 'A', 7 + i))
  const cols = columnasDeEstado(filas, defectos)
  assert.equal(cols.length, 1, 'la columna entera es UN defecto, no veinte')
  assert.equal(cols[0].col, 'A')
  assert.equal(cols[0].nf, 'NUMBER')
  assert.equal(cols[0].desde, 5, 'arranca en la primera celda con formato de número, no en el encabezado')
  assert.equal(cols[0].hasta, 35)
  assert.equal(cols[0].numeros, 1, 'el único número no la absuelve: la mayoría manda')
})

test('la mayoría manda: una columna de importes con notas metidas NO es una columna de estado', () => {
  // Es el caso contrario y el que no hay que romper: ahí el formato está bien y las notas están mal.
  const filas = cobranzasU({ palabras: 3, numeros: 20 })
  const defectos = Array.from({ length: 5 }, (_, i) => def('texto_en_numero', 'A', 5 + i))
  assert.deepEqual(columnasDeEstado(filas, defectos), [], 'con 3 de 23 celdas de texto no se toca la columna')
})

test('una celda suelta no condena a su columna: hace falta que varias estén reportadas', () => {
  // `Cobranzas!AA62` es la palabra "USD" en la columna «Moneda», una sola celda con el formato pegado.
  // Sacarle el formato a la columna entera por una celda es el gesto que este repo ya pagó seis veces.
  const filas = [[], [], [], [cel('Moneda')], [cel('USD', 'NUMBER')]]
  assert.deepEqual(columnasDeEstado(filas, [def('texto_en_numero', 'A', 5)]), [])
})

test('una columna sin ninguna celda con formato de número no se inventa un rango', () => {
  const filas = [[cel('Cobrado')], [cel('Cobrado')], [cel('Cobrado')]]
  const defectos = Array.from({ length: 6 }, (_, i) => def('texto_en_numero', 'A', i + 1))
  assert.deepEqual(columnasDeEstado(filas, defectos), [])
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// QUÉ SE REPARA EN UNA PESTAÑA DE CARGA
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('EL DEFECTO: una pestaña de carga se salteaba entera y no proponía NADA', () => {
  // `Compras` es `carga: true` y tenía 70 filas con WRAP puesto y 20px de alto: texto escrito y
  // escondido. El filtro `!p.carga` la sacaba antes de leerla, así que --dry no decía ni que existía.
  const carga = { titulo: 'Compras', carga: true }
  const defectos = [def('texto_apretado', 'L', 460, { lineas: 2, fontSize: 11 })]
  const plan = planDePantalla(carga, defectos, [], [20])
  assert.equal(plan.altoPorFila.size, 1, 'el alto de fila SÍ se repara en una pestaña de carga')
  assert.equal(plan.altoPorFila.get(460), 40, '2 líneas de 11pt: 2×17+6')
})

test('pero en una pestaña de carga NO se le toca el formato a una celda suelta', () => {
  // Es lo que la protección quiere impedir: fuente, color e itálica elegidos por heurística sobre las
  // celdas que el dueño tipea todos los días.
  const defectos = [def('texto_en_numero', 'N', 268, { valor: 'USD -' })]
  const enCarga = planDePantalla({ titulo: 'Compras', carga: true }, defectos, [], [])
  assert.deepEqual(enCarga.celdas, [], 'no se reformatea')
  assert.equal(enCarga.sinTocar.length, 1, 'pero se informa: callar es peor que no reparar')

  const normal = planDePantalla({ titulo: 'OBRAS' }, defectos, [], [])
  assert.equal(normal.celdas.length, 1, 'en una pestaña que no es de carga se sigue reparando como siempre')
})

test('el formato de una columna de estado se repara TAMBIÉN en una pestaña de carga', () => {
  // Sacarle el numberFormat devuelve la columna a "Automático" y no cambia nada de lo que el dueño
  // eligió. Medido antes de tocarla: cero fórmulas del archivo referencian Cobranzas!U.
  const filas = cobranzasU()
  const defectos = Array.from({ length: 20 }, (_, i) => def('texto_en_numero', 'A', 7 + i))
  const plan = planDePantalla({ titulo: 'Cobranzas', carga: true }, defectos, filas, [])
  assert.equal(plan.columnas.length, 1)
  assert.deepEqual(plan.celdas, [], 'ninguna celda suelta en una pestaña de carga')
  assert.deepEqual(plan.sinTocar, [], 'las 20 celdas caen dentro de la columna: no se informan dos veces')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL ALTO, Y LO QUE NO SE TOCA
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('EL DEFECTO: reparar el alto podía ACHICAR la fila que el dueño había agrandado', () => {
  const defectos = [def('texto_apretado', 'L', 10, { lineas: 2, fontSize: 10 })]
  // la fila 10 es el índice 9 del vector de altos
  const plan = planDePantalla({ titulo: 'X' }, defectos, [], Array(9).fill(0).concat([80]))
  assert.equal(plan.altoPorFila.get(10), 80, 'nunca se achica: reparar sólo puede destapar')
})

test('dos celdas apretadas en la misma fila piden un solo alto, el mayor', () => {
  const defectos = [
    def('texto_apretado', 'K', 7, { lineas: 2, fontSize: 10 }),
    def('texto_apretado', 'L', 7, { lineas: 5, fontSize: 10 }),
  ]
  const plan = planDePantalla({ titulo: 'X' }, defectos, [], [])
  assert.equal(plan.altoPorFila.size, 1)
  assert.equal(plan.altoPorFila.get(7), 81, '5 líneas de 10pt: 5×15+6')
})

test('lo que este script no repara se informa nombrando a quién le toca', () => {
  // `reparar-textos.mjs` ya hace esto y por una razón cara: colgar una nota resucitaba las notas que
  // el dueño borraba. Se nombra al dueño del arreglo, no se anota en la celda.
  const defectos = [
    def('texto_cortado', 'E', 743),
    def('fecha_cero', 'C', 12),
    def('glifo_invisible', 'A', 5),
  ]
  const plan = planDePantalla({ titulo: 'Compras', carga: true }, defectos, [], [])
  assert.equal(plan.sinTocar.length, 3)
  assert.match(QUIEN_LO_ARREGLA.texto_cortado, /reparar-textos/)
  assert.match(QUIEN_LO_ARREGLA.fecha_cero, /MINIFS/)
  assert.equal(GENERADOR_DE_FORMATO.get('Compras'), 'orquestador/scripts/compras-formato.mjs')
})

test('un texto_apretado ya reparado no se informa como pendiente', () => {
  const defectos = [def('texto_apretado', 'L', 460, { lineas: 2, fontSize: 10 })]
  const plan = planDePantalla({ titulo: 'Compras', carga: true }, defectos, [], [])
  assert.deepEqual(plan.sinTocar, [])
})
