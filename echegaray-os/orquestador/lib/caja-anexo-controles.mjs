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
import { terminoLibro } from './libro-sumas.mjs'
import { DESDE_CAJA, ANEXO } from './caja-anexo-nombres.mjs'
import { formulaEgresoDiario } from './egreso-diario.mjs'
import { esIndistinguible } from './cobranzas-duplicado.mjs'
import * as CONC from './conciliacion-por-naturaleza.mjs'
import { MARCAS, expresionTieneNumero } from './cheques-cobertura.mjs'
import { formulaChequesSinFactura } from './cash-flow-lineas.mjs'
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
    `=IF(N(${DESDE_CAJA.minima})=0;"⚠ falta cargar la caja mínima";`
    + `IF(${DESDE_CAJA.total}<${DESDE_CAJA.minima};"⚠ SÍ — faltan "&TEXT(${DESDE_CAJA.minima}-${DESDE_CAJA.total};"$#,##0");`
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
  const primerMes = (cond) => (rangoCierre
    ? `=IFERROR(TEXT(INDEX(${rangoMes};1;MATCH(1;ARRAYFORMULA((${rangoCierre}<>"")*(${rangoCierre}${cond}));0));"mmmm yyyy");"ningún mes del año")`
    : '⚠ falta la línea de cierre en el Cash Flow Mensual')
  push(['Primer mes por debajo de la caja mínima (proyección del Cash Flow)', '', '', '', '', '',
    primerMes(`<${DESDE_CAJA.minima}`)])
  push(['Primer mes con caja negativa (proyección del Cash Flow)', '', '', '', '', '', primerMes('<0')])
  return { fDias, fMin }
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
      ? `=IFERROR(INDEX(${refs.inicio};1;MATCH(EOMONTH(${DESDE_CAJA.fecha};0);ARRAYFORMULA(EOMONTH(${refs.cab};0));0));"⚠ sin saldo cargado")`
      : '⚠ no encontré la línea de inicio en el Cash Flow Mensual',
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
  push(['⇒ ¿el cero es real?', '', '', '', '', '',
    `=IF($C$${fTot}>0;"hay "&TEXT($C$${fTot};"$#,##0")&" para conciliar";`
    + `IF(NOT(ISNUMBER($F$${fUlt}));"⚠ no puedo saberlo: Cobranzas no tiene ningún cobro con fecha";`
    + `IF(TODAY()-$F$${fUlt}>${DIAS_SIN_CARGA};"⚠ NO — hace "&TEXT(TODAY()-$F$${fUlt};"0")&" días que no se registra un cobro";`
    + '"sí — no hay nada vencido y la carga está al día")))'])
  // EL PRECIO DE LA LISTA BLANCA, PAGADO A LA VISTA: los cuadros eligen estados POR NOMBRE, así que un
  // sexto estado dejaría plata afuera en silencio. Tiene que dar cero.
  push(['   · riesgo: filas de Cobranzas con un estado que el OS no conoce', '',
    formulaEstadoDesconocido(), '', '', '', ''])
  return { fTot }
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
  const desdeB = BANCO.MOVIMIENTOS[0].fecha
  const hastaB = BANCO.MOVIMIENTOS[BANCO.MOVIMIENTOS.length - 1].fecha
  const dateF = (f) => { const [a, m, d] = f.split('-').map(Number); return `DATE(${a};${m};${d})` }
  push([`A7 · TRAZABILIDAD CONTRA EL BANCO — el extracto del ${desdeB} al ${hastaB} contra las pestañas`])
  // SÓLO LO "COBRADO": un cobro en estado "Proyectado" no es efectivo en la caja. La primera versión
  // los sumaba y contaba $15.000.000 que nadie había recibido, inflando el faltante con plata que no
  // faltaba.
  const fCob = push([`Cobrado en EFECTIVO en la ventana del extracto (Cobranzas)`, '', '', '',
    `=SUMIFS(Cobranzas!$M$5:$M$400;Cobranzas!$N$5:$N$400;"Efectivo";Cobranzas!$O$5:$O$400;"Cobrado";Cobranzas!$Q$5:$Q$400;">="&${dateF(desdeB)};Cobranzas!$Q$5:$Q$400;"<="&${dateF(hastaB)})`,
    '', ''])
  // ⚠ Mismo ID y mismo importe más de una vez. Caso real del 17/07: San Francisco pagó $16.200.000 en
  // efectivo y quedó cargado dos veces —una al cobrarlo y otra al depositarlo—. Un depósito NO es un
  // cobro. Se divide por dos porque las dos filas del par suman.
  const fDup = push(['  · de eso, cargado DOS VECES con el mismo ID', '', '', '',
    `=SUMPRODUCT((Cobranzas!$N$5:$N$400="Efectivo")*(Cobranzas!$O$5:$O$400="Cobrado")*(Cobranzas!$Q$5:$Q$400>=${dateF(desdeB)})*(Cobranzas!$Q$5:$Q$400<=${dateF(hastaB)})*(${INDIST_COB})*IF(ISNUMBER(Cobranzas!$M$5:$M$400);Cobranzas!$M$5:$M$400;0))/2`,
    '', ''])
  const CONEF = `(Cobranzas!$N$5:$N$400="Efectivo")*(Cobranzas!$O$5:$O$400="Cobrado")*(Cobranzas!$Q$5:$Q$400>=${dateF(desdeB)})*(Cobranzas!$Q$5:$Q$400<=${dateF(hastaB)})`
  // EL DETALLE NO VA EN LA COLUMNA DEL DINERO: es una tira larga y el ojo que recorre una columna de
  // números se choca con un párrafo. Va en la columna del rótulo, que ya tiene overflow.
  push([`=IFERROR("   · "&TEXTJOIN("   ·   ";1;ARRAYFORMULA(IF(${CONEF};TEXT(Cobranzas!$Q$5:$Q$400;"dd/mm")&"  "&IF(Cobranzas!$G$5:$G$400="";"";Cobranzas!$G$5:$G$400&"  ")&TEXT(Cobranzas!$M$5:$M$400;"$#,##0");"")));"")`,
    '', '', '', '', '', ''])
  const dep = (col) => `_BANCO_RAW!$${col}$4:$${col}`
  const CONDEP = `(${dep('E')}="entra")*ISNUMBER(SEARCH("deposito";LOWER(SUBSTITUTE(${dep('B')};"ó";"o"))))*(ISNUMBER(SEARCH("efectivo";LOWER(SUBSTITUTE(${dep('B')};"ó";"o"))))+ISNUMBER(SEARCH("efvo";LOWER(SUBSTITUTE(${dep('B')};"ó";"o"))))>0)`
  const fDep = push(['Depositado en efectivo en esa misma ventana (extracto)', '', '', '',
    `=SUMPRODUCT(${CONDEP}*IF(ISNUMBER(${dep('C')});${dep('C')};0))`, '', ''])
  push([`=IFERROR("   · "&TEXTJOIN("   ·   ";1;ARRAYFORMULA(IF(${CONDEP};TEXT(${dep('A')};"dd/mm")&"  "&TEXT(${dep('C')};"$#,##0");"")));"")`,
    '', '', '', '', '', ''])
  // ═══ APUNTA AL ARQUEO CRUDO, NO AL SALDO EN PESOS ═══
  //
  // "Caja en pesos" vale arqueo + movimientos POSTERIORES al arqueo, y esta alerta mide otra ventana
  // (la del extracto). Leer el saldo restaría movimientos que no pertenecen a su ventana: la mezcla de
  // períodos que la regla de oro prohíbe, y habría bajado el faltante con plata de otro mes.
  //
  // Y LA FECHA VA GUARDADA CON ISNUMBER: `=CAJA_ARQUEO_ARS_FECHA` sobre una celda vacía devuelve 0, y
  // el 0 con formato de fecha se dibuja "30/12/1899". Es el defecto `fecha_cero` del auditor.
  const fFisica = push(['Arqueo declarado de caja física (a SU fecha)', '', '', '',
    `=N(${DESDE_CAJA.arqueoArs})`,
    `=IF(ISNUMBER(${DESDE_CAJA.arqueoArsFecha});${DESDE_CAJA.arqueoArsFecha};"")`, ''])
  const fSinExpl = push(['⇒ EFECTIVO SIN EXPLICAR', '', '', '',
    `=E${fCob}-E${fDup}-E${fDep}-E${fFisica}`, '', ''])

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
    `=SUMPRODUCT((${M_CH}="${MARCAS.falta}")*(${K400})*(1-ISNUMBER(${I400}))*${F400})`, '', '', ''])
  const fSinMarca = push(['⚠ riesgo: cheques no debitados SIN marca de cobertura', '', '',
    `=SUMPRODUCT((${K400})*(${M_CH}="")*${F400})`, '', '', ''])
  push(['        de los cuales, con N° de comprobante ya cargado (lo resuelve el OS)', '', '',
    sinMarca(TIENE_NUM), '', '', ''])
  push(['        de los cuales, SIN N° de comprobante (lo carga una persona)', '', '',
    sinMarca(`(1-${TIENE_NUM})`), '', '', ''])
  // NO SE SUMA A NINGÚN TOTAL: es la medida de lo que el calendario decide NO contar. Un cheque
  // debitado ya salió de la cuenta y el saldo del que arranca el calendario lo tiene descontado;
  // restarlo otra vez hundía el piso $12.188.441 y por eso CAJA y el conciliador no cerraban.
  push(['   declarado: ya debitados y sin factura — el saldo del banco ya los tiene descontados', '', '',
    `=SUMPRODUCT((UPPER(${rangoEn(ch, 'K')})="SI")*(${M_CH}="${MARCAS.falta}")*${F400})`, '', '', ''])
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
