import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LEIDO_EL, VALIDEZ_LECTURA_DIAS, vigenciaHastaDeLaLectura, estadoDeLaLectura,
  MAS_AUTOS_TASAS, IVA_SOBRE_INTERESES, ANCLAS_DE_TASA_2026, DEMORA_TRAMITE_DIAS, llegaATiempo,
  tasaRealBna, rankingReal,
  CONDICION_BNA_VEHICULOS_COMERCIALES, CONDICION_BNA_MAS_AUTOS, CONDICIONES_BNA,
  NO_SON_COLUMNAS, filaParaLaTabla, filasParaLaTabla, PREGUNTAR_AL_DUEÑO,
} from './linea-bna.mjs'
import { tasaReal, inflacionDeTrabajo } from './rodados-plan.mjs'
import { costoEfectivo, paramsParaMotor } from './condiciones-financieras.mjs'

const PYME = CONDICION_BNA_VEHICULOS_COMERCIALES

// ═══ EL NÚCLEO DEL MÓDULO: EL BNA NO PUBLICA LA TASA PyME ═══
//
// Este es el test que hay que romper primero si alguien quiere "completar" la ficha con un número
// sacado de una noticia. Todo lo demás del módulo cuelga de acá.
test('la línea PyME entra SIN tasa: null en tna, tea y cft, y el hueco tiene nombre', () => {
  assert.equal(PYME.tna, null)
  assert.equal(PYME.tea, null)
  assert.equal(PYME.cft, null)
  assert.ok(PYME.desconocido.some((d) => /^TNA — no publicada/.test(d)))
  assert.ok(PYME.desconocido.some((d) => /^CFT — no publicado/.test(d)))
  // Y el motivo viaja en la fila, no vive sólo en un comentario del código.
  assert.match(PYME.observaciones, /LA TASA NO ESTÁ PUBLICADA Y NO SE ESTIMA/)
  assert.match(PYME.observaciones, /según calificación crediticia/)
  assert.match(PYME.observaciones, /Bonificación de tasa a cargo del fabricante\/concesionario/)
})

// El defecto que atrapa: alguien despeja el IVA de la diferencia entre TEA y CFT TEA de +Autos y lo
// carga acá como si fuera un dato. Esa resta mezcla el IVA con todo lo demás que el banco metió en el
// CFT: no es una alícuota, es un residuo.
test('el IVA sobre intereses del BNA es DESCONOCIDO, no 0 y no 10,5% asumido', () => {
  assert.equal(IVA_SOBRE_INTERESES, null)
  assert.equal(PYME.iva_sobre_intereses, null)
  assert.equal(CONDICION_BNA_MAS_AUTOS.iva_sobre_intereses, null)
  // El argumento a favor del 10,5% (el BNA sí es entidad de la Ley 21.526) se declara COMO ARGUMENTO.
  const hueco = PYME.desconocido.find((d) => /IVA sobre intereses/.test(d))
  assert.ok(hueco, 'el IVA tiene que estar declarado como hueco')
  assert.match(hueco, /Ley 21\.526/)
  assert.match(hueco, /es un argumento, no una verificación/)
})

// El defecto que atrapa —y es el más probable de todos—: cargar los titulares de la prensa de agosto
// de 2026 ("Banco Nación, autos 0km, 48 cuotas") como si fueran la línea de la empresa.
test('+Autos con BNA NO es para la empresa, y la inhabilitación está escrita en el producto', () => {
  assert.match(CONDICION_BNA_MAS_AUTOS.producto, /NO apto para personas jurídicas/)
  assert.match(CONDICION_BNA_MAS_AUTOS.observaciones, /NO APLICA A ECHEGARAY CONSTRUCCIONES S\.A\./)
  assert.match(CONDICION_BNA_MAS_AUTOS.observaciones, /exclusivamente personas humanas aptas para obligarse/)
  // La PyME, en cambio, SÍ admite personas jurídicas y eso también se dice.
  assert.match(PYME.observaciones, /PERSONAS JURÍDICAS: SÍ/)
  assert.match(PYME.observaciones, /quedan excluidos los monotributistas/)
})

// El defecto que atrapa: cargar la tasa bonificada porque es la que sale más linda. Exige 3
// acreditaciones de haberes en el BNA que hoy no existen.
test('de +Autos se carga la tasa de CARTERA ABIERTA, no la bonificada', () => {
  assert.equal(MAS_AUTOS_TASAS.cliente_haberes.tna, 0.36)
  assert.equal(MAS_AUTOS_TASAS.cliente_haberes.cft_tea, 0.534)
  assert.equal(MAS_AUTOS_TASAS.cartera_abierta.tna, 0.46)
  assert.equal(MAS_AUTOS_TASAS.cartera_abierta.cft_tea, 0.723)
  assert.equal(CONDICION_BNA_MAS_AUTOS.tna, MAS_AUTOS_TASAS.cartera_abierta.tna)
  assert.equal(CONDICION_BNA_MAS_AUTOS.cft, MAS_AUTOS_TASAS.cartera_abierta.cft_tea)
  assert.notEqual(CONDICION_BNA_MAS_AUTOS.tna, MAS_AUTOS_TASAS.cliente_haberes.tna)
  assert.match(CONDICION_BNA_MAS_AUTOS.observaciones, /LA TASA CARGADA ES LA DE CARTERA ABIERTA/)
  // Y el CFT que se carga es el TEA, no el TNA: comparar un CFT-TNA contra CFTEA ajenos subestima.
  assert.equal(CONDICION_BNA_MAS_AUTOS.cft, 0.723)
  assert.notEqual(CONDICION_BNA_MAS_AUTOS.cft, MAS_AUTOS_TASAS.cartera_abierta.cft_tna)
})

// ═══ FISHER, Y SÓLO SOBRE LO QUE EXISTE ═══
test('la tasa real es Fisher exacto y NO se reimplementa: sale de rodados-plan', () => {
  const inf = inflacionDeTrabajo().anual
  // NO SE REIMPLEMENTA: es la MISMA función. Dos implementaciones de Fisher divergen en el tercer
  // decimal y nadie sabe cuál creer.
  assert.equal(tasaRealBna(0.723, inf), tasaReal(0.723, inf))
  assert.equal(tasaRealBna(0.534, inf), tasaReal(0.534, inf))

  // ═══ FISHER CONTRA LA RESTA, SIN CLAVAR EL NÚMERO DEL MES ═══
  //
  // Acá decía `=== 32.71` y `=== 18.15`, con el comentario «72,30% − 29,83% daría 42,47%». Los tres
  // números salían de la inflación viva. Al cargar julio del INDEC la ventana se corrió, la anual
  // pasó a 27,32%, la real dio 35,33% y el test se puso rojo — sin que Fisher cambiara.
  //
  // Lo que el test existe para atrapar es que alguien reemplace Fisher por la resta ingenua. Eso se
  // afirma comparando las dos, que es la diferencia real y no depende de qué mes publique el INDEC.
  const fisher = tasaRealBna(0.723, inf)
  const resta = 0.723 - inf
  assert.ok(fisher < resta, 'Fisher siempre da MENOS que la resta cuando la tasa es positiva')
  assert.ok(resta - fisher > 0.05, `la diferencia es material y no redondeo: ${resta - fisher}`)
  // Y el número exacto se prueba con una inflación FIJA, que es donde un número clavado sí vale:
  // (1,723 / 1,30) − 1 = 32,538%.
  assert.equal(Number((tasaRealBna(0.723, 0.30) * 100).toFixed(3)), 32.538)
})

// El defecto que atrapa: propagar un NaN con cara de número cuando la tasa no existe. Un NaN ordena
// mal en un sort y termina coronando a la línea sin datos.
test('sin tasa nominal NO hay tasa real: null, nunca NaN', () => {
  for (const malo of [null, undefined, NaN, 'nada', {}]) {
    assert.equal(tasaRealBna(malo), null, `tasaRealBna(${String(malo)}) debería ser null`)
  }
  assert.equal(tasaRealBna(0.5, NaN), null)
})

test('el ranking devuelve la línea PyME SIN posición, con el motivo — no la deja al final ni primera', () => {
  const r = rankingReal()
  const pyme = r.find((x) => x.apta_para_la_empresa)
  assert.equal(pyme.tasa_real, null)
  assert.equal(pyme.nominal, null)
  assert.match(pyme.motivo, /no publica tasa/)
  // Y las dos de +Autos SÍ tienen número, porque el BNA sí lo publica.
  const conNumero = r.filter((x) => x.tasa_real != null)
  assert.equal(conNumero.length, 2)
  for (const x of conNumero) assert.equal(x.apta_para_la_empresa, false)
  // La bonificada tiene que ser MÁS BARATA que la de cartera abierta: si se invierten, es un dedazo.
  assert.ok(conNumero[0].tasa_real < conNumero[1].tasa_real)
})

// El defecto que atrapa: leer "el BNA es inmediato" (que es cierto para +Autos) y trasladarlo a la
// línea PyME, concluyendo que llega para la unidad de septiembre. No hay plazo publicado.
test('la demora PyME es DESCONOCIDA y eso no se convierte en "llega a tiempo"', () => {
  assert.equal(DEMORA_TRAMITE_DIAS.pyme_vehiculos_comerciales, null)
  assert.equal(DEMORA_TRAMITE_DIAS.mas_autos, 0)
  const r = llegaATiempo(30)
  assert.equal(r.llega, null, 'demora desconocida NO es un sí')
  assert.match(r.motivo, /no publica plazo/)
  // Con una demora conocida sí decide, en las dos direcciones.
  assert.equal(llegaATiempo(30, 0).llega, true)
  assert.equal(llegaATiempo(30, 120).llega, false)
  assert.equal(llegaATiempo(180, 120).llega, true)
  // No saber para cuándo se necesita tampoco es un sí.
  assert.equal(llegaATiempo(undefined, 0).llega, null)
})

// ═══ LA CADUCIDAD ═══
// El BNA imprime que puede cambiar las condiciones sin previo aviso. Una foto sin vencimiento se
// convierte, en dos meses, en una afirmación falsa con cara de dato oficial.
test('la foto CADUCA sola a los 30 días de la lectura', () => {
  assert.equal(LEIDO_EL, '2026-08-13')
  assert.equal(VALIDEZ_LECTURA_DIAS, 30)
  assert.equal(vigenciaHastaDeLaLectura(), '2026-09-12')
  assert.equal(vigenciaHastaDeLaLectura('2026-08-13', 30), '2026-09-12')
  assert.equal(PYME.vigencia_hasta, vigenciaHastaDeLaLectura())
  assert.equal(CONDICION_BNA_MAS_AUTOS.vigencia_hasta, vigenciaHastaDeLaLectura())
  assert.notEqual(PYME.vigencia_hasta, null)
  // Una fecha inválida NO produce una vigencia inventada.
  assert.equal(vigenciaHastaDeLaLectura('mañana'), null)

  assert.equal(estadoDeLaLectura('2026-08-20').vencida, false)
  assert.equal(estadoDeLaLectura('2026-08-20').dias_de_la_foto, 7)
  assert.equal(estadoDeLaLectura('2026-11-13').vencida, true)
  // El día exacto del vencimiento todavía vale; el siguiente ya no.
  assert.equal(estadoDeLaLectura('2026-09-12').vencida, false)
  assert.equal(estadoDeLaLectura('2026-09-13').vencida, true)
})

test('vigencia anclada a una convención declarada: re-correr la semilla ACTUALIZA, no duplica', () => {
  assert.equal(PYME.vigencia_desde, '2026-08-01')
  assert.match(PYME.observaciones, /VIGENCIA_DESDE ES UNA CONVENCIÓN, NO UN DATO/)
  assert.match(PYME.observaciones, /CADUCIDAD DE ESTA FILA/)
  // +Autos NO usa la convención: su bonificación tiene fecha publicada por el banco.
  assert.equal(CONDICION_BNA_MAS_AUTOS.vigencia_desde, '2026-05-07')
  assert.equal(MAS_AUTOS_TASAS.bonificacion_vigente_desde, '2026-05-07')
})

// ═══ EL DATO QUE DECIDE LA COMPRA ═══
// FONDEFIN sólo admite cabina simple, y esa restricción está ordenando todo el informe de rodados.
// El texto del BNA no menciona carrocería. La tentación es concluir "entonces el BNA sí financia doble
// cabina". Eso es un salto lógico, no un hallazgo, y este test lo bloquea.
test('el silencio del BNA sobre la doble cabina NO se lee como permiso', () => {
  assert.match(PYME.observaciones, /CUIDADO CON EL SALTO LÓGICO: que no lo prohíba no es que lo permita/)
  assert.ok(PYME.desconocido.some((d) => /DOBLE CABINA/.test(d)))
  assert.ok(PYME.preguntar.some((p) => /DOBLE CABINA/.test(p)))
  // Y la restricción que el BNA SÍ tiene —el convenio con el fabricante— no se pierde de vista.
  assert.match(PYME.observaciones, /QUE SUSCRIBAN EL CONVENIO CON EL BNA/)
  assert.ok(PYME.desconocido.some((d) => /convenio vigente con el BNA/.test(d)))
})

test('lo verificable de la línea PyME está transcripto, no parafraseado', () => {
  assert.equal(PYME.plazo_dias, 1825) // 60 meses
  assert.equal(PYME.moneda, 'ARS')
  assert.match(PYME.amortizacion, /Sistema alemán/)
  assert.match(PYME.observaciones, /FINANCIA EL 100%/)
  assert.match(PYME.observaciones, /AMORTIZACIÓN ALEMANA/)
  assert.match(PYME.observaciones, /PLAZO 60 MESES contra los 48 de FONDEFIN/)
  assert.match(PYME.garantias, /NO PUBLICADA/)
  assert.match(PYME.fuente, /CreditoCamionesUtilitariosMiniINV/)
  assert.match(PYME.fuente, /13\/08\/2026/)
})

// ═══ EL COMPORTAMIENTO CONTRA EL MOTOR EXISTENTE ═══
// Una ficha sin tasa tiene que hacer que el motor diga "no sé", no que devuelva $0 de costo.
test('sin tasa, costoEfectivo devuelve sin_dato — no un crédito gratis', () => {
  const c = costoEfectivo(PYME, { monto: 30_000_000, dias: 365 })
  assert.equal(c.completitud, 'sin_dato')
  assert.equal(c.costo_total, null)
  assert.equal(c.intereses, null)
  assert.equal(c.costo_efectivo_anual, null)
  assert.deepEqual(c.falta.sort(), ['cft', 'iva_sobre_intereses', 'tna'])
  assert.ok(c.para_conseguirlo?.includes('LA TASA NO ESTÁ PUBLICADA'))
})

test('ninguna de las dos entra al motor de tesorería: no son capital de trabajo', () => {
  for (const cond of CONDICIONES_BNA) assert.equal(cond.limite_disponible, null)
  const { params } = paramsParaMotor(CONDICIONES_BNA)
  assert.equal(params.tasaPrestamoTNA, undefined)
})

// ═══ LA FILA QUE VA A LA BASE ═══
test('la fila no lleva campos que no son columnas, y conserva lo que registrarCondicion exige', () => {
  for (const cond of CONDICIONES_BNA) {
    const fila = filaParaLaTabla(cond)
    for (const k of NO_SON_COLUMNAS) assert.equal(k in fila, false, `${k} no es columna`)
    for (const req of ['entidad', 'producto', 'tipo_financiacion', 'fuente']) {
      assert.ok(fila[req], `falta ${req}: registrarCondicion la rechaza`)
    }
    assert.equal(fila.tipo_financiacion, 'prestamo')
    assert.equal(fila.moneda, 'ARS')
    assert.equal(fila.nivel_confianza, 'informado')
    assert.match(fila.entidad, /Banco de la Nación Argentina/)
  }
  assert.equal(filasParaLaTabla().length, 2)
  // El original no se muta al armar la fila.
  assert.ok(PYME.desconocido)
  assert.equal(PYME.observaciones.includes('PREGUNTAS AL BANCO'), false)
})

// El defecto que ya se pagó en linea-fondefin: los huecos morían en el repositorio y no llegaban ni a
// Postgres ni a la Web. Acá los huecos SON el contenido — si se pierden, la fila queda diciendo que
// hay una línea del BNA disponible y nada más.
test('los 13 huecos y las 10 preguntas VIAJAN a la base: no se borran en el camino', () => {
  const fila = filaParaLaTabla(PYME)
  assert.match(fila.observaciones, /LO QUE EL BNA NO PUBLICA \(13\)/)
  assert.match(fila.observaciones, /PREGUNTAS AL BANCO \(10\)/)
  for (const d of PYME.desconocido) assert.ok(fila.observaciones.includes(d), `se perdió: ${d}`)
  for (const p of PYME.preguntar) assert.ok(fila.observaciones.includes(p), `se perdió: ${p}`)
  const otra = filaParaLaTabla(CONDICION_BNA_MAS_AUTOS)
  assert.match(otra.observaciones, /LO QUE EL BNA NO PUBLICA \(5\)/)
  assert.match(otra.observaciones, /PREGUNTAS AL BANCO \(3\)/)
})

// ═══ LAS ANCLAS: NÚMEROS REALES EN LA CASILLA EQUIVOCADA ═══
//
// El modo en que este análisis se rompe no es inventando un número: es agarrando uno REAL de una línea
// parecida —el 18% de maquinaria nacional, el 22% del comunicado de 2024, el 37% del informe de
// IERAL— y pegándolo como si fuera la TNA de la línea de vehículos. Cada ancla tiene que declarar por
// qué no lo es, y NINGUNA puede terminar dentro de la ficha.
test('las anclas de tasa existen, están fechadas y ninguna se filtra a la ficha', () => {
  assert.equal(ANCLAS_DE_TASA_2026.length, 4)
  for (const a of ANCLAS_DE_TASA_2026) {
    assert.ok(a.tna > 0, `${a.que} sin tna`)
    assert.match(a.fecha, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(a.fuente, 'un número sin fuente no entra')
    assert.ok(a.por_que_no_es_la_nuestra?.length > 60, `${a.que} no explica por qué no aplica`)
    assert.notEqual(PYME.tna, a.tna, 'una ancla se filtró a la ficha como si fuera la tasa')
  }
  // El 18% es un PISO ("desde"), no una tasa: si alguien lo marca como cerrado, lo usa mal.
  const maq = ANCLAS_DE_TASA_2026.find((a) => a.tna === 0.18)
  assert.equal(maq.es_un_piso, true)
  assert.equal(maq.oficial, true)
  assert.equal(maq.fecha, '2026-07-16')
  // El 37% de IERAL es de un TERCERO y eso se declara: no es el BNA hablando.
  const ieral = ANCLAS_DE_TASA_2026.find((a) => a.tna === 0.37)
  assert.equal(ieral.oficial, false)
  assert.match(ieral.fuente, /IERAL/)
})

// El defecto que atrapa: usar el 22% de mayo de 2024 —que ES de esta línea exacta— como si fuera la
// tasa de hoy. Es la fuente más tentadora de todas justamente porque es la correcta, salvo por la fecha.
test('el 22% de 2024 es de ESTA línea y por eso es el más peligroso: se marca viejo, no se carga', () => {
  const v = ANCLAS_DE_TASA_2026.find((a) => a.tna === 0.22)
  assert.equal(v.fecha, '2024-05-23')
  assert.ok(v.fecha < '2025-01-01', 'es una fuente de otra ventana de tiempo')
  assert.match(v.por_que_no_es_la_nuestra, /DOS AÑOS VIEJO/)
  // Y viaja a la base con la advertencia, más lo que sí aporta: la estructura mixta de tasa.
  assert.match(PYME.observaciones, /EL COMUNICADO DE ESTA MISMA LÍNEA EXISTE Y ESTÁ DOS AÑOS VIEJO/)
  assert.match(PYME.observaciones, /la estructura era MIXTA/)
  assert.ok(PYME.desconocido.some((d) => /sigue vigente/.test(d)))
  assert.ok(PYME.preguntar.some((p) => /FIJA los 60 meses o mixta/.test(p)))
})

// La segunda puerta del mismo banco: mejor tasa conocida y sin restricción de carrocería, pero exige
// fabricación nacional. Es un cruce que puede cambiar QUÉ unidad se compra, no sólo cómo se paga.
test('la línea de maquinaria nacional se documenta CON su exclusión, no como una alternativa suelta', () => {
  assert.match(PYME.observaciones, /HAY UNA SEGUNDA PUERTA EN EL MISMO BANCO/)
  assert.match(PYME.observaciones, /FABRICADOS EN EL PAÍS/)
  assert.match(PYME.observaciones, /origen chino queda afuera de esta puerta/)
  assert.ok(PYME.preguntar.some((p) => /Maquinarias de Fabricación Nacional/.test(p)))
  const maq = ANCLAS_DE_TASA_2026.find((a) => a.tna === 0.18)
  assert.match(maq.por_que_no_es_la_nuestra, /fabricado en el país/)
})

// La ausencia de tasa no se afirmó mirando una sola página: se barrió el tarifario, la prensa y el
// Boletín Oficial. Si eso no viaja en la fuente, la afirmación "no publica tasa" no es verificable.
test('la fuente declara DÓNDE se buscó la tasa, no sólo dónde no estaba', () => {
  assert.match(PYME.fuente, /tarifario oficial/)
  assert.match(PYME.fuente, /Boletín Oficial/)
  assert.match(PYME.fuente, /ninguna de las 18 líneas PyME publica tasa numérica/)
})

// ═══ LO QUE ESTA FICHA NO ES ═══
// El dueño dijo que la línea "siempre estuvo en consideración" y el OS no encontró rastro. Si eso se
// borra, dentro de un mes esta ficha se lee como si hubiera un trámite en curso.
test('la ficha declara que es verificación externa nueva, no una recuperación', () => {
  assert.match(PYME.observaciones, /ESTA FICHA NO RECUPERA NADA/)
  assert.match(PYME.observaciones, /verificación externa nueva del 13\/08\/2026/)
  assert.ok(PREGUNTAR_AL_DUEÑO.length >= 4)
  assert.ok(PREGUNTAR_AL_DUEÑO.some((p) => /carpeta presentada/.test(p)))
  assert.ok(PREGUNTAR_AL_DUEÑO.some((p) => /línea PyME .* o sobre el préstamo personal/.test(p)))
})
