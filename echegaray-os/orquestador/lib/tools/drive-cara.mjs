// LA CARA FINA: cómo una tool de modelo habla con la capacidad nativa de Drive.
//
// Antes, la lógica de cada operación de Drive vivía DENTRO del `run()` de su tool. El efecto
// práctico era que la única manera de mover un archivo desde la superficie conversacional era que
// un modelo pidiera la tool por su `schema.name`: sin modelo, no había Drive. Ahora la lógica está
// en `lib/drive/` y esto es lo único que queda del lado de la tool — traducir el input del modelo
// a la llamada tipada, y traducir el error con código a la forma `{error}` que el tool-executor
// espera (no lanza: un fallo de tool no puede romper el razonamiento).
//
// Este archivo NO decide nada. Si algún día tiene un `if` de negocio, está en el lugar equivocado.

import { DriveError, clasificar } from '../drive/errores.mjs'

/**
 * Envuelve el cuerpo de un `run()` para que cualquier DriveError salga como `{error, codigo}`.
 * El código viaja además del texto: es lo que permite que quien llama decida sin parsear la frase.
 */
export function caraFina(fn) {
  return async (input, meta) => {
    try {
      return await fn(input ?? {}, meta)
    } catch (e) {
      const d = e instanceof DriveError ? e : clasificar(e)
      return { error: d.message, codigo: d.codigo, detalle: d.detalle, reintentable: d.reintentable }
    }
  }
}

/** La forma en que las tools venían devolviendo un archivo. Se conserva tal cual para no
 *  romperles la respuesta a los cuatro entrypoints que ya consumen estas tools. */
export function comoTool(ref) {
  return { id: ref.file_id, name: ref.name, link: ref.web_view_link, tipo: ref.tipo }
}
