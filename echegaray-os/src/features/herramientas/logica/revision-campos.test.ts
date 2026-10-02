import { test } from 'node:test'
import assert from 'node:assert/strict'
import { camposDe, faltaParaGuardar, valoresParaEnviar, type ValoresRevision } from './revision-campos.ts'

const v = (p: Partial<ValoresRevision> = {}): ValoresRevision => ({
  fecha: '2026-10-02', vencimiento: '', lectura: '', resultado: '', lugar: '', numero: '', costo: '', observaciones: '', ...p,
})

test('el seguro no lleva kilometraje ni resultado: lleva póliza y compañía', () => {
  const c = camposDe('seguro', 'rodado')
  assert.equal(c.lectura, null)
  assert.equal(c.resultado, false)
  assert.equal(c.numero, 'N° de póliza')
  assert.equal(c.lugar, 'Compañía')
  assert.equal(c.titulo, 'Cargar seguro')
})

test('la RTO lleva oblea, planta y resultado; el service lleva lectura y taller sin resultado', () => {
  const rto = camposDe('rto', 'rodado')
  assert.equal(rto.lugar, 'Planta de RTO')
  assert.equal(rto.resultado, true)
  const s = camposDe('service', 'rodado')
  assert.equal(s.resultado, false)
  assert.equal(s.lugar, 'Taller')
  assert.match(s.vence, /Próximo service/)
})

test('la máquina mide en horas, el rodado en km', () => {
  assert.match(camposDe('service', 'equipo').lectura ?? '', /Horas/)
  assert.match(camposDe('service', 'rodado').lectura ?? '', /Kilometraje/)
})

test('lo que el tipo no lleva no viaja aunque la pantalla lo tenga guardado de otro tipo', () => {
  const sucio = v({ lectura: '84000', resultado: 'apto', lugar: 'Planta 3', numero: 'A-1', costo: '500', vencimiento: '2027-01-01' })
  const seguro = valoresParaEnviar('seguro', 'rodado', sucio)
  assert.equal(seguro.lectura, '')
  assert.equal(seguro.resultado, '')
  assert.equal(seguro.lugar, 'Planta 3') // la compañía sí viaja: el seguro lleva «lugar»
  const insp = valoresParaEnviar('inspeccion', 'rodado', sucio)
  assert.equal(insp.costo, '')
  assert.equal(insp.resultado, 'apto')
})

test('RTO y seguro sin vencimiento no se guardan; service e inspección sí', () => {
  assert.match(faltaParaGuardar('seguro', 'rodado', v()) ?? '', /vencimiento/)
  assert.match(faltaParaGuardar('rto', 'rodado', v({ resultado: 'apto' })) ?? '', /vencimiento/)
  assert.equal(faltaParaGuardar('service', 'rodado', v()), null)
  assert.equal(faltaParaGuardar('inspeccion', 'equipo', v()), null)
})

test('la RTO pide resultado y el condicional pide plazo', () => {
  assert.match(faltaParaGuardar('rto', 'rodado', v({ vencimiento: '2027-01-01' })) ?? '', /resultado/)
  assert.match(faltaParaGuardar('inspeccion', 'rodado', v({ resultado: 'condicional' })) ?? '', /plazo/)
  assert.equal(faltaParaGuardar('rto', 'rodado', v({ vencimiento: '2027-01-01', resultado: 'apto' })), null)
})

test('sin fecha no se guarda', () => {
  assert.match(faltaParaGuardar('service', 'rodado', v({ fecha: '' })) ?? '', /Falta la fecha del service/)
})
