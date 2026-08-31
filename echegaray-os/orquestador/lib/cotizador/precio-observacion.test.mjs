// LO QUE UNA OBSERVACIÓN DE PRECIO NO PUEDE SER, Y LOS TRES ACTOS QUE NO SE PUEDEN SALTEAR.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  observacion, seleccionar, aplicar, especificacionNormalizada, hashDeObservacion,
  TIPO_FUENTE, VEREDICTO, IVA, esExperienciaEcsas,
} from './precio-observacion.mjs'

const REGLA = { id: 'JERARQUIA_FUENTE', version: 1 }
const base = (extra = {}) => observacion({
  recursoCodigo: '367', descripcion: 'Panel Chapa Trape 50 mm', valor: 41680.44, unidad: 'm2',
  tipoFuente: TIPO_FUENTE.WEB, url: 'https://ejemplo.com.ar/panel', observadoEn: '2026-08-31',
  iva: IVA.SIN_IVA, ...extra,
})

test('un precio de cero o negativo NO es una observación: tira', () => {
  assert.throws(() => base({ valor: 0 }), /no es un precio/)
  assert.throws(() => base({ valor: -5 }), /no es un precio/)
})

test('sin fecha, sin unidad o sin fuente citable no hay observación', () => {
  assert.throws(() => base({ observadoEn: null }), /sin fecha/)
  assert.throws(() => base({ unidad: null }), /sin unidad/)
  assert.throws(() => observacion({ recursoCodigo: '1', valor: 10, unidad: 'm2', tipoFuente: TIPO_FUENTE.WEB, observadoEn: '2026-08-31' }), /de dónde salió/)
})

test('LA REGLA: valid_until sólo si la FUENTE la declara — una vigencia estimada no entra ahí', () => {
  assert.throws(() => base({ validoHasta: '2026-09-30' }), /sin que la fuente lo declare/)
  const conDocumento = base({ tipoFuente: TIPO_FUENTE.COTIZACION_PROVEEDOR, documento: 'presupuesto-1234.pdf', validoHasta: '2026-09-15', validoHastaLoDiceLaFuente: true })
  assert.equal(conDocumento.validoHasta, '2026-09-15')
})

test('la web NUNCA es experiencia de ECSAS, y una compra SÍ', () => {
  assert.equal(base().esExperienciaEcsas, false)
  assert.equal(esExperienciaEcsas(TIPO_FUENTE.WEB), false)
  assert.equal(esExperienciaEcsas(TIPO_FUENTE.COMPRA_ECSAS), true)
  assert.equal(esExperienciaEcsas(TIPO_FUENTE.COTIZACION_PROVEEDOR), true)
})

test('el hash es determinístico y distingue dos hechos distintos', () => {
  assert.equal(base().hash, base().hash)
  assert.notEqual(base().hash, base({ valor: 41680.45 }).hash)
  assert.notEqual(base().hash, base({ observadoEn: '2026-08-30' }).hash)
  assert.equal(base().hash.length, 32)
  assert.equal(base().hash, hashDeObservacion(base()))
})

test('la especificación normalizada iguala dos nombres del mismo producto', () => {
  const a = especificacionNormalizada({ nombre: 'Panel Chapa Trape Blanco Pur 50 Mm Foil Blanco', unidad: 'm2' })
  const b = especificacionNormalizada({ nombre: 'panel aislante 50mm PUR chapa trapezoidal blanco', unidad: 'm2' })
  assert.ok(a.atributos.includes('50mm') && b.atributos.includes('50mm'), `a=${a.atributos} b=${b.atributos}`)
  const comunes = a.palabras.filter((w) => b.palabras.includes(w))
  assert.ok(comunes.includes('panel') && comunes.includes('blanco'), `comunes=${comunes}`)
})

test('la especificación saca el diámetro de «HIERRO LISO ø 16»', () => {
  const s = especificacionNormalizada({ nombre: 'HIERRO LISO ø 16', unidad: 'kg' })
  assert.deepEqual(s.atributos, ['d16'])
  assert.equal(s.unidad, 'kg')
})

test('ACTO 2 · la selección respeta la jerarquía: una factura le gana a una página nueva', () => {
  const web = base({ observadoEn: '2026-08-31' })
  const compra = base({ tipoFuente: TIPO_FUENTE.COMPRA_ECSAS, fuenteId: 'compra_sheet:412', url: null, observadoEn: '2026-05-01', valor: 38000 })
  const s = seleccionar({ observaciones: [web, compra], regla: REGLA })
  assert.equal(s.elegida.tipoFuente, TIPO_FUENTE.COMPRA_ECSAS, 'más nueva no es más fuerte')
  assert.equal(s.descartadas.length, 1)
  assert.equal(s.descartadas[0].tipoFuente, TIPO_FUENTE.WEB, 'la descartada queda escrita, no se borra')
})

test('una selección SIN REGLA VERSIONADA no se puede auditar y tira', () => {
  assert.throws(() => seleccionar({ observaciones: [base()], regla: null }), /versionada/)
  assert.throws(() => seleccionar({ observaciones: [base()], regla: { id: 'X' } }), /versionada/)
})

test('sin candidatas admisibles la selección lo DICE, no elige la menos mala', () => {
  const s = seleccionar({ observaciones: [base()], regla: REGLA, admisible: () => ({ ok: false, porQue: 'la unidad no convierte' }) })
  assert.equal(s.veredicto, VEREDICTO.SIN_CANDIDATA)
  assert.equal(s.elegida, null)
  assert.equal(s.descartadas[0].porQue, 'la unidad no convierte')
})

test('ACTO 3 · aplicar SIN autorización tira — es la autonomía que el programa no pide', () => {
  const s = seleccionar({ observaciones: [base()], regla: REGLA })
  assert.throws(() => aplicar({ seleccion: s, autorizacion: null, destino: 'recurso_precio' }), /sin autorización/)
  assert.throws(() => aplicar({ seleccion: s, autorizacion: { permite: false, porQue: 'la regla no alcanza' }, destino: 'recurso_precio' }), /NO autoriza/)
})

test('LA REGLA: una autorización HUMANA sin firmante es una firma fabricada y se rechaza', () => {
  const s = seleccionar({ observaciones: [base()], regla: REGLA })
  const falsa = { permite: true, autorizadoPorTipo: 'HUMANO', autorizadoPor: 'el sistema', firmadaPor: null, observacionHash: s.elegida.hash }
  assert.throws(() => aplicar({ seleccion: s, autorizacion: falsa, destino: 'recurso_precio' }), /firma fabricada/)
})

test('una autorización de OTRA observación no sirve para ésta', () => {
  const s = seleccionar({ observaciones: [base()], regla: REGLA })
  const otra = { permite: true, autorizadoPorTipo: 'REGLA', autorizadoPor: 'PRECIO_WEB v1', observacionHash: 'no-es-el-mismo' }
  assert.throws(() => aplicar({ seleccion: s, autorizacion: otra, destino: 'recurso_precio' }), /OTRA observación/)
})

test('una aplicación válida deja los TRES actos trazados', () => {
  const s = seleccionar({ observaciones: [base(), base({ valor: 44000, url: 'https://otro.com.ar/p' })], regla: REGLA })
  const a = aplicar({
    seleccion: s, destino: 'public.recurso_precio',
    autorizacion: { permite: true, autorizadoPorTipo: 'REGLA', autorizadoPor: 'PRECIO_WEB v1', firmadaPor: null, observacionHash: s.elegida.hash },
  })
  assert.equal(a.procedencia.acto1_observacion, s.elegida.hash)
  assert.equal(a.procedencia.acto2_seleccion.regla.id, 'JERARQUIA_FUENTE')
  assert.match(a.procedencia.acto3_aplicacion, /REGLA:PRECIO_WEB v1/)
  assert.equal(a.procedencia.acto2_seleccion.descartadas, 1)
})
