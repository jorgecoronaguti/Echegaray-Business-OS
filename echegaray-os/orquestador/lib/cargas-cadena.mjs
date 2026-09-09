// LA CADENA — UNA SOLA, DE LOS JORNALES A CADA OBLIGACIÓN. NINGUNA PROYECCIÓN INDEPENDIENTE.
//
// El dueño: "TODAS las cargas calculadas desde los jornales proyectados — cadena única
// Jornales → Remuneraciones → F931 → ART → OS → IERIC → FODECO → Cese, sin proyecciones
// independientes".
//
// Eso ya era casi cierto, y las excepciones eran justo las que daban números sin sentido económico:
//
//   · IERIC y FODECO se proyectaban como % DE LA MASA SALARIAL. No lo son: se pagan POR TRABAJADOR
//     REGISTRADO. Medidos sobre lo pagado —$61.243 en todo el año entre los dos— daban ~$7.000 por
//     mes cada uno, un número que nadie puede defender. Cambiarles la BASE (de masa a persona) es el
//     arreglo estructural; el VALOR por persona es normativo y no está en el repositorio, así que se
//     mide de lo pagado Y se deja un parámetro para que el dueño lo corrija cuando lo confirme.
//   · FCL se proyectaba con la alícuota media histórica sobre remuneración. La ley 22.250 fija un
//     porcentaje que CAMBIA CON LA ANTIGÜEDAD del trabajador, y la antigüedad ESTÁ (columna C del
//     espejo, fecha de ingreso). Se calcula ponderando: cuántos llevan menos de un año y cuántos más.
//   · El SAC devengado se cortaba en junio, porque colgaba de la remuneración DECLARADA y las DDJJ
//     llegan hasta ahí. La provisión acumulada terminaba el año en −$10,3M: se pagaba aguinaldo de un
//     devengado que la fila había dejado de devengar. Ahora la fila mira la remuneración del mes,
//     declarada o proyectada, y devenga los doce meses.
//
// ═══ LO QUE ESTE MÓDULO NO PUEDE SABER, Y NO INVENTA ═══
//
// Las alícuotas normativas (FCL, IERIC, FODECO) no están en el repositorio y esta corrida no tuvo
// acceso a la fuente oficial para verificarlas. La skill laboral es explícita: los institutos se
// nombran, los VALORES se verifican. Entonces cada uno viaja como PARÁMETRO con su valor declarado
// "a verificar", y la pestaña lo dice al lado del número. Un parámetro que el dueño puede corregir en
// una celda es honesto; una alícuota citada de memoria adentro de una fórmula es una invención con
// aspecto de dato.

import { ALERTA } from './glifos.mjs'
import { TRAMOS as TRAMOS_VACACIONES } from './vacaciones-construccion.mjs'

/** Los parámetros normativos que esta cadena necesita y que el repositorio no puede verificar solo. */
export const RANGO_FCL_PRIMER_ANIO = 'FCL_ALICUOTA_PRIMER_ANIO'
export const RANGO_FCL_POSTERIOR = 'FCL_ALICUOTA_POSTERIOR'
export const RANGO_IERIC = 'IERIC_POR_TRABAJADOR'
export const RANGO_FODECO = 'FODECO_POR_TRABAJADOR'
/** El día del mes en que sale de la caja el F931 del mes anterior. Es lo que fecha la serie del Libro. */
export const RANGO_DIA_PAGO_F931 = 'F931_DIA_DE_PAGO'
/**
 * LA PROPORCIÓN DEL PLANTEL EN SU PRIMER AÑO — el peso que reparte las dos alícuotas del FCL.
 *
 * ═══ POR QUÉ SE MUDÓ A «Parámetros» (09/09/2026) ═══
 *
 * Vivía como un renglón de la sección 3 de «Cargas Sociales» —`   · en su primer año de antigüedad
 * 66,7%`—: un porcentaje suelto en el medio de doce columnas de pesos, con un «·» que lo hacía pasar
 * por sub-ítem de la fila de arriba. El dueño lo señaló textual junto con el resto de la prosa. No
 * es un importe del cuadro: es una ENTRADA de la fórmula de FCL, y las entradas viven en la pestaña
 * de entradas, con su rótulo y su rango con nombre, como ya hicieron `JORNADA_*` en Jornales.
 *
 * A DIFERENCIA DE LAS ALÍCUOTAS, ÉSTE LO CALCULA EL OS y se reescribe en cada corrida (`refrescar`):
 * su fórmula cita las filas del bloque de quincena vigente de `_J_OBREROS`, así que congelarla la
 * dejaría midiendo sobre el plantel de hace quince días sin dar un solo error.
 */
export const RANGO_PROPORCION_PRIMER_ANIO = 'CARGAS_PROPORCION_PRIMER_ANIO'

/** La marca que el auditor busca para saber que un valor está declarado como no verificado. */
export const A_VERIFICAR = `${ALERTA} A VERIFICAR POR EL DUEÑO`

export const PARAMETROS_CARGAS = [
  {
    rango: RANGO_FCL_PRIMER_ANIO,
    rotulo: 'FCL — alícuota del primer año de antigüedad',
    valor: 0.12,
    nota: `${A_VERIFICAR}. Fondo de Cese Laboral (Ley 22.250, régimen propio de la construcción: reemplaza a la indemnización por antigüedad de la LCT). `
      + 'El aporte cambia con la antigüedad y el OS NO pudo verificar el porcentaje vigente en esta corrida — no hay fuente oficial cableada y una alícuota citada de memoria es una invención con cara de dato. '
      + 'Confirmalo con el contador o con IERIC y corregí esta celda: la proyección de FCL se recalcula sola. Mientras tanto, la pestaña dice al lado de cada número que este valor está sin verificar.',
  },
  {
    rango: RANGO_FCL_POSTERIOR,
    rotulo: 'FCL — alícuota a partir del segundo año',
    valor: 0.08,
    nota: `${A_VERIFICAR}. Ídem la fila de arriba. La ANTIGÜEDAD sí es un dato real: sale de la fecha de ingreso de cada persona en _J_OBREROS, así que la ponderación entre las dos alícuotas se mide, no se supone.`,
  },
  {
    rango: RANGO_IERIC,
    rotulo: 'IERIC — aporte mensual por trabajador registrado',
    valor: 0,
    nota: `${A_VERIFICAR}. IERIC se paga POR TRABAJADOR REGISTRADO, no como % de la masa salarial — proyectarlo como porcentaje daba $7.000 por mes, un número sin sentido económico. `
      + 'DEJALO EN 0 y la pestaña usa lo MEDIDO (lo pagado ÷ empleados-mes), que es un hecho aunque sea pobre. Poné el valor de la norma y manda el tuyo.',
  },
  {
    rango: RANGO_FODECO,
    rotulo: 'FODECO — aporte mensual por trabajador registrado',
    valor: 0,
    nota: `${A_VERIFICAR}. Ídem IERIC: por trabajador, no por masa. En 0, la pestaña proyecta con lo medido y lo declara.`,
  },
  {
    rango: RANGO_DIA_PAGO_F931,
    rotulo: 'F931 — día del mes en que sale de la caja',
    // MEDIDO, NO CITADO. El calendario de ARCA para la seguridad social NO está cableado en el OS
    // (`vencimientos-fiscales.mjs` tiene IVA, planes y prendario, no F931), así que el día no se cita
    // de memoria: sale de los pagos REALES cargados en Compras — 10/02, 10/03, 09/04, 11/05, 10/06 y
    // 10/07 (el 19/01 es el F931 de diciembre, otra banda) — cuya moda es 10, y es también el día que
    // el dueño usa en todas sus previsiones de agosto a diciembre. Dos fuentes, el mismo día.
    valor: 10,
    nota: `${A_VERIFICAR}. Es la fecha con la que el Libro Canónico ubica en el calendario las cargas `
      + 'que la cadena proyecta: un día equivocado no cambia el total del año, pero corre plata de '
      + 'semana en la escalera de CAJA. Medido sobre los seis pagos reales de F931 cargados en '
      + 'Compras (moda: día 10) y confirmado por las previsiones que cargó el dueño. Si el calendario de '
      + 'ARCA para tu terminación de CUIT dice otro día, corregí esta celda: la serie se refecha sola.',
  },
  // ═══ LOS CUATRO TRAMOS DE VACACIONES (27/08) ═══
  //
  // Las vacaciones devengan todos los meses y no estaban provisionadas en NINGUNA pestaña: lo único
  // que había era un pie diciendo que faltaban, desde el 06/08. La antigüedad SÍ está —columna C de
  // `_J_OBREROS`, la misma que ya pondera el FCL—; lo que falta son los DÍAS por tramo, que son
  // normativos y que esta corrida no pudo verificar contra fuente oficial.
  //
  // Van en 0 A PROPÓSITO, igual que IERIC y FODECO: con la escala en cero la provisión no publica un
  // número, publica qué falta. Un valor citado de memoria multiplicado por 17 jornales entra al
  // cuadro económico con cara de hecho. El día que el contador escribe los días, la provisión se
  // calcula sola contra las fechas de ingreso reales.
  ...TRAMOS_VACACIONES.map((t, i) => ({
    rango: t.rango,
    rotulo: `Vacaciones — días por antigüedad, ${t.rotulo}`,
    valor: 0,
    nota: `${A_VERIFICAR}. Los obreros están bajo UOCRA — Ley 22.250 (construcción), que es un `
      + 'régimen propio: las vacaciones se rigen por las reglas generales SÓLO en lo no modificado por '
      + 'el estatuto, así que son dos cuerpos normativos y no uno. Esta corrida NO tuvo acceso a fuente '
      + 'oficial para verificar la escala vigente y no la inventa. '
      + (i === 0
        ? 'EN 0 la provisión de la sección 6 dice que falta en vez de publicar un total incompleto. '
          + 'Cargá los cuatro tramos con lo que confirme el contador y la provisión aparece sola, '
          + 'calculada contra la fecha de ingreso de cada persona en _J_OBREROS.'
        : 'Ídem la fila del primer tramo. La ANTIGÜEDAD es un dato real y medido; el que falta es el día.'),
  })),
]

/**
 * NÚCLEO PURO: cómo se proyecta cada concepto de la cadena.
 *
 *   'remuneracion' → alícuota MEDIDA por código de la DDJJ × remuneración proyectada
 *   'dotacion'     → costo medido por empleado × dotación proyectada
 *   'antiguedad'   → alícuota LEGAL ponderada por antigüedad × remuneración proyectada (sólo FCL)
 *
 * `de` dice de qué bloque de la pestaña sale la base histórica: 'declarado' (F931) o 'pagado'
 * (Compras). FCL, UOCRA, IERIC y FODECO no están en la DDJJ y por eso salen de lo pagado.
 */
export const CONCEPTOS_CADENA = [
  { codigo: '301', rotulo: 'Aportes Seguridad Social', base: 'remuneracion', de: 'declarado' },
  { codigo: '302', rotulo: 'Aportes Obra Social', base: 'remuneracion', de: 'declarado' },
  { codigo: '351', rotulo: 'Contribuciones Seguridad Social', base: 'remuneracion', de: 'declarado' },
  { codigo: '352', rotulo: 'Contribuciones Obra Social', base: 'remuneracion', de: 'declarado' },
  {
    codigo: '312',
    rotulo: 'L.R.T. — ART',
    base: 'remuneracion',
    de: 'declarado',
    nota: 'La alícuota de ART depende de la siniestralidad y del riesgo de la actividad: se mide, no se supone. Falta la póliza (cuota fija + % + tope) para calcularla en vez de medirla.',
  },
  {
    codigo: '028',
    rotulo: 'Seguro de Vida Obligatorio',
    base: 'dotacion',
    de: 'declarado',
    nota: 'NO escala con la masa salarial: es un costo por persona.',
  },
  {
    rotulo: 'FCL',
    base: 'antiguedad',
    de: 'pagado',
    parametros: [RANGO_FCL_PRIMER_ANIO, RANGO_FCL_POSTERIOR],
    nota: 'Fondo de Cese Laboral (Ley 22.250) — de la construcción, no está en el F931. Reemplaza a la indemnización por antigüedad: si los aportes están al día, la desvinculación no genera el pasivo del régimen común.',
  },
  { rotulo: 'UOCRA', base: 'remuneracion', de: 'pagado', nota: 'Cuota sindical y aportes de convenio.' },
  {
    rotulo: 'IERIC',
    base: 'dotacion',
    de: 'pagado',
    parametros: [RANGO_IERIC],
    nota: 'POR TRABAJADOR REGISTRADO, no % de la masa. Con el parámetro en 0 se usa lo medido de lo pagado.',
  },
  {
    rotulo: 'FODECO',
    base: 'dotacion',
    de: 'pagado',
    parametros: [RANGO_FODECO],
    nota: 'POR TRABAJADOR, ídem IERIC.',
  },
]

/**
 * Los jornales netos de un mes: el PRIMER eslabón de la cadena. NO es una suma simple: la pestaña de
 * quincenas tiene dos bloques y hay que sumar los dos. La expresión se reusa tal cual de la proyección
 * anterior — dos versiones del mismo cálculo es exactamente lo que la regla de oro prohíbe.
 *
 * La "FRAGILIDAD DECLARADA" que decía este comentario —rangos de fila fijos que dejaban de sumar
 * bien sin dar error— se pagó el 23/07 y se saldó con rangos con nombre. Ver abajo.
 */
export function jornalesDelMes(fecha) {
  // POR RANGO CON NOMBRE, NO POR NÚMERO DE FILA. Acá decía `$A$3:$A$16` y `$A$23:$A$33`, con este
  // comentario al lado: "FRAGILIDAD DECLARADA: los rangos están fijos. Si la pestaña cambia de
  // geometría, esto deja de sumar bien SIN dar error". Pasó exactamente eso el 23/07, cuando se
  // rehizo Jornales y las quincenas reales se mudaron de la fila 3 a la 41. Los nombres los publica
  // el generador de esa pestaña en cada corrida y se mueven con ella.
  //
  // Tampoco hace falta ya el filtro "sólo las anteriores a la primera proyectada": la proyección
  // arranca el día siguiente al último día pagado, así que los dos bloques no se pueden solapar.
  const real = `SUMPRODUCT((YEAR(JORNALES_REAL_DESDE)=YEAR(${fecha}))*(MONTH(JORNALES_REAL_DESDE)=MONTH(${fecha}))*JORNALES_REAL_TOTAL)`
  const proy = `SUMPRODUCT((YEAR(JORNALES_PROY_DESDE)=YEAR(${fecha}))*(MONTH(JORNALES_PROY_DESDE)=MONTH(${fecha}))*JORNALES_PROY_TOTAL)`
  return `${real}+${proy}`
}

/**
 * NÚCLEO PURO: la alícuota de FCL ponderada por la antigüedad real del plantel.
 *
 * `p` es la proporción del plantel que lleva MENOS de un año. Sale por fórmula de la fecha de ingreso
 * del espejo: `COUNTIFS(C; ">" & EDATE(TODAY();-12)) / COUNTA(B)`.
 *
 * @param {string} celdaProporcion la celda con esa proporción
 * @returns {string} expresión (sin '=') de la alícuota
 */
export function expresionAlicuotaFCL(celdaProporcion) {
  return `(${celdaProporcion}*${RANGO_FCL_PRIMER_ANIO}+(1-${celdaProporcion})*${RANGO_FCL_POSTERIOR})`
}

/**
 * NÚCLEO PURO: la proporción del plantel con menos de un año de antigüedad, medida sobre el bloque
 * del espejo. Columna C = fecha de ingreso, columna B = nombre.
 *
 * SE MIDE, NO SE SUPONE. La auditoría lo dijo con todas las letras: la fecha de ingreso está en la
 * misma fuente que ya se lee todos los días y no tenía un solo consumidor.
 */
export function formulaProporcionPrimerAnio(hoja, bloque) {
  if (!bloque) return '=""'
  const B = `'${hoja}'!$B$${bloque.inicio}:$B$${bloque.fin}`
  const C = `'${hoja}'!$C$${bloque.inicio}:$C$${bloque.fin}`
  return `=IFERROR(COUNTIFS(${C};">"&EDATE(TODAY();-12);${C};">0")/COUNTA(${B});"")`
}

/** Cuánto pueden separarse la dotación de la DDJJ y el plantel de la planilla antes de ser un error. */
export const TOLERANCIA_PLANTEL = 0.3

/**
 * NÚCLEO PURO: ¿la dotación de la DDJJ y el plantel de la planilla hablan de la misma empresa?
 *
 * ═══ EL CONTROL SIGUE, LA CELDA NO (09/09/2026) ═══
 *
 * Era un renglón de la sección 3 con un veredicto en glifo («▲» / «✓») en la columna C: el dueño
 * mandó sacar de la pestaña los glifos y las explicaciones, y un control cuyo resultado es un
 * triangulito en el medio de una grilla de plata no lo mira nadie. Baja acá, donde se puede PROBAR
 * que da rojo, y su veredicto sale por el log de la corrida — que es donde lo ve quien puede cargar
 * el dato que falta. Es el mismo trato que ya tienen los hallazgos de dominio de esta pestaña.
 *
 * NO SE APAGÓ: sigue cruzando DOS FUENTES DISTINTAS —la cabecera de la DDJJ y el registro de
 * quincenas de `_J_OBREROS`—, que es lo único que lo hace un control y no una tautología. La DDJJ
 * incluye oficina y la planilla de obra no, así que una diferencia chica es esperable y una grande
 * es un dato mal cargado.
 *
 * @param {{dotacion:number|null, plantel:number|null}} d
 * @returns {{diverge:boolean, motivo:string, brecha:number|null}}
 */
export function divergenciaDePlantel({ dotacion, plantel } = {}) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  const d = n(dotacion)
  const p = n(plantel)
  // NO PODER MIRAR NO ES DECIR QUE NO. Sin una de las dos cifras el control no tiene veredicto, y
  // devolver `diverge: false` sería un verde que nadie midió.
  if (d === null || p === null) return { diverge: false, motivo: 'sin-dato', brecha: null }
  const brecha = Math.abs(d - p) / d
  return { diverge: brecha > TOLERANCIA_PLANTEL, motivo: 'medido', brecha }
}

/**
 * LOS PARÁMETROS DE ESTA PESTAÑA, INCLUIDO EL QUE CALCULA EL OS.
 *
 * Los normativos son constantes que el dueño firma y que ninguna corrida pisa. El de antigüedad es
 * una FÓRMULA que apunta al bloque de quincena vigente, así que viaja con `refrescar: true` y se
 * reescribe siempre: es la única forma de que no se fosilice apuntando al plantel de la quincena
 * anterior. Sin bloque no se declara el parámetro — un rango con nombre sobre una celda que dice
 * `""` haría que el FCL se proyecte con la alícuota del segundo año para todo el plantel, en
 * silencio; que falte el nombre, en cambio, deja la celda en `#NAME?` y se ve.
 *
 * @param {{inicio:number, fin:number}|null} bloqueBase el bloque del plantel en `_J_OBREROS`
 */
export function parametrosDeCargas(bloqueBase = null) {
  if (!bloqueBase) return [...PARAMETROS_CARGAS]
  return [...PARAMETROS_CARGAS, {
    rango: RANGO_PROPORCION_PRIMER_ANIO,
    rotulo: 'FCL — proporción del plantel en su primer año',
    valor: formulaProporcionPrimerAnio('_J_OBREROS', bloqueBase),
    refrescar: true,
    nota: 'LO CALCULA EL OS, no lo edites: fecha de ingreso de cada persona en _J_OBREROS, sobre el '
      + 'plantel de la quincena vigente. Es lo que pondera las dos alícuotas del Fondo de Cese, y se '
      + 'recalcula en cada corrida porque el bloque de la quincena se mueve.',
  }]
}

/**
 * NÚCLEO PURO: la expresión de la alícuota/costo de un concepto, y el texto que la explica.
 *
 * @param {object} c            un elemento de CONCEPTOS_CADENA
 * @param {object} ref          { origen, fRem, fEmp, reales(fila) } referencias del bloque histórico
 * @returns {{alicuota:string, celda:(m:number)=>string, origen:string}}
 */
export function proyeccionDeConcepto(c, {
  filaOrigen, fRem, fEmp, reales, colMes, fRemProy, fDot, celdaProporcion,
}) {
  const medidaRem = `IFERROR(SUM(${reales(filaOrigen)})/SUM(${reales(fRem)});0)`
  const medidaDot = `IFERROR(SUM(${reales(filaOrigen)})/SUM(${reales(fEmp)});0)`
  if (c.base === 'antiguedad') {
    const ali = expresionAlicuotaFCL(celdaProporcion)
    return {
      alicuota: ali,
      celda: (m) => `=(${ali})*${colMes(m)}$${fRemProy}`,
      // El origen SE ESCRIBE POR FÓRMULA: así el texto dice la alícuota que efectivamente se aplicó,
      // no la que había el día que corrió el generador.
      origen: `=TEXT(${ali};"0,00%")&" de la remuneración — alícuota LEGAL ponderada por antigüedad ("&TEXT(${celdaProporcion};"0%")&" del plantel en su primer año). ${A_VERIFICAR}: el porcentaje de la Ley 22.250 no está verificado en el OS, corregilo en Parámetros. Medido sobre lo pagado la alícuota daba "&TEXT(${medidaRem};"0,00%")&"."`,
    }
  }
  if (c.base === 'dotacion') {
    // Con parámetro cargado manda el parámetro; en 0, lo medido. Un IF en la celda y no en el código:
    // el criterio tiene que poder cambiarse sin tocar JavaScript.
    const p = c.parametros?.[0]
    const valor = p ? `IF(N(${p})>0;${p};${medidaDot})` : medidaDot
    return {
      alicuota: valor,
      celda: (m) => `=(${valor})*${colMes(m)}$${fDot}`,
      origen: p
        ? `="$"&TEXT(${valor};"#,##0")&" por trabajador y por mes — "&IF(N(${p})>0;"del parámetro ${p}";"MEDIDO de lo pagado ÷ empleados: ${A_VERIFICAR}, IERIC y FODECO se pagan por trabajador y la norma no está en el OS")&". ${(c.nota ?? '').replace(/"/g, "'")}"`
        : `="$"&TEXT(${valor};"#,##0")&" por empleado por mes, medido sobre los meses reales. ${(c.nota ?? '').replace(/"/g, "'")}"`,
    }
  }
  return {
    alicuota: medidaRem,
    celda: (m) => `=(${medidaRem})*${colMes(m)}$${fRemProy}`,
    origen: `=TEXT(${medidaRem};"0,00%")&" de la remuneración declarada, medido sobre los meses con DDJJ. ${(c.nota ?? '').replace(/"/g, "'")}"`,
  }
}

/**
 * EL ÍNDICE DEL PRÓXIMO VENCIMIENTO DE F931: el primer período que NO PASÓ **Y NO ESTÁ PAGADO**.
 *
 * ═══ EL DEFECTO QUE ESTO CORRIGE (09/09/2026) ═══
 *
 * El titular decía «⇒ Próximo vencimiento · $8.331.698 · 10/09/2026»: el F931 de AGOSTO, que ya está
 * pagado. La propia pestaña lo prueba dos filas más abajo — el cuadro 2 tiene «F931 · sep-26
 * $8.331.698», leído de Compras con el pago marcado. El titular anunciaba como deuda una plata que
 * ya salió del banco, y el dueño lo vio en el extracto: *«lo muestra pagado más de una vez»*.
 *
 * La fórmula vieja era `COUNTIF(FECHAS;"<"&TODAY())+1` — «la primera fecha que no pasó», sin una
 * palabra sobre si esa obligación seguía viva. Una fecha futura no es una deuda: entre el día del
 * pago y el día del vencimiento hay una ventana en la que las dos cosas son ciertas a la vez, y ésa
 * es justo la ventana en la que alguien mira el titular para decidir cuánta caja reservar.
 *
 * LA REGLA, ESCRITA CONTRA LOS DOS HECHOS QUE LA PESTAÑA YA TIENE:
 *   · la fecha de salida del período (`CARGAS_MES_FECHAS`) todavía no pasó, y
 *   · en el mes en que esa plata salía, el cuadro 2 no registra pago de F931.
 *
 * EL DESPLAZAMIENTO NO ES UN TRUCO, ES EL CALENDARIO. El devengado del mes m sale el mes m+1, así
 * que el pago del período m vive en la columna m+1 del cuadro 2. Por eso las fechas se leen desde la
 * columna A —el rótulo— y los pagos desde la B: en la posición k quedan la fecha del período k−1 y
 * el pago del mes k, que son la misma obligación. `N()` sobre el rótulo devuelve 0, y 0 nunca es
 * mayor o igual que hoy: el período «0» se descarta solo, sin un caso especial que alguien pueda
 * borrar sin darse cuenta.
 *
 * SI NO ENCUENTRA NINGUNO, VUELVE A LA REGLA VIEJA. Pasa cuando el único vencimiento que queda es el
 * de diciembre, cuyo pago cae en enero del año siguiente y esta grilla no llega a registrar. Un
 * titular que se apaga es peor que uno conservador: el fallback muestra el vencimiento aunque no
 * pueda probar que sigue impago.
 *
 * @param {{fFechas:number, fPagoF931:number, nombreFechas:string}} g las filas de la grilla ya armada
 * @returns {string} una EXPRESIÓN (sin `=`) que da la posición 1..12 del período a mostrar
 */
export function indiceProximoVencimiento({ fFechas, fPagoF931, nombreFechas }) {
  // ARRAYFORMULA es obligatorio: sin él `N()` se aplica sólo a la primera celda del rango y el MATCH
  // compara un escalar contra un escalar — devuelve 1 siempre y el titular miente en silencio.
  const vivo = `ARRAYFORMULA((N($A$${fFechas}:$L$${fFechas})>=TODAY())*(N($B$${fPagoF931}:$M$${fPagoF931})=0))`
  return `IFERROR(MATCH(1;${vivo};0)-1;COUNTIF(${nombreFechas};"<"&TODAY())+1)`
}
