// LA OBRA SE IMPUTA DESDE LA FICHA DEL PROVEEDOR, CON EL MISMO CONTROL QUE COMPRAS.
//
// El dueño, 15/09/2026: «compras imputadas al centavo a cada obra en app.ecsas.com.ar y también en
// Proveedores». Quien revisa las facturas de un proveedor las mira acá; mandarlo a otra pantalla a
// imputarlas es el paso que hace que queden sin imputar.
//
// ═══ POR QUÉ SE PRUEBA SOBRE EL FUENTE ═══
//
// Mismo método que `compras-obra-en-linea.test.ts`, que prueba lo mismo del otro lado: lo que se
// protege son DECISIONES ESCRITAS —qué componente dibuja la obra, por qué puerta escribe, qué se
// revalida— y no un comportamiento de render. Lo que un navegador probaría (que el desplegable se
// vea y guarde) queda declarado como NO cubierto acá.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = dirname(fileURLToPath(import.meta.url))
const sinComentarios = (texto: string) => texto
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('//'))
  .join('\n')
const fuente = (a: string) => sinComentarios(readFileSync(join(DIR, a), 'utf8'))

test('la fila del proveedor usa el MISMO ObraEnLinea de Compras, no un control propio', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Un segundo control acá sería una segunda definición de qué obra es válida y de cómo se escribe:
  // la primera que se desincronice deja la ficha ofreciendo algo que el worker rechaza al escribir
  // la celda del Sheet, y nadie se entera hasta que el Sheet no cambia.
  const fila = fuente('FilaComprobanteProveedor.tsx')
  assert.match(fila, /import \{ ObraEnLinea \} from '\.\.\/ObraEnLinea'/, 'la ficha volvió a tener su propio control de obra')
  assert.match(fila, /celda=\{c\.obra\.celda\}/, 'el control dejó de recibir la celda: sin ella no hay control optimista')
  assert.match(fila, /inferida=\{c\.obra\.origen === 'inferida'\}/, 'una obra adivinada volvió a dibujarse como una decidida')
  for (const puerta of ['fetch(', 'createClient', "from('compra_sheet')"]) {
    assert.equal(fila.includes(puerta), false, `la fila del proveedor abrió su propia puerta a la base: ${puerta}`)
  }
})

test('el cambio refresca la ficha donde se hizo, no sólo la pantalla de Compras', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // `revalidatePath('/administracion/compras')` no toca la caché de la ficha del proveedor: la fila
  // se guardaba bien y volvía a dibujarse con la obra VIEJA debajo de su propio ✓. Una pantalla que
  // desmiente su acuse es peor que una que no acusa.
  assert.match(fuente('FilaComprobanteProveedor.tsx'), /revalidarProveedor=\{proveedorId\}/, 'la fila dejó de pedir que se refresque su ficha')
  const accion = fuente('../../services/obraDeCompraActions.ts')
  assert.match(accion, /revalidatePath\(`\/administracion\/proveedores\/\$\{p\.data\.proveedorId\}`\)/, 'la acción dejó de revalidar la ficha del proveedor')
  // Y LA RUTA NO LA ELIGE QUIEN LLAMA: llega un uuid validado, no una ruta cruda.
  assert.match(accion, /proveedorId: z\.string\(\)\.uuid\(\)/, 'la acción acepta cualquier cosa como proveedor: se puede pedir invalidar cualquier ruta')
})

test('sin opciones de obra el desplegable NO se habilita', () => {
  // Un desplegable vacío deja elegir «sin imputar» y nada más: una forma de borrar la obra sin poder
  // ponerle otra. Pasa si `getOpcionesDeObra` falla, que es justo cuando menos hay que dejar tocar.
  const lista = fuente('ComprasDelProveedor.tsx')
  assert.match(lista, /obraEditable=\{obraEditable && opcionesObra\.length > 0\}/, 'la ficha habilita el desplegable aunque no tenga qué ofrecer')
  assert.match(lista, /const \{ filas, truncado, papelesSinLeer, obraEditable \} = lectura\.data/, 'la lista dejó de mirar si la base publica la columna Obra')
})

test('las opciones salen de la MISMA función que las de Compras', () => {
  const pagina = fuente('../../../../app/(main)/administracion/proveedores/[proveedor]/page.tsx')
  assert.match(pagina, /getOpcionesDeObra\(supabase\)/, 'la ficha arma su propia lista de obras válidas')
  assert.match(
    pagina, /from '@\/features\/administracion\/services\/obraDeCompraService'/,
    'las opciones dejaron de salir del servicio que también usa Compras',
  )
})
