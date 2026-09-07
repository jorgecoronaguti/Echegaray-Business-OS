// EL DEFECTO QUE ATRAPA: que la cartera vuelva a pedir `select('*')` sobre `obra_panel`.
//
// El dueño (07/09/2026), textual: *"necesito q revises todo el modulo obras de app.ecsas.com.ar
// porque esta muy lento y no se puede usar"*. `obra_panel` tiene 36 columnas y la tabla de la
// cartera dibuja doce; medido sobre la base real como `authenticated` con sesión de Dirección,
// `select *` son 24.989 bytes y las doce 7.656. Los otros 17 KB viajaban de São Paulo a iad1 en
// cada apertura de la pantalla para tirarse en el `map`.
//
// Es la MISMA regla que `getPlanVsRealPortafolio` ya había aprendido el 24/08. Este test existe
// porque aquella vez no quedó ninguno: el segundo `select('*')` entró sin que nada se pusiera rojo.
//
// LOS DOS LADOS SE MIDEN CONTRA EL CÓDIGO, NO CONTRA UNA COPIA DE LA LISTA:
//   · la consulta pide EXACTAMENTE lo que el tipo declara (ni de más ni de menos);
//   · la página no dibuja ninguna columna que la consulta no haya pedido.
// Si alguien agrega un campo a `FilaCartera` y se olvida de pedirlo, el segundo test cae.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COLUMNAS_CARTERA } from './obrasService.ts'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SERVICIO = readFileSync(join(AQUI, 'obrasService.ts'), 'utf8')
const PAGINA = readFileSync(join(AQUI, '..', '..', '..', 'app', '(main)', 'obras', 'page.tsx'), 'utf8')

/** Los campos de un `Pick<...>` tal como están escritos en el archivo. Se lee del fuente y no de un
 *  literal repetido acá: una copia de la lista no puede delatar que la lista cambió. */
function camposDelPick(fuente: string, alias: string): string[] {
  const m = new RegExp(`export type ${alias} = Pick<[\\s\\S]*?>\\n`).exec(fuente)
  assert.ok(m, `no encontré el tipo ${alias} — ¿lo renombraron?`)
  return [...m[0].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
}

test('la cartera pide exactamente las columnas que su tipo declara', () => {
  const declaradas = camposDelPick(SERVICIO, 'FilaDeCartera')
  assert.deepEqual(
    COLUMNAS_CARTERA.split(','),
    declaradas,
    'COLUMNAS_CARTERA y FilaDeCartera se separaron: la consulta trae otra cosa que la que el tipo promete',
  )
})

test('la consulta de la cartera NO es select(*)', () => {
  const cuerpo = /export async function getCartera\([\s\S]*?\n}/.exec(SERVICIO)
  assert.ok(cuerpo, 'getCartera desapareció')
  assert.ok(
    !/\.select\(\s*['"`]\*/.test(cuerpo[0]),
    'volvió el select(*): son 36 columnas para dibujar 12, 17 KB por carga de pantalla',
  )
  assert.match(cuerpo[0], /\.select\(COLUMNAS_CARTERA\)/)
})

test('la página no dibuja ninguna columna que la cartera no haya pedido', () => {
  // Lo que la página mete en cada `FilaCartera` sale de `o.<campo>`: ése es el contrato real.
  const usados = new Set([...PAGINA.matchAll(/\bo\.([a-z_]+)\b/g)].map((x) => x[1]))
  const pedidos = new Set(COLUMNAS_CARTERA.split(','))
  const faltantes = [...usados].filter((c) => !pedidos.has(c))
  assert.deepEqual(
    faltantes, [],
    `la página lee ${faltantes.join(', ')} y la consulta no lo pide: se dibujaría undefined sin un solo error`,
  )
})
