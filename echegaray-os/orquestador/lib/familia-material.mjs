// QUÉ SE COMPRÓ — LA FAMILIA DE MATERIAL DE CADA GASTO DE OBRA.
//
// POR QUÉ EXISTE (20/07). "De Compras empecemos a trabajar el tema materiales civil y materiales
// mantenimiento". Son el bloque de plata más grande de la empresa después de la gente, y en Compras
// el único dato de QUÉ se compró es texto libre: 476 grafías distintas para 736 filas. Así no se
// puede comparar contra un presupuesto ni ver un desvío.
//
// ═══ LA REESCRITURA: "hay conceptos que no están bien" ═══
//
// El dueño tenía razón y el error era de diseño mío. La primera versión metía CONCEPTO, DETALLE y
// PROVEEDOR en una sola bolsa de texto y buscaba ahí. Las tres columnas dicen cosas distintas:
//
//   K = Detalles / Obra   → el FRENTE de obra: "Galpon 7", "Mamposteria", "Cierre Perimetral"
//   L = Concepto          → QUÉ se compró: "Insumos electricos", "PNC 160", "Vitrolux"
//   E = Proveedor         → QUIÉN lo vendió
//
// Mezclarlas producía errores caros y sistemáticos, todos medidos sobre las filas reales:
//   · "Trielec · Mamposteria · Insumos electricos" caía en MAMPOSTERÍA. "Mampostería" es el nombre
//     del frente de obra, no lo que se compró: son materiales eléctricos.
//   · "SIDERAGRO · Vitrolux" caía en HIERRO, porque el patrón de hierro incluía el nombre del
//     proveedor. Sideragro vende hierro, pero también pintura, electrodos y rejas.
//   · "Combustibles Barcelo · combustible · auto elevador" caía en ALQUILER DE EQUIPOS, porque
//     "autoelevador" matcheaba antes. Es combustible: el autoelevador es dónde se puso, no qué se
//     compró.
//
// LA REGLA NUEVA, en orden: primero se mira QUÉ se compró (L), después el frente (K) y sólo al final
// QUIÉN lo vendió (E). El proveedor es la señal más débil y por eso va última: un corralón vende de
// todo. Con una excepción declarada — el COMBUSTIBLE se busca en el texto completo antes que nada,
// porque la palabra es decisiva aparezca donde aparezca y "Combustibles Barcelo" no vende otra cosa.
//
// LO QUE NO HACE: inventar. Las filas que dicen "materiales varios", "???" o están vacías salen como
// SIN CLASIFICAR y se listan aparte para que alguien las describa. Adivinarles una familia dejaría
// la planilla más prolija y menos cierta.

/** El combustible se decide sobre el texto completo y antes que todo lo demás. Ver el encabezado. */
export const COMBUSTIBLE = ['Combustible de obra', 'combustible|nafta|gasoil|diesel']

/**
 * Familias, EN ORDEN de prioridad dentro de cada pasada. La primera que matchea gana.
 *
 * EL ORDEN NO ES ALFABÉTICO Y ES PARTE DE LA REGLA:
 *   · "Subcontratos" va primero: si alguien hizo la cloaca por contrato, lo que importa para el
 *     costo es que fue subcontratada, no que era plomería.
 *   · "Chapa y perfiles" va antes que "Hierro": un PNC es perfil, no hierro de armadura, y son
 *     mercados distintos con proveedores distintos.
 *   · "Ferretería y consumibles" va última a propósito: es el cajón de sastre y se comería medio
 *     listado si estuviera arriba.
 *
 * LOS NOMBRES DE PROVEEDOR SE SACARON de los patrones de familia. Estaban ahí como atajo y eran la
 * causa de los peores errores: un proveedor no determina qué vendió. Los que quedan viven aparte, en
 * PROVEEDOR_MONOPRODUCTO, y sólo deciden cuando el concepto y el frente no dicen nada.
 */
export const FAMILIAS = [
  ['Subcontratos y mano de obra', 'sub ?contrat|mano de obra|al tanto|replanteo|limpieza de lote'],
  ['Hormigón y premoldeados', 'hormig|h17|h21|premoldeado|poste de horm'],
  ['Chapa, perfiles y estructura metálica', 'chapa|perfil|pnc|angulo|ángulo|caño|tubo|plegado|panel|regla|correa|vm ?[0-9]|montaje|soldar|plasma'],
  ['Hierro y malla', 'hierro|malla|barra ?[0-9]|ø ?[0-9]|separador|alambre|estribo|planchuela'],
  ['Cemento, cal y áridos', 'cemento|\\bcal\\b|arena|ripio|árido|arido|plasticor|grout|monotop|cuarzo'],
  ['Mampostería y ladrillos', 'ladrill|bloque'],
  ['Pisos y revestimientos', 'piso|porcelanato|pegamento|nivelador|ceramic|pastina'],
  ['Revoques, pintura y terminación', 'revoque|pintur|thinner|barniz|latex|látex|vitrolux|lija|rodillo|brocha|disco flap|sellador|yeso|fretacho'],
  ['Electricidad', 'electric|eléctric|foco|termica|térmica|cable'],
  ['Plomería, agua y cloacas', 'plomeria|plomería|cloaca|sanitari|agua potable|desague|desagüe|bomba|termotanque|calefon|inodoro|ducha|bacha|mesada|pluvial|pozo|canaleta|riego'],
  ['Aberturas, portones y herrería', 'porton|portón|puerta|reja|rejilla|persiana|bisagra|cerradura|herraje|cortina|escalera|estabilizador|rueda|boqueta'],
  ['Alquiler y traslado de equipos', 'alquiler|tijera|retro|excavadora|grua|grúa|autoelevador|auto ?elevador|traslado|bobcat|cortadora'],
  COMBUSTIBLE,
  ['Seguridad e higiene / EPP', 'epp|barbijo|guante|gafas|mameluco|ropa de trabajo|higiene y seguridad|casco|fumigar'],
  ['Servicios de obra (baño, contenedor, agua)', 'baño|bano|contenedor|volquete|co2|agua de obra'],
  ['Ferretería y consumibles', 'tornillo|tarugo|clavo|disco|electrodo|amoladora|widea|cinta|espuma|silicona|sikaflex|sika|membrana|cola|chanfle|candado|grillete|tensor|manguera|manguito|bateria|batería|pila|repuesto|herramient|hilti|makita'],
]

/** Proveedores monoproducto: sólo deciden cuando el concepto y el frente no dicen nada. */
export const PROVEEDOR_MONOPRODUCTO = [
  ['Hormigón y premoldeados', 'hormiserv'],
  ['Chapa, perfiles y estructura metálica', 'alumetal|metalis|friolatina|esab'],
  ['Combustible de obra', 'combustible'],
]

export const SIN_FAMILIA = 'SIN CLASIFICAR'

/** Los dos rubros de caja que tienen familia de material. Los demás no son materiales. */
export const RUBROS_CON_FAMILIA = ['Materiales Civil', 'Materiales Mantenimiento']

const busca = (texto, lista) => {
  const t = String(texto ?? '')
  if (!t.trim()) return null
  for (const [nombre, patron] of lista) if (new RegExp(patron, 'i').test(t)) return nombre
  return null
}

/**
 * NÚCLEO PURO: qué familia de material es un gasto.
 * @param {{concepto?:string, detalle?:string, proveedor?:string}} fila
 *   concepto = columna L (qué se compró) · detalle = columna K (frente de obra) · proveedor = E
 * @returns {string}
 */
export function familiaDeMaterial({ concepto, detalle, proveedor } = {}) {
  const todo = `${concepto ?? ''} ${detalle ?? ''} ${proveedor ?? ''}`
  // Excepción declarada: el combustible se reconoce en cualquier columna.
  if (new RegExp(COMBUSTIBLE[1], 'i').test(todo)) return COMBUSTIBLE[0]
  return busca(concepto, FAMILIAS)
    ?? busca(detalle, FAMILIAS)
    ?? busca(proveedor, PROVEEDOR_MONOPRODUCTO)
    ?? SIN_FAMILIA
}

/**
 * La MISMA regla como columna de Compras. Se genera desde las listas, no se escribe aparte.
 * Sólo clasifica las filas cuyo rubro de caja es material: para un F931 "familia de material" no
 * significa nada y poner algo sería ruido.
 * @param {string} colRubro rango de la columna de rubro dentro de Compras (ej. '$AC$4:$AC')
 * @returns {string} ARRAYFORMULA en es-AR
 */
export function formulaFamilia(colRubro = '$AC$4:$AC') {
  const esc = (p) => p.replace(/"/g, '""')
  const cadena = (rango, lista, sino) => {
    let f = sino
    for (const [nombre, patron] of [...lista].reverse()) {
      f = `IF(REGEXMATCH(LOWER(${rango}&"");"${esc(patron)}");"${nombre}";${f})`
    }
    return f
  }
  const L = '$L$4:$L', K = '$K$4:$K', E = '$E$4:$E'
  // Las tres pasadas, en orden: qué se compró, en qué frente, quién lo vendió.
  const porProveedor = cadena(E, PROVEEDOR_MONOPRODUCTO, `"${SIN_FAMILIA}"`)
  const porDetalle = cadena(K, FAMILIAS, porProveedor)
  const porConcepto = cadena(L, FAMILIAS, porDetalle)
  // El combustible primero y sobre el texto completo (ver el encabezado del archivo).
  const combustible = `REGEXMATCH(LOWER(${L}&" "&${K}&" "&${E});"${esc(COMBUSTIBLE[1])}")`
  const esMaterial = RUBROS_CON_FAMILIA.map((r) => `(${colRubro}="${r}")`).join('+')
  return `=ARRAYFORMULA(IF((${esMaterial})=0;"";IF(${combustible};"${COMBUSTIBLE[0]}";${porConcepto})))`
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
