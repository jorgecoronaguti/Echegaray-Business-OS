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
export async function assembleReasoningSystem({ rootPath, config, roleFraming, contextRef, logger }) {
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

  let skillLoaded = false
  if (contextRef) {
    const skillPath = path.join(rootPath, contextRef, 'SKILL.md')
    const skill = await readTextSafe(skillPath)
    if (skill) {
      parts.push(
        `--- CONOCIMIENTO DE TU DOMINIO (skill del repo, aplicá su criterio profesional) ---\n${skill}`,
      )
      skillLoaded = true
    } else {
      // No inventamos: dejamos constancia de que la skill no se pudo leer.
      parts.push(`(Nota: no se pudo leer la skill de dominio en ${contextRef}/SKILL.md — razoná con la gobernanza y el estado real, sin fabricar criterio.)`)
      if (logger) logger.warn('context-assembler: SKILL.md no encontrada', { contextRef })
    }
  }

  return { system: parts.join('\n\n'), skillLoaded, governance }
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
