import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FACTOR_BADLAR, BADLAR_REFERENCIA, tnaFondefin, DEMORA_TRAMITE_DIAS, llegaATiempo,
  GASTOS_OTORGAMIENTO, CONDICION_FONDEFIN, NO_SON_COLUMNAS, filaParaLaTabla,
  VALIDEZ_FOTO_DIAS, vigenciaHastaDeLaFoto, estadoDeLaFoto,
  IVA_SOBRE_INTERESES, ORIGEN_DEL_IVA,
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

test('lo que sigue sin saberse entra en NULL: CFT y TEA', () => {
  assert.equal(CONDICION_FONDEFIN.cft, null)
  assert.equal(CONDICION_FONDEFIN.tea, null)
  assert.ok(CONDICION_FONDEFIN.desconocido.some((d) => /CFT/.test(d)))
})

// ═══ EL DATO CONTESTADO DEJA DE SER PREGUNTA, Y LA CORRECCIÓN DEJA RASTRO (13/08/2026) ═══
//
// El defecto original: el dueño contestó el IVA y la ficha seguía publicando
// `iva_sobre_intereses: null`, preguntándolo en `preguntar` y declarándolo en `desconocido`. Dos
// consecuencias, no una: el costo salía barato, y el que miraba la fila creía que había una pregunta
// abierta que ya estaba cerrada.
//
// EL CONTRATO CAMBIÓ EL MISMO DÍA. La primera respuesta fue "iva 21" y con eso se cargó 0,21. Más
// tarde el dueño corrigió: "el iva es del 10,5% en el informe de compra de rodados". Manda lo último
// y lo más específico. Este test ya no fija 21: fija 10,5 Y EXIGE QUE EL 21 SIGA ESCRITO, porque una
// corrección sin rastro es indistinguible de un dedazo y el 21 va a reaparecer en algún papel.
test('el IVA sobre intereses es 10,5% y la fuente es EL DUEÑO, no el reglamento', () => {
  assert.equal(IVA_SOBRE_INTERESES, 0.105)
  assert.equal(CONDICION_FONDEFIN.iva_sobre_intereses, IVA_SOBRE_INTERESES)
  // El origen viaja con el número: una alícuota sin padre en una tabla de decisión no se audita.
  assert.equal(ORIGEN_DEL_IVA.fecha, '2026-08-13')
  assert.equal(ORIGEN_DEL_IVA.textual, 'el iva es del 10,5% en el informe de compra de rodados')
  assert.match(ORIGEN_DEL_IVA.origen, /dueño/)
  // Y NO se declara verificado contra la norma: nadie miró ARCA ni el texto legal.
  assert.equal(ORIGEN_DEL_IVA.verificado_contra_la_norma, false)
})

// El defecto que atrapa: borrar el 21% "porque ya no aplica". Si mañana aparece un papel que dice 21,
// hay que poder ver que esto se DECIDIÓ el 13/08 y no que alguien lo perdió por el camino.
test('la corrección del 21% al 10,5% deja rastro con las dos fechas, en el módulo y en la fila', () => {
  assert.equal(ORIGEN_DEL_IVA.corregido_desde.valor, 0.21)
  assert.equal(ORIGEN_DEL_IVA.corregido_desde.textual, 'iva 21')
  assert.equal(ORIGEN_DEL_IVA.corregido_desde.fecha, '2026-08-13')
  // Y el rastro no se queda en el código fuente: viaja a Postgres y a la Web dentro de observaciones.
  assert.match(CONDICION_FONDEFIN.observaciones, /CORRIGE una declaración anterior/)
  assert.match(CONDICION_FONDEFIN.observaciones, /21,00%|21%/)
  assert.match(CONDICION_FONDEFIN.observaciones, /"iva 21"/)
})

// El defecto que atrapa: alguien vuelve a poner 0.21 porque "el 10,5 es de bancos". Sin una
// declaración del dueño detrás, la alícuota no se mueve — y si se mueve, el rastro tiene que moverse
// con ella. Este test se pone rojo tanto si se revierte el valor como si se cambia sin actualizar el
// origen, que es el modo silencioso de romperlo.
test('la alícuota no se cambia sin declaración del dueño detrás', () => {
  assert.equal(ORIGEN_DEL_IVA.valor, IVA_SOBRE_INTERESES, 'el origen quedó apuntando a otro número')
  assert.ok(/10,5/.test(ORIGEN_DEL_IVA.textual), 'el textual del dueño no menciona la alícuota vigente')
  assert.notEqual(IVA_SOBRE_INTERESES, ORIGEN_DEL_IVA.corregido_desde.valor, 'volvió al valor corregido')
  // El encuadre que habilitaría la alícuota reducida NO está confirmado, y eso se declara.
  assert.match(ORIGEN_DEL_IVA.a_confirmar, /Ley 21\.526/)
  assert.match(ORIGEN_DEL_IVA.a_confirmar, /estudio contable/)
  assert.ok(CONDICION_FONDEFIN.desconocido.some((d) => /Ley 21\.526/.test(d)),
    'el hueco del encuadre tiene que viajar en desconocido, no vivir sólo en un comentario')
})

test('la alícuota ya no figura como pregunta abierta — pero la PERCEPCIÓN sí, y son cosas distintas', () => {
  // Nadie vuelve a preguntar "¿21% o 10,5%?": está contestado. La pregunta se fue de `preguntar`.
  assert.equal(CONDICION_FONDEFIN.preguntar.some((p) => /¿Los intereses llevan IVA\?/.test(p)), false)
  assert.equal(CONDICION_FONDEFIN.preguntar.length, 7) // era 8: se fue la del IVA
  // Lo que NO se sabe y no se inventa en ninguna dirección: si además hay percepción de IVA.
  assert.equal(CONDICION_FONDEFIN.desconocido.filter((d) => /PERCEPCIÓN/.test(d)).length, 1)
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
//
// 13/08/2026: el IVA salió de `falta` porque el dueño lo contestó. EL PISO NO SE CONVIRTIÓ EN TOTAL —
// el campo que afirma un total es el CFT y sigue sin publicarse. El dato nuevo achica el hueco, no lo
// cierra, y este test es el que impide que alguien lo dé por cerrado.
test('con el IVA cargado el costo SIGUE SIENDO UN PISO: lo que falta ahora es el CFT', () => {
  const c = costoEfectivo(CONDICION_FONDEFIN, { monto: 30_000_000, dias: 365 })
  assert.equal(c.completitud, 'piso')
  assert.equal(c.es_piso, true)
  assert.deepEqual(c.falta, ['cft'], `lo único que falta debería ser el CFT: ${c.falta}`)
  // El IVA ya no es un hueco: es 10,5% sobre los intereses, y entra a la suma. Los importes bajaron a
  // la mitad del IVA cuando el dueño corrigió el 21% (era $862.313 de IVA y $4.968.563 de costo).
  assert.equal(c.intereses, 4_106_250)
  assert.equal(c.iva, 431_156) // 4.106.250 × 10,5%
  assert.equal(c.costo_total, 4_537_406)
  // 13,6875% → 15,1247%: 1,44 puntos. Con el 21% eran 2,87.
  assert.equal(Number((c.costo_efectivo_anual * 100).toFixed(4)), 15.1247)
  assert.ok(c.costo_total > c.intereses, 'el IVA tiene que sumar: si vuelve a null, esto se cae')
  assert.match(c.para_conseguirlo, /gastos de otorgamiento/)
})

test('los 10 huecos y las 7 preguntas VIAJAN a la base: no se borran en el camino', () => {
  // Antes se descartaban con `clave` y morían en el repositorio. Varios deciden la operación:
  // aporte propio, si el crédito cubre el IVA del rodado, el sellado, si aceptan aval de SGR.
  // El hueco N°10 nació el 13/08 con la corrección a 10,5%: el encuadre bajo la Ley 21.526.
  const fila = filaParaLaTabla()
  assert.match(fila.observaciones, /LO QUE LA FUENTE NO PUBLICA \(10\)/)
  assert.match(fila.observaciones, /PREGUNTAS AL FIDUCIARIO \(7\)/)
  // Y el ORIGEN del 10,5% viaja con la fila, no se queda en un comentario del código: quien mire la
  // condición en Postgres o en la Web tiene que ver de dónde salió antes de decidir con ella —
  // incluida la declaración anterior del 21% que ésta corrige.
  assert.match(fila.observaciones, /FUENTE ES EL DUEÑO/)
  assert.match(fila.observaciones, /"el iva es del 10,5% en el informe de compra de rodados" el 13\/08\/2026/)
  assert.match(fila.observaciones, /CORRIGE una declaración anterior del mismo 13\/08\/2026 que fijaba 21%/)
  assert.match(fila.observaciones, /NO está verificada contra la norma/)
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
