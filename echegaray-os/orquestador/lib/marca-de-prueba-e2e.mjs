// LO QUE UN TEST DE NAVEGADOR CREA EN LOS MAESTROS TIENE QUE LLAMARSE ASÍ, Y NO DE OTRA FORMA.
//
// ═══ EL HECHO ═══
//
// El 22/08/2026, en la base productiva: cuatro proveedores «QA NO DEBE ENTRAR <epoch>» y dos
// personas «e2e-hh-<epoch>». Ninguno de esos dos nombres arranca con la marca que las limpiezas de
// los propios specs barren (`delete … like 'ZZ-E2E%'`). No es casualidad: un residuo sólo se barre
// si se llama como el barrido espera, y ahí es donde se cuela.
//
// ═══ LA REGLA ═══
//
// Toda escritura de un spec a un MAESTRO —proveedores, personas, clientes, obra_canonica,
// cuadrilla— tiene que nombrar la fila con una expresión cuya raíz sea un literal que empiece con
// `ZZ`. Dos razones, las dos prácticas:
//
//   · una sola marca hace que UNA consulta encuentre todo el residuo de todas las suites;
//   · `ZZ` ordena último en cualquier listado alfabético, así que si algo se escapa cae al final y
//     no en el medio del maestro real.
//
// Esto NO reemplaza a la limpieza: la marca es lo que hace que la limpieza sea posible. Un test
// negativo —que espera un 4xx y por eso no planea limpiar nada— es exactamente el caso donde la
// marca es lo único que queda.
//
// Se verifica leyendo los archivos, no corriendo el navegador: la regla es del código fuente, y una
// comprobación que necesitara Playwright no correría nunca en `npm run orq:test`.

/** La marca. `ZZ` a secas: cubre `ZZ-E2E`, `ZZ-EMPLEADO`, `ZZ-QA-JEFE` y `ZZE2E-ALTA`, que son las
 *  cuatro variantes que ya usaban los specs sin haberse puesto de acuerdo. */
export const MARCA = 'ZZ'

/** Los maestros: las tablas que se ven como catálogo en una pantalla del producto. Una fila de
 *  prueba acá la ve el dueño; una en `obra_ejecucion` no la ve nadie. */
export const MAESTROS = ['proveedores', 'personas', 'clientes', 'obra_canonica', 'cuadrilla']

// Las columnas que son EL NOMBRE de la fila — el texto con el que aparece en el listado y el único
// por el que una limpieza la puede encontrar. `jefe_obra` NO está: es el nombre de OTRA persona
// escrito adentro de la obra, no el nombre de la fila, y exigirle la marca daría rojo por un dato
// que no genera residuo.
const COLUMNAS_NOMBRE = ['nombre', 'nombre_completo', 'razon_social']

/**
 * LAS DECLARACIONES DE TEXTO DEL ARCHIVO: `const X = 'lit'` o `const X = \`lit${…}\``.
 *
 * Se queda con el ARRANQUE literal, que es lo único que importa para la marca: de
 * `` `${MARCA} Cliente ${Date.now()}` `` guarda `${MARCA} Cliente `, y de `'ZZ-E2E'` guarda `ZZ-E2E`.
 */
export function declaracionesDe(fuente) {
  const mapa = new Map()
  // Dos formas, porque las dos aparecen: `const MARCA = 'ZZ-E2E'` y el alias `const MARCA =
  // MARCA_PRUEBA`. Sin la segunda, unificar la marca en un solo archivo —que es lo correcto— dejaba
  // a este resolvedor sin poder seguirla, y la regla daba rojo en tres specs que la cumplen.
  const literal = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(['"`])([\s\S]*?)\2/g
  for (const m of fuente.matchAll(literal)) mapa.set(m[1], m[3])
  // El `(?![\w$(])` es lo que separa un alias de una llamada: `= otra` es un alias, `= otra(…)` no.
  const alias = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*([A-Za-z_$][\w$]*)(?![\w$([.])/g
  for (const m of fuente.matchAll(alias)) if (!mapa.has(m[1])) mapa.set(m[1], m[2])
  return mapa
}

/**
 * A QUÉ LITERAL SE REDUCE UNA EXPRESIÓN DE NOMBRE.
 *
 * `${MARCA} Peón Segundo` → se sigue `MARCA` en las declaraciones y se vuelve a intentar. Tres
 * saltos como techo: más que eso es una cadena que nadie va a poder leer, y devolver `null` —«no sé
 * de dónde sale este nombre»— es más honesto que adivinar.
 */
export function raizLiteral(expr, declaraciones, saltos = 3) {
  if (typeof expr !== 'string') return null
  const texto = expr.trim()
  const refInicial = /^\$\{\s*([A-Za-z_$][\w$]*)\s*\}/.exec(texto)
  if (refInicial) {
    if (saltos <= 0) return null
    const valor = declaraciones.get(refInicial[1])
    return valor === undefined ? null : raizLiteral(valor, declaraciones, saltos - 1)
  }
  const soloRef = /^([A-Za-z_$][\w$]*)$/.exec(texto)
  if (soloRef) {
    if (saltos <= 0) return null
    const valor = declaraciones.get(soloRef[1])
    return valor === undefined ? null : raizLiteral(valor, declaraciones, saltos - 1)
  }
  return texto
}

/** ¿La raíz de este nombre lleva la marca? */
export function llevaLaMarca(expr, declaraciones) {
  const raiz = raizLiteral(expr, declaraciones)
  return raiz !== null && raiz.startsWith(MARCA)
}

/**
 * LAS ESCRITURAS A MAESTROS DE UN ARCHIVO, con la expresión con la que nombran cada fila.
 *
 * Cubre las dos formas que usan los specs: el cliente de Supabase
 * (`.from('proveedores').insert({ nombre: … })`) y PostgREST a mano
 * (`fetch(\`${URL}/rest/v1/proveedores\`, { method: 'POST', body: JSON.stringify({ nombre: … }) })`),
 * que es justamente la que dejó los cuatro «QA NO DEBE ENTRAR».
 */
export function escriturasAMaestros(fuente) {
  const salidas = []
  const tablas = MAESTROS.join('|')
  const porCliente = new RegExp(`from\\(\\s*['"\`](${tablas})['"\`]\\s*\\)\\s*\\n?\\s*\\.(?:insert|upsert)\\s*\\(`, 'g')
  const porRest = new RegExp(`rest/v1/(${tablas})\\b`, 'g')
  for (const [re, esRest] of [[porCliente, false], [porRest, true]]) {
    for (const m of fuente.matchAll(re)) {
      // EL ARGUMENTO, NO «LOS SIGUIENTES 600 CARACTERES». Una ventana fija se comía el código de
      // abajo: un `\`no pude resolver el nombre: \${e.message}\`` a diez renglones del insert
      // aparecía como una escritura con el nombre «$». Un falso positivo enseña a ignorar la regla.
      // En la forma PostgREST el nombre de la tabla va DENTRO de la URL, o sea después del `fetch(`
      // que abre la llamada: hay que buscar el paréntesis hacia atrás, no hacia adelante.
      const fetchPos = esRest ? fuente.lastIndexOf('fetch(', m.index) : -1
      const desde = esRest
        ? (fetchPos < 0 ? -1 : fetchPos + 'fetch'.length)
        : fuente.indexOf('(', m.index + m[0].length - 1)
      const argumento = hastaCerrar(fuente, desde)
      if (argumento === null) continue
      if (esRest && !/method:\s*['"]POST['"]/.test(argumento)) continue
      for (const col of COLUMNAS_NOMBRE) {
        const val = new RegExp(`(?<![\\w$])${col}\\s*:\\s*(?:\`([^\`]*)\`|'([^']*)'|"([^"]*)"|([A-Za-z_$][\\w$]*))`, 'g')
        for (const v of argumento.matchAll(val)) {
          salidas.push({
            tabla: m[1],
            columna: col,
            expresion: v[1] ?? v[2] ?? v[3] ?? v[4],
            linea: fuente.slice(0, desde + v.index).split('\n').length,
          })
        }
      }
    }
  }
  return salidas
}

/** El texto entre `(` y su paréntesis de cierre, contando anidados. `null` si nunca cierra. */
function hastaCerrar(fuente, desde) {
  if (desde < 0 || fuente[desde] !== '(') return null
  let nivel = 0
  for (let i = desde; i < fuente.length; i += 1) {
    if (fuente[i] === '(') nivel += 1
    else if (fuente[i] === ')') {
      nivel -= 1
      if (nivel === 0) return fuente.slice(desde, i + 1)
    }
  }
  return null
}

/** Los archivos de los que este importa, en forma relativa (`./util/obras-e2e`). */
export function importacionesDe(fuente) {
  return [...fuente.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1])
}

/**
 * Los incumplimientos de un archivo. Vacío = cumple.
 *
 * `heredadas` son las declaraciones de los archivos que éste importa: casi ningún spec declara su
 * propia `MARCA`, la trae de `./util/…`. Sin seguirla, todo `${MARCA} algo` se resolvía a null y la
 * regla daba rojo en siete specs que la cumplen.
 */
export function auditarFuente(fuente, archivo = '<fuente>', heredadas = new Map()) {
  const declaraciones = new Map([...heredadas, ...declaracionesDe(fuente)])
  return escriturasAMaestros(fuente)
    .filter((e) => !llevaLaMarca(e.expresion, declaraciones))
    .map((e) => ({
      ...e,
      archivo,
      raiz: raizLiteral(e.expresion, declaraciones),
      queja: `${archivo}:${e.linea} escribe en \`${e.tabla}\` con ${e.columna} = «${e.expresion}», `
        + `que no arranca con «${MARCA}». Un residuo que no lleva la marca no lo barre ninguna `
        + 'limpieza y termina en el maestro real, a la vista del dueño.',
    }))
}
