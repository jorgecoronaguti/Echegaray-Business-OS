// EL GANTT GLOBAL ES DE OBRAS — LO QUE SE PUEDE PROBAR SIN NAVEGADOR.
//
// Acá viven los tres defectos que este archivo tiene que atrapar y que ninguna otra prueba ve:
//
//   1. Que una obra SIN fechas de plan reciba barra igual. Es el defecto silencioso: la pantalla
//      abre, la fila está, y la obra parece empezar y terminar el mismo día. Nadie lo mira dos
//      veces porque no hay error en ningún lado.
//   2. Que se dibuje media línea base. Con `inicio_base` cargado y `fin_base` vacío, una marca
//      debajo de la barra se lee como una línea base sellada — y hoy hay CERO actividades con
//      línea base en toda la empresa (medido el 18/08/2026 contra `obra_actividad`: 0 de 344).
//   3. Que la ventana de tiempo deje a HOY fuera de la pantalla. Una cartera cuyo plan venció el
//      mes pasado dibujaría un Gantt sin la línea de hoy, que es justo el caso donde el atraso es
//      lo único que importa.
//
// Lo que NO se prueba acá: que la fuente sea `obra_plan_vs_real` y no una segunda agregación. Eso
// es una lectura contra la base y se mide en `tests/obras-gantt-global.spec.ts`, en el navegador.

import test from 'node:test'
import assert from 'node:assert/strict'
import { filasDeObras, ventana, COLUMNAS_PLAZO, type PlazoObra } from './ganttObras.ts'

const HOY = '2026-08-18'

const obra = (p: Partial<PlazoObra> & { obra_id: string, nombre: string }): PlazoObra => ({
  estado: 'activa',
  inicio_plan: null,
  fin_plan: null,
  inicio_base: null,
  fin_base: null,
  avance_pct: null,
  desvio_plazo_dias: null,
  n_actividades: 0,
  ...p,
})

test('una obra sin fechas de plan no tiene barra, y dice por qué', () => {
  const filas = filasDeObras([
    obra({ obra_id: 'arcor', nombre: 'ARCOR' }),
    obra({ obra_id: 'la-estrella', nombre: 'La Estrella', n_actividades: 12 }),
  ], HOY)

  const arcor = filas.find((f) => f.obraId === 'arcor')!
  assert.equal(arcor.barra, null, 'una obra sin cronograma no puede tener barra')
  assert.equal(arcor.motivo, 'sin cronograma cargado')

  const estrella = filas.find((f) => f.obraId === 'la-estrella')!
  assert.equal(estrella.barra, null, 'actividades sin fecha no producen una barra')
  assert.equal(estrella.motivo, 'sin fechas de plan')
})

test('la obra con fechas tiene barra con sus dos puntas y su avance', () => {
  const [fila] = filasDeObras([obra({
    obra_id: 'san-francisco', nombre: 'San Francisco',
    inicio_plan: '2026-06-22', fin_plan: '2026-08-27', avance_pct: 47, n_actividades: 89,
  })], HOY)

  assert.deepEqual(fila.barra?.inicio, '2026-06-22')
  assert.deepEqual(fila.barra?.fin, '2026-08-27')
  assert.equal(fila.barra?.avancePct, 47)
  assert.equal(fila.motivo, null, 'una obra con barra no explica una ausencia que no existe')
})

test('la línea base se dibuja sólo con las dos puntas — hoy no hay ninguna sellada', () => {
  const filas = filasDeObras([
    obra({ obra_id: 'a', nombre: 'A', inicio_plan: '2026-07-01', fin_plan: '2026-08-01', n_actividades: 3 }),
    obra({ obra_id: 'b', nombre: 'B', inicio_plan: '2026-07-01', fin_plan: '2026-08-01', inicio_base: '2026-06-15', n_actividades: 3 }),
    obra({ obra_id: 'c', nombre: 'C', inicio_plan: '2026-07-01', fin_plan: '2026-08-01', inicio_base: '2026-06-15', fin_base: '2026-07-20', n_actividades: 3 }),
  ], HOY)

  assert.equal(filas.find((f) => f.obraId === 'a')!.barra!.base, null, 'sin línea base no se dibuja nada')
  assert.equal(filas.find((f) => f.obraId === 'b')!.barra!.base, null, 'media línea base no es una línea base')
  assert.deepEqual(filas.find((f) => f.obraId === 'c')!.barra!.base, { inicio: '2026-06-15', fin: '2026-07-20' })
})

test('vencida es plan pasado con avance por debajo de 100, y no el reloj de la máquina', () => {
  const filas = filasDeObras([
    obra({ obra_id: 'tarde', nombre: 'Tarde', inicio_plan: '2026-06-01', fin_plan: '2026-08-04', avance_pct: 93, n_actividades: 35 }),
    obra({ obra_id: 'lista', nombre: 'Lista', inicio_plan: '2026-06-01', fin_plan: '2026-08-04', avance_pct: 100, n_actividades: 35 }),
    obra({ obra_id: 'en-plazo', nombre: 'En plazo', inicio_plan: '2026-08-03', fin_plan: '2026-08-22', avance_pct: 0, n_actividades: 7 }),
  ], HOY)

  assert.equal(filas.find((f) => f.obraId === 'tarde')!.barra!.vencida, true)
  assert.equal(filas.find((f) => f.obraId === 'lista')!.barra!.vencida, false, 'terminada no es vencida')
  assert.equal(filas.find((f) => f.obraId === 'en-plazo')!.barra!.vencida, false)
})

test('las archivadas quedan afuera salvo que se las pida', () => {
  const cartera = [
    obra({ obra_id: 'galpones', nombre: 'Galpones', estado: 'cerrada' }),
    obra({ obra_id: 'messina', nombre: 'Messina', inicio_plan: '2026-07-06', fin_plan: '2026-08-14', n_actividades: 31 }),
  ]
  assert.deepEqual(filasDeObras(cartera, HOY).map((f) => f.obraId), ['messina'])
  assert.equal(filasDeObras(cartera, HOY, true).length, 2)
})

test('las obras se ordenan por arranque y las que no tienen plan caen al final', () => {
  const filas = filasDeObras([
    obra({ obra_id: 'sin', nombre: 'Sin plan', n_actividades: 4 }),
    obra({ obra_id: 'sf', nombre: 'San Francisco', inicio_plan: '2026-06-22', fin_plan: '2026-08-27', n_actividades: 89 }),
    obra({ obra_id: 'quattropani', nombre: 'Salón Comercial', inicio_plan: '2026-08-03', fin_plan: '2026-08-22', n_actividades: 7 }),
    obra({ obra_id: 'messina', nombre: 'Messina', inicio_plan: '2026-07-06', fin_plan: '2026-08-14', n_actividades: 31 }),
  ], HOY)
  assert.deepEqual(filas.map((f) => f.obraId), ['sf', 'messina', 'quattropani', 'sin'])
})

test('la ventana incluye HOY aunque la cartera entera haya vencido', () => {
  const filas = filasDeObras([obra({
    obra_id: 'vieja', nombre: 'Vieja', inicio_plan: '2026-01-10', fin_plan: '2026-02-10', n_actividades: 5,
  })], HOY)
  const v = ventana(filas, HOY)!
  assert.ok(v.desde < new Date('2026-01-10T00:00:00Z'), 'la ventana tiene que abrir antes del arranque')
  assert.ok(v.hasta > new Date('2026-08-18T00:00:00Z'), 'hoy tiene que caer adentro del eje')
})

test('sin ninguna obra con fechas no hay eje que dibujar', () => {
  const filas = filasDeObras([obra({ obra_id: 'arcor', nombre: 'ARCOR' })], HOY)
  assert.equal(ventana(filas, HOY), null)
})

test('la lectura no pide una sola columna de plata', () => {
  // El Gantt no habla de dinero. Si alguien agrega `monto_contratado` o `monto_presupuestado` a la
  // lectura "porque ya que estamos", esto se pone rojo antes de que el importe viaje al navegador
  // de todos los que abran la pantalla.
  for (const prohibida of ['monto_contratado', 'monto_presupuestado', 'costo_real', 'margen_actual',
    'margen_esperado', 'costo_presupuestado', 'certificado', 'facturado', 'cobrado']) {
    assert.ok(!COLUMNAS_PLAZO.split(',').includes(prohibida), `${prohibida} no puede viajar al Gantt`)
  }
})
