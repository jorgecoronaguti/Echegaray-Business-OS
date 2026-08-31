// LA PUERTA DEL PRECIO WEB — que informe siempre, que proponga a veces, y que NUNCA cierre solo.
//
// El test que más importa es el negativo: un precio de internet sin governance válida NO PUEDE
// CONGELAR. Si algún día alguien afloja la política, ese test se pone rojo antes que la oferta.

import test from 'node:test'
import assert from 'node:assert/strict'
import { observacion, aplicar, seleccionar, TIPO_FUENTE, IVA } from './precio-observacion.mjs'
import {
  poderDeObservacion, autorizacion, puedeCongelarSobre, entraAlCosto,
  contarIndependientes, PODER, POLITICA_WEB, LIMITE_SIN_APROBACION,
} from './precio-governance.mjs'

const HOY = new Date('2026-08-31T00:00:00Z')
const web = (extra = {}) => observacion({
  recursoCodigo: '367', descripcion: 'Panel Chapa Trape 50 mm', valor: 100000, unidad: 'm2',
  tipoFuente: TIPO_FUENTE.WEB, url: 'https://comercio-uno.com.ar/panel', observadoEn: '2026-08-31',
  iva: IVA.SIN_IVA, ...extra,
})

test('sin IVA declarado un precio web sólo INFORMA: no entra a ningún costo', () => {
  const v = poderDeObservacion({ observacion: web({ iva: IVA.NO_DECLARADO }), hoy: HOY })
  assert.equal(v.poder, PODER.INFORMAR)
  assert.equal(entraAlCosto(v), false)
  assert.match(v.porQue, /21%/)
})

test('una lectura vieja deja de proponer: nadie nos avisa cuando la página cambia', () => {
  const v = poderDeObservacion({ observacion: web({ observadoEn: '2026-06-01' }), hoy: HOY })
  assert.equal(v.poder, PODER.INFORMAR)
})

test('LA REGLA CRÍTICA · una sola página NO congela una oferta material', () => {
  const v = poderDeObservacion({ observacion: web(), material: true, hoy: HOY })
  assert.equal(puedeCongelarSobre(v), false, 'un precio de internet solo no puede volver defendible una cotización desconocida')
  assert.equal(v.poder, PODER.PROPONER)
  assert.equal(entraAlCosto(v), true, 'sí entra al costo: informar el total no es lo mismo que afirmarlo')
})

test('dos comercios independientes que coinciden suben el escalón — pero el techo sin firma sigue', () => {
  const v = poderDeObservacion({
    observacion: web(), material: true, hoy: HOY,
    coincidencias: [{ url: 'https://comercio-dos.com.ar/x', valor: 104000, moneda: 'ARS' }],
  })
  assert.equal(v.requisitos.find((r) => r.requisito === 'RESPALDO').cumple, true)
  assert.equal(v.poder, LIMITE_SIN_APROBACION, 'con la política sin aprobar, el techo es PROPONER')
  assert.equal(puedeCongelarSobre(v), false)
})

test('dos páginas del MISMO dominio no son dos fuentes: un eco no es una confirmación', () => {
  const n = contarIndependientes({
    observacion: web(),
    coincidencias: [{ url: 'https://comercio-uno.com.ar/otra-pagina', valor: 100500, moneda: 'ARS' }],
  })
  assert.equal(n, 1)
})

test('dos precios que difieren 40% no coinciden: no describen el mismo precio', () => {
  const n = contarIndependientes({
    observacion: web(),
    coincidencias: [{ url: 'https://comercio-dos.com.ar/x', valor: 140000, moneda: 'ARS' }],
  })
  assert.equal(n, 1)
})

test('un recurso NO material sí lo resuelve la web: frenarlo cuesta más de lo que protege', () => {
  const v = poderDeObservacion({
    observacion: web(), material: false, hoy: HOY,
    coincidencias: [{ url: 'https://comercio-dos.com.ar/x', valor: 101000, moneda: 'ARS' }],
  })
  assert.equal(v.poder, PODER.RESOLVER)
  assert.equal(puedeCongelarSobre(v), true)
})

test('el fabricante no necesita segunda opinión, pero tampoco saltea el techo sin firma', () => {
  const v = poderDeObservacion({ observacion: web({ tipoFuente: TIPO_FUENTE.FABRICANTE }), material: true, hoy: HOY })
  assert.equal(v.requisitos.find((r) => r.requisito === 'RESPALDO').cumple, true)
  assert.equal(v.poder, LIMITE_SIN_APROBACION)
})

test('la política sigue SIN APROBAR y eso se dice: nadie firmó por el dueño', () => {
  assert.equal(POLITICA_WEB.aprobadaPor, null)
  const v = poderDeObservacion({ observacion: web(), material: true, hoy: HOY })
  assert.equal(v.politica.aprobadaPor, null)
})

test('una fuente interna no pasa por esta puerta: la política es sólo para lo externo', () => {
  const interno = observacion({ recursoCodigo: '367', valor: 40000, unidad: 'm2', tipoFuente: TIPO_FUENTE.CATALOGO_INTERNO, fuenteId: 'recurso_precio:1', observadoEn: '2026-08-01' })
  assert.equal(poderDeObservacion({ observacion: interno, hoy: HOY }).poder, PODER.RESOLVER)
})

test('LA MUTACIÓN QUE IMPORTA · una autorización de REGLA que no concede RESOLVER no aplica', () => {
  const o = web()
  const v = poderDeObservacion({ observacion: o, material: true, hoy: HOY })
  const a = autorizacion({ observacion: o, veredicto: v })
  assert.equal(a.permite, false)
  assert.equal(a.firmadaPor, null, 'la autorización de regla NO puede tener firmante: nadie firmó')
  const s = seleccionar({ observaciones: [o], regla: { id: 'JERARQUIA_FUENTE', version: 1 } })
  assert.throws(() => aplicar({ seleccion: s, autorizacion: a, destino: 'public.recurso_precio' }), /NO autoriza/)
})

test('con firma humana REAL sí se aplica, y queda quién se hizo cargo', () => {
  const o = web()
  const v = poderDeObservacion({ observacion: o, material: true, hoy: HOY })
  const a = autorizacion({ observacion: o, veredicto: v, firmadaPor: 'jorge@ecsas.com.ar' })
  const s = seleccionar({ observaciones: [o], regla: { id: 'JERARQUIA_FUENTE', version: 1 } })
  const ap = aplicar({ seleccion: s, autorizacion: a, destino: 'public.recurso_precio' })
  assert.match(ap.procedencia.acto3_aplicacion, /firma de jorge@ecsas\.com\.ar/)
  assert.match(a.porQue, /la regla sólo daba PROPONER/)
})
