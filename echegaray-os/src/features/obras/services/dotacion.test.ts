// LO QUE ATRAPAN: que la pantalla prometa una fecha que el tope del frente impide, que sume nulos
// como ceros y publique «no falta nada», y que agrupe cada cabecera dentro del frente de arriba.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claveDeFrente, dotacionNecesaria, duracionDias, frentesDe, hhProyectadas, limiteDe,
  opcionesInversas, rendimiento, resumenSimulacion, rubrosDe, simularFrente, sumaCompleta,
} from './dotacion.ts'
import type { FilaCronograma } from './cronogramaMotor.ts'

const fila = (p: Partial<FilaCronograma>): FilaCronograma => ({
  actividad_id: 'x', nombre: 'x', tipo: 'tarea', actividad_padre_id: null, orden: 1,
  rubro: null, seccion: null, hh_plan: null, hh_real: null, avance_pct: null, dias_plan: null,
  inicio_plan: null, fin_plan: null, inicio_base: null, fin_base: null, inicio_real: null,
  fin_real: null, estado: null, cuadrilla_id: null, cuadrilla_prevista: null,
  cantidad_objetivo: null, unidad: null, dotacion_prevista: null, tope_frente: null,
  impedimentos_abiertos: null, duracion: null, inicio_calculado: null, fin_calculado: null,
  holgura: null, critica: false, sin_plan: false, hh_restantes: null,
  base_de_la_proyeccion: 'sin base', ...p,
})

test('duración: sin HH o sin nadie asignado es null, «sin plan», nunca 0 días', () => {
  assert.equal(duracionDias(null, 4), null)
  assert.equal(duracionDias(80, 0), null)
  assert.equal(duracionDias(80, null), null)
})

test('duración: los días técnicos se suman aparte — curar 7 días son 7 haya 1 persona o 20', () => {
  assert.equal(duracionDias(80, 4, 8), 3)
  assert.equal(duracionDias(80, 4, 8, 7), 10)
  assert.equal(duracionDias(80, 20, 8, 7), 8, 'veinte personas no comprimen el curado')
})

test('NO ALCANZA es null, nunca 0 personas: prometer una fecha que el tope impide es peor', () => {
  // 200 HH en 2 días con jornada de 8 piden 13 de capacidad; el frente topa en 4.
  assert.equal(dotacionNecesaria(200, 2, 8, 4), null)
  assert.equal(dotacionNecesaria(200, 2, 8, null), 13)
  assert.equal(dotacionNecesaria(200, 7, 8, 4), 4, 'justo en el tope sí alcanza')
})

test('sin HH o con cero días la cuenta inversa no responde', () => {
  assert.equal(dotacionNecesaria(null, 5), null)
  assert.equal(dotacionNecesaria(100, 0), null)
})

test('el bloque inverso devuelve «no alcanza» sólo donde el tope lo impide', () => {
  const r = opcionesInversas(200, [{ fecha: '25/08', dias: 4 }, { fecha: '28/08', dias: 7 }], 8, 4)
  assert.equal(r[0].dotacion, null)
  assert.equal(r[1].dotacion, 4)
})

test('el límite distingue «terminado», «sin gente», «tope del frente» y «con margen»', () => {
  assert.equal(limiteDe(0, 4, 0), 'terminado', 'un frente hecho no está frenado por falta de gente')
  assert.equal(limiteDe(0, 4), 'sin gente')
  assert.equal(limiteDe(4, 4), 'tope del frente')
  assert.equal(limiteDe(2, 4), 'con margen')
  assert.equal(limiteDe(2, null), 'con margen')
})

test('EL FRENTE DE UNA CABECERA ES SU PROPIO NOMBRE, no su sección arrastrada', () => {
  // En los datos reales la fila de resumen «Encofrado» trae seccion='Armadura'. Agrupar por
  // `seccion` metería la cabecera de Encofrado dentro del frente de Armadura.
  assert.equal(claveDeFrente({ tipo: 'resumen', nombre: 'Encofrado', seccion: 'Armadura' }), 'Encofrado')
  assert.equal(claveDeFrente({ tipo: 'tarea', nombre: 'Encofrado de piso', seccion: 'Encofrado' }), 'Encofrado')
})

test('un frente sin una sola HH cargada dice «sin dato», no 0 HH restantes', () => {
  const [f] = frentesDe([fila({ seccion: 'Piso', dias_plan: 2 })])
  assert.equal(f.hhRestantes, null)
  assert.equal(f.base, 'sin base')
  assert.equal(f.dias, null, 'sin HH no hay días, aunque haya gente')
  assert.equal(f.limite, 'sin gente')
})

test('el frente suma las HH restantes de sus actividades y hereda el rendimiento observado', () => {
  const [f] = frentesDe([
    fila({ seccion: 'Piso', hh_plan: 100, hh_real: 60, avance_pct: 40 }),
    fila({ seccion: 'Piso', hh_plan: 40 }),
  ], { dotaciones: { Piso: 4 }, jornada: 8 })
  assert.equal(Math.round(f.hhRestantes!), 130)
  assert.equal(f.base, 'rendimiento observado')
  assert.equal(f.dias, 5)
  assert.equal(f.nActividades, 2)
})

test('el frente crítico lo dice, y el que no tiene cuadrilla también', () => {
  const [critico] = frentesDe([fila({ seccion: 'A', critica: true })])
  assert.equal(critico.subtitulo, 'camino crítico')
  const [sinCuad] = frentesDe([fila({ seccion: 'B' })])
  assert.equal(sinCuad.subtitulo, 'sin cuadrilla')
  const [conCuad] = frentesDe([fila({ seccion: 'C', cuadrilla_id: 'q', rubro: 'Mampostería' })])
  assert.equal(conCuad.subtitulo, 'Mampostería')
})

test('el tope del frente es el MÁS BAJO de sus actividades: el más estrecho manda', () => {
  const [f] = frentesDe([
    fila({ seccion: 'A', tope_frente: 6 }), fila({ seccion: 'A', tope_frente: 3 }),
  ], { dotaciones: { A: 3 } })
  assert.equal(f.tope, 3)
  assert.equal(f.limite, 'tope del frente')
})

test('la dotación pedida por URL se recorta al tope: 99 personas no acortan un frente con tope 3', () => {
  const [conTope] = frentesDe([fila({ seccion: 'A', hh_plan: 96, tope_frente: 3 })], { dotaciones: { A: 99 } })
  const [alTope] = frentesDe([fila({ seccion: 'A', hh_plan: 96, tope_frente: 3 })], { dotaciones: { A: 3 } })
  assert.equal(conTope.dias, alTope.dias, 'pedir 99 dio un plazo distinto que pedir el tope')
  assert.equal(conTope.dotacion, 3)
})

test('el FIN se calcula con el calendario de la obra, y sin fecha de arranque es null', () => {
  const sumar = (desde: string, n: number) => `${desde}+${n}`
  const [con] = frentesDe([fila({ seccion: 'A', hh_plan: 80 })], {
    dotaciones: { A: 4 }, desde: '2026-08-24', sumarDiasHabiles: sumar,
  })
  assert.equal(con.fin, '2026-08-24+2', '3 días hábiles = arranque + 2')
  const [sin] = frentesDe([fila({ seccion: 'A', hh_plan: 80 })], { dotaciones: { A: 4 } })
  assert.equal(sin.fin, null)
})

test('rendimiento: sin cantidad o con cantidad cero es null — dividir por cero fabrica un número', () => {
  assert.equal(rendimiento(80, null), null)
  assert.equal(rendimiento(80, 0), null)
  assert.equal(rendimiento(null, 4), null)
  assert.equal(rendimiento(80, 4), 20)
})

test('HH proyectadas: sin base para proyectar es null, no el plan disfrazado', () => {
  assert.equal(hhProyectadas({ hh_plan: null, hh_real: null, avance_pct: null }), null)
  assert.equal(Math.round(hhProyectadas({ hh_plan: 100, hh_real: 60, avance_pct: 40 })!), 150)
})

test('el rubro sin una sola HH deja la columna en null, no en 0', () => {
  const filas = rubrosDe([fila({ rubro: 'Encofrado', nombre: 'Encofrado de piso', avance_pct: 50 })])
  const rubro = filas.find((f) => f.nivel === 'rubro')!
  assert.equal(rubro.hhPlan, null)
  assert.equal(rubro.hhProyectadas, null)
  assert.equal(rubro.desvioHH, null)
  assert.equal(rubro.avancePct, 50)
})

test('el rubro pondera el avance por HH plan, no por cantidad de filas', () => {
  const filas = rubrosDe([
    fila({ rubro: 'R', nombre: 'grande', hh_plan: 900, avance_pct: 0 }),
    fila({ rubro: 'R', nombre: 'chica', hh_plan: 100, avance_pct: 100 }),
  ])
  const rubro = filas.find((f) => f.nivel === 'rubro')!
  assert.equal(rubro.avancePct, 10, 'promedio simple daría 50 % y la obra no lleva la mitad')
  assert.equal(rubro.hhPlan, 1000)
})

test('las filas de resumen no entran a la tabla por rubro: agregan, no son trabajo', () => {
  const filas = rubrosDe([fila({ tipo: 'resumen', nombre: 'Encofrado', rubro: 'R' })])
  assert.deepEqual(filas, [])
})

test('UN FRENTE DONDE SÓLO LAS TERMINADAS TIENEN DATO NO DICE «0 HH RESTANTES»', () => {
  // Destapado en el navegador: «Sin clasificar» de Messina mostraba 0 HH, 0 días y una fecha de
  // fin, porque sus únicas actividades medibles eran las que están al 100 %. Las del 0 % sin HH
  // cargadas no sumaban nada y desaparecían de la cuenta.
  const [f] = frentesDe([
    fila({ seccion: 'A', avance_pct: 100, hh_plan: 40, hh_real: 40 }),
    fila({ seccion: 'A', avance_pct: 0 }),
  ], { dotaciones: { A: 4 }, desde: '2026-08-24', sumarDiasHabiles: (d, n) => `${d}+${n}` })
  assert.equal(f.hhRestantes, null, 'un total al que le falta una parte no es un total')
  assert.equal(f.sinDato, 1, 'y la pantalla puede decir sobre cuántas no pudo mirar')
  assert.equal(f.dias, null)
  assert.equal(f.fin, null, 'sin HH no hay fecha de fin, aunque haya gente asignada')
})

test('un frente enteramente terminado SÍ dice 0: eso no es un dato que falta', () => {
  const [f] = frentesDe([
    fila({ seccion: 'A', avance_pct: 100, hh_plan: 40, hh_real: 40 }),
    fila({ seccion: 'A', avance_pct: 100, hh_plan: 10, hh_real: 12 }),
  ], { dotaciones: { A: 2 } })
  assert.equal(f.hhRestantes, 0)
  assert.equal(f.sinDato, 0)
  assert.equal(f.dias, 0)
  assert.equal(f.limite, 'terminado')
  assert.equal(f.fin, null, 'un frente hecho no promete una fecha de fin futura')
})

test('una actividad al 100 % sin ninguna HH cargada NO proyecta 0 HH', () => {
  // Terminada y sin dato son cosas distintas: no le falta trabajo, pero nadie sabe qué consumió.
  assert.equal(hhProyectadas({ hh_plan: null, hh_real: null, avance_pct: 100 }), null)
  assert.equal(hhProyectadas({ hh_plan: 40, hh_real: null, avance_pct: 100 }), 0)
  assert.equal(hhProyectadas({ hh_plan: null, hh_real: 55, avance_pct: 100 }), 55)
})

test('el total que decide se niega a ser parcial', () => {
  assert.equal(sumaCompleta([10, 20, 30]), 60)
  assert.equal(sumaCompleta([10, null, 30]), null, 'un piso presentado como total subestima')
  assert.equal(sumaCompleta([]), null)
})

test('un rubro con una sola partida sin base proyecta «sin base», no la suma de las otras', () => {
  const filas = rubrosDe([
    fila({ rubro: 'R', nombre: 'con dato', hh_plan: 100, hh_real: 60, avance_pct: 40 }),
    fila({ rubro: 'R', nombre: 'sin dato', avance_pct: 100 }),
  ])
  const rubro = filas.find((f) => f.nivel === 'rubro')!
  assert.equal(rubro.hhProyectadas, null)
  assert.equal(rubro.desvioHH, null)
})

test('un frente hecho declara la base «terminada», no «plan»', () => {
  const [f] = frentesDe([fila({ seccion: 'A', avance_pct: 100, hh_plan: 40, hh_real: 40 })])
  assert.equal(f.base, 'terminada')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LOS TIEMPOS TÉCNICOS NO SE COMPRIMEN CON MÁS GENTE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// EL DEFECTO QUE ATRAPA: `duracionDias` recibe los días técnicos como cuarto argumento desde el día
// uno —y su función SQL gemela también—, pero `frentesDe` NUNCA se lo pasaba. Un frente de hormigón
// con siete días de curado se comprimía como si curar fuera trabajo: la pantalla contestaba «poné el
// doble de gente y terminás en la mitad de tiempo» sobre algo que cura siete días haya una persona
// o veinte. Es la respuesta que se descubre el día de la entrega.

test('MÁS GENTE COMPRIME EL TRABAJO Y NUNCA EL CURADO', () => {
  const frente = (dotacion: number) => frentesDe([
    fila({ seccion: 'Tabique', nombre: 'Armadura y hormigonado', hh_plan: 320 }),
    fila({ seccion: 'Tabique', nombre: 'Curado', hh_plan: 0, dias_plan: 7, tiempo_tecnico: true }),
  ], { dotaciones: { Tabique: dotacion }, jornada: 8 })[0]

  const con4 = frente(4)
  const con8 = frente(8)

  assert.equal(con4.diasTecnicos, 7, 'los 7 días de curado del frente son días fijos')
  assert.equal(con4.dias, 17, '320 HH ÷ (4 × 8) = 10 días de trabajo + 7 de curado')
  assert.equal(con8.dias, 12, 'el doble de gente hizo 10 días de trabajo en 5')

  const trabajo4 = con4.dias! - con4.diasTecnicos
  const trabajo8 = con8.dias! - con8.diasTecnicos
  assert.equal(trabajo8, trabajo4 / 2, 'el componente productivo sí se comprime a la mitad')
  assert.equal(con8.diasTecnicos, con4.diasTecnicos, 'la parte técnica NO se movió un solo día')
  assert.ok(con8.dias! >= con8.diasTecnicos, 'ninguna dotación puede bajar del piso técnico')

  // El piso: con una cuadrilla absurda el frente no baja de los días de curado.
  const con99 = frente(99)
  assert.ok(con99.dias! >= 7, `99 personas dieron ${con99.dias} días y el curado son 7`)
})

test('el tiempo técnico lo DECLARA la actividad: no se deduce de tener días de plan', () => {
  // Las 344 actividades traídas del tracker tienen `dias_plan` y se miden manual. Si «tiene días de
  // plan» alcanzara para ser tiempo técnico, los días de plan de la obra entera se sumarían como
  // días que no se comprimen, y todos los frentes quedarían inflados. Peor defecto que el original.
  const [f] = frentesDe([
    fila({ seccion: 'A', hh_plan: 320, dias_plan: 12 }),
  ], { dotaciones: { A: 4 }, jornada: 8 })
  assert.equal(f.diasTecnicos, 0)
  assert.equal(f.dias, 10, 'los 12 días de plan no son 12 días técnicos')
})

test('un tiempo técnico YA CUMPLIDO no vuelve a sumar sus días', () => {
  const [f] = frentesDe([
    fila({ seccion: 'A', hh_plan: 320 }),
    fila({ seccion: 'A', hh_plan: 8, hh_real: 8, avance_pct: 100, dias_plan: 7, tiempo_tecnico: true }),
  ], { dotaciones: { A: 4 }, jornada: 8 })
  assert.equal(f.diasTecnicos, 0, 'el curado que pasó, pasó')
  assert.equal(f.dias, 10)
})

// ═══ EL SIMULADOR QUE CORRE EN EL NAVEGADOR ═══
//
// LO QUE ATRAPAN: que el what-if del stepper diga otra cosa que el cálculo del servidor, y que un
// adelanto de plazo se publique siempre como «−1 d».

/** Diez días hábiles corridos desde el lunes 6/7/2026 (sin feriados), como los manda la página. */
const HABILES = [
  '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10',
  '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17',
]

test('el simulador del navegador da EXACTAMENTE lo mismo que frentesDe en el servidor', () => {
  // Si estos dos números se separan, la pantalla muestra un plazo mientras el «Aplicar al plan»
  // escribe otro. Es el defecto entero de mover una cuenta al cliente.
  const filas = [fila({ seccion: 'A', hh_plan: 320 })]
  for (const n of [0, 1, 3, 7]) {
    const [servidor] = frentesDe(filas, { dotaciones: { A: n }, jornada: 8 })
    const cliente = simularFrente(servidor, n, 8, HABILES)
    assert.equal(cliente.dias, servidor.dias, `con ${n} personas`)
    assert.equal(cliente.limite, servidor.limite)
  }
})

test('el tope recorta la pedida y lo DICE, en vez de mostrar un plazo que el tope impide', () => {
  const [f] = frentesDe([fila({ seccion: 'A', hh_plan: 320, tope_frente: 4 })], { jornada: 8 })
  const s = simularFrente(f, 9, 8, HABILES)
  assert.equal(s.dotacion, 4)
  assert.equal(s.recortada, true)
  assert.equal(s.limite, 'tope del frente')
})

test('sin HH no hay días ni fecha por más gente que se ponga: NULL no es 0', () => {
  const [f] = frentesDe([fila({ seccion: 'A' })], { jornada: 8 })
  const s = simularFrente(f, 6, 8, HABILES)
  assert.equal(s.dias, null)
  assert.equal(s.fin, null, 'una fecha de fin sin HH sería una promesa sin trabajo detrás')
})

test('el fin sale del calendario que mandó el servidor, y fuera de él es null', () => {
  // 320 HH con 4 personas = 10 días: el último día hábil que la página mandó.
  const [f] = frentesDe([fila({ seccion: 'A', hh_plan: 320 })], { jornada: 8 })
  assert.equal(simularFrente(f, 4, 8, HABILES).fin, '2026-07-17')
  // 320 HH con 2 personas = 20 días, y el calendario recibido tiene 10: no se inventa la fecha.
  assert.equal(simularFrente(f, 2, 8, HABILES).fin, null)
})

test('ADELANTAR EL PLAZO SE MIDE: no todo adelanto es «−1 d»', () => {
  // El fin simulado cae en el índice 4 (2026-07-10) y el plan estaba en el índice 9 (2026-07-17):
  // son cinco días de trabajo de adelanto. La cuenta vieja —habilesEntre(plan, sim) − 1— devolvía
  // −1 para éste y para cualquier otro adelanto, porque habilesEntre da 0 cuando el hasta es antes.
  const r = resumenSimulacion([{ dotacion: 8, dias: 5 }], 9, HABILES)
  assert.equal(r.fin, '2026-07-10')
  assert.equal(r.desvioDias, -5)
})

test('el fin de la obra simulada es el del frente más largo, y la gente se suma toda', () => {
  const r = resumenSimulacion([{ dotacion: 4, dias: 3 }, { dotacion: 2, dias: 8 }], 9, HABILES)
  assert.equal(r.genteTotal, 6)
  assert.equal(r.fin, '2026-07-15')
  assert.equal(r.desvioDias, -2)
})

test('sin ningún frente con días no hay fin simulado ni desvío: no se publica «en fecha»', () => {
  const r = resumenSimulacion([{ dotacion: 0, dias: null }], 9, HABILES)
  assert.equal(r.fin, null)
  assert.equal(r.desvioDias, null)
})
