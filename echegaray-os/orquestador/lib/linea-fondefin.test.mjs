import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FACTOR_BADLAR, BADLAR_REFERENCIA, tnaFondefin, DEMORA_TRAMITE_DIAS, llegaATiempo,
  GASTOS_OTORGAMIENTO, CONDICION_FONDEFIN, NO_SON_COLUMNAS, filaParaLaTabla,
  VALIDEZ_FOTO_DIAS, vigenciaHastaDeLaFoto, estadoDeLaFoto,
} from './linea-fondefin.mjs'
import { SERIE_BADLAR, ultimaObservacion, rangoDeLaSerie } from './badlar-bcra.mjs'
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

test('la Badlar de referencia SE DERIVA de la serie del BCRA: no hay dónde tipearla mal', () => {
  const ultima = ultimaObservacion(SERIE_BADLAR)
  assert.equal(BADLAR_REFERENCIA.valor, ultima.valor)
  assert.equal(BADLAR_REFERENCIA.fecha, ultima.fecha)
  assert.match(BADLAR_REFERENCIA.fuente, /BCRA/)
  // El rango también sale de la serie, con sus fechas y sus ruedas contadas.
  assert.deepEqual(BADLAR_REFERENCIA.rango_observado, rangoDeLaSerie(SERIE_BADLAR))
  assert.ok(BADLAR_REFERENCIA.rango_observado.min < BADLAR_REFERENCIA.rango_observado.max)
  assert.equal(BADLAR_REFERENCIA.rango_observado.ruedas, SERIE_BADLAR.length)
  // El rótulo viejo ("3 semanas" sobre 16 días corridos) no vuelve: era una ventana que no existía.
  assert.equal('rango_3_semanas' in BADLAR_REFERENCIA, false)
})

test('la foto CADUCA: la fila deja de estar vigente sola, sin que nadie se acuerde', () => {
  // El defecto original: vigencia_hasta null → dentro de tres meses la Web seguía publicando TNA 13,69%.
  assert.notEqual(CONDICION_FONDEFIN.vigencia_hasta, null)
  assert.equal(CONDICION_FONDEFIN.vigencia_hasta, vigenciaHastaDeLaFoto(BADLAR_REFERENCIA.fecha))
  assert.equal(vigenciaHastaDeLaFoto('2026-08-11', 15), '2026-08-26')
  // Y la vigencia cuelga de la BADLAR, no de la fecha de carga: refrescar la tasa la extiende sola.
  assert.equal(vigenciaHastaDeLaFoto('2026-09-30', VALIDEZ_FOTO_DIAS), '2026-10-15')

  const alDia = estadoDeLaFoto('2026-08-20')
  assert.equal(alDia.vencida, false)
  assert.equal(alDia.dias_de_la_foto, 9)
  const vencida = estadoDeLaFoto('2026-11-13') // los "tres meses" del dictamen
  assert.equal(vencida.vencida, true)
  assert.ok(vencida.dias_de_la_foto > 90)
  // El día exacto del vencimiento todavía vale; el siguiente ya no.
  assert.equal(estadoDeLaFoto(CONDICION_FONDEFIN.vigencia_hasta).vencida, false)
  assert.equal(estadoDeLaFoto(vigenciaHastaDeLaFoto(BADLAR_REFERENCIA.fecha, VALIDEZ_FOTO_DIAS + 1)).vencida, true)
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
  // Y el 01/05 es una CONVENCIÓN nuestra (sale del "05-2026" del nombre del PDF): tiene que estar
  // dicho en la FILA, no sólo en un comentario que nunca llega a Postgres ni a la Web.
  assert.match(CONDICION_FONDEFIN.observaciones, /VIGENCIA_DESDE ES UNA CONVENCIÓN/)
  assert.match(CONDICION_FONDEFIN.observaciones, /CADUCIDAD DE ESTA FILA/)
})

// ═══ EL TEST QUE ANTES CANONIZABA EL SILENCIO ═══
// Decía `assert.deepEqual(c.falta, [])` y `assert.equal(c.iva, 0)` sobre una línea SIN IVA conocido,
// SIN CFT, sin el 2% de otorgamiento, sin sellos, seguro ni tasación. Era un control validándose
// contra la misma información que producía. Ahora exige lo contrario.
test('el costo de FONDEFIN es un PISO y lo declara: falta el IVA y falta el CFT', () => {
  const c = costoEfectivo(CONDICION_FONDEFIN, { monto: 30_000_000, dias: 365 })
  assert.equal(c.completitud, 'piso')
  assert.equal(c.es_piso, true)
  assert.ok(c.falta.includes('iva_sobre_intereses'), `falta debería incluir el IVA: ${c.falta}`)
  assert.ok(c.falta.includes('cft'), `falta debería incluir el CFT: ${c.falta}`)
  assert.equal(c.falta.includes('tna'), false, 'la TNA sí se conoce')
  // El IVA DESCONOCIDO no es cero: es null. Un 0 acá afirmaba una exención que nadie declaró.
  assert.equal(c.iva, null)
  assert.equal(c.intereses, Math.round(30_000_000 * (CONDICION_FONDEFIN.tna / 365) * 365))
  // El piso sigue siendo un número usable, pero el que lo consume sabe qué le falta y dónde buscarlo.
  assert.equal(c.costo_total, c.intereses)
  assert.match(c.para_conseguirlo, /gastos de otorgamiento/)
})

test('los 9 huecos y las 8 preguntas VIAJAN a la base: no se borran en el camino', () => {
  // Antes se descartaban con `clave` y morían en el repositorio. Varios deciden la operación:
  // aporte propio, si el crédito cubre el IVA del rodado, el sellado, si aceptan aval de SGR.
  const fila = filaParaLaTabla()
  assert.match(fila.observaciones, /LO QUE LA FUENTE NO PUBLICA \(9\)/)
  assert.match(fila.observaciones, /PREGUNTAS AL FIDUCIARIO \(8\)/)
  for (const d of CONDICION_FONDEFIN.desconocido) assert.ok(fila.observaciones.includes(d), `se perdió: ${d}`)
  for (const p of CONDICION_FONDEFIN.preguntar) assert.ok(fila.observaciones.includes(p), `se perdió: ${p}`)
  assert.ok(fila.observaciones.includes('aporte propio'))
  assert.ok(fila.observaciones.includes('aval de Garantizar'))
  // El original no se muta al armar la fila.
  assert.equal(CONDICION_FONDEFIN.observaciones.includes('PREGUNTAS AL FIDUCIARIO'), false)
})

test('la Situación 1/2 es de la cartera de la Fiduciaria, no del sistema financiero', () => {
  // Son dos requisitos distintos y el ROP los separa: confundirlos declara mal la condición de acceso.
  const o = CONDICION_FONDEFIN.observaciones
  assert.match(o, /en el SISTEMA FINANCIERO debe estar en "situación normal"/)
  assert.match(o, /en la CARTERA CREDITICIA DE LA PROPIA FIDUCIARIA debe estar en Situación 1 o 2/)
})
