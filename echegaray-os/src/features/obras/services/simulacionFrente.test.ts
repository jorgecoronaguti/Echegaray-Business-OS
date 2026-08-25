import test from 'node:test'
import assert from 'node:assert/strict'

import { duracionDias, TOPE_DOTACION, type Frente } from './dotacion.ts'
import {
  dotacionParaDuracion, escalaDias, escalaDotacion, esModo, frenteInicial, MODOS, notaDeOrigen,
  simularModo,
} from './simulacionFrente.ts'

/** Un frente con lo mínimo que el simulador mira. */
const frente = (over: Partial<Frente> = {}): Frente => ({
  clave: 'Columna de carga',
  nombre: 'Columna de carga',
  subtitulo: null,
  subtituloTono: 'faint',
  esCritico: false,
  hhRestantes: 82,
  base: 'plan',
  sinDato: 0,
  dotacion: 4,
  dotacionPlan: 4,
  tope: null,
  dias: 3,
  diasTecnicos: 0,
  fin: null,
  limite: 'con margen',
  nActividades: 3,
  ...over,
})

const HABILES = Array.from({ length: 40 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)

// ── EL MECANISMO DEL CANÓNICO ────────────────────────────────────────────────

test('MODO DOTACIÓN: se fija la gente y la duración sale calculada', () => {
  const e = simularModo(frente(), 'dot', 4, 99, 8, HABILES)
  assert.equal(e.dotacion, 4)
  assert.equal(e.dias, duracionDias(82, 4, 8, 0)) // 3
  assert.equal(e.diasCalculada, true)
  assert.equal(e.dotacionCalculada, false)
})

test('MODO DURACIÓN: se fijan los días y la GENTE sale calculada — la cuenta inversa', () => {
  // EL DEFECTO QUE ATRAPA: la pantalla anterior sólo sabía ir de dotación a duración. Sin esto,
  // «para el viernes, ¿cuánta gente?» —la pregunta que se hace cuando el cliente pone fecha— no
  // tenía respuesta en la pantalla que existe para contestarla.
  const e = simularModo(frente(), 'dias', 4, 2, 8, HABILES)
  assert.equal(e.dotacion, 6) // ceil(82 / (2 × 8))
  assert.equal(e.dias, 2)
  assert.equal(e.dotacionCalculada, true)
  assert.equal(e.diasCalculada, false)
})

test('las dos direcciones cierran: la gente que la inversa devuelve termina DENTRO del plazo', () => {
  // EL DEFECTO QUE ATRAPA: una inversa que ignore los días técnicos devuelve una dotación que, al
  // recalcular la duración hacia adelante, da MÁS días que los pedidos. La pantalla prometería una
  // fecha con una gente que no llega a esa fecha, y las dos cifras estarían en la misma tarjeta.
  for (const dt of [0, 1, 5, 9]) {
    for (const hh of [1, 40, 82, 500, 1234]) {
      for (const pedido of [dt + 1, dt + 2, dt + 7, dt + 20]) {
        const n = dotacionParaDuracion(hh, pedido, 8, dt)
        assert.ok(n != null && n > 0, `hh=${hh} dt=${dt} pedido=${pedido}`)
        const vuelta = duracionDias(hh, n, 8, dt)
        assert.ok(vuelta != null && vuelta <= pedido, `hh=${hh} dt=${dt} pedido=${pedido} → ${n} → ${vuelta}`)
      }
    }
  }
})

test('un plazo que no supera a los días técnicos NO tiene dotación: no es cero, es imposible', () => {
  // EL DEFECTO QUE ATRAPA: dividir por (dias − técnicos) sin mirar el signo. Con 7 días de curado y
  // 5 pedidos la división da un número NEGATIVO o infinito, y la pantalla publicaría una dotación
  // absurda —o peor, un 0 que se lee «no hace falta nadie»— sobre un hormigón que cura igual.
  const f = frente({ diasTecnicos: 7 })
  const e = simularModo(f, 'dias', 4, 5, 8, HABILES)
  assert.equal(e.dotacion, null)
  assert.equal(e.imposiblePorTecnicos, true)
  assert.equal(e.fin, null, 'sin gente que llegue no se dibuja una fecha')
  assert.equal(dotacionParaDuracion(82, 7, 8, 7), null)
  assert.equal(dotacionParaDuracion(82, 6, 8, 7), null)
})

test('con días técnicos, la duración calculada NUNCA baja de ellos por más gente que se ponga', () => {
  const f = frente({ diasTecnicos: 7, hhRestantes: 8 })
  assert.equal(simularModo(f, 'dot', 1, 1, 8, HABILES).dias, 8)
  assert.equal(simularModo(f, 'dot', 50, 1, 8, HABILES).dias, 8)
})

test('MODO HH no simula: es el dato de base y no se puede elegir', () => {
  assert.equal(MODOS[0].id, 'hh')
  assert.equal(MODOS[0].detalle, 'dato de base')
  // Se comporta como Dotación: la gente queda donde está y la duración se calcula.
  const e = simularModo(frente(), 'hh', 4, 99, 8, HABILES)
  assert.equal(e.dotacion, 4)
  assert.equal(e.diasCalculada, true)
})

// ── EL TOPE DEL FRENTE ───────────────────────────────────────────────────────

test('el tope recorta la dotación Y la duración publicada es la que el frente PUEDE dar', () => {
  // EL DEFECTO QUE ATRAPA: publicar la duración de 8 personas en un frente donde entran 4. El
  // mockup la muestra en rojo; acá no se muestra, porque una fecha que el tope impide se descubre
  // el día de la entrega. Lo que se muestra es el recorte y la nota «más gente no acelera».
  const e = simularModo(frente({ tope: 4 }), 'dot', 8, 99, 8, HABILES)
  assert.equal(e.dotacion, 4)
  assert.equal(e.pedida, 8)
  assert.equal(e.sobreTope, true)
  assert.equal(e.dias, duracionDias(82, 4, 8, 0))
})

test('en modo Duración el tope NO recorta la cuenta: hay que poder decir «hacen falta 7 y no entran»', () => {
  const e = simularModo(frente({ tope: 4 }), 'dias', 4, 2, 8, HABILES)
  assert.equal(e.dotacion, 6, 'el número que la nota roja necesita nombrar')
  assert.equal(e.sobreTope, true)
})

test('sin HH no hay cuenta en ninguna de las dos direcciones — y no es 0', () => {
  const f = frente({ hhRestantes: null })
  assert.equal(simularModo(f, 'dot', 4, 3, 8, HABILES).dias, null)
  assert.equal(simularModo(f, 'dias', 4, 3, 8, HABILES).dotacion, null)
  assert.equal(dotacionParaDuracion(null, 3, 8, 0), null)
})

// ── LO QUE LA PANTALLA DIBUJA ALREDEDOR ──────────────────────────────────────

test('la escala de la barra no se mueve con el valor, y entra el plantel entero', () => {
  // EL DEFECTO QUE ATRAPA: la escala fija de 8 del mockup. Una obra con 18 en el plantel dibujaría
  // la barra llena desde la novena persona, y el gesto perdería la referencia que la barra da.
  assert.equal(escalaDotacion(null, null), 8)
  assert.equal(escalaDotacion(null, 18), 18)
  assert.equal(escalaDotacion(24, 18), 24)
  assert.equal(escalaDias(null, 0), 10)
  assert.equal(escalaDias(30, 0), 30)
  assert.equal(escalaDias(null, 12), 13, 'los días técnicos son el piso, y tienen que entrar')
})

test('la nota del origen dice cuántas actividades NO se pudieron sumar, antes que nada', () => {
  // EL DEFECTO QUE ATRAPA: mostrar «3 actividades · base: plan» sobre un frente al que le falta el
  // dato de una. `hhRestantes` ya vale null por eso; la nota tiene que decir por qué.
  assert.deepEqual(notaDeOrigen({ hhRestantes: null, base: 'sin base', sinDato: 2, nActividades: 5 }), {
    texto: '2 actividades sin HH del análisis: el total del frente no existe',
    alerta: true,
  })
  assert.deepEqual(notaDeOrigen({ hhRestantes: null, base: 'sin base', sinDato: 0, nActividades: 5 }), {
    texto: 'ninguna actividad del frente tiene HH cargadas',
    alerta: true,
  })
  assert.deepEqual(notaDeOrigen({ hhRestantes: 82, base: 'rendimiento observado', sinDato: 0, nActividades: 1 }), {
    texto: '1 actividad · base: rendimiento observado',
    alerta: false,
  })
})

test('la pantalla abre en un frente con trabajo, no en el primero de la lista', () => {
  // EL DEFECTO QUE ATRAPA: abrir en «Trabajos previos» (terminado, 0 HH restantes) y mostrar una
  // simulación vacía. Quattropani tiene exactamente esa forma: tres frentes, y el primero por orden
  // no es el que tiene trabajo por delante.
  const lista = [
    frente({ clave: 'Trabajos previos', hhRestantes: 0 }),
    frente({ clave: 'Sin clasificar', hhRestantes: null }),
    frente({ clave: 'Demolición', hhRestantes: 120 }),
  ]
  assert.equal(frenteInicial(lista), 'Demolición')
  assert.equal(frenteInicial([]), null)
  assert.equal(frenteInicial([lista[0]]), 'Trabajos previos', 'hay que mostrar alguno')
})

test('sólo los tres modos del canónico son modos', () => {
  assert.deepEqual(MODOS.map((m) => m.id), ['hh', 'dot', 'dias'])
  assert.equal(esModo('dias'), true)
  assert.equal(esModo('costo'), false)
  assert.equal(esModo(undefined), false)
})

// ── LO QUE APARECIÓ CORRIENDO EL MOTOR SOBRE LAS DOS OBRAS REALES (25/08/2026) ────────────────

test('un frente TERMINADO no pide «0 personas» ni promete una fecha de terminación', () => {
  // EL DEFECTO QUE ATRAPA, medido en Messina: dos de sus diez frentes están al 100 % (hh restantes
  // = 0, que es correcto). `dotacionNecesaria(0, dias)` devuelve 0 —la división es correcta— y la
  // pantalla contestaba «0 personas · fin 27/08»: con nadie llegás, y encima una fecha de
  // terminación para algo ya terminado.
  const f = frente({ hhRestantes: 0, dias: 0 })
  const e = simularModo(f, 'dias', 0, 3, 8, HABILES)
  assert.equal(e.dotacion, null)
  assert.equal(e.fin, null)
  assert.equal(e.sinTrabajo, true)
  assert.equal(e.dias, 0)
  assert.equal(notaDeOrigen(f).texto, 'frente terminado: no queda trabajo que repartir')
})

test('una dotación que la URL y la escritura no transportan se marca, no se ofrece', () => {
  // EL DEFECTO QUE ATRAPA, medido en Quattropani: 3.788 HH restantes. Pedir «terminar en 1 día»
  // devuelve 474 personas — la respuesta correcta a una pregunta absurda. Pero `?dot=` y
  // `aplicarDotacionAlPlan` sólo aceptan hasta TOPE_DOTACION, así que el botón se habilitaba y el
  // servidor contestaba «no hay ninguna dotación elegida» sobre una pantalla que mostraba 474.
  const e = simularModo(frente({ hhRestantes: 3788 }), 'dias', 0, 1, 8, HABILES)
  assert.equal(e.dotacion, 474)
  assert.equal(e.fueraDeContrato, true)
  assert.ok(474 > TOPE_DOTACION)
  const cabe = simularModo(frente({ hhRestantes: 3788 }), 'dias', 0, 10, 8, HABILES)
  assert.equal(cabe.dotacion, 48)
  assert.equal(cabe.fueraDeContrato, false)
})

test('el tope del contrato está definido UNA vez y lo usan la URL, la escritura y la pantalla', () => {
  assert.equal(TOPE_DOTACION, 99)
})
