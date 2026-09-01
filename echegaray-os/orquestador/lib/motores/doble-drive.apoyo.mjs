// UN DRIVE DE MENTIRA, Y DICHO DE FRENTE.
//
// Este doble NO simula la aritmética de índices de la Docs API: si lo hiciera, los tests estarían
// probando mi copia de Google en vez de Google. Lo que simula son las RESPUESTAS —qué devuelve,
// qué tira y con qué status— para poder poner en rojo los caminos de error, que en el circuito
// vivo sólo se pueden provocar rompiendo algo real.
//
// El comportamiento de los índices lo prueba la corrida viva (`scripts/motores-sin-llm.mjs`), que
// crea el documento de verdad y lo relee.

/** Un párrafo del cuerpo tal como lo devuelve la Docs API. */
export function parrafo(texto, estilo = 'NORMAL_TEXT', desde = 1) {
  return {
    startIndex: desde,
    endIndex: desde + texto.length + 1,
    paragraph: { paragraphStyle: { namedStyleType: estilo }, elements: [{ textRun: { content: `${texto}\n` } }] },
  }
}

/** Un cuerpo de documento a partir de `[texto, estilo]`, con los índices encadenados. */
export function cuerpo(lineas) {
  let i = 1
  const content = lineas.map(([t, e]) => { const p = parrafo(t, e ?? 'NORMAL_TEXT', i); i = p.endIndex; return p })
  return { documentId: 'doc_de_prueba', title: lineas[0]?.[0] ?? '', body: { content } }
}

/** Un error con status, como los arma `lib/google.mjs`. */
export function errorHttp(status, mensaje = 'error') {
  const e = new Error(`google api ${status}: ${mensaje}`)
  e.status = status
  return e
}

/**
 * EL DOBLE. `guion` define qué contesta cada método; todo lo no definido falla ruidoso, que es lo
 * que hay que hacer cuando un test toca una puerta que no declaró.
 */
export function dobleDrive(guion = {}) {
  const llamadas = []
  const anotar = (que, args) => llamadas.push({ que, args })
  const responder = (que) => (...args) => {
    anotar(que, args)
    const r = guion[que]
    if (r === undefined) throw new Error(`el doble no tiene guión para «${que}»`)
    const v = typeof r === 'function' ? r(...args) : r
    return v instanceof Error ? Promise.reject(v) : Promise.resolve(v)
  }
  return {
    llamadas,
    veces: (que) => llamadas.filter((l) => l.que === que).length,
    createFile: responder('createFile'),
    getDoc: responder('getDoc'),
    getMeta: responder('getMeta'),
    docsBatchUpdate: responder('docsBatchUpdate'),
    buscarPorPropiedad: responder('buscarPorPropiedad'),
    exportarBytesComo: responder('exportarBytesComo'),
    marcarArchivo: responder('marcarArchivo'),
    crearPresentacionVacia: responder('crearPresentacionVacia'),
    slidesBatchUpdate: responder('slidesBatchUpdate'),
    leerPresentacion: responder('leerPresentacion'),
    miniaturaDeLamina: responder('miniaturaDeLamina'),
    exportarPdfBytes: responder('exportarPdfBytes'),
  }
}
