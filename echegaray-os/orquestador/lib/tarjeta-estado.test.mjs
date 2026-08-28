// "¿YA SE PAGÓ?" TIENE QUE PODER CONTESTAR QUE NO.
//
// Un estado de pago que siempre dice "al día" es exactamente igual de útil que no tenerlo, y más
// peligroso: se mira, se cree y no se paga. Cada test de acá construye la situación que TIENE que
// dar rojo —vencido sin débito, débito por otro importe, proyección sin evidencia— y verifica que la
// da. La mitad verde está para que el rojo signifique algo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoDePago, historial, proyectarProxima, esPagoDeTarjeta, VENTANA } from './tarjeta-estado.mjs'

const RESUMEN = {
  numero: '202120', cierre: '2026-08-20', vencimiento: '2026-09-01',
  cierreAnterior: '2026-07-23', vencimientoAnterior: '2026-08-03',
  aDebitarPesos: 2208958.42, aDebitarDolares: 544.99, tcCierre: 1497,
  saldoAnteriorPesos: 1090924.47, saldoAnteriorDolares: 193.25, pagoAnteriorTc: 1520,
  proximoCierre: '2026-09-24', proximoVencimiento: '2026-10-05',
  cuotasAVencer: [{ mes: '2026-09-01', importe: 1546611.33 }, { mes: '2026-10-01', importe: 1282797.42 }],
  consumos: [{ comercio: 'ANTHROPIC', pesos: 0, dolares: 544.99 }, { comercio: 'GRUAS SAN BLAS SA', pesos: 854068.6, dolares: 0 }],
}
/** Como los escribe el extracto: negativos, y con el concepto que el banco imprime. */
const deb = (fecha, importe) => ({ fecha, concepto: 'Pago tarjeta de credito visa - Deb. automatico', importe: -importe })

test('el criterio de qué movimiento es un pago de tarjeta es el del importador del banco', () => {
  // No un `like` inventado acá: `clasificarMovimiento` es el único lugar donde se decide.
  assert.equal(esPagoDeTarjeta(deb('2026-09-01', 1)), true)
  assert.equal(esPagoDeTarjeta({ concepto: 'Transferencia a proveedor', importe: -1 }), false)
})

test('todavía no venció: A VENCER, y no dice ni pagado ni impago', () => {
  const e = estadoDePago(RESUMEN, [], { hoy: '2026-08-28' })
  assert.equal(e.estado, 'A VENCER')
  assert.equal(e.hallazgo, null)
  assert.match(e.motivo, /faltan 4 día/)
})

// ═══ EL CASO QUE TIENE QUE DAR ROJO ═══

test('vencido y sin débito en el banco: IMPAGO, con el hallazgo escrito', () => {
  const e = estadoDePago(RESUMEN, [], { hoy: '2026-09-30' })
  assert.equal(e.estado, 'IMPAGO')
  assert.match(e.hallazgo, /IMPAGO/)
  assert.match(e.hallazgo, /2208958.42/)
})

test('entre el vencimiento y el fin de la ventana NO se inventa una mora', () => {
  // El débito puede estar hecho y el extracto todavía sin importar. Decir IMPAGO ahí sería una
  // alerta falsa, y una alerta falsa es cómo se deja de mirar la verdadera.
  const e = estadoDePago(RESUMEN, [], { hoy: '2026-09-05' })
  assert.equal(e.estado, 'A VENCER')
  assert.equal(e.ventana.hasta, '2026-09-11')
  assert.equal(VENTANA.despues, 10)
})

test('con débito exacto: PAGADO y concilia', () => {
  const sinDolares = { ...RESUMEN, aDebitarDolares: 0 }
  const e = estadoDePago(sinDolares, [deb('2026-09-01', 2208958.42)], { hoy: '2026-09-05' })
  assert.equal(e.estado, 'PAGADO')
  assert.equal(e.concilia, true)
  assert.equal(e.hallazgo, null)
  assert.equal(e.debitos[0].fecha, '2026-09-01')
})

// ═══ EL DÉBITO EN PESOS NO TIENE POR QUÉ SER IGUAL AL TOTAL EN PESOS ═══

test('el débito incluye el saldo en dólares convertido, y eso se explica, no se ignora', () => {
  // 2.208.958,42 + 544,99 × 1.500 = 3.026.443,42. El TC implícito (1.500) está a un 0,2% del TC del
  // cierre deducido de la percepción (1.497): entra en la banda y concilia, mostrando el TC.
  const e = estadoDePago(RESUMEN, [deb('2026-09-01', 3026443.42)], { hoy: '2026-09-05' })
  assert.equal(e.estado, 'PAGADO')
  assert.equal(e.concilia, true)
  assert.equal(e.tcImplicito, 1500)
  assert.equal(e.hallazgo, null)
})

test('un débito que NO se explica ni con el dólar del cierre GRITA: no concilia por redondeo', () => {
  // $500.000 de más. Daría 917 por dólar contra 1.497 del cierre: fuera de la banda.
  const e = estadoDePago(RESUMEN, [deb('2026-09-01', 2708958.42)], { hoy: '2026-09-05' })
  assert.equal(e.estado, 'PAGADO', 'el débito existe: negarlo sería otra mentira')
  assert.equal(e.concilia, false)
  assert.match(e.hallazgo, /no se explica/)
  assert.match(e.hallazgo, /1497/)
})

test('sin dólares en juego, un peso de diferencia ya es un hallazgo', () => {
  const sinDolares = { ...RESUMEN, aDebitarDolares: 0 }
  const e = estadoDePago(sinDolares, [deb('2026-09-01', 2308958.42)], { hoy: '2026-09-05' })
  assert.equal(e.concilia, false)
  assert.match(e.hallazgo, /diferencia de \$100000/)
})

test('un débito de otro mes no cuenta como pago de este resumen', () => {
  // El del 03/08 pagó el resumen ANTERIOR. Sin ventana, cualquier pago de tarjeta del año haría
  // pasar por pagado al que vence.
  const e = estadoDePago(RESUMEN, [deb('2026-08-03', 1384664.47)], { hoy: '2026-09-30' })
  assert.equal(e.estado, 'IMPAGO')
})

// ═══ EL HISTORIAL Y LA FILA QUE SE DEDUCE ═══

test('el historial agrega el período anterior deducido del saldo anterior, rotulado INFERENCIA', () => {
  const h = historial([RESUMEN], [deb('2026-08-03', 1384664.47)], { hoy: '2026-08-28' })
  assert.equal(h.length, 2)
  assert.equal(h[0].procedencia, 'HECHO')
  assert.equal(h[0].estado, 'A VENCER')
  assert.equal(h[1].procedencia, 'INFERENCIA')
  assert.equal(h[1].cierre, '2026-07-23')
  assert.equal(h[1].pesos, 1090924.47)
  // Y su pago se prueba igual contra el banco: 1.090.924,47 + 193,25 × 1.520 = 1.384.664,47.
  assert.equal(h[1].estado, 'PAGADO')
  assert.equal(h[1].concilia, true)
  assert.equal(h[1].tcImplicito, 1520)
})

test('si el banco hubiera debitado otra cosa, la fila inferida también grita', () => {
  const h = historial([RESUMEN], [deb('2026-08-03', 900000)], { hoy: '2026-08-28' })
  assert.equal(h[1].concilia, false)
  assert.ok(h[1].hallazgo)
})

// ═══ LA PROYECCIÓN: CUÁNTO SABE Y CUÁNTO NO ═══

test('con UN resumen, el piso son las cuotas comprometidas y la recurrencia queda DECLARADA como hueco', () => {
  const p = proyectarProxima([RESUMEN])
  assert.equal(p.piso, 1546611.33)
  assert.equal(p.componentes.length, 1)
  assert.equal(p.componentes[0].procedencia, 'HECHO')
  assert.match(p.componentes[0].evidencia, /Cuotas a vencer/)
  // Lo que NO se sabe se dice, y no se rellena con un número: los dólares del período se nombran
  // como observación aislada, fuera del piso.
  // Y SE ESCRIBEN CORTOS: van a la pestaña, y un párrafo en el medio de la grilla desparrama la
  // fila (lo mide `auditarPatron`). El argumento largo vive en el informe del importador.
  assert.ok(p.huecos.some((h) => /recurrencia observable/.test(h)))
  assert.ok(p.huecos.some((h) => /período en curso/.test(h)))
  for (const h of p.huecos) assert.ok(h.length <= 60, h)
})

test('un consumo observado UNA vez no entra en el piso: eso sería inventar plata', () => {
  const p = proyectarProxima([RESUMEN])
  assert.equal(p.componentes.filter((c) => c.procedencia === 'ESTIMADO').length, 0)
  assert.equal(p.piso, p.componentes.filter((c) => c.procedencia === 'HECHO').reduce((s, c) => s + c.importe, 0))
})

test('con DOS resúmenes, un comercio que se repite pasa a ESTIMADO, con las veces contadas', () => {
  const julio = {
    ...RESUMEN, numero: '201900', cierre: '2026-07-23', vencimiento: '2026-08-03',
    consumos: [{ comercio: 'ANTHROPIC', pesos: 0, dolares: 400 }],
    cuotasAVencer: [{ mes: '2026-08-01', importe: 965863.52 }],
  }
  const p = proyectarProxima([RESUMEN, julio])
  // El piso sigue saliendo del resumen MÁS NUEVO: la tabla de cuotas del viejo ya se facturó.
  assert.equal(p.piso, 1546611.33)
  const est = p.componentes.filter((c) => c.procedencia === 'ESTIMADO')
  assert.equal(est.length, 1)
  assert.equal(est[0].moneda, 'USD')
  assert.equal(est[0].importe, 472.5, 'el promedio de las dos observaciones, no la última')
  assert.match(est[0].evidencia, /observado en 2 resúmenes/)
})

test('sin ningún resumen cargado no se devuelve un cero: se devuelve el hueco', () => {
  const p = proyectarProxima([])
  assert.equal(p.piso, 0)
  assert.deepEqual(p.componentes, [])
  assert.deepEqual(p.huecos, ['no hay ningún resumen cargado'])
})
