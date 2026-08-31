// LO QUE ESTOS TESTS ATRAPAN: que la costura no encaje.
//
// El riesgo del adaptador no es que calcule mal —eso lo cubren los otros tres archivos—: es que
// devuelva un objeto con la forma equivocada y `costo.mjs` lea `undefined` donde esperaba un
// estado, sume un `undefined` como cero, y publique un total con cara de completo. Por eso el
// primer test compara CAMPO POR CAMPO contra el `precioVigente` que hoy está en producción.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ESTADO } from './contrato.mjs'
import { precioVigente, observacionDePrecio } from './precios.mjs'
import { resolvedorDePrecios, ESTADO_DE_RESULTADO } from './precio-adaptador.mjs'
import { RESULTADO } from './precio-resolucion.mjs'

const HOY = new Date('2026-08-30T00:00:00Z')
const obs = (o) => observacionDePrecio({ recursoCodigo: 'H21', fuente: 'Planilla · Recursos!324', ...o })

test('la forma de salida tiene TODOS los campos que costo.mjs lee de precioVigente', () => {
  const observaciones = [obs({ precio: 200_000, observadoEn: '2026-08-29' })]
  const viejo = precioVigente('H21', observaciones, { hoy: HOY })
  const nuevo = resolvedorDePrecios()('H21', observaciones, { hoy: HOY })
  for (const campo of Object.keys(viejo)) {
    assert.ok(campo in nuevo, `el adaptador no devuelve «${campo}», que costo.mjs sí lee`)
  }
})

test('con un precio fresco, el viejo y el nuevo dicen LO MISMO', () => {
  const observaciones = [obs({ precio: 200_000, observadoEn: '2026-08-29' })]
  const viejo = precioVigente('H21', observaciones, { hoy: HOY })
  const nuevo = resolvedorDePrecios()('H21', observaciones, { hoy: HOY })
  assert.equal(nuevo.valor, viejo.valor)
  assert.equal(nuevo.moneda, viejo.moneda)
  assert.equal(nuevo.estado, viejo.estado)
  assert.equal(nuevo.estado, ESTADO.EXTRAIDO)
  assert.equal(nuevo.observadoEn, viejo.observadoEn)
  assert.equal(nuevo.antiguedadDias, viejo.antiguedadDias)
})

test('SIN_PRECIO devuelve valor null y estado FALTA_DATO, igual que el viejo', () => {
  const nuevo = resolvedorDePrecios()('H21', [], { hoy: HOY })
  const viejo = precioVigente('H21', [], { hoy: HOY })
  assert.equal(nuevo.valor, null)
  assert.equal(nuevo.valor, viejo.valor)
  assert.equal(nuevo.estado, ESTADO.FALTA_DATO)
  assert.notEqual(nuevo.valor, 0)
})

test('DONDE DIFIEREN · el CABLE UNIPOLAR de 183 días: el viejo lo vence, el nuevo no', () => {
  // Caso real de la corrida del cotizador: vencido por TRES días contra un umbral de 180 puesto a
  // dedo, sobre un recurso que mueve el 0,3% del costo.
  const observaciones = [observacionDePrecio({ recursoCodigo: '112', precio: 5_000, fuente: 'Planilla · Recursos!112', observadoEn: '2026-03-01' })]
  const viejo = precioVigente('112', observaciones, { hoy: HOY })
  const nuevo = resolvedorDePrecios({ pesos: { 112: 0.003 } })('112', observaciones, { hoy: HOY })
  assert.equal(viejo.estado, ESTADO.HISTORICO, 'la regla vieja lo declara vencido por 3 días')
  assert.equal(nuevo.estado, ESTADO.EXTRAIDO, 'con su peso real, 183 días no mueven el total')
  assert.equal(nuevo.resolucion.resultado, RESULTADO.VIGENTE)
})

test('DONDE DIFIEREN · un recurso que ES el costo vence ANTES de los 180 días', () => {
  const observaciones = [observacionDePrecio({ recursoCodigo: '367', precio: 41_680, fuente: 'Planilla · Recursos!367', observadoEn: '2026-05-01' })]
  const viejo = precioVigente('367', observaciones, { hoy: HOY })
  const nuevo = resolvedorDePrecios({ pesos: { 367: 0.60 } })('367', observaciones, { hoy: HOY })
  assert.equal(viejo.estado, ESTADO.EXTRAIDO, 'la regla vieja lo da por bueno a los 121 días')
  assert.equal(nuevo.estado, ESTADO.HISTORICO, 'un recurso que es el 60% del costo no aguanta 121 días')
})

test('una COMPRA REAL desbloquea un recurso que el catálogo tenía vencido', () => {
  const observaciones = [observacionDePrecio({ recursoCodigo: 'RIPIO', precio: 20_000, fuente: 'Planilla · Recursos!1', observadoEn: '2022-05-10' })]
  const compras = [{ fila: 55, fecha: '2026-08-25', proveedor: 'El Carpincho', concepto: '20 M3 - RIPIO', importe: 1_000_000, anulada: false }]
  const sinCompras = resolvedorDePrecios({ recursos: new Map([['RIPIO', { nombre: 'RIPIO', unidad: 'm3', tipo: 'material' }]]) })('RIPIO', observaciones, { hoy: HOY })
  const conCompras = resolvedorDePrecios({ compras, recursos: new Map([['RIPIO', { nombre: 'RIPIO', unidad: 'm3', tipo: 'material' }]]) })('RIPIO', observaciones, { hoy: HOY })
  assert.equal(sinCompras.estado, ESTADO.HISTORICO)
  assert.equal(conCompras.estado, ESTADO.EXTRAIDO)
  assert.equal(conCompras.valor, 50_000, '$1.000.000 ÷ 20 m3')
  assert.equal(conCompras.resolucion.provenance.resueltoEn, 'COMPRA_ECSAS')
  assert.equal(conCompras.resolucion.provenance.esHechoEcsas, true)
})

test('NEGATIVO · sin pesos el adaptador NO afloja: es más exigente que los 180 días', () => {
  const observaciones = [obs({ precio: 200_000, observadoEn: '2026-04-01' })]   // 151 días
  const viejo = precioVigente('H21', observaciones, { hoy: HOY })
  const nuevo = resolvedorDePrecios()('H21', observaciones, { hoy: HOY })
  assert.equal(viejo.estado, ESTADO.EXTRAIDO, '151 < 180: la regla vieja lo acepta')
  assert.equal(nuevo.estado, ESTADO.HISTORICO, 'sin saber cuánto pesa, 151 días no se dan por buenos')
})

test('el mapeo resultado → estado cubre los cuatro resultados y ninguno cae en undefined', () => {
  for (const r of Object.values(RESULTADO)) {
    assert.ok(ESTADO_DE_RESULTADO[r], `«${r}» no tiene estado: costo.mjs leería undefined y lo sumaría como cero`)
  }
})
