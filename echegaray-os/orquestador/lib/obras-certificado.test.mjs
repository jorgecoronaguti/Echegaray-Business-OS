import test from 'node:test'
import assert from 'node:assert/strict'
import { hitoDeclarado, hitosDeObra, certificadoDeObra, formulaCertificado } from './obras-certificado.mjs'
import { contratoDeObra } from './cobranzas-contrato.mjs'

/**
 * LOS TEXTOS SON LOS DEL ARCHIVO VIVO, COPIADOS AL CARÁCTER (Cobranzas, 14/08/2026).
 *
 * Incluido el espacio final de "Anticipo 50% inicio obra " y la diferencia entre "s/ total" y
 * "s/ contrato": si el defecto vuelve por un texto que el regex no contempla, tiene que salir acá y
 * no en la pestaña publicada.
 */
const COLS = { cliente: 0, concepto: 1, oc: 2 }
const fila = (cliente, concepto, oc) => [cliente, concepto, oc]
const OBRA = (variantes) => ({ variantes, needle: '', unica: true })

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO: Quattropani publicaba 136,4% y "Falta certificar" en NEGATIVO
// ══════════════════════════════════════════════════════════════════════════════════════════════

const Q = 'Quattropani - Melisa García SAS'
const CONTRATO_Q = 97_650_000

/** Las 13 filas que el cliente Quattropani tiene en Cobranzas. Las tres del anticipo son UN hito
 *  cobrado en tres tramos; la del IVA de la factura 220 no certifica nada. */
const FILAS_Q = [
  fila(Q, '(paga el 33% del 50%) + Materiales', 'Anticipo 50% inicio obra '),
  fila(Q, '(paga el 66% del 50%)', 'Anticipo 50% inicio obra '),
  fila(Q, '(paga el 66% del 50%)', 'Anticipo 50% inicio obra '),
  fila(Q, 'IVA de Factura 220', ''),
  ...Array.from({ length: 9 }, (_, k) => fila(Q, `Salón Comercial - Certificación ${k + 1}/9`,
    `Resto 50% s/ contrato 97.650.000 — certificación quincenal ${k + 1}/9`)),
]

test('Quattropani: el contrato está 100% cargado — no se certifica de más', () => {
  const r = certificadoDeObra(FILAS_Q, COLS, OBRA([Q]), CONTRATO_Q, 1)
  // ÉSTE ES EL NÚMERO QUE EL DUEÑO RECHAZÓ. Antes: $133.169.320 (136,4%) y saldo −$35.519.320.
  assert.equal(r.certificado, 97_650_000)
  assert.equal(r.fraccion, 1)
  assert.equal(r.cubreElContrato, true, 'los hitos cargados cubren el contrato: no falta certificar nada')
})

test('Quattropani: las tres filas del anticipo son UN hito, no tres del 50%', () => {
  const { hitos } = hitosDeObra(FILAS_Q, COLS, OBRA([Q]), 61)
  const anticipo = hitos.filter((h) => h.clave.startsWith('anticipo'))
  assert.equal(anticipo.length, 1, 'sumar 50% tres veces daría 150% del contrato')
  assert.deepEqual(anticipo[0].filas, [61, 62, 63], 'las tres filas quedan trazadas al mismo hito')
  assert.equal(hitos.length, 10, 'un anticipo + nueve certificaciones quincenales')
})

test('Quattropani: la fila del IVA de la factura 220 no certifica', () => {
  const { sinHito } = hitosDeObra(FILAS_Q, COLS, OBRA([Q]), 61)
  assert.equal(sinHito.length, 1)
  assert.equal(sinHito[0].fila, 64, 'la fila queda nombrada, no descartada en silencio')
})

/**
 * LA PRUEBA DE QUE EL DEFECTO ERA INTRA-FILA Y NINGÚN FILTRO DE FILAS LO ARREGLABA.
 *
 * La f61 factura $54.279.685,38: adentro conviven U$S 11.500 del anticipo (@1.550 = $17.825.000) y
 * $36.454.685,38 de MATERIALES, que el contrato —"solo mano de obra"— deja fuera. Sumar el importe
 * de la fila es lo que inflaba el %; leer el hito que la fila declara es lo que lo arregla.
 */
test('Quattropani: lo facturado supera al contrato y aun así no falta certificar', () => {
  const FACTURADO = 54_279_685.38 + 31_000_000 + 48_825_000 // F219 + F220 + las 9 certificaciones
  const r = certificadoDeObra(FILAS_Q, COLS, OBRA([Q]), CONTRATO_Q, 1)
  assert.ok(FACTURADO > CONTRATO_Q, 'se facturó por encima del contrato — eso es cierto')
  assert.equal(r.certificado, CONTRATO_Q, 'pero certificado NO es facturado')
  assert.equal(Math.round(FACTURADO - r.certificado), 36_454_685, 'la diferencia son los materiales')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LAS SEIS OBRAS QUE HOY ESTÁN BIEN TIENEN QUE SEGUIR DANDO EL MISMO PESO
// ══════════════════════════════════════════════════════════════════════════════════════════════

const SF = 'San Francisco'
const ME = 'MESSINA'

const CASOS = [
  {
    obra: 'San Francisco · PISOS INDUSTRIALES', cliente: SF, contrato: 47_590_272, esperado: 47_590_272,
    ocs: ['Anticipo inicio obra 50% $ 47.590.272 Cotización n°',
      ...Array.from({ length: 4 }, (_, k) => `Resto 50% s/ total 47.590.272 — certificación quincenal ${k + 1}/4`)],
  },
  {
    obra: 'San Francisco · INSTALACIÓN ELÉCTRICA', cliente: SF, contrato: 40_000_000, esperado: 40_000_000,
    ocs: ['Anticipo inicio obra 50% $ 40.000.000 Cotización n°',
      ...Array.from({ length: 4 }, (_, k) => `Resto 50% s/ total 40.000.000 — certificación quincenal ${k + 1}/4`)],
  },
  {
    obra: 'San Francisco · ENTREPISO Y ESCALERA', cliente: SF, contrato: 7_728_254, esperado: 7_728_254,
    ocs: ['Anticipo inicio obra 50% $ 7.728.254 Cotización n°',
      'Resto 50% s/ total 7.728.254 — certificación quincenal 1/1'],
  },
  {
    // LA MISMA OBRA CON EL ANTICIPO PARTIDO EN DOS COBROS (Cobranzas, 24/08/2026): las dos filas
    // repiten "50%" y sólo se distinguen en la cuota. Cada una certifica la MITAD de ese 50%.
    obra: 'San Francisco · INSTALACIÓN ELÉCTRICA · anticipo en 2 cuotas', cliente: SF,
    contrato: 40_000_000, esperado: 40_000_000,
    ocs: ['Anticipo inicio obra 50% $ 40.000.000 Cotización n° — 1ª de 2 cuotas quincenales',
      'Anticipo inicio obra 50% $ 40.000.000 — 2ª de 2 cuotas quincenales · cancela el anticipo',
      ...Array.from({ length: 4 }, (_, k) => `Resto 50% s/ total 40.000.000 — certificación quincenal ${k + 1}/4`)],
  },
  {
    obra: 'San Francisco · ENTREPISO Y ESCALERA · anticipo en 2 cuotas', cliente: SF,
    contrato: 7_728_254, esperado: 7_728_254,
    ocs: ['Anticipo inicio obra 50% $ 7.728.254 Cotización n° — 1ª de 2 cuotas quincenales',
      'Anticipo inicio obra 50% $ 7.728.254 — 2ª de 2 cuotas quincenales · cancela el anticipo',
      'Resto 50% s/ total 7.728.254 — certificación quincenal 1/1'],
  },
  {
    // Sin anticipo ni cuotas: la obra entera en una sola fila.
    obra: 'San Francisco · MAMPOSTERÍA', cliente: SF, contrato: 8_758_810, esperado: 8_758_810,
    ocs: ['Venta propia s/ total 8.758.810 — cobro íntegro al cierre de obra'],
  },
  {
    // DOS contratos declarados (Blanco + Negro) bajo UNA obra: cada hito se aplica a SU base.
    // Contra el contrato entero, el 50% del anticipo Blanco daría $51.250.000 en vez de $32.500.000.
    obra: 'MESSINA · PLAYÓN DE AZUFRE', cliente: ME, contrato: 102_500_000, esperado: 102_500_000,
    ocs: ['Anticipo inicio de obra 50% Blanco $65.000.000 Playon de Azufre. Cargar OC',
      'Anticipo inicio de obra 50% Negro $37.500.000 Playon de Azufre. Cargar OC',
      ...Array.from({ length: 2 }, (_, k) => `Resto 50% s/ total 65.000.000 — certificación quincenal ${k + 1}/2`),
      ...Array.from({ length: 2 }, (_, k) => `Resto 50% s/ total 37.500.000 — certificación quincenal ${k + 1}/2`)],
  },
]

for (const c of CASOS) {
  test(`${c.obra}: el certificado no se mueve`, () => {
    const filas = c.ocs.map((oc) => fila(c.cliente, '', oc))
    const r = certificadoDeObra(filas, COLS, OBRA([c.cliente]), c.contrato, 1)
    assert.equal(r.certificado, c.esperado)
    assert.equal(r.cubreElContrato, true)
    assert.equal(r.sinHito.length, 0)
  })
}

test('MESSINA · BSA: sin contrato ni hitos, no se inventa un certificado', () => {
  // Su ORDEN DE COMPRA son números de factura sueltos: no declaran ninguna fracción de contrato.
  const filas = ['00002-00000279', '00002-00001985', '02-00002097'].map((oc) => fila(ME, '', oc))
  const r = certificadoDeObra(filas, COLS, OBRA([ME]), null, 1)
  assert.equal(r.certificado, null, 'null, no cero: no se sabe, no vale cero')
  assert.equal(formulaCertificado(r, 'G26'), null)
  assert.equal(r.sinHito.length, 3)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO DEL 24/08: EL ANTICIPO PARTIDO EN DOS CUOTAS SE CERTIFICABA DOS VECES
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * LAS FILAS DE SAN FRANCISCO TAL COMO ESTÁN EN COBRANZAS EL 24/08/2026, con su número de fila real.
 *
 * Son las mismas que la pestaña OBRAS leyó cuando publicó `150,0%` y `$60.000.000` en el cuadro 3
 * sobre un contrato de $40.000.000. Copiadas al carácter —incluido el `·` de "cancela el anticipo" y
 * el `—` largo—: el defecto vivía en el TEXTO, así que un texto aproximado no lo prueba.
 *
 * La foto de `cobranzas-fixture.mjs` es del 13/08 y todavía tiene el anticipo en UNA fila: por eso
 * `obras-contrato-vivo.test.mjs` seguía en verde mientras la pestaña publicaba el 150%.
 */
const OC_SF = {
  66: ['Pisos Industriales', 'Anticipo inicio obra Pisos Industriales - Total Obra: $47.590.272'],
  67: ['Instalaciones Eléctricas', 'Anticipo inicio obra 50% $ 40.000.000 Cotización n° — 1ª de 2 cuotas quincenales'],
  68: ['Entrepiso y Escaleras', 'Anticipo inicio obra 50% $ 7.728.254 Cotización n° — 1ª de 2 cuotas quincenales'],
  71: ['Pisos Industriales - Certificación 1/4', 'Resto 50% s/ total 47.590.272 — certificación quincenal 1/4'],
  72: ['Pisos Industriales - Certificación 2/4', 'Resto 50% s/ total 47.590.272 — certificación quincenal 2/4'],
  73: ['Pisos Industriales - Certificación 3/4', 'Resto 50% s/ total 47.590.272 — certificación quincenal 3/4'],
  74: ['Pisos Industriales - Certificación 4/4', 'Resto 50% s/ total 47.590.272 — certificación quincenal 4/4'],
  75: ['Instalaciones Eléctricas - Certificación 1/4', 'Resto 50% s/ total 40.000.000 — certificación quincenal 1/4'],
  76: ['Instalaciones Eléctricas - Certificación 2/4', 'Resto 50% s/ total 40.000.000 — certificación quincenal 2/4'],
  77: ['Instalaciones Eléctricas - Certificación 3/4', 'Resto 50% s/ total 40.000.000 — certificación quincenal 3/4'],
  78: ['Instalaciones Eléctricas - Certificación 4/4', 'Resto 50% s/ total 40.000.000 — certificación quincenal 4/4'],
  79: ['Entrepiso y Escaleras - Certificación 1/1', 'Resto 50% s/ total 7.728.254 — certificación quincenal 1/1'],
  95: ['Mampostería y cancha de padel', 'Venta propia s/ total 8.758.810 — cobro íntegro al cierre de obra'],
  96: ['Instalaciones Eléctricas', 'Anticipo inicio obra 50% $ 40.000.000 — 2ª de 2 cuotas quincenales · cancela el anticipo'],
  97: ['Entrepiso y Escaleras', 'Anticipo inicio obra 50% $ 7.728.254 — 2ª de 2 cuotas quincenales · cancela el anticipo'],
}

const DESDE_SF = 66
/** El tramo 66..97 entero: las filas de otros clientes van vacías y tienen que quedar afuera solas,
 *  igual que en el archivo. Así el `needle` se prueba de verdad y no sobre una lista ya filtrada. */
const FILAS_SF = Array.from({ length: 97 - DESDE_SF + 1 }, (_, i) => {
  const r = OC_SF[DESDE_SF + i]
  return r ? fila(SF, r[0], r[1]) : fila('', '', '')
})
const OBRA_SF = (needle) => ({ variantes: [SF], needle, unica: false })

const DEFECTO = [
  { obra: 'INSTALACIÓN ELÉCTRICA', needle: 'Instalaciones Eléctricas', contrato: 40_000_000,
    antes: 60_000_000, filasAnticipo: [67, 96] },
  { obra: 'ENTREPISO Y ESCALERA', needle: 'Entrepiso', contrato: 7_728_254,
    antes: 11_592_381, filasAnticipo: [68, 97] },
]

for (const c of DEFECTO) {
  test(`San Francisco · ${c.obra}: el anticipo en dos cuotas certifica 50%, no 100%`, () => {
    const sel = OBRA_SF(c.needle)
    // EL CONTRATO NO ERA EL CULPABLE, y se prueba acá para que nadie lo "arregle": cinco o seis filas
    // repiten el mismo total y `contratoDeObra` lo reconoce UNA sola vez.
    const k = contratoDeObra(FILAS_SF, COLS, sel, DESDE_SF)
    assert.equal(k.contrato, c.contrato, 'el contrato declarado se lee una sola vez por obra')
    assert.equal(k.partido, false, 'un solo contrato: no hay dos bases que sumar')

    const r = certificadoDeObra(FILAS_SF, COLS, sel, k.contrato, DESDE_SF)
    // ÉSTE ES EL NÚMERO QUE LA PESTAÑA PUBLICÓ MAL: el 150,0% del contrato.
    assert.notEqual(r.certificado, c.antes, `volvió el 150%: ${c.antes}`)
    assert.equal(r.certificado, c.contrato)
    assert.equal(r.fraccion, 1)
    assert.equal(r.cubreElContrato, true)
    assert.equal(r.sinHito.length, 0, 'ninguna fila de la obra queda sin explicar')
  })

  test(`San Francisco · ${c.obra}: cada cuota del anticipo aporta un cuarto del contrato`, () => {
    const { hitos } = hitosDeObra(FILAS_SF, COLS, OBRA_SF(c.needle), DESDE_SF)
    const anticipos = hitos.filter((h) => h.clave.startsWith('anticipo'))
    assert.deepEqual(anticipos.flatMap((h) => h.filas), c.filasAnticipo,
      'son dos hitos trazados a sus filas reales, no uno colapsado')
    for (const h of anticipos) {
      assert.equal(h.num / h.den, 0.25, 'la mitad del 50%: el hito se reparte entre sus cuotas')
      assert.equal(h.base, c.contrato, 'cada cuota declara la base entera, y esa base no se duplica')
    }
  })
}

test('la fila de Pisos que no declara qué fracción cobra sigue sin certificar', () => {
  // NO ES UN EFECTO DE ESTE ARREGLO: la f66 dice "Total Obra: $47.590.272" y no dice ningún %. No se
  // sabe qué fracción cumple, así que se informa la fila y no se supone el número.
  const r = certificadoDeObra(FILAS_SF, COLS, OBRA_SF('Pisos Industriales'), 47_590_272, DESDE_SF)
  assert.deepEqual(r.sinHito.map((x) => x.fila), [66])
  assert.equal(r.certificado, 23_795_136, 'sólo las cuatro certificaciones, que son el 50%')
  assert.equal(r.cubreElContrato, false, 'y falta certificar la otra mitad, que es la verdad')
})

test('sin ordinal no hay reparto: "en 2 cuotas" no divide un hito', () => {
  // El ordinal es lo que prueba que la fila es UNA parte. Sin él, dividir inventaría las otras.
  assert.deepEqual(hitoDeclarado('Anticipo inicio obra 50% $ 40.000.000 — pagadero en 2 cuotas'),
    { clave: 'anticipo inicio obra 50% $ 40.000.000 — pagadero en 2 cuotas', num: 50, den: 100, base: 40_000_000 })
})

test('el "Resto k/n" no se reparte dos veces aunque la fila nombre cuotas', () => {
  const h = hitoDeclarado('Resto 50% s/ total 40.000.000 — certificación quincenal 1/4 — 1ª de 4 cuotas')
  assert.equal(h.den, 400, 'el k/n ya dice en cuántas partes va: 50/400, no 50/1600')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA FÓRMULA QUE SE PUBLICA
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('la fórmula cita la celda del contrato cuando el hito no declara base', () => {
  const r = certificadoDeObra(FILAS_Q, COLS, OBRA([Q]), CONTRATO_Q, 1)
  assert.equal(formulaCertificado(r, 'G27'), '=G27*50/100+97650000*450/900')
})

/**
 * SIN DECIMALES, Y NO ES ESTÉTICA. Una fracción escrita `0,5` viaja bien y `0.5` rompe: el locale
 * es-AR usa la coma como decimal y el punto como separador de miles. Con enteros y una división no
 * hay separador que equivocar, y 50%/9 —periódico en decimal— queda exacto.
 */
test('la fórmula no lleva separador decimal en ninguna parte', () => {
  for (const c of [...CASOS, { cliente: Q, contrato: CONTRATO_Q, ocs: FILAS_Q.map((f) => f[2]) }]) {
    const filas = c.ocs.map((oc) => fila(c.cliente, '', oc))
    const formula = formulaCertificado(certificadoDeObra(filas, COLS, OBRA([c.cliente]), c.contrato, 1), 'G9')
    assert.ok(formula, `${c.cliente}: la fórmula no se compuso`)
    assert.ok(!/[.,]\d/.test(formula), `${c.cliente}: ${formula} lleva un decimal`)
  }
})

test('sin celda de contrato y con un hito sin base, la fórmula sale null en vez de mal', () => {
  const r = certificadoDeObra(FILAS_Q, COLS, OBRA([Q]), CONTRATO_Q, 1)
  assert.equal(formulaCertificado(r, null), null, 'falla cerrada: nunca una fórmula que puede leerse mal')
  assert.equal(r.certificado, 97_650_000, 'el importe se sigue sabiendo')
})

/** El resultado de la fórmula tiene que ser el MISMO importe que el módulo calculó. Si divergieran,
 *  la pestaña publicaría un número y el log del escritor otro, y nadie los compararía. */
test('la fórmula publicada da exactamente el certificado calculado', () => {
  for (const c of [...CASOS, { cliente: Q, contrato: CONTRATO_Q, ocs: FILAS_Q.map((f) => f[2]) }]) {
    const filas = c.ocs.map((oc) => fila(c.cliente, '', oc))
    const r = certificadoDeObra(filas, COLS, OBRA([c.cliente]), c.contrato, 1)
    const evaluada = formulaCertificado(r, String(c.contrato)).slice(1)
      .split('+').reduce((a, t) => {
        const [base, num, den] = t.split(/[*/]/).map(Number)
        return a + (base * num) / den
      }, 0)
    assert.equal(evaluada, r.certificado, `${c.cliente}: la fórmula y el cálculo no coinciden`)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL LECTOR DE HITOS, CASO POR CASO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('hitoDeclarado lee la fracción y la base de cada forma real', () => {
  assert.deepEqual(hitoDeclarado('Anticipo 50% inicio obra '),
    { clave: 'anticipo 50% inicio obra', num: 50, den: 100, base: null })
  assert.deepEqual(hitoDeclarado('Anticipo inicio obra 50% $ 47.590.272 Cotización n°'),
    { clave: 'anticipo inicio obra 50% $ 47.590.272 cotización n°', num: 50, den: 100, base: 47_590_272 })
  assert.deepEqual(hitoDeclarado('Resto 50% s/ contrato 97.650.000 — certificación quincenal 3/9'),
    { clave: 'resto 50% s/ contrato 97.650.000 — certificación quincenal 3/9', num: 50, den: 900, base: 97_650_000 })
})

/** El `k` de "k/n" no entra en la cuenta: nueve cuotas de 1/18 son 1/2, no 45/18. */
test('cada certificación aporta 1/n, no k/n', () => {
  const ocs = Array.from({ length: 9 }, (_, k) => `Resto 50% s/ contrato 97.650.000 — certificación quincenal ${k + 1}/9`)
  const filas = ocs.map((oc) => fila(Q, '', oc))
  const r = certificadoDeObra(filas, COLS, OBRA([Q]), CONTRATO_Q, 1)
  assert.equal(r.certificado, 48_825_000, 'el 50% completo, ni más ni menos')
})

test('lo que no declara hito no certifica', () => {
  for (const t of ['', '  ', '02-00002097', 'OC 53239034', 'RECLAMAR OC!', null, undefined]) {
    assert.equal(hitoDeclarado(t), null, `"${t}" no declara ningún hito`)
  }
})
