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
// ═══ POR QUÉ ESTE ARCHIVO NO TOCA LA BASE NI AL MODELO ═══
//
// `mutar`, `recalcular` y `persistir` se inyectan igual que en `comandos.mjs`, y por el mismo
// motivo: todo lo que decide se prueba sin red. Lo que toca Postgres vive en la server action.
//
// Y `conModelo` también se inyecta. `claude-zero.test.mjs` verifica que ningún módulo de esta
// carpeta importe un cliente de IA — importarlo acá lo habría burlado por transitividad, que es
// peor que romperlo de frente. La consecuencia es la buena: `conversar()` sin nadie que le pase un
// intérprete de respaldo corre CLAUDE-ZERO **por construcción**, no por una bandera que alguien
// puede olvidarse de poner. La puerta del modelo vive en `lib/interprete-presupuesto-llm.mjs`.

import { ACCION } from './contrato.mjs'
import { ejecutar } from './comandos.mjs'
import { interpretar } from './interprete.mjs'

/** El turno de conversación. Siempre la misma forma. */
const turno = (x) => Object.freeze({
  entendido: false, comoSeEntendio: null, degradado: false,
  intencion: null, salida: null, respuesta: null, eventos: Object.freeze([]), ...x,
})

/**
 * UN TURNO. Devuelve qué se entendió, qué pasó y qué mostrar.
 *
 * @param conModelo el intérprete de respaldo —`interpretarConModelo` de
 *   `lib/interprete-presupuesto-llm.mjs`—. Sin él no hay modelo y el sistema corre determinístico.
 * @param usarModelo cuando es `false`, el respaldo NO se llama ni aunque esté inyectado. Es el
 *   interruptor del CLAUDE-ZERO (§34): permite correr el sistema entero con el proveedor apagado y
 *   ver exactamente qué se pierde, en vez de suponerlo.
 */
export async function conversar({
  texto, rol, actor, estado = {}, correlationId = null, confirmado = false,
  mutar = null, recalcular = null, persistir = null,
  usarModelo = true, conModelo = null, pedir = undefined, cascadaAntes = null,
} = {}) {
  const partidas = estado.partidas ?? []

  // ── 1 · DETERMINÍSTICO PRIMERO, SIEMPRE (§33)
  let leido = interpretar(texto, { partidas })
  let degradado = false

  // ── 2 · el modelo, sólo si el parser no llegó
  if (!leido.resuelto && usarModelo && conModelo) {
    const r = await conModelo(texto, { partidas, ...(pedir ? { pedir } : {}) })
    degradado = r.degradado
    if (r.resuelto) leido = r
    else if (r.porQue) leido = { ...leido, porQue: r.porQue }
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
    return Object.freeze({
      ...base, tono: 'dato', titulo: TITULO_CONSULTA[intencion.action] ?? 'Respuesta',
      // ═══ UN RESULTADO TODO-NULL NECESITA SU LÍNEA (QA visual, 29/08/2026) ═══
      //
      // «¿de dónde sale X?» sobre una partida encontrada pero sin genealogía devolvía
      // `{entidad, genealogia: null, evidencia: null}` y la pantalla dibujaba ese JSON pelado. Es
      // cierto y no se entiende: quien pregunta no sabe si el sistema no lo sabe o si no lo buscó.
      //
      // La línea que se agrega es ESTRUCTURAL, no interpretación: dice cuáles de los campos pedidos
      // vinieron vacíos y con qué entidad. El JSON sigue abajo, intacto — «no se interpreta» sigue
      // siendo la política, y ausencia declarada no es interpretación.
      lineas: Object.freeze(lineasDeAusencia(salida.resultado)),
      datos: salida.resultado, cambios: Object.freeze([]),
    })
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

/**
 * LA AUSENCIA, DECLARADA. PURA.
 *
 * Un `{genealogia: null, evidencia: null}` es una respuesta correcta y muda. Esto la nombra sin
 * inventar nada: enumera qué campos vinieron vacíos, con la entidad delante. No dice POR QUÉ están
 * vacíos —eso sería interpretar— ni propone nada.
 */
function lineasDeAusencia(resultado) {
  if (!resultado || typeof resultado !== 'object') return []
  // El «no encuentro X» del motor se muestra TAL CUAL —reescribirlo sería tapar lo que dijo—, y se
  // le agrega al lado la distinción de las tres cosas que se confunden acá (§42, NULL≠0):
  //
  //   · NO ESTÁ            — la partida no existe en este presupuesto;
  //   · ESTÁ SIN DATO      — existe y su genealogía o su evidencia no se cargaron;
  //   · VALE CERO          — alguien midió y el resultado fue cero.
  //
  // El QA leyó «no encuentro «47,2 m3»» y era cierto y ambiguo: no distinguía la primera de las
  // otras dos. La línea que sigue no interpreta nada, sólo dice cuál de las tres es.
  if (typeof resultado.porQue === 'string') {
    return [resultado.porQue, 'No está en el presupuesto: es distinto de estar cargada sin datos, y distinto de valer cero.']
  }

  const mirados = ['genealogia', 'evidencia', 'subtotal', 'costoUnitario']
    .filter((k) => k in resultado)
  if (mirados.length === 0) return []
  const vacios = mirados.filter((k) => resultado[k] === null || resultado[k] === undefined)
  if (vacios.length === 0 || vacios.length < mirados.length) return []

  const quien = resultado.entidad ?? 'lo consultado'
  return [`${quien} existe, pero no tiene ${vacios.join(' ni ')} registrada${vacios.length > 1 ? 's' : ''}: el dato no está cargado, no es que valga cero.`]
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
