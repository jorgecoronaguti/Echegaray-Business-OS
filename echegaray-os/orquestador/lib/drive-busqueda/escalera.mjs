// LA ESCALERA — los cinco peldaños de la búsqueda, definidos UNA vez para las dos caras.
//
// El chat (`buscar.mjs`) tiene el índice entero en memoria y baja la escalera con funciones puras.
// La pantalla `/documentos` de la web no puede: necesita el `count` exacto, la paginación y los
// otros filtros (categoría, carpeta, vencimiento, entidad) resueltos en Postgres, y lee con
// supabase-js, que no ejecuta SQL arbitrario. Hasta el 12/09/2026 eso se resolvió con una búsqueda
// propia —`name ilike '%frase entera%'`— y ahí estaba el defecto: "dni de capelli" no es una
// subcadena de "DNI - Capelli.pdf", así que la web contestaba que no existía un archivo que el chat
// encontraba. Medido con `orquestador/scripts/documentos-busqueda-baseline.mjs`: 2 de 30 la web,
// 21 de 30 el chat, sobre el MISMO data room.
//
// Por eso cada peldaño se declara acá DOS VECES Y JUNTAS: `enMemoria` para el chat y `sql` para la
// web. No son dos búsquedas parecidas; son la misma, y el archivo donde viven obliga a que quien
// cambie una vea la otra. Lo único que no se duplica —y es lo que importa— es el TOKENIZADOR:
// `normalizar.mjs` es el único que parte un texto en palabras, lo usa el indexador para escribir
// `drive_index.tokens`, lo usa el chat sobre lo que la persona escribió y lo usa la web. Un segundo
// tokenizador (un `to_tsquery('spanish')`, por ejemplo) stemmearía distinto que `singular()` y no
// conocería el diccionario de sinónimos de la empresa: el índice y la consulta volverían a hablar
// idiomas distintos, que es exactamente el problema que este módulo existe para no tener.
//
// ── LOS PELDAÑOS, DE LO MÁS ESTRICTO A LO MÁS LAXO ───────────────────────────────────────
//   1. exacta            el nombre ES lo pedido (con su extensión)
//   2. normalizada       ídem, ya sin acentos, barras, puntos ni plurales
//   3. parcial           el nombre CONTIENE la frase        ("vision" → "Vision / Tracción")
//   4. todos_los_tokens  están TODAS las palabras pedidas   ("dni capelli")
//   5. alguna_palabra    está AL MENOS UNA                  (último recurso)
//
// ── LAS DOS ASIMETRÍAS, DECLARADAS ───────────────────────────────────────────────────────
// No se esconden en un comentario optimista: son las dos únicas cosas en las que el peldaño de la
// web no puede ser idéntico al del chat, y ninguna cambia QUÉ archivo se encuentra.
//
//   · El peldaño 1 compara el nombre CON extensión, y en Postgres no existe esa columna
//     (`nombre_norm` se guarda sin extensión). En la web el peldaño 1 no se intenta: el mismo
//     archivo lo encuentra el 2 con la frase cruda. Cambia la etiqueta de la etapa, no el
//     resultado.
//   · El peldaño 2 del chat además acepta "el nombre tiene EXACTAMENTE estas palabras, en
//     cualquier orden", y eso en PostgREST no se expresa (haría falta comparar largo de arreglo).
//     El archivo cae igual en el peldaño 3 o 4.
//
// Que la equivalencia valga no es una afirmación: el script de baseline compara, consulta por
// consulta, el top 5 del chat contra el top 5 de la web sobre el índice real.

import { plano, sinExtension, tokenizar, tipoPedido, tokensDeArchivo } from './normalizar.mjs'

/**
 * Lo que la persona escribió, convertido en lo que se va a buscar.
 *
 * Vive acá —y no en `buscar.mjs`— porque la web necesita exactamente este objeto para armar sus
 * filtros: si cada cara analizara la consulta a su manera, los peldaños recibirían entradas
 * distintas y la escalera compartida no serviría de nada.
 *
 * @param {string} texto
 * @param {{tipo?: string|null}} [opciones]
 */
export function analizarConsulta(texto, { tipo = null } = {}) {
  const tokens = tokenizar(texto)
  return {
    original: String(texto ?? ''),
    frase: tokens.join(' '),
    fraseCruda: plano(sinExtension(texto)),
    tokens,
    tipo: tipo && tipo !== 'cualquiera' ? tipo : tipoPedido(texto),
    norm: tokens.join(' '),
  }
}

const nombrePlano = (e) => plano(sinExtension(e.name))

/**
 * Los tokens de una fila del índice.
 *
 * `drive_index.tokens` ya los tiene —los escribió el indexador con esta misma función— y cuando
 * vienen en la fila se usan tal cual. Si la columna no se pidió (el chat no la trae) se calculan al
 * vuelo: el resultado es el mismo porque es la misma función, y por eso el peldaño 4 de la web y el
 * del chat comparan contra el mismo conjunto.
 */
export const tokensDe = (e) => (Array.isArray(e?.tokens) && e.tokens.length ? e.tokens : tokensDeArchivo(e))

/** Las frases con las que se prueba un peldaño: como la escribió la persona, y ya tokenizada.
 *  "vision traccion" y "vision/traccion" tienen que llegar al mismo lado. */
export const variantesDeFrase = (consulta) =>
  Array.from(new Set([consulta.fraseCruda, consulta.frase].filter(Boolean)))

/**
 * Un grupo de alternativas para Postgres: adentro del grupo se unen con OR, y los grupos entre sí
 * con AND. Son DATOS, no SQL ni sintaxis de PostgREST: el transporte lo arma quien consulta (ver
 * `src/features/documentos/services/busquedaLexica.ts`), y así esta lib no sabe de HTTP.
 *
 * Los valores no se escapan ni hace falta: salen de `plano()`, que deja sólo `[a-z0-9ñ ]`. El
 * tokenizador es, además, el saneador — y hay un test que lo fija.
 *
 * @typedef {{campo: 'nombre_norm'|'path_norm'|'tokens', op: 'eq'|'ilike'|'contiene'|'alguno', valor: string|string[]}} Alternativa
 */

export const ESCALERA = Object.freeze([
  {
    nombre: 'exacta',
    enMemoria: (filas, { frase }) => filas.filter((e) => plano(e.name) === frase),
    // Sin columna con la extensión, este peldaño no existe del lado de Postgres (ver cabecera).
    sql: () => null,
  },
  {
    nombre: 'normalizada',
    enMemoria: (filas, { frase, tokens }) => filas.filter((e) => {
      if (nombrePlano(e) === frase) return true
      const tn = tokenizar(e.name)
      return tokens.length > 0 && tn.length === tokens.length && tokens.every((t) => tn.includes(t))
    }),
    sql: (c) => {
      const v = variantesDeFrase(c)
      return v.length ? [v.map((f) => ({ campo: 'nombre_norm', op: 'eq', valor: f }))] : null
    },
  },
  {
    nombre: 'parcial',
    enMemoria: (filas, { frase }) => (frase ? filas.filter((e) => nombrePlano(e).includes(frase)) : []),
    sql: (c) => {
      const v = variantesDeFrase(c)
      return v.length ? [v.map((f) => ({ campo: 'nombre_norm', op: 'ilike', valor: f }))] : null
    },
  },
  {
    // ═══ EL PELDAÑO QUE LA WEB NO TENÍA, Y EL QUE RESUELVE 19 DE LAS 30 ═══
    //
    // "dni de capelli" pide dos palabras que están las dos —una en el nombre, otra también— pero
    // nunca pegadas y nunca en ese orden. Buscar la frase entera como subcadena no puede encontrar
    // eso: hay que buscar CADA palabra.
    //
    // La comparación es entre CONJUNTOS CANÓNICOS, no entre texto: los tokens de la consulta ya
    // pasaron por el diccionario de sinónimos y por el singular, y los del archivo también. Por eso
    // "recibos de sueldo" encuentra lo que está guardado como jornales, y por eso en Postgres esto
    // es un `@>` sobre `drive_index.tokens`, que tiene índice GIN desde la migración del 21/08.
    nombre: 'todos_los_tokens',
    enMemoria: (filas, { tokens }) => (tokens.length
      ? filas.filter((e) => { const s = tokensDe(e); return tokens.every((t) => s.includes(t)) })
      : []),
    sql: (c) => (c.tokens.length ? [[{ campo: 'tokens', op: 'contiene', valor: c.tokens }]] : null),
  },
  {
    nombre: 'alguna_palabra',
    enMemoria: (filas, { tokens }) => (tokens.length
      ? filas.filter((e) => { const s = tokensDe(e); return tokens.some((t) => s.includes(t)) })
      : []),
    sql: (c) => (c.tokens.length ? [[{ campo: 'tokens', op: 'alguno', valor: c.tokens }]] : null),
  },
])

/** Los peldaños que esta consulta puede intentar contra Postgres, en orden y ya resueltos a datos.
 *  El que no aplica no aparece: quien consulta recorre la lista y para en el primero que traiga
 *  filas, igual que el chat. */
export function peldanosSql(consulta) {
  const salida = []
  for (const p of ESCALERA) {
    const grupos = p.sql(consulta)
    if (grupos?.length) salida.push({ nombre: p.nombre, grupos })
  }
  return salida
}
