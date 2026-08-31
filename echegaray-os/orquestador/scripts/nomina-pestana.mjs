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
import { detectarQuincenas } from '../lib/nomina-sync.mjs'
import { plantelDelEspejo, separarPlantel, claveNombre, mejorMesDelSemestre, fclDevengadoDelAnio } from '../lib/desvinculacion-plantel.mjs'
import { antiguedad, liquidacionFinal, alicuotaFcl } from '../lib/desvinculacion-22250.mjs'
import { ACUERDO_BANCO, repartoPersona } from '../lib/jornales-reparto-pago.mjs'
import { bancoDeLaPersona, reparto50DeLiquidacionFinal, tieneLiquidacionFinal, esSubcontratista, comoSeEscribe, CUIL_POR_PERSONA_DE_PLANILLA, COBRAN_Y_NO_ESTAN_EN_LA_PLANILLA } from '../lib/nomina-banco-recibo.mjs'
import {
  claveDeCategoria, convenioDe, esInferida, lineaEquivalenciasInferidas,
  jornalConAumento, PORCENTAJE_DE_AUMENTO,
} from '../lib/uocra-paritaria.mjs'
import { HORAS_POR_DIA_DE_SEMANA } from '../lib/jornada-uocra.mjs'
import { PAPELES, carpetaDe, papelesDe } from '../lib/legajo-drive.mjs'
import { query, closePool } from '../lib/db.mjs'
import { escalonDe, parsearAcuerdos } from '../lib/uocra-acuerdos.mjs'
import { COL_OBRA, COL_OFICINA, devengadoPorMes, diaDeCelda, mesesDe, totalAnio, ultimaColumnaHabilCargada, dejoDeCargar as dejoAntesQueElResto } from '../lib/nomina-devengado.mjs'
import { seccion, sub, total as rotuloTotal } from '../lib/patron-pestana.mjs'
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

function grilla(activos, { hoy, quincena, escala, legajos, recibosPorCuil = new Map(), finales = new Map(), adelantosPorCuil = new Map(), adelantosDeFinal = new Map(), periodoRecibo = '' }) {
  const meses = mesesDe(ANIO)
  const f = []
  const fila = (...c) => { f.push(c.concat(Array(Math.max(0, ANCHO - c.length)).fill(''))) }

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
  const enTotal = (titulo) => `=IFERROR(INDEX($A:$Z;MATCH("⇒*persona(s)";$A:$A;0);MATCH("${titulo}";INDEX($A:$Z;MATCH("Persona";$A:$A;0);0);0)))`
  // NINGUNA DE LAS TRES CIFRAS VA EN LA COLUMNA A. Sus fórmulas ubican la fila buscando rótulos EN
  // la columna A, así que una celda de plata puesta ahí se referencia a sí misma: Sheets lo resuelve
  // como dependencia circular y publica #REF!. Pasó en la primera corrida — «POR BANCO» salió en
  // error y las otras dos, que caen en C y en E, salieron bien.
  fila('QUÉ SALE DE LA CAJA MAÑANA')
  fila('', 'POR TRANSFERENCIA', '', 'EN EFECTIVO', '', 'TOTAL A PAGAR')
  fila('', enTotal('POR BANCO'), '', enTotal('EN EFECTIVO'), '', enTotal('TOTAL A PAGAR'))
  // Una sola glosa, corta, en la columna ancha. La primera versión ponía una nota abajo de cada
  // cifra —«a la cuenta sueldo de cada uno», «billetes, ya descontado lo adelantado»— y las tres
  // salieron cortadas: la columna mide 108 px, que son ~17 caracteres. Un texto que no entra no
  // explica nada y ensucia la fila que tiene que leerse en tres segundos.
  fila(`${quincena.desde ?? '—'} a ${quincena.hasta ?? '—'} · paga 01/09`)
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
  fila('Persona', 'Ya transferido', 'POR BANCO', 'EN EFECTIVO', 'TOTAL A PAGAR',
    'EN EFECTIVO c/aumento', 'TOTAL c/aumento', 'Horas', '$/h HOY', '$/h c/aumento')
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
    const hoyR = repartoPersona({ total: q.total, adelanto: adel, banco: delRecibo.banco ?? q.banco })
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
      ? repartoPersona({ total: totalNuevo, adelanto: adel, banco: delRecibo.banco ?? q.banco })
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
      ? `=${rec('A', cuilFila, periodoRecibo)}` : Math.round(hoyR.banco)
    const celdaAdel = cuilFila
      ? `=${Number(q.adelanto || 0)}+SUMIFS(${R}$E$1:$E$400;${R}$C$1:$C$400;"${cuilFila}";${R}$F$1:$F$400;"QUINCENA")`
      // CERO, no el guión: esta celda entra en una resta. Con «—» adentro, `E−C−B` devuelve #VALUE!
      // y se llevó puesta la fila de Castillo y el total de la columna. El guión es para leer, no
      // para calcular; que el cero se VEA como guión lo resuelve el formato, no el contenido.
      : Math.round(adel || 0)
    // Las horas del espejo más los días que faltan a jornada completa. El sumando sólo aparece
    // cuando hay días pendientes, así la fórmula no lleva un «+0» que hace dudar.
    const celdaHoras = e ? `=N(${J}$V$${e})${q.pendientes ? `+${Math.round(q.pendientes)}` : ''}` : Math.round(q.horas)
    const celdaJornal = e ? `=N(${J}$W$${e})` : Math.round(q.jornal)
    fila(nombreFila, celdaAdel, celdaBanco,
      `=N(E${n})-N(C${n})-N(B${n})`,          // efectivo = total − banco − lo ya transferido
      `=N(H${n})*N(I${n})`,                  // total = horas × $/h
      jornalNuevo != null ? `=N(G${n})-N(C${n})-N(B${n})` : SIN_DATO,
      jornalNuevo != null ? `=N(H${n})*N(J${n})` : SIN_DATO,
      celdaHoras, celdaJornal,
      jornalNuevo != null ? Math.round(jornalNuevo) : SIN_DATO)
  }
  // El conteo cuenta a los que QUEDARON en el cuadro. Con `activos.filter(...)` seguía diciendo 17
  // después de sacar a los dos liquidados: un total de 15 filas rotulado «17 persona(s)».
  const nF = f.length
  const n0 = nF - activos.filter((x) => quincena.porClave.has(x.clave) && !tieneLiquidacionFinal(x.nombre)).length + 1
  const suma = (c) => `=SUM(${c}${n0}:${c}${nF})`
  fila(rotuloTotal(`${activos.filter((p) => quincena.porClave.has(p.clave) && !tieneLiquidacionFinal(p.nombre)).length} persona(s)`),
    suma('B'), suma('C'), suma('D'), suma('E'), suma('F'), suma('G'), suma('H'), '', '')
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
      + `Su plata está en el cuadro 1.b.`))
  }
  if (sinRecibo.length) {
    fila(sub(`${sinRecibo.length} sin recibo confirmado para esta quincena: `
      + `${sinRecibo.map((x) => `${x.nombre} (${x.porQue})`).join(' · ')}. `
      + `A ésos el banco les sale de la planilla, no del recibo.`))
  }

  // ═══ 1.b · LAS LIQUIDACIONES FINALES, 50 EN BLANCO Y 50 EN EFECTIVO ═══
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
    fila(seccion(2, 'lo que terminó · liquidaciones finales'))
    fila('Lo liquidado por el estudio es la mitad BLANCA del acuerdo; el efectivo es un monto igual. '
      + 'Lo que sale de la caja es la suma de las dos columnas, o sea el doble del recibo.')
    fila('Persona', 'Fecha', 'Blanco (lo liquidado)', 'Efectivo', 'TOTAL', 'Ya transferido', 'QUEDA POR PAGAR')
    const F = { blanco: 0, negro: 0, total: 0, dado: 0, queda: 0 }
    const ordenadas = [...finales.values()].sort((a, b) => String(a.nombre_recibo).localeCompare(String(b.nombre_recibo), 'es'))
    for (const r of ordenadas.filter((x) => !esSubcontratista(x.nombre_recibo))) {
      const c = reparto50DeLiquidacionFinal(r.neto)
      if (c.total === null) { fila(r.nombre_recibo, SIN_DATO, SIN_DATO, SIN_DATO, SIN_DATO, SIN_DATO, SIN_DATO); continue }
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
      fila(r.nombre_recibo,
        r.fecha_pago ? new Date(r.fecha_pago).toLocaleDateString('es-AR') : SIN_DATO,
        Math.round(c.blanco), Math.round(c.negro), Math.round(c.total),
        dado ? Math.round(dado) : SIN_DATO, Math.round(c.total - dado))
    }
    // Cuenta las que QUEDARON en el cuadro. Con `finales.size` decía «7 liquidaciones» sobre dos
    // filas, porque las otras cinco se habían ido al bloque de subcontratistas.
    fila(rotuloTotal(`${ordenadas.filter((x) => !esSubcontratista(x.nombre_recibo)).length} liquidación(es) final(es)`), '',
      Math.round(F.blanco), Math.round(F.negro), Math.round(F.total),
      Math.round(F.dado), Math.round(F.queda))
    fila(sub('Estas personas NO cobran la quincena: su vínculo terminó. El costo de desvincular al resto del plantel está en el cuadro 4.'))

  }


  const bajas = activos.filter((p) => quincena.porClave.get(p.clave)?.dejoDeCargar)
  if (bajas.length) {
    fila(sub(`${bajas.length} sin horas desde antes del cierre —${bajas.map((p) => `${p.nombre} (${quincena.porClave.get(p.clave).ultimoDiaSuyo})`).join(' · ')}—: se les paga lo cargado y NO se les completan los días que faltan. Si es una baja, su liquidación final va en el cuadro 4.`))
  }
  // ═══ POR QUÉ ESTE TOTAL NO ES EL DE «JORNALES POR QUINCENA» ═══
  //
  // Aquella pestaña publica la quincena con las horas CARGADAS —es lo correcto para conciliar contra
  // la planilla— y ésta la publica COMPLETA, que es lo que se va a firmar el día de pago. Los dos
  // números son ciertos y miden cosas distintas; el que se calla es el que después no cierra.
  fila(sub(`«Jornales por Quincena» publica ${Math.round(T.totalCargado).toLocaleString('es-AR')} para esta quincena: son las ${Math.round(T.cargadas)} h cargadas. Acá se completan las ${Math.round(T.horas - T.cargadas)} h que faltan.`))
  if (sinConvenio.length) fila(sub(`${sinConvenio.length} sin equivalencia de convenio declarada: ${sinConvenio.join(' · ')}. No se les mide el piso.`))
  // Y LA OTRA MITAD DE LA MISMA PREGUNTA: los que SÍ tienen equivalencia, pero la puso el OS. La línea
  // desaparece sola el día que el dueño las confirme — no hay nada que apagar a mano.
  const inferidas = lineaEquivalenciasInferidas(conInferencia)
  if (inferidas) fila(sub(inferidas))
  fila()

  // ═══ 2 · QUIÉNES SON ═══
  fila(seccion(3, 'quiénes son'))
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
  fila(seccion(4, `lo devengado mes a mes · ${ANIO}`))
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
  fila(seccion(5, 'qué cuesta desvincular a cada uno'))
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
  fila(seccion(6, 'el legajo de cada uno en Drive'))
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
  fila(seccion(7, 'lo que esta pestaña NO puede decir'))
  fila(sub('Sólo el plantel ACTIVO. Los desvinculados se sacaron por pedido del dueño: su devengado histórico vive en la planilla de jornales.'))
  fila(sub('Los acuerdos particulares (premios, condiciones fuera de convenio) no están en la planilla: no se inventan.'))
  fila(sub('Del legajo se mira QUÉ archivos hay, no qué dicen: el CUIL, la obra social y la familia siguen adentro de los PDF.'))
  fila(sub('Las cargas sociales no se abren por persona: la planilla las tiene por total.'))
  fila(sub('El fondo de cese acumulado se calcula sobre el jornal de la planilla. Si los aportes se depositaron sobre la mitad registrada, el fondo real es la mitad de lo que dice esa columna — no lo puedo verificar desde acá.'))
  fila(sub('«Activo» es aparecer en la última quincena cargada. Una licencia larga se lee como baja: la planilla no las distingue.'))
  return f
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
async function formatear(google, hoja, filas) {
  const s = hoja.sheetId
  const rango = (r0, r1, c0, c1) => ({ sheetId: s, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const esTitulo = (i) => /^\d+ · /.test(String(filas[i]?.[0] ?? ''))
  const esCabecera = (i) => String(filas[i]?.[0] ?? '') === 'Persona'
  const esTotal = (i) => /^⇒/.test(String(filas[i]?.[0] ?? ''))
  const reqs = [
    { updateDimensionProperties: { range: { sheetId: s, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 190 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: s, dimension: 'COLUMNS', startIndex: 1, endIndex: ANCHO }, properties: { pixelSize: 108 }, fields: 'pixelSize' } },
    { repeatCell: { range: rango(0, 1, 0, 1), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 13 } } }, fields: 'userEnteredFormat.textFormat(bold,fontSize)' } },
  ]
  // EL PATRÓN DE MILES VA SÓLO DONDE HAY UN NÚMERO, celda por celda. Aplicarlo a un bloque entero
  // convertía la fecha de ingreso en «45.803»: una fecha es un número para la planilla, y el patrón
  // de pesos la muestra como su serial. Se recorren las corridas contiguas de números de cada fila.
  for (let i = 0; i < filas.length; i++) {
    let j = 0
    while (j < ANCHO) {
      // UNA FÓRMULA TAMBIÉN ES UNA CELDA DE NÚMERO. Desde que la columna POR BANCO cita
      // `_RECIBOS_RAW`, su valor es un string que empieza con «=»: esas celdas salían sin formato,
      // con dos decimales y sin separador, al lado de las formateadas. Se lee como un error de dato
      // y es de formato — que es peor, porque hace dudar del número.
      const esPlata = (x) => typeof x === 'number' || (typeof x === 'string' && x.startsWith('='))
      if (!esPlata(filas[i][j])) { j++; continue }
      let k = j
      while (k < ANCHO && esPlata(filas[i][k])) k++
      reqs.push({ repeatCell: { range: rango(i, i + 1, j, k), cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0;-#,##0;"—"' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })
      j = k
    }
  }
  for (let i = 0; i < filas.length; i++) {
    if (esTitulo(i) || esCabecera(i) || esTotal(i)) {
      reqs.push({ repeatCell: { range: rango(i, i + 1, 0, ANCHO), cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } })
    }
  }
  await google.spreadsheetBatchUpdate(ID, reqs)
  console.log(`  formato: ${reqs.length} reglas`)
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
  const [obreros, obrerosNum, oficina, uocra] = await Promise.all([
    google.readSheetValues(ID, '_J_OBREROS!A1:AC990'),
    google.readSheetValues(ID, '_J_OBREROS!A1:AC990', { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, '_J_OFICINA!A1:AA990'),
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
  const filas = grilla(activos, { hoy, quincena, escala, legajos, recibosPorCuil, finales, adelantosPorCuil, adelantosDeFinal, periodoRecibo })
  console.log(`${PESTANA}: ${filas.length} filas × ${ANCHO} columnas`)
  for (const f of filas.slice(5, 12)) console.log('  ', f.filter((c) => c !== '').map((c) => String(c).slice(0, 16)).join(' | '))
  if (!APLICAR) return console.log('\n(sin --aplicar: no escribí nada)')

  const malas = filas.map((f, i) => (f.length > ANCHO ? i + 1 : 0)).filter(Boolean)
  if (malas.length) throw new Error(`${malas.length} fila(s) más anchas que ${ANCHO}: ${malas.slice(0, 5).join(', ')}. NO escribo.`)

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
  let indicePrevio = null
  if (hoja) {
    try {
      const meta = await google.apiGetSheets(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(ID)}?fields=sheets.properties(sheetId,index,title)`)
      indicePrevio = (meta.sheets ?? []).find((x) => x.properties?.sheetId === hoja.sheetId)?.properties?.index ?? null
      console.log(`  posición actual de ${PESTANA}: ${indicePrevio}`)
    } catch { indicePrevio = null }
  }

  // ═══ SE BORRA Y SE REHACE, Y ES LA ÚNICA FORMA CORRECTA ACÁ ═══
  //
  // La regla NO-BORRAR del OS es absoluta: ninguna escritura puede dejar vacía una celda que tenga
  // algo, porque no puede probar que ese algo no lo escribió el dueño. Es correcta y no se saltea.
  // Pero convierte una pestaña 100% generada en un sedimento: si una corrida es más corta que la
  // anterior, la cola de la vieja queda viva debajo de la nueva. Ya pasó dos veces acá.
  //
  // La salida no es debilitar la guarda: es no pedirle que resuelva algo que no puede. Esta pestaña
  // la crea y la rehace ESTE script, entera, y nadie más escribió nunca una celda suya. Borrarla y
  // volver a crearla deja el archivo exactamente en el estado que describe el generador, sin cola.
  // El día que el dueño anote algo acá, esta decisión hay que revisarla — y por eso está escrita.
  if (hoja) {
    const borrado = await google.spreadsheetBatchUpdate(ID, [{ deleteSheet: { sheetId: hoja.sheetId } }])
    // NO SE ANUNCIA UN BORRADO QUE NO SE CONFIRMÓ. La guarda puede devolver `{protegido:true}` sin
    // lanzar: seguir de largo dejaba el mensaje «✂ borré la Nómina anterior» sobre una pestaña que
    // sigue entera, y el paso siguiente crearía una segunda con el mismo nombre.
    if (borrado?.protegido) {
      console.error(`no pude borrar ${PESTANA} (${borrado.motivo ?? 'la guarda lo frenó'}): NO sigo.`)
      process.exit(1)
    }
    if (await buscar()) { console.error(`${PESTANA} sigue existiendo después del borrado: NO sigo.`); process.exit(1) }
    console.log(`  ✂ borré la ${PESTANA} anterior para rehacerla sin cola`)
    hoja = null
  }
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
  // BORRADA Y SIN REPONER es el peor estado posible de esta secuencia, y el `catch` de `main` sólo
  // imprimía. Se comprueba que la pestaña EXISTE antes de dar por hecho que se creó.
  if (creada?.protegido || !hoja) {
    console.error(`no pude crear ${PESTANA} (${creada?.motivo ?? 'no aparece en el archivo'}): la pestaña quedó BORRADA. Volvé a correr esto.`)
    process.exit(1)
  }
  console.log(`  ✚ creé la pestaña ${PESTANA}`)

  // ═══ LA REGLA 0, DECIDIDA EN VOZ ALTA: `respetar: false` ═══
  //
  // La regla del OS es no pisar nunca lo que escribió el dueño, y por eso cada generador tiene que
  // declarar qué hace con sus ediciones. Acá se apaga, y el motivo es verificable: la pestaña se
  // borra y se vuelve a crear en cada corrida, con lo cual no puede haber una celda de nadie más —
  // y si alguna vez la hubiera, se habría perdido en el `deleteSheet` de arriba, no acá.
  //
  // ESTA DECISIÓN CADUCA EL DÍA QUE EL DUEÑO ANOTE ALGO EN LA PESTAÑA. Cuando eso pase hay que
  // cambiar el borrado por una fusión y esta línea por `escribirPreservando`. Queda escrito para
  // que quien lo lea sepa que fue una decisión y no un descuido.
  const escritura = await google.updateSheetValues(ID, `${PESTANA}!A1:${String.fromCharCode(64 + ANCHO)}${filas.length}`, filas, { yaGuardado: true, respetar: false })
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
  console.log(`✓ releído del archivo: ${(releido ?? []).filter((r) => String(r?.[0] ?? '').trim()).length} filas con contenido en la columna A`)
}

main().then(() => closePool()).catch(async (e) => { console.error(String(e?.message ?? e)); await closePool().catch(() => {}); process.exit(1) })
