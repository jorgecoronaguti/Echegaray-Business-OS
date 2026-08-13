// QUÉ UNIDAD DE LA FLOTA NOMBRA UN GASTO — UNA SOLA DEFINICIÓN.
//
// POR QUÉ EXISTE (13/08/2026). El análisis de compra de rodados del 07/08 declaró el gap textual:
// *"el costo de flota no está imputado por unidad ni hay registro unidad↔obra"*. Medido hoy, el gap
// era la MITAD cierto: el dato de unidad SÍ existe — el dueño anota a mano la unidad en cada tique
// ("Toyota EEA885", "SF - Bobcat", "HW DX 2018") y esa anotación viaja al concepto de Compras. Lo
// que faltaba no era el dato: era la REGLA que lo lee. Sin ella, cada medición se hace con un CASE
// improvisado que da un número distinto cada vez.
//
// LA PROPIEDAD QUE ESTE ARCHIVO DEFIENDE: un gasto se atribuye a UNA unidad sólo cuando el texto
// nombra UNA sola. Lo demás NO se reparte, se declara con su causa. Eso importa porque el error
// natural del CASE ("la primera que matchea gana") imputa el 100% de una carga compartida a una
// unidad: medido acá, hay 4 filas por $677.262 que nombran DOS unidades a la vez ("Camion 70L y
// Maquina 20L", "50L C/U bobcat y camion"). Un CASE se las lleva enteras a una sola y el número
// resultante parece un dato cuando es una invención.
//
// LAS CUATRO CAUSAS DE "SIN UNIDAD" — la clasificación es el producto, no un residuo:
//   compartido       el texto nombra 2+ unidades (repartirlo requiere litros, que casi nunca están)
//   ambiguo          nombra una FAMILIA con varias unidades ("Ford" son dos, "Toyota" son tres)
//   apodo_sin_mapear un apodo real del dueño sin dueño declarado ("HW DX 2018", "Camioneta Emi")
//   no_nombrada      el texto no dice nada
// Cada una tiene una acción distinta y sólo la última es "falta cargar el dato".
//
// NADA INVENTADO. Marca, modelo, patente y serie salen de un papel o de un comprobante, y cada
// unidad declara de dónde. Lo que no está verificado se declara null, no se completa por parecido.

/** Normaliza a palabras: sin acentos, minúsculas, todo lo no alfanumérico → espacio. PURA. */
export const normTexto = (s) => String(s ?? '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Compacta: sólo alfanuméricos pegados. Para identificadores ("AD 119 YO" = "ad119yo"). PURA. */
export const compactar = (s) => String(s ?? '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')

// ═══ EL REGISTRO DE UNIDADES ═══
//
// `alias` se busca con BORDE DE PALABRA sobre el texto normalizado. El borde no es un detalle: sin
// él, "camion" matchea dentro de "Camioneta Ford XLS" y las 12 cuotas del prendario de la camioneta
// se le imputan al camión Mercedes. Con \b, no.
// `ids` se busca como substring sobre el texto COMPACTADO, porque una patente aparece escrita de
// todas las formas: "EEA885", "EEA 885", "EEA-885". Los typos observados en los datos reales
// ("EEA88S" con S, "MNM 898" con las letras cambiadas) se declaran como id, no se corrigen a mano
// cada vez: el dueño va a volver a tipearlos.
export const UNIDADES = [
  {
    clave: 'ford-f100', nombre: 'Ford F100', tipo: 'vehiculo', familia: 'ford',
    patente: 'AXH205',
    fuente: 'administracion/VEHICULOS/FORD F100 AXH205 (cédula verde, título, RTO marzo 26)',
    alias: ['ford f100', 'f 100'], ids: ['axh205', 'fordf100'],
  },
  {
    clave: 'ford-xls', nombre: 'Ford Ranger XLS', tipo: 'vehiculo', familia: 'ford',
    patente: 'AG503PV',
    // El nombre de la carpeta dice "FORD XLS AG503PV" y la fila del banco dice "Prestamo Camioneta
    // Ford XLS": es una camioneta. El modelo exacto (Ranger) es lo que sugiere la denominación
    // comercial "XLS" en camioneta Ford, pero NO está leído en el título — por eso el nombre que
    // manda para todo lo operativo es "Ford XLS", el que usa el dueño.
    fuente: 'administracion/VEHICULOS/FORD XLS AG503PV (Drive) + tabla public.equipos',
    alias: ['ford xls', 'xls', 'camioneta ford'], ids: ['ag503pv', 'fordxls'],
  },
  {
    clave: 'hilux-nmn898', nombre: 'Toyota Hilux NMN898', tipo: 'vehiculo', familia: 'toyota',
    patente: 'NMN898',
    fuente: 'administracion/VEHICULOS/TOYOTA HILUX NMN 898 (título) + tabla public.equipos',
    alias: [], ids: ['nmn898', 'mnm898'], // "Toyota MNM 898" — typo real del 08/07, mismas letras cambiadas
  },
  {
    clave: 'hilux-eea885', nombre: 'Toyota Hilux EEA885', tipo: 'vehiculo', familia: 'toyota',
    patente: 'EEA885',
    fuente: 'administracion/VEHICULOS/TOYOTA HILUX EEA-885 (título, RTO, ÚNICA póliza archivada)',
    // "eea" a secas es el alias más corto del dueño ("Combustible EEA", "Toyota EEA") y es seguro
    // porque va con borde de palabra: no existe otra unidad ni otra palabra del rubro que lo contenga.
    alias: ['eea'], ids: ['eea885', 'eea88s'], // "Diesel 500 (Toyota EEA88S)" — typo real del 15/07
  },
  {
    clave: 'hilux-ad119yo', nombre: 'Toyota Hilux AD119YO', tipo: 'vehiculo', familia: 'toyota',
    patente: 'AD119YO',
    fuente: 'administracion/VEHICULOS/TOYOTA HILUX AD119YO (cédula verde + RTO, título)',
    alias: [], ids: ['ad119yo'],
  },
  {
    clave: 'camion-608d', nombre: 'Camión Mercedes Benz 608D', tipo: 'vehiculo', familia: null,
    // LA PATENTE APARECIÓ EN EL NOMBRE DE UN ARCHIVO. `public.equipos` la sembró como "sin patente
    // confirmada en la documentación revisada", pero la carpeta del camión tiene
    // "RTO - VOI440 Marzo 26.pdf" junto al título y la cédula del 608D. Es evidencia de nivel 2
    // (nombre de archivo leído, contenido NO abierto): se declara acá y la migración la sube a
    // equipos, con la fuente al lado para que el dueño la confirme contra la cédula.
    patente: 'VOI440',
    fuente: 'administracion/VEHICULOS/Mercedes 608D/RTO - VOI440 Marzo 26.pdf (nombre de archivo)',
    alias: ['camion', 'mercedes', 'mercedes benz', '608 d'], ids: ['608d', 'voi440'],
  },
  {
    clave: 'bobcat-s650', nombre: 'Minicargadora Bobcat S650', tipo: 'maquina', familia: null,
    // La serie sale del texto de la factura de Gruas San Blas del 31/07 (servicio de reparación,
    // USD 3.393,65): "Bobcat S650 · serie A3NV25954". Es un comprobante, no una suposición.
    patente: null, serie: 'A3NV25954',
    fuente: 'factura Gruas San Blas 31/07/2026 (remitos OTX 00018-14201, PSX 00010-59693/58047)',
    alias: ['bobcat'], ids: ['s650', 'a3nv25954'],
  },
  {
    clave: 'autoelevador', nombre: 'Autoelevador', tipo: 'maquina', familia: null,
    patente: null,
    fuente: 'comprobantes de combustible (Barcelo / Nuevo Cuyo / Villa del Pino) — sin documentación registral vista',
    alias: ['autoelevador', 'auto elevador'], ids: ['autoelevador'],
  },
  {
    // NO ES NUESTRA — lo descubrió el propio cuadro. La primera corrida la declaró máquina propia y
    // le imputó $11.553.250 de "mantenimiento" en San Francisco, que es un número absurdo para una
    // plataforma: eran SEIS facturas de DUPEC que dicen "ALQUILER TIJERA 4X4". El alquiler de la
    // tijera es el gasto de flota más grande del año después del prendario, y estaba invisible.
    // Se paga además su combustible ($194.461), que es lo normal en un alquiler sin operario.
    clave: 'tijera', nombre: 'Plataforma tijera 4x4 (alquilada a DUPEC)', tipo: 'alquilada', familia: null,
    // "TIJE / AUTOELEVADOR" aparece 12 veces: son DOS equipos en un tique, no uno llamado "TIJE".
    // Declarar "tije" como alias de la tijera es lo que convierte esas filas en `compartido` en vez
    // de dárselas enteras al autoelevador.
    patente: null,
    fuente: 'facturas DUPEC "ALQUILER TIJERA 4X4" + tiques de combustible ("TIJERA", "TIJE / AUTOELEVADOR")',
    alias: ['tijera', 'tije'], ids: [],
  },
  {
    clave: 'cortadora-pisos', nombre: 'Cortadora de pisos', tipo: 'equipo_menor', patente: null, familia: null,
    fuente: 'comprobantes de combustible ("CORTADORA DE PISOS", "Combustible para cortadora")',
    alias: ['cortadora', 'cortadora de pisos'], ids: [],
  },
  {
    clave: 'canguro', nombre: 'Compactador canguro', tipo: 'equipo_menor', patente: null, familia: null,
    fuente: 'comprobantes de combustible ("Combustible para canguro")',
    alias: ['canguro'], ids: [],
  },
  {
    clave: 'vibro', nombre: 'Vibrocompactador', tipo: 'equipo_menor', patente: null, familia: null,
    fuente: 'comprobante de combustible del 03/06/2026 ("Nafta para Vibro")',
    alias: ['vibro'], ids: [],
  },
  {
    // NO ES NUESTRA. Se declara igual porque su combustible SÍ lo pagamos y sin la unidad esas
    // cargas caerían en "sin unidad", ensuciando justamente el número que mide la calidad del dato.
    // Su ALQUILER se contabiliza aparte (ver flota-costos.mjs): mezclarlo con el costo de una unidad
    // propia haría comparable lo que no lo es.
    clave: 'excavadora-alquilada', nombre: 'Mini excavadora (alquilada a DUPEC)', tipo: 'alquilada',
    patente: null, familia: null,
    fuente: 'facturas DUPEC (Wacker Neuson ET35 / EZ17) — equipo de tercero, no de la empresa',
    alias: ['excavadora', 'mini excavadora', 'retro excavadora', 'retroexcavadora', 'retro'], ids: [],
  },
]

/**
 * LAS FAMILIAS AMBIGUAS. Un texto que dice sólo "Ford" o sólo "Toyota" nombra un grupo, no una
 * unidad: hay dos Ford y tres Toyota. Atribuirlo a la unidad "más probable" es exactamente lo que
 * este archivo existe para no hacer.
 * `maquina` no es una familia de unidades declaradas: es la palabra con que el dueño llama a
 * cualquier equipo. Se trata como ambigua porque señala que hay OTRA unidad involucrada.
 */
export const FAMILIAS = {
  ford: { nombre: 'Ford (F100 o XLS)', alias: ['ford'] },
  toyota: { nombre: 'Toyota Hilux (NMN898, EEA885 o AD119YO)', alias: ['toyota', 'hilux'] },
  maquina: { nombre: 'máquina sin identificar', alias: ['maquina', 'maquinas'] },
}

/**
 * LOS APODOS QUE EL DUEÑO USA Y NADIE TRADUJO. Están acá y no en `alias` a propósito: si los mapeo
 * por parecido invento el dato; si los ignoro, se pierden en "no nombrada" y parecen un problema de
 * carga cuando en realidad el dueño SÍ escribió la unidad. Esta lista es una PREGUNTA pendiente al
 * dueño, y el cuadro la muestra con su plata al lado para que valga la pena contestarla.
 */
export const APODOS_SIN_MAPEAR = [
  { apodo: 'hw dx 2018', ids: ['hwdx2018'], nota: 'una Hilux DX modelo 2018 — hay tres Hilux y ningún papel dice el año' },
  { apodo: 'camioneta emi', ids: [], nota: 'la camioneta que usa Emi — no está declarado quién usa cuál' },
  { apodo: 'auto jp', ids: [], nota: 'el auto de JP — ninguna unidad del registro es un auto' },
]

/** Los mismos pares de translate() que ya usan norm_area_txt y norm_obra en las migraciones. */
export const ACENTOS_IN = 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ'
export const ACENTOS_OUT = 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'

const PORCLAVE = new Map(UNIDADES.map((u) => [u.clave, u]))
/** La unidad del registro con esa clave, o undefined. PURA. */
export const unidadPorClave = (clave) => PORCLAVE.get(clave)

/** ¿El texto normalizado contiene `alias` como palabra completa? PURA. */
const tieneAlias = (t, alias) => new RegExp(`(^| )${alias.replace(/ /g, ' ')}( |$)`).test(t)

/** Todas las unidades que el texto nombra, por clave. PURA. */
function unidadesNombradas(t, c) {
  return UNIDADES.filter((u) =>
    u.alias.some((a) => tieneAlias(t, a)) || u.ids.some((i) => c.includes(i)),
  ).map((u) => u.clave)
}

/** Las familias que el texto nombra y que NINGUNA unidad resuelta ya cubre. PURA. */
function familiasSueltas(t, claves) {
  const cubiertas = new Set(claves.map((k) => PORCLAVE.get(k)?.familia).filter(Boolean))
  return Object.entries(FAMILIAS)
    .filter(([f, d]) => !cubiertas.has(f) && d.alias.some((a) => tieneAlias(t, a)))
    .map(([f]) => f)
}

/**
 * NÚCLEO PURO: qué unidad de la flota nombra un texto (el concepto de Compras).
 *
 * @param {string} texto el concepto/detalle tal cual lo tipeó el dueño
 * @returns {{clave:string|null, unidades:string[], causa:string|null, detalle:string|null}}
 *   `clave` sólo tiene valor cuando el texto nombra UNA unidad. Si no, `causa` dice por qué no.
 */
export function resolverUnidad(texto) {
  const t = normTexto(texto)
  const c = compactar(texto)
  const unidades = unidadesNombradas(t, c)
  const familias = familiasSueltas(t, unidades)

  // Dos o más cosas nombradas (unidades resueltas + familias sueltas) = carga compartida. No se
  // reparte: el tique casi nunca trae los litros de cada una, y partir 50/50 sería inventar.
  if (unidades.length + familias.length > 1) {
    return { clave: null, unidades, causa: 'compartido', detalle: [...unidades, ...familias].join(' + ') }
  }
  if (unidades.length === 1) return { clave: unidades[0], unidades, causa: null, detalle: null }
  if (familias.length === 1) {
    return { clave: null, unidades: [], causa: 'ambiguo', detalle: FAMILIAS[familias[0]].nombre }
  }
  const apodo = APODOS_SIN_MAPEAR.find((a) => tieneAlias(t, a.apodo) || a.ids.some((i) => c.includes(i)))
  if (apodo) return { clave: null, unidades: [], causa: 'apodo_sin_mapear', detalle: apodo.apodo }
  return { clave: null, unidades: [], causa: 'no_nombrada', detalle: null }
}

/**
 * La MISMA regla, como función de Postgres. Segunda cara de la única definición — se GENERA desde
 * UNIDADES por el mismo motivo que `sqlRubroDeCaja()` en rubro-caja.mjs: un CASE tipeado a mano en
 * una migración se desincroniza el día que se agrega una unidad y nadie se entera.
 *
 * En SQL sólo se puede expresar la parte barata (¿nombra ESTA unidad?), no la partición completa:
 * la ambigüedad y lo compartido necesitan contar cuántas matchean. Por eso la función devuelve la
 * PRIMERA unidad nombrada y una segunda función devuelve cuántas — la vista las combina y sólo
 * atribuye cuando el conteo es 1. Nunca "la primera gana".
 * @returns {string} el cuerpo SQL del array de claves nombradas
 */
export function sqlUnidadesNombradas(col = 'concepto') {
  // Mismo `translate` que norm_area_txt/norm_obra en las migraciones existentes: sin depender de la
  // extensión unaccent, que puede no estar instalada en un entorno nuevo.
  const base = `lower(translate(coalesce(${col}, ''), '${ACENTOS_IN}', '${ACENTOS_OUT}'))`
  const t = `' ' || regexp_replace(${base}, '[^a-z0-9]+', ' ', 'g') || ' '`
  const c = `regexp_replace(${base}, '[^a-z0-9]+', '', 'g')`
  const ramas = UNIDADES.map((u) => {
    const cond = [
      ...u.alias.map((a) => `${t} like '% ${a} %'`),
      ...u.ids.map((i) => `${c} like '%${i}%'`),
    ].join(' or ')
    return `    case when ${cond} then '${u.clave}' end`
  })
  return `array_remove(array[\n${ramas.join(',\n')}\n  ], null)`
}
