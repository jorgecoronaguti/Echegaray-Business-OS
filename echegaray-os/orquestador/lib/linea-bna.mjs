// LAS LÍNEAS DEL BANCO DE LA NACIÓN ARGENTINA para comprar un utilitario 0km.
//
// ═══ POR QUÉ EXISTE (13/08/2026) ═══
//
// El dueño reclamó que el informe de compra de rodados no considera "un préstamo del Banco Nación que
// siempre estuvo en consideración". Se buscó en TODAS las fuentes internas —la memoria del proyecto,
// `public.condiciones_financieras` (7 filas), el índice del Drive (2.465 archivos, sincronizado el
// 13/08), el repositorio y las transcripciones de sesiones previas— y NO HAY NINGÚN REGISTRO. No hay
// una carpeta presentada, ni una oferta, ni una cotización, ni un legajo. La línea no estaba cargada
// mal: no existía como dato.
//
// Por eso esta ficha NO ES UNA RECUPERACIÓN. Es una VERIFICACIÓN EXTERNA NUEVA contra el sitio oficial
// del BNA, leído el 13/08/2026. Lo que el dueño tenga en la cabeza —una charla en la sucursal, una
// oferta verbal, un convenio de una concesionaria— sigue sin estar acá y NO se supone: se pregunta.
// Ver `PREGUNTAR_AL_DUEÑO`.
//
// ═══ EL HALLAZGO QUE CAMBIA LA LECTURA: EL BNA NO PUBLICA LA TASA PyME ═══
//
// FONDEFIN publica una fórmula ("60% de la Badlar") y de ahí sale una TNA. El BNA, para sus líneas de
// empresas, NO PUBLICA NINGUNA TASA. Las tres páginas de producto que sirven para un utilitario dicen,
// textual, "Se determinará según calificación crediticia" y "Bonificación de tasa a cargo del
// fabricante/concesionario". El número sale de una calificación crediticia individual y de un convenio
// con la terminal — no de un tarifario público.
//
// CONSECUENCIA DIRECTA: la línea PyME del BNA **no se puede rankear**. No entra al comparador con un
// número estimado, promediado ni inferido de una noticia. Entra con `tna: null` y el hueco con nombre.
// Un CFT inventado en una decisión de compra de tres camionetas es exactamente lo que el OS no puede
// hacer.
//
// ═══ LA TRAMPA QUE CASI SE COME ESTE ANÁLISIS ═══
//
// Toda la prensa de agosto de 2026 habla de "+Autos con BNA": 48/72 cuotas, hasta $100M, sin prenda,
// aprobación inmediata. Es tentador y es CIERTO — pero es un PRÉSTAMO PERSONAL. La propia página de
// preguntas frecuentes del BNA lo contesta textual: "¿Las empresas y/o personas jurídicas tienen
// acceso al préstamo? No. Solo podrán acceder al préstamo exclusivamente personas humanas aptas para
// obligarse." Echegaray Construcciones es una S.A.: NO califica. Se documenta igual —con su TNA y su
// CFT reales, que son los únicos números publicados de todo el BNA— porque el dueño SÍ es una persona
// humana y esa puerta existe, con otro titular y otras consecuencias fiscales.

import { tasaReal, inflacionDeTrabajo } from './rodados-plan.mjs'

/** La fecha en que se leyeron las páginas oficiales. Todo lo de acá abajo es la foto de ese día. */
export const LEIDO_EL = '2026-08-13'

/**
 * CUÁNTO VALE LA FOTO. El BNA imprime en cada página de producto: "LAS CONDICIONES DE LA PRESENTE
 * PUEDEN SER MODIFICADAS UNILATERALMENTE POR EL BANCO, EN CUALQUIER MOMENTO Y SIN PREVIO AVISO."
 * No es una cláusula de estilo: en 2026 el BNA movió la tasa de +Autos varias veces (el comunicado de
 * noviembre de 2025 anunciaba 38% TNA; hoy la página publica 36%/46% con bonificación vigente desde el
 * 07/05/2026). Pasada la ventana, la fila deja de estar vigente y no se ofrece en ninguna comparación.
 *
 * 30 días, no 15 como FONDEFIN: acá no hay una Badlar diaria que mueva el número todos los días, hay
 * una decisión comercial del banco. Pero tampoco es indefinida.
 */
export const VALIDEZ_LECTURA_DIAS = 30

const DIA_MS = 86400000
const aDate = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
const aIso = (d) => d.toISOString().slice(0, 10)

/**
 * NÚCLEO PURO: hasta qué día vale una lectura de la página. Devuelve `null` si le dan una fecha
 * inválida — una vigencia inventada es peor que una vigencia faltante.
 * @param {string} fechaLectura 'AAAA-MM-DD'
 * @returns {string|null}
 */
export function vigenciaHastaDeLaLectura(fechaLectura = LEIDO_EL, dias = VALIDEZ_LECTURA_DIAS) {
  const d = aDate(fechaLectura)
  if (Number.isNaN(d.getTime())) return null
  return aIso(new Date(d.getTime() + dias * DIA_MS))
}

/**
 * NÚCLEO PURO: el estado de la foto a una fecha dada. Lo que un consumidor puede mirar sin ir a la base.
 * @param {string|Date} hoy
 */
export function estadoDeLaLectura(hoy = new Date(), fechaLectura = LEIDO_EL) {
  const h = aDate(typeof hoy === 'string' ? hoy : aIso(hoy))
  const vence = vigenciaHastaDeLaLectura(fechaLectura)
  const dias = Math.round((h.getTime() - aDate(fechaLectura).getTime()) / DIA_MS)
  return { leido_el: fechaLectura, dias_de_la_foto: dias, vence_el: vence, vencida: aIso(h) > vence }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LO ÚNICO QUE EL BNA PUBLICA COMO NÚMERO: LA TASA DE +AUTOS (préstamo PERSONAL)
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Las dos tasas de "+Autos con BNA", transcriptas literal de bna.com.ar/home/masautos.
 *
 * ES EL ÚNICO CFT PUBLICADO DE TODO EL BNA para financiar un rodado, y por eso vale documentarlo aun
 * cuando la empresa no califica: es la única cota superior verificable que existe. Y el propio banco
 * declara qué incluye y qué no: "El cálculo de CFT incluye capital, interés e IVA sobre intereses.
 * (No incluye impuestos de sellos provinciales)."
 *
 * `cliente_haberes` exige "3 acreditaciones de sueldo mensuales y consecutivas" en cuenta sueldo BNA
 * o estar preseleccionado. Sin eso rige `cartera_abierta`, que es 10 puntos de TNA más cara. Para
 * Echegaray importa: hoy los haberes NO se acreditan en el BNA — ver `PREGUNTAR_AL_DUEÑO`.
 */
export const MAS_AUTOS_TASAS = {
  cliente_haberes: { tna: 0.36, tea: 0.4258, cft_tna: 0.4356, cft_tea: 0.534 },
  cartera_abierta: { tna: 0.46, tea: 0.5705, cft_tna: 0.5566, cft_tea: 0.723 },
  /** El banco aclara que el CFT está calculado sobre un caso testigo, no sobre cualquier monto. */
  calculado_para: 1_000_000,
  bonificacion_vigente_desde: '2026-05-07',
  incluye_en_el_cft: 'capital, interés e IVA sobre intereses',
  no_incluye_en_el_cft: 'impuestos de sellos provinciales',
}

/**
 * EL IVA SOBRE INTERESES DEL BNA — no se tipea, se DECLARA COMO NO PUBLICADO.
 *
 * El BNA no publica la alícuota en ninguna de las páginas leídas. Sí dice que el CFT de +Autos "incluye
 * IVA sobre intereses", o sea que existe, pero no con qué número. Tentación evidente: despejarlo de la
 * diferencia entre TEA (42,58%) y CFT TEA (53,40%). NO SE HACE: esa diferencia mezcla el IVA con todo
 * lo demás que el banco haya metido en el CFT, y despejar una alícuota fiscal de una resta es
 * exactamente "presentar una estimación como hecho".
 *
 * Lo que SÍ se puede decir con base: el BNA es una entidad regida por la Ley 21.526, que es el
 * supuesto que habilita la alícuota reducida del 10,5% del art. 28 de la Ley de IVA — el mismo
 * encuadre que en FONDEFIN quedó EN DUDA porque Fiduciaria San Juan SAPEM no es entidad financiera.
 * Es un argumento a favor del 10,5%, no una verificación. Va en `desconocido`, no en el campo.
 */
export const IVA_SOBRE_INTERESES = null

/**
 * LAS ÚNICAS TASAS DEL BNA QUE APARECEN EN ALGÚN LADO, Y POR QUÉ NINGUNA ES LA DE ESTA LÍNEA.
 *
 * Se barrió el tarifario oficial, los comunicados de prensa del BNA, las publicaciones obligatorias en
 * el Boletín Oficial (Decreto 13.477/56) y el informe de financiamiento de IERAL PyME. De las 18 líneas
 * PyME que el BNA lista, NINGUNA publica tasa numérica en su página. Lo que hay es esto.
 *
 * ESTÁN ACÁ PARA QUE NADIE LAS USE COMO SI FUERAN LA TASA. Cada una viene con `por_que_no_es_la_nuestra`
 * porque el modo en que este análisis se rompe no es inventando un número: es agarrando uno REAL de una
 * línea parecida y pegándolo en la casilla equivocada.
 */
export const ANCLAS_DE_TASA_2026 = [
  {
    que: 'Maquinaria nueva de fabricación nacional, en pesos: "tasa desde 18%" con aporte del fabricante o concesionario, hasta 60 meses',
    tna: 0.18,
    es_un_piso: true,
    oficial: true,
    fecha: '2026-07-16',
    fuente: 'BNA — prensa.bna.com.ar/ExpoRural2026',
    por_que_no_es_la_nuestra:
      'es de OTRA línea (Maquinarias y Equipos nuevos de Fabricación Nacional, 48 meses), es un PISO ("desde") y depende del aporte del fabricante. Y su destino exige que el vehículo esté "fabricado en el país": un rodado de origen chino no entra. Sirve como orden de magnitud del apetito del banco en 2026, no como tasa de la línea de vehículos comerciales.',
  },
  {
    que: 'Vehículos comerciales MiPyME: 22% TNA fija el 1er año, luego BADLAR, 5 años, sin límite de monto, cupo $100.000M',
    tna: 0.22,
    es_un_piso: false,
    oficial: true,
    fecha: '2024-05-23',
    fuente: 'BNA — prensa.bna.com.ar/creditosBNATransporte',
    por_que_no_es_la_nuestra:
      'ES EL COMUNICADO DE LA LÍNEA CORRECTA Y ESTÁ DOS AÑOS VIEJO. No hay comunicado posterior que lo reemplace NI que lo dé de baja: no se sabe si sigue rigiendo, si el cupo se agotó, ni cuánto vale hoy "luego BADLAR". Usar un 22% de mayo de 2024 en una decisión de agosto de 2026 es exactamente mezclar ventanas de tiempo incompatibles.',
  },
  {
    que: 'Línea 750 MiPyME Inversión Productiva: 37% TNA fija a 6 años, o 32% fija 3 años y luego TAMAR + 5,5 ppa',
    tna: 0.37,
    es_un_piso: false,
    oficial: false,
    fecha: '2026-04-16',
    fuente: 'IERAL PyME — Informe de financiamiento disponible, abril 2026 (TERCERO, no el BNA)',
    por_que_no_es_la_nuestra:
      'es de un tercero, es de abril, es de la línea de inversión productiva (no la de vehículos) y algunas variantes del informe incluyen bonificaciones provinciales que Echegaray no necesariamente tiene. Es la mejor evidencia numérica que existe para inversión en pesos y aun así no se carga en la ficha.',
  },
  {
    que: 'Tasa de cartera general del BNA (la tasa de referencia del banco): 25,80% TNA / 29,08% TEA',
    tna: 0.258,
    es_un_piso: false,
    oficial: true,
    fecha: '2026-08-14',
    fuente: 'BNA — tarifario oficial "Tasas activas en pesos", bna.com.ar/BackOffice/dataBase/tasas_cart_3941.pdf',
    por_que_no_es_la_nuestra:
      'no es una línea: es la tasa de referencia del banco. IMPORTA POR OTRO MOTIVO — es la tasa a la que FONDEFIN calcula sus intereses MORATORIOS ("Tasa Activa Cartera General del Banco Nación", más punitorios del 50%). O sea que atrasarse una cuota de FONDEFIN cuesta 25,80% + 12,90% = 38,70% anual, contra los 13,69% del crédito al día.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LA DEMORA — el eje que ordena toda la decisión de rodados
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * DEMORA DEL TRÁMITE. Para +Autos el BNA la publica y es la cifra más agresiva de todo el tablero:
 * "Una vez que el representante de la concesionaria finalice la carga de tus datos personales, es
 * inmediato." Para la línea PyME NO publica ningún plazo — y a diferencia de FONDEFIN (donde el dueño
 * aportó los ~120 días), acá no hay ni siquiera un dato del dueño. `null`, no un número plausible.
 */
export const DEMORA_TRAMITE_DIAS = { mas_autos: 0, pyme_vehiculos_comerciales: null }

/**
 * NÚCLEO PURO: ¿llega la línea a tiempo para una necesidad que vence en `diasHastaLaNecesidad`?
 * Con demora desconocida devuelve `null` — no "sí". Un trámite sin plazo publicado no es un trámite
 * rápido: es un trámite sin plazo publicado.
 * @param {number} diasHastaLaNecesidad
 * @param {number|null} demora
 */
export function llegaATiempo(diasHastaLaNecesidad, demora = DEMORA_TRAMITE_DIAS.pyme_vehiculos_comerciales) {
  const d = Number(diasHastaLaNecesidad)
  if (!Number.isFinite(d)) return { llega: null, motivo: 'no se sabe para cuándo se necesita' }
  if (demora == null) {
    return { llega: null, motivo: 'el BNA no publica plazo de resolución para la línea PyME: no se puede afirmar que llegue' }
  }
  if (d >= demora) return { llega: true, motivo: `el trámite demora ~${demora} días y hay ${d}` }
  return { llega: false, motivo: `el trámite demora ~${demora} días y la necesidad vence en ${d}` }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LA TASA REAL — Fisher, y sólo sobre lo que existe
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * NÚCLEO PURO: la tasa real de una línea del BNA por Fisher exacto, `(1+nominal)/(1+inflación)−1`.
 *
 * NO reimplementa Fisher: importa `tasaReal` de rodados-plan.mjs, que es donde vive. Lo que agrega es
 * el portón: con `nominal` en null devuelve `null` en vez de propagar un NaN con cara de número. La
 * línea PyME del BNA cae SIEMPRE en ese caso, y es el punto de todo el módulo.
 *
 * @param {number|null} nominalAnual la tasa efectiva anual que se paga (CFT TEA si existe, no la TNA)
 * @param {number} inflacionAnual
 * @returns {number|null}
 */
export function tasaRealBna(nominalAnual, inflacionAnual = inflacionDeTrabajo().anual) {
  if (nominalAnual == null || !Number.isFinite(Number(nominalAnual))) return null
  if (!Number.isFinite(Number(inflacionAnual))) return null
  return tasaReal(Number(nominalAnual), Number(inflacionAnual))
}

/**
 * Dónde queda el BNA en el ranking de costo REAL. Devuelve las dos variantes de +Autos con su tasa
 * real, y la línea PyME con `tasa_real: null` y el motivo — que NO es un empate ni un aplazamiento:
 * es la respuesta.
 *
 * Se mide contra el CFT TEA, no contra la TNA. Comparar la TNA del BNA contra el CFTEA del prendario
 * de mercado sería premiar a la línea peor documentada, que es el sesgo exacto que este módulo evita.
 */
export function rankingReal(inflacionAnual = inflacionDeTrabajo().anual) {
  return [
    {
      linea: '+Autos con BNA — cliente con haberes en BNA',
      apta_para_la_empresa: false,
      base: 'CFT TEA 53,40%',
      nominal: MAS_AUTOS_TASAS.cliente_haberes.cft_tea,
      tasa_real: tasaRealBna(MAS_AUTOS_TASAS.cliente_haberes.cft_tea, inflacionAnual),
    },
    {
      linea: '+Autos con BNA — cartera abierta',
      apta_para_la_empresa: false,
      base: 'CFT TEA 72,30%',
      nominal: MAS_AUTOS_TASAS.cartera_abierta.cft_tea,
      tasa_real: tasaRealBna(MAS_AUTOS_TASAS.cartera_abierta.cft_tea, inflacionAnual),
    },
    {
      linea: 'BNA PyME — Camiones, Remolques, Semirremolques, Utilitarios, Minibuses y Buses',
      apta_para_la_empresa: true,
      base: null,
      nominal: null,
      tasa_real: null,
      motivo: 'el BNA no publica tasa para esta línea: "Se determinará según calificación crediticia" y "Bonificación de tasa a cargo del fabricante/concesionario". No se estima.',
    },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LAS FICHAS
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const FUENTE_PYME =
  'Banco de la Nación Argentina — bna.com.ar/Empresas/Pymes/CreditoCamionesUtilitariosMiniINV ("Adquisición de Camiones, Remolques, Semirremolques, Utilitarios, Minibuses y Buses (Colectivos)"), texto literal de la página leído el 13/08/2026 · índice de líneas en bna.com.ar/empresas/pymes/creditos · la ausencia de tasa se verificó además contra el tarifario oficial (bna.com.ar/BackOffice/dataBase/tasas_cart_3941.pdf, vigencia 14/08/2026), los comunicados de prensa.bna.com.ar y las publicaciones obligatorias del BNA en el Boletín Oficial (avisos del 12/02/2026 y 03/06/2026): ninguna de las 18 líneas PyME publica tasa numérica'

const FUENTE_MAS_AUTOS =
  'Banco de la Nación Argentina — bna.com.ar/home/masautos ("+Autos con BNA"), condiciones generales, cuadro de tasas y preguntas frecuentes, texto literal leído el 13/08/2026'

/**
 * LA LÍNEA QUE LE SIRVE A LA EMPRESA. Es la única del BNA que (a) admite personas jurídicas, (b)
 * nombra "utilitarios" en el destino y (c) admite origen extranjero nacionalizado.
 *
 * `tna: null` Y `cft: null` A PROPÓSITO Y JUNTOS. No es una ficha a medio cargar: es una ficha que
 * dice la verdad sobre una línea cuyo precio no es público. `costoEfectivo` la va a devolver como
 * `sin_dato`, y eso es correcto — un préstamo sin tasa conocida no tiene costo calculable.
 *
 * `limite_disponible: null`: no es capital de trabajo y además no hay línea aprobada. Con eso
 * `paramsParaMotor` no la mete en el motor de tesorería, que es lo que corresponde.
 */
export const CONDICION_BNA_VEHICULOS_COMERCIALES = {
  clave: 'bna-pyme-vehiculos-comerciales',
  entidad: 'Banco de la Nación Argentina',
  producto: 'Adquisición de Camiones, Remolques, Semirremolques, Utilitarios, Minibuses y Buses (Colectivos) — MiPyME',
  tipo_financiacion: 'prestamo',
  moneda: 'ARS',
  // CONVENCIÓN, no dato: la página no publica fecha de entrada en vigencia. Se ancla al 1° del mes de
  // la lectura para que la clave única sea estable y re-correr la semilla ACTUALICE la fila en vez de
  // duplicarla por día. Dicho también en observaciones: un supuesto que sólo vive en un comentario del
  // código no viaja a Postgres ni a la Web.
  vigencia_desde: '2026-08-01',
  vigencia_hasta: vigenciaHastaDeLaLectura(),
  tna: null, // NO PUBLICADA — el corazón de esta ficha
  tea: null,
  cft: null,
  iva_sobre_intereses: IVA_SOBRE_INTERESES, // null: el BNA no lo publica y no se despeja de una resta
  comisiones: null,
  gastos: null,
  plazo_dias: 1825, // "Plazo: Hasta 60 meses."
  dias_minimos: null,
  limite_disponible: null,
  saldo_utilizado: null,
  amortizacion: 'Sistema alemán (cuota de capital constante e intereses decrecientes: la primera cuota es la más alta). Plazo de hasta 60 meses. La página NO publica período de gracia para esta línea.',
  fecha_debito: null,
  garantias: 'NO PUBLICADA. La página dice, textual: "Monto y Garantía: Se determinará según calificación crediticia." No se afirma que exija prenda ni que no la exija. Comparar contra FONDEFIN, que sí publica su exigencia (prenda en 1er grado cubriendo el 200% del financiamiento), sólo es posible después de preguntarlo en la sucursal.',
  nivel_confianza: 'informado',
  fuente: FUENTE_PYME,
  observaciones: [
    'LA TASA NO ESTÁ PUBLICADA Y NO SE ESTIMA. La página dice textual "Monto y Garantía: Se determinará según calificación crediticia" y "Bonificación de tasa a cargo del fabricante/concesionario". El precio de esta línea sale de DOS cosas que no están en ningún tarifario: la calificación crediticia de Echegaray en el BNA y el convenio que la terminal (o la concesionaria) tenga firmado con el banco. Por eso tna, tea y cft van en null y esta línea NO SE PUEDE RANKEAR contra FONDEFIN (13,6875% TNA), el UVA de Santander (0% nominal), el prendario de mercado (65,10% CFTEA) ni el descubierto (62,78% CFT). Cualquier número que aparezca en una noticia sobre "créditos del Banco Nación para autos" es de la línea de PRÉSTAMOS PERSONALES, no de ésta.',
    'RESTRICCIÓN QUE SÍ EXISTE Y NO ES LA DE FONDEFIN — EL CONVENIO. Texto literal del destino: "Adquisición de camiones, remolques, semirremolques, utilitarios, minibuses o buses (colectivos) de aquellas empresas fabricantes y/o concesionarios QUE SUSCRIBAN EL CONVENIO CON EL BNA. Los rodados deberán ser nuevos 0KM, de origen nacional o extranjero, requiriéndose para éstos últimos se encuentren en plaza ya nacionalizados." O sea: el filtro no es la carrocería, es la MARCA Y LA CONCESIONARIA. Si la terminal del rodado elegido no tiene convenio vigente con el BNA, la línea no aplica por más que la empresa califique — y el BNA no publica el listado de fabricantes adheridos de esta línea PyME.',
    'CABINA SIMPLE vs DOBLE CABINA: LA RESTRICCIÓN DE FONDEFIN NO APARECE ACÁ. El reglamento de FONDEFIN es explícito y acotado ("camionetas pick up ÚNICAMENTE CABINA SIMPLE 0km") y esa sola frase viene ordenando toda la decisión de compra. El texto del BNA NO menciona carrocería, NO distingue cabina simple de doble y NO nombra "pick up": nombra la categoría "utilitarios". CUIDADO CON EL SALTO LÓGICO: que no lo prohíba no es que lo permita. Que una pick up doble cabina entre en la categoría "utilitario" a los efectos de esta línea es una PREGUNTA para el oficial de cuentas, no una conclusión. Es el dato de mayor impacto de todo este módulo y por eso está en desconocido y en preguntar, no dado por bueno.',
    'PERSONAS JURÍDICAS: SÍ. Usuarios, textual: "Micro, pequeñas, y medianas empresas de todos los sectores económicos, incluidas empresas de transporte público de pasajeros (quedan excluidos los monotributistas)." Echegaray Construcciones S.A. entra por ser MiPyME; el corte de monotributistas no la afecta. Esto la distingue de +Autos con BNA, que excluye expresamente a las personas jurídicas.',
    'FINANCIA EL 100%: "Otorgamos hasta el 100% de lo solicitado." Es mejor que la línea de maquinaria usada del propio BNA (70%) y que "Empresas fabricantes y concesionarios" (70% del valor de venta IVA incluido). NO se aclara si el 100% se calcula sobre el precio con IVA o sobre el neto, ni si cubre patentamiento, flete y gastos de entrega — en +Autos el BNA aclara que NO financia patentamiento, y acá no dice nada.',
    'AMORTIZACIÓN ALEMANA, y no es un detalle contable: con sistema alemán la cuota arranca alta y baja todos los meses, al revés del francés que usa el cuadro del informe de rodados. Sobre 60 meses eso cambia el perfil de caja de los primeros meses, que es justamente el tramo ajustado del Cash Flow (mínimo de $20,3M la semana del 28/12). Comparar cuotas iniciales entre esta línea y FONDEFIN sin corregir por sistema de amortización da una lectura falsa.',
    'PLAZO 60 MESES contra los 48 de FONDEFIN: 12 meses más de plazo. Pero FONDEFIN da 6 meses de GRACIA DE CAPITAL y esta página no publica ninguna gracia. Sin la tasa, más plazo no se puede traducir a mejor ni a peor: alarga el pago y suma intereses a la vez.',
    'DEMORA DEL TRÁMITE: NO PUBLICADA para esta línea. El BNA sí publica que +Autos (el préstamo personal) es "inmediato" en la concesionaria, y esa velocidad NO se traslada acá: una operación PyME pasa por calificación crediticia previa ("Si tu empresa no está calificada, solicitala online"). No se estima un plazo. Consecuencia operativa: NO se puede afirmar que esta línea llegue a tiempo para la unidad que se necesita en septiembre.',
    'EL COMUNICADO DE ESTA MISMA LÍNEA EXISTE Y ESTÁ DOS AÑOS VIEJO. El 23/05/2024 el BNA anunció esta línea con "22% TNA fija el primer año, luego BADLAR, 5 años, sin límite de monto, cupo $100.000 millones" (prensa.bna.com.ar/creditosBNATransporte). NO hay ningún comunicado posterior que lo reemplace NI que lo dé de baja. Ese 22% NO se carga: no se sabe si sigue rigiendo, si el cupo se agotó, ni cuánto vale hoy el tramo "luego BADLAR". Pero SÍ dice algo que importa — cuando el BNA publicó una tasa para esta línea, la estructura era MIXTA (fija un año, variable después), no fija a 60 meses como FONDEFIN. Si eso sigue así, el crédito del BNA tiene el costo abierto a 4 años de Badlar y FONDEFIN (probablemente) no. Es una pregunta, no una conclusión.',
    'HAY UNA SEGUNDA PUERTA EN EL MISMO BANCO Y EXCLUYE AL RODADO ELEGIDO: la línea "Maquinarias y Equipos nuevos de Fabricación Nacional" (bna.com.ar/Empresas/Pymes/CreditoMaquinasFabNacional) tiene un destino textual que incluye "maquinarias, equipos, bs. de capital Y VEHÍCULOS, nuevos y FABRICADOS EN EL PAÍS", sin ninguna lista de carrocerías — o sea que una pick up doble cabina de fabricación nacional entra por el texto, cosa que FONDEFIN prohíbe. Y es la ÚNICA línea de inversión del BNA con un número oficial de 2026: "tasa desde 18%" con aporte del fabricante, comunicado del 16/07/2026. EL PROBLEMA: exige fabricación nacional. Un rodado de origen chino queda afuera de esta puerta, aunque sí entre por la de vehículos comerciales (que admite "origen extranjero ya nacionalizado"). Es un cruce que puede cambiar qué unidad se compra, no sólo cómo se paga.',
    'VIGENCIA_DESDE ES UNA CONVENCIÓN, NO UN DATO: el 01/08/2026 es el 1° del mes en que se leyó la página. El BNA no publica fecha de entrada en vigencia de esta línea. Se eligió así para que la clave única de la tabla sea estable y re-correr la semilla actualice la fila en vez de duplicarla por día.',
    'CADUCIDAD DE ESTA FILA: vence el 12/09/2026, 30 días corridos después de la lectura. No es una fecha del banco: es hasta cuándo el OS se hace cargo de esta foto, y se apoya en el disclaimer que el propio BNA imprime en la página — "LAS CONDICIONES DE LA PRESENTE PUEDEN SER MODIFICADAS UNILATERALMENTE POR EL BANCO, EN CUALQUIER MOMENTO Y SIN PREVIO AVISO". Pasada esa fecha la línea deja de estar vigente y no se ofrece en ninguna comparación hasta que alguien vuelva a leer la página.',
    'DISCLAIMER DEL BANCO, textual: "SUJETO A PROCESO DE VINCULACIÓN Y/O ANÁLISIS CREDITICIO DEL BANCO, Y A LA APROBACIÓN Y/O REGULACIONES QUE SOBRE LA MATERIA PUDIERAN CORRESPONDER, EMANADA DE LOS ORGANISMOS DE CONTRALOR. LA PRESENTE NO ES UNA OFERTA CREDITICIA."',
    'ESTA FICHA NO RECUPERA NADA: es una verificación externa nueva del 13/08/2026. No existe en el OS ningún registro previo de gestión ante el BNA —ni carpeta, ni oferta, ni legajo, ni nota en el Drive— pese a que el dueño lo da por considerado desde hace tiempo. Si existe una conversación o una oferta concreta fuera del sistema, ese dato manda sobre esta ficha y hay que cargarlo.',
  ].join(' ── '),
  desconocido: [
    'TNA — no publicada. "Se determinará según calificación crediticia" + "Bonificación de tasa a cargo del fabricante/concesionario". Es el dato que impide comparar la línea con cualquier otra',
    'CFT — no publicado y no derivable: sin TNA no hay de dónde partir',
    'IVA sobre intereses — no publicado en ninguna página del BNA leída. El BNA SÍ es entidad regida por la Ley 21.526 (a diferencia de Fiduciaria San Juan SAPEM), lo que hace plausible el 10,5% del art. 28 de la Ley de IVA, pero eso es un argumento, no una verificación: lo confirma el estudio contable o la sucursal, no el OS',
    'si una pick up DOBLE CABINA entra en la categoría "utilitarios" de esta línea — el texto no la excluye pero tampoco la nombra, y FONDEFIN sí la excluye expresamente. Es el dato que más mueve la decisión',
    'qué fabricantes y concesionarios tienen convenio vigente con el BNA para ESTA línea PyME — el listado publicado (Volkswagen) es el de +Autos, que es otro producto',
    'garantía exigida — "según calificación crediticia": no se sabe si pide prenda, si pide aval de SGR, ni con qué cobertura',
    'monto máximo — "según calificación crediticia": no hay tope publicado, ni piso',
    'período de gracia — la página no menciona ninguno para esta línea (sí lo menciona para riego en otras líneas del banco)',
    'demora del trámite — el BNA no publica plazo de resolución para operaciones PyME',
    'si el 100% financiable se calcula sobre el precio con IVA o sobre el neto, y si cubre patentamiento, flete y gastos de entrega',
    'gastos de otorgamiento, sellado provincial y seguros exigidos — no publicados (en +Autos el banco declara "sin ningún gasto de otorgamiento", pero eso es el producto personal)',
    'si el rodado elegido (DFSK, de origen chino) cumple el requisito de estar "en plaza ya nacionalizado" y si su importador tiene convenio con el BNA',
    'si el comunicado del 23/05/2024 de esta misma línea (22% TNA fija el 1er año, luego BADLAR, 5 años, cupo $100.000M) sigue vigente, si el cupo se agotó, y si la estructura de tasa sigue siendo MIXTA — de eso depende que el costo quede cerrado o abierto a Badlar durante 4 años',
  ],
  preguntar: [
    '¿Una pick up DOBLE CABINA 0km califica como "utilitario" en esta línea, o rige la misma restricción de cabina simple que FONDEFIN? — es la pregunta que decide si el BNA cambia el informe o no',
    '¿Qué TNA y qué CFT le corresponden hoy a Echegaray Construcciones S.A. según su calificación crediticia, a 60 meses y sistema alemán? — sin esto la línea no entra a ninguna comparación',
    '¿Qué fabricantes/concesionarias tienen convenio vigente con el BNA para esta línea, y está entre ellas la del rodado elegido?',
    '¿Cuánto demora, desde que se presenta la carpeta completa, hasta el desembolso? — de eso depende si sirve para la unidad de septiembre o sólo para las siguientes',
    '¿Qué garantía exige y con qué cobertura? FONDEFIN pide prenda al 200%: ¿el BNA pide menos?',
    '¿El 100% financiable es sobre el precio con IVA? ¿Cubre patentamiento y gastos de entrega, o son aporte propio como en FONDEFIN?',
    '¿Hay gastos de otorgamiento, sellado o seguro de vida sobre saldo deudor? — sin eso no hay CFT real',
    '¿Se puede tomar esta línea sin acreditar haberes en el BNA, o la calificación empeora?',
    '¿La tasa es FIJA los 60 meses o mixta (fija el primer año y luego Badlar), como decía el comunicado de 2024 de esta misma línea? — es la diferencia entre un costo cerrado y uno abierto a 4 años, la misma pregunta que quedó abierta en FONDEFIN',
    '¿Conviene más la línea de Maquinarias de Fabricación Nacional (48 meses, "desde 18%" con aporte del fabricante, admite vehículos sin restricción de carrocería) comprando una unidad fabricada en el país, en vez de ésta con un rodado importado?',
  ],
}

/**
 * LA LÍNEA QUE **NO** LE SIRVE A LA EMPRESA, documentada igual.
 *
 * Entra a la tabla porque es la única condición del BNA con TNA y CFT publicados y verificables, y
 * porque el dueño es persona humana: la puerta existe, con otro titular. Pero entra con la
 * inhabilitación escrita en el producto y en las observaciones, para que nadie la lea como una opción
 * de la S.A. `limite_disponible: null` la mantiene fuera del motor de tesorería.
 */
export const CONDICION_BNA_MAS_AUTOS = {
  clave: 'bna-mas-autos-personal',
  entidad: 'Banco de la Nación Argentina',
  producto: '+Autos con BNA — préstamo personal (NO apto para personas jurídicas)',
  tipo_financiacion: 'prestamo',
  moneda: 'ARS',
  vigencia_desde: MAS_AUTOS_TASAS.bonificacion_vigente_desde,
  vigencia_hasta: vigenciaHastaDeLaLectura(),
  // Se carga la tasa de CARTERA ABIERTA, no la bonificada: Echegaray no acredita haberes en el BNA y
  // la bonificada exige 3 acreditaciones consecutivas o estar preseleccionado. Cargar la mejor de las
  // dos sería suponer un beneficio que hoy nadie tiene. La bonificada vive en MAS_AUTOS_TASAS.
  tna: MAS_AUTOS_TASAS.cartera_abierta.tna,
  tea: MAS_AUTOS_TASAS.cartera_abierta.tea,
  cft: MAS_AUTOS_TASAS.cartera_abierta.cft_tea,
  // El BNA declara que el CFT YA INCLUYE el IVA sobre intereses, pero no publica la alícuota. Se deja
  // en null igual: si se cargara un número, costoEfectivo lo sumaría OTRA VEZ sobre los intereses y
  // contaría el IVA dos veces. El costo total correcto se lee del CFT, no de la suma.
  iva_sobre_intereses: null,
  comisiones: null,
  gastos: null,
  plazo_dias: 2190, // "Plazo: Hasta 72 meses."
  dias_minimos: null,
  limite_disponible: null,
  saldo_utilizado: null,
  amortizacion: 'Sistema francés con amortización mensual, hasta 72 meses. Cuota debitada automáticamente de una caja de ahorro a nombre del titular. Cancelación anticipada parcial o total permitida, "podría tener un costo asociado" (no publicado).',
  fecha_debito: 'débito automático mensual en caja de ahorro del titular',
  garantias: 'Sola firma. Sin suscripción de pagaré ni prenda.',
  nivel_confianza: 'informado',
  fuente: FUENTE_MAS_AUTOS,
  observaciones: [
    'NO APLICA A ECHEGARAY CONSTRUCCIONES S.A. Y ESTO NO ES UNA INTERPRETACIÓN: es la respuesta textual del BNA en sus preguntas frecuentes — "¿Las empresas y/o personas jurídicas tienen acceso al préstamo? No. Solo podrán acceder al préstamo exclusivamente personas humanas aptas para obligarse." Toda la prensa de agosto de 2026 sobre "créditos del Banco Nación para comprar autos 0km en 48 cuotas" habla de ESTE producto. Es la confusión más probable y la razón por la que esta fila existe.',
    'LA TASA CARGADA ES LA DE CARTERA ABIERTA (46% TNA / 72,30% CFT TEA), NO LA BONIFICADA. La bonificada (36% TNA / 53,40% CFT TEA, vigente desde el 07/05/2026) exige cuenta sueldo en el BNA con 3 acreditaciones mensuales consecutivas, o estar preseleccionado en una campaña del banco. Hoy no se cumple ninguna de las dos: cargar la bonificada sería suponer un beneficio que nadie tiene. Ambas están en MAS_AUTOS_TASAS.',
    'EL CFT YA INCLUYE EL IVA SOBRE INTERESES —el banco lo dice textual: "El cálculo de CFT incluye capital, interés e IVA sobre intereses. (No incluye impuestos de sellos provinciales)"— pero NO publica la alícuota. Por eso iva_sobre_intereses queda en null: cargar un 10,5% haría que costoEfectivo lo sume OTRA VEZ sobre los intereses y cuente el impuesto dos veces. El costo total se lee del CFT, no de la suma de partes.',
    'LO QUE LO HACE TENTADOR, Y ES CIERTO: aprobación INMEDIATA en la concesionaria con sólo el DNI ("Una vez que el representante de la concesionaria finalice la carga de tus datos personales, es inmediato"), sin gastos de otorgamiento, sin prenda, sin pagaré, hasta $100.000.000, hasta 72 meses, 100% del valor con IVA, 0km o usados de hasta 10 años, nacionales o importados, y el destino incluye expresamente "automóviles, pick up y/o utilitarios" SIN restricción de carrocería. Contra los ~120 días de FONDEFIN, es la diferencia entre tener la camioneta este mes o en diciembre.',
    'LO QUE CUESTA: 72,30% de CFT TEA a cartera abierta contra una inflación de descuento del 29,83% anual da una tasa real POSITIVA de +32,71% (Fisher exacto). Es la financiación MÁS CARA de todo el tablero de rodados — peor que el prendario de mercado (+27,16%) y peor que el descubierto del Santander (+25,38%). Con la bonificación de haberes (53,40% CFT TEA) baja a +18,15% real: sigue siendo peor que FONDEFIN (−10,49%) y que el UVA.',
    'Y ADEMÁS CAMBIA EL TITULAR: el rodado y la deuda quedan a nombre de una persona humana, no de la S.A. Eso saca el bien del activo de la empresa, saca el gasto financiero del P&L, y abre preguntas de aporte/retiro de socio, IVA crédito fiscal no computable y amortización que NO están resueltas acá. No es un préstamo más barato con otro papel: es otra operación. Antes de considerarlo hay que pasarlo por el estudio contable.',
    'NO FINANCIA patentamiento ni gastos adicionales: "Solo se financia hasta el 100% del valor del vehículo (IVA incluido)."',
    'CADUCIDAD DE ESTA FILA: vence el 12/09/2026, 30 días corridos después de la lectura, apoyada en el disclaimer del propio banco. El BNA cambió esta tasa al menos una vez en 2026 (el comunicado de prensa de noviembre de 2025 anunciaba 38% TNA; la bonificación vigente arranca el 07/05/2026).',
  ].join(' ── '),
  desconocido: [
    'alícuota de IVA sobre intereses — el BNA declara que el CFT la incluye pero no publica el número',
    'costo de la cancelación anticipada — el banco dice que "podría tener un costo asociado" sin cuantificarlo',
    'impuesto de sellos provincial de San Juan aplicable — el propio banco aclara que su CFT NO lo incluye',
    'consecuencias fiscales y societarias de que el rodado y la deuda queden a nombre del dueño y no de la S.A. — lo resuelve el estudio contable, no el OS',
    'si el listado de concesionarias adheridas cubre la marca del rodado elegido en San Juan',
  ],
  preguntar: [
    '¿Vale la pena siquiera evaluarlo, sabiendo que el bien y la deuda quedan a nombre personal y no de la empresa? — es una pregunta contable antes que financiera',
    '¿El dueño está preseleccionado en alguna campaña del BNA, o podría acreditar haberes para bajar de 46% a 36% de TNA?',
    '¿Qué concesionarias de San Juan están adheridas a +Autos y con qué marcas?',
  ],
}

/**
 * LO QUE HAY QUE PREGUNTARLE AL DUEÑO ANTES QUE AL BANCO.
 *
 * El reclamo fue "siempre estuvo en consideración" y el OS no encontró rastro. La diferencia entre
 * "hay una oferta concreta que el sistema no tiene cargada" y "hay una intención sin gestión" cambia
 * todo el informe, y no se resuelve leyendo el sitio del BNA.
 */
export const PREGUNTAR_AL_DUEÑO = [
  '¿Hay una oferta, una cotización o una carpeta presentada en el BNA que el OS no tenga cargada? Si existe, ese papel manda sobre esta ficha entera.',
  '¿La consideración es sobre la línea PyME de vehículos comerciales (la de la empresa) o sobre el préstamo personal +Autos que salió en todos los diarios esta semana? Son productos distintos, con distinto titular.',
  '¿Echegaray Construcciones S.A. está calificada crediticiamente en el BNA hoy, o hay que iniciar la vinculación? De eso depende que exista siquiera una tasa que consultar.',
  '¿Se acreditan haberes en el BNA? — no cambia la línea PyME, pero define cuál de las dos tasas de +Autos aplicaría si se evaluara.',
]

/** Las condiciones de este módulo, en el orden en que conviene mirarlas. */
export const CONDICIONES_BNA = [CONDICION_BNA_VEHICULOS_COMERCIALES, CONDICION_BNA_MAS_AUTOS]

/** Las columnas que NO existen en la tabla: se sacan antes de escribir. */
export const NO_SON_COLUMNAS = ['clave', 'desconocido', 'preguntar']

/**
 * La fila lista para `registrarCondicion`, sin los campos que no son columnas.
 *
 * `desconocido` y `preguntar` NO se borran: se pliegan dentro de `observaciones`, porque si mueren acá
 * no llegan ni a Postgres ni a la Web, y en esta línea los huecos SON el contenido — el que mire la
 * fila tiene que ver que no hay tasa antes de usarla para decidir. Mismo criterio que linea-fondefin.
 */
export function filaParaLaTabla(cond = CONDICION_BNA_VEHICULOS_COMERCIALES) {
  const fila = { ...cond }
  const bloques = [fila.observaciones]
  if (cond.desconocido?.length) {
    bloques.push(`LO QUE EL BNA NO PUBLICA (${cond.desconocido.length}) — no se estima, se pregunta: ${cond.desconocido.join(' · ')}`)
  }
  if (cond.preguntar?.length) {
    bloques.push(`PREGUNTAS AL BANCO (${cond.preguntar.length}), en el orden en que conviene hacerlas — cada una cambia una decisión: ${cond.preguntar.join(' · ')}`)
  }
  fila.observaciones = bloques.filter(Boolean).join(' ── ')
  for (const k of NO_SON_COLUMNAS) delete fila[k]
  return fila
}

/** Las dos filas listas para la tabla. */
export const filasParaLaTabla = () => CONDICIONES_BNA.map((c) => filaParaLaTabla(c))
