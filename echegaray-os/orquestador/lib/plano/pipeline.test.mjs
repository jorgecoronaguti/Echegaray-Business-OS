// C3 · LA MISMA PIEZA VISTA EN DOS VISTAS ES UNA PIEZA, NO DOS.
//
// El defecto medido: la fusión deduplicaba por `String(e.id)` EXACTO y el id lo escribe el modelo
// mirando cada vista por separado. `PUERTA_BLINDEX` y `PUERTA-BLINDEX` difieren en un signo, y
// sobre la corrida real de Quattropani CINCO grupos llegaban a tener cantidad computada dos veces:
// cuatro puertas blindex donde hay dos, dos tanques, dos rampas, dos portones, dos garitas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fusionarElementos, parecidosSinFusionar, tipoObraDe, firmaNumerica, firmasDiscriminan, contradiccionesDe, mismaMedida, viaDeCantidad, viaDePartida, pedirConDegradacion } from './pipeline.mjs'
import { COMPARABLES, VIA, medidor } from '../conocimiento/metricas.mjs'
import { FUENTE } from './fuente.mjs'

const el = (id, nombre, dims = {}, vista = 'PLANTA', forma = 'conteo') => ({
  id, nombre, forma,
  dimensiones: Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, { valor: v, unidad: 'm' }])),
  evidencia: { vista, textoLiteral: `${nombre} en ${vista}` },
})

test('C3 · dos ids que difieren en un signo son UNA pieza, no dos', () => {
  const r = fusionarElementos([el('PUERTA_BLINDEX', 'Puerta Blindex', {}, 'CORTE B-B'), el('PUERTA-BLINDEX', 'Puerta Blindex', {}, 'PLANTA BAJA')])
  assert.equal(r.elementos.length, 1, 'contarlas dos veces son cuatro puertas donde hay dos')
  assert.deepEqual(r.ambiguos[0].ids, ['PUERTA-BLINDEX', 'PUERTA_BLINDEX'])
  assert.equal(r.ambiguos[0].tipo, 'SOLO_NOMBRE')
  assert.match(r.ambiguos[0].porQue, /se computó una sola vez/)
})

test('C3 · la unión se PROPAGA: A≡B por nombre y B≡C por id hace que los tres sean uno', () => {
  const r = fusionarElementos([
    el('CORR140', 'Correas C140', {}, 'PLANTA'),
    el('correas-C140', 'Correas C140', {}, 'CORTE'),
    el('CORREAS-C140', 'Correa metálica C140', {}, 'DETALLE'),
  ])
  assert.equal(r.elementos.length, 1, 'sin propagar, con una sola clave, quedaban dos')
})

test('C3 · dos vistas parciales COMPLETAN una entera, y gana la que resolvió más', () => {
  const r = fusionarElementos([
    el('C1', 'Columna C1', { ancho: 0.3 }, 'PLANTA'),
    el('c1', 'Columna C1', { ancho: 0.3, alto: 0.5, largo: 3.5 }, 'PLANILLA'),
  ])
  assert.equal(r.elementos.length, 1)
  assert.equal(r.elementos[0].dimensiones.largo.valor, 3.5)
  assert.deepEqual(r.elementos[0].vistoEn, ['PLANILLA', 'PLANTA'])
})

test('C3 · el mismo id con nombres distintos SIGUE fusionando — cambiar de clave sin unir rompe esto', () => {
  const r = fusionarElementos([el('B1', 'Base B1', {}, 'PLANTA'), el('B1', 'Base de hormigón B1', {}, 'CORTE')])
  assert.equal(r.elementos.length, 1)
})

test('C3 · dos piezas que el plano separó a propósito NO se fusionan', () => {
  const r = fusionarElementos([el('VA1', 'Viga VA1'), el('VA2', 'Viga VA2')])
  assert.equal(r.elementos.length, 2, 'comparten todo menos un dígito, y ese dígito es la diferencia')
})

test('C3 · el resultado es TOTAL: dos órdenes distintos dan la misma lista', () => {
  const a = [el('T1', 'Tanque'), el('t-1', 'Tanque'), el('X', 'Otro')]
  assert.deepEqual(fusionarElementos(a).elementos.map((x) => x.id), fusionarElementos([...a].reverse()).elementos.map((x) => x.id))
})

test('C3 · los PARECIDOS por paráfrasis se declaran y NO se fusionan', () => {
  // Normalizar caza «PUERTA_BLINDEX» con «PUERTA-BLINDEX»; no caza «Tanque de reserva 600 litros»
  // con «Tanque de agua 600 litros». Fusionar dos piezas parecidas borraría una partida entera.
  const p = parecidosSinFusionar([
    { id: 'TANQUE', nombre: 'Tanque de reserva 600 litros', forma: 'conteo', evidencia: { vista: 'PLANTA' } },
    { id: 'TQ2', nombre: 'Tanque de agua 600 litros', forma: 'conteo', evidencia: { vista: 'CORTE' } },
  ])
  assert.equal(p.length, 1)
  assert.equal(p[0].fusionadas, false)
  assert.ok(p[0].parecido > 0.5)
  assert.match(p[0].porQue, /NO se fusionaron/)
})

test('C3 · dos piezas con numeración distinta NO entran al balde de parecidos', () => {
  const p = parecidosSinFusionar([
    { id: 'C1', nombre: 'Columna de hormigón C1', forma: 'prisma' },
    { id: 'C2', nombre: 'Columna de hormigón C2', forma: 'prisma' },
  ])
  assert.equal(p.length, 0, 'el proyectista las separó a propósito')
})

test('el tipo de obra sale del contenido antes que del nombre del archivo, y el nombre es INFERIDO', () => {
  const delPlano = tipoObraDe([{ proyecto: { destino: 'Galpón industrial' }, archivo: 'A.pdf' }])
  assert.equal(delPlano.fuente, FUENTE.EXTRAIDO_PLANO)
  const delNombre = tipoObraDe([], null, ['ESTRUCTURA Galpon FRANCO.dwg'])
  assert.equal(delNombre.fuente, FUENTE.INFERIDO)
  assert.equal(tipoObraDe([], null, ['algo.pdf']).esGalpon, false)
})


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA FUSIÓN NO PUEDE ELEGIR ENTRE DOS LECTURAS QUE SE CONTRADICEN
//
// Es la regla que este repo declara en `proyecto.mjs` para los hechos documentales —«elegir una en
// silencio es inventar el resultado de una discusión que todavía no ocurrió»— y que mi propia
// corrección de C3 violaba para las DIMENSIONES y la CANTIDAD, que es donde está el precio. Una
// auditoría midió 13 grupos con geometría distinta entre sus ids y 8 con cantidad distinta,
// fusionados sin comparar nunca si decían lo mismo.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('PÉRDIDA · dos columnas que el proyectista separó a propósito SALEN LAS DOS, con su geometría', () => {
  const C1 = { id: 'C1', nombre: 'Columna metálica', forma: 'prisma', evidencia: { vista: 'PLANTA' }, repeticion: { cantidad: 8 }, dimensiones: { ancho: { valor: 0.3 }, alto: { valor: 0.3 }, largo: { valor: 6 } } }
  const C2 = { id: 'C2', nombre: 'Columna metálica', forma: 'prisma', evidencia: { vista: 'CORTE' }, repeticion: { cantidad: 4 }, dimensiones: { ancho: { valor: 0.4 }, alto: { valor: 0.4 }, largo: { valor: 9 } } }
  const r = fusionarElementos([C1, C2])
  assert.equal(r.elementos.length, 2, 'fusionarlas borraba C2 entera: su sección, su altura, sus 4 unidades y su partida')
  assert.deepEqual(r.elementos.map((e) => e.dimensiones.largo.valor).sort(), [6, 9])
  assert.deepEqual(r.elementos.map((e) => e.repeticion.cantidad).sort(), [4, 8])
  assert.equal(r.ambiguos[0].tipo, 'PIEZAS_DISTINTAS')
})

test('PÉRDIDA · el guard numérico vale también para FUSIONAR, con números que DISCRIMINAN', () => {
  assert.equal(firmaNumerica({ id: '2C200', nombre: 'Perfil 2C200' }), '2-200', 'los números se deduplican: id y nombre repiten los mismos')
  assert.equal(firmaNumerica({ id: 'C200', nombre: 'Perfil C200' }), '200')
  // Números disjuntos: son dos designaciones del proyectista y salen las dos.
  const disjuntos = fusionarElementos([
    { id: 'VA1', nombre: 'Viga', forma: 'lineal', dimensiones: {}, repeticion: {} },
    { id: 'VA2', nombre: 'Viga', forma: 'lineal', dimensiones: {}, repeticion: {} },
  ])
  assert.equal(disjuntos.elementos.length, 2)

  // `200` CONTENIDO en `2-200` NO discrimina: no se afirma que sean dos, se declara que no se sabe.
  // La primera versión de este test exigía que salieran dos, y eso era afirmar una certeza que la
  // evidencia no da — un «2» adelante puede ser un perfil doble o un sufijo que puso el modelo.
  const contenidos = fusionarElementos([
    { id: '2C200', nombre: 'Perfil', forma: 'lineal', dimensiones: {}, repeticion: {} },
    { id: 'C200', nombre: 'Perfil', forma: 'lineal', dimensiones: {}, repeticion: {} },
  ])
  assert.equal(contenidos.elementos.length, 1)
  assert.equal(contenidos.ambiguos[0].tipo, 'NUMERACION_INDECIDIBLE')
})

test('PÉRDIDA · misma pieza con lecturas que se CONTRADICEN: la medida sale como HUECO, no elegida', () => {
  const A = { id: 'CME', nombre: 'Columna CMe', forma: 'prisma', evidencia: { vista: 'A' }, repeticion: { cantidad: 2 }, dimensiones: { alto: { valor: 0.1 }, ancho: { valor: 0.1 } } }
  const B = { id: 'CMe', nombre: 'Columna CMe', forma: 'prisma', evidencia: { vista: 'B' }, repeticion: { cantidad: 2 }, dimensiones: { alto: { valor: 0.8 }, ancho: { valor: 0.8 } } }
  const r = fusionarElementos([A, B])
  assert.equal(r.elementos.length, 1)
  assert.equal(r.elementos[0].dimensiones.alto.valor, null, 'un factor 8 en el lado no se resuelve quedándose con uno')
  assert.match(r.elementos[0].dimensiones.alto.porque, /CME=0\.1.*CMe=0\.8/, 'el hueco lleva las DOS versiones y de qué vista salió cada una')
  assert.equal(r.ambiguos[0].tipo, 'GEOMETRIA_INCOMPATIBLE')
})

test('PÉRDIDA · cantidades que se contradicen abren la cantidad, y el elemento deja de computar', () => {
  const r = fusionarElementos([
    { id: 'BANO', nombre: 'Baño', forma: 'conteo', evidencia: { vista: 'A' }, dimensiones: {}, repeticion: { modo: 'conteo_directo', cantidad: 2 } },
    { id: 'LOCAL-BANO', nombre: 'Baño', forma: 'conteo', evidencia: { vista: 'B' }, dimensiones: {}, repeticion: { modo: 'conteo_directo', cantidad: 3 } },
  ])
  assert.equal(r.elementos.length, 1)
  assert.equal(r.elementos[0].repeticion.cantidad, null)
  assert.equal(r.elementos[0].repeticion.modo, 'indeterminable')
  assert.equal(r.ambiguos[0].tipo, 'CANTIDAD_DISTINTA')
})

test('LOS 54 GRUPOS NO PUEDEN SALIR CON EL MISMO TEXTO: cada tipo se distingue', () => {
  const soloNombre = fusionarElementos([
    { id: 'PUERTA_BLINDEX', nombre: 'Puerta Blindex', forma: 'conteo', dimensiones: {}, repeticion: { cantidad: 2 } },
    { id: 'PUERTA-BLINDEX', nombre: 'Puerta Blindex', forma: 'conteo', dimensiones: {}, repeticion: { cantidad: 2 } },
  ])
  assert.equal(soloNombre.ambiguos[0].tipo, 'SOLO_NOMBRE')
  assert.equal(soloNombre.ambiguos[0].quienLoResuelve, 'nadie — está resuelto')
  assert.match(soloNombre.ambiguos[0].porQue, /no se contradicen en ninguna medida/)
})

test('`ambiguos` NO viaja colgado de un array: un .filter() lo borraba en silencio', () => {
  const r = fusionarElementos([{ id: 'A', nombre: 'X', forma: 'conteo', dimensiones: {}, repeticion: {} }])
  assert.ok(Array.isArray(r.elementos))
  assert.ok(Array.isArray(r.ambiguos))
  assert.equal(r.elementos.ambiguos, undefined, 'si vuelve a colgarse del array, la cotización puede salir COMPLETA sin serlo')
})

test('contradiccionesDe sólo mira donde LAS DOS lecturas declaran: completar no es contradecir', () => {
  const c = contradiccionesDe([
    { id: 'A', dimensiones: { largo: { valor: 6 } }, repeticion: { cantidad: 2 } },
    { id: 'B', dimensiones: { ancho: { valor: 0.3 } }, repeticion: {} },
  ])
  assert.equal(c.geometria.length, 0, 'que uno tenga el largo y el otro el ancho es lo que la fusión sirve para completar')
  assert.equal(c.cantidad, null)
  assert.equal(mismaMedida(3.5, 3.4999), true)
  assert.equal(mismaMedida(0.1, 0.8), false)
})


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL GUARD NUMÉRICO NO PUEDE AFIRMAR QUE SABE CUANDO UN LADO NO TIENE NÚMERO
//
// Los tests de C3 anclaban `PUERTA_BLINDEX`/`PUERTA-BLINDEX`, que no tiene números de NINGÚN lado,
// así que ninguno se ponía rojo si el guard empeoraba justo donde falla: cuando UNA de las dos
// firmas está vacía o contenida en la otra. Un elemento sin número no puede haber sido «separado a
// propósito» de uno con número — no hay nada que separar—, y afirmarlo le dice al que revisa que
// no mire. Estos tres casos salen del caché real.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const cont = (id, nombre, n) => ({ id, nombre, forma: 'conteo', dimensiones: {}, repeticion: { modo: 'conteo_directo', cantidad: n }, evidencia: { vista: 'V' } })

test('GUARD · sólo discriminan dos conjuntos de números NO VACÍOS donde ninguno contiene al otro', () => {
  assert.equal(firmasDiscriminan('1', '2'), true, 'C1 contra C2: designaciones del proyectista')
  assert.equal(firmasDiscriminan('', '1'), false, 'un lado sin número no separa nada')
  assert.equal(firmasDiscriminan('600', '1-600'), false, '«600» dentro de «1-600» es un sufijo de serie')
  assert.equal(firmasDiscriminan('2-200', '200'), false)
  assert.equal(firmasDiscriminan('1-2', '3-4'), true)
})

test('GUARD · MATAFUEGO (4) contra MAT1 (3) NO se declara «piezas distintas»: se declara que NO SE SABE', () => {
  const r = fusionarElementos([cont('MATAFUEGO', 'Matafuego triclase ABC 5Kg', 4), cont('MAT1', 'Matafuego triclase ABC 5Kg', 3)])
  assert.equal(r.ambiguos[0].tipo, 'CANTIDAD_DISTINTA', 'antes salía PIEZAS_DISTINTAS con «el proyectista los separó a propósito»')
  assert.equal(r.elementos[0].repeticion.cantidad, null, 'cuatro en planta baja y tres en el entrepiso PUEDEN ser siete: el sistema no lo sabe')
  assert.notEqual(r.ambiguos[0].quienLoResuelve, 'nadie — se computan por separado, que es lo correcto')
})

test('GUARD · un sufijo de serie sin contradicción sale NUMERACION_INDECIDIBLE, no SOLO_NOMBRE', () => {
  // `SOLO_NOMBRE` afirmaría que está resuelta, y no lo está: no sabemos si «garita-gas» y «GAR-2»
  // son una garita o dos. Lo que sí sabemos es que el cómputo no cambia si lo son.
  const r = fusionarElementos([cont('garita-gas', 'Garita de gas', 1), cont('GAR-2', 'Garita de gas', 1)])
  assert.equal(r.elementos.length, 1)
  assert.equal(r.ambiguos[0].tipo, 'NUMERACION_INDECIDIBLE')
  assert.match(r.ambiguos[0].porQue, /NO SE SABE si son una pieza o dos/)
  assert.match(r.ambiguos[0].quienLoResuelve, /sólo para confirmar/)
})

test('GUARD · una firma contenida en otra tampoco separa: «600» dentro de «1-600»', () => {
  const r = fusionarElementos([cont('tanque-600', 'Tanque de reserva 600 litros', 2), cont('TQ1', 'Tanque de reserva 600 litros', 2)])
  assert.equal(r.elementos.length, 1)
  assert.equal(r.ambiguos[0].tipo, 'NUMERACION_INDECIDIBLE')
})

test('GUARD · y C1 contra C2 SIGUE saliendo como dos piezas: el arreglo no aflojó el caso real', () => {
  const r = fusionarElementos([cont('C1', 'Columna', 8), cont('C2', 'Columna', 4)])
  assert.equal(r.elementos.length, 2)
  assert.equal(r.ambiguos[0].tipo, 'PIEZAS_DISTINTAS')
  assert.deepEqual(r.elementos.map((e) => e.repeticion.cantidad).sort(), [4, 8])
})

// ═══════════════ LO QUE MIDE LA AUTONOMÍA ═══════════════
//
// Estos controles publican el Claude Avoidance Rate. Un indicador de autonomía que no se puede
// poner en rojo es propaganda, así que cada uno tiene acá su caso contrario.

test('una cantidad leída del plano NO es aritmética: entra al denominador del avoidance rate', () => {
  // El defecto medido: se anotaba `REGLA`, y `REGLA` está fuera de COMPARABLES a propósito (nadie
  // le pregunta a un modelo cuánto es 3+4). Con eso las 28 cantidades de Quattropani desaparecían
  // del denominador y el indicador quedaba sesgado hacia arriba por construcción.
  assert.equal(viaDeCantidad({ tieneCantidad: true, porCad: false, deCache: false }), VIA.MODELO, 'la leyó el modelo en esta corrida')
  assert.equal(viaDeCantidad({ tieneCantidad: true, porCad: false, deCache: true }), VIA.CACHE, 'la leyó el modelo alguna vez y hoy salió del caché')
  assert.notEqual(viaDeCantidad({ tieneCantidad: true, porCad: false, deCache: true }), VIA.REGLA)
  assert.ok(COMPARABLES.includes(viaDeCantidad({ tieneCantidad: true, porCad: false, deCache: true })))
})

test('sólo el CAD resuelve una cantidad sin haber pasado nunca por un modelo', () => {
  assert.equal(viaDeCantidad({ tieneCantidad: true, porCad: true, deCache: false }), VIA.DOCUMENTO_LOCAL)
})

test('NEGATIVO: sin cantidad es HUECO, y un hueco no cuenta como resuelto', () => {
  assert.equal(viaDeCantidad({ tieneCantidad: false, porCad: true, deCache: true }), VIA.HUECO)
  assert.ok(!COMPARABLES.includes(VIA.HUECO))
})

test('una partida que el modelo vetó no se cuenta como resuelta por la Base Maestra', () => {
  assert.equal(viaDePartida({ mapeada: true, vetadaPorModelo: false }), VIA.BASE_MAESTRA)
  assert.equal(viaDePartida({ mapeada: true, vetadaPorModelo: true }), VIA.MODELO)
  assert.equal(viaDePartida({ mapeada: false, vetadaPorModelo: false }), VIA.HUECO)
})

test('el Claude Avoidance Rate BAJA cuando el modelo resuelve — probado con las dos corridas', () => {
  const contar = (vias) => { const m = medidor({ ahora: () => 0 }); for (const v of vias) m.decidio({ que: 'x', via: v }); return m.resumen() }
  // La misma obra, caché caliente: las 20 lecturas y las 28 cantidades salen del caché.
  const caliente = contar([...Array(20).fill(VIA.CACHE), ...Array(28).fill(VIA.CACHE), ...Array(7).fill(VIA.BASE_MAESTRA), ...Array(104).fill(VIA.HUECO)])
  // La misma obra, caché frío y modelo vivo: las mismas 48 las resuelve el modelo.
  const frio = contar([...Array(20).fill(VIA.MODELO), ...Array(28).fill(VIA.MODELO), ...Array(7).fill(VIA.BASE_MAESTRA), ...Array(104).fill(VIA.HUECO)])
  assert.equal(caliente.claudeAvoidanceRate, 1)
  assert.equal(frio.claudeAvoidanceRate, Math.round((7 / 55) * 1000) / 1000, 'con el modelo trabajando el indicador tiene que caer, no quedarse en 100%')
  assert.ok(frio.claudeAvoidanceRate < 0.13)
  assert.equal(caliente.comparables, frio.comparables, 'el denominador no cambia entre las dos: lo que cambia es quién resolvió')
})

// ═══════════════ EL CONTRATO DE DEGRADACIÓN ═══════════════

test('NEGATIVO: sin proveedor de razonamiento, la degradación se DECLARA — no se disimula', async () => {
  const { pedirSeguro, degradacion } = pedirConDegradacion(null, { permitirModelo: false })
  assert.equal(degradacion.hubo, false, 'todavía no pasó nada')
  const r = await pedirSeguro({ funcion: 'interpretar-plano' })
  assert.equal(r.texto, null)
  assert.equal(r.degradado, 'modelo apagado')
  assert.equal(degradacion.hubo, true, 'si esto siguiera en false, el contrato sería una constante')
  assert.equal(degradacion.intentos, 0, 'apagado no intenta: por eso no suma intentos')
  assert.equal(degradacion.fallos, 1)
  assert.deepEqual(degradacion.motivos[0].funciones, ['interpretar-plano'])
})

test('un fallo REAL del proveedor también degrada, y trae el mensaje', async () => {
  const { pedirSeguro, degradacion } = pedirConDegradacion(async () => { throw new Error('credit balance is too low') }, {})
  const r = await pedirSeguro({ funcion: 'interpretar-region' })
  assert.equal(r.texto, null)
  assert.match(r.degradado, /credit balance/)
  assert.equal(degradacion.hubo, true)
  assert.equal(degradacion.intentos, 1, 'acá SÍ se intentó')
  assert.equal(degradacion.fallos, 1)
  assert.match(degradacion.motivos[0].motivo, /el proveedor de razonamiento falló/)
})

test('con el proveedor sano NO hay degradación — el control puede dar verde de verdad', async () => {
  const { pedirSeguro, degradacion } = pedirConDegradacion(async () => ({ texto: '{"ok":1}', modelo: 'x' }), {})
  const r = await pedirSeguro({ funcion: 'interpretar-plano' })
  assert.equal(r.texto, '{"ok":1}')
  assert.equal(degradacion.hubo, false)
  assert.equal(degradacion.intentos, 1)
  assert.equal(degradacion.fallos, 0)
})
