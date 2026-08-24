import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// EL PORTE LITERAL NO SE DESHACE SOLO — pero se deshace de a un import por vez.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// El dueño rechazó CUATRO entregas del rediseño con la misma frase: «estructura parecida, aspecto
// distinto». La causa fue siempre la misma y es mecánica: las pantallas del teléfono se dibujaban
// con el design system de ESCRITORIO (`@/shared/components/ds`), que tiene otra escala de grises,
// otros radios y otros altos de control. Ningún typecheck ni lint ve eso.
//
// Y no vuelve de golpe: vuelve cuando alguien necesita un `Aviso` a las once de la noche, escribe
// `import { Aviso } from '@/shared/components/ds'` y la pantalla queda con dos vocabularios
// visuales. Este test lo pone en rojo en ese commit, no tres semanas después en una captura.
//
// ═══ QUÉ MIRA, EXACTAMENTE ═══
//
// Las QUINCE pantallas portadas de `/home/jorge/echegaray-design/*.dc.html` (J01–J06 y M01–M09) y
// nada más. Las pantallas de detalle del empleado que NO tienen mockup —recibos, legajo, el detalle
// de un documento— siguen con el DS a propósito: portarlas sin un `.dc.html` que las mida sería
// inventar el diseño, que es justo lo que este trabajo vino a dejar de hacer. Cuando el dueño
// dibuje esos artboards, entran a esta lista.
//
// LÍMITE DECLARADO: esto prueba de qué kit salen los estilos, no el píxel renderizado. El píxel lo
// tiene que mirar alguien con el teléfono en la mano, y esa firma no la puede dar un test.

const RAIZ = new URL('../../../..', import.meta.url).pathname

/** Pantalla portada → el archivo que la dibuja. */
const PORTADAS: [string, string][] = [
  ['J01 · Jefe Hoy', 'src/app/(jefe)/obra/hoy/page.tsx'],
  ['J02 · Jefe Tareas', 'src/app/(jefe)/obra/tareas/page.tsx'],
  ['J03 · Jefe Avance', 'src/features/jefe/components/ComoVieneLaObra.tsx'],
  ['J04 · Jefe Avance masivo', 'src/features/jefe/components/FormularioMasivo.tsx'],
  ['J05 · Jefe Personas', 'src/app/(jefe)/obra/personas/page.tsx'],
  ['J06 · Jefe Frente', 'src/features/jefe/components/FormularioAvance.tsx'],
  ['M01 · Login', 'src/features/auth/components/LoginForm.tsx'],
  ['M02 · Hoy', 'src/app/(empleado)/hoy/page.tsx'],
  ['M03 · Mi trabajo', 'src/app/(empleado)/mi-trabajo/page.tsx'],
  ['M04 · Detalle tarea', 'src/app/(empleado)/mi-trabajo/tareas/[tarea]/page.tsx'],
  ['M05 · Asistencia', 'src/app/(empleado)/mi-informacion/asistencia/page.tsx'],
  ['M06 · Mis horas', 'src/app/(empleado)/mi-informacion/horas/page.tsx'],
  ['M07 · Reportar problema', 'src/features/empleado/components/FormProblema.tsx'],
  ['M08 · Mis papeles', 'src/app/(empleado)/mi-informacion/documentos/page.tsx'],
  ['M09 · Yo', 'src/app/(empleado)/mi-informacion/page.tsx'],
]

/** El código sin comentarios: los de cabecera CITAN los valores medidos, y eso es documentación. */
function soloCodigo(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trimStart()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')
}

test('las quince pantallas portadas existen donde este test las busca', () => {
  // Si alguien renombra o mueve una, las reglas de abajo pasarían en verde sin mirar nada.
  const faltan = PORTADAS.filter(([, ruta]) => !existsSync(join(RAIZ, ruta))).map(([n]) => n)
  assert.deepEqual(faltan, [], `\n${faltan.join('\n')}\n`)
})

test('NINGUNA PANTALLA DEL TELÉFONO VUELVE AL DESIGN SYSTEM DE ESCRITORIO', () => {
  const fallas: string[] = []
  for (const [pantalla, ruta] of PORTADAS) {
    if (/from '@\/shared\/components\/ds'/.test(soloCodigo(ruta))) {
      fallas.push(`${pantalla} (${ruta}): importa el design system de escritorio`)
    }
  }
  assert.deepEqual(fallas, [], `\n${fallas.join('\n')}\n`)
})

test('las quince salen del kit MEDIDO en los mockups', () => {
  // El complemento del test anterior: no alcanza con no usar el DS —una pantalla podría escribir
  // sus propios hexadecimales a mano y quedar igual de desalineada—. Tiene que salir de
  // `shared/components/movil`, que es donde vive el valor medido en el `.dc.html`.
  const fallas: string[] = []
  for (const [pantalla, ruta] of PORTADAS) {
    if (!/from '@\/shared\/components\/movil\//.test(soloCodigo(ruta))) {
      fallas.push(`${pantalla} (${ruta}): no usa el kit del teléfono`)
    }
  }
  assert.deepEqual(fallas, [], `\n${fallas.join('\n')}\n`)
})

test('la paleta del teléfono NO se reescribe a mano en las pantallas', () => {
  // Un `#FDC900` tipeado en una pantalla es el mismo defecto que el DS de escritorio con otra
  // forma: el día que el dueño mueva un tono, doce archivos quedan con el viejo. Los hexadecimales
  // viven en `tokens.ts`, que es el archivo que los declara, y en ningún otro lado.
  const fallas: string[] = []
  for (const [pantalla, ruta] of PORTADAS) {
    const hex = soloCodigo(ruta).match(/#[0-9A-Fa-f]{6}\b/g)
    if (hex) fallas.push(`${pantalla}: color escrito a mano ${[...new Set(hex)].join(', ')}`)
  }
  assert.deepEqual(fallas, [], `\n${fallas.join('\n')}\n`)
})
