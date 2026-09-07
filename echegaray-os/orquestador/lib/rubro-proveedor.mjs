// EL RUBRO DE UN PROVEEDOR SE DEDUCE DE LO QUE VENDIÓ. NUNCA DE SU NOMBRE.
//
// ═══ POR QUÉ ESTO ES UNA FUNCIÓN PURA Y NO UNA CONSULTA ═══
//
// Un test que le pregunta a la base «¿qué rubro tiene Corralón Progreso?» afirma el estado del
// mundo de hoy: pasa a verde cuando alguien carga una compra y a rojo cuando alguien la corrige, sin
// que ninguna regla se haya roto. La REGLA —cuántas compras hacen falta, qué mayoría, qué familia
// pertenece a qué rubro— es lo que hay que poder romper a propósito, y por eso vive acá, separada
// de la lectura.
//
// ═══ LA DEDUCCIÓN PROHIBIDA ═══
//
// «Corralón» ⇒ Materiales es exactamente la clase de inferencia que este repo no hace: el nombre no
// es evidencia de nada —«Sanitarios OD S.A.S.» vende baños químicos y contenedores, no sanitarios—
// y una regla por palabras acierta lo suficiente como para que nadie revise las que falla. Acá la
// única entrada son las COMPRAS, con la familia de material que la pestaña ya tiene cargada.
//
// ═══ LO QUE NO SE PUEDE DEDUCIR SE DICE, NO SE RELLENA ═══
//
// De 36 proveedores, muchos tienen una sola compra, o todas sin clasificar. Ésos quedan sin rubro y
// la función devuelve POR QUÉ. Llenar la columna para que se vea llena es fabricar un dato.

/** El vocabulario. Lo impone además un CHECK en la base (`20260906T1800`). */
export const RUBROS = [
  'Materiales', 'Subcontratista', 'Fletes', 'Combustible', 'Equipos',
  'Servicios de obra', 'Seguridad e higiene',
]

/**
 * FAMILIA DE MATERIAL → RUBRO DEL PROVEEDOR.
 *
 * Las once primeras son materiales de construcción y colapsan en uno solo: al proveedor no lo define
 * qué renglón del cómputo abastece —un corralón vende cemento, hierro, pintura y ferretería—, lo
 * define que vende MATERIAL. Las cinco de abajo NO son material y no se pueden meter ahí sin
 * falsear cómo se lee el gasto:
 *
 *   COMBUSTIBLE        113 filas. Es consumo de flota y de equipos, no insumo de obra.
 *   EQUIPOS            alquiler y traslado: se paga por tiempo de uso, no por cantidad entregada.
 *   SERVICIOS DE OBRA  baño químico, contenedor, agua. Se contrata un servicio, no se compra nada.
 *   SEGURIDAD          EPP. Es obligación de ART y de seguridad e higiene, y se controla aparte.
 *   SUBCONTRATISTA     aporta MANO DE OBRA, y eso trae responsabilidad solidaria: ART con nómina y
 *                      cargas sociales, mes a mes. Es el único rubro cuya etiqueta dispara trabajo.
 *
 * `SIN CLASIFICAR` y el vacío NO están en este mapa a propósito: son la ausencia de dato, y tratarla
 * como una categoría más la volvería evidencia de algo.
 */
export const FAMILIA_A_RUBRO = {
  'Cemento, cal y áridos': 'Materiales',
  'Ferretería y consumibles': 'Materiales',
  'Plomería, agua y cloacas': 'Materiales',
  'Pisos y revestimientos': 'Materiales',
  'Revoques, pintura y terminación': 'Materiales',
  'Hierro y malla': 'Materiales',
  Electricidad: 'Materiales',
  'Aberturas, portones y herrería': 'Materiales',
  'Chapa, perfiles y estructura metálica': 'Materiales',
  'Hormigón y premoldeados': 'Materiales',
  'Mampostería y ladrillos': 'Materiales',

  'Combustible de obra': 'Combustible',
  'Alquiler y traslado de equipos': 'Equipos',
  'Servicios de obra (baño, contenedor, agua)': 'Servicios de obra',
  'Seguridad e higiene / EPP': 'Seguridad e higiene',
  'Subcontratos y mano de obra': 'Subcontratista',
}

/**
 * CUÁNTA EVIDENCIA HACE FALTA.
 *
 * Tres compras clasificadas y dos tercios de mayoría. Con dos compras la «mayoría» es una sola
 * fila; con la mitad más uno, un proveedor mixto queda etiquetado por un voto.
 *
 * SUBCONTRATISTA PIDE MÁS Y NO ES UN CAPRICHO: marcar a alguien como subcontratista es afirmar que
 * aporta mano de obra en obra, y eso abre el control mensual de ART con nómina y de cargas sociales.
 * Equivocarse de más cuesta trabajo administrativo sobre un proveedor que no lo necesita;
 * equivocarse de menos deja sin control a uno que sí. Se pide una muestra que no pueda ser una
 * factura suelta de mano de obra dentro de un corralón, que es el caso real medido: Corralón
 * Progreso tiene 213 compras de material y UNA de subcontrato.
 */
export const MINIMO = { filas: 3, mayoria: 2 / 3 }
export const MINIMO_SUBCONTRATISTA = { filas: 5, mayoria: 0.8 }

/**
 * @param {Array<{familia: string|null}>} compras Las compras del proveedor, no anuladas.
 * @returns {{rubro: string|null, evidencia: string}} `rubro` null = no se pudo deducir, y la
 *   evidencia dice por qué. La evidencia NUNCA es vacía: sin ella un rubro deducido no se audita.
 */
export function deducirRubro(compras) {
  const total = compras.length
  if (!total) return { rubro: null, evidencia: 'sin compras leídas' }

  const porRubro = new Map()
  for (const c of compras) {
    const rubro = FAMILIA_A_RUBRO[String(c.familia ?? '').trim()]
    if (rubro) porRubro.set(rubro, (porRubro.get(rubro) ?? 0) + 1)
  }

  const clasificadas = [...porRubro.values()].reduce((a, b) => a + b, 0)
  if (!clasificadas) {
    return { rubro: null, evidencia: `${total} ${plural(total)} y ninguna con familia de material cargada` }
  }

  const [rubro, n] = [...porRubro.entries()].sort((a, b) => b[1] - a[1])[0]
  const piso = rubro === 'Subcontratista' ? MINIMO_SUBCONTRATISTA : MINIMO
  // La evidencia la lee el dueño en la ficha: «1 de 1 compra clasificadas son Materiales» se lee
  // como un error del sistema y le quita crédito a todo lo demás que la línea afirma.
  const cuenta = clasificadas === 1
    ? `1 de 1 compra clasificada es ${rubro}`
    : `${n} de ${clasificadas} compras clasificadas son ${rubro}`

  if (clasificadas < piso.filas) {
    return { rubro: null, evidencia: `${cuenta}: son pocas para deducir (hacen falta ${piso.filas})` }
  }
  if (n / clasificadas < piso.mayoria) {
    const pct = Math.round((n / clasificadas) * 100)
    return { rubro: null, evidencia: `${cuenta} (${pct} %): no alcanza la mayoría que hace falta` }
  }
  // El total crudo va SIEMPRE en la evidencia, aunque no participe de la cuenta: si un proveedor
  // tiene 152 compras y la deducción salió de 96, el que la lea tiene que poder ver las dos.
  const sinClasificar = total - clasificadas
  return {
    rubro,
    evidencia: sinClasificar
      ? `${cuenta}; ${sinClasificar} sin familia cargada quedan fuera de la cuenta`
      : cuenta,
  }
}

const plural = (n) => (n === 1 ? 'compra' : 'compras')

/**
 * AGRUPA LAS FILAS DEL CRUCE POR PROVEEDOR. Función aparte porque acá vive un defecto sutil.
 *
 * ═══ «SIN COMPRAS» Y «COMPRAS SIN CLASIFICAR» SON DOS TRABAJOS DISTINTOS ═══
 *
 * El cruce es un `left join`, así que un proveedor sin ninguna compra aparece igual, con una fila de
 * familia null. Un proveedor CON compras pero todas sin familia cargada aparece con N filas de
 * familia null. Si se distinguen mirando «¿alguna familia es no-null?», los dos casos se confunden y
 * el segundo se reporta como «sin compras leídas» — que es falso y, peor, esconde el trabajo:
 * medido el 06/09/2026, Robles José María tiene 8 compras, Mariana SA 2 y Modica SA 1, todas sin
 * familia. Decir que no compraron nada borra las once del tablero de lo que falta clasificar.
 *
 * Por eso la marca la trae la consulta (`hubo`), y no se infiere del contenido.
 *
 * @param {Array<{id: string, nombre: string, por_cuit: boolean, familia: string|null, hubo: boolean}>} filas
 */
export function agruparPorProveedor(filas) {
  const por = new Map()
  for (const f of filas) {
    const p = por.get(f.id) ?? { id: f.id, nombre: f.nombre, porCuit: f.por_cuit, compras: [] }
    if (f.hubo) p.compras.push({ familia: f.familia })
    por.set(f.id, p)
  }
  return [...por.values()]
}
