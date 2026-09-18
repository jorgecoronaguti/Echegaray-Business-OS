// EL PRESUPUESTO Y EL CONTRATO DE CADA OBRA, POR RUBRO — desde UNA sola fuente: `obra_economia_rubros`.
//
// ═══ POR QUÉ ESTA VISTA Y NO `presupuestos` (dueño, 18/09/2026) ═══
//
// «Están mal los datos de analíticas, porque inventás o empezás de cero y no buscás en las bases de
// datos que ya existen. Lo contratado es un dato que ya tenemos en el CRM; lo que tenés que buscar en
// los presupuestos son materiales, mano de obra, subcontratistas y en otros si hay alquileres de
// maquinarias, servicios, etc. Y quiero que cada cosa quede aclarada diciendo qué contiene cada uno.»
//
// `obra_economia_rubros` (migración 20260918T0900) publica por obra:
//   · CONTRATADO: `contratado_de_obra(obra)`, la misma función que `obra_panel` y la ficha de la obra, y
//     la misma regla que el CRM. `contratado_origen` dice de dónde salió; una `suma-viva` de Cobranzas
//     es lo facturado, no el precio, y acá no se llama precio (regla del 17/09, con tests).
//   · PRESUPUESTADO POR RUBRO: leído del documento de cotización de Drive por
//     `orquestador/scripts/cargar-presupuesto-rubros.mjs`, con el detalle de qué lo compone y la cita.
//     Un rubro sin monto trae su motivo («la oferta es sólo mano de obra…», «la cotización no prevé
//     subcontratos…»); una obra sin presupuesto trae el suyo. Nunca un número inventado.
//
// ═══ LOS CUATRO RUBROS ═══
//
// Los mismos de la base (`rubro_de_compra`) y del lector (`DEFINICION_RUBRO` en presupuesto-rubros.mjs):
// el test `definiciones.test.ts` comprueba que las cuatro líneas de acá son las mismas.
import { z } from 'zod'

export type Rubro = 'manoObra' | 'materiales' | 'subcontratos' | 'otros'
export type RubroDb = 'mano_obra' | 'materiales' | 'subcontratistas' | 'otros'

export const RUBROS: { clave: Rubro; db: RubroDb; rotulo: string }[] = [
  { clave: 'manoObra', db: 'mano_obra', rotulo: 'Mano de obra' },
  { clave: 'materiales', db: 'materiales', rotulo: 'Materiales' },
  { clave: 'subcontratos', db: 'subcontratistas', rotulo: 'Subcontratistas' },
  { clave: 'otros', db: 'otros', rotulo: 'Otros' },
]

/** Qué contiene cada rubro, en una línea. Es la definición de la base y del lector, copiada textual. */
export const DEFINICION_RUBRO: Record<Rubro, string> = {
  manoObra: 'Jornales del personal propio con sus cargas sociales. En la cotización, las horas de oficial y ayudante y sus cargas; en el gasto, las quincenas liquidadas (recibo + parte en negro).',
  materiales: 'Lo que se compra y queda en la obra o se consume haciéndola: áridos, hierro, hormigón, chapa, madera, sanitarios, ferretería, EPP.',
  subcontratos: 'Trabajo contratado a terceros: proveedores marcados «Subcontratista» en Compras; en la cotización, insumos cotizados por unidad de obra en vez de por hora.',
  otros: 'Alquiler y uso de equipos (propios o alquilados), combustible, fletes y traslados, servicios de obra (baño, contenedor, agua, bomba), honorarios y servicios.',
}

export const rotuloDe = (r: Rubro): string => RUBROS.find((x) => x.clave === r)?.rotulo ?? r
const claveDe = (db: string): Rubro | null => RUBROS.find((x) => x.db === db)?.clave ?? null

export const SIN_PRESUPUESTO = 'sin presupuesto cargado'
export const SIN_PRESUPUESTO_RUBRO = 'sin presupuesto de este rubro'

/** Un insumo (o ítem) del presupuesto, tal como lo leyó el cargador. */
export interface ItemPresupuestado {
  item: string
  unidad: string | null
  cantidad: number | null
  importe: number
  /** Por qué está en este rubro. */
  porque: string | null
  /** «obra» / «adicional» cuando el presupuesto junta más de un documento. */
  parte: string | null
  /** `true` = la cotización lo computó pero quedó fuera del precio (oferta sólo mano de obra): no suma. */
  fueraDeOferta: boolean
  /** `true` = diferencia entre el subtotal tipeado de un ítem y su análisis: inferencia. */
  ajuste: boolean
  sinEvidencia: boolean
}

export interface RubroPresupuestado {
  /** `null` = sin presupuesto de este rubro (`motivo`). 0 = la cotización lo previó en cero. */
  monto: number | null
  motivo: string | null
  estimado: boolean
  cita: string | null
  detalle: ItemPresupuestado[]
}

export interface PresupuestoArmado {
  /** El monto por rubro; `null` = ese rubro no tiene presupuesto (no es cero). */
  porRubro: Record<Rubro, number | null>
  rubros: Record<Rubro, RubroPresupuestado>
  /** Rubros cuyo número es estimado (inferencia). */
  estimados: Rubro[]
  /** Σ de los rubros con monto. `null` → `motivo`. */
  costoTotal: number | null
  motivo: string | null
  estimado: boolean
  /** «Cotizacion Final.xlsm · 27/07/2026». */
  fuente: string
  fuenteDriveId: string | null
  fecha: string | null
  cita: string | null
  /** Horas hombre de la cotización. `null` = no las previó o no son confiables. */
  hh: number | null
}

/** Lo contratado, como lo publica la vista. */
export interface ContratoLeido {
  contratado: number | null
  contratadoUsd: number | null
  origen: string | null
  referencia: string | null
  manoObra: number | null
  manoObraUsd: number | null
  materiales: number | null
  materialesUsd: number | null
  total: number | null
  fuente: string | null
  fuenteNombre: string | null
  cita: string | null
}

export interface FilaRubros {
  obraId: string
  contrato: ContratoLeido
  /** `null` = la obra no tiene fila de presupuesto (ni leído ni «sin presupuesto» con motivo). */
  presupuesto: PresupuestoArmado | null
}

const NUM = z.union([z.number(), z.string()]).transform((v) => Number(v)).pipe(z.number().finite()).nullable().optional()
const TXT = z.string().nullable().optional()

const FILA = z.object({
  obra_canonica_id: z.string().min(1),
  contratado: NUM, contratado_usd: NUM, contratado_origen: TXT, contratado_referencia: TXT,
  contrato_mano_obra: NUM, contrato_mano_obra_usd: NUM, contrato_materiales: NUM, contrato_materiales_usd: NUM, contrato_total: NUM,
  contrato_fuente_nombre: TXT, contrato_cita: TXT,
  presupuesto_estado: TXT, presupuesto_motivo: TXT, presupuestado_total: NUM, presupuesto_estimado: z.boolean().nullable().optional(),
  presupuesto_fuente_drive_id: TXT, presupuesto_fuente_nombre: TXT, presupuesto_fecha: TXT, presupuesto_cita: TXT,
  presupuesto_rubros: z.unknown().optional(), presupuesto_hh: NUM,
})

const ITEM = z.object({
  item: z.string().nullable().optional(), unidad: TXT, cantidad: NUM, importe: z.union([z.number(), z.string()]).transform((v) => Number(v)),
  porque: TXT, parte: TXT, fuera_de_oferta: z.boolean().optional(), ajuste: z.boolean().optional(), sin_evidencia: z.boolean().optional(),
})
const RUBRO_JSON = z.object({
  monto: NUM, motivo: TXT, estimado: z.boolean().nullable().optional(), cita: TXT, detalle: z.array(z.unknown()).nullable().optional(),
})

const fechaCorta = (iso: string | null | undefined): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

function rubroDe(json: unknown): RubroPresupuestado {
  const r = RUBRO_JSON.safeParse(json)
  if (!r.success) return { monto: null, motivo: SIN_PRESUPUESTO_RUBRO, estimado: false, cita: null, detalle: [] }
  const x = r.data
  const detalle = (x.detalle ?? []).flatMap((d): ItemPresupuestado[] => {
    const i = ITEM.safeParse(d)
    if (!i.success || !Number.isFinite(i.data.importe)) return []
    return [{
      item: i.data.item ?? 'sin nombre', unidad: i.data.unidad ?? null, cantidad: i.data.cantidad ?? null, importe: i.data.importe,
      porque: i.data.porque ?? null, parte: i.data.parte ?? null,
      fueraDeOferta: i.data.fuera_de_oferta === true, ajuste: i.data.ajuste === true, sinEvidencia: i.data.sin_evidencia === true,
    }]
  })
  return { monto: x.monto ?? null, motivo: x.motivo ?? (x.monto == null ? SIN_PRESUPUESTO_RUBRO : null), estimado: x.estimado === true, cita: x.cita ?? null, detalle }
}

/**
 * LA ÚNICA PUERTA: filas crudas de `obra_economia_rubros`. `null` = no se pudo leer. Una fila que no
 * parsea no entra: un contratado no numérico no es un contratado.
 */
export function leerEconomiaRubros(filas: unknown[] | null): { porObra: Map<string, FilaRubros>; motivo: string | null } {
  if (filas == null) return { porObra: new Map(), motivo: 'no se pudo leer el presupuesto ni el contrato' }
  const porObra = new Map<string, FilaRubros>()
  for (const f of filas) {
    const r = FILA.safeParse(f)
    if (!r.success) continue
    const x = r.data
    const contrato: ContratoLeido = {
      contratado: x.contratado ?? null, contratadoUsd: x.contratado_usd ?? null, origen: x.contratado_origen ?? null, referencia: x.contratado_referencia ?? null,
      manoObra: x.contrato_mano_obra ?? null, manoObraUsd: x.contrato_mano_obra_usd ?? null, materiales: x.contrato_materiales ?? null,
      materialesUsd: x.contrato_materiales_usd ?? null, total: x.contrato_total ?? null,
      fuente: x.contratado_origen ?? null, fuenteNombre: x.contrato_fuente_nombre ?? null, cita: x.contrato_cita ?? null,
    }
    let presupuesto: PresupuestoArmado | null = null
    if (x.presupuesto_estado === 'leido' && x.presupuestado_total != null) {
      const json = (x.presupuesto_rubros ?? {}) as Record<string, unknown>
      const rubros = Object.fromEntries(RUBROS.map((k) => [k.clave, rubroDe(json[k.db])])) as Record<Rubro, RubroPresupuestado>
      const porRubro = Object.fromEntries(RUBROS.map((k) => [k.clave, rubros[k.clave].monto])) as Record<Rubro, number | null>
      const estimados = RUBROS.filter((k) => rubros[k.clave].estimado).map((k) => k.clave)
      presupuesto = {
        porRubro, rubros, estimados, costoTotal: x.presupuestado_total, motivo: null,
        estimado: x.presupuesto_estimado === true || estimados.length > 0,
        fuente: [x.presupuesto_fuente_nombre, fechaCorta(x.presupuesto_fecha)].filter(Boolean).join(' · '),
        fuenteDriveId: x.presupuesto_fuente_drive_id ?? null, fecha: fechaCorta(x.presupuesto_fecha), cita: x.presupuesto_cita ?? null,
        hh: x.presupuesto_hh != null && x.presupuesto_hh > 0 ? x.presupuesto_hh : null,
      }
    } else if (x.presupuesto_estado === 'sin_presupuesto') {
      presupuesto = {
        porRubro: { manoObra: null, materiales: null, subcontratos: null, otros: null },
        rubros: Object.fromEntries(RUBROS.map((k) => [k.clave, { monto: null, motivo: x.presupuesto_motivo ?? SIN_PRESUPUESTO, estimado: false, cita: null, detalle: [] as ItemPresupuestado[] }])) as unknown as Record<Rubro, RubroPresupuestado>,
        estimados: [], costoTotal: null, motivo: x.presupuesto_motivo?.trim() || SIN_PRESUPUESTO, estimado: false, fuente: '', fuenteDriveId: null, fecha: null, cita: null,
        hh: x.presupuesto_hh != null && x.presupuesto_hh > 0 ? x.presupuesto_hh : null,
      }
    }
    porObra.set(x.obra_canonica_id, { obraId: x.obra_canonica_id, contrato, presupuesto })
  }
  const hay = [...porObra.values()].some((f) => f.presupuesto?.costoTotal != null)
  return { porObra, motivo: hay ? null : SIN_PRESUPUESTO }
}

/** Sólo el rubro `db` → clave de la pantalla; exportado para el lector del consumo por rubro. */
export const rubroDeDb = (db: string): Rubro | null => claveDe(db)
