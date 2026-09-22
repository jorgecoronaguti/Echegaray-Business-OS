// Los papeles de un rodado (22/09/2026). Lo que se prueba: que «sin cargar» NO se lea como «al día», y que
// el aviso llegue con tiempo de sacar turno.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AVISO_DIAS, estadoDePapel, loQueVence, papelDe, papelesDe, resumenDeUnidad, type Papel,
} from './papeles.ts'

const papel = (o: Partial<Papel> = {}): Papel => ({
  id: o.id ?? 'p1', activo_id: o.activo_id ?? 'a1', tipo: o.tipo ?? 'rto', numero: null, emisor: null,
  titular: null, emitido_en: null,
  vence_en: 'vence_en' in o ? (o.vence_en ?? null) : '2027-03-31',
  dias: 'dias' in o ? (o.dias ?? null) : 190,
  drive_file_id: null, drive_nombre: null, observacion: null,
})

test('un papel que no está NO es un papel al día', () => {
  assert.deepEqual(estadoDePapel(null), { texto: 'sin cargar', tono: 'tenue', alerta: false })
  assert.equal(estadoDePapel(papel({ vence_en: null, dias: null })).texto, 'sin vencimiento')
})

test('vencido, vence hoy, por vencer y al día', () => {
  assert.equal(estadoDePapel(papel({ dias: -3 })).texto, 'vencido hace 3 días')
  assert.equal(estadoDePapel(papel({ dias: -1 })).texto, 'vencido hace 1 día')
  assert.equal(estadoDePapel(papel({ dias: 0 })).texto, 'vence hoy')
  assert.equal(estadoDePapel(papel({ dias: AVISO_DIAS })).tono, 'warn')
  assert.equal(estadoDePapel(papel({ dias: AVISO_DIAS + 1 })).tono, 'pos')
  assert.match(estadoDePapel(papel({ dias: 200, vence_en: '2027-03-31' })).texto, /al día · 31\/03\/27/)
})

test('lo que vence se ordena por urgencia, y el título no vence nunca', () => {
  const ps = [
    papel({ id: 'rto', tipo: 'rto', dias: 10 }),
    papel({ id: 'seg', tipo: 'seguro', dias: -5 }),
    papel({ id: 'tit', tipo: 'titulo', dias: null, vence_en: null }),
    papel({ id: 'lejos', tipo: 'patente', dias: 300 }),
  ]
  assert.deepEqual(loQueVence(ps)?.map((p) => p.id), ['seg', 'rto'])
})

test('sin la migración no se afirma que esté todo al día', () => {
  assert.equal(loQueVence(null), null)
  assert.equal(resumenDeUnidad(null, 'a1'), 'sin cargar')
})

test('el resumen de la unidad nombra cada papel con su estado', () => {
  const ps = [papel({ tipo: 'rto', dias: -2 }), papel({ tipo: 'seguro', dias: 100, vence_en: '2027-01-01' })]
  const t = resumenDeUnidad(ps, 'a1')
  assert.match(t, /RTO vencido hace 2 días/)
  assert.match(t, /Seguro al día/)
  assert.doesNotMatch(t, /Patente/, 'lo que no está no se nombra')
})

test('los papeles de una unidad salen en el orden en que se leen, y no se mezclan con los de otra', () => {
  const ps = [
    papel({ id: '1', tipo: 'titulo' }), papel({ id: '2', tipo: 'rto' }),
    papel({ id: '3', tipo: 'seguro' }), papel({ id: '4', activo_id: 'otro', tipo: 'rto' }),
  ]
  assert.deepEqual(papelesDe(ps, 'a1').map((p) => p.tipo), ['rto', 'seguro', 'titulo'])
  assert.equal(papelDe(ps, 'a1', 'rto')?.id, '2')
  assert.equal(papelDe(ps, 'a1', 'patente'), null)
})
