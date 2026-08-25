import test from 'node:test'
import assert from 'node:assert/strict'
import { aspectoDeFrente, aspectoDeTarea, dotacionDeFrente, parteDeFrente, PALETA } from './aspecto.ts'
import type { FrenteDelDia } from './dia.ts'

// LO QUE ESTOS TESTS ATRAPAN
//
// El porte literal de J01 y J02 depende de que cada estado saque EXACTAMENTE los colores del
// `.dc.html`. Ese tipo de defecto no lo caza el typecheck —un `#B54708` donde va `#B42318` compila
// perfecto— y en una captura a 390px los dos son «rojizo». Acá se comparan contra los valores
// medidos en el mockup.
//
// El segundo defecto que atrapan es peor y es de negocio: que una tarea sin medir se dibuje como
// una tarea en cero. `avance_pct: null` tiene que dejar la barra APAGADA y el valor en gris; si
// alguien la pinta al 0 % con relleno, la pantalla afirma que el trabajo no arrancó cuando lo que
// pasa es que nadie lo midió.

const frente = (p: Partial<FrenteDelDia> = {}): FrenteDelDia => ({
  frente: { id: 'f1', nombre: 'Eje 1–4', camino: '', nivel: 1, tareas: [] },
  pct: 40, medidas: 2, total: 4, abiertas: 2, atrasoDias: null,
  personasHoy: 0, hhHoy: 0, parteHoy: false, impedimentos: 0, sinCuadrilla: false,
  ...p,
})

test('el frente parado sale con la paleta roja MEDIDA en J01, y tiñe el borde de la tarjeta', () => {
  const a = aspectoDeFrente(frente({ impedimentos: 1 }))
  assert.equal(a.palabra, 'Parado')
  assert.deepEqual(a.paleta, { texto: '#B42318', fondo: '#FEF6F5', borde: '#F3DDDA' })
  // El borde de la tarjeta SÓLO cambia acá. Si mañana alguien lo pinta en los cuatro estados, la
  // lista entera queda con contornos de color y el frente parado deja de destacarse.
  assert.equal(a.bordeTarjeta, '#F3DDDA')
  assert.equal(a.barra, '#B42318')
})

test('el frente sin cuadrilla es ÁMBAR, no rojo, y no tiñe el borde', () => {
  const a = aspectoDeFrente(frente({ sinCuadrilla: true }))
  assert.equal(a.palabra, 'Sin cuadrilla')
  assert.equal(a.paleta.texto, PALETA.warn.texto)
  assert.equal(a.bordeTarjeta, '#E7E6E2')
})

test('el frente en cero deja la barra GRIS: cero no se pinta de azul', () => {
  // Un relleno azul de ancho 0 no se ve, pero el color viaja al DOM y una futura barra con mínimo
  // visible pintaría de «en curso» un frente que no arrancó.
  assert.equal(aspectoDeFrente(frente({ pct: 0, personasHoy: 1 })).barra, '#D7D5CF')
  assert.equal(aspectoDeFrente(frente({ pct: 1, personasHoy: 1 })).barra, '#175CD3')
})

test('la dotación NO inventa un tope: sin cuadrilla lo dice, y si no cuenta horas o tareas', () => {
  assert.deepEqual(dotacionDeFrente(frente({ sinCuadrilla: true })), {
    texto: 'sin cuadrilla', color: '#B54708',
  })
  assert.equal(dotacionDeFrente(frente({ personasHoy: 3 })).texto, '3 con horas hoy')
  assert.equal(dotacionDeFrente(frente({ abiertas: 1 })).texto, '1 tarea abierta')
  // Lo que NUNCA puede pasar: que aparezca un «de N» inventado.
  for (const f of [frente(), frente({ personasHoy: 2 }), frente({ sinCuadrilla: true })]) {
    assert.ok(!/ de \d/.test(dotacionDeFrente(f).texto), dotacionDeFrente(f).texto)
  }
})

test('el parte del día distingue cargado de sin cargar, con su color y su icono', () => {
  assert.deepEqual(parteDeFrente(frente({ parteHoy: true })), {
    texto: 'parte cargado', color: '#067647', icono: 'ok',
  })
  assert.deepEqual(parteDeFrente(frente({ parteHoy: false })), {
    texto: 'sin parte', color: '#B54708', icono: 'reloj',
  })
})

const tarea = (p: Partial<Parameters<typeof aspectoDeTarea>[0]> = {}) => aspectoDeTarea({
  estado_operativo: 'en_curso', impedimentos_abiertos: 0, metodo_avance: 'partes',
  cuadrilla_prevista: 'Cuadrilla 1', avance_pct: 40, ...p,
})

test('una tarea TERMINADA gana sobre un impedimento viejo abierto', () => {
  // Si el impedimento ganara, una tarea hecha aparecería «Parada» en rojo en la lista y el jefe
  // iría a destrabar un frente que ya está cerrado.
  const a = tarea({ estado_operativo: 'hecha', impedimentos_abiertos: 1, avance_pct: 100 })
  assert.equal(a.titulo, 'Hecha')
  assert.equal(a.color, '#067647')
  assert.equal(a.colorValor, '#067647')
})

test('sin método de medición la tarea dice «Sin análisis», no «Pendiente»', () => {
  assert.equal(tarea({ metodo_avance: null }).titulo, 'Sin análisis')
})

test('avance null: valor en gris y barra apagada — sin plan NO es 0', () => {
  const a = tarea({ avance_pct: null })
  assert.equal(a.colorValor, '#91918B')
  assert.equal(a.barra, '#D7D5CF')
})
