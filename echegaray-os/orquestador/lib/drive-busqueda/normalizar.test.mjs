// LO QUE LA PERSONA ESCRIBE Y LO QUE EL ARCHIVO SE LLAMA TIENEN QUE ENCONTRARSE.
//
// El caso que originó todo esto está abajo con nombre y apellido: "vision/traccion" contra
// "Vision / Tracción". Si alguna de estas pruebas se pone en rojo, volvió el bug.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  plano, sinExtension, singular, canonico, tokenizar, tipoPedido, tokensDeArchivo, hashDe,
  cargarSinonimos, _reiniciarSinonimos, STOPWORDS,
} from './normalizar.mjs'

test('plano: la barra, el acento y la mayúscula dejan de importar', () => {
  assert.equal(plano('Vision / Tracción'), 'vision traccion')
  assert.equal(plano('vision/traccion'), 'vision traccion')
  assert.equal(plano('VISIÓN'), 'vision')
  assert.equal(plano('Flujos_Obras-Corregido.xlsx'), 'flujos obras corregido xlsx')
  assert.equal(plano('  doble   espacio  '), 'doble espacio')
  assert.equal(plano(null), '')
})

test('plano: la ñ sobrevive (es una letra, no un acento)', () => {
  assert.equal(plano('Diseño'), 'diseño')
})

test('sinExtension saca la extensión y sólo la extensión', () => {
  assert.equal(sinExtension('PRESUPUESTO.xlsm'), 'PRESUPUESTO')
  assert.equal(sinExtension('Vision / Tracción'), 'Vision / Tracción')
  assert.equal(sinExtension('OC 52948960 6A.xlsx'), 'OC 52948960 6A')
})

test('singular: plural sí, palabra corta no', () => {
  assert.equal(singular('obras'), 'obra')
  assert.equal(singular('jornales'), 'jornal')
  assert.equal(singular('avances'), 'avance')
  assert.equal(singular('mes'), 'mes')
  assert.equal(singular('gas'), 'gas')
})

test('tokenizar tira las palabras que no identifican nada', () => {
  assert.deepEqual(tokenizar('pasame el archivo vision/traccion'), ['vision', 'traccion'])
  assert.deepEqual(tokenizar('quiero el excel de estrategia'), ['estrategia'])
  assert.deepEqual(tokenizar('buscame la planilla del flujo de caja'), ['flujo', 'caja'])
})

test('tokenizar: si TODO era palabra vacía, no devuelve las manos vacías', () => {
  // Alguien que escribió sólo "planilla" está pidiendo algo. Contestarle "no dijiste nada"
  // porque su única palabra estaba en la lista negra es peor que buscar de más.
  assert.deepEqual(tokenizar('planilla'), ['planilla'])
  assert.ok(STOPWORDS.has('planilla'))
})

test('EL CASO: cinco maneras de pedir el mismo archivo dan los mismos tokens', () => {
  const esperado = ['vision', 'traccion']
  for (const forma of ['Vision / Tracción', 'vision traccion', 'vision/traccion', 'VISIÓN TRACCIÓN', 'pasame el archivo vision/traccion']) {
    assert.deepEqual(tokenizar(forma), esperado, forma)
  }
})

test('sinónimos: cash flow y flujo de caja terminan en el mismo lugar', () => {
  assert.equal(canonico('cashflow'), 'flujo')
  assert.equal(canonico('cash'), 'flujo')
  assert.equal(canonico('rrhh'), 'personal')
  assert.equal(canonico('sueldos'), 'jornal')
})

test('sinónimos: acento o no, misma canónica', () => {
  assert.equal(canonico('visión'), canonico('vision'))
  assert.equal(canonico('Tracción'), canonico('traccion'))
})

test('el diccionario crece sin tocar el código', () => {
  _reiniciarSinonimos()
  assert.notEqual(canonico('tractor'), 'traccion')
  cargarSinonimos([{ canonico: 'traccion', variante: 'tractor' }])
  assert.equal(canonico('tractor'), 'traccion')
  _reiniciarSinonimos()
})

test('tipoPedido lee el tipo que la persona nombró', () => {
  assert.equal(tipoPedido('quiero el excel de estrategia'), 'planilla')
  assert.equal(tipoPedido('pasame el pdf del contrato'), 'pdf')
  assert.equal(tipoPedido('pasame vision'), null)
})

test('tokensDeArchivo mira el nombre Y la carpeta', () => {
  const t = tokensDeArchivo({ name: 'Vision / Tracción', path: 'administracion/Estrategia/Vision/Vision / Tracción' })
  assert.ok(t.includes('vision'))
  assert.ok(t.includes('traccion'))
  assert.ok(t.includes('estrategia'), 'la carpeta también identifica')
})

test('hashDe cambia si cambió algo y no cambia si no cambió nada', () => {
  const a = { name: 'X', path: 'p', modified_time: '2026-01-01', mime_type: 'm' }
  assert.equal(hashDe(a), hashDe({ ...a }))
  assert.notEqual(hashDe(a), hashDe({ ...a, name: 'Y' }))
  assert.notEqual(hashDe(a), hashDe({ ...a, modified_time: '2026-01-02' }))
  assert.equal(hashDe(a).length, 16)
})
