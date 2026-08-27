// EL PLANO DIBUJA EL ELEMENTO TERMINADO; LA OBRA CUESTA EL PROCESO. Puro.
//
// ═══ QUÉ FALTA CUANDO EL CÓMPUTO ESTÁ BIEN ═══
//
// Un plano dice «BASE B1, 1,50 × 1,50 × 0,40». El cómputo saca 0,90 m³ y no se equivoca en nada.
// Pero para que esos 0,90 m³ existan en la realidad hubo que replantear, excavar, preparar el
// fondo, colar hormigón de limpieza, armar, encofrar, hormigonar, curar, desencofrar, rellenar y
// compactar. Un presupuesto con la base y sin la excavación está mal por omisión, y la omisión no
// se ve: el total sale, cierra y es bajo.
//
// ═══ POR QUÉ ESTO NO LO IMPROVISA UN MODELO ═══
//
// Un modelo al que se le pregunta «¿qué más hace falta?» contesta distinto cada vez, y contesta
// bien casi siempre — que es la peor combinación posible: no se puede auditar, no se puede repetir
// y no se puede discutir. Estas derivaciones son REGLAS con condición, tarea, unidad, origen y
// estado. Se leen, se corrigen y se versionan.
//
// ═══ NADA SE AGREGA SOLO ═══
//
// Todo lo que sale de acá nace `PENDIENTE_CONFIRMACION`. La regla propone la tarea y dice por qué;
// confirmarla es de una persona, y decir que no corresponde también —y esa respuesta queda escrita,
// que es la diferencia entre una exclusión y un olvido.
//
// ═══ DE DÓNDE SALE CADA REGLA ═══
//
// `EXPERIENCIA_ECSAS` no aparece en este archivo, y no es un descuido: ECSAS todavía no tiene ese
// conocimiento escrito en una fuente que se pueda citar. Lo que hay es CIRCOT —el Modelo III lista
// REPLANTEO, EXCAVACIÓN y HORMIGÓN DE LIMPIEZA como partidas propias de un galpón, y la tabla de
// mano de obra lista ENCOFRADO, CURADO y COMPACTACIÓN— y práctica constructiva general. Cuando
// ECSAS registre la suya, gana la de ECSAS y estas reglas pasan a ser el piso.

import { SISTEMA } from './interpretar.mjs'
import { FUENTE } from './fuente.mjs'

/** De dónde sale la afirmación «esto también hay que hacerlo». */
export const ORIGEN = Object.freeze({
  EXPERIENCIA_ECSAS: 'EXPERIENCIA_ECSAS',
  REFERENCIA_CIRCOT: 'REFERENCIA_CIRCOT',
  PRACTICA_CONSTRUCTIVA: 'PRACTICA_CONSTRUCTIVA',
  NORMA: 'NORMA',
})

/** El estado de una tarea derivada. Nace pendiente SIEMPRE. */
export const ESTADO_PROCESO = Object.freeze({
  PENDIENTE_CONFIRMACION: 'PENDIENTE_CONFIRMACION',
  CONFIRMADO: 'CONFIRMADO',
  NO_APLICA: 'NO_APLICA',
  FALTA_DATO: 'FALTA_DATO',
})

const redondear = (n) => Math.round(n * 10000) / 10000

/** Cómo se saca la cantidad de la tarea derivada a partir de la geometría del elemento. Cada una
 *  devuelve `{ valor, formula, entradas }` o `null` cuando falta una dimensión — y `null` NO es
 *  cero: es la razón por la que la tarea sale con la cantidad abierta. */
const DERIVAR = Object.freeze({
  /** El área en planta: lo que hay que replantear, limpiar y sobre lo que se cuela el H° de limpieza. */
  planta: (d) => (d?.largo != null && d?.ancho != null
    ? { valor: redondear(d.largo * d.ancho), formula: 'largo × ancho', entradas: { largo: d.largo, ancho: d.ancho } }
    : null),
  /** La superficie lateral que hay que encofrar: perímetro × altura. */
  lateral: (d) => (d?.largo != null && d?.ancho != null && d?.alto != null
    ? { valor: redondear(2 * (d.largo + d.ancho) * d.alto), formula: '2 × (largo + ancho) × alto', entradas: { largo: d.largo, ancho: d.ancho, alto: d.alto } }
    : null),
  /** El volumen del propio elemento, que es lo que se hormigona. */
  volumen: (d) => (d?.largo != null && d?.ancho != null && d?.alto != null
    ? { valor: redondear(d.largo * d.ancho * d.alto), formula: 'largo × ancho × alto', entradas: { largo: d.largo, ancho: d.ancho, alto: d.alto } }
    : null),
})

/** Las dimensiones del elemento, en la forma que esperan los derivadores. PURA. */
export function dimensionesDe(computo) {
  const d = computo?.dimensiones ?? {}
  const num = (x) => (typeof x === 'object' && x !== null ? (Number.isFinite(Number(x.valor)) ? Number(x.valor) : null) : (Number.isFinite(Number(x)) ? Number(x) : null))
  return { largo: num(d.largo ?? d.largo_m), ancho: num(d.ancho ?? d.ancho_m), alto: num(d.alto ?? d.alto_m ?? d.espesor ?? d.espesor_m) }
}

/** ¿El nombre del elemento dice que es una fundación? PURA. */
const esFundacion = (t) => /\b(base|bases|zapata|platea|cabezal|cimiento|viga\s+de\s+fundaci|pilote)/i.test(String(t ?? ''))
/** ¿Es una estructura de hormigón sobre nivel? PURA. */
const esEstructura = (t) => /\b(columna|viga|losa|tabique|dintel|encadenado|escalera)/i.test(String(t ?? ''))

/**
 * LAS REGLAS. Cada una dice CUÁNDO se dispara, QUÉ tareas trae y POR QUÉ.
 *
 * `derivar` nombra el derivador de cantidad; sin él, o cuando el derivador no puede, la tarea sale
 * con `FALTA_DATO` y con quién tiene el dato. `sinCantidad` marca las que dependen de un criterio
 * que no está en el plano —el sobreancho de excavación, la cuantía de armadura— y que por lo tanto
 * NO se puede derivar por más geometría que haya: eso lo define la dirección técnica.
 */
export const REGLAS = Object.freeze([
  {
    id: 'FUNDACION_HORMIGON',
    cuando: (c) => c?.sistema === SISTEMA.HORMIGON_ARMADO && esFundacion(c?.nombre),
    porQue: 'una fundación de hormigón no es una partida: es una secuencia que empieza en el replanteo y termina en el relleno compactado',
    tareas: [
      { tarea: 'Replanteo', unidad: 'm2', derivar: 'planta', origen: ORIGEN.REFERENCIA_CIRCOT, cita: 'CIRCOT Modelo III, partida 1' },
      { tarea: 'Excavación de bases y zanjas', unidad: 'm3', sinCantidad: 'el volumen a excavar incluye el sobreancho de trabajo y el talud, que los define la dirección técnica y no el plano', origen: ORIGEN.REFERENCIA_CIRCOT, cita: 'CIRCOT Modelo III, partida 2' },
      { tarea: 'Hormigón de limpieza', unidad: 'm2', derivar: 'planta', origen: ORIGEN.REFERENCIA_CIRCOT, cita: 'CIRCOT Modelo III, partida 3 — e = 0,05 m' },
      { tarea: 'Armadura elaborada y colocada', unidad: 'kg', sinCantidad: 'sin la cuantía (kg/m³) o la planilla de doblado no hay kilos que computar', origen: ORIGEN.REFERENCIA_CIRCOT, cita: 'CIRCOT MO julio 2026 — «Hierro sobre encofrado»' },
      { tarea: 'Encofrado', unidad: 'm2', derivar: 'lateral', origen: ORIGEN.REFERENCIA_CIRCOT, cita: 'CIRCOT MO julio 2026 — «Encofrado p/superficie mojada»' },
      { tarea: 'Hormigonado', unidad: 'm3', derivar: 'volumen', origen: ORIGEN.PRACTICA_CONSTRUCTIVA, cita: 'es el elemento mismo' },
      { tarea: 'Curado', unidad: 'm2', derivar: 'planta', origen: ORIGEN.REFERENCIA_CIRCOT, cita: 'CIRCOT MO julio 2026 — «Curado Hormigón. MO»' },
      { tarea: 'Relleno y compactación', unidad: 'm3', sinCantidad: 'es el volumen excavado menos el ocupado, y el excavado todavía no está definido', origen: ORIGEN.REFERENCIA_CIRCOT, cita: 'CIRCOT MO julio 2026 — «Compactación a mano»' },
    ],
  },
  {
    id: 'ESTRUCTURA_HORMIGON',
    cuando: (c) => c?.sistema === SISTEMA.HORMIGON_ARMADO && esEstructura(c?.nombre) && !esFundacion(c?.nombre),
    porQue: 'una columna o una viga de hormigón se arma, se encofra, se cuela, se cura y se desencofra',
    tareas: [
      { tarea: 'Armadura elaborada y colocada', unidad: 'kg', sinCantidad: 'sin cuantía ni planilla de doblado no hay kilos', origen: ORIGEN.REFERENCIA_CIRCOT, cita: 'CIRCOT MO julio 2026 — «Hierro sobre encofrado»' },
      { tarea: 'Encofrado', unidad: 'm2', derivar: 'lateral', origen: ORIGEN.REFERENCIA_CIRCOT, cita: 'CIRCOT MO julio 2026' },
      { tarea: 'Hormigonado', unidad: 'm3', derivar: 'volumen', origen: ORIGEN.PRACTICA_CONSTRUCTIVA, cita: 'es el elemento mismo' },
      { tarea: 'Elevación del hormigón', unidad: 'm3', derivar: 'volumen', origen: ORIGEN.REFERENCIA_CIRCOT, cita: 'CIRCOT MO julio 2026 — «Col. Hormigón. MO s/ elevación»: el precio del hormigón NO incluye subirlo' },
      { tarea: 'Curado', unidad: 'm2', derivar: 'lateral', origen: ORIGEN.REFERENCIA_CIRCOT, cita: 'CIRCOT MO julio 2026' },
      { tarea: 'Desencofrado', unidad: 'm2', derivar: 'lateral', origen: ORIGEN.PRACTICA_CONSTRUCTIVA, cita: 'todo lo que se encofra se desencofra' },
    ],
  },
  {
    id: 'ESTRUCTURA_METALICA',
    cuando: (c) => c?.sistema === SISTEMA.METALICA,
    porQue: 'una pieza metálica se fabrica en taller, se protege, se transporta, se iza y se monta — y el plano sólo muestra la pieza montada',
    tareas: [
      { tarea: 'Provisión y fabricación en taller', unidad: 'kg', sinCantidad: 'sin el peso por metro del perfil no hay kilos: el plano da la longitud, no la masa', origen: ORIGEN.PRACTICA_CONSTRUCTIVA, cita: 'la partida metálica se cotiza por peso' },
      { tarea: 'Tratamiento anticorrosivo', unidad: 'm2', sinCantidad: 'la superficie a pintar sale del perímetro desarrollado del perfil, que no está en el plano de arquitectura', origen: ORIGEN.REFERENCIA_CIRCOT, cita: 'CIRCOT M3, planilla de locales: «1 mano de antióxido, 2 manos de esmalte sintético»' },
      { tarea: 'Transporte a obra', unidad: 'gl', sinCantidad: 'depende de la distancia y del tamaño de la pieza', origen: ORIGEN.PRACTICA_CONSTRUCTIVA, cita: 'una cercha entera no viaja como un perfil suelto' },
      { tarea: 'Izaje y montaje', unidad: 'gl', sinCantidad: 'depende del equipo de izaje que se decida', origen: ORIGEN.PRACTICA_CONSTRUCTIVA, cita: 'el montaje de estructura pesada necesita grúa o pluma' },
    ],
  },
  {
    id: 'MAMPOSTERIA',
    cuando: (c) => c?.sistema === SISTEMA.MAMPOSTERIA,
    porQue: 'un muro apoyado en fundación lleva capa aisladora, y los vanos llevan dinteles',
    tareas: [
      { tarea: 'Capa aisladora horizontal bajo muro', unidad: 'm2', sinCantidad: 'es el desarrollo del muro en su arranque, no su superficie vista', origen: ORIGEN.REFERENCIA_CIRCOT, cita: 'CIRCOT Modelo III, partida 13' },
      { tarea: 'Dinteles sobre vanos', unidad: 'm', sinCantidad: 'hay que contar los vanos del muro y su luz', origen: ORIGEN.PRACTICA_CONSTRUCTIVA, cita: 'todo vano en muro portante lleva dintel' },
    ],
  },
  {
    id: 'CUBIERTA',
    cuando: (c) => c?.sistema === SISTEMA.CUBIERTA,
    porQue: 'una cubierta no termina en la chapa: hay que desagotar el agua y cerrar los bordes',
    tareas: [
      { tarea: 'Canaletas y bajadas pluviales', unidad: 'm', sinCantidad: 'depende del perímetro de desagüe y de la pendiente, que se leen del plano de techos', origen: ORIGEN.PRACTICA_CONSTRUCTIVA, cita: 'una cubierta sin desagüe no está terminada' },
      { tarea: 'Cenefas y cierres de borde', unidad: 'm', sinCantidad: 'es el perímetro de la cubierta', origen: ORIGEN.PRACTICA_CONSTRUCTIVA, cita: 'el borde de chapa se cierra' },
      { tarea: 'Aislación térmica', unidad: 'm2', sinCantidad: 'depende de si el pliego la pide: en un galpón puede no ir', origen: ORIGEN.REFERENCIA_CIRCOT, cita: 'CIRCOT MO julio 2026 — «Aisl. Térmica piedra pómez»' },
    ],
  },
])

/**
 * LOS PROCESOS QUE UN ELEMENTO ARRASTRA. PURA.
 *
 * `yaComputadas` son los nombres de tareas que el proyecto ya tiene: lo que ya está no se vuelve a
 * proponer. `respuestas` son las decisiones tomadas, por `id de regla + tarea`.
 */
export function procesosDe(computo, { yaComputadas = [], respuestas = {} } = {}) {
  const dim = dimensionesDe(computo)
  const hechas = yaComputadas.map((t) => String(t).toLowerCase())
  const salida = []
  for (const regla of REGLAS) {
    if (!regla.cuando(computo)) continue
    for (const t of regla.tareas) {
      const clave = `${regla.id}:${t.tarea}`
      if (hechas.some((h) => h.includes(t.tarea.toLowerCase().split(' ')[0]))) continue
      const derivada = t.sinCantidad ? null : DERIVAR[t.derivar]?.(dim) ?? null
      salida.push({
        elemento: computo?.id ?? null,
        regla: regla.id,
        tarea: t.tarea,
        unidad: t.unidad,
        estado: respuestas[clave] ?? ESTADO_PROCESO.PENDIENTE_CONFIRMACION,
        cantidad: derivada?.valor ?? null,
        formula: derivada?.formula ?? null,
        entradas: derivada?.entradas ?? null,
        fuente: derivada ? FUENTE.CALCULADO : FUENTE.FALTA_DATO,
        porQueFalta: derivada ? null : (t.sinCantidad ?? 'faltan dimensiones del elemento para derivar la cantidad'),
        quienLoTiene: derivada ? null : 'dirección técnica / proyecto',
        origen: t.origen,
        cita: t.cita,
        porQueLaRegla: regla.porQue,
      })
    }
  }
  return salida
}

/** Los procesos de todos los elementos, con el recuento de lo que quedó abierto. PURA. */
export function procesosDeTodos(computos = [], opciones = {}) {
  const procesos = computos.flatMap((c) => procesosDe(c, opciones))
  return {
    procesos,
    pendientes: procesos.filter((p) => p.estado === ESTADO_PROCESO.PENDIENTE_CONFIRMACION).length,
    sinCantidad: procesos.filter((p) => p.cantidad === null).length,
    conCantidad: procesos.filter((p) => p.cantidad !== null).length,
  }
}
