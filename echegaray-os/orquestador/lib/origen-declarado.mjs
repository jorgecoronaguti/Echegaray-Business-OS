// DÓNDE VIVE LA DECLARACIÓN DE ORIGEN CUANDO EL SHEET YA NO PUEDE ALOJARLA.
//
// ═══ EL DEFECTO, MEDIDO EL 06/09/2026 ═══
//
// `censo-numeros-pegados.mjs` decide si un número pegado es una violación o un dato de origen
// legítimo leyendo una LEYENDA que el generador escribe en una celda visible (`RE_ORIGEN` sobre el
// valor de la celda). En Cargas Sociales esa leyenda vivía en la columna O:
//
//     G.mensual(p.nombre, …, `Réplica del plan cargado en Compras · ${p.n} cuota(s) · …`)
//
// El 05/09 el dueño ordenó «minimalismo extremo y no tenga aclaraciones ni explicaciones de nada», y
// `cargas-sociales-pestana.mjs:347` pasó a llamar `vaciarColumnaDeProsa(gridFinal, ANCHO - 1)`, que
// escribe el centinela VACIO en toda la columna O. Leído del archivo vivo: `Cargas Sociales!O1:O90`
// no tiene una sola celda con texto.
//
// Resultado: el censo informa 15 violaciones en B81:K83 —las cuotas de tres planes de pago que son
// una réplica de lo cargado en Compras y espejado en Supabase, y que el propio generador documenta
// como réplica— porque la leyenda que las amparaba dejó de existir.
//
// LOS DOS MECANISMOS SON INCOMPATIBLES, y no por un descuido: uno pide que la procedencia esté
// escrita en la pestaña y el otro prohíbe que haya nada escrito en la pestaña que no sea el dato.
// Mientras convivan, el censo miente hacia el lado peor: cuenta como defecto lo que está bien, y el
// que mira el número deja de creerle a los que sí son defectos.
//
// ═══ POR QUÉ NO SE RESUELVE DENTRO DEL SHEET ═══
//
//   · NOTA DE CELDA. Descartada con evidencia del propio repositorio: `borrarNotas`
//     (lib/nota-celda.mjs) borra las notas de A..colOrigen en cada corrida de los tres generadores
//     que la usan, así que una declaración puesta ahí no sobrevive a la corrida siguiente. Y el
//     dueño ya la había rechazado antes por su cuenta: «quitá las notas, son confusas».
//   · METADATO DE RANGO (developerMetadata). Invisible de verdad, pero no se puede revisar en un
//     diff, no queda en git, y obliga a ESCRIBIR en el Sheet para declarar algo que el repositorio
//     ya sabe. Una declaración que sólo existe en el archivo vivo se pierde el día que el generador
//     rehace el bloque, y nadie se entera.
//
// ═══ DÓNDE VIVE, ENTONCES ═══
//
// En el repositorio, al lado de la pestaña que ampara (`PESTANAS` en `scripts/formato-pestanas.mjs`),
// que es donde ya se declaraba el único origen por columna que existía (`CAJA`, columna C). Es
// versionado, se lee en el diff, y el día que alguien quiera ampliar el amparo tiene que discutir
// con un texto y no con un silencio.
//
// ═══ LA PARTE QUE HACE QUE ESTO SIGA SIENDO UN CONTROL Y NO UN INTERRUPTOR ═══
//
// Una excepción declarada apaga un aviso. Si además puede apagarlo para siempre y sin que se note,
// deja de ser una excepción y pasa a ser el modo de tapar el problema — es exactamente lo que
// `formato-pestanas.mjs` se negó a hacer con E45:E61 de OBRAS («declararlo acá sería usar la
// excepción para apagar el aviso»).
//
// Por eso el amparo es angosto en las tres dimensiones y se denuncia solo cuando deja de aplicar:
//
//   1 · POR BLOQUE, NO POR PESTAÑA. Ampara el run de filas donde vive el rótulo declarado y nada
//       más. Un número pegado tres filas más abajo, en el bloque siguiente, se sigue contando.
//   2 · POR COLUMNA. Sólo las columnas declaradas. Una cuota que aparezca en la N —la del total,
//       que es fórmula— sigue siendo violación.
//   3 · POR RÓTULO Y NO POR NÚMERO DE FILA. Es la regla del repositorio («filas por RÓTULO en
//       variable, nunca por posición fija»): si el bloque baja cuatro filas porque se agregó un
//       subtítulo, el amparo lo sigue; si en cambio se aplicara a `B81:K83`, amparar
//       silenciosamente lo que caiga ahí mañana.
//   4 · UNA DECLARACIÓN QUE NO ENCUENTRA SU BLOQUE ES UN HALLAZGO, no un no-op. Si el bloque se
//       renombra, se parte o se borra, la declaración queda huérfana y hay que decirlo: si no, la
//       pestaña se queda con un permiso vigente para un bloque que ya no existe, que es la forma
//       exacta en que nace un control que no puede dar rojo.
//
// ═══ EL ORDEN EN QUE HAY QUE HACER EL RESTO, MEDIDO EL 06/09 ═══
//
// Cargas Sociales fue la primera pestaña que perdió su leyenda, no la única que puede perderla. Con
// el censo corriendo sobre el archivo vivo, los números que HOY siguen dependiendo de que la leyenda
// siga escrita en la pestaña son:
//
//   · «Impuestos y Financieros» — 28 números, amparados por `A14` («1 · IVA — LA DDJJ OFICIAL
//     (F.2051)…», que ampara por contener «DDJJ») y por la fila `A20` («DDJJ presentada»). A20 es un
//     rótulo de fila y sobrevive al minimalismo; A14 es un título de sección y basta con que alguien
//     lo acorte sacándole «LA DDJJ OFICIAL» para que los 28 pasen a contarse como violación.
//   · «Proveedores» — 3 números, amparados por `I179` («Conciliación del OS: se encontraron por
//     proveedor + importe…») y `A247` («Del libro de IVA de ARCA, que el OS replica en _ARCA_RAW»).
//     Las dos son prosa que `auditar-diseno-unificado` manda sacar: son parte de los 20 desvíos de
//     prosa que esa pestaña tiene abiertos.
//
// O SEA QUE LOS DOS FRENTES ESTÁN ACOPLADOS Y EL ORDEN NO ES LIBRE. Sacar la prosa primero fabrica
// 31 violaciones falsas en dos pestañas más, que es exactamente lo que ya pasó acá. Primero se migra
// la declaración a `origenPorBloque` —bloque por bloque, mirando qué números ampara cada una— y
// recién después se borra el texto.
//
// NO SE DEJARON DECLARADAS DE ANTEMANO, Y ES DELIBERADO: declarar un bloque sin haber verificado
// celda por celda qué números caen adentro es usar la excepción para apagar el aviso, que es el
// error que este módulo existe para no cometer. Se declara cuando se mide, no antes.
//
// LO QUE ESTE MÓDULO **NO** DECIDE: si un dato es de origen o es un cálculo. Eso lo decide quien
// escribe la declaración, y tiene que poder defenderlo. Acá sólo se resuelve dónde se anota y cómo
// se verifica que la anotación siga hablando de algo que existe.

import { esEstructural } from './respetar-ediciones.mjs'

/** Cómo se compara un rótulo: sin tildes, sin mayúsculas, sin el número de sección, sin la glosa. */
export function normalizarRotulo(texto) {
  // EL ORDEN IMPORTA, Y COSTÓ UN ROJO. Quitar tildes con `\p{Diacritic}` ANTES de cortar el número de
  // sección borra el `·` mismo: U+00B7 (MIDDLE DOT) tiene la propiedad Diacritic en Unicode porque el
  // catalán lo usa como tal. Con el separador ya borrado, el regex de sección no matchea y
  // «7 · Planes de pago» queda como «7 planes de pago» — o sea que el bloque renumerado deja de
  // reconocerse y la declaración se vuelve huérfana sola. Primero se corta la sección, después se
  // despoja de tildes.
  return String(texto ?? '')
    .replace(/^\s*\d+(?:\.\d+)?\s*·\s*/, '')   // «7 · Planes de pago» → «Planes de pago»
    // ═══ EL PERÍODO TAMPOCO IDENTIFICA AL BLOQUE (06/09/2026) ═══
    //
    // Los bloques de «Nómina» se titulan con su período: «1 · QUÉ SE LE PAGA A CADA UNO · QUINCENA
    // 01/09 A 15/09» y «2 · QUÉ SE LE PAGA A OFICINA · MES 09/2026». Una declaración anclada a ese
    // texto quedaría HUÉRFANA en la quincena siguiente —y una huérfana se denuncia como desvío—, o
    // sea que el amparo se apagaría solo cada quince días y el censo empezaría a gritar por catorce
    // números que están bien. Lo mismo con «2 · LO DEVENGADO MES A MES · 2026» de Plantel, que se
    // habría caído sola el 1/1/2027.
    //
    // Es el mismo criterio que la línea de abajo ya aplica al guion largo: lo que va después del
    // separador es glosa. El bloque ES «qué se le paga a cada uno»; la quincena es cuál corrida.
    .split(' · ')[0]
    .split(' — ')[0]                            // la glosa a la derecha del guion largo no identifica
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * El texto que se ve en una celda de la grilla, venga como objeto del censo o como string pelado.
 *
 * ═══ EL `?? celda` QUE DABA UN PERMISO EN BLANCO (06/09/2026) ═══
 *
 * Decía `String(celda?.valor ?? celda ?? '')`. Una celda VACÍA del censo es el objeto
 * `{valor: null, formula: null, numero: null, …}`: `celda?.valor` da `null`, el `??` cae al objeto, y
 * `String({})` es `"[object Object]"` — o sea que TODA fila vacía se leía como fila con contenido.
 * `bloquesDeGrilla` devolvía entonces UN SOLO bloque por pestaña, y con eso cualquier declaración
 * amparaba la pestaña ENTERA en sus columnas: exactamente el «permiso en blanco» que este módulo dice
 * no otorgar.
 *
 * MEDIDO: en «Plantel», declarar los cuadros 2 y 3 amparaba también `D68:G68` —el residuo de un
 * renglón de desvinculación pegado sobre el título de la sección 4— y las diecisiete cuentas de
 * recibos de `G70:G86`, que no son ni una réplica ni un dato de origen de esos cuadros. La única
 * declaración que ya existía, la de «Cargas Sociales», amparaba B:M de la pestaña entera en vez de
 * las tres filas de planes de pago.
 *
 * El `?? celda` estaba para aceptar una grilla de strings pelados (como la usan los tests). Se
 * mantiene esa capacidad, pero preguntando si la celda ES una celda del censo en vez de confiar en
 * que su valor no sea nulo.
 */
const visible = (celda) => {
  const v = celda && typeof celda === 'object' && 'valor' in celda ? celda.valor : celda
  return String(v ?? '').trim()
}

/** ¿La fila está vacía? Es el mismo criterio con que el censo parte la grilla en bloques. */
const vacia = (fila) => !(fila ?? []).some((c) => visible(c))

/**
 * ¿La fila es el TÍTULO DE SECCIÓN o el RENGLÓN DE TOTAL de su cuadro, y por lo tanto no es un dato?
 *
 * Se reusa `esEstructural` —la misma definición que ya decide, para la huella por celda, qué fila no
 * se da nunca por borrada— en vez de escribir acá un segundo criterio: dos definiciones de «esta fila
 * no es un dato» en el mismo archivo es cómo se termina amparando un rango distinto del que se creyó
 * declarar.
 *
 * ═══ Y NO SE USA `esRotuloDeEstructura`, QUE ES LA MÁS ANCHA, POR UN FALSO POSITIVO MEDIDO ═══
 *
 * Aquélla suma `ES_ENCABEZADO`, la lista de primeras palabras con que un cuadro abre su columna A
 * («período», «concepto», «plan», «proveedor»…). Sirve para reconocer la fila de encabezado; acá
 * muerde un dato: `Cargas Sociales!A81` es «Plan F931 W303094 — financiación de junio 2026», el
 * renglón de un plan de pago real, y arranca con «Plan». Con la lista ancha, sus tres cuotas
 * (`I81:K81`, $2.494.875,65 cada una) quedaban fuera del amparo que la pestaña sí declaró. Un
 * encabezado no lleva importes: si los lleva, es un dato.
 */
const esFilaDeEstructura = (fila) => esEstructural(visible((fila ?? [])[0]))

/** ¿Es el TÍTULO de la sección? Un título nunca lleva datos, ni siquiera transcriptos. */
const esTituloDeSeccion = (fila) => /^\s*\d+(\.\d+)?\s*·\s/.test(visible((fila ?? [])[0]))

/**
 * NÚCLEO PURO: parte la grilla en bloques — runs de filas no vacías.
 *
 * Es el MISMO particionado que usa `censar`, y a propósito: dos definiciones de «bloque» conviviendo
 * en el mismo control es cómo se termina amparando un rango distinto del que se creyó declarar.
 *
 * @param {Array<Array<unknown>>} filas
 * @returns {{desde:number, hasta:number}[]} índices 0-based, `hasta` inclusive
 */
export function bloquesDeGrilla(filas = []) {
  const out = []
  for (let a = 0, i = 0; i <= filas.length; i++) {
    if (i === filas.length || vacia(filas[i])) {
      if (i > a) out.push({ desde: a, hasta: i - 1 })
      a = i + 1
    }
  }
  return out
}

/** Índice de columna (0-based) a letra. */
const LETRA = (n) => { let s = ''; for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

/** Letra de columna a índice 0-based. */
export function indiceDeColumna(letra) {
  const s = String(letra ?? '').trim().toUpperCase()
  if (!/^[A-Z]+$/.test(s)) throw new Error(`indiceDeColumna: "${letra}" no es una columna`)
  return [...s].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1
}

/** `'B:M'` → `['B','C',…,'M']`. Una columna suelta también vale: `'C'` → `['C']`. */
export function expandirColumnas(spec) {
  const s = String(spec ?? '').trim().toUpperCase()
  if (!s.includes(':')) return [s]
  const [a, b] = s.split(':')
  const [i, j] = [indiceDeColumna(a), indiceDeColumna(b)]
  if (j < i) throw new Error(`expandirColumnas: el rango ${s} está dado vuelta`)
  return Array.from({ length: j - i + 1 }, (_, k) => LETRA(i + k))
}

/**
 * NÚCLEO PURO: qué celdas ampara el registro de orígenes, y qué declaración quedó huérfana.
 *
 * Una declaración es `{ bloque, cols, que }`:
 *   · `bloque` — el rótulo con que el generador titula la sección. Se compara normalizado.
 *   · `cols`   — `'B:M'` o `'C'`. Sin `cols` no ampara nada: una declaración sin columnas es un
 *                permiso en blanco, y un permiso en blanco no se otorga por omisión.
 *   · `que`    — por qué esos números son origen y no cálculo. No se usa para decidir; se usa para
 *                que la próxima persona pueda discutirlo.
 *   · `incluyeTotales` — sólo cuando el renglón `⇒` del bloque TAMBIÉN es transcripto (un bloque que
 *                copia entero un papel externo). Por defecto el amparo se corta ahí.
 *
 * @param {Array<Array<unknown>>} filas la grilla de la pestaña (0-based)
 * @param {{bloque:string, cols:string, que?:string}[]} declaraciones
 * @returns {{amparadas:Set<string>, huerfanas:{bloque:string, motivo:string}[]}}
 */
export function amparoDeOrigen(filas = [], declaraciones = []) {
  const amparadas = new Set()
  const huerfanas = []
  const bloques = bloquesDeGrilla(filas)

  for (const d of declaraciones) {
    const buscado = normalizarRotulo(d?.bloque)
    if (!buscado) { huerfanas.push({ bloque: String(d?.bloque ?? ''), motivo: 'la declaración no dice qué bloque ampara' }); continue }
    if (!String(d?.cols ?? '').trim()) { huerfanas.push({ bloque: String(d?.bloque ?? ''), motivo: 'la declaración no dice qué columnas ampara' }); continue }

    // ═══ EL RÓTULO SE BUSCA EN EL TÍTULO DE SECCIÓN, NO EN CUALQUIER FILA (06/09/2026) ═══
    //
    // El comentario ya decía «es donde el generador escribe el título de sección», y el código
    // miraba la columna A de TODAS las filas del bloque. Medido apenas se declaró el primer bloque
    // de «Impuestos y Financieros»: el rótulo `1 · IVA — LA DDJJ OFICIAL (F.2051)…` se normaliza a
    // «iva» (la glosa a la derecha del guion largo no identifica), y `A33` —una fila de datos del
    // cuadro de retenciones sufridas— dice literalmente «IVA». La declaración de la DDJJ estaba
    // amparando también B:M del cuadro 3, en silencio. Se exige el título: es lo único que nombra
    // un bloque.
    const donde = bloques.filter((b) => {
      for (let i = b.desde; i <= b.hasta; i++) {
        if (esTituloDeSeccion(filas[i]) && normalizarRotulo(visible(filas[i]?.[0])) === buscado) return true
      }
      return false
    })
    if (!donde.length) { huerfanas.push({ bloque: String(d.bloque), motivo: 'ningún bloque de la pestaña lleva ese rótulo' }); continue }
    // DOS BLOQUES CON EL MISMO RÓTULO NO SON UN AMPARO, SON UNA AMBIGÜEDAD. Amparar los dos sería
    // ensanchar el permiso en silencio hasta un bloque que nadie declaró — y una pestaña con dos
    // cuadros que se llaman igual ya es un defecto de por sí. Falla cerrada y se denuncia, igual que
    // la huérfana: no amparar es reversible, amparar de más no se nota.
    if (donde.length > 1) {
      huerfanas.push({ bloque: String(d.bloque), motivo: `${donde.length} bloques de la pestaña llevan ese rótulo: no se puede saber cuál se quiso amparar` })
      continue
    }

    const cols = expandirColumnas(d.cols)
    for (const b of donde) {
      for (let i = b.desde; i <= b.hasta; i++) {
        // LA ESTRUCTURA DEL CUADRO NO ES DATO DE ORIGEN, NUNCA (06/09/2026). El amparo es por bloque,
        // y un bloque incluye su título y su renglón `⇒`: sin este corte, declarar «los doce importes
        // mensuales son una réplica» amparaba de yapa el total de la columna, que es aritmética pura
        // de la propia pestaña. Medido en «Plantel»: la declaración de los cuadros 2 y 3 dejaba el
        // censo en 0 de 285 —incluidas `D24`/`D66`, las filas «⇒ 17 persona(s)», y `D68:G68`, un
        // renglón de desvinculación fósil pegado sobre el título de la sección 4— o sea que la
        // excepción apagaba el aviso en vez de explicarlo, que es lo que este módulo existe para no
        // hacer. Un número pegado en una fila de estructura se sigue contando siempre.
        // ═══ LA EXCEPCIÓN A LA EXCEPCIÓN, Y SE PIDE POR ESCRITO (06/09/2026) ═══
        //
        // Hay un caso donde el renglón `⇒` TAMBIÉN es transcripto: cuando el bloque entero es la copia
        // de un papel externo. `Impuestos y Financieros!B18:H18` es «⇒ IVA a pagar en efectivo» del
        // bloque «1 · IVA — LA DDJJ OFICIAL (F.2051)», y esos siete números son la línea de la DDJJ
        // que se presentó a ARCA, con su fecha y su número de acuse en la fila de abajo. Recalcularla
        // como `MAX(0;B16-B17-…)` sería pisar la declaración jurada con aritmética propia, que es
        // exactamente al revés de la cascada del OS (DDJJ > AJENO > ARCA > proyección).
        //
        // Por eso NO se afloja la regla: se pide decirlo. `incluyeTotales` deja el default seguro y
        // obliga a que la excepción se lea en el diff con su motivo al lado. El TÍTULO de la sección
        // no entra nunca, ni siquiera así: un título no lleva datos.
        if (esTituloDeSeccion(filas[i])) continue
        if (!d.incluyeTotales && esFilaDeEstructura(filas[i])) continue
        for (const c of cols) amparadas.add(`${c}${i + 1}`)
      }
    }
  }
  return { amparadas, huerfanas }
}
