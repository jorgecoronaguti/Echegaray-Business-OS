// LA OBRA DEL DÍA LA DA LA ASIGNACIÓN DE LA WEB (dueño, 14/09/2026).
//
// «La asignación de la web» y «galpon 9 es la estrella». Casos reales medidos en la base:
//  · Rosales Diego: JORNALES bloque 01/09 dice JAVIER SANCHEZ / Mampostería; asignado a mano a
//    Quattropani desde el 08/09 → sus horas del 08–10/09 van a Quattropani.
//  · Zogbe: JORNALES dice LA ESTRELLA (la obra general) y la asignación Galpón 9 → quedan en La Estrella.
//
// MUTACIÓN QUE PONE ESTO ROJO: ignorar la asignación web, dejar que una reconstruida desde JORNALES mueva
// la obra, o mover a otra obra del mismo cliente cuando la planilla dice la general.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDeRegistros, obraPorAsignacionWeb, resolutorDeObra, asignacionesQueMandan } from './jornales-a-registros-hh.mjs'

const CLIENTE = new Map([
  ['la-estrella', 'la-estrella'], ['le-galpon-9', 'la-estrella'],
  ['sf-mamposteria', 'san-francisco'], ['pisos-industriales', 'san-francisco'], ['san-francisco', 'san-francisco'],
  ['quattropani', 'quattropani'],
])

test('obraPorAsignacionWeb: otra obra de otro cliente manda; la general del mismo cliente se queda', () => {
  assert.equal(obraPorAsignacionWeb('sf-mamposteria', 'quattropani', CLIENTE), 'quattropani')
  assert.equal(obraPorAsignacionWeb('sf-mamposteria', 'pisos-industriales', CLIENTE), 'pisos-industriales', 'dos obras específicas del mismo cliente: manda la asignación')
  assert.equal(obraPorAsignacionWeb('la-estrella', 'le-galpon-9', CLIENTE), null, 'galpón 9 es La Estrella')
  assert.equal(obraPorAsignacionWeb('la-estrella', 'la-estrella', CLIENTE), null)
  assert.equal(obraPorAsignacionWeb('la-estrella', null, CLIENTE), null)
})

const PERSONAS = [
  { id: 'p-rosales', nombre_completo: 'ROSALES DIEGO JOSE', en_la_empresa: true, es_prueba: false },
  { id: 'p-zogbe', nombre_completo: 'ZOGBE RAMOS WALTER LEONARDO', en_la_empresa: true, es_prueba: false },
]
const resolver = resolutorDeObra({
  alias: new Map([['javier sanchez mamposteria', 'sf-mamposteria'], ['estrella', 'la-estrella']]),
  canonicas: [], clienteAlias: new Map(),
})
const celda = (h) => ({ escrita: true, formula: null, valor_crudo: String(h), horas: h, texto_no_numerico: false })
const marca = (nombre, fecha, cliente, obra) => ({ pestana: 'Obreros 26', bloque_fila1: 561, fila1: 571, fecha, nombre, cliente, obra, categoria: null, celda: celda(9) })

test('planDeRegistros: Rosales va a Quattropani los días asignados; Zogbe queda en La Estrella; la reconstruida no mueve', () => {
  const marcas = [
    marca('Rosales Diego', '2026-09-07', 'JAVIER SANCHEZ', 'Mamposteria'),
    marca('Rosales Diego', '2026-09-08', 'JAVIER SANCHEZ', 'Mamposteria'),
    marca('Zogbe Leonardo', '2026-08-20', 'LA ESTRELLA', ''),
  ]
  const asignacionesWeb = [
    { persona_id: 'p-rosales', obra_id: 'quattropani', desde: '2026-09-08', hasta: null },
    { persona_id: 'p-zogbe', obra_id: 'le-galpon-9', desde: '2026-08-20', hasta: '2026-09-07' },
  ]
  const { filas } = planDeRegistros(marcas, { personas: PERSONAS, resolver, asignacionesWeb, clienteDeObra: CLIENTE })
  const de = (pid, fecha) => filas.find((f) => f.persona_id === pid && f.fecha === fecha)
  assert.equal(de('p-rosales', '2026-09-07').obra_canonica_id, 'sf-mamposteria', 'antes de la asignación manda la planilla')
  assert.equal(de('p-rosales', '2026-09-08').obra_canonica_id, 'quattropani')
  assert.equal(de('p-rosales', '2026-09-08').origen_obra, 'obra_por_asignacion_web')
  assert.match(de('p-rosales', '2026-09-08').notas, /obra por asignación de la web/)
  assert.equal(de('p-zogbe', '2026-08-20').obra_canonica_id, 'la-estrella')
  // Sin asignaciones web (las reconstruidas las saca `asignacionesQueMandan`), nada se mueve.
  const sin = planDeRegistros(marcas, { personas: PERSONAS, resolver, asignacionesWeb: [], clienteDeObra: CLIENTE })
  assert.equal(sin.filas.find((f) => f.persona_id === 'p-rosales' && f.fecha === '2026-09-08').obra_canonica_id, 'sf-mamposteria')
})

test('Reta 09/09: dos asignaciones el mismo día siguen la cronología — el día suelto en Messina gana a Quattropani abierta', () => {
  const marcas = [
    marca('Rosales Diego', '2026-09-09', 'JAVIER SANCHEZ', 'Mamposteria'),
    marca('Rosales Diego', '2026-09-10', 'JAVIER SANCHEZ', 'Mamposteria'),
  ]
  const asignacionesWeb = [
    { persona_id: 'p-rosales', obra_id: 'quattropani', desde: '2026-09-08', hasta: null },
    { persona_id: 'p-rosales', obra_id: 'messina', desde: '2026-09-09', hasta: '2026-09-09' },
  ]
  const { filas } = planDeRegistros(marcas, { personas: PERSONAS, resolver, asignacionesWeb, clienteDeObra: CLIENTE })
  const de = (fecha) => filas.find((f) => f.fecha === fecha)
  assert.equal(de('2026-09-09').obra_canonica_id, 'messina')
  assert.equal(de('2026-09-09').origen_obra, 'obra_por_asignacion_web')
  assert.equal(de('2026-09-10').obra_canonica_id, 'quattropani')
})

test('Quiroga A. S. 09/09: la licencia con dos asignaciones superpuestas no se desempata, queda en la obra que tenía', () => {
  // MUTACIÓN QUE PONE ESTO ROJO: aplicar el desempate por cronología también a licencias y ausencias.
  const marcas = [
    marca('Rosales Diego', '2026-09-08', 'JAVIER SANCHEZ', 'Mamposteria'),
    { ...marca('Rosales Diego', '2026-09-09', 'z. ENFERMEDAD', 'z. ENFERMEDAD'), fila1: 572 },
    { ...marca('Rosales Diego', '2026-09-09', 'JAVIER SANCHEZ', 'Mamposteria'), nombre: 'Zogbe Leonardo', celda: celda(0) },
  ]
  const asignaciones = [
    { persona_id: 'p-rosales', obra_id: 'quattropani', desde: '2026-09-09', hasta: '2026-09-09' },
    { persona_id: 'p-rosales', obra_id: 'messina', desde: '2026-09-09', hasta: null },
    { persona_id: 'p-zogbe', obra_id: 'quattropani', desde: '2026-09-09', hasta: '2026-09-09' },
    { persona_id: 'p-zogbe', obra_id: 'messina', desde: '2026-09-01', hasta: null },
  ]
  const { filas } = planDeRegistros(marcas, { personas: PERSONAS, resolver, asignaciones, asignacionesWeb: asignaciones, clienteDeObra: CLIENTE })
  const lic = filas.find((f) => f.persona_id === 'p-rosales' && f.tipo_hora === 'licencia')
  assert.equal(lic.obra_canonica_id, 'sf-mamposteria', 'la licencia sigue con la obra del último bloque, no con la asignación corta')
  const aus = filas.find((f) => f.persona_id === 'p-zogbe' && f.tipo_hora === 'ausencia')
  assert.equal(aus.obra_canonica_id, 'sf-mamposteria', 'la ausencia conserva la obra de la planilla')
})

test('empate total entre dos asignaciones web: no decide, manda la planilla', () => {
  const marcas = [marca('Rosales Diego', '2026-09-09', 'JAVIER SANCHEZ', 'Mamposteria')]
  const asignacionesWeb = [
    { persona_id: 'p-rosales', obra_id: 'quattropani', desde: '2026-09-08', hasta: null },
    { persona_id: 'p-rosales', obra_id: 'pisos-industriales', desde: '2026-09-08', hasta: null },
  ]
  const { filas } = planDeRegistros(marcas, { personas: PERSONAS, resolver, asignacionesWeb, clienteDeObra: CLIENTE })
  assert.equal(filas[0].obra_canonica_id, 'sf-mamposteria')
})

test('la excepción de la obra general sigue después del desempate: Zogbe con día suelto de Galpón 9 queda en La Estrella', () => {
  const marcas = [marca('Zogbe Leonardo', '2026-09-03', 'LA ESTRELLA', '')]
  const asignacionesWeb = [
    { persona_id: 'p-zogbe', obra_id: 'quattropani', desde: '2026-08-20', hasta: null },
    { persona_id: 'p-zogbe', obra_id: 'le-galpon-9', desde: '2026-09-03', hasta: '2026-09-03' },
  ]
  const { filas } = planDeRegistros(marcas, { personas: PERSONAS, resolver, asignacionesWeb, clienteDeObra: CLIENTE })
  assert.equal(filas[0].obra_canonica_id, 'la-estrella')
})

test('una licencia no se mueve de obra por una asignación', () => {
  const lic = { ...marca('Rosales Diego', '2026-09-08', 'z. ENFERMEDAD', 'z. ENFERMEDAD'), celda: celda(9) }
  const asignacionesWeb = [{ persona_id: 'p-rosales', obra_id: 'quattropani', desde: '2026-09-08', hasta: null }]
  const { filas } = planDeRegistros([lic], { personas: PERSONAS, resolver, asignacionesWeb, clienteDeObra: CLIENTE })
  assert.ok(filas.every((f) => f.origen_obra !== 'obra_por_asignacion_web'))
})

test('las reconstruidas desde JORNALES no mueven horas: LE Mampostería queda en Mampostería (dueño 14/09)', () => {
  // MUTACIÓN QUE PONE ESTO ROJO: volver a `filter((a) => a.desde)` — la reconstruida a nivel cliente se
  // lleva las horas de la obra específica (medido: 5.470 h movidas).
  const filasDeLaBase = [
    { persona_id: 'p-rosales', obra_id: 'san-francisco', desde: '2026-08-14', hasta: '2026-08-21', notas: 'historial reconstruido desde JORNALES (sheet) · 08/09/2026' },
    { persona_id: 'p-rosales', obra_id: 'quattropani', desde: '2026-08-22', hasta: '2026-08-31', notas: 'Historial RECONSTRUIDO desde JORNALES (sheet) · 08/09/2026 · cerrado' },
    { persona_id: 'p-rosales', obra_id: 'quattropani', desde: '2026-09-01', hasta: null, notas: null },
    { persona_id: 'p-zogbe', obra_id: 'le-galpon-9', desde: null, hasta: '2026-09-07', notas: null },
  ]
  const mandan = asignacionesQueMandan(filasDeLaBase)
  assert.deepEqual(mandan.map((a) => a.desde), ['2026-09-01'], 'sólo la cargada en la app y con fecha de inicio')
  const marcas = [
    marca('Rosales Diego', '2026-08-25', 'JAVIER SANCHEZ', 'Mamposteria'),
    marca('Rosales Diego', '2026-09-02', 'JAVIER SANCHEZ', 'Mamposteria'),
  ]
  const { filas } = planDeRegistros(marcas, { personas: PERSONAS, resolver, asignacionesWeb: mandan, clienteDeObra: CLIENTE })
  assert.equal(filas.find((f) => f.fecha === '2026-08-25').obra_canonica_id, 'sf-mamposteria', 'la reconstruida no mueve')
  assert.equal(filas.find((f) => f.fecha === '2026-09-02').obra_canonica_id, 'quattropani', 'la de la app sí')
})
