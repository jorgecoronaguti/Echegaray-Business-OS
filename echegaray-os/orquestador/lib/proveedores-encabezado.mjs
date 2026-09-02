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
import { ALERTA } from './glifos.mjs'
import {
  formulaPagadasSinImporte, formulaParcial1Sospechoso, formulaProveedoresSinImporte,
} from './deuda-por-tramos.mjs'

/** Rótulos de la izquierda, sin el prefijo numérico: el prefijo es del ordenamiento, no de la vista. */
export const FILAS_AGING = Object.freeze(
  [...TRAMOS.map((t) => t.rotulo), SIN_FECHA].map((r) => r.replace(/^\d+\s*·\s*/, '')))

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
  get arca() { return this.totalAging },
  // ═══ LA FILA 12 SE QUEDA DONDE ESTABA, Y CAMBIA LO QUE DICE (18/08) ═══
  //
  // Publicaba «Dicen "Pagado" y falta plata · $11.919.063 · 8 facturas» pegado al TOTAL. Esa plata no
  // se debe, y el dueño lo reclamó tres veces. La primera corrección BORRÓ la fila entera, y eso fue
  // el segundo error: *"no has respetado el diseño q tenía"*. El cuadro tiene su forma —el aging a la
  // izquierda, el medio de pago a la derecha, una línea colgando del total y el control al pie— y esa
  // forma es del dueño, no del hallazgo que la ocupaba.
  //
  // Lo que queda en la fila es lo que SÍ es cierto de esas ocho: están pagadas y NO tienen registrado
  // con cuánto. Eso no es deuda —es carga incompleta— y por eso la línea lleva el CONTEO y no un
  // importe: un número en pesos colgado del total se lee como deuda diga lo que diga el rótulo, que
  // es exactamente cómo se llegó acá.
  get sinImporte() { return this.totalAging + 1 },
  get control() { return this.totalAging + 2 },
  get fin() { return this.control },
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
export const ESPECIES = Object.freeze(['texto', 'monto', 'montoTotal', 'porcentaje', 'entero'])

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
  set(F.bajada, 0, 'Deuda comercial por proveedor. Cada importe es una fórmula sobre Compras: se corrige allá y cambia acá.')

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

  // ── PAGADAS SIN EL IMPORTE CARGADO — carga incompleta, no deuda.
  //
  // `Estado` dice "Pagado" y los dos tramos de pago (`Monto Pagado` + `Monto Parcial 2`) suman cero.
  // La factura está saldada —lo declaró el dueño tipeando el estado— pero la planilla no sabe cuánta
  // plata salió, y eso sí le importa a CAJA: ese egreso no tiene importe con el cual imputarse.
  //
  // VA SIN MONTO, A PROPÓSITO. El conteo manda a mirar; un importe al lado del TOTAL se suma con la
  // vista aunque el rótulo diga otra cosa. El triángulo sólo se enciende si hay alguna.
  set(F.sinImporte, 0, `=IF($D$${F.sinImporte}=0;"";"${ALERTA} ")&"Pagadas sin registrar con cuánto — CAJA no las puede imputar"`)
  set(F.sinImporte, 3, formulaPagadasSinImporte(), 'entero')
  // Y a quiénes, para poder preguntar sin abrir Compras.
  set(F.sinImporte, 5, formulaProveedoresSinImporte())

  // ── lo que la deuda NO ve: facturado con CAE que Compras no tiene cargado
  //
  // ═══ UNA CELDA QUE PROMETE PLATA NO PUEDE MOSTRAR UN COMPROBANTE (14/08/2026) ═══
  //
  // EL DEFECTO, medido en el archivo vivo: `ARCA_SIN_CARGAR_MONTO` vive hoy en `Materiales!B53`, que
  // publica `0038-00025483` — un número de comprobante. Estas dos celdas son sus ÚNICOS lectores, así
  // que la posición mostraba ese comprobante bajo el rótulo "Saldo" y un CUIT bajo "%". No es un
  // número equivocado: es un dato de otra especie dibujado como si fuera plata.
  //
  // La causa —un rango con nombre fosilizado en otra pestaña que nadie reapunta ni retira— se cura en
  // `lib/rangos-nombrados.mjs`. Esto es la otra mitad, y hace falta igual: mientras el nombre exista
  // apuntando a cualquier lado, el que lo cita a ciegas publica lo que haya. Un lector que confía en
  // que su fuente dice la verdad es el mismo defecto una capa más arriba.
  //
  // LA REGLA: si el número que el rótulo promete no está disponible, la celda muestra "—" y el rótulo
  // lo DICE. Publicar un comprobante donde se promete plata es peor que no publicar nada; publicar
  // "—" sin avisar por qué es la mitad del trabajo, porque un guion se lee como "no hay deuda".
  // `IFERROR` cubre el nombre retirado (#NAME?) e `ISNUMBER`, el nombre vivo apuntando a basura.
  const arcaMonto = `IFERROR(IF(ISNUMBER(ARCA_SIN_CARGAR_MONTO);ARCA_SIN_CARGAR_MONTO;"—");"—")`
  // EL RÓTULO NO PUEDE DERRAMAR: G y H de esta fila llevan el monto y el conteo, así que lo que no
  // entra en los 210px de la F se corta y no se lee. Decía "Facturado por ARCA que Compras no tiene
  // — hoy no se puede medir" (65 caracteres; entran 40). El "por qué no se puede medir" se mudó a la
  // nota de la celda del monto, que es donde se va a mirar cuando el número diga "—".
  set(F.arca, 5, `=IF(ISNUMBER($G$${F.arca});"ARCA que Compras no tiene";"${ALERTA} ARCA: hoy no se puede medir")`)
  set(F.arca, 6, `=${arcaMonto}`, 'monto')
  set(F.arca, 7, '=IFERROR(IF(ISNUMBER(ARCA_SIN_CARGAR_N);ARCA_SIN_CARGAR_N;"—");"—")', 'entero')

  // ── el control: dos caminos independientes al mismo total.
  // El aging suma por tramo de vencimiento; el medio de pago suma por instrumento. Si difieren, una
  // factura tiene saldo y no cae en ningún tramo, o cae en un medio que nadie declaró.
  set(F.control, 0, `=IF(ROUND($B$${F.totalAging}-$G$${F.totalMedios};0)=0;"✓ el aging y el medio de pago dan el mismo total";"✗ difieren en "&TEXT($B$${F.totalAging}-$G$${F.totalMedios};"$#,##0")&" — hay deuda que un cuadro ve y el otro no")`)

  // ── LA PREGUNTA QUE LA ARITMÉTICA NO PUEDE CONTESTAR SOLA (19/08/2026) ────────────────────────
  //
  // «Lo que se debe» es `Total − Monto Pagado − Monto Parcial 2`. NO resta `Monto Parcial 1`, y eso
  // está medido: de las 1.136 filas de Compras, 716 tienen ahí la fórmula derivada `=T−O` —negativa
  // mientras la factura no se pagó— y sólo 302 un valor tipeado. Restarla convertía la columna en un
  // tramo de pago que no es, y era la SEGUNDA definición de la deuda que hacía que el control de
  // abajo contradijera al cuadro de arriba.
  //
  // Pero cuando alguien SÍ tipea un importe positivo ahí sobre una factura pendiente, la fila se
  // contradice a sí misma y el saldo publicado puede estar de más. Hoy hay una: Ruviño Matías
  // Esteban, $136.000, con «Total o Parcial» = *Total* y «Estado» = *Pendiente*. O ya se pagó y falta
  // el estado, o el importe va en «Monto Pagado».
  //
  // Esa respuesta la tiene quien cargó la factura, no esta planilla. Va a la vista, con nombre y
  // monto, en vez de que el archivo elija en silencio una de las dos y borre la pregunta.
  // VA EN LA F Y DERRAMA SOBRE G Y H, que en esta fila están vacías — el mismo recurso que usa la
  // línea de arriba para los nombres. Partirlo en "rótulo | detalle" obligaba a meter 180 caracteres
  // en los 390px de la G, y un hallazgo cortado a la mitad no se puede accionar.
  set(F.control, 5, formulaParcial1Sospechoso())
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
