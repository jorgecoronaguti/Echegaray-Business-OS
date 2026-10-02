// LA NOTA DE UNA ANOTACIÓN DEL PUNTO AMARILLO (dueño, 02/10/2026): de qué renglón cuelga y cuándo se muestra.
//
// ═══ LA CLAVE ═══
//
// Un renglón del cuadro nace de UNA fila de `liquidacion_cambio` (inmutable: la escribe el trigger y nadie la corrige)
// y, en una suma de pagos, de la posición del pago dentro de lo que ESA fila agregó. (cambio_id, posicion) no se
// mueve cuando se agrega otro pago —es otra fila— ni cuando se reescribe la cuenta en otro orden —también otra fila—.
// Se descartó colgarla de la posición dentro de la cuenta COMPLETA de la celda: el tercer pago de hoy puede ser el
// cuarto mañana, y la nota quedaría en el pago de al lado sin que nadie lo note.
//
// ═══ LA GUARDA ═══
//
// La posición la calcula la app al partir la cuenta. Si esa lectura cambiara, la posición podría señalar otro pago.
// La nota guarda el importe al que se escribió y acá sólo se pega si coincide: si no, se devuelve «descolgada» para
// decirla como tal. Perderla a la vista es preferible a mostrarla en el pago equivocado.
//
// PURO y con rutas relativas con extensión: lo prueba `node --test` sin base ni alias.

import { z } from 'zod'

export const LARGO_MAXIMO_DE_NOTA = 200
const CENTAVO = 0.01

/** De qué anotación es la nota. `importe` null = el renglón no tiene importe (una baja). */
export interface AnclaDeNota { cambioId: number; posicion: number; importe: number | null }

/** Una fila de `liquidacion_cambio_nota` tal como sale de la base (`numeric` puede llegar como texto). */
export interface NotaCruda {
  cambio_id: number | string
  posicion: number
  importe: number | string | null
  texto: string
  escrita_por: string | null
  escrita_en: string
}

export const claveDeNota = (cambioId: number | string, posicion: number): string => `${cambioId}:${posicion}`

export function indiceDeNotas(filas: readonly NotaCruda[]): Map<string, NotaCruda> {
  return new Map(filas.map((f) => [claveDeNota(f.cambio_id, f.posicion), f]))
}

const mismoImporte = (a: number | null, b: number | string | null): boolean => {
  if (a == null || b == null) return a == null && b == null
  return Math.abs(a - Number(b)) <= CENTAVO
}

export type NotaDelRenglon =
  | { estado: 'ninguna' }
  | { estado: 'propia'; nota: NotaCruda }
  /** Hay nota en esta clave, pero escrita para otro importe: no es de este pago. */
  | { estado: 'descolgada'; nota: NotaCruda }

export function notaDelRenglon(ancla: AnclaDeNota, notas: ReadonlyMap<string, NotaCruda>): NotaDelRenglon {
  const nota = notas.get(claveDeNota(ancla.cambioId, ancla.posicion))
  if (!nota) return { estado: 'ninguna' }
  return mismoImporte(ancla.importe, nota.importe) ? { estado: 'propia', nota } : { estado: 'descolgada', nota }
}

/** Una línea de texto plano: saltos y espacios repetidos son un espacio. Vacío = `null` = borrar la nota. */
export function textoDeNota(entrada: string): string | null {
  const t = entrada.replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

/** Lo que manda el cuadro al guardar. Es entrada de usuario: se valida en el servidor, no se confía en el campo. */
export const pedidoDeNota = z.object({
  cambioId: z.number().int().positive(),
  posicion: z.number().int().min(0).max(99),
  importe: z.number().finite().nullable(),
  texto: z.string().max(2000).transform(textoDeNota)
    .refine((t) => t === null || t.length <= LARGO_MAXIMO_DE_NOTA, `La nota pasa de ${LARGO_MAXIMO_DE_NOTA} caracteres.`),
})

export const MENSAJE_SIN_MIGRACION = 'Las notas todavía no están habilitadas en la base. No se guardó.'

/** PGRST202 = PostgREST no conoce la función; 42883 = no existe; 42P01/PGRST205 = la tabla no existe. */
export const faltaLaMigracion = (e: { code?: string; message?: string }): boolean =>
  ['PGRST202', '42883', '42P01', 'PGRST205'].includes(e.code ?? '')
  || /liquidacion_(nota_guardar|cambio_nota)/.test(e.message ?? '') && /does not exist|schema cache|could not find/i.test(e.message ?? '')
