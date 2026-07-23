import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  claveComprobante, claveFila, agrupar, veredicto, senalesDe, resumen,
  formulaMarca, valoresQueRompenCountifs, COL_MARCA,
} from './compras-duplicados.mjs'

// ═══ CASOS REALES DE LA PESTAÑA "Compras" AL 23/07/2026 ═══
// No son ejemplos inventados: son las filas que provocaron esta auditoría.

const f = (fila, proveedor, numero, neto, iva, obra) =>
  ({ fila, proveedor, numero, neto, iva, total: Math.round((neto + iva) * 100) / 100, obra })

test('la clave del Sheet y la de ARCA son la MISMA clave', () => {
  // El Sheet escribe "0008-0000333"; ARCA guarda punto de venta "8" y número "333" por separado.
  assert.equal(claveComprobante('0008-0000333'), '8-333')
  assert.equal(claveComprobante('8', '333'), '8-333')
  assert.equal(claveComprobante('00004-00000722'), '4-722')
  assert.equal(claveComprobante('', ''), '')
})

test('sin N° de comprobante NO hay identidad: la fila no se agrupa', () => {
  // 227 de las 772 filas de Compras no tienen N°. Agruparlas por importe inventaría duplicados
  // donde puede haber dos compras iguales de verdad.
  assert.equal(claveFila({ proveedor: 'Ferretec', numero: '' }), '')
  assert.deepEqual(agrupar([{ fila: 5, proveedor: 'X', numero: '', total: 100 }]), [])
})

test('FACTURA PARTIDA: dos obras, una factura — las filas SUMAN el comprobante de ARCA', () => {
  // Meglioli 04-000702: $124.751 a San Francisco + $124.751 a ARCOR = $249.502, el total de ARCA.
  const g = agrupar([
    f(7, 'Meglioli Facundo Fabian', '04-000702', 103100, 21651, 'San Francisco'),
    f(8, 'Meglioli Facundo Fabian', '04-000702', 103100, 21651, 'ARCOR'),
  ])[0]
  const v = veredicto(g, { imp_total: 249502, neto_gravado: 206200, total_iva: 43302, tipo_comprobante: '1' })
  assert.equal(v.veredicto, 'factura_partida')
  assert.equal(v.exceso, 0)
})

test('DOBLE CONTEO: la misma factura dos veces — el exceso es una fila entera', () => {
  // Ferretec 0008-00000551: ARCA tiene UN comprobante de $133.632,11 y el Sheet tiene DOS filas de
  // ese importe (f209 imputada a LA ESTRELLA, f723 recargada el 1/7 a ARCOR).
  const g = agrupar([
    f(209, 'Ferretec', '0008-00000551', 110439.76, 23192.35, 'LA ESTRELLA'),
    f(723, 'Ferretec', '0008-00000551', 110439.76, 23192.35, 'ARCOR'),
  ])[0]
  const v = veredicto(g, { imp_total: 133632.11, neto_gravado: 110439.76, total_iva: 23192.35, tipo_comprobante: '1' })
  assert.equal(v.veredicto, 'doble_conteo')
  assert.equal(v.exceso, 110439.76, 'el costo (neto) de más')
  assert.equal(v.excesoIva, 23192.35, 'el crédito fiscal de más')
  assert.equal(v.filaSobrante, 723)
})

test('TOTAL PISADO ≠ duplicado: Importe+IVA cierran contra ARCA, lo pisado es la columna Total', () => {
  // Barcelo 0103-00003248: M+N de las dos filas dan $217.175, exactamente ARCA. Pero la fila 278
  // tiene la fórmula `=M+N` pisada por un "217175" pegado, así que el Total suma $86.886,14 de más.
  // Acusar de duplicado acá haría borrar la fila 277, que es legítima.
  const g = agrupar([
    { ...f(277, 'Combustibles Barcelo', '0103-00003248', 71806.73, 15079.41, 'LA ESTRELLA') },
    { fila: 278, proveedor: 'Combustibles Barcelo', numero: '0103-00003248', neto: 87264.49, iva: 18325.54, total: 217175, obra: 'Administracion' },
  ])[0]
  const v = veredicto(g, { imp_total: 217175, neto_gravado: 159071.22, total_iva: 33404.96, tipo_comprobante: '1' })
  assert.equal(v.veredicto, 'factura_partida', 'Importe y IVA cierran al centavo: las dos filas son legítimas')
  assert.equal(v.filaSobrante, null, 'NINGUNA fila sobra: no se manda a borrar nada')
  assert.ok(v.senales.some((x) => /fila 278: Total .* ≠ Importe\+IVA/.test(x)), 'pero el Total pegado se denuncia')
})

test('LOS OTROS CONCEPTOS (ITC, percepciones) NO son un faltante de carga', () => {
  // SIDERAGRO 0007-00000892: el Sheet suma $4.486.757,69 contra $4.598.000 de imp_total, pero su
  // Importe y su IVA coinciden con ARCA al centavo. La diferencia son percepciones que la pestaña
  // no carga nunca. Comparar contra imp_total declararía "falta cargar $111.242,31" y sería FALSO.
  const g = agrupar([
    f(239, 'SIDERAGRO', '0007-00000892', 2369884.67, 497675.78, 'LA ESTRELLA'),
    f(240, 'SIDERAGRO', '0007-00000892', 1338179.54, 281017.7, 'LA ESTRELLA'),
  ])[0]
  const v = veredicto(g, { imp_total: 4598000, neto_gravado: 3708064.51, total_iva: 778693.55, tipo_comprobante: '1' })
  assert.equal(v.veredicto, 'factura_partida')
  assert.equal(v.otrosConceptos, 111241.94, 'la diferencia se informa por lo que es, no como faltante')
})

test('CARGA INCOMPLETA: falta un renglón de verdad — el neto del Sheet es menor que el de ARCA', () => {
  const g = agrupar([
    f(1, 'X', '1-1', 1000, 210, 'A'),
    f(2, 'X', '1-1', 500, 105, 'B'),
  ])[0]
  const v = veredicto(g, { imp_total: 2420, neto_gravado: 2000, total_iva: 420, tipo_comprobante: '1' })
  assert.equal(v.veredicto, 'carga_incompleta')
  assert.equal(v.exceso, -500)
})

test('EXCESO SIN EXPLICAR: sobra plata pero no coincide con ninguna fila entera', () => {
  // Ferretec 0008-00000310: tres filas suman $271.881,96 contra $258.287,87 de ARCA.
  const g = agrupar([
    f(180, 'Ferretec', '0008-00000310', 178659.38, 18759.23, 'ARCOR'),
    f(181, 'Ferretec', '0008-00000310', 8193.45, 1720.62, 'Taller'),
    f(182, 'Ferretec', '0008-00000310', 53346.51, 11202.77, 'Taller'),
  ])[0]
  const v = veredicto(g, { imp_total: 258287.87, neto_gravado: 228189.38, total_iva: 30098.49, tipo_comprobante: '1' })
  assert.equal(v.veredicto, 'exceso_sin_explicar')
  assert.equal(v.exceso, 12009.96, 'el exceso de Importe, no de Total')
  assert.equal(v.excesoIva, 1584.13, 'y el crédito fiscal de más')
})

test('una NOTA DE CRÉDITO no se compara como si sumara — es el error de $41,9M', () => {
  const g = agrupar([
    f(1, 'X', '1-1', 100, 21, 'A'),
    f(2, 'X', '1-1', 100, 21, 'B'),
  ])[0]
  const v = veredicto(g, { imp_total: 121, neto_gravado: 100, total_iva: 21, tipo_comprobante: '3' })
  assert.equal(v.veredicto, 'no_concluyente')
  assert.match(v.motivo, /tipo 3/)
})

test('POSTERIOR AL CORTE DE ARCA: "no está en ARCA" NO es evidencia de duplicado', () => {
  // Diesel Rodriguez 0003-00000468, filas del 16 y 17/07: ARCA está sincronizado hasta el 15/07.
  const g = agrupar([
    { ...f(728, 'Diesel Rodriguez', '0003-00000468', 561983, 118016.43, 'Administracion'), fechaISO: '2026-07-17' },
    { ...f(737, 'Diesel Rodriguez', '0003-00000468', 561983.45, 118016.52, 'Administracion'), fechaISO: '2026-07-16' },
  ])[0]
  const v = veredicto(g, null, { corteArca: '2026-07-15' })
  assert.equal(v.veredicto, 'no_concluyente')
  assert.match(v.motivo, /posterior al corte/)
  assert.equal(v.exceso, 0, 'NO se cuantifica un duplicado que no se probó')
  assert.ok(v.senales.some((s) => /centavos/.test(s)), 'pero sí se dice por qué hay que mirarlo')
})

test('las señales son pistas para un humano, nunca veredictos', () => {
  const g = agrupar([
    f(129, 'Combustibles Barcelo', '0013-00011634', 63953.96, 13430.34, 'Taller'),
    f(130, 'Combustibles Barcelo', '0013-00011634', 63953.96, 13430.34, 'Taller'),
  ])[0]
  const s = senalesDe(g)
  assert.ok(s.some((x) => /MISMO importe/.test(x)))
  assert.ok(s.some((x) => /MISMO IVA/.test(x)))
})

test('la fórmula de la pestaña es es-AR y no pega números', () => {
  const F = formulaMarca()
  assert.ok(F.startsWith('=ARRAYFORMULA('))
  assert.ok(F.includes(';'), 'separador es-AR')
  assert.ok(!F.includes(','), 'una coma acá sería separador en-US y rompe en silencio')
  assert.ok(F.includes('$E$4:$E') && F.includes('$H$4:$H'))
})

test('avisa cuando un valor rompería COUNTIFS en silencio', () => {
  // COUNTIFS interpreta * ? ~ como comodines: devolvería un número y el número estaría mal.
  const malos = valoresQueRompenCountifs([
    { fila: 10, proveedor: 'ACME * SRL', numero: '1-1' },
    { fila: 11, proveedor: 'Ferretec', numero: '0008-0000333' },
  ])
  assert.deepEqual(malos.map((m) => m.fila), [10])
})

test('el resumen suma costo e IVA de más por separado', () => {
  const vs = [
    { veredicto: 'doble_conteo', exceso: 133632.11, excesoIva: 23192.35 },
    { veredicto: 'doble_conteo', exceso: 15883.73, excesoIva: 2756.68 },
    { veredicto: 'factura_partida', exceso: 0, excesoIva: 0 },
    { veredicto: 'carga_incompleta', exceso: -111242.31, excesoIva: 0 },
  ]
  const r = resumen(vs)
  assert.equal(r.dobleConteo, 2)
  assert.equal(r.plataDeMas, 149515.84)
  assert.equal(r.ivaDeMas, 25949.03)
  assert.equal(r.faltaCargar, 111242.31)
})

test('la columna del OS se llama por su nombre, no por su letra', () => {
  assert.match(COL_MARCA, /\(OS\)$/)
})
