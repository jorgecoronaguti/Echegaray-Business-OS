// QUIÉN ES SUBCONTRATISTA Y QUIÉN NO — LA ÚNICA DECISIÓN DE TODO ESTE MÓDULO.
//
// El dueño lo planteó así: *"busques las veces q aparecen «nombres sueltos» como proveedores,
// pueden ser q se encargan muebles o trabajos puntuales, como gerson castro, tello, fredes"*.
//
// ═══ POR QUÉ ESTA LISTA ES DATO DE ORIGEN Y NO UNA REGLA ═══
//
// No hay ningún campo en «Compras» que lo diga. Se probaron los tres candidatos:
//   · `¿Proveedor comercial? (OS)` vale 1 para los 116 proveedores: no discrimina.
//   · `Categoría` B/N separa con comprobante de sin comprobante, no persona de empresa.
//   · `proveedores.cuit` está en NULL para todos éstos: no hay identidad fiscal con que cortar.
// Y una regla por el nombre tampoco alcanza: «Robles Jose Maria» cobra honorarios mensuales y
// «Diego Sosa» vende ladrillones — los dos son nombres de persona y ninguno es subcontratista.
//
// Así que la clasificación es un JUICIO, tomado leyendo el concepto de los 878 comprobantes, y
// vive escrito acá para que se pueda discutir línea por línea. Los MONTOS, en cambio, no se
// escriben nunca: los calcula el Sheet por fórmula contra «Compras». Si mañana entra un
// comprobante nuevo de Tello, el cuadro lo toma solo.
//
// ═══ LOS TRES GRUPOS ═══
//
// Separarlos no es prolijidad: si los honorarios del ingeniero y los ladrillones entran en el
// mismo total, el número «cuánto llevamos con subcontratistas» queda mal y nadie se entera.

/** Contratados para un trabajo puntual de obra: mano de obra, muebles a medida, fletes. */
export const SUBCONTRATISTAS = [
  ['Gerson Castro', 'Instalaciones sanitarias: cloacas, agua, pozos y desagües'],
  ['Pedro Fredes', 'Armado de hierro y estructura de hormigón'],
  ['PEDRO TELLO', 'Pisos industriales y hormigonado'],
  ['AGUERO', 'Revoques grueso y fino (trabajo al tanto)'],
  ['Angel Fernandez', 'Montaje de estructura metálica y alquiler de grúa'],
  ['Leandro Rojas', 'Muebles a medida: oficina, baño y cocina'],
  ['Machuca Hector', 'Plegados para muros'],
  ['Don Jorge', 'Flete: traslado de Bobcat'],
  ['Pocero', 'Pozos para aguas blancas'],
  ['Fernandez', 'Limpieza de lote'],
  ['Diego Morales', 'Flete: viajes de camión regador'],
  ['Lucas Guzman', 'Mano de obra de pintura'],
  ['Alberto Lahoz', 'Traslado de estructuras y provisión de cal'],
  ['Enzo Ferrarini', 'Replanteo de cierre perimetral'],
  ['Herrero', 'Herrería: ruedas para portón'],
]

/** Nombre de persona, pero con una relación CONTINUA y profesional. No son trabajo puntual. */
export const PROFESIONALES = [
  ['Robles Jose Maria', 'Honorarios profesionales (mensual)'],
  ['Meglioli Facundo Fabian', 'Higiene y Seguridad (mensual)'],
  ['Ruviño Matias Esteban', 'Provisión de agua (mensual)'],
  ['Baragaño Cristian', 'Honorarios de abogado'],
]

/** Nombre de persona, pero lo que vende es una COSA: materiales, repuestos, una reparación. */
export const COMERCIOS = [
  ['Diego Sosa', 'Ladrillones'],
  ['Gimenez Mecanico', 'Reparación de caja de transmisión y embrague'],
  ['Perera Walter Daniel', 'Arreglo de camión'],
  ['Freddy', 'Repuestos: bujías'],
  ['Janin', 'Materiales varios'],
  ['Alvarado Mariel Edith', 'Grout'],
  ['Pablo Issa', 'Reparación y rectificación de camión'],
  ['Vicente Marrelli', 'Repuestos varios'],
  ['Cobos Matias Ivan', 'Materiales varios y elementos de protección personal'],
  ['Leites Maldonado Gustavo Eduardo', 'Elementos de protección personal (EPP)'],
  ['Lopez José Luis', 'Aceites lubricantes'],
  ['Juan Navarro', 'Bomba de agua Mercedes 608D'],
  ['Gimenez Jose Luis', 'Piñón de hormigonera'],
  ['JM', 'Asado en taller'],
]

/**
 * ALIAS: el mismo nombre escrito de dos formas.
 *
 * «Gerson Castro» cobra en Compras desde marzo y hasta el 03/08/2026; el 05/08 aparece un alta de
 * AFIP a nombre de CASTRO GALVAN GERSON ULISES, con baja el 12/08. Nombre de pila poco común más
 * primer apellido: la coincidencia es fuerte. Pero NO está confirmada — en Compras no hay CUIT y
 * `proveedores.cuit` está vacío—, así que se declara como inferencia y no se fusiona nada.
 */
export const ALIAS_PROBABLE = [
  { enCompras: 'Gerson Castro', enLegajos: 'CASTRO GALVAN GERSON ULISES', confianza: 'INFERENCIA (nombre, sin CUIT que lo confirme)' },
]

export const GRUPOS = [
  { clave: 'sub', titulo: 'SUBCONTRATISTAS — trabajo puntual de obra', filas: SUBCONTRATISTAS },
  { clave: 'prof', titulo: 'NO son subcontratistas · servicio profesional continuo', filas: PROFESIONALES },
  { clave: 'com', titulo: 'NO son subcontratistas · venden materiales, repuestos o una reparación', filas: COMERCIOS },
]
