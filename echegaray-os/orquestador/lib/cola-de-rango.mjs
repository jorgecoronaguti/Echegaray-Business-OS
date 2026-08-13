// EL GENERADOR ES DUEÑO DE TODO SU RANGO, Y UN RANGO TIENE DOS EJES.
//
// POR QUÉ EXISTE (13/08). La pestaña OBRAS cambió de tamaño dos veces el mismo día y las dos veces
// dejó cola: al pasar de 9 a 8 columnas quedaron 40 celdas de glosa a la derecha —corridas de fila,
// mezclando el detalle de una obra con el encabezado de otra sección—, y al bajar de 62 a 61 filas la
// vieja 62 quedó publicada, duplicando la última línea del cuadro con valores distintos. La causa es
// una sola en los dos ejes: **cambiar lo que el generador ESCRIBE no borra lo que YA HABÍA escrito**.
//
// La cura se escribió dentro de `obras-grilla.mjs`, y ahí estaba el segundo defecto: de los generadores
// que escriben pestañas de este archivo, sólo cinco limpiaban su cola, cada uno con su copia del mismo
// bucle de doce líneas, y con diferencias que ya costaron caro (uno leía hasta la columna
// `String.fromCharCode(64 + n)`, que a partir de la 27 devuelve un carácter que no es una letra).
// Copiar el patrón en cada generador es sembrar un lugar por generador donde se puede olvidar: el
// mecanismo vive acá y cada generador declara sólo sus dos números.
//
// ═══ LO QUE ESTE MÓDULO NUNCA HACE ═══
//
// No limpia hasta el borde de la hoja. Ni una sola función de acá mira `hoja.cols` ni `hoja.rows`:
// rellenar a ciegas hasta el borde ya borró 14 fechas del dueño. Se limpia hasta donde se puede
// PROBAR que llegó este generador — por dimensión declarada o por medición de lo que hay.

import { VACIO, letraCol, colaLimpiable } from './preservar-anotaciones.mjs'

/**
 * ¿HASTA QUÉ FILA HAY ALGO ESCRITO? 1-based; 0 = no hay nada.
 *
 * Es la medición sobre la que se apoya el modo B. Se pregunta por CONTENIDO, no por el alto de la
 * hoja: una pestaña de 1.000 filas con 61 escritas tiene cola hasta la 61, no hasta la 1.000.
 */
export function ultimaFilaConDato(previo = []) {
  let ultima = 0
  previo.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) ultima = i + 1 })
  return ultima
}

/**
 * MODO A — DIMENSIONES DECLARADAS. Para una grilla de LAYOUT FIJO, donde el alto y el ancho salen del
 * código y no de los datos: OBRAS, y cualquier cuadro cuyas filas sean siempre las mismas.
 *
 * El generador declara el ancho y el alto MÁS GRANDES que tuvo alguna vez, y la cola hasta ahí se
 * escribe con el centinela `VACIO` —"esta celda es mía y va vacía"—, así la fusión la limpia en vez de
 * conservar lo de la corrida vieja. Ni una celda más allá: más lejos nunca escribió este generador.
 *
 * Si la grilla SUPERA el alto declarado, ROMPE. Una constante que nadie mantiene deja de significar
 * algo, y el modo de falla del olvido es exactamente el defecto que este módulo viene a matar: cola
 * silenciosa. Mejor un aborto que se ve.
 *
 * @param {any[][]} filas
 * @param {{ancho:number, alto:number, quien?:string}} dims
 * @returns {any[][]} la grilla extendida hasta (alto × ancho)
 */
export function conColaLimpiable(filas = [], { ancho, alto, quien = 'este generador' } = {}) {
  if (!(ancho > 0) || !(alto > 0)) throw new Error(`${quien}: hay que declarar ancho y alto históricos para limpiar la cola`)
  if (filas.length > alto) {
    throw new Error(`${quien}: la grilla creció a ${filas.length} filas y el alto histórico declarado es ${alto}. `
      + `Subí ALTO_HISTORICO a ${filas.length} — si no, el día que se achique va a dejar filas viejas publicadas.`)
  }
  const anchas = filas.map((f) => { const r = [...f]; while (r.length < ancho) r.push(VACIO); return r })
  // Las filas que sobran del alto anterior se escriben ENTERAS con el centinela: se limpian.
  while (anchas.length < alto) anchas.push(Array.from({ length: ancho }, () => VACIO))
  return anchas
}

/**
 * MODO B — LA COLA MEDIDA. Para una grilla que es una LISTA: su alto lo deciden los datos y cambia en
 * cada corrida (un comprobante que se borra de la base, un plan de pago que termina, un proveedor que
 * deja de facturar). Acá una constante declarada no sirve —quedaría mal el día que la lista crezca— y
 * la única fuente honesta del "hasta dónde llegué" es lo que HAY escrito en la pestaña.
 *
 * ═══ LA DIFERENCIA ENTRE UN ESPEJO Y UNA PESTAÑA DE CONTENIDO ═══
 *
 * En un espejo `_*` no hay nada del dueño —esa es su definición— y la cola se barre entera. En una
 * pestaña de contenido, debajo de la tabla puede haber cualquier cosa suya, así que se pide PRUEBA:
 * con `conPrueba` sólo se limpia la fila donde TODO lo que hay o bien tiene forma de dato generado
 * (un importe, una fecha, un CUIT, una fórmula, una marca) o bien es un rótulo que este generador
 * escribió en una corrida anterior —`mios`, el registro de `sheet_rotulos`—. Una fila con texto que no
 * se puede probar propio se devuelve como fila de cadenas vacías, que para la fusión significa "no es
 * mía": se conserva entera. Sin registro la prueba se vuelve estricta y casi nada se limpia; ése es el
 * lado correcto para equivocarse.
 *
 * @param {any[][]} filas    la grilla nueva
 * @param {any[][]} previo   lo que hoy tiene la pestaña, desde su fila 1
 * @param {{ancho:number, columnasAjenas?:number[], conPrueba?:boolean, mios?:Set<string>}} opts
 *        `columnasAjenas` (0-based) son columnas que el generador NO ocupa en ninguna fila —la de
 *        prosa del dueño en Jornales, por ejemplo—: van con '' y se conservan.
 * @returns {{filas:any[][], limpiadas:number, preservadas:number[], desde:number, hasta:number}}
 */
export function conColaMedida(filas = [], previo = [], { ancho, columnasAjenas = [], conPrueba = false, mios = new Set() } = {}) {
  if (!(ancho > 0)) throw new Error('conColaMedida: hay que declarar el ancho que ocupa el generador')
  const hasta = ultimaFilaConDato(previo)
  const vacio = { filas, limpiadas: 0, preservadas: [], desde: filas.length + 1, hasta }
  if (hasta <= filas.length) return vacio

  const cruda = previo.slice(filas.length, hasta)
  // Sin prueba exigida (espejo), toda la cola es limpiable. Con prueba, decide `colaLimpiable`, que es
  // el mismo criterio que ya usan CAJA y Proveedores para barrer la cola de un diseño anterior.
  const limpiar = new Set(conPrueba
    ? colaLimpiable(cruda, mios).limpiar
    : cruda.map((_, i) => i))
  const ajenas = new Set(columnasAjenas)
  const cola = cruda.map((_, i) => Array.from({ length: ancho }, (_, j) => (
    limpiar.has(i) && !ajenas.has(j) ? VACIO : ''
  )))
  return {
    filas: [...filas, ...cola],
    limpiadas: limpiar.size,
    preservadas: cruda.map((_, i) => i).filter((i) => !limpiar.has(i)).map((i) => filas.length + i + 1),
    desde: filas.length + 1,
    hasta,
  }
}

/**
 * MODO B con la lectura incluida: el único lugar donde se decide HASTA DÓNDE se mira.
 *
 * FALLA CERRADO. Si la pestaña no se puede releer —un 429, un corte—, NO se extiende nada: la cola
 * queda para la corrida siguiente. Escribir centinelas sobre un rango que no se pudo verificar es
 * exactamente la forma que tomaron las pérdidas de trabajo del dueño.
 *
 * @param {object} google
 * @param {string} fileId
 * @param {string} ref   la referencia ya citada de la pestaña (ej. `'Cargas Sociales'`)
 * @param {any[][]} filas
 * @param {{ancho:number, tope?:number, columnasAjenas?:number[], conPrueba?:boolean, pestana?:string}} opts
 *        `tope` es la última fila que se mira: la cola de un diseño anterior está cerca de la tabla,
 *        y mirar 5.000 filas abajo sólo agranda el blast radius sin agregar información. Con
 *        `conPrueba` hay que pasar `pestana`: de ahí sale el registro de rótulos propios.
 */
export async function conColaMedidaLeida(google, fileId, ref, filas, { ancho, tope = 400, conPrueba = false, pestana, ...opts } = {}) {
  const previo = await google.readSheetValues(fileId, `${ref}!A1:${letraCol(ancho - 1)}${tope}`).catch(() => null)
  if (previo === null) {
    return { filas, limpiadas: 0, preservadas: [], desde: filas.length + 1, hasta: 0, noVerificable: true }
  }
  const mios = conPrueba ? await rotulosPropios(fileId, pestana) : new Set()
  return conColaMedida(filas, previo, { ancho, conPrueba, mios, ...opts })
}

/**
 * Los rótulos que este generador dejó escritos en corridas anteriores: la prueba de propiedad de una
 * fila de la cola. Import dinámico y try/catch porque toca Postgres, y un problema de base NUNCA puede
 * tumbar una escritura — sin registro la prueba queda estricta y la cola se conserva.
 */
export async function rotulosPropios(fileId, pestana) {
  if (!pestana) return new Set()
  try {
    const { leerRegistro } = await import('./respetar-ediciones.mjs')
    const reg = await leerRegistro(fileId, pestana)
    return new Set(Array.isArray(reg?.mios) ? reg.mios : [])
  } catch {
    return new Set()
  }
}

/** El aviso, con el mismo texto en todos los generadores: una cola barrida se dice, no se calla. */
export function avisoDeCola(r, quien = '') {
  if (r?.noVerificable) return `  ⚠ no pude releer ${quien} para ver si quedó cola de una corrida anterior: la dejo como está`
  if (!r?.limpiadas) return ''
  const pres = r.preservadas?.length ? ` · ✋ ${r.preservadas.length} fila(s) con algo que no es del generador — CONSERVADAS (${r.preservadas.slice(0, 6).join(', ')})` : ''
  return `  🧹 cola de una corrida anterior: limpio ${r.limpiadas} fila(s) entre la ${r.desde} y la ${r.hasta}${pres}`
}
