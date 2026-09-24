import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bajadaManoDeObra, cantidadPedido, cifraM, claseEstadoPedido, coberturaDelDetalle, compromisoTelefono,
  contarImpedimentos, estadoActivoEnObra, estadoImpedimento, estadoPedidoEscritorio, estadoPedidoTelefono,
  filtrarImpedimentos, ordenarPorNecesidad, pieDeComprasTelefono, pieDePedidos, queBloquea, rotuloTipo,
  seConvirtioEn, sublineaActivo, sublineaMovimiento, tituloMovimiento,
} from './operacionCanon.ts'
import type { Restriccion } from '../types/index.ts'

const HOY = '2026-09-09'
const r = (p: Partial<Restriccion>): Restriccion => ({
  id: p.id ?? 'x', obra_id: 'o', actividad_id: null, tipo: 'material', descripcion: 'd', responsable: null,
  fecha_necesidad: null, fecha_compromiso: null, fecha_liberacion: null, estado: 'abierta', ...p,
})

test('el estado del impedimento se deriva de la fila y de hoy: vencido, abierto, en curso, liberado', () => {
  assert.equal(estadoImpedimento(r({ fecha_compromiso: '2026-09-04' }), HOY).texto, 'Vencido')
  assert.equal(estadoImpedimento(r({ fecha_compromiso: '2026-09-10' }), HOY).texto, 'Abierto')
  assert.equal(estadoImpedimento(r({ fecha_compromiso: null }), HOY).texto, 'Abierto')
  assert.equal(estadoImpedimento(r({ estado: 'en_curso', fecha_compromiso: '2026-09-01' }), HOY).texto, 'En curso')
  assert.equal(estadoImpedimento(r({ estado: 'liberada', fecha_compromiso: '2026-09-01' }), HOY).tono, 'pos')
})

test('los filtros del 09 y del M12 son lentes distintas: Abiertos de escritorio no incluye En curso, el del teléfono sí', () => {
  const lista = [
    r({ id: 'v', fecha_compromiso: '2026-09-04' }),
    r({ id: 'a', fecha_compromiso: '2026-09-10' }),
    r({ id: 'c', estado: 'en_curso' }),
    r({ id: 'l', estado: 'liberada' }),
  ]
  const n = contarImpedimentos(lista, HOY)
  assert.deepEqual(n, { abiertos: 2, en_curso: 1, liberados: 1, vencidos: 1, noLiberados: 3 })
  assert.deepEqual(filtrarImpedimentos(lista, 'abiertos', HOY).map((x) => x.id), ['v', 'a'])
  assert.deepEqual(filtrarImpedimentos(lista, 'vencidos', HOY).map((x) => x.id), ['v'])
  assert.deepEqual(filtrarImpedimentos(lista, 'todos', HOY).length, 4)
})

test('se ordena por fecha de necesidad; sin necesidad va al final', () => {
  const orden = ordenarPorNecesidad([
    r({ id: 'sin' }), r({ id: 'b', fecha_necesidad: '2026-09-08' }), r({ id: 'a', fecha_necesidad: '2026-09-02' }),
  ])
  assert.deepEqual(orden.map((x) => x.id), ['a', 'b', 'sin'])
})

test('la derecha del M12: «venció 04/09» en rojo, la fecha en el tono del estado, o «sin cargar»', () => {
  assert.deepEqual(compromisoTelefono(r({ fecha_compromiso: '2026-09-04' }), HOY), { texto: 'venció 04/09', tono: 'neg' })
  assert.deepEqual(compromisoTelefono(r({ fecha_compromiso: '2026-09-10' }), HOY), { texto: '10/09', tono: 'warn' })
  assert.deepEqual(compromisoTelefono(r({}), HOY), { texto: 'sin cargar', tono: 'tenue' })
})

test('«Qué bloquea» lista cada actividad una vez y sólo por impedimentos no liberados', () => {
  const lista = [
    r({ id: '1', actividad_id: 'A' }), r({ id: '2', actividad_id: 'A' }),
    r({ id: '3', actividad_id: 'B', estado: 'liberada' }), r({ id: '4' }),
  ]
  assert.deepEqual(queBloquea(lista, (id) => (id === 'A' ? 'Hormigonado losa B' : null)),
    [{ actividadId: 'A', nombre: 'Hormigonado losa B' }])
})

test('el tipo clima, que la lista de once no tiene, se rotula igual', () => {
  assert.equal(rotuloTipo('ingenieria_cliente'), 'Ingeniería del cliente')
  assert.equal(rotuloTipo('clima'), 'Clima')
})

test('pedidos: el estado se lee por su raíz y «se convirtió en» nunca afirma una compra que no está atada', () => {
  assert.equal(claseEstadoPedido('ENTREGADO'), 'entregado')
  assert.equal(claseEstadoPedido('PEDIDO'), 'pendiente')
  assert.deepEqual(estadoPedidoEscritorio('Pendiente'), { texto: 'Pendiente', tono: 'warn' })
  assert.deepEqual(estadoPedidoTelefono('Comprado'), { texto: 'comprado', tono: 'curso' })
  assert.equal(seConvirtioEn('PEDIDO').texto, 'sin compra')
  assert.equal(seConvirtioEn('Entregado').texto, 'sin vincular')
  assert.equal(cantidadPedido(48, 'm³'), '48 m³')
  assert.equal(cantidadPedido(null, null), 'sin cantidad')
  assert.equal(pieDePedidos([{ origen: 'appsheet_sheet' }]), 'Nacen en AppSheet · ninguno cuelga de una compra.')
  assert.equal(pieDePedidos([{ origen: 'app' }, { origen: 'os' }]), 'Nacen en AppSheet y en la app · ninguno cuelga de una compra.')
})

test('equipos: sólo lo operativo es «En obra»; el resto es problema con borde', () => {
  assert.deepEqual(estadoActivoEnObra('operativo'), { texto: 'En obra', tono: 'pos', problema: false })
  assert.equal(estadoActivoEnObra('reparacion_externa').problema, true)
  assert.equal(sublineaActivo({ desde: '2026-08-19', desdeLugar: 'TALLER', quien: 'R. Quiroga' }), 'desde TALLER · R. Quiroga')
  assert.equal(sublineaActivo({ desde: null, desdeLugar: null, quien: null }), 'sin movimiento registrado')
  assert.equal(tituloMovimiento({ activoNombre: 'Vibrador', sentido: 'salio', otroLugar: 'TALLER' }), 'Vibrador → TALLER')
  assert.equal(tituloMovimiento({ activoNombre: 'Cortadora', sentido: 'entro', otroLugar: null }), 'Cortadora ← sin registrar')
  assert.equal(sublineaMovimiento({ sentido: 'entro', quien: null }), 'entró · sin registrar')
})

test('compras: la cifra en millones, la cobertura del detalle y las bajadas', () => {
  assert.equal(cifraM(168_700_000), '$ 168,70 M')
  assert.equal(cifraM(0), '$ 0,00')
  assert.equal(cifraM(null), '—')
  assert.equal(cifraM(7900), '$ 7.900')
  assert.equal(cifraM(840_000), '$ 0,84 M')
  assert.deepEqual(coberturaDelDetalle({ total: 100, sumaDetalle: 100 }).cubre, true)
  assert.equal(coberturaDelDetalle({ total: 3_000_000, sumaDetalle: 1_000_000 }).texto, 'faltan $ 2,00 M en el detalle')
  assert.equal(coberturaDelDetalle({ total: null, sumaDetalle: 5 }).texto, 'sin total declarado')
  assert.equal(bajadaManoDeObra(0).texto, 'se imputa como Estructura, no a la obra')
  assert.equal(pieDeComprasTelefono(5, { nComprobantes: 214, manoDeObra: 0 }), '5 de 214 · mano de obra va a estructura')
  assert.equal(pieDeComprasTelefono(2, { nComprobantes: null, manoDeObra: null }), '2 listadas · mano de obra sin dato')
})
