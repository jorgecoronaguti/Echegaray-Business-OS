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
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { columna, aRangoApi, verificarRangos, explicarProblemas } from '../lib/rangos-con-nombre.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { seccion, sub, total as rotuloTotal, auditarPatron } from '../lib/patron-pestana.mjs'
import { skinRequests } from '../lib/estilo-statement.mjs'
import { requestsTextoPorContenido } from '../lib/formato-texto-por-contenido.mjs'
// SIN `vaciarColumnaDeProsa` (06/08): esta pestaña NO TIENE columna de prosa — su última columna es
// "Pagado el", la del dueño. Importarla era la invitación a volver a llamarla, que es exactamente la
// 4ª reincidencia del borrado de sus catorce fechas.
import { borrarNotas } from '../lib/nota-celda.mjs'
import { detectarQuincenas, filasQuincenas } from '../lib/nomina-sync.mjs'
import {
  CATEGORIAS, CATEGORIA_ANCLA, COL as UOCRA_COL, HOJA as UOCRA_HOJA,
  parsearAcuerdos, escalonDe, estadoReplica, ultimoEscalon,
} from '../lib/uocra-acuerdos.mjs'
import {
  PARAMETROS_MOTOR, PARAMETRO_MESES_BASE, RANGO_MESES_BASE,
  ultimaQuincenaCerrada, categoriasDelBloque, personasDelBloque,
  mesesDelMotor, filasPlantel, filasEscalon, formulaSigmaDelMes, formulaFactorDelMes,
  formulaHorasPorPersona, lineaEstadoReplica, formulaConvenioPendiente, factorUocraEntre,
  formulaSigmaConvenio, lineaSupuestoConvenio, sigmaConvenioDelPlantel,
} from '../lib/motor-salarial.mjs'
import { VERIFICADA_EL, VIGENCIA_HASTA, contrastarEscala, tramoDe } from '../lib/uocra-paritaria.mjs'
import { registrarSincronizacion } from '../lib/registrar-sincronizacion.mjs'
import { JORNALES_FILE_ID } from '../lib/espejo-jornales.mjs'
import { formulaUltimaFechaConImporte, rotuloAlDia } from '../lib/fecha-de-frescura.mjs'
import { formulaSePagaEl, PARAMETROS } from '../lib/jornales-fecha-pago.mjs'
import {
  NOMBRES_DIRECCION, PARAMETRO_DIA_PAGO, formulaRetiroMensual, formulaPrimerRetiro,
  formulaPrimerRetiroDe, formulaPagadoMes, formulaSePagaElDireccion, formulaProyectadoMes,
} from '../lib/direccion-retiros.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Jornales por Quincena'
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
const ANCHO = 14
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
const TODOS_LOS_PARAMETROS = (escalones = []) => [...PARAMETROS, PARAMETRO_DIA_PAGO, ...PARAMETROS_MOTOR(escalones)]
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
    out.push({ desde: new Date(d), hasta: finTramo })
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
  escalonVigente = null, meses = [], hoy = new Date(),
  // EL MES DE LA ÚLTIMA QUINCENA CERRADA DE OBRA. No siempre es el primero del cuadro 1.2: cuando la
  // planilla de Oficina va atrasada, su mes entra antes y ancla la tabla. Ver `filasEscalon`.
  periodoBase = null,
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

  // ── HERO: la posición, en cuatro números ──
  // Las fórmulas apuntan a filas que todavía no existen. Se resuelven al final, cuando se conocen.
  //
  // LO CERRADO Y LO EN CURSO NO SE SUMAN EN LA MISMA LÍNEA. Antes decía "Pagado hasta hoy" e incluía
  // la quincena en curso como si estuviera pagada. No lo está: al 23/07 la del 16/07–31/07 tiene
  // horas cargadas hasta el 21 y le faltan nueve días. Presentar una quincena a mitad de camino
  // junto a las cerradas es mezclar un hecho con algo que todavía se está formando.
  // ═══ CINCO CIFRAS, NO CATORCE (06/08) ═══
  //
  // El dueño: "separar real / comprometido / proyectado". El hero anterior tenía catorce líneas —tres
  // formas de pago, dos de registro, obra, oficina y dirección por separado— y ninguna contestaba la
  // pregunta de arriba de todo. Peor: dos de ellas daban cero y quedaban mudas.
  //
  // Las tres particiones NO SE SOLAPAN y suman el titular exactamente:
  //   REAL         — tiene fecha en "Pagado el": la plata salió y el banco lo prueba.
  //   COMPROMETIDO — trabajo hecho y no pagado. Incluye la parte YA CARGADA de la quincena en curso:
  //                  esas horas se trabajaron y se deben, aunque la quincena no haya cerrado.
  //   PROYECTADO   — lo que el motor estima de acá a diciembre, en los tres grupos.
  // El detalle de por qué canal salió cada peso bajó al registro (sección 5), que es donde viven sus
  // columnas; acá arriba sólo va lo que se lee de un vistazo.
  const fHero = { costo: 0, real: 0, comprometido: 0, falta: 0, proximo: 0 }
  push(['JORNALES Y SUELDOS — la posición'])
  fHero.costo = push([rotuloTotal('Costo de la nómina en el año')])
  fHero.real = push([sub('REAL — ya salió de la caja')])
  fHero.comprometido = push([sub('COMPROMETIDO — hecho, sin pagar')])
  fHero.falta = push([sub('PROYECTADO — a diciembre, motor salarial')])
  fHero.proximo = push([sub('Próximo pago')])
  // QUÉ NO ESTÁ ACÁ ADENTRO, DICHO EN LA PESTAÑA. El dueño: "¿está considerando lo que se le debe
  // pagar a la nómina en SAC y vacaciones? ¿eso está en cargas sociales?". No y sí: este cuadro es
  // jornal y sueldo puros, y el aguinaldo vive en Cargas Sociales §6 (pagado real de Compras y
  // devengado 1/12 de la remuneración). Las vacaciones no están en ninguna parte todavía: falta la
  // antigüedad por legajo y una provisión inventada es peor que una ausente, porque se usa.
  //
  // NO SE COPIA EL NÚMERO ACÁ. Un concepto vive en un solo lugar y se referencia — duplicarlo es lo
  // que hace que el mismo dato tenga dos versiones distintas en dos pestañas. Lo que sí corresponde
  // es que el titular no se lea como si fuera el costo total de la nómina, porque no lo es.
  push([sub('No incluye SAC, vacaciones ni cargas sociales'), VACIO, 'ver Cargas Sociales'])
  blanco()

  // ══ 1 · LO QUE FALTA PAGAR — EL MOTOR ══
  //
  // La proyección anterior era una extrapolación lineal con maquillaje: Σ$/hora de la quincena EN
  // CURSO × 6,7 horas (el promedio del año entero) × factor IPC. El razonamiento completo —y las
  // cuatro formas en que eso mentía sin dar error— está en lib/motor-salarial.mjs. Acá se ve el
  // resultado: el plantel abierto por categoría, el escalón del convenio mes por mes con su acuerdo
  // al lado, y recién después las quincenas.
  push([seccion(1, 'Obra — lo que falta pagar, quincena por quincena hasta fin de año')])
  push([lineaEstadoReplica(escalones, hoy)])
  // EL SUPUESTO, DICHO CON EL DATO QUE LO RESPALDA Y SIN UN SOLO MES ESCRITO A MANO. El rótulo del
  // acuerdo sale de la réplica ya parseada: el día que se pegue un acuerdo nuevo, esta línea cambia
  // sola. Un mes escrito en el código envejece el día siguiente y nadie se entera.
  const ultAc = ultimoEscalon(escalones)
  push([sub('las tres proyecciones —obra, oficina y dirección— suben por la PARITARIA UOCRA, no por el IPC'
    + (ultAc ? `: ${ultAc.rotulo}, con acuerdo hasta el ${VIGENCIA_HASTA}` : '')
    + '. Después de esa fecha se repite el último tramo firmado, y eso es PROYECCIÓN, no acuerdo.')])

  // ── 1.1 · EL PLANTEL BASE ──
  push([seccion('1.1', 'El plantel base — la última quincena CERRADA, abierta por categoría')])
  // LO QUE FALTA PARA QUE EL CONTROL HABLE, UNA SOLA VEZ Y CONTADO. Estaba una vez por fila, adentro
  // de la columna "Estado": cuatro renglones idénticos pidiendo lo mismo. Se resuelve más abajo,
  // cuando se conocen las filas de las categorías.
  const fConvenio = push([VACIO])
  const plantel = filasPlantel({
    hoja: ESPEJO, bloque: bloqueBase, categorias, personas: personasBase,
    filaInicio: filas.length + 1, escalonVigente,
  })
  for (const f of plantel.filas) push(f)
  filas[fConvenio - 1][0] = formulaConvenioPendiente(plantel.fPrimera, plantel.fUltima, plantel.equivalencias)
  const fPlantel = plantel.fTotal
  blanco()

  // ── 1.2 · EL ESCALÓN, MES POR MES ──
  push([seccion('1.2', 'El escalón del convenio, mes por mes — de dónde sale cada aumento')])
  // LA BASE DE LA PROYECCIÓN ES EL CONVENIO, NO EL JORNAL PACTADO (07/08, orden del dueño). Sale de las
  // DOS columnas del bloque de arriba —personas por categoría × básico del convenio—, las dos fórmulas
  // vivas: un alta o un cambio de categoría la mueven sin tocar una celda. Por qué y quién lo hereda,
  // en lib/proyeccion-convenio.mjs.
  const sigmaConvenio = escalonVigente ? formulaSigmaConvenio(plantel.fPrimera, plantel.fUltima) : null
  // LA LÍNEA LA DECIDE EL CUADRO, NO LA INTENCIÓN. Se reserva la fila y se llena DESPUÉS de armar el
  // escalón, cuando `esc.alConvenio` dice qué base quedó de verdad: tener la escala a mano no alcanza
  // —si el mes del escalón no está en el cuadro no hay dónde anclar y el motor cae al pactado—. Una
  // línea que anuncia el convenio arriba de un cuadro que usa el pactado es peor que no tenerla.
  const fSupuesto = push([VACIO])
  // La celda de la Σ $/hora PACTADA del plantel base es la COLUMNA C de la fila de total de 1.1 — no la
  // B, que es la cantidad de personas. Se pasa la celda entera y no el número de fila justamente para
  // que la letra no se pueda perder por el camino. Viaja igual: es el respaldo para cuando la réplica
  // del convenio no traiga escala, y en ese caso la línea de arriba lo declara en la pestaña.
  const esc = filasEscalon({
    meses, escalones, filaInicio: filas.length + 1, celdaSigmaBase: `$C$${fPlantel}`, periodoBase,
    celdaSigmaConvenio: sigmaConvenio, periodoConvenio: escalonVigente?.periodo ?? null,
  })
  filas[fSupuesto - 1][0] = lineaSupuestoConvenio({
    sigma: esc.alConvenio ? sigmaConvenio : null, celdaPersonas: `$B$${fPlantel}`,
  })
  for (const f of esc.filas) push(f)
  blanco()

  // ── 1.3 · LAS QUINCENAS ──
  push([seccion('1.3', 'Las quincenas que faltan hasta diciembre')])
  const fHpd = push([sub('Horas por persona y día — medidas')])
  // EL ENCABEZADO DICE CUÁL DE LAS DOS Σ ES. Dejarlo en "Σ $/hora del mes" con la base cambiada sería
  // el rótulo que hace creer que el número significa otra cosa — el mismo defecto que tenía "Ajuste
  // inflación" en Oficina después de dejar de ajustar por inflación.
  push(['Quincena', 'Hasta', 'Se paga el', 'Días hábiles', 'Personas', 'Horas por persona',
    esc.alConvenio ? 'Σ $/hora convenio' : 'Σ $/hora pactada', 'Proyectado'])
  const p0 = filas.length + 1
  pendientes.forEach((q, i) => {
    const r = p0 + i
    push([
      // La primera arranca el día siguiente al último con HORAS CARGADAS; las demás encadenan. Así la
      // quincena en curso queda partida en su parte real y su parte proyectada, y el mes de transición
      // deja de sumar una quincena a medio cargar MÁS una quincena entera (defecto A8).
      i === 0 ? fecha(q.desde) : `=B${r - 1}+1`,
      `=IF(DAY(A${r})<16;DATE(YEAR(A${r});MONTH(A${r});15);EOMONTH(A${r};0))`,
      // LA FECHA DE CAJA. Una quincena proyectada nunca tiene lote en el banco, así que acá manda el
      // parámetro — pero la fórmula es la MISMA que en el registro, para que el día que el pago
      // aparezca en el extracto la fila se corrija sola sin que nadie la toque.
      pago(r),
      `=NETWORKDAYS(A${r};B${r})`,
      `=$B$${fPlantel}`,
      `=$B$${fHpd}`,
      // Σ $/hora del plantel YA AJUSTADO al escalón del mes de esta quincena. Se busca por el fin de
      // mes en el cuadro 1.2: si el mes no está ahí devuelve vacío, no cero — un cero se multiplicaría
      // por los días y diría "$0 de jornales", que es una mentira redonda.
      formulaSigmaDelMes(`A${r}`, esc),
      `=IFERROR(G${r}*F${r}*D${r};"")`,
    ])
  })
  // Los huecos internos también son MÍOS: con `''` el generador preservaría la fórmula que el
  // layout anterior tenía en esa misma celda, y quedaría un #VALUE! al lado del total bueno.
  const fTotalProy = push([rotuloTotal('Total a pagar hasta diciembre'), ...Array(6).fill(VACIO), `=SUM(H${p0}:H${p0 + pendientes.length - 1})`])
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
  push([seccion(2, 'Oficina — sueldos, mes por mes hasta fin de año')])
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
  push([ultimoDiaOfi
    ? `   · la planilla de Oficina llega al ${fecha(ultimoDiaOfi)} — de ahí en adelante es PROYECCIÓN sobre el último mes pagado, ajustada por inflación. No es un dato: cargá el mes en la planilla y aparece solo.`
    : '   · la planilla de Oficina no tiene ningún mes cargado: todo lo de abajo es proyección.'])
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
  push(['Mes', 'Personas', 'Pagado', 'Estado', 'Se paga el', 'Banco', 'Ajuste escalón', 'Proyectado'])
  const o0 = filas.length + 1
  MESES.forEach((nombre, i) => {
    const r = filas.length + 1
    const bs = bloquesOfi.filter((b) => b.mes === i + 1)
    const pagado = bs.length
      // Un mes puede venir partido en dos bloques en la planilla (un pago a mitad de mes y otro a
      // fin): se suman, porque lo que se cobra es el mes.
      ? `=${bs.map((b) => `SUM('${ESPEJO_OFI}'!Z${b.inicio}:Z${b.fin})`).join('+')}`
      : VACIO
    const personas = bs.length ? `=MAX(${bs.map((b) => `COUNT('${ESPEJO_OFI}'!A${b.inicio}:A${b.fin})`).join(';')})` : VACIO
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
    const ajuste = bs.length ? VACIO
      : formulaFactorDelMes(`EOMONTH(DATE(${AÑO};${i + 1};1);0)`, esc,
        ultimoDiaOfi ? `EOMONTH(DATE(${ultimoDiaOfi.getFullYear()};${ultimoDiaOfi.getMonth() + 1};1);0)` : null)
    // La palabra en la fila: cada mes sin cargar dice que es proyección, ahí donde se lo lee.
    // La fecha de caja del mes: fin de mes + el desfase de pago de la obra. Por fórmula, para que se
    // mueva sola si se corrige el parámetro — y visible, para que el criterio se pueda discutir.
    const pago = `=EOMONTH(DATE(${AÑO};${i + 1};1);0)+JORNALES_DESFASE_PAGO`
    // LA COLUMNA "Banco" VA CON CADENA VACÍA, NO CON EL CENTINELA (03/08). Es la causa raíz de que
    // `OFICINA_BANCO` tuviera 0 celdas con dato desde el día que se publicó, y con él las dos líneas
    // de sueldos de administración de CAJA en $0 sin un solo error. El comentario de arriba decía
    // —desde el primer día— que estas celdas NO se emiten para que la fusión preserve lo que carga el
    // dueño; el código las emitía con VACIO, que significa exactamente lo contrario ("es mi celda y
    // va vacía") y el worker se las borraba cada 2 h. Es el mismo defecto que ya le costó dos veces
    // las fechas de "Pagado el". `''` = "no es mía, preservá lo que haya".
    push([nombre, personas, pagado, bs.length ? 'pagado' : 'proyección', pago, '', ajuste,
      bs.length ? VACIO : `=$B$${0}*G${r}`]) // la base se completa abajo, cuando se sabe su fila
  })
  const oFin = o0 + MESES.length - 1
  const fTotalOfi = push([rotuloTotal('Oficina — pagado y por pagar en el año'), VACIO,
    `=SUM(C$${o0}:C$${oFin})`, VACIO, VACIO, VACIO, VACIO, `=SUM(H$${o0}:H$${oFin})`])
  // La línea del cash flow lee ESTAS celdas por rango con nombre. Se declara acá, al lado del total,
  // para que quien mire la pestaña sepa que este bloque ya no es decorativo: es la fuente.
  push([sub('el cash flow lee este bloque por rango con nombre: OFICINA_PAGO · OFICINA_PAGADO · OFICINA_PROYECTADO')])
  // La base de la proyección: el último mes con dato. Se resuelve acá porque recién ahora se conocen
  // las filas del bloque.
  const baseOfi = `INDEX($C$${o0}:$C$${oFin};MAX(IF($C$${o0}:$C$${oFin}<>"";ROW($C$${o0}:$C$${oFin})-${o0}+1)))`
  MESES.forEach((_, i) => {
    const r = o0 + i
    if (bloquesOfi.some((b) => b.mes === i + 1)) return
    filas[r - 1][7] = `=ARRAYFORMULA(${baseOfi})*G${r}`
  })
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
  push(['   · no están en la planilla JORNALES: el importe de cada uno es su última carga en Compras, y desde cuándo corre lo dice la fecha de caja de esa carga.'])
  push(['   · "Pagado" son las filas de Compras ya marcadas como pagadas. Mientras no lo estén, el mes va en "Proyectado" y pesa en el calendario de caja.'])
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
  push(['Mes', 'Personas', 'Pagado', 'Estado', 'Se paga el', 'Banco', 'Ajuste escalón', 'Proyectado'])
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
    const ajusteDir = formulaFactorDelMes(`EOMONTH(DATE(${AÑO};${i + 1};1);0)`, esc, 'EOMONTH(TODAY();0)')
    push([MESES[i], `=COUNTIF($B$${dp0}:$B$${dpFin};">0")`, formulaPagadoMes(i + 1, AÑO),
      `=IF(N(C${r})>0;"pagado";IF(N(H${r})>0;"proyección";""))`,
      formulaSePagaElDireccion(i + 1, AÑO), '', ajusteDir,
      formulaProyectadoMes(`E${r}`, `C${r}`, `$B$${fTotalMensual}`, `$E$${fTotalMensual}`, `G${r}`)])
  })
  const dFin = d0 + MESES.length - 1
  const fTotalDir = push([rotuloTotal('Dirección — pagado y por pagar en el año'), VACIO,
    `=SUM(C$${d0}:C$${dFin})`, VACIO, VACIO, VACIO, VACIO, `=SUM(H$${d0}:H$${dFin})`])
  push([sub('el cash flow lee este bloque por rango con nombre: DIRECCION_PAGO · DIRECCION_PAGADO · DIRECCION_PROYECTADO')])
  blanco()

  // ── 4 · CONTROL DE CONVENIO ──
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
  push([seccion(4, 'Control de convenio — ningún jornal por debajo de la escala UOCRA')])
  const estado = estadoReplica(escalones, hoy)
  // EL CONVENIO VA CON SU VIGENCIA, NO FLOTANDO SEIS COLUMNAS A LA DERECHA. "CCT 76/75, Zona A (San
  // Juan)" vivía en la columna G, sin nada alrededor: un rótulo suelto en el medio de la grilla que
  // el ojo no puede asociar a nada. Es la ficha de la escala que esta línea está declarando vigente,
  // así que va en la misma línea. La A derrama sobre las celdas vacías de su derecha.
  const fVig = push([`${estado.mensaje} · CCT 76/75, Zona A (San Juan)`])
  // ═══ EL CONTROL DE LA RÉPLICA CONTRA LA ESCALA VERIFICADA (07/08) ═══
  //
  // Un control nunca se valida contra la misma información que produce. Todo lo de este bloque sale de
  // `_UOCRA_RAW`, que llega por IMPORTHTML: si el sitio cambia de forma, la réplica devuelve una tabla
  // vieja —o la de otra zona— y se ve exactamente igual de sana. La escala verificada a mano contra dos
  // fuentes es lo único que puede notarlo. Habla SÓLO cuando discrepa: un control que repite "todo
  // bien" en cada corrida se vuelve invisible al mes.
  const desvios = contrastarEscala(escalones)
  if (desvios.length) push([sub(`⚠ la réplica no coincide con la escala verificada el ${VERIFICADA_EL}: ${desvios.join(' · ')}`)])
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
  push([sub(proximo
    ? `El escalón que viene — ${proximo.rotulo}${proximo.acuerdo ? ` · ${proximo.acuerdo}` : ''}`
    : `El escalón que viene — SIN ACUERDO PUBLICADO. El último es ${ultimoEscalon(escalones)?.rotulo ?? '—'}: los meses siguientes se proyectan con el aumento esperado de Parámetros y este control no puede opinar sobre ellos.`)])
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
  push([sub('"Se paga el" = el lote de haberes del banco; si todavía no salió, Hasta + Parámetros'),
    VACIO, VACIO, 'escribí una fecha a mano y manda la tuya'])
  // ═══ LA INSTRUCCIÓN BAJÓ DEL HERO A LA COLUMNA DE LA QUE HABLA (06/08) ═══
  //
  // Vivía en la última columna de la fila "Próximo pago" del hero: doscientos caracteres de manual en
  // el bloque que tiene que leerse en tres segundos, y encima en la columna "Pagado el", que es la del
  // dueño. Su lugar es acá, al lado de la columna que explica y junto a la glosa de "Se paga el" —
  // igual que el resto de las glosas de esta pestaña. Y dice lo mismo en la mitad de palabras.
  push([sub('"Pagado el" es tuya: marcá ahí la fecha y la quincena pasa de COMPROMETIDO a REAL, sale del calendario de CAJA y el cash flow la imputa a ESA fecha')])
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
  filas[fHpd - 1][2] = `=IF(N(B${fHpd})=0;"⚠ ninguna quincena cerrada en la ventana: subí «${PARAMETRO_MESES_BASE.rotulo}» en Parámetros";"medido s/ cerradas · "&${RANGO_MESES_BASE}&" meses")`
  // ═══ CERRADA vs EN CURSO: LO DECIDE UNA FÓRMULA, NO UNA CORRIDA DEL AGENTE ═══
  //
  // El dueño: "la última fila de este cuadro está mal porque considera que la quincena que está en
  // curso ya pasó — ¿eso se actualiza de forma automática y autónoma?". Una quincena está CERRADA
  // cuando su último día ya pasó, y eso se escribe `B <= TODAY()` en la columna "Estado" de cada fila
  // del registro (ver el push de arriba): se recalcula solo cada vez que alguien abre la planilla.
  //
  // OJO: "cerrada" mide la QUINCENA (¿ya terminó de trabajarse?), no el PAGO. El hero de esta pestaña
  // no lo usa —parte por REAL / COMPROMETIDO / PROYECTADO, que es otra pregunta— pero el registro sí,
  // y el cash flow imputa por la fecha de caja. Son tres cortes distintos y los tres importan.
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
  filas[fSubtitulo - 1][0] = rotuloAlDia(
    'Jornales de obra y sueldos de oficina · fuente: planilla JORNALES y escala UOCRA',
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
  filas[fCanal.recibo - 1][2] = `=IF(ROUND(B${fCanal.banco}+B${fCanal.adelanto}+B${fCanal.recibo}-SUMPRODUCT(${pagada}*${K});0)=0;"✓ los tres canales suman lo pagado";"⚠ faltan $"&TEXT(SUMPRODUCT(${pagada}*${K})-B${fCanal.banco}-B${fCanal.adelanto}-B${fCanal.recibo};"#,##0")&" sin canal de pago registrado")`
  // ── LAS TRES PARTICIONES ──
  // REAL de obra = las quincenas con "Pagado el" cargado. Es un HECHO: el dueño marcó la fecha.
  const realObra = `SUMPRODUCT(${pagada}*${K})`
  // COMPROMETIDO = todo lo que el registro tiene cargado MENOS lo ya pagado. Sale por diferencia a
  // propósito: así las dos líneas no pueden dejar un hueco ni contarse dos veces, pase lo que pase
  // con las fechas. Incluye la parte cargada de la quincena en curso, que es trabajo hecho y debido.
  filas[fHero.real - 1][1] = `=${realObra}+${cel(fTotalOfi, 'C')}+${cel(fTotalDir, 'C')}`
  filas[fHero.comprometido - 1][1] = `=SUMPRODUCT(ISNUMBER($B$${f0}:$B$${fLast})*${K})-${realObra}`
  filas[fHero.falta - 1][1] = `=${cel(fTotalProy, 'H')}+${cel(fTotalOfi, 'H')}+${cel(fTotalDir, 'H')}`
  filas[fHero.costo - 1][1] = `=B${fHero.real}+B${fHero.comprometido}+B${fHero.falta}`
  // ═══ EL TITULAR PINTABA ENCIMA DE SU PROPIA GLOSA (06/08) ═══
  //
  // Acá iba "registro de obra cargado al 31/07". El titular se dibuja en cuerpo 13 y su columna mide
  // 112px: "$290.986.621" no entra, derrama a la derecha y tapaba las primeras quince letras de esta
  // celda. En pantalla se leía "$290.986.621 a cargado al 31/07" — el archivo ya había bajado de 18 a
  // 13 puntos por este mismo motivo, y con doce dígitos volvió a pasar.
  //
  // No se ensancha la columna ni se achica el titular: la celda SOBRABA. La fecha de corte del
  // registro ya está en el subtítulo de la fila 2 ("· al 31/07/2026"), puesta por la misma fórmula.
  // Era el mismo dato dos veces, y la copia estaba tapada. Menos, no más.
  filas[fHero.comprometido - 1][2] = 'incluye la parte ya cargada de la quincena en curso'
  // ── EL PRÓXIMO PAGO: cuánto, y al lado cuándo ──
  //
  // ═══ LA B ES LA COLUMNA DEL IMPORTE, EN TODA LA PESTAÑA (06/08) ═══
  //
  // La fecha iba en la B y el importe en la C: la única fila del hero donde la columna de los pesos no
  // tenía pesos. Cuatro renglones con plata alineada y el quinto con un 17/08/2026 en su lugar — el
  // ojo baja por la columna de importes y tropieza. Es la regla de columna del patrón, que existe
  // justamente para esto: misma columna, mismo significado.
  //
  // Sale de las dos fuentes de fecha de caja de la pestaña —el registro sin marcar y la proyección—
  // y se queda con la más cercana que no haya pasado. `MINIFS` devuelve 0 cuando no encuentra nada,
  // así que un `MIN` crudo de las dos daría 0 = 30/12/1899: hay que descartar los ceros a mano.
  const minReg = `MINIFS($C$${f0}:$C$${fLast};$N$${f0}:$N$${fLast};"";$C$${f0}:$C$${fLast};">="&TODAY();$K$${f0}:$K$${fLast};">0")`
  const minProy = `MINIFS($C$${p0}:$C$${p0 + pendientes.length - 1};$C$${p0}:$C$${p0 + pendientes.length - 1};">="&TODAY();$H$${p0}:$H$${p0 + pendientes.length - 1};">0")`
  const cuando = `C${fHero.proximo}`
  filas[fHero.proximo - 1][2] = `=IF(MAX(${minReg};${minProy})=0;"";IF(${minReg}=0;${minProy};IF(${minProy}=0;${minReg};MIN(${minReg};${minProy}))))`
  filas[fHero.proximo - 1][1] = `=IF(N(${cuando})=0;"";SUMIFS($K$${f0}:$K$${fLast};$C$${f0}:$C$${fLast};${cuando};$N$${f0}:$N$${fLast};"")+SUMIFS($H$${p0}:$H$${p0 + pendientes.length - 1};$C$${p0}:$C$${p0 + pendientes.length - 1};${cuando}))`

  return {
    filas,
    titular: fHero.costo,
    fechas: [
      ...pendientes.map((_, i) => p0 + i), ...bloques.map((_, i) => f0 + i),
    ],
    // Horas con un decimal · cantidades enteras · el único porcentaje de la pestaña.
    cantidades: [fHpd],
    // Prosa que RINDE una fórmula: el pase por contenido la saltea (empieza con '='). Se declara acá
    // y el formato la pinta TEXTO. col 0-based.
    // …y el CANARIO del plantel (última fila del bloque 1.1, col H): rinde "✓ el bloque del
    // espejo…" por fórmula y sin declararlo la piel lo pintaba de plata (auditor, 06/08).
    celdasDeProsaFormula: [{ fila: fHpd, col: 2 }, { fila: fCanal.recibo, col: 2 }, { fila: plantel.fTotal, col: 7 }],
    enteros: [plantel.fTotal],
    // La única celda del hero que es una FECHA y no plata: la C del próximo pago (la B, como en toda
    // la pestaña, es el importe). Sin esto sale "$46.242".
    fechasHero: [fHero.proximo],
    // El bloque del motor, para el formato: personas enteras, factores con cuatro decimales.
    plantel, esc,
    // POR NOMBRE, NO POR OFFSET. Decía `[fMin + 2]`: al agregar el escalón del mes que viene, el margen
    // nuevo quedó fuera de la lista y un -16,7% se dibujó como "-$0". Es el mismo defecto que ya rompió
    // tres enlaces en este libro — anclar en la posición.
    // `filter(Boolean)`: sin acuerdo publicado, el margen contra el escalón que viene no existe como
    // fila. Un 0 acá pediría formato para la fila 0 y el lote entero de formato se cae.
    ratios: [fMargen, fMargenProx].filter(Boolean),
    nProy: pendientes.length,
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
    p0,
    // LOS ENCABEZADOS DE TABLA Y LA NOTA DE VIGENCIA SON TEXTO, NO PLATA. El formato de moneda cubre
    // toda la grilla de la B a la L, y donde el hero deja un número más arriba en la misma columna, el
    // detector deja de leer "Hasta"/"Personas"/"Banco" como encabezado y los marca como texto en una
    // celda de moneda (12 casos). Se les devuelve el formato de texto DESPUÉS de la moneda.
    encabezados: [p0 - 1, o0 - 1, f0 - 1, dp0 - 1, d0 - 1, plantel.fPrimera - 1, esc.f0 - 1],
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

  // ── EL MOTOR: LA ÚLTIMA QUINCENA CERRADA Y LA ESCALA DEL CONVENIO ──
  //
  // La base NO es la última fila del registro (defecto A2): esa es la quincena a medio cargar. Es la
  // última CERRADA, y su plantel se abre por categoría desde la columna D del espejo — la que hasta
  // hoy no tenía un solo consumidor.
  const cerradaBase = ultimaQuincenaCerrada(bloques, (b) => ultimoDiaCargado(espejo[b.filaFecha - 1] ?? []), hoy)
  const bloqueBase = cerradaBase?.bloque ?? ult
  const categorias = categoriasDelBloque(espejo, bloqueBase)
  const personasBase = personasDelBloque(espejo, bloqueBase)
  console.log(`plantel base: quincena cerrada al ${cerradaBase ? fecha(cerradaBase.hasta) : '—'} · filas ${bloqueBase.inicio}-${bloqueBase.fin} · ${personasBase} persona(s) · categorías ${categorias.join(', ') || '—'}`)

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
  const escalonVigente = escalonDe(escalones, `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`)
  // LA BASE AL 100% DEL CONVENIO, DICHA EN LA CORRIDA. Este número NO es el que se escribe —la pestaña
  // lo calcula por fórmula viva—: es el mismo cálculo por otro camino. Un producto escalar de
  // referencias de celdas se puede escribir mal de mil maneras y ninguna da error; tener el número
  // esperado en el log es lo único que permite notarlo antes de que llegue al Sheet.
  const sigmaConv = sigmaConvenioDelPlantel(espejo, bloqueBase, escalonVigente)
  const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`
  console.log(`convenio 100%: Σ $/hora del plantel al convenio ${pesos(sigmaConv.total)} sobre ${sigmaConv.personas} persona(s)`
    + ` · ${sigmaConv.porCategoria.map((c) => `${c.personas}×${c.convenio} ${pesos(c.basico)}`).join(' · ') || 'sin escala'}`
    + (sigmaConv.sinEscala.length ? ` · ⚠ SIN ESCALA: ${sigmaConv.sinEscala.join(', ')}` : ''))

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
  const meses = mesesDelMotor(cerradaBase?.hasta ?? ultimoDia, pendientes, [ultimoDiaOfi, hoy])
  const baseObra = cerradaBase?.hasta ?? ultimoDia
  const periodoBase = baseObra ? `${baseObra.getFullYear()}-${String(baseObra.getMonth() + 1).padStart(2, '0')}` : null
  // LO QUE ACUMULA LA PROYECCIÓN, EN LA CORRIDA. Es el efecto de todo lo de arriba en un número: si un
  // día sale 1,00 (nadie sube) o 1,80 (alguien encadenó de más), se ve acá y no en el cash flow.
  const acum = periodoBase && meses.length ? factorUocraEntre(periodoBase, meses[meses.length - 1].periodo, escalones) : null
  if (acum) console.log(`paritaria: de ${periodoBase} a ${meses[meses.length - 1].periodo} acumula ×${acum.factor.toFixed(4)} · ${acum.mesesProyectados} mes(es) proyectado(s) sin acuerdo`)
  const g = grilla({
    bloques, pendientes, bloquesOfi, pagoPrevio, ultimoDiaOfi,
    escalones, bloqueBase, categorias, personasBase, escalonVigente, meses, hoy, periodoBase,
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
  const previo = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:${String.fromCharCode(64 + ANCHO)}400`)
  let ultima = 0
  previo.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) ultima = i + 1 })
  if (ultima > g.filas.length) {
    console.log(`cola vieja: limpio las filas ${g.filas.length + 1}–${ultima}`)
    // La cola también: 13 centinelas + '' — la columna 14 es del dueño en TODA la pestaña.
    for (let i = g.filas.length; i < ultima; i++) g.filas.push([...Array(ANCHO - 1).fill(VACIO), ''])
  }

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
  const defectos = auditarPatron(v)
  console.log(defectos.length ? `⚠ ${defectos.length} defecto(s) de patrón:` : '✓ la pestaña cumple el patrón de diseño')
  for (const d of defectos.slice(0, 8)) console.log(`   fila ${d.fila} · ${d.regla} · ${d.detalle.slice(0, 110)}`)
  for (const f of v) if (/^(⇒|COSTO DE LA)/.test(String(f?.[0] ?? ''))) console.log(`  ${String(f[0]).slice(0, 46).padEnd(48)}${String(f[1] ?? '').padStart(16)}${String(f[6] ?? '').padStart(16)}${String(f[9] ?? '').padStart(16)}`)

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

  if (errores.length || defectos.length) process.exitCode = 1
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
    columna('JORNALES_PROY_DESDE', { col: 0, r0: g.p0, r1: finProy, encabezado: 'Quincena' }),
    columna('JORNALES_PROY_HASTA', { col: 1, r0: g.p0, r1: finProy, encabezado: 'Hasta' }),
    columna('JORNALES_PROY_PAGO', { col: 2, r0: g.p0, r1: finProy, encabezado: 'Se paga el' }),
    columna('JORNALES_PROY_TOTAL', { col: 7, r0: g.p0, r1: finProy, encabezado: 'Proyectado' }),
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
    columna('OFICINA_BANCO', { col: 5, r0: g.o0, r1: g.oFin, encabezado: 'Banco', contenido: 'dueño' }),
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
    ...skinRequests({ sheetId, filas, cols: ANCHO, congeladas: 2, titular: g.titular, filasHoja: filas.length }),
    // Todo lo que es plata, a la derecha y con cifras tabulares.
    { repeatCell: { range: rg(3, filas.length, 1, ANCHO), cell: { userEnteredFormat: { numberFormat: moneda, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } },
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
  const finProy = g.p0 + g.nProy - 1
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
    // Y LA CUARTA FECHA: "Pagado el", que es la última columna. Se le da formato de FECHA aunque el
    // contenido sea del dueño —el formato es del generador, el dato es suyo—. Sin esto sus fechas se
    // dibujaban "$46.055": el serial con el formato de moneda de la columna de al lado, que es el mismo
    // defecto que este bloque vino a arreglar dos veces (para "Hasta" y para "Se paga el").
    reqs.push({
      repeatCell: {
        range: rg(f - 1, f, ANCHO - 1, ANCHO),
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' } },
        fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
      },
    })
  }
  const ENTERO = { type: 'NUMBER', pattern: '#,##0;-#,##0;"—"' }
  const HORAS = { type: 'NUMBER', pattern: '#,##0.0;-#,##0.0;"—"' }
  // Las horas por persona y día llevan DOS decimales: son 7,166 y con uno solo se dibujan "7,2", que
  // es el número redondeado presentado como el número. Se usa el mismo patrón en la celda medida
  // (`fHpd`) y en las diez filas que la referencian: la misma cifra no puede verse de dos maneras.
  const HORAS_FINAS = { type: 'NUMBER', pattern: '#,##0.00;-#,##0.00;"—"' }
  // Proyección: días hábiles y personas enteros.
  // Todos corridos una columna a la derecha desde el 31/07: entró "Se paga el" en la C.
  fmt(g.p0 - 1, finProy, 3, 5, ENTERO)
  // ═══ DOS FORMATOS QUE APUNTABAN A LA COLUMNA DE AL LADO (06/08) ═══
  //
  // La F de este bloque es "Horas por persona" —7,166— y no tenía formato propio, así que se la comía
  // el barrido de moneda de toda la grilla: la pestaña mostraba "$7" diez veces. La G es "Σ $/hora del
  // mes", que SÍ es plata, y recibía el patrón "0.00" que en el layout viejo era del ajuste por
  // inflación: un coeficiente donde ahora hay pesos, dibujado crudo y sin el $. Ninguno de los dos da
  // error; los dos hacen dudar del cuadro entero. La Σ $/hora del REGISTRO (columna L) va con moneda:
  // las dos columnas dicen lo mismo y ahora se ven igual.
  fmt(g.p0 - 1, finProy, 5, 6, HORAS_FINAS)
  fmt(g.p0 - 1, finProy, 6, 7, moneda)
  // Registro: días y personas enteros, las horas con un decimal.
  fmt(g.f0 - 1, g.fTotalReal, 3, 5, ENTERO)
  fmt(g.f0 - 1, g.fTotalReal, 5, 7, HORAS)
  // Oficina: personas entera y el ajuste por inflación como coeficiente, no como plata.
  fmt(g.o0 - 1, g.oFin, 1, 2, ENTERO)
  // "Se paga el" es una FECHA, no plata: sin esto el formato moneda de todo el ancho la dibuja "$46.235".
  fmt(g.o0 - 1, g.oFin, 4, 5, { type: 'DATE', pattern: 'dd/mm/yyyy' })
  // Dirección: la fecha de pago de cada mes y la fecha "Desde" de la tabla de personas. Sin esto las
  // dos salen como plata —"$46.242"— que es el serial de la fecha con formato de moneda encima.
  // El "Desde" va desde la PRIMERA fila de personas: ahora cada socio trae la suya, no sólo el total.
  fmt(g.d0 - 1, g.dFin, 4, 5, { type: 'DATE', pattern: 'dd/mm/yyyy' })
  fmt(g.dp0 - 1, g.fTotalMensual, 4, 5, { type: 'DATE', pattern: 'dd/mm/yyyy' })
  fmt(g.d0 - 1, g.dFin, 1, 2, ENTERO)
  // La columna "Estado" de los dos bloques mensuales: una palabra, no plata. La de Oficina la resuelve
  // el pase por contenido —son cadenas literales— pero la de Dirección sale de una FÓRMULA, y una
  // fórmula no se puede clasificar sin evaluarla: sin esto, "pagado" queda con formato de moneda.
  fmt(g.d0 - 1, g.dFin, 3, 4, { type: 'TEXT' })
  fmt(g.o0 - 1, g.oFin, 3, 4, { type: 'TEXT' })
  // EL "Ajuste escalón" DE LOS DOS BLOQUES MENSUALES, CON CUATRO DECIMALES Y EL MISMO PATRÓN. Iba con
  // "0.00" —heredado del ajuste por inflación del layout viejo— y un tramo de paritaria de +1,9% se
  // dibuja "1,02": el cuadro parecía decir que los sueldos no se mueven. Es la misma razón por la que
  // el factor de 1.2 lleva cuatro, y ahora las tres columnas del mismo concepto se ven igual.
  const FACTOR = { type: 'NUMBER', pattern: '0.0000;-0.0000;"—"' }
  fmt(g.o0 - 1, g.oFin, 6, 7, FACTOR)
  fmt(g.d0 - 1, g.dFin, 6, 7, FACTOR)
  // `cantidades` es la fila de horas por persona y día: el mismo patrón fino que sus diez referencias.
  for (const f of g.cantidades) fmt(f - 1, f, 1, 2, HORAS_FINAS)
  for (const f of g.enteros) fmt(f - 1, f, 1, 2, ENTERO)
  // ── EL BLOQUE DEL MOTOR ──
  // 1.1: personas enteras; el margen contra el convenio es un porcentaje, no plata.
  if (g.plantel) {
    fmt(g.plantel.fPrimera - 1, g.plantel.fTotal, 1, 2, ENTERO)
    fmt(g.plantel.fPrimera - 1, g.plantel.fTotal, 6, 7, { type: 'PERCENT', pattern: '0.0%;[Red]-0.0%;"—"' })
  }
  // 1.2: el mes es una FECHA (sin esto sale "$46.234"), el escalón del mes y el factor son ratios.
  // El factor lleva CUATRO decimales: con dos, un escalón de +0,4% se dibuja "1,00" y el cuadro
  // parece decir que no sube nada.
  if (g.esc) {
    fmt(g.esc.f0 - 1, g.esc.f1, 0, 1, { type: 'DATE', pattern: 'mmm-yy' })
    fmt(g.esc.f0 - 1, g.esc.f1, 3, 4, { type: 'PERCENT', pattern: '0.0%;[Red]-0.0%;"—"' })
    fmt(g.esc.f0 - 1, g.esc.f1, 4, 5, { type: 'NUMBER', pattern: '0.0000;-0.0000;"—"' })
  }
  // La única celda del hero que es una fecha: la C del próximo pago. La B lleva su importe y se la
  // formatea con la moneda del barrido general, como a las otras cuatro cifras del bloque.
  for (const f of g.fechasHero ?? []) {
    reqs.push({
      repeatCell: {
        range: rg(f - 1, f, 2, 3),
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'LEFT' } },
        fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
      },
    })
  }
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
