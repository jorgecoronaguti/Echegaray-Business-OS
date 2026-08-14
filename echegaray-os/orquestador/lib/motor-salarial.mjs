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
//                          × factor(mes de la quincena)          ← paritaria UOCRA acumulada
//                          × horas por persona y día (medidas en una ventana reciente)
//                          × días hábiles de la quincena
//
//   factor(mes base) = 1                                    exacto, por construcción
//   factor(M)        = factor(M-1) × (1 + tramo(M))
//   tramo(M)         = el % del acuerdo publicado para M    ← ACUERDO FIRMADO
//                    = el último tramo conocido             ← PROYECCIÓN, y la fila lo rotula
//
// El mes base es el de la última quincena cerrada, y su factor es 1,0000 POR CONSTRUCCIÓN: el doble
// conteo de inflación de la primera quincena no puede volver, no porque se haya corregido un número
// sino porque no hay dónde escribirlo.
//
// ═══ EL FACTOR SALE DEL % DE LA PARITARIA, NO DEL COCIENTE DE BÁSICOS (07/08) ═══
//
// Hasta hoy el factor era `básico_Ayudante(M) / básico_Ayudante(base)`. Es un hecho medible, pero mide
// otra cosa: entre julio y agosto ese cociente da +9,11% mientras el acuerdo dice +1,9%, porque el
// básico publicado ABSORBE sumas no remunerativas. Con eso, un sueldo de Oficina —que no tiene básico
// de convenio— habría subido 9,11% en agosto por arrastre de una absorción que no le corresponde.
//
// El dueño ordenó el driver único: *"que las proyecciones en oficina y direccion sean tomando el
// porcentaje de incremento en uocra"*. El razonamiento completo y el dato verificado, en
// lib/uocra-paritaria.mjs. El básico publicado no se va de la pestaña: sigue siendo el PISO contra el
// que se compara lo que pagamos (§4), que es la pregunta que contesta bien.
//
// ═══ EL PLANTEL SE PROYECTA JUNTO, PERO SE CONTROLA POR CATEGORÍA ═══
//
// Un solo Σ$/hora para todo el plantel: el escalón sube parejo para las cinco categorías, así que
// abrirlo por categoría multiplicaría filas sin cambiar un peso del resultado.
//
// Lo que SÍ se abre por categoría es el CONTROL. El plantel se lee por la columna D del espejo y la
// equivalencia con el convenio la declaró el dueño el 07/08 (`CONVENIO_POR_CODIGO`). La columna
// «Convenio» sigue siendo suya y su valor gana SI LA ESCALA LO RECONOCE: desde el 14/08, un texto que
// la escala no conoce no puede gobernar la masa salarial (lib/jornales-piso-uocra.mjs).

import { VACIO } from './preservar-anotaciones.mjs'
import { sub, total as rotuloTotal } from './patron-pestana.mjs'
import {
  CATEGORIA_ANCLA, COL as UOCRA_COL, HOJA as UOCRA_HOJA,
  escalonDe, escalonPromedio, estadoReplica, filasPorHora, ultimoEscalon,
} from './uocra-acuerdos.mjs'
import {
  CONVENIO_POR_CODIGO, GAP_SUMAS_NR, ORIGEN_ACUERDO, ULTIMO_TRAMO, VIGENCIA_HASTA,
  convenioDe, factorUocraEntre, tramoDe,
} from './uocra-paritaria.mjs'
import { ROTULO_SIGMA } from './proyeccion-convenio.mjs'
import { expresionClaveConvenio } from './jornales-piso-uocra.mjs'

// LA BASE AL 100% DEL CONVENIO ENTRA POR ACÁ Y NO POR LA PESTAÑA. El dueño avisó que "esto puede
// impactar en varias pestañas a la vez": si la definición viviera en el generador de Jornales, el
// segundo consumidor tendría que copiarla. Vive en el motor y se re-exporta, así hay UNA sola puerta.
// `formulaSigmaDelMes` vive allá porque lo que decide no es la mecánica del cuadro sino el alcance
// del supuesto —qué quincenas van al convenio y cuáles al pactado—, de lo que ese archivo es dueño.
export {
  formulaSigmaConvenio, formulaSigmaDelMes, expresionSigmaDelMes,
  lineaSupuestoConvenio, sigmaConvenioDelPlantel,
} from './proyeccion-convenio.mjs'
import { ALERTA } from './glifos.mjs'
export { ROTULO_SIGMA }
export { factorUocraEntre, tramoDe, convenioDe }
/**
 * EL NOMBRE CAMBIÓ A PROPÓSITO, Y NO ES COSMÉTICA (07/08).
 *
 * Se llamaba `AUMENTO_SALARIAL_ESPERADO` y valía 5,21%. `asegurarParametros` NUNCA pisa el valor de
 * una fila que ya existe —bien, es la pestaña del dueño— así que cambiarle el número desde el código
 * era imposible: la fila vieja habría seguido gobernando la proyección con el criterio derogado. Un
 * rango nuevo obliga a una fila nueva, con el valor nuevo y su nota. La vieja queda huérfana: nada la
 * lee, y sacarla del Sheet es trabajo del árbol principal.
 */
export const RANGO_PARITARIA = 'PARITARIA_UOCRA_PROYECTADA'
export const RANGO_MESES_BASE = 'JORNALES_MESES_BASE'
/** El rótulo del parámetro, en un solo lugar: lo cita la nota, el cuadro y `ubicarParametros`. */
export const ROTULO_PARITARIA = 'Paritaria UOCRA proyectada por mes (meses sin acuerdo firmado)'
/** Ventana por defecto para medir el ritmo real de horas. Tres meses = seis quincenas cerradas. */
export const MESES_BASE_DEFAULT = 3

const pctTexto = (x) => (typeof x === 'number' ? `${(x * 100).toFixed(2).replace('.', ',')}%` : '—')

/**
 * NÚCLEO PURO: el parámetro de la paritaria proyectada, con su valor y de dónde sale.
 *
 * QUÉ GOBIERNA: los meses POSTERIORES al último acuerdo firmado, en los TRES bloques de la pestaña —
 * Obra, Oficina y Dirección. Un solo driver, por orden del dueño (07/08).
 *
 * EL VALOR ES EL ÚLTIMO TRAMO CONOCIDO, NO UN PROMEDIO MEDIDO. El promedio sobre básicos publicados
 * daba 5,21%/mes y arrastraba sumas no remunerativas ya absorbidas; ver la cabecera de
 * lib/uocra-paritaria.mjs. Lo que queda de aquella medición es una LÍNEA DE CONTRASTE en esta nota:
 * el dueño tiene que poder ver contra qué se decidió, no sólo qué se decidió.
 *
 * @param {Array} escalones salida de parsearAcuerdos
 * @returns {{rango:string, rotulo:string, valor:number, nota:string, derivacion:object|null}}
 */
export function parametroParitaria(escalones = []) {
  const ult = ultimoEscalon(escalones)
  const tramo = ult ? tramoDe(ult.periodo, escalones) : null
  const valor = tramo && tramo.origen === ORIGEN_ACUERDO ? tramo.pct : ULTIMO_TRAMO
  const p6 = escalonPromedio(escalones, 6)
  const contraste = p6
    ? ` Contraste: el básico de ${CATEGORIA_ANCLA} de ${UOCRA_HOJA} se movió ${pctTexto(p6.pct)}/mes entre ${p6.desde} y ${p6.hasta} — más que el rótulo, porque absorbe sumas no remunerativas.`
    : ''
  return {
    rango: RANGO_PARITARIA,
    rotulo: ROTULO_PARITARIA,
    valor,
    nota: `Sólo se aplica a los meses SIN acuerdo firmado. El acuerdo UOCRA–Camarco–FAEC rige hasta el ${VIGENCIA_HASTA}`
      + `${ult ? ` y el último escalón publicado en ${UOCRA_HOJA} es ${ult.rotulo}` : ''}: de ahí en adelante esto es PROYECCIÓN, no acuerdo. `
      + `Repite el último tramo conocido (${pctTexto(valor)}).${contraste} `
      + `LÍMITE DECLARADO: ${GAP_SUMAS_NR}. `
      + 'NO ES EL IPC: el IPC mide precios y esto es una paritaria. '
      + 'Gobierna los tres bloques —Obra, Oficina y Dirección—: cambialo acá y se mueven Jornales, Cargas Sociales, el cash flow y CAJA.',
    derivacion: tramo,
  }
}

/** NÚCLEO PURO: el parámetro de la ventana con que se mide el ritmo real de horas. */
export const PARAMETRO_MESES_BASE = {
  rango: RANGO_MESES_BASE,
  rotulo: 'Meses hacia atrás para medir el ritmo real de horas',
  valor: MESES_BASE_DEFAULT,
  nota: 'Sobre cuántos meses de quincenas YA CERRADAS se mide "horas por persona y por día". Antes se promediaba el AÑO ENTERO, ausentismo de enero incluido, y daba 6,7 h contra una jornada de 9. Subilo para suavizar, bajalo para seguir el ritmo actual.',
}

export const PARAMETROS_MOTOR = (escalones) => [parametroParitaria(escalones), PARAMETRO_MESES_BASE]

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
 * NÚCLEO PURO: la ÚNICA línea que dice contra qué escala compara el plantel — y qué falta, si falta.
 *
 * ═══ HASTA AYER ESTA LÍNEA PEDÍA UN DATO; HOY DECLARA UNO (07/08) ═══
 *
 * La columna "Convenio" era del dueño y estaba vacía, así que el control no podía comparar nada y esta
 * línea decía "faltan 4 de 4". El dueño mandó el plantel con su categoría al lado y con eso quedó
 * declarada la equivalencia (`CONVENIO_POR_CODIGO`): el control se enciende sin esperar a nadie.
 *
 * La columna sigue siendo suya y su valor GANA — lo que cambió es el default, no el dueño de la celda.
 *
 * @param {number} f0 primera fila de categorías · @param {number} f1 última
 * @param {Array<[string, string|null]>} equivalencias [código de la planilla, categoría del convenio]
 */
export const formulaConvenioPendiente = (f0, f1, equivalencias = []) => {
  const faltan = equivalencias.filter(([, c]) => !c).map(([k]) => k)
  if (faltan.length) return sub(`${ALERTA} Sin equivalente en la escala: ${faltan.join(', ')}`)
  // Agrupado por categoría del convenio: "OF, OF M→Oficial · A, A M→Ayudante". Cuatro flechas sueltas
  // ocupan el doble y dicen lo mismo.
  //
  // DE 180 CARACTERES A UN RÓTULO (13/08, rechazo del diseño). Se cayeron "las N categorías" —el cuadro
  // las tiene una por fila— y "si escribís otra en «Convenio», manda la tuya", que es una instrucción
  // sobre una COLUMNA y por eso ahora vive en su encabezado («Convenio (tuya)»): la lee el que va a
  // editarla. El comportamiento no cambió — `IF($E="";equivalencia;$E)` sigue dándole la última palabra
  // a la celda del dueño.
  const porConvenio = new Map()
  for (const [cod, conv] of equivalencias) porConvenio.set(conv, [...(porConvenio.get(conv) ?? []), cod])
  const mapa = [...porConvenio].map(([conv, cods]) => `${cods.join(', ')}→${conv}`).join(' · ')
  return sub(`Convenio: ${mapa}`)
}

/**
 * NÚCLEO PURO: las filas del bloque "1.1 · El plantel base", en el ancho de 8 columnas de la pestaña.
 *
 * @returns {{filas:any[][], fPrimera:number, fUltima:number, fTotal:number, canario:string}}
 */
export function filasPlantel({ hoja, bloque, categorias, personas, filaInicio, escalonVigente, tabla = CONVENIO_POR_CODIGO }) {
  const R = (c) => `'${hoja}'!$${c}$${bloque.inicio}:$${c}$${bloque.fin}`
  const D = R('D'); const W = R('W')
  const filas = []
  // «Convenio (tuya)»: el paréntesis reemplaza la frase "si escribís otra en «Convenio», manda la
  // tuya" que colgaba arriba del cuadro. La instrucción sobre una columna se lee en su encabezado.
  filas.push(['Categoría', 'Personas', 'Σ $/hora', '$/hora mínimo', 'Convenio (tuya)', 'Básico convenio', 'Margen', 'Estado'])
  const fPrimera = filaInicio + 1
  const equivalencias = categorias.map((c) => [c, convenioDe(c, tabla)])
  // El grupo del mes vigente en la réplica, resuelto por el parser: sin esto el MATCH por nombre de mes
  // vuelve a caer en el año equivocado, que es el defecto B3.
  //
  // SIN EL SERENO (07/08). El grupo tiene cinco filas y la quinta cobra POR MES: si el dueño escribe
  // "Sereno" en la columna «Convenio», el INDEX le devolvía $980.858 a una columna de $/hora y esa
  // categoría entraba a la Σ del plantel multiplicada por horas y días. El guard ya existía en
  // `mapearEscala` (lib/nomina-replica.mjs) y esta fórmula no lo había heredado. Buscando sólo en las
  // filas por hora, un "Sereno" no matchea, la celda queda vacía y el Estado de la fila lo dice.
  const g = filasPorHora(escalonVigente)
  const rangoCats = g ? `'${UOCRA_HOJA}'!$${UOCRA_COL.categoria}$${g.r0}:$${UOCRA_COL.categoria}$${g.r1}` : null
  categorias.forEach((cat, i) => {
    const r = fPrimera + i
    const q = `"${cat}"`
    // LA CLAVE DE BÚSQUEDA: lo que escribió el dueño SI LA ESCALA LO RECONOCE, y si no, la equivalencia
    // declarada (14/08). Era `IF($E="";equivalencia;$E)` —ganaba cualquier cosa distinta de vacío— y eso
    // dejó la proyección de obra sin piso de convenio durante todo el rediseño. La regla, su porqué
    // medido y la versión JS viven juntos en lib/jornales-piso-uocra.mjs.
    const equiv = equivalencias[i][1]
    const clave = rangoCats
      ? expresionClaveConvenio({ celda: `$E${r}`, equivalencia: equiv, rangoCategorias: rangoCats })
      : (equiv ? `IF($E${r}="";"${equiv}";$E${r})` : `$E${r}`)
    filas.push([
      cat,
      `=COUNTIFS(${D};${q})`,
      `=SUMIFS(${W};${D};${q})`,
      `=IFERROR(MINIFS(${W};${D};${q};${W};">0");"")`,
      // LA COLUMNA DEL DUEÑO. Cadena vacía = "no es mía, preservá lo que haya". Con el centinela, la
      // corrida siguiente le borraría lo que escribió — es el defecto que dejó OFICINA_BANCO ciego.
      '',
      g
        ? `=IFERROR(INDEX('${UOCRA_HOJA}'!$${UOCRA_COL.basico}$${g.r0}:$${UOCRA_COL.basico}$${g.r1};MATCH(${clave};'${UOCRA_HOJA}'!$${UOCRA_COL.categoria}$${g.r0}:$${UOCRA_COL.categoria}$${g.r1};0));"")`
        : '',
      `=IF(N($F${r})=0;"";$D${r}/$F${r}-1)`,
      // ═══ UN ESTADO, NO UNA INSTRUCCIÓN — Y MENOS REPETIDA UNA VEZ POR FILA (06/08) ═══
      //
      // Acá decía "escribí la categoría del convenio en la columna de al lado" y la frase aparecía
      // CUATRO VECES en el cuadro que abre la pestaña. Un pedido no es un estado: se dice una vez,
      // arriba del bloque, con la cuenta de lo que falta (`formulaConvenioPendiente`). SIN
      // EQUIVALENCIA la fila dice "—", que es la única respuesta honesta cuando no se sabe contra qué
      // comparar; con equivalencia el "—" desaparece porque ya hay respuesta.
      // SI LA CELDA DEL DUEÑO SE IGNORÓ, LA FILA LO DICE. Su valor se PRESERVA pero no gobierna: sin
      // este aviso, la corrección arreglaría el número y lo dejaría creyendo que su categoría manda.
      equiv && rangoCats
        ? `=IF(AND($E${r}<>"";NOT(ISNUMBER(MATCH($E${r};${rangoCats};0))));`
          + `"${ALERTA} «Convenio» no está en la escala — uso ${equiv}";`
          + `IF(N($F${r})=0;"sin escala para esa categoría";IF($G${r}<0;"${ALERTA} por debajo del convenio";"✓ sobre el convenio")))`
        : (equiv
          ? `=IF(N($F${r})=0;"sin escala para esa categoría";IF($G${r}<0;"${ALERTA} por debajo del convenio";"✓ sobre el convenio"))`
          : `=IF($E${r}="";"—";IF(N($F${r})=0;"esa categoría no está en la escala del mes";IF($G${r}<0;"${ALERTA} por debajo del convenio";"✓ sobre el convenio")))`),
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
    //
    // VA EN LA COLUMNA 8, QUE ES DEL MEDIO: medía 164 caracteres y desparramaba la fila sobre las seis
    // siguientes (el defecto `nota-en-el-medio`, que el auditor no cazaba porque vive adentro de una
    // fórmula y el auditor lee valores). Qué correr para arreglarlo —`espejar-jornales.mjs` y después
    // este generador— es de quien mantiene el OS y está acá; en la celda queda el HECHO.
    `=IF(COUNTA('${hoja}'!$B$${bloque.inicio}:$B$${bloque.fin})=${personas};"✓ espejo en su lugar";"${ALERTA} el espejo se movió — plantel desactualizado")`])
  return { filas, fPrimera, fUltima, fTotal, equivalencias, canario: `${hoja}!${bloque.inicio}:${bloque.fin}` }
}

/**
 * NÚCLEO PURO: las filas del bloque "1.2 · El escalón del convenio, mes por mes".
 *
 * Ocho columnas, como todo el resto de la pestaña:
 *   A Mes · B Escalón publicado · C Básico Ayudante · D Sube en el mes · E Factor sobre la base ·
 *   F Σ $/hora del plantel · G De dónde sale · H Estado
 *
 * ═══ LA D Y LA E CAMBIARON DE FUENTE (07/08) ═══
 *
 * La D era `C/C(anterior)-1` —el cociente de básicos publicados— y la E, el cociente contra el mes
 * base. Con eso agosto subía 9,11% y el rótulo del acuerdo decía 1,9%: dos números para el mismo
 * concepto en columnas contiguas, y el que gobernaba las tres proyecciones era el que NO estaba
 * firmado. Ahora la D es EL TRAMO DE LA PARITARIA y la E su producto acumulado desde el mes base.
 *
 * EL TRAMO SE LEE DE LA RÉPLICA, NO SE PEGA. El rótulo del mes trae el porcentaje adentro
 * ("Agosto\n+1,9%", "Febrero (1,8% s/Ene)") y de ahí sale por REGEXEXTRACT: si mañana se pega un
 * acuerdo nuevo en `_UOCRA_RAW`, la pestaña se mueve sola. Sin rótulo con %, cae al parámetro — que
 * es exactamente lo que hay que hacer con un mes sin acuerdo.
 *
 * La C se queda: es el PISO del convenio, que es lo que el control de §4 compara contra lo que
 * pagamos. Deja de gobernar el factor, no deja de ser un hecho.
 *
 * ═══ LA F CAMBIÓ DE BASE: DEL JORNAL PACTADO A LA ESCALA DEL CONVENIO (07/08) ═══
 *
 * Por orden del dueño la proyección de obreros se valúa al 100% del convenio. Lo que cambia es la BASE
 * que se escala, no el driver: el factor de la columna E sigue siendo el mismo para los tres bloques.
 * El razonamiento completo está en lib/proyeccion-convenio.mjs.
 *
 * Y CAMBIA TAMBIÉN EL ANCLA. La Σ pactada es la del plantel de la última quincena cerrada de OBRA, así
 * que se divide por el factor de ESE mes (`periodoBase`). La Σ del convenio, en cambio, sale de las
 * celdas «Básico convenio» del bloque 1.1, que leen el escalón VIGENTE de la réplica — casi siempre el
 * mes en curso, un mes por delante del de la última quincena cerrada. Dividir esa Σ por el factor del
 * mes base le agregaría un tramo entero de paritaria que ya tiene adentro: el mismo doble conteo que
 * el motor mata en la primera quincena, otra vez de costado. Por eso `periodoConvenio`.
 *
 * @returns {{filas:any[][], f0:number, f1:number, alConvenio:boolean}}
 */
export function filasEscalon({
  meses, escalones, filaInicio, celdaSigmaBase, periodoBase = null,
  celdaSigmaConvenio = null, periodoConvenio = null,
}) {
  const iConv = periodoConvenio ? meses.findIndex((m) => m.periodo === periodoConvenio) : -1
  // SIN EL MES DEL ESCALÓN EN EL CUADRO NO HAY DÓNDE ANCLAR, y anclar en otra fila es escalar de más
  // en silencio: se cae a la base pactada, que es el criterio anterior, y la línea de arriba del cuadro
  // lo declara. Un criterio que cambia sin decirlo es peor que el criterio viejo.
  const alConvenio = Boolean(celdaSigmaConvenio) && iConv >= 0
  const sigma = alConvenio ? celdaSigmaConvenio : celdaSigmaBase
  const filas = []
  filas.push(['Mes', 'Escalón publicado', `Básico ${CATEGORIA_ANCLA}`, 'Sube en el mes', 'Factor sobre la base',
    alConvenio ? ROTULO_SIGMA.convenio : ROTULO_SIGMA.pactado, 'De dónde sale', 'Estado'])
  const f0 = filaInicio + 1
  const ult = ultimoEscalon(escalones)
  // ═══ LA Σ $/hora SE ANCLA EN EL MES DE OBRA, NO EN LA PRIMERA FILA DEL CUADRO (07/08) ═══
  //
  // El cuadro arranca en el mes MÁS VIEJO de los tres bloques, y ése suele ser el de Oficina, que va un
  // mes atrasada. La Σ $/hora, en cambio, es la del plantel de la última quincena cerrada DE OBRA: si
  // se la multiplica por el factor medido desde el mes de Oficina, obra se lleva un mes de aumento que
  // ya tiene adentro, y el error se arrastra a las diez quincenas siguientes. No da error, da un total
  // más alto y plausible. La división por la fila del mes base de obra lo cierra.
  const iBase = Math.max(0, meses.findIndex((m) => m.periodo === periodoBase))
  const rAncla = f0 + (alConvenio ? iConv : iBase)
  meses.forEach((m, i) => {
    const r = f0 + i
    const e = escalonDe(escalones, m.periodo)
    const t = tramoDe(m.periodo, escalones)
    const firmado = t.origen === ORIGEN_ACUERDO
    // EL TRAMO, VIVO. La celda del rótulo de la réplica ya la resolvió el parser (fila concreta, sin
    // MATCH por nombre de mes: ése era el defecto B3). VALUE("1,9") en es-AR da 1,9 porque la coma es
    // el separador decimal del archivo.
    const tramo = e
      ? `=IFERROR(VALUE(REGEXEXTRACT(INDEX('${UOCRA_HOJA}'!$${UOCRA_COL.mes}$1:$${UOCRA_COL.mes};${e.fila});"([0-9]+[.,]?[0-9]*)\\s*%"))/100;${RANGO_PARITARIA})`
      : `=${RANGO_PARITARIA}`
    const basicoFila = e?.categorias?.[CATEGORIA_ANCLA]?.fila ?? null
    // Sin acuerdo publicado el piso se ESTIMA encadenando desde el último publicado con el MISMO tramo
    // que mueve el factor: las dos columnas no pueden contar historias distintas. Y en la PRIMERA fila
    // no hay de dónde encadenar —arriba está el encabezado— así que queda vacía en vez de multiplicar
    // un rótulo por un porcentaje y publicar un piso inventado.
    const basico = basicoFila
      ? `=IFERROR(INDEX('${UOCRA_HOJA}'!$${UOCRA_COL.basico}$1:$${UOCRA_COL.basico};${basicoFila});"")`
      : (i === 0 ? '' : `=IFERROR($C${r - 1}*(1+$D${r});"")`)
    filas.push([
      `=EOMONTH(DATE(${m.anio};${m.mes};1);0)`,
      // Sólo el escalón (112px ≈ 19 caracteres); el acuerdo va en "De dónde sale".
      e ? `${e.rotulo}` : 'sin acuerdo',
      basico,
      // El mes base no sube: es el ancla. Un tramo acá sería el doble conteo, otra vez.
      i === 0 ? VACIO : tramo,
      // Factor acumulado = el del mes anterior × (1 + tramo del mes). La primera fila es 1 LITERAL:
      // no hay fórmula que pueda devolver otra cosa, que es lo que mata el doble conteo por diseño.
      i === 0 ? '=1' : `=IFERROR($E${r - 1}*(1+$D${r});"")`,
      // Σ $/hora del plantel × el factor acumulado desde el mes de SU ancla. NO se recalcula por
      // categoría: el plantel vive UNA sola vez, en 1.1, y acá se referencia.
      `=IFERROR(${sigma}*$E${r}/$E$${rAncla};"")`,
      firmado && e ? `${String(e.acuerdo ?? 'acuerdo').replace(/^Acuerdo\s+/, 'Ac.')}`.slice(0, 19) : 'proyección',
      i === 0
        ? 'mes base: factor 1,0000, sin aumento'
        : (firmado ? '✓ acuerdo firmado' : `${ALERTA} proyección · últ: ${(ult?.rotulo ?? '—').slice(0, 12)}`),
    ])
  })
  const f1 = f0 + meses.length - 1
  // LAS DOS ANCLAS VIAJAN, no sólo la que ganó. El cuadro 1.3 necesita poder valuar una quincena al
  // PACTADO aunque el cuadro esté al convenio (ver `formulaSigmaDelMes`): sin la celda de la Σ pactada
  // y su fila de ancla tendría que reconstruirlas por su cuenta, que es como aparecen dos bases.
  return { filas, f0, f1, alConvenio, celdaSigmaBase, rAnclaBase: f0 + iBase }
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
