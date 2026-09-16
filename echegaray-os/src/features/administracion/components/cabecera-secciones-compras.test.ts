import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { SECCIONES_COMPRAS } from '../services/seccionesDeCompras.ts'

// ═══ LA CABECERA DE SECCIONES DE COMPRAS — el test de fuente (dueño, 16/09/2026) ═══
//
// «Quiero que pongas todo el módulo proveedores dentro de "compras" como sección», y «con la skill
// de UX, la plataforma no puede quedar con parches».
//
// Mismo método que `canonico-compras-v4.test.ts`: lo que se protege son DECISIONES ESCRITAS —una
// sola lista de secciones, ningún hex suelto, DOS niveles de navegación— y no un comportamiento de
// render. Montar React para leer un estilo que ya está literal en el archivo mete un runtime entero
// entre la afirmación y el hecho.
//
// LO QUE ESTE TEST NO PRUEBA: que la fila se vea bien en un navegador ni que a 390px no haya scroll
// lateral. Eso se mide en `tests/qa-cortes-390.spec.ts` con un navegador real y sigue siendo la
// evidencia que falta hasta que alguien la mire.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (a: string) => readFileSync(join(DIR, a), 'utf8')

/** El archivo SIN sus comentarios: los comentarios de este repo nombran justo lo que prohíben. */
const sinComentarios = (texto: string) => texto
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('//'))
  .join('\n')

const PAGINAS = {
  compras: '../../../app/(main)/administracion/compras/page.tsx',
  proveedores: '../../../app/(main)/administracion/proveedores/page.tsx',
  ficha: '../../../app/(main)/administracion/proveedores/[proveedor]/page.tsx',
} as const
const codigo = (a: keyof typeof PAGINAS) => sinComentarios(fuente(PAGINAS[a]))
const SERVICIO = '../services/seccionesDeCompras.ts'
const CABECERA = '../../../shared/components/v2/CabeceraSeccion.tsx'

// ── UN SOLO PATRÓN, UNA SOLA LISTA ──────────────────────────────────────────────────────────────

test('las dos pantallas dibujan la MISMA fila, desde la misma lista', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Es el que ya se pagó con la barra de áreas: la lista estaba escrita dos veces —`homeAdministracion`
  // y `NavAdministracionTabs`— y había un test que leía el código fuente del otro con una expresión
  // regular para detectar que no se desincronizaran. Ese test existía porque ya había pasado.
  //
  // Con Proveedores adentro de Compras el riesgo vuelve: son DOS archivos de página dibujando la
  // misma fila de cuatro secciones. Si una escribe sus rótulos a mano, un día dirá «Deuda» donde la
  // otra dice «A quién le debo» y la sección encendida dejará de coincidir con la de al lado.
  for (const cual of ['compras', 'proveedores'] as const) {
    const src = codigo(cual)
    assert.match(src, /<CabeceraSeccion\s/, `${cual} dejó de abrir por la cabecera de sección`)
    assert.match(src, /vistas=\{seccionesDeCompras\(/,
      `${cual} arma su fila de secciones a mano en vez de usar la lista compartida`)
  }
})

test('ninguna pantalla escribe los rótulos de las secciones a mano', () => {
  // El contrato es el rótulo Y el orden. Una pantalla puede estrechar el `href` de SU sección para
  // no tirar los filtros puestos; lo que no puede es renombrar ni reordenar.
  for (const cual of ['compras', 'proveedores'] as const) {
    const src = codigo(cual)
    for (const s of SECCIONES_COMPRAS) {
      assert.equal(new RegExp(`titulo: '${s.titulo}'`).test(src), false,
        `${cual} volvió a escribir «${s.titulo}» como literal: la lista está dos veces`)
    }
  }
})

test('la lista compartida no importa React ni Supabase: se prueba con `node --test`', () => {
  const src = fuente(SERVICIO)
  for (const prohibido of ['react', 'next/', '@supabase', '@/lib/supabase']) {
    assert.equal(src.includes(`from '${prohibido}`), false,
      `la lista de secciones arrastró ${prohibido}: deja de ser pura`)
  }
})

// ── DOS NIVELES DE NAVEGACIÓN, NO TRES ──────────────────────────────────────────────────────────

test('LA FILA DE SECCIONES ES PLANA: ninguna sección abre otra fila debajo', () => {
  // La regla de diseño son DOS niveles simultáneos: el área y la solapa de la entidad. En esta app
  // el nivel 3 ya es texto con subrayado y no una tercera barra (`CabeceraSeccion`), así que es el
  // último lugar que hay. Si «A quién le debo» o «Nombres sin resolver» vuelven a colgarse de una
  // sección «Proveedores», aparece un cuarto nivel (área → Compras → Proveedores → deuda).
  //
  // Se comprueba sobre la lista, que es donde se decidiría: las cuatro son hermanas y ninguna
  // declara hijas.
  assert.equal(SECCIONES_COMPRAS.length, 4)
  for (const s of SECCIONES_COMPRAS) {
    assert.deepEqual(Object.keys(s).sort(), ['clave', 'href', 'titulo'],
      `${s.titulo} ganó un campo: si es para anidar secciones, es el cuarto nivel`)
  }
})

test('la ficha del proveedor NO dibuja la fila de secciones: ahí el segundo nivel es la MIGA', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Poner la fila de secciones también en la ficha «para que se vea igual». La ficha ya tiene DOS
  // niveles propios —la miga y las solapas de la entidad (Compras · Nombres · Obras · Paquetes ·
  // Documentos)—; agregarle la fila de secciones haría TRES, y quien mira tendría que decodificar
  // dos filas de solapas antes de leer el nombre del proveedor.
  const src = codigo('ficha')
  assert.equal(src.includes('<CabeceraSeccion'), false,
    'la ficha ganó la fila de secciones: son tres niveles simultáneos')
  assert.equal(src.includes('seccionesDeCompras'), false)
  assert.match(src, /<SolapasDeFicha/, 'la ficha perdió las solapas de la entidad')
})

test('la ficha dice de dónde cuelga —«Compras › Proveedores»— y vuelve a la lista', () => {
  // Es lo único que dice el contexto en una pantalla a la que se llega por enlace directo desde el
  // chat, desde una fila de Compras o desde el CRM. Sin esto, la barra marca «Compras» y la ficha no
  // explica por qué.
  const src = codigo('ficha')
  assert.match(src, /ambito="Compras"/, 'la ficha dejó de decir que Proveedores es de Compras')
  assert.match(src, /padre="Proveedores"/)
  assert.match(src, /volverA="\/administracion\/proveedores"/, 'la ficha perdió la vuelta a la lista')

  // Y LA MIGA SIGUE SIENDO UN SOLO ENLACE. El ámbito es contexto, no un atajo: dos anclas de 12,5px
  // pegadas se aciertan a los tirones en un teléfono, y duplican el destino para un lector de
  // pantalla. Si alguien lo convierte en enlace, `Migas` tendrá un segundo `<Link>`.
  const migas = sinComentarios(fuente('../../../shared/components/v2/segundoNivel.tsx'))
  const cuerpo = migas.slice(migas.indexOf('export function Migas'), migas.indexOf('export function AccionPrimaria'))
  assert.equal((cuerpo.match(/<Link/g) ?? []).length, 1, 'la miga volvió a ser dos enlaces')
})

// ── LA MARCA: NINGÚN HEX SUELTO ─────────────────────────────────────────────────────────────────

test('ni la lista ni la cabecera escriben un color a mano', () => {
  // Todo color sale de un token (`V` en `patron.tsx`, `C` en el canon). Un hex suelto es cómo el
  // acento del OS fue un navy que nadie había medido durante meses.
  //
  // `#EEBE00` es la ÚNICA excepción viva y está declarada: es el hover del amarillo de marca y viaja
  // como clase de Tailwind (`hover:bg-[…]`), que no se puede escribir con una variable CSS arbitraria.
  for (const a of [SERVICIO, CABECERA]) {
    const src = sinComentarios(fuente(a))
    const hex = (src.match(/#[0-9A-Fa-f]{6}\b/g) ?? []).filter((h) => h !== '#EEBE00')
    assert.deepEqual(hex, [], `${a} escribió un color a mano: ${hex.join(', ')}`)
  }
})

test('el ámbito de la miga sale de los tokens, no de un gris elegido', () => {
  const src = sinComentarios(fuente('../../../shared/components/v2/segundoNivel.tsx'))
  const cuerpo = src.slice(src.indexOf('export function Migas'), src.indexOf('export function AccionPrimaria'))
  // El ámbito arranca en `{ambito &&` y termina donde empieza el nombre del padre: ése es el tramo
  // que se agregó el 16/09/2026 y el único que este test gobierna.
  const bloque = cuerpo.slice(cuerpo.indexOf('{ambito &&'), cuerpo.indexOf('{padre}'))
  assert.ok(bloque.length > 0, 'el ámbito de la miga desapareció')
  assert.match(bloque, /color: V\.tenue/, 'el ámbito perdió su token')
  assert.match(bloque, /color: V\.cuentaApagada/, 'la barra que separa el ámbito perdió su token')
  // NINGÚN HEX EN EL TRAMO NUEVO. El `hover:text-[#1F1F1E]` que sí hay en `Migas` es anterior y va
  // como clase de Tailwind, que no admite una variable CSS arbitraria: no se toca acá.
  assert.deepEqual(bloque.match(/#[0-9A-Fa-f]{6}\b/g) ?? [], [])
})

// ── 390px: LA FILA ENVUELVE, NO EMPUJA LA PÁGINA ────────────────────────────────────────────────

test('con cuatro secciones la fila ENVUELVE en angosto: no ensancha el documento', () => {
  // ═══ POR QUÉ ESTO IMPORTA AHORA ═══
  //
  // La fila pasó de UNA sección en Compras y tres en Proveedores a CUATRO en las dos. «Compras ·
  // Proveedores · A quién le debo · Nombres sin resolver» no entra en 390px, y el único modo de
  // falla que importa es que empuje la página de costado: `body { overflow-x: clip }` no protege a
  // una caja que sí mide más que la pantalla.
  //
  // `CabeceraSeccion` ya lo resuelve con `flexWrap: 'wrap'` + `rowGap`, igual que Personal. Lo que
  // este test impide es que alguien se lo saque «para que quede en una línea» — que es exactamente
  // lo que haría la fila desbordar.
  const src = fuente(CABECERA)
  const fila = src.slice(src.indexOf('data-testid={testid}') - 400, src.indexOf('vistas.map'))
  assert.match(fila, /flexWrap: 'wrap'/, 'la fila de secciones dejó de envolver: a 390px desborda')
  assert.match(fila, /rowGap:/, 'la fila envuelve sin aire entre renglones')
  assert.match(fila, /minWidth: 0/, 'sin `minWidth: 0` la fila no cede y empuja la página')
  // Y NO SE ARREGLA CON SCROLL HORIZONTAL: eso es lo que hace la barra del área, que tiene un velo
  // que avisa que sigue. Una fila de texto que scrollea sin velo esconde secciones sin decirlo.
  assert.equal(/overflowX: 'auto'/.test(fila), false,
    'la fila de secciones se volvió un carrusel: las que quedan afuera no existen para quien mira')
})
