import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  abreSemana, csvDePlanilla, esHabil, filasDePlanilla, pieDeTareasConParte, recortar, rotuloDia, rotuloRango,
  textoCelda, textoPie, ventanaHabil, type CeldaPlanilla, type NodoWbs,
} from './planillaObra.ts'

// LA PLANILLA (04c): diez días hábiles DE ESTA OBRA, grupos = historias con costo y peso, celdas que
// dicen fracción/cantidad/quién y un pie que no escribe 0 donde no hubo parte.

const nadie = new Set<string>()

test('un día hábil es de la semana laboral de la obra y fuera del calendario', () => {
  assert.equal(esHabil('2026-09-07', [1, 2, 3, 4, 5], nadie), true)   // lunes
  assert.equal(esHabil('2026-09-05', [1, 2, 3, 4, 5], nadie), false)  // sábado
  assert.equal(esHabil('2026-09-05', [1, 2, 3, 4, 5, 6], nadie), true)
  assert.equal(esHabil('2026-09-07', [1, 2, 3, 4, 5], new Set(['2026-09-07'])), false)
  assert.equal(esHabil('2026-09-07', [], nadie), true, 'sin semana declarada cae a lunes-viernes')
})

test('la ventana son diez hábiles que terminan en la fecha; ‹ corre una ventana entera', () => {
  const v = ventanaHabil('2026-09-04', 0, [1, 2, 3, 4, 5], nadie)
  assert.equal(v.length, 10)
  assert.equal(v[0], '2026-08-24')
  assert.equal(v[9], '2026-09-04')
  const atras = ventanaHabil('2026-09-04', -1, [1, 2, 3, 4, 5], nadie)
  assert.equal(atras[9], '2026-08-21')
  assert.equal(atras[0], '2026-08-10')
  // Un feriado en el medio se saltea y la ventana sigue teniendo diez columnas.
  const conFeriado = ventanaHabil('2026-09-04', 0, [1, 2, 3, 4, 5], new Set(['2026-08-31']))
  assert.equal(conFeriado.length, 10)
  assert.equal(conFeriado.includes('2026-08-31'), false)
  assert.equal(conFeriado[0], '2026-08-21')
})

test('los rótulos: «L 24/08», el rango «24/08 → 04/09», y el separador cae al cambiar de semana', () => {
  assert.equal(rotuloDia('2026-08-24'), 'L 24/08')
  assert.equal(rotuloDia('2026-08-26'), 'X 26/08')
  const v = ventanaHabil('2026-09-04', 0, [1, 2, 3, 4, 5], nadie)
  assert.equal(rotuloRango(v), '24/08 → 04/09')
  assert.equal(abreSemana(v, 5), true)
  assert.equal(abreSemana(v, 4), false)
  assert.equal(abreSemana(v, 0), false)
})

const nodo = (x: Partial<NodoWbs> & { actividad_id: string; ruta_orden: number[] }): NodoWbs => ({
  nombre: x.actividad_id, nivel: x.ruta_orden.length / 2 - 1, tiene_hijas: false, archivada: false, tipo: 'tarea', ...x,
})

test('grupos = historias con su costo y peso; las hojas cuelgan debajo; lo suelto va a «Sin historia»', () => {
  const wbs = [
    nodo({ actividad_id: 'r', ruta_orden: [0, 0], tiene_hijas: true, tipo: 'resumen', nombre: 'Obra gruesa' }),
    nodo({ actividad_id: 'h1', ruta_orden: [0, 0, 0, 0], tiene_hijas: true, tipo: 'resumen', nombre: 'Fundaciones' }),
    nodo({ actividad_id: 't1', ruta_orden: [0, 0, 0, 0, 0, 0], nombre: 'Excavación' }),
    nodo({ actividad_id: 't2', ruta_orden: [0, 0, 0, 0, 1, 0], nombre: 'Armadura' }),
    nodo({ actividad_id: 'tx', ruta_orden: [1, 0], nombre: 'Suelta' }),
    nodo({ actividad_id: 'ta', ruta_orden: [0, 0, 0, 0, 2, 0], nombre: 'Archivada', archivada: true }),
  ]
  const grupos = filasDePlanilla(wbs,
    [{ actividad_id: 't1', unidad: 'm³', cantidad_objetivo: 1100, cantidad_ejecutada: 960, avance_pct: 87.3, inicio_plan: '2026-08-24', fin_plan: '2026-08-28', estado_operativo: 'en_curso' }],
    [{ actividad_id: 'h1', costo_mo: 1250000, peso: 0.123 }])
  assert.equal(grupos.length, 2)
  assert.equal(grupos[0].nombre, 'Fundaciones')
  assert.equal(grupos[0].costo, '$ 1.250.000')
  assert.equal(grupos[0].peso, '12%')
  assert.deepEqual(grupos[0].tareas.map((t) => [t.numero, t.nombre, t.uniCant, t.pct, t.tienePlan]),
    [['1.1', 'Excavación', 'm³ · 1.100', '87%', true], ['1.2', 'Armadura', 'sin medición', '—', false]])
  assert.equal(grupos[1].nombre, 'Sin historia')
  assert.equal(grupos[1].peso, 'sin peso')
  assert.deepEqual(grupos[1].tareas.map((t) => t.nombre), ['Suelta'])
})

test('sin historias, los grupos son las raíces y no se inventa peso', () => {
  const wbs = [
    nodo({ actividad_id: 'r', ruta_orden: [0, 0], tiene_hijas: true, tipo: 'resumen', nombre: 'Pisos' }),
    nodo({ actividad_id: 't', ruta_orden: [0, 0, 0, 0], nombre: 'Llaneado' }),
  ]
  const g = filasDePlanilla(wbs, [], [])
  assert.equal(g.length, 1)
  assert.equal(g[0].nombre, 'Pisos')
  assert.equal(g[0].costo, 'sin costo')
  assert.equal(g[0].tareas[0].nombre, 'Llaneado')
})

const celda = (x: Partial<CeldaPlanilla>): CeldaPlanilla => ({
  actividad_id: 'a', fecha: '2026-08-24', fraccion: 0.2, cantidad: 7, personas: [], activos: [], n_partes: 1, ...x,
})

test('la celda dice «0,2», «7/9» o «RQ · JM +1» según el toggle', () => {
  const nombre = (id: string) => ({ p1: 'Rodolfo Quiroga', p2: 'Juan Molina' } as Record<string, string>)[id]
  assert.equal(textoCelda(celda({}), 'fraccion', 9, nombre), '0,2')
  assert.equal(textoCelda(celda({ fraccion: 1 }), 'fraccion', 9, nombre), '1')
  assert.equal(textoCelda(celda({}), 'cantidad', 9, nombre), '7/9')
  assert.equal(textoCelda(celda({}), 'cantidad', null, nombre), '7')
  assert.equal(textoCelda(celda({ cantidad: null, fraccion: 0.25 }), 'cantidad', 9, nombre), '0,25')
  assert.equal(textoCelda(celda({ personas: ['p1', 'p2'], activos: ['e1'] }), 'quien', 9, nombre), 'RQ · JM · +1')
  assert.equal(textoCelda(celda({}), 'quien', 9, nombre), '—')
})

test('el pie cuenta tareas con parte por día y escribe «—» donde no hubo', () => {
  const pie = pieDeTareasConParte(
    [celda({ actividad_id: 'a' }), celda({ actividad_id: 'b' }), celda({ actividad_id: 'a', fecha: '2026-08-25' })],
    ['2026-08-24', '2026-08-25', '2026-08-26'])
  assert.deepEqual(pie, ['2', '1', '—'])
})

test('«N de M · ver el resto» y el recorte por grupos', () => {
  const grupos = filasDePlanilla([
    nodo({ actividad_id: 'r', ruta_orden: [0, 0], tiene_hijas: true, tipo: 'resumen' }),
    nodo({ actividad_id: 'a', ruta_orden: [0, 0, 0, 0] }), nodo({ actividad_id: 'b', ruta_orden: [0, 0, 1, 0] }),
    nodo({ actividad_id: 'c', ruta_orden: [0, 0, 2, 0] }),
  ], [], [])
  const corto = recortar(grupos, 2)
  assert.equal(corto[0].tareas.length, 2)
  assert.equal(textoPie(2, 3), '2 de 3 · ver el resto')
  assert.equal(textoPie(3, 3), '3 de 3')
})

test('el CSV lleva una fila por tarea y una columna por día, con BOM para Excel', () => {
  const grupos = filasDePlanilla([
    nodo({ actividad_id: 'r', ruta_orden: [0, 0], tiene_hijas: true, tipo: 'resumen', nombre: 'G' }),
    nodo({ actividad_id: 'a', ruta_orden: [0, 0, 0, 0], nombre: 'Tarea "A"' }),
  ], [], [])
  const csv = csvDePlanilla(grupos, ['2026-08-24', '2026-08-25'], (id, f) => (f === '2026-08-24' ? '0,2' : ''))
  const lineas = csv.split('\n')
  assert.equal(lineas[0], '﻿"#";"Grupo";"Tarea";"Uni · cant";"%";"L 24/08";"M 25/08"')
  assert.equal(lineas[1], '"1.1";"G";"Tarea ""A""";"sin medición";"—";"0,2";""')
})
