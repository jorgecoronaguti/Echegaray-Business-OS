// LOS DEFECTOS QUE ATRAPA — cada uno se pone rojo si se revierte el arreglo.
//
//  1 · Un paquete sin ART arrancando igual. El bloqueo es de SEGURIDAD: es gente de un tercero
//      parada en la obra sin cobertura, y la responsabilidad vuelve a Echegaray.
//  2 · «Falta» y «venció» dibujados iguales. Una ART vencida con la casilla `documentacion_ok` en
//      true es exactamente el caso que hay que ver antes de que alguien entre.
//  3 · El avance de la actividad publicado como avance del paquete cuando el paquete cubre sólo una
//      parte: sería el trabajo propio y el ajeno mezclados, presentados como el del subcontratista.
//  4 · La comparación propio-vs-subcontrato hecha contra el PRECIO CONTRATADO en vez del COSTO
//      REAL. Es el sesgo que la migración 2500 dejó advertido por escrito: lo que le ponemos
//      —materiales, andamio, ayuda de gremio, comida— lo paga la obra igual, por otra ventanilla.
//  5 · El personal del subcontratista contado como plantel propio (§23).

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  armarComparacion, avanceDelPaquete, estadoDelPaquete, faltaEnLaBase, necesitaResolverse,
  plazoDelPaquete, puedeIniciar, resumenCertificado, resumenContratado, revisarDocumentacion,
  type DocumentoPaquete, type VinculoActividad,
} from './subcontratosReglas.ts'

const HOY = '2026-08-21'

const doc = (p: Partial<DocumentoPaquete> & Pick<DocumentoPaquete, 'tipo'>): DocumentoPaquete => ({
  id: `${p.tipo}-1`, descripcion: null, fecha_emision: null, vence_el: null, ...p,
})

// ── 1 · el bloqueo ────────────────────────────────────────────────────────────────────────────
test('sin ART cargada el paquete NO puede iniciar', () => {
  const r = revisarDocumentacion([doc({ tipo: 'contrato', fecha_emision: '2026-07-21' })], HOY)
  assert.deepEqual(r.bloqueos, ['ART sin cargar'])
  assert.equal(puedeIniciar(r), false)
})

test('una ART VENCIDA bloquea igual que una que falta, y se dice distinto', () => {
  const r = revisarDocumentacion([doc({ tipo: 'art', vence_el: '2026-07-01' })], HOY)
  assert.equal(puedeIniciar(r), false)
  assert.match(r.bloqueos[0], /vencida el 01\/07/)
  const art = r.filas.find((f) => f.tipo === 'art')
  assert.equal(art?.estado, 'vencido', 'vencido y falta son dos hechos distintos')
})

test('la ART vigente deja arrancar, y el contrato que falta avisa sin bloquear', () => {
  const r = revisarDocumentacion([doc({ tipo: 'art', vence_el: '2026-12-31' })], HOY)
  assert.equal(puedeIniciar(r), true)
  assert.ok(r.avisos.some((a) => a.startsWith('Contrato firmado')), 'el contrato que falta se avisa')
  assert.ok(r.avisos.some((a) => a.startsWith('Seguro de responsabilidad')))
})

test('la ART renovada manda sobre la vieja: una vigente no se lee como vencida', () => {
  const r = revisarDocumentacion([
    doc({ tipo: 'art', vence_el: '2026-06-30' }),
    { ...doc({ tipo: 'art', vence_el: '2027-01-31' }), id: 'art-2' },
  ], HOY)
  assert.equal(puedeIniciar(r), true)
})

test('el papel que vence dentro de 30 días avisa antes de vencer', () => {
  const r = revisarDocumentacion([
    doc({ tipo: 'art', vence_el: '2026-12-31' }),
    doc({ tipo: 'seguro_rc', vence_el: '2026-09-05' }),
  ], HOY)
  const seguro = r.filas.find((f) => f.tipo === 'seguro_rc')
  assert.equal(seguro?.estado, 'por_vencer')
  assert.equal(seguro?.detalle, 'vence 05/09')
  assert.equal(puedeIniciar(r), true, 'el seguro por vencer no frena el inicio')
})

// ── 2 · el estado que se muestra es el efectivo ───────────────────────────────────────────────
test('un paquete «en curso» sin ART NO se muestra como en curso', () => {
  const r = revisarDocumentacion([], HOY)
  const e = estadoDelPaquete('en_curso', r)
  assert.equal(e.clave, 'bloqueado')
  assert.equal(e.tono, 'neg')
  assert.equal(e.label, 'ART sin cargar')
})

test('un paquete terminado no se marca en rojo por papeles que ya no frenan nada', () => {
  const e = estadoDelPaquete('terminado', revisarDocumentacion([], HOY))
  assert.equal(e.clave, 'terminado')
  assert.equal(e.label, 'Hecha')
})

// ── 3 · el avance no se inventa ───────────────────────────────────────────────────────────────
const vinculo = (p: Partial<VinculoActividad> = {}): VinculoActividad => ({
  actividad_id: 'a1', actividad: 'Tabiques de yeso', seccion: 'Yesería',
  cantidad: 96, unidad: 'm²', ayuda_de_gremio: false, cantidad_objetivo: 182,
  hh_plan: 146, dias_plan: 18, pct: 40, ...p,
})

test('si el paquete cubre PARTE de la actividad, su avance no es el de la actividad', () => {
  const a = avanceDelPaquete('en_curso', [vinculo()])
  assert.equal(a.pct, null, '40% es el avance de los 182 m², no el de los 96 subcontratados')
  assert.match(a.base, /cubre parte de la actividad/)
})

test('si cubre la actividad entera, el avance de la actividad ES el del paquete', () => {
  const a = avanceDelPaquete('en_curso', [vinculo({ cantidad: 182 })])
  assert.equal(a.pct, 40)
})

test('un paquete terminado avanza 100 y uno sin actividad vinculada no avanza nada', () => {
  assert.equal(avanceDelPaquete('terminado', []).pct, 100)
  const sin = avanceDelPaquete('previsto', [])
  assert.equal(sin.pct, null)
  assert.equal(sin.base, 'sin actividad vinculada')
})

test('el plazo distingue el paquete cerrado del que no tiene fechas', () => {
  assert.equal(plazoDelPaquete({ fecha_inicio_plan: '2026-08-25', fecha_fin_plan: '2026-08-30', fecha_fin_real: null }, HOY).texto, '6 d')
  assert.equal(plazoDelPaquete({ fecha_inicio_plan: null, fecha_fin_plan: null, fecha_fin_real: '2026-08-01' }, HOY).texto, 'cerrado')
  assert.equal(plazoDelPaquete({ fecha_inicio_plan: null, fecha_fin_plan: null, fecha_fin_real: null }, HOY).texto, 'sin plazo')
})

// ── 4 · la comparación va contra el COSTO REAL ────────────────────────────────────────────────
const insumos = (over: Partial<Parameters<typeof armarComparacion>[0]['paquete']> = {}) => ({
  paquete: {
    cantidad: 96, unidad: 'm²', precio_contratado: 706_560, aportes: 89_600,
    costo_real: 796_160, hh_apoyo: 8, personas_externas: 4,
    fecha_inicio_plan: '2026-08-25', fecha_fin_plan: '2026-09-01', ...over,
  },
  actividad: vinculo(),
})

test('el lado del subcontrato es el COSTO REAL, no el precio contratado', () => {
  const filas = armarComparacion(insumos(), true)
  const costo = filas.find((f) => f.clave === 'Costo directo')
  assert.equal(costo?.subcontrato.valor, 796_160)
  assert.notEqual(costo?.subcontrato.valor, 706_560, 'con el precio contratado el subcontrato sale barato por construcción')
})

test('el costo propio NO se estima: la celda queda vacía CON su motivo', () => {
  const costo = armarComparacion(insumos(), true).find((f) => f.clave === 'Costo directo')
  assert.equal(costo?.propio.valor, null)
  assert.match(costo?.falta ?? '', /análisis de costo de la actividad/)
})

test('sin permiso económico la fila de costo dice «sin permiso», no un hueco', () => {
  const costo = armarComparacion(insumos(), false).find((f) => f.clave === 'Costo directo')
  assert.equal(costo?.propio.texto, 'sin permiso')
  assert.equal(costo?.subcontrato.texto, 'sin permiso')
  assert.equal(costo?.subcontrato.valor, null, 'y el número no viaja')
})

test('las HH del subcontrato son SÓLO la ayuda de gremio declarada', () => {
  const hh = armarComparacion(insumos(), true).find((f) => f.clave === 'HH propias')
  assert.equal(hh?.propio.valor, 146)
  assert.equal(hh?.subcontrato.valor, 8)
  assert.equal(hh?.diferencia.valor, -138, 'subcontratar libera 138 HH propias')
})

// ── 5 · su gente no es nuestra gente ──────────────────────────────────────────────────────────
test('el personal del subcontratista no se suma al plantel propio', () => {
  const fila = armarComparacion(insumos(), true).find((f) => f.clave === 'Personal en obra')
  assert.equal(fila?.subcontrato.valor, 4)
  assert.equal(fila?.propio.valor, null, 'la dotación no se reparte por actividad para llenar la celda')
  assert.match(fila?.falta ?? '', /no entra en la nómina ni en la capacidad de obra/)
})

// ── el objeto que todavía no está en la base ──────────────────────────────────────────────────
test('los tres modos en que PostgREST dice «ese objeto no existe» se reconocen', () => {
  assert.equal(faltaEnLaBase('relation "public.subcontrato_documento" does not exist'), true)
  assert.equal(faltaEnLaBase("Could not find the table 'public.subcontrato_documento' in the schema cache"), true)
  assert.equal(faltaEnLaBase('Could not find the function public.subcontrato_fijar_precio'), true)
  assert.equal(faltaEnLaBase('permission denied for table subcontrato'), false,
    'un problema de permisos NO es una migración sin aplicar, y confundirlos manda a arreglar lo que no es')
})

// ═══ 6 · LO QUE LA PANTALLA 10 PONE EN ROJO ARRIBA DE TODO ═══
//
// El botón «N para resolver» decide a qué paquete entra primero el jefe de obra. Los dos defectos
// que atrapan estas pruebas: que un paquete sin actividad vinculada deje de contar como problema
// —es el que después aparece dos veces en el costo de la obra— y que «sin cotizar» se cuele en el
// mismo número, diluyendo lo que de verdad frena.

const revisionDe = (docs: DocumentoPaquete[]) => revisarDocumentacion(docs, HOY)

test('bloquea el inicio ⇒ hay que resolverlo', () => {
  const p = { revision: revisionDe([]), vinculos: [{} as VinculoActividad] }
  assert.equal(necesitaResolverse(p), true, 'un paquete sin ART dejó de contarse como problema')
})

test('sin actividad vinculada ⇒ hay que resolverlo, aunque los papeles estén al día', () => {
  const docs: DocumentoPaquete[] = [
    { id: '1', tipo: 'art', descripcion: null, fecha_emision: '2026-01-01', vence_el: '2027-01-01' },
    { id: '2', tipo: 'contrato', descripcion: null, fecha_emision: '2026-01-01', vence_el: null },
    { id: '3', tipo: 'seguro_rc', descripcion: null, fecha_emision: '2026-01-01', vence_el: '2027-01-01' },
  ]
  const revision = revisionDe(docs)
  assert.equal(puedeIniciar(revision), true, 'con los tres papeles al día el paquete puede arrancar')
  assert.equal(necesitaResolverse({ revision, vinculos: [] }), true,
    'un paquete que no cubre ninguna actividad no se puede medir ni comparar: es un problema')
  assert.equal(necesitaResolverse({ revision, vinculos: [{} as VinculoActividad] }), false,
    'un paquete con papeles al día y su actividad NO es un problema')
})

test('el contratado no suma los precios que nadie cargó como si fueran cero', () => {
  const r = resumenContratado([
    { precio_contratado: 3_500_000 }, { precio_contratado: null }, { precio_contratado: 1_850_000 },
  ])
  assert.equal(r.total, 5_350_000)
  assert.equal(r.sinPrecio, 1, 'el total se publicó como cerrado escondiendo un paquete sin precio')
})

test('sin ningún precio cargado el total es cero PERO lo dice: son tres sin precio, no $ 0 contratado', () => {
  const r = resumenContratado([{ precio_contratado: null }, { precio_contratado: null }, { precio_contratado: null }])
  assert.equal(r.total, 0)
  assert.equal(r.sinPrecio, 3)
})

// DEFECTO 6 · El pie de la tabla publicando un CERTIFICADO que nadie certificó. Con paquetes que
// tienen precio y avance, la tentación es `precio × avance`: sale un número redondo, con cara de
// cálculo, y es con lo que después se le paga a un tercero. Certificar es un acto, no una
// proporción — mientras no haya registro, el pie tiene que decir que no hay registro.
test('el certificado sin registro es null con motivo, nunca $ 0 ni el avance valorizado', () => {
  const r = resumenCertificado([{ certificado: null }, { certificado: null }])
  assert.equal(r.total, null, 'un cero acá se lee como «no se certificó nada», que es una afirmación')
  assert.ok(r.motivo, 'sin motivo, el hueco del pie no se puede explicar en la pantalla')
})

test('el certificado suma sólo lo cargado y no cuenta los nulos como cero', () => {
  const r = resumenCertificado([{ certificado: 816_000 }, { certificado: null }, { certificado: 1_935_000 }])
  assert.equal(r.total, 2_751_000)
  assert.equal(r.motivo, null)
})

test('cero certificado CARGADO sí es un hecho y se publica como cero', () => {
  const r = resumenCertificado([{ certificado: 0 }, { certificado: null }])
  assert.equal(r.total, 0, 'el 0 cargado se perdió: se trató un dato real como si faltara')
  assert.equal(r.motivo, null)
})
