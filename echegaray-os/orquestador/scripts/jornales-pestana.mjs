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
//   L   el TOTAL de la quincena
//
// Un solo ancho para toda la pestaña, con la única excepción que el patrón admite: el REGISTRO
// quincena por quincena, que es más ancho y va al final.
//
//   node orquestador/scripts/jornales-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { seccion, sub, total as rotuloTotal, auditarPatron } from '../lib/patron-pestana.mjs'
import { skinRequests } from '../lib/estilo-statement.mjs'
import { borrarNotas } from '../lib/nota-celda.mjs'
import { detectarQuincenas, filasQuincenas } from '../lib/nomina-sync.mjs'
import { CATEGORIAS, COL, formulaValor, formulaVigencia } from '../lib/uocra-escala.mjs'
import { registrarSincronizacion } from '../lib/registrar-sincronizacion.mjs'
import { JORNALES_FILE_ID } from '../lib/espejo-jornales.mjs'
import { formulaSePagaEl, PARAMETROS } from '../lib/jornales-fecha-pago.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Jornales por Quincena'
const ESPEJO = '_J_OBREROS'
/** La otra mitad de la nómina: dos sueldos de oficina, con su propio layout y su propio atraso. */
const ESPEJO_OFI = '_J_OFICINA'
const DRY = process.argv.includes('--dry')
const AÑO = 2026
/** El ancho de la pestaña: el registro de abajo es el bloque más ancho y define la grilla.
 *  Pasó de 12 a 13 el 31/07 al entrar la columna "Se paga el" al lado de Hasta. */
const ANCHO = 13
/** Los doce meses, para el cuadro de oficina: ahí se cobra por MES, no por quincena. */
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
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
function grilla({ bloques, pendientes, bloquesOfi, cargaAlDia, pagoPrevio = [] }) {
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
    while (r.length < ANCHO) r.push(VACIO)
    filas.push(r)
    return filas.length
  }
  const blanco = () => push(Array(ANCHO).fill(VACIO))

  // ── El encabezado de la pestaña ──
  push(['Jornales por quincena'])
  // EL SUBTÍTULO ENTRA EN UN RENGLÓN. El anterior medía 190 caracteres, se envolvía en una fila de
  // 21px y se leía la mitad: un subtítulo cortado es peor que ninguno.
  push([`Jornales de obra y sueldos de oficina · fuente: planilla JORNALES y escala UOCRA · al ${fecha(new Date())}`])
  blanco()

  // ── HERO: la posición, en cuatro números ──
  // Las fórmulas apuntan a filas que todavía no existen. Se resuelven al final, cuando se conocen.
  //
  // LO CERRADO Y LO EN CURSO NO SE SUMAN EN LA MISMA LÍNEA. Antes decía "Pagado hasta hoy" e incluía
  // la quincena en curso como si estuviera pagada. No lo está: al 23/07 la del 16/07–31/07 tiene
  // horas cargadas hasta el 21 y le faltan nueve días. Presentar una quincena a mitad de camino
  // junto a las cerradas es mezclar un hecho con algo que todavía se está formando.
  const fHero = { costo: 0, cerradas: 0, curso: 0, falta: 0, ofiPagado: 0, ofiFalta: 0, plantel: 0 }
  push(['JORNALES Y SUELDOS — lo pagado en el año y lo que falta hasta diciembre'])
  // EL TITULAR ENTRA EN SU COLUMNA. Con la fuente grande del hero, "…de oficina en el año" medía 49
  // caracteres en una columna de 330px que muestra 44, y a su derecha está el importe: se cortaba en
  // vez de derramar. El detalle Obra/Oficina ya está en los sub-ítems de abajo; el titular es la suma.
  fHero.costo = push([rotuloTotal('Jornales de obra y sueldos del año')])
  fHero.cerradas = push([sub('Obra — quincenas cerradas, ya pagadas')])
  fHero.curso = push([sub('Obra — quincena en curso, todavía se está cargando')])
  fHero.falta = push([sub('Obra — falta pagar hasta diciembre')])
  fHero.ofiPagado = push([sub('Oficina — meses pagados')])
  fHero.ofiFalta = push([sub('Oficina — falta pagar hasta diciembre')])
  fHero.plantel = push([sub('Plantel de obra de la última quincena')])
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

  // ── 1 · LO QUE FALTA PAGAR ──
  push([seccion(1, 'Obra — lo que falta pagar, quincena por quincena hasta fin de año')])
  const fSigma = push([sub('Σ $/hora del plantel (última quincena)')])
  const fHpd = push([sub('Horas por persona y por día (medido)')])
  push(['Quincena', 'Hasta', 'Se paga el', 'Días hábiles', 'Personas', 'A valores de hoy', 'Ajuste inflación', 'Proyectado'])
  const p0 = filas.length + 1
  pendientes.forEach((q, i) => {
    const r = p0 + i
    push([
      // La primera arranca el día siguiente al último ya pagado; las demás encadenan.
      i === 0 ? fecha(q.desde) : `=B${r - 1}+1`,
      `=IF(DAY(A${r})<16;DATE(YEAR(A${r});MONTH(A${r});15);EOMONTH(A${r};0))`,
      // LA FECHA DE CAJA. Una quincena proyectada nunca tiene lote en el banco, así que acá manda el
      // parámetro — pero la fórmula es la MISMA que en el registro, para que el día que el pago
      // aparezca en el extracto la fila se corrija sola sin que nadie la toque.
      pago(r),
      `=NETWORKDAYS(A${r};B${r})`,
      `=$B$${0}`, // se completa abajo: no se puede referenciar el hero antes de conocer su fila
      `=$B$${0}*$B$${0}*D${r}`,
      `=IFERROR(INDEX('Parámetros'!$C$74:$C$90;MATCH(EOMONTH(A${r};0);EOMONTH('Parámetros'!$A$74:$A$90;0);0));1)`,
      `=F${r}*G${r}`,
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
  // "Proyectado" va en la MISMA columna que el "Proyectado" de la proyección de obra (H): dos totales
  // del mismo concepto en columnas distintas se leen como dos conceptos distintos.
  push(['Mes', 'Personas', 'Pagado', VACIO, VACIO, VACIO, 'Ajuste inflación', 'Proyectado'])
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
    const ajuste = bs.length ? VACIO : `=IFERROR(INDEX('Parámetros'!$C$74:$C$90;MATCH(EOMONTH(DATE(${AÑO};${i + 1};1);0);EOMONTH('Parámetros'!$A$74:$A$90;0);0));1)`
    push([nombre, personas, pagado, VACIO, VACIO, VACIO, ajuste,
      bs.length ? VACIO : `=$B$${0}*G${r}`]) // la base se completa abajo, cuando se sabe su fila
  })
  const oFin = o0 + MESES.length - 1
  const fTotalOfi = push([rotuloTotal('Oficina — pagado y por pagar en el año'), VACIO,
    `=SUM(C$${o0}:C$${oFin})`, VACIO, VACIO, VACIO, VACIO, `=SUM(H$${o0}:H$${oFin})`])
  // La base de la proyección: el último mes con dato. Se resuelve acá porque recién ahora se conocen
  // las filas del bloque.
  const baseOfi = `INDEX($C$${o0}:$C$${oFin};MAX(IF($C$${o0}:$C$${oFin}<>"";ROW($C$${o0}:$C$${oFin})-${o0}+1)))`
  MESES.forEach((_, i) => {
    const r = o0 + i
    if (bloquesOfi.some((b) => b.mes === i + 1)) return
    filas[r - 1][7] = `=ARRAYFORMULA(${baseOfi})*G${r}`
  })
  blanco()

  // ── 3 · CONTROL DE CONVENIO ──
  push([seccion(3, 'Control de convenio — ningún jornal por debajo de la escala UOCRA')])
  // LA RÉPLICA DEL ACUERDO TRAE SALTOS DE LÍNEA ADENTRO DEL RÓTULO ("Julio\n+2%"): sin aplanarlos, la
  // fila crece a dos renglones y el texto queda cortado por la altura fija.
  const fVig = push([`=SUBSTITUTE(SUBSTITUTE(${formulaVigencia().slice(1)};CHAR(10);" ");CHAR(13);" ")`,
    ...Array(5).fill(VACIO), 'CCT 76/75, Zona A (San Juan)'])
  const ult = bloques[bloques.length - 1]
  const rangoW = ult ? `'${ESPEJO}'!W${ult.inicio}:W${ult.fin}` : null
  const fMin = push([
    rotuloTotal('El jornal por hora más bajo que pagamos'),
    rangoW ? `=IFERROR(MINIFS(${rangoW};${rangoW};">0");"")` : '',
  ])
  const fPiso = push([sub('Básico de Ayudante — el piso del convenio'), formulaValor('Ayudante', COL.basico)])
  push([sub('Margen sobre el piso — negativo = deuda laboral'), `=IF(N(B${fPiso})=0;"";B${fMin}/B${fPiso}-1)`])
  // LA ESCALA DEL CONVENIO, TODA EN LA MISMA UNIDAD QUE LO QUE PAGAMOS: $/hora. Antes cada categoría
  // traía además su jornal diario (= básico × 8), y ese 8 era el único número PEGADO de la pestaña:
  // una "Jornada del convenio (horas)" escrita a mano que ninguna otra celda leía y que sólo servía
  // para una columna decorativa. Mezclar $/hora (el control de arriba) con $/día (la columna) en el
  // mismo bloque es exactamente el defecto de unidad que arruina una planilla financiera. Se deja el
  // básico por hora —comparable de un vistazo contra "el jornal por hora más bajo que pagamos"— y se
  // borra el multiplicador pegado de raíz, en vez de esconderlo en un parámetro que nadie mira.
  push([sub('Escala del convenio, por hora:')])
  for (const cat of CATEGORIAS) {
    push(ES_MENSUAL(cat)
      ? [sub(`${cat} — se paga por mes`), formulaValor(cat, COL.basico)]
      : [sub(cat), formulaValor(cat, COL.basico)])
  }
  blanco()

  // ── 4 · EL REGISTRO ──
  push([seccion(4, 'Obra — el registro, quincena por quincena')])
  // LA GLOSA DE LA COLUMNA NUEVA, EN LA PESTAÑA Y NO SÓLO EN EL CÓDIGO. Quien abre la planilla tiene
  // que poder saber de dónde salió esa fecha y que puede cambiarla, sin preguntarle a nadie.
  push([sub('"Se paga el" = el lote de haberes del banco; si todavía no salió, Hasta + Parámetros'),
    VACIO, VACIO, 'escribí una fecha a mano y manda la tuya'])
  push(['Quincena', 'Hasta', 'Se paga el', 'Días hábiles', 'Personas', 'Hs previstas', 'Hs reales', 'Banco', 'Adelanto', 'Total recibo', 'TOTAL', 'Σ $/hora', 'Estado'])
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
    push([colA, colB, pago(r), ...resto, `=IF(N(B${r})=0;"";IF(B${r}<=TODAY();"cerrada";"en curso"))`])
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
  filas[fSigma - 1][1] = `=INDEX($L$${f0}:$L$${fLast};COUNTA($A$${f0}:$A$${fLast}))`
  filas[fHpd - 1][1] = `=IFERROR(SUM($K$${f0}:$K$${fLast})/SUM($L$${f0}:$L$${fLast})/AVERAGE($D$${f0}:$D$${fLast});0)`
  pendientes.forEach((q, i) => {
    const r = p0 + i
    filas[r - 1][4] = `=INDEX($E$${f0}:$E$${fLast};COUNTA($A$${f0}:$A$${fLast}))`
    filas[r - 1][5] = `=${cel(fSigma, 'B')}*${cel(fHpd, 'B')}*D${r}`
  })
  // ═══ CERRADA vs EN CURSO: LO DECIDE UNA FÓRMULA, NO UNA CORRIDA DEL AGENTE ═══
  //
  // El dueño: "la última fila de este cuadro está mal porque considera que la quincena que está en
  // curso ya pasó — ¿eso se actualiza de forma automática y autónoma?".
  //
  // Una quincena está CERRADA cuando su último día ya pasó. Eso es `B <= TODAY()`, y escrito así se
  // recalcula solo cada vez que alguien abre la planilla: no espera a que corra el agente, no hay una
  // constante que actualizar, y el día que la quincena cierre pasa sola de una línea a la otra.
  // Ninguna persona tiene que acordarse de nada.
  // OJO: "cerrada" mide la QUINCENA (¿ya terminó de trabajarse?), no el PAGO. Son dos preguntas
  // distintas y las dos importan: el hero informa cuánto trabajo está terminado; el cash flow, cuándo
  // sale la plata. Por eso este bloque sigue mirando B (Hasta) y no C (Se paga el) — cambiarlo haría
  // que una quincena cerrada y todavía impaga se leyera como "en curso", que es falso.
  const cerrada = `($B$${f0}:$B$${fLast}<=TODAY())`
  filas[fHero.cerradas - 1][1] = `=SUMPRODUCT(ISNUMBER($B$${f0}:$B$${fLast})*${cerrada}*IF(ISNUMBER($K$${f0}:$K$${fLast});$K$${f0}:$K$${fLast};0))`
  filas[fHero.curso - 1][1] = `=SUMPRODUCT(ISNUMBER($B$${f0}:$B$${fLast})*NOT(${cerrada})*IF(ISNUMBER($K$${f0}:$K$${fLast});$K$${f0}:$K$${fLast};0))`
  // Y al lado, qué quincena es y HASTA QUÉ DÍA está cargada de verdad. Medido sobre las horas del
  // espejo, no sobre las fechas del encabezado: la planilla escribe los catorce días el día que abre
  // la quincena, así que las fechas dicen "31/07" desde el primer día y no distinguen nada.
  // El texto va CORTO: al lado tiene el importe, y uno largo se le monta encima.
  filas[fHero.curso - 1][2] = cargaAlDia ? `cargada hasta el ${cargaAlDia}` : VACIO
  filas[fHero.falta - 1][1] = `=${cel(fTotalProy, 'H')}`
  filas[fHero.ofiPagado - 1][1] = `=${cel(fTotalOfi, 'C')}`
  filas[fHero.ofiFalta - 1][1] = `=${cel(fTotalOfi, 'H')}`
  filas[fHero.costo - 1][1] = `=B${fHero.cerradas}+B${fHero.curso}+B${fHero.falta}+B${fHero.ofiPagado}+B${fHero.ofiFalta}`
  filas[fHero.plantel - 1][1] = `=INDEX($E$${f0}:$E$${fLast};COUNTA($A$${f0}:$A$${fLast}))`

  return {
    filas,
    titular: fHero.costo,
    fechas: [
      ...pendientes.map((_, i) => p0 + i), ...bloques.map((_, i) => f0 + i),
    ],
    // Horas con un decimal · cantidades enteras · el único porcentaje de la pestaña.
    cantidades: [fHpd],
    enteros: [fHero.plantel],
    ratios: [fMin + 2],
    nProy: pendientes.length,
    // Las filas de oficina (cargadas + proyectadas) para que reciban el mismo formato que las de
    // obra: sin esto la columna "Hasta" mostraba $46.037 —el número de serie de la fecha con formato
    // de moneda— y el ajuste por inflación salía como "$1".
    o0, oFin, fCurso: fHero.curso,
    fMin,
    fTotalProy,
    fTotalReal,
    f0,
    p0,
    // LOS ENCABEZADOS DE TABLA Y LA NOTA DE VIGENCIA SON TEXTO, NO PLATA. El formato de moneda cubre
    // toda la grilla de la B a la L, y donde el hero deja un número más arriba en la misma columna, el
    // detector deja de leer "Hasta"/"Personas"/"Banco" como encabezado y los marca como texto en una
    // celda de moneda (12 casos). Se les devuelve el formato de texto DESPUÉS de la moneda.
    encabezados: [p0 - 1, o0 - 1, f0 - 1],
    fVig,
  }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // ── EL ESPEJO ES LA FUENTE. Si vino vacío no se escribe: un cuadro en cero es peor que uno viejo.
  const espejo = await google.readSheetValues(ID, `${ESPEJO}!A1:AC990`)
  const bloques = detectarQuincenas(espejo ?? [])
  if (!bloques.length) { console.error(`no encontré ninguna quincena en ${ESPEJO}: corré primero espejar-jornales.mjs`); process.exit(1) }

  const ult = bloques[bloques.length - 1]
  const ultimoDia = ultimoDiaCargado(espejo[ult.filaFecha - 1] ?? [])
  const desde = ultimoDia ? new Date(ultimoDia.getTime() + 86400000) : null
  const pendientes = quincenasPendientes(desde)
  // HASTA QUÉ DÍA HAY HORAS DE VERDAD. La quincena en curso declara sus catorce fechas desde el día
  // que se abre, así que "el último día del encabezado" no dice nada sobre cuánto está cargado.
  const conHoras = ultimoDiaConHoras(espejo, ult)
  const cargaAlDia = conHoras ? fecha(conHoras).slice(0, 5) : null
  console.log(`obra: ${bloques.length} quincena(s) · último día del encabezado ${ultimoDia ? fecha(ultimoDia) : '—'} · con horas cargadas hasta ${cargaAlDia ?? '—'} · ${pendientes.length} por proyectar`)

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

  const g = grilla({ bloques, pendientes, bloquesOfi, cargaAlDia, pagoPrevio })
  console.log(`grilla: ${g.filas.length} filas × ${ANCHO} columnas`)
  const aMano = g.filas.filter((f) => f[2] === '').length
  if (aMano) console.log(`  ✋ ${aMano} fecha(s) de pago escrita(s) a mano: no las toco`)
  if (DRY) { for (const f of g.filas) console.log('   ', f.filter((c) => c && c !== VACIO).map((x) => String(x).slice(0, 34)).join(' | ')); return }

  const hojas = await google.getSheetMeta(ID)
  const hoja = hojas.find((h) => h.title === PESTAÑA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTAÑA}"`)

  // EL PARÁMETRO SE ASEGURA ANTES DE ESCRIBIR LA GRILLA. Las fórmulas de "Se paga el" citan
  // JORNALES_DESFASE_PAGO y JORNALES_VENTANA_BANCO por nombre: si los nombres no existen todavía, la
  // columna entera queda en #NAME? hasta la corrida siguiente.
  await asegurarParametros(google, hojas).catch((e) => console.warn(`  ⚠ no pude asegurar los parámetros de fecha de pago: ${e.message}`))

  // La cola de la pestaña vieja: se marca VACIO —"es mi celda y va vacía"— así se limpia lo que
  // dejaron los generadores anteriores sin tocar lo que haya escrito una persona.
  const previo = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:${String.fromCharCode(64 + ANCHO)}400`)
  let ultima = 0
  previo.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) ultima = i + 1 })
  if (ultima > g.filas.length) {
    console.log(`cola vieja: limpio las filas ${g.filas.length + 1}–${ultima}`)
    for (let i = g.filas.length; i < ultima; i++) g.filas.push(Array(ANCHO).fill(VACIO))
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
  const { conservadas } = await escribirPreservando(google, ID, `'${PESTAÑA}'`, grid, { respetar: false /* la Regla 0 ya se aplicó arriba, a mano: este generador guarda el registro DESPUÉS de releer la pestaña, que es más fiel que hacerlo antes de escribir */, anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
  if (conservadas.length) console.log(`✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)

  await formatear(google, hoja.sheetId, grid, g)
  await publicarRangos(google, hoja.sheetId, g)

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
 * @returns {{rango:string, rotulo:string, fila:number, nuevo:boolean, valor:any, nota:string}[]}
 */
export function ubicarParametros(filas = []) {
  const norm = (s) => String(s ?? '').trim().toLowerCase()
  let libre = 0
  filas.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) libre = i + 1 })
  // Una fila en blanco de separación: el bloque nuevo no se pega al último de la pestaña.
  libre += 2
  return PARAMETROS.map((p) => {
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
async function asegurarParametros(google, hojas) {
  const TAB = 'Parámetros'
  const hoja = hojas.find((h) => h.title === TAB)
  if (!hoja) { console.warn(`  ⚠ no existe la pestaña "${TAB}": los parámetros de fecha de pago quedan en su valor por defecto`); return }

  const filas = await google.readSheetValues(ID, `'${TAB}'!A1:C400`).catch(() => [])
  const ubic = ubicarParametros(filas)

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
  console.log(`parámetros de fecha de pago: ${ubic.map((p) => `${p.rango}=${TAB}!B${p.fila}`).join(' · ')}`)
}

async function publicarRangos(google, sheetId, g) {
  const finProy = g.p0 + g.nProy - 1
  const rango = (c0, r0, r1) => ({ sheetId, startRowIndex: r0 - 1, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c0 + 1 })
  const quiero = {
    JORNALES_REAL_DESDE: rango(0, g.f0, g.fTotalReal - 1),
    JORNALES_REAL_HASTA: rango(1, g.f0, g.fTotalReal - 1),
    // LA FECHA DE CAJA (31/07). Es la que usa la línea de jornales del cash flow; HASTA queda como
    // fallback y como la fecha del DEVENGAMIENTO, que es otra pregunta y otra pestaña.
    JORNALES_REAL_PAGO: rango(2, g.f0, g.fTotalReal - 1),
    JORNALES_REAL_TOTAL: rango(10, g.f0, g.fTotalReal - 1),
    JORNALES_PROY_DESDE: rango(0, g.p0, finProy),
    JORNALES_PROY_HASTA: rango(1, g.p0, finProy),
    JORNALES_PROY_PAGO: rango(2, g.p0, finProy),
    JORNALES_PROY_TOTAL: rango(7, g.p0, finProy),
  }
  const existentes = new Map((await google.getNamedRanges(ID)).map((r) => [r.name, r.namedRangeId]))
  const reqs = Object.entries(quiero).map(([name, range]) => (existentes.has(name)
    ? { updateNamedRange: { namedRange: { namedRangeId: existentes.get(name), name, range }, fields: 'range' } }
    : { addNamedRange: { namedRange: { name, range } } }))
  await google.spreadsheetBatchUpdate(ID, reqs)
  console.log(`rangos con nombre publicados: ${Object.keys(quiero).join(', ')} — las otras pestañas ya no citan números de fila`)
}

async function formatear(google, sheetId, filas, g) {
  // NINGUNA NOTA. La procedencia vive en el subtítulo de la pestaña, una vez.
  const { requests: notas } = borrarNotas(filas, ANCHO - 1, sheetId)
  const rg = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const moneda = { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }
  const reqs = [
    ...notas,
    ...skinRequests({ sheetId, filas, cols: ANCHO, congeladas: 2, titular: g.titular, filasHoja: filas.length }),
    // Todo lo que es plata, a la derecha y con cifras tabulares.
    { repeatCell: { range: rg(3, filas.length, 1, ANCHO), cell: { userEnteredFormat: { numberFormat: moneda, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: filas.length }, properties: { pixelSize: 21 }, fields: 'pixelSize' } },
    // EL TÍTULO Y EL SUBTÍTULO DERRAMAN, NO ENVUELVEN. A su derecha no hay ningún dato, así que se
    // leen de corrido en un renglón; envolviéndose quedaban partidos en dos y la fila de 21px sólo
    // mostraba la primera mitad — un subtítulo cortado es peor que no tenerlo.
    { repeatCell: { range: rg(0, 2, 0, ANCHO), cell: { userEnteredFormat: { wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat.wrapStrategy' } },
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
  }
  const ENTERO = { type: 'NUMBER', pattern: '#,##0;-#,##0;"—"' }
  const HORAS = { type: 'NUMBER', pattern: '#,##0.0;-#,##0.0;"—"' }
  // Proyección: días hábiles y personas enteros; el ajuste por inflación es un coeficiente, no plata.
  // Todos corridos una columna a la derecha desde el 31/07: entró "Se paga el" en la C.
  fmt(g.p0 - 1, finProy, 3, 5, ENTERO)
  fmt(g.p0 - 1, finProy, 6, 7, { type: 'NUMBER', pattern: '0.00;-0.00;"—"' })
  // Registro: días y personas enteros, las horas con un decimal.
  fmt(g.f0 - 1, g.fTotalReal, 3, 5, ENTERO)
  fmt(g.f0 - 1, g.fTotalReal, 5, 7, HORAS)
  // Oficina: personas entera y el ajuste por inflación como coeficiente, no como plata.
  fmt(g.o0 - 1, g.oFin, 1, 2, ENTERO)
  fmt(g.o0 - 1, g.oFin, 6, 7, { type: 'NUMBER', pattern: '0.00;-0.00;"—"' })
  for (const f of g.cantidades) fmt(f - 1, f, 1, 2, HORAS)
  for (const f of g.enteros) fmt(f - 1, f, 1, 2, ENTERO)
  reqs.push({
    repeatCell: {
      range: rg(g.fCurso - 1, g.fCurso, 2, 3),
      cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', wrapStrategy: 'OVERFLOW_CELL' } },
      fields: 'userEnteredFormat(numberFormat,horizontalAlignment,wrapStrategy)',
    },
  })
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
  await google.spreadsheetBatchUpdate(ID, reqs)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
