import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cuantosConAlerta, diasHasta, historialDe, listaDeRevision, proximoVencimiento, semaforo, textoLecturaRevision, type RevisionVigente,
} from './revision.ts'
import { activo } from './fixture.test-util.ts'

const HOY = new Date(2026, 8, 23) // 23/09/2026, hora local

const rev = (p: Partial<RevisionVigente> & Pick<RevisionVigente, 'id' | 'activo_id' | 'tipo' | 'fecha'>): RevisionVigente => ({
  vencimiento: null, lectura: null, resultado: null, lugar: null, numero: null, costo: null, observaciones: null,
  adjunto_url: null, creado_en: `${p.fecha}T12:00:00Z`, creado_por: null, dias: null, ...p,
})

test('los días hasta una fecha son de calendario: mañana es 1, ayer es -1, hoy es 0', () => {
  assert.equal(diasHasta('2026-09-24', HOY), 1)
  assert.equal(diasHasta('2026-09-22', HOY), -1)
  assert.equal(diasHasta('2026-09-23', HOY), 0)
  assert.equal(diasHasta('2027-03-15', HOY), 173)
})

test('el semáforo: vencida en rojo, por vencer en ámbar, al día en verde, sin cargar en tenue', () => {
  assert.deepEqual(semaforo(null), { tono: 'tenue', texto: 'sin cargar', alerta: false })
  assert.deepEqual(semaforo({ vencimiento: null, resultado: null, dias: null }), { tono: 'tenue', texto: 'sin vencimiento', alerta: false })
  assert.deepEqual(semaforo({ vencimiento: '2026-09-01', resultado: 'apto', dias: null }, HOY), { tono: 'neg', texto: 'vencida hace 22 días', alerta: true })
  assert.deepEqual(semaforo({ vencimiento: '2026-09-23', resultado: 'apto', dias: null }, HOY), { tono: 'warn', texto: 'vence hoy', alerta: true })
  assert.deepEqual(semaforo({ vencimiento: '2026-10-20', resultado: 'apto', dias: null }, HOY), { tono: 'warn', texto: 'vence en 27 días', alerta: true })
  assert.deepEqual(semaforo({ vencimiento: '2027-03-15', resultado: 'apto', dias: null }, HOY), { tono: 'pos', texto: 'al día · 15/03/27', alerta: false })
})

test('una RTO rechazada está en rojo aunque el certificado tenga fecha por delante: no circula', () => {
  const s = semaforo({ vencimiento: '2027-03-15', resultado: 'rechazado', dias: 173 }, HOY)
  assert.equal(s.tono, 'neg')
  assert.equal(s.alerta, true)
})

test('sin «hoy», el semáforo usa los días que trajo la vista', () => {
  assert.equal(semaforo({ vencimiento: '2026-10-01', resultado: null, dias: -3 }).texto, 'vencida hace 3 días')
})

test('el próximo vencimiento de un rodado es la vigente que vence antes; una máquina no mira RTO', () => {
  const hilux = activo({ id: 'h', codigo: 'TOY-001', nombre: 'Hilux', clase: 'rodado' })
  const vigentes = [
    rev({ id: '1', activo_id: 'h', tipo: 'rto', fecha: '2026-03-10', vencimiento: '2027-03-10', resultado: 'apto' }),
    rev({ id: '2', activo_id: 'h', tipo: 'seguro', fecha: '2026-09-01', vencimiento: '2026-10-01' }),
    rev({ id: '3', activo_id: 'h', tipo: 'service', fecha: '2026-08-01', lectura: 84320 }),
  ]
  const p = proximoVencimiento(hilux, vigentes, HOY)
  assert.equal(p?.tipo, 'seguro')
  assert.equal(p?.semaforo.tono, 'warn')
  const retro = activo({ id: 'm', codigo: 'RET-001', nombre: 'Retro', clase: 'equipo' })
  assert.equal(proximoVencimiento(retro, [rev({ id: '9', activo_id: 'm', tipo: 'rto', fecha: '2026-01-01', vencimiento: '2026-02-01' })], HOY), null, 'un RTO cargado a una máquina no la ordena')
  assert.equal(proximoVencimiento(activo({ id: 'x', codigo: 'AMO-001', nombre: 'Amoladora' }), vigentes, HOY), null)
})

test('la lista pone lo vencido primero, después lo por vencer, lo al día, y al final lo sin cargar', () => {
  const activos = [
    activo({ id: 'a', codigo: 'ROD-0001', nombre: 'Al día', clase: 'rodado' }),
    activo({ id: 'b', codigo: 'ROD-0002', nombre: 'Sin cargar', clase: 'rodado' }),
    activo({ id: 'c', codigo: 'ROD-0003', nombre: 'Vencida', clase: 'rodado' }),
    activo({ id: 'd', codigo: 'EQU-0001', nombre: 'Por vencer', clase: 'equipo' }),
    activo({ id: 'e', codigo: 'AMO-001', nombre: 'Amoladora' }),
    activo({ id: 'f', codigo: 'ROD-0004', nombre: 'Baja', clase: 'rodado', estado: 'baja', baja_motivo: 'vendida', baja_en: '2026-01-01T00:00:00Z' }),
  ]
  const vigentes = [
    rev({ id: '1', activo_id: 'a', tipo: 'rto', fecha: '2026-06-01', vencimiento: '2027-06-01', resultado: 'apto' }),
    rev({ id: '2', activo_id: 'c', tipo: 'seguro', fecha: '2025-09-01', vencimiento: '2026-09-01' }),
    rev({ id: '3', activo_id: 'd', tipo: 'service', fecha: '2026-06-01', vencimiento: '2026-10-10', lectura: 1240 }),
  ]
  const filas = listaDeRevision(activos, vigentes, HOY)
  assert.deepEqual(filas.map((f) => f.activo.id), ['c', 'd', 'a', 'b'], 'la amoladora y la baja no entran')
  assert.equal(cuantosConAlerta(filas, false), 2)
  assert.equal(cuantosConAlerta(filas, true), null, 'sin la migración no se dice 0')
  assert.equal(listaDeRevision(activos, null, HOY).every((f) => f.proximo === null), true)
})

test('el historial va de la más nueva a la más vieja y no mezcla activos', () => {
  const h = historialDe([
    rev({ id: '1', activo_id: 'h', tipo: 'service', fecha: '2026-01-10' }),
    rev({ id: '2', activo_id: 'otro', tipo: 'service', fecha: '2026-05-10' }),
    rev({ id: '3', activo_id: 'h', tipo: 'rto', fecha: '2026-03-10' }),
  ], 'h')
  assert.deepEqual(h.map((r) => r.id), ['3', '1'])
})

test('la lectura se escribe con separador argentino y su unidad; vacía no es cero', () => {
  assert.equal(textoLecturaRevision(84320, 'km'), '84.320 km')
  assert.equal(textoLecturaRevision(1240.5, 'h'), '1.240,5 h')
  assert.equal(textoLecturaRevision(null, 'km'), 'sin cargar')
})
