// COHERENCIA INTERNA DE LOS PRESUPUESTOS DE RODADOS. Cada test acá abajo atrapa un defecto concreto
// que ya habría cambiado una decisión de compra, no acompaña al código que lo produjo.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PRESUPUESTOS_RODADOS, CONDICION_CREDITO_RODADO, presupuestosAlDia, estaVigente, tienePrecio, loQueFalta,
  airbagDeSerie, equipamientoFaltante, versionesDe,
} from './rodados-datos.mjs'
import { paramsParaMotor } from './condiciones-financieras.mjs'
import { compararFinanciamiento } from './ingenieria-financiera.mjs'

const dfsk = () => PRESUPUESTOS_RODADOS.find((p) => p.clave === 'dfsk-c32-doble-cabina-lepont')
const zanella = () => PRESUPUESTOS_RODADOS.find((p) => p.clave === 'zanella-z-truck')
const forma = (clave) => dfsk().formasDePago.find((f) => f.clave === clave)

// ── 0 · EL DOCUMENTO DEL DUEÑO, PALABRA POR PALABRA ──────────────────────────────────────────────
//
// DEFECTO QUE ATRAPA: que alguien pise un número con otro PLAUSIBLE. Éste es el modo de falla real —
// nadie escribe $99.999.999, escriben $33.000.000 en vez de $33.400.000, o "cabina simple", o 12
// cuotas en vez de 24. Todo eso pasa cualquier validación de forma y ninguna de las de abajo si el
// que edita "corrige" también la aritmética.
//
// POR QUÉ UN TEST DE LITERALES ES LEGÍTIMO ACÁ Y NO EN OTRO LADO. `rodados-datos.mjs` no calcula: es
// la TRANSCRIPCIÓN de un papel. Este test es la SEGUNDA copia independiente de ese papel, escrita
// desde el mensaje del dueño del 13/08/2026. Para que las dos digan lo mismo estando mal, hay que
// equivocarse dos veces igual — que es exactamente la protección que se busca.

test('el presupuesto del DFSK dice lo que dice el papel del dueño, y nada más', () => {
  const p = dfsk()
  assert.equal(p.unidad.marca, 'DFSK')
  assert.equal(p.unidad.modelo, 'C32')
  assert.equal(p.unidad.version, 'Doble Cabina', 'es DOBLE CABINA: una cabina simple es otra camioneta y otro precio')
  assert.equal(p.precioUnidad, 33_400_000, 'precio agosto 2026')
  assert.equal(p.gastosRetiro, 3_600_000, 'gastos de retiro, incluye prenda')
  assert.equal(p.total, 37_000_000, 'total IVA incluido, puesto en calle')
  assert.equal(p.ivaIncluido, true)
})

test('las dos formas de pago son las del papel: A efectivo, B seis eCheq, mismo crédito', () => {
  const a = forma('a-efectivo')
  const b = forma('b-echeq-6')
  assert.equal(a.letra, 'A')
  assert.equal(a.anticipoEfectivo, 12_482_500)
  assert.equal(a.financiado, 24_517_500)
  assert.equal(b.letra, 'B')
  assert.equal(b.cheques.cantidad, 6, 'son SEIS eCheq')
  assert.equal(b.cheques.importeCadaUno, 2_579_717, 'cada uno, no los seis juntos')
  assert.deepEqual(b.cheques.plazosDias, [30, 60, 90, 120, 150, 180], 'de 30 a 180 días, cada 30')
  assert.equal(b.financiado, 24_517_500, 'el crédito es el MISMO en las dos formas: sin eso no son comparables')
})

test('el crédito es Santander UVA, TNA 0%, 24 meses — no 12, no 36, no otro banco', () => {
  assert.match(CONDICION_CREDITO_RODADO.entidad, /Santander/)
  assert.match(CONDICION_CREDITO_RODADO.producto, /UVA/)
  assert.equal(CONDICION_CREDITO_RODADO.tna, 0)
  assert.match(CONDICION_CREDITO_RODADO.amortizacion, /^24 cuotas/, 'son 24 cuotas')
})

// ── 1 · La aritmética del presupuesto tiene que cerrar ───────────────────────────────────────────
// DEFECTO QUE ATRAPA: un dígito mal transcripto de la foto. $12.482.500 escrito $12.482.000 no rompe
// nada, no da error, y deja al OS contestando un anticipo falso hasta que alguien vuelva a la foto.
// Estos test son la red que atrapa la pisada de UN solo número: cada cifra está amarrada a las otras.

test('el precio más los gastos de retiro dan el total declarado', () => {
  const p = dfsk()
  assert.equal(p.precioUnidad + p.gastosRetiro, p.total)
})

test('el anticipo en efectivo es lo que el crédito NO cubre del precio, más todos los gastos', () => {
  // 33.400.000 − 24.517.500 + 3.600.000 = 12.482.500. Esta identidad es la que ata el anticipo al
  // precio: pisar el precio dejando el total y el anticipo intactos rompe acá y en ningún otro lado.
  const p = dfsk()
  const a = forma('a-efectivo')
  assert.equal(p.precioUnidad - a.financiado + p.gastosRetiro, a.anticipoEfectivo)
})

test('la forma de pago que declara cerrar contra el total, cierra', () => {
  for (const p of PRESUPUESTOS_RODADOS) {
    for (const f of p.formasDePago ?? []) {
      if (!f.cierraContraTotal) continue
      const suma = (f.anticipoEfectivo ?? 0) + (f.financiado ?? 0)
      assert.equal(suma, p.total, `${p.clave}/${f.clave}: ${suma} ≠ ${p.total}`)
    }
  }
})

test('la forma de pago que NO cierra contra el total dice si es sobreprecio o documento incompleto', () => {
  // Un descuadre sin explicación es indistinguible de un error de tipeo. Y la explicación no puede
  // ser prosa libre: son dos causas distintas con consecuencias opuestas. `recargo-por-plazo` es un
  // hecho económico que hay que MEDIR; `documento-incompleto` es un dato que hay que ir a BUSCAR.
  for (const p of PRESUPUESTOS_RODADOS) {
    for (const f of p.formasDePago ?? []) {
      if (f.cierraContraTotal) continue
      assert.ok(
        ['recargo-por-plazo', 'documento-incompleto'].includes(f.motivoDeDescuadre),
        `${p.clave}/${f.clave}: descuadra y no dice por qué (motivoDeDescuadre="${f.motivoDeDescuadre}")`,
      )
    }
  }
})

test('el eCheq confirmado por el dueño lleva la fecha de la confirmación', () => {
  // La transcripción del 07/08 no podía saber si $2.579.717 era por cheque o el total, y lo dejó
  // escrito. El 13/08 el dueño lo confirmó. Si alguien vuelve a marcar esto como ambiguo, o borra la
  // confirmación, el importe vuelve a ser opinable y la comparación contra el descubierto se cae.
  const b = forma('b-echeq-6')
  assert.equal(b.confirmadoPorDueno, '2026-08-13')
  assert.equal(b.ambiguedad, undefined, 'ya no hay ambigüedad: la cerró el dueño con el papel en la mano')
})

test('la cuota del crédito por el plazo reconstruye el capital financiado', () => {
  // 24 × 1.021.563 = 24.517.512 contra 24.517.500 financiados: 12 pesos de redondeo del vendedor.
  // Si la cuota, la CANTIDAD DE CUOTAS o el capital se tipean mal, la diferencia se dispara y grita.
  // Con 12 cuotas la diferencia sería de $12,2 millones; con 36, de $12,3 millones.
  const f = forma('a-efectivo')
  const cuota = 1_021_563
  const cuotas = 24
  const dif = Math.abs(cuota * cuotas - f.financiado)
  assert.ok(dif <= 100, `la cuota no reconstruye el capital: diferencia ${dif}`)
  assert.ok(CONDICION_CREDITO_RODADO.amortizacion.includes('1.021.563'))
})

test('los plazos de los eCheq son una escalera pareja de 30 en 30, y son tantos como cheques', () => {
  // DEFECTO QUE ATRAPA: "6 cheques a 180 días" en vez de "6 cheques DE 30 A 180". El nominal no
  // cambia —siguen siendo 6 × $2.579.717— pero el plazo promedio pasa de 105 a 180 días y el costo
  // financiero implícito cae de 111% a 55% anual: la misma plata, media tasa, otra decisión.
  const ch = forma('b-echeq-6').cheques
  assert.equal(ch.plazosDias.length, ch.cantidad, 'hay un plazo por cheque')
  ch.plazosDias.forEach((d, i) => assert.equal(d, 30 * (i + 1), `el cheque ${i + 1} vence a los ${30 * (i + 1)} días`))
})

// ── 2 · Un presupuesto vencido tiene que verse vencido ───────────────────────────────────────────
// DEFECTO QUE ATRAPA: el OS contestando "$37.000.000" en octubre como si fuera el precio de hoy. El
// presupuesto venció el 10/08/2026 y esto no se prorroga solo.

test('el presupuesto del DFSK está vencido a la fecha del pedido (13/08/2026)', () => {
  const p = presupuestosAlDia('2026-08-13').find((x) => x.clave === 'dfsk-c32-doble-cabina-lepont')
  assert.equal(p.vigente, false)
  assert.equal(p.dias_vencido, 3)
})

test('estaba vigente el día que lo emitieron y el último día de validez', () => {
  const p = dfsk()
  assert.equal(estaVigente(p, '2026-08-06'), true)
  assert.equal(estaVigente(p, '2026-08-10'), true)
  assert.equal(estaVigente(p, '2026-08-11'), false)
})

test('un documento sin vigencia declarada devuelve null, no "vigente"', () => {
  // Las fichas técnicas no vencen porque no cotizan. Devolver true las haría pasar por presupuestos
  // vivos; devolver false las descartaría de una comparación técnica legítima.
  const zanella = PRESUPUESTOS_RODADOS.find((p) => p.clave === 'zanella-z-truck')
  assert.equal(estaVigente(zanella, '2026-12-31'), null)
})

// ── 3 · El crédito UVA NO puede entrar al comparador como plata gratis ───────────────────────────
// ÉSTE ES EL TEST CARO. Si alguien le pone `limite_disponible` a la condición "para que se vea en el
// tablero", `paramsParaMotor` la toma como línea disponible y `compararFinanciamiento` calcula sus
// intereses con TNA 0 → costo financiero CERO. A partir de ahí el motor recomienda financiar
// CUALQUIER pago con el crédito del auto, para siempre, con justificación numérica impecable.

test('la condición del crédito no lleva límite disponible: no es capital de trabajo', () => {
  assert.equal(CONDICION_CREDITO_RODADO.limite_disponible, null)
  const { params } = paramsParaMotor([CONDICION_CREDITO_RODADO])
  assert.equal(params.tasaPrestamoTNA, undefined, 'el crédito del rodado no debe alimentar al comparador')
})

test('si el crédito entrara al comparador, le ganaría al descubierto con costo cero', () => {
  // El defecto demostrado, no descripto. Se fuerza la condición equivocada y se mide el daño.
  const conLimite = { ...CONDICION_CREDITO_RODADO, limite_disponible: 24_517_500 }
  const { params } = paramsParaMotor([conLimite])
  assert.equal(params.tasaPrestamoTNA, 0)

  const r = compararFinanciamiento({ monto: 10_000_000, dias: 30, ...params })
  const prestamo = r.alternativas.find((a) => a.via === 'prestamo')
  const descubierto = r.alternativas.find((a) => a.via === 'descubierto')
  assert.equal(prestamo.costoFinanciero, 0)
  assert.ok(descubierto.costoFinanciero > 0)
  assert.ok(
    prestamo.costoEconomico < descubierto.costoEconomico,
    'con TNA 0% el crédito del rodado le gana al descubierto — por eso no lleva límite',
  )
})

test('la observación de la condición advierte que la TNA 0% es nominal', () => {
  // La salvaguarda de arriba es estructural; ésta es la que lee un humano. Si se borra el aviso, el
  // número 0 queda solo y se lee como "gratis".
  const o = CONDICION_CREDITO_RODADO.observaciones
  assert.match(o, /UVA|CER/)
  assert.match(o, /NOMINAL|nominal/)
})

test('la tasa está declarada como TNA y no se inventan TEA ni CFT', () => {
  // El presupuesto dice literalmente "TNA 0%". Rellenar tea o cft para "completar" sería fabricar.
  assert.equal(CONDICION_CREDITO_RODADO.tna, 0)
  assert.equal(CONDICION_CREDITO_RODADO.tea, null)
  assert.equal(CONDICION_CREDITO_RODADO.cft, null)
  assert.ok(CONDICION_CREDITO_RODADO.desconocido.some((d) => /CFT/.test(d)))
})

// ── 4 · Trazabilidad: nada sin adjunto, nada faltante en silencio ────────────────────────────────

test('toda condición y todo presupuesto declaran de qué adjunto salieron', () => {
  assert.ok(CONDICION_CREDITO_RODADO.fuente?.includes('aaee8a95'))
  for (const p of PRESUPUESTOS_RODADOS) {
    assert.ok(p.adjuntos?.length, `${p.clave} sin adjunto declarado`)
    assert.ok(p.adjuntos.every((a) => a.includes('aaee8a95')), `${p.clave}: adjunto con nombre ajeno al pedido`)
  }
})

test('un presupuesto sin precio dice por qué no lo tiene', () => {
  // DEFECTO QUE ATRAPA: una alternativa que aparece en la lista sin precio y sin explicación se lee
  // como "todavía no lo cargaron", cuando en realidad nunca hubo cotización.
  for (const p of PRESUPUESTOS_RODADOS.filter((x) => !tienePrecio(x))) {
    assert.ok(
      (p.noLeido ?? []).some((n) => /PRECIO|precio/.test(n.dato)),
      `${p.clave}: no tiene precio y no declara por qué`,
    )
  }
})

test('cada dato no leído dice qué falta y por qué', () => {
  const falta = loQueFalta()
  assert.ok(falta.length >= 8, `se esperaban límites declarados y hay ${falta.length}`)
  for (const f of falta) {
    assert.ok(f.ambito && f.dato && f.motivo && f.tipo, `entrada incompleta: ${JSON.stringify(f)}`)
  }
})

// ── 4 bis · LOS TRES HUECOS QUE EL DUEÑO PIDIÓ DEJAR ESCRITOS ────────────────────────────────────
//
// DEFECTO QUE ATRAPA: que el OS conteste "la camioneta sale $37.000.000" como si eso fuera el costo.
// No lo es mientras no se sepan estas tres cosas — y cada una la tiene que contestar alguien de
// afuera (una aseguradora, el banco, el estudio contable). Si alguien las borra para que la ficha se
// vea completa, esto se pone rojo: un cierre sin límites conocidos es el que hay que sospechar.

test('el seguro del rodado está declarado como NO cotizado', () => {
  const falta = loQueFalta()
  assert.ok(
    falta.some((f) => /seguro del rodado/i.test(f.dato)),
    'falta declarar que nadie cotizó el seguro: es costo de tenencia que no está en ningún número',
  )
})

test('el crédito UVA declara que no se sabe si lleva seguro de vida ni gastos de otorgamiento', () => {
  // El presupuesto dice "24 x 1.021.563 + SEGURO", sin importe. En el prendario que la empresa ya
  // tiene, ese "+ seguro" fue ~$332.000 sobre una cuota de ~$950.000: un tercio más. Tratar la cuota
  // como si fuera $1.021.563 subestima el compromiso mensual.
  const d = CONDICION_CREDITO_RODADO.desconocido
  assert.ok(d.some((x) => /seguro de vida/i.test(x)), 'falta el hueco del seguro de vida sobre saldo deudor')
  assert.ok(d.some((x) => /gastos de otorgamiento/i.test(x)), 'falta el hueco de los gastos de otorgamiento')
})

test('el cómputo del IVA de la compra está declarado NO VERIFICADO, sin afirmar la norma', () => {
  // Regla del dominio fiscal: ninguna alícuota ni encuadre se afirma vigente sin verificarlo en la
  // sesión, y acá no se verificó. Lo que se guarda es la PREGUNTA (si al utilitario doble cabina le
  // aplica el tope de cómputo de automóviles del art. 12 de la Ley de IVA) y a quién se le pregunta.
  // Si alguien reemplaza esto por una respuesta —"sí computa" o "no computa"— se pone rojo: sería
  // una afirmación normativa sin verificación, que es el error más caro de este dominio.
  const iva = dfsk().noLeido.find((n) => /IVA/.test(n.dato))
  assert.ok(iva, 'el presupuesto es "IVA incluido" y no se declara si ese IVA es computable')
  assert.match(iva.motivo, /NO VERIFICADO/, 'tiene que decir que no se verificó')
  assert.match(iva.motivo, /art\. 12/, 'tiene que dejar escrita cuál es la pregunta concreta')
  assert.equal(iva.aQuienSePregunta, 'estudio contable externo')
  assert.ok(
    !/(^|[^o])\bsí computa\b|no computa|corresponde computar/i.test(iva.motivo),
    'no puede contener una respuesta: la norma no se verificó en la sesión',
  )
})

test('el equipamiento de seguridad no afirma lo que la ficha no permite leer', () => {
  // El DFSK: el folleto da 8 tildes para 9 filas, así que ABS/EBD/ESP/DRL no son atribuibles. Si
  // alguien los agrega "porque toda camioneta moderna los trae", esto se pone rojo.
  const p = dfsk()
  const serie = p.fichaTecnica.seguridadDeSerie.join(' ')
  for (const item of ['ABS', 'EBD', 'ESP', 'DRL']) {
    assert.ok(!serie.includes(item), `${item} afirmado de serie sin evidencia en la ficha`)
  }
  assert.ok(p.noLeido.some((n) => n.dato.includes('ABS')))
})

test('el Zanella sí puede afirmar su equipamiento porque la ficha lo marca fila por fila', () => {
  // El contraste importa: no se trata de no afirmar nada, sino de afirmar lo que el documento dice.
  const z = zanella()
  assert.ok(z.fichaTecnica.seguridadDeSerie.some((s) => s.includes('ABS')))
  assert.deepEqual(z.fichaTecnica.seguridadOpcional, ['Air Bag'])
})

// ── 3 bis · EL AIRBAG OPCIONAL ES UN CAMPO, NO UN COMENTARIO ─────────────────────────────────────
// DEFECTO QUE ATRAPA: el motivo por el que se descarta una camioneta enterrado en prosa. Si el dato
// que decide sólo existe en un comentario, la Web no lo muestra, el chat no lo contesta y la próxima
// vez que alguien compare unidades vuelve a mirar las fotos.

test('el airbag del Zanella es OPCIONAL y se consulta con una función, no leyendo el archivo', () => {
  assert.equal(airbagDeSerie(zanella()), false, 'el Zanella trae airbag OPCIONAL: no viene de serie')
  const faltante = equipamientoFaltante(zanella())
  assert.deepEqual(faltante.find((f) => f.item === 'airbag'), { item: 'airbag', estado: 'opcional' })
})

test('el airbag del DFSK es de serie, y donde la ficha no dice nada la respuesta es null', () => {
  // Los tres estados tienen que distinguirse. Si `null` se leyera como `false`, el DFSK aparecería
  // sin ABS —y no es que no lo tenga: es que el folleto no lo dice—.
  assert.equal(airbagDeSerie(dfsk()), true)
  assert.equal(dfsk().fichaTecnica.equipamiento.abs, null)
  assert.equal(airbagDeSerie({ fichaTecnica: { equipamiento: {} } }), null)
  assert.equal(airbagDeSerie(PRESUPUESTOS_RODADOS.find((p) => p.clave === 'foton-tm1')), null)
})

test('el mapa consultable y la prosa del folleto no se contradicen', () => {
  // Existen las dos formas —la lista literal del documento y el mapa que se consulta— y por eso hay
  // que atarlas: un mapa que dice 'serie' mientras la prosa lo lista como opcional es peor que no
  // tener mapa, porque se responde con confianza.
  for (const p of PRESUPUESTOS_RODADOS) {
    const f = p.fichaTecnica
    if (!f?.equipamiento) continue
    const opcional = (f.seguridadOpcional ?? []).join(' ').toLowerCase()
    for (const [item, estado] of Object.entries(f.equipamiento)) {
      if (estado !== 'serie') continue
      assert.ok(!opcional.includes(item.toLowerCase()), `${p.clave}: "${item}" está de serie en el mapa y como opcional en la prosa`)
    }
    if (f.equipamiento.airbag === 'opcional') {
      assert.match(opcional, /air ?bag/, `${p.clave}: el mapa dice airbag opcional y la prosa no lo lista`)
    }
  }
})

// ── 3 ter · LA FICHA DEL ZANELLA, LAS DOS VERSIONES ──────────────────────────────────────────────

test('el Zanella tiene las dos versiones con sus medidas y pesos propios', () => {
  // DEFECTO QUE ATRAPA: guardar una sola versión. La CS tiene 2.800 mm de caja y lleva 2 personas; la
  // CD tiene 2.100 y lleva 4. Elegir con los números de la otra es elegir mal.
  const vs = versionesDe(zanella())
  assert.deepEqual(vs.map((v) => v.codigo), ['CS', 'CD'])
  const cs = vs.find((v) => v.codigo === 'CS')
  const cd = vs.find((v) => v.codigo === 'CD')
  assert.deepEqual(cs.dimensionesMm, { largo: 4880, ancho: 1650, alto: 1925 })
  assert.deepEqual(cs.cajaDeCargaMm, { largo: 2800, ancho: 1560, alto: 360 })
  assert.equal(cs.pasajeros, 2)
  assert.equal(cs.pesoOrdenDeMarchaKg, 1205)
  assert.equal(cs.cargaLegalKg, 1010)
  assert.deepEqual(cd.dimensionesMm, { largo: 4905, ancho: 1650, alto: 1930 })
  assert.deepEqual(cd.cajaDeCargaMm, { largo: 2100, ancho: 1560, alto: 360 })
  assert.equal(cd.pasajeros, 4)
  assert.equal(cd.pesoOrdenDeMarchaKg, 1260)
  assert.equal(cd.cargaLegalKg, 1000)
  assert.equal(cs.pesoBrutoTotalKg, cd.pesoBrutoTotalKg, 'la ficha declara el mismo PBT para las dos')
})

test('el motor del Zanella es el que dice la ficha, en sus dos unidades', () => {
  const m = zanella().fichaTecnica.motor
  assert.equal(m.codigo, '4W12M1')
  assert.equal(m.cilindradaCc, 1206)
  assert.equal(m.potenciaKw, 63)
  assert.equal(m.potenciaCv, 85)
  assert.equal(m.potenciaRpm, 6000)
  assert.equal(zanella().fichaTecnica.distanciaEntreEjesMm, 3070)
})

test('los tres pesos del Zanella no cierran, y eso está declarado en vez de corregido', () => {
  // DEFECTO QUE ATRAPA: que alguien "arregle" el PBT para que la cuenta dé. Peso en orden de marcha
  // más carga legal supera el PBT en las dos versiones (CS 2215 vs 1895). No sabemos cuál de los tres
  // números está mal, y suponerlo cambiaría la carga útil real a la mitad.
  const z = zanella()
  const rota = versionesDe(z).filter((v) => v.pesoOrdenDeMarchaKg + v.cargaLegalKg > v.pesoBrutoTotalKg)
  assert.equal(rota.length, 2, 'las dos versiones no cierran según la ficha')
  assert.ok(
    (z.inconsistencias ?? []).some((i) => /peso bruto total/i.test(i.dato)),
    'la ficha no cierra y no hay ninguna inconsistencia declarada',
  )
  assert.ok(loQueFalta().some((f) => f.tipo === 'inconsistencia'), 'la inconsistencia tiene que viajar en lo que falta')
})

// ── 5 · Las claves no se rompen entre archivos ───────────────────────────────────────────────────

test('la forma de pago apunta a una condición financiera que existe', () => {
  // DEFECTO QUE ATRAPA: renombrar la condición y dejar el puntero colgado. El sync escribiría un
  // snapshot que referencia una clave inexistente y nadie se enteraría.
  for (const p of PRESUPUESTOS_RODADOS) {
    for (const f of p.formasDePago ?? []) {
      if (!f.condicionFinanciera) continue
      assert.equal(f.condicionFinanciera, CONDICION_CREDITO_RODADO.clave)
    }
  }
})

test('la condición trae exactamente las columnas de condiciones_financieras', () => {
  // registrarCondicion arma el INSERT con una lista fija de columnas: una clave de más acá adentro
  // se pierde en silencio, y una obligatoria de menos hace fallar el upsert recién en producción.
  const columnas = new Set(['entidad', 'producto', 'tipo_financiacion', 'moneda', 'vigencia_desde',
    'vigencia_hasta', 'tna', 'tea', 'cft', 'iva_sobre_intereses', 'comisiones', 'gastos', 'plazo_dias',
    'dias_minimos', 'limite_disponible', 'saldo_utilizado', 'amortizacion', 'fecha_debito', 'garantias',
    'fuente', 'nivel_confianza', 'observaciones'])
  const noColumnas = new Set(['clave', 'desconocido', 'adjunto'])
  for (const k of Object.keys(CONDICION_CREDITO_RODADO)) {
    assert.ok(columnas.has(k) || noColumnas.has(k), `clave "${k}" no es columna ni excepción declarada`)
  }
  for (const req of ['entidad', 'producto', 'tipo_financiacion', 'fuente']) {
    assert.ok(CONDICION_CREDITO_RODADO[req], `falta ${req}: registrarCondicion la rechaza`)
  }
})
