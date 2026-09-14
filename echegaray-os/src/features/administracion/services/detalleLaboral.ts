// LO LABORAL DE LA PERSONA EN LA QUINCENA — lo único que tenía la grilla de «Horas» y el cuadro no.
//
// Dueño, 14/09/2026: «no quitar». Al retirar «Horas por día» de «Más», el panel de la Quincena quedó sin
// costo cargado, sin Legajo/Laboral/Asignación, sin HH por mes y sin esperadas/estado. Esto los junta
// para una persona. No calcula nada nuevo: los campos son los que ya arma `getDatosDeLaSolapaHoras`,
// la fila es la de `filasDeGrilla`, y el bolsillo y el costo son la misma cuenta que hacía
// `PanelDePersona` (el cobra de la línea, o horas cargadas × $/h; y eso × el multiplicador de cargas).

import type { DatosDePersona } from './grillaHorasQuincenaService.ts'
import type { EstadoDeFila, FilaDeGrilla } from './grillaHorasQuincena.ts'
import type { MesDeHH } from './panelDePersona.ts'

export interface CampoDelLegajo {
  rotulo: string
  valor: string | null
  mono?: boolean
}

export interface DetalleLaboral {
  legajo: CampoDelLegajo[]
  laboral: CampoDelLegajo[]
  asignacion: CampoDelLegajo[]
  mesesHH: MesDeHH[]
  /** `null` sin fila de la grilla: no es cero horas, es que no se armó. */
  cargadas: number | null
  esperadas: number | null
  estado: EstadoDeFila | null
  bolsillo: number | null
  /** `null` = alícuotas sin cargar → «sin base», nunca un número (R1). ESTIMADO: cargas sin validar. */
  costoCargado: number | null
}

export function detalleLaboralDe(e: {
  persona: DatosDePersona
  fila?: FilaDeGrilla
  cobra?: number | null
  multiplicador: number | null
}): DetalleLaboral {
  const bolsillo = e.cobra ?? (e.persona.valorHora == null ? null : (e.fila?.cargadas ?? 0) * e.persona.valorHora)
  return {
    legajo: e.persona.legajo,
    laboral: e.persona.laboral,
    asignacion: e.persona.asignacion,
    mesesHH: e.persona.mesesHH,
    cargadas: e.fila?.cargadas ?? null,
    esperadas: e.fila?.esperadas ?? null,
    estado: e.fila?.estado ?? null,
    bolsillo,
    costoCargado: bolsillo != null && e.multiplicador != null ? bolsillo * e.multiplicador : null,
  }
}

/** Una entrada por persona del padrón de la quincena. Viaja serializable al panel de cliente. */
export function detallesLaboralesDeLaQuincena(c: {
  datos: { porPersona: Record<string, DatosDePersona> }
  grilla: readonly FilaDeGrilla[]
  liquidacion: { cuadros: readonly { lineas: readonly { personaId: string; cobra: number | null }[] }[] }
}, multiplicador: number | null): Record<string, DetalleLaboral> {
  const cobra = new Map<string, number | null>()
  for (const cuadro of c.liquidacion.cuadros) for (const l of cuadro.lineas) cobra.set(l.personaId, l.cobra)
  const salida: Record<string, DetalleLaboral> = {}
  for (const [id, persona] of Object.entries(c.datos.porPersona)) {
    salida[id] = detalleLaboralDe({
      persona, fila: c.grilla.find((f) => f.personaId === id), cobra: cobra.get(id), multiplicador,
    })
  }
  return salida
}
