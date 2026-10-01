// QUIÉN PUEDE RENDIR CONTRA QUÉ ENTREGA — la regla, sin base, sin red y sin React.
//
// Pedido del dueño (01/10/2026): «como admin tengo que poder rendir con foto y aplicárselo a la rendición de
// cualquiera». La regla es la de `_efectivo_actua_por` (migración 20261001T0100 §11), escrita acá para que la
// acción del servidor la pregunte ANTES de subir nada y para que la pantalla no ofrezca lo que la base rechaza:
//
//   · Dirección/Administración (`ve_economia`) → la entrega de CUALQUIERA, incluida la propia.
//   · Jefe de obra                              → sólo la SUYA.
//   · Operario (campo)                          → ninguna: sus gastos los rinde Administración.
//
// La base sigue siendo la última puerta; esto evita una foto subida al bucket para que después la RPC diga que no.

import type { EntregaSaldo } from './tipos.ts'
import { abiertas } from './logica.ts'

export interface QuienRinde {
  /** `ve_economia()` confirmado por la base: Dirección o Administración. */
  veEconomia: boolean
  /** `es_administracion()`: jefe de obra, Administración o Dirección. Un operario es false. */
  puedeRendir: boolean
  /** La persona del usuario que carga, o null si no tiene vínculo. */
  personaPropia: string | null
}

/** ¿Puede esta persona cargar un ticket contra la entrega de `personaDeLaEntrega`? */
export function puedeRendirContra(q: QuienRinde, personaDeLaEntrega: string | null | undefined): boolean {
  if (q.veEconomia) return true
  if (!q.puedeRendir || !q.personaPropia || !personaDeLaEntrega) return false
  return q.personaPropia === personaDeLaEntrega
}

/** Las entregas abiertas entre las que esta persona puede elegir: todas para Administración, las propias para el resto. */
export function entregasElegibles(q: QuienRinde, todas: readonly EntregaSaldo[]): EntregaSaldo[] {
  return abiertas(todas).filter((e) => puedeRendirContra(q, e.persona_id))
}

/** La entrega pedida en la URL: por id o por código `ER-0147` (el que viaja en los enlaces de Administración). */
export function entregaPedida(entregas: readonly EntregaSaldo[], pedida: string | null | undefined): EntregaSaldo | null {
  const p = pedida?.trim()
  if (!p) return null
  return entregas.find((e) => e.id === p || e.codigo.toLowerCase() === p.toLowerCase()) ?? null
}

/**
 * Adónde lleva elegir una entrega. Si es de OTRA persona viaja `por=`: las pantallas de después (confirmar, sin
 * foto) y la flecha de vuelta ya saben actuar a nombre de alguien con ese parámetro. Si es la propia no se agrega:
 * en el teléfono la vuelta tiene que ser «Mi efectivo».
 */
export function hrefDeRendir(e: Pick<EntregaSaldo, 'id' | 'persona_id'>, personaPropia: string | null): string {
  const base = `/mi-informacion/efectivo/rendir?entrega=${e.id}`
  return e.persona_id === personaPropia ? base : `${base}&por=${e.persona_id}`
}
