// PR-3 · Identidad y autenticación (DISEÑO — no duplicar usuarios).
//
// Principio no negociable: Mattermost NO es una segunda base de usuarios del OS.
// El OS ya tiene su identidad (public.perfiles / orq.principals). Mattermost
// tiene la suya (sus users). Este módulo define el PUENTE entre ambas sin
// copiar ni ser fuente de verdad de ninguna.
//
// Lo que hace hoy (PR-3): resolver, en ambos sentidos, "este user de Mattermost
// ¿qué principal del OS es?" contra una tabla de mapeo (comunicacion.identidades),
// y clasificar el nivel de confianza del vínculo. NO crea usuarios, NO sincroniza
// contraseñas, NO decide permisos: sólo traduce identidades.
//
// Camino futuro (documentado, NO implementado acá): unificar login vía el mismo
// IdP del OS (Supabase Auth / OIDC) de modo que un user de Mattermost y un
// principal del OS sean la MISMA cuenta, y el mapeo deje de hacer falta. Hasta
// entonces, el mapeo explícito es la única fuente del vínculo.

/** Nivel de confianza del vínculo identidad-plataforma ↔ identidad-OS. */
export const CONFIANZA = Object.freeze({
  VERIFICADO: 'verificado', // vínculo confirmado (mismo email corporativo, o alta manual auditada)
  INFERIDO: 'inferido', // coincidencia por email/nombre, sin confirmar
  DESCONOCIDO: 'desconocido', // no hay vínculo → tratar como anónimo/externo
})

/**
 * Resolutor de identidad. Depende de un puerto de repositorio de identidades
 * (memoria o postgres), no de una tabla concreta. Todo async para que la
 * implementación real pueda ir a la base.
 */
export class ResolutorIdentidad {
  /** @param {{buscarPorPlataforma:Function, buscarPorPrincipal:Function}} repo */
  constructor(repo) {
    if (!repo) throw new Error('ResolutorIdentidad: falta repo de identidades')
    this.repo = repo
  }

  /** Dado un actor entrante de la plataforma, devuelve el principal del OS y la
   *  confianza del vínculo. Nunca inventa un principal: si no hay mapeo, DESCONOCIDO. */
  async resolverDesdePlataforma(plataforma, plataformaUserId) {
    if (!plataformaUserId) return { principal_id: null, confianza: CONFIANZA.DESCONOCIDO }
    const fila = await this.repo.buscarPorPlataforma(plataforma, plataformaUserId)
    if (!fila) return { principal_id: null, confianza: CONFIANZA.DESCONOCIDO }
    return { principal_id: fila.principal_id, confianza: fila.confianza ?? CONFIANZA.INFERIDO }
  }

  /** Dado un principal del OS, devuelve su identidad en la plataforma (para
   *  poder, por ejemplo, mencionarlo o mandarle un DM). */
  async resolverHaciaPlataforma(plataforma, principalId) {
    if (!principalId) return null
    return this.repo.buscarPorPrincipal(plataforma, principalId)
  }
}

/** Repositorio de identidades en memoria (tests/demo). Cumple el mismo puerto
 *  que la implementación Postgres sobre comunicacion.identidades. */
export class IdentidadesMemoria {
  constructor(filas = []) {
    this.filas = filas // { plataforma, plataforma_user_id, principal_id, confianza, display }
  }

  async buscarPorPlataforma(plataforma, userId) {
    return this.filas.find((f) => f.plataforma === plataforma && f.plataforma_user_id === userId) ?? null
  }

  async buscarPorPrincipal(plataforma, principalId) {
    return this.filas.find((f) => f.plataforma === plataforma && f.principal_id === principalId) ?? null
  }
}
