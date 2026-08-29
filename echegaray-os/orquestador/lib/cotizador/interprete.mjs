// EL INTÉRPRETE DETERMINÍSTICO — de una frase a una INTENCIÓN, sin modelo (§19, §33).
//
// ═══ POR QUÉ ESTO EXISTE ANTES QUE EL MODELO ═══
//
// §33 fija el orden de resolución y pone «modelo barato» en el anteúltimo lugar. Los siete casos
// canónicos del §19 son frases con estructura —un verbo, un objeto, un número con unidad—, y una
// gramática los resuelve sin red, sin costo y sin variabilidad entre corridas (§39). El modelo entra
// SÓLO cuando esta función no resuelve, y aun ahí produce una intención que vuelve a pasar por el
// contrato. Sin claves, el sistema no se cae: pierde las frases raras y conserva las canónicas
// (§34, CLAUDE-ZERO).
//
// ═══ ESTE ARCHIVO NO DECIDE NADA DE NEGOCIO ═══
//
// No valida que el target exista, no compara unidades, no evalúa si el número es plausible y no
// mira permisos. Eso es `comandos.ejecutar()`, en ese orden y con esas garantías. Acá sólo se
// traduce texto → `{action, target, value, ...}`. Es la razón de que sea PURO y de que no importe
// nada que toque la base.
//
// ═══ LA REGLA QUE MÁS CUESTA SI SE ROMPE ═══
//
// «520 m²» son 520 metros cuadrados y NUNCA 520 millones (§7). «8,5M» son 8.500.000 SÓLO bajo
// contexto monetario. La decisión no se toma con una expresión regular propia: se delega en
// `leerCantidad()`, que ya tiene el catálogo de unidades, la colisión declarada `m`/`mm` y los tests
// de esa colisión. Duplicar acá ese criterio sería tener dos definiciones de la misma cosa.

import { ESTADO, intencion } from './contrato.mjs'
import { leerCantidad } from './unidades.mjs'
import { PARAMETROS } from './comercial.mjs'

/** La respuesta del intérprete. Siempre la misma forma, resuelva o no. PURA. */
const lectura = (x) => Object.freeze({
  resuelto: false, intencion: null, comoSeLeyo: null, porQue: null,
  // De dónde salió. Este archivo SÓLO produce GRAMATICA: son reglas con tests, no deducciones.
  // Quien lee el `origen` decide cuánta confianza le da, y esa decisión no es de acá.
  origen: 'GRAMATICA',
  pregunta: null, opciones: null, ...x,
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL VOCABULARIO — los sinónimos que la gente usa, escritos una vez
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Cómo se nombra en castellano cada parámetro de la política comercial.
 *
 * La lista de PARÁMETROS la manda `comercial.mjs`; acá viven sólo los ALIAS. Un alias que apunte a
 * un parámetro inexistente se rompe en el test, no en producción: por eso el mapa se valida contra
 * `PARAMETROS` al cargar el módulo.
 */
const ALIAS_COMERCIAL = Object.freeze({
  beneficio: 'pctBeneficio',
  utilidad: 'pctBeneficio',
  'gastos generales': 'pctGastosGenerales',
  gg: 'pctGastosGenerales',
  financiero: 'pctFinanciero',
  'costo financiero': 'pctFinanciero',
  'factor financiero': 'factorFinanciero',
  iibb: 'pctIibb',
  'ingresos brutos': 'pctIibb',
  ganancias: 'pctGanancias',
  cheque: 'pctCheque',
  'impuesto al cheque': 'pctCheque',
  iva: 'pctIva',
})

for (const p of Object.values(ALIAS_COMERCIAL)) {
  if (!PARAMETROS.includes(p)) throw new Error(`ALIAS_COMERCIAL apunta a «${p}», que no es un parámetro de la política`)
}

/**
 * Sin tildes, sin mayúsculas, sin espacios de más. El mismo criterio que usa `comandos.coincide`.
 *
 * ═══ LA GRAMÁTICA CORRE SOBRE ESTO, NO SOBRE EL TEXTO CRUDO ═══
 *
 * El dueño escribe «saca pintura», «q me falta», «la mamposteria son 520 m2» — sin tildes, con
 * abreviaturas y en minúscula. Un patrón que exigiera «sacá» acierta en el test y falla en la
 * conversación real, que es exactamente lo que `.claude/rules/tests.md` prohíbe. Se normaliza una
 * vez, al principio, y todos los patrones se escriben sin tildes.
 */
const n = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

/** Le saca el artículo y la puntuación final a un nombre de partida escrito a mano. PURA. */
const pelar = (t) => String(t ?? '')
  .replace(/^\s*(?:a\s+)?(?:la|el|los|las|lo)\s+/i, '')
  .replace(/[\s.,;:!?¿¡]+$/u, '')
  .trim()

// ══════════════════════════════════════════════════════════════════════════════════════════════
// RESOLUCIÓN DE REFERENCIA — «¿de dónde salen 47,2 m³?» no nombra ninguna partida
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ¿A QUÉ PARTIDA SE REFIERE ESTE TEXTO? PURA.
 *
 * El caso canónico «¿de dónde salen 47,2 m³?» no dice el nombre de nada: dice una CANTIDAD, y quien
 * pregunta la está leyendo de la pantalla. `comandos.consultar()` busca por nombre y devolvería «no
 * encuentro 47,2 m³», que es cierto y no sirve. Acá se busca por cantidad+unidad, que es la única
 * información que la frase trae.
 *
 * Dos coincidencias NO se desempatan: se pregunta. Elegir la primera sería contestar «de dónde sale»
 * señalando el origen equivocado, que es peor que no contestar.
 */
export function resolverTarget(texto, partidas = []) {
  const t = pelar(texto)
  if (!t) return { ok: false, porQue: 'no se dijo a qué' }

  const c = leerCantidad(t, { contexto: 'MAGNITUD' })
  const esSoloCantidad = c.estado === ESTADO.EXTRAIDO && c.unidad !== null
  if (!esSoloCantidad) return { ok: true, target: t, como: 'NOMBRE' }

  const cerca = partidas.filter((p) => Number(p.cantidad) === Number(c.valor) && n(p.unidad) === n(c.unidad))
  if (cerca.length === 1) {
    return { ok: true, target: cerca[0].codigo ?? cerca[0].descripcion, como: 'CANTIDAD' }
  }
  if (cerca.length > 1) {
    return {
      ok: false,
      porQue: `${cerca.length} partidas tienen ${c.valor} ${c.unidad}: no se elige una en silencio`,
      pregunta: '¿de cuál de estas hablás?',
      opciones: cerca.map((p) => p.codigo ?? p.descripcion),
    }
  }
  return { ok: false, porQue: `ninguna partida del presupuesto tiene ${c.valor} ${c.unidad}`, pregunta: '¿de qué partida?' }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA GRAMÁTICA — el primero que engancha gana, y el orden es la política
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Las CONSULTAS van primero. «¿de dónde salen los 520 m² de mampostería?» empieza con una pregunta y
// termina con una cantidad: si la regla de cantidad corriera antes, una pregunta se convertiría en
// una escritura. Un intérprete que muta cuando le preguntan es el peor defecto posible de esta capa.

const R = Object.freeze({
  BLOQUEOS: /(?:q(?:ue)?\s+(?:me\s+)?(?:falta|bloquea)|q(?:ue)?\s+necesito\s+para\s+(?:enviar|mandar|ofertar)|falta\s+para\s+(?:enviar|mandar|ofertar)|listo\s+para\s+(?:enviar|mandar|ofertar))/,
  EVIDENCIA: /(?:de\s+donde\s+(?:sale[ns]?|salio|viene[ns]?|surge[n]?)|como\s+se\s+calcul[oa]|q(?:ue)?\s+respalda)\s+(.+)$/,
  COSTO: /cuanto\s+(?:cuesta|sale|vale|es)\s+(.+)$/,
  EXCLUIR: /^(?:sacar?|saq[au]e|quitar?|eliminar?|excluir?|excluye|borrar?|no\s+va)\s+(.+)$/,
  INCLUIR: /^(?:poner?|agregar?|incluir?|incluye|sumar?|meter?|va)\s+(.+)$/,
  SUBCONTRATO: /^(?:la|el|los|las)?\s*(.+?)\s+(?:la|lo|las|los)\s+(?:hace|hacen|ejecuta|ejecutan|pone|ponen)\s+(.+?)\s+(?:por|en|a)\s+([^\s].*)$/,
  COMERCIAL: /^(?:el|la|los|las)?\s*([a-zñ ]+?)\s*(?:queda\s+en|pasa\s+a|es|en|al?|:|=)?\s*(-?[\d.,]+)\s*%?$/,
  CANTIDAD: /^(.+?)\s+(?:son|es|:|=|tiene[n]?|mide[n]?)\s+(.+)$/,
  SUELTO: /^(.+?)\s+(\$?\s*-?[\d.,]*\d\s*[^\s]*)$/,
})

/**
 * DE UNA FRASE A UNA INTENCIÓN, SIN MODELO. PURA.
 *
 * `partidas` es una foto de sólo lectura y sirve para UNA cosa: resolver a qué se refiere una frase
 * que nombra una cantidad en vez de una partida. No se usa para validar nada — eso es del command
 * layer, y hacerlo dos veces produciría dos respuestas distintas al mismo error.
 *
 * @returns {{resuelto: boolean, intencion: object|null, comoSeLeyo: string|null,
 *            porQue: string|null, pregunta: string|null, opciones: string[]|null}}
 */
export function interpretar(texto, { partidas = [] } = {}) {
  const original = String(texto ?? '').trim()
  if (!original) return lectura({ porQue: 'no vino ningún texto' })
  // Los signos de interrogación no aportan a ningún patrón y sí estorban al final de un target
  // («¿de donde salen 47,2 m3?» dejaría el target en «47,2 m3?»). Se sacan una sola vez, acá.
  const t = n(original).replace(/[¿?¡!]/g, ' ').replace(/\s+/g, ' ').trim()

  const mk = (action, campos, comoSeLeyo) => lectura({
    resuelto: true, comoSeLeyo,
    intencion: intencion({ action, textoOriginal: original, ...campos }),
  })

  // ── 1 · «¿qué me falta para enviar?» — la única que no lleva target
  if (R.BLOQUEOS.test(t)) return mk('blockers_query', {}, 'consulta de bloqueos')

  // ── 2 · «¿de dónde salen 47,2 m³?»
  const ev = R.EVIDENCIA.exec(t)
  if (ev) return conTarget('evidence_query', ev[1], 'consulta de evidencia', original, partidas)

  // ── 3 · «¿cuánto cuesta la mampostería?»
  const co = R.COSTO.exec(t)
  if (co) return conTarget('cost_query', co[1], 'consulta de costo', original, partidas)

  // ── 4 · «sacá pintura» / «poné pintura»
  const ex = R.EXCLUIR.exec(t)
  if (ex) return mk('exclude_scope', { target: pelar(ex[1]), reason: original }, 'exclusión de alcance')
  const inc = R.INCLUIR.exec(t)
  if (inc) return mk('include_scope', { target: pelar(inc[1]), reason: original }, 'inclusión de alcance')

  // ── 5 · «la sanitaria la hace Pérez por 8,5M» — CON quién, que es lo que la vuelve un subcontrato
  const sub = R.SUBCONTRATO.exec(t)
  if (sub) {
    const monto = leerCantidad(sub[3], { contexto: 'MONETARIO' })
    return mk('set_subcontract', {
      target: pelar(sub[1]), supplier: pelar(sub[2]),
      value: monto.valor ?? sub[3], unit: monto.unidad ?? 'ARS', currency: monto.unidad ?? 'ARS',
    }, 'subcontrato con proveedor')
  }

  // ── 6 · «beneficio 19 %»
  const com = interpretarComercial(t)
  if (com) return mk('commercial_override', com, 'override comercial de esta cotización')

  // ── 7 · «la mampostería son 520 m²» / «sanitaria 8,5M»
  const cant = R.CANTIDAD.exec(t) ?? R.SUELTO.exec(t)
  if (cant) return porCantidadOMonto(cant[1], cant[2], original)

  return lectura({
    porQue: 'ninguna regla del intérprete engancha con esa frase',
    pregunta: 'no entendí. ¿Podés escribirlo como «la mampostería son 520 m²», «sacá pintura» o «¿qué me falta para enviar?»',
  })
}

/** Las consultas que sí llevan target, con la resolución por cantidad ya aplicada. PURA. */
function conTarget(action, crudo, comoSeLeyo, original, partidas) {
  const r = resolverTarget(crudo, partidas)
  if (!r.ok) return lectura({ porQue: r.porQue, pregunta: r.pregunta ?? null, opciones: r.opciones ?? null })
  return lectura({
    resuelto: true, comoSeLeyo,
    intencion: intencion({ action, target: r.target, textoOriginal: original }),
  })
}

/**
 * «beneficio 19 %» → `{target: 'pctBeneficio', value: 19}`. `null` si la frase no es comercial. PURA.
 *
 * ═══ ESTE INTÉRPRETE NUNCA PRODUCE `set_global_policy` ═══
 *
 * Y es deliberado. `commercial_override` mueve la política de ESTA cotización; `set_global_policy`
 * mueve la de la empresa entera (§17), y una conversación no es el lugar donde se decide eso. El
 * modelo tampoco puede colarla: `interpretarConModelo` la deja pasar sintácticamente —está en la
 * lista cerrada— pero desde la auditoría delta la base exige `GLOBAL_POLICY_WRITE` en
 * `parametro_comercial` y `parametro_operativo`, y `planDe()` no le arma plan de escritura.
 *
 * Queda DECLARADO que `comandos.validar()` la valida igual que `commercial_override`: es archivo
 * del CORE y está pedido en el informe. Hoy el freno real es la base, que es la cerradura correcta.
 */
function interpretarComercial(t) {
  const m = R.COMERCIAL.exec(t)
  if (!m) return null
  const clave = m[1].trim().replace(/^(el|la|los|las)\s+/, '')
  const parametro = ALIAS_COMERCIAL[clave]
  if (!parametro) return null
  // El valor va CRUDO: `comandos.validar()` ya sabe que «19» y «0,19» son lo mismo, y decidirlo acá
  // significaría dos definiciones del mismo criterio en dos archivos.
  return { target: parametro, value: m[2].replace(',', '.') }
}

/**
 * ¿ESE NÚMERO ES UNA CANTIDAD DE OBRA O SON PESOS? PURA.
 *
 * ═══ EL CASO «sanitaria 8,5M» ═══
 *
 * Sin contexto declarado, `leerCantidad` devuelve AMBIGUO con las dos lecturas escritas. Ahí NO se
 * elige: se emite `set_subcontract` SIN `supplier`, y `comandos.validar()` responde lo que §19 pide
 * —«un monto al lado de un rubro no es un subcontrato: ¿quién lo hace?»—. Podría contestarse acá,
 * pero entonces la misma pregunta viviría en dos lugares y podrían empezar a diferir; la regla es
 * del command layer y ahí se queda.
 *
 * «520 m²» tiene unidad física y sale EXTRAIDO: es cantidad, y nunca 520 millones.
 */
function porCantidadOMonto(objetivo, valor, original) {
  const target = pelar(objetivo)
  const leido = leerCantidad(valor, { contexto: null })

  const esMoneda = leido.unidad === 'ARS' || leido.unidad === 'USD'
  const esAmbiguoMonetario = leido.estado === ESTADO.AMBIGUO
    && (leido.lecturas ?? []).some((l) => l.unidad === 'ARS')

  if (esMoneda || esAmbiguoMonetario) {
    const monto = leerCantidad(valor, { contexto: 'MONETARIO' })
    return lectura({
      resuelto: true, comoSeLeyo: 'monto sin proveedor: el command layer va a preguntar quién lo hace',
      intencion: intencion({
        action: 'set_subcontract', target, supplier: null,
        value: monto.valor ?? valor, unit: monto.unidad ?? 'ARS', currency: monto.unidad ?? 'ARS',
        textoOriginal: original,
      }),
    })
  }

  // ═══ UNA CANTIDAD DE OBRA NO PUEDE SER NEGATIVA (auditoría delta, 29/08/2026) ═══
  //
  // Hoy los frena el rango físico del outlier engine, que es un freno indirecto: depende de que la
  // partida tenga costo y de la materialidad. «la mamposteria son -520 m2» no es un cambio atípico,
  // es una frase sin sentido físico, y se corta acá antes de que nada la mida.
  if (Number.isFinite(Number(leido.valor)) && Number(leido.valor) < 0) {
    return lectura({
      porQue: `«${valor}» es negativo: una cantidad de obra no puede serlo`,
      pregunta: '¿Querías restar de la cantidad actual? Decime la cantidad final.',
    })
  }

  // Cantidad. El texto crudo viaja en `value` y lo lee `comandos.validar()` con contexto MAGNITUD:
  // ahí está el cruce con la unidad de la partida, que es lo que decide si se acepta.
  return lectura({
    resuelto: true, comoSeLeyo: 'cantidad de obra',
    intencion: intencion({ action: 'update_quantity', target, value: String(valor).trim(), unit: null, textoOriginal: original }),
  })
}

/**
 * LOS SIETE CASOS CANÓNICOS DEL §19, como dato.
 *
 * No es documentación: el test los recorre uno por uno y la pantalla los muestra como ejemplos. Que
 * la lista de ejemplos de la UI y la lista que el test verifica sean el MISMO array significa que no
 * se puede publicar un ejemplo que el intérprete no resuelva.
 */
export const CANONICOS = Object.freeze([
  { texto: 'la mampostería son 520 m2', accion: 'update_quantity' },
  { texto: 'sacá pintura', accion: 'exclude_scope' },
  { texto: 'sanitaria 8,5M', accion: 'set_subcontract' },
  { texto: 'la sanitaria la hace Pérez por 8,5M', accion: 'set_subcontract' },
  { texto: 'beneficio 19%', accion: 'commercial_override' },
  { texto: '¿de dónde salen 47,2 m3?', accion: 'evidence_query' },
  { texto: '¿qué me falta para enviar?', accion: 'blockers_query' },
])
