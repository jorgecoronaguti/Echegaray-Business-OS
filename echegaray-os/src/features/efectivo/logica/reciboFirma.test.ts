import test from 'node:test'
import assert from 'node:assert/strict'
import { armarRecibo } from './recibo.ts'
import { fechaHoraDeFirma, fraseDelRecibo, trazoParaPdf, validarFirmaDelRecibo } from './reciboFirma.ts'
import { pdfDeReciboFirmado } from '../services/reciboPdf.ts'
import { esTrazoGuardable, svgDeFirma, type Trazo } from '../../../shared/firma/firma.ts'

const recibo = (r: Record<string, unknown> = {}, e: Record<string, unknown> = {}) => armarRecibo({
  rendicion: { monto: 170000, fecha: '2026-09-28', imputada_en: '2026-09-30T15:00:00Z', concepto: 'Alquiler de contenedor', proveedor: 'Contenedores del Sur', ...r },
  entrega: { codigo: 'ER-0021', obra: 'Casa Pérez', estructura: false, ...e },
  codigoObra: 'OB-0012', pagador: 'Emiliano Maldonado',
})!

const trazos = (): Trazo[] => [Array.from({ length: 30 }, (_, i) => ({ x: 10 + i * 6, y: 40 + Math.sin(i / 3) * 20 }))]
const svg = () => svgDeFirma(trazos(), 320, 120)!

test('la frase que se firma lleva importe en letras y en números, concepto, obra y fecha', () => {
  const f = fraseDelRecibo(recibo())
  assert.match(f, /^Recibí de ECHEGARAY CONSTRUCCIONES S\.A\.S\. la suma de pesos Ciento Setenta Mil Con 00\/100 \(\$ 170\.000,00\)/)
  assert.match(f, / en concepto de Alquiler de contenedor, obra OB-0012 · Casa Pérez, fecha 28\/09\/2026\.$/)
})

test('lo que la rendición no sabe se omite: no queda un hueco ni «null»', () => {
  const sin = armarRecibo({
    rendicion: { monto: 5000, fecha: null, imputada_en: 'basura', concepto: null, proveedor: null },
    entrega: { codigo: 'ER-0021', obra: null, estructura: false }, codigoObra: null, pagador: null,
  })!
  assert.equal(fraseDelRecibo(sin), 'Recibí de ECHEGARAY CONSTRUCCIONES S.A.S. la suma de pesos Cinco Mil Con 00/100 ($\u00A05.000,00).')
  assert.match(fraseDelRecibo(recibo({}, { estructura: true, obra: null })), /, gasto de Estructura, fecha/)
})

test('la fecha y hora de la firma se dicen en hora de San Juan', () => {
  assert.equal(fechaHoraDeFirma('2026-10-01T18:05:00Z'), '01/10/2026 15:05')
  assert.equal(fechaHoraDeFirma('2026-10-01T03:00:00Z'), '01/10/2026 00:00')
  assert.equal(fechaHoraDeFirma('no es fecha'), '')
})

test('aclaración obligatoria y DNI vacío o de 6 a 8 números', () => {
  assert.equal(validarFirmaDelRecibo({ aclaracion: ' ', dni: '' }).ok, false)
  assert.equal(validarFirmaDelRecibo({ aclaracion: 'Al', dni: '' }).ok, false)
  const ok = validarFirmaDelRecibo({ aclaracion: '  Rubén   Sosa ', dni: '20.123.456' })
  assert.deepEqual(ok, { ok: true, dato: { aclaracion: 'Rubén Sosa', dni: '20123456' } })
  assert.equal(validarFirmaDelRecibo({ aclaracion: 'Rubén Sosa', dni: '' }).ok && (validarFirmaDelRecibo({ aclaracion: 'Rubén Sosa', dni: '' }) as { dato: { dni: string | null } }).dato.dni, null)
  const mal = validarFirmaDelRecibo({ aclaracion: 'Rubén Sosa', dni: '12345' })
  assert.equal(mal.ok, false)
})

test('el trazo guardado se vuelve path y lienzo para el PDF; un SVG ajeno no', () => {
  const t = trazoParaPdf(svg())!
  assert.equal(t.ancho, 320)
  assert.equal(t.alto, 120)
  assert.match(t.d, /^M\d+ \d+L/)
  assert.equal(trazoParaPdf('<svg><script>x</script></svg>'), null)
  assert.equal(trazoParaPdf(''), null)
})

test('el PDF sale firmado y NO existe sin una firma legible', async () => {
  const firma = { trazo: svg(), aclaracion: 'Rubén Sosa', dni: '20123456', firmado_en: '2026-10-01T18:05:00Z' }
  assert.ok(esTrazoGuardable(firma.trazo))
  const bytes = await pdfDeReciboFirmado(recibo(), firma)
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-')
  // Con el trazo estampado el documento pesa más que el mismo sin firma dibujada (un path de 30 puntos).
  const sinTrazo = await pdfDeReciboFirmado(recibo(), { ...firma, trazo: svgDeFirma([[...trazos()[0].slice(0, 12)]], 320, 120)! })
  assert.ok(bytes.length > sinTrazo.length)
  await assert.rejects(() => pdfDeReciboFirmado(recibo(), { ...firma, trazo: '<svg></svg>' }), /no se entrega como firmado/)
})
