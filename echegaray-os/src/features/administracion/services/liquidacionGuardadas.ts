// LO GUARDADO EN `liquidacion_quincena` / `liquidacion_linea`, DECODIFICADO: estados de cierre, redondeos,
// overrides manuales, importes cargados y la foto del presentismo. Sale de `liquidacionQuincenaService.ts`
// (15/09/2026) porque ese archivo pasó las 500 líneas al sumar el presentismo; acá no hay ninguna lectura,
// sólo la traducción de una fila guardada a lo que la cadena de pago entiende.

import type { OverridesDeLinea } from './liquidacionOverrides.ts'
import type { PresenciaDeQuincena } from './liquidacionQuincena.ts'
import type { PresentismoDeLinea, TardanzaDelDia } from './presentismo.ts'

export interface EstadoDeLaQuincena {
  id: string | null
  estado: 'abierta' | 'cerrada'
  cerradaEn: string | null
}

const numero = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export type LineaGuardada = {
  persona_id: string
  efectivo_redondeado: number | string | null
  cobra?: number | string | null
  horas_manual?: number | string | null
  horas_negro_manual?: number | string | null
  cobra_manual?: number | string | null
  adelanto_manual?: number | string | null
  ya_transferido_manual?: number | string | null
  por_banco_manual?: number | string | null
  en_efectivo_manual?: number | string | null
  total_manual?: number | string | null
  horas_recibo_manual?: number | string | null
  valor_hora_recibo_manual?: number | string | null
  negro_manual?: number | string | null
  presentismo?: number | string | null
  presentismo_perdido?: string | null
}

interface CabeceraGuardada {
  id: string
  grupo: string
  estado: string
  cerrada_en: string | null
  liquidacion_linea: LineaGuardada[] | null
}

/** `null`/ausente = no hay override. Un 0 guardado SÍ es un override y tiene que sobrevivir acá. */
const overrideDe = (v: number | string | null | undefined): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const overridesDeLinea = (l: LineaGuardada): OverridesDeLinea => ({
  horas: overrideDe(l.horas_manual),
  cobra: overrideDe(l.cobra_manual),
  adelanto: overrideDe(l.adelanto_manual),
  yaTransferido: overrideDe(l.ya_transferido_manual),
  porBanco: overrideDe(l.por_banco_manual),
  enEfectivo: overrideDe(l.en_efectivo_manual),
  total: overrideDe(l.total_manual),
  horasRecibo: overrideDe(l.horas_recibo_manual),
  valorHoraRecibo: overrideDe(l.valor_hora_recibo_manual),
  negro: overrideDe(l.negro_manual),
  horasNegro: overrideDe(l.horas_negro_manual),
})

/** El estado de cada cuadro y el redondeo ya escrito. Sin cabecera guardada, la quincena está abierta. */
export function leerGuardadas(data: unknown): {
  estados: Record<string, EstadoDeLaQuincena>
  redondeos: Map<string, number | null>
  overrides: Map<string, OverridesDeLinea>
  importesCargados: Map<string, number>
  /** La foto del presentismo que dejó el sello, por persona. Sólo la cuadro cerrada la muestra. */
  presentismosSellados: Map<string, PresentismoDeLinea>
} {
  const filas = (data ?? []) as CabeceraGuardada[]
  const estados: Record<string, EstadoDeLaQuincena> = {}
  const redondeos = new Map<string, number | null>()
  const overrides = new Map<string, OverridesDeLinea>()
  const importesCargados = new Map<string, number>()
  const presentismosSellados = new Map<string, PresentismoDeLinea>()
  for (const f of filas) {
    estados[f.grupo] = {
      id: f.id,
      estado: f.estado === 'cerrada' ? 'cerrada' : 'abierta',
      cerradaEn: f.cerrada_en,
    }
    for (const l of f.liquidacion_linea ?? []) {
      // NULL SE GUARDA COMO NULL. Un cero acá diría «no le doy nada en mano», que es una afirmación
      // que el dueño no hizo.
      redondeos.set(l.persona_id, l.efectivo_redondeado == null ? null : numero(l.efectivo_redondeado))
      overrides.set(l.persona_id, overridesDeLinea(l))
      if (f.grupo === 'oficina' && numero(l.cobra) > 0) importesCargados.set(l.persona_id, numero(l.cobra))
      const sellado = presentismoSellado(l)
      if (sellado) presentismosSellados.set(l.persona_id, sellado)
    }
  }
  return { estados, redondeos, overrides, importesCargados, presentismosSellados }
}

/** La foto sellada, como la publica la línea. Sin importe no hay foto (no regía o no había categoría). */
function presentismoSellado(l: LineaGuardada): PresentismoDeLinea | null {
  if (l.presentismo == null) return null
  const perdido = (l.presentismo_perdido ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  return { estado: perdido.length > 0 ? 'perdido' : 'aplica', importe: numero(l.presentismo), perdido, basico: null, categoria: null }
}

/** Las marcas de tardanza de la quincena, por persona. `fechasCortas` las rotula; acá van ISO. */
export function tardanzasPorPersona(presencias: unknown): Map<string, TardanzaDelDia[]> {
  const out = new Map<string, TardanzaDelDia[]>()
  for (const p of (presencias ?? []) as (PresenciaDeQuincena & { persona_id: string })[]) {
    if (p.llego_tarde !== true && p.salio_antes !== true) continue
    const lista = out.get(p.persona_id) ?? []
    lista.push({ fecha: String(p.fecha).slice(0, 10), llegoTarde: p.llego_tarde === true, salioAntes: p.salio_antes === true })
    out.set(p.persona_id, lista)
  }
  return out
}
