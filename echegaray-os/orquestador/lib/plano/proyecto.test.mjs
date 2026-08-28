// COMPLETAR NO ES CONTRADECIR — y el sistema tiene que saber la diferencia.
//
// Las dos primeras pruebas son el caso exacto que pidió el dueño y son opuestas entre sí: el mismo
// par de documentos produce un dato respaldado en un caso y un conflicto abierto en el otro, y lo
// único que cambia es si el plano dijo algo distinto o no dijo nada.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hecho, consolidar, mismoValor, frases, hechosDeTexto, hechosDeCad, armarProyecto, hechosDe,
  CLASE_FUENTE, ESTADO_HECHO, alcanceDe,
} from './proyecto.mjs'

const delPlano = (atributo, valor, elemento = 'V1') => hecho({ elemento, atributo, valor, clase: CLASE_FUENTE.PLANO, documento: 'Plano de Estructura.pdf', textoLiteral: `${elemento} ${valor}` })
const deLaMemoria = (atributo, valor, elemento = 'V1') => hecho({ elemento, atributo, valor, clase: CLASE_FUENTE.MEMORIA, documento: 'Memoria de cálculo.pdf', textoLiteral: `las ${elemento} se ejecutan en ${valor}` })

test('LA MEMORIA COMPLETA AL PLANO: si el plano no dice la resistencia, vale la de la memoria', () => {
  const r = consolidar([delPlano('material', 'hormigon_armado'), deLaMemoria('resistencia', 'H25')])
  const res = r.hechos.find((h) => h.atributo === 'resistencia')
  assert.equal(res.valor, 'H25')
  assert.equal(res.estado, ESTADO_HECHO.COMPLETADO)
  assert.equal(res.clase, 'MEMORIA')
  assert.equal(r.conflictos.length, 0, 'completar no es contradecir: no hay nada que avisar')
  assert.match(res.porQue, /ninguna otra fuente lo contradice/)
})

test('LA MEMORIA CONTRADICE AL PLANO: H-21 contra H-25 es CONFLICTO, no una elección silenciosa', () => {
  const r = consolidar([delPlano('resistencia', 'H21'), deLaMemoria('resistencia', 'H25')])
  assert.equal(r.conflictos.length, 1)
  const c = r.conflictos[0]
  assert.equal(c.estado, ESTADO_HECHO.CONFLICTO)
  assert.equal(c.versiones.length, 2)
  assert.deepEqual(c.versiones.map((v) => v.valor).sort(), ['H21', 'H25'])
  assert.match(c.porQue, /PLANO dice «H21»/)
  assert.match(c.porQue, /MEMORIA dice «H25»/)
  assert.ok(c.quienLoResuelve)
  assert.equal(r.hechos.find((h) => h.atributo === 'resistencia').valor, null, 'un conflicto NO deja un valor usable: dejarlo sería elegir')
})

test('dos fuentes que coinciden dan CONFIRMADO y suman respaldo, no ruido', () => {
  const r = consolidar([delPlano('resistencia', 'H21'), deLaMemoria('resistencia', 'H21')])
  const h = r.hechos[0]
  assert.equal(h.estado, ESTADO_HECHO.CONFIRMADO)
  assert.equal(h.respaldo.length, 2)
  assert.equal(r.conflictos.length, 0)
})

test('una cota de 6,000111 y una de 6,00 son la misma cota — el CAD arrastra decimales, no discrepa', () => {
  assert.equal(mismoValor(6.000111, 6.0), true)
  assert.equal(mismoValor(6.08, 6.0), false)
  assert.equal(mismoValor('H21', 'h-21'), true, 'el texto se normaliza antes de comparar')
  assert.equal(mismoValor('H21', 'H25'), false)
})

test('un hecho SIN texto literal no entra: un conflicto que nadie puede releer no se puede resolver', () => {
  assert.equal(hecho({ atributo: 'resistencia', valor: 'H21', clase: CLASE_FUENTE.PLANO, documento: 'x.pdf', textoLiteral: '' }), null)
  assert.equal(hecho({ atributo: 'resistencia', valor: 'H21', clase: CLASE_FUENTE.PLANO, textoLiteral: 'dice H21' }), null, 'sin documento tampoco')
  assert.equal(hecho({ atributo: 'resistencia', valor: null, clase: CLASE_FUENTE.PLANO, documento: 'x.pdf', textoLiteral: 'dice' }), null, 'sin valor no hay hecho')
})

test('EL PLIEGO SE LEE FRASE POR FRASE y cada especificación queda atada a su pieza', () => {
  const texto = [
    'Las columnas se ejecutarán en hormigón H-21 con acero ADN 420.',
    'La mampostería será de ladrillón a revocar en ambas caras.',
    'La excavación de zanjas se realizará a mano.',
  ].join(' ')
  const h = hechosDeTexto(texto, { documento: 'Pliego.docx', clase: CLASE_FUENTE.PLIEGO })
  const porPieza = Object.fromEntries(h.map((x) => [`${x.elemento}:${x.atributo}`, x.valor]))
  assert.equal(porPieza['columna:resistencia'], 'H21')
  assert.equal(porPieza['muro:terminacion'], 'a_revocar')
  assert.equal(porPieza['movimiento_suelo:metodo'], 'manual')
  assert.ok(h.every((x) => x.textoLiteral), 'cada especificación viaja con la frase que la sostiene')
})

test('una especificación sin pieza vale para todo el proyecto y se marca como tal', () => {
  const h = hechosDeTexto('Todo el hormigón de la obra será H-30.', { documento: 'Pliego.docx' })
  assert.ok(h.length >= 1)
  assert.equal(h[0].elemento, null)
  assert.equal(h[0].que.startsWith('*:'), true)
})

test('las frases cortas se descartan: «H-21» suelto no es una especificación', () => {
  assert.deepEqual(frases('a. b. c'), [])
  assert.equal(frases('Las columnas serán H-21 según cálculo').length, 1)
})

test('EL CAD APORTA LA UNIDAD DE DIBUJO Y CUÁNTOS HAY DE CADA BLOQUE', () => {
  const h = hechosDeCad({
    unidadDibujo: 'm',
    bloques: [{ bloque: 'CORREA', cantidad: 12, capas: ['ESTRUCTURA'] }, { bloque: '*U22', cantidad: 6 }, { bloque: 'VACIO', cantidad: 0 }],
    cotas: [{ x: 10, y: 20, medida_m: 6.08 }],
  }, { documento: 'ESTRUCTURA.dwg' })
  assert.equal(h.length, 2, 'la unidad y UN bloque real')
  assert.equal(h[0].atributo, 'unidad_dibujo')
  assert.equal(h[1].elemento, 'CORREA')
  assert.equal(h[1].valor, 12)
  assert.match(h[1].textoLiteral, /12 inserción\(es\) del bloque «CORREA»/)
})

test('LAS COTAS NO ENTRAN COMO HECHOS: son evidencia de una medida, no una afirmación sobre un atributo', () => {
  // Medido: metiendo las 966 cotas del DWG de Quattropani con la coordenada por clave, salían 67
  // CONFLICTOS FALSOS —dos cotas de dibujos distintos en coordenadas cercanas leídas como dos
  // fuentes contradiciéndose—, y como un conflicto bloquea la cotización, el ruido tapaba los
  // conflictos de verdad.
  const h = hechosDeCad({ unidadDibujo: 'm', cotas: [{ x: 1418, y: 2180, medida_m: 2.0095 }, { x: 1422, y: 2180, medida_m: 2.352 }] }, { documento: 'X.dwg' })
  assert.equal(h.length, 1, 'sólo la unidad de dibujo')
  assert.equal(consolidar(h).conflictos.length, 0)
})

test('los bloques ANÓNIMOS de AutoCAD no son piezas del proyecto', () => {
  const h = hechosDeCad({ bloques: [{ bloque: '*U22', cantidad: 6 }, { bloque: '*D3', cantidad: 4 }] }, { documento: 'X.dwg' })
  assert.equal(h.length, 0, '«*U22» es geometría agrupada por el editor, no una partida')
})

test('DOS CAD QUE DICEN CANTIDADES DISTINTAS DEL MISMO BLOQUE sí es un conflicto real', () => {
  const a = hechosDeCad({ bloques: [{ bloque: 'CORREA', cantidad: 12 }] }, { documento: 'A.dwg' })
  const b = hechosDeCad({ bloques: [{ bloque: 'CORREA', cantidad: 14 }] }, { documento: 'B.dwg' })
  const r = consolidar([...a, ...b])
  assert.equal(r.conflictos.length, 1)
  assert.match(r.conflictos[0].porQue, /cantidad_insertada de CORREA/)
})

test('el proyecto entero se arma con sus conflictos AFUERA y visibles', () => {
  const p = armarProyecto({
    documentos: ['a.pdf', 'b.dwg', 'c.docx'],
    hechos: [delPlano('resistencia', 'H21'), deLaMemoria('resistencia', 'H25'), delPlano('material', 'hormigon_armado')],
  })
  assert.equal(p.documentos, 3)
  assert.equal(p.conflictos.length, 1)
  assert.match(p.resumen, /1 conflicto\(s\) sin resolver/)
  assert.equal(p.porClase.PLANO, 2)
  assert.equal(p.porClase.MEMORIA, 1)
})

test('lo propio del elemento gana sobre lo general — eso es lo que significa una excepción escrita', () => {
  const p = armarProyecto({
    hechos: [
      hecho({ elemento: null, atributo: 'resistencia', valor: 'H21', clase: CLASE_FUENTE.PLIEGO, documento: 'Pliego.docx', textoLiteral: 'todo el hormigón será H-21' }),
      hecho({ elemento: 'losa', atributo: 'resistencia', valor: 'H30', clase: CLASE_FUENTE.MEMORIA, documento: 'Memoria.pdf', textoLiteral: 'las losas serán H-30' }),
    ],
  })
  const deLaLosa = hechosDe(p, 'losa')
  assert.equal(deLaLosa.find((h) => h.atributo === 'resistencia').valor, 'H30')
  assert.equal(p.conflictos.length, 0, 'una excepción por elemento NO es un conflicto con la regla general')
})

test('DOS CONSOLIDACIONES IDÉNTICAS dan exactamente lo mismo, en el mismo orden', () => {
  const hs = [deLaMemoria('resistencia', 'H25'), delPlano('material', 'hormigon_armado'), delPlano('espesor_m', 0.2)]
  assert.deepEqual(consolidar(hs), consolidar([...hs].reverse()))
})

// ═══ G4 · LOS CONFLICTOS NO PUEDEN BAJAR POR DEJAR DE MIRAR ═══
//
// Una auditoría midió que la regla «pieza o cuantificador universal» descartaba frases como «El
// hormigón de los elementos estructurales será H-21» y «Se exige terminación fratasada» —y
// `terminacion` BLOQUEA una confirmación de partida—. Los conflictos habían bajado de 67 a 3 en
// parte por eso, que no es lo mismo que por dejar de equivocarse.

test('G4 · una frase con ALCANCE propio entra aunque no nombre la pieza', () => {
  const h = hechosDeTexto('El hormigón de los elementos estructurales será H-21.', { documento: 'Pliego.pdf' })
  const r = h.find((x) => x.atributo === 'resistencia')
  assert.ok(r, 'antes se descartaba entera')
  assert.equal(r.elemento, 'elementos_estructurales')
  assert.equal(r.valor, 'H21')
  assert.equal(alcanceDe('los muros exteriores'), 'exteriores')
})

test('G4 · un atributo BLOQUEANTE entra aunque la frase no tenga pieza ni alcance', () => {
  const h = hechosDeTexto('Se exige terminación fratasada en la obra completa.', { documento: 'Pliego.pdf' })
  assert.ok(h.some((x) => x.atributo === 'terminacion' && x.valor === 'fratasada'))
})

test('G4 · EL ALCANCE LE GANA AL CUANTIFICADOR: si no, la contradicción no se detecta nunca', () => {
  const h = [
    ...hechosDeTexto('El hormigón será H-30 en la totalidad de los elementos estructurales.', { documento: 'A.pdf' }),
    ...hechosDeTexto('El hormigón de los elementos estructurales será H-21.', { documento: 'B.pdf' }),
  ]
  const c = consolidar(h).conflictos.find((x) => x.atributo === 'resistencia')
  assert.ok(c, 'una en `*` y la otra en su alcance nunca chocan')
  assert.equal(c.elemento, 'elementos_estructurales')
  assert.deepEqual(c.versiones.map((v) => v.valor).sort(), ['H21', 'H30'])
})

test('G4 · UNA FRASE SUELTA NO CONTRADICE A NADIE: hacen falta fuentes que sepan de qué hablan', () => {
  // Trece frases de un pliego que mencionan un método caen en la misma clave y NO son trece
  // fuentes discutiendo: es contexto. Medido — eran el 100% del ruido nuevo sobre Quattropani.
  const sueltas = [
    ...hechosDeTexto('El trabajo se hará a mano donde convenga.', { documento: 'A.pdf' }),
    ...hechosDeTexto('La tarea se hará con máquina.', { documento: 'A.pdf' }),
  ]
  const r = consolidar(sueltas)
  assert.equal(r.conflictos.length, 0)
  const g = r.hechos.find((x) => x.atributo === 'metodo')
  assert.equal(g.estado, ESTADO_HECHO.SOLO_MENCIONES)
  assert.equal(g.valor, null, 'un conjunto de menciones sueltas NO deja un valor usable')
})

test('G4 · con UNA fuente con peso, las menciones sueltas se cuentan aparte y no tapan el conflicto', () => {
  const h = [
    ...hechosDeTexto('Todo se ejecutará con máquina.', { documento: 'A.pdf' }),
    ...hechosDeTexto('El zanjeo se hará a mano.', { documento: 'B.pdf' }),
    ...hechosDeTexto('El destape se hará a mano.', { documento: 'C.pdf' }),
  ]
  const c = consolidar(h).conflictos.find((x) => x.atributo === 'metodo')
  assert.ok(c)
  assert.ok(c.versiones.length <= 2, 'se listan las fuentes con peso, no la pared de repeticiones')
  assert.ok(c.mencionesSueltas >= 1)
  assert.match(c.porQue, /mención\(es\) sueltas/)
})
