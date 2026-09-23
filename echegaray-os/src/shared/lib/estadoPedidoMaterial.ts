// EL ESTADO DE UN PEDIDO DE MATERIAL — una sola lectura para las dos caras y las dos fuentes.
//
// Vive en `shared` porque lo leen tres lugares que no pueden importarse entre sí: la solapa Pedidos
// de la obra (`features/integraciones`), el módulo Material (`features/materiales`) y la señal de
// `/campo`. Módulo PURO: sin React, sin Supabase.
//
// ═══ DOS FUENTES, UN VOCABULARIO ═══
//
// El Sheet del AppSheet escribe el estado en MAYÚSCULAS y a veces conjugado («ENTREGADO»,
// «entregada»); la app escribe los cuatro pasos del circuito: PEDIDO → VISTO → COMPRADO → ENTREGADO.
// Se compara por raíz porque el desplegable del AppSheet ya cambió de grafía una vez, y un `switch`
// exacto lo dejaría en «sin estado» sin que nadie se entere.
//
// ═══ EL COLOR DICE SÓLO LO QUE ES ═══
//
//   · «Entregado» es lo único POSITIVO: el material está en la obra.
//   · «Pedido» —nadie lo miró todavía— va en `pendiente` (gris): es lo que espera a Administración.
//   · «Visto» y «Comprado» son trabajo en marcha: `curso`, grafito, sin semáforo.
//   · Una fila SIN estado no es «pendiente»: es una fila que no dice en qué anda. `nulo`, en faint.

export type TonoPedido = 'pos' | 'neg' | 'warn' | 'curso' | 'pendiente' | 'nulo'

export interface LecturaPedido {
  tono: TonoPedido
  label: string
  /** La clave canónica, para que un test verifique el estado sin leer un color. */
  clave: string
}

const SIN_ESTADO: LecturaPedido = { tono: 'nulo', label: 'sin estado', clave: 'sin_estado' }

/** Los pasos que la app puede poner, en el orden del circuito. `valor` es lo que se guarda. */
export const PASOS_PEDIDO = [
  { valor: 'PEDIDO', clave: 'pedido', label: 'Pedido', tono: 'pendiente' },
  { valor: 'VISTO', clave: 'visto', label: 'Visto', tono: 'curso' },
  { valor: 'COMPRADO', clave: 'comprado', label: 'Comprado', tono: 'curso' },
  { valor: 'ENTREGADO', clave: 'entregado', label: 'Entregado', tono: 'pos' },
] as const satisfies readonly (LecturaPedido & { valor: string })[]

export type PasoPedido = (typeof PASOS_PEDIDO)[number]['valor']

export const esPasoPedido = (v: unknown): v is PasoPedido => PASOS_PEDIDO.some((p) => p.valor === v)

// Por raíz, del más específico al más general: «entreg» antes que «pedid» porque un Sheet viejo
// escribió «PEDIDO ENTREGADO» y eso es entregado.
const RAICES: { raiz: string; lectura: LecturaPedido }[] = [
  { raiz: 'entreg', lectura: PASOS_PEDIDO[3] },
  { raiz: 'compr', lectura: PASOS_PEDIDO[2] },
  { raiz: 'visto', lectura: PASOS_PEDIDO[1] },
  { raiz: 'camino', lectura: { tono: 'curso', label: 'En camino', clave: 'en_camino' } },
  { raiz: 'pedid', lectura: { tono: 'curso', label: 'Pedido', clave: 'pedido' } },
  { raiz: 'pendien', lectura: { tono: 'pendiente', label: 'Pendiente', clave: 'pendiente' } },
  { raiz: 'cancel', lectura: { tono: 'neg', label: 'Cancelado', clave: 'cancelado' } },
]

export function lecturaPedido(estado: string | null | undefined): LecturaPedido {
  const s = (estado ?? '').trim().toLowerCase()
  if (!s) return SIN_ESTADO
  const hit = RAICES.find((p) => s.includes(p.raiz))
  // Un estado que la fuente trae y acá no está declarado se MUESTRA tal cual, en grafito: taparlo
  // con «sin estado» sería borrar un dato real que alguien cargó.
  return hit?.lectura ?? { tono: 'curso', label: estado as string, clave: s }
}

/** Lo que todavía no llegó a la obra. Es la cuenta de la señal de `/campo` y del filtro por defecto. */
export const sinEntregar = (estado: string | null | undefined) => {
  const c = lecturaPedido(estado).clave
  return c !== 'entregado' && c !== 'cancelado'
}
