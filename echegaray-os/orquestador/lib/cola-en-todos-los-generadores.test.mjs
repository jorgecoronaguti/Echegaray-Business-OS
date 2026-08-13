// EL DEFECTO NO SE ARREGLA EN UN GENERADOR: SE ARREGLA EN LA CLASE.
//
// POR QUÉ EXISTE (13/08). La regla "el generador es dueño de todo su rango" estaba escrita desde el
// 31/07 y se aplicaba a medias: de veinte escritores, cinco limpiaban su cola —cada uno con su copia
// del mismo bucle— y quince no. Nadie lo sabía porque no había una sola prueba que lo mirara, y el
// día que OBRAS cambió de tamaño el dueño vio el resultado antes que ningún control.
//
// Este test no prueba un caso: prueba que NINGÚN escritor de pestañas queda sin un mecanismo de cola.
// El que agregue el escritor número veintiuno se entera acá, no en el PDF del archivo del dueño.
//
// Se pone rojo si: (a) un generador nuevo escribe con `escribirPreservando` y no declara cómo limpia
// su cola, o (b) una excusa de la lista de abajo deja de tener sentido porque ese archivo ya no
// escribe. Una lista de excepciones que nadie revisa se convierte en la regla.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const CARPETAS = [RAIZ, join(RAIZ, '..', 'scripts')]

/**
 * LOS QUE NO USAN `cola-de-rango.mjs`, Y POR QUÉ. Cada excusa dice qué mecanismo usa en su lugar o
 * por qué no le hace falta — con el hecho medido, no con una opinión.
 */
const CON_OTRO_MECANISMO = {
  'caja-pestana.mjs':
    'barre la cola con `rellenoDeCola` + el registro de rótulos, que es la versión con PRUEBA de propiedad: '
    + 'la portada nueva son 20 filas y la pestaña traía 37 (condición D3 del auditor de CAJA).',
  'cheques-cobertura-sheet.mjs':
    'su bloque es lo ÚLTIMO de la pestaña y barre desde el fin del bloque hasta la última fila con contenido, '
    + 'con una escritura propia POSTERIOR a la fusión.',
  'parametros-inflacion.mjs':
    'escribe un bloque en el medio de otra pestaña: su cola se mide contra `largoPrevio` del bloque ubicado, '
    + 'no contra el fin de la pestaña.',
  'cash-flow-vistas.mjs':
    '`rectangulo(filas, VACIO, footprint)` es el modo de dimensiones declaradas con otro nombre: la vista se '
    + 'escribe siempre completa hasta su footprint. La pestaña de Presupuesto es de alto fijo (12 meses) y su '
    + 'ancho nunca cambió (4 desde el 05/08).',
  'espejo-jornales.mjs':
    'medido: su cola YA se detecta sola. Compara origen contra espejo después de escribir y termina en rojo si '
    + 'difieren — así se descubrió la fila Z519 de "Obreros 26" que sobrevivía. Se escribe en tramos de 200 filas '
    + 'con `fila0` variable, así que el barrido por grilla no aplica sin rehacer el bucle: se deja como está y se '
    + 'declara, en vez de tocar a ciegas un espejo que no puedo verificar contra el archivo real.',
  'estructura-pestana.mjs':
    'medido en la historia del repo: alto FIJO —los rubros salen de `SUBRUBROS`, 7 desde el 21/07— y ancho 32 '
    + 'desde el primer commit. Nunca cambió de tamaño: agregarle un barrido sería riesgo sin defecto que curar.',
  'resumen-pestana.mjs':
    'medido: alto fijo (la grilla no recorre ningún dato) y ancho 3 desde el 22/07, sin un solo cambio.',
  'cobranzas-por-cliente.mjs':
    'medido: alto fijo por `CAPACIDAD` (25 desde el 21/07) y 8 columnas desde el primer commit. Además su lista '
    + 'de clientes es UNA fórmula que derrama: escribir algo debajo la cortaría con #REF!.',
}

/** Los archivos que llaman a `escribirPreservando(` de verdad — no los que lo nombran en un comentario. */
function escritores() {
  const out = []
  for (const dir of CARPETAS) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.mjs') || f.endsWith('.test.mjs')) continue
      const src = readFileSync(join(dir, f), 'utf8')
      // El portón se define a sí mismo con esa firma: no es un generador.
      if (/export async function escribirPreservando/.test(src)) continue
      if (/escribirPreservando\(\s*google/.test(src)) out.push({ f, src })
    }
  }
  return out
}

test('todo generador que escribe una pestaña declara cómo limpia su cola', () => {
  const sinMecanismo = []
  for (const { f, src } of escritores()) {
    // `conColaLimpiable(` cuenta: OBRAS lo llama a través de su propia lib, que delega en ésta.
    const usaLib = /cola-de-rango\.mjs|conColaLimpiable\(/.test(src)
    const excusa = CON_OTRO_MECANISMO[f]
    if (!usaLib && !excusa) sinMecanismo.push(f)
  }
  assert.deepEqual(sinMecanismo, [],
    'Estos escriben una pestaña y no limpian su cola. Si la grilla se achica, la corrida anterior queda '
    + 'publicada al lado o abajo. Usá lib/cola-de-rango.mjs, o agregá el archivo a CON_OTRO_MECANISMO '
    + 'diciendo QUÉ mecanismo usa y con qué evidencia.')
})

test('la lista de excusas no envejece: cada una es de un archivo que sigue escribiendo', () => {
  const escriben = new Set(escritores().map((x) => x.f))
  const muertas = Object.entries(CON_OTRO_MECANISMO)
    .filter(([f]) => !escriben.has(f))
    .map(([f]) => f)
  assert.deepEqual(muertas, [],
    'Estas excusas son de archivos que ya no llaman a escribirPreservando: sacalas, o la lista deja de '
    + 'decir algo y el próximo generador se cuela por ahí.')
})

test('los cinco que ya tenían el mecanismo copiado ahora usan el compartido', () => {
  // Cada uno de éstos tenía su propia copia del mismo bucle de doce líneas. Si alguien vuelve a
  // copiarlo en vez de usar la lib, este test se pone rojo y la deriva no arranca de nuevo.
  const unificados = ['banco-raw-pestana.mjs', 'cheques-raw-pestana.mjs', 'cargas-sociales-pestana.mjs',
    'jornales-pestana.mjs', 'impuestos-pestana.mjs']
  for (const { f, src } of escritores()) {
    if (!unificados.includes(f)) continue
    assert.match(src, /cola-de-rango\.mjs/, `${f} tiene que usar el mecanismo compartido`)
    assert.doesNotMatch(src, /ultimaConDato|let ultima = 0/, `${f} volvió a copiar el bucle de la cola`)
  }
})
