// «MATERIALES A CARGO DE ARCOR». Puro, determinístico, sin modelo y sin red.
//
// ═══ EL DEFECTO MEDIDO, Y CUÁNTA PLATA MUEVE ═══
//
// En «ARSJ Planilla de computo - Filtro Sanitario ESTRUCTURAS METALICAS - FINAL FINAL.xlsx» ocho de
// los doce ítems terminan con la frase «Materiales a cargo de ARCOR» o «Paño a cargo de ARCOR». El
// cliente compra el caño estructural, la chapa y el paño de aluminio; nosotros ponemos taller,
// soldadura y montaje.
//
// El selector de partidas no lee esa frase: puntúa vocabulario y atributos técnicos. Así, el ítem
// 5.3 —«Montaje de puerta de rebatir P1 … 1,00x2,05m»— cierra contra `T1064 PUERTA 1,00x2,05 c/BA`,
// cuya composición vigente incluye la PUERTA como material. La coincidencia dimensional es real y el
// código hizo bien su trabajo; el problema es que el análisis compra una puerta que el cliente ya
// compró. **Se cotiza dos veces el mismo material y la oferta sale cara sin que nada avise.**
//
// El error es simétrico y peor en el otro sentido: si el cliente provee y nosotros igual cargamos el
// material, perdemos la licitación por caros; si alguien «corrige» borrando el material a ojo,
// perdemos el trabajo por baratos. Por eso acá **no se decide**: se declara el choque y se pregunta.
//
// ═══ LO QUE ESTE MÓDULO NO HACE, A PROPÓSITO ═══
//
// No resta el material de la composición. No inventa una variante «sólo mano de obra» de la partida.
// No baja ningún umbral. Convierte un MAPEADA silencioso en un CONFLICTO con nombre, filas y —cuando
// hay precios— la plata que está en juego. El resultado es que ARCOR queda MÁS bloqueado, no menos.
//
// ═══ POR QUÉ EL SUJETO DE LA FRASE IMPORTA ═══
//
// «Materiales a cargo de ARCOR» choca con TODA la composición. «La pintura queda a cargo de ARCOR»
// (ítem 1.8) choca sólo con la línea de pintura — y `T1028 CIELORRASO SUSPENDIDO AL YESO` no tiene
// ninguna, así que ahí no hay choque. Tratar las dos frases igual bloquearía una partida correcta, y
// un control que bloquea lo bueno se apaga a la semana. El sujeto se lee; no se supone.
//
// ═══ EL BARRIDO QUE FIJÓ EL VOCABULARIO ═══
//
// Sobre los 57 documentos de ARCOR la frase «a cargo de …» aparece con exactamente dos sujetos:
// «ARCOR» (10 veces) y «el contratista» (6, la gestión de permisos municipales). La segunda es lo
// contrario y no debe disparar nada. Los sinónimos de acá salieron de ese barrido: inventar
// variantes plausibles hace que el detector enganche donde no hay nada.

import { palabras } from '../plano/partidas.mjs'
import { raiz } from '../plano/atributos.mjs'
import { issue, TIPO_ISSUE, SEVERIDAD } from './contrato.mjs'

/** Quién provee, cuando la frase lo nombra sin nombrar al cliente. Salidos del corpus real. */
export const NOSOTROS = Object.freeze(['contratista', 'proveedor', 'empresa contratista', 'oferente', 'ecsas'])
export const EL_CLIENTE = Object.freeze(['cliente', 'comitente', 'propiedad', 'propietario', 'la planta'])

/** Sujetos que abarcan TODA la composición, no una línea. PURA. */
export const SUJETO_GENERICO = Object.freeze(['material', 'materiales', 'insumo', 'insumos', 'materiales y equipos'])

/** Sin tildes, minúsculas y con un solo espacio. PURA. */
export const normal = (v) => String(v ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * LA FRASE. Captura el sujeto (lo que está antes) y a quién se lo carga (lo que está después).
 *
 * El sujeto se recorta al arranque de la oración —punto, punto y coma, salto de línea— porque en las
 * planillas reales la frase es la última de un párrafo de 300 caracteres y todo lo anterior es la
 * descripción técnica, no el sujeto.
 */
const FRASE = /([^.;:\n·]{0,70}?)\s*(?:queda[ns]?\s+|est[aá][ns]?\s+|ser[aá][ns]?\s+)?a\s+cargo\s+de(?:l)?\s+([^.,;:\n]{1,40})/gi

/** Quién es el que provee, normalizado a CLIENTE / NOSOTROS / OTRO. PURA. */
export function quienProvee(quienLiteral, { cliente = null } = {}) {
  const q = normal(quienLiteral).replace(/^(el|la|los|las)\s+/, '')
  if (cliente && (q === normal(cliente) || q.startsWith(normal(cliente)))) return 'CLIENTE'
  if (EL_CLIENTE.some((x) => q === x || q.startsWith(x))) return 'CLIENTE'
  if (NOSOTROS.some((x) => q === x || q.startsWith(x))) return 'NOSOTROS'
  return 'OTRO'
}

/**
 * LOS SUMINISTROS QUE UN TEXTO DECLARA A CARGO DEL CLIENTE. PURA.
 *
 * Devuelve sólo los del CLIENTE. Los que quedan a cargo nuestro no son un hallazgo: son el contrato
 * normal, y meterlos en la lista haría que el 100% de los ítems «tenga suministro declarado».
 */
export function suministrosDeclarados(texto, { cliente = null } = {}) {
  const t = String(texto ?? '')
  const salida = []
  FRASE.lastIndex = 0
  let m
  while ((m = FRASE.exec(t)) !== null) {
    const quien = quienProvee(m[2], { cliente })
    if (quien !== 'CLIENTE') continue
    const sujeto = normal(m[1]).replace(/^(el|la|los|las|un|una)\s+/, '')
    salida.push({
      sujeto: sujeto || null,
      generico: SUJETO_GENERICO.includes(sujeto),
      quien: normal(m[2]),
      literal: `${m[1].trim()} a cargo de ${m[2].trim()}`.trim(),
    })
  }
  return salida
}

/** Las líneas de material de una composición que el sujeto de la frase nombra. PURA.
 *  Un sujeto genérico las nombra a todas; uno específico, sólo las que comparten una raíz. */
export function lineasAlcanzadas(sujeto, composicion = [], { generico = false } = {}) {
  const materiales = composicion.filter((l) => String(l?.tipo) === 'material')
  if (generico) return materiales
  const raices = new Set(palabras(sujeto).map(raiz))
  if (!raices.size) return []
  return materiales.filter((l) => palabras(l.nombre).map(raiz).some((w) => raices.has(w)))
}

/** Cuánto de la composición es material, en plata, con los costos que se pasen. `null` si no hay
 *  ninguno: un riesgo sin medir no es un riesgo de $ 0. PURA. */
export function plataDeLineas(lineas = [], costoPorRecurso = {}) {
  const conocidos = lineas.filter((l) => Number.isFinite(Number(costoPorRecurso[l.recursoCodigo])))
  if (!conocidos.length) return null
  return conocidos.reduce((a, l) => a + Number(costoPorRecurso[l.recursoCodigo]) * Number(l.cantidad ?? 0) * (1 + Number(l.desperdicio ?? 0)), 0)
}

/**
 * EL CHOQUE ENTRE LO QUE EL CLIENTE PROVEE Y LO QUE LA PARTIDA COMPRA. PURA.
 *
 * Devuelve siempre la misma forma. `hayChoque: false` con su motivo NO es lo mismo que `null`: el
 * primero dice «miré y no hay», el segundo diría «no miré», y un control que no puede distinguirlos
 * no puede decir que no. Ése es el defecto de los controles que sólo saben dar verde.
 */
export function choqueDeSuministro({ texto, tarea = null, composicion = [], cliente = null, costoPorRecurso = {}, cantidad = null } = {}) {
  const declarados = suministrosDeclarados(texto, { cliente })
  const base = { codigo: tarea?.codigo ?? null, declarados }
  if (!declarados.length) return { ...base, hayChoque: false, porQue: 'el ítem no declara ningún suministro a cargo del cliente' }
  const materiales = composicion.filter((l) => String(l?.tipo) === 'material')
  if (!materiales.length) {
    return { ...base, hayChoque: false, lineas: [], porQue: `el ítem declara «${declarados[0].literal}» y la composición de ${tarea?.codigo ?? 'la partida'} no tiene ninguna línea de material: no hay nada que se cotice dos veces` }
  }
  const lineas = declarados.flatMap((d) => lineasAlcanzadas(d.sujeto, materiales, { generico: d.generico }))
  const unicas = [...new Map(lineas.map((l) => [l.recursoCodigo, l])).values()]
  if (!unicas.length) {
    return { ...base, hayChoque: false, lineas: [], porQue: `el ítem declara «${declarados[0].literal}» y ninguna de las ${materiales.length} línea(s) de material de ${tarea?.codigo} nombra «${declarados[0].sujeto}»: se miró y no hay choque` }
  }
  const unitario = plataDeLineas(unicas, costoPorRecurso)
  return {
    ...base,
    hayChoque: true,
    lineas: unicas.map((l) => ({ recursoCodigo: l.recursoCodigo, nombre: l.nombre, cantidad: Number(l.cantidad) })),
    generico: declarados.some((d) => d.generico),
    plataUnitaria: unitario,
    plataEnRiesgo: unitario === null || cantidad === null ? null : unitario * Number(cantidad),
    porQue: `el ítem dice «${declarados[0].literal}» y ${tarea?.codigo} compra ${unicas.length} de esos materiales (${unicas.map((l) => l.nombre).slice(0, 3).join(', ')}${unicas.length > 3 ? '…' : ''}). Cotizarla tal cual paga dos veces el mismo material; borrarlos a ojo regala el trabajo. Lo decide el dueño, no el motor`,
  }
}

/** El choque, como issue BLOQUEANTE de la cola. PURA. */
export function issueDeSuministro(choque, { elemento = null, documento = null } = {}) {
  if (!choque?.hayChoque) return null
  return issue({
    type: TIPO_ISSUE.CONFLICTO, severity: SEVERIDAD.BLOQUEANTE,
    entity: `suministro:${elemento ?? choque.codigo}`,
    impact: choque.plataEnRiesgo,
    evidence: { documento, codigo: choque.codigo, lineas: choque.lineas, declarado: choque.declarados[0]?.literal ?? null },
    detalle: choque.porQue,
    // Ninguna acción del command layer decide quién compra el caño: eso es del contrato.
    recommended_action: null,
  })
}

/**
 * EL BARRIDO SOBRE TODOS LOS MAPEOS DE UNA PLANILLA. PURA.
 *
 * `mapeos` son los de `plano/seleccion.mjs`. Sólo se revisan los que CERRARON: un mapeo que ya está
 * abierto no necesita este control para quedar abierto, y contarlo dos veces infla el problema.
 */
export function barrerSuministros(mapeos = [], { composiciones = new Map(), cliente = null, costoPorRecurso = {}, documento = null } = {}) {
  const revisados = []
  for (const m of mapeos) {
    if (m?.estado !== 'MAPEADA' || !m.tarea) continue
    const choque = choqueDeSuministro({
      texto: m.computo?.nombre, tarea: m.tarea,
      composicion: composiciones.get?.(m.tarea.id) ?? [],
      cliente, costoPorRecurso, cantidad: m.computo?.cantidad?.valor ?? null,
    })
    revisados.push({ elemento: m.computo?.id ?? null, ...choque })
  }
  const conChoque = revisados.filter((r) => r.hayChoque)
  return {
    revisados,
    conChoque,
    issues: conChoque.map((c) => issueDeSuministro(c, { elemento: c.elemento, documento })),
    plataEnRiesgo: conChoque.some((c) => c.plataEnRiesgo !== null)
      ? conChoque.reduce((a, c) => a + (c.plataEnRiesgo ?? 0), 0)
      : null,
    porQue: `${revisados.length} partida(s) cerrada(s) revisada(s) · ${conChoque.length} con material que el cliente ya provee`,
  }
}
