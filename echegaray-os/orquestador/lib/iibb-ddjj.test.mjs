import test from 'node:test'
import assert from 'node:assert/strict'
import { parsearDDJJ, alicuotaDeclarada, montoAR } from './iibb-ddjj.mjs'

// Recorte del PDF real de la DDJJ de junio 2026 de Rentas San Juan. El texto sale desordenado del
// formulario a propósito: así viene, y el parser tiene que aguantarlo.
const JUNIO = `MINISTERIO DE ECONOMÍA
DIRECCIÓN GENERAL DE RENTAS SAN JUAN
CUIT N°: 30716304643
Periodo:
Fecha Present.: 16/07/2026
Cód. Acti.Descripción Tratam. Alícuota	Base Imponible
2026-06 N° DDJJ:
N° DE CONTROL
13180510681
410011 CONSTRUCCIÓN, REFORMA Y REPARACIÓN DE EDIFICIOS RESIDENCIALES	$ 2,00	D	- $ -
410021 CONSTRUCCIÓN, REFORMA Y REPARACIÓN DE EDIFICIOS NO RESIDENCIALES	$ 2,00	D	33.137.851,24 $ 662.757,02
711001 SERVICIOS RELACIONADOS CON LA CONSTRUCCIÓN. $ 3,00	O	- $ -
Total Impuesto Determinado $ 662.757,02
Total Retenciones y Percepciones 132.353,78	$	-
Saldo a favor Decalaracion Jurada Anterior - $ 1.453.715,15
A favor del Contribuyente
Monto a Ingresar
$ 923.311,91`

test('montoAR lee el formato argentino', () => {
  assert.equal(montoAR('1.453.715,15'), 1453715.15)
  assert.equal(montoAR('662.757,02'), 662757.02)
  assert.equal(montoAR('-'), 0)
  assert.equal(montoAR(''), 0)
})

test('sólo entran las actividades CON base imponible', () => {
  // El formulario lista todas las actividades inscriptas, la mayoría en cero. Contarlas daría una
  // alícuota promedio falsa — y es justo el error que llevó a estimar IIBB al 3%.
  const d = parsearDDJJ(JUNIO)
  assert.equal(d.actividades.length, 1)
  assert.equal(d.actividades[0].codigo, '410021')
  assert.equal(d.actividades[0].alicuota, 0.02)
  assert.equal(d.actividades[0].base_imponible, 33137851.24)
})

test('extrae los totales que deciden si se paga o no', () => {
  const d = parsearDDJJ(JUNIO)
  assert.equal(d.periodo, '2026-06')
  assert.equal(d.impuesto_determinado, 662757.02)
  assert.equal(d.retenciones, 132353.78)
  assert.equal(d.saldo_favor_anterior, 1453715.15)
  assert.equal(d.a_ingresar, 923311.91)
  assert.equal(d.a_favor, true, 'el formulario dice "A favor del Contribuyente": NO se paga')
  assert.equal(d.fecha_presentacion, '16/07/2026')
})

test('la alícuota declarada sale de las bases, no de la ley', () => {
  // La ley de San Juan tiene 2% para construcción y 3% para servicios relacionados. Echegaray
  // declara todo por construcción: estimar al 3% inflaba el impuesto un 50%.
  const a = alicuotaDeclarada([parsearDDJJ(JUNIO)])
  // Con tolerancia a propósito: es un promedio PONDERADO sobre importes reales ($662.757,02 sobre
  // $33.137.851,24), no una constante. Da 0,0199999998 y está bien que dé eso.
  assert.ok(Math.abs(a.alicuota - 0.02) < 1e-6, `esperaba ~2%, dio ${a.alicuota}`)
  assert.deepEqual(a.codigos, ['410021'])
})

test('un mes sin base imponible no rompe ni inventa alícuota', () => {
  // Abril 2026 fue así: cero facturación, pero igual sufrió $565.853 de retenciones.
  const a = alicuotaDeclarada([{ actividades: [] }])
  assert.equal(a.alicuota, null, 'sin base no hay alícuota: null, no cero ni un supuesto')
})
