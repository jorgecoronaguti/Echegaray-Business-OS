// El arreglo: lo que está en el mecánico, cuántos días lleva, si está atrasado y qué se le exige al cerrarlo.
// Son las reglas que la pantalla y la base comparten: si la lógica y la migración discrepan, esto lo muestra.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  activoDeTexto, admiteArreglo, afuera, arregloEnTaller, atrasado, candidatosArreglo, diasEntre, diasFuera, errorDeCierre, errorDeIngreso, hoyIso,
  renglonDeLibro, resumenAfuera,
} from './arreglo.ts'
import { disponibilidadDe } from './evento.ts'

const ev = (o) => ({ id: 'e' + Math.random(), activo_id: 'A', tipo: 'reparacion', situacion: 'en_taller', fecha: '2026-09-20', km: null, descripcion: 'no arranca',
  proveedor_id: null, taller_texto: 'Lo de Pepe', costo: null, compra_ref: null, proximo_km: null, proximo_fecha: null, ubicacion_origen: null, ubicacion_taller: null,
  enviado_en: null, cerrado_en: null, cerrado_por: null, creado_en: '2026-09-20T10:00:00Z', creado_por: null, llevado_por: null, ingreso_taller: '2026-09-20',
  vuelta_estimada: null, trabajo_hecho: null, repuestos: null, vuelta_en: null, resultado: null, ...o })
const act = (id, o = {}) => ({ id, codigo: 'HER-' + id, nombre: 'Amoladora ' + id, clase: 'herramienta', cantidad: 1, estado: 'reparacion_externa', ...o })
const HOY = '2026-10-01'

test('días fuera: entre fechas, no entre instantes (una fecha sin hora no cae el día anterior)', () => {
  assert.equal(diasEntre('2026-09-20', '2026-10-01'), 11)
  assert.equal(diasEntre('2026-10-01', '2026-10-01'), 0)
  // 03:00 UTC del 02/10 es 00:00 en San Juan: sigue siendo el 02/10 allá, y el 01/10 a las 02:59 UTC
  assert.equal(hoyIso(new Date('2026-10-02T03:00:00Z')), '2026-10-02')
  assert.equal(hoyIso(new Date('2026-10-02T02:59:00Z')), '2026-10-01')
})

test('días fuera: en el mecánico cuenta hasta hoy, ya volvió hasta la vuelta, sin ingreso no inventa', () => {
  assert.equal(diasFuera(ev({}), HOY), 11)
  assert.equal(diasFuera(ev({ situacion: 'hecho', vuelta_en: '2026-09-25' }), HOY), 5)
  assert.equal(diasFuera(ev({ ingreso_taller: null }), HOY), null)
  assert.equal(diasFuera(ev({ situacion: 'hecho', vuelta_en: null }), HOY), null, 'cerrado sin vuelta cargada: no hay número')
  assert.equal(diasFuera(ev({ ingreso_taller: '2026-10-05' }), HOY), 0, 'un ingreso futuro mal cargado no da días negativos')
})

test('atrasado: sólo si sigue afuera y la vuelta prometida ya pasó; sin promesa no hay atraso', () => {
  assert.equal(atrasado(ev({ vuelta_estimada: '2026-09-30' }), HOY), true)
  assert.equal(atrasado(ev({ vuelta_estimada: '2026-10-01' }), HOY), false, 'hoy es el día prometido: todavía no')
  assert.equal(atrasado(ev({}), HOY), false)
  assert.equal(atrasado(ev({ situacion: 'hecho', vuelta_estimada: '2026-09-22' }), HOY), false, 'ya volvió')
})

test('lo que está afuera: sólo en_taller de activos vivos, el que más lleva primero, y el resumen cuenta', () => {
  const porId = new Map([['A', act('A')], ['B', act('B')], ['C', act('C')], ['D', act('D', { estado: 'baja' })]])
  const eventos = [
    ev({ id: '1', activo_id: 'A', ingreso_taller: '2026-09-28', vuelta_estimada: '2026-09-30' }),
    ev({ id: '2', activo_id: 'B', ingreso_taller: '2026-09-10' }),
    ev({ id: '3', activo_id: 'C', situacion: 'pendiente', ingreso_taller: null }),
    ev({ id: '4', activo_id: 'D' }),
    ev({ id: '5', activo_id: 'A', situacion: 'hecho', vuelta_en: '2026-09-02' }),
  ]
  const l = afuera(eventos, porId, HOY)
  assert.deepEqual(l.map((x) => x.evento.id), ['2', '1'])
  assert.deepEqual(l.map((x) => x.dias), [21, 3])
  assert.deepEqual(resumenAfuera(l), { cuantos: 2, masViejo: 21, atrasados: 1 })
  assert.deepEqual(resumenAfuera([]), { cuantos: 0, masViejo: null, atrasados: 0 })
  assert.equal(afuera(null, porId, HOY).length, 0)
})

test('el estado del activo sale de los arreglos abiertos: en el mecánico, y vuelve a disponible al cerrar', () => {
  const a = { id: 'A', estado: 'reparacion_externa' }
  assert.equal(disponibilidadDe(a, [ev({})]), 'en_el_mecanico')
  assert.equal(disponibilidadDe({ id: 'A', estado: 'operativo' }, [ev({ situacion: 'hecho', vuelta_en: '2026-09-25', resultado: 'operativo' })]), 'disponible')
  assert.equal(arregloEnTaller([ev({ id: 'x' })], 'A', HOY)?.id, 'x')
  assert.equal(arregloEnTaller([ev({ situacion: 'hecho' })], 'A', HOY), null)
  assert.equal(arregloEnTaller([ev({ activo_id: 'Z' })], 'A', HOY), null)
})

test('ingreso: la falla, el mecánico y las fechas se piden antes de mandar', () => {
  const ok = { falla: 'no arranca', taller: 'Lo de Pepe', ingreso: '2026-09-30', vueltaEstimada: '', hoy: HOY }
  assert.equal(errorDeIngreso(ok), null)
  assert.match(errorDeIngreso({ ...ok, falla: ' a ' }), /qué falla/)
  assert.match(errorDeIngreso({ ...ok, taller: '  ' }), /mecánico/)
  assert.match(errorDeIngreso({ ...ok, ingreso: '2026-10-02' }), /futuro/)
  assert.match(errorDeIngreso({ ...ok, vueltaEstimada: '2026-09-29' }), /anterior al ingreso/)
  assert.equal(errorDeIngreso({ ...ok, vueltaEstimada: '2026-09-30' }), null, 'prometer la vuelta el mismo día es válido')
})

test('cierre: qué se le hizo es obligatorio; la vuelta ni futura ni antes del ingreso; costo no negativo; cómo quedó', () => {
  const ok = { trabajo: 'cambio de bomba', vuelta: '2026-10-01', ingreso: '2026-09-20', costo: '', resultado: 'operativo', hoy: HOY }
  assert.equal(errorDeCierre(ok), null)
  assert.match(errorDeCierre({ ...ok, trabajo: '  ' }), /qué se le hizo/)
  assert.match(errorDeCierre({ ...ok, resultado: '' }), /cómo quedó|operativo/)
  assert.match(errorDeCierre({ ...ok, vuelta: '2026-10-02' }), /futuro/)
  assert.match(errorDeCierre({ ...ok, vuelta: '2026-09-19' }), /antes de entrar/)
  assert.equal(errorDeCierre({ ...ok, ingreso: null, vuelta: '2026-09-19' }), null, 'sin ingreso cargado no hay contra qué comparar')
  assert.match(errorDeCierre({ ...ok, costo: '-5' }), /costo/)
  assert.match(errorDeCierre({ ...ok, costo: 'abc' }), /costo/)
  assert.equal(errorDeCierre({ ...ok, costo: '1250,50' }), null, 'coma decimal')
  assert.equal(errorDeCierre({ ...ok, resultado: 'baja' }), null)
})

test('un lote o una baja no admiten arreglo; los candidatos excluyen lo que ya está afuera', () => {
  assert.equal(admiteArreglo({ estado: 'operativo', cantidad: 1 }), true)
  assert.equal(admiteArreglo({ estado: 'operativo', cantidad: 8 }), false)
  assert.equal(admiteArreglo({ estado: 'baja', cantidad: 1 }), false)
  const activos = [act('A'), act('B', { estado: 'operativo' }), act('C', { cantidad: 4 }), act('D', { estado: 'baja' })]
  const c = candidatosArreglo(activos, [ev({ activo_id: 'A' })])
  assert.deepEqual(c.map((x) => x.id), ['B'])
  assert.equal(activoDeTexto(c, 'her-b')?.id, 'B')
  assert.equal(activoDeTexto(c, 'HER-B · Amoladora B')?.id, 'B')
  assert.equal(activoDeTexto(c, 'HER-A'), null, 'el que ya está afuera no se elige de nuevo')
  assert.equal(activoDeTexto(c, ''), null)
})

test('el renglón del libro: ingreso, mecánico, qué se hizo, costo y días fuera; sólo lo cargado', () => {
  const c = { nombreTipo: 'Reparación', taller: 'Lo de Pepe', quien: 'Rodrigo', hoy: HOY, pesos: (n) => `$${n}`, numero: (n) => String(n) }
  const hecho = ev({ situacion: 'hecho', ingreso_taller: '2026-09-20', vuelta_en: '2026-09-25', trabajo_hecho: 'cambio de bomba', repuestos: 'bomba', costo: 185000, compra_ref: 'FA 0001-123' })
  const t = renglonDeLibro(hecho, c)
  for (const parte of ['no arranca → cambio de bomba', 'Lo de Pepe', 'entró 20/09/2026 (lo llevó Rodrigo)', 'volvió 25/09/2026', '5 días fuera', 'repuestos: bomba', '$185000', 'comprobante FA 0001-123'])
    assert.ok(t.includes(parte), `falta «${parte}» en: ${t}`)
  assert.ok(!t.includes('$0') && !t.includes('km'), 'lo no cargado no se dice')
  assert.ok(renglonDeLibro(ev({ llevado_por: 'el chofer' }), c).includes('lo llevó el chofer'), 'quien lo llevó pisa al usuario que cargó')
  assert.ok(renglonDeLibro(ev({}), c).includes('11 días afuera'))
  assert.ok(renglonDeLibro(ev({ situacion: 'hecho', resultado: 'baja', trabajo_hecho: 'no tiene arreglo' }), c).includes('se dio de baja'))
})
