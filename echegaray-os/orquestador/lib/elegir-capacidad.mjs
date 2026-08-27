// RUTEO XSAS-PRIMERO: qué capacidad (skill) resuelve una necesidad, DECIDIDO POR CÓDIGO.
//
// Antes de este módulo había dos caminos y un agujero entre ellos:
//   · el chat clasifica la directiva a una `advise.*` y de ahí saca sus skills (classify-directive
//     + skill-map). Cubre 20 de las 44 skills — las otras 24 son inalcanzables por ruteo.
//   · el resto se activaba a mano, o no se activaba.
//
// Acá se cierra: primero se intenta resolver con las MISMAS reglas determinísticas del chat
// (cero latencia, cero tokens), y para las skills que el mapa de capacidades no alcanza hay un
// índice propio de palabras clave tomadas de su `description`. El modelo se consulta SÓLO cuando
// quedan dos candidatas empatadas y débiles — no antes de cada skill, que sería pagar un modelo
// para adivinar lo que un `switch` ya sabe.
//
// PURO y sin DB: el catálogo se lee del disco una vez por proceso (skill-catalogo.mjs cachea).
import { classifyDirectiveMulti, contarMatches } from './classify-directive.mjs'
import { skillsSegunProfundidad, mencionaSheet, SKILL_SHEETS } from './skill-map.mjs'
import { leerCatalogoDeDisco } from './skill-catalogo.mjs'

// ── LA POLÍTICA DE RUTEO, EN UN SOLO LUGAR ──────────────────────────────────────────────────
//
//   NIVEL 0 · DETERMINÍSTICO   SQL, cálculo, regla, estado de la empresa, tool. Sin modelo.
//   NIVEL 1 · CAPACIDAD XSAS   skill + tools + conocimiento validado. Sin modelo cuando alcance.
//   NIVEL 2 · IA LIVIANA       interpretar/clasificar/transformar algo simple: el modelo barato.
//   NIVEL 3 · RAZONAMIENTO     ambiguo, nuevo, multidominio o decisión compleja: el modelo potente.
//
// LA REGLA QUE MANDA SOBRE TODAS: si la ruta interna no tiene evidencia o confianza suficiente,
// ESCALA. Menos modelo NO puede significar peor respuesta — una ruta determinística que no puede
// demostrar que resuelve el caso no es la ruta. Por eso `confianza: 'baja'` y la ambigüedad suben
// a 3 en vez de resolverse rápido y mal.
//
// EL NIVEL 0 NO SE DECIDE ACÁ, A PROPÓSITO. Ya lo resuelve el chat antes de llegar a este ruteo:
// son las ~40 detecciones 0-API de `interactive-server.mjs` (briefing, caja, agenda, memoria,
// avance, libro IVA…) y las tools del OS. Reimplementar acá esas condiciones sería tener dos
// definiciones de la misma regla, y la que quede vieja empezaría a mentir. Lo que sí hace este
// módulo es RECONOCERLO en la métrica: una respuesta que no pagó modelo se registra como nivel 0.
export const NIVEL = { DETERMINISTICO: 0, CAPACIDAD: 1, IA_LIVIANA: 2, RAZONAMIENTO: 3 }

// ── Skills que el mapa de capacidades NO alcanza ─────────────────────────────────────────────
// Las palabras salen de la `description` de cada SKILL.md (su propio "activar cuando…"), no de mi
// criterio. Se evita a propósito el vocabulario ya tomado por `advise.finance` ("caja", "cobranza",
// "pago"): estas skills se suman a la de dominio cuando la necesidad es SU caso, no compiten con
// ella por preguntas generales de plata.
export const SKILL_KEYWORDS = {
  'financial-engineering': ['que pago primero', 'qué pago primero', 'q pago primero', 'priorizar pago', 'priorizar los pagos', 'priorizacion de pago', 'descubierto', 'descontar', 'costo financiero', 'capital de trabajo', 'bache de caja', 'alternativa de financiamiento', 'como cubro', 'cómo cubro', 'conviene financiar', 'optimizar liquidez'],
  'lectura-bancaria-impacto-sheet': ['extracto', 'resumen bancario', 'movimientos del banco', 'captura del banco', 'home banking', 'banca online', 'importar el banco', 'santander'],
  // El dueño escribe en voseo y sin tildes: "cargá el comprobante", "carga este gasto". Un keyword
  // sólo en infinitivo acierta en el test y falla en la conversación real, así que van las tres formas.
  'carga-gastos-multimedia': ['cargar el comprobante', 'cargá el comprobante', 'carga el comprobante', 'cargar comprobante', 'cargá comprobante', 'carga comprobante', 'cargar comprobantes', 'cargar este gasto', 'cargá este gasto', 'cargar el gasto', 'cargá el gasto', 'foto de la factura', 'ticket', 'fajo'],
  'cash-flow-operativo': ['criterio percibido', 'movimiento proyectado', 'movimiento real', 'control de gastos'],
  'admin-finanzas-sheets-clase-mundial': ['reglas de oro', 'redisenar la pestana', 'rediseñar la pestaña', 'rediseñá la pestaña', 'rediseña la pestaña', 'clase mundial', 'minimalista'],
  'appsheet-desarrollo': ['appsheet', 'app de pedidos', 'security filter', 'slice'],
  'tesoreria-inversiones-corporativas': ['plazo fijo', 'money market', 'caucion', 'caución', 'lecap', 'fci', 'invertir', 'inversion', 'inversión', 'excedente', 'plata parada', 'balanz', 'colocar'],
  'diseno-ui-ux-producto-os': ['pantalla', 'componente visual', 'tipografia', 'tipografía', 'paleta', 'maqueta', 'mockup', 'diseno de la web', 'diseño de la web', 'interfaz'],
  'web-ux-deploy-operacion-producto': ['deploy', 'desplegar', 'staging', 'produccion', 'producción', 'navegacion', 'navegación', 'permiso visible'],
  'reportes-automaticos-y-comunicaciones': ['reporte automatico', 'reporte automático', 'reporte periodico', 'reporte periódico', 'mandame todos los', 'enviar el reporte'],
  'discovery-drive-echegaray': ['discovery', 'que hay en el drive', 'qué hay en el drive', 'mapear el drive'],
  // Llegó a `main` DESPUÉS de que se fijara el alcance de la puerta y quedó huérfana: ninguna
  // `advise.*` la nombra. Las frases son literales de su propia `description` («armame una
  // presentación», «preparame las slides para la reunión con X»), no de mi criterio.
  'crear-presentacion-google-slides': ['presentacion', 'presentación', 'slides', 'diapositiva', 'diapositivas', 'armame una presentacion', 'armame una presentación', 'preparame las slides', 'google slides'],
  // Mismo método: las frases son literales de la `description` de la skill («hacé una imagen», «una
  // portada para», «un render de cómo quedaría», «un esquema de»), no de mi criterio. `imagen` a
  // secas NO entra: aparece en pedidos que no son de generar nada («leé la imagen del comprobante»),
  // y una señal ambigua le robaría el ruteo a carga-gastos-multimedia.
  // Cotizar desde planos. Las frases son literales de la `description` de la tool
  // `analizar_planos_y_cotizar` («analizá los planos de X», «armame una cotización de X», «computá
  // los planos»), que es el mismo método con el que se sacaron las demás. `plano` a secas NO entra:
  // «el plano de seguridad» y «según el plano municipal» son otra cosa.
  'costos-presupuestacion': ['analiza los planos', 'analizá los planos', 'analizar los planos', 'analizame los planos', 'computa los planos', 'computá los planos', 'computar los planos', 'computo de los planos', 'cómputo de los planos', 'lee los planos', 'leé los planos', 'leer los planos', 'armame una cotizacion', 'armame una cotización', 'armar una cotizacion', 'armar una cotización', 'cotizacion desde los planos', 'cotización desde los planos', 'cotizar desde los planos'],
  'generar-imagen': ['generar una imagen', 'genera una imagen', 'generá una imagen', 'hacer una imagen', 'hace una imagen', 'hacé una imagen', 'crear una imagen', 'crea una imagen', 'creá una imagen', 'render', 'ilustracion', 'ilustración', 'infografia', 'infografía', 'una portada para', 'imagen conceptual', 'concepto arquitectonico', 'concepto arquitectónico'],
}

// Señales inequívocas: una sola alcanza para decidir. "appsheet" o "lecap" no pueden ser de otro
// dominio; "pantalla" o "ticket" sí (por eso NO están acá y necesitan una segunda coincidencia).
const FUERTES_SKILL = new Set([
  'appsheet', 'lecap', 'caucion', 'caución', 'plazo fijo', 'money market', 'descubierto', 'extracto',
  'home banking', 'balanz', 'discovery', 'mockup', 'fajo', 'slides', 'google slides', 'diapositiva',
  // Pedir un render, una infografía o un concepto arquitectónico no puede significar otra cosa.
  'render', 'infografia', 'infografía', 'concepto arquitectonico', 'concepto arquitectónico', 'imagen conceptual',
  // Pedir que se lean o se computen LOS PLANOS no puede significar otra cosa que cotizar la obra.
  'analiza los planos', 'analizá los planos', 'analizar los planos', 'analizame los planos',
  'computa los planos', 'computá los planos', 'computar los planos', 'computo de los planos', 'cómputo de los planos',
  'armame una cotizacion', 'armame una cotización', 'cotizar desde los planos',
  // Frases enteras que sólo pueden significar una cosa. Van acá porque medido sobre pedidos reales
  // ("qué pago primero esta semana", "cargar el comprobante de la factura de X") la skill dueña
  // quedaba afuera: el dominio ganaba la clasificación y la señal específica pesaba 1 punto.
  'que pago primero', 'qué pago primero', 'q pago primero', 'priorizar pago', 'priorizar los pagos', 'bache de caja',
  'cargar el comprobante', 'cargá el comprobante', 'carga el comprobante', 'cargar comprobante',
  'cargá comprobante', 'carga comprobante', 'cargar comprobantes', 'cargar el gasto', 'cargá el gasto',
  'cargar este gasto', 'cargá este gasto',
  'reporte automatico', 'reporte automático', 'redisenar la pestana', 'rediseñar la pestaña',
  'rediseñá la pestaña', 'rediseña la pestaña',
])

/**
 * ¿EL TEXTO TRAE UNA SEÑAL INEQUÍVOCA? La frase exacta de `FUERTES_SKILL` que matcheó, o `null`.
 *
 * Existe para que una cara —el bot en un canal— pueda decidir si RECLAMA un mensaje sin volver a
 * clasificar. Un atajo exacto no alcanza cuando la frase lleva un nombre propio adentro («analizá
 * los planos de Quattropani»), y estas frases están en esa lista justamente porque no pueden
 * significar otra cosa. PURA.
 */
export function senalFuerteEn(necesidad) {
  const texto = String(necesidad || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const f of FUERTES_SKILL) {
    const plano = f.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (texto.includes(plano)) return f
  }
  return null
}

/** Puntúa las skills del índice propio contra el texto. PURA. */
function puntuarSkillsDirectas(texto) {
  const out = []
  for (const [skill, kws] of Object.entries(SKILL_KEYWORDS)) {
    const score = contarMatches(texto, kws, FUERTES_SKILL)
    if (score > 0) out.push({ skill, score })
  }
  return out.sort((a, b) => b.score - a.score || a.skill.localeCompare(b.skill))
}

/**
 * ELEGIR LA CAPACIDAD PARA UNA NECESIDAD, SIN MODELO.
 *
 * @param {string} necesidad  lo que hay que resolver, en palabras
 * @param {{asesoria?:boolean, maxSkills?:number}} [opts]  asesoria=true cuando la pregunta es de
 *        criterio (se cargan hasta 4 skills); si es un dato, alcanza con 1 (regla de skill-map).
 * @returns {{resolucion:'determinista'|'ambiguo'|'sin_match', skills:string[], capacidad:string|null,
 *            capacidades:string[], candidatas:string[], confianza:'alta'|'media'|'baja'|null, motivo:string}}
 *
 * `resolucion: 'ambiguo'` es la ÚNICA puerta al modelo. `'sin_match'` NO lo es: una necesidad que
 * no matchea nada se atiende como siempre (asistente general) — pagar un modelo para descubrir que
 * no hay skill sería gastar en cada saludo.
 */
export function elegirCapacidad(necesidad, { asesoria = false, maxSkills = 4 } = {}) {
  const texto = String(necesidad || '').toLowerCase().trim()
  if (!texto) return { resolucion: 'sin_match', skills: [], capacidad: null, capacidades: [], candidatas: [], confianza: null, motivo: 'necesidad vacía' }

  const capacidades = classifyDirectiveMulti(texto, 3)
  const directas = puntuarSkillsDirectas(texto)
  const fuertes = directas.filter((d) => d.score >= 2)

  // 1. El mapa de capacidades manda: es el mismo ruteo que ya usan el chat y el worker.
  if (capacidades.length) {
    const base = skillsSegunProfundidad(capacidades, texto, { asesoria })
    // Las directas fuertes se SUMAN al dominio (no lo reemplazan): "qué pago primero" es finanzas
    // Y el motor de ingeniería financiera; quedarse con uno solo pierde la mitad de la respuesta.
    const skills = [...new Set([...base, ...fuertes.map((f) => f.skill)])].slice(0, maxSkills)
    return {
      resolucion: 'determinista', skills, capacidad: capacidades[0], capacidades, candidatas: [],
      confianza: 'alta', motivo: `capacidad ${capacidades[0]} por palabras clave${fuertes.length ? ` + ${fuertes.length} skill(s) directa(s)` : ''}`,
    }
  }

  // 2. Sin capacidad, pero con una señal inequívoca de una skill concreta.
  if (fuertes.length) {
    const skills = fuertes.map((f) => f.skill).slice(0, maxSkills)
    return { resolucion: 'determinista', skills, capacidad: null, capacidades: [], candidatas: [], confianza: 'media', motivo: `skill directa: ${skills.join(', ')}` }
  }

  // 3. Señales débiles: si hay UNA, se toma (con confianza baja y declarada); si hay VARIAS
  //    empatadas, es ambigüedad real y recién ahí vale preguntarle al modelo.
  if (directas.length === 1) {
    return { resolucion: 'determinista', skills: [directas[0].skill], capacidad: null, capacidades: [], candidatas: [], confianza: 'baja', motivo: `única señal: ${directas[0].skill}` }
  }
  if (directas.length > 1) {
    return { resolucion: 'ambiguo', skills: [], capacidad: null, capacidades: [], candidatas: directas.map((d) => d.skill), confianza: null, motivo: 'varias skills con señal débil' }
  }

  // 4. Ni capacidad ni skill: si habla de un Sheet, la regla del CLAUDE.md raíz sigue mandando.
  if (mencionaSheet(texto)) {
    return { resolucion: 'determinista', skills: [SKILL_SHEETS], capacidad: null, capacidades: [], candidatas: [], confianza: 'media', motivo: 'menciona un Sheet: criterio de Sheets obligatorio' }
  }
  return { resolucion: 'sin_match', skills: [], capacidad: null, capacidades: [], candidatas: [], confianza: null, motivo: 'sin señal de dominio' }
}

/**
 * EL NIVEL DE LA POLÍTICA para una elección ya hecha. Necesita el catálogo porque la diferencia
 * entre "la skill tiene un motor del OS detrás" (nivel 1) y "la skill es criterio puro" (nivel 2)
 * es una evidencia del catálogo, no una opinión: los módulos que la skill cita y existen.
 * PURA (recibe el catálogo ya leído).
 *
 * @param {Array} catalogo  fichas de skill-catalogo.mjs
 * @param {{skills:string[], capacidades?:string[], confianza?:string, resolucion?:string}} eleccion
 */
export function nivelDeRuteo(catalogo, eleccion) {
  const { skills = [], capacidades = [], confianza = null, resolucion = null } = eleccion || {}
  // Sin evidencia suficiente se ESCALA. Es la regla que gobierna a las otras tres.
  if (resolucion === 'ambiguo' || confianza === 'baja') return NIVEL.RAZONAMIENTO
  // Multidominio: cruzar dos criterios expertos es exactamente lo que un modelo potente hace bien
  // y lo que una regla no puede hacer sola.
  if (capacidades.length >= 2 || skills.length >= 2) return NIVEL.RAZONAMIENTO
  if (!skills.length) return NIVEL.IA_LIVIANA
  const ficha = (catalogo || []).find((f) => f.clave === skills[0])
  if (!ficha) return NIVEL.IA_LIVIANA
  // Hay código del OS que produce el resultado: la skill trabaja con datos, no adivinando.
  return ficha.modulos?.length ? NIVEL.CAPACIDAD : NIVEL.IA_LIVIANA
}

/** El nivel con el que se RESOLVIÓ un pedido ya contestado. `resolucion` es la del chat
 *  ('determinista' = no pagó modelo ⇒ nivel 0). PURA. */
export function nivelResuelto(catalogo, { resolucionDelChat, skills = [] }) {
  if (resolucionDelChat === 'determinista') return NIVEL.DETERMINISTICO
  if (resolucionDelChat !== 'llm') return null
  return nivelDeRuteo(catalogo, { skills })
}

/**
 * `elegirCapacidad` + el nivel de la política. Carga el catálogo (cacheado en memoria tras la
 * primera vez: 44 fichas, no las 44 SKILL.md enteras).
 */
export async function elegirCapacidadConNivel(necesidad, opts = {}) {
  const r = elegirCapacidad(necesidad, opts)
  const catalogo = await leerCatalogoDeDisco({}).catch(() => [])
  return { ...r, nivel: nivelDeRuteo(catalogo, r) }
}

/**
 * Igual que `elegirCapacidad`, pero con la escotilla al modelo para la ambigüedad real.
 * `escalar` se INYECTA (no se importa un cliente de IA acá) para que esto siga siendo testeable
 * sin API y para que quien llama decida el costo. Si no se inyecta, la ambigüedad se devuelve tal
 * cual: el OS prefiere decir "no sé cuál" antes que elegir al azar.
 *
 * @param {string} necesidad
 * @param {{escalar?: (necesidad:string, candidatas:string[]) => Promise<string|null>}} [opts]
 */
export async function resolverCapacidad(necesidad, { escalar = null, ...opts } = {}) {
  const t0 = Date.now()
  const r = elegirCapacidad(necesidad, opts)
  if (r.resolucion !== 'ambiguo' || !escalar) return { ...r, ms: Date.now() - t0, conModelo: false }
  try {
    const elegida = await escalar(necesidad, r.candidatas)
    if (elegida && r.candidatas.includes(elegida)) {
      return { ...r, resolucion: 'determinista', skills: [elegida], confianza: 'media', motivo: `desempate del modelo entre ${r.candidatas.join(', ')}`, ms: Date.now() - t0, conModelo: true }
    }
    return { ...r, ms: Date.now() - t0, conModelo: true, motivo: `${r.motivo}; el modelo no eligió ninguna de las candidatas` }
  } catch (e) {
    // Que el desempate falle no puede tumbar el ruteo: se devuelve la ambigüedad declarada.
    return { ...r, ms: Date.now() - t0, conModelo: true, motivo: `${r.motivo}; falló el desempate (${String(e?.message ?? e).slice(0, 80)})` }
  }
}
