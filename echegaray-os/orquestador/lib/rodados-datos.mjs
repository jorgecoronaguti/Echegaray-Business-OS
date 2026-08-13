// LOS PRESUPUESTOS DE RODADOS Y LAS CONDICIONES DEL CRÉDITO — TRANSCRIPCIÓN DE LOS ADJUNTOS DEL DUEÑO.
//
// QUÉ ES ESTE ARCHIVO (13/08/2026). El dueño pidió el 07/08 que quedaran guardados "los presupuestos
// y préstamos para poder adquirir rodados". Lo que se había guardado era el ANÁLISIS (prosa con
// conclusiones); esto es lo otro: los DATOS, uno por uno, con el adjunto del que salió cada número.
//
// QUÉ NO ES. No calcula nada. No compara alternativas, no anualiza tasas, no arma cuotas, no decide.
// La comparación económica ya vive en `ingenieria-financiera.mjs` (`compararFinanciamiento`) y la
// fuente única de tasas es `public.condiciones_financieras` — acá sólo está el insumo declarado.
//
// DE DÓNDE SALE CADA COSA. `adjunto` es el nombre literal del archivo que mandó el dueño el 07/08.
// Un dato que no está en un adjunto NO ESTÁ ACÁ: lo que no se pudo leer figura en `noLeido` con el
// motivo. La regla de oro 1 manda — nunca fabricar datos, ni siquiera los "obvios" de una ficha
// técnica que uno podría buscar en internet.
//
// CONVENCIONES:
// · Los importes son PESOS ARGENTINOS, tal como los escribió el vendedor. `ivaIncluido` sólo se
//   marca true donde el documento lo dice con esas palabras.
// · `vigenciaHasta` es la fecha que declara el propio presupuesto. NO se prorroga: un presupuesto
//   vencido se sigue guardando (es el precio que hubo el 06/08), pero se marca vencido al leerlo.
// · `formasDePago` son ALTERNATIVAS entre sí, no sumandos. Cada una tiene que cerrar contra `total`
//   — y donde el adjunto no alcanza para verificarlo, se declara en `ambiguedad`.
// · `fichaTecnica` guarda sólo lo que decide una compra de camioneta de obra: carga, potencia,
//   tamaño de caja y qué trae de SERIE vs OPCIONAL en seguridad. Un equipamiento que el documento
//   no permite atribuir con certeza va a `noLeido`, no a una suposición razonable.
// · `null` = el adjunto no lo dice. Nunca es un cero ni un "por defecto".

/** Fecha en que el dueño mandó los adjuntos. Toda la información de este archivo es de ese día. */
export const FECHA_ADJUNTOS = '2026-08-07'

/** Carpeta donde quedaron los archivos originales que se transcribieron acá. */
export const ORIGEN_ADJUNTOS = 'adjuntos del chat 07/08/2026 12:23 — aaee8a95_0807_1223_*'

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PRESUPUESTOS
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export const PRESUPUESTOS_RODADOS = [
  {
    clave: 'dfsk-c32-doble-cabina-lepont',
    // ÚNICO de los tres con PRECIO. Los otros dos son fichas técnicas sin cotizar.
    concesionaria: 'LE PONT S.A.',
    contacto: {
      nombre: 'Matías de Olloqui',
      cargo: 'Gerente Comercial',
      telefono: '264-5684600',
      email: 'ventas@lepontsa.com.ar',
    },
    lugar: 'San Juan',
    fechaPresupuesto: '2026-08-06',
    vigenciaHasta: '2026-08-10',
    unidad: { marca: 'DFSK', modelo: 'C32', version: 'Doble Cabina', anio: null, condicion: '0 km' },
    // El PDF del vendedor dice "PRECIO OFERTA"; el cuadro que armó el dueño dice "PRECIO AGOSTO 2026".
    precioUnidad: 33_400_000,
    gastosRetiro: 3_600_000,
    gastosRetiroIncluye: 'prenda',
    total: 37_000_000,
    // El PDF del vendedor dice sólo "TOTAL $37.000.000". Quien agrega "IVA INCLUIDO" es el cuadro del
    // dueño (_1.jpg), que es igualmente un adjunto: se toma de ahí y se declara de dónde.
    ivaIncluido: true,
    ivaIncluidoSegun: 'aaee8a95_0807_1223_1.jpg',
    moneda: 'ARS',
    formasDePago: [
      {
        clave: 'anticipo-efectivo',
        descripcion: 'Anticipo en efectivo + crédito UVA a 24 meses',
        anticipoEfectivo: 12_482_500,
        cheques: null,
        financiado: 24_517_500,
        condicionFinanciera: 'santander-uva-prendario-rodado',
        // 12.482.500 + 24.517.500 = 37.000.000: cierra exacto contra `total`. Lo verifica el test.
        cierraContraTotal: true,
        adjunto: 'aaee8a95_0807_1223_5.pdf',
      },
      {
        clave: 'echeq-6',
        descripcion: 'Seis eCheq escalonados de 30 a 180 días + crédito UVA a 24 meses',
        anticipoEfectivo: null,
        cheques: { cantidad: 6, importeCadaUno: 2_579_717, plazoDiasDesde: 30, plazoDiasHasta: 180 },
        financiado: 24_517_500,
        condicionFinanciera: 'santander-uva-prendario-rodado',
        cierraContraTotal: false,
        // POR QUÉ NO CIERRA, Y POR QUÉ ESO NO ES UN ERROR DE TRANSCRIPCIÓN. La celda dice
        // "ECHEQ X 6 A 30 A 180 DIAS | $ 2.579.717" y las dos capturas que muestran esta variante
        // (_2 y _3) están CORTADAS justo antes de la fila TOTAL, así que el documento no permite
        // confirmarlo. Leído como importe POR cheque, la variante suma más que los $37.000.000 de la
        // variante en efectivo: esa diferencia es el costo de pagar a plazo, y es exactamente el
        // número que hay que comparar contra el descubierto. Leído como importe TOTAL a repartir en
        // 6, el vendedor estaría financiando gratis, que sería raro. Se guarda la lectura por cheque
        // y se deja escrita la duda: el que decida tiene que pedirle al vendedor la fila TOTAL.
        ambiguedad:
          'no se puede confirmar si $2.579.717 es POR cheque o el total de los 6: las capturas _2 y _3 se cortan antes de la fila TOTAL. Se guarda como importe POR cheque.',
        adjunto: 'aaee8a95_0807_1223_2.jpg',
      },
    ],
    requisitos: ['DNI', 'constancia de CUIT'],
    notaVendedor:
      'ofrece la opción de financiar también el anticipo, "para que salga 100% financiado" — sin condiciones declaradas para esa variante',
    fichaTecnica: {
      adjunto: 'aaee8a95_0807_1223_6.pdf',
      tipo: 'Pick Up - Doble cabina',
      dimensionesMm: { largo: 4740, ancho: 1655, alto: 1910 },
      cajaDeCargaMm: { largo: 2060, ancho: 1540, alto: 370 },
      distanciaEntreEjesMm: 3050,
      cargaTotalKg: 1000,
      pesoBrutoKg: 2315,
      tanqueLitros: 55,
      motor: {
        combustible: 'Nafta 93 octanos o superior',
        cilindradaLitros: 1.5,
        potenciaCv: 101,
        potenciaRpm: 6000,
        torqueNm: 136,
        torqueRpm: 3600,
        tecnologia: 'Multipoint EFI',
        distribucion: 'Cadena',
      },
      transmision: { tipo: 'Manual de 5 velocidades', embrague: 'Placa y disco' },
      suspension: { delantera: 'McPherson independiente', trasera: 'Ballestas (6)' },
      frenos: { delanteros: 'Disco', traseros: 'Tambor' },
      direccion: 'Asistida eléctricamente',
      neumaticos: { delanteros: '185R14LT 8PR', traseros: '185R14LT 8PR', llantas: 'Acero' },
      pasajeros: 5,
      seguridadDeSerie: ['Doble airbag frontal', 'Alarma de cinturón de seguridad', 'Cierre centralizado con llave'],
      seguridadOpcional: [],
    },
    // LO QUE ESTE PRESUPUESTO NO PERMITE SABER. Cada uno bloquea una parte de la decisión.
    noLeido: [
      {
        dato: 'ABS, EBD, ESP y DRL: de serie o no',
        motivo:
          'la tabla de la ficha marca con tilde, y el PDF entrega 8 tildes para 9 filas (ABS, EBD, doble airbag, alarma de cinturón, cierre centralizado, ESP, DRL, faros antiniebla, espejos exteriores): una fila está vacía y el documento no dice cuál. Los tres ítems de `seguridadDeSerie` no salen de esa tabla sino de la página de texto del mismo folleto, que los enumera en prosa.',
      },
      { dato: 'radio mínimo de giro, despeje al suelo y trocha', motivo: 'valores presentes en la tabla pero sin correspondencia unívoca con su etiqueta al extraer el texto' },
      { dato: 'costo del seguro de la prenda', motivo: 'el presupuesto dice "24 x 1.021.563 + SEGURO" sin cuantificarlo' },
      { dato: 'garantía de fábrica y plazo de entrega', motivo: 'el presupuesto no los menciona' },
    ],
    adjuntos: [
      'aaee8a95_0807_1223_5.pdf (presupuesto firmado por el vendedor)',
      'aaee8a95_0807_1223_1.jpg / _4.jpg (cuadro del dueño, variante efectivo)',
      'aaee8a95_0807_1223_2.jpg / _3.jpg (cuadro del dueño, variante eCheq)',
      'aaee8a95_0807_1223_6.pdf (ficha técnica DFSK C32)',
    ],
  },

  {
    clave: 'zanella-z-truck',
    // FICHA TÉCNICA SIN PRECIO. Se guarda igual porque es una alternativa que el dueño puso sobre la
    // mesa: sin precio no se puede comparar plata, pero sí se puede comparar lo que la unidad da.
    concesionaria: null,
    contacto: null,
    lugar: null,
    fechaPresupuesto: null,
    vigenciaHasta: null,
    unidad: { marca: 'Zanella Trucks', modelo: 'Z-Truck', version: 'CD (Cabina Doble)', anio: null, condicion: null },
    precioUnidad: null,
    gastosRetiro: null,
    gastosRetiroIncluye: null,
    total: null,
    ivaIncluido: null,
    ivaIncluidoSegun: null,
    moneda: null,
    formasDePago: [],
    requisitos: [],
    notaVendedor: null,
    fichaTecnica: {
      adjunto: 'aaee8a95_0807_1223_7.jpg',
      tipo: 'Flatbed - Cabina Doble',
      dimensionesMm: { largo: 4905, ancho: 1650, alto: 1930 },
      cajaDeCargaMm: { largo: 2100, ancho: 1560, alto: 360 },
      distanciaEntreEjesMm: 3070,
      cargaTotalKg: 1000,
      pesoBrutoKg: 1895,
      tanqueLitros: 50,
      motor: {
        combustible: null,
        cilindradaLitros: 1.206,
        potenciaCv: 85,
        potenciaRpm: 6000,
        torqueNm: null,
        torqueRpm: null,
        tecnologia: '4 cilindros en línea, 16 V, Euro V, Inyección Multipunto (modelo 4W12M1)',
        distribucion: null,
      },
      transmision: { tipo: null, embrague: null },
      suspension: { delantera: 'McPherson independiente', trasera: 'Elásticos longitudinales (5)' },
      frenos: { delanteros: 'Disco (hidráulicos)', traseros: 'Tambor' },
      direccion: 'EPS (asistencia eléctrica)',
      neumaticos: { delanteros: '175/70 R14', traseros: '175/70 R14', llantas: null },
      pasajeros: 4,
      // ACÁ LA TABLA SÍ ES INEQUÍVOCA: dice "S" (serie) u "Opc" (opcional) fila por fila.
      seguridadDeSerie: ['ABS + EBD', 'Luz de circulación diurna DRL', 'Aire acondicionado', 'Radio MP3 + USB'],
      seguridadOpcional: ['Air Bag'],
    },
    // LA VERSIÓN DE CABINA SIMPLE VIENE EN EL MISMO ADJUNTO. Se guarda como variante, no como otro
    // presupuesto: es la misma ficha, la misma marca y tampoco tiene precio.
    variantes: [
      {
        version: 'CS (Cabina Simple)',
        dimensionesMm: { largo: 4880, ancho: 1650, alto: 1925 },
        cajaDeCargaMm: { largo: 2800, ancho: 1560, alto: 360 },
        cargaTotalKg: 1010,
        pesoBrutoKg: 1895,
        pasajeros: 2,
      },
    ],
    noLeido: [
      { dato: 'PRECIO', motivo: 'el adjunto es una ficha técnica de la marca, no un presupuesto: no hay ningún importe' },
      { dato: 'concesionaria, vendedor y condiciones de pago', motivo: 'no figuran en el adjunto' },
      { dato: 'torque, tipo de caja y combustible', motivo: 'la captura corta esas filas de la tabla' },
    ],
    adjuntos: ['aaee8a95_0807_1223_7.jpg (ficha técnica Zanella Z-Truck CS y CD)'],
  },

  {
    clave: 'foton-tm1',
    // TERCERA MARCA, PRÁCTICAMENTE ILEGIBLE. Se guarda la existencia de la alternativa, no un dato
    // que no está: el PDF no tiene una sola fuente tipográfica (52 imágenes, 0 texto), así que lo
    // único verificable es lo que se lee dentro de las fotos.
    concesionaria: null,
    contacto: null,
    lugar: null,
    fechaPresupuesto: null,
    vigenciaHasta: null,
    unidad: { marca: 'FOTON', modelo: 'TM1', version: 'Doble cabina con caja de carga', anio: null, condicion: null },
    precioUnidad: null,
    gastosRetiro: null,
    gastosRetiroIncluye: null,
    total: null,
    ivaIncluido: null,
    ivaIncluidoSegun: null,
    moneda: null,
    formasDePago: [],
    requisitos: [],
    notaVendedor: null,
    fichaTecnica: null,
    noLeido: [
      {
        dato: 'la ficha técnica completa y el precio',
        motivo:
          'el folleto es un PDF sin texto: 52 imágenes y ninguna fuente tipográfica, así que no hay nada que extraer. De las imágenes se leen la marca (FOTON), el modelo (TM / TM1) y la configuración (doble cabina con caja). Para cargarlo hace falta otra fuente: el PDF original con texto, o el presupuesto del concesionario.',
      },
    ],
    adjuntos: ['aaee8a95_0807_1223_8.pdf (folleto FOTON TM — sólo imágenes)'],
  },
]

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// CONDICIONES DE FINANCIAMIENTO
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * LA CONDICIÓN DEL CRÉDITO, EN EL SHAPE DE `public.condiciones_financieras`.
 *
 * POR QUÉ ACÁ Y NO EN UNA TABLA PROPIA. Las tasas ya tienen dueño: `condiciones_financieras` es la
 * fuente única que consumen la Web, el chat y el motor. Una segunda tabla de tasas sería una segunda
 * verdad. Este export es sólo el INSUMO transcripto; `sync-rodados-presupuestos.mjs` lo empuja con
 * `registrarCondicion`, que exige `fuente` y hace upsert idempotente.
 *
 * `limite_disponible` VA EN null A PROPÓSITO — no es un olvido. `paramsParaMotor()` sólo ofrece un
 * préstamo como alternativa para tapar un bache si tiene `limite_disponible > 0`. Esta línea no es
 * capital de trabajo: financia ESTA compra y nada más. Y si entrara al comparador con su TNA 0%
 * nominal, el motor calcularía costo financiero CERO y le ganaría al descubierto (62,78%) en todas
 * las comparaciones, para cualquier pago y cualquier plazo. Sería una recomendación falsa con cara
 * de cálculo: el costo real de un crédito UVA es el ajuste del capital por CER, que este presupuesto
 * no declara.
 */
export const CONDICION_CREDITO_RODADO = {
  clave: 'santander-uva-prendario-rodado',
  entidad: 'Banco Santander',
  producto: 'Crédito UVA para rodado (vía concesionaria Le Pont S.A.)',
  tipo_financiacion: 'prestamo',
  moneda: 'ARS',
  vigencia_desde: '2026-08-06',
  vigencia_hasta: '2026-08-10',
  // "CREDITO UVA TNA 0%" — el presupuesto usa las letras TNA, textualmente. No es TEA ni CFT: el
  // documento no informa ninguno de los dos, y no se derivan (ver `desconocido`).
  tna: 0,
  tea: null,
  cft: null,
  iva_sobre_intereses: null,
  comisiones: null,
  gastos: null,
  plazo_dias: 730, // 24 meses × 365/12, redondeado: la unidad de la columna es días, el plazo real son 24 CUOTAS
  dias_minimos: null,
  limite_disponible: null, // deliberado — ver el comentario de arriba
  saldo_utilizado: null,
  amortizacion: '24 cuotas de $1.021.563 + seguro',
  fecha_debito: null,
  garantias: 'prenda sobre el rodado (los gastos de retiro del presupuesto la incluyen)',
  nivel_confianza: 'informado',
  fuente: 'presupuesto Le Pont S.A. 06/08/2026 — adjunto aaee8a95_0807_1223_5.pdf',
  observaciones:
    'Monto financiado $24.517.500 en 24 cuotas de $1.021.563 + seguro. La TNA 0% es NOMINAL: en un crédito UVA el costo es el ajuste del capital por CER, que este presupuesto NO declara — no se puede afirmar que el crédito sea gratis. Requisitos: DNI y constancia de CUIT. Línea atada a la compra del rodado: NO es capital de trabajo, por eso no lleva limite_disponible y el comparador de financiamiento no la ofrece para tapar baches. Presupuesto vencido el 10/08/2026.',
  desconocido: [
    'CFT y TEA — el presupuesto no los informa, y sin el coeficiente UVA no se derivan',
    'valor UVA/CER tomado y fecha de ajuste de la primera cuota',
    'importe del seguro obligatorio de la prenda',
    'gastos de otorgamiento del crédito (los $3.600.000 de "gastos de retiro" incluyen la prenda, pero no está desglosado)',
    'si lo otorga el banco directamente o es una línea de la marca canalizada por la concesionaria',
    'requisitos de calificación crediticia más allá de DNI y constancia de CUIT',
  ],
  adjunto: 'aaee8a95_0807_1223_5.pdf',
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LECTURA (no cálculo económico: sólo responder "qué hay" y "sigue vigente")
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** ¿El presupuesto seguía vigente a esa fecha? `null` cuando el documento no declara vigencia. */
export const estaVigente = (p, hoy = new Date()) => {
  if (!p?.vigenciaHasta) return null
  const iso = typeof hoy === 'string' ? hoy : hoy.toISOString().slice(0, 10)
  return p.vigenciaHasta >= iso
}

/** ¿Tiene precio? Separa las cotizaciones reales de las fichas técnicas sueltas. */
export const tienePrecio = (p) => p?.total != null

/**
 * La lista lista para mostrar o guardar: cada presupuesto con su estado de vigencia resuelto a una
 * fecha. No toca los importes ni los recalcula — sólo agrega `vigente` y `dias_vencido`.
 */
export function presupuestosAlDia(hoy = new Date()) {
  const iso = typeof hoy === 'string' ? hoy : hoy.toISOString().slice(0, 10)
  return PRESUPUESTOS_RODADOS.map((p) => {
    const vigente = estaVigente(p, iso)
    const diasVencido = vigente === false
      ? Math.round((Date.parse(iso) - Date.parse(p.vigenciaHasta)) / 86_400_000)
      : null
    return { ...p, vigente, dias_vencido: diasVencido, tiene_precio: tienePrecio(p) }
  })
}

/** Todo lo que ningún adjunto permitió leer, junto. Es lo que hay que ir a buscar. */
export function loQueFalta() {
  const dePresupuestos = PRESUPUESTOS_RODADOS.flatMap((p) =>
    (p.noLeido ?? []).map((n) => ({ ambito: p.clave, ...n })))
  const deCondicion = (CONDICION_CREDITO_RODADO.desconocido ?? []).map((d) => ({
    ambito: CONDICION_CREDITO_RODADO.clave, dato: d, motivo: 'el presupuesto no lo declara',
  }))
  return [...dePresupuestos, ...deCondicion]
}
