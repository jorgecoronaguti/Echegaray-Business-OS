// EPP Y ROPA DE TRABAJO (migración 20260925T1100) — puro: sin Supabase, sin React.
//
// Dueño, 25/09/2026: «armes categorías nuevas … epp y ropa de trabajo … darme una base de camisas,
// pantalones permitiendo hacer recuento de stock posterior», y en el legajo una solapa para asignarle
// a cada persona lo que sale de esas dos listas.
//
// ═══ LO QUE LAS DISTINGUE DE UNA HERRAMIENTA ═══
//   · Van POR TALLE: «Camisa de trabajo» es una prenda y cada talle es un ítem con su código y su stock.
//   · Stock 0 es un estado normal («sin stock»), no una baja ni «sin ubicación cargada».
//   · Se ENTREGAN a una persona. Desde el 30/09 (migración 20260930T2100) la persona NO es un lugar:
//     «DÓNDE» es una ubicación (obra, Taller, rodado, service) y «QUIÉN LO TIENE» es `existencia.persona_id`.
//     Dueño: «la ubicación es un cliente/una obra, no una persona; eso es quien lo tiene». Lo que tiene
//     alguien figura en la obra donde trabaja y se va con él cuando cambia de obra.

import type { Activo, Ajuste, Existencia, Movimiento } from '../types.ts'

export type ClasePersonal = 'epp' | 'ropa'
export const CLASES_PERSONALES: readonly ClasePersonal[] = ['epp', 'ropa']
export const ETIQUETA_PERSONAL: Record<ClasePersonal, string> = { epp: 'EPP', ropa: 'Ropa de trabajo' }
/** La categoría que la base ata a cada clase (CHECK `activo_clase_categoria_chk`). */
export const CATEGORIA_PERSONAL: Record<ClasePersonal, string> = { epp: 'EPP', ropa: 'Ropa de trabajo' }

export function esPersonal(a: Pick<Activo, 'clase'>): boolean {
  return a.clase === 'epp' || a.clase === 'ropa'
}

// ── TALLES ──────────────────────────────────────────────────────────────────────────────────────
const LETRAS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']
const serie = (desde: number, hasta: number, paso = 1) =>
  Array.from({ length: Math.floor((hasta - desde) / paso) + 1 }, (_, i) => String(desde + i * paso))

/** Las series que se ofrecen al dar de alta una prenda: se elige una y después se sacan los que no. */
export const SERIES_TALLE: { clave: string; rotulo: string; talles: string[] }[] = [
  { clave: 'letras', rotulo: 'S a XXL', talles: ['S', 'M', 'L', 'XL', 'XXL'] },
  { clave: 'pantalon', rotulo: 'Pantalón 38 a 56', talles: serie(38, 56, 2) },
  { clave: 'calzado', rotulo: 'Calzado 38 a 46', talles: serie(38, 46) },
  { clave: 'unico', rotulo: 'Talle único', talles: [] },
]

/** «m » → «M». Vacío → null (talle único). */
export function normalizarTalle(t: string | null | undefined): string | null {
  const v = (t ?? '').trim().toUpperCase().slice(0, 12)
  return v || null
}

/** Único primero, después letras (S < M < XL), después números (38 < 40), después lo raro. */
function rango(t: string | null | undefined): [number, number, string] {
  const v = normalizarTalle(t)
  if (!v) return [0, 0, '']
  const i = LETRAS.indexOf(v)
  if (i >= 0) return [1, i, v]
  if (/^\d+([.,]\d+)?$/.test(v)) return [2, Number(v.replace(',', '.')), v]
  return [3, 0, v]
}

export function compararTalle(a: string | null | undefined, b: string | null | undefined): number {
  const x = rango(a)
  const y = rango(b)
  return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2])
}

/** «Camisa de trabajo · M». Sin talle, el nombre solo. */
export function rotuloConTalle(a: Pick<Activo, 'nombre' | 'talle'>): string {
  return a.talle ? `${a.nombre} · ${a.talle}` : a.nombre
}

// ── PRENDAS: los ítems agrupados por nombre, con el stock de cada talle ─────────────────────────
export interface TalleDePrenda {
  activo: Activo
  talle: string | null
  /** Unidades libres (sin nadie que las tenga), estén donde estén. Lo que se puede entregar. */
  disponible: number
  /** Unidades que tiene alguien. */
  entregadas: number
}

export interface Prenda {
  nombre: string
  clase: ClasePersonal
  talles: TalleDePrenda[]
  disponible: number
  entregadas: number
}

/**
 * Las prendas de una clase, vivas, por nombre, y dentro de cada una los talles en orden. Lo que tiene
 * alguien (`persona_id`) está entregado; lo que no tiene a nadie está disponible, esté donde esté.
 */
export function prendas(
  activos: readonly Activo[], existencias: readonly Existencia[], clase: ClasePersonal,
): Prenda[] {
  const porActivo = new Map<string, { disponible: number; entregadas: number }>()
  for (const e of existencias) {
    const c = porActivo.get(e.activo_id) ?? { disponible: 0, entregadas: 0 }
    if (e.persona_id) c.entregadas += e.cantidad
    else c.disponible += e.cantidad
    porActivo.set(e.activo_id, c)
  }
  const grupos = new Map<string, Prenda>()
  for (const a of activos) {
    if (a.clase !== clase || a.estado === 'baja') continue
    const clave = a.nombre.trim().toLowerCase()
    const c = porActivo.get(a.id) ?? { disponible: 0, entregadas: 0 }
    const g = grupos.get(clave) ?? { nombre: a.nombre.trim(), clase, talles: [], disponible: 0, entregadas: 0 }
    g.talles.push({ activo: a, talle: a.talle ?? null, ...c })
    g.disponible += c.disponible
    g.entregadas += c.entregadas
    grupos.set(clave, g)
  }
  for (const g of grupos.values()) g.talles.sort((x, y) => compararTalle(x.talle, y.talle) || x.activo.codigo.localeCompare(y.activo.codigo))
  return [...grupos.values()].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
}

// ── EL TALLE DE LA PERSONA ──────────────────────────────────────────────────────────────────────
export interface TallesPersona {
  camisa: string | null
  pantalon: string | null
  calzado: string | null
}
export type CampoTalle = keyof TallesPersona
export const ETIQUETA_CAMPO_TALLE: Record<CampoTalle, string> = { camisa: 'Camisa / torso', pantalon: 'Pantalón', calzado: 'Calzado' }

/**
 * Qué talle de la persona corresponde a una prenda: calzado si es botín, bota o zapato; pantalón si la
 * prenda se talla con números (38…56); torso si se talla con letras. Talle único = ninguno.
 */
export function campoDeTalle(p: Pick<Prenda, 'nombre' | 'talles'>): CampoTalle | null {
  if (/^(bot[ií]n|bota|botas|zapat|calzado)/i.test(p.nombre.trim())) return 'calzado'
  const conTalle = p.talles.filter((t) => t.talle)
  if (!conTalle.length) return null
  if (conTalle.every((t) => rango(t.talle)[0] === 2)) return 'pantalon'
  return 'camisa'
}

/** El talle de la prenda que coincide con el de la persona, si existe. */
export function talleSugerido(p: Pick<Prenda, 'nombre' | 'talles'>, t: TallesPersona | null): TalleDePrenda | null {
  if (p.talles.length === 1) return p.talles[0]
  const campo = campoDeTalle(p)
  const suyo = campo && t ? normalizarTalle(t[campo]) : null
  return suyo ? (p.talles.find((x) => x.talle === suyo) ?? null) : null
}

// ── LO QUE TIENE UNA PERSONA Y CÓMO LE LLEGÓ ────────────────────────────────────────────────────
/**
 * `historica`: entrega de antes del sistema cargada desde la constancia firmada (no salió de ningún lugar).
 * `traslado`: lo tenía y lo sigue teniendo, pero cambió de lugar (se fue con ella a otra obra).
 */
export type TipoEvento = 'entrega' | 'historica' | 'ya_la_tenia' | 'devolucion' | 'traslado' | 'baja' | 'recuento' | 'egreso'

export interface EventoPersona {
  fecha: string
  tipo: TipoEvento
  activoId: string
  cantidad: number
  usuarioId: string | null
  /** De dónde salió (entrega, traslado). null en devolución: se queda donde estaba. */
  otroLugar: string | null
  /** Dónde quedó después del evento. */
  donde: string | null
  nota: string | null
  /** El papel en Drive que la respalda (la constancia firmada), si hay. */
  respaldo: string | null
}

/**
 * La historia de la persona como tenedora: lo que le llegó (movimiento con `persona_destino` ella, o
 * recuento que sube: «ya la tenía»), lo que devolvió (movimiento con `persona_origen` ella y otro
 * destino), lo que se llevó a otra obra (ella en los dos lados, lugar distinto) y lo que se dio de baja
 * de lo suyo (gastado, perdido, robado, egreso). De lo más nuevo a lo más viejo.
 */
export function historialDePersona(
  personaId: string | null, movimientos: readonly Movimiento[], ajustes: readonly Ajuste[],
): EventoPersona[] {
  if (!personaId) return []
  const out: EventoPersona[] = []
  for (const m of movimientos) {
    const llega = m.persona_destino === personaId
    const sale = m.persona_origen === personaId
    if (!llega && !sale) continue
    const base = { fecha: m.fecha_hora, activoId: m.activo_id, cantidad: m.cantidad ?? 1, usuarioId: m.usuario_id, donde: m.destino_id, nota: m.nota, respaldo: m.respaldo_drive_file_id ?? null }
    if (llega && sale) {
      if (m.origen_id !== m.destino_id) out.push({ ...base, tipo: 'traslado', otroLugar: m.origen_id })
    } else if (llega) {
      out.push({ ...base, tipo: !m.origen_id && m.respaldo_drive_file_id ? 'historica' : 'entrega', otroLugar: m.origen_id })
    } else {
      out.push({ ...base, tipo: 'devolucion', otroLugar: m.origen_id !== m.destino_id ? m.destino_id : null })
    }
  }
  for (const a of ajustes) {
    if (a.persona_id !== personaId) continue
    const tipo: TipoEvento = a.motivo === 'egreso' ? 'egreso' : a.motivo !== 'recuento' ? 'baja' : a.antes === 0 || /^ya la ten/i.test(a.detalle ?? '') ? 'ya_la_tenia' : 'recuento'
    out.push({ fecha: a.creado_en, tipo, activoId: a.activo_id, cantidad: Math.abs(a.despues - a.antes), usuarioId: a.usuario_id, otroLugar: null, donde: a.ubicacion_id, nota: a.detalle, respaldo: null })
  }
  return out.sort((x, y) => (x.fecha < y.fecha ? 1 : x.fecha > y.fecha ? -1 : 0))
}

export interface Tenencia {
  activo: Activo
  cantidad: number
  /** DÓNDE está lo que tiene: la obra donde trabaja, o el Taller. */
  dondeId: string
  /** La última vez que le llegó este ítem (entrega o «ya la tenía»). null = no hay registro. */
  ultima: EventoPersona | null
}

/** Lo que la persona tiene HOY, por ítem y lugar, con la última entrega. EPP primero, después ropa; por nombre y talle. */
export function tenencias(
  personaId: string | null, activos: readonly Activo[], existencias: readonly Existencia[], historial: readonly EventoPersona[],
): Tenencia[] {
  if (!personaId) return []
  const porId = new Map(activos.map((a) => [a.id, a]))
  const out: Tenencia[] = []
  for (const e of existencias) {
    if (e.persona_id !== personaId) continue
    const a = porId.get(e.activo_id)
    if (!a || a.estado === 'baja') continue
    const ultima = historial.find((h) => h.activoId === a.id && (h.tipo === 'entrega' || h.tipo === 'historica' || h.tipo === 'ya_la_tenia')) ?? null
    out.push({ activo: a, cantidad: e.cantidad, dondeId: e.ubicacion_id, ultima })
  }
  const orden = (a: Activo) => (a.clase === 'epp' ? 0 : 1)
  return out.sort((x, y) => orden(x.activo) - orden(y.activo) || x.activo.nombre.localeCompare(y.activo.nombre, 'es') || compararTalle(x.activo.talle, y.activo.talle))
}

export interface TenedorEnLugar {
  personaId: string
  items: { activo: Activo; cantidad: number }[]
  unidades: number
}

/**
 * Quién tiene qué en un lugar: cada persona con lo suyo, para la vista de una obra. `nombreDe` sólo
 * ordena. Lo libre (sin persona) no entra: eso es el stock del lugar.
 */
export function tenedoresEn(
  ubicacionId: string, activos: readonly Activo[], existencias: readonly Existencia[],
  nombreDe: (personaId: string) => string = (p) => p,
): TenedorEnLugar[] {
  const porId = new Map(activos.map((a) => [a.id, a]))
  const grupos = new Map<string, TenedorEnLugar>()
  for (const e of existencias) {
    if (e.ubicacion_id !== ubicacionId || !e.persona_id) continue
    const a = porId.get(e.activo_id)
    if (!a || a.estado === 'baja') continue
    const g = grupos.get(e.persona_id) ?? { personaId: e.persona_id, items: [], unidades: 0 }
    g.items.push({ activo: a, cantidad: e.cantidad })
    g.unidades += e.cantidad
    grupos.set(e.persona_id, g)
  }
  for (const g of grupos.values()) g.items.sort((x, y) => x.activo.nombre.localeCompare(y.activo.nombre, 'es') || compararTalle(x.activo.talle, y.activo.talle))
  return [...grupos.values()].sort((x, y) => nombreDe(x.personaId).localeCompare(nombreDe(y.personaId), 'es'))
}

export const ETIQUETA_EVENTO: Record<TipoEvento, string> = {
  entrega: 'Entrega', historica: 'Entrega (constancia)', ya_la_tenia: 'Ya la tenía', devolucion: 'Devolución', traslado: 'Cambió de obra', baja: 'Baja', recuento: 'Recuento', egreso: 'Egresó · no devuelto',
}
