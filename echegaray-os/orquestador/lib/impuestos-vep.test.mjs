import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsearVepPdf, imputarPorVep, imputarDeclaradas, vepsUnicos, IMPUTACIONES_DECLARADAS } from './impuestos-vep.mjs'

// TEXTO REAL de `2026-06 VEP (parcial).pdf` (Drive 1QoQYLyYrpRv5mBoTuXG9ej1hHhShjUT6), leído el 17/09/2026.
const VEP_JUNIO = `VEP
Comprobante de Pago
Datos del VEP:
Nro. VEP: 1651967665
Organismo Recaudador: ARCA
Tipo de Pago: Empleadores SICOSS - Saldo DJ
Descripción Reducida: SIJPDJ06/26
CUIT: 30-71630464-3
Concepto: 19 OBLIGACION MENSUAL/ANUAL
Subconcepto: 19 OBLIGACION MENSUAL/ANUAL
Período: 2026-06
Generado desde la presentación de DJ
CONTRIBUCIONES OBRA SOCIAL
(352)
$1.399.975,29
APORTES OBRAS SOCIALES (302) $699.987,65
ASEG.RIESGO DE TRABAJO L 24557
(312)
$2.750.458,70
SEGURO DE VIDA COLECTIVO (28) $9.341,64
Datos del comprobante de Pago:
Entidad de Pago: BANELCO
Medio de Pago: HomeBanking-EFECTIVO
Debito en cuenta del Banco: SANTANDER ARGENTINA S.A.
Nro. de Transacción: 937061561233
Código de Control: 000390
Fecha de Pago: 2026-07-20 Hora: 08:51:01
IMPORTE PAGADO $4.859.763,28`

// TEXTO REAL de `2026-08 pago vep` (Drive 1QIgeDUMMqzBtYgQZ-gXnCb69rFb-r3I7): una captura del extracto, no un VEP.
const CAPTURA_EXTRACTO = `S.E.U.O. (Salvo error u omisión) / No válido como comprobante
Detalle de movimiento
Pago de servicios
Imp.afip: 3071630464311793242 - tarj nro. 3537
Fecha 07/09/2026
Importe - $ 8.331.697,69`

const bancoVep = (id, fecha, importe) => ({
  fecha, importe, tipo: 'vep', fuente: 'banco', lector: 'banco', referencia: `banco:${id}`, impuesto: null, periodo: null,
  imputacion: 'sin_imputar', concepto: null, contraparte: null, detalle: {},
  descripcion: 'Pago de servicios - Imp.afip: 3071630464311793242 - tarj nro. 3537',
})

test('el comprobante de VEP se lee por rótulo: período, fecha, importe e impuesto', () => {
  const v = parsearVepPdf(VEP_JUNIO)
  assert.deepEqual(
    { periodo: v.periodo, fecha: v.fecha_pago, importe: v.importe, impuesto: v.impuesto, trx: v.nro_transaccion, vep: v.nro_vep },
    { periodo: '2026-06', fecha: '2026-07-20', importe: 4859763.28, impuesto: 'cargas_sociales', trx: '937061561233', vep: '1651967665' },
  )
  assert.equal(parsearVepPdf(CAPTURA_EXTRACTO), null, 'una captura del extracto no es un comprobante de VEP')
  assert.equal(parsearVepPdf(VEP_JUNIO.replace('Tipo de Pago: Empleadores SICOSS - Saldo DJ', 'Tipo de Pago: Otro').replace('SIJPDJ06/26', 'XX')).impuesto, null,
    'un tipo de VEP desconocido no se asigna a un impuesto')
})

test('EL VEP PARCIAL DE JUNIO: el banco sin imputar pasa a F931 2026-06 POR DOCUMENTO', () => {
  const v = { ...parsearVepPdf(VEP_JUNIO), archivo: '2026-06 VEP (parcial).pdf', drive_id: '1QoQ' }
  const [p] = imputarPorVep([bancoVep(454, '2026-07-20', 4859763.28)], [v])
  assert.equal(p.impuesto, 'cargas_sociales')
  assert.equal(p.periodo, '2026-06')
  assert.equal(p.imputacion, 'documento')
  assert.equal(p.detalle.vep.nro_transaccion, '937061561233')
})

test('sin coincidencia al centavo o fuera de 3 días, el VEP no imputa', () => {
  const v = parsearVepPdf(VEP_JUNIO)
  assert.equal(imputarPorVep([bancoVep(1, '2026-07-20', 4859764.28)], [v])[0].imputacion, 'sin_imputar')
  assert.equal(imputarPorVep([bancoVep(1, '2026-07-25', 4859763.28)], [v])[0].imputacion, 'sin_imputar')
  // Compras asienta al día hábil siguiente: 09/02 → 10/02 sí imputa.
  const ene = { ...v, periodo: '2026-01', fecha_pago: '2026-02-09', importe: 1994802.59, nro_vep: '1584827584', nro_transaccion: '661424196554' }
  const compras = { ...bancoVep(0, '2026-02-10', 1994802.59), fuente: 'compras', referencia: 'compras:2026-02-10|Enero|1994802.59' }
  assert.equal(imputarPorVep([compras], [ene])[0].periodo, '2026-01')
})

test('EL NOMBRE DEL ARCHIVO MIENTE: dos archivos con el mismo VEP son un comprobante, no dos candidatos', () => {
  const ene = { ...parsearVepPdf(VEP_JUNIO), periodo: '2026-01', fecha_pago: '2026-02-09', importe: 1994802.59, nro_vep: '1584827584', nro_transaccion: '661424196554' }
  const dos = [{ ...ene, archivo: '2026-01 VEP.pdf' }, { ...ene, archivo: '2026-02 VEP (parcial).pdf' }]
  assert.equal(vepsUnicos(dos).length, 1)
  const [p] = imputarPorVep([bancoVep(9, '2026-02-10', 1994802.59)], dos)
  assert.equal(p.imputacion, 'documento', 'si se contaran como dos candidatos no imputaría')
  assert.deepEqual(p.detalle.vep.archivos, ['2026-01 VEP.pdf', '2026-02 VEP (parcial).pdf'])
})

test('un VEP imputado por importe sube a documento; si el papel dice otro período, manda el papel y queda la huella', () => {
  const v = parsearVepPdf(VEP_JUNIO)
  const porImporte = { ...bancoVep(2, '2026-07-20', 4859763.28), impuesto: 'cargas_sociales', periodo: '2026-05', concepto: 'ddjj', imputacion: 'importe' }
  const [p] = imputarPorVep([porImporte], [v])
  assert.equal(p.periodo, '2026-06')
  assert.equal(p.detalle.periodo_por_importe, '2026-05')
  // Una retención o un débito no son VEP: no se tocan.
  const ret = { ...porImporte, tipo: 'retencion' }
  assert.equal(imputarPorVep([ret], [v])[0], ret)
})

test('LO DECLARADO POR EL DUEÑO: el VEP de $69.722,68 del 28/08 queda F931, declarado y con el período como inferencia', () => {
  const [p] = imputarDeclaradas([bancoVep(942, '2026-08-28', 69722.68)])
  assert.equal(p.imputacion, 'declarada')
  assert.equal(p.impuesto, 'cargas_sociales')
  assert.equal(p.periodo, '2026-06')
  assert.equal(p.detalle.declarado.dicho, 'eso es f931 pagado')
  assert.equal(p.detalle.periodo_inferido.confianza, 'media')
  // Otro importe, otra fecha u otro texto del extracto: no es ese débito.
  assert.equal(imputarDeclaradas([bancoVep(1, '2026-08-28', 69722.69)])[0].imputacion, 'sin_imputar')
  assert.equal(imputarDeclaradas([bancoVep(1, '2026-08-29', 69722.68)])[0].imputacion, 'sin_imputar')
  assert.equal(imputarDeclaradas([{ ...bancoVep(1, '2026-08-28', 69722.68), descripcion: 'Dgr san juan' }])[0].imputacion, 'sin_imputar')
})

test('un documento le gana a una declaración: la declaración sólo toca lo que sigue sin imputar', () => {
  const v = parsearVepPdf(VEP_JUNIO)
  const [p] = imputarDeclaradas(imputarPorVep([bancoVep(454, '2026-07-20', 4859763.28)], [v]))
  assert.equal(p.imputacion, 'documento')
  // Sin el comprobante (Drive caído), la declaración del dueño lo cubre igual.
  const [q] = imputarDeclaradas(imputarPorVep([bancoVep(454, '2026-07-20', 4859763.28)], []))
  assert.equal(q.imputacion, 'declarada')
  assert.ok(IMPUTACIONES_DECLARADAS.every((d) => d.declarado?.por && d.declarado?.el), 'toda declaración dice quién y cuándo')
})
