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
import { ALERTA } from './glifos.mjs'

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
  // LA FILA SE PIDE POR SU NOMBRE, NO POR UN NÚMERO. Decía `f(3)`, `f(4)`, `f(5)`, `f(6)`: los mismos
  // desplazamientos que `FILA_BLOQUE` declara abajo, tipeados otra vez acá. Sacar una fila del bloque
  // obligaba a encontrar los cuatro y a acertarlos; con el nombre, se mueven solos.
  const f = (n) => fila0 + n
  const filas = []
  filas.push([titulo])
  // ═══ LA BAJADA DE 230 CARACTERES SE FUE AL CÓDIGO (06/09/2026) ═══
  //
  // Decía: «Mide SÓLO lo que esta pestaña lista, comprobante por comprobante contra el libro de ARCA.
  // No compara totales: ARCA no trae rubro, así que su total es el de TODAS las compras y no el de
  // esta vista. Por fecha de FACTURA, no de caja.» Es exactamente lo que el dueño mandó sacar el
  // 05/09 —«minimalismo extremo, sin aclaraciones ni explicaciones de nada»— y lo que el contrato
  // prohíbe en su regla 10.
  //
  // LO QUE DECÍA NO SE PIERDE, Y NO HACE FALTA QUE ESTÉ EN LA PESTAÑA: que el control mide sólo esta
  // vista ya lo dice el rótulo «Lo que esta pestaña lista»; que no compara totales lo hace cierto la
  // construcción (las tres líneas son particiones del mismo conjunto, y el total del libro no vuelve
  // a aparecer en una vista parcial desde el 04/08); y que la fecha es la de FACTURA vive en
  // `comprasDevengado`, con su test. El párrafo repetía en palabras lo que el cuadro ya hace.
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
  filas.push(['· con su comprobante en el libro de ARCA', `=B${f(FILA_BLOQUE.universo)}-B${f(FILA_BLOQUE.sinRespaldo)}`])
  // EL RÓTULO NOMBRA LA LÍNEA Y NO LA DEFIENDE. Llevaba pegado «— incluye proveedores que no facturan,
  // NO es error sin más»: 88 caracteres para un rótulo, y un argumento. Que la cifra está inflada lo
  // dice el veredicto del pie con su ⓘ, que es donde se lee el estado del control.
  filas.push(['· sin comprobante en el libro de ARCA', `=${sinRespaldo(rubros)}`])
  filas.push(['⇒ Cobertura fiscal de esta pestaña',
    `=IF(B${f(FILA_BLOQUE.universo)}=0;"";B${f(FILA_BLOQUE.conRespaldo)}/B${f(FILA_BLOQUE.universo)})`])

  // ═══ EL ÚNICO NÚMERO GLOBAL, Y VA REFERENCIADO — NO RECALCULADO ═══
  //
  // Un comprobante que Compras no cargó no tiene rubro todavía, así que NO se puede repartir entre las
  // vistas: es de Compras entera. Ese número ya existe y ya tiene nombre — `ARCA_SIN_CARGAR_MONTO`, que
  // publica Proveedores. Calcularlo de nuevo acá creaba una segunda cifra parecida con otro nombre
  // ($13.090.051 contra $13,8M), que es fuente garantizada de desconfianza. Una definición, una fuente.
  //
  // ═══ Y UN LECTOR QUE CONFÍA A CIEGAS PUBLICA LO QUE HAYA (15/08/2026) ═══
  //
  // MEDIDO EN EL ARCHIVO VIVO, hoy: `Materiales!B53` tiene esta fórmula y muestra `"0010-00000001"`
  // —un número de comprobante— porque `ARCA_SIN_CARGAR_MONTO` quedó anclado en `Proveedores!C144`, una
  // celda del layout anterior. La celda de al lado promete plata y publica un comprobante.
  //
  // La causa se cura en `lib/rangos-nombrados.mjs` (el nombre se reapunta o se retira) y esto es la
  // otra mitad, que hace falta igual: mientras el nombre exista apuntando a cualquier lado, el que lo
  // cita pelado publica lo que haya. `Proveedores!G11` —el ÚNICO otro lector— ya lleva esta guarda
  // desde el 14/08 y por eso hoy muestra "—" en vez del comprobante: el mismo nombre roto, dos
  // lectores, y sólo uno defendido. Un dato de otra especie dibujado como plata no se ve; un "—" sí.
  //
  // `IFERROR` cubre el nombre retirado (#NAME?) e `ISNUMBER`, el nombre vivo apuntando a basura.
  // «de Compras ENTERA, no de esta pestaña» era la glosa que defendía el número; «· Compras entera» es
  // su DIMENSIÓN, que es lo que el contrato pide al lado del concepto. Dice lo mismo y no argumenta.
  // ═══ VIVA, NO UN NOMBRE QUE APUNTA A UN BLOQUE MUERTO (09/09/2026) ═══
  //
  // Leía `ARCA_SIN_CARGAR_MONTO`, un rango con nombre que apuntaba a `Proveedores!C184`: una celda
  // de la capa fósil del generador retirado el 14/08, congelada en $2.319.107 desde ese día. Hoy esa
  // capa se borró con la firma del dueño y el nombre queda en #REF!. La cifra sale de la réplica que
  // el OS escribe en cada corrida —`_CRUCE_ARCA`, dirección «ARCA sin Compras», todos los rubros—,
  // que es la misma fuente de las dos filas de arriba. Sin fuente replicada, «—».
  filas.push([`${ALERTA} ARCA facturó y Compras no lo tiene · Compras entera`,
    `=IF(NOT(${HAY_FUENTE});"—";SUMIFS(${rg(CC.importe)};${rg(CC.direccion)};"${DIR.arcaSinCompras}"))`])

  // ═══ EL VEREDICTO ═══
  //
  // Tres estados, y el del medio es nuevo: MEDIDO. Lo que está sin respaldo en el libro NO lleva ✗
  // porque no se sabe cuánto de eso es carga incompleta y cuánto es un proveedor que no factura — los
  // tres mayores (Gerson Castro, Pedro Fredes, AGUERO) son del segundo tipo. Poner ✗ sobre una cifra
  // que se sabe inflada entrena al que la mira a ignorar el control, y ya pasó con los −$212M.
  //
  // Sin fuente NO hay ✓: afirmar que está todo bien justo cuando no se puede saber es el peor estado.
  // LOS TRES ESTADOS, CADA UNO EN UN RENGLÓN QUE ENTRA. Los literales medían 85, 86 y 190 caracteres
  // contra un tope de 60, y los dos últimos tramos del ⓘ eran una explicación entera: dónde está el
  // detalle ya lo dice `${C}`, y por qué la cifra está inflada es el motivo de que el estado sea ⓘ y
  // no ✗ — está escrito arriba, en el código, que es donde se busca el día que importe.
  // ═══ LA ÚLTIMA FILA ES UN CONTROL, NO UN VEREDICTO EN PROSA (09/09/2026) ═══
  //
  // Hasta hoy cerraba con una oración de tres estados —«▲ NO PUEDO VERIFICAR · ARCA no replicó…»,
  // «✓ todo lo de la ventana tiene comprobante…», «ⓘ $X en N fila(s) · detalle en _CRUCE_ARCA»— de
  // hasta 190 caracteres, y el auditor del contrato (`diseno-unificado`) la medía como PROSA en las
  // tres pestañas que comparten este bloque. El dueño prohibió la aclaración: el bloque cierra con
  // «rótulo | número». El número es la CANTIDAD de filas sin comprobante (el monto ya está dos filas
  // arriba); sin fuente replicada da «—», que es el mismo cero dibujado del resto del archivo, y la
  // fila «Ventana comparable» ya dice sola que ARCA no replicó nada.
  filas.push(['⇒ Filas sin comprobante en ARCA', `=IF(NOT(${HAY_FUENTE});"—";${sinRespaldoN(rubros)})`])
  return filas
}

/** Cuántas filas ocupa el bloque. Quien lo inserta necesita saberlo ANTES de armar la grilla. */
export const ALTO_BLOQUE = 8

/**
 * NÚCLEO PURO: el bloque, declarado como UNA SOLA IDEA para la huella por celda.
 *
 * ═══ POR QUÉ HACE FALTA DECIRLO (06/09/2026) ═══
 *
 * Las nueve filas no son nueve datos: son un control. `⇒ Cobertura fiscal` es `B(universo)` sobre
 * `B(conRespaldo)` — sin sus dos insumos publica `""` pase lo que pase, y una celda vacía debajo de un
 * rótulo que promete cobertura afirma que se está mirando algo que no se mira.
 *
 * Medido: cuando este bloque cambió de forma el 13/08, la huella leyó el hueco que dejó el
 * movimiento como «el dueño vació estas celdas» y las marcó BORRADAS —15 en Estructura, 19 en
 * Recurrentes— para siempre. Las únicas que sobrevivieron son el título y el `⇒`, porque son las
 * únicas que `esCeldaDeEstructura` sabe rescatar. El resultado son tres controles mudos publicados
 * durante tres semanas. `Materiales`, que corre este MISMO bloque y no se movió ese día, no tiene una
 * sola marca y publica su cobertura sin problema: el bloque funciona, lo que falló es la propiedad.
 *
 * @param {number} fila0 la fila REAL de la planilla donde arranca el bloque (la misma que `bloqueControlArca`)
 * @returns {{desde:number, hasta:number}} rango de filas inclusivo, para `escribirPreservando`
 */
export function bloqueIndivisible(fila0) {
  return { desde: fila0, hasta: fila0 + ALTO_BLOQUE - 1 }
}

/**
 * QUÉ UNIDAD TIENE CADA FILA DEL BLOQUE — declarado acá, aplicado por las tres pestañas.
 *
 * ═══ EL DEFECTO (14/08/2026) ═══
 *
 * `Materiales!B52` mostraba **"$1"**. La fórmula estaba perfecta —0,6614, el 66,1% de cobertura
 * fiscal— y la celda tenía formato MONEDA, heredado de la pasada que pinta la columna B entera.
 * Redondeado a pesos, un 0,66 se dibuja como "$1": el número correcto, ilegible. Estructura y
 * Recurrentes ya lo aplicaban bien, pero con los desplazamientos escritos a mano (`arca0 + 5`,
 * `arca0 + 6`, `arca0 + 7`) en cada script. Tres copias de un número que depende del ORDEN de las
 * filas de este archivo: mover una línea del bloque las desincroniza a las tres y ninguna grita.
 *
 * Acá vive el orden, y `control-arca-bloque.test.mjs` lo compara contra los rótulos que emite
 * `bloqueControlArca`: si alguien reordena el bloque, el test se pone rojo antes que la pantalla.
 *
 * El valor NUNCA se toca — la cobertura sigue siendo la fracción que devuelve la división. Lo que se
 * corrige es cómo se dibuja, igual que con las fechas-serial del Calendario.
 */
export const FILA_BLOQUE = Object.freeze({
  titulo: 0, ventana: 1, universo: 2, conRespaldo: 3, sinRespaldo: 4,
  cobertura: 5, global: 6, veredicto: 7,
})

/** Las filas del bloque que llevan un importe en la columna B, como rango [desde, hasta). */
export const MONTOS_BLOQUE = Object.freeze({ desde: FILA_BLOQUE.universo, hasta: FILA_BLOQUE.cobertura })
