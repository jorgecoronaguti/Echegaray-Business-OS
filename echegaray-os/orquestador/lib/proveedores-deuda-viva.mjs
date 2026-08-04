// LA DEUDA CON PROVEEDORES, VIVA — SIN QUE HAGA FALTA QUE CORRA NADIE.
//
// ═══ EL PEDIDO (31/07), TEXTUAL ═══
//
// "proveedores sigue sin ser una pestaña viva, se siguen cargando compras y la seccion 1 de
// proveedores y deuda no se actualiza. revisa y rehacer, no emparchar, quiero algo q sirva para
// siempre."
//
// ═══ QUÉ ESTABA MAL, Y NO ERA LO QUE PARECÍA ═══
//
// La sospecha razonable era "son números pegados". NO lo eran: los importes de la sección 1 ya salían
// de SUMIFS sobre rangos ABIERTOS de Compras. Lo que estaba muerto era otra cosa, y es peor porque no
// se ve: **la ESTRUCTURA DE FILAS**. Qué proveedores se listan y qué facturas cuelgan de cada uno lo
// decidía el JS del generador leyendo Compras una vez, y lo materializaba como filas físicas con la
// fila de Compras cableada en cada fórmula (`Compras!$X$671`). Entonces:
//
//   · se carga una compra de un proveedor NUEVO  → el titular se mueve, pero NO aparece ninguna fila;
//   · se carga una factura de un proveedor que ya está → su total se mueve, pero no aparece el renglón;
//   · se inserta una fila en Compras → las 40 referencias cableadas apuntan a otra factura, en silencio.
//
// El propio generador lo sabía: escribía un aviso "⚠ Faltan N factura(s)… aparecen cuando corre el
// agente". Un cuadro que necesita que alguien corra un script para decir la verdad no está vivo, y
// encima ese script hoy **no lo dispara nadie**: no existe ninguna entrada suya en `orq.schedules`.
//
// ═══ LA CURA, Y POR QUÉ ES DEFINITIVA ═══
//
// La sección 1 pasa a ser DOS FÓRMULAS. Una sola celda ancla por bloque, y el derrame es la tabla:
// la lista de proveedores sale de UNIQUE/FILTER sobre Compras, los saldos de SUMIFS, el orden de SORT.
// Nadie tiene que correr nada: se carga una compra y la fila aparece en el próximo recálculo del Sheet.
// Y como el generador ya no reescribe esas filas en cada corrida, deja de pelearse con las ediciones
// del dueño — que era el segundo motivo por el que la pestaña no se actualizaba (ver la nota sobre la
// firma en el generador).
//
// ═══ LAS CUATRO REGLAS DE ESTE ARCHIVO ═══
//
// 1. RANGOS ABIERTOS SIEMPRE (`Compras!$O$4:$O`). Un rango que termina en una fila fija se fosiliza y
//    deja de ver lo nuevo — el defecto que ya apareció varias veces en este archivo. Hay un test que
//    falla si alguna referencia a Compras aparece con fila final.
//
// 2. PENDIENTE ES UN ESTADO, NO UNA FECHA. El criterio es `Estado = "Pendiente"`; la fecha de caja se
//    usa para ORDENAR y para el próximo pago, nunca para decidir si algo está pagado. Calcular
//    "pagado" por fecha ya dejó un pendiente en $0 en este mismo archivo.
//
// 3. es_AR: el separador de argumentos es `;`. La coma es el decimal. Y no se usa NINGÚN literal de
//    array `{...}`: su separador de columnas también cambia con el locale (`\` vs `,`) y ya rompió una
//    vez esta pestaña. Se usa HSTACK, que es la misma cosa sin el literal.
//
// 4. EL SALDO ES NETO, Y ES EL MISMO NÚMERO QUE EL TITULAR. Total − Monto Pagado − los positivos de
//    Parcial 1 y Parcial 2 (un valor negativo en esas columnas NO es un pago: es el saldo que falta,
//    regla confirmada por el dueño el 27/07). Y el universo es el mismo del hero: comercial = 1. Antes
//    la fila-cabecera de cada proveedor NO filtraba por comercial y el titular sí — dos definiciones
//    del mismo concepto, que es exactamente lo que hacía que el cuadro no cerrara.
//
// ═══ LO QUE SE PIERDE, DECLARADO ═══
//
// El +/- (la función Agrupar) desaparece: no se puede agrupar filas que no existen hasta que el Sheet
// recalcula. Se cambia colapsar por estar vivo, y a cambio el cuadro gana un bloque POR PROVEEDOR
// (que antes era la fila-cabecera del grupo) y otro FACTURA POR FACTURA, los dos vivos.
//
// Y los COMENTARIOS del dueño ya no pueden vivir al lado de la fila: una fila de derrame se reordena
// sola y una nota escrita a mano al lado no la sigue —se quedaría clavada junto al proveedor
// equivocado, que es el incidente del 30/07 otra vez—. Pasan a una LIBRETA (proveedor → nota) que es
// suya, que ningún generador reescribe, y que la tabla viva lee por nombre de proveedor. Así la nota
// viaja con la entidad de la que habla, por construcción y no por reconstrucción.

/** El separador de argumentos del archivo (locale es_AR). La coma es el decimal: nunca va acá. */
export const SEP = ';'

/** Los rótulos del bloque POR PROVEEDOR. El orden es el contrato con `formulaPorProveedor`. */
export const COLS_PROVEEDOR = ['Proveedor', 'Próximo pago', 'Facturas', 'Saldo pendiente', 'Comentarios']

/** Los rótulos del bloque FACTURA POR FACTURA. Son los que el dueño ya tenía rotulados. */
export const COLS_FACTURA = ['Proveedor', 'Próximo pago', 'Comprobante', 'Importe', 'Obra', 'Tipo de pago', 'Categoría']

/** Los rótulos de la libreta: lo único que el dueño escribe a mano en este bloque. */
export const COLS_LIBRETA = ['Proveedor', 'Comentarios']

/** El estado de Compras que significa "se lo debemos". No es una fecha: es un estado. */
export const PENDIENTE = 'Pendiente'

/**
 * LAS REFERENCIAS A COMPRAS, TODAS ABIERTAS.
 *
 * Se reciben ya resueltas por ENCABEZADO (el dueño edita Compras y corre columnas: ubicar por posición
 * fija es lo que un día dejó la deuda vacía), y se verifican: si alguna llegara acotada a una fila
 * final, se corta acá y no se escribe una fórmula que mañana miente por omisión.
 *
 * @param {Record<string,string>} cols referencias A1 tipo `Compras!$O$4:$O`
 * @returns {Record<string,string>} las mismas, validadas
 */
export function rangosCompras(cols = {}) {
  const faltan = ['prov', 'estado', 'comercial', 'total', 'pagado', 'parcial1', 'parcial2', 'fecha', 'comprobante', 'obra', 'tipoPago', 'categoria']
    .filter((k) => !cols[k])
  if (faltan.length) throw new Error(`rangosCompras: faltan referencias (${faltan.join(', ')})`)
  const cerradas = Object.entries(cols).filter(([, v]) => !esRangoAbierto(v))
  if (cerradas.length) {
    throw new Error(`rangosCompras: hay rangos con fila final, se fosilizan y dejan de ver lo nuevo: `
      + cerradas.map(([k, v]) => `${k}=${v}`).join(' · '))
  }
  return { ...cols }
}

/**
 * ¿Es un rango ABIERTO (`Hoja!$C$4:$C`) y no uno acotado (`Hoja!$C$4:$C$500`)?
 * Un rango con fila final deja de ver las filas nuevas sin dar ningún error.
 */
export function esRangoAbierto(ref = '') {
  return /^[^!]+!\$[A-Z]{1,3}\$\d+:\$[A-Z]{1,3}$/.test(String(ref))
}

/** Las referencias a Compras que aparecen en una fórmula, para poder auditarlas. */
export function referenciasCompras(formula = '') {
  return String(formula).match(/Compras!\$[A-Z]{1,3}\$\d+(?::\$[A-Z]{1,3}(?:\$\d+)?)?/g) ?? []
}

/** Escapa un texto para que entre como literal de cadena en una fórmula. */
const lit = (s) => String(s ?? '').replace(/"/g, '""')

/** El tramo de condiciones que define "deuda comercial pendiente" — la MISMA que suma el titular. */
function condPendiente(R, criterioProv) {
  return [`${R.prov}${SEP}${criterioProv}`, `${R.estado}${SEP}"${PENDIENTE}"`, `${R.comercial}${SEP}1`].join(SEP)
}

/**
 * EL SALDO NETO DE UN PROVEEDOR, como expresión de fórmula.
 *
 * Total − Monto Pagado − los POSITIVOS de Parcial 1 y Parcial 2. El filtro `">0"` es la regla del
 * dueño (27/07): un negativo en esas columnas es el saldo que falta, no un pago, y restarlo infla la
 * deuda al doble.
 *
 * @param {Record<string,string>} R rangos de Compras
 * @param {string} criterioProv el criterio de proveedor (una referencia como `p` o un literal `"X"`)
 */
export function saldoNetoProveedor(R, criterioProv) {
  const c = condPendiente(R, criterioProv)
  return `SUMIFS(${R.total}${SEP}${c})`
    + `-SUMIFS(${R.pagado}${SEP}${c})`
    + `-SUMIFS(${R.parcial1}${SEP}${c}${SEP}${R.parcial1}${SEP}">0")`
    + `-SUMIFS(${R.parcial2}${SEP}${c}${SEP}${R.parcial2}${SEP}">0")`
}

/**
 * EL TITULAR: toda la deuda comercial pendiente. Es el número contra el que se controla el detalle.
 * Misma aritmética que `saldoNetoProveedor`, sin el filtro de proveedor.
 */
export function deudaComercialTotal(R) {
  const c = [`${R.estado}${SEP}"${PENDIENTE}"`, `${R.comercial}${SEP}1`].join(SEP)
  return `SUMIFS(${R.total}${SEP}${c})`
    + `-SUMIFS(${R.pagado}${SEP}${c})`
    + `-SUMIFS(${R.parcial1}${SEP}${c}${SEP}${R.parcial1}${SEP}">0")`
    + `-SUMIFS(${R.parcial2}${SEP}${c}${SEP}${R.parcial2}${SEP}">0")`
}

/** Las declaraciones LET comunes a los dos bloques: cada rango, una sola vez y con nombre. */
function declaraciones(R, claves) {
  return claves.map((k) => `${nombreVar(k)}${SEP}${R[k]}`).join(SEP)
}

const nombreVar = (k) => `r_${k}`

/**
 * UN NOMBRE DE VARIABLE DE `LET` NO PUEDE PARECERSE A UNA REFERENCIA DE CELDA (31/07).
 *
 * El bloque "factura por factura" salió VACÍO en la primera corrida real, y sus tests pasaban. Sheets
 * devolvía `#NAME?` y el `IFERROR` que envuelve la fórmula —puesto para que un archivo recién armado no
 * muestre errores— se lo tragaba entero: cero filas, cero avisos, y el control del bloque cantando
 * "falta $10.335.466" sin decir por qué.
 *
 * La causa: dos variables se llamaban `nPa1` y `nPa2`. `NPA1` ES una referencia válida —columna NPA,
 * fila 1— y Sheets lo comprobó en el archivo: `=ISREF(NPA1)` devuelve TRUE. Un nombre que Sheets puede
 * leer como celda queda rechazado como variable. `nTot` y `nPag` sobrevivieron de casualidad: cuatro
 * letras no forman una columna (el máximo es tres).
 *
 * La forma A1 es "una a tres letras seguidas de dígitos". Cualquier `_` la rompe, y por eso los nombres
 * llevan guión bajo. `esNombreSeguro` existe para que un test lo verifique sin tocar el Sheet: el
 * defecto era invisible en frío y sólo aparecía escribiendo en el archivo real.
 */
export const esNombreSeguro = (n) => !/^[A-Za-z]{1,3}\d+$/.test(String(n ?? ''))

/**
 * BLOQUE 1A — LA DEUDA POR PROVEEDOR, VIVA.
 *
 * Una sola celda. El derrame es la tabla: proveedor · próximo pago · cuántas facturas · saldo neto ·
 * la nota de la libreta. Ordenada por saldo de mayor a menor, y sólo los que tienen saldo > 0 (un
 * proveedor cuyas notas de crédito superan sus facturas pendientes no es una deuda).
 *
 * El universo sale de los DATOS: `UNIQUE(FILTER(proveedor; estado=Pendiente; comercial=1))`. Un
 * proveedor nuevo entra solo, sin que corra nada; uno que se paga desaparece solo.
 *
 * `ARRAY_CONSTRAIN` acota el derrame a las filas reservadas del bloque. NO es un techo de datos: es lo
 * que evita que el día que la lista crezca el Sheet tire `#REF!` y la tabla entera desaparezca. Si
 * llegara a truncar, el control de reconciliación lo grita con el peso exacto que falta.
 *
 * @param {{rangos:object, libreta:string, reserva:number}} opts
 * @returns {string} la fórmula, con `=`
 */
export function formulaPorProveedor({ rangos, libreta, reserva }) {
  const R = rangos
  if (!(reserva > 0)) throw new Error('formulaPorProveedor: la reserva de filas tiene que ser > 0')
  const dec = declaraciones(R, ['prov', 'estado', 'comercial', 'total', 'pagado', 'parcial1', 'parcial2', 'fecha'])
  const V = (k) => nombreVar(k)
  const Rv = { prov: V('prov'), estado: V('estado'), comercial: V('comercial'), total: V('total'), pagado: V('pagado'), parcial1: V('parcial1'), parcial2: V('parcial2'), fecha: V('fecha') }
  const condV = condPendiente(Rv, 'p')
  const saldo = saldoNetoProveedor(Rv, 'p')
  // "sin fecha" en vez de un 0 que se pintaría como 30/12/1899: MINIFS sobre un conjunto sin fechas
  // devuelve 0, y un cero con formato de fecha es un dato falso a la vista.
  const prox = `IF(COUNTIFS(${condV}${SEP}${Rv.fecha}${SEP}">0")=0${SEP}"sin fecha"${SEP}MINIFS(${Rv.fecha}${SEP}${condV}${SEP}${Rv.fecha}${SEP}">0"))`
  const nfac = `COUNTIFS(${condV}${SEP}${Rv.total}${SEP}"<>")`
  const nota = `IFERROR(VLOOKUP(p${SEP}${libreta}${SEP}2${SEP}FALSE)${SEP}"")`
  const cuerpo = [
    dec,
    `provs${SEP}UNIQUE(FILTER(${Rv.prov}${SEP}${Rv.estado}="${PENDIENTE}"${SEP}${Rv.comercial}=1${SEP}${Rv.prov}<>""))`,
    `saldo${SEP}MAP(provs${SEP}LAMBDA(p${SEP}${saldo}))`,
    `prox${SEP}MAP(provs${SEP}LAMBDA(p${SEP}${prox}))`,
    `nfac${SEP}MAP(provs${SEP}LAMBDA(p${SEP}${nfac}))`,
    `nota${SEP}MAP(provs${SEP}LAMBDA(p${SEP}${nota}))`,
    `base${SEP}HSTACK(provs${SEP}prox${SEP}nfac${SEP}saldo${SEP}nota)`,
    `viva${SEP}FILTER(base${SEP}ROUND(saldo${SEP}0)>0)`,
    `ARRAY_CONSTRAIN(SORT(viva${SEP}4${SEP}FALSE)${SEP}${reserva}${SEP}${COLS_PROVEEDOR.length})`,
  ].join(SEP)
  return `=IFERROR(LET(${cuerpo})${SEP}"")`
}

/**
 * BLOQUE 1B — FACTURA POR FACTURA, VIVA, ORDENADA POR FECHA DE PAGO.
 *
 * La pregunta del bloque es "¿qué pago primero?", así que el orden por fecha de pago es la respuesta,
 * no una decisión estética. Cada renglón trae su comprobante y su obra: un saldo sin el documento que
 * lo respalda no se puede ni reclamar ni pagar.
 *
 * Se arma con FILTER sobre un HSTACK de las columnas de Compras: así las siete columnas se filtran y
 * se ordenan JUNTAS, en una sola operación. Antes cada celda era su propia fórmula apuntando a una
 * fila cableada de Compras — y con eso, insertar una fila allá corría todo el cuadro en silencio.
 *
 * @param {{rangos:object, reserva:number}} opts
 * @returns {string} la fórmula, con `=`
 */
export function formulaPorFactura({ rangos, reserva }) {
  const R = rangos
  if (!(reserva > 0)) throw new Error('formulaPorFactura: la reserva de filas tiene que ser > 0')
  const claves = ['prov', 'estado', 'comercial', 'total', 'pagado', 'parcial1', 'parcial2', 'fecha', 'comprobante', 'obra', 'tipoPago', 'categoria']
  const dec = declaraciones(R, claves)
  const V = (k) => nombreVar(k)
  // Cada columna de plata se sanea a número: en Compras hay celdas con texto y celdas vacías, y una
  // resta contra texto devuelve #VALUE! y se lleva la tabla entera.
  const num = (k) => `IF(ISNUMBER(${V(k)})${SEP}${V(k)}${SEP}0)`
  const cuerpo = [
    dec,
    `nTot${SEP}${num('total')}`,
    `nPag${SEP}${num('pagado')}`,
    `n_parcial1${SEP}${num('parcial1')}`,
    `n_parcial2${SEP}${num('parcial2')}`,
    // Mismo saldo neto que el bloque por proveedor, fila por fila: los negativos de los parciales no
    // son pagos, así que se descartan con un IF elementwise en vez de restarse.
    `saldo${SEP}nTot-nPag-IF(n_parcial1>0${SEP}n_parcial1${SEP}0)-IF(n_parcial2>0${SEP}n_parcial2${SEP}0)`,
    // EL CRITERIO ES EL ESTADO. La fecha no decide nada acá: sólo ordena.
    `cond${SEP}(${V('estado')}="${PENDIENTE}")*(${V('comercial')}=1)*(${V('prov')}<>"")`,
    `base${SEP}FILTER(HSTACK(${V('prov')}${SEP}${V('fecha')}${SEP}${V('comprobante')}&""${SEP}saldo${SEP}${V('obra')}&""${SEP}${V('tipoPago')}&""${SEP}${V('categoria')}&"")${SEP}cond)`,
    `ARRAY_CONSTRAIN(SORT(base${SEP}2${SEP}TRUE${SEP}1${SEP}TRUE)${SEP}${reserva}${SEP}${COLS_FACTURA.length})`,
  ].join(SEP)
  // ARRAYFORMULA NO ES DECORACIÓN ACÁ — ES LO QUE HACE QUE EL BLOQUE DEVUELVA ALGO (31/07).
  //
  // Una variable de LET que guarda un RANGO pierde la expansión implícita a array cuando se la usa en
  // aritmética o en una comparación elemento por elemento. Medido en el archivo real: con la fórmula
  // envuelta, `SUMPRODUCT(cond)` da 14 (las filas pendientes) y el bloque derrama 14 renglones; sin
  // envolver, la MISMA expresión da 0 y `saldo` colapsa a un escalar, así que FILTER devuelve #N/A y el
  // IFERROR de afuera lo convierte en una celda vacía. Cero filas, cero avisos.
  //
  // El bloque POR PROVEEDOR no lo necesita, y eso explica por qué uno funcionaba y el otro no: sus
  // variables de rango sólo viajan como ARGUMENTOS de funciones que esperan rangos (SUMIFS, COUNTIFS,
  // MINIFS, el primer argumento de FILTER) o dentro de un MAP/LAMBDA, que ya evalúa por elemento.
  return `=IFERROR(ARRAYFORMULA(LET(${cuerpo}))${SEP}"")`
}

/**
 * EL CONTROL QUE PUEDE FALLAR — y por eso sirve.
 *
 * Compara el TITULAR (deuda comercial pendiente, sobre rangos abiertos) contra la SUMA DE LO QUE EL
 * BLOQUE MUESTRA. Si difieren, algo se está quedando afuera y el peso exacto queda escrito. Cubre las
 * dos formas de fallar: que el derrame se haya truncado contra la reserva, y que el criterio del
 * bloque haya dejado de coincidir con el del titular.
 *
 * El bloque anterior tenía en su lugar un aviso que decía "faltan N facturas… aparecen cuando corre el
 * agente": describía el defecto en vez de exigir que no existiera. Este control tiene que dar $0.
 *
 * ═══ LAS DOS COSAS QUE PUEDE ESTAR DICIENDO, Y HAY QUE NOMBRAR LAS DOS ═══
 *
 * 1. EL DERRAME SE TRUNCÓ contra la reserva de filas: entró más deuda de la que entra en el bloque.
 * 2. HAY DEUDA QUE EL BLOQUE NO PUEDE MOSTRAR: una compra comercial pendiente SIN nombre de proveedor.
 *    El titular la suma (sólo filtra estado y comercial) y los dos bloques la excluyen (los dos se
 *    organizan por proveedor). No es un error del cuadro: es un defecto de carga en Compras que hasta
 *    hoy no lo veía nadie, y el control es el único lugar del archivo donde aparece.
 *
 * Un mensaje que sólo dijera "agrandá el bloque" mandaría a arreglar lo que no está roto.
 *
 * @param {{rangos:object, rangoSaldo:string, que:string}} opts rangoSaldo = la columna de saldo del bloque
 */
export function formulaControl({ rangos, rangoSaldo, que }) {
  const total = deudaComercialTotal(rangos)
  const sinProv = `SUMIFS(${rangos.total}${SEP}${rangos.estado}${SEP}"${PENDIENTE}"${SEP}${rangos.comercial}${SEP}1${SEP}${rangos.prov}${SEP}"")`
  const msg = `"⚠ ${lit(que)} no cierra con el titular: falta "&TEXT(dif${SEP}"$#,##0")&". "`
    + `&IF(ROUND(huerfana${SEP}0)<>0${SEP}"De eso, "&TEXT(huerfana${SEP}"$#,##0")&" es deuda comercial pendiente SIN nombre de proveedor en Compras: ningún bloque organizado por proveedor la puede mostrar, y hay que completarla allá. "${SEP}"")`
    + `&"El resto es deuda que no entra en las filas reservadas del bloque — pedime que lo agrande."`
  return `=LET(dif${SEP}ROUND((${total})-SUM(${rangoSaldo})${SEP}0)${SEP}huerfana${SEP}${sinProv}${SEP}`
    + `IF(dif=0${SEP}"✓ el detalle cierra con el titular al peso"${SEP}${msg}))`
}

/**
 * CUÁNTAS FILAS RESERVARLE A UN DERRAME.
 *
 * Ni justas —el derrame se truncaría en cuanto entre una compra— ni un colchón de treinta filas
 * muertas, que el dueño ya rechazó por escrito ("es completamente inútil"). Un 60% de aire sobre lo
 * que hay hoy, con un piso, y el control de reconciliación avisa si algún día no alcanzó.
 */
export function reservaPara(actual = 0, { minimo = 12, aire = 0.6 } = {}) {
  return Math.max(minimo, Math.ceil(Math.max(0, actual) * (1 + aire)))
}

/**
 * LA LIBRETA: SEMBRAR UNA VEZ, NUNCA REESCRIBIR.
 *
 * Es el único bloque de esta sección que es del dueño. Si ya tiene algo escrito, el generador NO toca
 * ninguna celda de datos (devuelve cadena vacía, que la fusión PRESERVA — no el centinela VACIO, que
 * la borraría). Si está vacía, se siembra con las notas que hoy están ancladas a cada proveedor en la
 * pestaña, para que la migración no pierda ni una.
 *
 * @param {Map<string,string>|Array<[string,string]>} notas proveedor → nota (lo que hay hoy en la pestaña)
 * @param {any[][]} existente filas de datos de la libreta que ya están en la pestaña
 * @returns {{filas:any[][], sembradas:number, motivo:string}}
 */
export function filasLibreta(notas, existente = []) {
  const pares = notas instanceof Map ? [...notas.entries()] : (notas ?? [])
  const yaHay = (existente ?? []).some((f) => String(f?.[0] ?? '').trim() !== '')
  if (yaHay) {
    // Ni una celda: la libreta es suya. Se devuelven tantas filas vacías como haya, para que la grilla
    // cubra el bloque sin escribir nada en él.
    return { filas: (existente ?? []).map(() => ['', '']), sembradas: 0, motivo: 'la libreta ya tiene contenido del dueño: no se toca' }
  }
  const filas = pares.filter(([p]) => String(p ?? '').trim() !== '').map(([p, n]) => [p, n])
  return { filas, sembradas: filas.length, motivo: filas.length ? 'libreta vacía: se siembra con las notas que hoy están en la pestaña' : 'libreta vacía y no hay notas que migrar' }
}

/**
 * NINGUNA NOTA DEL DUEÑO SE PIERDE EN LA MIGRACIÓN — y se verifica antes de escribir, no después.
 *
 * El rediseño de esta sección BORRA las filas materializadas donde hoy están los comentarios. Si la
 * libreta no los contiene a todos, la corrida se corta: reescribir el bloque perdiendo una nota es
 * exactamente lo que ya pasó en este archivo más de una vez.
 *
 * @param {Map<string,string>|Array<[string,string]>} notas lo que hay hoy anclado a cada proveedor
 * @param {any[][]} filas lo que la libreta va a tener (sembrado o preexistente)
 * @returns {{ok:boolean, perdidas:string[]}}
 */
export function verificarMigracionNotas(notas, filas = []) {
  const pares = notas instanceof Map ? [...notas.entries()] : (notas ?? [])
  const norm = (s) => String(s ?? '').trim().toLowerCase()
  const enLibreta = new Set((filas ?? []).map((f) => norm(f?.[0])).filter(Boolean))
  const perdidas = pares.filter(([p]) => norm(p) && !enLibreta.has(norm(p))).map(([p, n]) => `${p}: ${n}`)
  return { ok: perdidas.length === 0, perdidas }
}
