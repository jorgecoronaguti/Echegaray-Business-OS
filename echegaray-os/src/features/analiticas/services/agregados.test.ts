import test from 'node:test'
import assert from 'node:assert/strict'
import { armarCostosPorObra } from '../../clientes/services/costosDeObra.ts'
import { armarEconomiaDeObras } from '../../clientes/services/economiaObras.ts'
import { armarObra } from './obras.ts'
import { presupuestoDe } from './presupuesto.fixture.ts'
import { agruparPorCliente, celda, cifrasResumen, controlPorObra, costoPorHora, manoObraDe, porHoraMedido } from './agregados.ts'
import { rotuloEstimada } from './obras.ts'

type Pres = Partial<Record<'MO' | 'CS' | 'MA' | 'SC', number>>
const obra = (id: string, cliente: string, e: Record<string, unknown>, c: Record<string, unknown> | null, p: Pres | null = null) =>
  armarObra(
    { obra_id: id, nombre: id, cliente_id: cliente, cliente_slug: cliente, cliente_nombre: cliente, estado: 'activa', n_comprobantes: 1, avance_pct: null },
    armarEconomiaDeObras([{ obra_canonica_id: id, ...e }]).get(id),
    c ? armarCostosPorObra([{ obra_id: id, ...c }])?.get(id) : null,
    p ? presupuestoDe(id, Object.entries(p).map(([c, m]) => [c, m ?? 0] as [string, number])) : null,
  )!

test('Resumen: presupuestado y consumido rubro contra rubro; lo demás es «consumido sin presupuesto»; lo sin obra no entra al queda', () => {
  const q = obra('q', 'qp', {}, { mano_obra: 30e6, materiales: 37e6 }, { MO: 20e6, CS: 19e6 })
  const p = obra('p', 'me', { contratado: 10e6, origen: 'oc-pesos' }, { materiales: 3e6 }, { MA: 4e6 })
  const sinPres = obra('s', 'me', { contratado: 5e6, origen: 'formulario' }, { materiales: 2e6 })
  const r = cifrasResumen([q, p, sinPres], new Map([['me', 1e6]]))
  assert.equal(r.presupuestado, 43e6)
  assert.equal(r.consumido, 33e6, 'MO de q + materiales de p')
  assert.equal(r.queda, 10e6)
  assert.equal(r.consumoSinPresupuesto, 39e6, 'materiales de q (37) + la obra sin presupuesto (2)')
  assert.equal(r.sinObraAsignada, 1e6)
  assert.equal(r.obrasSinPresupuesto, 1)
  assert.equal(r.contrato, 15e6, 'referencia, no presupuesto')
})

test('Resumen sin ninguna fila: ausencias null, nunca $ 0', () => {
  const r = cifrasResumen([obra('s', 'me', {}, null)], new Map())
  assert.equal(r.presupuestado, null)
  assert.equal(r.queda, null)
  assert.equal(r.consumido, null)
  assert.equal(r.sinObraAsignada, null)
})

test('gráfico por obra: la más consumida primero, las sin presupuesto al final; exceso y consumo sin presupuesto aparte', () => {
  const pasada = obra('a', 'me', {}, { materiales: 12, mano_obra: 5 }, { MA: 10 })
  const media = obra('b', 'me', {}, { materiales: 5 }, { MA: 10 })
  const sinPres = obra('c', 'me', {}, { materiales: 50 })
  const f = controlPorObra([sinPres, media, pasada])
  assert.deepEqual(f.map((x) => x.obra.id), ['a', 'b', 'c'])
  assert.equal(f[0].consumido, 12)
  assert.equal(f[0].sinPresupuesto, 5, 'la mano de obra de «a» no tiene presupuesto')
  assert.equal(f[0].queda, -2)
  assert.equal(f[2].consumido, null)
  assert.equal(f[2].sinPresupuesto, 50)
  assert.equal(f[2].pct, null)
})

test('rubros: «otros» sin consumo registrado; HH contra las horas de la cotización; sin presupuesto de este rubro', () => {
  const a = obra('a', 'me', {}, { mano_obra: 12e6, materiales: 1e6, horas_valorizadas: 90, horas_sin_tarifa: 10 }, { MO: 10e6, SC: 1e6 })
  assert.equal(celda(a, 'otros').gastadoAusente, 'sin registrar')
  assert.deepEqual(celda(a, 'otros').lectura, { tipo: 'sinConsumo', monto: null })
  assert.equal(celda(a, 'horas').cotizadoAusente, 'sin previsión')
  assert.equal(celda(a, 'materiales').cotizadoAusente, 'sin presupuesto de este rubro')
  assert.deepEqual(celda(a, 'materiales').lectura, { tipo: 'sinPresupuesto', monto: null })
  const mo = celda(a, 'manoObra')
  assert.equal(mo.pct, 1.2)
  assert.deepEqual(mo.lectura, { tipo: 'excedido', monto: 2e6 })
  const conHH = obra('h', 'me', {}, { horas_valorizadas: 150 }, { MO: 1 })
  const hh = celda({ ...conHH, hhPresupuestadas: 200 }, 'horas')
  assert.equal(hh.cotizado, 200)
  assert.deepEqual(hh.lectura, { tipo: 'queda', monto: 50 })
})

test('rubros: con presupuesto y sin gasto es «sin movimiento», no «queda todo»', () => {
  const a = obra('a', 'me', {}, null, { MO: 5e6 })
  assert.deepEqual(celda(a, 'manoObra').lectura, { tipo: 'sinMovimiento', monto: null })
})

test('D2 · la mano de obra estimada se dice por rubro y sumada', () => {
  const a = obra('a', 'me', {}, { mano_obra: 1000, mano_obra_estimada: 770, mano_obra_real: 230, horas_valorizadas: 10 })
  const b = obra('b', 'me', {}, { mano_obra: 1000, mano_obra_real: 1000, horas_valorizadas: 10 })
  assert.equal(celda(a, 'manoObra').consumoEstimado, '77 % estimada')
  assert.equal(celda(b, 'manoObra').consumoEstimado, null)
  assert.equal(rotuloEstimada(manoObraDe([a, b])), '39 % estimada')
})

test('$/hora: sólo con MO y horas; la empresa es cociente de sumas, no promedio de cocientes', () => {
  const a = obra('a', 'me', {}, { mano_obra: 1000, horas_valorizadas: 10 })
  const b = obra('b', 'me', {}, { mano_obra: 30000, horas_valorizadas: 1000 })
  const sinHoras = obra('c', 'me', {}, { mano_obra: 5000 })
  const r = costoPorHora([a, b, sinHoras])
  assert.equal(r.puntos.length, 2)
  assert.equal(r.empresa, 31000 / 1010)
  assert.equal(r.puntos[0].obra.id, 'a')
  assert.ok(r.puntos[0].contraEmpresa > 2)
})

test('D2 · $/hora con mano de obra estimada NO es medición: no es punto, no entra a la empresa, la tabla no lo publica', () => {
  const estimada = obra('a', 'me', {}, { mano_obra: 9000, mano_obra_estimada: 9000, horas_valorizadas: 1 })
  const real = obra('b', 'me', {}, { mano_obra: 1000, mano_obra_real: 1000, horas_valorizadas: 10 })
  const r = costoPorHora([estimada, real])
  assert.deepEqual(r.puntos.map((p) => p.obra.id), ['b'])
  assert.equal(r.empresa, 100, 'la tarifa de vuelta no contamina la cifra de la empresa')
  assert.deepEqual(r.noMedidas.map((o) => o.id), ['a'])
  assert.equal(porHoraMedido(estimada), null)
  assert.equal(porHoraMedido(real), 100)
})

test('Resumen como el CRM: cliente con sus obras; primero lo excedido, después lo que más consumió', () => {
  const chica = obra('a1', 'arcor', {}, { materiales: 1 }, { MA: 10 })
  const grande = obra('m1', 'messina', {}, { materiales: 50 }, { MA: 100 })
  const pasada = obra('m2', 'messina', {}, { materiales: 12 }, { MA: 10 })
  const enorme = obra('q1', 'quattropani', {}, { materiales: 500 })
  const g = agruparPorCliente([chica, grande, pasada, enorme])
  assert.deepEqual(g.map((x) => x.clienteId), ['messina', 'quattropani', 'arcor'], 'messina tiene una excedida; después por consumo')
  assert.deepEqual(g[0].obras.map((f) => f.obra.id), ['m2', 'm1'], 'la excedida primero aunque consuma menos')
  assert.equal(g[0].presupuestado, 110)
  assert.equal(g[0].consumido, 62)
  assert.equal(g[0].queda, 48)
  assert.equal(g[0].excedidas, 1)
  assert.equal(g[1].presupuestado, null, 'sin presupuesto: null, no cero')
  assert.equal(g[1].pct, null)
  assert.equal(g.flatMap((x) => x.obras).length, 4, 'ninguna obra se pierde ni se repite')
})
