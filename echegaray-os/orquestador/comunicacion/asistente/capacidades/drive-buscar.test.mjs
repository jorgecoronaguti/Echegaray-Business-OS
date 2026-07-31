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
function portDe({ filas = INDICE, usos = [] } = {}) {
  const escrituras = []
  return {
    escrituras,
    query: async (sql, params) => {
      if (sql.includes('insert into public.drive_busqueda_uso')) { escrituras.push(params); return { rows: [] } }
      if (sql.includes('drive_index')) return { rows: filas }
      if (sql.includes('drive_busqueda_uso')) return { rows: usos }
      if (sql.includes('drive_alias')) return { rows: [] }
      return { rows: [] }
    },
  }
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
    { port, google, ahora: () => AHORA },
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

// ── Aprender ─────────────────────────────────────────────────────────────────

test('elegir una opción devuelve ESE archivo y lo aprende', async () => {
  const port = portDe()
  const r = await correr({ terminos: 'avances de obra', archivoId: 'f-av2' }, { port })
  assert.equal(r.ok, true)
  assert.equal(r.evidencia.archivo.id, 'f-av2')
  assert.equal(r.evidencia.aprendido, true)
  assert.equal(port.escrituras.length, 1)
  assert.deepEqual(port.escrituras[0], ['avance obra', 'f-av2'])
})

test('lo aceptado antes para esta consulta pasa a ganar', async () => {
  const usos = [{ consulta_norm: 'avance obra', drive_file_id: 'f-av2', veces: 10 }]
  const r = await correr({ terminos: 'avances de obra' }, { usos })
  assert.equal(r.ok, true, 'con el aprendizaje ya no hay empate')
  assert.equal(r.evidencia.archivo.id, 'f-av2')
})

test('un resultado dominante también se aprende', async () => {
  const port = portDe()
  await correr({ terminos: 'vision' }, { port })
  assert.deepEqual(port.escrituras[0], ['vision', 'f-vision'])
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
