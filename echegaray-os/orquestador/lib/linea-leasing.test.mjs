import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LEIDO_EL, CAMPANA_BICE, PRODUCTO_PERMANENTE_BICE, estadoDeLaCampana,
  MONTO_MINIMO, alcanzaElMinimo,
  IVA_SOBRE_EL_CANON, CANDIDATOS_IVA_CANON, EL_IVA_DEL_CANON_ENTRA_A_LA_TASA, DIFERIMIENTO_DEL_IVA,
  TRATAMIENTO_FISCAL_VERIFICADO, TOPE_AUTOMOVILES, topeDeDeduccion,
  teaDeLaTna, tasaRealLeasing, rankingReal, FONDEFIN_PARA_COMPARAR,
  ANCLA_FORD_COMAFI, VALOR_RESIDUAL_DE_MERCADO, MERCADO_DE_LEASING, FIANZA_DE_SOCIOS, OTRAS_PUERTAS,
  REFERENCIAS, costoEnPesosDeHoy, costoDeCadaReferencia,
  SIN_TASA_PUBLICADA,
  CONDICION_LEASING_BICE_CAMPANA, CONDICION_LEASING_BICE_PERMANENTE, CONDICIONES_LEASING,
  NO_SON_COLUMNAS, filaParaLaTabla, filasParaLaTabla, PREGUNTAR_AL_DUEÑO,
} from './linea-leasing.mjs'
import { tasaReal, inflacionDeTrabajo, cuadroFrances } from './rodados-plan.mjs'
import { costoEfectivo, paramsParaMotor } from './condiciones-financieras.mjs'

const CAMPANA = CONDICION_LEASING_BICE_CAMPANA
const PERMANENTE = CONDICION_LEASING_BICE_PERMANENTE

// ═══ EL NÚCLEO: LA ÚNICA TASA QUE EXISTE ES UN PISO CON FECHA DE MUERTE ═══
//
// Si alguien "completa" esta ficha con un CFT sacado de una nota o le saca el rótulo de piso, este
// test es el primero que tiene que romper.
test('la campaña entra con TNA publicada pero SIN CFT, y el "desde" está declarado', () => {
  assert.equal(CAMPANA.tna, 0.1945)
  assert.equal(CAMPANA.cft, null)
  assert.equal(CAMPANA_BICE.tna_es_piso, true)
  assert.match(CAMPANA.observaciones, /EL 19,45% ES UN PISO/)
  assert.match(CAMPANA.observaciones, /tasa fija desde 19,45%/)
  assert.match(CAMPANA.observaciones, /NO ES UN CFT/)
  assert.ok(CAMPANA.desconocido.some((d) => /^CFT — no publicado/.test(d)))
})

// El defecto que atrapa: usar esta ficha en septiembre como si la tasa siguiera existiendo. La
// vigencia la publica el BANCO, no la inventa el OS.
test('la campaña vence el 21/08/2026 y el estado lo dice a cualquier fecha', () => {
  assert.equal(CAMPANA_BICE.vence_el, '2026-08-21')
  assert.equal(CAMPANA.vigencia_hasta, '2026-08-21')

  const hoy = estadoDeLaCampana(LEIDO_EL)
  assert.equal(hoy.abierta, true)
  assert.equal(hoy.dias_restantes, 8)

  const despues = estadoDeLaCampana('2026-09-15')
  assert.equal(despues.abierta, false)
  assert.equal(despues.ya_venció, true)
  // NEGATIVO, no cero: "venció hace 25 días" y "vence hoy" no son la misma decisión.
  assert.ok(despues.dias_restantes < 0)

  const antes = estadoDeLaCampana('2026-08-01')
  assert.equal(antes.todavía_no_abrió, true)
  assert.equal(antes.abierta, false)
})

test('una fecha inválida no devuelve un estado con cara de válido', () => {
  assert.equal(estadoDeLaCampana('no-es-fecha'), null)
})

// ═══ LA VENTAJA DECISIVA: NO HAY PRENDA ═══
//
// Es el motivo entero por el que esta ficha se pidió. Si el texto de la garantía se diluye, el informe
// pierde su conclusión.
test('la garantía dice, fuerte, que el bien ES la garantía y no hay garantía adicional', () => {
  assert.match(CAMPANA.garantias, /NO EXIGE GARANTÍA ADICIONAL/)
  assert.match(CAMPANA.garantias, /no requiere de garantías adicionales \(ya que el bien adquirido actúa como tal\)/)
  // Y el contraste con FONDEFIN viaja en la fila, con los números: es lo que traba el plan hoy.
  assert.match(CAMPANA.garantias, /200% del financiamiento/)
  assert.match(CAMPANA.garantias, /\$120\.000\.000/)
  assert.match(CAMPANA.garantias, /\$61\.200\.000/)
  assert.equal(CAMPANA_BICE.garantias_adicionales, false)
  assert.match(CAMPANA.observaciones, /LA VENTAJA DECISIVA NO ES LA TASA, ES LA GARANTÍA/)
})

test('la restricción de carrocería de FONDEFIN no aparece: los bienes admitidos se enumeran', () => {
  assert.match(CAMPANA_BICE.bienes, /utilitarios/)
  assert.match(CAMPANA_BICE.bienes, /pickups/)
  assert.match(CAMPANA.observaciones, /LA SEGUNDA RESTRICCIÓN QUE LEVANTA: LA CARROCERÍA/)
  // Pero sin el salto lógico: que no lo prohíba no es que lo autorice.
  assert.match(CAMPANA.observaciones, /que no lo prohíba no es que lo autorice/)
  assert.ok(CAMPANA.preguntar.some((p) => /doble cabina y furgón/.test(p)))
})

// ═══ EL MONTO MÍNIMO: EL DATO QUE PUEDE MATAR LA OPERACIÓN ANTES QUE LA TASA ═══
//
// El defecto que atrapa —y es el más tentador de todos—: trasladar los $80M de junio a la campaña de
// agosto como si fuera el mínimo vigente. Eso es mezclar ventanas de tiempo.
test('el mínimo de agosto es DESCONOCIDO y el de junio no se traslada', () => {
  assert.equal(MONTO_MINIMO.publicado_en_la_campana_de_agosto, null)
  assert.equal(MONTO_MINIMO.anclas[0].monto, 80_000_000)

  const dos = alcanzaElMinimo(58_800_000) // dos DFSK
  assert.equal(dos.alcanza, null, 'sin mínimo publicado NO se afirma que entre ni que no entre')
  assert.match(dos.motivo, /no publica monto mínimo/)
  // Lo que SÍ se puede afirmar: contra el mínimo histórico no llegaría, y por cuánto.
  assert.equal(dos.contra_el_ancla.alcanza, false)
  assert.equal(dos.faltante_contra_el_ancla, 21_200_000)

  // Las DOS referencias de precio quedan por debajo del ancla: es lo que hay que preguntar primero.
  const dosUsd = alcanzaElMinimo(75_750_000)
  assert.equal(dosUsd.contra_el_ancla.alcanza, false)
})

test('un monto inválido devuelve null en vez de un veredicto inventado', () => {
  assert.equal(alcanzaElMinimo(0), null)
  assert.equal(alcanzaElMinimo('cualquier cosa'), null)
})

test('la primera pregunta al banco es el mínimo, no la tasa', () => {
  assert.match(CAMPANA.preguntar[0], /monto MÍNIMO/)
  assert.match(CAMPANA.preguntar[0], /antes que la tasa/)
})

// ═══ EL IVA: GRAVADO SÍ, ALÍCUOTA NO ═══
//
// El defecto que atrapa: tipear 21% porque "todo el mundo sabe". Que el canon esté gravado está
// verificado contra el art. 9 del decreto; la alícuota no se verificó contra la norma.
test('el IVA del canon es DESCONOCIDO como alícuota, con los dos candidatos nombrados', () => {
  assert.equal(IVA_SOBRE_EL_CANON, null)
  assert.equal(CAMPANA.iva_sobre_intereses, null)
  assert.equal(CANDIDATOS_IVA_CANON.length, 2)
  assert.equal(CANDIDATOS_IVA_CANON[0].alicuota, 0.21)
  assert.equal(CANDIDATOS_IVA_CANON[0].es_el_mas_probable, true)
  assert.equal(CANDIDATOS_IVA_CANON[1].alicuota, 0.105)
  assert.equal(CANDIDATOS_IVA_CANON[1].es_el_mas_probable, false)
  // Y el hueco viaja a la fila, no vive sólo en un comentario del código.
  assert.ok(CAMPANA.desconocido.some((d) => /alícuota de IVA del canon/.test(d)))
})

// El hallazgo contraintuitivo que el folleto del banco no dice: el leasing DUPLICA la alícuota sobre
// el mismo fierro. Si alguien borra esto, el informe pierde el único contrapeso a la publicidad.
test('se dice que el canon va al 21% donde la compra directa iría al 10,5%', () => {
  assert.match(CAMPANA.observaciones, /EL IVA DEL CANON VA AL 21% Y LA COMPRA DIRECTA DE UN UTILITARIO IRÍA AL 10,5%/)
  assert.match(CAMPANA.observaciones, /al revés de lo que dice el folleto/)
})

// El IVA es recuperable: cargarlo sobre la tasa lo convertiría en costo y sobre la base equivocada.
test('el IVA del canon NO entra a la tasa, y la asimetría con FONDEFIN está declarada', () => {
  assert.equal(EL_IVA_DEL_CANON_ENTRA_A_LA_TASA, false)
  const r = rankingReal()
  assert.ok(r.criterio_homogeneo, 'tiene que existir la lectura homogénea')
  assert.match(r.criterio_homogeneo.nota, /cargarlo sólo en una sesga la comparación/)
})

test('el diferimiento del IVA se declara como INFERENCIA, no como beneficio', () => {
  assert.equal(DIFERIMIENTO_DEL_IVA.clasificacion, 'INFERENCIA')
  assert.equal(DIFERIMIENTO_DEL_IVA.resuelve, 'estudio contable')
  assert.match(DIFERIMIENTO_DEL_IVA.posicion_de_echegaray, /DÉBITO/)
  assert.match(CAMPANA.observaciones, /PUEDE SER UNA DESVENTAJA PARA ESTA EMPRESA/)
})

// ═══ FISCAL: CADA AFIRMACIÓN CON SU ARTÍCULO ═══
//
// El defecto que atrapa: un encuadre fiscal sin norma citada. Este test exige el artículo.
test('todo el tratamiento fiscal verificado cita norma y artículo', () => {
  assert.ok(TRATAMIENTO_FISCAL_VERIFICADO.length >= 5)
  for (const t of TRATAMIENTO_FISCAL_VERIFICADO) {
    assert.match(t.norma, /art\. \d/, `sin artículo: ${t.tema}`)
    assert.ok(t.que_dice?.length > 40)
    assert.ok(t.consecuencia?.length > 20)
  }
  const canon = TRATAMIENTO_FISCAL_VERIFICADO.find((t) => /deducción del canon/.test(t.tema))
  assert.match(canon.norma, /1038\/2000, art\. 6/)
  const plazo = TRATAMIENTO_FISCAL_VERIFICADO.find((t) => /plazo mínimo/.test(t.tema))
  assert.match(plazo.norma, /Decreto 152\/2022/)
  assert.match(plazo.consecuencia, /30 meses/)
  const trampa = TRATAMIENTO_FISCAL_VERIFICADO.find((t) => /opción de compra barata/.test(t.tema))
  assert.match(trampa.norma, /art\. 7/)
  assert.match(trampa.que_dice, /venta financiada/)
})

test('el plazo de la campaña (36 meses) cumple el piso fiscal de 30 meses, y se declara', () => {
  assert.equal(CAMPANA_BICE.plazo_meses, 36)
  assert.equal(CAMPANA.dias_dias_minimos, undefined)
  assert.equal(CAMPANA.dias_minimos, 913) // 30 meses
  assert.ok(CAMPANA_BICE.plazo_meses * 30.4 > 913)
})

// ═══ EL TOPE DE AUTOMÓVILES: EL RIESGO QUE BORRA LA VENTAJA ENTERA ═══
test('el tope del art. 88 inc. l) alcanza al leasing y NO se da por resuelto', () => {
  assert.equal(TOPE_AUTOMOVILES.tope, 20_000)
  assert.equal(TOPE_AUTOMOVILES.alcanza_al_leasing, true)
  assert.equal(TOPE_AUTOMOVILES.verificado, false, 'la clasificación del rodado no la firma el OS')
  assert.match(TOPE_AUTOMOVILES.quien_lo_firma, /estudio contable/)
  assert.match(TOPE_AUTOMOVILES.definicion_de_automovil, /24\.449/)
  assert.match(TOPE_AUTOMOVILES.definicion_de_automovil, /ocho plazas/)
})

test('sin clasificar el vehículo, el tope devuelve null — no "no aplica"', () => {
  const sinClasificar = topeDeDeduccion(null, 29_400_000)
  assert.equal(sinClasificar.muerde, null)
  assert.match(sinClasificar.motivo, /no está clasificado/)

  const carga = topeDeDeduccion('utilitario_de_carga', 29_400_000)
  assert.equal(carga.muerde, false)
  assert.equal(carga.proporcion_deducible, 1)

  // Y si fuera un automóvil, el tope de 1998 deja deducible menos del 0,1% del canon.
  const auto = topeDeDeduccion('automovil', 29_400_000)
  assert.equal(auto.muerde, true)
  assert.ok(auto.proporcion_deducible < 0.001)
})

test('el tope sin precio no inventa una proporción', () => {
  assert.equal(topeDeDeduccion('automovil', null).muerde, null)
  assert.equal(topeDeDeduccion('lo que sea', 1_000_000).muerde, null)
})

// ═══ LA TASA REAL: FISHER, IMPORTADO, NO REIMPLEMENTADO ═══
test('la tasa real usa el Fisher de rodados-plan, no una resta ni una copia', () => {
  const inf = inflacionDeTrabajo().anual
  const tea = teaDeLaTna(CAMPANA_BICE.tna)
  assert.equal(tasaRealLeasing(tea, inf), tasaReal(tea, inf))
  // Y NO es la resta ingenua: la resta exagera lo barato que sale.
  //
  // EL UMBRAL ERA UN NÚMERO DEL MES. Decía `> 0.015` porque con 29,83% de inflación la brecha daba
  // casi dos puntos; al cargar julio del INDEC la inflación bajó a 27,32%, la brecha se achicó y el
  // test se puso rojo sin que Fisher cambiara. La brecha es una IDENTIDAD algebraica:
  //
  //     fisher − resta = (tea−inf)/(1+inf) − (tea−inf) = −(tea−inf)·inf/(1+inf)
  //
  // Afirmarla exacta prueba más que cualquier umbral y no depende de qué publique el INDEC.
  const resta = tea - inf
  const brecha = tasaRealLeasing(tea, inf) - resta
  assert.ok(Math.abs(brecha - (-(tea - inf) * inf / (1 + inf))) < 1e-12, `brecha=${brecha}`)
  assert.ok(tasaRealLeasing(tea, inf) > resta, 'la resta ingenua sobreestima lo barato que sale')
})

test('sin tasa nominal no hay tasa real: null, no NaN con cara de número', () => {
  assert.equal(tasaRealLeasing(null), null)
  assert.equal(tasaRealLeasing(undefined), null)
  assert.equal(tasaRealLeasing(0.21, 'inflación'), null)
  assert.equal(teaDeLaTna(null), null)
})

// LOS NÚMEROS DEL INFORME. Si el IPC se actualiza y la inflación se mueve, este test se mueve con
// ella: por eso compara contra `inflacionDeTrabajo()`, no contra un 29,83% tipeado.
test('el leasing da tasa real NEGATIVA (~−6,6%) y aun así FONDEFIN le gana', () => {
  // ═══ SOBRE EL DATO VIVO SE AFIRMAN PROPIEDADES ═══
  //
  // El comentario de arriba decía que este test «se mueve con» el IPC porque compara contra
  // `inflacionDeTrabajo()` — y en la línea siguiente clavaba el RESULTADO en −0,0659, que es
  // exactamente lo mismo que tipear la inflación. Al cargar julio del INDEC se puso rojo.
  const r = rankingReal()
  assert.ok(r.leasing_bice.tasa_real < 0, 'la tasa real del leasing es negativa')
  assert.equal(r.leasing_bice.es_piso, true)
  assert.ok(r.criterio_homogeneo.fondefin < r.criterio_homogeneo.leasing_bice)
  assert.equal(r.criterio_homogeneo.gana, 'fondefin')
  assert.equal(FONDEFIN_PARA_COMPARAR.tna, 0.136875)

  // ═══ Y LOS NÚMEROS DEL INFORME, CON LA INFLACIÓN QUE EL INFORME USÓ ═══
  //
  // 29,83% es el dato con el que se escribió el informe. Fijándolo, los números vuelven a ser
  // verificables a mano y no se mueven nunca más: es la diferencia entre citar un informe y afirmar
  // el presente. Si mañana hay que rehacer el informe, se cambia acá a propósito.
  const delInforme = rankingReal(ANUAL_DEL_INFORME)
  assert.ok(Math.abs(delInforme.leasing_bice.tasa_real - (-0.0659)) < 0.0005)
  assert.ok(Math.abs(delInforme.criterio_homogeneo.fondefin - (-0.1175)) < 0.0005)
})

test('el producto permanente entra al ranking SIN tasa y con el motivo, no con un promedio', () => {
  const r = rankingReal()
  assert.equal(r.leasing_bice_permanente.nominal, null)
  assert.equal(r.leasing_bice_permanente.tasa_real, null)
  assert.match(r.leasing_bice_permanente.motivo, /se cotiza caso por caso/)
})

// ═══ LA CUENTA EN PESOS DE HOY ═══
test('el costo en pesos de hoy reusa cuadroFrances y no reimplementa la cuota', () => {
  const precio = 29_400_000
  const c = costoEnPesosDeHoy(precio)
  const cuadro = cuadroFrances(precio, CAMPANA_BICE.tna, { cuotas: 36, iva: null, cftPublicado: null })
  assert.equal(c.canonMensual, cuadro.filas[0].cuota)
  assert.equal(c.totalNominal, cuadro.totalPagado)
})

/** La inflación con la que se escribió el informe. Anual medida entonces; mensual derivada de ella. */
const ANUAL_DEL_INFORME = 0.2983421231215264
const MENSUAL_DEL_INFORME = (1 + ANUAL_DEL_INFORME) ** (1 / 12) - 1

test('las dos referencias del OS dan los números del informe', () => {
  // `precio`, `canonMensual` y `totalNominal` NO dependen de la inflación: son precio y tasa. Sólo
  // el total EN PESOS DE HOY y el ahorro contra el contado se descuentan con ella, así que esos dos
  // se miden con la inflación del informe y no con la viva. Antes se corría todo con la viva y los
  // cinco números clavados: al cargar julio del INDEC, `totalPesosDeHoy` pasó de 26.774.155 a
  // 27.492.592 —menos inflación descuenta menos— y el test se puso rojo con el cálculo intacto.
  //
  // La mensual se DERIVA de la anual del informe, no se tipea aparte: dos constantes que tienen que
  // ser la misma tasa terminan divergiendo en el tercer decimal y nadie sabe cuál era la buena.
  const [dfsk, usd] = costoDeCadaReferencia({ inflacionMensual: MENSUAL_DEL_INFORME })

  assert.equal(dfsk.precio, 29_400_000)
  assert.equal(Math.round(dfsk.canonMensual), 1_084_388)
  assert.equal(Math.round(dfsk.totalNominal), 39_037_959)
  assert.equal(Math.round(dfsk.totalPesosDeHoy), 26_774_155)
  // EL NÚMERO QUE DECIDE: en pesos de hoy el leasing sale MENOS que pagar al contado.
  assert.ok(dfsk.ahorroContraElContado > 0)
  assert.equal(Math.round(dfsk.ahorroContraElContado), 2_625_845)

  assert.equal(usd.precio, 37_875_000)
  assert.equal(Math.round(usd.canonMensual), 1_396_979)
  assert.equal(Math.round(usd.totalNominal), 50_291_248)
  assert.equal(Math.round(usd.totalPesosDeHoy), 34_492_215)
  assert.equal(Math.round(usd.ahorroContraElContado), 3_382_785)
})

test('financia el 100% y no exige anticipo — no es un supuesto, es lo que publica el banco', () => {
  const c = costoEnPesosDeHoy(29_400_000)
  assert.equal(c.anticipo, 0)
  assert.equal(c.financiado, 29_400_000)
  assert.equal(CAMPANA_BICE.financia, 1)
  assert.equal(CAMPANA_BICE.anticipo, 0)
})

// El defecto que atrapa: leer el total como si fuera el costo de quedarse con la unidad. No lo es:
// falta el valor residual, que el banco no publica.
test('todos los totales son PISO y avisan que el valor residual no está incluido', () => {
  const c = costoEnPesosDeHoy(29_400_000)
  assert.equal(c.esPiso, true)
  assert.equal(c.ivaDelCanon, null)
  assert.match(c.advertencia, /valor residual/)
  assert.match(c.advertencia, /no está incluido en este total/)
  assert.match(CAMPANA.observaciones, /EL VALOR RESIDUAL NO ESTÁ PUBLICADO Y NO ESTÁ INCLUIDO EN NINGÚN TOTAL/)
  assert.ok(CAMPANA.desconocido.some((d) => /valor residual/.test(d)))
})

test('un precio inválido no devuelve un cuadro con cara de válido', () => {
  assert.equal(costoEnPesosDeHoy(0), null)
  assert.equal(costoEnPesosDeHoy(-1), null)
  assert.equal(costoEnPesosDeHoy('mucha plata'), null)
})

test('las referencias son las dos que ya están en el OS, sin inventar una tercera', () => {
  assert.equal(REFERENCIAS.length, 2)
  assert.deepEqual(REFERENCIAS.map((r) => r.precio), [29_400_000, 37_875_000])
  assert.match(REFERENCIAS[1].origen, /TC oficial \$1\.515/)
})

// ═══ LA VARA: EL ÚNICO LEASING CON CFT PUBLICADO, Y ESTÁ VENCIDO ═══
//
// El defecto que atrapa: ofrecer el leasing de Ford como alternativa vigente, o usar su CFT para
// "completar" el CFT que BICE no publica.
test('Ford/Comafi entra como VARA vencida, no como alternativa', () => {
  assert.equal(ANCLA_FORD_COMAFI.vigente_hoy, false)
  assert.equal(ANCLA_FORD_COMAFI.vigencia_declarada.hasta, '2026-06-30')
  assert.equal(ANCLA_FORD_COMAFI.variantes[0].tna, 0.29)
  assert.equal(ANCLA_FORD_COMAFI.variantes[0].cft, 0.4433)
  // Y el CFT es el ÚNICO campo que no es piso en todo el módulo: es un total publicado.
  const r = rankingReal()
  assert.equal(r.leasing_de_mercado_ford_comafi.vigente, false)
  assert.equal(r.leasing_de_mercado_ford_comafi.es_piso, false)
  assert.match(r.leasing_de_mercado_ford_comafi.motivo, /no se ofrece como alternativa/)
})

test('un leasing SIN convenio estatal da tasa real POSITIVA: la campaña es la excepción, no la regla', () => {
  // La PROPIEDAD sobre el dato vivo: sin convenio estatal el leasing cuesta por encima de la
  // inflación, y la distancia contra el subsidiado es grande. «Grande» se expresa contra la brecha
  // de tasas nominales, que es lo que la causa; un umbral en puntos absolutos se mueve con el IPC.
  const r = rankingReal()
  const mercado = r.leasing_de_mercado_ford_comafi.tasa_real
  assert.ok(mercado > 0, 'el leasing de mercado cuesta por encima de la inflación')
  assert.ok(mercado > r.leasing_bice.tasa_real, 'el subsidiado tiene que salir menos')
  // El número del informe, con la inflación del informe.
  const delInforme = rankingReal(ANUAL_DEL_INFORME)
  assert.ok(Math.abs(delInforme.leasing_de_mercado_ford_comafi.tasa_real - 0.1117) < 0.0005)
  assert.ok(delInforme.leasing_de_mercado_ford_comafi.tasa_real - delInforme.leasing_bice.tasa_real > 0.17)
})

test('el CFT de Ford casi duplica su TNA: es la medida de lo que BICE NO publica', () => {
  const v = ANCLA_FORD_COMAFI.variantes[0]
  assert.ok(v.cft - v.tna > 0.15, 'quince puntos entre TNA y CFT')
  assert.match(CAMPANA.observaciones, /CUÁNTO CUESTA UN LEASING SIN CONVENIO ESTATAL: 44,33% DE CFT/)
  assert.ok(CAMPANA.desconocido.some((d) => /Ford\/Comafi/.test(d)))
})

// ═══ LA FIANZA DE SOCIOS: DOS FUENTES OFICIALES QUE SE CONTRADICEN ═══
//
// El defecto que atrapa —y sería el peor de todo el informe—: vender "no hay prenda" como si
// significara "no hay garantía", cuando puede haber aval personal de los dueños.
test('la contradicción sobre la fianza de socios está declarada SIN resolver', () => {
  assert.equal(FIANZA_DE_SOCIOS.se_contradicen, true)
  assert.equal(FIANZA_DE_SOCIOS.resuelto, false)
  assert.match(FIANZA_DE_SOCIOS.lo_que_dice_el_banco, /bice\.com\.ar/)
  assert.match(FIANZA_DE_SOCIOS.lo_que_dice_el_estado, /argentina\.gob\.ar/)
  assert.match(FIANZA_DE_SOCIOS.por_que_importa, /garantía PERSONAL de los socios/)
  assert.match(FIANZA_DE_SOCIOS.por_que_importa, /patrimonio de los dueños/)
  // Y llega a la fila y a las preguntas: no muere en una constante del módulo.
  assert.match(CAMPANA.observaciones, /LA FIANZA DE SOCIOS/)
  assert.ok(CAMPANA.preguntar.some((p) => /FIANZA DE SOCIOS O ACCIONISTAS/.test(p)))
  assert.ok(CAMPANA.desconocido.some((p) => /FIANZA DE SOCIOS/.test(p)))
})

// ═══ EL VALOR RESIDUAL: BAJO, Y POR ESO PELIGROSO ═══
test('no hay dato sectorial de valor residual, y las evidencias apuntan a ~1 canon', () => {
  assert.equal(VALOR_RESIDUAL_DE_MERCADO.hay_dato_sectorial_publicado, false)
  assert.ok(VALOR_RESIDUAL_DE_MERCADO.evidencias.length >= 4)
  const ford = VALOR_RESIDUAL_DE_MERCADO.evidencias[0]
  assert.ok(ford.proporcion_aprox < 0.05, 'un canon es menos del 5% del bien')
  // Las evidencias sin porcentaje llevan null, no un punto sacado de un rango. BBVA publica "5% O
  // 30%": elegir uno de los dos, o promediarlos, sería fabricar precisión sobre un rango de 6 a 1.
  const bbva = VALOR_RESIDUAL_DE_MERCADO.evidencias.find((e) => /BBVA/.test(e.quien))
  assert.equal(bbva.proporcion_aprox, null, 'un rango "5% o 30%" no se colapsa a un número')
  assert.match(bbva.residual, /5% o 30%/)
  const bice = VALOR_RESIDUAL_DE_MERCADO.evidencias.find((e) => /BICE/.test(e.quien))
  assert.equal(bice.proporcion_aprox, null, 'BICE no publica porcentaje: null, no el de Ford')
  assert.equal(VALOR_RESIDUAL_DE_MERCADO.confianza, 'media-alta')
  // El dato viejo se descarta POR ESCRITO, no en silencio.
  assert.match(VALOR_RESIDUAL_DE_MERCADO.descartado, /2009/)
})

test('un residual bajo NO se vende como ventaja: dispara el art. 7 y se dice', () => {
  assert.match(VALOR_RESIDUAL_DE_MERCADO.riesgo_fiscal, /art\. 7 Decreto 1038\/2000/)
  assert.match(VALOR_RESIDUAL_DE_MERCADO.riesgo_fiscal, /venta financiada/)
  assert.match(VALOR_RESIDUAL_DE_MERCADO.inferencia, /El residual NO baja la cuota/)
  assert.match(CAMPANA.observaciones, /ES UN RIESGO FISCAL, NO UNA GANGA/)
})

// ═══ EL PLAZO CONTRA EL MERCADO Y CONTRA LA LEY ═══
test('el plazo de mercado (31 meses) deja seis meses de aire sobre el piso fiscal de 30', () => {
  assert.equal(MERCADO_DE_LEASING.plazo_promedio_meses, 31)
  assert.equal(MERCADO_DE_LEASING.publicado_el, '2026-08-12')
  assert.ok(MERCADO_DE_LEASING.plazo_promedio_meses > 30, 'el promedio de mercado supera el piso fiscal, pero apenas')
  assert.ok(CAMPANA_BICE.plazo_meses > MERCADO_DE_LEASING.plazo_promedio_meses)
  assert.match(MERCADO_DE_LEASING.lectura, /borde alto/)
  assert.match(CAMPANA.observaciones, /ESTÁ EN EL BORDE ALTO DE LA PRÁCTICA, NO ES CORTO/)
})

// ═══ LAS PUERTAS QUE NO SON LEASING PERO PUEDEN GANAR ═══
//
// El defecto que atrapa: acotar el informe al título ("leasing") y esconder una línea provincial más
// barata que todo. Eso sería un error de alcance disfrazado de rigor.
test('la línea provincial de San Juan entra al módulo, con su tasa y con su hueco', () => {
  const sj = OTRAS_PUERTAS.find((p) => /Programa provincial San Juan/.test(p.que))
  assert.ok(sj)
  assert.equal(sj.tna, 0.132)
  assert.match(sj.hueco, /NO está publicado si "bienes de capital en general" incluye rodados/)
  // Es más barata que la campaña de leasing y eso se dice, aunque no sea leasing.
  assert.ok(sj.tna < CAMPANA_BICE.tna)
  assert.match(CAMPANA.observaciones, /HAY UNA PUERTA EN SAN JUAN QUE PUEDE SER MÁS BARATA QUE TODO ESTO/)
})

test('el leasing en dólares de Stellantis entra CON su asterisco, no con su tasa sola', () => {
  const st = OTRAS_PUERTAS.find((p) => /Stellantis/.test(p.que))
  assert.equal(st.tna, 0.1075)
  assert.match(st.hueco, /Comunicación A 4015/)
  assert.match(st.hueco, /NO califica/)
  assert.match(st.hueco, /riesgo de tipo de cambio/)
})

test('cada otra puerta trae su hueco y su fuente: ninguna entra como recomendación limpia', () => {
  assert.ok(OTRAS_PUERTAS.length >= 3)
  for (const p of OTRAS_PUERTAS) {
    assert.ok(p.hueco?.length > 20, `${p.que} entra sin hueco declarado`)
    assert.ok(p.fuente?.length > 10)
    assert.ok(p.por_que_importa?.length > 20)
  }
})

// ═══ EL BARRIDO NEGATIVO ES UN RESULTADO ═══
//
// El defecto que atrapa: que alguien "complete" la ficha con una tasa de leasing de otro banco. No
// hay ninguna publicada, y acá está escrito dónde se buscó.
test('el barrido de bancos sin tasa publicada está declarado, con quién y qué se buscó', () => {
  assert.ok(SIN_TASA_PUBLICADA.length >= 14, 'el barrido cubrió banca comercial, provincial y marcas')
  for (const s of SIN_TASA_PUBLICADA) {
    assert.ok(s.entidad?.length > 3)
    assert.ok(s.que_se_buscó?.length > 5)
    assert.ok(s.resultado?.length > 10)
  }
  for (const nombre of ['Santander', 'Nación', 'Macro', 'Galicia', 'BBVA', 'Comafi', 'San Juan', 'Volkswagen']) {
    assert.ok(SIN_TASA_PUBLICADA.some((s) => new RegExp(nombre).test(s.entidad)), `falta ${nombre} en el barrido`)
  }
  // Renault NO ofrece leasing y eso también es un resultado, distinto de "no publica tasa".
  const renault = SIN_TASA_PUBLICADA.find((s) => /Renault/.test(s.entidad))
  assert.equal(renault.ofrece_leasing, false)
  // Lo que no se pudo leer va en null: ni true ni false.
  assert.ok(SIN_TASA_PUBLICADA.some((s) => s.ofrece_leasing === null))
  // Toyota no se pudo leer: NO se afirma que no publique. La diferencia importa.
  const toyota = SIN_TASA_PUBLICADA.find((s) => /Toyota/.test(s.entidad))
  assert.match(toyota.resultado, /NO se afirma que no publique/)
})

test('el producto permanente dice, sin rodeos, que no publica tasa', () => {
  assert.equal(PERMANENTE.tna, null)
  assert.equal(PERMANENTE.tea, null)
  assert.equal(PERMANENTE.cft, null)
  assert.equal(PRODUCTO_PERMANENTE_BICE.tna, null)
  assert.match(PERMANENTE.observaciones, /NO PUBLICA TASA/)
  assert.ok(PERMANENTE.desconocido.some((d) => /^TASA — no publicada/.test(d)))
})

// ═══ LA FILA QUE VA A LA BASE ═══
test('tipo_financiacion es "otro" porque la tabla no tiene "leasing", y se explica', () => {
  for (const c of CONDICIONES_LEASING) assert.equal(c.tipo_financiacion, 'otro')
  assert.match(CAMPANA.observaciones, /TIPO_FINANCIACION = "otro" PORQUE LA TABLA NO TIENE "leasing"/)
  // Y el motivo es de fondo, no de conveniencia: un leasing no mete el bien en el activo.
  assert.match(CAMPANA.observaciones, /es justo lo que un leasing no es/)
})

test('filaParaLaTabla saca lo que no es columna y NO tira los huecos: los pliega', () => {
  const fila = filaParaLaTabla(CAMPANA)
  for (const k of NO_SON_COLUMNAS) assert.ok(!(k in fila), `${k} no es columna`)
  assert.match(fila.observaciones, /LO QUE EL BANCO NO PUBLICA \(\d+\)/)
  assert.match(fila.observaciones, /PREGUNTAS AL BANCO \(\d+\)/)
  // Los huecos llegan ENTEROS a Postgres: si mueren acá, la Web muestra una ficha que parece completa.
  for (const d of CAMPANA.desconocido) assert.ok(fila.observaciones.includes(d))
  for (const p of CAMPANA.preguntar) assert.ok(fila.observaciones.includes(p))
})

test('filaParaLaTabla no muta la condición original', () => {
  const antes = JSON.stringify(CAMPANA)
  filaParaLaTabla(CAMPANA)
  assert.equal(JSON.stringify(CAMPANA), antes)
})

test('las dos filas tienen las columnas obligatorias y valores admitidos por la tabla', () => {
  const filas = filasParaLaTabla()
  assert.equal(filas.length, 2)
  const TIPOS = ['descubierto', 'prestamo', 'descuento_cheque', 'echeq', 'tarjeta', 'financiacion_proveedor', 'pago_diferido', 'impuesto', 'otro']
  const CONFIANZA = ['verificado', 'informado', 'estimado', 'pendiente']
  for (const f of filas) {
    assert.ok(f.entidad && f.producto && f.fuente, 'entidad, producto y fuente son NOT NULL')
    assert.ok(TIPOS.includes(f.tipo_financiacion))
    assert.ok(CONFIANZA.includes(f.nivel_confianza))
    assert.equal(f.moneda, 'ARS')
  }
  // La clave única es (entidad, producto, tipo, moneda, vigencia_desde): las dos filas no colisionan.
  const claves = filas.map((f) => [f.entidad, f.producto, f.tipo_financiacion, f.moneda, f.vigencia_desde].join('|'))
  assert.equal(new Set(claves).size, 2)
})

// ═══ QUE LA FICHA SOBREVIVA A LOS CONSUMIDORES QUE YA EXISTEN ═══
test('costoEfectivo no inventa un costo sobre una línea sin CFT ni IVA', () => {
  const r = costoEfectivo(filaParaLaTabla(CAMPANA), 29_400_000, 1095)
  assert.ok(r, 'costoEfectivo tiene que poder recibir esta fila sin explotar')
})

test('paramsParaMotor NO mete el leasing en el motor de tesorería: no es capital de trabajo', () => {
  for (const c of CONDICIONES_LEASING) assert.equal(c.limite_disponible, null)
  const p = paramsParaMotor(filasParaLaTabla())
  assert.ok(p, 'paramsParaMotor tiene que tolerar estas filas')
})

// ═══ LO QUE SE PREGUNTA ANTES DE IR AL BANCO ═══
test('el OS no supone que exista una cotización de leasing: la pregunta', () => {
  assert.ok(PREGUNTAR_AL_DUEÑO.length >= 4)
  assert.match(PREGUNTAR_AL_DUEÑO[0], /¿De dónde salió la idea del leasing\?/)
  assert.ok(PREGUNTAR_AL_DUEÑO.some((p) => /USD 25\.000/.test(p)), 'el utilitario sin modelo es el hueco que más pesa')
  assert.match(CAMPANA.observaciones, /ESTA FICHA NO RECUPERA NADA/)
})

test('cada condición trae huecos y preguntas: una ficha sin límites conocidos es sospechosa', () => {
  for (const c of CONDICIONES_LEASING) {
    assert.ok(c.desconocido.length >= 5, `${c.clave} declara pocos huecos`)
    assert.ok(c.preguntar.length >= 3, `${c.clave} no pregunta nada`)
    assert.equal(c.nivel_confianza, 'informado')
    assert.match(c.fuente, /bice\.com\.ar/)
    assert.match(c.fuente, /13\/08\/2026/)
  }
})
