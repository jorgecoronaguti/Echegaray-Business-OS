// EL MOTOR DOCUMENTAL. Lo que cada test afirma es algo que, si se rompiera, haría que el OS
// afirme cosas falsas sobre un papel — que es peor que no poder leerlo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarFormato, LEIBLES } from './formato.mjs'
import { clasificarPorTexto, sensibilidadDe } from './clasificar.mjs'
import { extraerCampos, aNumero, aFecha, cuitValido } from './campos.mjs'
import { fragmentar, MINIMO } from './fragmentar.mjs'
import { permitido } from '../drive-busqueda/contenido.mjs'

const bytes = (...xs) => Buffer.from(xs)

// ── EL FORMATO SALE DE LOS BYTES, NO DEL RÓTULO ──────────────────────────────────────────────────

test('un PDF es un PDF aunque Drive diga otra cosa', () => {
  const f = detectarFormato(bytes(0x25, 0x50, 0x44, 0x46, 0x2d), 'application/octet-stream')
  assert.equal(f.tipo, 'pdf')
  assert.equal(f.leible, true)
  assert.equal(f.coincide, false, 'y se declara que el mime declarado no coincidía')
})

test('lo que el OS no sabe abrir se declara, no se procesa como si fuera texto', () => {
  const f = detectarFormato(bytes(0x00, 0x01, 0x02, 0x03))
  assert.equal(f.tipo, 'desconocido')
  assert.equal(f.leible, false)
  assert.equal(LEIBLES.has('pdf'), true)
})

// ── LA CLASIFICACIÓN ─────────────────────────────────────────────────────────────────────────────

const ACUSE = `Presentación de DJ por Internet
Acuse de Recibo de DJ · Organismo Recaudador: AFIP
Formulario: 931 v4400 - EMPLEADOR DJ MENSUAL-SUSS
CUIT: 30-71630464-3 · Impuesto: 301 - EMPLEADOR-APORTES SEG. SOCIAL
Período: 2023-10 · Nro. de Transacción: 9123 · Fecha de Presentación: 2023-11-09`

test('un acuse de un F.931 es un ACUSE, no la declaración jurada', () => {
  // Los dos tipos disparan: el acuse dice «931» y dice «SUSS». No es un empate — uno contiene al
  // otro. El acuse prueba que se presentó; el F.931 es lo presentado, y no lo tenemos.
  const r = clasificarPorTexto(ACUSE)
  assert.equal(r.tipo, 'acuse_arca')
  assert.ok(r.evidencia.length >= 2, 'y dice qué leyó para decidirlo')
})

test('una boleta del IERIC NO es una nota de crédito', () => {
  // Defecto real del 04/09: tres boletas de multa del IERIC entraron como notas de crédito porque
  // la regla se conformaba con ver «CAE». Una nota de crédito RESTA; etiquetar mal ahí es un error
  // de signo, no de catálogo.
  const boleta = `EMPLEADOR FECHA DE VENCIMIENTO DE PAGO 09/06/26 TOTAL A PAGAR $ 41.880,00
    CUIT: 30-71630464-3 Nº IERIC: 173621 MULTA VARIABLE CAE Número de Boleta: 5641317`
  const r = clasificarPorTexto(boleta)
  assert.notEqual(r.tipo, 'nota_credito')
})

test('sin la frase que la define, una nota de crédito no se declara nota de crédito', () => {
  // ESTE TEST TIENE QUE AISLAR LA MARCA OBLIGATORIA, no apoyarse en otra regla.
  //
  // Primera versión: el texto traía además CUIT, IVA y «Comp. Nro», así que también disparaba
  // `factura` y el resultado salía null por EMPATE. El test pasaba con la guarda de marca
  // obligatoria y sin ella — o sea, no probaba nada. Verificado quitando la guarda: cero rojos.
  //
  // Acá el texto trae SÓLO «CAE», que es la marca que `nota_credito` compartía con cualquier
  // comprobante. Ninguna otra regla llega a su mínimo, así que si esto se clasifica como nota de
  // crédito es exactamente porque la marca obligatoria dejó de exigirse.
  const soloCae = 'CAE 75123456789012 vencimiento del CAE 20/08/2026'
  assert.equal(clasificarPorTexto(soloCae).tipo, null)
})

test('con la frase, sí', () => {
  const nc = 'NOTA DE CREDITO A · Punto de Venta 0001 · CAE 75123456789012 · CUIT 30-71630464-3 · IVA'
  assert.equal(clasificarPorTexto(nc).tipo, 'nota_credito')
})

test('un documento sin texto no se clasifica: se dice que no hay qué leer', () => {
  const r = clasificarPorTexto('')
  assert.equal(r.tipo, null)
  assert.equal(r.confianza, 0)
  assert.match(r.porQue, /no tiene texto/)
})

test('lo que ninguna regla reconoce queda SIN TIPO, no en el tipo más parecido', () => {
  const r = clasificarPorTexto('El zorro marrón salta sobre el perro perezoso una y otra vez.')
  assert.equal(r.tipo, null)
  assert.match(r.porQue, /ninguna regla/)
})

test('cada tipo declara su sensibilidad, y ante la duda gana la más alta', () => {
  assert.equal(sensibilidadDe('recibo_sueldo'), 'confidencial')
  assert.equal(sensibilidadDe('extracto_bancario'), 'credenciales')
  assert.equal(sensibilidadDe('inventado'), 'confidencial', 'un tipo desconocido no es público')
})

// ── LOS CAMPOS Y SU PROCEDENCIA ──────────────────────────────────────────────────────────────────

test('un importe argentino se lee como argentino', () => {
  assert.equal(aNumero('1.234.567,89'), 1234567.89)
  assert.equal(aNumero('$ 41.880,00'), 41880)
  assert.equal(aNumero('161.543,00'), 161543)
  // Y lo que no es un importe devuelve null, NUNCA 0: un 0 es un importe y se suma.
  assert.equal(aNumero('varias'), null)
  assert.equal(aNumero(''), null)
})

test('el CUIT del proveedor, no el de la empresa', () => {
  // Casi todo papel de Echegaray lleva su propio CUIT. Tomar «el primero» daría siempre el propio
  // y jamás el de la otra parte, que es el único que sirve para cruzar.
  const doc = { paginas: [{ pagina: 1, texto: 'CUIT: 30-71630464-3 · Proveedor CUIT 20-28773782-4', bloques: [] }] }
  const { campos, evidencia } = extraerCampos(doc)
  assert.equal(campos.cuit, '20287737824')
  assert.equal(campos.esDeLaEmpresa, true)
  assert.equal(evidencia.cuit.pagina, 1, 'y con la página donde se leyó')
})

test('todo campo extraído dice de qué página salió', () => {
  const doc = { paginas: [
    { pagina: 1, texto: 'Fecha 05/08/2026', bloques: [] },
    { pagina: 2, texto: 'TOTAL $ 1.234.567,89', bloques: [] },
  ] }
  const { campos, evidencia } = extraerCampos(doc)
  assert.equal(campos.fecha, '2026-08-05')
  assert.equal(evidencia.fecha.pagina, 1)
  assert.equal(campos.total, 1234567.89)
  assert.equal(evidencia.total.pagina, 2)
  // Y el total DICE que es una inferencia: no hay etiqueta confiable, se toma el mayor.
  assert.match(evidencia.total.metodo, /mayor-importe/)
})

test('el dígito verificador del CUIT se calcula para puntuar, no para descartar', () => {
  assert.equal(cuitValido('30716304643'), true)
  assert.equal(cuitValido('30716304644'), false)
  assert.equal(cuitValido('123'), false)
})

test('una fecha imposible no se inventa', () => {
  assert.equal(aFecha(32, 1, 2026), null)
  assert.equal(aFecha(1, 13, 2026), null)
  assert.equal(aFecha(5, 8, 26), '2026-08-05', 'y el año de dos dígitos es de este siglo')
})

// ── LOS FRAGMENTOS ───────────────────────────────────────────────────────────────────────────────

test('se corta por bloque, no cada N caracteres', () => {
  const doc = { paginas: [{ pagina: 1, texto: '', bloques: [
    { bbox: [0, 0, 100, 10], texto: 'A'.repeat(400) },
    { bbox: [0, 12, 100, 22], texto: 'B'.repeat(400) },
    { bbox: [0, 24, 100, 34], texto: 'C'.repeat(400) },
  ] }] }
  const fs = fragmentar(doc, { tamano: 700, solape: 100 })
  assert.ok(fs.length >= 2)
  // Ningún fragmento parte un bloque al medio: cada uno empieza donde empieza un bloque.
  for (const f of fs) assert.ok(/^[ABC]/.test(f.texto))
  // Y cada uno sabe dónde está.
  assert.equal(fs[0].pagina, 1)
  assert.equal(fs[0].bbox.length, 4)
})

test('el ruido no se indexa: un número de página no es un fragmento', () => {
  const doc = { paginas: [{ pagina: 1, texto: '', bloques: [{ bbox: [0, 0, 10, 10], texto: '3' }] }] }
  assert.equal(fragmentar(doc).length, 0)
  assert.ok(MINIMO > 1)
})

test('sin bloques se cae al texto plano: peor, pero el documento se indexa igual', () => {
  const doc = { paginas: [{ pagina: 2, texto: 'X'.repeat(300), bloques: [] }] }
  const fs = fragmentar(doc, { tamano: 200 })
  assert.ok(fs.length >= 1)
  assert.equal(fs[0].pagina, 2)
  assert.equal(fs[0].bbox, null, 'y declara que no sabe DÓNDE, en vez de inventar un rectángulo')
})

// ── LA SENSIBILIDAD GOBIERNA QUÉ SE DEVUELVE ─────────────────────────────────────────────────────

test('un documento más sensible que el techo de quien pregunta no se devuelve', () => {
  assert.equal(permitido('interno', 'confidencial'), true)
  assert.equal(permitido('confidencial', 'interno'), false)
  assert.equal(permitido('credenciales', 'confidencial'), false)
  // Sin sensibilidad declarada se asume confidencial: el default nunca es «mostrable».
  assert.equal(permitido(null, 'interno'), false)
})
