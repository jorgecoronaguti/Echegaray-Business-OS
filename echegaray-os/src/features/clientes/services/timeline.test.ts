import test from 'node:test'
import assert from 'node:assert/strict'
import { construirLineaDeTiempo } from './timeline.ts'
import type { FuentesActividad } from '../types/index.ts'

// ═══ LA CRONOLOGÍA DE UNA OBRA NO ES CUÁNDO SE CARGÓ EN EL SISTEMA ═══
//
// EL DEFECTO, MEDIDO EN PRODUCCIÓN (dueño, 11/09/2026: «la cronología se rompe»): las CINCO obras de
// Messina tienen el MISMO `creada_en` —2026-09-07 16:39:47, la carga masiva que las subió al OS— y la
// solapa Actividad publicaba «Alta de la obra: X» cinco veces ese día. El dueño leía que las cinco
// habían nacido el 07/09 cuando el Playón venía de julio y las Bases de mayo.
//
// LO QUE ESTOS CASOS ATRAPAN:
//
//  1 · QUE `creada_en` VUELVA A SER EL INICIO. Con horas cargadas, el evento es «Inicio de obra» con
//      la PRIMERA fecha con horas, que es lo único que prueba que alguien estuvo trabajando.
//  2 · QUE UNA OBRA SIN HORAS SE PUBLIQUE COMO INICIADA. Sin horas el evento dice «Alta en el
//      sistema» y con esas palabras: cargar una obra no es empezarla.
//  3 · QUE EL ORDEN SIGA SIENDO EL DE LA CARGA. La línea se ordena por la fecha del evento, así que
//      con inicios distintos las cinco dejan de caer juntas.
//  4 · QUE EL ALTA SE PIERDA. Cuando hay horas, el alta en el sistema no desaparece: pasa al detalle.

// LA FICHA CON SUS DOS FECHAS PUESTAS: si fueran null, sus dos eventos se descartarían y el
// contador de `sinFecha` mediría eso en vez de lo que este archivo prueba.
const VACIO = {
  cliente: { nombre: 'MESSINA', creado_en: '2026-01-02T10:00:00.000Z', actualizado_en: '2026-09-01T10:00:00.000Z' },
  contactos: [], documentos: [], certificados: [], notas: [], notasNoDisponibles: null,
}

/** LA CARGA MASIVA, TEXTUAL: el instante que compartían las cinco obras de Messina. */
const CARGA_MASIVA = '2026-09-07T16:39:47.000Z'

const obra = (id: string, inicio: string | null) => ({
  obra_id: id, nombre: id.toUpperCase(), creada_en: CARGA_MASIVA,
  fecha_inicio_real: null, fecha_fin_real: null, inicio_con_horas: inicio,
})

test('cinco obras cargadas en el mismo instante NO nacen el mismo día', () => {
  const f: FuentesActividad = {
    ...VACIO,
    obras: [
      obra('messina', '2026-05-18'),
      obra('messina-pisos-120-rampa', '2026-07-16'),
      obra('messina-playon-dilucion-acido', '2026-09-09'),
      // Las dos sin horas: no se puede afirmar que arrancaron.
      obra('messina-playon-azufre', null),
      obra('messina-bsa', null),
    ],
  }
  const { eventos } = construirLineaDeTiempo(f)

  const inicios = eventos.filter((e) => e.tipo === 'obra_inicio')
  assert.deepEqual(inicios.map((e) => e.fecha), ['2026-09-09', '2026-07-16', '2026-05-18'],
    'los inicios tienen que ser las primeras fechas con horas, y en orden descendente')
  assert.match(inicios[0].titulo, /^Inicio de obra: /)
  assert.match(inicios[0].detalle ?? '', /primeras horas cargadas/)
  // EL ALTA NO SE PIERDE: viaja en el detalle del mismo evento.
  assert.match(inicios[0].detalle ?? '', /alta en el sistema 07\/09/)

  // LAS DOS SIN HORAS: alta, dicha como alta, y con la fecha de la carga masiva.
  const altas = eventos.filter((e) => e.tipo === 'obra_alta')
  assert.equal(altas.length, 2)
  for (const a of altas) {
    assert.match(a.titulo, /^Alta en el sistema: /,
      'una obra sin horas no puede publicarse como iniciada')
    assert.equal(a.fecha, CARGA_MASIVA)
    assert.match(a.detalle ?? '', /sin horas cargadas/)
  }
  // Y NINGÚN EVENTO DICE «Alta de la obra», que era la frase que mentía.
  assert.ok(!eventos.some((e) => e.titulo.startsWith('Alta de la obra')))
})

test('sin horas, la fecha declarada a mano se publica como declarada y no como probada', () => {
  const f: FuentesActividad = {
    ...VACIO,
    obras: [{
      obra_id: 'pilon', nombre: 'PILÓN', creada_en: CARGA_MASIVA,
      fecha_inicio_real: '2026-07-20', fecha_fin_real: null, inicio_con_horas: null,
    }],
  }
  const { eventos } = construirLineaDeTiempo(f)
  const arranque = eventos.find((e) => e.clave === 'obra-arranque-pilon')
  assert.ok(arranque, 'la fecha cargada a mano es evidencia y no se descarta')
  assert.match(arranque.titulo, /^Arranque declarado: /)
  assert.match(arranque.detalle ?? '', /sin horas que lo respalden/)
})

test('con horas, la fecha declarada NO agrega un segundo «empezó» a la misma obra', () => {
  const f: FuentesActividad = {
    ...VACIO,
    obras: [{
      obra_id: 'le-galpon-9', nombre: 'LE - GALPÓN 9', creada_en: CARGA_MASIVA,
      // La obra declara 15/07 y las horas empiezan el 16/07: dos fechas para el mismo hecho.
      fecha_inicio_real: '2026-07-15', fecha_fin_real: null, inicio_con_horas: '2026-07-16',
    }],
  }
  const { eventos } = construirLineaDeTiempo(f)
  assert.equal(eventos.filter((e) => e.tipo === 'obra_inicio').length, 1,
    'dos eventos de inicio para la misma obra son dos respuestas a «¿cuándo empezó?»')
  assert.equal(eventos.find((e) => e.tipo === 'obra_inicio')?.fecha, '2026-07-16',
    'gana la fecha PROBADA por las horas, no la cargada a mano')
})

test('sin la clave de horas —cara que no la transporta— la línea sigue armándose', () => {
  // `inicio_con_horas` es opcional a propósito: si la RPC no la trae (rol sin permiso), la actividad
  // no puede quedar vacía. Pierde precisión y lo dice; no se inventa una fecha.
  const f: FuentesActividad = {
    ...VACIO,
    obras: [{
      obra_id: 'x', nombre: 'X', creada_en: CARGA_MASIVA,
      fecha_inicio_real: null, fecha_fin_real: null,
    }],
  }
  const { eventos, sinFecha } = construirLineaDeTiempo(f)
  const deObra = eventos.filter((e) => e.fuente === 'Obras')
  assert.equal(deObra.length, 1)
  assert.match(deObra[0].titulo, /^Alta en el sistema: /)
  assert.equal(sinFecha, 0)
})

test('una obra sin fecha de ninguna clase NO entra con la fecha de otra cosa', () => {
  const f: FuentesActividad = {
    ...VACIO,
    obras: [{
      obra_id: 'sin-nada', nombre: 'SIN NADA', creada_en: null,
      fecha_inicio_real: null, fecha_fin_real: null, inicio_con_horas: null,
    }],
  }
  const { eventos, sinFecha } = construirLineaDeTiempo(f)
  assert.equal(eventos.filter((e) => e.fuente === 'Obras').length, 0,
    'sin ninguna fecha, la obra NO entra con la de otra cosa ni al final de la lista')
  assert.equal(sinFecha, 1, 'lo descartado se CUENTA: la pantalla dice cuántos quedaron afuera')
})
