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
export const WRITE_INTENT_RE = /\b(registr|agreg|añad|anot|escrib|orden|complet|corrig|carg|aplic|hacelo|hac[eé]|modific|pon[eé]|actualiz|edit|arregl|reemplaz|renombr|mov[eé]|crea|mejor|reconstru|rehac|rehag|rearm|arm[aá]|gener[aá]|calcul[aá]|llen[aá]|limpi|f[oó]rmula|borr|elimin|vaci|duplic|copi|marc[aá]|pas[aá]\s+a)/i

// Participios (-ado/-ada/-ados/-adas) y pretéritos (-ó) = descriptores de dato, no órdenes.
// El cierre NO usa \b (en JS \b es ASCII y NO detecta el borde tras la "ó" acentuada: dejaba
// pasar "aplicó/cotizó"); usa un lookahead de no-letra que sí funciona con acentos.
const DESCRIPTOR_RE = /\b[a-záéíóúñ]+(?:ad[oa]s?|ó)(?![a-záéíóúñ])/gi

/** true si el texto expresa una intención de ESCRIBIR/ACTUAR (tras quitar participios-dato). */
export function isWriteIntent(text) {
  const sinDescriptores = String(text || '').replace(DESCRIPTOR_RE, ' ')
  return WRITE_INTENT_RE.test(sinDescriptores)
}
