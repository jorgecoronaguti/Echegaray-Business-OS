// LAS GUARDAS DEL ESCRITOR DEL CALENDARIO. Lo que decide NO publicar.
//
// El diseño de la grilla se prueba en `lib/calendario-cobros.test.mjs`. Acá vive lo que sólo el
// escritor puede equivocar: resolver las columnas contra el encabezado vivo, y el cuadre final
// contra lo que OBRAS publica.

import test from 'node:test'
import assert from 'node:assert/strict'
import { cuadraContraResta, ROTULOS_CAL, hoyISO, render, topeDeLectura } from './calendario-cobros-pestana.mjs'
import { resolverColumnas } from './obras-pestana.mjs'
import { grillaCalendario, ventanaDeMeses } from '../lib/calendario-cobros.mjs'

/** El encabezado REAL de Cobranzas, fila 4 del archivo (leído el 13/08/2026). */
const ENCABEZADO = [[], [], [], [
  'ID', 'Categoría', 'Fecha emisión', 'Factura', 'N° Comprobante', 'Unidad', 'Obra / Cliente',
  'ORDEN DE  COMPRA', 'Concepto', 'Monto neto', 'IVA', 'Retenciones / descuentos',
  'TOTAL a cobrar (neto de retenciones)', 'Forma de Cobro', 'Estado', 'Fecha de Venta', 'Fecha cobro',
  'Mes cobro (auto)', 'Probabilidad %', 'Monto ponderado', 'Días hasta vto.', 'Estado cobro', 'Notas',
  'Retención 16,8% del neto', 'Ret Ganancias', 'Retención 2,5%/3,5% del neto', 'Moneda',
]]

test('las columnas se resuelven por RÓTULO contra el encabezado real, incluida "Notas"', () => {
  const cols = resolverColumnas(ENCABEZADO, ROTULOS_CAL)
  assert.equal(cols.cliente, 'G')
  assert.equal(cols.total, 'M')
  assert.equal(cols.estado, 'O')
  assert.equal(cols.fechaCobro, 'Q')
  assert.equal(cols.forma, 'N')
  assert.equal(cols.moneda, 'AA')
  // LA COLUMNA DEL ENDOSO. Es la única que OBRAS no usa y este cuadro sí — sin ella, la columna
  // `↳ endosado` publicaría `'Cobranzas'!$undefined$5:$undefined` y Sheets la rechaza al evaluar.
  // Son 40 celdas con #ERROR! en el archivo del dueño: ya pasó exactamente así con la Orden de Compra.
  assert.equal(cols.notas, 'W')
  assert.equal(cols.desde, 5)
})

test('si "Notas" no está en el encabezado, el escritor ROMPE antes de tocar el archivo', () => {
  const sinNotas = [[...ENCABEZADO[3]]]
  sinNotas[0][22] = 'Comentarios'
  assert.throws(() => resolverColumnas([[], [], [], sinNotas[0]], ROTULOS_CAL), /Notas/)
})

test('un "Retención" en singular NO puede pasar por "Retenciones": daría una parte del retenido', () => {
  const roto = [[...ENCABEZADO[3]]]
  roto[0][11] = 'Retención total'
  assert.throws(() => resolverColumnas([[], [], [], roto[0]], ROTULOS_CAL), /Retenciones/)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL CUADRE — el control que el dueño pidió: la suma del calendario = la Resta de OBRAS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('cuando los dos números coinciden, no hay problema que reportar', () => {
  assert.equal(cuadraContraResta(357_487_078, 357_487_078), null)
  assert.equal(cuadraContraResta(357_487_078.4, 357_487_078), null, 'un peso de redondeo no es un problema')
})

test('una diferencia REAL detiene la publicación y dice de cuánto es', () => {
  // El caso que esto atrapa: un cobro que se cayó de la ventana de meses. No da error en Sheets —
  // da un total menor y perfectamente creíble.
  const p = cuadraContraResta(357_487_078 - 8_234_758, 357_487_078)
  assert.ok(p, 'una diferencia de $8,2M tiene que abortar')
  assert.match(p, /8\.234\.758/, 'tiene que decir CUÁNTO falta, no sólo que no cuadra')
  assert.match(p, /NO publico/)
  // Y en los dos sentidos: de más también es un defecto (un cobro contado dos veces).
  assert.ok(cuadraContraResta(357_487_078 + 5_000_000, 357_487_078))
})

test('el cuadre se mide contra el TOTAL DEL AÑO de OBRAS, no contra el cierre de las obras', () => {
  // La Sección 2 de OBRAS suma sólo las 7 obras declaradas ($302.901.081) y deja afuera $54.585.997
  // de trabajos que no son obra. Compararse contra ese número haría abortar SIEMPRE — y peor,
  // invitaría a "arreglarlo" sacando esos trabajos del calendario, que es el defecto de origen.
  assert.ok(cuadraContraResta(357_487_078, 302_901_081), 'contra el cierre de la Sección 2 NO cuadra, y es correcto que no cuadre')
  assert.equal(cuadraContraResta(357_487_078, 357_487_078), null, 'contra el total del año, sí')
})

test('la fecha de corrida es inyectable: el borde del año se prueba, no se espera a diciembre', () => {
  const antes = process.env.ORQ_HOY
  try {
    process.env.ORQ_HOY = '2026-11-02'
    assert.equal(hoyISO(), '2026-11-02')
    assert.equal(ventanaDeMeses(hoyISO()).length, 2, 'de noviembre quedan noviembre y diciembre')
  } finally {
    if (antes === undefined) delete process.env.ORQ_HOY; else process.env.ORQ_HOY = antes
  }
})

test('el ensayo imprime las fórmulas COMPLETAS: recortarlas escondería justo lo que hay que revisar', () => {
  const g = grillaCalendario({ clientes: ['ARCOR'], hitos: [], meses: ventanaDeMeses('2026-08-13') })
  const txt = render(g)
  assert.match(txt, /LAS \d+ FÓRMULAS/)
  assert.match(txt, /SUMIFS\('Cobranzas'!\$M\$5:\$M/, 'la fórmula entera, con su rango')
  assert.ok(!txt.includes('…'), 'ninguna fórmula recortada')
  assert.ok(!txt.includes(String(Symbol.for('VACIO'))), 'el centinela no se dibuja como contenido')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL TOPE DE LECTURA — una guarda ciega no da error: devuelve cero problemas, igual que cuando
// todo está bien. Este defecto se publicó y lo destapó el cálculo en frío.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('la lectura de Cobranzas llega hasta la columna MÁS A LA DERECHA que el cuadro cita', () => {
  const cols = { hoja: 'Cobranzas', desde: 5, ...resolverColumnas(ENCABEZADO, ROTULOS_CAL) }
  // EL DEFECTO REAL: el rango decía hasta `notas` (W) porque era la columna nueva, y la MONEDA vive
  // en la AA. `monedasDesconocidas` recorría una columna que siempre llegaba vacía, así que la guarda
  // que impide sumar un "EUR" como pesos no podía ver nada — y no fallaba: devolvía cero problemas.
  // Además el anticipo en dólares de Quattropani quedaba sin valuar: $22,9M de diferencia.
  assert.equal(topeDeLectura(cols), 'AA')
  assert.notEqual(topeDeLectura(cols), cols.notas, 'leer hasta "Notas" deja la moneda afuera')
})

test('el tope se DERIVA, así que una columna nueva más a la derecha lo corre sola', () => {
  // Es el punto: elegir la letra a mano vuelve a olvidarse la próxima vez.
  assert.equal(topeDeLectura({ hoja: 'X', desde: 5, a: 'B', b: 'AA', c: 'M' }), 'AA')
  assert.equal(topeDeLectura({ hoja: 'X', desde: 5, a: 'B', b: 'AA', c: 'AC' }), 'AC')
  assert.equal(topeDeLectura({ hoja: 'X', desde: 5, a: 'Z', b: 'AA' }), 'AA', 'AA va después de Z, no antes')
  assert.throws(() => topeDeLectura({ hoja: 'X', desde: 5 }), /no hay ni una columna resuelta/)
})
