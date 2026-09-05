import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clienteDeRotulo, indiceDistintivo, resolverLote, tokens } from './cobranzas-cliente.mjs'

// Los cinco clientes REALES del OS al 05/09/2026, con los rótulos REALES de la pestaña Cobranzas.
// Un test de vinculación escrito con nombres inventados acierta siempre y no prueba nada: lo difícil
// de este problema es exactamente que ninguno de estos rótulos contiene al nombre del cliente.
const CLIENTES = [
  { id: 'arcor', nombre_comercial: 'ARCOR', razon_social: null },
  { id: 'quattro', nombre_comercial: 'Franco Quattropani', razon_social: 'Melisa García SAS' },
  { id: 'imotor', nombre_comercial: 'Javier Sánchez - San Francisco - IMOTOR', razon_social: 'Inter Motor SRL' },
  { id: 'estrella', nombre_comercial: 'La Estrella', razon_social: 'Alimentos del Sur SAS' },
  { id: 'messina', nombre_comercial: 'Messina', razon_social: 'Manufacturas Químicas Juan Messina S.A.' },
]

test('los ocho rótulos reales del Sheet caen donde tienen que caer', () => {
  const i = indiceDistintivo(CLIENTES)
  const esperado = {
    MESSINA: 'messina',
    'IMOTOR/San Francisco/JAVI SANCHEZ': 'imotor',
    'LA ESTRELLA /ALIMENTOS DEL SUR SAS': 'estrella',
    ARCOR: 'arcor',
    'Quattropani - Melisa García SAS': 'quattro',
    // Estos tres NO tienen ficha de cliente. Lo correcto es NULL, no el cliente más parecido.
    'MACRO CONSTRUCCIONES SRL': null,
    'LIRIO DANIEL RAMIRO': null,
    ADDATO: null,
  }
  for (const [rotulo, id] of Object.entries(esperado)) {
    assert.equal(clienteDeRotulo(rotulo, i).clienteId, id, `«${rotulo}» se resolvió mal`)
  }
})

test('ninguno de esos rótulos CONTIENE el nombre del cliente: por eso no alcanza la contención', () => {
  // Deja escrito por qué este módulo no es un `includes`. Si algún día alguien lo simplifica a
  // contención textual, este test explica qué se rompe.
  const n = 'javier sanchez - san francisco - imotor'
  assert.equal('imotor/san francisco/javi sanchez'.includes(n), false)
})

test('un token que pertenece a DOS clientes se borra del índice antes de comparar', () => {
  const i = indiceDistintivo([
    { id: 'a', nombre_comercial: 'Construcciones del Norte' },
    { id: 'b', nombre_comercial: 'Construcciones del Sur' },
  ])
  // «construcciones» está en los dos: no distingue a nadie y no puede vincular a ninguno.
  assert.equal(i.has('construcciones'), false)
  assert.equal(clienteDeRotulo('CONSTRUCCIONES', i).clienteId, null)
  // «norte» y «sur» sí distinguen... pero «sur» tiene 3 letras y queda fuera por longitud.
  assert.equal(i.get('norte'), 'a')
})

test('un rótulo que alcanza a dos clientes NO se resuelve: se declara el empate', () => {
  const i = indiceDistintivo(CLIENTES)
  const r = clienteDeRotulo('ARCOR y MESSINA obra conjunta', i)
  assert.equal(r.clienteId, null)
  assert.deepEqual(r.candidatos.sort(), ['arcor', 'messina'])
  // Una cobranza colgada del cliente equivocado es plata en la cuenta corriente de otro.
})

test('las formas societarias no vinculan a nadie', () => {
  const i = indiceDistintivo(CLIENTES)
  assert.equal(clienteDeRotulo('UNA EMPRESA SAS', i).clienteId, null)
  assert.equal(clienteDeRotulo('SRL', i).clienteId, null)
  assert.ok(!tokens('Melisa García SAS').includes('sas'))
})

test('el token que resolvió viaja, para poder auditar la vinculación', () => {
  const i = indiceDistintivo(CLIENTES)
  const r = clienteDeRotulo('LA ESTRELLA /ALIMENTOS DEL SUR SAS', i)
  assert.equal(r.clienteId, 'estrella')
  assert.ok(r.por.includes('estrella') || r.por.includes('alimentos'))
})

test('sin clientes, o con un rótulo vacío, no inventa', () => {
  assert.equal(clienteDeRotulo('MESSINA', indiceDistintivo([])).clienteId, null)
  assert.equal(clienteDeRotulo('', indiceDistintivo(CLIENTES)).clienteId, null)
  assert.equal(clienteDeRotulo('   ', indiceDistintivo(CLIENTES)).clienteId, null)
})

test('el lote informa cuántos quedaron sin resolver, no sólo cuántos se resolvieron', () => {
  const r = resolverLote(
    ['MESSINA', 'ARCOR', 'MACRO CONSTRUCCIONES SRL', 'MESSINA'],
    CLIENTES,
  )
  assert.equal(r.porRotulo.size, 3, 'los repetidos se resuelven una vez')
  assert.equal(r.resueltos, 2)
  // El número que hay que mirar antes de escribir es éste: si «sin resolver» sube de golpe, algo
  // cambió en el Sheet y la vinculación silenciosa dejaría cobranzas huérfanas sin avisar.
  assert.equal(r.sinResolver, 1)
})
