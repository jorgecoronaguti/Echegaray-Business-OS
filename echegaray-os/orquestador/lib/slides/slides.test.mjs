// Los defectos que este motor existe para no cometer, escritos como tests.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CONTENIDO, COLOR, PAGINA, TIPO, columnas, contraste } from './marca.mjs'
import { ajustarTamano, anchoTexto, medirTexto, repartirBullets, seSuperponen } from './layout.mjs'
import { validarPresentacion } from './contrato.mjs'
import { componerDeck, expandirLaminas } from './plantillas.mjs'
import { altoReal, corregirDeck, fondoDetras, revisarDeck, revisarLamina } from './qa.mjs'
import { prepararDeck, requestsDelDeck } from './motor.mjs'
import { oid, requestsCrearLaminas } from './requests.mjs'

const deck = (laminas, extra = {}) => ({ tipo: 'DIRECCION', titulo: 'Reunión de Dirección', fecha: '27/08/2026', laminas, ...extra })

// ── La medición, que es de donde sale todo lo demás ────────────────────────────────────────
test('medir texto distingue mayúsculas anchas de minúsculas finas (el factor plano miente)', () => {
  const anchas = anchoTexto('MINIMIZACIÓN DE RIESGOS', 25)
  const finas = anchoTexto('lililililililililililil', 25)
  assert.ok(anchas > finas * 1.6, `anchas=${anchas.toFixed(0)} finas=${finas.toFixed(0)}`)
})

test('una palabra sola más ancha que la caja se parte, no desaparece', () => {
  const m = medirTexto('https://www.argentina.gob.ar/normativa/nacional/resolucion-1234-2026-987654', { ancho: 90, tamano: 12 })
  assert.ok(m.lineas > 1)
  assert.equal(m.textoLineas.join(''), 'https://www.argentina.gob.ar/normativa/nacional/resolucion-1234-2026-987654')
})

test('el autoajuste tiene piso: no baja el cuerpo hasta que nadie lo lea', () => {
  const r = ajustarTamano('x'.repeat(4000), { ancho: 100, altoDisponible: 20, tamano: 12.5 })
  assert.equal(r.entra, false)
  assert.ok(r.tamano >= 10, `bajó a ${r.tamano}`)
})

// ── El control de calidad ───────────────────────────────────────────────────────────────────
test('QA detecta el texto que no entra en su caja', () => {
  const lamina = {
    nombre: 'prueba', numero: 1, fondo: COLOR.papel,
    cajas: [{ id: 't1', tipo: 'texto', x: 44, y: 40, ancho: 200, alto: 14, capa: 'contenido', contenido: 'Un párrafo bastante largo que no cabe en catorce puntos de alto, ni cerca.', estilo: TIPO.cuerpo }],
  }
  const h = revisarLamina(lamina)
  assert.ok(h.some((x) => x.tipo === 'desborde' && x.severidad === 'bloqueante'), JSON.stringify(h))
})

test('QA detecta el texto ilegible sobre su propio fondo', () => {
  const lamina = {
    nombre: 'prueba', numero: 1, fondo: COLOR.papel,
    cajas: [
      { id: 'r1', tipo: 'rect', x: 40, y: 40, ancho: 300, alto: 60, capa: 'fondo', relleno: COLOR.amarillo },
      { id: 't1', tipo: 'texto', x: 50, y: 50, ancho: 200, alto: 40, capa: 'contenido', contenido: 'ilegible', estilo: { ...TIPO.cuerpo, color: COLOR.papel } },
    ],
  }
  const h = revisarLamina(lamina)
  assert.ok(h.some((x) => x.tipo === 'contraste'), JSON.stringify(h))
  assert.equal(fondoDetras(lamina.cajas[1], lamina), COLOR.amarillo)
  assert.ok(contraste(COLOR.papel, COLOR.amarillo) < 4.5)
})

test('QA detecta dos cajas de contenido que se pisan', () => {
  const caja = (id, y) => ({ id, tipo: 'texto', x: 44, y, ancho: 200, alto: 40, capa: 'contenido', contenido: 'hola', estilo: TIPO.cuerpo })
  const h = revisarLamina({ nombre: 'p', numero: 1, fondo: COLOR.papel, cajas: [caja('a', 40), caja('b', 60)] })
  assert.ok(h.some((x) => x.tipo === 'superposicion'))
  assert.equal(seSuperponen({ x: 0, y: 0, ancho: 10, alto: 10 }, { x: 10, y: 0, ancho: 10, alto: 10 }), false)
})

test('la corrección automática achica el texto que desborda, y lo deja anotado', () => {
  const compuesto = {
    laminas: [{
      nombre: 'p', fondo: COLOR.papel,
      cajas: [{ id: 't1', tipo: 'texto', x: 44, y: 40, ancho: 300, alto: 30, capa: 'contenido', contenido: 'Un texto que necesita bastante más alto del que tiene disponible acá', estilo: TIPO.cuerpo }],
    }],
  }
  const { compuesto: fijo, correcciones } = corregirDeck(compuesto)
  assert.equal(correcciones.length, 1)
  assert.ok(fijo.laminas[0].cajas[0].estilo.tamano < TIPO.cuerpo.tamano)
  assert.ok(altoReal(fijo.laminas[0].cajas[0]) < altoReal(compuesto.laminas[0].cajas[0]))
})

// ── El defecto real que se encontró armando esto ────────────────────────────────────────────
test('CUATRO indicadores con importes en millones NO desbordan la tarjeta', () => {
  // El defecto: con 4 tarjetas quedan 118 pt útiles y «$ 84,2 M» a 30 pt mide 126 — se partía en
  // dos líneas, se comía la nota de abajo y la lámina salía pisada. El cuerpo del valor se calcula
  // contra el ancho REAL de la tarjeta. Si eso se revierte, este test se pone rojo.
  const d = componerDeck(validarPresentacion(deck([{
    tipo: 'indicadores', titulo: 'Posición de caja',
    indicadores: [
      { rotulo: 'Caja disponible', valor: '$ 84,2 M', tono: 'positivo' },
      { rotulo: 'Descubierto usado', valor: '$ 31,0 M', tono: 'negativo', nota: 'costo 1.506,85 por día y por millón' },
      { rotulo: 'Cheques a debitar 30d', valor: '$ 57,4 M' },
      { rotulo: 'IVA a pagar', valor: '$ 12,8 M', tono: 'alerta' },
    ],
  }])).deck)
  const r = revisarDeck(d)
  assert.equal(r.bloqueantes, 0, JSON.stringify(r.hallazgos, null, 1))
})

test('un mazo de Dirección completo se compone sin un solo defecto bloqueante', () => {
  const v = validarPresentacion(deck([
    { tipo: 'seccion', titulo: 'Caja' },
    { tipo: 'tabla', titulo: 'Obligaciones de la quincena', columnas: ['Concepto', 'Vence', 'Importe'], filas: [['UOCRA jornales', '29/08', '$ 22,4 M'], ['IERIC', '30/08', '$ 1,2 M']], alinear_derecha: [2] },
    { tipo: 'barras', titulo: 'Costo financiero', unidad: '$ por millón y por día', series: [{ rotulo: 'Descubierto Santander', valor: 1506, texto: '1.507', tono: 'negativo' }, { rotulo: 'FONDEFIN', valor: 410, texto: '410', tono: 'positivo' }] },
    { tipo: 'hitos', titulo: 'Próximos 90 días', hitos: [{ fecha: 'SEP', titulo: 'Cierre Pisos', estado: 'en_curso' }, { fecha: 'OCT', titulo: 'Certificación 4' }, { fecha: 'NOV', titulo: 'Recepción provisoria' }] },
    { tipo: 'dos_columnas', titulo: 'Qué decidimos', izquierda: { titulo: 'Avanza', puntos: ['Compra de la hormigonera'] }, derecha: { titulo: 'Espera', puntos: ['Renovación de la flota'] } },
    { tipo: 'cierre', titulo: 'Decisiones pendientes', mensaje: 'Tres decisiones necesitan tu firma.' },
  ]))
  assert.equal(v.ok, true, JSON.stringify(v.errores))
  const r = revisarDeck(componerDeck(v.deck))
  assert.equal(r.bloqueantes, 0, JSON.stringify(r.hallazgos, null, 1))
})

// ── El reparto ──────────────────────────────────────────────────────────────────────────────
test('doce viñetas se reparten en varias láminas y las siguientes dicen (cont.)', () => {
  const puntos = Array.from({ length: 12 }, (_, i) => `Punto ${i + 1}: un desvío de obra explicado con el detalle suficiente para entenderlo sin preguntar.`)
  const laminas = expandirLaminas([{ tipo: 'puntos', titulo: 'Desvíos', puntos, origen: 'ECSAS' }])
  assert.ok(laminas.length > 1, 'no partió nada')
  assert.equal(laminas[0].titulo, 'Desvíos')
  assert.match(laminas[1].titulo, /\(cont\.\)$/)
  assert.equal(laminas.flatMap((l) => l.puntos).length, 12)
  const r = revisarDeck(componerDeck(validarPresentacion(deck([{ tipo: 'puntos', titulo: 'Desvíos', puntos }])).deck))
  assert.equal(r.bloqueantes, 0, JSON.stringify(r.hallazgos, null, 1))
})

test('el reparto no deja una lámina con una sola viñeta huérfana', () => {
  const items = Array.from({ length: 7 }, (_, i) => `Ítem ${i + 1} con texto suficiente para ocupar una línea entera de la lámina.`)
  const grupos = repartirBullets(items, { ancho: CONTENIDO.ancho, altoDisponible: 6 * 12.5 * 1.42 * 1.5, tamano: 12.5 })
  if (grupos.length > 1) assert.ok(grupos.at(-1).length > 1, `quedó huérfana: ${JSON.stringify(grupos.map((g) => g.length))}`)
})

// ── La frontera con el modelo ───────────────────────────────────────────────────────────────
test('el contrato NO deja que el contenido pida posición, color ni tipografía', () => {
  const v = validarPresentacion(deck([{ tipo: 'puntos', titulo: 't', puntos: ['a'], x: 10, color: '#FF0000', fontSize: 40, ancho: 500 }]))
  assert.equal(v.ok, true)
  const l = v.deck.laminas[0]
  for (const prohibido of ['x', 'color', 'fontSize', 'ancho']) {
    assert.equal(Object.hasOwn(l, prohibido), false, `el modelo consiguió pedir ${prohibido}`)
  }
})

test('un dato externo obliga a declarar la fuente con URL, y el mazo cierra con la lámina de fuentes', () => {
  assert.equal(validarPresentacion(deck([{ tipo: 'puntos', titulo: 't', puntos: ['a'], origen: 'EXTERNO', fuentes: [{ titulo: 'INDEC', url: 'no-es-una-url' }] }])).ok, false)
  const v = validarPresentacion(deck([{ tipo: 'puntos', titulo: 'Contexto', puntos: ['IPC julio 2,1%'], origen: 'EXTERNO', fuentes: [{ titulo: 'INDEC — IPC julio 2026', url: 'https://www.indec.gob.ar/ipc', obtenido_en: '27/08/2026' }] }]))
  const d = componerDeck(v.deck)
  assert.equal(d.laminas.at(-1).nombre, 'fuentes')
  assert.equal(d.resumen.fuentes_externas, 1)
  // La lámina externa lleva la pastilla y la cita al pie: se distingue mirándola.
  const externa = d.laminas.find((l) => l.nombre === 'puntos')
  assert.ok(externa.cajas.some((c) => c.contenido === 'FUENTE EXTERNA'))
  assert.ok(externa.cajas.some((c) => String(c.contenido).startsWith('Fuente externa:')))
})

// ── La traducción a la API ──────────────────────────────────────────────────────────────────
test('todo objectId cumple el mínimo de 5 caracteres que exige la Slides API', () => {
  const prep = prepararDeck(deck([
    { tipo: 'tabla', titulo: 'Tabla', columnas: ['a', 'b'], filas: [['1', '2']] },
    { tipo: 'puntos', titulo: 'Puntos', puntos: ['x'] },
  ]))
  assert.equal(prep.ok, true, JSON.stringify(prep))
  const { principales, imagenes } = requestsDelDeck(prep.compuesto)
  const ids = [...principales, ...imagenes].flatMap((r) => Object.values(r).map((v) => v.objectId)).filter(Boolean)
  assert.ok(ids.length > 20)
  for (const id of ids) {
    assert.ok(id.length >= 5 && /^[\w-]+$/.test(id), `id inválido: "${id}"`)
  }
  assert.equal(oid('r_1').length >= 5, true)
})

test('las imágenes salen en su propio lote: si el logo falla, no se cae el mazo', () => {
  const prep = prepararDeck(deck([{ tipo: 'puntos', titulo: 'Puntos', puntos: ['x'] }]))
  const { principales, imagenes } = requestsDelDeck(prep.compuesto)
  assert.ok(imagenes.length > 0)
  assert.equal(principales.some((r) => r.createImage), false)
  assert.equal(imagenes.every((r) => r.createImage), true)
})

test('el interlineado se traduce a porcentaje del simple, no al número crudo', () => {
  const prep = prepararDeck(deck([{ tipo: 'puntos', titulo: 'Puntos', puntos: ['x'], bajada: 'una bajada' }]))
  const { principales } = requestsDelDeck(prep.compuesto)
  const parrafos = principales.filter((r) => r.updateParagraphStyle).map((r) => r.updateParagraphStyle.style.lineSpacing)
  assert.ok(parrafos.length > 0)
  // 1,42 de interlineado sobre un simple de 1,2 = 118,3%, nunca 142%.
  assert.ok(parrafos.includes(118.3), JSON.stringify(parrafos))
  assert.ok(parrafos.every((v) => v >= 85 && v <= 125), JSON.stringify(parrafos))
})

test('se crea una lámina por cada lámina compuesta, en orden', () => {
  const prep = prepararDeck(deck([{ tipo: 'seccion', titulo: 'A' }, { tipo: 'puntos', titulo: 'B', puntos: ['x'] }]))
  const req = requestsCrearLaminas(prep.compuesto.laminas.length)
  assert.equal(req.length, prep.compuesto.laminas.length)
  assert.equal(req[0].createSlide.insertionIndex, 0)
  assert.equal(req[0].createSlide.slideLayoutReference.predefinedLayout, 'BLANK')
})

// ── La grilla ───────────────────────────────────────────────────────────────────────────────
test('la grilla cierra: doce columnas ocupan exactamente el ancho útil', () => {
  assert.equal(Number(columnas(12).toFixed(6)), CONTENIDO.ancho)
  assert.equal(CONTENIDO.x + CONTENIDO.ancho, PAGINA.ancho - 44)
})

test('el motor se niega a publicar contenido que no entra, en vez de dejar un link roto', () => {
  const puntos = ['a'.repeat(299)]
  const prep = prepararDeck(deck([{
    tipo: 'indicadores', titulo: 'x',
    indicadores: [{ rotulo: 'r'.repeat(48), valor: '9'.repeat(24), nota: 'n'.repeat(70) }, { rotulo: 'b', valor: '1' }],
  }, { tipo: 'puntos', titulo: 'y', puntos }]))
  // Puede entrar o no según la corrección; lo que NO puede pasar es publicar con bloqueantes.
  if (!prep.ok) assert.ok(prep.motivo && prep.qa)
  else assert.equal(prep.qa.bloqueantes, 0)
})
