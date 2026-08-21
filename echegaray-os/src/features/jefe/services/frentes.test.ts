import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  atrasoDelFrente, avanceDelFrente, diasDeAtraso, diasEntre, frentePorTarea, frentesDe,
} from './frentes.ts'
import type { NodoArbol } from './frentes.ts'

const n = (p: Partial<NodoArbol> & { actividad_id: string }): NodoArbol => ({
  actividad_padre_id: null, nombre: p.actividad_id, camino: p.actividad_id, nivel: 0,
  archivada: false, es_contenedor: false, ...p,
})

test('EL FRENTE JUNTA LAS TAREAS DE TODA SU RAMA, no sólo las hijas directas', () => {
  // El defecto que atrapa: recorrer un solo nivel deja fuera las tareas de un sub-frente, y el
  // frente publica un avance calculado sobre la mitad de su trabajo sin decir que faltaba la otra.
  const arbol = [
    n({ actividad_id: 'g2', es_contenedor: true }),
    n({ actividad_id: 'muro', actividad_padre_id: 'g2', nivel: 1 }),
    n({ actividad_id: 'sur', actividad_padre_id: 'g2', nivel: 1, es_contenedor: true }),
    n({ actividad_id: 'panel', actividad_padre_id: 'sur', nivel: 2 }),
  ]
  const frentes = frentesDe(arbol)
  const g2 = frentes.find((f) => f.id === 'g2')
  assert.deepEqual(g2?.tareas.sort(), ['muro', 'panel'])
})

test('UN CONTENEDOR NUNCA ENTRA COMO TAREA MEDIBLE: la base rechaza medirlo', () => {
  const arbol = [
    n({ actividad_id: 'g2', es_contenedor: true }),
    n({ actividad_id: 'sur', actividad_padre_id: 'g2', nivel: 1, es_contenedor: true }),
  ]
  assert.deepEqual(frentesDe(arbol).find((f) => f.id === 'g2')?.tareas, [])
})

test('LA ARCHIVADA NO CUENTA, ni como frente ni como tarea', () => {
  const arbol = [
    n({ actividad_id: 'g2', es_contenedor: true }),
    n({ actividad_id: 'vieja', actividad_padre_id: 'g2', nivel: 1, archivada: true }),
    n({ actividad_id: 'viva', actividad_padre_id: 'g2', nivel: 1 }),
    n({ actividad_id: 'gz', es_contenedor: true, archivada: true }),
  ]
  const frentes = frentesDe(arbol)
  assert.deepEqual(frentes.map((f) => f.id), ['g2'])
  assert.deepEqual(frentes[0].tareas, ['viva'])
})

test('SIN NINGUNA TAREA MEDIDA EL FRENTE DEVUELVE NULL, NUNCA 0', () => {
  // El defecto que atrapa: un frente sin mediciones se dibujaba con la barra en cero y se leía como
  // «no arrancó». Son dos hechos distintos: cero es no haber empezado; null es no saber.
  const a = avanceDelFrente([{ actividad_id: 'x', avance_pct: null }, { actividad_id: 'y', avance_pct: null }])
  assert.equal(a.pct, null)
  assert.equal(a.medidas, 0)
  assert.equal(a.total, 2)
})

test('EL PROMEDIO SE SACA SOBRE LAS MEDIDAS, y la cobertura viaja con el número', () => {
  const a = avanceDelFrente([
    { actividad_id: 'a', avance_pct: 100 },
    { actividad_id: 'b', avance_pct: 20 },
    { actividad_id: 'c', avance_pct: null },
  ])
  assert.equal(a.pct, 60)
  assert.equal(a.medidas, 2)
  assert.equal(a.total, 3)
})

test('SIN FIN DE PLAN NO HAY ATRASO: es «sin plan», no «0 días»', () => {
  // El defecto que atrapa: tratar la falta de plan como cumplimiento. Publicar «0 días de atraso»
  // sobre una tarea que nadie fechó afirma que va en horario sin que exista un horario.
  assert.equal(diasDeAtraso(null, null, '2026-08-21'), null)
})

test('TERMINAR ANTES NO ES UN ATRASO NEGATIVO', () => {
  assert.equal(diasDeAtraso('2026-08-20', '2026-08-15', '2026-08-21'), null)
})

test('LA TAREA ABIERTA SE MIDE CONTRA HOY; la cerrada, contra su fin real', () => {
  assert.equal(diasDeAtraso('2026-08-11', null, '2026-08-21'), 10)
  assert.equal(diasDeAtraso('2026-08-11', '2026-08-14', '2026-08-21'), 3)
})

test('EL ATRASO DEL FRENTE ES EL DE SU PEOR TAREA, no el promedio', () => {
  // El defecto que atrapa: promediar atrasos diluye la tarea que fija la fecha de fin. Nueve días
  // de una y cero de nueve más dan «un día» y el frente parece sano.
  const t = [
    { fin_plan: '2026-08-11', fin_real: null },
    { fin_plan: '2026-09-30', fin_real: null },
  ]
  assert.equal(atrasoDelFrente(t, '2026-08-21'), 10)
})

test('UN FRENTE SIN NINGUNA TAREA FECHADA NO TIENE ATRASO', () => {
  assert.equal(atrasoDelFrente([{ fin_plan: null, fin_real: null }], '2026-08-21'), null)
})

test('LAS FECHAS SE CUENTAN EN UTC: el borde de mes no corre un día', () => {
  assert.equal(diasEntre('2026-07-31', '2026-08-01'), 1)
  assert.equal(diasEntre('2026-02-28', '2026-03-01'), 1)
  assert.equal(diasEntre('sin fecha', '2026-03-01'), null)
})

test('EL FRENTE DE UNA TAREA SALE DEL ÁRBOL, no del rastro de la fuente', () => {
  // El defecto que atrapa, medido en san-francisco: `rubro` sale de `codigo_padre`, que se conserva
  // como rastro del tracker importado y NO es la jerarquía. «Colocacion de cancamo» salía bajo
  // GALPON 4 en la pantalla del frente y bajo «Sin frente» en la lista de tareas.
  const arbol = [
    n({ actividad_id: 'g4', nombre: 'GALPON 4', es_contenedor: true }),
    n({ actividad_id: 'cancamo', nombre: 'Colocacion de cancamo', actividad_padre_id: 'g4', nivel: 1 }),
  ]
  assert.deepEqual(frentePorTarea(arbol).get('cancamo'), { id: 'g4', nombre: 'GALPON 4' })
})

test('CON FRENTES ANIDADOS GANA EL MÁS CERCANO', () => {
  const arbol = [
    n({ actividad_id: 'obra', nombre: 'FUNDACIONES', es_contenedor: true }),
    n({ actividad_id: 'eje', nombre: 'EJE 5-8', actividad_padre_id: 'obra', nivel: 1, es_contenedor: true }),
    n({ actividad_id: 't', actividad_padre_id: 'eje', nivel: 2 }),
  ]
  assert.equal(frentePorTarea(arbol).get('t')?.nombre, 'EJE 5-8')
})

test('UNA TAREA SIN PADRE NO TIENE FRENTE, y no se le inventa uno', () => {
  assert.equal(frentePorTarea([n({ actividad_id: 'suelta' })]).get('suelta'), undefined)
})
