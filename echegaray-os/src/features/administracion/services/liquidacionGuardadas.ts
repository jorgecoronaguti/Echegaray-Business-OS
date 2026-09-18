// LO GUARDADO EN `liquidacion_quincena` / `liquidacion_linea`, DECODIFICADO: estados de cierre, redondeos,
// overrides manuales, importes cargados y la foto del presentismo. Sale de `liquidacionQuincenaService.ts`
// (15/09/2026) porque ese archivo pasó las 500 líneas al sumar el presentismo; acá no hay ninguna lectura,
// sólo la traducción de una fila guardada a lo que la cadena de pago entiende.

import { CAMPOS_EDITABLES, type CampoEditable, type OverridesDeLinea } from './liquidacionOverrides.ts'
import type { PresenciaDeQuincena } from './liquidacionQuincena.ts'
import { PRESENTISMO_PCT } from './presentismo.ts'
import type { AusenciaDelDia, PresentismoDeLinea, TardanzaDelDia } from './presentismo.ts'

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
  // ═══ LA FOTO SELLADA (18/09/2026) ═══ Las ocho columnas base de `liquidacion_linea` con las que se cerró la
  // quincena. Son lo que la pantalla muestra de una quincena CERRADA: ni `registros_hh` ni `persona_tarifa` de hoy.
  horas?: number | string | null
  valor_hora?: number | string | null
  adelanto?: number | string | null
  ya_transferido?: number | string | null
  por_banco?: number | string | null
  en_efectivo?: number | string | null
  total?: number | string | null
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
  /** La marca «pagada» (20260916T1300): cuándo. `null`/ausente = sin marcar. */
  pagada_en?: string | null
}

interface CabeceraGuardada {
  id: string
  grupo: string
  estado: string
  cerrada_en: string | null
  liquidacion_linea: LineaGuardada[] | null
}

/**
 * UNA LÍNEA TAL COMO QUEDÓ SELLADA EN `liquidacion_linea`. `null` = la columna vino vacía (una quincena vieja):
 * la pantalla dice «sin dato sellado» y no rellena con el cálculo de hoy.
 *
 * ═══ EL DEFECTO QUE ESTO CIERRA (auditor, 18/09/2026) ═══
 *
 * La quincena cerrada se dibujaba con `armarCuadros` sobre `registros_hh` y `persona_tarifa` VIVOS: Bazán, 16–31/03,
 * sellado 9 h × $4.300 = $38.700, y la pantalla decía «se liquidó a $4.000/h · cobra $36.000» porque su única tarifa
 * cargada es la de enero. La 1ª de junio sumaba $7.970.750 sobre $9.393.250 sellados. `COLUMNAS_LINEA` pedía sólo
 * `persona_id, efectivo_redondeado, cobra`: la foto existía en la base y no se leía.
 */
export interface LineaSelladaLeida {
  personaId: string
  horas: number | null
  valorHora: number | null
  cobra: number | null
  adelanto: number
  yaTransferido: number
  porBanco: number
  enEfectivo: number | null
  total: number | null
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

/** La foto sellada de una fila, columna por columna. Las NOT NULL DEFAULT 0 se leen como número; `horas` y `valor_hora`, tal cual. */
const lineaSellada = (l: LineaGuardada): LineaSelladaLeida => ({
  personaId: l.persona_id,
  horas: overrideDe(l.horas),
  valorHora: overrideDe(l.valor_hora),
  cobra: overrideDe(l.cobra),
  adelanto: numero(l.adelanto),
  yaTransferido: numero(l.ya_transferido),
  porBanco: numero(l.por_banco),
  enEfectivo: overrideDe(l.en_efectivo),
  total: overrideDe(l.total),
})

/** El estado de cada cuadro y el redondeo ya escrito. Sin cabecera guardada, la quincena está abierta. */
export function leerGuardadas(data: unknown): {
  estados: Record<string, EstadoDeLaQuincena>
  redondeos: Map<string, number | null>
  overrides: Map<string, OverridesDeLinea>
  /**
   * LAS LÍNEAS SELLADAS DE CADA CABECERA, por grupo. El servicio las usa SÓLO para el cuadro cerrado: en la abierta
   * la fila que crea el redondeo tiene `cobra = 0` por DEFAULT y no es una foto de nada.
   */
  lineasSelladas: Map<string, LineaSelladaLeida[]>
  /** Las cuentas escritas con `=`, por persona. La celda las muestra al abrirse. */
  formulas: Map<string, Partial<Record<CampoEditable, string>>>
  importesCargados: Map<string, number>
  /** La foto del presentismo que dejó el sello, por persona. Sólo la cuadro cerrada la muestra. */
  presentismosSellados: Map<string, PresentismoDeLinea>
  /** Cuándo se marcó «pagada» cada línea (dueño, 16/09/2026). Sólo las marcadas. */
  pagadas: Map<string, string>
} {
  const filas = (data ?? []) as CabeceraGuardada[]
  const estados: Record<string, EstadoDeLaQuincena> = {}
  const redondeos = new Map<string, number | null>()
  const overrides = new Map<string, OverridesDeLinea>()
  const formulas = new Map<string, Partial<Record<CampoEditable, string>>>()
  const importesCargados = new Map<string, number>()
  const presentismosSellados = new Map<string, PresentismoDeLinea>()
  const pagadas = new Map<string, string>()
  const lineasSelladas = new Map<string, LineaSelladaLeida[]>()
  for (const f of filas) {
    estados[f.grupo] = {
      id: f.id,
      estado: f.estado === 'cerrada' ? 'cerrada' : 'abierta',
      cerradaEn: f.cerrada_en,
    }
    lineasSelladas.set(f.grupo, (f.liquidacion_linea ?? []).map(lineaSellada))
    for (const l of f.liquidacion_linea ?? []) {
      // NULL SE GUARDA COMO NULL. Un cero acá diría «no le doy nada en mano», que es una afirmación
      // que el dueño no hizo.
      redondeos.set(l.persona_id, l.efectivo_redondeado == null ? null : numero(l.efectivo_redondeado))
      overrides.set(l.persona_id, overridesDeLinea(l))
      formulas.set(l.persona_id, formulasDeLinea(l.formulas))
      if (f.grupo === 'oficina' && numero(l.cobra) > 0) importesCargados.set(l.persona_id, numero(l.cobra))
      const sellado = presentismoSellado(l)
      if (sellado) presentismosSellados.set(l.persona_id, sellado)
      if (typeof l.pagada_en === 'string' && l.pagada_en) pagadas.set(l.persona_id, l.pagada_en)
    }
  }
  return { estados, redondeos, overrides, formulas, importesCargados, presentismosSellados, pagadas, lineasSelladas }
}

/** La foto sellada, como la publica la línea. Sin importe no hay foto (no regía o no había categoría). */
function presentismoSellado(l: LineaGuardada): PresentismoDeLinea | null {
  if (l.presentismo == null) return null
  const perdido = (l.presentismo_perdido ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  const importe = numero(l.presentismo)
  // LA BASE DE UNA FOTO VIEJA SE DERIVA, NO SE INVENTA: el sello guarda el importe y las fechas, y el
  // importe ES el 20 % de la base. `base = importe ÷ 0,2` es la misma cuenta al revés, exacta.
  // LAS CAUSAS NO SE PUEDEN RECONSTRUIR: la columna sellada guarda la fecha, no si fue tardanza, retiro o
  // falta. Van vacías y la pantalla cae en las fechas; afirmar una causa que nadie guardó sería inventarla.
  const base = importe > 0 ? Math.round((importe / PRESENTISMO_PCT) * 100) / 100 : null
  return {
    estado: perdido.length > 0 ? 'perdido' : 'aplica', importe, base, perdido,
    causas: [], aRevisar: [], basico: null, categoria: null,
  }
}

/**
 * LOS DÍAS NO TRABAJADOS de la quincena, por persona, con su motivo (dueño, 16/09/2026: el presentismo
 * también se pierde por falta injustificada). Sale de las MISMAS presencias que ya se leyeron para las
 * tardanzas: ninguna consulta nueva, ningún segundo origen del mismo hecho.
 */
export function ausenciasPorPersona(presencias: unknown): Map<string, AusenciaDelDia[]> {
  const out = new Map<string, AusenciaDelDia[]>()
  for (const p of (presencias ?? []) as (PresenciaDeQuincena & { persona_id: string })[]) {
    if (p.estado !== 'ausente' && p.estado !== 'licencia') continue
    const lista = out.get(p.persona_id) ?? []
    lista.push({ fecha: String(p.fecha).slice(0, 10), estado: p.estado, motivo: p.motivo ?? null })
    out.set(p.persona_id, lista)
  }
  return out
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
