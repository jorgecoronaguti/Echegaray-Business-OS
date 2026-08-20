// EL LENGUAJE DE ESTADOS DE OPERACIÓN — punto + palabra, nunca una pastilla.
//
// Traduce los estados que traen las fuentes externas (AppSheet/Sheet espejado en Postgres) a los
// seis tonos del `Estado` del design system. Vive en un módulo PURO —sin React, sin Supabase— por
// dos razones: es lo único de estas pantallas que se puede probar sin levantar nada, y es donde se
// cuelan los dos defectos que ya se pagaron.
//
//   1. PINTAR DE COLOR LO QUE NO ES UN PROBLEMA. Un pedido «pendiente» no es un problema: es un
//      pedido que todavía no salió. Cuando esa columna se pintaba de rojo, la lista entera parecía
//      un incendio y el rojo dejaba de significar algo el día que sí hubiera uno.
//   2. INVENTAR EL ESTADO QUE FALTA. Una fila sin estado NO es «pendiente»: es una fila que no dice
//      en qué anda. Se escribe «sin estado» en `faint`, que es la verdad.
//
// El tono `curso` es el grafito del sistema: presente, sin color. Es el que llevan «en uso» y
// «pedido», que son trabajo en marcha y no un semáforo.

/** Los tonos del `Estado` del DS. Se declara acá para que este módulo no importe componentes. */
export type Tono = 'pos' | 'neg' | 'warn' | 'curso' | 'pendiente' | 'nulo'

export interface Lectura {
  tono: Tono
  label: string
  /** La clave canónica, para que un test verifique el estado sin leer un color. */
  clave: string
}

const SIN_ESTADO: Lectura = { tono: 'nulo', label: 'sin estado', clave: 'sin_estado' }

// ─── PEDIDOS DE MATERIALES ──────────────────────────────────────────────────────────────────────
//
// La fuente escribe el estado en MAYÚSCULAS y a veces conjugado («ENTREGADO», «entregada»). Se
// compara por raíz porque el dato viene de un desplegable de AppSheet que ya cambió de grafía una
// vez, y un `switch` exacto lo dejaría en «sin estado» sin que nadie se entere.
const PEDIDO: { raiz: string; lectura: Lectura }[] = [
  { raiz: 'entreg', lectura: { tono: 'pos', label: 'Entregado', clave: 'entregado' } },
  { raiz: 'pedid', lectura: { tono: 'curso', label: 'Pedido', clave: 'pedido' } },
  { raiz: 'camino', lectura: { tono: 'curso', label: 'En camino', clave: 'en_camino' } },
  { raiz: 'pendien', lectura: { tono: 'pendiente', label: 'Pendiente', clave: 'pendiente' } },
  { raiz: 'cancel', lectura: { tono: 'neg', label: 'Cancelado', clave: 'cancelado' } },
]

export function lecturaPedido(estado: string | null | undefined): Lectura {
  const s = (estado ?? '').trim().toLowerCase()
  if (!s) return SIN_ESTADO
  const hit = PEDIDO.find((p) => s.includes(p.raiz))
  // Un estado que la fuente trae y acá no está declarado se MUESTRA tal cual, en grafito: taparlo
  // con «sin estado» sería borrar un dato real que alguien cargó.
  return hit?.lectura ?? { tono: 'curso', label: estado as string, clave: s }
}

// ─── HERRAMIENTAS ───────────────────────────────────────────────────────────────────────────────
//
// Los cinco estados canónicos del servicio (`herramientasService.ESTADOS`). «En uso» es NEUTRO: una
// herramienta trabajando no es un estado positivo ni un problema, es lo normal.
const HERRAMIENTA: Record<string, Lectura> = {
  disponible: { tono: 'pos', label: 'Disponible', clave: 'disponible' },
  en_uso: { tono: 'curso', label: 'En uso', clave: 'en_uso' },
  en_reparacion: { tono: 'warn', label: 'En reparación', clave: 'en_reparacion' },
  fuera_servicio: { tono: 'neg', label: 'Fuera de servicio', clave: 'fuera_servicio' },
  perdida: { tono: 'neg', label: 'Perdida', clave: 'perdida' },
}

export function lecturaHerramienta(estado: string | null | undefined): Lectura {
  const s = (estado ?? '').trim().toLowerCase()
  if (!s) return SIN_ESTADO
  return HERRAMIENTA[s] ?? SIN_ESTADO
}

/** Las cinco, en el orden en que se ofrecen y se filtran. */
export const ESTADOS_HERRAMIENTA: Lectura[] = Object.values(HERRAMIENTA)

/** Necesitan que alguien haga algo: no están disponibles ni trabajando. */
export function necesitanAtencion(estados: (string | null)[]): number {
  return estados.filter((e) => ['en_reparacion', 'fuera_servicio', 'perdida'].includes((e ?? '').toLowerCase())).length
}
