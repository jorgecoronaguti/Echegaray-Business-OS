import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// NINGÚN LINK DE OBRAS PRECARGA — MEDIDO POR UNA REGLA SOBRE EL FUENTE.
//
// ═══ QUÉ DEFECTO ATRAPA (medido en producción el 24/08/2026) ═══
//
// Abrir UNA solapa de la obra disparaba entre cinco y siete renders RSC del servidor: Next precarga
// todo `<Link>` que entra en pantalla, y las rutas de obra son `force-dynamic`. Cada precarga vuelve
// a correr el `page.tsx` entero —con su `Promise.all` de hasta veinticinco consultas a Supabase—
// para bytes que casi siempre se tiran. En la traza del dueño, mirar el Resumen de una obra
// prefetcheaba economía, personal, gantt, documentos, ejecución, avance-masivo y cronograma.
//
// El costo no es el ancho de banda: es la CONTENCIÓN. La base ya devolvía `statement timeout` con
// `work_mem` en 2 MB, y multiplicar por seis las consultas de cada visita es exactamente lo que la
// mantiene contra el techo. El síntoma que reportó el dueño —«lento, malo, poco funcional»— es el
// efecto agregado de esa estampida, no el de una consulta lenta.
//
// `CabeceraDeObra` y `Tabs` ya lo declaraban (23/08). Lo que faltaba eran los links del CUERPO: el
// resumen que linkea al gantt, «Ver todo →» hacia ejecución, el panel de la tarea, las pastillas de
// filtro de la cartera y los controles de escala del cronograma. Son los que la traza mostró vivos.
//
// ═══ POR QUÉ UNA REGLA SOBRE EL FUENTE Y NO SOBRE EL DOM ═══
//
// Misma forma y mismo precedente que `cabecera-de-obra.test.ts`: medir el prefetch de verdad exige
// navegador, servidor y base, y tarda minutos. Esta regla cuesta milisegundos y caza el defecto
// donde se escribe. NO prueba que Next no precargue nada —prueba que un `<Link>` de obras no puede
// nacer precargando sin que este archivo se ponga rojo.
//
// SI UN LINK NECESITA PRECARGAR, la salida no es borrar la regla: es medir que el prefetch conviene
// y dejar acá la excepción con el número que la justifica.

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
 *  pone roja por una explicación correcta. Mismo helper que `cabecera-de-obra.test.ts`. */
const codigo = (fuente: string) => fuente
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('//'))
  .join('\n')

test('ningún <Link> de obras precarga: son rutas force-dynamic', () => {
  const archivos = DIRS.flatMap((d) => fuentes(join(RAIZ, d)))
  // Si esto se desploma, la regla dejó de mirar lo que debe mirar (carpeta movida o renombrada).
  assert.ok(archivos.length >= 40, `esperaba las pantallas de obras, encontré ${archivos.length}`)

  let mirados = 0
  for (const ruta of archivos) {
    // Sin la bandera `s`: `[^>]` ya cruza saltos de línea y el `target` del proyecto es anterior a
    // es2018. Un `<Link` partido en varias líneas se atrapa igual.
    for (const link of codigo(readFileSync(ruta, 'utf8')).match(/<Link\b[^>]*>/g) ?? []) {
      mirados++
      assert.match(
        link, /prefetch=\{false\}/,
        `${ruta.slice(RAIZ.length)} tiene un <Link> que precarga —un render RSC completo del `
        + `servidor por cada uno que entra en pantalla—: ${link.replace(/\s+/g, ' ').slice(0, 120)}`,
      )
    }
  }
  // El conteo es parte de la regla: si alguien convierte los links en botones con `router.push`, el
  // bucle de arriba pasa sin mirar nada y la regla se volvería verde por vacía.
  assert.ok(mirados >= 45, `esperaba ≥45 <Link> en obras, miré ${mirados}`)
})
