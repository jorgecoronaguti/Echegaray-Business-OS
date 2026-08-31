// QUE LA BÚSQUEDA SEA POR ESPECIFICACIÓN, QUE NO ABRA MUROS, Y QUE LO QUE TRAIGA SEA OBSERVACIÓN.
//
// Sin red: el buscador y el lector se inyectan. La corrida contra internet de verdad está en
// `orquestador/scripts/buscar-precios-web.mjs` y su evidencia va al informe.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  consultasDeEspecificacion, urlsDeDuckDuckGo, urlsDeBing, motivoParaNoAbrir,
  observarPrecioWeb, buscador, TOPE_PAGINAS,
} from './precio-buscador-web.mjs'
import { TIPO_FUENTE } from './precio-observacion.mjs'

const PANEL = { codigo: '367', nombre: 'Panel Chapa Trape Blanco Pur 50 Mm Foil Blanco', unidad: 'm2', familia: 'MATERIAL' }

test('la consulta se arma con los ATRIBUTOS, no con el nombre literal del catálogo', () => {
  const { consultas, spec } = consultasDeEspecificacion({ recurso: PANEL })
  assert.ok(spec.atributos.includes('50mm'), `atributos=${spec.atributos}`)
  assert.match(consultas[0], /50 mm/, 'la medida viaja en la consulta tal como está escrita')
  assert.match(consultas[0], /precio por m2/)
  assert.match(consultas[0], /^comprar panel chapa trape/, 'el ORDEN del nombre se conserva: ordenado alfabéticamente empezaba con «blanco» y Bing devolvía empresas llamadas Blanco')
  assert.match(consultas[0], /Argentina/)
  // La consulta por nombre literal existe, pero es la ÚLTIMA: es la que no devuelve nada.
  assert.match(consultas[consultas.length - 1], /"Panel Chapa Trape Blanco Pur 50 Mm Foil Blanco"/)
})

test('el parser de DuckDuckGo saca las URLs reales del SERP', () => {
  const html = '<a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fproveedor.com.ar%2Fpanel&rut=x">p</a>'
  assert.deepEqual(urlsDeDuckDuckGo(html), ['https://proveedor.com.ar/panel'])
})

test('el parser de Bing desenvuelve el redirect en base64', () => {
  const b64 = Buffer.from('https://panelya.com.ar/').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  assert.deepEqual(urlsDeBing(`<a href="https://www.bing.com/ck/a?ptn=3&u=a1${b64}&ntb=1">x</a>`), ['https://panelya.com.ar/'])
})

test('un parser que deja de entender el SERP devuelve VACÍO, no basura', () => {
  assert.deepEqual(urlsDeBing('<html>bing cambió el formato</html>'), [])
  assert.deepEqual(urlsDeDuckDuckGo('<html>nada</html>'), [])
})

test('los dominios que devuelven un muro no se abren, y el motivo está MEDIDO', () => {
  assert.match(motivoParaNoAbrir('https://articulo.mercadolibre.com.ar/MLA-1'), /verificación de cuenta/)
  assert.match(motivoParaNoAbrir('https://www.facebook.com/x'), /login/)
  assert.equal(motivoParaNoAbrir('https://proveedor.com.ar/panel'), null)
})

test('SIN RED no pasa nada malo: lista vacía con su motivo, no una excepción', async () => {
  const r = await observarPrecioWeb({ recurso: PANEL })
  assert.deepEqual(r.observaciones, [])
  assert.match(r.porQue, /sin red/)
})

test('una página con precio produce una OBSERVACIÓN web, nunca un hecho de ECSAS', async () => {
  const buscar = async () => ({ urls: ['https://corralon-sanjuan.com.ar/panel-50'], motor: 'test', recorrido: [] })
  const leer = async (url) => ({
    contenido_externo: 'Panel trapezoidal PUR 50 mm. Precio $ 92.000 por m2 + IVA. Entrega inmediata.',
    url, obtenido_en: '2026-08-31T10:00:00Z', publicado_en: null,
  })
  const { observaciones, recorrido } = await observarPrecioWeb({ recurso: PANEL, buscar, leer, alicuotaIva: 0.21 })
  assert.equal(observaciones.length, 1)
  const o = observaciones[0]
  assert.equal(o.valor, 92_000)
  assert.equal(o.unidad, 'm2')
  assert.equal(o.tipoFuente, TIPO_FUENTE.WEB)
  assert.equal(o.esExperienciaEcsas, false, 'una página NUNCA es experiencia de ECSAS')
  assert.equal(o.jurisdiccion, 'AR-SJ')
  assert.equal(o.flete, 'NO_DECLARADO', 'suponer el flete incluido baja el costo sin que nadie lo decida')
  assert.equal(o.procedencia.motor, 'test')
  assert.ok(recorrido.some((p) => p.paso === 'LEER' && p.ok))
})

test('una página SIN IVA declarado no produce observación, y el motivo queda escrito', async () => {
  const buscar = async () => ({ urls: ['https://corralon.com.ar/panel'], motor: 'test', recorrido: [] })
  const leer = async (url) => ({ contenido_externo: 'Panel 50 mm $ 92.000 por m2', url, obtenido_en: '2026-08-31T10:00:00Z' })
  const { observaciones, recorrido } = await observarPrecioWeb({ recurso: PANEL, buscar, leer, alicuotaIva: 0.21 })
  assert.equal(observaciones.length, 0)
  assert.equal(recorrido.find((p) => p.paso === 'LEER').motivo, 'IVA_NO_DECLARADO')
})

test('una página de LISTADO con veinte precios no elige uno al azar', async () => {
  const buscar = async () => ({ urls: ['https://listado.com.ar/paneles'], motor: 'test', recorrido: [] })
  const leer = async (url) => ({ contenido_externo: 'Panel A $ 1.000 + IVA · Panel B $ 2.000 + IVA · Panel C $ 3.000 + IVA', url, obtenido_en: '2026-08-31T10:00:00Z' })
  const { observaciones, recorrido } = await observarPrecioWeb({ recurso: PANEL, buscar, leer, alicuotaIva: 0.21 })
  assert.equal(observaciones.length, 0)
  assert.equal(recorrido.find((p) => p.paso === 'LEER').motivo, 'VARIOS_MONTOS')
})

test('una página que no abre no frena las otras', async () => {
  const buscar = async () => ({ urls: ['https://rota.com.ar/x', 'https://buena.com.ar/y'], motor: 'test', recorrido: [] })
  const leer = async (url) => (url.includes('rota')
    ? { error: 'respondió 503' }
    : { contenido_externo: 'Panel 50 mm $ 90.000 por m2 más IVA', url, obtenido_en: '2026-08-31T10:00:00Z' })
  const { observaciones, recorrido } = await observarPrecioWeb({ recurso: PANEL, buscar, leer, alicuotaIva: 0.21 })
  assert.equal(observaciones.length, 1)
  assert.equal(recorrido.filter((p) => p.paso === 'LEER' && !p.ok).length, 1)
})

test('no se abren más de TOPE_PAGINAS por recurso', async () => {
  const muchas = Array.from({ length: 30 }, (_, i) => `https://sitio${i}.com.ar/x`)
  const buscar = async () => ({ urls: muchas, motor: 'test', recorrido: [] })
  let abiertas = 0
  const leer = async () => { abiertas += 1; return { error: 'nada' } }
  await observarPrecioWeb({ recurso: PANEL, buscar, leer })
  assert.equal(abiertas, TOPE_PAGINAS)
})

test('el buscador prueba el segundo motor cuando el primero no devuelve nada', async () => {
  // Bing va primero por medición (DDG devuelve 202 desde esta red): acá se simula que Bing no trae
  // nada y el mecanismo tiene que caer a DuckDuckGo en vez de rendirse.
  const fetchImpl = async (url) => ({
    status: 200,
    text: async () => (url.includes('bing')
      ? '<html>sin resultados</html>'
      : '<a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fok.com.ar%2F">x</a>'),
  })
  const r = await buscador({ fetchImpl, esperaMs: 0 })('panel 50mm')
  assert.equal(r.motor, 'duckduckgo')
  assert.deepEqual(r.urls, ['https://ok.com.ar/'])
  assert.equal(r.recorrido.length, 2)
  assert.equal(r.recorrido[0].urls, 0)
})

test('el separador HTML-escapado de Bing no se pierde: era CERO resultados sobre dieciocho', () => {
  const b64 = Buffer.from('https://corralon.com.ar/x').toString('base64url')
  assert.deepEqual(urlsDeBing(`<a href="/ck/a?ptn=3&amp;u=a1${b64}&amp;ntb=1">x</a>`), ['https://corralon.com.ar/x'])
})

test('la unidad de conteo no produce «precio por un», que el buscador lee como ruido', () => {
  const { consultas } = consultasDeEspecificacion({ recurso: { codigo: '154', nombre: 'PLACA DE YESO 12,5 X 2,4 X 1,2', unidad: 'un' } })
  assert.doesNotMatch(consultas[0], /precio por un\b/)
  assert.match(consultas[0], /precio unidad/)
  // Y las medidas peladas, que son TODA la especificación de esta placa, entran a la consulta.
  assert.match(consultas[0], /12,5/)
  assert.match(consultas[0], /2,4/)
})

test('el buscador ya filtra los muros: no gasta lecturas en ellos', async () => {
  const fetchImpl = async () => ({ status: 200, text: async () => '<a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Farticulo.mercadolibre.com.ar%2FMLA-1">x</a>' })
  const r = await buscador({ fetchImpl, esperaMs: 0 })('panel')
  assert.deepEqual(r.urls, [])
})
