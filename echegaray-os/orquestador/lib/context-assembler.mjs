// Context Assembler. La Messages API es texto→texto y NO recibe gratis lo que el
// CLI obtenía por correr con cwd dentro del repo (la gobernanza de CLAUDE.md y
// las SKILL.md). Este módulo reconstruye ese contexto de forma DETERMINÍSTICA y
// AUDITABLE, arma el `system` del Reasoner por rol:
//
//   system = Gobernanza(KERNEL, o CLAUDE.md completo si GOVERNANCE_FULL)
//          + ConocimientoGenésico(dominio)  ← SKILL.md leída del repo (solo lectura)
//
// El contexto OPERATIVO (digest situacional + tarea) NO va acá: lo arma cada
// handler en el `prompt` de usuario. Acá vive lo estable (gobernanza + skill).
//
// Nota de alcance: esta etapa NO incorpora conocimiento APRENDIDO (orq.knowledge)
// — eso es la próxima etapa del roadmap. Sólo conocimiento genésico (archivos).
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Raíz del repo, robusta al cwd (orquestador/lib -> ../..). Las SKILL.md viven en
// <REPO_ROOT>/.claude/skills/<name>/SKILL.md. Resolver por NOMBRE elimina la
// fragilidad de depender de rootPath (bug latente: si rootPath cambiaba, las skills
// dejaban de cargar en silencio, sin que nadie lo notara).
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DEFAULT_SKILLS_DIR = path.join(REPO_ROOT, '.claude', 'skills')

// KERNEL de gobernanza: destilación fiel de las reglas VINCULANTES de CLAUDE.md
// (misión, clasificación de evidencia, niveles de autonomía, confianza, estilo).
// Es lo que el CLI aportaba implícitamente. Se inyecta SIEMPRE. Para el documento
// estratégico completo, GOVERNANCE_FULL inyecta el CLAUDE.md raíz entero (más caro).
export const GOVERNANCE_KERNEL = `GOBERNANZA DEL BUSINESS OS — ECHEGARAY CONSTRUCCIONES (reglas vinculantes)

MISIÓN: hacer que Echegaray Construcciones funcione cada vez mejor porque el Business OS existe — cotizar mejor, seleccionar mejor, ejecutar mejor, controlar antes, cobrar mejor, generar más margen y más caja, aprender y crecer.

CLASIFICACIÓN DE EVIDENCIA (obligatoria, nunca la mezcles ni muestres más precisión que la evidencia):
HECHO · DATO REAL · CÁLCULO · INFERENCIA · ESTIMACIÓN · PROYECCIÓN · NORMA OBLIGATORIA · INTERPRETACIÓN PROFESIONAL · RECOMENDACIÓN · DESCONOCIDO.

CONFIANZA: nunca fabrices datos. Nunca ocultes gaps. Si falta un dato, decilo explícitamente ("No tengo ese dato"). Nunca presentes una inferencia o estimación como hecho.

CRITERIOS ECONÓMICOS: P&L siempre devengado; Cash Flow siempre percibido — nunca los mezcles. Nunca confundas facturación con rentabilidad, ni rentabilidad con caja. Nunca compares ventanas de tiempo incompatibles.

NIVELES DE AUTONOMÍA: A Observar · B Investigar · C Preparar · D Actuar internamente · E Ejecutar externamente. Sólo A–D son autónomos. Todo lo que tenga efecto económico, contractual, fiscal, laboral, legal o comunicacional externo (Nivel E) NO se ejecuta: se registra como solicitud de aprobación humana.

JURISDICCIÓN: San Juan, Argentina — distinguí normativa nacional, provincial, municipal y contractual. Todo conocimiento normativo cambiante se verifica antes de usarse como vigente.

ESTILO: español, directo, preciso. No felicites, no uses lenguaje corporativo vacío, no repitas. Usá números cuando existan. No inventes precisión falsa. Respuestas cortas cuando alcanza; profundidad real cuando el problema lo exige.`

/** Lee un archivo de texto de forma defensiva. Devuelve null si no existe. */
async function readTextSafe(absPath) {
  try {
    return await readFile(absPath, 'utf8')
  } catch {
    return null
  }
}

// Secciones META/gobernanza de una SKILL.md que NO ayudan a razonar en una respuesta de chat
// (son sobre vigencia de fuentes, jurisdicción ya cubierta por el kernel, límites, gaps,
// aprendizaje, y cableado con el OS). Descartarlas recorta ~22% de tokens por skill sin perder
// NADA del criterio operativo (propósito, reglas, preguntas, marcos, criterios, errores,
// controles, prohibiciones). El worker de análisis profundo puede seguir cargando todo.
const SKILL_META_HEADING = /^##\s+(Sistema de fuentes|Pol[ií]tica de fuentes|Jurisdicci[óo]n|L[íi]mites de certeza|Gaps de conocimiento|Mecanismo de aprendizaje|Relaci[óo]n con el OS|Interacci[óo]n con otras skills)\b/i

/** Devuelve la SKILL.md sin sus secciones meta/gobernanza. Determinístico: corta por headings
 *  `##`; una sección meta se omite hasta el próximo `##`. No toca el conocimiento operativo. */
export function compactSkillMd(md) {
  if (typeof md !== 'string' || !md) return md
  const out = []
  let skip = false
  for (const line of md.split('\n')) {
    if (/^##\s+/.test(line)) skip = SKILL_META_HEADING.test(line) // reevaluar en cada sección
    if (!skip) out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Arma el `system` para una tarea de razonamiento.
 * @param {object} p
 * @param {string} p.rootPath      raíz del repo donde corre el worker (app/)
 * @param {object} p.config        config validada (usa GOVERNANCE_FULL)
 * @param {string} [p.roleFraming] encuadre de rol (una línea) prepend al kernel
 * @param {string} [p.contextRef]  ruta relativa a rootPath de la skill del agente
 *                                  (ej. 'echegaray-os/.claude/skills/finanzas...');
 *                                  se lee <contextRef>/SKILL.md
 * @param {object} [p.logger]
 * @returns {Promise<{ system: string, skillLoaded: boolean, governance: 'kernel'|'full' }>}
 */
export async function assembleReasoningSystem({ rootPath, config, roleFraming, contextRef, skillNames, skillsDir, logger, compact = false }) {
  const parts = []
  if (roleFraming) parts.push(roleFraming)

  let governance = 'kernel'
  parts.push(GOVERNANCE_KERNEL)
  if (config?.GOVERNANCE_FULL) {
    const full = await readTextSafe(path.join(rootPath, 'CLAUDE.md'))
    if (full) {
      parts.push('--- CLAUDE.md (documento estratégico completo) ---\n' + full)
      governance = 'full'
    } else if (logger) {
      logger.warn('context-assembler: GOVERNANCE_FULL activo pero CLAUDE.md no encontrado', { rootPath })
    }
  }

  // CONOCIMIENTO DE DOMINIO. Preferí `skillNames` (una o VARIAS skills por nombre,
  // resueltas de forma robusta al cwd) — es la vía "según la tarea": el conjunto lo
  // decide la capacidad de la tarea. Fallback a `contextRef` (legacy, ruta relativa
  // a rootPath). Se cargan TODAS las skills del conjunto; lo que falta se declara.
  const loaded = []
  const missing = []
  const baseDir = skillsDir || DEFAULT_SKILLS_DIR
  const names = Array.isArray(skillNames) ? skillNames.filter(Boolean) : null

  if (names && names.length) {
    for (const name of names) {
      const raw = await readTextSafe(path.join(baseDir, name, 'SKILL.md'))
      const skill = raw && compact ? compactSkillMd(raw) : raw
      if (skill) {
        loaded.push(name)
        parts.push(`--- CONOCIMIENTO DE TU DOMINIO: ${name} (aplicá su criterio profesional) ---\n${skill}`)
      } else {
        missing.push(name)
        if (logger) logger.warn('context-assembler: SKILL.md no encontrada', { skill: name })
      }
    }
    if (missing.length) {
      parts.push(`(Nota: no se pudieron leer estas skills: ${missing.join(', ')} — razoná con la gobernanza y el estado real, sin fabricar criterio en esos dominios.)`)
    }
  } else if (contextRef) {
    const skill = await readTextSafe(path.join(rootPath, contextRef, 'SKILL.md'))
    if (skill) {
      loaded.push(contextRef)
      parts.push(`--- CONOCIMIENTO DE TU DOMINIO (skill del repo, aplicá su criterio profesional) ---\n${skill}`)
    } else {
      parts.push(`(Nota: no se pudo leer la skill de dominio en ${contextRef}/SKILL.md — razoná con la gobernanza y el estado real, sin fabricar criterio.)`)
      if (logger) logger.warn('context-assembler: SKILL.md no encontrada', { contextRef })
    }
  }

  return { system: parts.join('\n\n'), skillLoaded: loaded.length > 0, skillsLoaded: loaded, governance }
}

// Encuadres de rol reutilizables (una línea que precede al kernel).
export const ROLE_FRAMING = {
  director:
    'Sos el DIRECTOR GENERAL IA de Echegaray Construcciones: dirigís una organización de especialistas; no implementás ni calculás vos mismo.',
  specialist:
    'Sos un ESPECIALISTA de dominio de Echegaray Construcciones, parte de una organización dirigida por el Director General IA. Trabajás SOLO en tu dominio.',
  consolidation:
    'Sos el DIRECTOR GENERAL IA cerrando un objetivo: integrás el trabajo de tus especialistas para la Dirección humana.',
}
