// Detección de INTENCIÓN DE ESCRITURA del dueño (raíces de verbo de acción, robusto al
// voseo). Vive en un lib para poder testearla porque es un GUARD DE COSTO: un falso
// positivo manda un READ barato (haiku) a sonnet + guía de escritura → fuga de gasto real.
//
// Bug de clase (medido 2026-07-16, probe local: 13/18 lecturas subían a sonnet): las raíces
// de verbo (carg, registr, actualiz, agreg, aplic, calcul, duplic, elimin, gener…) matchean
// también su PARTICIPIO usado como DATO: "el saldo CARGADO", "el pago REGISTRADO", "está
// ACTUALIZADO", "valor AGREGADO", "el total CALCULADO". Eso no es una orden, es una lectura.
//
// Fix general (no per-raíz, que es frágil): en español rioplatense una ORDEN termina en
// -á/-ar/-ando/-alo/-emos (cargá, cargar, cargando); un PARTICIPIO/PRETÉRITO que describe un
// dato termina en -ado/-ada/-ados/-adas o -ó (cargado, registró). Sacamos esas formas del
// texto ANTES de testear la intención: la orden real ("agregá", "cargá") sobrevive; el
// descriptor ("cargado") desaparece. Es lingüísticamente seguro: ningún imperativo/infinitivo
// rioplatense termina en -ado ni en -ó, así que nunca borramos un verbo de acción real.
// SUSTANTIVOS HOMÓGRAFOS de una raíz-verbo, separables por su terminación (medido: 9/10
// reads fugaban a sonnet). Solo se acotan los CLARAMENTE separables sin romper la orden:
//   registr(?!os?\b) → excluye el sustantivo "registro/registros" (termina en o/os);
//                       deja "registrá/registra/registrar/registralo" (termina en a).
//   orden(?=[aá])    → exige que "orden" vaya seguido de a/á: deja "ordená/ordenar/ordename",
//                       excluye el sustantivo pelado "orden/ordenes/órdenes" ("la orden de compra").
// NO se tocan copi/marc[aá]/carg: ahí sustantivo (copia/marca/carga) y verbo (copiá/marcá/cargá)
// terminan igual en -a y el dueño omite acentos → separarlos rompería una orden real (peor que
// la fuga de un read: la orden iría a haiku y no se ejecutaría). Se prefiere no romper la acción.
export const WRITE_INTENT_RE = /\b(registr(?!os?\b)|agreg|añad|anot|escrib|orden(?=[aá])|complet|corrig|carg|aplic|hacelo|hac[eé]|modific|pon[eé]|actualiz|edit|arregl|reemplaz|renombr|mov[eé]|crea|mejor|reconstru|rehac|rehag|rearm|arm[aá]|gener[aá]|calcul[aá]|llen[aá]|limpi|f[oó]rmula|borr|elimin|vaci|duplic|copi|marc[aá]|pas[aá]\s+a)/i

// Participios (-ado/-ada/-ados/-adas) y pretéritos (-ó) = descriptores de dato, no órdenes.
// El cierre NO usa \b (en JS \b es ASCII y NO detecta el borde tras la "ó" acentuada: dejaba
// pasar "aplicó/cotizó"); usa un lookahead de no-letra que sí funciona con acentos.
const DESCRIPTOR_RE = /\b[a-záéíóúñ]+(?:ad[oa]s?|ó)(?![a-záéíóúñ])/gi

/** true si el texto expresa una intención de ESCRIBIR/ACTUAR (tras quitar participios-dato). */
export function isWriteIntent(text) {
  const sinDescriptores = String(text || '').replace(DESCRIPTOR_RE, ' ')
  return WRITE_INTENT_RE.test(sinDescriptores)
}

// El turno PREVIO del OS PROPUSO una acción de escritura/edición en un Sheet/Doc. Es DISTINTO de
// isWriteIntent: eso detecta la ORDEN del dueño (imperativos, sin participios); esto detecta el
// lenguaje de PROPUESTA del OS en primera persona + tokens de fórmula/planilla. Sirve para que un
// "dale/ok/hacelo" corto del dueño EJECUTE la propuesta previa en vez de re-narrarla (reclamo real:
// "me propone cosas, le doy el OK y no lo hace" — el CF Semanal quedó sin fórmulas por esto). Se usa
// SOLO junto a una confirmación corta (CONFIRM_RE), así que puede ser generoso sin fugar costo.
const PROPOSED_WRITE_RE = /(=?sumifs?|=sum\(|f[oó]rmula|referenci|\bcelda|\bcolumna|\bpesta[ñn]a|\bsolapa|encaden|voy a (escrib|hacer|armar|re?escrib|cargar|actualiz|complet|reemplaz|referenc|agreg|poner|aplicar|combin|sumar|render)|propong|te propong|la estrategia|puedo (armar|hacer|escrib|cargar|re?escrib|complet|aplicar|poner|combin)|paso a (escrib|cargar|armar|aplicar|complet)|re?escrib|reemplaz|dejame (escrib|hacer|armar|aplicar|cargar))/i
/** true si el texto (turno previo del OS) PROPONE escribir/editar un Sheet/Doc. */
export function isProposedWrite(text) {
  return PROPOSED_WRITE_RE.test(String(text || ''))
}
