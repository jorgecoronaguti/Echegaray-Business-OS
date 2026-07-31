import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bloqueDeDeuda, clasificarDeuda, celdaVacia } from './deuda-geometria.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import { readFileSync, readdirSync } from 'node:fs'

/** Una grilla como la que escribe el generador: título, encabezado, N proveedores con sus facturas. */
const grilla = () => [
  ['PROVEEDORES Y MATERIALES 2026'],
  ['subtítulo'],
  [],
  ['1 · QUÉ SE DEBE Y CUÁNDO'],
  [VACIO, VACIO, VACIO, VACIO],
  ['Proveedor / factura', 'Próximo pago', 'Comprobante', 'Importe'],
  ['=IF(x;"Gruas San Blas";"")', '=fecha', '=1 fac.', '=neta'],          // 7  cabecera
  [VACIO, '=fecha', '=comp', '=imp'],                                    // 8  factura
  ['=IF(x;"Corralon Progreso";"")', '=fecha', '=2 fac.', '=neta'],       // 9  cabecera
  [VACIO, '=fecha', '=comp', '=imp'],                                    // 10 factura
  [VACIO, '=fecha', '=comp', '=imp'],                                    // 11 factura
  ['=IF(x;"Pagado SA";"")', '=fecha', '=0 fac.', '=neta'],               // 12 cabecera sin facturas
  [VACIO, VACIO, VACIO, VACIO],                                          // 13 vacía
  ['2 · CUENTA CORRIENTE POR PROVEEDOR'],                                // 14 título siguiente
]

test('el bloque se ubica por el TEXTO de su encabezado, no por un número de fila', () => {
  const b = bloqueDeDeuda(grilla())
  assert.deepEqual(b, { cabecera: 6, desde: 7, hasta: 13 })
})

test('si el bloque crece, el cuerpo lo sigue solo', () => {
  const g = grilla()
  g.splice(11, 0, [VACIO, '=fecha', '=comp', '=imp'])  // una factura más
  const b = bloqueDeDeuda(g)
  assert.equal(b.desde, 7)
  assert.equal(b.hasta, 14, 'el cuerpo termina una fila antes del título siguiente')
})

test('sin encabezado no se inventa un bloque (devuelve null en vez de pintar cualquier cosa)', () => {
  assert.equal(bloqueDeDeuda([['otra cosa'], ['nada']]), null)
})

test('cada fila queda clasificada por su FORMA: cabecera, factura o vacía', () => {
  const b = bloqueDeDeuda(grilla())
  const c = clasificarDeuda(grilla(), { prov: 0, comp: 2, imp: 3, ...b })
  assert.deepEqual(c.cabeceras, [7, 9, 12])
  assert.deepEqual(c.detalles, [8, 10, 11])
  assert.deepEqual(c.vacias, [13])
})

test('los grupos +/- envuelven las facturas de cada proveedor, y sólo esas', () => {
  const b = bloqueDeDeuda(grilla())
  const { grupos } = clasificarDeuda(grilla(), { prov: 0, comp: 2, imp: 3, ...b })
  assert.deepEqual(grupos, [{ inicio: 8, fin: 8 }, { inicio: 10, fin: 11 }])
})

test('un proveedor sin facturas debajo NO genera un +/- que no plega nada', () => {
  const { grupos } = clasificarDeuda(grilla(), { prov: 0, comp: 2, imp: 3, ...bloqueDeDeuda(grilla()) })
  assert.equal(grupos.some((g) => g.inicio === 13), false)
})

test('EL DEFECTO DEL 31/07: agregar una factura corre la cabecera y la geometría la acompaña', () => {
  // Con la geometría vieja (índices calculados antes de escribir) la última cabecera quedaba dos
  // filas más arriba: sin negrita, y sus facturas dibujadas como plata.
  const g = grilla()
  g.splice(10, 0, [VACIO, '=fecha', '=comp', '=imp'])   // Corralon pasa a tener 3 facturas
  const c = clasificarDeuda(g, { prov: 0, comp: 2, imp: 3, ...bloqueDeDeuda(g) })
  assert.deepEqual(c.cabeceras, [7, 9, 13], 'la cabecera de "Pagado SA" se corrió a la 13 y se sabe')
  assert.deepEqual(c.grupos, [{ inicio: 8, fin: 8 }, { inicio: 10, fin: 12 }])
})

test('el centinela del generador cuenta como celda VACÍA, no como dato', () => {
  assert.equal(celdaVacia(VACIO), true)
  assert.equal(celdaVacia(''), true)
  assert.equal(celdaVacia('   '), true)
  assert.equal(celdaVacia(0), false, 'un cero es un dato')
  assert.equal(celdaVacia('=IF(x;"";"")'), false, 'una fórmula es contenido, aunque muestre vacío')
})

// ═══ LA GUARDA EN TODOS LOS GENERADORES QUE FORMATEAN ═══
//
// El desastre de CAJA no fue de CAJA: fue del PATRÓN. `escribirPreservando` devuelve `bloqueada` /
// `editadaPorHumano` cuando no escribió, y seis generadores descartaban ese resultado y formateaban
// igual — pintando la geometría de la grilla nueva sobre los valores viejos, y reapuntando rangos con
// nombre a filas sin dato. Este test recorre el FUENTE de todos: si mañana alguien agrega un generador
// que formatea sin consultar el skip, falla acá y no en la planilla del dueño.
test('ningún generador formatea ni publica nombres después de una escritura salteada', () => {
  const dir = new URL('../scripts/', import.meta.url)
  const fallas = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.mjs') || f.endsWith('.test.mjs')) continue
    const src = readFileSync(new URL(f, dir), 'utf8')
    if (!src.includes('escribirPreservando')) continue
    const formatea = /\bawait formatear\(/.test(src)
    const publica = /\bawait publicar(Rangos)?\(/.test(src)
    if (!formatea && !publica) continue
    // Tres formas VÁLIDAS de gobernarlo, las tres en uso en el repo:
    //   a) `if (!salteada) await formatear(...)`  — la guarda por bandera
    //   b) desestructurar `{ bloqueada, editadaPorHumano }` y `return` antes de formatear
    //   c) SACAR la pestaña candada de la lista de trabajo antes de formatearla (cash-flow-rehacer:
    //      escribe dos pestañas y formatea sólo las que quedaron en `data`)
    const gobierna = /if \(!salteada\) await (formatear|publicar)/.test(src)
      || /(bloqueada|editadaPorHumano)[\s\S]{0,300}?\breturn\b/.test(src)
      || /filtrarBloqueadas/.test(src)
    if (!gobierna) fallas.push(`${f}: formatea o publica nombres SIN mirar si la escritura se salteó`)
  }
  assert.deepEqual(fallas, [], `generadores que pueden repetir el desastre de CAJA:\n  ${fallas.join('\n  ')}`)
})

// ═══ UNA LECTURA QUE FALLA NO PUEDE VOLVERSE UN DATO ═══
//
// El dueño: "me rompiste proveedores nuevamente". La pestaña salió con filas entrelazadas —dos
// "Gerson Castro", dos "Alumetal", fechas dibujadas "$46.234"—. La causa fue un 429 de la API sobre la
// lectura del TEXTO VISIBLE, que un `.catch(() => previo)` convirtió en la lectura con FÓRMULAS: la
// Regla 0 comparó "=IF(…)" donde tenía que leer "Gerson Castro" y decidió mal celda por celda.
//
// Las lecturas que DECIDEN qué se escribe (las que alimentan la Regla 0 y la fusión) tienen que fallar
// cerrado. Un fallback que cambia la semántica del dato es peor que un error: el error se ve, el
// fallback escribe.
test('las lecturas que deciden qué escribir fallan cerrado, no se degradan en un dato falso', () => {
  const dir = new URL('../scripts/', import.meta.url)
  const fallas = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.mjs') || f.endsWith('.test.mjs')) continue
    const src = readFileSync(new URL(f, dir), 'utf8')
    // Sólo interesan los generadores que aplican la Regla 0 o fusionan sobre lo leído.
    if (!/conEdicionesRespetadas|fusionar\(/.test(src)) continue
    // Un fallback silencioso: la lectura de la pestaña cae a [] o a la OTRA lectura.
    for (const m of src.matchAll(/const (previo|visible|actual)\s*=\s*await google\.readSheetValues\([\s\S]{0,400}?\)\s*\.catch\(\(\)\s*=>\s*([^)]*)\)/g)) {
      fallas.push(`${f}: "${m[1]}" se degrada a ${m[2].trim() || '[]'} si la API falla`)
    }
  }
  assert.deepEqual(fallas, [], `lecturas que pueden mentirle al generador:\n  ${fallas.join('\n  ')}`)
})
