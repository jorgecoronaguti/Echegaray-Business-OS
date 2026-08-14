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

/** Los parámetros normativos que esta cadena necesita y que el repositorio no puede verificar solo. */
export const RANGO_FCL_PRIMER_ANIO = 'FCL_ALICUOTA_PRIMER_ANIO'
export const RANGO_FCL_POSTERIOR = 'FCL_ALICUOTA_POSTERIOR'
export const RANGO_IERIC = 'IERIC_POR_TRABAJADOR'
export const RANGO_FODECO = 'FODECO_POR_TRABAJADOR'
/** El día del mes en que sale de la caja el F931 del mes anterior. Es lo que fecha la serie del Libro. */
export const RANGO_DIA_PAGO_F931 = 'F931_DIA_DE_PAGO'

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
