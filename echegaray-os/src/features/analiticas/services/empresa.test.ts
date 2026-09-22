import test from 'node:test'
import assert from 'node:assert/strict'
import { bandasDeCobranza, caja, cifrasCobranza, cobranza, destinoDe, legajos, leerEgresos, ubicarCirculos, ZONAS_COBRANZA, zonaDeTramo } from './empresa.ts'

test('caja: a una obra, estructura por rama y sin destino; los meses separan las dos líneas', () => {
  const e = leerEgresos([
    { area: 'obras', total: '100', fecha: '2026-08-03' },
    { area: 'personas', total: '40', fecha: '2026-08-10' },
    { area: 'contabilidad_legales', total: '10', fecha: '2026-09-01' },
    { area: 'sin_clasificar', total: '5', fecha: '2026-09-02' },
    { area: 'obras', total: null, fecha: '2026-09-02' },
  ])
  const c = caja(e)
  assert.equal(c.salio, 155)
  assert.equal(c.aObra, 100)
  assert.equal(c.estructura, 50)
  assert.equal(c.sinDestino, 5)
  assert.equal(c.nSinDestino, 1)
  assert.equal(c.estructuraPorPesoDeObra, 0.5)
  assert.deepEqual(c.meses, [{ mes: '2026-08', aObra: 100, estructura: 40 }, { mes: '2026-09', aObra: 0, estructura: 10 }])
  assert.equal(destinoDe('area_que_no_existe'), 'sinDestino', 'un área nueva no se esconde en estructura')
})

// LOS DOS TESTS DEL COSTO DE NÓMINA SE FUERON CON `nomina()` (22/09/2026): la vista dejó de medir el
// costo con cargas sociales y pasó a medir lo PAGADO a la gente. Sus reglas —el mes que no vale 0, el
// blanco contra el negro— se prueban ahora en `nominaPagada.test.ts`.

test('legajos por pertenencia: en_la_empresa manda, no la fecha de egreso', () => {
  assert.deepEqual(legajos([
    { en_la_empresa: true, categoria: 'Oficial' }, { en_la_empresa: true, categoria: null },
    { en_la_empresa: false, categoria: 'Ayudante' },
  ]), { plantel: 2, conCategoria: 1, sinCategoria: 1 })
})

test('D4 · saldo y antigüedad de la MISMA fila: el tramo más viejo con plata, sin mirar certificados', () => {
  const filas = cobranza([
    { cliente_id: 'c1', nombre_comercial: 'Messina', saldo: '100', vencido: '0', aging_por_vencer: '100', aging_1_30: '0', aging_31_60: '0', aging_61_90: '0', aging_mas_90: '0' },
    { cliente_id: 'c2', nombre_comercial: 'SF', saldo: '80', vencido: '50', aging_por_vencer: '30', aging_1_30: '0', aging_31_60: '0', aging_61_90: '50', aging_mas_90: '0' },
    { cliente_id: 'c3', nombre_comercial: 'Sin fecha', saldo: '20', vencido: '0', aging_por_vencer: '0', aging_1_30: '0', aging_31_60: '0', aging_61_90: '0', aging_mas_90: '0' },
    { cliente_id: 'c4', nombre_comercial: 'Cero', saldo: '0', vencido: '0' },
  ])
  assert.equal(filas.length, 3, 'saldo cero no es cliente por cobrar')
  assert.equal(filas[0].tramo, 'por_vencer')
  assert.equal(filas[1].tramo, 'd61_90')
  assert.equal(filas[1].estado, 'vencido')
  assert.equal(filas[2].tramo, null, 'saldo sin fecha de cobro: no se inventa una antigüedad')
  assert.deepEqual(cifrasCobranza(filas), { porCobrar: 200, masDe60: 50, alDia: 130 })
})

const filaCC = { cliente_id: 'c1', nombre_comercial: 'Messina', saldo: '100', vencido: '0', aging_por_vencer: '100' }
const doc = (x: Record<string, unknown>) => ({ id: '1', cliente_id: 'c1', estado: 'Pendiente', total_bruto: '100', fecha_emision: '2026-07-01', ...x })

test('D10 · la acción del día es la de planDeCobranza: documentos sólo a más de 30 días NO dicen «Programar aviso»', () => {
  // Vence en 45 días: la ficha no lo avisa todavía. La regla vieja («por vencer → aviso») sí lo decía.
  const lejos = cobranza([filaCC], [doc({ fecha_cobro: '2026-11-01' })], '2026-09-17')
  assert.equal(lejos[0].verbo, null)
  assert.equal(lejos[0].evaluado, true)
  // Pendiente vencido hace 45 días: recordatorio, igual que la ficha.
  const vencido = cobranza([filaCC], [doc({ fecha_cobro: '2026-08-03' })], '2026-09-17')
  assert.equal(vencido[0].verbo, 'Enviar recordatorio')
  // Vence en 10 días: aviso.
  assert.equal(cobranza([filaCC], [doc({ fecha_cobro: '2026-09-27' })], '2026-09-17')[0].verbo, 'Programar aviso')
  // Los documentos no cambian saldo ni antigüedad: esos siguen siendo de la cuenta corriente.
  assert.equal(vencido[0].saldo, 100)
  assert.equal(vencido[0].tramo, 'por_vencer')
})

test('D9 · «por vencer» tiene su zona antes del cero y nunca cae dentro de 1–30 días', () => {
  assert.equal(ZONAS_COBRANZA[0].clave, 'por_vencer')
  assert.equal(ZONAS_COBRANZA[0].rotulo, 'Por vencer')
  const pv = zonaDeTramo('por_vencer')
  const d30 = zonaDeTramo('d1_30')
  assert.ok(pv.hasta <= d30.desde, 'la zona por vencer termina antes de que empiece 1–30')
  const filas = cobranza([
    filaCC, { ...filaCC, cliente_id: 'c2', nombre_comercial: 'SF', saldo: '90' },
    { cliente_id: 'c3', nombre_comercial: 'AR', saldo: '50', vencido: '50', aging_1_30: '50' },
  ])
  const c = ubicarCirculos(filas)
  for (const x of c.filter((k) => k.clienteId !== 'c3')) assert.ok(x.x > pv.desde && x.x < pv.hasta, 'por vencer dibujado fuera de su zona')
  const c3 = c.find((k) => k.clienteId === 'c3')!
  assert.ok(c3.x > d30.desde && c3.x < d30.hasta)
  const [a, b] = c.filter((k) => k.clienteId !== 'c3')
  assert.notEqual(a.y, b.y, 'dos clientes del mismo tramo no se enciman')
})

// D10 (tercera vuelta): la acción del día sale de los documentos de COBRANZAS, no de certificado_cliente.
const fila = (cliente: string, nombre: string, saldo: string) =>
  ({ cliente_id: cliente, nombre_comercial: nombre, saldo, vencido: '0', aging_por_vencer: saldo })

test('D10 (a) · saldo sin certificado y un documento de Cobranzas que vence mañana → «Programar aviso»', () => {
  const [sf] = cobranza([fila('sf', 'San Francisco', '26600000')], [
    { id: 'x1', cliente_id: 'sf', estado: 'Pendiente', fecha_cobro: '2026-09-18', fecha_emision: '2026-08-18', total_bruto: '26600000' },
  ], '2026-09-17')
  assert.equal(sf.verbo, 'Programar aviso')
  assert.equal(sf.evaluado, true)
})

test('D10 (b) · los documentos de un cliente no se cruzan al otro; sin documentos se dice «no evaluado»', () => {
  const filas = cobranza([fila('sf', 'San Francisco', '200'), fila('le', 'La Estrella', '100')], [
    { id: 'x1', cliente_id: 'sf', estado: 'Pendiente', fecha_cobro: '2026-09-18', total_bruto: '200' },
  ], '2026-09-17')
  const sf = filas.find((f) => f.clienteId === 'sf')!
  const le = filas.find((f) => f.clienteId === 'le')!
  assert.equal(sf.verbo, 'Programar aviso')
  assert.equal(le.verbo, null, 'el aviso de San Francisco no puede aparecer en La Estrella')
  assert.equal(le.evaluado, false, 'sin documentos legibles no es «nada pendiente»: no se evaluó')
})

test('la banda de antigüedad de la empresa suma las mismas filas que el «por cobrar»: sin saldo no entra', () => {
  const cuenta = [
    { cliente_id: 'c1', saldo: '100', aging_por_vencer: '100', aging_1_30: '0', aging_31_60: '0', aging_61_90: '0', aging_mas_90: '0' },
    { cliente_id: 'c2', saldo: '80', aging_por_vencer: '30', aging_1_30: '0', aging_31_60: '0', aging_61_90: '50', aging_mas_90: '0' },
    { cliente_id: 'c3', saldo: '0', aging_por_vencer: '999', aging_1_30: '0', aging_31_60: '0', aging_61_90: '0', aging_mas_90: '0' },
  ]
  const b = bandasDeCobranza(cuenta)
  assert.deepEqual(b.map((x) => [x.clave, x.monto]), [['por_vencer', 130], ['d1_30', 0], ['d31_60', 0], ['d61_90', 50], ['d90', 0]])
  assert.equal(b.reduce((a, x) => a + x.monto, 0), cifrasCobranza(cobranza(cuenta)).porCobrar)
})
