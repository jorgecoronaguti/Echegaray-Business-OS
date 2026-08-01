// SKILL 10 · APRENDER DE CORRECCIONES — sin que el agente se reescriba las reglas a sí mismo.
//
// ═══ EL RIESGO QUE ESTA SKILL CONTIENE ═══
//
// Un agente financiero que aprende solo termina cambiando su política de riesgo porque alguien le
// dijo "dale". Este OS ya tiene la lección escrita en el motor de búsqueda: **el aprendizaje sólo se
// produce con una confirmación real; nunca sobre una decisión no confirmada**. Y "gracias" no es una
// confirmación — es cortesía, y ya costó un bug entero confundir las dos cosas.
//
// ═══ LA JERARQUÍA QUE DECIDE QUÉ SE PUEDE APRENDER SOLO ═══
//
// Del `CLAUDE.md` raíz, clasificación A–E:
//
//   A observación aislada       → se registra, no cambia nada
//   B recurrencia               → se registra y se cuenta
//   C patrón probable           → se propone al dueño
//   D conocimiento validado     → requiere aprobación explícita
//   E regla operativa aprobada  → requiere aprobación explícita del dueño
//
// Una política financiera (reserva mínima, tolerancia al riesgo, instrumentos excluidos, moneda) es
// SIEMPRE D o E. Nunca se modifica automáticamente, ni con tres confirmaciones ni con treinta.

/** Tipos de corrección. Confundirlos es lo que convierte un typo en una política. */
export const TIPO_CORRECCION = {
  DATO: 'correccion_dato', // "el saldo no es ese"
  PREFERENCIA: 'preferencia', // "prefiero fondos de esta administradora"
  POLITICA: 'politica_financiera', // "nunca menos de $5M de reserva"
  EXCEPCION: 'excepcion_temporal', // "esta semana no inviertas nada"
  ERROR_EXTRACTOR: 'error_extractor', // "esa tasa está mal leída"
  ERROR_MODELO: 'error_modelo', // "el cálculo del neto está mal"
  DECISION_PUNTUAL: 'decision_puntual', // "esta vez sí, igual"
}

/** Qué se puede incorporar solo y qué no. Es la tabla que hace que esta skill sea segura. */
export const GOBERNANZA = {
  [TIPO_CORRECCION.DATO]: { clase: 'B', automatico: true, alcance: 'la corrida en curso' },
  [TIPO_CORRECCION.PREFERENCIA]: { clase: 'C', automatico: false, alcance: 'propuesta al dueño' },
  [TIPO_CORRECCION.POLITICA]: { clase: 'E', automatico: false, alcance: 'requiere aprobación explícita del dueño' },
  [TIPO_CORRECCION.EXCEPCION]: { clase: 'D', automatico: false, alcance: 'requiere confirmación y lleva vigencia' },
  [TIPO_CORRECCION.ERROR_EXTRACTOR]: { clase: 'B', automatico: true, alcance: 'marca el instrumento como no confiable' },
  [TIPO_CORRECCION.ERROR_MODELO]: { clase: 'A', automatico: false, alcance: 'se registra como hallazgo de ingeniería' },
  [TIPO_CORRECCION.DECISION_PUNTUAL]: { clase: 'A', automatico: false, alcance: 'no generaliza' },
}

/**
 * FRASES QUE NO SON CONFIRMACIÓN. La lista existe porque el modo de fallar es siempre el mismo: el
 * usuario agradece, el sistema lo lee como "sí", y una política cambia sola.
 */
const CORTESIA = /^\s*(gracias|ok+|dale|joya|barbaro|bárbaro|perfecto|genial|listo|buenisimo|buenísimo|👍|👌|🙏)\s*[.!]*\s*$/i

/**
 * ¿Esto es una confirmación real? Una confirmación real dice QUÉ se confirma. "Sí, usá $5M de reserva"
 * lo dice; "dale" no dice nada, y por eso no aprende.
 */
export function esConfirmacionReal(texto = '', contexto = {}) {
  const t = String(texto).trim()
  if (!t) return { confirma: false, motivo: 'texto vacío' }
  if (CORTESIA.test(t)) return { confirma: false, motivo: 'es una cortesía, no una decisión: no dice qué se confirma' }
  if (!contexto.propuesta_id) return { confirma: false, motivo: 'no hay una propuesta abierta a la que se refiera' }
  // SIN TILDES ANTES DE BUSCAR LA AFIRMACIÓN. `\b` de JS no considera "í" un carácter de palabra, así
  // que `\bsí\b` NUNCA matchea — y el usuario que escribe "sí, confirmo" en castellano quedaba sin
  // confirmar nada. Es el mismo defecto que ya se pagó en el ruteo del chat con el voseo.
  const plano = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const afirma = /\b(si|confirmo|apruebo|aprobado|de acuerdo|hacelo|adelante|correcto|asi es)\b/.test(plano)
  const niega = /\b(no|nunca|jamas|cancela|para|deja)\b/.test(plano)
  if (niega && !afirma) return { confirma: false, rechaza: true, motivo: 'es un rechazo explícito' }
  if (!afirma) return { confirma: false, motivo: 'no hay una afirmación explícita' }
  return { confirma: true, motivo: 'afirmación explícita sobre una propuesta abierta' }
}

/**
 * SKILL 10. Convierte una corrección humana en un registro auditable. NO la aplica: devuelve el
 * registro con su gobernanza, y quien lo consume decide si puede incorporarlo solo.
 */
export function registrarCorreccion(entrada = {}) {
  const tipo = entrada.tipo && GOBERNANZA[entrada.tipo] ? entrada.tipo : TIPO_CORRECCION.DECISION_PUNTUAL
  const gob = GOBERNANZA[tipo]
  const conf = esConfirmacionReal(entrada.texto, entrada)
  return {
    origen: entrada.origen ?? 'mattermost',
    fecha: new Date().toISOString(),
    autor: entrada.autor ?? null,
    contexto: entrada.propuesta_id ?? null,
    tipo,
    clase: gob.clase,
    alcance: gob.alcance,
    vigencia: entrada.vigencia ?? null,
    texto: String(entrada.texto ?? '').slice(0, 500),
    evidencia: entrada.evidencia ?? null,
    // La confianza de que ESTO es una corrección, no la del contenido.
    confianza: conf.confirma ? 'alta' : 'baja',
    confirmacion: conf,
    // LA REGLA DURA, EN LA SALIDA: sólo se aplica solo lo que es automático Y viene confirmado.
    aplicable_automaticamente: Boolean(gob.automatico && conf.confirma),
    requiere_aprobacion: !gob.automatico,
    version_skill: VERSION_SKILL,
  }
}

/**
 * Cambio de política: SIEMPRE queda pendiente. Se expone como función propia para que el llamador no
 * pueda "olvidarse" de la gobernanza pasando por `registrarCorreccion` con otro tipo.
 */
export function proponerCambioPolitica({ clave, valor_actual, valor_propuesto, motivo, autor }) {
  return {
    tipo: TIPO_CORRECCION.POLITICA,
    clase: 'E',
    clave,
    valor_actual: valor_actual ?? null,
    valor_propuesto,
    motivo: motivo ?? null,
    autor: autor ?? null,
    estado: 'PENDIENTE — REQUIERE APROBACIÓN EXPLÍCITA DEL DUEÑO',
    aplicable_automaticamente: false,
    fecha: new Date().toISOString(),
  }
}

export const VERSION_SKILL = '1.0.0'
