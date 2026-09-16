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
//                LETRA POR LETRA una opción del desplegable (contra `obra_canonica` leída de la base:
//                «OB-0002 · X» tiene forma de obra y no es ninguna). Ninguna se arregla sola.
//   diferir      el mundo todavía no permite escribir: la columna «Obra» no existe (la inserción no se
//                hizo), el layout no se puede resolver sin adivinar (rótulo repetido o faltante), o no
//                llegó el catálogo de obras. El cambio espera en `pendiente` con el motivo.
//
// ═══ POR QUÉ LA HUELLA ES LA CLAVE DEL COMPROBANTE Y NO EL ID ═══
//
// El «ID» de Compras es `=ROW()-4`: una posición. Si el dueño inserta una fila arriba entre que la app
// encola y el worker aplica, la fila N es otra compra y el ID sigue coincidiendo. La clave
// (`claveDeCompra`) sale de CUIT, tipo, número y proveedor, y se calcula acá con EL MISMO camino que
// usó el sync para escribir `compra_sheet.clave` (`contratoDeColumnas` → `filaACompra` →
// `claveDeCompra`): dos definiciones de «qué comprobante es éste» serían dos verdades.
//
// ═══ LA HUELLA DE RESPALDO: «proveedor|fecha|total(|concepto)» (15/09/2026) ═══
//
// 219 de las 960 filas de compra_sheet (medido el 15/09/2026) no tienen número de comprobante —subcontratistas,
// efectivo, sueldos, impuestos— y todas tienen proveedor;
// la RPC las encola con `clave` null. Rechazarlas por `sin_huella` dejaba a la app sin poder cambiar la
// obra de más de las tres cuartas partes de la pestaña; el 15/09 el dueño terminó escribiendo la L806
// a mano. Como hace Cobranzas con «comprobante|cliente|total», acá la identidad de una fila sin número
// es lo que `compra_sheet` dice de ESA fila —proveedor, fecha, total y, si lo hay, concepto— comparado
// contra la fila viva. El worker lee ese respaldo de la base al aplicar (`leerRespaldo`) y lo entrega
// como `respaldo`; este archivo sólo compara. Sin respaldo y sin clave, sigue siendo `sin_huella`.

import { letra } from './compras-columnas.mjs'
import { PRIMERA_FILA, claveDeCompra, contratoDeColumnas, filaACompra } from './compras-fila.mjs'
import { validarValorDeObra } from './obra-destino.mjs'

/** Lo que la celda dice, para comparar. Vacía y de espacios son lo mismo: no hay obra. */
export const normalizarCelda = (v) => String(v ?? '').trim()

export const rechazar = (motivo, detalle) => ({ accion: 'rechazar', motivo, detalle })
export const diferir = (motivo, detalle) => ({ accion: 'diferir', motivo, detalle })

/**
 * Resuelve el layout contra la fila de rótulos VIVA. Cualquier duda difiere: escribir en una columna
 * elegida a ciegas es imputar plata a una obra que nadie decidió.
 *
 * EXPORTADA desde el 16/09/2026 para que el bisturí de PAGOS use el mismo contrato de columnas. Ahí
 * `obra_celda` no hace falta, así que `exigirObra` lo hace opcional — lo demás es idéntico, y tiene
 * que serlo: dos lecturas del layout de la misma pestaña serían dos layouts.
 *
 * @returns {{idx?:Record<string,number>, decision?:object}}
 */
export function resolverLayout(encabezado, { exigirObra = true } = {}) {
  let idx
  try {
    idx = contratoDeColumnas(encabezado ?? [])
  } catch (e) {
    return { decision: diferir('layout_ambiguo', e.message) }
  }
  if (exigirObra && idx.obra_celda === undefined) {
    return { decision: diferir('sin_columna_obra', 'Compras no tiene la columna «Obra» en la fila de rótulos: no escribo en otra') }
  }
  return { idx }
}

/** Texto para comparar identidad: sin espacios de más ni mayúsculas. `texto()` del sync ya recortó los bordes. */
const mismoTexto = (a, b) => normalizarCelda(a).replace(/\s+/g, ' ').toLowerCase() === normalizarCelda(b).replace(/\s+/g, ' ').toLowerCase()

/** ¿El respaldo trae con qué identificar? Sin proveedor no hay huella: fecha y total solos son de cualquiera. */
export const respaldoUsable = (r) => Boolean(r && normalizarCelda(r.proveedor))

/**
 * La fila viva contra lo que `compra_sheet` dice de esa fila. `null` si coincide; si no, el detalle.
 * Un peso de tolerancia en el total: «Total» es `=Importe+IVA` y la cola binaria del flotante ya está medida.
 */
export function compararRespaldo(compra, respaldo, fila) {
  if (!mismoTexto(compra.proveedor, respaldo.proveedor)) {
    return `la fila ${fila} dice «${compra.proveedor ?? 'vacío'}» en Proveedor y compra_sheet tenía «${respaldo.proveedor}»`
  }
  if (normalizarCelda(compra.fecha) !== normalizarCelda(respaldo.fecha)) {
    return `la fila ${fila} tiene fecha ${compra.fecha ?? 'vacía'} y compra_sheet tenía ${respaldo.fecha ?? 'vacía'}`
  }
  const real = Number(compra.total)
  const esp = Number(respaldo.total)
  if (!Number.isFinite(real) || !Number.isFinite(esp) || Math.abs(real - esp) > 1) {
    return `la fila ${fila} tiene total ${compra.total ?? 'vacío'} y compra_sheet tenía ${respaldo.total ?? 'vacío'}`
  }
  if (normalizarCelda(respaldo.concepto) && !mismoTexto(compra.concepto, respaldo.concepto)) {
    return `la fila ${fila} dice «${compra.concepto ?? 'vacío'}» en Concepto y compra_sheet tenía «${respaldo.concepto}»`
  }
  return null
}

/**
 * ¿Es la misma compra que la pantalla vio? `null` si sí; si no, el rechazo.
 *
 * EXPORTADA desde el 16/09/2026: el bisturí de PAGOS prueba la identidad de la fila EXACTAMENTE
 * igual. Una segunda definición de «esta fila sigue siendo esta compra» sería la puerta por la que un
 * pago aterriza en la factura de otro proveedor.
 */
export function verificarHuella(compra, cambio, respaldo) {
  const esperada = cambio?.clave ?? null
  if (esperada) {
    const real = claveDeCompra(compra)
    if (real !== esperada) {
      return rechazar('huella_distinta', `la fila ${cambio.fila} es el comprobante «${real ?? 'sin clave'}» y se esperaba «${esperada}»`)
    }
  } else if (!respaldoUsable(respaldo)) {
    // Sin número de comprobante y sin respaldo de la base sólo quedaría el ID, que es una posición.
    return rechazar('sin_huella', `el cambio se encoló sin clave de comprobante y compra_sheet no tiene proveedor para la fila ${cambio?.fila}: no hay forma de probar que la fila es la misma compra`)
  } else {
    const distinta = compararRespaldo(compra, respaldo, cambio.fila)
    if (distinta) return rechazar('huella_distinta', distinta)
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
 * @param {{cambio:object, encabezado:any[], fila:any[], obras:object[], clienteAlias?:Map<string,string>, respaldo?:object|null}} p
 *   `fila` leída con UNFORMATTED_VALUE, como el sync · `obras` = filas de `obra_canonica` (id, codigo, nombre,
 *   cliente_texto, fusionada_en) · `clienteAlias` = normAlias(rótulo) → cliente canónico, para «Sin obra – X» con X
 *   canónico · `respaldo` = {proveedor, fecha (ISO), total, concepto, resincronizado} de `compra_sheet` para la fila,
 *   sólo mira cuando el cambio no trae `clave`
 */
export function planificarObra({ cambio, encabezado, fila, obras, clienteAlias, respaldo = null } = {}) {
  const n = Number(cambio?.fila)
  if (!Number.isInteger(n) || n < PRIMERA_FILA) {
    return rechazar('fila_invalida', `la fila ${cambio?.fila} no es un renglón de datos (empiezan en la ${PRIMERA_FILA})`)
  }
  // Sin catálogo no se sabe qué es válido, y rechazar sería TERMINAL por una lectura que faltó.
  if (!Array.isArray(obras) || !obras.length) {
    return diferir('sin_catalogo', 'no hay obras leídas de la base: no puedo validar el valor contra el desplegable')
  }
  const valor = normalizarCelda(cambio?.valor_nuevo)
  const invalido = validarValorDeObra(valor, obras, clienteAlias)
  if (invalido) return rechazar('valor_invalido', invalido)

  const { idx, decision } = resolverLayout(encabezado)
  if (decision) return decision

  const compra = filaACompra(fila ?? [], idx, n)
  if (!compra) return rechazar('fila_vacia', `la fila ${n} ya no tiene ID: no es una compra`)
  const huella = verificarHuella(compra, cambio, respaldo)
  if (huella) return huella
  // El espejo se reescribe entero desde el Sheet cada corrida del sync: si eso pasó DESPUÉS de encolar, el
  // respaldo ya no es lo que la pantalla vio sino una copia reciente del Sheet, y comparar Sheet contra
  // copia del Sheet prueba menos. No se rechaza —la fila, el proveedor, la fecha y el total siguen
  // coincidiendo—, pero queda dicho en el motivo con que se cierra.
  const nota = !cambio?.clave && respaldo?.resincronizado
    ? 'huella de respaldo tomada de compra_sheet resincronizado después del pedido' : undefined

  const actual = normalizarCelda(compra.obra_celda)
  if (actual === valor) return { accion: 'ya_aplicado', actual, nota }
  const esperado = normalizarCelda(cambio?.valor_anterior)
  if (actual !== esperado) {
    return rechazar('celda_cambio', `la celda Obra de la fila ${n} dice «${actual || 'vacía'}» y la pantalla vio «${esperado || 'vacía'}»: no la piso`)
  }
  return { accion: 'escribir', celda: `Compras!${letra(idx.obra_celda)}${n}`, valor, actual, nota }
}

/** ¿La relectura prueba la escritura? Compara texto contra texto, normalizado igual que el plan. */
export const relecturaConfirma = (leido, valor) => normalizarCelda(leido) === normalizarCelda(valor)
