// QUÉ SABE HACER DE VERDAD EL CIRCUITO CON CADA FORMATO. PURO — se calcula sobre el resultado de
// una corrida real, no sobre una tabla de intenciones.
//
// ═══ POR QUÉ «SOPORTADO» NO ES UNA PALABRA QUE SE PUEDA USAR ═══
//
// `registro.mjs` sabe que un `.tif` es una IMAGEN y le asigna un adaptador. Eso NO significa que el
// circuito pueda cotizar con un TIFF: significa que reconoció la extensión. Entre reconocer la
// extensión y que un elemento de ese archivo termine adentro del precio hay tres saltos más, y cada
// uno se cae por su cuenta. Declarar «soportado» tapa los tres.
//
import { formatoDe, FORMATO } from './registro.mjs'

// Por eso el estado de un formato son CUATRO respuestas separadas, y cada una se justifica ARCHIVO
// POR ARCHIVO contra lo que la corrida produjo:
//
//   DETECTADO           se reconoció el formato (extensión, y el MIME cuando la extensión no dice)
//   PARSEADO            se abrió y salió ESTRUCTURA: páginas, trazos, capas, entidades, celdas, texto
//   INTERPRETADO        de esa estructura salieron ELEMENTOS con significado de obra
//   INTEGRADO_PROYECTO  esos elementos entraron al proyecto único y se cruzaron con los demás
//
// ═══ LAS CUATRO NO SON UNA ESCALERA ═══
//
// Un JPG llega a INTERPRETADO sin pasar por PARSEADO: no hay lector local que le saque estructura,
// y la visión lo mira entero. Un TIFF se queda en DETECTADO porque `MIRABLE` no lo incluye y ni
// siquiera se lo mira. Forzar monotonía —«si llegó a la 3 llegó a la 2»— es exactamente la mentira
// que este cuadro existe para evitar. Se reportan las cuatro por separado.
//
// ═══ POR QUÉ EL CUADRO TIENE DOS EJES Y NO SE PUEDEN SUMAR SUS FILAS ═══
//
// «PDF raster» es un CONTENEDOR y «memoria» es un ROL: una memoria de cálculo llega en PDF o en
// DOCX y hay que poder responder por las dos preguntas. Un archivo cuenta en su fila de contenedor
// y, si además especifica, en su fila de rol. Sumar las filas cuenta dos veces a propósito.

/** Las cuatro etapas, en orden de exigencia. El orden importa para imprimir, no para deducir. */
export const ETAPA = Object.freeze({
  DETECTADO: 'DETECTADO',
  PARSEADO: 'PARSEADO',
  INTERPRETADO: 'INTERPRETADO',
  INTEGRADO_PROYECTO: 'INTEGRADO_PROYECTO',
})

export const ETAPAS = Object.freeze([ETAPA.DETECTADO, ETAPA.PARSEADO, ETAPA.INTERPRETADO, ETAPA.INTEGRADO_PROYECTO])

/** El eje de la fila. Un archivo cae en una fila de cada eje como máximo. */
export const EJE = Object.freeze({ CONTENEDOR: 'contenedor', ROL: 'rol' })

/** Las filas del cuadro. Son las once que el dueño nombró, ni una más: agregar una fila que nadie
 *  pidió es agregar una respuesta que nadie va a leer. */
export const FILA = Object.freeze({
  PDF_VECTORIAL: { clave: 'PDF_VECTORIAL', titulo: 'PDF vectorial', eje: EJE.CONTENEDOR },
  PDF_RASTER: { clave: 'PDF_RASTER', titulo: 'PDF raster', eje: EJE.CONTENEDOR },
  DWG: { clave: 'DWG', titulo: 'DWG', eje: EJE.CONTENEDOR },
  DXF: { clave: 'DXF', titulo: 'DXF', eje: EJE.CONTENEDOR },
  JPG: { clave: 'JPG', titulo: 'JPG', eje: EJE.CONTENEDOR },
  PNG: { clave: 'PNG', titulo: 'PNG', eje: EJE.CONTENEDOR },
  TIFF: { clave: 'TIFF', titulo: 'TIFF', eje: EJE.CONTENEDOR },
  EXCEL: { clave: 'EXCEL', titulo: 'Excel', eje: EJE.CONTENEDOR },
  DOC: { clave: 'DOC', titulo: 'DOC/DOCX', eje: EJE.CONTENEDOR },
  MEMORIA: { clave: 'MEMORIA', titulo: 'memorias', eje: EJE.ROL },
  PLIEGO: { clave: 'PLIEGO', titulo: 'pliegos/especificaciones', eje: EJE.ROL },
})

const EXT = (n) => String(n ?? '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? ''

/**
 * LA FILA DE CONTENEDOR DE UN ARCHIVO. PURA.
 *
 * El PDF se parte en vectorial y raster con la clase que MIDIÓ la corrida (`clasificarPagina`), no
 * con una corazonada sobre el nombre. Cuando la corrida no llegó a clasificarlo, la fila es `null`
 * y se dice: un PDF cuya clase no se conoce no es «vectorial por defecto».
 */
export function filaContenedor(nombre, { clasePdf = null } = {}) {
  const ext = EXT(nombre)
  if (ext === '.pdf') {
    if (clasePdf === 'RASTER') return FILA.PDF_RASTER
    if (clasePdf === 'VECTORIAL' || clasePdf === 'MIXTO' || clasePdf === 'TEXTO') return FILA.PDF_VECTORIAL
    return null
  }
  if (ext === '.dwg') return FILA.DWG
  if (ext === '.dxf') return FILA.DXF
  if (ext === '.jpg' || ext === '.jpeg') return FILA.JPG
  if (ext === '.png') return FILA.PNG
  if (ext === '.tif' || ext === '.tiff') return FILA.TIFF
  if (['.xls', '.xlsx', '.xlsm', '.csv', '.ods'].includes(ext)) return FILA.EXCEL
  if (['.doc', '.docx', '.odt', '.rtf'].includes(ext)) return FILA.DOC
  return null
}

/** La fila de ROL, que sólo tienen los documentos que ESPECIFICAN. `claseDocumental` ya decide esto
 *  para el peso de las fuentes; acá se reusa esa misma decisión para no tener dos criterios. PURA. */
export function filaRol(claseDocumental) {
  if (claseDocumental === 'MEMORIA') return FILA.MEMORIA
  if (claseDocumental === 'PLIEGO') return FILA.PLIEGO
  return null
}

/** La clase dominante de un PDF segmentado: la de sus páginas si coinciden, y la de la mayoría si
 *  no. Un plano de seis hojas donde cinco son vectoriales y una está escaneada es vectorial, y la
 *  hoja escaneada aparece igual en el detalle del archivo. PURA. */
export function claseDominante(laminas = []) {
  const cuenta = {}
  for (const l of laminas) if (l?.clase) cuenta[l.clase] = (cuenta[l.clase] ?? 0) + 1
  const orden = Object.entries(cuenta).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return orden[0]?.[0] ?? null
}

/** Una etapa alcanzada o no, siempre con la evidencia contable que la sostiene. PURA. */
const etapa = (ok, cuanto, porQue) => ({ ok: Boolean(ok), cuanto: cuanto ?? null, porQue })

/**
 * LOS ÍNDICES QUE HACEN FALTA PARA ATRIBUIR CADA ETAPA A SU ARCHIVO. PURA.
 *
 * Todo se cuenta por NOMBRE de archivo porque es la llave que el circuito arrastra de punta a
 * punta: `documental.cad[].archivo`, `laminas[].archivo`, `computo.items[].archivo` y
 * `proyecto.hechos[].documento` son todos el mismo string.
 */
function indexar(r = {}) {
  const sumar = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n)
  const elementos = new Map()
  for (const l of r.laminas ?? []) sumar(elementos, l.archivo, (l.elementos ?? []).length)
  for (const p of r.porRegion ?? []) sumar(elementos, p.archivo, Number(p.elementos ?? 0))
  const items = new Map()
  for (const i of r.computo?.items ?? []) sumar(items, i.archivo, 1)
  const hechos = new Map()
  const hechosDePieza = new Map()
  for (const h of r.documental?.hechos ?? []) {
    sumar(hechos, h.documento, 1)
    if (h.elemento) sumar(hechosDePieza, h.documento, 1)
  }
  const enProyecto = new Map()
  const cruzados = new Map()
  for (const h of r.proyecto?.hechos ?? []) {
    const docs = h.versiones?.length
      ? [...new Set(h.versiones.map((v) => v.documento))]
      : [...new Set((h.respaldo ?? [`${h.clase}:${h.documento}`]).map((x) => String(x).split(':').slice(1).join(':')))]
    for (const d of docs) {
      sumar(enProyecto, d, 1)
      if (docs.length > 1) sumar(cruzados, d, 1)
    }
  }
  return { elementos, items, hechos, hechosDePieza, enProyecto, cruzados }
}

/** El CAD: entidades leídas → bloques con nombre propio → hechos consolidados. PURA. */
function etapasDeCad(cad, ix, nombre) {
  const m = cad.medicion ?? {}
  const piezas = ix.hechosDePieza.get(nombre) ?? 0
  return {
    [ETAPA.PARSEADO]: etapa(m.entidades > 0, m.entidades, `${m.entidades ?? 0} entidad(es), ${(m.capas ?? []).length} capa(s), ${(m.cotas ?? []).length} cota(s)`),
    [ETAPA.INTERPRETADO]: etapa(piezas > 0, piezas, piezas ? `${piezas} bloque(s) con nombre propio pasaron a ser piezas del proyecto` : 'se midió geometría pero ningún bloque con nombre propio: capas y cotas no son piezas'),
    [ETAPA.INTEGRADO_PROYECTO]: etapa((ix.enProyecto.get(nombre) ?? 0) > 0, ix.enProyecto.get(nombre) ?? 0, `${ix.enProyecto.get(nombre) ?? 0} hecho(s) en el proyecto consolidado, ${ix.cruzados.get(nombre) ?? 0} de ellos cruzado(s) con otro documento`),
  }
}

/** Una lámina PDF: páginas y trazos → elementos leídos → elementos en el cómputo del proyecto. PURA. */
function etapasDeLamina(seg, ix, nombre) {
  const suma = (f) => (seg.laminas ?? []).reduce((a, l) => a + Number(f(l) ?? 0), 0)
  const regiones = suma((l) => (l.regiones ?? []).length)
  const trazos = suma((l) => l.trazos)
  const caracteres = suma((l) => l.caracteres)
  const el = ix.elementos.get(nombre) ?? 0
  const it = ix.items.get(nombre) ?? 0
  // ═══ ABRIR EL PDF NO ES PARSEARLO ═══
  // Un plano escaneado abre perfecto: pdfjs devuelve su página, su tamaño y su rotación. Y trae
  // CERO trazos y CERO caracteres, o sea nada que medir y nada que segmentar. Contar eso como
  // PARSEADO es exactamente la afirmación que este cuadro existe para no hacer.
  const estructura = trazos + caracteres > 0
  return {
    [ETAPA.PARSEADO]: etapa(estructura, seg.paginas, estructura
      ? `${seg.paginas} página(s), ${trazos} trazo(s), ${caracteres} carácter(es), ${regiones} región(es) segmentadas`
      : `${seg.paginas} página(s) abiertas y 0 trazos, 0 caracteres y ${regiones} región(es): es una imagen adentro de un PDF, no hay estructura que medir`),
    [ETAPA.INTERPRETADO]: etapa(el > 0, el, el ? `${el} lectura(s) de elemento entre la lámina completa y sus vistas` : 'ninguna lectura devolvió elementos'),
    [ETAPA.INTEGRADO_PROYECTO]: etapa(it > 0, it, it ? `${it} elemento(s) sobrevivieron la fusión y están en el cómputo único` : 'ningún elemento de este archivo llegó al cómputo'),
  }
}

/** Un documento que especifica: texto → hechos técnicos → hechos consolidados. PURA. */
function etapasDeTexto(doc, ix, nombre) {
  const h = ix.hechos.get(nombre) ?? 0
  const p = ix.enProyecto.get(nombre) ?? 0
  return {
    [ETAPA.PARSEADO]: etapa(doc.caracteres > 0, doc.caracteres, `${doc.caracteres} carácter(es) de texto`),
    [ETAPA.INTERPRETADO]: etapa(h > 0, h, h ? `${h} hecho(s) técnicos con cita literal` : 'salió texto y ninguna frase se pudo convertir en un hecho con pieza, atributo y valor'),
    [ETAPA.INTEGRADO_PROYECTO]: etapa(p > 0, p, `${p} hecho(s) en el proyecto consolidado, ${ix.cruzados.get(nombre) ?? 0} de ellos cruzado(s) con otro documento`),
  }
}

/** Lo que no pasó por ninguna rama de lectura: se dice qué le faltó, no se calla. PURA. */
function etapasSinRama(ix, nombre, porQue) {
  const el = ix.elementos.get(nombre) ?? 0
  const it = ix.items.get(nombre) ?? 0
  return {
    [ETAPA.PARSEADO]: etapa(false, 0, porQue),
    [ETAPA.INTERPRETADO]: etapa(el > 0, el, el ? `${el} elemento(s) leídos por visión sobre el archivo entero, sin estructura previa` : 'nadie lo miró'),
    [ETAPA.INTEGRADO_PROYECTO]: etapa(it > 0, it, it ? `${it} elemento(s) en el cómputo único` : 'no aportó nada al proyecto'),
  }
}

/**
 * EL ESTADO DE UN ARCHIVO, ETAPA POR ETAPA. PURA.
 *
 * `DETECTADO` es lo único que se puede afirmar sin abrir nada, y por eso es lo único que se
 * responde con la extensión. Las otras tres se responden con lo que la corrida produjo.
 */
export function etapasDeArchivo(doc, r, ix) {
  const nombre = doc.name
  const cad = (r.documental?.cad ?? []).find((c) => c.archivo === nombre)
  const seg = (r.documental?.segmentaciones ?? []).find((s) => s.archivo === nombre)
  const txt = (r.documental?.documentales ?? []).find((d) => d.archivo === nombre)
  const noLeido = (r.documental?.noLeidos ?? []).find((x) => x.archivo === nombre)
  // DETECTADO se responde con la MISMA función que usa el circuito para elegir adaptador, no con
  // una segunda tabla: dos tablas de extensiones se desincronizan y el cuadro empieza a mentir.
  const formato = formatoDe({ nombre, mime: doc.mime_type })
  const detectado = etapa(formato !== FORMATO.OTRO, null, formato === FORMATO.OTRO
    ? `ni la extensión «${EXT(nombre)}» ni el MIME «${doc.mime_type ?? '—'}» están en la tabla de formatos`
    : `«${EXT(nombre) || doc.mime_type}» → ${formato}`)
  const resto = cad ? etapasDeCad(cad, ix, nombre)
    : seg ? etapasDeLamina(seg, ix, nombre)
      : txt ? etapasDeTexto(txt, ix, nombre)
        : etapasSinRama(ix, nombre, noLeido?.porQue ?? doc.porQueNoLegible ?? 'ninguna rama de la ingesta abre este formato: no hay adaptador que le saque estructura')
  // La clase del PDF sale de la lectura CON geometría: la de la lámina segmentada, o la que
  // `textoDe` fue a buscar cuando el documento no soltó un solo carácter.
  const clasePdf = seg ? claseDominante(seg.laminas) : txt?.clasePdf ?? null
  const contenedor = filaContenedor(nombre, { clasePdf })
  return {
    archivo: nombre,
    tipo: doc.tipo ?? null,
    clasePdf,
    contenedor: contenedor?.clave ?? null,
    rol: filaRol(txt?.clase ?? null)?.clave ?? null,
    etapas: { [ETAPA.DETECTADO]: detectado, ...resto },
  }
}

/**
 * EL CUADRO COMPLETO. PURA.
 *
 * Toma el resultado de `correr()` y devuelve una fila por formato con las cuatro etapas contadas en
 * ARCHIVOS REALES, más el detalle archivo por archivo para poder discutir cualquier casillero.
 *
 * Los RESERVADOS de la validación ciega quedan afuera del cuadro a propósito: no están sin leer por
 * una limitación del circuito, están sin leer porque leerlos sería leer la respuesta. Se cuentan
 * aparte para que nadie los confunda con una capacidad faltante.
 */
export function cuadroDeFormatos(r = {}) {
  const ix = indexar(r)
  const insumos = r.documentos?.insumos ?? []
  const archivos = insumos.map((d) => etapasDeArchivo(d, r, ix)).sort((a, b) => a.archivo.localeCompare(b.archivo))
  const filas = []
  for (const f of Object.values(FILA)) {
    const suyos = archivos.filter((a) => (f.eje === EJE.CONTENEDOR ? a.contenedor : a.rol) === f.clave)
    const cuenta = {}
    for (const e of ETAPAS) cuenta[e] = suyos.filter((a) => a.etapas[e].ok).length
    filas.push({
      formato: f.titulo,
      clave: f.clave,
      eje: f.eje,
      archivos: suyos.length,
      ...cuenta,
      alcanza: suyos.length ? ETAPAS.filter((e) => cuenta[e] === suyos.length).slice(-1)[0] ?? null : null,
      porQue: suyos.length
        ? porQueDeLaFila(suyos, cuenta)
        : 'no hay ningún archivo de este formato en el proyecto: el cuadro no puede afirmar nada sobre él',
      ejemplos: suyos.slice(0, 3).map((a) => a.archivo),
    })
  }
  const sinFila = archivos.filter((a) => !a.contenedor && !a.rol)
  return {
    filas,
    archivos,
    sinFila: sinFila.map((a) => a.archivo),
    reservados: (r.documentos?.reservados ?? []).length,
    resumen: `${archivos.length} insumo(s) en ${filas.filter((f) => f.archivos).length} formato(s) presentes · ${filas.filter((f) => f.archivos && f.alcanza === ETAPA.INTEGRADO_PROYECTO).length} formato(s) llegan enteros al proyecto · ${sinFila.length} archivo(s) sin fila · ${(r.documentos?.reservados ?? []).length} reservado(s) para validación ciega (fuera del cuadro a propósito)`,
  }
}

/** Por qué una fila quedó donde quedó: la primera etapa que NO alcanzaron todos sus archivos es la
 *  que hay que explicar, y se explica con el motivo del primer archivo que la falló. PURA. */
function porQueDeLaFila(suyos, cuenta) {
  const rota = ETAPAS.find((e) => cuenta[e] < suyos.length)
  if (!rota) return `los ${suyos.length} archivo(s) llegaron a INTEGRADO_PROYECTO`
  const caso = suyos.find((a) => !a.etapas[rota].ok)
  return `${cuenta[rota]}/${suyos.length} llegan a ${rota} — «${caso.archivo}»: ${caso.etapas[rota].porQue}`
}
