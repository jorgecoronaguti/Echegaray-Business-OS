// OPERACIÓN DE LA OBRA — lo que se dibuja, derivado de los datos (diseño ERP Obras 09 · 10 · 11 · 12
// y M12 · M13 · M14 · M15, 23/09/2026).
//
// Módulo PURO, sin alias `@/` y sin React, para que `node --test` lo mire. Acá se decide QUÉ dice cada
// fila —estado, tono, orden, texto derivado— y el componente sólo lo dibuja. NULL nunca es 0: cada
// ausencia vuelve como texto («sin cargar», «sin registrar», «sin compra»), nunca como cero ni guion.

import { plataMillones } from '../../../shared/utils/format.ts'
import { TIPO_RESTRICCION_LABEL, type Restriccion } from '../types/index.ts'

/** Los tonos del canon (`PASTILLA`/`C` de `canon/tokens.ts`). `tinta` = sin color semántico. */
export type Tono = 'pos' | 'curso' | 'warn' | 'neg' | 'tenue' | 'tinta'

/** «02/09» a partir de un ISO; `null` si no hay fecha. Se corta del texto: sin `Date` no hay huso. */
export const diaMes = (iso: string | null | undefined): string | null =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null

/** «02/09/2026». */
export const diaMesAnio = (iso: string | null | undefined): string | null =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null

/** «$ 168,70 M» — la cifra grande del 12/M15. Siempre en millones con dos decimales; `null` → '—'. */
export function cifraM(n: number | null | undefined): string {
  // UNA SOLA REGLA PARA LA PLATA DE OBRAS (25/09): `plataMillones` — M desde $ 100.000, pesos enteros abajo.
  return plataMillones(n)
}

// ═══ IMPEDIMENTOS (09 · M12) ═══

export type EstadoImpedimento = 'vencido' | 'abierto' | 'en_curso' | 'liberado'

export interface EstadoDibujado { clave: EstadoImpedimento; texto: string; tono: Tono }

/** El estado como lo lee la pantalla: DERIVADO de la fila y de hoy, nunca elegido. */
export function estadoImpedimento(r: Restriccion, hoyIso: string): EstadoDibujado {
  if (r.estado === 'liberada') return { clave: 'liberado', texto: 'Liberado', tono: 'pos' }
  if (r.estado === 'en_curso') return { clave: 'en_curso', texto: 'En curso', tono: 'curso' }
  if (r.fecha_compromiso && r.fecha_compromiso < hoyIso) return { clave: 'vencido', texto: 'Vencido', tono: 'neg' }
  return { clave: 'abierto', texto: 'Abierto', tono: 'warn' }
}

/** El rótulo del tipo. `clima` existe en la base (20260823T1000) y no en la lista de once: se rotula igual. */
export function rotuloTipo(tipo: string): string {
  return (TIPO_RESTRICCION_LABEL as Record<string, string>)[tipo] ?? (tipo === 'clima' ? 'Clima' : tipo)
}

/** Ordenados por fecha de necesidad, no por cuándo se cargaron (pie del 09). Sin necesidad, al final;
 *  a igual necesidad, el compromiso más viejo primero. */
export function ordenarPorNecesidad<T extends Pick<Restriccion, 'fecha_necesidad' | 'fecha_compromiso'>>(rs: T[]): T[] {
  return [...rs].sort((a, b) =>
    (a.fecha_necesidad ?? '9999').localeCompare(b.fecha_necesidad ?? '9999')
    || (a.fecha_compromiso ?? '9999').localeCompare(b.fecha_compromiso ?? '9999'))
}

/** Los filtros del 09 (escritorio) y del M12 (teléfono). Son lentes distintas sobre la misma lista. */
export type FiltroImpedimento = 'abiertos' | 'en_curso' | 'liberados' | 'vencidos' | 'todos'

export function filtrarImpedimentos(rs: Restriccion[], filtro: FiltroImpedimento, hoyIso: string): Restriccion[] {
  return rs.filter((r) => {
    const e = estadoImpedimento(r, hoyIso).clave
    if (filtro === 'abiertos') return e === 'abierto' || e === 'vencido'
    if (filtro === 'en_curso') return e === 'en_curso'
    if (filtro === 'liberados') return e === 'liberado'
    if (filtro === 'vencidos') return e === 'vencido'
    return true
  })
}

/** «Abiertos» en el teléfono son TODOS los no liberados (M12: 3 = 2 abiertos + 1 en curso). */
export function contarImpedimentos(rs: Restriccion[], hoyIso: string) {
  const estados = rs.map((r) => estadoImpedimento(r, hoyIso).clave)
  const n = (f: (e: EstadoImpedimento) => boolean) => estados.filter(f).length
  return {
    abiertos: n((e) => e === 'abierto' || e === 'vencido'),
    en_curso: n((e) => e === 'en_curso'),
    liberados: n((e) => e === 'liberado'),
    vencidos: n((e) => e === 'vencido'),
    noLiberados: n((e) => e !== 'liberado'),
  }
}

/** El texto de la derecha en el M12: «venció 04/09» en rojo, la fecha comprometida, o «sin cargar». */
export function compromisoTelefono(r: Restriccion, hoyIso: string): { texto: string; tono: Tono } {
  const e = estadoImpedimento(r, hoyIso)
  const f = diaMes(r.fecha_compromiso)
  if (!f) return { texto: 'sin cargar', tono: 'tenue' }
  if (e.clave === 'vencido') return { texto: `venció ${f}`, tono: 'neg' }
  return { texto: f, tono: e.tono }
}

/** «Qué bloquea» (M12): las actividades trabadas por un impedimento no liberado, una vez cada una. */
export function queBloquea(
  rs: Restriccion[], nombreDe: (actividadId: string) => string | null,
): { actividadId: string; nombre: string }[] {
  const vistas = new Set<string>()
  const salida: { actividadId: string; nombre: string }[] = []
  for (const r of rs) {
    if (r.estado === 'liberada' || !r.actividad_id || vistas.has(r.actividad_id)) continue
    vistas.add(r.actividad_id)
    salida.push({ actividadId: r.actividad_id, nombre: nombreDe(r.actividad_id) ?? 'actividad fuera de la lista' })
  }
  return salida
}

// ═══ PEDIDOS (10 · M13) ═══

export interface PedidoDibujable {
  fecha: string | null
  material: string | null
  cantidad: number | null
  unidad: string | null
  estado: string | null
  origen: string | null
  /** Quién lo pidió, ya resuelto por nombre. `null` = no consta (el Sheet no lo trae). */
  quien: string | null
  /** El nombre de la actividad para la que se pidió. `null` = sin actividad. */
  actividad: string | null
  nota: string | null
}

export type ClaseEstadoPedido = 'pendiente' | 'comprado' | 'entregado' | 'cancelado' | 'otro'

/** Qué es el estado que escribió el Sheet o la app. Texto libre en la base: se lee por su raíz. */
export function claseEstadoPedido(estado: string | null): ClaseEstadoPedido {
  const s = (estado ?? '').toLowerCase()
  if (s.includes('entreg')) return 'entregado'
  if (s.includes('cancel') || s.includes('anul')) return 'cancelado'
  if (s.includes('compr')) return 'comprado'
  if (s.includes('pend') || s.includes('pedid') || s === '') return 'pendiente'
  return 'otro'
}

/** Estado en escritorio (10): «Pendiente» warn · «Comprado» azul · «Entregado» verde. */
export function estadoPedidoEscritorio(estado: string | null): { texto: string; tono: Tono } {
  const c = claseEstadoPedido(estado)
  if (c === 'pendiente') return { texto: 'Pendiente', tono: 'warn' }
  if (c === 'comprado') return { texto: 'Comprado', tono: 'curso' }
  if (c === 'entregado') return { texto: 'Entregado', tono: 'pos' }
  if (c === 'cancelado') return { texto: 'Cancelado', tono: 'tenue' }
  return { texto: estado ?? 'sin estado', tono: 'tinta' }
}

/** Estado en el teléfono (M13), en minúscula: «pedido» · «entregado» · «cancelado». */
export function estadoPedidoTelefono(estado: string | null): { texto: string; tono: Tono } {
  const c = claseEstadoPedido(estado)
  if (c === 'pendiente') return { texto: 'pedido', tono: 'warn' }
  if (c === 'comprado') return { texto: 'comprado', tono: 'curso' }
  if (c === 'entregado') return { texto: 'entregado', tono: 'pos' }
  if (c === 'cancelado') return { texto: 'cancelado', tono: 'tenue' }
  return { texto: (estado ?? 'sin estado').toLowerCase(), tono: 'tinta' }
}

/**
 * «Se convirtió en» (10). NINGUNA tabla ata un pedido a una compra (`pedidos_materiales` no tiene
 * compra y `costos_obra` no tiene pedido): lo único afirmable es que no está vinculado. Pendiente →
 * «sin compra»; comprado o entregado → «sin vincular» (la compra existe en algún lado, nadie la ató).
 */
export function seConvirtioEn(estado: string | null): { texto: string; tono: Tono } {
  const c = claseEstadoPedido(estado)
  if (c === 'comprado' || c === 'entregado') return { texto: 'sin vincular', tono: 'tenue' }
  if (c === 'cancelado') return { texto: '—', tono: 'tenue' }
  return { texto: 'sin compra', tono: 'tenue' }
}

/** «48 m³» · «140 un» · «sin cantidad». La unidad sólo la trae la app; el Sheet no. */
export function cantidadPedido(cantidad: number | null, unidad: string | null): string {
  if (cantidad == null) return 'sin cantidad'
  const n = cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 })
  return unidad ? `${n} ${unidad}` : n
}

/** El pie del M13: de dónde nacen los pedidos, y que ninguno cuelga de una compra (hecho: no hay vínculo). */
export function pieDePedidos(pedidos: Pick<PedidoDibujable, 'origen'>[]): string {
  const origenes = new Set(pedidos.map((p) => (p.origen === 'app' ? 'app' : 'sheet')))
  const nacen = origenes.size === 0 ? 'Ninguno todavía'
    : origenes.size === 2 ? 'Nacen en AppSheet y en la app'
      : origenes.has('app') ? 'Nacen en la app' : 'Nacen en AppSheet'
  return `${nacen} · ninguno cuelga de una compra.`
}

// ═══ EQUIPOS (11 · M14) ═══

export interface ActivoDibujable {
  id: string
  nombre: string
  codigo: string
  estado: string
  /** Cuándo entró por última vez a esta obra (ISO). `null` = no hay movimiento registrado. */
  desde: string | null
  /** De dónde vino en ese último movimiento. `null` = sin origen registrado. */
  desdeLugar: string | null
  /** Quién lo trajo. `null` = sin registrar. */
  quien: string | null
}

/** «En obra» en verde para lo operativo; el resto es un problema real y va en warn con su borde. */
export function estadoActivoEnObra(estado: string): { texto: string; tono: Tono; problema: boolean } {
  if (estado === 'operativo') return { texto: 'En obra', tono: 'pos', problema: false }
  if (estado === 'requiere_mantenimiento') return { texto: 'Mantenimiento', tono: 'warn', problema: true }
  if (estado === 'fuera_servicio') return { texto: 'Fuera de servicio', tono: 'warn', problema: true }
  if (estado === 'reparacion_externa') return { texto: 'En servicio técnico', tono: 'warn', problema: true }
  return { texto: estado, tono: 'warn', problema: true }
}

/** La sublínea del M14: «desde ALMACEN · R. Quiroga» · «desde Nave Messinas» · «sin movimiento registrado». */
export function sublineaActivo(a: Pick<ActivoDibujable, 'desdeLugar' | 'quien' | 'desde'>): string {
  if (!a.desde) return 'sin movimiento registrado'
  const lugar = a.desdeLugar ? `desde ${a.desdeLugar}` : 'desde origen sin registrar'
  return a.quien ? `${lugar} · ${a.quien}` : lugar
}

export interface MovimientoDibujable {
  id: string
  activoId: string
  fechaHora: string
  activoNombre: string
  /** `entro` = destino es esta obra · `salio` = origen es esta obra. */
  sentido: 'entro' | 'salio'
  /** El otro lugar del viaje, rotulado. `null` = sin registrar. */
  otroLugar: string | null
  quien: string | null
}

/** «Vibrador de inmersión → TALLER» · «Cortadora de juntas ← Nave Messinas» (M14). */
export function tituloMovimiento(m: Pick<MovimientoDibujable, 'activoNombre' | 'sentido' | 'otroLugar'>): string {
  const lugar = m.otroLugar ?? 'sin registrar'
  return m.sentido === 'salio' ? `${m.activoNombre} → ${lugar}` : `${m.activoNombre} ← ${lugar}`
}

/** «salió · P. Contreras» · «entró · sin registrar». */
export function sublineaMovimiento(m: Pick<MovimientoDibujable, 'sentido' | 'quien'>): string {
  return `${m.sentido === 'salio' ? 'salió' : 'entró'} · ${m.quien ?? 'sin registrar'}`
}

// ═══ COMPRAS (12 · M15) ═══

export interface CifrasCompras {
  /** `obra_costo_real.costo_real`. `null` = nada imputado todavía. */
  total: number | null
  nComprobantes: number | null
  /** Lo que suman las filas listadas. */
  sumaDetalle: number
  /** `obra_costo_real.costo_mano_de_obra`. */
  manoDeObra: number | null
  /** Suma de `costos_obra.total` con `obra_id` nulo, en toda la empresa. `null` = no se pudo leer. */
  sinImputarEmpresa: number | null
  /** Suma de `obra_costo_real.costo_real` de todas las obras. `null` = no se pudo leer. */
  imputadoEmpresa: number | null
}

/** «el detalle cubre el total» (verde) o cuánto falta (warn). Tolerancia de $1 por redondeo. */
export function coberturaDelDetalle(c: Pick<CifrasCompras, 'total' | 'sumaDetalle'>): { texto: string; tono: Tono; cubre: boolean } {
  if (c.total == null) return { texto: 'sin total declarado', tono: 'tenue', cubre: false }
  const falta = c.total - c.sumaDetalle
  if (Math.abs(falta) <= 1) return { texto: 'el detalle cubre el total', tono: 'pos', cubre: true }
  return { texto: `faltan ${cifraM(falta)} en el detalle`, tono: 'warn', cubre: false }
}

/** La bajada de «Mano de obra adentro» (12). En cero es la frase literal del diseño. */
export function bajadaManoDeObra(manoDeObra: number | null): { texto: string; tono: Tono } {
  if (manoDeObra == null) return { texto: 'sin dato', tono: 'tenue' }
  if (manoDeObra === 0) return { texto: 'se imputa como Estructura, no a la obra', tono: 'tenue' }
  return { texto: 'horas imputadas a esta obra', tono: 'tenue' }
}

/** El pie del M15: «5 de 214 · mano de obra va a estructura». */
export function pieDeComprasTelefono(nListadas: number, c: Pick<CifrasCompras, 'nComprobantes' | 'manoDeObra'>): string {
  const cuenta = c.nComprobantes == null ? `${nListadas} listadas` : `${nListadas} de ${c.nComprobantes}`
  const mo = c.manoDeObra == null ? 'mano de obra sin dato'
    : c.manoDeObra === 0 ? 'mano de obra va a estructura' : `${cifraM(c.manoDeObra)} de mano de obra adentro`
  return `${cuenta} · ${mo}`
}
