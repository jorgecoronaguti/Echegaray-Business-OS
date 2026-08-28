// LA WEB ES REFERENCIA, NUNCA HECHO — y el orden de la cascada es lo que respalda cada número.
//
// El test no abre internet: inyecta el buscador y el lector. Lo que se prueba acá es el CRITERIO
// —qué se consulta antes que qué, qué autoridad tiene cada fuente y qué no puede reclamar para sí
// lo que viene de afuera—, no que la red funcione. La prueba de que la red funciona es una corrida
// real, y está en el informe con su URL.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  autoridadDe, dominioDe, ordenarPorAutoridad, investigar, datoDeWeb, resolvedorWeb,
  AUTORIDAD, NOMBRE_AUTORIDAD, PASOS,
} from './investigacion.mjs'
import { FUENTE } from './fuente.mjs'
import { aplicarPoliticaContenidoExterno } from '../web/contenido-externo.mjs'

test('LA AUTORIDAD SALE DEL DOMINIO: el INTI no vale lo mismo que un blog', () => {
  assert.equal(autoridadDe('https://www.inti.gob.ar/assets/cirsoc/101.pdf').autoridad, AUTORIDAD.ORGANISMO_TECNICO)
  assert.equal(autoridadDe('https://servicios.infoleg.gob.ar/anexos/res11.pdf').autoridad, AUTORIDAD.OFICIAL)
  assert.equal(autoridadDe('https://www.unsj.edu.ar/circot').autoridad, AUTORIDAD.ORGANISMO_TECNICO)
  assert.equal(autoridadDe('https://blogdeconstruccion.com/hormigon').autoridad, AUTORIDAD.SECUNDARIA)
  assert.equal(dominioDe('https://www.inti.gob.ar/x'), 'inti.gob.ar')
})

test('un dominio desconocido NO se declara sin autoridad: se declara SECUNDARIA y se dice por qué', () => {
  const a = autoridadDe('https://materialesdelsur.com.ar/precios')
  assert.equal(a.autoridad, AUTORIDAD.SECUNDARIA)
  assert.match(a.porQue, /se usa sólo si no hay nada mejor/)
})

test('EL FABRICANTE SE RECONOCE POR LA PISTA DEL PEDIDO, no se adivina', () => {
  assert.equal(autoridadDe('https://www.acindar.com.ar/ficha').autoridad, AUTORIDAD.SECUNDARIA, 'sin pista es una .com.ar más')
  assert.equal(autoridadDe('https://www.acindar.com.ar/ficha', { pistasFabricante: ['Acindar'] }).autoridad, AUTORIDAD.FABRICANTE)
  assert.equal(autoridadDe('https://reventa.com.ar/acindar', { pistasFabricante: ['Acindar'] }).autoridad, AUTORIDAD.SECUNDARIA, 'la marca tiene que estar en el DOMINIO, no en la ruta')
})

test('las fuentes se ordenan por autoridad y, a igualdad, por frescura — con desempate total', () => {
  const o = ordenarPorAutoridad([
    { url: 'https://blog.com/a', frescura: { dias: 1 } },
    { url: 'https://www.inti.gob.ar/b', frescura: { dias: 900 } },
    { url: 'https://www.inti.gob.ar/a', frescura: { dias: 900 } },
    { url: 'https://servicios.infoleg.gob.ar/c', frescura: { dias: 4000 } },
  ])
  assert.deepEqual(o.map((x) => x.url), [
    'https://servicios.infoleg.gob.ar/c',
    'https://www.inti.gob.ar/a',
    'https://www.inti.gob.ar/b',
    'https://blog.com/a',
  ])
})

test('LA CASCADA SE DETIENE EN EL PRIMER PASO QUE RESUELVE y no consulta internet de gusto', async () => {
  let webLlamada = false
  const r = await investigar({
    pregunta: '¿de qué resistencia es el hormigón?',
    resolvedores: {
      DOCUMENTACION_PROYECTO: () => ({ resuelto: true, valor: 'H25', porQue: 'lo dice la memoria' }),
      WEB: () => { webLlamada = true; return { resuelto: true, valor: 'H21' } },
    },
  })
  assert.equal(r.resueltoEn, 'DOCUMENTACION_PROYECTO')
  assert.equal(r.dato.valor, 'H25')
  assert.equal(webLlamada, false, 'la web es el ÚLTIMO recurso: consultarla teniéndolo degrada la procedencia')
})

test('el recorrido distingue «no había con qué probar» de «se probó y no estaba»', async () => {
  const r = await investigar({
    pregunta: 'x',
    resolvedores: { BASE_MAESTRA: () => ({ resuelto: false, porQue: 'no hay tarea que lo mencione' }) },
  })
  const porPaso = Object.fromEntries(r.recorrido.map((p) => [p.paso, p.estado]))
  assert.equal(porPaso.BASE_MAESTRA, 'NO_RESUELVE')
  assert.equal(porPaso.WEB, 'SIN_RESOLVEDOR')
  assert.equal(r.recorrido.length, PASOS.length, 'el recorrido completo, siempre')
})

test('si NINGÚN paso resuelve, el resultado es FALTA_DATO con dueño — nunca un valor plausible', async () => {
  const r = await investigar({ pregunta: '¿cuál es la cuantía de la base B1?', resolvedores: {} })
  assert.equal(r.resueltoEn, null)
  assert.equal(r.dato.fuente, FUENTE.FALTA_DATO)
  assert.equal(r.dato.valor, null)
  assert.equal(r.dato.quienLoTiene, 'proyecto / dirección técnica')
})

test('un resolvedor que explota NO tumba la cascada: queda anotado y se sigue', async () => {
  const r = await investigar({
    pregunta: 'x',
    resolvedores: {
      BASE_MAESTRA: () => { throw new Error('la base no responde') },
      WEB: () => ({ resuelto: true, valor: 'algo' }),
    },
  })
  assert.equal(r.recorrido.find((p) => p.paso === 'BASE_MAESTRA').estado, 'ERROR')
  assert.equal(r.resueltoEn, 'WEB')
})

test('LO QUE VIENE DE LA WEB NO ASCIENDE A HECHO ECSAS, lo pida quien lo pida', () => {
  const envuelto = aplicarPoliticaContenidoExterno({
    texto: 'la sobrecarga es 30 kg/m2', origen: 'web', url: 'https://www.inti.gob.ar/cirsoc101.pdf',
    titulo: 'CIRSOC 101', tipo: 'HECHO',
  })
  const d = datoDeWeb(envuelto)
  assert.equal(d.fuente, FUENTE.WEB)
  assert.equal(d.esHechoEcsas, false)
  assert.deepEqual(d.noAsciende, ['HECHO ECSAS', 'EXPERIENCIA ECSAS', 'NORMA'])
  assert.equal(d.autoridad, 'ORGANISMO_TECNICO')
  assert.equal(envuelto.tipo, 'REFERENCIA_EXTERNA', 'pidió HECHO y la política se lo corrigió')
})

test('sin fecha de publicación NO se afirma vigencia', () => {
  const d = datoDeWeb(aplicarPoliticaContenidoExterno({ texto: 'x', url: 'https://www.inti.gob.ar/a' }))
  assert.equal(d.publicadoEn, null)
  assert.match(d.frescura.etiqueta, /no se puede afirmar vigencia/)
})

test('EL RESOLVEDOR WEB LEE LA PÁGINA DE MAYOR AUTORIDAD, no la primera que apareció', async () => {
  let leida = null
  const r = await resolvedorWeb({
    buscar: async () => ({ text: 'ver https://blogcualquiera.com/a y también https://www.inti.gob.ar/cirsoc.pdf' }),
    leer: async (u) => { leida = u; return aplicarPoliticaContenidoExterno({ texto: 'contenido oficial', url: u, titulo: 'CIRSOC' }) },
    politica: aplicarPoliticaContenidoExterno,
  })({ pregunta: 'sobrecarga de cubierta' })
  assert.equal(leida, 'https://www.inti.gob.ar/cirsoc.pdf')
  assert.equal(r.resuelto, true)
  assert.equal(r.extra.autoridad, 'ORGANISMO_TECNICO')
  assert.equal(r.extra.leidaLaPagina, true)
  assert.ok(r.evidencia.ubicacion, 'la evidencia lleva la URL: sin dirección no se puede releer')
})

test('si la búsqueda no devuelve URLs, el resultado se declara orientación y NO evidencia', async () => {
  const r = await resolvedorWeb({
    buscar: async () => ({ text: 'según el CIRSOC la sobrecarga es de 30 kg/m2' }),
    politica: aplicarPoliticaContenidoExterno,
  })({ pregunta: 'x' })
  assert.equal(r.resuelto, true)
  assert.match(r.porQue, /sin una URL citable — es orientación, no evidencia/)
})

test('si la página no abre, queda el resumen de la búsqueda y no se pierde la consulta', async () => {
  const r = await resolvedorWeb({
    buscar: async () => ({ text: 'ver https://www.inti.gob.ar/cirsoc.pdf' }),
    leer: async () => { throw new Error('404') },
    politica: aplicarPoliticaContenidoExterno,
  })({ pregunta: 'x' })
  assert.equal(r.resuelto, true)
  assert.equal(r.extra.leidaLaPagina, false)
})

test('una búsqueda vacía NO resuelve: la cascada tiene que poder terminar en FALTA_DATO', async () => {
  const r = await resolvedorWeb({ buscar: async () => ({ text: '   ' }), politica: aplicarPoliticaContenidoExterno })({ pregunta: 'x' })
  assert.equal(r.resuelto, false)
})

test('los nombres de autoridad son los que se imprimen: no hay número suelto en la salida', () => {
  assert.equal(NOMBRE_AUTORIDAD[AUTORIDAD.OFICIAL], 'OFICIAL')
  assert.equal(NOMBRE_AUTORIDAD[AUTORIDAD.SECUNDARIA], 'SECUNDARIA')
})
