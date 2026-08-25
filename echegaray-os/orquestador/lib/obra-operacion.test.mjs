// Los defectos que estos tests atrapan son todos de IMPUTACIÓN: mostrar bajo una obra plata,
// pedidos o herramientas que no son de esa obra. Un cruce por nombre que falla no tira excepción —
// muestra un número creíble y equivocado, que es la forma más cara de fallar de este módulo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aliasDeObra, detalleCubreElTotal, esDeObra, indiceDeAlias, normObra, obraDeTexto,
} from './obra-operacion.mjs'

// El diccionario tal como vive en `public.obra_alias` (migraciones 20260718170000 y 20260817210000).
const ALIAS = [
  { alias: 'estrella', obra_id: 'la-estrella', clasificacion: 'obra' },
  { alias: 'san francisco', obra_id: 'san-francisco', clasificacion: 'obra' },
  { alias: 'messina', obra_id: 'messina', clasificacion: 'obra' },
  { alias: 'messinas', obra_id: 'messina', clasificacion: 'obra' },
  { alias: 'arcor', obra_id: 'arcor', clasificacion: 'mantenimiento' },
  { alias: 'administracion', obra_id: null, clasificacion: 'indirecto' },
  { alias: 'taller', obra_id: null, clasificacion: 'indirecto' },
  { alias: 'le comedor', obra_id: 'le-comedor', clasificacion: 'obra' },
]

test('normObra replica norm_obra(): minúsculas, sin acentos, sin artículos, colapsado', () => {
  assert.equal(normObra('LA ESTRELLA'), 'estrella')
  assert.equal(normObra('  Sán   Francisco!! '), 'san francisco')
  assert.equal(normObra('Quattropani - Melisa García SAS'), 'quattropani melisa garcia sas')
  assert.equal(normObra(null), '')
  assert.equal(normObra(undefined), '')
})

test('normObra saca el artículo esté donde esté, y no parte palabras que lo contienen', () => {
  // "Galpon" empieza con "gal", no con el artículo "la": si el regex no fuera por límite de
  // palabra, "Galpones" se convertiría en "gapones" y ningún alias volvería a matchear.
  assert.equal(normObra('Galpones'), 'galpones')
  assert.equal(normObra('Salones de la Esquina'), 'salones esquina')
})

test('aliasDeObra devuelve SÓLO los alias de esa obra', () => {
  assert.deepEqual(aliasDeObra(ALIAS, 'messina'), ['messina', 'messinas'])
  assert.deepEqual(aliasDeObra(ALIAS, 'la-estrella'), ['estrella'])
})

test('aliasDeObra ignora los indirectos: el costo de estructura no es de ninguna obra', () => {
  // Si un alias 'indirecto' entrara, Administración/Taller/F931/UOCRA —el overhead de la empresa—
  // se imputaría como costo de obra. Es el recorte que hace `obra_costo_real`.
  const soloIndirectos = [
    { alias: 'administracion', obra_id: 'la-estrella', clasificacion: 'indirecto' },
    { alias: 'taller', obra_id: 'la-estrella', clasificacion: 'excluido' },
  ]
  assert.deepEqual(aliasDeObra(soloIndirectos, 'la-estrella'), [])
})

test('aliasDeObra de una obra sin alias registrado da vacío, no la lista entera', () => {
  // 'galpones' existe en obra_canonica y NO tiene fila en obra_alias. Devolver algo acá sería
  // inventarle una imputación a una obra que nadie nombró.
  assert.deepEqual(aliasDeObra(ALIAS, 'galpones'), [])
})

test('esDeObra matchea la grafía del campo contra el alias canónico', () => {
  const messina = aliasDeObra(ALIAS, 'messina')
  assert.equal(esDeObra(messina, 'MESSINAS'), true)
  assert.equal(esDeObra(messina, 'Messina'), true)
  assert.equal(esDeObra(aliasDeObra(ALIAS, 'la-estrella'), 'la estrella'), true)
})

test('esDeObra NO matchea por contención: "Estrella Norte" no es La Estrella', () => {
  // `resolverObraCon()` tiene un fallback aproximado por contención. Acá se imputa plata: una obra
  // nueva cuyo nombre contenga el de otra le vaciaría el costo encima.
  const estrella = aliasDeObra(ALIAS, 'la-estrella')
  assert.equal(esDeObra(estrella, 'Estrella Norte'), false)
  assert.equal(esDeObra(estrella, 'Est'), false)
  assert.equal(esDeObra(aliasDeObra(ALIAS, 'san-francisco'), 'San Francisco II'), false)
})

test('esDeObra con texto vacío da false: la fila sin obra no cae en la primera obra', () => {
  const estrella = aliasDeObra(ALIAS, 'la-estrella')
  assert.equal(esDeObra(estrella, ''), false)
  assert.equal(esDeObra(estrella, '   '), false)
  assert.equal(esDeObra(estrella, null), false)
  // Y una obra sin alias no se queda con las filas huérfanas.
  assert.equal(esDeObra([], 'LA ESTRELLA'), false)
})

test('detalleCubreElTotal detecta que faltan filas contra el total que declara la base', () => {
  const filas = [{ total: 1000 }, { total: 500 }]
  assert.equal(detalleCubreElTotal(filas, 1500), true)
  assert.equal(detalleCubreElTotal(filas, 1500.4), true) // redondeo de numeric, no un faltante
  assert.equal(detalleCubreElTotal(filas, 9000), false)
  // El caso que importa: la base dice que hay costo y el detalle no trajo ninguna fila.
  assert.equal(detalleCubreElTotal([], 168735719), false)
})

test('detalleCubreElTotal sin total declarado sólo cierra si tampoco hay detalle', () => {
  assert.equal(detalleCubreElTotal([], null), true)
  assert.equal(detalleCubreElTotal([{ total: 10 }], null), false)
  assert.equal(detalleCubreElTotal([{ total: null }], null), true)
})

// ═══ EL ÍNDICE GLOBAL: LA VISTA DE TODAS LAS OBRAS Y LA DE UNA TIENEN QUE DECIR LO MISMO ═══

test('obraDeTexto contesta lo mismo que esDeObra, obra por obra', () => {
  // ÉSTE es el test que atrapa "dos sistemas". Si alguien toca una de las dos resoluciones y no la
  // otra, una compra aparece en la lista global bajo una obra y desaparece de la ficha de esa obra
  // —o al revés—, sin un solo error en pantalla.
  const idx = indiceDeAlias(ALIAS)
  const textos = ['La Estrella', 'MESSINAS', 'san francisco', 'Le Comedor', 'Taller', 'Estrella Norte', '', null]
  for (const obraId of ['la-estrella', 'messina', 'san-francisco', 'le-comedor', 'arcor']) {
    const nombres = aliasDeObra(ALIAS, obraId)
    for (const t of textos) {
      assert.equal(obraDeTexto(idx, t) === obraId, esDeObra(nombres, t), `${obraId} ← ${JSON.stringify(t)}`)
    }
  }
})

test('el índice deja afuera los indirectos: el costo de estructura no es de ninguna obra', () => {
  const idx = indiceDeAlias(ALIAS)
  assert.equal(obraDeTexto(idx, 'Administración'), null)
  assert.equal(obraDeTexto(idx, 'Taller'), null)
  assert.equal(obraDeTexto(idx, 'Arcor'), 'arcor') // 'mantenimiento' SÍ es obra
})

test('un alias que dos obras normalizan igual no se imputa a ninguna', () => {
  // Sin esto, la fila caería bajo la obra que la base devolviera primero —un orden que nadie
  // declaró— y el número de una obra tendría plata de la otra sin que nada se vea raro.
  const idx = indiceDeAlias([
    { alias: 'La Estrella', obra_id: 'la-estrella', clasificacion: 'obra' },
    { alias: 'estrella', obra_id: 'estrella-2', clasificacion: 'obra' },
  ])
  assert.equal(obraDeTexto(idx, 'LA ESTRELLA'), null)
})

// ═══ LOS CHIPS DE IMPEDIMENTOS ═══
//
// El defecto que atrapan es de CONTEO, no de excepción: un chip que dice «3 críticos» cuando hay 1
// se ve perfecto y manda al jefe de obra a buscar dos problemas que no existen —o peor, le esconde
// uno vencido detrás de un chip que no lo cuenta.
import {
  contarImpedimentos, diasDeAtraso, filtrarImpedimentos, impedimentoDeClima, impedimentoVencido,
} from './obra-operacion.mjs'

const HOY = '2026-08-24'
const IMPEDIMENTOS = [
  { id: 'a', estado: 'abierta', tipo: 'material', fecha_compromiso: '2026-08-20' }, // vencido
  { id: 'b', estado: 'en_curso', tipo: 'material', fecha_compromiso: '2026-08-30' }, // abierto, a tiempo
  { id: 'c', estado: 'abierta', tipo: 'informacion', fecha_compromiso: null }, // abierto, sin fecha
  { id: 'd', estado: 'liberada', tipo: 'material', fecha_compromiso: '2026-08-01' }, // resuelto
  { id: 'e', estado: 'abierta', tipo: 'clima', fecha_compromiso: '2026-08-24' }, // vence HOY
]

test('«sin resolver» incluye en_curso: un impedimento en curso sigue frenando la obra', () => {
  const ids = filtrarImpedimentos(IMPEDIMENTOS, 'sin_resolver', HOY).map((r) => r.id)
  assert.deepEqual(ids, ['a', 'b', 'c', 'e'])
})

test('«críticos» son los vencidos, y el que vence HOY todavía no lo es', () => {
  // El defecto: usar `<=` contra hoy. Marcaría en rojo un compromiso que la persona todavía puede
  // cumplir durante el día, y el chip perdería su significado — «crítico» pasaría a ser «vigente».
  assert.deepEqual(filtrarImpedimentos(IMPEDIMENTOS, 'criticos', HOY).map((r) => r.id), ['a'])
  assert.equal(impedimentoVencido({ estado: 'abierta', fecha_compromiso: HOY }, HOY), false)
})

test('un impedimento sin fecha de compromiso NO es crítico: es incompleto', () => {
  assert.equal(impedimentoVencido({ estado: 'abierta', fecha_compromiso: null }, HOY), false)
  assert.equal(impedimentoVencido({ estado: 'abierta', fecha_compromiso: '' }, HOY), false)
})

test('un impedimento liberado nunca es crítico, por vieja que sea la fecha', () => {
  assert.equal(impedimentoVencido({ estado: 'liberada', fecha_compromiso: '2020-01-01' }, HOY), false)
})

test('los contadores se calculan sobre la lista COMPLETA, no sobre la filtrada', () => {
  // El defecto: contar sobre lo que se ve. Con el chip «críticos» puesto, «Todo» diría 1 y nadie
  // podría volver — el número que invita a cambiar de chip tiene que ser estable.
  const total = contarImpedimentos(IMPEDIMENTOS, HOY)
  const yaFiltrada = filtrarImpedimentos(IMPEDIMENTOS, 'criticos', HOY)
  assert.deepEqual(total, { todo: 5, sin_resolver: 4, criticos: 1 })
  assert.deepEqual(contarImpedimentos(yaFiltrada, HOY), { todo: 1, sin_resolver: 1, criticos: 1 })
})

test('el atraso es null cuando no hay atraso: 0 días diría «vencido hace nada»', () => {
  assert.equal(diasDeAtraso({ estado: 'abierta', fecha_compromiso: null }, HOY), null)
  assert.equal(diasDeAtraso({ estado: 'abierta', fecha_compromiso: '2026-08-30' }, HOY), null)
  assert.equal(diasDeAtraso({ estado: 'abierta', fecha_compromiso: HOY }, HOY), null)
  assert.equal(diasDeAtraso({ estado: 'abierta', fecha_compromiso: '2026-08-20' }, HOY), 4)
})

test('el clima es un tipo de impedimento, no otra tabla', () => {
  assert.equal(impedimentoDeClima({ tipo: 'clima' }), true)
  assert.equal(impedimentoDeClima({ tipo: 'material' }), false)
  assert.equal(impedimentoDeClima({}), false)
})
