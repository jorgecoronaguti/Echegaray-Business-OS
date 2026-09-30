// MATERIAL · INVENTARIO, RESUMEN Y LIBRO: la lógica pura de las solapas que calcan Herramientas.
//
// El dueño pidió el 29/09/2026 «el inventario como en herramientas… no solo como gestión de pedidos
// sino también de control de stock», y el 30/09 «rehacer materiales tal como pedí ayer». Herramientas
// cuenta ACTIVOS (una amoladora es una cosa con código). Material cuenta CANTIDADES de un catálogo
// (12,5 tiras de hierro del 8), así que se copia la estructura (Resumen → Inventario → Ubicaciones →
// Movimientos) y no las cuentas.
//
// Es un módulo neutral (sin React ni Supabase), igual que `stock.ts`: lo usan el servidor, los componentes
// y los tests. Las cifras salen de lo que la base devolvió, que ya viene recortado por la RLS. Acá no se
// vuelve a filtrar por permiso.

import { sinEntregar, lecturaPedido } from '../../../shared/lib/estadoPedidoMaterial.ts'
import { hrefMaterialEscritorio, type Pedido } from './pedidos.ts'
import { faltaLlegar, numeroRemito, redondear, type Existencia, type Lugar, type Remito } from './stock.ts'

export type TipoMovimiento = 'entrada' | 'consumo' | 'traslado' | 'ajuste' | 'anulacion' | 'reasignacion'

/** Un asiento de `material_movimiento`, con el nombre del material y el de quien lo hizo ya resueltos. */
export interface MovimientoMaterial {
  id: string
  material_id: string
  material: string
  unidad: string | null
  tipo: TipoMovimiento
  origen_id: string | null
  destino_id: string | null
  cantidad: number
  pedido_id: string | null
  remito_id: string | null
  /** Obra del acopio que tocó el asiento (`null` = libre). En una reasignación es de dónde salió. */
  acopio_id?: string | null
  /** Sólo en una reasignación: a qué obra pasó (`null` = quedó libre). */
  acopio_a_id?: string | null
  motivo: string | null
  nota: string | null
  creado_en: string
  /** El nombre de la persona. Es `null` cuando no hay registro de quién fue, y eso no es «nadie». */
  quien: string | null
}

const DIA = 86_400_000

/** Sin tildes y en minúscula: «Cal hidráulica» se encuentra escribiendo «hidraulica». */
export const normalizar = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const ordenLugar = (a: { tipo: string; rotulo: string }, b: { tipo: string; rotulo: string }) =>
  a.tipo === b.tipo ? a.rotulo.localeCompare(b.rotulo, 'es') : a.tipo === 'taller' ? -1 : 1

// ─── INVENTARIO ─────────────────────────────────────────────────────────────────────────────────

export interface FilaInventario {
  material_id: string
  material: string
  unidad: string | null
  /** La suma de los lugares que se muestran. Con el filtro de lugar, es lo que hay en ESE lugar. */
  total: number
  lugares: Array<{ id: string; rotulo: string; tipo: 'taller' | 'obra'; cantidad: number; /** Lo que, de esa cantidad, está acopiado para una obra. */ acopiado: number }>
  /** Fecha del último asiento de ese material, o `null` si no hay ninguno visible. */
  ultimo: string | null
}

export interface FiltroInventario {
  q?: string | null
  /** id de `ubicacion`. */
  lugar?: string | null
}

/** Una fila por material con saldo, con su reparto por lugar. Lo que está en cero en todos lados no aparece. */
export function inventarioPorMaterial(
  existencias: Existencia[], lugares: Lugar[], movimientos: MovimientoMaterial[], filtro: FiltroInventario = {},
): FilaInventario[] {
  const lugar = new Map(lugares.map((l) => [l.id, l]))
  const q = filtro.q ? normalizar(filtro.q) : ''
  const ultimo = new Map<string, string>()
  for (const m of movimientos) {
    const u = ultimo.get(m.material_id)
    if (!u || m.creado_en > u) ultimo.set(m.material_id, m.creado_en)
  }
  const filas = new Map<string, FilaInventario>()
  for (const e of existencias) {
    if (!(e.cantidad > 0)) continue
    if (filtro.lugar && e.ubicacion_id !== filtro.lugar) continue
    if (q && !normalizar(e.material).includes(q)) continue
    const l = lugar.get(e.ubicacion_id)
    // Un saldo en un lugar archivado o que la lectura no trajo no se esconde: se muestra como «otro lugar».
    const acop = e.destino_obra_id ? e.cantidad : 0
    const info = { id: e.ubicacion_id, rotulo: l?.rotulo ?? 'Otro lugar', tipo: l?.tipo ?? 'obra', cantidad: e.cantidad, acopiado: acop }
    const f = filas.get(e.material_id)
    if (f) {
      f.total = redondear(f.total + e.cantidad)
      // Libre y acopiado son filas distintas de un MISMO lugar: en el inventario el lugar aparece una vez.
      const mismo = f.lugares.find((x) => x.id === e.ubicacion_id)
      if (mismo) { mismo.cantidad = redondear(mismo.cantidad + e.cantidad); mismo.acopiado = redondear(mismo.acopiado + acop) }
      else f.lugares.push(info)
    } else {
      filas.set(e.material_id, {
        material_id: e.material_id, material: e.material, unidad: e.unidad, total: e.cantidad, lugares: [info], ultimo: ultimo.get(e.material_id) ?? null,
      })
    }
  }
  const r = [...filas.values()]
  for (const f of r) f.lugares.sort(ordenLugar)
  return r.sort((a, b) => a.material.localeCompare(b.material, 'es'))
}

// ─── RESUMEN ────────────────────────────────────────────────────────────────────────────────────

const recibida = (p: Pedido) => Number(p.cantidad_recibida ?? 0)
const cancelado = (p: Pedido) => lecturaPedido(p.estado).clave === 'cancelado'
/** Llegó algo pero no todo. Un pedido sin cantidad no tiene «falta» calculable, así que no es parcial. */
export const esParcial = (p: Pedido): boolean => {
  if (cancelado(p) || recibida(p) <= 0) return false
  const f = faltaLlegar(p.cantidad, p.cantidad_recibida)
  return f != null && f > 0
}
/**
 * Figura ENTREGADO y no tiene ninguna llegada contada. Así quedaron los pedidos anteriores al stock (al
 * 30/09 son los 7 que hay). No hay asiento que diga dónde quedó ese material, y eso no significa que
 * esté en algún lugar.
 */
export const entregadoSinLlegada = (p: Pedido): boolean => lecturaPedido(p.estado).clave === 'entregado' && recibida(p) <= 0

export interface CifrasMaterial {
  sinEntregar: number
  parciales: number
  materialesConStock: number
  lugaresConStock: number
  movimientos7: number
  entregadosSinLlegada: number
}

export function cifrasMaterial(pedidos: Pedido[], existencias: Existencia[], movimientos: MovimientoMaterial[], hoy: Date = new Date()): CifrasMaterial {
  const con = existencias.filter((e) => e.cantidad > 0)
  const desde = hoy.getTime() - 7 * DIA
  return {
    sinEntregar: pedidos.filter((p) => sinEntregar(p.estado)).length,
    parciales: pedidos.filter(esParcial).length,
    materialesConStock: new Set(con.map((e) => e.material_id)).size,
    lugaresConStock: new Set(con.map((e) => e.ubicacion_id)).size,
    movimientos7: movimientos.filter((m) => new Date(m.creado_en).getTime() >= desde).length,
    entregadosSinLlegada: pedidos.filter(entregadoSinLlegada).length,
  }
}

export interface ObraMaterial {
  obra_id: string
  rotulo: string
  /** El depósito de la obra, o `null` si todavía no recibió nada. */
  lugar_id: string | null
  /** Cuántos materiales distintos tienen saldo en la obra. */
  materiales: number
  /** Cuántos pedidos no llegaron todavía. */
  abiertos: number
  /** Cuántos pedidos llegaron parciales y tienen faltante. */
  parciales: number
}

/** Las obras que tienen material en su depósito o pedidos sin cerrar: el cuadro «Obras» del Resumen. */
export function obrasDeMaterial(pedidos: Pedido[], existencias: Existencia[], lugares: Lugar[]): ObraMaterial[] {
  const porObra = new Map<string, ObraMaterial>()
  const fila = (obra: string, rotulo: string) => {
    let f = porObra.get(obra)
    if (!f) {
      f = { obra_id: obra, rotulo, lugar_id: null, materiales: 0, abiertos: 0, parciales: 0 }
      porObra.set(obra, f)
    }
    return f
  }
  for (const l of lugares) {
    if (l.tipo !== 'obra' || !l.obra_id) continue
    const n = new Set(existencias.filter((e) => e.ubicacion_id === l.id && e.cantidad > 0).map((e) => e.material_id)).size
    if (n === 0) continue
    const f = fila(l.obra_id, l.rotulo)
    f.lugar_id = l.id
    f.materiales = n
  }
  for (const p of pedidos) {
    if (!p.obra) continue
    const abierto = sinEntregar(p.estado)
    const parcial = esParcial(p)
    if (!abierto && !parcial) continue
    const f = fila(p.obra, p.obra_rotulo ?? 'Obra')
    if (abierto) f.abiertos += 1
    if (parcial) f.parciales += 1
  }
  for (const l of lugares) {
    const f = l.obra_id ? porObra.get(l.obra_id) : undefined
    if (f && !f.lugar_id) f.lugar_id = l.id
  }
  return [...porObra.values()].sort((a, b) => b.abiertos + b.parciales - (a.abiertos + a.parciales) || a.rotulo.localeCompare(b.rotulo, 'es'))
}

export type ClaveDecision = 'parcial' | 'sin_llegar' | 'sin_obra' | 'entregado_sin_llegada'
export interface DecisionMaterial {
  clave: ClaveDecision
  /** Único dentro de la lista (una clave puede repetirse por obra o por pedido). */
  id: string
  titulo: string
  detalle: string
  donde: string
  /** ISO de lo más viejo que compone la fila. Es `null` cuando no aplica. */
  desde: string | null
  tono: 'warn' | 'info'
  href: string
}

const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`
const cant = (n: number, u: string | null) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 3 })}${u ? ` ${u}` : ''}`

/**
 * La lista que se vacía. Una fila por pedido que llegó a medias, una fila por obra con pedidos sin llegar,
 * y una fila agregada para los pedidos sin obra y para los ENTREGADO sin llegada contada. No hay umbral
 * de días inventado: la columna «Desde» muestra la antigüedad y quien mira decide.
 */
export function decisionesMaterial(pedidos: Pedido[]): DecisionMaterial[] {
  const out: DecisionMaterial[] = []
  for (const p of pedidos.filter(esParcial).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const falta = faltaLlegar(p.cantidad, p.cantidad_recibida) ?? 0
    out.push({
      clave: 'parcial', id: `parcial-${p.id_pedido}`, tono: 'warn',
      titulo: `Llegó parcial: ${p.material ?? 'material'}`,
      detalle: `llegaron ${cant(recibida(p), p.unidad)} de ${cant(p.cantidad ?? 0, p.unidad)}. Faltan ${cant(falta, p.unidad)}`,
      donde: p.obra_rotulo ?? 'sin obra', desde: p.created_at,
      href: hrefMaterialEscritorio({ obra: p.obra, estado: 'todos' }),
    })
  }
  const abiertos = pedidos.filter((p) => sinEntregar(p.estado))
  const porObra = new Map<string, Pedido[]>()
  for (const p of abiertos) if (p.obra) porObra.set(p.obra, [...(porObra.get(p.obra) ?? []), p])
  const grupos = [...porObra.entries()].map(([obra, ps]) => ({ obra, ps: ps.sort((a, b) => a.created_at.localeCompare(b.created_at)) }))
  for (const { obra, ps } of grupos.sort((a, b) => a.ps[0].created_at.localeCompare(b.ps[0].created_at))) {
    const nombres = ps.map((p) => p.material ?? 'material')
    out.push({
      clave: 'sin_llegar', id: `sin-llegar-${obra}`, tono: 'info',
      titulo: `${plural(ps.length, 'pedido', 'pedidos')} sin llegar`,
      detalle: nombres.slice(0, 3).join(', ') + (nombres.length > 3 ? ` y ${nombres.length - 3} más` : ''),
      donde: ps[0].obra_rotulo ?? 'Obra', desde: ps[0].created_at,
      href: hrefMaterialEscritorio({ obra }),
    })
  }
  const sinObra = abiertos.filter((p) => !p.obra).sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (sinObra.length) {
    out.push({
      clave: 'sin_obra', id: 'sin-obra', tono: 'warn',
      titulo: `${plural(sinObra.length, 'pedido abierto', 'pedidos abiertos')} sin obra`,
      detalle: 'no se sabe a qué depósito tiene que llegar',
      donde: 'sin obra', desde: sinObra[0].created_at,
      href: hrefMaterialEscritorio({}),
    })
  }
  const viejos = pedidos.filter(entregadoSinLlegada).sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (viejos.length) {
    out.push({
      clave: 'entregado_sin_llegada', id: 'entregado-sin-llegada', tono: 'info',
      titulo: `${plural(viejos.length, 'pedido figura', 'pedidos figuran')} Entregado sin llegada contada`,
      detalle: 'no está en ningún lugar del stock; si el material está, ingresalo desde Inventario',
      donde: 'varias obras', desde: viejos[0].created_at,
      href: hrefMaterialEscritorio({ estado: 'entregado' }),
    })
  }
  return out
}

export interface DondeEsta {
  tipo: 'taller' | 'obra'
  /** Lugares de ese tipo que tienen algo. */
  lugares: number
  /** Renglones de saldo (material × lugar) en ese tipo. */
  renglones: number
}

/** Taller contra obras: cuántos lugares con algo y cuántos renglones de saldo en cada uno. */
export function dondeEstaMaterial(lugares: Lugar[], existencias: Existencia[]): DondeEsta[] {
  const tipo = new Map(lugares.map((l) => [l.id, l.tipo]))
  const acc = { taller: { l: new Set<string>(), r: 0 }, obra: { l: new Set<string>(), r: 0 } }
  for (const e of existencias) {
    if (!(e.cantidad > 0)) continue
    const t = tipo.get(e.ubicacion_id) ?? 'obra'
    acc[t].l.add(e.ubicacion_id)
    acc[t].r += 1
  }
  return (['taller', 'obra'] as const).map((t) => ({ tipo: t, lugares: acc[t].l.size, renglones: acc[t].r }))
}

// ─── LIBRO DE MOVIMIENTOS ───────────────────────────────────────────────────────────────────────

export interface RenglonLibro {
  id: string
  creado_en: string
  material: string
  /** «+12,5 tira», «−3 bolsa», o «4 tira» si es un traslado (no cambia el total). */
  cantidad: string
  /** Llegó · Ingreso · Usé · Envío · Recuento · Llegada anulada. */
  que: string
  desde: string | null
  hacia: string | null
  /** «R-0007» si el asiento viajó con remito. */
  remito: string | null
  nota: string | null
  quien: string | null
}

export const TIPOS_LIBRO: Array<{ id: TipoMovimiento; label: string }> = [
  { id: 'entrada', label: 'Entradas' },
  { id: 'consumo', label: 'Usos' },
  { id: 'traslado', label: 'Envíos' },
  { id: 'ajuste', label: 'Recuentos' },
  { id: 'anulacion', label: 'Anulaciones' },
  { id: 'reasignacion', label: 'Reasignaciones' },
]
export const tipoLibroDeUrl = (v: string | null | undefined): TipoMovimiento | null =>
  TIPOS_LIBRO.find((t) => t.id === v)?.id ?? null

const MOTIVO: Record<string, string> = { recuento: 'recuento', perdido: 'perdido', descartado: 'descartado' }

export function libroMaterial(
  movimientos: MovimientoMaterial[], lugares: Lugar[], remitos: Remito[], filtro: { tipo?: TipoMovimiento | null; lugar?: string | null } = {},
  /** Rótulo de cada obra por id: para decir «Acopio OB-0008 → libre» en las reasignaciones. */
  obras: Record<string, string> = {},
): RenglonLibro[] {
  const obra = (id: string | null | undefined) => (id ? (obras[id] ?? id) : 'libre')
  const rot = new Map(lugares.map((l) => [l.id, l.rotulo]))
  const nro = new Map(remitos.map((r) => [r.id, numeroRemito(r.numero)]))
  const nombre = (id: string | null) => (id ? (rot.get(id) ?? 'otro lugar') : null)
  return movimientos
    .filter((m) => (!filtro.tipo || m.tipo === filtro.tipo) && (!filtro.lugar || m.origen_id === filtro.lugar || m.destino_id === filtro.lugar))
    .sort((a, b) => b.creado_en.localeCompare(a.creado_en))
    .map((m) => {
      const n = cant(m.cantidad, m.unidad)
      const suma = m.tipo === 'entrada' || (m.tipo === 'ajuste' && m.destino_id != null)
      const que =
        m.tipo === 'entrada' ? `${m.pedido_id ? 'Llegó' : 'Ingreso'}${m.acopio_id ? ` para ${obra(m.acopio_id)}` : ''}`
        : m.tipo === 'consumo' ? `Usé${m.acopio_id ? ` · acopio ${obra(m.acopio_id)}` : ''}`
        : m.tipo === 'traslado' ? 'Envío'
        : m.tipo === 'ajuste' ? `Recuento · ${MOTIVO[m.motivo ?? ''] ?? 'ajuste'}`
        : m.tipo === 'reasignacion' ? `Acopio ${obra(m.acopio_id)} → ${obra(m.acopio_a_id)}`
        : 'Llegada anulada'
      // Una reasignación no mueve nada de lugar: origen y destino son el mismo, no se dibuja «Taller → Taller».
      const quieta = m.tipo === 'reasignacion'
      return {
        id: m.id, creado_en: m.creado_en, material: m.material,
        cantidad: m.tipo === 'traslado' || quieta ? n : `${suma ? '+' : '−'}${n}`,
        que, desde: nombre(m.origen_id), hacia: quieta ? null : nombre(m.destino_id),
        remito: m.remito_id ? (nro.get(m.remito_id) ?? null) : null,
        nota: m.nota, quien: m.quien,
      }
    })
}
