// DEL TEXTO DICTADO A LA PROPUESTA DE PARTE — determinístico, sin red, sin modelo.
//
// Lo usa «Dictar parte» (ERP Obras › Parte diario, aprobado por el dueño el 25/09/2026 sobre la
// maqueta). La transcripción la hace `voz.mjs` en la VM; acá se decide QUÉ se entendió, con qué
// confianza y DE DÓNDE salió cada dato (el tramo del texto), para que la pantalla lo resalte.
//
// ═══ LAS CUATRO REGLAS DE LA MAQUETA, Y DÓNDE SE CUMPLEN ═══
//
//   1. Nunca guarda: esto devuelve una PROPUESTA (`estado: 'propuesta'`). Guardar es un botón.
//   2. Sólo personas y tareas de ESA obra: el matcher sólo conoce `contexto.personas` y
//      `contexto.tareas`. Un nombre que no está ahí no se «parece» a nadie: va a Novedades.
//   3. Lo que no entiende va a Novedades como texto (`novedades`), con su tramo.
//   4. Lo dudoso se marca (`dudoso: true` + `motivo`) y la pantalla pide confirmarlo. Toda FALTA es
//      dudosa por definición: una ausencia mal entendida es un día descontado del sueldo de alguien.
//
// ═══ POR QUÉ REGLAS Y NO UN MODELO ═══
//
// Un parte de obra es formulaico —quién, cuántas horas, en qué, cuánto avanzó, qué falta— y el
// universo de nombres es cerrado (el plantel de la obra, las tareas de la 04). Con reglas cada dato
// sabe de qué palabras salió, cuesta $0 y se prueba sin red. El modelo de lenguaje queda como
// escotilla OPCIONAL y apagada (`ORQ_VOZ_LLM`), sólo para cuando esto falla en algo claro.
//
// No importa nada que toque red, base ni disco.

import { normalizar } from './normalizar.mjs'

// ── NÚMEROS EN PALABRAS ─────────────────────────────────────────────────────────────────────────

const UNIDADES = {
  cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21,
  veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29,
}
const DECENAS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 }
const CENTENAS = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600,
  seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
  novecientos: 900, novecientas: 900,
}
/** «un/una/uno» son artículo casi siempre. Cuentan como número sólo delante de estas palabras. */
const DESPUES_DE_UN = new Set(['hora', 'horas', 'por', 'mas', 'bolsa', 'metro', 'metros', 'kilo', 'kilos',
  'litro', 'litros', 'caja', 'rollo', 'tira', 'hoja', 'balde', 'barra', 'camion', 'viaje', 'pallet',
  'tacho', 'lata', 'bidon', 'plancha', 'placa', 'm2', 'm3'])

// ── TOKENS ──────────────────────────────────────────────────────────────────────────────────────

const RE_TOKEN = /(\d+(?:[.,]\d+)*)|([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]*)|(%)|([.;!?¿¡\n]+)|(,|:)/g
const sinTilde = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** «1.500» son mil quinientos; «4,5» y «8.5» son decimales. Un número de obra no pasa de eso. */
function leerDigitos(s) {
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''))
  const v = Number(s.replace(',', '.'))
  return Number.isFinite(v) ? v : null
}

/**
 * Texto → tokens con su posición en el texto ORIGINAL (`a`, `b`). La posición es lo que permite
 * resaltar «ocho horas» en «Lo que dijo» sin volver a buscar la cadena.
 */
export function tokenizar(texto) {
  const t = String(texto ?? '')
  const crudos = []
  for (const m of t.matchAll(RE_TOKEN)) {
    const a = m.index, b = m.index + m[0].length
    if (m[1]) crudos.push({ tipo: 'num', t: m[0], n: m[0], valor: leerDigitos(m[1]), a, b })
    else if (m[2]) crudos.push({ tipo: 'pal', t: m[0], n: sinTilde(m[0]), cap: /^[A-ZÁÉÍÓÚÜÑ]/.test(m[0]), a, b })
    else if (m[3]) crudos.push({ tipo: 'pct', t: '%', n: '%', a, b })
    else if (m[4]) crudos.push({ tipo: 'fin', t: m[0], n: '.', a, b })
    else crudos.push({ tipo: 'coma', t: m[0], n: ',', a, b })
  }
  return fundirNumeros(crudos)
}

/** Junta «cuarenta y cinco», «ocho y media», «cuatro coma cinco», «por ciento» en un solo token. */
function fundirNumeros(tk) {
  const out = []
  for (let i = 0; i < tk.length; i++) {
    // «por ciento» ANTES de leer números: si no, «ciento» se lee como 100.
    if (tk[i].n === 'por' && tk[i + 1]?.n === 'ciento' && out.at(-1)?.tipo === 'num') {
      out.push({ tipo: 'pct', t: '%', n: '%', a: tk[i].a, b: tk[i + 1].b }); i++; continue
    }
    const r = leerNumeroDesde(tk, i)
    if (!r) { out.push(tk[i]); continue }
    let { valor, fin } = r
    // «ocho y media» → 8,5 (sólo detrás de un número: «y media hora» es otra cosa).
    if (tk[fin]?.n === 'y' && (tk[fin + 1]?.n === 'media' || tk[fin + 1]?.n === 'medio')) { valor += 0.5; fin += 2 }
    // «cuatro coma cinco»
    if (tk[fin]?.n === 'coma') {
      const d = leerNumeroDesde(tk, fin + 1)
      if (d && d.valor < 100) { valor = Number(`${Math.trunc(valor)}.${d.valor}`); fin = d.fin }
    }
    out.push({ tipo: 'num', t: '', n: String(valor), valor, a: tk[i].a, b: tk[fin - 1].b, palabras: tk[i].tipo === 'pal' })
    i = fin - 1
  }
  return out
}

function leerNumeroDesde(tk, i) {
  const p = tk[i]
  if (!p) return null
  if (p.tipo === 'num') {
    if (p.valor == null) return null
    // «2 mil»
    if (tk[i + 1]?.n === 'mil') return { valor: p.valor * 1000, fin: i + 2 }
    return { valor: p.valor, fin: i + 1 }
  }
  if (p.tipo !== 'pal') return null
  if ((p.n === 'un' || p.n === 'una' || p.n === 'uno') && !DESPUES_DE_UN.has(tk[i + 1]?.n)) return null
  let total = 0, actual = 0, j = i, leyo = false, tieneUnidad = false, tieneDecena = false
  while (j < tk.length && tk[j].tipo === 'pal') {
    const w = tk[j].n
    if (CENTENAS[w] != null && actual % 1000 === 0 && !tieneDecena && !tieneUnidad) { actual += CENTENAS[w]; j++; leyo = true; continue }
    if (DECENAS[w] != null && !tieneDecena && !tieneUnidad) {
      actual += DECENAS[w]; j++; leyo = true; tieneDecena = true
      if (tk[j]?.n === 'y' && UNIDADES[tk[j + 1]?.n] != null && UNIDADES[tk[j + 1].n] < 10) { actual += UNIDADES[tk[j + 1].n]; j += 2; tieneUnidad = true }
      continue
    }
    if (UNIDADES[w] != null && !tieneUnidad && !tieneDecena) {
      if ((w === 'un' || w === 'una' || w === 'uno') && leyo) break
      actual += UNIDADES[w]; j++; leyo = true; tieneUnidad = true; continue
    }
    if (w === 'mil' && (leyo || j === i)) { total += (actual || 1) * 1000; actual = 0; j++; leyo = true; tieneUnidad = false; tieneDecena = false; continue }
    break
  }
  if (!leyo) return null
  return { valor: total + actual, fin: j }
}

/** Para los tests y para quien quiera leer un número suelto. */
export function numeroDeTexto(texto) {
  const t = tokenizar(texto).find((x) => x.tipo === 'num')
  return t ? t.valor : null
}

// ── VOCABULARIO ─────────────────────────────────────────────────────────────────────────────────

const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'al', 'con', 'para', 'por', 'que',
  'se', 'lo', 'le', 'les', 'un', 'una', 'unos', 'unas', 'su', 'sus', 'es', 'o', 'e', 'muy', 'mas', 'ya', 'tambien',
  'hoy', 'eh', 'este', 'esta', 'bueno', 'bien', 'entonces', 'nada', 'mmm', 'ehh', 'ah', 'pues', 'igual', 'ahi',
  'aca', 'todo', 'dia', 'parte', 'nos', 'me', 'mi', 'nosotros', 'ellos', 'estuvieron', 'estuvimos', 'estuvo',
  'trabajaron', 'trabajamos', 'trabajo', 'trabajando', 'haciendo', 'hicieron', 'hizo', 'fueron', 'fue', 'vino',
  'vinieron', 'estan', 'esta', 'estaban', 'como', 'siempre', 'otra', 'otro', 'vez', 'lado', 'hay', 'habia',
  'tuvimos', 'tuvieron', 'uso', 'ok', 'listo', 'nomas', 'despues', 'antes', 'tarde', 'manana', 'hola', 'buenas',
  'gracias', 'chau', 'quedo', 'queda', 'pusimos', 'pusieron', 'si', 'no', 'vino', 'vinieron', 'correccion', 'corrijo', 'corregir', 'perdon'])

/** Unidades de material → el código que usa Herramientas › Material (`UNIDADES` de `pedidos.ts`). */
const UNIDAD_MATERIAL = {
  bolsa: 'bolsa', bolsas: 'bolsa', kilo: 'kg', kilos: 'kg', kg: 'kg', metro: 'm', metros: 'm',
  litro: 'lt', litros: 'lt', caja: 'caja', cajas: 'caja', rollo: 'rollo', rollos: 'rollo', tira: 'tira',
  tiras: 'tira', hoja: 'hoja', hojas: 'hoja', balde: 'balde', baldes: 'balde', unidad: 'un', unidades: 'un',
  barra: 'barra', barras: 'barra', m2: 'm2', m3: 'm3', camion: 'camión', camiones: 'camión', pallet: 'pallet',
  pallets: 'pallet', lata: 'lata', latas: 'lata', bidon: 'bidón', bidones: 'bidón', plancha: 'plancha',
  planchas: 'plancha', placa: 'placa', placas: 'placa', viaje: 'viaje', viajes: 'viaje', tacho: 'tacho', tachos: 'tacho',
}
/** «metros cuadrados/cúbicos» → m2/m3. */
const CALIFICA_METRO = { cuadrado: 'm2', cuadrados: 'm2', cubico: 'm3', cubicos: 'm3' }

/** Palabras que abren un pedido de material. Se miden sobre la forma sin tilde. */
const DISPARA_MATERIAL = [
  ['hace', 'falta'], ['hacen', 'falta'], ['hay', 'que', 'pedir'], ['falta'], ['faltan'], ['necesitamos'],
  ['necesito'], ['necesitan'], ['pedir'], ['pedi'], ['pedime'], ['mandar'], ['manden'], ['traer'], ['traigan'],
]
const CORTA_MATERIAL = new Set(['para', 'manana', 'hoy', 'urgente', 'que', 'porque', 'antes', 'asi'])
const URGENTE = /\b(urgente|urgencia|para hoy|para manana|manana temprano|ya mismo|lo antes posible|frena|parados?)\b/

const AUSENCIA_DESPUES = [['no', 'vino'], ['no', 'fue'], ['no', 'estuvo'], ['no', 'vinieron'], ['no', 'se', 'presento'],
  ['falto'], ['faltaron'], ['esta', 'enfermo'], ['esta', 'enferma'], ['estuvo', 'enfermo'], ['estuvo', 'enferma'],
  ['con', 'parte', 'medico'], ['de', 'licencia'], ['aviso', 'que', 'no']]
const AUSENCIA_ANTES = [['falto'], ['faltaron'], ['no', 'vino'], ['no', 'vinieron']]

const CONTEO = new Set(['eramos', 'fuimos', 'vinimos', 'vinieron', 'estuvimos', 'estuvieron', 'somos', 'trabajamos', 'trabajaron', 'hubo', 'estabamos'])

const TERMINADO = new Set(['terminamos', 'terminaron', 'termino', 'terminado', 'terminada', 'completamos', 'completaron',
  'completo', 'finalizamos', 'finalizaron', 'finalizo'])
const HECHO_CANTIDAD = new Set(['hicimos', 'hicieron', 'colocamos', 'colocaron', 'levantamos', 'levantaron', 'hormigonamos',
  'hormigonaron', 'pintamos', 'pintaron', 'revocamos', 'revocaron', 'cargamos', 'avanzamos', 'avanzaron', 'se', 'llenamos', 'tiramos', 'tendimos'])
const ACUMULADO = new Set(['quedo', 'queda', 'quedaron', 'llegamos', 'llego', 'esta', 'va', 'vamos', 'estamos', 'anda'])

// ── NOMBRES DE PERSONAS ─────────────────────────────────────────────────────────────────────────

/** Palabras que pueden ser apellido y también palabra común: sólo cuentan con mayúscula. */
const NOMBRE_COMUN = new Set(['luna', 'paz', 'sola', 'cruz', 'rosa', 'blanco', 'leon', 'rey', 'vera', 'rios', 'campos',
  'flores', 'lobo', 'montes', 'pinto', 'santos', 'soto', 'mesa', 'nieto', 'prado', 'castillo', 'torres', 'bravo',
  'sierra', 'vidal', 'miranda', 'gallo', 'toro', 'ledesma', 'mas', 'bien', 'dia', 'hoy', 'obra', 'losa', 'pared'])
const NO_NOMBRE = new Set([...VACIAS, 'resto', 'demas', 'otros', 'todos', 'horas', 'hora'])

/** Distancia de edición, con tope: más que `tope` no importa cuánto más. */
function lev(a, b, tope = 3) {
  if (Math.abs(a.length - b.length) > tope) return tope + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

/**
 * LA CLAVE FONÉTICA DEL CASTELLANO RIOPLATENSE. El reconocedor escribe lo que oye: «Mancilla» por
 * Mansilla, «Arduello» por Argüello, «Kilos» por Quiroz. Se compara cómo SUENA: sin h, ll = y,
 * v = b, z/ce/ci = s, qu/c = k, sin letras dobles. Medido sobre audio sintético (25/09/2026): sin
 * esto, la mitad de los apellidos del plantel se perdían en Novedades.
 */
export function fonetica(w) {
  return sinTilde(w)
    .replace(/ch/g, 'X').replace(/h/g, '').replace(/ll/g, 'y').replace(/qu/g, 'k')
    .replace(/c([ei])/g, 's$1').replace(/c/g, 'k').replace(/z/g, 's').replace(/v/g, 'b').replace(/w/g, 'u')
    .replace(/x/g, 'ks').replace(/X/g, 'ch').replace(/(.)\1+/g, '$1').replace(/y$/, 'i')
}

/** Las palabras de una persona: apellidos y nombres del padrón, el nombre para mostrar y el apodo. */
function palabrasDePersona(p) {
  const fuentes = [p.nombre_completo, p.nombre_para_mostrar, p.apodo].filter(Boolean)
  return new Set(fuentes.flatMap((f) => normalizar(f).toLowerCase().split(' ')).filter((w) => w.length >= 3 && !VACIAS.has(w)))
}

/**
 * Cómo se muestra la persona: el nombre para mostrar y, si no hay, el legajo en oración — la misma
 * regla que `nombreDePersona` de la app (src/shared/personas/nombre.ts), sin cortes propios.
 */
export function rotuloDePersona(p) {
  if (String(p.nombre_para_mostrar ?? '').trim()) return p.nombre_para_mostrar.trim()
  const legajo = String(p.nombre_completo ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return legajo ? legajo.replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : 'sin nombre'
}

/** Palabras del oficio que nunca son un apellido parecido: «kilos» no es Quiroz. */
const VOCABULARIO = new Set([...Object.keys(UNIDAD_MATERIAL), 'metros', 'cuadrados', 'cubicos', 'horas', 'hora', 'jornada',
  'cemento', 'arena', 'hierro', 'ladrillos', 'ladrillo', 'cal', 'piedra', 'bloques', 'chapa', 'chapas', 'faltan', 'falta',
  'falto', 'faltaron', 'vino', 'mañana', 'resto', 'demas', 'otros', 'todos', 'eramos', 'fuimos', 'terminamos', 'quedo', 'queda'])

function indicePersonas(personas, tareas = []) {
  const idx = personas.map((p) => ({ p, palabras: palabrasDePersona(p) }))
  const todas = new Set(idx.flatMap((x) => [...x.palabras]))
  const lista = [...todas].map((w) => ({ w, f: fonetica(w) }))
  const deTareas = new Set(tareas.flatMap((t) => sinTilde(`${t.nombre} ${t.rubro ?? ''}`).split(/[^a-z0-9ñ]+/)))
  return { idx, todas, lista, bloqueadas: new Set([...VOCABULARIO, ...deTareas]) }
}

/**
 * ¿Este token puede ser parte de un nombre del plantel? Devuelve la palabra del padrón y a qué
 * distancia: 0 = igual (`exacto`) o suena igual; 1–2 = parecido, y eso se CONFIRMA en la pantalla.
 */
function tokenDeNombre(tok, ip) {
  if (tok?.tipo !== 'pal' || NO_NOMBRE.has(tok.n) || tok.n.length < 3) return null
  if (NOMBRE_COMUN.has(tok.n) && !tok.cap) return null
  if (ip.todas.has(tok.n)) return { w: tok.n, exacto: true, dist: 0 }
  if (ip.bloqueadas.has(tok.n) || tok.n.length < 4) return null
  const f = fonetica(tok.n)
  let mejor = null
  for (const x of ip.lista) {
    if (x.w.length < 4) continue
    const d = x.f === f ? 0 : lev(x.f, f, 2)
    if (mejor == null || d < mejor.dist) mejor = { w: x.w, exacto: false, dist: d }
  }
  if (!mejor) return null
  if (mejor.dist === 0) return mejor
  // Parecido: con mayúscula (el reconocedor la pone a los nombres) o, en minúscula, a una letra y largo.
  if (mejor.dist === 1 && (tok.cap || tok.n.length >= 6)) return mejor
  if (mejor.dist === 2 && tok.cap && tok.n.length >= 5 && fonetica(mejor.w).length >= 6) return mejor
  return null
}

/**
 * Las menciones de personas en un tramo de tokens. «Cristian Agüero» es UNA mención (palabras
 * pegadas); «Agüero y Maldonado» son dos. Cada mención se resuelve contra el plantel: una persona
 * = alta; varias = dudosa con candidatos; ninguna = no es una persona de esta obra. «Al hornos»
 * (Albornoz partido en dos por el reconocedor) se prueba también junto.
 */
function menciones(tk, desde, hasta, ip, usado) {
  const out = []
  let i = desde
  while (i < hasta) {
    if (usado[i]) { i++; continue }
    let m0 = tokenDeNombre(tk[i], ip)
    let paso = 1
    if (!m0 && tk[i]?.cap && tk[i + 1]?.tipo === 'pal' && i + 1 < hasta && !usado[i + 1]) {
      const junto = tokenDeNombre({ tipo: 'pal', n: tk[i].n + tk[i + 1].n, cap: true }, ip)
      if (junto && junto.dist <= 1) { m0 = { ...junto, exacto: false, dist: Math.max(1, junto.dist) }; paso = 2 }
    }
    if (!m0) { i++; continue }
    const palabras = [m0]; let j = i + paso
    while (paso === 1 && j < hasta && !usado[j]) { const m = tokenDeNombre(tk[j], ip); if (!m) break; palabras.push(m); j++ }
    const cands = ip.idx.filter((x) => palabras.every((m) => x.palabras.has(m.w))).map((x) => x.p)
    const dist = Math.max(...palabras.map((m) => m.dist))
    // Dos palabras que no son de la MISMA persona («Agüero Maldonado» dicho sin «y»): se parten.
    if (cands.length === 0 && palabras.length > 1) {
      for (let k = 0; k < palabras.length; k++) {
        const c = ip.idx.filter((x) => x.palabras.has(palabras[k].w)).map((x) => x.p)
        if (c.length) out.push({ a: i + k, b: i + k + 1, candidatos: c, exacto: palabras[k].exacto, dist: palabras[k].dist })
      }
    } else if (cands.length) {
      out.push({ a: i, b: j, candidatos: cands, exacto: palabras.every((m) => m.exacto), dist })
    }
    i = j
  }
  return out
}

// ── TAREAS ──────────────────────────────────────────────────────────────────────────────────────

/** Raíz corta: «encofrado/encofrando» → encofr, «hormigón/hormigonado» → hormig, «losas» → losa. */
function raiz(w) {
  let s = w
  if (s.length > 4 && s.endsWith('es') && !s.endsWith('ones')) s = s.slice(0, -2)
  else if (s.length > 4 && s.endsWith('s')) s = s.slice(0, -1)
  return s.length > 6 ? s.slice(0, 6) : s
}
const raicesDe = (texto) => sinTilde(texto).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 3 && !VACIAS.has(w)).map(raiz)

function indiceTareas(tareas) {
  return tareas.map((t) => ({
    t,
    raices: new Set([...raicesDe(t.nombre), ...raicesDe(t.rubro ?? ''), ...raicesDe(t.padre ?? '')]),
    // Cada palabra del nombre con su raíz y cómo suena: lo que el reconocedor partió o deformó
    // («un cofrado» por encofrado) se reconoce por el sonido.
    palabras: sinTilde(t.nombre).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 3 && !VACIAS.has(w))
      .map((w) => ({ w, r: raiz(w), f: fonetica(w) })),
  }))
}

/**
 * La tarea que nombran estas palabras. Puntaje = qué parte del nombre de la tarea se dijo —por
 * raíz, o por cómo suena a una letra (dos en palabras largas)—, cuántas de sus palabras se dijeron
 * («encofrado de la losa» es Encofrado de losa antes que Losa) y un poco de lo que coincide con su
 * rubro. Empate arriba = dudosa con candidatos: «la losa» con «Encofrado losa» y «Hormigonado losa»
 * en la obra no se elige por orden alfabético. Una palabra reconocida a dos letras también es dudosa.
 */
function resolverTarea(palabrasDichas, it, juntas = []) {
  const dichas = [...new Set(palabrasDichas.map(raiz))]
  if (!dichas.length && !juntas.length) return null
  const sonidos = [...new Set([...palabrasDichas, ...juntas].filter((w) => w.length >= 5).map(fonetica))]
  const puntuadas = it.map((x) => {
    let dichasDeLaTarea = 0, peor = 0, parecida = false
    for (const w of x.palabras) {
      if (dichas.includes(w.r)) { dichasDeLaTarea++; continue }
      if (w.w.length < 5) continue
      const tope = w.f.length >= 8 ? 2 : 1
      const d = Math.min(...sonidos.map((f) => lev(w.f, f, 2)), 9)
      if (d <= tope) { dichasDeLaTarea++; peor = Math.max(peor, d); parecida = true }
    }
    if (!dichasDeLaTarea) return null
    const rubro = dichas.filter((r) => x.raices.has(r)).length
    const p = dichasDeLaTarea / Math.max(1, x.palabras.length) + 0.1 * dichasDeLaTarea + 0.25 * rubro / Math.max(1, dichas.length) - 0.01 * peor
    return { t: x.t, p, peor, parecida }
  }).filter(Boolean).sort((a, b) => b.p - a.p)
  if (!puntuadas.length) return null
  const empatadas = puntuadas.filter((x) => puntuadas[0].p - x.p < 0.001)
  return {
    tarea: puntuadas[0].t, candidatos: empatadas.map((x) => x.t),
    dudosa: empatadas.length > 1 || puntuadas[0].peor >= 2, parecida: puntuadas[0].parecida,
  }
}

// ── LA PROPUESTA ────────────────────────────────────────────────────────────────────────────────

/** Pares de palabras seguidas, pegadas: «un cofrado» → «uncofrado», para lo que el reconocedor partió. */
function juntasDe(tk, desde, hasta, usado) {
  const out = []
  for (let i = Math.max(0, desde); i < hasta - 1; i++) {
    if (tk[i]?.tipo === 'pal' && tk[i + 1]?.tipo === 'pal' && !usado[i] && !usado[i + 1]) out.push(tk[i].n + tk[i + 1].n)
  }
  return out
}

/**
 * El nombre de una tarea como se muestra: con su rubro padre si lo tiene («VA1 › Hormigonado»). Una
 * obra real tiene diez «Hormigonado» y «Encofrado» (uno por elemento): sin el padre, elegir entre
 * candidatos sería elegir entre nombres iguales.
 */
export const etiqueta = (t) => (t ? (t.padre ? `${t.padre} › ${t.nombre}` : t.nombre) : null)

const coincide = (tk, i, patron) => patron.every((w, k) => tk[i + k]?.n === w)
const redondear = (n) => Math.round(n * 100) / 100

/**
 * @param {string} texto  lo que se transcribió
 * @param {{obra?:{nombre?:string, codigo?:string, jornada_horas?:number|null},
 *          personas:Array<{id:string, nombre_completo:string, nombre_para_mostrar?:string|null, apodo?:string|null}>,
 *          tareas:Array<{id:string, nombre:string, rubro?:string|null, unidad?:string|null, metodo_avance?:string|null,
 *                        avance_pct?:number|null, cantidad_ejecutada?:number|null, cantidad_objetivo?:number|null, bloqueada?:boolean}>}} contexto
 */
export function proponerParte(texto, contexto = {}) {
  const t = String(texto ?? '')
  const personasObra = contexto.personas ?? []
  const tareasObra = (contexto.tareas ?? [])
  const jornada = Number(contexto.obra?.jornada_horas) > 0 ? Number(contexto.obra.jornada_horas) : 8
  const tk = tokenizar(t)
  const usado = new Array(tk.length).fill(false)
  const ip = indicePersonas(personasObra, tareasObra)
  const it = indiceTareas(tareasObra)
  const tramo = (i, j) => [tk[i].a, tk[Math.max(i, j - 1)].b]
  const marcar = (i, j) => { for (let k = i; k < j; k++) usado[k] = true }

  // Oraciones: [desde, hasta) sobre tokens, cortadas por el punto.
  const oraciones = []
  { let a = 0; for (let i = 0; i <= tk.length; i++) if (i === tk.length || tk[i].tipo === 'fin') { if (i > a) oraciones.push([a, i]); a = i + 1 } }

  const personas = new Map() // persona_id → fila
  const dudasPersona = []    // menciones ambiguas (varias personas posibles)
  const avances = []
  const materiales = []
  const novedades = []
  const avisos = []
  let conteo = null
  let horasGenerales = null
  const nombradas = new Set()

  const ponerPersona = (p, fila) => {
    const previa = personas.get(p.id)
    if (previa && previa.estado !== fila.estado) {
      previa.dudoso = true
      previa.motivo = 'se la nombró como presente y como ausente'
      return
    }
    if (previa) return
    personas.set(p.id, { persona_id: p.id, nombre: rotuloDePersona(p), ...fila })
  }

  // 1 · MATERIAL: «faltan veinte bolsas de cemento, seis barras de hierro del ocho y dos del doce».
  for (const [oa, ob] of oraciones) {
    for (let i = oa; i < ob; i++) {
      const disp = DISPARA_MATERIAL.find((p) => coincide(tk, i, p))
      if (!disp) continue
      let j = i + disp.length
      // «hay que pedir» / «falta pedir»
      if (tk[j]?.n === 'pedir') j++
      const items = []
      let previo = null
      while (j < ob) {
        if (tk[j].tipo === 'coma' || tk[j].n === 'y' || tk[j].n === 'e') { j++; continue }
        if (tk[j].tipo !== 'num') break
        const ini = j
        const cantidad = tk[j].valor; j++
        let unidad = null
        if (tk[j]?.tipo === 'pal' && UNIDAD_MATERIAL[tk[j].n]) {
          unidad = UNIDAD_MATERIAL[tk[j].n]
          if (unidad === 'm' && CALIFICA_METRO[tk[j + 1]?.n]) { unidad = CALIFICA_METRO[tk[j + 1].n]; j++ }
          j++
        }
        if (tk[j]?.n === 'de') j++
        const mIni = j
        while (j < ob && tk[j].tipo !== 'coma' && !CORTA_MATERIAL.has(tk[j].n)
          && !(tk[j].n === 'y' && tk[j + 1]?.tipo === 'num')) j++
        let material = mIni < j ? t.slice(tk[mIni].a, tk[j - 1].b).trim() : ''
        // «y dos del doce» hereda la unidad y el material base del ítem anterior.
        if (previo && !unidad && /^del?\s/i.test(material)) {
          unidad = previo.unidad
          const base = previo.material.split(/\s+del?\s+/i)[0]
          material = `${base} ${material}`
        }
        if (!material) break
        const it2 = { material, cantidad, unidad: unidad ?? 'un', tramo: tramo(ini, j), dudoso: false, motivo: null }
        if (!(cantidad > 0)) { it2.dudoso = true; it2.motivo = 'la cantidad no se entendió' }
        items.push(it2); previo = it2
        marcar(ini, j)
      }
      if (items.length) {
        marcar(i, i + disp.length)
        const urg = URGENTE.test(sinTilde(t.slice(tk[oa].a, tk[ob - 1].b))) ? 'hoy' : 'semana'
        // Lo que corta el ítem («para mañana») también es parte del pedido: se consume hasta el punto.
        for (let k = j; k < ob && !usado[k]; k++) if (CORTA_MATERIAL.has(tk[k].n) || tk[k].tipo === 'pal') usado[k] = true; else break
        for (const x of items) materiales.push({ ...x, urgencia: urg })
        i = j
      }
    }
  }

  // 2 · AVANCE: «la losa quedó al cuarenta por ciento», «terminamos el contrapiso», «hicimos 15 m2 de revoque».
  for (const [oa, ob] of oraciones) {
    for (let i = oa; i < ob; i++) {
      if (usado[i]) continue
      let tipo = null, valor = null, ini = i, fin = i + 1
      if (tk[i].tipo === 'num' && tk[i + 1]?.tipo === 'pct') {
        // ¿acumulado («quedó al 40 %») o incremento («avanzamos un 10 %»)?
        const antes = tk.slice(Math.max(oa, i - 4), i).map((x) => x.n)
        tipo = antes.some((w) => ['avanzamos', 'avanzaron', 'avanzo', 'sumamos', 'mas'].includes(w)) || tk[i + 2]?.n === 'mas'
          ? 'incremento_pct' : 'acumulado_pct'
        valor = tk[i].valor; fin = i + 2
        const k = antes.length ? i - antes.length : i
        for (let q = k; q < i; q++) if (ACUMULADO.has(tk[q].n) || ['al', 'en', 'un', 'avanzamos', 'avanzaron', 'avanzo'].includes(tk[q].n)) { ini = q; break }
      } else if (tk[i].tipo === 'pal' && TERMINADO.has(tk[i].n)) {
        tipo = 'terminado'; valor = 100
      } else if (tk[i].tipo === 'pal' && HECHO_CANTIDAD.has(tk[i].n) && tk[i].n !== 'se') {
        let k = i + 1
        if (tk[k]?.tipo === 'num' && tk[k + 1]?.tipo === 'pal' && (UNIDAD_MATERIAL[tk[k + 1].n] || ['m2', 'm3', 'ml'].includes(tk[k + 1].n))) {
          tipo = 'cantidad'; valor = tk[k].valor; fin = k + 2
          if (tk[k + 1].n.startsWith('metro') && CALIFICA_METRO[tk[k + 2]?.n]) fin++
        }
      }
      if (!tipo) continue
      // La tarea: las palabras de la oración que no son de otra cosa.
      const raices = []
      const idxTarea = []
      for (let q = oa; q < ob; q++) {
        if (usado[q] || (q >= ini && q < fin) || tk[q].tipo !== 'pal') continue
        if (VACIAS.has(tk[q].n) || ACUMULADO.has(tk[q].n) || TERMINADO.has(tk[q].n) || HECHO_CANTIDAD.has(tk[q].n)) continue
        if (tokenDeNombre(tk[q], ip)) continue
        raices.push(tk[q].n); idxTarea.push(q)
      }
      const r = resolverTarea(raices, it, juntasDe(tk, oa, ob, usado))
      if (!r) {
        if (tipo === 'terminado') continue // «terminamos temprano» no es un avance
        continue // un porcentaje sin tarea reconocible queda para Novedades
      }
      // Sólo las palabras que efectivamente son de la tarea se resaltan con el avance.
      const usadas = r.parecida ? [] : idxTarea.filter((q) => (it.find((x) => x.t === r.tarea)?.raices ?? new Set()).has(raiz(tk[q].n)))
      const a = Math.min(ini, ...usadas), b = Math.max(fin, ...usadas.map((q) => q + 1))
      marcar(ini, fin); for (const q of usadas) usado[q] = true
      avances.push(armarAvance(r, tipo, valor, [tk[a].a, tk[b - 1].b]))
      break
    }
  }

  // 3 · CONTEO: «hoy éramos seis».
  for (let i = 0; i < tk.length; i++) {
    const esConteo = tk[i].tipo === 'pal' && (CONTEO.has(tk[i].n) || (tk[i].n.length >= 6 && /(mos|ron)$/.test(tk[i].n) && [...CONTEO].some((w) => lev(fonetica(w), fonetica(tk[i].n), 2) <= 2)))
    if (esConteo && tk[i + 1]?.tipo === 'num'
      && !['hora', 'horas', 'hs', 'h'].includes(tk[i + 2]?.n) && tk[i + 2]?.tipo !== 'pct') {
      conteo = { dicho: tk[i + 1].valor, tramo: tramo(i, i + 2) }
      marcar(i, i + 2); if (tk[i + 2]?.n === 'personas' || tk[i + 2]?.n === 'operarios') usado[i + 2] = true
      break
    }
  }

  // 4 · FALTAS: «Quiroga no vino», «faltó Quiroga». Siempre DUDOSAS: descuentan un día de sueldo.
  for (const [oa, ob] of oraciones) {
    for (let i = oa; i < ob; i++) {
      if (usado[i]) continue
      const antes = AUSENCIA_ANTES.find((p) => coincide(tk, i, p))
      if (antes) {
        const ms = menciones(tk, i + antes.length, Math.min(ob, i + antes.length + 6), ip, usado)
          .filter((m, k, arr) => k === 0 || m.a <= arr[k - 1].b + 2)
        if (ms.length) {
          for (const m of ms) agregarMencion(m, 'ausente', null, null, [tk[i].a, tk[m.b - 1].b], 'baja')
          marcar(i, ms.at(-1).b)
        }
        continue
      }
      let m0 = menciones(tk, i, Math.min(ob, i + 8), ip, usado)[0]
      // «Kilos no vino»: una palabra del oficio NO es un apellido parecido… salvo delante de «no vino».
      if ((!m0 || m0.a !== i) && tk[i].cap && AUSENCIA_DESPUES.some((p) => coincide(tk, i + 1, p))) {
        const suelto = tokenDeNombre(tk[i], { ...ip, bloqueadas: new Set() })
        const c = suelto && suelto.dist <= 1 ? ip.idx.filter((x) => x.palabras.has(suelto.w)).map((x) => x.p) : []
        if (c.length) m0 = { a: i, b: i + 1, candidatos: c, exacto: false, dist: 1 }
      }
      if (!m0 || m0.a !== i) continue
      // La mención puede ser una lista: «Quiroga y Páez no vinieron».
      const lista = [m0]; let k = m0.b
      while (k < ob && (tk[k].n === 'y' || tk[k].tipo === 'coma')) {
        const sig = menciones(tk, k + 1, Math.min(ob, k + 5), ip, usado)[0]
        if (!sig || sig.a !== k + 1) break
        lista.push(sig); k = sig.b
      }
      const despues = AUSENCIA_DESPUES.find((p) => coincide(tk, k, p))
      if (!despues) { i = k - 1; continue }
      for (const m of lista) agregarMencion(m, 'ausente', null, null, [tk[m.a].a, tk[k + despues.length - 1].b], 'baja')
      marcar(i, k + despues.length)
      i = k + despues.length - 1
    }
  }

  // 5 · PRESENTES: por cláusula (la coma separa «Agüero y Maldonado ocho horas en encofrado» de «el resto en hormigonado»).
  const grupos = []
  for (const [oa, ob] of oraciones) {
    const clausulas = []
    { let a = oa; for (let i = oa; i <= ob; i++) if (i === ob || tk[i].tipo === 'coma') { if (i > a) clausulas.push([a, i]); a = i + 1 } }
    let horasOracion = null
    // Las personas de la cláusula anterior de la misma oración (para «…, ocho horas en encofrado»).
    let anteriores = []
    const idxLibres = (a, b) => { const out = []; for (let i = a; i < b; i++) if (!usado[i] && tk[i].tipo === 'pal' && !VACIAS.has(tk[i].n) && !NO_NOMBRE.has(tk[i].n) && !['si', 'sí', 'vino', 'vinieron'].includes(tk[i].n)) out.push(i); return out }
    for (const [ca, cb] of clausulas) {
      const ms = menciones(tk, ca, cb, ip, usado)
      // horas
      let horas = null, hIni = -1, hFin = -1
      for (let i = ca; i < cb; i++) {
        if (usado[i]) continue
        if (tk[i].tipo === 'num' && ['hora', 'horas', 'hs', 'h'].includes(tk[i + 1]?.n)) {
          horas = tk[i].valor; hIni = i; hFin = i + 2
          if (tk[i + 2]?.n === 'y' && (tk[i + 3]?.n === 'media')) { horas += 0.5; hFin = i + 4 }
          break
        }
        if ((tk[i].n === 'media' || tk[i].n === 'medio') && ['jornada', 'dia'].includes(tk[i + 1]?.n)) { horas = jornada / 2; hIni = i; hFin = i + 2; break }
        if (tk[i].n === 'jornada' && tk[i + 1]?.n === 'completa') { horas = jornada; hIni = i; hFin = i + 2; break }
        if (tk[i].n === 'media' && tk[i + 1]?.n === 'hora') { horas = 0.5; hIni = i; hFin = i + 2; break }
      }
      // grupo: «el resto», «los demás», «los otros cuatro», «cuatro más», «todos»
      let grupo = null
      for (let i = ca; i < cb; i++) {
        if (usado[i]) continue
        if (tk[i].n === 'resto' || tk[i].n === 'demas') { grupo = { n: null, a: i - (['el', 'los'].includes(tk[i - 1]?.n) ? 1 : 0), b: i + 1 }; break }
        if (tk[i].n === 'otros' && tk[i + 1]?.tipo === 'num') { grupo = { n: tk[i + 1].valor, a: i - (tk[i - 1]?.n === 'los' ? 1 : 0), b: i + 2 }; break }
        if (tk[i].tipo === 'num' && tk[i + 1]?.n === 'mas' && !['hora', 'horas'].includes(tk[i + 2]?.n)) { grupo = { n: tk[i].valor, a: i, b: i + 2 }; break }
        if (tk[i].n === 'todos' && !['los', 'las'].includes(tk[i + 1]?.n)) { grupo = { n: null, todos: true, a: i, b: i + 1 }; break }
      }
      if (!ms.length && !grupo) {
        // «Quiroga sí vino, ocho horas en encofrado»: la cláusula sin sujeto que sigue a una con gente
        // es de esa gente (sus horas y su tarea), no de toda la jornada.
        if (anteriores.length && (horas != null || idxLibres(ca, cb).length)) {
          const pal = idxLibres(ca, cb).filter((i) => !(i >= hIni && i < hFin))
          const rt2 = resolverTarea(pal.map((i) => tk[i].n), it, juntasDe(tk, ca, cb, usado))
          for (const pid of anteriores) {
            const fila = personas.get(pid)
            if (!fila || fila.estado !== 'presente') continue
            if (horas != null && fila.horas == null) { fila.horas = horas; fila.horasDe = 'dicho' }
            if (rt2 && !fila.tarea_id) {
              fila.tarea_id = rt2.tarea.id; fila.tarea_nombre = etiqueta(rt2.tarea)
              if (rt2.dudosa) { fila.dudoso = true; fila.motivo = 'no queda claro en qué tarea'; fila.tarea_candidatos = rt2.candidatos.map((x) => ({ id: x.id, nombre: etiqueta(x) })) }
            }
            fila.tramo = [fila.tramo?.[0] ?? tk[ca].a, tk[cb - 1].b]
          }
          if (horas != null || rt2) { marcar(ca, cb); continue }
        }
        // Horas sin sujeto («estuvimos ocho horas»): valen para toda la jornada dictada.
        if (horas != null && hIni >= 0) { horasGenerales = { horas, tramo: tramo(hIni, hFin) }; marcar(hIni, hFin) }
        continue
      }
      if (horas != null) horasOracion = horas
      // tarea: lo que queda de la cláusula
      const raices = [], idxTarea = []
      for (let i = ca; i < cb; i++) {
        if (usado[i] || tk[i].tipo !== 'pal') continue
        if ((i >= hIni && i < hFin) || (grupo && i >= grupo.a && i < grupo.b)) continue
        if (ms.some((m) => i >= m.a && i < m.b)) continue
        if (VACIAS.has(tk[i].n) || NO_NOMBRE.has(tk[i].n)) continue
        raices.push(tk[i].n); idxTarea.push(i)
      }
      const rt = resolverTarea(raices, it, idxTarea.length ? juntasDe(tk, idxTarea[0] - 1, idxTarea.at(-1) + 1, usado) : [])
      let tareaNoEncontrada = null
      if (!rt && idxTarea.length) tareaNoEncontrada = t.slice(tk[idxTarea[0]].a, tk[idxTarea.at(-1)].b)
      const tramoCl = tramo(ca, cb)
      const fila = { horas, tarea: rt, tramo: tramoCl }
      for (const m of ms) agregarMencion(m, 'presente', fila, tareaNoEncontrada, tramoCl, horas != null ? 'alta' : 'media')
      anteriores = ms.filter((m) => m.candidatos.length === 1).map((m) => m.candidatos[0].id)
      if (grupo) grupos.push({ ...grupo, horas, tarea: rt, tramo: tramoCl, tareaNoEncontrada })
      marcar(ca, cb)
      if (tareaNoEncontrada) {
        novedades.push({ texto: `${t.slice(tk[ca].a, tk[cb - 1].b)} (no es una tarea de esta obra)`, tramo: tramoCl })
      }
    }
    // Las cláusulas sin horas heredan las de la oración: «Agüero y Maldonado ocho horas en encofrado, el resto en hormigonado».
    if (horasOracion != null) {
      for (const f of personas.values()) if (f._oracion === oa && f.horas == null && f.estado === 'presente') { f.horas = horasOracion; f.horasDe = 'oracion' }
      for (const g of grupos) if (g._oracion === undefined) { g._oracion = oa; if (g.horas == null) g.horas = horasOracion }
    }
    for (const g of grupos) if (g._oracion === undefined) g._oracion = oa
  }

  function agregarMencion(m, estado, fila, tareaNoEncontrada, tr, confianza) {
    if (m.candidatos.length > 1) {
      dudasPersona.push({
        persona_id: null, nombre: t.slice(tk[m.a].a, tk[m.b - 1].b), estado,
        horas: fila?.horas ?? null, tarea_id: fila?.tarea?.tarea?.id ?? null, tarea_nombre: etiqueta(fila?.tarea?.tarea),
        candidatos: m.candidatos.map((p) => ({ id: p.id, nombre: rotuloDePersona(p) })),
        dudoso: true, motivo: `hay ${m.candidatos.length} personas que se llaman así en la obra`, confianza: 'baja',
        tramo: [tk[m.a].a, tk[m.b - 1].b], origen: 'dictado',
      })
      return
    }
    const p = m.candidatos[0]
    nombradas.add(p.id)
    const r = fila?.tarea
    const dicho = t.slice(tk[m.a].a, tk[m.b - 1].b)
    // Un nombre PARECIDO («Arduello» por Argüello) se confirma: el reconocedor no conoce al plantel.
    const parecido = (m.dist ?? 0) >= 1
    ponerPersona(p, {
      estado, horas: fila?.horas ?? null, horasDe: fila?.horas != null ? 'dicho' : null,
      tarea_id: r?.tarea?.id ?? null, tarea_nombre: etiqueta(r?.tarea),
      tarea_candidatos: r?.dudosa ? r.candidatos.map((x) => ({ id: x.id, nombre: etiqueta(x) })) : [],
      confianza: parecido ? 'baja' : m.exacto ? confianza : 'media',
      dudoso: estado === 'ausente' || parecido || Boolean(r?.dudosa),
      motivo: parecido ? `se entendió «${dicho}»: ¿es ${rotuloDePersona(p)}?`
        : estado === 'ausente' ? '¿faltó todo el día?' : r?.dudosa ? 'no queda claro en qué tarea' : null,
      tramo: tr, origen: 'dictado', _oracion: oracionDe(m.a), tareaNoEncontrada: tareaNoEncontrada ?? null,
    })
  }
  function oracionDe(i) { return (oraciones.find(([a, b]) => i >= a && i < b) ?? [0])[0] }

  // 6 · GRUPOS: «el resto» = el plantel de la obra menos lo nombrado.
  for (const g of grupos) {
    const nombrados = new Set([...personas.keys(), ...dudasPersona.flatMap((d) => d.candidatos.map((c) => c.id))])
    const quedan = personasObra.filter((p) => !nombrados.has(p.id))
    const horas = g.horas ?? horasGenerales?.horas ?? null
    let dudoso = false, motivo = null
    if (!quedan.length) {
      avisos.push({ texto: `Dijiste «${t.slice(g.tramo[0], g.tramo[1])}» pero no queda nadie más del plantel de la obra.`, tramo: g.tramo })
      continue
    }
    if (g.n != null && g.n !== quedan.length) {
      dudoso = true
      motivo = `dijiste ${g.n} y del plantel quedan ${quedan.length}`
    } else if (!g.todos && nombrados.size === 0) {
      // «El resto» sin nadie nombrado antes es TODO el plantel: puede ser que los nombres no se entendieron.
      dudoso = true
      motivo = 'dijiste «el resto» y no entendí a nadie antes'
    }
    for (const p of quedan) {
      personas.set(p.id, {
        persona_id: p.id, nombre: rotuloDePersona(p), estado: 'presente', horas,
        horasDe: g.horas != null ? 'oracion' : horasGenerales ? 'general' : null,
        tarea_id: g.tarea?.tarea?.id ?? null, tarea_nombre: etiqueta(g.tarea?.tarea),
        tarea_candidatos: g.tarea?.dudosa ? g.tarea.candidatos.map((x) => ({ id: x.id, nombre: etiqueta(x) })) : [],
        confianza: 'media', dudoso: dudoso || Boolean(g.tarea?.dudosa),
        motivo: motivo ?? (g.tarea?.dudosa ? 'no queda claro en qué tarea' : null),
        tramo: g.tramo, origen: 'grupo', grupo: t.slice(g.tramo[0], g.tramo[1]).split(/\s+(?:en|haciendo|con)\s+/i)[0],
      })
    }
  }

  // Horas que nadie dijo: las generales de la jornada, o la jornada de la obra (confianza media).
  for (const f of [...personas.values(), ...dudasPersona]) {
    if (f.estado !== 'presente' || f.horas != null) continue
    if (horasGenerales) { f.horas = horasGenerales.horas; f.horasDe = 'general' }
    else { f.horas = jornada; f.horasDe = 'jornada'; if (f.confianza === 'alta') f.confianza = 'media' }
  }
  for (const f of [...personas.values(), ...dudasPersona]) {
    if (f.horas != null && !(f.horas > 0 && f.horas <= 24)) { f.dudoso = true; f.motivo = `${f.horas} horas no es una jornada posible` }
    delete f._oracion
  }

  // 7 · CONTEO CONTRA LO ENTENDIDO.
  const filasPersonas = [...personas.values(), ...dudasPersona]
  const presentes = filasPersonas.filter((f) => f.estado === 'presente').length
  if (conteo && conteo.dicho !== presentes) {
    avisos.push({ texto: `Dijiste que eran ${conteo.dicho} y entendí ${presentes} presentes.`, tramo: conteo.tramo })
  }

  // 8 · LO QUE NO SE ENTENDIÓ → NOVEDADES, por oración (o por cláusula si la oración se usó a medias).
  const nombreObra = new Set(raicesDe(`${contexto.obra?.nombre ?? ''}`))
  for (const [oa, ob] of oraciones) {
    const clausulas = []
    { let a = oa; for (let i = oa; i <= ob; i++) if (i === ob || tk[i].tipo === 'coma') { if (i > a) clausulas.push([a, i]); a = i + 1 } }
    const algoUsado = tk.slice(oa, ob).some((_, k) => usado[oa + k])
    const tramos = algoUsado ? clausulas : [[oa, ob]]
    for (const [a, b] of tramos) {
      const libres = []
      for (let i = a; i < b; i++) if (!usado[i]) libres.push(i)
      const contenido = libres.filter((i) => tk[i].tipo === 'num' || (tk[i].tipo === 'pal' && !VACIAS.has(tk[i].n) && tk[i].n.length > 2))
      if (!contenido.length) continue
      // La oración que sólo nombra la obra («Playón de azufre.») no es una novedad.
      const soloObra = contenido.every((i) => tk[i].tipo === 'pal' && nombreObra.has(raiz(tk[i].n)))
      if (soloObra) continue
      if (contenido.length < 2 && algoUsado) continue
      const ini = libres[0], fin = libres.at(-1) + 1
      const textoNov = t.slice(tk[ini].a, tk[fin - 1].b).replace(/^[\s,y]+/i, '').trim()
      if (textoNov) novedades.push({ texto: capitalizar(textoNov), tramo: [tk[ini].a, tk[fin - 1].b] })
    }
  }

  // «EL RESTO» DEPENDE DE A QUIÉN SE NOMBRÓ. Si un nombrado se entendió a medias, o quedó en Novedades
  // un «no vino» sin saber de quién, el resto puede incluir a alguien que faltó: se confirma.
  // Medido con audio sintético (25/09): «Cosales no vino» quedó sin nombre y Rosales entraba al resto
  // como presente, en amarillo, sin que nada lo marcara.
  const faltaSinNombre = novedades.some((n) => /\b(no vino|no vinieron|falt[oó]|faltaron|no estuvo)\b/i.test(sinTilde(n.texto)))
  const nombradoDudoso = filasPersonas.some((f) => f.origen === 'dictado' && f.estado === 'presente' && /se entendió/.test(f.motivo ?? ''))
  if (faltaSinNombre || nombradoDudoso) {
    for (const f of filasPersonas) {
      if (f.origen !== 'grupo' || f.dudoso) continue
      f.dudoso = true
      f.motivo = faltaSinNombre ? 'alguien «no vino» y no entendí quién: ¿vino?' : 'depende de un nombre que no se entendió bien'
    }
  }

  const filas = filasPersonas.sort((a, b) => ordenFila(a) - ordenFila(b) || String(a.nombre).localeCompare(String(b.nombre), 'es'))
  const dudas = filas.filter((f) => f.dudoso).length + avances.filter((a) => a.dudoso).length
    + materiales.filter((m) => m.dudoso).length + avisos.length
  const tareasDistintas = new Set(filas.filter((f) => f.tarea_id).map((f) => f.tarea_id)).size

  return {
    version: 1,
    estado: 'propuesta',
    porQue: 'dictado interpretado por reglas: nada se guarda hasta que una persona lo revisa y toca Guardar',
    texto: t,
    personas: filas,
    avances,
    materiales,
    novedades,
    avisos,
    conteo,
    resumen: {
      personas: filas.filter((f) => f.estado === 'presente').length,
      ausentes: filas.filter((f) => f.estado === 'ausente').length,
      tareas: tareasDistintas,
      avances: avances.length,
      pedidos: materiales.length,
      novedades: novedades.length,
      dudas,
      texto: textoResumen({ personas: presentes, tareas: tareasDistintas, avances: avances.length, pedidos: materiales.length, dudas }),
    },
    marcas: marcasDelTexto({ filas, avances, materiales, avisos, conteo }),
  }

  function armarAvance(r, tipo, valor, tr) {
    const tarea = r.tarea
    const metodo = tarea.metodo_avance ?? 'manual'
    const actual = Number(tarea.avance_pct ?? 0)
    const ejec = Number(tarea.cantidad_ejecutada ?? 0)
    const obj = tarea.cantidad_objetivo == null ? null : Number(tarea.cantidad_objetivo)
    let produccion = null, dudoso = Boolean(r.dudosa), motivo = r.dudosa ? 'no queda claro de qué tarea' : null
    if (metodo === 'cantidad') {
      if (tipo === 'cantidad') produccion = valor
      else if (obj == null) { dudoso = true; motivo = 'la tarea se mide en cantidad y no tiene objetivo cargado' }
      else if (tipo === 'acumulado_pct') produccion = obj * valor / 100 - ejec
      else if (tipo === 'incremento_pct') produccion = obj * valor / 100
      else if (tipo === 'terminado') produccion = obj - ejec
    } else {
      if (tipo === 'cantidad') { dudoso = true; motivo = 'la tarea se mide en %, no en cantidad' }
      else if (tipo === 'acumulado_pct') produccion = valor - actual
      else if (tipo === 'incremento_pct') produccion = valor
      else if (tipo === 'terminado') produccion = 100 - actual
    }
    if (produccion != null) {
      produccion = redondear(produccion)
      if (produccion <= 0) { dudoso = true; motivo = `ya estaba en ${metodo === 'cantidad' ? `${ejec} ${tarea.unidad ?? ''}`.trim() : `${actual} %`}`; produccion = null }
    }
    if ((tipo === 'acumulado_pct' || tipo === 'incremento_pct') && valor > 100) { dudoso = true; motivo = `${valor} % no es un avance posible`; produccion = null }
    if (tarea.bloqueada) { dudoso = true; motivo = 'la tarea está bloqueada' }
    return {
      tarea_id: tarea.id, tarea_nombre: etiqueta(tarea), metodo, unidad: metodo === 'cantidad' ? (tarea.unidad ?? '') : '%',
      tipo, valor, produccion, actual: metodo === 'cantidad' ? ejec : actual,
      candidatos: r.dudosa ? r.candidatos.map((x) => ({ id: x.id, nombre: etiqueta(x) })) : [],
      dudoso, motivo, tramo: tr, confianza: r.dudosa ? 'baja' : 'alta',
    }
  }
}

const ordenFila = (f) => (f.estado === 'ausente' ? 3 : f.origen === 'grupo' ? 2 : f.dudoso ? 1 : 0)
const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/** «Entendí 6 personas, 2 tareas, 1 avance y 1 pedido. Hay 1 dato para confirmar.» */
export function textoResumen({ personas, tareas, avances, pedidos, dudas }) {
  const n = (k, s, p) => `${k} ${k === 1 ? s : p}`
  const partes = [n(personas, 'persona', 'personas'), n(tareas, 'tarea', 'tareas'), n(avances, 'avance', 'avances'), n(pedidos, 'pedido', 'pedidos')]
  const lista = `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`
  const cola = dudas === 0 ? 'Nada para confirmar.' : dudas === 1 ? 'Hay 1 dato para confirmar.' : `Hay ${dudas} datos para confirmar.`
  return `Entendí ${lista}. ${cola}`
}

/** Los tramos a resaltar en «Lo que dijo», sin solaparse: `dato` (amarillo) o `duda` (naranja). */
function marcasDelTexto({ filas, avances, materiales, avisos, conteo }) {
  const m = []
  const poner = (tr, tipo) => { if (tr && tr[1] > tr[0]) m.push({ desde: tr[0], hasta: tr[1], tipo }) }
  if (conteo) poner(conteo.tramo, 'dato')
  const vistos = new Set()
  for (const f of filas) { const k = `${f.tramo?.[0]}-${f.tramo?.[1]}`; if (vistos.has(k + f.dudoso)) continue; vistos.add(k + f.dudoso); poner(f.tramo, f.dudoso ? 'duda' : 'dato') }
  for (const a of avances) poner(a.tramo, a.dudoso ? 'duda' : 'dato')
  for (const x of materiales) poner(x.tramo, x.dudoso ? 'duda' : 'dato')
  for (const a of avisos) poner(a.tramo, 'duda')
  // Sin solapes: gana la duda; a igualdad, el tramo que empieza antes.
  m.sort((a, b) => a.desde - b.desde || (a.tipo === 'duda' ? -1 : 1))
  const out = []
  for (const x of m) {
    const prev = out.at(-1)
    if (prev && x.desde < prev.hasta) {
      if (x.tipo === 'duda' && prev.tipo !== 'duda') { prev.hasta = x.desde; if (prev.hasta <= prev.desde) out.pop(); out.push(x) }
      else if (x.hasta > prev.hasta) out.push({ ...x, desde: prev.hasta })
      continue
    }
    out.push({ ...x })
  }
  return out
}
