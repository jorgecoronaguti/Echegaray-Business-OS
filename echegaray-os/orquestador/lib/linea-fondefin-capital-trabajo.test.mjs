import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FACTOR_BADLAR, BADLAR_REFERENCIA, tnaFondefin, GASTOS_OTORGAMIENTO, MONTO_MAXIMO,
  PLAZO_MAXIMO_DIAS, MATERIALES_DE_OBRA, saldoPromedioImplicito, USO_REAL_DESCUBIERTO,
  ahorroVsDescubierto, condicionConBadlar, CONDICION_FONDEFIN_CAPITAL_TRABAJO,
  NO_SON_COLUMNAS, filaParaLaTabla,
} from './linea-fondefin-capital-trabajo.mjs'
import { CONDICION_FONDEFIN } from './linea-fondefin.mjs'
import { costoEfectivo, paramsParaMotor } from './condiciones-financieras.mjs'
import { ACUERDO } from './banco-santander.mjs'
import { TASAS } from './costo-descubierto.mjs'

// La fila del descubierto tal como vive en condiciones_financieras (seed-condiciones-financieras).
const DESCUBIERTO = {
  entidad: 'Banco Santander', producto: `Acuerdo de descubierto N°${ACUERDO.numero}`,
  tipo_financiacion: 'descubierto', moneda: 'ARS',
  tna: ACUERDO.tna, tea: ACUERDO.tea, cft: ACUERDO.cft,
  iva_sobre_intereses: TASAS.iva + TASAS.percepcion,
  limite_disponible: ACUERDO.importe, nivel_confianza: 'verificado',
}

test('la tasa es una FÓRMULA viva: cambia la Badlar, cambia la ficha', () => {
  assert.equal(FACTOR_BADLAR, 0.6)
  assert.equal(tnaFondefin(0.228125), 0.136875)
  assert.equal(CONDICION_FONDEFIN_CAPITAL_TRABAJO.tna, tnaFondefin(BADLAR_REFERENCIA.valor))
  // ESTA es la aserción que un literal pegado NO puede pasar: con la Badlar del piso de las últimas
  // tres semanas la ficha tiene que dar otra tasa, y el texto de observaciones tiene que decirlo.
  const piso = condicionConBadlar(BADLAR_REFERENCIA.rango_3_semanas.min)
  assert.equal(piso.tna, 0.12525)
  assert.match(piso.observaciones, /12,525%/)
  assert.notEqual(piso.tna, CONDICION_FONDEFIN_CAPITAL_TRABAJO.tna)
  // Sin Badlar válida no hay tasa inventada, y la ficha lo dice en vez de mostrar un número.
  const sinBadlar = condicionConBadlar(null)
  assert.equal(sinBadlar.tna, null)
  assert.match(sinBadlar.observaciones, /sin Badlar válida no hay tasa/)
  // Y con la misma Badlar es exactamente la tasa de la otra línea del organismo: un solo origen.
  assert.equal(CONDICION_FONDEFIN_CAPITAL_TRABAJO.tna, CONDICION_FONDEFIN.tna)
})

test('LA DECISIÓN: los materiales de obra NO califican como destino', () => {
  assert.equal(MATERIALES_DE_OBRA.califica, false)
  // El veredicto se apoya en DOS citas, no en una opinión.
  assert.match(MATERIALES_DE_OBRA.cita_financiable, /insumos o materia prima necesarios para producción/)
  assert.match(MATERIALES_DE_OBRA.cita_excluida, /Obras Civiles de Ningún tipo/)
  assert.match(MATERIALES_DE_OBRA.cita_excluida, /ejecución material de proyectos constructivos/)
  // Y declara que es lectura del OS, no confirmación del organismo.
  assert.match(MATERIALES_DE_OBRA.confianza, /INFERENCIA/)
  assert.match(MATERIALES_DE_OBRA.via_de_excepcion, /4\.4/)
  assert.match(MATERIALES_DE_OBRA.riesgo_si_se_fuerza, /reintegro inmediato del total/)
})

test('SIN limite_disponible: el comparador no la ofrece para pagar materiales ni tapar un bache', () => {
  assert.equal(CONDICION_FONDEFIN_CAPITAL_TRABAJO.limite_disponible, null)
  const { params } = paramsParaMotor([CONDICION_FONDEFIN_CAPITAL_TRABAJO])
  assert.equal(params.tasaPrestamoTNA, undefined, 'sin limite_disponible no debe entrar al motor')
  // Con límite SÍ entraría al motor — por eso el null es deliberado y este test lo custodia.
  const conLimite = { ...CONDICION_FONDEFIN_CAPITAL_TRABAJO, limite_disponible: MONTO_MAXIMO }
  assert.equal(paramsParaMotor([conLimite]).params.tasaPrestamoTNA, CONDICION_FONDEFIN_CAPITAL_TRABAJO.tna)
  // Las dos razones quedan escritas donde las lee quien consulte la tabla, no sólo en un comentario.
  const o = CONDICION_FONDEFIN_CAPITAL_TRABAJO.observaciones
  assert.match(o, /NO LLEVA limite_disponible/)
  assert.match(o, /transferencias parciales/)
})

test('el 2% de otorgamiento NO va en comisiones: esa columna es un monto en pesos', () => {
  assert.equal(GASTOS_OTORGAMIENTO, 0.02)
  assert.equal(CONDICION_FONDEFIN_CAPITAL_TRABAJO.comisiones, null)
  assert.equal(CONDICION_FONDEFIN_CAPITAL_TRABAJO.gastos, null)
  // Si alguien lo metiera como 0.02, costoEfectivo sumaría DOS CENTAVOS de costo. Eso probamos.
  const conError = { ...CONDICION_FONDEFIN_CAPITAL_TRABAJO, comisiones: GASTOS_OTORGAMIENTO }
  assert.equal(costoEfectivo(conError, { monto: 30_000_000, dias: 365 }).comisiones, 0.02)
})

test('lo que el ROP no publica entra en NULL: CFT, TEA e IVA sobre intereses', () => {
  assert.equal(CONDICION_FONDEFIN_CAPITAL_TRABAJO.cft, null)
  assert.equal(CONDICION_FONDEFIN_CAPITAL_TRABAJO.tea, null)
  assert.equal(CONDICION_FONDEFIN_CAPITAL_TRABAJO.iva_sobre_intereses, null)
  const d = CONDICION_FONDEFIN_CAPITAL_TRABAJO.desconocido
  assert.ok(d.some((x) => /CFT/.test(x)))
  assert.ok(d.some((x) => /IVA/.test(x)))
  // El hueco que decide la línea entera va PRIMERO en la lista y primero en las preguntas.
  assert.match(d[0], /excepción/)
  assert.match(CONDICION_FONDEFIN_CAPITAL_TRABAJO.preguntar[0], /DECISIVA/)
})

test('monto y plazo son los del reglamento, no los de la otra línea', () => {
  assert.equal(MONTO_MAXIMO, 30_000_000)
  assert.equal(PLAZO_MAXIMO_DIAS, 547) // 18 meses, contra los 1460 (48 meses) de Bienes de Capital
  assert.equal(CONDICION_FONDEFIN_CAPITAL_TRABAJO.plazo_dias, PLAZO_MAXIMO_DIAS)
  assert.ok(CONDICION_FONDEFIN_CAPITAL_TRABAJO.plazo_dias < CONDICION_FONDEFIN.plazo_dias)
  assert.match(CONDICION_FONDEFIN_CAPITAL_TRABAJO.amortizacion, /3 cuotas de GRACIA/)
})

test('el uso real del descubierto sale del cargo del banco, no del límite del acuerdo', () => {
  // La aritmética se invierte exacta: el saldo implícito reproduce el interés cobrado.
  const s = saldoPromedioImplicito(USO_REAL_DESCUBIERTO.interes, USO_REAL_DESCUBIERTO.dias)
  assert.ok(Math.abs(s * (TASAS.tna / TASAS.base) * USO_REAL_DESCUBIERTO.dias - USO_REAL_DESCUBIERTO.interes) < 0.01)
  // Y es MUY inferior al acuerdo: confundir el límite con el uso infla el premio por seis.
  assert.ok(s < ACUERDO.importe / 5, `saldo promedio ${Math.round(s)} debería ser una fracción del acuerdo`)
  assert.equal(Math.round(USO_REAL_DESCUBIERTO.saldo_promedio), Math.round(s))
  // Datos malos no dan un número: dan null.
  for (const malo of [[null, 30], [100, 0], [100, -1], ['x', 30], [-1, 30]]) {
    assert.equal(saldoPromedioImplicito(malo[0], malo[1]), null)
  }
})

test('el ahorro se calcula con el motor y se declara TECHO, no promesa', () => {
  const r = ahorroVsDescubierto(CONDICION_FONDEFIN_CAPITAL_TRABAJO, DESCUBIERTO, { monto: 10_000_000, dias: 365 })
  // El costo del descubierto lleva su IVA (12%); el de FONDEFIN no lleva ninguno porque no se publica.
  assert.equal(r.costo_descubierto, Math.round(10_000_000 * ACUERDO.tna * (1 + TASAS.iva + TASAS.percepcion)))
  assert.equal(r.costo_fondefin_piso, Math.round(10_000_000 * CONDICION_FONDEFIN_CAPITAL_TRABAJO.tna))
  // El 2% de entrada SÍ se suma, y fuera de la columna `comisiones`.
  assert.equal(r.gastos_otorgamiento, 200_000)
  assert.equal(r.costo_fondefin_con_entrada, r.costo_fondefin_piso + 200_000)
  assert.equal(r.ahorro, r.costo_descubierto - r.costo_fondefin_con_entrada)
  assert.ok(r.ahorro > 0)
  assert.equal(r.es_techo, true)
  assert.match(r.advertencia, /IVA sobre intereses/)
  // Sin tasa no hay ahorro inventado.
  const sinTasa = ahorroVsDescubierto({ ...CONDICION_FONDEFIN_CAPITAL_TRABAJO, tna: null }, DESCUBIERTO, { monto: 1e6, dias: 30 })
  assert.equal(sinTasa.ahorro, null)
  assert.ok(sinTasa.falta.includes('tna'))
})

test('la fila que va a la tabla no lleva campos que no son columnas', () => {
  const fila = filaParaLaTabla()
  for (const k of NO_SON_COLUMNAS) assert.equal(k in fila, false, `${k} no es columna`)
  for (const req of ['entidad', 'producto', 'tipo_financiacion', 'fuente']) {
    assert.ok(fila[req], `falta ${req}: registrarCondicion la rechaza`)
  }
  assert.equal(fila.tipo_financiacion, 'prestamo')
  assert.equal(fila.moneda, 'ARS')
  assert.equal(fila.nivel_confianza, 'informado')
  assert.match(fila.fuente, /ROP-Capital-de-trabajo-FONDEFIN-mayo-2026/)
  // El original no se toca.
  assert.ok(CONDICION_FONDEFIN_CAPITAL_TRABAJO.desconocido)
})

test('no colisiona con la línea de Bienes de Capital: es OTRA fila de la misma entidad', () => {
  // La clave única es (entidad, producto, tipo, moneda, vigencia_desde): sólo cambia el producto.
  assert.equal(CONDICION_FONDEFIN_CAPITAL_TRABAJO.entidad, CONDICION_FONDEFIN.entidad)
  assert.notEqual(CONDICION_FONDEFIN_CAPITAL_TRABAJO.producto, CONDICION_FONDEFIN.producto)
  assert.equal(CONDICION_FONDEFIN_CAPITAL_TRABAJO.vigencia_desde, '2026-05-01')
  assert.equal(CONDICION_FONDEFIN_CAPITAL_TRABAJO.vigencia_hasta, null)
})
