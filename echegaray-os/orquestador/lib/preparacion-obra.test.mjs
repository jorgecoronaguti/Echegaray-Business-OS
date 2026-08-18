// EL CHECKLIST DE PREPARACIÓN TIENE QUE DECIR LA VERDAD, Y DECIRLA CON NÚMEROS.
//
// ═══ LOS DOS DEFECTOS QUE ESTAS PRUEBAS ATRAPAN ═══
//
// 1. EL FALTANTE SIN NÚMERO. Lo que había antes (`configuracionPendiente`) publicaba la palabra
//    «Pendiente» al lado de cuatro rótulos. Con 344 actividades y 0 líneas base decía lo mismo que
//    con 343 de 344: «Pendiente». Si alguien revierte a esa forma, los casos de abajo se ponen rojos
//    porque exigen la fracción literal en el detalle.
//
// 2. LA FUGA DEL CONTRATO. `obra_panel.monto_contratado` llega NULL a quien no es Administración.
//    Si la línea «Contrato» se armara igual para todos, un jefe de obra leería «monto contratado sin
//    cargar» sobre una obra con el contrato firmado — una afirmación falsa sobre plata, producida
//    por el propio enmascarado que existe para protegerla. El caso `verContrato:false` lo prueba.
//
// La lógica es pura a propósito: si viviera dentro del componente habría que levantar React,
// Supabase y una sesión para probar una resta.

import test from 'node:test'
import assert from 'node:assert/strict'
import { preparacionDeObra, loQueFalta } from '../../src/features/obras/services/preparacion.ts'

const act = (o = {}) => ({
  archivada: false, inicio_plan: null, fin_plan: null, inicio_base: null, fin_base: null,
  responsable_id: null, hh_plan: null, ...o,
})

const insumos = (o = {}) => ({
  obraId: 'la-estrella', jefeObra: null, montoContratado: null, inicioPlan: null, finPlan: null,
  driveCarpetaId: null, actividades: [], personasAsignadas: 0, verContrato: true, ...o,
})

const linea = (ls, clave) => {
  const l = ls.find((x) => x.clave === clave)
  if (!l) throw new Error(`falta la línea "${clave}" en el checklist`)
  return l
}

test('una obra recién creada tiene TODO pendiente, y ninguna línea miente diciendo que está lista', () => {
  const ls = preparacionDeObra(insumos())
  assert.equal(ls.length, 7)
  assert.equal(loQueFalta(ls).length, 7)
  assert.deepEqual(ls.map((l) => l.clave), [
    'cronograma', 'baseline', 'responsable', 'personal', 'contrato', 'drive', 'hh_plan',
  ])
})

test('el faltante de la línea base dice CUÁNTAS de cuántas, no la palabra «pendiente»', () => {
  // El caso real medido en producción el 19/08/2026: 344 actividades, 0 con `inicio_base`.
  const actividades = Array.from({ length: 344 }, () => act({ inicio_plan: '2026-01-05' }))
  const ls = preparacionDeObra(insumos({ actividades }))
  assert.equal(linea(ls, 'baseline').listo, false)
  assert.equal(linea(ls, 'baseline').detalle, '0 de 344 actividades con línea base')
  assert.equal(linea(ls, 'hh_plan').detalle, '0 de 344 actividades con HH plan')
  // Y el cronograma SÍ está: existir y estar sellado son dos preguntas distintas.
  assert.equal(linea(ls, 'cronograma').listo, true)
})

test('sin una sola fecha de plan, la línea base dice que no hay nada que sellar', () => {
  // `sellarBaseline` corta con "No hay ninguna actividad con fecha". Si el checklist dijera «0 de 12
  // con línea base», mandaría a apretar un botón que devuelve un error.
  const ls = preparacionDeObra(insumos({ actividades: Array.from({ length: 12 }, () => act()) }))
  assert.equal(linea(ls, 'baseline').detalle, 'sin fechas de plan: todavía no hay línea base que sellar')
})

test('las actividades archivadas no cuentan ni arriba ni abajo de la fracción', () => {
  // Sin este filtro, archivar una actividad sin sellar dejaría el checklist en rojo para siempre por
  // trabajo que ya nadie va a hacer — y sellar TODO lo vivo no lo pondría nunca en ✓.
  const ls = preparacionDeObra(insumos({
    actividades: [
      act({ inicio_plan: '2026-01-05', fin_plan: '2026-02-05', inicio_base: '2026-01-05', fin_base: '2026-02-05', hh_plan: 8 }),
      act({ archivada: true }),
      act({ archivada: true }),
    ],
  }))
  assert.equal(linea(ls, 'baseline').detalle, '1 de 1 actividad con línea base')
  assert.equal(linea(ls, 'baseline').listo, true)
  assert.equal(linea(ls, 'hh_plan').listo, true)
})

test('una sola actividad sin sellar deja la línea base pendiente: media línea base no mide nada', () => {
  const ls = preparacionDeObra(insumos({
    actividades: [
      act({ inicio_plan: '2026-01-05', fin_plan: '2026-02-05', inicio_base: '2026-01-05', fin_base: '2026-02-05' }),
      act({ inicio_plan: '2026-01-05', fin_plan: '2026-02-05', inicio_base: '2026-01-05', fin_base: null }),
    ],
  }))
  assert.equal(linea(ls, 'baseline').listo, false)
  assert.equal(linea(ls, 'baseline').detalle, '1 de 2 actividades con línea base')
})

test('el ✓ de Responsable lo decide el jefe de obra; el responsable por actividad se informa aparte', () => {
  const ls = preparacionDeObra(insumos({
    jefeObra: 'Ana Laura',
    actividades: [act(), act({ responsable_id: 'b0a1' })],
  }))
  assert.equal(linea(ls, 'responsable').listo, true)
  assert.equal(linea(ls, 'responsable').detalle, 'jefe de obra: Ana Laura · 1 de 2 actividades con responsable')
})

test('sin jefe de obra la línea queda pendiente aunque todas las actividades tengan responsable', () => {
  const ls = preparacionDeObra(insumos({ actividades: [act({ responsable_id: 'b0a1' })] }))
  assert.equal(linea(ls, 'responsable').listo, false)
  assert.match(linea(ls, 'responsable').detalle, /^sin jefe de obra/)
})

test('a quien no es Administración no se le muestra la línea de Contrato — ni siquiera para decir que falta', () => {
  // `obra_panel` le manda `monto_contratado` en NULL. Armar la línea igual convertiría ese
  // enmascarado en la afirmación "el contrato no está cargado", que puede ser falsa.
  const ls = preparacionDeObra(insumos({ verContrato: false, montoContratado: null }))
  assert.equal(ls.length, 6)
  assert.equal(ls.find((l) => l.clave === 'contrato'), undefined)
})

test('la línea de Contrato NUNCA publica la cifra, ni a Administración', () => {
  const ls = preparacionDeObra(insumos({
    verContrato: true, montoContratado: 187_450_000, inicioPlan: '2026-03-01', finPlan: '2026-11-30',
  }))
  const l = linea(ls, 'contrato')
  assert.equal(l.listo, true)
  assert.equal(l.detalle, 'monto y fechas de plan cargados')
  assert.doesNotMatch(JSON.stringify(ls), /187450000|187\.450\.000/)
})

test('el contrato a medias enumera QUÉ falta, sin mezclarlo con lo que ya está', () => {
  const ls = preparacionDeObra(insumos({ montoContratado: 1000, inicioPlan: '2026-03-01', finPlan: null }))
  assert.equal(linea(ls, 'contrato').listo, false)
  assert.equal(linea(ls, 'contrato').detalle, 'sin fin previsto')
})

test('cada línea enlaza a donde SE RESUELVE, y siempre dentro de esta obra', () => {
  const ls = preparacionDeObra(insumos({ obraId: 'san-francisco' }))
  for (const l of ls) assert.match(l.href, /^\/obras\/san-francisco\?vista=/, `${l.clave} no enlaza a su obra`)
  assert.equal(linea(ls, 'baseline').href, '/obras/san-francisco?vista=cronograma')
  assert.equal(linea(ls, 'personal').href, '/obras/san-francisco?vista=personal')
  assert.equal(linea(ls, 'drive').href, '/obras/san-francisco?vista=documentos')
})

test('sellada la línea base, vaciar las fechas de plan NO la devuelve a «no hay nada que sellar»', () => {
  // Es el orden de las condiciones del detalle, y lo encontró esta prueba y no la lectura del
  // código: con `conFecha === 0` solo, una obra sellada a la que le borren las fechas de plan
  // anunciaría que todavía no tiene línea base. El dato que manda es la base sellada.
  const ls = preparacionDeObra(insumos({
    actividades: [act({ inicio_base: '2026-01-05', fin_base: '2026-02-05' })],
  }))
  assert.equal(linea(ls, 'baseline').detalle, '1 de 1 actividad con línea base')
  assert.equal(linea(ls, 'baseline').listo, true)
})

test('una obra enteramente preparada no deja NADA pendiente: el bloque desaparece', () => {
  const ls = preparacionDeObra(insumos({
    jefeObra: 'Ana Laura',
    montoContratado: 1, inicioPlan: '2026-03-01', finPlan: '2026-11-30',
    driveCarpetaId: '1AbC',
    personasAsignadas: 4,
    actividades: [act({ inicio_plan: '2026-03-01', inicio_base: '2026-03-01', fin_base: '2026-04-01', hh_plan: 120 })],
  }))
  assert.deepEqual(loQueFalta(ls), [])
})
