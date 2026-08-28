// UN PROYECTO, NO SIETE ARCHIVOS. Puro.
//
// ═══ EL PROBLEMA QUE ESTE ARCHIVO EXISTE PARA RESOLVER ═══
//
// La carpeta del cliente trae el plano de arquitectura, el de estructura, el DWG del calculista, el
// pliego, la memoria descriptiva y un Excel con el cómputo que alguien empezó. Analizar cada uno
// por separado produce seis lecturas correctas y una cotización mal: el plano no dice la resistencia
// del hormigón, la memoria sí, y si nunca se cruzan el elemento queda sin especificar y sale como
// FALTA_DATO estando perfectamente definido en el documento de al lado.
//
// ═══ COMPLETAR NO ES LO MISMO QUE CONTRADECIR ═══
//
// Y ésa es la única regla difícil de todo el módulo:
//
//   · el plano NO dice resistencia + la memoria dice H-25  → H-25, respaldado por la MEMORIA.
//     Una fuente completó a otra. No hay nada que decidir y nada que avisar.
//   · el plano dice H-21 + la memoria dice H-25            → CONFLICTO. Las dos fuentes son
//     legítimas, las dos están escritas, y elegir una en silencio es inventar el resultado de una
//     discusión que todavía no ocurrió. Sale con las dos versiones y con quién la resuelve.
//
// Un sistema que resuelve el conflicto solo es peor que uno que no lo detecta, porque el segundo
// al menos deja el error a la vista.
//
// ═══ QUÉ NO HACE ═══
//
// No lee archivos, no llama a nadie y no decide precios: recibe hechos ya extraídos —del plano, del
// CAD, del pliego— y los consolida. Quién los extrae es problema de la ingesta.

import { atributosDe, piezaDe } from './atributos.mjs'
import { FUENTE } from './fuente.mjs'

/**
 * DE QUÉ CLASE DE DOCUMENTO SALE UN HECHO, y cuánto pesa cuando dos se contradicen.
 *
 * El orden no es arbitrario: el CAD es la geometría que dibujó el proyectista con coordenadas
 * exactas; el plano es esa misma geometría impresa y acotada; la memoria de cálculo es donde el
 * calculista escribe lo que el dibujo no puede mostrar (resistencias, cuantías); el pliego es
 * contractual y puede ser más viejo que todo lo demás; la planilla del cliente es un insumo.
 *
 * PERO EL PESO NO RESUELVE EL CONFLICTO. Sirve para ordenar la lista y para saber a quién
 * preguntarle primero. Dos números distintos siguen siendo dos números distintos.
 */
export const CLASE_FUENTE = Object.freeze({
  CAD: { id: 'CAD', peso: 1, que: 'la geometría dibujada, con coordenadas' },
  PLANO: { id: 'PLANO', peso: 2, que: 'la lámina acotada' },
  MEMORIA: { id: 'MEMORIA', peso: 3, que: 'la memoria de cálculo o descriptiva' },
  PLIEGO: { id: 'PLIEGO', peso: 4, que: 'el pliego de especificaciones' },
  PLANILLA: { id: 'PLANILLA', peso: 5, que: 'una planilla o cómputo entregado' },
  REFERENCIA: { id: 'REFERENCIA', peso: 6, que: 'una referencia externa (CIRCOT, norma, web)' },
})

const PESOS = Object.freeze(Object.fromEntries(Object.values(CLASE_FUENTE).map((c) => [c.id, c.peso])))

/**
 * UN HECHO TÉCNICO CON SU PROCEDENCIA. PURA.
 *
 * `que` es la clave que se consolida: `elemento:atributo`. Sin `textoLiteral` el hecho no entra —
 * la regla es la misma que en `fuente.mjs` y por el mismo motivo: una afirmación que no se puede
 * citar no se puede contrastar, y un conflicto entre dos cosas que nadie puede releer no se puede
 * resolver.
 */
export function hecho({ elemento = null, atributo, valor, unidad = null, clase, documento, lamina = null, textoLiteral, confianza = 'media' } = {}) {
  if (!atributo || valor === null || valor === undefined || !textoLiteral || !documento) return null
  const id = String(clase?.id ?? clase ?? 'REFERENCIA')
  return Object.freeze({
    que: `${elemento ?? '*'}:${atributo}`,
    elemento, atributo, valor, unidad,
    clase: id, peso: PESOS[id] ?? 9,
    documento, lamina,
    textoLiteral: String(textoLiteral).slice(0, 240),
    confianza,
  })
}

/** ¿Dos valores del mismo atributo dicen lo mismo? Los numéricos con tolerancia relativa —una cota
 *  de 6,000111 y una de 6,00 son la misma cota—, el resto por texto normalizado. PURA. */
export function mismoValor(a, b, { tolerancia = 0.002 } = {}) {
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    const escala = Math.max(Math.abs(na), Math.abs(nb), 1e-9)
    return Math.abs(na - nb) / escala <= tolerancia
  }
  const t = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  return t(a) === t(b)
}

export const ESTADO_HECHO = Object.freeze({
  CONFIRMADO: 'CONFIRMADO',   // varias fuentes y todas de acuerdo
  COMPLETADO: 'COMPLETADO',   // lo aporta una sola fuente y nadie la contradice
  CONFLICTO: 'CONFLICTO',     // dos fuentes legítimas dicen cosas distintas
})

/**
 * CONSOLIDAR LOS HECHOS DE TODO EL PROYECTO. PURA.
 *
 * Agrupa por `elemento:atributo` y decide UNA de tres cosas por grupo. El orden de salida es total
 * —por clave— para que dos corridas produzcan la misma lista y los conflictos se puedan comparar
 * entre versiones del proyecto.
 */
export function consolidar(hechos = []) {
  const grupos = new Map()
  for (const h of hechos) {
    if (!h) continue
    const g = grupos.get(h.que) ?? []
    g.push(h)
    grupos.set(h.que, g)
  }
  const resueltos = []
  const conflictos = []
  for (const [que, lista] of [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    // El desempate por documento y texto hace que el «principal» sea el mismo en toda corrida.
    const orden = [...lista].sort((a, b) => a.peso - b.peso || String(a.documento).localeCompare(String(b.documento)) || String(a.textoLiteral).localeCompare(String(b.textoLiteral)))
    const principal = orden[0]
    const discrepan = orden.filter((h) => !mismoValor(h.valor, principal.valor))
    if (discrepan.length) {
      const c = {
        que, elemento: principal.elemento, atributo: principal.atributo,
        estado: ESTADO_HECHO.CONFLICTO,
        versiones: orden.map((h) => ({ valor: h.valor, unidad: h.unidad, clase: h.clase, documento: h.documento, lamina: h.lamina, textoLiteral: h.textoLiteral })),
        porQue: `${orden.length} fuentes dicen cosas distintas sobre ${principal.atributo}${principal.elemento ? ` de ${principal.elemento}` : ''}: ${orden.map((h) => `${h.clase} dice «${h.valor}»`).join(' · ')}`,
        quienLoResuelve: 'dirección técnica / proyectista — las dos fuentes están escritas y elegir una en silencio inventa el resultado de una discusión que no ocurrió',
        fuente: FUENTE.FALTA_DATO,
      }
      conflictos.push(c)
      resueltos.push({ ...c, valor: null, unidad: principal.unidad })
      continue
    }
    resueltos.push({
      que, elemento: principal.elemento, atributo: principal.atributo,
      estado: orden.length > 1 ? ESTADO_HECHO.CONFIRMADO : ESTADO_HECHO.COMPLETADO,
      valor: principal.valor, unidad: principal.unidad,
      clase: principal.clase, documento: principal.documento, lamina: principal.lamina,
      textoLiteral: principal.textoLiteral,
      respaldo: orden.map((h) => `${h.clase}:${h.documento}`),
      porQue: orden.length > 1
        ? `${orden.length} fuentes coinciden (${[...new Set(orden.map((h) => h.clase))].join(', ')})`
        : `lo dice ${principal.clase} («${principal.documento}») y ninguna otra fuente lo contradice`,
    })
  }
  return { hechos: resueltos, conflictos, total: resueltos.length }
}

/** Las frases de un documento. Un pliego separa por punto y por renglón, y una especificación casi
 *  nunca cruza un punto: cortar así evita mezclar el hormigón de las bases con el de las losas. PURA. */
export function frases(texto) {
  return String(texto ?? '')
    .split(/[.;\n\r]+/)
    .map((f) => f.replace(/\s+/g, ' ').trim())
    .filter((f) => f.length > 8)
}

/** Los atributos que vale la pena extraer de un documento de texto. La geometría NO está: un pliego
 *  no acota, y leer «0,20» de una frase sin saber a qué elemento pertenece produce dimensiones
 *  sueltas que después alguien cuelga del elemento equivocado. */
const EXTRAIBLES = Object.freeze(['resistencia', 'material', 'espesor_m', 'terminacion', 'metodo', 'ubicacion', 'armadura'])

/**
 * LOS HECHOS TÉCNICOS QUE DICE UN DOCUMENTO DE TEXTO. PURA.
 *
 * Recorre frase por frase; si la frase nombra una PIEZA y declara un atributo, sale un hecho atado a
 * esa pieza. Si declara un atributo sin nombrar pieza, sale atado a `*` —vale para todo el proyecto,
 * que es exactamente lo que significa «el hormigón será H-21 en toda la obra»—.
 */
export function hechosDeTexto(texto, { documento, clase = CLASE_FUENTE.PLIEGO } = {}) {
  const salida = []
  for (const f of frases(texto)) {
    const pieza = piezaDe(f)?.valor ?? null
    const attr = atributosDe(f)
    for (const k of EXTRAIBLES) {
      const a = attr[k]
      if (!a) continue
      salida.push(hecho({ elemento: pieza, atributo: k, valor: a.valor, clase, documento, textoLiteral: f.slice(0, 200), confianza: pieza ? 'alta' : 'media' }))
    }
  }
  return salida.filter(Boolean)
}

/**
 * LOS HECHOS QUE APORTA UN CAD. PURA.
 *
 * Un DXF no dice «la viga es H-21»: dice que hay 966 cotas, 66 capas y 31 bloques. Lo que aporta al
 * proyecto documental son DOS cosas que ningún otro documento tiene: la UNIDAD de dibujo declarada
 * —sin la cual ninguna longitud se puede llamar metro— y las MEDIDAS ACOTADAS, que son las únicas
 * dimensiones del proyecto que escribió una persona a propósito.
 */
export function hechosDeCad(medicion, { documento } = {}) {
  const salida = []
  if (medicion?.unidadDibujo) {
    salida.push(hecho({ atributo: 'unidad_dibujo', valor: medicion.unidadDibujo, clase: CLASE_FUENTE.CAD, documento, textoLiteral: `$INSUNITS = ${medicion.unidadDibujo}`, confianza: 'alta' }))
  }
  for (const c of medicion?.cotas ?? []) {
    if (c.medida_m === null || c.medida_m === undefined) continue
    salida.push(hecho({
      elemento: null, atributo: `cota@${Math.round(c.x ?? 0)},${Math.round(c.y ?? 0)}`,
      valor: c.medida_m, unidad: 'm', clase: CLASE_FUENTE.CAD, documento,
      textoLiteral: c.texto ? `cota con texto «${c.texto}»` : `cota medida ${c.medida_m} m en capa ${c.capa ?? '0'}`,
      confianza: 'alta',
    }))
  }
  return salida.filter(Boolean)
}

/**
 * EL PROYECTO ENTERO, CONSOLIDADO. PURA.
 *
 * Es la representación canónica que faltaba: un solo objeto donde el plano, el CAD, el pliego y la
 * memoria ya se cruzaron, con los conflictos afuera y visibles.
 */
export function armarProyecto({ documentos = [], hechos = [], laminas = [], cad = [] } = {}) {
  const c = consolidar(hechos)
  const porClase = {}
  for (const h of hechos) if (h) porClase[h.clase] = (porClase[h.clase] ?? 0) + 1
  return {
    documentos: documentos.length,
    laminas: laminas.length,
    cad: cad.length,
    hechos: c.hechos,
    conflictos: c.conflictos,
    porClase,
    resumen: `${c.total} hechos técnicos de ${Object.keys(porClase).length} clase(s) de documento · ${c.conflictos.length} conflicto(s) sin resolver`,
  }
}

/** Los hechos que aplican a UN elemento: los suyos y los que valen para todo el proyecto. PURA.
 *  El propio del elemento gana sobre el general, que es lo que significa una excepción escrita. */
export function hechosDe(proyecto, elemento) {
  const propios = (proyecto?.hechos ?? []).filter((h) => h.elemento === elemento)
  const generales = (proyecto?.hechos ?? []).filter((h) => h.elemento === null || h.elemento === '*')
  const vistos = new Set(propios.map((h) => h.atributo))
  return [...propios, ...generales.filter((h) => !vistos.has(h.atributo))]
}
