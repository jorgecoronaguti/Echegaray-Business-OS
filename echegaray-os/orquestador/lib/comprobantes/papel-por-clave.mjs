// ¿DÓNDE ESTÁ EL PAPEL DE ESTE GASTO? — del registro del bot al archivo, y del archivo a la fila.
//
// Regla del dueño: ningún gasto de Compras sin su comprobante visible en app.ecsas.com.ar.
//
// ═══ POR QUÉ NO ALCANZA CON COMPARAR DOS TABLAS ═══
//
// La medición que abrió esta tarea contó «38 claves de `comunicacion.comprobantes_cargados` sin
// archivo» con un `not exists (… where compra_adjunto.compra_clave = comprobantes_cargados.clave)`.
// Ese conteo compara DOS NOMBRES DEL MISMO COMPROBANTE y por eso no puede dar cero nunca: el bot
// registra lo que leyó del papel (`c:<cuit>|<numero>`) y el adjunto cuelga de lo que la pestaña
// nombra (`p:<proveedor>|<numero>`, porque la columna CUIT del Sheet suele venir vacía). Medido el
// 10/09/2026: las 40 claves que ese `not exists` marcaba «sin archivo» tenían su archivo en el
// bucket —194 filas de `compra_adjunto`, 194 objetos en `storage.objects`, cero huecos—.
//
// LA PREGUNTA CORRECTA ES OTRA, y es la del dueño: para el gasto que el bot cargó, ¿hay un archivo
// guardado que cuelgue de SU fila? Se contesta siguiendo la cadena física, no comparando rótulos:
//
//   comprobantes_cargados.clave → fileId (comprobante_fajos.items[].origen/copias)
//                               → compra_adjunto.origen_file_id  (¿está el papel guardado?)
//                               → compra_sheet.fila              (¿de qué fila cuelga?)
//
// El puente de nombres lo hace `filaConciliada`, la MISMA regla que usa el sync desde `bdf41bfc`:
// el número y el tipo tienen que coincidir siempre, y la identidad sólo se afloja si el proveedor
// la confirma. Usar acá un criterio propio produciría un reporte que se contradice con la pantalla.
//
// LO QUE NO HACE: no inventa vínculos ni elige entre dos filas empatadas, y nunca pisa una clave ya
// escrita — reponer un hueco es reparar, cambiar un vínculo existente es decidir por otro.

import { filaConciliada } from './clave-conciliada.mjs'

export const ESTADO = Object.freeze({
  /** El papel ya cuelga de la fila de ese gasto: la pantalla lo muestra. */
  VISIBLE: 'visible',
  /** El papel está guardado y su fila existe, pero el vínculo está en blanco. Se escribe. */
  A_VINCULAR: 'a_vincular',
  /** El papel no está en el bucket. Hay que bajarlo de Mattermost y subirlo. */
  SIN_RESPALDO: 'sin_respaldo',
  /** El papel está, pero ninguna fila del espejo es ese comprobante: no hay de dónde colgarlo. */
  SIN_FILA: 'sin_fila',
  /** El registro no guardó de qué archivo salió el gasto: no hay papel que buscar. */
  SIN_FUENTE: 'sin_fuente',
})

export const ORDEN = Object.freeze([
  ESTADO.VISIBLE, ESTADO.A_VINCULAR, ESTADO.SIN_RESPALDO, ESTADO.SIN_FILA, ESTADO.SIN_FUENTE,
])

/**
 * `clave` → los archivos de los que salió, sacados de los fajos. Puro.
 *
 * EL ARCHIVO SE BUSCA POR CLAVE, NUNCA POR POSICIÓN: `filas` guarda sólo los ítems que entraron al
 * Sheet, así que `filas[k]` no es el ítem `k` (eso ya le colgó la factura de Robles Pintureria al
 * PDF de MASS CONSULTORA el 08/09). Se deduplica por `fileId` porque un mismo fajo reenviado deja
 * el mismo archivo repetido en `copias`.
 */
export function archivosPorClave(fajos = []) {
  const mapa = new Map()
  for (const f of fajos) {
    const post0 = (f?.post_ids ?? [])[0] ?? null
    for (const it of (f?.items ?? [])) {
      if (!it?.clave) continue
      const lista = mapa.get(it.clave) ?? []
      for (const o of [it?.origen, ...(it?.copias ?? [])]) {
        if (!o?.fileId) continue
        const fileId = String(o.fileId)
        if (lista.some((x) => x.fileId === fileId)) continue
        lista.push({ fileId, nombre: o.nombre ?? null, postId: o.postId ?? post0 ?? null })
      }
      mapa.set(it.clave, lista)
    }
  }
  return mapa
}

/**
 * DÓNDE ESTÁ EL PAPEL DE UN GASTO CARGADO. Puro.
 *
 * @param {{clave:string, proveedor?:string|null, fila?:number|null}} gasto  de `comprobantes_cargados`
 * @param {{archivos:Array<{fileId:string,nombre:string|null,postId:string|null}>,
 *          adjuntos:Map<string,{id:string,compra_clave:string|null,fila_compras:number|null}>,
 *          espejo:Array<{fila:number,clave:string|null,proveedor?:string|null}>}} ctx
 * @returns {{estado:string, clave:string, fila:number|null, claveFila:string|null,
 *            archivos:Array<object>, accion:object|null, motivo:string|null}}
 */
export function papelDelGasto(gasto = {}, { archivos = [], adjuntos = new Map(), espejo = [] } = {}) {
  const base = { clave: gasto.clave, proveedor: gasto.proveedor ?? null, archivos, fila: null, claveFila: null, accion: null, motivo: null }
  if (!archivos.length) {
    return { ...base, estado: ESTADO.SIN_FUENTE, motivo: 'el registro del bot no guardó de qué archivo salió' }
  }
  const f = filaConciliada(gasto.clave, espejo, { proveedor: gasto.proveedor ?? null })
  if (!f) {
    return { ...base, estado: ESTADO.SIN_FILA, motivo: 'ninguna fila del espejo es ese comprobante' }
  }
  const conFila = { ...base, fila: f.fila ?? null, claveFila: f.clave ?? null }

  // ¿Alguno de sus archivos ya resuelve a ESTA fila? Se compara la fila, no el rótulo: el sync
  // reasigna la clave del adjunto en cada corrida, así que un `c:` colgado de la misma fila que hoy
  // se llama `p:` está visible, y contarlo como roto mandaría a arreglar algo que funciona.
  for (const a of archivos) {
    const adj = adjuntos.get(a.fileId)
    if (!adj?.compra_clave) continue
    const suya = filaConciliada(adj.compra_clave, espejo, { proveedor: gasto.proveedor ?? null })
    if (suya && suya.fila === f.fila) return { ...conFila, estado: ESTADO.VISIBLE }
  }
  // El hueco se repone con el PRIMER archivo suelto que ya esté guardado: escribir la clave donde
  // hay un blanco es reparar. Un adjunto con clave ajena no se toca acá — eso sería decidir que la
  // persona (o el sync) se equivocó, y esa decisión no es de un backfill.
  const suelto = archivos.find((a) => adjuntos.has(a.fileId) && !adjuntos.get(a.fileId).compra_clave)
  if (suelto) {
    const adj = adjuntos.get(suelto.fileId)
    return { ...conFila, estado: ESTADO.A_VINCULAR, accion: { tipo: 'vincular', id: adj.id, fileId: suelto.fileId, clave: f.clave, fila: f.fila ?? null } }
  }
  const falta = archivos.find((a) => !adjuntos.has(a.fileId))
  if (falta) {
    return { ...conFila, estado: ESTADO.SIN_RESPALDO, accion: { tipo: 'bajar', ...falta, clave: f.clave, fila: f.fila ?? null } }
  }
  // Todos sus archivos están guardados y todos cuelgan de OTRA fila: no hay nada que reponer sin
  // pisar un vínculo ajeno. Se declara, no se arregla.
  return { ...conFila, estado: ESTADO.SIN_FILA, motivo: 'sus archivos ya cuelgan de otra fila' }
}

/** La cadena entera, gasto por gasto. Puro. */
export function papelDeCadaGasto({ cargados = [], fuentes = new Map(), adjuntos = new Map(), espejo = [] } = {}) {
  const filas = cargados.map((g) => papelDelGasto(g, { archivos: fuentes.get(g.clave) ?? [], adjuntos, espejo }))
  const resumen = Object.fromEntries(ORDEN.map((e) => [e, filas.filter((x) => x.estado === e).length]))
  return { filas, resumen, total: filas.length }
}

/**
 * ¿CIERRA? Todo gasto cargado por el bot muestra su papel.
 *
 * La pregunta del dueño convertida en algo que puede dar rojo. `a_vincular` y `sin_respaldo` son
 * trabajo pendiente de este script; `sin_fila` y `sin_fuente` son decisiones de una persona — pero
 * los cuatro cuentan como incumplido, porque el gasto sigue sin papel a la vista.
 */
export function todosConPapel(resumen = {}) {
  return ORDEN.filter((e) => e !== ESTADO.VISIBLE).every((e) => (resumen[e] ?? 0) === 0)
}
