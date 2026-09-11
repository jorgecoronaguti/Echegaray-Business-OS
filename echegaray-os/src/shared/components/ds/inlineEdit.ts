// QUÉ NÚMERO DIBUJA UNA CELDA QUE YA SE GUARDÓ PERO EL SERVIDOR TODAVÍA NO DEVOLVIÓ.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR (10/09/2026) ═══
//
// Dueño, sobre Personal › Liquidación: «todo el módulo está inutilizable y no se puede editar
// nada». Medido en el navegador con su misma sesión: la escritura SÍ ocurría —`registros_hh` pasaba
// de 9 a 7 y `registro_hh_correccion` guardaba el rastro— pero la celda volvía a dibujar 9 apenas
// se soltaba el campo, y recién mostraba 7 entre diez y veinte segundos después, cuando llegaba el
// re-render que dispara `revalidatePath`. Quien edita ve su número desaparecer delante suyo: la
// conclusión razonable es que no se puede editar.
//
// La causa no era la escritura: era que la celda dibujaba SIEMPRE la prop del servidor, y esa prop
// está vieja durante todo el viaje de vuelta. Lo confirmado por la acción tiene que quedar a la
// vista hasta que el servidor lo repita.
//
// ═══ POR QUÉ ES UNA FUNCIÓN PURA Y NO TRES `useState` SUELTOS ═══
//
// Es una regla —«lo guardado le gana a la prop vieja, y la prop nueva le gana a lo guardado»— y una
// regla que vive dentro de un componente sólo se puede probar abriendo un navegador. Acá se prueba
// con `node --test` en milisegundos, y el componente queda siendo lo que tiene que ser: cableado.

/**
 * Lo que la celda sabe en un momento dado.
 *
 * `pendiente` es lo ÚLTIMO QUE LA ACCIÓN CONFIRMÓ y el servidor todavía no repitió. `null` no es
 * cadena vacía: `''` es «se vació la celda a propósito y la escritura ya volvió que sí».
 */
export interface EstadoInline {
  /** El último valor que llegó por props. Es la verdad del servidor. */
  delServidor: string
  /** Lo guardado y sin confirmar, o `null` si no hay nada en vuelo. */
  pendiente: string | null
}

/** Lo que se dibuja: lo guardado le gana a la prop vieja. Sin pendiente, manda el servidor. */
export function valorVigente(e: EstadoInline): string {
  return e.pendiente ?? e.delServidor
}

/**
 * LLEGÓ UNA PROP NUEVA DEL SERVIDOR — y el servidor siempre gana.
 *
 * Gana aun cuando NO coincide con lo pendiente: si otra persona corrigió la misma celda mientras
 * ésta viajaba, lo que hay que ver es lo que quedó guardado, no lo que uno mandó. Sostener el
 * pendiente ahí escondería el pisotón justo donde importa.
 */
export function alLlegarDelServidor(e: EstadoInline, nuevo: string): EstadoInline {
  if (nuevo === e.delServidor) return e
  return { delServidor: nuevo, pendiente: null }
}

/** La acción confirmó `v`. Queda a la vista hasta que el servidor lo repita. */
export function alConfirmarGuardado(e: EstadoInline, v: string): EstadoInline {
  return { delServidor: e.delServidor, pendiente: v }
}

/**
 * ¿ESTA CONFIRMACIÓN ESCRIBE ALGO?
 *
 * Se compara contra lo VIGENTE, no contra la prop: con la prop vieja, salir de una celda recién
 * corregida volvería a mandar el mismo valor y ensuciaría el historial con una corrección que no
 * cambió nada. Y volver al valor original mientras hay un pendiente SÍ es un cambio.
 */
export function hayQueGuardar(e: EstadoInline, v: string): boolean {
  return v !== valorVigente(e)
}
