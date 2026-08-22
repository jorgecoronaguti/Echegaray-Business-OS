// LAS FRONTERAS DE CARGA Y ERROR DEL PERFIL JEFE DE OBRA.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Hasta el 21/08/2026 el grupo `(jefe)` tenía UN solo archivo de infraestructura —`layout.tsx`— y
// ninguna frontera. Dos consecuencias medibles, las dos invisibles para el typecheck y el build:
//
//   · SIN `error.tsx`: una excepción no atrapada subía hasta `src/app/error.tsx`, el error del ERP
//     de escritorio. Reemplaza el árbol entero, así que se llevaba puestos el header, la barra de
//     contextos y el botón de volver: el jefe quedaba en una pantalla que no es la suya.
//   · SIN `loading.tsx`: las seis páginas son `force-dynamic` con `Promise.all` de 3 a 7 lecturas.
//     Tocar una pestaña dejaba la anterior intacta y muda hasta que volvía la última consulta.
//
// ═══ POR QUÉ SE EXIGE UNO POR PANTALLA Y NO SÓLO EL DEL GRUPO ═══
//
// El del grupo cubre la ENTRADA (streaming del primer documento). No cubre la navegación entre las
// seis: en una transición React sigue mostrando el contenido de una frontera ya montada — el
// fallback que se ve es el de la frontera que se monta nueva, o sea el `loading.tsx` co-locado con
// la página a la que se entra. Es la misma disposición que ya tiene `(main)`, que tiene el suyo
// arriba y además uno en `obras/`, `clientes/`, `flujo-caja/`…
//
// Si mañana alguien agrega una séptima pantalla al perfil jefe sin su frontera, este test se pone
// rojo con el nombre de la carpeta que falta.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const GRUPO = join(process.cwd(), 'src', 'app', '(jefe)')

/** Toda carpeta con `page.tsx` bajo el grupo, en profundidad. */
function pantallas(dir: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (!entrada.isDirectory()) continue
    const sub = join(dir, entrada.name)
    if (existsSync(join(sub, 'page.tsx'))) acumulado.push(sub)
    pantallas(sub, acumulado)
  }
  return acumulado
}

test('el grupo (jefe) atrapa sus propios errores', () => {
  assert.ok(
    existsSync(join(GRUPO, 'error.tsx')),
    'falta (jefe)/error.tsx: una excepción sube al error del ERP y saca al jefe de su shell',
  )
})

test('el grupo (jefe) tiene fallback de carga en la entrada', () => {
  assert.ok(
    existsSync(join(GRUPO, 'loading.tsx')),
    'falta (jefe)/loading.tsx: el primer documento no se manda por streaming y la pantalla queda en blanco',
  )
})

test('cada pantalla del jefe tiene su propia frontera de carga', () => {
  const dirs = pantallas(GRUPO)
  assert.ok(dirs.length >= 6, `se encontraron ${dirs.length} pantallas en (jefe): el test no está mirando donde debe`)
  for (const dir of dirs) {
    assert.ok(
      existsSync(join(dir, 'loading.tsx')),
      `falta loading.tsx en ${dir.slice(dir.indexOf('(jefe)'))}: navegar a esta pantalla deja la anterior `
        + 'congelada, sin ninguna señal, hasta que vuelven todas sus lecturas',
    )
  }
})
