import test from 'node:test'
import assert from 'node:assert/strict'
import {
  monto, fecha, partirRotuloDeObra, fechaCorta, imputarObra, palabrasDeObra, estadoDeCobranza, seDescarta,
  estadoDelSheet, estadoPublicado, fueCobrada,
  terminoProhibido, sinCategoriaContable, clasificar, montoUsdPorTipoDeCambio, parteDeclaradaUsd,
  totalDeclaradoUsd, fusionarImportes, numerarRepetidos, depurarRotulo, abarcaVariasObras,
} from './portal-siembra.mjs'

test('el importe es-AR: el punto es miles y el paréntesis es negativo', () => {
  assert.equal(monto('$ 47.590.271,50'), 47590271.5)
  assert.equal(monto('($ 96.800,00)'), -96800)
  assert.equal(monto('12.100.000'), 12100000)
  // «—» NO es cero: es que no hay dato. Devolverlo como 0 lo sumaría a un total.
  assert.equal(monto('—'), null)
  assert.equal(monto(''), null)
  assert.equal(monto(undefined), null)
})

test('la fecha dd/mm/aa; cualquier otra cosa es null, nunca una fecha inventada', () => {
  assert.equal(fecha('28/08/2026'), '2026-08-28')
  assert.equal(fecha('5/9/26'), '2026-09-05')
  assert.equal(fecha('sept-26'), null)
  assert.equal(fecha('—'), null)
})

test('el rótulo de OBRAS se parte en cliente, obra y las dos fechas', () => {
  assert.deepEqual(partirRotuloDeObra('3.1 · San Francisco — PISOS INDUSTRIALES · 05/08 → 30/09'),
    { cliente: 'San Francisco', obra: 'PISOS INDUSTRIALES', desde: '05/08', hasta: '30/09' })
  // El «▲» es una marca de aviso de la pestaña, no parte del nombre de la obra.
  assert.equal(partirRotuloDeObra('3.4 · San Francisco — MAMPOSTERÍA · 07/08 → 19/08 ▲').obra, 'MAMPOSTERÍA')
  assert.equal(partirRotuloDeObra('3.6 · MESSINA — BSA · 29/07 → 21/08 ▲').obra, 'BSA')
  assert.equal(partirRotuloDeObra('⇒ TOTAL — 7 OBRAS'), null, 'la fila de total no es una obra')
})

test('una fecha corta sin año no se completa sola', () => {
  assert.equal(fechaCorta('05/08', 2026), '2026-08-05')
  assert.equal(fechaCorta('05/08', null), null)
  assert.equal(fechaCorta(null, 2026), null)
})

test('las palabras salen del nombre, la entera primero', () => {
  assert.deepEqual(palabrasDeObra('PISOS INDUSTRIALES'), ['pisos industriales', 'pisos', 'industriales'])
  assert.deepEqual(palabrasDeObra('BSA'), ['bsa'], 'una sigla corta se usa entera')
})

const obras = [
  { id: 'pisos', palabras: palabrasDeObra('PISOS INDUSTRIALES') },
  { id: 'elec', palabras: palabrasDeObra('INSTALACIÓN ELÉCTRICA') },
  { id: 'entre', palabras: palabrasDeObra('ENTREPISO Y ESCALERA') },
]

test('cada cobranza cae en SU obra', () => {
  assert.equal(imputarObra({ detalle: 'Pisos Industriales' }, obras).obra.id, 'pisos')
  assert.equal(imputarObra({ detalle: 'Instalaciones Eléctricas — anticipo 1ª cuota' }, obras).obra.id, 'elec')
  assert.equal(imputarObra({ concepto: 'Entrepiso y escalera' }, obras).obra.id, 'entre')
})

test('las tildes no cambian la obra', () => {
  assert.equal(imputarObra({ detalle: 'INSTALACION ELECTRICA' }, obras).obra.id, 'elec')
})

test('una fila que no nombra su obra queda SIN IMPUTAR, no en la primera', () => {
  // «Anticipos San Francisco» abarca todas las obras del cliente. Mandarla a una pondría plata de
  // una obra en el cronograma de otra, y el cliente lo ve.
  assert.equal(imputarObra({ detalle: 'Anticipos San Francisco — quincenales' }, obras), null)
  assert.equal(imputarObra({ detalle: 'Saldo 50% de todas las obras' }, obras), null)
})

test('gana la coincidencia más larga', () => {
  // «entrepiso» contiene «piso»: sin la regla del más largo, el entrepiso caería en PISOS.
  assert.equal(imputarObra({ detalle: 'Entrepiso y escalera' }, obras).obra.id, 'entre')
})

test('lo marcado CANCELAR no se carga nunca', () => {
  assert.equal(seDescarta('CANCELAR'), true)
  assert.equal(seDescarta('Cobrado'), false)
})

// ── LA COLUMNA O DE COBRANZAS ES LA FUENTE DEL ESTADO ────────────────────────────────────────
//
// El defecto que estos tests atrapan: la columna se leía y se tiraba. El sembrador volvía a decidir
// el estado comparando la fecha contra hoy, y la pantalla lo decidía una tercera vez. En la base no
// había ni una sola línea `previsto` aunque el Sheet tenía tres filas «Proyectado».

const HOY = '2026-08-26'

test('«Proyectado» NO se deriva de la fecha: es lo que el dueño declaró', () => {
  // Éste es el defecto. Con la fecha por delante, derivar daba `a_vencer`; con la fecha pasada daba
  // `vencido` — le reclamaba al cliente un cobro que todavía no le facturamos.
  assert.equal(estadoDeCobranza('Proyectado', '2026-09-30', HOY), 'previsto')
  assert.equal(estadoDeCobranza('Proyectado', '2026-01-10', HOY), 'previsto')
})

test('«Cobrado» manda sobre la fecha, y los cinco estados son los del CHECK de esquema_pago', () => {
  assert.equal(estadoDeCobranza('Cobrado', '2026-01-15', HOY), 'cobrado')
  // Los valores que puede devolver son EXACTAMENTE los que acepta la base. Uno de más revienta la
  // corrida entera contra `esquema_pago_estado_check`, con las líneas a medio escribir.
  const DE_LA_BASE = ['cobrado', 'a_vencer', 'vencido', 'previsto', 'retenido']
  const salidas = new Set()
  for (const e of ['Cobrado', 'Pendiente', 'Facturado', 'Proyectado', 'Vencido', '']) {
    for (const f of ['2026-01-10', '2026-12-31', null]) {
      for (const tipo of ['otro', 'fondo_reparo']) {
        salidas.add(estadoPublicado({ estadoSheet: e, tipo, prevista: f, hoy: HOY }))
      }
    }
  }
  for (const s of salidas) assert.ok(DE_LA_BASE.includes(s), `«${s}» no existe en esquema_pago`)
})

test('«Pendiente» y «Facturado» no declaran vencimiento: lo calcula la fecha, como la columna V', () => {
  assert.equal(estadoDeCobranza('Pendiente', '2026-08-31', HOY), 'a_vencer')
  assert.equal(estadoDeCobranza('Pendiente', '2026-08-25', HOY), 'vencido')
  assert.equal(estadoDeCobranza('Facturado', '2026-09-17', HOY), 'a_vencer')
  // Vence hoy: todavía no venció. Es el `Q<TODAY()` del Sheet, ni un día antes.
  assert.equal(estadoDeCobranza('Pendiente', HOY, HOY), 'a_vencer')
  // Sin fecha no hay vencimiento que calcular: acordado y sin programar.
  assert.equal(estadoDeCobranza('Pendiente', null, HOY), 'previsto')
})

test('la columna se lee UNA vez: espacios, mayúsculas y tildes no cambian lo que dice', () => {
  // El sembrador preguntaba «¿está cobrada?» con `.trim()` y resolvía el estado SIN `.trim()`. Con un
  // espacio de más las dos lecturas de la misma celda daban cosas distintas.
  for (const crudo of ['Cobrado', 'COBRADO', ' cobrado ', 'Cobrado\n', '  Cóbrado  ']) {
    assert.equal(fueCobrada(crudo), true, `«${crudo}»`)
    assert.equal(estadoDeCobranza(crudo, '2026-12-01', HOY), 'cobrado', `«${crudo}»`)
  }
  assert.equal(estadoDelSheet('  CANCELAR '), 'cancelar')
  // Lo peor del espacio de más: una fila que el dueño mandó cancelar se le publicaba al cliente.
  assert.equal(seDescarta('CANCELAR '), true)
  assert.equal(seDescarta(' cancelar'), true)
  assert.equal(seDescarta('Pendiente'), false)
})

test('el fondo de reparo es retenido salvo que ya se haya devuelto', () => {
  assert.equal(estadoPublicado({ estadoSheet: 'Pendiente', tipo: 'fondo_reparo', prevista: '2026-01-10', hoy: HOY }), 'retenido')
  // Ya devuelto: está cobrado, no retenido. Marcarlo `retenido` lo dejaría fuera de lo pagado.
  assert.equal(estadoPublicado({ estadoSheet: 'Cobrado', tipo: 'fondo_reparo', prevista: '2026-01-10', hoy: HOY }), 'cobrado')
  assert.equal(estadoPublicado({ estadoSheet: 'Pendiente', tipo: 'certificado', prevista: '2026-01-10', hoy: HOY }), 'vencido')
})

test('con UNA sola obra no hay nada que mezclar: la fila va ahí', () => {
  // Quattropani: ninguna fila de Cobranzas repite el nombre de la obra, porque es la única y es obvia.
  const una = [{ id: 'salon', palabras: palabrasDeObra('SALÓN COMERCIAL') }]
  assert.equal(imputarObra({ concepto: 'Anticipo 50% inicio obra' }, una).obra.id, 'salon')

  // ARCOR es un cliente de MANTENIMIENTO: su única obra se llama como él y sus cobranzas son órdenes
  // de compra sueltas (bacheo, compactación, cortinas). Exigir que el concepto nombrara la obra dejaba
  // $49,8 M sin aparecer en ningún lado, en silencio.
  //
  // EL COSTO ESTÁ DECLARADO: si esa obra única fuera una obra vieja y específica, entraría ahí trabajo
  // que no le corresponde. Se acepta porque la alternativa —descartar la fila— no la pone en otro
  // lado: la hace desaparecer. Y el riesgo vuelve solo en cuanto el cliente tenga una segunda obra,
  // que es donde empieza a haber una decisión que tomar.
  const arcor = [{ id: 'arcor', palabras: palabrasDeObra('ARCOR') }]
  assert.equal(imputarObra({ concepto: 'BACHEO' }, arcor).obra.id, 'arcor')
})

test('una palabra suelta no alcanza cuando la obra tiene varias', () => {
  // «Rep de pisos - canalizacion» y «Cambio de Pisos - RRHH» comparten «pisos» y son dos trabajos
  // distintos del mismo cliente. Con la regla vieja la reparación entraba en la obra equivocada.
  // DOS obras: acá sí hay una decisión que tomar, y una palabra suelta no alcanza para tomarla.
  const arcor = [
    { id: 'pisos-rrhh', palabras: palabrasDeObra('Cambio de Pisos - RRHH') },
    { id: 'bacheo', palabras: palabrasDeObra('Bacheo de Playa') },
  ]
  assert.equal(imputarObra({ concepto: 'Rep de pisos - "canalizacion"' }, arcor), null)
  // Dos palabras sí alcanzan aunque el nombre entero no aparezca.
  assert.equal(imputarObra({ concepto: 'Cambio de cortina en pisos' }, arcor).obra.id, 'pisos-rrhh')
})

test('una obra de una sola palabra se reconoce con esa palabra', () => {
  const messina = [{ id: 'bsa', palabras: palabrasDeObra('BSA') }, { id: 'playon', palabras: palabrasDeObra('PLAYÓN DE AZUFRE') }]
  assert.equal(imputarObra({ concepto: 'PLANTA DE BSA - 50%' }, messina).obra.id, 'bsa')
  assert.equal(imputarObra({ concepto: 'Playon Azufre - Certificación 1/2' }, messina).obra.id, 'playon')
  // Y lo que no nombra ninguna de las dos NO se reparte: PILON y BASES TANQUE SO2 son otras obras.
  assert.equal(imputarObra({ concepto: 'PILON - Anticipo' }, messina), null)
  assert.equal(imputarObra({ concepto: 'BASES TANQUE SO2' }, messina), null)
  assert.equal(imputarObra({ concepto: 'Relevamiento topográfico' }, messina), null)
})

test('la orden de compra también nombra la obra', () => {
  const sf = [{ id: 'pisos', palabras: palabrasDeObra('PISOS INDUSTRIALES') }, { id: 'elec', palabras: palabrasDeObra('INSTALACIÓN ELÉCTRICA') }]
  assert.equal(imputarObra({ concepto: '', ordenCompra: 'Anticipo inicio obra Pisos Industriales' }, sf).obra.id, 'pisos')
})

test('las tildes del Sheet no rompen la imputación', () => {
  const dos = [{ id: 'playon', palabras: palabrasDeObra('PLAYÓN DE AZUFRE') }, { id: 'bsa', palabras: palabrasDeObra('BSA') }]
  assert.equal(imputarObra({ detalle: 'Playon Azufre - Blanco' }, dos).obra.id, 'playon')
  assert.equal(imputarObra({ detalle: 'PLAYÓN DE AZUFRE' }, dos).obra.id, 'playon')
})

// ═══ LA CONTABILIDAD INTERNA NO SALE AL PORTAL ═══════════════════════════════════════════════
//
// La columna B de Cobranzas vale B o N —facturado o efectivo no declarado— y el concepto que
// escribe una persona repite esos términos. El portal lo mira gente de AFUERA de la empresa.

test('el término prohibido se detecta venga como venga', () => {
  assert.equal(terminoProhibido('Playon Azufre - Blanco - Certificación 1/2'), 'Blanco')
  assert.equal(terminoProhibido('Playon Azufre - Negro - Certificación 2/2'), 'Negro')
  assert.equal(terminoProhibido('cobro en negro de julio'), 'negro')
  assert.equal(terminoProhibido('Categoría N'), 'Categoría N')
  assert.equal(terminoProhibido('Playon Azufre - N - Certificación 1/2'), '- N')
  assert.equal(terminoProhibido('efectivo no declarado'), 'no declarado')
  assert.equal(terminoProhibido('Certificado 3'), null)
  assert.equal(terminoProhibido('Anticipo (1 de 2)'), null)
})

test('la categoría contable se saca del texto sin llevarse el resto', () => {
  assert.equal(sinCategoriaContable('Playon Azufre - Blanco - Certificación 1/2'), 'Playon Azufre - Certificación 1/2')
  assert.equal(sinCategoriaContable('Playon Azufre - Negro - Certificación 2/2'), 'Playon Azufre - Certificación 2/2')
  assert.equal(sinCategoriaContable('Anticipo inicio de obra 50% Blanco $65.000.000 Playon de Azufre'),
    'Anticipo inicio de obra 50% $65.000.000 Playon de Azufre')
  assert.equal(sinCategoriaContable('Certificado 3'), 'Certificado 3')
})

// EL TEST QUE NO PUEDE FALTAR. Si alguien vuelve a mandar el concepto crudo al rótulo, esto se pone
// rojo antes de que lo vea un cliente. Los conceptos son los que HAY en la pestaña Cobranzas.
test('ningún rótulo generado lleva la categoría contable al portal', () => {
  const delSheet = [
    ['Playon Azufre - Blanco - Certificación 1/2', 'Resto 50% s/ total 65.000.000 — certificación quincenal 1/2'],
    ['Playon Azufre - Negro - Certificación 2/2', 'Resto 50% s/ total 37.500.000 — certificación quincenal 1/2'],
    ['Playon Azufre', 'Anticipo inicio de obra 50% Blanco $65.000.000 Playon de Azufre. Cargar OC'],
    ['Playon Azufre', 'Anticipo inicio de obra 50% Negro $37.500.000 Playon de Azufre. Cargar OC'],
    ['Cobro efectivo - pago total julio - NO CONSIDERAR', ''],
    ['Pago efectivo — julio 2026', ''],
    // SIN PALABRA DE CATEGORÍA el rótulo cae al concepto: ésta es la vía por la que el término se
    // cuela. Hoy ninguna fila del Sheet es así; mañana sí, y el rótulo saldría crudo al portal.
    ['Playon Azufre - Blanco', ''],
    ['Trabajos varios - Negro', ''],
    ['', 'Playon Azufre - Blanco'],
  ]
  for (const [concepto, orden] of delSheet) {
    const { rotulo } = clasificar(concepto, orden)
    assert.equal(terminoProhibido(rotulo), null, `el rótulo «${rotulo}» sale de «${concepto}»`)
    // La NOTA se arma con el concepto depurado: mismo riesgo, misma exigencia.
    assert.equal(terminoProhibido(sinCategoriaContable(concepto)), null, `la nota sale de «${concepto}»`)
    assert.equal(terminoProhibido(sinCategoriaContable(orden)), null, `la nota sale de «${orden}»`)
  }
})

test('el rótulo dice QUÉ cobro es, no repite el nombre de la obra', () => {
  assert.deepEqual(clasificar('Playon Azufre - Blanco - Certificación 1/2', ''), { tipo: 'certificado', rotulo: 'Certificado 1' })
  assert.deepEqual(clasificar('Salón Comercial - Certificación 9/9', ''), { tipo: 'certificado', rotulo: 'Certificado 9' })
  // La categoría suele estar en la orden de compra cuando el concepto sólo tiene la obra.
  assert.deepEqual(clasificar('Pisos Industriales', 'Anticipo inicio obra Pisos Industriales - Total Obra: $47.590.272'),
    { tipo: 'anticipo', rotulo: 'Anticipo' })
  assert.deepEqual(clasificar('', 'Certificado 3'), { tipo: 'certificado', rotulo: 'Certificado 3' })
  assert.deepEqual(clasificar('ADICIONAL - BASE DE TANQUE SO2', ''), { tipo: 'otro', rotulo: 'Adicional' })
  assert.equal(clasificar('Retención fondo de reparo', '').tipo, 'fondo_reparo')
})

test('sin categoría reconocible manda el concepto, acotado', () => {
  assert.deepEqual(clasificar('IVA de Factura 220', ''), { tipo: 'otro', rotulo: 'IVA de Factura 220' })
  assert.deepEqual(clasificar('', ''), { tipo: 'otro', rotulo: 'Cobro', sinConcepto: true })
  const largo = clasificar('Cambio de pisos RRHH - se facturó el 80% $ 7.520.000 y el 20% restante queda para el cierre de la obra', '')
  assert.ok(largo.rotulo.length <= 80, `el rótulo mide ${largo.rotulo.length}`)
  assert.ok(largo.rotulo.endsWith('…'))
})

// ═══ QUATTROPANI: UN CONTRATO EN DÓLARES NO SE PUBLICA EN PESOS DE HOY ════════════════════════

test('el neto calculado sobre el tipo de cambio se publica en dólares', () => {
  // `=3500*TIPO_CAMBIO_USD` con neto $5.296.466 y total $6.408.723,86 ⇒ TC 1.513,28 ⇒ U$S 4.235.
  // El VALOR no cambia: cambia la unidad, y el tipo de cambio sale de la propia fila.
  assert.equal(montoUsdPorTipoDeCambio({ formulaNeto: '=3500*TIPO_CAMBIO_USD', neto: 5296466, total: 6408723.86 }), 4235)
  // Una fila que NO se calcula contra el tipo de cambio se queda en pesos. La del anticipo mezcla
  // materiales en pesos con mano de obra en dólares: publicarla en dólares sería inventar.
  assert.equal(montoUsdPorTipoDeCambio({ formulaNeto: '=36454685,38+(11500*1550)', neto: 54279685.38, total: 65678419.31 }), null)
  assert.equal(montoUsdPorTipoDeCambio({ formulaNeto: '15400', neto: 15400, total: 15400 }), null)
})

test('las partes de un cobro declaran su valor en dólares', () => {
  assert.equal(parteDeclaradaUsd('U$S 20.000 — 63,5 % del anticipo 50 % · parte U$S 15.400 en dólares'), 15400)
  assert.equal(parteDeclaradaUsd('U$S 20.000 — 63,5 % del anticipo 50 % · parte U$S 4.600 = $ 7.130.000 a TC 1.550'), 4600)
  assert.equal(parteDeclaradaUsd('Certificado 3'), null)
  assert.equal(totalDeclaradoUsd('U$S 20.000 — 63,5 % del anticipo 50 %'), 20000)
  assert.equal(totalDeclaradoUsd('Playon Azufre'), null)
})

test('dos filas del mismo cobro se fusionan en UNA línea por el total', () => {
  // La certificación partida en dos: para el cliente es un solo cobro por la suma.
  assert.deepEqual(fusionarImportes([
    { monto: 19662500, moneda: 'ARS', concepto: 'Playon Azufre - Certificación 1/2' },
    { monto: 9400000, moneda: 'ARS', concepto: 'Playon Azufre - Certificación 1/2' },
  ]), { monto: 29062500, moneda: 'ARS' })
  // NULL NO ES CERO: sin ningún importe cargado, el cobro sigue sin importe.
  assert.deepEqual(fusionarImportes([{ monto: null, moneda: 'ARS', concepto: 'x' }]), { monto: null, moneda: 'ARS' })
})

test('un cobro pagado en dos monedas se fusiona sólo si las partes cierran', () => {
  const partes = [
    { monto: 15400, moneda: 'USD', concepto: 'U$S 20.000 — 63,5 % del anticipo 50 % · parte U$S 15.400 en dólares' },
    { monto: 7130000, moneda: 'ARS', concepto: 'U$S 20.000 — 63,5 % del anticipo 50 % · parte U$S 4.600 = $ 7.130.000 a TC 1.550' },
  ]
  // 15.400 + 4.600 = 20.000, y es lo que el propio concepto declara. UNA línea, no dos que digan
  // «U$S 20.000» cada una —ni una de U$S 15.400 y otra de $ 7.130.000, que es lo que veía el cliente.
  assert.deepEqual(fusionarImportes(partes), { monto: 20000, moneda: 'USD' })

  // Si no cierra contra lo declarado, no se publica un número inventado: se informa.
  const roto = [partes[0], { ...partes[1], concepto: 'U$S 20.000 — … · parte U$S 9.999' }]
  assert.match(fusionarImportes(roto).conflicto, /declara U\$S 20000/)
  // Y sin equivalencia declarada tampoco se suma a ojo.
  const mudo = [{ monto: 100, moneda: 'USD', concepto: 'x' }, { monto: 200, moneda: 'ARS', concepto: 'y' }]
  assert.match(fusionarImportes(mudo).conflicto, /ninguna fila declara la equivalencia/)
})

test('dos líneas con el mismo rótulo se distinguen por su lugar', () => {
  const lineas = numerarRepetidos([
    { rotulo: 'Anticipo' }, { rotulo: 'Certificado 1' }, { rotulo: 'Anticipo' },
  ])
  assert.deepEqual(lineas.map((l) => l.rotulo), ['Anticipo (1 de 2)', 'Certificado 1', 'Anticipo (2 de 2)'])
})

test('el rótulo no le repite al cliente el nombre de la obra que está mirando', () => {
  // Una línea que dice «Galpón 9» dentro de la obra «Galpón 9» no dice qué cobro es.
  assert.equal(depurarRotulo('Galpon 9', 'Galpón 9'), 'Cobro')
  assert.equal(depurarRotulo('Faltante - GALPON 9', 'Galpón 9'), 'Faltante')
  // En el medio se deja: «PLANTA DE BSA - 50%» sin el «BSA» queda mutilado.
  assert.equal(depurarRotulo('PLANTA DE BSA - 50%', 'BSA'), 'PLANTA DE BSA - 50%')
  // Y lo que agrega información se conserva entero.
  assert.equal(depurarRotulo('Mampostería y cancha de padel', 'MAMPOSTERÍA'), 'Mampostería y cancha de padel')
  assert.equal(depurarRotulo('Certificado 3', 'PLAYÓN DE AZUFRE'), 'Certificado 3')
})

// ── LA OBRA ESTÁ NOMBRADA, PERO EN OTRO LUGAR ────────────────────────────────────────────────
//
// 42 filas de Cobranzas quedaban sin imputar y el dueño pidió que aparecieran en su obra: «encargate
// de q aparezcan las futuras pendientes y las pasadas cobradas de las obras acá señaladas». No hacía
// falta adivinar ninguna: el dato estaba, en dos lugares que el buscador no miraba.

test('la obra se reconoce por su ID, no sólo por el nombre cargado', () => {
  // `san-francisco` se llama «Galpones, Mampostería, Cancha de Padel». Cuatro filas por $47,66 M
  // dicen «Saldo obras San Francisco — 1/4»: nombraban la obra y el buscador no la reconocía.
  const suyas = [
    { id: 'san-francisco', palabras: palabrasDeObra('Galpones, Mampostería, Cancha de Padel', 'san-francisco') },
    { id: 'pisos-industriales', palabras: palabrasDeObra('Pisos Industriales', 'pisos-industriales') },
  ]
  assert.equal(imputarObra({ concepto: 'Saldo obras San Francisco — cuota 1/4' }, suyas).obra.id, 'san-francisco')
  // Y el nombre cargado sigue funcionando igual.
  assert.equal(imputarObra({ concepto: 'Anticipo inicio obra Pisos Industriales' }, suyas).obra.id, 'pisos-industriales')
})

test('cuando el concepto no dice nada, el rótulo del cliente nombra la obra', () => {
  // En Cobranzas el cliente se escribe «IMOTOR/San Francisco/JAVI SANCHEZ». Por eso «Certificado 2»
  // y seis pagos en efectivo —$104,77 M ya cobrados— no nombraban obra: para quien carga es obvia.
  const suyas = [
    { id: 'san-francisco', palabras: palabrasDeObra('Galpones, Mampostería, Cancha de Padel', 'san-francisco') },
    { id: 'pisos-industriales', palabras: palabrasDeObra('Pisos Industriales', 'pisos-industriales') },
  ]
  const fila = { concepto: 'Certificado 2', clienteSheet: 'IMOTOR/San Francisco/JAVI SANCHEZ' }
  assert.equal(imputarObra(fila, suyas).obra.id, 'san-francisco')
})

test('una fila que abarca VARIAS obras no se mete en una sola', () => {
  // Es el freno del respaldo anterior: sin él, «Saldo 50% de todas las obras» entraba entero en
  // `san-francisco` por el rótulo del cliente — plata de todas las obras en el cronograma de una.
  const suyas = [
    { id: 'san-francisco', palabras: palabrasDeObra('Galpones, Mampostería, Cancha de Padel', 'san-francisco') },
    { id: 'pisos-industriales', palabras: palabrasDeObra('Pisos Industriales', 'pisos-industriales') },
  ]
  const cliente = 'IMOTOR/San Francisco/JAVI SANCHEZ'
  assert.equal(imputarObra({ concepto: 'Saldo 50% de todas las obras — cuota quincenal 1 de 4', clienteSheet: cliente }, suyas), null)
  assert.equal(imputarObra({ concepto: 'Anticipos quincenales de todas las obras — 1ª de 2', clienteSheet: cliente }, suyas), null)
  assert.equal(abarcaVariasObras('Saldo 50% de todas las obras'), true)
  assert.equal(abarcaVariasObras('Certificado 2'), false)
})

// ── LO QUE EL SHEET NO DICE, NO SE ESCRIBE ───────────────────────────────────────────────────
//
// Cinco filas de San Francisco vienen sin concepto: el Sheet dice «Efectivo», «Cobrado», su fecha y
// su monto, y nada más. Se publicaban como «Cobro (1 de 5)»… (2 de 5)»… y esa numeración no existe
// en ningún lado. El dueño lo vio en el portal de su cliente: «estás inventando cobros y fechas».

test('sin concepto, el rótulo es la FORMA DE COBRO — lo único que el Sheet declara', () => {
  assert.deepEqual(clasificar('', '', 'Efectivo'), { tipo: 'otro', rotulo: 'Efectivo', sinConcepto: true })
  assert.deepEqual(clasificar('', '', 'Transferencia'), { tipo: 'otro', rotulo: 'Transferencia', sinConcepto: true })
  // Sin concepto Y sin forma de cobro no queda nada que decir salvo que fue un cobro.
  assert.deepEqual(clasificar('', '', ''), { tipo: 'otro', rotulo: 'Cobro', sinConcepto: true })
  // Con concepto NO se marca: ese rótulo sí describe el trabajo.
  assert.equal(clasificar('Certificado 3', '', 'Efectivo').sinConcepto, undefined)
})

test('una fila sin concepto NO se numera: «Efectivo (1 de 5)» afirma un orden inexistente', () => {
  const sin = [
    { rotulo: 'Efectivo', sinConcepto: true },
    { rotulo: 'Efectivo', sinConcepto: true },
    { rotulo: 'Efectivo', sinConcepto: true },
  ]
  assert.deepEqual(numerarRepetidos(sin).map((l) => l.rotulo), ['Efectivo', 'Efectivo', 'Efectivo'])

  // Numerar un CONCEPTO repetido es otra cosa: ahí el rótulo existe y el número desambigua dos
  // líneas que de verdad se llaman igual.
  const con = [{ rotulo: 'Anticipo' }, { rotulo: 'Anticipo' }]
  assert.deepEqual(numerarRepetidos(con).map((l) => l.rotulo), ['Anticipo (1 de 2)', 'Anticipo (2 de 2)'])
})
