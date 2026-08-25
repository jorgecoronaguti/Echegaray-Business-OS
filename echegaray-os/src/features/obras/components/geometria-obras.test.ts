import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { colorDeChip } from './canon/tokens.ts'

// LA GEOMETRÍA DE OBRAS, MEDIDA SOBRE EL FUENTE — auditoría UX/UI del 24/08/2026.
//
// La auditoría del módulo dejó tres defectos de geometría, dos de ellos medidos con el navegador
// contra la regla del porte: «la página nunca scrollea horizontal; una tabla ancha scrollea por
// dentro».
//
//   · 01 · Cartera a 390px: las dos columnas flexibles de la grilla colapsaban a cero, el nombre de
//     la obra y el cliente desaparecían, y los rótulos OBRA/CLIENTE/ESTADO se apilaban en el mismo
//     punto — se leía «OBRESTAADO». Es la puerta de entrada al módulo desde el teléfono.
//   · 11 · Operación y 12 · Documentos a 1280px: `scrollWidth` 1300 contra `innerWidth` 1280. La
//     causa NO era la quinta sub-solapa que sospechaba la auditoría —esa fila envuelve sola—: era
//     que la banda a sangre se descontaba `lg:-mx-10` (40px) de un marco que mide 20px (`px-5`).
//   · 03 · Tareas: los dos filtros que el mockup no dibuja pesaban lo mismo que los cuatro que sí.
//
// ═══ POR QUÉ UNA REGLA SOBRE EL FUENTE ═══
//
// Mismo precedente que `prefetch-navegacion-obra.test.ts` y `cabecera-de-obra.test.ts`: medir un
// desborde de verdad exige navegador, servidor y base. Esta regla cuesta milisegundos y caza el
// defecto donde se escribe. NO prueba que la página no scrollee —eso lo prueba el navegador—:
// prueba que las condiciones que la hicieron scrollear no pueden volver en silencio.

const RAIZ = new URL('../../../..', import.meta.url).pathname
const DIRS = ['src/features/obras', 'src/app/(main)/obras']

function fuentes(dir: string): string[] {
  const salida: string[] = []
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta))
    else if (nombre.endsWith('.tsx') && !nombre.includes('.test.')) salida.push(ruta)
  }
  return salida
}

/** El fuente SIN comentarios: este repo explica en prosa lo que retiró, y una regla que lee prosa se
 *  pone roja por una explicación correcta. Mismo helper que `prefetch-navegacion-obra.test.ts`. */
const codigo = (fuente: string) => fuente
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('//'))
  .join('\n')

/**
 * LOS PÍXELES QUE UNA GRILLA NO CEDE NUNCA.
 *
 * `minmax(0, 260px)` NO cuenta: ahí los 260px son un techo y la columna puede bajar hasta cero. Lo
 * que aplasta las columnas flexibles es la suma de las anchuras fijas de verdad.
 */
function pxRigidos(plantilla: string): number {
  const sinTechos = plantilla.replace(/minmax\([^)]*\)/g, 'FLEX')
  return (sinTechos.match(/(\d+(?:\.\d+)?)px/g) ?? [])
    .reduce((t, p) => t + Number.parseFloat(p), 0)
}

/** El ancho útil de un teléfono de 390px descontando los 20px de marco de cada lado. */
const TELEFONO_UTIL = 350

/**
 * Lo que ya estaba mal el día que se escribió esta regla y NO se arregló acá, con el motivo. Una
 * excepción es una deuda con nombre y fecha, no un permiso: si aparece una grilla ancha nueva, la
 * regla se pone roja y hay que decidir.
 */
const PENDIENTES: Record<string, string> = {
  'src/features/obras/components/AvanceMasivo.tsx':
    '06 · Avance masivo: 406px rígidos y el nombre de la actividad en `1.6fr`. La auditoría del '
    + '24/08 lo midió FIEL a 1280 y no lo probó a 390; el arreglo es el mismo envoltorio, pero '
    + 'esta pantalla escribe avance real y no se toca sin verla en un navegador.',
}

test('una grilla que no entra en un teléfono scrollea por dentro, no mueve la página', () => {
  const archivos = DIRS.flatMap((d) => fuentes(join(RAIZ, d)))
  assert.ok(archivos.length >= 40, `esperaba las pantallas de obras, encontré ${archivos.length}`)

  let medidas = 0
  let anchas = 0
  for (const ruta of archivos) {
    const fuente = codigo(readFileSync(ruta, 'utf8'))
    const relativa = ruta.slice(RAIZ.length)
    // El valor puede ser un literal, una constante del archivo o un ternario entre dos constantes.
    // Lo que no resuelve acá (una constante importada) no se mide: se cuenta y se declara abajo.
    for (const [, expr] of fuente.matchAll(/gridTemplateColumns:\s*([^,}\n]+)/g)) {
      const plantillas: string[] = []
      const literal = expr.trim().match(/^['"`](.*)['"`]$/)
      if (literal) plantillas.push(literal[1])
      else {
        for (const ident of expr.match(/[A-Za-z_$][\w$]*/g) ?? []) {
          const def = fuente.match(new RegExp(`\\b${ident}\\s*=\\s*['"\`]([^'"\`]*)['"\`]`))
          if (def) plantillas.push(def[1])
        }
      }
      for (const plantilla of plantillas) {
        medidas++
        if (pxRigidos(plantilla) <= TELEFONO_UTIL) continue
        anchas++
        if (PENDIENTES[relativa]) continue
        const tieneScroll = /overflowX:\s*'auto'|overflow-x-auto/.test(fuente)
        // `minWidth: 0` NO alcanza —lo llevan todas las celdas de esta tabla para poder elidir el
        // texto—: el mínimo tiene que ser un ancho en px, que es lo que sostiene la grilla.
        const tieneMinimo = /minWidth:[^,\n]*px|min-w-\[\d/.test(fuente)
        assert.ok(
          tieneScroll && tieneMinimo,
          `${relativa} declara la grilla \`${plantilla}\` —${pxRigidos(plantilla)}px que no ceden, `
          + `más de los ${TELEFONO_UTIL}px útiles de un teléfono— y el archivo no tiene un `
          + 'contenedor con `overflowX: \'auto\'` y `minWidth`. Sin eso las columnas flexibles '
          + 'colapsan a cero: los rótulos se apilan y el nombre de la obra desaparece.',
        )
      }
    }
  }
  // Si alguien mueve las grillas a otro lado, el bucle pasaría sin mirar nada y la regla se
  // volvería verde por vacía.
  assert.ok(medidas >= 8, `esperaba medir las grillas de obras, medí ${medidas}`)
  assert.ok(anchas >= 2, `esperaba al menos las dos grillas anchas conocidas, encontré ${anchas}`)
})

test('la Cartera fija su mínimo por encima de lo que la grilla no cede', () => {
  const fuente = codigo(readFileSync(join(RAIZ, 'src/features/obras/components/CarteraObras.tsx'), 'utf8'))
  const grid = fuente.match(/const GRID = '([^']+)'/)
  assert.ok(grid, 'la Cartera dejó de declarar su grilla en `GRID`')
  const minimo = fuente.match(/const MIN_TABLA = (\d+)/)
  assert.ok(minimo, 'la Cartera dejó de declarar `MIN_TABLA`')

  // Los 720px de columnas fijas + gaps + padding, y el nombre de la obra por encima de 160px: con
  // menos, la columna OBRA vuelve a ser ilegible aunque haya scroll.
  const rigidos = pxRigidos(grid[1]) + 10 * (grid[1].trim().split(/\s+(?![^(]*\))/).length - 1) + 28
  const flexible = Number(minimo[1]) - rigidos
  const obra = flexible * 1.5 / 2.6
  assert.ok(obra >= 160, `con MIN_TABLA=${minimo[1]} la columna OBRA mide ${obra.toFixed(0)}px`)
})

test('la banda a sangre se descuenta el marco REAL de la ficha de obra (20px)', () => {
  const archivos = DIRS.flatMap((d) => fuentes(join(RAIZ, d)))
  let bandas = 0
  for (const ruta of archivos) {
    const fuente = codigo(readFileSync(ruta, 'utf8'))
    // TODO lo que sangra dentro de la ficha —no sólo la banda de sub-vistas— se descuenta el mismo
    // marco. Un `-mx-` distinto es, por definición, contenido fuera del documento.
    for (const [, clases] of fuente.matchAll(/className="([^"]*-mx-[^"]*)"/g)) {
      bandas++
      const margen = clases.match(/-mx-(\d+)/g) ?? []
      const padding = (clases.match(/(?:^|\s|:)px-\d+/g) ?? []).map((p) => p.trim())
      assert.deepEqual(
        [margen, padding], [['-mx-5'], ['px-5']],
        `${ruta.slice(RAIZ.length)} lleva la banda a sangre con \`${clases}\`. El marco de la ficha `
        + 'es `w-full px-5` —20px, en todo ancho— y cualquier otro número deja la banda fuera del '
        + 'documento: con `lg:-mx-10` la página medía 1300px de scroll contra 1280 de viewport.',
      )
    }
  }
  assert.ok(bandas >= 3, `esperaba las bandas a sangre de obras, encontré ${bandas}`)
})

test('los dos filtros que el mockup no dibuja pesan menos que los cuatro que sí', () => {
  // Medido en «03 · Obra Tareas.dc.html» (línea 646–649): el chip apagado del canon.
  assert.deepEqual(colorDeChip({ activo: false }), {
    borde: '#E7E6E2', fondo: '#FFFFFF', texto: '#3A3A38', cuenta: '#91918B',
  })
  assert.deepEqual(colorDeChip({ activo: true }), {
    borde: '#30302F', fondo: '#30302F', texto: '#FFFFFF', cuenta: '#B9B7B1',
  })

  const secundario = colorDeChip({ activo: false, secundario: true })
  // El gris con el que el mismo mockup pinta lo secundario (sub-solapa inactiva, conmutador de
  // dependencias). Si vuelve a ser el del chip canónico, los seis filtros pesan igual otra vez.
  assert.equal(secundario.texto, '#6B6B67')
  assert.notEqual(secundario.texto, colorDeChip({ activo: false }).texto)
  // Apagar no es despintar: mismo fondo, mismo borde y el conteo sigue siendo legible. Un filtro
  // que dice «11 atrasadas» no puede escribir el 11 en gris decorativo.
  assert.equal(secundario.fondo, '#FFFFFF')
  assert.equal(secundario.borde, '#E7E6E2')
  assert.equal(secundario.cuenta, '#91918B')
  // Elegido, un filtro secundario pesa como cualquier otro: la elección no es de segunda.
  assert.deepEqual(colorDeChip({ activo: true, secundario: true }), colorDeChip({ activo: true }))
})

test('Tareas dibuja como secundarias las dos vistas que no están en el canónico', () => {
  const fuente = codigo(readFileSync(join(RAIZ, 'src/features/obras/components/TabTareas.tsx'), 'utf8'))
  // Sin esto, `colorDeChip` puede estar perfecta y la pantalla seguir dibujando los seis iguales.
  assert.match(
    fuente, /VISTAS_SECUNDARIAS\.map\([\s\S]{0,200}?<Chip[^>]*\bsecundario\b/,
    'TabTareas volvió a dibujar los seis filtros con el mismo peso: `VISTAS_SECUNDARIAS` tiene que '
    + 'pasar `secundario` al Chip.',
  )
  assert.doesNotMatch(
    fuente, /VISTAS_PRIMARIAS\.map\([\s\S]{0,200}?<Chip[^>]*\bsecundario\b/,
    'los cuatro filtros del canónico 03 no se apagan: son los que resumen la obra.',
  )
})

test('los dos «Vincular» de Documentos no ocupan ancho mientras están plegados', () => {
  const fuente = codigo(readFileSync(join(RAIZ, 'src/features/obras/components/TabDocumentos.tsx'), 'utf8'))
  const bloque = fuente.slice(fuente.indexOf('<details'), fuente.indexOf('</details>'))
  assert.match(bloque, /<details className="group\b/, 'el `<details>` perdió el `group`')
  assert.match(
    bloque, /className="[^"]*\bhidden\b[^"]*group-open:block[^"]*w-\[440px\]/,
    'el formulario de 440px volvió a estar en el layout con el panel cerrado. Dos de estos suman '
    + '880px que empujan la ficha de obra hacia el costado. `hidden group-open:block` lo saca del '
    + 'documento SIN desmontarlo: lo que se tipeó sigue ahí al volver a abrir.',
  )
  // LA REGLA ES ESTRECHA A PROPÓSITO: hay otros `<details>` en obras con paneles anchos —06, 09 y
  // el alta de obra— y ninguno se midió en un navegador. Una regla general los pondría rojos hoy y
  // obligaría a cambiar a ciegas cuatro pantallas que nadie miró. Se amplía cuando se midan.
})
