// LO GUARDADO EN `liquidacion_quincena` / `liquidacion_linea`, DECODIFICADO: estados de cierre, redondeos,
// overrides manuales, importes cargados y la foto del presentismo. Sale de `liquidacionQuincenaService.ts`
// (15/09/2026) porque ese archivo pasó las 500 líneas al sumar el presentismo; acá no hay ninguna lectura,
// sólo la traducción de una fila guardada a lo que la cadena de pago entiende.

import { CAMPOS_EDITABLES, type CampoEditable, type OverridesDeLinea } from './liquidacionOverrides.ts'
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
  pagado_banco?: number | string | null
  pagado_efectivo?: number | string | null
  /** La cuenta escrita con `=` en cada celda, por campo. `{}` o ausente = ninguna. */
  formulas?: unknown
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
  pagadoBanco: overrideDe(l.pagado_banco),
  pagadoEfectivo: overrideDe(l.pagado_efectivo),
})

/**
 * LAS CUENTAS GUARDADAS DE UNA FILA. Sólo entran las de campos que existen y con texto: un jsonb lo escribe
 * cualquiera y una clave inventada no puede convertirse en una celda que la pantalla no sabe dibujar.
 */
export function formulasDeLinea(crudo: unknown): Partial<Record<CampoEditable, string>> {
  if (crudo == null || typeof crudo !== 'object' || Array.isArray(crudo)) return {}
  const out: Partial<Record<CampoEditable, string>> = {}
  for (const [k, v] of Object.entries(crudo as Record<string, unknown>)) {
    if (typeof v !== 'string' || v.trim() === '') continue
    if ((CAMPOS_EDITABLES as readonly string[]).includes(k)) out[k as CampoEditable] = v
  }
  return out
}

/**
 * LAS CUENTAS DE LA FILA DESPUÉS DE ESCRIBIR UNA CELDA. Pura: la acción sólo la llama y guarda lo que devuelve.
 *
 * Escribir un número SUELTO en una celda que tenía una cuenta BORRA la cuenta — y tiene que borrarla: dejarla
 * ahí haría que al reabrir la celda apareciera una expresión que ya no explica el número que hay guardado, que
 * es peor que no tener ninguna.
 */
export function siguientesFormulas(
  actuales: unknown, campo: CampoEditable, expresion: string | null,
): Record<string, string> {
  const base: Record<string, string> = { ...formulasDeLinea(actuales) }
  if (expresion == null) delete base[campo]
  else base[campo] = expresion
  return base
}

/** El estado de cada cuadro y el redondeo ya escrito. Sin cabecera guardada, la quincena está abierta. */
export function leerGuardadas(data: unknown): {
  estados: Record<string, EstadoDeLaQuincena>
  redondeos: Map<string, number | null>
  overrides: Map<string, OverridesDeLinea>
  /** Las cuentas escritas con `=`, por persona. La celda las muestra al abrirse. */
  formulas: Map<string, Partial<Record<CampoEditable, string>>>
  importesCargados: Map<string, number>
  /** La foto del presentismo que dejó el sello, por persona. Sólo la cuadro cerrada la muestra. */
  presentismosSellados: Map<string, PresentismoDeLinea>
} {
  const filas = (data ?? []) as CabeceraGuardada[]
  const estados: Record<string, EstadoDeLaQuincena> = {}
  const redondeos = new Map<string, number | null>()
  const overrides = new Map<string, OverridesDeLinea>()
  const formulas = new Map<string, Partial<Record<CampoEditable, string>>>()
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
      formulas.set(l.persona_id, formulasDeLinea(l.formulas))
      if (f.grupo === 'oficina' && numero(l.cobra) > 0) importesCargados.set(l.persona_id, numero(l.cobra))
      const sellado = presentismoSellado(l)
      if (sellado) presentismosSellados.set(l.persona_id, sellado)
    }
  }
  return { estados, redondeos, overrides, formulas, importesCargados, presentismosSellados }
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
