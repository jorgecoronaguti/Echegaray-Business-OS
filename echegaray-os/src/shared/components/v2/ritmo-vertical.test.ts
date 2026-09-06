import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PATRON = readFileSync(new URL('./patron.tsx', import.meta.url), 'utf8')

/**
 * SE LEE EL FUENTE PORQUE `patron.tsx` NO SE PUEDE IMPORTAR: `node --test` no resuelve `.tsx` sin
 * loader, y el runner del repo corre sin transpilar (`orq:test:corrida`). Mismo método que
 * `canon-medido.test.ts` usa para lo que no es importable. El costo es real y se declara: esto
 * afirma lo que el archivo DICE, no lo que el navegador pinta — la fidelidad final se sigue
 * probando contra el CSS emitido y contra la pantalla.
 */
function alto(clave: string): number {
  const bloque = PATRON.slice(PATRON.indexOf('export const ALTO_V2 = {'))
  const m = new RegExp(`\\n  ${clave}: (\\d+),`).exec(bloque.slice(0, bloque.indexOf('} as const')))
  assert.ok(m, `ALTO_V2.${clave} no está declarado`)
  return Number(m![1])
}

/** Un valor de `V`, la paleta del patrón. */
function color(clave: string): string {
  const m = new RegExp(`\\n  ${clave}: '(#[0-9A-Fa-f]{6})',`).exec(PATRON)
  assert.ok(m, `V.${clave} no está declarado`)
  return m![1]
}


// EL RITMO VERTICAL DEL OS SE AFIRMA ACÁ, PORQUE `patron.tsx` NO TENÍA UN SOLO TEST.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// `patron.tsx` gobierna el alto de fila, la cabecera y el divisor de NUEVE pantallas —Clientes,
// Personal, Proveedores, Documentos, Usuarios, la cola de nombres, las correcciones, las caras del
// cliente y las del proveedor— y hasta el 06/09/2026 ningún test tocaba el archivo. Por eso pasó
// las dos cosas que este test impide:
//
//   1. LA DERIVA. El módulo corría el ritmo del zip de agosto (fila 40, cabecera 26, rótulo 10px en
//      peso 400, divisor `#EDECE8`) mientras el handoff vigente dibuja 44/30/11-600/`#F1F0EC`. La
//      divergencia era invisible porque nada la afirmaba: sólo se veía mirando la pantalla al lado
//      del canvas, y eso lo hacía el dueño.
//   2. LA FUGA. Tres tablas nacidas después —`TablaUsuarios`, `BandejaCorrecciones`,
//      `TablaCuadrillas`— escribieron `height: 44` A MANO en vez de pedirle el número al patrón, y
//      dos más escribieron `42`. Cinco pantallas con tres ritmos distintos y ninguna forma de
//      enterarse. El segundo bloque de este archivo es el que cierra esa puerta.
//
// ═══ DE DÓNDE SALE CADA NÚMERO ═══
//
// De `/home/jorge/crmadmin/design_handoff_crm_v4/pantallas/`, leyendo el `style=""` inline, donde
// el atributo ES el valor computado. El canvas NO se lee en tiempo de test: vive fuera del repo y
// un test que dependa de un path del disco del dueño se pone rojo en cualquier otra máquina. Lo que
// se congela es el número, con su archivo y su línea al lado, como en `canon-medido.test.ts`.

test('el alto de fila sale del canvas de SU pantalla, no de un promedio entre canvas', () => {
  // `Administración v4 · Pantallas.dc.html:84` — 17 filas, todas 44. Personal, Proveedores, Compras.
  assert.equal(alto('fila'), 44)
  // `CRM v4 · Pantallas.dc.html:92` — la fila de cliente es maestra y va más alta que sus hijas.
  assert.equal(alto('cliente'), 48)
  // `CRM v4 · Pantallas.dc.html:97` — la obra colgada del cliente.
  assert.equal(alto('hija'), 38)
  // `CRM v4 · Pantallas.dc.html:192` — las caras del eje Cliente, 14 filas.
  assert.equal(alto('cara'), 46)
  // La madre tiene que leerse más alta que la hija o el bloque deja de tener jerarquía.
  assert.ok(alto('cliente') > alto('hija'))
})

test('el 52–54 del README NO es la fila de una lista: es la tabla de certificados de D1', () => {
  // El README dice «fila de tabla 52–54px de alto mínimo» y NINGUNO de los seis canvas lo dibuja.
  // No se promedia contra los 44/46/48: el 54 es `Lo que faltaba…:513` (`min-height:54px`, fila de
  // DOS líneas de la tabla de certificados) y el 52 los paneles de esa misma entrega (`:343`).
  // Este test fija la resolución para que nadie la vuelva a abrir «corrigiendo hacia el README».
  for (const px of [alto('fila'), alto('cliente'), alto('cara')]) {
    assert.ok(px < 52, `${px}px: ninguna fila de LISTA llega al 52–54 del README`)
  }
})

test('la cabecera de columnas es la única medida universal de los seis canvas', () => {
  // `Administración v4:81` y `CRM v4:88` la escriben idéntica: 30px, 11px, peso 600, .06em, #D7D5CF.
  assert.equal(alto('encabezado'), 30)
  assert.match(PATRON, /height: ALTO_V2\.encabezado, borderBottom: `1px solid \$\{V\.lineaFuerte\}`/)
  assert.equal(color('lineaFuerte'), '#D7D5CF')

  const rotulo = PATRON.slice(PATRON.indexOf('export function RotuloCol'))
  assert.match(rotulo, /fontSize: '11px', fontWeight: 600, letterSpacing: '\.06em'/)
  // El peso es la mitad del cambio: en 400 el rótulo se lee como un dato más y deja de separar.
  assert.doesNotMatch(rotulo.slice(0, 600), /fontSize: '10px'/)
})

test('el divisor de fila volvió al token que ya existía; no se inventó un color', () => {
  // `v4A:84` y `v4B:97`. Es `--os-hairline-soft` de `globals.css`, y el README prohíbe colores nuevos.
  assert.equal(color('lineaFila'), '#F1F0EC')
  const css = readFileSync(new URL('../../../app/globals.css', import.meta.url), 'utf8')
  assert.match(css, /--os-hairline-soft:\s*#f1f0ec/i)
})

test('cambiar el alto NO puede desalinear la fila de su cabecera', () => {
  // El canvas corre en `content-box` —no declara `box-sizing`—, así que su `border-bottom:1px` se
  // suma POR AFUERA del alto. El repo lo replica en los dos lados: `CAJA_CONTENIDO` (`box-content`)
  // en la fila y `boxSizing:'content-box'` acá. Mientras las dos sumen el borde igual, mover los
  // números no puede correr una respecto de la otra — que es la garantía que pide el zip para que
  // `box-shadow: inset 2px 0 0 #FDC900` funcione sin padding compensatorio.
  const encabezado = PATRON.slice(PATRON.indexOf('export const ENCABEZADO'))
  assert.match(encabezado, /boxSizing: 'content-box'/)
  assert.match(encabezado, /borderBottom: `1px solid \$\{V\.lineaFuerte\}`/)
  assert.match(PATRON, /export const CAJA_CONTENIDO = 'box-content'/)
  // La selección viaja por `inset`, que no ocupa espacio. Un borde real sí correría la fila.
  assert.match(PATRON, /export const FILO_ELEGIDA = `inset 2px 0 0 \$\{V\.marca\}`/)
})

// ═══ NINGUNA TABLA DEL PATRÓN PUEDE VOLVER A ESCRIBIR SU PROPIO ALTO ═══
//
// La regla es sobre el fuente por la misma razón que `grilla-v2-en-telefono.test.ts`: medir el alto
// de verdad exige navegador, servidor y base, y tarda minutos; esto cuesta milisegundos y caza el
// defecto donde se escribe. NO prueba que la pantalla se vea fiel —eso sólo lo prueba un navegador—:
// prueba que un archivo no puede fijar un ritmo propio a espaldas de la constante.

/** Un alto de fila es un `height`/`minHeight` de dos dígitos en una fila de tabla, no un ícono. */
const ALTO_A_MANO = /(?:min-?[Hh]eight|height):\s*(3[4-9]|[45][0-9]|6[0-8])\b/g

/**
 * LA EXCEPCIÓN SE MARCA EN EL CÓDIGO, NO EN UNA LISTA NEGRA ACÁ.
 *
 * Una lista de nombres de archivo envejece en silencio: el día que `PanelCliente.tsx` deje de ser
 * un panel y pase a ser una tabla, la lista lo sigue perdonando y nadie se entera. La marca viaja
 * pegada a la línea que la necesita, así que quien la escribe tiene que justificarla ahí.
 *
 * La fila de PANEL es una familia distinta y el contrato lo dice: el canvas dibuja los paneles con
 * `padding:8px 0` y SIN alto —crecen con el contenido (`Administración v4:266`)—, así que no hay
 * un número del zip que ponerles. Mientras no lo haya, cada panel declara el suyo con la marca.
 */
const MARCA_DE_PANEL = 'ritmo de panel'

function tsxQueUsanElPatron(dir: string, hallados: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') tsxQueUsanElPatron(ruta, hallados); continue }
    if (!e.name.endsWith('.tsx') || e.name === 'patron.tsx') continue
    if (readFileSync(ruta, 'utf8').includes("v2/patron")) hallados.push(ruta)
  }
  return hallados
}

test('ningún consumidor de v2/patron fija su alto de fila a mano', () => {
  const archivos = tsxQueUsanElPatron(join(process.cwd(), 'src'))
  // Si esto queda en cero el test se volvió una constante que no puede decir que no.
  assert.ok(archivos.length >= 20, `sólo ${archivos.length} consumidores: el barrido se rompió`)

  const fugas: string[] = []
  let marcadas = 0
  for (const ruta of archivos) {
    const src = readFileSync(ruta, 'utf8')
    const lineas = src.split('\n')
    for (const m of src.matchAll(ALTO_A_MANO)) {
      const nro = src.slice(0, m.index).split('\n').length
      // La marca vale en la línea o en las seis de arriba: el comentario que la explica va antes,
      // y en el repo esos comentarios ocupan varios renglones.
      const cerca = lineas.slice(Math.max(0, nro - 7), nro).join('\n').toLowerCase()
      if (cerca.includes(MARCA_DE_PANEL)) { marcadas += 1; continue }
      fugas.push(`${ruta.replace(process.cwd() + '/', '')}:${nro} → ${m[0]}`)
    }
  }
  assert.deepEqual(fugas, [], `altos de fila fuera de ALTO_V2:\n${fugas.join('\n')}`)
  // Si nadie usa la marca, la excepción dejó de existir y este test se volvió más flojo de lo que
  // dice ser: hay que revisarla, no borrarla en silencio.
  assert.ok(marcadas >= 3, `sólo ${marcadas} altos marcados como «${MARCA_DE_PANEL}»`)
})

test('ninguna cabecera de tabla copia el rótulo en vez de pedirlo', () => {
  // La fuga que este test caza ya había pasado: `TablaUsuarios` dibujaba la columna «$» con el
  // estilo del rótulo escrito a mano, y se quedó en 10px/400 mientras el patrón pasaba a 11px/600
  // — dos pesos distintos en la misma cabecera, en la misma pantalla.
  //
  // La condición es «10px CON versalitas dentro de un ENCABEZADO», no «versalitas»: los rótulos de
  // PANEL sí van en 10px y son otra pieza (`RotuloPanel`, y los cuatro paneles que lo escriben
  // inline). Lo que no puede existir es un rótulo de COLUMNA fuera del patrón.
  const fugas: string[] = []
  for (const ruta of tsxQueUsanElPatron(join(process.cwd(), 'src'))) {
    const src = readFileSync(ruta, 'utf8')
    for (const bloque of src.split('ENCABEZADO').slice(1)) {
      const cabecera = bloque.slice(0, bloque.indexOf('</div>'))
      if (/fontSize: '10px'[^}]*letterSpacing: '\.06em'/.test(cabecera)) {
        fugas.push(ruta.replace(process.cwd() + '/', ''))
      }
    }
  }
  assert.deepEqual(fugas, [], `rótulos de columna escritos a mano:\n${fugas.join('\n')}`)
})
