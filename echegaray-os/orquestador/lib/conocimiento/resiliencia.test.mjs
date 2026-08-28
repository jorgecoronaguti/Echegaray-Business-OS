// LOS ESCENARIOS DE RESILIENCIA QUE FALTABAN: E y F.
//
// Ya estaban probados B (sin saldo), C (sin API key), D (todos los LLM deshabilitados), G (caché
// disponible) y H (conocimiento local suficiente). Estos dos son los que quedaban:
//
//   E · HAY WEB PERO NO HAY LLM     → la investigación funciona ENTERA y dice qué quedó sin razonar.
//   F · UNA FUENTE EXTERNA CAÍDA    → 500, timeout o DNS: la fuente se degrada, el resto sigue,
//                                      y el fallo NO se cachea.
//
// ═══ CADA UNO CON SU CASO CONTRARIO ═══
//
// Un escenario que no puede terminar en «anduvo bien» no prueba nada: si el sistema devolviera
// siempre «degradado» o siempre «la fuente falló», estos tests pasarían igual y no estarían midiendo
// nada. Por eso cada bloque tiene su gemelo con el modelo encendido y con la fuente respondiendo.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import * as F from './fuentes.mjs'
import { VIA } from './metricas.mjs'
import { investigarWeb, resolver } from './investigar.mjs'
import { PASO, RESULTADO, estudiar } from './estudiar.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'resiliencia-'))

/** La página de resultados del buscador: dos fuentes de peso distinto, ninguna PDF. */
const HTML_DDG = `
<div class="result"><h2><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.inti.gob.ar%2Fcirsoc%2Fnota">CIRSOC — nota tecnica</a></h2><a class="result__snippet" href="#">reglamento argentino</a></div>
<div class="result"><h2><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.inpres.gob.ar%2Fzonificacion">INPRES — zonificacion sismica</a></h2><a class="result__snippet" href="#">zona sismica 4</a></div>`

const PAGINA = '<html><head><title>t</title></head><body>El reglamento CIRSOC 201 entrara en vigencia. Articulo 5.3. Zona sismica 4.</body></html>'
const htmlOk = (url) => ({ ok: true, url, status: 200, headers: { get: (h) => (h === 'content-type' ? 'text/html; charset=utf-8' : '') }, text: async () => PAGINA })

/** Las tres formas en que una fuente externa se cae. Son distintas y el motor tiene que sobrevivir
 *  a las tres: un 500 responde, un timeout aborta, y un DNS que no resuelve ni siquiera conecta. */
const CAIDAS = {
  '500': async () => ({ ok: false, status: 500, url: 'https://www.inpres.gob.ar/zonificacion' }),
  timeout: async () => { throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }) },
  dns: async () => { throw new Error('getaddrinfo ENOTFOUND www.inpres.gob.ar') },
}

function pdfCon(paginas) {
  const dir = tmp()
  const ruta = path.join(dir, 'doc.pdf')
  const guion = ['import fitz, sys, json', 'd = fitz.open()', 'for pag in json.loads(sys.argv[2]):',
    '    p = d.new_page()', '    y = 72', '    for linea in pag:',
    '        p.insert_text((50, y), linea)', '        y += 20', 'd.save(sys.argv[1])'].join('\n')
  execFileSync('python3', ['-c', guion, ruta, JSON.stringify(paginas)])
  return { bytes: fs.readFileSync(ruta), dir }
}

const FICHA = [[
  'Ficha tecnica del producto: Revestimiento acrilico ECO-500.',
  'Modo de empleo: aplicar con llana metalica sobre revoque fino seco.',
  'Consumo aproximado: 1,2 kg por m2 en dos manos.',
  'Rendimiento: 20 m2 por balde de 25 kg.',
  'No aplicar sobre superficies humedas ni con temperatura menor a 5 grados.',
]]

// ═══════════════════════ E · HAY WEB, NO HAY LLM ═══════════════════════

test('E · la cadena de estudio corre ENTERA sin proveedor de razonamiento y declara qué quedó sin razonar', async () => {
  const { bytes, dir } = pdfCon(FICHA)
  const r = await estudiar({
    url: 'https://www.fabricante.example.com/ficha.pdf', dir, pedir: null,
    fuentes: F.SEMILLA.map((f) => ({ ...f })), cuando: '2026-08-28',
    fetchImpl: async () => ({ ok: true, url: 'https://www.fabricante.example.com/ficha.pdf', arrayBuffer: async () => bytes }),
  })
  assert.equal(r.ok, true, 'sin modelo la investigación no se cae: llega a candidatos')
  assert.equal(r.pasos.find((p) => p.paso === PASO.CLASIFICACION).clase, 'FABRICANTE', 'clasificar no necesita modelo')
  const ex = r.pasos.find((p) => p.paso === PASO.EXTRACCION)
  assert.equal(ex.resultado, RESULTADO.DEGRADADO)
  assert.equal(ex.conModelo, false)
  assert.ok(ex.sinRazonamiento.includes('limitaciones'), `los campos que sólo salen razonando tienen que estar nombrados: ${JSON.stringify(ex.sinRazonamiento)}`)
  assert.ok(r.candidatos.length >= 2, 'y lo que sí sale con reglas sale igual')
  assert.ok(r.candidatos.every((c) => c.evidencia.textoLiteral), 'todo lo que salió trae su cita')
})

test('E · CASO CONTRARIO: con el modelo encendido la MISMA extracción deja de estar degradada', async () => {
  const { bytes, dir } = pdfCon(FICHA)
  const campos = ['uso', 'compatibilidad', 'limitaciones', 'metodo', 'fuente']
  const pedir = async () => ({
    texto: JSON.stringify(campos.map((campo) => ({ campo, valor: `valor de ${campo}`, textoLiteral: 'No aplicar sobre superficies humedas ni con temperatura menor a 5 grados.', pagina: 1 }))),
  })
  const r = await estudiar({
    url: 'https://www.fabricante.example.com/ficha.pdf', dir, pedir,
    fuentes: F.SEMILLA.map((f) => ({ ...f })),
    fetchImpl: async () => ({ ok: true, url: 'https://www.fabricante.example.com/ficha.pdf', arrayBuffer: async () => bytes }),
  })
  const ex = r.pasos.find((p) => p.paso === PASO.EXTRACCION)
  assert.equal(ex.resultado, RESULTADO.LOGRO, 'si estuviera SIEMPRE degradada, el test de arriba no mediría nada')
  assert.equal(ex.conModelo, true)
  assert.deepEqual(ex.sinRazonamiento, [])
  assert.ok(r.candidatos.some((c) => c.clave.endsWith('.limitaciones')))
})

test('E · un proveedor que EXPLOTA no rompe la cadena: degrada y dice por qué', async () => {
  const { bytes, dir } = pdfCon(FICHA)
  const r = await estudiar({
    url: 'https://www.fabricante.example.com/ficha.pdf', dir,
    pedir: async () => { throw new Error('402 sin saldo') },
    fuentes: F.SEMILLA.map((f) => ({ ...f })),
    fetchImpl: async () => ({ ok: true, url: 'https://www.fabricante.example.com/ficha.pdf', arrayBuffer: async () => bytes }),
  })
  assert.equal(r.ok, true)
  const ex = r.pasos.find((p) => p.paso === PASO.EXTRACCION)
  assert.equal(ex.resultado, RESULTADO.DEGRADADO)
  assert.match(ex.porQue, /402 sin saldo/, 'el motivo real tiene que llegar hasta la salida')
})

test('E · resolver() sale a la web sin modelo, trae las lecturas y DECLARA que nadie las interpretó', async () => {
  const dir = tmp()
  const fetchImpl = async (url) => (String(url).includes('duckduckgo') ? { ok: true, text: async () => HTML_DDG } : htmlOk(String(url)))
  const r = await resolver({
    necesidad: { clave: 'reglamento.cirsoc.vigencia', consulta: 'cirsoc 201 vigencia' },
    fuentes: F.SEMILLA.map((f) => ({ ...f })), fetchImpl, dir,
    permitirWeb: true, permitirModelo: false,
  })
  assert.equal(r.ok, true, 'la investigación tiene que seguir funcionando entera')
  assert.equal(r.via, VIA.BUSQUEDA_WEB)
  assert.ok(r.lecturas.filter((l) => l.ok).length >= 1)
  assert.ok(r.degradado, 'devolver texto crudo como si fuera una respuesta resuelta es fabricar cobertura')
  assert.deepEqual(r.degradado.escalones, [VIA.MODELO])
  assert.match(r.degradado.porQue, /no se interpret|sin proveedor de razonamiento/)
  assert.ok(r.degradado.loQueQuedoSinRazonamiento.length >= 1)
})

test('E · CASO CONTRARIO: con el modelo permitido la misma resolución NO se declara degradada', async () => {
  const dir = tmp()
  const fetchImpl = async (url) => (String(url).includes('duckduckgo') ? { ok: true, text: async () => HTML_DDG } : htmlOk(String(url)))
  const r = await resolver({
    necesidad: { clave: 'reglamento.cirsoc.vigencia', consulta: 'cirsoc 201 vigencia' },
    fuentes: F.SEMILLA.map((f) => ({ ...f })), fetchImpl, dir,
    permitirWeb: true, permitirModelo: true,
  })
  assert.equal(r.ok, true)
  assert.equal(r.via, VIA.BUSQUEDA_WEB)
  assert.equal(r.degradado, null, 'si `degradado` fuera siempre distinto de null, no sería una medición')
})

// ═══════════════════════ F · UNA FUENTE EXTERNA CAÍDA ═══════════════════════

for (const [comoSeCae, caida] of Object.entries(CAIDAS)) {
  test(`F · ${comoSeCae}: la fuente caída no se lleva la investigación — el resto sigue y se anota el fallo`, async () => {
    const dir = tmp()
    const fetchImpl = async (url) => {
      const u = String(url)
      if (u.includes('duckduckgo')) return { ok: true, text: async () => HTML_DDG }
      if (u.includes('inpres')) return caida(u)
      return htmlOk(u)
    }
    const r = await investigarWeb({ consulta: 'cirsoc vigencia', fuentes: F.SEMILLA.map((f) => ({ ...f })), fetchImpl, dir, aTraer: 2 })
    assert.equal(r.ok, true, 'una fuente caída NO puede tumbar la investigación entera')
    const buenas = r.lecturas.filter((l) => l.ok)
    const malas = r.lecturas.filter((l) => !l.ok)
    assert.equal(buenas.length, 1, `la fuente sana tiene que seguir leyéndose: ${JSON.stringify(r.lecturas.map((l) => [l.dominio, l.ok, l.porQue]))}`)
    assert.equal(buenas[0].dominio, 'inti.gob.ar')
    assert.equal(malas.length, 1)
    assert.equal(malas[0].dominio, 'inpres.gob.ar')
    assert.ok(malas[0].porQue, 'el motivo del fallo tiene que llegar, no perderse')
    const caidaEnPadron = r.fuentes.find((f) => f.dominio === 'inpres.gob.ar')
    assert.equal(caidaEnPadron.fallos, 1, 'un fallo se anota; uno solo puede ser la red')
    const sana = r.fuentes.find((f) => f.dominio === 'inti.gob.ar')
    assert.equal(sana.fallos, 0, 'la sana no se contamina con el fallo de la otra')
    assert.equal(sana.estado, F.ESTADO.EVALUADA)
  })
}

test('F · dos caídas seguidas DEGRADAN la fuente en el padrón — y la que responde no se degrada', async () => {
  const dir = tmp()
  const fetchImpl = async (url) => {
    const u = String(url)
    if (u.includes('duckduckgo')) return { ok: true, text: async () => HTML_DDG }
    if (u.includes('inpres')) return { ok: false, status: 503, url: u }
    return htmlOk(u)
  }
  let fuentes = F.SEMILLA.map((f) => ({ ...f }))
  for (const consulta of ['cirsoc vigencia', 'zona sismica san juan']) {
    const r = await investigarWeb({ consulta, fuentes, fetchImpl, dir, aTraer: 2 })
    fuentes = r.fuentes
  }
  const caida = fuentes.find((f) => f.dominio === 'inpres.gob.ar')
  assert.equal(caida.fallos, 2)
  assert.equal(caida.estado, F.ESTADO.DEGRADADA, 'dos fallos ya no son la red: es la fuente')
  const sana = fuentes.find((f) => f.dominio === 'inti.gob.ar')
  assert.equal(sana.estado, F.ESTADO.CURADA, 'la que sirvió dos veces sube; si todas terminaran degradadas el control no distinguiría nada')
  // Y degradada NO es borrada: se sigue consultando, última y con aviso.
  assert.ok(F.ordenar(fuentes).map((f) => f.dominio).includes('inpres.gob.ar'))
})

test('F · el FALLO NO SE CACHEA: la fuente caída se vuelve a intentar, no queda muerta para siempre', async () => {
  const dir = tmp()
  let intentos = 0
  const fetchImpl = async (url) => {
    const u = String(url)
    if (u.includes('duckduckgo')) return { ok: true, text: async () => HTML_DDG }
    if (u.includes('inpres')) { intentos += 1; return { ok: false, status: 500, url: u } }
    return htmlOk(u)
  }
  const fuentes = F.SEMILLA.map((f) => ({ ...f }))
  await investigarWeb({ consulta: 'cirsoc vigencia', fuentes, fetchImpl, dir, aTraer: 2 })
  await investigarWeb({ consulta: 'cirsoc vigencia', fuentes, fetchImpl, dir, aTraer: 2 })
  assert.equal(intentos, 2, 'un fallo de red cacheado es un fallo de red permanente')
})

test('F · CASO CONTRARIO: la lectura que SÍ salió bien se cachea — si no, no habría caché', async () => {
  const dir = tmp()
  let intentos = 0
  const fetchImpl = async (url) => {
    const u = String(url)
    if (u.includes('duckduckgo')) return { ok: true, text: async () => HTML_DDG }
    if (u.includes('inti')) { intentos += 1; return htmlOk(u) }
    return { ok: false, status: 500, url: u }
  }
  const fuentes = F.SEMILLA.map((f) => ({ ...f }))
  await investigarWeb({ consulta: 'cirsoc vigencia', fuentes, fetchImpl, dir, aTraer: 2 })
  const dos = await investigarWeb({ consulta: 'cirsoc vigencia', fuentes, fetchImpl, dir, aTraer: 2 })
  assert.equal(intentos, 1, 'la segunda vez sale del caché')
  assert.equal(dos.lecturas.find((l) => l.dominio === 'inti.gob.ar').deCache, true)
})

test('F · una fuente caída en el ESTUDIO corta la cadena con su motivo y no inventa un documento', async () => {
  const dir = tmp()
  const fuentes = F.SEMILLA.map((f) => ({ ...f }))
  const r = await estudiar({ url: 'https://www.inpres.gob.ar/reglamento.pdf', fuentes, dir, fetchImpl: CAIDAS.dns })
  assert.equal(r.ok, false)
  const adq = r.pasos.find((p) => p.paso === PASO.ADQUISICION)
  assert.equal(adq.resultado, RESULTADO.NO_LOGRO)
  assert.match(adq.porQue, /ENOTFOUND|no pude leer/)
  assert.equal(r.candidatos.length, 0)
  assert.equal(r.fuentes.find((f) => f.id === 'inpres').fallos, 1, 'el fallo queda anotado en el padrón')
  assert.equal(r.fuentes.find((f) => f.id === 'inpres').revisado, null, 'una fuente que no se pudo mirar NO queda revisada')
})
