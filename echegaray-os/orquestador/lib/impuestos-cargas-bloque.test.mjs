import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearGrilla } from './impuestos-grilla.mjs'
import { bloqueCargasSociales, aPosicion, marcaCarga, rotuloCarga } from './impuestos-cargas-bloque.mjs'

const fila = (x) => ({
  impuesto: 'cargas_sociales', periodo: '2026-09', concepto: 'ddjj', fuente: 'calculo', estado: 'estimado',
  vencimiento: '2026-10-10', vencimiento_confianza: 'supuesto', determinado: null, creditos: null, a_pagar: null,
  saldo_a_favor: null, pagado: 0, pendiente: null, datos_al: null, detalle: null, ...x,
})

test('una fila por pendiente —importe, vence, marca— y el total es FÓRMULA sobre esas filas', () => {
  const G = crearGrilla(2026)
  G.push(['título'])
  const { fTotal, pendientes } = bloqueCargasSociales(G, { n: 6, filas: [
    fila({ pendiente: 8166095.05 }),
    fila({ periodo: '2026-06', concepto: 'Plan F931 W303094 · cuota 3/3', fuente: 'manual', vencimiento: '2026-10-16', pendiente: 2494875.65 }),
    fila({ periodo: '2026-06', concepto: 'Plan F931 W303094 · cuota 2/3', estado: 'pagado', vencimiento: '2026-09-16', pagado: 2494875.65, pendiente: 0 }),
    fila({ periodo: '2026-08', estado: 'presentado', vencimiento_confianza: 'verificado', vencimiento: '2026-09-10', pendiente: 100 }),
  ] })
  assert.equal(G.filas[1][0], '6 · CARGAS SOCIALES A PAGAR')
  assert.deepEqual(G.filas.slice(2, 5).map((f) => f.slice(0, 4)), [
    ['F931 ago-26', 100, 'vence 10/09', G.filas[2][3]],
    ['F931 sep-26', 8166095.05, 'vence 10/10', 'estimado · vence supuesto'],
    ['Cuota 3/3 · Plan F931 W303094', 2494875.65, 'vence 16/10', 'estimado · vence supuesto'],
  ])
  assert.equal(pendientes.length, 3, 'la cuota pagada no entra')
  assert.equal(G.filas[fTotal - 1][0], '⇒ Cargas sociales pendientes')
  assert.equal(G.filas[fTotal - 1][1], '=SUM(B3:B5)')
  assert.match(G.filas[2][14], /impuesto_posicion/, 'la columna O declara la fuente')
})

test('el importe desconocido se escribe «sin importe», nunca 0; sin pendientes la sección lo dice', () => {
  const G = crearGrilla(2026)
  bloqueCargasSociales(G, { n: 6, filas: [fila({ pendiente: null })] })
  assert.equal(G.filas[1][1], 'sin importe')
  const V = crearGrilla(2026)
  const r = bloqueCargasSociales(V, { n: 6, filas: [fila({ estado: 'pagado', pendiente: 0 })] })
  assert.equal(r.fTotal, null)
  assert.equal(V.filas[1][0], 'Nada pendiente')
})

test('rótulo, marca y conversión de pg: numeric string → número, null sigue null', () => {
  assert.equal(rotuloCarga(fila({ concepto: 'intereses' })), 'F931 sep-26 · intereses')
  assert.equal(marcaCarga(fila({ estado: 'presentado', vencimiento_confianza: 'verificado' })), '')
  const p = aPosicion(fila({ pendiente: '2494875.65', pagado: null, determinado: null }))
  assert.equal(p.pendiente, 2494875.65)
  assert.equal(p.pagado, 0)
  assert.equal(p.determinado, null)
})
