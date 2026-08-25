// Las reglas que deciden qué ve un TERCERO de la economía de una obra.
import test from 'node:test'
import assert from 'node:assert/strict'
import { enmascararMonto } from './services/portalService.ts'
import { hayCambiosSinPublicar, proximoVencimiento } from '../clientes/services/esquemaService.ts'
import { estadoDeAcceso } from '../clientes/services/accesosService.ts'
import type { PagoEsquema, AccesoPortal } from '../clientes/types'

test('sin permiso de ver montos el importe es null, NUNCA 0', () => {
  // Un 0 es un número: el cliente leería «este certificado no vale nada».
  assert.equal(enmascararMonto(6564250, false), null)
  assert.equal(enmascararMonto(0, false), null)
  assert.equal(enmascararMonto(6564250, true), 6564250)
})

test('con permiso, un importe ausente sigue siendo null y no se convierte en 0', () => {
  assert.equal(enmascararMonto(null, true), null)
  assert.equal(enmascararMonto(undefined, true), null)
  // Un cero REAL sí se muestra: es un dato, no una ausencia.
  assert.equal(enmascararMonto(0, true), 0)
})

const pago = (p: Partial<PagoEsquema>): PagoEsquema => ({
  id: 'p', cliente_id: 'c', obra_id: null, obra_nombre: null, cobranza_fila: null,
  concepto: 'x', fecha: null,
  monto: 100, reparo: null, estado: 'a_vencer', medio: null, visible_portal: false,
  aviso_dias: null, mostrar_reprogramaciones: false, nota_interna: null, reprogramaciones: [],
  publicado_at: null, cambio_pendiente: false, orden: 0, ...p,
})

test('un esquema visible que NUNCA se publicó cuenta como pendiente de publicar', () => {
  // Mirar sólo `cambio_pendiente` dejaría el esquema nuevo sin avisar nunca.
  assert.equal(hayCambiosSinPublicar([pago({ visible_portal: true, publicado_at: null })]), true)
})

test('un pago publicado que después cambió también cuenta', () => {
  assert.equal(hayCambiosSinPublicar([
    pago({ visible_portal: true, publicado_at: '2026-08-01T00:00:00Z', cambio_pendiente: true }),
  ]), true)
})

test('lo que NO es visible para el cliente no enciende el botón de publicar', () => {
  assert.equal(hayCambiosSinPublicar([pago({ visible_portal: false, publicado_at: null })]), false)
  assert.equal(hayCambiosSinPublicar([]), false)
})

const HOY = new Date('2026-08-25T12:00:00Z')

test('el próximo vencimiento ignora lo ya cobrado: recordar un pago hecho hace perder los avisos', () => {
  const r = proximoVencimiento([
    pago({ id: 'a', visible_portal: true, fecha: '2026-08-28', estado: 'cobrado' }),
    pago({ id: 'b', visible_portal: true, fecha: '2026-09-01', estado: 'a_vencer' }),
  ], HOY)
  assert.equal(r?.id, 'b')
})

test('el próximo vencimiento ignora lo que no es visible y lo que ya pasó', () => {
  assert.equal(proximoVencimiento([
    pago({ id: 'a', visible_portal: false, fecha: '2026-08-26' }),
    pago({ id: 'b', visible_portal: true, fecha: '2026-08-01' }),
  ], HOY), null)
})

test('lo que vence HOY todavía cuenta como próximo vencimiento', () => {
  const r = proximoVencimiento([pago({ id: 'a', visible_portal: true, fecha: '2026-08-25' })], HOY)
  assert.equal(r?.id, 'a')
})

const acceso = (a: Partial<AccesoPortal>): AccesoPortal => ({
  id: 'a', cliente_id: 'c', email: 'x@y.com', persona_contacto: null, puede_ver_obra: true,
  puede_ver_montos: false, puede_aprobar: false, obras: null, obras_nombres: null,
  habilitado_at: null,
  invitacion_enviada_at: null, primer_ingreso_at: null, ultimo_ingreso_at: null,
  ultimo_dispositivo: null, revocado_at: null, auth_user_id: null, ...a,
})

test('un acceso recién creado NO se ve igual que uno dado de baja', () => {
  assert.equal(estadoDeAcceso(acceso({})), 'sin_estrenar')
  assert.equal(estadoDeAcceso(acceso({ primer_ingreso_at: '2026-08-01T00:00:00Z' })), 'activo')
  assert.equal(estadoDeAcceso(acceso({ revocado_at: '2026-08-12T00:00:00Z' })), 'revocado')
})

test('revocado gana sobre activo: alguien que entró y después perdió el acceso está revocado', () => {
  assert.equal(estadoDeAcceso(acceso({
    primer_ingreso_at: '2026-08-01T00:00:00Z', revocado_at: '2026-08-12T00:00:00Z',
  })), 'revocado')
})
