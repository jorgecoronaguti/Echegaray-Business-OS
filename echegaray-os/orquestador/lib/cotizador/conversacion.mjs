// LA CONVERSACIÓN — el hilo completo, de una frase a un presupuesto cambiado (§19).
//
//     texto → INTÉRPRETE (determinístico, y sólo si no llega, el modelo)
//           → ejecutar()  [AUTORIZACIÓN → VALIDACIÓN → REGLAS → OUTLIER → MUTACIÓN → RECÁLCULO]
//           → RESPUESTA ESTRUCTURADA
//
// ═══ LA RESPUESTA ES UNA ESTRUCTURA, NO UNA FRASE ═══
//
// `redactar()` devuelve `{tono, titulo, lineas, cambios, pregunta, opciones}` y la pantalla la
// dibuja. Esto no es un detalle de estilo: si la respuesta fuera prosa armada acá, el panel tendría
// que elegir entre mostrarla cruda o volver a parsearla, y la tentación de tener frases lindas
// escritas a mano en el componente —«¡Listo! Actualicé la mampostería»— sería inevitable. Una frase
// preescrita es una afirmación que nadie verificó contra el motor. Acá TODO lo que se muestra sale
// de lo que devolvió `ejecutar()`, y el test lo comprueba número por número.
//
// ═══ POR QUÉ ESTE ARCHIVO NO TOCA LA BASE ═══
//
// `mutar`, `recalcular` y `persistir` se inyectan igual que en `comandos.mjs`, y por el mismo
// motivo: todo lo que decide se prueba sin red. Lo que toca Postgres vive en la server action.

import { ACCION } from './contrato.mjs'
import { ejecutar } from './comandos.mjs'
import { interpretar } from './interprete.mjs'
import { interpretarConModelo } from './interprete-llm.mjs'

/** El turno de conversación. Siempre la misma forma. */
const turno = (x) => Object.freeze({
  entendido: false, comoSeEntendio: null, degradado: false,
  intencion: null, salida: null, respuesta: null, eventos: Object.freeze([]), ...x,
})

/**
 * UN TURNO. Devuelve qué se entendió, qué pasó y qué mostrar.
 *
 * @param usarModelo cuando es `false`, el modelo NO se llama ni siquiera si el parser falló. Es el
 *   interruptor del CLAUDE-ZERO (§34): permite correr el sistema entero con el proveedor apagado y
 *   ver exactamente qué se pierde, en vez de suponerlo.
 */
export async function conversar({
  texto, rol, actor, estado = {}, correlationId = null, confirmado = false,
  mutar = null, recalcular = null, persistir = null,
  usarModelo = true, pedir = undefined, cascadaAntes = null,
} = {}) {
  const partidas = estado.partidas ?? []

  // ── 1 · DETERMINÍSTICO PRIMERO, SIEMPRE (§33)
  let leido = interpretar(texto, { partidas })
  let degradado = false

  // ── 2 · el modelo, sólo si el parser no llegó
  if (!leido.resuelto && usarModelo) {
    const conModelo = await interpretarConModelo(texto, { partidas, ...(pedir ? { pedir } : {}) })
    degradado = conModelo.degradado
    if (conModelo.resuelto) leido = conModelo
    else if (conModelo.porQue) leido = { ...leido, porQue: conModelo.porQue }
  }

  if (!leido.resuelto) {
    return turno({
      degradado,
      respuesta: Object.freeze({
        tono: 'pregunta', titulo: 'No entendí',
        lineas: [leido.porQue].filter(Boolean),
        cambios: Object.freeze([]),
        pregunta: leido.pregunta ?? 'Reformulá la frase.',
        opciones: leido.opciones ?? null,
      }),
    })
  }

  // ── 3 · el command layer. Autoriza, valida, mide el atípico, muta y recalcula — en ese orden.
  const salida = ejecutar({
    intent: leido.intencion, rol, actor, estado, correlationId, confirmado,
    mutar, recalcular, persistir,
  })

  return turno({
    entendido: true, comoSeEntendio: leido.comoSeLeyo, degradado,
    intencion: leido.intencion, salida, eventos: salida.eventos,
    respuesta: redactar({ intencion: leido.intencion, salida, cascadaAntes }),
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA RESPUESTA
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * DE LO QUE DEVOLVIÓ EL MOTOR A LO QUE SE MUESTRA. PURA.
 *
 * No inventa una sola palabra sobre el presupuesto: los motivos, las preguntas y los números salen
 * de `salida`. Lo único propio son los rótulos de sección, que no afirman nada.
 */
export function redactar({ intencion, salida, cascadaAntes = null } = {}) {
  const base = { tono: 'ok', titulo: null, lineas: [], cambios: [], pregunta: null, opciones: null }

  if (!salida.ok) {
    return Object.freeze({
      ...base,
      tono: salida.etapaQueParo === 'AUTORIZACION' ? 'sin-permiso' : salida.pregunta ? 'pregunta' : 'no',
      titulo: TITULO_PARADA[salida.etapaQueParo] ?? 'No se aplicó',
      lineas: Object.freeze([salida.porQue].filter(Boolean)),
      pregunta: salida.pregunta ?? null,
      opciones: salida.resultado?.lecturas
        ? Object.freeze(salida.resultado.lecturas.map((l) => `${l.valor} ${l.unidad ?? '(sin unidad)'}`))
        : null,
      cambios: Object.freeze([]),
    })
  }

  // Las CONSULTAS devuelven el dato pedido, no un cambio.
  if (!ACCION[intencion.action].muta) {
    return Object.freeze({ ...base, tono: 'dato', titulo: TITULO_CONSULTA[intencion.action] ?? 'Respuesta', lineas: Object.freeze([]), datos: salida.resultado, cambios: Object.freeze([]) })
  }

  const e = salida.eventos?.[0] ?? null
  const cambios = e ? [{ que: e.entidad, campo: e.campo, antes: e.antes, despues: e.despues }] : []
  const impacto = deltaDePrecio(cascadaAntes, salida.resultado?.cascada ?? null)

  return Object.freeze({
    ...base,
    tono: salida.veredicto === 'APLICAR_CON_AVISO' ? 'aviso' : 'ok',
    titulo: 'Aplicado',
    // `porQue` sólo viene cuando el outlier engine aplicó CON aviso: es la advertencia que hay que
    // leer, y ocultarla porque «salió bien» es exactamente lo que el §20 no quiere.
    lineas: Object.freeze([salida.porQue].filter(Boolean)),
    cambios: Object.freeze(cambios),
    impacto,
  })
}

const TITULO_PARADA = Object.freeze({
  AUTORIZACION: 'No tenés permiso',
  VALIDACION: 'No se pudo aplicar',
  OUTLIER: 'Antes de aplicarlo',
})

const TITULO_CONSULTA = Object.freeze({
  blockers_query: 'Lo que falta para enviar',
  evidence_query: 'De dónde sale',
  cost_query: 'Cuánto cuesta',
  commercial_query: 'Lo comercial',
})

/**
 * CUÁNTO SE MOVIÓ EL PRECIO. PURA. `null` cuando no se puede saber — nunca cero.
 *
 * Un cero acá diría «el cambio no movió el precio», que es una afirmación. Que no haya cascada antes
 * o después significa que no se midió, y son cosas distintas (§42, NULL≠0).
 */
export function deltaDePrecio(antes, despues) {
  const a = antes?.ventaSinIva
  const d = despues?.ventaSinIva
  // `Number(null)` es 0 y `Number(undefined)` es NaN: sin este chequeo un presupuesto SIN_PRECIO
  // —`ventaSinIva: null`, que es lo que devuelve la cascada cuando el costo no se puede afirmar—
  // entraba como cero y el panel publicaba «el precio subió $8.500.000» partiendo de una base que
  // nadie calculó. Lo encontró el test, no la lectura del código.
  const falta = (v) => v === null || v === undefined || !Number.isFinite(Number(v))
  if (falta(a) || falta(d)) return null
  return Object.freeze({ antes: Number(a), despues: Number(d), delta: Number(d) - Number(a) })
}
