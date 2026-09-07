// EL PODADOR — APLICA EL CONTRATO DE MINIMALISMO A LA GRILLA, ANTES DE ESCRIBIRLA.
//
// ═══ POR QUÉ EXISTE (06/09/2026) ═══
//
// El dueño: «quiero q en el diseño del sheet flujo de fondos respete el minimalismo extremo y no
// tenga aclaraciones ni explicaciones de nada». `auditar-diseno-unificado.mjs` mide ese contrato
// contra el archivo vivo y sabe señalar cada desvío; lo que faltaba era el otro lado del mismo
// criterio: QUITARLO.
//
// La alternativa era perseguir literal por literal adentro de doce generadores. Se probó y no
// escala: los párrafos están partidos en concatenaciones de tres y cuatro pedazos, algunos armados
// con `${}` en tiempo de corrida, y cada uno que se saca a mano deja los otros diez vivos hasta la
// próxima auditoría. Peor: nada impide que mañana entre uno nuevo.
//
// Acá el criterio se aplica UNA vez, con la MISMA definición que lo mide —`esProsa`,
// `numeracionRota`, `encabezadoRoto` de `diseno-unificado.mjs`—, así que no pueden divergir. Un
// generador que empieza a escribir un párrafo nuevo lo pierde en el podador, sin que nadie tenga que
// acordarse.
//
// LO QUE **NO** HACE: no toca la pestaña. Poda la grilla GENERADA, antes de que se fusione con lo
// que hay en el archivo. Es a propósito y es la línea que no se cruza: si podara después de fusionar
// borraría prosa del DUEÑO, y lo que él escribe en su planilla no lo juzga ningún contrato mío.

import { auditarDiseno, esProsa, bloquesDe, TOPE_PROSA, TOPE_SUBTITULO, enAlcance, partesDeTitulo } from './diseno-unificado.mjs'
import { textoVisible } from './patron-pestana.mjs'
import { PESTANAS } from '../scripts/formato-pestanas.mjs'
// EL CENTINELA, IMPORTADO Y NO REDEFINIDO — Y POR QUÉ EL CICLO ES SEGURO.
//
// `preservar-anotaciones` importa este módulo (ahí se enchufa el podador), así que esto cierra un
// ciclo. Es seguro porque `VACIO` sólo se lee ADENTRO de las funciones, que corren mucho después de
// que los dos módulos terminaron de evaluarse; los enlaces de un módulo ES son vivos. La alternativa
// —redeclarar el centinela acá— es exactamente cómo se termina teniendo dos definiciones de lo mismo.
//
// Y ES OBLIGATORIO QUE SEA EL CENTINELA: una cadena vacía en la grilla generada significa «esta
// celda no es mía, conservá lo que hay». Podar a '' dejaría la prosa intacta en la pestaña — el
// podador correría, el auditor seguiría encontrando los mismos párrafos, y nadie entendería por qué.
import { VACIO } from './preservar-anotaciones.mjs'

/**
 * LA LISTA POSITIVA, Y POR QUÉ NO ALCANZA `enAlcance`.
 *
 * `enAlcance` contesta «¿el dueño excluyó esta pestaña?», que es lo correcto para AUDITAR las quince
 * del archivo. Para PODAR no alcanza: el podador se enchufa en el camino de escritura que comparten
 * treinta y cuatro scripts, y por ahí pasan también los espejos `_J_OBREROS`, `_ARCA_RAW` y demás
 * —que no son pestañas de pantalla, son datos de origen— y cualquier hoja auxiliar. Con la lista
 * negativa sola, un espejo entraría al contrato y perdería una celda de dato por parecer un párrafo.
 * Acá se poda SÓLO lo que el contrato mide.
 */
// SE ARMA AL PRIMER USO Y NO AL EVALUAR EL MÓDULO: los imports de acá cierran un ciclo (ver el
// comentario de `VACIO`), y en un ciclo el módulo que se evalúa primero encuentra las constantes del
// otro todavía en su zona muerta. Leerlas adentro de una función corre siempre después.
let DEL_CONTRATO = null

/** ¿Esta pestaña la mide el contrato de diseño? Lista positiva Y decisión del dueño. */
export function sePoda(pestana) {
  DEL_CONTRATO ??= new Set(PESTANAS.map((p) => p.titulo))
  return DEL_CONTRATO.has(String(pestana)) && enAlcance(pestana)
}

/**
 * Recorta la línea de procedencia al tope SIN cortar una palabra al medio.
 *
 * Corta por el separador de la propia línea (` · `) cuando alcanza, porque cada tramo declara una
 * cosa —qué contesta · fuente · corte— y perder un tramo entero es honesto; perder media palabra
 * deja una línea que parece rota.
 *
 * @param {string} texto
 * @param {number} tope
 * @returns {string}
 */
export function recortarProcedencia(texto, tope = TOPE_SUBTITULO) {
  const t = String(texto ?? '').trim()
  if (t.length <= tope) return t
  const tramos = t.split(' · ')
  if (tramos.length > 1) {
    let acum = ''
    for (const tr of tramos) {
      const cand = acum ? `${acum} · ${tr}` : tr
      if (cand.length > tope) break
      acum = cand
    }
    if (acum) return acum
  }
  const corte = t.slice(0, tope)
  const esp = corte.lastIndexOf(' ')
  return (esp > tope * 0.5 ? corte.slice(0, esp) : corte).trim()
}

/**
 * ¿Qué queda de esta celda bajo el contrato? `null` si no hay nada que podar.
 *
 * Tres casos y sólo tres:
 *   · glosa que argumenta  → se queda el NOMBRE del bloque, se va la glosa.
 *   · nombre demasiado largo → se recorta al tope (dejó de nombrar y empezó a describir).
 *   · cualquier otra prosa → se va entera. Una explicación suelta no se recorta: no va.
 *
 * @param {unknown} celda
 * @param {{tope?:number}} opciones
 * @returns {null|string} el reemplazo
 */
export function podarCelda(celda, { tope = TOPE_PROSA } = {}) {
  const p = esProsa(celda, { tope })
  if (!p) return null
  if (p.sobre === 'glosa') return partesDeTitulo(textoVisible(celda))?.nombre ?? ''
  if (p.sobre === 'nombre') return recortarProcedencia(p.texto, tope)
  return VACIO
}

/** Reescribe el número de bloque de un título, respetando que pueda venir en fórmula. */
function renumerar(celda, n) {
  const visible = textoVisible(celda).trim()
  const m = visible.match(/^(\d+)(\s*·\s+)/)
  if (!m) return celda
  const crudo = String(celda ?? '')
  const i = crudo.indexOf(m[0])
  if (i < 0) return `${n}${m[2]}${visible.slice(m[0].length)}`
  return crudo.slice(0, i) + n + m[2] + crudo.slice(i + m[0].length)
}

/**
 * LA GRILLA, PODADA. Núcleo puro: no toca la red ni el archivo.
 *
 * @param {any[][]} filas la grilla que el generador quiere escribir
 * @param {{pestana:string, procedencia?:string, tope?:number}} opciones
 *        `procedencia` es la línea de la fila 2 cuando el generador no la trae: sin ella la pestaña
 *        queda sin declarar de dónde sale, que es su propio desvío.
 * @returns {any[][]} una grilla nueva — la de entrada no se modifica
 */
export function podarProsa(filas = [], { pestana = '', procedencia = '', tope = TOPE_PROSA, encabezado = true } = {}) {
  if (!sePoda(pestana)) return filas
  const out = filas.map((f) => (Array.isArray(f) ? [...f] : f))
  // LAS TRES PRIMERAS FILAS SÓLO SE TOCAN SI LA GRILLA ES LA PESTAÑA ENTERA. Un escritor parcial
  // también arranca en A1 —lo hizo caer el test de «Jornales por Quincena», que escribe UNA fila y
  // vio su celda vacía reemplazada por el nombre de la pestaña—, así que el arranque no alcanza como
  // señal: hace falta que la grilla cubra al menos el encabezado que este contrato define.
  if (!encabezado || out.length < 4) return podarCuerpo(out, tope, 3)

  // ── el encabezado de tres filas ──────────────────────────────────────────────────────────────
  // LA GLOSA DEL TÍTULO NO SE TIRA: BAJA A LA FILA 2. El auditor lo dice con todas las letras —«A1
  // agrega "— EL AÑO ENTERO, OBRA POR OBRA": eso es la línea de procedencia y va en A2»—, y en dos
  // pestañas del archivo (OBRAS y «Cash Flow Mensual») la A2 está vacía justamente porque lo que
  // tenía que declarar estaba arriba. Tirar la glosa dejaría el otro desvío —`sin-procedencia`— en
  // pie, y encima habría perdido el único texto que sabía de dónde sale el cuadro.
  const glosaDelTitulo = (() => {
    const a1 = textoVisible(out[0]?.[0]).trim()
    if (!pestana || !a1) return ''
    const n = (x) => String(x).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
    if (!n(a1).startsWith(n(pestana))) return ''
    return a1.slice(pestana.length).replace(/^\s*[—·:-]\s*/, '').trim()
  })()

  if (out[0] && Array.isArray(out[0])) {
    if (pestana) out[0][0] = pestana
    for (let j = 1; j < out[0].length; j++) out[0][j] = VACIO
  }
  if (out[1] && Array.isArray(out[1])) {
    const a2 = textoVisible(out[1][0]).trim()
    out[1][0] = recortarProcedencia(a2 || procedencia || glosaDelTitulo) || VACIO
    for (let j = 1; j < out[1].length; j++) out[1][j] = VACIO
  }
  if (out[2] && Array.isArray(out[2])) for (let j = 0; j < out[2].length; j++) out[2][j] = VACIO

  podarCuerpo(out, tope, 3)

  // ── la numeración: 1..N sin huecos, después de podar (podar puede borrar un título entero) ───
  //
  // SE CUENTA SOBRE LA GRILLA SIN CENTINELAS, Y ESO NO ES UN DETALLE. `bloquesDe` sólo reconoce un
  // título cuando está SOLO en su fila, y el centinela —' ::VACIO:: '— no es una celda vacía para
  // nadie que mire el texto: con él puesto, ninguna fila parecía tener el título solo y la
  // renumeración no encontraba un solo bloque. Medido el 06/09 en «Recurrentes»: el podador corrió,
  // escribió, y los dos bloques siguieron numerados 2 y 3.
  const vista = out.map((f) => (Array.isArray(f) ? f.map((c) => (c === VACIO ? '' : c)) : f))
  bloquesDe(vista).forEach((b, i) => {
    if (b.n !== i + 1) out[b.fila - 1][0] = renumerar(out[b.fila - 1][0], i + 1)
  })

  return out
}

/** La prosa del cuerpo, de `desde` para abajo. Muta `out` a propósito: ya es una copia. */
function podarCuerpo(out, tope, desde) {
  for (let i = desde; i < out.length; i++) {
    const f = out[i]
    if (!Array.isArray(f)) continue
    for (let j = 0; j < f.length; j++) {
      const r = podarCelda(f[j], { tope })
      if (r !== null) f[j] = r
    }
  }
  return out
}

/** Lo que el contrato todavía le encuentra a una grilla ya podada. Vacío = conforme. */
export const loQueQueda = (filas, pestana) => auditarDiseno(filas, { pestana })
