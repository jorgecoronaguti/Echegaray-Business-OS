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
import { estructural, layoutDeuda, notasAncladas, anchoBloque } from './proveedores-materiales-pestana.mjs'
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

// ═══ SE FUERON LOS TESTS DE `predicadoConDeuda` / `soloConDeuda` (31/07) ═══
//
// Probaban que la fila-cabecera de un proveedor PAGADO colapsara a vacío: era la cura del diseño viejo,
// donde esa fila era física y llevaba el nombre escrito. Con la sección 1 viva la fila no existe hasta
// que la fórmula la genera, y el filtro de saldo > 0 vive adentro de la misma fórmula — así que el
// proveedor pagado no queda vacío, no está. Lo que sí hay que seguir probando es la fórmula, y eso vive
// en lib/proveedores-deuda-viva.test.mjs.
//
// LO QUE SIGUE ABAJO SÍ SIGUE VIVO: `notasAncladas` y `anchoBloque` ahora se usan para LEER el bloque
// viejo y migrar los comentarios del dueño a la libreta, y para saber cuánto ancho hay que limpiar. La
// migración es de una sola vez, pero si se hace mal se pierde su trabajo: los tests se quedan.

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

// ═══ BUG 3 (30/07): ENTRA UN PROVEEDOR NUEVO Y UNA FILA SE QUEDA CON LOS NÚMEROS DE OTRO ═══
//
// EL INCIDENTE, TAL CUAL PASÓ. El dueño rotuló OCHO columnas en el bloque de deuda (A–H, hasta
// "Comentarios") pero escribe a mano hasta la Q (índice 16): al lado de Hormiserv y de Alumetal tenía
// su propia hoja de cálculo —el nombre otra vez, los importes, "cheque a 4 dias"—. Se cargaron dos
// facturas nuevas, entró un proveedor nuevo, la lista se reordenó, y la pestaña quedó con la fila de
// HORMISERV mostrando los importes de ALUMETAL, una fila huérfana con números y sin proveedor, y notas
// que el dueño había borrado de vuelta a la vista.
//
// LA CAUSA. `celdas()` generaba filas del ancho de los RÓTULOS (8). Todo lo que el dueño escribió de la
// columna 8 en adelante quedaba fuera del footprint del generador: nunca se marcaba con VACIO, y la
// fusión —que por diseño preserva lo que no es suyo— lo dejaba clavado EN SU FILA FÍSICA. Las notas se
// re-anclaban bien al proveedor; los restos anchos se quedaban quietos mientras los proveedores se
// movían. Con la lista reordenada, cada fila terminaba mezclando su nota con el residuo del anterior.
//
// EL FIX. anchoBloque(): el bloque se limpia hasta donde REALMENTE llega, y las notas se re-anclan a su
// proveedor. Lo que se respeta es la NOTA —que habla de un proveedor— no el renglón donde cayó.

const COLS_DUEÑO = ['Proveedor / factura', 'Próximo pago', 'Comprobante', 'Importe', 'Obra', 'Tipo de Pago', 'Categoría', 'Comentarios']

/** El bloque REAL leído de la pestaña el 30/07 (columnas 10–16 = la hoja de cálculo a mano del dueño). */
function bloqueReal() {
  const f = (n) => Array.from({ length: n }, () => '')
  const hormiserv = [...f(8)]; const alumetal = [...f(8)]
  hormiserv[0] = 'Hormiserv'; hormiserv[2] = '1 fac.'; hormiserv[3] = 10719777
  hormiserv[7] = 'Esperar a q escriba el cobrador para confirmar'
  hormiserv[10] = 'hormiserv'; hormiserv[11] = 10719777; hormiserv[12] = 'preguntar por cheque en base a ppto. h21'
  alumetal[0] = 'Alumetal'; alumetal[2] = '4 fac.'; alumetal[3] = 34644339
  alumetal[10] = 'Alumetal'; alumetal[11] = 34644339; alumetal[12] = 32219236
  alumetal[13] = 'cheque a 4 dias'; alumetal[14] = 2425104; alumetal[15] = 16109618; alumetal[16] = 16109618
  return [hormiserv, alumetal]
}

/** Arma la fila-cabecera de un proveedor como lo hace grilla(), con el ancho que se le indique. */
function cabecera(nombre, notas, ancho) {
  const c = Array.from({ length: ancho }, () => VACIO)
  c[0] = `=IF(ROUND(S;0)>0;"${nombre}";"")`
  c[1] = '=IF(...)'; c[2] = '=IF(...)'; c[3] = '=IF(...)'
  const extra = notas.porProveedor.get(nombre.trim().toLowerCase())
  if (extra) for (const [j, v] of extra) c[j] = v
  return c
}

test('anchoBloque: el ancho real es el mayor entre los rótulos y lo que el dueño escribió', () => {
  assert.equal(anchoBloque(COLS_DUEÑO, bloqueReal()), 17, 'el dueño rotuló 8 pero llega hasta el índice 16')
  assert.equal(anchoBloque(COLS_DUEÑO, []), 8, 'sin bloque previo, manda el rótulo')
  assert.equal(anchoBloque(COLS_DUEÑO, [[], ['x']]), 8, 'si el dueño no pasó el rótulo, el ancho no crece')
  assert.equal(anchoBloque([], []), 0)
})

test('EL BUG: con el ancho de los rótulos, Hormiserv se queda con los importes de Alumetal', () => {
  const L = layoutDeuda(COLS_DUEÑO)
  const previo = bloqueReal()
  const NOTAS = notasAncladas(previo, L)
  // Entra un proveedor nuevo: la lista se reordena y HORMISERV cae en la fila física que era de ALUMETAL.
  const nuevas = [cabecera('Alumetal', NOTAS, 8), cabecera('Hormiserv', NOTAS, 8)]
  const out = fusionar(nuevas, previo)
  // Hormiserv (ahora en la 2ª fila física, la que era de Alumetal) hereda lo que Hormiserv no llena.
  assert.equal(out[1][13], 'cheque a 4 dias', 'REPRODUCIDO: el residuo de Alumetal sobrevive en la fila de Hormiserv')
  assert.equal(out[1][15], 16109618, 'REPRODUCIDO: y sus importes también')
})

test('EL FIX: con el ancho real, cada proveedor se lleva SUS notas y no hereda las del anterior', () => {
  const L = layoutDeuda(COLS_DUEÑO)
  const previo = bloqueReal()
  const NOTAS = notasAncladas(previo, L)
  const ancho = anchoBloque(COLS_DUEÑO, previo)
  const nuevas = [cabecera('Alumetal', NOTAS, ancho), cabecera('Hormiserv', NOTAS, ancho)]
  const out = fusionar(nuevas, previo)

  // Alumetal, que ahora está en la fila que era de Hormiserv, tiene lo suyo y nada de Hormiserv.
  assert.equal(out[0][13], 'cheque a 4 dias', 'Alumetal se llevó su "cheque a 4 dias" a su fila nueva')
  assert.equal(out[0][11], 34644339)
  assert.equal(out[0][16], 16109618)
  assert.equal(out[0][7], '', 'y NO heredó la nota de Hormiserv que estaba en esta fila física')

  // Hormiserv, en la fila que era de Alumetal, tiene lo suyo y NADA del residuo ancho de Alumetal.
  assert.equal(out[1][7], 'Esperar a q escriba el cobrador para confirmar', 'su nota viajó con él')
  assert.equal(out[1][12], 'preguntar por cheque en base a ppto. h21')
  assert.equal(out[1][13], '', 'EL FIX: el "cheque a 4 dias" de Alumetal YA NO está en la fila de Hormiserv')
  assert.equal(out[1][14], '', 'ni sus importes')
  assert.equal(out[1][15], '')
  assert.equal(out[1][16], '')
})

test('EL FIX: la lista se ACORTA y no queda una fila huérfana con importes sin proveedor', () => {
  const L = layoutDeuda(COLS_DUEÑO)
  const previo = bloqueReal()
  const NOTAS = notasAncladas(previo, L)
  const ancho = anchoBloque(COLS_DUEÑO, previo)
  // A Alumetal le pagaron: su grupo desaparece y esa fila física pasa a ser una fila en blanco del
  // generador (una de detalle cuya fórmula da ""). Antes su residuo ancho sobrevivía sin dueño.
  const nuevas = [cabecera('Hormiserv', NOTAS, ancho), Array.from({ length: ancho }, () => VACIO)]
  const out = fusionar(nuevas, previo)
  assert.deepEqual(out[1].filter((c) => String(c ?? '') !== ''), [], 'la fila queda LIMPIA: ni importes ni nombre huérfanos')
})

test('EL FIX: una nota que el dueño BORRÓ no resucita', () => {
  const L = layoutDeuda(COLS_DUEÑO)
  // El dueño borró su nota de Hormiserv: en la pestaña la celda está vacía.
  const previo = bloqueReal()
  previo[0][7] = ''
  const NOTAS = notasAncladas(previo, L)
  assert.equal(NOTAS.porProveedor.get('hormiserv')?.get(7), undefined, 'no hay nada que re-anclar en la col 7')
  const ancho = anchoBloque(COLS_DUEÑO, previo)
  const out = fusionar([cabecera('Hormiserv', NOTAS, ancho)], previo)
  assert.equal(out[0][7], '', 'la celda que el dueño vació sigue vacía — su borrado manda')
  assert.equal(out[0][12], 'preguntar por cheque en base a ppto. h21', 'y lo que NO borró sigue ahí')
})

test('EL FIX no rompe el caso simple: sin columnas de más, el ancho y el comportamiento son los de antes', () => {
  const L = layoutDeuda(COLS_DUEÑO)
  const previo = [['ACME', 'sin fecha', '2 fac.', 1000, '', '', '', 'reclamar remito 1234']]
  const NOTAS = notasAncladas(previo, L)
  assert.equal(anchoBloque(COLS_DUEÑO, previo), 8)
  const out = fusionar([cabecera('ACME', NOTAS, 8)], previo)
  assert.equal(out[0][7], 'reclamar remito 1234', 'la nota se conserva igual que siempre')
})
