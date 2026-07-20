// QUÉ SE COMPRÓ — LA FAMILIA DE MATERIAL DE CADA GASTO DE OBRA.
//
// POR QUÉ EXISTE (20/07). "De Compras empecemos a trabajar el tema materiales civil y materiales
// mantenimiento". Son $192.594.039 en 420 filas — el bloque de plata más grande de la empresa
// después de la gente, y hasta hoy no tenía ninguna pestaña ni ningún corte. En Compras el único
// dato de QUÉ se compró es texto libre: 476 grafías distintas para 736 filas ("CEMENTO X 25",
// "cemento y plasticor", "Cemento para Curado de Columnas"). Así no se puede comparar contra un
// presupuesto ni ver un desvío.
//
// PARA QUÉ SIRVE, CONCRETAMENTE. La familia es la unidad en la que se cotiza una obra. Con el gasto
// real agrupado por familia se puede: contrastar contra el presupuesto de la obra, ver con qué
// proveedor se concentra cada familia (poder de negociación), y alimentar la próxima cotización con
// lo que costó de verdad. Sin familia, $192,6M son una sola bolsa.
//
// EL ORDEN IMPORTA, y no es alfabético. Gana la primera que matchea:
//   · "Subcontratos" va primero: si alguien hizo la cloaca por contrato, lo que importa para el costo
//     es que fue subcontratado, no que era plomería.
//   · "Chapa y perfiles" va antes que "Hierro": un PNC es perfil, no hierro de armadura, y son
//     mercados distintos con proveedores distintos.
//   · "Ferretería y consumibles" va última a propósito: es el cajón de sastre y se comería medio
//     listado si estuviera arriba.
//
// LO QUE NO HACE: inventar. 31 filas ($12.603.277) dicen "materiales varios", "???" o están vacías.
// Ésas salen como SIN CLASIFICAR y se listan aparte para que alguien las describa. Adivinarles una
// familia sería fabricar un dato — la planilla se vería más prolija y sería menos cierta.

/** Familias, EN ORDEN de prioridad. La primera que matchea gana. */
export const FAMILIAS = [
  ['Subcontratos y mano de obra', 'sub ?contrat|mano de obra|al tanto|replanteo|limpieza de lote'],
  ['Hormigón elaborado', 'hormig|h17|h21|hormiserv'],
  ['Chapa, perfiles y estructura metálica', 'chapa|perfil|pnc|angulo|ángulo|caño|tubo|plegado|alumetal|panel|regla|correa|vm ?[0-9]|montaje|castel|metalis|friolatina|soldar|plasma|esab'],
  ['Hierro y malla', 'hierro|malla|barra ?[0-9]|ø ?[0-9]|separador|alambre|estribo|sideragro|acerolatina'],
  ['Cemento, cal y áridos', 'cemento|calcemit|\\bcal\\b|arena|ripio|árido|arido|plasticor|grout|monotop|cuarzo'],
  ['Mampostería y ladrillos', 'ladrill|mamposteria|mampostería|bloque'],
  ['Pisos y revestimientos', 'piso|porcelanato|pegamento|nivelador|venier|ceramic|pastina'],
  ['Revoques, pintura y terminación', 'revoque|pintur|thinner|barniz|latex|látex|vitrolux|lija|rodillo|brocha|disco flap|sellador|yeso|fretacho'],
  ['Electricidad', 'electric|eléctric|foco|termica|térmica|cable|trielec'],
  ['Plomería, agua y cloacas', 'plomeria|plomería|cloaca|sanitari|agua potable|desague|desagüe|bomba|termotanque|calefon|inodoro|ducha|bacha|mesada|pluvial|pozo|canaleta|riego'],
  ['Aberturas, portones y herrería', 'porton|portón|puerta|reja|rejilla|persiana|bisagra|cerradura|herraje|cortina|escalera|estabilizador|rueda|boqueta'],
  ['Alquiler y traslado de equipos', 'alquiler|tijera|retro|excavadora|grua|grúa|autoelevador|auto ?elevador|traslado|bobcat|cortadora'],
  ['Combustible de obra', 'combustible|nafta|gasoil|diesel'],
  ['Seguridad e higiene / EPP', 'epp|barbijo|guante|gafas|mameluco|ropa de trabajo|higiene y seguridad|casco|fumigar'],
  ['Servicios de obra (baño, contenedor)', 'baño|contenedor|volquete|co2'],
  ['Ferretería y consumibles', 'tornillo|tarugo|clavo|disco|electrodo|amoladora|widea|cinta|espuma|silicona|sikaflex|sika|membrana|cola|chanfle|candado|grillete|tensor|manguera|manguito|bateria|batería|pila|repuesto|herramient|hilti|makita'],
]

export const SIN_FAMILIA = 'SIN CLASIFICAR'

/** Los dos rubros de caja que tienen familia de material. Los demás no son materiales. */
export const RUBROS_CON_FAMILIA = ['Materiales Civil', 'Materiales Mantenimiento']

/**
 * NÚCLEO PURO: qué familia de material es un gasto.
 * Mira el concepto Y el proveedor: hay filas sin concepto donde el proveedor lo dice todo
 * (Hormiserv es hormigón, Sideragro es hierro).
 * @param {{concepto?:string, proveedor?:string}} fila
 * @returns {string}
 */
export function familiaDeMaterial({ concepto, proveedor } = {}) {
  const t = `${concepto ?? ''} ${proveedor ?? ''}`
  for (const [nombre, patron] of FAMILIAS) if (new RegExp(patron, 'i').test(t)) return nombre
  return SIN_FAMILIA
}

/**
 * La MISMA regla como columna de Compras. Se genera desde FAMILIAS, no se escribe aparte.
 * Sólo clasifica las filas cuyo rubro de caja es material: para un F931 o un impuesto, "familia de
 * material" no significa nada y poner algo sería ruido.
 * @param {string} colRubro rango de la columna de rubro dentro de Compras (ej. '$AC$4:$AC')
 * @returns {string} ARRAYFORMULA en es-AR
 */
export function formulaFamilia(colRubro = '$AC$4:$AC') {
  // Las TRES columnas, en este orden. K ("Detalles / Obra") es imprescindible: en Compras el detalle
  // real suele estar ahí y el concepto sólo tiene la coletilla. "Sub contratista" vive en K y
  // "CLOACA Y AGUA POTABLE" en L — mirando sólo L, los subcontratos caían de $10,1M a $1,7M.
  const texto = 'LOWER($K$4:$K&" "&$L$4:$L&" "&$E$4:$E)'
  let f = `"${SIN_FAMILIA}"`
  for (const [nombre, patron] of [...FAMILIAS].reverse()) {
    f = `IF(REGEXMATCH(${texto};"${patron.replace(/"/g, '""')}");"${nombre}";${f})`
  }
  const esMaterial = RUBROS_CON_FAMILIA.map((r) => `(${colRubro}="${r}")`).join('+')
  return `=ARRAYFORMULA(IF((${esMaterial})=0;"";${f}))`
}

/**
 * NÚCLEO PURO: reparte filas de material por familia.
 * @returns {{por_familia:Array, total:number, sin_clasificar:{filas:number, monto:number}}}
 */
export function repartirFamilias(filas = []) {
  const acc = new Map()
  let total = 0
  for (const f of filas) {
    const k = familiaDeMaterial(f)
    const m = Number(f.total) || 0
    total += m
    const a = acc.get(k) ?? { familia: k, filas: 0, monto: 0 }
    a.filas++; a.monto += m
    acc.set(k, a)
  }
  const sc = acc.get(SIN_FAMILIA) ?? { filas: 0, monto: 0 }
  return {
    por_familia: [...acc.values()].filter((f) => f.familia !== SIN_FAMILIA).sort((a, b) => b.monto - a.monto),
    total,
    sin_clasificar: { filas: sc.filas, monto: sc.monto },
  }
}
