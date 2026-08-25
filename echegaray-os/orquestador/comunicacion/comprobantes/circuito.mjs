// EL CIRCUITO DE UN COMPROBANTE — uno solo, para las dos puertas.
//
// ═══ POR QUÉ EXISTE ESTE ARCHIVO (25/08) ═══
//
// El pedido del dueño, textual: *«la carga de comprobantes se debe hacer de la misma manera que se
// hace vía bot del OS: cargo archivo multimedia al canal carga de comprobantes y la carga se debe
// hacer en app ecsas y en sheet flujo de fondos, todo respaldado en BD»*.
//
// «De la misma manera» no admite dos implementaciones. Todo el cableado del especialista de
// Mattermost —el lector de visión, las listas con el mapa de CUIT, ARCA, la pestaña Compras viva, el
// extracto bancario, los perfiles de imputación aprendidos y el escritor que corre el cargador—
// vivía adentro de una función privada de `especialistas/comprobantes.mjs`. Copiarlo para la web
// habría creado dos circuitos que empiezan idénticos y se separan a la primera corrección; y el que
// se quedaría atrás es el que escribe plata en el Sheet de la empresa.
//
// Así que el cableado se mudó acá y el especialista lo llama. Un solo camino, dos puertas:
//
//   · MATTERMOST: `bajar` baja el adjunto del post, `guarda` pregunta por canal oficial + permiso.
//   · WEB:        `bajar` baja el objeto de Supabase Storage, `guarda` ya la contestó la sesión de
//                 Next (rol de Administración) y `cola-web.mjs` la vuelve a afirmar acá.
//
// LO QUE ESTE ARCHIVO NO HACE: no decide, no lee, no escribe. Arma dependencias y llama a
// `procesarPost`. Todo lo que decide algo sigue donde estaba y sigue teniendo su test.

import { procesarPost } from './flujo.mjs'
import { escribirFajo } from './escritura.mjs'
import { leerAdjunto } from '../../lib/comprobantes/vision.mjs'
import { listasDeCompras, proveedoresPorCuit } from '../../lib/comprobantes/listas.mjs'
import { indiceDeCompras } from '../../lib/comprobantes/compras-vivas.mjs'
import { perfilesDeImputacionDesdeDB } from '../../lib/imputacion-aprendida.mjs'
import * as repo from './repositorio.mjs'

/**
 * Últimos débitos del extracto, para cruzar lo que declara «pagada por transferencia».
 * La ventana del cruce es de ±5 días por comprobante: 25 días de débitos la cubren de sobra.
 */
function bancoDe(port) {
  return () => port.query(
    `select fecha, concepto, importe, referencia from banco_movimientos
      where importe < 0 and fecha >= current_date - 25 order by fecha desc limit 800`,
  ).then((r) => r.rows)
}

/**
 * Las listas de Compras CON el mapa de CUIT de las otras dos fuentes.
 *
 * Sin `nombresPorCuit`, «DUBOS UGARTE PEDRO LUIS RAUL» se declara proveedor nuevo y la carga frena
 * aunque DUPEC esté en el desplegable con ese mismo CUIT. Si la base no contesta, viene vacío y todo
 * se comporta como antes: la carga nunca se cae por no poder enriquecer un nombre.
 */
function listasDe(google, port) {
  return async () => {
    const [l, porCuit, nombresPorCuit] = await Promise.all([
      listasDeCompras(google),
      proveedoresPorCuit(google),
      repo.nombresPorCuit(port).catch(() => new Map()),
    ])
    return { ...l, porCuit, nombresPorCuit }
  }
}

/**
 * Corre el circuito completo para una tanda de archivos.
 *
 * @param {object} dep
 * @param {{query:Function}} dep.port      Postgres.
 * @param {object} dep.google              cliente de Google (listas, pestaña viva, auditor de cierre).
 * @param {object} [dep.log]
 * @param {string} [dep.url]               URL de callback de los botones (sólo Mattermost).
 * @param {object} [dep.mattermost]        sólo Mattermost.
 * @param {Function} [dep.bajar]           `(fileId) => {ok, nombre, mediaType, data}`. Default: Mattermost.
 * @param {Function} [dep.guarda]          la puerta. Default: canal oficial + permiso.
 * @param {Function} [dep.escribir]        el escritor. Default: `escribirFajo` (corre el cargador).
 * @param {object} mensaje                 `{fileIds, texto, actor, channelId, plataforma, postId, rootPostId, ahora}`.
 * @returns {Promise<{texto:string, estado:string, fajoId?:string, parte:object}>}
 */
export async function procesarComprobantes(dep, mensaje = {}) {
  const { port, google, log, url, mattermost, bajar, guarda } = dep
  const escribir = dep.escribir ?? ((f) => escribirFajo({ port, log, google }, f))
  return await procesarPost({
    port,
    mattermost,
    bajar,
    guarda,
    // EL VOCABULARIO VIAJA A LA LECTURA: el modelo mira la foto con las listas de las tres columnas
    // delante, que es la misma información que tiene una persona al decidir a qué obra va el gasto.
    leer: (adjunto, vocabulario) => leerAdjunto(adjunto, { vocabulario }),
    listas: listasDe(google, port),
    // ARCA es la fuente de verdad del número de comprobante: contra él se corrige el dígito que la
    // visión leyó de más, y eso pasa ANTES de deduplicar (la clave se arma con el número).
    arcaDe: (c) => repo.candidatasArca(port, c ?? {}),
    // La pestaña VIVA es la única que sabe lo que entró por Claude Code o a mano.
    comprasDe: () => indiceDeCompras(google),
    bancoDe: bancoDe(port),
    perfilesDesdeDB: () => perfilesDeImputacionDesdeDB({ query: (...a) => port.query(...a) }),
    // EL ESCRITOR ES EL MISMO de siempre: corre `scripts/cargar-comprobantes-compras.mjs` como
    // proceso hijo, con su freno de mano, su guarda de pestaña y su reserva de claves. La web NO
    // abre un segundo camino de escritura al Sheet — abre una segunda forma de llegar a éste.
    escribir,
    url,
    log,
  }, mensaje)
}
