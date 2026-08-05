import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarRespuesta, ofrecidasDe, plano, RESPUESTA, MAX_LARGO } from './respuesta-texto.mjs'

/** Un ítem al que le falta la obra, con las opciones que la historia de Compras contó. */
const itemSinObra = (opciones = ['MESSINA', 'SAN FRANCISCO', 'TALLER'], extra = {}) => ({
  comprobante: { proveedor: 'Combustibles Barcelo', total: 100, fecha: '01/08/2026', numero: '0001-00000001', categoria: 'Combustible', unidad: 'Obras', detalleObra: 'Civil', ...extra.comprobante },
  sugerencia: { obra: { sugerido: opciones[0], n: 126, opciones: opciones.map((v, i) => ({ valor: v, n: 40 - i })) } },
  ...extra,
})

test('un texto que no toca ninguna opción NO se reclama', () => {
  const fajo = { items: [itemSinObra()] }
  assert.equal(interpretarRespuesta(fajo, 'che, mañana le pago a Barcelo'), null)
  assert.equal(interpretarRespuesta(fajo, ''), null)
  assert.equal(interpretarRespuesta(fajo, 'x'.repeat(MAX_LARGO + 1)), null)
})

test('el nombre de la obra ofrecida se reconoce, con acentos y en minúscula', () => {
  const fajo = { items: [itemSinObra(['MESSINA', 'SAN FRANCISCÓ'])] }
  const r = interpretarRespuesta(fajo, 'san francisco')
  assert.equal(r.que, RESPUESTA.OPCION)
  assert.equal(r.campo, 'obra')
  assert.equal(r.valor, 'SAN FRANCISCÓ')
  assert.deepEqual(r.indices, [0])
})

test('UNA respuesta imputa TODO el fajo: cinco fotos, un solo "MESSINA"', () => {
  const fajo = { items: [itemSinObra(), itemSinObra(), itemSinObra()] }
  const r = interpretarRespuesta(fajo, 'MESSINA')
  assert.equal(r.que, RESPUESTA.OPCION)
  assert.deepEqual(r.indices, [0, 1, 2])
})

test('sólo se aplica a los ítems donde esa opción ESTABA ofrecida', () => {
  const fajo = { items: [itemSinObra(['MESSINA']), itemSinObra(['TALLER'])] }
  const r = interpretarRespuesta(fajo, 'messina')
  assert.deepEqual(r.indices, [0])
})

test('dos obras que empatan NO se adivinan: se declara ambiguo con las dos', () => {
  const fajo = { items: [itemSinObra(['MESSINA 1', 'MESSINA 2'])] }
  const r = interpretarRespuesta(fajo, 'messina')
  assert.equal(r.que, RESPUESTA.AMBIGUO)
  assert.deepEqual(r.candidatas.map((c) => c.valor).sort(), ['MESSINA 1', 'MESSINA 2'])
})

test('el exacto le gana al parcial: "MESSINA" con "MESSINA 2" en la lista no es ambiguo', () => {
  const fajo = { items: [itemSinObra(['MESSINA', 'MESSINA 2'])] }
  const r = interpretarRespuesta(fajo, 'messina')
  assert.equal(r.que, RESPUESTA.OPCION)
  assert.equal(r.valor, 'MESSINA')
})

test('la opción se busca por palabra entera, no por subcadena suelta', () => {
  const fajo = { items: [itemSinObra(['SAN'])] }
  // "sanatorio" contiene "san" como subcadena pero no como palabra: no reclama.
  assert.equal(interpretarRespuesta(fajo, 'sanatorio'), null)
  assert.equal(interpretarRespuesta(fajo, 'va a SAN').que, RESPUESTA.OPCION)
})

test('cancelar es una lista corta y explícita — "no" solo no descarta nada', () => {
  const fajo = { items: [itemSinObra()] }
  assert.equal(interpretarRespuesta(fajo, 'descartalo').que, RESPUESTA.DESCARTAR)
  assert.equal(interpretarRespuesta(fajo, 'cancelar').que, RESPUESTA.DESCARTAR)
  assert.equal(interpretarRespuesta(fajo, 'no'), null)
})

test('un fajo sin nada pendiente no reclama nada', () => {
  const completo = { comprobante: { proveedor: 'X', obra: 'MESSINA', categoria: 'a', unidad: 'b', detalleObra: 'c' }, sugerencia: {} }
  assert.equal(interpretarRespuesta({ items: [completo] }, 'messina'), null)
  assert.equal(interpretarRespuesta({ items: [] }, 'messina'), null)
})

test('un ítem ya cargado no ofrece nada', () => {
  const it = itemSinObra()
  it.yaCargado = { fila: 810 }
  assert.deepEqual(ofrecidasDe(it), [])
})

test('las opciones ofrecidas incluyen el desplegable estricto, no sólo el historial', () => {
  const it = itemSinObra(['MESSINA'])
  it.opciones = { obra: ['MESSINA', 'ARCOR', 'HOSPITAL RAWSON'] }
  const vals = ofrecidasDe(it).filter((o) => o.campo === 'obra').map((o) => o.valor)
  assert.ok(vals.includes('HOSPITAL RAWSON'), `el desplegable no se ofreció: ${vals.join(', ')}`)
  const r = interpretarRespuesta({ items: [it] }, 'hospital rawson')
  assert.equal(r.valor, 'HOSPITAL RAWSON')
})

test('plano normaliza acentos, puntuación y espacios', () => {
  assert.equal(plano('  ¿MESSINA?  '), 'messina')
  assert.equal(plano('Camión   BSA'), 'camion bsa')
})
