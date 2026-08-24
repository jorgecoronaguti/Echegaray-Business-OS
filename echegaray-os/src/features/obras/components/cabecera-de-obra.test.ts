import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// UNA OBRA, UNA CABECERA — MEDIDO POR UNA REGLA SOBRE EL FUENTE.
//
// ═══ QUÉ DEFECTO ATRAPA (QA 24/08 · C-CANON §12) ═══
//
// El workspace de la obra dibujaba `EntityHeader` + las seis solapas; sus pantallas hijas
// —Cronograma, Dotación, Subcontratos, Avance masivo, Registrar avance— una banda grafito propia
// con KPI adentro. Nada se rompía: las cinco páginas abrían, el typecheck pasaba y el build también.
// El único síntoma era visual —entrar al cronograma parecía entrar a otra aplicación, y desde ahí
// no se podía saltar a Personal o a Economía— y por eso sobrevivió a dos rondas de revisión.
//
// ═══ POR QUÉ ES UNA REGLA SOBRE EL FUENTE Y NO SOBRE EL DOM ═══
//
// Medir el DOM exige el navegador y la base, y eso ya se hace en `tests/obra-cronograma-dotacion`
// (~minutos, con la app levantada y Supabase respondiendo). Esta regla cuesta milisegundos y caza el
// defecto donde se escribe: una pantalla de obra que se arma su propia cabecera. Precedente y misma
// forma que `src/app/campo/objetivos-tactiles.test.ts`.
//
// NO reemplaza a la verificación visual: que las seis pantallas importen el mismo componente no
// prueba que se vean iguales. Prueba que no pueden divergir sin que este archivo se ponga rojo.

const RAIZ = new URL('../../../..', import.meta.url).pathname
const RUTAS_DE_OBRA = join(RAIZ, 'src/app/(main)/obras/[obra]')
const CABECERA = join(RAIZ, 'src/features/obras/components/CabeceraDeObra.tsx')

function paginas(dir: string): string[] {
  const salida: string[] = []
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...paginas(ruta))
    else if (nombre === 'page.tsx') salida.push(ruta)
  }
  return salida
}

const relativo = (ruta: string) => ruta.slice(RAIZ.length)

/**
 * El fuente SIN sus comentarios. La regla mira lo que se ejecuta, no lo que se explica: los
 * comentarios de este repo nombran a propósito lo que se retiró —«ya usaba `EntityHeader`»— y una
 * regla que lee prosa se pone roja por una explicación correcta. Se sacan los bloques `/* … *␘/` y
 * las líneas que empiezan con `//`; no se toca el resto para no romper un `https://` de un href.
 */
const codigo = (fuente: string) => fuente
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('//'))
  .join('\n')

test('las pantallas de la obra dibujan LA MISMA cabecera, no una propia', () => {
  const rutas = paginas(RUTAS_DE_OBRA)
  // Si esto baja de 6, alguien borró una pantalla y la regla dejaría de mirar lo que debe mirar.
  assert.ok(rutas.length >= 6, `esperaba las 6 pantallas de la obra, encontré ${rutas.length}`)

  for (const ruta of rutas) {
    const fuente = codigo(readFileSync(ruta, 'utf8'))
    assert.match(
      fuente, /CabeceraDeObra/,
      `${relativo(ruta)} no usa CabeceraDeObra: es una pantalla de la obra con cabecera propia`,
    )
    // Nadie arma su propio encabezado de entidad ni su propia barra de solapas. Las dos cosas las
    // pone la cabecera compartida; hacerlas acá es exactamente cómo nacieron las dos versiones.
    assert.doesNotMatch(
      fuente, /\bEntityHeader\b/,
      `${relativo(ruta)} arma su propio EntityHeader — va adentro de CabeceraDeObra`,
    )
    assert.doesNotMatch(
      fuente, /VISTAS_OBRA/,
      `${relativo(ruta)} mapea las solapas de la obra por su cuenta — las dibuja CabeceraDeObra`,
    )
  }
})

test('la cabecera no navega con prefetch: son seis rutas force-dynamic', () => {
  const fuente = readFileSync(CABECERA, 'utf8')
  // Los `Link` propios de la cabecera lo declaran a mano; los de las solapas los emite `Tabs`, que
  // lo trae de fábrica. Un prefetch acá es un render RSC completo por solapa visible y por página
  // vista — la estampida que tuvo al servidor 12-26 s ocupado en agosto.
  // Sin la bandera `s`: `[^>]` ya cruza saltos de línea, y el `target` del proyecto es anterior a
  // es2018 —el typecheck la rechaza—. Un `<Link` partido en varias líneas se atrapa igual.
  const links = fuente.match(/<Link\b[^>]*>/g) ?? []
  for (const link of links) {
    assert.match(link, /prefetch=\{false\}/, `un <Link> de la cabecera de obra prefetchea: ${link}`)
  }
  // ═══ LAS SOLAPAS DEJARON DE SER `<Tabs>` (24/08/2026 · porte literal del zip) ═══
  //
  // Esta línea exigía `<Tabs\b` — el componente del design system. Los mockups 02, 03, 05 y 06
  // dibujan la barra con SUS valores (13px, `padding:8px 11px`, activa 600 con
  // `boxShadow:inset 0 -2px 0 #FDC900`) y `Tabs` produce otros; el dueño rechazó cuatro entregas
  // por exactamente esa clase de diferencia. Gana el mockup, así que la regla pasa a medir lo que
  // de verdad importaba: que las seis solapas se dibujen ACÁ y salgan de `VISTAS_OBRA`, no que las
  // dibuje un componente en particular.
  assert.match(fuente, /VISTAS_OBRA\.map\(/, 'la cabecera dejó de dibujar las solapas de la obra')
  assert.match(
    fuente, /inset 0 -2px 0/,
    'la solapa activa perdió el subrayado de 2px del canónico (mockup 02: `inset 0 -2px 0 #FDC900`)',
  )
})

test('la cabecera no inventa: un KPI sin dato dice su palabra, nunca 0', () => {
  const fuente = readFileSync(CABECERA, 'utf8')
  // El defecto que esto atrapa es el de siempre: un dato que falta dibujado como cero. «Fin de
  // obra: 0» o «HH proyectadas: 0» se leen como hechos medidos, y no lo son.
  assert.match(
    fuente, /k\.valor == null[\s\S]{0,200}k\.falta/,
    'la cabecera dejó de distinguir «no lo sé» de «es cero» en sus KPI',
  )
})
