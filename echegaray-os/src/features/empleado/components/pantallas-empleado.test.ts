import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CONTEXTOS } from './shell-logica.ts'

// NINGUNA PANTALLA DEL EMPLEADO QUEDA ENCERRADA — medido por una regla, no por memoria.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// Desde el Design del 23/08 la barra de tres contextos se dibuja SÓLO en las tres pantallas raíz, y
// la salida de una pantalla de detalle es la flecha del topbar. Esa flecha la dibuja
// `PantallaEmpleado` cuando —y sólo cuando— la pantalla le pasa `volver`.
//
// O sea: una pantalla de detalle nueva que se olvide de `volver` no se ve rota. Se ve bien. Y no
// tiene barra abajo ni flecha arriba: el teléfono queda con el botón físico de atrás como única
// salida, que en una PWA instalada no existe. Es un defecto invisible en una captura y evidente con
// el teléfono en la mano — exactamente el que una regla ejecutable tiene que cazar.
//
// ═══ POR QUÉ CUENTA APARICIONES ═══
//
// Un archivo de pantalla suele tener DOS `<PantallaEmpleado` —el camino sin persona vinculada y el
// normal— y las dos tienen que volver al mismo lugar. Comparar cuántas veces aparece la etiqueta
// contra cuántas veces aparece `volver=` es exacto para ese caso y no exige parsear JSX.
//
// LÍMITE DECLARADO: los `not-found.tsx` no usan `PantallaEmpleado` (usan `EstadoNoEncontrado`, que
// trae su propia primaria de vuelta) y esta regla no los mira.

const RAIZ = new URL('../../../..', import.meta.url).pathname
const GRUPO = join(RAIZ, 'src/app/(empleado)')
const RAICES = new Set(CONTEXTOS.map((c) => c.href))

/** Cada `page.tsx` del grupo con la ruta que sirve. `(empleado)` es grupo de rutas: no aporta URL. */
function pantallas(dir: string, ruta = ''): { archivo: string; ruta: string }[] {
  const salida: { archivo: string; ruta: string }[] = []
  for (const nombre of readdirSync(dir)) {
    const camino = join(dir, nombre)
    if (statSync(camino).isDirectory()) salida.push(...pantallas(camino, `${ruta}/${nombre}`))
    else if (nombre === 'page.tsx') salida.push({ archivo: camino, ruta: ruta || '/' })
  }
  return salida
}

const PANTALLAS = pantallas(GRUPO)

test('el grupo (empleado) tiene pantallas que mirar', () => {
  // Si el grupo se renombra o se mueve, las dos reglas de abajo pasarían en verde sin mirar nada.
  assert.ok(PANTALLAS.length >= 10, `sólo se encontraron ${PANTALLAS.length} pantallas en (empleado)`)
})

test('TODA PANTALLA DE DETALLE OFRECE VOLVER — es su única salida', () => {
  const encerradas: string[] = []
  for (const { archivo, ruta } of PANTALLAS) {
    if (RAICES.has(ruta)) continue
    const fuente = readFileSync(archivo, 'utf8')
    const marcos = (fuente.match(/<PantallaEmpleado/g) ?? []).length
    const vueltas = (fuente.match(/volver=\{\{/g) ?? []).length
    if (marcos !== vueltas) {
      encerradas.push(`${ruta}: ${marcos} <PantallaEmpleado> y ${vueltas} volver=`)
    }
  }
  assert.deepEqual(encerradas, [], `\n${encerradas.join('\n')}\n`)
})

test('UNA PANTALLA RAÍZ NO LLEVA VOLVER: su salida es la barra de contextos', () => {
  // El defecto simétrico: una flecha «volver» en `/hoy` no tiene a dónde ir hacia arriba, y encima
  // convence al marco de apagar la barra de los tres contextos justo en la pantalla de entrada.
  const sobrantes: string[] = []
  for (const { archivo, ruta } of PANTALLAS) {
    if (!RAICES.has(ruta)) continue
    if (readFileSync(archivo, 'utf8').includes('volver={{')) sobrantes.push(ruta)
  }
  assert.deepEqual(sobrantes, [], `\n${sobrantes.join('\n')}\n`)
})
