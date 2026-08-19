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
import { horasEntre, porActividad, porObra } from './hhPersonaService.ts'
import type { ImputacionHH } from '../types/index.ts'

const imp = (p: Partial<ImputacionHH>): ImputacionHH => ({
  id: Math.random().toString(36).slice(2),
  fecha: '2026-08-19', fecha_inicio_semana: '2026-08-17',
  obra_canonica_id: 'san-francisco', actividad_id: 'act-1', actividad_nombre: 'Hormigón',
  horas: 8, notas: null, fuente_legacy: 'web:obra', ...p,
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
