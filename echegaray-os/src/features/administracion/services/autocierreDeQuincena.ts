// EL CIERRE SOLO CUANDO TODOS ESTÁN PAGADOS — dueño, 16/09/2026, textual: *«cuando se marcan todos pagados que se
// cierre sola»*.
//
// Lo puro: dado el cuadro del grupo (sus líneas con la marca `pagadaEn`), la persona que se acaba de marcar y los
// pendientes de días, decide si ya están todos pagados, si el sello puede darse (la MISMA traba que el botón
// «Cerrar quincena»: `estadoDeCierre`, ni una regla más ni una menos) y arma la foto que se congela, con el mismo
// filtro que `CuadroLiquidacion` (sin cobra o sin efectivo no se congela: un cero no es un importe verificado).
// La escritura la hace `marcarLineaPagada` en `liquidacionActions.ts`.

import { estadoDeCierre, type DiasPendientesDePersona, type LineaParaCerrar, type Pendiente } from './liquidacionCierre.ts'

export interface LineaMarcable extends LineaParaCerrar {
  personaId: string
  pagadaEn?: string | null
  adelanto: number
  yaTransferido: number
}

export interface LineaCongelada {
  persona_id: string
  horas: number | null
  valor_hora: number | null
  cobra: number
  adelanto: number
  ya_transferido: number
  por_banco: number
  en_efectivo: number
  total: number
}

export interface DecisionDeAutocierre {
  /** Con la persona recién marcada, ¿queda alguien sin marca en el grupo? */
  todasPagadas: boolean
  /** Lo que traba el sello, con la misma lista que ve la pantalla de Cierre. Vacío = se puede cerrar. */
  pendientes: Pendiente[]
  /** Las líneas que se congelan si se cierra. */
  foto: LineaCongelada[]
}

/** La foto de una línea, como la arma el botón «Cerrar quincena». `null` si no se puede congelar. */
export function fotoDeLinea(l: LineaMarcable): LineaCongelada | null {
  if (l.cobra == null || l.enEfectivo == null || l.total == null) return null
  return {
    persona_id: l.personaId, horas: l.horas, valor_hora: l.valorHora, cobra: l.cobra, adelanto: l.adelanto,
    ya_transferido: l.yaTransferido, por_banco: l.porBanco, en_efectivo: l.enEfectivo, total: l.total,
  }
}

export function decisionDeAutocierre({ lineas, personaId, porPersona = [] }: {
  lineas: readonly LineaMarcable[]
  /** La que se acaba de marcar: cuenta como pagada aunque la lectura sea de antes de escribir. */
  personaId: string
  porPersona?: readonly DiasPendientesDePersona[]
}): DecisionDeAutocierre {
  const todasPagadas = lineas.length > 0 && lineas.every((l) => l.personaId === personaId || Boolean(l.pagadaEn))
  if (!todasPagadas) return { todasPagadas: false, pendientes: [], foto: [] }
  const ids = new Set(lineas.map((l) => l.personaId))
  const estado = estadoDeCierre(lineas, { porPersona: porPersona.filter((p) => ids.has(p.personaId)) })
  const foto = lineas.map(fotoDeLinea).filter((f): f is LineaCongelada => f != null)
  const pendientes = [...estado.pendientes]
  if (foto.length === 0) pendientes.push({ clave: 'sin-foto', texto: 'ninguna línea se puede congelar', cuantas: lineas.length })
  return { todasPagadas: true, pendientes, foto }
}

/** El texto que acompaña a «Marcada como pagada» cuando ya están todos. */
export function avisoDeAutocierre(d: DecisionDeAutocierre, cerrada: { ok: true; lineas: number } | { ok: false; error: string } | null): string {
  if (!d.todasPagadas) return 'Marcada como pagada.'
  if (d.pendientes.length > 0) {
    return `Marcada como pagada. Ya están todos pagados, pero NO cerré la quincena: ${d.pendientes.map((p) => p.texto).join(' · ')}`
  }
  if (cerrada == null) return 'Marcada como pagada. Ya están todos pagados.'
  return cerrada.ok
    ? `Marcada como pagada. Todos pagados: quincena cerrada, ${cerrada.lineas} línea(s) congeladas.`
    : `Marcada como pagada. Todos pagados, pero el cierre falló: ${cerrada.error}`
}
