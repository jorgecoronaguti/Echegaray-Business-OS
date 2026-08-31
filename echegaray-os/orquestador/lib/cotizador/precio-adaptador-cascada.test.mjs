// QUÉ PRUEBA ESTE ARCHIVO
//
// Que los pasos 3 (COMPARABLE) y 4 (WEB) están ENCHUFADOS en el adaptador y que enchufarlos NO
// cambió el orden de la cascada. Es la mitad que ningún test de los dos módulos nuevos podía cubrir:
// cada uno prueba que sabe producir un candidato, y ninguno prueba que el candidato llegue —ni que
// llegue en el escalón correcto—.
//
// La regla que se defiende acá es la del encabezado de `precio-resolucion.mjs`: se toma el PRIMERO
// que esté vigente y se para ahí. Bajar un escalón sin necesidad degrada la procedencia de un número
// que ya teníamos con mejor respaldo, y esa degradación no se ve en el total.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolvedorDePrecios } from './precio-adaptador.mjs'
import { ORIGEN, RESULTADO } from './precio-resolucion.mjs'
import { candidatoWeb } from './precio-web.mjs'
import { aplicarPoliticaContenidoExterno } from '../web/contenido-externo.mjs'
import { ESTADO } from './contrato.mjs'

const HOY = new Date('2026-08-31T12:00:00Z')
const HIERRO = { codigo: '21', nombre: 'HIERRO TORSIONADO ø 16', unidad: 'kg', tipo: 'material' }

const recursos = new Map([[HIERRO.codigo, { nombre: HIERRO.nombre, unidad: HIERRO.unidad, tipo: HIERRO.tipo }]])

/** Los otros diámetros, frescos y todos al mismo $/kg: la cohorte que prueba la independencia. */
const COMPARABLES = ['8', '10', '12', '20'].map((d, i) => ({
  recurso: { codigo: `c${i}`, nombre: `HIERRO TORSIONADO ø ${d}`, unidad: 'kg' },
  valor: 1615, moneda: 'ARS', observadoEn: '2026-08-20',
}))

const obsInterna = (precio, observadoEn) => [{ recursoCodigo: HIERRO.codigo, precio, moneda: 'ARS', fuente: 'Base Maestra', observadoEn }]

const candidatoDeWeb = () => candidatoWeb({
  recurso: HIERRO, alicuotaIva: 0.21,
  envuelto: aplicarPoliticaContenidoExterno({
    texto: 'HIERRO TORSIONADO: $ 9.999 el kg + IVA', url: 'https://materialessanjuan.com.ar/hierro',
    titulo: 'Lista', obtenidoEn: '2026-08-30T10:00:00.000Z',
  }),
}).candidato

// ── EL ORDEN DE LA CASCADA NO CAMBIÓ ──────────────────────────────────────────────────────────

test('con precio interno VIGENTE no se baja a COMPARABLE ni a WEB', () => {
  const resolver = resolvedorDePrecios({ recursos, comparables: COMPARABLES, preciosWeb: new Map([[HIERRO.codigo, candidatoDeWeb()]]) })
  const r = resolver(HIERRO.codigo, obsInterna(1700, '2026-08-25'), { hoy: HOY })
  assert.equal(r.valor, 1700)
  assert.equal(r.resolucion.provenance.resueltoEn, ORIGEN.INTERNO)
  assert.equal(r.resolucion.resultado, RESULTADO.VIGENTE)
})

test('con el interno VENCIDO, el COMPARABLE lo resuelve y le gana a la WEB', () => {
  const resolver = resolvedorDePrecios({ recursos, comparables: COMPARABLES, preciosWeb: new Map([[HIERRO.codigo, candidatoDeWeb()]]) })
  const r = resolver(HIERRO.codigo, obsInterna(1700, '2017-06-07'), { hoy: HOY })
  assert.equal(r.valor, 1615)
  assert.equal(r.resolucion.provenance.resueltoEn, ORIGEN.COMPARABLE)
  assert.equal(r.estado, ESTADO.EXTRAIDO)
  assert.notEqual(r.valor, 9999)   // la web estaba disponible y NO se usó
})

test('sin comparables, el mismo caso baja a WEB — y el número es el de la página', () => {
  const resolver = resolvedorDePrecios({ recursos, comparables: [], preciosWeb: new Map([[HIERRO.codigo, candidatoDeWeb()]]) })
  const r = resolver(HIERRO.codigo, obsInterna(1700, '2017-06-07'), { hoy: HOY })
  assert.equal(r.valor, 9999)
  assert.equal(r.resolucion.provenance.resueltoEn, ORIGEN.WEB)
})

test('el precio resuelto por WEB cita la URL en el campo que costo.mjs muestra', () => {
  const resolver = resolvedorDePrecios({ recursos, preciosWeb: new Map([[HIERRO.codigo, candidatoDeWeb()]]) })
  const r = resolver(HIERRO.codigo, obsInterna(1700, '2017-06-07'), { hoy: HOY })
  assert.match(r.fuente, /materialessanjuan\.com\.ar/)
  assert.equal(r.resolucion.provenance.esHechoEcsas, false)
})

// ── EL §13: SIN NADA NUEVO, TODO SIGUE IGUAL ──────────────────────────────────────────────────

test('sin comparables y sin mapa web, la cascada es exactamente la que había', () => {
  const conNada = resolvedorDePrecios({ recursos })
  const r = conNada(HIERRO.codigo, obsInterna(1700, '2017-06-07'), { hoy: HOY })
  assert.equal(r.resolucion.resultado, RESULTADO.NECESITA_HUMANO)
  assert.equal(r.estado, ESTADO.HISTORICO)
  // Los dos pasos nuevos quedan anotados como probados-y-vacíos, no como inexistentes.
  const pasos = Object.fromEntries(r.resolucion.provenance.recorrido.map((p) => [p.paso, p.estado]))
  assert.equal(pasos.COMPARABLE, 'SIN_CANDIDATO')
  assert.equal(pasos.WEB, 'SIN_CANDIDATO')
})

test('un mapa web vacío no rompe nada y no inventa un cero', () => {
  const resolver = resolvedorDePrecios({ recursos, preciosWeb: new Map() })
  const r = resolver('NO-EXISTE', [], { hoy: HOY })
  assert.equal(r.valor, null)
  assert.equal(r.resolucion.resultado, RESULTADO.SIN_PRECIO)
})

// ── LA COHORTE QUE NO PRUEBA NADA NO RESUELVE ─────────────────────────────────────────────────

test('una cohorte de comparables que no coinciden entre sí NO resuelve el precio', () => {
  const dispersos = COMPARABLES.map((c, i) => ({ ...c, valor: 1000 + i * 500 }))
  const resolver = resolvedorDePrecios({ recursos, comparables: dispersos })
  const r = resolver(HIERRO.codigo, obsInterna(1700, '2017-06-07'), { hoy: HOY })
  assert.equal(r.resolucion.resultado, RESULTADO.NECESITA_HUMANO)
  assert.equal(r.resolucion.provenance.resueltoEn, ORIGEN.INTERNO)  // el viejo, dicho como viejo
})

test('un comparable con fecha vieja NO afirma precio: hereda la fecha de quien le prestó el número', () => {
  // Un comparable no tiene fecha propia: lleva la de la observación que copió. Si esa venció, el
  // comparable venció — y encima con la mitad de la ventana, porque `FACTOR_ORIGEN.COMPARABLE` es
  // 0,5. Acá: vigencia de 21 días contra 3.155 de antigüedad.
  const viejos = COMPARABLES.map((c) => ({ ...c, observadoEn: '2018-01-10' }))
  const resolver = resolvedorDePrecios({ recursos, comparables: viejos })
  const r = resolver(HIERRO.codigo, obsInterna(1700, '2017-06-07'), { hoy: HOY })
  assert.equal(r.resolucion.resultado, RESULTADO.NECESITA_HUMANO)
  assert.equal(r.estado, ESTADO.HISTORICO)
  assert.ok(r.resolucion.vigencia.dias < 30)
  assert.match(r.resolucion.vigencia.porQue, /recortado ×0\.5 porque el precio viene de COMPARABLE/)
})
