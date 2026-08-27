// EL MODELO III DEL CIRCOT — GALPÓN INDUSTRIAL. Puro. Estructura constructiva, no precios.
//
// ═══ QUÉ SE TOMÓ DE ESTA PUBLICACIÓN Y QUÉ SE DEJÓ ═══
//
// `AGOSTO_2026_M3_CIRCOT.pdf` computa un galpón industrial de 543 m² con 25 partidas, sus unidades,
// sus cantidades, la incidencia de cada una sobre el costo directo y la partición mano de obra /
// materiales. Eso —LA ESTRUCTURA— es conocimiento constructivo y no caduca: un galpón sigue
// necesitando replanteo, bases, vigas de encadenado y techo metálico el mes que viene.
//
// LOS $ SÍ CADUCAN, y por eso acá no hay un solo peso. Lo que se guarda es qué partidas existen, en
// qué unidad se miden, cuánto pesan una respecto de otra y cuánto de cada una es mano de obra.
//
// ═══ NO ES «SI ES GALPÓN, AGREGÁ TODO ESTO» ═══
//
// Es una lista de VERIFICACIONES: si la obra es un galpón industrial, cada una de estas 25 líneas
// tiene que terminar en un estado escrito. Que el proyecto no tenga sanitario es una respuesta
// perfectamente válida —NO_APLICA— y queda registrada. Lo que no puede pasar es que la partida no
// esté y nadie se haya hecho la pregunta.
//
// ═══ EL DATO QUE NO CIERRA, DECLARADO ═══
//
// La cascada de la página 3 tiene una contradicción INTERNA: dice «6% DE MANO DE OBRA» para dos
// renglones cuyos importes son, contra la mano de obra que la propia publicación declara (51,75%
// del costo directo), 0,2% y 0,5%. No se corrige ni se elige uno: se registra como CONFLICTO y se
// reproduce el número impreso, que es el que la publicación efectivamente usó.

import { piezaDe } from '../plano/atributos.mjs'

/** Los tres bloques del cómputo del Modelo III, con su peso sobre el costo directo. */
export const GRUPO = Object.freeze({ OBRA_GRUESA: 'OBRA_GRUESA', TERMINACIONES: 'TERMINACIONES', INSTALACIONES: 'INSTALACIONES' })

/** El peso de cada bloque, tal como lo imprime la página 4. */
export const PESO_GRUPO = Object.freeze({ OBRA_GRUESA: 95.5, TERMINACIONES: 2.1, INSTALACIONES: 2.4 })

/** La incidencia global mano de obra / materiales del modelo, página 4. */
export const INCIDENCIA_GLOBAL = Object.freeze({ mano_obra: 51.75, materiales: 48.25 })

/** La obra de referencia sobre la que están medidas todas las cantidades. Sin esto, «58,52 m³ de
 *  excavación» no significa nada: son 58,52 m³ PARA 543 m² cubiertos. */
export const OBRA_REFERENCIA = Object.freeze({
  tipo: 'GALPON_INDUSTRIAL',
  superficie_m2: 543,
  fecha: '2026-08-05',
  fuente: 'CIRCOT · ÍNDICE CIRCOT MODELO III — Galpón Industrial, FI-UNSJ',
  archivo: 'AGOSTO_2026_M3_CIRCOT.pdf',
  clasificacion: 'REFERENCIA_EXTERNA_LOCAL',
})

/**
 * LAS 25 PARTIDAS. `cantidad` es para los 543 m² de referencia; `porM2` permite escalar a otra
 * superficie —con la advertencia de que escalar linealmente una obra es una ESTIMACIÓN, no un
 * cómputo, y el circuito de XSAS la marca como tal—.
 * `incidencia` es el % sobre costo directo; `mo` el % de mano de obra dentro de la propia partida.
 */
export const MODELO_III = Object.freeze([
  { n: 1, partida: 'REPLANTEO', unidad: 'm2', cantidad: 543.0, incidencia: 0.33, mo: 100.0, grupo: GRUPO.OBRA_GRUESA },
  { n: 2, partida: 'EXC. BASES Y ZANJAS CIMIENTOS', unidad: 'm3', cantidad: 58.52, incidencia: 0.82, mo: 100.0, grupo: GRUPO.OBRA_GRUESA },
  { n: 3, partida: 'HORMIGON DE LIMPIEZA - e = 0,05 m', unidad: 'm2', cantidad: 55.4, incidencia: 0.29, mo: 54.59, grupo: GRUPO.OBRA_GRUESA },
  { n: 4, partida: 'CONTRAPISO ARMADO #4,2 e = 0,10 m', unidad: 'm2', cantidad: 543.0, incidencia: 12.15, mo: 36.68, grupo: GRUPO.OBRA_GRUESA },
  { n: 5, partida: 'HORMIGON CICLOPEO PARA CIMIENTO', unidad: 'm3', cantidad: 31.92, incidencia: 1.92, mo: 38.27, grupo: GRUPO.OBRA_GRUESA },
  { n: 6, partida: 'BASES AISLADAS', unidad: 'm3', cantidad: 10.5, incidencia: 1.63, mo: 54.19, grupo: GRUPO.OBRA_GRUESA },
  { n: 7, partida: 'VIGAS VA - VF', unidad: 'm3', cantidad: 5.71, incidencia: 1.65, mo: 54.46, grupo: GRUPO.OBRA_GRUESA },
  { n: 8, partida: 'VIGAS Y MUERTO DE ANCLAJE', unidad: 'm3', cantidad: 23.5, incidencia: 10.56, mo: 38.61, grupo: GRUPO.OBRA_GRUESA },
  { n: 9, partida: 'VIGAS ENCADENADO SUP.', unidad: 'm3', cantidad: 11.25, incidencia: 6.37, mo: 35.7, grupo: GRUPO.OBRA_GRUESA },
  { n: 10, partida: 'COLUMNAS DE ENCADENADO', unidad: 'm3', cantidad: 0.44, incidencia: 0.13, mo: 54.59, grupo: GRUPO.OBRA_GRUESA },
  { n: 11, partida: 'COLUMNAS DE CARGA', unidad: 'm3', cantidad: 10.0, incidencia: 4.08, mo: 41.02, grupo: GRUPO.OBRA_GRUESA },
  { n: 12, partida: 'BASE DE TANQUE', unidad: 'm3', cantidad: 0.24, incidencia: 0.08, mo: 58.58, grupo: GRUPO.OBRA_GRUESA },
  { n: 13, partida: 'CAPA AISLADORA HORIZONTAL EN MURO', unidad: 'm2', cantidad: 28.63, incidencia: 0.18, mo: 73.26, grupo: GRUPO.OBRA_GRUESA },
  { n: 14, partida: 'MAMPOSTERIA LADRILLO CERAM. e = 0,20 m', unidad: 'm2', cantidad: 570.0, incidencia: 11.17, mo: 63.88, grupo: GRUPO.OBRA_GRUESA },
  { n: 15, partida: 'LOSA CERAMICA', unidad: 'm2', cantidad: 2.89, incidencia: 0.16, mo: 47.34, grupo: GRUPO.OBRA_GRUESA },
  { n: 16, partida: 'TECHO METÁLICO', unidad: 'm2', cantidad: 647.08, incidencia: 43.98, mo: 59.01, grupo: GRUPO.OBRA_GRUESA },
  { n: 17, partida: 'CIELORRASO AL YESO', unidad: 'm2', cantidad: 2.89, incidencia: 0.05, mo: 83.38, grupo: GRUPO.TERMINACIONES },
  { n: 18, partida: 'REVEST. CERÁMICO, INCLUIDO JAHARRO', unidad: 'm2', cantidad: 8.5, incidencia: 0.27, mo: 77.89, grupo: GRUPO.TERMINACIONES },
  { n: 19, partida: 'PISO CERÁMICO DE 0,15x0,15 m', unidad: 'm2', cantidad: 2.89, incidencia: 0.05, mo: 79.87, grupo: GRUPO.TERMINACIONES },
  { n: 20, partida: 'PINTURA AL LATEX EN CIELORRASO', unidad: 'm2', cantidad: 2.89, incidencia: 0.02, mo: 74.42, grupo: GRUPO.TERMINACIONES },
  { n: 21, partida: 'PINTURA AL ESMALTE EN CARPINTERIA', unidad: 'm2', cantidad: 62.6, incidencia: 0.62, mo: 61.32, grupo: GRUPO.TERMINACIONES },
  { n: 22, partida: 'CARPINTERIA', unidad: 'gl', cantidad: 1.0, incidencia: 1.1, mo: 14.74, grupo: GRUPO.TERMINACIONES },
  { n: 23, partida: 'INSTALACION ELECTRICA', unidad: 'gl', cantidad: 1.0, incidencia: 0.96, mo: 42.69, grupo: GRUPO.INSTALACIONES },
  { n: 24, partida: 'INSTALACION SANITARIA', unidad: 'gl', cantidad: 1.0, incidencia: 0.89, mo: 62.58, grupo: GRUPO.INSTALACIONES },
  { n: 25, partida: 'INSTALACION DE GAS', unidad: 'gl', cantidad: 1.0, incidencia: 0.55, mo: 40.04, grupo: GRUPO.INSTALACIONES },
])

/** Los estados posibles de una línea del checklist. `PENDIENTE_CONFIRMACION` es el estado inicial:
 *  todo empieza sin contestar, y no contestar es un resultado visible. */
export const ESTADO_CHECK = Object.freeze({
  CONFIRMADO: 'CONFIRMADO',                     // el proyecto la tiene computada
  APLICA: 'APLICA',                             // corresponde y NO está: es una omisión
  NO_APLICA: 'NO_APLICA',                       // alguien dijo que no corresponde, y quedó escrito
  FALTA_DATO: 'FALTA_DATO',                     // no se puede saber sin un dato que no está
  PENDIENTE_CONFIRMACION: 'PENDIENTE_CONFIRMACION',
})

/** Las partidas del Modelo III que dependen de que el galpón tenga sanitario. Un galpón sin
 *  sanitario no lleva ninguna de éstas, y un galpón con sanitario las lleva todas: por eso una
 *  sola respuesta destraba seis líneas en vez de seis preguntas sueltas. */
const DEPENDEN_DE_SANITARIO = new Set([15, 17, 18, 19, 20, 24])
const DEPENDEN_DE_TANQUE = new Set([12])
const DEPENDEN_DE_GAS = new Set([25])

/** Qué condición gobierna cada línea, y qué hay que saber para contestarla. PURA. */
export function condicionDe(item) {
  if (DEPENDEN_DE_SANITARIO.has(item.n)) return { condicion: 'el galpón tiene núcleo sanitario / oficina', dato: 'sanitario' }
  if (DEPENDEN_DE_TANQUE.has(item.n)) return { condicion: 'el galpón lleva tanque de reserva elevado', dato: 'tanque' }
  if (DEPENDEN_DE_GAS.has(item.n)) return { condicion: 'el galpón lleva instalación de gas', dato: 'gas' }
  return { condicion: 'siempre en un galpón industrial', dato: null }
}

/**
 * EL CHECKLIST CONTRA UN PROYECTO. PURA.
 *
 * `computadas` son las partidas que el proyecto YA tiene (se comparan por vocabulario del nombre).
 * `respuestas` son las decisiones ya tomadas por una persona: `{ sanitario: false }`, o por número
 * de línea `{ 12: 'NO_APLICA' }`. Nada se decide solo: sin respuesta, la línea queda pendiente y se
 * ve.
 */
export function evaluarChecklist({ computadas = [], respuestas = {} } = {}) {
  const dicho = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const presentes = computadas.map((c) => (typeof c === 'string' ? { nombre: c, unidad: null } : { nombre: c?.nombre, unidad: c?.unidad ?? null }))
    .map((c) => ({ texto: dicho(c.nombre), pieza: piezaDe(c.nombre)?.valor ?? null, unidad: String(c.unidad ?? '').toLowerCase() }))
  return MODELO_III.map((item) => {
    const { condicion, dato } = condicionDe(item)
    const clave = dicho(item.partida).split(/[^a-z0-9]+/).filter((w) => w.length > 4)
    // ═══ POR QUÉ NO ALCANZA COMPARAR PALABRAS ═══
    // «BASES AISLADAS» y «Base de hormigón armado tipo B0» comparten UNA palabra de cinco; «TECHO
    // METÁLICO» y «Techo de chapa metálica» comparten una de tres. Con un umbral de palabras las
    // dos salían APLICA —«corresponde y no está»— estando computadas: el checklist gritaba por
    // partidas que sí estaban, que es la forma más rápida de que se lo deje de mirar.
    // El tipo de pieza más la unidad las reconoce sin ambigüedad, y es el mismo atributo
    // determinístico con el que se eligen las partidas.
    const pieza = piezaDe(item.partida)?.valor ?? null
    const porPieza = pieza !== null && presentes.some((p) => p.pieza === pieza && (!p.unidad || !item.unidad || p.unidad === item.unidad))
    const yaEsta = porPieza || (clave.length > 0 && presentes.some((p) => clave.filter((w) => p.texto.includes(w)).length >= Math.min(2, clave.length)))
    const manual = respuestas[item.n]
    if (manual) return { ...item, condicion, estado: manual, porQue: 'respondido explícitamente para este proyecto' }
    if (yaEsta) return { ...item, condicion, estado: ESTADO_CHECK.CONFIRMADO, porQue: 'el proyecto ya la tiene computada' }
    if (dato && respuestas[dato] === false) return { ...item, condicion, estado: ESTADO_CHECK.NO_APLICA, porQue: `se respondió que ${condicion} es falso` }
    if (dato && respuestas[dato] === undefined) return { ...item, condicion, estado: ESTADO_CHECK.FALTA_DATO, porQue: `depende de si ${condicion}, y eso no está definido`, pregunta: `¿${condicion}?` }
    return { ...item, condicion, estado: ESTADO_CHECK.APLICA, porQue: 'corresponde a todo galpón industrial y el proyecto no la tiene', pregunta: `¿Por qué no está «${item.partida}» (${item.unidad})?` }
  })
}

/**
 * LAS PREGUNTAS AGRUPADAS. PURA.
 *
 * Devolver 25 preguntas sueltas es tirarle el problema al que preguntó. Tres respuestas —sanitario,
 * tanque, gas— destraban ocho líneas del checklist, así que primero van esas y después las
 * individuales. Es el mínimo conjunto de decisiones que destraba la mayor cantidad de partidas.
 */
export function preguntasAgrupadas(evaluado = []) {
  const porDato = new Map()
  const sueltas = []
  for (const l of evaluado) {
    if (l.estado !== ESTADO_CHECK.FALTA_DATO && l.estado !== ESTADO_CHECK.APLICA) continue
    const dato = condicionDe(l).dato
    if (!dato) { sueltas.push({ linea: l.n, partida: l.partida, unidad: l.unidad, pregunta: l.pregunta }); continue }
    const g = porDato.get(dato) ?? { dato, pregunta: `¿${l.condicion}?`, destraba: [] }
    g.destraba.push(l.partida)
    porDato.set(dato, g)
  }
  return {
    decisiones: [...porDato.values()].sort((a, b) => b.destraba.length - a.destraba.length),
    individuales: sueltas,
    total: porDato.size + sueltas.length,
  }
}

/** La cascada de la página 3, con los porcentajes tal como los imprime la publicación. */
export const CASCADA_M3 = Object.freeze({
  gco_obrador_pct_cd: 0.5,
  gip_funcionamiento_pct_mo_declarado: 6.0,
  gip_herramientas_pct_mo_declarado: 6.0,
  gastos_generales_pct_cd: 5.8,
  gastos_financieros_pct_cd: 0.5,
  utilidad_pct_costo_obra: 10.0,
  impuestos_pct_ingreso: 23.0,
  impuestos_detalle: { ingresos_brutos_pct: 2.0, iva_pct: 21.0 },
  nota: 'porcentajes INDICATIVOS de la publicación: «cada usuario deberá calcularlos según las características de su propia obra y empresa»',
})

/**
 * EL CONFLICTO INTERNO DE LA CASCADA, DECLARADO Y NO RESUELTO.
 *
 * Con CD = 227.709.122,22 y mano de obra al 51,75% (los dos números son de la publicación), el 6%
 * de mano de obra da 7.070.368. Los renglones impresos dicen 235.669,32 y 589.173,31, que son el
 * 0,2% y el 0,5% de esa misma mano de obra. El total sí cierra con los importes impresos, así que
 * lo que está viejo es la ETIQUETA, no el número — pero eso es una conclusión, no un hecho, y por
 * eso queda como conflicto abierto y no como corrección aplicada.
 */
export const CONFLICTO_CASCADA = Object.freeze({
  que: 'los dos renglones de G.I.P. dicen «6% DE MANO DE OBRA» y los importes impresos equivalen al 0,2% y al 0,5%',
  documento: 'AGOSTO_2026_M3_CIRCOT.pdf, página 3',
  importes: { funcionamiento_obrador: 235669.32, herramientas_menores: 589173.31 },
  seisPorCientoDeLaMoDeclarada: 7070367.9,
  resolucion: 'SIN RESOLVER — se reproduce el importe impreso porque es el que la publicación usó para llegar a su propio total',
})

/**
 * REPRODUCIR LA CASCADA DEL CIRCOT. PURA. Devuelve `precioReferenciaCIRCOT`, NUNCA `precio`.
 *
 * El nombre del campo no es un detalle: esta función existe para VERIFICAR contra la publicación y
 * para poder decir «el CIRCOT saca $/m² así», no para poner precio a una obra de ECSAS. El margen,
 * los gastos generales y el tratamiento fiscal de ECSAS los deciden la Dirección y el criterio
 * impositivo propio, no un índice orientador de la UNSJ.
 */
export function cascadaCircot(costoDirecto, { gip_funcionamiento = 235669.32, gip_herramientas = 589173.31, c = CASCADA_M3 } = {}) {
  const cd = Number(costoDirecto)
  if (!Number.isFinite(cd) || cd <= 0) return null
  const gco = cd * (c.gco_obrador_pct_cd / 100)
  const cem = cd + gco + gip_funcionamiento + gip_herramientas
  const gg = cd * (c.gastos_generales_pct_cd / 100)
  const gf = cd * (c.gastos_financieros_pct_cd / 100)
  const costoObra = cem + gg + gf
  const utilidad = costoObra * (c.utilidad_pct_costo_obra / 100)
  const ingreso = costoObra + utilidad
  const impuestos = ingreso * (c.impuestos_pct_ingreso / 100)
  const total = ingreso + impuestos
  const r = (n) => Math.round(n * 100) / 100
  return {
    costoDirecto: r(cd), gcoObrador: r(gco), gipFuncionamiento: r(gip_funcionamiento), gipHerramientas: r(gip_herramientas),
    costoEjecucionMaterial: r(cem), gastosGenerales: r(gg), gastosFinancieros: r(gf),
    costoObra: r(costoObra), utilidad: r(utilidad), ingresoCalculado: r(ingreso), impuestos: r(impuestos),
    precioReferenciaCIRCOT: r(total),
    clasificacion: 'REFERENCIA_EXTERNA_LOCAL',
    advertencia: 'método indicativo del CIRCOT — NO es la política de margen ni el criterio fiscal de ECSAS',
    conflictos: [CONFLICTO_CASCADA],
  }
}
