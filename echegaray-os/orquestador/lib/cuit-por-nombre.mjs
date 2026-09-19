// EL CUIT DE UN PROVEEDOR, CRUZANDO SU NOMBRE CONTRA ARCA — Y SÓLO SI ES INEQUÍVOCO.
//
// ═══ EL PEDIDO, Y LO QUE APARECIÓ AL MIRARLO (31/07) ═══
//
// El dueño: "antes tenia mas completo el listado de cuits presente en el cuadro 2 de proveedores,
// arreglarlo". Era cierto que estaba más completo. También era cierto que estaba MAL: al menos cinco
// filas mostraban el CUIT de OTRA empresa, porque venían de una superposición de dos diseños que corrió
// la columna. Comprobado contra ARCA:
//
//   · Gruas San Blas mostraba 30-56736337-2, que es de ALUMETAL S A
//   · Mariana SA mostraba 23-17759092-4; el real es 30-69185207-1
//   · Robles Pintureria mostraba 30-71216798-6; el real es 30-71135522-3
//   · La Aguilana mostraba 30-67977798-6, que es de FRIOLATINA SA
//   · Lliteras mostraba 30-56736337-2, que es de ALUMETAL; el real es 30-70839055-7 (MADERAS LLITERAS)
//   · Pintureria Cordoba mostraba 30-68164173-0, que es de HORMISERV SRL
//
// UN CUIT AJENO ES PEOR QUE UNO VACÍO. Con un CUIT equivocado se transfiere a otra cuenta, se retiene
// mal y se declara mal. Una celda vacía sólo dice "no lo sé", que es la verdad.
//
// ═══ POR QUÉ EL MATCH ANTERIOR DEJABA 22 VACÍOS ═══
//
// Cruzaba el nombre de Compras contra `emisor_nombre` de ARCA con igualdad exacta normalizada. En
// Compras el dueño escribe "Alumetal" y ARCA dice "ALUMETAL S A"; "Hormiserv" contra "HORMISERV  SRL";
// "Mariana SA" contra "MARIANA  SOCIEDAD ANONIMA". Ninguno coincidía.
//
// ═══ LA REGLA: TODOS LOS TOKENS, Y ÚNICO ═══
//
// Coincide si TODOS los tokens significativos del nombre corto están en el nombre de ARCA. Y sólo vale
// si el candidato es ÚNICO: "Robles Pintureria" toca a ROBLES PINTURERIAS S.R.L. y a ROBLES JOSE MARIA
// por el token "robles", pero sólo la primera tiene además "pintureria" — ahí hay uno. Si quedaran dos,
// se devuelve null: adivinar cuál es de los dos es exactamente el error que esto viene a arreglar.

/** Las formas jurídicas y ruido que no distinguen a una empresa de otra. */
const RUIDO = new Set(['sa', 's', 'a', 'srl', 'sas', 'sh', 'ltda', 'sociedad', 'anonima', 'anónima',
  'r', 'l', 'y', 'de', 'del', 'la', 'el', 'los', 'las', 'e', 'hijos', 'cia'])

/** Tokens significativos de un nombre: sin tildes, minúsculas, sin formas jurídicas ni palabras cortas. */
export function tokens(nombre) {
  return String(nombre ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ')
    .filter((t) => t.length > 2 && !RUIDO.has(t))
}

/**
 * NÚCLEO PURO: el CUIT de `nombre` según los emisores de ARCA, o null si no es inequívoco.
 *
 * @param {string} nombre el nombre como lo escribe el dueño en Compras
 * @param {Array<{nombre:string, cuit:string}>} emisores los emisores distintos de ARCA
 * @returns {{cuit:string, razon:string, modo:'exacto'|'tokens'}|null}
 */
export function emparejarCuit(nombre, emisores = []) {
  const t = tokens(nombre)
  if (!t.length) return null
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  // 1 · igualdad normalizada: la más fuerte, gana siempre.
  const exacto = emisores.filter((e) => norm(e.nombre) === norm(nombre))
  if (exacto.length === 1) return { cuit: exacto[0].cuit, razon: exacto[0].nombre, modo: 'exacto' }
  // 2 · todos los tokens significativos del nombre corto están en el de ARCA. Se comparan por PREFIJO
  //     con un mínimo de 4 caracteres, porque "pintureria" y "pinturerias" son la misma palabra y una
  //     igualdad estricta dejaba a Robles Pintureria sin CUIT. La unicidad sigue siendo la red: si el
  //     prefijo trae dos empresas distintas, no se elige ninguna.
  // LA ASIMETRÍA IMPORTA. El dueño escribe la forma CORTA ("pintureria") y ARCA la larga
  // ("pinturerias"): el token de ARCA puede empezar con el suyo. Al revés NO: con el prefijo simétrico,
  // "maria" (de ROBLES JOSE MARIA) absorbía "mariana" y MARIANA SOCIEDAD ANONIMA quedaba ambigua contra
  // una persona distinta. Un mínimo de 4 caracteres evita que un token corto empareje media lista.
  const casa = (suyo, deArca) => suyo === deArca || (suyo.length >= 4 && deArca.startsWith(suyo))
  const cand = emisores.filter((e) => {
    const te = tokens(e.nombre)
    return t.every((x) => te.some((y) => casa(x, y)))
  })
  // ÚNICO O NADA. Dos candidatos significa que el nombre no alcanza para decidir.
  const cuits = new Set(cand.map((c) => String(c.cuit)))
  if (cuits.size !== 1) return null
  return { cuit: cand[0].cuit, razon: cand[0].nombre, modo: 'tokens' }
}

/** El mapa nombre-de-Compras → CUIT, para los nombres que se pueden resolver sin ambigüedad. */
export function mapaCuits(nombres = [], emisores = []) {
  const out = new Map(); const ambiguos = []
  for (const n of nombres) {
    const m = emparejarCuit(n, emisores)
    if (m) out.set(n, m)
    else if (tokens(n).length) ambiguos.push(n)
  }
  return { cuits: out, ambiguos }
}
