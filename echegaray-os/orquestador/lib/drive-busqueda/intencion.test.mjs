// QUÉ DOCUMENTO QUISO PEDIR — el ranking por intención, con archivos reales.
//
// El caso que originó todo esto: "pasame el flujo de fondos" devolvía `Flujo de Fondos.xlsx`,
// adentro de `AÑO 2025`, tocado por última vez en enero. El nombre coincidía perfecto. Y era
// inútil: el documento que la empresa usa todos los días es el Sheet `Flujo de Caja - Cash
// Flow ECSAS`.
//
// Las filas y las fuentes de abajo son las REALES de `public.drive_index` y
// `public.fuentes_datos` —nombres, rutas, mimes, carpetas y fechas—, no un índice de juguete.
// Un caso inventado prueba que el algoritmo ordena algo; estos prueban que ordena lo que la
// gente tiene que encontrar.

import test from 'node:test'
import assert from 'node:assert/strict'
import { crearIndice, buscar, analizarConsulta, registrarAceptacion } from './buscar.mjs'
import { puntuar, rankear, resolver, puntajeAntiguedad, PESOS } from './ranking.mjs'
import { esHistorico, esCopia, esAnioCerrado, crearRegistro } from './senales.mjs'
import { _reiniciarSinonimos } from './normalizar.mjs'

const A = 'administracion'
const SHEET = 'application/vnd.google-apps.spreadsheet'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const ATAJO = 'application/vnd.google-apps.shortcut'
const CARPETA = 'application/vnd.google-apps.folder'

const AHORA = new Date('2026-07-31T13:00:00Z').getTime()
const hace = (dias) => new Date(AHORA - dias * 86_400_000).toISOString()

const FILAS = [
  { drive_file_id: 'f-cash', name: 'Flujo de Caja - Cash Flow ECSAS', path: `${A}/Flujo de Caja - Cash Flow ECSAS`, tipo: 'planilla', mime_type: SHEET, is_folder: false, modified_time: hace(0), depth: 1 },
  { drive_file_id: 'f-fondos', name: 'Flujo de Fondos.xlsx', path: `${A}/AÑO 2025/Flujo de Fondos.xlsx`, tipo: 'planilla', mime_type: XLSX, is_folder: false, modified_time: hace(197), depth: 2 },
  { drive_file_id: 'f-flujos-obras', name: 'Flujos_Obras_Corregido.xlsx', path: `${A}/AÑO 2025/Flujos_Obras_Corregido.xlsx`, tipo: 'planilla', mime_type: XLSX, is_folder: false, modified_time: hace(253), depth: 2 },
  { drive_file_id: 'f-daily', name: 'Daily Meeting - Echegaray Construcciones', path: `${A}/Daily Meeting - Echegaray Construcciones`, tipo: 'planilla', mime_type: SHEET, is_folder: false, modified_time: hace(2), depth: 1 },
  { drive_file_id: 'f-gastos', name: 'CONTROL DE GASTOS.xlsx', path: `${A}/CONTROL DE GASTOS.xlsx`, tipo: 'planilla', mime_type: XLSX, is_folder: false, modified_time: hace(21), depth: 1 },
  { drive_file_id: 'f-iva-2026', name: 'IVA 2026', path: `${A}/IVA 2026`, tipo: 'carpeta', mime_type: CARPETA, is_folder: true, modified_time: hace(3), depth: 1 },
  { drive_file_id: 'f-iva-2022', name: 'IVA', path: `${A}/ECHEGARAY CONTRUCCIONES SAS - NO TOCAR/2022/IVA`, tipo: 'carpeta', mime_type: CARPETA, is_folder: true, modified_time: hace(900), depth: 3 },
  { drive_file_id: 'f-jornales-1', name: 'JORNALES', path: `${A}/JORNALES`, tipo: 'planilla', mime_type: ATAJO, is_folder: false, modified_time: hace(13), depth: 1 },
  { drive_file_id: 'f-jornales-2', name: 'JORNALES', path: `${A}/JORNALES`, tipo: 'planilla', mime_type: ATAJO, is_folder: false, modified_time: hace(24), depth: 1 },
  { drive_file_id: 'f-balance', name: 'BALANCE ECSAS - 2023.pdf', path: `${A}/BALANCES/BALANCE ECSAS - 2023.pdf`, tipo: 'pdf', mime_type: 'application/pdf', is_folder: false, modified_time: hace(400), depth: 2 },
  { drive_file_id: 'f-balance-copia', name: 'Copia de BALANCE ECSAS - 2023.pdf', path: `${A}/BALANCES/Copia de BALANCE ECSAS - 2023.pdf`, tipo: 'pdf', mime_type: 'application/pdf', is_folder: false, modified_time: hace(400), depth: 2 },
  { drive_file_id: 'f-presu-vivo', name: 'PRESUPUESTO ARCOR COCHERAS.xlsx', path: `${A}/PRESUPUESTOS/ARCOR - SAN JUAN/COCHERAS/PRESUPUESTO ARCOR COCHERAS.xlsx`, tipo: 'planilla', mime_type: XLSX, is_folder: false, modified_time: hace(30), depth: 4 },
  { drive_file_id: 'f-presu-viejo', name: 'PRESUPUESTO ARCOR COCHERAS.xlsx', path: `${A}/PRESUPUESTOS/ARCOR - SAN JUAN/COCHERAS/ARCHIVOS VIEJOS/PRESUPUESTO ARCOR COCHERAS.xlsx`, tipo: 'planilla', mime_type: XLSX, is_folder: false, modified_time: hace(120), depth: 5 },
]

/** El registro real del OS, recortado a lo que estos casos necesitan. */
const FUENTES = [
  { drive_file_id: 'f-cash', nombre: 'Flujo de Caja - Cash Flow (Sheet)', area: 'Tesorería', proceso_negocio: 'Flujo de caja proyectado y real', vigencia: 'vigente', estado: 'actualizado', criticidad: 'alta', ultima_lectura: hace(0) },
  { drive_file_id: 'f-daily', nombre: 'Daily Meeting - Echegaray Construcciones', area: 'Obras', proceso_negocio: 'Reunión diaria de obra', vigencia: 'vigente', estado: 'actualizado', criticidad: 'media', ultima_lectura: hace(23) },
  { drive_file_id: 'f-gastos', nombre: 'CONTROL DE GASTOS.xlsx', area: 'Tesorería', proceso_negocio: 'Ledger diario de caja + cronograma de cobro por certificado + compras/gastos', vigencia: 'vigente', estado: 'atrasado', criticidad: 'alta', ultima_lectura: hace(23) },
  { drive_file_id: 'f-iva-2026', nombre: 'IVA 2026 (Libro IVA Ventas mensual)', area: 'Fiscal', proceso_negocio: 'Libro IVA Ventas', vigencia: 'vigente', estado: 'actualizado', criticidad: 'alta', ultima_lectura: hace(0) },
]

function portDe({ filas = FILAS, fuentes = FUENTES, usos = [] } = {}) {
  const consultas = []
  return {
    consultas,
    query: async (sql) => {
      consultas.push(sql.replace(/\s+/g, ' ').trim())
      if (sql.includes('drive_index')) return { rows: filas }
      if (sql.includes('fuentes_datos')) return { rows: fuentes }
      if (sql.includes('drive_busqueda_uso')) return { rows: usos }
      return { rows: [] }
    },
  }
}

const buscarCon = async (texto, opts = {}) => {
  _reiniciarSinonimos()
  const indice = crearIndice({ port: opts.port ?? portDe(opts) })
  return buscar({ indice, texto, tipo: opts.tipo ?? null, ahora: AHORA, usuario: opts.usuario ?? '' })
}

// ── EL CASO ──────────────────────────────────────────────────────────────────

test('EL CASO: "pasame el flujo de fondos" trae el documento vivo, no el de AÑO 2025', async () => {
  const r = await buscarCon('pasame el flujo de fondos')
  assert.equal(r.ganador?.name, 'Flujo de Caja - Cash Flow ECSAS')
})

test('…y NO esconde que el archivo viejo existe: va como alternativa', async () => {
  const r = await buscarCon('pasame el flujo de fondos')
  const nombres = r.alternativas.map((a) => a.name)
  assert.ok(nombres.includes('Flujo de Fondos.xlsx'), `las alternativas fueron: ${nombres.join(', ')}`)
})

test('de puro texto empatan: lo que decide son las señales, no el parecido', () => {
  // Éste es el corazón del problema. Contra el nombre, `Flujo de Fondos.xlsx` y el Sheet vivo
  // valen prácticamente lo mismo: cualquiera de los dos podía salir primero, y salía el que
  // por casualidad estuviera más arriba. El texto no alcanzaba para decidir y nadie lo decía.
  const fila = (id) => FILAS.find((f) => f.drive_file_id === id)
  const c = analizarConsulta('flujo de fondos')
  const texto = (id) => puntuar(fila(id), c, { ahora: AHORA }).texto
  const diferencia = Math.abs(texto('f-fondos') - texto('f-cash')) / texto('f-cash')
  assert.ok(diferencia < 0.05, `el texto los deja empatados: ${texto('f-cash')} vs ${texto('f-fondos')}`)

  const registro = crearRegistro(FUENTES)
  const conSenales = (id) => puntuar(fila(id), c, { ahora: AHORA, fuente: registro.get(id) ?? null }).score
  assert.ok(conSenales('f-cash') > conSenales('f-fondos') * 1.5,
    'con las señales el documento vivo gana claro, no por un pelo')
})

test('y ni siquiera competía: entró por el pase de rescate, una etapa más abajo', async () => {
  const r = await buscarCon('flujo de fondos')
  // La etapa la ganó el archivo histórico —su nombre ES lo pedido—; el Sheet vivo coincidía
  // recién en la etapa siguiente y por eso antes no llegaba nunca a la comparación.
  assert.equal(r.etapa, 'normalizada')
  assert.equal(r.ganador.rescatado, true)
})

test('todas las maneras de pedir el cash flow caen en el mismo documento', async () => {
  for (const q of ['flujo de fondos', 'flujo de caja', 'cash flow', 'cashflow', 'flujo caja', 'flujo', 'el flujo']) {
    const r = await buscarCon(q)
    const primero = r.ganador ?? r.opciones[0]
    assert.equal(primero?.name, 'Flujo de Caja - Cash Flow ECSAS', q)
  }
})

// ── El motor sirve para cualquier documento, no para este caso ────────────────

test('el mismo motor ordena bien Daily, IVA, Gastos y Presupuestos', async () => {
  const casos = [
    ['daily', 'Daily Meeting - Echegaray Construcciones'],
    ['reunion diaria', 'Daily Meeting - Echegaray Construcciones'],
    ['iva', 'IVA 2026'],
    ['control de gastos', 'CONTROL DE GASTOS.xlsx'],
    ['presupuesto arcor cocheras', 'PRESUPUESTO ARCOR COCHERAS.xlsx'],
  ]
  for (const [q, esperado] of casos) {
    const r = await buscarCon(q)
    const primero = r.ganador ?? r.opciones[0]
    assert.equal(primero?.name, esperado, q)
  }
})

test('entre dos presupuestos iguales gana el que NO está en ARCHIVOS VIEJOS', async () => {
  const r = await buscarCon('presupuesto arcor cocheras')
  assert.equal((r.ganador ?? r.opciones[0]).drive_file_id, 'f-presu-vivo')
})

test('"iva" propone el año en curso y ofrece los cerrados, sin ocultarlos', async () => {
  const r = await buscarCon('iva')
  assert.equal(r.ganador?.name, 'IVA 2026')
  assert.ok(r.alternativas.some((a) => a.drive_file_id === 'f-iva-2022'))
})

// ── Las señales, una por una ─────────────────────────────────────────────────

test('carpeta de año cerrado: penaliza 2025, no penaliza el año en curso', () => {
  assert.equal(esAnioCerrado('AÑO 2025', AHORA), true)
  assert.equal(esAnioCerrado('2024', AHORA), true)
  assert.equal(esAnioCerrado('2026', AHORA), false, 'el año en curso no es archivo muerto')
  assert.equal(esAnioCerrado('Contrato por dos años', AHORA), false)
  assert.equal(esAnioCerrado('OBRA OSSE 16:9:2022', AHORA), false, 'un año adentro de un nombre no es una carpeta de archivo')
})

test('"ARCHIVOS VIEJOS" marca histórico a todo lo que cuelga de ahí', () => {
  assert.equal(esHistorico(`${A}/PRESUPUESTOS/X/ARCHIVOS VIEJOS/algo.pdf`, AHORA), true)
  assert.equal(esHistorico(`${A}/AÑO 2025/Flujo de Fondos.xlsx`, AHORA), true)
  assert.equal(esHistorico(`${A}/Flujo de Caja - Cash Flow ECSAS`, AHORA), false)
  // La carpeta "NO TOCAR" guarda documentación societaria, no basura: no se penaliza.
  assert.equal(esHistorico(`${A}/ECHEGARAY CONTRUCCIONES SAS - NO TOCAR/Estatuto.pdf`, AHORA), false)
})

test('una copia vale menos que el original', () => {
  assert.equal(esCopia('Copia de BALANCE ECSAS - 2023.pdf'), true)
  assert.equal(esCopia('Presupuesto (1)'), true)
  assert.equal(esCopia('BALANCE ECSAS - 2023.pdf'), false)
  const c = analizarConsulta('balance ecsas')
  const original = puntuar(FILAS.find((f) => f.drive_file_id === 'f-balance'), c, { ahora: AHORA })
  const copia = puntuar(FILAS.find((f) => f.drive_file_id === 'f-balance-copia'), c, { ahora: AHORA })
  assert.ok(original.score > copia.score)
})

test('la antigüedad escala, no es un escalón: medio año no dice nada, dos años sí', () => {
  assert.equal(puntajeAntiguedad(null), 0)
  assert.equal(puntajeAntiguedad(30), 0)
  assert.equal(puntajeAntiguedad(179), 0)
  assert.ok(puntajeAntiguedad(400) < 0)
  assert.ok(puntajeAntiguedad(900) < puntajeAntiguedad(400))
  assert.equal(puntajeAntiguedad(5000), PESOS.ANTIGUEDAD_MAX, 'con techo: no hunde un resultado bueno')
})

test('un documento operativo no gana por serlo: tiene que nombrarlo alguien', async () => {
  const r = await buscarCon('estatuto societario')
  assert.equal(r.ganador, null)
  assert.deepEqual(r.opciones, [], 'el Cash Flow no aparece en una búsqueda que no lo menciona')
})

test('lo que el registro marca como reemplazado deja de proponerse primero', async () => {
  const fuentes = FUENTES.map((f) => (f.drive_file_id === 'f-cash' ? { ...f, duplicada_de: 7 } : f))
  const r = await buscarCon('flujo de fondos', { fuentes })
  assert.notEqual(r.ganador?.drive_file_id, 'f-cash')
})

test('el alias del registro encuentra, pero no vale lo mismo que el nombre', async () => {
  // "reunión diaria" no está en el nombre del archivo: está en cómo el OS describe la fuente.
  const r = await buscarCon('reunion diaria')
  assert.equal(r.ganador?.drive_file_id, 'f-daily')
  // Y al revés: que el OS describa a CONTROL DE GASTOS como "ledger diario" no lo mete en una
  // búsqueda de "daily" — era el ruido que ensuciaba la lista contra el índice real.
  const d = await buscarCon('daily')
  assert.equal(d.ganador?.drive_file_id, 'f-daily')
  assert.deepEqual(d.alternativas.map((a) => a.drive_file_id), [])
})

// ── La decisión: abrir, proponer o preguntar ─────────────────────────────────

test('resolver distingue tres situaciones, no dos', () => {
  const uno = [{ score: 900 }]
  assert.equal(resolver(uno).confianza, 'alta')
  assert.equal(resolver([{ score: 900 }, { score: 300 }]).confianza, 'alta')
  assert.equal(resolver([{ score: 900 }, { score: 700 }]).confianza, 'media')
  assert.equal(resolver([{ score: 900 }, { score: 880 }]).confianza, 'baja')
  assert.equal(resolver([]).confianza, 'baja')
})

test('"coincide exacto de nombre" se lee en la señal, no en el puntaje total', () => {
  // Con las señales nuevas cualquier documento operativo pasa los 1000 puntos sin coincidir
  // exacto. Si la regla mira el total, dos archivos que se llaman IGUAL dan confianza alta y
  // el segundo desaparece de la respuesta.
  const iguales = [
    { score: 1139, senales: { nombre_exacto: 1000 } },
    { score: 964, senales: { nombre_exacto: 1000 } },
  ]
  assert.equal(resolver(iguales).confianza, 'media')
  assert.equal(resolver(iguales).alternativas.length, 1)

  const unoSolo = [{ score: 1139, senales: { nombre_exacto: 1000 } }, { score: 964, senales: {} }]
  assert.equal(resolver(unoSolo).confianza, 'alta')
})

test('con confianza baja no se elige: se pregunta', () => {
  const r = resolver([{ score: 900 }, { score: 880 }])
  assert.equal(r.ganador, null)
  assert.deepEqual(r.alternativas, [])
})

test('dos accesos directos idénticos son UNA opción: elegir entre iguales es tirar una moneda', async () => {
  const r = await buscarCon('jornales')
  const jornales = r.opciones.filter((o) => o.name === 'JORNALES')
  assert.equal(jornales.length, 1)
  assert.equal(jornales[0].duplicados, 2, 'se colapsó, pero la evidencia dice que había dos')
})

// ── El aprendizaje ───────────────────────────────────────────────────────────

test('lo que eligió ESTA persona pesa más que lo que eligió el resto', async () => {
  // Jorge eligió tres veces la versión archivada: para él, ese archivo pasa a ir primero
  // aunque el ranking lo castigue por estar en ARCHIVOS VIEJOS. Para el resto, no.
  const q = 'presupuesto arcor cocheras'
  const { norm } = analizarConsulta(q)
  const usos = [{ consulta_norm: norm, drive_file_id: 'f-presu-viejo', usuario: 'u-jorge', veces: 3 }]

  const deJorge = await buscarCon(q, { usos, usuario: 'u-jorge' })
  assert.equal((deJorge.ganador ?? deJorge.opciones[0]).drive_file_id, 'f-presu-viejo')

  const deOtro = await buscarCon(q, { usos, usuario: 'otro' })
  assert.equal((deOtro.ganador ?? deOtro.opciones[0]).drive_file_id, 'f-presu-vivo',
    'la preferencia de una persona no se le impone al resto')
})

test('el aprendizaje sigue teniendo techo: no inventa un ganador que no coincide', () => {
  const c = analizarConsulta('flujo')
  const irrelevante = puntuar({ name: 'Acta 12', path: A }, c,
    { ahora: AHORA, aceptaciones: { propias: 999, ajenas: 999 } })
  const bueno = puntuar(FILAS[0], c, { ahora: AHORA })
  assert.ok(bueno.score > irrelevante.score)
})

// ── Compatibilidad y costo ───────────────────────────────────────────────────

test('si el código sale antes que la migración, el aprendizaje NO se apaga', async () => {
  const intentos = []
  const port = {
    query: async (sql, params) => {
      intentos.push(sql.replace(/\s+/g, ' ').trim())
      if (sql.includes('usuario')) throw new Error('column "usuario" of relation "drive_busqueda_uso" does not exist')
      return { rows: [], params }
    },
  }
  assert.equal(await registrarAceptacion(port, 'flujo caja', 'f-cash', 'u-jorge'), true)
  assert.equal(intentos.length, 2, 'no reintentó con la forma anterior')
})

test('si tampoco existe la tabla, se pierde el aprendizaje pero no la búsqueda', async () => {
  const port = { query: async () => { throw new Error('relation "drive_busqueda_uso" does not exist') } }
  assert.equal(await registrarAceptacion(port, 'flujo caja', 'f-cash', 'u-jorge'), false)
})

test('sin registro de fuentes el buscador funciona: se ordena por texto, como antes', async () => {
  const r = await buscarCon('flujo de fondos', { fuentes: [] })
  assert.equal(r.ganador?.name, 'Flujo de Fondos.xlsx', 'sin registro no hay nada que diga cuál está vivo')
})

test('si el registro no se puede leer, la búsqueda no se cae', async () => {
  const port = {
    query: async (sql) => {
      if (sql.includes('drive_index')) return { rows: FILAS }
      throw new Error('relation "public.fuentes_datos" does not exist')
    },
  }
  const r = await buscarCon('flujo', { port })
  assert.ok(r.opciones.length > 0)
})

test('el registro se lee UNA vez, con el índice: no una consulta por búsqueda', async () => {
  _reiniciarSinonimos()
  const port = portDe()
  const indice = crearIndice({ port })
  for (let i = 0; i < 5; i++) await buscar({ indice, texto: 'flujo', ahora: AHORA })
  assert.equal(port.consultas.filter((s) => s.includes('fuentes_datos')).length, 1)
})

test('buscar sobre 2.500 archivos sigue costando milisegundos', async () => {
  const relleno = Array.from({ length: 2500 }, (_, i) => ({
    drive_file_id: `r${i}`, name: `Documento ${i}`, path: `${A}/PRESUPUESTOS/Obra${i % 40}/Documento ${i}`,
    tipo: 'pdf', mime_type: 'application/pdf', is_folder: false, modified_time: hace(i % 900), depth: 3,
  }))
  _reiniciarSinonimos()
  const indice = crearIndice({ port: portDe({ filas: [...FILAS, ...relleno] }) })
  await buscar({ indice, texto: 'flujo', ahora: AHORA })
  const t0 = Date.now()
  for (let i = 0; i < 20; i++) await buscar({ indice, texto: 'flujo de fondos', ahora: AHORA })
  const porBusqueda = (Date.now() - t0) / 20
  assert.ok(porBusqueda < 120, `${porBusqueda.toFixed(1)} ms por búsqueda`)
})

test('el ganador viene con el desglose de POR QUÉ ganó: si ordena mal, se ve dónde', async () => {
  const r = await buscarCon('flujo de fondos')
  const s = r.ganador.senales
  assert.ok(s.fuente_operativa > 0, 'no dice que ganó por ser el documento operativo')
  assert.ok(s.documento_vivo > 0)
  assert.equal(r.ganador.rescatado, true, 'no dice que entró por el pase de rescate')
})

test('rankear no rompe si no le pasan registro ni aceptaciones', () => {
  const r = rankear(FILAS, analizarConsulta('flujo'), { ahora: AHORA })
  assert.ok(r.length > 0)
  assert.ok(r.every((e) => typeof e.score === 'number'))
})
