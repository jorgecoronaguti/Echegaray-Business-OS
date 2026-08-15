import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDePantalla, QUIEN_LO_ARREGLA, GENERADOR_DE_FORMATO } from './reparar-pantalla.mjs'

const cel = (valor, type) => ({ valor, formato: type ? { numberFormat: { type } } : null })
const def = (tipo, col, fila, extra = {}) => ({ tipo, col, fila, valor: '', que: '', ...extra })

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

test('una columna que mezcla contador y estado se INFORMA, no se repara: silenciar no es arreglar', () => {
  // Sacarle el numberFormat a `Cobranzas!U` apagaría los avisos sin arreglar nada: el formato es
  // correcto para las 38 celdas donde la fórmula devuelve días. El núcleo ya la reporta UNA vez.
  const defectos = [{ tipo: 'columna_estado_y_numero', col: 'U', fila: 5, valor: 'Cobrado', que: '' }]
  const plan = planDePantalla({ titulo: 'Cobranzas', carga: true }, defectos, [], [])
  assert.equal(plan.celdas.length, 0)
  assert.equal(plan.altoPorFila.size, 0)
  assert.deepEqual(plan.sinTocar, defectos, 'queda informado, no reparado')
  assert.match(QUIEN_LO_ARREGLA.columna_estado_y_numero, /dueño/)
})
