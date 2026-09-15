// EL BISTURÍ SOBRE LA COLUMNA «OBRA» DE COMPRAS — qué celda, qué valor, y cuándo NO escribir.
//
// Núcleo puro, hermano de `portal/bisturi-cobranzas.mjs`: entra la fila de rótulos y la fila de datos
// tal como se leyeron, y el cambio que la app encoló en `compra_obra_cambio`; sale UNA decisión. No
// toca Google ni Postgres. Todo lo peligroso vive acá para poder probarlo sin acercarse al Sheet real.
//
// ═══ LAS CUATRO DECISIONES ═══
//
//   escribir     la fila es la misma compra, la celda dice lo que la pantalla vio, y el valor es del
//                desplegable. Se escribe UNA celda: la columna «Obra» de esa fila.
//   ya_aplicado  la celda YA dice lo pedido. Es el reintento de una escritura que aterrizó y cuyo cierre
//                se perdió (el worker murió entre escribir y marcar): se cierra sin volver a escribir.
//   rechazar     TERMINAL. La fila es otra compra, la celda cambió desde que se miró, o el valor no es
//                del desplegable. Ninguna de las tres se arregla sola en el intento siguiente.
//   diferir      el mundo todavía no permite escribir: la columna «Obra» no existe (la inserción no se
//                hizo) o el layout no se puede resolver sin adivinar (rótulo repetido o faltante). Lo
//                arregla una persona en el Sheet; el cambio espera en `pendiente` con el motivo.
//
// ═══ POR QUÉ LA HUELLA ES LA CLAVE DEL COMPROBANTE Y NO EL ID ═══
//
// El «ID» de Compras es `=ROW()-4`: una posición. Si el dueño inserta una fila arriba entre que la app
// encola y el worker aplica, la fila N es otra compra y el ID sigue coincidiendo. La clave
// (`claveDeCompra`) sale de CUIT, tipo, número y proveedor, y se calcula acá con EL MISMO camino que
// usó el sync para escribir `compra_sheet.clave` (`contratoDeColumnas` → `filaACompra` →
// `claveDeCompra`): dos definiciones de «qué comprobante es éste» serían dos verdades.

import { letra } from './compras-columnas.mjs'
import { PRIMERA_FILA, claveDeCompra, contratoDeColumnas, filaACompra } from './compras-fila.mjs'
import { leerCeldaObra } from './obra-destino.mjs'

/** Lo que la celda dice, para comparar. Vacía y de espacios son lo mismo: no hay obra. */
export const normalizarCelda = (v) => String(v ?? '').trim()

const rechazar = (motivo, detalle) => ({ accion: 'rechazar', motivo, detalle })
const diferir = (motivo, detalle) => ({ accion: 'diferir', motivo, detalle })

/**
 * Resuelve el layout contra la fila de rótulos VIVA. Cualquier duda difiere: escribir en una columna
 * elegida a ciegas es imputar plata a una obra que nadie decidió.
 * @returns {{idx?:Record<string,number>, decision?:object}}
 */
function resolverLayout(encabezado) {
  let idx
  try {
    idx = contratoDeColumnas(encabezado ?? [])
  } catch (e) {
    return { decision: diferir('layout_ambiguo', e.message) }
  }
  if (idx.obra_celda === undefined) {
    return { decision: diferir('sin_columna_obra', 'Compras no tiene la columna «Obra» en la fila de rótulos: no escribo en otra') }
  }
  return { idx }
}

/** ¿Es la misma compra que la pantalla vio? `null` si sí; si no, el rechazo. */
function verificarHuella(compra, cambio) {
  const esperada = cambio?.clave ?? null
  if (!esperada) {
    // Sin número de comprobante no hay identidad: sólo quedaría el ID, que es una posición.
    return rechazar('sin_huella', 'el cambio se encoló sin clave de comprobante: no hay forma de probar que la fila es la misma compra')
  }
  const real = claveDeCompra(compra)
  if (real !== esperada) {
    return rechazar('huella_distinta', `la fila ${cambio.fila} es el comprobante «${real ?? 'sin clave'}» y se esperaba «${esperada}»`)
  }
  const idEsperado = cambio?.sheet_id
  if (idEsperado !== null && idEsperado !== undefined && compra.sheet_id !== Number(idEsperado)) {
    return rechazar('huella_distinta', `la fila ${cambio.fila} tiene ID ${compra.sheet_id} y se esperaba ${idEsperado}`)
  }
  return null
}

/**
 * EL PLAN. Devuelve `{accion, celda?, valor?, actual?, motivo?, detalle?}`.
 *
 * El orden es la garantía: primero que el valor sea legítimo, después que el layout se entienda,
 * después que la fila sea la misma compra, y recién ahí qué dice la celda. Mirar la celda de una fila
 * que no es la misma compra respondería una pregunta sobre otra plata.
 *
 * @param {{cambio:object, encabezado:any[], fila:any[]}} p `fila` leída con UNFORMATTED_VALUE, como el sync
 */
export function planificarObra({ cambio, encabezado, fila } = {}) {
  const n = Number(cambio?.fila)
  if (!Number.isInteger(n) || n < PRIMERA_FILA) {
    return rechazar('fila_invalida', `la fila ${cambio?.fila} no es un renglón de datos (empiezan en la ${PRIMERA_FILA})`)
  }
  const valor = normalizarCelda(cambio?.valor_nuevo)
  if (leerCeldaObra(valor).tipo === 'invalida') {
    return rechazar('valor_invalido', `«${valor.slice(0, 60)}» no es una opción del desplegable de Obra`)
  }

  const { idx, decision } = resolverLayout(encabezado)
  if (decision) return decision

  const compra = filaACompra(fila ?? [], idx, n)
  if (!compra) return rechazar('fila_vacia', `la fila ${n} ya no tiene ID: no es una compra`)
  const huella = verificarHuella(compra, cambio)
  if (huella) return huella

  const actual = normalizarCelda(compra.obra_celda)
  if (actual === valor) return { accion: 'ya_aplicado', actual }
  const esperado = normalizarCelda(cambio?.valor_anterior)
  if (actual !== esperado) {
    return rechazar('celda_cambio', `la celda Obra de la fila ${n} dice «${actual || 'vacía'}» y la pantalla vio «${esperado || 'vacía'}»: no la piso`)
  }
  return { accion: 'escribir', celda: `Compras!${letra(idx.obra_celda)}${n}`, valor, actual }
}

/** ¿La relectura prueba la escritura? Compara texto contra texto, normalizado igual que el plan. */
export const relecturaConfirma = (leido, valor) => normalizarCelda(leido) === normalizarCelda(valor)
