// TODA ACCIÓN QUE REFRESCA LA FICHA DEL CLIENTE TAMBIÉN INVALIDA SU CACHÉ EN LA BASE.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Desde 20260913T1500 Dirección lee la ficha de `ficha_cliente_cache`. `revalidatePath('/clientes')`
// limpia la caché de Next y NO la de la base: una acción que escribe y sólo revalida deja a quien la
// usó mirando la ficha vieja hasta diez minutos. Se ve como un guardado que falló, y se carga dos
// veces. El defecto es silencioso por construcción —nada tira error—, así que la única guarda posible
// es ésta:
//
//   1 · cada función exportada que llama `revalidatePath('/clientes'…)` llama ANTES a
//       `invalidarFichaCliente(`;
//   2 · ningún archivo nuevo de `src/` revalida `/clientes` sin estar en una de las dos listas: una
//       acción agregada mañana en otro módulo cae acá en vez de pasar de largo.
//
// ═══ POR QUÉ LEE EL TEXTO ═══
//
// Las acciones importan por alias (`@/lib/supabase/server`) y `node --test` no lo resuelve: es el
// mismo motivo, y la misma técnica, que `fichaDeUnaConsulta.test.ts`.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url))

/** Escriben algo que `pantalla_cliente` publica: tienen que invalidar. */
const CUBIERTOS = [
  'src/features/clientes/services/actions.ts',
  'src/features/clientes/services/actionsDocumentos.ts',
  'src/features/clientes/services/esquemaActions.ts',
  'src/features/clientes/services/cuentaCorrienteActions.ts',
  'src/features/obras/services/actions.ts',
  'src/features/obras/services/actionsAlta.ts',
  'src/features/obras/services/actionsContrato.ts',
]

/** Revalidan `/clientes` y NO invalidan, cada una con su razón escrita. */
const EXCLUIDOS: Record<string, string> = {
  // `cliente_acceso` y la actividad del portal no viajan en `pantalla_cliente`: invalidar sólo
  // mandaría el próximo pedido al cálculo en vivo sin cambiar un dato.
  'src/features/clientes/services/accesosActions.ts': 'no escribe nada que la ficha publique',
  // Las ejecuta el CLIENTE desde el portal: `invalidar_ficha_cliente_cache` exige
  // `es_administracion()` y le contestaría que no. Lo cubre el vencimiento de 10 minutos, y la
  // pantalla dice de cuándo son los datos.
  'src/features/portal/services/portalActions.ts': 'la escribe un usuario del portal, sin permiso para invalidar',
}

const REVALIDA = /revalidatePath\(\s*'\/clientes'/

function funcionesExportadas(texto: string): { nombre: string; cuerpo: string }[] {
  const partes = texto.split(/(?=^export async function )/m).slice(1)
  return partes.map((p) => ({ nombre: /^export async function (\w+)/.exec(p)?.[1] ?? '?', cuerpo: p }))
}

function archivosTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name)
    if (e.isDirectory()) return archivosTs(ruta)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [ruta] : []
  })
}

test('cada acción que revalida la ficha del cliente invalida antes su caché en la base', () => {
  let revisadas = 0
  for (const archivo of CUBIERTOS) {
    for (const { nombre, cuerpo } of funcionesExportadas(readFileSync(RAIZ + archivo, 'utf8'))) {
      const i = cuerpo.search(REVALIDA)
      if (i < 0) continue
      revisadas++
      const j = cuerpo.indexOf('invalidarFichaCliente(')
      assert.ok(j >= 0 && j < i,
        `${archivo} · ${nombre}() revalida /clientes sin invalidar antes ficha_cliente_cache: `
        + 'Dirección vería la ficha vieja hasta 10 minutos después de guardar')
    }
  }
  // Un barrido que no encuentra ninguna acción no midió nada: se rompió el parser o se movieron.
  assert.ok(revisadas >= 20, `sólo encontré ${revisadas} acciones que revalidan /clientes`)
})

test('ningún archivo revalida /clientes sin estar declarado como cubierto o excluido', () => {
  const sueltos = archivosTs(join(RAIZ, 'src'))
    .map((ruta) => relative(RAIZ, ruta))
    .filter((ruta) => REVALIDA.test(readFileSync(RAIZ + ruta, 'utf8')))
    .filter((ruta) => !CUBIERTOS.includes(ruta) && !(ruta in EXCLUIDOS))
  assert.deepEqual(sueltos, [],
    'estos archivos revalidan /clientes y nadie decidió si invalidan la caché de la ficha')
})
