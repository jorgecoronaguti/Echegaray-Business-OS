// QUE UN TOTAL NO SE HAGA PASAR POR UNA COTIZACIÓN.
//
// La prueba que importa es la primera: con la mitad del cómputo resuelto el resultado tiene que
// decir INCOMPLETA. Si alguien baja el umbral o cambia el denominador para que dé lindo, se pone
// roja — y ése es exactamente el cambio que hay que impedir.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { controlar, medirCobertura, supuestosOcultos, preguntas, UMBRAL_COBERTURA, ESTADO_COTIZACION } from './control.mjs'
import { ESTADO } from './seleccion.mjs'
import { FUENTE } from './fuente.mjs'

const item = (id, valor, fuente = FUENTE.CALCULADO) => ({ id, nombre: `Elemento ${id}`, unidad: 'm3', cantidad: valor === null ? null : { valor, fuente } })
const mapeo = (elemento, estado, extra = {}) => ({ elemento, estado, computo: { nombre: `Elemento ${elemento}` }, candidatos: [], ...extra })

test('CON LA MITAD DEL CÓMPUTO RESUELTO, LA COTIZACIÓN ES INCOMPLETA', () => {
  const r = controlar({
    computo: { detectados: 10, items: [item('A', 1), item('B', 2), item('C', null), item('D', null)] },
    mapeo: { mapeos: [mapeo('A', ESTADO.MAPEADA), mapeo('B', ESTADO.AMBIGUO)] },
  })
  assert.equal(r.estado, ESTADO_COTIZACION.INCOMPLETA)
  assert.equal(r.cobertura.resueltos, 1)
  assert.equal(r.cobertura.detectados, 10)
  assert.match(r.porQue, /de los 10 elementos detectados/)
})

test('EL DENOMINADOR ES LO QUE EL PLANO TIENE, no lo que salió bien', () => {
  // Contar la cobertura sobre los elementos que se lograron computar da siempre 100% y no mide nada.
  const c = medirCobertura({ detectados: 46, items: [item('A', 1)], mapeos: [mapeo('A', ESTADO.MAPEADA)] })
  assert.equal(c.detectados, 46)
  assert.ok(c.cobertura < 0.1)
  assert.equal(c.alcanza, false)
})

test('con cobertura por encima del umbral y sin supuestos ocultos, sale COMPLETA y dice por qué', () => {
  const items = Array.from({ length: 10 }, (_, i) => item(`E${i}`, i + 1))
  const mapeos = items.map((i) => mapeo(i.id, ESTADO.MAPEADA))
  const r = controlar({ computo: { detectados: 10, items }, mapeo: { mapeos } })
  assert.equal(r.estado, ESTADO_COTIZACION.COMPLETA)
  assert.equal(r.cobertura.cobertura, 1)
  assert.match(r.porQue, /quedaron con cantidad y con partida/)
  assert.ok(UMBRAL_COBERTURA >= 0.9, 'el umbral no puede aflojarse para que un proyecto pase')
})

test('UN SUPUESTO OCULTO TIRA LA COTIZACIÓN ABAJO aunque la cobertura sea perfecta', () => {
  const items = Array.from({ length: 10 }, (_, i) => item(`E${i}`, i + 1))
  items[3] = item('E3', 99, FUENTE.INFERIDO)
  const r = controlar({ computo: { detectados: 10, items }, mapeo: { mapeos: items.map((i) => mapeo(i.id, ESTADO.MAPEADA)) } })
  assert.equal(r.estado, ESTADO_COTIZACION.INCOMPLETA)
  assert.equal(r.supuestosOcultos.length, 1)
  assert.equal(r.supuestosOcultos[0].elemento, 'E3')
  assert.match(r.porQue, /no está declarada como supuesto/)
})

test('un supuesto DECLARADO no es un supuesto oculto: se ve, y por eso no rompe nada', () => {
  assert.equal(supuestosOcultos([item('A', 5, FUENTE.SUPUESTO)]).length, 0)
  assert.equal(supuestosOcultos([item('A', 5, FUENTE.FALTA_DATO)]).length, 0)
  assert.equal(supuestosOcultos([item('A', 5, FUENTE.INFERIDO)]).length, 1)
  assert.equal(supuestosOcultos([item('A', null, FUENTE.INFERIDO)]).length, 0, 'sin cantidad no hay número que se cuele')
})

test('LAS PREGUNTAS SE COLAPSAN POR TEXTO: el mismo espesor preguntado tres veces es UNA pregunta', () => {
  const falta = { atributo: 'espesor_m', literal: '50cm' }
  const p = preguntas({
    mapeos: [
      mapeo('P1', ESTADO.PARTIDA_CANDIDATA, { faltan: [falta] }),
      mapeo('P2', ESTADO.PARTIDA_CANDIDATA, { faltan: [falta] }),
      mapeo('P3', ESTADO.PARTIDA_CANDIDATA, { faltan: [falta] }),
    ],
  })
  assert.equal(p.length, 1)
  assert.equal(p[0].destraba.length, 3)
  assert.match(p[0].pregunta, /espesor/)
})

test('primero va la pregunta que destraba más partidas', () => {
  const p = preguntas({
    mapeos: [
      mapeo('A', ESTADO.PARTIDA_CANDIDATA, { faltan: [{ atributo: 'espesor_m', literal: '50cm' }] }),
      mapeo('B', ESTADO.PARTIDA_CANDIDATA, { faltan: [{ atributo: 'espesor_m', literal: '50cm' }] }),
      mapeo('C', ESTADO.PARTIDA_CANDIDATA, { faltan: [{ atributo: 'ubicacion', literal: 'exteriores' }] }),
    ],
  })
  assert.equal(p[0].destraba.length, 2)
  assert.equal(p[1].destraba.length, 1)
})

test('cada pregunta dice QUIÉN la contesta — una pregunta sin dueño no se contesta nunca', () => {
  const p = preguntas({
    mapeos: [mapeo('A', ESTADO.AMBIGUO, { candidatos: [{ codigo: 'T1' }, { codigo: 'T2' }] })],
    procesos: [{ elemento: 'B', tarea: 'Excavación', unidad: 'm3', cantidad: null, porQueFalta: 'falta el sobreancho', quienLoTiene: 'dirección técnica / proyecto' }],
  })
  assert.ok(p.every((x) => x.quienLoTiene))
  assert.ok(p.some((x) => x.origen === 'empate entre partidas'))
  assert.ok(p.some((x) => x.origen === 'proceso derivado'))
})

test('el resumen entra en una línea y no esconde ninguno de los cuatro números', () => {
  const r = controlar({
    computo: { detectados: 46, items: [item('A', 1)] },
    mapeo: { mapeos: [mapeo('A', ESTADO.MAPEADA)] },
    omisionesCircot: [{ codigo: 'X' }],
  })
  assert.match(r.resumen, /INCOMPLETA/)
  assert.match(r.resumen, /cobertura 2% \(1\/46\)/)
  assert.match(r.resumen, /supuestos ocultos 0/)
  assert.match(r.resumen, /omisiones CIRCOT a confirmar 1/)
})

test('DOS CONTROLES IDÉNTICOS dan exactamente lo mismo', () => {
  const entrada = { computo: { detectados: 3, items: [item('A', 1), item('B', 2)] }, mapeo: { mapeos: [mapeo('A', ESTADO.MAPEADA), mapeo('B', ESTADO.AMBIGUO)] } }
  assert.deepEqual(controlar(entrada), controlar(entrada))
})
