// EL DATASET AUDITABLE — un hallazgo por fila, con los campos afuera y los huecos declarados.
//
// ═══ QUÉ PROBLEMA RESUELVE ═══
//
// Un hallazgo, tal como lo emite una regla, guarda media identidad adentro de un string: el archivo
// de Drive vive en `clave` («1SCGIK….oferta») y el archivo, la hoja y la celda viven concatenados
// en `evidencia[].ubicacion` («COTIZACION INTERNA.xlsm · hoja OFERTA · E25»). Así se lee bien y no
// se cruza con nada: no se puede filtrar por cliente, ni contar por hoja, ni preguntar cuántos
// hallazgos tiene un presupuesto.
//
// Acá esos campos salen afuera. NO se inventan: se EXTRAEN de donde ya están, y lo que no está
// queda en `null` y se cuenta como hueco declarado. Un dataset con el 100 % de las celdas llenas y
// un 20 % de valores plausibles es peor que uno con huecos, porque el que lo lee no sabe cuáles.
//
// ═══ POR QUÉ EL VALOR SE LEE DE LA CITA Y ESO NO ES ADIVINAR ═══
//
// `valor_encontrado` no está en ningún campo: está adentro de la cita literal («IVA = 8760450.13
// sin fórmula»), que la escribe una regla de este mismo repo con un formato fijo. Leerlo de ahí es
// acoplarse a ese formato, y un acople silencioso se rompe el día que alguien reescribe una frase.
//
// Por eso cada lector tiene su prueba de ida y vuelta: el test arma un .xlsx real, lo pasa por la
// regla de producción y comprueba que el lector recupera el valor que la regla puso. Si mañana la
// regla cambia el texto de la cita, ese test se pone rojo — que es exactamente lo que tiene que
// pasar. Lo que no se puede leer sale `null`, nunca aproximado.
//
// ═══ EL ESTADO ARRANCA EN DETECTADO Y NO SE MUEVE SOLO ═══
//
// Un hallazgo detectado por una regla es una afirmación de una máquina sobre una planilla vieja.
// Confirmarlo o descartarlo lo hace una persona mirando el archivo. Nada de este módulo escribe
// CONFIRMADO: si lo hiciera, el control se estaría validando contra la misma información que
// produce.
import { HUECO, hueco } from './biblioteca.mjs'
import { clienteDe, obraDe } from './estudio-cotizaciones.mjs'
import { porcentajeDelRotulo } from './cotizacion-ecsas.mjs'
import { controlDe } from './controles-cotizacion.mjs'
import { TIPO } from './hallazgo.mjs'

/** El ciclo de vida de un hallazgo. Sólo `DETECTADO` lo escribe una máquina. */
export const ESTADO_HALLAZGO = Object.freeze({
  DETECTADO: 'DETECTADO',     // lo encontró un control; nadie lo miró todavía
  CONFIRMADO: 'CONFIRMADO',   // una persona abrió el archivo y es cierto
  DESCARTADO: 'DESCARTADO',   // una persona abrió el archivo y no es un defecto
  CORREGIDO: 'CORREGIDO',     // era cierto y ya se arregló en el origen
})

/** Las columnas del dataset, en orden. Los nombres son los que pidió el dueño, en snake_case y en
 *  castellano: este archivo es un artefacto para auditar contra su especificación, no una API
 *  interna, y renombrarlos a la convención del repo obligaría a traducir para verificarlo. */
export const CAMPOS = Object.freeze([
  'archivo', 'hoja', 'celda_o_rango', 'cliente', 'presupuesto', 'tipo_anomalia',
  'valor_encontrado', 'valor_esperado_o_condicion', 'severidad', 'explicacion',
  'evidencia', 'control_que_lo_detecto', 'estado',
])

/** Los campos que pueden quedar vacíos con motivo. Cada `null` en uno de éstos es un hueco contado,
 *  no un descuido. `evidencia` y `severidad` no están: un hallazgo sin eso no se emite. */
export const CAMPOS_CON_HUECO = Object.freeze([
  'archivo', 'hoja', 'celda_o_rango', 'cliente', 'presupuesto', 'valor_encontrado', 'valor_esperado_o_condicion',
])

/** Las claves que NO nombran una cotización: son hallazgos que comparan varias entre sí. */
const PREFIJOS_CRUZADOS = Object.freeze(['partida.', 'gg.'])

/** El id de Drive que nombra la clave de un hallazgo, o `null` si la clave es cruzada. PURA. */
export const cotizacionDeLaClave = (clave) => {
  const s = String(clave ?? '')
  if (PREFIJOS_CRUZADOS.some((p) => s.startsWith(p))) return null
  const primero = s.split('.')[0]
  return primero || null
}

/**
 * PARTE UNA UBICACIÓN EN SUS TRES PEDAZOS. PURA.
 *
 * El formato lo escriben las reglas y es siempre el mismo: `archivo · hoja X · celda`, con la hoja
 * y la celda opcionales. Se parte por el separador y NO por posición: hay ubicaciones de dos
 * segmentos («archivo · hoja OFERTA») y de tres, y contar posiciones daría la hoja como celda.
 */
export function partirUbicacion(ubicacion) {
  const partes = String(ubicacion ?? '').split('·').map((x) => x.trim()).filter(Boolean)
  if (!partes.length) return { archivo: null, hoja: null, celda: null }
  const archivo = partes[0]
  const hoja = partes.slice(1).find((p) => /^(hoja|pestaña) /i.test(p))?.replace(/^(hoja|pestaña) /i, '') ?? null
  const cola = partes[partes.length - 1]
  const celda = cola !== archivo && !/^(hoja|pestaña) /i.test(cola) ? cola : null
  return { archivo, hoja, celda }
}

/** El único valor de una lista, o `null` si hay más de uno o ninguno. Es lo que evita inventar «la»
 *  hoja de un hallazgo que toca tres. PURA. */
const unico = (xs) => {
  const d = [...new Set(xs.filter((x) => x !== null && x !== undefined))]
  return d.length === 1 ? d[0] : null
}

/** Las celdas citadas, enumeradas. NO se comprime a un rango: `E25` y `E27` no son `E25:E27`, y
 *  escribirlo así agregaría una celda que nadie citó. PURA. */
const celdasDe = (partes) => {
  const d = [...new Set(partes.map((p) => p.celda).filter(Boolean))]
  return d.length ? d.join(', ') : null
}

const trasIgual = (cita) => {
  const i = String(cita ?? '').indexOf('=')
  return i < 0 ? null : String(cita).slice(i + 1).trim()
}

const numeroDe = (texto) => {
  const m = /-?\d+(?:\.\d+)?/.exec(String(texto ?? ''))
  return m ? Number(m[0]) : null
}

const citas = (h) => (h.evidencia ?? []).map((e) => String(e.cita ?? ''))

/**
 * CÓMO SE LEE EL VALOR DE CADA TIPO.
 *
 * `condicion` es una frase, no un número: dice contra QUÉ se comparó. Va sólo donde la regla
 * realmente compara contra algo. Donde no —un indirecto en cero, una partida sin datos— queda
 * `null`, porque afirmar que «debería ser distinto de cero» sería convertir una costumbre en norma,
 * y un 0 no es un error por sí solo.
 */
const LECTORES = Object.freeze({
  [TIPO.OFERTA_ROTA]: {
    encontrado: (h) => citas(h).map(trasIgual).filter(Boolean).join(', ') || null,
    esperado: (h) => (typeof h.monto === 'number' ? h.monto : null),
  },
  [TIPO.IVA_ESCRITO_A_MANO]: {
    encontrado: (h) => numeroDe(trasIgual(citas(h)[0])),
    esperado: () => 'el IVA de la oferta tiene que salir de una fórmula sobre el SUB TOTAL, no de un número tipeado',
  },
  [TIPO.SUBTOTAL_NO_CIERRA]: {
    encontrado: (h) => numeroDe(trasIgual(citas(h)[0])),
    esperado: () => 'SUB TOTAL = suma de los subtotales de los ítems de la oferta',
  },
  [TIPO.TOTAL_NO_CIERRA]: {
    encontrado: (h) => numeroDe(trasIgual(citas(h)[0])),
    esperado: () => 'TOTAL = SUB TOTAL + IVA',
  },
  [TIPO.ROTULO_CONTRADICE_COEFICIENTE]: {
    // El aplicado sale de la segunda cita («coeficiente aplicado = 0.01»); el prometido se vuelve a
    // calcular del rótulo con la MISMA función que usa la regla, no con otra lectura del texto.
    encontrado: (h) => numeroDe(trasIgual(citas(h)[1])),
    esperado: (h) => porcentajeDelRotulo(citas(h)[0]),
  },
  [TIPO.COEFICIENTE_INESTABLE]: {
    encontrado: (h) => citas(h).map(numeroDe).filter((x) => x !== null).join(', ') || null,
    esperado: () => 'un rótulo que declara un porcentaje tiene que aplicar el mismo coeficiente en todas las cotizaciones',
  },
  [TIPO.UNIDAD_CONTRADICTORIA]: {
    encontrado: (h) => [...new Set(citas(h).map((c) => c.split(' en ').pop()))].join(', ') || null,
    esperado: () => 'un mismo código de partida se mide siempre con la misma unidad',
  },
  [TIPO.PARTIDA_SIN_DATOS]: { encontrado: () => 'sin datos', esperado: () => null },
  [TIPO.DATOS_DE_OTRO_CLIENTE]: {
    encontrado: (h) => numeroDe(citas(h)[0]),
    esperado: () => 'la hoja OFERTA del archivo que se manda sólo puede contener la oferta del cliente que se cotiza',
  },
  [TIPO.INDIRECTO_SIEMPRE_EN_CERO]: {
    encontrado: () => 0,
    // A propósito null: que un concepto valga 0 no prueba que tenga que valer otra cosa. Lo que el
    // hallazgo dice es que se repite, no que esté mal.
    esperado: () => null,
  },
  [TIPO.COEFICIENTE_AJUSTE_SIN_CRITERIO]: {
    encontrado: (h) => citas(h).map((c) => numeroDe(c.split('×').pop())).filter((x) => x !== null).join(', ') || null,
    esperado: () => 'un coeficiente de ajuste distinto de 1 tiene que tener registrada su procedencia',
  },
  [TIPO.COEFICIENTE_AJUSTE_IMPLAUSIBLE]: {
    encontrado: (h) => citas(h).map((c) => numeroDe(c.split('×').pop())).filter((x) => x !== null).join(', ') || null,
    esperado: () => 'un multiplicador tiene que caer entre 0,5 y 3 para poder leerse como un ajuste de precio',
  },
  [TIPO.REFERENCIA_ROTA]: { encontrado: (h) => citas(h)[0] || null, esperado: () => null },
  [TIPO.CELDA_EN_ERROR]: {
    encontrado: (h) => citas(h).map(trasIgual).filter(Boolean).join(', ') || null,
    esperado: () => null,
  },
  [TIPO.FORMULA_SOBRE_CELDA_ROTA]: { encontrado: (h) => citas(h)[0] || null, esperado: () => null },
  [TIPO.RENGLON_INCOHERENTE]: {
    encontrado: (h) => numeroDe(String(citas(h)[0]).split('declara').pop()),
    esperado: (h) => numeroDe(String(citas(h)[0]).split(' da ').pop()),
  },
})

const leer = (h, cual) => {
  try { return LECTORES[h.tipo]?.[cual]?.(h) ?? null } catch { return null }
}

/**
 * EL ÍNDICE QUE PONE NOMBRE AL id DE DRIVE. PURA.
 *
 * Sin él, `1SCGIKahe….oferta` no dice de quién es. Se arma con las cotizaciones que devolvió el
 * estudio, o con los documentos de la biblioteca —cuya `url` termina en el mismo id—. El cliente
 * sale de la RUTA con la misma función que usa el estudio, no de leer la afirmación.
 */
export function indiceDeCotizaciones(cotizaciones = []) {
  const m = new Map()
  for (const c of cotizaciones) {
    const id = c.driveId ?? c.id
    if (!id) continue
    const ruta = c.ruta ?? c.titulo ?? null
    m.set(id, { archivo: c.nombre ?? (ruta ? ruta.split('/').pop() : null), ruta, cliente: ruta ? clienteDe(ruta) : null, obra: c.obra ?? (ruta ? obraDe(ruta) : null) })
  }
  return m
}

/** El mismo índice, armado desde la biblioteca guardada. La `url` de un documento es
 *  `https://drive.google.com/file/d/<id>` y el `titulo` es la ruta completa. PURA. */
export function indiceDesdeBiblioteca(biblioteca = {}) {
  return indiceDeCotizaciones((biblioteca.documentos ?? []).map((d) => ({
    driveId: String(d.url ?? '').split('/').pop() || null,
    ruta: d.titulo ?? null,
  })).filter((d) => d.driveId && d.ruta))
}

/** UNA FILA DEL DATASET, a partir de un hallazgo. PURA. */
export function normalizar(h, { indice = new Map() } = {}) {
  const partes = (h.evidencia ?? []).map((e) => ({ ...partirUbicacion(e.ubicacion), cita: e.cita ?? null, ubicacion: e.ubicacion ?? null }))
  const cotizacionId = cotizacionDeLaClave(h.clave)
  const ficha = cotizacionId ? indice.get(cotizacionId) ?? null : null
  return {
    archivo: ficha?.archivo ?? unico(partes.map((p) => p.archivo)),
    hoja: unico(partes.map((p) => p.hoja)),
    celda_o_rango: celdasDe(partes),
    cliente: ficha?.cliente ?? null,
    presupuesto: ficha?.obra ?? null,
    tipo_anomalia: h.tipo,
    valor_encontrado: leer(h, 'encontrado'),
    valor_esperado_o_condicion: leer(h, 'esperado'),
    severidad: h.gravedad,
    explicacion: h.porQue ? `${h.afirmacion} — ${h.porQue}` : h.afirmacion,
    evidencia: partes,
    control_que_lo_detecto: controlDe(h.tipo),
    estado: ESTADO_HALLAZGO.DETECTADO,
    // Lo de abajo no está en el esquema pedido: es la trazabilidad que permite volver al hallazgo
    // original y cruzar con la biblioteca sin tener que reconstruir la clave.
    clave: h.clave,
    cotizacion_id: cotizacionId,
    monto_en_juego: typeof h.monto === 'number' ? h.monto : null,
  }
}

/** Por qué queda vacío cada campo que puede quedar vacío. La frase importa: es la que le dice a
 *  quien lea el dataset si el hueco se puede cerrar y con qué. */
const PORQUE_DEL_HUECO = Object.freeze({
  archivo: 'las evidencias del hallazgo nombran más de un archivo, o ninguna trae el nombre',
  hoja: 'el hallazgo abarca más de una hoja, o la evidencia no nombra ninguna',
  celda_o_rango: 'la evidencia llega hasta la hoja y no baja a la celda',
  cliente: 'la clave no nombra una cotización (compara varias entre sí) o el id de Drive no está en el índice',
  presupuesto: 'la clave no nombra una cotización (compara varias entre sí) o el id de Drive no está en el índice',
  valor_encontrado: 'la regla que emitió este hallazgo no deja un valor único legible en la cita',
  valor_esperado_o_condicion: 'no hay evidencia de contra qué debería compararse: dejarlo lleno sería convertir una costumbre en norma',
})

/** LOS HUECOS DEL DATASET, uno por campo vacío, con el vocabulario de la biblioteca. PURA. */
export function huecosDelDataset(filas = []) {
  const salida = []
  for (const f of filas) {
    for (const campo of CAMPOS_CON_HUECO) {
      if (f[campo] !== null && f[campo] !== undefined) continue
      salida.push(hueco({
        clave: `hallazgo.${f.clave}.${campo}`,
        tipo: HUECO.FALTA_DATO,
        porQue: PORQUE_DEL_HUECO[campo] ?? 'no se pudo derivar de lo que trae el hallazgo',
      }))
    }
  }
  return salida
}

/** Cuántas filas tienen cada campo lleno. Es la cobertura del dataset, y se publica al lado de las
 *  filas: un dataset sin su cobertura invita a leerlo como si estuviera completo. PURA. */
export function cobertura(filas = []) {
  const salida = {}
  for (const campo of CAMPOS_CON_HUECO) {
    const llenos = filas.filter((f) => f[campo] !== null && f[campo] !== undefined).length
    salida[campo] = { llenos, vacios: filas.length - llenos }
  }
  return salida
}

/** EL DATASET COMPLETO: las filas, su cobertura y los huecos declarados. PURA. */
export function dataset(hallazgos = [], { indice = new Map() } = {}) {
  const filas = hallazgos.map((h) => normalizar(h, { indice }))
  return { campos: CAMPOS, total: filas.length, cobertura: cobertura(filas), filas, huecos: huecosDelDataset(filas) }
}
