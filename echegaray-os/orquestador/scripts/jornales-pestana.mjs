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

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { escribirPreservando, VACIO, letraCol } from '../lib/preservar-anotaciones.mjs'
import { conColaMedida, avisoDeCola } from '../lib/cola-de-rango.mjs'
import { columna, aRangoApi, verificarRangos, explicarProblemas } from '../lib/rangos-con-nombre.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { seccion, sub, total as rotuloTotal, auditarPatron, clasificarDefectos } from '../lib/patron-pestana.mjs'
// INK/MUTED/ACENTO: la MISMA paleta que usa la piel. Importarla —y no copiar tres tripletes RGB acá—
// es lo que hace que la notación del escenario (pagado en tinta plena, proyectado apagado) sea el
// mismo gris que el resto del libro y no un segundo gris parecido.
import { skinRequests, INK, MUTED, ACENTO } from '../lib/estilo-statement.mjs'
import { requestsTextoPorContenido } from '../lib/formato-texto-por-contenido.mjs'
// SIN `vaciarColumnaDeProsa` (06/08): esta pestaña NO TIENE columna de prosa — su última columna es
// "Pagado el", la del dueño. Importarla era la invitación a volver a llamarla, que es exactamente la
// 4ª reincidencia del borrado de sus catorce fechas.
import { borrarNotas } from '../lib/nota-celda.mjs'
import { detectarQuincenas, filasQuincenas } from '../lib/nomina-sync.mjs'
import {
  CATEGORIAS, CATEGORIA_ANCLA, COL as UOCRA_COL, HOJA as UOCRA_HOJA,
  parsearAcuerdos, escalonDe, escalonVigenteEn, estadoReplica, ultimoEscalon,
} from '../lib/uocra-acuerdos.mjs'
import {
  // `PARAMETRO_MESES_BASE` dejó de importarse el 13/08: su rótulo completo ("Meses hacia atrás para
  // medir el ritmo real de horas") se escribía dentro del aviso de "sin quincenas cerradas" y eran 114
  // caracteres en una celda del medio. El parámetro sigue creándose por `PARAMETROS_MOTOR`.
  PARAMETROS_MOTOR, RANGO_MESES_BASE,
  ultimaQuincenaCerrada, categoriasDelBloque, personasDelBloque,
  mesesDelMotor, filasPlantel, filasEscalon, expresionMasaDeLaQuincena,
  formulaFactorDelMes,
  formulaHorasPorPersona, lineaEstadoReplica, formulaConvenioPendiente, factorUocraEntre,
  formulaSigmaConAumento, lineaSupuestoAumento, sigmaConAumentoDelPlantel,
} from '../lib/motor-salarial.mjs'
import {
  COLS_CALENDARIO, colCalendario, diasLaborables, expresionDias,
  formulaVentana, formulaControlCalendario,
  formulaShareAdelanto, MIN_QUINCENAS_SHARE,
  formulaBajaNoRegistrada, LINEA_SABADOS, LINEA_HABERES_SIN_QUINCENA,
} from '../lib/jornales-calendario.mjs'
// CÓMO SE PAGA LA QUINCENA: el acuerdo 50/50 del dueño, por grupo de empleados, y los tres avisos que
// condicionan su lectura. Toda la aritmética vive en la lib y se prueba con números, no con strings.
import {
  filasDePersonas, avisoBancoCalculado, avisoHorasIncompletas, avisoEfectivoNegativo,
  canalesProyectados,
} from '../lib/jornales-reparto-pago.mjs'
// ESTIMADO CONTRA REAL. El estimado sale del cuadro de arriba (o sea, de JORNALES); el real, del
// extracto replicado en `_BANCO_RAW`. Toda la aritmética y las fórmulas viven en la lib y se prueban
// con números — acá sólo se eligen las celdas que se citan.
import {
  COLS_CONTRASTE, colContraste, EFECTIVO_SIN_FUENTE, TOTAL_INFERIDO,
  formulaRealBanco, formulaMovimientos, formulaFechaDelLote, formulaOrigenDelReal,
  formulaTotalInferido, formulaDiferencia, formulaDelta, formulaAvisoUmbral,
  formulaSubtituloContraste, expresionCierreDeQuincena,
} from '../lib/jornales-real-vs-estimado.mjs'
// Lo que se dibuja donde un dato no se puede afirmar. Mismo glifo que el resto de la pestaña usa para
// "no hay dato": un cero ahí se leería como "no hay nadie", que es otra cosa.
//
// DEJÓ DE USARSE PARA EL CANAL DE DIRECCIÓN EL 14/08 (ver `DIRECCION_POR_BANCO`): ahí no faltaba el
// dato, faltaba aplicar la regla que el dueño ya había dado. Sigue vivo para el plantel, que es el
// único lugar de este cuadro donde puede no haber nada que contar.
const SIN_DATO = '—'
// EL PISO DEL CONVENIO: contra qué categoría se mide cada persona y si la proyección lo cubre.
import {
  formulaControlAumento, bloqueDelPlantel, rotuloDelPlantel, GAP_JORNADA,
} from '../lib/jornales-piso-uocra.mjs'
import {
  HORAS_LUNES_A_JUEVES, HORAS_VIERNES, HORAS_SABADO_SUPUESTO,
  HORAS_SEMANA_DECLARADA, HORAS_SEMANA_CON_SABADO, expresionHorasDeJornada,
} from '../lib/jornada-uocra.mjs'
import {
  LINEA_DRIVER_OFICINA, estadoOficinaDelMes, formulaProyectadoOficina, origenDelEscalon, periodoDe,
} from '../lib/oficina-escalon.mjs'
import {
  VERIFICADA_EL, VIGENCIA_HASTA, contrastarEscala, tramoDe, convenioDe, claveDeCategoria, ESCALA_VERIFICADA,
} from '../lib/uocra-paritaria.mjs'
// EL COSTO DE ECHAR A CADA UNO (sección 6). El régimen —Ley 22.250, sin indemnización por
// antigüedad ni preaviso— y cada artículo citado viven en `lib/desvinculacion-22250.mjs`; leer el
// plantel del año del espejo, en `lib/desvinculacion-plantel.mjs`. Acá sólo se lo enchufa.
import { plantelDelEspejo, separarPlantel } from '../lib/desvinculacion-plantel.mjs'
import { bloqueDesvinculacion } from '../lib/desvinculacion-bloque.mjs'
// El otro lado del MAX de 1.3: la demanda de las obras vendidas. Toda la lógica vive en la lib.
import { claveQuincena, formulaProyectadoQuincena, glosaDemanda } from '../lib/jornales-demanda-obras.mjs'
import { demandaParaJornales } from '../lib/jornales-demanda-fuente.mjs'
import { registrarSincronizacion } from '../lib/registrar-sincronizacion.mjs'
import { JORNALES_FILE_ID } from '../lib/espejo-jornales.mjs'
import { formulaUltimaFechaConImporte, rotuloAlDia } from '../lib/fecha-de-frescura.mjs'
import { formulaSePagaEl, expresionPagoDelMes, PARAMETROS } from '../lib/jornales-fecha-pago.mjs'
import {
  NOMBRES_DIRECCION, formulaRetiroMensual, formulaPrimerRetiro, expresionMesBaseRetiro,
  formulaPrimerRetiroDe, formulaPagadoMes, formulaSePagaElDireccion, formulaProyectadoMes,
} from '../lib/direccion-retiros.mjs'
import { ALERTA } from '../lib/glifos.mjs'

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
// CATORCE COLUMNAS DESDE EL 31/07: la última es "Pagado el", donde el dueño marca cuándo salió la
// plata de verdad. Si este número no acompaña a la fila del registro, la columna nueva queda fuera del
// footprint del generador y lo que haya debajo no se limpia nunca.
// SE EXPORTA para que la entrada de esta pestaña en `formato-pestanas.PESTANAS` no pueda volver a
// quedarse corta: el auditor de pantalla recorre esa lista y con `cols: 13` no miraba la N durante dos
// semanas. Un número declarado dos veces se separa sin dar error; atado por el test, no.
export const ANCHO = 14
/**
 * El ancho de la columna D, la del ESTADO de cada fila. Va aparte de los 112px del resto porque su
 * contenido es una frase, no un número: el peor caso medido en la pestaña viva es
 * "proyección · ▲ firmado hasta 08/2026" (36 caracteres ⇒ 206px). Con 215 entra el peor caso y sobra
 * lo mínimo — y con el texto entrando, `reparar-textos.mjs` no tiene defecto que arreglar y no le
 * disputa el ancho a este generador.
 */
const ANCHO_ESTADO = 215
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
// once columnas que produce nomina-sync, y ya rompió el registro una vez (la columna "Se paga el" se
// emitió dos veces y desplazó todo). En este layout el TOTAL es la K, no la J.
const REGISTRO_COLS = ['Quincena', 'Hasta', 'Se paga el', 'Días hábiles', 'Personas', 'Hs previstas', 'Hs reales', 'Banco', 'Adelanto', 'Total recibo', 'TOTAL', 'Σ $/hora', 'Estado', 'Pagado el']

/**
 * EL CUADRO QUE ABRE LA PESTAÑA: LA QUINCENA QUE SE PAGA, PERSONA POR PERSONA.
 *
 * ═══ QUÉ SE FUE Y POR QUÉ (14/08, quinta vez que el dueño pide lo mismo) ═══
 *
 * El hero anterior era `Nómina · Falta pagar · Comprometido · Proyectado · Ya pagado · Total año ·
 * Próximo pago · Cuándo`. El dueño: *"el cuadro principal de CUANTO HAY QUE PAGAR mezcla conceptos
 * proyectados ya pagados, proximos cuando, es un desastre q no se entiende"*. Los cuatro defectos,
 * medidos:
 *
 *  1. TRES VENTANAS DE TIEMPO EN LA MISMA FILA. Pasado (`Ya pagado`), presente (`Comprometido`,
 *     `Próximo pago`, `Cuándo`) y futuro (`Proyectado`, `Total año`). La regla de negocio del archivo
 *     prohíbe mezclar ventanas incompatibles y acá había tres en un renglón.
 *  2. CINCO ESCENARIOS EN SIETE COLUMNAS. Con la notación de IBCS —AC real, PL plan, FC pronóstico—
 *     el cuadro publicaba AC + AC + FC + (AC+FC) + AC. El estándar corta en TRES, cuatro como máximo,
 *     porque arriba de eso se pierde la comprensibilidad. No es una cuestión de gusto: es la razón
 *     medible de por qué "no se entiende".
 *  3. COLUMNAS QUE SON LA SUMA DE OTRAS. `Falta pagar` = Comprometido + Proyectado y `Total año` =
 *     Falta pagar + Ya pagado. Ninguna de las dos decide nada que las partes no decidan.
 *  4. DOS NOMBRES PARA EL MISMO PESO. `Comprometido` y `Próximo pago` publicaban los dos $6.542.800
 *     en la fila de Obreros.
 *
 * Y sobre todo: NO CONTESTABA LA PREGUNTA. *"no se exactamente cuanto tengo q pagar a los obreros por
 * banco y cuanto por efectivo"*. Ese dato no estaba en ninguna de las siete columnas.
 *
 * ═══ LO QUE HAY AHORA ═══
 *
 * Un solo escenario (AC) y el orden del payroll register: identificación → horas → tarifa → total →
 * deducción → neto, y recién DESPUÉS la instrucción de pago. La división banco/efectivo no es parte de
 * la liquidación —el recibo muestra el neto completo se pague en una cuenta o en cinco—: es cómo sale
 * la plata, y por eso son las dos últimas columnas y no están revueltas con las primeras.
 *
 * DOS IDENTIDADES CIERRAN EL CUADRO, Y ES LO QUE LO HACE AUDITABLE DE UN VISTAZO:
 *     TOTAL − Adelanto entregado = Neto a pagar
 *     Por banco  + En efectivo   = Neto a pagar
 */
// POR GRUPO DE EMPLEADOS, NO POR PERSONA. El 14/08 se publicó una fila por obrero y el dueño lo
// rechazó en el acto: "no quiero eso q hiciste de traer los obreros en jornales por quincena, te pedi
// exactamente lo q necesitaba". Lo que necesita son DOS NÚMEROS —cuánto sale por banco y cuánto en
// billetes— por nómina. La lista de quince personas no cambia ninguna decisión que esos dos totales
// no resuelvan, y arriba de todo tapaba el cuadro que sí decide.
// OCHO COLUMNAS, como el resto de la pestaña: dos grillas de ancho distinto en el mismo tab es el
// defecto de patrón que el auditor ya rechazó una vez. «Personas» es la que completa el ancho y no
// es relleno — dice sobre cuánta gente se reparte cada total.
export const COLS_PAGO = ['Nómina', 'Personas', 'Cuándo', 'TOTAL', 'Adelanto entregado', 'Neto a pagar', 'Por banco', 'En efectivo']
/**
 * EL SEGUNDO CUADRO: EL AÑO. Un solo escenario por columna y nada más.
 *
 * `Falta pagar`, `Comprometido` y `Total año` no están y no vuelven: son sumas de las otras dos y
 * ninguna decide nada. Los rótulos van cortos —«Proyectado», «Ya pagado»— porque el título del bloque
 * ya dice que se trata del año; un encabezado de 22 caracteres se derrama sobre la columna de al lado.
 *
 * VA DEBAJO DEL CUADRO DE PAGO Y SEPARADO: es la otra ventana de tiempo, y mezclarlas fue el defecto.
 */
export const COLS_ANIO = ['Nómina', 'Proyectado', 'Ya pagado']
/** El ancho del hero: ocho columnas, el mismo que el calendario y los dos bloques mensuales. */
const ANCHO_HERO = COLS_PAGO.length
/**
 * Dónde cae cada columna del cuadro del año dentro del ancho del hero (0-based).
 *
 * A la DERECHA del todo, no en la B y la C: un encabezado de tres columnas en una pestaña de ocho es
 * un segundo ancho de grilla —lo que `auditarPatron` marca como `anchos-mezclados` y el dueño ve
 * corrido—. Pegados al borde derecho caen bajo «Por banco» y «En efectivo», que es donde el ojo ya
 * está después de leer el cuadro de arriba.
 */
export const COL_ANIO = [0, ANCHO_HERO - 2, ANCHO_HERO - 1]

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
const TODOS_LOS_PARAMETROS = (escalones = []) => [...PARAMETROS, ...PARAMETROS_MOTOR(escalones)]
/** Sereno se paga por MES: no entra en la comparación por hora. */
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
 * @param {any[][]} grid   el espejo completo
 * @param {{inicio:number, fin:number, filaFecha:number}} bloque
 * @param {number} anio
 * @returns {Date|null} el último día con horas de al menos una persona
 */
export function ultimoDiaConHoras(grid = [], bloque, anio = AÑO) {
  if (!bloque) return null
  const fechas = grid[bloque.filaFecha - 1] ?? []
  let mejor = null
  // F..U son las columnas de días del bloque. El mismo rango que usa el cuadro para contarlos.
  for (let col = 5; col <= 20; col++) {
    const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(fechas[col] ?? '').trim())
    if (!m) continue
    let alguienTrabajó = false
    for (let r = bloque.inicio; r <= bloque.fin && !alguienTrabajó; r++) {
      const v = Number(String((grid[r - 1] ?? [])[col] ?? '').replace(',', '.'))
      if (Number.isFinite(v) && v > 0) alguienTrabajó = true
    }
    if (!alguienTrabajó) continue
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
  // LAS FILAS DEL ESPEJO QUE SON PERSONAS en la quincena que se está pagando. Se resuelven en `main()`
  // (`filasDePersonas`) porque hace falta la grilla del espejo para saber cuáles tienen nombre, y acá
  // sólo llegan los bloques. Vacío = el cuadro de pago lo dice en vez de emitir renglones fantasma.
  personasPago = [],
  // EL PLANTEL DEL AÑO, ya separado en quien sigue y quien se fue. Se resuelve en `main()` porque
  // necesita el espejo entero y acá sólo llegan los bloques — la misma razón que `personasPago`.
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

  // ── El encabezado de la pestaña ──
  push(['Jornales por quincena'])
  // EL SUBTÍTULO ENTRA EN UN RENGLÓN. El anterior medía 190 caracteres, se envolvía en una fila de
  // 21px y se leía la mitad: un subtítulo cortado es peor que ninguno.
  // LA FECHA DEL SUBTÍTULO SALE DEL REGISTRO, NO DEL RELOJ (03/08). Era `fecha(new Date())`: decía
  // "al 02/08" porque ese día corrió el script, no porque los jornales llegaran hasta ahí. La
  // fórmula se resuelve más abajo, cuando se conocen las filas del registro — igual que el resto de
  // las referencias de esta grilla.
  const fSubtitulo = push([VACIO])
  blanco()

  // ══ EL HERO: UNA FILA POR GRUPO DE EMPLEADOS, UNA COLUMNA POR ESTADO ══
  //
  // ═══ EL RECLAMO QUE LO TRAJO (13/08, segundo rechazo del diseño) ═══
  //
  // *"no logro entender cuanto tengo q pagar en cada grupo de empleados si ya esta el monto proyectado
  // o es lo real"*. Las dos preguntas de esa frase son DOS DIMENSIONES, y el hero anterior sólo tenía
  // una: cinco filas que partían REAL / COMPROMETIDO / PROYECTADO **sumando los tres grupos**. Para
  // saber cuánto se le paga a la oficina había que bajar sesenta filas hasta la sección 2, y para
  // saber si ese número era un hecho o una estimación, leer la columna «Estado» mes por mes.
  //
  // Un cuadro de dos dimensiones contesta las dos de un vistazo, y es la forma canónica: una fila por
  // POBLACIÓN, una columna por ESCENARIO. Que el escenario tenga columna propia —y no una nota al
  // pie— es la regla UNIFY de IBCS, hoy ISO 24896 «Notation for business reporting» (publicada el
  // 11/06/2026): un mismo significado se muestra siempre con la misma notación, en todo el reporte.
  // Acá esa notación es doble: la COLUMNA dice qué escenario es, y el FORMATO lo repite —lo pagado en
  // negrita, lo proyectado en itálica apagada (ver `requestsDeFormato`)—. Un número no puede leerse
  // como un hecho por accidente.
  //
  // LAS COLUMNAS SUMAN, Y ESO ES LO QUE LAS HACE AUDITABLES:
  //   Falta pagar = Comprometido + Proyectado        Total año = Falta pagar + Ya pagado
  // Es la disciplina de subtotales definidos de IFRS 18 (agregar arriba, desagregar abajo): el número
  // que se decide va primero, sus partes al lado, y ninguna parte queda fuera de la suma.
  //
  // COMPROMETIDO ES SÓLO DE OBRA, Y NO SE INVENTA PARA LOS OTROS DOS. En obra hay una marca que
  // distingue el trabajo hecho y no pagado (la columna «Pagado el» del registro, que carga el dueño).
  // Oficina y Dirección no la tienen: lo que sus bloques llaman «Pagado» es lo que la planilla y
  // Compras registran como salido. Fabricarles un comprometido sería un número sin fuente.
  push(['Cuánto hay que pagar — por grupo de empleados'])
  // EL PERÍODO Y LA FECHA DE CAJA, EN UN RENGLÓN Y POR FÓRMULA: "Obreros · quincena 3/8→15/8 · se paga
  // el 17/8". Sale del registro de abajo (que sale del espejo), nunca de una fecha estampada en la
  // corrida: la pestaña se lee días después de escribirse y una fecha de JavaScript envejece muda.
  const fSubPago = push([VACIO])
  const fPagoCols = push(COLS_PAGO)
  // Las tres nóminas, en el orden en que pesan. La columna «Cuándo» resuelve que no cobren el mismo
  // día: obra cierra por quincena y los otros dos por mes, y esa diferencia se lee en su celda en vez
  // de partir el cuadro en dos.
  const fPago = { obra: push(['Obreros · UOCRA']), oficina: push(['Oficina']), direccion: push(['Dirección']) }
  const fPago0 = fPago.obra
  const fPagoFin = fPago.direccion
  // ═══ LOS DOS NÚMEROS QUE DECIDEN, EN LA FILA QUE REMATA EL CUADRO ═══
  //
  // «Por banco» es cuánto se transfiere y «En efectivo» cuánto hay que sacar en billetes. Son LO
  // ÚNICO que el dueño necesita leer para operar el pago, y por eso la fila de total va entera en
  // acento (ver `requestsDeFormato`) y esas dos celdas en cuerpo mayor.
  //
  // LA COLUMNA «$/hora» NO SE TOTALIZA, Y ES A PROPÓSITO. Sumar tarifas horarias es el error clásico
  // del payroll register: el número existe (es la Σ $/hora del plantel, que el registro publica y la
  // proyección usa) pero en ESTA fila se lee como "la empresa paga $X la hora", que no es una cifra
  // que alguien pueda operar. Las horas SÍ se suman: son las de la quincena y es contra ellas que se
  // mide si falta cargar días.
  // La columna «Cuándo» (C) NO se totaliza: es la única fecha del cuadro y sumar fechas no da nada.
  const fPagoTotal = push([rotuloTotal('LO QUE HAY QUE PAGAR'),
    `=SUM(B${fPago0}:B${fPagoFin})`, VACIO,
    ...['D', 'E', 'F', 'G', 'H'].map((c) => `=SUM(${c}${fPago0}:${c}${fPagoFin})`)])
  // ── LAS TRES COSAS QUE CONDICIONAN LA LECTURA DEL CUADRO, CADA UNA EN UNA LÍNEA Y POR FÓRMULA ──
  //
  // Ninguna es una alerta de incumplimiento: eso es exactamente lo que el dueño rechazó ("no se
  // entiende nada"). Son trazabilidad y se apagan solas cuando dejan de ser ciertas.
  const fAvisoBanco = push([VACIO])
  const fAvisoHoras = push([VACIO])
  const fAvisoNeg = push([VACIO])
  // QUÉ NO ESTÁ ACÁ ADENTRO, DICHO EN LA PESTAÑA. El dueño: "¿está considerando lo que se le debe
  // pagar a la nómina en SAC y vacaciones? ¿eso está en cargas sociales?". No y sí: este cuadro es
  // jornal puro, y el aguinaldo vive en Cargas Sociales §6 (pagado real de Compras y devengado 1/12
  // de la remuneración). Las vacaciones no están en ninguna parte todavía: falta la antigüedad por
  // legajo y una provisión inventada es peor que una ausente, porque se usa.
  //
  // NO SE COPIA EL NÚMERO ACÁ. Un concepto vive en un solo lugar y se referencia — duplicarlo es lo
  // que hace que el mismo dato tenga dos versiones distintas en dos pestañas.
  push([sub('No incluye SAC, vacaciones ni cargas sociales')])
  blanco()

  // ══ ESTIMADO CONTRA REAL: EL CUADRO DE ARRIBA MEDIDO CONTRA UNA FUENTE QUE NO ES LA PLANILLA ══
  //
  // ═══ EL PEDIDO (03/08, textual, y sin ejecutar hasta hoy) ═══
  //
  // *"el valor q me mostras de la quincena es el estimado, quiero ese y el real"*.
  //
  // El cuadro de pago sale de JORNALES de punta a punta: horas × $/hora, más la columna BANCO cuando
  // alguien la carga. Preguntarle a ese cuadro si acertó es preguntarle a la planilla por la planilla.
  // Este bloque compara la MISMA quincena contra el extracto del Santander, que es la única fuente de
  // este pago que no depende de quien lo liquida.
  //
  // VA PEGADO ABAJO DEL CUADRO DE PAGO Y NO ADENTRO. Adentro habría hecho falta una novena columna, y
  // dos anchos de grilla en la misma pestaña es el defecto que el auditor de patrón caza y el dueño ve
  // corrido. Separado, además, no mezcla las dos preguntas: arriba "cuánto hay que pagar", acá "cuánto
  // salió de verdad".
  //
  // LAS TRES FILAS SON TRES NIVELES DE EVIDENCIA, Y LA ÚLTIMA COLUMNA LO DICE EN CADA UNA:
  //   · POR BANCO   → HECHO. El extracto lo prueba, movimiento por movimiento.
  //   · EN EFECTIVO → SIN FUENTE. Nadie registra la entrega de billetes (ver EFECTIVO_SIN_FUENTE).
  //   · EL TOTAL    → INFERIDO del acuerdo 50/50. Se publica declarado como inferencia, nunca como dato.
  // No suman entre sí, y por eso el rótulo del total dice «antes del adelanto»: las dos primeras filas
  // reparten el NETO y la tercera es el TOTAL de la quincena, que es el neto más lo ya adelantado.
  push(['Estimado contra real — la quincena que se está pagando'])
  const fSubReal = push([VACIO])
  const fContrasteCols = push(COLS_CONTRASTE)
  const fContraste = {
    banco: push(['Por banco — el 50% acordado']),
    efectivo: push(['En efectivo — el otro 50%']),
  }
  const fContrasteTotal = push([rotuloTotal('TOTAL DE LA QUINCENA — antes del adelanto')])
  // EL AVISO DEL UMBRAL, EN SU PROPIA LÍNEA Y APAGADO MIENTRAS NO PASE NADA. Se mide sobre la fila del
  // BANCO —la única con prueba— y nunca sobre el total, que es una inferencia: un aviso disparado por
  // una inferencia no es un control, es una opinión con signo de admiración.
  const fAvisoUmbral = push([VACIO])
  blanco()

  // ══ EL AÑO: LA OTRA VENTANA DE TIEMPO, SEPARADA ══
  //
  // Va abajo y aparte del cuadro de pago porque es OTRA pregunta —cuánto falta del año, no cuánto sale
  // hoy— y mezclarlas en el mismo renglón fue el defecto que el dueño rechazó dos veces. Dos columnas
  // y tres filas: lo que falta (FC, itálica apagada) y lo que ya salió (AC, tinta plena).
  //
  // LOS NÚMEROS VAN EN LAS DOS ÚLTIMAS COLUMNAS del ancho del hero, no en la B y la C. Un encabezado
  // de tres columnas en una pestaña de ocho es un segundo ancho de grilla, que es lo que el auditor de
  // patrón caza y el dueño llama "descuadrado". Alineados al borde derecho quedan bajo los dos números
  // que rematan el cuadro de arriba, que es donde el ojo ya está.
  push(['El año — lo que falta y lo que salió'])
  const filaAnio = (celdas) => {
    const r = Array(ANCHO_HERO).fill(VACIO)
    // Sólo se pisa lo que el llamador declara: las filas de rótulo traen una celda y las otras dos
    // tienen que quedar en el CENTINELA. Con `r[c] = celdas[i]` a secas quedaban `undefined`, que la
    // fusión no distingue de "no es mía" y deja vivo lo que hubiera abajo de un layout anterior.
    COL_ANIO.forEach((c, i) => { if (celdas[i] !== undefined) r[c] = celdas[i] })
    return push(r)
  }
  const fAnioCols = filaAnio(COLS_ANIO)
  const fAnio = { obra: filaAnio(['Obreros · UOCRA']), oficina: filaAnio(['Oficina']), direccion: filaAnio(['Dirección']) }
  const fAnioTotal = filaAnio([rotuloTotal('LAS TRES NÓMINAS')])
  blanco()

  // ══ 1 · EL CALENDARIO DE PAGO ══
  //
  // ═══ LO GREMIAL SE FUE DE ACÁ, Y ÉSE ERA EL RECLAMO (13/08) ═══
  //
  // El dueño: *"en el medio hay cuestiones gremiales q confunden"*. Y estaban justo en el medio: entre
  // el hero y este calendario había DIECIOCHO filas de convenio —el estado de la réplica, el tramo de
  // paritaria vigente, el plantel abierto por categoría con su básico, y el escalón mes por mes—. Todo
  // eso es de dónde SALE el número, no cuánto hay que pagar: es el respaldo del cálculo y su lugar es
  // debajo del resultado, no delante. Bajó entero a la sección 4, sin perder una celda.
  //
  // Lo que queda acá arriba son las tres poblaciones y sus fechas de caja, que es la pregunta.
  push([seccion(1, 'El calendario de pago')])
  // La glosa de la demanda: cuándo el proyectado de una quincena no sale del convenio sino del MAX
  // contra la demanda de las obras vendidas. Es del calendario, no del convenio: se queda.
  const gd = glosaDemanda(demanda)
  if (gd) push([sub(gd.replace(/^\s*·\s*/, '').trim())])
  //
  // ═══ LAS TRES NÓMINAS EN UNA SOLA GRILLA (13/08, orden del dueño) ═══
  //
  // *"no se determinar cuanto es lo q proyectado que voy a pagar en las quincena de obreros, mes de
  // administracion y oficina … necesito saber cuanto seria el total de todo lo q resta pagar quincena
  // por quincena si cubrimos el 100% de lo q indica el convenio"*.
  //
  // No se podía, y no era un problema de presentación: obra iba quincena por quincena acá, oficina y
  // dirección mes por mes ochenta filas más abajo, y el único lugar donde los tres se sumaban era una
  // celda del hero. Ahora cada mes de oficina y de dirección cae en la quincena que lo PAGA, por su
  // fecha de caja, y la fila de total contesta la pregunta por población en un renglón.
  //
  // LAS COLUMNAS QUE SE FUERON, Y POR QUÉ. "Personas" y "Horas por persona" repetían doce veces el
  // mismo número —está en 1.1 y en la línea de arriba del cuadro—; "Σ $/hora aplicada" está entera en
  // 1.2 columna F, mes por mes; "Días hábiles" se recalcula de las dos fechas de la propia fila. Son
  // cuatro columnas de andamiaje que ocupaban el lugar de las tres cifras que el dueño necesita leer.
  // El cuadro sigue midiendo ocho columnas: nueve dejarían la pestaña con tres anchos de grilla, que
  // es el defecto que el auditor de patrón caza y el dueño llama "descuadrado".
  // El cuadro tiene una columna por nómina (Obreros · Oficina · Dirección) y una fila por período:
  // "lo que falta, quincena por quincena, las tres nóminas" era el encabezado leído en voz alta.
  //
  // DEJÓ DE SER LA SUB-SECCIÓN 1.3 (13/08): con el motor salarial mudado a la sección 4, este cuadro
  // ES la sección 1. Un "1.3" sin 1.1 ni 1.2 arriba es una jerarquía que no cuelga de nada.
  // ═══ LA FILA QUE PARECÍA UNA QUINCENA DE UN DÍA (13/08) ═══
  //
  // El dueño: *"dice quincena y hasta en la primera fila q sale aparecen la misma fecha"*. Y era
  // cierto: cuando la carga de la planilla llega al día 15 o al último del mes —dos veces por mes— lo
  // que queda del tramo es UN día, y el cuadro publicaba `Quincena 15/08 · Hasta 15/08` bajo un
  // encabezado que prometía una quincena.
  //
  // Se arregla por los dos lados. La columna ya no se llama "Quincena" sino "Período", porque eso es
  // lo que la fila mide; y cuando la primera es un resto se dice acá, una sola vez y sólo cuando pasa.
  // Una glosa fija que se lee todos los días termina siendo invisible el día que importa.
  //
  // Y de 167 caracteres a 45 (13/08). La segunda mitad —"lo ya cargado de esa misma quincena está
  // arriba, en COMPROMETIDO"— nombraba una cifra del hero que ya se llama COMPROMETIDO y está cuatro
  // filas más arriba. La palabra RESTO en mayúscula hace el trabajo entero.
  if (pendientes[0]?.resto) push([sub('La 1ª fila es el RESTO de la quincena en curso')])
  // LO QUE LA PROYECCIÓN NO VE, DICHO DONDE SE LA LEE. Ver LINEA_SABADOS: es una declaración, no un
  // supuesto de cálculo — no entra en ninguna celda de importe.
  push([sub(LINEA_SABADOS)])
  const fHpd = push([sub('Horas por persona y día — medidas')])
  // LA JORNADA VA AL LADO DE LAS HORAS MEDIDAS, NO EN LUGAR DE ELLAS (27/08). Son dos preguntas: con
  // cuántas horas se TRABAJA (medidas, y es lo que va a salir de la caja este mes) y con cuántas se
  // DEBE (la jornada, que es la que fija la obligación proyectada). Una sola cifra contestaba mal las
  // dos: la proyección salía valuada a la asistencia. Puestas una debajo de la otra, la brecha se ve.
  // «jornada» y no «jornada del convenio»: nada gremial va arriba de la sección 4 (orden del dueño,
  // *"en el medio hay cuestiones gremiales q confunden"*), y el cuadro que la usa está acá.
  //
  // ═══ TRES CELDAS Y NO UNA (27/08) ═══
  //
  // Nació con un solo número —8 h parejas— y eso dejaba la proyección 10% corta: la jornada real es
  // 9 h de lunes a jueves y 8 el viernes (regla del dueño), más 4 h el sábado (SUPUESTO, la mejor
  // lectura del espejo). Tres números distintos no caben en una celda, y meterlos como literales
  // adentro de la fórmula haría que el sábado —que es lo único discutible de los tres— sólo se pueda
  // corregir tocando código. Las tres son celdas: el dueño ajusta la que quiera y la proyección se
  // mueve sola. Que la del sábado sea un supuesto lo dice la glosa, en la misma fila.
  const fJornada = push([sub('Horas de jornada — L-J · V · S'),
    HORAS_LUNES_A_JUEVES, HORAS_VIERNES, HORAS_SABADO_SUPUESTO,
    // 45 caracteres es lo que entra sin desparramar la fila (`LARGO_NOTA`). El texto largo vive en
    // `GAP_JORNADA` y sale por el log de la corrida, no por una celda del medio.
    sub(`${HORAS_SEMANA_DECLARADA}h/sem · sábado supuesto`)])
  // ═══ EL SHARE MEDIDO Y LA BRECHA CONTRA EL ACUERDO SE FUERON (14/08) ═══
  //
  // Acá vivían dos líneas: «En efectivo — el resto, por recibo» (el canal REAL medido sobre el
  // registro: 84,2% en efectivo) y «Por banco — contra el acuerdo 50/50 declarado», que publicaba
  // "faltan $39.335.228 por banco · 8 de 14 quincenas con banco en $0".
  //
  // El dueño: *"te he dicho q el acuerdo es 50 y 50 todas las quincenas y asi y todo no se entiende
  // nada"*. Las dos líneas son una AUDITORÍA DE INCUMPLIMIENTO y él no está auditando: está pagando.
  // Peor: el 84,2% medido y el 50% del acuerdo son DOS NÚMEROS PARA EL MISMO CANAL en la misma
  // pestaña, y ésa es la definición del desorden que rechazó. El 50/50 es la regla de pago, se
  // calcula y se opera; el que se cumpla o no es una pregunta de otra pestaña y de otro día.
  //
  // La proyección de billetes de este cuadro pasó a salir de la MISMA regla (ver la columna
  // «Efectivo»): una sola definición del canal en toda la pestaña.
  // ═══ EL ADELANTO, CON SU PROPIO PORCENTAJE PONDERADO (14/08) ═══
  //
  // El dueño, por segunda vez: *"te pedi q los 'adelantos' de los obreros se proyectaran en base a un
  // porcentaje ponderado"*. El adelanto no es el efectivo: sale ANTES del día de pago, a lo largo de
  // la quincena, y por eso tiene su propio ritmo de caja. SE QUEDA cuando el share medido se fue,
  // porque no mide un canal —eso lo fija el acuerdo— sino CUÁNDO sale la plata, que el acuerdo no dice.
  // Se mide con la razón de importes del año (ver `formulaShareAdelanto`) y al lado va lo que eso
  // proyecta a diciembre.
  const fAdel = push([sub('En adelantos — ponderado sobre el total')])
  push(COLS_CALENDARIO)
  const p0 = filas.length + 1
  const pFin = p0 + pendientes.length - 1
  const cO = colCalendario('Oficina')
  const cD = colCalendario('Dirección')
  const cB = colCalendario('Banco')
  const cE = colCalendario('Efectivo')
  const cObra = colCalendario('Obreros')
  pendientes.forEach((q, i) => {
    const r = p0 + i
    const canal = canalesProyectados({ obreros: `${cObra}${r}`, oficina: `${cO}${r}`, direccion: `${cD}${r}` })
    push([
      // La primera arranca el día siguiente al último con HORAS CARGADAS; las demás encadenan. Así la
      // quincena en curso queda partida en su parte real y su parte proyectada, y el mes de transición
      // deja de sumar una quincena a medio cargar MÁS una quincena entera (defecto A8).
      i === 0 ? fecha(q.desde) : `=B${r - 1}+1`,
      // EL CIERRE DE UNA QUINCENA SE DEFINE UNA SOLA VEZ. Esta fórmula estaba escrita acá a mano y el
      // bloque de estimado-contra-real necesitaba la misma: dos copias del mismo criterio en la misma
      // pestaña es cómo un día dicen cosas distintas. Vive en `expresionCierreDeQuincena`.
      `=${expresionCierreDeQuincena(`A${r}`)}`,
      // LA FECHA DE CAJA. Una quincena proyectada nunca tiene lote en el banco, así que acá manda el
      // parámetro — pero la fórmula es la MISMA que en el registro, para que el día que el pago
      // aparezca en el extracto la fila se corrija sola sin que nadie la toque.
      pago(r),
      // Obreros, Oficina y Dirección se resuelven ABAJO. Las tres por la misma razón: sus fórmulas
      // citan filas que todavía no existen —el cuadro del escalón (sección 4) para la de obra, los
      // bloques mensuales (secciones 2 y 3) para las otras dos—. Ninguna se puede escribir acá.
      VACIO, VACIO, VACIO,
      // ═══ LOS DOS CANALES SALEN DEL ACUERDO, NO DE UNA MEDICIÓN (14/08) ═══
      //
      // Era `obra × share_medido + oficina × share_oficina`, con dos porcentajes calculados sobre el
      // histórico (84,2% y otro distinto). El dueño: *"el acuerdo es 50 y 50 todas las quincenas"*.
      // Si el 50/50 es la regla con la que se paga arriba, la plata que hay que juntar acá abajo sale
      // de la MISMA regla: dos definiciones del mismo canal en una pestaña son dos respuestas para una
      // pregunta, que es exactamente lo que hacía que no se entendiera.
      //
      // Y deja de depender de que existan seis quincenas pagadas: se puede calcular el 2 de enero, que
      // es cuando el share medido se caía a vacío y el cuadro publicaba una franja en blanco.
      //
      // LAS DOS MITADES SALEN DE UNA SOLA FUNCIÓN (`canalesProyectados`) y no de dos fórmulas escritas
      // acá: publicar `banco` y `efectivo` por separado es la forma exacta de que un día dejen de
      // sumar el total. Con una función, la identidad es del código, no de la disciplina de quien edita.
      canal.banco, canal.efectivo,
    ])
  })
  // Los huecos internos también son MÍOS: con `''` el generador preservaría la fórmula que el
  // layout anterior tenía en esa misma celda, y quedaría un #VALUE! al lado del total bueno.
  const sumaCol = (c) => `=SUM(${c}${p0}:${c}${pFin})`
  const fTotalProy = push([rotuloTotal('Total a pagar hasta diciembre'), VACIO, VACIO,
    sumaCol(cObra), sumaCol(cO), sumaCol(cD), sumaCol(cB), sumaCol(cE)])
  // EL CONTROL VA DEBAJO DEL MENSAJE, NO ENCIMA. Se completa abajo, cuando existen los dos totales
  // contra los que compara.
  const fControlCal = push([VACIO])
  // ═══ EL CONTROL QUE EL DUEÑO PIDIÓ Y NO EXISTÍA (14/08) ═══
  //
  // *"me aseguras que las proyecciones de aqui a fin de año de obreros se calcularon llegando a cubrir
  // el 100% de lo q pide uocra en cada parte de la escala…?"*. No se podía asegurar: nada en la pestaña
  // miraba esa pregunta. Y la respuesta era que NO —las nueve quincenas salían de la demanda de obras,
  // sin piso de convenio, seis de ellas $28.864.019 por debajo— porque el término del plantel estaba
  // apagado y el `MAX` contra la demanda de obras resolvía siempre por el otro lado, en silencio.
  // (Ese MAX murió el 14/08; el control quedó, porque la pregunta que contesta no era el MAX.)
  //
  // DESDE EL 29/08 LA PREGUNTA ES OTRA Y ES MÁS SIMPLE: ¿a cuánta gente le llega el aumento? Una
  // persona sin categoría es una persona sin aumento, y eso se cuenta.
  //
  // VA ACÁ Y NO EN LA SECCIÓN 4: es un control de ESTE cuadro. El respaldo gremial vive abajo, pero el
  // aviso de que la columna «Obreros» perdió su aumento tiene que estar donde se lee la columna.
  const fControlPiso = push([VACIO])
  blanco()

  // ══ 2 · SUELDOS DE OFICINA ══
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
  push([seccion(2, 'Oficina — sueldos por mes')])
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
  // EL PLANTEL DE OFICINA, PARA EL CUADRO QUE DECIDE EL PAGO. Es el ÚLTIMO bloque cargado —no el
  // último CERRADO, que es `iBaseOfi`—: la pregunta del hero es "sobre cuánta gente se reparte el mes
  // que estoy por pagar", y ésa es la del bloque más reciente aunque venga a medio cargar. Se pasa el
  // rango, no el número: la celda cuenta sobre el espejo vivo y no estampa una dotación.
  const ultimoBloqueOfi = bloquesOfi.length ? bloquesOfi[bloquesOfi.length - 1] : null
  // ═══ LA GLOSA MÁS LARGA DE LA PESTAÑA (243) ERA LA LEYENDA DE UNA COLUMNA (13/08) ═══
  //
  // Explicaba en prosa las tres reglas de completitud, y el cuadro de abajo ya las publica MES POR MES
  // en su columna «Estado»: `pagado` · `parcial` · `proyección`. Esa columna se agregó el 06/08
  // justamente para eso ("ninguna columna muda") y la glosa se quedó repitiéndola en párrafo.
  //
  // Queda la fecha de corte de la fuente, que ninguna celda tiene: sin ella no se distingue un mes en
  // `proyección` porque no se trabajó de uno en `proyección` porque la planilla va atrasada.
  push([sub(ultimoDiaOfi
    ? `Planilla Oficina al ${fecha(ultimoDiaOfi)} — ver «Estado» por mes`
    : 'Planilla Oficina sin meses cargados — todo proyección')])
  // ═══ EL DRIVER Y EL PISO, DICHOS EN LA PESTAÑA (14/08) ═══
  //
  // El dueño: *"el cuadro del grupo oficina como la proyección de obreros"*. Lo que hace rigurosa a la
  // de obreros no es la grilla —ésa es quincenal y la de oficina es mensual, y así se queda— sino que
  // declara de dónde sale su aumento y contra qué piso se mide. Oficina no declaraba ninguna de las
  // dos: multiplicaba por un factor y listo.
  //
  // Y LA RESPUESTA DEL PISO ES QUE NO TIENE. La réplica publica cinco categorías, las cinco de obra:
  // no hay escala de administración en ninguna fuente del OS. Inventarle un piso —el mínimo, o la
  // categoría de obra más baja— sería fabricar un dato. El porqué completo, en lib/oficina-escalon.mjs.
  push([sub(LINEA_DRIVER_OFICINA)])
  // LAS DOS LÍNEAS DE CANAL DE OFICINA SE FUERON CON LAS DE OBRA (14/08), por la misma razón y en el
  // mismo movimiento: el acuerdo es el mismo 50/50, así que medir el histórico y publicar la brecha
  // pone dos números para un canal que ya está decidido. El bloque conserva su columna «Banco», que es
  // el HECHO que la planilla registra y que CAJA consume por `OFICINA_BANCO`; lo que no vuelve es el
  // porcentaje derivado ni el "faltan $X por banco".
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
  const fTotalOfi = push([rotuloTotal('Oficina — pagado y por pagar en el año'), VACIO,
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

  // ══ 3 · LOS RETIROS DE DIRECCIÓN ══
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
  push([seccion(3, 'Dirección — retiros mensuales de los socios')])
  // ═══ DOS GLOSAS DE 149 Y 142 CARACTERES, UNA SOLA DE 42 (13/08) ═══
  //
  // La primera decía la fuente y después describía la columna «Desde», que está una fila más abajo con
  // su fecha adentro. La segunda —"«Pagado» son las filas de Compras ya marcadas como pagadas…"— se
  // fue entera: era la definición en prosa de las columnas «Pagado», «Proyectado» y «Estado», que
  // están dos filas más abajo y ya dicen `pagado` o `proyección` en cada fila.
  push([sub('Fuente: Compras — última carga de cada socio')])
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
  const fTotalDir = push([rotuloTotal('Dirección — pagado y por pagar en el año'), VACIO,
    `=SUM(C$${d0}:C$${dFin})`, VACIO, VACIO, VACIO, VACIO, `=SUM(H$${d0}:H$${dFin})`])
  // Los rangos DIRECCION_PAGO · DIRECCION_PAGADO · DIRECCION_PROYECTADO ya no se anuncian en la
  // pestaña, por lo mismo que los de Oficina (ver el comentario del total de la sección 2).
  blanco()

  // ══ 4 · CONVENIO UOCRA — DE DÓNDE SALE EL AUMENTO ══
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
  push([seccion(4, 'Convenio UOCRA — de dónde sale el aumento')])
  push([lineaEstadoReplica(escalones, hoy)])
  // EL SUPUESTO, DICHO CON EL DATO QUE LO RESPALDA Y SIN UN SOLO MES ESCRITO A MANO. El rótulo del
  // acuerdo sale de la réplica ya parseada: el día que se pegue un acuerdo nuevo, esta línea cambia
  // sola. Un mes escrito en el código envejece el día siguiente y nadie se entera.
  //
  // Queda lo único que el cuadro no dice: cuál es el índice y hasta cuándo hay acuerdo. Que los TRES
  // grupos usan el mismo lo prueba la columna «Ajuste escalón», que es idéntica en 2 y en 3.
  // `VIGENCIA_HASTA` es una constante escrita a mano y `ultAc.rotulo` es lo que el parser leyó del
  // acuerdo publicado: las dos van juntas para que la fecha nunca quede estampada sin nada vivo al lado.
  const ultAc = ultimoEscalon(escalones)
  push([sub(`Paritaria UOCRA${ultAc ? ` · ${ultAc.rotulo} hasta ${VIGENCIA_HASTA}` : ''}`)])

  // ── 4.1 · EL PLANTEL DEL PISO ──
  // "abierta por categoría" era el índice del cuadro: sus filas SON las categorías. De qué quincena
  // sale el plantel se queda porque es el criterio de qué dato se está mirando, y no está en ninguna
  // celda — pero lo decide `bloqueDelPlantel`, no una cadena escrita a mano que el 27/08 decía "última
  // quincena cerrada" sobre un cuadro que ya no era ése.
  push([seccion('4.1', rotuloDelPlantel(origenPlantel))])
  // LO QUE FALTA PARA QUE EL CONTROL HABLE, UNA SOLA VEZ Y CONTADO. Estaba una vez por fila, adentro
  // de la columna "Estado": cuatro renglones idénticos pidiendo lo mismo. Se resuelve más abajo,
  // cuando se conocen las filas de las categorías.
  const fConvenio = push([VACIO])
  const plantel = filasPlantel({
    hoja: ESPEJO, bloque: bloqueBase, categorias, personas: personasBase,
    filaInicio: filas.length + 1, escalonVigente, rotulo: rotuloDelPlantel(origenPlantel),
  })
  for (const f of plantel.filas) push(f)
  filas[fConvenio - 1][0] = formulaConvenioPendiente(plantel.fPrimera, plantel.fUltima, plantel.equivalencias)
  const fPlantel = plantel.fTotal
  // ═══ LA BAJA QUE LA PLANILLA TODAVÍA NO REGISTRÓ (13/08) ═══
  //
  // El plantel base es la última quincena CERRADA —y tiene que serlo: la en curso está a medio
  // cargar—. El costo de eso es que una persona que se fue DESPUÉS de esa quincena se sigue
  // proyectando hasta diciembre. Pasó con la liquidación final de Navarro. La fila se llena abajo,
  // cuando existen el registro y el total del calendario.
  const fBaja = push([VACIO])
  blanco()

  // ── 4.2 · EL ESCALÓN, MES POR MES ──
  // "de dónde sale cada aumento" es literalmente el nombre de una de las columnas del cuadro
  // («De dónde sale»): el título anunciaba una columna que está a dos filas de distancia.
  push([seccion('4.2', 'El escalón del convenio, mes por mes')])
  // LA BASE DE LA PROYECCIÓN ES «LO DE HOY + EL AUMENTO», NO EL CONVENIO (29/08, orden del dueño:
  // *"del convenio sacar el 50% por categoria y eso es lo q le vamos a aumentar a cada empleado sobre
  // lo q cobran por hr hoy"*). Sale de DOS celdas del total del bloque de arriba —Σ de lo que se paga
  // hoy y Σ del aumento—, las dos fórmulas vivas: un alta, una baja o un cambio de categoría la mueven
  // sin tocar una celda. Por qué y quién lo hereda, en lib/proyeccion-convenio.mjs.
  const sigmaConAumento = escalonVigente
    ? formulaSigmaConAumento(plantel.fPrimera, plantel.fUltima, fPlantel) : null
  // LA LÍNEA LA DECIDE EL CUADRO, NO LA INTENCIÓN. Se reserva la fila y se llena DESPUÉS de armar el
  // escalón, cuando `esc.conAumento` dice qué base quedó de verdad: tener la escala a mano no alcanza
  // —si el mes del escalón no está en el cuadro no hay dónde anclar y el motor cae a la tarifa de hoy—.
  // Una línea que anuncia el aumento arriba de un cuadro que no lo aplicó es peor que no tenerla.
  const fSupuesto = push([VACIO])
  // La celda de la Σ $/hora PACTADA del plantel base es la COLUMNA C de la fila de total de 4.1 — no la
  // B, que es la cantidad de personas. Se pasa la celda entera y no el número de fila justamente para
  // que la letra no se pueda perder por el camino. Viaja igual: es el respaldo para cuando la réplica
  // del convenio no traiga escala, y en ese caso la línea de arriba lo declara en la pestaña.
  const esc = filasEscalon({
    meses, escalones, filaInicio: filas.length + 1, celdaSigmaBase: `$C$${fPlantel}`, periodoBase,
    celdaSigmaConAumento: sigmaConAumento, periodoConAumento: escalonVigente?.periodo ?? null,
  })
  filas[fSupuesto - 1][0] = lineaSupuestoAumento({
    sigma: esc.conAumento ? sigmaConAumento : null, celdaPersonas: `$B$${fPlantel}`,
  })
  for (const f of esc.filas) push(f)
  blanco()

  // ── 4.3 · EL CONTROL DE PISO ──
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
  push([seccion('4.3', 'Control de piso — ningún jornal por debajo')])
  const estado = estadoReplica(escalones, hoy)
  // EL CONVENIO VA CON SU VIGENCIA, NO FLOTANDO SEIS COLUMNAS A LA DERECHA. "CCT 76/75, Zona A (San
  // Juan)" vivía en la columna G, sin nada alrededor: un rótulo suelto en el medio de la grilla que
  // el ojo no puede asociar a nada. Es la ficha de la escala que esta línea está declarando vigente,
  // así que va en la misma línea. La A derrama sobre las celdas vacías de su derecha.
  // "(San Juan)" se cayó del rótulo: Zona A ES San Juan en el CCT 76/75, y la empresa no opera en otra
  // zona. La ficha completa vive en lib/uocra-paritaria.mjs, que es quien la verifica.
  const fVig = push([`${estado.mensaje} · CCT 76/75 Zona A`])
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
  const desvios = contrastarEscala(escalones)
  if (desvios.length) {
    push([sub(`${ALERTA} Réplica ≠ escala verificada en ${desvios.length} categoría(s)`)])
    for (const d of desvios) console.warn(`  ⚠ escala verificada el ${VERIFICADA_EL}: ${d}`)
  }
  // El jornal más bajo sale del bloque BASE (la última quincena cerrada), no del último bloque del
  // espejo: una quincena a medio cargar puede no tener todavía a toda la cuadrilla.
  const rangoW = bloqueBase ? `'${ESPEJO}'!$W$${bloqueBase.inicio}:$W$${bloqueBase.fin}` : null
  const fMin = push([
    rotuloTotal('El jornal por hora más bajo que pagamos'),
    rangoW ? `=IFERROR(MINIFS(${rangoW};${rangoW};">0");"")` : '',
  ])
  /** La celda del básico de una categoría en un escalón ya resuelto. Vacío si ese mes no existe. */
  const basicoDe = (e, cat) => {
    const f = e?.categorias?.[cat]?.fila
    return f ? `=IFERROR(INDEX('${UOCRA_HOJA}'!$${UOCRA_COL.basico}$1:$${UOCRA_COL.basico};${f});"")` : ''
  }
  const fPiso = push([sub(`Básico de ${CATEGORIA_ANCLA} — el piso del convenio`), basicoDe(escalonVigente, CATEGORIA_ANCLA)])
  const fMargen = push([sub('Margen sobre el piso — negativo = deuda laboral'), `=IF(N(B${fPiso})=0;"";B${fMin}/B${fPiso}-1)`])
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
  push([sub(proximo
    ? `El escalón que viene — ${proximo.rotulo}${proximo.acuerdo ? ` · ${proximo.acuerdo}` : ''}`
    : `${ALERTA} El escalón que viene — sin acuerdo publicado`)])
  // ═══ SIN ACUERDO PUBLICADO NO SE EMITEN LAS DOS FILAS (06/08) ═══
  //
  // Se emitían siempre, y sin acuerdo quedaban las dos vacías: "Básico de Ayudante desde ese mes" y
  // "Margen contra ese piso" con nada al lado, debajo de una línea que ya había explicado por qué. Dos
  // rótulos sin cifra se leen como un cuadro roto, no como una ausencia declarada — y la ausencia ya
  // estaba declarada arriba, en una oración. Un renglón vacío no agrega información: la diluye.
  let fMargenProx = 0
  if (proximo) {
    const fPisoProx = push([sub(`Básico de ${CATEGORIA_ANCLA} desde ese mes`), basicoDe(proximo, CATEGORIA_ANCLA)])
    fMargenProx = push([sub('Margen contra ese piso — lo que falta corregir'), `=IF(N(B${fPisoProx})=0;"";B${fMin}/B${fPisoProx}-1)`])
  }
  // LA ESCALA DEL CONVENIO, TODA EN LA MISMA UNIDAD QUE LO QUE PAGAMOS: $/hora. Antes cada categoría
  // traía además su jornal diario (= básico × 8), y ese 8 era el único número PEGADO de la pestaña:
  // una "Jornada del convenio (horas)" escrita a mano que ninguna otra celda leía y que sólo servía
  // para una columna decorativa. Mezclar $/hora (el control de arriba) con $/día (la columna) en el
  // mismo bloque es exactamente el defecto de unidad que arruina una planilla financiera.
  push([sub('Escala del convenio, por hora:')])
  for (const cat of CATEGORIAS) {
    push(ES_MENSUAL(cat)
      ? [sub(`${cat} — se paga por mes`), basicoDe(escalonVigente, cat)]
      : [sub(cat), basicoDe(escalonVigente, cat)])
  }
  blanco()

  // ── 5 · EL REGISTRO ──
  push([seccion(5, 'Obra — el registro, quincena por quincena')])
  // LA GLOSA DE LA COLUMNA NUEVA, EN LA PESTAÑA Y NO SÓLO EN EL CÓDIGO. Quien abre la planilla tiene
  // que poder saber de dónde salió esa fecha y que puede cambiarla, sin preguntarle a nadie.
  // ═══ DOS RENGLONES DE MANUAL (86 Y 149), UNO SOLO Y CORTO (13/08) ═══
  //
  // El de «Se paga el» se fue entero: de dónde sale la fecha prevista es mecánica del generador, y que
  // se puede pisar a mano lo prueba el comportamiento —`esFechaAMano` respeta lo escrito—. Del de
  // «Pagado el» queda el EFECTO, lo único que ningún encabezado puede decir.
  //
  // NO SE RENOMBRARON LOS ENCABEZADOS PARA ABSORBER LA INSTRUCCIÓN («Pagado el (tuya)» era la salida
  // elegante). `copiarPagadoEl` ancla la copia de las fechas del dueño buscando el TEXTO LITERAL
  // "Pagado el" en la pestaña viva: con el rótulo cambiado el ancla falla en la primera corrida y cae
  // al reparto por número de fila, que es como se desalinean las fechas de una columna que el
  // generador no escribe. Menos texto no vale una fecha de pago movida de lugar.
  push([sub('«Pagado el»: la fecha pasa la quincena a REAL')])
  // ═══ POR QUÉ CANAL SALIÓ CADA PESO — BAJÓ ACÁ, QUE ES DONDE VIVEN SUS COLUMNAS (06/08) ═══
  //
  // Estaban en el hero, tres líneas de detalle entre las cifras que se leen de un vistazo. Son tres
  // formas distintas de que la plata salga y cada una descuenta de un lugar distinto de CAJA —el
  // banco del saldo bancario, el adelanto y el recibo del efectivo— así que su lugar es al lado del
  // registro que las produce. El CONTROL viaja con ellas: si las tres no suman lo pagado, falta
  // registrar cómo salió una quincena, y eso hoy está en alarma por $268.531.
  const fCanal = {
    banco: push([sub('De lo pagado — por banco')]),
    adelanto: push([sub('De lo pagado — en adelantos')]),
    recibo: push([sub('De lo pagado — contra recibo')]),
  }
  // ═══ EL PAGO QUE NO ES UNA QUINCENA TIENE DÓNDE CAER — PERO NO ACÁ (13/08) ═══
  //
  // La liquidación final de Navarro ($239.790,94, 13/08) no es una quincena y no entra en el registro.
  // Sin decir nada, la caja paga algo que esta pestaña no explica. Se nombra la capacidad que sí lo
  // contesta en vez de recalcularlo en una celda: `haberes-conciliacion` empareja pago por pago contra
  // el extracto, y dos definiciones del mismo concepto darían dos números para una sola pregunta.
  push([sub(LINEA_HABERES_SIN_QUINCENA)])
  // "Pagado el" VA AL FINAL, no intercalada. Insertarla al lado de "Se paga el" correría los índices de
  // las once columnas que produce nomina-sync, y eso ya rompió el registro una vez hoy (la columna "Se
  // paga el" se emitió dos veces y desplazó todo). Al final es segura; si el dueño la quiere en otro
  // lugar la mueve y su edición manda.
  push(REGISTRO_COLS)
  const f0 = filas.length + 1
  // LA COLUMNA QUE FALTABA. Sin ella la última fila se lee igual que las trece de arriba —cerrada y
  // pagada— cuando en realidad la quincena está a mitad de camino. Es una fórmula con TODAY(): se da
  // vuelta sola el día que la quincena termina.
  filasQuincenas(bloques, f0, ESPEJO).forEach((fila, i) => {
    const r = f0 + i
    // Las once columnas que ya calculaba el lector de quincenas, MÁS la fecha de pago intercalada
    // después de Hasta y el estado al final. Recortar dejaba afuera la Σ $/hora, que es de donde la
    // proyección saca su base: sin ella esa columna pasaba a ser texto y toda la proyección daba
    // #VALUE!.
    const [colA, colB, ...resto] = fila.map((c) => c.f)
    // EL ESTADO DISTINGUE LAS TRES COSAS QUE ANTES ERAN UNA. Cerrada no es pagada: la quincena que
    // cerró el 31/07 se paga el 03/08. Y "Pagado el" (N) es un hecho que gana sobre cualquier previsión.
    // ═══ "Pagado el" NO SE ESCRIBE. NUNCA. ES LA CELDA DEL DUEÑO ═══
    //
    // La primera versión emitía VACIO en esa columna —el centinela que significa "es mía y va vacía"— y
    // la fusión hizo exactamente lo que le pedí: BORRÓ LAS 14 FECHAS que el dueño acababa de cargar a
    // mano. Es la violación de su regla de oro y fue mía. Se restauraron desde el snapshot,
    // emparejando por la fecha de cierre de cada quincena (el registro se había corrido tres filas, así
    // que restaurar por posición le habría puesto a cada una la fecha de otra).
    //
    // La fila se emite SIN la celda 14: una fila más corta deja esa columna fuera del footprint del
    // generador, y `fusionar` preserva lo que haya. Es el mismo trato que la columna de Comentarios en
    // Proveedores: si la escribe una persona, el generador no la toca ni para vaciarla.
    push([colA, colB, pago(r), ...resto,
      `=IF(N(B${r})=0;"";IF(N(N${r})>0;"pagada el "&TEXT(N${r};"d/m");IF(B${r}<=TODAY();"cerrada · a pagar";"en curso")))`])
  })
  const fLast = f0 + bloques.length - 1
  const fTotalReal = push([
    rotuloTotal('Total pagado en el año'), ...Array(6).fill(VACIO),
    // Se cierra contra la fila de ARRIBA, no contra un número de fila escrito a mano: así una fila
    // insertada nunca puede quedar afuera del total. Es el techo de 14 quincenas, arreglado de raíz.
    ...['H', 'I', 'J', 'K'].map((c) => `=SUM(${c}$${f0}:INDEX(${c}:${c};ROW()-1))`),
  ])

  // ── Las referencias que no se podían escribir antes de conocer las filas ──
  const cel = (f, c) => `$${c}$${f}`
  // ═══ HORAS POR PERSONA Y POR DÍA: MEDIDAS, Y EN UNA VENTANA RECIENTE (06/08) ═══
  //
  // Era `SUM(K)/SUM(L)/AVERAGE(D)` sobre el REGISTRO ENTERO: el promedio del año, con el ausentismo
  // de enero adentro, daba 6,7 h contra una jornada de 9 y con eso se proyectaba el semestre. Ahora
  // es Σ(plata) ÷ Σ($/hora × días) —ponderado, dimensionalmente correcto— sobre las quincenas
  // CERRADAS de los últimos JORNALES_MESES_BASE meses. El parámetro está en Parámetros y se ve.
  filas[fHpd - 1][1] = formulaHorasPorPersona(
    { total: colDe('TOTAL'), sigma: colDe('Σ $/hora'), dias: colDe('Días hábiles'), hasta: colDe('Hasta') },
    f0, fLast,
  )
  // El rótulo COMPLETO del parámetro ("Meses hacia atrás para medir el ritmo real de horas") dentro de
  // una celda de la columna C dejaba 114 caracteres desparramados en el medio del cuadro. El nombre
  // del parámetro está en Parámetros, que es adonde hay que ir igual: acá alcanza con nombrar la hoja.
  filas[fHpd - 1][2] = `=IF(N(B${fHpd})=0;"${ALERTA} sin quincenas cerradas — subí la ventana en Parámetros";"medido s/ cerradas · "&${RANGO_MESES_BASE}&" meses")`
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
  filas[fAdel - 1][1] = formulaShareAdelanto(
    { adelanto: colDe('Adelanto'), total: colDe('TOTAL'), hasta: colDe('Hasta'), pagado: colDe('Pagado el') },
    f0, fLast,
  )
  filas[fAdel - 1][2] = `=IF(B${fAdel}="";"⊘ sin base — menos de ${MIN_QUINCENAS_SHARE} quincenas pagadas";`
    + `"$"&TEXT($${cObra}$${fTotalProy}*B${fAdel};"#,##0")&" proyectados a diciembre")`
  // LA BAJA NO REGISTRADA. Las dos Σ $/hora salen de bloques distintos del espejo —el plantel base
  // (4.1) y la última fila del registro— así que la diferencia es un hecho medido, no una hipótesis.
  filas[fBaja - 1][0] = formulaBajaNoRegistrada({
    personasBase: `$B$${fPlantel}`, sigmaBase: `$C$${fPlantel}`,
    personasCurso: `$${colDe('Personas')}$${fLast}`, sigmaCurso: `$${colDe('Σ $/hora')}$${fLast}`,
    totalObra: `$${cObra}$${fTotalProy}`,
  })
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
  const hastaCargado = formulaUltimaFechaConImporte(
    `$${colDe('Hasta')}$${f0}:$${colDe('Hasta')}$${fLast}`,
    `$${colDe('TOTAL')}$${f0}:$${colDe('TOTAL')}$${fLast}`,
  )
  // LA FILA 2 ES EL ÚNICO LUGAR DONDE LA GRAMÁTICA PIDE PROSA: qué contesta · fuente · fecha de corte.
  // Decía "Jornales de obra y sueldos de oficina" y desde el 13/08 la pestaña tiene TRES nóminas —
  // dirección incluida—, así que además de más corto ahora es cierto.
  filas[fSubtitulo - 1][0] = rotuloAlDia(
    'Obra, oficina y dirección · fuente: planilla JORNALES y escala UOCRA',
    hastaCargado,
  )
  const K = `IF(ISNUMBER($K$${f0}:$K$${fLast});$K$${f0}:$K$${fLast};0)`
  const pagada = `($N$${f0}:$N$${fLast}<>"")`
  // Cada canal suma SU columna del registro, sólo de las quincenas con pago marcado: es lo que
  // efectivamente salió, no lo que se estimó. Las tres tienen que sumar lo pagado, y el control lo mide.
  const porCol = (col) => `=SUMPRODUCT(${pagada}*IF(ISNUMBER($${col}$${f0}:$${col}$${fLast});$${col}$${f0}:$${col}$${fLast};0))`
  filas[fCanal.banco - 1][1] = porCol(colDe('Banco'))
  filas[fCanal.adelanto - 1][1] = porCol(colDe('Adelanto'))
  filas[fCanal.recibo - 1][1] = porCol(colDe('Total recibo'))
  filas[fCanal.recibo - 1][2] = `=IF(ROUND(B${fCanal.banco}+B${fCanal.adelanto}+B${fCanal.recibo}-SUMPRODUCT(${pagada}*${K});0)=0;"✓ los tres canales suman lo pagado";"${ALERTA} faltan $"&TEXT(SUMPRODUCT(${pagada}*${K})-B${fCanal.banco}-B${fCanal.adelanto}-B${fCanal.recibo};"#,##0")&" sin canal de pago registrado")`
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
    filas[r - 1][1] = formulaFactorDelMes(`EOMONTH(DATE(${AÑO};${i + 1};1);0)`, esc,
      iBaseOfi === null ? null : `EOMONTH(DATE(${AÑO};${iBaseOfi + 1};1);0)`)
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
    filas[d0 + i - 1][1] = formulaFactorDelMes(`EOMONTH(DATE(${AÑO};${i + 1};1);0)`, esc, expresionMesBaseRetiro())
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
      celdaHorasMedidas: `$B$${fHpd}`,
      // El criterio de la semana de obra para el PACTADO sigue viviendo en `expresionDias`, no en un
      // `NETWORKDAYS` suelto: es el mismo lugar que usa el reparto de la demanda.
      exprDias: expresionDias(`A${r}`, `B${r}`),
      exprHorasJornada: expresionHorasDeJornada({
        celdaDesde: `A${r}`,
        celdaHasta: `B${r}`,
        celdaLJ: `$B$${fJornada}`,
        celdaV: `$C$${fJornada}`,
        celdaS: `$D$${fJornada}`,
      }),
    })
    // LA DEMANDA DE OBRAS YA NO ENTRA A ESTA CELDA. `formulaProyectadoQuincena` devuelve la
    // expresión del plantel sola desde el 14/08 —el `MAX` contra la demanda hacía que la columna
    // cambiara de naturaleza fila por fila— y el argumento se conserva sólo para que el llamador no
    // tenga que saberlo. Lo que se publica es el plantel actual, con su tarifa y su aumento.
    filas[r - 1][3] = formulaProyectadoQuincena({ convenio, celdaPago: `C${r}` },
      demanda?.porQuincena?.get(claveQuincena(q.desde)) ?? null)
    const desde = i === 0 ? null : `$C$${r}`
    const hasta = i === pendientes.length - 1 ? null : `$C$${r + 1}`
    filas[r - 1][4] = formulaVentana({ rangoImporte: `$H$${o0}:$H$${oFin}`, rangoFecha: `$E$${o0}:$E$${oFin}`, celdaDesde: desde, celdaHasta: hasta })
    filas[r - 1][5] = formulaVentana({ rangoImporte: `$H$${d0}:$H$${dFin}`, rangoFecha: `$E$${d0}:$E$${dFin}`, celdaDesde: desde, celdaHasta: hasta })
  })
  filas[fControlCal - 1][0] = formulaControlCalendario({
    oficina: `${cO}${fTotalProy}`, direccion: `${cD}${fTotalProy}`,
    totalOficina: cel(fTotalOfi, 'H'), totalDireccion: cel(fTotalDir, 'H'),
  })
  // ¿EL PISO DEL CONVENIO SE ESTÁ APLICANDO? Se mide sobre las MISMAS dos columnas del bloque 4.1 que
  // arman la Σ al convenio —personas y básico—, que es donde el piso se enciende o se apaga. Un
  // control que preguntara "¿el total es alto?" no puede distinguir una proyección con piso de una
  // que quedó colgada de la demanda de obras.
  //
  // Y DESDE EL 27/08 MIRA TAMBIÉN LAS OTRAS DOS ENTRADAS DEL PRODUCTO, por caminos distintos de los
  // que las produjeron: las personas del cuadro de PAGO (que las cuenta sobre el registro del espejo)
  // contra las del cuadro del piso, y las horas medidas contra la jornada. Con sólo la primera
  // pregunta, la celda firmó "✓ cubren el piso" sobre una proyección $16,2M corta.
  filas[fControlPiso - 1][0] = formulaControlAumento({
    celdasPersonas: `$B$${plantel.fPrimera}:$B$${plantel.fUltima}`,
    celdasBasico: `$F$${plantel.fPrimera}:$F$${plantel.fUltima}`,
    nQuincenas: pendientes.length,
    celdaPersonasPago: `$B$${fPago.obra}`,
    celdaPersonasPiso: `$B$${fPlantel}`,
    celdaHoras: `$B$${fHpd}`,
    // La jornada del VIERNES es la más baja de las tres, así que es la comparación exigente: si las
    // horas medidas llegan a superarla, el piso se está midiendo con menos horas que la jornada más
    // corta de la semana y hay que decirlo. Comparar contra la de lunes a jueves dejaría pasar el
    // tramo entre 8 y 9 h sin avisar.
    celdaJornada: `$C$${fJornada}`,
  })

  // ══ EL SUBTÍTULO DEL CUADRO DE PAGO Y SUS TRES AVISOS ══
  //
  // Todo cita al REGISTRO de abajo, que a su vez cita al espejo: el período que se está pagando, la
  // fecha de caja y el estado de la carga de horas salen del mismo lugar que el importe. Un renglón
  // que dijera "quincena 3/8→15/8" estampado en la corrida envejece sin avisar; éste no puede.
  const fReg = fLast
  filas[fSubPago - 1][0] = `="Obreros · quincena "&TEXT($A$${fReg};"d/m")&"→"&TEXT($B$${fReg};"d/m")`
    + `&" · se paga el "&TEXT($C$${fReg};"d/m")`
  // ═══ LAS TRES NÓMINAS DEL CUADRO QUE DECIDE ═══
  //
  // Cada una cita a SU bloque de abajo; ningún importe se copia. Las dos identidades que hacen
  // auditable la fila sin hacer cuentas: TOTAL − Adelanto = Neto, y Por banco + En efectivo = Neto.
  const cTot = colDe('TOTAL'); const cAdel = colDe('Adelanto'); const cBco = colDe('Banco')
  const filaPago = (f, { personas, cuando, total, adelanto, banco }) => {
    filas[f - 1][1] = personas
    filas[f - 1][2] = cuando
    filas[f - 1][3] = total
    filas[f - 1][4] = adelanto
    filas[f - 1][5] = `=IF(N(D${f})=0;"";D${f}-N(E${f}))`
    filas[f - 1][6] = banco
    // El efectivo es el RESTO del neto, nunca otro 50% calculado aparte: así la identidad cierra
    // aunque el banco venga de un dato cargado y no del acuerdo.
    filas[f - 1][7] = `=IF(OR(N(D${f})=0;NOT(ISNUMBER(G${f})));"";F${f}-G${f})`
  }
  // OBRA: la quincena que se está pagando, leída del registro. Si la columna «Banco» del espejo ya
  // trae el reparto cargado, ése manda; mientras esté en cero, el 50/50 del acuerdo lo calcula.
  filaPago(fPago.obra, {
    personas: `=$${colDe('Personas')}$${fReg}`,
    cuando: `=$C$${fReg}`,
    total: `=$${cTot}$${fReg}`,
    adelanto: `=$${cAdel}$${fReg}`,
    // `/2` y NUNCA `*0,5`: un literal decimal escrito por API viaja en el locale es_AR del archivo y
    // ahí la coma es el separador de argumentos — el 0,5 se parte en dos y la celda queda en #ERROR.
    banco: `=IF(N($${cBco}$${fReg})>0;$${cBco}$${fReg};D${fPago.obra}/2)`,
  })
  // OFICINA y DIRECCIÓN: la próxima fecha de caja con algo PROYECTADO todavía por pagar. Se mira la
  // columna «Proyectado» y no la «Pagado» — un mes ya pagado no es un pago que viene.
  // ═══ «PERSONAS» SE PIDE, NO SE ADIVINA LEYENDO LA COLUMNA B DEL BLOQUE (14/08) ═══
  //
  // Esta celda era `INDEX($B$r0:$B$r1;MATCH(…))` — la columna B del bloque mensual, "que es Personas".
  // Dejó de serlo el mismo día: cuando Oficina cambió su grilla, la B pasó a ser «Ajuste escalón» y el
  // cuadro que decide el pago publicó **1,019 personas** en la fila de Oficina y 1,0384 en la de
  // Dirección. Ningún error, ningún #REF: un número plausible en la columna equivocada.
  //
  // Es EXACTAMENTE el defecto que `colDe` y `colCalendario` existen para impedir, cometido sobre un
  // bloque que no tiene su lista de rótulos exportada. La corrección no es "apuntar a la letra buena"
  // —mañana se mueve otra vez— sino que el plantel LO PASE EL LLAMADOR, desde el lugar que sabe
  // contarlo: `dp0..dpFin` para Dirección (una fila por socio, salida de Compras) y el último bloque
  // del espejo para Oficina (una fila por persona, columna B). Ninguno de los dos se estampa: los dos
  // son `COUNTA` sobre un rango vivo, así que el día que entre o salga alguien, la celda se mueve sola.
  const proximoMensual = (f, r0, r1, { personas, banco }) => {
    const min = `MINIFS($E$${r0}:$E$${r1};$E$${r0}:$E$${r1};">="&TODAY();$H$${r0}:$H$${r1};">0")`
    filaPago(f, {
      personas,
      cuando: `=IF(${min}=0;"";${min})`,
      total: `=IF(N(C${f})=0;"";SUMIFS($H$${r0}:$H$${r1};$E$${r0}:$E$${r1};C${f}))`,
      adelanto: VACIO,
      banco,
    })
  }
  proximoMensual(fPago.oficina, o0, oFin, {
    // El plantel de oficina sale del ÚLTIMO bloque cargado del espejo, que es el mes que se está por
    // pagar. Sin bloques no hay a quién contar y se dice, en vez de publicar un cero que se leería
    // como "no hay nadie en oficina".
    personas: ultimoBloqueOfi
      ? `=COUNTA('${ESPEJO_OFI}'!$B$${ultimoBloqueOfi.inicio}:$B$${ultimoBloqueOfi.fin})`
      : SIN_DATO,
    banco: `=IF(N(D${fPago.oficina})=0;"";D${fPago.oficina}/2)`,
  })
  // DIRECCIÓN VA ENTERA POR BANCO — orden del dueño, no una medición: *"administracion todos por
  // banco"* (03/08). Publicar "—" acá rompía la identidad POR BANCO + EN EFECTIVO = NETO en la fila de
  // total por $9.171.000, que es el único renglón que él usa para operar el pago. El razonamiento
  // completo y su excepción medida, en `DIRECCION_POR_BANCO`.
  proximoMensual(fPago.direccion, d0, dFin, {
    // Los socios que cobran retiro, contados de su propia tabla —la que sale de Compras, tres filas
    // más arriba— y no de una constante: el día que entre o salga uno, esta celda lo sigue.
    personas: `=COUNTA($A$${dp0}:$A$${dpFin})`,
    banco: `=IF(N(D${fPago.direccion})=0;"";F${fPago.direccion})`,
  })
  // EL 50/50 ES UN CÁLCULO MIENTRAS LA COLUMNA BANCO ESTÉ EN CERO, Y SE DICE. No es una alerta de
  // incumplimiento —eso es lo que el dueño rechazó— sino de dónde sale el número que está leyendo.
  filas[fAvisoBanco - 1][0] = personasPago.length
    ? avisoBancoCalculado({ hoja: ESPEJO, r0: personasPago[0], r1: personasPago[personasPago.length - 1] })
    : VACIO
  // LAS HORAS INCOMPLETAS: medidas al 14/08, 1.223 reales contra 1.620 previstas. El total de arriba
  // va a subir cuando se carguen los últimos dos días, y el cuadro lo dice mientras sea cierto.
  filas[fAvisoHoras - 1][0] = avisoHorasIncompletas({
    fila: fReg,
    previstas: colDe('Hs previstas'), reales: colDe('Hs reales'), estado: colDe('Estado'),
  })
  // Y EL EFECTIVO NEGATIVO. Tello Juan adelantó $240.000 contra un 50% de $236.500: su sobre da −$3.500
  // y tiene que verse. El aviso cuenta las filas de la columna «En efectivo» que quedaron abajo de cero.
  filas[fAvisoNeg - 1][0] = personasPago.length
    ? avisoEfectivoNegativo({ hoja: ESPEJO, r0: personasPago[0], r1: personasPago[personasPago.length - 1] })
    : VACIO

  // ══ ESTIMADO CONTRA REAL: LAS TRES FILAS, CADA UNA CON SU NIVEL DE EVIDENCIA ══
  //
  // El ESTIMADO no se recalcula acá: cita la fila «Obreros · UOCRA» del cuadro de pago. Recalcularlo
  // sería tener dos versiones del mismo número en la misma pantalla, que es exactamente lo que el
  // dueño llamó "un desastre q no se entiende" — y encima el cuadro podría contradecirse a sí mismo
  // cuatro filas más abajo.
  //
  // El REAL sale de `_BANCO_RAW` por la fecha de cierre del registro (`$B$fReg`). Por FECHA DE CIERRE
  // y no por "el último lote": una quincena se paga después de terminar y el que mira tiene que poder
  // ver a qué período corresponde cada peso. La ventana la deriva la lib del propio cierre.
  const cCuando = colContraste('Cuándo')
  const cMovs = colContraste('Movimientos')
  const cEst = colContraste('Estimado')
  const cReal = colContraste('Real')
  const cDif = colContraste('Diferencia')
  const cDelta = colContraste('Δ %')
  const cOrigen = colContraste('De dónde sale el real')
  const iCol = (letra) => letra.charCodeAt(0) - 65
  // ═══ EL ANCLA ES «Quincena», NO «Hasta» — Y ESO COSTÓ UNA PUBLICACIÓN (15/08) ═══
  //
  // Era `$B$${fReg}`, la columna «Hasta». El cuadro salió publicado con el estimado y sin el real,
  // diciendo *"el extracto todavía no los muestra"* — falso: `B148` estaba VACÍA (ocho de las quince
  // filas del registro tienen `=""` ahí) y `N($B$148)=0` apagaba las cuatro celdas. El cierre ahora
  // se DERIVA del inicio con la regla de calendario, que es la misma que usa el calendario de pago.
  // El porqué completo, en `expresionCierreDeQuincena`.
  const desdeQ = `$A$${fReg}`
  filas[fSubReal - 1][0] = formulaSubtituloContraste(fReg)
  /** Una fila del cuadro: el estimado que cita, el real que se le puede probar, y la prosa del origen. */
  const filaContraste = (f, { estimado, real, cuando = SIN_DATO, movs = SIN_DATO, origen }) => {
    filas[f - 1][iCol(cCuando)] = cuando
    filas[f - 1][iCol(cMovs)] = movs
    filas[f - 1][iCol(cEst)] = estimado
    filas[f - 1][iCol(cReal)] = real
    // La diferencia y el delta se escriben SIEMPRE con la misma fórmula, incluso en la fila que no
    // tiene real: ahí se apagan solas (`N(real)=0`) y dibujan el "—" del patrón de moneda. Escribir
    // un literal "—" en su lugar dejaría dos formas distintas de decir lo mismo en el mismo cuadro.
    filas[f - 1][iCol(cDif)] = formulaDiferencia(`${cEst}${f}`, `${cReal}${f}`)
    filas[f - 1][iCol(cDelta)] = formulaDelta(`${cEst}${f}`, `${cDif}${f}`)
    filas[f - 1][iCol(cOrigen)] = origen
  }
  // 1 · POR BANCO — el único renglón con prueba. `G` es «Por banco» de la fila de obra del cuadro de
  // arriba: 14 hechos y, mientras alguien no cargue su columna BANCO, algún 50% calculado. Que el
  // banco lo desmienta es justamente para lo que sirve este renglón.
  filaContraste(fContraste.banco, {
    cuando: formulaFechaDelLote(desdeQ),
    movs: formulaMovimientos(desdeQ),
    estimado: `=G${fPago.obra}`,
    real: formulaRealBanco(desdeQ),
    origen: formulaOrigenDelReal({ celdaDesde: desdeQ, celdaMovs: `${cMovs}${fContraste.banco}` }),
  })
  // 2 · EN EFECTIVO — estimado sí, real NO, y el motivo en la celda. Ver EFECTIVO_SIN_FUENTE: la
  // columna «Total recibo» de JORNALES es TOTAL−ADELANTO−BANCO, un residuo de la misma planilla.
  // Usarla acá daría cero de diferencia todos los días y no probaría absolutamente nada.
  filaContraste(fContraste.efectivo, {
    estimado: `=H${fPago.obra}`,
    real: SIN_DATO,
    origen: EFECTIVO_SIN_FUENTE,
  })
  // 3 · EL TOTAL — la única forma de contestar "¿cuánto salió de verdad esta quincena?" con lo que
  // hay: el banco por dos, porque el acuerdo es mitad y mitad. Es una INFERENCIA y la celda lo dice.
  filaContraste(fContrasteTotal, {
    estimado: `=D${fPago.obra}`,
    real: formulaTotalInferido(`${cReal}${fContraste.banco}`),
    origen: TOTAL_INFERIDO,
  })
  filas[fAvisoUmbral - 1][0] = formulaAvisoUmbral({
    movs: `${cMovs}${fContraste.banco}`,
    est: `${cEst}${fContraste.banco}`,
    dif: `${cDif}${fContraste.banco}`,
    delta: `${cDelta}${fContraste.banco}`,
  })

  // ══ EL CUADRO DEL AÑO: DOS COLUMNAS, UNA POR VENTANA DE TIEMPO ══
  //
  // Cada celda sale del bloque que la produce y de ningún otro lado: si una nómina se recalculara acá
  // arriba por su cuenta, el cuadro podría decir un número y su sección otro, y nadie se enteraría.
  // Ésa es la razón de que TODAS las celdas sean referencias a filas de abajo.
  const realObra = `SUMPRODUCT(${pagada}*${K})`
  const [, cAnioProy, cAnioPag] = COL_ANIO
  const filaAnioDatos = (fila, { proyectado, pagado }) => {
    filas[fila - 1][cAnioProy] = proyectado
    filas[fila - 1][cAnioPag] = pagado
  }
  filaAnioDatos(fAnio.obra, { proyectado: `=${cel(fTotalProy, cObra)}`, pagado: `=${realObra}` })
  filaAnioDatos(fAnio.oficina, { proyectado: `=${cel(fTotalOfi, 'H')}`, pagado: `=${cel(fTotalOfi, 'C')}` })
  filaAnioDatos(fAnio.direccion, { proyectado: `=${cel(fTotalDir, 'H')}`, pagado: `=${cel(fTotalDir, 'C')}` })
  // EL TOTAL SUMA LAS TRES FILAS DE ARRIBA, no vuelve a las fuentes. Si volviera, podría no cerrar
  // contra sus propias filas y la fila que remata el bloque sería la única que nadie puede verificar.
  for (const c of [cAnioProy, cAnioPag]) {
    const L = String.fromCharCode(65 + c)
    filas[fAnioTotal - 1][c] = `=SUM(${L}${fAnio.obra}:${L}${fAnio.direccion})`
  }

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
    // ═══ EL TITULAR YA NO ES UNA CELDA SUELTA EN 13 pt (13/08) ═══
    //
    // `skinRequests` dibuja el titular a 13 puntos en las columnas A y B, y eso servía cuando el hero
    // era una lista de cinco líneas. En un cuadro de ocho columnas rompe dos veces: el importe de doce
    // dígitos a 13 pt mide ~110 px contra los 112 de la columna —al borde de cortarse— y las otras
    // cuatro cifras del mismo renglón quedarían en 10 pt, con la fila de total dibujada a dos tamaños.
    //
    // La jerarquía la da el bloque entero (ver `requestsDeFormato`): la fila que remata el cuadro de
    // pago va en acento, y sus dos últimas celdas —lo que se transfiere y lo que se saca en billetes—
    // en cuerpo mayor. `titular` se sigue publicando porque lo consume el log de la corrida.
    titular: fPagoTotal,
    fechas: [
      ...pendientes.map((_, i) => p0 + i), ...bloques.map((_, i) => f0 + i),
    ],
    // Horas con un decimal · cantidades enteras · el único porcentaje de la pestaña.
    // La jornada va con las horas medidas: dos cifras de la misma naturaleza dibujadas distinto se
    // leen como dos magnitudes distintas, que es exactamente lo que NO son.
    cantidades: [fHpd, fJornada],
    // Prosa que RINDE una fórmula: el pase por contenido la saltea (empieza con '='). Se declara acá
    // y el formato la pinta TEXTO. col 0-based.
    // …y el CANARIO del plantel (última fila del bloque 4.1, col H): rinde "✓ el bloque del
    // espejo…" por fórmula y sin declararlo la piel lo pintaba de plata (auditor, 06/08).
    celdasDeProsaFormula: [
      { fila: fHpd, col: 2 }, { fila: fCanal.recibo, col: 2 },
      // El adelanto proyectado a diciembre RINDE texto por fórmula: sin declararlo, el pase por
      // contenido no lo clasifica y el barrido de moneda lo dibuja como pesos.
      { fila: fAdel, col: 2 },
      { fila: plantel.fTotal, col: 7 },
      // El control del calendario vive en la columna A y rinde texto por fórmula: sin declararlo, el
      // barrido de moneda no lo toca (empieza en la B) pero el pase por contenido tampoco lo clasifica.
      { fila: fControlCal, col: 0 }, { fila: fControlPiso, col: 0 }, { fila: fBaja, col: 0 },
      ...prosaDelBloque6,
      // EL SUBTÍTULO DEL CUADRO DE PAGO Y SUS TRES AVISOS: los cuatro viven en la columna A y rinden
      // texto por fórmula. El barrido de moneda no llega a la A, pero el pase por contenido tampoco
      // los clasifica y quedarían con el formato que hubiera dejado el layout anterior.
      { fila: fSubPago, col: 0 }, { fila: fAvisoBanco, col: 0 },
      { fila: fAvisoHoras, col: 0 }, { fila: fAvisoNeg, col: 0 },
      // El bloque de estimado-contra-real: su subtítulo, su aviso de umbral y la celda que RINDE la
      // forma del lote ("14 movimientos iguales de $260.000…"). Las tres salen de una fórmula, así que
      // el pase por contenido las saltea y sin declararlas el barrido de moneda las dibuja como pesos.
      { fila: fSubReal, col: 0 }, { fila: fAvisoUmbral, col: 0 },
      { fila: fContraste.banco, col: COLS_CONTRASTE.indexOf('De dónde sale el real') },
    ],
    enteros: [plantel.fTotal],
    // ── LOS DOS CUADROS DEL HERO, PARA EL FORMATO ──
    // `pago` es el registro de la quincena (un solo escenario, AC) y `anio` el de la proyección.
    // Se pasan las filas y los RÓTULOS: el formato busca su columna por nombre, nunca por letra.
    hero: {
      cols: COLS_PAGO, fCols: fPagoCols, sub: fSubPago,
      f0: fPago0, fFin: fPagoFin, total: fPagoTotal, personas: personasPago.length,
      avisos: [fAvisoBanco, fAvisoHoras, fAvisoNeg],
    },
    // El cuadro de estimado contra real: sus filas y sus rótulos. El formato busca cada columna por
    // NOMBRE —nunca por letra—, que es la regla que impide que agregar una columna deje el formato de
    // porcentaje pintando la de al lado.
    contraste: {
      cols: COLS_CONTRASTE, fCols: fContrasteCols, sub: fSubReal,
      f0: fContraste.banco, fFin: fContrasteTotal, aviso: fAvisoUmbral,
    },
    anio: {
      cols: COLS_ANIO, col: COL_ANIO, fCols: fAnioCols,
      obra: fAnio.obra, oficina: fAnio.oficina, direccion: fAnio.direccion, total: fAnioTotal,
    },
    // El bloque del motor, para el formato: personas enteras, factores con cuatro decimales.
    plantel, esc,
    // POR NOMBRE, NO POR OFFSET. Decía `[fMin + 2]`: al agregar el escalón del mes que viene, el margen
    // nuevo quedó fuera de la lista y un -16,7% se dibujó como "-$0". Es el mismo defecto que ya rompió
    // tres enlaces en este libro — anclar en la posición.
    // `filter(Boolean)`: sin acuerdo publicado, el margen contra el escalón que viene no existe como
    // fila. Un 0 acá pediría formato para la fila 0 y el lote entero de formato se cae.
    // `fAdel` es una FRACCIÓN (0,1373), no plata: sin el formato de porcentaje el barrido de moneda la
    // dibuja "$0" y la línea parece decir que no se adelanta un peso.
    ratios: [fMargen, fMargenProx, fAdel].filter(Boolean),
    nProy: pendientes.length,
    // El adelanto ponderado (obra): una FRACCIÓN, no plata.
    fAdel,
    fControlCal,
    fControlPiso,
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
    encabezados: [fPagoCols, fAnioCols, p0 - 1, o0 - 1, f0 - 1, dp0 - 1, d0 - 1, plantel.fPrimera - 1, esc.f0 - 1],
    fVig,
  }
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
  // LAS PERSONAS DE LA QUINCENA QUE SE ESTÁ PAGANDO: el ÚLTIMO bloque del espejo, que es el que está
  // abierto. Se resuelve acá y no adentro de `grilla` porque hace falta la grilla del espejo para saber
  // qué filas tienen nombre — un bloque trae filas numeradas que no son gente (la de totales, alguna
  // intermedia con importes y sin nombre) y emitir un renglón por cada una llenaría el cuadro de
  // fantasmas con $0.
  // EL PLANTEL DEL AÑO ENTERO, no el de la quincena: la sección 6 tiene que poder liquidar también a
  // quien ya no está, y ésos sólo existen en los bloques viejos del espejo.
  // EL COSTO DE DESVINCULAR SE PUBLICA EN «Nómina», NO ACÁ. Se sigue calculando el plantel porque
  // otras partes de esta pestaña lo usan, pero no se le pasa a `grilla`: sin él, la sección 6 no se
  // dibuja. Dos pestañas publicando el mismo número es como empiezan las dos verdades.
  const desvinculacion = separarPlantel(plantelDelEspejo(espejo ?? [], bloques, { anio: AÑO }), bloques)
  console.log(`plantel del año: ${desvinculacion.activos.length} activo(s) · ${desvinculacion.desafectados.length} desafectado(s) — el costo de desvincular se publica en «Nómina»`)
  const personasPago = filasDePersonas(espejo ?? [], bloques[bloques.length - 1])
  if (!personasPago.length) console.warn('  ⚠ el último bloque del espejo no tiene personas: el cuadro de pago sale vacío')
  const g = grilla({
    bloques, pendientes, bloquesOfi, pagoPrevio, ultimoDiaOfi,
    escalones, bloqueBase, categorias, personasBase, origenPlantel: piso.origen ?? 'cerrada',
    escalonVigente, meses, hoy, periodoBase, demanda,
    personasPago,
    desvinculacion: null,
  })
  console.log(`grilla: ${g.filas.length} filas × ${ANCHO} columnas · motor sobre ${meses.length} mes(es) (${meses[0]?.periodo} → ${meses[meses.length - 1]?.periodo})`)
  const aMano = g.filas.filter((f) => f[2] === '').length
  if (aMano) console.log(`  ✋ ${aMano} fecha(s) de pago escrita(s) a mano: no las toco`)
  if (DRY) { for (const f of g.filas) console.log('   ', f.filter((c) => c && c !== VACIO).map((x) => String(x).slice(0, 34)).join(' | ')); return }

  const hojas = await google.getSheetMeta(ID)
  const hoja = hojas.find((h) => h.title === PESTAÑA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTAÑA}"`)

  // EL PARÁMETRO SE ASEGURA ANTES DE ESCRIBIR LA GRILLA. Las fórmulas de "Se paga el" citan
  // JORNALES_DESFASE_PAGO y JORNALES_VENTANA_BANCO por nombre: si los nombres no existen todavía, la
  // columna entera queda en #NAME? hasta la corrida siguiente.
  await asegurarParametros(google, hojas, TODOS_LOS_PARAMETROS(escalones)).catch((e) => console.warn(`  ⚠ no pude asegurar los parámetros de fecha de pago: ${e.message}`))

  // La cola de la pestaña vieja: se marca VACIO —"es mi celda y va vacía"— así se limpia lo que
  // dejaron los generadores anteriores sin tocar lo que haya escrito una persona.
  // `columnasAjenas`: la 14 es del dueño en TODA la pestaña, así que en la cola va con '' —"no es
  // mía"— y la fusión la conserva. El mecanismo vive en lib/cola-de-rango.mjs.
  const previo = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:${letraCol(ANCHO - 1)}400`)
  const cola = conColaMedida(g.filas, previo, { ancho: ANCHO, columnasAjenas: [ANCHO - 1] })
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
  // El ancla es la CABECERA del registro ("Quincena" en la columna A y "Pagado el" en la última): desde
  // ahí, la k-ésima quincena de antes es la k-ésima de ahora, porque el registro sólo crece por el final.
  const iPagado = ANCHO - 1
  const cabeceraDe = (filas) => filas.findIndex((f) => String(f?.[0] ?? '').trim() === 'Quincena'
    && String(f?.[iPagado] ?? '').trim() === 'Pagado el')
  const viejo = cabeceraDe(previo ?? [])
  const nuevo = cabeceraDe(grid)
  let copiadas = 0
  // Primero: TODA la columna es del dueño, así que nace vacía y sólo se llena con lo que él escribió.
  for (let i = 0; i < grid.length; i++) grid[i][iPagado] = VACIO
  if (viejo >= 0 && nuevo >= 0) {
    for (let k = 1; nuevo + k < grid.length; k++) {
      const suyo = previo?.[viejo + k]?.[iPagado]
      if (suyo === undefined || suyo === null || String(suyo) === '') continue
      grid[nuevo + k][iPagado] = suyo
      if (/\d/.test(String(suyo))) copiadas++
    }
  } else if (previo?.length) {
    // Sin cabecera reconocible no se adivina el desplazamiento: se copia por fila y se avisa. Perder una
    // fecha en silencio es peor que copiar de más — el portón preserva lo que el generador no escribe.
    console.log('  ⚠ no encontré la cabecera del registro: copio "Pagado el" por número de fila (puede desalinearse si la pestaña creció)')
    for (let i = 0; i < grid.length; i++) {
      const suyo = previo?.[i]?.[iPagado]
      if (suyo !== undefined && suyo !== null && String(suyo) !== '') { grid[i][iPagado] = suyo; if (/\d/.test(String(suyo))) copiadas++ }
    }
  }
  // Y la cabecera, que sí es mía.
  if (nuevo >= 0) grid[nuevo][iPagado] = 'Pagado el'
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

  for (const p of ubic.filter((x) => x.nuevo)) {
    // Se escribe SÓLO la fila del parámetro, con el portón que respeta candado, firma y anotaciones.
    // Nada de batchUpdateValues crudo: Parámetros es una pestaña del dueño, no un espejo.
    const r = await escribirPreservando(google, ID, `'${TAB}'`, [[p.rotulo, p.valor, p.nota]], {
      fila0: p.fila, anchoHoja: 3, pestana: TAB,
    })
    if (r?.bloqueada || r?.editadaPorHumano) { console.log(`  ⚠ "${TAB}" está bajo tu control: no escribí "${p.rotulo}"`); continue }
    console.log(`  ✚ parámetro nuevo en ${TAB}!A${p.fila}: "${p.rotulo}" = ${p.valor}`)
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
  // EL CALENDARIO DE PAGO. Mismo criterio: el encabezado sale de COLS_CALENDARIO, la MISMA lista de la
  // que sale la fila que se escribe.
  const cal = (nombre, col, contenido) => columna(nombre, { col, r0: g.p0, r1: finProy, encabezado: COLS_CALENDARIO[col], contenido })
  return [
    reg('JORNALES_REAL_DESDE', 0),
    reg('JORNALES_REAL_HASTA', 1),
    // LA FECHA DE CAJA (31/07). Es la que usa la línea de jornales del cash flow; HASTA queda como
    // fallback y como la fecha del DEVENGAMIENTO, que es otra pregunta y otra pestaña.
    reg('JORNALES_REAL_PAGO', 2),
    reg('JORNALES_REAL_TOTAL', 10),
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
    reg('JORNALES_REAL_PAGADO', 13, 'dueño-restaurado'),
    // ═══ POR QUÉ CANAL SALIÓ (01/08) ═══
    // El dueño paga la quincena en partes: una por transferencia y otra en efectivo (adelantos y
    // contra recibo). Esta pestaña ya lo separaba —y ya lo controla contra el TOTAL— pero nadie leía
    // esas tres columnas: CAJA no tenía forma de bajar el banco por el lote de haberes ni la caja
    // física por el efectivo, así que la nómina se pagaba y no salía de ninguna disponibilidad.
    // Publicadas por nombre, las consume lib/caja-posterior-al-corte.mjs.
    reg('JORNALES_REAL_BANCO', 7),
    reg('JORNALES_REAL_ADELANTO', 8),
    reg('JORNALES_REAL_RECIBO', 9),
    cal('JORNALES_PROY_DESDE', 0),
    cal('JORNALES_PROY_HASTA', 1),
    cal('JORNALES_PROY_PAGO', 2),
    // ═══ APUNTA A "Obreros", NO A "TOTAL" — Y ES LA DIFERENCIA ENTRE CONTAR UNA VEZ Y DOS ═══
    //
    // Desde el 13/08 el calendario suma las tres nóminas en una columna TOTAL. Oficina y dirección YA
    // viajan por `OFICINA_PROYECTADO` y `DIRECCION_PROYECTADO`: si este nombre apuntara al TOTAL, el
    // calendario de caja y Cargas Sociales las sumarían dos veces —hoy $50,2M de más— con un número
    // plausible y ninguna celda en rojo. El nombre significa "los jornales de obra proyectados" y
    // tiene que seguir significando eso.
    cal('JORNALES_PROY_TOTAL', 3),
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
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 330 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: ANCHO }, properties: { pixelSize: 112 }, fields: 'pixelSize' } },
    // ═══ LA D ES MÁS ANCHA, Y ESTE GENERADOR TIENE QUE DECLARARLO (15/08) ═══
    //
    // La D lleva el ESTADO de cada fila, que no es una palabra sino una frase con su fundamento:
    // "proyección · ▲ firmado hasta 08/2026" son 36 caracteres y en 112px entran 19. Como la E de esas
    // mismas filas tiene la fecha de pago, no derrama: la mitad de la frase —justamente la parte que
    // dice hasta dónde llega la paritaria firmada— simplemente no se ve. Cinco filas del cuadro de
    // oficina, medidas por `auditar-pantalla`.
    //
    // POR QUÉ ENSANCHAR Y NO ACORTAR: 36 caracteres piden 206px, que es un ancho normal para una
    // columna de estado. La regla del archivo es acortar cuando ningún ancho razonable alcanza; acá
    // alcanza de sobra, y lo que se perdería al acortar es el "hasta cuándo está firmado", que es
    // exactamente lo que separa un dato de una proyección.
    //
    // Y SE DECLARA ACÁ PORQUE ACÁ HAY UN DUEÑO. `reparar-textos.mjs` ensancha por su cuenta toda
    // columna cuyo texto no entre y no esté gobernada, y corre DESPUÉS de este generador: con la D en
    // 112 los dos se la disputaban en cada pasada y ganaba el último. Con la D ya ancha el texto entra,
    // el reparador no encuentra defecto y no la toca — el conflicto se apaga solo en vez de alternar.
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: ANCHO_ESTADO }, fields: 'pixelSize' } },
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
  // ═══ EL CALENDARIO ES TODO PLATA DE LA D A LA H (13/08) ═══
  //
  // Acá vivían tres reglas —días y personas enteros, horas con dos decimales, Σ $/hora con moneda—
  // porque el cuadro mezclaba cantidades con importes. Las cuatro columnas de andamiaje se fueron: de
  // la D a la H hay cinco importes y nada más, que es lo que el barrido general de moneda ya pinta.
  // Tres reglas menos que puedan volver a apuntar a la columna de al lado.
  // Registro: días y personas enteros, las horas con un decimal.
  fmt(g.f0 - 1, g.fTotalReal, 3, 5, ENTERO)
  fmt(g.f0 - 1, g.fTotalReal, 5, 7, HORAS)
  // La columna «Estado» del registro dice "pagada el 18/5" o "cerrada · a pagar": es una FRASE. Sale
  // de una FÓRMULA, así que el pase por contenido la saltea —ve un `=`— y se quedaba con el formato
  // de moneda del barrido general. Hoy el texto se dibuja igual, pero es la misma celda que el día
  // que rinda un número lo publica como pesos; y es el cuadro 5, que el dueño mandó revisar entero.
  // Los dos bloques mensuales ya tenían su regla equivalente diez líneas más abajo.
  fmt(g.f0 - 1, g.fTotalReal, ANCHO - 2, ANCHO - 1, { type: 'TEXT' })
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
  // ═══ EL CUADRO DE PAGO NO TIENE NINGUNA COLUMNA DE FECHA (14/08) ═══
  //
  // Acá se le devolvía formato de FECHA a la columna «Cuándo» del hero anterior. Esa columna se fue con
  // el rediseño: la fecha de caja de la quincena vive AHORA en el subtítulo del bloque, en una sola
  // celda de la columna A y por fórmula, que es donde el ojo la busca ("se paga el 17/8") y donde no
  // puede quedar en la misma fila que un importe.
  //
  // Lo que sí necesita trato propio es la columna «Horas»: es una CANTIDAD en un cuadro de plata, y el
  // barrido general de moneda la dibuja "$1.223" — el mismo defecto que este bloque ya arregló tres
  // veces en otras columnas, ahora del otro lado.
  // «Personas» es una CANTIDAD y «Cuándo» una FECHA, las dos adentro de un cuadro de plata. Sin este
  // trato el barrido general las dibuja "$16" y "$46.251".
  const cPersonas = g.hero?.cols?.indexOf('Personas') ?? -1
  if (cPersonas >= 0) fmt(g.hero.f0 - 1, g.hero.total, cPersonas, cPersonas + 1, ENTERO)
  const cCuando = g.hero?.cols?.indexOf('Cuándo') ?? -1
  if (cCuando >= 0) fmt(g.hero.f0 - 1, g.hero.fFin, cCuando, cCuando + 1, { type: 'DATE', pattern: 'dd/mm/yyyy' })
  // ═══ LA NOTACIÓN DEL ESCENARIO: LO PAGADO SE VE DISTINTO DE LO PROYECTADO ═══
  //
  // El dueño, segundo rechazo (13/08): *"no logro entender … si ya esta el monto proyectado o es lo
  // real"*. Que el escenario tenga columna propia no alcanza si las dos columnas se dibujan igual: el
  // ojo baja por una fila de números idénticos y no tiene ninguna señal de cuál es un hecho.
  //
  // La regla es la de UNIFY (IBCS, hoy ISO 24896 «Notation for business reporting»): un mismo
  // significado, la misma notación, EN TODA la pestaña. Acá son dos marcas y valen para los cuatro
  // cuadros —el hero, el calendario, oficina y dirección—:
  //   · LO PAGADO      → negrita, tinta plena. Es un hecho: la plata salió.
  //   · LO PROYECTADO  → itálica y tinta apagada. Es una estimación del motor salarial.
  // El comprometido queda en redonda: es un hecho (el trabajo está hecho) que todavía no salió.
  //
  // NO HAY LEYENDA, Y ES A PROPÓSITO. Los encabezados ya dicen «Ya pagado» y «Proyectado»; una fila
  // que explique la itálica sería la prosa que el dueño rechazó dos veces. El formato refuerza el
  // rótulo, no lo reemplaza.
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
  // ── EL CUADRO DE PAGO: UN SOLO ESCENARIO (AC), Y DOS NÚMEROS QUE MANDAN ──
  //
  // No lleva itálica en ninguna celda, y eso ES la notación: todo lo que hay adentro es real —horas
  // cargadas, tarifas de convenio, adelantos entregados—. La proyección tiene su propio bloque abajo.
  if (g.hero?.personas) {
    const cBanco = g.hero.cols.indexOf('Por banco')
    const cEfec = g.hero.cols.indexOf('En efectivo')
    // LA FILA DE TOTAL, ENTERA EN ACENTO. Es el renglón que remata el cuadro y se lee de un vistazo por
    // su color, no por su tamaño: a 13 pt un importe de doce dígitos queda al borde de cortarse contra
    // los 112 px de la columna.
    escenario(g.hero.total - 1, g.hero.total, 0, ANCHO_HERO, { bold: true, color: ACENTO, size: 11 })
    // ── Y LOS DOS QUE DECIDEN, UN CUERPO MÁS ──
    // «Por banco» es cuánto se transfiere del Santander y «En efectivo» cuánto hay que sacar en
    // billetes. Son las dos cifras con las que el dueño opera el pago: van más grandes que el resto del
    // total, que es la jerarquía que el cuadro anterior le daba a `Falta pagar` — una cifra que no
    // decidía nada.
    reqs.push({
      repeatCell: {
        range: rg(g.hero.total - 1, g.hero.total, cBanco, cEfec + 1),
        cell: { userEnteredFormat: { textFormat: { foregroundColor: ACENTO, bold: true, fontSize: 12, fontFamily: 'Arial' } } },
        fields: 'userEnteredFormat.textFormat',
      },
    })
  }
  // ── ESTIMADO CONTRA REAL: CADA COLUMNA CON SU TIPO, BUSCADA POR RÓTULO ──
  //
  // Cinco tipos distintos en ocho columnas, y el barrido general de moneda los pinta a todos como
  // pesos: sin este bloque «Cuándo» sale "$46.248", «Movimientos» "$14" y el Δ % "$0". Es el mismo
  // defecto que esta pestaña ya arregló cuatro veces en otros cuadros.
  if (g.contraste) {
    const cx = (rotulo) => g.contraste.cols.indexOf(rotulo)
    const r0 = g.contraste.f0 - 1
    const r1 = g.contraste.fFin
    fmt(r0, r1, cx('Cuándo'), cx('Cuándo') + 1, { type: 'DATE', pattern: 'dd/mm/yyyy' })
    fmt(r0, r1, cx('Movimientos'), cx('Movimientos') + 1, ENTERO)
    // EL DELTA LLEVA LAS TRES SECCIONES CON LA DEL MEDIO ESCRITA. Un patrón "0.0%;;—" deja los
    // negativos INVISIBLES, y acá el caso que importa es justamente el negativo: que el banco haya
    // pagado MENOS de lo estimado es el que dice que la proyección no se puede creer.
    fmt(r0, r1, cx('Δ %'), cx('Δ %') + 1, { type: 'PERCENT', pattern: '0.0%;[Red]-0.0%;"—"' })
    // La última columna es prosa: alineada a la IZQUIERDA para que se derrame hacia la derecha, donde
    // no hay nada, y no hacia atrás encima del porcentaje de al lado.
    textoIzq(r0, r1, cx('De dónde sale el real'), cx('De dónde sale el real') + 1)
    // LA FILA DEL TOTAL EN ACENTO, igual que la de los otros dos cuadros del hero: la notación de un
    // mismo significado es la misma en toda la pestaña (UNIFY / ISO 24896).
    escenario(g.contraste.fFin - 1, g.contraste.fFin, 0, ANCHO_HERO, { bold: true, color: ACENTO, size: 11 })
    // Y SU «Real» EN ITÁLICA APAGADA AUNQUE ESTÉ EN LA FILA DE TOTAL: es una inferencia del acuerdo,
    // no un hecho, y la pestaña ya usa esa marca para exactamente eso. Las dos cosas a la vez porque
    // las dos son ciertas — es el mismo trato que recibe el proyectado del cuadro del año.
    escenario(g.contraste.fFin - 1, g.contraste.fFin, cx('Real'), cx('Real') + 1, { bold: true, italic: true, color: ACENTO, size: 11 })
    // El real del BANCO, en negrita y tinta plena: la plata salió y el extracto lo prueba.
    escenario(g.contraste.f0 - 1, g.contraste.f0, cx('Real'), cx('Real') + 1, { bold: true })
  }
  // ── EL CUADRO DEL AÑO: LA MARCA DEL ESCENARIO, IGUAL QUE EN EL RESTO DEL LIBRO ──
  //
  // La regla es la de UNIFY (IBCS, hoy ISO 24896 «Notation for business reporting»): un mismo
  // significado, la misma notación, EN TODA la pestaña. Lo pagado en negrita y tinta plena —es un
  // hecho, la plata salió—; lo proyectado en itálica y tinta apagada —es el motor salarial estimando—.
  if (g.anio) {
    const [, cProy, cPag] = g.anio.col
    escenario(g.anio.obra - 1, g.anio.direccion, cProy, cProy + 1, { italic: true })
    escenario(g.anio.obra - 1, g.anio.direccion, cPag, cPag + 1, { bold: true })
    escenario(g.anio.total - 1, g.anio.total, 0, ANCHO_HERO, { bold: true, color: ACENTO, size: 11 })
    // ═══ Y LA MARCA DEL ESCENARIO SOBREVIVE AL TOTAL (13/08, visto en el render) ═══
    //
    // Con la fila entera en acento, el proyectado se dibujaba idéntico al ya pagado JUSTO en el renglón
    // más leído del bloque. El acento dice "esto es el total"; la itálica sigue diciendo "esto es una
    // estimación". Las dos cosas a la vez, porque las dos son ciertas.
    escenario(g.anio.total - 1, g.anio.total, cProy, cProy + 1, { bold: true, italic: true, color: ACENTO, size: 11 })
  }
  // El calendario es proyección de punta a punta —son las quincenas que FALTAN—: sus cinco columnas de
  // importe van en itálica apagada, Y SU FILA DE TOTAL TAMBIÉN (en negrita, que es lo que la hace
  // total). Lo mismo la columna «Proyectado» de los dos bloques mensuales, y en negrita su columna
  // «Pagado», que es lo que ya salió.
  escenario(g.p0 - 1, g.p0 + g.nProy - 1, 3, 8, { italic: true })
  escenario(g.fTotalProy - 1, g.fTotalProy, 3, 8, { italic: true, bold: true, color: INK })
  for (const [r0, r1] of [[g.o0, g.oFin], [g.d0, g.dFin]]) {
    escenario(r0 - 1, r1, 7, 8, { italic: true })
    escenario(r0 - 1, r1, 2, 3, { bold: true })
  }
  // Y en el registro, la columna TOTAL de cada quincena: todo lo que está ahí ya se trabajó.
  escenario(g.f0 - 1, g.fTotalReal - 1, 10, 11, { bold: true })
  for (const f of g.ratios) fmt(f - 1, f, 1, 2, { type: 'PERCENT', pattern: '0.0%;[Red]-0.0%;"—"' })
  // LOS ENCABEZADOS DE TABLA Y LA NOTA DE VIGENCIA VAN COMO TEXTO. La moneda de arriba pinta toda la
  // grilla; sobre estas cuatro filas —"Hasta", "Personas", "Banco"…, y "CCT 76/75, Zona A"— eso deja
  // texto en una celda de moneda, que con un número del hero más arriba en la misma columna el
  // detector ya no reconoce como encabezado. Se les devuelve el formato de texto al final, después
  // de la moneda. Sólo el numberFormat: la alineación a la derecha, que acompaña a los números de
  // abajo, se conserva.
  for (const f of [...g.encabezados, g.fVig]) {
    reqs.push({
      repeatCell: {
        range: rg(f - 1, f, 1, ANCHO),
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
