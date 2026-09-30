// MATERIAL · STOCK Y REMITO — la lógica pura: cuánto falta llegar, qué se puede mover, cómo se numera.
//
// Módulo NEUTRAL (sin React ni Supabase) por la misma razón que `pedidos.ts`: lo usan el servidor, los
// componentes y los tests. NADA de esto es la regla: la regla vive en las funciones de Postgres
// (`recibir_pedido_material`, `mover_material`…), que rechazan igual lo que acá se rechaza. Esto sólo
// evita ir a la base con algo que ya se sabe inválido, y dibuja los números.

export interface Lugar {
  id: string
  /** «Taller» o el rótulo de la obra: sale de `ubicacion`, nunca de un texto libre. */
  rotulo: string
  tipo: 'taller' | 'obra'
  obra_id: string | null
}

export interface Existencia {
  material_id: string
  material: string
  unidad: string | null
  ubicacion_id: string
  cantidad: number
}

export interface RemitoItem {
  material: string
  unidad: string | null
  cantidad: number
}

export interface Remito {
  id: string
  numero: number
  emitido_en: string
  origen_id: string
  destino_id: string
  origen_rotulo: string
  destino_rotulo: string
  entrega_nombre: string | null
  recibe_nombre: string | null
  nota: string | null
  items: RemitoItem[]
}

/** «R-0007»: cuatro dígitos alcanzan para años y se ordena como texto. Pasado el 9999 crece solo. */
export const numeroRemito = (n: number): string => `R-${String(n).padStart(4, '0')}`

/**
 * Lo que falta llegar de un pedido. Puede haber llegado más de una vez (parcial): se resta lo ya
 * recibido y nunca da negativo. Un pedido sin cantidad no tiene «falta» calculable: `null`, y la
 * pantalla exige que quien recibe escriba cuánto llegó.
 */
export function faltaLlegar(pedida: number | null, recibida: number | null | undefined): number | null {
  if (pedida == null) return null
  return Math.max(0, redondear(pedida - (recibida ?? 0)))
}

/** Tres decimales, como la columna: 0,1 + 0,2 no puede dar 0,30000000000000004 en pantalla. */
export const redondear = (n: number): number => Math.round(n * 1000) / 1000

/** «12,5» y «12.5» son lo mismo; «1.250» sería mil doscientos cincuenta en es-AR pero no se adivina. */
export function leerCantidad(texto: string): number | null {
  const t = texto.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null
  const n = Number(t)
  return n > 0 ? n : null
}

export type Verificacion = { ok: true } | { ok: false; error: string }

/** Lo que se quiere sacar contra lo que hay. Un renglón en cero o de más frena todo el movimiento. */
export function verificarSalida(
  pedido: Array<{ material_id: string; cantidad: number }>,
  hay: Map<string, number>,
  rotulos: Map<string, string>,
): Verificacion {
  if (pedido.length === 0) return { ok: false, error: 'Elegí qué material se mueve' }
  for (const p of pedido) {
    const nombre = rotulos.get(p.material_id) ?? 'ese material'
    if (!(p.cantidad > 0)) return { ok: false, error: `Poné una cantidad de ${nombre}` }
    const disponible = hay.get(p.material_id) ?? 0
    if (p.cantidad > disponible) return { ok: false, error: `De ${nombre} hay ${disponible}, no se pueden mover ${p.cantidad}` }
  }
  return { ok: true }
}

/** El stock de un lugar, ordenado por nombre. Lo que no existe en el lugar (cantidad 0) no aparece. */
export const existenciasDe = (todas: Existencia[], lugarId: string): Existencia[] =>
  todas.filter((e) => e.ubicacion_id === lugarId && e.cantidad > 0).sort((a, b) => a.material.localeCompare(b.material, 'es'))

/** Los lugares con algo, primero el Taller y después las obras por nombre. */
export function lugaresConStock(lugares: Lugar[], todas: Existencia[]): Lugar[] {
  const con = new Set(todas.filter((e) => e.cantidad > 0).map((e) => e.ubicacion_id))
  return lugares
    .filter((l) => con.has(l.id))
    .sort((a, b) => (a.tipo === b.tipo ? a.rotulo.localeCompare(b.rotulo, 'es') : a.tipo === 'taller' ? -1 : 1))
}

export const textoStock = (cantidad: number, unidad: string | null): string =>
  `${cantidad.toLocaleString('es-AR', { maximumFractionDigits: 3 })}${unidad ? ` ${unidad}` : ''}`

/** A dónde se puede mandar: un lugar que ya existe (uuid) o una obra activa que todavía no tiene depósito. */
export interface Destino {
  /** uuid de `ubicacion`, o `obra:<id>` si la obra aún no tiene lugar: la acción lo resuelve con `ubicacion_de_obra`. */
  valor: string
  rotulo: string
}

export const PREFIJO_OBRA = 'obra:'

/**
 * Sólo el Taller y las obras (dueño, 29/09/2026). Una obra ACTIVA sin depósito igual es destino válido:
 * el depósito nace al primer envío. Una obra cerrada con stock sigue apareciendo (hay que poder sacarlo).
 */
export function destinosPosibles(lugares: Lugar[], obrasActivas: string[], rotulos: Map<string, string>): Destino[] {
  const conLugar = new Set(lugares.map((l) => l.obra_id).filter((o): o is string => o != null))
  const nuevos: Destino[] = obrasActivas.filter((o) => !conLugar.has(o)).map((o) => ({ valor: `${PREFIJO_OBRA}${o}`, rotulo: rotulos.get(o) ?? o }))
  const existentes: Destino[] = lugares.map((l) => ({ valor: l.id, rotulo: l.rotulo, tipo: l.tipo }))
    .sort((a, b) => (a.tipo === b.tipo ? a.rotulo.localeCompare(b.rotulo, 'es') : a.tipo === 'taller' ? -1 : 1))
    .map(({ valor, rotulo }) => ({ valor, rotulo }))
  return [...existentes, ...nuevos.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'es'))]
}

/**
 * Quién ve los botones de operar el stock. Es el MISMO conjunto que `es_administracion()` en la base
 * (dirección, administración, jefe de obra): si divergen, o se dibuja un botón que la base rechaza o se
 * esconde uno que serviría. El operario de campo ve el saldo de su obra y nada más.
 */
export const puedeOperarMaterial = (rol: string | null | undefined): boolean =>
  rol === 'direccion' || rol === 'administracion' || rol === 'jefe_obra'

/**
 * Quién puede ANULAR una llegada. Es más estrecho que operar: `anular_recepcion_material` exige dirección o
 * administración, porque deshacer un ingreso ya contado es una corrección de libro, no una operación diaria
 * del jefe de obra. Mismo criterio que la base, por la misma razón que arriba.
 */
export const puedeAnularMaterial = (rol: string | null | undefined): boolean =>
  rol === 'direccion' || rol === 'administracion'

// Las solapas calcan Herramientas (dueño, 29/09/2026: «el inventario como en herramientas… no solo como
// gestión de pedidos sino también de control de stock»): Resumen → Inventario → Ubicaciones →
// Movimientos, y lo propio de Material (Pedidos, Remitos) al final. Una sola fila: es el nivel 2.
export type SolapaMaterial = 'resumen' | 'inventario' | 'ubicaciones' | 'movimientos' | 'pedidos' | 'remitos'
export const SOLAPAS_MATERIAL: Array<{ id: SolapaMaterial; label: string }> = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'ubicaciones', label: 'Ubicaciones' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'remitos', label: 'Remitos' },
]

/**
 * La solapa de la URL. Sin `ver` es el Resumen, salvo que la URL traiga un filtro de pedidos (`obra`,
 * `estado`, `pedir`): un enlace viejo «Material pedido de tal obra» sigue cayendo en Pedidos. `stock`
 * (la solapa del 29/09) es hoy Ubicaciones: el saldo por lugar.
 */
export function solapaDeUrl(v: string | null | undefined, conFiltroDePedidos = false): SolapaMaterial {
  if (v === 'stock') return 'ubicaciones'
  const hit = SOLAPAS_MATERIAL.find((s) => s.id === v)
  if (hit) return hit.id
  return conFiltroDePedidos ? 'pedidos' : 'resumen'
}
