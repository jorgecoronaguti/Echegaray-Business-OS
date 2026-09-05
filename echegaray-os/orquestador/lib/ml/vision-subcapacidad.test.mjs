import test from 'node:test'
import assert from 'node:assert/strict'
import {
  origenDeCampo, subcapacidadDeLectura, pesoDeCampos, elementoAporta, descomponer,
  normalizarTexto, respaldo, verificarLectura,
} from './vision-subcapacidad.mjs'

// ═══ LA DESCOMPOSICIÓN TIENE QUE SEPARAR, NO PROMEDIAR ═══
// El error que este archivo existe para atrapar: medir «visión» como UNA capacidad. Si
// `descomponer` volviera a devolver una sola fila, estos tests se ponen rojos.

const lectura = (region, elementos, extra = {}) => ({ region, crudo: { elementos, ...extra } })
const el = (id, { dim = null, cantidad = null, texto = null } = {}) => ({
  id, nombre: id, sistema: 'x', forma: 'lineal',
  dimensiones: { ancho_m: null, alto_m: dim, largo_m: null },
  repeticion: { modo: 'x', cantidad },
  evidencia: { vista: 'v', texto_literal: texto },
})

test('cada tipo de vista es una subcapacidad distinta, no un promedio', () => {
  const d = descomponer([
    lectura('PLANTA BAJA', [el('C1', { dim: 3 })]),
    lectura('CORTE A-A', [el('V1', { cantidad: 2 })]),
    lectura('DETALLE DE UNIÓN', [el('U1')]),
    lectura('PLANILLA DE COLUMNAS', [el('P1')]),
  ], { usdTotal: 10, llamadasReales: 4 })
  const tipos = d.porTipo.map((t) => t.tipo).sort()
  assert.deepEqual(tipos, ['corte', 'cuadro', 'detalle', 'planta'])
  // Y el costo se reparte: si alguna quedara en 0 sería que no se le asignó su parte.
  assert.equal(d.porTipo.reduce((a, t) => a + t.usd, 0) > 9, true)
})

test('una lectura sin título NO se adivina: queda indeterminada', () => {
  // Inventarle el tipo desde el contenido de la respuesta sería clasificar la pregunta con la
  // respuesta — el modelo se auto-confirmaría.
  assert.equal(subcapacidadDeLectura({ region: null }).tipo, 'indeterminado')
  assert.equal(subcapacidadDeLectura({ region: 'CORTE B-B' }).tipo, 'corte')
})

test('la cobertura declara que la muestra no es la población', () => {
  const d = descomponer([lectura('PLANTA', [el('a')])], { usdTotal: 17.69, llamadasReales: 169 })
  assert.equal(d.muestra, 1)
  assert.equal(d.llamadasReales, 169)
  assert.ok(d.cobertura < 1, 'una muestra de 1 sobre 169 no puede reportarse como 100%')
})

// ═══ EL CONTROL TIENE QUE PODER DECIR QUE NO ═══

test('elementoAporta NO es una constante: distingue computable de no computable', () => {
  // La primera versión aceptaba cualquier campo no nulo y devolvía true para los 840 elementos
  // medidos. Si alguien la vuelve a aflojar, este test se pone rojo.
  assert.equal(elementoAporta(el('C1', { dim: 0.3 })), true, 'con dimensión, computa')
  assert.equal(elementoAporta(el('C2', { cantidad: 12 })), true, 'con cantidad, computa')
  assert.equal(elementoAporta(el('C3', { texto: 'PGC 160' })), false,
    'nombre, forma y evidencia NO alcanzan: sin dimensión ni cantidad no se puede cotizar')
  assert.equal(elementoAporta(null), false)
})

test('el reparto por campo separa lo escrito en el plano de lo que hay que mirar', () => {
  assert.equal(origenDeCampo('elementos'), 'DIBUJO')
  assert.equal(origenDeCampo('proyecto'), 'TEXTO')
  assert.equal(origenDeCampo('inventado'), 'DESCONOCIDO')
  const { pesos, total } = pesoDeCampos({ a: [1, 2], b: null })
  assert.equal(total, pesos.a + pesos.b)
})

// ═══ LA VERIFICACIÓN CONTRA TEXTO, Y SU CONTROL NEGATIVO ═══

test('respaldo distingue no-medible de no-coincide', () => {
  assert.equal(respaldo('', 'lo que sea'), null, 'sin tokens no se midió — no es un 0')
  assert.equal(respaldo('columna 160', ''), null, 'sin capa de texto no se midió')
  assert.equal(respaldo('columna 160', 'la columna es 160'), 1)
  assert.equal(respaldo('viga 220', 'la columna es 160'), 0)
})

test('CONTROL NEGATIVO: la verificación baja contra el plano equivocado', () => {
  // Éste es el test que impide repetir el error de medir un modelo contra una tarea que no existe.
  // Si `verificarLectura` empezara a dar alto contra CUALQUIER texto, dejó de medir.
  const l = lectura('PLANTA', [
    el('C1', { texto: 'columna CM1 perfil 160' }),
    el('C2', { texto: 'viga VP2 luz 480' }),
  ])
  const propia = 'planta baja columna CM1 perfil 160 y viga VP2 con luz 480 cm'
  const ajena = 'planilla de losas del edificio vecino espesor 12 tipo chirino'
  const v = verificarLectura(l, propia, ajena)
  assert.equal(v.verificables, 2)
  assert.equal(v.tasaPropio, 1)
  assert.equal(v.tasaAjeno, 0)
  assert.equal(v.brecha, 1)
})

test('sin control negativo la brecha es null, no un número que parezca bueno', () => {
  const l = lectura('PLANTA', [el('C1', { texto: 'columna 160' })])
  const v = verificarLectura(l, 'columna 160')
  assert.equal(v.tasaPropio, 1)
  assert.equal(v.brecha, null, 'un 100% sin control negativo no se puede interpretar')
})

test('un texto genérico NO consigue brecha: es el caso que engaña al emparejamiento', () => {
  // Tokens que están en todos los planos. La brecha tiene que colapsar sola.
  const l = lectura('PLANTA', [el('C1', { texto: '160 200 e' })])
  const a = 'perfil 160 largo 200 espesor e'
  const b = 'otra cosa 160 y 200 con e adentro'
  const v = verificarLectura(l, a, b)
  assert.equal(v.brecha, 0, 'si el ajeno también coincide, la brecha es 0 y el número no vale')
})

test('normalizarTexto saca acentos y puntuación para que «H° A°» empareje', () => {
  assert.equal(normalizarTexto('DETALLE DE VIGAS Y COLUMNAS DE H° A°'), 'detalle de vigas y columnas de h a')
})

test('un respaldo PARCIAL no cuenta como verificado', () => {
  // Este test lo puso una mutación: bajar el umbral de 0,99 a 0,3 no ponía rojo nada, así que
  // «verificado» podía degradarse a «coincide la mitad» sin que nadie se enterara. Media
  // coincidencia sobre un plano es ruido: los planos comparten vocabulario entre vistas.
  const l = lectura('PLANTA', [el('C1', { texto: 'columna CM1 perfil 160' })])
  const propia = 'la columna tiene un perfil'   // 2 de 4 tokens: falta CM1 y 160
  assert.equal(respaldo('columna CM1 perfil 160', propia), 0.5)
  assert.equal(verificarLectura(l, propia).tasaPropio, 0,
    'con la mitad de los tokens el elemento NO está respaldado por la capa de texto')
})
