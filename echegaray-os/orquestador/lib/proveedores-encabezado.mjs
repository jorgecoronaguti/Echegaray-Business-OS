// EL ENCABEZADO DE PROVEEDORES — la posición, al estándar de una mesa financiera.
//
// ═══ QUÉ TENÍA DE MALO EL ANTERIOR ═══
//
// 1. NO TENÍA AGING. Ocho líneas contando cuánto se debe y por qué medio se paga, y ni una sola
//    diciendo CUÁNDO vence. Una posición de cuentas a pagar sin vencimiento no se puede usar para
//    decidir: un saldo chico vencido hace 40 días no pesa lo mismo que uno grande a 60 días.
// 2. UNA COLUMNA DE PROSA POR FILA. Doscientos caracteres de explicación al lado de cada número. El
//    dueño las borra a mano una y otra vez —lo dijo textual— y volvían en la corrida siguiente.
//    Acá no hay columna de comentarios: el número que necesita párrafo está mal elegido.
// 3. FÓRMULAS DE 400 CARACTERES. Cada línea repetía cuatro SUMIFS con seis criterios para
//    reconstruir el saldo pendiente. Ese saldo YA lo calcula `Compras!AL` fila por fila desde que
//    existe la columna derivada. Cada línea es ahora un SUMIF sobre AL: se lee, se audita y si el
//    criterio de "qué es deuda" cambia, cambia en UN solo lugar.
// 4. CLASIFICACIÓN INCONSISTENTE. Llamaba "comprometido" al cheque y "directa" al echeq, que es un
//    cheque electrónico. Se reemplaza por el medio de pago tal cual está cargado, sin juicio: quién
//    ya entregó el instrumento se sabe en Cheques Emitidos, no en el "Tipo pago" de Compras.
//
// ═══ LA GEOMETRÍA ═══
//
// Dos bloques uno al lado del otro —el aging a la izquierda, el medio de pago a la derecha— en vez
// de trece líneas apiladas. El encabezado entero entra en la primera pantalla, que es la única que
// alguien mira.

import { TRAMOS, SIN_FECHA } from './proveedores-aging.mjs'
import { formulaPagadasSinImporte, formulaParcial1Monto } from './deuda-por-tramos.mjs'

/** Rótulos de la izquierda, sin el prefijo numérico: el prefijo es del ordenamiento, no de la vista. */
export const FILAS_AGING = Object.freeze(
  [...TRAMOS.map((t) => t.rotulo), SIN_FECHA].map((r) => r.replace(/^\d+\s*·\s*/, '')))

/**
 * A2: LA ÚNICA PROSA ADMITIDA, Y TIENE TOPE.
 *
 * El contrato (`diseno-unificado.mjs`) pide «qué contesta · de dónde sale · a qué fecha» en 120
 * caracteres. La anterior —«Deuda comercial por proveedor. Cada importe es una fórmula sobre Compras:
 * se corrige allá y cambia acá.»— explicaba cómo se edita la pestaña, que es una instrucción y no una
 * procedencia. La fecha no se tipea: el corte es el de la columna derivada de Compras, viva.
 */
export const SUBTITULO = 'Qué se le debe a cada proveedor y cuándo sale · Compras (saldo, vencimiento y medio de pago) · al día'

/** Medios de pago. El criterio es UNO: el `Tipo pago` de Compras, sin reinterpretarlo. */
export const MEDIOS = Object.freeze([
  { rotulo: 'Cheque y echeq', criterios: ['Cheque', 'Echeq'] },
  { rotulo: 'Tarjeta de crédito', criterios: ['Tarjeta*'] },
  { rotulo: 'Transferencia', criterios: ['Transferencia'] },
  { rotulo: 'Efectivo', criterios: ['Efectivo'] },
])

const SALDO = 'Compras!$AL$4:$AL'
const TRAMO = 'Compras!$AN$4:$AN'
const MEDIO = 'Compras!$P$4:$P'

/** Fila donde arranca cada cosa. El bloque ocupa 1..FIN y nunca una fila más. */
export const F = Object.freeze({
  titulo: 1, bajada: 2, rotulos: 4, primerTramo: 5,
  get ultimoTramo() { return this.primerTramo + FILAS_AGING.length - 1 },
  get totalAging() { return this.ultimoTramo + 1 },
  get primerMedio() { return this.rotulos + 1 },
  get totalMedios() { return this.primerMedio + MEDIOS.length },
  // ═══ LAS DOS FILAS DE ABAJO SON CONTROLES: RÓTULO A LA IZQUIERDA, NÚMERO A LA DERECHA (09/09/2026) ═══
  //
  // Hasta hoy eran cuatro ORACIONES. La 12 decía «▲ Pagadas sin registrar con cuánto — CAJA no las
  // puede imputar» con el conteo tres columnas más allá; la 13, «✗ difieren en $279.586 — hay deuda
  // que un cuadro ve y el otro no» y, en la F, «2 factura(s) pendientes con $108.272 cargado en
  // «Monto Parcial 1» (Corralon Progreso)» — 180 caracteres derramando sobre G y H.
  //
  // El dueño (05/09): *«minimalismo extremo, sin aclaraciones ni explicaciones de nada»*. Un control
  // no necesita una oración: necesita decir QUÉ se está midiendo y CUÁNTO da. El rojo lo pone el
  // formato (`MONEDA_CONTROL` / `CONTADOR_CONTROL`) y sólo cuando el número no es cero, así que un
  // control que cierra se ve como una raya gris y no pide atención.
  //
  // LO QUE SE PIERDE, DICHO: los NOMBRES (qué proveedores) ya no se publican. El rótulo dice
  // exactamente con qué filtro se encuentran en Compras, que es donde hay que ir a arreglarlas —
  // publicar la lista en la celda era lo que obligaba a los 180 caracteres.
  get cuadratura() { return this.totalAging + 1 },
  get carga() { return this.totalAging + 2 },
  get fin() { return this.carga },
})

// ═══ LA ESPECIE DE CADA CELDA SE DECLARA DONDE SE ESCRIBE SU VALOR (14/08/2026) ═══
//
// EL DEFECTO. `Proveedores!B12` publicaba `11919062,68`: coma decimal, sin separador de miles y sin
// símbolo, en la única columna de la pestaña donde todo lo demás sale como "$15.097.040". No era un
// número mal calculado: era un número al que nadie le dio formato. El aplicador pintaba
// `F.primerTramo..finAging`, `F.totalAging`, los medios y `F.arca` — una lista de rangos escrita a
// mano— y `F.noMostrada`, que nació después, no estaba en ninguna. Sin formato propio la celda se
// queda con el del reset base, que es TEXTO: un número con formato de texto se dibuja crudo.
//
// LA CAUSA NO ES QUE FALTE UNA LÍNEA, ES QUE HAY DOS LISTAS. El valor se escribe acá y su formato,
// doscientas líneas más allá, en otro archivo. Dos lugares que tienen que decir lo mismo sobre la
// misma celda divergen apenas alguien agrega una fila — y divergieron. Es la misma clase de defecto
// que ya se pagó con los rótulos de ARCA escritos dos veces.
//
// LA REGLA: quien escribe el valor DECLARA su especie, en la misma línea. `celdasEncabezado()` es la
// fuente única y `grillaEncabezado()` es su proyección a valores. El aplicador ya no mantiene una
// lista de rangos: deriva el `numberFormat` de la especie declarada acá. Una fila nueva que escriba
// un número sin declarar especie no se dibuja mal — no compila el contrato, y `encabezadoSinFormato`
// (probado en el test) la delata.
/** Las especies que sabe dibujar el aplicador. Agregar una acá obliga a darle formato allá. */
export const ESPECIES = Object.freeze([
  'texto', 'monto', 'montoTotal', 'porcentaje', 'entero',
  // Las dos especies de CONTROL: mismo número, y el rojo del formato sólo cuando no da cero.
  'control', 'controlEntero',
])

/**
 * EL ENCABEZADO COMO CELDAS `{v, t}` — la fuente única de valor Y especie.
 *
 * `null` = celda que se limpia. Ni un solo importe escrito: todo sale de Compras por fórmula.
 * @returns {({v:string, t:string}|null)[][]}
 */
export function celdasEncabezado() {
  const g = Array.from({ length: F.fin }, () => Array.from({ length: 8 }, () => null))
  const set = (fila, col, v, t = 'texto') => {
    if (!ESPECIES.includes(t)) throw new Error(`especie desconocida "${t}" en la fila ${fila}, columna ${col}`)
    g[fila - 1][col] = { v, t }
  }

  set(F.titulo, 0, 'Proveedores')
  set(F.bajada, 0, SUBTITULO)

  // ── izquierda: el aging
  set(F.rotulos, 0, '="DEUDA AL "&TEXT(TODAY();"dd/mm/yyyy")')
  set(F.rotulos, 1, 'Saldo')
  set(F.rotulos, 2, '%')
  set(F.rotulos, 3, 'Facturas')
  FILAS_AGING.forEach((rotulo, i) => {
    const f = F.primerTramo + i
    set(f, 0, rotulo)
    // El comodín engancha "1 · Vencido" con "Vencido": el prefijo ordena, no se muestra.
    set(f, 1, `=SUMIF(${TRAMO};"*"&$A${f};${SALDO})`, 'monto')
    set(f, 2, `=IF($B$${F.totalAging}=0;0;$B${f}/$B$${F.totalAging})`, 'porcentaje')
    set(f, 3, `=COUNTIF(${TRAMO};"*"&$A${f})`, 'entero')
  })
  set(F.totalAging, 0, 'TOTAL')
  set(F.totalAging, 1, `=SUM($B${F.primerTramo}:$B${F.ultimoTramo})`, 'montoTotal')
  set(F.totalAging, 2, `=IF($B$${F.totalAging}=0;0;1)`, 'porcentaje')
  set(F.totalAging, 3, `=SUM($D${F.primerTramo}:$D${F.ultimoTramo})`, 'entero')

  // ── derecha: por qué medio sale
  set(F.rotulos, 5, 'CÓMO SE PAGA')
  set(F.rotulos, 6, 'Saldo')
  set(F.rotulos, 7, '%')
  MEDIOS.forEach((m, i) => {
    const f = F.primerMedio + i
    set(f, 5, m.rotulo)
    set(f, 6, '=' + m.criterios.map((c) => `SUMIF(${MEDIO};"${c}";${SALDO})`).join('+'), 'monto')
    set(f, 7, `=IF($G$${F.totalMedios}=0;0;$G${f}/$G$${F.totalMedios})`, 'porcentaje')
  })
  set(F.totalMedios, 5, 'TOTAL')
  set(F.totalMedios, 6, `=SUM($G${F.primerMedio}:$G${F.primerMedio + MEDIOS.length - 1})`, 'montoTotal')
  set(F.totalMedios, 7, `=IF($G$${F.totalMedios}=0;0;1)`, 'porcentaje')

  // ── LOS DOS CONTROLES DEL PIE ────────────────────────────────────────────────────────────────
  //
  // 1. CUADRATURA. El aging suma por tramo de vencimiento; el medio de pago suma por instrumento.
  //    Son dos caminos independientes al mismo total: si difieren, una factura tiene saldo y no cae
  //    en ningún tramo, o cae en un medio que nadie declaró. `ROUND(…;0)` para que una diferencia de
  //    fracciones de centavo no encienda el rojo con los datos perfectos.
  set(F.cuadratura, 0, '⇒ Aging − medio de pago')
  set(F.cuadratura, 1, `=ROUND($B$${F.totalAging}-$G$${F.totalMedios};0)`, 'control')

  // 2. CARGA INCOMPLETA. `Estado` dice "Pagado" y los dos tramos de pago (`Monto Pagado` + `Monto
  //    Parcial 2`) suman cero: la factura está saldada —lo declaró el dueño tipeando el estado— pero
  //    la planilla no sabe cuánta plata salió, y ese egreso no tiene importe con el cual imputarse en
  //    CAJA. VA COMO CONTEO Y NO COMO IMPORTE: un número en pesos al lado del TOTAL se lee como deuda
  //    diga lo que diga el rótulo, y así se llegó al reclamo del 18/08.
  set(F.carga, 0, '⇒ Pagadas sin el importe cargado')
  set(F.carga, 1, formulaPagadasSinImporte(), 'controlEntero')

  // 3. LA CONTRADICCIÓN QUE LA ARITMÉTICA NO PUEDE RESOLVER SOLA (19/08/2026).
  //
  //    «Lo que se debe» es `Total − Monto Pagado − Monto Parcial 2`. NO resta `Monto Parcial 1`, y eso
  //    está medido: de las 1.136 filas de Compras, 716 tienen ahí la fórmula derivada `=T−O` y sólo
  //    302 un valor tipeado. Restarla convertía la columna en un tramo de pago que no es.
  //
  //    Pero cuando alguien SÍ tipea un importe positivo ahí sobre una factura pendiente, la fila se
  //    contradice a sí misma y el saldo publicado puede estar de más. ESTE NÚMERO EXPLICA EL ÚNICO
  //    HUECO VIVO DE LA PESTAÑA: medido el 09/09 son $108.272 en dos facturas de Corralón Progreso,
  //    que es exactamente lo que separa el TOTAL del aging ($16.838.465) de la deuda neta que suma el
  //    cuadro por día ($16.730.193) — el aging no ve un saldo negativo porque no le asigna tramo.
  set(F.carga, 5, '⇒ Pendientes con «Monto Parcial 1»')
  set(F.carga, 6, formulaParcial1Monto(), 'control')

  return g
}

/**
 * El encabezado como grilla de 8 columnas (A..H). `null` = celda que se limpia.
 * Es la PROYECCIÓN a valores de `celdasEncabezado()`: una sola fuente, dos vistas.
 * @returns {(string|null)[][]}
 */
export function grillaEncabezado() {
  return celdasEncabezado().map((f) => f.map((c) => (c === null ? null : c.v)))
}

/**
 * ¿QUÉ FÓRMULA NUMÉRICA DEL ENCABEZADO QUEDÓ SIN ESPECIE? — el control que impide que vuelva.
 *
 * Una celda que empieza con `=` y no es texto declarado tiene que decir qué especie devuelve, porque
 * de eso sale su `numberFormat`. Distinguir "fórmula que da un número" de "fórmula que da un rótulo"
 * sin evaluarla es imposible, así que la heurística mira la FORMA: las de esta pestaña que devuelven
 * texto arrancan con IF/CONCAT sobre literales entre comillas o son un `="..."&...`. Lo que suma,
 * cuenta o divide, devuelve número.
 *
 * No pretende ser un tipador: pretende que nadie agregue un `=SUM(...)` sin decir que es plata y se
 * entere seis semanas después mirando `11919062,68` en la pestaña.
 *
 * @param {({v:string, t:string}|null)[][]} [celdas]
 * @returns {{fila:number, col:number, v:string}[]}
 */
export function encabezadoSinFormato(celdas = celdasEncabezado()) {
  const NUMERICA = /^=\s*(SUM|SUMIF|SUMIFS|SUMPRODUCT|COUNT|COUNTA|COUNTIF|COUNTIFS|ROUND|ABS|MIN|MAX|AVERAGE)\b/i
  const out = []
  celdas.forEach((fila, i) => (fila || []).forEach((c, j) => {
    if (!c || c.t !== 'texto') return
    const v = String(c.v ?? '')
    // El `=IF(ISNUMBER(...)` de la línea de ARCA devuelve un rótulo: la forma lo delata sola.
    if (NUMERICA.test(v) || /^=\s*IF\s*\([^;]*;\s*(SUM|COUNT)/i.test(v)) out.push({ fila: i + 1, col: j, v })
  }))
  return out
}
