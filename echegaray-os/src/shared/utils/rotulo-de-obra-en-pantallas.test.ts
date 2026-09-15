// «OB-0012 · NOMBRE» EN TODA LA APP, ARMADO EN UN SOLO LUGAR (dueño, 14/09/2026).
//
// Test de fuente: cada pantalla de la lista tiene que pasar el nombre de la obra por `rotuloDeObra`
// —directo, o por un servicio que lo usa—. Si alguien vuelve a dibujar `obra.nombre` crudo en una de
// ellas y saca el helper, se pone rojo. Además nadie puede declarar otro `rotuloDeObra` (ya existió uno
// local en la ficha de la persona) y el portal del cliente no muestra el código hasta que el dueño lo
// decida.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('../../', import.meta.url).pathname
const leer = (ruta: string) => readFileSync(join(SRC, ruta), 'utf8')

/** Pantalla · archivo donde se arma su rótulo · con qué. */
const PANTALLAS: [string, string, string][] = [
  ['Obras · cartera y buscador', 'features/obras/components/CarteraObras.tsx', 'rotuloDeObra('],
  ['Obras · cabecera de la ficha (workspace, cronograma, dotación, subcontratos, avance)', 'features/obras/components/CabeceraDeObra.tsx', 'rotuloDeObra('],
  ['Jefe · selector de obra', 'features/jefe/components/SelectorObra.tsx', 'rotuloDeObra('],
  ['Horas · grilla de asistencia de la quincena y su selector', 'features/administracion/components/BloqueAsistenciaQuincena.tsx', 'rotuloDeObra('],
  ['Horas · filtro de obras del día', 'features/administracion/services/presenciaService.ts', 'rotuloDeObra('],
  ['Horas · en obra ahora (grupos por obra)', 'features/administracion/services/asistenciaDelDia.ts', 'rotuloDeObra('],
  ['Campo · elegir obra', 'app/campo/datos.ts', 'rotuloDeObra('],
  ['Liquidación · horas por obra de la persona', 'features/administracion/services/hhPersonaService.ts', 'rotuloDeObra('],
  ['Liquidación · obras de la persona', 'features/administracion/services/obrasDePersona.ts', 'rotuloDeObra('],
  ['Clientes · lista de obras de la ficha', 'app/(main)/clientes/[cliente]/page.tsx', 'rotuloDeObra('],
  ['Clientes · cuenta corriente, esquema y accesos', 'features/clientes/services/nombresDeObra.ts', 'rotuloDeObra('],
  ['Compras · columna Obra', 'app/(main)/administracion/compras/page.tsx', 'nombresDeObra('],
  ['Compras · obra de cada fila de la pestaña', 'features/administracion/services/obraDeCompraService.ts', 'nombresDeObra('],
  ['Compras · desplegable de Obra del panel', 'features/administracion/services/obraDeCompra.ts', 'rotuloDeObra('],
  // Sumadas el 15/09/2026, cuando el dueño vio «Identificador: quattropani» en la ficha del cliente
  // y pidió revisar TODO lugar que muestre un identificador de obra o de cliente.
  ['Proveedores · columna Obra de sus compras', 'features/administracion/services/comprobantesProveedorService.ts', 'nombresDeObra('],
  ['Herramientas, pedidos y movimientos · columna Obra', 'features/integraciones/services/operacionGlobalService.ts', 'rotuloDeObra('],
  ['Obras · alta en pasos (cabecera y ficha del paso 1)', 'app/(main)/obras/nueva/page.tsx', 'rotuloDeObra('],
  ['Usuarios · a qué obra entra cada uno, y el catálogo para asignar', 'features/usuarios/services/usuariosService.ts', 'rotuloDeObra('],
]

const IMPORTA = /import \{[^}]*\b(rotuloDeObra|nombresDeObra)\b[^}]*\} from '[^']*(shared\/utils\/obra|clientes\/services\/nombresDeObra)(\.ts)?'/

for (const [pantalla, archivo, via] of PANTALLAS) {
  test(`${pantalla}: el rótulo de obra sale de rotuloDeObra`, () => {
    const fuente = leer(archivo)
    assert.match(fuente, IMPORTA, `${archivo} no importa el helper único`)
    const usos = fuente.split(via).length - 1
    assert.ok(usos >= 1, `${archivo} importa pero no usa ${via.slice(0, -1)}: el nombre se dibuja crudo`)
  })
}

const archivos = (dir: string): string[] =>
  readdirSync(join(SRC, dir), { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => join(dir, f))

test('hay UN solo rotuloDeObra: nadie arma «código · nombre» por su cuenta', () => {
  const otros = archivos('.').filter((f) => f !== join('.', 'shared/utils/obra.ts'))
    .filter((f) => /(function|const)\s+rotuloDeObra\b/.test(leer(f)))
  assert.deepEqual(otros, [])
})

test('el portal del cliente NO muestra el código interno hasta que el dueño lo decida', () => {
  const conCodigo = [...archivos('app/portal'), ...archivos('features/portal')]
    .filter((f) => /\b(rotuloDeObra|codigosDeObra)\b|\bcodigo\b.*obra_canonica|obra_canonica.*\bcodigo\b/.test(leer(f)))
  assert.deepEqual(conCodigo, [])
})
