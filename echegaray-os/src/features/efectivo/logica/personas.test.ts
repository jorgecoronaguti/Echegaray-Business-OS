import test from 'node:test'
import assert from 'node:assert/strict'
import type { Comprobante, Devolucion, Entrega, Rendicion } from '../types.ts'
import { resumir } from './entregas.ts'
import { agruparPorPersona, cronologiaDePersona } from './personas.ts'

// LA PANTALLA POR PERSONA (dueño, 29/09/2026): una fila por persona, y adentro su línea de tiempo con saldo corrido.

const entrega = (x: Partial<Entrega> = {}): Entrega => ({
  id: 'e1', codigo: 'ER-0001', persona_id: 'p-sosa', persona: 'Rubén Sosa', persona_legajo: 'SOSA, Rubén', obra_id: 'OB-8', obra: 'Galpón 8',
  estructura: false, fecha: '2026-09-10T15:00:00Z', entregado: 1000, rendido: 0, filas_rendidas: 0, devuelto: 0,
  en_su_poder: 1000, conformidad: true, estado: 'abierta', para_que: null, conformidad_en: null,
  cerrada_en: null, anulada_en: null, anulada_motivo: null, es_prueba: false, ...x,
})

const rend = (x: Partial<Rendicion> = {}): Rendicion => ({
  id: 'r1', entrega_id: 'e1', compra_clave: 'k1', monto: 300, imputada_en: '2026-09-12T15:00:00Z', comprobante_id: null, ...x,
})

const dev = (x: Partial<Devolucion> = {}): Devolucion => ({
  id: 'd1', entrega_id: 'e1', monto: 100, fecha: '2026-09-14', recibida_por: null, recibe: null, registrada_en: '2026-09-14T15:00:00Z',
  nota: null, firmo_entrega: true, firmo_recibe: true, comprobante: 'completo', papel_url: null, ...x,
})

const ticket = (x: Partial<Comprobante> = {}): Comprobante => ({
  id: 'c1', entrega_id: 'e1', entrega: 'ER-0001', persona_id: 'p-sosa', canal: 'app', enviado_en: '2026-09-13T15:00:00Z',
  storage_path: 'u/a.jpg', nombre_archivo: 'a.jpg', media_type: 'image/jpeg', estado_cola: 'cargado', motivo: null, resultado: null,
  compra_clave: null, monto_rendido: null, observacion: null, observado_en: null, respuesta: null, respondido_en: null,
  descartado_en: null, descartado_motivo: null, estado: 'leyendo', ...x,
})

test('una fila por persona aunque tenga varias entregas: no hay lista plana de entregas', () => {
  const es = [entrega(), entrega({ id: 'e2', codigo: 'ER-0002' }), entrega({ id: 'e3', codigo: 'ER-0003', persona_id: 'p-funes', persona: 'Diego Funes', persona_legajo: 'FUNES, Diego' })]
  const ps = agruparPorPersona(es, [], [], '2026-09-29', 'abiertas')
  assert.equal(ps.length, 2)
  assert.equal(ps.find((p) => p.id === 'p-sosa')?.vivas.length, 2)
  assert.equal(ps.find((p) => p.id === 'p-sosa')?.enMano, 2000)
})

test('el orden es por APELLIDO del legajo, no por el nombre que se muestra (bug del 28/09)', () => {
  // Se muestra «Ana Zárate» pero el legajo dice ZÁRATE: si se ordenara por lo mostrado, «Ana» iría primero.
  const es = [
    entrega({ id: 'a', persona_id: 'p-z', persona: 'Ana Zárate', persona_legajo: 'ZÁRATE, Ana' }),
    entrega({ id: 'b', persona_id: 'p-b', persona: 'Zoe Benítez', persona_legajo: 'BENÍTEZ, Zoe' }),
  ]
  assert.deepEqual(agruparPorPersona(es, [], [], '2026-09-29').map((p) => p.id), ['p-b', 'p-z'])
})

test('la suma de «en su poder» de las filas es la cifra «En manos de la gente» de las tarjetas', () => {
  const es = [
    entrega({ en_su_poder: 400 }), entrega({ id: 'e2', codigo: 'ER-0002', en_su_poder: 250 }),
    entrega({ id: 'e3', codigo: 'ER-0003', persona_id: 'p-f', persona: 'F', persona_legajo: 'F', en_su_poder: 90 }),
    entrega({ id: 'e4', codigo: 'ER-0004', persona_id: 'p-f', persona: 'F', persona_legajo: 'F', estado: 'cerrada', en_su_poder: 0 }),
    entrega({ id: 'e5', codigo: 'ER-0005', persona_id: 'p-f', persona: 'F', persona_legajo: 'F', estado: 'anulada', en_su_poder: 5000 }),
  ]
  const suma = agruparPorPersona(es, [], [], '2026-09-29', 'todas').reduce((s, p) => s + p.enMano, 0)
  assert.equal(suma, resumir(es, [], [], '2026-09-29').enManos)
  assert.equal(suma, 740)
})

test('una persona sólo con anuladas aparece en «anuladas» y no en «todas»', () => {
  const es = [entrega({ estado: 'anulada' })]
  assert.equal(agruparPorPersona(es, [], [], '2026-09-29', 'todas').length, 0)
  assert.equal(agruparPorPersona(es, [], [], '2026-09-29', 'anuladas').length, 1)
})

test('la cronología baja el saldo de la PERSONA con cada rendición y devolución, y lo más nuevo va arriba', () => {
  const e = entrega({ rendido: 300, devuelto: 100, en_su_poder: 600, filas_rendidas: 1 })
  const c = cronologiaDePersona({
    entregas: [e], comprobantes: [], rendiciones: [rend()], devoluciones: [dev()],
    compras: new Map([['k1', { fila: 900, clave: 'k1', fecha: '2026-09-11', proveedor: 'Corralón', concepto: 'Cemento', tipo: null, comprobante: null, total: 300, tipo_pago: 'Efectivo' }]]),
  })
  assert.deepEqual(c.movimientos.map((m) => [m.tipo, m.saldo]), [['devolucion', 600], ['rendicion', 700], ['entrega', 1000]])
  assert.equal(c.saldo, 600)
  assert.equal(c.cuadra, true)
})

test('el saldo corrido cruza entregas: una segunda entrega suma sobre lo que ya tenía en la mano', () => {
  const e1 = entrega({ rendido: 300, en_su_poder: 700 })
  const e2 = entrega({ id: 'e2', codigo: 'ER-0002', fecha: '2026-09-20T15:00:00Z', entregado: 500, en_su_poder: 500 })
  const c = cronologiaDePersona({ entregas: [e1, e2], comprobantes: [], rendiciones: [rend()], devoluciones: [], compras: new Map() })
  assert.equal(c.movimientos[0].saldo, 1200)
  assert.equal(c.cuadra, true)
})

test('un ticket que espera va en la línea pero NO mueve el saldo', () => {
  const c = cronologiaDePersona({ entregas: [entrega()], comprobantes: [ticket()], rendiciones: [], devoluciones: [], compras: new Map() })
  const enCamino = c.movimientos.find((m) => m.tipo === 'en_camino')
  assert.ok(enCamino)
  assert.equal(enCamino.delta, 0)
  assert.equal(c.saldo, 1000)
})

test('las anuladas no entran en la cronología ni en el saldo', () => {
  const c = cronologiaDePersona({ entregas: [entrega(), entrega({ id: 'x', codigo: 'ER-0009', estado: 'anulada', entregado: 9999 })], comprobantes: [], rendiciones: [], devoluciones: [], compras: new Map() })
  assert.equal(c.movimientos.length, 1)
  assert.equal(c.saldo, 1000)
})

test('el adelanto de sueldo también baja el saldo de la persona', () => {
  const e = entrega({ rendido: 300, en_su_poder: 700 })
  const c = cronologiaDePersona({
    entregas: [e], comprobantes: [], devoluciones: [], compras: new Map(),
    rendiciones: [rend({ adelanto_persona_id: 'p-x', adelanto_persona: 'X' })],
  })
  assert.equal(c.saldo, 700)
  assert.equal(c.movimientos[0].tipo, 'rendicion')
})

test('si la base dice otra cosa que la suma de los movimientos, `cuadra` es falso y dice cuánto', () => {
  // La entrega afirma haber rendido 500 pero sólo hay una rendición de 300 en la línea.
  const e = entrega({ rendido: 500, en_su_poder: 500 })
  const c = cronologiaDePersona({ entregas: [e], comprobantes: [], rendiciones: [rend()], devoluciones: [], compras: new Map() })
  assert.equal(c.cuadra, false)
  assert.equal(c.diferencia, 200)
})
