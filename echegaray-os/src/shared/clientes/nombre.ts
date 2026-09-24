// EL NOMBRE DE UN CLIENTE SE ESCRIBE EN UN SOLO LUGAR (dueño, 24/09/2026: «noto nombres distintos en
// distintas secciones de la app … o los clientes»).
//
// El mismo cliente salía «Franco Quattropani» (CRM), «Quattropani - Melisa García SAS» (la obra, texto
// de planilla copiado en `obra_canonica.cliente_texto`), «quattropani» (el slug, en Analíticas),
// «MESSINA» / «Messinas» / «Messina» según la obra, y «San Francisco» en Horas mientras el CRM decía
// «Javier Sánchez - San Francisco - IMOTOR».
//
// ═══ LA REGLA ═══
//
//   · La FUENTE es `clientes.nombre_comercial`, que se edita en la ficha del CRM. Una obra llega a su
//     cliente por `obra_canonica.cliente_id`, nunca por el texto.
//   · `obra_canonica.cliente_texto` es la etiqueta de la planilla: sólo se muestra cuando la obra NO
//     tiene cliente vinculado (y entonces es lo único que hay).
//   · El slug es una clave de URL, no un nombre: nunca se dibuja.
//   · Se muestra como está escrito (el nombre ya lo cura una persona: «ARCOR», «La Estrella»); sin
//     nombre comercial, la razón social.
//
// Si el dueño quiere que «San Francisco» se lea así en toda la app, lo cambia UNA vez en la ficha.
// Lo fija `src/shared/clientes/nombre-en-pantallas.test.ts`.

export interface ClienteConNombre {
  nombre_comercial?: string | null
  razon_social?: string | null
}

/** El nombre para mostrar de un cliente: su nombre comercial, o su razón social. `null` si no tiene. */
export function nombreDeCliente(c: ClienteConNombre | null | undefined): string | null {
  const comercial = String(c?.nombre_comercial ?? '').trim()
  if (comercial) return comercial
  const razon = String(c?.razon_social ?? '').trim()
  return razon || null
}

/** El cliente de una obra, como lo publica `obra_panel`: el vinculado (`cliente_nombre`, que ES
 *  `clientes.nombre_comercial`); sin vínculo, la etiqueta de la planilla. */
export function clienteDeObra(o: { cliente_nombre?: string | null; cliente_texto?: string | null } | null | undefined): string | null {
  return nombreDeCliente({ nombre_comercial: o?.cliente_nombre }) ?? (String(o?.cliente_texto ?? '').trim() || null)
}
