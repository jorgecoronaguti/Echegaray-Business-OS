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
import { liquidacionFinal, alicuotaFcl } from '../lib/desvinculacion-22250.mjs'
import { COL_OBRA, COL_OFICINA, devengadoPorMes, mesesDe, totalAnio } from '../lib/nomina-devengado.mjs'
import { seccion, sub, total as rotuloTotal } from '../lib/patron-pestana.mjs'

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

function grilla(personas, { hoy }) {
  const meses = mesesDe(ANIO)
  const f = []
  const fila = (...c) => { f.push(c.concat(Array(Math.max(0, ANCHO - c.length)).fill(''))) }

  fila(PESTANA)
  fila('Todos los que trabajaron en 2026 — obra y oficina —, lo devengado mes a mes y lo que costaría desvincular a cada uno.')
  fila(`Sale del espejo de la planilla de jornales. Cada mes se valoriza con el $/hora de esa quincena, no con el de hoy. Al ${fecha(hoy)}.`)
  fila()

  // ── 1 · QUIÉNES SON ──────────────────────────────────────────────────────────────────────
  fila(seccion(1, 'quiénes son y qué se les paga'))
  fila('Persona', 'Sector', 'Categoría', 'Ingreso', 'Situación', 'Último día', '$/hora hoy', 'Reingreso')
  for (const p of personas) {
    fila(p.nombre, p.sector, p.categoria || SIN_DATO, p.ingreso ? fecha(p.ingreso) : SIN_DATO,
      p.activo ? 'Activo' : 'Desafectado', p.ultimoDia ? fecha(p.ultimoDia) : SIN_DATO,
      p.jornalPactado || SIN_DATO, p.reingreso ? 'sí' : '')
  }
  fila(rotuloTotal(`${personas.length} persona(s)`), '',
    `${personas.filter((p) => p.activo).length} activa(s)`, '',
    `${personas.filter((p) => !p.activo).length} desafectada(s)`)
  fila()

  // ── 2 · DEVENGADO MES A MES ──────────────────────────────────────────────────────────────
  fila(seccion(2, `lo devengado mes a mes · ${ANIO}`))
  fila('Persona', ...MES_CORTO, 'TOTAL AÑO', 'Horas')
  const totalMes = new Array(12).fill(0)
  let totalGeneral = 0
  let totalHoras = 0
  for (const p of personas) {
    const cel = meses.map((m, i) => {
      const v = p.devengado.meses.get(m)
      if (!v || !v.importe) return SIN_DATO
      totalMes[i] += v.importe
      return Math.round(v.importe)
    })
    const t = totalAnio(p.devengado)
    totalGeneral += t.importe
    totalHoras += t.horas
    fila(p.nombre, ...cel, Math.round(t.importe), Math.round(t.horas))
  }
  fila(rotuloTotal('TOTAL'), ...totalMes.map((v) => (v ? Math.round(v) : SIN_DATO)), Math.round(totalGeneral), Math.round(totalHoras))
  const sinPrecio = personas.filter((p) => p.devengado.horasSinPrecio > 0)
  if (sinPrecio.length) {
    fila(sub(`${sinPrecio.length} persona(s) con horas cargadas sin $/hora en su fila: esas horas se cuentan y NO se valorizan`))
  }
  fila()

  // ── 3 · QUÉ CUESTA DESVINCULAR ───────────────────────────────────────────────────────────
  fila(seccion(3, 'qué cuesta desvincular a cada uno'))
  fila('Estas dos columnas NUNCA se suman: el fondo de cese es plata del trabajador que se entrega con la libreta, no un desembolso nuevo.')
  fila('Persona', 'Antigüedad', 'Vacaciones', 'SAC', 'SAC s/vac.', 'FCL no depositado', rotuloTotal('SALE DE LA CAJA'), 'Fondo de cese acumulado')
  let saleTotal = 0
  let fondoTotal = 0
  for (const p of personas) {
    const cese = p.activo ? hoy : (p.ultimoDia ?? hoy)
    const l = costoDe(p, cese)
    const sale = (l.vacaciones || 0) + (l.sac || 0) + (l.sacSobreVacaciones || 0) + (l.fclPagoDirecto || 0)
    saleTotal += sale
    const fondo = l.fclDevengadoAcumulado ?? null
    if (typeof fondo === 'number') fondoTotal += fondo
    fila(p.nombre,
      // `antiguedad` es `{anios, meses, dias}` — sin esto la celda decía «[object Object]».
      l.antiguedad ? `${l.antiguedad.anios} a ${l.antiguedad.meses} m` : SIN_DATO,
      Math.round(l.vacaciones || 0), Math.round(l.sac || 0), Math.round(l.sacSobreVacaciones || 0),
      Math.round(l.fclPagoDirecto || 0), Math.round(sale),
      typeof fondo === 'number' ? Math.round(fondo) : SIN_DATO)
  }
  fila(rotuloTotal(`${personas.length} persona(s)`), '', '', '', '', '', Math.round(saleTotal), Math.round(fondoTotal))
  fila(sub('El preaviso y la indemnización por antigüedad son CERO por el último párrafo del art. 15 de la ley 22.250, no por olvido.'))
  fila()

  // ── 4 · LO QUE NO SE PUEDE MEDIR ACÁ ─────────────────────────────────────────────────────
  fila(seccion(4, 'lo que esta pestaña NO puede decir'))
  fila(sub('Los acuerdos particulares (adelantos pactados, premios, condiciones fuera de convenio) no están en la planilla: no se inventan.'))
  fila(sub('Los legajos de Drive todavía no se cruzan acá: fecha de nacimiento, CUIL, obra social y familia siguen en la carpeta de cada uno.'))
  fila(sub('Las cargas sociales de cada persona no se abren: la planilla las tiene por total, no por legajo.'))
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
    { updateDimensionProperties: { range: { sheetId: s, dimension: 'COLUMNS', startIndex: 1, endIndex: ANCHO }, properties: { pixelSize: 92 }, fields: 'pixelSize' } },
    { repeatCell: { range: rango(0, 1, 0, 1), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 13 } } }, fields: 'userEnteredFormat.textFormat(bold,fontSize)' } },
    // Los pesos: de la columna B a la última, en todas las filas de datos.
    { repeatCell: { range: rango(4, filas.length, 1, ANCHO), cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } },
  ]
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
  const [obreros, oficina] = await Promise.all([
    google.readSheetValues(ID, '_J_OBREROS!A1:AC990'),
    google.readSheetValues(ID, '_J_OFICINA!A1:AA990'),
  ])
  const a = personasDe(obreros, 'Obra', COL_OBRA)
  const b = personasDe(oficina, 'Oficina', COL_OFICINA)
  const personas = [...a.personas, ...b.personas]
    .sort((x, y) => (x.activo === y.activo ? x.nombre.localeCompare(y.nombre, 'es') : (x.activo ? -1 : 1)))
  console.log(`obra: ${a.personas.length} persona(s) en ${a.bloques.length} quincena(s) · oficina: ${b.personas.length} en ${b.bloques.length}`)
  if (!personas.length) { console.error('no leí ninguna persona de los espejos: NO escribo'); process.exit(1) }

  const filas = grilla(personas, { hoy })
  console.log(`${PESTANA}: ${filas.length} filas × ${ANCHO} columnas`)
  for (const f of filas.slice(0, 12)) console.log('  ', f.filter((c) => c !== '').map((c) => String(c).slice(0, 22)).join(' | '))
  if (!APLICAR) return console.log('\n(sin --aplicar: no escribí nada)')

  const malas = filas.map((f, i) => (f.length > ANCHO ? i + 1 : 0)).filter(Boolean)
  if (malas.length) throw new Error(`${malas.length} fila(s) más anchas que ${ANCHO}: ${malas.slice(0, 5).join(', ')}. NO escribo.`)

  // `hallarPestana` LANZA cuando no encuentra: es lo correcto para un generador que edita una
  // pestaña existente, y acá justamente el caso normal la primera vez es que no exista.
  const buscar = async () => { try { return hallarPestana(await google.getSheetMeta(ID), PESTANA) } catch { return null } }
  let hoja = await buscar()
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{
      addSheet: { properties: { title: PESTANA, gridProperties: { rowCount: filas.length + 40, columnCount: ANCHO, frozenRowCount: 3 } } },
    }])
    hoja = await buscar()
    console.log(`  ✚ creé la pestaña ${PESTANA}`)
  }
  if ((hoja.rows ?? 0) < filas.length + 10) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: filas.length + 20 } }, fields: 'gridProperties.rowCount' },
    }])
  }
  await google.updateSheetValues(ID, `${PESTANA}!A1:${String.fromCharCode(64 + ANCHO)}${filas.length}`, filas)
  await formatear(google, hoja, filas)

  // RELEER EL DESTINO: lo que prueba una escritura es el dato leído en su destino.
  const releido = await google.readSheetValues(ID, `${PESTANA}!A1:A${filas.length}`)
  console.log(`✓ releído del archivo: ${(releido ?? []).filter((r) => String(r?.[0] ?? '').trim()).length} filas con contenido en la columna A`)
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
