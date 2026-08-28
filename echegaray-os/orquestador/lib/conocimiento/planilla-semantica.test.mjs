// LA COTIZACIÓN DEL CLIENTE, CON LA GEOMETRÍA MOVIDA A PROPÓSITO.
//
// Cada grilla de acá abajo está copiada de la forma REAL de una planilla de la carpeta de Drive y
// después movida —columna de más adelante, encabezado en otra fila, otro idioma de encabezado— para
// que un lector que en el fondo siga leyendo por coordenada se ponga rojo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorDeCelda } from './celda.mjs'
import {
  CLASE_PLANILLA, ROL, TIPO_FILA, clasePlanilla, clasificarFila, conceptoDeCierre, detectarEncabezado,
  esRotuloDeNota, leerLibro, leerPlanillaSemantica, numeroDe, puntajeDeCotizacion, rolDeEncabezado, rolesDeFila,
} from './planilla-semantica.mjs'

/** La forma de «ARSJ Planilla de Cotizacion - Muro Cortafuego»: encabezado en la fila 7, ítem en B. */
const ARCOR = [
  [], ['', 'PLANILLA DE COTIZACION', '', '', '', '', '', '', '', 'Rev E'],
  ['', 'Proyecto:', 'MURO CORTAFUEGO'], ['', 'Obra Civil:', 'AREA INGENIERIA'], [], [],
  ['', 'ITEM ', 'DESCRIPCION', 'UNIDAD', 'CANTIDAD', 'MATERIAL', 'MANO DE OBRA', 'PRECIO UNITARIO', 'PRECIO DEL ITEM', 'PRECIO DEL RUBRO'],
  [],
  ['', 1, 'TAREAS PRELIMINARES', '', '', '', '', '', '', 1200],
  ['', 1.1, 'Traslado de equipos a obra', 'Gl', 1, null, 828512.4, 828512.4, 828512.4],
  ['', 2, 'ESTRUCTURAS METALICAS', '', '', '', '', '', '', 3400],
  ['', 2.1, 'Provisión y montaje de columnas C140', 'kg', 404.8, 10565.24, 4189.61, 14754.85, 5972763],
  [], ['', '', '', 'Subtotales', '', '', '', '', 6801275.4],
  ['', '', '', '', '', '', '', '', 'TOTAL', 6801275.4],
  ['', 'NOTA 1:', ' EL PRECIO FINAL NO INCLUYE IVA.'],
  ['', 'CONDICION DE PAGO:', 'ANTICIPO FINANCIERO 40%, SALDO CON CERTIFICACION QUINCENAL'],
]

/** La misma cotización con OTRA geometría y OTRO idioma de encabezado: es «ARSJ Oficinas 2023»,
 *  encabezado en la fila 6 y «Elementos a presupuestar» en vez de «DESCRIPCIÓN». */
const ARCOR_OTRO_ANO = [
  ['', 'PLANILLA DE COTIZACIÓN'], ['', 'Proyecto: 0338_E1_Nuevas oficinas'], [], [], [],
  ['', 'Ítem', 'Elementos a presupuestar', 'Unidad', 'Cantidad', 'Material / Equipo', 'Mano de Obra', 'Precio Unitario', 'Precio del Ítem', 'Precio del Rubro'],
  ['', '1', 'PRELIMINARES', '', '', '', '', '', '', 5000],
  ['', '1.1', 'Delimitación de la zona de trabajo', 'gl', 1, 1000000, 240000, 1240000, 1240000],
  ['', '', '', '', '', '', '', 'gg', '15%', 900000],
  ['', '', '', '', '', '', '', 'beneficio', '18%', 1080000],
  ['', '', '', '', '', '', '', 'iibb', '2.40%', 144000],
]

test('el encabezado se busca por lo que dice, no en una fila fija', () => {
  const a = detectarEncabezado(ARCOR)
  const b = detectarEncabezado(ARCOR_OTRO_ANO)
  assert.equal(a.ok, true)
  assert.equal(a.fila, 6)
  assert.equal(b.ok, true)
  assert.equal(b.fila, 5)
  // Y la MISMA columna semántica cae en índices distintos según la planilla: eso es exactamente lo
  // que un lector por letra de columna no puede hacer.
  assert.equal(a.columnas[ROL.DESCRIPCION], 2)
  assert.equal(b.columnas[ROL.DESCRIPCION], 2)
  assert.equal(a.columnas[ROL.PRECIO_ITEM], 8)
})

test('agregar una columna al principio no rompe la lectura', () => {
  // Éste es el test que se pone rojo si alguien vuelve a fijar «descripción = columna C».
  const corrida = ARCOR.map((f) => ['relleno', ...f])
  const r = leerPlanillaSemantica(corrida)
  const base = leerPlanillaSemantica(ARCOR)
  assert.equal(r.ok, true)
  assert.deepEqual(r.items.map((i) => i.descripcion), base.items.map((i) => i.descripcion))
  assert.equal(r.encabezado.columnas[ROL.DESCRIPCION], base.encabezado.columnas[ROL.DESCRIPCION] + 1)
})

test('el rubro se distingue del ítem por la unidad, no por la numeración', () => {
  const r = leerPlanillaSemantica(ARCOR)
  assert.deepEqual(r.rubros.map((x) => x.titulo), ['TAREAS PRELIMINARES', 'ESTRUCTURAS METALICAS'])
  assert.deepEqual(r.items.map((i) => i.unidad), ['Gl', 'kg'])
  assert.deepEqual(r.items.map((i) => i.rubro), ['TAREAS PRELIMINARES', 'ESTRUCTURAS METALICAS'])
})

test('un ítem con la numeración rota (#REF!) sigue siendo un ítem', () => {
  // Medido: en «Piso de Ecopatio A PRESENTAR» la columna de ítem se calcula con `=B12+0,01` y varias
  // filas quedaron en `#REF!`. Un lector que decida «es ítem si el número tiene decimales» pierde
  // esas partidas enteras, con su cantidad y su precio.
  const fila = ['', errorDeCelda('#REF!'), 'Excavación en todo tipo de terreno', 'm3', 60, null, 15665.33, 15665.33, 939919.8]
  assert.equal(clasificarFila(fila, detectarEncabezado(ARCOR).columnas).tipo, TIPO_FILA.ITEM)
})

test('una celda en error nunca se convierte en un número', () => {
  // La trampa está medida en `celda.mjs`: un `#DIV/0!` con valor cacheado 7 entró como plata.
  const n = numeroDe(errorDeCelda('#DIV/0!'))
  assert.equal(n.valor, null)
  assert.match(n.porQue, /#DIV\/0!/)
  const fila = ['', '3.1', 'Cerchas metálicas', 'kg', 400, errorDeCelda('#DIV/0!'), 100, errorDeCelda('#NAME?'), null]
  const r = leerPlanillaSemantica([...ARCOR.slice(0, 8), fila])
  assert.equal(r.items.length, 1)
  assert.equal(r.items[0].precioUnitario, null)
  assert.deepEqual(r.items[0].errores.map((e) => e.error).sort(), ['#DIV/0!', '#NAME?'])
})

test('vacío y cero no son lo mismo', () => {
  assert.equal(numeroDe('').valor, null)
  assert.equal(numeroDe(null).valor, null)
  assert.equal(numeroDe(0).valor, 0)
})

test('el separador decimal se DETECTA: asumir es-AR divide un importe por mil', () => {
  // Medido: `xlsx` devolvió `$ 828,512.40` de una planilla de ARCOR, con formato de celda en-US.
  // Asumiendo es-AR eso valía $828,51 en vez de $828.512,40 — sin error y sin aviso.
  assert.equal(numeroDe('$ 1.234.567,89').valor, 1234567.89)
  assert.equal(numeroDe('828,512.40').valor, 828512.4)
  assert.equal(numeroDe('12.345.678').valor, 12345678)
  assert.equal(numeroDe('22,9').valor, 22.9)
})

test('un separador que aparece UNA vez ante tres dígitos es ambiguo y se declara', () => {
  const r = numeroDe('$ 5.000')
  assert.equal(r.valor, 5000)
  assert.equal(r.ambiguo.otraLectura, 5)
  assert.match(r.ambiguo.porQue, /separador de miles o el decimal/)
  assert.equal(numeroDe('12.345.678').ambiguo, undefined)
})

test('el cierre económico se reconoce concepto por concepto', () => {
  const r = leerPlanillaSemantica(ARCOR_OTRO_ANO)
  assert.deepEqual(r.cierre.map((c) => c.concepto), ['GASTOS_GENERALES', 'BENEFICIO', 'INGRESOS_BRUTOS'])
  assert.equal(conceptoDeCierre('Imp cheque'), 'IMPUESTO_AL_CHEQUE')
  assert.equal(conceptoDeCierre('Sub totales'), 'SUBTOTAL')
  assert.equal(conceptoDeCierre('Provisión de materiales'), null)
})

test('las notas de alcance y la condición de pago no se pierden', () => {
  const r = leerPlanillaSemantica(ARCOR)
  assert.ok(r.notas.some((n) => /NO INCLUYE IVA/.test(n.texto)))
  assert.ok(r.notas.some((n) => /ANTICIPO FINANCIERO 40%/.test(n.texto)))
  assert.equal(esRotuloDeNota('NOTA 3:'), true)
  assert.equal(esRotuloDeNota('Provisión de hormigón'), false)
})

test('un encabezado con cola —«DESCRIPCIÓN DE LA OBRA», «Unid.»— se reconoce igual', () => {
  assert.equal(rolDeEncabezado('DESCRIPCIÓN DE LA OBRA'), ROL.DESCRIPCION)
  assert.equal(rolDeEncabezado('Unid.'), ROL.UNIDAD)
  assert.equal(rolDeEncabezado('Cantidad Contratada'), ROL.CANTIDAD)
})

test('el prefijo no alcanza para enganchar un encabezado que dice otra cosa', () => {
  // `un`, `mo` y `n` son sinónimos legítimos y el principio de media lengua castellana; y «Unidad de
  // negocio a la que provee» empieza con «unidad» y es una pregunta del formulario de alta de
  // proveedores. Sin los dos topes —largo del sinónimo y largo del encabezado— ese formulario
  // pasaba por planilla de cotización.
  assert.equal(rolDeEncabezado('Nombre del proveedor'), null)
  assert.equal(rolDeEncabezado('Unidad de negocio a la que provee'), null)
  assert.equal(rolDeEncabezado('Modalidad de contratación'), null)
})

test('sin descripción no hay cotización, y se dice por qué', () => {
  // El defecto que este control ataja: un cronograma con «Ítem», «Cantidad» y «Unidad» y ninguna
  // columna que diga QUÉ se cotiza pasaba por planilla de cotización.
  const gantt = [['Ítem', 'Unidad', 'Cantidad', 'Semana 1', 'Semana 2']]
  const r = detectarEncabezado(gantt)
  assert.equal(r.ok, false)
  assert.match(r.porQue, /ninguno es DESCRIPCION/)
})

test('lo que no es una planilla de cotización se rechaza con el detalle de lo que sí encontró', () => {
  // El control TIENE que poder dar rojo, y su motivo tiene que servir para arreglar algo: «formato
  // diferente» no dice nada y por eso 48 archivos quedaron cerrados sin explicación.
  const r = leerLibro({ Hoja1: [['Razón social', 'CUIT', 'ART', 'Vencimiento']] })
  assert.equal(r.ok, false)
  assert.match(r.porQue, /Hoja1/)
  assert.match(r.porQue, /reconoce 3 encabezados|ninguna de las primeras/)
})

test('la pestaña de cotización no es la que más filas tiene', () => {
  // Medido: en los libros internos de ECSAS la pestaña `Análisis` deja 1.327 filas de composición de
  // precios y `Presupuesto` deja 40. Ganar por cantidad devuelve el análisis y lo llama cotización.
  const analisis = [['Item', 'Descripcion', 'Unidad', 'Cantidad'],
    ...Array.from({ length: 300 }, (_, i) => ['', `insumo ${i}`, 'un', 1])]
  const r = leerLibro({ Análisis: analisis, Presupuesto: ARCOR })
  assert.equal(r.hoja, 'Presupuesto')
  assert.ok(puntajeDeCotizacion(r) > puntajeDeCotizacion(leerPlanillaSemantica(analisis, { hoja: 'Análisis' })))
  assert.deepEqual(r.otras.map((o) => o.hoja), ['Análisis'])
})

test('un certificado NO entra al corpus de cotizaciones', () => {
  const cert = [['CERTIFICADO DE OBRA Nº', 1], [],
    ['ITEM', 'DESCRIPCIÓN DE LA OBRA', 'Unid.', 'Cantidad Contratada', 'PRECIO UNITARIO'],
    [1, 'Excavación, Relleno y Compactación', 'm3', 2500, 1040.55]]
  const r = leerPlanillaSemantica(cert)
  assert.equal(r.ok, true)
  assert.equal(r.clase, CLASE_PLANILLA.CERTIFICADO)
  assert.match(r.porQueClase, /EJECUTADAS/)
})

test('un cómputo sin precios se declara cómputo, no cotización', () => {
  const c = [['Elemento', 'Sección', 'Unidad', 'Cantidad'], ['Columna C1', 'PC 140-50-2', 'un', 11]]
  assert.equal(leerPlanillaSemantica(c).clase, CLASE_PLANILLA.COMPUTO)
})

test('cuando el nombre y la estructura se contradicen, se declara — no se elige en silencio', () => {
  const c = [['Elemento', 'Unidad', 'Cantidad', '$ unitario'], ['Columna', 'un', 11, 99661.91]]
  const r = leerPlanillaSemantica(c, { nombre: 'Computo de Materiales.xlsx' })
  assert.equal(r.clase, CLASE_PLANILLA.COTIZACION)
  assert.match(r.discrepancia, /el nombre .* dice COMPUTO/)
  // Y cuando no se contradicen, no hay discrepancia que declarar.
  assert.equal(leerPlanillaSemantica(ARCOR, { nombre: 'ARSJ Planilla de Cotizacion.xls' }).discrepancia, null)
})

test('dos columnas con el mismo encabezado: gana la de la izquierda y se dice cuál', () => {
  const cols = rolesDeFila(['Cantidad', 'Descripcion', 'Cantidad', 'Unidad'])
  assert.equal(cols[ROL.CANTIDAD], 0)
  assert.equal(cols[ROL.DESCRIPCION], 1)
})

test('la clase de una planilla sin encabezado reconocido no se inventa', () => {
  assert.equal(clasePlanilla([['a', 'b']], { fila: 0, columnas: {} }).clase, CLASE_PLANILLA.COMPUTO)
})
