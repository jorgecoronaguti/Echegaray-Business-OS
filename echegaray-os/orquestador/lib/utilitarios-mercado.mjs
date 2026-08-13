// EL MERCADO DE UTILITARIOS DE CARGA 0KM — EL CATÁLOGO QUE FALTABA PARA QUE HAYA UNA COMPARACIÓN.
//
// QUÉ ES ESTE ARCHIVO (13/08/2026). El dueño mandó varios modelos y el informe de compra de rodados
// salió con UNO SOLO cotizado (el DFSK C32). Su reclamo textual: "hay un solo modelo en consideracion
// cuando yo envie varios mas y dije q si no estaba el precio q se busque". Esto es esa búsqueda,
// guardada como dato: un modelo por entrada, cada precio con su URL y su fecha de lectura.
//
// QUÉ NO ES. No calcula cuotas ni compara financiamiento — eso vive en `rodados-financiacion.mjs` y
// `rodados-plan.mjs`. Acá sólo está el INSUMO: qué unidades existen, qué cuestan, qué cargan y con
// qué línea se pueden pagar.
//
// ═══ POR QUÉ LA CARROCERÍA ES LA PRIMERA COLUMNA Y NO EL PRECIO ═══
//
// FONDEFIN (Fiduciaria San Juan, ROP 05-2026) financia pick-up ÚNICAMENTE CABINA SIMPLE 0km, además
// de furgones y camiones de pequeño porte. Una doble cabina NO califica — está en la letra del ROP,
// transcripta en `linea-fondefin.mjs`. Y FONDEFIN es la única línea con tasa real negativa: elegir
// una doble cabina obliga a Santander UVA o al prendario de mercado. O sea que la VERSIÓN del
// vehículo cambia con qué plata se compra, y esa diferencia puede pesar más que el precio de lista.
// Por eso `ordenadosParaDecidir()` ordena primero por elegibilidad y recién después por precio.
//
// ═══ POR QUÉ LOS MODELOS QUE YA TENÍAN DATO NO SE VUELVEN A TIPEAR ═══
//
// El C32 y el Zanella ya están transcriptos en `rodados-datos.mjs` desde los adjuntos del dueño, y el
// C31 en `rodados-plan-datos.mjs`. Acá se IMPORTAN y se proyectan al shape del catálogo. Retipearlos
// habría creado una segunda verdad del mismo presupuesto: la primera vez que alguien corrigiera un
// precio, el informe y el plan de caja dirían números distintos sin que nada gritara.
//
// CONVENCIONES:
// · `precio: null` NO es "gratis" ni "por confirmar": es que NO HAY PRECIO PUBLICADO. Cuando pasa,
//   `precioNoPublicado` dice dónde se buscó, uno por uno. Un precio inventado en un informe de compra
//   es lo único que no puede pasar.
// · Todo precio lleva `url` y `leidoEl`. Un precio sin fuente no entra: lo bloquea un test.
// · `pesosKg` guarda los TRES números (tara, carga legal, PBT) porque la cuenta que importa es
//   tara + carga ≤ PBT. Un utilitario que no puede cargar lo que dice el folleto no sirve para obra,
//   y ese defecto sólo se ve haciendo la suma — la hace `pesosCierran()`, no un humano.
// · `equipamiento` usa el mismo vocabulario que `rodados-datos.mjs`: 'serie' · 'opcional' · null
//   (la fuente no lo dice). Nunca se completa un null mirando otra camioneta parecida.
// · Los importes son PESOS ARGENTINOS. Cuando la fuente publica en dólares, se guarda el USD ORIGINAL
//   más el tipo de cambio usado y su fecha: convertir y tirar el original hace que el número envejezca
//   sin avisar.

import { PRESUPUESTOS_RODADOS } from './rodados-datos.mjs'
import { C31 as C31_PLAN } from './rodados-plan-datos.mjs'

/** Fecha en que se relevó el mercado. Todo precio de este archivo es de ese día o anterior. */
export const FECHA_RELEVAMIENTO = '2026-08-13'

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ELEGIBILIDAD FONDEFIN — la regla que ordena la tabla
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Las carrocerías que el ROP 05-2026 admite. La lista NO se amplía por analogía: si mañana aparece
 * un formato nuevo, se pregunta a Fiduciaria antes de agregarlo (está en las preguntas abiertas de
 * `linea-fondefin.mjs`).
 */
export const CARROCERIAS_ELEGIBLES_FONDEFIN = Object.freeze([
  'cabina-simple',
  'furgon',
  'camion-pequeno-porte',
])

/** Las carrocerías que quedan afuera, con el motivo escrito. Sirve para explicar el "no". */
export const CARROCERIAS_NO_ELEGIBLES_FONDEFIN = Object.freeze({
  'doble-cabina': 'el ROP 05-2026 financia pick-up ÚNICAMENTE cabina simple 0km',
})

export const FUENTE_ELEGIBILIDAD =
  'ROP 05-2026 Fiduciaria San Juan, transcripto en linea-fondefin.mjs (CONDICION_FONDEFIN.observaciones)'

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// EL CATÁLOGO
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * EL TIPO DE CAMBIO CON EL QUE SE PESIFICA. Casi todo el segmento publica en dólares, así que la
 * comparación en pesos depende de este número: al oficial un USD 18.500 son $28,0M y al blue $33,3M.
 * Va con nombre, fecha y fuente — nunca "el dólar de hoy" a secas.
 */
export const TIPO_CAMBIO_OFICIAL = {
  tipo: 'oficial-bna-venta',
  valor: 1515,
  fecha: '2026-08-13',
  fuente: 'Banco de la Nación Argentina, pizarra del 13/08/2026 (compra 1.465 / venta 1.515)',
  url: 'https://www.mejorinformado.com/nacionales/2026-8-13-10-1-44-dolar-oficial-cotiza-a-1515-en-bancos-de-la-city-este-jueves-13-de-agosto',
  advertencia:
    'Los importadores facturan en dólares al TC del día ANTERIOR al pago (así lo dice la lista de Magma/Dongfeng). El precio en pesos de todo lo importado se mueve entre la seña y la entrega: no es un precio cerrado.',
}

/** Pesifica un precio en dólares al oficial declarado. Nunca se guarda el peso sin el dólar de origen. */
const enPesos = (usd) => Math.round(usd * TIPO_CAMBIO_OFICIAL.valor)

/** Proyecta al shape del catálogo un presupuesto ya transcripto, sin retipear un solo número. */
const desdePresupuesto = (clave) => PRESUPUESTOS_RODADOS.find((p) => p.clave === clave)
const C32_PRESUPUESTO = desdePresupuesto('dfsk-c32-doble-cabina-lepont')
const ZANELLA_PRESUPUESTO = desdePresupuesto('zanella-z-truck')
const zanellaVersion = (codigo) => ZANELLA_PRESUPUESTO.fichaTecnica.versiones.find((v) => v.codigo === codigo)

/**
 * DÓNDE SE BUSCÓ EL PRECIO DEL ZANELLA. Va como constante y no en prosa porque es la RESPUESTA a la
 * pregunta del dueño: "si no está el precio, que se busque". Se buscó. No hay.
 */
const BUSQUEDA_ZANELLA = Object.freeze([
  'preciosdeautos.com.ar — tiene el modelo, pero su último precio 0km es del 17/05/2024 ($16.430.000): tiene más de dos años',
  'deruedas.com.ar (catálogo Zanella Z-Truck nuevos) — HTTP 403, no consultable',
  'MercadoLibre / tienda oficial CVN Motors — HTTP 403 en la publicación de cabina simple',
  'camionesybuses.com.ar — sólo el precio de LANZAMIENTO de 2021 (u$s 19.595)',
  'parabrisas.perfil.com — sólo el precio de lanzamiento de julio 2021 (u$s 19.600)',
  'búsqueda web de lista de precios Zanella 2026 — sin ninguna lista publicada',
])

export const MODELOS_MERCADO = [
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // CABINA SIMPLE — LAS QUE FONDEFIN SÍ FINANCIA
  // ═══════════════════════════════════════════════════════════════════════════════════════════════

  {
    clave: 'dfsk-c31-cabina-simple',
    marca: 'DFSK',
    modelo: 'C31 Truck 1.5L',
    version: 'Cabina Simple Plus',
    carroceria: 'cabina-simple',
    origenFabricacion: 'importado',
    // LA UNIDAD QUE FONDEFIN SÍ FINANCIA, Y DEL MISMO IMPORTADOR QUE COTIZÓ EL C32. Manda el precio
    // publicado por LE PONT —el importador oficial y el vendedor real en San Juan— porque es contra
    // ése que se puede negociar. Coincide exacto con el que ya usa `rodados-plan-datos.mjs`.
    precio: {
      ars: C31_PLAN.precioLista,
      usd: null,
      tipoCambio: null,
      origen: 'lista-oficial',
      fuenteTexto: 'Le Pont S.A., importador oficial DFSK — precio publicado del C31 en su propio sitio',
      url: 'https://www.lepontsa.com.ar/productos/dfsk-c31-_1108',
      leidoEl: '2026-08-13',
      vigente: true,
      advertencia: 'es precio de LISTA, no presupuesto: no incluye gastos de retiro, patentamiento ni prenda (en el C32 ésos fueron $3.600.000 aparte).',
    },
    preciosEnConflicto: [
      {
        valor: 28_000_000,
        moneda: 'ARS',
        fuente: 'elcerokm, "C31 1.5 Truck C/S ESP", lista al 13/08/2026 13:01',
        url: 'https://elcerokm.com/dfsk/serie-c',
        nota: '$1,4M por debajo del importador, el mismo día',
      },
      {
        valor: enPesos(18_500),
        moneda: 'ARS',
        usd: 18_500,
        fuente: 'autocosmos, catálogo vigente C31 Truck 1.5L Cabina Simple Plus',
        url: 'https://www.autocosmos.com.ar/catalogo/vigente/dfsk/c31',
        nota: 'a TC oficial da $28,0M — coincide con elcerokm y refuerza que el precio de Le Pont está en el techo del rango',
      },
      {
        valor: 21_900_000,
        moneda: 'ARS',
        fuente: 'publicación MercadoLibre de un C31 1.5 Cabina Simple 0km 2026',
        url: 'https://auto.mercadolibre.com.ar/MLA-1697705587-dfsk-c31-15-cabina-simple-0km-2026-_JM',
        nota: 'MUY por debajo de todas las listas: es una publicación suelta de un vendedor, no una lista. No se usa para decidir; se deja anotada porque si se confirma cambia la comparación entera',
      },
    ],
    // PBT DE LA FICHA OFICIAL DE FEBRERO 2026. La tara no se declara: 2.295 − 1.000 = 1.295 kg es un
    // CÁLCULO, y por eso va en `desconocido` y no en `ordenDeMarcha`.
    pesosKg: { ordenDeMarcha: null, cargaLegalDeclarada: 1000, pesoBrutoTotal: 2295 },
    motor: { cilindradaCc: 1500, cilindradaLitros: 1.5, potenciaCv: 101, potenciaKw: null },
    equipamiento: { airbag: 'serie', abs: 'serie', ebd: 'serie', esp: 'serie' },
    equipamientoNota:
      'la ficha oficial de febrero 2026 lista ABS, EBD, doble airbag frontal y ESP como equipamiento, sin columna de opcionales: todo de serie. Es el único del segmento chino con ESP de fábrica.',
    fuentes: [
      { dato: 'precio de lista del importador', url: 'https://www.lepontsa.com.ar/productos/dfsk-c31-_1108', leidoEl: '2026-08-13' },
      { dato: 'carga 1.000 kg, PBT 2.295 kg, motor y seguridad', url: 'https://dfsk.ar/wp-content/uploads/2026/02/C31.pdf', leidoEl: '2026-08-13' },
      { dato: 'precio de contraste', url: 'https://elcerokm.com/dfsk/serie-c', leidoEl: '2026-08-13' },
    ],
    desconocido: [
      'peso en orden de marcha — la ficha oficial no lo declara. Por diferencia serían 1.295 kg (2.295 − 1.000), pero es un cálculo: la carga de 1.000 kg NO está verificada contra un peso real medido.',
      'CONTRADICCIÓN ENTRE FUENTES DE LA MISMA MARCA: Le Pont y varios concesionarios publican 114 HP y 1.250 kg de carga; la ficha oficial de febrero 2026 dice 101 CV y 1.000 kg. Manda la ficha 2026 — los concesionarios parecen estar publicando datos de la generación anterior. Se confirma al pedir el presupuesto.',
      'cuál precio sostiene Le Pont en una operación con prenda a favor de Fiduciaria San Juan: $29,4M de su propia lista o los $28,0M de los agregadores',
      'gastos de retiro, patentamiento y sellado — el ROP FONDEFIN los excluye del financiamiento: son aporte propio',
    ],
  },

  {
    clave: 'foton-aumark-tm1-cabina-simple',
    marca: 'FOTON',
    modelo: 'Aumark TM1 1.5L',
    version: 'Cabina Simple',
    carroceria: 'cabina-simple',
    origenFabricacion: 'importado',
    precio: {
      usd: 25_400,
      tipoCambio: TIPO_CAMBIO_OFICIAL.valor,
      ars: enPesos(25_400),
      origen: 'portal',
      fuenteTexto: 'autocosmos.com.ar, catálogo vigente Foton Aumark TM1 Cabina Simple 1.5L',
      url: 'https://www.autocosmos.com.ar/catalogo/vigente/foton/aumark-tm1-cabina-simple',
      leidoEl: '2026-08-13',
      vigente: true,
    },
    // LOS TRES PESOS DE LA FICHA DEL FABRICANTE, Y CIERRAN EXACTO: 1.220 + 1.630 = 2.850 = PBT.
    pesosKg: { ordenDeMarcha: 1220, cargaLegalDeclarada: 1630, pesoBrutoTotal: 2850 },
    motor: { cilindradaCc: 1498, cilindradaLitros: 1.5, potenciaCv: 110, potenciaKw: 82 },
    equipamiento: { airbag: 'opcional', abs: 'serie', ebd: 'serie', esp: null },
    equipamientoNota:
      'la ficha del fabricante marca "S" (serie) para ABS+EBD y "Opc" para Air Bag. ESP no figura en ninguna columna: no se ofrece.',
    fuentes: [
      { dato: 'precio de lista USD', url: 'https://www.autocosmos.com.ar/catalogo/vigente/foton/aumark-tm1-cabina-simple', leidoEl: '2026-08-13' },
      { dato: 'pesos, motor y seguridad serie/opcional', url: 'https://www.foton.com.ar/tm-2/', leidoEl: '2026-08-13' },
    ],
    desconocido: [
      'CUÁL MOTOR LLEVA LA UNIDAD QUE SE ENTREGA HOY: la ficha del fabricante y autocosmos dicen 1.5L / 110 CV / 142 Nm, pero el sitio oficial foton.com.ar declara hoy para la línea TM un DAM16KL de 1,6 L y 114 CV. Se confirma con el concesionario antes de cotizar.',
      'precio en pesos y lista oficial vigente — no hay lista oficial pública de Foton a agosto 2026',
    ],
  },

  {
    clave: 'dongfeng-captain-w412-cabina-simple',
    marca: 'Dongfeng (DFAC)',
    modelo: 'Captain W 412',
    version: 'Cabina Simple',
    carroceria: 'cabina-simple',
    origenFabricacion: 'importado',
    // ⚠ PRECIO DE UNA LISTA VENCIDA HACE MÁS DE UN AÑO. Se guarda porque es la ÚNICA lista oficial
    // del importador que existe, y porque explica de dónde salió el USD 24.190 que circulaba: es el
    // precio con IVA de la cabina DOBLE en esa misma lista. Pero no es un precio de agosto 2026.
    precio: {
      usd: 23_090,
      tipoCambio: TIPO_CAMBIO_OFICIAL.valor,
      ars: enPesos(23_090),
      origen: 'lista-oficial',
      fuenteTexto: 'lista de precios oficial del importador Magma Automotive S.A.S. — "LISTA DE PRECIOS 01/25", precio CON IVA, pago contado',
      url: 'https://dongfeng.ar/modelos/captain-w-412',
      leidoEl: '2026-08-13',
      vigente: false,
      vigenciaHasta: '2025-07-31',
      advertencia:
        'LISTA VENCIDA EL 31/07/2025 — más de un año. NO es un precio de agosto 2026: es el último precio oficial que existe. La guía CCA sigue replicándolo, que es por qué el USD 24.190 de la cabina doble parecía vigente.',
    },
    pesosKg: { ordenDeMarcha: 1445, cargaLegalDeclarada: 2045, pesoBrutoTotal: 3490 },
    motor: { cilindradaCc: 1600, cilindradaLitros: 1.6, potenciaCv: 122, potenciaKw: null },
    equipamiento: { airbag: null, abs: 'serie', esp: 'serie', ebd: null },
    equipamientoNota:
      'la ficha oficial dice "Seguridad activa: ABS + ESC". El airbag NO figura en una ficha que enumera el equipamiento interior de forma exhaustiva: la lectura es que no se ofrece, pero la ficha no lo dice con esas palabras, así que va null y no "no lo trae".',
    fuentes: [
      { dato: 'lista de precios del importador (vencida)', url: 'https://dongfeng.ar/modelos/captain-w-412', leidoEl: '2026-08-13' },
      { dato: 'PBT, tara y carga útil', url: 'https://www.planetacamion.com.ar/dongfeng-captain-w412-doble-cabina-doble-mision/', leidoEl: '2026-08-13' },
      { dato: 'motor, torque y carga por versión', url: 'https://supertruck.com.ar/utilitarios/dongfeng-captain-w-minitruck-que-carga-2-000-kg-y-vale-menos-que-una-renault-kangoo/', leidoEl: '2026-08-13' },
    ],
    desconocido: [
      'PRECIO VIGENTE A AGOSTO 2026 — la única lista oficial venció el 31/07/2025. Hubo un promocional de u$s 21.900 en septiembre 2025 y un aviso de concesionario de u$s 21.630 para una unidad 2026, ninguno verificable como lista.',
      'si ofrece airbag en algún nivel — la ficha oficial no lo menciona',
      'EBD y potencia en kW — la ficha declara ABS+ESC y 122 hp, sin los otros dos',
    ],
  },

  {
    clave: 'zanella-z-truck-cs',
    marca: 'Zanella Trucks',
    modelo: 'Z-Truck',
    version: 'Cabina Simple',
    carroceria: 'cabina-simple',
    origenFabricacion: 'nacional',
    origenNota: 'ensamblado en Argentina por Grupo Iraola / CVN Motors con partes de Foton Trucks',
    // ═══ NO TIENE PRECIO PUBLICADO DE 0KM AL 13/08/2026 ═══
    precio: { ars: null, usd: null },
    precioNoPublicado: {
      motivo:
        'ninguna fuente publica un precio 0km vigente. Lo último publicado es de 2021 (u$s 19.595 de lanzamiento) y de 2024 ($16.430.000 al 17/05/2024): los dos son fósiles, no precios. Los concesionarios ponen "consultar".',
      buscadoEn: [...BUSQUEDA_ZANELLA],
      ultimoPrecioConocido: { ars: 16_430_000, fecha: '2024-05-17', url: 'https://preciosdeautos.com.ar/autos/zanella/12-16v-mt-csimple-85cv/0km' },
    },
    // ═══ POR QUÉ LA CARGA ACÁ DICE 690 Y LA FICHA DEL DUEÑO DICE 1.010 ═══
    // La ficha oficial de CVN Motors declara 690 kg de carga legal, no 1.010. Con 690 la cuenta
    // cierra EXACTA (1.205 + 690 = 1.895 = PBT), y la prensa de lanzamiento publicó ese mismo
    // número. Los 1.010 kg de la ficha que llegó por el chat son el dato del DFSK, no del Zanella.
    // El valor del adjunto no se borra: queda en `datosEnConflicto` con las dos fuentes a la vista.
    pesosKg: {
      ordenDeMarcha: zanellaVersion('CS').pesoOrdenDeMarchaKg,
      cargaLegalDeclarada: 690,
      pesoBrutoTotal: zanellaVersion('CS').pesoBrutoTotalKg,
    },
    datosEnConflicto: [
      {
        dato: 'carga legal',
        valorUsado: 690,
        valorAlternativo: zanellaVersion('CS').cargaLegalKg,
        fuenteDelUsado: 'ficha técnica oficial CVN Motors del Z-Truck CS',
        fuenteDelAlternativo: 'ficha que mandó el dueño el 07/08 (adjunto aaee8a95_0807_1223_7.jpg), transcripta en rodados-datos.mjs',
        porQueSeEligio:
          'con 690 kg la aritmética de la ficha cierra exacta contra el PBT y coincide con lo que publicó la prensa de lanzamiento en dos medios independientes. Con 1.010 kg no cierra por 320 kg. Un número que cierra y está confirmado por tres fuentes gana sobre uno que no cierra y está en una sola.',
      },
    ],
    motor: {
      cilindradaCc: ZANELLA_PRESUPUESTO.fichaTecnica.motor.cilindradaCc,
      cilindradaLitros: ZANELLA_PRESUPUESTO.fichaTecnica.motor.cilindradaLitros,
      potenciaCv: ZANELLA_PRESUPUESTO.fichaTecnica.motor.potenciaCv,
      potenciaKw: ZANELLA_PRESUPUESTO.fichaTecnica.motor.potenciaKw,
    },
    equipamiento: { airbag: 'opcional', abs: 'serie', ebd: 'serie', esp: null },
    fuentes: [
      { dato: 'peso en orden de marcha, PBT, motor y equipamiento', adjunto: 'aaee8a95_0807_1223_7.jpg (ficha técnica que mandó el dueño)', leidoEl: '2026-08-07' },
      { dato: 'carga legal 690 kg — ficha técnica oficial CVN Motors', url: 'https://kilometros.com.ar/wp-content/uploads/2021/07/Ficha-Tecnica-Zanella-Z-Truck.pdf', leidoEl: '2026-08-13' },
      { dato: 'carga 690 kg y airbag opcional (prensa de lanzamiento)', url: 'https://parabrisas.perfil.com/noticias/novedades/cvn-motors-zanella-z-truck-precio-argentina-ficha-tecnica-utilitario.phtml', leidoEl: '2026-08-13' },
      { dato: 'carga 690 kg (segunda fuente independiente)', url: 'https://www.iprofesional.com/autos/343882-zanella-z-truck-un-nuevo-utilitario-que-puede-cargar-hasta-690-k', leidoEl: '2026-08-13' },
    ],
    desconocido: [
      'PRECIO — ver `precioNoPublicado`. Concesionarios como LOX Autos siguen ofreciendo CS y CD 0km con entrega inmediata, pero ninguno publica importe.',
      'la marca ya no lo lista: zanella.com.ar redirige a zanellaglobal.com, donde el Z-Truck no existe y el único utilitario es un motocarro ZMAX 200. Las fichas técnicas sólo sobreviven espejadas por concesionarios.',
      'potencia real: la ficha dice 63 kW / 85 HP y la prensa de lanzamiento publicó "1,2 Lt de 63cv" y "1.2 de 87 CV". Las tres no pueden ser. 63 kW = 85,6 CV, así que la prensa que dice 63 CV probablemente confundió kW con CV.',
    ],
  },

  {
    clave: 'toyota-hilux-cs-dx-4x2',
    marca: 'Toyota',
    modelo: 'Hilux',
    version: 'Cabina Simple DX 4x2 MT',
    carroceria: 'cabina-simple',
    origenFabricacion: 'nacional',
    origenNota: 'fabricada en Zárate — la única nacional con caja abierta del relevamiento',
    precio: {
      ars: 43_771_000,
      usd: null,
      tipoCambio: null,
      origen: 'lista-oficial',
      fuenteTexto: 'lista oficial Toyota Argentina vigente 01–31/08/2026 (Toyota no aumentó en agosto)',
      url: 'https://autotest.com.ar/noticias/toyota-hilux-no-aumenta-en-agosto-precios-y-versiones-de-la-pick-up-lider/',
      leidoEl: '2026-08-13',
      vigente: true,
    },
    pesosKg: { ordenDeMarcha: 1765, cargaLegalDeclarada: 995, pesoBrutoTotal: null },
    motor: { cilindradaCc: 2393, cilindradaLitros: 2.393, potenciaCv: 150, potenciaKw: null },
    equipamiento: { airbag: 'serie', abs: 'serie', ebd: 'serie', esp: 'serie' },
    equipamientoNota: '7 airbags, ABS/EBD/BA, VSC (control de estabilidad) y TRC, todo de serie — el mejor equipamiento de seguridad del relevamiento',
    fuentes: [
      { dato: 'precio de lista agosto 2026', url: 'https://autotest.com.ar/noticias/toyota-hilux-no-aumenta-en-agosto-precios-y-versiones-de-la-pick-up-lider/', leidoEl: '2026-08-13' },
      { dato: 'carga útil, tara, motor y seguridad', url: 'https://autofichas.com.ar/toyota/hilux/', leidoEl: '2026-08-13' },
      { dato: 'rango de precios de cabina simple en agosto 2026', url: 'https://www.infobae.com/economia/2026/08/11/cuales-son-y-cuanto-cuestan-las-pick-ups-compactas-y-medianas-en-agosto/', leidoEl: '2026-08-13' },
    ],
    desconocido: [
      'PBT publicado de la cabina simple — Toyota no lo publica y toyota.com.ar devuelve HTTP 403. La cabina CHASIS DX 4x2 sí cierra exacto (1.655 + 1.095 = 2.750 = PBT), lo que da coherencia a la fuente pero no prueba el PBT de esta versión.',
      'la variante Cabina Chasis DX 4x2 —1.095 kg de carga y $39.166.000 en diciembre 2025— FUE ELIMINADA del catálogo en enero de 2026: era la mejor relación carga/precio del mercado y ya no se consigue',
    ],
  },

  {
    clave: 'vw-saveiro-cs-trendline',
    marca: 'Volkswagen',
    modelo: 'Saveiro',
    version: 'Cabina Simple Trendline',
    carroceria: 'cabina-simple',
    origenFabricacion: 'importado',
    origenNota: 'importada de Brasil',
    // ⚠ EL PRECIO ESTÁ EN DISPUTA POR $10,6 MILLONES. Se carga el MENOR de las dos fuentes del mismo
    // día y se declara el conflicto: cargar el mayor haría parecer peor una unidad que puede ser la
    // más barata del segmento. Ninguno de los dos es lista oficial verificada.
    precio: {
      ars: 32_478_450,
      usd: null,
      tipoCambio: null,
      origen: 'portal',
      fuenteTexto: 'Infobae, relevamiento de pick-ups compactas de agosto 2026 (rango $32.478.450–$39.693.700)',
      url: 'https://www.infobae.com/economia/2026/08/11/cuales-son-y-cuanto-cuestan-las-pick-ups-compactas-y-medianas-en-agosto/',
      leidoEl: '2026-08-13',
      vigente: true,
      advertencia: 'EN DISPUTA: LA NACION publica $43.098.250 de base para la misma versión y el mismo mes. La diferencia es de $10,6M (25%).',
    },
    preciosEnConflicto: [
      {
        valor: 43_098_250,
        moneda: 'ARS',
        fuente: 'LA NACION, precios de agosto 2026',
        url: 'https://www.lanacion.com.ar/autos/cual-es-el-precio-de-la-volkswagen-amarok-en-agosto-2026-nid06082026/',
        nota: 'mismo mes, misma versión, 25% más caro. Hasta que no se pida la lista al concesionario, el precio de la Saveiro es un RANGO, no un número.',
      },
    ],
    pesosKg: { ordenDeMarcha: 1025, cargaLegalDeclarada: 715, pesoBrutoTotal: null },
    motor: { cilindradaCc: 1598, cilindradaLitros: 1.6, potenciaCv: 110, potenciaKw: null },
    equipamiento: { airbag: 'serie', abs: 'serie', ebd: null, esp: 'serie' },
    equipamientoNota: '2 airbags, ABS con 4 discos, ESP, HHC y EDL de serie',
    fuentes: [
      { dato: 'precio agosto 2026 (piso del rango)', url: 'https://www.infobae.com/economia/2026/08/11/cuales-son-y-cuanto-cuestan-las-pick-ups-compactas-y-medianas-en-agosto/', leidoEl: '2026-08-13' },
      { dato: 'carga útil, tara, motor y seguridad', url: 'https://autofichas.com.ar/volkswagen/saveiro/', leidoEl: '2026-08-13' },
    ],
    desconocido: [
      'CUÁL DE LOS DOS PRECIOS ES EL BUENO — $32,5M (Infobae) o $43,1M (LA NACION), mismo mes y misma versión. Son $10,6M: es la diferencia entre la pick-up más barata del segmento y una de las más caras.',
      'PBT publicado — ninguna fuente lo declara, así que los 715 kg de carga no se pueden verificar',
    ],
  },

  {
    clave: 'fiat-strada-freedom-cs',
    marca: 'Fiat',
    modelo: 'Strada',
    version: 'Freedom Cabina Simple MT',
    carroceria: 'cabina-simple',
    origenFabricacion: 'importado',
    origenNota: 'importada de Brasil',
    precio: {
      ars: 33_050_000,
      usd: null,
      tipoCambio: null,
      origen: 'lista-oficial',
      fuenteTexto: 'lista de precios oficial Fiat (PDF) — la única de origen oficial verificable, pero de FEBRERO 2026',
      url: 'https://autoblog.com.ar/wp-content/uploads/2026/02/02.-FEBRERO-2026-Fiat-Lista-de-Precios-Externa.pdf',
      leidoEl: '2026-08-13',
      vigente: false,
      vigenciaHasta: '2026-02-28',
      advertencia:
        'lista de FEBRERO 2026, no de agosto. Se usa igual porque es la única oficial: los cuatro precios de portales para agosto van de $30,8M a $35,57M y ninguno es lista. fiat.com.ar devuelve HTTP 403.',
    },
    preciosEnConflicto: [
      { valor: 30_800_000, moneda: 'ARS', fuente: 'elcerokm, lista al 03/08/2026', url: 'https://elcerokm.com/fiat/strada' },
      { valor: 32_880_000, moneda: 'ARS', fuente: 'autofichas / autocosmos', url: 'https://autofichas.com.ar/fiat/strada/' },
      { valor: 35_570_000, moneda: 'ARS', fuente: 'Infobae, piso del rango de agosto 2026', url: 'https://www.infobae.com/economia/2026/08/11/cuales-son-y-cuanto-cuestan-las-pick-ups-compactas-y-medianas-en-agosto/' },
    ],
    pesosKg: { ordenDeMarcha: 1161, cargaLegalDeclarada: 650, pesoBrutoTotal: null },
    motor: { cilindradaCc: 1332, cilindradaLitros: 1.332, potenciaCv: 99, potenciaKw: null },
    equipamiento: { airbag: 'serie', abs: 'serie', ebd: null, esp: 'serie' },
    equipamientoNota: '4 airbags, ABS, ESP y control de tracción de serie',
    fuentes: [
      { dato: 'precio de lista oficial (febrero 2026)', url: 'https://autoblog.com.ar/wp-content/uploads/2026/02/02.-FEBRERO-2026-Fiat-Lista-de-Precios-Externa.pdf', leidoEl: '2026-08-13' },
      { dato: 'carga útil, tara, motor y seguridad', url: 'https://autofichas.com.ar/fiat/strada/', leidoEl: '2026-08-13' },
    ],
    desconocido: [
      'lista oficial Fiat de AGOSTO 2026 — fiat.com.ar devuelve HTTP 403. El precio de la Strada es un rango de $30,8M a $35,6M, no un número.',
      'PBT publicado, y si la carga útil son 650 kg o 720 kg (las fuentes se contradicen)',
    ],
  },

  {
    clave: 'kia-k2500-pick-up-cs',
    marca: 'Kia',
    modelo: 'K2500',
    version: 'Pick-up Cabina Simple',
    carroceria: 'cabina-simple',
    origenFabricacion: 'importado',
    // EL "KIA FRONTIER" DEL PEDIDO ES ÉSTE. Kia no vende una "Frontier" en Argentina: Frontier es el
    // nombre que le pone al K2500 en Chile y Perú. Acá se llama K2500 y sí se consigue.
    aliasDelPedido: 'Kia Frontier',
    precio: {
      usd: 29_900,
      tipoCambio: TIPO_CAMBIO_OFICIAL.valor,
      ars: enPesos(29_900),
      origen: 'portal',
      fuenteTexto: 'autofichas / El Cronista — Kia Argentina publica el K2500 en dólares, no en pesos',
      url: 'https://autofichas.com.ar/kia/k2500/',
      leidoEl: '2026-08-13',
      vigente: true,
      advertencia: 'Kia factura en dólares: el precio en pesos se mueve entre la seña y la entrega.',
    },
    pesosKg: { ordenDeMarcha: null, cargaLegalDeclarada: 1500, pesoBrutoTotal: null },
    motor: { cilindradaCc: 2497, cilindradaLitros: 2.5, potenciaCv: 130, potenciaKw: null },
    equipamiento: { airbag: 'serie', abs: 'serie', ebd: null, esp: 'serie' },
    equipamientoNota:
      'UN SOLO AIRBAG (conductor). ABS y control de estabilidad de serie. Un airbag en 2026 es un retroceso frente a los 7 de la Hilux y los 4 de la Strada.',
    fuentes: [
      { dato: 'precio USD por versión', url: 'https://autofichas.com.ar/kia/k2500/', leidoEl: '2026-08-13' },
      { dato: 'motor, carga y equipamiento', url: 'https://www.kia.com.ar/k2500', leidoEl: '2026-08-13' },
    ],
    desconocido: [
      'PBT y tara — Kia no los publica: los 1.500 kg de carga no se pueden verificar, y es la carga más alta de todas las cabinas simples del relevamiento',
      'precio en pesos y si hay lista en pesos de un concesionario argentino',
    ],
  },

  {
    clave: 'peugeot-partner-van',
    marca: 'Peugeot',
    modelo: 'Partner',
    version: 'Van (furgón)',
    carroceria: 'furgon',
    origenFabricacion: 'importado',
    origenNota: 'importado de España — dejó de fabricarse en El Palomar',
    precio: {
      ars: 38_860_000,
      usd: null,
      tipoCambio: null,
      origen: 'portal',
      fuenteTexto: 'supertruck, sobre el comunicado de lanzamiento del 05/06/2026 (IVA incluido)',
      url: 'https://supertruck.com.ar/utilitarios/peugeot-partner-2026-precio-motor-equipamiento-capacidades/',
      leidoEl: '2026-08-13',
      vigente: true,
    },
    pesosKg: { ordenDeMarcha: null, cargaLegalDeclarada: 865, pesoBrutoTotal: 2340 },
    motor: { cilindradaCc: 1560, cilindradaLitros: 1.6, potenciaCv: 92, potenciaKw: null },
    equipamiento: { airbag: 'serie', abs: 'serie', ebd: null, esp: 'serie' },
    // SE INCLUYE PERO SE DESCARTA, Y EL MOTIVO QUEDA POR ESCRITO. Califica para FONDEFIN (es furgón)
    // y supera los 600 kg, así que sacarlo en silencio sería esconder una opción; pero es un furgón
    // CERRADO y eso lo saca de la carga de obra.
    descartado: {
      motivo:
        'furgón cerrado: no entra hierro de 6 o 12 m, no se carga ni descarga arena o escombro con pala, no se lava con manguera por dentro. Sirve para herramienta, herrajes, EPP y personal — no para carga sucia de obra.',
      sirveSi: 'el uso real fuera llevar herramienta y materiales limpios al frente, no material a granel',
    },
    fuentes: [
      { dato: 'precio de lanzamiento', url: 'https://supertruck.com.ar/utilitarios/peugeot-partner-2026-precio-motor-equipamiento-capacidades/', leidoEl: '2026-08-13' },
      { dato: 'carga útil, PBT y volumen', url: 'https://transportemundial.com.ar/utilitarios/cual-es-la-capacidad-de-carga-de-peugeot-partner-renault-kangoo-y-fiat-fiorino/', leidoEl: '2026-08-13' },
    ],
    desconocido: ['peso en orden de marcha — se puede derivar (2.340 − 865 = 1.475 kg) pero no está publicado, así que no se carga como dato'],
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // DOBLE CABINA — NO CALIFICAN PARA FONDEFIN
  // ═══════════════════════════════════════════════════════════════════════════════════════════════

  {
    clave: 'dfsk-c32-doble-cabina',
    marca: 'DFSK',
    modelo: 'C32',
    version: 'Doble Cabina',
    carroceria: 'doble-cabina',
    origenFabricacion: 'importado',
    // EL ANCLA. Es el único con PRESUPUESTO cerrado de una concesionaria de San Juan, no precio de
    // lista. Se toma del objeto de `rodados-datos.mjs`: no se retipea ni un número.
    presupuestoOrigen: C32_PRESUPUESTO,
    precio: {
      ars: C32_PRESUPUESTO.total,
      usd: null,
      tipoCambio: null,
      origen: 'presupuesto',
      fuenteTexto: 'presupuesto Le Pont S.A. (San Juan) del 06/08/2026 — $33.400.000 la unidad + $3.600.000 de gastos de retiro con prenda, IVA incluido, puesto en calle',
      url: 'https://www.autocosmos.com.ar/catalogo/vigente/dfsk/c32',
      leidoEl: '2026-08-07',
      vigente: false,
      vigenciaHasta: C32_PRESUPUESTO.vigenciaHasta,
      advertencia: 'el presupuesto VENCIÓ el 10/08/2026. Y es el ÚNICO precio de la tabla que incluye gastos de retiro: los demás son precio de unidad pelado.',
    },
    // ═══ EL HALLAZGO QUE MÁS PLATA MUEVE DE TODA LA TABLA ═══
    // LE PONT PUBLICA EL C32 A $31.200.000 EN SU PROPIO SITIO Y LO COTIZÓ A $33.400.000. Son
    // $2.200.000 (7,05%) por encima de su propia lista, sobre la misma unidad y la misma semana. No
    // es una inferencia sobre una lista ajena: es la lista del vendedor contra el papel del vendedor.
    preciosEnConflicto: [
      {
        valor: 31_200_000,
        moneda: 'ARS',
        fuente: 'Le Pont S.A. — precio del C32 publicado por el propio importador que emitió el presupuesto',
        url: 'https://www.lepontsa.com.ar/productos/dfsk-c32-_1109',
        nota:
          'MISMO VENDEDOR, $2.200.000 MENOS. El presupuesto cotiza la unidad a $33.400.000 y su sitio la publica a $31.200.000: 7,05% de diferencia. Es la primera pregunta del próximo llamado, y es plata que no requiere cambiar de modelo ni de banco.',
      },
      {
        valor: 31_400_000,
        moneda: 'ARS',
        fuente: 'elcerokm, "C32 1.5 Truck D/C ESP", lista al 13/08/2026 13:01',
        url: 'https://elcerokm.com/dfsk/serie-c',
        nota: 'un tercero independiente confirma el orden de magnitud de la lista de Le Pont ($31,2M–$31,4M), no el del presupuesto',
      },
      {
        valor: enPesos(19_500),
        moneda: 'ARS',
        usd: 19_500,
        fuente: 'autocosmos, catálogo vigente DFSK C32 1.5L Cabina Doble',
        url: 'https://www.autocosmos.com.ar/catalogo/vigente/dfsk/c32',
        nota: 'a TC oficial da $29,5M: la tercera fuente que queda por debajo del precio cotizado',
      },
    ],
    pesosKg: {
      ordenDeMarcha: C32_PRESUPUESTO.fichaTecnica.versiones[0].pesoOrdenDeMarchaKg,
      cargaLegalDeclarada: C32_PRESUPUESTO.fichaTecnica.versiones[0].cargaLegalKg,
      pesoBrutoTotal: C32_PRESUPUESTO.fichaTecnica.versiones[0].pesoBrutoTotalKg,
    },
    motor: {
      cilindradaCc: 1500,
      cilindradaLitros: C32_PRESUPUESTO.fichaTecnica.motor.cilindradaLitros,
      potenciaCv: C32_PRESUPUESTO.fichaTecnica.motor.potenciaCv,
      potenciaKw: null,
    },
    equipamiento: {
      airbag: C32_PRESUPUESTO.fichaTecnica.equipamiento.airbag,
      abs: C32_PRESUPUESTO.fichaTecnica.equipamiento.abs,
      ebd: C32_PRESUPUESTO.fichaTecnica.equipamiento.ebd,
      esp: C32_PRESUPUESTO.fichaTecnica.equipamiento.esp,
    },
    fuentes: [
      { dato: 'precio, forma de pago y condiciones', adjunto: 'aaee8a95_0807_1223_5.pdf (presupuesto Le Pont firmado)', leidoEl: '2026-08-07' },
      { dato: 'pesos, motor y equipamiento', adjunto: 'aaee8a95_0807_1223_6.pdf (ficha técnica DFSK C32)', leidoEl: '2026-08-07' },
      { dato: 'precio de lista del importador para contrastar', url: 'https://www.autocosmos.com.ar/catalogo/vigente/dfsk/c32', leidoEl: '2026-08-13' },
    ],
    desconocido: [
      'peso en orden de marcha — la ficha no lo declara, así que los 1.000 kg de carga no se pueden verificar contra el PBT de 2.315 kg. Por diferencia serían 1.315 kg, pero es un cálculo.',
      'POR QUÉ LE PONT COTIZÓ $33.400.000 SI SU PROPIO SITIO PUBLICA $31.200.000 — $2,2M sobre la misma unidad. Puede ser equipamiento extra, puede ser un aumento posterior a la publicación, puede ser margen. Es lo primero que hay que preguntar.',
      ...C32_PRESUPUESTO.noLeido.map((n) => n.dato),
    ],
  },

  {
    clave: 'dongfeng-captain-w412-doble-cabina',
    marca: 'Dongfeng (DFAC)',
    modelo: 'Captain W 412',
    version: 'Cabina Doble',
    carroceria: 'doble-cabina',
    origenFabricacion: 'importado',
    precio: {
      usd: 24_190,
      tipoCambio: TIPO_CAMBIO_OFICIAL.valor,
      ars: enPesos(24_190),
      origen: 'lista-oficial',
      fuenteTexto: 'lista de precios oficial del importador Magma Automotive S.A.S. — "LISTA DE PRECIOS 01/25", precio CON IVA (u$s 21.891 sin IVA)',
      url: 'https://dongfeng.ar/modelos/captain-w-412',
      leidoEl: '2026-08-13',
      vigente: false,
      vigenciaHasta: '2025-07-31',
      advertencia:
        'ACÁ ESTÁ EL ORIGEN DEL "u$s 24.190" QUE CIRCULABA: es el precio con IVA de esta lista, VENCIDA EL 31/07/2025. La guía CCA lo sigue replicando, que es por qué parecía vigente. NO es un precio de agosto 2026.',
    },
    pesosKg: { ordenDeMarcha: 1550, cargaLegalDeclarada: 1940, pesoBrutoTotal: 3490 },
    motor: { cilindradaCc: 1600, cilindradaLitros: 1.6, potenciaCv: 122, potenciaKw: null },
    equipamiento: { airbag: null, abs: 'serie', esp: 'serie', ebd: null },
    equipamientoNota: 'ficha oficial: "Seguridad activa: ABS + ESC". El airbag no figura en una ficha por lo demás exhaustiva.',
    fuentes: [
      { dato: 'lista de precios del importador (vencida)', url: 'https://dongfeng.ar/modelos/captain-w-412', leidoEl: '2026-08-13' },
      { dato: 'PBT 3.490, tara 1.550 y carga 1.940', url: 'https://www.planetacamion.com.ar/dongfeng-captain-w412-doble-cabina-doble-mision/', leidoEl: '2026-08-13' },
    ],
    desconocido: [
      'PRECIO VIGENTE A AGOSTO 2026 — la lista venció hace más de un año',
      'si ofrece airbag en algún nivel',
      'PBT 3.490 kg está apenas por debajo de los 3.500 kg: hay que confirmar que no cambie el requisito de licencia de conducir del chofer',
    ],
  },

  {
    clave: 'foton-aumark-tm1-doble-cabina',
    marca: 'FOTON',
    modelo: 'Aumark TM1 1.5L',
    version: 'Cabina Doble',
    carroceria: 'doble-cabina',
    origenFabricacion: 'importado',
    precio: {
      usd: 26_200,
      tipoCambio: TIPO_CAMBIO_OFICIAL.valor,
      ars: enPesos(26_200),
      origen: 'portal',
      fuenteTexto: 'autocosmos.com.ar, catálogo vigente Foton Aumark TM1 Cabina Doble 1.5L',
      url: 'https://www.autocosmos.com.ar/catalogo/vigente/foton/aumark-tm1-cabina-doble',
      leidoEl: '2026-08-13',
      vigente: true,
    },
    pesosKg: { ordenDeMarcha: 1270, cargaLegalDeclarada: 1580, pesoBrutoTotal: 2850 },
    motor: { cilindradaCc: 1498, cilindradaLitros: 1.5, potenciaCv: 110, potenciaKw: 82 },
    equipamiento: { airbag: 'opcional', abs: 'serie', ebd: 'serie', esp: null },
    equipamientoNota: 'ficha del fabricante: ABS+EBD "S" (serie), Air Bag "Opc" (opcional). ESP no se ofrece.',
    fuentes: [
      { dato: 'precio de lista USD', url: 'https://www.autocosmos.com.ar/catalogo/vigente/foton/aumark-tm1-cabina-doble', leidoEl: '2026-08-13' },
      { dato: 'pesos, motor y seguridad serie/opcional', url: 'https://www.foton.com.ar/tm-2/', leidoEl: '2026-08-13' },
      { dato: 'carga 1.580 kg y tara 1.270 kg (segunda fuente)', url: 'https://autofichas.com.ar/foton/aumark-tm1-cabina-doble/', leidoEl: '2026-08-13' },
    ],
    desconocido: [
      'cuál motor lleva la unidad de hoy: 1.5L/110 CV de la ficha vs 1.6L/114 CV del sitio oficial',
      'precio en pesos y lista oficial vigente a agosto 2026',
      'autofichas declara "Airbags: no tiene" mientras la ficha del fabricante lo da como opcional — en el mejor caso es un costo aparte, en el peor no existe',
    ],
  },

  {
    clave: 'zanella-z-truck-cd',
    marca: 'Zanella Trucks',
    modelo: 'Z-Truck',
    version: 'Cabina Doble',
    carroceria: 'doble-cabina',
    origenFabricacion: 'nacional',
    origenNota: 'ensamblado en Argentina por Grupo Iraola / CVN Motors',
    precio: { ars: null, usd: null },
    precioNoPublicado: {
      motivo:
        'ninguna fuente publica precio 0km vigente de la cabina doble. Lo único que aparece son avisos de concesionario sin importe ("consultar") y el precio de lanzamiento de 2021.',
      buscadoEn: [...BUSQUEDA_ZANELLA, 'concesionario-arrate.com.ar (aviso de Z-Truck doble cabina) — sin precio publicado'],
      ultimoPrecioConocido: null,
    },
    // MISMA CORRECCIÓN QUE EN LA CS: la ficha oficial declara 690 kg, no 1.000. Y acá NI SIQUIERA
    // ASÍ CIERRA — Zanella copió los 690 kg de la cabina simple sin descontar los 55 kg extra que
    // pesa la cabina doble. La carga real dentro del PBT son 635 kg.
    pesosKg: {
      ordenDeMarcha: zanellaVersion('CD').pesoOrdenDeMarchaKg,
      cargaLegalDeclarada: 690,
      pesoBrutoTotal: zanellaVersion('CD').pesoBrutoTotalKg,
    },
    datosEnConflicto: [
      {
        dato: 'carga legal',
        valorUsado: 690,
        valorAlternativo: zanellaVersion('CD').cargaLegalKg,
        fuenteDelUsado: 'ficha técnica oficial CVN Motors del Z-Truck CD',
        fuenteDelAlternativo: 'ficha que mandó el dueño el 07/08 (adjunto aaee8a95_0807_1223_7.jpg)',
        porQueSeEligio: 'la ficha oficial de la versión CD dice 690 kg; los 1.000 kg del adjunto son el dato del DFSK. Ninguno de los dos entra en el PBT.',
      },
    ],
    motor: {
      cilindradaCc: ZANELLA_PRESUPUESTO.fichaTecnica.motor.cilindradaCc,
      cilindradaLitros: ZANELLA_PRESUPUESTO.fichaTecnica.motor.cilindradaLitros,
      potenciaCv: ZANELLA_PRESUPUESTO.fichaTecnica.motor.potenciaCv,
      potenciaKw: ZANELLA_PRESUPUESTO.fichaTecnica.motor.potenciaKw,
    },
    equipamiento: { airbag: 'opcional', abs: 'serie', ebd: 'serie', esp: null },
    // ═══ NI CON EL DATO OFICIAL CIERRA ═══
    inconsistencias: [
      {
        dato: 'ni siquiera los 690 kg de la ficha oficial entran en el PBT: dentro del PBT la carga real son 635 kg',
        motivo:
          '1.260 kg de peso en orden de marcha + 690 kg de carga = 1.950 kg contra un PBT de 1.895: sobran 55 kg, que son exactamente lo que la cabina doble pesa de más que la simple (1.260 − 1.205). Zanella copió la carga de la CS sin descontar el peso de la segunda fila. Y con el número del adjunto del dueño (1.000 kg) el desvío es mucho peor: 2.260 contra 1.895. Cualquiera sea la fuente, esta unidad carga 635 kg.',
        confirmadoPor: 'https://almarcamiones.com/wp-content/uploads/FICHA-TECNICA-ZANELLA-Z-TRUCKS-CD-1.pdf',
      },
    ],
    fuentes: [
      { dato: 'peso en orden de marcha, PBT, motor y equipamiento', adjunto: 'aaee8a95_0807_1223_7.jpg (ficha técnica que mandó el dueño)', leidoEl: '2026-08-07' },
      { dato: 'carga legal 690 kg — ficha técnica oficial CVN Motors de la versión CD', url: 'https://almarcamiones.com/wp-content/uploads/FICHA-TECNICA-ZANELLA-Z-TRUCKS-CD-1.pdf', leidoEl: '2026-08-13' },
      { dato: 'airbag opcional', url: 'https://parabrisas.perfil.com/noticias/novedades/cvn-motors-zanella-z-truck-precio-argentina-ficha-tecnica-utilitario.phtml', leidoEl: '2026-08-13' },
    ],
    desconocido: [
      'PRECIO — ver `precioNoPublicado`',
      'la carga legal real homologada de la CD: la ficha oficial se contradice consigo misma y hay que pedírsela por escrito al concesionario antes de comprarla para llevar material',
    ],
  },
]

/**
 * LO QUE SE MIRÓ Y NO ENTRÓ, CON EL MOTIVO Y LA FUENTE.
 *
 * Está acá porque "no lo puse" y "no existe" son cosas distintas, y la diferencia es exactamente lo
 * que el dueño reclamó: un modelo que él mandó y no aparece en el informe parece olvidado. Estos
 * tienen nombre y motivo verificado.
 */
export const FUERA_DEL_SEGMENTO = [
  {
    modelo: 'Kia Frontier',
    motivo:
      'NO EXISTE con ese nombre en Argentina: "Frontier" es como Kia llama al K2500 en Chile y Perú. Acá se vende como K2500 y ESTÁ en la tabla.',
    url: 'https://elcerokm.com/kia',
    leidoEl: '2026-08-13',
  },
  {
    modelo: 'Changan Hunter',
    motivo:
      'Changan Argentina (Grupo Antelo) vende sólo dos modelos, los dos autos híbridos enchufables (CS55 Plus PHEV y Eado Plus PHEV). No comercializa ninguna pick-up ni utilitario de carga.',
    url: 'https://changan.com.ar/',
    leidoEl: '2026-08-13',
  },
  {
    modelo: 'JMC Carrying / Vigus / N601',
    motivo:
      'no se venden 0km en Argentina. El importador oficial (Ralitor S.A.) ofrece sólo N900 y Grand Avenue. El Vigus llegó a homologación sin definición de comercialización.',
    url: 'https://www.jmcargentina.com.ar/',
    leidoEl: '2026-08-13',
  },
  {
    modelo: 'JMC N900',
    motivo:
      'es un camión de 4,8 t de PBV a ~$61,5M: otra categoría y fuera del rango. Además sus números no cierran — con 4.800 kg de PBV y 4.000 kg de carga declarada la tara sería 800 kg, imposible para un camión con cabina abatible.',
    url: 'https://www.jmcargentina.com.ar/',
    leidoEl: '2026-08-13',
  },
  {
    modelo: 'Renault Oroch',
    motivo:
      'existe SÓLO en doble cabina (no califica para FONDEFIN), arranca en $43,3M–$45,8M, y ninguna fuente publica su carga útil. Al precio de una Hilux cabina simple da menos carga, menos torque y 2 airbags contra 7.',
    url: 'https://www.infobae.com/economia/2026/08/11/cuales-son-y-cuanto-cuestan-las-pick-ups-compactas-y-medianas-en-agosto/',
    leidoEl: '2026-08-13',
  },
  {
    modelo: 'Pick-ups medianas (Hilux DC, Ranger, S10, Frontier, Amarok, Titano, Alaskan)',
    motivo: 'arrancan en $44,4M de cabina doble y llegan a $93M. Fuera del rango y ninguna califica para FONDEFIN.',
    url: 'https://www.lanacion.com.ar/autos/estos-son-los-precios-de-todas-las-pickups-en-agosto-2026-nid11082026/',
    leidoEl: '2026-08-13',
  },
  {
    modelo: 'Renault Kangoo Express',
    motivo: 'es el único furgón NACIONAL y el más barato ($29,1M), pero está SIN STOCK en agosto 2026.',
    url: 'https://elcerokm.com/renault/kangoo-ii-express',
    leidoEl: '2026-08-13',
  },
  {
    modelo: 'Fiat Fiorino Furgón',
    motivo:
      'el más barato del relevamiento ($25,9M) y califica para FONDEFIN, pero es furgón cerrado con 650 kg: mismo límite funcional que el Partner y con menos carga. Si el uso fuera herramienta y no material a granel, entra en la comparación.',
    url: 'https://elcerokm.com/fiat/fiorino',
    leidoEl: '2026-08-13',
  },
]

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LECTURA
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ¿Esta unidad puede comprarse con FONDEFIN? `true` · `false` (y el motivo en `motivoNoFondefin`).
 * Nunca devuelve null: la carrocería siempre se conoce — es lo primero que dice cualquier ficha.
 */
export function calificaFondefin(m) {
  return CARROCERIAS_ELEGIBLES_FONDEFIN.includes(m?.carroceria)
}

/** El motivo por el que una unidad NO califica, en palabras del ROP. `null` si sí califica. */
export function motivoNoFondefin(m) {
  if (calificaFondefin(m)) return null
  return CARROCERIAS_NO_ELEGIBLES_FONDEFIN[m?.carroceria] ?? 'carrocería no contemplada por el ROP 05-2026'
}

/**
 * ¿LOS PESOS DEL FOLLETO CIERRAN? tara + carga legal tiene que caber en el PBT.
 *
 * Devuelve `null` cuando falta alguno de los tres (no se puede afirmar nada), y si no cierra devuelve
 * también la CARGA REAL dentro del PBT — que es el número que decide si la unidad sirve para obra.
 * El Zanella Z-Truck CD declara 1.260 kg de tara + 1.000 kg de carga sobre un PBT de 1.895: dentro
 * del PBT la carga real serían 635 kg, no 1.000. La mitad.
 */
export function pesosCierran(m) {
  const p = m?.pesosKg
  if (!p || p.ordenDeMarcha == null || p.cargaLegalDeclarada == null || p.pesoBrutoTotal == null) {
    return { cierran: null, motivo: 'la fuente no declara los tres pesos', cargaRealDentroDelPbt: null, excedenteKg: null }
  }
  const suma = p.ordenDeMarcha + p.cargaLegalDeclarada
  const cierran = suma <= p.pesoBrutoTotal
  return {
    cierran,
    motivo: cierran ? null : `${p.ordenDeMarcha} + ${p.cargaLegalDeclarada} = ${suma} kg sobre un PBT de ${p.pesoBrutoTotal} kg`,
    cargaRealDentroDelPbt: cierran ? p.cargaLegalDeclarada : p.pesoBrutoTotal - p.ordenDeMarcha,
    excedenteKg: cierran ? 0 : suma - p.pesoBrutoTotal,
  }
}

/** Los modelos que tienen precio con fuente. Son los únicos que se pueden comparar en plata. */
export const conPrecio = () => MODELOS_MERCADO.filter((m) => m.precio?.ars != null)

/** Los modelos SIN precio publicado. No se descartan: se declaran, con dónde se buscó. */
export const sinPrecio = () => MODELOS_MERCADO.filter((m) => m.precio?.ars == null)

/**
 * LA TABLA, EN EL ORDEN QUE DECIDE: primero los que entran a FONDEFIN (única línea con tasa real
 * negativa), después por precio ascendente. Los que no tienen precio van al final de su grupo — no
 * se los deja afuera, porque "no tiene precio publicado" también es una respuesta a la pregunta.
 */
export function ordenadosParaDecidir() {
  return [...MODELOS_MERCADO].sort((a, b) => {
    const fa = calificaFondefin(a) ? 0 : 1
    const fb = calificaFondefin(b) ? 0 : 1
    if (fa !== fb) return fa - fb
    const pa = a.precio?.ars ?? Number.POSITIVE_INFINITY
    const pb = b.precio?.ars ?? Number.POSITIVE_INFINITY
    return pa - pb
  })
}

/**
 * TODO LO QUE NO SE SABE, JUNTO — lo mismo que hace `loQueFalta()` en `rodados-datos.mjs`, y por el
 * mismo motivo: un hueco que no se puede listar con una función no lo va a buscar nadie.
 */
export function loQueFaltaDelMercado() {
  const huecos = MODELOS_MERCADO.flatMap((m) =>
    (m.desconocido ?? []).map((d) => ({ modelo: m.clave, tipo: 'desconocido', dato: d })))
  const sinCotizar = MODELOS_MERCADO
    .filter((m) => m.precio?.ars == null)
    .map((m) => ({
      modelo: m.clave,
      tipo: 'sin_precio_publicado',
      dato: 'PRECIO 0km',
      buscadoEn: m.precioNoPublicado?.buscadoEn ?? [],
      motivo: m.precioNoPublicado?.motivo ?? 'no declarado',
    }))
  const pesosMal = MODELOS_MERCADO
    .map((m) => ({ m, chequeo: pesosCierran(m) }))
    .filter(({ chequeo }) => chequeo.cierran === false)
    .map(({ m, chequeo }) => ({
      modelo: m.clave,
      tipo: 'pesos_no_cierran',
      dato: `la carga legal declarada no entra en el PBT: ${chequeo.motivo}`,
      cargaRealDentroDelPbt: chequeo.cargaRealDentroDelPbt,
    }))
  return [...sinCotizar, ...pesosMal, ...huecos]
}
