// LO QUE ATRAPAN: la escala corrida un día, la barra de un contenedor que se mide, y una flecha que
// sale de la actividad equivocada o desaparece sin que nadie se entere.
//
// Los cuatro defectos son MUDOS. Ninguno tira un error: dibujan una obra que no es. Hasta el
// 24/08/2026 esta aritmética vivía dentro de los componentes y no había un solo test que se pusiera
// rojo al romperla — la deuda que dejó declarada el trabajo del canónico 03.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DIA_PX, barraDe, conectoresEnL, escalaDe, indiceDe, rangoDeObra, t, tramosDeContenedores,
  type FilaDelGantt,
} from './gantt.ts'
import type { NodoObra } from './wbs.ts'
import type { FilaVisible } from './vistaArbol.ts'

const nodo = (id: string, extra: Partial<NodoObra> = {}): NodoObra => ({
  id, padre_id: null, nivel: 0, camino: id, es_contenedor: false, tiene_hijas: false,
  nombre: id, tipo: 'tarea', rol_estructura: null, partida_codigo: null, unidad: null,
  cantidad_objetivo: null, cantidad_ejecutada: null, hh_plan: null, hh_real: null,
  metodo_avance: 'manual', avance_pct: null, inicio_plan: null, fin_plan: null, responsable: null,
  cuadrilla: null, subcontratista: null,
  es_subcontrato: false, estado: null, impedimentos_abiertos: 0, n_pasos: 0, n_pasos_hechos: 0,
  peso_pasos: null, analisis_id: null, tarea_tipo_id: null, cotizacion_partida_id: null,
  tope_frente: null, dotacion_prevista: null, cuadrilla_id: null, tiempo_tecnico: false,
  dias_plan: null, es_critica: false, ...extra,
})
const fila = (n: NodoObra, avance: number | null = null): FilaVisible =>
  ({ nodo: n, avance, agregado: null, plegable: false, plegado: false })

// ═══ LA ESCALA ═══

test('la escala cuenta los días del rango y ubica HOY, o dice que no lo contiene', () => {
  const e = escalaDe({ desde: t('2026-08-01'), hasta: t('2026-08-31') }, t('2026-08-10'))
  assert.equal(e.dias, 30)
  assert.equal(e.hoy, 9)
  // Hoy fuera del rango NO se recorta al borde: se dice que no está, y el Gantt no dibuja la línea
  // amarilla. Recortarlo pintaría «hoy» sobre el primer día de la obra.
  assert.equal(escalaDe({ desde: t('2026-08-01'), hasta: t('2026-08-31') }, t('2026-09-15')).hoy, null)
  assert.equal(escalaDe({ desde: t('2026-08-01'), hasta: t('2026-08-31') }, t('2026-07-15')).hoy, null)
})

test('EL RANGO CONTIENE A HOY aunque la obra entera haya terminado antes', () => {
  const r = rangoDeObra([nodo('a', { inicio_plan: '2026-01-05', fin_plan: '2026-01-20' })], '2026-08-24')
  assert.ok(r)
  assert.equal(r.desde, t('2026-01-05'))
  // Sin esto la línea de hoy no entra en la escala y la obra vencida se ve como si estuviera en plazo.
  assert.ok(r.hasta > t('2026-08-24'))
  // Sin una sola fecha de plan no hay carril que dibujar: null, no un rango inventado desde hoy.
  assert.equal(rangoDeObra([nodo('a')], '2026-08-24'), null)
})

test('el índice de un día se recorta al rango en vez de salirse del lienzo', () => {
  const e = escalaDe({ desde: t('2026-08-01'), hasta: t('2026-08-11') }, t('2026-08-02'))
  assert.equal(indiceDe('2026-08-01', e), 0)
  assert.equal(indiceDe('2026-08-05', e), 4)
  assert.equal(indiceDe('2026-07-20', e), 0)
  assert.equal(indiceDe('2026-12-31', e), e.dias - 1)
})

// ═══ LAS BARRAS ═══

const E = escalaDe({ desde: t('2026-08-01'), hasta: t('2026-08-31') }, t('2026-08-10'))

test('la barra arranca en el inicio de plan y dura los días del plan, inclusive los dos extremos', () => {
  const b = barraDe(fila(nodo('a', { inicio_plan: '2026-08-03', fin_plan: '2026-08-05' }), 40), E, '2026-08-10', new Map())
  assert.ok(b)
  assert.equal(b.dia, 2)
  // Del 3 al 5 son TRES días, no dos: una actividad de un día tiene que medir un día.
  assert.equal(b.dias, 3)
  assert.equal(b.avance, 40)
  assert.equal(b.etiqueta, '40 %')
  assert.equal(b.resumen, false)
})

test('SIN FECHAS DE PLAN NO HAY BARRA: el hueco es el dato', () => {
  assert.equal(barraDe(fila(nodo('a', { fin_plan: '2026-08-05' })), E, '2026-08-10', new Map()), null)
  assert.equal(barraDe(fila(nodo('a', { inicio_plan: '2026-08-05' })), E, '2026-08-10', new Map()), null)
})

test('UN CONTENEDOR NO SE MIDE: corchete plano, sin relleno y sin porcentaje', () => {
  const tramos = new Map([['r', { inicio: '2026-08-02', fin: '2026-08-08' }]])
  const b = barraDe(fila(nodo('r', { es_contenedor: true }), 90), E, '2026-08-10', tramos)
  assert.ok(b)
  assert.equal(b.resumen, true)
  assert.equal(b.avance, 0)
  assert.equal(b.etiqueta, null)
  assert.equal(b.dia, 1)
  assert.equal(b.dias, 7)
})

test('el tono distingue hecha, en curso, vencida y no arrancada', () => {
  const b = (extra: Partial<NodoObra>, av: number | null) =>
    barraDe(fila(nodo('a', { inicio_plan: '2026-08-03', fin_plan: '2026-08-05', ...extra }), av), E, '2026-08-10', new Map())?.tono
  assert.equal(b({}, 100), 'pos')
  // Vencida y sin terminar: ámbar aunque nadie haya tocado la actividad.
  assert.equal(b({}, null), 'warn')
  assert.equal(b({ fin_plan: '2026-08-20' }, 30), 'curso')
  assert.equal(b({ fin_plan: '2026-08-20', es_critica: true }, 30), 'warn')
  assert.equal(b({ fin_plan: '2026-08-20' }, null), 'plan')
})

test('el tramo del contenedor va del primer inicio al último fin de TODA su descendencia', () => {
  const tramos = tramosDeContenedores([
    nodo('r', { es_contenedor: true, tiene_hijas: true }),
    nodo('sub', { padre_id: 'r', es_contenedor: true, tiene_hijas: true }),
    nodo('a', { padre_id: 'sub', inicio_plan: '2026-08-04', fin_plan: '2026-08-09' }),
    nodo('b', { padre_id: 'r', inicio_plan: '2026-08-02', fin_plan: '2026-08-06' }),
  ])
  // El nieto cuenta para el abuelo: si sólo se mirara a las hijas directas, el corchete del rubro
  // arrancaría el 2 y terminaría el 6, tapando cinco días de trabajo real.
  assert.deepEqual(tramos.get('r'), { inicio: '2026-08-02', fin: '2026-08-09' })
  assert.deepEqual(tramos.get('sub'), { inicio: '2026-08-04', fin: '2026-08-09' })
})

// ═══ LAS DEPENDENCIAS EN L ═══

const f = (id: string, dia: number | null, dias = 3): FilaDelGantt =>
  ({ id, barra: dia == null ? null : { dia, dias } })

test('la L nace en el FIN del origen y muere en el ARRANQUE del destino, cada punta en SU fila', () => {
  const { conectores, omitidas } = conectoresEnL(
    [f('a', 1), f('b', 8)], [{ origen_id: 'a', destino_id: 'b' }], { altoFila: 38 },
  )
  assert.equal(omitidas, 0)
  assert.equal(conectores.length, 1)
  // Sale del fin de «a» —día 1 + 3 días = 4 → 96px— a la mitad de la fila 0 (19px), baja hasta la
  // mitad de la fila 1 (57px) y entra al arranque de «b» (8 × 24 − 3 = 189px).
  assert.equal(conectores[0].d, `M${4 * DIA_PX} 19 H${4 * DIA_PX + 8} V57 H189`)
  assert.equal(conectores[0].clave, 'a->b')
})

test('EL ÍNDICE DE LA FILA MANDA: la flecha no puede apuntar a la fila de al lado', () => {
  // La dependencia va de la PRIMERA a la TERCERA. Un conector que contara filas por su posición en
  // la lista de relaciones la dibujaría a la segunda, y nadie lo notaría.
  const { conectores } = conectoresEnL(
    [f('a', 1), f('otra', 4), f('b', 10)], [{ origen_id: 'a', destino_id: 'b' }], { altoFila: 38 },
  )
  assert.ok(conectores[0].d.includes(' V95 '))
})

test('UNA PUNTA FUERA DE LA VISTA NO SE DIBUJA A MEDIAS: se cuenta y se puede decir', () => {
  const filas = [f('a', 1), f('b', 8), f('sinPlan', null)]
  const r = conectoresEnL(filas, [
    { origen_id: 'a', destino_id: 'plegada' },   // el destino está adentro de un frente cerrado
    { origen_id: 'fantasma', destino_id: 'b' },  // el origen lo filtró la vista
    { origen_id: 'a', destino_id: 'sinPlan' },   // el destino no tiene fechas: no hay dónde apoyar
    { origen_id: 'a', destino_id: 'a' },         // una actividad no espera a sí misma
  ], { altoFila: 38 })
  assert.equal(r.conectores.length, 0)
  assert.equal(r.omitidas, 4)
})

test('el codo se apoya del lado del origen cuando el destino ARRANCA ANTES de que el origen termine', () => {
  // Es un plan que no respeta su propia dependencia. Se dibuja igual —esconderla esconde el
  // problema— pero el codo no puede quedar detrás del origen dibujando una L al revés.
  const { conectores } = conectoresEnL(
    [f('a', 5), f('b', 2)], [{ origen_id: 'a', destino_id: 'b' }], { altoFila: 38 },
  )
  assert.equal(conectores[0].d, `M${8 * DIA_PX} 19 H${2 * DIA_PX - 3 - 10} V57 H${2 * DIA_PX - 3}`)
})

test('EL TECHO SE DECLARA: pasadas N flechas, las que faltan se cuentan en vez de desaparecer', () => {
  const filas = Array.from({ length: 10 }, (_, i) => f(`n${i}`, i))
  const rel = filas.slice(1).map((x, i) => ({ origen_id: `n${i}`, destino_id: x.id }))
  const r = conectoresEnL(filas, rel, { altoFila: 38, maximo: 4 })
  assert.equal(r.conectores.length, 4)
  assert.equal(r.omitidas, 5)
})
