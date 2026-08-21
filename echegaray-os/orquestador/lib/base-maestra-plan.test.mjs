import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDeCarga, mismoNumero, firmaLineas, esDeEsteLibro, ESTADOS } from './base-maestra-plan.mjs'
import { leerRecursos, leerAnalisis, LIBRO } from './base-maestra-xlsm.mjs'

const HOY = '2026-08-21'
const rec = (fila, A, B, C, D, E, F, G, H, I) => ({ fila, A, B, C, D, E, F, G, H, I })

const FILAS_RECURSOS = [
  rec(8, 1, 'OFICIAL', 'hs', 5235, 46143, 'UOCRA', 'MANO DE OBRA', 'JORNALES', 0),
  rec(9, 2, 'AYUDANTE', 'hs', 4452, 46143, 'UOCRA', 'MANO DE OBRA', 'JORNALES', 0),
  rec(266, 256, 'CARGA SOCIAL OF', 'hr', 5200, 46143, 'UOCRA', 'MANO DE OBRA', 'JORNALES', 0.05),
  rec(300, 289, 'MONOTOP 615', 'KG', 0, null, null, null, null, 0), // sin costo: no genera precio
]
const FILAS_ANALISIS = [
  { fila: 7, A: 'T1001', C: 'REPLANTEO', D: 'M2' },
  { fila: 8, B: 1, E: 0.06 },
  { fila: 10, B: 256, E: 0.06 },
]

/** El libro leído, en la forma que espera el plan. */
function delLibro(filasR = FILAS_RECURSOS, filasA = FILAS_ANALISIS, ingesta = HOY) {
  const r = leerRecursos(filasR, { ingesta })
  const a = leerAnalisis(filasA, { ingesta, recursosValidos: new Set(r.recursos.map((x) => x.codigo)) })
  return {
    recursos: r.recursos, precios: r.precios, tareas: a.tareas,
    invalidosRecurso: r.invalidos, conflictosRecurso: r.conflictos,
    invalidosTarea: a.invalidos, conflictosTarea: a.conflictos,
  }
}

/**
 * Simula lo que el escritor deja en Postgres, incluido el viaje de ida y vuelta de `numeric`, que
 * vuelve como TEXTO. Si el plan comparara con `===` en vez de `mismoNumero`, la segunda corrida
 * marcaría las 409 filas como modificadas y la idempotencia sería mentira.
 */
function comoQuedaEnLaBase(libro) {
  const txt = (n) => (n === null || n === undefined ? null : String(n))
  return {
    recursos: libro.recursos.map((r) => ({ ...r, desperdicio: txt(r.desperdicio) })),
    precios: libro.precios.map((p) => ({ ...p, costo: txt(p.costo) })),
    tareas: libro.tareas.map((t) => ({ ...t })),
    analisis: libro.tareas.map((t) => ({
      codigo: t.codigo, version: 1,
      lineas: t.lineas.map((l) => ({ codigo_recurso: l.codigoRecurso, cantidad: txt(l.cantidad), nota: l.nota, orden: l.orden })),
    })),
  }
}

test('primera corrida contra una base vacía: todo nuevo, nada modificado', () => {
  const p = planDeCarga({ libro: delLibro(), base: {} })
  assert.deepEqual(p.resumen.recurso, { nuevo: 4, modificado: 0, sin_cambios: 0, conflicto: 0, invalido: 0 })
  assert.deepEqual(p.resumen.precio, { nuevo: 3, modificado: 0, sin_cambios: 0, conflicto: 0, invalido: 0 })
  assert.deepEqual(p.resumen.tarea_tipo, { nuevo: 1, modificado: 0, sin_cambios: 0, conflicto: 0, invalido: 0 })
  assert.deepEqual(p.resumen.analisis, { nuevo: 1, modificado: 0, sin_cambios: 0, conflicto: 0, invalido: 0 })
})

test('IDEMPOTENCIA: la segunda corrida sobre el mismo libro da 0 nuevos y 0 modificados', () => {
  const libro = delLibro()
  const base = comoQuedaEnLaBase(libro)
  const p = planDeCarga({ libro: delLibro(), base })
  for (const entidad of ['recurso', 'precio', 'tarea_tipo', 'analisis']) {
    assert.equal(p.resumen[entidad].nuevo, 0, `${entidad}: nuevos`)
    assert.equal(p.resumen[entidad].modificado, 0, `${entidad}: modificados`)
  }
  assert.equal(p.resumen.recurso.sin_cambios, 4)
  assert.equal(p.resumen.analisis.sin_cambios, 1)
})

test('la fecha de la ingestión cambia y eso NO es una modificación', () => {
  const base = comoQuedaEnLaBase(delLibro(FILAS_RECURSOS, FILAS_ANALISIS, '2026-01-01'))
  const p = planDeCarga({ libro: delLibro(FILAS_RECURSOS, FILAS_ANALISIS, '2026-08-21'), base })
  assert.equal(p.resumen.recurso.modificado, 0)
  assert.equal(p.resumen.precio.modificado, 0)
  assert.equal(p.resumen.tarea_tipo.modificado, 0)
})

test('el numeric de Postgres vuelve como texto y sigue siendo el mismo número', () => {
  assert.equal(mismoNumero(0.06, '0.06'), true)
  assert.equal(mismoNumero(0.05, '0.0500'), true)
  assert.equal(mismoNumero(5235, '5235.00'), true)
  assert.equal(mismoNumero(0.05, '0.06'), false)
  assert.equal(mismoNumero(null, null), true)
  assert.equal(mismoNumero(null, '0'), false)   // sin precio NO es precio 0
})

test('un costo distinto abre una versión de precio, no edita la vigente', () => {
  const base = comoQuedaEnLaBase(delLibro())
  const conAumento = FILAS_RECURSOS.map((f) => (f.A === 1 ? { ...f, D: 6000 } : f))
  const p = planDeCarga({ libro: delLibro(conAumento), base })
  assert.equal(p.resumen.precio.modificado, 1)
  assert.match(p.precio.modificado[0].difiere[0], /costo: base "5235" → libro 6000/)
  assert.equal(p.resumen.recurso.modificado, 0)   // el recurso no cambió: cambió su precio
})

test('una cantidad distinta cambia el análisis ENTERO y sube la versión', () => {
  const base = comoQuedaEnLaBase(delLibro())
  const otraCantidad = FILAS_ANALISIS.map((f) => (f.fila === 8 ? { ...f, E: 0.09 } : f))
  const p = planDeCarga({ libro: delLibro(FILAS_RECURSOS, otraCantidad), base })
  assert.equal(p.resumen.analisis.modificado, 1)
  assert.equal(p.analisis.modificado[0].version, 2)
  assert.equal(p.resumen.tarea_tipo.modificado, 0)   // la tarea no cambió: cambió su análisis
})

test('una línea que desaparece del libro cambia el análisis: media receta vieja no es una receta', () => {
  const base = comoQuedaEnLaBase(delLibro())
  const p = planDeCarga({ libro: delLibro(FILAS_RECURSOS, FILAS_ANALISIS.slice(0, 2)), base })
  assert.equal(p.resumen.analisis.modificado, 1)
  assert.match(p.analisis.modificado[0].difiere[0], /2 línea\(s\) vigentes → 1 en el libro/)
})

test('lo que cargó otro NO se pisa: se informa como conflicto', () => {
  const libro = delLibro()
  const base = comoQuedaEnLaBase(libro)
  base.recursos[0] = { ...base.recursos[0], nombre: 'OFICIAL (corregido a mano)', origen: 'carga manual del dueño 20/08' }
  const p = planDeCarga({ libro: delLibro(), base })
  assert.equal(p.resumen.recurso.modificado, 0)
  assert.equal(p.resumen.recurso.conflicto, 1)
  assert.match(p.recurso.conflicto[0].motivo, /no es este libro: no se pisa/)
  assert.equal(esDeEsteLibro(`${LIBRO} · Recursos!8 · ingesta ${HOY}`), true)
  assert.equal(esDeEsteLibro('carga manual del dueño 20/08'), false)
})

test('un recurso que se quedó sin costo no borra el precio vigente: lo denuncia', () => {
  const base = comoQuedaEnLaBase(delLibro())
  const sinCosto = FILAS_RECURSOS.map((f) => (f.A === 1 ? { ...f, D: 0 } : f))
  const p = planDeCarga({ libro: delLibro(sinCosto), base })
  assert.equal(p.resumen.precio.conflicto, 1)
  assert.match(p.precio.conflicto[0].motivo, /se deja como está/)
})

test('los inválidos y los conflictos del libro llegan hasta el resumen: excluido y silencioso es lo mismo que perdido', () => {
  const conBasura = [...FILAS_RECURSOS, rec(412, 401, null, null, 0, null, null, null, null, 0)]
  const conDuplicada = [...FILAS_ANALISIS, { fila: 20, A: 'T1001', C: 'REPLANTEO OTRA VEZ', D: 'M2' }]
  const p = planDeCarga({ libro: delLibro(conBasura, conDuplicada), base: {} })
  assert.equal(p.resumen.recurso.invalido, 1)
  assert.equal(p.resumen.tarea_tipo.conflicto, 1)
  assert.match(p.recurso.invalido[0].motivo, /no tiene nombre/)
})

test('la firma de un análisis no depende del objeto sino de sus líneas en orden', () => {
  const a = [{ orden: 0, codigoRecurso: '1', cantidad: 0.06, nota: 'Análisis!8' }]
  const b = [{ orden: 0, codigo_recurso: '1', cantidad: '0.06', nota: 'Análisis!8' }]
  assert.equal(firmaLineas(a), firmaLineas(b))
  assert.notEqual(firmaLineas(a), firmaLineas([{ ...a[0], cantidad: 0.07 }]))
})

test('los cinco estados son cinco y no hay un sexto', () => {
  const p = planDeCarga({ libro: delLibro(), base: {} })
  for (const entidad of ['recurso', 'precio', 'tarea_tipo', 'analisis']) {
    assert.deepEqual(Object.keys(p.resumen[entidad]).sort(), [...ESTADOS].sort())
  }
})
