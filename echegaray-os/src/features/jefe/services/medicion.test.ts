import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AVISO_CRITERIO, avisoDePrecision, controlDe, deltaHasta, elPorcentajeMueveElAvance, enVista,
  leerSeleccion, opcionesMasivas, renglones, vistaInicial,
} from './medicion.ts'
import type { TareaDelDia } from './medicion.ts'

const t = (p: Partial<TareaDelDia> & { actividad_id: string }): TareaDelDia => ({
  nombre: p.actividad_id, tipo: 'tarea', metodo_avance: 'partes', avance_pct: 0,
  unidad: null, cantidad_objetivo: null, impedimentos_abiertos: 0, ...p,
})

test('UN PORCENTAJE SOBRE UNA ACTIVIDAD MEDIDA POR CANTIDAD NO SE OFRECE: sería un no-op mudo', () => {
  // El defecto que atrapa: `obra_actividad_control` calcula el avance de `cantidad` como
  // producción / objetivo. Una fila con `avance_pct` entra sin error y el porcentaje no se mueve —
  // el jefe se va convencido de que cargó el día y el número quedó donde estaba.
  const r = renglones([t({ actividad_id: 'm', metodo_avance: 'cantidad', unidad: 'm²', cantidad_objetivo: 96 })])[0]
  assert.equal(r.aplicable, false)
  assert.equal(r.motivo, 'se mide en m² sobre 96: cargala de a una')
})

test('LO MISMO CON PASOS: el avance sale del peso marcado, no de una fila de parte', () => {
  const r = renglones([t({ actividad_id: 'c', metodo_avance: 'pasos' })])[0]
  assert.equal(r.aplicable, false)
  assert.equal(r.motivo, 'se mide por pasos: marcá los pasos ejecutados')
})

test('PARTES Y MANUAL SÍ SE PUEDEN APLICAR: ahí el porcentaje mueve el número', () => {
  const r = renglones([
    t({ actividad_id: 'a', metodo_avance: 'partes' }),
    t({ actividad_id: 'b', metodo_avance: 'manual' }),
  ])
  assert.deepEqual(r.map((x) => x.aplicable), [true, true])
  assert.equal(elPorcentajeMueveElAvance('partes'), true)
  assert.equal(elPorcentajeMueveElAvance('cantidad'), false)
})

test('EL CONTENEDOR NI APARECE: la base rechaza medirlo', () => {
  // El defecto que atrapa: ofrecerlo tocable produce un error de servidor que el jefe no puede
  // resolver desde el teléfono.
  assert.deepEqual(renglones([t({ actividad_id: 'g2', tipo: 'resumen' })]), [])
})

test('SIN MÉTODO DECLARADO NO SE APLICA, y se dice que falta el método', () => {
  const r = renglones([t({ actividad_id: 'x', metodo_avance: null })])[0]
  assert.equal(r.aplicable, false)
  assert.equal(r.motivo, 'sin método de medición declarado')
})

test('EL MANUAL AVISA SIN BLOQUEAR: declarado no es medido', () => {
  const r = renglones([
    t({ actividad_id: 'a', metodo_avance: 'manual' }),
    t({ actividad_id: 'b', metodo_avance: 'partes' }),
  ])
  assert.equal(avisoDePrecision(r), '1 tarea se mide a mano: el dato queda menos preciso, pero se guarda igual.')
  assert.deepEqual(r.map((x) => x.aplicable), [true, true])
})

test('SIN NADA QUE ADVERTIR NO HAY CARTEL', () => {
  assert.equal(avisoDePrecision(renglones([t({ actividad_id: 'a', metodo_avance: 'partes' })])), null)
})

test('LO QUE SE CARGA ES EL DELTA, NO EL OBJETIVO', () => {
  // El defecto que atrapa: `avance_partes` SUMA los partes. Cargar 75 sobre una actividad que va en
  // 40 la deja en 115 %.
  assert.equal(deltaHasta(75, 40), 35)
  assert.equal(deltaHasta(100, null), 100)
})

test('LLEGAR AL OBJETIVO YA ALCANZADO NO ESCRIBE NADA: un cero es «hoy no se hizo nada»', () => {
  assert.equal(deltaHasta(75, 75), null)
  assert.equal(deltaHasta(75, 90), null)
})

test('EL CONTROL LO ELIGE EL MÉTODO, no la pantalla', () => {
  assert.equal(controlDe('pasos'), 'pasos')
  assert.equal(controlDe('cantidad'), 'cantidad')
  assert.equal(controlDe('manual'), 'porcentaje')
  assert.equal(controlDe('partes'), 'porcentaje')
})

test('EL AVISO DEL CRITERIO ES LITERAL: es la regla, no una paráfrasis', () => {
  assert.match(AVISO_CRITERIO, /^El método manual exige un criterio escrito\./)
  assert.match(AVISO_CRITERIO, /no se puede interpretar después\.$/)
})

test('UNA TAREA YA AL 100 % NO SE OFRECE TOCABLE en el masivo', () => {
  // El defecto que atrapa: en esta obra 60 de 89 tareas están terminadas. Ofrecerlas seleccionables
  // hacía que «Todas» mandara 60 que el servidor rechaza una por una, y el mensaje de resultado
  // quedaba con sesenta nombres adentro — ilegible en un teléfono.
  const r = renglones([t({ actividad_id: 'x', avance_pct: 100 })])[0]
  assert.equal(r.aplicable, false)
  assert.equal(r.motivo, 'ya está al 100 %')
})

test('EL AVISO DE PRECISIÓN NO CUENTA LO QUE NO SE PUEDE APLICAR', () => {
  const r = renglones([t({ actividad_id: 'x', metodo_avance: 'manual', avance_pct: 100 })])
  assert.equal(avisoDePrecision(r), null)
})

test('LA VISTA ABRE EN «EN CURSO» — y en «TODO» cuando no hay ninguna en curso', () => {
  // El defecto que atrapa: abrir siempre en «En curso» deja la pantalla vacía en una obra donde
  // todo está al 100 %, y eso se lee como «esta obra no tiene tareas».
  const conCurso = renglones([
    t({ actividad_id: 'a', avance_pct: 40 }),
    t({ actividad_id: 'b', avance_pct: 100 }),
  ])
  assert.equal(vistaInicial(conCurso), 'curso')
  const todoCerrado = renglones([t({ actividad_id: 'b', avance_pct: 100 })])
  assert.equal(vistaInicial(todoCerrado), 'todo')
})

test('«EN CURSO» NO INCLUYE LO QUE NO SE PUEDE MOVER', () => {
  // El defecto que atrapa: filtrar sólo por «avance > 0» mete las terminadas y las medidas por
  // pasos en la vista de trabajo del día — filas que el jefe toca y no hacen nada.
  const [enCurso, cerrada, porPasos] = renglones([
    t({ actividad_id: 'a', avance_pct: 40 }),
    t({ actividad_id: 'b', avance_pct: 100 }),
    t({ actividad_id: 'c', avance_pct: 30, metodo_avance: 'pasos' }),
  ])
  assert.equal(enVista(enCurso, 'curso'), true)
  assert.equal(enVista(cerrada, 'curso'), false)
  assert.equal(enVista(porPasos, 'curso'), false)
  // «Todo» las muestra a las tres: apagadas y con su motivo, nunca escondidas.
  assert.deepEqual([enCurso, cerrada, porPasos].map((f) => enVista(f, 'todo')), [true, true, true])
})

test('«SIN ARRANCAR» TRATA IGUAL EL CERO Y EL SIN MEDIR', () => {
  const [enCero, sinMedir] = renglones([
    t({ actividad_id: 'a', avance_pct: 0 }),
    t({ actividad_id: 'b', avance_pct: null }),
  ])
  assert.equal(enVista(enCero, 'sin-arrancar'), true)
  assert.equal(enVista(sinMedir, 'sin-arrancar'), true)
  assert.equal(enVista(enCero, 'curso'), false)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// J04 · CADA TAREA CON SU PORCENTAJE (24/08/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('sólo se ofrecen valores que MUEVEN el avance: `obra_ejecucion` guarda incrementos', () => {
  // Una tarea en 74 % con la escala completa ofrecería 25 y 50, y cada toque terminaría en un
  // rechazo del servidor («ya estaba en 74 % o más»). Con diez tareas elegidas, el mensaje de
  // resultado se vuelve ilegible y el jefe no sabe qué entró.
  assert.deepEqual(opcionesMasivas(74), [75, 90, 100])
  assert.deepEqual(opcionesMasivas(0), [50, 75, 90, 100])
  assert.deepEqual(opcionesMasivas(null), [50, 75, 90, 100])
  // Arriba de 90 sólo queda el 100: es el único destino que todavía mueve algo.
  assert.deepEqual(opcionesMasivas(95), [100])
  // Al 100 no queda ninguno arriba, y devolver una lista vacía dejaría la tarjeta sin botones:
  // se ofrece el 100 igual, y el servidor la rechaza nombrándola.
  assert.deepEqual(opcionesMasivas(100), [100])
})

test('la selección viaja con el valor de cada tarea, sin repetidos', () => {
  assert.deepEqual(leerSeleccion('a:80,b:65'), [
    { actividad_id: 'a', objetivo: 80 },
    { actividad_id: 'b', objetivo: 65 },
  ])
  // Un id repetido gana la primera vez: dos filas para la misma tarea serían dos incrementos.
  assert.deepEqual(leerSeleccion('a:80,a:100'), [{ actividad_id: 'a', objetivo: 80 }])
  // Espacios, comas sueltas y cadena vacía no producen una tarea fantasma.
  assert.deepEqual(leerSeleccion(' , a:75 , '), [{ actividad_id: 'a', objetivo: 75 }])
  assert.deepEqual(leerSeleccion(''), [])
})

test('el formato viejo (ids sueltos) entra con objetivo null, no con un número inventado', () => {
  // Un enlace o una prueba anterior manda `a,b`. Si esto devolviera 100 por defecto, esas dos
  // tareas se cerrarían enteras sin que nadie lo pidiera.
  assert.deepEqual(leerSeleccion('a,b'), [
    { actividad_id: 'a', objetivo: null },
    { actividad_id: 'b', objetivo: null },
  ])
  assert.deepEqual(leerSeleccion('a:xx'), [{ actividad_id: 'a', objetivo: null }])
})
