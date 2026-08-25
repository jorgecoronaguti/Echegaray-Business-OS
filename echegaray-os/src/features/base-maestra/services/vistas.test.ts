// LAS PRUEBAS DE LOS CORTES — cada una nombra el defecto que atrapa.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  corteDe, corteDeLaVista, corteRecursoDe, cumpleCorte, cumpleCorteRecurso, tieneProblema, vistaDe,
} from './vistas.ts'

// ═══ 17 ════════════════════════════════════════════════════════════════════════════════════════

test('«Sin dato real» junta las dos ausencias: sin observado Y sin base', () => {
  // EL DEFECTO: filtrar sólo por `hs_observado == null` deja afuera las tareas que se midieron pero
  // no tienen análisis con qué compararse — que también están sin comparación hecha, que es lo que
  // este corte junta. Es literal del canónico (`t.real === null || t.hh === null`).
  assert.equal(cumpleCorte({ hs_unitarias: 34, hs_observado: null }, 'sinDato'), true)
  assert.equal(cumpleCorte({ hs_unitarias: null, hs_observado: 12 }, 'sinDato'), true)
  assert.equal(cumpleCorte({ hs_unitarias: 34, hs_observado: 44 }, 'sinDato'), false)
})

test('«Con desvío» es sólo lo ADVERSO: una tarea que rindió mejor no es un problema', () => {
  // El canónico filtra `d > 1,1`, o sea la obra pidió MÁS horas que la base. Meter también lo
  // favorable llenaría la lista de trabajo con tareas sobre las que no hay nada que corregir.
  assert.equal(cumpleCorte({ hs_unitarias: 34, hs_observado: 44.88 }, 'desvio'), true)
  assert.equal(cumpleCorte({ hs_unitarias: 34, hs_observado: 24 }, 'desvio'), false)
  assert.equal(cumpleCorte({ hs_unitarias: 34, hs_observado: 35 }, 'desvio'), false)
  assert.equal(cumpleCorte({ hs_unitarias: null, hs_observado: null }, 'desvio'), false)
})

test('«Todo» no filtra nada, ni siquiera lo que no tiene un solo dato', () => {
  assert.equal(cumpleCorte({ hs_unitarias: null, hs_observado: null }, 'todo'), true)
})

test('un corte inventado en la URL cae en «Todo», no rompe la pantalla', () => {
  assert.equal(corteDe('cualquiera'), 'todo')
  assert.equal(corteDe(undefined), 'todo')
  assert.equal(corteDe('desvio'), 'desvio')
})

// ═══ 18 ════════════════════════════════════════════════════════════════════════════════════════

test('«Mano de obra» incluye la carga social: es el costo de la MISMA hora', () => {
  // EL DEFECTO: dejar `carga_social` afuera esconde la mitad del costo de la hora en un chip que
  // promete mostrarlo entero — y la carga social sin su mano de obra al lado no se entiende.
  assert.equal(cumpleCorteRecurso({ tipo: 'mano_obra', costo_base: 1, frescura: 'nueva' }, 'mano_obra'), true)
  assert.equal(cumpleCorteRecurso({ tipo: 'carga_social', costo_base: 1, frescura: 'nueva' }, 'mano_obra'), true)
  assert.equal(cumpleCorteRecurso({ tipo: 'material', costo_base: 1, frescura: 'nueva' }, 'mano_obra'), false)
})

test('«Con problema» es sin precio, precio viejo o precio SIN FECHA', () => {
  // Sin fecha entra a propósito: una antigüedad desconocida no se puede defender delante de un
  // cliente. Dejarla en «ok» la haría parecer un precio vigente cuando nadie sabe de cuándo es.
  assert.equal(tieneProblema({ tipo: 'material', costo_base: null, frescura: 'nueva' }), true)
  assert.equal(tieneProblema({ tipo: 'material', costo_base: 100, frescura: 'vieja' }), true)
  assert.equal(tieneProblema({ tipo: 'material', costo_base: 100, frescura: 'sin_fecha' }), true)
  assert.equal(tieneProblema({ tipo: 'material', costo_base: 100, frescura: 'ok' }), false)
  assert.equal(tieneProblema({ tipo: 'material', costo_base: 100, frescura: 'nueva' }), false)
})

test('un precio de CERO no es «sin precio»: es un precio, y hay que verlo', () => {
  // EL DEFECTO: usar `!costo_base` en vez de `== null` esconde los recursos cargados en 0 —que son
  // un error de carga real— dentro del mismo cajón que los que nunca tuvieron precio.
  assert.equal(tieneProblema({ tipo: 'material', costo_base: 0, frescura: 'nueva' }), false)
})

// ═══ LOS ENLACES VIEJOS ════════════════════════════════════════════════════════════════════════

test('`?v=insumos` y `?v=equipos` siguen abriendo: la lista se unificó, los enlaces no se rompen', () => {
  // EL DEFECTO: cambiar el juego de sub-vistas y dejar 404 los enlaces que ya están en mensajes,
  // marcadores y tests. La lista unificada es la del canónico 18; el enlace viejo llega igual.
  assert.equal(vistaDe('insumos'), 'recursos')
  assert.equal(vistaDe('equipos'), 'recursos')
  assert.equal(vistaDe('mano-obra'), 'mano-obra')
  assert.equal(vistaDe('precios'), 'precios')
  assert.equal(vistaDe(undefined), 'recursos')
  assert.equal(vistaDe('inventada'), 'recursos')
})

test('el chip pedido en la URL le gana al que arrastra el enlace viejo', () => {
  assert.equal(corteDeLaVista('insumos', undefined), 'material')
  assert.equal(corteDeLaVista('insumos', 'problema'), 'problema')
  assert.equal(corteDeLaVista('equipos', undefined), 'todo')
  assert.equal(corteRecursoDe('mano_obra'), 'mano_obra')
  assert.equal(corteRecursoDe('inventado'), 'todo')
})
