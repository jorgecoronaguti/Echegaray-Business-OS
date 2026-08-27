// EL BORDE DE RED DEL OS: ningún servidor escucha en la red pública por defecto.
//
// ═══ POR QUÉ ESTE TEST EXISTE (27/08/2026) ═══
//
// `interactive-server.mjs` escuchaba en `0.0.0.0` —todas las interfaces, incluida la pública—.
// Medido desde afuera, un cortafuegos delante de la VM lo tapaba, así que la exposición era
// LATENTE y no activa; pero ese filtro vive en la consola del proveedor, no en este repo, y el día
// que alguien lo cambie o la VM se mude, el borde queda abierto sin que nadie toque una línea.
// Nadie lo había pedido y nadie lo usaba: el túnel de cloudflared entra por `localhost` y el resto
// de los clientes pasan por Vercel. Fue un default que quedó.
//
// El test NO prueba el estado de la red —eso lo dice `ss`, y cambia con cada arranque—: prueba la
// REGLA que produce ese estado, que es lo único que se puede sostener en el tiempo. Un `listen` con
// `'0.0.0.0'` escrito en el código vuelve a abrir el borde sin que nadie lo note, y lo que este
// archivo garantiza es que eso no compile en verde.
//
// Abrir un borde sigue siendo posible: se pone la variable de entorno del despliegue. Lo que no se
// puede es abrirlo SIN ESCRIBIRLO.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function archivosJs(dir) {
  const salida = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) salida.push(...await archivosJs(p))
    else if (/\.(mjs|js)$/.test(e.name) && !/\.test\.mjs$/.test(e.name)) salida.push(p)
  }
  return salida
}

test('ningún servidor de orquestador/ escucha en 0.0.0.0 escrito a mano', async () => {
  const culpables = []
  for (const archivo of await archivosJs(RAIZ)) {
    const texto = await readFile(archivo, 'utf8')
    for (const [i, linea] of texto.split('\n').entries()) {
      if (/\.listen\s*\(/.test(linea) && /['"`]0\.0\.0\.0['"`]|['"`]::['"`]/.test(linea)) {
        culpables.push(`${path.relative(RAIZ, archivo)}:${i + 1}`)
      }
    }
  }
  assert.deepEqual(culpables, [], `escuchan en la red pública: ${culpables.join(', ')}`)
})

test('los dos servidores HTTP declaran su host y el default es loopback', async () => {
  const servidores = ['interactive-server.mjs', 'comunicacion/servidor-entrante.mjs']
  for (const rel of servidores) {
    const texto = await readFile(path.join(RAIZ, rel), 'utf8')
    const decl = texto.match(/const HOST = process\.env\.\w+ \?\? '([^']+)'/)
    assert.ok(decl, `${rel}: no declara un HOST configurable`)
    assert.equal(decl[1], '127.0.0.1', `${rel}: el default no es loopback`)
    assert.match(texto, /server\.listen\(PORT, HOST/, `${rel}: no escucha en el HOST que declara`)
  }
})
