// ENTREGAR EFECTIVO ESCRIBIÉNDOLO — «entregué $250.000 a Rubén Sosa para el galpón 8».
//
// ═══ EL PEDIDO, TEXTUAL (22/09/2026) ═══
//
// *«tiene q registrar lenguaje natural "$x entregada para x persona o para x gasto", tiene q ser inteligente
// y tb registro mediante multimedia, la tecnologia tiene q estar el servicio. todo eso es por medio del chat
// en canal envio de comprobantes»*.
//
// ═══ ESTO NO ADIVINA: ENTIENDE O PREGUNTA ═══
//
// Registrar una entrega saca plata del cajón y se la carga a UNA persona y a UNA obra. Un parser que
// «hace lo que puede» acá no ahorra trabajo: lo crea, porque el error se descubre cuando falta plata.
// Por eso el núcleo es puro y devuelve SIEMPRE una de tres cosas:
//
//   · listo    — monto, persona y destino resueltos sin ambigüedad.
//   · pregunta — falta algo o hay más de un candidato: se dice QUÉ falta y se ofrecen los candidatos.
//   · nada     — el texto no habla de entregar efectivo; el mensaje sigue su camino.
//
// El apellido gana al nombre, el código de obra gana al nombre de obra, y dos personas que empatan no se
// desempatan solas. Lo que el texto no dice no se completa con lo último que pasó.
//
// ═══ EL MONTO ═══
//
// Se acepta «$250.000», «250000», «250 mil», «1,5 millones». Un número suelto sin `$` también es el monto
// —«entregué 12000 a Sosa»— pero NUNCA si el texto trae dos números sin signo: ahí no se sabe cuál es.

/** Minúsculas, sin acentos y con espacios normalizados. */
export const plano = (t) => String(t ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const RE_ENTREGA = /\b(entreg[a-záéíóúñ]*|le di|les di|di a|dar|vale de efectivo|adelanto de efectivo|saco?\s+de\s+caja)\b/i
// «para», «pa», «p/» y «p » — como se escribe en el teléfono, sin acentos y a las apuradas.
const RE_PARA_QUE = /\b(?:para|pa|p\/|p)\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+)$/i
const RE_DESTINO_OBRA = /\b(en|de|obra)\s+(?:la\s+|el\s+)?([\wáéíóúñ .-]{3,40})$/i

/** «250 mil» · «1,5 millones» · «$250.000» · «250000». Devuelve number o null. */
export function leerMonto(texto) {
  const t = plano(texto)
  const conSigno = [...t.matchAll(/\$\s*([\d.,]+)\s*(mill?on(?:es)?|mil|k)?/g)]
  const sueltos = [...t.matchAll(/(?<![\w./-])(\d[\d.,]*)\s*(mill?on(?:es)?|mil|k)?(?![\w./-])/g)]
  const elegir = (ms, conSigno) => {
    if (!ms.length) return null
    // EL SIGNO Y LA ESCALA MANDAN. «entregue 250 mil a sosa p/ el galpon 8» tiene dos números y uno es el
    // galpón: sin esto el bot preguntaba el monto en la frase más común de todas.
    const conEscala = ms.filter((m) => m[2])
    if (conEscala.length === 1) return conEscala[0]
    if (conEscala.length > 1) return null
    // UN NÚMERO PELADO Y CHICO NO ES PLATA. «entregué plata a Agüero para el galpón 8» registraba $ 8: el
    // número del galpón se leía como monto. Abajo de mil hay que escribir el signo o la escala.
    if (ms.length === 1) return conSigno || (aNumero(ms[0][1]) ?? 0) >= 1000 ? ms[0] : null
    // Varios números pelados: gana el único que puede ser plata. Dos candidatos de plata NO se adivinan.
    const grandes = ms.filter((m) => (aNumero(m[1]) ?? 0) >= 1000)
    return grandes.length === 1 ? grandes[0] : null
  }
  const elegido = conSigno.length ? elegir(conSigno, true) : elegir(sueltos, false)
  if (!elegido) return null
  const [, crudo, escala] = elegido
  const n = aNumero(crudo)
  if (n == null) return null
  const factor = !escala ? 1 : /mill/.test(escala) ? 1_000_000 : 1_000
  const v = Math.round(n * factor * 100) / 100
  return v > 0 ? v : null
}

/** «250.000» y «250,50» a la argentina: el punto agrupa, la coma decide los centavos. */
function aNumero(crudo) {
  const s = String(crudo).replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Cuántas palabras del nombre de la persona aparecen en el texto. El apellido pesa doble. */
// UN NOMBRE DEL PADRÓN NO ES UNA EXPRESIÓN REGULAR. Medido el 23/09/2026 contra el padrón real: la
// persona de prueba se llama «[PRUEBA E2E] QA Campo», y su corchete hacía que `new RegExp` tirara
// «Unmatched )» — la excepción no la agarraba nadie y se caía la interpretación ENTERA del mensaje, con
// lo cual el bot no contestaba nada a nadie. Un apellido con un punto, un paréntesis o un guion hace lo
// mismo. Se escapa antes de armar el patrón.
const escapar = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function puntajePersona(t, nombre) {
  const partes = plano(nombre).split(/[ ,]+/).filter((p) => p.length >= 3)
  if (!partes.length) return 0
  // En el padrón el nombre viene «APELLIDO Nombre» o «Apellido, Nombre»: la primera palabra es el apellido.
  let puntos = 0
  partes.forEach((p, i) => {
    if (new RegExp(`(^| )${escapar(p)}( |$|[.,])`).test(t)) puntos += i === 0 ? 2 : 1
  })
  return puntos
}

/**
 * A quién. Devuelve `{ persona }` si gana una sola, `{ candidatos }` si empatan, o `{}` si no hay ninguna.
 * @param {string} texto
 * @param {Array<{id:string, nombre:string}>} personas
 */
export function elegirPersona(texto, personas = []) {
  const t = plano(texto)
  const puntuadas = personas.map((p) => ({ p, n: puntajePersona(t, p.nombre) })).filter((x) => x.n > 0)
  if (!puntuadas.length) return {}
  const max = Math.max(...puntuadas.map((x) => x.n))
  const ganan = puntuadas.filter((x) => x.n === max).map((x) => x.p)
  return ganan.length === 1 ? { persona: ganan[0] } : { candidatos: ganan }
}

/**
 * A qué obra. El CÓDIGO gana al nombre: «OB-0020» no se confunde con nada.
 * @param {Array<{id:string, nombre:string, codigo?:string|null}>} obras
 */
export function elegirObra(texto, obras = []) {
  const t = plano(texto)
  const porCodigo = obras.filter((o) => o.codigo && t.includes(plano(o.codigo)))
  if (porCodigo.length === 1) return { obra: porCodigo[0] }
  const porNombre = obras.filter((o) => o.nombre && plano(o.nombre).length >= 4 && t.includes(plano(o.nombre)))
  if (porNombre.length === 1) return { obra: porNombre[0] }
  if (porNombre.length > 1) return { candidatos: porNombre }
  return {}
}

/** Lo que el texto dice que se va a hacer con la plata: «para gasoil», «para la cuadrilla». */
export function leerParaQue(texto) {
  const m = String(texto ?? '').match(RE_PARA_QUE)
  if (!m) return null
  const dicho = m[1].trim().replace(/[.;]+$/, '')
  return dicho.length >= 3 && dicho.length <= 200 ? dicho : null
}

/** ¿El texto habla de entregar efectivo? Sin esto, cualquier mensaje con un número sería una entrega. */
export function pareceEntrega(texto) {
  const t = String(texto ?? '')
  return RE_ENTREGA.test(t) && /\d/.test(t)
}

// ═══ LA ENTREGA SIN VERBO — «100 a jorge para combustible» (dueño, 23/09/2026) ═══
//
// La primera vez que el dueño usó el canal para arrancar el circuito escribió eso, sin ningún verbo. Ningún
// especialista lo reclamó como entrega: cayó a la libreta de gastos, que lo rechazó con «no pude cargarlos».
// Su lectura fue «el chat no funciona», y tenía razón en el efecto.
//
// Así se habla de verdad cuando se saca plata del cajón: el monto, a quién, y para qué. Pero SIN el verbo la
// misma forma puede ser un pago a un proveedor —«100 a Tello», que es libreta—, y ahí el que decide no es
// esta expresión sino el PADRÓN: `interpretarEntrega` sólo registra si el nombre resuelve a una persona del
// plantel. Por eso esto devuelve una sospecha y no una certeza, y el especialista la reclama con confianza
// media: alcanza para ganarle a la red de abajo de la libreta (0,2) y no para secuestrar el canal.
//
// Un verbo de PAGO descarta la sospecha: «pagué 100 a jorge» es un pago, aunque Jorge esté en el padrón.
const RE_PAGO = /\b(pagu[eé]|pago|pagamos|pagaron|abon[eéoó]|transfer[íi]|deposit[éeoó])/i
const RE_A_ALGUIEN = /(?:^|\s)a\s+([a-záéíóúñ][a-záéíóúñ.'-]{2,})/i

// ═══ EL NÚMERO QUE ABRE EL MENSAJE ES LA PLATA (dueño, 23/09/2026) ═══
//
// «150 a rodrigo para maquinaria» y el bot le contestó «escribilo con el signo». Su respuesta: «no
// funciona, entiende cualquier cosa». Tenía razón: el piso de mil está para que «galpón 8» no se lea
// como $ 8, y eso pasa cuando el número anda suelto en el medio de la frase. Un número que ABRE el
// mensaje y va seguido de «a <alguien>» no tiene con qué confundirse: es lo único que puede ser plata.
//
// No se adivina la escala: «150» es CIENTO CINCUENTA PESOS. Quien quiera ciento cincuenta mil escribe
// «150 mil» o «$150.000», que ya se leen. Multiplicar por mil porque parece poco sería inventar plata.
const RE_MONTO_QUE_ABRE = /^\s*\$?\s*(\d[\d.,]*)\s*(mill?on(?:es)?|mil|k)?\s+a\s+[a-záéíóúñ]/i

/** El monto de «150 a rodrigo…»: el número con el que arranca el mensaje. `null` si no abre así. */
export function montoQueAbre(texto) {
  const m = String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(RE_MONTO_QUE_ABRE)
  if (!m) return null
  const n = aNumero(m[1])
  if (n == null || !(n > 0)) return null
  const escala = m[2] ? (/^k$|^mil$/.test(m[2]) ? 1000 : 1_000_000) : 1
  return n * escala
}

/**
 * ¿Parece una entrega escrita sin verbo? Monto + «a <alguien>», sin verbo de pago. El nombre no se valida
 * acá: eso lo hace el padrón.
 */
export function pareceEntregaSinVerbo(texto) {
  const t = String(texto ?? '')
  if (!/\d/.test(t) || RE_PAGO.test(t)) return false
  if (RE_ENTREGA.test(t)) return false
  // NO SE EXIGE QUE EL MONTO SE LEA. «100 a jorge para combustible» no da monto a propósito —un número
  // pelado abajo de mil no es plata, si no «galpón 8» se registraba como $ 8—, y ése fue exactamente el
  // mensaje que el dueño escribió. Si acá se exigiera el monto, ese texto volvería a caer en la libreta y
  // volvería a contestar «no pude cargarlos». Reconocerlo y PREGUNTAR el signo es la única salida que no
  // deja a la persona adivinando.
  return RE_A_ALGUIEN.test(t)
}

/**
 * NÚCLEO PURO. Lee el mensaje y dice qué se registra, o qué falta preguntar.
 *
 * @param {string} texto
 * @param {{personas?: Array, obras?: Array}} padron
 * @returns {{estado:'listo', monto:number, persona:object, obra:object|null, paraQue:string|null}
 *          |{estado:'pregunta', falta:'monto'|'persona'|'persona_ambigua'|'obra_ambigua'|'destino', candidatos?:Array}
 *          |{estado:'nada'}}
 */
export function interpretarEntrega(texto, { personas = [], obras = [] } = {}) {
  // Con verbo o sin verbo entra igual; lo que cambia es quién puede ganarle el mensaje (la confianza con la
  // que el especialista lo reclama), no cómo se lee.
  if (!pareceEntrega(texto) && !pareceEntregaSinVerbo(texto)) return { estado: 'nada' }
  // EL NÚMERO QUE ABRE GANA. «150 a rodrigo para maquinaria» no necesita el signo: ver `montoQueAbre`.
  const monto = montoQueAbre(texto) ?? leerMonto(texto)
  if (monto == null) return { estado: 'pregunta', falta: 'monto' }

  const quien = elegirPersona(texto, personas)
  if (quien.candidatos) return { estado: 'pregunta', falta: 'persona_ambigua', candidatos: quien.candidatos }
  if (!quien.persona) return { estado: 'pregunta', falta: 'persona' }

  const donde = elegirObra(texto, obras)
  if (donde.candidatos) return { estado: 'pregunta', falta: 'obra_ambigua', candidatos: donde.candidatos }
  const paraQue = leerParaQue(texto)
  // OBRA O ESTRUCTURA, NUNCA LAS DOS Y NUNCA NINGUNA (lo exige la base). Sin obra nombrada, la entrega es de
  // Estructura y el «para qué» dice a qué se destina. Sin obra NI «para qué» no se registra: una entrega sin
  // destino es plata que sale del cajón sin poder imputarse después.
  if (!donde.obra && !paraQue) return { estado: 'pregunta', falta: 'destino' }
  return { estado: 'listo', monto, persona: quien.persona, obra: donde.obra ?? null, paraQue }
}

/** El pesos de siempre, para hablar igual que las pantallas. */
export const pesos = (n) => `$ ${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** Qué contesta el bot cuando falta algo. Nunca publica saldos: el canal lo ve todo el grupo. */
export function textoDePregunta(r) {
  if (r.falta === 'monto') {
    // Un número pelado abajo de mil no se toma como plata (si no, «galpón 8» era $ 8). Se dice qué escribir.
    return ['No entendí cuánto. Escribilo con el signo: «**$100** a Maldonado para combustible».', '',
      'Sin el signo sólo leo montos de mil para arriba, porque un número suelto suele ser el número de una '
      + 'obra y no la plata.'].join('\n')
  }
  if (r.falta === 'persona') {
    // NUNCA UN CALLEJÓN SIN SALIDA: quien escribe «100 a jorge» puede estar entregando plata o pagándole a
    // un proveedor, y el bot no sabe cuál. Se dicen las dos salidas, con su forma exacta.
    return ['No encuentro a esa persona en el padrón.', '',
      'Si le **entregaste** plata para que rinda, escribí el apellido como figura en el legajo: '
      + '«$100.000 a Maldonado para gasoil».',
      'Si fue un **pago a un proveedor**, escribilo como la libreta: «Tello 23/9 100.000».'].join('\n')
  }
  if (r.falta === 'persona_ambigua') {
    return ['Hay más de una persona con ese nombre. Repetilo con el apellido completo:', '',
      ...r.candidatos.map((p) => `- ${p.nombre}`)].join('\n')
  }
  if (r.falta === 'obra_ambigua') {
    return ['No sé a qué obra va. Repetilo con el código:', '',
      ...r.candidatos.map((o) => `- **${o.codigo ?? '—'}** ${o.nombre}`)].join('\n')
  }
  return 'Falta para qué es: una obra («para el galpón 8») o el destino del gasto («para gasoil»).'
}
