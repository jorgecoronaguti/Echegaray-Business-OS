// EL CAMINO SIN MODELO — y sobre todo, CUÁNDO SE NIEGA A CONTESTAR.
//
// Lo que estas pruebas cuidan no es que lea bien: eso ya lo cuida `pdf-afip.test.mjs`. Es que NO
// afirme con media evidencia, porque acá el resultado se usa SIN una segunda lectura que lo corrija.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crudoDesdePdf, leerSinModelo } from './sin-modelo.mjs'

// ═══ ESTE LITERAL DEJÓ PASAR EL DEFECTO DEL 10/09/2026, Y POR ESO AHORA ES EL CONTRATO ═══
//
// Decía `tipo: 'Factura A'` —que no es una letra— y no traía `emisor`. Con eso, cualquier salida de
// `crudoDesdePdf` pasaba: se comparaba con lo que la función escribía, nunca con lo que
// `normalizar_lectura` lee. `pdf-afip-real.test.mjs` corre la cadena entera sobre los PDF reales;
// esto congela la FORMA que `comprobanteDesdePdf` devuelve.
const BUENO = {
  cuit: '30710423184', comprobante: '00009-00003204', puntoVenta: 9, numero: 3204,
  tipo: 'A', emisor: 'ALUMETAL S A', condicionVenta: 'Cuenta Corriente', concepto: 'Chapa galvanizada',
  esNotaCredito: false, esNotaDebito: false, fecha: '21/08/2026',
  neto: 388070, iva: 81494.7, ivaDiscriminado: true, otrosTributos: 0, total: 469564.7,
  cae: '86316774738912', via: 'pdf_afip', cuadra: true,
}

test('con la aritmética cerrada y un solo emisor, contesta sin pedirle nada a nadie', () => {
  const c = crudoDesdePdf(BUENO)
  assert.equal(c.cuit, '30710423184')
  assert.equal(c.numero, '00009-00003204')
  assert.equal(c.total, 469564.7)
  assert.equal(c.legible, true)
  assert.equal(c.via, 'pdf_afip')
})

test('si la aritmética NO cierra, se niega: este camino no tiene quién lo corrija', () => {
  // En el camino con modelo, un total que no cierra dispara una segunda lectura. Acá no hay segunda
  // lectura: si se afirmara igual, un importe mal leído entraría a Compras sin que nadie lo mire.
  assert.equal(crudoDesdePdf({ ...BUENO, cuadra: false }), null)
  assert.equal(crudoDesdePdf({ ...BUENO, cuadra: null }), null)
})

test('sin LETRA no contesta: la columna B se llenaría con N sobre una factura con CAE', () => {
  // `categoriaDelComprobante` deriva la categoría del tipo. Sin tipo, una factura electrónica entra
  // a Compras marcada «en negro». Antes del 10/09 esto no se controlaba: la letra se leía bien y se
  // perdía en el camino porque viajaba con la clave equivocada.
  assert.equal(crudoDesdePdf({ ...BUENO, tipo: null }), null)
})

test('sin RAZÓN SOCIAL no contesta: la columna E quedaría vacía', () => {
  assert.equal(crudoDesdePdf({ ...BUENO, emisor: null }), null)
})

test('sin FECHA no contesta: sin mes la fila no entra en ningún período', () => {
  // `fechaDeEmision` devuelve null cuando el texto no la determina sin ambigüedad. Ese null tiene
  // que frenar el atajo, no escribirse en la columna C.
  assert.equal(crudoDesdePdf({ ...BUENO, fecha: null }), null)
})

test('la letra viaja con el nombre que el consumidor lee, y arrastra la categoría', () => {
  const c = crudoDesdePdf(BUENO)
  assert.equal(c.letra, 'A', 'normalizar_lectura lee `letra`; `tipo` no lo mira nadie')
  assert.equal(c.emisor, 'ALUMETAL S A')
  assert.equal(c.concepto, 'Chapa galvanizada')
  assert.equal(c.condicion_venta, 'Cuenta Corriente')
  assert.equal(c.es_presupuesto_o_remito, false)
})

test('con dos CUIT ajenos el emisor es ambiguo y tampoco contesta', () => {
  // `pdf-afip` pone `cuit: null` cuando hay más de un CUIT que no es el nuestro. Elegir uno sería
  // imputarle el gasto a un proveedor por sorteo.
  assert.equal(crudoDesdePdf({ ...BUENO, cuit: null }), null)
})

test('el IVA sumado va entero a iva_21, y la cuenta que lo consume da lo mismo', () => {
  const c = crudoDesdePdf({ ...BUENO, iva: 81494.7 })
  // Los dos consumidores de este campo usan `iva_21 + iva_105`. Poner la suma en uno y 0 en el otro
  // da idéntico, y evita reimplementar acá un parseo por alícuota que ya existe del otro lado.
  assert.equal((c.iva_21 ?? 0) + (c.iva_105 ?? 0), 81494.7)
})

test('un PDF electrónico NO tiene mano: la anotación va null y eso no es un dato faltante', () => {
  const c = crudoDesdePdf(BUENO)
  assert.equal(c.anotacion_manuscrita, null)
  assert.equal(c.condicion_manuscrita, null)
  // Y por eso este camino NO pasa por `necesitaRevision`: ese control pide el modelo grande cuando
  // no encuentra anotación manuscrita, que es correcto para una foto y absurdo para un PDF emitido
  // por el sistema del proveedor. Aplicarlo acá convertiría cada PDF en DOS llamadas a Claude para
  // buscar algo que no puede existir.
})

test('una imagen no entra por acá: se va al camino de siempre', async () => {
  assert.equal(await leerSinModelo({ mediaType: 'image/jpeg', data: 'xx' }), null)
  assert.equal(await leerSinModelo({ mediaType: 'application/pdf' }), null)
  assert.equal(await leerSinModelo(null), null)
})

test('un PDF ESCANEADO cae al camino de siempre: puede tener mano encima', async () => {
  // `necesitaOcr` es la firma de un escaneo. Un escaneo es una foto adentro de un PDF, y ahí sí
  // puede haber una anotación manuscrita que este camino no sabe leer.
  const leer = async () => ({ ok: true, necesitaOcr: true, texto: '' })
  assert.equal(await leerSinModelo({ mediaType: 'application/pdf', data: 'eA==' }, { leer }), null)
})

test('si el extractor explota, NO rompe la lectura: se cae al camino de siempre', async () => {
  // Un atajo que rompe el camino principal deja de ser un atajo. Ayer esto funcionaba con Claude;
  // hoy tiene que seguir funcionando aunque PyMuPDF falte o falle.
  const leer = async () => { throw new Error('PyMuPDF no está') }
  const avisos = []
  const r = await leerSinModelo(
    { mediaType: 'application/pdf', data: 'eA==' },
    { leer, logger: { warn: (m) => avisos.push(m) } },
  )
  assert.equal(r, null)
  assert.equal(avisos.length, 1, 'falló en silencio: nadie se va a enterar de que el atajo no corre')
})

test('el camino completo devuelve la lectura y de dónde salió', async () => {
  const TEXTO = `Fecha de Emisión:
ORIGINAL
ALUMETAL S A
Domicilio del emisor - San Juan,
Condición de venta:
21/08/2026
ECHEGARAY CONSTRUCCIONES S.A.S.
Cuenta Corriente
CUIT:
Ingresos Brutos:
ALUMETAL S A
FACTURA COD. 01
Punto de Venta: Comp. Nro:	00009 00003204
CUIT: 30710423184
CUIT: 30111111117
Producto / Servicio
Chapa galvanizada
1,00
unidades
Importe Neto Gravado: $ 388070,00
IVA 21%: $ 81494,70
Importe Otros Tributos: $ 0,00
Importe Total: $ 469564,70
CAE N°: 86316774738912
${'relleno '.repeat(30)}`
  const leer = async () => ({ ok: true, necesitaOcr: false, texto: TEXTO })
  const previo = process.env.ORQ_CUIT_EMPRESA
  process.env.ORQ_CUIT_EMPRESA = '30111111117'
  try {
    const r = await leerSinModelo({ mediaType: 'application/pdf', data: 'eA==', nombre: 'f.pdf' }, { leer })
    assert.ok(r?.ok, 'no leyó un PDF que trae todo lo que hace falta')
    // «00009-…», con el punto de venta a CINCO dígitos: es como lo imprime AFIP en este formato y
    // como lo devuelve `pdf-afip`. Yo había escrito cuatro copiándolo de un ejemplo del README en
    // vez de mirar la salida real de la función. El código estaba bien; la expectativa, mal.
    assert.equal(r.crudo.numero, '00009-00003204')
    assert.equal(r.crudo.cuit, '30710423184')
    assert.match(r.via, /pdf_afip/)
  } finally {
    if (previo === undefined) delete process.env.ORQ_CUIT_EMPRESA
    else process.env.ORQ_CUIT_EMPRESA = previo
  }
})
