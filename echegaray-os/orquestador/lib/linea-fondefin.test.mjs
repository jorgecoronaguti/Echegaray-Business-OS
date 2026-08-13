import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FACTOR_BADLAR, BADLAR_REFERENCIA, tnaFondefin, DEMORA_TRAMITE_DIAS, llegaATiempo,
  GASTOS_OTORGAMIENTO, CONDICION_FONDEFIN, NO_SON_COLUMNAS, filaParaLaTabla,
} from './linea-fondefin.mjs'
import { costoEfectivo, paramsParaMotor } from './condiciones-financieras.mjs'

test('la tasa es una fórmula: 60% de la Badlar, no un número pegado', () => {
  assert.equal(FACTOR_BADLAR, 0.6)
  assert.equal(tnaFondefin(0.228125), 0.136875)
  assert.equal(tnaFondefin(0.20875), 0.12525)
  // La TNA de la ficha SALE de la fórmula: si alguien pisa el número, este test lo caza.
  assert.equal(CONDICION_FONDEFIN.tna, tnaFondefin(BADLAR_REFERENCIA.valor))
})

test('sin Badlar válida no hay tasa — nunca un número inventado', () => {
  for (const malo of [null, undefined, 0, -1, NaN, 'ochenta', {}]) {
    assert.equal(tnaFondefin(malo), null, `tnaFondefin(${String(malo)}) debería ser null`)
  }
})

test('la Badlar viaja con su fecha y su fuente oficial', () => {
  assert.equal(BADLAR_REFERENCIA.fecha, '2026-08-11')
  assert.match(BADLAR_REFERENCIA.fuente, /BCRA/)
  // El rango prueba que la tasa se mueve: la foto no es la película.
  assert.ok(BADLAR_REFERENCIA.rango_3_semanas.min < BADLAR_REFERENCIA.rango_3_semanas.max)
  assert.ok(BADLAR_REFERENCIA.valor <= BADLAR_REFERENCIA.rango_3_semanas.max)
})

test('la demora del trámite decide si la línea sirve para ESTA compra o para la siguiente', () => {
  assert.equal(DEMORA_TRAMITE_DIAS, 120)
  assert.equal(llegaATiempo(30).llega, false)
  assert.match(llegaATiempo(30).motivo, /SIGUIENTE/i)
  assert.equal(llegaATiempo(180).llega, true)
  assert.equal(llegaATiempo(120).llega, true)
  // No saber para cuándo se necesita no es un "sí".
  assert.equal(llegaATiempo(undefined).llega, null)
})

test('lo que no se sabe entra en NULL: CFT, TEA e IVA sobre intereses', () => {
  assert.equal(CONDICION_FONDEFIN.cft, null)
  assert.equal(CONDICION_FONDEFIN.tea, null)
  assert.equal(CONDICION_FONDEFIN.iva_sobre_intereses, null)
  assert.ok(CONDICION_FONDEFIN.desconocido.some((d) => /CFT/.test(d)))
  assert.ok(CONDICION_FONDEFIN.desconocido.some((d) => /IVA/.test(d)))
})

test('el 2% de otorgamiento NO va en comisiones: esa columna es un monto en pesos', () => {
  assert.equal(GASTOS_OTORGAMIENTO, 0.02)
  assert.equal(CONDICION_FONDEFIN.comisiones, null)
  assert.equal(CONDICION_FONDEFIN.gastos, null)
  // Si alguien lo metiera como 0.02, costoEfectivo sumaría DOS CENTAVOS de costo. Eso probamos.
  const conError = { ...CONDICION_FONDEFIN, comisiones: GASTOS_OTORGAMIENTO }
  const malo = costoEfectivo(conError, { monto: 100_000_000, dias: 365 })
  assert.equal(malo.comisiones, 0.02, 'la columna se leería en pesos, no como 2%')
})

test('NO es capital de trabajo: sin límite, el comparador no la ofrece para tapar un bache', () => {
  assert.equal(CONDICION_FONDEFIN.limite_disponible, null)
  const { params } = paramsParaMotor([CONDICION_FONDEFIN])
  assert.equal(params.tasaPrestamoTNA, undefined, 'sin limite_disponible no debe entrar al motor')
  // Con límite SÍ entraría — por eso el null es deliberado y este test lo custodia.
  const conLimite = { ...CONDICION_FONDEFIN, limite_disponible: 150_000_000 }
  assert.equal(paramsParaMotor([conLimite]).params.tasaPrestamoTNA, CONDICION_FONDEFIN.tna)
})

test('la ficha declara sus límites y las preguntas concretas que faltan', () => {
  assert.ok(CONDICION_FONDEFIN.desconocido.length >= 8)
  assert.ok(CONDICION_FONDEFIN.preguntar.length >= 6)
  const o = CONDICION_FONDEFIN.observaciones
  assert.match(o, /DEMORA DEL TRÁMITE: ~120 días/)
  assert.match(o, /2% de gastos de otorgamiento/)
  assert.match(o, /NO ES CAPITAL DE TRABAJO/)
  assert.match(o, /CABINA SIMPLE/)
  assert.match(o, /MICRO o PEQUEÑA/)
})

test('la fila que va a la tabla no lleva campos que no son columnas', () => {
  const fila = filaParaLaTabla()
  for (const k of NO_SON_COLUMNAS) assert.equal(k in fila, false, `${k} no es columna`)
  // registrarCondicion rechaza sin entidad/producto/tipo/fuente.
  for (const req of ['entidad', 'producto', 'tipo_financiacion', 'fuente']) {
    assert.ok(fila[req], `falta ${req}: registrarCondicion la rechaza`)
  }
  assert.equal(fila.tipo_financiacion, 'prestamo')
  assert.equal(fila.moneda, 'ARS')
  assert.equal(fila.nivel_confianza, 'informado')
  assert.match(fila.fuente, /ROP-MIPYME-BIENES-DE-CAPITAL-FONDEFIN-mayo-2026/)
  // El original no se toca.
  assert.ok(CONDICION_FONDEFIN.desconocido)
})

test('vigencia anclada al reglamento: re-correr la semilla ACTUALIZA, no duplica', () => {
  // La clave única incluye vigencia_desde. Si fuera "hoy", cada corrida crearía una fila nueva.
  assert.equal(CONDICION_FONDEFIN.vigencia_desde, '2026-05-01')
  assert.equal(CONDICION_FONDEFIN.vigencia_hasta, null)
})

test('el costo se puede calcular con la TNA conocida, y no le falta la tasa', () => {
  const c = costoEfectivo(CONDICION_FONDEFIN, { monto: 30_000_000, dias: 365 })
  assert.deepEqual(c.falta, [])
  assert.equal(c.intereses, Math.round(30_000_000 * (CONDICION_FONDEFIN.tna / 365) * 365))
  // Sin IVA cargado el costo es el PISO, no el total: el test lo deja explícito.
  assert.equal(c.iva, 0)
})
