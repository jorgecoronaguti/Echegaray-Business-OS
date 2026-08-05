// LA RENDICIÓN DE CUENTAS DE LOS ADJUNTOS — NÚCLEO PURO, CERO MODELO Y CERO RED.
//
// ═══ EL DEFECTO QUE ARREGLA (05/08) ═══
//
// El dueño mandó CINCO fotos en un post y el bot contestó:
//
//     ✅ **1 listo para cargar** · 1 con un dato pendiente.
//
// Tres fotos no aparecieron en ninguna línea del mensaje. No hubo error, no hubo aviso: se
// evaporaron. Dos de ellas eran copias del mismo tique —`colapsarRepetidos` las unió y tiraba los
// repetidos al piso— y la tercera no se pudo leer, pero su renglón se perdió entre bloques.
//
// El problema no es de redacción. Es que **nadie estaba llevando la cuenta.** El mensaje se armaba
// recorriendo los comprobantes que sobrevivieron, y un comprobante que no sobrevive no tiene quién
// lo nombre. Para el dueño las dos cosas se ven igual: mandó cinco fotos y el bot le habló de dos.
// La conclusión razonable —«tres gastos se perdieron»— es exactamente la que hace que deje de usar
// el flujo, y la conclusión contraria —«los cargó a todos»— es peor.
//
// ═══ LA REGLA ═══
//
// **CADA ADJUNTO DEL POST TERMINA EN EXACTAMENTE UN DESTINO**, y la suma de los destinos tiene que
// dar la cantidad de adjuntos que entraron. Los destinos son cinco y son excluyentes:
//
//   · CARGADO   — ya está en Compras (o se acaba de escribir): con su fila.
//   · COPIA     — es otra foto de un comprobante que ya está en esta misma tanda.
//   · DUPLICADO — puede que ya esté cargado: hay una fila candidata y se está preguntando.
//   · PENDIENTE — falta un dato para poder cargarlo, y se dice CUÁL.
//   · ILEGIBLE  — no se pudo bajar o no se pudo leer, y se dice POR QUÉ.
//
// Y un sexto que no es un destino sino una falla del propio sistema:
//
//   · SIN_RASTRO — el adjunto entró y no aparece en ningún lado. **Se declara.** Un agujero que se
//     anuncia se arregla; uno que se calla es el defecto de arriba otra vez.
//
// El invariante se calcula (`cuadra`) en vez de asumirse: es la única forma de que el día que
// alguien agregue un camino nuevo por el que un adjunto pueda desaparecer, el mensaje lo diga solo.

import { rotulosDe, estaCompleto } from './fajo.mjs'

export const DESTINO = Object.freeze({
  CARGADO: 'cargado',
  LISTO: 'listo',
  COPIA: 'copia',
  DUPLICADO: 'duplicado',
  PENDIENTE: 'pendiente',
  ILEGIBLE: 'ilegible',
  SIN_RASTRO: 'sin_rastro',
})

/**
 * Dónde terminó cada adjunto de ESTE post.
 *
 * Se rinde sobre `fileIds` —lo que entró— y no sobre los ítems: rendir sobre lo que sobrevivió es
 * justamente el defecto. Los ítems se buscan por `origen.fileId` y por `copias[].fileId`; lo que no
 * aparece ahí se busca en `problemas`; y lo que no está en ninguno de los dos es `SIN_RASTRO`.
 *
 * @param {{fileIds?:string[], items?:Array, problemas?:Array<{fileId?:string,nombre?:string,error?:string}>}} o
 * @returns {{total:number, porAdjunto:Array, cuenta:Object, cuadra:boolean}}
 */
export function rendicionDeAdjuntos({ fileIds = [], items = [], problemas = [] } = {}) {
  const porFile = new Map()
  for (const it of items ?? []) {
    const id = it?.origen?.fileId
    if (id) porFile.set(String(id), { item: it, esCopia: false })
    for (const c of it?.copias ?? []) {
      if (c?.fileId) porFile.set(String(c.fileId), { item: it, esCopia: true, copia: c })
    }
  }
  const porProblema = new Map()
  for (const p of problemas ?? []) if (p?.fileId) porProblema.set(String(p.fileId), p)

  const porAdjunto = (fileIds ?? []).filter(Boolean).map((id) => {
    const k = String(id)
    const hit = porFile.get(k)
    if (hit) return deItem(k, hit)
    const p = porProblema.get(k)
    if (p) {
      return { fileId: k, nombre: p.nombre ?? k, destino: DESTINO.ILEGIBLE, detalle: p.error ?? 'no pude leerlo' }
    }
    return { fileId: k, nombre: k, destino: DESTINO.SIN_RASTRO, detalle: 'entró al post y no aparece en ningún comprobante ni en ningún error' }
  })

  const cuenta = {}
  for (const a of porAdjunto) cuenta[a.destino] = (cuenta[a.destino] ?? 0) + 1
  return {
    total: porAdjunto.length,
    porAdjunto,
    cuenta,
    cuadra: !cuenta[DESTINO.SIN_RASTRO],
  }
}

function deItem(fileId, { item, esCopia, copia }) {
  const nombre = (esCopia ? copia?.nombre : item?.origen?.nombre) ?? fileId
  const c = item?.comprobante ?? {}
  const quien = c.proveedor ? `${c.proveedor} ${c.numero ?? ''}`.trim() : (c.numero ?? 'el comprobante')
  if (esCopia) return { fileId, nombre, destino: DESTINO.COPIA, detalle: `otra foto de ${quien}` }
  if (item?.yaCargado) {
    const fila = item.yaCargado.fila
    return { fileId, nombre, destino: DESTINO.CARGADO, detalle: fila ? `ya estaba en Compras, fila ${fila}` : 'ya estaba en Compras' }
  }
  if (item?.duplicadoResuelto === 'mismo') return { fileId, nombre, destino: DESTINO.CARGADO, detalle: 'marcado como ya cargado' }
  if (item?.posibleDuplicado && !item.duplicadoResuelto) {
    const fila = item.posibleDuplicado.fila
    return { fileId, nombre, destino: DESTINO.DUPLICADO, detalle: `puede ser la fila ${fila ?? '?'} de Compras` }
  }
  if (estaCompleto(item)) return { fileId, nombre, destino: DESTINO.LISTO, detalle: 'listo para cargar' }
  const falta = rotulosDe(item)
  return { fileId, nombre, destino: DESTINO.PENDIENTE, detalle: falta.length ? `falta ${falta.join(' y ')}` : 'falta un dato' }
}

/**
 * La rendición en una línea, para el pie del mensaje.
 *
 * VA SIEMPRE, aunque cuadre y aunque sea una sola foto: es el renglón contra el que el dueño compara
 * cuántas fotos mandó. Un control que sólo aparece cuando algo salió mal no se puede usar para
 * confiar cuando salió bien.
 *
 * `seCargaron` existe porque la rendición se calcula ANTES de escribir —tiene que valer también
 * cuando la escritura falla— y en el camino que carga solo eso dejaría el renglón diciendo «1 listo»
 * sobre una fila que ya está en Compras. Un pie que describe un estado anterior al del mensaje que
 * encabeza es un pie que contradice al mensaje.
 */
export function textoRendicion(r, { seCargaron = false } = {}) {
  if (!r?.total) return ''
  const c = r.cuenta ?? {}
  const partes = []
  if (c[DESTINO.CARGADO]) partes.push(`${c[DESTINO.CARGADO]} ya estaba${c[DESTINO.CARGADO] > 1 ? 'n' : ''} cargado${c[DESTINO.CARGADO] > 1 ? 's' : ''}`)
  if (c[DESTINO.LISTO]) {
    partes.push(seCargaron
      ? `${c[DESTINO.LISTO]} cargado${c[DESTINO.LISTO] > 1 ? 's' : ''} ahora`
      : `${c[DESTINO.LISTO]} listo${c[DESTINO.LISTO] > 1 ? 's' : ''}`)
  }
  if (c[DESTINO.PENDIENTE]) partes.push(`${c[DESTINO.PENDIENTE]} con un dato pendiente`)
  if (c[DESTINO.DUPLICADO]) partes.push(`${c[DESTINO.DUPLICADO]} posible${c[DESTINO.DUPLICADO] > 1 ? 's' : ''} duplicado${c[DESTINO.DUPLICADO] > 1 ? 's' : ''}`)
  if (c[DESTINO.COPIA]) partes.push(`${c[DESTINO.COPIA]} copia${c[DESTINO.COPIA] > 1 ? 's' : ''} del mismo comprobante`)
  if (c[DESTINO.ILEGIBLE]) partes.push(`${c[DESTINO.ILEGIBLE]} que no pude leer`)
  if (c[DESTINO.SIN_RASTRO]) partes.push(`**${c[DESTINO.SIN_RASTRO]} sin rastro**`)

  const l = [`_**${r.total} adjunto${r.total > 1 ? 's' : ''}:** ${partes.join(' · ')}._`]
  // El detalle SÓLO de lo que no terminó cargado ni listo: nombrar por archivo las diez fotos que
  // salieron bien es ruido, y no nombrar la que se perdió es el defecto.
  const aExplicar = (r.porAdjunto ?? []).filter((a) => a.destino !== DESTINO.LISTO && a.destino !== DESTINO.CARGADO)
  for (const a of aExplicar) l.push(`· \`${a.nombre}\` — ${a.detalle}`)
  if (!r.cuadra) {
    l.push('⚠️ **No sé qué pasó con esos adjuntos.** Volvé a mandarlos: prefiero pedírtelos de nuevo antes que darlos por cargados.')
  }
  return l.join('\n')
}
