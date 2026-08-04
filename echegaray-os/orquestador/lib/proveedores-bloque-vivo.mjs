// EL BLOQUE DE DEUDA DE PROVEEDORES: AUDITARLO, Y PLANIFICAR SU REEMPLAZO SIN TOCARLE EL FORMATO.
//
// ═══ EL PEDIDO (03/08), TEXTUAL ═══
//
// "no me sirve la pestaña proveedores asi, no se actualiza sola, y me deja huecos cdo se va un q fue
// pagado, es una verga esto"
//
// Y al día siguiente, la restricción: "respeta mi formato en proveedores no vayas a romper nada,
// hacela funcionar bien".
//
// ═══ LOS DOS DEFECTOS SON DEL MISMO ORIGEN: LA IDENTIDAD DE LA FILA ESTÁ ESCRITA EN LA CELDA ═══
//
// Medido en la pestaña viva (03/08), sección "1 · QUÉ SE DEBE Y CUÁNDO", filas 18–36:
//
//   A18 = IF(ROUND(SUMIFS(Compras!$O$4:$O;Compras!$E$4:$E;"Gruas San Blas";…);0)>0;"Gruas San Blas";"")
//   B19 = IF(Compras!$X$796="Pendiente";Compras!$AD$796;"")
//
// · LA FILA-CABECERA TIENE EL NOMBRE DEL PROVEEDOR CABLEADO. Cuando se le paga todo, el IF devuelve
//   "" y la fila queda EN BLANCO — pero sigue ocupando su renglón. Eso es el hueco. La fila no puede
//   irse porque su identidad no sale de los datos: está tipeada en la celda.
// · LA FILA DE DETALLE APUNTA A UNA FILA FIJA DE COMPRAS (`$796`). Una factura nueva no aparece
//   —no hay ninguna celda que la mire— y una fila insertada en Compras reapunta las 19 referencias a
//   otra factura, en silencio. Eso es el "no se actualiza sola".
//
// Ninguno de los dos se arregla corriendo el generador más seguido: el generador ESTÁ DADO DE BAJA
// (02/08, por pedido del dueño) y la escritura de Sheets está congelada. Un cuadro cuya verdad depende
// de que alguien corra un script hoy no se actualiza nunca. La única cura es que las FILAS salgan de
// una fórmula — y de eso se ocupa `proveedores-deuda-viva.mjs`.
//
// ═══ QUÉ HACE ESTE ARCHIVO, Y QUÉ NO ═══
//
// Hace dos cosas, las dos PURAS y ninguna escribe:
//
// 1. `defectosDeBloque` — el auditor. Le das las celdas que hoy tiene el bloque y te dice cuáles
//    dejan hueco y cuáles están ciegas. Es lo que hace que el defecto tenga un test: si alguien
//    vuelve al diseño de filas cableadas, el auditor lo marca y la suite se pone roja.
// 2. `planDeEscritura` — el plan. Ubica el ancla y el ancho EXACTOS a partir de los rótulos que el
//    dueño tiene puestos, y **se niega** si la forma no es la que la fórmula puede honrar. Un derrame
//    es posicional: no puede reordenar columnas ni saltear una. Si el dueño movió una columna, la
//    respuesta correcta es no escribir, no adaptarse en silencio.
//
// NO decide escribir. El plan se imprime, lo mira el dueño desde el árbol principal, y recién ahí se
// escribe. En este archivo ya se destruyó trabajo suyo seis veces por rediseñar encima.

import { COLS_FACTURA, reservaPara } from './proveedores-deuda-viva.mjs'

/**
 * LOS RÓTULOS DEL CONTRATO — se buscan por lo que el DUEÑO escribió, no por texto exacto.
 *
 * Él rotuló "Proveedor / factura" y "Tipo de Pago"; el contrato interno los llama "Proveedor" y
 * "Tipo de pago". Comparar por igualdad exacta haría fallar el plan por una barra y una mayúscula —
 * y el rótulo es SUYO. Se ubica por expresión regular, igual que `layoutDeuda` en el generador.
 *
 * El ORDEN de esta lista es el orden en que la fórmula derrama sus columnas: es el contrato.
 */
export const ROTULOS_CONTRATO = [
  { clave: 'prov', re: /proveedor/i },
  { clave: 'fecha', re: /pr[oó]ximo pago/i },
  { clave: 'comprobante', re: /comprobante/i },
  { clave: 'importe', re: /importe/i },
  { clave: 'obra', re: /^obra/i },
  { clave: 'tipoPago', re: /tipo de pago/i },
  { clave: 'categoria', re: /categor/i },
]

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase()

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/**
 * ¿La fórmula apunta a UNA FILA FIJA de Compras?
 *
 * `Compras!$X$796` (una celda suelta, sin `:`) es una referencia a la fila 796 de Compras y a ninguna
 * otra. Es lo que deja el cuadro ciego: la factura 797 no la mira nadie, y si se inserta una fila allá
 * la referencia pasa a hablar de otra factura sin dar un error. `Compras!$O$4:$O` —abierta— no es
 * defecto: es exactamente lo contrario.
 *
 * @param {string} formula
 * @returns {string[]} las referencias cableadas encontradas
 */
export function referenciasAFilaFija(formula = '') {
  const halladas = String(formula).match(/Compras!\$[A-Z]{1,3}\$\d+(?!\s*:)/g) ?? []
  // Una referencia que ARRANCA un rango (`$O$4:$O`) matchea el patrón de arriba salvo por el `:` que
  // el lookahead descarta. Este segundo filtro saca las que quedaron pegadas a un `:` con espacios.
  return halladas.filter((r) => !new RegExp(`${r.replace(/\$/g, '\\$')}\\s*:`).test(String(formula)))
}

/**
 * ¿La celda tiene el NOMBRE DE UN PROVEEDOR cableado como criterio?
 *
 * La firma del hueco. Si la fila sólo sabe hablar de "Gruas San Blas" porque el nombre está tipeado
 * adentro, el día que se le pague todo la celda devuelve "" y el renglón queda vacío EN SU LUGAR: la
 * fila no se puede ir. Una fila que sale de un derrame no tiene este problema porque su identidad la
 * decide el dato, no la celda.
 *
 * Se mira SÓLO la columna de proveedor de Compras: un literal contra la columna de estado
 * (`Compras!$X$4:$X;"Pendiente"`) es el criterio correcto y no es defecto.
 *
 * @param {string} formula
 * @param {string} colProv referencia abierta a la columna de proveedor, ej. `Compras!$E$4:$E`
 * @returns {string[]} los nombres cableados encontrados
 */
export function proveedoresCableados(formula = '', colProv = 'Compras!$E$4:$E') {
  const re = new RegExp(`${colProv.replace(/[$!]/g, (c) => '\\' + c)}\\s*;\\s*"([^"]+)"`, 'g')
  const out = []
  for (const m of String(formula).matchAll(re)) out.push(m[1])
  return [...new Set(out)]
}

/**
 * EL AUDITOR DEL BLOQUE. Recorre las celdas que hoy están escritas y nombra los dos defectos.
 *
 * @param {Array<{dir:string, formula:string}>} celdas lo que hay hoy en el bloque
 * @param {{colProv?:string}} [opts]
 * @returns {{ok:boolean, huecos:Array<{dir:string,proveedor:string}>, ciegas:Array<{dir:string,ref:string}>}}
 */
export function defectosDeBloque(celdas = [], { colProv = 'Compras!$E$4:$E' } = {}) {
  const huecos = []
  const ciegas = []
  for (const c of celdas ?? []) {
    const f = String(c?.formula ?? '')
    if (!f) continue
    for (const p of proveedoresCableados(f, colProv)) huecos.push({ dir: String(c.dir ?? ''), proveedor: p })
    for (const r of referenciasAFilaFija(f)) ciegas.push({ dir: String(c.dir ?? ''), ref: r })
  }
  return { ok: huecos.length === 0 && ciegas.length === 0, huecos, ciegas }
}

/**
 * EL PLAN DE ESCRITURA — Y LAS CUATRO RAZONES POR LAS QUE SE NIEGA A HABERLO.
 *
 * Un derrame es POSICIONAL: ocupa columnas consecutivas desde su ancla, en el orden en que la fórmula
 * las arma. Por eso el plan no "se adapta" a cualquier pestaña: verifica que la forma que el dueño
 * tiene puesta sea exactamente la que la fórmula puede honrar, y si no lo es no hay plan. Adaptarse
 * en silencio es cómo se escriben los números de un proveedor en la fila de otro.
 *
 * Se niega si:
 *  1. falta alguno de los siete rótulos del contrato — no sabría dónde va esa columna;
 *  2. los rótulos están en otro ORDEN — un derrame no puede reordenar sus columnas;
 *  3. los pendientes de HOY no entran hasta donde empieza lo de abajo — mostrar una deuda recortada
 *     es peor que no mostrarla, y agrandar el bloque es tocarle el formato al dueño;
 *  4. el ancla o el límite no son filas válidas.
 *
 * LO QUE EL PLAN NUNCA RECLAMA. Las columnas que el dueño rotuló DESPUÉS de las siete —hoy
 * "Comentarios" (H)— quedan fuera del ancho de escritura y salen listadas en `columnasDelDueño`. Es
 * la lección de `columna-del-dueno-fuera-del-footprint` aplicada al revés: allá el generador rellenó
 * hasta el ancho de la hoja y le borró catorce fechas; acá el ancho es SIETE y punto.
 *
 * @param {{encabezados?:any[], filaEncabezado:number, filaLimite:number, pendientes?:number}} opts
 *   filaLimite = la primera fila que YA NO es del bloque (el título de la sección siguiente).
 * @returns {{ok:true, ancla:string, rango:string, ancho:number, reserva:number, avisos:string[],
 *            columnasDelDueño:Array<{columna:string,rotulo:string}>, contrato:string[]}
 *          | {ok:false, motivo:string}}
 */
export function planDeEscritura({ encabezados = [], filaEncabezado, filaLimite, pendientes = 0 } = {}) {
  const H = (encabezados ?? []).map((h) => String(h ?? '').trim())
  if (!(filaEncabezado > 0) || !(filaLimite > filaEncabezado + 1)) {
    return { ok: false, motivo: `geometría inválida: encabezado en la fila ${filaEncabezado} y límite en la ${filaLimite}` }
  }

  const ubicadas = ROTULOS_CONTRATO.map(({ clave, re }) => ({ clave, i: H.findIndex((h) => h && re.test(h)) }))
  const faltan = ubicadas.filter((u) => u.i < 0).map((u) => u.clave)
  if (faltan.length) {
    return { ok: false, motivo: `faltan rótulos del contrato en la fila ${filaEncabezado}: ${faltan.join(', ')}. `
      + 'No se escribe: la fórmula no sabría en qué columna va cada dato.' }
  }
  const fuera = ubicadas.filter((u, k) => u.i !== k)
  if (fuera.length) {
    return { ok: false, motivo: 'los rótulos están en otro orden que el que la fórmula derrama '
      + `(${fuera.map((u) => `${u.clave} está en ${letra(u.i)}, se esperaba ${letra(ROTULOS_CONTRATO.findIndex((r) => r.clave === u.clave))}`).join(' · ')}). `
      + 'Un derrame es posicional: no se escribe hasta que el orden coincida o se cambie el contrato.' }
  }

  const ancho = ROTULOS_CONTRATO.length
  const anclaFila = filaEncabezado + 1
  const disponibles = filaLimite - anclaFila

  // ═══ NO ALCANZA vs NO SOBRA: DOS COSAS DISTINTAS, Y SÓLO UNA ES MOTIVO PARA NO ESCRIBIR ═══
  //
  // Si los pendientes de HOY no entran en las filas que el dueño tiene reservadas, escribir sería
  // mostrarle una deuda recortada: eso no se hace, y el arreglo pasa por correr la sección 2 hacia
  // abajo — o sea, por tocarle el formato, que se le pide a él y no se decide acá.
  //
  // Que no entre el COLCHÓN es otra cosa. `reservaPara` pide un 60% de aire para que el cuadro aguante
  // lo que entre mañana; si no hay tanto lugar, el derrame se acota a las filas que hay y el bloque
  // sigue diciendo la verdad de hoy. Negarse por el colchón dejaría la pestaña rota por prolijidad.
  // El truncado futuro no queda mudo: `formulaControl` compara el titular contra lo que el bloque
  // muestra y grita el peso exacto que falta. Ese es el aviso, no un rechazo preventivo.
  if (pendientes > disponibles) {
    return { ok: false, motivo: `no entra: hay ${pendientes} factura(s) pendiente(s) y sólo ${disponibles} filas `
      + `entre la ${anclaFila} y la ${filaLimite}, donde empieza la sección 2. Escribir acá mostraría una deuda `
      + 'recortada. Hace falta correr la sección 2 hacia abajo, y eso es tocarle el formato: lo decide el dueño.' }
  }
  const holgada = reservaPara(pendientes)
  const reserva = Math.min(holgada, disponibles)
  const avisos = reserva < holgada
    ? [`el colchón quedó corto: entran ${reserva} filas y el aire recomendado eran ${holgada}. Con ${pendientes} `
      + `pendientes sobran ${disponibles - pendientes} renglones; cuando se acaben, el control del bloque avisa el peso que falta.`]
    : []

  return {
    ok: true,
    ancla: `A${anclaFila}`,
    rango: `A${anclaFila}:${letra(ancho - 1)}${anclaFila + reserva - 1}`,
    ancho,
    reserva,
    avisos,
    // Todo lo que el dueño rotuló más allá del contrato es SUYO y el plan ni lo menciona en su rango.
    columnasDelDueño: H.slice(ancho).map((rotulo, k) => ({ columna: letra(ancho + k), rotulo }))
      .filter((c) => c.rotulo !== ''),
    contrato: [...COLS_FACTURA],
  }
}

/**
 * LAS COLUMNAS DE COMPRAS, UBICADAS POR SU RÓTULO.
 *
 * El dueño edita Compras y una columna borrada corre todas las que siguen: ubicar por posición fija
 * es lo que un día dejó la deuda en cero. Las que nunca se movieron conservan su lugar histórico como
 * respaldo; las que sí se mueven (las que agregó el OS) se buscan por nombre y, si no aparecen, se
 * usa el respaldo y se deja dicho — nunca se inventa una columna.
 *
 * Es pura: recibe la fila de rótulos ya leída. El plan y el aplicador comparten esta función para que
 * no puedan resolver columnas distintas y escribir una fórmula que el plan nunca mostró.
 *
 * @param {any[]} cabecera la fila 3 de Compras
 * @returns {{rangos:Record<string,string>, avisos:string[]}}
 */
export function rangosDesdeEncabezado(cabecera = []) {
  const avisos = []
  const cab = (cabecera ?? []).map((c) => String(c ?? '').trim().toLowerCase())
  const porNombre = (nombre, respaldo) => {
    const i = cab.indexOf(nombre.toLowerCase())
    if (i < 0) { avisos.push(`no encontré "${nombre}" en el encabezado de Compras; uso ${respaldo}`); return respaldo }
    return `Compras!$${letra(i)}$4:$${letra(i)}`
  }
  return {
    avisos,
    rangos: {
      prov: 'Compras!$E$4:$E',
      estado: 'Compras!$X$4:$X',
      total: 'Compras!$O$4:$O',
      comprobante: 'Compras!$H$4:$H',
      obra: 'Compras!$J$4:$J',
      categoria: 'Compras!$B$4:$B',
      comercial: porNombre('¿Proveedor comercial? (OS)', 'Compras!$AJ$4:$AJ'),
      pagado: porNombre('Monto Pagado', 'Compras!$T$4:$T'),
      parcial1: porNombre('Monto Parcial 1', 'Compras!$U$4:$U'),
      parcial2: porNombre('Monto Parcial 2', 'Compras!$W$4:$W'),
      fecha: porNombre('Fecha de caja', 'Compras!$AD$4:$AD'),
      tipoPago: porNombre('Tipo pago', 'Compras!$P$4:$P'),
    },
  }
}

/**
 * LA HUELLA DE LO QUE NO SE TOCA — la evidencia se toma ANTES y se compara DESPUÉS.
 *
 * Dos cosas son intocables al reescribir la sección 1, y las dos ya se perdieron en este archivo:
 * la columna que el dueño rotuló más allá del contrato (hoy H, "Comentarios") y **la sección 2
 * entera**, donde vive la columna B con los CUIT que cargó a mano.
 *
 * Que el script "no las incluya en su rango" no es evidencia de nada: un rango mal calculado también
 * cree que no las incluye. La evidencia es el dato leído del archivo antes y después, y por eso esto
 * devuelve un mapa comparable en vez de un booleano.
 *
 * @param {any[][]} filas la pestaña leída desde A1
 * @param {{filaLimite:number, filaEncabezado:number, ancho:number}} geo
 * @returns {Map<string,string>} dirección A1 → contenido
 */
export function huellaProtegida(filas = [], { filaLimite, filaEncabezado, ancho } = {}) {
  const huella = new Map()
  const anotar = (f, c, v) => {
    const s = String(v ?? '')
    if (s !== '') huella.set(`${letra(c)}${f + 1}`, s)
  }
  for (let f = 0; f < (filas ?? []).length; f++) {
    const fila = filas[f] ?? []
    // La sección 2 y todo lo que sigue: intacta entera, en todas sus columnas.
    if (f + 1 >= filaLimite) { fila.forEach((v, c) => anotar(f, c, v)); continue }
    // Dentro del bloque, las columnas del dueño (las que están más allá del ancho del contrato).
    if (f + 1 > filaEncabezado) for (let c = ancho; c < fila.length; c++) anotar(f, c, fila[c])
  }
  return huella
}

/**
 * QUÉ SE PERDIÓ O CAMBIÓ ENTRE DOS HUELLAS. Una sola entrada acá es motivo de alarma, no de nota
 * al pie: significa que la escritura salió del rango que declaró.
 *
 * @param {Map<string,string>} antes
 * @param {Map<string,string>} despues
 * @returns {Array<{dir:string, antes:string, despues:string}>}
 */
export function diferenciasDeHuella(antes = new Map(), despues = new Map()) {
  const dirs = new Set([...antes.keys(), ...despues.keys()])
  const out = []
  for (const dir of dirs) {
    const a = antes.get(dir) ?? ''
    const d = despues.get(dir) ?? ''
    if (a !== d) out.push({ dir, antes: a, despues: d })
  }
  return out.sort((x, y) => x.dir.localeCompare(y.dir))
}

/**
 * LA GEOMETRÍA SE ANCLA AL TEXTO DEL DUEÑO, NO A NÚMEROS DE FILA.
 *
 * Los títulos "1 · QUÉ SE DEBE Y CUÁNDO" y "2 · CUENTA CORRIENTE POR PROVEEDOR" los escribió él y son
 * lo único estable: si mañana inserta dos filas arriba, un 17 cableado apunta al vacío y el plan
 * saldría bien igual. Ya pasó en este archivo — ver `anclar-en-el-ultimo-es-anclar-en-la-posicion`.
 *
 * @param {any[][]} filas la pestaña leída desde A1
 * @returns {{filaEncabezado:number, filaLimite:number, encabezados:string[]}}
 */
export function geometriaSeccion1(filas = []) {
  const textoDe = (i) => norm((filas[i] ?? [])[0])
  const iTitulo = filas.findIndex((_, i) => /^1\s*[·.\-]/.test(textoDe(i)) && /QUE SE DEBE/.test(textoDe(i)))
  if (iTitulo < 0) throw new Error('no encontré el título "1 · QUÉ SE DEBE Y CUÁNDO": la pestaña cambió de forma, no hay plan')
  const iLimite = filas.findIndex((_, i) => i > iTitulo && /^2\s*[·.\-]/.test(textoDe(i)))
  if (iLimite < 0) throw new Error('no encontré el título de la sección 2: sin límite no se puede reservar filas sin pisar lo de abajo')
  // El encabezado es la última fila con rótulos entre el título y el límite.
  const iCab = filas.findIndex((_, i) => i > iTitulo && i < iLimite && /PROVEEDOR/.test(norm((filas[i] ?? [])[0])) && (filas[i] ?? []).filter(Boolean).length >= 4)
  if (iCab < 0) throw new Error('no encontré la fila de rótulos de la sección 1')
  return {
    filaEncabezado: iCab + 1,
    filaLimite: iLimite + 1,
    encabezados: (filas[iCab] ?? []).map((c) => String(c ?? '').trim()),
  }
}
