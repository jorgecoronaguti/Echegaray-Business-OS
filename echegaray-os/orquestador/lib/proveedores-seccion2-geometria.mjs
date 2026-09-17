// DÓNDE EMPIEZA Y TERMINA LA SECCIÓN «CON QUIÉN SE GASTA» — por su TÍTULO y por la geometría DECLARADA.
//
// ═══ POR QUÉ SALIÓ DEL SCRIPT (17/09/2026) ═══
//
// La fila de rótulos se buscaba como «la primera fila bajo el título cuyo texto contiene /PROVEEDOR/».
// Esa búsqueda tiene dos agujeros y los dos se pagaron el mismo día:
//
//   · Cuando la dinámica está en `#REF!` su ancla no dice «Proveedor», y la regex encuentra más abajo
//     «Resto de proveedores comerciales» o «TOTAL COMPRADO A PROVEEDORES COMERCIALES».
//   · La limpieza arranca EN la fila de rótulos, así que todo lo que queda entre el título y esa fila
//     sobrevive — incluida la dinámica de la corrida anterior.
//
// Resultado leído en la pestaña: tres dinámicas apiladas en A106, A108 y A110, cada una pisando el ancla
// de la siguiente, las tres en `#REF!`, y la sección sin pie ni total. La fila de rótulos no se adivina:
// la sección la declara (`aRotulos` en `lib/proveedores-titulos.mjs`), y todo desde ahí hasta la
// sección siguiente es de este generador.

import { filaDelSiguienteTitulo, ultimaConDato } from './proveedores-colchon.mjs'
import { esTituloDeSeccion, SECCIONES_DINAMICAS } from './proveedores-titulos.mjs'

const SECCION = SECCIONES_DINAMICAS.find((s) => s.clave === 'cuentaCorriente')

/**
 * @param {Array<Array<any>>} filas  la pestaña leída desde A1 (FORMATTED_VALUE)
 * @param {{log?:(s:string)=>void}} o
 * @returns {{filaTitulo:number, filaRotulos:number, filaLimite:number}}  base 1; `filaLimite` es la
 *          primera fila que ya NO es de esta sección.
 */
export function geometriaDeConcentracion(filas = [], { log = () => {} } = {}) {
  const t = (i) => String((filas[i] ?? [])[0] ?? '').trim()
  const i2 = filas.findIndex((_, i) => esTituloDeSeccion(t(i), 'cuentaCorriente'))
  if (i2 < 0) throw new Error('no encontré el título de la sección de concentración por proveedor')
  const filaTitulo = i2 + 1
  // ═══ CUANDO ES LA ÚLTIMA SECCIÓN, EL LÍMITE ES EL FIN DEL CONTENIDO (19/08/2026) ═══
  // Sin vecina abajo, el borde real es la última fila con contenido. Sin nada debajo del título, se
  // aborta: una sección sin una sola fila no es una sección última, es una lectura que salió mal.
  let filaLimite = filaDelSiguienteTitulo(filas, filaTitulo)
  if (!filaLimite) {
    const ultima = ultimaConDato(filas, { desde: i2 + 2, hasta: filas.length + 1 })
    if (!ultima) throw new Error('la sección de concentración por proveedor es la última y no tiene ni una fila debajo: no escribo')
    filaLimite = ultima + 1
    log(`  es la última sección de la pestaña: el límite es el fin del contenido, fila ${ultima}`)
  }
  const filaRotulos = filaTitulo + SECCION.aRotulos
  if (filaRotulos >= filaLimite) {
    throw new Error(`la fila de rótulos (${filaRotulos}) cae en la sección siguiente (${filaLimite}): no escribo`)
  }
  return { filaTitulo, filaRotulos, filaLimite }
}
