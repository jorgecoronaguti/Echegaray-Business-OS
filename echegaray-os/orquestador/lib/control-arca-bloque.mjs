// EL BLOQUE "CONTROL CONTRA ARCA" QUE COMPARTEN MATERIALES, ESTRUCTURA Y RECURRENTES.
//
// Vive en lib/ y no en cada script por la razón de siempre: el mismo control tiene que significar lo
// mismo en las tres pestañas. Escrito tres veces, empieza a divergir — ya pasó con el cruce de ARCA,
// que estaba duplicado y una copia excluía las notas de crédito y la otra no.
//
// ═══ NI UN SOLO IMPORTE ESCRITO ═══
//
// Todas las líneas son fórmulas sobre dos pestañas réplica que el OS escribe desde Postgres:
// `_ARCA_RAW` (los comprobantes del libro de IVA, tal como ARCA los tiene) y `_CRUCE_ARCA` (una fila
// por discrepancia, con su comprobante y su monto). Se trae el INSUMO, no el RESULTADO: el día que se
// replique un mes nuevo, estas celdas se mueven solas.
//
// ═══ LA VENTANA TAMBIÉN ES UNA FÓRMULA ═══
//
// El primer impulso fue escribir "2026-01 a 2026-07" en el rótulo. Eso envejece igual que un importe
// pegado: se replica agosto y el control sigue diciendo que compara hasta julio, comparando de más.
// La ventana sale de `_ARCA_RAW`: primer día del mes del comprobante más viejo, último día del mes
// del más nuevo. Se estira sola.

// Sólo `R`: el total del libro NO se muestra en una vista parcial (ver bloqueControlArca), así que
// `IMPORTE` —la suma con signo de todo el libro— dejó de tener lugar acá. Y la línea "fuera de ARCA
// por naturaleza" (jornales, cargas sociales) tampoco: en una vista de un solo rubro sería el mismo
// número global repetido tres veces. Pertenece al control global, no a la vista.
import { R } from './arca-formula.mjs'

/** La pestaña de discrepancias. La escribe scripts/cruce-arca-pestana.mjs. */
export const C = '_CRUCE_ARCA'

/** Las columnas de `_CRUCE_ARCA`. El orden es contrato: estas fórmulas lo referencian. */
export const CC = { periodo: 'A', direccion: 'B', fecha: 'C', proveedor: 'D', cuit: 'E', comprobante: 'F', importe: 'G', rubro: 'H', fila: 'I', accion: 'J' }
export const CFILA0 = 4

/** Los dos valores de la columna "Dirección". Un typo acá deja una línea en cero sin dar error. */
export const DIR = Object.freeze({ arcaSinCompras: 'ARCA sin Compras', comprasSinArca: 'Compras sin ARCA' })

/** Columnas de Compras que este bloque mira. La fecha es la de FACTURA, nunca la de caja. */
const COL_FACTURA = 'Compras!$C$4:$C'
const COL_RUBRO = 'Compras!$AC$4:$AC'
const COL_TOTAL = 'Compras!$O$4:$O'

const rg = (col) => `${C}!$${col}$${CFILA0}:$${col}`

/** Primer día del mes más viejo que ARCA replicó en el libro de compras. */
export const DESDE = `EOMONTH(MINIFS(${R}!$C$4:$C;${R}!$B$4:$B;"Compras");-1)+1`
/** Último día del mes más nuevo. */
export const HASTA = `EOMONTH(MAXIFS(${R}!$C$4:$C;${R}!$B$4:$B;"Compras");0)`
/** ¿ARCA trajo algo? Sin esto no hay control posible y la pestaña tiene que decirlo. */
export const HAY_FUENTE = `COUNTIFS(${R}!$B$4:$B;"Compras")>0`

/** Compras del universo de la pestaña, por fecha de FACTURA y dentro de la ventana de ARCA. */
export function comprasDevengado(rubros) {
  return rubros
    .map((r) => `SUMIFS(${COL_TOTAL};${COL_RUBRO};"${r}";${COL_FACTURA};">="&${DESDE};${COL_FACTURA};"<="&${HASTA})`)
    .join('+')
}

/** Lo que este cuadro tiene cargado y ARCA no respalda, restringido a los rubros de la pestaña. */
export function sinRespaldo(rubros) {
  return rubros
    .map((r) => `SUMIFS(${rg(CC.importe)};${rg(CC.direccion)};"${DIR.comprasSinArca}";${rg(CC.rubro)};"${r}")`)
    .join('+')
}

/** Cuántas filas son — un monto sin cantidad no se puede salir a buscar. */
export function sinRespaldoN(rubros) {
  return rubros
    .map((r) => `COUNTIFS(${rg(CC.direccion)};"${DIR.comprasSinArca}";${rg(CC.rubro)};"${r}")`)
    .join('+')
}

/**
 * NÚCLEO PURO: el bloque entero, como filas de `[rótulo, fórmula, nota]`.
 *
 * @param {object} args
 * @param {string} args.titulo  el título de sección, con su número
 * @param {string[]} args.rubros  los rubros de Compras que esta pestaña cubre
 * @param {number} args.fila0  la fila REAL de la planilla donde va la primera fila del bloque —
 *   las fórmulas se referencian entre sí y una fila corrida las deja apuntando a otra cosa
 * @returns {(string|number)[][]}
 */
export function bloqueControlArca({ titulo, rubros, fila0 }) {
  const f = (n) => fila0 + n
  const filas = []
  filas.push([titulo])
  filas.push(['Mide SÓLO lo que esta pestaña lista, comprobante por comprobante contra el libro de ARCA. No compara totales: ARCA no trae rubro, así que su total es el de TODAS las compras y no el de esta vista. Por fecha de FACTURA, no de caja.'])
  filas.push([`="Ventana comparable · "&IF(${HAY_FUENTE};TEXT(${DESDE};"mmm yyyy")&" a "&TEXT(${HASTA};"mmm yyyy");"ARCA no replicó ningún comprobante")`])

  // ═══ LOS TRES NÚMEROS SON PARTICIONES DEL MISMO CONJUNTO ═══
  //
  // (respaldado) + (sin respaldo) = (lo que la vista lista). Exacto por construcción: las tres filas
  // salen de las MISMAS filas de Compras, separadas por si ARCA tiene o no su comprobante.
  //
  // Es el arreglo del defecto del 04/08. La versión anterior ponía acá "ARCA · libro de compras
  // $209.231.271" contra "Compras · lo de esta pestaña $5.638.835" y restaba: −$203.592.436 en
  // Recurrentes, que no era un agujero sino dos universos distintos. El total del libro NO vuelve a
  // aparecer en una vista parcial.
  filas.push(['Lo que esta pestaña lista, dentro de la ventana', `=${comprasDevengado(rubros)}`])
  filas.push(['· con su comprobante en el libro de ARCA', `=B${f(3)}-B${f(5)}`])
  filas.push(['· sin comprobante en el libro — incluye proveedores que no facturan, NO es error sin más',
    `=${sinRespaldo(rubros)}`])
  filas.push(['⇒ Cobertura fiscal de esta pestaña', `=IF(B${f(3)}=0;"";B${f(4)}/B${f(3)})`])

  // ═══ EL ÚNICO NÚMERO GLOBAL, Y VA REFERENCIADO — NO RECALCULADO ═══
  //
  // Un comprobante que Compras no cargó no tiene rubro todavía, así que NO se puede repartir entre las
  // vistas: es de Compras entera. Ese número ya existe y ya tiene nombre — `ARCA_FALTAN_MONTO`, que
  // publica Proveedores. Calcularlo de nuevo acá creaba una segunda cifra parecida con otro nombre
  // ($13.090.051 contra $13,8M), que es fuente garantizada de desconfianza. Una definición, una fuente.
  filas.push(['⚠ ARCA facturó y Compras NO lo tiene — de Compras ENTERA, no de esta pestaña', '=ARCA_FALTAN_MONTO'])

  // ═══ EL VEREDICTO ═══
  //
  // Tres estados, y el del medio es nuevo: MEDIDO. Lo que está sin respaldo en el libro NO lleva ✗
  // porque no se sabe cuánto de eso es carga incompleta y cuánto es un proveedor que no factura — los
  // tres mayores (Gerson Castro, Pedro Fredes, AGUERO) son del segundo tipo. Poner ✗ sobre una cifra
  // que se sabe inflada entrena al que la mira a ignorar el control, y ya pasó con los −$212M.
  //
  // Sin fuente NO hay ✓: afirmar que está todo bien justo cuando no se puede saber es el peor estado.
  filas.push([`=IF(NOT(${HAY_FUENTE});"⚠ NO PUEDO VERIFICAR — ARCA no replicó comprobantes: este control no afirma nada";IF(ROUND(B${f(5)};0)=0;"✓ todo lo que esta pestaña lista en la ventana tiene su comprobante en el libro de ARCA";"ⓘ "&TEXT(B${f(5)};"$#,##0")&" en "&${sinRespaldoN(rubros)}&" fila(s) sin comprobante en el libro ("&TEXT(1-B${f(6)};"0,0%")&" de esta pestaña) — cada una con su fila y su monto en ${C}. Falta distinguir en Compras qué proveedor no factura: hasta entonces esta cifra está inflada y no es una lista de errores."))`])
  return filas
}

/** Cuántas filas ocupa el bloque. Quien lo inserta necesita saberlo ANTES de armar la grilla. */
export const ALTO_BLOQUE = 9
