// HABLARLE A MATTERMOST. Los dos únicos pedidos que el ruteador le hace al servidor de
// Mattermost: abrir un diálogo y reescribir el post. Viven aparte porque son la FRONTERA —
// lo único de este directorio que sale a la red— y porque el ruteador ya era el archivo más
// largo del módulo.
//
// NINGUNO DE LOS DOS TUMBA LA ACCIÓN: si fallan, se avisa por log y el post queda como
// estaba. Una carga no se pierde porque no se pudo redibujar un mensaje.

import { sanitizarError } from '../../lib/asistencia-auditoria.mjs'
import { validarDialogo } from './contrato-mattermost.mjs'

/** Abre un diálogo. Un fallo acá NO tumba la acción: se avisa y el post queda como estaba. */
export async function abrirDialogo(d, dialogo) {
  if (!dialogo.trigger_id || typeof d.mattermost?.abrirDialogo !== 'function') return false
  // LA RED, CONECTADA. `contrato-mattermost.mjs` existe justamente para atajar un diálogo
  // que Mattermost va a rechazar (un desplegable sin opciones, un `default` que no está
  // entre ellas), y hasta ahora sólo corría en los tests. Un diálogo inválido no da error
  // útil del otro lado: no abre y listo. Acá, al menos, queda dicho por qué en el log.
  const v = validarDialogo(dialogo)
  if (!v.ok) {
    d.log?.error?.('asistencia-mm: diálogo inválido, no se manda', { fallas: v.fallas })
    return false
  }
  try {
    const r = await d.mattermost.abrirDialogo(dialogo)
    return r?.ok !== false
  } catch (e) {
    d.log?.error?.('asistencia-mm: no se pudo abrir el diálogo', { error: sanitizarError(e) })
    return false
  }
}

/** La respuesta de un diálogo no puede re-renderizar el post: eso se hace por la API. */
export async function actualizarPost(d, postId, { message, props }) {
  if (!postId || typeof d.mattermost?.actualizarPost !== 'function') {
    d.log?.warn?.('asistencia-mm: sin post que actualizar tras el diálogo')
    return false
  }
  try {
    // `id`, NO `postId`: así se llama el parámetro del cliente. Con el nombre equivocado
    // salía `PUT /posts/undefined → 400` y el post NUNCA se refrescaba después de un
    // diálogo — el jefe guardaba la excepción, el sistema decía OK y la lista seguía vieja.
    // El error quedaba en el log y la respuesta igual era 200. Verificado en producción.
    const r = await d.mattermost.actualizarPost({ id: postId, message, props })
    return r?.ok !== false
  } catch (e) {
    d.log?.error?.('asistencia-mm: no se pudo actualizar el post', { error: sanitizarError(e) })
    return false
  }
}
