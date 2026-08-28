// EL CAD CUENTA LO QUE LA VISTA NO PUDO — y no cuenta lo que no le corresponde.
//
// Las pruebas adversariales de este archivo son las de la mitad para abajo: lo que importa no es
// que un bloque llamado «C1» resuelva la columna C1, sino que un bloque llamado «Inodoro» NO
// resuelva la cantidad de una columna por el hecho de que las dos cosas se cuenten en unidades.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { marcasDe, esElMismo, resolverConCad } from './medicion-cad.mjs'
import { FUENTE } from './fuente.mjs'

const cad = (bloques, archivo = 'ESTRUCTURA.dwg', cotas = []) => [{ archivo, medicion: { bloques, cotas } }]
const elemento = (id, nombre, extra = {}) => ({ id, nombre, repeticion: { modo: 'indeterminable', cantidad: null }, ...extra })

test('LA MARCA ES LA SEÑAL MÁS FUERTE: la puso el proyectista para nombrar esa pieza', () => {
  assert.deepEqual(marcasDe('Columna C1 de hormigón'), ['C1'])
  assert.deepEqual(marcasDe('Correa 2K1'), ['2K1'])
  assert.deepEqual(marcasDe('Base B0 tipo I'), ['B0'])
  assert.deepEqual(marcasDe('Muro de ladrillón'), [], 'sin número no hay marca')
})

test('un bloque y un elemento con la misma marca SON la misma pieza', () => {
  const r = esElMismo(elemento('C1', 'Columna de hormigón C1'), { bloque: 'C1' })
  assert.equal(r.es, true)
  assert.equal(r.via, 'MARCA')
  assert.match(r.porQue, /comparten la marca «C1»/)
})

test('ADVERSARIAL: un inodoro NO resuelve la cantidad de una columna', () => {
  const r = esElMismo(elemento('C1', 'Columna de hormigón C1'), { bloque: 'Inodoro' })
  assert.equal(r.es, false)
  assert.match(r.porQue, /no se puede saber qué pieza es el bloque|el elemento es columna/, 'un bloque que no es ninguna pieza reconocible tampoco resuelve nada')
})

test('ADVERSARIAL: dos piezas del mismo tipo con MATERIAL distinto no se emparejan', () => {
  const r = esElMismo(elemento('CM1', 'Columna metálica CM1'), { bloque: 'Columna de hormigón' })
  assert.equal(r.es, false)
  assert.match(r.porQue, /uno es metalico y el otro hormigon|uno es hormigon/)
})

test('ADVERSARIAL: mismo tipo de pieza pero sin una palabra en común tampoco alcanza', () => {
  const r = esElMismo(elemento('X', 'viga principal'), { bloque: 'dintel' })
  assert.equal(r.es, false)
})

test('EL CAD NO LE GANA A LO QUE YA ESTABA CONTADO: sólo llena lo que faltaba', () => {
  const yaContado = { id: 'C1', nombre: 'Columna C1', repeticion: { modo: 'conteo_directo', cantidad: 8 } }
  const r = resolverConCad([yaContado], cad([{ bloque: 'C1', cantidad: 12 }]))
  assert.equal(r.elementos[0].repeticion.cantidad, 8, 'lo que el proyectista contó en la vista manda')
  assert.equal(r.resueltos.length, 0)
})

test('cuando el elemento no tenía cantidad, el CAD la resuelve CON EVIDENCIA citable', () => {
  const r = resolverConCad([elemento('C1', 'Columna C1')], cad([{ bloque: 'C1', cantidad: 12, capas: ['ESTRUCTURA'] }]))
  const rep = r.elementos[0].repeticion
  assert.equal(rep.modo, 'conteo_cad')
  assert.equal(rep.cantidad.valor, 12)
  assert.equal(rep.cantidad.fuente, FUENTE.EXTRAIDO_PLANO)
  assert.match(rep.cantidad.evidencia.textoLiteral, /12 inserción\(es\) del bloque «C1»/)
  assert.equal(rep.cantidad.evidencia.archivo, 'ESTRUCTURA.dwg')
  assert.equal(r.resueltos[0].via, 'MARCA')
})

test('LOS BLOQUES ANÓNIMOS Y LOS DE ANOTACIÓN NO CUENTAN NADA', () => {
  const r = resolverConCad([elemento('U22', 'algo *U22')], cad([{ bloque: '*U22', cantidad: 6 }, { bloque: '_Dot', cantidad: 4 }]))
  assert.equal(r.bloquesDisponibles, 0)
  assert.equal(r.resueltos.length, 0)
})

test('DOS BLOQUES QUE DICEN SER EL MISMO ELEMENTO CON CANTIDADES DISTINTAS no se promedian', () => {
  const r = resolverConCad(
    [elemento('C1', 'Columna C1')],
    [{ archivo: 'A.dwg', medicion: { bloques: [{ bloque: 'C1', cantidad: 12 }] } }, { archivo: 'B.dwg', medicion: { bloques: [{ bloque: 'C1', cantidad: 14 }] } }],
  )
  assert.equal(r.elementos[0].repeticion.cantidad, null, 'ni el mayor, ni el primero, ni el promedio')
  assert.equal(r.ambiguos.length, 1)
  assert.match(r.ambiguos[0].porQue, /más de un bloque del CAD dice ser este elemento/)
})

test('si los dos bloques dicen LO MISMO, no hay ambigüedad que resolver', () => {
  const r = resolverConCad(
    [elemento('C1', 'Columna C1')],
    [{ archivo: 'A.dwg', medicion: { bloques: [{ bloque: 'C1', cantidad: 12 }] } }, { archivo: 'B.dwg', medicion: { bloques: [{ bloque: 'C1', cantidad: 12 }] } }],
  )
  assert.equal(r.elementos[0].repeticion.cantidad.valor, 12)
})

test('LAS COTAS SE CUENTAN Y NO SE USAN, y el porqué viaja en el resultado', () => {
  const r = resolverConCad([elemento('CORREA', 'Correa C140')], cad([], 'X.dwg', [{ medida_m: 18.3 }, { medida_m: 6.08 }]))
  assert.equal(r.cotas, 2)
  assert.equal(r.elementos[0].repeticion.cantidad, null, 'una cota de 18,30 cerca de una correa no es la longitud de la correa')
  assert.match(r.porQueLasCotasNoSeUsan, /no dice a qué elemento pertenece/)
})

test('DOS RESOLUCIONES IDÉNTICAS dan exactamente lo mismo', () => {
  const e = [elemento('C1', 'Columna C1'), elemento('B1', 'Base B1')]
  const c = cad([{ bloque: 'C1', cantidad: 12 }, { bloque: 'B1', cantidad: 4 }])
  assert.deepEqual(resolverConCad(e, c), resolverConCad(e, c))
})
