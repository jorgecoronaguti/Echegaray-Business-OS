// A QUÉ CLIENTE PERTENECE UNA FILA DE COBRANZAS. NÚCLEO PURO: decide, no escribe.
//
// ═══ EL AGUJERO, MEDIDO EL 05/09/2026 ═══
//
// `public.cobranzas` tenía 96 filas y `cliente_id` NULL en las 96. La columna la agregó la
// migración del CRM; `sync-cobranzas.mjs` nunca la escribió. Consecuencia: la vista
// `cliente_cuenta_corriente` —que filtra por `cliente_id is not null`— devolvía CERO filas para
// todo el mundo, incluido `service_role`. La cara «Cuenta corriente» de la ficha estaba vacía por
// dos motivos independientes: un permiso que faltaba y un dato que nunca se escribió. Arreglar uno
// solo no habría cambiado nada en la pantalla, y habría parecido que sí se arregló.
//
// ═══ POR QUÉ VA EN EL SYNC Y NO EN UN BACKFILL ═══
//
// `sync-cobranzas.mjs` hace `delete where origen='cobranzas_sheet'` y reinserta todo. Un backfill
// duraría hasta la próxima corrida. El vínculo se resuelve en el momento de escribir la fila.
//
// ═══ CÓMO SE RESUELVE, Y POR QUÉ NO ES «PARECIDO» ═══
//
// El rótulo del Sheet no es el nombre del cliente: es cómo lo llama la administración.
//
//     «IMOTOR/San Francisco/JAVI SANCHEZ»   →   Javier Sánchez - San Francisco - IMOTOR
//     «LA ESTRELLA /ALIMENTOS DEL SUR SAS»  →   La Estrella · Alimentos del Sur SAS
//
// Ninguno CONTIENE al otro, así que la contención textual no alcanza. Pero tampoco se usa
// similitud: `identidad.mjs` ya midió que el parecido no vincula entidades en este OS.
//
// Lo que se usa es TOKEN DISTINTIVO. Un token de 4+ letras que aparece en el rótulo y en el nombre
// (comercial o razón social) de UN SOLO cliente. «messina», «imotor», «quattropani», «estrella»
// son distintivos; «alimentos» también, porque ningún otro cliente lo tiene. Si el mismo token
// alcanza a dos clientes, no distingue a nadie y se descarta ANTES de comparar — no después.
//
// Y si un rótulo alcanza a dos clientes por tokens distintos, no se elige: queda en NULL. Una
// cobranza colgada del cliente equivocado es plata en la cuenta corriente de otro.

import { normalizar } from './ml/normalizar.mjs'

/** Formas societarias y conectores: aparecen en medio catálogo y no distinguen a nadie. */
const VACIAS = new Set([
  'sas', 'srl', 'sociedad', 'anonima', 'responsabilidad', 'limitada', 'sacif', 'saic',
  'obra', 'obras', 'cliente', 'del', 'las', 'los', 'para', 'con', 'por',
])

/**
 * Los tokens útiles de un texto: 4+ letras, sin formas societarias.
 *
 * EL `toLowerCase()` NO ES COSMÉTICO Y CASI ME COME. `normalizar()` devuelve MAYÚSCULAS —saca
 * tildes y puntuación, no baja la caja—, así que `VACIAS.has('SAS')` era false y la lista de
 * formas societarias no filtraba absolutamente nada. Peor: el test que lo comprobaba
 * (`!tokens('Melisa García SAS').includes('sas')`) PASABA, porque el token era 'SAS' y no 'sas'.
 * Un control verde por la razón equivocada. Se baja la caja acá para que este módulo no dependa
 * de la convención de mayúsculas de otro.
 */
export function tokens(texto) {
  return [...new Set(
    normalizar(texto).toLowerCase().split(/\s+/).filter((t) => t.length >= 4 && !VACIAS.has(t)),
  )]
}

/**
 * EL ÍNDICE DE TOKENS DISTINTIVOS. Un token que pertenece a dos clientes se BORRA del índice: no
 * distingue, y dejarlo produciría empates que después hay que resolver a mano.
 *
 * @param {{id:string, nombre_comercial?:string, razon_social?:string}[]} clientes
 * @returns {Map<string,string>} token → id de cliente
 */
export function indiceDistintivo(clientes = []) {
  const de = new Map()
  const ambiguos = new Set()
  for (const c of clientes) {
    for (const t of tokens(`${c.nombre_comercial ?? ''} ${c.razon_social ?? ''}`)) {
      if (de.has(t) && de.get(t) !== c.id) { ambiguos.add(t); continue }
      de.set(t, c.id)
    }
  }
  for (const t of ambiguos) de.delete(t)
  return de
}

/**
 * El cliente de un rótulo, o null.
 *
 * @returns {{clienteId:string, por:string[]}|{clienteId:null, porQue:string, candidatos?:string[]}}
 */
export function clienteDeRotulo(rotulo, indice) {
  const ts = tokens(rotulo)
  if (!ts.length) return { clienteId: null, porQue: 'el rótulo no tiene ningún token útil' }

  /** @type {Map<string,string[]>} */
  const alcanzados = new Map()
  for (const t of ts) {
    const id = indice.get(t)
    if (!id) continue
    alcanzados.set(id, [...(alcanzados.get(id) ?? []), t])
  }
  if (alcanzados.size === 0) return { clienteId: null, porQue: 'ningún token del rótulo pertenece a un cliente' }
  if (alcanzados.size > 1) {
    // DOS clientes en un rótulo. Elegir uno pondría la cobranza en la cuenta corriente de otro.
    return { clienteId: null, porQue: 'el rótulo alcanza a más de un cliente', candidatos: [...alcanzados.keys()] }
  }
  const [clienteId, por] = [...alcanzados.entries()][0]
  return { clienteId, por }
}

/** Resuelve una lista entera y devuelve además el resumen, para poder MIRARLO antes de escribir. */
export function resolverLote(rotulos, clientes) {
  const indice = indiceDistintivo(clientes)
  const porRotulo = new Map()
  for (const r of new Set(rotulos)) porRotulo.set(r, clienteDeRotulo(r, indice))
  const resueltos = [...porRotulo.values()].filter((v) => v.clienteId).length
  return { porRotulo, indice, resueltos, sinResolver: porRotulo.size - resueltos }
}
