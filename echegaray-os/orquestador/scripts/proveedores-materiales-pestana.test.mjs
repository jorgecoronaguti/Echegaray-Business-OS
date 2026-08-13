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
import { estructural, predicadoConDeuda, soloConDeuda, layoutDeuda, notasAncladas, anchoBloque, traducirMarcadores, reportarVentasSinCobranza } from './proveedores-materiales-pestana.mjs'
import { fusionar, VACIO } from '../lib/preservar-anotaciones.mjs'
import { readFileSync } from 'node:fs'
import { parseMonto } from '../lib/cash-briefing.mjs'
import { ANCHOS_PROVEEDORES } from '../lib/proveedores-frontera.mjs'
import { caracteresQueEntran } from '../lib/proveedores-rotulos.mjs'

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
  for (const clave of ['PRIMERA_GENERADA', 'faltanEnCompras', 'control']) {
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

// ═══ LOS TRES DEFECTOS DE LA SECCIÓN DE CONTROL, EN EL CÓDIGO QUE LOS PRODUCÍA ═══
//
// Son de FORMA de la pestaña, no de cálculo: ningún total cambia y por eso ningún control los veía.
// Se ven en el PDF, que es donde el dueño los vio. El test mira el fuente porque el defecto está en
// cómo se emiten las filas, no en un valor que se pueda calcular acá.

test('la sección de control NO tiene columna de prosa: un párrafo por fila está prohibido', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  const i = src.indexOf('· LO QUE HAY QUE CORREGIR EN COMPRAS`]')
  const fin = src.indexOf('LA ÚNICA PROSA DE LA SECCIÓN')
  assert.ok(i > 0 && fin > i, 'la sección existe y termina en su nota al pie')
  const bloque = src.slice(i, fin)
  // Las frases que el dueño borraba a mano y volvían en cada corrida. Si alguna vuelve al cuerpo del
  // bloque —no al pie—, es que volvió la columna de prosa.
  for (const frase of [
    'Es la misma línea del Cash Flow Mensual.',
    'Cantidad de filas. La columna "Monto Pagado" está a medio llenar',
    'Días. Cada día que se estira este número',
    'Si es deuda, no está en la cuenta corriente de arriba',
    'Filas que dicen "materiales varios"',
  ]) {
    assert.ok(!bloque.includes(frase), `volvió la prosa por fila: "${frase.slice(0, 40)}…"`)
  }
  // Y todas sus filas van con `estructural`, que es lo que hace que el resto de ayer se limpie. Con
  // `push([...])` y un '' pelado, la fusión CONSERVA lo que había: por eso el comentario de "cantidad
  // de filas" aparecía al lado de "Materiales Mantenimiento" y el de "días" al lado de "cuánta plata".
  // Escritura por posición sobre un bloque que cambió de alto.
  const filas = bloque.split('\n').filter((l) => /^\s{2}(const \w+ = )?push\(/.test(l))
  const sinEstructural = filas.filter((l) => !/push\(estructural\(|push\(\[\]\)/.test(l))
  assert.deepEqual(sinEstructural, [], 'toda fila del bloque de control se emite con estructural()')
})

test('un contador nunca cae en la columna de plata: B es cuánto, C es plata', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  // El defecto: '⚠ "Pagado" con monto MENOR al total | $5' — son CINCO FILAS, no cinco pesos. La
  // causa raíz era estructural: cantidades e importes compartían la columna B, y se venía parcheando
  // fila por fila con un formato de excepción que cada control nuevo volvía a necesitar.
  assert.match(src, /cabCtrl = push\(estructural\(\['Qué está mal cargado', 'Filas', 'Plata'/,
    'el encabezado declara las dos columnas separadas')
  // El formato se declara para TODO el bloque, no fila por fila.
  assert.match(src, /r\(g\.ctrl - 1, g\.ctrl1, 1, 2\)[\s\S]{0,180}numberFormat: E\.NUM\.cantidad/,
    'la columna B del control es cantidad de punta a punta')
  assert.match(src, /r\(g\.ctrl - 1, g\.ctrl1, 2, 3\)[\s\S]{0,180}numberFormat: E\.NUM\.moneda/,
    'la columna C del control es moneda de punta a punta')
  // Y los parches por fila que ya no hacen falta no pueden volver.
  assert.ok(!/for \(const f of g\.cuentas\)/.test(src), 'el parche fila por fila se retiró')
})

test('las facturas emitidas ya no se escriben en la pestaña de proveedores', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  // Era un error de categoría que el propio título admitía: "(esto es VENTAS, no proveedores)".
  assert.ok(!/push\(\[`\$\{nSeccion\('emitidas'\)\}/.test(src))
  assert.ok(!/'¿Está en Cobranzas\?'/.test(src), 'la tabla de emitidas no se emite más')
  assert.ok(!/push\(estructural\(\['TOTAL FACTURADO'/.test(src), 'ni su total')
  // Pero el hallazgo NO se tira: lo que Cobranzas no tiene se sigue calculando y se reporta.
  assert.match(src, /emitidasSinCobranza/)
  assert.match(src, /VENTAS \(no es de esta pestaña\)/)
})

test('la conciliación con ARCA se declara UNA vez al pie, no en la columna I de cada fila', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  // El defecto: dos párrafos sueltos derramados en la columna I, a la derecha de la tabla, que en el
  // PDF se leen como basura. Cada fila llevaba su propia declaración de "esto no es una fórmula".
  assert.ok(!/Conciliación del OS al \$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\} — no es una fórmula/.test(src))
  assert.ok(!/'Conciliación del OS: se encontraron por proveedor \+ importe/.test(src))
  assert.match(src, /push\(\[`Del libro de IVA de ARCA/,
    'la declaración vive al pie de la sección, una sola vez')
})

// ═══ NINGÚN PÁRRAFO SE ESCRIBE MÁS LARGO DE LO QUE ENTRA (05/08) ═══
//
// `auditar-pantalla.mjs` reportaba A261 (306 caracteres) y A283 (368) como `texto_cortado`: la frase
// terminaba a mitad de palabra. Estas filas llevan una sola celda, así que derraman sobre la pestaña
// ENTERA — y ni con los 1.465px de las ocho columnas alcanzan. No hay ancho que lo arregle: hay que
// escribir menos, que además es la regla de minimalismo del área.
test('ningún párrafo del generador se escribe más largo de lo que entra en la pestaña', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  const tope = caracteresQueEntran(ANCHOS_PROVEEDORES.reduce((a, b) => a + b, 0))
  // Los `push` de UNA sola celda de texto: son las filas que derraman. Una interpolación `${…}` se
  // mide como 12 caracteres (la más larga que se emite es una fecha ISO, 10).
  const parrafos = [...src.matchAll(/push\(\[[`']((?:[^`'\\]|\\.)+)[`']\]\)/g)]
    .map((m) => ({ crudo: m[1], largo: m[1].replace(/\$\{[^}]*\}/g, 'X'.repeat(12)).length }))
    .filter((p) => p.largo > 60)
  assert.ok(parrafos.length >= 2, 'no encontré los párrafos del generador: cambió la forma de emitirlos')
  for (const p of parrafos) {
    assert.ok(p.largo <= tope,
      `un párrafo de ${p.largo} caracteres y entran ${tope}: se va a ver cortado. "${p.crudo.slice(0, 70)}…"`)
  }
})

test('ninguna tabla de la frontera para abajo escribe en la columna de aire', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  // La E separa los dos cuadros de la posición. Es donde "$970.226" se veía como "$970" y "Qué es"
  // como "Qué e". Las tablas de TEXTO la saltean: el quinto campo de cada fila es AIRE. (La dinámica
  // del detalle sí la ocupa —un pivot no saltea columnas— y por eso la E ya no mide 28px.)
  assert.match(src, /const AIRE = ''/)
  for (const [tabla, fila] of [
    ['notas de crédito', /cabNC = push\(estructural\(\['Proveedor', 'Nota de crédito', 'Fecha', 'Importe', AIRE,/],
    ['lo que ARCA facturó', /cabAfip = push\(estructural\(\['Proveedor según ARCA', 'CUIT', 'Comprobante', 'Fecha', AIRE,/],
    ['facturas anuladas', /cabAnu = push\(estructural\(\['Factura anulada cargada en Compras', 'Cargada como', 'Fecha cargada', 'Importe', AIRE,/],
  ]) {
    assert.match(src, fila, `la tabla de ${tabla} tiene que saltear la E`)
  }
  // Y el total de la sección 4 suma la F, no la E: si vuelve a sumar la E, suma una columna vacía.
  assert.match(src, /`=SUM\(\$F\$\{afip0\}:\$F\$\{afip1\}\)`/)
  assert.ok(!/`=SUM\(\$E\$\{afip0\}:\$E\$\{afip1\}\)`/.test(src))
})

test('el generador de abajo NO fija anchos: los aplica el dueño declarado', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  const enFrontera = src.slice(src.indexOf('enFrontera: true'), src.indexOf('anchosSegunContenido'))
  assert.ok(!/updateDimensionProperties[\s\S]{0,120}COLUMNS/.test(enFrontera),
    'dos escritores peleando por la misma propiedad es lo que dejó la D en 80 o en 300 según el orden')
})

test('un rótulo que no entra se acorta antes de ensanchar la columna', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  // Ensanchar la A para que entre una frase de 63 caracteres empuja toda la pestaña por un rótulo.
  for (const largo of [
    '⇒ Materiales que ninguna familia está mirando (tiene que dar —)',
    'Comprobantes emitidos por la empresa (ventas, para el Cash Flow)',
    'Factura ANULADA por una nota de crédito, cargada igual',
    'Plazo promedio ponderado de toda la compra comercial',
  ]) {
    assert.ok(!src.includes(largo), `volvió el rótulo largo: "${largo.slice(0, 40)}…"`)
  }
})

test('la columna Fecha declara su formato UNA vez, y es DATE', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  // EL DEFECTO: la columna mostraba 46193 en unas filas y 26/2/2026 en otras, porque había DOS fmt
  // sobre el mismo rango —DATE y, dos líneas más abajo, TEXT— y ganaba el último. Una sola
  // declaración por columna, o vuelve el serial.
  const sobreLaFecha = src.match(/r\(g\.afip0 - 1, g\.afip1, 3, 4\)/g) ?? []
  assert.equal(sobreLaFecha.length, 1, 'dos formatos sobre la misma columna: gana el último y no se nota')
  assert.match(src, /r\(g\.afip0 - 1, g\.afip1, 3, 4\) \}[\s\S]{0,140}numberFormat: E\.NUM\.fecha/)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA GRILLA PARTIDA EN DOS PESTAÑAS: A QUÉ CELDA APUNTA CADA RANGO CON NOMBRE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// EL DEFECTO MEDIDO (05/08). En el archivo vivo, `ARCA_COMPRAS_TOTAL` prometía un importe y devolvía
// "0001-00000204" —un número de comprobante— y `ARCA_FALTAN_N` prometía un contador y devolvía
// "30-71647696-7", un CUIT. Los dos son valores de la LISTA de comprobantes faltantes, que vive
// veinte filas debajo del bloque de cobertura. Un nombre que resuelve a la lista en vez de al bloque
// no da error en ningún lado: lo muestran Recurrentes, Estructura, Materiales y el Cash Flow Mensual.
//
// Se prueba sobre la grilla PARTIDA, que es donde puede torcerse: el tramo de "Proveedores" aterriza
// en la FRONTERA (abajo de las tablas dinámicas) y el de "Materiales" en la fila 4 de su propia
// pestaña, y son dos aritméticas distintas conviviendo en la misma corrida.

test('con la grilla partida en dos pestañas, el marcador de ARCA cae en el BLOQUE, no en la lista', () => {
  // La grilla como la arma el generador, en coordenadas de ANTES de partirla. Los números son los
  // reales de la corrida del 05/08: frontera 176 y 16 notas de crédito.
  const FRONTERA = 176, FILA0 = 4, NOTAS = 16
  const b5 = 100                                  // "3 · NOTAS DE CRÉDITO" — la frontera
  const cabArca = b5 + 6 + NOTAS                  // título+subtítulo+cabecera+notas+TOTAL+vacía+título 4
  const fArcaN = cabArca + 1, fArcaFaltan = cabArca + 5, fArcaVentas = cabArca + 6
  const cabAfip = cabArca + 8                     // y debajo, la LISTA de lo que falta cargar
  const afip0 = cabAfip + 1
  const b3 = afip0 + 40                           // "Materiales" arranca acá

  const g = { fArcaN, fArcaFaltan, fArcaVentas, cabAfip, afip0, fam0: b3 + 2, anchoObras: 7 }
  const tramos = [
    { titulo: 'Proveedores', desde: b5, hasta: b3 - 1, desdeFila: FRONTERA },
    { titulo: 'Materiales', desde: b3, hasta: b3 + 60 },
  ]
  const t = traducirMarcadores(g, tramos, 'Proveedores', { desdeFila: FILA0 })

  // El bloque de cobertura, en las filas donde el generador lo escribe de verdad.
  assert.equal(t.fArcaN, 199, 'ARCA_COMPRAS_N/TOTAL')
  assert.equal(t.fArcaFaltan, 203)
  assert.equal(t.fArcaVentas, 204)
  // Y NO en la lista de comprobantes faltantes, que es donde apuntaban en el archivo vivo.
  assert.ok(t.fArcaN < t.cabAfip, 'el marcador cayó dentro de la lista de faltantes')
  assert.ok(t.fArcaVentas < t.afip0, 'el marcador cayó dentro de la lista de faltantes')
  // `anchoObras` es una CANTIDAD de columnas: traducirlo como fila lo rompería.
  assert.equal(t.anchoObras, 7)
})

// ═══ EL COSTO DE MATERIALES SALE DE LA FUENTE ÚNICA, NO DE UNA FÓRMULA TIPEADA ACÁ ═══
//
// El dueño (13/08/2026): *"el mismo concepto de materiales sea familia o individual no pueden diferir
// de ninguna manera"*. La igualdad entre esta pestaña y OBRAS la prueba `lib/costo-materiales.test.mjs`
// evaluando las dos fórmulas; lo que este test cuida es que ESTE generador siga siendo el que las
// emite. Si alguien vuelve a escribir el SUMIFS a mano acá, aquel test seguiría verde sobre un módulo
// que la pestaña ya no usa — el agujero exacto por el que la divergencia entró la primera vez.
test('las secciones de COSTO de materiales emiten el criterio único, y ninguna suma "Total" a mano', () => {
  const src = readFileSync(new URL('./proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')
  assert.match(src, /import \{ sumaNetaSheet \} from '\.\.\/lib\/costo-materiales\.mjs'/)
  assert.match(src, /import \{ bloqueMaterialesPorObra \} from '\.\.\/lib\/materiales-por-obra\.mjs'/)
  assert.match(src, /const porObra = bloqueMaterialesPorObra\(\{/, 'la sección POR OBRA la arma el módulo')
  assert.match(src, /push\(porObra\.total\)/, 'incluida la fila TOTAL POR OBRA que OBRAS cita')
  // Las formas viejas, exactas. Cada una medía el costo con IVA en una sección distinta.
  for (const viejo of [
    'SUMIFS(${COL_TOTAL};${COL_FAMILIA}',   // familia × mes y familia × obra
    'SUMIF(${COL_FAMILIA};${clave};${COL_TOTAL})', // el total del año por familia
    'SUMIF(${COL_RUBRO};"${RUBROS_CON_FAMILIA[0]}";${COL_TOTAL})', // el control de partición
  ]) assert.ok(!src.includes(viejo), `volvió el criterio con IVA: ${viejo}`)
  // Y el neto/IVA se ubican por rótulo, como todo lo que esta pestaña lee de Compras.
  assert.match(src, /COL_NETO = fijar\('neto', COL_NETO, 'Importe'\)/)
  assert.match(src, /COL_IVA = fijar\('iva', COL_IVA, 'IVA'\)/)
  // La DEUDA sigue midiéndose con IVA: al proveedor se le debe el total de la factura, no su neto.
  assert.match(src, /const neta = \(conds\) => `SUMIFS\(\$\{COL_TOTAL\}/)
})

test('los marcadores de "Materiales" —el tramo sin `desdeFila`— son filas REALES, no NaN', () => {
  // El tramo de Materiales no declara su fila de arranque: la hereda de las opciones de `partir`.
  // La copia inline que traducía los marcadores no tenía ese respaldo y devolvía NaN para los ~20
  // marcadores de esa pestaña. NaN se serializa como null en el JSON de la API, y un `startRowIndex`
  // ausente significa "desde el principio de la hoja": el formato de un bloque cayendo sobre la
  // pestaña entera, sin un solo error y sin nadie mirándolo.
  const tramos = [
    { titulo: 'Proveedores', desde: 100, hasta: 199, desdeFila: 176 },
    { titulo: 'Materiales', desde: 200, hasta: 260 },
  ]
  const g = { fam0: 202, fam1: 220, totFam: 221, obra0: 224, cabObra: 223, anchoObras: 7 }
  const t = traducirMarcadores(g, tramos, 'Materiales', { desdeFila: 4 })
  for (const k of ['fam0', 'fam1', 'totFam', 'obra0', 'cabObra']) {
    assert.ok(Number.isFinite(t[k]), `${k} tradujo a ${t[k]}`)
  }
  assert.equal(t.fam0, 6, 'la fila 200 de la grilla es la 4 de Materiales, así que la 202 es la 6')
})

// ══ EL CRUCE CONTRA COBRANZAS, CON LO QUE EL DUEÑO YA DECIDIÓ (13/08) ════════════════════════════
//
// El aviso "6 factura(s) emitidas que Cobranzas no tiene, $129.499.724" volvía en cada corrida —cada
// dos horas— después de que el dueño contestara "no considerarlas" sobre las dos mayores. Un aviso
// siempre rojo se ignora, y con él se ignora la factura nueva del mes que viene.

const FACTURA = (comprobante, importe, cuit = '30716490498') => ({
  comprobante, importe, cuit, fecha: '11/3/2026',
})
const capturar = (emitidas) => {
  const salida = []
  const dec = reportarVentasSinCobranza(emitidas, { log: (t) => salida.push(String(t)) })
  return { dec, texto: salida.join('\n') }
}

test('las dos facturas que el dueño decidió NO ocupan la línea de aviso', () => {
  const { dec, texto } = capturar([FACTURA('0001-00000208', 75000000), FACTURA('0001-00000213', 40000000)])
  assert.equal(dec.vivos.length, 0)
  assert.ok(!texto.includes('⚠'), `con las dos decisiones cargadas no queda un solo ⚠:\n${texto}`)
  assert.match(texto, /2 hallazgo\(s\) con decisión del dueño/)
  assert.match(texto, /"no considerarlas" \(dueño, 13\/08\/2026\)/)
  assert.match(texto, /0001-00000208/, 'se sigue listando: liberar no es callar')
})

test('una factura SIN decisión sigue avisando, y el importe del aviso ya no la incluye a ella sola', () => {
  const { dec, texto } = capturar([
    FACTURA('0001-00000208', 75000000),
    FACTURA('0001-00000213', 40000000),
    FACTURA('0001-00000777', 14499724),
  ])
  assert.deepEqual(dec.vivos.map((f) => f.comprobante), ['0001-00000777'])
  assert.match(texto, /⚠ VENTAS .*: 1 factura\(s\)/)
  assert.match(texto, /\$\s?14\.499\.724/, 'la plata del aviso es la de lo NO decidido')
  assert.ok(!/129\.499\.724/.test(texto), 'ya no se reporta el total viejo')
})

test('si el importe de la factura decidida cambia, el aviso vuelve con ⚠', () => {
  const { dec, texto } = capturar([FACTURA('0001-00000208', 90000000)])
  assert.equal(dec.vivos.length, 1, 'el dueño decidió sobre $75.000.000')
  assert.equal(dec.caducadas.length, 1)
  assert.match(texto, /⚠ VENTAS/)
  assert.match(texto, /YA NO APLICA/)
})

test('si cambia el CUIT del receptor, tampoco aplica: no es la misma factura', () => {
  const { dec } = capturar([FACTURA('0001-00000208', 75000000, '30999999999')])
  assert.equal(dec.vivos.length, 1)
})

test('sin ninguna factura pendiente no se imprime nada', () => {
  const { dec, texto } = capturar([])
  assert.equal(dec.vivos.length, 0)
  assert.equal(texto, '')
})
