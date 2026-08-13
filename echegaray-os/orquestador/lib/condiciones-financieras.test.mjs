import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costoEfectivo, paramsParaMotor, registrarCondicion, advertenciaDeComparabilidad } from './condiciones-financieras.mjs'

// El descubierto REAL: es la única condición cargada con TNA, IVA y CFT los tres. Por eso es la única
// que puede declarar un costo TOTAL. El fixture llevaba el CFT afuera y hacía parecer que un costo sin
// CFT también era total.
const DESCUBIERTO = {
  id: 1, entidad: 'Banco Santander', producto: 'Acuerdo N°00007', tipo_financiacion: 'descubierto',
  tna: 0.55, iva_sobre_intereses: 0.12, cft: 0.6278, limite_disponible: 18200000, saldo_utilizado: 0,
  nivel_confianza: 'verificado', fuente: 'extracto',
}

test('costoEfectivo del descubierto: intereses + IVA, y el efectivo anual sale del CFT real', () => {
  const r = costoEfectivo(DESCUBIERTO, { monto: 1000000, dias: 30 })
  // interés = 1.000.000 × (0,55/365) × 30 = 45.205; IVA 12% = 5.425; total ≈ 50.630
  assert.equal(r.intereses, 45205)
  assert.equal(r.iva, 5425)
  assert.equal(r.costo_total, 50630)
  assert.equal(r.falta.length, 0)
  // Es la ÚNICA que puede llamarse total: TNA, IVA y CFT los tres cargados.
  assert.equal(r.completitud, 'total')
  assert.equal(r.es_piso, false)
  // efectivo anual ≈ 50.630/1.000.000/30 × 365 ≈ 0,616 (coherente con el CFT ~62%)
  assert.ok(r.costo_efectivo_anual > 0.6 && r.costo_efectivo_anual < 0.63)
})

test('sin TNA, una línea de financiación NO inventa el costo: lo dice y apunta a la fuente', () => {
  const r = costoEfectivo(
    { entidad: 'Santander', producto: 'Préstamo prendario', tipo_financiacion: 'prestamo', tna: null, observaciones: 'está en el contrato' },
    { monto: 1000000, dias: 30 })
  assert.equal(r.costo_total, null)
  assert.equal(r.completitud, 'sin_dato')
  // Antes decía exactamente ['tna'] y callaba el resto. Sin tasa TAMPOCO se sabe el IVA ni el CFT.
  assert.ok(r.falta.includes('tna'))
  assert.deepEqual(r.falta, ['tna', 'iva_sobre_intereses', 'cft'])
  assert.match(r.para_conseguirlo, /contrato/)
})

test('un impuesto (Ley 25.413) no necesita TNA: no se marca como faltante', () => {
  const r = costoEfectivo(
    { entidad: 'ARCA', producto: 'Ley 25.413', tipo_financiacion: 'impuesto', tna: null, cft: 0.006 },
    { monto: 1000000, dias: 1 })
  assert.equal(r.falta.length, 0)
})

// ═══ EL DEFECTO DE MÉTODO (13/08, auditoría) ═══
// `falta` sólo reclamaba la TNA. Todo lo demás desconocido valía CERO y el objeto decía `falta: []`,
// que es la afirmación "no falta nada". No era un problema de FONDEFIN: la tarjeta (sin CFT) y el
// prendario (sin IVA) publicaban el mismo silencio, y viajaban en el mismo array que el descubierto.
test('sin CFT publicado, lo que sale NO es un total: es un piso, y el objeto lo dice', () => {
  const sinCft = costoEfectivo({ ...DESCUBIERTO, cft: null }, { monto: 1000000, dias: 30 })
  assert.equal(sinCft.completitud, 'piso')
  assert.equal(sinCft.es_piso, true)
  assert.deepEqual(sinCft.falta, ['cft'])
  // El número no cambia: cambia lo que declara ser.
  assert.equal(sinCft.costo_total, 50630)
})

test('un IVA desconocido NO es un IVA cero: vuelve null y entra en falta', () => {
  // El prendario real: CFTEA 65,10% verificado pero iva_sobre_intereses sin cargar. Con el IVA en 0
  // el costo salía 21% más barato de lo posible, sin una palabra.
  const prendario = {
    entidad: 'Banco Santander', producto: 'Préstamo prendario', tipo_financiacion: 'prestamo',
    tna: 0.389, cft: 0.651, iva_sobre_intereses: null, observaciones: 'pedir el resumen',
  }
  const r = costoEfectivo(prendario, { monto: 1000000, dias: 365 })
  assert.equal(r.iva, null, 'un IVA que no se conoce no se informa como 0')
  assert.deepEqual(r.falta, ['iva_sobre_intereses'])
  assert.equal(r.completitud, 'piso')
  assert.equal(r.costo_total, 389000) // el piso: sólo intereses
  // Con el IVA declarado (aunque sea 0 explícito) la línea deja de estar incompleta por ese motivo.
  const conIvaCero = costoEfectivo({ ...prendario, iva_sobre_intereses: 0 }, { monto: 1000000, dias: 365 })
  assert.equal(conIvaCero.iva, 0)
  assert.equal(conIvaCero.falta.length, 0)
  assert.equal(conIvaCero.completitud, 'total')
})

test('la advertencia de comparabilidad aparece SÓLO cuando hay algo que advertir', () => {
  const total = costoEfectivo(DESCUBIERTO, { monto: 1000000, dias: 30 })
  const piso = costoEfectivo({ ...DESCUBIERTO, entidad: 'Fiduciaria San Juan SAPEM', producto: 'FONDEFIN', tipo_financiacion: 'prestamo', cft: null, iva_sobre_intereses: null }, { monto: 1000000, dias: 30 })
  // Todo completo → sin ruido. Una advertencia que sale siempre deja de leerse.
  assert.equal(advertenciaDeComparabilidad([total]), null)
  assert.equal(advertenciaDeComparabilidad([]), null)

  const a = advertenciaDeComparabilidad([total, piso])
  assert.equal(a.comparables, 1)
  assert.equal(a.incompletas.length, 1)
  assert.equal(a.incompletas[0].producto, 'FONDEFIN')
  assert.deepEqual(a.incompletas[0].falta, ['iva_sobre_intereses', 'cft'])
  assert.match(a.advertencia, /NO SON COMPARABLES ENTRE SÍ/)
  assert.match(a.advertencia, /1 de 2/)
})

test('paramsParaMotor: el descubierto aporta el límite disponible neto del saldo usado', () => {
  const { params } = paramsParaMotor([{ ...DESCUBIERTO, saldo_utilizado: 2000000 }])
  assert.equal(params.limiteDescubiertoDisp, 16200000)
})

test('paramsParaMotor: una tasa conocida se pasa; una que falta se lista para conseguir, no se inventa', () => {
  const { params, faltan } = paramsParaMotor([
    DESCUBIERTO,
    { entidad: 'X', producto: 'Descuento de cheques', tipo_financiacion: 'descuento_cheque', tna: 0.60 },
    { entidad: 'Santander', producto: 'Préstamo prendario', tipo_financiacion: 'prestamo', tna: null, observaciones: 'pedir liquidación' },
  ])
  assert.equal(params.tasaDescuentoChequeTNA, 0.60)
  assert.equal(params.tasaPrestamoTNA, undefined) // no se conoce → no se pasa
  assert.ok(faltan.some((f) => f.tipo === 'prestamo' && /liquidaci/.test(f.para_conseguirlo)))
})

test('un préstamo YA DESEMBOLSADO (sin línea disponible) no se ofrece como financiación nueva, aunque tenga tasa', () => {
  // El prendario real: tasa verificada 38,9% pero limite_disponible 0 (capital ya acreditado, cuotas
  // en curso). Se registra, pero el motor NO debe ofrecerlo para cubrir un bache: no se puede tomar.
  const { params, faltan } = paramsParaMotor([
    { entidad: 'Santander', producto: 'Prendario Ranger', tipo_financiacion: 'prestamo', tna: 0.389, limite_disponible: 0 },
  ])
  assert.equal(params.tasaPrestamoTNA, undefined) // no se ofrece
  assert.equal(faltan.length, 0) // tampoco es un "faltante de dato": la tasa está, sólo que no es una línea
})

test('un préstamo con LÍNEA disponible sí se ofrece como financiación nueva', () => {
  const { params } = paramsParaMotor([
    { entidad: 'X', producto: 'Línea', tipo_financiacion: 'prestamo', tna: 0.5, limite_disponible: 10000000 },
  ])
  assert.equal(params.tasaPrestamoTNA, 0.5)
})

test('registrarCondicion exige fuente: no se carga una tasa sin decir de dónde salió', async () => {
  const r = await registrarCondicion({ query: async () => ({ rows: [] }) },
    { entidad: 'X', producto: 'Y', tipo_financiacion: 'prestamo', tna: 0.7 }) // sin fuente
  assert.equal(r.ok, false)
  assert.match(r.motivo, /fuente/)
})

test('registrarCondicion con fuente hace upsert (no rompe el proceso ante error de DB)', async () => {
  let sql = ''
  const ok = await registrarCondicion({ query: async (q) => { sql = q; return { rows: [] } } },
    { entidad: 'X', producto: 'Y', tipo_financiacion: 'prestamo', tna: 0.7, fuente: 'contrato 2026' })
  assert.equal(ok.ok, true)
  assert.match(sql, /on conflict/)
})
