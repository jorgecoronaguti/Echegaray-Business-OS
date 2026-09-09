#!/usr/bin/env node
// LA PESTAÑA "JORNALES POR QUINCENA" — UN SOLO DUEÑO, UNA SOLA GRILLA.
//
// POR QUÉ SE REHIZO (23/07). El dueño, dos veces: "jornales por quincena y cargas sociales tienen
// que tener el mismo diseño" y después "¿jornales se actualiza a medida que la quincena va pasando?
// ¿lo que dice proyecciones se reemplaza? la verdad es que el diseño de esa manera no respeta el
// criterio [minimalista y de clase mundial]. rehacer".
//
// La segunda pregunta era la importante, y la respuesta era NO. Lo que encontré al medirlo:
//
// ═══ 1. LA PROYECCIÓN VOLVÍA A PROYECTAR UNA QUINCENA YA PAGADA ═══
//
// El cuadro de proyección arrancaba en la fecha DESDE de la última quincena real, no en la
// siguiente. O sea que la quincena del 16/07–31/07, que ya está cargada y pagada por $9.521.258,
// aparecía ADEMÁS como proyectada por $7.415.024. El total del año y el total proyectado contaban
// la misma nómina dos veces, con dos números distintos.
//
// Ahora la proyección empieza el día siguiente al ÚLTIMO día ya cargado. Lo real le gana siempre a
// lo estimado: es la misma regla que en Cargas Sociales, donde la frontera la pone el dato y no una
// constante escrita a mano.
//
// ═══ 2. EL TECHO DE 14 QUINCENAS ═══
//
// Todas las fórmulas del cuadro estaban clavadas al rango $A$3:$A$16 — catorce filas. Un año tiene
// veintiséis quincenas. La número quince iba a caer FUERA del SUM del total del año y fuera del
// INDEX que busca la última: el cuadro habría seguido mostrando un total plausible y viejo, sin dar
// un solo error. Es el mismo modo de falla del espejo desfasado: no grita, miente callado.
//
// Pasaba porque la pestaña tenía DOS escritores: este cuadro lo mantenía la tool de sincronización
// de nómina INSERTANDO una fila antes del total, y una fila insertada en el borde de un rango no
// entra en el rango. Ahora hay un solo dueño que reescribe la grilla entera en cada corrida, y los
// totales se cierran contra la fila de arriba (`INDEX(col;ROW()-1)`), que no tiene techo posible.
//
// ═══ 3. LA COMPARACIÓN CONTRA EL CONVENIO ESTABA MAL PLANTEADA ═══
//
// El cuadro de la escala UOCRA mostraba "Δ vs lo que pagamos" y "% sobre convenio" por categoría,
// comparando el PROMEDIO del plantel contra CADA categoría. Daba "-20,6%" en Oficial Especializado,
// que se lee como "le estamos pagando 20% por debajo del convenio" y no significa eso: significa que
// el obrero promedio —ayudantes incluidos— gana menos que un Oficial Especializado, que es cierto
// por definición y no informa nada. Un número que se lee como una alarma y no lo es, es peor que no
// tenerlo.
//
// El espejo no trae la CATEGORÍA de cada persona, así que la comparación por categoría no se puede
// hacer con datos reales y no se inventa. Lo que sí se puede contestar, y es la pregunta que importa
// —¿hay alguien cobrando por debajo del convenio?— es comparar el jornal por hora MÁS BAJO que
// pagamos contra el básico más bajo del convenio (Ayudante). Eso es una sola línea y es un control
// de verdad: un jornal por debajo del convenio es deuda laboral, no ahorro.
//
// ═══ 4. LA FECHA DE CIERRE NO ES LA FECHA DE PAGO (31/07) ═══
//
// El dueño: *"los jornales que se pagan de la quincena q termina hoy, se pagarán la semana que
// viene"*. La pestaña tenía "Hasta" y nada más, y el cash flow tomaba esa columna como la fecha en
// que la plata sale de la cuenta. El extracto del Santander dice que no: la quincena que cerró el
// 15/07 se pagó el 17/07 y la que cerró el 30/06 se pagó el 01/07.
//
// Ahora hay una columna "Se paga el" al lado de Hasta, y es la que manda en la caja. Sale del BANCO
// cuando el banco lo prueba, del parámetro de la pestaña Parámetros cuando no, y del dueño si él la
// escribe a mano. Toda la lógica vive en lib/jornales-fecha-pago.mjs.
//
// ═══ LA GRILLA ═══
//
//   A   la quincena (fecha desde) · el concepto en los bloques que no son tabla
//   B   hasta · el importe en el hero
//   C   se paga el (la fecha de caja)
//   D…  la serie
// NINGUNA FÓRMULA SALE DE ESTE COMENTARIO: la letra la manda REGISTRO_COLS, vía `colDe`. Acá llegó
// a decir "K el TOTAL" cuando la K era "Σ $/hora" — un mapa de columnas escrito en prosa envejece
// sin que nada lo avise, y el que lo lee escribe la fórmula contra la columna de al lado.
//
// Un solo ancho para toda la pestaña, con la única excepción que el patrón admite: el REGISTRO
// quincena por quincena, que es más ancho y va al final.
//
//   node orquestador/scripts/jornales-pestana.mjs [--dry]

import { writeFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { escribirPreservando, VACIO, letraCol } from '../lib/preservar-anotaciones.mjs'
import { conColaMedida, avisoDeCola } from '../lib/cola-de-rango.mjs'
import { columna, aRangoApi, verificarRangos, explicarProblemas } from '../lib/rangos-con-nombre.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
// SIN `sub` DESDE EL 09/09/2026, Y ES EL RESULTADO QUE SE BUSCABA. `sub()` antepone «   · » y esta
// pestaña llegó a tener veinte celdas que empezaban así. El dueño las nombró una por una: no queda
// ninguna, y no importarla es lo que hace que no puedan volver por descuido.
import { seccion, total as rotuloTotal, auditarPatron, clasificarDefectos } from '../lib/patron-pestana.mjs'
// INK/MUTED/ACENTO: la MISMA paleta que usa la piel. Importarla —y no copiar tres tripletes RGB acá—
// es lo que hace que la notación del escenario (pagado en tinta plena, proyectado apagado) sea el
// mismo gris que el resto del libro y no un segundo gris parecido.
import { skinRequests, INK, MUTED } from '../lib/estilo-statement.mjs'
import { requestsTextoPorContenido } from '../lib/formato-texto-por-contenido.mjs'
// SIN `vaciarColumnaDeProsa` (06/08): esta pestaña NO TIENE columna de prosa — su última columna es
// "Pagado el", la del dueño. Importarla era la invitación a volver a llamarla, que es exactamente la
// 4ª reincidencia del borrado de sus catorce fechas.
import { borrarNotas } from '../lib/nota-celda.mjs'
import { detectarQuincenas, filasQuincenas } from '../lib/nomina-sync.mjs'
import {
  CATEGORIAS, CATEGORIA_ANCLA, COL as UOCRA_COL, HOJA as UOCRA_HOJA,
  parsearAcuerdos, escalonDe, escalonVigenteEn, estadoReplica,
} from '../lib/uocra-acuerdos.mjs'
import {
  // `PARAMETRO_MESES_BASE` dejó de importarse el 13/08: su rótulo completo ("Meses hacia atrás para
  // medir el ritmo real de horas") se escribía dentro del aviso de "sin quincenas cerradas" y eran 114
  // caracteres en una celda del medio. El parámetro sigue creándose por `PARAMETROS_MOTOR`.
  PARAMETROS_MOTOR,
  ultimaQuincenaCerrada, categoriasDelBloque, personasDelBloque,
  mesesDelMotor, filasPlantel, filasEscalon, expresionMasaDeLaQuincena,
  formulaFactorDelMes,
  formulaHorasPorPersona, factorUocraEntre,
  formulaSigmaConAumento, sigmaConAumentoDelPlantel,
} from '../lib/motor-salarial.mjs'
// `COLS_CALENDARIO` y `colCalendario` dejaron de importarse el 09/09/2026: la proyección vive en la
// MISMA grilla que el registro y sale de `REGISTRO_COLS`. Siguen exportados con sus tests porque
// `formulaVentana` y `formulaControlCalendario` los usan del otro lado; acá no hay dos anchos.
import { diasLaborables, expresionDias, formulaShareAdelanto } from '../lib/jornales-calendario.mjs'
// CÓMO SE PAGA LA QUINCENA: el acuerdo 50/50 del dueño, por grupo de empleados, y los tres avisos que
// condicionan su lectura. Toda la aritmética vive en la lib y se prueba con números, no con strings.
import { canalesProyectados } from '../lib/jornales-reparto-pago.mjs'
import { expresionCierreDeQuincena } from '../lib/jornales-real-vs-estimado.mjs'
// EL PISO DEL CONVENIO: contra qué categoría se mide cada persona y si la proyección lo cubre.
import { bloqueDelPlantel, rotuloDelPlantel, GAP_JORNADA } from '../lib/jornales-piso-uocra.mjs'
import {
  HORAS_LUNES_A_JUEVES, HORAS_VIERNES, HORAS_SABADO_SUPUESTO,
  HORAS_SEMANA_CON_SABADO, HORAS_SEMANA_DECLARADA,
  PARAMETROS_JORNADA, expresionHorasDeJornada,
} from '../lib/jornada-uocra.mjs'
import { estadoOficinaDelMes, formulaProyectadoOficina, origenDelEscalon, periodoDe } from '../lib/oficina-escalon.mjs'
import {
  VERIFICADA_EL, VIGENCIA_HASTA, contrastarEscala, tramoDe, convenioDe, claveDeCategoria, ESCALA_VERIFICADA,
} from '../lib/uocra-paritaria.mjs'
// EL COSTO DE ECHAR A CADA UNO (sección 6). El régimen —Ley 22.250, sin indemnización por
// antigüedad ni preaviso— y cada artículo citado viven en `lib/desvinculacion-22250.mjs`; leer el
// plantel del año del espejo, en `lib/desvinculacion-plantel.mjs`. Acá sólo se lo enchufa.
import { plantelDelEspejo, separarPlantel } from '../lib/desvinculacion-plantel.mjs'
import { bloqueDesvinculacion } from '../lib/desvinculacion-bloque.mjs'
// El otro lado del MAX de 1.3: la demanda de las obras vendidas. Toda la lógica vive en la lib.
import { claveQuincena, formulaProyectadoQuincena } from '../lib/jornales-demanda-obras.mjs'
import { demandaParaJornales } from '../lib/jornales-demanda-fuente.mjs'
import { registrarSincronizacion } from '../lib/registrar-sincronizacion.mjs'
import { JORNALES_FILE_ID } from '../lib/espejo-jornales.mjs'
import { formulaSePagaEl, expresionPagoDelMes, PARAMETROS } from '../lib/jornales-fecha-pago.mjs'
import {
  NOMBRES_DIRECCION, formulaRetiroMensual, formulaPrimerRetiro, expresionMesBaseRetiro,
  formulaPrimerRetiroDe, formulaPagadoMes, formulaSePagaElDireccion, formulaProyectadoMes,
} from '../lib/direccion-retiros.mjs'
import { ALERTA } from '../lib/glifos.mjs'
import { quincenaConAumento } from '../lib/proyeccion-convenio.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
// EL NOMBRE DE LA PESTAÑA SE EXPORTA: Cargas Sociales la lee para saber con qué base quedó valuada la
// masa que multiplica (ver `baseDeJornales`). Escrito dos veces, un rename la deja leyendo un vacío.
export const PESTAÑA = 'Jornales por Quincena'
const ESPEJO = '_J_OBREROS'
/** La otra mitad de la nómina: dos sueldos de oficina, con su propio layout y su propio atraso. */
const ESPEJO_OFI = '_J_OFICINA'
const DRY = process.argv.includes('--dry')
const AÑO = 2026
/** El ancho de la pestaña: el registro de abajo es el bloque más ancho y define la grilla.
 *  Pasó de 12 a 13 el 31/07 al entrar la columna "Se paga el" al lado de Hasta. */
// TRECE COLUMNAS DESDE EL 09/09/2026, y la última sigue siendo "Pagado el" — donde el dueño marca
// cuándo salió la plata de verdad. Bajó de catorce al fundirse «Hs previstas» y «Hs reales» en una
// sola columna «Horas»: la prevista era `Días × Personas × jornada`, un derivado que ninguna otra
// celda leía y que sólo servía para el aviso del cuadro de pago, retirado el mismo día.
// SE EXPORTA para que la entrada de esta pestaña en `formato-pestanas.PESTANAS` no pueda volver a
// quedarse corta: el auditor de pantalla recorre esa lista y con `cols: 13` no miraba la N durante dos
// semanas. Un número declarado dos veces se separa sin dar error; atado por el test, no.
export const ANCHO = 13
/**
 * EL ENCABEZADO DEL REGISTRO ES EL CONTRATO — Y LA LETRA DE CADA COLUMNA SALE DE ACÁ, NUNCA A MANO.
 *
 * POR QUÉ (03/08). La fila 4 de la pestaña VIVA usa `MAXIFS($B:$B;$K:$K;">0")` y anda bien, así que
 * copiarla parecía gratis. No lo es: esa K es el TOTAL en un layout que tiene una columna más
 * ("Se paga el") que este generador todavía no escribe. En ESTE layout la K es "Σ $/hora" — otra
 * cosa, siempre distinta de cero, y la fórmula copiada al pie de la letra habría contestado otra
 * pregunta sin dar un solo error. Es el mismo defecto que la fila 40 clavada a fuego, pero de lado.
 *
 * Con la letra derivada del encabezado, agregar o mover una columna no puede desalinear la fórmula:
 * si el rótulo desaparece, `colDe` grita en vez de apuntar a la columna de al lado.
 */
// "Pagado el" VA AL FINAL, no intercalada al lado de "Se paga el": eso correría los índices de las
// columnas que produce nomina-sync, y ya rompió el registro una vez (la columna "Se paga el" se
// emitió dos veces y desplazó todo).
//
// ═══ UNA SOLA GRILLA PARA LO PAGADO Y LO QUE FALTA (09/09/2026) ═══
//
// Hasta hoy la pestaña tenía DOS tablas de quincenas con encabezados distintos: el registro de abajo
// (catorce columnas) y el calendario de proyección de arriba (ocho, con rótulos propios en
// `COLS_CALENDARIO`). El dueño leía la misma fila —una quincena— en dos gramáticas según de qué lado
// del año cayera. Ahora es una sola tabla con un solo encabezado: arriba lo cerrado, abajo lo que
// falta, y la columna «Estado» dice cuál es cuál.
//
// «DÍAS» NO SE PUEDE SACAR, aunque el pedido eran doce columnas. Es el DENOMINADOR de las horas
// medidas (`formulaHorasPorPersona`: Σ TOTAL ÷ Σ(Σ$/h × días)) y las horas medidas son el driver de
// toda la proyección de obreros —la decisión del dueño del 07/09—. Derivarlo de las dos fechas con
// NETWORKDAYS no es lo mismo: la columna cuenta los días EFECTIVAMENTE cargados en el espejo, con sus
// feriados y sus días sin cuadrilla. Cambiar ese denominador mueve las horas medidas, y con ellas los
// $58.308.813 proyectados que el Cash Flow publica. Trece columnas es el precio de no mover ese
// número, y está dicho acá para que la próxima poda sepa qué está tocando.
const REGISTRO_COLS = ['Desde', 'Hasta', 'Se paga el', 'Días', 'Personas', 'Horas', 'Banco', 'Adelanto', 'Recibo', 'Total', '$/hora', 'Estado', 'Pagado el']

/**
 * NÚCLEO PURO: la letra de una columna del registro, buscada por su rótulo.
 * @param {string} rotulo tal como aparece en el encabezado
 * @param {string[]} [cols]
 * @returns {string} la letra A1
 */
export function colDe(rotulo, cols = REGISTRO_COLS) {
  const i = cols.indexOf(rotulo)
  // Falla RUIDOSA: devolver un default dejaría una fórmula que suma la columna equivocada y da un
  // número plausible. Un rótulo que ya no existe es un cambio de contrato, no un detalle.
  if (i < 0) throw new Error(`colDe: el registro de Jornales no tiene la columna "${rotulo}"`)
  return String.fromCharCode(65 + i)
}
/** Los doce meses, para el cuadro de oficina: ahí se cobra por MES, no por quincena. */
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
// Los criterios de fecha que esta pestaña deja escritos en "Parámetros" para que se puedan cambiar
// sin tocar código: cuándo se paga una quincena y qué día del mes salen los retiros de Dirección.
// LOS PARÁMETROS DEL MOTOR SE AGREGAN A LA MISMA LISTA. `parametroParitaria` necesita los acuerdos
// parseados para PROPONER su valor; si todavía no se leyeron, cae al último tramo verificado a mano.
// `PARAMETRO_DIA_PAGO` se fue de esta lista el 14/08: con los tres grupos cobrando el mismo día, la
// fecha de dirección sale de la nómina y ese parámetro dejó de tener consumidores. La fila
// `DIRECCION_DIA_PAGO` ya existe en Parámetros y queda huérfana —`asegurarParametros` nunca pisa una
// fila que existe, así que borrarla es una escritura del Sheet y se hace desde el árbol principal—.
// Mismo trato que tuvo `AUMENTO_SALARIAL_ESPERADO` cuando el driver pasó a ser la paritaria.
const TODOS_LOS_PARAMETROS = (escalones = []) => [...PARAMETROS, ...PARAMETROS_MOTOR(escalones), ...PARAMETROS_JORNADA]
/** Sereno se paga por MES: no entra en la comparación por hora. */
/**
 * LOS DOS DRIVERS MEDIDOS, PUBLICADOS COMO RANGO CON NOMBRE EN «Parámetros».
 *
 * No son entradas del dueño: los MIDE este generador sobre las quincenas cerradas. Pero se leen desde
 * nueve fórmulas de la grilla y antes vivían en dos filas sueltas arriba del cuadro, que es lo que el
 * dueño mandó sacar. Con nombre, la fórmula no cita una fila —que se mueve en cada corrida— y la
 * cifra se puede mirar donde se miran todas las demás entradas del libro.
 */
export const RANGO_HORAS_MEDIDAS = 'JORNALES_HORAS_MEDIDAS'
export const RANGO_SHARE_ADELANTO = 'JORNALES_SHARE_ADELANTO'

const ES_MENSUAL = (cat) => cat === 'Sereno'

/**
 * NÚCLEO PURO: el último día ya cargado de un bloque de quincena del espejo.
 *
 * Las fechas del encabezado del bloque vienen DESORDENADAS y con huecos (feriados, días sin
 * cuadrilla), así que no sirve "la última celda con dato": hay que quedarse con el máximo real.
 *
 * @param {any[]} filaFechas la fila de fechas del bloque ("5/1", "6/1", …)
 * @param {number} anio
 * @returns {Date|null}
 */
export function ultimoDiaCargado(filaFechas = [], anio = AÑO) {
  let mejor = null
  for (const c of filaFechas) {
    const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(c ?? '').trim())
    if (!m) continue
    const d = new Date(anio, Number(m[2]) - 1, Number(m[1]))
    if (!mejor || d > mejor) mejor = d
  }
  return mejor
}

/**
 * NÚCLEO PURO: hasta qué día tiene HORAS CARGADAS un bloque de quincena.
 *
 * POR QUÉ HACE FALTA, ADEMÁS DEL ÚLTIMO DÍA (23/07). El dueño, mirando el registro: *"la última fila
 * de este cuadro está mal porque considera que la quincena que está en curso ya pasó"*. Y tenía
 * razón: la columna "Hasta" sale del último día que figura en el ENCABEZADO del bloque, y la
 * planilla escribe las catorce fechas de la quincena de entrada, el día que la abre. O sea que una
 * quincena recién empezada ya declara que termina el 31 — y el cuadro la mostraba igual que a una
 * cerrada.
 *
 * Medido en el bloque del 16/07 (hoy 23/07): de sus catorce días, sólo cinco tienen horas cargadas
 * (16, 17, 18, 20 y 21 de julio). Los otros nueve están vacíos. Eso es lo que distingue una quincena
 * en curso de una cerrada, y no se puede saber mirando las fechas: hay que mirar las horas.
 *
 * ═══ UNA PERSONA ADELANTADA NO CIERRA LA QUINCENA (08/09/2026) ═══
 *
 * Esto devolvía el último día con horas DE AL MENOS UNA persona. Medido en el bloque del 01/09 (hoy
 * 08/09): catorce personas tienen horas hasta el 07/09 y UNA (Gonzalez J.) las tiene cargadas hasta el
 * 11/09. El «resto de la quincena» arrancaba entonces el 12/09 —dos días hábiles, $557.086— y los
 * cuatro días del 08 al 11/09 de las otras catorce personas no estaban en ningún lado: ni en el real
 * (no cargados) ni en la proyección (ya "cubiertos"). El dueño lo vio en el gráfico de CAJA: la
 * quincena que se paga el 16/09 salía a la mitad de cualquier quincena cerrada.
 *
 * El día que cuenta es el último en que trabajó LA CUADRILLA: al menos la mitad de las personas del
 * bloque con horas ese día. Un sábado con cinco de quince no cuenta —y no importa, porque la fórmula
 * del calendario tampoco cuenta sábados—; un día con una sola persona, tampoco.
 *
 * @param {any[][]} grid   el espejo completo
 * @param {{inicio:number, fin:number, filaFecha:number}} bloque
 * @param {number} anio
 * @returns {Date|null} el último día en que trabajó al menos la mitad de la cuadrilla
 */
export function ultimoDiaConHoras(grid = [], bloque, anio = AÑO) {
  if (!bloque) return null
  const fechas = grid[bloque.filaFecha - 1] ?? []
  const horas = (r, col) => {
    const v = Number(String((grid[r - 1] ?? [])[col] ?? '').replace(',', '.'))
    return Number.isFinite(v) && v > 0
  }
  // La cuadrilla del bloque son las personas con alguna hora cargada en él, no las filas: una fila
  // abierta sin una sola hora (alta reciente, licencia entera) no puede exigir que se la espere.
  let cuadrilla = 0
  for (let r = bloque.inicio; r <= bloque.fin; r++) {
    let trabajó = false
    for (let col = 5; col <= 20 && !trabajó; col++) trabajó = horas(r, col)
    if (trabajó) cuadrilla++
  }
  if (!cuadrilla) return null
  const minimo = Math.ceil(cuadrilla / 2)
  let mejor = null
  // F..U son las columnas de días del bloque. El mismo rango que usa el cuadro para contarlos.
  for (let col = 5; col <= 20; col++) {
    const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(fechas[col] ?? '').trim())
    if (!m) continue
    let trabajaron = 0
    for (let r = bloque.inicio; r <= bloque.fin; r++) if (horas(r, col)) trabajaron++
    if (trabajaron < minimo) continue
    const d = new Date(anio, Number(m[2]) - 1, Number(m[1]))
    if (!mejor || d > mejor) mejor = d
  }
  return mejor
}

/**
 * NÚCLEO PURO: las quincenas que faltan desde `desde` (inclusive) hasta fin de año.
 *
 * Una quincena va del 1 al 15 o del 16 al último día del mes. `desde` es el primer día que todavía
 * NO está pagado, así que la primera quincena proyectada puede arrancar a mitad de tramo — y está
 * bien que arranque ahí: son los días que faltan pagar de ese tramo, ni uno más.
 *
 * @param {Date|null} desde
 * @param {number} anio
 * @returns {{desde:Date, hasta:Date}[]}
 */
export function quincenasPendientes(desde, anio = AÑO) {
  if (!desde) return []
  const out = []
  let d = new Date(desde)
  const finDeAño = new Date(anio, 11, 31)
  while (d <= finDeAño && out.length < 30) {
    const finTramo = d.getDate() <= 15
      ? new Date(anio, d.getMonth(), 15)
      : new Date(anio, d.getMonth() + 1, 0)
    // ═══ UN TRAMO SIN UN SOLO DÍA LABORABLE NO ES UNA FILA (13/08) ═══
    //
    // El dueño: *"el cuadro 1.3 esta mal porque dice quincena y hasta en la primera fila q sale
    // aparecen la misma fecha"*. Era literal: al 12/08 la planilla tenía horas hasta el 14/08, así
    // que el resto de la quincena era un tramo de un solo día —el sábado 15— y la pestaña publicaba
    // `Quincena 15/08 · Hasta 15/08 · Días — · Proyectado —` en el PRIMER renglón del cuadro.
    //
    // Es un caso normal, no un accidente: pasa cada vez que la carga llega al 15 o al último del mes,
    // o sea dos veces por mes. La fila no se maquilla —no hay nada que mostrar—: no se emite. El
    // criterio de día laborable es el MISMO que la fórmula escribe en la pestaña (lunes a sábado, ver
    // lib/jornales-calendario.mjs), así que no puede haber una fila que acá valga cero y allá no.
    const habiles = diasLaborables(d, finTramo)
    if (habiles > 0) out.push({ desde: new Date(d), hasta: finTramo, dias: habiles, resto: d.getDate() !== 1 && d.getDate() !== 16 })
    d = new Date(finTramo)
    d.setDate(d.getDate() + 1)
  }
  return out
}

const fecha = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
/** NÚCLEO PURO: el período 'YYYY-MM' del mes SIGUIENTE al de `d`. Cruza el 1° de enero sin mes 13. */
export function periodoSiguiente(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
}

/**
 * NÚCLEO PURO: ¿la celda "Se paga el" la escribió una persona a mano?
 *
 * SI SÍ, GANA ELLA. Es la regla de oro del archivo ("lo que el dueño edita a mano es la verdad
 * definitiva") y acá es además la ÚNICA forma de cargar un dato que todavía no existe: la quincena que
 * cierra hoy no tiene lote en el banco porque el pago es la semana que viene, así que si el dueño
 * decide el jueves en vez del lunes, lo escribe y ningún generador se lo pisa.
 *
 * Se exige que PAREZCA UNA FECHA. Mirar sólo "no empieza con =" no alcanzaba: la columna C del layout
 * anterior era "Días hábiles", y un 10 o un 14 pegados a mano ahí se habrían preservado como si
 * fueran la fecha de pago de la quincena. Un serial de Sheets de 2026 está arriba de 46.000; un día
 * hábil nunca pasa de 16.
 */
export function esFechaAMano(v) {
  const s = String(v ?? '').trim()
  if (!s || s.startsWith('=')) return false
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s)) return true
  return /^\d{5}$/.test(s) && Number(s) > 40000
}

/**
 * La grilla entera. `bloques` son las quincenas detectadas en el espejo.
 * `pagoPrevio` es la columna C tal como está hoy en la pestaña (render FORMULA), para no pisar una
 * fecha de pago escrita a mano.
 */
export function grilla({
  bloques, pendientes, bloquesOfi, pagoPrevio = [], ultimoDiaOfi = null,
  // ── LO QUE EL MOTOR NECESITA. Todo se resuelve en `main()` leyendo las fuentes; acá sólo se arma
  // la grilla, que es lo que los tests pueden ejercitar sin red.
  escalones = [], bloqueBase = null, categorias = [], personasBase = 0,
  // DE DÓNDE SALIÓ EL PLANTEL DEL PISO ('vigente' | 'cerrada'). No cambia un solo importe: cambia el
  // RÓTULO del cuadro 4.1, y un rótulo que dice "última quincena cerrada" sobre el plantel de hoy es
  // un dato falso escrito en la pestaña. Lo resuelve `bloqueDelPlantel` en main().
  origenPlantel = 'vigente',
  escalonVigente = null, meses = [], hoy = new Date(),
  // EL MES DE LA ÚLTIMA QUINCENA CERRADA DE OBRA. No siempre es el primero del cuadro 1.2: cuando la
  // planilla de Oficina va atrasada, su mes entra antes y ancla la tabla. Ver `filasEscalon`.
  periodoBase = null,
  // La demanda de las obras vendidas, ya valuada por quincena (jornales-demanda-fuente). Con null la
  // grilla es EXACTAMENTE la de siempre: el MAX sólo entra donde hay demanda.
  demanda = null,
  // EL PLANTEL DEL AÑO, ya separado en quien sigue y quien se fue. Se resuelve en `main()` porque
  // necesita el espejo entero y acá sólo llegan los bloques.
  desvinculacion = null,
}) {
  // El bloque base por defecto es el último del espejo: mantiene el comportamiento anterior cuando
  // el llamador no resolvió la última quincena cerrada (sólo pasa en tests viejos).
  bloqueBase ??= bloques[bloques.length - 1]
  if (!categorias.length) categorias = ['—']
  if (!meses.length) meses = [{ anio: AÑO, mes: (pendientes[0]?.desde ?? new Date(AÑO, 7, 1)).getMonth() + 1, periodo: `${AÑO}-01` }]
  const filas = []
  /**
   * La celda "Se paga el" de la fila `r`: mi fórmula, o vacío para que la fusión preserve la fecha que
   * escribió el dueño. Cadena vacía —no VACIO— porque VACIO significa "es mi celda y va vacía".
   */
  const pago = (r) => (esFechaAMano(pagoPrevio[r - 1]) ? '' : formulaSePagaEl(`B${r}`))
  /**
   * Agrega una fila rellenada al ancho de la pestaña y devuelve su número (1-based).
   *
   * EL RELLENO ES EL CENTINELA, NO LA CADENA VACÍA. Son dos cosas distintas y confundirlas deja la
   * pestaña rota: `''` significa "esta celda no es mía, preservá lo que haya" y VACIO significa "es
   * mía y va vacía". Rellenando con `''`, las 167 celdas del layout anterior —fórmulas que
   * apuntaban a filas que ya no existen— sobrevivían debajo de la grilla nueva y daban 24 #VALUE!.
   * Las once columnas de esta pestaña son todas de este generador.
   */
  const push = (c = []) => {
    const r = [...c]
    // ═══ LA COLUMNA 14 NUNCA SE RELLENA CON EL CENTINELA (06/08 — tercera vez que muerde) ═══
    //
    // "Pagado el" es LA columna del dueño. Rellenar el ancho completo con VACIO significa "es mía y
    // va vacía": la fusión le borró las 14 fechas por TERCERA vez (las dos anteriores están en la
    // memoria del repo). El relleno llega hasta la 13; la 14 va con '' = "no es mía, preservá".
    while (r.length < ANCHO - 1) r.push(VACIO)
    if (r.length < ANCHO) r.push('')
    filas.push(r)
    return filas.length
  }
  // El blanco también respeta la columna del dueño: 13 centinelas + '' (la 14 no es nuestra).
  const blanco = () => push([...Array(ANCHO - 1).fill(VACIO), ''])
  /**
   * UN FACTOR DE 1,0000 NO ES INFORMACIÓN: ES RUIDO CON CUATRO DECIMALES.
   *
   * La columna «Ajuste escalón» de los dos bloques mensuales publicaba «1,0000» en todas las filas
   * donde el mes no acumula ningún tramo de paritaria — que hoy son casi todas. Doce renglones de
   * «1,0000» al lado de los importes son doce celdas que el ojo tiene que descartar para llegar al
   * número que decide. La columna se queda: el día que un mes ajuste, ahí se ve, y sólo ahí.
   *
   * NO SE TOCA LA ARITMÉTICA. La celda sigue devolviendo el mismo factor; lo que cambia es que un 1
   * se dibuja vacío. La expresión se repite una vez dentro de la MISMA celda —no son dos
   * definiciones en dos lugares—, que es el precio de no tener que envolver `formulaFactorDelMes`.
   */
  const soloSiAjusta = (formula) => {
    const cuerpo = String(formula).replace(/^=/, '')
    return `=IF(IFERROR(${cuerpo};1)=1;"";${cuerpo})`
  }

  // ══ EL ENCABEZADO Y EL TITULAR — EL MISMO PATRÓN QUE «Cargas Sociales» (09/09/2026) ══
  //
  // El dueño, textual: *«los diseños de todas las pestañas son distintos, tenés que mejorar y
  // unificar»*. La forma es una sola en todo el libro: fila 1 el título, fila 2 en blanco, y de la 3
  // a la 5 el TITULAR — dos o tres renglones «⇒ rótulo | cifra» con lo único que decide algo.
  //
  // ═══ LA FILA 2 DECLARA PROCEDENCIA, Y NO ES OPCIONAL (09/09/2026) ═══
  //
  // Se probó sacarla —«sin subtítulo, sin explicación»— y el auditor de patrón la reclamó sobre la
  // copia: `fila 2 · sin-subtitulo`. No es un capricho: es la misma regla que cumplen «Cargas
  // Sociales», «Nómina» y las otras doce, y `podarProsa` la impone en el camino de escritura de
  // todas. Una pestaña de plata que no dice de dónde salen sus números no es minimalista: es anónima.
  //
  // LO QUE SÍ SE FUE ES LA EXPLICACIÓN. Decía «Obra, oficina y dirección · fuente: planilla JORNALES
  // y escala UOCRA · al 08/09»: tres tramos y una fecha que envejecía en la celda. Queda la fuente,
  // que es lo único que ninguna otra celda del cuadro puede contestar. Hasta qué día llega la carga
  // sale por el log de la corrida y por `registrarSincronizacion`.
  push(['Jornales por quincena'])
  push(['Fuente: planilla JORNALES y escala UOCRA'])
  // ═══ LAS FILAS 2 Y 3 SON DEL CONTRATO, NO MÍAS (09/09/2026) ═══
  //
  // `podarProsa` —el podador que corre en el camino de escritura de las quince pestañas de pantalla—
  // impone el encabezado: fila 1 el nombre de la pestaña, fila 2 la línea de procedencia recortada,
  // fila 3 VACÍA. No es negociable desde acá: es lo que hace que las quince arranquen igual, que es
  // exactamente lo que el dueño pidió al decir que «los diseños de todas las pestañas son distintos».
  //
  // Y ES POR QUÉ EL TITULAR NO PUEDE IR EN LA 3. La primera versión lo puso ahí y el podador vació la
  // fila entera: «⇒ Próxima quincena» y sus dos cifras desaparecieron de la pestaña sin un error.
  // Medido sobre la copia del Sheet, no deducido. El titular arranca en la 4.
  blanco()
  // ═══ TRES CIFRAS, Y LAS TRES SALEN DE ESTA PESTAÑA ═══
  //
  // «Cuánto hay que pagar, cuándo, y por qué canal» es la pregunta con la que se abre la planilla. El
  // hero anterior la contestaba CITANDO a «Nómina» —trece fórmulas `INDEX('Nómina'!…)`— y por eso se
  // retiró: dos pestañas publicando el mismo número es como empiezan las dos verdades, y «Nómina» va
  // a desaparecer. Estas tres celdas salen de la grilla de abajo, de la misma columna que el Cash
  // Flow lee por rango con nombre: si el cuadro cambia, el titular cambia con él y no puede
  // contradecirlo.
  //
  // Se resuelven abajo, cuando se conocen las filas de la grilla.
  const fProxima = push([rotuloTotal('Próxima quincena')])
  const fBanco = push([rotuloTotal('Por banco')])
  const fEfectivo = push([rotuloTotal('En efectivo')])
  blanco()

  // ══ 1 · EL CALENDARIO DE PAGO ══
  //
  // ═══ UNA SOLA GRILLA, Y ÉSE ERA EL RECLAMO (09/09/2026) ═══
  //
  // El dueño llamó desastre a la pestaña: 151 filas y siete bloques para contestar una pregunta que
  // es una sola —cuándo sale cada peso de nómina y cuánto—. Las quincenas estaban partidas en DOS
  // tablas de gramática distinta: el registro de lo cerrado, con catorce columnas, ochenta filas más
  // abajo; y el calendario de lo que falta, con ocho columnas y rótulos propios. La misma fila —una
  // quincena— se leía distinto según de qué lado del año cayera.
  //
  // Ahora es UNA tabla con UN encabezado: arriba las quincenas cerradas, abajo las que faltan, y la
  // columna «Estado» diciendo cuál es cuál. Cada tramo cierra con su total, que es lo único que los
  // separa — y son las dos cifras que el dueño lee: lo que ya salió y lo que falta.
  //
  // ═══ OFICINA Y DIRECCIÓN NO ENTRAN A ESTA GRILLA, Y ESTÁ MEDIDO POR QUÉ ═══
  //
  // Sus meses no se pueden convertir en filas de este calendario sin cambiar `deOficina`/`deDireccion`
  // de `lib/libro-extractores-nomina.mjs`, que es el eslabón entre esta pestaña y la línea «Nómina ·
  // Sueldos administración» de los dos Cash Flow. Esos extractores leen un bloque MENSUAL con tres
  // columnas —`_PAGO`, `_PAGADO`, `_PROYECTADO`— y deciden REAL o PROYECTADO por cuál de las dos
  // últimas tiene plata. Una fila de este calendario tiene UN total y es quincenal: para meterlos
  // habría que reescribir `deBloqueMensual` y el reparto mes → quincena, y ahí se cae la garantía de
  // que las dos líneas del Cash Flow den exactamente lo mismo antes y después ($33.330.363 real y
  // $46.820.400 proyectado). Se quedan como sub-bloques compactos de esta misma sección (1.1 y 1.2),
  // con sus doce filas mensuales y sus seis rangos con nombre intactos.
  push([seccion(1, 'Calendario de pago')])
  // ═══ LOS DOS DRIVERS DE LA PROYECCIÓN VIVEN EN «Parámetros» (09/09/2026) ═══
  //
  // Eran dos filas arriba del cuadro —«Horas por persona y día 7,19» y «Adelanto sobre el total
  // 13,8%»—: dos cifras sueltas en una pestaña donde todo lo demás es plata, y el dueño las nombró
  // entre lo que sobra. Se mudan a la pestaña de entradas con `JORNALES_HORAS_MEDIDAS` y
  // `JORNALES_SHARE_ADELANTO`, y las nueve filas proyectadas las leen por NOMBRE.
  //
  // NO SON CONSTANTES, Y POR ESO NO ALCANZA `asegurarParametros`: las dos se MIDEN sobre las
  // quincenas cerradas de este mismo cuadro, así que su fórmula cita filas que se mueven en cada
  // corrida. `asegurarParametros` está construido para no pisar nunca un valor —es la diferencia
  // entre un parámetro y una constante disfrazada— y estas dos hay que reescribirlas. Van por
  // `asegurarMedidos`, que sólo toca esas dos celdas y dice en el log lo que escribió.
  push(REGISTRO_COLS)
  const f0 = filas.length + 1
  // ── LO CERRADO: una fila por quincena del espejo ──
  //
  // «Estado» distingue las tres cosas que antes eran una. Cerrada no es pagada: la que cerró el 31/07
  // se paga el 03/08. Y «Pagado el» es un hecho que gana sobre cualquier previsión.
  //
  // ═══ "Pagado el" NO SE ESCRIBE. NUNCA. ES LA CELDA DEL DUEÑO ═══
  //
  // La primera versión emitía VACIO en esa columna —el centinela que significa "es mía y va vacía"— y
  // la fusión hizo exactamente lo que le pedí: BORRÓ LAS 14 FECHAS que el dueño acababa de cargar a
  // mano. La fila se emite SIN esa celda: una fila más corta la deja fuera del footprint del
  // generador, y `fusionar` preserva lo que haya.
  const cPagado = colDe('Pagado el')
  filasQuincenas(bloques, ESPEJO).forEach((fila, i) => {
    const r = f0 + i
    const [colA, colB, ...resto] = fila.map((c) => c.f)
    push([colA, colB, pago(r), ...resto,
      // UNA PALABRA. Decía «pagada el 18/5» al lado de una columna «Pagado el» que muestra
      // «18/05/2026»: la misma fecha dos veces en la misma fila, una de ellas recortada. La columna
      // contesta en qué estado está la quincena y nada más.
      `=IF(N(B${r})=0;"";IF(N(${cPagado}${r})>0;"pagada";IF(B${r}<=TODAY();"cerrada";"en curso")))`])
  })
  const fLast = f0 + bloques.length - 1
  // Se cierra contra la fila de ARRIBA, no contra un número de fila escrito a mano: así una fila
  // insertada nunca puede quedar afuera del total. Es el techo de 14 quincenas, arreglado de raíz.
  const cierra = (c) => `=SUM(${c}$${f0}:INDEX(${c}:${c};ROW()-1))`
  const fTotalReal = push([
    rotuloTotal('Pagado en el año'), ...Array(5).fill(VACIO),
    ...['Banco', 'Adelanto', 'Recibo', 'Total'].map((x) => cierra(colDe(x))),
  ])
  // ── LO QUE FALTA: las quincenas pendientes, en la MISMA grilla ──
  const p0 = filas.length + 1
  const pFin = p0 + pendientes.length - 1
  const cTotalQ = colDe('Total')
  pendientes.forEach((q, i) => {
    const r = p0 + i
    // Los canales del acuerdo 50/50. Desde hoy el reparto es sólo de OBRA: oficina y dirección ya no
    // comparten columna con las quincenas, así que sumarlas acá contaría dos veces lo que sus propios
    // rangos con nombre ya publican.
    const canal = canalesProyectados({ obreros: `$${cTotalQ}${r}` })
    push([
      // La primera arranca el día siguiente al último con HORAS CARGADAS; las demás encadenan. Así la
      // quincena en curso queda partida en su parte real y su parte proyectada, y el mes de transición
      // deja de sumar una quincena a medio cargar MÁS una quincena entera (defecto A8).
      i === 0 ? fecha(q.desde) : `=B${r - 1}+1`,
      // EL CIERRE DE UNA QUINCENA SE DEFINE UNA SOLA VEZ, en `expresionCierreDeQuincena`.
      `=${expresionCierreDeQuincena(`A${r}`)}`,
      // LA FECHA DE CAJA. Una quincena proyectada nunca tiene lote en el banco, así que acá manda el
      // parámetro — pero la fórmula es la MISMA que en las cerradas, para que el día que el pago
      // aparezca en el extracto la fila se corrija sola sin que nadie la toque.
      pago(r),
      // Los días L-V del tramo, con la MISMA expresión que la proyección usa adentro (`expresionDias`):
      // una definición, dos lugares que la muestran.
      `=${expresionDias(`A${r}`, `B${r}`)}`,
      // El plantel se resuelve abajo (vive en el cuadro 2.1). Las HORAS de la fila son las de la
      // quincena entera —medidas × personas × días—, la MISMA magnitud que publica la columna en las
      // quincenas cerradas: poner ahí las 7,19 h por persona y día dejaría dos unidades distintas en
      // una sola columna, que es el defecto de unidad que arruina una planilla financiera.
      VACIO, `=${RANGO_HORAS_MEDIDAS}*${colDe('Personas')}${r}*${colDe('Días')}${r}`,
      // LOS CANALES SALEN DEL ACUERDO, NO DE UNA MEDICIÓN (14/08). El dueño: *"el acuerdo es 50 y 50
      // todas las quincenas"*. El adelanto es lo único medido —no es un canal, es CUÁNDO sale la
      // plata— y el recibo es el resto, por definición: los tres siempre suman el total.
      canal.banco, `=$${cTotalQ}${r}*${RANGO_SHARE_ADELANTO}`,
      `=$${cTotalQ}${r}-${colDe('Banco')}${r}-${colDe('Adelanto')}${r}`,
      // El TOTAL se resuelve ABAJO: cita el cuadro del escalón, que vive en la sección 2.
      VACIO,
      // «$/hora» va vacía a propósito: la Σ que aplica a cada mes está entera en el cuadro 2.2, con su
      // origen y su estado al lado. Repetirla acá sería la segunda copia de una definición.
      VACIO,
      'proyección',
    ])
  })
  const sumaCol = (c) => `=SUM(${c}${p0}:${c}${pFin})`
  const fTotalProy = push([
    rotuloTotal('A pagar hasta diciembre'), ...Array(5).fill(VACIO),
    ...['Banco', 'Adelanto', 'Recibo', 'Total'].map((x) => sumaCol(colDe(x))),
  ])
  blanco()

  // ══ 1.1 · SUELDOS DE OFICINA ══
  //
  // POR QUÉ APARECE (23/07). El dueño: "¿estás considerando los sueldos de las personas de oficina?".
  // No: la pestaña leía sólo _J_OBREROS. Y el hallazgo era peor que el olvido — `_J_OFICINA` se
  // replica del archivo JORNALES en CADA corrida del agente y NO lo consumía ni una sola fórmula del
  // libro. Una fuente que se mantiene viva y que nadie lee: el trabajo de traerla se hacía, el dato
  // no llegaba a ningún número.
  //
  // ESTA PLANILLA VA ATRASADA, Y ESO SE MUESTRA. Al 23/07 su último bloque cargado es el del
  // 16/06–30/06, un mes detrás del de obra. No se rellena el hueco con una estimación disfrazada de
  // dato: las quincenas sin cargar entran en la proyección, rotuladas como lo que son.
  push([seccion('1.1', 'Oficina · sueldos por mes')])
  // ═══ EL HUECO SE DECLARA, NO SE DEJA EN BLANCO (31/07) ═══
  //
  // El dueño: "esta sin atender el cuadro de jornales de oficina, dato q se obtiene del sheet jornales".
  // Verificado: la pestaña "Oficina 26" de la planilla JORNALES —la fuente— termina el 30/06. Julio no
  // está cargado ahí, así que el OS no tiene de dónde sacarlo: la celda "Pagado" de julio va vacía
  // porque el dato NO EXISTE, no porque el cuadro esté roto.
  //
  // Pero una celda vacía sin explicación se lee como un error. Se dice en la pestaña hasta qué día llega
  // la planilla y desde qué mes lo que se ve es PROYECCIÓN. Es la regla del archivo: nunca ocultar un
  // gap, nunca presentar una proyección como un hecho.
  // ═══ UN MES A MEDIO CARGAR NO ES LA BASE DE NADA (13/08) ═══
  //
  // Medido en la pestaña viva: la planilla de Oficina llegaba al 15/08 y agosto figuraba "pagado
  // $814.500" — media quincena—. La base de la proyección era "el último mes con dato", así que
  // septiembre a diciembre se proyectaban sobre ese medio mes: $830k, $846k, $862k, $878k, cuando los
  // seis meses completos anteriores promedian $3,5M. **La oficina venía proyectada cuatro veces por
  // debajo** —$3,4M contra ~$14M— y el cash flow leía ese número por rango con nombre.
  //
  // Ningún error, ninguna celda en rojo: un mes parcial se ve idéntico a un mes cerrado. La única
  // forma de distinguirlos es preguntarle a la FUENTE hasta qué día llega, que es lo que hace
  // `completoOfi`. El mes parcial conserva lo que ya se pagó y proyecta sólo el resto.
  const finDeMesOfi = (i) => new Date(AÑO, i + 1, 0)
  // SIN FECHA DE COBERTURA NO SE PUEDE OPINAR SOBRE LA COMPLETITUD: se conserva el criterio anterior
  // (un mes con bloque es un mes cerrado). Devolver `false` acá dejaría los doce meses sin base y el
  // bloque entero en blanco — un cuadro vacío por una precaución, que es peor que el criterio viejo.
  const completoOfi = (i) => !ultimoDiaOfi || ultimoDiaOfi >= finDeMesOfi(i)
  const conBloque = (i) => bloquesOfi.some((b) => b.mes === i + 1)
  // El último mes CERRADO con dato: la única base honesta. Sin ninguno, no hay proyección de oficina
  // y el cuadro lo dice en vez de multiplicar un mes a medias.
  // UN MES ESTÁ CERRADO CUANDO TIENE DATO **Y** LA PLANILLA YA PASÓ SU ÚLTIMO DÍA. Las dos
  // condiciones: con sólo la fecha, un mes que la planilla nunca cargó se declararía "pagado" y
  // quedaría sin proyectar ni mostrar un peso — un agujero mudo en el medio del año.
  const cerradoOfi = (i) => conBloque(i) && completoOfi(i)
  const iBaseOfi = MESES.map((_, i) => i).filter(cerradoOfi).pop() ?? null
  // ═══ LAS DOS GLOSAS DE ARRIBA DEL CUADRO SE FUERON (09/09/2026) ═══
  //
  // «· Planilla Oficina al 30/06 — ver «Estado» por mes» y «· Aumenta por el mismo % que obra — sin
  // piso propio». Las dos decían en prosa lo que el cuadro publica en columnas: «Estado» dice mes por
  // mes si es un hecho o una proyección, y «Ajuste escalón» muestra el factor con cuatro decimales.
  // La fecha de corte de la planilla sí es información que ninguna celda tiene — y por eso sale por
  // el log de la corrida, que es donde la lee quien puede hacer algo con ella.
  // "Proyectado" va en la MISMA columna que el "Proyectado" de la proyección de obra (H): dos totales
  // del mismo concepto en columnas distintas se leen como dos conceptos distintos.
  // ═══ "SE PAGA EL": LA FECHA DE CAJA DE LA OFICINA (31/07) ═══
  //
  // POR QUÉ (31/07). El dueño: "no estás considerando oficina... se ve mal todo en cashflow". Medido:
  // este bloque leía la planilla y quedaba en pantalla, pero NINGUNA fórmula del libro lo consumía —
  // la línea "Sueldos de administración" del cash flow salía de Compras ($51,0M) y este bloque decía
  // otra cosa ($19,9M pagados + $21,4M proyectados). Dos definiciones del mismo sueldo, y la que
  // sumaba era la que no viene de la planilla de sueldos. Es la regla 9: un solo juego de rubros.
  //
  // Para que el cash flow lo pueda ubicar hace falta una FECHA, y la oficina se liquida por MES. El
  // criterio queda ESCRITO en la pestaña, no escondido en el código: cierre de mes + el mismo desfase
  // de pago que la obra (JORNALES_DESFASE_PAGO, el parámetro que el dueño puede corregir). Si mañana
  // se paga otro día, se cambia el parámetro y se mueven las dos cosas juntas.
  // ═══ LAS DOS COLUMNAS DE ENTRADA: POR QUÉ CANAL SALIÓ EL SUELDO (01/08) ═══
  //
  // Este bloque tenía UNA sola columna de plata ("Pagado"), sin canal. Con eso CAJA no podía restarlo
  // de ningún lado: media empresa paga la mitad por transferencia y la mitad en billetes, y adivinar
  // cuál mitad es fabricar un dato. Con Banco y Efectivo, cada peso sale de donde salió de verdad.
  //
  // SÓLO SE ESCRIBE EL ENCABEZADO. Las celdas de abajo NO se emiten —el generador no las incluye en la
  // fila— así que la fusión preserva lo que escriba el dueño y no se lo pisa en la próxima corrida. Es
  // lo contrario del centinela VACIO, que significa "es mía y va vacía".
  //
  // UNA SOLA COLUMNA, NO DOS, Y NO ES POR ESPACIO. La primera versión agregaba "Banco" y "Efectivo" al
  // final y dejaba la pestaña con tres anchos de grilla (8, 10 y 14): el auditor de patrón lo cazó en
  // la primera corrida. Obligó a un diseño mejor: se carga LO QUE SALIÓ POR TRANSFERENCIA y el efectivo
  // es el resto, por definición. Así los dos canales SIEMPRE suman lo pagado —no puede haber un mes
  // donde las partes no cierren contra el total— y es un número menos para cargar.
  //
  // Vacío ≠ cero. Una celda vacía significa "todavía no sé por dónde salió" y no se resta de ninguna
  // disponibilidad; un 0 significa "no salió nada por banco, fue todo en billetes". Las distingue
  // ISNUMBER, y la diferencia se ve en el bloque "LO QUE NO CIERRA".
  // ═══ NINGUNA COLUMNA MUDA, Y NINGÚN ENCABEZADO QUE MIENTA (06/08) ═══
  //
  // La D no tenía encabezado y traía la palabra "proyección" en cinco filas: una columna con dato y
  // sin título es una celda que el lector no sabe cómo leer. Ahora se llama "Estado" y dice, en una
  // palabra, si el mes es un HECHO o una estimación — que es lo primero que hay que saber de una fila.
  //
  // Y la G decía "Ajuste inflación" desde antes de que este bloque dejara de ajustar por inflación:
  // el 06/08 pasó a usar el MISMO factor de escalón salarial que la obra (un sueldo de administración
  // sube por acuerdo, no porque suba la nafta). El encabezado se quedó con el criterio viejo, que es
  // la peor clase de rótulo: el que hace creer que el número significa otra cosa.
  //
  // ═══ «Personas» SE FUE Y ENTRÓ «Adelanto» — EL ANCHO NO SE NEGOCIA (14/08) ═══
  //
  // El dueño: *"quiero q la tabla de 'oficina' sea igual que la de 'obreros'"*. La de obreros abre el
  // canal de pago en tres columnas (Banco · Adelanto · Total recibo) contra su TOTAL; ésta tenía una
  // sola (Banco). Agregar las dos que faltaban llevaba el cuadro a diez columnas y dejaba la pestaña
  // con TRES anchos de grilla (8, 10 y 14) — el defecto que el auditor de patrón ya rechazó una vez y
  // que el dueño llama "descuadrado". El ancho es 8, y para entrar hay que sacar.
  //
  // SALE «Personas», Y POR EL CRITERIO QUE ESTA MISMA PESTAÑA YA APLICÓ. El calendario perdió sus
  // columnas «Personas» y «Horas por persona» el 13/08 con este argumento escrito: *"repetían doce
  // veces el mismo número … son andamiaje que ocupaba el lugar de las cifras que el dueño necesita
  // leer"*. Acá es literal: dos personas en oficina, tres socios en dirección, doce veces. Y ninguna
  // fórmula del libro la consume — no hay un solo rango con nombre apoyado en ella, al revés de
  // JORNALES_REAL_PERSONAS, que es de obra y se queda.
  //
  // ENTRA UNA SOLA DE LAS DOS QUE FALTABAN, NO DOS. «Total recibo» no lleva columna por la misma razón
  // por la que «Efectivo» no la lleva desde el 01/08: es el RESTO (Pagado − Banco − Adelanto) y un
  // resto por definición no puede dejar de cerrar contra su total. Un número menos que cargar y una
  // partición que no puede contradecirse.
  //
  // «Ajuste escalón» se corre a la B y no se pierde: la proyección se sigue leyendo como base × factor,
  // con las dos cifras en pantalla. Y «Banco» y «Adelanto» quedan pegadas —F y G— porque son la misma
  // pregunta: por dónde salió el sueldo.
  push(['Mes', 'Ajuste escalón', 'Pagado', 'Estado', 'Se paga el', 'Banco', 'Adelanto', 'Proyectado'])
  const o0 = filas.length + 1
  MESES.forEach((nombre, i) => {
    const bs = bloquesOfi.filter((b) => b.mes === i + 1)
    const pagado = bs.length
      // Un mes puede venir partido en dos bloques en la planilla (un pago a mitad de mes y otro a
      // fin): se suman, porque lo que se cobra es el mes.
      ? `=${bs.map((b) => `SUM('${ESPEJO_OFI}'!Z${b.inicio}:Z${b.fin})`).join('+')}`
      : VACIO
    // Los meses sin cargar se proyectan sobre el último mes cargado, ajustado por inflación. Son dos
    // sueldos fijos: no hay horas ni jornal que modelar, y estimarlo por hora sería inventar una
    // precisión que no existe. La base y el ajuste se ven los dos en pantalla.
    // ═══ OFICINA SE AJUSTA POR ESCALÓN SALARIAL, NO POR IPC (06/08) ═══
    //
    // El dueño: "los 3 grupos proyectados independientes". Independientes no quiere decir con
    // criterios inventados: un sueldo de administración sube por acuerdo salarial, no porque suba el
    // precio de la nafta. Se toma el MISMO factor que la obra —el cuadro 1.2, que sale del convenio y
    // del aumento esperado— y así no hay dos definiciones de "cuánto suben los sueldos" en la misma
    // pestaña. Si mañana Oficina tiene su propia paritaria, se le da su propia columna en 1.2.
    //
    // EL FACTOR SE MIDE DESDE EL MES BASE, QUE AHORA ES EL ÚLTIMO **COMPLETO**. Antes se medía desde
    // el mes del último día cargado —que es justamente el mes a medias— y así el mes parcial recibía
    // factor 1 sobre una base que ya no era la suya.
    // EL AJUSTE SE RESUELVE ABAJO: cita el cuadro del escalón, que desde el 13/08 vive en la sección 4
    // —debajo de este bloque—. Una fórmula no puede nombrar filas que todavía no se emitieron.
    // La palabra en la fila: cada mes sin cargar dice que es proyección, ahí donde se lo lee.
    // La fecha de caja del mes: fin de mes + el desfase de pago de la obra. Por fórmula, para que se
    // mueva sola si se corrige el parámetro — y visible, para que el criterio se pueda discutir.
    // ═══ LA MISMA FECHA QUE OBRA Y DIRECCIÓN (14/08, orden del dueño) ═══
    //
    // Decía `EOMONTH(mes)+JORNALES_DESFASE_PAGO`: sumaba en días CORRIDOS un parámetro que está
    // expresado en días HÁBILES. Cuando el fin de mes cae viernes o sábado los dos criterios se
    // separan y la misma nómina aterriza en dos filas distintas del calendario — medido en la pestaña
    // viva: octubre de oficina caía en la fila 01/10–15/10 (paga 01/11) y la quincena que cierra el
    // 31/10 paga el 02/11, así que oficina, obra y dirección del mismo mes quedaban en tres renglones.
    // Ahora las tres salen de `expresionSePagaEl`, con el lote del banco cuando existe.
    const pago = `=${expresionPagoDelMes(AÑO, i + 1)}`
    // ═══ EL CANAL DE OFICINA SE MIDE, IGUAL QUE EL DE OBRA (14/08) ═══
    //
    // El dueño: *"quiero q la tabla de 'oficina' sea igual que la de 'obreros' dado q el acuerdo es el
    // mismo 50% por banco (recibo de sueldo), 50% efectivo"*. La columna «Banco» existía desde el
    // 01/08 esperando que alguien la cargara a mano y nunca tuvo un dato — de ahí el rango ciego
    // `OFICINA_BANCO` y las dos líneas de sueldos de administración de CAJA en $0.
    //
    // No hacía falta cargarla: el dato YA ESTABA en la fuente. `_J_OFICINA` tiene exactamente las
    // mismas tres columnas de canal que `_J_OBREROS` —W BANCO, X ADELANTO, Y TOTAL RECIBO— y el
    // generador leía sólo la Z (el total). Se lee la W, con la MISMA regla que obra: banco es lo que
    // salió por transferencia y el efectivo es el resto, por definición.
    //
    // SÓLO DONDE HAY FUENTE. Un mes sin bloque en el espejo no lleva fórmula: la celda queda con `''`
    // —"no es mía, preservá lo que haya"— y sigue siendo del dueño. Publicar un 0 ahí diría "no salió
    // nada por banco", que es una afirmación que la planilla no hizo.
    // ═══ LA COLUMNA «Banco» DE OFICINA ES DEL GENERADOR, Y ESO CAMBIÓ HOY (14/08) ═══
    //
    // Nació el 01/08 como columna de carga del dueño y por eso los meses sin bloque iban con `''`
    // ("no es mía, preservá lo que haya"). Desde que el generador la lee de la W del espejo, la
    // columna es DERIVADA: nadie la carga a mano, y `''` dejó de proteger un dato para pasar a
    // proteger basura. Medido en la pestaña viva el 14/08, con render FORMULA:
    //
    //   F41:F44 (mayo–agosto)  `=SUMIFS($H$79:$H$90;$E$79:$E$90;…)`  ← la ventana del CALENDARIO
    //   F48     (diciembre)    `=SUM(F$36:F$47)`                      ← un TOTAL adentro de la tabla
    //
    // Con eso, el total de banco de oficina publicaba $5.238.607 contra $2.619.303 reales —exactamente
    // el doble, porque la fila de total volvía a sumar el total que había quedado en diciembre— y el
    // canal medía 10,8% por banco sobre un denominador roto. Ningún error, ninguna celda en rojo.
    //
    // El centinela lo arregla de raíz: VACIO es "es mi celda y va vacía", así que un mes que la
    // planilla todavía no cargó queda en blanco —igual que su «Pagado», que ya iba con VACIO— y nada
    // de otro cuadro puede volver a vivir ahí. Lo que YA está adentro no lo puede limpiar el
    // generador (una fórmula ajena sin huella no se pisa, y está bien que no se pise): eso sale por
    // la vía declarada, `scripts/limpiar-residuo-jornales.mjs`, celda por celda y con prueba.
    //
    // OJO CON EL REVERSO, QUE YA SE PAGÓ SEIS VECES: esto vale para Oficina, donde hay FUENTE. La
    // «Banco» de Dirección sigue con `''` — ahí no hay planilla que la alimente y la carga es del
    // dueño.
    const banco = bs.length
      ? `=${bs.map((b) => `SUM('${ESPEJO_OFI}'!W${b.inicio}:W${b.fin})`).join('+')}`
      : VACIO
    // EL ADELANTO, DE LA MISMA FUENTE Y CON LA MISMA REGLA. `_J_OFICINA` trae las tres columnas de
    // canal que trae `_J_OBREROS` (W BANCO · X ADELANTO · Y TOTAL RECIBO) y el generador leía dos.
    // Para tesorería el adelanto no es un detalle: sale ANTES del día de pago, a lo largo del mes.
    const adelanto = bs.length
      ? `=${bs.map((b) => `SUM('${ESPEJO_OFI}'!X${b.inicio}:X${b.fin})`).join('+')}`
      : VACIO
    // TRES ESTADOS, NO DOS. "parcial" es el mes que la planilla empezó a cargar y todavía no cerró:
    // lo que muestra en "Pagado" es un hecho y lo que falta va en "Proyectado". Llamarlo "pagado"
    // —como hacía este cuadro— es lo que dejó a la oficina proyectada cuatro veces por debajo.
    // ═══ Y EL ESTADO DICE ADEMÁS CUÁN FIRME ES EL AUMENTO QUE TIENE ADENTRO (14/08) ═══
    //
    // Un mes proyectado sobre un acuerdo FIRMADO y uno proyectado repitiendo el último tramo conocido
    // se veían idénticos: los dos decían "proyección" y los dos mostraban un factor de cuatro
    // decimales. Para el que decide no son lo mismo, y el número viaja por `OFICINA_PROYECTADO` hasta
    // CAJA y los dos cash flows.
    //
    // Es la MISMA información que el cuadro 4.2 publica para obra en sus columnas «De dónde sale» y
    // «Estado», leída de la MISMA fuente (`escalones`). No se recalcula: se cita el mismo origen.
    // Acá entra en una sola columna porque el ancho de la pestaña es 8 y no se negocia.
    const origen = origenDelEscalon({
      escalones,
      periodoBase: iBaseOfi === null ? null : periodoDe(AÑO, iBaseOfi + 1),
      periodoMes: periodoDe(AÑO, i + 1),
    })
    const estado = estadoOficinaDelMes({
      pago: cerradoOfi(i) ? 'pagado' : (bs.length ? 'parcial' : 'proyección'),
      origen,
    })
    push([nombre, VACIO, pagado, estado, pago, banco, adelanto, VACIO]) // B y H se completan abajo
  })
  const oFin = o0 + MESES.length - 1
  // EL TOTAL SUMA LAS DOCE FILAS DE MES Y NADA MÁS. Diciembre es un mes, no un subtotal: cuando el
  // layout viejo dejó `=SUM(F$36:F$47)` en su celda de banco, esta fila lo volvió a sumar y el canal
  // publicó el doble. La columna «Adelanto» entra al total por lo mismo que las otras dos: una
  // columna de plata sin total es una columna que nadie puede cuadrar.
  push([rotuloTotal('Oficina en el año'), VACIO,
    `=SUM(C$${o0}:C$${oFin})`, VACIO, VACIO, `=SUM(F$${o0}:F$${oFin})`, `=SUM(G$${o0}:G$${oFin})`,
    `=SUM(H$${o0}:H$${oFin})`])
  // LA GLOSA "el cash flow lee este bloque por rango con nombre: OFICINA_PAGO · OFICINA_PAGADO ·
  // OFICINA_PROYECTADO" SE FUE DE LA CELDA (13/08). Es fontanería: le importa a quien mantiene el
  // generador, no a quien mira cuánto se paga en octubre. Y el contrato no se sostenía por esa
  // oración — lo sostiene el test "EL CONTRATO: los 22 rangos con nombre siguen publicados".
  // ═══ LA BASE ES UNA CELDA CONCRETA, NO "LA ÚLTIMA CON DATO" (13/08) ═══
  //
  // Era `INDEX(C;MAX(IF(C<>"";ROW…)))` — la última celda no vacía de la columna. Esa búsqueda no puede
  // distinguir un mes cerrado de uno a medio cargar, y por eso agosto (media quincena, $814.500) se
  // convirtió en la base de los cuatro meses siguientes. La fila del mes base la decide `iBaseOfi`, en
  // JavaScript, contra la fecha hasta la que llega la planilla — que es el único dato que lo sabe.
  // Sigue siendo una REFERENCIA viva: si mañana se corrige el importe de ese mes, la proyección se
  // mueve sola.
  // El ajuste y el proyectado de cada mes se escriben al final, en un solo lugar: los dos citan el
  // cuadro del escalón, que vive en la sección 4.
  const rBaseOfi = iBaseOfi === null ? null : o0 + iBaseOfi
  blanco()

  // ══ 1.2 · LOS RETIROS DE DIRECCIÓN ══
  //
  // POR QUÉ APARECE (01/08). El dueño, sobre la línea "Sueldos de administración": *"agregalos a
  // jornales por quincena, como pagos mensuales a jorge echegaray, rodrigo echegaray y jorge corona,
  // de ahí tiene que salir y se tiene que considerar impactando en todas las pestañas, esto aún no
  // fue pagado"*. Es la respuesta a la pregunta que quedó abierta ayer —si Compras incluía gente que
  // la planilla no tiene— y era que sí: la planilla tiene DOS personas y Compras CINCO.
  //
  // El razonamiento completo, con los números medidos, está en lib/direccion-retiros.mjs. Lo que
  // importa acá: son $6.500.000 por mes que sólo estaban cargados UNA vez en Compras, así que de
  // septiembre a diciembre el cash flow proyectaba $3.000.000 donde el compromiso es $9.800.000.
  push([seccion('1.2', 'Dirección · retiros mensuales')])
  // LA GLOSA DE LA FUENTE SE FUE (09/09/2026). Decía «· Fuente: Compras — última carga de cada
  // socio»: es de dónde sale el número, no qué hay que pagar. Vive en `lib/direccion-retiros.mjs`, al
  // lado de la fórmula que la hace cierta, y sale por el log de la corrida.
  push(['Persona', 'Retiro mensual', VACIO, VACIO, 'Desde'])
  const dp0 = filas.length + 1
  // "Desde" CORONABA TRES CELDAS VACÍAS (06/08). El dato existía sólo en la fila de total —la fecha
  // del primer retiro del conjunto— así que la columna se leía como un cuadro a medio llenar. Cada
  // socio empezó a cobrar cuando empezó, y esa fecha está en Compras: se muestra por persona, y el
  // total sigue siendo el mínimo de las tres.
  for (const nombre of NOMBRES_DIRECCION) {
    const r = filas.length + 1
    push([nombre, formulaRetiroMensual(`$A$${r}`), VACIO, VACIO, formulaPrimerRetiroDe(`$A$${r}`)])
  }
  const dpFin = dp0 + NOMBRES_DIRECCION.length - 1
  // El total mensual y la fecha del primer retiro: las dos celdas de las que cuelga toda la grilla
  // de abajo. Van juntas y a la vista, no escondidas adentro de doce fórmulas repetidas.
  // LA FECHA DE LA E SE QUEDA Y NO ES DECORACIÓN: `formulaProyectadoMes` la usa como piso —ningún
  // mes anterior al primer retiro se proyecta—. Lo que estaba mal era el FORMATO: publicaba «$46.237»
  // porque el repintado de las filas de total corría DESPUÉS de las reglas por columna y las pisaba.
  // Se arregló el orden, no la fórmula (ver `requestsDeFormato`).
  const fTotalMensual = push([rotuloTotal('Retiro mensual de Dirección'), `=SUM($B$${dp0}:$B$${dpFin})`,
    VACIO, VACIO, formulaPrimerRetiro()])
  blanco()
  // La MISMA grilla que Oficina, columna por columna: dos bloques que responden la misma pregunta
  // —cuánto sale de nómina cada mes— tienen que leerse igual. "Banco" queda para cuando se registre
  // por qué canal salió; hoy ninguno está pagado.
  // ═══ LA G DEJA DE ESTAR VACÍA: EL RETIRO TAMBIÉN SE AJUSTA (07/08) ═══
  //
  // Los doce meses repetían el mismo importe. Eso es una hipótesis —"el retiro no se actualiza"— que
  // nadie escribió y que valía cuatro meses de caja. El dueño ordenó el driver: el % de la paritaria
  // UOCRA, el mismo que ya usan obra y oficina, "por más que no estén en ese gremio".
  //
  // MISMA COLUMNA Y MISMO ENCABEZADO QUE OFICINA. Los dos bloques contestan la misma pregunta con la
  // misma grilla; que el ajuste viviera en la G de uno y en la nada del otro los volvía incomparables.
  //
  // Y SIGUEN SIENDO EL MISMO CUADRO DESPUÉS DEL 14/08: cuando Oficina cambió «Personas» por «Adelanto»
  // y corrió el ajuste a la B, este bloque hizo lo mismo. Dos tablas pegadas en pantalla con las
  // mismas ocho columnas queriendo decir cosas distintas es exactamente lo que se lee corrido.
  push(['Mes', 'Ajuste escalón', 'Pagado', 'Estado', 'Se paga el', 'Banco', 'Adelanto', 'Proyectado'])
  const d0 = filas.length + 1
  MESES.forEach((_, i) => {
    const r = filas.length + 1
    // "Banco" con cadena vacía por lo mismo que en Oficina: es columna de carga del dueño y el
    // centinela se la borraría en cada corrida. Hoy ningún retiro está pagado, así que el defecto
    // todavía no costó plata — pero es el mismo, y se arregla en el mismo commit.
    //
    // EL ESTADO SE DEDUCE, NO SE CARGA. Saber si un mes ya salió obligaba a comparar dos columnas de
    // plata separadas por tres celdas; ahora lo dice una palabra en la misma fila. Sale de las mismas
    // dos celdas, así que no puede contradecirlas.
    // LA BASE DEL AJUSTE ES EL MES EN CURSO, POR FÓRMULA. El importe del retiro sale de la última carga
    // en Compras, o sea que es el valor de HOY: el mes en curso entra con factor 1 y los que siguen
    // acumulan la paritaria. `EOMONTH(TODAY();0)` y no un mes escrito acá — un mes estampado se
    // congela el día que se escribe y sigue ajustando desde una base vieja sin dar error.
    // El ajuste (B) se escribe al final, por lo mismo que el de Oficina: cita el cuadro del escalón.
    //
    // «Adelanto» (G) VA CON EL CENTINELA Y NO CON `''`, al revés que «Banco» (F). No es un descuido:
    // esa celda venía teniendo el factor del escalón y con `''` la fórmula vieja sobreviviría debajo
    // del encabezado nuevo —un residuo inmortal, que es el defecto que este commit está matando en
    // Oficina—. Y no hay carga que proteger: de los retiros no se registra el canal en ninguna parte,
    // así que la columna existe por simetría y va vacía hasta que exista una fuente. «Banco» sí
    // conserva `''`: nació como celda de carga del dueño y ahí sigue.
    push([MESES[i], VACIO, formulaPagadoMes(i + 1, AÑO),
      `=IF(N(C${r})>0;"pagado";IF(N(H${r})>0;"proyección";""))`,
      formulaSePagaElDireccion(i + 1, AÑO), '', VACIO,
      formulaProyectadoMes(`E${r}`, `C${r}`, `$B$${fTotalMensual}`, `$E$${fTotalMensual}`, `B${r}`)])
  })
  const dFin = d0 + MESES.length - 1
  push([rotuloTotal('Dirección en el año'), VACIO,
    `=SUM(C$${d0}:C$${dFin})`, VACIO, VACIO, VACIO, VACIO, `=SUM(H$${d0}:H$${dFin})`])
  // Los rangos DIRECCION_PAGO · DIRECCION_PAGADO · DIRECCION_PROYECTADO ya no se anuncian en la
  // pestaña, por lo mismo que los de Oficina (ver el comentario del total de la sección 2).
  blanco()

  // ══ 2 · CONVENIO UOCRA ══
  //
  // ═══ TODO LO GREMIAL, JUNTO Y ABAJO (13/08, segundo rechazo del dueño) ═══
  //
  // *"en el medio hay cuestiones gremiales q confunden"*. Estaba desparramado en tres lugares: el
  // plantel por categoría y el escalón mes por mes abrían la pestaña (1.1 y 1.2), el control de piso
  // vivía acá, y la vigencia de la paritaria se anunciaba arriba de todo. Tres bloques del mismo tema,
  // separados por sesenta filas de otra cosa.
  //
  // Ahora es UNA sección con tres sub-bloques, y va DESPUÉS de las tres nóminas: primero cuánto se
  // paga, después de dónde sale el número. No se sacó una sola celda —el dueño pidió explícitamente
  // mantener la información entera—: cambió dónde y en qué orden se lee.
  push([seccion(2, 'Convenio UOCRA')])
  // ═══ EL CANARIO DE LA RÉPLICA SALE POR EL LOG, NO POR UNA CELDA (09/09/2026) ═══
  //
  // `lineaEstadoReplica` publicaba «▲ Escala vencida — el último acuerdo es de 08/2026» y debajo
  // «· Paritaria UOCRA · … hasta 31/08/2026». Son dos renglones de prosa arriba de un cuadro, y el
  // dueño los nombró uno por uno. El canario NO se apaga: `main()` ya imprime el estado de la réplica
  // y su último período en cada corrida, y ahí lo lee quien puede reparar el IMPORTHTML. Una alerta
  // en una celda que se lee todos los días es invisible el día que importa.
  // ── 2.1 · EL PLANTEL DEL PISO ──
  // "abierta por categoría" era el índice del cuadro: sus filas SON las categorías. De qué quincena
  // sale el plantel se queda porque es el criterio de qué dato se está mirando, y no está en ninguna
  // celda — pero lo decide `bloqueDelPlantel`, no una cadena escrita a mano que el 27/08 decía "última
  // quincena cerrada" sobre un cuadro que ya no era ése.
  push([seccion('2.1', rotuloDelPlantel(origenPlantel))])
  // ═══ LAS DOS LÍNEAS DE ARRIBA DE 2.1 SE FUERON (09/09/2026) ═══
  //
  // `formulaConvenioPendiente` publicaba «· ▲ Sin equivalente en la escala: OF M» y
  // `lineaSupuestoAumento` «· ▲ Sin escala en _UOCRA_RAW — base: hoy, sin aumento». Las dos son
  // avisos de mantenimiento —falta declarar una equivalencia, falta que el IMPORTHTML traiga la
  // escala— y ninguna de las dos la resuelve quien mira el cuadro. La información no se pierde: la
  // columna «Estado» de cada categoría dice si esa fila lleva aumento o no, fila por fila, y la
  // corrida lo grita con nombre y monto. Las dos funciones siguen vivas con sus tests.
  const plantel = filasPlantel({
    hoja: ESPEJO, bloque: bloqueBase, categorias, personas: personasBase,
    filaInicio: filas.length + 1, escalonVigente, rotulo: rotuloDelPlantel(origenPlantel),
  })
  for (const f of plantel.filas) push(f)
  // SÓLO SE PISA SI HAY ALGO QUE DECIR. Desde el 06/09 esta línea existe únicamente cuando falta
  // declarar una equivalencia; la traducción de las que ya están resueltas se lee en la fila de cada
  // categoría. Escribir la cadena vacía dejaría el glosario de la corrida anterior VIVO en la
  // pestaña —la guarda NO-BORRAR conserva el destino cuando la fuente trae `''`—, así que sin
  // pendiente la celda se queda con el centinela `VACIO`, que sí borra.
  const fPlantel = plantel.fTotal
  blanco()

  // ── 2.2 · EL ESCALÓN, MES POR MES ──
  // "de dónde sale cada aumento" es literalmente el nombre de una de las columnas del cuadro
  // («De dónde sale»): el título anunciaba una columna que está a dos filas de distancia.
  push([seccion('2.2', 'Escalón del convenio')])
  // LA BASE DE LA PROYECCIÓN ES «LO DE HOY + EL AUMENTO», NO EL CONVENIO (29/08, orden del dueño:
  // *"del convenio sacar el 50% por categoria y eso es lo q le vamos a aumentar a cada empleado sobre
  // lo q cobran por hr hoy"*). Sale de DOS celdas del total del bloque de arriba —Σ de lo que se paga
  // hoy y Σ del aumento—, las dos fórmulas vivas: un alta, una baja o un cambio de categoría la mueven
  // sin tocar una celda. Por qué y quién lo hereda, en lib/proyeccion-convenio.mjs.
  const sigmaConAumento = escalonVigente
    ? formulaSigmaConAumento(plantel.fPrimera, plantel.fUltima, fPlantel) : null
  const esc = filasEscalon({
    meses, escalones, filaInicio: filas.length + 1, celdaSigmaBase: `$C$${fPlantel}`, periodoBase,
    celdaSigmaConAumento: sigmaConAumento, periodoConAumento: escalonVigente?.periodo ?? null,
  })
  for (const f of esc.filas) push(f)
  blanco()

  // ── 2.3 · EL CONTROL DE PISO ──
  //
  // ═══ EL DEFECTO B3, MUERTO DE RAÍZ (06/08) ═══
  //
  // Este bloque ubicaba el mes con `MATCH(TEXT(fecha;"mmmm")&"*"; _UOCRA_RAW!A:A; 0)`. El rótulo de la
  // réplica NO TRAE EL AÑO, y la réplica apila dos años y medio de acuerdos: "septiembre*" caía en
  // "Septiembre (1,3% s/ago)" de 2025 y devolvía el Ayudante a $3.687. El cuadro decía que el escalón
  // que viene BAJA y que pagamos 22,1% por ENCIMA del convenio, cuando la verdad es 16,7% por debajo.
  // `IFERROR` no disparaba porque la fórmula SÍ encontraba una fila.
  //
  // Ahora la fila la resuelve el parser (lib/uocra-acuerdos.mjs) leyendo la réplica entera, con el año
  // deducido del orden descendente de la tabla. La fórmula que va a la celda ya no busca nada: apunta
  // a una fila concreta. Y si esa fila se movió, el canario de al lado lo dice — no hay forma de que
  // muestre un número del año equivocado.
  // "ningún jornal por debajo de la escala UOCRA" es lo que MIDEN las dos filas de abajo ("El jornal
  // por hora más bajo que pagamos" contra "Básico de Ayudante — el piso del convenio", y el margen
  // entre las dos). El título nombra el control; el resultado lo da el número.
  push([seccion('2.3', 'Control de piso · CCT 76/75 Zona A')])
  // EL CONVENIO VA CON SU VIGENCIA, NO FLOTANDO SEIS COLUMNAS A LA DERECHA. "CCT 76/75, Zona A (San
  // Juan)" vivía en la columna G, sin nada alrededor: un rótulo suelto en el medio de la grilla que
  // el ojo no puede asociar a nada. Es la ficha de la escala que esta línea está declarando vigente,
  // así que va en la misma línea. La A derrama sobre las celdas vacías de su derecha.
  // "(San Juan)" se cayó del rótulo: Zona A ES San Juan en el CCT 76/75, y la empresa no opera en otra
  // zona. La ficha completa vive en lib/uocra-paritaria.mjs, que es quien la verifica.
  // LA FICHA DE LA ESCALA SE MUDÓ AL RÓTULO DEL BLOQUE (09/09/2026). Era una fila entera para decir
  // «CCT 76/75 · Zona A»: un renglón con un dato y ninguna cifra, que es exactamente lo que hace que
  // una pestaña se lea larga. Cabe en el título de la sección, que es donde se lee sin buscarlo.
  // ═══ EL CONTROL DE LA RÉPLICA CONTRA LA ESCALA VERIFICADA (07/08) ═══
  //
  // Un control nunca se valida contra la misma información que produce. Todo lo de este bloque sale de
  // `_UOCRA_RAW`, que llega por IMPORTHTML: si el sitio cambia de forma, la réplica devuelve una tabla
  // vieja —o la de otra zona— y se ve exactamente igual de sana. La escala verificada a mano contra dos
  // fuentes es lo único que puede notarlo. Habla SÓLO cuando discrepa: un control que repite "todo
  // bien" en cada corrida se vuelve invisible al mes.
  // ═══ UN AVISO QUE CRECE CON LA LISTA NO TIENE TOPE (13/08) ═══
  //
  // Era el prefijo + TODOS los desvíos concatenados, y cada desvío mide medio renglón ("Oficial
  // Especializado: réplica 6800 ≠ verificado 7420"): con las cinco categorías pasaba de 300 caracteres,
  // justo en el único caso en que el aviso importa. La celda dice que el control se encendió y CUÁNTO
  // ABARCA; el detalle va al log. La acción es la misma con uno o con cinco —abrir la réplica— y lo
  // que el número cambia es la gravedad. `contrastarEscala` sigue midiendo el desvío completo.
  // EL CONTROL SIGUE MIDIENDO Y SIGUE GRITANDO — POR EL LOG, NO POR UNA CELDA (09/09/2026). Un
  // control nunca se valida contra la misma información que produce, y por eso `contrastarEscala`
  // se queda: lo que se va es su renglón «▲ Réplica ≠ escala verificada en N categoría(s)» arriba de
  // un cuadro de números. Quien puede reparar el IMPORTHTML lee la corrida; el dueño lee el cuadro.
  for (const d of contrastarEscala(escalones)) console.warn(`  ⚠ escala verificada el ${VERIFICADA_EL}: ${d}`)
  // El jornal más bajo sale del bloque BASE (la última quincena cerrada), no del último bloque del
  // espejo: una quincena a medio cargar puede no tener todavía a toda la cuadrilla.
  const rangoW = bloqueBase ? `'${ESPEJO}'!$W$${bloqueBase.inicio}:$W$${bloqueBase.fin}` : null
  const fMin = push([
    rotuloTotal('Jornal por hora más bajo'),
    rangoW ? `=IFERROR(MINIFS(${rangoW};${rangoW};">0");"")` : '',
  ])
  /** La celda del básico de una categoría en un escalón ya resuelto. Vacío si ese mes no existe. */
  const basicoDe = (e, cat) => {
    const f = e?.categorias?.[cat]?.fila
    return f ? `=IFERROR(INDEX('${UOCRA_HOJA}'!$${UOCRA_COL.basico}$1:$${UOCRA_COL.basico};${f});"")` : ''
  }
  const fPiso = push([`Piso del convenio · ${CATEGORIA_ANCLA}`, basicoDe(escalonVigente, CATEGORIA_ANCLA)])
  const fMargen = push(['Margen sobre el piso', `=IF(N(B${fPiso})=0;"";B${fMin}/B${fPiso}-1)`])
  // ═══ EL ESCALÓN QUE VIENE — Y SI NO ESTÁ, SE DICE ═══
  //
  // NUNCA UN NÚMERO DE OTRO AÑO. Si el mes próximo no tiene acuerdo publicado, estas dos filas quedan
  // vacías y el rótulo lo explica. Una celda vacía con su explicación es honesta; un $3.687 de 2025
  // presentado como "el escalón que viene" es el defecto que costó esta reconstrucción.
  const proximo = escalonDe(escalones, periodoSiguiente(hoy))
  // EL TEXTO VA EN LA COLUMNA A, NO EN UNA DEL MEDIO. La última columna de esta pestaña es "Pagado
  // el" —la del dueño— así que la salida habitual del patrón (mandar la glosa al final) acá está
  // cerrada. La A es ancha, derrama sobre celdas vacías y el auditor la exceptúa a propósito.
  // LA RAMA SIN ACUERDO PASÓ DE 190 CARACTERES A 45 (13/08). Cuál es el último acuerdo lo dice la
  // línea de vigencia dos filas arriba (`fVig`), y que los meses siguientes son proyección lo dice el
  // cuadro 4.2 en su columna «Estado». Lo único propio de esta línea es que NO HAY escalón que
  // mostrar — y el ⚠ ya avisa que hay que mirarla.
  // SIN ACUERDO PUBLICADO NO SE EMITE NINGUNA DE LAS TRES FILAS (09/09/2026). Antes se emitía el
  // rótulo con un ⚠ adentro y nada al lado: un renglón que anuncia una ausencia es la prosa que el
  // dueño mandó sacar, y la ausencia ya se ve —el bloque no está—. Que no haya acuerdo lo grita el
  // log de la corrida, que es donde alguien puede ir a buscarlo.
  if (proximo) push([`Escalón que viene · ${proximo.rotulo}${proximo.acuerdo ? ` · ${proximo.acuerdo}` : ''}`])
  // ═══ SIN ACUERDO PUBLICADO NO SE EMITEN LAS DOS FILAS (06/08) ═══
  //
  // Se emitían siempre, y sin acuerdo quedaban las dos vacías: "Básico de Ayudante desde ese mes" y
  // "Margen contra ese piso" con nada al lado, debajo de una línea que ya había explicado por qué. Dos
  // rótulos sin cifra se leen como un cuadro roto, no como una ausencia declarada — y la ausencia ya
  // estaba declarada arriba, en una oración. Un renglón vacío no agrega información: la diluye.
  let fMargenProx = 0
  if (proximo) {
    const fPisoProx = push([`Piso desde ese mes · ${CATEGORIA_ANCLA}`, basicoDe(proximo, CATEGORIA_ANCLA)])
    fMargenProx = push(['Margen contra ese piso', `=IF(N(B${fPisoProx})=0;"";B${fMin}/B${fPisoProx}-1)`])
  }
  // LA ESCALA DEL CONVENIO, TODA EN LA MISMA UNIDAD QUE LO QUE PAGAMOS: $/hora. Antes cada categoría
  // traía además su jornal diario (= básico × 8), y ese 8 era el único número PEGADO de la pestaña:
  // una "Jornada del convenio (horas)" escrita a mano que ninguna otra celda leía y que sólo servía
  // para una columna decorativa. Mezclar $/hora (el control de arriba) con $/día (la columna) en el
  // mismo bloque es exactamente el defecto de unidad que arruina una planilla financiera.
  // ═══ EL SERENO NO ENTRA, Y ESO ES LO QUE ARREGLA (09/09/2026) ═══
  //
  // Cobra por MES, y su básico ($980.858) se publicaba en la misma columna que los $4.950 por hora de
  // un Ayudante, con la glosa «— se paga por mes» al lado para explicar la mezcla. El dueño lo
  // nombró: un importe mensual en una columna de $/hora. Una glosa no arregla un defecto de unidad —
  // lo declara. La categoría existe y su plantel se cuenta en 2.1; lo que no puede es entrar a esta
  // escala, que se lee contra el jornal por hora más bajo de arriba.
  // UN ENCABEZADO DE COLUMNAS, NO UN RÓTULO SUELTO. «Escala del convenio ($/hora)» era una fila con
  // texto en la A y nada al lado: el lector no sabe si es un título, un total o un dato que falta.
  // Como encabezado de dos columnas dice lo mismo y le pone nombre a la cifra de abajo.
  const fEscalaCols = push(['Categoría', '$/hora de convenio'])
  for (const cat of CATEGORIAS.filter((x) => !ES_MENSUAL(x))) {
    push([cat, basicoDe(escalonVigente, cat)])
  }
  blanco()

  // ── Las referencias que no se podían escribir antes de conocer las filas ──
  // ═══ HORAS POR PERSONA Y POR DÍA: MEDIDAS, Y EN UNA VENTANA RECIENTE (06/08) ═══
  //
  // Era `SUM(K)/SUM(L)/AVERAGE(D)` sobre el REGISTRO ENTERO: el promedio del año, con el ausentismo
  // de enero adentro, daba 6,7 h contra una jornada de 9 y con eso se proyectaba el semestre. Ahora
  // es Σ(plata) ÷ Σ($/hora × días) —ponderado, dimensionalmente correcto— sobre las quincenas
  // CERRADAS de los últimos JORNALES_MESES_BASE meses. El parámetro está en Parámetros y se ve.
  const formulaHoras = formulaHorasPorPersona(
    { total: colDe('Total'), sigma: colDe('$/hora'), dias: colDe('Días'), hasta: colDe('Hasta') },
    f0, fLast,
  )
  // LA GLOSA DE LA COLUMNA C SE FUE (09/09/2026). Decía «medido s/ quincenas cerradas · 3 meses»: es
  // la ficha del parámetro, y el parámetro vive en «Parámetros», que es adonde hay que ir igual. Lo
  // único que la celda tiene que decir es el número, y el rótulo de su izquierda ya dice cuál es.
  // ═══ EL PROMEDIO DEL ADELANTO ES DEL AÑO Y SÓLO DE LO PAGADO (13/08) ═══
  //
  // El dueño: *"el adelanto es algo q no se puede proyectar asi como está, se tiene q hacer un calculo
  // promedio del año"*. La ventana era la de las HORAS —tres meses, prestada de `JORNALES_MESES_BASE`—
  // y el adelanto no es un ritmo de trabajo: es una decisión de tesorería. Y entraba la quincena que ya
  // cerró pero todavía no se pagó, con TOTAL cargado y el adelanto a medio entregar, así que el
  // porcentaje se movía solo entre el día que la quincena termina y el día que sale la plata.
  // EL ADELANTO, CON SU PROPIO % PONDERADO Y CON LO QUE ESO PROYECTA A DICIEMBRE (14/08). El % solo no
  // se puede usar: la pregunta del dueño es cuántos billetes hay que adelantar de acá a fin de año, y
  // ese número es el % por el total proyectado de obra. Va en la celda de al lado, que es donde el
  // resto de las glosas de esta sección pone su dato.
  const formulaShare = formulaShareAdelanto(
    { adelanto: colDe('Adelanto'), total: colDe('Total'), hasta: colDe('Hasta'), pagado: colDe('Pagado el') },
    f0, fLast,
  )
  // ═══ LA BAJA NO REGISTRADA SE FUE DE LA PESTAÑA (09/09/2026) ═══
  //
  // `formulaBajaNoRegistrada` publicaba «▲ faltan …» en una celda de la sección del convenio: prosa
  // por fórmula, del tipo que el dueño mandó sacar. La capacidad sigue en `lib/jornales-calendario.mjs`
  // con sus tests; lo que se retira es la celda. Que el plantel del piso no coincida con el de la
  // quincena en curso se ve en la propia grilla, que ahora publica «Personas» en las dos mitades.
  // ═══ CERRADA vs EN CURSO: LO DECIDE UNA FÓRMULA, NO UNA CORRIDA DEL AGENTE ═══
  //
  // El dueño: "la última fila de este cuadro está mal porque considera que la quincena que está en
  // curso ya pasó — ¿eso se actualiza de forma automática y autónoma?". Una quincena está CERRADA
  // cuando su último día ya pasó, y eso se escribe `B <= TODAY()` en la columna "Estado" de cada fila
  // del registro (ver el push de arriba): se recalcula solo cada vez que alguien abre la planilla.
  //
  // OJO: "cerrada" mide la QUINCENA (¿ya terminó de trabajarse?), no el PAGO. El hero de esta pestaña
  // no lo usa —parte por Comprometido / Proyectado / Ya pagado, que es otra pregunta— pero el registro
  // sí, y el cash flow imputa por la fecha de caja. Son tres cortes distintos y los tres importan.
  // HASTA DÓNDE LLEGAN LOS JORNALES: el "Hasta" más nuevo que YA PASÓ **DE UNA QUINCENA CON PLATA
  // CARGADA**. El rango va cerrado a propósito —y no abierto como en las demás pestañas—: abajo del
  // registro están la proyección y la nómina de oficina, que también tienen fechas en la columna B y
  // hablarían de otra cosa. `<=TODAY()` es obligatorio: la planilla escribe los catorce días de la
  // quincena el día que la abre, así que un MAX crudo declararía frescura de una fecha futura.
  //
  // POR QUÉ CONDICIONADO AL TOTAL Y NO UN MAX DE FECHAS (03/08). Una quincena existe en el registro
  // desde que la planilla la abre, mucho antes de que tenga un peso adentro: un MAX sobre la columna
  // "Hasta" declara frescura por un ENCABEZADO VACÍO. Lo que la pestaña muestra es plata, así que la
  // frescura tiene que salir de la plata. Es el patrón que la fila 4 ya usa en vivo, con la letra
  // resuelta por rótulo — que es justamente por qué no se escribe la letra: en la pestaña viva el
  // TOTAL es la K y en el layout anterior de este generador era la J. `colDe` contesta la de HOY.
  // ── EL TITULAR: LA PRÓXIMA QUINCENA QUE HAY QUE PAGAR, Y CÓMO SALE ──
  //
  // LA FILA SE ELIGE POR SU FECHA DE CAJA, no por su posición: la primera con «Se paga el» de hoy en
  // adelante y con plata adentro. Las filas de subtotal no tienen fecha de pago, así que el MINIFS
  // las saltea solo — y por eso el rango puede barrer la grilla entera, lo cerrado y lo proyectado,
  // sin partirse en dos. El día que una quincena cerrada se pague, el titular pasa a la siguiente sin
  // que nadie toque nada.
  // ═══ CADA CIFRA DEL TITULAR CAE BAJO SU PROPIA COLUMNA (09/09/2026) ═══
  //
  // La primera versión las puso en la B y la C, pegadas al rótulo. Se ve mejor y se audita solo si
  // caen donde la grilla las publica: la fecha bajo «Se paga el», el total bajo «Total», el banco
  // bajo «Banco» y el efectivo bajo «Recibo». El ojo baja en vertical y encuentra la misma cifra en
  // la fila de su quincena — y si no coincide, se ve sin hacer una cuenta.
  const iCol = (rotulo) => colDe(rotulo).charCodeAt(0) - 65
  const celdaFecha = `$${colDe('Se paga el')}$${fProxima}`
  const rgFecha = `$${colDe('Se paga el')}$${f0}:$${colDe('Se paga el')}$${pFin}`
  const porFecha = (rotulo) => `SUMIFS($${colDe(rotulo)}$${f0}:$${colDe(rotulo)}$${pFin};${rgFecha};${celdaFecha})`
  filas[fProxima - 1][iCol('Se paga el')] = `=IFERROR(MINIFS(${rgFecha};${rgFecha};">="&TODAY();`
    + `$${colDe('Total')}$${f0}:$${colDe('Total')}$${pFin};">0");"")`
  filas[fProxima - 1][iCol('Total')] = `=IF(N(${celdaFecha})=0;"";${porFecha('Total')})`
  // POR BANCO es lo que se transfiere; EN EFECTIVO es todo lo demás —adelanto más recibo—, que es
  // exactamente lo que hay que sacar en billetes. Las dos salen de las columnas de la grilla, así que
  // suman el total de arriba por construcción y no por disciplina.
  filas[fBanco - 1][iCol('Banco')] = `=IF(N(${celdaFecha})=0;"";${porFecha('Banco')})`
  filas[fEfectivo - 1][iCol('Recibo')] = `=IF(N(${celdaFecha})=0;"";${porFecha('Adelanto')}+${porFecha('Recibo')})`
  // ═══ LOS TRES CANALES DEJARON DE SER TRES FILAS (09/09/2026) ═══
  //
  // Vivían debajo del registro como «· De lo pagado — por banco / en adelantos / contra recibo», con
  // un cuarto renglón que gritaba «▲ faltan $1.259.695 sin canal de pago registrado». Las tres son
  // COLUMNAS de la grilla desde siempre (Banco · Adelanto · Recibo) y ahora la fila de total las suma
  // al lado del TOTAL: si no cierran, se ve restando dos celdas que están una al lado de la otra. Un
  // control que repite la aritmética de la fila de total no agrega evidencia, agrega texto.
  // ── LOS DOS BLOQUES MENSUALES: EL AJUSTE Y EL PROYECTADO ──
  //
  // Se escriben acá y no arriba porque los dos citan el cuadro del escalón (4.2), que desde el 13/08
  // vive DEBAJO de ellos. Una fórmula puede apuntar hacia abajo sin problema; el generador no puede
  // escribir un número de fila que todavía no existe.
  //
  // OFICINA. El factor se mide desde SU mes base —el último COMPLETO— y no desde el mes en curso: la
  // planilla de oficina va atrasada y medir desde otro mes le aplicaría un aumento que no es el suyo.
  //
  // EL AJUSTE SE MUDÓ DE LA G A LA B (14/08) Y LA PROYECCIÓN NO CAMBIÓ DE ARITMÉTICA: sigue siendo
  // `base × factor`, con la misma base y el mismo factor. Es una letra, a propósito — `OFICINA_PROYECTADO`
  // alimenta CAJA y los dos cash flows, y un rediseño de columnas no puede ser la ocasión para
  // cambiar el número que viaja por ahí.
  MESES.forEach((_, i) => {
    const r = o0 + i
    if (cerradoOfi(i)) return
    filas[r - 1][1] = soloSiAjusta(formulaFactorDelMes(`EOMONTH(DATE(${AÑO};${i + 1};1);0)`, esc,
      iBaseOfi === null ? null : `EOMONTH(DATE(${AÑO};${iBaseOfi + 1};1);0)`))
    // Sin un solo mes cerrado no hay de dónde proyectar: la celda queda vacía y la línea de arriba
    // dice por qué. Un número inventado acá viaja por rango con nombre hasta el cash flow.
    if (rBaseOfi === null) { filas[r - 1][7] = VACIO; return }
    // EL PISO, SÓLO HACIA ADELANTE (14/08). Un sueldo nominal no baja: si el escalón de un mes futuro
    // viniera para abajo —ya pasó, es el defecto B3— la proyección publicaría para diciembre menos de
    // lo que se pagó en el último mes cerrado. Hacia ATRÁS no se aplica: un mes anterior al base que
    // la planilla nunca cargó se deflacta, y ahí un factor menor que 1 es lo correcto.
    // La fila lo dice en su «Estado» (`▲ al piso`): un recorte silencioso taparía el defecto que lo
    // hizo falta. La aritmética y el porqué, en lib/oficina-escalon.mjs.
    filas[r - 1][7] = formulaProyectadoOficina({
      celdaBase: `$C$${rBaseOfi}`, celdaFactor: `B${r}`, celdaPagado: `C${r}`,
      conBloque: conBloque(i), conPiso: iBaseOfi !== null && i > iBaseOfi,
    })
  })
  // ═══ DIRECCIÓN: EL ANCLA ES EL MES DEL IMPORTE, NO EL MES DEL CALENDARIO (14/08) ═══
  //
  // El dueño: *"está mal hecha la proyección de aumentos en el grupo de 'dirección' porque no habría
  // aumento reflejado en el mes siguiente"*. El ancla era `EOMONTH(TODAY();0)` —el mes en curso— y el
  // importe base sale de la última carga de Compras, que es el retiro de JULIO pagado el 03–04/08.
  // Anclar en agosto le da factor 1 a agosto: el retiro del mes siguiente al último pagado quedaba sin
  // un solo peso de aumento, y los cuatro meses de atrás arrastraban ese tramo perdido ($888.113 a
  // diciembre). Peor: el ancla CAMINABA con el reloj —el 1° de septiembre se perdía otro tramo— sin
  // que nadie tocara nada. El porqué completo y el ancla nueva, en `expresionMesBaseRetiro`.
  MESES.forEach((_, i) => {
    filas[d0 + i - 1][1] = soloSiAjusta(formulaFactorDelMes(`EOMONTH(DATE(${AÑO};${i + 1};1);0)`, esc, expresionMesBaseRetiro()))
  })

  // ── EL CALENDARIO: LAS TRES COLUMNAS DE POBLACIÓN ──
  //
  // OBREROS sale del motor: la Σ $/hora del plantel ajustada al escalón del mes de esta quincena
  // (cuadro 4.2), por horas medidas y días laborables. La base la decide la FECHA DE PAGO de la fila:
  // lo que sale de la caja este mes va al pactado y lo de después al 100% del convenio.
  //
  // OFICINA y DIRECCIÓN caen en la quincena que las PAGA. La ventana de una fila va de su fecha de
  // caja (inclusive) a la de la fila siguiente (exclusive); la primera no tiene piso y la última no
  // tiene techo, así que el reparto es completo y disjunto por construcción — ningún mes puede quedar
  // afuera ni entrar dos veces. El control de abajo lo prueba contra el total del bloque, que se
  // calcula por el otro camino.
  pendientes.forEach((q, i) => {
    const r = p0 + i
    // LA BASE Y LAS HORAS LAS DECIDE LA MISMA FRONTERA, EN UN SOLO `IF` (ver `expresionMasaDeLaQuincena`):
    //
    //   · lo que se PAGA este mes → Σ pactada × horas MEDIDAS × días L-V. Es la caja comprometida, y
    //     las horas medidas son el pronóstico honesto de lo que se va a trabajar.
    //   · lo que se PROYECTA     → Σ convenio × horas de JORNADA, contadas por día de la semana.
    //
    // El segundo término NO multiplica por una cuenta de días: 9 h de lunes a jueves, 8 el viernes y
    // 4 el sábado no son un promedio, y `expresionHorasDeJornada` ya devuelve las horas del tramo.
    // Valuar la obligación con un promedio por día hábil la dejaba 10% corta, todos los meses.
    const convenio = expresionMasaDeLaQuincena({
      esc,
      celdaDesde: `A${r}`,
      celdaPago: `C${r}`,
      celdaHorasMedidas: RANGO_HORAS_MEDIDAS,
      // El criterio de la semana de obra para el PACTADO sigue viviendo en `expresionDias`, no en un
      // `NETWORKDAYS` suelto: es el mismo lugar que usa el reparto de la demanda.
      exprDias: expresionDias(`A${r}`, `B${r}`),
      // La jornada llega por RANGO CON NOMBRE desde «Parámetros» (ver `expresionHorasDeJornada`), no
      // por celdas de esta pestaña: sus tres cifras se mudaron ahí el 09/09/2026.
      exprHorasJornada: expresionHorasDeJornada({ celdaDesde: `A${r}`, celdaHasta: `B${r}` }),
    })
    // LA DEMANDA DE OBRAS YA NO ENTRA A ESTA CELDA. `formulaProyectadoQuincena` devuelve la
    // expresión del plantel sola desde el 14/08 —el `MAX` contra la demanda hacía que la columna
    // cambiara de naturaleza fila por fila— y el argumento se conserva sólo para que el llamador no
    // tenga que saberlo. Lo que se publica es el plantel actual, con su tarifa y su aumento.
    filas[r - 1][colDe('Total').charCodeAt(0) - 65] = formulaProyectadoQuincena(
      { convenio, celdaPago: `C${r}` },
      demanda?.porQuincena?.get(claveQuincena(q.desde)) ?? null,
    )
    // EL PLANTEL CON EL QUE SE PROYECTÓ, citado del cuadro 2.1 —que vive más abajo y por eso no se
    // podía escribir arriba—. Se cita y no se estampa: el día que entre o salga alguien, las nueve
    // filas se mueven solas.
    filas[r - 1][colDe('Personas').charCodeAt(0) - 65] = `=$B$${fPlantel}`
  })
  // ═══ LAS COLUMNAS «Oficina» Y «Dirección» DEL CALENDARIO SE FUERON, Y CON ELLAS SU CONTROL ═══
  //
  // `formulaVentana` repartía cada mes de los dos bloques mensuales en la quincena que lo pagaba, y
  // `formulaControlCalendario` verificaba que ese reparto fuera completo publicando «✓ oficina y
  // dirección cierran…» todos los días. Sin las columnas no hay reparto que verificar: el control
  // desaparece porque desapareció lo que medía, no porque estorbara.
  //
  // LO QUE SE PIERDE, DICHO: la pestaña ya no contesta «cuánto sale de las TRES nóminas en esta
  // quincena». Cada sub-bloque publica su total y el Cash Flow los suma por rango con nombre, que es
  // donde esa pregunta se contesta una sola vez.
  // ═══ EL CONTROL DE PISO SE FUE CON EL CUADRO QUE MEDÍA (09/09/2026) ═══
  //
  // `formulaControlAumento` comparaba las personas del cuadro de PAGO contra las del cuadro del piso.
  // El cuadro de pago ya no existe, y un control al que le sacan una de sus dos entradas no queda
  // «casi bien»: queda comparando una celda contra sí misma y firmando ✓ pase lo que pase. La
  // capacidad sigue viva en `lib/jornales-piso-uocra.mjs` con sus tests; lo que se retira es la celda.
  // El dueño lo pidió por su efecto, no por su intención: *«un control en −20,6 % permanente no es un
  // control»*, y éste era del mismo tipo — publicaba «▲ la proyección se mide con 007 h y la jornada
  // es 008 h» todos los días.

  // ══ 6 · EL COSTO DE DESVINCULAR — SE MUDÓ A LA PESTAÑA «Nómina» (27/08/2026) ══
  //
  // Estaba acá por una razón que era buena: la pregunta se hace mirando el plantel. Desde hoy el
  // plantel se mira en «Nómina», que además cruza el legajo de Drive, el régimen probado con el
  // papel y el reparto entre lo que cubre el recibo y lo que hay que completar en efectivo. El
  // dueño lo pidió en una línea: *"no has quitado lo referente a desvinculación de la pestaña
  // jornales por quincena, dado q ya se considera en pestaña nómina"*.
  //
  // El CÁLCULO no se movió: sigue en `lib/desvinculacion-22250.mjs` y `lib/desvinculacion-plantel.mjs`,
  // y es el mismo que consume `scripts/nomina-pestana.mjs`. Lo que se retiró es el CUADRO, para que
  // no haya dos lugares publicando el mismo número — que es como empiezan las dos verdades.
  //
  // `bloqueDesvinculacion` queda en su archivo, con sus tests: retirar un cuadro no es borrar la
  // capacidad de dibujarlo, y el día que el dueño lo quiera de vuelta acá es pasarle `desvinculacion`.
  //
  // El básico sale de la réplica viva del convenio y sólo cae en la escala verificada del repo si la
  // réplica no trajo esa categoría: una constante del código no puede ganarle a un acuerdo posterior,
  // pero tampoco puede dejar el cuadro mudo cuando el IMPORTHTML se cayó.
  let desv = null
  // Las celdas de la sección 6 que RINDEN prosa por fórmula: se juntan acá y viajan con el resto.
  const prosaDelBloque6 = []
  if (desvinculacion) {
    const basicoDe = (codigo) => {
      const cat = convenioDe(codigo)
      if (!cat) return null
      const basico = escalonVigente?.categorias?.[cat]?.basico ?? ESCALA_VERIFICADA[cat] ?? 0
      return basico > 0 ? { categoria: cat, basico } : null
    }
    blanco()
    desv = bloqueDesvinculacion({ ...desvinculacion, hoy, basicoDe })
    const base = filas.length
    for (const f of desv.filas) push(f)
    // Las filas de fecha, ya en coordenadas de la pestaña, para que `requestsDeFormato` les pida DATE.
    desv.rangos = {
      activos: desv.fechas.activos.map((r) => r + base),
      desafectados: desv.fechas.desafectados.map((r) => r + base),
    }
    for (let f = desv.prosa.fila0 + base; f <= desv.prosa.filaFin + base; f++) {
      prosaDelBloque6.push({ fila: f, col: desv.prosa.col })
    }
  }

  return {
    filas,
    // La sección 6, para el formato y para que un test pueda afirmar sus totales sin releer la grilla.
    desvinculacion: desv,
    fechas: [
      ...pendientes.map((_, i) => p0 + i), ...bloques.map((_, i) => f0 + i),
    ],
    // Horas con un decimal · cantidades enteras · el único porcentaje de la pestaña.
    // La jornada va con las horas medidas: dos cifras de la misma naturaleza dibujadas distinto se
    // leen como dos magnitudes distintas, que es exactamente lo que NO son.
    cantidades: [],
    // Prosa que RINDE una fórmula: el pase por contenido la saltea (empieza con '='). Se declara acá
    // y el formato la pinta TEXTO. col 0-based.
    // …y el CANARIO del plantel (última fila del bloque 4.1, col H): rinde "✓ el bloque del
    // espejo…" por fórmula y sin declararlo la piel lo pintaba de plata (auditor, 06/08).
    celdasDeProsaFormula: [
      // El CANARIO del plantel (última fila del bloque 2.1, col H): rinde texto por fórmula y sin
      // declararlo la piel lo pintaba de plata (auditor, 06/08). Es la única que queda: las glosas de
      // las dos mediciones, las tres de canal y los dos controles se fueron con sus cuadros.
      { fila: plantel.fTotal, col: 7 },
      ...prosaDelBloque6,
    ],
    enteros: [plantel.fTotal],
    // El bloque del motor, para el formato: personas enteras, factores con cuatro decimales.
    plantel, esc,
    // POR NOMBRE, NO POR OFFSET. Decía `[fMin + 2]`: al agregar el escalón del mes que viene, el margen
    // nuevo quedó fuera de la lista y un -16,7% se dibujó como "-$0". Es el mismo defecto que ya rompió
    // tres enlaces en este libro — anclar en la posición.
    // `filter(Boolean)`: sin acuerdo publicado, el margen contra el escalón que viene no existe como
    // fila. Un 0 acá pediría formato para la fila 0 y el lote entero de formato se cae.
    ratios: [fMargen, fMargenProx].filter(Boolean),
    nProy: pendientes.length,
    // El adelanto ponderado (obra): una FRACCIÓN, no plata.
    // LAS DOS MEDICIONES, CON LA REFERENCIA YA RESUELTA AL REGISTRO DE ESTA CORRIDA. Viajan para que
    // `main()` las escriba en «Parámetros»: son del OS, no del dueño, y se reescriben en cada pasada.
    medidos: [
      { rango: RANGO_HORAS_MEDIDAS, rotulo: 'Horas por persona y día (medidas)', formula: conPestaña(formulaHoras), nota: 'Σ del total pagado ÷ Σ(Σ $/hora × días) sobre las quincenas CERRADAS de la ventana. Es el ritmo real de trabajo con el que se proyecta la nómina de obra.' },
      { rango: RANGO_SHARE_ADELANTO, rotulo: 'Adelanto sobre el total (ponderado)', formula: conPestaña(formulaShare), nota: 'Qué proporción del total de una quincena se entrega como adelanto, medida sobre las quincenas ya pagadas del año. Decide CUÁNDO sale la plata, no por qué canal.' },
    ],
    // Las filas de oficina (cargadas + proyectadas) para que reciban el mismo formato que las de
    // obra: sin esto la columna "Hasta" mostraba $46.037 —el número de serie de la fecha con formato
    // de moneda— y el ajuste por inflación salía como "$1".
    o0, oFin,
    // El bloque de Dirección: la tabla de personas (dp0..dpFin) y la grilla de meses (d0..dFin).
    // Las dos se pasan porque reciben formatos distintos — plata en las dos, pero fecha sólo en una.
    dp0, dpFin, d0, dFin, fTotalMensual,
    fMin,
    fTotalProy,
    fTotalReal,
    // Las tres filas del titular, para que el formato les dé el tipo de lo que son.
    fProxima, fBanco, fEfectivo,
    f0,
    // LA ÚLTIMA FILA DEL REGISTRO. Se expone para que un test pueda afirmar que los rangos con nombre
    // LLEGAN hasta ella: un rango que no crece con el registro señala a enero para siempre, y lo que
    // lo consume devuelve un número plausible sin una sola celda en rojo.
    fLast,
    p0,
    // LOS ENCABEZADOS DE TABLA Y LA NOTA DE VIGENCIA SON TEXTO, NO PLATA. El formato de moneda cubre
    // toda la grilla de la B a la L, y donde el hero deja un número más arriba en la misma columna, el
    // detector deja de leer "Hasta"/"Personas"/"Banco" como encabezado y los marca como texto en una
    // celda de moneda (12 casos). Se les devuelve el formato de texto DESPUÉS de la moneda.
    // `p0 - 1` SE FUE (09/09/2026): con la grilla unificada esa fila es el SUBTOTAL de lo pagado, no
    // un encabezado. Pedirle formato de encabezado le daba TEXT a todo el ancho —incluida la columna
    // «Pagado el»— y esa columna tiene una sola regla, la de fecha, para que los seriales del dueño
    // no se dibujen «46160» pelados. La proyección comparte el encabezado del registro: es una tabla.
    encabezados: [o0 - 1, f0 - 1, dp0 - 1, d0 - 1, plantel.fPrimera - 1, esc.f0 - 1, fEscalaCols],
  }
}

/**
 * NÚCLEO PURO: una fecha de la pestaña, normalizada para poder compararla.
 *
 * Lo que llega es lo que Google RENDERIZA («31/07/2026», a veces «31/7/2026», a veces el serial), no
 * lo que la celda tiene adentro. Compararlas como cadenas es cómo dos fechas iguales dejan de serlo.
 */
export function claveDeFecha(v) {
  const s = String(v ?? '').trim()
  if (!s) return null
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    const [, d, mes, a] = m
    const anio = a.length === 2 ? `20${a}` : a
    return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  // ═══ EL SERIAL, TAMBIÉN CUANDO ESTÁ DIBUJADO COMO PLATA (09/09/2026) ═══
  //
  // Medido en la copia del Sheet: la columna «Hasta» de las dos últimas quincenas está dibujada con
  // formato de MONEDA y la API devuelve «$46.265». Es una fecha —el 31/08/2026— con el formato de
  // otro layout encima, y es exactamente uno de los defectos que hay que arreglar. Pero el
  // emparejamiento de las fechas del dueño NO puede depender de que el formato esté bien: si no lo
  // lee, esas dos quincenas se quedan sin su pago y el generador frena por un defecto de dibujo.
  // Se limpian el «$» y los puntos de miles, y sólo si lo que queda es un serial creíble.
  const crudo = s.replace(/[$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(crudo)
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    const d = new Date(Math.round((n - 25569) * 86400000))
    return d.toISOString().slice(0, 10)
  }
  return null
}

/**
 * NÚCLEO PURO: LAS FECHAS QUE EL DUEÑO ESCRIBIÓ EN «Pagado el», EMPAREJADAS POR SU QUINCENA.
 *
 * ═══ EL DEFECTO QUE ESTO ARREGLA (09/09/2026), MEDIDO EN EL DRY ═══
 *
 * La copia anterior emparejaba por POSICIÓN desde la cabecera del registro: la k-ésima quincena de
 * antes iba a la k-ésima de ahora. Funciona mientras el registro sólo crezca por el final — y dejó de
 * ser cierto el día que la grilla se acortó: las fechas se copiaron a las filas nuevas Y SIGUIERON
 * VIVAS en las viejas, ahora fuera del footprint del generador, porque la cola las protegía como
 * «columna ajena». Dieciocho fechas duplicadas, y la mitad huérfanas debajo de la grilla: el auditor
 * las marcó como filas sin concepto y CAJA podía leer una fecha que ya no pertenece a ninguna
 * quincena.
 *
 * LA CLAVE ES LA QUINCENA, NO LA FILA. Cada fecha viaja con el «Hasta» de SU renglón —la fecha de
 * cierre, que es lo único que identifica a una quincena y no se mueve cuando el layout cambia—. Con
 * eso la copia es idempotente: se puede correr sobre cualquier layout anterior y cada fecha vuelve a
 * caer en la misma quincena.
 *
 * LO QUE NO SE PUEDE EMPAREJAR NO SE BORRA: sale en `sinClave`, y el llamador se NIEGA a escribir. Es
 * la única forma de limpiar las filas viejas sin arriesgar una fecha suya — y esta columna ya se
 * borró tres veces.
 *
 * @param {any[][]} previo la pestaña tal como está, leída con render de VALORES
 * @param {{fila:number, col:number}} cab la cabecera del registro viejo (`cabeceraDelRegistro`)
 * @param {number[]} [colsClave] columnas donde buscar la fecha de cierre de la fila (B, y si no, A)
 * @returns {{porClave:Map<string,any>, sinClave:{fila:number,valor:any}[],
 *            copias:{fila:number,valor:any}[], noEsFecha:{fila:number,valor:any}[], total:number}}
 */
export function recuperarPagadoEl(previo, cab, colsClave = [1, 0]) {
  const porClave = new Map()
  const huerfanas = []
  const noEsFecha = []
  let total = 0
  if (!cab) return { porClave, sinClave: [], huerfanas, noEsFecha, total }
  for (let i = 0; i < (previo ?? []).length; i++) {
    if (i === cab.fila) continue // el propio encabezado «Pagado el»
    const v = previo[i]?.[cab.col]
    if (v === undefined || v === null || String(v).trim() === '') continue
    // ═══ SÓLO CUENTA LO QUE ES UNA FECHA, Y ESO NO ES UN DETALLE (09/09/2026) ═══
    //
    // La primera versión tomaba cualquier celda con un dígito adentro. En la pestaña viva la columna
    // «Estado» rinde frases como «pagada el 18/5» y un layout desplazado las deja en la columna de al
    // lado: treinta y una celdas «con dígitos» que no son fechas de nadie. El generador se negó a
    // escribir por su propia guarda, con razón formal y motivo falso.
    //
    // «Pagado el» ES una columna de fechas. Lo que no se puede leer como fecha no es una marca del
    // dueño: es residuo del generador, se declara y se limpia. Lo que SÍ es fecha y no se puede
    // atribuir sigue frenando la corrida — ésa es la guarda que importa.
    if (claveDeFecha(v) === null) { noEsFecha.push({ fila: i + 1, valor: v }); continue }
    total++
    // La clave puede salir de «Hasta» o de «Desde»: un layout viejo pudo tener la fecha de cierre en
    // otra columna, y con las dos se cubre el corrimiento sin adivinar.
    const clave = colsClave.map((c) => claveDeFecha(previo[i]?.[c])).find(Boolean) ?? null
    if (!clave) { huerfanas.push({ fila: i + 1, valor: v }); continue }
    // Una clave repetida con dos fechas distintas es un layout duplicado a medio limpiar: se conserva
    // la PRIMERA (la del registro de arriba) y la otra se declara para que el generador se niegue.
    if (porClave.has(clave) && claveDeFecha(porClave.get(clave)) !== claveDeFecha(v)) {
      huerfanas.push({ fila: i + 1, valor: v })
      continue
    }
    if (!porClave.has(clave)) porClave.set(clave, v)
  }
  // ═══ UNA HUÉRFANA QUE YA ESTÁ RECUPERADA NO FRENA LA CORRIDA (09/09/2026) ═══
  //
  // Medido en la copia: de las cuatro fechas sin quincena, dos eran COPIAS —el mismo «18/05/2026» de
  // una fila de glosa y el mismo «01/09/2026» en la fila de total— de fechas que sí se recuperan por
  // su cierre. Frenar por ellas sería negarse a limpiar el desorden que este mismo rediseño existe
  // para limpiar; y limpiarlas sin mirar sería borrar a ciegas. La regla es simple y no arriesga
  // nada: si su valor ya está atribuido a una quincena, es una copia y se va. Si no, se declara y el
  // generador NO escribe — ésa es la fecha que nadie puede reponer.
  const ya = new Set([...porClave.values()].map((v) => claveDeFecha(v)))
  const sinClave = huerfanas.filter((x) => !ya.has(claveDeFecha(x.valor)))
  const copias = huerfanas.filter((x) => ya.has(claveDeFecha(x.valor)))
  return { porClave, sinClave, copias, noEsFecha, total }
}

/**
 * NÚCLEO PURO: dónde está la cabecera del registro y en qué columna tiene «Pagado el».
 *
 * ES EL ANCLA DE LAS FECHAS DEL DUEÑO, y por eso reconoce la cabecera por lo que SIGNIFICA y no por
 * dónde está. `ROTULOS_PRIMERA_COL` incluye el rótulo de HOY y el de AYER: el rediseño del 09/09/2026
 * renombró «Quincena» a «Desde» y corrió «Pagado el» de la N a la M, y un ancla clavada a la última
 * columna no habría reconocido la pestaña que estaba en Drive — sus catorce fechas se habrían
 * repartido cada una en la quincena de otra.
 *
 * @param {any[][]} filas la grilla, como la devuelve la API o como la arma el generador
 * @returns {{fila:number, col:number}|null} índices 0-based, o null si no hay cabecera reconocible
 */
export function cabeceraDelRegistro(filas) {
  const ROTULOS_PRIMERA_COL = [REGISTRO_COLS[0], 'Quincena']
  for (const [i, f] of (filas ?? []).entries()) {
    if (!ROTULOS_PRIMERA_COL.includes(String(f?.[0] ?? '').trim())) continue
    const col = (f ?? []).findIndex((c) => String(c ?? '').trim() === 'Pagado el')
    if (col >= 0) return { fila: i, col }
  }
  return null
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // ── EL ESPEJO ES LA FUENTE. Si vino vacío no se escribe: un cuadro en cero es peor que uno viejo.
  const espejo = await google.readSheetValues(ID, `${ESPEJO}!A1:AC990`)
  const bloques = detectarQuincenas(espejo ?? [])
  if (!bloques.length) { console.error(`no encontré ninguna quincena en ${ESPEJO}: corré primero espejar-jornales.mjs`); process.exit(1) }

  const hoy = new Date()
  const ult = bloques[bloques.length - 1]
  const ultimoDia = ultimoDiaCargado(espejo[ult.filaFecha - 1] ?? [])
  // HASTA QUÉ DÍA HAY HORAS DE VERDAD. La quincena en curso declara sus catorce fechas desde el día
  // que se abre, así que "el último día del encabezado" no dice nada sobre cuánto está cargado.
  const conHoras = ultimoDiaConHoras(espejo, ult)
  // ═══ LA PROYECCIÓN ARRANCA DONDE TERMINAN LAS HORAS, NO DONDE TERMINA EL ENCABEZADO (06/08) ═══
  //
  // Defecto A8 de la auditoría: el mes de transición se rompía todos los meses. Arrancando en
  // `ultimoDiaCargado + 1` —el último día del ENCABEZADO, que la planilla escribe entero el día que
  // abre el bloque— la quincena en curso quedaba entera del lado real (con un día de horas y
  // $262.800) y agosto proyectaba $4,5M contra $10,4M de julio. Arrancando en `conHoras + 1`, la
  // quincena en curso queda partida: lo cargado es real y los días que faltan se proyectan. El mes
  // cierra, y cierra solo, sin que nadie corrija nada.
  const ultimoCubierto = conHoras ?? ultimoDia
  const desde = ultimoCubierto ? new Date(ultimoCubierto.getTime() + 86400000) : null
  const pendientes = quincenasPendientes(desde)
  const cargaAlDia = conHoras ? fecha(conHoras).slice(0, 5) : null
  console.log(`obra: ${bloques.length} quincena(s) · último día del encabezado ${ultimoDia ? fecha(ultimoDia) : '—'} · con horas cargadas hasta ${cargaAlDia ?? '—'} · ${pendientes.length} por proyectar`)

  // ── EL MOTOR: EL PLANTEL VIGENTE Y LA ESCALA DEL CONVENIO ──
  //
  // La ÚLTIMA CERRADA sigue mandando en lo que depende de horas (el ritmo medido, el mes ancla del
  // factor): la quincena en curso está a medio cargar y basar un semestre en un bloque con un día de
  // horas es el defecto A2. Pero QUIÉNES SON y en qué categoría están no depende de las horas —esas
  // tres columnas están completas desde que la planilla abre el bloque— y el piso del convenio se le
  // debe a la gente que trabaja HOY. El porqué medido, en `bloqueDelPlantel`.
  const cerradaBase = ultimaQuincenaCerrada(bloques, (b) => ultimoDiaCargado(espejo[b.filaFecha - 1] ?? []), hoy)
  const piso = bloqueDelPlantel({
    bloques, cerrada: cerradaBase?.bloque ?? null, personasDe: (b) => personasDelBloque(espejo, b),
  })
  const bloqueBase = piso.bloque ?? cerradaBase?.bloque ?? ult
  const categorias = categoriasDelBloque(espejo, bloqueBase)
  const personasBase = personasDelBloque(espejo, bloqueBase)
  const nCerrada = cerradaBase ? personasDelBloque(espejo, cerradaBase.bloque) : 0
  console.log(`plantel del piso: ${piso.origen ?? '—'} · filas ${bloqueBase.inicio}-${bloqueBase.fin} · ${personasBase} persona(s) · categorías ${categorias.join(', ') || '—'}`)
  // LA DIFERENCIA CONTRA LA CERRADA ES EL AGUJERO QUE ESTO CIERRA, Y SE IMPRIME AUNQUE SEA 0: un log
  // que sólo habla cuando hay novedad no distingue "no hubo altas" de "no se midió".
  console.log(`  · última quincena cerrada al ${cerradaBase ? fecha(cerradaBase.hasta) : '—'}: ${nCerrada} persona(s)`
    + ` · el piso se proyectaba sobre ${nCerrada} y la nómina tiene ${personasBase}`)
  // EL LÍMITE DE LA JORNADA VA EN EL LOG Y NO EN UNA CELDA DEL MEDIO: en la pestaña entran 45
  // caracteres sin desparramar la fila, y este texto son 120. La celda dice la versión corta; acá,
  // donde el que corre la corrida sí lo lee, va entero.
  console.log(`  · jornada del piso: ${HORAS_LUNES_A_JUEVES} h L-J · ${HORAS_VIERNES} h V · `
    + `${HORAS_SABADO_SUPUESTO} h S = ${HORAS_SEMANA_CON_SABADO} h/semana (${HORAS_SEMANA_DECLARADA} sin sábado) — ${GAP_JORNADA}`)

  const rawUocra = await google.readSheetValues(ID, `${UOCRA_HOJA}!A1:K300`).catch(() => [])
  const { escalones, problemas } = parsearAcuerdos(rawUocra ?? [])
  for (const p of problemas.slice(0, 5)) console.warn(`  ⚠ ${UOCRA_HOJA}: ${p}`)
  const est = estadoReplica(escalones, hoy)
  console.log(`convenio: ${escalones.length} escalón(es) parseado(s) · estado "${est.estado}"${est.ultimoPeriodo ? ` · último ${est.ultimoPeriodo}` : ''}`)
  // EL DRIVER DE LAS TRES PROYECCIONES, DICHO EN LA CORRIDA. Si un día sale "0,00%" o un tramo que no
  // se parece a ninguna paritaria, se ve acá antes de que llegue a la pestaña.
  const tramoUlt = est.ultimoPeriodo ? tramoDe(est.ultimoPeriodo, escalones) : null
  console.log(`paritaria: tramo del último mes publicado ${tramoUlt ? `${(tramoUlt.pct * 100).toFixed(2)}% (${tramoUlt.origen})` : '—'} · acuerdo hasta ${VIGENCIA_HASTA}`)
  for (const d of contrastarEscala(escalones)) console.warn(`  ⚠ escala verificada el ${VERIFICADA_EL}: ${d}`)
  // ═══ EL ESCALÓN QUE RIGE, NO EL QUE COINCIDE CON EL MES (07/08) ═══
  //
  // Acá decía `escalonDe(escalones, mes en curso)`: igualdad exacta de período. El acuerdo vigente
  // termina el 31/08 y la réplica no publica septiembre, así que el 01/09 —sin que nadie tocara nada—
  // esto devolvía null, la base de la proyección volvía sola del convenio al jornal PACTADO (−12,14%
  // sobre la masa) y la nota de Cargas Sociales seguía declarando el 100% del convenio. Una escala de
  // convenio rige hasta que otra la reemplaza: el porqué, en `escalonVigenteEn`.
  const escalonVigente = escalonVigenteEn(escalones, hoy)
  // LA BASE AL 100% DEL CONVENIO, DICHA EN LA CORRIDA. Este número NO es el que se escribe —la pestaña
  // lo calcula por fórmula viva—: es el mismo cálculo por otro camino. Un producto escalar de
  // referencias de celdas se puede escribir mal de mil maneras y ninguna da error; tener el número
  // esperado en el log es lo único que permite notarlo antes de que llegue al Sheet.
  // ═══ EL CONTROL MIRA LA MISMA ENTRADA QUE LA PESTAÑA (14/08) ═══
  //
  // Hasta hoy este cálculo ignoraba la columna «Convenio» del bloque 4.1 y lo declaraba como límite.
  // Con eso, el día que esa columna quedó con basura de un layout viejo —"46237", "Se paga el"— la
  // pestaña publicó una Σ vacía y esta línea siguió imprimiendo $97.772: el control decía que estaba
  // todo bien mientras la proyección se quedaba sin piso de convenio. Ahora se lee esa columna y se
  // aplica LA MISMA regla que la fórmula (lib/jornales-piso-uocra.mjs).
  // POR RÓTULO, NO POR OFFSET: la fila de cada categoría se busca por su código en la columna A, que es
  // lo que el bloque escribe. Contar filas desde el título es lo que ya rompió tres enlaces acá.
  const colAE = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:E400`).catch(() => [])
  // Y LA BÚSQUEDA NORMALIZA IGUAL QUE LA CLAVE QUE BUSCA. `cat` viene de `claveDeCategoria`; el rótulo
  // de la columna A lo escribió una corrida ANTERIOR, y las corridas viejas dejaban ahí la clave a
  // medio normalizar (`"OF  M"`). Con `.trim()` de este lado ese rótulo no matchea, `escrito` queda
  // vacío y la columna «Convenio» del dueño se ignora EN EL CONTROL mientras la fórmula sí la
  // respeta: el control terminaría contestando una pregunta distinta de la que publica la pestaña.
  const escritoPorCodigo = Object.fromEntries(categorias.map((cat) => {
    const f = (colAE ?? []).find((x) => claveDeCategoria(x?.[0]) === cat)
    return [cat, f ? claveDeCategoria(f[4]) : '']
  }))
  const sigmaConv = sigmaConAumentoDelPlantel(espejo, bloqueBase, escalonVigente, undefined, escritoPorCodigo)
  for (const d of sigmaConv.descartados) {
    console.warn(`  ${ALERTA} «Convenio» de ${d.codigo} dice "${d.escrito}" y la escala no lo reconoce:`
      + ` uso ${d.usada ?? 'ninguna equivalencia'} — es basura de un layout viejo, no una categoría`)
  }
  const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`
  // EL LOG PUBLICA LAS TRES CIFRAS, NO EL TOTAL SOLO. `hoy` es un hecho de la planilla, `aumento` es
  // la decisión, y su suma es lo que proyecta la pestaña: con el total solo, un aumento mal calculado
  // se esconde adentro de un número grande y plausible.
  console.log(`con aumento: Σ $/hora ${pesos(sigmaConv.total)} = hoy ${pesos(sigmaConv.hoy)}`
    + ` + aumento ${pesos(sigmaConv.aumento)} sobre ${sigmaConv.personas} persona(s)`
    + ` · ${sigmaConv.porCategoria.map((c) => `${c.personas}×${c.convenio ?? '(sin escala)'} +${pesos(c.aumentoHora ?? 0)}/h`).join(' · ') || 'sin escala'}`
    + (sigmaConv.sinEscala.length ? ` · ${ALERTA} SIN AUMENTO: ${sigmaConv.sinEscala.join(', ')}` : ''))
  // Y LA FALTA LABORAL, SI LA HAY, SE DICE APARTE. El cuadro publica la decisión (aditiva); que a
  // alguien el aumento no le alcance para llegar al mínimo legal es otra cosa y no se compensa sola.
  for (const b of sigmaConv.bajoConvenio) {
    console.warn(`  ${ALERTA} ${b.codigo}: con el aumento queda en ${pesos(b.tarifa)}/h y el básico de convenio es ${pesos(b.piso)}/h`)
  }

  // ── LA DEMANDA DE LAS OBRAS VENDIDAS: el otro lado del MAX de 1.3 (07/08) ──
  // Si lib/obras-datos.mjs no está en esta rama, la fuente avisa y devuelve 0: la pestaña queda igual.
  const demanda = await demandaParaJornales({ hoy, escalon: escalonVigente, escalones })
  // ═══ LA DEMANDA NO ENTRA EN LA QUINCENA QUE SE PAGA ESTE MES (07/09/2026) ═══
  //
  // El MAX contra la demanda de obras volvió por orden del dueño, pero la orden del 07/08 sigue en
  // pie: la caja comprometida —lo que sale de acá a fin de mes— es lo que el plantel cobra, no una
  // hipótesis de planificación. La frontera se decide ACÁ, en JavaScript y con el mismo gemelo que
  // usa la fórmula (`quincenaConAumento`), para que la celda siga teniendo UNA sola frontera adentro:
  // una quincena que cierra dentro del mes en curso se paga dentro del mes y no recibe demanda. La
  // que cierra el último día y se paga el 1° del mes siguiente queda también afuera: es el lado
  // conservador del corte, y el que no infla la disponibilidad libre.
  for (const [clave, q] of demanda.porQuincena) {
    if (!quincenaConAumento(q.hasta instanceof Date ? q.hasta : new Date(q.hasta), hoy)) demanda.porQuincena.delete(clave)
  }
  if (demanda.nObras) console.log(`demanda de obras: ${demanda.nObras} obra(s) · ${demanda.porQuincena.size} quincena(s) con demanda valuada`
    + (demanda.sinFechas.length ? ` · ${ALERTA} SIN FECHAS (quedan afuera): ${demanda.sinFechas.map((x) => x.clave).join(', ')}` : ''))

  // ── LA OTRA MITAD DE LA NÓMINA ──
  const espejoOfi = await google.readSheetValues(ID, `${ESPEJO_OFI}!A1:AA990`)
  // OFICINA SE COBRA POR MES, NO POR QUINCENA. La planilla la lleva en bloques con forma de quincena
  // —a veces dos por mes—, pero el sueldo es mensual: presentarla quincena por quincena mostraba
  // veinticuatro filas de algo que se decide doce veces al año. Cada bloque se etiqueta con su mes y
  // el cuadro agrupa por ahí.
  // Sus fechas arrancan en la columna E (índice 4), no en la F como las de obra: mismo espíritu,
  // otro layout, y asumirlo dejaría la fila apuntando a una celda vacía.
  const bloquesOfi = detectarQuincenas(espejoOfi ?? []).map((b) => {
    const d = ultimoDiaCargado((espejoOfi[b.filaFecha - 1] ?? []).slice(4))
    return { ...b, mes: d ? d.getMonth() + 1 : null, hasta: d }
  }).filter((b) => b.mes)
  const ultimoDiaOfi = bloquesOfi.length ? bloquesOfi[bloquesOfi.length - 1].hasta : null
  const mesesCargados = new Set(bloquesOfi.map((b) => b.mes))
  console.log(`oficina: ${mesesCargados.size} mes(es) cargado(s) · último día ${ultimoDiaOfi ? fecha(ultimoDiaOfi) : '—'} · ${12 - mesesCargados.size} mes(es) por proyectar`)
  if (ultimoDia && ultimoDiaOfi && ultimoDiaOfi < ultimoDia) {
    const dias = Math.round((ultimoDia - ultimoDiaOfi) / 86400000)
    console.log(`  ⚠ la planilla de oficina va ${dias} día(s) detrás de la de obra: esas quincenas entran como proyección, no como pagadas`)
  }

  // ── LA COLUMNA "SE PAGA EL" QUE YA ESTÁ EN LA PESTAÑA ──
  // Se lee con render FORMULA y ANTES de armar la grilla: si el dueño escribió una fecha a mano, esa
  // fila no se reescribe. Leerla después sería tarde, y leerla sin FORMULA no distingue una fecha
  // tipeada de una que devuelve mi propia fórmula.
  const pagoPrevio = []
  const colC = await google.readSheetValues(ID, `'${PESTAÑA}'!C1:C400`, { render: 'FORMULA' }).catch(() => [])
  colC.forEach((f, i) => { pagoPrevio[i] = f?.[0] })

  // El cuadro del escalón tiene que cubrir el mes base de obra, el último mes de oficina Y EL MES EN
  // CURSO —que es el ancla de Dirección, cuyo importe sale de la última carga en Compras—: si alguno no
  // está, el MATCH no lo encuentra, el IFERROR devuelve 1 y ese bloque se proyecta SIN un solo aumento,
  // en silencio. Es el mismo defecto que ya dejó ciega la proyección de administración.
  // Y EL MES ANTERIOR AL EN CURSO (14/08): el ancla de Dirección dejó de ser el mes del calendario y
  // pasó a ser el mes al que pertenece el importe base —el retiro de M se paga a principios de M+1, así
  // que casi siempre es el mes pasado—. Si ese mes no está en el cuadro, el MATCH no lo encuentra, el
  // IFERROR devuelve 1 y los retiros se proyectan sin un solo aumento, en silencio: exactamente el
  // defecto que se acaba de corregir, entrando por la otra puerta.
  const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
  const meses = mesesDelMotor(cerradaBase?.hasta ?? ultimoDia, pendientes, [ultimoDiaOfi, mesAnterior, hoy])
  const baseObra = cerradaBase?.hasta ?? ultimoDia
  const periodoBase = baseObra ? `${baseObra.getFullYear()}-${String(baseObra.getMonth() + 1).padStart(2, '0')}` : null
  // LO QUE ACUMULA LA PROYECCIÓN, EN LA CORRIDA. Es el efecto de todo lo de arriba en un número: si un
  // día sale 1,00 (nadie sube) o 1,80 (alguien encadenó de más), se ve acá y no en el cash flow.
  const acum = periodoBase && meses.length ? factorUocraEntre(periodoBase, meses[meses.length - 1].periodo, escalones) : null
  if (acum) console.log(`paritaria: de ${periodoBase} a ${meses[meses.length - 1].periodo} acumula ×${acum.factor.toFixed(4)} · ${acum.mesesProyectados} mes(es) proyectado(s) sin acuerdo`)
  // EL PLANTEL DEL AÑO ENTERO, no el de la quincena: la sección 6 tiene que poder liquidar también a
  // quien ya no está, y ésos sólo existen en los bloques viejos del espejo.
  // EL COSTO DE DESVINCULAR SE PUBLICA EN «Nómina», NO ACÁ. Se sigue calculando el plantel porque
  // otras partes de esta pestaña lo usan, pero no se le pasa a `grilla`: sin él, la sección 6 no se
  // dibuja. Dos pestañas publicando el mismo número es como empiezan las dos verdades.
  const desvinculacion = separarPlantel(plantelDelEspejo(espejo ?? [], bloques, { anio: AÑO }), bloques)
  console.log(`plantel del año: ${desvinculacion.activos.length} activo(s) · ${desvinculacion.desafectados.length} desafectado(s) — el costo de desvincular se publica en «Nómina»`)
  const g = grilla({
    bloques, pendientes, bloquesOfi, pagoPrevio, ultimoDiaOfi,
    escalones, bloqueBase, categorias, personasBase, origenPlantel: piso.origen ?? 'cerrada',
    escalonVigente, meses, hoy, periodoBase, demanda,
    desvinculacion: null,
  })
  console.log(`grilla: ${g.filas.length} filas × ${ANCHO} columnas · motor sobre ${meses.length} mes(es) (${meses[0]?.periodo} → ${meses[meses.length - 1]?.periodo})`)
  const aMano = g.filas.filter((f) => f[2] === '').length
  if (aMano) console.log(`  ✋ ${aMano} fecha(s) de pago escrita(s) a mano: no las toco`)
  // `--volcar` escribe la grilla ENTERA a un JSON, sin recortar. El `--dry` de arriba corta cada celda
  // a 34 caracteres para que la salida se pueda leer, y con eso alcanza para revisar la FORMA del
  // cuadro — pero no para recuperar una fórmula. El 07/09 hizo falta reponer a mano una columna que
  // la Regla 0 no dejaba escribir, y la única copia disponible era la de `sheet_huella_celda`, que
  // guarda 300 caracteres: la fórmula entró truncada y las seis celdas quedaron en #ERROR!. Una
  // fórmula no se reconstruye de memoria ni se corta: se lee entera de quien la produce.
  if (process.env.ORQ_VOLCAR_GRILLA) {
    writeFileSync(process.env.ORQ_VOLCAR_GRILLA, JSON.stringify(g.filas, null, 1))
    console.log(`grilla volcada entera → ${process.env.ORQ_VOLCAR_GRILLA} (${g.filas.length} filas)`)
  }
  if (DRY) {
    for (const f of g.filas) console.log('   ', f.filter((c) => c && c !== VACIO).map((x) => String(x).slice(0, 34)).join(' | '))
    // ═══ EL DRY TAMBIÉN CORRE LOS DOS CONTROLES QUE NO NECESITAN LA RED (09/09/2026) ═══
    //
    // Hasta hoy imprimía la grilla y nada más: para saber si los rangos con nombre iban a caer bien o
    // si el patrón tenía defectos había que ESCRIBIR la pestaña. Eso convierte el Sheet real en el
    // banco de pruebas, que es exactamente lo que este repositorio no puede hacer —desde un worktree
    // ya borró una pestaña entera—. Los dos controles son puros: miran la grilla en memoria.
    const quiero = rangosDeJornales(g)
    const problemas = verificarRangos(g.filas, quiero)
    console.log(problemas.length
      ? `✗ ${problemas.length} rango(s) ciego(s):\n${explicarProblemas(problemas)}`
      : `✓ los ${quiero.length} rangos con nombre caen sobre datos, bajo su encabezado`)
    for (const d of quiero) {
      console.log(`   ${d.nombre.padEnd(24)} ${letraCol(d.c0)}${d.r0}:${letraCol(d.c1)}${d.r1}  bajo «${d.ancla.texto}» (fila ${d.ancla.fila})`)
    }
    // EL PATRÓN NO SE PUEDE AUDITAR ACÁ, Y DECIRLO ES PARTE DEL CONTROL. `auditarPatron` mide lo que
    // el LECTOR VE: una celda con `=IFERROR(INDEX('_J_OBREROS'!F6:U6;SUMPRODUCT(…)))` son 195
    // caracteres de fórmula que en pantalla se ven como «31/07/2026». Medida en seco, esta grilla
    // publica 170 «notas en el medio» que no existen. El patrón se mide sobre la pestaña ESCRITA, con
    // `auditar-diseno-unificado`, y desde el árbol principal.
    return
  }

  const hojas = await google.getSheetMeta(ID)
  const hoja = hojas.find((h) => h.title === PESTAÑA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTAÑA}"`)

  // EL PARÁMETRO SE ASEGURA ANTES DE ESCRIBIR LA GRILLA. Las fórmulas de "Se paga el" citan
  // JORNALES_DESFASE_PAGO y JORNALES_VENTANA_BANCO por nombre: si los nombres no existen todavía, la
  // columna entera queda en #NAME? hasta la corrida siguiente.
  await asegurarParametros(google, hojas, TODOS_LOS_PARAMETROS(escalones)).catch((e) => console.warn(`  ⚠ no pude asegurar los parámetros de fecha de pago: ${e.message}`))
  // Y LAS DOS MEDICIONES, en la misma pasada y por la misma razón: las nueve quincenas proyectadas
  // citan `JORNALES_HORAS_MEDIDAS` y `JORNALES_SHARE_ADELANTO` por nombre. Sin los nombres, la
  // columna «Total» de la proyección queda en #NAME? y con ella la línea del Cash Flow.
  await asegurarMedidos(google, hojas, g.medidos).catch((e) => console.warn(`  ⚠ no pude actualizar las mediciones en Parámetros: ${e.message}`))

  // ═══ EL PREVIO SE LEE MÁS ANCHO QUE LA GRILLA, Y ESO NO ES PRECAUCIÓN ═══
  //
  // La columna «Pagado el» BAJÓ de la N a la M el 09/09/2026. Leyendo `A:letraCol(ANCHO-1)` —o sea
  // A:M— la pestaña que está en Drive queda cortada justo antes de la columna donde el dueño tiene
  // sus fechas: no se leen, no se recuperan, y la escritura las tapa. Se leen tres columnas de más:
  // cuestan nada y son la diferencia entre recuperar su trabajo y perderlo por cuarta vez.
  const previoAncho = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:P400`)
  const previo = (previoAncho ?? []).map((f) => (f ?? []).slice(0, ANCHO))

  // ═══ LAS FECHAS DEL DUEÑO SE RECUPERAN POR QUINCENA, Y RECIÉN AHÍ SE LIMPIA LO VIEJO ═══
  //
  // El dry del 09/09 lo midió: 18 fechas copiadas a las filas nuevas Y las mismas 18 vivas en las
  // filas viejas, ahora debajo de la grilla, porque la cola las protegía como «columna ajena». Una
  // fecha huérfana fuera de toda quincena la puede leer CAJA como un pago.
  //
  // El emparejamiento es por la FECHA DE CIERRE de cada quincena —lo único que la identifica y no se
  // mueve con el layout—, y el generador NO ESCRIBE si queda una sola fecha suya sin poder emparejar.
  const cabViejo = cabeceraDelRegistro(previoAncho)
  // SIN ANCLA NO SE ESCRIBE, Y ESO ES NUEVO. Antes se caía a copiar por número de fila «para no perder
  // nada»; con la cola limpiando esa columna, copiar mal ya no es un desorden: es borrar. Si la
  // cabecera del registro no se reconoce, la corrida se detiene y lo dice — la pestaña queda como
  // está y alguien la mira.
  if (!cabViejo && (previoAncho ?? []).some((f) => (f ?? []).some((c) => String(c ?? '').trim()))) {
    console.error('✗ NO escribo: no encontré la cabecera del registro en la pestaña, así que no puedo')
    console.error('   recuperar las fechas de «Pagado el». Son tuyas y no las toco.')
    process.exitCode = 1
    return
  }
  const suyas = recuperarPagadoEl(previoAncho, cabViejo)
  if (suyas.sinClave.length) {
    console.error(`✗ NO escribo: ${suyas.sinClave.length} fecha(s) de «Pagado el» que no puedo atribuir a ninguna quincena.`)
    for (const x of suyas.sinClave.slice(0, 8)) console.error(`   fila ${x.fila}: "${x.valor}" — su renglón no tiene fecha de cierre al lado`)
    console.error('   Son TUYAS y no las toco. Miralas en la pestaña y borrá las que ya no correspondan.')
    process.exitCode = 1
    return
  }
  if (suyas.total) console.log(`  ✋ ${suyas.total} fecha(s) de «Pagado el» recuperadas por quincena: esa columna es TUYA`)
  if (suyas.copias?.length) {
    console.log(`  🧹 ${suyas.copias.length} copia(s) de una fecha que ya está en su quincena: se limpian.`)
    for (const x of suyas.copias.slice(0, 5)) console.log(`     fila ${x.fila}: "${x.valor}"`)
  }
  if (suyas.noEsFecha.length) {
    console.log(`  🧹 ${suyas.noEsFecha.length} celda(s) de esa columna no son una fecha (residuo de un layout anterior): se limpian.`)
    for (const x of suyas.noEsFecha.slice(0, 5)) console.log(`     fila ${x.fila}: "${String(x.valor).slice(0, 40)}"`)
  }

  // La cola de la pestaña vieja: se marca VACIO —"es mi celda y va vacía"— así se limpia lo que
  // dejaron los generadores anteriores sin tocar lo que haya escrito una persona.
  // SIN `columnasAjenas` DESDE EL 09/09/2026: proteger la columna del dueño en la COLA es lo que
  // dejaba sus fechas vivas debajo de la grilla. Ya están recuperadas y verificadas arriba; si algo
  // no se pudo atribuir, esta línea no se ejecuta porque la corrida se detuvo.
  const cola = conColaMedida(g.filas, previo, { ancho: ANCHO })
  if (avisoDeCola(cola, PESTAÑA)) console.log(avisoDeCola(cola, PESTAÑA))
  g.filas = cola.filas

  // ═══ AIRE ABAJO DE LA GRILLA ═══
  //
  // La pestaña tenía exactamente 85 filas y la grilla nueva ocupa 85. Cualquier regla de formato que
  // toque el borde —y varias lo hacen, porque limpian "hasta el final"— sale con "exceeds grid
  // limits" y hace fallar el LOTE ENTERO: la corrida se cae DESPUÉS de escribir los valores, y la
  // pestaña queda con datos nuevos y formato viejo. Se agregan filas antes de tocar nada.
  const filasHoja = hoja.rows ?? 0
  if (filasHoja < g.filas.length + 20) {
    await google.spreadsheetBatchUpdate(ID, [
      { appendDimension: { sheetId: hoja.sheetId, dimension: 'ROWS', length: g.filas.length + 20 - filasHoja } },
    ])
    console.log(`la pestaña tenía ${filasHoja} filas para una grilla de ${g.filas.length}: le agrego aire`)
  }

  // Una celda COMBINADA se traga la escritura en silencio: ni error ni valor.
  await google.spreadsheetBatchUpdate(ID, [
    { unmergeCells: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: Math.max(g.filas.length + 20, hoja.rows ?? 0), startColumnIndex: 0, endColumnIndex: Math.max(ANCHO, hoja.cols ?? ANCHO) } } },
  ]).catch(() => {})

  const { grid, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, PESTAÑA, g.filas, previo)
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${r.suyo.slice(0, 44)}") en vez de escribir "${r.mio.slice(0, 44)}"`)

  // ═══ LA COLUMNA "Pagado el" ES DEL DUEÑO: SE COPIA DE LA PESTAÑA, NO SE GENERA (31/07) ═══
  //
  // Le borré las 14 fechas DOS VECES el mismo día. La primera porque emitía VACIO ahí. La segunda
  // porque sacar la celda de la fila NO alcanza: `escribirPreservando` recibe
  // `anchoHoja: max(ANCHO, hoja.cols)` —el generador es dueño de TODO su ancho, que es la regla
  // correcta para el resto— y rellena la fila hasta ese ancho, borrando lo que hubiera.
  //
  // La cura es explícita y local: antes de escribir, se COPIA lo que hay en la pestaña a la grilla. La
  // escritura queda siendo un no-op sobre esa columna, pase lo que pase con el ancho. Y si él carga una
  // fecha nueva, la corrida siguiente la lee y la vuelve a escribir igual.
  // SE EMPAREJA POR LA POSICIÓN EN EL REGISTRO, NO POR NÚMERO DE FILA. La primera versión copiaba
  // `previo[i]` a `grid[i]`: el día que la pestaña creció una fila —entró el subtítulo del bloque de
  // oficina— el registro se corrió de la 66 a la 67 y la fecha de la última quincena se perdió. Es el
  // mismo error que cometí al restaurarlas: anclar en la fila cuando el bloque se mueve.
  //
  // El ancla es la CABECERA del registro: desde ahí, la k-ésima quincena de antes es la k-ésima de
  // ahora, porque el registro sólo crece por el final.
  //
  // ═══ EL ANCLA SOBREVIVE A UN CAMBIO DE LAYOUT, Y ESO ES NUEVO (09/09/2026) ═══
  //
  // Buscaba `A === 'Quincena'` y `'Pagado el'` en la ÚLTIMA columna, las dos cosas clavadas. El
  // rediseño de hoy renombró la primera columna a «Desde» y corrió «Pagado el» de la N a la M: con el
  // ancla vieja, la pestaña que está en Drive AHORA MISMO no habría sido reconocida, el código habría
  // caído a copiar por número de fila, y las catorce fechas del dueño —lo que dispara el descuento en
  // CAJA— habrían aterrizado cada una en la quincena de otra. Es exactamente el modo de falla que
  // este bloque existe para impedir, entrando por la puerta del propio rediseño.
  //
  // Ahora la cabecera se reconoce por lo que SIGNIFICA, no por dónde está: la fila cuya columna A es
  // el rótulo de la primera columna del registro —el de hoy o el de ayer— y que tiene «Pagado el» en
  // ALGUNA columna. Y se copia de la columna donde estaba a la columna donde está.
  const iPagado = colDe('Pagado el').charCodeAt(0) - 65
  const nuevo = cabeceraDelRegistro(grid)
  // Primero: TODA la columna es del dueño, así que nace vacía y sólo se llena con lo que él escribió.
  // Vacía DE VERDAD, con el centinela: es lo que borra las copias huérfanas que un layout anterior
  // dejó fuera de la grilla, y por eso la recuperación de arriba tiene que haber pasado primero.
  for (let i = 0; i < grid.length; i++) grid[i][iPagado] = VACIO
  // Y cada fecha vuelve a SU quincena, por la fecha de cierre. El registro del generador tiene una
  // fila por bloque del espejo y en el mismo orden, así que la clave se calcula del mismo lugar del
  // que sale la columna «Hasta»: la fila de fechas del bloque.
  let copiadas = 0
  if (nuevo) {
    bloques.forEach((b, i) => {
      const cierre = ultimoDiaCargado(espejo[b.filaFecha - 1] ?? [])
      const clave = cierre ? claveDeFecha(fecha(cierre)) : null
      const suyo = clave ? suyas.porClave.get(clave) : null
      if (suyo === undefined || suyo === null || String(suyo) === '') return
      const fila = g.f0 + i
      if (fila - 1 >= grid.length) return
      grid[fila - 1][iPagado] = suyo
      copiadas++
    })
    // EL CONTEO TIENE QUE CUADRAR, Y SI NO CUADRA NO SE ESCRIBE. Sin esto, una fecha que no encontró
    // su quincena se pierde en silencio — que es exactamente lo que pasó las tres veces anteriores.
    if (copiadas !== suyas.porClave.size) {
      console.error(`✗ NO escribo: recuperé ${suyas.porClave.size} fecha(s) de «Pagado el» y sólo ${copiadas} encontraron su quincena.`)
      console.error('   Las que faltan son de quincenas que ya no están en el espejo. Están en la pestaña y no las toco.')
      process.exitCode = 1
      return
    }
  }
  // Y la cabecera, que sí es mía.
  if (nuevo) grid[nuevo.fila][iPagado] = 'Pagado el'
  if (copiadas) console.log(`  ✋ ${copiadas} fecha(s) de "Pagado el" copiadas de la pestaña: esa columna es TUYA, el generador no la escribe`)
  // ═══ ACÁ NO HAY COLUMNA DE PROSA — LA ÚLTIMA COLUMNA ES LA DEL DUEÑO (06/08, 4ª reincidencia) ═══
  //
  // `vaciarColumnaDeProsa(grid, ANCHO-1)` pisaba la columna N "Pagado el" con el centinela VACIO
  // ("es mía y va vacía") DESPUÉS de haberla copiado con cuidado veinte líneas más arriba. En Cargas
  // Sociales la última columna sí es de prosa; en esta pestaña es la del dueño, y esta llamada era la
  // segunda vía del mismo borrado que el push() de la mañana (d3c165b). Se retira: las fechas del
  // dueño ya viajan en la grilla por la copia de arriba, y la prosa de esta pestaña no existe.
  const escritura = await escribirPreservando(google, ID, `'${PESTAÑA}'`, grid, { respetar: false /* la Regla 0 ya se aplicó arriba, a mano: este generador guarda el registro DESPUÉS de releer la pestaña, que es más fiel que hacerlo antes de escribir */, anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
  // ═══ SI LA ESCRITURA SE SALTEÓ, NO SE TOCA LA GEOMETRÍA (31/07) ═══
  //
  // El defecto que arruinó CAJA, buscado en todos los generadores y encontrado en seis. La guarda hace
  // bien su trabajo —con la pestaña candada o con la firma editada, `escribirPreservando` NO escribe—
  // pero el resultado se descartaba y la corrida seguía: el formateador pintaba la geometría de la
  // grilla NUEVA sobre los valores VIEJOS, y donde había rangos con nombre los reapuntaba a filas que
  // en la pestaña no tienen ese dato. En CAJA eso dejó CAJA_TOTAL_DISPONIBLE y CAJA_FECHA_SALDO sobre
  // dos celdas vacías: con el total y la fecha de corte en cero, todo cheque y toda quincena pasaban el
  // filtro y el calendario inflaba sus tramos. Sin un solo #ERROR y sin un aviso.
  //
  // Una pestaña que no se escribió no cambió de forma: su formato y sus nombres son los de su última
  // escritura y así tienen que quedar.
  const salteada = Boolean(escritura?.bloqueada || escritura?.editadaPorHumano)
  if (salteada) console.log('  🔒 bajo tu control: no escribí, y por lo tanto no le toco el formato ni sus rangos con nombre. Queda exactamente como la dejaste.')
  const { conservadas } = salteada ? { conservadas: [] } : escritura
  if (conservadas.length) console.log(`✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)

  if (!salteada) await formatear(google, hoja.sheetId, grid, g)
  if (!salteada) await publicarRangos(google, hoja.sheetId, g)
  if (!salteada) await recortarGeometria(google, hoja, grid.length).catch((e) => console.warn(`  ⚠ no recorté la geometría: ${e.message}`))

  // ── VERIFICAR MIRANDO LA PESTAÑA ──
  const v = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:${String.fromCharCode(64 + ANCHO)}${grid.length}`)
  const errores = v.flat().filter((c) => /^#(REF|ERROR|N\/A|VALUE|VALOR|¿|¡|DIV|NAME|NUM|NULL)/i.test(String(c ?? '')))
  console.log(errores.length ? `⚠ ${errores.length} celda(s) en error: ${errores.slice(0, 3).join(' · ')}` : '✓ ninguna celda en error')
  // ═══ EL DEFECTO DE PATRÓN ES UN REPORTE, NO UN FALLO DE DATOS (14/08) ═══
  //
  // El porqué entero está en `clasificarDefectos`. Acá se cobra en dos cosas: el exitCode deja de
  // mezclar "la pestaña está rota" con "la pestaña se lee mal", y el reporte pasa a NOMBRAR la fila
  // con lo que tiene adentro. Sin eso, `⚠ 1 defecto de patrón · fila-sin-concepto` obligaba a abrir el
  // archivo para saber de qué celda hablaba, y una celda que no se puede nombrar no se puede limpiar.
  const { rotos, reporte } = clasificarDefectos(auditarPatron(v))
  if (rotos.length) console.log(`⚠ ${rotos.length} defecto(s) que ROMPEN el dato:`)
  for (const d of rotos.slice(0, 8)) console.log(`   fila ${d.fila} · ${d.regla} · ${d.detalle.slice(0, 110)}`)
  if (reporte.length) console.log(`📋 ${reporte.length} defecto(s) de patrón (REPORTE — los números están publicados, el cuadro se lee mal):`)
  for (const d of reporte.slice(0, 8)) {
    const contenido = (v[d.fila - 1] ?? []).map((c, j) => [letraCol(j) + d.fila, String(c ?? '').trim()])
      .filter(([, c]) => c).map(([ref, c]) => `${ref}="${c.slice(0, 28)}"`).join(' · ')
    console.log(`   fila ${d.fila} · ${d.regla} · ${d.detalle.slice(0, 110)}`)
    if (contenido) console.log(`      lo que tiene: ${contenido.slice(0, 200)}`)
  }
  if (!rotos.length && !reporte.length) console.log('✓ la pestaña cumple el patrón de diseño')
  // ═══ EL LOG IMPRIME LAS CELDAS QUE LA FILA TIENE, NO TRES LETRAS ESCRITAS ACÁ (13/08) ═══
  //
  // Decía `f[1] · f[6] · f[9]`, elegidas cuando el hero era una lista y el registro el único cuadro
  // ancho. Con cuatro cuadros de ocho columnas, la J casi siempre viene vacía y la fila de total del
  // hero mostraba dos columnas de las cinco que tiene. Un log que elige columnas a mano envejece igual
  // que una fórmula con la letra escrita: se imprime lo que hay.
  for (const f of v) {
    if (!/^⇒/.test(String(f?.[0] ?? ''))) continue
    const cifras = f.slice(1, ANCHO).map((c) => String(c ?? '').trim()).filter(Boolean)
    console.log(`  ${String(f[0]).slice(0, 44).padEnd(46)}${cifras.map((c) => c.slice(0, 15).padStart(16)).join('')}`)
  }

  await guardarRegistro(ID, PESTAÑA, grid, ediciones, v, candidatos).catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))

  // COBERTURA REAL DE JORNALES (24/07). La frescura de la fuente marcaba "cargada hasta el 08/07":
  // un valor manual viejo que hacía ver atrasada una planilla que SÍ tiene la 2da quincena de julio.
  // El dato honesto ya está calculado acá: `conHoras` es el último día con HORAS de verdad en obra
  // (no la fecha del encabezado, que declara hasta el 31/07 desde el día que se abre el bloque), y
  // `ultimoDiaOfi` el de oficina. La cobertura es el más reciente de los dos: hasta ahí llega el dato.
  // No se inventa: sale de las horas efectivamente cargadas en el espejo que se acaba de leer.
  const cobertura = [conHoras, ultimoDiaOfi].filter(Boolean).sort((a, b) => b - a)[0] ?? null
  if (cobertura) {
    const iso = `${cobertura.getFullYear()}-${String(cobertura.getMonth() + 1).padStart(2, '0')}-${String(cobertura.getDate()).padStart(2, '0')}`
    const fr = await registrarSincronizacion({}, { driveFileId: JORNALES_FILE_ID, coberturaHasta: iso })
    console.log(fr.ok ? `frescura JORNALES: cobertura hasta ${iso} → ${fr.estado}` : `frescura no registrada: ${fr.motivo}`)
  }

  // Rojo SÓLO cuando el dato está roto: una celda en error, o un defecto de los que invalidan el dato.
  // Un defecto de patrón ya se dijo arriba con su fila y su contenido, y no vuelve a decirse acá.
  if (errores.length || rotos.length) process.exitCode = 1
}

/**
 * PUBLICA LA GEOMETRÍA DE LA PESTAÑA COMO RANGOS CON NOMBRE.
 *
 * POR QUÉ (23/07). Tres pestañas leían este cuadro con las filas ESCRITAS A MANO en la fórmula:
 * Cargas Sociales sumaba `$A$3:$A$16` y `$A$23:$A$33`, el RESUMEN mostraba la quincena en curso
 * desde `$A$23`, y la línea de jornales del cash flow sumaba `$B$24:$B$33`. Uno de esos comentarios
 * lo decía sin ironía: *"FRAGILIDAD DECLARADA: los rangos están fijos. Si la pestaña cambia de
 * geometría, esto deja de sumar bien SIN dar error. Deuda heredada, escrita para que se vea."*
 *
 * Y pasó: este rediseño movió las quincenas reales de la fila 3 a la 41. Las tres fórmulas habrían
 * seguido devolviendo un número —el de las filas equivocadas— sin una sola celda en rojo.
 *
 * Un rango con nombre lo resuelve de raíz: se mueve solo cuando la pestaña se reordena, y una
 * fórmula que dice `JORNALES_REAL_TOTAL` se audita sola, cosa que `$J$3:$J$16` no. Es lo que pide la
 * skill de Sheets y lo que evita que el próximo rediseño rompa otras tres pestañas en silencio.
 */
/**
 * NÚCLEO PURO: dónde va cada parámetro en Parámetros — el que ya está, o la fila donde agregarlo.
 *
 * SÓLO AGREGA LO QUE FALTA, NUNCA PISA UN VALOR. Es la diferencia entre un parámetro y una constante
 * disfrazada: si el dueño cambia el 1 por un 3, la corrida siguiente tiene que RESPETARLO. Por eso
 * cuando el rótulo ya existe esta función devuelve la fila y nada más: ni el valor ni la nota se
 * reescriben.
 *
 * @param {any[][]} filas Parámetros!A1:C…
 * @param {object[]} params los parámetros a ubicar. Por defecto los tres que usa esta pestaña: los
 *   dos de la fecha de pago de la quincena y el día en que salen los retiros de Dirección.
 * @returns {{rango:string, rotulo:string, fila:number, nuevo:boolean, valor:any, nota:string}[]}
 */
export function ubicarParametros(filas = [], params = TODOS_LOS_PARAMETROS()) {
  const norm = (s) => String(s ?? '').trim().toLowerCase()
  let libre = 0
  filas.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) libre = i + 1 })
  // Una fila en blanco de separación: el bloque nuevo no se pega al último de la pestaña.
  libre += 2
  return params.map((p) => {
    const i = filas.findIndex((f) => norm(f?.[0]) === norm(p.rotulo))
    if (i >= 0) return { ...p, fila: i + 1, nuevo: false }
    const fila = libre
    libre++
    return { ...p, fila, nuevo: true }
  })
}

/**
 * Asegura las dos filas de parámetro en Parámetros y publica sus rangos con nombre.
 *
 * POR QUÉ EL DESFASE VIVE EN LA PESTAÑA Y NO EN EL CÓDIGO. Es un criterio de negocio que va a cambiar
 * —el banco acredita en uno o dos días hábiles según el día de la semana, y el dueño puede querer
 * moverlo— y un criterio que sólo se puede cambiar editando JavaScript no se cambia: envejece. Es la
 * misma razón por la que "Horas por jornada" ya vive ahí y no adentro de una fórmula.
 */
export async function asegurarParametros(google, hojas, params = TODOS_LOS_PARAMETROS()) {
  const TAB = 'Parámetros'
  const hoja = hojas.find((h) => h.title === TAB)
  if (!hoja) { console.warn(`  ⚠ no existe la pestaña "${TAB}": los parámetros quedan en su valor por defecto`); return }

  const filas = await google.readSheetValues(ID, `'${TAB}'!A1:C400`).catch(() => [])
  const ubic = ubicarParametros(filas, params)

  // ═══ `refrescar`: LA EXCEPCIÓN QUE NO ROMPE LA REGLA (09/09/2026) ═══
  //
  // "Nunca pisa un valor" es lo correcto para un parámetro NORMATIVO —una alícuota que el dueño
  // confirma con el contador—. No lo es para un valor que el OS CALCULA y que se mudó acá sólo para
  // sacarlo del medio de una grilla de plata: la proporción del plantel en su primer año de
  // antigüedad sale de las fechas de ingreso de `_J_OBREROS` y su fórmula cita las filas del bloque
  // de la quincena vigente. Escrito una sola vez, el día que entre una quincena nueva ese rango
  // apunta al bloque viejo y devuelve un porcentaje plausible sobre otra gente — la fosilización
  // exacta que `auditar-rangos-fosilizados` persigue, y que no da un solo error.
  //
  // Entonces: el parámetro del dueño no se pisa NUNCA, y el calculado por el OS se reescribe SIEMPRE.
  // Quién es cuál lo declara la propia lista, no una heurística.
  for (const p of ubic.filter((x) => x.nuevo || x.refrescar)) {
    // Se escribe SÓLO la fila del parámetro, con el portón que respeta candado, firma y anotaciones.
    // Nada de batchUpdateValues crudo: Parámetros es una pestaña del dueño, no un espejo.
    const r = await escribirPreservando(google, ID, `'${TAB}'`, [[p.rotulo, p.valor, p.nota]], {
      fila0: p.fila, anchoHoja: 3, pestana: TAB,
    })
    if (r?.bloqueada || r?.editadaPorHumano) { console.log(`  ⚠ "${TAB}" está bajo tu control: no escribí "${p.rotulo}"`); continue }
    console.log(`  ${p.nuevo ? '✚ parámetro nuevo' : '↻ recalculado'} en ${TAB}!A${p.fila}: "${p.rotulo}" = ${p.valor}`)
  }

  // Los nombres apuntan a la celda del VALOR (columna B). Si el dueño mueve la fila, la próxima
  // corrida la vuelve a encontrar por el rótulo y reapunta el nombre: no hay coordenada escrita a mano.
  const existentes = new Map((await google.getNamedRanges(ID)).map((r) => [r.name, r.namedRangeId]))
  const reqs = ubic.map((p) => {
    const range = { sheetId: hoja.sheetId, startRowIndex: p.fila - 1, endRowIndex: p.fila, startColumnIndex: 1, endColumnIndex: 2 }
    return existentes.has(p.rango)
      ? { updateNamedRange: { namedRange: { namedRangeId: existentes.get(p.rango), name: p.rango, range }, fields: 'range' } }
      : { addNamedRange: { namedRange: { name: p.rango, range } } }
  })
  await google.spreadsheetBatchUpdate(ID, reqs)
  console.log(`parámetros: ${ubic.map((p) => `${p.rango}=${TAB}!B${p.fila}`).join(' · ')}`)
}

/**
 * NÚCLEO PURO: una fórmula escrita PARA esta pestaña, calificada para poder vivir en otra.
 *
 * ═══ EL DEFECTO, MEDIDO EN LA COPIA (09/09/2026) ═══
 *
 * `formulaHorasPorPersona` y `formulaShareAdelanto` producen rangos relativos a la hoja donde caen
 * (`$J$12:$J$28`), porque nacieron viviendo EN «Jornales por Quincena». Al mudarlas a «Parámetros»
 * esos rangos pasaron a apuntar a las columnas de «Parámetros»: la celda no da error, devuelve **0**.
 * Medido: `Parámetros!B106 = 0` y con eso las nueve quincenas proyectadas publicaron la mitad de lo
 * que valen ($30.695.869 contra $59.650.055). Ninguna celda en rojo.
 *
 * Se califica sólo lo que NO trae hoja ya puesta: los rangos del espejo (`'_J_OBREROS'!$W$1:$W$2`)
 * quedan como están, y los rangos con nombre —que no tienen `$`— no matchean.
 *
 * @param {string} formula
 * @param {string} pestana
 * @returns {string}
 */
export function conPestaña(formula, pestana = PESTAÑA) {
  return String(formula ?? '').replace(
    /(?<!!)(\$[A-Z]{1,2}\$\d+:\$[A-Z]{1,2}\$\d+)/g,
    `'${pestana}'!$1`,
  )
}

/**
 * LAS DOS MEDICIONES DEL GENERADOR, EN «Parámetros» Y REESCRITAS EN CADA CORRIDA.
 *
 * ═══ POR QUÉ NO ALCANZA `asegurarParametros` ═══
 *
 * Esa función existe para PARÁMETROS: entradas del dueño que se crean una vez y no se pisan nunca —
 * *«si el dueño cambia el 1 por un 3, la corrida siguiente tiene que RESPETARLO»*. Estas dos no son
 * entradas: son fórmulas que MIDEN el registro de «Jornales por Quincena», y ese registro cambia de
 * filas cada vez que entra una quincena. Una fórmula congelada en la fila de ayer no devuelve un
 * valor viejo: devuelve el de OTRAS filas, sin dar error. Por eso acá se reescribe siempre.
 *
 * Y por eso también se dice en el log: una celda de «Parámetros» que el OS pisa en cada corrida tiene
 * que ser visible, o el dueño escribe encima creyendo que su valor va a quedar.
 *
 * @param {object} google
 * @param {{title:string, sheetId:number}[]} hojas
 * @param {{rango:string, rotulo:string, formula:string, nota:string}[]} medidos
 */
export async function asegurarMedidos(google, hojas, medidos = []) {
  const TAB = 'Parámetros'
  const hoja = hojas.find((h) => h.title === TAB)
  if (!hoja || !medidos.length) return
  const filas = await google.readSheetValues(ID, `'${TAB}'!A1:C400`).catch(() => [])
  const ubic = ubicarParametros(filas, medidos.map((m) => ({ ...m, valor: m.formula })))
  for (const m of ubic) {
    const r = await escribirPreservando(google, ID, `'${TAB}'`, [[m.rotulo, m.formula, m.nota]], {
      fila0: m.fila, anchoHoja: 3, pestana: TAB,
    })
    if (r?.bloqueada || r?.editadaPorHumano) { console.log(`  ⚠ "${TAB}" está bajo tu control: no actualicé "${m.rotulo}"`); continue }
    console.log(`  ↻ ${TAB}!B${m.fila} "${m.rotulo}" — la MIDO yo en cada corrida, no la edites acá`)
  }
  const existentes = new Map((await google.getNamedRanges(ID)).map((r) => [r.name, r.namedRangeId]))
  const reqs = ubic.map((m) => {
    const range = { sheetId: hoja.sheetId, startRowIndex: m.fila - 1, endRowIndex: m.fila, startColumnIndex: 1, endColumnIndex: 2 }
    return existentes.has(m.rango)
      ? { updateNamedRange: { namedRange: { namedRangeId: existentes.get(m.rango), name: m.rango, range }, fields: 'range' } }
      : { addNamedRange: { namedRange: { name: m.rango, range } } }
  })
  await google.spreadsheetBatchUpdate(ID, reqs)
}

/**
 * NÚCLEO PURO: qué rango ocupa cada nombre publicado, con su ANCLA y de quién es su contenido.
 *
 * ═══ POR QUÉ ES UNA DECLARACIÓN Y NO UNA LISTA DE COORDENADAS (03/08) ═══
 *
 * Antes esto era un objeto de `rango(col, desde, hasta)` y nada más. Alcanzaba para reapuntar los
 * nombres en cada corrida —eso ya estaba bien— pero no para NOTAR que uno quedó ciego: un nombre
 * apuntando a doce celdas en blanco se publica igual de contento que uno apuntando a los datos.
 *
 * Cada rango declara ahora dos cosas más, y las dos son verificables sin red:
 *   · el ENCABEZADO bajo el que tiene que caer — si alguien inserta una columna en el bloque, el
 *     nombre pasa a leer la columna de al lado y la única señal sería un número plausible;
 *   · DE QUIÉN es el contenido — un rango del OS vacío es un defecto, uno de carga del dueño puede
 *     estar vacío pero el generador no puede emitir el centinela ahí (ver `OFICINA_BANCO`).
 *
 * @param {ReturnType<typeof grilla>} g
 */
export function rangosDeJornales(g) {
  const finProy = g.p0 + g.nProy - 1
  // El encabezado sale de REGISTRO_COLS, que es la MISMA lista de la que sale la fila que se escribe:
  // clavarlo acá a mano reproduciría, del lado del control, el defecto que el control atrapa.
  const reg = (nombre, col, contenido) => columna(nombre, { col, r0: g.f0, r1: g.fTotalReal - 1, encabezado: REGISTRO_COLS[col], contenido })
  // LAS QUINCENAS QUE FALTAN. Desde el 09/09/2026 viven en la MISMA grilla y bajo el MISMO encabezado
  // que las cerradas, así que salen de la MISMA lista de rótulos: un solo contrato de columnas para
  // toda la sección 1, y `verificarRangos` mide los dos tramos contra el mismo renglón.
  const cal = (nombre, col, contenido) => columna(nombre, { col, r0: g.p0, r1: finProy, encabezado: REGISTRO_COLS[col], filaEncabezado: g.f0 - 1, contenido })
  return [
    reg('JORNALES_REAL_DESDE', 0),
    reg('JORNALES_REAL_HASTA', 1),
    // LA FECHA DE CAJA (31/07). Es la que usa la línea de jornales del cash flow; HASTA queda como
    // fallback y como la fecha del DEVENGAMIENTO, que es otra pregunta y otra pestaña.
    reg('JORNALES_REAL_PAGO', 2),
    reg('JORNALES_REAL_TOTAL', 9),
    // ═══ LA DOTACIÓN REAL, PUBLICADA (06/08 — defecto A7) ═══
    // Cargas Sociales proyectaba el Seguro de Vida sobre `AVERAGE(B19:G19)` = 21 personas, el promedio
    // de los seis F931 presentados, mientras la planilla de obra tiene 16. Un promedio no es una
    // dotación: es un número que no fue cierto ningún mes. Con este nombre publicado, esa pestaña
    // puede contrastar la dotación declarada contra el plantel REAL de la última quincena — que es un
    // control de verdad, porque las dos cifras vienen de fuentes distintas.
    reg('JORNALES_REAL_PERSONAS', 4),
    // CUÁNDO SALIÓ LA PLATA DE VERDAD (31/07). Es lo que descarga la obligación: mientras esta celda
    // esté vacía, la quincena cerrada PESA en el calendario de CAJA. En cuanto el dueño escribe la
    // fecha, deja de pesar — la salida ya está en el extracto del banco.
    //
    // ES LA ÚNICA COLUMNA `dueño-restaurado` DE LA PESTAÑA: el generador SÍ emite el centinela ahí y
    // después copia, celda por celda, lo que había en la pestaña (ver el bloque "Pagado el" de
    // main()). Se declara distinto de `dueño` a propósito: el mecanismo funciona pero depende de
    // reconocer la cabecera del registro, y si no la reconoce avisa. No es el patrón a imitar.
    reg('JORNALES_REAL_PAGADO', 12, 'dueño-restaurado'),
    // ═══ POR QUÉ CANAL SALIÓ (01/08) ═══
    // El dueño paga la quincena en partes: una por transferencia y otra en efectivo (adelantos y
    // contra recibo). Esta pestaña ya lo separaba —y ya lo controla contra el TOTAL— pero nadie leía
    // esas tres columnas: CAJA no tenía forma de bajar el banco por el lote de haberes ni la caja
    // física por el efectivo, así que la nómina se pagaba y no salía de ninguna disponibilidad.
    // Publicadas por nombre, las consume lib/caja-posterior-al-corte.mjs.
    reg('JORNALES_REAL_BANCO', 6),
    reg('JORNALES_REAL_ADELANTO', 7),
    reg('JORNALES_REAL_RECIBO', 8),
    cal('JORNALES_PROY_DESDE', 0),
    cal('JORNALES_PROY_HASTA', 1),
    cal('JORNALES_PROY_PAGO', 2),
    // ═══ SÓLO OBRA, Y ES LA DIFERENCIA ENTRE CONTAR UNA VEZ Y DOS ═══
    //
    // Entre el 13/08 y el 09/09 el calendario tenía una columna TOTAL que sumaba las TRES nóminas, y
    // este nombre apuntaba a la de obra a propósito: oficina y dirección YA viajan por
    // `OFICINA_PROYECTADO` y `DIRECCION_PROYECTADO`, y sumarlas también acá las contaba dos veces
    // —$50,2M de más— con un número plausible y ninguna celda en rojo. Con la grilla unificada la
    // columna «Total» ES la de obra y el riesgo desaparece por construcción; el nombre sigue
    // significando lo mismo: los jornales de obra proyectados.
    cal('JORNALES_PROY_TOTAL', 9),
    // ═══ LA OFICINA, PUBLICADA (31/07) ═══
    // Sin estos tres nombres el bloque de oficina era decorativo: la línea "Sueldos de administración"
    // del cash flow salía de Compras y decía otro número que la planilla de sueldos. Ahora la fuente
    // es una sola y el cash flow la referencia, no la copia.
    columna('OFICINA_PAGO', { col: 4, r0: g.o0, r1: g.oFin, encabezado: 'Se paga el' }),
    columna('OFICINA_PAGADO', { col: 2, r0: g.o0, r1: g.oFin, encabezado: 'Pagado' }),
    columna('OFICINA_PROYECTADO', { col: 7, r0: g.o0, r1: g.oFin, encabezado: 'Proyectado' }),
    // El canal por el que salió cada sueldo de administración (01/08). Sin esta columna, CAJA sabía
    // CUÁNTO se pagó de oficina y no de dónde salió, así que no lo restaba de ninguna disponibilidad.
    // El efectivo no tiene rango propio: es Pagado − Banco, y así los dos canales siempre cierran.
    //
    // DEJÓ DE SER `contenido: 'dueño'` EL 14/08, Y NO ES UN AFLOJE. Se declaró así el 01/08 porque la
    // columna se cargaba a mano — y con esa declaración el generador tenía prohibido emitir el
    // centinela ahí. Desde que la lee de la W de `_J_OFICINA` la columna es DERIVADA: nadie la carga,
    // y "no la piso" pasó a significar "conservo lo que haya quedado de otro cuadro". Es lo que dejó
    // fórmulas del calendario en mayo–agosto y un total en diciembre, con el canal duplicado a
    // $5.238.607 contra $2.619.303 reales. Ahora es del generador y responde por su propia columna.
    columna('OFICINA_BANCO', { col: 5, r0: g.o0, r1: g.oFin, encabezado: 'Banco' }),
    // El adelanto de oficina NO se publica como nombre: nadie lo consume —CAJA parte el sueldo en
    // banco y efectivo, y el adelanto está adentro del efectivo— y un nombre sin consumidor es el que
    // termina apuntando a otro layout sin que nadie se entere. Vive en la pestaña y se lee ahí.
    // ═══ LOS RETIROS DE DIRECCIÓN, PUBLICADOS (01/08) ═══
    // Misma forma que OFICINA_*, y por la misma razón: sin estos nombres el bloque sería otro cuadro
    // que nadie lee. La línea "Sueldos de administración" del cash flow es OFICINA + DIRECCIÓN.
    columna('DIRECCION_PAGO', { col: 4, r0: g.d0, r1: g.dFin, encabezado: 'Se paga el' }),
    columna('DIRECCION_PAGADO', { col: 2, r0: g.d0, r1: g.dFin, encabezado: 'Pagado' }),
    columna('DIRECCION_PROYECTADO', { col: 7, r0: g.d0, r1: g.dFin, encabezado: 'Proyectado' }),
  ]
}

/**
 * NOMBRES QUE ESTE GENERADOR PUBLICÓ Y YA NO SOSTIENE — SE RETIRAN, NO SE DEJAN.
 *
 * `OFICINA_EFECTIVO` es de la primera versión del bloque de Oficina, la de DOS columnas de entrada
 * (Banco y Efectivo). Ese diseño se descartó el mismo día —el auditor de patrón lo cazó por dejar la
 * pestaña con tres anchos de grilla— y quedó "el efectivo es Pagado − Banco", con una sola columna.
 * El nombre sobrevivió al layout: nadie lo republica, así que quedó clavado en la columna J filas
 * 26-37 del layout viejo, dos filas más arriba que el bloque de hoy. Cero celdas con dato.
 *
 * POR QUÉ SE BORRA Y NO SE REAPUNTA. No hay a qué apuntarlo: la columna "Efectivo" no existe y
 * fabricarla para darle destino a un nombre es al revés. Y un nombre que devuelve vacío es peor que
 * uno que no existe: la fórmula que lo use da 0 en silencio, mientras que sin el nombre da #NAME? —
 * ruidoso, visible, arreglable. Verificado: ninguna fórmula del OS lo usa (caja-pestana.test.mjs lo
 * prohíbe explícitamente). Si el dueño tuviera una fórmula propia con este nombre, va a ver un
 * #NAME? en vez de un cero — que es exactamente lo que queremos que pase.
 */
export const RANGOS_RETIRADOS = ['OFICINA_EFECTIVO']

async function publicarRangos(google, sheetId, g) {
  const quiero = rangosDeJornales(g)

  // ═══ NO SE PUBLICA UN RANGO CIEGO ═══
  // Se verifica contra la grilla que se acaba de armar, en memoria: si un nombre cayó fuera del
  // bloque, quedó bajo otro encabezado o el generador le borra el contenido a la columna, esto lo
  // dice ACÁ y no dentro de seis meses auditando por qué una línea de CAJA vale $0.
  const problemas = verificarRangos(g.filas, quiero)
  if (problemas.length) {
    console.error('✗ NO publico los rangos con nombre: hay rangos ciegos\n' + explicarProblemas(problemas))
    process.exitCode = 1
    return
  }

  const existentes = new Map((await google.getNamedRanges(ID)).map((r) => [r.name, r.namedRangeId]))
  const reqs = quiero.map((d) => {
    const range = aRangoApi(sheetId, d)
    return existentes.has(d.nombre)
      ? { updateNamedRange: { namedRange: { namedRangeId: existentes.get(d.nombre), name: d.nombre, range }, fields: 'range' } }
      : { addNamedRange: { namedRange: { name: d.nombre, range } } }
  })
  const retirar = RANGOS_RETIRADOS.filter((n) => existentes.has(n))
  for (const n of retirar) reqs.push({ deleteNamedRange: { namedRangeId: existentes.get(n) } })
  await google.spreadsheetBatchUpdate(ID, reqs)
  console.log(`rangos con nombre publicados: ${quiero.map((d) => d.nombre).join(', ')} — las otras pestañas ya no citan números de fila`)

  // ═══ EL RETIRO SE VERIFICA MIRANDO EL ARCHIVO, NO EL REQUEST QUE SE MANDÓ ═══
  //
  // `deleteNamedRange` está FUERA de la lista blanca de la guarda (deshace algo que puede tener
  // fórmulas colgando) y encima no trae sheetId, así que se lo atribuye a TODAS las pestañas: con
  // una sola pestaña candada, la guarda lo descarta y el resto del lote pasa igual. Anunciar
  // "RETIRADOS" ahí sería un log que felicita sin haber borrado nada — el defecto que este archivo
  // ya pagó. Se relee y se dice lo que quedó.
  if (retirar.length) {
    const despues = new Set((await google.getNamedRanges(ID)).map((r) => r.name))
    const fueron = retirar.filter((n) => !despues.has(n))
    const siguen = retirar.filter((n) => despues.has(n))
    if (fueron.length) console.log(`rangos con nombre RETIRADOS (apuntaban a un layout que ya no existe): ${fueron.join(', ')}`)
    if (siguen.length) console.log(`  ⚠ NO se pudieron retirar: ${siguen.join(', ')} — la guarda descarta el borrado si hay alguna pestaña bajo tu control. Siguen devolviendo vacío.`)
  }
}

/**
 * LAS COLUMNAS Y FILAS MUERTAS SE VAN — PERO SÓLO DESPUÉS DE MIRARLAS.
 *
 * La auditoría midió diez columnas (O:X) y veinte filas sin una sola celda con dato. No rompen nada,
 * y son exactamente lo que hace que una pestaña se vea como un borrador: la barra de scroll promete
 * contenido que no existe y el ojo tiene que descartarlo cada vez.
 *
 * ═══ POR QUÉ SE LEE ANTES DE BORRAR, Y POR QUÉ SÓLO HACIA AFUERA ═══
 *
 * `deleteDimension` es irreversible y arrastra los rangos con nombre que caigan adentro. Las dos
 * guardas son estrictas y las dos son necesarias:
 *   · SÓLO más allá del ancho del generador (columna O en adelante) y más abajo del último dato:
 *     todos los rangos con nombre de esta pestaña viven en A:N y arriba de la cola.
 *   · SÓLO si la lectura las devuelve completamente vacías. Si hay una sola celda con algo —una nota
 *     del dueño, una fórmula suelta— no se toca nada y se dice por qué.
 *
 * Es la misma disciplina que el resto del archivo: se mira la pestaña, no se confía en lo que uno
 * cree que dejó la corrida anterior.
 */
async function recortarGeometria(google, hoja, filasUsadas) {
  const AIRE = 20
  const reqs = []
  const cols = hoja.cols ?? 0
  if (cols > ANCHO) {
    const desde = String.fromCharCode(64 + ANCHO + 1)
    const sobrante = await google.readSheetValues(ID, `'${PESTAÑA}'!${desde}1:${hoja.rows ?? 1000}`).catch(() => null)
    const conDato = (sobrante ?? []).flat().filter((c) => String(c ?? '').trim()).length
    if (sobrante === null) console.log('  · no pude leer las columnas sobrantes: no las toco')
    else if (conDato) console.log(`  · las columnas ${desde}: en adelante tienen ${conDato} celda(s) con contenido: NO las borro`)
    else reqs.push({ deleteDimension: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: ANCHO, endIndex: cols } } })
  }
  const tope = filasUsadas + AIRE
  if ((hoja.rows ?? 0) > tope) {
    reqs.push({ deleteDimension: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: tope, endIndex: hoja.rows } } })
  }
  if (!reqs.length) return
  await google.spreadsheetBatchUpdate(ID, reqs)
  // SE VERIFICA MIRANDO LA HOJA, no el request que se mandó: la guarda de escritura puede descartar
  // el lote entero y un log que felicita sin haber borrado nada es el defecto que este repo ya pagó.
  const despues = (await google.getSheetMeta(ID)).find((h) => h.title === PESTAÑA)
  console.log(`geometría: ${hoja.cols}×${hoja.rows} → ${despues?.cols}×${despues?.rows} (la grilla usa ${ANCHO}×${filasUsadas})`)
}

async function formatear(google, sheetId, filas, g) {
  await google.spreadsheetBatchUpdate(ID, requestsDeFormato(sheetId, filas, g))
}

/**
 * NÚCLEO PURO: los pedidos de formato de la pestaña.
 *
 * Separado de la llamada a la API el 06/08 para que se pueda probar en frío QUÉ formato recibe cada
 * bloque. No es una manía: los tres defectos que este mismo archivo documenta —el entero con separador
 * colgado, el negativo invisible y el rango generoso que se comía el bloque de abajo— sólo se veían
 * MIRANDO la pestaña, y ninguno daba error. Un test sobre estos pedidos los caza antes.
 */
export function requestsDeFormato(sheetId, filas, g) {
  // NINGUNA NOTA. La procedencia vive en el subtítulo de la pestaña, una vez.
  const { requests: notas } = borrarNotas(filas, ANCHO - 1, sheetId)
  const rg = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const moneda = { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }
  const reqs = [
    ...notas,
    // La piel entiende el centinela por su cuenta (`conContenido`, en estilo-statement): no hay que
    // limpiárselo acá. Filtrarlo dos veces en dos lugares es la duplicación que este repo evita.
    // `titular: 0` DESDE EL 13/08 — y no es un descuido. La piel dibuja el titular a 13 pt sobre las
    // columnas A y B, y el hero dejó de ser una lista de cinco líneas para ser un cuadro de ocho
    // columnas: eso partía la fila de total en dos tamaños y dejaba un importe de doce dígitos al
    // borde de cortarse. La jerarquía del bloque la pone `escenario`, más abajo.
    ...skinRequests({ sheetId, filas, cols: ANCHO, congeladas: 2, titular: 0, filasHoja: filas.length }),
    // ═══ EL BARRIDO DE MONEDA LLEGA HASTA LA M, NUNCA HASTA LA N (18/08) ═══
    //
    // Iba `1, ANCHO` —B hasta N—, o sea que repintaba de moneda la pestaña ENTERA en cada corrida,
    // incluida la columna «Pagado el». Y la N no es de este generador: `push()` rellena hasta la 13
    // con el centinela VACIO ("es mía y va vacía") y pone `''` en la 14 ("no es mía, preservá lo que
    // haya") — el propio archivo lo declara y lo explica, después de que la fusión le borrara al dueño
    // sus fechas de pago tres veces. Preservar el VALOR y repintar el FORMATO encima es preservar a
    // medias: el dueño lo dijo así, *"si yo hago una modificación así sea de formato en una celda, la
    // tenés que respetar y no volver a lo de antes en la barrida"*.
    //
    // La N recibe UNA sola regla, más abajo: el tipo que declara su propio encabezado (fecha). Eso no
    // es opinar sobre el formato de nadie —es decir de qué es la columna— y sin ella los seriales del
    // dueño se dibujarían "46160" pelado, que es peor que "$46.160".
    { repeatCell: { range: rg(3, filas.length, 1, ANCHO - 1), cell: { userEnteredFormat: { numberFormat: moneda, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } },
    // La prosa se pinta como TEXTO decidida por contenido, DESPUÉS del barrido de moneda — antes de
    // él, el repeatCell la pisaba y "ver Cargas Sociales" quedaba como un número roto (06/08).
    ...requestsTextoPorContenido(sheetId, filas).requests,
    // Las celdas cuya PROSA sale de una fórmula (el pase por contenido las saltea: su contenido
    // empieza con '='): formato TEXTO explícito, decidido por lo que RINDEN, no por lo que contienen.
    // El ajuste de texto NO se declara acá: lo gobierna la regla de abajo, que vale para la pestaña
    // entera. Estas dos celdas pedían CLIP, que contradecía el derrame del título y dejaba la frase
    // cortada a los 112px de su columna aunque a la derecha no hubiera nada que tapar.
    ...(g.celdasDeProsaFormula ?? []).map(({ fila, col }) => ({
      repeatCell: {
        range: rg(fila - 1, fila, col, col + 1),
        cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' } },
        fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
      },
    })),
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: filas.length }, properties: { pixelSize: 21 }, fields: 'pixelSize' } },
    // ═══ TODA LA PESTAÑA DERRAMA, NO ENVUELVE (06/08) ═══
    //
    // Esta regla existía sólo para el título y el subtítulo, con este razonamiento: a su derecha no
    // hay dato, así que se leen de corrido en un renglón; envolviéndose quedaban partidos en dos y la
    // fila de 21px sólo mostraba la primera mitad. Un subtítulo cortado es peor que no tenerlo.
    //
    // El razonamiento vale para TODAS las filas, porque TODAS miden 21px. El generador no declaraba
    // nada para el cuerpo, así que cada celda se quedaba con el ajuste que le hubiera dejado el layout
    // anterior o una persona — y el título "1.3 · LAS QUINCENAS QUE FALTAN HASTA DICIEMBRE" se partía
    // en dos renglones dentro de una fila de uno: en pantalla, "DICIEMBRE" pisando la fila de abajo.
    //
    // DERRAMAR NO ES INVADIR: el texto sólo se extiende sobre celdas VACÍAS. Donde hay un número al
    // lado, se recorta igual que antes. Lo que se elimina es la fila que se parte y se corta sola.
    { repeatCell: { range: rg(0, filas.length, 0, ANCHO), cell: { userEnteredFormat: { wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat.wrapStrategy' } },
    // EL MISMO ANCHO QUE «Cargas Sociales» (09/09/2026): la A de 300 px para el concepto y 100 px
    // parejos para todo lo numérico. Un solo ancho en toda la pestaña, sin excepciones — que es lo
    // que hace que las dos hermanas se lean como el mismo documento.
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 300 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: ANCHO }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
    // ═══ LA D DEJÓ DE SER MÁS ANCHA (09/09/2026) ═══
    //
    // Llevaba 215 px porque en el layout viejo la D era la columna «Estado», cuyo contenido es una
    // frase. Con la grilla unificada la D es «Días»: un entero de dos dígitos en una columna de 215
    // px, y el resto de la pestaña a 100. Un ancho que sobrevive al cambio de dueño de su columna es
    // el mismo defecto que un formato que sobrevive: no da error y descuadra la lectura.
  ]
  // TODO RANGO SE ACOTA A LA GRILLA. Un `repeatCell` que pide una fila que la hoja no tiene hace
  // fallar el LOTE ENTERO ("exceeds grid limits"), no sólo esa regla: la corrida se cae después de
  // haber escrito los valores y la pestaña queda con datos nuevos y formato viejo.
  const fmt = (r0, r1, c0, c1, numberFormat) => {
    const a = Math.max(0, Math.min(r0, filas.length))
    const b = Math.max(a, Math.min(r1, filas.length))
    if (b <= a) return
    reqs.push({ repeatCell: { range: rg(a, b, c0, c1), cell: { userEnteredFormat: { numberFormat } }, fields: 'userEnteredFormat.numberFormat' } })
  }
  // ═══ LAS FILAS DE TOTAL SE REPINTAN ANTES QUE LAS REGLAS POR COLUMNA (09/09/2026) ═══
  //
  // Medido en la pestaña viva por el dueño: «⇒ Total a pagar hasta diciembre» publicando
  // «155756621,0%» y «1557566,21» —un ratio sin dividir y un crudo sin formato—; «⇒ Oficina — pagado
  // y por pagar en el año» mostrando «08/04/68514», que es un importe con formato de FECHA; y
  // «⇒ El jornal por hora más bajo» en «$1».
  //
  // La causa es siempre la misma y no es la fórmula: una fila de total del layout NUEVO cae donde el
  // layout ANTERIOR tenía otra cosa, y el formato de una celda no se va porque el valor cambie. Las
  // reglas de este archivo pintan bloques —el registro, oficina, el escalón— y las filas de total
  // quedan justo AFUERA de todas: son el renglón que remata cada bloque, una fila más abajo.
  //
  // Se repintan ACÁ y no al final, y ese orden es la mitad del arreglo. Al final, la moneda de la
  // fila de total pisaba las reglas por COLUMNA que sí eran correctas: la fecha de caja del titular
  // salía «$46.281» y la del primer retiro de Dirección «$46.237». Puesto antes, la moneda es el
  // DEFAULT de una fila de total —que es lo que casi siempre hay— y cada columna con otro tipo lo
  // corrige después. Se saltean las que el generador ya declara de otro tipo (`enteros`, `ratios`).
  const tiposDeclarados = new Set([...g.enteros, ...g.ratios])
  for (const [i, f] of filas.entries()) {
    if (!/^⇒/.test(String(f?.[0] ?? '').trim())) continue
    if (tiposDeclarados.has(i + 1)) continue
    // HASTA «Estado», NO HASTA EL FINAL: esa columna es una palabra en las dos mitades de la grilla
    // y en los dos bloques mensuales, y pintarla de moneda es el mismo defecto al revés.
    fmt(i, i + 1, 1, colDe('Estado').charCodeAt(0) - 65, moneda)
  }
  // ═══ LOS FORMATOS, Y LOS TRES QUE ESTABAN MAL ═══
  //
  // Se vieron MIRANDO la pestaña, no leyendo sus celdas. Ninguno da error: los tres muestran algo
  // plausible y equivocado, que es la peor clase de defecto de este archivo.
  //
  // 1. UN ENTERO CON PATRÓN DECIMAL DEJA EL SEPARADOR COLGADO. "0.##" sobre 10 días hábiles imprime
  //    "10," — el patrón se escribe con punto (siempre) pero se RENDERIZA con la coma decimal de
  //    es-AR, y sin decimales queda la coma sola. Los enteros llevan patrón entero.
  // 2. UN PATRÓN DE TRES SECCIONES DEJA LOS NEGATIVOS INVISIBLES. "0.0%;;\"—\"" significa
  //    positivo;NEGATIVO;cero, y la sección del medio estaba vacía: el margen contra el convenio
  //    —que hoy es −9,1%— salía en blanco. O sea que el único caso que importa, el que dice que
  //    estamos pagando por debajo del convenio, era justo el que no se veía.
  // 3. UN RANGO DE FILAS "GENEROSO" SE COME EL BLOQUE DE ABAJO. El formato de la proyección iba
  //    `p0 … p0+30` y aterrizaba sobre la escala UOCRA, que le borraba el formato de moneda a la
  //    jornada. Los rangos van de la primera a la última fila del bloque, contadas.
  // Las fechas son fechas, no importes: sin esto la columna A del registro mostraría "$46.204".
  // Y a la IZQUIERDA: una fecha alineada a la derecha en una columna de 330px queda flotando lejos
  // de su encabezado y la tabla se lee como si estuviera corrida.
  // A, B y C son las tres fechas de cada fila de quincena: Quincena, Hasta y Se paga el. Sin la C acá,
  // la fecha de pago saldría como "$46.237" —el serial con formato de moneda—, que es exactamente el
  // defecto que este mismo bloque vino a arreglar para la columna Hasta.
  for (const f of g.fechas) {
    reqs.push({
      repeatCell: {
        range: rg(f - 1, f, 0, 3),
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'LEFT' } },
        fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
      },
    })
  }
  // MISMO DEFECTO, MISMA CURA, EN LA SECCIÓN 6. Ingreso y Egreso entran como fechas y el barrido de
  // moneda las dibujaba «$45.803». Se alinean a la DERECHA, no a la izquierda como el registro: acá la
  // columna mide 112px y a su lado hay números, así que una fecha a la izquierda queda desalineada de
  // toda la tabla.
  for (const [r0, r1, c1] of [
    [...(g.desvinculacion?.rangos?.activos ?? []), 2],
    [...(g.desvinculacion?.rangos?.desafectados ?? []), 3],
  ]) {
    if (!r0 || !r1 || r1 < r0) continue
    reqs.push({
      repeatCell: {
        range: rg(r0 - 1, r1, 1, c1),
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'RIGHT' } },
        fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
      },
    })
  }
  // ═══ LA COLUMNA «Pagado el» ES DE FECHAS EN TODO SU LARGO, NO SÓLO EN SUS FILAS (18/08) ═══
  //
  // Esta regla vivía adentro del bucle de arriba: le daba formato de FECHA a la N sólo en las filas
  // del registro. En TODAS las demás la N se quedaba con el barrido general de moneda —que pinta de
  // la B a la N, la pestaña entera— y ahí es donde el dueño lo vio: siete seriales que un rediseño
  // anterior dejó desplazados en las filas 126 a 132 (el título del cuadro 5 y sus notas) se
  // dibujaban «$46.160», «$46.176», «$46.189»… números de seis cifras con signo de peso justo arriba
  // del cuadro que dice cuánto se pagó de jornales. *"jornales por quincena sigue roto desde fila 126
  // en adelante"*.
  //
  // LOS VALORES NO SE TOCAN, Y NO ES TIMIDEZ: la N está declarada 100% del dueño desde el 31/07, el
  // generador emite filas más cortas que la grilla justamente para no llegar hasta ella, y borrarle
  // fechas de pago ya costó seis pérdidas de trabajo suyo. Lo que estaba mal era MÍO —el formato— y
  // es lo que se arregla. Dibujados como fecha, esos siete se leen «18/05/2026», «03/06/2026»…: se
  // ven por lo que son, copias desplazadas de su propia columna, y el dueño las borra de un saque.
  // Un dato ajeno mal dibujado se arregla dibujándolo bien, no borrándolo.
  reqs.push({
    repeatCell: {
      range: rg(3, filas.length, ANCHO - 1, ANCHO),
      cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' } },
      fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
    },
  })
  // ═══ EL TITULAR: SU FECHA ES FECHA Y SUS CIFRAS SON PLATA (09/09/2026) ═══
  //
  // Tres celdas en dos columnas distintas, arriba de todo y con el barrido de moneda encima: sin esta
  // regla la fecha de la próxima quincena se dibuja «$46.280» —el serial con signo de peso—, que es
  // el defecto que el dueño señaló tres veces en esta misma pestaña.
  // La fecha de caja del titular cae bajo «Se paga el» y las tres cifras bajo su columna de plata: se
  // formatean con el MISMO tipo que la columna de abajo, que es lo que las hace comparables de un
  // vistazo. Sin esta regla la fecha sale «$46.281» —el serial con signo de peso—.
  const cTit = (rotulo) => colDe(rotulo, REGISTRO_COLS).charCodeAt(0) - 65
  fmt(g.fProxima - 1, g.fProxima, cTit('Se paga el'), cTit('Se paga el') + 1, { type: 'DATE', pattern: 'dd/mm/yyyy' })
  fmt(g.fProxima - 1, g.fEfectivo, cTit('Banco'), cTit('Total') + 1, moneda)
  const ENTERO = { type: 'NUMBER', pattern: '#,##0;-#,##0;"—"' }
  // EL "Ajuste escalón" DE LOS DOS BLOQUES MENSUALES, CON CUATRO DECIMALES Y EL MISMO PATRÓN. Iba con
  // "0.00" —heredado del ajuste por inflación del layout viejo— y un tramo de paritaria de +1,9% se
  // dibuja "1,02": el cuadro parecía decir que los sueldos no se mueven. Es la misma razón por la que
  // el factor de 4.2 lleva cuatro, y así las tres columnas del mismo concepto se ven igual.
  const FACTOR = { type: 'NUMBER', pattern: '0.0000;-0.0000;"—"' }
  const HORAS = { type: 'NUMBER', pattern: '#,##0.0;-#,##0.0;"—"' }
  // Las horas por persona y día llevan DOS decimales: son 7,166 y con uno solo se dibujan "7,2", que
  // es el número redondeado presentado como el número. Se usa el mismo patrón en la celda medida
  // (`fHpd`) y en las diez filas que la referencian: la misma cifra no puede verse de dos maneras.
  const HORAS_FINAS = { type: 'NUMBER', pattern: '#,##0.00;-#,##0.00;"—"' }
  // ═══ UNA SOLA GRILLA, UN SOLO JUEGO DE REGLAS DE FORMATO (09/09/2026) ═══
  //
  // El registro y la proyección eran dos tablas con dos anchos y cada una tenía su bloque de reglas,
  // indexado por su propio número de columna. Ahora es una tabla de la primera quincena cerrada a la
  // fila del total proyectado, y cada regla se aplica una vez sobre las dos mitades: no puede quedar
  // una mitad con el formato de un layout que ya no existe.
  //
  // Las columnas se piden POR RÓTULO. `fmt` recibe índices, y un índice escrito a mano es cómo el
  // 29/08 «Aumento $/hora» heredó el PERCENT de la columna «Margen»: $3.174 dibujados «317400,0%»,
  // con el número correcto adentro de la celda y ningún test capaz de verlo.
  const iCol = (rotulo) => colDe(rotulo).charCodeAt(0) - 65
  const seccion1 = (rotulo, formato, hasta = null) =>
    fmt(g.f0 - 1, g.fTotalProy, iCol(rotulo), iCol(hasta ?? rotulo) + 1, formato)
  seccion1('Días', ENTERO, 'Personas')
  seccion1('Horas', HORAS)
  // «Estado» dice "pagada el 18/5", "cerrada · a pagar" o "proyección": es una PALABRA, no plata. En
  // las filas cerradas sale de una FÓRMULA, así que el pase por contenido la saltea —ve un `=`— y sin
  // esta regla se queda con el formato de moneda del barrido general.
  seccion1('Estado', { type: 'TEXT' })
  // Oficina: el ajuste del escalón vive en la B desde el 14/08 y es un coeficiente, no plata. La
  // columna «Personas» —que era la que llevaba ENTERO acá— se fue en el mismo cambio.
  fmt(g.o0 - 1, g.oFin, 1, 2, FACTOR)
  // "Se paga el" es una FECHA, no plata: sin esto el formato moneda de todo el ancho la dibuja "$46.235".
  fmt(g.o0 - 1, g.oFin, 4, 5, { type: 'DATE', pattern: 'dd/mm/yyyy' })
  // Dirección: la fecha de pago de cada mes y la fecha "Desde" de la tabla de personas. Sin esto las
  // dos salen como plata —"$46.242"— que es el serial de la fecha con formato de moneda encima.
  // El "Desde" va desde la PRIMERA fila de personas: ahora cada socio trae la suya, no sólo el total.
  fmt(g.d0 - 1, g.dFin, 4, 5, { type: 'DATE', pattern: 'dd/mm/yyyy' })
  fmt(g.dp0 - 1, g.fTotalMensual, 4, 5, { type: 'DATE', pattern: 'dd/mm/yyyy' })
  fmt(g.d0 - 1, g.dFin, 1, 2, FACTOR)
  // La columna "Estado" de los dos bloques mensuales: una palabra, no plata. La de Oficina la resuelve
  // el pase por contenido —son cadenas literales— pero la de Dirección sale de una FÓRMULA, y una
  // fórmula no se puede clasificar sin evaluarla: sin esto, "pagado" queda con formato de moneda.
  fmt(g.d0 - 1, g.dFin, 3, 4, { type: 'TEXT' })
  fmt(g.o0 - 1, g.oFin, 3, 4, { type: 'TEXT' })
  // (La G ya no es el ajuste: desde el 14/08 es «Adelanto», y es plata — la pinta el barrido general.)
  // ═══ EL TEXTO SE DERRAMABA SOBRE EL NÚMERO DE LA IZQUIERDA (13/08, visto en el PDF) ═══
  //
  // En el PDF publicado, la columna "Estado" de 1.1 mostraba «-16,7%» encima de «ebajo del convenio»:
  // se comía "por d". Y en 1.2, «mes base: factor 1,» y «proyección · últ:» cortados.
  //
  // La causa NO era el ancho. El barrido de moneda pinta TODA la grilla de la B en adelante con
  // `horizontalAlignment: RIGHT`, y una celda de TEXTO alineada a la derecha con OVERFLOW_CELL se
  // derrama hacia la IZQUIERDA — encima del número de al lado, que sí tiene contenido. A la derecha de
  // estas columnas no hay nada hasta la N: alineadas a la izquierda, el texto se lee entero sin tocar
  // el ancho de una sola columna.
  //
  // NO SE DELEGA EN `reparar-textos.mjs`. Ese script existe para lo que ningún generador previó; un
  // generador que deja texto cortado a propósito y espera que otro paso lo arregle es un generador que
  // no es dueño de su pestaña.
  const textoIzq = (r0, r1, c0, c1) => {
    const a = Math.max(0, Math.min(r0, filas.length))
    const b = Math.max(a, Math.min(r1, filas.length))
    if (b <= a) return
    reqs.push({
      repeatCell: {
        range: rg(a, b, c0, c1),
        cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' } },
        fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
      },
    })
  }
  // 1.1 · «Convenio» (la columna del dueño) y «Estado».
  if (g.plantel) {
    textoIzq(g.plantel.fPrimera - 1, g.plantel.fTotal, 4, 5)
    textoIzq(g.plantel.fPrimera - 1, g.plantel.fTotal, 7, 8)
  }
  // 1.2 · «Escalón publicado», «De dónde sale» y «Estado».
  if (g.esc) {
    textoIzq(g.esc.f0 - 1, g.esc.f1, 1, 2)
    textoIzq(g.esc.f0 - 1, g.esc.f1, 6, 8)
  }
  // `cantidades` es la fila de horas por persona y día: el mismo patrón fino que sus diez referencias.
  for (const f of g.cantidades) fmt(f - 1, f, 1, 2, HORAS_FINAS)
  for (const f of g.enteros) fmt(f - 1, f, 1, 2, ENTERO)
  // ── EL BLOQUE DEL MOTOR ──
  // 1.1: personas enteras; el aumento de la hora es PLATA, no un porcentaje.
  //
  // ═══ EL FORMATO SE QUEDÓ CON LA COLUMNA VIEJA Y NADIE LO HABRÍA VISTO (29/08) ═══
  //
  // La columna 6 era «Margen» —un ratio— y este `fmt` la pintaba PERCENT. Con el rehacer del cuadro
  // pasó a ser «Aumento $/hora»: los mismos $3.174 se habrían dibujado «317400,0%» en la pestaña,
  // con el número correcto adentro de la celda. Ningún test de fórmulas puede ver eso —la fórmula
  // está bien— y la corrida no lo imprime: se ve mirando el archivo, o no se ve.
  //
  // Es la razón por la que un cambio de COLUMNAS obliga a revisar el formato aunque las fórmulas
  // estén probadas: el formato está indexado por número de columna y no sabe que cambió de dueño.
  if (g.plantel) {
    fmt(g.plantel.fPrimera - 1, g.plantel.fTotal, 1, 2, ENTERO)
    fmt(g.plantel.fPrimera - 1, g.plantel.fTotal, 6, 7, moneda)
  }
  // 1.2: el mes es una FECHA (sin esto sale "$46.234"), el escalón del mes y el factor son ratios.
  // El factor lleva CUATRO decimales: con dos, un escalón de +0,4% se dibuja "1,00" y el cuadro
  // parece decir que no sube nada.
  if (g.esc) {
    fmt(g.esc.f0 - 1, g.esc.f1, 0, 1, { type: 'DATE', pattern: 'mmm-yy' })
    fmt(g.esc.f0 - 1, g.esc.f1, 3, 4, { type: 'PERCENT', pattern: '0.0%;[Red]-0.0%;"—"' })
    fmt(g.esc.f0 - 1, g.esc.f1, 4, 5, { type: 'NUMBER', pattern: '0.0000;-0.0000;"—"' })
  }
  // ═══ LA NOTACIÓN DEL ESCENARIO: LO PAGADO SE VE DISTINTO DE LO PROYECTADO ═══
  //
  // La regla es la de UNIFY (IBCS, hoy ISO 24896 «Notation for business reporting»): un mismo
  // significado, la misma notación, EN TODA la pestaña.
  //   · LO PAGADO      → negrita, tinta plena. Es un hecho: la plata salió.
  //   · LO PROYECTADO  → itálica y tinta apagada. Es una estimación del motor salarial.
  // El comprometido queda en redonda: es un hecho (el trabajo está hecho) que todavía no salió.
  //
  // NO HAY LEYENDA, Y ES A PROPÓSITO. Los encabezados ya dicen «Pagado» y «Proyectado»; una fila que
  // explique la itálica sería la prosa que el dueño rechazó tres veces.
  const escenario = (r0, r1, c0, c1, { italic = false, bold = false, color = null, size = 10 } = {}) => {
    const a = Math.max(0, Math.min(r0, filas.length))
    const b = Math.max(a, Math.min(r1, filas.length))
    if (b <= a) return
    reqs.push({
      repeatCell: {
        range: rg(a, b, c0, c1),
        cell: { userEnteredFormat: { textFormat: { foregroundColor: color ?? (italic ? MUTED : INK), bold, italic, fontSize: size, fontFamily: 'Arial' } } },
        fields: 'userEnteredFormat.textFormat',
      },
    })
  }
  // ═══ NI CUADRO DE PAGO, NI CONTRASTE, NI CUADRO DEL AÑO (09/09/2026) ═══
  //
  // Acá vivían tres bloques de formato: el del hero («Personas» entera, «Cuándo» fecha, la fila de
  // total en acento y sus dos cifras un cuerpo más), el de estimado-contra-real (cinco tipos en ocho
  // columnas) y el del año (la marca de escenario en sus dos columnas). Los tres cuadros se
  // retiraron de la pestaña, y un formato indexado por número de columna que apunta a un cuadro que
  // ya no existe es la forma exacta de pintar de porcentaje la celda de al lado — el defecto medido
  // el 29/08, cuando «Aumento $/hora» heredó el PERCENT de la columna «Margen» y $3.174 se dibujaban
  // «317400,0%». Se van con su cuadro, en el mismo commit.
  // El calendario es proyección de punta a punta —son las quincenas que FALTAN—: sus cinco columnas de
  // importe van en itálica apagada, Y SU FILA DE TOTAL TAMBIÉN (en negrita, que es lo que la hace
  // total). Lo mismo la columna «Proyectado» de los dos bloques mensuales, y en negrita su columna
  // «Pagado», que es lo que ya salió.
  escenario(g.p0 - 1, g.p0 + g.nProy - 1, iCol('Banco'), iCol('$/hora') + 1, { italic: true })
  escenario(g.fTotalProy - 1, g.fTotalProy, iCol('Banco'), iCol('$/hora') + 1, { italic: true, bold: true, color: INK })
  for (const [r0, r1] of [[g.o0, g.oFin], [g.d0, g.dFin]]) {
    escenario(r0 - 1, r1, 7, 8, { italic: true })
    escenario(r0 - 1, r1, 2, 3, { bold: true })
  }
  // Y en el registro, la columna TOTAL de cada quincena: todo lo que está ahí ya se trabajó.
  escenario(g.f0 - 1, g.fTotalReal - 1, iCol('Total'), iCol('Total') + 1, { bold: true })
  for (const f of g.ratios) fmt(f - 1, f, 1, 2, { type: 'PERCENT', pattern: '0.0%;[Red]-0.0%;"—"' })
  // LOS ENCABEZADOS DE TABLA Y LA NOTA DE VIGENCIA VAN COMO TEXTO. La moneda de arriba pinta toda la
  // grilla; sobre estas cuatro filas —"Hasta", "Personas", "Banco"…, y "CCT 76/75, Zona A"— eso deja
  // texto en una celda de moneda, que con un número del hero más arriba en la misma columna el
  // detector ya no reconoce como encabezado. Se les devuelve el formato de texto al final, después
  // de la moneda. Sólo el numberFormat: la alineación a la derecha, que acompaña a los números de
  // abajo, se conserva.
  // HASTA LA ANTEÚLTIMA COLUMNA, NUNCA HASTA LA ÚLTIMA. «Pagado el» es del dueño y tiene UNA sola
  // regla —fecha, en toda su altura—; cualquier otra que la alcance la pisa, porque se aplican en
  // orden y gana la última. Es el mismo límite que respeta el barrido de moneda.
  for (const f of g.encabezados) {
    reqs.push({
      repeatCell: {
        range: rg(f - 1, f, 1, ANCHO - 1),
        cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
        fields: 'userEnteredFormat.numberFormat',
      },
    })
  }
  return reqs
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
