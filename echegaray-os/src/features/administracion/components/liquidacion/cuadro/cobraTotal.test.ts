// EL ORDEN DEL CUADRO: BLANCO · NEGRO · TOTAL · cómo se paga (dueño, 14/09/2026).
//
// Antes: *«quiero q la columna de valor hora este primero y dp cuanto cobra total (eso de "le falta
// pagar", esta mal no quiero q sea asi)»*. Después: *«realmente no se entiende nada el cuadro de liq de
// hs, vamos a rehacer»* con el sueldo partido en blanco (recibo) y negro. Lo que se sigue protegiendo:
// el orden de lectura, que la frase «le falta pagar» no vuelva, y que el rojo de la fila sea un control
// que puede dar rojo (`estadoDelPago` es puro y se ejecuta).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { estadoDelPago, tituloDeJornales } from './estadoDelPago.ts'
import { BLOQUES, PLATA, columnasDe, corrimientoDelRotulo, geometriaDelBloque, tramosDeBloques } from './bloquesDelCuadro.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const GRILLA = fuente('../GrillaEspejoQuincena.tsx')
const CELDAS = fuente('./CeldasBlancoNegro.tsx')
const PIE = fuente('./PieDelEspejo.tsx')

// CAMBIÓ EL 15/09/2026 (dueño, textual: «necesito al lado de banco y negro lo que se le ha pagado efectivamente
// y que vaya restando al total o incrementando en el otro llegado el caso; así no sirve, rehacer — pésimo: no
// considera adelantos en efectivo y resta del efectivo total»). Las dos bandas pasan a tener las MISMAS cinco
// columnas —cuánto, pagado, saldo— y la fila cierra con Total · Pagado · Saldo. Se fueron «Adelanto banco /
// embargos», «Adelanto efectivo» y «Total efectivo»: un adelanto no es un descuento del sueldo, es un pago.
// Lo que se sigue protegiendo: el orden de lectura, las dos bandas rotuladas, que la fila dibuje en el mismo
// orden que el encabezado, y que «le falta pagar» no vuelva.
const ORDEN_DEL_CUADRO = [
  'Horas',
  'Hs recibo', '$/h cat.', 'Banco', 'Pagado', 'Saldo',
  'Hs', '$/h negro', 'Importe', 'Pagado', 'Saldo',
  'Presentismo', 'Efect. red.', 'Total', 'Pagado', 'Saldo', 'Saldo red.',
]

// «EFECT. RED. ✎» VUELVE AL CUADRO (dueño, 16/09/2026: la pidió él). MUTACIÓN: sacarla → rojo.
test('EL ENCABEZADO: Persona · HORAS · RECIBO BLANCO(5) · RECIBO NEGRO(5) · RESTO DEL CÁLCULO', () => {
  // DESDE EL 17/09/2026 LA LISTA SE EJECUTA, no se lee con una regex: vive en `bloquesDelCuadro.ts`.
  const columnas = PLATA.map((c) => ({ clave: c.clave, rotulo: c.rotulo.replace(' ✎', ''), bloque: c.bloque }))
  const plata = PLATA.map((c) => c.rotulo).join('|')
  assert.deepEqual(columnas.map((c) => c.rotulo), ORDEN_DEL_CUADRO, 'el orden exacto, sin Cliente · Obra')
  // LAS DOS BANDAS SON SIMÉTRICAS: se leen en paralelo, y por eso la de arriba puede no repetir la leyenda.
  assert.deepEqual(columnas.filter((c) => c.bloque === 'blanco').map((c) => c.rotulo),
    ['Hs recibo', '$/h cat.', 'Banco', 'Pagado', 'Saldo'])
  assert.deepEqual(columnas.filter((c) => c.bloque === 'negro').map((c) => c.rotulo),
    ['Hs', '$/h negro', 'Importe', 'Pagado', 'Saldo'])
  assert.ok(!/Cliente|Obra'/.test(plata), 'no vuelve la columna Cliente · Obra')
  // LAS COLUMNAS QUE EL DUEÑO SACÓ NO VUELVEN.
  for (const muerta of ['Adelanto banco / embargos', 'Adelanto efectivo', 'Total efectivo', 'Cobra total']) {
    assert.ok(!plata.includes(muerta), `«${muerta}» volvió al encabezado`)
  }
  // LOS DÍAS ADELANTE: la plantilla pone los días antes que la plata, y el encabezado también.
  assert.match(columnasDe(2), /^minmax\(var\(--liq-persona,200px\),1fr\) repeat\(2,36px\) /, 'MUTACIÓN: la plata antes que los días')
  // EL ENCABEZADO DIBUJA CADA BLOQUE CON SUS COLUMNAS, en el renglón 2 y del mismo `PLATA`.
  assert.match(GRILLA, /PLATA\.filter\(\(c\) => c\.bloque === t\.clave\)/)
  assert.deepEqual(BLOQUES.map((b) => b.rotulo), ['Horas', 'Recibo blanco', 'Recibo negro · plataforma', 'Resto del cálculo'])
  // Y LA FILA DIBUJA EN ESE ORDEN.
  const fila = GRILLA.slice(GRILLA.indexOf('function Fila('), GRILLA.indexOf('function Total('))
  const orden = ['<CeldaDeDia', '<CeldaHorasPagas', '<CeldaHorasBlanco', '<CeldaHoraCategoria', '<CeldaNeto',
    'campo="pagadoBanco"', 'lado="banco"', '<CeldaHorasNegro', '<CeldaImporteNegro', 'campo="pagadoEfectivo"',
    'lado="efectivo"', '<CeldaPresentismo', '<CeldaRedondeo', '<CeldaTotal', '<CeldaPagadoTotal', 'lado="total"',
    '<CeldaSaldoRedondeado']
    .map((x) => fila.indexOf(x))
  assert.ok(orden.every((i) => i > 0), 'están todas las celdas')
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, 'en el orden pedido')
  assert.ok(PLATA.some((c) => c.clave === 'efectivoRedondeado'), 'la columna «Efect. red.» está en el cuadro (dueño)')
  assert.match(GRILLA, /espejo-total-redondeo/, 'y la fila de total la suma')
  assert.match(PIE, /cifra\('Efectivo redondeado'/, 'el pie la sigue sumando')
})

// «NECESITO Q EN ALGUNA COLUMNA DE LIQ HS ME DIGA CUANTO COBRA EN TOTAL» (dueño, 14/09/2026) sigue vigente: el
// TOTAL está y el SALDO cierra la fila. Y NINGUNA COLUMNA QUEDA PEGADA A LA DERECHA (dueño, 16/09/2026, textual:
// «está mal la columna de "saldo" en liq de hs porque esa queda fija, y la que has dejado tirada al último a la
// derecha sí se mueve como saldo: has hecho mal eso, rehacer urgente»). El saldo `sticky right` del 15/09 se leía
// como una columna distinta de la que se movía. MUTACIÓN: volver a pegar una columna a la derecha → rojo.
test('TOTAL EN EL CUADRO Y EN EL PIE; NINGUNA COLUMNA PEGADA A LA DERECHA', () => {
  const PANEL = fuente('./PanelDeLaPersona.tsx')
  assert.ok(PLATA.some((c) => c.clave === 'total' && c.rotulo === 'Total'))
  assert.ok(PLATA.some((c) => c.clave === 'saldo' && c.rotulo === 'Saldo'))
  assert.match(PIE, /cifra\('Total', totales\.cobra/)
  assert.match(PIE, /cifra\('Saldo', p\.saldoTotal/)
  assert.equal((PANEL.match(/rotulo="Cobra total"/g) ?? []).length, 2, 'las dos cadenas del panel')
  assert.ok(!/Total quincena/.test(GRILLA + PANEL), 'no queda el rótulo viejo')
  assert.ok(!/right: -CANAL_SCROLL|COLUMNA_SALDO|CLASE_SALDO/.test(GRILLA), 'volvió una columna pegada a la derecha')
  // LA ÚNICA `sticky` DE LA GRILLA ES LA DE PERSONA (`COLUMNA_FIJA`, importada): acá no se declara ninguna.
  assert.ok(!/position: 'sticky'/.test(GRILLA), 'la grilla declara un sticky propio: sólo Persona (tabla.tsx) es fija')
  // EL SALDO TOTAL ES UNA CELDA COMÚN, la última de la fila y del total.
  const fila = GRILLA.slice(GRILLA.indexOf('function Fila('), GRILLA.indexOf('function Total('))
  assert.match(fila, /<CeldaPagadoTotal fila=\{fila\} \/>\s*<CeldaSaldo fila=\{fila\} lado="total" \/>\s*<CeldaSaldoRedondeado fila=\{fila\} \/>\s*<\/BloqueDeColumnas>\s*<\/div>/)
})

// ═══ «SALDO RED.» — LO QUE RESTA PAGAR, SI SALIERA TODO EN BILLETES (dueño, 16/09/2026) ═══
//
// *«dame una columna más al lado de saldo en donde diga saldo redondeado como si lo que resta pagar se pagara en
// efectivo»*. Va PEGADA A SALDO y sale de él. Lo que este test protege —y las mutaciones que lo ponen en rojo—:
// que la columna esté al lado de Saldo y no en cualquier lado; que NO sea editable ni se guarde (sería una
// segunda «Efect. red.», que es otra cosa y sí la decide el dueño); y que el total sume saldos ya redondeados.
test('SALDO RED. VA AL LADO DE SALDO, SE DERIVA DE ÉL, NO SE EDITA NI SE GUARDA', () => {
  const claves: string[] = PLATA.map((c) => c.clave)
  assert.equal(claves[claves.indexOf('saldoRedondeado') - 1], 'saldo', 'MUTACIÓN: separarla del Saldo')
  assert.equal(claves[claves.length - 1], 'saldoRedondeado', 'cierra la fila')
  // EL RÓTULO SIN «✎»: la de al lado, «Efect. red. ✎», sí se escribe. Confundirlas es el defecto a evitar.
  const saldoRed = PLATA.find((c) => c.clave === 'saldoRedondeado')
  assert.equal(saldoRed?.rotulo, 'Saldo red.')
  assert.ok(!saldoRed?.rotulo.includes('✎'), 'MUTACIÓN: no es editable')
  // SALE DEL SALDO TOTAL, no de `enEfectivo` ni del redondeo guardado del dueño.
  const celda = CELDAS.slice(CELDAS.indexOf('export function CeldaSaldoRedondeado('), CELDAS.indexOf('export function CeldaPagadoTotal('))
  assert.match(celda, /fila\.linea\.pago\.saldoTotal/)
  assert.ok(!/efectivoRedondeado|enEfectivo/.test(celda), 'MUTACIÓN: se mezcló con la columna que edita el dueño')
  assert.ok(!/Escribible|onBlur|upsert/.test(celda), 'MUTACIÓN: se volvió escribible')
  // EL SALDO EXACTO SIGUE VISIBLE en el título: dos cifras casi iguales sin explicación se leen como un error.
  assert.match(celda, /Saldo exacto \$\{pesos\(saldo\)\}/)
  // EL TOTAL DE LA COLUMNA Y EL PIE: suma de redondeados uno por uno (`sumaDelSaldoRedondeado`), no de la suma.
  assert.match(GRILLA, /sumaDelSaldoRedondeado\(visibles\.map\(\(f\) => f\.linea\.pago\.saldoTotal\)\)/)
  assert.match(GRILLA, /espejo-total-saldo-redondeado/)
  assert.match(PIE, /cifra\('Saldo redondeado'/)
})

// EL ENCABEZADO FIJO (dueño, 15/09/2026: «quiero eso fijo en liq hs», con captura del cuadro desplazado).
test('EL ENCABEZADO SE PEGA ARRIBA Y LA CAJA NO LE ROBA EL ANCLAJE', () => {
  // EL DEFECTO QUE ATRAPA, y es de especificación y no de navegador: `sticky` se ancla al scrollport MÁS
  // CERCANO. Con los rótulos ADENTRO del div que scrollea de costado, ese scrollport es la propia tabla —que
  // no se desplaza en vertical— y la cabecera se va con la página. Y con `overflow: hidden` en la caja del
  // cuadro, el scrollport pasa a ser la caja y vuelve a pasar lo mismo.
  assert.match(GRILLA, /<CintaHorizontal/, 'los rótulos viven afuera del scroller')
  assert.match(GRILLA, /cabecera=\{\(/)
  assert.match(GRILLA, /marcoPropio=\{\{ \.\.\.MARCO_SCROLL/, 'el canal de 20 px de la columna fija se conserva')
  assert.ok(!/borderRadius: 10, overflow: 'hidden'/.test(GRILLA), 'MUTACIÓN: `hidden` crea scrollport y mata el sticky')
  assert.match(GRILLA, /borderRadius: 10, overflow: 'clip'/)
  // LAS DOS BANDAS SE PEGAN JUNTAS: son UN encabezado de dos renglones, no dos elementos.
  const cuerpo = GRILLA.slice(GRILLA.indexOf('function Encabezado('), GRILLA.indexOf('function Fila('))
  assert.match(cuerpo, /gridRow: 1/, 'la banda es el renglón 1 de la misma grilla')
  assert.match(cuerpo, /gridRow: 2/, 'y los rótulos el 2')
  assert.equal((GRILLA.match(/<Encabezado /g) ?? []).length, 1, 'un solo encabezado, dentro de la cabecera pegajosa')
  // Y «PERSONA» NO SE DESPEGA DE SU COLUMNA: adentro del envoltorio pegajoso `sticky` no ancla nada, así que
  // el rótulo se contra-desplaza con el mismo corrimiento. MUTACIÓN: sacarlo → el rótulo se va y los nombres
  // se quedan, que es la versión de encabezado del defecto de «números sin dueño».
  assert.match(cuerpo, /transform: `translateX\(\$\{corrimiento\}px\)`/)
  // UNA SOLA CELDA PARA LOS DOS RENGLONES (QA, 16/09/2026): eran dos y la de abajo medía 18 px fijos; con «HS
  // RECIBO» envuelto el renglón 2 es más alto y por la franja de arriba asomaba «S RECIBO» bajo «Persona».
  // MUTACIÓN: volver a dos celdas, o a una altura fija, → rojo.
  assert.equal((cuerpo.match(/translateX\(\$\{corrimiento\}px\)/g) ?? []).length, 1, 'una sola celda fija que cubre los dos renglones')
  assert.match(cuerpo, /gridRow: '1 \/ span 2', alignSelf: 'stretch'/, 'la celda Persona cubre los dos renglones estirada')
  assert.ok(!/height: ALTO_LIQ\.encabezado/.test(cuerpo), 'MUTACIÓN: una altura fija deja pasar el rótulo envuelto')
})

// EL PANEL DICE LO MISMO QUE EL CUADRO (16/09/2026). Después de rehacer el cuadro, el panel por persona seguía
// mostrando «Total efectivo = cobra total − banco − adelantos» con una celda `enEfectivo` que el cuadro ya no lee:
// dos respuestas a «cuánto le falta cobrar en mano», y la segunda era la resta que el dueño calificó de «pésimo».
// MUTACIÓN: volver a poner esa fila, o sacar las celdas Pagado del panel → rojo.
test('EL PANEL DE LA PERSONA MUESTRA PAGADO Y SALDO POR LADO, NO «TOTAL EFECTIVO»', () => {
  const PANEL = fuente('./PanelDeLaPersona.tsx')
  const cadena = PANEL.slice(PANEL.indexOf('function CadenaBlancoNegro('), PANEL.indexOf('function CadenaSinModelo('))
  for (const muerta of ['Total efectivo', 'cobra total − banco − adelantos', 'campo="enEfectivo"', 'Adelanto efectivo', 'Adelanto banco / embargos']) {
    assert.ok(!cadena.includes(muerta), `«${muerta}» sigue en la cadena blanco + negro del panel`)
  }
  // CAMBIÓ EL 17/09/2026 (cuatro bloques): lo pagado y el saldo de cada lado viven DENTRO de su recibo, como en la fila.
  const orden = ['bloque="horas"', 'campo="porBanco"', '<PagadoYSaldo lado="banco"', 'campo="negro"', '<PagadoYSaldo lado="efectivo"',
    'bloque="resto"', 'campo="cobra"', 'rotulo="Pagado"', 'rotulo="A pagar hoy"']
    .map((x) => cadena.indexOf(x))
  assert.ok(orden.every((i) => i > 0), 'están todos los renglones')
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, 'en el orden del cuadro: horas · blanco · negro · resto')
  // LAS MISMAS CELDAS QUE EL CUADRO, y el saldo se LEE: nadie escribe un saldo.
  for (const campo of ['pagadoBanco', 'pagadoEfectivo']) assert.match(cadena, new RegExp(`<Escribible campo="${campo}"`))
  assert.match(cadena, /<Leida valor=\{p\.saldoBanco\}/)
  assert.match(cadena, /<Leida valor=\{p\.saldoEfectivo\}/)
  assert.match(cadena, /avisoDeExcedente\(p\)/, 'el saldo negativo dice adónde va el exceso')
  assert.match(cadena, /aPagarEfectivo == null \? 'sin saldo que afirmar'/, 'NULL no es cero tampoco en el panel')
})

test('LA FRASE NO QUEDA ESCRITA EN EL CUADRO, EL PIE, EL PANEL NI CAJA', () => {
  for (const rel of ['../GrillaEspejoQuincena.tsx', './CeldasDelEspejo.tsx', './CeldasBlancoNegro.tsx', './PanelDeLaPersona.tsx', '../solapas/caja-nomina.tsx', '../solapas/cierre.tsx']) {
    const texto = fuente(rel)
    assert.ok(!/le falta pagar|leFaltaPagar|le-falta-pagar|CeldaLeFaltaPagar/i.test(texto), `${rel} todavía la tiene`)
  }
})

test('EL TOTAL SE PINTA DE ROJO SÓLO SI LA FILA NO CIERRA; EL ESTIMADO SE VE APAGADO CON «est.»', () => {
  // ANTES ERA «Total efectivo» (`CeldaEfectivoDelSueldo`, retirada el 15/09/2026 con su columna). El rojo que
  // hay que conservar es el de la fila que NO CIERRA, y hoy vive en el Total.
  const cuerpo = CELDAS.slice(CELDAS.indexOf('export function CeldaTotal('), CELDAS.indexOf('export function CeldaPagado('))
  assert.match(cuerpo, /estadoDelPago\(l\)/)
  assert.match(cuerpo, /e\.noCierra \? V\.neg/)
  // Y EL ÁMBAR DEL SALDO NEGATIVO: no es un error de la fila, es plata que pasa al otro lado.
  const saldo = CELDAS.slice(CELDAS.indexOf('export function CeldaSaldo('), CELDAS.indexOf('export function CeldaSaldoRedondeado('))
  assert.match(saldo, /negativo \? V\.warn : V\.tinta/)
  assert.match(saldo, /avisoDeExcedente\(p\)/)
  assert.ok(!/Math\.max\(0,/.test(saldo), 'MUTACIÓN: netear el saldo a cero escondería que cobró de más')
  assert.match(CELDAS, /const ESTIMADO: CSSProperties = \{ color: V\.apagado, fontStyle: 'italic' \}/)
  assert.match(CELDAS, /estimado && <Est \/>/)
  // ÁMBAR SÓLO PARA EL PROBLEMA: el recibo que paga más horas que las cargadas.
  assert.match(CELDAS, /reciboExcedeHoras[\s\S]{0,200}color: V\.warn/)
  assert.ok(!/#[0-9A-Fa-f]{6}/.test(CELDAS), 'sin hex sueltos: tokens V')
})

const base = { cobra: 552156, adelanto: 0, yaTransferido: 200000, porBanco: 230240.12, enEfectivo: 121915.88, total: 352156, reciboNeto: 230240.12, blancoAcuerdo: 276078, efectivoAcuerdo: 276078 }

test('UNA FILA QUE NO CIERRA SE MARCA Y DICE POR CUÁNTO; UNA QUE CIERRA NO MUESTRA NADA', () => {
  const bien = estadoDelPago(base)
  assert.equal(bien.noCierra, false)
  assert.match(bien.titulo, /Cobra \$552\.156 − adelanto \$0 − ya transferido \$200\.000 = banco/)
  const mal = estadoDelPago({ ...base, enEfectivo: 169759.88, total: 400000 })
  assert.equal(mal.noCierra, true)
  // CAMBIÓ EL 15/09/2026: el título arranca con la diferencia («no cierra: diferencia $X»).
  assert.match(mal.titulo, /^no cierra: diferencia \$47\.844/)
  assert.equal(estadoDelPago({ ...base, cobra: null, total: null }).noCierra, false)
})

test('JORNALES VA ENTERO EN EL TITLE Y NO MANDA: horas, cobra, banco y efectivo', () => {
  assert.equal(
    tituloDeJornales({ referenciaJornales: { horas: 94, cobra: 552156, porBanco: 250000, enEfectivo: 121915.88, difiere: false } }),
    'JORNALES (referencia): 94 h · cobra $552.156 · banco $250.000 · efectivo $121.915,88',
  )
  assert.equal(tituloDeJornales({ referenciaJornales: null }), null)
})

// ═══ LOS CUATRO BLOQUES (dueño, 17/09/2026: «que se distinga la sección de hs, recibo blanco, recibo negro y el resto
// de cálculo») ═══ Atrapa: una columna que se queda sin bloque o en dos, un bloque que se superpone o deja un hueco
// en la grilla (el fondo quedaría corrido de sus columnas), dos bloques vecinos con el mismo fondo (no se
// distinguirían), un color que no sale de un token, y —regla del dueño— que alguna columna pedida desaparezca.
test('CADA COLUMNA EN UN SOLO BLOQUE, LOS BLOQUES CUBREN LA GRILLA SIN HUECOS Y NINGUNA COLUMNA SE QUITÓ', () => {
  for (const c of PLATA) assert.ok(BLOQUES.some((b) => b.clave === c.bloque), `${c.clave} sin bloque`)
  const dias = 15
  const tramos = tramosDeBloques(dias)
  assert.equal(tramos[0].inicio, 2, 'el primer bloque empieza después de Persona')
  for (let i = 1; i < tramos.length; i++) assert.equal(tramos[i].inicio, tramos[i - 1].inicio + tramos[i - 1].span, `hueco o solape antes de ${tramos[i].clave}`)
  const pistas = columnasDe(dias).split(' ').length - 1 + dias - 1 // `repeat(15,36px)` cuenta como una
  assert.equal(tramos.reduce((s, t) => s + t.span, 0), pistas, 'los bloques cubren todas las columnas menos Persona')
  assert.deepEqual(tramos.map((t) => t.span), [dias + 1, 5, 5, 6])
  for (let i = 1; i < BLOQUES.length; i++) assert.notEqual(BLOQUES[i].fondo, BLOQUES[i - 1].fondo, 'dos vecinos con el mismo fondo')
  for (const b of BLOQUES) if (b.fondo) assert.match(b.fondo, /^rgb\(var\(--os-[a-z-]+-rgb\) \/ 0?\.\d+\)$/, 'el fondo sale de un token con alfa')
  // LO PEDIDO POR EL DUEÑO NO SE QUITA: las diecisiete columnas, incluidas las que ya volvieron una vez.
  for (const clave of ['efectivoRedondeado', 'saldoRedondeado', 'presentismo', 'pagadoBanco', 'pagadoEfectivo', 'saldoBanco', 'saldoEfectivo', 'total', 'pagado', 'saldo']) {
    assert.ok(PLATA.some((c) => c.clave === clave), `se quitó «${clave}»`)
  }
  assert.equal(PLATA.length, 17)
})

// EL RÓTULO DEL BLOQUE SIGUE A LA VISTA (QA, 17/09/2026): al desplazar la cinta, «RECIBO BLANCO» se iba por la izquierda
// y quedaba una banda sin nombre. Atrapa: una geometría que no coincide con las columnas reales (el rótulo se correría
// antes o después de su bloque) y un corrimiento que no se frena en los bordes.
test('LA GEOMETRÍA DE CADA BLOQUE COINCIDE CON SUS COLUMNAS Y EL RÓTULO SE FRENA EN LOS BORDES', () => {
  const dias = 15
  const horas = geometriaDelBloque('horas', dias)
  assert.deepEqual(horas, { desde: 8, ancho: 15 * 36 + 72 + 15 * 8 })
  const blanco = geometriaDelBloque('blanco', dias)
  assert.equal(blanco.desde, horas.desde + horas.ancho + 8, 'el blanco empieza un aire después de horas')
  assert.equal(blanco.ancho, 72 + 96 + 124 + 112 + 112 + 4 * 8)
  const negro = geometriaDelBloque('negro', dias)
  assert.equal(negro.desde, blanco.desde + blanco.ancho + 8)
  const resto = geometriaDelBloque('resto', dias)
  assert.equal(resto.desde + resto.ancho, dias * 36 + PLATA.reduce((s, c) => s + c.px, 0) + (dias + PLATA.length) * 8,
    'el último bloque termina donde termina la tabla')
  assert.equal(corrimientoDelRotulo(0, blanco), 0, 'sin desplazar, el rótulo no se mueve')
  assert.equal(corrimientoDelRotulo(blanco.desde - 50, blanco), 0, 'antes de su bloque, tampoco')
  assert.equal(corrimientoDelRotulo(blanco.desde + 100, blanco), 100)
  assert.equal(corrimientoDelRotulo(99_999, blanco), blanco.ancho, 'nunca más allá de su bloque')
})
