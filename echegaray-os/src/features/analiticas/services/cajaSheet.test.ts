import test from 'node:test'
import assert from 'node:assert/strict'
import { egresosPercibidos, frescura, horaSanJuan, leerFotoCaja } from './cajaSheet.ts'
import { caja } from './empresa.ts'

const FILA = {
  portada: { titulo: 'POSICIÓN DE CAJA', tarjetas: [
    { clave: 'caja-disponible', rotulo: 'CAJA DISPONIBLE', valor: { texto: '$80.072.343', numero: 80072342.72, fecha: null }, contexto: 'al 18/09' },
    { clave: 'caja-invertida', rotulo: 'CAJA INVERTIDA', valor: { texto: '$45.191.415', numero: '45191415', fecha: null }, contexto: 'Balanz · a mano al 05/08 ▲ 44d' },
  ] },
  secciones: [
    { clave: 'seccion-1', numero: 1, titulo: '1 · DISTRIBUCIÓN POR CUENTAS', forma: 'tabla', encabezados: ['Cuenta', 'Importe en origen', 'Saldo en pesos', 'Fecha del saldo'],
      filas: [{ clave: 'santander-cta-cte-usd', fila: 10, celdas: [{ texto: 'Santander · cta cte USD' }, { texto: 'U$S 507,53', numero: 507.53 }, { texto: '766.757', numero: 766756.53 }, { texto: '03/09/2026', numero: 46268, fecha: '2026-09-03' }] }] },
    { clave: 'seccion-3', numero: 3, titulo: '3 · ALERTAS CRÍTICAS', forma: 'lista', items: [{ fila: 18, texto: '▲ No cierra $123.198.145' }] },
    { clave: 'rara', numero: 9, titulo: 'x', forma: 'otra' },
  ],
  graficos: [{ id: '1', titulo: '⟡ Proyección de la caja', subtitulo: 's', tipo: 'LINE', apilado: null, fila: 53, dominio: ['18/09', '19/09'], series: [{ nombre: '', tipo: 'LINE', eje: 'LEFT_AXIS', punteada: false, valores: [1, null] }] }],
  tipo_cambio_usd: '1510.759', leida_en: '2026-09-18T14:50:00.000Z', verificada_en: '2026-09-18T15:40:00.000Z', version_drive: 15574,
  ultimo_intento_en: '2026-09-18T15:40:00.000Z', ultimo_intento_ok: true, ultimo_error: null,
}

test('la foto se lee tal cual: el texto de cada celda es el de la pestaña, y el USD nunca se convierte', () => {
  const f = leerFotoCaja(FILA)
  assert.ok(f)
  assert.deepEqual(f.portada.tarjetas.map((t) => t.valor.texto), ['$80.072.343', '$45.191.415'])
  assert.equal(f.portada.tarjetas[1].valor.numero, 45191415)
  const s = f.secciones[0]
  assert.equal(s.forma, 'tabla')
  if (s.forma !== 'tabla') return
  assert.deepEqual(s.filas[0].celdas.map((c) => c.texto), ['Santander · cta cte USD', 'U$S 507,53', '766.757', '03/09/2026'])
  assert.equal(s.filas[0].celdas[3].fecha, '2026-09-03')
  assert.equal(f.secciones.length, 2, 'una forma desconocida no se dibuja')
  assert.deepEqual(f.graficos[0].series[0].valores, [1, null])
  assert.equal(f.tipoCambioUsd, 1510.759)
  assert.equal(f.versionDrive, '15574')
})

test('sin tarjetas o sin fecha de verificación no hay foto: no se dibuja a medias', () => {
  assert.equal(leerFotoCaja({ ...FILA, portada: { tarjetas: [] } }), null)
  assert.equal(leerFotoCaja({ ...FILA, verificada_en: null }), null)
  assert.equal(leerFotoCaja(null), null)
})

test('frescura: fresca hasta 20 min; después lo dice; y un intento fallido manda sobre la hora', () => {
  const f = leerFotoCaja(FILA)!
  assert.deepEqual(frescura(f, '2026-09-18T15:52:00.000Z'), { minutos: 12, aviso: null })
  assert.match(frescura(f, '2026-09-18T16:30:00.000Z').aviso ?? '', /no se confirma desde hace 50 min/)
  const roto = leerFotoCaja({ ...FILA, ultimo_intento_ok: false, ultimo_error: 'cuota de Google' })!
  assert.match(frescura(roto, '2026-09-18T15:41:00.000Z').aviso ?? '', /último intento: cuota de Google/)
})

test('la hora se dice en San Juan', () => {
  assert.equal(horaSanJuan('2026-09-18T15:40:00.000Z'), '18/09 12:40')
  assert.equal(horaSanJuan('no es fecha'), '')
})

test('lo percibido: cada pago en su fecha; sin desglose y pendiente se cuentan aparte; un pago sin fecha se declara', () => {
  const r = egresosPercibidos([
    { area: 'obras', fecha_pago: '2026-06-19', monto: '1000000', naturaleza: 'pago', estado: 'Pagado' },
    { area: 'obras', fecha_pago: '2026-07-18', monto: 450000, naturaleza: 'pago', estado: 'Pagado' },
    { area: 'personas', fecha_pago: '2026-09-10', monto: 40, naturaleza: 'pago', estado: 'Pagado' },
    { area: null, fecha_pago: '2026-09-10', monto: 5, naturaleza: 'pago', estado: 'Pagado' },
    { area: 'obras', fecha_pago: '2026-08-04', monto: 5124411.5, naturaleza: 'sin_desglose', estado: 'Pagado' },
    { area: 'obras', fecha_pago: '2026-09-25', monto: 2137866.67, naturaleza: 'pendiente', estado: 'Pendiente' },
    { area: 'obras', fecha_pago: null, monto: 9, naturaleza: 'pago', estado: 'Pagado' },
    { area: 'obras', fecha_pago: '2026-09-12', monto: null, naturaleza: 'pago', estado: 'Pagado' },
    { area: 'obras', fecha_pago: '2026-09-12', monto: 7, naturaleza: 'otra', estado: 'Pagado' },
  ])
  assert.equal(r.egresos.length, 4)
  assert.deepEqual(r.egresos.map((e) => e.mes), ['2026-06', '2026-07', '2026-09', '2026-09'])
  assert.deepEqual(r.sinDesglose, { n: 1, total: 5124411.5 })
  assert.deepEqual(r.pendientes, { n: 1, total: 2137866.67 })
  assert.deepEqual(r.pagosSinFecha, { n: 1, total: 9 })
  const c = caja(r.egresos)
  assert.equal(c.salio, 1450045)
  assert.equal(c.aObra, 1450000)
  assert.equal(c.estructura, 40)
  assert.equal(c.nSinDestino, 1)
})
