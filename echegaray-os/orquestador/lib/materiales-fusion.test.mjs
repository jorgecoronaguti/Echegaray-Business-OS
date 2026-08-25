// LO QUE ESTOS TESTS PRUEBAN: que regenerar la pestaña NO le pise al dueño la fecha ni el importe que
// él editó en el cuadro 5. Cada uno está escrito contra el defecto real del 24/08 — el generador
// reescribía las 17 filas desde `obras-datos.mjs` y devolvía las fechas viejas.
//
// Si se revierte el arreglo (la grilla vuelve a dibujar la semilla), el primero se pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  fusionarCuadro5, claveDeItem, clavesEscritas, clavesDeMemoria, lineasDeFusion, MARCA_ESCRITO,
} from './materiales-fusion.mjs'
import { grillaObras, serialISO } from './obras-grilla.mjs'
import { itemsCrudosDeCuadro5, materialesDesdeCuadro5 } from './materiales-previstos.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// LOS INSUMOS
// ─────────────────────────────────────────────────────────────────────────────

/** Dos obras con tres ítems: uno con fecha única, uno en cuotas, uno que comparte rótulo. */
const OBRAS = [
  {
    clave: 'o1',
    obra: 'PLAYÓN DE AZUFRE',
    egresos: [
      { concepto: 'Materiales', proveedor: 'FEMENIA', familia: 'Materiales', monto: 7_372_050, fechaEstimada: '2026-08-24' },
      { concepto: 'Materiales', proveedor: 'Bedini', familia: 'Materiales', monto: 1_524_200, fechaEstimada: '2026-08-24' },
    ],
  },
  {
    clave: 'o2',
    obra: 'SALÓN COMERCIAL',
    egresos: [
      {
        concepto: 'Combustible (gasoil)', proveedor: 'ACA', familia: 'Combustible', monto: 269_584,
        cuotas: [{ fecha: '2026-09-10', monto: 67_396 }, { fecha: '2026-10-10', monto: 67_396 },
          { fecha: '2026-11-10', monto: 67_396 }, { fecha: '2026-12-10', monto: 67_396 }],
        nota: '4 cuotas mensuales desde sep; el día 10 es convención',
      },
    ],
  },
]

const OCT = serialISO('2026-10-01')

/** La pestaña tal como quedó después de que el dueño la editó: todo al 01/10, sin cuotas. */
const pestanaDelDueno = (items) => [
  ['OBRAS — EL AÑO ENTERO, OBRA POR OBRA'],
  ['4 · COSTO REAL'],
  [],
  ['5 · MATERIALES PREVISTOS — el plan, ítem por ítem (fuera del calendario de caja desde el 24/08)'],
  ['Obra — concepto', 'Familia', 'Proveedor', 'Fecha estimada', 'Previsto', 'Nota'],
  ...items,
  [`⇒ TOTAL — ${items.length} ÍTEMS PREVISTOS`, '', '', '', items.reduce((s, f) => s + (Number(f[4]) || 0), 0), ''],
]

const LAS_TRES = [
  ['PLAYÓN DE AZUFRE — Materiales', 'Materiales', 'FEMENIA', OCT, 7_372_050],
  ['PLAYÓN DE AZUFRE — Materiales', 'Materiales', 'Bedini', OCT, 1_524_200],
  ['SALÓN COMERCIAL — Combustible (gasoil)', 'Combustible', 'ACA', OCT, 300_000, 'lo renegocié en una sola vez'],
]

const porRotulo = (items, rotulo, proveedor) => items.find((i) => i.rotulo === rotulo && i.proveedor === proveedor)
/** Todas las claves de una lista de ítems, como las guarda la memoria. */
const memoriaDe = (items) => clavesDeMemoria(clavesEscritas(items))

// ─────────────────────────────────────────────────────────────────────────────
// (a) EL DEFECTO: UN ÍTEM QUE YA ESTÁ CONSERVA LO QUE EL DUEÑO ESCRIBIÓ
// ─────────────────────────────────────────────────────────────────────────────

test('un ítem existente conserva la FECHA, el IMPORTE y la NOTA del dueño aunque obras-datos diga otra cosa', () => {
  const { items, diagnostico } = fusionarCuadro5({ obras: OBRAS, filas: pestanaDelDueno(LAS_TRES) })
  assert.equal(diagnostico.conservados, 3)
  assert.equal(items.length, 3)

  // La semilla dice 24/08 y $7.372.050; la pestaña dice 01/10. Gana la pestaña.
  const femenia = porRotulo(items, 'PLAYÓN DE AZUFRE — Materiales', 'FEMENIA')
  assert.equal(femenia.fecha, OCT, 'la fecha que el dueño movió al 01/10, no la del 24/08 de obras-datos')
  assert.notEqual(femenia.fecha, serialISO('2026-08-24'))
  assert.equal(femenia.especieFecha, 'fecha', 'un serial se declara `fecha`: como texto la celda mostraría 46296')
  assert.equal(femenia.previsto, 7_372_050)

  // EL CASO MÁS FILOSO: obras-datos declara CUATRO cuotas y el dueño las colapsó en una fecha única
  // con otro importe. Regenerar desde la constante devolvería el texto «10/09 · 10/10 · 10/11 · 10/12».
  const gasoil = porRotulo(items, 'SALÓN COMERCIAL — Combustible (gasoil)', 'ACA')
  assert.equal(gasoil.fecha, OCT, 'las cuotas de obras-datos NO vuelven')
  assert.equal(gasoil.previsto, 300_000, 'el importe que él renegoció, no el de la explosión de gastos')
  assert.equal(gasoil.nota, 'lo renegocié en una sola vez', 'su texto le gana al de obras-datos')
  assert.equal(gasoil.origen, 'pestaña')
})

test('la nota VACÍA en la pestaña no borra la de obras-datos — esa decisión no es de este módulo', () => {
  // Una sola lectura no distingue "la borró" de "todavía no se escribió". Quien sí lo distingue es
  // `respetar-ediciones.mjs`, que confirma un borrado recién cuando persiste dos corridas. Decidirlo
  // acá haría desaparecer el ⚠ de un proveedor que el neteo no ve, en la primera corrida.
  const filas = pestanaDelDueno([['SALÓN COMERCIAL — Combustible (gasoil)', 'Combustible', 'ACA', OCT, 269_584, '']])
  const { items } = fusionarCuadro5({ obras: [OBRAS[1]], filas })
  assert.equal(items[0].nota, '4 cuotas mensuales desde sep; el día 10 es convención')
})

test('la GRILLA escribe lo fusionado, no la semilla: es la punta donde el defecto se veía', () => {
  const fus = fusionarCuadro5({ obras: OBRAS, filas: pestanaDelDueno(LAS_TRES) })
  const g = grillaObras({ obras: OBRAS, materiales: fus.items })
  // Las filas del cuadro 5 son las de `filasMateriales` menos la del TOTAL.
  const filas = g.filasMateriales.slice(0, -1).map((f) => g.filas[f - 1])
  assert.deepEqual(filas.map((f) => f[3]), [OCT, OCT, OCT], 'las tres fechas del dueño')
  assert.deepEqual(filas.map((f) => f[4]), [7_372_050, 1_524_200, 300_000], 'los tres importes del dueño')
  // Y la especie de la D acompaña: `fecha`, no `texto` — la celda tiene que mostrar 01/10, no 46296.
  const especies = g.filasMateriales.slice(0, -1).map((f) => g.especies[f - 1][3])
  assert.deepEqual(especies, ['fecha', 'fecha', 'fecha'])
  // Sin fusión (una grilla que ignora la pestaña) volverían las fechas viejas: es el defecto exacto.
  const seco = grillaObras({ obras: OBRAS })
  const secas = seco.filasMateriales.slice(0, -1).map((f) => seco.filas[f - 1][3])
  assert.deepEqual(secas, [serialISO('2026-08-24'), serialISO('2026-08-24'), '10/09 · 10/10 · 10/11 · 10/12'])
})

// ─────────────────────────────────────────────────────────────────────────────
// (b) y (c) ÍTEM NUEVO vs ÍTEM BORRADO — LOS DOS SE VEN IGUAL SIN MEMORIA
// ─────────────────────────────────────────────────────────────────────────────

test('un ítem NUEVO de obras-datos entra con sus valores de semilla', () => {
  // La pestaña tiene dos de los tres; el tercero nunca se escribió (no está en la memoria) ⇒ es nuevo.
  const filas = pestanaDelDueno(LAS_TRES.slice(0, 2))
  const memoria = memoriaDe([
    { rotulo: 'PLAYÓN DE AZUFRE — Materiales', proveedor: 'FEMENIA' },
    { rotulo: 'PLAYÓN DE AZUFRE — Materiales', proveedor: 'Bedini' },
  ])
  const { items, diagnostico } = fusionarCuadro5({ obras: OBRAS, filas, escritos: memoria })
  assert.deepEqual(diagnostico.sembrados, ['SALÓN COMERCIAL — Combustible (gasoil)'])
  const nuevo = porRotulo(items, 'SALÓN COMERCIAL — Combustible (gasoil)', 'ACA')
  assert.equal(nuevo.origen, 'semilla')
  assert.equal(nuevo.previsto, 269_584, 'el monto de obras-datos')
  assert.equal(nuevo.fecha, '10/09 · 10/10 · 10/11 · 10/12', 'las cuotas van como TEXTO, no como serial')
  assert.equal(nuevo.especieFecha, 'texto')
  // Y va AL FINAL: los que el dueño ya tenía conservan su orden.
  assert.equal(items.at(-1).rotulo, 'SALÓN COMERCIAL — Combustible (gasoil)')
})

test('un ítem que el dueño BORRÓ de la pestaña no se resucita', () => {
  const filas = pestanaDelDueno(LAS_TRES.slice(0, 2))
  // La memoria dice que las tres se escribieron la corrida pasada. La que hoy no está, la borró él.
  const { items, diagnostico } = fusionarCuadro5({
    obras: OBRAS, filas, escritos: memoriaDe(fusionarCuadro5({ obras: OBRAS, filas: [] }).items),
  })
  assert.equal(items.length, 2, 'las dos que quedaron, y nada más')
  assert.equal(diagnostico.sembrados.length, 0)
  assert.deepEqual(diagnostico.omitidos.map((o) => o.rotulo), ['SALÓN COMERCIAL — Combustible (gasoil)'])
  assert.equal(diagnostico.omitidos[0].conMemoria, true)
  assert.match(lineasDeFusion(diagnostico).join('\n'), /NO resucito .*Combustible \(gasoil\)/, 'y se dice en el log')
})

test('SIN memoria no se resucita nada: la dirección segura para equivocarse es la del dueño', () => {
  const { items, diagnostico } = fusionarCuadro5({ obras: OBRAS, filas: pestanaDelDueno(LAS_TRES.slice(0, 2)) })
  assert.equal(items.length, 2)
  assert.equal(diagnostico.omitidos[0].conMemoria, false)
  assert.match(lineasDeFusion(diagnostico).join('\n'), /sin registro de la corrida anterior/)
})

test('un ítem que sólo está en la pestaña es del dueño y se conserva entero', () => {
  const suyo = ['PLAYÓN DE AZUFRE — Andamios', 'Alquiler de equipos', 'Sirvent', OCT, 900_000, 'lo agregué yo']
  const filas = pestanaDelDueno([...LAS_TRES, suyo])
  const { items, diagnostico } = fusionarCuadro5({ obras: OBRAS, filas, escritos: new Set() })
  const mio = porRotulo(items, 'PLAYÓN DE AZUFRE — Andamios', 'Sirvent')
  assert.equal(mio.origen, 'pestaña-sola')
  assert.equal(mio.previsto, 900_000)
  assert.equal(mio.familia, 'Alquiler de equipos', 'su familia, que obras-datos no conoce')
  assert.deepEqual(diagnostico.soloPestana.map((s) => s.rotulo), ['PLAYÓN DE AZUFRE — Andamios'])
})

// ─────────────────────────────────────────────────────────────────────────────
// (d) EL EMPAREJAMIENTO: TOLERA LA FORMA, NO ADIVINA EL SIGNIFICADO
// ─────────────────────────────────────────────────────────────────────────────

test('el rótulo empareja con otras mayúsculas y otros espacios, pero NO adivina', () => {
  assert.equal(claveDeItem('PLAYÓN DE AZUFRE — Materiales', 'FEMENIA'),
    claveDeItem('playón  de   azufre — materiales', ' femenia '), 'mayúsculas y espacios de más')
  assert.equal(claveDeItem('SALÓN COMERCIAL — Gasoil', 'ACA'), claveDeItem('SALÓN COMERCIAL — Gasoil', 'ACA'),
    'el espacio duro que mete el copiar-pegar es un espacio')
  assert.equal(claveDeItem('SALÓN — X', 'A'), claveDeItem('SALÓN — X', 'A'),
    'la Ó compuesta y la descompuesta se ven idénticas en la celda')
  // Y lo que NO se adivina:
  assert.notEqual(claveDeItem('SALON COMERCIAL — Gasoil', 'ACA'), claveDeItem('SALÓN COMERCIAL — Gasoil', 'ACA'), 'sin acento es OTRO')
  assert.notEqual(claveDeItem('PLAYÓN — Pintura', 'X'), claveDeItem('PLAYÓN — Pinturas', 'X'), 'el plural es otro ítem')
  assert.notEqual(claveDeItem('PLAYÓN — Materiales', 'FEMENIA'), claveDeItem('PLAYÓN — Materiales', 'Bedini'),
    'EL PROVEEDOR ES PARTE DE LA CLAVE: tres ítems del archivo real comparten el rótulo «PLAYÓN DE AZUFRE — Materiales»')
})

test('el emparejamiento por forma conserva de verdad: la fila del dueño escrita en minúsculas empareja', () => {
  const filas = pestanaDelDueno([['playón de azufre —  materiales', 'Materiales', 'femenia', OCT, 7_372_050]])
  const { items, diagnostico } = fusionarCuadro5({ obras: [OBRAS[0]], filas, escritos: new Set() })
  assert.equal(diagnostico.conservados, 1, 'emparejó pese a las mayúsculas y al espacio de más')
  assert.equal(items[0].rotulo, 'PLAYÓN DE AZUFRE — Materiales', 'y el rótulo se normaliza al del generador')
  assert.equal(items[0].fecha, OCT)
})

test('dos ítems con el mismo rótulo Y el mismo proveedor no colapsan: cada fila consume uno', () => {
  const obras = [{
    clave: 'o', obra: 'X',
    egresos: [
      { concepto: 'Materiales', proveedor: 'A', familia: 'M', monto: 100, fechaEstimada: '2026-08-24' },
      { concepto: 'Materiales', proveedor: 'A', familia: 'M', monto: 200, fechaEstimada: '2026-08-24' },
    ],
  }]
  const filas = pestanaDelDueno([['X — Materiales', 'M', 'A', OCT, 111], ['X — Materiales', 'M', 'A', OCT, 222]])
  const { items, diagnostico } = fusionarCuadro5({ obras, filas, escritos: new Set() })
  assert.equal(diagnostico.conservados, 2)
  assert.deepEqual(items.map((i) => i.previsto), [111, 222])
})

// ─────────────────────────────────────────────────────────────────────────────
// (e) LA PRIMERA CORRIDA — Y LA LECTURA QUE FALLA, QUE NO ES LO MISMO
// ─────────────────────────────────────────────────────────────────────────────

test('una pestaña SIN cuadro 5 se siembra entera desde obras-datos', () => {
  const sinCuadro = [['OBRAS — EL AÑO ENTERO'], ['4 · COSTO REAL'], ['⇒ TOTAL', '', '', '', 10]]
  const { items, diagnostico } = fusionarCuadro5({ obras: OBRAS, filas: sinCuadro })
  assert.equal(diagnostico.primeraCorrida, true)
  assert.equal(items.length, 3, 'los tres ítems de obras-datos')
  assert.deepEqual(items.map((i) => i.previsto), [7_372_050, 1_524_200, 269_584])
  assert.deepEqual(items.map((i) => i.origen), ['semilla', 'semilla', 'semilla'])
  assert.match(lineasDeFusion(diagnostico)[0], /SIEMBRA COMPLETA de 3/)
})

test('un cuadro 5 PRESENTE pero vacío no es una pestaña sin cuadro: no se siembra a ciegas', () => {
  // La diferencia importa: sembrar acá sería resucitar los 17 ítems que el dueño acaba de vaciar.
  const filas = pestanaDelDueno([])
  const { items, diagnostico } = fusionarCuadro5({ obras: OBRAS, filas, escritos: memoriaDe(fusionarCuadro5({ obras: OBRAS, filas: [] }).items) })
  assert.equal(diagnostico.primeraCorrida, false)
  assert.equal(items.length, 0)
  assert.equal(diagnostico.omitidos.length, 3)
})

test('itemsCrudosDeCuadro5 distingue "no hay cuadro" de "el cuadro está vacío"', () => {
  assert.equal(itemsCrudosDeCuadro5([['nada']]).hayCuadro, false)
  const vacio = itemsCrudosDeCuadro5(pestanaDelDueno([]))
  assert.equal(vacio.hayCuadro, true)
  assert.deepEqual(vacio.items, [])
})

test('la celda cruda viaja SIN interpretar: el serial es serial y el texto de cuotas es texto', () => {
  const filas = pestanaDelDueno([['A — B', 'F', 'P', '10/09 · 10/10', 1000, 'n']])
  const [it] = itemsCrudosDeCuadro5(filas).items
  assert.equal(it.fecha, '10/09 · 10/10', 'NO se explota en cuotas: lo que se lee es lo que se reescribe')
  assert.equal(it.previsto, 1000)
  assert.equal(it.fila, 6, 'la fila 1-based de la pestaña, para nombrarla en el log')
  // Y la hermana que SÍ interpreta sigue haciendo su trabajo, sobre las mismas filas.
  const m = materialesDesdeCuadro5(filas)
  assert.equal(m.movimientos.length, 2, 'el calendario de caja sí explota las cuotas')
})

// ─────────────────────────────────────────────────────────────────────────────
// LAS CELDAS QUE EL DUEÑO DEJÓ VACÍAS Y LA MEMORIA
// ─────────────────────────────────────────────────────────────────────────────

test('una celda vaciada por el dueño se reescribe con el CENTINELA, nunca con la cadena vacía', () => {
  // `''` significa, para `fusionar`, "esta celda no es mía: conservá lo que haya" — y eso conserva por
  // POSICIÓN. El cuadro 5 se corre de fila cada vez que cambia un cuadro de arriba, así que preservar
  // por posición devuelve el valor de OTRO ítem. Es el defecto de capas superpuestas de este repo.
  const filas = pestanaDelDueno([['PLAYÓN DE AZUFRE — Materiales', 'Materiales', 'FEMENIA', '', '']])
  const { items, diagnostico } = fusionarCuadro5({ obras: [OBRAS[0]], filas, escritos: new Set() })
  assert.equal(items[0].fecha, VACIO)
  assert.equal(items[0].previsto, VACIO)
  assert.notEqual(items[0].previsto, '')
  assert.deepEqual(diagnostico.sinImporte.map((s) => s.rotulo), ['PLAYÓN DE AZUFRE — Materiales'],
    'y queda dicho: el libro va a omitir esa fila del calendario')
})

test('la memoria se escribe y se lee con la misma marca, y la marca no puede ser el texto de una celda', () => {
  const items = [{ rotulo: 'X — Y', proveedor: 'P' }]
  const claves = clavesEscritas(items)
  assert.equal(claves.length, 1)
  assert.ok(claves[0].startsWith(MARCA_ESCRITO))
  assert.deepEqual([...clavesDeMemoria(claves)], [claveDeItem('X — Y', 'P')], 'ida y vuelta')
  // Lo que viene del registro NO son sólo claves nuestras: conviven con los rótulos de la Regla 0.
  assert.deepEqual([...clavesDeMemoria([...claves, 'PLAYÓN DE AZUFRE — Materiales'])], [claveDeItem('X — Y', 'P')])
  assert.equal(clavesDeMemoria(null), null, 'sin registro no hay memoria — y eso no es una memoria vacía')
})
