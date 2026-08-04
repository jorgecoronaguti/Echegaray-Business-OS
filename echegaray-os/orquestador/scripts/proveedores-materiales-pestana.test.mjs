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
import { estructural, predicadoConDeuda, soloConDeuda, layoutDeuda, notasAncladas, anchoBloque } from './proveedores-materiales-pestana.mjs'
import { fusionar, VACIO } from '../lib/preservar-anotaciones.mjs'
import { readFileSync } from 'node:fs'
import { parseMonto } from '../lib/cash-briefing.mjs'

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


// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA CUENTA CORRIENTE NO PUEDE EMPUJAR '' — TIENE QUE EMPUJAR EL CENTINELA (31/07)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Un rediseño escribió otra estructura sobre esta pestaña y, al volver atrás, en la fila de Mariana SA
// y en la del subtotal quedó el texto "CUIT" —el encabezado de la tabla— metido como dato. La causa:
// el generador empujaba '' donde no conoce el CUIT, y `fusionar` interpreta '' como "el generador no
// tiene nada en esta celda" y CONSERVA lo que hubiera antes. Las seis columnas de la cuenta corriente
// son todas del generador: sus celdas vacías tienen que decir "es mía y va vacía", que es VACIO.
test('el bloque de cuenta corriente no empuja ningún \'\' — sus vacíos llevan centinela', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  const desde = src.indexOf("const cabProv = push(['Proveedor', 'CUIT'")
  const hasta = src.indexOf("const fTotProv = push(")
  assert.ok(desde > 0 && hasta > desde, 'encontré el bloque de la cuenta corriente en el fuente')
  const bloque = src.slice(desde, hasta)
  // Las cadenas vacías literales que se empujan como CELDA. Se buscan en posición de argumento.
  const vacias = bloque.match(/(?:,|\[)\s*''\s*(?=,|\])/g) ?? []
  assert.equal(vacias.length, 0,
    `hay ${vacias.length} celda(s) empujadas como '' en la cuenta corriente. fusionar las lee como `
    + `"no tengo nada acá" y conserva el dato viejo: así sobrevivió el texto "CUIT" dentro de una fila `
    + `de datos. Van con VACIO.`)
  assert.match(bloque, /p\.cuit \? formatearCuit\(p\.cuit\) : VACIO/, 'el CUIT desconocido va con centinela')
})

test('layoutDeuda ubica la columna de Comentarios, y NO la trata como propia del generador', () => {
  // El índice hace falta para rellenar la nota desde el respaldo cuando la celda quedó vacía. Pero la
  // columna sigue siendo del dueño: `notasAncladas` la re-ancla, no la sobreescribe.
  const L = layoutDeuda(['Proveedor / factura', 'Próximo pago', 'Comprobante', 'Importe', 'Obra', 'Tipo de Pago', 'Categoría', 'Comentarios'])
  assert.equal(L.nota, 7, 'Comentarios es la octava columna')
  // notasAncladas considera "propias" a las que el generador llena; Comentarios NO está entre ellas.
  const bloque = [['Hormiserv', '', '', '', '', '', '', 'mi nota']]
  const { porProveedor } = notasAncladas(bloque, L)
  assert.equal(porProveedor.get('hormiserv')?.get(7), 'mi nota', 'la nota se re-ancla por proveedor')
})

test('sin columna de Comentarios, el relleno desde el respaldo no puede escribir en ningún lado', () => {
  // Defensa: si el dueño borra la columna, `nota` es -1 y ponerDelRespaldo tiene que no hacer nada en
  // vez de escribir en la columna 0 (que es el nombre del proveedor).
  const L = layoutDeuda(['Proveedor / factura', 'Próximo pago', 'Comprobante', 'Importe'])
  assert.equal(L.nota, -1)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL TITULAR Y LA LISTA TIENEN QUE USAR EL MISMO SALDO (31/07)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El dueño: "la pestaña de proveedores no es una pestaña viva y no esta contemplando el estado actual de
// los proveedores a los q se les adeuda en su cuadro 1, no me da confianza".
//
// Medido en el archivo: el titular decía $13.715.178 y la lista sumaba $8.046.266. La diferencia,
// $5.668.912, eran DOS proveedores a los que se les debe y que no estaban cableados en el cuadro:
// Angel Fernandez ($544.500) y Gruas San Blas ($5.124.412).
//
// La causa: dos definiciones del mismo número. El titular resta los parciales positivos; el JS que
// decide QUIÉN APARECE restaba sólo "Monto Pagado". Y el dueño escribe el saldo que falta en Parcial 1
// como NEGATIVO ENTRE PARÉNTESIS —"($ 544.500)"—, su convención del 27/07.
test('el saldo del JS es el MISMO que el de la fórmula, incluidos los paréntesis del dueño', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  // El JS tiene que restar los parciales positivos, igual que la fórmula que muestra el número.
  assert.match(src, /const saldoDeFila = \(fila\) =>/, 'hay una sola definición del saldo por fila')
  assert.match(src, /Math\.max\(0, parseMonto\(fila\?\.\[IDX\.parcial1\]\)\)/, 'resta Parcial 1 sólo si es positivo')
  assert.match(src, /Math\.max\(0, parseMonto\(fila\?\.\[IDX\.parcial2\]\)\)/, 'y Parcial 2 igual')
  // Y la fórmula que se escribe en la celda usa exactamente el mismo criterio.
  assert.match(src, /MAX\(0;Compras!\$\$\{letra\(IDX\.parcial1\)\}/, 'la fórmula de la celda hace lo mismo')
})

test('EL CUADRO LISTA SÓLO A QUIEN SE LE DEBE HOY — sobre-incluir NO era gratis', () => {
  // Este test decía lo contrario y estaba MAL. La regla anterior cableaba a todo el que tuviera una fila
  // Pendiente, con el argumento de que el predicado vivo vacía la fila del que no debe. En la pestaña
  // real eso dejaba, por cada proveedor ya pagado, un par de filas con su nombre y su comentario (que SÍ
  // se escribe: viene del respaldo) y "0 fac. · —" en el importe. Cuatro de esas quedaban intercaladas
  // entre los proveedores reales y el cuadro se leía como corrupto. El dueño lo rechazó cuatro veces.
  //
  // Y peor: dos sumaban $468.542 que el titular no cuenta, así que el aviso "⚠ Faltan 2 facturas"
  // quedaba encendido para siempre señalando una diferencia que era del propio listado.
  //
  // El comentario del proveedor pagado NO se pierde: vive en public.proveedor_notas y vuelve solo el día
  // que reaparezca. El precio es que uno nuevo entra en la corrida siguiente, no al instante.
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  assert.match(src, /\.filter\(\(p\) => p\.total > 0\.5\)/, 'sólo entra el que tiene saldo > 0')
  assert.ok(!/p\.total > 0\.5 \|\| p\.filas\.length > 0/.test(src),
    'la regla vieja (sobre-incluir) no puede volver sin que este test falle')
  assert.match(src, /SOBRE-INCLUIR NO ERA GRATIS/i, 'y queda escrito por qué se cambió')
})

// ═══ EL GENERADOR ESCRIBE DEBAJO DE LAS DINÁMICAS, Y SÓLO DEBAJO ═══
//
// `grilla()` no se exporta (arma la pestaña entera y toca Google y la base), así que lo que se puede
// probar acá es el CONTRATO del archivo: que las decisiones que costaron trabajo estén escritas donde
// tienen que estar. Si alguien las revierte, estos tests se ponen rojos.

test('la escritura de "Proveedores" arranca en la frontera, nunca en A1', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  assert.match(src, /range: `\$\{refPestana\(t\.titulo\)\}!A\$\{filaArranque\}`/,
    'el rango de escritura sale de filaArranque')
  assert.ok(!/range: `\$\{refPestana\(t\.titulo\)\}!A1`/.test(src),
    'un A1 acá escribe el bloque encima del hero y de las dos tablas dinámicas, y las mata')
  // Las dos lecturas que alimentan la fusión y la Regla 0 tienen que arrancar en la MISMA fila que la
  // escritura: desalinearlas es el defecto de la grilla mezclada (mitad bloque nuevo, mitad viejo).
  assert.match(src, /!A\$\{filaArranque\}:\$\{letra\(anchoLeer - 1\)\}\$\{filaFin\}/, 'previo, desde la frontera')
  assert.match(src, /!A\$\{filaArranque\}:\$\{letra\(anchoLeer - 1\)\}`/, 'visible, desde la frontera')
  // Y el tramo empieza en el primer bloque PROPIO (b5), no en el hero (bPos).
  assert.match(src, /titulo: NOMBRES\.proveedores, desde: M\.b5/, 'el tramo arranca en el primer bloque generado')
})

test('el formateador también respeta la frontera: nada de resetear el formato de las dinámicas', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  assert.match(src, /formatear\(google, hoja\.sheetId, gP, anchoP, cuadroP\.length, \{ filaArranque \}\)/)
  // El reset del principio —unmerge, borrar notas, borrar bordes y colores— es lo que caería sobre las
  // dinámicas si arrancara en la fila 0 de la pestaña.
  assert.match(src, /unmergeCells: \{ range: r\(F0, F0 \+ filas\) \}/)
  assert.ok(!/unmergeCells: \{ range: r\(0, filas\) \}/.test(src))
  assert.match(src, /repeatCell: \{ range: r\(F0, F0 \+ filas, 0, Math\.max\(ancho, 26\)\), cell: \{\}, fields: 'note' \}/)
})

test('la numeración de las secciones sale de la constante, no de un número escrito a mano', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  for (const clave of ['PRIMERA_GENERADA', 'faltanEnCompras', 'control', 'arca', 'emitidas']) {
    assert.match(src, new RegExp(`nSeccion\\('?${clave}'?\\)`), `la sección ${clave} numera por nSeccion`)
  }
  // Los números viejos, los que el dueño NO ve en la pestaña.
  assert.ok(!/push\(\[`?5 · NOTAS DE CRÉDITO/.test(src), 'ya no dice 5 donde la pestaña muestra 3')
  assert.ok(!/push\(\[`?6 · FACTURADO A LA EMPRESA/.test(src), 'ya no dice 6 donde la pestaña muestra 4')
  // Y la renumeración al escribir se retiró: contaba sólo los bloques propios, así que NOTAS DE
  // CRÉDITO volvería a ser "1 ·" y la pestaña mostraría dos secciones 1.
  assert.ok(!/fila\[0\] = t\.replace\(\/\^\\d\+\\s\*·\\s\/, `\$\{\+\+n\} · `\)/.test(src),
    'la renumeración por pestaña no puede volver: hoy mentiría')
})

test('EL DEFECTO DE TRIELEC: una nota de crédito que ya no anula nada limpia su celda, no la hereda', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  assert.match(src, /push\(estructural\(\[n\.proveedor, n\.comprobante, n\.fecha, arcaPorComprobante/,
    'las filas de notas de crédito son del generador de punta a punta: su vacío se limpia')

  // El efecto, sobre la fusión: la fila vieja decía qué factura anulaba; la nueva no anula nada.
  const vieja = [['TRIELEC', '0003-00000123', '12/05/2026', -50000, 'refacturación', '0003-00000100', '0003-00000131']]
  const conBug = fusionar([['TRIELEC', '0003-00000123', '12/05/2026', -50000, 'devolución', '', '']], vieja)
  assert.equal(conBug[0][5], '0003-00000100', 'así se veía: el reemplazo de otra corrida sobrevivía')
  const conFix = fusionar([estructural(['TRIELEC', '0003-00000123', '12/05/2026', -50000, 'devolución', '', ''])], vieja)
  assert.equal(conFix[0][5], '', '"Anula la factura" queda limpia')
  assert.equal(conFix[0][6], '', '"La reemplaza" queda limpia')
})

test('la convención del dueño: un negativo entre paréntesis en Parcial es el saldo que FALTA', () => {
  // Si esto se leyera como un pago, el saldo daría cero y el proveedor desaparecería de la lista
  // teniendo deuda — que es exactamente lo que pasó con Angel Fernandez y Gruas San Blas.
  assert.equal(parseMonto('($ 544.500)'), -544500)
  assert.equal(parseMonto('($ 5.124.412)'), -5124412)
  assert.equal(Math.max(0, parseMonto('($ 544.500)')), 0, 'un negativo NO resta: no es un pago')
  assert.equal(Math.max(0, parseMonto('$ 300.000')), 300000, 'un positivo sí es un pago parcial y resta')
})
