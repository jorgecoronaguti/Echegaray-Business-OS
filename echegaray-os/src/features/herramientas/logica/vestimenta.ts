// EPP Y ROPA DE TRABAJO (migración 20260925T1100) — puro: sin Supabase, sin React.
//
// Dueño, 25/09/2026: «armes categorías nuevas … epp y ropa de trabajo … darme una base de camisas,
// pantalones permitiendo hacer recuento de stock posterior», y en el legajo una solapa para asignarle
// a cada persona lo que sale de esas dos listas.
//
// ═══ LO QUE LAS DISTINGUE DE UNA HERRAMIENTA ═══
//   · Van POR TALLE: «Camisa de trabajo» es una prenda y cada talle es un ítem con su código y su stock.
//   · Stock 0 es un estado normal («sin stock»), no una baja ni «sin ubicación cargada».
//   · Se ENTREGAN a una persona: la persona es un lugar (`ubicacion.tipo = 'persona'`), así que entregar
//     es un movimiento de inventario y queda en el historial con quién entregó y cuándo.

import type { Activo, Ajuste, Existencia, Movimiento, TipoUbicacion } from '../types.ts'

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
  /** Unidades en lugares que no son personas: Taller, obras, rodados. Lo que se puede entregar. */
  disponible: number
  /** Unidades en poder de personas. */
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
 * Las prendas de una clase, vivas, por nombre, y dentro de cada una los talles en orden. `tipoDe`
 * dice qué es cada lugar: lo que está en una persona está entregado, lo demás está disponible.
 */
export function prendas(
  activos: readonly Activo[], existencias: readonly Existencia[],
  tipoDe: (ubicacionId: string) => TipoUbicacion | null, clase: ClasePersonal,
): Prenda[] {
  const porActivo = new Map<string, { disponible: number; entregadas: number }>()
  for (const e of existencias) {
    const c = porActivo.get(e.activo_id) ?? { disponible: 0, entregadas: 0 }
    if (tipoDe(e.ubicacion_id) === 'persona') c.entregadas += e.cantidad
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
/** `historica`: entrega de antes del sistema cargada desde la constancia firmada (no salió de ningún lugar). */
export type TipoEvento = 'entrega' | 'historica' | 'ya_la_tenia' | 'devolucion' | 'baja' | 'recuento' | 'egreso'

export interface EventoPersona {
  fecha: string
  tipo: TipoEvento
  activoId: string
  cantidad: number
  usuarioId: string | null
  /** De dónde salió (entrega) o a dónde volvió (devolución). */
  otroLugar: string | null
  nota: string | null
  /** El papel en Drive que la respalda (la constancia firmada), si hay. */
  respaldo: string | null
}

/**
 * La historia de la persona como lugar: lo que le llegó (movimiento con destino ella, o recuento que
 * sube: «ya la tenía»), lo que devolvió (movimiento con origen ella) y lo que se dio de baja en ella
 * (gastado, perdido, robado). De lo más nuevo a lo más viejo.
 */
export function historialDePersona(
  ubicacionId: string | null, movimientos: readonly Movimiento[], ajustes: readonly Ajuste[],
): EventoPersona[] {
  if (!ubicacionId) return []
  const out: EventoPersona[] = []
  for (const m of movimientos) {
    if (m.destino_id === ubicacionId) {
      const tipo: TipoEvento = !m.origen_id && m.respaldo_drive_file_id ? 'historica' : 'entrega'
      out.push({ fecha: m.fecha_hora, tipo, activoId: m.activo_id, cantidad: m.cantidad ?? 1, usuarioId: m.usuario_id, otroLugar: m.origen_id, nota: m.nota, respaldo: m.respaldo_drive_file_id ?? null })
    } else if (m.origen_id === ubicacionId) {
      out.push({ fecha: m.fecha_hora, tipo: 'devolucion', activoId: m.activo_id, cantidad: m.cantidad ?? 1, usuarioId: m.usuario_id, otroLugar: m.destino_id, nota: m.nota, respaldo: m.respaldo_drive_file_id ?? null })
    }
  }
  for (const a of ajustes) {
    if (a.ubicacion_id !== ubicacionId) continue
    const tipo: TipoEvento = a.motivo === 'egreso' ? 'egreso' : a.motivo !== 'recuento' ? 'baja' : a.antes === 0 || /^ya la ten/i.test(a.detalle ?? '') ? 'ya_la_tenia' : 'recuento'
    out.push({ fecha: a.creado_en, tipo, activoId: a.activo_id, cantidad: Math.abs(a.despues - a.antes), usuarioId: a.usuario_id, otroLugar: null, nota: a.detalle, respaldo: null })
  }
  return out.sort((x, y) => (x.fecha < y.fecha ? 1 : x.fecha > y.fecha ? -1 : 0))
}

export interface Tenencia {
  activo: Activo
  cantidad: number
  /** La última vez que le llegó este ítem (entrega o «ya la tenía»). null = no hay registro. */
  ultima: EventoPersona | null
}

/** Lo que la persona tiene HOY, por ítem, con la última entrega. EPP primero, después ropa; por nombre y talle. */
export function tenencias(
  ubicacionId: string | null, activos: readonly Activo[], existencias: readonly Existencia[], historial: readonly EventoPersona[],
): Tenencia[] {
  if (!ubicacionId) return []
  const porId = new Map(activos.map((a) => [a.id, a]))
  const out: Tenencia[] = []
  for (const e of existencias) {
    if (e.ubicacion_id !== ubicacionId) continue
    const a = porId.get(e.activo_id)
    if (!a || a.estado === 'baja') continue
    const ultima = historial.find((h) => h.activoId === a.id && (h.tipo === 'entrega' || h.tipo === 'historica' || h.tipo === 'ya_la_tenia')) ?? null
    out.push({ activo: a, cantidad: e.cantidad, ultima })
  }
  const orden = (a: Activo) => (a.clase === 'epp' ? 0 : 1)
  return out.sort((x, y) => orden(x.activo) - orden(y.activo) || x.activo.nombre.localeCompare(y.activo.nombre, 'es') || compararTalle(x.activo.talle, y.activo.talle))
}

export const ETIQUETA_EVENTO: Record<TipoEvento, string> = {
  entrega: 'Entrega', historica: 'Entrega (constancia)', ya_la_tenia: 'Ya la tenía', devolucion: 'Devolución', baja: 'Baja', recuento: 'Recuento', egreso: 'Egresó · no devuelto',
}
