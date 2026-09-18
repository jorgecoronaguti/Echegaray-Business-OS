import { leerEconomiaRubros, RUBROS, type FilaRubros, type Rubro } from './presupuesto.ts'

/** Los cuatro rubros con las claves cortas de los tests: MO · MAT · SUB · OTR. `null` = sin presupuesto de ese rubro. */
export type Rubros = Partial<Record<'MO' | 'MAT' | 'SUB' | 'OTR', number | null>>
const DB: Record<keyof Rubros, string> = { MO: 'mano_obra', MAT: 'materiales', SUB: 'subcontratistas', OTR: 'otros' }

/**
 * UNA FILA DE `obra_economia_rubros` armada como la publica la base y leída con las MISMAS funciones
 * de producción. `contrato`: las columnas del contratado tal cual (`contratado`, `contratado_origen`,
 * `contratado_usd`, `contrato_total`…). `rubros`: `null` = sin presupuesto (estado `sin_presupuesto`
 * con `motivo`, o sin fila); un objeto = presupuesto leído, con el detalle opcional por rubro.
 */
export function filaDe(obra: string, {
  contrato = {}, rubros = null, motivo = null, estimados = [], detalle = {}, motivos = {}, hh = null, fuente = 'cot.xlsm', fecha = '2026-07-27',
}: {
  contrato?: Record<string, unknown>
  rubros?: Rubros | null
  motivo?: string | null
  estimados?: Rubro[]
  detalle?: Partial<Record<keyof Rubros, unknown[]>>
  motivos?: Partial<Record<keyof Rubros, string>>
  hh?: number | null
  fuente?: string
  fecha?: string
} = {}): FilaRubros {
  const claveDe = (k: keyof Rubros): Rubro => RUBROS.find((r) => r.db === DB[k])!.clave
  const json = rubros
    ? Object.fromEntries((Object.keys(DB) as (keyof Rubros)[]).map((k) => [DB[k], {
      monto: rubros[k] ?? null, motivo: rubros[k] == null ? (motivos[k] ?? 'sin presupuesto de este rubro') : null,
      estimado: estimados.includes(claveDe(k)), cita: `${fuente} · ${DB[k]}`, detalle: detalle[k] ?? [],
    }]))
    : {}
  const total = rubros ? Object.values(rubros).reduce<number>((a, v) => a + (v ?? 0), 0) : null
  const fila = leerEconomiaRubros([{
    obra_canonica_id: obra,
    contratado: null, contratado_usd: null, contratado_origen: null, contrato_total: null, ...contrato,
    presupuesto_estado: rubros ? 'leido' : motivo ? 'sin_presupuesto' : null,
    presupuesto_motivo: motivo, presupuestado_total: rubros ? total : null, presupuesto_estimado: estimados.length > 0,
    presupuesto_fuente_nombre: rubros ? fuente : null, presupuesto_fecha: rubros ? fecha : null, presupuesto_fuente_drive_id: rubros ? '1drive' : null,
    presupuesto_cita: rubros ? `${fuente} drive 1drive` : null, presupuesto_rubros: json, presupuesto_hh: hh,
  }]).porObra.get(obra)
  if (!fila) throw new Error(`la fila de ${obra} no parseó`)
  return fila
}

/** Sólo el presupuesto (sin contrato), para los tests que no miran el precio. */
export const presupuestoDe = (obra: string, rubros: Rubros | null, extra: Omit<Parameters<typeof filaDe>[1], 'rubros'> = {}): FilaRubros =>
  filaDe(obra, { ...extra, rubros })
