// CADA TEST NOMBRA EL DEFECTO QUE SE PONE ROJO SI SE REVIERTE EL ARREGLO.
//
// Lo que este núcleo produce multiplica las horas de trece obras. Un error no se ve: sale un número
// plausible. Por eso se prueba con las declaraciones REALES de 2026 —los importes de abajo son los
// que leen `parseF931` y `leerUocra` de los PDF de Drive— y no con números redondos inventados.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alicuotasDerivadas, boletaVigente, COTAS, declaradoDeLaVentana } from './costo-hora-derivado.mjs'

const f931 = (periodo, rem, c) => ({ periodo, remuneracion: rem, conceptos: c })

// Las tres DDJJ F931 reales de jun–ago 2026, al centavo.
const F931 = [
  f931('2026-06', 18280839.75, { aportes_ss: 2682844.79, aportes_os: 699987.65, contrib_ss: 4408245.79, contrib_os: 1399975.29, lrt: 2750458.70, scvo: 9341.64 }),
  f931('2026-07', 12302727.16, { aportes_ss: 1813160.67, aportes_os: 514413.68, contrib_ss: 2954527.74, contrib_os: 1028827.34, lrt: 1915895.51, scvo: 8917.02 }),
  f931('2026-08', 12903936.80, { aportes_ss: 1893065.78, aportes_os: 490249.33, contrib_ss: 3115555.03, contrib_os: 980498.68, lrt: 1842562.61, scvo: 9766.26 }),
]

const UOCRA = [
  { periodo: '2026-06', tipo_boleta: 'Original', remuneraciones: 18280839.75, seguro_vida: 387724.92, fondo_cese_devengado: 1482692.40, total_determinado: 782995.57 },
  { periodo: '2026-07', tipo_boleta: 'Original', remuneraciones: 12302727.16, seguro_vida: 377503.14, fondo_cese_devengado: 1319119.20, total_determinado: 649940.06 },
  { periodo: '2026-07', tipo_boleta: 'Rectificativa', remuneraciones: 12302727.16, seguro_vida: 377503.14, fondo_cese_devengado: 1319119.20, total_determinado: 1261611.38 },
  { periodo: '2026-08', tipo_boleta: 'Original', remuneraciones: 12903936.80, seguro_vida: 451194.68, fondo_cese_devengado: 1379455.92, total_determinado: 994941.26 },
]

const PERIODOS = ['2026-06', '2026-07', '2026-08']
const cerca = (a, b, tol = 0.0001) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`)

// ═══ EL DEFECTO MÁS CARO DE LA CARPETA DE UOCRA ═══
//
// «2026-07 UOCRA.pdf» y «2026-07 UOCRA (R).pdf» son el MISMO período. Sumar las dos duplica el Fondo
// de Cese de julio ($1,32 M de más) y agrega $612 k de aportes que nunca existieron. Y quedarse con
// la original esconde los $611.671,32 de «otros conceptos» que la rectificativa agregó.
test('de dos boletas del mismo período vale la rectificativa, y la otra NO se suma', () => {
  const m = boletaVigente(UOCRA)
  assert.equal(m.size, 3)
  assert.equal(m.get('2026-07').tipo_boleta, 'Rectificativa')
  assert.equal(m.get('2026-07').total_determinado, 1261611.38)
})

test('la rectificativa gana venga antes o después en la lista', () => {
  const alReves = [...UOCRA].reverse()
  assert.equal(boletaVigente(alReves).get('2026-07').tipo_boleta, 'Rectificativa')
})

test('un período sin rectificativa se queda con su original', () => {
  assert.equal(boletaVigente(UOCRA).get('2026-06').tipo_boleta, 'Original')
})

test('la remuneración declarada de la ventana es la suma de las tres DDJJ', () => {
  const d = declaradoDeLaVentana(F931, UOCRA, PERIODOS)
  assert.deepEqual(d.faltan, [])
  cerca(d.remuneracionDeclarada, 43487503.71, 0.01)
})

// ═══ LOS APORTES DEL TRABAJADOR VAN ADENTRO DE `cargas_sociales` ═══
//
// Si se los saca, el multiplicador baja 16 puntos y la hora sale más barata de lo que cuesta: el
// bolsillo es NETO de esas retenciones, así que la empresa las paga por encima del bolsillo.
test('cargas_sociales lleva aportes + contribuciones + el resto de la boleta de UOCRA', () => {
  const d = declaradoDeLaVentana(F931, UOCRA, PERIODOS)
  const aportes = 8093721.90   // 301 (6.389.071,24) + 302 (1.704.650,66)
  const contribuciones = 13887629.87
  const uocraResto = 3039548.21 - 1216422.74
  cerca(d.componentes.aportes, aportes, 0.01)
  cerca(d.componentes.contribuciones, contribuciones, 0.01)
  cerca(d.porConcepto.cargas_sociales, aportes + contribuciones + uocraResto, 0.01)
})

test('el seguro de vida junta el 028 del F931 y el de la boleta de UOCRA, sin mezclarse con cargas', () => {
  const d = declaradoDeLaVentana(F931, UOCRA, PERIODOS)
  cerca(d.porConcepto.seguro_vida_sepelio, 28024.92 + 1216422.74, 0.01)
})

// LA PLATA DE UOCRA SE REPARTE, NO SE DUPLICA: el total determinado tiene que quedar enteramente
// distribuido entre `cargas_sociales` y `seguro_vida_sepelio`, ni un peso más ni uno menos.
test('el total determinado de UOCRA queda repartido exacto entre dos conceptos', () => {
  const d = declaradoDeLaVentana(F931, UOCRA, PERIODOS)
  const enCargas = d.porConcepto.cargas_sociales - d.componentes.aportes - d.componentes.contribuciones
  const enSeguro = d.porConcepto.seguro_vida_sepelio - d.componentes.scvo
  cerca(enCargas + enSeguro, d.componentes.uocraTotal, 0.01)
})

// ═══ UN PERÍODO QUE NO SE PUDO LEER NO VALE CERO ═══
//
// Completar con cero bajaría el multiplicador de TODOS los meses y no habría forma de notarlo: el
// resultado seguiría siendo un número. Tiene que frenar la derivación entera.
test('falta una DDJJ → no se deriva nada y se dice cuál falta', () => {
  const d = declaradoDeLaVentana(F931.slice(0, 2), UOCRA, PERIODOS)
  assert.deepEqual(d.faltan, ['F931 2026-08'])
  const r = alicuotasDerivadas({ declarado: d, bolsilloImputado: 46945383, bolsilloPagado: 49718685, rigeDesde: '2026-06-01', etiquetaVentana: 'jun–ago 2026' })
  assert.equal(r.ok, false)
  assert.equal(r.filas.length, 0)
  assert.match(r.motivos[0], /F931 2026-08/)
})

test('falta la boleta de UOCRA de un período → tampoco se deriva', () => {
  const d = declaradoDeLaVentana(F931, UOCRA.filter((u) => u.periodo !== '2026-08'), PERIODOS)
  assert.deepEqual(d.faltan, ['DDJJ UOCRA 2026-08'])
})

test('si las dos DDJJ declaran distinta remuneración, la discrepancia se publica', () => {
  const torcido = UOCRA.map((u) => (u.periodo === '2026-06' ? { ...u, remuneraciones: 18000000 } : u))
  const d = declaradoDeLaVentana(F931, torcido, PERIODOS)
  const f = d.detalle.find((x) => x.periodo === '2026-06')
  cerca(f.discrepanciaRemuneracion, 280839.75, 0.01)
})

// ═══ LAS CINCO FILAS, SOBRE EL BOLSILLO IMPUTADO ═══
test('las cinco filas salen sobre el bolsillo imputado, con base total', () => {
  const d = declaradoDeLaVentana(F931, UOCRA, PERIODOS)
  const r = alicuotasDerivadas({
    declarado: d, bolsilloImputado: 46945383, bolsilloPagado: 49718685,
    rigeDesde: '2026-06-01', etiquetaVentana: 'jun–ago 2026',
  })
  assert.equal(r.ok, true)
  assert.deepEqual(r.filas.map((f) => f.concepto).sort(),
    ['art', 'cargas_sociales', 'fondo_cese', 'no_trabajado_pago', 'seguro_vida_sepelio'])
  for (const f of r.filas) {
    assert.equal(f.base, 'total', `${f.concepto} tiene que pesar sobre todo lo pagado`)
    assert.equal(f.desde, '2026-06-01')
    assert.ok(f.fuente.includes('bolsillo imputado'), 'la fuente tiene que decir contra qué se midió')
  }
  // El multiplicador es 1 + Σ: la misma cuenta que hace `multiplicador_de_costo` en SQL con p = 1.
  cerca(r.multiplicador, 1 + r.filas.reduce((s, f) => s + f.porcentaje / 100, 0))
})

// `no_trabajado_pago` ES LA PARTE DEL BOLSILLO QUE NINGUNA OBRA RECIBIÓ. Si se calculara sobre el
// bolsillo PAGADO en vez del imputado, la fórmula —que multiplica el imputado— devolvería menos que
// el costo real, y la diferencia crece con el porcentaje de horas no imputadas.
test('no_trabajado_pago es la brecha pagado−imputado sobre el imputado', () => {
  const d = declaradoDeLaVentana(F931, UOCRA, PERIODOS)
  const r = alicuotasDerivadas({ declarado: d, bolsilloImputado: 1000, bolsilloPagado: 1100, rigeDesde: '2026-06-01', etiquetaVentana: 'v' })
  const f = r.filas.find((x) => x.concepto === 'no_trabajado_pago')
  cerca(f.porcentaje, 10)
})

test('sin brecha de horas, no_trabajado_pago es 0 % y la fila entra igual', () => {
  const d = declaradoDeLaVentana(F931, UOCRA, PERIODOS)
  const r = alicuotasDerivadas({ declarado: d, bolsilloImputado: 46945383, bolsilloPagado: 46945383, rigeDesde: '2026-06-01', etiquetaVentana: 'v' })
  const f = r.filas.find((x) => x.concepto === 'no_trabajado_pago')
  assert.equal(f.porcentaje, 0)
})

// ═══ LAS DOS FUENTES TIENEN QUE CERRAR ═══
//
// Imputar más bolsillo del que se pagó es imposible. Recortar a cero taparía que las horas y la
// liquidación no hablan de la misma gente o del mismo período.
test('imputado mayor que pagado frena la derivación', () => {
  const d = declaradoDeLaVentana(F931, UOCRA, PERIODOS)
  const r = alicuotasDerivadas({ declarado: d, bolsilloImputado: 100, bolsilloPagado: 90, rigeDesde: '2026-06-01', etiquetaVentana: 'v' })
  assert.equal(r.ok, false)
  assert.match(r.motivos.join(' '), /no cierran/)
})

test('sin denominador no hay alícuota', () => {
  const d = declaradoDeLaVentana(F931, UOCRA, PERIODOS)
  const r = alicuotasDerivadas({ declarado: d, bolsilloImputado: 0, bolsilloPagado: 0, rigeDesde: '2026-06-01', etiquetaVentana: 'v' })
  assert.equal(r.ok, false)
  assert.match(r.motivos.join(' '), /denominador/)
})

// ═══ EL CHEQUEO QUE PUEDE DECIR QUE NO ═══
//
// Un control que no puede dar rojo no es un control. La ventana equivocada —el acumulado de ocho
// meses contra un bolsillo de una quincena— es el error más probable y el que más se parece a un
// número correcto.
test('una ventana mal armada cruza la cota y NO se carga', () => {
  const d = declaradoDeLaVentana(F931, UOCRA, PERIODOS)
  const r = alicuotasDerivadas({ declarado: d, bolsilloImputado: 8000000, bolsilloPagado: 8200000, rigeDesde: '2026-06-01', etiquetaVentana: 'v' })
  assert.equal(r.ok, false)
  assert.ok(r.motivos.length > 0)
  assert.match(r.motivos.join(' '), /CHECK|error de unidad/)
})

test('la cota por concepto frena una remuneración declarada absurdamente chica', () => {
  const chico = F931.map((f) => ({ ...f, remuneracion: f.remuneracion / 100 }))
  const d = declaradoDeLaVentana(chico, UOCRA.map((u) => ({ ...u, remuneraciones: u.remuneraciones / 100 })), PERIODOS)
  const r = alicuotasDerivadas({ declarado: d, bolsilloImputado: 46945383, bolsilloPagado: 49718685, rigeDesde: '2026-06-01', etiquetaVentana: 'v' })
  assert.equal(r.ok, false)
  assert.match(r.motivos.join(' '), /error de unidad o de ventana/)
})

test('la razonabilidad se mide sobre el bruto declarado y excluye los aportes', () => {
  const d = declaradoDeLaVentana(F931, UOCRA, PERIODOS)
  const r = alicuotasDerivadas({ declarado: d, bolsilloImputado: 46945383, bolsilloPagado: 49718685, rigeDesde: '2026-06-01', etiquetaVentana: 'v' })
  const rem = 43487503.71
  const esperado = 1 + (13887629.87 + 6508916.82 + 28024.92 + 4181267.52 + 3039548.21) / rem
  cerca(r.razonabilidad.costoSobreDeclarado, esperado, 0.0001)
  assert.ok(r.razonabilidad.costoSobreDeclarado > COTAS.minCostoSobreDeclarado)
  assert.ok(r.razonabilidad.costoSobreDeclarado < COTAS.maxCostoSobreDeclarado)
})
