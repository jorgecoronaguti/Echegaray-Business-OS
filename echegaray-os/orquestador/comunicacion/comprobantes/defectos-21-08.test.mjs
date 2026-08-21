// LOS DOS DEFECTOS QUE EL AUDITOR DE CIERRE ENCONTRÓ EL 21/08 — con sus reproducciones exactas.
//
// 1 · «No es una factura» se perdía en el colapso: dos fotos del mismo presupuesto, y si ganaba la
//     lectura que NO marcó el flag, el presupuesto pasaba a carga. La sospecha de cualquier lectura
//     vale para el papel entero.
// 2 · El mensaje prometía «tocá Corregir» y el formulario no tenía con qué: `aplicarCorreccion` no
//     limpiaba `esPresupuestoORemito`. Un freno sin salida deja de ser un control y pasa a ser un
//     gasto perdido — la misma lección que ya pagó el neto el 04/08.

import test from 'node:test'
import assert from 'node:assert/strict'
import { colapsarRepetidos } from '../../lib/comprobantes/fajo.mjs'
import { puedeCargarse, faltantesDe, POLITICA, MOTIVO } from '../../lib/comprobantes/faltantes.mjs'
import { aplicarCorreccion, elementosDe } from './dialogo.mjs'

/** Dos lecturas del MISMO comprobante (misma clave cuit+número: colapsan por identidad).
 *  Sin clave no se colapsa con nadie —regla preexistente y correcta—, así que el camino que pierde
 *  el flag es exactamente éste: el remito con un número impreso que las dos lecturas trajeron. */
const lectura = (extra = {}, origen = 'IMG_1.jpg') => ({
  comprobante: {
    proveedor: 'CON-SEC Materiales', cuit: '30711111112', numero: '0001-00000777',
    fecha: '21/08/2026', total: 288000, concepto: 'Zócalos PVC', ...extra,
  },
  origen: { nombre: origen, fileId: origen },
  leidoEn: '2026-08-21T19:00:00Z',
})

test('el flag «no es factura» sobrevive al colapso sin importar qué lectura gane', () => {
  for (const orden of [
    // la lectura SIN flag es la más completa (obra + detalle): gana ella, y el flag tiene que sobrevivir
    [lectura({ esPresupuestoORemito: true }, 'IMG_1.heic'), lectura({ obra: 'MESSINA', detalleObra: 'zócalos' }, 'IMG_1.jpg')],
    [lectura({ obra: 'MESSINA', detalleObra: 'zócalos' }, 'IMG_1.jpg'), lectura({ esPresupuestoORemito: true }, 'IMG_1.heic')],
  ]) {
    const { items } = colapsarRepetidos(orden)
    assert.equal(items.length, 1, 'las dos fotos del mismo papel tienen que colapsar en una')
    assert.equal(items[0].comprobante.esPresupuestoORemito, true,
      'el colapso perdió el flag cuando ganó la lectura que no lo marcó')
    assert.equal(puedeCargarse(items[0], POLITICA.CHAT), false)
  }
})

test('la palabra de una persona (esFacturaTipeada) le gana al OR del colapso', () => {
  const { items } = colapsarRepetidos([
    lectura({ esPresupuestoORemito: false, esFacturaTipeada: true }, 'IMG_1.heic'),
    lectura({ esPresupuestoORemito: true }, 'IMG_1.jpg'),
  ])
  assert.equal(items.length, 1)
  assert.equal(items[0].comprobante.esPresupuestoORemito, false,
    'una lectura del modelo volvió a frenar lo que una persona ya confirmó')
})

test('Corregir con «factura: SI» destraba de verdad — la salida que el mensaje promete existe', () => {
  const item = { comprobante: { proveedor: 'CON-SEC Materiales', fecha: '21/08/2026', total: 288000, numero: '0001-00000001', esPresupuestoORemito: true } }
  assert.equal(puedeCargarse(item, POLITICA.CARGADOR), false, 'el freno tiene que estar puesto antes')

  // El formulario OFRECE el campo, y primero (es el único que destraba).
  const campos = elementosDe(item).map((e) => e.name)
  assert.equal(campos[0], 'factura')

  const r = aplicarCorreccion(item, { factura: 'SI' })
  assert.equal(r.ok, true)
  assert.equal(r.item.comprobante.esPresupuestoORemito, false)
  assert.equal(r.item.comprobante.esFacturaTipeada, true)
  assert.equal(faltantesDe(r.item, POLITICA.CARGADOR)
    .some((f) => f.codigo === MOTIVO.NO_ES_FACTURA), false, 'sigue frenado después de corregir')
})

test('«factura: NO» lo deja frenado y cualquier otra cosa es un error, no una adivinanza', () => {
  const item = { comprobante: { esPresupuestoORemito: true } }
  const no = aplicarCorreccion(item, { factura: 'no' })
  assert.equal(no.ok, true)
  assert.equal(no.item.comprobante.esPresupuestoORemito, true)
  const raro = aplicarCorreccion(item, { factura: 'quizás' })
  assert.equal(raro.ok, false)
  assert.ok(raro.errors.factura)
})

test('a una factura normal el formulario NO le pregunta si es factura', () => {
  const campos = elementosDe({ comprobante: { proveedor: 'X', total: 100 } }).map((e) => e.name)
  assert.equal(campos.includes('factura'), false)
})
