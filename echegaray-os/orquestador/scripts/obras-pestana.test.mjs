// EL ESCRITOR DE `OBRAS`: LO QUE PASA ANTES DE ESCRIBIR.
//
// Dos piezas, y las dos fallan en silencio si se rompen:
//
//   · `resolverColumnas` — traduce rótulos a letras. Si devolviera una letra equivocada en vez de
//     romper, la pestaña quedaría llena de SUMIFS que suman OTRA columna: números plausibles, cero
//     errores, y nadie mirando. Por eso el único final aceptable de un rótulo que no está es una
//     excepción.
//   · `render` — es la evidencia del `--dry`. Un render que dibuja el centinela `VACIO` como si fuera
//     texto haría leer la grilla como si tuviera contenido donde va vacío, y el ensayo dejaría de
//     servir para decidir si escribir.
//
// Importar este módulo NO dispara `main()` (la guarda de `import.meta.url` lo impide) y por eso este
// test no toca la red ni el Sheet.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  letra, indiceDeLetra, resolverColumnas, render, celdaTexto, leerContratos, verificarMoneda,
  ROTULOS_COBRANZAS,
} from './obras-pestana.mjs'
import { grillaObras, ANCHO_OBRAS, REFS_OBRAS } from '../lib/obras-grilla.mjs'
import { OBRAS_FUTURAS, totalEgresos } from '../lib/obras-datos.mjs'
import { comoFilas } from '../lib/cobranzas-fixture.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'

/** Un encabezado como los de verdad: filas de título arriba y los rótulos recién en la 3ª. */
const COBRANZAS = [
  ['COBRANZAS 2026', '', '', '', ''],
  ['', '', 'Estado', '', ''],
  ['Fecha', 'Obra / Cliente', 'Concepto', 'TOTAL a cobrar (IVA inc.)', 'Estado'],
  ['01/08/2026', 'MESSINA', 'Playon Azufre', 58000000, 'Pendiente'],
]
const ROTULOS = { cliente: 'Obra / Cliente', concepto: 'Concepto', total: /^TOTAL a cobrar/, estado: 'Estado' }

test('letra cruza la barrera de la Z sin inventar un carácter', () => {
  assert.equal(letra(0), 'A')
  assert.equal(letra(25), 'Z')
  assert.equal(letra(26), 'AA')
  assert.equal(letra(35), 'AJ', 'la última columna de Compras')
  assert.equal(letra(51), 'AZ')
  assert.equal(letra(52), 'BA')
})

test('cada rótulo se traduce a SU letra, y los datos empiezan en la fila siguiente al encabezado', () => {
  assert.deepEqual(resolverColumnas(COBRANZAS, ROTULOS),
    { desde: 4, cliente: 'B', concepto: 'C', total: 'D', estado: 'E' })
})

test('un "Estado" suelto de OTRA fila no es el Estado del registro: manda la fila del ancla', () => {
  // La fila 2 tiene un "Estado" en la columna C. Si el resolvedor buscara cada rótulo por su cuenta,
  // el estado quedaría apuntando a la columna del Concepto y el filtro "Cobrado" no acertaría nunca.
  assert.equal(resolverColumnas(COBRANZAS, ROTULOS).estado, 'E')
})

test('un rótulo que no está ROMPE — no devuelve una letra cualquiera', () => {
  assert.throws(() => resolverColumnas(COBRANZAS, { ...ROTULOS, estado: 'Situación' }),
    /Situación.*no está en la fila de encabezado 3/s)
  assert.throws(() => resolverColumnas(COBRANZAS, { cliente: 'Cliente/Obra' }), /rótulo ancla/)
  assert.throws(() => resolverColumnas([], ROTULOS), /rótulo ancla/)
  assert.throws(() => resolverColumnas(undefined, ROTULOS), /rótulo ancla/)
})

test('el rótulo se compara con trim: un espacio de más en el archivo no rompe la resolución', () => {
  const conEspacios = [['Fecha', '  Obra / Cliente ', 'Concepto', 'TOTAL a cobrar (IVA inc.)', ' Estado']]
  assert.deepEqual(resolverColumnas(conEspacios, ROTULOS),
    { desde: 2, cliente: 'B', concepto: 'C', total: 'D', estado: 'E' })
})

test('"Retenciones" NO puede resolver a una de las tres columnas de "Retención": daría una parte', () => {
  // EL ENCABEZADO REAL DE COBRANZAS, transcrito de las columnas que importan (13/08). Conviven el
  // TOTAL retenido de la fila (col L) y TRES columnas de desglose más a la derecha. Todas empiezan
  // parecido, ninguna da error si se elige la equivocada: la pestaña publicaría una fracción del
  // retenido con formato de dato correcto, y la única forma de notarlo sería sumar a mano.
  //
  // SE PRUEBA EL CRITERIO QUE USA EL ESCRITOR (`ROTULOS_COBRANZAS`), no una copia escrita acá: un
  // test con su propio patrón daría verde aunque alguien aflojara el del escritor a /^Retenci/.
  const real = [[
    'ID', 'Categoría', 'Fecha emisión', 'Factura', 'N° Comprobante', 'Unidad', 'Obra / Cliente',
    'ORDEN DE  COMPRA', 'Concepto', 'Monto neto', 'IVA', 'Retenciones / descuentos',
    'TOTAL a cobrar (neto de retenciones)', 'Forma de Cobro', 'Estado', 'Fecha de Venta', 'Fecha cobro',
    'Mes cobro (auto)', 'Probabilidad %', 'Monto ponderado', 'Días hasta vto.', 'Estado cobro', 'Notas',
    'Retención 16,8% del neto ⚠ rótulo original perdido', 'Ret Ganancias',
    'Retención 2,5%/3,5% del neto ⚠ rótulo original perdido', 'Moneda',
  ]]
  const cols = resolverColumnas(real, ROTULOS_COBRANZAS)
  assert.equal(cols.retenciones, 'L', 'el TOTAL retenido de la fila, no un desglose')
  for (const desglose of ['X', 'Y', 'Z']) assert.notEqual(cols.retenciones, desglose)
  // Y de paso queda fijado el resto del contrato contra el encabezado REAL: si el archivo se
  // reordena, las letras cambian solas; si un rótulo desaparece, el escritor rompe.
  assert.equal(cols.total, 'M', '"TOTAL a cobrar" es neto de retenciones: la plata que entra')
  assert.equal(cols.neto, 'J')
  assert.equal(cols.fechaVenta, 'P')
  assert.equal(cols.fechaCobro, 'Q')
  // Si mañana el rótulo del total retenido cambia, el escritor ROMPE — no elige el parecido.
  const sinTotal = [real[0].map((r) => (r === 'Retenciones / descuentos' ? 'Descuentos' : r))]
  assert.throws(() => resolverColumnas(sinTotal, ROTULOS_COBRANZAS), /campo "retenciones"/)
})

test('el centinela VACIO se dibuja VACÍO: no es un dato, es "esta celda es mía y va vacía"', () => {
  assert.equal(celdaTexto(VACIO), '')
  assert.equal(celdaTexto(''), '')
  assert.equal(celdaTexto(undefined), '')
  assert.equal(celdaTexto(0), '0', 'un cero SÍ es un dato y se ve')
  assert.equal(celdaTexto(377740), '377.740', 'los importes, en es-AR')
  assert.equal(celdaTexto('=SUM(C1:C2)'), '=SUM(C1:C2)')
})

test('el --dry muestra la grilla entera: todas las obras, todas las fórmulas y ni un VACIO impreso', () => {
  const g = grillaObras({ obras: OBRAS_FUTURAS })
  const txt = render(g, OBRAS_FUTURAS)
  assert.ok(!txt.includes(VACIO), 'el centinela nunca se imprime')
  assert.match(txt, new RegExp(`${g.filas.length} filas × ${ANCHO_OBRAS} columnas`))
  for (const o of OBRAS_FUTURAS) assert.ok(txt.includes(o.obra), `falta la obra ${o.clave}`)
  // Toda fórmula de la grilla aparece COMPLETA en el listado: recortarlas escondería justo lo que hay
  // que revisar (el separador `;`, el rango, el cliente por el que filtra).
  const todas = g.filas.flat().filter((v) => typeof v === 'string' && v.startsWith('='))
  for (const f of todas) assert.ok(txt.includes(f), `una fórmula salió recortada: ${f.slice(0, 60)}`)
  assert.match(txt, new RegExp(`FÓRMULAS \\(${todas.length}\\)`))
})

test('el --dry declara que las columnas son las de DEFECTO: no se lo puede confundir con el ensayo vivo', () => {
  // Un ensayo en seco que se lea como "verificado contra el archivo" es peor que no correrlo.
  const txt = render(grillaObras({ obras: OBRAS_FUTURAS }), OBRAS_FUTURAS)
  assert.match(txt, /ENSAYO EN SECO/)
  assert.match(txt, /no las del archivo vivo/)
})

test('el --dry dice, obra por obra, dónde cae su costo y si declara contrato', () => {
  // El ensayo en seco es lo único que se puede mirar sin abrir el Sheet, así que tiene que decir lo
  // que decide una corrida. Con el detalle afuera (14/08) ya no hay filas que listar: lo que importa
  // es que cada obra tenga su fila en el cuadro de costo y si su contrato se pudo leer — sin
  // contrato, dos celdas de la obra salen en "—" y conviene enterarse antes de publicar.
  const g = grillaObras({ obras: OBRAS_FUTURAS })
  const txt = render(g, OBRAS_FUTURAS)
  assert.equal((txt.match(/ costo \d+ /g) ?? []).length, OBRAS_FUTURAS.length, 'una fila de costo por obra')
  for (const f of g.filasCosto) assert.ok(txt.includes(` costo ${f} `), `la fila de costo ${f} no se declara`)
  assert.match(txt, new RegExp(`\\$${Math.round(OBRAS_FUTURAS.reduce((s, o) => s + totalEgresos(o), 0)).toLocaleString('es-AR').replace(/\./g, '\\.')} proyectados`))
})

// ═══ LA MONEDA Y EL CONTRATO: LO QUE EL ESCRITOR LEE Y VERIFICA ANTES DE PUBLICAR (13/08) ═══

test('el rótulo "Moneda" se resuelve como los demás — y si no está, el escritor ROMPE', () => {
  // Sin esta columna la pestaña no puede distinguir U$S 15.400 de $15.400. Resolver "casi" no sirve:
  // una letra equivocada haría que el criterio ;"USD" no matchee nunca y los dólares vuelvan a
  // sumarse como pesos, sin un solo error a la vista.
  const cab = [['ID', 'Obra / Cliente', 'Concepto', 'Monto neto', 'Categoría', 'OC', 'TOTAL a cobrar (x)',
    'Estado', 'Fecha cobro', 'Retenciones / descuentos', 'Fecha de Venta', 'Fecha emisión', 'Forma de Cobro', 'Moneda']]
  assert.equal(resolverColumnas(cab, ROTULOS_COBRANZAS).moneda, 'N')
  assert.throws(() => resolverColumnas([cab[0].slice(0, -1)], ROTULOS_COBRANZAS), /Moneda/)
})

test('indiceDeLetra es el inverso exacto de letra, también pasando la Z', () => {
  // La columna de moneda vive en la AA del archivo real: un inverso que se rompa ahí haría leer la
  // moneda de OTRA columna y el control de monedas raras miraría cualquier cosa.
  for (let i = 0; i < 60; i++) assert.equal(indiceDeLetra(letra(i)), i, `columna ${i}`)
  assert.equal(indiceDeLetra('AA'), 26)
})

test('el contrato se DERIVA de lo leído, obra por obra, con las mismas reglas que la venta', () => {
  const refs = { cob: { ...REFS_OBRAS.cob, desde: 5 } }
  const { contratos, hayUSD, monedasRaras } = leerContratos(comoFilas(), refs, OBRAS_FUTURAS)
  assert.equal(contratos.get('sf-pisos-industriales').contrato, 47_590_272)
  assert.equal(contratos.get('messina-playon-azufre').contrato, 102_500_000)
  assert.equal(contratos.get('messina-bsa').contrato, null, 'BSA no lo declara: null, no cero')
  assert.equal(hayUSD, true, 'el archivo tiene la fila de Quattropani en dólares')
  assert.deepEqual(monedasRaras, [])
  // La fila de la que salió cada contrato viaja con él: un hallazgo tiene que poder ir a mirarse.
  assert.deepEqual(contratos.get('sf-mamposteria').valores.map((v) => v.fila), [95])
})

test('SIN TIPO DE CAMBIO NO SE PUBLICA, haya dólares o no: toda suma de la pestaña lo cita', async () => {
  // TODAS las celdas de plata multiplican por TIPO_CAMBIO_USD, aunque el importe en dólares sea 0.
  // Con el rango vacío quedarían en #VALUE!; sin el rango, en #NAME?. Y el escritor sólo se entera
  // AL RELEER, o sea con la pestaña ya rota: por eso la guarda va antes y no depende de que haya USD.
  const conTC = { readSheetValues: async () => [[1491.97]] }
  assert.equal(await verificarMoneda(conTC, { monedasRaras: [], hayUSD: true }), 1491.97)
  for (const hayUSD of [true, false]) {
    await assert.rejects(() => verificarMoneda({ readSheetValues: async () => [['']] },
      { monedasRaras: [], hayUSD }), /TIPO_CAMBIO_USD/, `vacío con hayUSD=${hayUSD}`)
    // El rango que NO EXISTE hace que la lectura falle: tiene que abortar igual, no seguir con null.
    await assert.rejects(() => verificarMoneda({ readSheetValues: async () => { throw new Error('Unable to parse range') } },
      { monedasRaras: [], hayUSD }), /TIPO_CAMBIO_USD/, `inexistente con hayUSD=${hayUSD}`)
  }
})

test('una moneda que no se entiende detiene la publicación: se sumaría como pesos', () => {
  assert.rejects(() => verificarMoneda({ readSheetValues: async () => [[1]] },
    { monedasRaras: [{ fila: 40, valor: 'EUR' }], hayUSD: false }), /fila 40="EUR"/)
})
