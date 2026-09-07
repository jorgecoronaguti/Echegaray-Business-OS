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

// ── LAS OCHO COLUMNAS ───────────────────────────────────────────────────────────────────────────

test('la grilla es la del canvas, carácter por carácter', () => {
  // `Administración v4 · Pantallas.dc.html:222`. Literal y no armada en runtime: Tailwind escanea el
  // TEXTO del archivo, así que una clase concatenada no se compila nunca y la fila se dibuja sin
  // grilla — un defecto que no se ve en ningún test de unidad, sólo mirando la pantalla.
  const t = codigoTabla()
  assert.ok(
    t.includes('grid-cols-[minmax(150px,1.2fr)_minmax(120px,1fr)_112px_minmax(110px,1fr)_92px_104px_112px_26px]'),
    'la grilla ancha dejó de ser la del canvas',
  )
  assert.match(t, /const GAP = 'gap-\[14px\]'/, 'el `gap:14` del canvas se perdió')
})

test('los ocho rótulos, en el orden del canvas y pedidos al patrón', () => {
  // `v4A:223`. El orden ES la decisión: COMPROBANTE y FORMA DE PAGO subieron a columna propia y la
  // FECHA bajó al panel. Escribir los rótulos a mano en vez de pedirle `RotuloCol` al patrón es la
  // fuga que `ritmo-vertical.test.ts` ya cazó una vez en `TablaUsuarios`.
  const t = codigoTabla()
  const rotulos = [...t.matchAll(/<RotuloCol[^>]*>([^<]+)<\/RotuloCol>/g)].map((m) => m[1])
  assert.deepEqual(rotulos, [
    'Proveedor', 'Concepto', 'Comprobante', 'Cliente / asignación', 'Estado', 'Forma de pago', 'Importe',
  ])
  assert.match(t, /<RotuloCol derecha>Importe<\/RotuloCol>/, 'IMPORTE dejó de alinearse a la derecha')
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
})
