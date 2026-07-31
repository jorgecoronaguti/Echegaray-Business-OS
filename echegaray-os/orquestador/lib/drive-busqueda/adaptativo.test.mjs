// EL BUSCADOR QUE APRENDE, Y QUE PUEDE DECIR QUÉ APRENDIÓ.
//
// Tres promesas que sin tests son sólo intenciones:
//   1. NO aprende de lo que nadie confirmó.
//   2. Un alias no se crea si la evidencia está repartida entre dos documentos.
//   3. Cualquier resultado se puede explicar con los mismos números con que se decidió.
//
// La segunda es la que más importa. Un alias ambiguo no hace que el buscador dude: hace que
// se equivoque con seguridad, que es bastante peor.

import test from 'node:test'
import assert from 'node:assert/strict'
import { crearIndice, buscar, analizarConsulta, registrarAceptacion, registrarRechazo } from './buscar.mjs'
import { puntuar, resolver, PESOS } from './ranking.mjs'
import { crearEstados, estaApagado, ESTADO } from './senales.mjs'
import { interpretarFeedback, FEEDBACK } from './feedback.mjs'
import { registrarBusqueda, promoverAlias, definirAlias, marcarConfirmado, PROMOCION } from './registro.mjs'
import { explicarEvento, explicarCandidato, explicarComparacion, senalesOrdenadas } from './explicar.mjs'
import { resumen, sinResultado } from './metricas.mjs'
import { _reiniciarSinonimos } from './normalizar.mjs'

const A = 'administracion'
const SHEET = 'application/vnd.google-apps.spreadsheet'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const AHORA = new Date('2026-08-01T13:00:00Z').getTime()
const hace = (dias) => new Date(AHORA - dias * 86_400_000).toISOString()

const FILAS = [
  { drive_file_id: 'f-cash', name: 'Flujo de Caja - Cash Flow ECSAS', path: `${A}/Flujo de Caja - Cash Flow ECSAS`, tipo: 'planilla', mime_type: SHEET, is_folder: false, modified_time: hace(0), depth: 1 },
  { drive_file_id: 'f-fondos', name: 'Flujo de Fondos.xlsx', path: `${A}/AÑO 2025/Flujo de Fondos.xlsx`, tipo: 'planilla', mime_type: XLSX, is_folder: false, modified_time: hace(198), depth: 2 },
  { drive_file_id: 'f-cuadro', name: 'Reporte Economico ECSAS.xlsm', path: `${A}/Reporte Economico ECSAS.xlsm`, tipo: 'planilla', mime_type: XLSX, is_folder: false, modified_time: hace(9), depth: 1 },
  { drive_file_id: 'f-obra-a', name: 'Avance Obra Estrella.xlsx', path: `${A}/OBRAS/Avance Obra Estrella.xlsx`, tipo: 'planilla', mime_type: XLSX, is_folder: false, modified_time: hace(4), depth: 2 },
  { drive_file_id: 'f-obra-b', name: 'Avance Obra Estrella.xlsx', path: `${A}/OBRAS/2024/Avance Obra Estrella.xlsx`, tipo: 'planilla', mime_type: XLSX, is_folder: false, modified_time: hace(500), depth: 3 },
]

/** Port de mentira con memoria: guarda lo escrito para poder afirmarlo, no para simularlo. */
function portDe({ filas = FILAS, usos = [], estados = [], alias = [], confirmaciones = [], eventos = [] } = {}) {
  const escrituras = []
  return {
    escrituras,
    query: async (sql, params = []) => {
      const s = sql.replace(/\s+/g, ' ').trim()
      escrituras.push({ sql: s, params })
      if (s.startsWith('insert into public.drive_busqueda_evento')) return { rows: [{ id: 77 }] }
      if (s.includes('group by confirmado')) return { rows: confirmaciones }
      if (s.includes('from public.drive_busqueda_evento') && s.includes('etapa is null')) return { rows: eventos }
      if (s.includes('drive_index')) return { rows: filas }
      if (s.includes('fuentes_datos')) return { rows: [] }
      if (s.includes('drive_documento_estado')) return { rows: estados }
      if (s.includes('drive_alias_documento')) return { rows: alias }
      if (s.includes('drive_busqueda_uso')) return { rows: usos }
      return { rows: [] }
    },
  }
}

const escrituraQue = (port, fragmento) => port.escrituras.filter((e) => e.sql.includes(fragmento))

// ── FASE 1: no se aprende lo que nadie confirmó ──────────────────────────────

test('toda búsqueda deja rastro, con los candidatos y su desglose', async () => {
  const port = portDe()
  const r = await buscar({ indice: crearIndice({ port }), texto: 'avance obra estrella', ahora: AHORA })
  const id = await registrarBusqueda(port, { usuario: 'u-jorge', canal: 'mattermost', resultado: r })
  assert.equal(id, 77)

  const [ins] = escrituraQue(port, 'insert into public.drive_busqueda_evento')
  const candidatos = JSON.parse(ins.params[9])
  assert.ok(candidatos.length >= 2)
  assert.ok(candidatos[0].senales && Object.keys(candidatos[0].senales).length > 0,
    'sin las señales guardadas no se puede explicar nada después')
  assert.equal(ins.params[0], 'u-jorge')
  assert.equal(ins.params[1], 'mattermost')
})

test('el rastro guarda lo PROPUESTO, no lo confirmado: son dos columnas distintas', async () => {
  const port = portDe()
  const r = await buscar({ indice: crearIndice({ port }), texto: 'flujo', ahora: AHORA })
  await registrarBusqueda(port, { usuario: 'u-jorge', resultado: r })
  const [ins] = escrituraQue(port, 'insert into public.drive_busqueda_evento')
  assert.equal(ins.params[8], 'f-cash', 'elegido = lo que el buscador propuso')
  assert.ok(!ins.sql.includes('confirmado_at'), 'una propuesta no puede nacer confirmada')
})

test('registrar una búsqueda no puede romper la búsqueda', async () => {
  const port = { query: async () => { throw new Error('base caída') } }
  assert.equal(await registrarBusqueda(port, { resultado: { consulta: { norm: 'x' } } }), null)
})

// ── FASE 2: feedback ─────────────────────────────────────────────────────────

test('el vocabulario de feedback distingue confirmar, rechazar y preguntar por qué', () => {
  for (const t of ['si', 'dale', 'correcto', 'ese es', 'perfecto', 'exacto']) {
    assert.equal(interpretarFeedback(t), FEEDBACK.CONFIRMA, t)
  }
  for (const t of ['no', 'no era ese', 'ese no', 'ninguno', 'nada que ver']) {
    assert.equal(interpretarFeedback(t), FEEDBACK.RECHAZA, t)
  }
  for (const t of ['por que', '¿por qué ese?', 'explicame', 'como lo elegiste']) {
    assert.equal(interpretarFeedback(t), FEEDBACK.EXPLICA, t)
  }
})

test('lo que NO es feedback devuelve null, para que el router siga su camino', () => {
  for (const t of ['pasame el flujo de caja', 'jornales', '', 'quiero el contrato de Quattropani']) {
    assert.equal(interpretarFeedback(t), null, t)
  }
})

test('"no era ese" resta lo mismo que suma un acierto: corrige, no borra', async () => {
  const port = portDe()
  await registrarAceptacion(port, 'flujo caja', 'f-cash', 'u-jorge')
  await registrarRechazo(port, 'flujo caja', 'f-cash', 'u-jorge')
  const [suma, resta] = escrituraQue(port, 'insert into public.drive_busqueda_uso')
  assert.equal(suma.params[3], 1)
  assert.equal(resta.params[3], -1)
})

test('un rechazo baja el puntaje, pero no hunde algo que sí coincide', () => {
  const c = analizarConsulta('flujo')
  const limpio = puntuar(FILAS[0], c, { ahora: AHORA })
  const rechazado = puntuar(FILAS[0], c, { ahora: AHORA, aceptaciones: { propias: -1, ajenas: 0 } })
  assert.ok(rechazado.score < limpio.score)
  assert.ok(rechazado.score > 0, 'un "no era ese" no puede desaparecer un archivo que se llama así')
})

test('ni cien rechazos rompen el ranking: el castigo tiene el mismo techo que el premio', () => {
  const c = analizarConsulta('flujo')
  const odiado = puntuar(FILAS[0], c, { ahora: AHORA, aceptaciones: { propias: -100, ajenas: -100 } })
  assert.equal(odiado.senales.aprendizaje, -PESOS.APRENDIZAJE_TOPE)
})

test('el rechazo se ve en la misma sesión, no en la próxima recarga del índice', async () => {
  const indice = crearIndice({ port: portDe() })
  await indice.filasVigentes()
  indice.anotarRechazo('flujo caja', 'f-cash', 'u-jorge')
  assert.equal(indice.aceptaciones('flujo caja', 'u-jorge').get('f-cash').propias, -1)
})

// ── FASE 3: explicabilidad ───────────────────────────────────────────────────

test('las señales se leen ordenadas por lo que pesaron, no por orden alfabético', () => {
  const orden = senalesOrdenadas({ frescura: 60, nombre_exacto: 1000, historico: -200 })
  assert.deepEqual(orden.map((s) => s.clave), ['nombre_exacto', 'historico', 'frescura'])
})

test('la explicación traduce las señales a castellano, sin recalcular nada', () => {
  const texto = explicarCandidato({ name: 'Flujo de Caja', score: 1146, senales: { fuente_operativa: 300, historico: -200 } })
  assert.match(texto, /Flujo de Caja — 1146 puntos/)
  assert.match(texto, /\+300/)
  assert.match(texto, /fuente de negocio/)
  assert.match(texto, /-200/)
})

test('la comparación contesta la pregunta real: por qué ÉSE y no el otro', () => {
  const texto = explicarComparacion(
    { name: 'A', score: 1146, senales: { fuente_operativa: 300, historico: 0 } },
    { name: 'B', score: 455, senales: { fuente_operativa: 0, historico: -200 } },
  )
  assert.match(texto, /Le ganó a "B" por 691 puntos/)
  assert.match(texto, /fuente de negocio/)
  // Los DOS valores, no la diferencia: "+200 está en una carpeta de archivo" se lee como si
  // el ganador estuviera en la carpeta vieja, que es exactamente al revés de lo que pasó.
  assert.match(texto, /\s0 vs -200\s+está en una carpeta de archivo/)
})

test('un evento guardado se explica entero, incluso meses después', () => {
  const texto = explicarEvento({
    consulta: 'flujo de fondos', confianza: 'alta', etapa: 'normalizada', confirmado: 'f-cash',
    candidatos: [
      { id: 'f-cash', name: 'Flujo de Caja', score: 1146, senales: { fuente_operativa: 300 }, rescatado: true },
      { id: 'f-fondos', name: 'Flujo de Fondos.xlsx', score: 455, senales: { historico: -200 } },
    ],
  })
  assert.match(texto, /Ganó: Flujo de Caja/)
  assert.match(texto, /pase de rescate/)
  assert.match(texto, /Le ganó a "Flujo de Fondos.xlsx"/)
  assert.match(texto, /La persona confirmó: f-cash/)
})

test('explicar algo que no existe no inventa una explicación', () => {
  assert.match(explicarEvento(null), /No encontré esa búsqueda/)
})

// ── FASE 4: métricas ─────────────────────────────────────────────────────────

test('el resumen calcula las tasas, y no rompe con la base vacía', async () => {
  const port = {
    query: async () => ({
      rows: [{
        busquedas: '100', directas: '70', propuestas: '20', aclaraciones: '10', sin_resultado: '5',
        confirmadas: '30', rechazadas: '4', corregidas: '9', usuarios: '3', ms_promedio: '48',
        ms_p95: '120', score_promedio_ganador: '980',
      }],
    }),
  }
  const r = await resumen(port)
  assert.equal(r.tasaDirecta, 0.7)
  assert.equal(r.tasaCorreccion, 0.1, '9 correcciones sobre 90 respuestas dadas')
  assert.equal(r.tasaSinResultado, 0.05)
})

test('sin datos, el panel dice que no hay datos en vez de inventar un cero', async () => {
  assert.equal(await resumen({ query: async () => ({ rows: [] }) }), null)
  assert.deepEqual(await sinResultado({ query: async () => { throw new Error('no existe') } }), [])
})

// ── FASE 5: el motor de alias ────────────────────────────────────────────────

test('un alias se aprende recién con evidencia suficiente', async () => {
  const pocas = portDe({ confirmaciones: [{ id: 'f-cash', veces: 2, usuarios: 1 }] })
  const r1 = await promoverAlias(pocas, 'flujo fondo')
  assert.equal(r1.promovido, false)
  assert.equal(r1.motivo, 'evidencia_insuficiente')
  assert.equal(escrituraQue(pocas, 'insert into public.drive_alias_documento').length, 0)

  const suficientes = portDe({ confirmaciones: [{ id: 'f-cash', veces: PROMOCION.MIN_CONFIRMACIONES, usuarios: 2 }] })
  const r2 = await promoverAlias(suficientes, 'flujo fondo')
  assert.equal(r2.promovido, true)
  assert.equal(r2.documento, 'f-cash')
  assert.equal(r2.confianza, 1)
})

test('UN ALIAS AMBIGUO NO SE CREA: equivocarse con seguridad es peor que dudar', async () => {
  const port = portDe({
    confirmaciones: [{ id: 'f-cash', veces: 5, usuarios: 2 }, { id: 'f-cuadro', veces: 4, usuarios: 2 }],
  })
  const r = await promoverAlias(port, 'el cuadro')
  assert.equal(r.promovido, false)
  assert.equal(r.motivo, 'ambiguo')
  assert.ok(r.confianza < PROMOCION.DOMINANCIA)
  // Y si ya era alias, se borra: dejarlo sería seguir contestando con una certeza vencida.
  assert.equal(escrituraQue(port, 'delete from public.drive_alias_documento').length, 1)
})

test('un alias cargado a mano no lo pisa la estadística', async () => {
  const port = portDe({ confirmaciones: [{ id: 'f-cash', veces: 9, usuarios: 3 }] })
  await promoverAlias(port, 'el cuadro')
  const [ins] = escrituraQue(port, 'insert into public.drive_alias_documento')
  assert.match(ins.sql, /where public\.drive_alias_documento\.origen = 'aprendido'/)
})

test('definir un alias a mano normaliza la frase: "El Cuadro" y "el cuadro" son el mismo', async () => {
  const port = portDe()
  await definirAlias(port, { alias: 'El Cuadro Económico', driveFileId: 'f-cuadro' })
  const [ins] = escrituraQue(port, 'insert into public.drive_alias_documento')
  assert.equal(ins.params[0], 'cuadro economico')
  assert.match(ins.sql, /'manual'/)
})

test('el alias aprendido rescata a SU documento aunque no se parezca de nombre', async () => {
  _reiniciarSinonimos()
  const alias = [{ alias_norm: 'cuadro', drive_file_id: 'f-cuadro', confianza: 1, origen: 'manual' }]
  const sinAlias = await buscar({ indice: crearIndice({ port: portDe() }), texto: 'cuadro', ahora: AHORA })
  assert.equal(sinAlias.ganador, null, 'sin alias, "cuadro" no encuentra ese archivo')

  const conAlias = await buscar({ indice: crearIndice({ port: portDe({ alias }) }), texto: 'cuadro', ahora: AHORA })
  assert.equal(conAlias.ganador?.drive_file_id, 'f-cuadro')
  assert.ok(conAlias.ganador.senales.alias_documento > 0)
})

test('un alias flojo pesa poco: la confianza multiplica, no es un interruptor', () => {
  const c = analizarConsulta('flujo')
  const fuerte = puntuar(FILAS[0], c, { ahora: AHORA, alias: { confianza: 1 } })
  const debil = puntuar(FILAS[0], c, { ahora: AHORA, alias: { confianza: 0.4 } })
  assert.ok(fuerte.score > debil.score)
  assert.equal(fuerte.senales.alias_documento, PESOS.ALIAS_DOCUMENTO)
})

// ── FASE 6: estados declarados ───────────────────────────────────────────────

test('los seis estados existen y cuatro de ellos apagan un documento', () => {
  assert.deepEqual(Object.values(ESTADO).length, 6)
  assert.equal(estaApagado(ESTADO.CANONICO), false)
  assert.equal(estaApagado(ESTADO.OPERATIVO), false)
  for (const e of [ESTADO.HISTORICO, ESTADO.ARCHIVADO, ESTADO.REEMPLAZADO, ESTADO.DUPLICADO]) {
    assert.equal(estaApagado(e), true, e)
  }
})

test('lo declarado canónico le gana a la carpeta en la que está guardado', async () => {
  _reiniciarSinonimos()
  const estados = [{ drive_file_id: 'f-obra-b', estado: 'canonico' }]
  const sin = await buscar({ indice: crearIndice({ port: portDe() }), texto: 'avance obra estrella', ahora: AHORA })
  assert.equal((sin.ganador ?? sin.opciones[0]).drive_file_id, 'f-obra-a', 'por defecto gana el que no está en 2024')

  const con = await buscar({ indice: crearIndice({ port: portDe({ estados }) }), texto: 'avance obra estrella', ahora: AHORA })
  assert.equal((con.ganador ?? con.opciones[0]).drive_file_id, 'f-obra-b',
    'si la empresa dice que EL documento es ese, la carpeta deja de importar')
})

test('un archivo prolijo y nuevo que la empresa dio de baja deja de ir primero', async () => {
  _reiniciarSinonimos()
  const estados = [{ drive_file_id: 'f-obra-a', estado: 'reemplazado', reemplazado_por: 'f-obra-b' }]
  const r = await buscar({ indice: crearIndice({ port: portDe({ estados }) }), texto: 'avance obra estrella', ahora: AHORA })
  assert.equal((r.ganador ?? r.opciones[0]).drive_file_id, 'f-obra-b')
})

test('el desglose distingue "está en una carpeta vieja" de "ustedes lo dieron de baja"', () => {
  const c = analizarConsulta('avance obra estrella')
  const declarado = puntuar(FILAS[3], c, { ahora: AHORA, estado: { estado: 'archivado' } })
  assert.ok(declarado.senales.estado_archivado < 0)
  assert.equal(declarado.senales.historico, undefined, 'no se cobra dos veces lo mismo')
})

test('el mapa de estados ignora filas rotas en vez de creerles', () => {
  const m = crearEstados([{ drive_file_id: 'x', estado: 'CANONICO' }, { estado: 'operativo' }, null])
  assert.equal(m.size, 1)
  assert.equal(m.get('x').estado, 'canonico')
})

// ── El rescate no puede convertirse en un cajón de sastre ────────────────────

test('compartir una palabra con una carpeta no alcanza para ser un resultado', async () => {
  _reiniciarSinonimos()
  // Contra el índice real, "zzz-no-existe" devolvía cinco documentos operativos: enganchaban
  // por la palabra "no" de la carpeta "…SAS - NO TOCAR". Cinco respuestas para una consulta
  // sin sentido enseñan que el buscador contesta cualquier cosa.
  const fuentes = [{ drive_file_id: 'f-cash', nombre: 'Flujo de Caja', area: 'Tesorería', vigencia: 'vigente', estado: 'actualizado', criticidad: 'alta' }]
  const filas = [{ ...FILAS[0], path: `${A}/SAS - NO TOCAR/Flujo de Caja - Cash Flow ECSAS` }]
  const port = { query: async (sql) => {
    if (sql.includes('drive_index')) return { rows: filas }
    if (sql.includes('fuentes_datos')) return { rows: fuentes }
    return { rows: [] }
  } }
  const r = await buscar({ indice: crearIndice({ port }), texto: 'zzz-no-existe', ahora: AHORA })
  assert.equal(r.etapa, null)
  assert.deepEqual(r.opciones, [])
})

test('con media consulta sin encontrar, el OS propone: no afirma', () => {
  // Contra el índice real, "zzz-no-existe" devolvía con CONFIANZA ALTA un pliego de demolición
  // porque "existe" es prefijo de "EXISTENTE". La palabra que identificaba algo no apareció en
  // ninguna parte. Ser el único candidato no es ser el correcto.
  const parcial = [{ score: 200, senales: { tokens_nombre: 70, cobertura: 75 } }]
  assert.equal(resolver(parcial, { exigeCobertura: true }).confianza, 'media')
  assert.equal(resolver(parcial, { exigeCobertura: true }).ganador, parcial[0], 'proponer no es esconder')

  const completo = [{ score: 900, senales: { tokens_nombre: 240, cobertura: PESOS.COBERTURA } }]
  assert.equal(resolver(completo, { exigeCobertura: true }).confianza, 'alta')
  // Con una sola palabra pedida no hay media consulta posible: o la cubre o no hay resultado.
  assert.equal(resolver(parcial, { exigeCobertura: false }).confianza, 'alta')
})

test('tampoco se afirma cuando gana por lejos pero no cubre lo que le pidieron', () => {
  const r = resolver([
    { score: 900, senales: { cobertura: 75 } },
    { score: 200, senales: { cobertura: 75 } },
  ], { exigeCobertura: true })
  assert.equal(r.confianza, 'media')
})

test('pero una coincidencia de verdad por alias del registro sí rescata', async () => {
  _reiniciarSinonimos()
  const fuentes = [{ drive_file_id: 'f-cuadro', nombre: 'Reporte Economico', area: 'Dirección', proceso_negocio: 'Padrón de flota', vigencia: 'vigente', estado: 'actualizado', criticidad: 'alta' }]
  const port = { query: async (sql) => {
    if (sql.includes('drive_index')) return { rows: FILAS }
    if (sql.includes('fuentes_datos')) return { rows: fuentes }
    return { rows: [] }
  } }
  const r = await buscar({ indice: crearIndice({ port }), texto: 'padron de flota', ahora: AHORA })
  assert.equal(r.etapa, 'rescate')
  assert.equal(r.ganador?.drive_file_id, 'f-cuadro')
})

// ── Compatibilidad ───────────────────────────────────────────────────────────

test('sin ninguna de las tablas nuevas, el buscador anda igual que antes', async () => {
  _reiniciarSinonimos()
  const port = {
    query: async (sql) => {
      if (sql.includes('drive_index')) return { rows: FILAS }
      throw new Error('relation does not exist')
    },
  }
  const r = await buscar({ indice: crearIndice({ port }), texto: 'flujo de fondos', ahora: AHORA })
  assert.equal((r.ganador ?? r.opciones[0])?.name, 'Flujo de Fondos.xlsx')
})

test('marcar confirmado no explota si la base no está', async () => {
  assert.equal(await marcarConfirmado({ query: async () => { throw new Error('x') } }, 1, 'f'), false)
  assert.equal(await marcarConfirmado(null, 1, 'f'), false)
})
