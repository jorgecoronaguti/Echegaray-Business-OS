// EL ADELANTO DE SUELDO ESCRITO EN EL CANAL EFECTIVO — «le di 8500 de adelanto a Juan Pérez».
//
// ═══ EL PEDIDO, TEXTUAL (dueño, 25/09/2026) ═══
//
// *«necesito que se reconozca por lenguaje natural imputaciones de gastos directamente como se escribe en canal
// efectivo del chat. es una funcion especifica de pago de adelantos a empleados por escritura en ese chat»*.
//
// ═══ ESTO NO ADIVINA: ENTIENDE O PREGUNTA ═══
//
// Un adelanto mal imputado le descuenta el sueldo a la persona equivocada y le baja el saldo a rendir a quien lo
// escribió. Por eso el núcleo es puro y devuelve SIEMPRE una de tres cosas:
//
//   · listo    — importe y empleado resueltos sin ambigüedad.
//   · pregunta — falta algo o hay más de un candidato: se dice QUÉ y se ofrecen las opciones numeradas.
//   · nada     — el texto no es un adelanto de sueldo; el mensaje sigue su camino (entrega, libreta, ticket).
//
// ═══ QUÉ LO HACE UN ADELANTO Y NO OTRA COSA ═══
//
// La palabra. «adelanto», «adelanté», «anticipo» o «a cuenta» — sin ella, «le di 20 mil a Emiliano» es una
// ENTREGA a rendir (así funciona el canal desde el 22/09) y «Tello 23/9 100.000» es la libreta. «a cuenta» y
// «anticipo» se usan también con proveedores («a cuenta 1.250.000 a Tello» fue un pago a P. Tello): esas dos
// sólo reclaman si el nombre es de alguien del plantel, y un apellido que también es de un proveedor se pregunta.

import { leerMonto, normalizarMonto, plano } from './efectivo-entrega-texto.mjs'

// «adelanto», «adelantos», «adelanté», «le adelanto», «adelantarle». NO «más adelante», «para adelante».
const RE_ADELANTO = /\badelant(?:o|os|e|ar|arle|ado|ada|amos|aron|ale)\b/
const RE_NO_ES_ADELANTO_DE_SUELDO = /\b(?:mas|para|hacia|por|de ahi en|seguimos|sigo|sigue)\s+adelante\b|\badelanto (?:de|del) (?:obra|cliente|certificado|financiero|la obra)\b|\banticipo (?:de|del) (?:obra|cliente|certificado|financiero|la obra)\b|\bcobr[eéoó]\b|\bcobramos\b/
const RE_A_CUENTA = /\ba cuenta\b|\banticip(?:o|os|e|ar|ado)\b/
/** Lo que dice que es plata del sueldo: con esto no hace falta preguntar si era un proveedor. */
const RE_SUELDO = /\b(?:sueldo|sueldos|quincena|jornal|jornales|haberes)\b/

// Palabras del mensaje que NUNCA son un nombre. Si una palabra no está acá y no es de nadie del plantel, y va
// pegada a un nombre, es un apellido que no conocemos («Juan Pérez»): se pregunta, no se completa.
const VACIAS = new Set(`
  adelanto adelantos adelante adelantar adelantarle adelantado adelantada adelantamos adelantaron adelantale
  anticipo anticipos anticipe anticipar anticipado cuenta sueldo sueldos quincena jornal jornales haberes
  le les di dimos dio dieron pague pago pagamos pagaron pagado entregue entrego entregamos entregado
  para por con sin del los las una uno unos unas que hoy ayer esta este manana tarde noche efectivo plata
  pesos peso mil miles lucas luca palos millon millones mango mangos por favor gracias ahi aca recien
  obra galpon nave lote casa en de la el al a y o se me te mi su sus lo es fue son era tengo tiene tenia
  cargar carga cargalo cargame anota anotame anotar registra registrame registrar favor porfa pls
  semana dia dias lunes martes miercoles jueves viernes sabado domingo
`.split(/\s+/).filter(Boolean))

/** Las palabras de peso de un texto: letras, sin acentos, 3 o más, sin las vacías. Con su posición. */
function palabras(texto) {
  const t = plano(texto).replace(/[^a-z\s]/g, ' ')
  return t.split(/\s+/).filter(Boolean).map((w, i) => ({ w, i }))
}

/** Las palabras de un nombre (3+ letras; «Emi» cuenta, «de» no). */
const palabrasDeNombre = (n) => plano(n).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3)

/**
 * ¿Parece un adelanto de sueldo? Sólo mira la forma: si tiene un NÚMERO (o una cifra en palabras) y la palabra.
 * @returns {'fuerte'|'debil'|null}  fuerte = «adelanto»; débil = «a cuenta»/«anticipo» (necesita el padrón)
 */
export function senalDeAdelanto(texto) {
  const t = plano(texto)
  if (!t || t.length > 300) return null
  if (RE_NO_ES_ADELANTO_DE_SUELDO.test(t)) return null
  const hayNumero = /\d/.test(normalizarMonto(texto))
  if (RE_ADELANTO.test(t)) return hayNumero || /\ba\s+[a-z]{3,}/.test(t) ? 'fuerte' : null
  if (RE_A_CUENTA.test(t) && hayNumero) return 'debil'
  return null
}

/** Atajo: ¿este texto es de este especialista? (Lo usan entregas y libreta para hacerse a un lado.) */
export const pareceAdelanto = (texto) => senalDeAdelanto(texto) === 'fuerte'

// «8500*8», «8500 x 8», «8.500 × 8»: la cuenta como la escribe el dueño en la celda. Se guarda TAL CUAL.
const RE_PRODUCTO = /(?<![\w.,])(\d[\d.]*(?:,\d+)?)\s*[x×*]\s*(\d{1,3})(?![\w.,])/

const aNumero = (s) => {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** El número a la argentina para escribir en la cuenta de la celda: «20000», «113200,5». */
export function numeroParaCuenta(n) {
  const r = Math.round(Number(n) * 100) / 100
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ',')
}

/**
 * El importe y la EXPRESIÓN que se suma a la celda. «8500*8» → { importe: 68000, expresion: '8500*8' };
 * «20 mil» → { importe: 20000, expresion: '20000' }. `null` si no hay un importe claro (dos números, ninguno).
 */
export function leerImporte(texto) {
  const p = String(texto ?? '').match(RE_PRODUCTO)
  if (p) {
    const a = aNumero(p[1])
    const b = aNumero(p[2])
    if (a && b && a > 0 && b > 0) {
      return { importe: Math.round(a * b * 100) / 100, expresion: `${numeroParaCuenta(a)}*${numeroParaCuenta(b)}` }
    }
  }
  const n = leerMonto(texto)
  if (n == null || !(n > 0)) return null
  return { importe: n, expresion: numeroParaCuenta(n) }
}

/**
 * La fecha del adelanto: «ayer», «el 24/9», o hoy. Nunca en el futuro ni más de 31 días atrás (eso es un tipeo).
 * @param {string} texto @param {string} hoy ISO (fecha de San Juan)
 */
export function leerFechaAdelanto(texto, hoy) {
  const t = plano(texto)
  const base = new Date(`${hoy}T12:00:00Z`)
  const iso = (d) => d.toISOString().slice(0, 10)
  if (/\bayer\b/.test(t)) return iso(new Date(base.getTime() - 864e5))
  const m = t.match(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])/)
  if (!m) return hoy
  const anio = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : base.getUTCFullYear()
  const d = new Date(Date.UTC(anio, Number(m[2]) - 1, Number(m[1]), 12))
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(m[1])) return hoy
  const dias = (base - d) / 864e5
  return dias >= 0 && dias <= 31 ? iso(d) : hoy
}

/**
 * EL PADRÓN COMO SE NOMBRA A LA GENTE: el legajo, el nombre para mostrar y cómo lo escribe la planilla JORNALES
 * («Emi Maldonado»). Cada persona trae sus palabras y sus frases (nombre para mostrar y apodos enteros).
 * @param {Array<{id:string, nombre_completo:string, nombre_para_mostrar?:string|null, apodos?:string[]|null}>} filas
 */
export function armarPadron(filas = []) {
  return filas.map((p) => {
    const frases = [p.nombre_para_mostrar, ...(p.apodos ?? [])].filter(Boolean).map((x) => plano(x).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim())
    const ws = new Set([p.nombre_completo, p.nombre_para_mostrar, ...(p.apodos ?? [])].filter(Boolean).flatMap(palabrasDeNombre))
    return { id: p.id, nombre: p.nombre_para_mostrar || p.nombre_completo, legajo: p.nombre_completo, palabras: ws, frases }
  })
}

/**
 * A QUIÉN. Todas las palabras del texto que son de alguien del plantel, contra cada persona.
 *
 *   · gana quien tiene MÁS palabras del texto; con empate, quien tiene su nombre para mostrar o un apodo ENTERO
 *     escrito («Sebastián Quiroga» es Quiroga Sebastián Adolfo, no Quiroga Alexander Sebastián);
 *   · si queda más de uno, se pregunta con todos;
 *   · una palabra pegada al nombre que no es de nadie («Juan PÉREZ») hace que no se resuelva solo: se pregunta.
 *
 * @returns {{persona?:object, candidatos?:object[], desconocido?:string, palabras?:string[]}}
 */
export function elegirEmpleado(texto, padron = []) {
  const ws = palabras(texto)
  const deAlguien = new Set(padron.flatMap((p) => [...p.palabras]))
  const utiles = ws.filter((x) => x.w.length >= 3 && !VACIAS.has(x.w))
  const hits = utiles.filter((x) => deAlguien.has(x.w))
  if (!hits.length) {
    // Nadie del plantel. Lo que siguió a «a»/«al»/«para» es el nombre que la persona escribió.
    const tras = ws.find((x, i) => i > 0 && ['a', 'al', 'para'].includes(ws[i - 1].w) && x.w.length >= 3 && !VACIAS.has(x.w))
    return tras ? { desconocido: nombreEscrito(ws, tras.i) } : {}
  }
  const t = ` ${plano(texto).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ')} `
  const puntuados = padron.map((p) => {
    const n = hits.filter((x) => p.palabras.has(x.w)).length
    const frase = p.frases.some((f) => f && t.includes(` ${f} `)) ? 0.5 : 0
    return { p, n: n ? n + frase : 0 }
  }).filter((x) => x.n > 0)
  const max = Math.max(...puntuados.map((x) => x.n))
  const top = puntuados.filter((x) => x.n === max).map((x) => x.p)
  // EL APELLIDO QUE NO CONOCEMOS: una palabra de peso, de nadie, pegada a una que sí es de alguien.
  const posHits = new Set(hits.map((x) => x.i))
  const extraña = utiles.find((x) => !deAlguien.has(x.w) && (posHits.has(x.i - 1) || posHits.has(x.i + 1)))
  if (extraña) {
    return { desconocido: nombreEscrito(ws, Math.min(extraña.i, ...hits.filter((h) => Math.abs(h.i - extraña.i) === 1).map((h) => h.i))), candidatos: top }
  }
  return top.length === 1 ? { persona: top[0], palabras: hits.map((x) => x.w) } : { candidatos: top }
}

/** El nombre tal como lo escribió la persona, desde la palabra `i`: hasta dos palabras que no sean vacías. */
function nombreEscrito(ws, i) {
  const out = []
  for (let k = i; k < ws.length && out.length < 3; k++) {
    if (VACIAS.has(ws[k].w) || ws[k].w.length < 2) break
    out.push(ws[k].w)
  }
  return out.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

/**
 * ¿El nombre elegido es SÓLO un apellido que también es de un proveedor? «a cuenta 1.250.000 a Tello» puede ser
 * el adelanto de Juan Tello o el pago a Pedro Tello. Si el texto dice «sueldo»/«quincena», o nombra a la persona
 * con algo más que ese apellido, no hay duda.
 * @param {string[]} palabrasUsadas las del texto que resolvieron a la persona
 * @param {Array<string>} proveedores nombres de proveedores activos
 */
export function chocaConProveedor(texto, palabrasUsadas = [], proveedores = []) {
  if (RE_SUELDO.test(plano(texto))) return null
  if (palabrasUsadas.length !== 1) return null
  const w = palabrasUsadas[0]
  const hit = proveedores.find((p) => palabrasDeNombre(p).includes(w))
  return hit ?? null
}

/**
 * NÚCLEO PURO. Lee el mensaje y dice qué se registra, o qué falta preguntar.
 *
 * @param {string} texto
 * @param {{padron?:Array, proveedores?:string[], hoy:string}} ctx  `padron` ya armado (`armarPadron`)
 * @returns {{estado:'listo', importe:number, expresion:string, persona:object, fecha:string}
 *          |{estado:'pregunta', falta:'monto'|'persona'|'persona_ambigua'|'proveedor', importe?:number, expresion?:string, fecha?:string, candidatos?:Array, desconocido?:string, proveedor?:string}
 *          |{estado:'nada'}}
 */
export function interpretarAdelanto(texto, { padron = [], proveedores = [], hoy } = {}) {
  const senal = senalDeAdelanto(texto)
  if (!senal) return { estado: 'nada' }
  const quien = elegirEmpleado(texto, padron)
  // «a cuenta» y «anticipo» sin nadie del plantel no son de acá: son la libreta o un pago a un proveedor.
  if (senal === 'debil' && !quien.persona && !quien.candidatos?.length) return { estado: 'nada' }
  const fecha = leerFechaAdelanto(texto, hoy)
  const monto = leerImporte(texto)
  const base = { fecha, ...(monto ?? {}) }
  if (!monto) return { estado: 'pregunta', falta: 'monto', ...base, candidatos: quien.persona ? [quien.persona] : quien.candidatos }
  if (quien.desconocido) return { estado: 'pregunta', falta: 'persona', ...base, desconocido: quien.desconocido, candidatos: quien.candidatos ?? [] }
  if (quien.candidatos?.length) return { estado: 'pregunta', falta: 'persona_ambigua', ...base, candidatos: quien.candidatos }
  if (!quien.persona) return { estado: 'pregunta', falta: 'persona', ...base, candidatos: [] }
  const prov = chocaConProveedor(texto, quien.palabras, proveedores)
  if (prov) return { estado: 'pregunta', falta: 'proveedor', ...base, candidatos: [quien.persona], proveedor: prov }
  return { estado: 'listo', ...base, persona: quien.persona }
}

/**
 * LA RESPUESTA A LA PREGUNTA, en el hilo: «1», «el 2», «Emiliano Gonzalez», «no», o el importe si lo que faltaba
 * era cuánto. Devuelve qué eligió, o `null` si no se entiende (y entonces se repregunta).
 * @returns {{cancelar:true}|{persona:object}|{importe:number, expresion:string}|null}
 */
export function leerRespuesta(texto, pendiente) {
  const t = plano(texto).trim()
  if (/^(?:no|cancela(?:r|lo)?|ninguno|ninguna|dejalo|olvidalo|no es(?: un)? adelanto.*)$/.test(t)) return { cancelar: true }
  const opciones = pendiente?.candidatos ?? []
  if (pendiente?.falta === 'monto') {
    const m = leerImporte(texto)
    if (m) return m
  }
  const n = t.match(/^(?:el |la |opcion |nro |numero )?(\d{1,2})$/)
  if (n) {
    const i = Number(n[1]) - 1
    if (pendiente?.falta === 'proveedor') return i === 0 ? { persona: opciones[0] } : i === 1 ? { cancelar: true } : null
    return opciones[i] ? { persona: opciones[i] } : null
  }
  if (pendiente?.falta === 'proveedor' && /^(?:si|sí|dale|ok|es adelanto|adelanto)$/.test(t)) return { persona: opciones[0] }
  if (opciones.length) {
    const q = elegirEmpleado(texto, opciones)
    if (q.persona && !q.desconocido) return { persona: q.persona }
  }
  return null
}

/** El pesos de las pantallas. */
export const pesos = (n) => `$ ${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** Lo que el bot pregunta. Nunca un saldo: el canal lo ve todo el grupo. */
export function textoDePregunta(r) {
  const cuanto = r.importe ? ` de ${pesos(r.importe)}` : ''
  const lista = (r.candidatos ?? []).map((p, i) => `${i + 1} · ${p.nombre}`)
  if (r.falta === 'monto') {
    return ['Leo un adelanto de sueldo pero no entiendo cuánto. Contestá en este hilo sólo el importe (por ejemplo **20.000** o **8500*8**).'].join('\n')
  }
  if (r.falta === 'proveedor') {
    return [`¿El pago${cuanto} es un adelanto de sueldo a **${r.candidatos[0].nombre}**, o es para el proveedor **${r.proveedor}**? Contestá en este hilo:`, '',
      `1 · Adelanto de sueldo a ${r.candidatos[0].nombre}`,
      `2 · No es un adelanto (el pago a ${r.proveedor} se escribe como libreta, sin la palabra adelanto)`].join('\n')
  }
  if (r.falta === 'persona') {
    if (lista.length) {
      return [`No encuentro a **${r.desconocido ?? 'esa persona'}** en el plantel. ¿Es alguno de éstos? Contestá en este hilo con el número:`, '', ...lista, '',
        'Si no es ninguno, contestá **no** y escribilo de nuevo con el apellido como figura en el legajo.'].join('\n')
    }
    return [`No encuentro a ${r.desconocido ? `**${r.desconocido}**` : 'quién es'} en el plantel, así que no cargué el adelanto.`,
      'Escribilo de nuevo con el apellido como figura en el legajo: «adelanto 20.000 a Maldonado».'].join('\n')
  }
  return [`¿A quién le diste el adelanto${cuanto}? Contestá en este hilo con el número:`, '', ...lista].join('\n')
}
