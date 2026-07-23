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
// ═══ LA GRILLA ═══
//
//   A   la quincena (fecha desde) · el concepto en los bloques que no son tabla
//   B   hasta · el importe en el hero
//   C…  la serie
//   K   el TOTAL de la quincena
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

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Jornales por Quincena'
const ESPEJO = '_J_OBREROS'
const DRY = process.argv.includes('--dry')
const AÑO = 2026
/** El ancho de la pestaña: el registro de abajo es el bloque más ancho y define la grilla. */
const ANCHO = 11
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
 * La grilla entera. `bloques` son las quincenas detectadas en el espejo.
 */
function grilla({ bloques, pendientes }) {
  const filas = []
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
  push([`Nómina de obra · fuente: planilla JORNALES y escala UOCRA · al ${fecha(new Date())}`])
  blanco()

  // ── HERO: la posición, en cuatro números ──
  // Las fórmulas apuntan a filas que todavía no existen. Se resuelven al final, cuando se conocen.
  const fHero = { costo: 0, pagado: 0, falta: 0, ultima: 0, plantel: 0 }
  push(['COSTO DE LA NÓMINA DE OBRA — lo pagado en el año y lo que falta hasta diciembre'])
  fHero.costo = push([rotuloTotal('Costo de la nómina en el año')])
  fHero.pagado = push([sub('Pagado hasta hoy')])
  fHero.falta = push([sub('Falta pagar hasta diciembre')])
  fHero.ultima = push([sub('Última quincena pagada')])
  fHero.plantel = push([sub('Plantel de la última quincena')])
  blanco()

  // ── 1 · LO QUE FALTA PAGAR ──
  push([seccion(1, 'Lo que falta pagar — quincena por quincena hasta fin de año')])
  const fSigma = push([sub('Σ $/hora del plantel (última quincena)')])
  const fHpd = push([sub('Horas por persona y por día (medido)')])
  push(['Quincena', 'Hasta', 'Días hábiles', 'Personas', 'A valores de hoy', 'Ajuste inflación', 'Proyectado'])
  const p0 = filas.length + 1
  pendientes.forEach((q, i) => {
    const r = p0 + i
    push([
      // La primera arranca el día siguiente al último ya pagado; las demás encadenan.
      i === 0 ? fecha(q.desde) : `=B${r - 1}+1`,
      `=IF(DAY(A${r})<16;DATE(YEAR(A${r});MONTH(A${r});15);EOMONTH(A${r};0))`,
      `=NETWORKDAYS(A${r};B${r})`,
      `=$B$${0}`, // se completa abajo: no se puede referenciar el hero antes de conocer su fila
      `=$B$${0}*$B$${0}*C${r}`,
      `=IFERROR(INDEX('Parámetros'!$C$74:$C$90;MATCH(EOMONTH(A${r};0);EOMONTH('Parámetros'!$A$74:$A$90;0);0));1)`,
      `=E${r}*F${r}`,
    ])
  })
  // Los huecos internos también son MÍOS: con `''` el generador preservaría la fórmula que el
  // layout anterior tenía en esa misma celda, y quedaría un #VALUE! al lado del total bueno.
  const fTotalProy = push([rotuloTotal('Total a pagar hasta diciembre'), ...Array(5).fill(VACIO), `=SUM(G${p0}:G${p0 + pendientes.length - 1})`])
  blanco()

  // ── 2 · CONTROL DE CONVENIO ──
  push([seccion(2, 'Control de convenio — que ningún jornal quede por debajo de la escala UOCRA')])
  // LA RÉPLICA DEL ACUERDO TRAE SALTOS DE LÍNEA ADENTRO DEL RÓTULO ("Julio\n+2%"): sin aplanarlos, la
  // fila crece a dos renglones y el texto queda cortado por la altura fija.
  push([`=SUBSTITUTE(SUBSTITUTE(${formulaVigencia().slice(1)};CHAR(10);" ");CHAR(13);" ")`,
    ...Array(5).fill(VACIO), 'CCT 76/75, Zona A (San Juan)'])
  const ult = bloques[bloques.length - 1]
  const rangoW = ult ? `'${ESPEJO}'!W${ult.inicio}:W${ult.fin}` : null
  const fMin = push([
    rotuloTotal('El jornal por hora más bajo que pagamos'),
    rangoW ? `=IFERROR(MINIFS(${rangoW};${rangoW};">0");"")` : '',
  ])
  const fPiso = push([sub('Básico de Ayudante — el piso del convenio'), formulaValor('Ayudante', COL.basico)])
  push([sub('Margen sobre el piso — negativo = deuda laboral'), `=IF(N(B${fPiso})=0;"";B${fMin}/B${fPiso}-1)`])
  const fJornada = push([sub('Jornada del convenio (horas)'), 8])
  for (const cat of CATEGORIAS) {
    const r = filas.length + 1
    push(ES_MENSUAL(cat)
      ? [sub(`${cat} — se paga por mes`), formulaValor(cat, COL.basico)]
      : [sub(cat), formulaValor(cat, COL.basico), `=IF(N(B${r})=0;"";B${r}*$B$${fJornada})`])
  }
  blanco()

  // ── 3 · EL REGISTRO ──
  push([seccion(3, 'Lo que ya se pagó — el registro, quincena por quincena')])
  push(['Quincena', 'Hasta', 'Días hábiles', 'Personas', 'Hs previstas', 'Hs reales', 'Banco', 'Adelanto', 'Total recibo', 'TOTAL', 'Σ $/hora'])
  const f0 = filas.length + 1
  for (const fila of filasQuincenas(bloques, f0, ESPEJO)) push(fila.map((c) => c.f))
  const fLast = f0 + bloques.length - 1
  const fTotalReal = push([
    rotuloTotal('Total pagado en el año'), ...Array(5).fill(VACIO),
    // Se cierra contra la fila de ARRIBA, no contra un número de fila escrito a mano: así una fila
    // insertada nunca puede quedar afuera del total. Es el techo de 14 quincenas, arreglado de raíz.
    ...['G', 'H', 'I', 'J'].map((c) => `=SUM(${c}$${f0}:INDEX(${c}:${c};ROW()-1))`),
  ])

  // ── Las referencias que no se podían escribir antes de conocer las filas ──
  const cel = (f, c) => `$${c}$${f}`
  filas[fSigma - 1][1] = `=INDEX($K$${f0}:$K$${fLast};COUNTA($A$${f0}:$A$${fLast}))`
  filas[fHpd - 1][1] = `=IFERROR(SUM($J$${f0}:$J$${fLast})/SUM($K$${f0}:$K$${fLast})/AVERAGE($C$${f0}:$C$${fLast});0)`
  pendientes.forEach((q, i) => {
    const r = p0 + i
    filas[r - 1][3] = `=INDEX($D$${f0}:$D$${fLast};COUNTA($A$${f0}:$A$${fLast}))`
    filas[r - 1][4] = `=${cel(fSigma, 'B')}*${cel(fHpd, 'B')}*C${r}`
  })
  filas[fHero.pagado - 1][1] = `=${cel(fTotalReal, 'J')}`
  filas[fHero.falta - 1][1] = `=${cel(fTotalProy, 'G')}`
  filas[fHero.costo - 1][1] = `=B${fHero.pagado}+B${fHero.falta}`
  filas[fHero.ultima - 1][1] = `=INDEX($J$${f0}:$J$${fLast};COUNTA($A$${f0}:$A$${fLast}))`
  // EL RÓTULO QUE CONTESTA "¿SE ACTUALIZA A MEDIDA QUE LA QUINCENA VA PASANDO?": mientras la última
  // quincena no haya terminado, se rotula "en curso" — y el rótulo desaparece solo cuando cierra.
  // Nadie tiene que acordarse de sacarlo.
  filas[fHero.ultima - 1][2] = `=TEXT(INDEX($A$${f0}:$A$${fLast};COUNTA($A$${f0}:$A$${fLast}));"dd/mm")&" – "`
    + `&TEXT(INDEX($B$${f0}:$B$${fLast};COUNTA($A$${f0}:$A$${fLast}));"dd/mm")`
    + `&IF(TODAY()<=INDEX($B$${f0}:$B$${fLast};COUNTA($A$${f0}:$A$${fLast}));" · en curso";"")`
  filas[fHero.plantel - 1][1] = `=INDEX($D$${f0}:$D$${fLast};COUNTA($A$${f0}:$A$${fLast}))`

  return {
    filas,
    titular: fHero.costo,
    fechas: [...pendientes.map((_, i) => p0 + i), ...bloques.map((_, i) => f0 + i)],
    // Horas con un decimal · cantidades enteras · el único porcentaje de la pestaña.
    cantidades: [fHpd],
    enteros: [fHero.plantel, fJornada],
    ratios: [fMin + 2],
    nProy: pendientes.length,
    fMin,
    fTotalProy,
    fTotalReal,
    f0,
    p0,
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
  console.log(`${bloques.length} quincena(s) reales en el espejo · último día pagado ${ultimoDia ? fecha(ultimoDia) : '—'} · ${pendientes.length} quincena(s) por proyectar`)
  if (!pendientes.length) console.log('  (no queda nada por proyectar en el año)')

  const g = grilla({ bloques, pendientes })
  console.log(`grilla: ${g.filas.length} filas × ${ANCHO} columnas`)
  if (DRY) { for (const f of g.filas) console.log('   ', f.filter((c) => c && c !== VACIO).map((x) => String(x).slice(0, 34)).join(' | ')); return }

  const hoja = (await google.getSheetMeta(ID)).find((h) => h.title === PESTAÑA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTAÑA}"`)

  // La cola de la pestaña vieja: se marca VACIO —"es mi celda y va vacía"— así se limpia lo que
  // dejaron los generadores anteriores sin tocar lo que haya escrito una persona.
  const previo = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:${String.fromCharCode(64 + ANCHO)}400`)
  let ultima = 0
  previo.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) ultima = i + 1 })
  if (ultima > g.filas.length) {
    console.log(`cola vieja: limpio las filas ${g.filas.length + 1}–${ultima}`)
    for (let i = g.filas.length; i < ultima; i++) g.filas.push(Array(ANCHO).fill(VACIO))
  }

  // Una celda COMBINADA se traga la escritura en silencio: ni error ni valor.
  await google.spreadsheetBatchUpdate(ID, [
    { unmergeCells: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: Math.max(g.filas.length + 20, hoja.rows ?? 0), startColumnIndex: 0, endColumnIndex: Math.max(ANCHO, hoja.cols ?? ANCHO) } } },
  ]).catch(() => {})

  const { grid, respetadas, ediciones } = await conEdicionesRespetadas(ID, PESTAÑA, g.filas, previo)
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${r.suyo.slice(0, 44)}") en vez de escribir "${r.mio.slice(0, 44)}"`)
  const { conservadas } = await escribirPreservando(google, ID, `'${PESTAÑA}'`, grid, { anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
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

  await guardarRegistro(ID, PESTAÑA, grid, ediciones, v).catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))
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
async function publicarRangos(google, sheetId, g) {
  const finProy = g.p0 + g.nProy - 1
  const rango = (c0, r0, r1) => ({ sheetId, startRowIndex: r0 - 1, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c0 + 1 })
  const quiero = {
    JORNALES_REAL_DESDE: rango(0, g.f0, g.fTotalReal - 1),
    JORNALES_REAL_HASTA: rango(1, g.f0, g.fTotalReal - 1),
    JORNALES_REAL_TOTAL: rango(9, g.f0, g.fTotalReal - 1),
    JORNALES_PROY_DESDE: rango(0, g.p0, finProy),
    JORNALES_PROY_HASTA: rango(1, g.p0, finProy),
    JORNALES_PROY_TOTAL: rango(6, g.p0, finProy),
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
  const fmt = (r0, r1, c0, c1, numberFormat) => reqs.push({
    repeatCell: { range: rg(r0, r1, c0, c1), cell: { userEnteredFormat: { numberFormat } }, fields: 'userEnteredFormat.numberFormat' },
  })
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
  for (const f of g.fechas) {
    reqs.push({
      repeatCell: {
        range: rg(f - 1, f, 0, 2),
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'LEFT' } },
        fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
      },
    })
  }
  const ENTERO = { type: 'NUMBER', pattern: '#,##0;-#,##0;"—"' }
  const HORAS = { type: 'NUMBER', pattern: '#,##0.0;-#,##0.0;"—"' }
  // Proyección: días hábiles y personas enteros; el ajuste por inflación es un coeficiente, no plata.
  fmt(g.p0 - 1, finProy, 2, 4, ENTERO)
  fmt(g.p0 - 1, finProy, 5, 6, { type: 'NUMBER', pattern: '0.00;-0.00;"—"' })
  // Registro: días y personas enteros, las horas con un decimal.
  fmt(g.f0 - 1, g.fTotalReal, 2, 4, ENTERO)
  fmt(g.f0 - 1, g.fTotalReal, 4, 6, HORAS)
  for (const f of g.cantidades) fmt(f - 1, f, 1, 2, HORAS)
  for (const f of g.enteros) fmt(f - 1, f, 1, 2, ENTERO)
  for (const f of g.ratios) fmt(f - 1, f, 1, 2, { type: 'PERCENT', pattern: '0.0%;[Red]-0.0%;"—"' })
  await google.spreadsheetBatchUpdate(ID, reqs)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
