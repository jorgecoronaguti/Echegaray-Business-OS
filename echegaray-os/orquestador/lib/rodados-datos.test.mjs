// COHERENCIA INTERNA DE LOS PRESUPUESTOS DE RODADOS. Cada test acá abajo atrapa un defecto concreto
// que ya habría cambiado una decisión de compra, no acompaña al código que lo produjo.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PRESUPUESTOS_RODADOS, CONDICION_CREDITO_RODADO, presupuestosAlDia, estaVigente, tienePrecio, loQueFalta,
} from './rodados-datos.mjs'
import { paramsParaMotor } from './condiciones-financieras.mjs'
import { compararFinanciamiento } from './ingenieria-financiera.mjs'

const dfsk = () => PRESUPUESTOS_RODADOS.find((p) => p.clave === 'dfsk-c32-doble-cabina-lepont')

// ── 1 · La aritmética del presupuesto tiene que cerrar ───────────────────────────────────────────
// DEFECTO QUE ATRAPA: un dígito mal transcripto de la foto. $12.482.500 escrito $12.482.000 no rompe
// nada, no da error, y deja al OS contestando un anticipo falso hasta que alguien vuelva a la foto.

test('el precio más los gastos de retiro dan el total declarado', () => {
  const p = dfsk()
  assert.equal(p.precioUnidad + p.gastosRetiro, p.total)
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

test('la forma de pago que NO cierra contra el total explica por qué', () => {
  // Un descuadre sin explicación es indistinguible de un error de tipeo. Si mañana alguien "arregla"
  // el eCheq borrando la ambigüedad en vez de resolverla con el vendedor, esto se pone rojo.
  for (const p of PRESUPUESTOS_RODADOS) {
    for (const f of p.formasDePago ?? []) {
      if (f.cierraContraTotal) continue
      assert.ok(f.ambiguedad, `${p.clave}/${f.clave}: descuadra y no dice por qué`)
    }
  }
})

test('la cuota del crédito por el plazo reconstruye el capital financiado', () => {
  // 24 × 1.021.563 = 24.517.512 contra 24.517.500 financiados: 12 pesos de redondeo del vendedor.
  // Si la cuota o el capital se tipean mal, la diferencia se dispara y esto grita.
  const f = dfsk().formasDePago.find((x) => x.clave === 'anticipo-efectivo')
  const cuota = 1_021_563
  const dif = Math.abs(cuota * 24 - f.financiado)
  assert.ok(dif <= 100, `la cuota no reconstruye el capital: diferencia ${dif}`)
  assert.ok(CONDICION_CREDITO_RODADO.amortizacion.includes('1.021.563'))
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
    assert.ok(f.ambito && f.dato && f.motivo, `entrada incompleta: ${JSON.stringify(f)}`)
  }
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
  const z = PRESUPUESTOS_RODADOS.find((p) => p.clave === 'zanella-z-truck')
  assert.ok(z.fichaTecnica.seguridadDeSerie.some((s) => s.includes('ABS')))
  assert.deepEqual(z.fichaTecnica.seguridadOpcional, ['Air Bag'])
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
