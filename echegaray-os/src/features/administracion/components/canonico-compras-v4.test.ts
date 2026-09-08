import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO «3 · COMPRAS · LA PESTAÑA DEL SHEET», DEL HANDOFF CRM / ADMINISTRACIÓN v4 ═══
//
// Mismo método que `canonico-personal-v2.test.ts` y `canonico-proveedores-v2.test.ts`: lo que se
// protege son DECISIONES ESCRITAS —qué columnas hay, qué mide cada una, qué NO se dibuja— y no un
// comportamiento de render. Montar React para leer un estilo que ya está literal en el archivo mete
// un runtime entero entre la afirmación y el hecho.
//
// ═══ EL DEFECTO CARO QUE ATRAPA ═══
//
// Que Compras vuelva al canon de AGOSTO. Fue la última de las tres pantallas del canvas A en salir
// de ahí, y el modo de falla no es que alguien lo deshaga a propósito: es que `shared/components/
// canon` sigue existiendo, sigue siendo cómodo —`TarjetaTabla` trae caja, encabezado y pie en un
// componente— y declara EXACTAMENTE lo contrario del criterio 3 del patrón v2 («sin cajas: filos,
// tipografía y números tabulares»). Una tabla portada por inercia con `TarjetaTabla` se ve
// razonable en aislamiento y rompe la pestaña entera: dos listas hermanas, una con caja y otra sin.
//
// LO QUE ESTE TEST NO PRUEBA: que la pantalla se vea así en un navegador. Los altos viajan como
// `style` inline y las columnas como clase de Tailwind; la fidelidad final se mide leyendo el CSS
// emitido y el HTML renderizado. Lo que sí prueba es que el ARCHIVO no puede volver a decir otra
// cosa sin que algo se ponga rojo.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (a: string) => readFileSync(join(DIR, a), 'utf8')

/**
 * El archivo SIN sus comentarios, bloque y línea.
 *
 * Varias comprobaciones preguntan «¿esta pantalla usa X?», y los comentarios de este repo explican
 * POR QUÉ NO se usa X — o sea que nombran justo lo que se está prohibiendo. Sin el filtro, el test
 * se pone rojo por la explicación de la decisión correcta: el falso positivo que enseña a borrar el
 * comentario. Se barren también los `{/* … *\/}` de JSX, cuyas líneas interiores no empiezan por `*`.
 */
const sinComentarios = (texto: string) => texto
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('//'))
  .join('\n')

const codigoTabla = () => sinComentarios(fuente('TablaComprasSheet.tsx'))
const codigoCelda = () => sinComentarios(fuente('CeldaComprobante.tsx'))
const codigoPanel = () => sinComentarios(fuente('PanelCompraSheet.tsx'))
const codigoPagina = () => sinComentarios(
  readFileSync(join(DIR, '../../../app/(main)/administracion/compras/page.tsx'), 'utf8'),
)

// ── LA CAJA SE FUE ──────────────────────────────────────────────────────────────────────────────

test('la lista NO vuelve al canon de agosto: ni caja, ni encabezado gris, ni pie adentro', () => {
  // Los cuatro nombres son las cuatro mitades del mismo objeto. Prohibir sólo `TarjetaTabla` dejaría
  // pasar una tabla sin caja pero con el encabezado de 38px y el rótulo de 10px/.05em, que es medio
  // canon de agosto dibujado dentro del patrón v2.
  const t = codigoTabla()
  for (const pieza of ['TarjetaTabla', 'EncabezadoCanon', 'FilaCanon', 'PieCanon', 'VacioCanon']) {
    assert.equal(t.includes(pieza), false, `Compras volvió a ${pieza}: el canon de agosto trae la caja`)
  }
  assert.match(t, /from '@\/shared\/components\/v2\/patron'/, 'la tabla dejó de correr por el patrón v2')
})

test('el ritmo lo pone `ALTO_V2`, no un número escrito en esta tabla', () => {
  // `ritmo-vertical.test.ts` ya prohíbe el `height: 44` a mano en todo consumidor del patrón. Acá se
  // afirma lo positivo: que este archivo PIDE el alto y la cabecera en vez de no escribir ninguno.
  const t = codigoTabla()
  assert.match(t, /height: ALTO_V2\.fila/, 'la fila no pide su alto al patrón')
  assert.match(t, /style=\{ENCABEZADO\}/, 'la cabecera no usa la del patrón (30px, filo #D7D5CF)')
  assert.match(t, /borderBottom: `1px solid \$\{V\.lineaFila\}`/, 'el divisor de fila no es el token del v4')
  assert.match(t, /className=\{CAJA_CONTENIDO\}|\$\{CAJA_CONTENIDO\}/, 'el borde deja de sumarse por afuera')
})

// ── LAS NUEVE COLUMNAS ───────────────────────────────────────────────────────────────────────────

test('la grilla es la del canvas, carácter por carácter', () => {
  // `Administración v4 · Pantallas.dc.html:222`. Literal y no armada en runtime: Tailwind escanea el
  // TEXTO del archivo, así que una clase concatenada no se compila nunca y la fila se dibuja sin
  // grilla — un defecto que no se ve en ningún test de unidad, sólo mirando la pantalla.
  const t = codigoTabla()
  assert.ok(
    t.includes('grid-cols-[minmax(150px,1.2fr)_minmax(120px,1fr)_112px_minmax(110px,1fr)_92px_88px_104px_112px_26px]'),
    'la grilla ancha dejó de ser la del canvas más los 88px de «A pagar»',
  )
  assert.match(t, /const GAP = 'gap-\[14px\]'/, 'el `gap:14` del canvas se perdió')
})

test('los nueve rótulos, en el orden del canvas y pedidos al patrón', () => {
  // `v4A:223`. El orden ES la decisión: COMPROBANTE y FORMA DE PAGO subieron a columna propia y la
  // FECHA bajó al panel. Escribir los rótulos a mano en vez de pedirle `RotuloCol` al patrón es la
  // fuga que `ritmo-vertical.test.ts` ya cazó una vez en `TablaUsuarios`.
  const t = codigoTabla()
  const rotulos = [...t.matchAll(/<RotuloCol[^>]*>([^<]+)<\/RotuloCol>/g)].map((m) => m[1])
  assert.deepEqual(rotulos, [
    'Proveedor', 'Concepto', 'Comprobante', 'Cliente / asignación', 'Estado', 'A pagar', 'Forma de pago',
    'Importe',
  ])
  assert.match(t, /<RotuloCol derecha>Importe<\/RotuloCol>/, 'IMPORTE dejó de alinearse a la derecha')
})

test('«A pagar» es la fecha PREVISTA de la columna Q, no la fecha de caja', () => {
  // ═══ EL DEFECTO QUE ESTE TEST ATRAPA ═══
  //
  // La pestaña tiene DOS fechas candidatas y hoy coinciden en 925 de 927 filas: `fecha_prevista`
  // (Q · «Fecha prevista de pago (día)», cuándo HAY que pagar) y `fecha_caja` (AD · «Fecha de caja»,
  // cuándo la plata SALIÓ). Elegir la equivocada se vería idéntico en pantalla —es el mismo defecto
  // por accidente que `orquestador/lib/compras-fila.mjs` ya cazó una vez leyendo por posición— y
  // pondría en la columna que decide pagos una fecha que sólo existe DESPUÉS de pagar.
  //
  // Además es la fuente del filtro «Vencimiento»: `Compras!AN` es un ARRAYFORMULA sobre `$Q$4:$Q`
  // (`orquestador/lib/proveedores-aging.mjs`), así que columna y filtro son el mismo concepto.
  const t = codigoTabla()
  assert.match(t, /fechaCompleta\(f\.fecha_prevista\)/, 'la columna «A pagar» dejó de leer la fecha prevista (Q)')
  assert.equal(t.includes('f.fecha_caja'), false, 'la columna pasó a la fecha de caja: eso es cuándo se pagó, no cuándo hay que pagar')
  // EL AÑO ENTERO. `diaMes` y `fechaCortaConAnio` abrevian, y una obligación de 2025 escrita «15/11»
  // se lee como la semana que viene: dos ventanas de tiempo en la misma columna.
  assert.equal(t.includes('diaMes(f.fecha_prevista)'), false, 'la fecha a pagar volvió a perder el año')
  assert.equal(t.includes('fechaCortaConAnio(f.fecha_prevista)'), false, 'la fecha a pagar volvió a perder el año')
  // Y UN VACÍO ES UN VACÍO. En la fuente hay una celda vacía en 6 de las 927 filas; un «—» o un
  // «sin fecha» se leería como algo que el Sheet dice.
  assert.equal(/fechaCompleta\(f\.fecha_prevista\)\s*[?|]{1,2}/.test(t), false,
    'se le puso texto de relleno a la fecha ausente: en el Sheet esa celda está vacía')
})

test('el corte intermedio retira exactamente las celdas que le sacó a la grilla', () => {
  // UNA CELDA DE MÁS CORRE LA FILA ENTERA: cae en una segunda fila implícita y la tabla se dibuja al
  // doble de alto y desalineada. `grilla-v2-en-telefono.test.ts` hace esta cuenta para TODAS las
  // tablas del v2, pero sólo en los cortes `1249` y `767`; el de Compras es propio (`1459`, la cuenta
  // del panel) y quedaba sin nadie que lo mirara — justo el corte que se movió al entrar «A pagar».
  const t = codigoTabla()
  const pistas = (v: string) => {
    const m = new RegExp(`${v}grid-cols-\\[([^\\]]+)\\]`).exec(t)
    assert.ok(m, `la tabla dejó de declarar su grilla \`${v || 'ancha'}\``)
    return m[1].split('_').length
  }
  const anchas = pistas('')
  const medias = pistas('max-\\[1459px\\]:')
  assert.equal(anchas, 9, 'la grilla ancha dejó de tener nueve columnas')
  // Menos la declaración de la constante: quedan sus usos reales en celdas.
  const usos = (t.match(/\bSUELTA_ANCHO\b/g) ?? []).length - 1
  assert.equal(
    usos, (anchas - medias) * 2,
    `el corte suelta ${anchas - medias} columnas y SUELTA_ANCHO se usa en ${usos} celdas `
    + '(cabecera + fila: dos por columna). La celda que sobra desalinea la tabla entera',
  )
})

test('la última columna de 26px es EL PAPEL, no un `···` decorativo', () => {
  // El mockup dibuja ahí un menú sin handler. Se reemplaza por el comprobante, que es lo que el
  // dueño pidió que estuviera en la fila.
  const t = codigoTabla()
  assert.match(t, /<CeldaComprobante adjuntos=\{f\.adjuntos\}/)
  assert.equal(t.includes('⋯'), false, 'volvió el menú decorativo de la última columna')
})

test('el papel distingue el vínculo que es un HECHO del que es deducido', () => {
  // La regla del contrato: `registro` y `match_manual` van en tinta; `match_numero` es una
  // inferencia y va apagado, con su confianza en el `title`. Presentar un cálculo con la misma cara
  // que un hecho es el defecto de fondo que este repo persigue en todos lados.
  const c = codigoCelda()
  assert.match(c, /const firme = a\.vinculado_por === 'registro' \|\| a\.vinculado_por === 'match_manual'/)
  assert.match(c, /firme \? C\.tintaSuave : C\.tenue/, 'el vínculo deducido dejó de dibujarse apagado')
  assert.match(c, /confianza \$\{Math\.round\(\(a\.confianza \?\? 0\) \* 100\)\}/)
  // Sin comprobante NO es un hueco: es un dato, y además es trabajo pendiente.
  assert.match(c, /title="Sin comprobante guardado"/)
})

// ── TRES COSAS QUE EL CANON PINTABA DE MÁS ──────────────────────────────────────────────────────

test('el ESTADO es texto de color, no una cápsula con fondo y borde', () => {
  // `v4A:223`: «Pagado» es `<span style="color:#067647">`, sin fondo ni radio. Los cuatro colores
  // siguen saliendo de `pastillaDe()` —la regla de negocio no se movió—; lo que se retira es el
  // cromo, que en 947 filas son 947 cápsulas compitiendo con el importe.
  const t = codigoTabla()
  assert.match(t, /color: estado\.color/, 'el estado dejó de teñirse con el color de su regla')
  for (const cromo of ['estado.fondo', 'estado.borde', 'borderRadius: 11']) {
    assert.equal(t.includes(cromo), false, `la pastilla volvió: ${cromo}`)
  }
})

test('«sin comprobante» va APAGADO y no en ámbar: 876 de 882 filas lo tienen vacío', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // El ámbar de este repo significa «esto bloquea». Aplicado a una columna que está vacía en el 99%
  // de las filas deja de significar eso y pasa a ser el color de fondo de la tabla: el día que algo
  // bloquee de verdad, nadie lo va a distinguir. El canvas la escribe en #91918B (`v4A:226`).
  // Lo que sí bloquea sigue teniendo dónde leerse: el filtro «Sin comprobante» y el panel, donde la
  // propiedad habla de UNA compra y ahí el ámbar vuelve a decir algo.
  const t = codigoTabla()
  const celda = /data-testid=\{f\.comprobante \? undefined : 'compra-sin-comprobante'\}/.exec(t)
  assert.ok(celda, 'la celda del comprobante dejó de identificarse')
  const bloque = t.slice(Math.max(0, celda.index - 400), celda.index)
  assert.match(bloque, /color: f\.comprobante \? V\.tintaSuave : V\.tenue/)
  assert.equal(bloque.includes('V.warn'), false, 'la columna del comprobante volvió al ámbar')
  // Y el filtro que junta a todas las que están igual sigue existiendo: retirar el color sin dejar
  // la puerta sería esconder el trabajo, no simplificar la pantalla.
  assert.match(codigoPagina(), /sinComprobante: urlSheet\(\{ f: 'sinComprobante'/)
})

test('«estructura» es una palabra al lado del destino, no un recuadro', () => {
  // `v4A:227`: 11px #91918B pegado a `F931`/`Taller`/`Almacen`, sin borde ni radio. Un recuadro
  // alrededor de una palabra es una caja más, que es justo lo que el patrón v2 vino a sacar.
  const t = codigoTabla()
  const chip = t.indexOf('esEstructura(obra)')
  assert.ok(chip > 0, 'se fue la marca de lo que no es obra')
  const bloque = t.slice(chip, chip + 400)
  assert.equal(/border(Radius)?:/.test(bloque), false, 'el chip «estructura» recuperó su recuadro')
  assert.match(bloque, /fontSize: '11px', color: V\.tenue/)
})

// ── EL PIE Y EL PANEL ───────────────────────────────────────────────────────────────────────────

test('los totales y la nota al pie viven DENTRO de la columna de la lista', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Estaban debajo del split. Con el panel abierto, «6 de 882» cruzaba por debajo de los DOS a lo
  // ancho de una pantalla donde la lista ocupa la mitad, y el número se leía como si describiera el
  // panel también. El canvas los dibuja dentro de la columna (`v4A:245`).
  const p = codigoPagina()
  const lista = p.indexOf('<TablaComprasSheet')
  const pie = p.indexOf('<PieCompras')
  const panel = p.indexOf('<PanelCompraSheet')
  assert.ok(lista > 0 && pie > 0 && panel > 0, 'la pestaña dejó de tener sus tres piezas')
  assert.ok(pie > lista, 'el pie quedó antes de la lista')
  assert.ok(pie < panel, 'el pie volvió debajo del split, fuera de la columna de la lista')
})

test('el pie dice qué ventana suma cada número, y no calla lo que queda afuera', () => {
  // «Total de lo que hay en pantalla» es el rótulo del canvas y es literal: suma lo DIBUJADO, no la
  // población. Un total al que le falta algo y no lo dice es peor que no tener total — alguien lo
  // compara contra el Sheet, no cierra, y no hay forma de saber por qué.
  const t = codigoTabla()
  assert.match(t, /Total de lo que hay en pantalla/)
  assert.match(t, /t\.sinImporte > 0 &&/, 'el pie dejó de declarar las filas sin importe')
  assert.match(codigoPagina(), /<PieCompras filas=\{recorte\.enPantalla\}/, 'el pie suma algo que no es lo que se dibuja')
})

test('el panel abre al costado y DEJA DE SER INELÁSTICO', () => {
  // ═══ EL DEFECTO MEDIDO (06/09/2026, producción, 390×844) ═══
  //
  // El panel fijaba `width: 372` inline en TODO ancho, sin media query. A 390px se quedaba con 396
  // —372 más 24 de margen— y la lista, que sí lleva `min-w-0`, cedía todo: `document.body.
  // scrollWidth` daba 416 contra un viewport de 390 y «Ver las a pagar →» quedaba cortado contra el
  // borde. `PanelFilo` es la misma geometría del patrón que ya usan Proveedores y Clientes, con su
  // corte en `lg`: debajo de 1024 baja bajo la lista con un filo superior en vez del lateral.
  const panel = codigoPanel()
  assert.match(panel, /<PanelFilo testid="panel-compra-sheet">/, 'el panel volvió a escribir su propia geometría')
  assert.equal(panel.includes('width: 372'), false, 'el panel volvió a fijar un ancho inelástico')
  // Y el split tiene que apilarse: un panel elástico dentro de un `display:flex` fijo sigue
  // estrangulando la lista en vez de bajar.
  assert.match(codigoPagina(), /className="flex flex-col lg:flex-row lg:items-start"/)

  // LO QUE NO SE TOCÓ, y se afirma para que no se toque de paso: el panel ya se verificó en
  // producción con navegador. Sus ocho propiedades y sus dos verbos siguen donde estaban.
  assert.match(panel, /propiedadesDe\(/)
  assert.match(panel, /<AccionesCompra/)
})

test('el recorte de la lista no puede volverse una pared', () => {
  // Recortar a 200 filas sin dejar salida convertiría «no lo veo» en «no existe». La puerta viaja en
  // la URL como el resto del estado, así que la vista se comparte con un enlace.
  const p = codigoPagina()
  assert.match(p, /recorteDeLista\(visibles, \{ abierta: filaAbierta\?\.fila \?\? null, todo: verTodo \}\)/)
  assert.match(p, /data-testid="compras-recortada"/, 'el recorte dejó de decir cuántas quedaron fuera')
  assert.match(p, /data-testid="ver-todas-las-compras"/, 'el recorte se quedó sin salida')
  // Y SE DECLARA ARRIBA DE LA TABLA (08/09/2026). Al pie estaba a 200 filas de scroll de distancia:
  // quien entraba a buscar un comprobante que no veía leía una lista completa, no una recortada.
  assert.ok(p.indexOf('data-testid="compras-recortada"') < p.indexOf('<TablaComprasSheet'),
    'el aviso del recorte volvió abajo de la lista que recorta')
})

test('la lista ordena por CARGA y el chip de lo recién cargado está enchufado', () => {
  // El defecto del 08/09: ordenaba por fecha del comprobante, y lo cargado hoy con fecha vieja caía
  // fuera de las 200 dibujadas. La regla es pura y se prueba en `comprasSheet.test.ts`; acá se clava
  // que la pantalla la USA — una regla perfecta que nadie llama deja la lista igual que antes.
  const p = codigoPagina()
  assert.match(p, /clavesRecienCargadas\(todas\)/, 'el corte de lo recién cargado dejó de calcularse')
  assert.match(p, /pasa\(f, filtro, recien\)/, 'el filtro dejó de recibir el conjunto: el chip mostraría todo')
  const servicio = sinComentarios(readFileSync(join(DIR, '../services/comprasSheetService.ts'), 'utf8'))
  assert.match(servicio, /ordenarPorCarga\(leidas\)/, 'la lista volvió a salir en el orden de la consulta')
  assert.ok(servicio.indexOf(".order('fila'") < servicio.indexOf(".order('fecha'"),
    'la fecha del comprobante volvió a mandar sobre el orden de carga')
})

// ── LAS CINCO QUE QUEDABAN EN EL CANON DE AGOSTO (06/09/2026) ────────────────────────────────────
//
// El porte del 06/09 llevó la TABLA al canvas y dejó declaradas cinco piezas todavía en el canon de
// agosto: el cuerpo en 12,5px, el panel en 372, el fondo de la fila elegida, los chips-pastilla y la
// franja del encabezado. El dueño decidió llevarlas al canvas. Lo que sigue las clava.

test('el cuerpo de la celda es el 13,5px del canvas, y sale de UNA constante', () => {
  const t = codigoTabla()
  assert.match(t, /const CUERPO = '13\.5px'/, 'el cuerpo dejó de ser el del canvas (`v4A:223`)')
  // Ocho celdas con ocho literales se desfasan de a una y nadie lo ve. Ninguna celda de la fila
  // puede volver a escribir su propio 12/12,5: las auxiliares del canvas son 11px (unidad de
  // negocio, «estructura»), 12px (el mono del comprobante) y 10,5px (la deuda parcial).
  const desde = t.indexOf('data-testid={`compra-${f.fila}`}')
  const fila = t.slice(desde, t.indexOf('</div>', t.indexOf('<CeldaComprobante', desde)))
  assert.ok(desde > 0 && fila.length > 500, 'no se pudo aislar la fila')
  const propios = [...fila.matchAll(/fontSize: '(1[0-9](?:\.5)?)px'/g)].map((m) => m[1])
  assert.deepEqual([...new Set(propios)].sort(), ['10.5', '11', '12'],
    `una celda volvió a escribir su propio cuerpo en vez de pedir CUERPO: ${propios.join(', ')}`)
})

test('la fila elegida se dice SÓLO con el filo amarillo: sin fondo y sin padding que lo compense', () => {
  const t = codigoTabla()
  assert.match(t, /boxShadow: elegida \? FILO_ELEGIDA : undefined/,
    'el filo de la fila abierta dejó de ser el del canvas (`v4A:229`)')
  // EL FONDO ERA DEL v2 DE AGOSTO. El canvas dibuja la fila elegida igual que las demás salvo el
  // filo; el #FEF9E6 competía con el ámbar del importe en la misma fila.
  assert.equal(t.includes('V.seleccion'), false, 'volvió el fondo de la fila elegida')
  // `inset` no ocupa caja: compensarlo con padding corre las ocho columnas 2px SÓLO en la fila
  // abierta, y la tabla se mueve al elegir. Ninguna sangría izquierda en la fila.
  assert.equal(/paddingLeft: 2\b/.test(t), false, 'apareció un padding que compensa el filo')
  // Un solo canal para el borde: el filo ámbar de problema se retiró de esta tabla porque el
  // destino ya lo dice dos veces (texto rojo + ⚠) y el canvas no lo dibuja.
  assert.equal(t.includes('FILO_BLOQUEA'), false,
    'volvieron dos significados al mismo box-shadow: elegir una fila le borra el problema')
  assert.match(t, /color: obra \? V\.tintaSuave : V\.neg/, 'el destino dejó de gritar lo sin imputar')
  assert.match(t, /<IconoProblema/, 'se fue el ⚠ del destino, que es el otro canal del problema')
})

test('el panel mide los 344 del canvas y la cabecera le reserva 392', () => {
  const patron = sinComentarios(readFileSync(join(DIR, '../../../shared/components/v2/patron.tsx'), 'utf8'))
  assert.match(patron, /lg:w-\[344px\]/, 'el panel volvió a los 372 del v2 de agosto')
  assert.match(
    sinComentarios(readFileSync(join(DIR, '../../../shared/components/v2/CabeceraSeccion.tsx'), 'utf8')),
    /lg:w-\[392px\]/, 'el hueco de la cabecera se desfasó del panel (344 + 24 + 24)')
  // Y EL CORTE DE COLUMNAS SIGUE AL PANEL. 1026 (las nueve columnas + gap, con los 88 de «A pagar»)
  // + 393 (panel + margen + filo + sangría) + 40 (padding de página) = 1459: por debajo se sueltan
  // tres columnas. Con el corte viejo de 1356 quedaba una franja de 103px donde las nueve no entran
  // y se dibujan igual —y
  // `body` lleva `overflow-x: clip`, así que el dato se corta sin una barra que lo delate.
  assert.match(codigoTabla(), /max-\[1459px\]:/, 'el corte de columnas quedó calculado sobre el panel viejo')
})

test('la cabecera y los recortes son los del patrón v2, no la franja del canon', () => {
  const p = codigoPagina()
  assert.match(p, /<CabeceraSeccion\s/, 'Compras volvió a la franja del canon de agosto')
  assert.match(p, /espacioPanel=\{!!filaAbierta\}/,
    'la cabecera dejó de reservar la columna del panel: los controles gobiernan una tabla corrida')
  assert.match(p, /accion=\{<CargarComprobante \/>\}/, 'se perdió la única acción amarilla de la pantalla')
  // Los chips: `FiltrosSuaves` del patrón, el mismo control que Personal y Proveedores. La pastilla
  // con borde de `ds/Filtros` es la caja que la tabla acaba de perder, dibujada arriba de ella.
  const chips = sinComentarios(fuente('FiltrosSheet.tsx'))
  assert.match(chips, /<FiltrosSuaves/, 'los recortes volvieron a la pastilla del canon')
  assert.equal(/from '@\/shared\/components\/ds'/.test(chips), false, 'sigue colgando del ds de agosto')
  // Y viven SOBRE la lista que recortan, no en la cabecera: con el panel abierto, un chip arriba
  // del split se lee como si gobernara también el panel.
  const filtros = p.indexOf('<FiltrosSheet')
  const tabla = p.indexOf('<TablaComprasSheet')
  const panel = p.indexOf('<PanelCompraSheet')
  assert.ok(filtros > 0 && tabla > filtros && panel > tabla,
    'los recortes salieron de la columna de la lista')
})

test('la nota al pie es la del canvas: abajo, sin caja, y no repite un número que no cuenta', () => {
  // SÓLO LA PESTAÑA COMPRAS. El archivo tiene DOS pantallas —la pestaña del Sheet y `ControlArca`,
  // que es el libro de ARCA y no se tocó—; medir el archivo entero da rojo por la caja de ayuda de
  // la otra, que ahí sí corresponde. El recorte es lo que hace que este control pueda dar rojo por
  // lo que mira y no por su vecina.
  const entero = codigoPagina()
  const p = entero.slice(0, entero.indexOf('async function ControlArca'))
  assert.ok(p.length > 1000 && p.length < entero.length, 'no se pudo aislar la pestaña Compras')
  assert.match(p, /<NotaBloque testid="nota-compras">/, 'la nota volvió a ser una caja `Ayuda`')
  // ARRIBA DE LA LISTA EMPUJABA LA TABLA fuera de la primera pantalla, y se leía antes de haber
  // visto lo que explica. El canvas la pone al pie (`v4A:247`).
  assert.ok(p.indexOf('<NotaBloque') > p.indexOf('<PieCompras'), 'la nota volvió arriba de la lista')
  assert.equal(/<Ayuda\b/.test(p), false, 'quedó la caja de ayuda del canon sobre la lista')
  // El «632 comprobantes de ARCA» estaba escrito a mano acá: es el número de OTRA pantalla, que
  // ésta no lee y por lo tanto no puede afirmar. Se cita la pantalla, no su cifra congelada.
  assert.equal(/632/.test(p), false, 'volvió el conteo de ARCA escrito a mano en la pantalla de Compras')
})
