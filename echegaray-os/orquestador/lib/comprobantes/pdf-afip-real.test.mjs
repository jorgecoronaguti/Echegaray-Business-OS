// LOS CUATRO PDF QUE ENTRARON POR EL CANAL, LEÍDOS COMO LOS LEE PRODUCCIÓN.
//
// ═══ POR QUÉ CON ARCHIVOS REALES Y NO CON UN OBJETO A MANO (10/09/2026) ═══
//
// El defecto que estas pruebas fijan sobrevivió a `pdf-afip.test.mjs` y a `sin-modelo.test.mjs`
// porque los dos fabricaban la lectura con un literal. `sin-modelo.test.mjs` llegó a escribir
// `tipo: 'Factura A'` —que no es ni siquiera una letra— y pasó en verde: nadie comparaba la salida
// contra lo que el CONSUMIDOR (`normalizar_lectura`) lee, que es `letra`.
//
// Acá el insumo es el texto EXTRAÍDO de los PDF que el dueño mandó al canal `compras` entre el
// 01/09 y el 10/09/2026 (`fixtures/pdf-afip/`, con el domicilio particular del emisor reemplazado).
// Nada se fabrica: si la extracción cambia, esto se pone rojo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { comprobanteDesdePdf } from './pdf-afip.mjs'
import { crudoDesdePdf } from './sin-modelo.mjs'
import { normalizarLectura } from './lectura.mjs'
import { categoriaDelComprobante } from './categoria.mjs'

const fx = (n) => readFileSync(new URL(`./fixtures/pdf-afip/${n}`, import.meta.url), 'utf8')

/** Lo que de verdad dice cada papel. Verificado contra `public.comprobantes_arca` y el propio PDF. */
const REALES = [
  {
    archivo: 'factura-a-servicios.txt', nombre: '20441267690_001_00004_00000198.pdf',
    emisor: 'RODRIGUEZ RODRIGO DAVID', letra: 'A', fecha: '01/09/2026',
    numero: '0004-00000198', condicion: 'Cuenta Corriente', total: 228690, iva: 39690,
  },
  {
    archivo: 'factura-a-sin-periodo.txt', nombre: 'Echegaray FA1110.pdf',
    emisor: 'FEMENIA CONSTRUCCIONES SRL', letra: 'A', fecha: '01/09/2026',
    numero: '0002-00001110', condicion: 'Cheque', total: 3823600, iva: 663600,
  },
  {
    // El que prueba la fecha: el texto arranca con «01/08/2026», que es el período facturado
    // DESDE. La emisión es el 07/09/2026. Tomar la primera fecha manda el gasto a agosto.
    archivo: 'factura-c-con-periodo.txt', nombre: '20379240195_011_00001_00000211.pdf',
    emisor: 'ROBLES JOSE MARIA', letra: 'C', fecha: '07/09/2026',
    numero: '0001-00000211', condicion: 'Contado', total: 696502.61, iva: 0,
  },
  {
    // El de la fila 946 de Compras, cargado el 10/09/2026 a las 13:51.
    archivo: 'factura-a-un-renglon.txt', nombre: '27276929491_001_00001_00000321.pdf',
    emisor: 'TURIACI SANDRA VERONICA', letra: 'A', fecha: '10/09/2026',
    numero: '0001-00000321', condicion: 'Transferencia Bancaria', total: 229900, iva: 39900,
  },
]

for (const r of REALES) {
  test(`${r.archivo}: el PDF dice quién factura, qué letra y cuándo`, () => {
    const { comprobante: c } = comprobanteDesdePdf(fx(r.archivo), { nombreArchivo: r.nombre })
    assert.equal(c.emisor, r.emisor, 'la razón social del emisor está impresa y hay que leerla')
    assert.equal(c.tipo, r.letra)
    assert.equal(c.fecha, r.fecha, 'la fecha es la de EMISIÓN, no la primera que aparece en el texto')
    assert.equal(c.condicionVenta, r.condicion)
    assert.equal(c.total, r.total)
    assert.equal(c.cuadra, true)
    assert.ok(c.concepto && c.concepto.length > 2, `sin concepto la columna L queda vacía (${c.concepto})`)
  })

  test(`${r.archivo}: lo que sale del camino sin modelo llega ENTERO a la fila de Compras`, () => {
    const crudo = crudoDesdePdf(comprobanteDesdePdf(fx(r.archivo), { nombreArchivo: r.nombre }))
    assert.ok(crudo, 'este papel tiene que poder leerse sin gastar un token')
    const { comprobante: c } = normalizarLectura(crudo)
    // G Tipo. Sin esto la celda queda vacía y el comprobante deja de ser fiscal para el OS.
    assert.equal(c.tipo, r.letra === 'A' ? 'A' : r.letra)
    // B Categoría. ÉSTA ES LA GRAVE: sin letra, `categoriaDelComprobante` devuelve N —«en negro»—
    // para una factura con CAE. Es el defecto del 13/08 volviendo por otra puerta.
    assert.equal(categoriaDelComprobante(c, ['B', 'N']), 'B',
      'una factura con letra y número es B (en blanco); N sería registrarla como no documentada')
    // E Proveedor. El nombre viaja crudo: quién entra en la celda lo decide el desplegable estricto.
    assert.equal(c.proveedor, r.emisor)
    // H Número, C Fecha, M/N importes.
    assert.equal(c.numero, r.numero)
    assert.equal(c.fecha, r.fecha)
    assert.equal(c.total, r.total)
    assert.equal(c.iva ?? 0, r.iva)
    // L Concepto y F/P/X, que salen de la condición de venta impresa.
    assert.ok(c.concepto, 'la columna L quedaba vacía en todo PDF desde el 05/09')
    assert.equal(c.condicion, r.condicion)
  })
}

test('un texto que no es una factura electrónica no se inventa', () => {
  assert.equal(comprobanteDesdePdf('hola'), null)
  assert.equal(comprobanteDesdePdf(null), null)
})
