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
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { detectarQuincenas } from '../lib/nomina-sync.mjs'
import { plantelDelEspejo, separarPlantel, claveNombre, mejorMesDelSemestre, fclDevengadoDelAnio } from '../lib/desvinculacion-plantel.mjs'
import { antiguedad, liquidacionFinal, alicuotaFcl } from '../lib/desvinculacion-22250.mjs'
import { repartoPersona } from '../lib/jornales-reparto-pago.mjs'
import { convenioDe } from '../lib/uocra-paritaria.mjs'
import { HORAS_POR_DIA_DE_SEMANA } from '../lib/jornada-uocra.mjs'
import { escalonDe, parsearAcuerdos } from '../lib/uocra-acuerdos.mjs'
import { COL_OBRA, COL_OFICINA, devengadoPorMes, diaDeCelda, mesesDe, totalAnio } from '../lib/nomina-devengado.mjs'
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
const ANCHO = 16
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
  const corte = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  for (let c = 5; c <= 20; c++) {
    const d = diaDeCelda(fechas[c])
    if (!d) continue
    dias.push(`${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}`)
    let cargado = false
    for (let r = b.inicio; r <= b.fin && !cargado; r++) if (Number((grid[r - 1] ?? [])[c]) > 0) cargado = true
    const fechaDia = new Date(anio, d.mes - 1, d.dia)
    // EL SÁBADO NO SE COMPLETA. Las 4 h del sábado son un SUPUESTO declarado en `jornada-uocra.mjs`,
    // no la jornada normal: rellenarlo sumaba 4 h por persona que nadie va a trabajar. El dueño
    // contó los días que faltaban a mano —27, 28 y 31 = 26 h— y ahí está la diferencia.
    const esFinDeSemana = fechaDia.getDay() === 0 || fechaDia.getDay() === 6
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
    const horas = cargadas + horasPendientes
    out.set(clave(nombre), {
      nombre,
      categoria: String(f[3] ?? '').trim(),
      cargadas,
      pendientes: horasPendientes,
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

function grilla(activos, { hoy, quincena, escala }) {
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
  fila(seccion(1, `qué hay que pagarle a cada uno · quincena ${quincena.desde ?? '—'} a ${quincena.hasta ?? '—'}`))
  fila(`Acuerdo 50/50: al banco la mitad del bruto, en efectivo el resto menos el adelanto ya entregado. Piso de convenio: ${escala.rotulo ?? 'sin escala'}.`)
  fila(quincena.diasPendientes.length
    ? `Horas = lo cargado + los días que faltan a jornada completa (9 h L-J, 8 h viernes): ${quincena.diasPendientes.map((d) => `${d.etiqueta} ${d.horas} h`).join(' · ')} = ${quincena.horasPendientes} h.`
    : 'La quincena está cargada entera: no se completó ninguna jornada.')
  fila('Persona', 'Cat.', 'Convenio', 'Hs cargadas', 'Hs a completar', 'Horas', 'Adelanto',
    '$/h HOY', 'Banco HOY', 'Efectivo HOY', 'TOTAL HOY',
    '$/h PISO', 'Banco PISO', 'Efectivo PISO', 'TOTAL PISO', 'Diferencia')
  const T = { cargadas: 0, horas: 0, adelanto: 0, bancoHoy: 0, efHoy: 0, totHoy: 0, bancoPiso: 0, efPiso: 0, totPiso: 0, sube: 0, totalCargado: 0 }
  const sinConvenio = []
  for (const p of activos) {
    const q = quincena.porClave.get(p.clave)
    if (!q) continue
    const conv = convenioDe(q.categoria || p.categoria)
    const basico = conv ? escala.porCategoria[conv] ?? null : null
    if (!conv) sinConvenio.push(p.nombre)

    const hoyR = repartoPersona({ total: q.total, adelanto: q.adelanto, banco: q.banco })
    // EL PISO NO BAJA A NADIE. Si el jornal pactado ya es mayor que el del convenio, el escenario
    // «piso» es el mismo que el de hoy: el convenio es un mínimo, no una tarifa.
    const jornalPiso = basico != null ? Math.max(q.jornal, basico) : null
    const totalPiso = jornalPiso != null ? q.horas * jornalPiso : null
    const pisoR = totalPiso != null ? repartoPersona({ total: totalPiso, adelanto: q.adelanto, banco: 0 }) : null

    T.cargadas += q.cargadas; T.horas += q.horas; T.adelanto += q.adelanto; T.totalCargado += q.totalCargado
    T.bancoHoy += hoyR.banco; T.efHoy += hoyR.efectivo; T.totHoy += hoyR.total
    if (pisoR) { T.bancoPiso += pisoR.banco; T.efPiso += pisoR.efectivo; T.totPiso += pisoR.total; T.sube += pisoR.total - hoyR.total }

    fila(p.nombre, q.categoria || SIN_DATO, conv ?? SIN_DATO,
      Math.round(q.cargadas), q.pendientes ? Math.round(q.pendientes) : SIN_DATO, Math.round(q.horas),
      q.adelanto ? Math.round(q.adelanto) : SIN_DATO,
      Math.round(q.jornal), Math.round(hoyR.banco), Math.round(hoyR.efectivo), Math.round(hoyR.total),
      jornalPiso != null ? Math.round(jornalPiso) : SIN_DATO,
      pisoR ? Math.round(pisoR.banco) : SIN_DATO,
      pisoR ? Math.round(pisoR.efectivo) : SIN_DATO,
      pisoR ? Math.round(pisoR.total) : SIN_DATO,
      pisoR ? (Math.round(pisoR.total - hoyR.total) || SIN_DATO) : SIN_DATO)
  }
  fila(rotuloTotal(`${activos.filter((p) => quincena.porClave.has(p.clave)).length} persona(s)`), '', '',
    Math.round(T.cargadas), Math.round(T.horas - T.cargadas), Math.round(T.horas), Math.round(T.adelanto),
    '', Math.round(T.bancoHoy), Math.round(T.efHoy), Math.round(T.totHoy),
    '', Math.round(T.bancoPiso), Math.round(T.efPiso), Math.round(T.totPiso), Math.round(T.sube))
  fila(sub(`Llevar a todos al piso de convenio cuesta ${Math.round(T.sube).toLocaleString('es-AR')} más en esta quincena.`))
  // ═══ POR QUÉ ESTE TOTAL NO ES EL DE «JORNALES POR QUINCENA» ═══
  //
  // Aquella pestaña publica la quincena con las horas CARGADAS —es lo correcto para conciliar contra
  // la planilla— y ésta la publica COMPLETA, que es lo que se va a firmar el día de pago. Los dos
  // números son ciertos y miden cosas distintas; el que se calla es el que después no cierra.
  fila(sub(`«Jornales por Quincena» publica ${Math.round(T.totalCargado).toLocaleString('es-AR')} para esta quincena: son las ${Math.round(T.cargadas)} h cargadas. Acá se completan las ${Math.round(T.horas - T.cargadas)} h que faltan.`))
  if (sinConvenio.length) fila(sub(`${sinConvenio.length} sin equivalencia de convenio declarada: ${sinConvenio.join(' · ')}. No se les mide el piso.`))
  fila()

  // ═══ 2 · QUIÉNES SON ═══
  fila(seccion(2, 'quiénes son'))
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
  fila(seccion(3, `lo devengado mes a mes · ${ANIO}`))
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
  fila(seccion(4, 'qué cuesta desvincular a cada uno'))
  fila('Estas dos columnas NUNCA se suman: el fondo de cese es plata del trabajador que se entrega con la libreta, no un desembolso nuevo.')
  fila('Persona', 'Antigüedad', 'Vacaciones', 'SAC', 'SAC s/vac.', 'FCL no depositado', rotuloTotal('SALE DE LA CAJA'), 'Fondo de cese acumulado')
  let saleTotal = 0
  let fondoTotal = 0
  for (const p of activos) {
    const l = costoDe(p, hoy)
    const sale = (l.vacaciones || 0) + (l.sac || 0) + (l.sacSobreVacaciones || 0) + (l.fclPagoDirecto || 0)
    saleTotal += sale
    const fondo = l.fclDevengadoAcumulado ?? null
    if (typeof fondo === 'number') fondoTotal += fondo
    fila(p.nombre, l.antiguedad ? `${l.antiguedad.anios} a ${l.antiguedad.meses} m` : SIN_DATO,
      Math.round(l.vacaciones || 0), Math.round(l.sac || 0), Math.round(l.sacSobreVacaciones || 0),
      Math.round(l.fclPagoDirecto || 0), Math.round(sale),
      typeof fondo === 'number' ? Math.round(fondo) : SIN_DATO)
  }
  fila(rotuloTotal(`${activos.length} persona(s)`), '', '', '', '', '', Math.round(saleTotal), Math.round(fondoTotal))
  fila(sub('El preaviso y la indemnización por antigüedad son CERO por el último párrafo del art. 15 de la ley 22.250, no por olvido.'))
  fila()

  // ═══ 5 · LO QUE NO SE PUEDE DECIR ═══
  fila(seccion(5, 'lo que esta pestaña NO puede decir'))
  fila(sub('Sólo el plantel ACTIVO. Los desvinculados se sacaron por pedido del dueño: su devengado histórico vive en la planilla de jornales.'))
  fila(sub('Los acuerdos particulares (premios, condiciones fuera de convenio) no están en la planilla: no se inventan.'))
  fila(sub('Los legajos de Drive todavía no se cruzan acá: CUIL, obra social y familia siguen en la carpeta de cada uno.'))
  fila(sub('Las cargas sociales no se abren por persona: la planilla las tiene por total.'))
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
      if (typeof filas[i][j] !== 'number') { j++; continue }
      let k = j
      while (k < ANCHO && typeof filas[i][k] === 'number') k++
      reqs.push({ repeatCell: { range: rango(i, i + 1, j, k), cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })
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
  const activos = [...a.personas, ...b.personas].filter((p) => p.activo)
    .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
  const quincena = quincenaEnCurso(obrerosNum ?? [], a.bloques, claveNombre, { hoy })

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

  const filas = grilla(activos, { hoy, quincena, escala })
  console.log(`${PESTANA}: ${filas.length} filas × ${ANCHO} columnas`)
  for (const f of filas.slice(5, 12)) console.log('  ', f.filter((c) => c !== '').map((c) => String(c).slice(0, 16)).join(' | '))
  if (!APLICAR) return console.log('\n(sin --aplicar: no escribí nada)')

  const malas = filas.map((f, i) => (f.length > ANCHO ? i + 1 : 0)).filter(Boolean)
  if (malas.length) throw new Error(`${malas.length} fila(s) más anchas que ${ANCHO}: ${malas.slice(0, 5).join(', ')}. NO escribo.`)

  const buscar = async () => { try { return hallarPestana(await google.getSheetMeta(ID), PESTANA) } catch { return null } }
  let hoja = await buscar()

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
    await google.spreadsheetBatchUpdate(ID, [{ deleteSheet: { sheetId: hoja.sheetId } }])
    console.log(`  ✂ borré la ${PESTANA} anterior para rehacerla sin cola`)
    hoja = null
  }
  await google.spreadsheetBatchUpdate(ID, [{
    addSheet: { properties: { title: PESTANA, gridProperties: { rowCount: filas.length + 40, columnCount: ANCHO, frozenRowCount: 3 } } },
  }])
  hoja = await buscar()
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

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
