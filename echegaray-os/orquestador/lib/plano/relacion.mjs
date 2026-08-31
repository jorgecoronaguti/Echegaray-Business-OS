// LOS DOCUMENTOS DE UN PROYECTO NO SON ISLAS. Puro: entran fichas, sale el grafo de relaciones.
//
// ═══ QUÉ FALTABA ═══
//
// `proyecto.mjs` ya cruza los HECHOS de varios documentos y detecta contradicciones. Lo que no sabía
// es CÓMO SE RELACIONAN LOS DOCUMENTOS ENTRE SÍ, y sin eso el cruce se equivoca en las dos
// direcciones a la vez:
//
//   · DE MÁS — medido sobre ARCOR SAN JUAN, que no es una obra sino una CARTERA de obras chicas
//     («Filtro Sanitario», «Vestuario Hombres», «Vestuario Mujeres», «Cisterna»). El espesor de
//     contrapiso del vestuario de hombres y el del filtro sanitario caen en la misma clave
//     `contrapiso:espesor_m` y se leen como una contradicción. No lo son: hablan de obras distintas.
//     Sin ÁMBITO, cuantas más obras trae el cliente, más conflictos falsos.
//   · DE MENOS — dos revisiones del mismo plano son DOS FUENTES para el consolidador, y por lo
//     tanto un conflicto perpetuo entre lo que rige y lo que ya no rige. La Rev A no contradice a la
//     Rev C: fue reemplazada por ella.
//
// ═══ LA JERARQUÍA ES POR DOMINIO, NO UNA SOLA ═══
//
// `CLASE_FUENTE.peso` ordena una lista y sirve para saber a quién preguntarle primero. Pero no hay
// UN orden: el que manda depende de QUÉ se está discutiendo, y eso es criterio de obra, no de
// software.
//
//   · GEOMETRÍA      el CAD tiene las coordenadas, el plano las acota, y el DETALLE le gana a la
//                    planta — dibujar en escala 1:20 lo que en la planta va a 1:100 es literalmente
//                    para eso. El pliego no acota.
//   · CANTIDAD       la cuenta sale del dibujo; una planilla de cómputo del cliente es un insumo.
//   · ESPECIFICACIÓN la memoria de cálculo es donde el calculista escribe la resistencia y la
//                    cuantía. El plano las repite; cuando difieren, manda quien las calculó.
//   · ALCANCE        qué entra y qué no entra en el trabajo lo define el PLIEGO/CONTRATO, que es lo
//                    exigible. Un plano puede dibujar algo que el contrato excluye — pasó en
//                    Quattropani con el entrepiso y la escalera.
//
// ═══ RESOLVER NO ES CALLAR ═══
//
// Cuando la jerarquía decide, la versión desplazada SALE IGUAL, con su documento y su cita, y el
// hecho queda con estado `RESUELTO_POR_JERARQUIA` — que no es `CONFIRMADO`. Cuando no alcanza para
// decidir, el resultado es `CONFLICTO` con las dos evidencias y sin valor elegido. Este archivo no
// tiene una rama que elija un valor sin dejar rastro de la otra.

import { revisionDe, rutaDeclaraSuperado } from '../documentacion-obra.mjs'

const plano = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const sinExtension = (s) => String(s ?? '').replace(/\.[a-z0-9]{1,5}$/i, '')

/** Qué dibujo es. Un plano de obra dice en el rótulo qué muestra, y esa palabra decide cuál manda
 *  cuando dos láminas acotan la misma pieza distinto. PURA. */
export const VISTA = Object.freeze({
  DETALLE: 'DETALLE', CORTE: 'CORTE', PLANTA: 'PLANTA', VISTA: 'VISTA',
  PLANILLA: 'PLANILLA', ESQUEMA: 'ESQUEMA', INDETERMINADA: 'INDETERMINADA',
})

const REGLAS_VISTA = Object.freeze([
  [VISTA.DETALLE, /\bdetalle|\bdet\b|\bnudo\b|\bencuentro\b/],
  [VISTA.CORTE, /\bcorte|\bseccion\b|\bsecc\b/],
  [VISTA.PLANILLA, /\bplanilla|\bcomputo\b|\blistado\b|\bcuadro\b/],
  [VISTA.PLANTA, /\bplanta|\bimplantacion\b|\breplanteo\b/],
  [VISTA.VISTA, /\bvista|\bfachada|\belevacion\b/],
  [VISTA.ESQUEMA, /\besquema|\bcroquis|\bdiagrama\b/],
])

/** La vista que declara el nombre del archivo. `INDETERMINADA` cuando no lo declara — que no es
 *  «es una planta»: es no saber, y por eso no puede ganar ningún desempate. PURA. */
export function vistaDe(nombre) {
  const n = plano(sinExtension(nombre))
  for (const [v, re] of REGLAS_VISTA) if (re.test(n)) return v
  return VISTA.INDETERMINADA
}

/** Sobre qué se está discutiendo. Cada dominio tiene su propia jerarquía documental. PURA. */
export const DOMINIO = Object.freeze({
  GEOMETRIA: 'GEOMETRIA', CANTIDAD: 'CANTIDAD', ESPECIFICACION: 'ESPECIFICACION',
  ALCANCE: 'ALCANCE', INDETERMINADO: 'INDETERMINADO',
})

const POR_ATRIBUTO = Object.freeze({
  largo: DOMINIO.GEOMETRIA, ancho: DOMINIO.GEOMETRIA, alto: DOMINIO.GEOMETRIA,
  altura: DOMINIO.GEOMETRIA, area: DOMINIO.GEOMETRIA, area_m2: DOMINIO.GEOMETRIA,
  espesor_m: DOMINIO.GEOMETRIA, seccion: DOMINIO.GEOMETRIA, diametro: DOMINIO.GEOMETRIA,
  luz: DOMINIO.GEOMETRIA, separacion: DOMINIO.GEOMETRIA, pendiente: DOMINIO.GEOMETRIA,
  unidad_dibujo: DOMINIO.GEOMETRIA,
  cantidad: DOMINIO.CANTIDAD, cantidad_insertada: DOMINIO.CANTIDAD,
  resistencia: DOMINIO.ESPECIFICACION, material: DOMINIO.ESPECIFICACION,
  terminacion: DOMINIO.ESPECIFICACION, armadura: DOMINIO.ESPECIFICACION,
  metodo: DOMINIO.ESPECIFICACION,
  alcance: DOMINIO.ALCANCE, incluye: DOMINIO.ALCANCE, excluye: DOMINIO.ALCANCE,
  ubicacion: DOMINIO.ALCANCE, plazo: DOMINIO.ALCANCE, responsabilidad: DOMINIO.ALCANCE,
})

/** El dominio de un atributo. `INDETERMINADO` cuando el atributo no está en la tabla — y un dominio
 *  indeterminado NO habilita ninguna jerarquía: el desacuerdo queda en CONFLICTO. PURA. */
export const dominioDe = (atributo) => POR_ATRIBUTO[String(atributo ?? '')] ?? DOMINIO.INDETERMINADO

/**
 * QUIÉN MANDA EN CADA DOMINIO, de mayor a menor autoridad.
 *
 * Una clase que NO figura en la lista de un dominio no tiene autoridad ahí: un CAD no especifica
 * resistencias y un pliego no acota. Eso es distinto de tener poca autoridad — significa que su
 * palabra no entra al desempate, y si es la única que habla el hecho igual se registra (completar
 * no es contradecir), pero no puede desplazar a nadie.
 */
export const AUTORIDAD = Object.freeze({
  [DOMINIO.GEOMETRIA]: Object.freeze(['CAD', 'PLANO', 'MEMORIA', 'PLANILLA']),
  [DOMINIO.CANTIDAD]: Object.freeze(['CAD', 'PLANO', 'PLANILLA', 'MEMORIA']),
  [DOMINIO.ESPECIFICACION]: Object.freeze(['MEMORIA', 'PLIEGO', 'PLANO', 'PLANILLA']),
  [DOMINIO.ALCANCE]: Object.freeze(['PLIEGO', 'MEMORIA', 'PLANO', 'PLANILLA']),
  [DOMINIO.INDETERMINADO]: Object.freeze([]),
})

/** El rango de una clase en un dominio: 0 es el que más manda. `null` = no tiene autoridad acá. PURA. */
export function rangoDe(clase, dominio) {
  const i = (AUTORIDAD[dominio] ?? []).indexOf(String(clase ?? ''))
  return i === -1 ? null : i
}

/** El desempate DENTRO de la misma clase PLANO y sólo en geometría: el detalle está dibujado a
 *  escala grande justamente para acotar lo que la planta no puede. Fuera de geometría la vista no
 *  decide nada. PURA. */
const ORDEN_VISTA = Object.freeze([VISTA.DETALLE, VISTA.CORTE, VISTA.PLANTA, VISTA.VISTA])
export function rangoDeVista(vista, dominio) {
  if (dominio !== DOMINIO.GEOMETRIA) return null
  const i = ORDEN_VISTA.indexOf(vista)
  return i === -1 ? null : i
}

/** Las carpetas que agrupan y no nombran una obra. Salen de las rutas reales del data room: en
 *  ARCOR, «OBRAS PERDIDAS/REPARACION DE LUCERAS» es una obra que se llama Reparación de Luceras. */
const CARPETA_AGRUPA = /^(obras?\s*(perdidas|ganadas|en curso)?|proyecto\s*final|cotizacion(es)?\s*interna?s?|presupuestos?\s*interno?s?|presupuestos?|cotizacion(es)?|planos?|documentacion|documentos|carpeta sin titulo|adjuntos|varios|archivos?\s*viejos?|viejos?|final(es)?|nueva carpeta)$/

/**
 * A QUÉ OBRA PERTENECE ESTE DOCUMENTO. PURA.
 *
 * Es el primer segmento bajo la carpeta del cliente que NOMBRA algo. Sin esto, una cartera de obras
 * chicas del mismo cliente se consolida como si fuera una sola obra y todo choca contra todo.
 * Devuelve `null` cuando el archivo cuelga directo de la raíz: ahí sí es documentación del cliente
 * entero y aplica a todos los ámbitos.
 */
export function ambitoDe(ruta, { carpetaObra = '' } = {}) {
  const r = String(ruta ?? '')
  const base = String(carpetaObra ?? '')
  const dentro = base && r.startsWith(base) ? r.slice(base.length) : r
  const segmentos = dentro.split('/').filter(Boolean).slice(0, -1)
  for (const s of segmentos) if (!CARPETA_AGRUPA.test(plano(s))) return s
  return null
}

/** La familia de revisiones: el nombre sin la marca de revisión ni el «(1)» que pone Drive al
 *  duplicar. Dos archivos de la misma familia son el MISMO documento en distinto momento. PURA. */
export function familiaDe(nombre) {
  const base = plano(sinExtension(nombre).replace(/\(\d+\)/g, ''))
    .replace(/\brev\.?\s*[a-z]\b/g, '')
    .replace(/\bv\.?\s*\d{1,2}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return base || plano(nombre)
}

/** Los tipos de relación que este modelo sabe afirmar. Cada uno tiene una consecuencia distinta y
 *  por eso no se colapsan en «están relacionados». */
export const RELACION = Object.freeze({
  REVISION: 'REVISION',                 // el mismo documento en dos momentos: la nueva rige
  ESPEJO_FORMATO: 'ESPEJO_FORMATO',     // el mismo documento exportado a otro formato
  MISMO_AMBITO: 'MISMO_AMBITO',         // hablan de la misma obra desde roles distintos
  AMBITOS_DISTINTOS: 'AMBITOS_DISTINTOS', // NO hablan de lo mismo: no pueden contradecirse
})

const extDe = (n) => String(n ?? '').toLowerCase().match(/\.[a-z0-9]{1,5}$/)?.[0] ?? ''

/** Las familias con su vigente y sus superadas. La revisión declarada en el nombre manda; la ruta
 *  («ARCHIVOS VIEJOS») manda sobre la revisión, porque la movió una persona a propósito. PURA. */
function familias(fichas) {
  const mapa = new Map()
  for (const f of fichas) {
    const k = `${f.ambito ?? '*'} ${f.familia}`
    if (!mapa.has(k)) mapa.set(k, [])
    mapa.get(k).push(f)
  }
  const salida = []
  for (const [, lista] of [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const vivas = lista.filter((f) => !f.superadaPorRuta)
    const universo = vivas.length ? vivas : lista
    const conRev = universo.filter((f) => f.revision)
    let vigente = null
    let ambigua = null
    if (conRev.length) {
      const tope = Math.max(...conRev.map((f) => f.revision.orden))
      const empatadas = conRev.filter((f) => f.revision.orden === tope).sort((a, b) => a.nombre.localeCompare(b.nombre))
      if (empatadas.length > 1) ambigua = `${empatadas.length} archivo(s) declaran ${empatadas[0].revision.etiqueta}: no se elige uno a ojo`
      vigente = empatadas[0]
    } else {
      vigente = [...universo].sort((a, b) => String(b.modificado ?? '').localeCompare(String(a.modificado ?? '')) || a.nombre.localeCompare(b.nombre))[0] ?? null
    }
    const otras = lista.filter((f) => f !== vigente)
    // EL MISMO DOCUMENTO EN OTRO FORMATO NO ES UNA VERSIÓN SUPERADA. `Cotizacion Final.xlsm` y
    // `Cotizacion Final.pdf` son la planilla y su foto; marcar la planilla como superada es lo peor
    // que puede pasar, porque la planilla es la fuente.
    const espejos = otras.filter((f) => !f.superadaPorRuta && !f.revision && !vigente?.revision && extDe(f.nombre) !== extDe(vigente?.nombre ?? ''))
    const superadas = otras.filter((f) => !espejos.includes(f))
    salida.push({
      familia: lista[0].familia, ambito: lista[0].ambito ?? null, vigente, superadas, espejos, ambigua,
      criterio: conRev.length ? 'revisión declarada en el nombre' : 'fecha de modificación (ningún archivo declara revisión)',
    })
  }
  return salida
}

/**
 * EL GRAFO DOCUMENTAL DE UN PROYECTO. PURA.
 *
 * Entra el conjunto de insumos ya clasificado —lo que devuelve `partirDocumentos` más la clase que
 * pone `claseDocumental`— y sale con qué se puede decidir después: quién superó a quién, qué
 * documentos hablan de la misma obra y cuáles no pueden contradecirse porque hablan de obras
 * distintas.
 */
export function relacionar(documentos = [], { carpetaObra = '' } = {}) {
  const fichas = documentos.filter(Boolean).map((d) => ({
    nombre: d.name ?? d.nombre ?? d.archivo ?? '',
    ruta: d.path ?? d.ruta ?? '',
    clase: d.clase ?? null,
    tipo: d.tipo ?? null,
    modificado: d.modified_time ?? d.modificado ?? null,
    vista: vistaDe(d.name ?? d.nombre ?? d.archivo ?? ''),
    ambito: ambitoDe(d.path ?? d.ruta ?? '', { carpetaObra }),
    familia: familiaDe(d.name ?? d.nombre ?? d.archivo ?? ''),
    revision: revisionDe(d.name ?? d.nombre ?? d.archivo ?? ''),
    superadaPorRuta: rutaDeclaraSuperado(d.path ?? d.ruta ?? ''),
  })).sort((a, b) => a.nombre.localeCompare(b.nombre))

  const fams = familias(fichas)
  const superado = new Map()
  for (const f of fams) {
    for (const s of f.superadas) {
      superado.set(s.nombre, {
        vigente: f.vigente?.nombre ?? null,
        porQue: s.superadaPorRuta
          ? `la ruta declara que ya no rige y «${f.vigente?.nombre ?? '—'}» sí`
          : `«${f.vigente?.nombre ?? '—'}» es ${f.vigente?.revision?.etiqueta ?? 'la más reciente'} de la misma familia`,
      })
    }
  }
  const porNombre = new Map(fichas.map((f) => [f.nombre, f]))
  const porAmbito = new Map()
  for (const f of fichas) {
    const k = f.ambito ?? ' RAIZ'
    porAmbito.set(k, [...(porAmbito.get(k) ?? []), f.nombre])
  }
  const pares = (n) => (n * (n - 1)) / 2
  const ambitos = [...porAmbito.entries()].filter(([k]) => k !== ' RAIZ').sort((a, b) => a[0].localeCompare(b[0]))
  return {
    fichas, familias: fams, superado, porNombre,
    ambitos: ambitos.map(([ambito, docs]) => ({ ambito, documentos: docs })),
    raiz: porAmbito.get(' RAIZ') ?? [],
    relaciones: {
      [RELACION.REVISION]: fams.reduce((a, f) => a + f.superadas.length, 0),
      [RELACION.ESPEJO_FORMATO]: fams.reduce((a, f) => a + f.espejos.length, 0),
      [RELACION.MISMO_AMBITO]: ambitos.reduce((a, [, d]) => a + pares(d.length), 0),
      [RELACION.AMBITOS_DISTINTOS]: pares(fichas.length) - ambitos.reduce((a, [, d]) => a + pares(d.length), 0) - pares(porAmbito.get(' RAIZ')?.length ?? 0),
    },
    ambiguas: fams.filter((f) => f.ambigua).map((f) => ({ familia: f.familia, ambito: f.ambito, porQue: f.ambigua })),
    resumen: `${fichas.length} documento(s) · ${ambitos.length} ámbito(s) de obra · ${fams.length} familia(s) · ${superado.size} documento(s) superado(s) por una revisión más nueva`,
  }
}

/** El ámbito de un hecho, mirando de qué documento salió. `null` = documentación del cliente entero,
 *  que aplica a todos los ámbitos y por eso no se separa. PURA. */
export const ambitoDeHecho = (h, rel) => rel?.porNombre?.get(h?.documento)?.ambito ?? null

/** La clave con la que se agrupa un hecho. Dos hechos de obras distintas NO comparten clave: no
 *  pueden confirmarse ni contradecirse entre sí. PURA. */
export const claveDeHecho = (h, rel) => `${ambitoDeHecho(h, rel) ?? '*'} ${h?.que}`

/**
 * ¿ALGUNA REGLA DOCUMENTAL DECIDE ENTRE ESTOS DOS? PURA.
 *
 * Devuelve `{ gana, pierde, regla, porQue }` o `null` cuando NO decide. Que devuelva `null` es un
 * resultado tan bueno como el otro: significa que el desacuerdo lo tiene que resolver una persona.
 */
export function mandaSobre(a, b, { dominio = DOMINIO.INDETERMINADO, relaciones = null } = {}) {
  const sa = relaciones?.superado?.get(a?.documento)
  const sb = relaciones?.superado?.get(b?.documento)
  if (sa && !sb) return { gana: b, pierde: a, regla: RELACION.REVISION, porQue: `«${a.documento}» quedó superado: ${sa.porQue}` }
  if (sb && !sa) return { gana: a, pierde: b, regla: RELACION.REVISION, porQue: `«${b.documento}» quedó superado: ${sb.porQue}` }
  const ra = rangoDe(a?.clase, dominio)
  const rb = rangoDe(b?.clase, dominio)
  if (ra !== null && rb !== null && ra !== rb) {
    const [g, p] = ra < rb ? [a, b] : [b, a]
    return { gana: g, pierde: p, regla: 'JERARQUIA_DOCUMENTAL', porQue: `en ${dominio} manda ${g.clase} sobre ${p.clase} (${AUTORIDAD[dominio].join(' > ')})` }
  }
  if (ra !== null && ra === rb) {
    const va = rangoDeVista(relaciones?.porNombre?.get(a?.documento)?.vista, dominio)
    const vb = rangoDeVista(relaciones?.porNombre?.get(b?.documento)?.vista, dominio)
    if (va !== null && vb !== null && va !== vb) {
      const [g, p] = va < vb ? [a, b] : [b, a]
      const gv = relaciones.porNombre.get(g.documento).vista
      const pv = relaciones.porNombre.get(p.documento).vista
      return { gana: g, pierde: p, regla: 'VISTA', porQue: `en geometría manda el ${gv} sobre la ${pv}: está dibujado a escala mayor para acotar` }
    }
  }
  return null
}

/**
 * RESOLVER UN GRUPO DE HECHOS QUE NO COINCIDEN. PURA.
 *
 * Devuelve `{ ganadores, desplazadas, reglas }` cuando la jerarquía alcanza, y `null` cuando no.
 * Alcanza sólo si los que quedan arriba coinciden ENTRE SÍ: si el CAD y el plano se contradicen y
 * los dos le ganan a la planilla, no hay nada resuelto — hay un conflicto entre las dos fuentes que
 * más mandan, que es peor.
 */
export function resolverPorJerarquia(lista = [], { dominio, relaciones, coinciden }) {
  const desplazadas = []
  const reglas = []
  let vivos = [...lista]
  for (let paso = 0; paso < lista.length; paso += 1) {
    const perdedor = vivos.find((x) => vivos.some((y) => y !== x && mandaSobre(y, x, { dominio, relaciones })?.pierde === x))
    if (!perdedor) break
    const quien = vivos.find((y) => y !== perdedor && mandaSobre(y, perdedor, { dominio, relaciones })?.pierde === perdedor)
    const r = mandaSobre(quien, perdedor, { dominio, relaciones })
    desplazadas.push({ ...perdedor, desplazadoPor: quien.documento, regla: r.regla, porQue: r.porQue })
    reglas.push(r.regla)
    vivos = vivos.filter((x) => x !== perdedor)
  }
  if (!desplazadas.length) return null
  if (!vivos.every((v) => coinciden(v.valor, vivos[0].valor))) return null
  return { ganadores: vivos, desplazadas, reglas: [...new Set(reglas)] }
}
