// LAS HORAS DE UNA PERSONA, AGRUPADAS — y lo que NO se agrupa en silencio.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// Una imputación sin obra o sin actividad es un HECHO —hay 19 filas históricas así—, y agruparla
// bajo una clave vacía la hace desaparecer del corte: el total por obra deja de sumar el total
// general y nadie se entera, porque las dos cifras están en pantallas distintas. Acá se exige que lo
// que no tiene clave aparezca CON NOMBRE («sin obra», «sin actividad»).
//
// Y el período: `horasEntre` recorta por el DÍA trabajado. Las filas legacy no tienen día —su grano
// es la semana— y no pueden contarse en una ventana de fechas: contarlas obligaría a inventarles un
// día dentro de su semana, y el total del período dependería de esa invención.

import test from 'node:test'
import assert from 'node:assert/strict'
import { horasEntre, porActividad, porObra, resumenDelPeriodo } from './hhPersonaService.ts'
import type { ImputacionHH } from '../types/index.ts'

const imp = (p: Partial<ImputacionHH>): ImputacionHH => ({
  id: Math.random().toString(36).slice(2),
  fecha: '2026-08-19', fecha_inicio_semana: '2026-08-17',
  obra_canonica_id: 'san-francisco', obra_nombre: 'San Francisco',
  actividad_id: 'act-1', actividad_nombre: 'Hormigón',
  horas: 8, tipo_hora: 'normal', notas: null, fuente_legacy: 'web:obra', ...p,
})

test('el período recorta por el día trabajado, con los bordes adentro', () => {
  const filas = [
    imp({ fecha: '2026-08-01', horas: 5 }),
    imp({ fecha: '2026-08-10', horas: 8 }),
    imp({ fecha: '2026-08-31', horas: 6 }),
  ]
  assert.equal(horasEntre(filas, '2026-08-01', '2026-08-10'), 13)
})

test('una fila sin día no entra al período: no se le inventa una fecha dentro de su semana', () => {
  const filas = [imp({ fecha: null, horas: 40 }), imp({ fecha: '2026-08-19', horas: 8 })]
  assert.equal(horasEntre(filas, '2026-08-01', '2026-08-31'), 8)
})

test('el corte por obra suma por obra y ordena de más horas a menos', () => {
  const r = porObra([
    imp({ obra_canonica_id: 'arcor', horas: 4 }),
    imp({ obra_canonica_id: 'san-francisco', horas: 8 }),
    imp({ obra_canonica_id: 'san-francisco', horas: 3 }),
  ])
  assert.deepEqual(r.map((x) => [x.clave, x.horas, x.imputaciones]),
    [['san-francisco', 11, 2], ['arcor', 4, 1]])
})

test('lo que no tiene obra aparece como «sin obra», no desaparece del corte', () => {
  const r = porObra([imp({ obra_canonica_id: null, horas: 7 })])
  assert.equal(r.length, 1)
  assert.equal(r[0].etiqueta, 'sin obra')
  assert.equal(r[0].horas, 7)
})

test('lo que no tiene actividad aparece como «sin actividad»', () => {
  const r = porActividad([imp({ actividad_id: null, actividad_nombre: null, horas: 6 })])
  assert.deepEqual(r.map((x) => [x.etiqueta, x.horas]), [['sin actividad', 6]])
})

test('el corte por obra suma lo mismo que el total: ninguna fila se pierde en el camino', () => {
  const filas = [
    imp({ obra_canonica_id: 'arcor', horas: 4 }),
    imp({ obra_canonica_id: null, horas: 7 }),
    imp({ obra_canonica_id: 'messina', horas: 2.5 }),
  ]
  const total = filas.reduce((s, f) => s + f.horas, 0)
  assert.equal(porObra(filas).reduce((s, x) => s + x.horas, 0), total)
})


// ═══ EL RESUMEN QUE ALIMENTA LA LIQUIDACIÓN (19/08/2026) ═══
//
// El dueño: *"El futuro módulo salarial NO debe volver a pedir las horas"*. Esto prueba que de las
// MISMAS filas que consume la obra salen las horas por clase, el total trabajado y la distribución
// por obra — sin un segundo lugar donde cargar nada.

test('una ausencia tiene horas y NO es trabajo: no suma al total trabajado', () => {
  const r = resumenDelPeriodo([
    imp({ fecha: '2026-08-03', horas: 8 }),
    imp({ fecha: '2026-08-04', horas: 8, tipo_hora: 'ausencia' }),
  ], '2026-08-01', '2026-08-15')
  assert.equal(r.trabajadas, 8, 'la ausencia se contó como trabajo')
  assert.equal(r.porTipo.ausencia, 8, 'la ausencia se perdió: hay que poder verla')
  // Y no ensucia la distribución por obra, que es la que se convierte en costo.
  assert.equal(r.obras.reduce((s, o) => s + o.horas, 0), 8)
})

test('las extras se cuentan aparte pero SÍ son horas trabajadas', () => {
  const r = resumenDelPeriodo([
    imp({ fecha: '2026-08-03', horas: 8 }),
    imp({ fecha: '2026-08-03', horas: 2, tipo_hora: 'extra_50' }),
    imp({ fecha: '2026-08-04', horas: 1, tipo_hora: 'extra_100' }),
  ], '2026-08-01', '2026-08-15')
  assert.equal(r.trabajadas, 11)
  assert.equal(r.porTipo.normal, 8)
  assert.equal(r.porTipo.extra_50, 2)
  assert.equal(r.porTipo.extra_100, 1)
})

test('las horas se guardan REALES: dos al 50% son dos, no tres', () => {
  // Multiplicar el recargo al cargar entierra el dato y además infla las HH de obra.
  const r = resumenDelPeriodo([imp({ fecha: '2026-08-03', horas: 2, tipo_hora: 'extra_50' })],
    '2026-08-01', '2026-08-15')
  assert.equal(r.trabajadas, 2)
})

test('lo de otro período no entra, y las cinco clases se informan siempre', () => {
  const r = resumenDelPeriodo([imp({ fecha: '2026-07-31', horas: 8 })], '2026-08-01', '2026-08-15')
  assert.equal(r.trabajadas, 0)
  // Cinco ceros explícitos: una clave ausente obliga a quien lee a preguntarse si hubo o no hubo.
  assert.deepEqual(Object.keys(r.porTipo).sort(),
    ['ausencia', 'extra_100', 'extra_50', 'licencia', 'normal'])
})

test('la distribución por obra se rotula con el NOMBRE, no con el id', () => {
  const r = resumenDelPeriodo([
    imp({ fecha: '2026-08-03', horas: 8, obra_canonica_id: 'o1', obra_nombre: 'Galpón 9' }),
    imp({ fecha: '2026-08-04', horas: 4, obra_canonica_id: 'o2', obra_nombre: 'Pilón' }),
  ], '2026-08-01', '2026-08-15')
  assert.deepEqual(r.obras.map((o) => `${o.etiqueta} ${o.horas}`), ['Galpón 9 8', 'Pilón 4'])
})
