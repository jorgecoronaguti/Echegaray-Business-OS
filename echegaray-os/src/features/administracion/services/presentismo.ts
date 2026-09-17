// PRESENTISMO — llegar tarde o irse antes pierde el 20 % del básico (dueño, 15/09/2026).
//
// Parte de lo que hoy cobra un obrero pasa a llamarse presentismo: 20 % × (horas de la quincena ÷ 2)
// × básico UOCRA de su categoría (art. 52 CCT 76/75). Sin ninguna tardanza ni salida temprana en la
// quincena cobra lo mismo que hoy; con UNA sola pierde el presentismo entero. No hay plata nueva.
//
// Ejemplo aprobado: Agüero, oficial, 16–31/08, 105 h → 0,2 × 52,5 × 6.348 = $66.654. Cobra $627.000
// sin marcas; $560.346 con una.
//
// ═══ LA REGLA VIVE ACÁ Y EN NINGÚN OTRO LADO ═══
//
// La cadena de pago (`aplicarOverrides`) la llama con las horas que quedaron —manuales o de la app—,
// el cuadro de la quincena la muestra y el sello la congela. Ninguno de los tres recalcula un número:
// si mañana el porcentaje cambia, cambia acá y los tres lo siguen.
//
// ═══ QUÉ LO HACE PERDER (dueño, 16/09/2026) ═══
//
// *«Si tiene falta injustificada, tardanza o retiro anticipado durante la quincena → presentismo = $0»*,
// y *«las novedades justificadas/excepciones UOCRA deben respetar las reglas existentes y no tratarse
// automáticamente como falta injustificada»*. Hasta hoy sólo lo perdían la tardanza y la salida temprana.
//
// LA FALTA INJUSTIFICADA NO SE INVENTA ACÁ: sale del catálogo único de motivos
// (`orquestador/lib/asistencia-motivos.mjs`, 16 motivos, el mismo que usa el bot desde julio). Pierden el
// presentismo los motivos imputables al trabajador: faltó sin avisar, faltó con aviso (avisar no
// justifica), SUSPENSIÓN y PERMISO —estos dos agregados por el dueño el 16/09/2026—. No lo pierden las
// licencias con respaldo (enfermedad, accidente, accidente in itinere, vacaciones, licencia especial)
// ni lo que NO depende del trabajador (lluvia, obra parada sin material o sin frente, paro gremial,
// franco/feriado).
//
// OJO CON LA SUSPENSIÓN: se guarda con estado `licencia` y igual descuenta. «¿Se paga el día?» y
// «¿pierde el premio?» son dos preguntas distintas; el motivo se mira ANTES que el estado.
//
// ═══ UNA AUSENCIA SIN MOTIVO NO DESCUENTA SOLA: SE REVISA ═══
//
// Un día marcado «no vino» sin motivo cargado —o con «Otro», que no dice nada— no es una falta
// injustificada probada. Quitar plata con un dato ambiguo es fabricar la afirmación que el dueño pidió
// NO hacer automáticamente. Esos días salen en estado `a_revisar`: el presentismo se mantiene, la
// pantalla dice qué día falta clasificar, y Administración lo resuelve cargando el motivo.
//
// ═══ CUÁNDO NO RIGE ═══
//
//   · Antes de la quincena 16–30/09/2026 (`PRESENTISMO_DESDE`): lo sellado no se toca, y una quincena
//     abierta anterior tampoco cambia de reglas a mitad de camino.
//   · Los jefes de obra y quien cobra por mes NO son «no rige»: son `no_aplica` con motivo `mensual`
//     (dueño, 17/09/2026: «el presentismo no aplica a mensuales»). «Todavía no rige» y «a esta persona no
//     le corresponde nunca» son dos afirmaciones distintas, y la celda tiene que poder decir la segunda.
//   · Un cuadro cerrado: es una foto (R6) y su presentismo es el que quedó sellado, no éste.
//   · Sin categoría en el legajo o sin básico cargado: se dice «sin categoría» y NO se inventa un
//     importe ni queda como pendiente del cierre (dueño: «sin categoría, 0, sin pendiente»).

import type { ModalidadDeLiquidacion } from './liquidacionQuincena.ts'
import { MOTIVO } from '../../../../orquestador/lib/asistencia-motivos.mjs'
import { etiquetaDeMotivo } from './motivoDeAusencia.ts'

export const PRESENTISMO_PCT = 0.2

/**
 * LA MITAD QUE PAGA EL RECIBO. El presentismo se calcula sobre el 50 % en blanco y NUNCA sobre el 50 %
 * en efectivo (dueño, 16/09/2026): `PRESENTISMO = (básico quincenal × 50 %) × 20 %`. En ECSAS el jornal
 * se paga mitad por recibo y mitad en mano ([[blanco-categoria-del-recibo]]), y el premio del convenio
 * corre sobre lo registrado.
 */
export const PARTE_EN_BLANCO = 0.5

/**
 * LOS MOTIVOS QUE HACEN PERDER EL PRESENTISMO: los imputables al trabajador. Las claves salen del
 * catálogo único; escribir los strings a mano acá sería la segunda lista que el OS prohíbe.
 *
 * SUSPENSIÓN Y PERMISO ENTRARON EL 16/09/2026 por decisión del dueño. No es un detalle de
 * clasificación: la suspensión figura como LICENCIA en `motivoDeAusencia.ts` —porque tiene respaldo
 * documental y eso decide si el día SE PAGA—, y aun así hace perder el presentismo. Son dos preguntas
 * distintas sobre el mismo día: «¿se le paga la jornada?» la contesta el tipo de motivo; «¿pierde el
 * premio de asistencia?» la contesta esta lista. Por eso la regla vive acá y no se deriva de aquélla.
 */
export const MOTIVOS_QUE_PIERDEN: readonly string[] = [
  MOTIVO.FALTA, MOTIVO.FALTA_CON_AVISO, MOTIVO.SUSPENSION, MOTIVO.PERMISO,
]

/** Un motivo que no dice nada: no prueba una falta injustificada, pero deja el día sin clasificar. */
export const MOTIVOS_SIN_CLASIFICAR: readonly string[] = [MOTIVO.OTRO]
/** La primera quincena que liquida con presentismo. Se compara contra `quincena.desde`. */
export const PRESENTISMO_DESDE = '2026-09-16'

/** Un día NO trabajado, tal como lo guardó el jefe en `asistencia_dia`. */
export interface AusenciaDelDia {
  fecha: string
  /** `'ausente'` o `'licencia'`, el estado declarado. */
  estado: 'ausente' | 'licencia'
  /** La clave del catálogo (`falta`, `enfermedad`…). `null` = no la cargaron. */
  motivo: string | null
}

/** La marca de un día, tal como la guardó el jefe en `asistencia_dia`. */
export interface TardanzaDelDia {
  fecha: string
  llegoTarde: boolean
  salioAntes: boolean
}

export type EstadoPresentismo =
  /** Rige y no lo perdió: cobra lo de siempre; el importe es la parte que se llama presentismo. */
  | 'aplica'
  /** Rige y hay al menos una marca: se descuenta el importe entero. */
  | 'perdido'
  /** Rige pero el legajo no tiene categoría o la escala no tiene su básico: 0, sin pendiente. */
  | 'sin_categoria'
  /** Rige pero no hay horas con qué calcularlo. */
  | 'sin_horas'
  /** Rige, no hay causa probada de pérdida, pero quedan días sin clasificar: no se descuenta todavía. */
  | 'a_revisar'
  /** No rige: quincena anterior al 16/09/2026 o cuadro cerrado. */
  | 'no_rige'
  /** No corresponde a esta persona: cobra por mes (jefe de obra u otro mensual). Sin importe, no suma, sin pendiente. */
  | 'no_aplica'

/** Por qué no aplica. Hoy hay un solo motivo: el premio es del convenio de obreros, que cobran por hora. */
export type MotivoNoAplica = 'mensual'

/** Por qué un día hizo perder el presentismo. La pantalla lo muestra textual. */
export interface CausaDePerdida {
  fecha: string
  causa: 'tardanza' | 'retiro' | 'falta'
  /** «Llegó tarde» · «Se retiró antes» · «Faltó sin avisar». Lo que se le dice al dueño. */
  etiqueta: string
}

export interface PresentismoDeLinea {
  estado: EstadoPresentismo
  /** 20 % × base. `null` cuando no se puede calcular; nunca 0 por defecto. */
  importe: number | null
  /**
   * LA BASE: el básico quincenal × 50 % (la mitad que paga el recibo). Es lo que la pantalla muestra
   * como «Base presentismo», y sobre lo que se aplica el 20 %. `null` sin horas o sin básico.
   */
  base: number | null
  /** Las fechas (ISO) con causa de pérdida, ordenadas. Vacío = no lo perdió. */
  perdido: string[]
  /** Las causas con su etiqueta: el «motivo si lo perdió» de la pantalla. */
  causas: CausaDePerdida[]
  /** Días no trabajados que nadie clasificó: no descuentan, pero hay que resolverlos. */
  aRevisar: string[]
  basico: number | null
  categoria: string | null
  /** Sólo con `estado === 'no_aplica'`: por qué. La celda lo dice textual («no aplica · mensual»). */
  motivoNoAplica?: MotivoNoAplica
}

/** Lo que la cadena de pago sabe de la persona ANTES de conocer sus horas finales. */
export interface EntradaDePresentismo {
  categoria: string | null
  /** El básico por hora de su categoría (`pisoVigente`), o `null` si la escala no lo tiene. */
  basico: number | null
  tardanzas: readonly TardanzaDelDia[]
  /** Los días no trabajados de la quincena, con su motivo. Vacío = no faltó. */
  ausencias?: readonly AusenciaDelDia[]
  /** `quincena.desde` (ISO). Decide si la regla ya rige. */
  quincenaDesde: string
  modalidad: ModalidadDeLiquidacion
  esJefe: boolean
  cerrada: boolean
}

const r2 = (n: number): number => Math.round(n * 100) / 100

/** ¿Cobra por mes? Jefe de obra o modalidad mensual: el mismo corte que `cobraPorMes` ya resolvió en la línea. */
export const esMensual = (e: Pick<EntradaDePresentismo, 'modalidad' | 'esJefe'>): boolean =>
  e.modalidad === 'mensual' || e.esJefe

/**
 * EL PRESENTISMO DE QUIEN COBRA POR MES: no aplica, sin importe ni base, sin causas ni días a revisar. Una falta de
 * un mensual no le descuenta un premio que no tiene. La usa también la cadena de pago para las líneas de Oficina,
 * que no arman entrada de presentismo.
 */
export function presentismoNoAplica(e: { categoria?: string | null; basico?: number | null } = {}): PresentismoDeLinea {
  return {
    estado: 'no_aplica', motivoNoAplica: 'mensual', importe: null, base: null,
    perdido: [], causas: [], aRevisar: [], basico: e.basico ?? null, categoria: e.categoria ?? null,
  }
}

export function rigePresentismo(e: Pick<EntradaDePresentismo, 'quincenaDesde' | 'modalidad' | 'esJefe' | 'cerrada'>): boolean {
  return e.quincenaDesde >= PRESENTISMO_DESDE && e.modalidad === 'hora' && !e.esJefe && !e.cerrada
}

/** Las fechas con marca, ordenadas y sin repetir. UNA basta: el presentismo se pierde entero. */
export function fechasPerdidas(tardanzas: readonly TardanzaDelDia[]): string[] {
  return [...new Set(tardanzas.filter((t) => t.llegoTarde || t.salioAntes).map((t) => t.fecha))].sort()
}

/**
 * ¿ESTE DÍA NO TRABAJADO ES UNA FALTA INJUSTIFICADA? Sólo los dos motivos imputables al trabajador.
 *
 *   `pierde`      faltó sin avisar · faltó con aviso
 *   `revisar`     sin motivo cargado, o «Otro»: no prueba nada, se resuelve cargando el motivo
 *   `no-afecta`   licencias y lo que no depende del trabajador (lluvia, obra parada, paro, franco…)
 *
 * UN ESTADO `licencia` NUNCA PIERDE, aunque le hayan puesto un motivo raro: el estado ya dice que la
 * empresa lo reconoció.
 */
export function efectoDeLaAusencia(a: AusenciaDelDia): 'pierde' | 'revisar' | 'no-afecta' {
  // EL MOTIVO SE MIRA ANTES QUE EL ESTADO (16/09/2026). Una suspensión se guarda con estado
  // `licencia` —la empresa la reconoce y la documenta— y aun así pierde el presentismo. Si el estado
  // se evaluara primero, la decisión del dueño no llegaría nunca a aplicarse.
  if (a.motivo != null && MOTIVOS_QUE_PIERDEN.includes(a.motivo)) return 'pierde'
  if (a.estado === 'licencia') return 'no-afecta'
  if (a.motivo == null || MOTIVOS_SIN_CLASIFICAR.includes(a.motivo)) return 'revisar'
  return 'no-afecta'
}

/**
 * LA BASE: básico quincenal × 50 %. Sobre esto corre el 20 %, y NUNCA sobre el 50 % en efectivo.
 *
 * CERO HORAS NO SON UNA BASE DE $0 (QA, 17/09/2026). El 16/09 Quiroga Sebastián tenía una A y ninguna hora: la base
 * daba 0, el estado «perdido» y el pie publicaba «Presentismo perdido (1) −$0», una pérdida que no le costó nada a
 * nadie. Sin horas todavía no hay presentismo que calcular: `sin_horas`, y la causa sigue a la vista en la celda.
 */
export function baseDePresentismo(horas: number | null, basico: number | null): number | null {
  if (horas == null || !Number.isFinite(horas) || !(horas > 0) || basico == null || !(basico > 0)) return null
  return r2(horas * basico * PARTE_EN_BLANCO)
}

/** El importe: 20 % × base = 20 % × (básico quincenal × 50 %). `null` sin horas o sin básico. */
export function importeDePresentismo(horas: number | null, basico: number | null): number | null {
  const base = baseDePresentismo(horas, basico)
  return base == null ? null : r2(PRESENTISMO_PCT * base)
}

/**
 * TODAS LAS CAUSAS DE PÉRDIDA DE LA QUINCENA, ordenadas por fecha. Un mismo día puede traer tardanza y
 * retiro: se dicen las dos, porque el dueño quiere ver el motivo, no un contador.
 */
export function causasDePerdida(
  tardanzas: readonly TardanzaDelDia[], ausencias: readonly AusenciaDelDia[],
): CausaDePerdida[] {
  const out: CausaDePerdida[] = []
  for (const t of tardanzas) {
    if (t.llegoTarde) out.push({ fecha: t.fecha, causa: 'tardanza', etiqueta: 'Llegó tarde' })
    if (t.salioAntes) out.push({ fecha: t.fecha, causa: 'retiro', etiqueta: 'Se retiró antes' })
  }
  for (const a of ausencias) {
    if (efectoDeLaAusencia(a) !== 'pierde') continue
    out.push({ fecha: a.fecha, causa: 'falta', etiqueta: etiquetaDeMotivo(a.motivo) ?? 'Falta injustificada' })
  }
  return out.sort((x, y) => (x.fecha === y.fecha ? x.causa.localeCompare(y.causa) : x.fecha.localeCompare(y.fecha)))
}

/** Los días no trabajados que nadie clasificó. No descuentan: se resuelven cargando el motivo. */
export function diasARevisar(ausencias: readonly AusenciaDelDia[]): string[] {
  return [...new Set(ausencias.filter((a) => efectoDeLaAusencia(a) === 'revisar').map((a) => a.fecha))].sort()
}

export function presentismoDeLinea(e: EntradaDePresentismo, horas: number | null): PresentismoDeLinea {
  const ausencias = e.ausencias ?? []
  const causas = causasDePerdida(e.tardanzas, ausencias)
  const perdido = [...new Set(causas.map((c) => c.fecha))].sort()
  const aRevisar = diasARevisar(ausencias)
  const comun = { basico: e.basico, categoria: e.categoria, causas, perdido, aRevisar }
  // EL CUADRO CERRADO VA PRIMERO: es una foto y su presentismo es el sellado. Después, quien cobra por mes: no aplica
  // aunque la quincena sea anterior a la regla, porque no le corresponde nunca.
  if (!e.cerrada && esMensual(e)) return presentismoNoAplica(e)
  if (!rigePresentismo(e)) {
    return { ...comun, estado: 'no_rige', importe: null, base: null, causas: [], perdido: [], aRevisar: [] }
  }
  if (e.basico == null || !(e.basico > 0) || !e.categoria) {
    return { ...comun, estado: 'sin_categoria', importe: null, base: null }
  }
  const base = baseDePresentismo(horas, e.basico)
  const importe = importeDePresentismo(horas, e.basico)
  if (base == null || importe == null) return { ...comun, estado: 'sin_horas', importe: null, base: null }
  // EL ORDEN IMPORTA: una causa probada gana sobre un día sin clasificar. Quien llegó tarde pierde el
  // presentismo aunque además tenga una ausencia que nadie cargó; lo contrario dejaría de descontar por
  // un dato que falta en OTRO día.
  if (causas.length > 0) return { ...comun, estado: 'perdido', importe, base }
  if (aRevisar.length > 0) return { ...comun, estado: 'a_revisar', importe, base }
  return { ...comun, estado: 'aplica', importe, base }
}

/** Lo que cobra: lo de hoy, o lo de hoy menos el presentismo si lo perdió. Sin plata nueva. */
export function cobraConPresentismo(cobra: number | null, p: PresentismoDeLinea | null): number | null {
  if (cobra == null || p == null || p.estado !== 'perdido' || p.importe == null) return cobra
  return r2(cobra - p.importe)
}

/** «17/09» · «17/09, 23/09». Para la celda y para la columna sellada. */
export function fechasCortas(fechas: readonly string[]): string {
  return fechas.map((f) => `${f.slice(8, 10)}/${f.slice(5, 7)}`).join(', ')
}

export interface TotalesDePresentismo {
  /** La suma del importe de quien lo tiene (aplica o perdido): lo que está en juego. */
  enJuego: number
  /** La suma de lo descontado. */
  perdido: number
  /** Cuántas líneas lo perdieron. */
  perdidos: number
  sinCategoria: number
  /** Cuántas tienen días sin clasificar: cobran el presentismo, pero hay que resolverlos. */
  aRevisar: number
}

export function totalesDePresentismo(lineas: readonly { presentismo: PresentismoDeLinea | null }[]): TotalesDePresentismo {
  const t: TotalesDePresentismo = { enJuego: 0, perdido: 0, perdidos: 0, sinCategoria: 0, aRevisar: 0 }
  for (const { presentismo: p } of lineas) {
    if (!p) continue
    if (p.estado === 'sin_categoria') t.sinCategoria++
    if (p.estado === 'a_revisar') t.aRevisar++
    if (p.importe == null) continue
    t.enJuego += p.importe
    if (p.estado === 'perdido') { t.perdido += p.importe; t.perdidos++ }
  }
  t.enJuego = r2(t.enJuego)
  t.perdido = r2(t.perdido)
  return t
}
