// QUÉ OBRAS TIENEN MATERIALES IMPUTADOS — la lista sale de los datos, nunca de una lista tipeada.
//
// ═══ EL DEFECTO, Y CÓMO LO ENCONTRÓ EL DUEÑO (04/08) ═══
//
// La sección "POR OBRA" de la pestaña Materiales tenía sus ocho columnas escritas a mano en el
// generador:
//
//     const obras = ['LA ESTRELLA', 'San Francisco', 'MESSINA', 'ARCOR', …]
//
// Entró un cliente nuevo —Quattropani · Melisa García SAS, $32.937.000 en tres comprobantes de
// Alumetal del 29/07— y NO APARECIÓ NUNCA. Su plata entraba igual al total por familia de la sección
// de arriba (esa sí sale de los datos), pero la columna de su obra no existía, así que el desglose
// por obra mostraba $32.937.000 menos que el cuadro de arriba. El dueño lo tuvo que pedir en vez de
// verlo aparecer, que es exactamente el trabajo que el OS existe para no hacerle hacer.
//
// LA PESTAÑA YA LO ESTABA GRITANDO. La columna "Control" marcaba $31.631.000 en "Chapa, perfiles y
// estructura metálica" y $32.937.000 en el TOTAL POR OBRA — el monto exacto de Quattropani. El
// control funcionaba; lo que faltaba era que la lista se derivara sola para que el control cerrara.
//
// ═══ POR QUÉ EL FILTRO ES POR RUBRO Y NO POR UNA LISTA NEGRA ═══
//
// La columna "Cliente / Asignación" de Compras (J) tiene 22 valores distintos, y varios no son obras
// sino destinos administrativos o contables: F931, Sueldos, UOCRA, IERIC, FCL, FODECO, Plan de pago,
// Crédito Prendario, Vehículos / Máquinas. Excluirlos por nombre sería una lista negra que hay que
// mantener a mano — el mismo defecto que estamos sacando, movido de lugar. El criterio correcto es el
// que ya usa el cuadro: si a esa asignación no se le imputó MATERIAL, no genera columna. Una
// asignación administrativa nunca tiene materiales; una obra nueva los tiene desde su primera compra.

import { netoDeFilaCruda } from './costo-materiales.mjs'

/**
 * NÚCLEO PURO: las obras que tienen materiales imputados, de mayor a menor monto.
 *
 * El orden por monto no es cosmético: la sección crece hacia la derecha y las obras que mueven la
 * plata tienen que quedar donde el ojo llega primero, sin scroll horizontal.
 *
 * EL MONTO QUE ORDENA ES EL MISMO QUE EL CUADRO MUESTRA (13/08/2026): el costo NETO de
 * `costo-materiales.mjs`. Ordenar por el total con IVA mientras las celdas muestran el neto es una
 * tercera medición del mismo concepto escondida en el orden de las columnas — la misma clase de
 * divergencia que este arreglo cierra, sólo que invisible.
 *
 * @param {any[][]} filas filas crudas de Compras (sin encabezado)
 * @param {object} opts
 * @param {string[]} opts.rubros los rubros que llevan familia de material
 * @param {(v:any)=>number} opts.monto parser de importe (es-AR)
 * @param {number} [opts.colObra] índice 0-based de "Cliente / Asignación" (J = 9)
 * @param {number} [opts.colRubro] índice 0-based de "Rubro de caja" (AC = 28)
 * @param {number} [opts.colNeto] índice 0-based de "Importe" (M = 12)
 * @param {number} [opts.colIva] índice 0-based de "IVA" (N = 13)
 * @param {number} [opts.colTotal] índice 0-based de "Total" (O = 14)
 * @returns {string[]} nombres EXACTOS como están en Compras
 */
export function obrasConMateriales(filas = [], { rubros = [], monto, colObra = 9, colRubro = 28, colNeto = 12, colIva = 13, colTotal = 14 } = {}) {
  const conjunto = new Set(rubros.map((r) => String(r).trim().toLowerCase()))
  const acumulado = new Map()
  for (const f of filas) {
    if (!conjunto.has(String(f?.[colRubro] ?? '').trim().toLowerCase())) continue
    // El nombre se guarda EXACTO como está en Compras —"MESSINA", no "MESSINAS"— porque es el criterio
    // literal del SUMIFS. Se agrupa sin distinguir mayúsculas (SUMIFS tampoco distingue) y gana la
    // primera grafía vista, para no partir "Taller" y "TALLER" en dos columnas que suman lo mismo.
    const crudo = String(f?.[colObra] ?? '').trim()
    if (!crudo) continue
    const k = crudo.toLowerCase()
    const ya = acumulado.get(k) ?? { nombre: crudo, total: 0 }
    ya.total += netoDeFilaCruda(f, { monto, colNeto, colIva, colTotal }) || 0
    acumulado.set(k, ya)
  }
  return [...acumulado.values()]
    // Desempate por nombre: sin él, dos obras con el mismo total salen en un orden que cambia entre
    // corridas y la pestaña muestra un diff que no corresponde a ningún cambio de negocio.
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'))
    .map((o) => o.nombre)
}
