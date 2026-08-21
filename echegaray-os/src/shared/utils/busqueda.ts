// BUSCAR TEXTO — la regla, sin pantalla.
//
// Vive acá y no dentro de una pantalla porque el mismo criterio lo necesitan la cartera de obras
// (server component), la lista de clientes (cliente), la de cuentas y las cuatro pantallas que
// recién ahora tienen buscador. Cuando cada una se escribió su propia normalización aparecieron
// versiones que no coincidían: una recortaba los espacios y otra no, así que «  messina» encontraba
// en un listado y no encontraba en el de al lado. El mismo tipeo tiene que dar el mismo resultado en
// todas, y eso sólo se garantiza con una definición.

/** Sin tildes, sin mayúsculas y sin espacios de sobra: «Galpón», «galpon» y « GALPON » son lo mismo
 *  para quien busca. Nadie escribe los acentos cuando busca algo. */
export function plano(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * ¿El texto contiene lo que se buscó?
 *
 * Una consulta VACÍA da `true`: «no filtré nada» no puede vaciar una lista. Es el caso que más se
 * rompe solo —un `includes('')` está bien, pero un `q.length > 0 && ...` mal puesto deja la pantalla
 * en blanco apenas se borra el campo— y por eso está declarado acá y probado.
 */
export function contiene(texto: string | null | undefined, q: string): boolean {
  const buscado = plano(q)
  return buscado === '' || plano(texto).includes(buscado)
}

/** Busca sobre varios campos como si fueran uno solo: «juan albañil» encuentra al Juan albañil. */
export function contieneEnAlguno(campos: (string | null | undefined)[], q: string): boolean {
  return contiene(campos.filter(Boolean).join(' '), q)
}

/**
 * LA URL DE UNA BÚSQUEDA — lo que antes armaba el navegador al enviar el formulario.
 *
 * Los buscadores del OS guardan su estado en la URL para que la vista filtrada se pueda pasar por
 * chat, recargar y volver con el botón de atrás. Al dejar de ser un `form` GET, esta función pasó a
 * ser quien arma esa URL, y tiene que armarla IGUAL que la armaba el navegador.
 *
 * ═══ POR QUÉ `q` VIAJA AUNQUE ESTÉ VACÍA ═══
 *
 * Un navegador envía todos los campos con nombre, incluso los vacíos: borrar el texto y enviar
 * produce `?q=`, no una URL sin `q`. Esa diferencia no es cosmética. `/obras` recuerda la última
 * vista en una cookie y la restaura SÓLO cuando la URL no trae ninguna clave de vista
 * (`vistaRecordada.queryARestaurar`): si al borrar el campo se omitiera `q`, el middleware
 * concluiría que nadie eligió nada y volvería a poner la búsqueda anterior. Borrar el buscador
 * dejaría la lista filtrada.
 */
export function urlDeBusqueda(
  accion: string,
  oculto: Record<string, string | undefined> | undefined,
  q: string,
): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(oculto ?? {})) if (v) params.set(k, v)
  params.set('q', q.trim())
  return `${accion}?${params.toString()}`
}
