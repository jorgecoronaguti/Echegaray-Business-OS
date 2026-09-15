// LA CLAVE CON LA QUE SE COMPARAN NOMBRES DE OBRA Y DE CLIENTE — una sola definición.
//
// Vivía adentro de `jornales-a-registros-hh.mjs` y la web no podía importarla sin arrastrar el parser
// de JORNALES entero. La necesita `obraDeCompra.ts` (15/09/2026): el desplegable de Compras armaba
// «Sin obra – Messina» y «Sin obra – MESSINA» como dos opciones porque agrupaba por `cliente_texto`
// crudo en vez de por el cliente canónico de `cliente_alias`, que se indexa con ESTA clave.

/** Minúsculas, sin acentos, sólo letras y números separados por un espacio. */
export function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ').trim()
}

/** La MISMA clave que `public.norm_obra` (la que indexa `obra_alias`): sin artículos ni «de/del».
 *  Si acá se normaliza distinto que en la base, un alias cargado no se encuentra y parece que falta. */
export const normAlias = (s) => norm(s).replace(/\b(la|el|los|las|de|del)\b/g, ' ').replace(/\s+/g, ' ').trim()
