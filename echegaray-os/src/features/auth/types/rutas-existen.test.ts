// TODA RUTA NOMBRADA EN UNA LISTA TIENE QUE EXISTIR EN `src/app`.
//
// ═══ EL DEFECTO QUE ATRAPA (27/08/2026) ═══
//
// Las listas de rutas del OS —el portero económico, el RBAC de campo, el mapa de «dónde estoy»—
// nombran pantallas con un literal. Cuando una pantalla se retira, el literal se queda: nadie lo
// ve, porque una cadena que no coincide con ningún `pathname` no rompe nada, no falla el typecheck
// y no falla el build. El día de esta prueba había CUATRO: `/ingenieria-financiera`,
// `/calendario-caja`, `/scorecard-finanzas` y `/operarios` seguían declaradas como «rutas del
// dinero» meses después de quedar huérfanas.
//
// El costo no es cosmético. Una entrada en `RUTAS_SOLO_ECONOMIA` afirma que existe una puerta
// cerrada; quien va a averiguar dónde se decide ese acceso llega acá y encuentra una lista que
// describe un sistema que ya no está. Y en `CAMPO_RUTAS_PERMITIDAS` el modo de fallar es el
// contrario y peor: una entrada de más es permiso concedido a una ruta que mañana puede volver a
// existir siendo otra cosa.
//
// No se prueba la lista contra sí misma: se prueba contra el ÁRBOL DE ARCHIVOS, que es quien decide
// de verdad qué URL contesta. Es la única fuente que no puede quedar vieja sin que Next lo note.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CAMPO_RUTAS_PERMITIDAS } from './index.ts'
import { RUTAS_SOLO_ECONOMIA } from './areas.ts'
import { PREFIJOS_DE_PANTALLA } from '../../../shared/components/estado/ubicacion.ts'

const APP = join(dirname(fileURLToPath(import.meta.url)), '../../../app')

const carpetas = (dir: string): string[] => {
  try {
    return readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory())
  } catch {
    return []
  }
}

/**
 * ¿Contesta esta URL? Se resuelve como resuelve el App Router y no con un `existsSync`:
 *
 *  · `(auth)` y `(main)` son GRUPOS: no aportan segmento a la URL, así que hay que mirar adentro.
 *  · `[obra]` es un segmento DINÁMICO: casa con cualquier valor.
 *  · lo que cuenta como pantalla es el archivo `page.tsx` o `route.ts` del último nivel.
 *
 * Devuelve `true` en cuanto una rama llega: una misma URL puede resolver por más de un camino.
 */
function contesta(ruta: string): boolean {
  const segmentos = ruta.split('/').filter(Boolean)
  const bajar = (dir: string, i: number): boolean => {
    if (i === segmentos.length) {
      const hay = readdirSync(dir)
      if (hay.includes('page.tsx') || hay.includes('route.ts')) return true
      // Un grupo puede envolver la hoja: `/login` vive en `(auth)/login`.
      return carpetas(dir).filter(esGrupo).some((g) => bajar(join(dir, g), i))
    }
    const hijas = carpetas(dir)
    const candidatas = hijas.filter((n) => n === segmentos[i] || esDinamico(n))
    if (candidatas.some((c) => bajar(join(dir, c), i + 1))) return true
    return hijas.filter(esGrupo).some((g) => bajar(join(dir, g), i))
  }
  return bajar(APP, 0)
}

const esGrupo = (n: string) => n.startsWith('(') && n.endsWith(')')
const esDinamico = (n: string) => n.startsWith('[')

/**
 * Lo que NO vive en `src/app` y por eso no se le puede pedir un `page.tsx`: archivos servidos
 * desde `public/`. Están en la lista blanca del middleware por una razón real —la pantalla de
 * login pide su propio logo sin sesión— y se enumeran acá para que la excepción sea explícita y no
 * un `catch` silencioso que deje pasar cualquier cosa.
 */
const ESTATICOS = ['/marca', '/icon.png', '/echegaray-os-extension.zip']

test('las rutas del dinero existen todas', () => {
  for (const r of RUTAS_SOLO_ECONOMIA) {
    assert.equal(contesta(r), true, `${r} está declarada como ruta del dinero y no existe ninguna pantalla ahí`)
  }
})

test('las rutas que abre el rol campo existen todas', () => {
  for (const r of CAMPO_RUTAS_PERMITIDAS.filter((r) => !ESTATICOS.includes(r))) {
    assert.equal(contesta(r), true, `${r} le está permitida al rol campo y no existe ninguna pantalla ahí`)
  }
})

test('el mapa de «dónde estoy» no nombra pantallas retiradas', () => {
  // Este mapa es el que escribe el cartel de error. Un prefijo huérfano no rompe —nunca coincide—
  // pero cuando una ruta VUELVE con otro significado, el cartel miente con total naturalidad.
  for (const p of PREFIJOS_DE_PANTALLA) {
    assert.equal(contesta(p), true, `el mapa de errores nombra ${p}, que ya no existe`)
  }
})

test('el resolvedor no da por buena cualquier cosa', () => {
  // Sin este caso los tres de arriba pasarían aunque `contesta()` devolviera siempre `true`.
  assert.equal(contesta('/pantalla-que-no-existe'), false)
  assert.equal(contesta('/administracion/pantalla-que-no-existe'), false)
  // Y sí resuelve a través de un grupo y de un segmento dinámico, que es lo que lo hace difícil.
  assert.equal(contesta('/login'), true, 'no supo entrar al grupo (auth)')
  assert.equal(contesta('/obras/san-francisco'), true, 'no supo resolver un segmento dinámico')
})
