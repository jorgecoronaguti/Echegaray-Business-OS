// C3 · LA MISMA PIEZA VISTA EN DOS VISTAS ES UNA PIEZA, NO DOS.
//
// El defecto medido: la fusión deduplicaba por `String(e.id)` EXACTO y el id lo escribe el modelo
// mirando cada vista por separado. `PUERTA_BLINDEX` y `PUERTA-BLINDEX` difieren en un signo, y
// sobre la corrida real de Quattropani CINCO grupos llegaban a tener cantidad computada dos veces:
// cuatro puertas blindex donde hay dos, dos tanques, dos rampas, dos portones, dos garitas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fusionarElementos, parecidosSinFusionar, tipoObraDe, firmaNumerica, firmasDiscriminan, contradiccionesDe, mismaMedida, tieneNumero, viaDeCantidad, viaDePartida, pedirConDegradacion } from './pipeline.mjs'
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

test('NEGATIVO: cuando no se sabe de dónde salió la lectura, NO se cuenta como caché', () => {
  // Suponer caché ante la duda sube el Claude Avoidance Rate sin evidencia — la dirección exacta
  // en la que este indicador ya mintió una vez.
  assert.equal(viaDeCantidad({ tieneCantidad: true, porCad: false, deCache: undefined }), VIA.MODELO)
  assert.equal(viaDeCantidad({ tieneCantidad: true, porCad: false, deCache: null }), VIA.MODELO)
  assert.equal(viaDeCantidad({ tieneCantidad: true, porCad: false, deCache: true }), VIA.CACHE)
})

test('«lo que salió igual sin modelo» cuenta lo COMPUTADO, no todos los elementos', () => {
  // Ésta era la única de las nueve correcciones sin guardia: revertirla a `computo.items.length`
  // dejaba la suite en verde, y el bloque volvía a publicar 111 donde hay 28.
  const items = [
    { id: 'A', cantidad: { valor: 2.16 } },
    { id: 'B', cantidad: { valor: null } },
    { id: 'C' },
    { id: 'D', cantidad: { valor: 0 } },
  ]
  const contados = items.filter((i) => tieneNumero(i?.cantidad?.valor)).length
  assert.equal(contados, 2, 'A y D tienen número; B y C no. Si contara la lista entera daría 4')
  assert.notEqual(contados, items.length)
  // Y el motivo por el que este test encontró un defecto de verdad: `Number(null)` es 0 y es
  // finito, así que el filtro anterior contaba a B —cantidad explícitamente en null— como medido.
  assert.equal(Number.isFinite(Number(null)), true, 'la trampa, dicha en voz alta')
  assert.equal(tieneNumero(null), false)
  assert.equal(tieneNumero(0), true, 'un cero medido SÍ es un número: si dijera false, no sería un control')
})

test('NEGATIVO: el módulo se puede IMPORTAR y sus funciones internas existen de verdad', async () => {
  // El defecto: `export { X } from './otro.mjs'` publica el binding para quien importe, pero NO
  // crea binding local. Los dos usos internos de `tieneNumero` tiraban `ReferenceError` en la
  // primera corrida — y typecheck, eslint y los 11.000 tests seguían en VERDE, porque ningún test
  // llamaba a `correr()` de punta a punta y los tests importaban la función re-exportada.
  // Verde en todo y el producto muerto. Este test importa el módulo y ejerce la función.
  const m = await import('./pipeline.mjs')
  assert.equal(typeof m.tieneNumero, 'function')
  assert.equal(m.tieneNumero(null), false)
  assert.equal(m.tieneNumero(0), true)
  // Y las tres funciones que `correr()` usa por dentro, ejercidas desde afuera.
  assert.equal(typeof m.viaDeCantidad, 'function')
  assert.equal(typeof m.viaDePartida, 'function')
  assert.equal(typeof m.pedirConDegradacion, 'function')
})


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// B1/B2 · LEER EN PARALELO NO PUEDE CAMBIAR EL RESULTADO
//
// Las láminas y las vistas son independientes y se leían de a una: veinte láminas tardaban veinte
// veces lo que tarda una. Paralelizarlas es correcto; hacerlo por la vía obvia —empujar al array a
// medida que llegan— NO lo es, porque deja la salida en orden de LATENCIA. Este repo publica
// `huella(seleccion)` para poder afirmar «dos corridas dieron lo mismo»: una lista que se reordena
// sola rompe esa afirmación sin romper nada visible. Los tests de abajo desordenan los tiempos a
// propósito y exigen la salida en orden de entrada.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { enParalelo } from './paralelo.mjs'
import { leerLaminas, leerVistas, vistasAMirar } from './lectura.mjs'
import { cacheDeLecturas } from './cache-lecturas.mjs'

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
/** Un medidor de mentira que además GUARDA el orden: si el paralelismo desordenara las métricas,
 *  el Claude Avoidance Rate de dos corridas iguales saldría con los mismos números en otro orden. */
const medidorFalso = () => {
  const decisiones = []
  const llamadas = []
  return { decisiones, llamadas, decidio: (d) => decisiones.push(d.que), llamo: (l) => llamadas.push(l.funcion) }
}

test('B1 · el orden de la salida es el de la ENTRADA, aunque las respuestas lleguen al revés', async () => {
  // La primera tarda 40 ms y la última 1: en orden de llegada saldrían exactamente invertidas.
  const demoras = [40, 30, 20, 10, 1]
  const { resultados, cancelada, hechos } = await enParalelo(
    demoras.map((ms, i) => ({ i, ms })),
    async (u) => { await dormir(u.ms); return u.i },
    { concurrencia: 5 })
  assert.deepEqual(resultados, [0, 1, 2, 3, 4], 'en orden de llegada esto daría [4,3,2,1,0] y la huella cambiaría sola')
  assert.equal(cancelada, false)
  assert.equal(hechos, 5)
})

test('B1 · la concurrencia SOLAPA de verdad, y nunca pasa del tope pedido', async () => {
  let vivas = 0
  let pico = 0
  const trabajo = async () => { vivas += 1; pico = Math.max(pico, vivas); await dormir(15); vivas -= 1 }
  const t0 = Date.now()
  await enParalelo(Array.from({ length: 8 }, (_, i) => i), trabajo, { concurrencia: 4 })
  const ms = Date.now() - t0
  assert.equal(pico, 4, 'si el pico fuera 1 seguiría siendo secuencial y este test es lo único que lo nota')
  assert.ok(ms < 8 * 15, `ocho unidades de 15 ms de a cuatro no pueden tardar lo que tardan de a una (tardó ${ms} ms)`)
})

test('B1 · con concurrencia 1 el pico es 1: el control PUEDE dar el valor contrario', async () => {
  let vivas = 0
  let pico = 0
  await enParalelo([1, 2, 3], async () => { vivas += 1; pico = Math.max(pico, vivas); await dormir(1); vivas -= 1 }, { concurrencia: 1 })
  assert.equal(pico, 1)
})

test('CANCELAR · se corta ENTRE unidades y lo ya empezado se termina — esa llamada ya se pagó', async () => {
  const empezadas = []
  const terminadas = []
  let cortar = false
  const r = await enParalelo(
    [0, 1, 2, 3, 4, 5, 6, 7],
    async (i) => { empezadas.push(i); await dormir(10); terminadas.push(i); if (i >= 1) cortar = true; return i },
    { concurrencia: 2, cancelado: async () => cortar })
  assert.equal(r.cancelada, true)
  assert.equal(empezadas.length, terminadas.length, 'una llamada de visión cortada a mitad se paga y se tira')
  assert.ok(r.resultados.length < 8, 'si cancelar no cortara nada, esto no sería un control')
  assert.deepEqual(r.resultados, [...r.resultados].sort((a, b) => a - b), 'lo que sí se hizo sale igual en orden de entrada')
})

test('CANCELAR · si cancela antes de empezar, no se gasta una sola llamada', async () => {
  let llamadas = 0
  const r = await enParalelo([1, 2, 3], async () => { llamadas += 1 }, { cancelado: async () => true })
  assert.equal(llamadas, 0)
  assert.equal(r.cancelada, true)
  assert.deepEqual(r.resultados, [])
})

test('PROGRESO · se avisa al terminar cada unidad, con el conteo REAL y el total', async () => {
  const avisos = []
  await enParalelo(['a', 'b', 'c'], async (x) => x, {
    concurrencia: 1, fase: 'laminas', que: (x) => x,
    onProgreso: async (p) => avisos.push(p),
  })
  assert.deepEqual(avisos.map((a) => a.hecho), [1, 2, 3], 'el conteo es el de terminadas, no el del índice')
  assert.deepEqual(avisos.map((a) => a.que), ['a', 'b', 'c'])
  assert.ok(avisos.every((a) => a.fase === 'laminas' && a.total === 3))
})

const docPlano = (n) => ({ name: `L${n}.pdf`, drive_file_id: `id-${n}`, mime_type: 'application/pdf' })
const usoFalso = (etiqueta) => ({ modelo: etiqueta, tokens: { in: 1, out: 2 }, usd: 0.01, ms: 1 })

test('B1 · `laminas` y `usos` salen en el orden de `planos.legibles`, no en el de llegada', async () => {
  const demoras = [40, 5, 25, 1]
  const met = medidorFalso()
  const usos = []
  const r = await leerLaminas({
    docs: demoras.map((_, i) => docPlano(i)),
    pedir: async () => ({}), cache: cacheDeLecturas({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'cache-vacio-')) }),
    met, anotar: (u) => { if (u) usos.push(u.modelo) }, concurrencia: 4,
    trabajar: async (doc) => {
      const i = Number(doc.name.match(/\d+/)[0])
      await dormir(demoras[i])
      return { doc, lam: { archivo: doc.name, elementos: [], deCache: false, uso: usoFalso(`lam-${i}`) }, m: { elementos: [], uso: usoFalso(`med-${i}`) }, medicion: { deCache: false } }
    },
  })
  assert.deepEqual(r.laminas.map((l) => l.archivo), ['L0.pdf', 'L1.pdf', 'L2.pdf', 'L3.pdf'])
  assert.deepEqual(usos, ['lam-0', 'med-0', 'lam-1', 'med-1', 'lam-2', 'med-2', 'lam-3', 'med-3'], 'interpretar y medir de cada lámina, en orden, igual que cuando era secuencial')
  assert.deepEqual(met.decisiones, ['lámina L0.pdf', 'lámina L1.pdf', 'lámina L2.pdf', 'lámina L3.pdf'])
  assert.equal(r.cancelada, false)
})

test('B1 · una lámina que Drive ya no tiene se DECLARA y no tumba a las otras', async () => {
  const met = medidorFalso()
  const r = await leerLaminas({
    docs: [docPlano(0), docPlano(1)], met, anotar: () => {},
    cache: cacheDeLecturas({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'cache-vacio-')) }),
    trabajar: async (doc) => (doc.name === 'L0.pdf'
      ? { doc, noDescargable: '404' }
      : { doc, lam: { archivo: doc.name, elementos: [], deCache: false, uso: null }, m: { elementos: [], uso: null }, medicion: { deCache: false } }),
  })
  assert.deepEqual(r.noDescargables.map((d) => d.name), ['L0.pdf'])
  assert.deepEqual(r.laminas.map((l) => l.archivo), ['L1.pdf'])
})

const recorteFalso = (n, titulo) => ({ ok: true, ruta: `/no/existe/${n}.png`, region: { n, titulo, tipo: 'planta' } })

test('B2 · `porRegion` sale en el orden segmentación→lámina→recorte, con respuestas desordenadas', async () => {
  const segmentaciones = [
    { archivo: 'A.pdf', laminas: [{ recortes: [recorteFalso(1, 'PLANTA'), recorteFalso(2, 'CORTE')] }] },
    { archivo: 'B.pdf', laminas: [{ recortes: [recorteFalso(3, 'DETALLE'), { ok: false, region: { n: 9, tipo: 'planta' } }, recorteFalso(4, 'CARATULA', 'caratula')] }] },
  ]
  const demoras = { PLANTA: 30, CORTE: 2, DETALLE: 15, CARATULA: 1 }
  const met = medidorFalso()
  const r = await leerVistas({
    segmentaciones, met, anotar: () => {}, concurrencia: 4,
    cache: cacheDeLecturas({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'cache-vacio-')) }),
    interpretar: async (rec) => { await dormir(demoras[rec.region.titulo]); return { region: rec.region, elementos: [], deCache: false, uso: null } },
  })
  assert.deepEqual(r.porRegion.map((x) => x.region.titulo), ['PLANTA', 'CORTE', 'DETALLE', 'CARATULA'])
  assert.deepEqual(r.porRegion.map((x) => x.archivo), ['A.pdf', 'A.pdf', 'B.pdf', 'B.pdf'])
  assert.deepEqual(met.decisiones, ['vista PLANTA', 'vista CORTE', 'vista DETALLE', 'vista CARATULA'])
})

test('B2 · un recorte fallido o de un tipo que no se mira NO gasta una llamada', () => {
  const u = vistasAMirar([{ archivo: 'A.pdf', laminas: [{ recortes: [
    { ok: false, region: { n: 1, tipo: 'planta' } },
    { ok: true, region: { n: 2, tipo: 'caratula' } },
    { ok: true, region: { n: 3, tipo: 'corte' } },
  ] }] }])
  assert.deepEqual(u.map((x) => x.recorte.region.n), [3], 'la carátula no tiene nada que computar y el recorte roto no tiene nada que mirar')
})


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// D2 · EL TOPE DE GASTO DEGRADA, NO TIRA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('D2 · pasado el tope, las llamadas que faltan se DEGRADAN con un motivo propio', async () => {
  let llamadas = 0
  const { pedirSeguro, degradacion } = pedirConDegradacion(
    async () => { llamadas += 1; return { texto: '{}', usd: 0.6, modelo: 'x' } },
    { topeUsd: 1 })
  assert.equal((await pedirSeguro({ funcion: 'interpretar-plano' })).texto, '{}')
  assert.equal((await pedirSeguro({ funcion: 'interpretar-plano' })).texto, '{}', 'la segunda cruza el tope pero ya estaba empezada: se paga y se usa')
  const tercera = await pedirSeguro({ funcion: 'interpretar-region' })
  assert.equal(tercera.texto, null)
  assert.equal(tercera.degradado, 'tope de gasto alcanzado')
  assert.notEqual(tercera.degradado, 'modelo apagado', 'sin saldo y sin presupuesto son dos problemas distintos')
  assert.equal(llamadas, 2, 'la tercera no se hizo: si se hubiera hecho, el tope no serviría para nada')
  assert.equal(degradacion.hubo, true)
  assert.match(degradacion.motivos[0].motivo, /tope de gasto/)
  assert.equal(Math.round(degradacion.usd * 100) / 100, 1.2)
  assert.equal(degradacion.topeUsd, 1)
})

test('D2 · con `topeUsd: null` no cambia absolutamente nada — el default preserva la conducta', async () => {
  let llamadas = 0
  const { pedirSeguro, degradacion } = pedirConDegradacion(async () => { llamadas += 1; return { texto: 'ok', usd: 999 } }, {})
  for (let i = 0; i < 5; i++) assert.equal((await pedirSeguro({})).texto, 'ok')
  assert.equal(llamadas, 5)
  assert.equal(degradacion.hubo, false)
  assert.equal(degradacion.topeUsd, null)
})

test('D2 · el tope NO tira: una corrida que se cae por el tope pierde todo lo que ya pagó', async () => {
  const { pedirSeguro } = pedirConDegradacion(async () => ({ texto: 'x', usd: 5 }), { topeUsd: 0.01 })
  await pedirSeguro({ funcion: 'f' })
  await assert.doesNotReject(() => pedirSeguro({ funcion: 'f' }))
})


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// D1 · EL CACHÉ DE LECTURAS NUNCA DECIDE SI EL PIPELINE FUNCIONA
//
// Cada entrada es una llamada de visión ya cobrada. Se mudó a Postgres porque el disco del worker
// muere con la máquina, pero la regla del `try/catch` original no se relaja: sin base, con base
// caída o con la migración sin aplicar, la corrida sigue igual contra el disco.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const dirTemporal = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cache-planos-'))
/** Una base de mentira con UNA tabla. `select` y `insert ... on conflict`, nada más. */
const baseFalsa = () => {
  const filas = new Map()
  return {
    filas,
    query: async (sql, params) => {
      if (/^\s*select/i.test(sql)) return { rows: filas.has(params[0]) ? [{ valor: filas.get(params[0]) }] : [] }
      filas.set(params[0], JSON.parse(params[1]))
      return { rows: [] }
    },
  }
}

test('D1 · SIN base, el caché es el de disco de siempre y sirve lo que ya está guardado', async () => {
  const dir = dirTemporal()
  const c = cacheDeLecturas({ dir })
  assert.equal(await c.guardar('v2:abc', { crudo: { a: 1 } }), 'disco')
  assert.deepEqual(await c.leer('v2:abc'), { crudo: { a: 1 } })
  assert.equal(await c.leer('v2:noexiste'), null)
  assert.ok(fs.existsSync(path.join(dir, 'v2:abc.json')), 'el nombre del archivo NO cambia: los 135 que ya están se llaman así')
})

test('D1 · con la base CAÍDA —o la migración sin aplicar— el caché no tira y cae al disco', async () => {
  const dir = dirTemporal()
  const rota = async () => { throw new Error('relation "orq.plano_lectura_cache" does not exist') }
  const c = cacheDeLecturas({ query: rota, dir })
  assert.equal(await c.guardar('v2:xyz', { crudo: { b: 2 } }), 'disco', 'si esto tirara, una tabla que falta tumbaría la cotización entera')
  assert.deepEqual(await c.leer('v2:xyz'), { crudo: { b: 2 } })
})

test('D1 · con la base viva se guarda y se lee de la base, con la MISMA llave de contenido', async () => {
  const dir = dirTemporal()
  const base = baseFalsa()
  const c = cacheDeLecturas({ query: base.query, dir })
  assert.equal(await c.guardar('v2:aaa:medicion', { elementos: [1] }), 'base')
  assert.deepEqual(await c.leer('v2:aaa:medicion'), { elementos: [1] })
  assert.ok(base.filas.has('v2:aaa:medicion'), 'la llave es la del hash del contenido, no un id nuevo')
  assert.ok(!fs.existsSync(path.join(dir, 'v2:aaa:medicion.json')), 'con base no se duplica en disco')
})

test('D1 · los 135 archivos que ya están se PROMUEVEN solos: el disco se cosecha, no se tira', async () => {
  const dir = dirTemporal()
  fs.writeFileSync(path.join(dir, 'v1:viejo.json'), JSON.stringify({ crudo: { viejo: true } }))
  const base = baseFalsa()
  const c = cacheDeLecturas({ query: base.query, dir })
  assert.deepEqual(await c.leer('v1:viejo'), { crudo: { viejo: true } }, 'una lectura ya pagada no se vuelve a pagar por haber cambiado de casa')
  assert.deepEqual(base.filas.get('v1:viejo'), { crudo: { viejo: true } }, 'y quedó en la base sin que nadie corriera un script')
})

test('D1 · `interpretarLamina` sirve del caché SIN llamar al modelo — probado por la ruta real', async () => {
  const dir = dirTemporal()
  const c = cacheDeLecturas({ dir })
  const bytes = Buffer.from('un plano cualquiera')
  const m = await import('./lectura.mjs')
  let llamadas = 0
  const pedir = async () => { llamadas += 1; return { texto: '{"elementos":[]}', usd: 0.5 } }
  const doc = { name: 'P.pdf', drive_file_id: 'x', mime_type: 'application/pdf' }
  const primera = await m.interpretarLamina(doc, bytes, { pedir, cache: c })
  assert.equal(primera.deCache, false)
  assert.equal(llamadas, 1)
  const segunda = await m.interpretarLamina(doc, bytes, { pedir, cache: c })
  assert.equal(segunda.deCache, true)
  assert.equal(llamadas, 1, 'si volviera a llamar, el caché sería decorativo y cada corrida pagaría de nuevo')
  // Y `refrescar` tiene que poder ignorarlo: si no, el control no puede dar el valor contrario.
  await m.interpretarLamina(doc, bytes, { pedir, cache: c, refrescar: true })
  assert.equal(llamadas, 2)
})


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `correr()` DE PUNTA A PUNTA, AUNQUE SEA VACÍA
//
// Este archivo ya documenta el día en que typecheck, eslint y 11.000 tests estaban en verde con el
// producto muerto: nadie llamaba a `correr()`. Mover cuatro funciones a otro módulo es exactamente
// el cambio que puede dejar un `ReferenceError` que ningún test unitario ve. Corre sin Drive, sin
// modelo y sin láminas: no gasta un centavo y prueba que la función ENTERA se ejecuta.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const queryVacia = async () => ({ rows: [] })

test('CORRER · una corrida sin documentos se ejecuta entera y declara que no fue cancelada', async () => {
  const m = await import('./pipeline.mjs')
  const r = await m.correr({ query: queryVacia, google: null, termino: 'obra que no existe', conDrive: false, permitirModelo: false })
  assert.equal(r.cancelada, false)
  assert.equal(r.laminas.length, 0)
  assert.equal(r.ia.llamadas, 0)
  assert.equal(typeof r.huella, 'string', 'la huella se calcula igual: es lo que compara dos corridas')
  assert.equal(r.degradacion.topeUsd, null, 'sin `topeUsd` no hay tope: `Number(null)` es 0 y eso ya degradó una corrida entera')
})

test('CORRER · `cancelado` llega hasta la lectura y el resultado lo DECLARA, sin tirar', async () => {
  const m = await import('./pipeline.mjs')
  const r = await m.correr({ query: queryVacia, google: null, termino: 'x', conDrive: false, permitirModelo: false, cancelado: async () => true })
  assert.equal(r.cancelada, true, 'si esto quedara en false, cancelar sería un botón que no hace nada')
  assert.deepEqual(r.porRegion, [], 'cancelado no empieza las vistas: cancelar es dejar de gastar')
})

test('CORRER · `topeUsd: 0` degrada la corrida y lo dice con su motivo, en vez de tirar', async () => {
  const m = await import('./pipeline.mjs')
  const r = await m.correr({ query: queryVacia, google: null, termino: 'x', conDrive: false, topeUsd: 0 })
  assert.equal(r.degradacion.topeUsd, 0)
  assert.equal(r.cancelada, false, 'degradar por presupuesto NO es cancelar: son dos cosas y se leen distinto')
})
