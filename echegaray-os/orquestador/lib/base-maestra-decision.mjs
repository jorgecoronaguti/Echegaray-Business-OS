// LA MEMORIA DE LO QUE YA SE CONTESTÓ. El borde: acá vive el SQL, la lógica sigue siendo pura.
//
// ═══ POR QUÉ SIN ESTO EL FRENTE NO SERVÍA ═══
//
// `base-maestra-pregunta.mjs` convirtió el hueco en una pregunta contestable, y la corrida sobre el
// dictado pasó de 0/2 a 2/2 accionable. Pero la respuesta vivía en memoria: la corrida siguiente
// volvía a preguntar lo mismo. Un sistema cuyo objetivo es preguntar MENOS en cada obra que en la
// anterior no puede olvidar la respuesta apenas se la dan — y el efecto sobre la persona es peor
// que el técnico: aprende que contestar no sirve, y deja de contestar.
//
// ═══ LA REGLA QUE GOBIERNA LA LECTURA ═══
//
// Una decisión guardada cierra **la misma pregunta**, no el mismo elemento. La clave de reúso es
// (elemento normalizado, unidad, HUELLA), y la huella lleva el tipo de pregunta, el atributo que
// faltaba y los códigos que estaban sobre la mesa. Si entra una partida nueva al catálogo, cambian
// los códigos ofrecidos, cambia la huella, y se vuelve a preguntar. Preguntar de más cuesta una
// conversación; cerrar de más cuesta plata.
//
// ═══ Y LA RESPUESTA GUARDADA SE VUELVE A VALIDAR ═══
//
// `responder()` corre igual sobre la decisión leída de la base. No es redundante: es el segundo
// candado. Si la respuesta guardada ya no figura entre las opciones actuales, NO cierra el mapeo y
// se pregunta de nuevo — aunque la huella hubiera coincidido por casualidad.

import { preguntaParaCerrar, responder, huellaDePregunta, claveDeElemento } from './base-maestra-pregunta.mjs'
import { ESTADO } from './plano/seleccion.mjs'

/** Qué pasó al intentar resolver un mapeo abierto con lo que la empresa ya decidió. */
export const RESOLUCION = Object.freeze({
  YA_RESUELTO: 'YA_RESUELTO',                       // el código lo cerró solo: no hay nada que preguntar
  CERRADO_POR_DECISION_PREVIA: 'CERRADO_POR_DECISION_PREVIA', // alguien ya contestó ESTA pregunta
  HAY_QUE_PREGUNTAR: 'HAY_QUE_PREGUNTAR',           // nadie la contestó todavía
})

/** El nombre del elemento que se estaba mapeando. `computo.nombre` cuando viene de
 *  `seleccionarTodas`; el id sólo como último recurso, y ahí la memoria no va a cruzar de obra. */
const nombreDelElemento = (mapeo) => mapeo?.computo?.nombre ?? mapeo?.elemento ?? null

/**
 * LA DECISIÓN VIGENTE PARA UNA PREGUNTA CONCRETA. Sólo lee.
 *
 * La más reciente gana por `orden` y NO por `decidido_en`. La diferencia no es cosmética: el
 * default de `decidido_en` era `now()`, que en Postgres es la hora de INICIO DE TRANSACCIÓN, así que
 * dos decisiones guardadas en el mismo request empataban al microsegundo y el `limit 1` devolvía
 * cualquiera de las dos — alguien cambiaba de opinión y el sistema seguía con la vieja. `orden` es
 * una identidad monótona que no puede empatar.
 *
 * La tabla es append-only: si alguien decidió distinto seis meses después, las dos filas quedan y
 * la última manda. Que haya cambiado de opinión es información, no un error que corregir (§21).
 */
export async function decisionVigente({ query }, { elemento, unidad, huella }) {
  const { rows } = await query(
    `select id, elemento, unidad, tipo_pregunta, pregunta, respuesta, codigos, atributo,
            huella, decidido_por, decidido_en, orden
       from public.base_maestra_decision
      where elemento = $1 and unidad is not distinct from $2 and huella = $3
      order by orden desc
      limit 1`,
    [claveDeElemento(elemento), unidad ?? null, huella],
  )
  return rows[0] ?? null
}

/**
 * GUARDAR UNA DECISIÓN, Y DEVOLVER LO QUE QUEDÓ ESCRITO. No devuelve el `insert`: devuelve la fila
 * releída.
 *
 * Un `insert` que no explota NO prueba que se escribió lo que se quería escribir — es la misma
 * lección que este repo ya pagó con los 204 de PostgREST. Lo que prueba una escritura es el dato
 * leído en su destino, así que acá se relee con `returning` y el llamador recibe la fila real, con
 * su `decidido_en` puesto por la base y no por el proceso.
 */
export async function guardarDecision({ query }, { pregunta, respuesta, resultado, quien = null }) {
  const huella = huellaDePregunta(pregunta)
  if (!huella) throw new Error('no se puede guardar una decisión sin la pregunta que la originó')
  if (!resultado?.ok) throw new Error(`no se guarda una respuesta que no cerró nada: ${resultado?.porQue ?? 'sin resultado'}`)

  const { rows } = await query(
    `insert into public.base_maestra_decision
       (elemento, unidad, tipo_pregunta, pregunta, respuesta, codigos, atributo, huella, decidido_por)
     values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::uuid, auth.uid()))
     returning id, elemento, unidad, tipo_pregunta, pregunta, respuesta, codigos, atributo,
               huella, decidido_por, decidido_en, orden`,
    [
      claveDeElemento(pregunta.elementoNombre ?? resultado.elementoNombre ?? pregunta.elemento),
      pregunta.unidad ?? null,
      pregunta.tipo,
      pregunta.pregunta,
      String(respuesta),
      resultado.codigos ?? [],
      pregunta.atributo ?? null,
      huella,
      quien,
    ],
  )
  return rows[0] ?? null
}

/**
 * INTENTAR CERRAR UN MAPEO ABIERTO CON LO QUE LA EMPRESA YA DECIDIÓ. Lee; no escribe.
 *
 * Es la función que el orquestador llama en la etapa MAP. Devuelve siempre la misma forma, y cuando
 * hay que preguntar devuelve la pregunta armada para que la haga quien tenga a la persona adelante.
 */
export async function resolverConMemoria({ query }, mapeo, { costos = {}, paresComplementarios = [] } = {}) {
  const nombre = nombreDelElemento(mapeo)
  const unidad = mapeo?.computo?.unidad ?? null
  const pregunta = preguntaParaCerrar(mapeo, { costos, paresComplementarios })
  if (!pregunta) return Object.freeze({ resolucion: RESOLUCION.YA_RESUELTO, pregunta: null, resultado: null, decisionPrevia: null })

  // El nombre y la unidad viajan PEGADOS a la pregunta: `preguntaParaCerrar` es pura y sólo conoce
  // el id del cómputo, y guardar por id haría que la memoria no cruzara nunca de una obra a otra.
  const conElemento = Object.freeze({ ...pregunta, elementoNombre: nombre, unidad })
  const huella = huellaDePregunta(conElemento)
  const previa = await decisionVigente({ query }, { elemento: nombre, unidad, huella })
  if (!previa) return Object.freeze({ resolucion: RESOLUCION.HAY_QUE_PREGUNTAR, pregunta: conElemento, resultado: null, decisionPrevia: null })

  // EL SEGUNDO CANDADO. La huella coincidió, pero la respuesta guardada tiene que seguir estando
  // entre las opciones de HOY. Si no está, se pregunta de nuevo en vez de cerrar con un código que
  // el catálogo ya no ofrece.
  const r = responder(conElemento, previa.respuesta, { quien: previa.decidido_por, cuando: previa.decidido_en })
  if (!r.ok) {
    return Object.freeze({
      resolucion: RESOLUCION.HAY_QUE_PREGUNTAR, pregunta: conElemento, resultado: null, decisionPrevia: previa,
      porQue: `hay una decisión previa («${previa.respuesta}») que ya no es una de las opciones: ${r.porQue}`,
    })
  }
  return Object.freeze({
    resolucion: RESOLUCION.CERRADO_POR_DECISION_PREVIA,
    pregunta: conElemento,
    resultado: Object.freeze({ ...r, reusada: true }),
    decisionPrevia: previa,
    porQue: `no se pregunta: ${previa.decidido_por ?? 'alguien'} ya contestó esta misma pregunta el ${String(previa.decidido_en).slice(0, 10)} — ${r.porQue}`,
  })
}

/**
 * CONTESTAR Y GUARDAR EN UN SOLO ACTO. Escribe.
 *
 * Se devuelve la fila releída de la base junto al resultado: quien llama tiene que poder probar que
 * la decisión quedó, no que el insert no falló.
 */
export async function contestarYGuardar({ query }, pregunta, respuesta, { quien = null } = {}) {
  const resultado = responder(pregunta, respuesta, { quien })
  if (!resultado.ok) return Object.freeze({ ok: false, guardada: null, resultado })
  const guardada = await guardarDecision({ query }, { pregunta, respuesta, resultado, quien })
  return Object.freeze({ ok: true, guardada, resultado })
}

/** Todo lo que se decidió alguna vez sobre un elemento — incluidas las decisiones que ya no
 *  aplican. Es lo que se le muestra a una persona que pregunta «¿por qué quedó mapeado así?». */
export async function historialDeElemento({ query }, nombre) {
  const { rows } = await query(
    `select tipo_pregunta, pregunta, respuesta, codigos, huella, decidido_por, decidido_en, orden
       from public.base_maestra_decision where elemento = $1 order by orden desc`,
    [claveDeElemento(nombre)],
  )
  return rows
}

export { ESTADO }
