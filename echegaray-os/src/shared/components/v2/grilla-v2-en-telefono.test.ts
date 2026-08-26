import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { anchoMinimoDeGrilla, PISO_NOMBRE, pistasDe } from '../canon/ancho-minimo.ts'

// NINGUNA GRILLA DEL PATRÓN v2 PUEDE ESTRANGULAR LA COLUMNA QUE IDENTIFICA LA FILA.
//
// ═══ QUÉ DEFECTO ATRAPA (medido con navegador autenticado, 390x844, 26/08/2026) ═══
//
// Las tablas del v2 no llevan la caja de scroll del canon: resuelven el teléfono SOLTANDO columnas
// secundarias por media query (`25v2:154` — «<1250px suelta columnas secundarias, nunca la
// identidad»). Cuatro tablas ya lo hacían; tres grillas nacidas después NO, y a 390px:
//
//   `/administracion`  la grilla de la cartera declaraba 386px de columnas fijas más 42 de `gap`
//                      dentro de 350: la única fraccional —el NOMBRE del cliente y el de la obra—
//                      caía a CERO. Las filas se dibujaban con la plata a la derecha y sin decir de
//                      quién era. Y los 78px que sobraban ensanchaban el documento a 448px: el
//                      desborde lateral de la pantalla.
//   `/administracion`  el libro de trabajo dejaba «QUÉ FAL/TA» encima de «QUÉ BLOQUEA» y el verbo
//                      cortado contra el borde.
//   `/clientes`, `/administracion/personas`, `/proveedores`, `/documentos`, `/administracion/compras`
//                      el bloque «Lo que pide trabajo» decía «5 · c. · Sin … · Completar».
//
// ═══ POR QUÉ UNA REGLA SOBRE EL FUENTE ═══
//
// Mismo precedente y misma forma que `canon/grilla-en-telefono.test.ts`: medir el corte de verdad
// exige navegador, servidor, base y cinco viewports, y tarda minutos. Esto cuesta milisegundos y
// caza el defecto donde se escribe. NO prueba que a 390px se vea bien —eso sólo lo prueba un
// navegador—: prueba que estas grillas no pueden volver a nacer sin su variante angosta, ni
// declarar una variante angosta que igual no entra en un teléfono.
//
// El ancho lo calcula `anchoMinimoDeGrilla`, la MISMA función que usa el canon, así que el piso del
// nombre (160px) es uno solo en todo el repositorio y agregar una columna mueve la cuenta sola.

const RAIZ = new URL('../../../..', import.meta.url).pathname

/** Ancho útil de un teléfono de 390px: las tres pantallas llevan `padding: 0 20px`. */
const UTIL_TELEFONO = 350
/** El `gap:14px` que el patrón v2 fija para toda fila; el padding lateral lo pone la sección. */
const GEOMETRIA = { gap: 14, padding: 0 }

/** Las grillas que dibujan una fila con nombre y no llevan la caja de scroll del canon. */
const GRILLAS = [
  'src/features/administracion/components/CarteraHome.tsx',
  'src/features/administracion/components/LibroDeTrabajo.tsx',
  'src/shared/components/v2/TrabajoDeSeccion.tsx',
]

/** El fuente SIN comentarios: este repo explica en prosa lo que retiró, y una prosa correcta no
 *  puede poner roja una regla. Mismo helper que `canon/grilla-en-telefono.test.ts`. */
const codigo = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('//'))
  .join('\n')

/** `grid-cols-[44px_minmax(0,1fr)_120px]` -> `44px minmax(0,1fr) 120px`. */
const aPlantilla = (clase: string) => clase.replace(/_/g, ' ')

/** Las plantillas declaradas en un fuente, por variante (`''` = la ancha, sin prefijo). */
function plantillas(src: string): Map<string, string> {
  const salida = new Map<string, string>()
  for (const [, prefijo, cuerpo] of src.matchAll(/(max-\[\d+px\]:)?grid-cols-\[([^\]]+)\]/g)) {
    salida.set(prefijo ?? '', aPlantilla(cuerpo))
  }
  return salida
}

test('las tres grillas del v2 declaran su variante de teléfono y esa variante ENTRA en 390px', () => {
  for (const ruta of GRILLAS) {
    const declaradas = plantillas(codigo(ruta))
    const angosta = declaradas.get('max-[767px]:')
    assert.ok(
      angosta,
      `${ruta} no declara \`max-[767px]:grid-cols-[...]\`: sin variante de teléfono sus columnas `
      + 'fijas no ceden y la fraccional del nombre cae a cero — la fila deja de decir de quién es',
    )
    const ancho = anchoMinimoDeGrilla(angosta, GEOMETRIA)
    assert.ok(
      ancho <= UTIL_TELEFONO,
      `${ruta} declara para el teléfono «${angosta}», que necesita ${ancho}px y el ancho útil es `
      + `${UTIL_TELEFONO}: el nombre vuelve a quedar por debajo de su piso de ${PISO_NOMBRE}px`,
    )
  }
})

test('la variante ancha de esas grillas NO entra en un teléfono: el defecto existe de verdad', () => {
  // Sin esto la regla se pondría verde por vacía el día que alguien cambie las columnas anchas por
  // unas que ya entren: estaría midiendo una grilla que no es la que se cree que mide.
  for (const ruta of GRILLAS) {
    const ancha = plantillas(codigo(ruta)).get('')
    assert.ok(ancha, `${ruta} dejó de declarar su grilla de escritorio`)
    const ancho = anchoMinimoDeGrilla(ancha, GEOMETRIA)
    assert.ok(
      ancho > UTIL_TELEFONO,
      `${ruta} declara «${ancha}» con un mínimo de ${ancho}px: si entrara en un teléfono no habría `
      + 'defecto que arreglar — revisá que la cadena sea la que se cree',
    )
  }
})

test('toda variante con menos columnas retira las celdas sobrantes por clase', () => {
  // UNA CELDA DE MÁS CORRE LA FILA ENTERA y es el defecto más caro de soltar una columna: la celda
  // sobrante cae en una segunda fila implícita y la tabla se dibuja al doble de alto, desalineada.
  // Una variante que sólo ANGOSTA una columna (`330px` -> `150px`) no retira ninguna celda y no
  // entra en esta cuenta; la que declara MENOS pistas, sí.
  for (const ruta of GRILLAS) {
    const src = codigo(ruta)
    const declaradas = plantillas(src)
    const pistas = (v: string) => pistasDe(declaradas.get(v) ?? '').length
    const anchas = pistas('')
    assert.ok(anchas >= 3, `${ruta}: la grilla ancha quedó con ${anchas} columnas`)

    for (const corte of ['max-[1249px]:', 'max-[767px]:']) {
      const nPistas = pistas(corte)
      if (nPistas === 0 || nPistas === anchas) continue
      const constante = new RegExp(`const (\\w+) = '${corte.replace(/[[\]]/g, '\\$&')}hidden'`).exec(src)
      assert.ok(
        constante,
        `${ruta} declara una grilla ${corte} con ${nPistas} columnas contra ${anchas}, pero no `
        + `declara la constante \`${corte}hidden\` con la que se retiran las celdas sobrantes`,
      )
      const usos = (src.match(new RegExp(`\\b${constante[1]}\\b`, 'g')) ?? []).length - 1
      assert.ok(
        usos >= anchas - nPistas,
        `${ruta}: ${corte} suelta ${anchas - nPistas} columna(s) y ${constante[1]} se usa en ${usos} `
        + 'celda(s). La celda que sobra cae en una fila implícita y desalinea la tabla entera',
      )
    }
  }
})

test('ningún adorno de la celda del nombre le gana al nombre en el teléfono', () => {
  // La media query de columnas hace su trabajo y el nombre igual se estrangula UNA CAPA MÁS ABAJO:
  // dentro de la celda, la barra de avance declara un ancho fijo con `flex-shrink: 0` y el nombre
  // —que sí es elástico— absorbe todo el faltante. Medido a 390x844: «Galpón 9» se dibujaba «Galp…»
  // en `/clientes` con 36px de los 164 útiles. Un adorno no puede ganarle a lo que identifica la
  // fila, así que se suelta con el resto.
  for (const ruta of ['src/features/clientes/components/TablaClientes.tsx', ...GRILLAS]) {
    const src = codigo(ruta)
    if (!/porcentajeCanon|avance/.test(src)) continue
    const linea = src.split('\n').find((l) => /width: 80|width: 96/.test(l) && /flexShrink: 0/.test(l))
    if (!linea) continue
    assert.match(
      linea, /className=\{`?flex (?:\$\{)?(?:ADORNO_ANCHO|SUELTA_TABLET)/,
      `${ruta}: la barra de avance no se suelta en angosto y se queda con el ancho del nombre`,
    )
    assert.equal(
      /style=\{\{[^}]*display:/.test(linea), false,
      `${ruta}: la barra de avance fija su display inline y le gana a la media query que la oculta`,
    )
  }
})

test('lo que se suelta por media query no fija su `display` inline', () => {
  // EL DEFECTO, YA PAGADO EN `canonico-proveedores-v2.test.ts`: un estilo inline le gana a cualquier
  // media query, así que `style={{ display: 'flex' }}` anula `max-[767px]:hidden` y la celda sigue
  // ocupando su ancho. En la cartera eso era la barra de avance: 96px inelásticos que se comían el
  // nombre de la obra aun con la media query escrita.
  for (const ruta of GRILLAS) {
    const src = codigo(ruta)
    for (const linea of src.split('\n')) {
      if (!/\bSUELTA_[A-Z]+\b/.test(linea)) continue
      if (/^\s*(\/\*|\*|const SUELTA_)/.test(linea)) continue
      assert.equal(
        /style=\{\{[^}]*display:/.test(linea), false,
        `${ruta}: una celda que se suelta en angosto fija su display inline y gana a la media query`
        + ` — ${linea.trim().slice(0, 100)}`,
      )
    }
  }
})

test('el header de nivel 1 recorta su barra en vez de montarla sobre el avatar', () => {
  // MEDIDO A 390x844: el `<nav>` llevaba `min-w-0` con `overflow: visible` y sus solapas se salían
  // de la caja (292px de contenido en 237 de ancho) quedando DEBAJO de la lupa y del avatar
  // —«Presupuestos» tapado por el icono de búsqueda—, y el bloque de la derecha hacía lo mismo
  // (95px en 77). Los dos lados se pisaban porque los dos cedían ancho y ninguno recortaba.
  const src = codigo('src/shared/components/AppHeader.tsx')

  const nav = /<nav className="([^"]+)"[^>]*data-testid="nav-areas"/.exec(src)
  assert.ok(nav, 'el header dejó de tener su barra de áreas identificable')
  assert.match(
    nav[1], /\bbarra-corrible\b/,
    'la barra de áreas del header no recorta: sin `barra-corrible` sus solapas se dibujan encima de '
    + 'la lupa, la campana y el avatar en cuanto el ancho no alcanza',
  )

  const usuario = /className="([^"]+)" data-testid="usuario-actual"/.exec(src)
  assert.ok(usuario, 'el header dejó de tener su bloque de usuario identificable')
  assert.match(
    usuario[1], /\bshrink-0\b/,
    'el bloque de la derecha tiene que ser inelástico: son dos iconos y un avatar de tamaño fijo, '
    + 'encogerlo no los achica, los saca de su caja',
  )
  assert.doesNotMatch(
    usuario[1], /\bmin-w-0\b/,
    '`min-w-0` es lo que le permitía encogerse por debajo de su contenido y montarse sobre la barra',
  )

  // Y la clase tiene que existir de verdad, con lo que la hace funcionar.
  const css = readFileSync(join(RAIZ, 'src/app/globals.css'), 'utf8')
  const regla = /\.barra-corrible\s*\{([^}]*)\}/.exec(css)
  assert.ok(regla, '`barra-corrible` se usa en el header y no está definida en globals.css')
  assert.match(regla[1], /overflow-x:\s*auto/)
})

test('la barra de área avisa cuando sigue, y sólo cuando sigue', () => {
  // «Trabajo · Clientes · Personal · Proveedores · Co…»: siete destinos miden 803px, el teléfono
  // 390, y con `scrollbar-width: none` no quedaba nada que dijera que había más. El aviso tiene que
  // salir de una MEDICIÓN del navegador: un degradado fijo avisaría de contenido inexistente
  // cuando el rol ve menos destinos y todos entran.
  const src = codigo('src/features/administracion/components/BarraAreas.tsx')
  assert.match(src, /scrollWidth/, 'el aviso no se mide contra el contenido real de la barra')
  assert.match(src, /velo-hay-mas/, 'no hay señal de que la barra siga hacia la derecha')
  assert.match(
    src, /aria-current="page"/,
    'la barra no lleva la solapa encendida a la vista: en el teléfono queda fuera de pantalla y la '
    + 'navegación deja de decir dónde estoy parado',
  )
})
