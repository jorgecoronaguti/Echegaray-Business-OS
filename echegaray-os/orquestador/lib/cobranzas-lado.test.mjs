import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LADOS, LADO_POR_ROTULO, ROTULOS_INGRESO, ladoDeCobro, veredictoDelLado, culpables, parLados,
} from './cobranzas-lado.mjs'
import { esCobrado, esPendiente } from './cobranzas-repaso.mjs'
import { MEDIDAS, ESTADOS_PENDIENTES } from './cash-flow-medidas.mjs'

const cobro = (o) => ({ fila: 1, cliente: 'X', monto: 100, estado: 'Pendiente', endosado: false, ...o })
const conLado = (o) => { const c = cobro(o); return { ...c, lado: ladoDeCobro(c, { esCobrado, esPendiente }) } }

test('el lado sale de las MEDIDAS de la matriz, no de una lista escrita acá', () => {
  assert.deepEqual(ROTULOS_INGRESO, ['Ingresos reales', 'Ingresos proyectados'])
  assert.equal(LADO_POR_ROTULO.get('Ingresos reales'), 'real')
  assert.equal(LADO_POR_ROTULO.get('Ingresos proyectados'), 'proyectado')
  // La contraprueba de que está DERIVADO: el día que una medida de ingreso cambie sus estados, el
  // mapa cambia solo. Si alguien lo transcribe a mano, este assert deja de tener sentido y hay que
  // borrarlo — que es justamente la señal.
  const proyectada = MEDIDAS.find((m) => m.clave === 'ingresoProyectado')
  assert.deepEqual([...proyectada.estados], [...ESTADOS_PENDIENTES])
})

test('VENCIDO no es real: un pendiente con fecha pasada sigue del lado proyectado', () => {
  // El libro degrada PROYECTADO → VENCIDO cuando la fecha pasó el corte, y VENCIDO vive en
  // ESTADOS_PENDIENTES: la misma línea. Un corte de fecha replicado acá sacaría esa plata de los dos
  // lados y el mes descuadraría por su importe, contra un cuadro que sí la muestra.
  assert.ok(ESTADOS_PENDIENTES.includes('VENCIDO'), 'si esto cambia, el lado de un vencido cambia con él')
  const viejo = conLado({ estado: 'Pendiente', monto: 8000000 })
  assert.equal(viejo.lado, 'proyectado')
})

test('los cinco estados reales de la pestaña caen donde el libro los pone', () => {
  const esperado = {
    Cobrado: 'real', Pendiente: 'proyectado', Proyectado: 'proyectado', Facturado: 'proyectado',
  }
  for (const [estado, lado] of Object.entries(esperado)) {
    assert.equal(conLado({ estado }).lado, lado, `"${estado}" va al lado ${lado}`)
  }
  // Un endosado no cae de ningún lado: no entra por ninguna de las dos líneas.
  assert.equal(conLado({ estado: 'Cobrado', endosado: true }).lado, null)
})

test('un lado cierra o no cierra por sí solo: la suma de los dos no lo salva', () => {
  const real = veredictoDelLado({ bruto: 250, cashflow: 200 }, { tolerancia: 1, deriva: 0.005 })
  const proy = veredictoDelLado({ bruto: 0, cashflow: 50 }, { tolerancia: 1, deriva: 0.005 })
  assert.equal(real.ok, false)
  assert.equal(proy.ok, false)
  assert.equal(real.dif + proy.dif, 0, 'sumados dan cero: así se veía el ✓ del cuadre viejo')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CONTROL NOMBRA LA FILA — media hora de búsqueda a mano, el 14/08
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const AGOSTO = [
  conLado({ fila: 40, cliente: 'ARCOR', estado: 'Cobrado', monto: 30000000 }),
  conLado({ fila: 44, cliente: 'LA ESTRELLA', estado: 'Cobrado', monto: 8234758 }),
  conLado({ fila: 51, cliente: 'MESSINA', estado: 'Pendiente', monto: 4300876 }),
]

test('la fila del lado equivocado se nombra, con cliente, importe y hacia dónde se movió', () => {
  const c = culpables(AGOSTO, { real: 8234758, proyectado: -8234758 })
  assert.equal(c.length, 1, 'una sola candidata explica los dos lados a la vez')
  assert.equal(c[0].fila, 44)
  assert.equal(c[0].cliente, 'LA ESTRELLA')
  assert.equal(c[0].lado, 'real')
  assert.equal(c[0].haciaLado, 'proyectado')
  assert.equal(c[0].traspaso, true)
  assert.equal(c[0].exacta, true)
})

test('cuando el cuadro tiene de MÁS en un lado, la candidata se busca en el OTRO', () => {
  // El cuadro muestra $4.300.876 de más como real: la fila que se movió es la que Cobranzas todavía
  // tiene como pendiente. Buscarla entre las cobradas no la encontraría nunca.
  const c = culpables(AGOSTO, { real: -4300876, proyectado: 4300876 })
  assert.equal(c.length, 1, 'los dos lados apuntan a la misma fila: se nombra una vez')
  assert.equal(c[0].fila, 51)
  assert.equal(c[0].estado, 'Pendiente')
  assert.equal(c[0].lado, 'proyectado', 'Cobranzas la tiene pendiente y el cuadro la muestra como real')
})

test('sin candidata exacta se devuelven pistas, marcadas como pistas', () => {
  const c = culpables(AGOSTO, { real: 777, proyectado: 0 })
  assert.ok(c.length >= 1)
  assert.equal(c.every((x) => x.exacta === false), true, 'ninguna fila vale $777: no se afirma cuál es')
  assert.equal(c.every((x) => x.sola === false), true)
  assert.equal(c[0].monto, 8234758, 'la más cercana primero — es una pista ordenada, no un veredicto')
})

test('un mes que cuadra no produce culpables, y un lado sin filas lo dice', () => {
  assert.deepEqual(culpables(AGOSTO, parLados()), [])
  const vacio = culpables([], { real: 5000, proyectado: 0 })
  assert.equal(vacio.length, 1)
  assert.equal(vacio[0].fila, null, 'no hay a quién señalar: se declara en vez de inventar')
})

test('el endosado nunca es candidato: esa plata no entra por ninguna línea', () => {
  const con = [...AGOSTO, conLado({ fila: 43, cliente: 'LA ESTRELLA', estado: 'Cobrado', monto: 10000000, endosado: true })]
  const c = culpables(con, { real: 10000000, proyectado: -10000000 })
  assert.equal(c.every((x) => x.fila !== 43), true)
})

test('LADOS es el orden de lectura del cuadro: primero lo que ya pasó', () => {
  assert.deepEqual([...LADOS], ['real', 'proyectado'])
})
