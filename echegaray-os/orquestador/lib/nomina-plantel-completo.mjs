// LO QUE «Nómina» NO ESTABA CONTANDO: LOS QUE SE FUERON Y LA GENTE DE OFICINA.
//
// ═══ EL DEFECTO, MEDIDO EN EL ARCHIVO VIVO (21/09/2026) ═══
//
// El cuadro 1 lista 17 personas y suma $115.912.477 de enero a agosto. En esos mismos ocho meses se
// pagaron $182.762.688. Faltan dos poblaciones enteras:
//
//   · los 22 DESVINCULADOS del año — $50.098.968, medidos contra el espejo `_J_OBREROS`;
//   · OFICINA — $24.330.363, que «Jornales por Quincena» ya publica mes a mes.
//
// Eso solo sería una omisión. Lo grave es lo que el cuadro 2 hace con ese total: le aplica las
// alícuotas y lo compara contra el F931 ENTERO, que en agosto declara 25 empleados. La fila
// «Diferencia contra F931» publica −$18.644.120 como si fuera un desvío del modelo.
//
// ═══ Y NO ERA UN DESVÍO DEL MODELO ═══
//
//   remuneración declarada ene–ago            $91.925.219
//   lo pagado con las dos poblaciones adentro $182.762.688  → % en blanco implícito 50,3 %
//
// El dueño tiene 50 % puesto a mano en `NOMINA_PCT_BLANCO`. El supuesto estaba bien dentro del 0,6 %:
// lo que faltaba era GENTE. Un control que compara dos poblaciones distintas no puede dar verde
// nunca, y un rojo estructural que no se puede cerrar deja de mirarse — arrastrando con él a los
// controles que sí pueden dar rojo.
//
// ═══ POR QUÉ DOS RENGLONES Y NO VEINTIDÓS ═══
//
// El dueño ordenó *«los inactivos quitar»* y esa orden no se toca: los desvinculados no vuelven a
// listarse con nombre y apellido. Vuelve su PLATA, agrupada, que es lo único que hace falta para que
// el total sea el total y para que la comparación contra el F931 signifique algo.
//
// ═══ POR QUÉ LOS DESVINCULADOS SON NÚMEROS Y OFICINA ES FÓRMULA ═══
//
// En `_J_OBREROS` los desvinculados no están marcados: son las personas que no aparecen en el último
// bloque de quincena, y eso no se puede preguntar desde una celda. Es el caso que `nomina-sync`
// describe —«lo que en el Sheet NO puede ser una fórmula»— y por eso lo recalcula un script en cada
// corrida en vez de quedar pegado una vez. Oficina, en cambio, ya vive en «Jornales por Quincena»
// con su propia fila por mes: se referencia, no se copia.

export const ROTULO_DESVINCULADOS = 'Desvinculados en el año'
export const ROTULO_OFICINA = 'Oficina'
export const ROTULO_SAC = 'SAC · aguinaldo (ley 23.041)'

/** La columna del mes `m` (1..12) en la grilla de «Nómina»: ene es D. */
export const colMes = (m) => String.fromCharCode(68 + m - 1)

/**
 * NÚCLEO PURO: los doce meses de los que ya no están, sumados.
 *
 * Un mes en CERO queda en `0` acá y se escribe VACÍO en la pestaña: los desvinculados dejaron de
 * cobrar en agosto, y un cero en septiembre afirma que ese mes cobraron nada cuando lo cierto es que
 * ya no están. La distinción importa porque la fila de abajo multiplica estos números por alícuotas.
 */
export function devengadoDeLosQueSeFueron(dev, desafectados = [], { anio = 2026 } = {}) {
  const porMes = Array(12).fill(0)
  const sinDato = []
  for (const p of desafectados) {
    const d = dev.get(p.clave)
    // UNA PERSONA SIN DEVENGADO MEDIBLE NO SE CUENTA EN CERO EN SILENCIO: se nombra. Su plata queda
    // afuera del renglón y quien corre el script tiene que poder enterarse.
    if (!d) { sinDato.push(p.nombre); continue }
    for (const [mes, v] of d.meses) {
      if (!String(mes).startsWith(String(anio))) continue
      porMes[Number(String(mes).slice(5, 7)) - 1] += Number(v?.importe ?? 0)
    }
  }
  return { porMes, personas: desafectados.length, sinDato }
}

/**
 * DÓNDE VAN LAS FILAS — POR RÓTULO, NUNCA POR NÚMERO.
 *
 * «Nómina» está hecha a mano y nadie la regenera: anclar en la fila 27 da un cuadro distinto el día
 * que alguien inserte un renglón. Se buscan los dos «TOTAL» —el del cuadro 1 y el del cuadro 2— por
 * el título de sección que tienen encima, que es lo único estable.
 *
 * @param {any[][]} grid la pestaña leída con render FORMULA, base 0
 * @returns {{uno:{primera:number,ultima:number,total:number}, dos:{...}, yaEstan:string[], error?:string}}
 */
export function ubicarCuadros(grid = []) {
  const A = (i) => String(grid[i]?.[0] ?? '').trim()
  const buscar = (re) => grid.findIndex((_, i) => re.test(A(i)))
  const iUno = buscar(/^1 · NÓMINA/i)
  const iDos = buscar(/^2 · CARGAS SOCIALES/i)
  if (iUno < 0) return { error: 'no encontré el título «1 · NÓMINA …»' }
  if (iDos < 0) return { error: 'no encontré el título «2 · CARGAS SOCIALES …»' }
  const totalDe = (desde, hasta) => {
    for (let i = desde; i < hasta; i++) if (/^TOTAL$/i.test(A(i))) return i + 1
    return -1
  }
  const tUno = totalDe(iUno, iDos)
  const tDos = totalDe(iDos, grid.length)
  if (tUno < 0) return { error: 'el cuadro 1 no tiene fila «TOTAL»' }
  if (tDos < 0) return { error: 'el cuadro 2 no tiene fila «TOTAL»' }
  // La primera persona es la fila siguiente al encabezado («Persona | …»), y la última, la anterior
  // al TOTAL descontando las filas que este script ya haya puesto antes.
  const mias = new Set([ROTULO_DESVINCULADOS, ROTULO_OFICINA, ROTULO_SAC])
  const yaEstan = []
  const cuadro = (iTitulo, total) => {
    const primera = iTitulo + 3 // título, encabezado, primera persona (1-based)
    let ultima = total - 1
    while (ultima >= primera && mias.has(A(ultima - 1))) { yaEstan.push(`${A(ultima - 1)} (fila ${ultima})`); ultima-- }
    return { primera, ultima, total }
  }
  return { uno: cuadro(iUno, tUno), dos: cuadro(iDos, tDos), yaEstan }
}

/** La fila del cuadro 1 para un grupo: rótulo en A y los doce meses desde D. */
export function filaDeGrupo(rotulo, celdas = [], { ancho = 16 } = {}) {
  const fila = Array(ancho).fill('')
  fila[0] = rotulo
  celdas.forEach((v, i) => { fila[3 + i] = v })
  fila[15] = `=SUM(D{F}:O{F})`
  return fila
}

/** Los doce meses de los desvinculados, listos para la pestaña: cero se escribe vacío. */
export const celdasDesvinculados = ({ porMes = [] } = {}) => porMes.map((v) => (v > 0 ? Math.round(v) : ''))

/**
 * OFICINA SE REFERENCIA, NO SE COPIA.
 *
 * «Jornales por Quincena» publica oficina mes a mes en su cuadro 1.1, con lo pagado y lo proyectado
 * en dos columnas: el mes vale lo pagado cuando está cerrado y lo proyectado cuando no. La fila se
 * ancla por el RÓTULO del mes dentro de ese cuadro y no por su número, por el mismo motivo que todo
 * lo demás en este archivo.
 */
export function celdasOficina(meses = [], { hoja = 'Jornales por Quincena', bloque } = {}) {
  const H = `'${hoja}'`
  // EL RANGO ES EL DEL BLOQUE DE OFICINA, NO «LA PRIMERA FILA QUE DIGA ENERO». En esa pestaña los
  // doce meses aparecen DOS veces —oficina en el cuadro 1.1 y los retiros de Dirección en el 1.2—,
  // así que un MATCH sobre la columna entera trae el primero que encuentre y el día que se inviertan
  // los cuadros esta fila publicaría los retiros de los dueños como si fueran sueldos de oficina.
  // El rango se resuelve leyendo la pestaña y Google lo reapunta solo si alguien inserta filas allá.
  if (!bloque || !bloque.desde || !bloque.hasta) throw new Error('celdasOficina necesita el rango del cuadro de oficina')
  const { desde, hasta } = bloque
  const busca = `MATCH("{M}";${H}!$A$${desde}:$A$${hasta};0)`
  return meses.map((nombre) => {
    const m = busca.replace('{M}', nombre)
    return `=IFERROR(N(INDEX(${H}!$C$${desde}:$C$${hasta};${m}))+N(INDEX(${H}!$H$${desde}:$H$${hasta};${m}));0)`
  })
}

/**
 * DÓNDE EMPIEZA Y TERMINA EL CUADRO DE OFICINA EN «Jornales por Quincena».
 *
 * Se ancla al título de sección —lo único estable— y corta en el total del cuadro. Si el título no
 * está, no se adivina: el llamador tiene que decidir, porque una fila de oficina apuntando al rango
 * equivocado publica los retiros de Dirección como sueldos.
 */
export function bloqueDeOficina(grid = []) {
  const A = (i) => String(grid[i]?.[0] ?? '').trim()
  const i0 = grid.findIndex((_, i) => /^1\.1 · OFICINA/i.test(A(i)))
  if (i0 < 0) return { error: 'no encontré el título «1.1 · OFICINA …» en Jornales por Quincena' }
  for (let i = i0 + 1; i < grid.length; i++) {
    if (/^⇒/.test(A(i))) return { desde: i0 + 2, hasta: i } // 1-based: del encabezado al renglón previo al total
  }
  return { error: 'el cuadro de oficina no tiene fila de total' }
}

/**
 * LAS CARGAS DE UN GRUPO — LA MISMA CUENTA QUE LA DE UNA PERSONA, SIN LA FECHA DE INGRESO.
 *
 * La fórmula por persona del cuadro 2 elige la alícuota del Fondo de Cese según la antigüedad de esa
 * persona (12 % el primer año, 8 % después). Un renglón agrupado no tiene UNA fecha de ingreso, así
 * que usa la PROPORCIÓN del plantel en su primer año, que «Parámetros» ya publica con su rango con
 * nombre y que la pestaña «Cargas Sociales» usa para exactamente lo mismo. No es un criterio nuevo:
 * es el mismo, ponderado.
 *
 * EL SEGURO DE VIDA QUEDA AFUERA Y SE DICE: son $399 por persona y por mes —menos de $9.000 para los
 * veintidós— y el renglón no sabe cuánta gente hubo cada mes. Preferir la ausencia a un número
 * inventado es la regla de la casa; el orden de magnitud dice que no cambia ninguna decisión.
 *
 * @param {string} celdaNeto la celda del cuadro 1 con el neto del mes (p.ej. `D27`)
 */
export function cargasDeUnGrupo(celdaNeto, { proporcion = 'CARGAS_PROPORCION_PRIMER_ANIO' } = {}) {
  const fcl = `(${proporcion}*$J$5+(1-${proporcion})*$K$5)`
  const base = `N(${celdaNeto})*NOMINA_PCT_BLANCO`
  return `=IF(N(${celdaNeto})=0;"";${base}/(1-$D$5)*(1+$E$5+$F$5+$G$5+$I$5+${fcl}*(1+$L$5+$M$5))-${base})`
}

/**
 * EL AGUINALDO, QUE NO ESTABA EN NINGÚN LADO.
 *
 * El modelo del cuadro 2 no tenía SAC: por eso junio —el mes de la primera cuota— era el peor de
 * todos contra el F931 (−42,5 %). Acá se calcula como manda la ley 23.041: **medio sueldo, sobre el
 * mejor mes de CADA PERSONA en su semestre**, no sobre el mejor mes del total. La diferencia importa:
 * un mes alto por más gente no le agranda el aguinaldo a nadie.
 *
 * `BYROW(...;LAMBDA(r;MAX(r)))` da el mejor mes de cada fila del cuadro 1, y `SUMPRODUCT` los suma.
 *
 * SI EL SAC DEVENGA FONDO DE CESE ES NORMATIVO Y NO ESTÁ VERIFICADO EN ESTE REPOSITORIO: se aplica
 * el mismo factor que a la remuneración del mes —que es el tratamiento general— y queda declarado
 * al lado del número, para que el contador lo confirme o lo corrija.
 *
 * @param {{p0:number,p1:number}} personas primera y última fila del cuadro 1
 * @param {number[]} meses los meses del semestre (1..6 o 7..12)
 */
export function formulaDelSac({ p0, p1 }, meses = [], { proporcion = 'CARGAS_PROPORCION_PRIMER_ANIO' } = {}) {
  const desde = colMes(meses[0])
  const hasta = colMes(meses[meses.length - 1])
  const mejor = `SUMPRODUCT(BYROW($${desde}$${p0}:$${hasta}$${p1};LAMBDA(r;MAX(r))))/2`
  const fcl = `(${proporcion}*$J$5+(1-${proporcion})*$K$5)`
  return `=IFERROR(${mejor}*NOMINA_PCT_BLANCO/(1-$D$5)*(1+$E$5+$F$5+$G$5+$I$5+${fcl}*(1+$L$5+$M$5))-${mejor}*NOMINA_PCT_BLANCO;"")`
}

/** La suma de una columna del cuadro, desde la primera persona hasta la última fila propia. */
export const sumaDeLaColumna = (col, desde, hasta) => `=SUM(${col}${desde}:${col}${hasta})`

/**
 * EL «% EN BLANCO MEDIDO» — LA CELDA QUE DECÍA 56,9 % Y NO MEDÍA UN % EN BLANCO.
 *
 * ═══ QUÉ DECÍA Y POR QUÉ ESTABA MAL (21/09/2026) ═══
 *
 * Era `='Cargas Sociales'!J36*(1-D5)` y publicaba 56,9 % bajo el rótulo «% en blanco medido». J36 es
 * la remuneración declarada dividida por los jornales netos **de obreros solos**: oficina no está en
 * el denominador. El 56,9 % es el subproducto de esa mezcla, no una medición de cuánto se paga en
 * blanco. Y estaba anclada a la CELDA J36 de la otra pestaña —un número de fila— así que el día que
 * «Cargas Sociales» crezca una fila, esta celda pasa a leer otra cosa sin dar un solo error.
 *
 * ═══ QUÉ MIDE AHORA ═══
 *
 *   neto en blanco   =  remuneración declarada (BRUTA, F931)  ×  (1 − aportes del empleado)
 *   % en blanco      =  neto en blanco  ÷  neto total pagado, en LOS MISMOS MESES
 *
 * Los dos lados tienen que ser NETOS: el error de la celda vieja —y el que yo mismo cometí al leerla—
 * es comparar un bruto contra un neto. Medido sobre enero–agosto con las dos poblaciones que faltaban
 * adentro del cuadro: **38,6 %**, contra el 50 % que está puesto a mano.
 *
 * LOS MESES LOS CUENTA EL DATO, NO UNA CONSTANTE: `COUNT` sobre la fila declarada dice cuántos meses
 * tienen DDJJ y `OFFSET` toma exactamente esos del total del cuadro 1. En septiembre son ocho; en
 * octubre serán nueve, sin que nadie toque nada.
 */
export function formulaBlancoMedido({ filaTotal, hoja = 'Cargas Sociales' } = {}) {
  const H = `'${hoja}'`
  const rot = `MATCH("Remuneración declarada";${H}!$A$1:$A$80;0)`
  const fila = `INDEX(${H}!$B$1:$M$80;${rot};0)`
  const calculo = `SUM(${fila})*(1-$D$5)/SUM(OFFSET($D$${filaTotal};0;0;1;COUNT(${fila})))`
  // ═══ SE DIBUJA CON TEXT() Y NO CON UN FORMATO DE PORCENTAJE, Y HAY UN MOTIVO ═══
  //
  // La celda venía sin formato numérico propio y publicaba `0,3860502603`, que al lado de un 50 % no
  // se lee. Ponerle formato PERCENT lo rechaza la guarda —«ese rango ya tiene un formato que yo no
  // puse»— porque el diseño de «Nómina» es del dueño, y la única forma de forzarlo sería borrar las
  // 66 huellas de formato de la pestaña: eso dejaría a `formato-pestanas.mjs`, que corre en el
  // pipeline, libre para reformatearle la pestaña entera. El remedio sería peor que el defecto.
  //
  // Devolver el texto ya formateado no toca el formato de nadie. Se puede hacer porque esta celda NO
  // TIENE CONSUMIDOR: ningún rango con nombre la publica y ninguna fórmula la lee —`Cargas Sociales`
  // lee `NOMINA_PCT_BLANCO` (B5) y `$D$5`, nunca ésta—. Es un indicador para leer, no una entrada.
  // El día que algo necesite el número, se parte en dos celdas: el número y su rótulo.
  // EL PATRÓN VA EN US AUNQUE EL ARCHIVO SEA es_AR, y acá costó un decimal: con `"0,0%"` Google lee
  // la coma como separador de MILES, el patrón queda sin decimales y 38,6 % se publicó como «39%».
  // Con `"0.0%"` la API interpreta el punto como el decimal y lo MUESTRA con la coma del locale.
  return `=IFERROR(TEXT(${calculo};"0.0%");"")`
}

/** Lo que la celda de abajo declara: contra qué se midió. */
export const NOTA_BLANCO_MEDIDO = 'neto en blanco ÷ neto total pagado, en los meses con DDJJ'

/**
 * LOS TRES RETIROS DE DIRECCIÓN, ANCLADOS AL NOMBRE Y NO A LA FILA.
 *
 * ═══ EL DEFECTO, MEDIDO EL 21/09/2026 ═══
 *
 * El cuadro 4 de «Nómina» leía `'Jornales por Quincena'!B56`, `B57` y `B58` — tres números de fila
 * escritos a mano. El día que «Jornales» perdió UNA fila —la quincena 11–15/09 que se contaba dos
 * veces— el bloque de Dirección subió un renglón y las tres referencias se corrieron: las dos
 * primeras siguieron mostrando $3.000.000 porque los tres retiros son iguales (el error era
 * INVISIBLE) y la tercera cayó sobre la fila de total, que está vacía. Jorge Corona desapareció del
 * cuadro y «TOTAL DIRECCIÓN» pasó de $9.000.000 a $6.000.000 por mes: **$36.000.000 en el año**,
 * sin un solo error en pantalla.
 *
 * Es la regla del archivo aplicada a una celda: anclar al TEXTO, nunca a la posición. Una fila fija
 * da tres totales distintos según el día.
 */
export function formulaRetiroDeDireccion(persona, { hoja = 'Jornales por Quincena' } = {}) {
  const H = `'${hoja}'`
  return `=IFERROR(INDEX(${H}!$B$1:$B$80;MATCH("${persona}";${H}!$A$1:$A$80;0));"")`
}
