// UN RANGO CON NOMBRE QUE APUNTA A CELDAS VACÍAS NO DA ERROR: DEVUELVE CERO.
//
// POR QUÉ EXISTE (03/08). Auditando CAJA contra el archivo real aparecieron tres de 47 rangos con
// nombre apuntando a celdas sin un solo dato. Ninguno rompe nada visible: `SUMPRODUCT(…*N(RANGO))`
// sobre celdas vacías vale 0, el cuadro cuadra y el número es falso. Dos líneas de CAJA —los sueldos
// de administración por transferencia y en efectivo— valían $0 desde que se escribieron.
//
// ES EL MISMO DEFECTO QUE `auditar-rangos-fosilizados.mjs` ya persigue en los rangos A1, con una
// vuelta de tuerca peor: un rango A1 corto al menos se lee en la fórmula. Un nombre no dice a dónde
// apunta. `OFICINA_BANCO` se lee igual de bien apuntando al bloque de oficina que a doce celdas en
// blanco de otro layout.
//
// ═══ LAS DOS FORMAS EN QUE UN NOMBRE SE QUEDA CIEGO ═══
//
//   1. ANCLADO A LA POSICIÓN. Se publicó una vez con las filas de ESE día y el bloque se movió. Es la
//      trampa que este repo ya pagó tres veces (ver `anclar-en-el-ultimo-es-anclar-en-la-posicion`).
//      La cura no es corregir la fila: es que el generador REAPUNTE el nombre en cada corrida al
//      bloque que acaba de armar, y que el bloque se reconozca por su ENCABEZADO, no por su fila.
//   2. EL GENERADOR LE BORRA EL CONTENIDO. El rango está perfecto y las celdas están vacías porque
//      el propio generador las emite con el centinela VACIO ("es mi celda y va vacía") sobre una
//      columna que en realidad carga el dueño. Cada corrida del worker le borra lo que escribió.
//
// Este módulo es el NÚCLEO PURO de las dos: un rango publicado se declara con su ANCLA —el texto que
// tiene que estar en su encabezado— y con DE QUIÉN ES EL CONTENIDO. `verificarRangos` corre sobre la
// grilla que el generador acaba de armar, sin red y sin Sheet, y devuelve rojo antes de publicar.

import { VACIO, tiene } from './preservar-anotaciones.mjs'

/**
 * DE QUIÉN ES EL CONTENIDO DE UN RANGO. No es un detalle de estilo: decide qué significa que esté
 * vacío y por lo tanto qué es un defecto.
 *
 *   'os'                — lo escribe el generador. Vacío = el rango no está mirando su bloque.
 *   'dueño'             — lo carga la persona. Vacío es legítimo (todavía no lo cargó), pero el
 *                         generador NO puede emitir el centinela ahí: se lo borraría en la corrida
 *                         siguiente y el rango quedaría vacío PARA SIEMPRE.
 *   'dueño-restaurado'  — de la persona, y el generador emite el centinela y después le copia
 *                         encima lo que había en la pestaña. Funciona, pero depende de reconocer un
 *                         ancla en la pestaña vieja: se declara aparte para que se vea que es la
 *                         excepción, no el patrón.
 */
export const CONTENIDO = /** @type {const} */ (['os', 'dueño', 'dueño-restaurado'])

/**
 * Un rango VERTICAL: una columna, de la fila `r0` a la `r1` (1-based, ambas incluidas).
 *
 * `encabezado` es el texto que tiene que estar en la celda de arriba de la columna. Es el ancla: si
 * el bloque se mueve, el nombre se mueve con él porque `r0` sale de la grilla recién armada; si
 * alguien inserta una columna en el medio, el encabezado deja de coincidir y salta acá.
 *
 * @param {string} nombre
 * @param {{col:number, r0:number, r1:number, encabezado:string, contenido?:'os'|'dueño'}} d
 */
export function columna(nombre, { col, r0, r1, encabezado, contenido = 'os' }) {
  return {
    nombre,
    c0: col,
    c1: col,
    r0,
    r1,
    contenido,
    // El encabezado de una columna vive en la fila de arriba del bloque.
    ancla: { fila: r0 - 1, col, texto: encabezado },
  }
}

/**
 * Un rango HORIZONTAL: una fila, de la columna `c0` a la `c1` (0-based, ambas incluidas).
 * Su ancla es el RÓTULO de la fila, en la columna A — que es como se lee una fila de totales.
 *
 * @param {string} nombre
 * @param {{fila:number, c0:number, c1:number, rotulo:string, contenido?:'os'|'dueño'}} d
 */
export function fila(nombre, { fila: f, c0, c1, rotulo, contenido = 'os' }) {
  return { nombre, c0, c1, r0: f, r1: f, contenido, ancla: { fila: f, col: 0, texto: rotulo } }
}

/** El rango en el formato que pide la Sheets API (índices 0-based, fin exclusivo). */
export function aRangoApi(sheetId, d) {
  return {
    sheetId,
    startRowIndex: d.r0 - 1,
    endRowIndex: d.r1,
    startColumnIndex: d.c0,
    endColumnIndex: d.c1 + 1,
  }
}

/** El texto de una celda de la grilla, normalizado para comparar contra el ancla. */
const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

/**
 * NÚCLEO PURO: ¿alguno de los rangos que se van a publicar está ciego?
 *
 * Corre sobre la grilla que el generador acaba de armar en memoria — antes de escribir, antes de
 * publicar y sin una sola llamada a la red. Devuelve la lista de problemas; vacía es verde.
 *
 * @param {any[][]} filas  la grilla del generador (con centinelas, sin fusionar)
 * @param {Array<ReturnType<typeof columna>>} rangos
 * @returns {{nombre:string, problema:string, detalle:string}[]}
 */
export function verificarRangos(filas = [], rangos = []) {
  const problemas = []
  const mal = (nombre, problema, detalle) => problemas.push({ nombre, problema, detalle })

  for (const d of rangos) {
    if (d.r0 < 1 || d.r1 < d.r0 || d.r1 > filas.length) {
      mal(d.nombre, 'fuera-de-la-grilla', `pide las filas ${d.r0}-${d.r1} y la grilla tiene ${filas.length}`)
      continue
    }
    if (d.ancla) {
      const hay = texto(filas[d.ancla.fila - 1]?.[d.ancla.col])
      if (hay !== texto(d.ancla.texto)) {
        mal(d.nombre, 'desanclado', `su ancla debería decir "${d.ancla.texto}" y dice "${hay}"`)
        continue
      }
    }
    const celdas = []
    for (let r = d.r0; r <= d.r1; r++) {
      for (let c = d.c0; c <= d.c1; c++) celdas.push(filas[r - 1]?.[c])
    }
    // El generador escribe el centinela y después restaura desde la pestaña: ni "sin dato" ni
    // "pisado" significan nada acá, porque el contenido no está en esta grilla.
    if (d.contenido === 'dueño-restaurado') continue
    if (d.contenido === 'dueño') {
      // EL DEFECTO QUE DEJÓ `OFICINA_BANCO` EN CERO PARA SIEMPRE. La columna es de carga del dueño y
      // el generador la emitía con el centinela: cada corrida del worker (cada 2 h) le borraba lo
      // que había escrito. El nombre apuntaba perfecto a doce celdas que nunca podían tener nada.
      const n = celdas.filter((v) => v === VACIO).length
      if (n) mal(d.nombre, 'pisado', `${n} celda(s) con el centinela VACIO en una columna que carga el dueño: se la borrás en cada corrida`)
      continue
    }
    if (!celdas.some(tiene)) {
      mal(d.nombre, 'sin-dato', `${celdas.length} celda(s) y ninguna con contenido: el nombre devuelve 0 sin dar error`)
    }
  }
  return problemas
}

/** Una línea por problema, para el log del generador. */
export function explicarProblemas(problemas = []) {
  return problemas.map((p) => `  ✗ ${p.nombre} [${p.problema}] — ${p.detalle}`).join('\n')
}

/**
 * ¿La fórmula menciona este nombre? Con límites propios: `OFICINA_PAGO` no puede matchear dentro de
 * `OFICINA_PAGO_ANTERIOR`, y el guion bajo es carácter de palabra, así que `\b` no alcanza.
 */
export function usaNombre(formula, nombre) {
  const re = new RegExp(`(?<![A-Za-z0-9_])${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`)
  return re.test(String(formula ?? ''))
}

/**
 * NÚCLEO PURO del auditor que corre sobre el ARCHIVO REAL: clasifica cada rango con nombre según
 * cuántas celdas con dato tiene y cuántas fórmulas lo leen.
 *
 *   ciego    — no tiene una sola celda con dato Y hay fórmulas que lo leen. Cada una de esas
 *              fórmulas está devolviendo 0 sin dar error. Es el defecto.
 *   huérfano — nadie lo lee. No hace daño hoy, pero es exactamente cómo nace un ciego: queda ahí,
 *              anclado a un layout viejo, hasta que alguien escribe la primera fórmula que lo usa.
 *
 * NO SE INFIERE QUIÉN LO PUBLICA. Un registro de "nombres que el OS mantiene" se desactualiza igual
 * que el rango que viene a cuidar; el propio archivo alcanza como fuente.
 *
 * @param {{nombre:string, hoja:string|null, conDato:number, celdas:number}[]} nombrados
 * @param {string[]} formulas todas las fórmulas del libro
 */
export function clasificarNombrados(nombrados = [], formulas = []) {
  return nombrados.map((n) => {
    const usos = formulas.filter((f) => usaNombre(f, n.nombre)).length
    const estado = n.conDato === 0 && usos > 0 ? 'ciego' : (usos === 0 ? 'huérfano' : 'ok')
    return { ...n, usos, estado }
  })
}
