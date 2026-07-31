// BUSCAR UN ARCHIVO: encontrarlo aunque lo escriban distinto, elegir bien, preguntar cuando
// de verdad hay empate, y aprender de lo que la persona eligió.
//
// El índice es un doble en memoria con archivos REALES del Drive de la empresa. La API de
// Drive también es un doble que CUENTA sus llamadas: "el índice alcanza y no se sale a la
// red" es una promesa que, si nadie la verifica, no vale nada.

import test from 'node:test'
import assert from 'node:assert/strict'
import { capacidad, _reiniciarIndice } from './drive-buscar.mjs'
import { CUENTA } from '../google-cliente.mjs'
import { ERROR } from '../contratos.mjs'
import { _reiniciarSinonimos } from '../../../lib/drive-busqueda/normalizar.mjs'

const A = 'administracion'
const INDICE = [
  { drive_file_id: 'f-vision', name: 'Vision / Tracción', path: `${A}/Estrategia/Vision/Vision / Tracción`, tipo: 'planilla', is_folder: false, modified_time: '2026-07-20T10:00:00Z', depth: 3 },
  { drive_file_id: 'f-cash', name: 'Flujo de Caja - Cash Flow ECSAS', path: `${A}/Flujo de Caja - Cash Flow ECSAS`, tipo: 'planilla', is_folder: false, modified_time: '2026-07-31T09:00:00Z', depth: 1 },
  { drive_file_id: 'f-av1', name: 'Avances de Obra', path: `${A}/Avances de Obra`, tipo: 'archivo', is_folder: false, modified_time: '2026-07-15T09:00:00Z', depth: 1 },
  { drive_file_id: 'f-av2', name: 'Avances de Obra', path: `${A}/Estrategia/Avances de Obra`, tipo: 'archivo', is_folder: false, modified_time: '2026-06-15T09:00:00Z', depth: 2 },
]

const AHORA = new Date('2026-07-31T13:00:00Z')

/** Port de mentira: el índice, y un registro de todo lo que se escribió. */
function portDe({ filas = INDICE, usos = [], fuentes = [], eventos = [] } = {}) {
  const escrituras = []
  const sql = []
  return {
    escrituras,
    sql,
    query: async (q, params) => {
      sql.push({ q: q.replace(/\s+/g, ' ').trim(), params })
      if (q.includes('insert into public.drive_busqueda_uso')) { escrituras.push(params); return { rows: [] } }
      if (q.includes('insert into public.drive_busqueda_evento')) return { rows: [{ id: 77 }] }
      if (q.includes('from public.drive_busqueda_evento')) return { rows: eventos }
      if (q.includes('drive_index')) return { rows: filas }
      if (q.includes('fuentes_datos')) return { rows: fuentes }
      if (q.includes('drive_busqueda_uso')) return { rows: usos }
      if (q.includes('drive_alias')) return { rows: [] }
      return { rows: [] }
    },
  }
}

/** Un evento ya guardado: lo que el buscador propuso la vez anterior. */
const EVENTO = {
  id: 77,
  consulta: 'flujo de fondos',
  consulta_norm: 'flujo caja',
  confianza: 'alta',
  etapa: 'normalizada',
  elegido: 'f-cash',
  candidatos: [
    { id: 'f-cash', name: 'Flujo de Caja - Cash Flow ECSAS', score: 1146, senales: { fuente_operativa: 300 } },
    { id: 'f-vision', name: 'Vision / Tracción', score: 455, senales: { historico: -200 } },
  ],
}

/** Doble del cliente Google. Cuenta las llamadas: el índice tiene que alcanzar solo. */
function googleFalso(archivos = []) {
  const llamadas = { buscar: 0 }
  return {
    llamadas,
    [CUENTA]: { email: 'jorge@ecsas.com.ar', propia: true },
    async searchFile() { llamadas.buscar++; return archivos },
  }
}

const correr = async (params, extra = {}) => {
  _reiniciarIndice(); _reiniciarSinonimos()
  const port = extra.port ?? portDe(extra)
  const google = 'google' in extra ? extra.google : googleFalso()
  const r = await capacidad.ejecutar(
    { tipo: 'cualquiera', ...params },
    { port, google, ahora: () => AHORA, identidad: extra.identidad ?? { plataformaUserId: 'u-jorge' } },
  )
  return { ...r, port, google }
}

// ── Encontrar ────────────────────────────────────────────────────────────────

test('EL CASO: "vision/traccion" encuentra "Vision / Tracción"', async () => {
  const r = await correr({ terminos: 'vision/traccion' })
  assert.equal(r.ok, true)
  assert.equal(r.evidencia.archivo.nombre, 'Vision / Tracción')
})

test('todas las formas de pedirlo llegan al mismo archivo', async () => {
  for (const q of ['vision', 'visión', 'Vision/Tracción', 'vision traccion', 'vision estrategia', 'pasame vision']) {
    const r = await correr({ terminos: q })
    assert.equal(r.ok, true, q)
    assert.equal(r.evidencia.archivo.nombre, 'Vision / Tracción', q)
  }
})

test('la respuesta dice QUÉ, DÓNDE, CUÁNDO y cómo abrirlo', async () => {
  const r = await correr({ terminos: 'vision' })
  assert.match(r.texto, /Vision \/ Tracción/)
  assert.match(r.texto, /Carpeta: administracion > Estrategia > Vision/)
  assert.match(r.texto, /Última modificación: 20\/07\/2026/)
  assert.match(r.texto, /\[Abrir\]\(https:\/\/drive\.google\.com\/file\/d\/f-vision\/view\)/)
})

test('la carpeta se muestra sin el espacio que deja un nombre con barra', async () => {
  const r = await correr({ terminos: 'vision' })
  assert.equal(r.evidencia.archivo.ubicacion, 'administracion > Estrategia > Vision')
})

test('lo modificado hoy se dice "hoy" y con la hora', async () => {
  const r = await correr({ terminos: 'cash flow' })
  assert.match(r.texto, /Última modificación: hoy \d{2}:\d{2}/)
})

// ── El índice alcanza ────────────────────────────────────────────────────────

test('con el índice NO se le pregunta a Drive', async () => {
  const r = await correr({ terminos: 'vision' })
  assert.equal(r.google.llamadas.buscar, 0, 'salió a la red teniendo el archivo indexado')
})

test('el índice se lee UNA vez aunque se busque varias', async () => {
  _reiniciarIndice(); _reiniciarSinonimos()
  const base = portDe()
  let lecturas = 0
  const port = {
    query: async (sql, params) => {
      if (sql.startsWith('select') && sql.includes('drive_index')) lecturas++
      return base.query(sql, params)
    },
  }
  const ctx = { port, google: googleFalso(), ahora: () => AHORA }
  for (const q of ['vision', 'cash flow', 'avances']) await capacidad.ejecutar({ terminos: q, tipo: 'cualquiera' }, ctx)
  assert.equal(lecturas, 1)
})

test('sólo si el índice no tiene NADA se sale a Drive en vivo', async () => {
  const google = googleFalso([{ id: 'nuevo', name: 'Contrato Recién Subido', mimeType: 'application/pdf' }])
  const r = await correr({ terminos: 'zzzqwerty' }, { google })
  assert.equal(google.llamadas.buscar, 1)
  assert.equal(r.ok, true)
  assert.equal(r.evidencia.via, 'drive_vivo')
})

test('si no está en ningún lado se dice, sin inventar un archivo', async () => {
  const r = await correr({ terminos: 'zzzqwerty' })
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.NO_ENCONTRADO)
  assert.match(r.error.mensaje, /No encontré nada parecido/)
})

// ── Preguntar cuando hay empate de verdad ────────────────────────────────────

test('dos archivos con el MISMO nombre: se pregunta, no se adivina', async () => {
  const r = await correr({ terminos: 'avances de obra' })
  assert.equal(r.ok, false)
  assert.equal(r.aclaracion.opciones.length, 2)
  assert.match(r.texto, /Encontré varios/)
  // La lista numerada tiene que estar EN EL TEXTO: es lo único que la persona ve.
  assert.match(r.texto, /1\. Avances de Obra/)
  assert.match(r.texto, /2\. Avances de Obra/)
})

test('la pregunta declara CÓMO se contesta, para que la respuesta vuelva acá', async () => {
  const r = await correr({ terminos: 'avances de obra' })
  assert.equal(r.aclaracion.parcial.faltante, 'archivoId')
  assert.equal(r.aclaracion.parcial.intencion, 'drive.buscar')
  assert.equal(r.aclaracion.parcial.parametros.terminos, 'avances de obra')
})

test('nunca se ofrecen más de cinco opciones', async () => {
  const muchos = Array.from({ length: 12 }, (_, i) => ({
    drive_file_id: `x${i}`, name: 'Presupuesto', path: `${A}/Obra${i}/Presupuesto`,
    tipo: 'pdf', is_folder: false, modified_time: '2026-01-01T00:00:00Z', depth: 2,
  }))
  const r = await correr({ terminos: 'presupuesto' }, { filas: muchos })
  assert.equal(r.aclaracion.opciones.length, 5)
})

test('la opción dice dónde está cada uno: si no, elegir es tirar una moneda', async () => {
  const r = await correr({ terminos: 'avances de obra' })
  const [a, b] = r.aclaracion.opciones
  assert.match(a.etiqueta, /en administracion/)
  assert.match(b.etiqueta, /en administracion > Estrategia/)
  assert.notEqual(a.etiqueta, b.etiqueta, 'dos opciones idénticas no se pueden elegir')
})

// ── Proponer: hay un favorito, pero el otro también existe ───────────────────
//
// El caso del dueño: "pasame el flujo de fondos". El archivo que se llama EXACTAMENTE así es
// de 2025 y vive en una carpeta de archivo; el documento que la empresa usa es el Sheet vivo.
// El OS elige, pero tiene que decir contra qué eligió.

const FLUJOS = [
  { drive_file_id: 'f-cash', name: 'Flujo de Caja - Cash Flow ECSAS', path: `${A}/Flujo de Caja - Cash Flow ECSAS`, tipo: 'planilla', mime_type: 'application/vnd.google-apps.spreadsheet', is_folder: false, modified_time: '2026-07-31T09:00:00Z', depth: 1 },
  { drive_file_id: 'f-fondos', name: 'Flujo de Fondos.xlsx', path: `${A}/AÑO 2025/Flujo de Fondos.xlsx`, tipo: 'planilla', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', is_folder: false, modified_time: '2026-01-15T09:00:00Z', depth: 2 },
]
const FUENTE_CASH = [{
  drive_file_id: 'f-cash', nombre: 'Flujo de Caja - Cash Flow (Sheet)', area: 'Tesorería',
  proceso_negocio: 'Flujo de caja proyectado y real', vigencia: 'vigente', estado: 'actualizado',
  criticidad: 'alta', ultima_lectura: '2026-07-31T08:00:00Z',
}]

test('"pasame el flujo de fondos" abre el documento vivo, no el de AÑO 2025', async () => {
  const r = await correr({ terminos: 'flujo de fondos' }, { filas: FLUJOS, fuentes: FUENTE_CASH })
  assert.equal(r.ok, true)
  assert.equal(r.evidencia.archivo.nombre, 'Flujo de Caja - Cash Flow ECSAS')
})

test('…y le muestra el archivo viejo como alternativa, con su enlace', async () => {
  const r = await correr({ terminos: 'flujo de fondos' }, { filas: FLUJOS, fuentes: FUENTE_CASH })
  // Confianza alta: se afirma. Las alternativas se muestran igual — son transparencia, no duda.
  assert.match(r.texto, /^Encontré: \*\*Flujo de Caja - Cash Flow ECSAS\*\*/)
  assert.match(r.texto, /También encontré:/)
  assert.match(r.texto, /• Flujo de Fondos\.xlsx.*\[abrir\]\(https:\/\/drive\.google\.com\/file\/d\/f-fondos\/view\)/)
})

test('la evidencia dice con cuánta seguridad eligió y por qué señales', async () => {
  const r = await correr({ terminos: 'flujo de fondos' }, { filas: FLUJOS, fuentes: FUENTE_CASH })
  assert.equal(r.evidencia.confianza, 'alta')
  assert.ok(r.evidencia.senales.fuente_operativa > 0)
  assert.equal(r.evidencia.alternativas.length, 1)
})

test('sin competencia no hay ruido: un solo resultado se responde limpio', async () => {
  const r = await correr({ terminos: 'vision' })
  assert.match(r.texto, /^Encontré: /)
  assert.doesNotMatch(r.texto, /También encontré/)
})

// ── Lo que se sabe y lo que se sospecha no se dicen igual ────────────────────

test('UNA COINCIDENCIA PARCIAL NUNCA SE REDACTA COMO CERTEZA', async () => {
  // "vision zzzz": la palabra que identificaba algo no aparece por ningún lado. El ranking ya
  // lo marcaba como confianza media y la respuesta igual arrancaba con "Encontré:", que no
  // admite duda. Un sistema que afirma con la misma cara cuando sabe y cuando sospecha enseña
  // a desconfiar también de cuando sabe.
  const r = await correr({ terminos: 'vision zzzz' })
  assert.equal(r.ok, true)
  assert.equal(r.evidencia.confianza, 'media')
  assert.match(r.texto, /^Puede que te refieras a: \*\*Vision \/ Tracción\*\*/)
  assert.doesNotMatch(r.texto, /^Encontré/)
})

test('la redacción la decide la confianza, no si hay alternativas', async () => {
  // Confianza alta CON alternativas: se afirma igual, y las alternativas se muestran.
  const conAlternativas = await correr({ terminos: 'flujo de fondos' }, { filas: FLUJOS, fuentes: FUENTE_CASH })
  assert.equal(conAlternativas.evidencia.confianza, 'alta')
  assert.match(conAlternativas.texto, /^Encontré: /)
  assert.match(conAlternativas.texto, /También encontré:/)

  // Confianza media SIN alternativas: no se afirma, aunque no haya con qué comparar.
  const sinAlternativas = await correr({ terminos: 'vision zzzz' })
  assert.match(sinAlternativas.texto, /^Puede que te refieras a: /)
  assert.doesNotMatch(sinAlternativas.texto, /También encontré/)
})

test('confianza baja no afirma nada: pregunta', async () => {
  const r = await correr({ terminos: 'avances de obra' })
  assert.equal(r.ok, false)
  assert.match(r.texto, /Encontré varios\. ¿Cuál te paso\?/)
  assert.doesNotMatch(r.texto, /Encontré: /)
})

// ── Cerrar la conversación ───────────────────────────────────────────────────

test('"gracias" cierra: no busca, no aprende, no muestra catálogo ni alternativas', async () => {
  const port = portDe({ eventos: [EVENTO] })
  const r = await correr({ terminos: 'flujo de fondos', feedback: 'cierre', eventoId: 77 }, { port })
  assert.equal(r.ok, true)
  assert.equal(r.evidencia.cierre, true)
  assert.equal(port.escrituras.length, 0, 'agradecer no puede generar aprendizaje')
  assert.doesNotMatch(r.texto, /Encontré|También encontré|Abrir/)
  assert.ok(r.texto.length < 80, 'un cierre es una línea, no una pantalla')
})

test('cerrar no necesita saber cuál fue la búsqueda: no toca la base', async () => {
  const port = portDe({ eventos: [] })
  const r = await correr({ terminos: 'x', feedback: 'cierre' }, { port })
  assert.equal(r.ok, true)
  assert.equal(port.sql.filter((s) => s.q.includes('drive_busqueda_evento')).length, 0)
})

// ── Aprender ─────────────────────────────────────────────────────────────────

test('elegir una opción devuelve ESE archivo y lo aprende', async () => {
  const port = portDe()
  const r = await correr({ terminos: 'avances de obra', archivoId: 'f-av2' }, { port })
  assert.equal(r.ok, true)
  assert.equal(r.evidencia.archivo.id, 'f-av2')
  assert.equal(r.evidencia.aprendido, true)
  assert.equal(port.escrituras.length, 1)
  // Se aprende PARA QUIÉN eligió, y cuánto suma: la preferencia de una persona no es la de la
  // empresa, y un "no era ese" resta con el mismo peso (ver el test de rechazo).
  assert.deepEqual(port.escrituras[0], ['avance obra', 'f-av2', 'u-jorge', 1])
})

test('lo aceptado antes para esta consulta pasa a ganar', async () => {
  const usos = [{ consulta_norm: 'avance obra', drive_file_id: 'f-av2', veces: 10 }]
  const r = await correr({ terminos: 'avances de obra' }, { usos })
  assert.equal(r.ok, true, 'con el aprendizaje ya no hay empate')
  assert.equal(r.evidencia.archivo.id, 'f-av2')
})

test('cuando sólo PROPONE no aprende: sería fabricar una preferencia y reforzarla sola', async () => {
  const port = portDe({ usos: [{ consulta_norm: 'avance obra', drive_file_id: 'f-av2', veces: 2 }] })
  const r = await correr({ terminos: 'avances de obra' }, { port })
  assert.equal(r.ok, true)
  assert.equal(r.evidencia.confianza, 'media', 'el caso elegido tiene que ser de confianza media')
  assert.equal(port.escrituras.length, 0, 'anotó como elección algo que la persona nunca confirmó')
})

test('NI SIQUIERA un resultado dominante se aprende solo: proponer no es aprender', async () => {
  // Antes esto se anotaba como si la persona lo hubiera elegido. Un resultado que nadie
  // confirmó, reforzándose con su propio eco, es una preferencia fabricada: a los diez usos
  // el buscador está seguro de algo que nadie le dijo nunca.
  const port = portDe()
  const r = await correr({ terminos: 'vision' }, { port })
  assert.equal(r.ok, true)
  assert.equal(port.escrituras.length, 0)
})

// ── Feedback: la corrección más barata que existe ────────────────────────────

test('toda búsqueda queda registrada, acierte o no', async () => {
  const port = portDe()
  const r = await correr({ terminos: 'vision' }, { port })
  assert.equal(r.evidencia.evento, 77)
  const ins = port.sql.filter((s) => s.q.startsWith('insert into public.drive_busqueda_evento'))
  assert.equal(ins.length, 1)
  assert.equal(ins[0].params[0], 'u-jorge')
})

test('la respuesta deja abierto el seguimiento: se puede desmentir, confirmar o preguntar', async () => {
  const r = await correr({ terminos: 'vision' })
  assert.equal(r.seguimiento.parcial.feedback, true)
  assert.equal(r.seguimiento.parcial.parametros.eventoId, 77)
  assert.ok(r.seguimiento.opciones.length >= 1)
})

test('"correcto" es lo que dispara el aprendizaje, y recién ahí', async () => {
  const port = portDe({ eventos: [EVENTO] })
  const r = await correr({ terminos: 'flujo de fondos', feedback: 'confirma', eventoId: 77 }, { port })
  assert.equal(r.ok, true)
  assert.equal(r.evidencia.aprendido, true)
  assert.deepEqual(port.escrituras[0], ['flujo caja', 'f-cash', 'u-jorge', 1])
  assert.ok(port.sql.some((s) => s.q.includes('confirmado_at = now()')))
})

test('"no era ese" descuenta y ofrece los que habían quedado atrás', async () => {
  const port = portDe({ eventos: [EVENTO] })
  const r = await correr({ terminos: 'flujo de fondos', feedback: 'rechaza', eventoId: 77 }, { port })
  assert.deepEqual(port.escrituras[0], ['flujo caja', 'f-cash', 'u-jorge', -1],
    'sin el descuento, mañana hay que corregir lo mismo otra vez')
  assert.ok(port.sql.some((s) => s.q.includes('rechazado_at = now()')))
  assert.equal(r.aclaracion.opciones.length, 1)
  assert.equal(r.aclaracion.opciones[0].valor, 'f-vision')
})

test('"¿por qué ese?" contesta con el desglose, sin volver a buscar', async () => {
  const port = portDe({ eventos: [EVENTO] })
  const r = await correr({ terminos: 'flujo de fondos', feedback: 'explica', eventoId: 77 }, { port })
  assert.equal(r.ok, true)
  assert.match(r.texto, /Ganó: Flujo de Caja/)
  assert.match(r.texto, /fuente de negocio/)
  assert.match(r.texto, /Le ganó a "Vision \/ Tracción"/)
  assert.equal(port.escrituras.length, 0, 'explicar no puede cambiar lo que explica')
})

test('CONTESTAR UN FEEDBACK NO TERMINA LA CONVERSACIÓN', async () => {
  // El pendiente se consume al resolverlo. Sin reponerlo, la charla real moría en el primer
  // paso: "¿por qué ese?" se comía el contexto y el "no era ese" siguiente caía en el catálogo.
  for (const f of ['explica', 'confirma']) {
    const r = await correr({ terminos: 'flujo de fondos', feedback: f, eventoId: 77 }, { port: portDe({ eventos: [EVENTO] }) })
    assert.equal(r.ok, true, f)
    assert.equal(r.seguimiento?.parcial?.feedback, true, `"${f}" cerró la puerta`)
    assert.equal(r.seguimiento.opciones.length, 2, f)
    assert.equal(r.seguimiento.parcial.parametros.eventoId, 77, f)
  }
})

test('elegir de la lista tampoco cierra la conversación', async () => {
  // Después de "el segundo" alguien dice "gracias". Sin dejar la puerta abierta, ese gracias
  // vuelve a caer en el catálogo — que es exactamente lo que se estaba arreglando.
  const r = await correr({ terminos: 'avances de obra', archivoId: 'f-av2' })
  assert.equal(r.ok, true)
  assert.equal(r.seguimiento?.parcial?.feedback, true)
})

test('cerrar SÍ termina la conversación: para eso se dijo "gracias"', async () => {
  const r = await correr({ terminos: 'flujo de fondos', feedback: 'cierre', eventoId: 77 }, { port: portDe({ eventos: [EVENTO] }) })
  assert.equal(r.seguimiento, null)
})

test('feedback sin una búsqueda previa se dice, no se inventa una', async () => {
  const r = await correr({ terminos: 'x', feedback: 'confirma' }, { port: portDe({ eventos: [] }) })
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.NO_ENCONTRADO)
})

test('elegir un id que ya no está en el índice se dice, no se rellena con otro', async () => {
  const r = await correr({ terminos: 'avances', archivoId: 'fantasma' })
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.NO_ENCONTRADO)
})

// ── Bordes ───────────────────────────────────────────────────────────────────

test('sin términos se pide el dato, no se busca cualquier cosa', async () => {
  const r = await correr({ terminos: '' })
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.DATO_FALTANTE)
})

test('sin base no se miente: se dice que no se puede ahora', async () => {
  _reiniciarIndice()
  const r = await capacidad.ejecutar({ terminos: 'vision', tipo: 'cualquiera' }, { port: null, google: googleFalso() })
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.TEMPORAL)
})

test('sin cuenta de Google, y sin nada en el índice, se pide conectarla', async () => {
  const r = await correr({ terminos: 'zzzqwerty' }, { google: null })
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.GOOGLE_SIN_ACCESO)
})

test('el tipo pedido se respeta cuando hay de ese tipo', async () => {
  const r = await correr({ terminos: 'vision', tipo: 'planilla' })
  assert.equal(r.evidencia.archivo.tipo, 'planilla')
})

test('la evidencia cuenta cómo se llegó: sirve para entender un resultado raro', async () => {
  const r = await correr({ terminos: 'vision' })
  assert.equal(r.evidencia.etapa, 'parcial')
  assert.equal(r.evidencia.evaluados, INDICE.length)
  assert.equal(typeof r.evidencia.ms, 'number')
})
