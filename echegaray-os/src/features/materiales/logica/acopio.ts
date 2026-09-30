// MATERIAL · ACOPIO EN EL TALLER PARA UNA OBRA — la lógica pura.
//
// El Taller guarda material que ya tiene obra destino (dueño, 30/09/2026). El LUGAR es uno; el DESTINO es
// otro eje: cada fila de existencia es libre (`destino_obra_id` nulo) o acopiada para una obra. Módulo
// neutral (sin React ni Supabase): lo usan la pantalla de stock, el formulario de mover, la ficha, las
// vistas de obra y los tests. La regla vive en Postgres (`mover_material` consume primero el acopio de la
// obra destino; mover acopio a OTRA obra pide confirmación); acá se dibuja el mismo reparto para avisar
// antes de ir a la base, no para decidirlo.

import { redondear, type Destino, type Existencia } from './stock.ts'

export interface AcopioDeMaterial {
  obra_id: string
  /** «OB-0008 · Obra». */
  rotulo: string
  cantidad: number
  /** Fecha de ingreso de esa fila. */
  desde: string | null
}

/** Un material en un lugar, partido en lo libre y lo acopiado por obra. */
export interface DesgloseMaterial {
  material_id: string
  material: string
  unidad: string | null
  total: number
  libre: number
  acopios: AcopioDeMaterial[]
}

/** La obra de una fila de existencia; `null` = libre. */
export const enObra = (e: Pick<Existencia, 'destino_obra_id'>): string | null => e.destino_obra_id ?? null

/** El stock de un lugar agrupado por material: libre + acopios por obra. Lo que está en cero no aparece. */
export function desgloseDeLugar(existencias: Existencia[], lugarId: string): DesgloseMaterial[] {
  const por = new Map<string, DesgloseMaterial>()
  for (const e of existencias) {
    if (e.ubicacion_id !== lugarId || !(e.cantidad > 0)) continue
    let d = por.get(e.material_id)
    if (!d) {
      d = { material_id: e.material_id, material: e.material, unidad: e.unidad, total: 0, libre: 0, acopios: [] }
      por.set(e.material_id, d)
    }
    d.total = redondear(d.total + e.cantidad)
    const obra = enObra(e)
    if (obra == null) d.libre = redondear(d.libre + e.cantidad)
    else d.acopios.push({ obra_id: obra, rotulo: e.destino_rotulo ?? obra, cantidad: e.cantidad, desde: e.desde ?? null })
  }
  for (const d of por.values()) d.acopios.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'es'))
  return [...por.values()].sort((a, b) => a.material.localeCompare(b.material, 'es'))
}

export interface AcopioDeObra {
  material_id: string
  material: string
  unidad: string | null
  cantidad: number
  desde: string | null
  lugar_id: string
}

/** Lo acopiado PARA una obra (hoy sólo el Taller acopia): el bloque «en el Taller para esta obra». */
export function acopiadoParaObra(existencias: Existencia[], obraId: string): AcopioDeObra[] {
  return existencias
    .filter((e) => e.cantidad > 0 && enObra(e) === obraId)
    .map((e) => ({ material_id: e.material_id, material: e.material, unidad: e.unidad, cantidad: e.cantidad, desde: e.desde ?? null, lugar_id: e.ubicacion_id }))
    .sort((a, b) => a.material.localeCompare(b.material, 'es'))
}

/**
 * El reparto que hará `mover_material` sin renglón explícito: del Taller a una obra se consume PRIMERO lo
 * acopiado para esa obra y después lo libre. Hacia cualquier otro destino sólo sale lo libre.
 */
export function repartoAutomatico(d: DesgloseMaterial, obraDestino: string | null, cantidad: number): { deAcopio: number; deLibre: number; falta: number } {
  const acopio = obraDestino ? (d.acopios.find((a) => a.obra_id === obraDestino)?.cantidad ?? 0) : 0
  const deAcopio = Math.min(cantidad, acopio)
  const resto = redondear(cantidad - deAcopio)
  const deLibre = Math.min(resto, d.libre)
  return { deAcopio: redondear(deAcopio), deLibre: redondear(deLibre), falta: redondear(resto - deLibre) }
}

/** Lo que se puede sacar sin renglón explícito: lo libre más el acopio de la obra destino. */
export const disponibleAutomatico = (d: DesgloseMaterial, obraDestino: string | null): number =>
  redondear(d.libre + (obraDestino ? (d.acopios.find((a) => a.obra_id === obraDestino)?.cantidad ?? 0) : 0))

/**
 * «28/09» de una fecha de ingreso. Con zona fija: servidor y navegador dibujan el mismo día (si no, un
 * ingreso de las 22 h de San Juan sale con la fecha de mañana en uno de los dos y React avisa el desajuste).
 */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // `es-AR` devuelve «28/9» según la versión de ICU del servidor y del navegador: se arma el «28/09» a mano
  // desde `en-CA` (AAAA-MM-DD, estable) para que servidor y cliente escriban lo mismo.
  const [, mes, dia] = d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/San_Juan' }).split('-')
  return `${dia}/${mes}`
}

/** Un renglón del formulario de mover: lo que se puede mandar de un material, por automático o de un acopio puntual. */
export interface RenglonMover {
  clave: string
  material_id: string
  material: string
  unidad: string | null
  /** `null` = automático (primero el acopio de la obra destino, después lo libre). */
  acopio: string | null
  /** Sólo en un renglón de acopio: el rótulo de la obra para la que está guardado. */
  rotuloAcopio: string | null
  maximo: number
  /** Del automático: lo que de ese máximo es del acopio de la obra destino. */
  deAcopioDestino: number
}

/**
 * Los renglones del formulario. Por cada material: uno automático (libre + acopio de la obra destino) y
 * uno por cada acopio de OTRA obra, que sólo sale confirmando la reasignación. El acopio de la propia obra
 * destino no tiene renglón aparte: el automático ya lo consume primero, como lo hace la base.
 */
export function renglonesDeMover(desgloses: DesgloseMaterial[], obraDestino: string | null): RenglonMover[] {
  return desgloses.flatMap((d) => {
    const propio = obraDestino ? (d.acopios.find((a) => a.obra_id === obraDestino)?.cantidad ?? 0) : 0
    const auto: RenglonMover = {
      clave: claveRenglon(d.material_id, null), material_id: d.material_id, material: d.material, unidad: d.unidad,
      acopio: null, rotuloAcopio: null, maximo: disponibleAutomatico(d, obraDestino), deAcopioDestino: propio,
    }
    const otros = d.acopios.filter((a) => a.obra_id !== obraDestino).map((a): RenglonMover => ({
      clave: claveRenglon(d.material_id, a.obra_id), material_id: d.material_id, material: d.material, unidad: d.unidad,
      acopio: a.obra_id, rotuloAcopio: a.rotulo, maximo: a.cantidad, deAcopioDestino: 0,
    }))
    return [auto, ...otros]
  })
}

export interface ItemMover { material: string; cantidad: number; acopio?: string; reasignar?: boolean }

/** Lo escrito → los ítems de `mover_material`. Un renglón vacío no se manda; uno de acopio ajeno va con `reasignar`. */
export function armarItemsMover(
  renglones: RenglonMover[],
  cantidades: Record<string, string>,
  leer: (t: string) => number | null,
): { items: ItemMover[]; error: string | null; reasigna: boolean } {
  const items: ItemMover[] = []
  for (const r of renglones) {
    const t = (cantidades[r.clave] ?? '').trim()
    if (!t) continue
    const n = leer(t)
    if (n == null || n <= 0) return { items: [], error: `Revisá la cantidad de ${r.material}`, reasigna: false }
    if (n > r.maximo) return { items: [], error: `De ${r.material}${r.rotuloAcopio ? ` (acopio para ${r.rotuloAcopio})` : ''} sólo hay ${r.maximo}`, reasigna: false }
    items.push(r.acopio ? { material: r.material_id, cantidad: n, acopio: r.acopio, reasignar: true } : { material: r.material_id, cantidad: n })
  }
  if (items.length === 0) return { items, error: 'Poné la cantidad de al menos un material', reasigna: false }
  return { items, error: null, reasigna: items.some((i) => i.reasignar) }
}

/** Clave de renglón para una cantidad escrita: `material` (automático) o `material|obra` (acopio explícito). */
export const claveRenglon = (material: string, acopio: string | null): string => (acopio ? `${material}|${acopio}` : material)

/** Las obras para las que se puede acopiar (el Taller mismo no es una obra). */
export const obrasAcopiables = (destinos: Destino[]): Array<{ id: string; rotulo: string }> =>
  destinos.flatMap((d) => (d.tipo === 'obra' && d.obra_id ? [{ id: d.obra_id, rotulo: d.rotulo }] : []))

/** ¿El destino elegido es el Taller? Sólo ahí tiene sentido «es para una obra». */
export const esTaller = (destinos: Destino[], valor: string): boolean => destinos.some((d) => d.valor === valor && d.tipo === 'taller')

/** La obra a la que va un destino (`null` si es el Taller o no hay elegido). */
export const obraDeDestino = (destinos: Destino[], valor: string): string | null => destinos.find((d) => d.valor === valor)?.obra_id ?? null
