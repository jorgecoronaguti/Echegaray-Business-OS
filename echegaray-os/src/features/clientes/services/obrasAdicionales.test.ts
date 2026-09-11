import test from 'node:test'
import assert from 'node:assert/strict'
import {
  consolidar, jerarquiaDeObras, recortarPorEstado, sumaSinDobleConteo,
} from './obrasAdicionales.ts'

// LOS DATOS SON LOS REALES DE MESSINA (11/09/2026), no un caso de laboratorio: el adicional del
// tercer muro ($10.000.000, OC 2256) cuelga del Playón de Azufre ($102.500.000, OC 2173), y
// `bsa-adicional` está CERRADA con su madre `messina-bsa` ACTIVA — que es el caso que rompe
// cualquier recorte por estado hecho obra por obra.
const PLAYON = { obra_id: 'messina-playon-azufre', estado: 'activa', obra_padre_id: null, precio: 102_500_000 }
const MURO = { obra_id: 'messina-adicional-tercer-muro', estado: 'activa', obra_padre_id: 'messina-playon-azufre', precio: 10_000_000 }
const BSA = { obra_id: 'messina-bsa', estado: 'activa', obra_padre_id: null, precio: 17_704_199 }
const BSA_ADIC = { obra_id: 'bsa-adicional', estado: 'cerrada', obra_padre_id: 'messina-bsa', precio: null }
const DILUCION = { obra_id: 'messina-playon-dilucion-acido', estado: 'activa', obra_padre_id: null, precio: 20_090_868 }
const precio = (o: { precio: number | null }) => o.precio

test('el adicional se dibuja PEGADO debajo de su obra mayor, en nivel 1', () => {
  // La entrada llega alfabética —como la devuelve la consulta— y el adicional cae ANTES que su
  // madre: sin esta función, la pantalla dibuja «ME - ADICIONAL TERCER MURO» suelto arriba, que es
  // exactamente lo que el dueño marcó.
  const filas = jerarquiaDeObras([MURO, BSA, DILUCION, PLAYON])
  assert.deepEqual(filas.map((f) => [f.obra.obra_id, f.nivel]), [
    ['messina-bsa', 0],
    ['messina-playon-dilucion-acido', 0],
    ['messina-playon-azufre', 0],
    ['messina-adicional-tercer-muro', 1],
  ])
  const muro = filas.find((f) => f.obra.obra_id === MURO.obra_id)!
  assert.equal(muro.esAdicional, true)
  assert.equal(muro.huerfano, false)
  assert.deepEqual(filas[2].hijos.map((h) => h.obra_id), ['messina-adicional-tercer-muro'])
})

test('ninguna obra se pierde ni se repite, pase lo que pase con la relación', () => {
  // Tres relaciones imposibles de dibujar: padre inexistente, padre que es ella misma, y una cadena
  // de dos niveles que el trigger de la base rechaza pero que un dato viejo podría tener.
  const entrada = [
    PLAYON, MURO,
    { obra_id: 'huerfana', estado: 'activa', obra_padre_id: 'no-existe', precio: 1 },
    { obra_id: 'circular', estado: 'activa', obra_padre_id: 'circular', precio: 2 },
    { obra_id: 'nieta', estado: 'activa', obra_padre_id: 'messina-adicional-tercer-muro', precio: 3 },
  ]
  const ids = jerarquiaDeObras(entrada).map((f) => f.obra.obra_id)
  assert.equal(ids.length, entrada.length, 'se perdió o se duplicó una obra del cliente')
  assert.deepEqual([...ids].sort(), entrada.map((o) => o.obra_id).sort())
})

test('un adicional sin su obra mayor a la vista se VE, en nivel 0 y marcado', () => {
  // `bsa-adicional` sin `messina-bsa` en la lista: es el grupo «Terminados» de la ficha.
  const [fila] = jerarquiaDeObras([BSA_ADIC])
  assert.equal(fila.nivel, 0)
  assert.equal(fila.esAdicional, true)
  assert.equal(fila.huerfano, true, 'el adicional huérfano se dibujaría como si fuera una obra mayor')
})

test('el adicional viaja al grupo de su MADRE, no al de su propio estado', () => {
  const obras = [BSA, BSA_ADIC, PLAYON, MURO]
  // `bsa-adicional` está cerrada y entra en «en curso» porque su madre lo está: si se recortara por
  // su propio estado, la madre quedaría arriba sin su subnivel y el hijo abajo sin su madre.
  assert.deepEqual(recortarPorEstado(obras, 'activa').map((o) => o.obra_id),
    ['messina-bsa', 'bsa-adicional', 'messina-playon-azufre', 'messina-adicional-tercer-muro'])
  assert.deepEqual(recortarPorEstado(obras, 'cerrada').map((o) => o.obra_id), [])
  // Y un huérfano sí se recorta por el suyo: no hay madre que mande.
  assert.deepEqual(recortarPorEstado([BSA_ADIC], 'cerrada').map((o) => o.obra_id), ['bsa-adicional'])
})

test('la obra mayor consolida lo suyo más sus adicionales, y declara el desglose', () => {
  const [fila] = jerarquiaDeObras([PLAYON, MURO])
  const c = consolidar(fila, precio)
  assert.deepEqual(c, {
    propio: 102_500_000, adicionales: 10_000_000, total: 112_500_000, n: 1, sinPrecio: 0,
  })
})

test('una obra SIN adicionales tiene total, y es el suyo: la fila no se queda sin número', () => {
  // La fila del adicional no tiene hijos. La primera versión devolvía `total: null` cuando `n === 0`
  // y la celda del hijo —que es la que el dueño quiere ver con su propia OC— quedaba vacía.
  const filas = jerarquiaDeObras([PLAYON, MURO])
  const hijo = consolidar(filas[1], precio)
  assert.deepEqual(hijo, { propio: 10_000_000, adicionales: null, total: 10_000_000, n: 0, sinPrecio: 0 })
  const sola = consolidar(jerarquiaDeObras([DILUCION])[0], precio)
  assert.equal(sola.total, 20_090_868)
})

test('un adicional SIN precio no produce un consolidado más chico que la realidad', () => {
  // `bsa-adicional` no tiene precio en OBRAS. Un consolidado de $17.704.199 se leería como «esto es
  // todo lo contratado de BSA», y no lo es: falta lo que el adicional valga.
  const [fila] = jerarquiaDeObras([BSA, BSA_ADIC])
  const c = consolidar(fila, precio)
  assert.equal(c.propio, 17_704_199)
  assert.equal(c.adicionales, null)
  assert.equal(c.total, null, 'publicó un total consolidado al que le falta un adicional')
  assert.equal(c.sinPrecio, 1)
})

test('la suma de la lista cuenta cada obra UNA vez, aunque la madre publique el consolidado', () => {
  // EL DEFECTO QUE ATRAPA: con la madre mostrando $112,5 M, sumar lo que se ve da $122,5 M —el
  // adicional contado dos veces— y el total del cliente deja de cerrar contra `cliente_economia` y
  // contra la pestaña OBRAS, que es como el dueño lee esta pantalla.
  const filas = jerarquiaDeObras([PLAYON, MURO, DILUCION])
  const { total, faltan } = sumaSinDobleConteo(filas, precio)
  assert.equal(faltan, 0)
  assert.equal(total, 132_590_868)
  assert.equal(total, 102_500_000 + 10_000_000 + 20_090_868)
  // Y la prueba de que el doble conteo sería visible: sumar los consolidados da de más.
  const conDoble = filas.reduce((a, f) => a + (consolidar(f, precio).total ?? 0), 0)
  assert.equal(conDoble, 142_590_868)
  assert.notEqual(conDoble, total)
})

test('sin una sola base, no hay total: se dice qué falta en vez de una suma parcial', () => {
  const filas = jerarquiaDeObras([BSA, BSA_ADIC, PLAYON, MURO])
  const { total, faltan } = sumaSinDobleConteo(filas, precio)
  assert.equal(total, null)
  assert.equal(faltan, 1)
})
