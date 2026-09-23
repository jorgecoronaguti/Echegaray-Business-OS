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

const RE_ENTREGA = /\b(entreg[a-záéíóúñ]*|le di|les di|di a|di \$?\d|dar|dale|vale de efectivo|adelanto de efectivo|saco?\s+de\s+caja)\b/i
// «para», «pa», «p/», «p », «por» y «x» — como se escribe en el teléfono, sin acentos y a las apuradas.
const RE_PARA_QUE = /\b(?:para|pa|p\/|p|por|x)\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+)$/i
const RE_DESTINO_OBRA = /\b(en|de|obra)\s+(?:la\s+|el\s+)?([\wáéíóúñ .-]{3,40})$/i

// ═══ EL NÚMERO SE ESCRIBE COMO SALE (dueño, 23/09/2026: «no contempla todos los casos») ═══
//
// Medido con frases reales: «100 pesos a jorge», «100$ a jorge» y «cien mil a jorge» caían en «no entendí
// cuánto». Antes de buscar el monto, el texto se lleva a UNA forma: el número en palabras pasa a cifras,
// y «pesos» o el «$» pegado atrás pasan a ser el signo adelante. Después de esto, todo lo demás lee «$100».
const PALABRA_NUMERO = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300,
  cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
}
// Sin cifra adelante: «150 mil» es una cifra con escala, no el número «mil» en palabras.
const RE_NUMERO_EN_PALABRAS = /(?<![\d.,]\s*)\b((?:(?:un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos|mil|millon|millones|medio|y)\s+)*(?:mil|millon|millones|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|quince|diez|medio))\b/

/** «doscientos cincuenta mil» → 250000 · «un millon y medio» → 1500000 · «cien» → 100. `null` si no cierra. */
function valorDePalabras(frase) {
  let total = 0, acumulado = 0, algo = false
  for (const w of frase.split(/\s+/)) {
    if (w === 'y') continue
    // «un millón y medio»: el medio es de la última escala dicha.
    if (w === 'medio') { total += total >= 1_000_000 ? 500_000 : total >= 1000 ? 500 : 0; continue }
    if (w === 'mil') { total += (acumulado || 1) * 1000; acumulado = 0; algo = true; continue }
    if (w === 'millon' || w === 'millones') { total += (acumulado || 1) * 1_000_000; acumulado = 0; algo = true; continue }
    const v = PALABRA_NUMERO[w]
    if (v == null) return null
    acumulado += v; algo = true
  }
  const n = total + acumulado
  return algo && n > 0 ? n : null
}

/** El texto con el monto escrito de una sola manera: «$<cifras>». Sólo toca lo que es plata sin duda. */
export function normalizarMonto(texto) {
  let t = plano(texto)
  // «cien mil» → «$100000». Un número en palabras es plata siempre: nadie numera un galpón «ocho».
  const enPalabras = t.match(RE_NUMERO_EN_PALABRAS)
  if (enPalabras) {
    const v = valorDePalabras(enPalabras[1])
    if (v != null) t = t.replace(enPalabras[1], `$${v}`)
  }
  // «100 pesos», «100$», «100 ars» → «$100». El «pesos» es el signo dicho con letras.
  t = t.replace(/(?<![\w$])(\d[\d.,]*)\s*(mill?on(?:es)?|mil|k)?\s*(?:pesos|\$|ars|ar\$|peso)(?![\w])/g, (_, n, esc) => `$${n}${esc ? ' ' + esc : ''}`)
  return t
}

// LO QUE VA PEGADO A UN NÚMERO Y DICE QUE NO ES PLATA. «galpón 8», «nave 2», «lote 14», «120 m²», «3 bolsas».
// Antes la regla era «abajo de mil no es plata», y eso obligaba a escribir el signo para $150: la persona
// no tiene por qué saber ese piso. Lo que distingue el número del galpón del monto no es el tamaño, es lo que
// tiene al lado.
const RE_ANTES_NO_PLATA = /\b(galpon|galpones|nave|obra|ob|lote|casa|dpto|depto|piso|local|manzana|mz|nro|n|numero|etapa|sector|bloque|torre|km)\s*[-.°º]?\s*$/
const RE_DESPUES_NO_PLATA = /^\s*(m2|m²|mts?|metros?|m3|hs|hrs|horas?|dias?|bolsas?|kg|kilos?|lts?|litros?|unidades?|u|%|toneladas?|tn|cajas?|viajes?)\b/

/** «250 mil» · «1,5 millones» · «$250.000» · «250000» · «cien mil» · «100 pesos». Devuelve number o null. */
export function leerMonto(texto) {
  const t = normalizarMonto(texto)
  const conSigno = [...t.matchAll(/\$\s*([\d.,]+)\s*(mill?on(?:es)?|mil|k)?/g)]
  const sueltos = [...t.matchAll(/(?<![\w./-])(\d[\d.,]*)\s*(mill?on(?:es)?|mil|k)?(?![\w./-])/g)]
    .filter((m) => !RE_ANTES_NO_PLATA.test(t.slice(0, m.index)) && !RE_DESPUES_NO_PLATA.test(t.slice(m.index + m[0].length)))
  const elegir = (ms) => {
    if (!ms.length) return null
    // EL SIGNO Y LA ESCALA MANDAN. «entregue 250 mil a sosa p/ el galpon 8» tiene dos números y uno es el
    // galpón: sin esto el bot preguntaba el monto en la frase más común de todas.
    const conEscala = ms.filter((m) => m[2])
    if (conEscala.length === 1) return conEscala[0]
    if (conEscala.length > 1) return null
    // Un solo número que puede ser plata, es la plata. Dos candidatos NO se adivinan: se pregunta.
    return ms.length === 1 ? ms[0] : null
  }
  const elegido = conSigno.length ? elegir(conSigno) : elegir(sueltos)
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

  // ═══ NADIE ESCRIBE EL NOMBRE COMPLETO DE LA OBRA (dueño, 23/09/2026) ═══
  //
  // Medido contra las obras reales: «50000 a Maldonado para el salón comercial» iba a **Estructura**,
  // porque arriba se pide que el TEXTO contenga el nombre entero —«qp - salon comercial», con el
  // prefijo del cliente—. Nadie lo escribe así, y el resultado no era una pregunta: era plata imputada
  // a Estructura en silencio, que es peor.
  //
  // Segunda vuelta: alcanza con que el texto traiga TODAS las palabras de peso del nombre (4 letras o
  // más, sin el prefijo del cliente y sin las palabras vacías). «salón comercial» encuentra «QP - SALÓN
  // COMERCIAL»; «galpón» solo NO encuentra «GALPÓN 8» y «GALPÓN 9» —son dos— y ahí se pregunta, que es
  // lo que corresponde cuando hay dos destinos posibles para la misma plata.
  const VACIAS = new Set(['para', 'obra', 'los', 'las', 'del', 'con'])
  const palabrasDe = (nombre) => plano(nombre).split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !VACIAS.has(w))
  const porPalabras = obras.filter((o) => {
    const ws = palabrasDe(o.nombre ?? '')
    return ws.length > 0 && ws.every((w) => new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(t))
  })
  if (porPalabras.length === 1) return { obra: porPalabras[0] }
  if (porPalabras.length > 1) {
    // EL NÚMERO DE LA OBRA DESEMPATA. «Galpón 8» y «Galpón 9» comparten la única palabra de peso, así
    // que las dos entran; lo que las distingue es el número, que acá SÍ es un dato del nombre y no un
    // monto. Si el texto no lo trae, se pregunta: son dos destinos y la plata va a uno solo.
    const numeroDe = (nombre) => plano(nombre).match(/\b\d+\b/)?.[0] ?? null
    const conNumero = porPalabras.filter((o) => {
      const n = numeroDe(o.nombre ?? '')
      return n !== null && new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(t)
    })
    if (conNumero.length === 1) return { obra: conNumero[0] }
    return { candidatos: porPalabras }
  }
  // ═══ LA OBRA POR SU CLIENTE (23/09/2026) ═══
  // «para la obra de quattropani» iba a Estructura: el cliente no está en el nombre de la obra, está en
  // `cliente_texto`. Si el cliente tiene UNA obra activa, es ésa; si tiene varias (Messina tiene cuatro), se
  // pregunta cuál, que es lo que haría cualquiera en el cajón.
  const porCliente = obras.filter((o) => {
    const ws = palabrasDe(o.cliente_texto ?? '').filter((w) => !['sas', 'srl', 'sociedad'].includes(w))
    return ws.length > 0 && ws.some((w) => new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(t))
  })
  if (porCliente.length === 1) return { obra: porCliente[0] }
  if (porCliente.length > 1) return { candidatos: porCliente }
  return {}
}

// «para que rinda», «a rendir», «para rendir»: es el nombre del circuito, no un destino. Sin destino se pregunta.
const RE_NO_ES_DESTINO = /^(?:que\s+)?(?:rinda|rendir|rendicion|rendicion de gastos|la rendicion)$/

/**
 * Lo que el texto dice que se va a hacer con la plata: «para gasoil», «para la cuadrilla».
 *
 * Con `persona` (la ya elegida), si no hay «para», lo que sigue al nombre es el destino: «100 a jorge
 * combustible», «100 a jorge, combustible», «100 a jorge - combustible». Medido el 23/09/2026: las cuatro
 * formas preguntaban «falta para qué es» teniendo la palabra ahí.
 */
export function leerParaQue(texto, persona = null) {
  const limpiar = (s) => {
    const dicho = String(s ?? '').trim().replace(/^[\s,:;.\-–—]+/, '').replace(/^(?:a|de|del|el|la|los|las)\s+/, '').replace(/[.;]+$/, '').trim()
    if (dicho.length < 3 || dicho.length > 200) return null
    if (RE_NO_ES_DESTINO.test(plano(dicho))) return null
    return dicho
  }
  const m = String(texto ?? '').match(RE_PARA_QUE)
  if (m) return limpiar(m[1])
  if (!persona?.nombre) return null
  const t = plano(texto)
  const partes = plano(persona.nombre).split(/[ ,]+/).filter((p) => p.length >= 3)
  let fin = -1
  for (const p of partes) {
    const mm = new RegExp(`(^| )${escapar(p)}( |$|[.,])`).exec(t)
    if (mm) fin = Math.max(fin, mm.index + mm[0].length - (mm[2] ? mm[2].length : 0))
  }
  if (fin >= 0 && /[a-z]{3,}/.test(t.slice(fin))) return limpiar(t.slice(fin))
  // «combustible 100 a jorge»: el destino va adelante. Lo que queda antes del monto, sacados el verbo y
  // el nombre, es para qué. Sin letras no hay destino: «100 a jorge 8» no dice nada.
  const antes = normalizarMonto(texto).split(/\$?\d/)[0]
    .replace(RE_ENTREGA, ' ').replace(/\b(le|les|plata|efectivo|de|en|a)\b/g, ' ')
  const sinNombre = partes.reduce((acc, p) => acc.replace(new RegExp(`(^| )${escapar(p)}( |$)`), ' '), antes)
  return /[a-z]{3,}/.test(sinNombre) ? limpiar(sinNombre.replace(/\s+/g, ' ')) : null
}

/** ¿El texto habla de entregar efectivo? Sin esto, cualquier mensaje con un número sería una entrega. */
export function pareceEntrega(texto) {
  const t = String(texto ?? '')
  // «le di plata a jorge» no trae número y ES una entrega: se reconoce y se pregunta cuánto. Antes caía
  // a la libreta y contestaba «no pude cargarlos».
  return RE_ENTREGA.test(t) && (/\d/.test(t) || RE_A_ALGUIEN.test(plano(t)) || RE_NUMERO_EN_PALABRAS.test(plano(t)))
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
// «a jorge», «al jorge», «a la flaca», «para jorge»: como se dice. Quién es lo decide el padrón, no esto.
const RE_A_ALGUIEN = /(?:^|\s)(?:a|al|a la|a el|para|pa)\s+([a-záéíóúñ][a-záéíóúñ.'-]{2,})/i
// «100 a jorge y 50 a rodrigo»: dos entregas en un mensaje. No se registran a medias ni se elige una.
const RE_VARIAS = /(?:^|\s)\$?\s*[\d][\d.,]*\s*(?:mil|k|mill?on(?:es)?)?\s+(?:a|al|para)\s+[a-záéíóúñ]+.*\b(?:y|,|;|\+)\s*\$?\s*[\d][\d.,]*\s*(?:mil|k|mill?on(?:es)?)?\s+(?:a|al|para)\s+[a-záéíóúñ]/i

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
  const m = normalizarMonto(texto).match(RE_MONTO_QUE_ABRE)
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
  // Con el monto ya normalizado: «cien mil a jorge» no trae cifras y es la misma entrega.
  const t = normalizarMonto(texto)
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
  if (RE_VARIAS.test(plano(texto))) return { estado: 'pregunta', falta: 'varias' }
  // EL NÚMERO QUE ABRE GANA. «150 a rodrigo para maquinaria» no necesita el signo: ver `montoQueAbre`.
  const monto = montoQueAbre(texto) ?? leerMonto(texto)
  if (monto == null) return { estado: 'pregunta', falta: 'monto' }

  // LA PERSONA SE BUSCA ANTES DEL «PARA». «100 a jorge para pagarle a tello» registraba la entrega a
  // TELLO: el destino traía un apellido del padrón y ganaba por ser apellido. Lo que viene después del
  // «para» es el destino de la plata, no quien la recibe. Sólo si adelante no hay nadie se mira todo.
  const antesDelPara = String(texto ?? '').split(/\b(?:para|pa|p\/|por)\b/i)[0]
  const quien = (() => {
    const q = elegirPersona(antesDelPara, personas)
    return q.persona || q.candidatos ? q : elegirPersona(texto, personas)
  })()
  if (quien.candidatos) return { estado: 'pregunta', falta: 'persona_ambigua', candidatos: quien.candidatos }
  if (!quien.persona) return { estado: 'pregunta', falta: 'persona' }

  const donde = elegirObra(texto, obras)
  if (donde.candidatos) return { estado: 'pregunta', falta: 'obra_ambigua', candidatos: donde.candidatos }
  const paraQue = leerParaQue(texto, quien.persona)
  // OBRA O ESTRUCTURA, NUNCA LAS DOS (lo exige la base). Sin obra nombrada, la entrega es de Estructura.
  // ═══ SIN «PARA QUÉ» TAMBIÉN SE REGISTRA (dueño, 23/09/2026) ═══
  // «Me pide sí o sí que diga para qué es, y ése es otro caso de uso». Tenía razón: «$100 a Jorge» es
  // plata que sale del cajón a nombre de alguien, y lo que se compra con ella lo dicen los tickets cuando
  // se rinden. Exigir el destino era inventar una regla que el cajón no tiene. Queda Estructura sin
  // concepto; la obra la trae cada ticket al rendirse.
  return { estado: 'listo', monto, persona: quien.persona, obra: donde.obra ?? null, paraQue: paraQue ?? null }
}

/** El pesos de siempre, para hablar igual que las pantallas. */
export const pesos = (n) => `$ ${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** Qué contesta el bot cuando falta algo. Nunca publica saldos: el canal lo ve todo el grupo. */
export function textoDePregunta(r) {
  if (r.falta === 'monto') {
    // Sin número, o con dos que pueden ser plata. Se dice qué escribir, y se puede contestar sólo el monto.
    return ['No entendí cuánto. Escribilo con el signo: «**$100** a Maldonado para combustible».', '',
      'Podés contestar acá abajo sólo el monto y lo completo.'].join('\n')
  }
  if (r.falta === 'varias') {
    return 'Leo dos entregas en el mismo mensaje. Escribí una por mensaje, así cada una queda con su código y su firma.'
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
  // 'destino' ya no se pregunta (23/09/2026): queda por si un llamador viejo lo manda.
  return 'Falta para qué es: una obra («para el galpón 8») o el destino del gasto («para gasoil»).'
}
