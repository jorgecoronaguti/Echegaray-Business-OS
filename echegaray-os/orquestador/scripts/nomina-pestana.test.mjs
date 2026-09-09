import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { conEfectivoRedondeadoDelDueno, COL_REDONDEADO, oficinaDelEspejo, requestsDeFormato,
  conHuerfanosVisibles, filasSoloRedondeado, leerRedondeadoDelDueno } from './nomina-pestana.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'

// ═══ QUÉ DEFECTO ATRAPAN ESTOS TESTS ═══
//
// La columna «EFECTIVO redondeado» la tipea el DUEÑO: es la cifra que decide al pagar y el OS no la
// puede deducir de ninguna fuente («voy a hacer cargas manuales de montos en columna efectivo
// redondeado, no tocarla»). Hasta el 09/09 la única protección era la guarda NO-BORRAR: el generador
// escribía `''` en esa celda y la fusión conservaba lo que hubiera. Es una protección POR CELDA, y
// por eso se rompe sola en cuanto el cuadro cambia de fila.
//
// Se rompió, y así estaba publicado en el archivo vivo: quince importes suyos en `I14:I28` sobre un
// cuadro de personas que va de la fila 11 a la 25. Doce quedaron al lado de OTRA persona y tres sobre
// la fila de total, una nota y el título del cuadro de oficina.
//
// El fixture de abajo es exactamente esa forma: previo con el cuadro dos filas más abajo que el
// nuevo. Si `conEfectivoRedondeadoDelDueno` volviera a anclarse en el número de fila, el importe de
// Aguero aparecería al lado de Tello y estos tests se ponen en rojo.

/** Un «antes» con el cuadro arrancando en la fila 6 y la columna del dueño con tres importes. */
const previo = () => [
  ['Nómina'],
  ['Jornales · recibos · al 09/09/2026'],
  [],
  ['⇒ Total a pagar', 999],
  ['1 · OBREROS · QUINCENA 01/09–15/09'],
  ['Persona', 'Categoría', 'COBRA', 'ADELANTO', 'YA TRANSFERIDO', 'POR BANCO', 'EN EFECTIVO', 'TOTAL A PAGAR', 'EFECTIVO redondeado', 'Horas', '$/hora'],
  ['AGUERO CRISTIAN', 'Oficial', 100, '', '', '', '', '', 412000, 54, 5974],
  ['GONZALEZ EMILIANO  ▲ sin cargar desde el 03/09', 'Ayudante', 200, '', '', '', '', '', 327000, 41, 4950],
  ['TELLO JUAN', 'Oficial', 300, '', '', '', '', '', 320000, 23, 5924],
  ['⇒ 3 persona(s)', '', 600, '', '', '', '', '', '=SUM(I7:I9)', 118, ''],
]

/** El «después»: el mismo cuadro dos filas más arriba, con la columna del dueño vacía. */
const nueva = () => [
  ['Nómina'],
  ['Jornales · recibos · al 09/09/2026'],
  [],
  ['1 · OBREROS · QUINCENA 01/09–15/09'],
  ['Persona', 'Categoría', 'COBRA', 'ADELANTO', 'YA TRANSFERIDO', 'POR BANCO', 'EN EFECTIVO', 'TOTAL A PAGAR', 'EFECTIVO redondeado', 'Horas', '$/hora'],
  ['AGUERO CRISTIAN', 'Oficial', 100, '', '', '', '', '', '', 54, 5974],
  ['GONZALEZ EMILIANO', 'Ayudante', 200, '', '', '', '', '', '', 41, 4950],
  ['TELLO JUAN', 'Oficial', 300, '', '', '', '', '', '', 23, 5924],
  ['⇒ 3 persona(s)', '', 600, '', '', '', '', '', '=SUM(I6:I8)', 118, ''],
]

test('«EFECTIVO redondeado» viaja con su PERSONA cuando el cuadro cambia de fila', () => {
  const { grid, copiadas } = conEfectivoRedondeadoDelDueno(nueva(), previo())
  assert.equal(copiadas, 3)
  const por = new Map(grid.filter((f) => f[COL_REDONDEADO] !== '').map((f) => [f[0], f[COL_REDONDEADO]]))
  assert.equal(por.get('AGUERO CRISTIAN'), 412000)
  assert.equal(por.get('TELLO JUAN'), 320000)
  // Y NO por número de fila: en la grilla nueva la fila 7 es Gonzalez, no Aguero. Un ancla por fila
  // le pondría a Gonzalez los $412.000 de Aguero, que es lo que estaba publicado en el archivo.
  assert.notEqual(por.get('GONZALEZ EMILIANO'), 412000)
})

test('el aviso pegado al nombre no le hace perder el importe a esa persona', () => {
  // La pestaña vieja escribía «GONZALEZ EMILIANO  ▲ sin cargar desde el 03/09» adentro de la celda del
  // nombre. Sin recortar el aviso, esa fila no se reconoce y su importe sale huérfano: el defecto
  // quedaría arreglado para catorce personas y roto justo para la que más se mira.
  const { grid } = conEfectivoRedondeadoDelDueno(nueva(), previo())
  const fila = grid.find((f) => f[0] === 'GONZALEZ EMILIANO')
  assert.equal(fila[COL_REDONDEADO], 327000)
})

test('la fórmula de la fila de total NO se toma como un importe del dueño', () => {
  // `=SUM(I7:I9)` es del generador. Leído como VALOR llega como un importe y se denunciaría como
  // huérfano en cada corrida — un aviso que suena siempre deja de mirarse.
  const { huerfanos } = conEfectivoRedondeadoDelDueno(nueva(), previo())
  assert.deepEqual(huerfanos, [])
})

test('un importe que no está en la fila de una persona se DENUNCIA, no se reubica', () => {
  // Los tres importes que en el archivo vivo cayeron sobre la fila de total, sobre una nota y sobre
  // el título del cuadro de oficina. Reubicarlos «por orden» sería adivinar a quién se le entregan
  // esos billetes: es plata, y la decisión no es del OS.
  const p = previo()
  p[9][COL_REDONDEADO] = 120000                          // encima de «⇒ 3 persona(s)»
  const { grid, huerfanos } = conEfectivoRedondeadoDelDueno(nueva(), p)
  assert.deepEqual(huerfanos, [{ fila: 10, valor: 120000 }])
  assert.equal(grid.filter((f) => f[COL_REDONDEADO] === 120000).length, 0)
})

test('a nadie que no tenga importe suyo se le inventa uno', () => {
  const p = previo()
  p[6][COL_REDONDEADO] = ''                              // Aguero sin monto tipeado
  const { grid, copiadas } = conEfectivoRedondeadoDelDueno(nueva(), p)
  assert.equal(copiadas, 2)
  assert.equal(grid.find((f) => f[0] === 'AGUERO CRISTIAN')[COL_REDONDEADO], '')
})

// ═══ EL CONTRATO DE COLUMNAS: UNO SOLO PARA LOS TRES CUADROS ═══
//
// El dueño, 09/09: «los diseños de todas las pestañas son distintos, tenés que mejorar y unificar».
// Acá el descuadre era literal: el cuadro 1 declaraba doce columnas, el 2 nueve con «Quincenas del
// mes» en la letra de «EFECTIVO redondeado» y el 3 nueve con «MITAD BLANCA» en esa misma letra.
//
// Se mide sobre el TEXTO del generador porque armar su grilla necesita la red (el espejo de jornales,
// los recibos, Postgres). Es lo mismo que hace `pestanas-sin-prosa.test.mjs` con la prosa, y cuesta
// cero llamadas a la API.
const fuente = readFileSync(new URL('./nomina-pestana.mjs', import.meta.url), 'utf8')

test('los tres cuadros escriben el MISMO encabezado, y sale de una sola constante', () => {
  const encabezados = [...fuente.matchAll(/^\s*fila\((.*)\)$/gm)]
    .map((m) => m[1])
    .filter((x) => x.includes('COLUMNAS') || x.includes("'Persona'"))
  assert.equal(encabezados.length, 3, `esperaba tres encabezados de tabla y encontré ${encabezados.length}`)
  // Ninguno puede escribir la lista a mano: dos listas literales son dos contratos que se separan.
  assert.deepEqual([...new Set(encabezados)], ['...COLUMNAS'])
})

test('el titular no puede sumarse a sí mismo', () => {
  // Las tres cifras del titular empiezan con «⇒», igual que las filas de total que suman. Si el rango
  // del SUMIF las alcanzara, Sheets publicaría #REF! en las tres — pasó con la versión anterior de
  // este titular, en su primera corrida.
  const m = fuente.match(/const deTodos = \(col\) => `SUMIF\(\$A\$\$\{(\w+)\}/)
  assert.ok(m, 'no encontré la fórmula del titular')
  const nombre = m[1]
  const decl = fuente.match(new RegExp(`const ${nombre} = (\\d+)`))
  assert.ok(decl, `no encontré la declaración de ${nombre}`)
  // El titular ocupa las filas 4, 5 y 6: el rango tiene que arrancar en la 7 o más abajo.
  assert.ok(Number(decl[1]) >= 7, `el rango del titular arranca en la fila ${decl[1]} y se sumaría a sí mismo`)
})

test('oficinaDelEspejo lee las columnas de canal de OFICINA, no las de obra', () => {
  // Regresión de dominio que ya costó un aviso: `_J_OFICINA` tiene V $/hora · W banco · X adelanto ·
  // Y total (índices 21 a 24). Con las letras de obra, el adelanto de alguien sale en su banco.
  const grid = [
    ['', 'OBRERO'],
    ['', 'EMI MALDONADO', ...Array(19).fill(''), 1000, 2000, 3000, 4000],
    ['', 'SIN PAGO', ...Array(19).fill(''), 0, 0, 0, 0],
  ]
  const m = oficinaDelEspejo(grid)
  assert.deepEqual(m.get('EMI MALDONADO'), { nombre: 'EMI MALDONADO', fila: 2, hora: 1000, banco: 2000, adelanto: 3000, total: 4000 })
  assert.equal(m.has('SIN PAGO'), false)
})

// ═══ LA PIEL: LA MISMA QUE «Cargas Sociales» Y «Jornales por Quincena» (09/09/2026) ═══
//
// El dueño pidió las tres hermanas con un diseño unificado. El contenido ya coincidía; lo que quedaba
// distinto era la PIEL: esta pestaña pasaba por `lib/estilo-pestana.mjs`, que RELLENA con fondo
// oscuro el título, los rótulos de bloque y los encabezados. Las otras dos pasan por
// `lib/estilo-statement.mjs`, donde la jerarquía la da la tipografía y la única regla es una línea
// fina.
//
// El defecto que atrapan estos tests es el retroceso: cualquiera de esas barras de color vuelve a
// aparecer —por un `E.bloque()`, un `E.encabezado()` o una piel nueva— y el fondo deja de ser blanco.
const grillaMinima = () => [
  ['Nómina'],
  ['Jornales · recibos · al 09/09/2026'],
  [],
  ['⇒ Por banco', 100],
  ['⇒ En efectivo', 200],
  ['⇒ Total a pagar', 300],
  [],
  ['1 · OBREROS · QUINCENA 01/09–15/09'],
  ['Persona', 'Categoría', 'COBRA', 'ADELANTO', 'YA TRANSFERIDO', 'POR BANCO', 'EN EFECTIVO', 'TOTAL A PAGAR', 'EFECTIVO redondeado', 'Horas', '$/hora'],
  ['AGUERO CRISTIAN', 'Oficial', 100, '', '', '', '', '', 412000, 54, 5974],
  ['⇒ 1 persona(s)', '', 100, '', '', '', '', '', '=SUM(I10:I10)', 54, ''],
]

const fondos = (reqs) => reqs.flatMap((r) => {
  const c = r?.repeatCell?.cell?.userEnteredFormat?.backgroundColor
  return c ? [c] : []
})

test('la piel no pinta UNA sola barra de color: todo fondo es blanco', () => {
  const reqs = requestsDeFormato(7, grillaMinima())
  const sucios = fondos(reqs).filter((c) => !(c.red === 1 && c.green === 1 && c.blue === 1))
  assert.deepEqual(sucios, [], 'volvió un relleno: la piel de statement no pinta ninguno')
  assert.ok(fondos(reqs).length, 'la piel ni siquiera barrió el fondo: un relleno viejo sobrevive')
})

test('ninguna celda combinada, y las notas de celda se barren', () => {
  // Las tres notas al pie «[1][2][3]» no vivían en ninguna celda: eran el campo `note`, invisible al
  // leer valores y fórmulas, e impreso al pie del PDF. Sobrevivieron a todas las limpiezas anteriores.
  const reqs = requestsDeFormato(7, grillaMinima())
  assert.ok(reqs.some((r) => r.unmergeCells), 'falta el unmerge: una celda combinada descuadra la grilla entera')
  assert.ok(reqs.some((r) => r.updateCells?.fields === 'note'), 'faltan las notas de celda por barrer')
})

test('los anchos son los de las hermanas: 300 px la columna del concepto y 100 px lo numérico', () => {
  const cols = requestsDeFormato(7, grillaMinima())
    .filter((r) => r.updateDimensionProperties?.range?.dimension === 'COLUMNS')
    .map((r) => [r.updateDimensionProperties.range.startIndex, r.updateDimensionProperties.properties.pixelSize])
  assert.deepEqual(cols.find(([i]) => i === 0), [0, 300])
  // La B es la excepción declarada: «Oficial Especializado» son 21 caracteres de TEXTO y a 100 px el
  // auditor de pantalla los cuenta como `texto_cortado`.
  assert.deepEqual(cols.find(([i]) => i === 1), [1, 150])
  assert.deepEqual(cols.find(([i]) => i === 2), [2, 100])
})

test('el encabezado «Persona» se dibuja como encabezado aunque la gramática no lo conozca', () => {
  // «Persona» no está en `ES_ENCABEZADO` y agregarla ahí le rompería el ancho declarado a «Jornales
  // por Quincena». Si esta regla propia desaparece, la fila de rótulos queda con el mismo peso que un
  // renglón de importes — que es exactamente el defecto que la piel existe para evitar.
  const reqs = requestsDeFormato(7, grillaMinima())
  const enc = reqs.find((r) => r.repeatCell?.range?.startRowIndex === 8
    && r.repeatCell?.cell?.userEnteredFormat?.textFormat?.fontSize === 9)
  assert.ok(enc, 'la fila de «Persona» no recibió la versalita gris de un encabezado')
  assert.equal(enc.repeatCell.cell.userEnteredFormat.textFormat.bold, true)
  assert.ok(reqs.some((r) => r.updateBorders?.range?.startRowIndex === 8 && r.updateBorders?.bottom),
    'al encabezado le falta la línea fina de abajo')
})

test('la moneda va sin centavos y el patrón se escribe en formato US', () => {
  // El archivo es es-AR: la API interpreta el patrón en US y lo MUESTRA con el punto de miles local.
  // Escribirlo con el separador local lo rompe, y el número sale crudo sin que nada avise.
  const patrones = requestsDeFormato(7, grillaMinima())
    .map((r) => r.repeatCell?.cell?.userEnteredFormat?.numberFormat)
    .filter((f) => f?.type === 'CURRENCY')
    .map((f) => f.pattern)
  assert.ok(patrones.length, 'ninguna columna quedó en moneda')
  assert.deepEqual([...new Set(patrones)], ['"$"#,##0;[Red]-"$"#,##0;"—"'])
})

// ═══ LOS IMPORTES DEL DUEÑO QUE NO TIENEN PERSONA NO SE PIERDEN (09/09/2026) ═══
//
// Tres de los quince importes de `I14:I28` no estaban al lado de una persona: caían sobre la fila de
// total, sobre una nota y sobre el título del cuadro siguiente. Se los denunciaba por consola y NO se
// publicaban, o sea que desaparecían de la pestaña en la primera corrida: $750.000 en billetes que
// alguien anotó. La regla del dueño es que no se infiere a quién van Y no se pierden.
const huerfanos = () => [{ fila: 26, valor: 120000 }, { fila: 27, valor: 340000 }, { fila: 28, valor: 290000 }]

test('los importes sin persona se publican debajo del total, en su misma columna y sin nombre', () => {
  const parcial = grillaMinima()
  const out = conHuerfanosVisibles(parcial, huerfanos())
  assert.equal(out.length, parcial.length + 3)
  assert.deepEqual(out.slice(parcial.length).map((f) => f[COL_REDONDEADO]), [120000, 340000, 290000])
  // Sin nombre al lado: no se adivina de quién es. Y sin ningún otro dato en la fila. El resto va con
  // el CENTINELA y no con `''`, que le diría a la guarda NO-BORRAR «conservá lo que haya».
  for (const f of out.slice(parcial.length)) {
    assert.equal(f.filter((c) => c !== VACIO).length, 1)
    assert.equal(f[0], VACIO)
  }
})

test('ningún =SUM del cuadro alcanza a los importes sin persona', () => {
  // El total suma `I n0:I nF`, con `nF` en la última persona. Publicarlos ARRIBA del renglón «⇒» los
  // metería adentro del rango y la pestaña contaría dos veces una plata cuyo destinatario ni siquiera
  // se conoce.
  const parcial = grillaMinima()
  const out = conHuerfanosVisibles(parcial, huerfanos())
  const total = out.find((f) => /^⇒ \d+ persona\(s\)/.test(String(f[0] ?? '')))
  const hasta = Number(String(total[COL_REDONDEADO]).match(/:I(\d+)\)/)[1])   // 1-based
  const primeraHuerfana = out.findIndex((f) => f[COL_REDONDEADO] === 120000) + 1
  assert.ok(primeraHuerfana > hasta, `el =SUM llega hasta la fila ${hasta} y el primer huérfano está en la ${primeraHuerfana}`)
})

test('publicarlos en cualquier otro lugar de la grilla FALLA, no se hace en silencio', () => {
  // Insertarlos en el medio correría las fórmulas `=SUM(C…)` de los cuadros 2 y 3, que se escriben
  // con el número de fila que tienen al construirse: los totales de oficina y de liquidaciones
  // finales pasarían a sumar el rango de al lado, sin un solo error a la vista.
  assert.throws(() => conHuerfanosVisibles(grillaMinima().slice(0, 10), huerfanos()), /tiene que ser la de total/)
})

test('sin importes sin persona, la grilla no cambia', () => {
  const parcial = grillaMinima()
  assert.deepEqual(conHuerfanosVisibles(parcial, []), parcial)
})

test('el formateador encuentra las filas del dueño por su FORMA, no por su número de fila', () => {
  // Viven fuera de todo cuadro, así que el barrido de moneda por tabla no las alcanza: sin esto se
  // dibujarían crudas, «120000», al lado de importes con signo.
  const out = conHuerfanosVisibles(grillaMinima(), huerfanos())
  assert.deepEqual(filasSoloRedondeado(out), [11, 12, 13])
  // Y no confunde con ellas ni a una persona ni a la fila de total, que también llevan algo en I.
  assert.equal(filasSoloRedondeado(grillaMinima()).length, 0)
})

test('lo que el dueño tipeó se parte en los que tienen persona y los que no, y no se pierde ninguno', () => {
  const p = previo()
  p[9][COL_REDONDEADO] = 120000                          // encima de «⇒ 3 persona(s)»
  const { suyos, huerfanos: sinDueno } = leerRedondeadoDelDueno(p)
  assert.equal(suyos.size + sinDueno.length, 4)
  assert.equal(sinDueno.length, 1)
})

test('una nota al pie con un importe encima NO se toma por una persona', () => {
  // MEDIDO EN UNA COPIA DEL ARCHIVO (09/09/2026). `A27` era «▲ 15 sin recibo confirmado esta
  // quincena — …», una nota al pie del layout viejo, y tenía $340.000 en la columna del dueño. Con la
  // regla anterior —«tiene rótulo en A y no es un total ni una sección»— pasaba por fila de persona:
  // sus billetes se buscaban bajo el nombre «▲ 15 SIN RECIBO…», no matcheaban a nadie, no se reponían
  // Y TAMPOCO se denunciaban. El importe desaparecía en silencio.
  const p = previo()
  p.push(['▲ 15 sin recibo confirmado esta quincena — el banco sale de la planilla', '', '', '', '', '', '', '', 340000])
  const { suyos, huerfanos: sinDueno } = leerRedondeadoDelDueno(p)
  assert.equal(suyos.size, 3)
  assert.deepEqual(sinDueno, [{ fila: 11, valor: 340000 }])
})

test('el importe de alguien que cambió de nombre no se pierde entre las dos listas', () => {
  // MEDIDO EN UNA COPIA (09/09/2026): el previo decía «ZOGBER LEONARDO» y la grilla nueva dice
  // «ZOGBE LEONARDO» —el nombre canónico sale del recibo y cambió—. Sus $360.000 no se reponían en
  // ninguna fila y tampoco salían por huérfanos, porque en el previo SÍ estaban al lado de una
  // persona. Se caían entre las dos listas. No se empareja por parecido: se publica y se pregunta.
  const p = previo()
  p[8][0] = 'ZOGBER LEONARDO'
  const { copiadas, sinUbicar } = conEfectivoRedondeadoDelDueno(nueva(), p)
  assert.equal(copiadas, 2)
  assert.deepEqual(sinUbicar, [{ quien: 'ZOGBER LEONARDO', valor: 320000 }])
  // Y de ahí sale a una fila visible, igual que un huérfano.
  const parcial = grillaMinima()
  assert.equal(conHuerfanosVisibles(parcial, sinUbicar).length, parcial.length + 1)
})

test('los quince importes del dueño se conservan: los que tienen persona y los que no', () => {
  // La cuenta del archivo vivo: doce al lado de su persona ($3.624.000) y tres sin dueño conocido
  // ($750.000). Si alguna de las dos vías se rompe, la suma deja de dar $4.374.000 — que es
  // exactamente lo que el dueño verifica mirando la columna.
  const p = previo()
  p[9][COL_REDONDEADO] = 120000                          // sobre «⇒ 3 persona(s)»
  const { grid, huerfanos: sinDueno, sinUbicar } = conEfectivoRedondeadoDelDueno(nueva(), p)
  const publicados = [
    ...grid.map((f) => f[COL_REDONDEADO]).filter((v) => typeof v === 'number'),
    ...sinDueno.map((h) => h.valor), ...sinUbicar.map((s) => s.valor),
  ]
  assert.equal(publicados.length, 4)
  assert.equal(publicados.reduce((a, b) => a + b, 0), 412000 + 327000 + 320000 + 120000)
})
