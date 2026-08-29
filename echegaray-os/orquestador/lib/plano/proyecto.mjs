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
  // ═══ UN BORRADOR PROPIO NO ES DOCUMENTACIÓN DEL PROYECTO ═══
  // Apareció al abrir los `.docx`: en la carpeta de QUATTROPANI hay «Charlar de diagrama de
  // GANT.docx» y «Diagrama IA.docx» —una nota de trabajo y una salida de un modelo—, y entraban
  // como PLIEGO con confianza alta porque `claseDocumental` devuelve PLIEGO por defecto. Con eso,
  // un apunte interno contradecía al contrato del cliente en igualdad de condiciones. Es el peso más
  // débil de todos a propósito: aporta cuando nadie más dice nada, y no le gana a nadie.
  NOTA_INTERNA: { id: 'NOTA_INTERNA', peso: 7, que: 'una nota de trabajo o un borrador propio, no documentación del proyecto' },
  // ═══ EL NOMBRE NO DIJO NADA, Y ESO NO ES «ES UN PLIEGO» ═══
  // `claseDocumental` devolvía PLIEGO cuando ninguna regla matcheaba, así que un borrador con un
  // nombre que no estuviera en la lista —«Reunión 12-08», «v2 final»— entraba con peso 4 y le
  // ganaba a la planilla del cliente. Un documento que no se pudo identificar aporta cuando nadie
  // más habla y no le gana a ninguna fuente identificada.
  SIN_CLASIFICAR: { id: 'SIN_CLASIFICAR', peso: 8, que: 'un documento cuyo nombre no dice qué es' },
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
  SOLO_MENCIONES: 'SOLO_MENCIONES', // varias frases sueltas dicen cosas distintas y ninguna sabe de qué habla
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
    // ═══ UNA FRASE SUELTA NO CONTRADICE A NADIE ═══
    // Un hecho de confianza BAJA es una frase que no nombró pieza, no declaró alcance y no se dijo
    // universal: es contexto. Trece frases de un pliego que mencionan un método de trabajo caen
    // todas en la misma clave y no son trece fuentes discutiendo — medido sobre Quattropani, eran
    // el 100% del ruido nuevo. Se guardan (pueden completar un dato que falta) y no pueden abrir un
    // conflicto solas: para eso hace falta que al menos una fuente sepa DE QUÉ está hablando.
    const conPeso = orden.filter((h) => h.confianza !== 'baja')
    const debiles = orden.filter((h) => h.confianza === 'baja')
    if (discrepan.length && conPeso.length) {
      const c = {
        que, elemento: principal.elemento, atributo: principal.atributo,
        estado: ESTADO_HECHO.CONFLICTO,
        versiones: conPeso.map((h) => ({ valor: h.valor, unidad: h.unidad, clase: h.clase, documento: h.documento, lamina: h.lamina, textoLiteral: h.textoLiteral })),
        mencionesSueltas: debiles.length,
        // Se listan las fuentes CON PESO, no las trece menciones sueltas: un conflicto que se lee
        // como una pared de repeticiones no se resuelve, se ignora. Las débiles se cuentan aparte.
        porQue: `${conPeso.length} fuente(s) con peso dicen cosas distintas sobre ${principal.atributo}${principal.elemento ? ` de ${principal.elemento}` : ''}: ${[...new Set(conPeso.map((h) => `${h.clase} dice «${h.valor}»`))].join(' · ')}${debiles.length ? ` (+${debiles.length} mención(es) sueltas del mismo atributo: ${[...new Set(debiles.map((h) => h.valor))].join(', ')})` : ''}`,
        quienLoResuelve: 'dirección técnica / proyectista — las dos fuentes están escritas y elegir una en silencio inventa el resultado de una discusión que no ocurrió',
        fuente: FUENTE.FALTA_DATO,
      }
      conflictos.push(c)
      resueltos.push({ ...c, valor: null, unidad: principal.unidad })
      continue
    }
    resueltos.push({
      que, elemento: principal.elemento, atributo: principal.atributo,
      // Si discrepan pero ninguna fuente tiene peso, NO es un hecho consolidado: es un conjunto de
      // menciones sueltas. Se marca como tal para que nadie lo lea como una definición del proyecto.
      estado: discrepan.length ? ESTADO_HECHO.SOLO_MENCIONES : (orden.length > 1 ? ESTADO_HECHO.CONFIRMADO : ESTADO_HECHO.COMPLETADO),
      menciones: discrepan.length ? orden.map((h) => ({ valor: h.valor, documento: h.documento, textoLiteral: h.textoLiteral })) : undefined,
      valor: discrepan.length ? null : principal.valor, unidad: principal.unidad,
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
 * LAS PALABRAS QUE CONVIERTEN UNA FRASE EN UNA REGLA DE TODO EL PROYECTO.
 *
 * MEDIDO Y POR ESO ESTÁ ACÁ: sin esta condición, toda frase que mencionaba un material sin nombrar
 * la pieza caía en el mismo balde `*:material`, y un documento que habla de acero en un renglón y
 * de hormigón en otro se leía como 27 fuentes contradiciéndose consigo mismas. Un documento no se
 * contradice por mencionar dos materiales: se contradice cuando dice DOS VECES qué es LO MISMO.
 *
 * Una frase sin pieza y sin cuantificador no es una especificación general: es contexto, y el
 * contexto no entra al proyecto como hecho.
 */
const CUANTIFICADOR_UNIVERSAL = /\b(todo|toda|todos|todas|en\s+general|generalidad|salvo\s+indicaci|salvo\s+especificaci|la\s+totalidad|para\s+toda\s+la\s+obra)\b/i

/**
 * EL ALCANCE QUE UNA FRASE SE DA A SÍ MISMA, cuando no nombra una pieza. PURA.
 *
 * ═══ POR QUÉ HIZO FALTA AGREGAR ESTO ═══
 *
 * Exigir pieza o cuantificador universal arregló el ruido y ROMPIÓ la cobertura, que es peor: una
 * auditoría midió que se descartaban frases como «El hormigón de los elementos estructurales será
 * H-21» y «Se exige terminación fratasada» —y `terminacion` está en `BLOQUEAN`, o sea que su
 * ausencia impide confirmar una partida—. Los conflictos habían bajado de 67 a 3 EN PARTE POR
 * DEJAR DE MIRAR, que no es lo mismo que por dejar de equivocarse.
 *
 * El arreglo no es volver atrás: es que una frase sin pieza puede igual tener ALCANCE propio
 * —«los elementos estructurales», «los muros exteriores»—, y ese alcance es una clave distinta de
 * `*`. Así la frase entra, y dos frases sobre alcances distintos dejan de chocar entre sí.
 */
const ALCANCES = Object.freeze([
  ['elementos_estructurales', /elementos?\s+estructural|estructura\s+resistente|elementos?\s+portantes?/i],
  ['fundaciones', /fundacion|cimentacion|submuraci/i],
  ['cubierta', /cubierta|techo/i],
  ['contrapisos_y_pisos', /contrapiso|solado|\bpiso/i],
  ['exteriores', /exterior(es)?\b/i],
  ['interiores', /interior(es)?\b/i],
])

/** El alcance declarado por la frase, o null. PURA. */
export function alcanceDe(frase) {
  for (const [nombre, re] of ALCANCES) if (re.test(String(frase ?? ''))) return nombre
  return null
}

/** Los atributos que entran AUNQUE la frase no nombre pieza ni se declare universal, porque su
 *  ausencia BLOQUEA una confirmación de partida: si el pliego los dice, hay que verlos. El
 *  `material` NO está — es el que producía el choque de 27 — y sigue exigiendo pieza o universal. */
const ENTRAN_CON_ALCANCE = Object.freeze(['resistencia', 'espesor_m', 'terminacion', 'metodo', 'ubicacion', 'armadura'])

/**
 * LOS HECHOS TÉCNICOS QUE DICE UN DOCUMENTO DE TEXTO. PURA.
 *
 * Recorre frase por frase; si la frase nombra una PIEZA y declara un atributo, sale un hecho atado a
 * esa pieza. Si NO nombra pieza, sólo sale como regla de proyecto (`*`) cuando la frase se declara
 * universal —«todo el hormigón de la obra será H-30»—; el resto se descarta como contexto.
 */
export function hechosDeTexto(texto, { documento, clase = CLASE_FUENTE.PLIEGO } = {}) {
  const salida = []
  for (const f of frases(texto)) {
    const pieza = piezaDe(f)?.valor ?? null
    const universal = CUANTIFICADOR_UNIVERSAL.test(f)
    const alcance = alcanceDe(f)
    const attr = atributosDe(f)
    for (const k of EXTRAIBLES) {
      const a = attr[k]
      if (!a) continue
      // Tres puertas, de la más fuerte a la más débil, y ninguna es «todo entra»:
      //   1. la frase nombra la PIEZA  → el hecho es de esa pieza;
      //   2. la frase se declara UNIVERSAL → el hecho vale para todo el proyecto;
      //   3. la frase tiene ALCANCE propio y el atributo BLOQUEA una confirmación → el hecho vale
      //      para ese alcance, que es una clave distinta de `*` y no choca con las demás.
      // El ALCANCE le gana al cuantificador universal cuando la frase tiene los dos: «H-30 en la
      // totalidad de los elementos estructurales» y «el hormigón de los elementos estructurales
      // será H-21» hablan de LO MISMO, y si una cae en `*` y la otra en su alcance, la
      // contradicción —que está escrita en el texto— no se detecta nunca.
      const bloqueante = ENTRAN_CON_ALCANCE.includes(k)
      const destino = pieza
        ?? (alcance && (universal || bloqueante) ? alcance
          : universal ? null
            : bloqueante ? null
              : undefined)
      if (destino === undefined) continue
      salida.push(hecho({
        elemento: destino, atributo: k, valor: a.valor, clase, documento,
        textoLiteral: f.slice(0, 200),
        // Una frase con ALCANCE declarado NO es contexto: dice de qué habla, aunque no nombre la
        // pieza. Dejarla en «baja» la volvía incapaz de abrir un conflicto y la contradicción del
        // hormigón estructural (H-21 contra H-30) se perdía igual que antes, con otro mecanismo.
        confianza: pieza ? 'alta' : ((universal || alcance) ? 'media' : 'baja'),
      }))
    }
  }
  return salida.filter(Boolean)
}

/**
 * LOS HECHOS QUE APORTA UN CAD. PURA.
 *
 * ═══ UNA COTA NO ES UN HECHO CONSOLIDABLE, Y CONFUNDIRLO SALE CARO ═══
 *
 * La primera versión metía las 966 cotas del DWG de Quattropani como hechos, con la coordenada
 * redondeada por clave. Resultado medido: 67 CONFLICTOS FALSOS, porque dos cotas de dibujos
 * distintos que caen en coordenadas cercanas se leían como dos fuentes contradiciéndose sobre la
 * misma cosa. Y como un conflicto bloquea la cotización, el ruido tapaba los conflictos de verdad.
 *
 * Una cota es EVIDENCIA de una medida en un lugar, no una afirmación sobre el atributo de un
 * elemento con nombre. Vive en `medicion.cotas` y la usa la etapa de medición para resolver
 * dimensiones; acá no entra.
 *
 * Lo que SÍ es un hecho del proyecto:
 *   · la UNIDAD de dibujo declarada — sin ella ninguna longitud se puede llamar metro;
 *   · CUÁNTOS hay de cada bloque insertado, que es la pregunta más cara de todo el cómputo y la
 *     única fuente que la contesta sin contar símbolos a ojo. Y si dos CAD dicen cantidades
 *     distintas del mismo bloque, ESO sí es un conflicto que hay que ver.
 */
export function hechosDeCad(medicion, { documento } = {}) {
  const salida = []
  if (medicion?.unidadDibujo) {
    salida.push(hecho({ atributo: 'unidad_dibujo', valor: medicion.unidadDibujo, clase: CLASE_FUENTE.CAD, documento, textoLiteral: `$INSUNITS = ${medicion.unidadDibujo}`, confianza: 'alta' }))
  }
  for (const b of medicion?.bloques ?? []) {
    if (!b?.bloque || !(b.cantidad > 0)) continue
    // Los bloques anónimos de AutoCAD (`*U22`, `*D3`) no son piezas del proyecto: son geometría
    // agrupada por el editor. Contarlos como cantidades produce partidas que no existen.
    // `*U22` son bloques anónimos del editor; `_Dot`, `_Oblique`, `_OPEN90` son las puntas de
    // flecha y los símbolos de acotación que AutoCAD trae de fábrica. Ni unos ni otros son piezas
    // del proyecto, y contarlos produce «4 unidades de _Dot» adentro de un presupuesto.
    // `*U22` y `A$C051ae63b` son bloques anónimos del editor —AutoCAD usa los dos prefijos según
    // la versión—; `_Dot`, `_Oblique` y `_OPEN90` son las puntas de flecha y los símbolos de
    // acotación que trae de fábrica. Ninguno es una pieza del proyecto, y contarlos produce «4
    // unidades de _Dot» adentro de un presupuesto. El `A$C` lo destapó el segundo proyecto: salía
    // como un conflicto entre tres CAD sobre un bloque que no existe para la obra.
    if (/^([*_]|A\$)/i.test(b.bloque)) continue
    salida.push(hecho({
      elemento: b.bloque, atributo: 'cantidad_insertada', valor: b.cantidad, unidad: 'un',
      clase: CLASE_FUENTE.CAD, documento,
      textoLiteral: `${b.cantidad} inserción(es) del bloque «${b.bloque}»${b.capas?.length ? ` en ${b.capas.join(', ')}` : ''}`,
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
