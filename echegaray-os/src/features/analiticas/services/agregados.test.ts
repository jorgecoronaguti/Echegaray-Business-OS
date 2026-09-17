import test from 'node:test'
import assert from 'node:assert/strict'
import { armarCostosPorObra } from '../../clientes/services/costosDeObra.ts'
import { armarEconomiaDeObras } from '../../clientes/services/economiaObras.ts'
import { armarObra } from './obras.ts'
import { presupuestoDe } from './presupuesto.fixture.ts'
import { porHoraMedido, manoObraDe, celda, cifrasGastoPorObra, cifrasResumen, composicion, costoPorHora, ordenar, porCliente, textoComposicion, totalesPorRubro } from './agregados.ts'

type Pres = Partial<Record<'MO' | 'CS' | 'MA' | 'SC', number>>
const obra = (id: string, cliente: string, e: Record<string, unknown>, c: Record<string, unknown> | null, p: Pres | null = null) =>
  armarObra(
    { obra_id: id, nombre: id, cliente_id: cliente, cliente_slug: cliente, cliente_nombre: cliente, estado: 'activa', n_comprobantes: 1, avance_pct: null },
    armarEconomiaDeObras([{ obra_canonica_id: id, ...e }]).get(id),
    c ? armarCostosPorObra([{ obra_id: id, ...c }])?.get(id) : null,
    p ? presupuestoDe(id, Object.entries(p).map(([c, m]) => [c, m ?? 0] as [string, number])) : null,
  )!

test('lo sin obra suma al gasto del cliente pero NO a ninguna obra ni al «queda»', () => {
  const a = obra('a', 'me', {}, { materiales: 4e6 }, { MA: 10e6 })
  const [f] = porCliente([a], new Map([['me', 3e6]]))
  assert.equal(f.gastado, 7e6)
  assert.equal(f.queda, 6e6, 'queda = presupuesto − gasto de las obras, sin el cajón sin obra')
  assert.equal(a.gasto.total, 4e6)
  assert.equal(f.partes?.sinObra, 3 / 7)
})

test('«queda» sale del presupuesto, NUNCA del contrato: con contrato y sin presupuesto no hay «queda»', () => {
  const a = obra('a', 'me', { contratado: 10e6, origen: 'oc-pesos' }, { materiales: 4e6 })
  const [f] = porCliente([a], new Map())
  assert.equal(f.queda, null)
  assert.equal(f.presupuestado, null)
  assert.equal(f.contratado, 10e6, 'el contrato viaja como referencia')
  assert.equal(f.nConPresupuesto, 0)
  assert.equal(f.nConPrecio, 1)
})

test('cifras del resumen: presupuestado sólo con presupuesto; contrato con papel aparte; sin presupuesto se cuenta con su gasto', () => {
  const conPapel = obra('a', 'me', { contratado: 10e6, origen: 'oc-pesos', contrato_total: 10e6, contrato_mano_obra: 10e6, contrato_fuente: 'oc' }, { materiales: 1e6 }, { MA: 8e6 })
  const formulario = obra('b', 'me', { contratado: 5e6, origen: 'formulario' }, null)
  const sinNada = obra('c', 'me', { origen: null }, { materiales: 2e6, horas_valorizadas: 5 })
  const r = cifrasResumen([conPapel, formulario, sinNada], new Map([['me', null]]))
  assert.equal(r.presupuestado, 8e6)
  assert.equal(r.contratadoConPapel, 10e6)
  assert.equal(r.gastadoEnObras, 3e6)
  assert.equal(r.sinObraAsignada, null, 'sin cajón leído es null, no $0')
  assert.equal(r.obrasSinPresupuesto, 2)
  assert.equal(r.gastoSinPresupuesto, 2e6)
  assert.equal(r.obrasConHoras, 1)
})

test('composición: tres partes que suman 1, o null sin gasto', () => {
  const a = obra('a', 'me', {}, { mano_obra: 62, subcontratos: 8, materiales: 30 })
  assert.deepEqual(composicion([a]), { manoObra: 0.62, subcontratos: 0.08, materiales: 0.3 })
  assert.equal(textoComposicion(a), 'MO 62 % · sub 8 % · mat 30 %')
  assert.equal(composicion([obra('b', 'me', {}, null)]), null)
})

test('rubros: «otros» no tiene consumo registrado; HH «sin previsión»; sin presupuesto se dice por rubro', () => {
  const a = obra('a', 'me', {}, { mano_obra: 12e6, materiales: 1e6, horas_valorizadas: 10 }, { MO: 10e6 })
  assert.equal(celda(a, 'otros').gastadoAusente, 'sin registrar')
  assert.equal(celda(a, 'otros').gastado, null)
  assert.equal(celda(a, 'horas').cotizadoAusente, 'sin previsión')
  assert.equal(celda(a, 'materiales').cotizadoAusente, 'sin presupuesto de este rubro')
  assert.deepEqual(celda(a, 'materiales').lectura, { tipo: 'sinPresupuesto', monto: null })
  const mo = celda(a, 'manoObra')
  assert.equal(mo.pct, 1.2)
  assert.deepEqual(mo.lectura, { tipo: 'excedido', monto: 2e6 })
})

test('rubros: con presupuesto y sin gasto es «sin movimiento», no «queda todo»', () => {
  const a = obra('a', 'me', {}, null, { MA: 5e6 })
  assert.deepEqual(celda(a, 'materiales').lectura, { tipo: 'sinMovimiento', monto: null })
})

test('totales del cliente por rubro: Σ de las obras, y el cotizado null si ninguna lo tiene', () => {
  const a = obra('a', 'me', {}, { materiales: 3e6 }, { MA: 4e6 })
  const b = obra('b', 'me', {}, { materiales: 2e6 })
  const t = totalesPorRubro([a, b])
  const mat = t.find((x) => x.item === 'materiales')!
  assert.equal(mat.gastado, 5e6)
  assert.equal(mat.cotizado, 4e6)
  assert.deepEqual(mat.lectura, { tipo: 'queda', monto: 1e6 }, 'b no presupuestó materiales: su gasto no entra a la comparación')
  assert.equal(t.find((x) => x.item === 'subcontratos')!.cotizadoAusente, 'sin presupuesto de este rubro')
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

test('gasto por obra: cifras contra el presupuesto y orden con los huecos al final, nunca como cero', () => {
  const pasada = obra('a', 'me', {}, { materiales: 20 }, { MA: 10 })
  const cerca = obra('d', 'me', {}, { materiales: 9 }, { MA: 10 })
  const sinMov = obra('b', 'me', {}, null, { MA: 10 })
  const sinPres = obra('c', 'me', { contratado: 100, origen: 'oc-pesos' }, { materiales: 5 })
  assert.deepEqual(cifrasGastoPorObra([pasada, cerca, sinMov, sinPres]),
    { conAmbas: 2, gastanSinPresupuesto: 1, conPresupuestoSinMovimiento: 1, cerca: 1, excedidas: 1 })
  assert.deepEqual(ordenar([sinMov, sinPres, pasada, cerca], 'pct').map((o) => o.id), ['a', 'd', 'b', 'c'])
  assert.deepEqual(ordenar([sinMov, sinPres, pasada], 'gastado').map((o) => o.id), ['a', 'c', 'b'])
  const ritmos = new Map([['c', { porMes: 7, ventana: [], conEstimada: false }]])
  assert.deepEqual(ordenar([pasada, sinPres], 'ritmo', ritmos).map((o) => o.id), ['c', 'a'])
})

test('D2 · la mano de obra estimada se dice: proporción y rótulo, por obra y sumada', async () => {
  const { proporcionEstimada, rotuloEstimada } = await import('./obras.ts')
  const a = obra('a', 'me', {}, { mano_obra: 1000, mano_obra_estimada: 770, mano_obra_real: 230, horas_valorizadas: 10 })
  const b = obra('b', 'me', {}, { mano_obra: 1000, mano_obra_real: 1000, horas_valorizadas: 10 })
  assert.equal(a.gasto.manoObraEstimada, 770)
  assert.equal(proporcionEstimada(a.gasto), 0.77)
  assert.equal(rotuloEstimada(a.gasto), '77 % estimada')
  assert.equal(rotuloEstimada(b.gasto), null)
  assert.equal(rotuloEstimada(manoObraDe([a, b])), '39 % estimada')
  assert.equal(textoComposicion(a), 'MO 100 % (77 % estimada) · sub 0 % · mat 0 %')
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
