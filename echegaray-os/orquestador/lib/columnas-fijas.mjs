// ¿QUIÉN SIGUE NOMBRANDO UNA COLUMNA DE COMPRAS O COBRANZAS POR SU LETRA? — el escaneo, puro.
//
// Existe por la inserción de «Obra» (Compras L, Cobranzas H, 14/09/2026): cada letra fija de esas
// pestañas pasa a apuntar a la columna de al lado. La regla nueva es que la letra sale del rótulo
// (`columnas-por-encabezado.mjs`). Este escaneo es lo que la hace cumplir: lo usa
// `columnas-fijas.test.mjs` (rojo si aparece un archivo NUEVO con letras fijas, o si uno pendiente
// suma más) y `scripts/columnas-fijas-inventario.mjs` (regenera la lista de pendientes).
//
// ═══ LO QUE DETECTA, Y LO QUE NO ═══
//
//   · letras  — un literal `Compras!O4`, `'Compras'!$AD$4:$AD`, `Cobranzas!A5:AA` en el CÓDIGO (los
//               comentarios de línea y de bloque se descartan). Incluye las fórmulas-texto.
//   · mapas   — tres o más valores de letra pelada (`monto: 'M'`) en un archivo que nombra la pestaña:
//               la forma de `CLAVE = { cliente: 'G', monto: 'M' }`, que arma `${pestana}!$${col}` y
//               que el primer detector no puede ver porque la letra no está al lado del `!`.
//   · indices — `f[14]`, `r?.[28]` en un archivo que nombra la pestaña. Heurístico: una fila leída de
//               OTRA pestaña también se indexa así. Por eso el test no exige cero: exige no crecer.
//
// NO detecta una letra calculada con aritmética (`letra(12)`) ni un rango armado en otra función: el
// inventario del 14/09 lo midió aparte y está en la lista con su grupo.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RAICES = ['orquestador', 'src', 'scripts']
const EXCLUIR = /(^|\/)(node_modules|\.next|datos|fixtures)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$|\.md$|\.json$/
const EXT = /\.(mjs|js|ts|tsx)$/

const RE_LETRA = /'?(?:Compras|Cobranzas|02_Cobranzas)'?!\$?[A-Z]{1,2}\$?\d*/g
const RE_NOMBRA = /['"`](?:Compras|Cobranzas|02_Cobranzas)['"`]|(?:Compras|Cobranzas)!/
const RE_MAPA = /\b\w+\s*:\s*'[A-Z]{1,2}'/g
const RE_INDICE = /\b(?:f|r|fila|row|crudo)\??\.?\[\s*\d{1,2}\s*\]/g

/** El código sin comentarios. Naive a propósito: descarta bloques `/* *\/` y las líneas `//`. */
export function sinComentarios(fuente) {
  return String(fuente)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
}

/** Lo que un archivo tiene: `{letras, mapas, indices}` (conteos). Pura. */
export function detectar(fuente) {
  const cod = sinComentarios(fuente)
  const letras = (cod.match(RE_LETRA) ?? []).length
  if (!RE_NOMBRA.test(cod)) return { letras, mapas: 0, indices: 0 }
  const mapas = (cod.match(RE_MAPA) ?? []).length
  return { letras, mapas: mapas >= 3 ? mapas : 0, indices: (cod.match(RE_INDICE) ?? []).length }
}

function* archivos(dir, base) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    const rel = relative(base, p)
    if (EXCLUIR.test(rel)) continue
    if (statSync(p).isDirectory()) yield* archivos(p, base)
    else if (EXT.test(n)) yield rel
  }
}

/** Todos los archivos con algo detectado, relativos a la raíz de la app. */
export function escanear(raiz) {
  const out = {}
  for (const r of RAICES) {
    let existe = true
    try { statSync(join(raiz, r)) } catch { existe = false }
    if (!existe) continue
    for (const rel of archivos(join(raiz, r), raiz)) {
      const d = detectar(readFileSync(join(raiz, rel), 'utf8'))
      if (d.letras || d.mapas || d.indices) out[rel] = d
    }
  }
  return out
}

/**
 * Contra la lista de pendientes: lo nuevo, lo que creció y lo que ya quedó limpio.
 * @param {Record<string,{letras:number,mapas:number,indices:number}>} vivo
 * @param {Record<string,{letras:number,mapas:number,indices:number}>} pendientes
 */
export function compararConPendientes(vivo, pendientes) {
  const nuevos = Object.keys(vivo).filter((f) => !pendientes[f])
  const crecieron = Object.entries(vivo).filter(([f, d]) => pendientes[f]
    && (d.letras > pendientes[f].letras || d.mapas > pendientes[f].mapas || d.indices > pendientes[f].indices)).map(([f]) => f)
  const limpios = Object.keys(pendientes).filter((f) => !vivo[f])
  return { nuevos, crecieron, limpios }
}
