import test from 'node:test'
import assert from 'node:assert/strict'

import {
  celdasDelImpacto, direccionDe, estadoDelImpacto, type InsumosImpacto,
} from './impactoDotacion.ts'

const insumos = (over: Partial<InsumosImpacto> = {}): InsumosImpacto => ({
  hhFrente: 820,
  planFrente: { dias: 9, fin: '2026-09-01' },
  simFrente: { dias: 6, fin: '2026-08-27' },
  desvioObraPlan: 16,
  desvioObraSim: 13,
  noEjecutable: false,
  imposible: false,
  cambio: true,
  genteSimulada: 6,
  disponibles: 18,
  ...over,
})

test('«no ejecutable» le gana a todo: un frente sin lugar no está «sin aplicar»', () => {
  // El defecto que atrapa: decir «simulación sin aplicar» sobre una simulación que el servidor va a
  // recortar al tope. La pantalla mostraría 8 personas y el plan quedaría con 4.
  const e = estadoDelImpacto(insumos({ noEjecutable: true }))
  assert.equal(e.tono, 'neg')
  assert.equal(e.texto, 'no ejecutable con este frente')
})

test('una fecha que ninguna dotación alcanza se dice antes que cualquier otra lectura', () => {
  // Modo Duración con los días pedidos por debajo de los técnicos: no es «sin aplicar», es que no
  // existe. Si esto dijera «simulación sin aplicar» invitaría a aplicar una fecha imposible.
  const e = estadoDelImpacto(insumos({ imposible: true, noEjecutable: false }))
  assert.equal(e.texto, 'no ejecutable: ninguna dotación llega a esa fecha')
  assert.equal(e.tono, 'neg')
})

test('pedir más gente de la que la obra tiene se dice con los dos números', () => {
  const e = estadoDelImpacto(insumos({ disponibles: 5, genteSimulada: 9 }))
  assert.equal(e.texto, 'pide 9 y la obra tiene 5')
})

test('sin dato de plantel NO se acusa de exceso: no se compara contra nada', () => {
  const e = estadoDelImpacto(insumos({ disponibles: null, genteSimulada: 900 }))
  assert.equal(e.texto, 'simulación sin aplicar')
})

test('sin nada tocado, la pantalla está mostrando el plan y lo dice', () => {
  assert.deepEqual(estadoDelImpacto(insumos({ cambio: false })), { texto: 'igual al plan', tono: 'pos' })
})

test('acortar el frente es una MEJORA, no un cambio neutro', () => {
  const [dur] = celdasDelImpacto(insumos())
  assert.equal(dur.rotulo, 'DURACIÓN')
  assert.equal(dur.plan, '9 d')
  assert.equal(dur.simulado, '6 d')
  assert.equal(dur.direccion, 'baja')
  assert.equal(dur.tono, 'pos')
})

test('alargar el frente es rojo', () => {
  const [dur] = celdasDelImpacto(insumos({ simFrente: { dias: 22, fin: '2026-09-20' } }))
  assert.equal(dur.tono, 'neg')
})

test('adelantar el fin del frente es verde; atrasarlo, rojo', () => {
  const [, fin] = celdasDelImpacto(insumos())
  assert.equal(fin.rotulo, 'FIN DEL FRENTE')
  assert.equal(fin.plan, '01/09')
  assert.equal(fin.simulado, '27/08')
  assert.equal(fin.tono, 'pos')
  const [, tarde] = celdasDelImpacto(insumos({ simFrente: { dias: 22, fin: '2026-09-20' } }))
  assert.equal(tarde.tono, 'neg')
})

test('un fin fuera del calendario simulado se dice, no se inventa una fecha', () => {
  const [, fin] = celdasDelImpacto(insumos({ simFrente: { dias: null, fin: null } }))
  assert.equal(fin.simulado, null)
  assert.equal(fin.detalle, 'fuera del calendario simulado')
})

test('las HH del frente NO se publican como 0 cuando no hay análisis', () => {
  const hh = celdasDelImpacto(insumos({ hhFrente: null }))[2]
  assert.equal(hh.plan, null)
  assert.equal(hh.simulado, null)
})

test('las HH no cambian con la dotación, y la celda lo dice en vez de repetir el número', () => {
  const hh = celdasDelImpacto(insumos())[2]
  assert.equal(hh.rotulo, 'HH TOTALES')
  assert.equal(hh.plan, '820')
  assert.equal(hh.simulado, 'iguales')
  assert.equal(hh.detalle, 'la cantidad no cambia')
})

test('el impacto en obra lleva signo, y ganar días es verde', () => {
  // El defecto que atrapa: publicar «13 d» a secas. El número es un DESVÍO contra el fin de plan;
  // sin el signo, «13» y «−13» se leen igual y son la diferencia entre llegar tarde y llegar antes.
  const obra = celdasDelImpacto(insumos())[3]
  assert.equal(obra.rotulo, 'IMPACTO EN OBRA')
  assert.equal(obra.plan, '+16 d')
  assert.equal(obra.simulado, '+13 d')
  assert.equal(obra.tono, 'pos')
  const adelanta = celdasDelImpacto(insumos({ desvioObraSim: -4 }))[3]
  assert.equal(adelanta.simulado, '-4 d')
})

test('sin fin de plan no hay impacto en obra que publicar', () => {
  const obra = celdasDelImpacto(insumos({ desvioObraPlan: null, desvioObraSim: null }))[3]
  assert.equal(obra.plan, null)
  assert.equal(obra.simulado, null)
  assert.equal(obra.tono, 'neutro')
})

test('el plan vacío no se disfraza: hoy ninguna obra tiene dotación prevista cargada', () => {
  // Con `dotacionPlan = 0` el plan no tiene duración ni fin. La celda tiene que decir «sin dato»
  // (plan `null`) y NO copiar el valor simulado, que sería la simulación comparándose consigo misma.
  const celdas = celdasDelImpacto(insumos({ planFrente: { dias: null, fin: null } }))
  assert.equal(celdas[0].plan, null)
  assert.equal(celdas[0].simulado, '6 d')
  assert.equal(celdas[0].direccion, 'igual')
  assert.equal(celdas[1].plan, null)
})

test('sin uno de los dos lados no hay dirección, y el tono queda neutro', () => {
  assert.equal(direccionDe(null, 5), 'igual')
  assert.equal(direccionDe(5, null), 'igual')
  assert.equal(direccionDe(5, 5), 'igual')
  assert.equal(direccionDe(5, 6), 'sube')
  assert.equal(direccionDe(6, 5), 'baja')
})
