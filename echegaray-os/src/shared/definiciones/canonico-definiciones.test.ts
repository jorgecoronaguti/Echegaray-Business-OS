// UN CONCEPTO SE DEFINE UNA SOLA VEZ, Y ESTE TEST ES QUIEN LO HACE CUMPLIR.
//
// ═══ EL DEFECTO, EN PALABRAS DEL DUEÑO (10/09/2026) ═══
//
// «La info que se lee de la base no es uniforme; te tengo que referenciar pestañas puntuales porque
// toda la info no es consistente en toda la plataforma. Esto no puede suceder.»
//
// El inventario está en `docs/engineering/PRP-REALIDAD-UNICA.md`: 22 conceptos críticos, y en la
// mayoría conviven dos o más definiciones vivas que pueden dar números distintos. «Lo contratado de
// un cliente» tenía CINCO. Cada una se arregló pantalla por pantalla al menos una vez —cinco veces
// en tres semanas— y ninguna de esas correcciones impidió la sexta, porque arreglar la pantalla no
// deja nada que se ponga rojo cuando alguien vuelve a leer la fuente vieja.
//
// ═══ QUÉ HACE ═══
//
// Lee `orquestador/datos/definiciones.json` —el registro— y barre `src/`, `orquestador/` y
// `scripts/`. Por cada concepto, ningún archivo fuera de sus excepciones puede matchear un patrón
// prohibido. Y al revés: cada excepción tiene que seguir matcheando algo, porque una excepción que
// mira al aire es una prohibición que dejó de cuidar lo que decía cuidar.
//
// ═══ SUS CUATRO MANERAS DE DAR UN VERDE FALSO, Y CÓMO SE CIERRAN ═══
//
//   1. Que el barrido no mire nada. Se exige un mínimo de archivos (`_minimo_de_archivos`): un
//      `find` que falla devuelve cero y un test sin nada que mirar pasa siempre.
//   2. Que una excepción quede colgada. Cada una tiene que matchear; si no, rojo con su nombre.
//   3. Que el registro y el documento se separen. Se exige correspondencia 1:1 con
//      `docs/engineering/DEFINICIONES.md`: un `.md` sin test es una promesa y un test sin `.md` es
//      una regla que nadie puede leer.
//   4. Que un patrón prohíba su propia canónica. Se comprueba: si el patrón matchea el nombre de la
//      fuente buena, el control se vuelve imposible de cumplir y el que sigue lo apaga.
//
// ═══ LO QUE ESTE TEST NO PUEDE VER (declarado) ═══
//
// Es estático. No ve una consulta concatenada (`from(tabla)` con la tabla en una variable), ni un
// `rpc()` cuyo cuerpo vive en SQL, ni una lectura que pase por un cliente HTTP. Para eso está
// `orquestador/scripts/canario-fuente-unica.mjs`, que compara en RUNTIME lo que dice cada cara. Un
// verde acá NO prueba que no haya una segunda definición: prueba que ninguna de las conocidas
// volvió por la puerta que ya se cerró.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { archivosDeCodigo, lineasQueMatchean } from './fuente.ts'

/** La raíz del proyecto (`echegaray-os/`), que es desde donde se escriben las rutas del registro. */
const RAIZ = fileURLToPath(new URL('../../../', import.meta.url))

interface Prohibida { patron: string; porque: string }
interface Excepcion { archivo: string; porque: string; hasta?: string }
interface Concepto {
  concepto: string
  canonica: string
  propietario: string
  criterio: string
  ventana: string
  confianza: string
  prohibidas: Prohibida[]
  excepciones: Excepcion[]
}
interface Registro {
  _carpetas_barridas: string[]
  _minimo_de_archivos: number
  conceptos: Concepto[]
}

const registro = JSON.parse(
  readFileSync(`${RAIZ}orquestador/datos/definiciones.json`, 'utf8'),
) as Registro

/** El barrido se hace UNA vez para los cuatro conceptos: son 2.300 archivos. */
const ARCHIVOS = archivosDeCodigo(RAIZ, registro._carpetas_barridas)
/** El fuente de cada uno, leído una sola vez. */
const FUENTES = new Map(ARCHIVOS.map((a) => [a, readFileSync(a, 'utf8')]))

/** La ruta como la escribe el registro: relativa a `echegaray-os/`. */
const relativo = (absoluto: string) => absoluto.slice(RAIZ.length)

test('el barrido miró el repositorio de verdad', () => {
  // UN VERDE VACÍO ES EL PEOR RESULTADO POSIBLE: dice «ninguna lectura prohibida» cuando en realidad
  // no se leyó ni un archivo. Le pasó al barrido de prefetch el 07/09/2026 con su lista a mano.
  assert.ok(
    ARCHIVOS.length >= registro._minimo_de_archivos,
    `el barrido encontró ${ARCHIVOS.length} archivos y el registro exige al menos `
    + `${registro._minimo_de_archivos}: no miró el repositorio`,
  )
})

test('el registro tiene los cuatro campos que hacen auditable una definición', () => {
  for (const c of registro.conceptos) {
    for (const campo of ['canonica', 'propietario', 'criterio', 'ventana', 'confianza'] as const) {
      assert.ok(
        typeof c[campo] === 'string' && c[campo].trim().length > 0,
        `el concepto «${c.concepto}» no declara \`${campo}\`: sin eso nadie puede auditar el número`,
      )
    }
    // Una prohibición sin motivo es una regla que el próximo va a borrar sin saber qué rompía.
    for (const p of c.prohibidas) {
      assert.ok(p.porque.trim().length > 20, `el patrón \`${p.patron}\` de «${c.concepto}» no dice por qué`)
    }
    for (const e of c.excepciones) {
      assert.ok(e.porque.trim().length > 20, `la excepción \`${e.archivo}\` de «${c.concepto}» no dice por qué`)
    }
  }
})

test('ningún patrón prohibido acusa a su propia fuente canónica', () => {
  // Si `cobrado` prohibiera `cliente_economia`, la regla sería imposible de cumplir y el primero que
  // la choque la va a apagar en vez de arreglar nada.
  for (const c of registro.conceptos) {
    for (const p of c.prohibidas) {
      assert.doesNotMatch(
        c.canonica, new RegExp(p.patron),
        `el patrón \`${p.patron}\` de «${c.concepto}» matchea su propia canónica (${c.canonica})`,
      )
    }
  }
})

for (const concepto of registro.conceptos) {
  test(`«${concepto.concepto}» se lee de su fuente canónica y de ninguna otra`, () => {
    const permitidos = new Set(concepto.excepciones.map((e) => e.archivo))
    const culpables: string[] = []
    const usadas = new Set<string>()

    for (const prohibida of concepto.prohibidas) {
      const patron = new RegExp(prohibida.patron)
      for (const [archivo, fuente] of FUENTES) {
        const lineas = lineasQueMatchean(fuente, patron)
        if (lineas.length === 0) continue
        const rel = relativo(archivo)
        if (permitidos.has(rel)) { usadas.add(rel); continue }
        for (const linea of lineas) culpables.push(`${rel}:${linea}  → /${prohibida.patron}/`)
      }
    }

    assert.deepEqual(
      culpables, [],
      `estos archivos leen una fuente que NO es la canónica de «${concepto.concepto}» `
      + `(${concepto.canonica}).\n`
      + concepto.prohibidas.map((p) => `  /${p.patron}/ — ${p.porque}`).join('\n')
      + '\n\nCULPABLES:\n  ' + culpables.join('\n  ')
      + '\n\nSi la lectura es legítima, se declara en orquestador/datos/definiciones.json CON EL '
      + 'MOTIVO y se agrega su sección a docs/engineering/DEFINICIONES.md, en el mismo cambio.',
    )

    // ── LA EXCEPCIÓN QUE MIRA AL AIRE ──
    //
    // Se declaró para tapar una lectura concreta. Si esa lectura desapareció —el archivo se
    // renombró, la consulta cambió— la excepción sigue autorizando algo que ya no existe, y el día
    // que alguien escriba una lectura NUEVA en ese archivo va a entrar autorizada sin que nadie lo
    // decida. Rojo, y se borra la línea.
    const alAire = concepto.excepciones.map((e) => e.archivo).filter((a) => !usadas.has(a))
    assert.deepEqual(
      alAire, [],
      `estas excepciones de «${concepto.concepto}» ya no matchean ningún patrón prohibido: `
      + 'la lectura que autorizaban desapareció y la autorización quedó abierta. Borralas de '
      + `orquestador/datos/definiciones.json.\n  ${alAire.join('\n  ')}`,
    )
  })
}

// ═══ EL REGISTRO Y EL DOCUMENTO SON LA MISMA COSA DICHA DOS VECES ═══
//
// El `.json` lo lee el test; el `.md` lo lee una persona. Si se separan, la persona toma decisiones
// sobre una regla que ya no existe. La correspondencia es 1:1 en las dos direcciones.

const DOC = 'docs/engineering/DEFINICIONES.md'

test(`${DOC} tiene una sección por concepto, y ninguna de más`, () => {
  const md = readFileSync(RAIZ + DOC, 'utf8')
  const secciones = [...md.matchAll(/^##\s+`([a-z_]+)`/gm)].map((m) => m[1])
  assert.deepEqual(
    secciones.sort(), registro.conceptos.map((c) => c.concepto).sort(),
    'el registro y el documento dejaron de decir lo mismo: un .md sin test es una promesa y un '
    + 'test sin .md es una regla que nadie puede leer',
  )
})

test(`${DOC} publica la canónica y el criterio de cada concepto`, () => {
  const md = readFileSync(RAIZ + DOC, 'utf8')
  for (const c of registro.conceptos) {
    const desde = md.indexOf(`## \`${c.concepto}\``)
    const siguiente = md.indexOf('\n## ', desde + 1)
    const seccion = md.slice(desde, siguiente < 0 ? md.length : siguiente)
    assert.ok(
      seccion.includes(c.canonica),
      `la sección «${c.concepto}» de ${DOC} no nombra su canónica textual (${c.canonica})`,
    )
    // Cada patrón prohibido tiene que estar escrito en el documento: si sólo vive en el JSON, quien
    // se choca con el rojo no tiene dónde leer por qué.
    for (const p of c.prohibidas) {
      assert.ok(
        seccion.includes(p.patron),
        `${DOC} no documenta el patrón prohibido \`${p.patron}\` de «${c.concepto}»`,
      )
    }
  }
})
