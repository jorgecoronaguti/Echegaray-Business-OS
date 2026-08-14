// LA COPIA HUÉRFANA: CÓMO SE PRUEBA QUE UNA CELDA ES RESIDUO DE UN REDISEÑO, Y NO UNA EDICIÓN.
//
// ═══ QUÉ QUEDÓ, Y POR QUÉ NO SE VA SOLO (14/08) ═══
//
// "Jornales por Quincena" se rediseñó el 13/08. Las filas se movieron y en las coordenadas nuevas
// quedó lo que el layout ANTERIOR tenía ahí. La mayor parte de eso lo cura ahora el propio generador
// —ver el veredicto de residuo de rediseño en `huella-celda.mjs`—, pero hay dos clases que NO puede
// curar, y las dos por la misma razón: son celdas donde el generador NO ESCRIBE.
//
//   · la columna «Convenio (tuya)» del bloque 4.1 (E), declarada del dueño el 07/08;
//   · la columna «Pagado el» del registro (N), declarada 100% del dueño el 31/07.
//
// En esas dos columnas el generador emite cadena vacía —"no es mía, preservá lo que haya"— y esa es
// exactamente la protección que evitó seis pérdidas de trabajo del dueño. No se afloja. Lo que queda
// es una limpieza DECLARADA: una persona nombra las celdas, y para cada una hay que poder PROBAR que
// es del OS antes de tocarla.
//
// ═══ LA PRUEBA: UNA COPIA HUÉRFANA DE ALGO QUE ESTÁ VIVO ═══
//
// La evidencia no es "parece del OS" ni "está donde no va". Es más fuerte y es verificable por un
// tercero: **la misma cosa está viva, hoy, adentro de la tabla que el generador sí posee, en la misma
// columna.** Una celda así no es un dato: es un duplicado que quedó atrás cuando la tabla se mudó.
//
// Medido en el archivo vivo el 14/08:
//
//   E76 `=IFERROR(MIN(FILTER(Compras!…)))`  ← la misma forma vive en E56, adentro del bloque 3
//   E79 `=IFERROR(MAX(FILTER(Compras!…)))`  ← la misma forma vive en E59:E70, ídem
//   N110 "Pagado el"                        ← el encabezado vivo del registro está en N115
//   N113 46038                              ← el MISMO valor está vivo en N116
//   N114 46055                              ← el MISMO valor está vivo en N117
//
// Los dos últimos son la parte que había que mirar antes de escribir: son fechas que carga el dueño.
// Si NO estuvieran duplicadas adentro del registro, borrarlas destruiría el único ejemplar — y esta
// regla las conservaría, que es el punto. Están duplicadas porque el generador ya las re-copió a su
// posición nueva anclando en la cabecera del registro (ver `copiarPagadoEl`): lo que sobra es la
// copia vieja, no el dato.
//
// EL LADO PARA EQUIVOCARSE ES CONSERVAR. Sin gemelo vivo, la celda se queda y se dice por qué.

import { formaDe, formaComparable } from './huella-forma.mjs'

/** ¿La celda es un número puro? Una fórmula no lo es aunque rinda uno: acá se lee el contenido. */
const esNumero = (v) => {
  const t = String(v ?? '').trim()
  return t !== '' && !t.startsWith('=') && Number.isFinite(Number(t.replace(/\./g, '').replace(',', '.')))
}
const aNumero = (v) => Number(String(v).trim().replace(/\./g, '').replace(',', '.'))

/**
 * ¿Dos celdas son "la misma cosa"?
 *
 * Para una fórmula o un texto, el mismo criterio con el que la huella reclama propiedad: la FORMA.
 * Dos fórmulas que sólo difieren en el número de fila son la misma fórmula corrida de lugar, y eso es
 * justamente lo que un rediseño produce.
 *
 * PARA UN NÚMERO, NO. `formaDe` enmascara todo número como `<n>`, así que por forma **46038 y 46099
 * serían "la misma cosa"** — y con eso una fecha que el dueño cargó y el registro NO tiene se
 * borraría porque "hay otro número parecido más abajo". Un serial se compara por su VALOR o no se
 * compara. Es la diferencia entre probar que una celda es una copia y suponerlo.
 */
const igual = (a, b) => {
  if (esNumero(a) || esNumero(b)) return esNumero(a) && esNumero(b) && aNumero(a) === aNumero(b)
  const fa = formaComparable(formaDe(a))
  return Boolean(fa) && fa === formaComparable(formaDe(b))
}

/**
 * NÚCLEO PURO: ¿esta celda es una copia huérfana de algo vivo adentro de la tabla?
 *
 * @param {any[][]} grid   la pestaña leída con render FORMULA, la fila 1 en el índice 0
 * @param {{fila:number, col:number, tabla:[number,number]}} c
 *        la celda candidata (1-based, col 0-based) y el rango de filas de la tabla VIVA de su columna
 * @returns {{fila:number, col:number, valor:string, gemelo:number|null, motivo:string}}
 */
export function copiaHuerfana(grid = [], { fila, col, tabla }) {
  const valor = (grid[fila - 1] || [])[col]
  const base = { fila, col, valor: String(valor ?? '').slice(0, 80), gemelo: null }
  if (!formaDe(valor)) return { ...base, motivo: 'la celda está vacía: no hay nada que limpiar' }
  // UNA CANDIDATA PUEDE TENER MÁS DE UNA TABLA DONDE BUSCAR SU GEMELO. La columna «Banco» de Oficina
  // recibió residuo de DOS cuadros distintos —las ventanas del calendario y la propia fila de total—
  // y exigir una sola tabla obligaría a declarar la misma celda dos veces, que es como se termina
  // borrando de más. Se acepta `[f0,f1]` o una lista de rangos.
  const tablas = Array.isArray(tabla?.[0]) ? tabla : [tabla]
  for (const [f0, f1] of tablas) {
    if (fila >= f0 && fila <= f1) return { ...base, motivo: 'la celda está ADENTRO de la tabla viva: no es huérfana' }
  }
  for (const [f0, f1] of tablas) {
    for (let f = f0; f <= f1; f++) {
      if (igual(valor, (grid[f - 1] || [])[col])) {
        return { ...base, gemelo: f, motivo: `la misma cosa está viva en la fila ${f}, adentro de la tabla` }
      }
    }
  }
  return { ...base, motivo: 'NO tiene gemelo vivo adentro de la tabla: puede ser tuyo, se conserva' }
}

/**
 * NÚCLEO PURO: LAS CANDIDATAS DE LA COLUMNA «Banco» DE OFICINA, UBICADAS POR SU ENCABEZADO.
 *
 * ═══ QUÉ ENCONTRÓ ESTO, Y CUÁNTO COSTABA (14/08) ═══
 *
 * Leída la pestaña viva con render FORMULA, la columna «Banco» del cuadro de Oficina tenía:
 *
 *   mayo–agosto  `=SUMIFS($H$79:$H$90;$E$79:$E$90;…)`  ← la ventana de la columna «Dirección» del
 *                                                        calendario, que vive en ESA misma columna F
 *   diciembre    `=SUM(F$36:F$47)`                     ← un TOTAL adentro del cuerpo de la tabla
 *
 * La fila de total volvía a sumar el total de diciembre: el canal publicaba $5.238.607 contra
 * $2.619.303 reales —exactamente el doble— y cinco de doce meses medían el banco de otro cuadro. Con
 * ese denominador, cualquier porcentaje contra el acuerdo 50/50 es un artefacto.
 *
 * ═══ POR QUÉ NO ALCANZA CON QUE EL GENERADOR MANDE EL CENTINELA ═══
 *
 * Porque una fórmula ajena sin huella NO SE PISA, nunca, y está bien que no se pise (`huella-celda`).
 * El centinela evita que el residuo VUELVA; sacar el que ya está adentro es esta vía declarada.
 *
 * ═══ POR QUÉ POR ANCLA Y NO POR NÚMERO DE FILA ═══
 *
 * Porque el propio arreglo mueve el bloque: la línea del acuerdo 50/50 entra arriba y corre las doce
 * filas un renglón. Una lista de coordenadas escrita a mano sería correcta hasta la corrida siguiente
 * —y después borraría la celda de al lado, que es como se pierde el trabajo del dueño—. El ancla es
 * el ENCABEZADO: la primera fila cuya A dice «Mes» y que tiene «Banco» y «Proyectado» en su renglón.
 *
 * FALLA CERRADO: sin encabezado, sin calendario o sin fila de total, devuelve lista vacía y no se
 * toca una sola celda.
 *
 * @param {any[][]} grid la pestaña leída con render FORMULA
 * @param {number} meses cuántas filas de mes tiene el bloque
 * @returns {{fila:number, col:number, tabla:number[][]}[]}
 */
export function candidatasDeBancoOficina(grid = [], meses = 12) {
  const celda = (f, c) => String((grid[f] || [])[c] ?? '').trim()
  const enc = grid.findIndex((f) => String(f?.[0] ?? '').trim() === 'Mes'
    && (f || []).includes('Banco') && (f || []).includes('Proyectado'))
  if (enc < 0) return []
  const col = grid[enc].indexOf('Banco')
  const total = enc + 1 + meses + 1 // 1-based: encabezado, doce meses, total
  // El calendario es el otro cuadro que escribe en esta columna. Se lo ubica por su encabezado y por
  // el rótulo de su fila de total, que es donde termina: sin las dos referencias no se busca ahí.
  const cal = grid.findIndex((f) => String(f?.[0] ?? '').trim() === 'Período' && (f || []).includes('TOTAL'))
  const tablas = [[total, total]]
  if (cal >= 0 && cal < enc) tablas.push([cal + 2, enc])
  if (!celda(total - 1, 0)) return []
  return Array.from({ length: meses }, (_, i) => ({ fila: enc + 2 + i, col, tabla: tablas }))
}

/**
 * NÚCLEO PURO: el veredicto de una lista DECLARADA de candidatas. Devuelve las dos listas, siempre —
 * un limpiador que sólo informa lo que va a borrar esconde justo lo que hay que revisar.
 *
 * @returns {{vaciables:Array, conservadas:Array}}
 */
export function residuosDeclarados(grid = [], candidatas = []) {
  const todas = candidatas.map((c) => copiaHuerfana(grid, c))
  return {
    vaciables: todas.filter((x) => x.gemelo !== null),
    conservadas: todas.filter((x) => x.gemelo === null),
  }
}
