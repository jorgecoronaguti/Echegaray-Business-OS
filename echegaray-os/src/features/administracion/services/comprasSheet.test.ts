import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claseDeAdjunto, clavesRecienCargadas, conteosDe, ESTADO, esEstructura, filtroDe, ordenarPorCarga,
  pasa, pastillaDe, porOrdenDeCarga, RECIEN_CARGADAS, recorteDeLista,
  TOPE_EN_PANTALLA, totalesDe,
  type Filtrable,
} from './comprasSheet.ts'

let siguiente = 1
const fila = (p: Partial<Filtrable> = {}): Filtrable => ({
  // El renglón se autoincrementa: los casos que no hablan del orden no tienen por qué escribirlo, y
  // repetir `fila: 1` en todos haría que «las últimas 30» no pudiera distinguir ninguna.
  fila: siguiente++,
  estado: ESTADO.PAGADO, obra_texto: 'Quattropani', anulada: false, total: 1000,
  tiene_adjunto: true, ...p,
})

// ── LA PASTILLA ────────────────────────────────────────────────────────────────────────────────

test('PROYECTADO NO se muestra como «A pagar»: es una proyección, no una obligación', () => {
  // 39 de las 882 filas están así. Pintarlas de ámbar junto a las 16 pendientes diría que hay 55
  // pagos por hacer cuando hay 16.
  const p = pastillaDe(ESTADO.PROYECTADO)
  assert.equal(p.texto, 'Proyectado')
  assert.notEqual(p.color, pastillaDe(ESTADO.PENDIENTE).color)
})

test('una fila anulada se ve anulada, no pagada', () => {
  assert.equal(pastillaDe(ESTADO.ANULADA).texto, 'Anulada')
})

test('un estado que la pestaña no trae NO se asume: se dice que falta', () => {
  assert.equal(pastillaDe(null).texto, 'Sin estado')
  assert.equal(pastillaDe('').texto, 'Sin estado')
  assert.equal(pastillaDe('cualquier cosa').texto, 'Sin estado')
})

test('Pendiente es «A pagar» y Pagado es «Pagado» — los rótulos del canónico', () => {
  assert.equal(pastillaDe(ESTADO.PENDIENTE).texto, 'A pagar')
  assert.equal(pastillaDe(ESTADO.PAGADO).texto, 'Pagado')
})

// ── LOS FILTROS ────────────────────────────────────────────────────────────────────────────────

test('«A pagar» cuenta SÓLO las pendientes, no las proyectadas', () => {
  const filas = [
    fila({ estado: ESTADO.PENDIENTE }), fila({ estado: ESTADO.PROYECTADO }),
    fila({ estado: ESTADO.PAGADO }),
  ]
  assert.equal(filas.filter((f) => pasa(f, 'aPagar')).length, 1)
})

test('UNA FILA ANULADA NO APARECE EN NINGÚN FILTRO DE TRABAJO', () => {
  // Sin esto, «6 sin obra» manda a alguien a imputar seis filas muertas.
  const muerta = fila({ anulada: true, estado: ESTADO.ANULADA, obra_texto: null, tiene_adjunto: false })
  assert.equal(pasa(muerta, 'sinObra'), false)
  assert.equal(pasa(muerta, 'sinComprobante'), false)
  assert.equal(pasa(muerta, 'aPagar'), false)
})

test('pero SÍ aparece en «todo»: la cuenta de la pantalla tiene que cerrar contra la pestaña', () => {
  // El dueño ve 882 filas en su Sheet. Una pantalla que muestra 876 sin decirlo miente por omisión.
  assert.equal(pasa(fila({ anulada: true }), 'todo'), true)
})

test('«sin obra» mira el texto, y un espacio en blanco no es una obra', () => {
  assert.equal(pasa(fila({ obra_texto: '   ' }), 'sinObra'), true)
  assert.equal(pasa(fila({ obra_texto: null }), 'sinObra'), true)
  assert.equal(pasa(fila({ obra_texto: 'Taller' }), 'sinObra'), false)
})

test('«sin comprobante» trata el dato ausente como faltante, no como presente', () => {
  assert.equal(pasa(fila({ tiene_adjunto: undefined }), 'sinComprobante'), true)
  assert.equal(pasa(fila({ tiene_adjunto: false }), 'sinComprobante'), true)
  assert.equal(pasa(fila({ tiene_adjunto: true }), 'sinComprobante'), false)
})

test('un filtro que no existe vuelve a «todo» en vez de vaciar la lista', () => {
  assert.equal(filtroDe('drop table'), 'todo')
  assert.equal(filtroDe(undefined), 'todo')
  assert.equal(filtroDe('aPagar'), 'aPagar')
})

// ── LOS TOTALES ────────────────────────────────────────────────────────────────────────────────

test('las anuladas cuentan en el total de FILAS y no en los conteos de trabajo', () => {
  const t = totalesDe([
    fila({ total: 100 }),
    fila({ anulada: true, estado: ESTADO.ANULADA, total: 0, obra_texto: null, tiene_adjunto: false }),
  ])
  assert.equal(t.nTotal, 2)
  assert.equal(t.nSinObra, 0)
  assert.equal(t.nSinComprobante, 0)
  assert.equal(t.total, 100)
})

test('«A pagar» suma pendientes y NO suma proyectadas', () => {
  const t = totalesDe([
    fila({ estado: ESTADO.PENDIENTE, total: 500 }),
    fila({ estado: ESTADO.PROYECTADO, total: 9_000_000 }),
  ])
  assert.equal(t.aPagar, 500)
})

test('un total NULL no se cuenta como cero disfrazado de dato, Y SE DECLARA', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // La suma no puede hacer otra cosa que saltear el `null`, y hasta acá lo salteaba EN SILENCIO: el
  // pie decía «TOTAL $ 250» sobre dos filas y no había forma de saber que una no estaba adentro.
  // Quien compara ese total contra el Sheet no cierra y no sabe por qué. `sinImporte` es lo que la
  // pantalla escribe al lado; si vuelve a 0 con filas sin importe, este test se pone rojo.
  const t = totalesDe([fila({ total: null }), fila({ total: 250 })])
  assert.equal(t.total, 250)
  assert.equal(t.sinImporte, 1)
})

test('una fila ANULADA sin importe no infla el «sin importe cargado»', () => {
  // Las anuladas ya están fuera de todas las cuentas: contarlas acá mandaría a alguien a cargar el
  // importe de una fila muerta.
  const t = totalesDe([fila({ anulada: true, estado: ESTADO.ANULADA, total: null }), fila({ total: 10 })])
  assert.equal(t.sinImporte, 0)
})

test('sin filas sin importe, el aviso no existe: no es «0 sin importe»', () => {
  assert.equal(totalesDe([fila({ total: 10 })]).sinImporte, 0)
})

test('el conteo de cada chip sale de la población entera, no de la página', () => {
  const c = conteosDe([
    fila({ estado: ESTADO.PENDIENTE }), fila({ obra_texto: null }),
    fila({ tiene_adjunto: false }), fila({ anulada: true }),
  ])
  assert.equal(c.todo, 4)
  assert.equal(c.aPagar, 1)
  assert.equal(c.sinObra, 1)
  assert.equal(c.sinComprobante, 1)
})

// ── EL ADJUNTO ─────────────────────────────────────────────────────────────────────────────────

test('un PDF no se dibuja como miniatura: se vería roto', () => {
  assert.equal(claseDeAdjunto('application/pdf'), 'pdf')
  assert.equal(claseDeAdjunto('image/jpeg'), 'imagen')
  assert.equal(claseDeAdjunto('image/heic'), 'imagen')
})

test('sin tipo no hay adjunto, y eso se dice — no se dibuja un hueco', () => {
  assert.equal(claseDeAdjunto(null), 'ninguno')
  assert.equal(claseDeAdjunto(undefined), 'ninguno')
  assert.equal(claseDeAdjunto(''), 'ninguno')
})

test('un tipo que no es imagen ni PDF se muestra igual, como «otro»', () => {
  assert.equal(claseDeAdjunto('application/zip'), 'otro')
})

test('las tres asignaciones que no son obra llevan su chip; una obra real no', () => {
  // Medido en `compra_sheet` el 25/08/2026: F931 15 filas, Taller 58, Almacen 24.
  for (const x of ['F931', 'Taller', 'Almacen', 'almacén', '  taller  ']) {
    assert.equal(esEstructura(x), true, x)
  }
  for (const x of ['LA ESTRELLA', 'San Francisco', 'MESSINA', '', null, undefined]) {
    assert.equal(esEstructura(x), false, String(x))
  }
})

// ── EL RECORTE DE LA LISTA ─────────────────────────────────────────────────────────────────────
//
// ═══ EL DEFECTO QUE ATRAPAN ═══
//
// Medido en producción el 06/09/2026: la pestaña dibujaba sus 947 filas juntas y la página medía
// 43.871px de alto. El recorte lo baja a ~9.000, y al hacerlo abre un defecto NUEVO y peor que el
// que cierra: `?s=<fila>` es un enlace directo que ya se usa, y una fila más allá del tope quedaría
// abierta en el panel y AUSENTE de la lista — el panel diciendo una cosa y la lista otra, sin nada
// que explique por qué. Por eso el enlace manda sobre el tope, y por eso se prueba.

/** Una lista de N filas numeradas 1..N, que es como vienen de la pestaña. */
const listaDe = (n: number) => Array.from({ length: n }, (_, i) => ({ fila: i + 1 }))

test('lo que entra en el tope se dibuja entero y no dice que falta nada', () => {
  const r = recorteDeLista(listaDe(TOPE_EN_PANTALLA), { tope: TOPE_EN_PANTALLA })
  assert.equal(r.enPantalla.length, TOPE_EN_PANTALLA)
  assert.equal(r.ocultas, 0)
})

test('por encima del tope se recorta, y CUÁNTAS quedaron fuera es un número, no un «hay más»', () => {
  // Sin `ocultas` la lista recortada se lee como la lista entera: el modo de falla es silencioso.
  const r = recorteDeLista(listaDe(947), { tope: 200 })
  assert.equal(r.enPantalla.length, 200)
  assert.equal(r.ocultas, 747)
  assert.equal(r.enPantalla.length + r.ocultas, 947)
})

test('EL ENLACE DIRECTO MANDA SOBRE EL TOPE: la fila abierta siempre está en la lista', () => {
  // `?s=611` con la fila 611 en la posición 610 de un tope de 200. Si el corte ignorara `abierta`,
  // el panel mostraría la compra 611 y la lista no la tendría.
  const r = recorteDeLista(listaDe(947), { tope: 200, abierta: 611 })
  assert.ok(r.enPantalla.some((f) => f.fila === 611), 'la fila abierta quedó fuera de su propia lista')
  assert.equal(r.enPantalla.length, 611)
  assert.equal(r.ocultas, 336)
})

test('una fila abierta que NO está en el recorte filtrado no estira nada', () => {
  // El filtro puede haberla sacado —«A pagar» con una compra pagada abierta—. Estirar hasta una fila
  // que no está en la lista devolvería `-1 + 1 = 0` y, con un `Math.max` mal puesto, la lista vacía.
  const r = recorteDeLista(listaDe(947), { tope: 200, abierta: 9999 })
  assert.equal(r.enPantalla.length, 200)
  assert.equal(r.ocultas, 747)
})

test('`todo` levanta el tope entero: ninguna fila queda fuera de alcance', () => {
  // El recorte no puede volverse una pared. Sin esta puerta, la fila 900 sólo se alcanzaría
  // adivinando su número en la URL.
  const r = recorteDeLista(listaDe(947), { tope: 200, todo: true })
  assert.equal(r.enPantalla.length, 947)
  assert.equal(r.ocultas, 0)
})

test('el tope por defecto es el declarado, no uno que se elige en cada llamada', () => {
  // Dos pantallas con dos topes distintos sobre la misma lista es cómo nace un «no hay más» que
  // depende de por dónde entraste.
  assert.equal(recorteDeLista(listaDe(TOPE_EN_PANTALLA + 1)).enPantalla.length, TOPE_EN_PANTALLA)
  assert.equal(recorteDeLista(listaDe(TOPE_EN_PANTALLA + 1)).ocultas, 1)
})

// ── EL ORDEN DE CARGA Y EL CORTE «RECIÉN CARGADAS» ─────────────────────────────────────────────
//
// EL DEFECTO, medido en producción el 08/09/2026: el dueño mandó 14 comprobantes por el chat y en la
// pantalla no los encontraba. Estaban — pero la lista ordenaba por FECHA DEL COMPROBANTE y dibujaba
// 200 de 809: la fila 930, cargada ese día con fecha 12/05/2026, quedaba en el puesto ~600 y el
// aviso de las que no se dibujan estaba al pie de la lista.

test('lo último CARGADO va arriba aunque su factura sea la más vieja de todas', () => {
  const viejaReciénCargada = { fila: 930, fecha: '2026-05-12' }
  const nuevaCargadaAntes = { fila: 100, fecha: '2026-09-08' }
  // Con el orden por fecha, la de septiembre ganaba y la 930 se hundía. Ésta es la inversión.
  assert.ok(porOrdenDeCarga(viejaReciénCargada, nuevaCargadaAntes) < 0)
  const lista = ordenarPorCarga([nuevaCargadaAntes, viejaReciénCargada, { fila: 500, fecha: null }])
  assert.deepEqual(lista.map((f) => f.fila), [930, 500, 100])
})

test('la fecha desempata, pero NUNCA le gana a la fila', () => {
  // Mismo renglón: recién ahí manda la fecha, y la más nueva primero.
  assert.ok(porOrdenDeCarga({ fila: 7, fecha: '2026-09-08' }, { fila: 7, fecha: '2026-01-01' }) < 0)
  // Renglón distinto: la fecha no tiene nada que decir, ni siquiera cuando falta.
  assert.ok(porOrdenDeCarga({ fila: 8, fecha: null }, { fila: 7, fecha: '2026-09-08' }) < 0)
})

test('ordenar no mueve la lista original: los conteos miran la misma población', () => {
  const original = [{ fila: 1, fecha: '2026-01-01' }, { fila: 9, fecha: '2026-02-01' }]
  ordenarPorCarga(original)
  assert.deepEqual(original.map((f) => f.fila), [1, 9])
})

test('«recién cargadas» son las últimas 30 POR RENGLÓN, no por fecha', () => {
  const filas = Array.from({ length: 50 }, (_, i) => fila({
    // La fecha va al revés del renglón a propósito: si el corte mirara la fecha, se quedaría con
    // las 30 PRIMERAS cargadas — exactamente el defecto, y este test se pondría rojo.
    fila: i + 1, fecha: `2026-01-${String(50 - i).padStart(2, '0')}`,
  }))
  const claves = clavesRecienCargadas(filas)
  assert.equal(claves.size, RECIEN_CARGADAS)
  assert.ok(claves.has(50), 'la última cargada quedó fuera del chip que existe para verla')
  assert.ok(claves.has(21))
  assert.equal(claves.has(20), false, 'el corte de 30 dejó pasar una fila 31.ª')
})

test('una anulada no ocupa un lugar en «recién cargadas»', () => {
  const claves = clavesRecienCargadas(
    [fila({ fila: 900, anulada: true }), fila({ fila: 10 }), fila({ fila: 9 })], 2,
  )
  assert.deepEqual([...claves], [10, 9])
})

test('el chip filtra por el conjunto, y SIN conjunto no deja pasar a nadie', () => {
  const f = fila({ fila: 930 })
  assert.equal(pasa(f, 'recienCargadas', new Set([930])), true)
  assert.equal(pasa(f, 'recienCargadas', new Set([929])), false)
  // Un `pasa` sin el conjunto no puede saberlo: devolver `true` haría que el chip mostrara TODO.
  assert.equal(pasa(f, 'recienCargadas'), false)
})

test('el chip cuenta lo suyo y no rompe la cuenta de los otros', () => {
  const filas = Array.from({ length: 40 }, (_, i) => fila({ fila: i + 1 }))
  const c = conteosDe(filas)
  assert.equal(c.recienCargadas, RECIEN_CARGADAS)
  assert.equal(c.todo, 40)
})

test('«recién cargados» es una llave válida de la URL', () => {
  assert.equal(filtroDe('recienCargadas'), 'recienCargadas')
})
