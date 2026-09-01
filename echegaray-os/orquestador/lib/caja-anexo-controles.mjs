// LOS CONTROLES DE CAJA — EL DETALLE, QUE VIVE EN `_CAJA_ANEXO`.
//
// POR QUÉ ESTÁN ACÁ Y NO EN CAJA (05/08/2026). El dueño, tres veces: *"quiero toda una caja nueva…
// está pésima… minimalista y de clase mundial"*. Dos rondas de mejoras incrementales no lo movieron
// porque el problema no eran los defectos: era que la vista del ANALISTA —setenta renglones de
// conciliaciones— y la del CFO —cuatro cifras y un calendario— compartían pantalla. Ninguna
// verificación desaparece: cambia de pestaña, y CAJA publica su veredicto en una línea.
//
// NINGÚN CONTROL SE VALIDA CONTRA LA INFORMACIÓN QUE PRODUCE. Es la regla que gobierna este archivo
// entero y la razón por la que estos bloques miran SIEMPRE una fuente que CAJA no genera: el extracto
// del banco (`_BANCO_RAW`), Cobranzas, la pestaña de cheques, el cuadro del Cash Flow Mensual.
//
// LAS REFERENCIAS A CAJA SON POR NOMBRE, NUNCA POR CELDA. Ver caja-anexo-nombres.mjs: es lo que hace
// posible que el anexo cambie de forma sin romper CAJA y al revés.

import * as BANCO from './banco-santander.mjs'
import { formulaJornalesEfectivoPosteriores, formulaOficinaEfectivoPosteriores, formulaExtraccionesEfectivoPosteriores, celdaFechaDelEfectivo } from './caja-posterior-al-corte.mjs'
import { terminoLibro } from './libro-sumas.mjs'
import { DESDE_CAJA, ANEXO } from './caja-anexo-nombres.mjs'
import { formulaEgresoDiario } from './egreso-diario.mjs'
import { esIndistinguible } from './cobranzas-duplicado.mjs'
import * as CONC from './conciliacion-por-naturaleza.mjs'
import { MARCAS, expresionTieneNumero } from './cheques-cobertura.mjs'
import { formulaChequesSinFactura } from './cash-flow-lineas.mjs'
import { ALERTA, comparaMarca } from './glifos.mjs'
// Los rangos de "Cheques Emitidos" se armaban acá a mano —`'…'!$K$2:$K$400`— y arrancaban en la 2,
// o sea adentro de la banda de rótulos. La fila de arranque vive en un solo archivo.
import { rangoEn } from './cheques-emitidos-geometria.mjs'
import {
  ESTADOS, ESPERADOS, formulaTotalEstado, formulaCantidadEstado,
  formulaEstadoDesconocido, formulaUltimoCobroRegistrado,
} from './cobranzas-cartera.mjs'

/**
 * A partir de cuántos días sin registrar un cobro, un "no hay nada vencido" deja de ser una buena
 * noticia y pasa a ser un aviso de que nadie está cargando. Diez y no treinta: Cobranzas recibe
 * movimientos varias veces por semana, y a los treinta el mes ya cerró y el aviso llega tarde.
 */
export const DIAS_SIN_CARGA = 10

/** La MISMA definición de "dos cobros que no se pueden distinguir" que usa la pestaña Cobranzas. */
const INDIST_COB = esIndistinguible('Cobranzas', 5, 400)

/**
 * A4 · DÍAS DE LIQUIDEZ Y CAJA MÍNIMA — hasta cuándo alcanza si no entrara un peso más.
 *
 * EL RITMO SALE DE TODO LO QUE SE PAGA, NO SÓLO DE COMPRAS. Compras es DEVENGADO (una factura a 60
 * días entra el día que se carga, no el día que se paga) y deja afuera sueldos, cargas, impuestos y
 * deuda financiera: ~$34M/mes que sí salen de la cuenta. Sale del egreso total del Cash Flow Mensual
 * promediando los meses ya cerrados. Ver lib/egreso-diario.mjs.
 *
 * @param {{push:Function, refs:object}} h
 */
export function bloqueLiquidez(h) {
  const { push, refs } = h
  push(['A4 · DÍAS DE LIQUIDEZ Y CAJA MÍNIMA — hasta cuándo alcanza si no entra un peso'])
  const egr90 = 'SUMIFS(Compras!$O$4:$O;Compras!$AD$4:$AD;">="&TODAY()-90;Compras!$AD$4:$AD;"<="&TODAY())'
  const fRitmo = push(['Egreso promedio por día (meses cerrados, todas las fuentes)', 'ARS',
    `=${formulaEgresoDiario(egr90)}`, '', `=C${h.n + 1}`, '=TODAY()', ''])
  const fDias = push(['⇒ Días de caja, si no entrara nada más', '',
    `=IF(C${fRitmo}<=0;"";ROUND(${DESDE_CAJA.total}/C${fRitmo};0))`, '', '', '', ''])
  const fMin = push(['Caja mínima deseada (01_Valores Iniciales)', '', '', '', `=N(${DESDE_CAJA.minima})`, '', ''])

  // ═══ EL AVISO DEL PRESENTE VA ANTES QUE EL DEL FUTURO ═══
  //
  // La pestaña se contradecía en dos filas: arriba "3 días de caja" y abajo "primer mes por debajo del
  // mínimo: septiembre". Las dos salían de datos correctos, pero la de septiembre mira el CIERRE
  // PROYECTADO de cada mes —que espera cobros que todavía no entraron— y tranquilizaba sobre un
  // presente que ya estaba abajo del mínimo. Esta fila responde con una FRASE (va a la columna G, que
  // es de texto: una frase en una columna de plata es el defecto `texto_en_numero`).
  push(['⇒ ¿HOY estamos por debajo de la caja mínima?', '', '', '', '', '',
    `=IF(N(${DESDE_CAJA.minima})=0;"${ALERTA} falta cargar la caja mínima";`
    + `IF(${DESDE_CAJA.total}<${DESDE_CAJA.minima};"${ALERTA} SÍ — faltan "&TEXT(${DESDE_CAJA.minima}-${DESDE_CAJA.total};"$#,##0");`
    + `"no — hay "&TEXT(${DESDE_CAJA.total}-${DESDE_CAJA.minima};"$#,##0")&" de sobra"))`])

  // POR RANGO CON NOMBRE, NO POR FILA (05/08): el Mensual rediseñado ya no tiene la fila B..M de
  // cierres — publica CF_SALDO_CIERRE / CF_MESES y estos controles los consumen por nombre. Un nombre
  // ausente deja null y el aviso ruidoso de abajo; una fila contada a mano habría apuntado a otra
  // celda del layout nuevo sin un solo error.
  const rangoCierre = refs.cierre ?? null
  const rangoMes = refs.cab ?? null
  // LOS MESES SIN CIERRE NO CUENTAN: el cuadro deja en blanco los anteriores al saldo declarado y una
  // celda vacía vale 0 en una comparación. Sin el filtro `<>""`, la alerta encontraba "enero 2026" —
  // un mes que ya pasó, o sea el aviso más inútil posible.
  // `INDEX(rango;1;MATCH(…))` CON LA FILA EXPLÍCITA (06/08): desde que el Cash Flow Mensual es una
  // matriz, CF_MESES y CF_SALDO_CIERRE son FILAS de doce columnas y no columnas de doce filas. Sobre un
  // rango de una sola fila, `INDEX(rango;n)` significa "la fila n" —devuelve #REF!— y no "la columna n".
  // MATCH no cambia: da la posición lo mismo sobre una fila que sobre una columna.
  // SÓLO MIRA DE HOY EN ADELANTE (01/09): sin el filtro por mes, el MATCH agarraba el primer mes
  // NEGATIVO del año aunque ya hubiera pasado — marzo-julio 2026 estuvieron en rojo de verdad, y el
  // control apuntaba a "febrero 2026" en septiembre. Un aviso de "cuándo te quedás sin plata" que
  // señala una crisis que ya pasó es peor que inútil: contradice la caja real, que de hoy en adelante
  // sube (los cobros grandes ya están agendados). El `<>""` sólo saltea meses vacíos; este factor
  // saltea los meses CERRADOS anteriores al corte de CAJA.
  const desdeElCorte = `(EOMONTH(${rangoMes};0)>=EOMONTH(${DESDE_CAJA.fecha};0))`
  const primerMes = (cond) => (rangoCierre
    ? `=IFERROR(TEXT(INDEX(${rangoMes};1;MATCH(1;ARRAYFORMULA((${rangoCierre}<>"")*(${rangoCierre}${cond})*${desdeElCorte});0));"mmmm yyyy");"ningún mes del año")`
    : `${ALERTA} falta la línea de cierre en el Cash Flow Mensual`)
  push(['Primer mes por debajo de la caja mínima (proyección del Cash Flow)', '', '', '', '', '',
    primerMes(`<${DESDE_CAJA.minima}`)])
  push(['Primer mes con caja negativa (proyección del Cash Flow)', '', '', '', '', '', primerMes('<0')])

  // ═══ DÓNDE VA A ESTAR LA PLATA A FIN DE MES: EFECTIVO vs BANCO ═══
  //
  // El saldo de HOY, partido, más los flujos del mes clasificados por el INSTRUMENTO de cada
  // movimiento (`_MOVIMIENTOS!I`). Es la fuente que ya unifica Cobranzas + Compras + Jornales + Banco,
  // así que las dos líneas SUMAN el mismo cierre que proyecta el resto del bloque (cross-check abajo).
  //
  // LOS COBROS ESTÁN 100% CLASIFICADOS (Cobranzas: B→banco, N→efectivo). El hueco está en los EGRESOS
  // "desconocido" del mes ($39,9M el 01/09): Jornales, Cargas Sociales, Impuestos, Estructura. Regla
  // del dueño (01/09), simple por rubro: lo de Jornales sin instrumento va a EFECTIVO; todo el resto
  // sin instrumento va a BANCO. Un movimiento con instrumento ya cargado manda por su instrumento.
  const MOV = `'_MOVIMIENTOS'`
  const mF = `${MOV}!$A$2:$A`, mS = `${MOV}!$B$2:$B`, mI = `${MOV}!$C$2:$C`
  const mE = `${MOV}!$H$2:$H`, mIn = `${MOV}!$I$2:$I`, mOr = `${MOV}!$N$2:$N`
  const efInst = `(${mIn}="efectivo")`
  const bcInst = `((${mIn}="transferencia")+(${mIn}="echeq")+(${mIn}="debito")+(${mIn}="tarjeta")+(${mIn}="cheque"))`
  const esJorn = `(${mOr}="Jornales por Quincena")`
  // 1 si la fila es EFECTIVO: instrumento efectivo, o desconocido de Jornales. El resto (incluye
  // desconocido no-Jornales y todo lo bancario) es 1-flag → banco. Los dos flags parten en 0/1 exactos.
  const flagEf = `(${efInst}+(1-${efInst}-${bcInst})*${esJorn})`
  const ventana = `ISNUMBER(${mF})*(${mF}>=${DESDE_CAJA.fecha})*(${mF}<=EOMONTH(TODAY();0))*(${mE}<>"REAL")`
  const flujo = (flag) => `SUMPRODUCT(${ventana}*${flag}*N(${mS})*N(${mI}))`
  const efHoy = `N(${ANEXO.efectivoNeto})`
  const bcHoy = `(N(${DESDE_CAJA.total})-N(${ANEXO.efectivoNeto}))`
  const fEf = push(['Saldo en efectivo proyectado a fin de mes', '', '', '', `=${efHoy}+${flujo(flagEf)}`, '',
    'efectivo de hoy + cobros/pagos en efectivo del mes · Jornales sin instrumento → efectivo'])
  const fBc = push(['Dinero en banco proyectado a fin de mes', '', '', '', `=${bcHoy}+${flujo(`(1-${flagEf})`)}`, '',
    'banco de hoy + cobros/pagos por banco del mes · cargas, impuestos y estructura sin instrumento → banco'])
  // CROSS-CHECK QUE PUEDE DAR ROJO: efectivo + banco proyectados = el cierre del mes del Cash Flow.
  // Si el reparto por instrumento se desincroniza del cuadro mensual, esta línea deja de decir "cuadra".
  const cierreMes = rangoCierre && rangoMes
    ? `INDEX(${rangoMes};1;MATCH(EOMONTH(${DESDE_CAJA.fecha};0);ARRAYFORMULA(EOMONTH(${rangoMes};0));0))*0+INDEX(${rangoCierre};1;MATCH(EOMONTH(${DESDE_CAJA.fecha};0);ARRAYFORMULA(EOMONTH(${rangoMes};0));0))`
    : null
  push(['   · control: efectivo + banco = cierre del mes', '', '', '',
    cierreMes ? `=IFERROR((E${fEf}+E${fBc})-(${cierreMes});"")` : '', '',
    cierreMes
      ? `=IF(NOT(ISNUMBER(E${fEf}));"";IF(ABS((E${fEf}+E${fBc})-(${cierreMes}))<1000;"cuadra";"${ALERTA} no cuadra por "&TEXT((E${fEf}+E${fBc})-(${cierreMes});"$#,##0")))`
      : `${ALERTA} falta el cierre mensual`])
  return { fDias, fMin, fEf, fBc }
}

/**
 * A5 · CONCILIACIÓN CONTRA EL CASH FLOW — la identidad que prueba que el archivo sirve.
 *
 * SE CONCILIA CONTRA EL INICIO DEL MES, NO CONTRA EL CIERRE. Leer el cierre y restarlo de la plata de
 * hoy compara dos instantes separados por semanas de cobros y pagos: la resta nunca podía dar cero,
 * daba exactamente el flujo neto del mes ($61.695.516 medidos el 03/08 contra la fila 53 del cuadro,
 * el mismo número). El control no medía un descuadre: medía el mes, y gritaba en rojo todos los días.
 *
 * Y EL MISMO ERROR VOLVIÓ POR LA OTRA PUNTA (06/08). El ancla del Mensual cambió: el inicio del mes
 * anclado ya no ES el total de CAJA — se RECONSTRUYE como total − REAL transcurrido del mes. Comparar
 * total contra inicio volvió a medir el mes ($42.247.935 el 06/08, exactamente el REAL de agosto).
 * La identidad vigente es: total − inicio − REAL del mes hasta el corte = 0, con el REAL salido del
 * libro por `terminoLibro` — la MISMA ventana que usa el ancla (mes del corte, hasta el corte
 * inclusive). Si el ancla y el control citaran dos ventanas distintas, el control mediría la
 * diferencia entre ventanas, no un descuadre.
 *
 * LO QUE ESTE CONTROL PUEDE Y NO PUEDE DECIR: detecta que alguien tocó a mano uno de los dos lados. NO
 * detecta un error de carga, porque el cash flow toma su saldo inicial de CAJA — es un control
 * validado contra su propia fuente y por eso está declarado como tal. El control de verdad va contra
 * el banco (bloque A7) y contra ARCA.
 */
export function bloqueConciliacion(h) {
  const { push, refs } = h
  push(['A5 · CONCILIACIÓN CONTRA EL CASH FLOW — los dos tienen que arrancar del mismo saldo'])
  const fDecl = push(['Disponibilidad declarada en CAJA', '', '', '', `=${DESDE_CAJA.total}`, '', ''])
  const fProy = push(['Efectivo al inicio del mes según el Cash Flow Mensual', '', '', '',
    refs.inicio && refs.cab
      ? `=IFERROR(INDEX(${refs.inicio};1;MATCH(EOMONTH(${DESDE_CAJA.fecha};0);ARRAYFORMULA(EOMONTH(${refs.cab};0));0));"${ALERTA} sin saldo cargado")`
      : `${ALERTA} no encontré la línea de inicio en el Cash Flow Mensual`,
    '', ''])
  const fReal = push(['REAL del mes hasta el corte (el ancla lo descuenta del inicio)', '', '', '',
    `=${terminoLibro({ desde: `EOMONTH(${DESDE_CAJA.fecha};-1)+1`, estados: ['REAL'] })}`,
    '', ''])
  const fDif = push(['⇒ Diferencia — tiene que ser CERO', '', '', '',
    `=IFERROR(E${fDecl}-E${fProy}-E${fReal};"")`, '', ''])
  return { fDif }
}

/**
 * A6 · VENCIDO SIN CONCILIAR — lo que ya debería haber pasado y nadie marcó.
 *
 * Aplicación directa de la regla de tesorería: "un proyectado que se cumple se marca como real".
 * Mientras no se marque, no se sabe si esa plata entró, y el calendario la sigue esperando en un tramo
 * que ya pasó.
 *
 * ⚠ ACÁ UN CERO NO ES UNA BUENA NOTICIA POR SÍ SOLO: "está todo conciliado" y "hace tres semanas que
 * nadie carga un movimiento" se dibujan exactamente igual. Por eso el bloque no termina en el total,
 * termina en una FRASE que mira la fecha del último cobro registrado.
 */
export function bloqueVencido(h) {
  const { push, ch } = h
  const K400 = `UPPER(${rangoEn(ch, 'K')})<>"SI"`
  const I400 = rangoEn(ch, 'I')
  const F400 = `IF(ISNUMBER(${rangoEn(ch, 'F')});${rangoEn(ch, 'F')};0)`
  push(['A6 · VENCIDO SIN CONCILIAR — lo que ya debería haber pasado y nadie marcó'])
  push(['Qué quedó sin marcar', '', 'Cuánto', '', '', '', 'Cuántos'])
  const f0 = h.n + 1
  // LOS ESTADOS NO SE SUMAN ENTRE SÍ: un "Pendiente" vencido (factura emitida que no entró) y un
  // "Proyectado" vencido (una fecha estimada que no se cumplió) piden acciones distintas — al primero
  // se lo reclama, al segundo se lo reproyecta.
  for (const clave of ESPERADOS) {
    push([`Cobros en "${ESTADOS[clave]}" con fecha de cobro ya pasada`, '',
      formulaTotalEstado(clave, { hasta: 'TODAY()' }), '', '', '',
      formulaCantidadEstado(clave, { hasta: 'TODAY()' })])
  }
  // EL LADO QUE PAGA. Un cheque librado, no debitado y con fecha vencida: o el banco todavía no lo
  // presentó, o ya lo debitó y nadie marcó la columna. La segunda ensucia el saldo.
  push(['Cheques emitidos no debitados con fecha de pago ya pasada', '', '',
    `=SUMPRODUCT((${K400})*ISNUMBER(${I400})*(${I400}<TODAY())*${F400})`, '', '',
    `=SUMPRODUCT((${K400})*ISNUMBER(${I400})*(${I400}<TODAY())*1)`])
  const f1 = h.n
  const fTot = push(['⇒ Total vencido sin conciliar', '',
    `=SUM($C$${f0}:$C$${f1})+SUM($D$${f0}:$D$${f1})`, '', '', '', ''])
  const fUlt = push(['Último cobro efectivamente registrado en Cobranzas', '', '', '', '',
    formulaUltimoCobroRegistrado(), ''])
  // LA ÚLTIMA COLUMNA DE ESTE BLOQUE NO ES PROSA: ES UN CONTEO — y quien lo escribe lo declara acá.
  //
  // El contrato de la pestaña dice "la última columna es PROSA: texto, gris, con ajuste. Nunca plata",
  // y es verdad para sus 240 celdas menos estas cuatro. Medido en el archivo el 14/08: G60:G63 con
  // `numberFormat: TEXT` y un SUMPRODUCT adentro. Tres valían 0 y el cuarto 3, así que se veían bien —
  // el mismo accidente que escondió `OBRAS!F` hasta que apareció el primer importe grande. Se declara
  // el RANGO y no una lista de filas: si mañana entra un quinto control vencido, entra formateado.
  push(['⇒ ¿el cero es real?', '', '', '', '', '',
    `=IF($C$${fTot}>0;"hay "&TEXT($C$${fTot};"$#,##0")&" para conciliar";`
    + `IF(NOT(ISNUMBER($F$${fUlt}));"${ALERTA} no puedo saberlo: Cobranzas no tiene ningún cobro con fecha";`
    + `IF(TODAY()-$F$${fUlt}>${DIAS_SIN_CARGA};"${ALERTA} NO — hace "&TEXT(TODAY()-$F$${fUlt};"0")&" días que no se registra un cobro";`
    + '"sí — no hay nada vencido y la carga está al día")))'])
  // EL PRECIO DE LA LISTA BLANCA, PAGADO A LA VISTA: los cuadros eligen estados POR NOMBRE, así que un
  // sexto estado dejaría plata afuera en silencio. Tiene que dar cero.
  push(['   · riesgo: filas de Cobranzas con un estado que el OS no conoce', '',
    formulaEstadoDesconocido(), '', '', '', ''])
  return { fTot, fCuantos: [f0, f1] }
}

/**
 * A7 · TRAZABILIDAD CONTRA EL BANCO — el extracto contra las pestañas, en los MISMOS días.
 *
 * LA MISMA VENTANA DE TIEMPO DE LOS DOS LADOS. La primera versión sumaba el efectivo de todo el año
 * ($173.434.381) contra dieciséis días de depósitos ($9.960.000) y publicaba $161.749.381 "sin
 * explicar": un número inventado por el método, que es exactamente lo que la regla de oro #3 prohíbe.
 */
export function bloqueTrazabilidad(h) {
  const { push } = h
  // ═══ LA VENTANA FOSILIZADA ERA EL DEFECTO (dictamen 07/08) ═══
  //
  // La versión anterior clavaba la ventana en las fechas de la CAPTURA del extracto (22/06–22/07,
  // constantes de banco-santander.mjs), sumaba los depósitos SIN ventana y NUNCA restaba el efectivo
  // gastado: publicó $12.219.646 "sin explicar" que eran mayormente plata gastada y registrada — un
  // número inventado por el método, la clase exacta que la regla de oro 3 prohíbe. La identidad
  // completa es: todo lo cobrado en efectivo = depositado + gastado + lo que hay en el cajón HOY.
  // Todo a historia completa (hasta HOY, para que un valor con fecha futura no entre), y el cajón es
  // el saldo VIVO (arqueo ± posteriores), no el arqueo crudo.
  push(['A7 · TRAZABILIDAD DEL EFECTIVO — todo lo cobrado contra depósitos, gastos y el cajón'])
  // SÓLO LO "COBRADO": un cobro en estado "Proyectado" no es efectivo en la caja. Y hasta HOY: un
  // "Cobrado" con fecha futura (un valor endosado, una carga adelantada) no es billete en la mano.
  const CONEF = `(Cobranzas!$N$5:$N$400="Efectivo")*(Cobranzas!$O$5:$O$400="Cobrado")*(Cobranzas!$Q$5:$Q$400<=TODAY())`
  const fCob = push(['Cobrado en EFECTIVO — historia completa (Cobranzas)', '', '', '',
    `=SUMPRODUCT(${CONEF}*IF(ISNUMBER(Cobranzas!$M$5:$M$400);Cobranzas!$M$5:$M$400;0))`,
    '', ''])
  // ⚠ Mismo ID y mismo importe más de una vez. Caso real del 17/07: San Francisco pagó $16.200.000 en
  // efectivo y quedó cargado dos veces —una al cobrarlo y otra al depositarlo—. Un depósito NO es un
  // cobro. Se divide por dos porque las dos filas del par suman.
  const fDup = push(['  · de eso, cargado DOS VECES con el mismo ID', '', '', '',
    `=SUMPRODUCT(${CONEF}*(${INDIST_COB})*IF(ISNUMBER(Cobranzas!$M$5:$M$400);Cobranzas!$M$5:$M$400;0))/2`,
    '', ''])
  // EL DETALLE NO VA EN LA COLUMNA DEL DINERO: es una tira larga y el ojo que recorre una columna de
  // números se choca con un párrafo. Va en la columna del rótulo, que ya tiene overflow.
  push([`=IFERROR("   · "&TEXTJOIN("   ·   ";1;ARRAYFORMULA(IF(${CONEF};TEXT(Cobranzas!$Q$5:$Q$400;"dd/mm")&"  "&IF(Cobranzas!$G$5:$G$400="";"";Cobranzas!$G$5:$G$400&"  ")&TEXT(Cobranzas!$M$5:$M$400;"$#,##0");"")));"")`,
    '', '', '', '', '', ''])
  const dep = (col) => `_BANCO_RAW!$${col}$4:$${col}`
  const CONDEP = `(${dep('E')}="entra")*ISNUMBER(SEARCH("deposito";LOWER(SUBSTITUTE(${dep('B')};"ó";"o"))))*(ISNUMBER(SEARCH("efectivo";LOWER(SUBSTITUTE(${dep('B')};"ó";"o"))))+ISNUMBER(SEARCH("efvo";LOWER(SUBSTITUTE(${dep('B')};"ó";"o"))))>0)`
  const fDep = push(['Depositado en efectivo al banco — historia completa (extracto)', '', '', '',
    `=SUMPRODUCT(${CONDEP}*IF(ISNUMBER(${dep('C')});${dep('C')};0))`, '', ''])
  push([`=IFERROR("   · "&TEXTJOIN("   ·   ";1;ARRAYFORMULA(IF(${CONDEP};TEXT(${dep('A')};"dd/mm")&"  "&TEXT(${dep('C')};"$#,##0");"")));"")`,
    '', '', '', '', '', ''])
  // LA OTRA ENTRADA DEL CAJÓN: los retiros de efectivo del banco. Sin este término la identidad dio
  // −$134,9M en la primera corrida — casi todo el efectivo gastado no vino de cobros, vino del
  // cajero. Con arqueo 0, la fórmula de "posteriores" cubre la historia entera.
  const fExt = push(['Extraído del banco en efectivo — historia completa (extracto)', '', '', '',
    `=${formulaExtraccionesEfectivoPosteriores('0')}`, '', ''])
  // LO GASTADO TAMBIÉN SALIÓ DEL CAJÓN — el término que faltaba y que inflaba el "sin explicar" con
  // plata gastada y registrada. Compras por su MONTO PAGADO (los parciales también son billetes que
  // salieron), más jornales y oficina pagados por caja. Con arqueo 0, las fórmulas de "posteriores"
  // cubren la historia entera: todo > 0 es todo.
  const fGasto = push(['Pagado en efectivo — Compras (monto pagado) + jornales + oficina', '', '', '',
    `=SUMPRODUCT(('Compras'!$P$4:$P="Efectivo")*N('Compras'!$T$4:$T))`
    + `+${formulaJornalesEfectivoPosteriores('0')}+${formulaOficinaEfectivoPosteriores('0')}`, '', ''])
  // EL CAJÓN VIVO, NO EL ARQUEO CRUDO: con la identidad a historia completa, lo que cierra la resta
  // es lo que HAY en la caja hoy (arqueo ± movimientos posteriores) — el mismo número de CAJA!B7.
  // LA FECHA SALE DEL CENTINELA Y NO DE `CAJA!D7` (16/08/2026). Citaba la celda que el dueño tipeaba, y
  // desde que él la borró este renglón también quedó sin fecha — el mismo defecto que en la portada,
  // acá donde nadie lo miró. Hoy la fecha del conteo la estampa la corrida dos bloques más arriba:
  // citarla directo es una referencia menos y saca el rodeo por la otra pestaña.
  // Y ES LA MISMA CELDA DE FECHA QUE PUBLICA `CAJA!D7`, importada y no copiada (24/08/2026): este
  // renglón muestra EXACTAMENTE el mismo número que la fila 7, así que si una de las dos fechara por el
  // conteo y la otra por el último movimiento, el archivo tendría dos fechas para la misma plata.
  const fFisica = push(['Efectivo en el cajón HOY (arqueo ± posteriores)', '', '', '',
    `=N(${DESDE_CAJA.arqueoArs})+N(${ANEXO.efectivoNeto})`,
    celdaFechaDelEfectivo(ANEXO.conteoArsDia, ANEXO.ultimoEfectivoDia), ''])
  const fSinExpl = push(['⇒ EFECTIVO SIN EXPLICAR', '', '', '',
    `=E${fCob}-E${fDup}+E${fExt}-E${fDep}-E${fGasto}-E${fFisica}`, '', ''])

  // ── Y DEL OTRO LADO: QUÉ SALIÓ DE LA CUENTA Y DÓNDE ESTÁ REGISTRADO ──────────────────────────────
  //
  // El extracto trae 65 egresos. Agrupados por lo que SON —no por el concepto literal, que el banco
  // escribe de veinte maneras— quedan nueve grupos, y cada uno tiene una pestaña que debería
  // explicarlo. DOS NO TIENEN NINGUNA: el impuesto al cheque y el costo del descubierto salen todos
  // los meses y ningún cuadro del archivo los espera.
  // LA DIFERENCIA VA EN LA COLUMNA E, NO EN LA F. La F es la columna de FECHAS de toda la pestaña, y un
  // importe ahí hereda su formato: la versión anterior mostraba "30/03/87349" donde hay −$899.154. Un
  // desvío disfrazado de fecha no lo lee nadie, y arreglarlo con una excepción de formato es cargarle a
  // la vista un problema que la GRILLA puede evitar poniendo cada cosa en su columna.
  push(['   Qué salió de la cuenta y dónde está registrado'])
  push(['Qué salió', '', 'Según el banco', 'Según la pestaña', 'Diferencia', '', 'Qué pestaña lo tiene'])
  const n0 = h.n + 1
  for (const gr of CONC.GRUPOS) {
    const f = h.n + 1
    // LA DIFERENCIA SÓLO SE CALCULA CUANDO HAY CON QUÉ COMPARAR: un "0" donde no hay pestaña se leería
    // como "cuadra", que es lo contrario de lo que pasa.
    push([gr.naturaleza, '', `=${CONC.segunBanco(gr.naturaleza)}`,
      gr.formula ? `=${gr.formula(CONC.VENTANA.desde, CONC.VENTANA.hasta)}` : '',
      gr.formula ? `=D${f}-C${f}` : '', '',
      gr.pestana ? `${gr.pestana} — ${gr.nota}` : gr.nota])
    // EL DETALLE VA DEBAJO DE SU GRUPO, cuando la diferencia se puede accionar: un desvío con un total
    // no le sirve a nadie; con el número de cheque y el proveedor se resuelve en dos minutos.
    if (gr.detalle) push(['   · cuáles son', '', '', '', '', '', gr.detalle()])
  }
  const n1 = h.n
  push(['⇒ TOTAL QUE SALIÓ DE LA CUENTA', '', `=SUM(C${n0}:C${n1})`, '', '', '', ''])
  push(['⇒ Control: lo que el extracto dice que salió', '',
    '=-SUMIFS(_BANCO_RAW!$C$4:$C;_BANCO_RAW!$E$4:$E;"sale")', '', '', '', ''])
  return { fSinExpl, n0, n1 }
}

/**
 * A8 · LO QUE EL CALENDARIO NO VE — los cuatro controles del piso de caja.
 *
 * EL RIESGO DEL TÉRMINO DE CHEQUES, A LA VISTA. El calendario suma los cheques SIN factura leyendo la
 * marca que escribe `cheques-cobertura`. Si ese agente no corrió, la columna está vacía, el término da
 * $0 y NADA avisa: el piso sube sin que se haya pagado nada.
 *
 * Y EL RIESGO VA PARTIDO EN DOS PORQUE SE ARREGLA DISTINTO. Medido el 05/08, los $38.377.479 en rojo
 * eran dos problemas en proporción 90/10: $34.776.200 en cheques que SÍ tienen su N° de comprobante
 * (falta que corra el agente) y $3.601.279 sin N° (el dato no existe y sólo lo carga quien firmó).
 * Verlos juntos hacía leer un agujero de $38,4M donde el trabajo humano pendiente era $3,6M.
 *
 * @param {{push:Function, ch:string, conceptosCiegos:string[]}} h
 */
export function bloqueCalendarioCiego(h) {
  const { push, ch, conceptosCiegos } = h
  const K400 = `UPPER(${rangoEn(ch, 'K')})<>"SI"`
  const I400 = rangoEn(ch, 'I')
  const F400 = `IF(ISNUMBER(${rangoEn(ch, 'F')});${rangoEn(ch, 'F')};0)`
  const M_CH = rangoEn(ch, 'M')
  const TIENE_NUM = expresionTieneNumero(rangoEn(ch, 'H'))
  const sinMarca = (cond) => `=SUMPRODUCT((${K400})*(${M_CH}="")*${cond}*${F400})`

  push(['A8 · LO QUE EL CALENDARIO NO VE — los cuatro controles del piso de caja'])
  const fSinFecha = push(['Cheques sin factura Y sin fecha de pago: no caen en ningún tramo', '', '',
    `=SUMPRODUCT(${comparaMarca(M_CH, MARCAS.falta)}*(${K400})*(1-ISNUMBER(${I400}))*${F400})`, '', '', ''])
  const fSinMarca = push([`${ALERTA} riesgo: cheques no debitados SIN marca de cobertura`, '', '',
    `=SUMPRODUCT((${K400})*(${M_CH}="")*${F400})`, '', '', ''])
  push(['        de los cuales, con N° de comprobante ya cargado (lo resuelve el OS)', '', '',
    sinMarca(TIENE_NUM), '', '', ''])
  push(['        de los cuales, SIN N° de comprobante (lo carga una persona)', '', '',
    sinMarca(`(1-${TIENE_NUM})`), '', '', ''])
  // NO SE SUMA A NINGÚN TOTAL: es la medida de lo que el calendario decide NO contar. Un cheque
  // debitado ya salió de la cuenta y el saldo del que arranca el calendario lo tiene descontado;
  // restarlo otra vez hundía el piso $12.188.441 y por eso CAJA y el conciliador no cerraban.
  push(['   declarado: ya debitados y sin factura — el saldo del banco ya los tiene descontados', '', '',
    `=SUMPRODUCT((UPPER(${rangoEn(ch, 'K')})="SI")*${comparaMarca(M_CH, MARCAS.falta)}*${F400})`, '', '', ''])
  // UN CERO CON NOMBRE ES UNA LIMITACIÓN CONOCIDA; UN CERO MUDO ES UN BUG. Los tres conceptos valen
  // cero en todos los tramos porque el banco los debita solo, sin factura, y su único registro es el
  // extracto — que por definición sólo cubre el pasado.
  push([`   declarado: ${conceptosCiegos.length} concepto(s) del cash flow sin fuente con fecha`, '', '',
    0, '', '', conceptosCiegos.join(' · ')])
  return { fSinFecha, fSinMarca }
}

/**
 * LA BANDA DEL PISO, calculada sobre los tramos de CAJA. No vive acá —la publica CAJA en su propia
 * línea de veredicto— pero la expresión de "lo incierto acumulado hasta un borde" sí, porque es del
 * mismo dominio que los controles de arriba: mide lo que NO se puede afirmar.
 *
 * Los INFERIDOS no entran en la banda: tienen evidencia positiva (una factura del mismo proveedor por
 * exactamente el mismo importe). Ésa es toda la utilidad del cruce de respaldo: no cambia el piso,
 * ANGOSTA la banda.
 */
export function inciertoHasta(hasta, desdeSiempre = '0') {
  return [MARCAS.sinNumero, ''].map((m) => formulaChequesSinFactura(desdeSiempre, hasta, m).slice(1)).join('+')
}

/** Los nombres que este archivo publica, para que el script no los adivine. */
export const PUBLICA = {
  [ANEXO.difConciliacion]: 'A5 · ⇒ Diferencia',
  [ANEXO.vencidoSinConciliar]: 'A6 · ⇒ Total vencido sin conciliar',
  [ANEXO.efectivoSinExplicar]: 'A7 · ⇒ EFECTIVO SIN EXPLICAR',
  [ANEXO.chequesSinMarca]: 'A8 · riesgo sin marca de cobertura',
  [ANEXO.chequesSinFecha]: 'A8 · cheques sin fecha de pago',
  [ANEXO.diasDeCaja]: 'A4 · ⇒ Días de caja',
}
