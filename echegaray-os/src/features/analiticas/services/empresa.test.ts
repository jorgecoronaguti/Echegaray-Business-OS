import test from 'node:test'
import assert from 'node:assert/strict'
import type { CertificadoCliente } from '../../clientes/types/cobranzas.ts'
import { caja, cifrasCobranza, cobranza, destinoDe, legajos, leerEgresos, nomina, zonaDe } from './empresa.ts'

test('caja: a una obra, estructura por rama y sin destino; los meses separan las dos líneas', () => {
  const e = leerEgresos([
    { area: 'obras', total: '100', fecha: '2026-08-03' },
    { area: 'personas', total: '40', fecha: '2026-08-10' },
    { area: 'contabilidad_legales', total: '10', fecha: '2026-09-01' },
    { area: 'sin_clasificar', total: '5', fecha: '2026-09-02' },
    { area: 'obras', total: null, fecha: '2026-09-02' },
  ])
  const c = caja(e)
  assert.equal(c.salio, 155)
  assert.equal(c.aObra, 100)
  assert.equal(c.estructura, 50)
  assert.equal(c.sinDestino, 5)
  assert.equal(c.nSinDestino, 1)
  assert.equal(c.estructuraPorPesoDeObra, 0.5)
  assert.deepEqual(c.meses, [{ mes: '2026-08', aObra: 100, estructura: 40 }, { mes: '2026-09', aObra: 0, estructura: 10 }])
  assert.equal(destinoDe('area_que_no_existe'), 'sinDestino', 'un área nueva no se esconde en estructura')
})

test('nómina: el mes estimado no se grafica como pesos (la vista publica un factor 2,04)', () => {
  const filas = [
    { mes: '2026-03-01', costo_nomina: '20000000', es_estimacion: false },
    { mes: '2026-06-01', costo_nomina: '30000000', es_estimacion: false },
    { mes: '2026-08-01', costo_nomina: '2.04', es_estimacion: true },
  ]
  const r = nomina(filas, { desde: null, hasta: null })
  assert.equal(r.base, 20e6)
  assert.equal(r.meses[1].contraBase, 0.5)
  assert.equal(r.meses[2].costo, null)
  assert.equal(r.meses[2].estimacion, true)
  const soloJunio = nomina(filas, { desde: '2026-06-01', hasta: '2026-06-30' })
  assert.equal(soloJunio.meses.length, 1)
  assert.equal(soloJunio.base, 20e6, 'la base es marzo aunque el rango no la incluya')
})

test('legajos por pertenencia: en_la_empresa manda, no la fecha de egreso', () => {
  assert.deepEqual(legajos([
    { en_la_empresa: true, categoria: 'Oficial' }, { en_la_empresa: true, categoria: null },
    { en_la_empresa: false, categoria: 'Ayudante' },
  ]), { plantel: 2, conCategoria: 1, sinCategoria: 1 })
})

const cert = (x: Partial<CertificadoCliente>): CertificadoCliente => ({
  id: '1', cliente_id: 'c1', obra_id: null, obra_nombre: null, numero: 'C1', factura: null, periodo_desde: null,
  periodo_hasta: null, avance_periodo: null, monto: 100, reparo: null, emitido_at: '2026-07-01', vence: '2026-09-30',
  estado: 'emitido', observacion: null, ...x,
} as CertificadoCliente)

test('cobranza: antigüedad desde la emisión del documento pendiente más viejo; sin certificado no se ubica', () => {
  const filas = cobranza([
    { cliente_id: 'c1', nombre_comercial: 'Messina', saldo: '100', vencido: '0' },
    { cliente_id: 'c2', nombre_comercial: 'SF', saldo: '50', vencido: '50' },
    { cliente_id: 'c3', nombre_comercial: 'Cero', saldo: '0', vencido: '0' },
  ], [cert({ emitido_at: '2026-08-01' }), cert({ id: '2', emitido_at: '2026-07-01' }), cert({ id: '3', emitido_at: '2026-01-01', estado: 'cobrado' })], '2026-09-17')
  assert.equal(filas.length, 2, 'saldo cero no es cliente por cobrar')
  assert.equal(filas[0].dias, 78)
  assert.equal(filas[0].estado, 'alDia')
  assert.equal(filas[1].dias, null)
  assert.equal(filas[1].estado, 'vencido')
  assert.deepEqual(cifrasCobranza(filas), { porCobrar: 150, masDe60: 100, alDia: 100 })
  assert.deepEqual([0, 30, 31, 60, 61, 90, 91].map(zonaDe), [0, 0, 1, 1, 2, 2, 3])
})
