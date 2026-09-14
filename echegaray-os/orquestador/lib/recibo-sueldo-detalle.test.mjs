import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsearRecibo, concepto, cuilValido } from './recibo-sueldo-detalle.mjs'

const SIN_COSTO = { contribuciones_empleador: null, costo_total_empleador: null, fondo_cese: null, art: null, contribucion_uocra: null }

// Texto real de Rosales Q2-08/2026 (drive 1WS_y5W2Y_Tkwx9GMwQfdfCotz-3MC2D2), tal cual lo pasó el dueño.
const ROSALES_Q2_08 = `8 2026 ROSALES DIEGO JOSE 26 317.400,00 6.348,00 20-35850878-3
CATEGORÍA LABORAL SECCIÓN MODALIDAD DE CONTRATACION
OFICIAL INGENIERIA Y PRODUCCION Personal de la Construcción L 22250
OS SUP IND METALM RA ADMISTRACION CENTRAL, 31/08/2026 SEGUNDA QUINCENA 08/2026
REMUNERATIVO
0401 BASICO HS NORMALES 45 $ 6.348,00 $ 285.660,00
0425 ASISTENCIA PERFECTA (ART. 52 CCT) $ 57.132,00
0426 AJUSTE COD.0425 (INASIST. Y/O TARD.) $ -57.132,00
0431 HORAS FERIADO 5 $ 6.348,00 $ 31.740,00
NO REMUNERATIVO
DESCUENTOS
4010 JUBILACION $ 34.914,00
COMPOSICIÓN SALARIAL: Remunerativo: $ 317.400,00 No Remunerativo: $ 0,00 Descuentos: $ 87.159,88
SUELDO NETO $ 230.240,12`

// Recorte real de Rosales Q2-07/2026: sin feriado, con las contribuciones patronales 5xxx arriba.
const ROSALES_Q2_07 = `7 2026 ROSALES DIEGO JOSE 26 5.817,00 324.400,00 1 Año
FECHA INGRESO CATEGORÍA LABORAL C.U.I.L PERIODO BANCO F. PAGO APORTES
12/08/2024 OFICIAL 20-35850878-3 05/2026 SANTANDER RIO 08/06/2026
Personal de la Construcción L 22250 OS SUP IND METALM RA SEGUNDA QUINCENA 07/2026
CONCEPTO UNIDAD BASE MONTO
5010 CONTRIBUCION JUBILACION 45 $ 7.000,00 $ 315.000,00
SUELDO BRUTO $ 324.400,00
REMUNERATIVO
0401 BASICO HS NORMALES 50 $ 5.817,00 $ 290.850,00
0425 ASISTENCIA PERFECTA (ART. 52 CCT) $ 58.170,00
0426 AJUSTE COD.0425 (INASIST. Y/O TARD.) $ -58.170,00
NO REMUNERATIVO
0490 SUMA EXTRAORDINARIA NR $ 33.550,00
DESCUENTOS
4010 JUBILACION $ 31.993,50
COMPOSICIÓN SALARIAL: Remunerativo: $ 290.850,00 No Remunerativo: $ 33.550,00 Descuentos: $ 80.875,72
SUELDO NETO $ 243.524,28`

// Recorte real del formato enero–junio (Zogbe Q1-03/2026): original y duplicado, montos sin rótulo.
const ZOGBE_Q1_03 = `CUIT 30-71630464-3 CUIT 30-71630464-3
20-29108602-1 20-29108602-1
4.679,00 17 4.679,00 17
CATEGORÍA CATEGORÍA
OFICIAL OFICIAL
PRIMERA QUINCENA 03/2026 PRIMERA QUINCENA 03/2026
0401 BASICO HS NORMALES 50 233.950,00
0401 BASICO HS NORMALES 50 233.950,00
0425 ASISTENCIA PERFECTA (ART. 52 CCT) 46.790,00 0425 ASISTENCIA PERFECTA (ART. 52 CCT) 46.790,00
0426 AJUSTE COD.0425 (INASIST. Y/O TARD.) -46.790,00 0426 AJUSTE COD.0425 (INASIST. Y/O TARD.) -46.790,00
4010 JUBILACION 25.734,50 4010 JUBILACION 25.734,50
4020 LEY 19032 7.018,50 4020 LEY 19032 7.018,50
4050 OBRA SOCIAL 5.965,73 4050 OBRA SOCIAL 5.965,73
4150 ANSSAL 1.052,78 4150 ANSSAL 1.052,78
4170 APORTE ADICIONAL OS (Art.92 ter. LCT) 4.533,95 4170 APORTE ADICIONAL OS (Art.92 ter. LCT) 4.533,95
4175 APORTE ADIC ANSSAL (ART. 92 Ter. LCT) 800,10 4175 APORTE ADIC ANSSAL (ART. 92 Ter. LCT) 800,10
233.950,00 0,00
233.950,00 0,00 45.105,56 45.105,56
LUGAR Y FECHA DE PAGO 188.844,44 188.844,44
FORMA DE TOTAL NETO → FORMA DE`

test('Rosales Q2-08: el resultado exacto que pidió el dueño', () => {
  const r = parsearRecibo(ROSALES_Q2_08)
  assert.equal(r.ok, true, r.error)
  assert.deepEqual(r.fila, {
    cuil: '20358508783', periodo: 'Q2-08/2026', categoria: 'OFICIAL', valor_hora: 6348,
    horas_normales: 45, horas_feriado: 5, horas_otras: 0, horas_blanco: 50,
    bruto: 317400, descuentos: 87159.88, neto: 230240.12, ...SIN_COSTO,
  })
})

test('sin feriado: horas_feriado 0 y la contribución 5xxx no aporta horas ni valor hora', () => {
  const r = parsearRecibo(ROSALES_Q2_07)
  assert.equal(r.ok, true, r.error)
  assert.equal(r.fila.horas_feriado, 0)
  assert.equal(r.fila.horas_blanco, 50)
  assert.equal(r.fila.valor_hora, 5817)
  assert.equal(r.fila.bruto, 324400)
  assert.equal(r.fila.neto, 243524.28)
})

test('primera quincena del formato duplicado: no suma dos veces la copia', () => {
  const r = parsearRecibo(ZOGBE_Q1_03)
  assert.equal(r.ok, true, r.error)
  assert.equal(r.formato, 'duplicado')
  assert.deepEqual(r.fila, {
    cuil: '20291086021', periodo: 'Q1-03/2026', categoria: 'OFICIAL', valor_hora: 4679,
    horas_normales: 50, horas_feriado: 0, horas_otras: 0, horas_blanco: 50,
    bruto: 233950, descuentos: 45105.56, neto: 188844.44, ...SIN_COSTO,
  })
})

test('una contribución patronal 5xxx no es haber: no entra al bruto ni aporta valor hora', () => {
  const txt = ZOGBE_Q1_03.replace('4010 JUBILACION', '5010 CONTRIBUCION JUBILACION 50 99.000,00\n4010 JUBILACION')
  const r = parsearRecibo(txt)
  assert.equal(r.ok, true, r.error)
  assert.equal(r.fila.bruto, 233950)
  assert.equal(r.fila.neto, 188844.44)
  assert.equal(r.fila.valor_hora, 4679)
})

test('sin neto: error, nunca un neto calculado', () => {
  const r = parsearRecibo(ROSALES_Q2_08.replace(/SUELDO NETO.*$/m, ''))
  assert.equal(r.ok, false)
  assert.match(r.error, /NETO/)
  const v = parsearRecibo(ZOGBE_Q1_03.replace(/188\.844,44/g, '188.000,00'))
  assert.equal(v.ok, false)
  assert.match(v.error, /neto/)
})

test('sin CUIL válido: error (el CUIT de la empresa no cuenta)', () => {
  assert.equal(parsearRecibo(ROSALES_Q2_08.replace('20-35850878-3', '')).ok, false)
  assert.equal(parsearRecibo(ROSALES_Q2_08.replace('20-35850878-3', '20-35850878-4')).ok, false)
  assert.equal(cuilValido('20358508783'), true)
})

test('liquidación final: período FINAL-mm/aaaa desde el renglón del mes', () => {
  const txt = ROSALES_Q2_08.replace('SEGUNDA QUINCENA 08/2026', 'LIQUIDACION FINAL')
  const r = parsearRecibo(txt)
  assert.equal(r.ok, true, r.error)
  assert.equal(r.fila.periodo, 'FINAL-08/2026')
})

test('el signo de un monto negativo se conserva', () => {
  assert.equal(concepto('0426 AJUSTE COD.0425 (INASIST. Y/O TARD.) $ -57.132,00').monto, -57132)
  assert.equal(concepto('0426 AJUSTE COD.0425 (INASIST. Y/O TARD.) -46.790,00').monto, -46790)
  assert.deepEqual(concepto('0401 BASICO HS NORMALES 45 $ 6.348,00 $ 285.660,00'),
    { codigo: '0401', descripcion: 'BASICO HS NORMALES', unidad: 45, base: 6348, monto: 285660 })
})

test('horas × valor hora que no da el monto del 0401: error, no un valor hora dudoso', () => {
  const r = parsearRecibo(ROSALES_Q2_08.replace('45 $ 6.348,00 $ 285.660,00', '45 $ 6.348,00 $ 285.000,00'))
  assert.equal(r.ok, false)
  assert.match(r.error, /0401/)
})

// Recorte real del 1EXFg2A2PrERnxbTB-eeBnyeIJK6Cf8Uo (Q2-05/2026): el 9999 REDONDEO cierra el neto en pesos.
const REDONDEO_Q2_05 = `20-35850878-3
CATEGORÍA
OFICIAL ESPECIALIZADO
SEGUNDA QUINCENA 05/2026 SEGUNDA QUINCENA 05/2026
6.119,00
0401 BASICO HS NORMALES 84 513.996,00
0401 BASICO HS NORMALES 84 513.996,00
0425 ASISTENCIA PERFECTA (ART. 52 CCT) 102.799,20 0425 ASISTENCIA PERFECTA (ART. 52 CCT) 102.799,20
0431 HORAS FERIADO 8 48.952,00 0431 HORAS FERIADO 8 48.952,00
0490 SUMA EXTRAORDINARIA NR 62.700,00 0490 SUMA EXTRAORDINARIA NR 62.700,00
4010 JUBILACION 73.232,19 4010 JUBILACION 73.232,19
4020 LEY 19032 19.972,42 4020 LEY 19032 19.972,42
4050 OBRA SOCIAL 18.575,40 4050 OBRA SOCIAL 18.575,40
4150 ANSSAL 3.278,01 4150 ANSSAL 3.278,01
4285 APORTE SOLIDARIO EXT.UOCRA 13.314,94 4285 APORTE SOLIDARIO EXT.UOCRA 13.314,94
4287 SEGURO DE VIDA UOCRA 16.177,54 4287 SEGURO DE VIDA UOCRA 16.177,54
9999 REDONDEO 0,30 9999 REDONDEO 0,30
665.747,20 62.700,30
Contribuciones Patronales: 246.473,94 665.747,20 62.700,30 144.550,50 Contribuciones Patronales: 246.473,94 144.550,50
LUGAR Y FECHA DE PAGO 583.897,00 583.897,00
FORMA DE TOTAL NETO → FORMA DE`

test('9999 REDONDEO es haber: sin él el neto impreso no cierra', () => {
  const r = parsearRecibo(REDONDEO_Q2_05)
  assert.equal(r.ok, true, r.error)
  assert.equal(r.fila.neto, 583897)
  assert.equal(r.fila.horas_blanco, 92)
  assert.equal(r.fila.valor_hora, 6119)
  assert.equal(r.fila.categoria, 'OFICIAL ESPECIALIZADO')
})

test('quincena sin 0401 (accidente): el valor hora sale del concepto horario, las horas van a otras', () => {
  // Recorte real de Quiroga Q2-08/2026: 0429 HORAS ACCIDENTE en lugar de 0401.
  const txt = ROSALES_Q2_08
    .replace('0401 BASICO HS NORMALES 45 $ 6.348,00 $ 285.660,00', '0429 HORAS ACCIDENTE 45 $ 6.348,00 $ 285.660,00')
  const r = parsearRecibo(txt)
  assert.equal(r.ok, true, r.error)
  assert.equal(r.fila.valor_hora, 6348)
  assert.deepEqual([r.fila.horas_normales, r.fila.horas_feriado, r.fila.horas_otras, r.fila.horas_blanco], [0, 5, 45, 50])
})

test('otro concepto horario se suma a horas_otras; una unidad en días no', () => {
  const txt = ROSALES_Q2_08.replace('NO REMUNERATIVO',
    '0411 HORAS EXTRAS 50% 3 $ 9.522,00 $ 28.566,00\n2521 SAC PROPORCIONAL 7 $ 381,45 $ 2.670,16\nNO REMUNERATIVO')
  const r = parsearRecibo(txt)
  assert.equal(r.ok, true, r.error)
  assert.equal(r.fila.horas_otras, 3)
  assert.equal(r.fila.horas_blanco, 53)
  assert.deepEqual(r.unidadesNoHorarias, ['2521 SAC PROPORCIONAL 7'])
})

// ═══ COSTO EMPLEADOR ═══

// Texto real completo de Rosales Q2-08/2026 (1WS_y5W2Y_Tkwx9GMwQfdfCotz-3MC2D2) con la sección de costo
// empleador, extraído con lineasDeItems. Incluye el cuadro final «Costo total empleador» en minúsculas.
const ROSALES_Q2_08_COMPLETO = `ECHEGARAY CONSTRUCCIONES S.A.S.
C.U.I.T.: 30-71630464-3
8 2026 ROSALES DIEGO JOSE 26 6.348,00 317.400,00 20-35850878-3
CATEGORÍA LABORAL SECCIÓN MODALIDAD DE CONTRATACION
OFICIAL INGENIERIA Y PRODUCCION Personal de la Construcción L 22250
OS SUP IND METALM RA ADMISTRACION CENTRAL, 31/08/2026 SEGUNDA QUINCENA 08/2026
COSTO TOTAL EMPLEADOR $ 483.734,06
CONCEPTO UNIDAD BASE MONTO
5010 CONTRIBUCION JUBILACION $ 33.806,83
5020 CONTRIBUCION LEY 19032 $ 4.990,98
5030 CONTRIB ASIGN FAMILIARES $ 14.753,21
5040 CONTRIBUCION FONDO DE EMPLEO $ 2.950,64
5050 CONTRIBUCION OBRA SOCIAL $ 16.187,40
5051 CONTRIBUCION OBRA SOCIAL (Art. 92 ter. LCT) $ 12.302,42
5150 CONTRIBUCION ANSSAL $ 2.856,60
5151 CONTRIBUCION ANSSAL (Art. 92 ter. LCT) $ 2.171,02
5250 CONTRIBUCION PORCENTUAL ART $ 44.150,34
5400 CONTRIB SEGURO DE VIDA OBLIG $ 424,62
5485 CONT.FONDO DESEMPLEO UOCRA $ 25.392,00
COSTO DERIVADO DE CCT
5480 CONTRIBUCION EMPRESARIA UOCRA $ 6.348,00
SUB TOTAL CONTRIBUCIONES EMPLEADOR $ 166.334,06
SUELDO BRUTO $ 317.400,00
CONCEPTO UNIDAD BASE MONTO
REMUNERATIVO
0401 BASICO HS NORMALES 45 $ 6.348,00 $ 285.660,00
0425 ASISTENCIA PERFECTA (ART. 52 CCT) $ 57.132,00
0426 AJUSTE COD.0425 (INASIST. Y/O TARD.) $ -57.132,00
0431 HORAS FERIADO 5 $ 6.348,00 $ 31.740,00
NO REMUNERATIVO
DESCUENTOS
4010 JUBILACION $ 34.914,00
4020 LEY 19032 $ 9.522,00
4050 OBRA SOCIAL $ 8.093,70
4150 ANSSAL $ 1.428,30
4170 APORTE ADICIONAL OS (Art.92 ter. LCT) $ 6.151,21
4175 APORTE ADIC ANSSAL (ART. 92 Ter. LCT) $ 1.085,51
4285 APORTE SOLIDARIO EXT.UOCRA $ 6.348,00
4287 SEGURO DE VIDA UOCRA $ 19.617,16
COMPOSICIÓN SALARIAL: Remunerativo: $ 317.400,00 No Remunerativo: $ 0,00 Descuentos: $ 87.159,88
SUELDO NETO $ 230.240,12
Detalle de la composición salarial Costo total empleador
Total Costo Seg. Social $ 86.424,68 Total costo ART $ 44.150,34 Total costo Otros rubros $ 25.392,00`

test('Rosales Q2-08 completo: costo empleador del recibo, y bruto/neto intactos', () => {
  const r = parsearRecibo(ROSALES_Q2_08_COMPLETO)
  assert.equal(r.ok, true, r.error)
  assert.deepEqual(r.fila, {
    cuil: '20358508783', periodo: 'Q2-08/2026', categoria: 'OFICIAL', valor_hora: 6348,
    horas_normales: 45, horas_feriado: 5, horas_otras: 0, horas_blanco: 50,
    bruto: 317400, descuentos: 87159.88, neto: 230240.12,
    contribuciones_empleador: 166334.06, costo_total_empleador: 483734.06,
    fondo_cese: 25392, art: 44150.34, contribucion_uocra: 6348,
  })
  assert.deepEqual(r.avisos, [])
})

test('invariante bruto + contribuciones = costo total: tolera $0,02, rechaza más', () => {
  const dentro = parsearRecibo(ROSALES_Q2_08_COMPLETO.replace('EMPLEADOR $ 483.734,06', 'EMPLEADOR $ 483.734,08'))
  assert.equal(dentro.ok, true, dentro.error)
  const fuera = parsearRecibo(ROSALES_Q2_08_COMPLETO.replace('EMPLEADOR $ 483.734,06', 'EMPLEADOR $ 483.734,09'))
  assert.equal(fuera.ok, false)
  assert.match(fuera.error, /costo total empleador/)
})

test('un subtotal que no es la suma del detalle 5xxx: error (lo que haría leer un 4xxx como contribución)', () => {
  const r = parsearRecibo(ROSALES_Q2_08_COMPLETO.replace('5400 CONTRIB SEGURO DE VIDA OBLIG $ 424,62\n', ''))
  assert.equal(r.ok, false)
  assert.match(r.error, /5xxx suman/)
})

test('sección a medias (costo total sin subtotal): error, no un costo completado', () => {
  const r = parsearRecibo(ROSALES_Q2_08_COMPLETO.replace(/SUB TOTAL CONTRIBUCIONES EMPLEADOR.*$/m, ''))
  assert.equal(r.ok, false)
  assert.match(r.error, /incompleto/)
})

test('formato viejo: «Contribuciones Patronales» no se toma como costo empleador, y se lee una vez', () => {
  const r = parsearRecibo(REDONDEO_Q2_05)
  assert.equal(r.ok, true, r.error)
  for (const k of Object.keys(SIN_COSTO)) assert.equal(r.fila[k], null, k)
  assert.equal(r.avisos.length, 1)
  assert.match(r.avisos[0], /Contribuciones Patronales: 246\.473,94»/)
})

// Recorte real de Maldonado Q1-01/2026 (1w5EqFMH7esXJ25l9C5YPmDucPuOdCFDW): no trae ninguna contribución.
const MALDONADO_Q1_01 = `20-35923266-8 20-35923266-8
CATEGORÍA CATEGORÍA
OFICIAL ESPECIALIZADO OFICIAL ESPECIALIZADO
PRIMERA QUINCENA 01/2026 PRIMERA QUINCENA 01/2026
0401 BASICO HS NORMALES 76 408.348,00
0401 BASICO HS NORMALES 76 408.348,00
0425 ASISTENCIA PERFECTA (ART. 52 CCT) 81.669,60 0425 ASISTENCIA PERFECTA (ART. 52 CCT) 81.669,60
0477 VACACIONES JORNAL 4 107.460,00 0477 VACACIONES JORNAL 4 107.460,00
0490 BONO EXTRAORDINARIO NR 60.900,00 0490 BONO EXTRAORDINARIO NR 60.900,00
4010 JUBILACION 65.722,54 4010 JUBILACION 65.722,54
4020 LEY 19032 17.924,33 4020 LEY 19032 17.924,33
4050 OBRA SOCIAL 16.788,63 4050 OBRA SOCIAL 16.788,63
4150 ANSSAL 2.962,70 4150 ANSSAL 2.962,70
597.477,60 60.900,00
597.477,60 60.900,00 103.398,20 103.398,20
LUGAR Y FECHA DE PAGO 554.979,40 554.979,40
FORMA DE TOTAL NETO → FORMA DE
5.373,00 6 5.373,00 6`

test('recibo sin la sección: costo empleador null con aviso, nunca 0', () => {
  const r = parsearRecibo(MALDONADO_Q1_01)
  assert.equal(r.ok, true, r.error)
  assert.equal(r.fila.neto, 554979.4)
  for (const k of Object.keys(SIN_COSTO)) assert.equal(r.fila[k], null, k)
  assert.deepEqual(r.avisos, ['sin costo empleador: el recibo no trae la sección (queda null)'])
})
