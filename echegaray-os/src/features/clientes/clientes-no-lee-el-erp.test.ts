// EL CRM NO LEE EL ERP — la prohibición con alcance de carpeta.
//
// ═══ LA ORDEN, TEXTUAL (dueño, 10/09/2026 17:15) ═══
//
// «Está pésimo lo que involucra a módulo Obra y módulo Administración. Administración es un CRM y
// Obra un ERP: todo lo pertinente a datos de clientes va en CRM, no mezcles cosas con obras.»
//
// ═══ POR QUÉ UN TEST Y NO UNA REGLA EN `definiciones.json` ═══
//
// El registro de definiciones barre TODO el repositorio con patrones de texto: no puede decir «esto
// se prohíbe en estas dos carpetas y se permite en la de al lado», y el costo SÍ se lee —tiene que
// leerse— en el módulo Obras y en costo-hora. Esta regla es de FRONTERA entre módulos, así que se
// escribe donde vive la frontera. El registro tiene su parte: prohíbe el `select` de costos en
// cualquier pantalla (`costo_de_obra`), que es el otro lado de la misma moneda.
//
// ═══ LO QUE ESTE TEST NO PUEDE VER, DECLARADO ═══
//
// Es estático y busca nombres. No ve una lectura armada en runtime (`from(tabla)` con la tabla en
// una variable) ni un dato del ERP que llegue por props desde otro módulo. Un verde acá no prueba
// que no haya ERP en el CRM: prueba que no volvió por la puerta que ya se cerró.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url))

/** Las dos carpetas del módulo Clientes: sus piezas y sus pantallas. */
const CARPETAS = ['src/features/clientes', 'src/app/(main)/clientes']

/** El mínimo de archivos que el barrido tiene que encontrar. Un `find` que falla devuelve cero y un
 *  test sin nada que mirar pasa siempre — es la primera forma de verde falso. */
const MINIMO = 60

function archivos(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) archivos(ruta, acc)
    else if (/\.tsx?$/.test(nombre)) acc.push(ruta)
  }
  return acc
}

const FUENTES = CARPETAS.flatMap((c) => archivos(join(RAIZ, c)))
  // Los tests del módulo NOMBRAN lo prohibido para prohibirlo: son la regla, no la infracción.
  .filter((f) => !/\.test\.tsx?$/.test(f))
  .map((f) => [f.slice(RAIZ.length), readFileSync(f, 'utf8')] as const)

/**
 * QUÉ ES «DATO DEL ERP», con el nombre exacto con el que llegaría.
 *
 * No se prohíben las PALABRAS —«costo» aparece en una frase legítima— sino las lecturas y los
 * campos: el nombre de la columna, el de la vista y el de la propiedad que viajaría en la fila.
 */
const DEL_ERP: [RegExp, string][] = [
  [/\bcosto_mo\b|\bcostoMo\b/, 'el costo de mano de obra presupuestado'],
  [/\bcosto_materiales\b|\bcostoMateriales\b/, 'el costo de materiales presupuestado'],
  [/\bcosto_real\b|\bcostoReal\b/, 'el costo real de la obra'],
  [/obra_egreso_proyectado/, 'la explosión del presupuesto de la obra'],
  [/\bmargenDeLaFila\b|\bmargenPct\b/, 'el margen de la obra'],
  [/\bavance_pct\b|avanceDeObra/, 'el avance físico de la obra'],
  [/\bhoras_hombre\b|\bhh_imputadas\b/, 'las HH imputadas a la obra'],
]

test('el barrido miró el módulo de verdad', () => {
  assert.ok(
    FUENTES.length >= MINIMO,
    `el barrido encontró ${FUENTES.length} archivos y el módulo tiene más de ${MINIMO}: no miró nada`,
  )
})

test('ni las piezas ni las pantallas de Clientes leen costo, presupuesto, avance ni HH', () => {
  const culpables: string[] = []
  for (const [archivo, fuente] of FUENTES) {
    // Los comentarios explican POR QUÉ el dato se fue y nombran lo que sacaron: una prosa correcta
    // no puede poner roja la regla que describe.
    const codigo = fuente
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//'))
      .join('\n')
    for (const [patron, que] of DEL_ERP) {
      if (patron.test(codigo)) culpables.push(`${archivo} → ${que} (/${patron.source}/)`)
    }
  }
  assert.deepEqual(
    culpables, [],
    'El módulo Clientes es el CRM: habla de la RELACIÓN y de la PLATA con el cliente —contratado, '
    + 'facturado, cobrado, pendiente, vencido, próximo pago, OC/OP, contacto, portal—. El costo, el '
    + 'avance y las HH se deciden en el módulo Obras, contra el plan y los comprobantes. Si un dato '
    + 'del ERP hace falta acá, lo decide el dueño y se declara en este archivo.\n\n'
    + culpables.join('\n  '),
  )
})

test('la regla PUEDE dar rojo: un fuente con costo dentro se detecta', () => {
  // Sin esto, la lista de patrones podría quedar sin efecto —un `filter` de más, un `replace` que se
  // come el código— y el verde no significaría nada.
  const conCosto = 'const x = fila.costoMo ?? null'
  const encontrados = DEL_ERP.filter(([p]) => p.test(conCosto))
  assert.equal(encontrados.length, 1, 'el patrón del costo de mano de obra dejó de matchear')
  const limpio = 'const x = fila.cobradoTotal ?? null'
  assert.equal(DEL_ERP.filter(([p]) => p.test(limpio)).length, 0)
})
