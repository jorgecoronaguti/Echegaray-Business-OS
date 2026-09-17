import test from 'node:test'
import assert from 'node:assert/strict'
import { armarCostosPorObra } from '../../clientes/services/costosDeObra.ts'
import { armarEconomiaDeObras } from '../../clientes/services/economiaObras.ts'
import { armarObra } from './obras.ts'
import { celda, cifrasGastoPorObra, cifrasResumen, composicion, costoPorHora, ordenar, porCliente, textoComposicion, tonoDe } from './agregados.ts'

const obra = (id: string, cliente: string, e: Record<string, unknown>, c: Record<string, unknown> | null) =>
  armarObra(
    { obra_id: id, nombre: id, cliente_id: cliente, cliente_slug: cliente, cliente_nombre: cliente, estado: 'activa', n_comprobantes: 1, avance_pct: null },
    armarEconomiaDeObras([{ obra_canonica_id: id, ...e }]).get(id),
    c ? armarCostosPorObra([{ obra_id: id, ...c }])?.get(id) : null, null,
  )!

test('lo sin obra suma al gasto del cliente pero NO a ninguna obra ni al «queda»', () => {
  const a = obra('a', 'me', { contratado: 10e6, origen: 'oc-pesos' }, { materiales: 4e6 })
  const [f] = porCliente([a], new Map([['me', 3e6]]))
  assert.equal(f.gastado, 7e6)
  assert.equal(f.queda, 6e6, 'queda = contrato − gasto de las obras, sin el cajón sin obra')
  assert.equal(a.gasto.total, 4e6)
})

test('«queda» sólo con las dos patas: una obra sin precio no resta', () => {
  const a = obra('a', 'me', { origen: null }, { materiales: 4e6 })
  const [f] = porCliente([a], new Map())
  assert.equal(f.queda, null)
  assert.equal(f.contratado, null)
})

test('cifras del resumen: contratado con papel sólo cuenta obra_contrato; sin precio se cuenta', () => {
  const conPapel = obra('a', 'me', { contratado: 10e6, origen: 'oc-pesos', contrato_total: 10e6, contrato_mano_obra: 10e6, contrato_fuente: 'oc' }, { materiales: 1e6 })
  const formulario = obra('b', 'me', { contratado: 5e6, origen: 'formulario' }, null)
  const sinPrecio = obra('c', 'me', { origen: null }, { materiales: 2e6 })
  const r = cifrasResumen([conPapel, formulario, sinPrecio], new Map([['me', null]]))
  assert.equal(r.contratadoConPapel, 10e6)
  assert.equal(r.gastadoEnObras, 3e6)
  assert.equal(r.sinObraAsignada, null, 'sin cajón leído es null, no $0')
  assert.equal(r.obrasSinPrecio, 1)
})

test('composición: tres partes que suman 1, o null sin gasto', () => {
  const a = obra('a', 'me', {}, { mano_obra: 62, subcontratos: 8, materiales: 30 })
  assert.deepEqual(composicion([a]), { manoObra: 0.62, subcontratos: 0.08, materiales: 0.3 })
  assert.equal(textoComposicion(a), 'MO 62 % · sub 8 % · mat 30 %')
  assert.equal(composicion([obra('b', 'me', {}, null)]), null)
})

test('matriz: subcontratos «no es venta», HH «sin previsión», materiales en 0 con cita «el cliente»', () => {
  const a = obra('a', 'me', { contratado: 10e6, origen: 'oc-pesos', contrato_total: 10e6, contrato_mano_obra: 10e6, contrato_materiales: 0, contrato_cita: 'Nota 1' },
    { mano_obra: 12e6, materiales: 1e6, horas_valorizadas: 10 })
  assert.equal(celda(a, 'subcontratos').cotizadoAusente, 'no es venta')
  assert.equal(celda(a, 'horas').cotizadoAusente, 'sin previsión')
  assert.equal(celda(a, 'materiales').cotizadoAusente, 'el cliente')
  const mo = celda(a, 'manoObra')
  assert.equal(mo.pct, 1.2)
  assert.equal(mo.tono, 4, 'excedido')
})

test('matriz: precio sin contrato desglosado dice «sin desglose»; sin precio, «sin precio»', () => {
  assert.equal(celda(obra('a', 'me', { contratado: 5e6, origen: 'formulario' }, null), 'manoObra').cotizadoAusente, 'sin desglose')
  assert.equal(celda(obra('b', 'me', { contratado: 5e6, origen: 'suma-viva' }, null), 'manoObra').cotizadoAusente, 'sin precio')
})

test('tonos: cuatro grises por %, excedido aparte, sin % sin fondo', () => {
  assert.deepEqual([0.1, 0.3, 0.6, 0.9, 1.01, null].map(tonoDe), [0, 1, 2, 3, 4, null])
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

test('gasto por obra: cifras y orden con los huecos al final, nunca como cero', () => {
  const pasada = obra('a', 'me', { contratado: 10, origen: 'oc-pesos' }, { materiales: 20 })
  const sinMov = obra('b', 'me', { contratado: 10, origen: 'oc-pesos' }, null)
  const sinPrecio = obra('c', 'me', { origen: null }, { materiales: 5 })
  assert.deepEqual(cifrasGastoPorObra([pasada, sinMov, sinPrecio]), { conAmbas: 1, gastanSinPrecio: 1, conPrecioSinMovimiento: 1, excedidas: 1 })
  assert.deepEqual(ordenar([sinMov, sinPrecio, pasada], 'pct').map((o) => o.id), ['a', 'b', 'c'])
  assert.deepEqual(ordenar([sinMov, sinPrecio, pasada], 'gastado').map((o) => o.id), ['a', 'c', 'b'])
})
