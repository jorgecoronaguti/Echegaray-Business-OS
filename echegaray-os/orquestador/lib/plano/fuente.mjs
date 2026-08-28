// DE DÓNDE SALIÓ CADA NÚMERO — la taxonomía única del circuito PLANO → COTIZACIÓN.
//
// ═══ POR QUÉ NO ALCANZABA CON `CLASE` DE `computo-constructivo.mjs` ═══
//
// Aquel módulo clasifica cómo se OBTUVO un número (extraído, calculado, inferido, supuesto) y en
// qué se apoya (fórmula, experiencia, inferencia). Es la clasificación correcta para un cómputo
// aislado, donde la entrada ya está sobre la mesa. Acá la entrada NO está sobre la mesa: hay que
// ir a buscarla a un plano, a un pliego, a la Base Maestra o a internet, y esas cuatro cosas no se
// pueden defender igual delante de un cliente. `CALCULADO` no dice si el ancho de la viga lo leyó
// un modelo de una lámina o lo puso alguien de memoria.
//
// Por eso `FUENTE` responde una pregunta distinta —¿en qué documento del mundo está escrito esto?—
// y viaja PEGADA a `CLASE`, no en su lugar. Un mismo número lleva las dos: el volumen de una viga
// es `CALCULADO` (clase) sobre dimensiones `EXTRAIDO_PLANO` (fuente).
//
// ═══ LA REGLA QUE HACE QUE ESTO SIRVA ═══
//
// Un dato sin `evidencia` no puede llevar `EXTRAIDO_PLANO`. Si no se puede citar archivo + lámina +
// el texto literal que lo dice, no se leyó de un plano: se dedujo, y entonces es `INFERIDO`. La
// diferencia parece de matiz y es la que separa una cotización defendible de una inventada.

/** Las diez fuentes posibles de un dato técnico. No se agregan a gusto: cada una implica una forma
 *  distinta de verificarla, y esa forma está escrita en `COMO_SE_VERIFICA`. */
export const FUENTE = Object.freeze({
  EXTRAIDO_PLANO: 'EXTRAIDO_PLANO',
  CALCULADO: 'CALCULADO',
  BASE_MAESTRA: 'BASE_MAESTRA',
  EXPERIENCIA_ECSAS: 'EXPERIENCIA_ECSAS',
  DOCUMENTO_TECNICO: 'DOCUMENTO_TECNICO',
  NORMA: 'NORMA',
  WEB: 'WEB',
  INFERIDO: 'INFERIDO',
  SUPUESTO: 'SUPUESTO',
  FALTA_DATO: 'FALTA_DATO',
})

/** Cómo se verifica cada fuente. Es lo que contesta «¿de dónde salió este número?» sin que el que
 *  pregunta tenga que saber cómo funciona el OS. */
export const COMO_SE_VERIFICA = Object.freeze({
  EXTRAIDO_PLANO: 'abrir el archivo en la lámina y vista citadas y leer el texto literal',
  CALCULADO: 'rehacer la fórmula con las entradas declaradas',
  BASE_MAESTRA: 'public.tarea_tipo + public.analisis vigente',
  EXPERIENCIA_ECSAS: 'public.rendimiento_historico / public.conocimiento_empresa, con su cantidad de casos',
  DOCUMENTO_TECNICO: 'abrir el documento citado en la página indicada',
  NORMA: 'la norma citada, con su número y año',
  WEB: 'la URL citada, con su fecha de consulta',
  INFERIDO: 'seguir el razonamiento declarado desde los datos que sí tienen fuente',
  SUPUESTO: 'no se verifica: lo tiene que definir una persona',
  FALTA_DATO: 'no hay número — el hueco está declarado',
})

/** Las fuentes que NO pueden sostener un número en la cotización cerrada. Un dato con una de éstas
 *  se muestra, pero cuenta como faltante de cobertura. */
export const NO_CONFIRMADAS = Object.freeze([FUENTE.SUPUESTO, FUENTE.FALTA_DATO, FUENTE.INFERIDO])

/** ¿Este dato entra en la parte confirmada del presupuesto? PURA. */
export const esConfirmada = (fuente) => Boolean(fuente) && !NO_CONFIRMADAS.includes(fuente)

/**
 * LA EVIDENCIA DE UN DATO LEÍDO DE UN DOCUMENTO. Sin `textoLiteral` no hay evidencia: citar el
 * archivo y la lámina sin decir QUÉ dice ahí es una referencia, no una prueba, y una referencia no
 * se puede contrastar. Devuelve `null` cuando no alcanza para citar — y el que llama tiene que
 * degradar la fuente, no rellenar el hueco.
 */
export function evidencia({ archivo, archivoId = null, lamina = null, vista = null, textoLiteral, ubicacion = null } = {}) {
  if (!archivo || !textoLiteral) return null
  return Object.freeze({
    archivo: String(archivo),
    archivoId: archivoId ? String(archivoId) : null,
    lamina: lamina ? String(lamina) : null,
    vista: vista ? String(vista) : null,
    textoLiteral: String(textoLiteral).slice(0, 300),
    ubicacion: ubicacion ? String(ubicacion) : null,
  })
}

/**
 * UN DATO CON SU PROCEDENCIA. Es el sobre en el que viaja todo lo que este circuito produce.
 *
 * La regla dura está acá y en un solo lugar: pedir `EXTRAIDO_PLANO` o `DOCUMENTO_TECNICO` sin
 * evidencia NO devuelve el dato con la fuente pedida — lo devuelve degradado a `INFERIDO` y con el
 * motivo escrito. Así una lectura floja del modelo no puede disfrazarse de lectura del plano
 * simplemente declarándose tal: la degradación la aplica el código, no la buena voluntad.
 */
export function dato({ valor, unidad = null, fuente, evidencia: ev = null, formula = null, entradas = null, nota = null } = {}) {
  const pideEvidencia = fuente === FUENTE.EXTRAIDO_PLANO || fuente === FUENTE.DOCUMENTO_TECNICO
  const degradado = pideEvidencia && !ev
  return Object.freeze({
    valor: valor ?? null,
    unidad,
    fuente: degradado ? FUENTE.INFERIDO : fuente,
    evidencia: ev,
    formula,
    entradas,
    nota: degradado ? `se declaró ${fuente} pero no vino con evidencia citable — degradado a INFERIDO` : nota,
  })
}

/** El hueco declarado. No es cero y no es un supuesto: es una pregunta abierta con dueño. */
export function faltaDato({ que, porque, quienLoTiene = 'proyecto / dirección técnica', unidad = null } = {}) {
  return Object.freeze({
    valor: null, unidad, fuente: FUENTE.FALTA_DATO, evidencia: null, formula: null, entradas: null,
    que: String(que ?? 'dato sin nombre'), porque: String(porque ?? 'no se encontró en la documentación disponible'),
    quienLoTiene: String(quienLoTiene),
  })
}

/** ¿Es un hueco declarado? PURA. */
export const esFalta = (d) => d?.fuente === FUENTE.FALTA_DATO

/**
 * LA GENEALOGÍA DE UN NÚMERO, en castellano y en una sola línea por eslabón.
 *
 * Existe para contestar «¿de dónde salió esto?» sin que nadie tenga que leer JSON. Recorre la
 * cadena PLANO → ELEMENTO → CÓMPUTO → PARTIDA → RECURSO → PRECIO tal como quedó armada, sin
 * reconstruir nada: si un eslabón no está, se dice que no está.
 */
export function genealogia(cadena = []) {
  return cadena.filter(Boolean).map((paso, i) => {
    const ev = paso.evidencia
    const cita = ev ? `${ev.archivo}${ev.lamina ? ` · lámina ${ev.lamina}` : ''}${ev.vista ? ` · ${ev.vista}` : ''} → «${ev.textoLiteral}»` : null
    const como = paso.formula ? `${paso.formula}${paso.entradas ? ` con ${JSON.stringify(paso.entradas)}` : ''}` : null
    return `${i + 1}. ${paso.etapa ?? 'paso'}: ${paso.que ?? ''}${paso.valor != null ? ` = ${paso.valor}${paso.unidad ? ` ${paso.unidad}` : ''}` : ''} [${paso.fuente}] ${cita ?? como ?? COMO_SE_VERIFICA[paso.fuente] ?? ''}`.trim()
  })
}

/**
 * ¿ESTE TEXTO RESPALDA ESTE NÚMERO? PURA.
 *
 * ═══ POR QUÉ EXISTE, Y QUÉ DESTAPÓ ═══
 *
 * `evidencia()` ya exigía un `textoLiteral`, y con eso alcanzaba para creer que un número estaba
 * leído del plano. No alcanzaba: la cita puede existir y NO CONTENER el número. Medido sobre las
 * interpretaciones cacheadas reales de Quattropani, 7 dimensiones tenían fuente `EXTRAIDO_PLANO` y
 * un texto literal donde su número no aparece. La peor: `PLATEA area_m2 = 191,92` citando
 * «01 Platea s/Calculo | s/Cálculo» — o sea, el plano declara que el dato NO está, y los 191,92
 * salieron de otro lado. Es la partida más cara de la obra.
 *
 * Se prueban las escrituras en que un plano escribe el mismo número —«3.5», «3,5», «3.50», «350»—
 * y también sus múltiplos por 100 y por 1000, porque una cota en centímetros o milímetros respalda
 * igual una dimensión en metros. Lo que NO se acepta es una conversión que el texto no muestra:
 * «1"» no respalda `0,0254`, y esa dimensión es INFERIDA, no leída.
 */
export function respalda(valor, textoLiteral) {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return false
  const t = String(textoLiteral ?? '')
  if (!t) return false
  const n = Number(valor)
  for (const v of [n, n * 100, n * 1000]) {
    for (const d of [0, 1, 2, 3]) {
      const x = Number(v).toFixed(d)
      for (const c of [x, x.replace('.', ','), String(Number(x)), String(Number(x)).replace('.', ',')]) {
        if (c && t.includes(c)) return true
      }
    }
  }
  return false
}

/**
 * UNA DIMENSIÓN LEÍDA DEL PLANO, con la regla de arriba aplicada. PURA.
 *
 * Es `dato()` con una condición más: si el número no está en la cita, la fuente NO puede ser
 * `EXTRAIDO_PLANO`. Sale `INFERIDO` con el motivo escrito, que es exactamente lo que dice el
 * encabezado de este archivo desde el primer día — «si no se puede citar el texto literal que lo
 * dice, no se leyó de un plano: se dedujo». Lo que faltaba era comprobarlo.
 */
export function dimension({ valor, unidad = null, evidencia: ev = null, formula = null, entradas = null } = {}) {
  if (valor === null || valor === undefined) return null
  const cita = ev?.textoLiteral ?? null
  if (respalda(valor, cita)) return dato({ valor, unidad, fuente: FUENTE.EXTRAIDO_PLANO, evidencia: ev, formula, entradas })
  return dato({
    valor, unidad, fuente: FUENTE.INFERIDO, evidencia: ev, formula, entradas,
    nota: cita
      ? `el número ${valor} NO aparece en la cita «${String(cita).slice(0, 120)}»: se dedujo de otra cosa, no se leyó del plano`
      : 'no hay texto literal que sostenga esta dimensión',
  })
}

/**
 * ¿ESTO ES UN NÚMERO DE VERDAD? PURA.
 *
 * `Number(null)` es 0, `Number('')` es 0, y `Number.isFinite` dice que sí a los dos. Preguntar sólo
 * por `isFinite` convierte un dato AUSENTE en un cero MEDIDO — y en este circuito eso ya vació las
 * horas de una cuadrilla, infló el contador de elementos computados, y llegó a fabricar cinco
 * tareas de obra con cantidad 0 acompañadas de su fórmula, o sea un cero que se lee como medición.
 *
 * Vive acá, con la taxonomía de procedencia, porque la usan `computo`, `procesos` y `pipeline`, y
 * es el módulo que los tres ya importan sin crear un ciclo.
 */
export const tieneNumero = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
