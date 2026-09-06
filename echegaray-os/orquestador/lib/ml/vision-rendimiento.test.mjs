import test from 'node:test'
import assert from 'node:assert/strict'
import { rendimiento, computarLectura, gananciaDeFusionar, claveDeElemento, tipoDeLectura } from './vision-rendimiento.mjs'
import { llaveDeRecorte, leerLlaveDeRecorte } from '../ingesta/recortes.mjs'

/** Un elemento tal como lo devuelve el modelo — crudo, con `largo_m` y no con `largo`. */
const el = (id, { forma = 'lineal', dim = {}, cantidad = null, modo = 'conteo_directo', texto = 'evidencia' } = {}) => ({
  id, nombre: `pieza ${id}`, sistema: 'estructura_metalica', forma,
  dimensiones: { ancho_m: null, alto_m: null, largo_m: null, espesor_m: null, area_m2: null, profundidad_m: null, ...dim },
  repeticion: { modo, cantidad, longitud_tramo_m: null, separacion_m: null, incluye_extremos: null, texto_literal: 'x' },
  evidencia: { vista: 'v', texto_literal: texto, ubicacion: 'u' },
})
const lectura = (region, elementos, archivo = 'plano.pdf') => ({ region, archivo, crudo: { elementos } })

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL RENDIMIENTO SE MIDE CON EL CRITERIO DE PRODUCCIÓN, NO CON UNO PROPIO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('un lineal con sección y sin largo NO se computa — es el 4× que inflaba la medición vieja', () => {
  const seccion = el('CM1', { dim: { ancho_m: 0.08, alto_m: 0.24, espesor_m: 0.0032 }, cantidad: 6 })
  const entero = el('CM2', { dim: { largo_m: 2.6 }, cantidad: 3 })
  const r = rendimiento([lectura('DETALLE UNION', [seccion, entero])])
  assert.equal(r.elementos, 2)
  assert.equal(r.computados, 1, 'la sección sin largo no es un renglón de cotización, es una pregunta')
  assert.equal(r.pct, 50)
})

test('un `conteo` computa con sólo la cantidad, y un `superficie` sin área no', () => {
  // No es el mismo listón para todos: lo decide la FORMA. Si alguien uniforma el criterio, rojo.
  const r = rendimiento([lectura('PLANTA', [
    el('B1', { forma: 'conteo', cantidad: 4 }),
    el('L1', { forma: 'superficie', dim: { espesor_m: 0.12 }, cantidad: 1 }),
  ])])
  assert.equal(r.computados, 1)
  assert.equal(r.porForma.find((f) => f.forma === 'conteo').computados, 1)
  assert.equal(r.porForma.find((f) => f.forma === 'superficie').computados, 0)
})

test('el motivo del hueco sale agrupado, no una frase distinta por elemento', () => {
  const r = rendimiento([lectura('DETALLE', [
    el('A', { dim: { ancho_m: 0.1 } }),
    el('B', { dim: { alto_m: 0.2 } }),
  ])])
  const largo = r.motivos.find((m) => m.motivo === 'largo')
  assert.ok(largo && largo.n === 2, `los dos huecos de largo tienen que ser UN motivo con n=2: ${JSON.stringify(r.motivos)}`)
})

test('`archivo` es obligatorio: sin él ninguna cantidad sería citable y el número diría otra cosa', () => {
  const e = [el('C1', { forma: 'conteo', cantidad: 2 })]
  assert.equal(computarLectura({ crudo: { elementos: e } }, 'plano.pdf').admitidas, 1)
  assert.equal(computarLectura({ crudo: { elementos: e } }, null).admitidas, 0,
    'sin archivo la cantidad no se puede rastrear — y ese 0 sería un artefacto del parámetro, no del plano')
})

test('la subcapacidad usa el clasificador de producción y no adivina la que no tiene título', () => {
  assert.equal(tipoDeLectura({ region: 'PLANTA DE FUNDACIONES' }), 'planta')
  assert.equal(tipoDeLectura({ region: null }), 'indeterminado')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA FUSIÓN DE VISTAS — Y LAS DOS FORMAS EN QUE SU NÚMERO PUEDE SER MENTIRA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('fusionar dos vistas completa el elemento que ninguna de las dos podía computar', () => {
  // Es el reparto real de la losa L1 en `Javier Eduardo Nasser1-Modelo.pdf`: la PLANILLA da la luz
  // («LUZ (m) 2,10») y dice explícitamente que no sabe cuántas losas L1 hay; el DETALLE da el ancho
  // («b= 50 cm») y tampoco cuenta. Una `superficie` necesita área, o largo Y ancho: ninguna de las
  // dos computa sola, y el ancho SÓLO puede llegar desde la otra vista.
  //
  // Si `aportadas` vuelve a leer las dimensiones como números crudos —después de `validarLamina`
  // son objetos `{ valor, unidad, evidencia }`— la fusión copia cero dimensiones y esto da 0. Así
  // salió −1 sobre los datos reales y parecía un hallazgo sobre la segmentación.
  const planilla = lectura('Planilla losa (Tipo Chirino)', [el('L1', { forma: 'superficie', dim: { largo_m: 2.1 }, cantidad: null, modo: 'indeterminable' })])
  const detalle = lectura('Detalle L1', [el('L1', { forma: 'superficie', dim: { ancho_m: 0.5 }, cantidad: 1 })])
  const g = gananciaDeFusionar({ 'plano.pdf': [planilla, detalle] })
  assert.equal(g.grupos, 1)
  assert.equal(g.multivista, 1)
  assert.equal(g.computablesSueltos, 0, 'ninguna de las dos vistas computa sola')
  assert.equal(g.computablesFusionados, 1, 'el ancho tiene que venir de la OTRA vista')
  assert.equal(g.ganados, 1)
})

test('la fusión NUNCA puede perder: heredar el «no computable» de una vista sin cita daba −1', () => {
  // La primera vista vino sin texto literal, así que `validarElemento` la marca no computable y el
  // cómputo corta antes de mirar una dimensión. Arrancando por la primera, la fusión PERDÍA un
  // elemento que la segunda sí sostenía.
  const sinCita = lectura('vista A', [el('C1', { forma: 'conteo', cantidad: 3, texto: '' })])
  const conCita = lectura('vista B', [el('C1', { forma: 'conteo', cantidad: 3, texto: 'C1 ×3' })])
  const g = gananciaDeFusionar({ 'plano.pdf': [sinCita, conCita] })
  assert.equal(g.computablesSueltos, 1)
  assert.ok(g.ganados >= 0, `una fusión que pierde mide el orden del caché, no la segmentación: ${g.ganados}`)
})

test('una ganancia 0 sin multivista no significa nada, y el resultado lo dice', () => {
  const g = gananciaDeFusionar({ 'plano.pdf': [lectura('PLANTA', [el('A'), el('B')])] })
  assert.equal(g.multivista, 0, 'sin elementos repetidos entre vistas no había nada que fusionar')
  assert.equal(g.ganados, 0)
})

test('la clave de un elemento junta las marcas iguales y separa las formas distintas', () => {
  assert.equal(claveDeElemento({ id: 'C-1', forma: 'lineal' }), claveDeElemento({ id: 'c1', forma: 'lineal' }))
  assert.notEqual(claveDeElemento({ id: 'C1', forma: 'lineal' }), claveDeElemento({ id: 'C1', forma: 'conteo' }))
  assert.equal(claveDeElemento({ id: null, nombre: null }), null, 'sin marca ni nombre no se agrupa con nada')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL ENLACE CON EL PLANO — LO QUE EL CACHÉ DE LECTURAS NO GUARDA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('leerLlaveDeRecorte es el inverso exacto de llaveDeRecorte', () => {
  const hash = 'a'.repeat(64)
  const caja = [105.64, 637.91, 924.5, 2329]
  const llave = llaveDeRecorte(hash, 3, caja, 128)
  const v = leerLlaveDeRecorte(`${llave}.png`)
  assert.equal(v.hashArchivo, hash.slice(0, 16))
  assert.equal(v.pagina, 3)
  assert.equal(v.dpi, 128)
  assert.deepEqual(v.caja, caja.map((n) => Math.round(n * 10) / 10))
})

test('un archivo que no es un recorte devuelve null, no un recorte con la caja en cero', () => {
  assert.equal(leerLlaveDeRecorte('v3region:abc.json'), null)
  assert.equal(leerLlaveDeRecorte('README.md'), null)
  assert.equal(leerLlaveDeRecorte(''), null)
})
