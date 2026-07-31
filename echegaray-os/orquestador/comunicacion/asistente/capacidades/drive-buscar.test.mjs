// BUSCAR UN ARCHIVO: elegir bien, preguntar cuando corresponde, y no repetir la llamada.
//
// El cliente de Google es un doble que CUENTA las llamadas: sin eso, "no repite la búsqueda"
// es una promesa que nadie verifica.

import test from 'node:test'
import assert from 'node:assert/strict'
import { capacidad, _limpiarCache } from './drive-buscar.mjs'
import { CUENTA } from '../google-cliente.mjs'
import { ERROR } from '../contratos.mjs'

const MIME = { pdf: 'application/pdf', sheet: 'application/vnd.google-apps.spreadsheet', carpeta: 'application/vnd.google-apps.folder' }

/** Doble del cliente Google: sólo lo que esta capacidad consume. */
function googleFalso(archivos, { falla = null } = {}) {
  const llamadas = { buscar: 0, meta: 0 }
  return {
    llamadas,
    [CUENTA]: { email: 'jorge@ecsas.com.ar', propia: true },
    async searchFile() {
      llamadas.buscar++
      if (falla) throw falla
      return archivos.map(({ id, name, mimeType }) => ({ id, name, mimeType }))
    },
    async apiGetSheets(url) {
      llamadas.meta++
      const id = decodeURIComponent(String(url).split('/files/')[1].split('?')[0])
      const a = archivos.find((x) => x.id === id)
      return { id: a.id, name: a.name, mimeType: a.mimeType, modifiedTime: a.modifiedTime, webViewLink: a.webViewLink }
    },
    async getMeta(id) {
      llamadas.meta++
      const a = archivos.find((x) => x.id === id)
      return { id: a.id, name: a.name, mimeType: a.mimeType, webViewLink: a.webViewLink }
    },
  }
}

const ctxCon = (google) => ({
  google,
  identidad: { plataformaUserId: 'u1', nombreVisible: 'Jorge', email: 'jorge@ecsas.com.ar' },
  ahora: () => new Date('2026-07-30T12:00:00-03:00'),
})

const CONTRATO = {
  id: 'f1', name: 'Contrato Quattropani.pdf', mimeType: MIME.pdf,
  modifiedTime: '2026-07-27T14:00:00.000Z', webViewLink: 'https://drive.google.com/file/d/f1/view',
}

test.beforeEach(() => _limpiarCache())

test('un resultado dominante se devuelve directo, con fecha y enlace real', async () => {
  const g = googleFalso([CONTRATO, { id: 'f2', name: 'Anexo del contrato de obra', mimeType: MIME.pdf, modifiedTime: '2026-01-01T00:00:00.000Z', webViewLink: 'https://x/f2' }])
  const r = await capacidad.ejecutar({ terminos: 'Contrato Quattropani' }, ctxCon(g))
  assert.equal(r.ok, true)
  assert.equal(r.texto, 'Encontré este archivo: Contrato Quattropani.pdf — modificado el 27/07/2026. [Abrir archivo](https://drive.google.com/file/d/f1/view)')
  assert.equal(r.evidencia.archivo.id, 'f1')
  assert.equal(r.evidencia.archivo.tipo, 'pdf')
})

test('con varios igual de plausibles se pregunta una vez, con cinco opciones como máximo', async () => {
  const muchos = Array.from({ length: 7 }, (_, i) => ({
    id: `f${i}`, name: `Presupuesto obra ${i}`, mimeType: MIME.sheet,
    modifiedTime: `2026-0${i + 1}-01T00:00:00.000Z`, webViewLink: `https://x/f${i}`,
  }))
  const r = await capacidad.ejecutar({ terminos: 'presupuesto' }, ctxCon(googleFalso(muchos)))
  assert.equal(r.ok, false)
  assert.equal(r.error, null)
  assert.equal(r.aclaracion.opciones.length, 5)
  assert.match(r.texto, /¿Cuál te paso\?/)
  // A igual puntaje manda el más reciente.
  assert.equal(r.aclaracion.opciones[0].valor, 'f6')
})

test('sin resultados lo dice, sin inventar un archivo parecido', async () => {
  const r = await capacidad.ejecutar({ terminos: 'acta de recepción' }, ctxCon(googleFalso([])))
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.NO_ENCONTRADO)
  assert.match(r.texto, /No encontré ningún archivo/)
  assert.equal(r.evidencia, null)
})

test('el mismo pedido dos veces seguidas no vuelve a pegarle a Drive', async () => {
  const g = googleFalso([CONTRATO])
  const ctx = ctxCon(g)
  const a = await capacidad.ejecutar({ terminos: 'Contrato Quattropani' }, ctx)
  const b = await capacidad.ejecutar({ terminos: '  contrato quattropani ' }, ctx)
  assert.equal(g.llamadas.buscar, 1)
  assert.equal(a.texto, b.texto)
})

test('pasada la ventana, la búsqueda se vuelve a hacer', async () => {
  const g = googleFalso([CONTRATO])
  let t = new Date('2026-07-30T12:00:00-03:00')
  const ctx = { ...ctxCon(g), ahora: () => t }
  await capacidad.ejecutar({ terminos: 'Contrato Quattropani' }, ctx)
  t = new Date('2026-07-30T12:02:00-03:00')
  await capacidad.ejecutar({ terminos: 'Contrato Quattropani' }, ctx)
  assert.equal(g.llamadas.buscar, 2)
})

test('otro usuario no se come el resultado cacheado del primero', async () => {
  const g = googleFalso([CONTRATO])
  await capacidad.ejecutar({ terminos: 'Contrato Quattropani' }, ctxCon(g))
  const otro = { ...ctxCon(g), identidad: { plataformaUserId: 'u2', nombreVisible: 'Rodrigo', email: 'r@ecsas.com.ar' } }
  await capacidad.ejecutar({ terminos: 'Contrato Quattropani' }, otro)
  assert.equal(g.llamadas.buscar, 2)
})

test('el filtro por tipo descarta lo que no es del tipo pedido', async () => {
  const g = googleFalso([CONTRATO, { id: 'f9', name: 'Contrato Quattropani', mimeType: MIME.sheet, modifiedTime: '2026-07-29T00:00:00.000Z', webViewLink: 'https://x/f9' }])
  const r = await capacidad.ejecutar({ terminos: 'Contrato Quattropani', tipo: 'planilla' }, ctxCon(g))
  assert.equal(r.ok, true)
  assert.equal(r.evidencia.archivo.id, 'f9')
})

test('OAuth vencido: el chat lee una frase humana y el log el 401', async () => {
  const g = googleFalso([], { falla: Object.assign(new Error('google api 401: invalid credentials'), { status: 401 }) })
  const r = await capacidad.ejecutar({ terminos: 'lo que sea' }, ctxCon(g))
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.GOOGLE_SIN_ACCESO)
  assert.match(r.texto, /Conectar con Google/)
  assert.match(r.error.detalle, /401/)
})

test('Google saturado (429) es temporal y reintentable', async () => {
  const g = googleFalso([], { falla: Object.assign(new Error('google api 429: rate limit'), { status: 429 }) })
  const r = await capacidad.ejecutar({ terminos: 'flujo de caja' }, ctxCon(g))
  assert.equal(r.error.codigo, ERROR.TEMPORAL)
  assert.equal(r.error.reintentable, true)
})

test('sin cuenta conectada no se ejecuta ni se ofrece', async () => {
  const r = await capacidad.ejecutar({ terminos: 'contrato' }, { identidad: { email: 'x@y.com' } })
  assert.equal(r.error.codigo, ERROR.GOOGLE_SIN_ACCESO)
  const habilitada = await capacidad.habilitada({ identidad: { email: 'x@y.com' }, googleDeps: { hayCuentaAutorizada: async () => false } })
  assert.equal(habilitada, false)
})

test('el error de Drive NO se cachea: el próximo intento vuelve a preguntar', async () => {
  const archivos = [CONTRATO]
  let falla = Object.assign(new Error('google api 429'), { status: 429 })
  const g = {
    [CUENTA]: { email: 'jorge@ecsas.com.ar', propia: true },
    llamadas: { buscar: 0 },
    async searchFile() { this.llamadas.buscar++; if (falla) throw falla; return archivos },
    async getMeta(id) { const a = archivos.find((x) => x.id === id); return { ...a, webViewLink: a.webViewLink } },
  }
  const ctx = ctxCon(g)
  assert.equal((await capacidad.ejecutar({ terminos: 'Contrato Quattropani' }, ctx)).ok, false)
  falla = null
  assert.equal((await capacidad.ejecutar({ terminos: 'Contrato Quattropani' }, ctx)).ok, true)
  assert.equal(g.llamadas.buscar, 2)
})

test('sin apiGetSheets cae a getMeta: queda sin fecha, nunca con una inventada', async () => {
  const g = {
    [CUENTA]: { email: 'jorge@ecsas.com.ar', propia: true },
    async searchFile() { return [{ id: 'f1', name: CONTRATO.name, mimeType: MIME.pdf }] },
    async getMeta(id) { return { id, name: CONTRATO.name, mimeType: MIME.pdf, webViewLink: CONTRATO.webViewLink } },
  }
  const r = await capacidad.ejecutar({ terminos: 'Contrato Quattropani' }, ctxCon(g))
  assert.equal(r.ok, true)
  assert.equal(r.evidencia.archivo.modificado, null)
  assert.equal(r.texto, `Encontré este archivo: Contrato Quattropani.pdf. [Abrir archivo](${CONTRATO.webViewLink})`)
})
