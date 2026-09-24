// EL NOMBRE DE UN PROVEEDOR SE ESCRIBE EN UN SOLO LUGAR (dueño, 24/09/2026: «noto nombres distintos en
// distintas secciones de la app … lo mismo con proveedores»).
//
// El mismo proveedor salía «PEREZ GARCIA MARISOL BIBIANA» en Compras (el titular fiscal que trae el
// comprobante de ARCA) y «Corralon Progreso» en Proveedores, en el Sheet y en los cheques: 613 de 702
// comprobantes de compra decían un nombre distinto del maestro para el MISMO CUIT.
//
// ═══ LA REGLA ═══
//
//   · La IDENTIDAD es el CUIT (memoria «ML no vincula, CUIT sí»): nunca un nombre parecido.
//   · El NOMBRE es el del maestro `proveedores.nombre`, resuelto POR CUIT. Es como el dueño y el
//     Sheet llaman al proveedor («Corralon Progreso», «Movistar», «DUPEC»).
//   · La razón social (la del maestro, o la que trae ARCA en el comprobante) es el DATO FISCAL: se
//     muestra como detalle, al lado, no en lugar del nombre.
//   · Sin maestro para ese CUIT, lo que trae el papel (es lo único que hay).
//
// Lo fija `src/shared/proveedores/nombre-en-pantallas.test.ts`.

/** «30-71649049-8», «30716490498 » → «30716490498». Sin 11 dígitos, `null`: no es un CUIT. */
export function claveCuit(cuit: string | null | undefined): string | null {
  const d = String(cuit ?? '').replace(/\D/g, '')
  return d.length === 11 ? d : null
}

export interface ProveedorConNombre { nombre?: string | null; razon_social?: string | null }

/** El nombre para mostrar de un proveedor del maestro: su nombre; sin él, su razón social. */
export function nombreDeProveedor(p: ProveedorConNombre | null | undefined): string | null {
  const n = String(p?.nombre ?? '').trim()
  if (n) return n
  const r = String(p?.razon_social ?? '').trim()
  return r || null
}

/** El nombre de quien emitió un papel: el del maestro para ese CUIT; si el CUIT no está en el
 *  maestro, el texto del papel. */
export function nombrePorCuit(
  maestro: ReadonlyMap<string, string>, cuit: string | null | undefined, delPapel: string | null | undefined,
): string | null {
  const k = claveCuit(cuit)
  return (k && maestro.get(k)) || (String(delPapel ?? '').trim() || null)
}
