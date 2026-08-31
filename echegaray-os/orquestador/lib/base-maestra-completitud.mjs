// ¿ESTÁ COMPLETA ESTA COMPOSICIÓN? Puro, determinístico, sin modelo.
//
// ═══ EL DEFECTO MEDIDO, CON SU NÚMERO ═══
//
// En la base real, «PISO DE HORMIGON ALISADO MECÁNICO» no es una partida: son DOS.
//
//   T1107.1  · «... - MANO DE OBRA»                       → $ 17.550,90 /m²
//   T1107.2  · «... - MATERIALES H17, 15cm y #6 15-15»    → $ 28.939,50 /m²
//                                                    juntas → $ 46.490,40 /m²
//
// El selector las veía como dos opciones a 0,096 de distancia y devolvía AMBIGUO — «son dos
// opciones, no una». **No son dos opciones: son dos mitades.** Elegir cualquiera de las dos cotiza
// el piso al 38 % o al 62 % de lo que sale, y el número que publica tiene dos decimales y una
// unidad: no se delata solo. Sobre 1.000 m² de piso industrial eso son $ 28,9 M o $ 17,5 M que
// nadie ve faltar hasta que se compra el hormigón.
//
// Es el peor tipo de error de plata que puede tener un cotizador: **silencioso**. No hay excepción,
// no hay celda vacía, no hay control que se ponga rojo. Sale un precio perfectamente creíble que
// está a la mitad, se manda al cliente, se gana la obra por ser el más barato, y la diferencia
// aparece recién cuando hay que comprar el hormigón que nadie cotizó. Un hueco declarado se
// negocia; éste no se ve.
//
// ═══ POR QUÉ SE DETECTA POR EVIDENCIA Y NO POR UMBRAL ═══
//
// La tentación era medir: «si el cajón de materiales pesa menos del 5 % del costo directo, la
// partida no cotiza materiales». Habría funcionado para T1107.1 —su única línea de material es
// nafta, $ 252 sobre $ 17.550, el 1,4 %— y habría sido la respuesta equivocada. Un umbral así es
// una opinión sobre cuánto tiene que pesar un cajón, no se puede defender delante de nadie, y el
// día que una partida legítima quede en el 4,8 % empieza a mentir en la otra dirección.
//
// La evidencia es que **la partida lo dice en su propio nombre**: «- MANO DE OBRA» y «- MATERIALES
// H17...». Tres condiciones, todas leídas del catálogo y ninguna numérica: misma raíz comercial,
// misma unidad, y cada una declarando un alcance parcial DISTINTO. No hay nada que calibrar, el
// resultado no cambia si cambian los precios, y cualquiera puede verificarlo abriendo las dos
// partidas y leyendo sus nombres. Un control apoyado en un umbral hay que defenderlo; uno apoyado
// en lo que el dato declara de sí mismo se explica solo.
//
// ═══ LA REGLA QUE NO SE CRUZA ═══
//
// **Una composición NO se declara incompleta por lo que «debería» tener.** Un FLETE no lleva mano
// de obra, un MARTILLO ELÉCTRICO por día no lleva materiales y una EXCAVACIÓN subcontratada no
// lleva ninguno de los dos: los tres están completos. Medido sobre las 205 composiciones vigentes,
// exigir los cinco cajones a todas produce 26 faltantes de los cuales la mayoría son legítimos —un
// control así siempre dice que no, y un control que siempre dice que no no dice nada.
//
// Se declara incompleta por lo que ELLA MISMA declara y no tiene, o por lo que la base demuestra
// que le falta. Las cinco causas de abajo son todas verificables abriendo la partida; ninguna es
// una opinión sobre cómo debería componerse una tarea.
//
// ═══ Y NO SUMA CERO ═══
//
// Una composición incompleta publica `costo: null`, no `0`. Es la misma regla que `costoDePartida`
// aplica a una línea sin precio, una escala más arriba: un cero se suma en silencio y desaparece;
// un `null` obliga a decidir qué se hace con el hueco.

import { CAJON } from './cotizador/costo.mjs'
import { ESTADO_BM, costoQuePublica } from './base-maestra-estado.mjs'

/** El cajón de cada `recurso.tipo` de Postgres. Es el mismo mapa que usa el costo — se importa el
 *  destino (`CAJON`) en vez de escribir otra lista de cinco palabras que mañana diverja. */
const CAJON_DE_TIPO = Object.freeze({
  mano_obra: CAJON.LABOR,
  carga_social: CAJON.LABOR,
  material: CAJON.MATERIALS,
  equipo: CAJON.EQUIPMENT,
  subcontrato: CAJON.SUBCONTRACTS,
  servicio: CAJON.OTHER,
  otro: CAJON.OTHER,
})

const limpio = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * EL ALCANCE QUE LA PARTIDA DECLARA EN SU PROPIO NOMBRE. PURA.
 *
 * Es la evidencia, no la sospecha: «- MANO DE OBRA» al final de un nombre no es una pista de que
 * falten materiales, es la partida diciendo que cotiza sólo la mano de obra. Por eso esto no lleva
 * ningún umbral ni ningún porcentaje: o el nombre lo dice o no lo dice.
 *
 * Cuando declara LOS DOS —«PINTURA VIAL - MATERIALES Y MANO DE OBRA»— no declara un alcance
 * parcial: declara que es completa, y devuelve `null`.
 */
export function alcanceDeclarado(nombre) {
  const t = limpio(nombre)
  const declara = new Set()
  const literales = []
  const marcar = (cajon, re) => {
    const m = t.match(re)
    if (m) { declara.add(cajon); literales.push(m[0].trim()) }
  }
  // El `\by\s+` es lo que salva a «PINTURA VIAL - MATERIALES Y MANO DE OBRA» (T1139): sin él, el
  // guion marca MATERIALS, la mano de obra queda detrás de una «y» que ninguna alternativa
  // contempla, y una partida COMPLETA sale declarada parcial. Medido sobre las 205 activas.
  marcar(CAJON.LABOR, /\bs[oó]lo\s+mano\s+de\s+obra\b|[-·(]\s*mano\s+de\s+obra\b|\by\s+mano\s+de\s+obra\b|^mano\s+de\s+obra\b/)
  // «PROVISION E INSTALACION» y «con COLOCACION» declaran las DOS cosas: no son alcance parcial.
  marcar(CAJON.LABOR, /[-·(]\s*colocaci[oó]n\b|^colocaci[oó]n\s+de\b/)
  marcar(CAJON.MATERIALS, /[-·(]\s*(?:solo\s+)?materiales?\b|[-·(]\s*consumibles\b|\by\s+consumibles\b/)
  if (declara.size !== 1) return null
  const [cajon] = declara
  return Object.freeze({ cajon, literal: literales[0] })
}

/**
 * LA RAÍZ COMERCIAL DE UN NOMBRE: lo que queda antes del guion que separa el alcance. PURA.
 *
 * «PISO DE HORMIGON ALISADO MECÁNICO - MANO DE OBRA» y «... - MATERIALES H17, 15cm y #6 15-15»
 * comparten raíz. Se corta en el PRIMER guion rodeado de espacios y no en cualquier guion, porque
 * «MALLA 15-15» y «H-17» llevan guiones que son parte del nombre, no un separador de alcance.
 */
export function raizComercial(nombre) {
  return limpio(nombre).split(/\s[-·]\s|\s\(/)[0].replace(/\s+/g, ' ').trim()
}

/** Los cajones que efectivamente tiene una composición, con cuántas líneas cada uno. PURA. */
export function cajonesDe(lineas = []) {
  const porCajon = {}
  for (const l of lineas) {
    const c = CAJON_DE_TIPO[String(l?.tipo ?? '').toLowerCase()]
    if (!c) continue
    porCajon[c] = (porCajon[c] ?? 0) + 1
  }
  return Object.freeze(porCajon)
}

/**
 * LAS CAUSAS POR LAS QUE UNA COMPOSICIÓN NO PUEDE CERRAR UN PRECIO. PURA.
 *
 * Cada una nombra un hecho verificable abriendo la partida. `complementos` es la lista de códigos
 * que la base demuestra que van con ésta (ver `paresComplementarios`); llega desde afuera porque
 * depende del catálogo entero y esta función mira una sola composición.
 */
export function huecosDe({ codigo, nombre, lineas = [], lineasSinPrecio = 0 } = {}, { complementos = [] } = {}) {
  const huecos = []
  const cajones = cajonesDe(lineas)

  if (!lineas.length) {
    huecos.push({ causa: 'SIN_LINEAS', porQue: `«${codigo}» no tiene ninguna línea: su costo directo no es 0, es desconocido` })
  }
  if (lineasSinPrecio > 0) {
    huecos.push({ causa: 'LINEA_SIN_PRECIO', porQue: `${lineasSinPrecio} línea(s) de «${codigo}» no tienen precio: el costo directo no se puede afirmar` })
  }

  const alcance = alcanceDeclarado(nombre)
  if (alcance) {
    huecos.push({
      causa: 'ALCANCE_PARCIAL_DECLARADO',
      cajon: alcance.cajon,
      porQue: `«${codigo}» declara en su propio nombre («${alcance.literal}») que cotiza sólo ${alcance.cajon}: usarla sola cotiza una parte de la tarea`,
    })
  }
  if (complementos.length) {
    huecos.push({
      causa: 'COMPLEMENTO_EN_LA_BASE',
      con: complementos.map((c) => c.codigo),
      porQue: `la Base Maestra tiene ${complementos.map((c) => `«${c.codigo}» (${c.cajonDeclarado})`).join(' y ')} para la misma tarea y la misma unidad: van SUMADAS, elegir una cotiza la mitad`,
    })
  }

  // ═══ MANO DE OBRA SIN CARGA SOCIAL ═══
  // No es una opinión sobre cómo se compone una tarea: es aritmética. Si hay horas de oficial y no
  // hay su carga social, el costo laboral está subvaluado en el porcentaje de cargas —y en la
  // construcción ese porcentaje no es chico—. Medido: 32 de las 179 composiciones con mano de obra
  // no la declaran.
  const tieneMO = (lineas ?? []).some((l) => String(l?.tipo).toLowerCase() === 'mano_obra')
  const tieneCS = (lineas ?? []).some((l) => String(l?.tipo).toLowerCase() === 'carga_social')
  if (tieneMO && !tieneCS) {
    huecos.push({ causa: 'MANO_OBRA_SIN_CARGA_SOCIAL', porQue: `«${codigo}» carga horas de mano de obra y ninguna carga social: el costo laboral sale subvaluado en el porcentaje de cargas` })
  }

  return { cajones, huecos: Object.freeze(huecos) }
}

/**
 * EL ESTADO DE UNA COMPOSICIÓN Y EL COSTO QUE PUBLICA. PURA.
 *
 * `estadoDeclarado` es lo que dice la base (VALIDADO / HISTORICO / CANDIDATO). Los huecos sólo
 * pueden EMPEORARLO: una composición marcada VALIDADO a la que le falta un cajón es INCOMPLETO, no
 * VALIDADO. Al revés no ocurre nunca — no hay forma de que la ausencia de huecos ascienda a nadie,
 * porque «no le encontré nada» no es «alguien la aprobó».
 */
export function evaluarComposicion(composicion, { complementos = [], estadoDeclarado = ESTADO_BM.HISTORICO } = {}) {
  const { cajones, huecos } = huecosDe(composicion, { complementos })
  const estado = huecos.length ? ESTADO_BM.INCOMPLETO : estadoDeclarado
  const publicado = costoQuePublica(estado, composicion?.costoDirecto ?? null)
  return Object.freeze({
    codigo: composicion?.codigo ?? null,
    nombre: composicion?.nombre ?? null,
    unidad: composicion?.unidad ?? null,
    cajones,
    huecos,
    estado,
    estadoDeclarado,
    costoDirecto: publicado.costo,
    // El costo que la base tiene cargado, para poder MOSTRAR de cuánto se está hablando sin que
    // ese número entre a ninguna suma. Sin esto, un hueco es una advertencia sin tamaño.
    costoDeReferencia: composicion?.costoDirecto ?? null,
    estadoDelDato: publicado.estadoDelDato,
    porQue: huecos.length ? huecos.map((h) => h.porQue).join(' · ') : publicado.porQue,
  })
}

/**
 * LOS PARES DE PARTIDAS QUE SON DOS MITADES DE LA MISMA. PURA.
 *
 * Dos partidas son complementarias cuando comparten raíz comercial, comparten unidad, y CADA UNA
 * declara en su nombre un alcance parcial DISTINTO. Las tres condiciones son evidencia leída del
 * catálogo; ninguna es un umbral.
 *
 * Lo que NO devuelve, a propósito: un par que comparte raíz y unidad pero donde ninguna declara
 * alcance parcial. Eso no es un complemento, es un posible duplicado de la Base Maestra —otra cosa,
 * con otra respuesta— y sale por `paresSospechosos`.
 */
export function paresComplementarios(tareaTipos = []) {
  const porClave = new Map()
  for (const t of tareaTipos) {
    const alcance = alcanceDeclarado(t?.nombre)
    if (!alcance) continue
    const clave = `${raizComercial(t?.nombre)}|${String(t?.unidad ?? '').toUpperCase()}`
    if (!porClave.has(clave)) porClave.set(clave, [])
    porClave.get(clave).push({ codigo: t.codigo, nombre: t.nombre, unidad: t.unidad, cajonDeclarado: alcance.cajon })
  }
  const pares = []
  for (const [clave, miembros] of porClave) {
    if (miembros.length < 2) continue
    if (new Set(miembros.map((m) => m.cajonDeclarado)).size < 2) continue
    pares.push(Object.freeze({
      raiz: clave.split('|')[0],
      unidad: clave.split('|')[1],
      miembros: Object.freeze([...miembros].sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)))),
    }))
  }
  return Object.freeze(pares.sort((a, b) => a.raiz.localeCompare(b.raiz)))
}

/** Los complementos de un código concreto. PURA. */
export function complementosDe(codigo, pares) {
  const par = pares.find((p) => p.miembros.some((m) => String(m.codigo) === String(codigo)))
  if (!par) return []
  return par.miembros.filter((m) => String(m.codigo) !== String(codigo))
}

/**
 * PARTIDAS QUE COMPARTEN RAÍZ Y UNIDAD SIN DECLARAR ALCANCES DISTINTOS. PURA.
 *
 * No se resuelven solas y no se fusionan: se REPORTAN. O hay un atributo técnico que las separa y
 * falta escribirlo en el nombre, o son la misma partida cargada dos veces — y las dos cosas las
 * arregla una persona en la Base Maestra, no el motor en tiempo de cotización.
 */
export function paresSospechosos(tareaTipos = []) {
  const porClave = new Map()
  for (const t of tareaTipos) {
    if (alcanceDeclarado(t?.nombre)) continue
    const clave = `${raizComercial(t?.nombre)}|${String(t?.unidad ?? '').toUpperCase()}`
    if (!porClave.has(clave)) porClave.set(clave, [])
    porClave.get(clave).push({ codigo: t.codigo, nombre: t.nombre, unidad: t.unidad })
  }
  return Object.freeze([...porClave.entries()]
    .filter(([, m]) => m.length > 1)
    .map(([clave, m]) => Object.freeze({
      raiz: clave.split('|')[0],
      unidad: clave.split('|')[1],
      codigos: Object.freeze(m.map((x) => x.codigo).sort()),
      porQue: 'comparten raíz y unidad y ninguna declara un alcance parcial: o falta el atributo que las separa en el nombre, o es la misma partida cargada dos veces',
    }))
    .sort((a, b) => a.raiz.localeCompare(b.raiz)))
}
