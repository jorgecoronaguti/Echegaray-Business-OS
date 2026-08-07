// EL MOTOR SALARIAL — POR QUÉ LA PROYECCIÓN ANTERIOR NO SERVÍA Y QUÉ LA REEMPLAZA.
//
// ═══ LO QUE HABÍA ═══
//
//   Σ$/hora(última quincena) × 6,7 horas × días hábiles × factor IPC
//
// Cuatro cosas mal, y ninguna daba error:
//
//   1. LA BASE SALÍA DE LA QUINCENA EN CURSO. `INDEX(…;COUNTA(…))` toma la ÚLTIMA fila del registro,
//      que es la quincena a medio cargar: al 06/08 tenía un día de horas y un TOTAL de $262.800.
//      Todo el semestre colgaba de eso.
//   2. LAS 6,7 HORAS ERAN EL PROMEDIO DEL AÑO ENTERO, ausentismo de enero incluido, contra un
//      parámetro "Horas por jornada = 9" que la misma pestaña usa para las horas previstas.
//   3. EL AJUSTE ERA EL IPC. El jornal de obra no sube por el IPC: sube por la PARITARIA, que es otra
//      serie, se publica en actas con vigencia y en 2026 corrió muy por encima del IPC.
//   4. DOBLE CONTEO EN LA PRIMERA QUINCENA. El Σ$/hora ya era de agosto y el factor acumulado también
//      arrancaba en julio: agosto se ajustaba dos veces.
//
// ═══ LO QUE HACE ESTE MOTOR ═══
//
// Proyecta lo que EFECTIVAMENTE PAGAMOS, no la escala: cada persona tiene su $/hora real en la
// planilla (arriba o abajo del convenio) y su categoría. Lo que sube es el ESCALÓN del convenio, y
// sube parejo para las cinco categorías —medido: entre julio y agosto las cinco se movieron entre
// 9,11% y 9,13%, una divergencia de 0,02 puntos—. Entonces:
//
//   Proyectado(quincena) = Σ$/hora(plantel de la última quincena CERRADA)
//                          × factor(mes de la quincena)          ← escalón del convenio, medido
//                          × horas por persona y día (medidas en una ventana reciente)
//                          × días hábiles de la quincena
//
//   factor(M) = básico_Ayudante(M) / básico_Ayudante(mes base)          si M tiene acuerdo publicado
//   factor(M) = factor(M-1) × (1 + AUMENTO_SALARIAL_ESPERADO)           si no lo tiene
//
// El mes base es el de la última quincena cerrada, y su factor es 1,0000 POR CONSTRUCCIÓN: el doble
// conteo de inflación de la primera quincena no puede volver, no porque se haya corregido un número
// sino porque no hay dónde escribirlo.
//
// ═══ POR QUÉ NO SE PROYECTA CATEGORÍA POR CATEGORÍA ═══
//
// Se podría, y sería peor. La planilla codifica la categoría como "OF", "A", "OF M", "A M", "M",
// "AY", "C" y NO existe en ningún lado la tabla que las traduce a las cinco del CCT. Inventar esa
// equivalencia para poder mostrar un cuadro más lindo es exactamente lo que este repositorio prohíbe.
// Lo que sí se hace: el plantel se ABRE por código de categoría —la columna D del espejo, que hasta
// hoy no tenía un solo consumidor— y la traducción al convenio queda como una columna que carga el
// dueño. En cuanto la escribe, el control por categoría se enciende solo.

import { VACIO } from './preservar-anotaciones.mjs'
import { sub, total as rotuloTotal } from './patron-pestana.mjs'
import {
  CATEGORIA_ANCLA, COL as UOCRA_COL, HOJA as UOCRA_HOJA,
  escalonDe, escalonPromedio, estadoReplica, ultimoEscalon,
} from './uocra-acuerdos.mjs'

export const RANGO_AUMENTO = 'AUMENTO_SALARIAL_ESPERADO'
export const RANGO_MESES_BASE = 'JORNALES_MESES_BASE'
/** El rótulo del parámetro, en un solo lugar: lo cita la nota, el cuadro y `ubicarParametros`. */
export const ROTULO_AUMENTO = 'Aumento salarial esperado por mes (paritaria, sin acuerdo publicado)'
/** Ventana por defecto para medir el ritmo real de horas. Tres meses = seis quincenas cerradas. */
export const MESES_BASE_DEFAULT = 3

/**
 * NÚCLEO PURO: el parámetro del aumento esperado, con su valor propuesto y su derivación.
 *
 * NO ES EL IPC, Y ESO VA ESCRITO EN LA NOTA. Son dos series distintas: el IPC mide precios al
 * consumidor y lo publica el INDEC; el escalón salarial sale de una paritaria que se negocia. Usar
 * uno en lugar del otro "porque los dos son porcentajes mensuales" es el error que este motor viene a
 * sacar de la pestaña. Los meses CON acuerdo publicado ni siquiera lo miran.
 *
 * EL VALOR PROPUESTO SE MIDE SOBRE EL BÁSICO PUBLICADO, NO SOBRE EL % DEL RÓTULO. El rótulo de agosto
 * dice "+1,9%" y el básico de Ayudante subió 9,11%: el básico absorbe sumas no remunerativas que el
 * porcentaje no menciona. Con los rótulos la proyección queda corta todos los meses.
 *
 * @param {Array} escalones salida de parsearAcuerdos
 * @returns {{rango:string, rotulo:string, valor:number, nota:string, derivacion:object|null}}
 */
export function parametroAumento(escalones = []) {
  const p6 = escalonPromedio(escalones, 6)
  const p12 = escalonPromedio(escalones, 12)
  const pct = (x) => (typeof x === 'number' ? `${(x * 100).toFixed(2).replace('.', ',')}%` : '—')
  const derivacion = p6
    ? `MEDIDO sobre el básico de ${CATEGORIA_ANCLA} de ${UOCRA_HOJA}: ${pct(p6.pct)}/mes promedio entre ${p6.desde} y ${p6.hasta} (${p6.meses} meses)`
      + (p12 ? `, y ${pct(p12.pct)}/mes sobre los últimos ${p12.meses}` : '')
      + `. Los rótulos de los acuerdos dicen ~${pct(p6.pctRotulos)}, pero el BÁSICO publicado sube más porque absorbe sumas no remunerativas: se usa el básico, que es el que pagamos.`
    : 'sin acuerdos suficientes en la réplica para medirlo'
  return {
    rango: RANGO_AUMENTO,
    rotulo: ROTULO_AUMENTO,
    valor: p6 ? p6.pct : 0.019,
    nota: `Sólo se aplica a los meses que NO tienen acuerdo publicado en ${UOCRA_HOJA}. ${derivacion}. `
      + 'NO ES EL IPC: el IPC mide precios y esto es una paritaria; usar uno por el otro fue el defecto que este motor vino a sacar. '
      + '⚠ A CONFIRMAR POR EL DUEÑO: este número gobierna la mitad del costo laboral proyectado del semestre. Cambialo acá y se mueve todo — Jornales, Cargas Sociales, el cash flow y CAJA.',
    derivacion: p6 ?? null,
  }
}

/** NÚCLEO PURO: el parámetro de la ventana con que se mide el ritmo real de horas. */
export const PARAMETRO_MESES_BASE = {
  rango: RANGO_MESES_BASE,
  rotulo: 'Meses hacia atrás para medir el ritmo real de horas',
  valor: MESES_BASE_DEFAULT,
  nota: 'Sobre cuántos meses de quincenas YA CERRADAS se mide "horas por persona y por día". Antes se promediaba el AÑO ENTERO, ausentismo de enero incluido, y daba 6,7 h contra una jornada de 9. Subilo para suavizar, bajalo para seguir el ritmo actual.',
}

export const PARAMETROS_MOTOR = (escalones) => [parametroAumento(escalones), PARAMETRO_MESES_BASE]

/**
 * NÚCLEO PURO: ¿cuál es la última quincena CERRADA del espejo?
 *
 * Cerrada = su último día de encabezado ya pasó. La planilla escribe las catorce fechas el día que
 * abre el bloque, así que la que está a medio cargar declara su fin en el futuro y se distingue sola.
 * Basar la proyección del semestre en un bloque con un día de horas cargado es frágil por
 * construcción — y era exactamente lo que hacía.
 *
 * @param {Array<{inicio:number, fin:number, filaFecha:number}>} bloques
 * @param {(b:object)=>Date|null} ultimoDiaDe  cómo sacar el último día de un bloque
 * @param {Date} hoy
 * @returns {{bloque:object, hasta:Date, indice:number}|null}
 */
export function ultimaQuincenaCerrada(bloques = [], ultimoDiaDe, hoy = new Date()) {
  for (let i = bloques.length - 1; i >= 0; i--) {
    const d = ultimoDiaDe(bloques[i])
    if (d && d <= hoy) return { bloque: bloques[i], hasta: d, indice: i }
  }
  return null
}

/**
 * NÚCLEO PURO: los códigos de categoría que trae un bloque del espejo, en el orden en que aparecen.
 * Es la columna D de `_J_OBREROS` — la que tenía cero consumidores.
 *
 * @param {any[][]} grid  el espejo completo
 * @param {{inicio:number, fin:number}} bloque
 * @returns {string[]}
 */
export function categoriasDelBloque(grid = [], bloque) {
  if (!bloque) return []
  const out = []
  for (let r = bloque.inicio; r <= bloque.fin; r++) {
    const c = String((grid[r - 1] ?? [])[3] ?? '').trim()
    if (c && !out.includes(c)) out.push(c)
  }
  return out
}

/** NÚCLEO PURO: cuántas personas tiene el bloque (columna B con nombre). */
export function personasDelBloque(grid = [], bloque) {
  if (!bloque) return 0
  let n = 0
  for (let r = bloque.inicio; r <= bloque.fin; r++) if (String((grid[r - 1] ?? [])[1] ?? '').trim()) n++
  return n
}

/**
 * NÚCLEO PURO: los meses a proyectar, del mes BASE (inclusive) al último mes con quincena pendiente.
 * El mes base entra con factor 1: es lo que hace imposible el doble conteo de la primera quincena.
 *
 * EL CUADRO TIENE QUE CUBRIR TAMBIÉN EL MES BASE DE OFICINA. La planilla de administración va
 * atrasada respecto de la de obra (medido: un mes), así que su proyección se ancla en OTRO mes. Si
 * ese mes no está en el cuadro, el `MATCH` no lo encuentra, el `IFERROR` devuelve 1 y los sueldos de
 * administración se proyectan SIN un solo aumento — en silencio, que es lo de siempre.
 *
 * @param {Date} base   último día de la última quincena cerrada
 * @param {Array<{hasta:Date, desde:Date}>} pendientes
 * @param {Array<Date|null>} anclas otros meses que tienen que estar (p. ej. el último de Oficina)
 * @returns {{anio:number, mes:number, periodo:string}[]}
 */
export function mesesDelMotor(base, pendientes = [], anclas = []) {
  if (!base) return []
  const out = []
  const empuja = (d) => {
    if (!d) return
    const y = d.getFullYear(); const m = d.getMonth() + 1
    const periodo = `${y}-${String(m).padStart(2, '0')}`
    if (!out.some((x) => x.periodo === periodo)) out.push({ anio: y, mes: m, periodo })
  }
  empuja(base)
  for (const a of anclas) empuja(a)
  for (const q of pendientes) empuja(q.hasta ?? q.desde)
  const orden = out.sort((a, b) => a.periodo.localeCompare(b.periodo))
  // SIN HUECOS: el factor de un mes se encadena con el del anterior. Un mes ausente en el medio
  // rompería la cadena y el siguiente arrancaría de un básico que no es el suyo.
  const lleno = []
  const [y0, m0] = orden[0].periodo.split('-').map(Number)
  const fin = orden[orden.length - 1].periodo
  for (let d = new Date(y0, m0 - 1, 1); ; d.setMonth(d.getMonth() + 1)) {
    const y = d.getFullYear(); const m = d.getMonth() + 1
    lleno.push({ anio: y, mes: m, periodo: `${y}-${String(m).padStart(2, '0')}` })
    if (lleno[lleno.length - 1].periodo >= fin) break
    if (lleno.length > 36) break
  }
  return lleno
}

/**
 * NÚCLEO PURO: la ÚNICA línea que pide lo que le falta al control de convenio para poder hablar.
 *
 * La columna "Convenio" es del dueño: él escribe a qué categoría de la escala UOCRA equivale cada
 * categoría de la planilla ("OF", "A M", …), y sin eso el bloque no puede comparar contra el básico.
 * Eso hay que decirlo, pero UNA vez y con la cuenta: "faltan 4 de 4" es una decisión de un vistazo;
 * la misma frase repetida en cada fila es ruido que empuja hacia abajo lo único que el bloque contesta.
 *
 * @param {number} f0 primera fila de categorías · @param {number} f1 última
 */
export const formulaConvenioPendiente = (f0, f1) => {
  const faltan = `COUNTBLANK($E$${f0}:$E$${f1})`
  const total = `COUNTA($A$${f0}:$A$${f1})`
  return `=IF(${faltan}=0;"   · las "&${total}&" categorías tienen su equivalente en la escala del convenio";`
    + `"   · faltan "&${faltan}&" de "&${total}&": escribí el equivalente del convenio en la columna «Convenio» y el control se enciende solo")`
}

/**
 * NÚCLEO PURO: las filas del bloque "1.1 · El plantel base", en el ancho de 8 columnas de la pestaña.
 *
 * @returns {{filas:any[][], fPrimera:number, fUltima:number, fTotal:number, canario:string}}
 */
export function filasPlantel({ hoja, bloque, categorias, personas, filaInicio, escalonVigente }) {
  const R = (c) => `'${hoja}'!$${c}$${bloque.inicio}:$${c}$${bloque.fin}`
  const D = R('D'); const W = R('W')
  const filas = []
  filas.push(['Categoría', 'Personas', 'Σ $/hora', '$/hora mínimo', 'Convenio', 'Básico convenio', 'Margen', 'Estado'])
  const fPrimera = filaInicio + 1
  // El grupo de cinco filas del mes vigente en la réplica, resuelto por el parser: sin esto el MATCH
  // por nombre de mes vuelve a caer en el año equivocado, que es el defecto B3.
  const g = escalonVigente
    ? { r0: escalonVigente.fila, r1: escalonVigente.fila + 4 }
    : null
  categorias.forEach((cat, i) => {
    const r = fPrimera + i
    const q = `"${cat}"`
    filas.push([
      cat,
      `=COUNTIFS(${D};${q})`,
      `=SUMIFS(${W};${D};${q})`,
      `=IFERROR(MINIFS(${W};${D};${q};${W};">0");"")`,
      // LA COLUMNA DEL DUEÑO. Cadena vacía = "no es mía, preservá lo que haya". Con el centinela, la
      // corrida siguiente le borraría lo que escribió — es el defecto que dejó OFICINA_BANCO ciego.
      '',
      g
        ? `=IFERROR(INDEX('${UOCRA_HOJA}'!$${UOCRA_COL.basico}$${g.r0}:$${UOCRA_COL.basico}$${g.r1};MATCH($E${r};'${UOCRA_HOJA}'!$${UOCRA_COL.categoria}$${g.r0}:$${UOCRA_COL.categoria}$${g.r1};0));"")`
        : '',
      `=IF(N($F${r})=0;"";$D${r}/$F${r}-1)`,
      // ═══ UN ESTADO, NO UNA INSTRUCCIÓN — Y MENOS REPETIDA UNA VEZ POR FILA (06/08) ═══
      //
      // Acá decía "escribí la categoría del convenio en la columna de al lado", y como ninguna de las
      // cuatro categorías tiene su equivalente cargado, la frase aparecía CUATRO VECES en el cuadro
      // que abre la pestaña. Un pedido no es un estado: se dice una vez, arriba del bloque, con la
      // cuenta de lo que falta (ver `formulaConvenioPendiente`). Acá va lo que la fila puede decir,
      // que sin convenio asignado es nada — y el "—" es el mismo vocabulario que usan los importes
      // vacíos de toda la pestaña.
      //
      // De paso: la frase medía 58 caracteres en una columna del MEDIO de una grilla de catorce. El
      // auditor de patrón marca las notas en el medio a partir de 60. Pasaba por dos caracteres.
      `=IF($E${r}="";"—";IF(N($F${r})=0;"esa categoría no está en la escala del mes";IF($G${r}<0;"⚠ por debajo del convenio";"✓ sobre el convenio")))`,
    ])
  })
  const fUltima = fPrimera + categorias.length - 1
  const fTotal = fUltima + 1
  filas.push([rotuloTotal('Plantel base — la última quincena cerrada'),
    `=SUM($B$${fPrimera}:$B$${fUltima})`, `=SUM($C$${fPrimera}:$C$${fUltima})`,
    `=IFERROR(MINIFS(${W};${W};">0");"")`, VACIO, VACIO, VACIO,
    // EL CANARIO DEL ESPEJO. Las filas del bloque las resuelve el generador en cada corrida; si la
    // corrida se saltea (candado, firma, freno de mano) y mientras tanto entra una quincena nueva, el
    // rango queda apuntando al bloque de antes y NO da error: da el plantel viejo. Esto lo dice.
    `=IF(COUNTA('${hoja}'!$B$${bloque.inicio}:$B$${bloque.fin})=${personas};"✓ el bloque del espejo sigue en su lugar";"⚠ el bloque del espejo se movió: estas filas ya no tienen ${personas} obreros. Corré espejar-jornales.mjs y después este generador — mientras tanto el plantel base está mal.")`])
  return { filas, fPrimera, fUltima, fTotal, canario: `${hoja}!${bloque.inicio}:${bloque.fin}` }
}

/**
 * NÚCLEO PURO: las filas del bloque "1.2 · El escalón del convenio, mes por mes".
 *
 * Ocho columnas, como todo el resto de la pestaña:
 *   A Mes · B Escalón publicado · C Básico Ayudante · D Sube en el mes · E Factor sobre la base ·
 *   F Σ $/hora del plantel · G De dónde sale · H Estado
 *
 * @returns {{filas:any[][], f0:number, f1:number, colMes:string, colSigma:string}}
 */
export function filasEscalon({ meses, escalones, filaInicio, celdaSigmaBase }) {
  const filas = []
  filas.push(['Mes', 'Escalón publicado', `Básico ${CATEGORIA_ANCLA}`, 'Sube en el mes', 'Factor sobre la base', 'Σ $/hora del plantel', 'De dónde sale', 'Estado'])
  const f0 = filaInicio + 1
  const ult = ultimoEscalon(escalones)
  meses.forEach((m, i) => {
    const r = f0 + i
    const e = escalonDe(escalones, m.periodo)
    const basicoFila = e?.categorias?.[CATEGORIA_ANCLA]?.fila ?? null
    const basico = basicoFila
      ? `=IFERROR(INDEX('${UOCRA_HOJA}'!$${UOCRA_COL.basico}$1:$${UOCRA_COL.basico};${basicoFila});"")`
      // Sin acuerdo publicado el básico se ESTIMA encadenando desde el último publicado, con el
      // parámetro. Se muestra igual —el lector tiene que poder ver de dónde sale el factor— y la
      // columna "De dónde sale" dice que es una estimación, no el acuerdo.
      : `=IFERROR($C${r - 1}*(1+${RANGO_AUMENTO});"")`
    filas.push([
      `=EOMONTH(DATE(${m.anio};${m.mes};1);0)`,
      // Sólo el escalón (112px ≈ 19 caracteres); el acuerdo va en "De dónde sale".
      e ? `${e.rotulo}` : 'sin acuerdo',
      basico,
      i === 0 ? VACIO : `=IFERROR($C${r}/$C${r - 1}-1;"")`,
      `=IFERROR($C${r}/$C$${f0};"")`,
      // Σ $/hora del plantel = el del mes base × el factor. NO se recalcula por categoría: el plantel
      // vive UNA sola vez, en 1.1, y acá se referencia. Duplicarlo es tener dos planteles.
      `=IFERROR(${celdaSigmaBase}*$E${r};"")`,
      e ? `${String(e.acuerdo ?? 'acuerdo').replace(/^Acuerdo\s+/, 'Ac.')}`.slice(0, 19) : 'estimado·parám.',
      i === 0
        ? 'mes base: factor 1,0000, sin aumento'
        : (e ? '✓ acuerdo' : `⚠ est. · últ: ${(ult?.rotulo ?? '—').slice(0, 12)}`),
    ])
  })
  const f1 = f0 + meses.length - 1
  return { filas, f0, f1 }
}

/**
 * NÚCLEO PURO: la fórmula del Σ $/hora del plantel para el mes de una quincena, buscado en el bloque
 * del escalón por su fecha de fin de mes. Si el mes no está en el bloque devuelve vacío, no cero: un
 * cero acá se multiplicaría por los días y daría "$0 de jornales", que es una mentira redonda.
 */
export function formulaSigmaDelMes(celdaDesde, { f0, f1 }) {
  return `=IFERROR(INDEX($F$${f0}:$F$${f1};MATCH(EOMONTH(${celdaDesde};0);$A$${f0}:$A$${f1};0));"")`
}

/**
 * NÚCLEO PURO: el factor de aumento de un mes RELATIVO a otro mes base.
 *
 * Lo usa el bloque de Oficina, cuya planilla va un mes detrás de la de obra: su proyección arranca en
 * el último mes PAGADO de administración, no en el mes base del plantel de obra. Sin la división, se
 * le aplicaría a un sueldo de julio el escalón acumulado desde junio y quedaría un mes de aumento de
 * más — el mismo doble conteo que el motor mata en la primera quincena, de costado.
 *
 * @param {string} exprMes  expresión de fin de mes del mes a proyectar
 * @param {{f0:number,f1:number}} esc el bloque del escalón
 * @param {string|null} exprBase expresión de fin de mes del mes base; null = el primero del cuadro
 */
export function formulaFactorDelMes(exprMes, { f0, f1 }, exprBase = null) {
  const idx = (e) => `INDEX($E$${f0}:$E$${f1};MATCH(${e};$A$${f0}:$A$${f1};0))`
  return exprBase ? `=IFERROR(${idx(exprMes)}/${idx(exprBase)};1)` : `=IFERROR(${idx(exprMes)};1)`
}

/**
 * NÚCLEO PURO: horas por persona y por día, MEDIDAS EN UNA VENTANA RECIENTE de quincenas cerradas.
 *
 * Es Σ(plata) ÷ Σ($/hora × días hábiles) — dimensionalmente horas por persona y día, y ponderado por
 * el tamaño de cada quincena. La fórmula anterior dividía por `AVERAGE(días)`, que no pondera y que
 * arrastraba el año entero.
 *
 * @param {{total:string, sigma:string, dias:string, hasta:string}} col letras del registro
 * @param {number} f0
 * @param {number} f1
 */
export function formulaHorasPorPersona({ total, sigma, dias, hasta }, f0, f1) {
  const rg = (c) => `$${c}$${f0}:$${c}$${f1}`
  const ventana = `(${rg(hasta)}<=TODAY())*(${rg(hasta)}>=EDATE(TODAY();-${RANGO_MESES_BASE}))*(N(${rg(total)})>0)`
  return `=IFERROR(SUMPRODUCT(${ventana}*N(${rg(total)}))/SUMPRODUCT(${ventana}*N(${rg(sigma)})*N(${rg(dias)}));0)`
}

/**
 * NÚCLEO PURO: la línea de estado de la réplica del convenio, para el subtítulo de la sección.
 * Es el CANARIO del defecto B17: si el IMPORTHTML se cayó o el acuerdo quedó viejo, lo dice acá — no
 * muestra un número de 2025 haciéndolo pasar por el escalón que viene.
 */
export function lineaEstadoReplica(escalones = [], hoy = new Date()) {
  return sub(estadoReplica(escalones, hoy).mensaje)
}
