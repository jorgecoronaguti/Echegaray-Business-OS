import test from 'node:test'
import assert from 'node:assert/strict'
import { aPagarAhora, diasEntre, soloFecha } from './aPagar.ts'
import type { CertificadoPortal } from '../types.ts'

// «A PAGAR AHORA». El caso de referencia es el del mockup 29: hoy 24/08/2026, dos vencidos
// (Certificado 2 el 04/08 por $ 5,80 M y Certificado final el 15/07 por $ 2,40 M) suman $ 8,20 M y
// «la más antigua hace 40 días»; los certificados 3 y 4 vencen en 11 y 24 días y NO entran.

const HOY = '2026-08-24'

const cert = (p: Partial<CertificadoPortal>): CertificadoPortal => ({
  id: p.numero ?? 'x',
  obra_id: 'o1',
  obra_nombre: 'Comedor La Estrella',
  numero: 'Certificado 0',
  factura: null,
  periodo_desde: null,
  periodo_hasta: null,
  avance_periodo_pct: null,
  monto: 0,
  reparo: null,
  emitido_at: null,
  vence: null,
  cobrado_at: null,
  estado: 'emitido',
  observacion: null,
  rubros: [],
  pdf_url: null,
  ...p,
})

const CARTERA = [
  cert({ numero: 'Certificado 1', monto: 4_100_000, vence: '2026-07-02', cobrado_at: '2026-07-06', estado: 'cobrado' }),
  cert({ numero: 'Certificado final', monto: 2_400_000, vence: '2026-07-15', estado: 'en_revision' }),
  cert({ numero: 'Certificado 2', monto: 5_800_000, vence: '2026-08-04', estado: 'vencido' }),
  cert({ numero: 'Certificado 3', monto: 6_200_000, vence: '2026-09-04', estado: 'emitido' }),
  cert({ numero: 'Certificado 4', monto: 3_100_000, vence: '2026-09-17', estado: 'emitido' }),
]

test('a pagar ahora es lo vencido y sin cobrar — los $ 8,20 M del mockup', () => {
  const r = aPagarAhora(CARTERA, HOY)
  assert.equal(r.total_vencido, 8_200_000)
  assert.deepEqual(r.vencidos.map((c) => c.numero), ['Certificado final', 'Certificado 2'])
  assert.equal(r.dias_mas_antigua, 40)
  assert.deepEqual(r.proximos.map((c) => c.numero), ['Certificado 3', 'Certificado 4'])
  assert.equal(r.total_proximo, 9_300_000)
})

test('un certificado ya cobrado no se le reclama al cliente ni una vez más', () => {
  // El defecto: filtrar por estado en vez de por fecha de cobro. `Certificado 1` venció el 02/07 y
  // está pagado; si entrara, el panel le pediría al cliente $ 4,10 M que ya transfirió.
  const r = aPagarAhora(CARTERA, HOY)
  assert.ok(!r.vencidos.some((c) => c.numero === 'Certificado 1'))
  // Y tampoco entra el que tiene fecha de cobro aunque el estado se haya quedado atrás.
  const rezagado = [cert({ numero: 'C9', monto: 9_000_000, vence: '2026-01-01', cobrado_at: '2026-01-05', estado: 'vencido' })]
  assert.equal(aPagarAhora(rezagado, HOY).total_vencido, 0)
})

test('sin fecha de vencimiento no está vencido: queda aparte y no suma', () => {
  const r = aPagarAhora([...CARTERA, cert({ numero: 'C sin fecha', monto: 99_000_000 })], HOY)
  assert.equal(r.total_vencido, 8_200_000)
  assert.deepEqual(r.sin_fecha.map((c) => c.numero), ['C sin fecha'])
})

test('el que vence hoy todavía no está vencido', () => {
  const r = aPagarAhora([cert({ numero: 'C hoy', monto: 1_000_000, vence: HOY })], HOY)
  assert.equal(r.total_vencido, 0)
  assert.equal(r.dias_mas_antigua, null)
  assert.equal(r.total_proximo, 1_000_000)
})

test('la fecha se lee sin hora ni zona horaria', () => {
  assert.equal(soloFecha('2026-08-24T23:30:00Z'), '2026-08-24')
  assert.equal(soloFecha('24/08/2026'), null)
  assert.equal(soloFecha(null), null)
  // Un timestamp de las 23:30 no puede contar un día de más ni de menos.
  const r = aPagarAhora([cert({ numero: 'C', monto: 1, vence: '2026-08-23T23:30:00Z' })], HOY)
  assert.equal(r.dias_mas_antigua, 1)
})

test('los días cruzan el cambio de hora sin correrse', () => {
  assert.equal(diasEntre('2026-03-01', '2026-04-01'), 31)
  assert.equal(diasEntre('2026-08-24', '2026-08-24'), 0)
})
