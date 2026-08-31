#!/usr/bin/env node
// LA PESTAÑA «Nómina»: TODOS LOS QUE TRABAJARON ESTE AÑO, MES A MES, Y QUÉ CUESTA DESVINCULARLOS.
//
// ═══ EL PEDIDO (27/08/2026), TEXTUAL ═══
//
// "necesito q crees una pestaña en sheet flujo de fondos […] de «nómina» en donde toda la
// informacion de todos los meses de este año de cada uno de los empleados activos e inactivos q
// hayan habido esten ahi con sus salarios y los acuerdos expresados. ahi mismo tb los costos de
// echar a todos y cada uno de ellos q se encuentra en jornales por quincena migrarlos"
//
// ═══ DE DÓNDE SALE CADA COSA (nada se inventa acá) ═══
//
// · QUIÉNES y CUÁNTO: los espejos `_J_OBREROS` y `_J_OFICINA`, que son la réplica de la planilla de
//   jornales del dueño. Es la fuente que se toca todos los días: manda el Sheet.
// · EL DEVENGADO DE CADA MES: `lib/nomina-devengado.mjs`, que multiplica las horas de cada quincena
//   por el `$/hora` DE ESA quincena. Usar el precio de hoy para enero sería reescribir la historia
//   con el aumento de agosto.
// · EL COSTO DE DESVINCULAR: `lib/desvinculacion-22250.mjs` y `lib/desvinculacion-plantel.mjs` — el
//   mismo núcleo que ya publica el bloque 6 de «Jornales por Quincena», sin una línea nueva de
//   criterio. Lo que se migra es el CUADRO, no la regla.
//
// ═══ LAS DOS COLUMNAS QUE NUNCA SE SUMAN ═══
//
// «Sale de la caja» y «Fondo de cese acumulado» van separadas a propósito: el fondo es plata del
// trabajador que se le entrega con la libreta, no un desembolso nuevo de la empresa. Sumarlas da un
// número que no existe, y es el error clásico al presupuestar una desvinculación.
//
//   node orquestador/scripts/nomina-pestana.mjs           → muestra qué escribiría
//   node orquestador/scripts/nomina-pestana.mjs --aplicar → escribe la pestaña

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { detectarQuincenas } from '../lib/nomina-sync.mjs'
import { plantelDelEspejo, separarPlantel, claveNombre, mejorMesDelSemestre, fclDevengadoDelAnio } from '../lib/desvinculacion-plantel.mjs'
import { antiguedad, liquidacionFinal, alicuotaFcl } from '../lib/desvinculacion-22250.mjs'
import { ACUERDO_BANCO, repartoPersona } from '../lib/jornales-reparto-pago.mjs'
import { bancoDeLaPersona, reparto50DeLiquidacionFinal, tieneLiquidacionFinal, esSubcontratista, comoSeEscribe, CUIL_POR_PERSONA_DE_PLANILLA, COBRAN_Y_NO_ESTAN_EN_LA_PLANILLA, SUELDO_NETO_OFICINA } from '../lib/nomina-banco-recibo.mjs'
import {
  claveDeCategoria, convenioDe, esInferida, lineaEquivalenciasInferidas,
  jornalConAumento, PORCENTAJE_DE_AUMENTO,
} from '../lib/uocra-paritaria.mjs'
import { HORAS_POR_DIA_DE_SEMANA } from '../lib/jornada-uocra.mjs'
import { PAPELES, carpetaDe, papelesDe } from '../lib/legajo-drive.mjs'
import { query, closePool } from '../lib/db.mjs'
import { escalonDe, parsearAcuerdos } from '../lib/uocra-acuerdos.mjs'
import { COL_OBRA, COL_OFICINA, devengadoPorMes, diaDeCelda, mesesDe, totalAnio, ultimaColumnaHabilCargada, dejoDeCargar as dejoAntesQueElResto } from '../lib/nomina-devengado.mjs'
import { seccion, sub, total as rotuloTotal, ES_SECCION_NUM, ES_TOTAL, ES_SUBITEM } from '../lib/patron-pestana.mjs'
import { conColaLimpiable } from '../lib/cola-de-rango.mjs'
// VACIO vive en `preservar-anotaciones`, no en `cola-de-rango` — ésta lo re-importa de allá.
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { alMultiplo } from '../lib/jornales-neto-pago.mjs'

/**
 * CUÁNTAS FILAS ESCRIBIÓ ALGUNA VEZ ESTE GENERADOR.
 *
 * No es el alto del cuadro de hoy: es el techo que la cola tiene que poder limpiar. Si una corrida
 * publica 53 filas después de una de 141 —pasó, la Nómina bajó de 141 a 46 el 31/08— las 88 de
 * sobra quedan vivas abajo salvo que el centinela las marque como propias. Se declara con margen
 * hacia arriba, nunca hacia abajo.
 */
const ALTO_HISTORICO = 160
// ═══ POR QUÉ ACÁ NO VA EL CENTINELA `VACIO` ═══
//
// El centinela significa «esta celda es mía y va vacía», y se resuelve DENTRO de la fusión. Esta
// pestaña no se fusiona: el generador es dueño del 100% de ella y la reescribe entera. Al escribirlo
// por esta puerta quedó LITERAL en el archivo —«::VACIO::» en cientos de celdas, probado el
// 27/08— que es exactamente lo que el propio módulo advierte. Acá se escribe vacío de verdad y la
// guarda se saltea con `yaGuardado`, que es la puerta declarada para el escritor que ya evaluó de
// quién es la pestaña. La condición para poder usarla es la que se cumple acá y en pocos lugares
// más: NADIE que no sea este script escribió jamás una celda de esta pestaña.

const ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Nómina'
const ANIO = 2026
const APLICAR = process.argv.includes('--aplicar')
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
// 17 DESDE EL 29/08: entró «+ Aumento $/h». La pestaña la escribe este generador entera y nadie más,
// así que agregar una columna no le pisa nada a nadie — el formato se calcula sobre ANCHO y los
// tramos numéricos se detectan solos, no hay índices escritos a mano que se corran.
const ANCHO = 17
const SIN_DATO = '—'

const fecha = (d) => (d instanceof Date && !Number.isNaN(+d)
  ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  : SIN_DATO)

/** Filas de una hoja del espejo, ya cruzadas: identidad + devengado. */
/**
 * EL ÚLTIMO BLOQUE DE OFICINA DE LA PLANILLA, PERSONA POR PERSONA.
 *
 * `_J_OFICINA` NO tiene el mismo mapa de columnas que `_J_OBREROS` —ya lo dice `COL_OFICINA`— y las
 * de canal tampoco: acá son **V $ HORA · W BANCO · X ADELANTO · Y TOTAL RECIBO** (índices 21 a 24).
 * Leerlas con las letras de obra (X banco, Y adelanto) corre todo un lugar y publica el adelanto de
 * alguien en su columna de banco.
 *
 * Se queda con el ÚLTIMO bloque cargado porque se recorre en orden y cada persona se pisa a sí
 * misma: la pregunta es qué se le paga ahora, no qué se le pagó en marzo. Hay que leer la grilla
 * SIN FORMATO — con «$398.200» como texto, `Number()` da NaN y toda la tabla saldría en cero.
 */
export function oficinaDelEspejo(grid = []) {
  const porNombre = new Map()
  for (let i = 0; i < grid.length; i++) {
    const nombre = String(grid[i]?.[1] ?? '').trim()
    if (!nombre || nombre.toUpperCase() === 'OBRERO') continue
    const hora = Number(grid[i]?.[21]) || 0
    const banco = Number(grid[i]?.[22]) || 0
    const adelanto = Number(grid[i]?.[23]) || 0
    const total = Number(grid[i]?.[24]) || 0
    // Una fila sin un solo número de canal es una fila de asistencia, no de pago.
    if (!hora && !banco && !adelanto && !total) continue
    porNombre.set(nombre, { nombre, fila: i + 1, hora, banco, adelanto, total })
  }
  return porNombre
}

function personasDe(grid, sector, col) {
  const bloques = detectarQuincenas(grid ?? [])
  if (!bloques.length) return { personas: [], bloques: [] }
  const plantel = plantelDelEspejo(grid ?? [], bloques, { anio: ANIO })
  const { activos } = separarPlantel(plantel, bloques)
  const activasClaves = new Set(activos.map((p) => p.clave))
  const dev = devengadoPorMes(grid ?? [], bloques, { anio: ANIO, clave: claveNombre, col })
  const personas = plantel.map((p) => {
    const d = dev.get(p.clave) ?? { meses: new Map(), jornalPorMes: new Map(), horasSinPrecio: 0, jornal: 0, categoria: '' }
    return {
      ...p,
      sector,
      // El plantel lo lee `desvinculacion-plantel.mjs` con el mapa de OBRA. Para oficina, el jornal y
      // la categoría se toman de la lectura que sí usó el mapa correcto.
      jornalPactado: col === COL_OBRA ? p.jornalPactado : (d.jornal || 0),
      categoria: col === COL_OBRA ? p.categoria : (d.categoria || ''),
      activo: activasClaves.has(p.clave),
      devengado: d,
    }
  })
  return { personas, bloques }
}

/**
 * LA QUINCENA QUE SE ESTÁ PAGANDO: el ÚLTIMO bloque del espejo, persona por persona.
 *
 * Las columnas son las de `jornales-reparto-pago.mjs` (V horas · W $/hora · X banco · Y adelanto ·
 * AA total). Se lee el TOTAL de la planilla y no se recalcula: si el dueño corrigió una hora a mano,
 * manda su número. Cuando la celda no trae total se cae a `horas × $/hora`, que es la misma cuenta
 * que hace la planilla.
 */
function quincenaEnCurso(grid, bloques, clave, { hoy = new Date(), anio = ANIO } = {}) {
  const b = bloques[bloques.length - 1]
  const out = new Map()
  if (!b) return { porClave: out, desde: null, hasta: null, horasPendientes: 0, diasPendientes: [] }
  const fechas = grid[b.filaFecha - 1] ?? []

  // ═══ LOS DÍAS QUE TODAVÍA NO SE CARGARON SE COMPLETAN CON LA JORNADA ═══
  //
  // El dueño lo pidió dos veces: *"se completara los dias q faltaban en cantidad de hs como 8hs los
  // viernes y 9 los otros"*. Sin esto el cuadro muestra lo que hay CARGADO —77 h de una quincena de
  // 103— y contesta la pregunta equivocada: él no necesita saber cuánto lleva devengado a mitad de
  // la quincena, necesita saber cuánto va a firmar el día de pago.
  //
  // SÓLO SE COMPLETAN LOS DÍAS DE HOY EN ADELANTE. Un día pasado sin horas para nadie es un feriado
  // o un día de lluvia, y rellenarlo inventaría jornadas que no ocurrieron; un día futuro sin horas
  // es, simplemente, un día que todavía no llegó. La jornada es la declarada: 9 h de lunes a jueves,
  // 8 h el viernes.
  const dias = []
  const pendientes = []
  const columnas = []
  const corte = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  let ultimaColumnaCargada = -1
  for (let c = 5; c <= 20; c++) {
    const d = diaDeCelda(fechas[c])
    if (!d) continue
    dias.push(`${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}`)
    const diaSemana = new Date(anio, d.mes - 1, d.dia).getDay()
    columnas.push({ col: c, etiqueta: `${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}`, habil: diaSemana !== 0 && diaSemana !== 6 })
    let cargado = false
    for (let r = b.inicio; r <= b.fin && !cargado; r++) if (Number((grid[r - 1] ?? [])[c]) > 0) cargado = true
    // El día contra el que se mide «dejó de cargar» tiene que ser HÁBIL: ver `ultimaColumnaHabilCargada`.
    const fechaDia = new Date(anio, d.mes - 1, d.dia)
    // EL SÁBADO NO SE COMPLETA. Las 4 h del sábado son un SUPUESTO declarado en `jornada-uocra.mjs`,
    // no la jornada normal: rellenarlo sumaba 4 h por persona que nadie va a trabajar. El dueño
    // contó los días que faltaban a mano —27, 28 y 31 = 26 h— y ahí está la diferencia.
    const esFinDeSemana = fechaDia.getDay() === 0 || fechaDia.getDay() === 6
    if (cargado && !esFinDeSemana) ultimaColumnaCargada = c
    if (!cargado && !esFinDeSemana && fechaDia >= corte) {
      pendientes.push({ etiqueta: `${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}`, horas: HORAS_POR_DIA_DE_SEMANA[fechaDia.getDay()] ?? 0 })
    }
  }
  const horasPendientes = pendientes.reduce((a, x) => a + x.horas, 0)

  for (let r = b.inicio; r <= b.fin; r++) {
    const f = grid[r - 1] ?? []
    const nombre = String(f[1] ?? '').trim()
    if (!nombre) continue
    const cargadas = Number(f[21]) || 0
    const jornal = Number(f[22]) || 0

    // ═══ AL QUE YA NO ESTÁ NO SE LE COMPLETAN LOS DÍAS QUE FALTAN ═══
    //
    // Completar la jornada tiene sentido para quien va a seguir yendo. Sosa Raúl tiene horas hasta el
    // 25/08 y baja registrada ese mismo día; Jofre Ismael tampoco cargó el 26 cuando cargaron los
    // otros quince. Sumarles los tres días que faltan les inventa 26 h que nadie va a trabajar, y en
    // una liquidación final ese invento se paga.
    //
    // El criterio sale de la planilla y no de una lista: si el último día con horas de una persona es
    // ANTERIOR al último día que cargó el resto, esa persona ya no está en el frente. Es el mismo
    // dato que el dueño mira cuando abre la grilla.
    const ultimaSuya = ultimaColumnaHabilCargada(columnas, (col) => Number(f[col]) > 0)
    const dejoDeCargar = dejoAntesQueElResto({ ultimaSuya, ultimaDelResto: ultimaColumnaCargada })
    const ultimoDiaSuyo = columnas.find((x) => x.col === ultimaSuya)?.etiqueta ?? null
    const pendientesSuyas = dejoDeCargar ? 0 : horasPendientes
    const horas = cargadas + pendientesSuyas
    out.set(clave(nombre), {
      nombre,
      // La fila del espejo: es lo que permite que la Nómina CITE las horas y el jornal en vez de
      // pegar el número que el OS ya calculó. Sin esto no hay forma de cumplir la regla de oro 5.
      filaEspejo: r,
      categoria: claveDeCategoria(f[3]),
      cargadas,
      pendientes: pendientesSuyas,
      dejoDeCargar,
      ultimoDiaSuyo,
      horas,
      jornal,
      banco: Number(f[23]) || 0,
      // La planilla también trae el EFECTIVO (Z) al lado del banco. Con los dos se sabe si el
      // reparto está DECLARADO o si falta cargarlo — ver `esElRepartoDeLaPlanilla`.
      efectivoPlanilla: Number(f[25]) || 0,
      adelanto: Number(f[24]) || 0,
      // El total de la planilla vale para las horas CARGADAS; la quincena completa se valoriza acá.
      totalCargado: Number(f[26]) || cargadas * jornal,
      total: horas * jornal,
    })
  }
  return { porClave: out, desde: dias[0] ?? null, hasta: dias[dias.length - 1] ?? null, horasPendientes, diasPendientes: pendientes }
}

/** El costo de desvincular a UNA persona, con el mismo núcleo del bloque 6 de Jornales. */
function costoDe(p, cese) {
  const horasPorMes = new Map([...p.devengado.meses].map(([m, v]) => [m, v.horas]))
  const mejor = mejorMesDelSemestre(horasPorMes, p.jornalPactado, cese)
  // `fclDevengadoDelAnio` devuelve un NÚMERO (o null si no hay fecha de ingreso), no un objeto: el
  // acumulado del año, ya valuado mes por mes con la alícuota que regía cada cierre.
  const fcl = fclDevengadoDelAnio({ horasPorMes, basicoHora: p.jornalPactado, ingreso: p.ingreso, alicuotaDe: alicuotaFcl })
  return liquidacionFinal({
    nombre: p.nombre, ingreso: p.ingreso, cese, categoria: p.categoria,
    basicoHora: p.jornalPactado,
    mejorRemuneracionMensual: mejor?.importe ?? 0,
    horasDevengadasPendientes: 0,
    remuneracionNoDepositada: 0,
    fclDevengadoAcumulado: typeof fcl === 'number' ? fcl : null,
  })
}

/**
 * LOS LEGAJOS DEL DRIVE, leídos del índice y no de Drive.
 *
 * `public.drive_index` ya tiene los 3.627 archivos con su ruta: preguntar ahí cuesta una consulta y
 * no toca la red. La carpeta de cada persona cuelga de «1. ACTIVOS»; los que ya no están tienen la
 * suya en «2. INACTIVOS», y esta pestaña no los mira porque no los muestra.
 */
/**
 * LO QUE LA BASE SABE DE CADA PERSONA — para completar lo que la planilla no trae.
 *
 * `_J_OFICINA` no tiene fecha de alta: los dos de oficina salían con antigüedad «—», vacaciones en
 * cero y sin fondo, que no es «no le corresponde» sino «no lo pude calcular». `public.personas` sí
 * la tiene, y además declara el CONVENIO de cada uno — que es el dato que decide si una liquidación
 * se arma por la ley 22.250 o por la LCT, y son dos números muy distintos.
 *
 * Se empareja con la MISMA regla que las carpetas de Drive: dos tokens en común o no hay match.
 */
async function fichasDeLaBase() {
  const { rows } = await query(
    `select nombre_completo, fecha_ingreso, fecha_egreso, categoria, convenio_colectivo
       from public.personas where nombre_completo is not null`,
  )
  return rows
}

/**
 * LOS NETOS DE RECIBO YA CARGADOS, por CUIL. Es la columna BANCO del cuadro 1.
 *
 * Una fila por carga y la última gana: un recibo emitido no se corrige, se emite otro. Sin filas
 * devuelve un mapa vacío y el cuadro cae a lo que traiga la planilla — no inventa un banco.
 */
async function recibosDelPeriodo(periodo) {
  const { rows } = await query(
    `select distinct on (cuil) cuil, neto, etiqueta, nombre_recibo, legajo, fecha_pago
       from public.nomina_recibo_neto where periodo = $1
      order by cuil, cargado_en desc`, [periodo],
  )
  return new Map(rows.map((r) => [r.cuil, { ...r, neto: Number(r.neto) }]))
}

/**
 * TODOS LOS RECIBOS DE UN MES, SUMADOS POR PERSONA.
 *
 * Oficina cobra mensual aunque el estudio liquide dos quincenas, así que su sueldo del mes es la
 * SUMA de los recibos del mes —no el de la quincena en curso, que es la mitad—. La llave sigue
 * siendo el CUIL y el corte es el sufijo del período: `Q1-08/2026` y `Q2-08/2026` son el mismo mes.
 *
 * Devuelve además cuántas quincenas de ese mes hay cargadas, porque un mes al que le falta una
 * quincena publica un sueldo incompleto y eso tiene que verse.
 */
async function recibosDelMesEntero(hoy) {
  const mes = `${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`
  const { rows } = await query(
    `select cuil, sum(neto)::numeric neto, count(*)::int quincenas,
            max(nombre_recibo) nombre_recibo, max(legajo) legajo
       from public.nomina_recibo_neto where periodo like $1 group by cuil`, [`%-${mes}`],
  )
  return new Map(rows.map((r) => [r.cuil, { ...r, neto: Number(r.neto) }]))
}

/** Lo ya transferido a cuenta del sueldo, por CUIL y concepto. Llave: la referencia del banco. */
async function adelantosPagados(concepto) {
  const { rows } = await query(
    `select cuil, beneficiario, sum(importe)::numeric importe
       from public.nomina_adelanto where concepto = $1 group by cuil, beneficiario`, [concepto],
  )
  const porCuil = new Map()
  for (const r of rows) if (r.cuil) porCuil.set(r.cuil, Number(r.importe))
  return { porCuil, filas: rows }
}

async function legajosDeDrive() {
  // ═══ TRES CARPETAS, NO UNA (31/08/2026) ═══
  //
  // Miraba sólo `1. ACTIVOS` y por eso la pestaña decía «SIN CARPETA» de Jofre y de Sosa, que tienen
  // la suya en `2. INACTIVOS` porque están dados de baja — que es exactamente donde corresponde que
  // esté. El cuadro acusaba un faltante de legajo que no existía: «un control que no pudo mirar no
  // dice "no está"».
  const RAIZ = 'administracion/PERSONAL: ALTAS - BAJAS - HM - EPP - DNI/'
  const BASES = ['1. ACTIVOS/', '2. INACTIVOS - PERSONAL DADO DE BAJA/', '4. SUBCONTRATISTAS/'].map((x) => RAIZ + x)
  const carpetas = []
  const porCarpeta = new Map()
  for (const BASE of BASES) {
    const { rows } = await query(
      `select name, path, is_folder from public.drive_index where path like $1`, [`${BASE}%`],
    )
    for (const r of rows.filter((x) => x.is_folder && !x.path.slice(BASE.length).includes('/'))) {
      if (porCarpeta.has(r.name)) continue
      carpetas.push(r.name); porCarpeta.set(r.name, [])
    }
    for (const r of rows) {
      if (r.is_folder) continue
      const carpeta = r.path.slice(BASE.length).split('/')[0]
      if (porCarpeta.has(carpeta)) porCarpeta.get(carpeta).push(r.name)
    }
  }
  return { carpetas, porCarpeta }
}

function grilla(activos, { hoy, quincena, escala, legajos, recibosPorCuil = new Map(), finales = new Map(), adelantosPorCuil = new Map(), adelantosDeFinal = new Map(), periodoRecibo = '', recibosDelMes = new Map(), oficinaEspejo = new Map() }) {
  // ═══ UNA HOJA, UN PROPÓSITO ═══
  //
  // Esta pestaña hacía cinco trabajos: la instrucción de pago de la quincena, el plantel, lo
  // devengado mes a mes, el costo de desvincular y el índice de legajos en Drive. Ciento cuarenta y
  // una filas y seis anchos de grilla distintos para contestar «cuánto le pago a cada uno mañana».
  //
  // El estándar de modelado financiero es explícito: cada hoja es un capítulo, y los cuadros de
  // respaldo van a su propia hoja (FAST — «worksheets are like chapters in a book»; los supporting
  // schedules se separan). Y el contrato del dueño dice lo mismo con otras palabras: *menos bloques;
  // antes de agregar un cuadro, preguntar si su información no cabe en uno que ya existe*.
  //
  // Así que la Nómina se queda con lo que se paga —y nada más— y los cuatro cuadros de respaldo se
  // mudan a «Plantel». No se borra nada: se mueve, con su propio ancho de grilla y sin competir con
  // el número que se opera mañana.
  const meses = mesesDe(ANIO)
  const f = []
  const g = []
  let destino = f
  const fila = (...c) => { destino.push(c.concat(Array(Math.max(0, ANCHO - c.length)).fill(''))) }

  fila(PESTANA)
  fila('El plantel de hoy: cuánto hay que pagarle a cada uno esta quincena, y cuánto costaría desvincularlo.')
  fila(`Sale del espejo de la planilla de jornales. Al ${fecha(hoy)}.`)
  fila()

  // ═══ 1 · LO QUE HAY QUE PAGAR, EN LOS DOS ESCENARIOS ═══
  //
  // El dueño lo pidió así: *"cuanto le tengo q pagar este mes a cada uno, segun el acuerdo 50 y 50,
  // cubriendo el piso de uocra vs lo q le pagamos hoy"*. Son DOS columnas de plata al lado, no dos
  // cuadros: la decisión es «cuánto me sale llevar a todos al piso», y esa resta tiene que estar
  // escrita, no que la haga el que mira.
  //
  // EL 50/50 NO ES UNA REGLA DE ESTA PESTAÑA: es `repartoPersona`, el mismo núcleo con el que se
  // paga la quincena. Y el efectivo NO se recorta en cero — un efectivo negativo es un adelanto de
  // más, y es información.
  // ═══ EL TITULAR: LAS TRES CIFRAS QUE SE DECIDEN, ANTES QUE NADA ═══
  //
  // Contrato del dueño («Sheets de clase mundial», legibilidad): *el titular arriba, siempre — las
  // 2-3 cifras que se deciden. El resto es el detalle de esas cifras.* Esta pestaña arrancaba
  // directamente en el cuadro: había que leer quince filas y llegar al total para saber cuánta plata
  // sale mañana.
  //
  // POR FÓRMULA, no por número pegado (regla de oro 5): cita la fila de total del cuadro 1, anclada
  // al rótulo y no a la posición. Si mañana entra una persona más, el titular se mueve solo. Un
  // número pegado acá sería la misma cifra escrita dos veces, y ésa es la forma en que dos totales
  // empiezan a discrepar.
  // ═══ EL TITULAR SUMA LOS TRES CUADROS, Y SIGNIFICA LO QUE SALE MAÑANA ═══
  //
  // Hasta el 31/08 citaba UNA fila —la del cuadro de obra— porque era el único que había. Con
  // oficina y liquidaciones abajo, «qué sale de la caja mañana» publicaba $7.540.500 cuando lo que
  // sale son $9.706.145: dejaba afuera $2.652.566 de oficina y $721.723 de liquidaciones.
  //
  // Y decía de más por otro lado: su tercera cifra era «TOTAL A PAGAR» del cuadro de obra, que es
  // `horas × $/hora` — el bruto, con los $1.208.644 ya entregados adentro. De la caja sale el BANCO
  // más el EFECTIVO, y nada más.
  //
  // SUMIF sobre las filas de total, ancladas por el «⇒» con el que las escribe `rotuloTotal`. No
  // cita filas ni letras: cuando entre un cuadro más, entra solo. Rango CERRADO como pide el
  // checklist, y arranca en la 9 porque el titular vive arriba y no puede sumarse a sí mismo.
  const deTodos = (col) => `SUMIF($A$9:$A$400;"⇒*";$${col}$9:$${col}$400)`
  // NINGUNA DE LAS TRES CIFRAS VA EN LA COLUMNA A. Sus fórmulas ubican la fila buscando rótulos EN
  // la columna A, así que una celda de plata puesta ahí se referencia a sí misma: Sheets lo resuelve
  // como dependencia circular y publica #REF!. Pasó en la primera corrida — «POR BANCO» salió en
  // error y las otras dos, que caen en C y en E, salieron bien.
  fila('QUÉ SALE DE LA CAJA MAÑANA')
  // ═══ TRES CIFRAS QUE SE PUEDEN VERIFICAR SUMANDO UNA COLUMNA (31/08) ═══
  //
  // El dueño: «quitar las filas 5 a 7 de pestaña nomina, estan mal calculadas y ademas confunden […]
  // o dejarlas si eso indica una de las reglas de oro, pero corregirlas». La regla de oro pide el
  // titular arriba, así que se corrige.
  //
  // Y confundían por una razón concreta: la tarjeta «EN EFECTIVO» decía $4.932.467 mientras la suma
  // de las columnas EN EFECTIVO de los tres cuadros da $5.532.467. No estaba mal la cuenta —le
  // restaba los $600.000 ya transferidos a Jofre y Sosa— pero ninguna columna de la pestaña muestra
  // ese número, así que no se podía verificar mirando. Un titular que no se puede reconciliar con
  // lo de abajo es peor que no tener titular.
  //
  // Ahora las tres cifras salen de sumar UNA columna cada una:
  //   SE DEBE      = Σ TOTAL A PAGAR   (columna G de los tres cuadros)
  //   YA SE ENTREGÓ = Σ ADELANTO + Σ YA TRANSFERIDO
  //   SALE MAÑANA  = la resta de las dos anteriores
  //
  // El reparto entre transferencia y efectivo —que es operativo y él lo necesita— baja a la glosa,
  // donde se puede decir de dónde sale cada uno sin fingir que es una columna.
  fila('', 'POR TRANSFERENCIA', '', 'EN EFECTIVO', '', 'TOTAL A PAGAR')
  // CADA TARJETA ES LA SUMA DE SU COLUMNA, y las dos primeras dan la tercera. Se puede verificar
  // mirando: es la única forma de que un titular genere confianza.
  fila('', `=${deTodos('E')}`, '', `=${deTodos('F')}`, '', `=${deTodos('G')}`)
  // UNA SOLA FÓRMULA, no texto con un «=» adentro: una celda es fórmula o es texto, no las dos.
  // El patrón de TEXT va en formato US («#,##0») aunque el archivo sea es-AR — la API lo interpreta
  // en US y lo MUESTRA con el punto de miles local; escribirlo con el separador local lo rompe.
  // ═══ LA GLOSA DICE LA VERDAD SOBRE LA ÚNICA TARJETA QUE NO ES UNA SUMA ═══
  //
  // «EN EFECTIVO» y «TOTAL A PAGAR» SÍ son la suma de su columna. «POR TRANSFERENCIA» no puede
  // serlo: la columna POR BANCO de las liquidaciones muestra el ACUERDO —la mitad blanca entera— y
  // de ahí ya salieron los $600.000 del lote del 28/08. Sumarla pediría transferir dos veces.
  //
  // Antes la glosa afirmaba «cada cifra es la suma de su columna», que era falso justo donde
  // importaba. Ahora dice los dos números y la resta: el que lee puede verificarla mirando.
  // LA DIFERENCIA SE CALCULA, NO SE SUPONE. No es Σ«YA TRANSFERIDO» ($1.200.000): de esos, los
  // $600.000 de los obreros ya están descontados dentro de su EFECTIVO. Lo que falta explicar es
  // sólo lo que sigue vivo en la columna POR BANCO, y eso es exactamente Σbanco − (Σtotal − Σefectivo).
  fila(`="${quincena.desde ?? '—'} a ${quincena.hasta ?? '—'} · paga 01/09 · cada cifra es la suma de su columna, y las dos primeras dan la tercera. " `
    + `& "Lo ya entregado (" & TEXT(${deTodos('C')}+${deTodos('D')};"$ #,##0") & " entre adelantos y el lote del 28/08) ya está descontado."`)
  fila('')

  fila(seccion(1, `qué se le paga a cada uno · quincena ${quincena.desde ?? '—'} a ${quincena.hasta ?? '—'}`))
  fila(`Acuerdo 50/50: al banco la mitad del bruto, en efectivo el resto menos el adelanto ya entregado. `
    + `Escala ${escala.rotulo ?? 'sin escala'}: a cada hora se le cierra el `
    + `${Math.round(PORCENTAJE_DE_AUMENTO * 100)}% de la BRECHA hasta el piso de su categoría — el resultado `
    + `nunca pasa el piso, y al que ya lo cobra no se le toca la hora.`)
  fila(quincena.diasPendientes.length
    ? `Horas = lo cargado + los días que faltan a jornada completa (9 h L-J, 8 h viernes): ${quincena.diasPendientes.map((d) => `${d.etiqueta} ${d.horas} h`).join(' · ')} = ${quincena.horasPendientes} h.`
    : 'La quincena está cargada entera: no se completó ninguna jornada.')
  // ═══ LAS TRES TARIFAS, UNA AL LADO DE LA OTRA (29/08) ═══
  //
  // `$/h HOY` y `$/h CON AUMENTO` estaban separadas por tres columnas de plata, y la del medio —el
  // aumento que le toca a su categoría— no existía: había que restar dos celdas lejanas para saber
  // cuánto sube cada uno, que es LA cifra que el dueño decidió. Ahora la cuenta se lee sola de
  // izquierda a derecha: lo que cobra + lo que sube = lo que va a cobrar. Después, la plata.
  // ═══ EL CUADRO SE LEE COMO UNA INSTRUCCIÓN DE PAGO, NO COMO UNA PLANILLA DE CÁLCULO ═══
  //
  // El dueño, 31/08/2026: «es confuso como ha quedado […] quiero saber cuanto y como tengo q pagarle
  // a cada uno». Tenía diecisiete columnas para una decisión que son TRES números: cuánto se
  // transfiere, cuántos billetes hay que sacar, y cuánto es en total.
  //
  // UNA SOLA TABLA. El cuadro «cómo se llegó a ese número» se retiró: partir la información en dos
  // obligaba a saltar entre bloques para entender una fila, que es lo contrario de lo que se buscaba.
  // Las horas y las tarifas vuelven acá, DESPUÉS de la plata — el número que decide primero, el
  // respaldo a su derecha, en la misma fila.
  // ═══ EL ADELANTO Y LO TRANSFERIDO SON DOS COSAS, Y VAN EN DOS COLUMNAS (31/08) ═══
  //
  // El dueño: «no me gusta esa mezcla de conceptos en la columna "ya transferido" con "adelantos"
  // separar». Tenía razón y el defecto era de fondo, no de rótulo: la celda sumaba **plata de dos
  // fuentes distintas** y mostraba el resultado como si fuera un solo hecho.
  //
  // · ADELANTO       — billetes entregados en obra. Lo anota el jefe en la planilla de jornales
  //                    (columna Y) y no pasa por ningún banco: no hay comprobante, hay una firma.
  // · YA TRANSFERIDO — plata que salió de la cuenta. Cada peso tiene su referencia en el extracto
  //                    del Santander y vive en `_RECIBOS_RAW`.
  //
  // Sumarlas escondía cuál de las dos era, y son distintas para decidir: un adelanto en efectivo se
  // discute con quien lo entregó, una transferencia se busca en el extracto. Las dos se restan del
  // total —eso no cambia— pero cada una se ve y se audita por su lado.
  // ═══ LA CATEGORÍA, PEDIDA POR EL DUEÑO (31/08): «necesito q aparezcan las categorias» ═══
  //
  // Va con el respaldo —después de la plata, antes de las horas— porque es de la misma familia: es
  // lo que EXPLICA la tarifa, no lo que se decide. Y explica bastante: el piso de convenio contra el
  // que se mide el aumento sale de ella, así que dos personas con el mismo $/hora y distinta
  // categoría suben distinto, y sin esta columna eso no se puede leer en la fila.
  //
  // SE MUESTRA EL NOMBRE DE CONVENIO, NO EL CÓDIGO DE LA PLANILLA. El espejo trae «OF», «OF E»,
  // «M OF», «A» —códigos del dueño— y el piso vive en `_UOCRA_RAW` bajo «Oficial», «Oficial
  // Especializado», «Medio Oficial», «Ayudante». Publicar el código obligaría a traducir de memoria
  // para saber contra qué piso se está midiendo a cada uno.
  //
  // Y LA FILA DICE CUÁNDO LA EQUIVALENCIA LA DEDUJO EL OS. Con «▲» al lado: `M OF → Medio Oficial`
  // es una lectura del OS que nadie declaró, y dibujarla igual que una declarada convierte una
  // inferencia en un hecho silencioso — el mismo aviso que la pestaña ya da al pie, ahora en la fila
  // de quien afecta.
  // AL LADO DEL NOMBRE, por pedido del dueño (31/08): «poner la categoria al lado del nombre».
  // La había puesto con el respaldo por el principio de «la plata primero»; leyendo el cuadro se ve
  // por qué él tiene razón: la categoría es parte de QUIÉN es la persona —con ella se lee la fila
  // entera, porque explica el piso, el aumento y la tarifa— y a la derecha obligaba a cruzar
  // once columnas para saber contra qué se está midiendo a cada uno.
  fila('Persona', 'Categoría', 'ADELANTO', 'YA TRANSFERIDO', 'POR BANCO', 'EN EFECTIVO', 'TOTAL A PAGAR',
    // «EFECTIVO redondeado» NO reemplaza al exacto: va AL LADO. El dueño, 31/08: «la idea era que no
    // borraras el número sino que pusieras el redondeado en una columna al lado». Tiene razón — el
    // exacto es lo devengado y hace falta para auditar; el redondeado es lo que se cuenta en billetes.
    'EFECTIVO c/aum.', 'EFECTIVO redondeado', 'TOTAL c/aum.', 'Sube', 'Horas', '$/h hoy', '$/h c/aum.')
  const T = { cargadas: 0, horas: 0, adelanto: 0, bancoHoy: 0, efHoy: 0, totHoy: 0, bancoNuevo: 0, efNuevo: 0, totNuevo: 0, sube: 0, totalCargado: 0 }
  const sinRecibo = []
  const liquidados = []
  const sinConvenio = []
  // QUIÉNES TIENEN UN PISO DECIDIDO POR UNA INFERENCIA. `sinConvenio` sólo ve los códigos que NADIE
  // mapeó: el día que se agrega el mapeo, se apaga. Y ahí es cuando más hace falta mirar —la
  // equivalencia empieza a gobernar plata—, así que esta lista toma la posta con los que quedaron
  // mapeados por deducción del OS.
  const conInferencia = []
  for (const p of activos) {
    const q = quincena.porClave.get(p.clave)
    if (!q) continue
    // Quien ya cobró su liquidación final NO cobra la quincena, por más que la planilla le traiga
    // horas hasta el día de la baja. Va en el cuadro 1.b y sólo ahí: verlo en los dos es cómo se
    // paga dos veces a la misma persona.
    if (tieneLiquidacionFinal(p.nombre)) { liquidados.push(p.nombre); continue }
    const codigo = q.categoria || p.categoria
    const conv = convenioDe(codigo)
    // EL PISO ES EL MÍNIMO LEGAL; LO QUE SE PAGA ES LO DE HOY + EL 50% DEL BÁSICO DE SU CATEGORÍA
    // (decisión del dueño, 28/08 — el aumento es un MONTO sumado, no un múltiplo del piso; el
    // `Math.max` contra el básico vive adentro de `jornalConAumento`). Se guardan los dos: el básico
    // es lo que la ley exige y tiene que seguir siendo legible, porque es contra ESE número que se
    // mide si la empresa está en falta — no contra el que se decidió pagar.
    const basico = conv ? escala.porCategoria[conv] ?? null : null
    const objetivo = jornalConAumento(q.jornal, basico)
    if (!conv) sinConvenio.push(p.nombre)
    // LA FILA DICE SI SU EQUIVALENCIA LA DECLARÓ ALGUIEN O LA DEDUJO EL OS. Sin la marca, `M OF →
    // Medio Oficial` (una lectura del OS que el jornal de Castillo contradice) se dibuja idéntico al
    // `OF → Oficial` que declaró el dueño, y la inferencia pasa a ser un hecho silencioso.
    //
    // LÍMITE DECLARADO (28/08): la marca se probó sobre el TEXTO de este archivo y sobre las funciones
    // puras, no viéndola en la pestaña — generarla exige escribir el Sheet real. Y la celda pasa de
    // ~13 a ~22 caracteres: la de al lado tiene dato, así que debería truncar en vez de desparramar,
    // pero eso se confirma mirando el PDF, no razonándolo.
    if (conv && esInferida(codigo)) conInferencia.push({ nombre: p.nombre, codigo })

    // ═══ LA COLUMNA BANCO ES EL RECIBO, NO EL 50% ═══
    //
    // Orden del dueño, 31/08/2026: «por banco va lo q dice recibo y en efectivo se completa todo
    // hasta llegar al numero». El 50/50 sigue rigiendo el TOTAL de cada persona; lo que deja de ser
    // un cálculo es el REPARTO. Para Aguero el 50% daba $294.000 y el recibo dice $215.564,62: son
    // $78.435 que este cuadro mandaba al banco y en realidad se pagan en efectivo.
    //
    // Sin recibo NO se vuelve al 50% por la puerta de atrás: `bancoDeLaPersona` devuelve `null` y
    // acá se cae a lo que traiga la planilla, que es lo que había antes de que existiera el recibo.
    // La diferencia se ve en la fila, que dice de dónde salió cada banco.
    const delRecibo = bancoDeLaPersona(p.nombre, recibosPorCuil)
    // ═══ EL ADELANTO SUMA LA PLANILLA Y LO QUE SALIÓ POR EL BANCO ═══
    //
    // «restar lo que ya hemos transferido lo pagado en adelantos que di el viernes». La planilla
    // trae unos y el extracto trae otros —el lote de haberes del 28/08— y son distintos: ningún
    // importe se repite. Sumarlos es lo correcto; quedarse con uno le paga de más a cinco personas.
    const porBanco = CUIL_POR_PERSONA_DE_PLANILLA[p.nombre]
      ? (adelantosPorCuil.get(CUIL_POR_PERSONA_DE_PLANILLA[p.nombre]) ?? 0) : 0
    const adel = Number(q.adelanto || 0) + porBanco
    const declaradoPorLaPlanilla = { efectivoPlanilla: q.efectivoPlanilla, totalPlanilla: q.totalCargado }
    const hoyR = repartoPersona({ total: q.total, adelanto: adel, banco: delRecibo.banco ?? q.banco, ...declaradoPorLaPlanilla })
    if (delRecibo.banco === null) sinRecibo.push({ nombre: p.nombre, porQue: delRecibo.fuente })
    // EL ESCENARIO «CON AUMENTO» NUNCA BAJA A NADIE, y por dos razones distintas que conviene no
    // confundir: el aumento SUMA sobre lo que cada uno cobra hoy (nadie puede quedar por debajo de su
    // propio jornal), y además `jornalConAumento` no devuelve nunca menos que el básico de convenio,
    // que es el mínimo legal. Acá ya no hay `Math.max` contra el jornal de hoy: sería redundante.
    //
    // LOS NOMBRES DICEN LO QUE SON (29/08). Se llamaban `jornalPiso`, `pisoR` y `T.*Piso` de cuando
    // esta columna era el plantel llevado al PISO del convenio. Dejó de serlo el día que el dueño
    // ordenó el aumento aditivo, y los encabezados de la pestaña ya decían «CON AUMENTO» mientras el
    // código seguía diciendo «piso»: dos vocabularios para la misma columna es como alguien vuelve a
    // implementar un piso creyendo que arregla algo.
    const jornalNuevo = objetivo
    const totalNuevo = jornalNuevo != null ? q.horas * jornalNuevo : null
    // «se deja fijo lo de banco y se pasa lo q haga falta para llegar al monto con aumento todo via
    // efectivo». El `banco: 0` de antes hacía que la proyección recalculara el 50% sobre el total
    // nuevo — o sea, el aumento se repartía mitad y mitad. La orden es que el aumento vaya ENTERO
    // al efectivo, porque lo registrado no se mueve hasta que el estudio liquide distinto.
    const nuevoR = totalNuevo != null
      ? repartoPersona({ total: totalNuevo, adelanto: adel, banco: delRecibo.banco ?? q.banco, ...declaradoPorLaPlanilla })
      : null

    T.cargadas += q.cargadas; T.horas += q.horas; T.adelanto += adel; T.totalCargado += q.totalCargado
    T.bancoHoy += hoyR.banco; T.efHoy += hoyR.efectivo; T.totHoy += hoyR.total
    if (nuevoR) { T.bancoNuevo += nuevoR.banco; T.efNuevo += nuevoR.efectivo; T.totNuevo += nuevoR.total; T.sube += nuevoR.total - hoyR.total }

    // EL AUMENTO DE SU CATEGORÍA, QUE ES LO QUE EL DUEÑO DECIDIÓ. Sale de la MISMA función que la
    // tarifa nueva —no se recalcula acá con otro `× 0,5`— porque dos fórmulas para el mismo aumento
    // se separan el día que el porcentaje cambie.
    // ═══ EL NOMBRE QUE SE MUESTRA ES EL DEL RECIBO ═══
    //
    // La planilla de jornales los escribe como salga: «Aguero Cristian» y «Emanuel Alaniz» y «Emi
    // Maldonado» — apellido primero en unos, nombre primero en otros. Ordenar alfabéticamente una
    // lista así ordena por lo que quedó adelante, y el dueño lo pidió corregido: «no mezcles
    // nombres con apellidos, necesito orden alfabetico claro».
    //
    // El recibo de sueldo los escribe SIEMPRE igual, APELLIDO y después nombres, porque lo emite el
    // sistema de liquidación. Es la forma canónica y ya la tenemos por CUIL. Quien no tenga recibo
    // conserva el nombre de la planilla: inventarle un orden a un nombre que no vimos escrito sería
    // adivinar cuál de sus palabras es el apellido.
    const cuilP = CUIL_POR_PERSONA_DE_PLANILLA[p.nombre]
    const oficial = cuilP ? recibosPorCuil.get(cuilP)?.nombre_recibo : null
    const comoSeLlama = comoSeEscribe(oficial ?? p.nombre)
    const nombreFila = q.dejoDeCargar ? `${comoSeLlama}  ▲ sin cargar desde el ${q.ultimoDiaSuyo}` : comoSeLlama
    // ═══ LA PLATA VA POR FÓRMULA CONTRA `_RECIBOS_RAW`, NO PEGADA ═══
    //
    // Regla de oro 5: *«nunca un número pegado: todo en celda referenciada y/o fórmula»*. El censo
    // midió 601 pegados en esta pestaña apenas entró al registro de controles. El neto del recibo y
    // lo transferido son DATO DE ORIGEN y viven en su réplica declarada; acá se los cita, y el
    // efectivo y el total se calculan en la celda. Así el que abre la pestaña puede ver de dónde
    // sale cada peso sin salir del archivo, que es de lo que se trata la regla.
    //
    // Con CUIL se cita; sin CUIL —quien no tiene recibo— se conserva el valor calculado, porque no
    // hay a qué apuntar. Esas filas quedan contadas por el censo y eso es correcto: son la excepción
    // y tienen que verse.
    // SUMIFS y no INDEX+MATCH: `MATCH(1;(A:A=x)*(B:B=y);0)` necesita semántica de array y sin
    // ARRAYFORMULA devuelve vacío — probado, la columna salió en blanco. Con una fila por
    // (CUIL, período) la suma ES el valor, y de paso es la fórmula más simple que resuelve, que es
    // lo que pide el checklist. Rangos CERRADOS, no `A:A`, por la misma razón.
    // ═══ TODA LA PLATA POR FÓRMULA (regla de oro 5) ═══
    //
    // Nada de esta fila es un número calculado y pegado. Las horas y el jornal CITAN el espejo de la
    // planilla; el neto del recibo y lo transferido citan `_RECIBOS_RAW`, que es el insumo declarado;
    // y el total y el efectivo son la cuenta hecha EN LA CELDA. Quien abre la pestaña puede seguir de
    // dónde sale cada peso sin salir del archivo.
    //
    // Queda un solo número pegado por fila: `$/h c/aumento`. No es un cálculo, es LA DECISIÓN del
    // dueño —cerrar la mitad de la brecha hasta el piso de convenio, sin pasarlo nunca— y la produce
    // `jornalConAumento`. Pegarlo es correcto; derivarlo en la celda sería reimplementar la regla en
    // dos lugares, que es como se separan.
    const R = "'_RECIBOS_RAW'!"
    const J = "'_J_OBREROS'!"
    const n = f.length + 1                   // la fila que va a ocupar en la Nómina
    const e = q.filaEspejo                   // su fila en el espejo de la planilla
    const cuilFila = CUIL_POR_PERSONA_DE_PLANILLA[p.nombre]
    const rec = (col, cuil, per) => `SUMIFS(${R}$E$1:$E$400;${R}$${col}$1:$${col}$400;"${cuil}";${R}$B$1:$B$400;"${per}")`
    const celdaBanco = cuilFila && delRecibo.banco !== null
      // SIN `Math.round`: el dueño, 31/08 — «cuidado con redondear en la pestaña nomina, dejar los
      // numeros de la manera correcta porque sino las transferencias se hacen mal». El recibo dice
      // $215.564,62 y redondear a $215.565 hace una transferencia por 38 centavos de más.
      ? `=${rec('A', cuilFila, periodoRecibo)}` : hoyR.banco
    // B · EL ADELANTO EN OBRA. Sale del espejo de la planilla, citado por fórmula como las horas y
    // el jornal: es el mismo dato, de la misma fila, y no hay razón para pegarlo.
    //
    // CERO, no el guión: esta celda entra en una resta. Con «—» adentro, `F−D−C−B` devuelve #VALUE!
    // y se llevó puesta la fila de Castillo y el total de la columna. El guión es para leer, no
    // para calcular; que el cero se VEA como guión lo resuelve el formato, no el contenido.
    const celdaAdel = e ? `=N(${J}$Y$${e})` : (Number(q.adelanto) || 0)
    // C · LO QUE YA SALIÓ POR EL BANCO. Otra fuente, otra columna: `_RECIBOS_RAW` trae una fila por
    // movimiento con su referencia del extracto. Sin CUIL no hay a qué apuntar y queda el valor.
    const celdaTransf = cuilFila
      ? `=SUMIFS(${R}$E$1:$E$400;${R}$C$1:$C$400;"${cuilFila}";${R}$F$1:$F$400;"QUINCENA")`
      : (porBanco || 0)
    // Las horas del espejo más los días que faltan a jornada completa. El sumando sólo aparece
    // cuando hay días pendientes, así la fórmula no lleva un «+0» que hace dudar.
    const celdaHoras = e ? `=N(${J}$V$${e})${q.pendientes ? `+${Math.round(q.pendientes)}` : ''}` : Math.round(q.horas)
    const celdaJornal = e ? `=N(${J}$W$${e})` : q.jornal
    // La categoría de convenio: la declarada si existe, y si la dedujo el OS va con «▲». Sin
    // equivalencia se muestra el código crudo de la planilla, que es mejor que un blanco: dice que
    // esa categoría no está mapeada y por eso su fila no tiene piso.
    const catConvenio = conv ? `${conv}${esInferida(codigo) ? ' ▲' : ''}` : (codigo || SIN_DATO)
    fila(nombreFila, catConvenio, celdaAdel, celdaTransf, celdaBanco,
      // ═══ EL TOTAL DE LA FILA ES LO QUE SALE, NO EL BRUTO (31/08) ═══
      //
      // «TOTAL A PAGAR» era `horas × $/hora`: el devengado de la quincena, con los adelantos ya
      // entregados adentro. En oficina era banco+efectivo y en liquidaciones otra cosa, así que la
      // misma columna significaba tres cosas y ninguna tarjeta del titular podía sumarla.
      //
      // Ahora las tres dicen lo mismo: **banco + efectivo = lo que sale de la caja por esta fila**.
      // El bruto no se pierde —es `Horas × $/h hoy`, las dos columnas están a la derecha— y lo ya
      // entregado sigue en sus dos columnas propias.
      // ═══ EL EFECTIVO VA REDONDEADO, Y EL REDONDEO ES DEL VALOR (31/08) ═══
      //
      // El dueño: «lo q se entrega en efectivo a cada uno y los conceptos en efectivo en general no
      // los quiero con centavos, redondea». Es obvio dicho así: no hay billete de 38 centavos.
      //
      // `ROUND` en la FÓRMULA, no en el formato. Redondear sólo la vista dejaría la celda valiendo
      // $372.435,38 mientras muestra $372.435, y el total de la columna sumaría los centavos que
      // nadie entrega — un total que no cierra contra los billetes que salen del sobre.
      //
      // La transferencia NO se redondea: ahí el centavo existe y el recibo dice $215.564,62.
      `=ROUND(N(L${n})*N(M${n})-N(E${n})-N(D${n})-N(C${n});0)`,
      `=N(E${n})+N(F${n})`,                            // total = lo que sale por esta fila
      // H · EL EFECTIVO CON AUMENTO, EXACTO. Es lo devengado: de acá sale el control y contra esto se
      // audita. No se toca.
      jornalNuevo != null ? `=ROUND(N(L${n})*N(N${n})-N(E${n})-N(D${n})-N(C${n});0)` : SIN_DATO,
      // I · EL MISMO NÚMERO, EN BILLETES. Pedido del dueño el 31/08: «si dice 215.215 dejar 215.000».
      // Va AL LADO del exacto, no encima: el sobre se arma con esta columna y la auditoría con la otra.
      // En la FÓRMULA y no en el formato — redondear la vista dejaría la celda valiendo 215.215 y el
      // total de la columna sumaría plata que nadie entrega.
      jornalNuevo != null ? `=${alMultiplo(`N(H${n})`)}` : SIN_DATO,
      // J · TOTAL c/aum. sigue colgando del EXACTO: es el devengado de la fila, no el sobre.
      jornalNuevo != null ? `=N(E${n})+N(H${n})` : SIN_DATO,
      // CUÁNTO SUBE CADA UNO. Es la cifra que el dueño decidió, y la saqué de más en el pase a
      // minimalismo: sin ella hay que restar dos celdas para saber qué cuesta el aumento por persona.
      jornalNuevo != null ? `=N(J${n})-N(G${n})` : SIN_DATO,
      celdaHoras, celdaJornal,
      jornalNuevo != null ? jornalNuevo : SIN_DATO)
  }
  // El conteo cuenta a los que QUEDARON en el cuadro. Con `activos.filter(...)` seguía diciendo 17
  // después de sacar a los dos liquidados: un total de 15 filas rotulado «17 persona(s)».
  const nF = f.length
  const n0 = nF - activos.filter((x) => quincena.porClave.has(x.clave) && !tieneLiquidacionFinal(x.nombre)).length + 1
  const suma = (c) => `=SUM(${c}${n0}:${c}${nF})`
  fila(rotuloTotal(`${activos.filter((p) => quincena.porClave.has(p.clave) && !tieneLiquidacionFinal(p.nombre)).length} persona(s)`),
    // B es la categoría (texto, no se suma); de C a J la plata; K las horas. L y M son tarifas —
    // promediar $/h es inventar un número que nadie cobra, así que quedan vacías.
    '', suma('C'), suma('D'), suma('E'), suma('F'), suma('G'), suma('H'), suma('I'), suma('J'), suma('K'),
    suma('L'), '', '')
  fila(sub(`Cerrar el ${Math.round(PORCENTAJE_DE_AUMENTO * 100)}% de la brecha hasta el piso de cada categoría cuesta `
    + `${Math.round(T.sube).toLocaleString('es-AR')} más en esta quincena. Después del aumento el plantel SIGUE por `
    + `debajo de la escala: es la decisión del dueño, y la mitad de la brecha que queda es exposición laboral abierta.`))
  // ═══ QUIÉNES COBRAN Y NO ESTÁN EN ESTE CUADRO ═══
  //
  // Tienen recibo —o sea, se les paga— y no tienen horas cargadas en la planilla de jornales, así
  // que su TOTAL no se puede calcular. Se muestran igual, con el banco que dice el recibo y el
  // efectivo en blanco: un cero ahí les pagaría sólo la parte registrada y se leería como correcto.
  const fueraDePlanilla = COBRAN_Y_NO_ESTAN_EN_LA_PLANILLA
    .map((x) => ({ ...x, r: [...recibosPorCuil.values()].find((v) => String(v.legajo) === String(x.legajo)) }))
    .filter((x) => x.r)
  if (fueraDePlanilla.length) {
    fila(sub(`${fueraDePlanilla.length} persona(s) cobran esta quincena y NO están en la planilla de jornales: `
      + `${fueraDePlanilla.map((x) => `${x.nombre} (leg. ${x.legajo}, banco ${Math.round(x.r.neto).toLocaleString('es-AR')})`).join(' · ')}. `
      + `Sin horas cargadas no hay TOTAL, así que su efectivo no se puede calcular — hay que cargarles las horas.`))
  }
  if (liquidados.length) {
    fila(sub(`${liquidados.length} persona(s) salieron de este cuadro porque ya cobraron su liquidación final: `
      + `${liquidados.join(' · ')}. Tienen horas cargadas hasta el día de la baja, pero NO cobran la quincena. `
      + `Su plata está en el cuadro 3.`))
  }
  if (sinRecibo.length) {
    fila(sub(`${sinRecibo.length} sin recibo confirmado para esta quincena: `
      + `${sinRecibo.map((x) => `${x.nombre} (${x.porQue})`).join(' · ')}. `
      + `A ésos el banco les sale de la planilla, no del recibo.`))
  }

  // ═══ 2 · OFICINA — MENSUAL, NO QUINCENAL ═══
  //
  // El dueño, 31/08: «falta lo relativo a las personas de "oficina" […] mismo arreglo de 50 y 50» y,
  // corrigiendo la primera versión: «es personal q cobra MENSUAL por mas q tenga 2 quincenas
  // liquidadas por mes, esto es algo aclarado hace mucho tiempo».
  //
  // Ésa es la diferencia con obra y no es cosmética. En obra la unidad es la quincena: se paga lo de
  // esos quince días y el ciclo cierra. En oficina el estudio liquida dos quincenas pero **el sueldo
  // es del mes**, así que tomar el recibo de la segunda quincena y tratarlo como el pago completo
  // publica la MITAD de lo que se le debe a una persona.
  //
  // Por eso el banco de esta tabla suma TODOS los recibos del mes —`"*-MM/AAAA"`, las dos
  // quincenas— y no el del período en curso. Sobre ese mensual corre el 50/50: mitad blanca lo
  // liquidado, mitad negra en efectivo, total el doble.
  //
  // Y SI FALTA UNA QUINCENA, SE DICE. Hoy sólo está cargada la segunda de agosto: el mensual que
  // publica esta tabla está incompleto y la nota lo declara con el nombre de lo que falta. Un número
  // incompleto presentado como completo es peor que un hueco visible.
  const deOficina = activos.filter((p) => p.sector === 'Oficina')
  if (deOficina.length) {
    const mes = `${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`
    // Cuántas quincenas de ESTE mes tiene cargada cada persona. Se cuenta por CUIL sobre los recibos
    // que ya están en la base: es el único lugar donde el hecho existe.
    const quincenasDe = (cuil) => Number(recibosDelMes.get(cuil)?.quincenas ?? 0)
    fila('')
    fila(seccion(2, `qué se le paga a oficina · mes ${mes}`))
    // ═══ EL RECIBO ES EL DE LA QUINCENA, NO LA SUMA DEL MES (31/08, corrección del dueño) ═══
    //
    // Yo sumaba las dos quincenas —$663.526,08 + $663.141,56 = $1.326.667,64— y él lo cortó:
    // «eso esta mal porque no es lo q indican los recibos de cada uno». Tiene razón: por banco va
    // lo que dice EL recibo, y el recibo de esta quincena dice $663.141,56.
    //
    // El neto ACORDADO sí es mensual ($1.800.000), así que la quincena vale la mitad y el efectivo
    // completa hasta ahí. Las dos cosas conviven sin contradecirse: el acuerdo se pacta por mes, la
    // plata se paga por quincena.
    fila(`Neto acordado de ${(Object.values(SUELDO_NETO_OFICINA)[0] ?? 0).toLocaleString('es-AR')} para CADA UNO. `
      + 'Por banco va lo que dice su recibo y el efectivo COMPLETA hasta ese neto: si el recibo sube, baja el efectivo.')
    // MISMA LETRA, MISMO SIGNIFICADO EN LOS TRES CUADROS. La columna B es la categoría también acá,
    // aunque venga vacía: la planilla de oficina NO trae categoría —`COL_OFICINA` la declara `null`—
    // y el «—» dice eso. Correr la plata una columna para ahorrarse dos guiones obliga a releer el
    // encabezado en cada tabla, que es de donde venía la sensación de descuadre.
    fila('Persona', 'Categoría', 'ADELANTO', 'YA TRANSFERIDO', 'POR BANCO', 'EN EFECTIVO', 'TOTAL A PAGAR', 'Quincenas del mes')
    const incompletos = []
    const sinRecibOfi = []
    const sinAcuerdoNeto = []
    const orden = (x) => comoSeEscribe(recibosDelMes.get(CUIL_POR_PERSONA_DE_PLANILLA[x.nombre])?.nombre_recibo ?? x.nombre)
    for (const p of [...deOficina].sort((x, y) => orden(x).localeCompare(orden(y), 'es'))) {
      const cuil = CUIL_POR_PERSONA_DE_PLANILLA[p.nombre]
      const r = cuil ? (recibosPorCuil.get(cuil) ?? recibosDelMes.get(cuil)) : null
      const comoSeLlama = comoSeEscribe(r?.nombre_recibo ?? p.nombre)
      const o = oficinaEspejo.get(p.nombre) ?? null
      const R = "'_RECIBOS_RAW'!"
      const nf = f.length + 1
      const cuantas = cuil ? quincenasDe(cuil) : 0
      // EL NETO ES UN ACUERDO DECLARADO, no un cálculo. Quien no lo tenga declarado no lleva total:
      // inventarle uno es inventarle el sueldo a una persona.
      const neto = cuil ? (SUELDO_NETO_OFICINA[cuil] ?? null) : null
      if (neto == null && r) sinAcuerdoNeto.push(comoSeEscribe(r.nombre_recibo))
      if (!r) {
        // Sin recibo no hay mitad blanca, y sin mitad blanca el 50/50 no tiene de dónde salir.
        sinRecibOfi.push(`${comoSeLlama} (sin recibo de ${mes})`)
        fila(comoSeLlama, SIN_DATO, o ? `=N('_J_OFICINA'!$X$${o.fila})` : 0, 0, SIN_DATO, SIN_DATO, SIN_DATO, 0)
        continue
      }
      if (cuantas < 2) incompletos.push(`${comoSeLlama} (${cuantas} de 2)`)
      fila(comoSeLlama,
        SIN_DATO,                            // la planilla de oficina no trae categoría
        o ? `=N('_J_OFICINA'!$X$${o.fila})` : 0,
        `=SUMIFS(${R}$E$1:$E$400;${R}$C$1:$C$400;"${cuil}";${R}$F$1:$F$400;"QUINCENA")`,
        // EL RECIBO DE ESTA QUINCENA. No la suma del mes: por banco va lo que dice el recibo.
        `=SUMIFS(${R}$E$1:$E$400;${R}$A$1:$A$400;"${cuil}";${R}$B$1:$B$400;"${periodoRecibo}")`,
        // El efectivo completa hasta el NETO ACORDADO, y va en billetes: sin centavos.
        `=ROUND(N(G${nf})-N(E${nf})-N(D${nf})-N(C${nf});0)`,
        // EL NETO ES DE CADA UNO, ENTERO. Lo partí por dos y el dueño lo cortó: «el 1.800.000 es el
        // salario de cada uno». No se prorratea: es lo que cobra la persona.
        neto ?? SIN_DATO,
        cuantas)
    }
    const oF = f.length
    const o0 = oF - deOficina.length + 1
    fila(rotuloTotal(`${deOficina.length} persona(s) de oficina`), '',
      `=SUM(C${o0}:C${oF})`, `=SUM(D${o0}:D${oF})`, `=SUM(E${o0}:E${oF})`, `=SUM(F${o0}:F${oF})`, `=SUM(G${o0}:G${oF})`,
      // NO va vacía: una celda vacía no borra, y acá quedaba viva la cuenta de quincenas de la
      // corrida anterior. Se escribe el mínimo de quincenas cargadas del grupo, que es lo que
      // decide si el mes está completo.
      Math.min(...deOficina.map((p) => quincenasDe(CUIL_POR_PERSONA_DE_PLANILLA[p.nombre]))))
    // ═══ ESTA NOTA SE ESCRIBE SIEMPRE, DIGA LO QUE DIGA ═══
    //
    // Cuando el mes se completó, la nota de «INCOMPLETO» desaparecía del grid… y se quedaba viva en
    // la pestaña, porque una celda vacía NO borra: la guarda NO-BORRAR conserva el destino y el
    // centinela tampoco pasa (lo lee como grilla vacía). Resultado: una advertencia falsa publicada
    // sobre un mes que ya estaba completo.
    //
    // La salida no es pelearse con la guarda —hace bien su trabajo— sino no dejar nunca un hueco:
    // la fila SIEMPRE lleva texto, y el texto nuevo pisa al viejo. De paso el cuadro dice de cuánto
    // mes está hablando sin que haya que contar recibos.
    fila(sub(incompletos.length
      ? `INCOMPLETO: el mes son DOS quincenas y falta cargar la primera de ${incompletos.join(' · ')}. `
        + 'Lo que publica esta tabla es lo que hay, no el mes entero: cuando entre el recibo que falta, el banco y el efectivo suben solos.'
      : `Mes completo: las dos quincenas de ${mes} están cargadas para las ${deOficina.length} persona(s) de oficina.`))
    if (sinRecibOfi.length) {
      fila(sub(`Sin recibo del mes: ${sinRecibOfi.join(' · ')}. Sin la parte blanca no se puede calcular el efectivo: `
        + 'a ésos la pestaña no les afirma ningún importe.'))
    }
    if (sinAcuerdoNeto.length) {
      fila(sub(`Sin neto acordado declarado: ${sinAcuerdoNeto.join(' · ')}. El neto de oficina no se calcula —es un `
        + 'acuerdo— así que se declara en SUELDO_NETO_OFICINA o la fila queda sin total.'))
    }
  }

  // ═══ 3 · LAS LIQUIDACIONES FINALES, 50 EN BLANCO Y 50 EN EFECTIVO ═══
  //
  // El dueño lo pidió textual: «me reflejes el calculo de 50 en blanco (lo liquidado) y 50 en negro
  // (lo q se paga en efectivo) […] debajo del cuadro de todos los salarios quincenales q se
  // abonaran mañana».
  //
  // Lo que liquidó el estudio ES la mitad blanca; la otra mitad es un monto igual en efectivo. El
  // total que sale de la caja es el DOBLE del recibo. Leerlo al revés —tomar el recibo como el
  // total— le paga a cada uno la mitad de lo que le corresponde.
  if (finales.size) {
    fila('')
    fila(seccion(3, 'lo que terminó · liquidaciones finales'))
    fila('Lo liquidado por el estudio es la mitad BLANCA del acuerdo; el efectivo es un monto igual. '
      + 'Lo que sale de la caja es la suma de las dos columnas, o sea el doble del recibo.')
    // ═══ LA MISMA COLUMNA SIGNIFICA LO MISMO EN TODA LA PESTAÑA ═══
    //
    // Este cuadro tenía la fecha en B y la plata corrida a partir de C, mientras el de arriba tenía
    // el transferido en B y el banco en C. Dos tablas con el mismo aspecto y distinto significado por
    // columna obligan a releer el encabezado en cada una, y es de donde viene la sensación de
    // descuadre. Ahora las dos tablas dicen lo mismo en la misma letra: B adelanto, C ya
    // transferido, D lo que va por banco, E el efectivo.
    //
    // A estas personas nadie les adelantó billetes en obra, así que su columna B es cero — y el
    // formato de la casa dibuja el cero como «—». La columna se ve vacía porque LO ESTÁ, que es un
    // dato: lo único que se les descontó salió del banco y tiene referencia en el extracto.
    //
    // Sin columna de fecha: es contexto, no plata, y su lugar es `_RECIBOS_RAW`, que la trae con la
    // fuente al lado. Acá obligaba a meter una columna de texto en medio del contrato numérico y
    // salía dibujada como su serial —«46.259»—, que es el defecto clásico de mezclar unidades.
    // ═══ EL 50/50 TIENE QUE VERSE, Y POR ESO EL EFECTIVO ACÁ NO NETA ═══
    //
    // Lo intenté al revés y el dueño lo marcó en el acto: «estan mal las liquidaciones finales
    // porque el acuerdo tb es 50 y 50». Netear el efectivo publicaba banco $330.431 contra efectivo
    // $30.431 — dos columnas que ya no se parecen— y el acuerdo dejaba de leerse en la fila.
    //
    // Así que la mitad negra es IGUAL a la blanca, el total es el doble, y lo ya entregado se resta
    // en su propia columna. Se ve el acuerdo Y se ve lo que falta pagar, que son dos preguntas
    // distintas y las dos se hacen sobre esta fila.
    // «MITAD NEGRA» EN VEZ DE «QUEDA POR PAGAR». El dueño pidió dos cosas que se peleaban: que el
    // 50/50 se VEA y que el titular cierre. Se resuelven separándolas: EN EFECTIVO neta lo ya
    // entregado —igual que en los otros dos cuadros, así el titular puede sumar la columna— y la
    // mitad negra del acuerdo, que es igual a la blanca, se muestra entera en su propia columna.
    // ═══ COMO ESTABA, QUE ERA COMO ESTABA BIEN (31/08, tercera vuelta) ═══
    //
    // El dueño: «pesimo el calculo de liquidaciones finales, estaba bien lo indicaba antes». Tiene
    // razón y las dos veces que lo cambié fue para arreglar el TITULAR, no el cuadro — que es
    // exactamente al revés de como se hace.
    //
    // Vuelve lo que él aprobó: la mitad blanca es lo que liquidó el estudio, la negra es OTRO TANTO
    // IGUAL, el total es el doble, y lo ya entregado se resta aparte en «QUEDA POR PAGAR». El 50/50
    // se lee en la fila sin hacer ninguna cuenta.
    //
    // El titular se arregla en el titular: su tarjeta de transferencia ya no suma la columna del
    // banco —que acá muestra el acuerdo, no lo que falta girar— sino que sale de restarle el
    // efectivo al total. Ver `deTodos` en el bloque del hero.
    // ═══ LA COLUMNA «POR BANCO» DICE LO QUE FALTA GIRAR, NO EL ACUERDO ═══
    //
    // Es la corrección que faltaba y la que hacía que el titular dijera cualquier cosa. En los
    // otros dos cuadros «POR BANCO» es plata que TODAVÍA no salió; acá mostraba la mitad blanca
    // entera, con $600.000 ya girados adentro. La misma letra con dos significados: la tarjeta que
    // suma esa columna pedía transferir dos veces lo mismo.
    //
    // Ahora las tres columnas significan lo mismo en los tres cuadros, así que cada tarjeta ES la
    // suma de su columna y las dos primeras dan la tercera. El 50/50 no se pierde: la mitad negra
    // está en EN EFECTIVO y la blanca, entera, en su propia columna al final.
    fila('Persona', 'Categoría', 'ADELANTO', 'YA TRANSFERIDO', 'POR BANCO (a girar)', 'EN EFECTIVO', 'TOTAL A PAGAR', 'MITAD BLANCA (lo liquidado)')
    const F = { blanco: 0, negro: 0, total: 0, dado: 0, queda: 0 }
    const ordenadas = [...finales.values()].sort((a, b) => String(a.nombre_recibo).localeCompare(String(b.nombre_recibo), 'es'))
    for (const r of ordenadas.filter((x) => !esSubcontratista(x.nombre_recibo))) {
      const c = reparto50DeLiquidacionFinal(r.neto)
      if (c.total === null) { fila(r.nombre_recibo, SIN_DATO, 0, SIN_DATO, SIN_DATO, SIN_DATO, SIN_DATO, SIN_DATO); continue }
      // ═══ LO QUE YA SE LE TRANSFIRIÓ CONTRA SU LIQUIDACIÓN ═══
      //
      // El lote de haberes del 28/08 les pagó $300.000 a Jofre y $300.000 a Sosa. Esa plata NO es
      // un adelanto de quincena —ellos ya no cobran la quincena— sino un pago a cuenta de esto. Sin
      // restarla acá, el cuadro pide transferir de nuevo lo que ya salió.
      //
      // ═══ POR CUIL, Y LA PRIMERA VERSIÓN POR NOMBRE FALLÓ EN LA PRIMERA CORRIDA ═══
      //
      // Emparejaba por nombre normalizado con prefijo de nueve letras. El banco escribe «Sosa Nestor
      // Raul» y su recibo dice «SOSA NESTROR RAUL»: una letra de diferencia en la posición nueve, y
      // su fila salió publicando que no se le había transferido nada cuando ya tenía $300.000
      // encima. Le pedía al dueño transferir de nuevo lo que ya había salido.
      //
      // El CUIL de esos dos movimientos se completó desde el CUIL de sus propios recibos. Sin CUIL
      // NO se resta: la fila muestra el total entero y eso se ve, que es mejor que restarle a quien
      // no corresponde.
      const dado = (adelantosDeFinal.filas ?? [])
        .filter((a) => a.cuil && a.cuil === r.cuil)
        .reduce((acc, a) => acc + Number(a.importe), 0)
      F.blanco += c.blanco; F.negro += c.negro; F.total += c.total; F.dado += dado; F.queda += c.total - dado
      // Igual que el cuadro 1: el blanco CITA la réplica y el resto es la cuenta en la celda. El
      // negro es un espejo del blanco —el 50/50— y el total su suma; escribirlos como números sería
      // pegar tres veces el mismo hecho.
      const nf = f.length + 1
      const cita = `SUMIFS('_RECIBOS_RAW'!$E$1:$E$400;'_RECIBOS_RAW'!$A$1:$A$400;"${r.cuil}";'_RECIBOS_RAW'!$B$1:$B$400;"FINAL")`
      fila(r.nombre_recibo,
        SIN_DATO,                              // su categoría no vive en ninguna fuente del archivo
        0,                                     // adelanto en obra: a estas personas no se les dio
        dado ? `=SUMIFS('_RECIBOS_RAW'!$E$1:$E$400;'_RECIBOS_RAW'!$C$1:$C$400;"${r.cuil}";'_RECIBOS_RAW'!$F$1:$F$400;"LIQUIDACION_FINAL")` : 0,
        // La mitad negra es IGUAL a la blanca —el acuerdo— y el total es el doble del recibo.
        // Lo ya entregado se resta al final, en su columna, sin tocar el 50/50.
        // ═══ LO YA TRANSFERIDO SE RESTA DEL BANCO, NO DEL EFECTIVO (31/08) ═══
        //
        // Lo tenía al revés y el dueño lo vio en las tarjetas: los $300.000 de cada uno salieron
        // por TRANSFERENCIA —el lote de haberes del 28/08—, así que reducen lo que falta
        // transferir, no los billetes. Restándolos del efectivo, la tarjeta «POR TRANSFERENCIA»
        // pedía transferir $600.000 que YA habían salido.
        //
        // De paso el 50/50 vuelve a leerse solo: EN EFECTIVO ($330.431) es exactamente la mitad
        // negra, igual a lo liquidado, y lo que se descontó se ve en la columna de al lado.
        // La blanca es lo liquidado; la negra es un monto IGUAL; lo que queda por pagar descuenta
        // lo ya entregado; y el total del acuerdo —el doble— queda a la vista en la última columna.
        // Falta girar = lo liquidado menos lo ya girado. La mitad negra es IGUAL a la blanca.
        `=ROUND(N(${cita})-N(D${nf})-N(C${nf});0)`, `=ROUND(N(${cita});0)`,
        `=N(E${nf})+N(F${nf})`, `=ROUND(N(${cita});0)`)
    }
    // Cuenta las que QUEDARON en el cuadro. Con `finales.size` decía «7 liquidaciones» sobre dos
    // filas, porque las otras cinco se habían ido al bloque de subcontratistas.
    const q1 = f.length - ordenadas.filter((x) => !esSubcontratista(x.nombre_recibo)).length + 1
    const q2 = f.length
    fila(rotuloTotal(`${ordenadas.filter((x) => !esSubcontratista(x.nombre_recibo)).length} liquidación(es) final(es)`),
      '', `=SUM(C${q1}:C${q2})`, `=SUM(D${q1}:D${q2})`,
      `=SUM(E${q1}:E${q2})`, `=SUM(F${q1}:F${q2})`, `=SUM(G${q1}:G${q2})`, `=SUM(H${q1}:H${q2})`)
    // G ES «QUEDA POR PAGAR» EN ESTE CUADRO Y «TOTAL A PAGAR» EN LOS OTROS DOS, y las dos cosas son
    // lo mismo: lo que todavía sale de la caja por esa fila. Por eso el titular puede sumar la
    // columna G de los tres sin mezclar nada.
    // ARCA LO CONFIRMA, ASÍ QUE LA NOTA LO AFIRMA. Hasta el 31/08 esta línea decía «su vínculo
    // terminó» apoyada sólo en que el estudio les liquidó el final. Ahora está la constancia de
    // baja de ARCA de los dos, con fecha de cese 25/08/2026 y causal, guardada en su legajo.
    fila(sub('Estas personas NO cobran la quincena: ARCA registra su baja el 25/08/2026 (despido Art. 5° Ley 25.371) '
      + 'y la constancia está en su legajo. El costo de desvincular al resto del plantel está en la pestaña Plantel.'))

  }


  const bajas = activos.filter((p) => quincena.porClave.get(p.clave)?.dejoDeCargar)
  if (bajas.length) {
    // «SI ES UNA BAJA» YA NO ES UNA PREGUNTA para quien tiene liquidación final: el cuadro 3 la
    // publica y ARCA la registró. La duda se conserva SÓLO para quien dejó de cargar horas y no
    // tiene ni liquidación ni constancia — que es el caso que hay que mirar.
    fila(sub(`${bajas.length} sin horas desde antes del cierre —${bajas.map((p) => `${p.nombre} (${quincena.porClave.get(p.clave).ultimoDiaSuyo})`).join(' · ')}—: `
      + `se les paga lo cargado y NO se les completan los días que faltan. `
      + `${bajas.every((p) => tieneLiquidacionFinal(p.nombre)) ? 'Los dos tienen su liquidación final en el cuadro 3 y su baja registrada en ARCA.' : 'Al que no tenga liquidación final ni baja en ARCA hay que mirarlo: dejó de cargar horas y sigue en el plantel.'}`))
  }
  // ═══ POR QUÉ ESTE TOTAL NO ES EL DE «JORNALES POR QUINCENA» ═══
  //
  // Aquella pestaña publica la quincena con las horas CARGADAS —es lo correcto para conciliar contra
  // la planilla— y ésta la publica COMPLETA, que es lo que se va a firmar el día de pago. Los dos
  // números son ciertos y miden cosas distintas; el que se calla es el que después no cierra.
  // ESTA NOTA COMPARABA DOS COSAS QUE YA NO SON COMPARABLES. Decía «Jornales por Quincena publica
  // 7.540.500 y acá se completan las horas que faltan», y desde que «TOTAL A PAGAR» de este cuadro
  // pasó a ser lo que SALE de la caja (banco + efectivo, neto de adelantos), su total es $6.331.859:
  // el lector veía dos cifras distintas presentadas como la misma. Se dice qué es cada una.
  fila(sub(`El devengado de la quincena es ${Math.round(T.totalCargado).toLocaleString('es-AR')} `
    + `(${Math.round(T.cargadas)} h cargadas${T.horas > T.cargadas ? ` + ${Math.round(T.horas - T.cargadas)} h completadas` : ''}), `
    + `que es lo que publica «Jornales por Quincena». El TOTAL A PAGAR de arriba es menor porque ya `
    + `tiene descontado lo que se entregó en adelantos y transferencias.`))
  if (sinConvenio.length) fila(sub(`${sinConvenio.length} sin equivalencia de convenio declarada: ${sinConvenio.join(' · ')}. No se les mide el piso.`))
  // Y LA OTRA MITAD DE LA MISMA PREGUNTA: los que SÍ tienen equivalencia, pero la puso el OS. La línea
  // desaparece sola el día que el dueño las confirme — no hay nada que apagar a mano.
  const inferidas = lineaEquivalenciasInferidas(conInferencia)
  if (inferidas) fila(sub(inferidas))
  fila()

  // ═══ 2 · QUIÉNES SON ═══
  // ─── DESDE ACÁ, TODO VA A «Plantel» ───
  destino = g
  fila('Plantel')
  fila('Quiénes son, qué devengaron en el año, qué costaría desvincularlos y qué papel les falta en el legajo.')
  fila(`Respaldo de «Nómina». Al ${fecha(hoy)}.`)
  fila()
  fila(seccion(1, 'quiénes son'))
  fila('Persona', 'Sector', 'Cat.', 'Ingreso', 'Antigüedad', '$/hora', 'Horas 2026', 'Devengado 2026', 'Promedio mensual')
  let horasT = 0
  let importeT = 0
  for (const p of activos) {
    const t = totalAnio(p.devengado)
    horasT += t.horas; importeT += t.importe
    const ant = antiguedad(p.ingreso, hoy)
    const conHoras = [...p.devengado.meses.values()].filter((v) => v.importe > 0).length
    fila(p.nombre, p.sector, p.categoria || SIN_DATO, p.ingreso ? fecha(p.ingreso) : SIN_DATO,
      ant ? `${ant.anios} a ${ant.meses} m` : SIN_DATO, p.jornalPactado || SIN_DATO,
      Math.round(t.horas), Math.round(t.importe), conHoras ? Math.round(t.importe / conHoras) : SIN_DATO)
  }
  fila(rotuloTotal(`${activos.length} persona(s)`), '', '', '', '', '', Math.round(horasT), Math.round(importeT))
  fila()

  // ═══ 3 · EL AÑO, MES A MES ═══
  fila(seccion(2, `lo devengado mes a mes · ${ANIO}`))
  fila('Persona', ...MES_CORTO, 'TOTAL AÑO', 'Horas')
  const porMes = new Array(12).fill(0)
  for (const p of activos) {
    const cel = meses.map((m, i) => {
      const v = p.devengado.meses.get(m)
      if (!v || !v.importe) return SIN_DATO
      porMes[i] += v.importe
      return Math.round(v.importe)
    })
    const t = totalAnio(p.devengado)
    fila(p.nombre, ...cel, Math.round(t.importe), Math.round(t.horas))
  }
  fila(rotuloTotal('TOTAL'), ...porMes.map((v) => (v ? Math.round(v) : SIN_DATO)), Math.round(importeT), Math.round(horasT))
  const sinPrecio = activos.filter((p) => p.devengado.horasSinPrecio > 0)
  if (sinPrecio.length) fila(sub(`${sinPrecio.length} persona(s) con horas cargadas sin $/hora: esas horas se cuentan y NO se valorizan`))
  fila()

  // ═══ 4 · QUÉ CUESTA DESVINCULAR ═══
  //
  // ═══ LA LIQUIDACIÓN CUBRE LA MITAD, Y ESO TIENE QUE VERSE ═══
  //
  // El dueño lo pidió textual: *"la liq sólo contempla el 50%, el restante se tiene que completar
  // con efectivo"*. Es el mismo acuerdo con el que se paga cada quincena —`ACUERDO_BANCO`, la
  // política que él fijó— aplicado al día que alguien se va: el recibo formal se arma sobre la mitad
  // registrada, y para que la persona cobre lo que realmente le corresponde, la otra mitad se
  // entrega en efectivo.
  //
  // POR QUÉ VA EN DOS COLUMNAS Y NO EN UNA NOTA: un total único contesta «cuánto sale» y esconde
  // «cuánto de eso puedo pagar por recibo», que es la pregunta que decide cómo se junta la plata. Y
  // porque quedarse sólo con la liquidación formal —el error que esto previene— subestima el costo
  // de una desvinculación a la mitad exacta.
  fila(seccion(3, 'qué cuesta desvincular a cada uno'))
  fila(`La liquidación formal cubre el ${Math.round(ACUERDO_BANCO * 100)}% —la parte registrada—; el resto se completa en efectivo. Las dos columnas SUMAN: juntas son lo que sale de la caja.`)
  fila('El fondo de cese va aparte y NUNCA se suma: es plata del trabajador que se le entrega con la libreta, no un desembolso nuevo.')
  fila('Persona', 'Régimen', 'Antigüedad', 'Vacaciones', 'SAC', 'SAC s/vac.', 'FCL no depositado',
    'Liquidación (por recibo)', 'A completar en efectivo', rotuloTotal('SALE DE LA CAJA'), 'Fondo de cese acumulado')
  let saleTotal = 0
  let porReciboTotal = 0
  let enEfectivoTotal = 0
  let fondoTotal = 0
  for (const p of activos) {
    const l = costoDe(p, hoy)
    const sale = (l.vacaciones || 0) + (l.sac || 0) + (l.sacSobreVacaciones || 0) + (l.fclPagoDirecto || 0)
    const porRecibo = sale * ACUERDO_BANCO
    const enEfectivo = sale - porRecibo
    saleTotal += sale
    porReciboTotal += porRecibo
    enEfectivoTotal += enEfectivo
    const fondo = l.fclDevengadoAcumulado ?? null
    if (typeof fondo === 'number') fondoTotal += fondo
    fila(p.nombre,
      p.convenio ? (/22\.250/.test(p.convenio) ? 'Ley 22.250' : p.convenio) : 'sin declarar',
      l.antiguedad ? `${l.antiguedad.anios} a ${l.antiguedad.meses} m` : SIN_DATO,
      Math.round(l.vacaciones || 0), Math.round(l.sac || 0), Math.round(l.sacSobreVacaciones || 0),
      Math.round(l.fclPagoDirecto || 0),
      Math.round(porRecibo), Math.round(enEfectivo), Math.round(sale),
      typeof fondo === 'number' ? Math.round(fondo) : SIN_DATO)
  }
  fila(rotuloTotal(`${activos.length} persona(s)`), '', '', '', '', '', '',
    Math.round(porReciboTotal), Math.round(enEfectivoTotal), Math.round(saleTotal), Math.round(fondoTotal))
  fila(sub(`Si se fueran todos hoy: ${Math.round(porReciboTotal).toLocaleString('es-AR')} por recibo + ${Math.round(enEfectivoTotal).toLocaleString('es-AR')} en efectivo = ${Math.round(saleTotal).toLocaleString('es-AR')} de la caja.`))
  fila(sub('El preaviso y la indemnización por antigüedad son CERO por el último párrafo del art. 15 de la ley 22.250, no por olvido.'))
  // ═══ LOS DOS DE «OFICINA» SON CONSTRUCCIÓN, Y ESTÁ PROBADO CON EL PAPEL ═══
  //
  // La duda era real y cara: bajo la LCT una liquidación suma preaviso (art. 231/232), integración
  // del mes (art. 233) e indemnización por antigüedad (art. 245) — millones que bajo la 22.250 no
  // existen. Aparecen en `_J_OFICINA` sólo porque ahí se cargan sus horas, no por su régimen.
  //
  // Se resolvió leyendo sus legajos, no razonando:
  //   · MALDONADO BATISTA EMILIANO — «Libreta de Fondo de Cese Laboral, Ley 22.250», IERIC.
  //   · NIEVAS (VILLEGAS) JUAN PABLO — formulario FWEB 1988796 ante el IERIC (nº 173621/4):
  //     ingreso 07/02/2026, OFICIAL ESPECIALIZADO, albañil. De ahí salió su fecha de ingreso, que
  //     hasta hoy no estaba en ningún lado y le dejaba la antigüedad, las vacaciones y el fondo en
  //     cero — que no es «no le corresponde», es «no lo pude calcular».
  const oficina = activos.filter((p) => p.sector === 'Oficina')
  if (oficina.length) {
    fila(sub(`Los ${oficina.length} de «Oficina» (${oficina.map((p) => p.nombre).join(' · ')}) están bajo la ley 22.250 igual que los obreros: probado con la libreta del IERIC de uno y el formulario de alta del otro. Por eso no llevan preaviso ni indemnización por antigüedad.`))
    const sinIngreso = oficina.filter((p) => !p.ingreso)
    if (sinIngreso.length) fila(sub(`Sin fecha de ingreso en ningún lado: ${sinIngreso.map((p) => p.nombre).join(' · ')}. Sin ella no hay antigüedad, ni vacaciones proporcionales, ni fondo.`))
  }
  fila()

  // ═══ 5 · EL LEGAJO EN DRIVE ═══
  fila(seccion(4, 'el legajo de cada uno en Drive'))
  fila('Mira el NOMBRE de los archivos de su carpeta, no el contenido: un «alta.pdf» que adentro tenga otra cosa se cuenta como alta igual.')
  fila('Persona', 'Carpeta en Drive', ...PAPELES.map((p) => p.rotulo), 'Recibos', 'Último recibo', 'Qué falta')
  const sinCarpeta = []
  let completos = 0
  for (const p of activos) {
    const m = carpetaDe(p.nombre, legajos.carpetas)
    if (!m.seguro) {
      sinCarpeta.push(`${p.nombre}${m.candidatos.length ? ` (¿${m.candidatos.slice(0, 3).join(' o ')}?)` : ''}`)
      fila(p.nombre, m.candidatos.length ? 'sin emparejar' : 'SIN CARPETA',
        ...PAPELES.map(() => SIN_DATO), SIN_DATO, SIN_DATO,
        m.candidatos.length ? 'no se pudo emparejar con certeza' : 'no tiene carpeta en 1. ACTIVOS')
      continue
    }
    const pa = papelesDe(legajos.porCarpeta.get(m.carpeta) ?? [])
    if (!pa.falta.length) completos += 1
    fila(p.nombre, m.carpeta, ...PAPELES.map((x) => (pa[x.clave] ? 'sí' : SIN_DATO)),
      pa.recibos || SIN_DATO, pa.ultimoRecibo ?? SIN_DATO, pa.falta.length ? pa.falta.join(' · ') : 'completo')
  }
  fila(rotuloTotal(`${completos} de ${activos.length} con los cuatro papeles`))
  if (sinCarpeta.length) fila(sub(`${sinCarpeta.length} sin carpeta emparejada: ${sinCarpeta.join(' · ')}`))
  fila()

  // ═══ 6 · LO QUE NO SE PUEDE DECIR ═══
  // Las limitaciones son de la Nómina y van al pie de la Nómina: son los límites del número que se
  // paga, no del cuadro de respaldo.
  destino = f
  fila('')
  fila(seccion(4, 'lo que esta pestaña NO puede decir'))
  fila(sub('Sólo el plantel ACTIVO. Los desvinculados se sacaron por pedido del dueño: su devengado histórico vive en la planilla de jornales.'))
  fila(sub('Los acuerdos particulares (premios, condiciones fuera de convenio) no están en la planilla: no se inventan.'))
  fila(sub('Del legajo se mira QUÉ archivos hay, no qué dicen: el CUIL, la obra social y la familia siguen adentro de los PDF.'))
  fila(sub('Las cargas sociales no se abren por persona: la planilla las tiene por total.'))
  fila(sub('El fondo de cese acumulado se calcula sobre el jornal de la planilla. Si los aportes se depositaron sobre la mitad registrada, el fondo real es la mitad de lo que dice esa columna — no lo puedo verificar desde acá.'))
  fila(sub('«Activo» es aparecer en la última quincena cargada. Una licencia larga se lee como baja: la planilla no las distingue.'))
  return { nomina: f, plantel: g }
}

/**
 * EL FORMATO, QUE ES LA MITAD DEL PEDIDO.
 *
 * Una tabla de cuarenta personas y catorce columnas de pesos SIN separador de miles no se lee: es
 * exactamente la queja que el dueño hizo sobre «Proveedores» el mismo día. Tres cosas y ninguna
 * decorativa: el patrón de miles en todo lo que es plata, ancho suficiente para que un apellido no
 * se corte, y negrita donde está el número que decide (encabezados, totales y títulos de sección).
 *
 * El patrón va en formato US (`#,##0`) aunque el archivo esté en es-AR: la API interpreta el patrón
 * en US y lo MUESTRA con la coma y el punto del locale. Escribirlo con el separador local lo rompe.
 */
/**
 * DOS NOTAS IDÉNTICAS SEGUIDAS NO SON DOS NOTAS: ES UN DEFECTO PUBLICADO.
 *
 * La corrida del 31/08 publicó tres pares exactos —el aviso de Castillo, el de la quincena que falta
 * en oficina y el de la equivalencia inferida— cada uno repetido en la fila de abajo. Da igual dónde
 * esté la causa: **una pestaña que dice dos veces lo mismo hace dudar del resto**, y el dueño la usa
 * para pagar.
 *
 * Sólo se colapsa el caso inequívoco: dos filas CONSECUTIVAS, con el mismo texto en la columna A y
 * el resto vacío. Una fila de datos nunca cumple eso —lleva importes— y dos personas homónimas
 * tampoco, porque tendrían plata al lado. Se informa cuántas se colapsaron: si el número no baja a
 * cero cuando alguien arregle la causa, es que la causa sigue ahí.
 */
export function sinNotasRepetidas(filas = []) {
  const soloA = (f) => String(f?.[0] ?? '').trim() && (f ?? []).slice(1).every((c) => !String(c ?? '').trim())
  const out = []
  let repetidas = 0
  for (const f of filas) {
    const previa = out[out.length - 1]
    if (previa && soloA(f) && soloA(previa) && String(f[0]).trim() === String(previa[0]).trim()) { repetidas++; continue }
    out.push(f)
  }
  if (repetidas) console.log(`  ⚠ ${repetidas} nota(s) repetida(s) colapsada(s) — hay un defecto en el armado, no sólo en la vista`)
  return out
}

async function formatear(google, hoja, filas) {
  // ═══ EL FORMATO SALE DE `estilo-pestana`, COMO EN TODO EL ARCHIVO ═══
  //
  // Esta pestaña era la ÚNICA del Sheet con su propio formateo escrito a mano: CAJA, Cheques,
  // Jornales, Estructura, OBRAS y Calendario pasan todas por `lib/estilo-pestana.mjs`. Por eso se
  // veía distinta por más que se le arreglaran los detalles — no era un problema de detalles, era
  // que no hablaba el mismo idioma. El dueño lo dijo así: «no coincide con el formato de todo el
  // sheet».
  //
  // Todo formato pasa por `E.conFuente`: si se define `textFormat` sin nombrar la tipografía, Sheets
  // la reemplaza por la de la hoja y la celda queda en otra fuente.
  const s = hoja.sheetId
  const n = filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId: s, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const conTitular = filas.some((x) => String(x?.[0] ?? '') === 'QUÉ SALE DE LA CAJA MAÑANA')
  const req = [
    { unmergeCells: { range: r(0, Math.max(n, 200)) } },
    E.reset(s, Math.max(n + 20, 200), ANCHO),
    // SIN CUADRÍCULA y con el titular congelado: la jerarquía la hace la tipografía, no la reja.
    // SE CONGELA HASTA EL TITULAR, y sólo si lo hay. Congelar ocho filas en «Plantel», cuya tabla
    // arranca en la sexta, dejaba las dos primeras personas atrapadas en la banda fija: la fila se
    // veía bloqueada y no se podía scrollear por encima de ella.
    { updateSheetProperties: { properties: { sheetId: s, gridProperties: { hideGridlines: true, frozenRowCount: conTitular ? 8 : 3 } }, fields: 'gridProperties.hideGridlines,gridProperties.frozenRowCount' } },
    { updateDimensionProperties: { range: { sheetId: s, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ANCHO.concepto }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: s, dimension: 'COLUMNS', startIndex: 1, endIndex: ANCHO }, properties: { pixelSize: E.ANCHO.numero }, fields: 'pixelSize' } },
  ]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: E.conFuente(format) }, fields } })

  // ── EL CONTRATO DE COLUMNAS, DECLARADO POR EL ENCABEZADO DE CADA TABLA ─────────────────────────
  //
  // La primera versión aplicaba UN contrato a toda la pestaña —B a G plata, H en adelante
  // cantidades— porque en la Nómina las dos tablas significan lo mismo en la misma columna. Cuando
  // «Plantel» pasó a usar este mismo formateo, ese contrato le pintó la fecha de Ingreso como
  // «$45.803» —su serial vestido de pesos— y las Horas del año como «$1.550». Cuatro tablas
  // heterogéneas no comparten contrato, y forzarlas a uno es inventar un significado.
  //
  // La unidad la declara el RÓTULO, que es el único lugar donde ya está escrita. Un número sin
  // rótulo reconocible se dibuja como cantidad, no como plata: equivocarse hacia «1.408» es una
  // molestia, hacia «$1.408» es afirmar que son pesos.
  fmt(r(0, n, 0, 1), 'userEnteredFormat.numberFormat,userEnteredFormat.wrapStrategy', { numberFormat: E.NUM.texto, wrapStrategy: 'CLIP' })
  // CUATRO UNIDADES, NO DOS. La primera versión partía en «plata» y «no plata», y a todo lo que no
  // era plata le ponía formato de CANTIDAD: así «Ley 22.250» y «OF» quedaron como texto dentro de una
  // celda con formato numérico —79 casos en «Plantel»—. Una categoría no es un número chico: es otra
  // cosa, y la planilla tiene que saberlo o el día que alguien ordene la columna, ordena mal.
  const unidadDe = (rotulo) => {
    const t = String(rotulo ?? '').toLowerCase()
    if (/fecha|ingreso|egreso|vence/.test(t)) return E.NUM.fecha
    // «categor» cubre «Cat.» y «Categoría»: es TEXTO. Sin esto caía al default y la columna nueva
    // salía con formato de moneda — una categoría dibujada como plata es el defecto que dejó 79
    // celdas de texto dentro de celdas numéricas en «Plantel».
    if (/antig|categor|cat\.|sector|convenio|régimen|regimen|carpeta|falta|persona|estado|qué|que es|último|ultimo|variante|unidad|alta|libreta|dni|epp|ieric/.test(t)) return E.NUM.texto
    // «Quincenas cargadas» es un CONTEO (1 de 2). Sin esto caía en el default y salía «$1»: un
    // recuento vestido de pesos, que es el mismo defecto que puso «$45.803» en una fecha de ingreso.
    if (/hora|hs\b|\$\/h|recibos|personas|días|dias|quincenas|cargadas/.test(t)) return E.NUM.cantidad
    // ═══ CON CENTAVOS EN LA NÓMINA, PORQUE DE ACÁ SE COPIAN LAS TRANSFERENCIAS (31/08) ═══
    //
    // El dueño: «cuidado con redondear en la pestaña nomina, dejar los numeros de la manera correcta
    // porque sino las transferencias se hacen mal». El formato de la casa es `"$"#,##0` —sin
    // decimales— y con él el recibo de Aguero, que dice $215.564,62, se DIBUJA $215.565. El valor de
    // la celda siempre estuvo bien; lo que estaba mal era lo que se leía, y de lo que se lee salen
    // las transferencias.
    //
    // Sólo en la Nómina. «Plantel» son agregados anuales donde el centavo es ruido y nadie transfiere
    // desde ahí.
    // LOS CENTAVOS VAN DONDE HAY TRANSFERENCIA, NO DONDE HAY BILLETES. El recibo dice
    // $215.564,62 y eso se transfiere tal cual; el efectivo se entrega en mano y se redondea. La
    // celda del efectivo YA viene redondeada por `ROUND` — esto sólo evita mostrarle un «,00» a un
    // número que no tiene decimales.
    if (hoja?.title !== 'Nómina') return E.NUM.moneda
    return /efectivo|adelanto|negra|sube/.test(t) ? E.NUM.moneda : E.NUM.monedaExacta
  }
  // Cada tabla va de su encabezado («Persona») hasta su fila de total inclusive.
  for (let i = 0; i < n; i++) {
    if (String(filas[i]?.[0] ?? '') !== 'Persona') continue
    let fin = i + 1
    while (fin < n && !ES_TOTAL.test(String(filas[fin]?.[0] ?? ''))) fin++
    fin = Math.min(fin + 1, n)
    for (let c = 1; c < ANCHO; c++) {
      const u = unidadDe(filas[i][c])
      const alineacion = u === E.NUM.fecha ? 'CENTER' : u === E.NUM.texto ? 'LEFT' : 'RIGHT'
      fmt(r(i + 1, fin, c, c + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
        { numberFormat: u, horizontalAlignment: alineacion })
    }
  }

  // ── LA JERARQUÍA, FILA POR FILA ────────────────────────────────────────────────────────────────
  const texto = (i) => String(filas[i]?.[0] ?? '')
  for (let i = 0; i < n; i++) {
    if (i === 0) { fmt(r(0, 1), 'userEnteredFormat', E.titulo()); continue }
    if (ES_SECCION_NUM.test(texto(i))) { fmt(r(i, i + 1), 'userEnteredFormat', E.bloque()); continue }
    if (texto(i) === 'Persona') {
      fmt(r(i, i + 1), 'userEnteredFormat', E.encabezado())
      // El encabezado envuelve, así que necesita alto propio: con los 20px de una fila normal se ve
      // la primera línea y el resto queda cortado abajo, sin que nada avise.
      req.push({ updateDimensionProperties: { range: { sheetId: s, dimension: 'ROWS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } })
      continue
    }
    if (ES_TOTAL.test(texto(i))) {
      // Sólo hasta la columna de plata: pintado hasta el final, el total dibujaba las HORAS como
      // pesos —«$1.408»— porque `E.total()` trae su propio formato de moneda.
      fmt(r(i, i + 1, 0, 7), 'userEnteredFormat', E.total())
      // El total se rula con una línea fina arriba, no con relleno: es la diferencia entre una
      // planilla y un estado financiero.
      req.push({ updateBorders: { range: r(i, i + 1), top: { style: 'SOLID', color: E.COLOR.hairline ?? { red: 0.8, green: 0.84, blue: 0.86 } } } })
      continue
    }
    if (ES_SUBITEM.test(texto(i))) fmt(r(i, i + 1), 'userEnteredFormat', E.nota())
  }

  // ── EL TITULAR: rótulo chico y gris, cifra grande, contexto chico ──────────────────────────────
  //
  // Es la forma de una tarjeta en cualquier producto de tesorería, y es la misma que ya usa CAJA.
  // Repetirla idéntica es lo que hace que las tres cifras se lean de un vistazo en vez de una a una.
  const fHero = filas.findIndex((x) => String(x?.[0] ?? '') === 'QUÉ SALE DE LA CAJA MAÑANA')
  if (fHero >= 0) {
    fmt(r(fHero, fHero + 1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: E.TAM.bloque, foregroundColor: E.COLOR.titulo } })
    fmt(r(fHero + 1, fHero + 2), 'userEnteredFormat', { numberFormat: E.NUM.texto, textFormat: { bold: true, fontSize: E.TAM.nota, foregroundColor: E.COLOR.bloqueTexto }, horizontalAlignment: 'LEFT', verticalAlignment: 'BOTTOM', wrapStrategy: 'CLIP' })
    // CON FORMATO DE MONEDA. El contrato de columnas pasó a aplicarse por TABLA —de un encabezado
    // «Persona» hasta su total— y el titular no es una tabla: quedó fuera y sus tres cifras salieron
    // como números pelados. Una cifra de titular sin el signo no se lee como plata, que es lo único
    // que tiene que hacer.
    fmt(r(fHero + 2, fHero + 3, 1, ANCHO), 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: E.NUM.moneda, textFormat: { bold: true, fontSize: E.TAM.titulo, foregroundColor: E.COLOR.titulo }, horizontalAlignment: 'LEFT' })
    fmt(r(fHero + 3, fHero + 4), 'userEnteredFormat', { numberFormat: E.NUM.texto, textFormat: { fontSize: E.TAM.nota, foregroundColor: E.COLOR.bloqueTexto }, horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP' })
    req.push({ updateDimensionProperties: { range: { sheetId: s, dimension: 'ROWS', startIndex: fHero + 2, endIndex: fHero + 3 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } })
  }
  await google.spreadsheetBatchUpdate(ID, req)
  console.log(`  formato: ${req.length} reglas`)
}

/**
 * PUBLICA UNA PESTAÑA GENERADA ENTERA: la borra, la vuelve a crear y la escribe.
 *
 * Era el cuerpo final de `main` y hablaba de `PESTANA` y de `filas` por nombre. Desde que la
 * Nómina se partió en dos —la instrucción de pago acá, los cuadros de respaldo en «Plantel»— hay
 * dos pestañas que se publican igual, y una segunda copia de estas ochenta líneas es la forma más
 * segura de que dentro de un mes una tenga una guarda que la otra no.
 */
async function publicar(google, PESTANA, filas) {
  // ═══ EL TÍTULO SE COMPARA EXACTO, NUNCA POR PREFIJO ═══
  //
  // `hallarPestana` prueba exacto y DESPUÉS por prefijo: si no existiera una pestaña llamada
  // exactamente «Nómina» pero sí una sola que empiece así —«Nómina 2026», «Nómina (copia)»— la
  // devolvería, y acá abajo hay un `deleteSheet`. El dueño ya movió esta pestaña a mano; duplicarla
  // o renombrarla es el gesto siguiente, y con el prefijo eso terminaba en un borrado.
  const buscar = async () => (await google.getSheetMeta(ID)).find((h) => h.title === PESTANA) ?? null
  let hoja = await buscar()

  // ═══ DÓNDE VA LA PESTAÑA LO DECIDE EL DUEÑO, NO EL GENERADOR ═══
  //
  // Rehacerla la mandaba al final del archivo en cada corrida. Él la había movido a mano y se lo
  // volví a pisar tres veces; textual: *«respetá la ubicación q YO le asigno […] si yo hago algo,
  // después no se toca»*. `getSheetMeta` no devuelve el índice, así que se pide aparte y se repone
  // al crearla. Es el mismo criterio que gobierna el contenido de las celdas, aplicado al orden de
  // las solapas — que también es algo que él acomodó.
  // ═══ SI NO SÉ DÓNDE ESTABA, NO LA MANDO AL FINAL ═══
  //
  // Preservar la posición sólo sirve si se pudo leer. Cuando la lectura falla —o cuando la pestaña
  // todavía no existe— `indicePrevio` quedaba en `null` y el `addSheet` la creaba al final del
  // archivo. Peor: la corrida SIGUIENTE leía esa posición del final y la «preservaba», así que un
  // fallo momentáneo se volvía permanente. Fue exactamente lo que le pasó a la Nómina: del lugar 2,
  // pegada a «Jornales por Quincena», al 37, y ninguna corrida posterior la trajo de vuelta.
  //
  // El dueño ya lo había marcado una vez, textual: *«respetá la ubicación q YO le asigno […] si yo
  // hago algo, después no se toca»*. Así que ahora hay un lugar declarado al que volver, y el
  // `null` deja de significar «al final».
  const LUGAR = { 'Nómina': 2, Plantel: 3 }
  let indicePrevio = LUGAR[PESTANA] ?? null
  if (hoja) {
    try {
      const meta = await google.apiGetSheets(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(ID)}?fields=sheets.properties(sheetId,index,title)`)
      const leido = (meta.sheets ?? []).find((x) => x.properties?.sheetId === hoja.sheetId)?.properties?.index
      if (Number.isInteger(leido)) indicePrevio = leido
      console.log(`  posición actual de ${PESTANA}: ${leido ?? 'no la pude leer'} → repongo en ${indicePrevio}`)
    } catch { /* queda el lugar declarado */ }
  }

  // ═══ YA NO SE BORRA LA PESTAÑA. EL DUEÑO ESCRIBE ACÁ (31/08/2026) ═══
  //
  // Hasta hoy este bloque hacía `deleteSheet` + `addSheet` en cada corrida, con este argumento
  // escrito al lado: *«esta pestaña la crea y la rehace ESTE script, entera, y nadie más escribió
  // nunca una celda suya»*, y con esta condición: *«el día que el dueño anote algo acá, esta
  // decisión hay que revisarla»*.
  //
  // Ese día llegó, y con la peor evidencia posible: **«no estas respetando mis ediciones en las
  // pestañas seguis borrando lo q yo hago en sheet flujo de fondos»**. La pestaña se corrió ocho
  // veces el 31/08 y cada corrida se llevó puesto lo que él hubiera anotado, sin dejar rastro —
  // borrar la hoja no deja ni la huella que deja pisar una celda.
  //
  // ═══ LO QUE REEMPLAZA AL BORRADO ═══
  //
  // El borrado existía por una razón real: la regla NO-BORRAR impide vaciar una celda con contenido,
  // así que una corrida más corta que la anterior dejaba la cola de la vieja viva abajo. La solución
  // no es borrar la hoja: es el CENTINELA de `cola-de-rango`, que marca las celdas sobrantes como
  // propias y las vacía por `vaciarPropio` — el mismo mecanismo que usan todas las demás pestañas
  // del archivo, incluida SUBCONTRATISTAS.
  //
  // La diferencia práctica: si él escribe algo en una celda que el generador no escribe, ahora se
  // conserva y la corrida lo informa. Si escribe encima de una celda que el generador SÍ escribe,
  // gana el generador — eso no cambió y es correcto, porque esa celda es una cuenta.
  if (!hoja) {
    const creada = await google.spreadsheetBatchUpdate(ID, [{
      addSheet: {
        properties: {
          title: PESTANA,
          ...(indicePrevio == null ? {} : { index: indicePrevio }),
          gridProperties: { rowCount: filas.length + 40, columnCount: ANCHO, frozenRowCount: 3 },
        },
      },
    }])
    hoja = await buscar()
    if (creada?.protegido || !hoja) {
      console.error(`no pude crear ${PESTANA} (${creada?.motivo ?? 'no aparece en el archivo'}): NO sigo.`)
      process.exit(1)
    }
    console.log(`  ✚ creé la pestaña ${PESTANA}`)
  }

  // La cola de la corrida anterior se limpia con el centinela, no borrando la hoja. `alto` es lo que
  // este generador escribió alguna vez: se declara con margen para que una corrida corta limpie lo
  // que dejó una larga, y `conColaLimpiable` aborta si la grilla crece más que eso en vez de dejar
  // cola publicada en silencio.
  // ═══ EL CENTINELA SÓLO PUEDE ALCANZAR LO QUE ESTE GENERADOR ESCRIBE (31/08, segunda vuelta) ═══
  //
  // Saqué el `deleteSheet` y el dueño volvió a decir «te dije q no borraras mi ediciones». Tenía
  // razón de nuevo: había puesto la cola en 160 filas × 17 columnas, o sea que el centinela
  // declaraba suyas 2.720 celdas y vaciaba TODAS las que el generador no escribe. Es el mismo
  // borrado con otra puerta — y peor, porque parece cuidadoso.
  //
  // La cola existe para limpiar lo que dejó una corrida MÁS LARGA de este mismo script, y eso vive
  // en las columnas que él escribe y en las filas que ya no llena. Fuera de ese rectángulo no hay
  // cola posible: hay, si acaso, algo que escribió una persona.
  const anchoPropio = Math.max(...filas.map((f) => f.filter((c) => String(c ?? '').trim()).length), 1)
  // ═══ UNA CELDA VACÍA NO BORRA: HAY QUE PEDIR QUE SE BORRE ═══
  //
  // `fila()` rellena cada renglón hasta ANCHO con cadena vacía, y la guarda NO-BORRAR conserva el
  // destino cuando la fuente trae `''` — hace bien, es lo que impide que un generador roto vacíe una
  // pestaña. El efecto secundario acá era feo: cuando una nota desaparecía, las de abajo se corrían
  // y la vieja quedaba viva en su fila, publicada dos veces. Se vio con «1 sin recibo confirmado» y
  // con «INCOMPLETO: el mes son DOS quincenas», los dos duplicados exactos.
  //
  // El centinela SÍ borra, y decir «esta celda es mía y va vacía» es justamente lo que hay que
  // decir. Se aplica sólo a los rellenos de la cola —no a un `''` que alguna fila use como dato—
  // porque se reemplaza a partir del último contenido real de cada renglón.
  const conCentinela = filas.map((f) => {
    let fin = f.length
    while (fin > 0 && !String(f[fin - 1] ?? '').trim()) fin--
    return [...f.slice(0, fin), ...Array(Math.max(0, f.length - fin)).fill(VACIO)]
  })
  const conCola = conColaLimpiable(sinNotasRepetidas(conCentinela), { ancho: anchoPropio, alto: ALTO_HISTORICO, quien: PESTANA })
  // ═══ EL CONTRATO, DICHO EN UNA LÍNEA: ESTE GENERADOR ES DUEÑO DE SU RECTÁNGULO ═══
  //
  // `respetar: true` conserva TODO texto del destino, y en esta pestaña casi todo es texto: las
  // notas al pie de la corrida anterior sobrevivían a la siguiente y, cuando una nota desaparecía,
  // las de abajo se corrían y quedaban DUPLICADAS. Se vio: tres pares idénticos en las filas 32-33,
  // 40-41 y 51-52.
  //
  // Así que dentro de su rectángulo —las columnas que escribe, hasta ALTO_HISTORICO— manda el
  // generador. Fuera de ahí no toca nada: lo que el dueño escriba a la derecha de la última columna
  // o más abajo se conserva, que antes ni siquiera era cierto porque la pestaña se borraba entera.
  const escritura = await escribirPreservando(google, ID, `'${PESTANA}'`, conCola, { anchoHoja: anchoPropio, respetar: false })
  // ═══ UNA ESCRITURA QUE NO OCURRIÓ NO PUEDE ANUNCIARSE COMO HECHA ═══
  //
  // `escribirPreservando` puede volver SIN HABER ESCRITO —pestaña bajo candado, editada por una
  // persona, o firma no verificable— y devuelve la razón en su resultado. Este script no la miraba:
  // seguía de largo, formateaba y después releía la pestaña, que obviamente tenía contenido, y
  // publicaba «✓ releído del archivo, 53 filas». Verde sobre una corrida que no tocó nada.
  //
  // Es exactamente el defecto que el OS persigue: un control validado contra la misma información
  // que produce. Releer que hay 53 filas no prueba que las haya escrito esta corrida.
  if (escritura?.bloqueada || escritura?.editadaPorHumano || escritura?.noVerificable) {
    console.error(`✋ ${PESTANA}: NO se escribió — `
      + `${escritura.bloqueada ? 'la pestaña está bajo candado' : ''}`
      + `${escritura.editadaPorHumano ? 'la editaste vos y el generador no pisa tus ediciones' : ''}`
      + `${escritura.noVerificable ? 'no pude verificar la firma de la pestaña' : ''}.`)
    process.exit(1)
  }
  if (escritura?.conservadas?.length) {
    console.log(`  ✋ ${escritura.conservadas.length} celda(s) tuyas conservadas:`)
    for (const c of escritura.conservadas.slice(0, 8)) console.log(`     fila ${c.fila}, col ${c.col}: ${String(c.valor).slice(0, 60)}`)
  }
  if (escritura?.respetadas?.length) console.log(`  ✋ ${escritura.respetadas.length} texto(s) tuyos respetados`)
  // ═══ SI LA ESCRITURA NO PASÓ, NO SE FORMATEA ═══
  //
  // El desastre de CAJA fue exactamente esto: la guarda frenó los VALORES y el generador siguió
  // aplicando su formato encima, así que la pestaña quedó con los datos viejos vestidos de nuevos —
  // que es peor que no haber corrido, porque parece que corrió.
  const salteada = Boolean(escritura?.protegido)
  if (salteada) console.error(`la escritura quedó frenada (${escritura.motivo ?? 'sin motivo'}): NO formateo.`)
  if (!salteada) await formatear(google, hoja, filas)
  if (salteada) process.exit(1)

  // RELEER EL DESTINO: lo que prueba una escritura es el dato leído en su destino.
  const releido = await google.readSheetValues(ID, `${PESTANA}!A1:A${filas.length}`)
  console.log(`✓ ${PESTANA}: releído del archivo, ${(releido ?? []).filter((r) => String(r?.[0] ?? '').trim()).length} filas con contenido`)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hoy = new Date()
  // ═══ LA MISMA PLANILLA, LEÍDA DE LAS DOS FORMAS, Y CADA UNA PARA LO SUYO ═══
  //
  // Con FORMATTED_VALUE la fecha de ingreso llega como «26/05/2025» —que es lo que el lector del
  // plantel sabe parsear— y los importes llegan como «$ 431.200», que no son un número. Con
  // UNFORMATTED_VALUE pasa exactamente lo contrario. Pedir las dos cuesta una llamada más y evita la
  // clase entera de defectos: la primera versión leyó todo sin formato y dejó la columna Ingreso en
  // «—» para las diecinueve personas, sin un solo error a la vista.
  const [obreros, obrerosNum, oficina, oficinaNum, uocra] = await Promise.all([
    google.readSheetValues(ID, '_J_OBREROS!A1:AC990'),
    google.readSheetValues(ID, '_J_OBREROS!A1:AC990', { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, '_J_OFICINA!A1:AA990'),
    // La MISMA planilla sin formato: las columnas de canal de oficina son plata y con
    // FORMATTED_VALUE llegan como «$398.200», que no es un número.
    google.readSheetValues(ID, '_J_OFICINA!A1:AA990', { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, '_UOCRA_RAW!A1:J400', { render: 'UNFORMATTED_VALUE' }),
  ])
  const a = personasDe(obreros, 'Obra', COL_OBRA)
  const b = personasDe(oficina, 'Oficina', COL_OFICINA)
  // SÓLO EL PLANTEL DE HOY. El dueño: *"los inactivos quitar"*. La historia de los que se fueron no
  // desaparece —vive en la planilla de jornales, que es la fuente— pero no ensucia la decisión de
  // cuánto hay que pagar esta quincena.
  const quincena = quincenaEnCurso(obrerosNum ?? [], a.bloques, claveNombre, { hoy })
  // Los recibos se leen ACÁ porque el orden alfabético
  // del plantel depende del nombre canónico, que sale de ellos.
  const quincenaDelMes = (quincena.desde && Number(String(quincena.desde).split('/')[0]) > 15) ? 'Q2' : 'Q1'
  const periodoRecibo = `${quincenaDelMes}-${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`
  const recibosPorCuil = await recibosDelPeriodo(periodoRecibo)
  // OFICINA COBRA MENSUAL: su banco es la suma de las quincenas del MES, no la del período en curso.
  const recibosDelMes = await recibosDelMesEntero(hoy)
  const finales = await recibosDelPeriodo('FINAL')
  const { porCuil: adelantosPorCuil } = await adelantosPagados('QUINCENA')
  const adelantosDeFinal = await adelantosPagados('LIQUIDACION_FINAL')
  console.log(`recibos del período ${periodoRecibo}: ${recibosPorCuil.size} · liquidaciones finales: ${finales.size}`)

  // ═══ EL ORDEN ES POR EL NOMBRE CANÓNICO, NO POR EL DE LA PLANILLA ═══
  //
  // Ordenar por `p.nombre` ordena por lo que quedó adelante en cada renglón de la planilla, y ahí
  // conviven «Aguero Cristian» con «Emanuel Alaniz»: la lista sale alfabética por apellido para unos
  // y por nombre de pila para otros, que es justo lo que el dueño pidió corregir. Se ordena por el
  // nombre del recibo —APELLIDO primero, siempre— y quien no tenga recibo cae a su nombre de
  // planilla, que sigue siendo mejor que un orden inventado.
  const activos = [...a.personas, ...b.personas].filter((p) => p.activo)
  const claveDeOrden = (x) => {
    const c = CUIL_POR_PERSONA_DE_PLANILLA[x.nombre]
    return comoSeEscribe((c ? recibosPorCuil.get(c)?.nombre_recibo : null) ?? x.nombre)
  }
  activos.sort((x, y) => claveDeOrden(x).localeCompare(claveDeOrden(y), 'es'))

  // LA ESCALA DEL CONVENIO, del período de la quincena. Si no hay escalón para ese mes NO se estira
  // el anterior: la columna del piso queda vacía y la pestaña lo dice.
  const { escalones } = parsearAcuerdos(uocra ?? [])
  const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const esc = escalonDe(escalones, periodo)
  const escala = {
    rotulo: esc ? `${esc.rotulo} (${esc.periodo})` : null,
    porCategoria: Object.fromEntries(Object.entries(esc?.categorias ?? {}).map(([k, v]) => [k, v.zonaA ?? v.basico])),
  }

  console.log(`activos: ${activos.length} · quincena ${quincena.desde ?? '—'} a ${quincena.hasta ?? '—'} con ${quincena.porClave.size} persona(s) · escala ${escala.rotulo ?? 'SIN ESCALA'}`)
  if (!activos.length) { console.error('no leí ninguna persona activa: NO escribo'); process.exit(1) }
  if (!esc) console.warn('  ⚠ sin escalón de convenio para el período: el cuadro del piso sale vacío')

  // LA COLUMNA BANCO DEL CUADRO 1. Sale del recibo que emitió el estudio, no del 50% calculado.
  // El período se arma del mes de la quincena: la segunda mitad del mes es Q2.
  // LO QUE LA PLANILLA NO TRAE Y LA BASE SÍ: la fecha de ingreso y el convenio declarado.
  const fichas = await fichasDeLaBase()
  const nombresFicha = fichas.map((f) => f.nombre_completo)
  for (const p of activos) {
    const m = carpetaDe(p.nombre, nombresFicha)
    const f = m.seguro ? fichas.find((x) => x.nombre_completo === m.carpeta) : null
    p.convenio = f?.convenio_colectivo ?? null
    p.fichaDe = f?.nombre_completo ?? null
    if (!p.ingreso && f?.fecha_ingreso) {
      p.ingreso = new Date(f.fecha_ingreso)
      p.ingresoDeLaBase = true
    }
  }
  const legajos = await legajosDeDrive()
  console.log(`legajos en Drive: ${legajos.carpetas.length} carpeta(s) en «1. ACTIVOS»`)
  const filas = grilla(activos, { hoy, quincena, escala, legajos, recibosPorCuil, finales, adelantosPorCuil, adelantosDeFinal, periodoRecibo, recibosDelMes, oficinaEspejo: oficinaDelEspejo(oficinaNum ?? []) })
  console.log(`${PESTANA}: ${filas.nomina.length} filas · Plantel: ${filas.plantel.length} filas × ${ANCHO} columnas`)
  for (const x of filas.nomina.slice(5, 12)) console.log('  ', x.filter((c) => c !== '').map((c) => String(c).slice(0, 16)).join(' | '))
  if (!APLICAR) return console.log('\n(sin --aplicar: no escribí nada)')

  for (const [titulo, arr] of [[PESTANA, filas.nomina], ['Plantel', filas.plantel]]) {
    const malas = arr.map((x, i) => (x.length > ANCHO ? i + 1 : 0)).filter(Boolean)
    if (malas.length) throw new Error(`${titulo}: ${malas.length} fila(s) más anchas que ${ANCHO}: ${malas.slice(0, 5).join(', ')}. NO escribo.`)
  }

  await publicar(google, PESTANA, filas.nomina)
  if (filas.plantel.length) await publicar(google, 'Plantel', filas.plantel)

}

main().then(() => closePool()).catch(async (e) => { console.error(String(e?.message ?? e)); await closePool().catch(() => {}); process.exit(1) })
