// QUÉ RECIBOS ANTERIORES QUEDAN REEMPLAZADOS AL EMITIR OTRO — la regla, sin base y sin pantalla.
//
// Dueño, 02/10/2026: re-emitir el recibo de una persona para la misma quincena dejaba OTRO recibo numerado y
// el anterior seguía «vigente» (Aguero tenía RP-000002, 03 y 04). El número no se reutiliza ni se borra: el
// anterior pasa a `reemplazado` apuntando al nuevo.
//
// LA ESCRITURA ES DE LA BASE (`registrar_recibo_liquidacion`, migración 20261002T2000), en la misma transacción
// que el insert: así no puede quedar a medias. Esta función dice lo mismo ANTES de emitir, para dos cosas que
// la base sola no puede decir en castellano: avisar que ya hay un recibo firmado (y no emitir encima), y poder
// contar después qué se reemplazó. Si cambia una condición, cambia en los dos lados: `reemplazo.contrato.test.ts`
// lee la migración y falla si las condiciones se separan.

export interface ReciboParaReemplazo {
  id: string
  codigo: string | null
  personaId: string
  quincenaDesde: string
  quincenaHasta: string
  estado: string
  firmadoEn: string | null
  papelPath: string | null
  papelSinFotoEn: string | null
  archivadoEn: string | null
}

export interface QuincenaDeUnRecibo {
  /** El recién emitido, si ya existe: nunca se reemplaza a sí mismo. */
  id?: string
  personaId: string
  quincenaDesde: string
  quincenaHasta: string
}

/**
 * ¿Alguien lo firmó, de la forma que sea? Se mira el SELLO (trazo, foto, papel marcado) y no sólo el estado:
 * un recibo con la foto cargada puede seguir diciendo «enviado» y no por eso es reemplazable. Archivado
 * también: la base sólo archiva lo firmado.
 */
const tieneFirma = (r: ReciboParaReemplazo): boolean =>
  Boolean(r.firmadoEn) || Boolean(r.papelPath) || Boolean(r.papelSinFotoEn) || Boolean(r.archivadoEn)
  || r.estado === 'archivado' || r.estado === 'firmado_telefono' || r.estado === 'firmado_papel'

export function decidirReemplazo(
  previos: readonly ReciboParaReemplazo[], nuevo: QuincenaDeUnRecibo,
): { reemplazar: ReciboParaReemplazo[]; firmado: ReciboParaReemplazo | null } {
  const mismos = previos.filter((r) =>
    r.id !== nuevo.id && r.estado !== 'reemplazado'
    && r.personaId === nuevo.personaId
    && r.quincenaDesde === nuevo.quincenaDesde && r.quincenaHasta === nuevo.quincenaHasta)
  return {
    reemplazar: mismos.filter((r) => !tieneFirma(r)),
    firmado: mismos.find(tieneFirma) ?? null,
  }
}
