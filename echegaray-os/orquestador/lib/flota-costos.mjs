// EL COSTO DE LA FLOTA, POR UNIDAD — qué gasto es de flota y de qué unidad.
//
// POR QUÉ EXISTE (13/08/2026). El análisis de rodados del 07/08 prometió decidir la tercera unidad
// "por utilización real medida en 60-90 días" y esa medición nunca se puso a andar. Sin costo por
// unidad, "¿compramos otra camioneta?" se contesta con intuición: no se sabe cuánto cuesta la que ya
// está, ni cuánto sale alquilar lo que falta.
//
// LO QUE ESTE CUADRO NO HACE: reimputar nada a una obra. El 18/07 el dueño fijó que "Vehículos" y
// "Crédito Prendario" son costo INDIRECTO en la taxonomía canónica. Así que la obra que aparece al
// lado de cada gasto es DÓNDE SE USÓ la unidad, no a qué obra se le carga la plata. Confundir las
// dos cosas rompería el P&L por obra y el cash flow a la vez.
//
// LA VENTANA DE TIEMPO ES PARTE DEL NÚMERO (regla de oro 3). El crédito prendario tiene las cuotas
// del año entero cargadas: al 13/08 hay 8 pagadas (cuotas 15 a 22) y 4 todavía por vencer. Sumarlas
// en un solo "costo 2026" mezcla plata que salió con plata que va a salir. Por eso todo sale partido
// en REAL (fecha ≤ corte) y COMPROMETIDO (fecha > corte), nunca sumado en silencio.
//
// EL NÚMERO QUE MIDE SI LA MEDICIÓN SIRVE es `pctSinUnidad`. Si sube, el cuadro vale menos, y sus
// causas dicen qué hacer con cada peso: `apodo_sin_mapear` se arregla con una respuesta del dueño,
// `no_nombrada` con disciplina de carga, `compartido` sólo con litros en el tique.

import { resolverUnidad, unidadPorClave, normTexto, UNIDADES } from './flota-unidades.mjs'

/** Las estaciones de servicio. Son proveedores MIXTOS (Barceló también vendió almuerzos y café),
 *  así que ser estación no alcanza: el concepto además tiene que hablar de combustible. */
export const ESTACIONES = [
  'combustibles barcelo', 'villa del pino', 'combustibles nuevo cuyo', 'axion servicentro media agua',
  'estacion central', 'operadora de estacion de servicio sa', 'centro de servicios san francisco sa',
  'diagonal don bosco',
]

/** Talleres, repuesteros, gomerías y concesionarias: proveedores cuyo rubro ES sostener la flota.
 *  Están para que un gasto de flota SIN unidad nombrada igual entre al cuadro y engorde el renglón
 *  "sin unidad". Si sólo entrara lo que nombra unidad, ese renglón daría 0 y mentiría. */
export const PROVEEDORES_SOSTENIMIENTO = [
  'neumagom', 'lubricentro martin', 'rally car center', 'intermotor', 'goldstein automores saci',
  'diesel rodriguez', 'vicente marrelli', 'rulemanes rawson', 'pal-checo', 'zabala repuesstos',
  'victor repuestos', 'gimenez mecanico', 'freddy', 'juan navarro', 'pablo issa', 'perera walter daniel',
]

/** Los destinos de la columna "Cliente / Asignación" que NO son una obra: son estructura. Sirve para
 *  no leer "Administracion" como si fuera una obra donde la unidad estuvo trabajando. */
export const DESTINOS_NO_OBRA = [
  'administracion', 'taller', 'almacen', 'credito prendario', 'vehiculos / maquinas', 'obras',
  'sueldos', 'f931', 'plan de pago', 'uocra', 'ieric', 'fcl', 'fodeco', 'papa',
]

const tieneP = (prov, lista) => lista.some((x) => normTexto(x) === normTexto(prov))
const has = (s, re) => re.test(normTexto(s))

const RE_COMBUSTIBLE = /\b(combustible|combustibles|nafta|gasoil|diesel|infinia|super|gnc|kerosene)\b/
const RE_NEUMATICO = /\b(neumatico|neumaticos|cubierta|cubiertas|gomeria|goma|gomas)\b/
const RE_SEGURO = /\b(seguro|seguros|poliza|polizas|siniestro|franquicia)\b/
const RE_REGISTRAL = /\b(patente|patentes|rto|vtv|rentas automotor|libre deuda|cedula verde|titulo automotor)\b/
const RE_PRENDARIO = /\b(prendario|prendaria)\b|\bprestamo camioneta\b/
const RE_ALQUILER = /\balquiler\b/
const RE_TRASLADO = /\b(traslado|traslados|acarreo)\b/

/**
 * CONTRATAR UN CAMIÓN AJENO NO ES UN GASTO DE NUESTRO CAMIÓN. "Viajes de Camion regador — 9 viajes"
 * (Diego Morales, $450.000 a ARCOR) nombra la palabra "camión" igual que "Arreglo camion", pero el
 * primero es un servicio de tercero facturado a una obra y el segundo es plata gastada en la unidad
 * propia. El texto solo no distingue el rol que juega el equipo en la frase, así que la lista es
 * explícita y corta: cuando aparezca otra forma, se agrega acá y el test la fija. Preferimos dejar
 * un gasto AFUERA del cuadro de flota a inflar una unidad propia con el servicio de un tercero.
 */
export const SERVICIOS_DE_TERCEROS = [
  /\bviajes? de camion\b/, /\bcamion regador\b/, /\bcamion volcador\b/, /\bcamion hormigonero\b/,
  /\bcamion atmosferico\b/,
  // La MÁQUINA DE SOLDAR es herramienta de taller, no flota. Entraba por la familia genérica
  // "máquina" —la palabra con que el dueño llama a cualquier equipo— y se llevaba $404.930 de
  // reparaciones de soldadura al renglón "sin unidad" de la flota, empeorando su porcentaje con
  // plata que nunca fue de un vehículo. La familia "máquina" se conserva porque es la que detecta
  // "Camion 70L y Maquina 20L" como carga compartida; la excepción es más barata que perder eso.
  /\bmaquina de soldar\b/,
]

/**
 * LOS COMPONENTES DEL COSTO, EN ORDEN. La primera condición que matchea gana — igual que las reglas
 * de rubro-caja.mjs, y por el mismo motivo: así el reparto es una PARTICIÓN y se puede verificar con
 * una resta. `seguro` y `registral` van ANTES que `mantenimiento` porque hoy dan cero y tienen que
 * seguir dando cero visible: son los dos componentes que la skill de flota exige para un costo
 * completo y que en Compras no tienen ni una fila. Un renglón en $0 es una pregunta; un componente
 * que no existe en el cuadro es un agujero que nadie ve.
 */
export const COMPONENTES = [
  { clave: 'financiero', nombre: 'Financiación (prendario)', propia: true },
  { clave: 'alquiler', nombre: 'Alquiler a terceros', propia: false },
  { clave: 'combustible', nombre: 'Combustible', propia: true },
  { clave: 'neumaticos', nombre: 'Neumáticos', propia: true },
  { clave: 'seguro', nombre: 'Seguro', propia: true },
  { clave: 'registral', nombre: 'Patente / RTO / registral', propia: true },
  { clave: 'traslado', nombre: 'Traslado entre obras', propia: true },
  { clave: 'mantenimiento', nombre: 'Mantenimiento y repuestos', propia: true },
]

/**
 * NÚCLEO PURO: ¿esta fila de Compras es gasto de flota, y de qué componente?
 * Devuelve null cuando la fila no es de flota — que es la mayoría del archivo.
 *
 * @param {{proveedor?:string, concepto?:string, obra_texto?:string}} fila
 * @param {{clave:string|null, causa:string|null}} u lo que devolvió resolverUnidad(concepto)
 * @returns {string|null} clave del componente
 */
export function componenteDe(fila = {}, u = { clave: null, causa: 'no_nombrada' }) {
  const { proveedor, concepto, obra_texto: obra } = fila
  if (normTexto(obra) === 'credito prendario' || has(concepto, RE_PRENDARIO)) return 'financiero'
  if (SERVICIOS_DE_TERCEROS.some((re) => re.test(normTexto(concepto)))) return null
  // El alquiler sólo cuenta cuando el texto nombra un equipo de tercero. Un "alquiler" a secas
  // puede ser el de una oficina y no tiene nada que ver con la flota.
  const alquilada = u.clave && unidadPorClave(u.clave)?.tipo === 'alquilada'
  if (has(concepto, RE_ALQUILER) && alquilada) return 'alquiler'

  const nombraUnidad = Boolean(u.clave) || ['compartido', 'ambiguo', 'apodo_sin_mapear'].includes(u.causa)
  const esEstacion = tieneP(proveedor, ESTACIONES)
  const esSostenimiento = tieneP(proveedor, PROVEEDORES_SOSTENIMIENTO)
  if (!nombraUnidad && !esSostenimiento) {
    // Sin unidad nombrada y sin proveedor de flota, la única puerta que queda es una estación de
    // servicio vendiendo combustible: eso es flota aunque no diga de qué unidad.
    if (!(esEstacion && has(concepto, RE_COMBUSTIBLE))) return null
  }
  if (has(concepto, RE_SEGURO)) return 'seguro'
  if (has(concepto, RE_REGISTRAL)) return 'registral'
  if (has(concepto, RE_NEUMATICO)) return 'neumaticos'
  if (has(concepto, RE_COMBUSTIBLE)) return esEstacion || nombraUnidad ? 'combustible' : 'mantenimiento'
  if (has(concepto, RE_TRASLADO)) return 'traslado'
  return nombraUnidad || esSostenimiento ? 'mantenimiento' : null
}

/** Clasifica una fila: componente + unidad + causa, o null si no es de flota. PURA. */
export function clasificarFila(fila = {}) {
  const u = resolverUnidad(fila.concepto)
  const componente = componenteDe(fila, u)
  if (!componente) return null
  return { componente, unidad: u.clave, causa: u.causa, detalle: u.detalle, total: Number(fila.total) || 0 }
}

/**
 * LA CUOTA 15 NO DICE DE QUÉ CAMIONETA ES; LA 21 SÍ. Las doce filas del crédito prendario son un
 * único préstamo —numeración correlativa 15→26, mismo proveedor, mismo importe— y sólo a partir de
 * la 21 alguien empezó a escribir "Prestamo Camioneta Ford XLS". Dejar las seis primeras en "sin
 * unidad" reportaría $7,7M sin dueño cuando el dueño es evidente; asignarlas a mano sería un número
 * tipeado que nadie puede auditar.
 *
 * La herencia lo resuelve con una condición que se apaga sola: un grupo de filas financieras hereda
 * la unidad SÓLO si en todo el grupo se nombra EXACTAMENTE UNA. El día que la empresa tome un
 * segundo prendario, el grupo pasará a nombrar dos unidades, la herencia se corta, y las cuotas sin
 * nombre volverán a "sin unidad" — que es lo correcto, porque ahí ya no se sabría de cuál son.
 *
 * @param {Array} clasificadas pares {fila, clasificacion}
 * @returns {Map<string,string>} obra_texto → clave de unidad heredada
 */
export function herenciaFinanciera(clasificadas = []) {
  const grupos = new Map()
  for (const { fila, c } of clasificadas) {
    if (c?.componente !== 'financiero') continue
    const k = normTexto(fila.obra_texto)
    const g = grupos.get(k) ?? new Set()
    if (c.unidad) g.add(c.unidad)
    grupos.set(k, g)
  }
  const out = new Map()
  for (const [k, set] of grupos) if (set.size === 1) out.set(k, [...set][0])
  return out
}

const vacio = () => ({ real: 0, comprometido: 0, filas: 0, porComponente: {}, obras: {} })

function acumular(acc, { componente, total }, futura) {
  acc.filas++
  acc[futura ? 'comprometido' : 'real'] += total
  const c = acc.porComponente[componente] ?? { real: 0, comprometido: 0 }
  c[futura ? 'comprometido' : 'real'] += total
  acc.porComponente[componente] = c
}

/** ¿La columna "Cliente / Asignación" apunta a una obra real o a estructura? PURA. */
export const esObra = (obra_texto) => {
  const n = normTexto(obra_texto)
  return Boolean(n) && !DESTINOS_NO_OBRA.map(normTexto).includes(n)
}

/**
 * EL CUADRO: costo de flota por unidad, con el renglón "sin unidad" y sus causas.
 *
 * @param {Array} filas filas de costos_obra ({proveedor, concepto, obra_texto, total, fecha})
 * @param {{corte?:Date|string}} opts corte que separa REAL de COMPROMETIDO (por defecto: hoy)
 */
export function cuadroFlota(filas = [], { corte = new Date() } = {}) {
  const lim = new Date(corte)
  const porUnidad = new Map()
  const sinUnidad = { ...vacio(), porCausa: {} }
  let totalReal = 0, totalComprometido = 0

  const clasificadas = filas.map((fila) => ({ fila, c: clasificarFila(fila) })).filter((x) => x.c)
  const heredada = herenciaFinanciera(clasificadas)

  for (const { fila: f, c: base } of clasificadas) {
    const h = base.componente === 'financiero' && !base.unidad ? heredada.get(normTexto(f.obra_texto)) : null
    const c = h ? { ...base, unidad: h, causa: null, heredada: true } : base
    const futura = Boolean(f.fecha) && new Date(f.fecha) > lim
    if (futura) totalComprometido += c.total; else totalReal += c.total
    const acc = c.unidad
      ? (porUnidad.get(c.unidad) ?? porUnidad.set(c.unidad, vacio()).get(c.unidad))
      : sinUnidad
    acumular(acc, c, futura)
    if (!c.unidad) {
      const k = c.causa ?? 'no_nombrada'
      const p = sinUnidad.porCausa[k] ?? { real: 0, comprometido: 0, filas: 0 }
      p[futura ? 'comprometido' : 'real'] += c.total; p.filas++
      sinUnidad.porCausa[k] = p
    }
    if (esObra(f.obra_texto)) {
      acc.obras[f.obra_texto] = (acc.obras[f.obra_texto] ?? 0) + c.total
    }
  }

  const unidades = [...porUnidad.entries()]
    .map(([clave, v]) => ({ ...unidadPorClave(clave), ...v }))
    .sort((a, b) => (b.real + b.comprometido) - (a.real + a.comprometido))
  // Las unidades del registro que no gastaron nada aparecen igual, en cero. Una unidad ausente del
  // cuadro se lee como "no la miramos"; una en $0 se lee como "no gastó" — y si eso es falso, es un
  // gasto que se está cargando con otro nombre.
  const enCero = UNIDADES.filter((u) => !porUnidad.has(u.clave)).map((u) => ({ ...u, ...vacio() }))

  const totalPropia = totalReal + totalComprometido
  return {
    corte: lim,
    unidades: [...unidades, ...enCero],
    sinUnidad,
    totalReal,
    totalComprometido,
    // El número que mide la calidad del dato: sobre lo REAL, que es lo único ya ocurrido.
    pctSinUnidad: totalReal > 0 ? sinUnidad.real / totalReal : 0,
    totalPropia,
  }
}
