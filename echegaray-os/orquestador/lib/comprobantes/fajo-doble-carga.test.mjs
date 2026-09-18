// DOS FOTOS DEL MISMO TICKET EN EL MISMO FAJO — EL GASTO NO PUEDE ENTRAR DOS VECES.
//
// ═══ EL AGUJERO (revisión del 18/09/2026) ═══
//
// `colapsarRepetidos` une por `claveComprobante`, que sin CUIT se degrada a `p:<proveedor>|<n°>`. Si
// el mismo ticket se fotografía dos veces y el modelo lee el nombre distinto —«NEUMAGOM S.A.S.»
// contra «Neumagom»— las claves difieren y no se colapsan. Y la barrera de duplicados entre corridas
// tampoco puede frenarlo: la primera fila todavía no está escrita en la pestaña. Entran dos gastos,
// el dueño confirma un total que ya está mal contado, y el Flujo de Fondos lo propaga por fórmula.
//
// Lo tapaba, sin querer, que ARCA le pegara el CUIT al comprobante: las dos lecturas quedaban con el
// mismo CUIT y la misma clave fuerte. Ese pegado se sacó el 18/09 —ponía el CUIT de OTRA empresa
// cuando la vía era débil, y de ahí salía el proveedor equivocado en la columna E— y al sacarlo este
// hueco quedó a la vista. Los dos arreglos son correctos; éste es el que faltaba.
//
// Los tres casos de abajo son los tres que hay que mirar juntos: los dos que TIENEN que colapsar y
// el contraejemplo, que es el que impide que el arreglo se coma un gasto legítimo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { colapsarRepetidos } from './fajo.mjs'
import { huellaDePapel, mismoComprobanteAunqueElNombreCambie } from './mejor-lectura.mjs'

/** Un ítem como el que arma `armarItem`, con su archivo de origen. */
const item = (over = {}, archivo = 'IMG_001.HEIC') => ({
  origen: { fileId: archivo, nombre: archivo },
  comprobante: {
    proveedor: 'Neumagom', cuit: null, tipo: 'A', numero: '0002-00004213', fecha: '16/09/2026',
    total: 580000, iva: 100661.16, neto: 479338.84, categoria: 'B', concepto: 'Neumático', ...over,
  },
})

test('EL AGUJERO: dos fotos del mismo ticket, sin CUIT y con el nombre leído distinto, entraban DOS VECES', () => {
  // Exactamente el caso: mismo número, misma fecha, mismo total; el nombre cambia de grafía y no hay
  // CUIT que los una. Las claves son `p:neumagom s.a.s.|…` y `p:neumagom|…`: distintas.
  const { items, repetidos } = colapsarRepetidos([
    item({ proveedor: 'NEUMAGOM S.A.S.' }, 'IMG_001.HEIC'),
    item({ proveedor: 'Neumagom' }, 'IMG_002.HEIC'),
  ])
  assert.equal(items.length, 1, 'el mismo gasto entró dos veces')
  assert.equal(repetidos.length, 1)
  // Y la foto que no ganó queda declarada como copia, no se evapora. No se fija CUÁL gana: eso lo
  // decide `mejorDe` por calidad de lectura y no es lo que este test prueba. Lo que se prueba es que
  // entre el ganador y sus copias están LAS DOS fotos: ninguna desapareció del recuento.
  assert.equal(items[0].copias.length, 1)
  const fotos = [items[0].origen.fileId, ...items[0].copias.map((c) => c.fileId)].sort()
  assert.deepEqual(fotos, ['IMG_001.HEIC', 'IMG_002.HEIC'], 'una de las dos fotos se evaporó del recuento')
})

test('colapsa aunque el nombre sólo comparta una parte: «Combustibles Barcelo SRL» y «Combustibles Barcelo»', () => {
  // La tolerancia de subcadena (4+), la misma que usa la búsqueda contra la pestaña. El sufijo
  // societario que una foto trae y la otra no es el caso más común de los dos nombres distintos.
  const { items, repetidos } = colapsarRepetidos([
    item({ proveedor: 'Combustibles Barcelo SRL' }, 'IMG_001.HEIC'),
    item({ proveedor: 'Combustibles Barcelo' }, 'IMG_002.HEIC'),
  ])
  assert.equal(items.length, 1)
  assert.equal(repetidos.length, 1)
})

test('EL LÍMITE: una lectura SIN proveedor y SIN CUIT no se colapsa con nadie — y por eso no entra sola', () => {
  // Sin ninguno de los dos no hay clave (`claveComprobante` devuelve null) y la regla de la casa es
  // que sin clave no se colapsa: unir dos gastos distintos es peor que mostrar dos veces el mismo.
  // Eso deja dos ítems… y no es un agujero, porque ese ítem TAMPOCO se carga solo: sin CUIT y sin
  // proveedor no tiene identidad fuerte (`identidadFuerte` en `faltantes.mjs`), así que queda
  // pendiente y el bot pregunta. Es el límite 2 anotado en `fajo.mjs`: más preguntas al dueño, a
  // cambio de no cargar un gasto apoyado en una identidad que nadie confirmó.
  const { items } = colapsarRepetidos([
    item({ proveedor: null }, 'IMG_001.HEIC'),
    item({ proveedor: 'Neumagom' }, 'IMG_002.HEIC'),
  ])
  assert.equal(items.length, 2)
})

test('EL CONTRAEJEMPLO: dos comprobantes DISTINTOS con la misma fecha y el mismo total NO se colapsan', () => {
  // El riesgo espejo, y es el que importa: unir dos gastos distintos no se ve nunca más. Medido
  // sobre las 980 filas de Compras el 18/09: hay 5 pares de proveedores distintos que comparten
  // fecha y total —«SERVICIOS TALLER» y «Lucas Guzman» el 04/03 por $400.000, «ARCA» y «Sueldos»…—
  // y todos ellos tienen número vacío. Por eso el NÚMERO es parte de la huella: sin él, esos cinco
  // pares se habrían fusionado.
  const { items } = colapsarRepetidos([
    item({ proveedor: 'SERVICIOS TALLER', numero: '0001-00000111' }, 'IMG_001.HEIC'),
    item({ proveedor: 'Lucas Guzman', numero: '0004-00000222' }, 'IMG_002.HEIC'),
  ])
  assert.equal(items.length, 2, 'dos gastos distintos se fusionaron: esa plata no se ve nunca más')
})

test('y tampoco se colapsan dos proveedores DISTINTOS que compartan número, fecha y total', () => {
  // La guarda de nombre, que es lo único que separa «el mismo papel leído distinto» de «dos papeles
  // que se parecen». Hoy no hay ningún caso así en Compras (medido: 0), pero cuesta nada.
  const { items } = colapsarRepetidos([
    item({ proveedor: 'Dipot' }, 'IMG_001.HEIC'),
    item({ proveedor: 'Corralon Progreso' }, 'IMG_002.HEIC'),
  ])
  assert.equal(items.length, 2)
  // Y con CUIT distinto tampoco, aunque los nombres se parezcan: el CUIT manda.
  const conCuit = colapsarRepetidos([
    item({ proveedor: 'Neumagom SA', cuit: '30691853825' }, 'IMG_001.HEIC'),
    item({ proveedor: 'Neumagom SRL', cuit: '30111111117' }, 'IMG_002.HEIC'),
  ])
  assert.equal(conCuit.items.length, 2)
})

test('una NOTA DE CRÉDITO no se colapsa con la factura de su mismo número: la clase está en la huella', () => {
  // Comparten numeración y confundirlas ya costó $41,9M.
  const { items } = colapsarRepetidos([
    item({ proveedor: 'NEUMAGOM S.A.S.' }, 'IMG_001.HEIC'),
    item({ proveedor: 'Neumagom', esNotaCredito: true, tipo: 'NC' }, 'IMG_002.HEIC'),
  ])
  assert.equal(items.length, 2)
})

test('sin número no hay huella: no se afirma que dos papeles sean el mismo', () => {
  assert.equal(huellaDePapel({ proveedor: 'X', fecha: '16/09/2026', total: 100 }), null)
  assert.equal(huellaDePapel({ numero: '0001-00000001', total: 100 }), null, 'sin fecha tampoco')
  assert.equal(huellaDePapel({ numero: '0001-00000001', fecha: '16/09/2026' }), null, 'sin total tampoco')
  const { items } = colapsarRepetidos([
    item({ proveedor: 'Sueldos', numero: null, total: 0 }, 'IMG_001.HEIC'),
    item({ proveedor: 'Banco', numero: null, total: 0 }, 'IMG_002.HEIC'),
  ])
  assert.equal(items.length, 2, 'los cinco pares reales sin número son gastos distintos')
})

test('la unificación se declara con su porqué, para poder desmentirla', () => {
  const r = mismoComprobanteAunqueElNombreCambie(
    item({ proveedor: 'NEUMAGOM S.A.S.' }), item({ proveedor: 'Neumagom' }),
  )
  assert.equal(r.si, true)
  assert.match(r.porque, /mismo comprobante 0002-00004213, misma fecha y mismo total/)
})
