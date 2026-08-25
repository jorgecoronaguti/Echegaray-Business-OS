import type { PermisosPortal } from '../types'

// QUÉ SE DIBUJA DEL PORTAL SEGÚN EL ACCESO — `cliente_acceso` (31) manda sobre `29`/`30`.
//
// ═══ SIN PERMISO NO HAY «—», HAY AUSENCIA ═══
//
// La tentación es dibujar la pantalla completa y tapar los importes con un guión. Está prohibido:
// un «—» en la columna MONTO se lee «este certificado no tiene importe», y el cliente que ve seis
// certificados sin monto concluye que la empresa no le facturó. La sección entera no aparece, y lo
// que queda sigue siendo verdad.
//
// ═══ LOS TRES PERMISOS SON INDEPENDIENTES ═══
//
//   puede_ver_obra    · la solapa «Mi obra», los hitos, las fotos, el avance de la cabecera
//   puede_ver_montos  · TODO importe: la barra del contrato, el A PAGAR, el panel, la columna MONTO
//   puede_aprobar     · la tarjeta «esperando su aprobación» con Observar/Aprobar
//
// Un contacto de obra del cliente (el arquitecto) suele tener obra sin montos; el administrativo que
// paga, montos sin obra. Que las dos combinaciones den una pantalla coherente es el requisito.
//
// LA TARJETA DE APROBACIÓN SIN `puede_aprobar` NO SE DEGRADA A «SÓLO LECTURA»: se retira. Un cartel
// que dice «esperando su aprobación» y no tiene con qué aprobar es una pantalla que pide algo
// imposible; el certificado sigue en la lista de abajo con su estado, que es información honesta.

export type SolapaPortal = 'obra' | 'pagos' | 'docs'

export interface SeccionesPortal {
  /** Las solapas de la cabecera, en el orden del mockup, sin las que el acceso no abre. */
  solapas: SolapaPortal[]
  /** Con qué solapa abre el portal cuando la URL no pide ninguna. */
  inicial: SolapaPortal
  /** La barra «Su contrato» y su leyenda. */
  contrato: boolean
  /** Todo importe: A PAGAR de la cabecera, columna MONTO, A CERTIFICAR, totales. */
  montos: boolean
  /** El panel «A pagar ahora» de la derecha, con Pagar / Informar transferencia / CBU. */
  panel_a_pagar: boolean
  /** La tarjeta del certificado que espera aprobación, con Observar y Aprobar. */
  aprobacion: boolean
  /** El avance de la cabecera de obra y la solapa «Mi obra». */
  obra: boolean
}

/**
 * Qué partes del portal se dibujan para este acceso.
 *
 * @param permisos `null` = acceso sin permisos resueltos todavía (el stub del back, o un acceso
 *   revocado): se asume lo mínimo, que es la lista de documentos. Nunca lo máximo.
 */
export function seccionesVisibles(permisos: PermisosPortal | null | undefined): SeccionesPortal {
  const obra = permisos?.puede_ver_obra === true
  const montos = permisos?.puede_ver_montos === true
  const aprobacion = permisos?.puede_aprobar === true

  const solapas: SolapaPortal[] = []
  if (obra) solapas.push('obra')
  // «Certificados y pagos» sigue existiendo sin permiso de montos: el cliente que no ve importes sí
  // ve QUÉ documentos hay y los descarga. Lo que desaparece es la plata, no el papel.
  solapas.push('pagos', 'docs')

  return {
    solapas,
    inicial: montos ? 'pagos' : obra ? 'obra' : 'pagos',
    contrato: montos,
    montos,
    panel_a_pagar: montos,
    aprobacion,
    obra,
  }
}

/** Si el acceso abre esa obra. `obras: null` = todas las del cliente. */
export function abreLaObra(permisos: PermisosPortal | null | undefined, obraId: string): boolean {
  if (!permisos) return false
  if (permisos.obras === null) return true
  return permisos.obras.includes(obraId)
}

/**
 * EL IMPORTE, o `null` si esta persona no tiene derecho a verlo. NUNCA 0.
 *
 * Vive acá —y no en el service que la usa— porque es una REGLA y tiene que poder probarse sin
 * levantar Supabase: el service importa `@/lib/supabase/server`, y un test que lo arrastre no
 * corre con `node --test`, que es el runner que produce la evidencia de cierre de este repo.
 *
 * La diferencia entre `null` y `0` acá es la diferencia entre «no te lo mostramos» y «no vale
 * nada», y del otro lado hay alguien que no trabaja en la empresa.
 */
export const enmascararMonto = (v: unknown, puede: boolean): number | null =>
  (puede && v != null ? Number(v) : null)
