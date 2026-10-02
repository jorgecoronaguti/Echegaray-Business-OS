// EL CIERRE SOLO CUANDO TODOS ESTÁN PAGADOS — dueño, 16/09/2026, textual: *«cuando se marcan todos pagados que se
// cierre sola»*.
//
// Lo puro: dado el cuadro del grupo (sus líneas con la marca `pagadaEn`), la persona que se acaba de marcar y los
// pendientes de días, decide si ya están todos pagados, si el sello puede darse (la MISMA traba que el botón
// «Cerrar quincena»: `estadoDeCierre`, ni una regla más ni una menos) y arma la foto que se congela, con el mismo
// filtro que `CuadroLiquidacion` (sin cobra o sin efectivo no se congela: un cero no es un importe verificado).
// La escritura la hace `marcarLineaPagada` en `liquidacionActions.ts`.

import { estadoDeCierre, type DiasPendientesDePersona, type LineaParaCerrar, type Pendiente } from './liquidacionCierre.ts'
import { fotoDeLaLinea, fotosDelGrupo, type LineaDelCuadro } from './fotoDelCierre.ts'
import type { GrupoLiquidacion } from './liquidacionQuincena.ts'

export interface LineaMarcable extends LineaParaCerrar, LineaDelCuadro {
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
export function fotoDeLinea(l: LineaMarcable, grupo: GrupoLiquidacion = 'obreros'): LineaCongelada | null {
  // LA PLATA ES LA DEL CUADRO, la misma que sella el botón (`fotoDeLaLinea`): dos fotos para el mismo cierre serían
  // dos verdades sobre lo que se pagó.
  const f = fotoDeLaLinea(l, grupo)
  if (!f.ok) return null
  return {
    persona_id: l.personaId, horas: l.horas, valor_hora: l.valorHora, cobra: f.plata.cobra, adelanto: l.adelanto,
    ya_transferido: l.yaTransferido, por_banco: f.plata.porBanco, en_efectivo: f.plata.enEfectivo, total: f.plata.total,
  }
}

/**
 * ¿FALTA PAGARLE? La 1ª quincena del mensual no se paga (el mes se liquida en la 2ª, y «Pagar» ni se ofrece ni el
 * servidor lo acepta): exigirle la marca dejaba al grupo esperando un pago que nunca va a existir y la quincena no se
 * cerraba sola jamás.
 */
const esperaPago = (l: LineaMarcable): boolean => l.seLiquidaEnLa2da !== true

export function decisionDeAutocierre({ lineas, personaId, porPersona = [], grupo = 'obreros' }: {
  lineas: readonly LineaMarcable[]
  grupo?: GrupoLiquidacion
  /** La que se acaba de marcar: cuenta como pagada aunque la lectura sea de antes de escribir. */
  personaId: string
  porPersona?: readonly DiasPendientesDePersona[]
}): DecisionDeAutocierre {
  const todasPagadas = lineas.some(esperaPago)
    && lineas.every((l) => !esperaPago(l) || l.personaId === personaId || Boolean(l.pagadaEn))
  if (!todasPagadas) return { todasPagadas: false, pendientes: [], foto: [] }
  const ids = new Set(lineas.map((l) => l.personaId))
  const estado = estadoDeCierre(lineas, { porPersona: porPersona.filter((p) => ids.has(p.personaId)) })
  const foto = lineas.map((l) => fotoDeLinea(l, grupo)).filter((f): f is LineaCongelada => f != null)
  const pendientes = [...estado.pendientes]
  // SIN FOTO NO HAY CIERRE POSIBLE: eso traba de verdad, no es un aviso.
  if (foto.length === 0) pendientes.push({ clave: 'sin-foto', traba: true, texto: 'ninguna línea se puede congelar', cuantas: lineas.length })
  // UNA FILA QUE NO SE PUEDE SELLAR COMO LA MUESTRA EL CUADRO TRABA, con su nombre: congelar el resto y dejarla afuera
  // cerraría la quincena con una persona sin foto.
  const grupoEntero = fotosDelGrupo(lineas, grupo)
  if (!grupoEntero.ok && foto.length > 0) pendientes.push({ clave: 'sin-foto', traba: true, texto: grupoEntero.error, cuantas: lineas.length - foto.length })
  return { todasPagadas: true, pendientes, foto }
}

/** El texto que acompaña a «Marcada como pagada» cuando ya están todos. */
export function avisoDeAutocierre(d: DecisionDeAutocierre, cerrada: { ok: true; lineas: number } | { ok: false; error: string } | null): string {
  if (!d.todasPagadas) return 'Marcada como pagada.'
  // SÓLO LO QUE TRABA IMPIDE EL AUTOCIERRE (dueño, 21/09/2026). Los avisos —ausencias sin motivo,
  // días sin cargar— se siguen diciendo, pero con la quincena ya cerrada, no en lugar de cerrarla.
  const traban = d.pendientes.filter((p) => p.traba)
  const avisos = d.pendientes.filter((p) => !p.traba)
  if (traban.length > 0) {
    return `Marcada como pagada. Ya están todos pagados, pero NO cerré la quincena: ${traban.map((p) => p.texto).join(' · ')}`
  }
  const cola = avisos.length > 0 ? ` Con ${avisos.map((p) => p.texto).join(' · ')}` : ''
  if (cerrada == null) return `Marcada como pagada. Ya están todos pagados.${cola}`
  return cerrada.ok
    ? `Marcada como pagada. Todos pagados: quincena cerrada, ${cerrada.lineas} línea(s) congeladas.${cola}`
    : `Marcada como pagada. Todos pagados, pero el cierre falló: ${cerrada.error}`
}
