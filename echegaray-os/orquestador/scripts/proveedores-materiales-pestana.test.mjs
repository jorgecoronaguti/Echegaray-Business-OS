// LA PESTAÑA PROVEEDORES LIMPIA SU PROPIO FOOTPRINT — sin borrar nada del dueño.
//
// EL CASO REAL (27/07). La pestaña tenía, en las columnas D–I de sus filas ESTRUCTURALES (los
// TOTALES y los conteos de ARCA), seriales de fecha pintados como moneda ($46.162, $46.164…) y
// rótulos viejos ("Fecha correcta", "Tipo", "Factura A"). Eran fantasmas de una versión más ancha:
// el generador escribía cadena vacía '' en esas celdas y la FUSIÓN las PRESERVA (no borra lo que el
// dueño pudo haber escrito). Al acortarse el layout, el texto viejo sobrevivía.
//
// EL FIX. En SUS filas estructurales conocidas, las columnas que el generador sabe que van vacías se
// marcan con el centinela VACIO (estructural()) en vez de '': así la fusión las BORRA de verdad. Es
// quirúrgico —sólo esas filas, sólo sus '' internos— y no toca ni notas del dueño (que viven en las
// filas de detalle / el bloque de deuda, no en los totales) ni las notas de conciliación legítimas
// del propio generador (la col I de los cruces ARCA, que es no-vacía y por eso se conserva).
import test from 'node:test'
import assert from 'node:assert/strict'
import { estructural, predicadoConDeuda, soloConDeuda, layoutDeuda, notasAncladas } from './proveedores-materiales-pestana.mjs'
import { fusionar, VACIO } from '../lib/preservar-anotaciones.mjs'

test('estructural: convierte los \'\' en VACIO y deja intacto todo lo no-vacío', () => {
  const out = estructural(['TOTAL', '', 0, '=SUM(A1:A2)', '', 'nota'])
  assert.equal(out[0], 'TOTAL', 'un rótulo no se toca')
  assert.equal(out[1], VACIO, 'un vacío pasa a VACIO')
  assert.equal(out[2], 0, 'el cero es contenido, no vacío: no se toca')
  assert.equal(out[3], '=SUM(A1:A2)', 'una fórmula no se toca')
  assert.equal(out[4], VACIO, 'otro vacío pasa a VACIO')
  assert.equal(out[5], 'nota', 'una nota no se toca')
})

test('(a) una fila de TOTAL con basura previa en col D queda VACÍA tras fusionar', () => {
  // La fila "TOTAL SIN CARGAR": su total va en col E (índice 4); D (índice 3) va vacía.
  const generado = estructural(['TOTAL SIN CARGAR', '', '', '', '=SUM($E$1:$E$9)', '', '', '', ''])
  // Lo que había en la pestaña: un serial de fecha pintado como moneda en D y rótulos viejos en F/I.
  const existente = ['TOTAL SIN CARGAR', '', '', 46162, '=SUM($E$1:$E$9)', 'Tipo', 'Factura A', '', 'Fecha correcta']
  const out = fusionar([generado], [existente])[0]
  assert.equal(out[3], '', 'el $46.162 fantasma de la col D se borra')
  assert.equal(out[5], '', 'el rótulo viejo "Tipo" (col F) se borra')
  assert.equal(out[6], '', 'el rótulo viejo "Factura A" (col G) se borra')
  assert.equal(out[8], '', 'el rótulo viejo "Fecha correcta" (col I) se borra')
  assert.equal(out[0], 'TOTAL SIN CARGAR', 'el rótulo del total queda')
  assert.equal(out[4], '=SUM($E$1:$E$9)', 'la fórmula del total queda')
})

test('(b) una nota del dueño en esa zona NO se borra — porque estructural NO se aplica al detalle', () => {
  // Una fila de DETALLE (una nota de crédito) NO pasa por estructural(): el generador deja '' donde no
  // llena, y la fusión conserva lo que el dueño anotó ahí. Es el límite quirúrgico del fix.
  const detalle = ['ALUMETAL S A', '0001-00000005', '10/5', 100, 'Devolución — el costo baja', '', '', '', '']
  const existente = ['ALUMETAL S A', '0001-00000005', '10/5', 90, 'Devolución — el costo baja', '', '', 'ojo: confirmar con Rodrigo', '']
  const out = fusionar([detalle], [existente])[0]
  assert.equal(out[7], 'ojo: confirmar con Rodrigo', 'la nota del dueño en la col H se conserva')
  // Y para dejarlo explícito: si esa MISMA celda hubiera venido de estructural(), el '' sería VACIO y
  // se limpiaría — por eso estructural() se reserva a las filas estructurales, nunca al detalle.
  const comoEstructural = estructural(detalle)
  assert.equal(comoEstructural[7], VACIO)
})

test('(c) la nota de conciliación LEGÍTIMA en col I de los cruces ARCA se conserva', () => {
  // La fila "· cargados en Compras, por N° de comprobante" lleva en col I (índice 8) una nota real del
  // generador. estructural() sólo toca los '': la nota, al ser no-vacía, queda — y D–H se limpian.
  const nota = 'Conciliación del OS al 2026-07-27 — no es una fórmula: el cruce normaliza números.'
  const generado = estructural(['  · cargados en Compras, por N° de comprobante', 5, 1000, '', '', '', '', '', nota])
  assert.equal(generado[8], nota, 'estructural conserva la nota legítima de col I')
  assert.equal(generado[3], VACIO, 'estructural marca la col D como VACIO')
  // Al fusionar sobre un fantasma viejo en col D, la nota de col I sigue puesta y el fantasma se va.
  const existente = ['  · cargados en Compras, por N° de comprobante', 5, 1000, 46213, '', '', '', '', 'nota vieja']
  const out = fusionar([generado], [existente])[0]
  assert.equal(out[8], nota, 'gana la nota nueva del generador, no la vieja')
  assert.equal(out[3], '', 'el $46.213 fantasma de col D se borra')
})

// ═══ BUG 1 (28/07): EL PROVEEDOR PAGADO DESAPARECE SOLO DEL CUADRO DE DEUDA ═══
//
// El dueño: al pasar un proveedor a estado "Pagado", SEGUÍA apareciendo en el listado con un "−" en vez
// de desaparecer. La fila-cabecera se materializa en JS (para el +/- y para re-anclar sus notas), pero
// su nombre era texto fijo. Ahora cada celda de la cabecera se gatea con predicadoConDeuda: si el saldo
// neto no es > 0, la fila entera queda VACÍA en vivo. El cuadro lista SÓLO proveedores con saldo > 0.

test('predicadoConDeuda: exige saldo neto redondeado > 0 (estado ≠ Pagado ya lo filtra condProv)', () => {
  const neta = 'SUMIFS(O;C;"X")-SUMIFS(T;C;"X")'
  assert.equal(predicadoConDeuda(neta), `ROUND(${neta};0)>0`)
})

test('soloConDeuda (texto): el NOMBRE sólo aparece en la rama verdadera; si no hay deuda, la celda va vacía', () => {
  const pred = predicadoConDeuda('SALDO')
  const cell = soloConDeuda(pred, 'ARCOR', { texto: true })
  assert.equal(cell, '=IF(ROUND(SALDO;0)>0;"ARCOR";"")')
  assert.ok(cell.startsWith('=IF('), 'es una fórmula, no un texto fijo')
  assert.ok(cell.endsWith(';"")'), 'la rama falsa (sin deuda) es la cadena vacía: el proveedor no se lista')
  // El nombre está dentro del IF, nunca suelto: un proveedor pagado no deja el nombre a la vista.
  assert.equal(cell.indexOf('"ARCOR"'), cell.indexOf('>0;') + 3, 'el nombre va inmediatamente en la rama verdadera')
})

test('soloConDeuda (texto): escapa las comillas del nombre y tolera una coma dentro del nombre (es-AR)', () => {
  const cell = soloConDeuda(predicadoConDeuda('S'), 'Metalúrgica "El Álamo", SA', { texto: true })
  assert.equal(cell, '=IF(ROUND(S;0)>0;"Metalúrgica ""El Álamo"", SA";"")')
  // La única coma vive DENTRO del literal de cadena; el separador de argumentos es ';' (locale es-AR).
  assert.ok(!/,(?=[^"]*(?:"[^"]*"[^"]*)*$)/.test(cell.replace(/"[^"]*"/g, '')), 'no hay coma fuera del literal')
})

test('soloConDeuda (fórmula): quita el "=" inicial y anida la subexpresión dentro del IF', () => {
  const pred = predicadoConDeuda('S')
  assert.equal(soloConDeuda(pred, '=MINIFS(F;C;"X")'), '=IF(ROUND(S;0)>0;MINIFS(F;C;"X");"")')
  assert.equal(soloConDeuda(pred, 'COUNTIFS(C;"X")&" fac."'), '=IF(ROUND(S;0)>0;COUNTIFS(C;"X")&" fac.";"")')
})

test('la fila-cabecera COMPLETA (nombre + próximo pago + N° fac. + importe) queda vacía sin deuda', () => {
  // Se arman las cuatro celdas igual que grilla(): un proveedor pagado → las cuatro colapsan a "".
  const neta = 'SUMIFS(O;E;"ACME")-SUMIFS(T;E;"ACME")'
  const pred = predicadoConDeuda(neta)
  const cabecera = [
    soloConDeuda(pred, 'ACME', { texto: true }),
    soloConDeuda(pred, 'IF(COUNTIFS(FE;">0")=0;"sin fecha";MINIFS(FE))'),
    soloConDeuda(pred, 'COUNTIFS(E;"ACME";O;"<>")&" fac."'),
    soloConDeuda(pred, neta),
  ]
  for (const c of cabecera) {
    assert.ok(c.startsWith('=IF(ROUND(' + neta + ';0)>0;'), 'toda celda depende del mismo predicado de saldo')
    assert.ok(c.endsWith(';"")'), 'y colapsa a vacío cuando el proveedor no debe: no queda "−" ni nombre suelto')
  }
})

// ═══ BUG 2 (28/07): LAS NOTAS DEL DUEÑO SE RE-ANCLAN AUNQUE LA CABECERA SEA UNA FÓRMULA ═══
//
// La cabecera del proveedor pasó de texto fijo a fórmula. notasAncladas trabaja sobre el bloque LEÍDO
// de la pestaña (render computado), donde esa fórmula ya muestra el NOMBRE en claro — así que la nota
// del dueño se sigue anclando por proveedor. El fix de raíz del "se pisan las ediciones" es leer el
// bloque ENTERO (antes cortaba a 80 filas): acá se prueba que la re-ancla + la fusión conservan la nota.

test('notasAncladas ancla la nota del dueño al proveedor por el nombre COMPUTADO de la cabecera', () => {
  const L = layoutDeuda(['Proveedor / factura', 'Próximo pago', 'Comprobante', 'Importe', 'Obra', 'Tipo de pago', 'Categoría', 'Comentarios'])
  // Lo que se lee de la pestaña (computado): la cabecera muestra el nombre en claro y el dueño anotó
  // en la columna "Comentarios" (índice 7), que el generador no llena.
  const bloque = [
    ['ACME', 'sin fecha', '2 fac.', 1000, '', '', '', 'reclamar remito 1234'],
    ['', '0001-00000009', '', 500, 'MESSINA', 'Cheque', 'Materiales', ''],
  ]
  const NOTAS = notasAncladas(bloque, L)
  assert.equal(NOTAS.porProveedor.get('acme')?.get(7), 'reclamar remito 1234', 'la nota se ancla al proveedor')
})

test('con la nota re-anclada, la fusión la conserva pese a que la celda del generador va VACIA', () => {
  // La fila-cabecera que produce el generador: columnas propias con fórmula/nombre, "Comentarios" (7)
  // con el centinela VACIO (celda del generador que va vacía). Al re-anclar, se le pone la nota encima.
  const generada = ['=IF(ROUND(S;0)>0;"ACME";"")', '=IF(...)', '=IF(...)', '=IF(...)', VACIO, VACIO, VACIO, 'reclamar remito 1234']
  // En la pestaña ya estaba la nota, en su fila. La fusión debe conservarla (gana el generador, que acá
  // trae la MISMA nota re-anclada — nunca la borra).
  const enPestana = ['ACME', 'sin fecha', '2 fac.', 1000, '', '', '', 'reclamar remito 1234']
  const out = fusionar([generada], [enPestana])[0]
  assert.equal(out[7], 'reclamar remito 1234', 'la nota del dueño sobrevive la corrida')
  assert.equal(out[4], '', 'la columna Obra propia del generador, VACIA, se limpia (no arrastra basura vieja)')
})
