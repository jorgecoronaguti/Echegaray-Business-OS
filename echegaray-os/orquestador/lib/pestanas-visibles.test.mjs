import test from 'node:test'
import assert from 'node:assert/strict'
import { ESPEJOS_A_OCULTAR, A_LA_VISTA_A_PROPOSITO, NO_LAS_USA_A_OCULTAR, LAS_OCULTO_EL_DUENO, sePuedeVolverAMostrar, pedidosDeOcultar } from './pestanas-visibles.mjs'

test('nunca se oculta una pestaña que una persona carga o mira', () => {
  // Los tres contraejemplos que costaron pensarlos. Si alguien los mete en la lista de ocultar,
  // esto se pone rojo: `_UOCRA_RAW` se carga a mano, `_PRESUPUESTO_MENSUAL` lo escribe el dueño y
  // `_CAJA_ANEXO` es el detalle al que se va cuando un control no cierra.
  for (const n of ['_UOCRA_RAW', '_PRESUPUESTO_MENSUAL', '_CAJA_ANEXO', '_CRUCE_ARCA']) {
    assert.ok(!ESPEJOS_A_OCULTAR.includes(n), `${n} no se puede ocultar: no es pura captura`)
  }
  for (const n of Object.keys(A_LA_VISTA_A_PROPOSITO)) {
    assert.ok(String(A_LA_VISTA_A_PROPOSITO[n]).length > 20, `${n} está exceptuada sin motivo escrito`)
  }
})

test('sólo se pide ocultar lo que hoy está visible — idempotente', () => {
  const hojas = [
    { title: '_BANCO_RAW', sheetId: 1, hidden: false },
    { title: '_ARCA_RAW', sheetId: 2, hidden: true },
    { title: 'CAJA', sheetId: 3, hidden: false },
  ]
  const r = pedidosDeOcultar(hojas)
  assert.equal(r.cambios.length, 1, 'pidió ocultar algo que ya estaba oculto, o algo que no toca')
  assert.equal(r.cambios[0].updateSheetProperties.properties.sheetId, 1)
  assert.deepEqual(r.yaOcultas, ['_ARCA_RAW'])
  // Todas las que la lista nombra y el archivo no tiene: hay que avisarlas, no tragarlas.
  const nombradas = ESPEJOS_A_OCULTAR.length + Object.keys(NO_LAS_USA_A_OCULTAR).length
  assert.equal(r.noEstan.length, nombradas - 2, 'no avisa de las que no encontró')
})

test('correr dos veces no hace nada la segunda', () => {
  const hojas = [...ESPEJOS_A_OCULTAR, ...Object.keys(NO_LAS_USA_A_OCULTAR)]
    .map((t, i) => ({ title: t, sheetId: i, hidden: true }))
  assert.deepEqual(pedidosDeOcultar(hojas).cambios, [])
})

test('lo que ocultó el dueño no se vuelve a mostrar nunca', () => {
  // El 21/08 ocultó seis con la mano mientras yo analizaba — tres de ellas eran las que mi análisis
  // había descartado. Su edición manda. `--mostrar` deshace lo mío, no lo suyo.
  for (const n of LAS_OCULTO_EL_DUENO) {
    assert.equal(sePuedeVolverAMostrar(n), false, `«${n}» la ocultó él y --mostrar se la devolvería`)
  }
  assert.equal(sePuedeVolverAMostrar('_BANCO_RAW'), true, 'lo que ocultó el OS sí se puede deshacer')
  for (const n of ['Parámetros', '_CAJA_ANEXO', '_PRESUPUESTO_MENSUAL']) {
    assert.ok(LAS_OCULTO_EL_DUENO.includes(n), `${n} la ocultó él: no puede volver a la lista de visibles`)
  }
})

test('nada se oculta sin su motivo escrito al lado', () => {
  // Ocultar una pestaña sin decir por qué es indistinguible de esconderla. El motivo es el que
  // permite discutirlo dentro de seis meses, cuando nadie se acuerde de esta conversación.
  for (const [n, m] of Object.entries(NO_LAS_USA_A_OCULTAR)) {
    assert.ok(String(m).length > 60, `«${n}» se oculta sin motivo suficiente`)
  }
})



test('«Cheques Emitidos» NO se oculta: es la fuente, y está candada', () => {
  // Se unifica por resta: la vista de 9 filas se oculta, la fuente de 106 se queda. Ocultar la
  // fuente le sacaría al dueño la pestaña donde TIPEA los cheques —12 fórmulas de CAJA y
  // _CAJA_ANEXO leen esas filas— y es la única pestaña candada del libro.
  const aOcultar = [...ESPEJOS_A_OCULTAR, ...Object.keys(NO_LAS_USA_A_OCULTAR)]
  assert.ok(!aOcultar.includes('Cheques Emitidos'), 'se pidió ocultar la fuente de los cheques')
  // ═══ Y «Cheques Recibidos» TAMPOCO (21/08/2026) ═══
  // La oculté con un argumento medido y el dueño la pidió de vuelta. Su decisión sobre qué abre no
  // se vuelve a evaluar: se fija acá para que ninguna corrida futura la esconda de nuevo.
  assert.ok(!aOcultar.includes('Cheques Recibidos'), 'el dueño la quiere a la vista')
  assert.equal(sePuedeVolverAMostrar('Cheques Recibidos'), true)
})
