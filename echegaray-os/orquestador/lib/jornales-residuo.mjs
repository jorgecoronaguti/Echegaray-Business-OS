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
 * NÚCLEO PURO: TODAS las filas cuyo renglón es el encabezado «Mes … Banco … Proyectado».
 *
 * ═══ POR QUÉ "TODAS" Y NO `findIndex` (15/08) ═══
 *
 * Esta pestaña tiene DOS cuadros con ese encabezado, carácter por carácter: «2 · OFICINA — SUELDOS
 * POR MES» y «3 · DIRECCIÓN — RETIROS MENSUALES DE LOS SOCIOS». Es a propósito —son la misma tabla
 * para dos poblaciones, y el generador los emite con la misma lista de columnas—, pero `findIndex`
 * devuelve el primero y se queda ahí: la columna «Banco» del cuadro de Dirección nunca fue candidata
 * de nada. Medido en el archivo vivo, ahí adentro estaba `F88 = "Básico convenio"` —el encabezado de
 * la columna F del bloque 4.1, que hoy vive ocho filas más abajo, en F96— publicado en el renglón de
 * Diciembre de los retiros de los socios.
 *
 * Es la misma falla que dejó la columna N fuera del auditor de pantalla y OBRAS fuera del censo: un
 * control que sólo mira la primera coincidencia informa lo mismo que uno que revisó todo.
 *
 * @returns {number[]} índices 0-based de la grilla
 */
export function encabezadosDeMesBanco(grid = []) {
  const out = []
  ;(grid || []).forEach((f, i) => {
    if (String(f?.[0] ?? '').trim() === 'Mes' && (f || []).includes('Banco') && (f || []).includes('Proyectado')) out.push(i)
  })
  return out
}

/**
 * NÚCLEO PURO: dónde termina un bloque que arranca en la fila `enc` (0-based) — su fila de TOTAL.
 *
 * El total de cada cuadro de esta pestaña se rotula con `⇒` en la columna A (`patron-pestana.total`).
 * Sin fila de total no se devuelve un tope inventado: se devuelve -1 y quien pregunta no busca ahí.
 * Un rango que se estira "hasta donde sea" es cómo un gemelo se encuentra en otra tabla.
 *
 * @returns {number} fila 1-based del total, o -1
 */
export function finDeBloque(grid = [], enc = 0, tope = 40) {
  for (let i = enc + 1; i < Math.min(grid.length, enc + 1 + tope); i++) {
    if (String(grid[i]?.[0] ?? '').trim().startsWith('⇒')) return i + 1
  }
  return -1
}

/**
 * NÚCLEO PURO: LAS CANDIDATAS DE LA COLUMNA «Banco» DEL BLOQUE 3 (DIRECCIÓN) — LAS QUE NADIE MIRABA.
 *
 * ═══ QUÉ HAY AHÍ, Y CONTRA QUÉ SE PRUEBA ═══
 *
 * Igual que en Oficina, la «Banco» de Dirección es columna de CARGA del dueño: el generador emite
 * cadena vacía —"no es mía, preservá lo que haya"— y esa protección no se afloja. Lo que quedó
 * adentro es residuo del rediseño del 13/08, que corrió los bloques ocho filas hacia abajo:
 *
 *   F88  "Básico convenio"   ← el encabezado vivo de esa misma columna está en F96, adentro del 4.1
 *
 * LA TABLA DONDE SE BUSCA EL GEMELO ES EL BLOQUE 4.1, no el propio cuadro de Dirección, y es la
 * diferencia con Oficina: en Oficina el residuo venía del calendario y de su propia fila de total —
 * dos cuadros que escriben en ESA columna—; acá viene del cuadro que HOY ocupa la columna F más
 * abajo. La prueba es la misma de siempre y no se afloja: la misma cosa, viva, hoy, en la misma
 * columna, adentro de una tabla que el generador sí posee.
 *
 * FALLA CERRADO: sin el segundo encabezado, sin fila de total o sin el bloque 4.1, devuelve lista
 * vacía y no se toca una sola celda.
 *
 * @param {any[][]} grid la pestaña leída con render FORMULA
 * @param {number} meses cuántas filas de mes tiene el bloque
 * @returns {{fila:number, col:number, tabla:number[][]}[]}
 */
export function candidatasDeBancoDireccion(grid = [], meses = 12) {
  const enc = encabezadosDeMesBanco(grid)[1] ?? -1
  if (enc < 0) return []
  const col = grid[enc].indexOf('Banco')
  const total = enc + 1 + meses + 1 // 1-based: encabezado, doce meses, total
  if (!String((grid[total - 1] || [])[0] ?? '').trim()) return []
  // El 4.1 se ubica por su propio encabezado —«Categoría … Básico convenio»— y termina en su total.
  const p41 = (grid || []).findIndex((f) => String(f?.[0] ?? '').trim() === 'Categoría' && (f || []).includes('Básico convenio'))
  const tablas = [[total, total]]
  const fin41 = p41 > enc ? finDeBloque(grid, p41) : -1
  if (fin41 > 0) tablas.push([p41 + 1, fin41])
  return Array.from({ length: meses }, (_, i) => ({ fila: enc + 2 + i, col, tabla: tablas }))
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
  const enc = encabezadosDeMesBanco(grid)[0] ?? -1
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

/**
 * LA COLUMNA «Convenio (tuya)» ROTA — residuo que el limpiador por filas fijas no puede ver.
 *
 * ═══ POR QUÉ HACE FALTA (31/08/2026) ═══
 *
 * `CANDIDATAS` nombra celdas por su coordenada —E76, E79— y el bloque 4.1 se corrió a la 96 cuando
 * la pestaña creció. Desde entonces el residuo real vivía en E98:E100 y ningún control lo nombraba:
 * la pestaña publicaba **seis `#REF!`** en la fila del plantel vigente, que es la que dice cuánta
 * gente hay y cuánto cuesta. Es exactamente la trampa que este repo tiene escrita para las filas,
 * cometida sobre una lista de filas.
 *
 * ═══ LA PRUEBA, Y POR QUÉ NO PUEDE CONFUNDIR UNA CELDA DEL DUEÑO ═══
 *
 * «Convenio (tuya)» es SU columna desde el 07/08: ahí él escribe el nombre de una categoría —texto—
 * para forzar la equivalencia. Nunca una fórmula. Así que se propone vaciar sólo lo que cumple las
 * dos condiciones a la vez:
 *
 *   1. el contenido ES una fórmula (empieza con `=`), y
 *   2. su valor publicado ES un error.
 *
 * Una fórmula rota en una columna de texto del dueño no puede ser suya, y aunque lo fuera no le
 * sirve: está en error. Todo lo demás de esa columna se conserva, incluso una fórmula que funcione.
 *
 * Se ancla al RÓTULO en las dos dimensiones —la fila por el encabezado «Categoría», la columna por
 * «Convenio (tuya)»— y termina en la fila de total, que empieza con «⇒».
 *
 * @param {any[][]} formulas la pestaña leída con render FORMULA
 * @param {any[][]} valores  la MISMA pestaña con sus valores publicados
 * @returns {{fila:number, col:number, contenido:string, valor:string}[]} en base 1
 */
export function candidatasDeConvenioRoto(formulas = [], valores = []) {
  const enc = formulas.findIndex((f) => String(f?.[0] ?? '').trim() === 'Categoría'
    && (f || []).some((c) => String(c ?? '').trim() === 'Convenio (tuya)'))
  if (enc < 0) return []
  const col = formulas[enc].findIndex((c) => String(c ?? '').trim() === 'Convenio (tuya)')
  if (col < 0) return []
  const out = []
  for (let i = enc + 1; i < formulas.length; i++) {
    const rotulo = String(formulas[i]?.[0] ?? '').trim()
    // El bloque termina en su fila de total. Sin rótulo tampoco se sigue: se acabó la tabla.
    if (!rotulo) break
    const contenido = String(formulas[i]?.[col] ?? '')
    const valor = String(valores[i]?.[col] ?? '')
    if (rotulo.startsWith('⇒')) { if (esError(valor) && contenido.startsWith('=')) out.push({ fila: i + 1, col, contenido, valor }); break }
    if (contenido.startsWith('=') && esError(valor)) out.push({ fila: i + 1, col, contenido, valor })
  }
  return out
}

/** Los errores que publica Sheets. `#REF!` es el que deja una fórmula circular o una hoja borrada. */
export const esError = (v) => /^#(REF!|VALUE!|N\/A|NAME\?|¿NOMBRE\?|DIV\/0!|NUM!|ERROR!)/.test(String(v ?? '').trim())
