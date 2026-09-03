// LAS CAPAS POR CELDA DEL PORTÓN — contenido, estructura y diseño.
//
// ═══ POR QUÉ (03/09) ═══
//
// El dueño: *"el sheet flujo de fondos es un documento vivo autónomo y automático; lo único que
// requiero siempre es que mis ediciones en el archivo sean las que manden y siempre se respeten"*, y
// después precisó qué es una edición: *"todo lo que escribo, borro, modifico, agrego, saco, edito de
// diseño, cambio de lugar, copio y pego"*.
//
// `guarda-escritura.mjs` decide por PESTAÑA: candado, firma, vacío-sobre-lleno. Con eso sólo hay dos
// estados —congelada o pisada— y él no pidió ninguno de los dos. Estas capas agregan el del medio.
// Viven acá y no allá para que el archivo que decide por pestaña se siga pudiendo leer entero.
//
// LAS TRES CORREN DESPUÉS de la guarda por pestaña, sobre lo que ella ya autorizó. Ninguna puede
// levantar un candado: sólo pueden sacar cosas del pedido, nunca agregarlas.

import { esProtegible } from './guarda-escritura.mjs'

/**
 * Aplica la propiedad por celda a un `data` de valores ya autorizado por pestaña, y compone el
 * sellado. Nunca lanza: si el subsistema falla entero, el pedido sigue como venía —el resto de las
 * guardas (vacío-sobre-lleno, no-borrar, candado) siguen puestas— y se dice fuerte.
 */
export async function conPropiedadPorCelda(cliente, fileId, data, sellarFirma) {
  try {
    const { filtrarValues, avisarRespetadas, registrarRespetadas } = await import('./propiedad-celda.mjs')
    const r = await filtrarValues(cliente, fileId, data, { esProtegible })
    for (const d of r.descartados) console.log(`  🔒 "${d.range}": ${d.motivo}.`)
    avisarRespetadas(r.respetadas)
    await registrarRespetadas(fileId, r.respetadas)
    return { data: r.data, respetadas: r.respetadas, sellar: async () => { await sellarFirma(); await r.sellar() } }
  } catch (e) {
    console.warn(`  ⚠ propiedad por celda inactiva (${String(e.message).slice(0, 90)}) — una edición tuya podría pisarse`)
    return { data, respetadas: [], sellar: sellarFirma }
  }
}

/**
 * Las tres capas por celda del batch estructural: CONTENIDO (`updateCells`), ESTRUCTURA (borrar o
 * mover tramos) y DISEÑO (formato). Nunca lanza, por el mismo motivo que la de arriba.
 */
export async function filtrarPorCelda(cliente, fileId, requests, id2tab) {
  try {
    const { avisarRespetadas, registrarRespetadas } = await import('./propiedad-celda.mjs')
    const { filtrarUpdateCells } = await import('./propiedad-updatecells.mjs')
    const { filtrarEstructura } = await import('./propiedad-estructura.mjs')
    const { filtrarFormato } = await import('./huella-formato.mjs')
    const a = await filtrarUpdateCells(cliente, fileId, requests, id2tab, { esProtegible })
    for (const d of a.descartados) console.log(`  🔒 ${d.motivo}.`)
    const b = await filtrarEstructura(cliente, fileId, a.requests, id2tab, { esProtegible })
    const c = await filtrarFormato(cliente, fileId, b.requests, id2tab, { esProtegible })
    const respetadas = [...a.respetadas, ...b.respetadas, ...c.respetadas]
    avisarRespetadas(respetadas)
    await registrarRespetadas(fileId, respetadas)
    // `frenados` viaja hasta el llamador (03/09, auditoría). Un `deleteDimension` que no se aplicó
    // deja al generador CREYENDO que la geometría cambió: sigue escribiendo con el layout nuevo sobre
    // una pestaña que quedó con el viejo. Frenar y no avisar es peor que no frenar.
    return { requests: c.requests, respetadas, frenados: b.frenados, sellar: async () => { await a.sellar(); await c.sellar() } }
  } catch (e) {
    console.warn(`  ⚠ propiedad por celda inactiva en el batch (${String(e.message).slice(0, 90)}) — una edición tuya podría pisarse`)
    return { requests, respetadas: [], frenados: [], sellar: async () => {} }
  }
}
