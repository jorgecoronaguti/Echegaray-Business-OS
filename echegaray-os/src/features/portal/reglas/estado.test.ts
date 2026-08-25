import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoEnPantalla } from './estado.ts'
import type { CertificadoPortal } from '../types.ts'

const HOY = '2026-08-24'

const cert = (p: Partial<CertificadoPortal>): CertificadoPortal => ({
  id: 'c', obra_id: 'o', obra_nombre: 'Comedor', numero: 'Certificado 1', factura: null,
  periodo_desde: null, periodo_hasta: null, avance_periodo_pct: null, monto: 1_000_000,
  reparo: null, emitido_at: null, vence: null, cobrado_at: null, estado: 'emitido',
  observacion: null, rubros: [], pdf_url: null,
  ...p,
})

test('un certificado pagado se lee pagado aunque haya vencido antes', () => {
  // El defecto: mirar la fecha primero. `Certificado 1` del mockup venció el 02/07 y se pagó el
  // 06/07 — cuatro días tarde— y el mockup lo pinta VERDE, «pagado 06/07».
  const e = estadoEnPantalla(cert({ vence: '2026-07-02', cobrado_at: '2026-07-06', estado: 'vencido' }), HOY)
  assert.equal(e.clave, 'pagado')
  assert.equal(e.nota, 'pagado 06/07')
})

test('lo que espera la conformidad del cliente NO muestra vencimiento', () => {
  // Escribirle «vence en 3 días» a un certificado que todavía no aprobó es reclamarle una deuda que
  // no existe: el plazo de pago arranca con la aprobación.
  const e = estadoEnPantalla(cert({ estado: 'emitido', vence: '2026-08-27' }), HOY)
  assert.equal(e.clave, 'para_aprobar')
  assert.equal(e.muestra_fecha, false)
  assert.equal(e.nota, 'espera aprobación')
})

test('observado o en disputa es «En revisión» — la pelota la tiene la empresa', () => {
  for (const estado of ['observado', 'en_disputa', 'en_revision'] as const) {
    const e = estadoEnPantalla(cert({ estado, vence: '2026-07-15' }), HOY)
    assert.equal(e.clave, 'en_revision', `${estado} debería leerse En revisión`)
  }
})

test('con el certificado aprobado manda la fecha', () => {
  const vencido = estadoEnPantalla(cert({ estado: 'aprobado', vence: '2026-08-04' }), HOY)
  assert.equal(vencido.clave, 'vencido')
  assert.equal(vencido.nota, '20 d')
  assert.equal(vencido.dias, -20)

  const aVencer = estadoEnPantalla(cert({ estado: 'aprobado', vence: '2026-09-17' }), HOY)
  assert.equal(aVencer.clave, 'a_vencer')
  assert.equal(aVencer.nota, 'en 24 d')

  const hoyMismo = estadoEnPantalla(cert({ estado: 'aprobado', vence: HOY }), HOY)
  assert.equal(hoyMismo.clave, 'a_vencer')
  assert.equal(hoyMismo.nota, 'hoy')
})

test('sin fecha de pago no se inventa un vencimiento', () => {
  const e = estadoEnPantalla(cert({ estado: 'aprobado', vence: null }), HOY)
  assert.equal(e.clave, 'sin_fecha')
  assert.equal(e.muestra_fecha, false)
})
