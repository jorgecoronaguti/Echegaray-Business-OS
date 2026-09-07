// LOS PAPELES DE UN PROVEEDOR — la regla de qué dice la pantalla, separada de la lectura.
//
// La consulta vive en `proveedoresService.getPapelesDelProveedor`. Acá está lo único que hay que
// decidir, y es lo que se puede probar sin base y sin sesión: CUÁL DE LAS CUATRO COSAS SE DICE
// cuando no hay ningún papel para mostrar.
//
// ═══ CUATRO AUSENCIAS QUE NO SON LA MISMA ═══
//
//   sin-compras   ningún texto de Compras apunta a esta ficha. No hay de dónde colgar un papel, y
//                 el trabajo pendiente es resolver el nombre, no buscar el archivo.
//   sin-archivo   se le compró, y ninguna de esas compras tiene archivo guardado. El trabajo es
//                 conseguir el papel.
//   no-se-sabe    los papeles se leyeron y no hay ninguno, pero la resolución de nombres NO se pudo
//                 leer: no se puede afirmar cuál de las dos de arriba es. Decir «sin archivo» acá
//                 sería inventar que tiene compras.
//   sin-leer      la lectura falló. NO es un cero ni un guión: es no saber.
//
// La regla que las gobierna: una lista vacía es un HECHO («no hay ningún papel») y un error de
// lectura NO lo es. Confundirlos publica «este proveedor no tiene comprobantes guardados» cuando la
// verdad es «no pude mirar», que es la forma más silenciosa de perder un respaldo.

import type { ComprasDelProveedor } from './proveedoresService.ts'
import type { PapelesLeidos, PapelProveedor, ServiceResult } from '../types'

export type PorQueNinguno = 'sin-compras' | 'sin-archivo' | 'no-se-sabe'

export type EstadoPapeles =
  | { clase: 'papeles'; papeles: PapelProveedor[]; mostrados: number; total: number }
  | { clase: 'ninguno'; porque: PorQueNinguno }
  | { clase: 'sin-leer'; motivo: string }

/**
 * QUÉ DIBUJA EL BLOQUE, a partir de las dos lecturas que la pantalla ya hizo.
 *
 * `papeles === null` significa que no se intentó (el panel del alta, sin proveedor todavía): se
 * trata igual que un error, porque en los dos casos la pantalla no puede afirmar nada.
 *
 * El orden de las comprobaciones importa. El error va PRIMERO: si la lectura de papeles falló, da
 * lo mismo lo que digan las compras — cualquier frase sobre «no tiene papeles» sería una afirmación
 * que esta pantalla no puede sostener.
 */
export function estadoDePapeles(
  papeles: ServiceResult<PapelesLeidos> | null,
  compras: ComprasDelProveedor | null,
): EstadoPapeles {
  if (papeles === null) return { clase: 'sin-leer', motivo: 'No se pidió la lectura.' }
  if (papeles.error !== null) return { clase: 'sin-leer', motivo: papeles.error }

  const { papeles: filas, total } = papeles.data
  if (filas.length > 0) {
    // `total` puede venir por debajo de lo listado si el conteo no llegó: se publica el mayor de
    // los dos. Decir «12 de 3» sería un número imposible en pantalla.
    return { clase: 'papeles', papeles: filas, mostrados: filas.length, total: Math.max(total, filas.length) }
  }

  // NO HAY PAPELES — y ahora hay que decir por qué, sin adivinar.
  if (compras === null) return { clase: 'ninguno', porque: 'no-se-sabe' }
  if (compras.nombres.length === 0) return { clase: 'ninguno', porque: 'sin-compras' }
  return { clase: 'ninguno', porque: 'sin-archivo' }
}

/**
 * CÓMO SE SUPO QUE ESTE PAPEL ES DE ESTA COMPRA, en una palabra.
 *
 * Las tres maneras no valen lo mismo y la pantalla tiene que poder mostrarlo: `registro` es un
 * HECHO (el bot cargó el archivo y dejó su rastro), `match_numero` un CÁLCULO que puede estar mal, y
 * `match_manual` la decisión de una persona, que le gana a las dos. Mismo criterio que la ficha ya
 * usa para los nombres vinculados («exacto» / «resuelto»).
 *
 * `sin_vincular` no puede llegar acá —la vista sólo publica papeles con compra— pero se contempla:
 * un `default` que devolviera «registro» convertiría un hueco futuro en un hecho falso.
 */
export function comoSeVinculo(via: string): string {
  if (via === 'registro') return 'del bot'
  if (via === 'match_numero') return 'por número'
  if (via === 'match_manual') return 'a mano'
  return 'sin origen'
}

/** `image/jpeg` → `foto`, `application/pdf` → `PDF`. Lo que cambia es si se puede mirar o se abre. */
export function claseDeArchivo(mediaType: string | null | undefined): 'foto' | 'PDF' | 'archivo' {
  if (!mediaType) return 'archivo'
  if (mediaType.startsWith('image/')) return 'foto'
  if (mediaType === 'application/pdf') return 'PDF'
  return 'archivo'
}
