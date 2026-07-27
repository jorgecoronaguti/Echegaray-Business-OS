// FINANCIAL ENGINEERING MULTI-EXPERTO (FE1) — el orquestador de las TRES lentes expertas sobre el
// Flujo de Fondos + la comparación entre ellas. Es el NÚCLEO puro: no lee Supabase, no llama a
// ninguna API, no toca el Sheet. Recibe (1) la pregunta del dueño, (2) el contexto financiero YA
// leído de las fuentes únicas del OS, y (3) un razonador inyectado. Devuelve las 3 lecturas grounded
// en sus skills + la comparación (coincidencias / conflictos).
//
// POR QUÉ ASÍ:
//  - Testeable con razonamiento MOCKEADO (0 API en los tests): el `razonar` es inyectado.
//  - "Skills DE VERDAD enchufadas" (gap chat-sin-cerebro): cada lente declara SUS skills y el núcleo
//    las pasa al razonador, que las inyecta al system con el Context Assembler. El núcleo no recita
//    la skill: define qué conocimiento entra al prompt de cada persona.
//  - "Nunca inventar un número" (regla de oro): el núcleo NUNCA genera un peso. El contexto que le
//    pasa a cada lente sale SÓLO de lo que vino en `contexto`; lo que falta se declara "No tengo ese
//    dato". El razonamiento no puede inventar porque no recibe números que no existan.
//  - Cost-aware: 3 lecturas + 1 comparación por consulta, modelo barato por defecto. Sólo corre
//    cuando el dueño pregunta (lo dispara el route handler, nada autónomo).
//
// El razonador productivo (assembleReasoningSystem + engine Anthropic) vive en fe-multiexperto-wiring.mjs
// para que estos tests jamás importen el motor ni la red.

import { PERSONA_EXPERTA } from './chat-persona.mjs'

/**
 * Las tres lentes. Cada una declara la PERSONA (reusada del mapa canónico del chat) y el CONJUNTO DE
 * SKILLS que la fundamenta — el mismo criterio que skill-map.mjs, hecho explícito acá para el foco FE:
 *  - contador   → contabilidad-constructoras + impuestos-construccion (devengado/percibido, IVA, imputación)
 *  - abogado    → derecho-construccion-contratos + derecho-laboral-construccion (riesgo, instrumentos, cargas)
 *  - financiero → finanzas-tesoreria-construccion + financial-engineering (liquidez, costo del dinero, prioridad)
 */
export const LENTES = [
  {
    id: 'contador',
    titulo: 'Contador',
    persona: PERSONA_EXPERTA['advise.accounting'],
    skills: ['contabilidad-constructoras', 'impuestos-construccion'],
    foco:
      'Devengado vs percibido, reconocimiento de ingresos y costos, IVA y posición fiscal, y si cada ' +
      'movimiento del Flujo está bien o mal imputado (período, obra, criterio). El Flujo es percibido: ' +
      'marcá cuándo un movimiento de caja NO coincide con el resultado económico devengado.',
  },
  {
    id: 'abogado',
    titulo: 'Abogado',
    persona: PERSONA_EXPERTA['advise.legal'],
    skills: ['derecho-construccion-contratos', 'derecho-laboral-construccion'],
    foco:
      'Riesgo contractual de cada cobro/pago, cheques y echeqs como instrumentos (endoso, ejecución, ' +
      'rechazo), obligaciones laborales (cargas sociales, Fondo de Cese, UOCRA/IERIC) y exposición ' +
      'legal. Señalá cuándo un pago o un cobro tiene un riesgo jurídico que la caja sola no muestra.',
  },
  {
    id: 'financiero',
    titulo: 'Financiero',
    persona: PERSONA_EXPERTA['advise.finance'],
    skills: ['finanzas-tesoreria-construccion', 'financial-engineering'],
    foco:
      'Liquidez y capital de trabajo, costo del dinero (descubierto/CFT verificado, descuento de ' +
      'cheques), priorización de pagos multicriterio y calendario de caja. Razoná qué conviene ' +
      'financieramente HOY sin romper margen ni caja futura.',
  },
]

const LENTES_POR_ID = new Map(LENTES.map((l) => [l.id, l]))

// Formato es-AR sin inventar: null/undefined/no-finito → marcador honesto, nunca un 0 ni un NaN.
function fmtPesos(v) {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// Una línea del contexto. Si el valor no está, lo DECLARA faltante (no lo omite en silencio): así el
// razonador ve explícitamente qué no sabe y no puede rellenarlo. Devuelve { linea, falta }.
function lineaDato(etiqueta, valorFmt, fuente) {
  if (valorFmt === null) {
    return { linea: `- ${etiqueta}: No tengo ese dato${fuente ? ` (fuente: ${fuente})` : ''}.`, falta: etiqueta }
  }
  return { linea: `- ${etiqueta}: ${valorFmt}${fuente ? ` (fuente: ${fuente})` : ''}`, falta: null }
}

/**
 * Serializa el contexto financiero a un bloque de texto DETERMINÍSTICO que se le muestra a cada lente
 * (y al dueño, por transparencia). No calcula nada: sólo formatea lo que vino. Todo número ausente se
 * declara "No tengo ese dato". Devuelve { texto, faltantes[] }.
 *
 * Shape esperado de `contexto` (todos los campos opcionales; lo que falte se declara):
 *   { caja:{hoy,proyeccion7,colchon}, cobranzas:{porCobrarMes,vencidas},
 *     obligaciones:{saldo,vencido,deudaComercialVencida},
 *     descubierto:{cftAnual,limite,usado}, notas:string[], capturadoEn:string }
 */
export function construirContextoTexto(contexto = {}) {
  const c = contexto || {}
  const faltantes = []
  const bloques = []

  const push = (etiqueta, valorFmt, fuente) => {
    const { linea, falta } = lineaDato(etiqueta, valorFmt, fuente)
    if (falta) faltantes.push(falta)
    return linea
  }

  const caja = c.caja || {}
  bloques.push(
    'CAJA Y LIQUIDEZ (criterio percibido — fuente única del OS):\n' +
      [
        push('Caja hoy', fmtPesos(caja.hoy), 'finanzas_modelo_liquidez / scorecard'),
        push('Proyección 7 días', fmtPesos(caja.proyeccion7), 'scorecard'),
        push('Colchón total (líneas + disponible)', fmtPesos(caja.colchon), 'finanzas_modelo_liquidez'),
      ].join('\n'),
  )

  const cob = c.cobranzas || {}
  bloques.push(
    'COBRANZAS:\n' +
      [
        push('Por cobrar este mes', fmtPesos(cob.porCobrarMes), 'scorecard'),
        push('Cobranzas vencidas', fmtPesos(cob.vencidas), 'scorecard'),
      ].join('\n'),
  )

  const obl = c.obligaciones || {}
  bloques.push(
    'OBLIGACIONES Y DEUDA:\n' +
      [
        push('Saldo de obligaciones', fmtPesos(obl.saldo), 'obligacion_resumen / scorecard'),
        push('Obligaciones vencidas', fmtPesos(obl.vencido), 'scorecard'),
        push('Deuda comercial vencida', fmtPesos(obl.deudaComercialVencida), 'scorecard'),
      ].join('\n'),
  )

  const desc = c.descubierto || {}
  bloques.push(
    'COSTO DEL DINERO (descubierto):\n' +
      [
        push('CFT anual del descubierto', desc.cftAnual === null || desc.cftAnual === undefined ? null : `${Number(desc.cftAnual).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`, 'finanzas_condiciones_vigentes'),
        push('Límite del descubierto', fmtPesos(desc.limite), 'finanzas_condiciones_vigentes'),
        push('Descubierto usado', fmtPesos(desc.usado), 'finanzas_condiciones_vigentes'),
      ].join('\n'),
  )

  // Notas libres (recomendaciones del motor, próximos vencimientos del calendario, etc.). Son TEXTO ya
  // producido por el OS; se pasan tal cual, sin recalcular. Si no hay, se declara.
  const notas = Array.isArray(c.notas) ? c.notas.filter((n) => typeof n === 'string' && n.trim()) : []
  if (notas.length) {
    bloques.push('SEÑALES DEL MOTOR (calendario / recomendaciones vigentes):\n' + notas.map((n) => `- ${n}`).join('\n'))
  } else {
    bloques.push('SEÑALES DEL MOTOR: No tengo señales cargadas del calendario/recomendaciones para esta consulta.')
  }

  const marca = typeof c.capturadoEn === 'string' && c.capturadoEn ? c.capturadoEn : null
  const cabecera = marca
    ? `Contexto financiero real del OS, materializado ${marca}. Todo lo de abajo es dato del OS o "No tengo ese dato" — NO agregues ni estimes cifras que no estén acá.`
    : 'Contexto financiero real del OS (sin fecha de corte informada). Todo lo de abajo es dato del OS o "No tengo ese dato" — NO agregues ni estimes cifras que no estén acá.'

  return { texto: `${cabecera}\n\n${bloques.join('\n\n')}`, faltantes }
}

// Encuadre de rol de una lente: persona + criterio de su skill + disciplina de evidencia + concisión.
function roleFramingLente(lente) {
  return (
    `Sos ${lente.persona}. Estás leyendo el Flujo de Fondos de la empresa desde TU lente. ` +
    `Razoná CON el criterio profesional de tus skills (no las recites): ${lente.foco} ` +
    `Distinguí HECHO / DATO / CÁLCULO / INFERENCIA / ESTIMACIÓN / RECOMENDACIÓN. ` +
    `NUNCA inventes un número: si un dato dice "No tengo ese dato", tratalo como faltante y decilo. ` +
    `DIRECTO y CONCISO: 3 a 6 puntos con tu lectura y, si hay, UNA recomendación desde tu dominio.`
  )
}

// Prompt de usuario de una lente: la pregunta del dueño + el contexto financiero determinístico.
function promptLente(pregunta, contextoTexto) {
  return (
    `PREGUNTA DEL DUEÑO:\n${pregunta}\n\n` +
    `CONTEXTO FINANCIERO (única fuente de cifras — no agregues otras):\n${contextoTexto}\n\n` +
    `Dame tu lectura experta de esta situación desde tu lente, aplicada a la pregunta.`
  )
}

// ── Comparación entre las tres lentes ──────────────────────────────────────────────────────────────

const MARCADOR_COINCIDENCIAS = /^\s*coincidencias?\s*:?\s*$/i
const MARCADOR_CONFLICTOS = /^\s*(conflictos?|tensiones?|desacuerdos?)\s*:?\s*$/i

// Quita viñetas/numeración de una línea para quedarnos con el punto.
function limpiarViñeta(l) {
  return l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()
}

/**
 * Parsea el texto de comparación producido por el razonador en { coincidencias[], conflictos[] }.
 * DETERMINÍSTICO: separa por los encabezados COINCIDENCIAS / CONFLICTOS y toma las viñetas de cada
 * sección. Robusto: si el razonador no usó encabezados, ambas listas quedan vacías y `texto` conserva
 * la comparación cruda para no perder nada. Es la pieza que hace testeable "detectó un conflicto".
 */
export function parseComparacion(texto) {
  const coincidencias = []
  const conflictos = []
  let seccion = null
  for (const raw of String(texto || '').split('\n')) {
    const linea = raw.trim()
    if (!linea) continue
    if (MARCADOR_COINCIDENCIAS.test(linea)) { seccion = 'coinc'; continue }
    if (MARCADOR_CONFLICTOS.test(linea)) { seccion = 'confl'; continue }
    // Encabezado con contenido en la misma línea: "CONFLICTOS: el financiero vs el contador"
    const mCoinc = linea.match(/^coincidencias?\s*:\s*(.+)$/i)
    if (mCoinc) { seccion = 'coinc'; coincidencias.push(limpiarViñeta(mCoinc[1])); continue }
    const mConfl = linea.match(/^(?:conflictos?|tensiones?|desacuerdos?)\s*:\s*(.+)$/i)
    if (mConfl) { seccion = 'confl'; conflictos.push(limpiarViñeta(mConfl[1])); continue }
    // Otro encabezado en mayúsculas termina la sección actual.
    if (/^[A-ZÁÉÍÓÚÑ ]{4,}:?\s*$/.test(linea) && !MARCADOR_COINCIDENCIAS.test(linea) && !MARCADOR_CONFLICTOS.test(linea)) {
      seccion = null
      continue
    }
    if (seccion === 'coinc') coincidencias.push(limpiarViñeta(linea))
    else if (seccion === 'confl') conflictos.push(limpiarViñeta(linea))
  }
  return {
    coincidencias: coincidencias.filter(Boolean),
    conflictos: conflictos.filter(Boolean),
    texto: String(texto || '').trim(),
  }
}

function roleFramingComparacion() {
  return (
    'Sos el DIRECTOR FINANCIERO que integra a su equipo (contador, abogado, financiero) de Echegaray ' +
    'Construcciones. Te doy las tres lecturas del MISMO Flujo de Fondos. Tu trabajo NO es repetirlas: ' +
    'es CONTRASTARLAS. Devolvé EXACTAMENTE dos secciones con viñetas y sin relleno:\n' +
    'COINCIDENCIAS:\n- (dónde las tres —o dos— leen lo mismo)\n' +
    'CONFLICTOS:\n- (dónde CHOCAN: p. ej. el financiero dice "pagá ya por pronto pago" pero el contador ' +
    'marca "ese gasto es de otro período" y el abogado "ese proveedor tiene un reclamo abierto"). ' +
    'Si no hay conflictos reales, escribí "- Ninguno relevante". NUNCA inventes un número.'
  )
}

function promptComparacion(pregunta, lecturas) {
  const cuerpo = lecturas
    .map((l) => `### Lectura del ${l.titulo}${l.error ? ' (no disponible)' : ''}\n${l.error ? `(${l.error})` : l.texto}`)
    .join('\n\n')
  return (
    `PREGUNTA DEL DUEÑO:\n${pregunta}\n\n` +
    `LAS TRES LECTURAS:\n\n${cuerpo}\n\n` +
    'Contrastalas en COINCIDENCIAS y CONFLICTOS como se te indicó.'
  )
}

// ── Orquestador ─────────────────────────────────────────────────────────────────────────────────

const MODELO_DEFAULT = 'haiku' // el más barato que alcanza; opts.model lo sube a 'sonnet' si se pide.

/**
 * Corre las tres lentes + la comparación sobre una pregunta y un contexto financiero YA leído.
 *
 * @param {object} args
 * @param {string} args.pregunta   pregunta del dueño en lenguaje natural
 * @param {object} args.contexto   contexto financiero leído de las fuentes únicas (ver construirContextoTexto)
 * @param {(job:object)=>Promise<{texto:string,model?:string,costUsd?:number|null}>} args.razonar
 *        razonador inyectado: recibe { lente, persona, skills, roleFraming, prompt, model, maxTokens }
 *        y devuelve el texto. En producción lo provee fe-multiexperto-wiring; en tests es un fake.
 * @param {object} [args.opts]     { model?: 'haiku'|'sonnet'|'opus', maxTokens?, lentes?: string[] }
 * @returns {Promise<object>} resultado con lecturas[], comparacion, contextoTexto, faltantes, costoTotalUsd
 */
export async function analizarMultiexperto({ pregunta, contexto, razonar, opts = {} } = {}) {
  if (typeof pregunta !== 'string' || !pregunta.trim()) {
    throw new Error('fe-multiexperto: falta la pregunta del dueño.')
  }
  if (typeof razonar !== 'function') {
    throw new Error('fe-multiexperto: falta el razonador inyectado (razonar).')
  }

  const { texto: contextoTexto, faltantes } = construirContextoTexto(contexto)
  const model = opts.model || MODELO_DEFAULT
  const maxTokens = opts.maxTokens || 700

  // Qué lentes correr (por defecto las tres). Permite acotar para pruebas o consultas de una sola lente.
  const seleccion = Array.isArray(opts.lentes) && opts.lentes.length
    ? opts.lentes.map((id) => LENTES_POR_ID.get(id)).filter(Boolean)
    : LENTES

  let costoTotalUsd = 0
  let costoConocido = false
  const sumarCosto = (c) => {
    if (c === null || c === undefined) return
    const n = Number(c)
    if (Number.isFinite(n)) { costoTotalUsd += n; costoConocido = true }
  }

  // Las tres lentes en paralelo: son independientes. Si una falla, NO tira toda la consulta: esa
  // lente queda marcada como no disponible y las otras siguen (resiliencia > falla total).
  const lecturas = await Promise.all(
    seleccion.map(async (lente) => {
      const base = { id: lente.id, titulo: lente.titulo, persona: lente.persona, skills: lente.skills.slice(), foco: lente.foco }
      try {
        const r = await razonar({
          lente: lente.id,
          persona: lente.persona,
          skills: lente.skills.slice(),
          roleFraming: roleFramingLente(lente),
          prompt: promptLente(pregunta, contextoTexto),
          model,
          maxTokens,
        })
        sumarCosto(r?.costUsd)
        return { ...base, texto: String(r?.texto ?? '').trim(), model: r?.model ?? model, costUsd: r?.costUsd ?? null, error: null }
      } catch (err) {
        return { ...base, texto: '', model, costUsd: null, error: err instanceof Error ? err.message : String(err) }
      }
    }),
  )

  // Comparación: sólo tiene sentido con al menos 2 lecturas disponibles. Es una 4ª llamada barata
  // (sin skills: es integración, no criterio de dominio nuevo).
  const disponibles = lecturas.filter((l) => !l.error && l.texto)
  let comparacion
  if (disponibles.length >= 2) {
    try {
      const r = await razonar({
        lente: 'comparacion',
        persona: 'el Director Financiero que integra al equipo',
        skills: [],
        roleFraming: roleFramingComparacion(),
        prompt: promptComparacion(pregunta, lecturas),
        model,
        maxTokens: Math.max(500, Math.min(maxTokens, 900)),
      })
      sumarCosto(r?.costUsd)
      comparacion = { ...parseComparacion(r?.texto), model: r?.model ?? model, costUsd: r?.costUsd ?? null, error: null }
    } catch (err) {
      comparacion = { coincidencias: [], conflictos: [], texto: '', model, costUsd: null, error: err instanceof Error ? err.message : String(err) }
    }
  } else {
    comparacion = {
      coincidencias: [],
      conflictos: [],
      texto: '',
      model,
      costUsd: null,
      error: 'No hay suficientes lecturas disponibles para comparar (se necesitan al menos dos).',
    }
  }

  return {
    pregunta,
    contextoTexto,
    faltantes,
    lecturas,
    comparacion,
    costoTotalUsd: costoConocido ? Math.round(costoTotalUsd * 1e6) / 1e6 : null,
    corridoEn: new Date().toISOString(),
  }
}
