// LOS PRESUPUESTOS DE RODADOS Y LAS CONDICIONES DEL CRÉDITO — TRANSCRIPCIÓN DE LOS ADJUNTOS DEL DUEÑO.
//
// QUÉ ES ESTE ARCHIVO (13/08/2026). El dueño pidió el 07/08 que quedaran guardados "los presupuestos
// y préstamos para poder adquirir rodados". Lo que se había guardado era el ANÁLISIS (prosa con
// conclusiones); esto es lo otro: los DATOS, uno por uno, con el adjunto del que salió cada número.
//
// QUÉ NO ES. No calcula nada. No compara alternativas, no anualiza tasas, no arma cuotas, no decide.
// La comparación económica de las formas de pago vive en `rodados-financiacion.mjs`, que DERIVA todo
// de acá: ningún costo, recargo ni tasa se tipea como literal. La fuente única de tasas de terceros
// es `public.condiciones_financieras` — acá sólo está el insumo declarado.
//
// ═══ CORRECCIÓN DEL 13/08/2026: EL DUEÑO PASÓ EL PRESUPUESTO REAL ═══
//
// La transcripción anterior había leído las capturas cortadas y dejó escrito que no se podía saber si
// los $2.579.717 del eCheq eran POR cheque o el total de los seis. El dueño lo confirmó: son SEIS
// eCheq de $2.579.717 CADA UNO. La duda se cierra con `confirmadoPorDueno`, no se borra el rastro:
// la diferencia contra los $12.482.500 del contado ($2.995.802) no es un descuadre de transcripción,
// es el PRECIO DE PAGAR A PLAZO, y ahora se puede medir contra el descubierto.
//
// La confirmación también valida la aritmética del vendedor: $12.482.500 × 1,24 ÷ 6 = $2.579.716,67,
// que redondeado da exactamente los $2.579.717 de la celda. El recargo es un 24% redondo — no salió
// de una tasa, salió de un multiplicador. Eso está VERIFICADO en `rodados-financiacion.test.mjs`, no
// afirmado acá.
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
// · `formasDePago` son ALTERNATIVAS entre sí, no sumandos. La que paga al contado cierra contra
//   `total`; la que paga a plazo NO cierra y declara por qué en `motivoDeDescuadre`, que tiene sólo
//   dos valores posibles: `recargo-por-plazo` (el vendedor cobra más por esperar — es un hecho
//   económico) o `documento-incompleto` (no se pudo leer — es un límite de la fuente). Confundir
//   los dos es lo que hace que un sobreprecio se lea como un error de tipeo.
// · Los plazos de los cheques van como LISTA (`plazosDias`), no como "desde/hasta": el plazo
//   promedio que decide el costo financiero se calcula sobre la lista, y una lista de 6 elementos
//   no se puede confundir con 6 cheques a 180 días.
// · `fichaTecnica` guarda sólo lo que decide una compra de camioneta de obra: carga, potencia,
//   tamaño de caja y qué trae de SERIE vs OPCIONAL en seguridad. Un equipamiento que el documento
//   no permite atribuir con certeza va a `noLeido`, no a una suposición razonable.
// · `equipamiento` es el MAPA CONSULTABLE de ese equipamiento: `'serie'`, `'opcional'` o `null`
//   (el documento no lo dice). Existe porque "el airbag es opcional" es el motivo por el que se
//   descarta una unidad, y un motivo de descarte tiene que poder consultarse con una función, no
//   leerse en un comentario. Las listas en prosa se conservan porque son la transcripción literal
//   del folleto; que las dos no se contradigan lo verifica un test.
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
        clave: 'a-efectivo',
        letra: 'A',
        descripcion: 'FORMA DE PAGO A — efectivo $12.482.500 + crédito Santander UVA TNA 0% en 24 meses $24.517.500',
        anticipoEfectivo: 12_482_500,
        cheques: null,
        financiado: 24_517_500,
        condicionFinanciera: 'santander-uva-prendario-rodado',
        // 12.482.500 + 24.517.500 = 37.000.000: cierra exacto contra `total`. Lo verifica el test.
        // Y el anticipo no es un número suelto: el crédito cubre $24.517.500 del PRECIO de la unidad
        // y el comprador pone el resto del precio más TODOS los gastos de retiro
        // (33.400.000 − 24.517.500 + 3.600.000 = 12.482.500). Esa identidad también se testea: es la
        // que detecta que se pisó el precio o los gastos dejando el total intacto.
        cierraContraTotal: true,
        motivoDeDescuadre: null,
        confirmadoPorDueno: '2026-08-13',
        adjunto: 'aaee8a95_0807_1223_5.pdf',
      },
      {
        clave: 'b-echeq-6',
        letra: 'B',
        descripcion: 'FORMA DE PAGO B — 6 eCheq de $2.579.717 a 30/60/90/120/150/180 días + crédito Santander UVA TNA 0% en 24 meses $24.517.500',
        anticipoEfectivo: null,
        cheques: { cantidad: 6, importeCadaUno: 2_579_717, plazosDias: [30, 60, 90, 120, 150, 180] },
        financiado: 24_517_500,
        condicionFinanciera: 'santander-uva-prendario-rodado',
        cierraContraTotal: false,
        // POR QUÉ NO CIERRA, Y POR QUÉ ESO NO ES UN ERROR DE TRANSCRIPCIÓN. Los seis eCheq suman
        // $15.478.302 contra los $12.482.500 que pide la forma A por la misma parte del auto. Los
        // $2.995.802 de diferencia son el precio de pagar a plazo, no un descuadre: el vendedor
        // aplicó un 24% redondo sobre el contado y lo repartió en seis. El crédito UVA es idéntico en
        // las dos formas, así que la comparación entre A y B es exactamente esa diferencia — y eso es
        // lo que `rodados-financiacion.mjs` mide contra el costo del descubierto.
        motivoDeDescuadre: 'recargo-por-plazo',
        // Lo que antes figuraba como ambigüedad ("¿$2.579.717 es por cheque o el total?") lo cerró el
        // dueño el 13/08 con el presupuesto en la mano: es POR cheque. Queda la fecha, no la duda.
        confirmadoPorDueno: '2026-08-13',
        adjunto: 'aaee8a95_0807_1223_2.jpg',
      },
    ],
    requisitos: ['DNI', 'constancia de CUIT'],
    notaVendedor:
      'ofrece la opción de financiar también el anticipo, "para que salga 100% financiado" — sin condiciones declaradas para esa variante',
    fichaTecnica: {
      adjunto: 'aaee8a95_0807_1223_6.pdf',
      tipo: 'Pick Up - Doble cabina',
      // UNA SOLA VERSIÓN COTIZADA, pero va en `versiones` igual que el Zanella: una ficha con dos
      // formas distintas obliga a todo consumidor a preguntar cuál tiene, y ahí es donde se lee mal.
      versiones: [
        {
          codigo: 'DC',
          nombre: 'Doble Cabina',
          dimensionesMm: { largo: 4740, ancho: 1655, alto: 1910 },
          cajaDeCargaMm: { largo: 2060, ancho: 1540, alto: 370 },
          pasajeros: 5,
          pesoOrdenDeMarchaKg: null, // el folleto no lo declara
          cargaLegalKg: 1000,
          pesoBrutoTotalKg: 2315,
        },
      ],
      distanciaEntreEjesMm: 3050,
      tanqueLitros: 55,
      tanqueMaterial: null,
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
      neumaticos: { delanteros: '185R14LT 8PR', traseros: '185R14LT 8PR', llantas: 'Acero', auxilio: null },
      seguridadDeSerie: ['Doble airbag frontal', 'Alarma de cinturón de seguridad', 'Cierre centralizado con llave'],
      seguridadOpcional: [],
      // EL MAPA CONSULTABLE. `null` no es "no lo trae": es "el folleto no lo dice" (ver `noLeido`).
      // Nunca completar un null mirando otra camioneta parecida.
      equipamiento: {
        airbag: 'serie',            // doble airbag frontal, enunciado en la página de texto del folleto
        abs: null,
        ebd: null,
        esp: null,
        drl: null,
        aireAcondicionado: null,
        radioMp3Usb: null,
      },
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
      {
        dato: 'COTIZACIÓN DEL SEGURO DEL RODADO (la póliza anual, distinta del seguro de la prenda)',
        motivo:
          'nadie la pidió todavía: no hay cotización de ninguna compañía. Es un costo recurrente que no está en ninguno de los dos números que se comparan, y en una camioneta de obra puede ser material. Sin él, "cuánto sale la camioneta" es el precio de compra, no el costo de tenerla.',
        bloquea: 'el costo anual de tenencia; no bloquea la elección entre la forma A y la B, que comparten unidad y seguro',
      },
      {
        dato: 'SI EL IVA DE ESTA COMPRA ES CRÉDITO FISCAL COMPUTABLE, Y POR QUÉ IMPORTE',
        motivo:
          'NO VERIFICADO EN ESTA SESIÓN — y sin verificar no se usa. La pregunta concreta es si una pick-up doble cabina afectada a la obra queda alcanzada por el tope de cómputo que la Ley de IVA fija para automóviles (art. 12) o si queda fuera por ser utilitario. Es una cuestión de encuadre normativo y de prueba de la afectación, no un dato del presupuesto: no se resuelve leyendo el PDF del vendedor ni desde la memoria del modelo. Lo define el ESTUDIO CONTABLE. Hasta que lo responda, el precio comparable entre alternativas es el TOTAL CON IVA ($37.000.000), que es como está cargado acá.',
        bloquea: 'el costo REAL de la unidad después de impuestos, y por lo tanto la comparación contra alquilar o contra otra marca cuyo encuadre sea distinto',
        aQuienSePregunta: 'estudio contable externo',
      },
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
    unidad: { marca: 'Zanella Trucks', modelo: 'Z-Truck', version: 'CS y CD (las dos versiones de la ficha)', anio: null, condicion: null },
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
      tipo: 'Utilitario con caja de carga — la ficha cubre las dos versiones',
      // LO QUE CAMBIA ENTRE VERSIONES. La CS lleva 2 personas y 2.800 mm de caja; la CD lleva 4 y
      // baja la caja a 2.100. Ésa es la decisión real: cuadrilla o carga, no las dos cosas.
      versiones: [
        {
          codigo: 'CS',
          nombre: 'Cabina Simple',
          dimensionesMm: { largo: 4880, ancho: 1650, alto: 1925 },
          cajaDeCargaMm: { largo: 2800, ancho: 1560, alto: 360 },
          pasajeros: 2,
          pesoOrdenDeMarchaKg: 1205,
          cargaLegalKg: 1010,
          pesoBrutoTotalKg: 1895,
        },
        {
          codigo: 'CD',
          nombre: 'Cabina Doble',
          dimensionesMm: { largo: 4905, ancho: 1650, alto: 1930 },
          cajaDeCargaMm: { largo: 2100, ancho: 1560, alto: 360 },
          pasajeros: 4,
          pesoOrdenDeMarchaKg: 1260,
          cargaLegalKg: 1000,
          pesoBrutoTotalKg: 1895,
        },
      ],
      distanciaEntreEjesMm: 3070,
      tanqueLitros: 50,
      tanqueMaterial: 'plástico',
      motor: {
        combustible: null,
        codigo: '4W12M1',
        cilindradaCc: 1206,
        cilindradaLitros: 1.206,
        potenciaCv: 85,
        potenciaKw: 63,
        potenciaRpm: 6000,
        torqueNm: null,
        torqueRpm: null,
        tecnologia: '4 cilindros en línea, 16 V, Euro V, Inyección Multipunto',
        distribucion: null,
      },
      transmision: { tipo: null, embrague: null },
      suspension: { delantera: 'McPherson independiente', trasera: 'Elásticos longitudinales (5)' },
      frenos: { delanteros: 'Disco', traseros: 'Tambor' },
      direccion: 'EPS (asistencia eléctrica)',
      neumaticos: { delanteros: '175/70 R14', traseros: '175/70 R14', llantas: null, auxilio: true, cantidad: 5 },
      // ACÁ LA TABLA SÍ ES INEQUÍVOCA: dice de serie u opcional fila por fila.
      seguridadDeSerie: ['ABS + EBD', 'Luz de circulación diurna DRL'],
      seguridadOpcional: ['Air Bag'],
      confortDeSerie: ['Aire acondicionado', 'Radio MP3 + USB'],
      // ═══ EL CAMPO QUE DECIDE ═══
      // `airbag: 'opcional'` es el motivo por el que esta unidad se descarta para una camioneta que
      // lleva gente a obra todos los días. Está acá, consultable con `equipamientoFaltante()`, y no
      // en un comentario, porque un motivo de descarte que vive en prosa no lo encuentra nadie.
      equipamiento: {
        airbag: 'opcional',
        abs: 'serie',
        ebd: 'serie',
        esp: null,
        drl: 'serie',
        aireAcondicionado: 'serie',
        radioMp3Usb: 'serie',
      },
    },
    // ═══ LOS TRES PESOS DE LA FICHA NO CIERRAN, Y NO LOS ARREGLO YO ═══
    // Peso en orden de marcha + carga legal debería caber en el PBT, y no cabe en ninguna de las dos
    // versiones: CS 1205 + 1010 = 2215 contra 1895 de PBT; CD 1260 + 1000 = 2260 contra 1895. Sobran
    // 320/365 kg. O el PBT está mal, o la "carga legal" es un máximo que sólo se alcanza con la
    // camioneta vacía de gente y equipo. La diferencia importa: con PBT 1895 la carga real de la CD
    // sería 635 kg, no 1000 — la mitad. No se corrige ningún número: se transcribe lo que dice la
    // ficha y se deja el conflicto a la vista para que se lo pregunten a la marca.
    inconsistencias: [
      {
        dato: 'peso en orden de marcha + carga legal > peso bruto total, en las dos versiones',
        motivo:
          'la ficha declara CS 1205+1010 kg con PBT 1895, y CD 1260+1000 kg con PBT 1895. Los tres números no pueden ser correctos a la vez. Hay que pedirle a la marca cuál es la carga útil real dentro del PBT antes de comprarla para llevar material.',
      },
    ],
    noLeido: [
      { dato: 'PRECIO', motivo: 'el adjunto es una ficha técnica de la marca, no un presupuesto: no hay ningún importe' },
      { dato: 'concesionaria, vendedor y condiciones de pago', motivo: 'no figuran en el adjunto' },
      { dato: 'torque, tipo de caja y combustible', motivo: 'la ficha no los declara' },
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
    'SI LA CUOTA LLEVA SEGURO DE VIDA SOBRE SALDO DEUDOR, Y CUÁNTO — el presupuesto escribe "24 x 1.021.563 + SEGURO" sin decir de qué seguro habla ni cuantificarlo. En el prendario que la empresa ya tiene, la diferencia entre la cuota francesa pura y el débito real fue de ~$332.000 por mes: un "+ SEGURO" sin número puede ser el 30% de la cuota',
    'SI HAY GASTOS DE OTORGAMIENTO DEL CRÉDITO, Y SI ESTÁN ADENTRO O AFUERA DE LOS $3.600.000 — los "gastos de retiro" dicen incluir la prenda, pero no vienen desglosados: no se puede saber qué parte es patentamiento, qué parte sellado de la prenda y qué parte gastos del préstamo',
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

/** Las versiones de una ficha, siempre como lista. Un presupuesto sin ficha devuelve vacío. */
export const versionesDe = (p) => p?.fichaTecnica?.versiones ?? []

/**
 * ¿ESTA UNIDAD TRAE AIRBAG DE SERIE? `true` · `false` (lo trae, pero opcional) · `null` (la ficha
 * no lo dice, que NO es lo mismo que "no lo trae").
 *
 * POR QUÉ ES UNA FUNCIÓN Y NO UN COMENTARIO. El airbag opcional del Zanella es el motivo por el que
 * esa unidad se descarta para llevar gente a obra. Un motivo de descarte tiene que poder consultarse
 * —desde el chat, desde la Web, desde un test— sin que nadie lea un archivo.
 */
export function airbagDeSerie(p) {
  const e = p?.fichaTecnica?.equipamiento
  if (!e || e.airbag == null) return null
  return e.airbag === 'serie'
}

/**
 * El equipamiento que NO viene de serie, con su estado. Es la lista de motivos por los que una
 * unidad puede quedar afuera: lo `opcional` cuesta plata aparte, lo `null` hay que ir a preguntarlo.
 */
export function equipamientoFaltante(p) {
  const e = p?.fichaTecnica?.equipamiento ?? {}
  return Object.entries(e)
    .filter(([, v]) => v !== 'serie')
    .map(([item, estado]) => ({ item, estado: estado ?? 'no declarado' }))
}

/**
 * Todo lo que ningún adjunto permitió leer, junto. Es lo que hay que ir a buscar.
 *
 * Incluye las INCONSISTENCIAS con su propio `tipo`: un dato que está pero no cierra también es
 * trabajo pendiente, y esconderlo entre lo que "sí se leyó" lo vuelve invisible.
 */
export function loQueFalta() {
  const dePresupuestos = PRESUPUESTOS_RODADOS.flatMap((p) =>
    (p.noLeido ?? []).map((n) => ({ ambito: p.clave, tipo: 'no_leido', ...n })))
  const inconsistencias = PRESUPUESTOS_RODADOS.flatMap((p) =>
    (p.inconsistencias ?? []).map((n) => ({ ambito: p.clave, tipo: 'inconsistencia', ...n })))
  const deCondicion = (CONDICION_CREDITO_RODADO.desconocido ?? []).map((d) => ({
    ambito: CONDICION_CREDITO_RODADO.clave, tipo: 'no_leido', dato: d, motivo: 'el presupuesto no lo declara',
  }))
  return [...dePresupuestos, ...inconsistencias, ...deCondicion]
}
