// LA PESTAÑA `OBRAS` — TODAS LAS OBRAS DEL AÑO EN UNA SOLA PANTALLA. GRILLA PURA, SIN RED.
//
// QUÉ ES (07/08/2026). El dueño quiere ver el año entero de un vistazo: qué se vendió, qué se cobró,
// qué costó y qué falta desembolsar, obra por obra. Y lo pidió con un estándar explícito: *"No quiero
// una planilla mejor. Quiero que parezca un software de tesorería enterprise construido dentro de
// Google Sheets"* — importes protagonistas, poco texto, mucho aire, jerarquía.
//
// LA TRADUCCIÓN A ESTRUCTURA:
// · Sección 1 — OBRAS DEL AÑO: una fila por cliente con venta / cobrado / pendiente / materiales,
//   TODO fórmula viva sobre Cobranzas y Materiales. Nada tipeado.
// · Sección 2 — OBRAS EN CURSO Y FUTURAS: UNA fila protagonista por obra (venta · cobrado · costo
//   real · pendiente · margen · semáforo ✓/⚠) y el detalle de egresos debajo, indentado y gris.
//   Los ÚNICOS números tipeados de la pestaña son los PROYECTADOS de `obras-datos.mjs` (insumo del
//   dueño) — todo lo demás es fórmula.
//
// LAS REGLAS QUE ESTE ARCHIVO NO ROMPE:
// · Rótulos anclados al TEXTO, nunca a la posición (INDEX/MATCH sobre "TOTAL POR OBRA", no una fila).
// · Fórmulas en locale es-AR: separador `;` — una coma acá es un decimal.
// · Rangos ABIERTOS ($M$5:$M): una fila final tipeada deja de ver lo nuevo sin dar error.
// · Una obra sin fechas se VE pero no se proyecta: sin inicio no hay ventana para medir el real.
//
// ═══ LA VENTA DE UNA OBRA SON TODAS SUS FILAS. NO SE DESCARTA NINGUNA (13/08) ═══
//
// ACÁ VIVIÓ UN DEFECTO Y VALE LA PENA DEJARLO ESCRITO, PORQUE ERA CONVINCENTE. Dos versiones de este
// archivo afirmaron que en Cobranzas convivían "la fila madre" de la obra y su cronograma de
// certificaciones por el mismo importe, y que sumar todo duplicaba la venta. La fórmula descartaba
// entonces las filas que dijeran "Certificaci". Era falso, y lo pagó el archivo real: la pestaña
// publicó $624.243.320 de venta 2026 cuando Cobranzas suma $808.994.353, y mostró Instalación
// Eléctrica con margen NEGATIVO y semáforo ⚠ por comparar el costo entero contra media venta.
//
// LO QUE DICEN LOS DATOS (91 filas de public.cobranzas, verificadas una por una). No existe ninguna
// fila madre: las filas SIN "Certificación" son los ANTICIPOS y su propia columna de orden de compra
// lo dice —"Anticipo inicio obra 50% $ 47.590.272"—, mientras las certificaciones dicen "Resto 50%
// s/ total 47.590.272". Anticipo + certificaciones = 100% del contrato, y ninguna repite a otra.
//
// POR QUÉ ENGAÑABA: como el reparto es 50/50, la suma de los anticipos da EXACTAMENTE igual que la de
// las certificaciones. Dos números idénticos parecen un duplicado. Lo son sólo si uno mira los
// importes y no el concepto — que es justo lo que pasó, y encima quedó escrito como premisa para el
// que viniera después. Un comentario del código no es evidencia de nada: la evidencia es el dato.
//
// LA REGLA HOY: venta = TODAS las filas del cliente/obra, sin descartar por concepto. Lo único que se
// excluye es el estado CANCELAR, que es una venta que dejó de existir, no una fila repetida.
//
// ═══ LOS CLIENTES SE DERIVAN DE COBRANZAS Y SE MATCHEAN EXACTO (13/08) ═══
//
// La lista de clientes estuvo TIPEADA acá, y el dueño lo cazó mirando la pestaña: *"la fila 'otros
// clientes' no puede ser, estan todos los clientes y obras declarados"*. Con la lista escrita a mano,
// todo cliente que no estuviera en ella caía en un cajón anónimo — eran tres reales y cobrados: LIRIO
// DANIEL RAMIRO $17.303.000, ADDATO $2.500.000, MACRO CONSTRUCCIONES SRL $135.520. Una lista tipeada
// garantiza que el cuadro quede incompleto cada vez que la empresa factura a alguien nuevo.
//
// Ahora el escritor los LEE de Cobranzas (`clientesDeCobranzas`) y el rótulo ES el texto del archivo.
// Eso permitió pasar de match por prefijo a match EXACTO: el prefijo existía sólo para salvar el
// desfase entre la lista tipeada ("LA ESTRELLA") y el archivo ("LA ESTRELLA /ALIMENTOS DEL SUR SAS"),
// y traía un riesgo propio —"MESSINA" se llevaría las filas de un futuro "MESSINA SRL" sin dar error—.
// Con match exacto eso no puede pasar nunca.
//
// LO QUE SE DERIVA ES QUÉ CLIENTES EXISTEN; CÓMO SE AGRUPAN SIGUE SIENDO DECISIÓN DECLARADA. Las
// variantes de `ALIAS_CLIENTE` colapsan en su canónico: si no, "IMOTOR/San Francisco/JAVI SANCHEZ"
// volvería a abrir fila propia, que es exactamente lo que el dueño mandó unificar.
//
// Y LA FILA DE RESIDUO NO SE BORRA: queda, y tiene que dar $0. Es el control que prueba que no falta
// nadie. Si algún día vuelve a tener monto, apareció un cliente que el mecanismo no supo ubicar.
// Borrar un control porque hoy da cero es como se pierde la capacidad de detectar el problema.
//
// ═══ QUÉ COLUMNA SE USA PARA QUÉ: EL IVA NO ES VENTA (13/08) ═══
//
// Cobranzas tiene el neto (col "Monto neto") y el total con IVA (col "TOTAL a cobrar"). Usar el total
// como venta infló Playón de Azufre a $116.150.000 sobre un contrato de $102.500.000: los
// $13.650.000 de diferencia son el IVA de la parte blanca, que se cobra y se rinde — no es ingreso.
// Peor todavía, las obras en negro no tienen IVA, así que la misma columna comparaba peras con
// manzanas y sobrestimaba el margen SÓLO de las blancas.
//
//   · VENTA y MARGEN      → el NETO.  Es lo que la empresa gana.
//   · COBRADO y RESTA     → el TOTAL. Es la plata que entra por la puerta.
//
// Las dos son ciertas y miden cosas distintas; por eso los rótulos lo dicen y no hay que adivinarlo.
//
// PERO EL RÓTULO NO PUEDE DECIR "c/IVA" (13/08, corrección del dueño): *"no todas las obras llevan
// iva en su totalidad, si dice N es negro sin iva, si dice B es blanco con iva"*. La categoría es por
// FILA (col B), no por obra: las 34 filas N no tienen un peso de IVA —verificado: 0 de 34— así que
// las cuatro obras de San Francisco salían rotuladas "c/IVA" sin llevar nada. Los números estaban
// bien (la col M ya trae el total real de cada fila); lo falso era lo que la pestaña AFIRMABA. Un
// rótulo que miente en la mitad de las filas hace desconfiar de la pestaña entera.
//
// Y UNA OBRA PUEDE ESTAR PARTIDA: Playón es blanco $65.000.000 + negro $37.500.000. Por eso su resta
// a cobrar ($116.150.000) es mayor que su venta neta ($102.500.000) — la diferencia es el IVA de la
// parte blanca, y nada más. Esa composición se publica en la glosa SÓLO cuando la obra es mixta,
// porque es justo la pregunta que dispara ese número; en las otras seis sería ruido.
//
// ═══ QUÉ ES CADA COLUMNA DE COBRANZAS, MEDIDO CONTRA LAS 91 FILAS (13/08) ═══
//
// El "TOTAL a cobrar" (col M) NO es un saldo pendiente: es el importe que el cliente efectivamente
// transfiere. Se verificó por descarte: si fuera saldo, las 46 filas en estado Cobrado tendrían ~0, y
// suman $451.507.276 — el mismo número que `sync-cobranzas` reporta por su cuenta.
//
// ⚠ Y **M NO SE DERIVA DE J y K**. La identidad `total = neto + IVA − retenciones` se cumple en 90 de
// las 91 filas, y por eso parece una regla — pero no lo es. MESSINA "PILON - Anticipo" tiene neto
// $2.330.000 sin IVA y total $9.030.000, y el dueño lo declaró textual el 13/08: *"no hay nada mal
// tipeado"*. Son COLUMNAS INDEPENDIENTES de la fuente. Nunca se calcula una a partir de la otra, y no
// se agrega un control que valide esa identidad: marcaría en rojo una fila correcta, y un control que
// grita sobre lo que está bien se ignora y arrastra a los que sirven. Se LEE la columna que
// corresponde: J para venta y margen, M para cobrado y resta.
//
// POR ESO "LO QUE RESTA COBRAR" NO SE LEE DE UNA COLUMNA: sale del ESTADO. Resta = todo lo que no
// está Cobrado ni CANCELAR. Leerlo de M daría el contrato entero como pendiente.
//
// ═══ POR QUÉ NO UNA TABLA DINÁMICA ═══
//
// El dueño preguntó si una pivot resolvía esto. No, y no es por gusto: una pivot es un objeto que
// vive FUERA de la grilla. Ningún generador la controla, no se versiona, no se testea y nadie la ve
// romperse — este repo ya pagó ese caso exacto: una pivot huérfana en el Flujo de Fondos duplicaba
// Proveedores en silencio. Todo lo que el dueño pidió (cobrado, resta, próxima fecha, forma, el
// detalle por obra) sale de SUMIFS/MINIFS/TEXTJOIN sobre Cobranzas: fórmulas vivas, versionadas, que
// el generador escribe y los tests verifican. No encontré nada que la pivot resuelva y la fórmula no.

import { VACIO } from './preservar-anotaciones.mjs'
import { esProyectable } from './obras-datos.mjs'

export const PESTANA_OBRAS = 'OBRAS'

/** A obra/concepto · B semáforo · C venta/proyectado · D cobrado · E real · F pendiente · G margen ·
 *  H fecha · I prosa. */
export const ANCHO_OBRAS = 9

/** Anchos en píxeles — los importes con aire, la prosa angosta y al final (estándar del dueño). La
 *  columna A NO se declara acá: la calcula `anchoColumnaA` a partir de los rótulos que se emiten. */
export const ANCHOS_OBRAS = [300, 44, 138, 138, 138, 138, 138, 92, 300]

/** Lo que Sheets muestra cuando una fórmula no evalúa. Publicar uno es peor que no escribir. */
export const ERRORES_SHEET = Object.freeze(['#ERROR!', '#REF!', '#VALUE!', '#NAME?', '#N/A', '#DIV/0!', '#NUM!', '#NULL!'])

/**
 * LAS CELDAS QUE QUEDARON EN ERROR EN LO YA PUBLICADO.
 *
 * POR QUÉ EXISTE (13/08). La pestaña publicó `#ERROR!` en las 7 obras y ningún test lo vio: los tests
 * comparaban el texto que el generador emite contra el texto que el generador espera — las dos puntas
 * del mismo lado. Lo que Sheets EVALÚA sólo lo dice Sheets. Por eso el escritor relee lo que dejó y
 * aborta declarando: la evidencia es del efecto, no del intento.
 *
 * @param {Array<Array>} filas lo leído del destino, con los valores ya renderizados.
 * @returns {Array<{ref:string, valor:string}>} referencia A1 y el error, para poder ir a mirarlo.
 */
export function celdasEnError(filas = []) {
  const malas = []
  for (const [i, fila] of (filas ?? []).entries()) {
    for (const [c, v] of (fila ?? []).entries()) {
      const t = String(v ?? '').trim()
      if (ERRORES_SHEET.includes(t)) malas.push({ ref: `${letraDe(c)}${i + 1}`, valor: t })
    }
  }
  return malas
}
const letraDe = (i) => (i < 26 ? '' : String.fromCharCode(64 + Math.floor(i / 26))) + String.fromCharCode(65 + (i % 26))

/**
 * ¿ESTA FÓRMULA PARSEA? Paréntesis balanceados y comillas cerradas.
 *
 * Sheets no evalúa una fórmula que no parsea: la muestra como `#ERROR!`. Es exactamente lo que pasó
 * con la próxima fecha de cobro, que cerraba un paréntesis de más — y se publicó en las 7 obras.
 *
 * @returns {string|null} el motivo, o null si está sana.
 */
export function problemaDeSintaxis(formula) {
  let nivel = 0
  let comilla = false
  for (const ch of String(formula)) {
    if (ch === '"') { comilla = !comilla; continue }
    if (comilla) continue
    if (ch === '(') nivel++
    if (ch === ')' && --nivel < 0) return 'cierra un paréntesis que nunca abrió'
  }
  if (comilla) return 'una comilla quedó sin cerrar'
  if (nivel > 0) return `quedan ${nivel} paréntesis sin cerrar`
  return null
}

/**
 * PÍXELES QUE OCUPA UN TEXTO EN LA COLUMNA A.
 *
 * El factor sale de MEDIR el corte real en el PDF del 13/08, no de una tabla teórica: con la columna
 * en 300px, el título de 36 caracteres se cortó a los 29 → ≈10,3 px por carácter a 13pt bold. De ahí
 * el 0,80 del tamaño para negrita y 0,70 para el resto, redondeando para arriba.
 */
export const pxDeTexto = (texto, { tam, bold }) => Math.ceil(String(texto).length * tam * (bold ? 0.80 : 0.70))

/**
 * EL ANCHO DE LA COLUMNA A, DERIVADO DE LO QUE LA GRILLA EMITE.
 *
 * POR QUÉ NO ES UN NÚMERO FIJO (13/08). Con 300px fijos el PDF cortaba los títulos a mitad de palabra
 * —"2.7 · Quattropani - Melisa García SAS — SALÓN" sin "COMERCIAL"—, y no lo atrapaba ningún test
 * porque ningún test miraba el ancho. El estilo de la casa pone `wrapStrategy: CLIP` en toda la hoja,
 * así que un rótulo más largo que su columna NO se derrama: desaparece. El título de una obra cortado
 * al medio es lo primero que se lee en una pestaña que quiere parecer software de tesorería.
 *
 * La fila 2 se excluye a propósito: es el subtítulo, va con WRAP y su largo no debe ensanchar nada.
 */
export function anchoColumnaA(g, { minimo = 300, padding = 18 } = {}) {
  const grandes = new Set([...(g.protagonistas ?? []), ...(g.totales ?? [])])
  let px = minimo - padding
  ;(g.filas ?? []).forEach((fila, i) => {
    const t = fila?.[0] === VACIO ? '' : String(fila?.[0] ?? '')
    const n = i + 1
    if (!t || n === 2) return
    const estilo = n === 1 ? { tam: 13, bold: true }
      : (grandes.has(n) || /^\d · /.test(t) || /^⇒/.test(t)) ? { tam: 10, bold: true }
        : { tam: 9, bold: false }
    px = Math.max(px, pxDeTexto(t, estilo))
  })
  return px + padding
}

/**
 * CLIENTES DE MUESTRA — SÓLO PARA EL ENSAYO EN SECO. NO es la lista del año.
 *
 * La lista real se DERIVA de Cobranzas en cada corrida (`clientesDeCobranzas`). Esta constante existe
 * únicamente para que `--dry` pueda dibujar la forma de la pestaña sin red, y está declarada como
 * muestra justamente para que nadie la vuelva a tratar como la verdad.
 */
export const CLIENTES_MUESTRA = [
  'LA ESTRELLA /ALIMENTOS DEL SUR SAS', 'San Francisco', 'MESSINA', 'ARCOR',
  'Quattropani - Melisa García SAS', 'LIRIO DANIEL RAMIRO', 'ADDATO', 'MACRO CONSTRUCCIONES SRL',
]

/**
 * LOS CLIENTES DEL AÑO, DERIVADOS DE COBRANZAS. La lista no se tipea: se lee.
 *
 * POR QUÉ (13/08, pedido del dueño): *"la fila 'otros clientes' en pestaña 'obras' no puede ser,
 * estan todos los clientes y obras declarados, busca y empareja"*. Tenía razón, y el defecto era de
 * mecanismo: la lista estaba escrita en el código, así que TODO cliente que no estuviera en ella caía
 * en un cajón anónimo —LIRIO DANIEL RAMIRO $17.303.000, ADDATO $2.500.000, MACRO $135.520, todos
 * reales y todos cobrados—. Una lista tipeada garantiza que el cuadro quede incompleto cada vez que
 * la empresa factura a alguien nuevo, y que nadie se entere.
 *
 * LO QUE SE DERIVA ES QUÉ CLIENTES EXISTEN; CÓMO SE AGRUPAN SIGUE SIENDO DECISIÓN DECLARADA. Las
 * variantes de `ALIAS_CLIENTE` colapsan en su canónico —si no, "IMOTOR/San Francisco/JAVI SANCHEZ"
 * volvería a abrir fila propia, que es justo lo que el dueño mandó unificar.
 *
 * @param {Array} valores la columna "Obra / Cliente" tal como se leyó, de la primera fila de datos.
 * @returns {string[]} los canónicos, sin repetir, en el orden en que aparecen en el archivo.
 */
export function clientesDeCobranzas(valores = [], alias = ALIAS_CLIENTE) {
  const canonDe = new Map()
  for (const [canon, variantes] of Object.entries(alias)) for (const v of variantes) canonDe.set(v, canon)
  const vistos = new Set()
  const orden = []
  for (const crudo of valores) {
    const t = String(Array.isArray(crudo) ? crudo[0] : crudo ?? '').trim()
    if (!t) continue
    const canon = canonDe.get(t) ?? t
    if (vistos.has(canon)) continue
    vistos.add(canon)
    orden.push(canon)
  }
  return orden
}

/**
 * Las columnas de Cobranzas / Compras / Materiales que la grilla cita. Son el DEFECTO para construir
 * en frío; el escritor (`scripts/obras-pestana.mjs`) las resuelve contra el encabezado REAL por
 * rótulo — nunca por letra fija — y falla cerrado si un rótulo no está.
 */
export const REFS_OBRAS = {
  cob: { hoja: 'Cobranzas', cliente: 'G', concepto: 'I', neto: 'J', total: 'M', estado: 'O', forma: 'N', fechaCobro: 'Q', categoria: 'B', oc: 'H', desde: 5 },
  // `neto` es la columna "Importe" (M = Total − IVA). El costo se mide ahí, no en "Total" (O): la
  // venta ya se mide al neto, y comparar venta neta contra costo con IVA castigaba el margen ~21% en
  // todo lo que se compra en blanco. Neto contra neto. El IVA de compras es crédito fiscal, no costo.
  cmp: { hoja: 'Compras', fecha: 'C', proveedor: 'E', cliente: 'J', neto: 'M', total: 'O', desde: 4 },
  mat: { hoja: 'Materiales', filaTotal: 'TOTAL POR OBRA', filaCabecera: '2 · POR OBRA' },
}

/** El serial de Sheets de una fecha ISO (base 30/12/1899). Es como se ESCRIBE una fecha tipeada. */
export const serialISO = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}
const ddmm = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y.slice(2)}` }
const ars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

const abierto = (c, campo) => `'${c.hoja}'!$${c[campo]}$${c.desde}:$${c[campo]}`

/** El estado que saca una fila de la venta: cancelada, no vendida. Es lo ÚNICO que se descarta. */
const NO_VENTA = 'CANCELAR'

/** El estado de una fila ya cobrada. Todo lo demás que no sea CANCELAR es lo que resta cobrar. */
const COBRADO = 'Cobrado'

/**
 * EL PATRÓN DE IMPORTE PARA `TEXT()` — Y LA TRAMPA QUE ESTÁ AL LADO DE LA OTRA TRAMPA.
 *
 * ⚠ NO "CORREGIR" ESTA COMA POR UN PUNTO. Parece un error en es-AR y no lo es:
 *
 *   · el SEPARADOR DE ARGUMENTOS de una fórmula por API va en LOCALE  → `;`, nunca `,`
 *   · el PATRÓN DE NÚMERO de esa misma fórmula va en NOTACIÓN US      → `,` miles, `.` decimales
 *
 * Dos reglas opuestas en la misma línea. Sheets recibe `#,##0` y lo DIBUJA `65.000.000` porque el
 * archivo es es-AR. Ya se escribió al revés —`#.##0`, "porque acá los miles van con punto"— y ese
 * punto se leyó como el decimal: se publicó `$ 23795136,0` donde iba `$ 23.795.136`.
 *
 * Lo verifica `evaluar-formula-sheet.mjs`, que corre el TEXT en frío y devuelve el texto renderizado.
 */
const MILES = '"$ #,##0"'

/**
 * EL CRITERIO DE UN CLIENTE: SU TEXTO EXACTO.
 *
 * Antes era un prefijo (`"San Francisco*"`), porque la lista tipeada decía "LA ESTRELLA" y el archivo
 * "LA ESTRELLA /ALIMENTOS DEL SUR SAS". Al derivar los nombres de Cobranzas ese desfase desaparece
 * —el rótulo ES el texto del archivo— y el prefijo pasa a ser un riesgo puro: bastaría que existiera
 * "MESSINA" y "MESSINA SRL" para que la primera se llevara las filas de la segunda, sin dar error.
 * Hoy no hay ninguna colisión de prefijo en el archivo; con match exacto no puede haberla nunca.
 */
export const criterioCliente = (texto) => `${texto}`

/**
 * LAS VARIANTES CON QUE UN CLIENTE APARECE EN COBRANZAS. Decisión del DUEÑO, no inferencia.
 *
 * 13/08, textual: *"si es san francisco, imotor"* — la fila "IMOTOR/San Francisco/JAVI SANCHEZ" ES
 * San Francisco (IMOTOR es la obra). Va acá y no como un comodín más ancho: aflojar el match para que
 * entre este caso volvería a mezclar los clientes que acabamos de separar. El mapa deja la decisión
 * escrita y auditable fila por fila.
 */
export const ALIAS_CLIENTE = Object.freeze({
  'San Francisco': ['IMOTOR/San Francisco/JAVI SANCHEZ'],
})

/** El canónico y sus variantes declaradas. Cada una se ancla al prefijo por separado. */
export const variantesDe = (cliente) => [cliente, ...(ALIAS_CLIENTE[cliente] ?? [])]

/**
 * UNA SUMA SOBRE COBRANZAS PARA UN CLIENTE Y SUS ALIAS.
 *
 * Se emite un SUMIFS por variante y se suman: SUMIFS no sabe hacer OR, y la alternativa —un comodín
 * que abarque las dos— es justo lo que mezclaba clientes distintos.
 *
 * @param {string} campo cuál importe se suma: `neto` (venta y margen) o `total` (plata que entra).
 * @param {string} extra criterios adicionales ya formateados, o ''.
 * @param {string} estado el criterio de estado, entre comillas.
 */
function sumaCobranzas(cob, campo, cliente, extra, estado) {
  // UNA OBRA SE RECONOCE POR EL CONCEPTO **O** POR LA ORDEN DE COMPRA (ver `tramos`): el anticipo
  // puede no nombrarla en el Concepto, y mirar sólo ahí dejaba media obra afuera.
  return tramos(cob, cliente, extra)
    .map(([v, c]) => `SUMIFS(${abierto(cob, campo)};${abierto(cob, 'cliente')};"${criterioCliente(v)}"${c};${abierto(cob, 'estado')};${estado})`)
    .join('+')
}

/** VENTA: el NETO de todo lo que no está cancelado. El IVA no es venta. */
const venta = (cob, cliente, extra = {}) => `=${sumaCobranzas(cob, 'neto', cliente, extra, `"<>${NO_VENTA}"`)}`

/** COBRADO: el importe que entró, con IVA. */
const cobrado = (cob, cliente, extra = {}) => `=${sumaCobranzas(cob, 'total', cliente, extra, `"${COBRADO}"`)}`

/** RESTA COBRAR: lo facturado/proyectado que todavía no entró, con IVA. Sale del ESTADO, no de una
 *  columna de saldo — la col M no es un saldo (ver el encabezado). */
const restaCobrar = (cob, cliente, extra = {}) =>
  `=${sumaCobranzas(cob, 'total', cliente, extra, `"<>${NO_VENTA}"`)}-(${sumaCobranzas(cob, 'total', cliente, extra, `"${COBRADO}"`)})`

/** LO VENCIDO: fecha de cobro pasada y todavía sin cobrar. Es la plata que había que cobrar y no
 *  entró — el único número de esta pestaña que tiene que gritar. */
/** Los pares (variante de cliente, criterio de obra) que forman UNA obra. Sin needle, el cliente entero. */
const tramos = (cob, cliente, extra = {}) => {
  const cat = extra.cat ? `;${abierto(cob, 'categoria')};"${extra.cat}"` : ''
  return variantesDe(cliente).flatMap((v) => (extra.needle
    ? [[v, `;${abierto(cob, 'concepto')};"*${extra.needle}*"${cat}`],
      [v, `;${abierto(cob, 'oc')};"*${extra.needle}*";${abierto(cob, 'concepto')};"<>*${extra.needle}*"${cat}`]]
    : [[v, cat]]))
}

const vencido = (cob, cliente, extra = {}) =>
  `=${tramos(cob, cliente, extra).map(([v, c]) => `SUMIFS(${abierto(cob, 'total')};${abierto(cob, 'cliente')};"${criterioCliente(v)}"${c}`
    + `;${abierto(cob, 'estado')};"<>${COBRADO}";${abierto(cob, 'estado')};"<>${NO_VENTA}";${abierto(cob, 'fechaCobro')};"<"&TODAY())`).join('+')}`

/**
 * LA PRÓXIMA FECHA DE COBRO pendiente.
 *
 * `MINIFS` devuelve 0 cuando no hay ninguna pendiente, y un 0 en una celda con formato de fecha se
 * dibuja "30/12/1899". El `1/(1/x)` convierte ese 0 en un error que el IFERROR transforma en blanco:
 * una obra sin cobranzas pendientes no tiene próxima fecha, y eso es un guion, no un error.
 *
 * ACÁ VIVIÓ EL `#ERROR!` QUE SE PUBLICÓ EN LAS 7 OBRAS (13/08): esta fórmula cerraba un paréntesis de
 * más. Sheets no evalúa una fórmula que no parsea — la muestra como `#ERROR!` — y los tests no lo
 * veían porque comparaban el texto que yo emitía contra el texto que yo esperaba. Ahora `todas las
 * fórmulas están balanceadas` es un test, y el escritor relee la pestaña y aborta si publicó un error.
 */
const LEJOS = 2958465

const proximoCobro = (cob, cliente, extra = '') => {
  const ms = tramos(cob, cliente, extra).map(([v, c]) => `MINIFS(${abierto(cob, 'fechaCobro')};${abierto(cob, 'cliente')};"${criterioCliente(v)}"${c}`
    + `;${abierto(cob, 'estado')};"<>${COBRADO}";${abierto(cob, 'estado')};"<>${NO_VENTA}";${abierto(cob, 'fechaCobro')};">0")`)
  // CADA MINIFS SIN COINCIDENCIAS DEVUELVE 0, Y UN 0 GANA CUALQUIER `MIN`. Ese fue el defecto: las 4
  // obras de San Francisco salieron con la fecha EN BLANCO porque su alias IMOTOR no tiene filas
  // pendientes de esa obra, su MINIFS daba 0 y el MIN lo tomaba como el mínimo. Blanco se lee como
  // "no hay nada que cobrar", y había $8,7M para el 19/08. El 0 se mapea a una fecha imposible.
  const min = `MIN(${ms.map((m) => `IF(${m}=0;${LEJOS};${m})`).join(';')})`
  return `=IF(${min}>=${LEJOS};"";${min})`
}

/**
 * EL DETALLE DE COBRANZAS DE UNA OBRA, EN UNA SOLA CELDA.
 *
 * El dueño pidió poder leer cada cobranza por obra —Playón tiene 6 eventos— sin que la pestaña se
 * llene de filas. TEXTJOIN sobre un ARRAYFORMULA devuelve UNA celda: no derrama sobre las columnas
 * del generador, que es la trampa que este repo ya pagó con los derrames de ARRAYFORMULA.
 */
/**
 * BLANCO Y NEGRO, SÓLO SI LA OBRA ESTÁ PARTIDA.
 *
 * Es lo que explica que la resta a cobrar supere a la venta neta: el IVA de la parte blanca. Se
 * calcula vivo sobre la categoría de cada FILA (col B) y el `IF` lo hace desaparecer cuando la obra
 * es toda blanca o toda negra — hoy sólo Playón lo muestra. Poner el dato siempre sería ruido en seis
 * obras para explicar una.
 */
function composicionBlancoNegro(cob, cliente, extra) {
  const porCategoria = (cat) => `(${sumaCobranzas(cob, 'neto', cliente, { ...extra, cat }, `"<>${NO_VENTA}"`)})`
  const b = porCategoria('B')
  const n = porCategoria('N')
  return `IF(${b}*${n}>0;"blanco "&TEXT(${b};${MILES})&" · negro "&TEXT(${n};${MILES})&" ‖ ";"")`
}

function detalleCobranzas(cob, cliente, needle) {
  const cond = variantesDe(cliente)
    .map((v) => `(${abierto(cob, 'cliente')}="${v}")`).join('+')
  // EL IMPORTE SE FORMATEA ADENTRO DE LA FÓRMULA: TEXTJOIN concatena TEXTO y el formato de número de
  // la celda no lo toca. El separador entre eventos es " | ": con seis cobranzas seguidas, el " · "
  // se leía como párrafo. El patrón va en `MILES`, y ese detalle tiene su propia advertencia.
  const extra = { needle }
  return `=IFERROR(${composicionBlancoNegro(cob, cliente, extra)}&TEXTJOIN(" | ";1;ARRAYFORMULA(IF((${cond})*(ISNUMBER(SEARCH("${needle}";${abierto(cob, 'concepto')})))`
    + `*(${abierto(cob, 'estado')}<>"${COBRADO}")*(${abierto(cob, 'estado')}<>"${NO_VENTA}")*(${abierto(cob, 'fechaCobro')}>0);`
    + `TEXT(${abierto(cob, 'fechaCobro')};"dd/mm")&" · "&TEXT(${abierto(cob, 'total')};${MILES})&" · "&${abierto(cob, 'forma')};"")));"")`
}

/** Mismo constructor de grilla que el anexo de CAJA: push devuelve la fila 1-based, y toda celda
 *  vacía sale con el centinela VACIO ("es mía y va vacía") para que la fusión la limpie. */
function hoja() {
  const filas = []
  const h = {
    filas,
    tipeadas: [],
    get n() { return filas.length },
    push(c = []) {
      const r = [...c].map((x) => (x === '' || x === undefined || x === null ? VACIO : x))
      while (r.length < ANCHO_OBRAS) r.push(VACIO)
      r.length = ANCHO_OBRAS
      filas.push(r)
      return filas.length
    },
  }
  return h
}

/**
 * SECCIÓN 1 — LAS OBRAS DEL AÑO, POR CLIENTE. Todo fórmula viva.
 *
 * El cliente se ancla al PREFIJO de "Obra / Cliente": el archivo escribe "LA ESTRELLA /ALIMENTOS DEL
 * SUR SAS", así que un match exacto daría $0, pero buscarlo adentro le sumaba a San Francisco las 9
 * filas de "IMOTOR/San Francisco/JAVI SANCHEZ", que es otro cliente. El gasto real en materiales lo
 * declara la pestaña Materiales en su fila "TOTAL POR OBRA", citada por rótulo con INDEX/MATCH.
 *
 * EL TOTAL NO ES LA SUMA DE LAS FILAS DE ARRIBA: sale de Cobranzas entera. Y la diferencia contra los
 * clientes listados se publica en su propia fila, con nombre. Así la pestaña se concilia sola contra
 * su fuente y ningún cliente puede desaparecer del número grande sin que se vea dónde fue — que es
 * exactamente lo que pasó cuando el total decía $624M sobre una fuente de $809M.
 */
function seccionObrasDelAno(h, refs, clientes) {
  const { cob, mat } = refs
  h.push(['1 · OBRAS DEL AÑO'])
  h.push(['Cliente', '', 'Venta (neto)', 'Cobrado', 'Resta cobrar', 'Vencido', 'Materiales (real)', '', ''])
  const f0 = h.n + 1
  for (const cli of clientes) {
    const f = h.n + 1
    h.push([cli, '', venta(cob, cli), cobrado(cob, cli), restaCobrar(cob, cli), vencido(cob, cli),
      `=IFERROR(INDEX('${mat.hoja}'!$A:$Z;MATCH("${mat.filaTotal}";'${mat.hoja}'!$A:$A;0);`
        + `MATCH($A${f};INDEX('${mat.hoja}'!$A:$Z;MATCH("${mat.filaCabecera}";'${mat.hoja}'!$A:$A;0)+1;0);0));"—")`,
      '', ''])
  }
  const f1 = h.n
  // COBRANZAS ENTERA, sin filtrar por cliente. El único criterio es el estado, así que una fila con la
  // columna de cliente vacía entra igual: si dependiera del cliente, el residuo podría esconder plata.
  const todo = (campo, estado) => `SUMIFS(${abierto(cob, campo)};${abierto(cob, 'estado')};"${estado}")`
  // EL CONTROL SE QUEDA AUNQUE DÉ CERO — sobre todo si da cero. Con los clientes derivados de
  // Cobranzas esta fila tiene que valer $0: si algún día no vale, apareció un cliente que el
  // mecanismo no supo ubicar, y ése es justo el aviso que se perdería si la fila se borrara.
  const fOtros = h.n + 1
  // ROUND a 2 decimales: el residuo es una resta entre agrupaciones distintas de los mismos números y
  // el punto flotante deja restos de 1e-9. Un control que grita por eso enseña a ignorarlo.
  h.push(['⇒ sin ubicar — tiene que dar $0', `=IF(ROUND(C${fOtros}+D${fOtros}+E${fOtros};2)<>0;"⚠";"✓")`,
    `=${todo('neto', `<>${NO_VENTA}`)}-SUM(C${f0}:C${f1})`,
    `=${todo('total', COBRADO)}-SUM(D${f0}:D${f1})`,
    `=${todo('total', `<>${NO_VENTA}`)}-${todo('total', COBRADO)}-SUM(E${f0}:E${f1})`,
    '', '', '',
    'si deja de ser cero, hay un cliente en Cobranzas que no entró en ninguna fila'])
  // EL TOTAL SALE DE LA FUENTE, NO DE LA SUMA DE ARRIBA. Antes era `SUM(C6:C12)` con el residuo
  // adentro, y como el residuo es "archivo − las filas", el total daba el archivo POR CONSTRUCCIÓN:
  // una identidad que no puede fallar, o sea que no controlaba nada. El control falsificable es el
  // residuo: puede dar distinto de cero, y entonces falta un cliente.
  const fTot = h.push(['⇒ TOTAL 2026', '', `=${todo('neto', `<>${NO_VENTA}`)}`, `=${todo('total', COBRADO)}`,
    `=${todo('total', `<>${NO_VENTA}`)}-${todo('total', COBRADO)}`,
    `=SUM(F${f0}:F${fOtros})`, `=SUM(G${f0}:G${f1})`, '',
    'IVA sólo en las filas blancas (B)'])
  h.push([])
  return { fClientes: [f0, f1], fOtros, fTot }
}

/** Lo REALMENTE facturado en Compras para un egreso: mismo proveedor (nombre canónico), mismo cliente
 *  y fecha de factura desde el inicio de la obra. El inicio va como serial literal: es dato del dueño
 *  (obras-datos.mjs) y ya no hay una celda de la fila protagonista donde leerlo — esa columna ahora
 *  publica la próxima fecha de COBRO. */
function realEgreso(cmp, proveedor, cliente, inicio) {
  return `SUMIFS(${abierto(cmp, 'neto')};${abierto(cmp, 'proveedor')};"${proveedor}";`
    + `${abierto(cmp, 'cliente')};"${cliente}";${abierto(cmp, 'fecha')};">="&${serialISO(inicio)})`
}

/**
 * LA PROSA DE LA OBRA, CORTA. Fechas, plantel, horas y la nota del dueño si la hay.
 *
 * El estándar es "muy poco texto", y en el PDF del 13/08 había filas donde la glosa ocupaba más que
 * el dato: el desglose de horas por categoría entraba entero en cada obra. Las horas se publican
 * SUMADAS —el detalle por categoría vive en Jornales, que es su dueño— y el plantel en dos palabras.
 */
function prosaDeObra(o, proyectable) {
  const p = []
  // El año va en el título de la pestaña: repetirlo en cada obra sumaba seis caracteres por fila y
  // empujaba la glosa a un segundo renglón. Todas las obras son del mismo año.
  p.push(proyectable ? `${ddmm(o.inicio).slice(0, 5)}→${ddmm(o.fin).slice(0, 5)}` : '⚠ sin fechas')
  if (o.plantelFullTime != null) p.push(`${o.plantelFullTime + (o.plantelTemporales ?? 0)} personas`)
  const horas = Object.values(o.horas ?? {}).reduce((s, h) => s + (Number(h) || 0), 0)
  if (horas) p.push(`${Math.round(horas).toLocaleString('es-AR')} h`)
  if (o.pctEjecutado) p.push(`al ${Math.round((1 - o.pctEjecutado) * 100)}% restante`)
  if (o.notas) p.push(o.notas)
  return p.join(' · ')
}

/**
 * LA PROSA DE UN EGRESO: proveedor y, si se reparte, en cuántas cuotas.
 *
 * La nota del insumo se descarta cuando lo único que hace es repetir las cuotas ("3 cuotas mensuales
 * iguales" al lado de las 3 cuotas ya listadas). Decir dos veces lo mismo no es más claro: es más
 * texto tapando el importe, que es lo que se vino a leer.
 */
function prosaDeEgreso(e) {
  const p = []
  if (e.cuotas?.length) {
    const iguales = new Set(e.cuotas.map((c) => c.monto)).size === 1
    p.push(iguales
      ? `${e.cuotas.length}× ${ars(e.cuotas[0].monto)} desde ${ddmm(e.cuotas[0].fecha).slice(0, 5)}`
      : e.cuotas.map((c) => `${ddmm(c.fecha).slice(0, 5)} ${ars(c.monto)}`).join(' | '))
  }
  if (e.nota && !(e.cuotas?.length && /cuota/i.test(e.nota))) p.push(e.nota)
  return p.join(' · ')
}

/**
 * UN BLOQUE DE OBRA: la fila protagonista y su detalle.
 *
 * La protagonista se empuja PRIMERO y sus sumas citan las filas del detalle, que se conocen antes de
 * empujarlas (el patrón del anexo de CAJA). El costo real es la suma de lo medible: los egresos con
 * proveedor declarado, contra Compras. La MO no se mide acá — va por Jornales — y su pendiente es el
 * monto entero, declarado en prosa.
 */
function bloqueObra(h, refs, o, idx) {
  const { cob, cmp } = refs
  // La definición de "se puede proyectar" vive en obras-datos.mjs, no acá: repetirla como
  // `o.inicio && o.fin` es la segunda versión del mismo concepto esperando a divergir.
  const proyectable = esProyectable(o)
  const fProt = h.n + 1
  const nDetalle = (o.egresos?.length ?? 0) + 1 // egresos + la fila de MO
  const [f0, f1] = [fProt + 1, fProt + nDetalle]

  const dela = { needle: o.ventaTexto }
  h.push([`2.${idx} · ${o.cliente} — ${o.obra}${proyectable ? '' : '   ⚠ sin fechas — no se proyecta'}`,
    // EL SEMÁFORO MIRA LA COBRANZA VENCIDA, no el margen. Un margen negativo se lee en su columna; la
    // plata que había que cobrar y no entró es lo único que exige llamar a alguien hoy.
    `=IF(F${fProt}>0;"⚠";"✓")`,
    venta(cob, o.cliente, dela), cobrado(cob, o.cliente, dela), restaCobrar(cob, o.cliente, dela),
    vencido(cob, o.cliente, dela),
    // Margen = venta neta − costo proyectado de la obra. El neteo vivo contra Compras confirma ese
    // costo egreso por egreso (columna Pendiente del detalle); no se resta dos veces.
    `=C${fProt}-SUM(C${f0}:C${f1})`,
    proximoCobro(cob, o.cliente, dela),
    detalleCobranzas(cob, o.cliente, o.ventaTexto)])

  for (const e of o.egresos ?? []) {
    const f = h.n + 1
    const fecha = e.cuotas?.length ? e.cuotas[0].fecha : e.fechaEstimada
    const medible = Boolean(e.proveedor && proyectable)
    // EL NETEO VIVO VA EMBEBIDO EN "PENDIENTE": cuando entra la factura real a Compras, el pendiente
    // baja solo. La columna del real dejó su lugar a "Resta cobrar" — el dueño la declaró inútil acá
    // (13/08: *"esa columna real no sirve"*) y el dato que sí decide es cuánto FALTA desembolsar.
    h.push([`      ${e.concepto}`, '', e.monto, '', '',
      medible ? `=MAX(0;C${f}-${realEgreso(cmp, e.proveedor, o.cliente, o.inicio)})` : `=MAX(0;C${f})`,
      '', fecha ? serialISO(fecha) : '',
      [e.proveedor ?? '⚠ sin proveedor: el real no se puede medir', prosaDeEgreso(e)].filter(Boolean).join(' · ')])
    h.tipeadas.push({ fila: f, col: 2 })
    if (fecha) h.tipeadas.push({ fila: f, col: 7 })
  }

  const fMO = h.n + 1
  h.push(['      Mano de obra + cargas sociales', '', o.moCargasPesos, '', '', `=C${fMO}`, '', '',
    `Jornales · ${prosaDeObra(o, proyectable)}`])
  h.tipeadas.push({ fila: fMO, col: 2 })

  let fNoCaja = null
  if (o.noCaja?.maquinaPropia) {
    fNoCaja = h.push(['      ⊘ Máquina propia — no es plata que sale', '', o.noCaja.maquinaPropia,
      '', '', '', '', '', 'equipo propio · no entra al flujo'])
    h.tipeadas.push({ fila: fNoCaja, col: 2 })
  }
  h.push([])
  return { clave: o.clave, fProt, fDetalle: [f0, f1], fMO, fNoCaja, proyectable }
}

/**
 * LA GRILLA COMPLETA DE `OBRAS`.
 *
 * @param {object} ctx `obras` (defecto: OBRAS_FUTURAS de obras-datos.mjs, inyectable en los tests),
 *   `refs` (defecto: REFS_OBRAS; el escritor pasa las resueltas por rótulo), `clientes`.
 * @returns {{filas:Array, tipeadas:Array, protagonistas:number[], detalles:number[], totales:number[],
 *   bloques:Array, fClientes:number[]}} `bloques` expone la anatomía de cada obra (protagonista,
 *   rango de detalle, MO, no-caja) para que la verificación mire la estructura y no el texto.
 */
export function grillaObras(ctx = {}) {
  const refs = { ...REFS_OBRAS, ...ctx.refs }
  const obras = ctx.obras ?? []
  const clientes = ctx.clientes ?? CLIENTES_MUESTRA
  const h = hoja()

  h.push([`${PESTANA_OBRAS} — EL AÑO ENTERO, OBRA POR OBRA`])
  h.push(['Venta al NETO · cobrado y resta al total a cobrar · todo vivo desde Cobranzas.'])
  h.push([])

  const s1 = seccionObrasDelAno(h, refs, clientes)

  h.push(['2 · OBRAS EN CURSO Y FUTURAS', '', '', '', '', '', '', '',
    'tipeado = proyección del dueño (07/08)'])
  h.push(['Obra', '', 'Venta (neto)', 'Cobrado', 'Resta cobrar', 'Vencido', 'Margen proy.', 'Próx. cobro',
    'Cobranzas pendientes'])
  const bloques = obras.map((o, i) => bloqueObra(h, refs, o, i + 1))
  const suma = (col) => `=${bloques.map((b) => `${col}${b.fProt}`).join('+')}`
  const fTot2 = bloques.length
    ? h.push(['⇒ TOTAL — OBRAS EN CURSO Y FUTURAS', '', suma('C'), suma('D'), suma('E'), suma('F'), suma('G'), '',
      'margen = venta neta − costo proyectado'])
    : null

  const totales = [s1.fTot, fTot2].filter(Boolean)
  return {
    filas: h.filas,
    tipeadas: h.tipeadas,
    protagonistas: bloques.map((b) => b.fProt),
    detalles: bloques.flatMap((b) => { const r = []; for (let f = b.fDetalle[0]; f <= b.fDetalle[1]; f++) r.push(f); return b.fNoCaja ? [...r, b.fNoCaja] : r }),
    totales,
    bloques,
    fClientes: s1.fClientes,
    fOtros: s1.fOtros,
  }
}
