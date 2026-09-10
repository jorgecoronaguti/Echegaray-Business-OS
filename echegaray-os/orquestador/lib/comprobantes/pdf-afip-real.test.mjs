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
    concepto: 'Orden 641 + Orden 642', formaPago: null,
  },
  {
    archivo: 'factura-a-sin-periodo.txt', nombre: 'Echegaray FA1110.pdf',
    emisor: 'FEMENIA CONSTRUCCIONES SRL', letra: 'A', fecha: '01/09/2026',
    numero: '0002-00001110', condicion: 'Cheque', total: 3823600, iva: 663600,
    concepto: 'limpieza', formaPago: 'Cheque',
  },
  {
    // El que prueba la fecha: el texto arranca con «01/08/2026», que es el período facturado
    // DESDE. La emisión es el 07/09/2026. Tomar la primera fecha manda el gasto a agosto.
    archivo: 'factura-c-con-periodo.txt', nombre: '20379240195_011_00001_00000211.pdf',
    emisor: 'ROBLES JOSE MARIA', letra: 'C', fecha: '07/09/2026',
    numero: '0001-00000211', condicion: 'Contado', total: 696502.61, iva: 0,
    concepto: 'Honorarios Profesionales Agosto 2026 + Excedente liquidacion de sueldos 13 empleados',
    // «Contado» es una CONDICIÓN, no un medio de pago: la columna P queda vacía a propósito.
    formaPago: null,
  },
  {
    // El de la fila 946 de Compras, cargado el 10/09/2026 a las 13:51.
    archivo: 'factura-a-un-renglon.txt', nombre: '27276929491_001_00001_00000321.pdf',
    emisor: 'TURIACI SANDRA VERONICA', letra: 'A', fecha: '10/09/2026',
    numero: '0001-00000321', condicion: 'Transferencia Bancaria', total: 229900, iva: 39900,
    concepto: 'Sistemas', formaPago: 'Transferencia Bancaria',
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
    // Los ARTÍCULOS, sin los rótulos de la tabla pegados adelante y sin repetir el renglón que la
    // copia DUPLICADO vuelve a imprimir. Es la columna L de Compras.
    assert.equal(c.concepto, r.concepto)
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
    assert.equal(c.concepto, r.concepto, 'la columna L quedaba vacía en todo PDF desde el 05/09')
    assert.equal(c.condicion, r.condicion)
    assert.equal(c.formaPago ?? null, r.formaPago)
  })
}

test('un texto que no es una factura electrónica no se inventa', () => {
  assert.equal(comprobanteDesdePdf('hola'), null)
  assert.equal(comprobanteDesdePdf(null), null)
})

test('las tres COPIAS de un comprobante son una sola compra; dos facturas en un PDF son dos', () => {
  const una = fx('factura-a-un-renglon.txt')
  // El archivo real trae ORIGINAL, DUPLICADO y TRIPLICADO: mismo par y mismo CAE.
  const { comprobante: c } = comprobanteDesdePdf(una)
  assert.equal(c.cuantosComprobantes, 1)
  assert.equal(crudoDesdePdf({ comprobante: c }).varios_comprobantes, false)

  // Dos facturas DEL MISMO PROVEEDOR pegadas en el mismo PDF —el caso que pasa de verdad cuando se
  // descarga un lote—. Este módulo lee SÓLO la primera: si no lo declarara, la segunda
  // desaparecería sin que nada lo diga. (Con dos emisores distintos ni siquiera llega hasta acá: el
  // CUIT queda ambiguo y el papel se va al camino del modelo.)
  const dos = `${una}\n${una.split('00000321').join('00000322').split('86372375796634').join('86372375796635')}`
  const { comprobante: d } = comprobanteDesdePdf(dos)
  assert.equal(d.cuantosComprobantes, 2)
  const crudo = crudoDesdePdf({ comprobante: d })
  assert.equal(crudo.varios_comprobantes, true)
  assert.equal(normalizarLectura(crudo).comprobante.variosComprobantes, true)
})
