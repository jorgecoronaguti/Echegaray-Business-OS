// LOS CONTROLES QUE TIENEN QUE PODER DECIR QUE NO.
//
// Cada test negativo de acá corresponde a una forma conocida de que una casualidad se vuelva norma.
// Y hay uno positivo por cada uno: un control que siempre bloquea no protege nada, sólo apaga el
// bucle — así que de cada regla se prueba que deja pasar lo que corresponde y frena lo que no.
import test from 'node:test'
import assert from 'node:assert/strict'
import { candidato, MADUREZ } from './promocion.mjs'
import {
  POLITICA, ESTADO, ventana, antiguedadDias, muestrasAdmisibles, evaluarGobernanza, estadoDe,
  evidenciaDeProductividad, filtrarPorCausa,
} from './gobernanza.mjs'
import { pliegues, regresionHoldOut, evaluarActivo, mediana } from './regresion-aprendizaje.mjs'

const HOY = new Date('2026-08-30T00:00:00Z')

/** Mediciones parejas repartidas en `obras` obras, todas dentro de la ventana vigente. */
function muestrasSanas(obras = ['a', 'b', 'c', 'd', 'e'], valor = 10) {
  return obras.map((o, i) => ({ id: `${o}#1`, obra: o, valor: valor + (i % 2 ? 0.2 : -0.2), base: valor * 2 }))
}

function candidatoDe(muestras, { fecha = '2026-08-01' } = {}) {
  return candidato({
    clave: 'rendimiento.T1',
    afirmacion: 'la tarea T1 rinde {media} h/m2',
    unidad: 'h/m2',
    valores: muestras.map((m) => m.valor),
    obras: muestras.map((m) => m.obra),
    evidencia: muestras.map((m) => ({ obra: m.obra, desde: fecha, hasta: fecha, caso: m.id })),
    fecha,
  })
}

const conVentana = (c, muestras, opts) => ({ ...c, ventana: ventana(c.evidencia), ...opts })

// ═══ LA VENTANA Y LA ANTIGÜEDAD ═══

test('la ventana sale de la evidencia y una muestra sin fechas no tiene ventana', () => {
  const v = ventana([{ desde: '2026-06-01', hasta: '2026-06-10' }, { fecha: '2026-07-01' }])
  assert.deepEqual({ desde: v.desde, hasta: v.hasta }, { desde: '2026-06-01', hasta: '2026-07-01' })
  const vacia = ventana([{ obra: 'x' }])
  assert.equal(vacia.hasta, null, 'sin fechas no se inventa una ventana')
  assert.equal(antiguedadDias(vacia, HOY), null)
  assert.equal(antiguedadDias({ hasta: '2026-08-20' }, HOY), 10)
})

// ═══ HISTÓRICO ≠ VALIDADO ═══

test('NEGATIVO: estar en el histórico no vuelve válida a una fila — REFERENCIA y DESCARTADO no son evidencia', () => {
  const { admisibles, referencia, descartadas } = muestrasAdmisibles([
    { id: 1, estado: 'CANDIDATO' }, { id: 2, estado: 'VALIDADO' },
    { id: 3, estado: 'REFERENCIA' }, { id: 4, estado: 'DESCARTADO' },
  ])
  assert.deepEqual(admisibles.map((f) => f.id), [1, 2])
  assert.equal(referencia.length, 1, 'la tabla del xlsm no puede confirmarse a sí misma')
  assert.equal(descartadas.length, 1)
})

// ═══ LA CAUSA DECLARADA DECIDE SI EL NÚMERO MIDE PRODUCTIVIDAD ═══

test('NEGATIVO: el T1002 real — un −85,3% causado por falta de material NO enseña a excavar', () => {
  // El caso medido en Quattropani el 30/08/2026: 0,50 hs/un contra 3,40 cotizadas. La causa la
  // escribió una persona y es de familia `abastecimiento`.
  const v = evidenciaDeProductividad([{ causa_desvio: 'falta_material', familia: 'abastecimiento' }])
  assert.equal(v.admisible, false)
  assert.match(v.motivo, /falta_material \(abastecimiento\)/)

  // Sin causa declarada la observación SIGUE siendo evidencia: no se inventa una causa para
  // descalificarla, igual que no se inventa una para explicarla.
  assert.equal(evidenciaDeProductividad([]).admisible, true)
  assert.equal(evidenciaDeProductividad([{ causa_desvio: 'curva_aprendizaje', familia: 'productividad' }]).admisible, true)
  // «Otra causa» no tiene familia: alguien dijo que pasó algo y no se sabe qué.
  assert.equal(evidenciaDeProductividad([{ causa_desvio: 'otro', familia: null }]).admisible, false)
})

test('lo descalificado por causa no se tira: vuelve con su motivo', () => {
  const { admisibles, descalificadas } = filtrarPorCausa([
    { id: 'T1001', valor: 0.1159, causas: [] },
    { id: 'T1002', valor: 0.5, causas: [{ causa_desvio: 'falta_material', familia: 'abastecimiento' }] },
    { id: 'T1003', valor: 0.4, causas: [{ causa_desvio: 'clima', familia: 'externa' }] },
  ])
  assert.deepEqual(admisibles.map((m) => m.id), ['T1001'])
  assert.deepEqual(descalificadas.map((m) => m.id), ['T1002', 'T1003'])
  assert.match(descalificadas[1].motivo, /clima/)
})

test('NEGATIVO: si una medición con causa ajena se cuela en la muestra, la gobernanza la frena igual', () => {
  const m = muestrasSanas()
  const c = { ...conVentana(candidatoDe(m), m), contexto: { causas_ajenas: 1 } }
  const g = evaluarGobernanza({ candidato: c, regresion: regresionHoldOut({ muestras: m }), hoy: HOY })
  assert.equal(g.apto, false)
  assert.ok(g.bloqueos.includes('causa-ajena'), g.porQue)
})

// ═══ CANDIDATO ≠ NORMA ═══

test('POSITIVO: un candidato de 5 obras, parejo, reciente y con hold-out limpio SÍ es apto', () => {
  const m = muestrasSanas()
  const c = conVentana(candidatoDe(m), m)
  const reg = regresionHoldOut({ muestras: m })
  const g = evaluarGobernanza({ candidato: c, regresion: reg, hoy: HOY })
  assert.equal(g.apto, true, g.porQue)
  assert.equal(g.clase, MADUREZ.D)
  assert.equal(g.claseAutorizada, MADUREZ.D, 'el bucle autónomo llega a D, nunca a E')
  assert.equal(estadoDe(g), ESTADO.APTO)
  assert.equal(estadoDe(g, { activo: true }), ESTADO.ACTIVO)
})

test('NEGATIVO: CANDIDATO ≠ NORMA — clase C no pasa aunque la regresión esté impecable', () => {
  const m = muestrasSanas(['a', 'b', 'c'])
  const c = conVentana(candidatoDe(m), m)
  const g = evaluarGobernanza({ candidato: c, regresion: regresionHoldOut({ muestras: m }), hoy: HOY })
  assert.equal(g.apto, false)
  assert.equal(g.clase, MADUREZ.C)
  assert.ok(g.bloqueos.includes('clase'), g.porQue)
})

test('NEGATIVO: una observación con n=1 no promueve por ningún camino', () => {
  const m = muestrasSanas(['a'])
  const c = conVentana(candidatoDe(m), m)
  const g = evaluarGobernanza({ candidato: c, regresion: regresionHoldOut({ muestras: m }), hoy: HOY })
  assert.equal(g.apto, false)
  for (const k of ['muestra', 'obras-distintas', 'dispersion', 'clase']) assert.ok(g.bloqueos.includes(k), `${k} debería bloquear: ${g.porQue}`)
})

test('NEGATIVO: dos observaciones de la MISMA obra no son dos obras', () => {
  const m = [
    { id: 'a#1', obra: 'san-francisco', valor: 10, base: 20 },
    { id: 'a#2', obra: 'san-francisco', valor: 10.1, base: 20 },
    { id: 'a#3', obra: 'san-francisco', valor: 9.9, base: 20 },
  ]
  const c = conVentana(candidatoDe(m), m)
  assert.equal(c.estadistica.n, 3, 'hay tres mediciones')
  assert.equal(c.obrasDistintas, 1, 'pero una sola obra')
  const reg = regresionHoldOut({ muestras: m })
  assert.equal(reg.corrio, false, 'con una sola obra no hay pliegue posible: la regla se probaría contra sí misma')
  assert.match(reg.porQue, /los casos que la produjeron/)
  const g = evaluarGobernanza({ candidato: c, regresion: reg, hoy: HOY })
  assert.equal(g.apto, false)
  assert.ok(g.bloqueos.includes('obras-distintas'))
  assert.ok(g.bloqueos.includes('regresion'), g.porQue)
})

test('NEGATIVO: dispersión alta no promueve, y dispersión DESCONOCIDA tampoco', () => {
  const desparejas = [
    { id: '1', obra: 'a', valor: 2, base: 4 }, { id: '2', obra: 'b', valor: 20, base: 4 },
    { id: '3', obra: 'c', valor: 5, base: 4 }, { id: '4', obra: 'd', valor: 40, base: 4 },
    { id: '5', obra: 'e', valor: 1, base: 4 },
  ]
  const c = conVentana(candidatoDe(desparejas), desparejas)
  const g = evaluarGobernanza({ candidato: c, regresion: regresionHoldOut({ muestras: desparejas }), hoy: HOY })
  assert.equal(g.apto, false)
  assert.ok(g.bloqueos.includes('dispersion'), g.porQue)

  // Una sola medición: `estadistica` devuelve dispersión null. Eso NO puede leerse como «perfecta».
  const una = muestrasSanas(['a'])
  const g2 = evaluarGobernanza({ candidato: conVentana(candidatoDe(una), una), regresion: regresionHoldOut({ muestras: una }), hoy: HOY })
  const check = g2.checks.find((k) => k.nombre === 'dispersion')
  assert.equal(check.cumple, false)
  assert.match(check.porQue, /desconocida no es cero/)
})

test('NEGATIVO: una muestra vieja no promueve — el aprendizaje caduca', () => {
  const m = muestrasSanas()
  const c = conVentana(candidatoDe(m, { fecha: '2023-01-15' }), m)
  const g = evaluarGobernanza({ candidato: c, regresion: regresionHoldOut({ muestras: m }), hoy: HOY })
  assert.equal(g.apto, false)
  assert.ok(g.bloqueos.includes('antiguedad'), g.porQue)
  assert.ok(g.antiguedadDias > POLITICA.antiguedadMaximaDias)
})

test('NEGATIVO: una regresión contra los casos que produjeron la regla no habilita nada', () => {
  const m = muestrasSanas()
  const c = conVentana(candidatoDe(m), m)
  // Ésta es la forma que tenía la corrida vieja: `corrio: true`, cero empeoran, y sin sello de
  // hold-out. Pasaba la puerta sin haber probado nada.
  const autoreferencial = { corrio: true, casos: 5, mejoran: 0, empeoran: 0, iguales: 5, filas: [], peores: [] }
  const g = evaluarGobernanza({ candidato: c, regresion: autoreferencial, hoy: HOY })
  assert.equal(g.apto, false)
  assert.ok(g.bloqueos.includes('regresion-hold-out'), g.porQue)
})

test('NEGATIVO: la clase E la firma el dueño, no el bucle', () => {
  const m = muestrasSanas()
  const c = conVentana(candidatoDe(m), m)
  const reg = regresionHoldOut({ muestras: m })
  const sinFirma = evaluarGobernanza({ candidato: c, regresion: reg, hoy: HOY, politica: { claseMinima: MADUREZ.E } })
  assert.equal(sinFirma.apto, false)
  assert.ok(sinFirma.bloqueos.includes('firma-del-dueno'))
  const conFirma = evaluarGobernanza({ candidato: c, regresion: reg, hoy: HOY, politica: { claseMinima: MADUREZ.E }, firmaDueno: 'jorge@ecsas.com.ar' })
  assert.equal(conFirma.claseAutorizada, MADUREZ.E)
})

// ═══ LA REGRESIÓN PUEDE DAR ROJO ═══

test('los pliegues dejan una obra afuera por vez y ninguna se prueba contra sí misma', () => {
  const m = muestrasSanas(['a', 'b', 'c'])
  const fs = pliegues(m)
  assert.equal(fs.length, 3)
  for (const f of fs) {
    assert.equal(f.prueba.every((x) => x.obra === f.obra), true)
    assert.equal(f.entrenamiento.some((x) => x.obra === f.obra), false, 'la obra probada no puede estar en el entrenamiento')
  }
  assert.equal(mediana([3, 1, 2]), 2)
})

test('NEGATIVO: un aprendizaje deliberadamente malo pone la regresión en ROJO', () => {
  // Cada obra rinde una cosa distinta y el plan de cada una está bien: aprender un número global
  // empeora todo. Es el caso que el bucle tiene que rechazar solo.
  const m = [
    { id: '1', obra: 'a', valor: 1, base: 1 }, { id: '2', obra: 'b', valor: 10, base: 10 },
    { id: '3', obra: 'c', valor: 20, base: 20 }, { id: '4', obra: 'd', valor: 40, base: 40 },
    { id: '5', obra: 'e', valor: 80, base: 80 },
  ]
  const reg = regresionHoldOut({ muestras: m })
  assert.equal(reg.corrio, true)
  assert.ok(reg.empeoran >= 4, `esperaba que casi todos empeoren, empeoraron ${reg.empeoran}`)
  assert.ok(reg.deltaPP > 0, 'el error con el aprendizaje tiene que ser PEOR')
  const c = conVentana(candidatoDe(m), m)
  const g = evaluarGobernanza({ candidato: c, regresion: reg, hoy: HOY })
  assert.equal(g.apto, false)
  assert.ok(g.bloqueos.includes('regresion'), g.porQue)
})

test('POSITIVO: cuando lo aprendido estima mejor que el plan, la regresión lo dice en pp', () => {
  const m = muestrasSanas(['a', 'b', 'c', 'd', 'e'], 10) // base = 20, real ≈ 10
  const reg = regresionHoldOut({ muestras: m })
  assert.equal(reg.empeoran, 0)
  assert.ok(reg.deltaPP < 0, `el aprendizaje debería bajar el error, dio ${reg.deltaPP}`)
  assert.equal(reg.porObra.length, 5)
})

test('NEGATIVO: sin estimación previa no hay caso comparable, y la regresión NO pasa por vacía', () => {
  const m = muestrasSanas().map((x) => ({ ...x, base: null }))
  const reg = regresionHoldOut({ muestras: m })
  assert.equal(reg.corrio, false, 'sin base no se probó nada')
  const g = evaluarGobernanza({ candidato: conVentana(candidatoDe(m), m), regresion: reg, hoy: HOY })
  assert.equal(g.apto, false)
  assert.ok(g.bloqueos.includes('regresion'))
})

// ═══ LA VIGILANCIA DESPUÉS DE ACTIVAR ═══

test('una regla activa que estima peor que la anterior pide el rollback', () => {
  const casos = [{ id: '1', valor: 10 }, { id: '2', valor: 10 }, { id: '3', valor: 11 }]
  const mala = evaluarActivo({ casos, reglaActiva: 40, reglaAnterior: 10 })
  assert.equal(mala.revertir, true, mala.porQue)
  const buena = evaluarActivo({ casos, reglaActiva: 10, reglaAnterior: 40 })
  assert.equal(buena.revertir, false, buena.porQue)
  const sinNada = evaluarActivo({ casos, reglaActiva: 10, reglaAnterior: null })
  assert.equal(sinNada.corrio, false, 'sin regla anterior no hay comparación posible')
})
