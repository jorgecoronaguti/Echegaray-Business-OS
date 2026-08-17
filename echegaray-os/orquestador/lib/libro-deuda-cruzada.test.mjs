// LA DEUDA QUE CAJA PUBLICA, DE PUNTA A PUNTA — de la pestaña de origen al total de la tarjeta.
//
// Los tests de `libro-cruce-banco.test.mjs` prueban el emparejamiento con movimientos armados a
// mano. Éste prueba la CADENA REAL: `deCargasSociales` emite el F931 igual que en el archivo vivo,
// el cruce corre, y se mide el total de COMPROMETIDO+VENCIDO que es exactamente lo que la tarjeta
// "DEUDA ATRASADA Y DEL MES" publica. Si alguien desconecta el cruce del orquestador, los casos
// unitarios siguen verdes y ÉSTE se pone rojo — que es el defecto que se publicó.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { deCargasSociales } from './libro-extractores-cargas.mjs'
import { sumar } from './libro-movimientos.mjs'
import { NAT } from './banco-santander.mjs'
import { cruzarLibroContraBanco, aplicarCruce } from './libro-cruce-banco.mjs'

/** Los seriales de los doce vencimientos de la cadena, tal como los publica `CARGAS_MES_FECHAS`.
 *  El de julio (índice 6) es el 10/08/2026 = 46244, medido en el archivo vivo. */
const FECHAS = [46052, 46083, 46111, 46142, 46172, 46203, 46244, 46265, 46296, 46326, 46357, 46387]
/** Sólo julio tiene plata: es la fila que CAJA publicaba como deuda. Los demás meses en cero para
 *  que el total del test sea el del caso y no una suma de doce cosas. */
const F931 = [0, 0, 0, 0, 0, 0, 7074772, 0, 0, 0, 0, 0]
const GREMIALES = [0, 0, 0, 0, 0, 0, 1632798, 0, 0, 0, 0, 0]

const CORTE = 46251 // 17/08/2026, el día en que el dueño lo reclamó
const CORTE_BANCO = 46248 // el extracto llega al 14/08
const DESDE_EXTRACTO = 46170 // arranca el 28/05

/** El único pago de servicios AFIP de agosto, al centavo (`_BANCO_RAW` f373). */
const PAGO_AFIP = { fecha: 46245, importe: 8235741.96, naturaleza: NAT.afip, fila: 373, concepto: 'Pago de servicios - Imp.afip' }

const deuda = (libro) => sumar(libro, { estados: ['COMPROMETIDO', 'VENCIDO'], signo: -1 }).total

const cruzar = (libro, debitos) => aplicarCruce(libro,
  cruzarLibroContraBanco(libro, debitos, { corte: CORTE_BANCO, desdeExtracto: DESDE_EXTRACTO }))

test('SIN el cruce, la cadena de cargas publica el F931 de julio como deuda vencida', () => {
  // Es el comportamiento de ayer, y queda fijado a propósito: es la línea de base contra la que se
  // mide el arreglo. Si esto cambiara solo, el test de abajo estaría midiendo otra cosa.
  const libro = deCargasSociales({ fechas: FECHAS, f931: F931, gremiales: GREMIALES }, CORTE)
  const f931 = libro.find((m) => m.concepto.startsWith('F931'))
  assert.equal(f931.estado, 'VENCIDO')
  assert.equal(f931.importe, 7074772)
  assert.equal(deuda(libro), -(7074772 + 1632798))
})

test('EL DEFECTO: con el pago de ARCA ya debitado, el F931 sale de la deuda y los gremiales NO', () => {
  const libro = deCargasSociales({ fechas: FECHAS, f931: F931, gremiales: GREMIALES }, CORTE)
  const cruzado = cruzar(libro, [PAGO_AFIP])

  const f931 = cruzado.find((m) => m.concepto.startsWith('F931'))
  assert.equal(f931.estado, 'REAL', 'el banco pagó a ARCA el 11/08: esto no es deuda')
  assert.equal(f931.fecha, 46245, 'la plata salió el día del débito, no el del vencimiento')

  // LOS GREMIALES SIGUEN DEBIÉNDOSE, Y ES LA MITAD QUE IMPORTA. Los cobran FCL, UOCRA, IERIC y
  // FODECO, no ARCA: un VEP de ARCA no puede pagarlos. Si el cruce se los llevara puesto habría
  // cambiado un error por otro — que ya pasó una vez con las quincenas de enero a abril.
  const grem = cruzado.find((m) => m.concepto.startsWith('Gremiales'))
  assert.equal(grem.estado, 'VENCIDO')
  assert.equal(deuda(cruzado), -1632798,
    'la deuda baja EXACTAMENTE los $7.074.772 del F931 y ni un peso más')
})

test('sin extracto no se retira nada: falla hacia el comportamiento anterior', () => {
  const libro = deCargasSociales({ fechas: FECHAS, f931: F931, gremiales: GREMIALES }, CORTE)
  assert.equal(deuda(cruzar(libro, [])), -(7074772 + 1632798),
    'un extracto vacío no puede significar "está todo pagado"')
})

test('el pago de ARCA de UN mes no cancela el F931 del mes siguiente', () => {
  // Agosto devengado vence el 31/08 (índice 7) y el pago es del 11/08: veinte días antes. Con una
  // holgura de medio mes o más, este pago se llevaría puesta también la obligación de agosto.
  const soloAgosto = [0, 0, 0, 0, 0, 0, 0, 7074772, 0, 0, 0, 0]
  const libro = deCargasSociales({ fechas: FECHAS, f931: soloAgosto, gremiales: GREMIALES.map(() => 0) }, CORTE)
  const f931 = cruzar(libro, [PAGO_AFIP]).find((m) => m.concepto.startsWith('F931'))
  // Todavía no vencía cuando el banco debitó, así que ese pago no pudo contenerla: sigue esperando
  // su propio pago, con el estado que le corresponde por fecha.
  assert.equal(f931.estado, 'PROYECTADO')
  assert.equal(f931.importe, 7074772)
})

test('EL CABLEADO: el orquestador del libro corre el cruce, y comparte el Set de débitos usados', () => {
  // Los tests de arriba prueban el CRITERIO. Éste prueba que esté ENCHUFADO: sin él, alguien podría
  // borrar la llamada de `libro-movimientos-pestana.mjs` y todo seguiría verde mientras CAJA vuelve a
  // publicar el F931 como deuda. Es exactamente el modo de falla que se publicó el 16/08 con la
  // nómina — el criterio estaba bien y el resultado en el archivo estaba mal.
  const src = readFileSync(new URL('../scripts/libro-movimientos-pestana.mjs', import.meta.url), 'utf8')
  assert.match(src, /aplicarCruce\(/, 'el orquestador tiene que APLICAR el cruce, no sólo calcularlo')
  assert.match(src, /cruzarLibroContraBanco/)
  assert.match(src, /usadosBanco/, 'y tiene que compartir el Set `usados` que ya consumió la nómina: '
    + 'con un Set nuevo, el mismo débito podría pagar dos obligaciones')
})

test('el F931 ya marcado pagado en Compras no lo emite la cadena, y el cruce no lo resucita', () => {
  // La precedencia declarada de `libro-extractores-cargas.mjs`: el hecho le gana a la proyección.
  const libro = deCargasSociales({ fechas: FECHAS, f931: F931, gremiales: GREMIALES }, CORTE,
    { mesesPagados: new Set(['2026-08·Nómina · Cargas sociales']) })
  const cruzado = cruzar(libro, [PAGO_AFIP])
  assert.equal(cruzado.filter((m) => m.concepto.startsWith('F931')).length, 0)
  assert.equal(deuda(cruzado), -1632798)
})
