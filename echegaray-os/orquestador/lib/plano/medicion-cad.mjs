// EL CAD MIDE LO QUE LA VISTA NO PUDO. Puro, determinístico, 0 tokens.
//
// ═══ QUÉ RESUELVE Y QUÉ NO ═══
//
// Un modelo mirando un plano dice «hay correas C140» y muchas veces no puede decir CUÁNTAS: los
// símbolos se superponen, la cadena de cotas se corta, la vista está a otra escala. El CAD sí lo
// sabe con exactitud, porque cada copia es un INSERT y contarlos es un `group by`.
//
// Lo que este módulo hace es UNA cosa y bien: cuando un elemento quedó sin cantidad y el CAD tiene
// un bloque que es ESE elemento, se toma la cuenta del CAD, con su nombre de bloque, su capa y su
// archivo como evidencia.
//
// ═══ LO QUE NO HACE, A PROPÓSITO ═══
//
// NO adivina largos con las cotas. Hay 966 cotas en el DWG de Quattropani y ninguna dice a qué
// elemento pertenece: emparejar «la cota de 18,30» con «la correa» porque los dos números quedan
// cerca es exactamente la clase de inferencia que produce un cómputo que parece bien y está mal.
// Las cotas quedan disponibles como evidencia para que una persona las use, y se dice cuántas hay.
//
// ═══ LA CERRADURA ═══
//
// El emparejamiento exige que el nombre del bloque y el del elemento compartan una MARCA —el código
// que el proyectista le puso: C1, CE1, K1, VF— o el tipo de pieza más un material coincidente. Un
// bloque llamado «Inodoro» no puede resolver la cantidad de «Columna C1» por más que las dos cosas
// se cuenten en unidades.

import { piezaDe, materialDe, raiz } from './atributos.mjs'
import { FUENTE, dato, evidencia } from './fuente.mjs'

/** Las marcas que un proyectista le pone a una pieza: una o dos letras y un número, opcionalmente
 *  con sufijo. «C1», «CE1», «2K1», «VF», «B0», «CM1». PURA. */
export function marcasDe(texto) {
  const t = String(texto ?? '').toUpperCase()
  return [...new Set((t.match(/\b\d?[A-Z]{1,3}-?\d{1,3}[A-Z]?\b/g) ?? []).filter((m) => /\d/.test(m) && m.length <= 6))]
}

/** Normalizar un nombre para comparar: sin tildes, sin signos, en minúsculas y por raíz. PURA. */
const palabras = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 2).map(raiz)

/**
 * ¿ESTE BLOQUE DEL CAD ES ESTE ELEMENTO? PURA.
 *
 * Dos caminos y ninguno flojo:
 *  · MARCA COMPARTIDA — el bloque se llama «C1» y el elemento también. Es la señal más fuerte que
 *    existe en un plano: la marca la puso el proyectista para nombrar esa pieza y nada más.
 *  · PIEZA + VOCABULARIO — los dos son correas y comparten alguna palabra. Más débil, y por eso
 *    exige que el TIPO DE PIEZA coincida: sin eso, «Escalera» resolvería la cantidad de «Escalón».
 */
export function esElMismo(elemento, bloque) {
  const nombreE = `${elemento?.id ?? ''} ${elemento?.nombre ?? ''}`
  const marcasE = marcasDe(nombreE)
  const marcasB = marcasDe(bloque?.bloque)
  const comunes = marcasE.filter((m) => marcasB.includes(m))
  if (comunes.length) return { es: true, porQue: `el bloque y el elemento comparten la marca «${comunes[0]}», que es como el proyectista nombra esa pieza`, via: 'MARCA' }

  const pE = piezaDe(nombreE)?.valor ?? null
  const pB = piezaDe(bloque?.bloque)?.valor ?? null
  if (!pE || !pB || pE !== pB) return { es: false, porQue: pE && pB ? `el elemento es ${pE} y el bloque es ${pB}` : 'no se puede saber qué pieza es el bloque' }
  const vE = new Set(palabras(nombreE))
  const compartidas = palabras(bloque?.bloque).filter((w) => vE.has(w))
  if (!compartidas.length) return { es: false, porQue: `los dos son ${pE} pero no comparten ninguna palabra` }
  const mE = materialDe(nombreE)?.valor ?? null
  const mB = materialDe(bloque?.bloque)?.valor ?? null
  if (mE && mB && mE !== mB) return { es: false, porQue: `los dos son ${pE} pero uno es ${mE} y el otro ${mB}` }
  return { es: true, porQue: `los dos son ${pE} y comparten «${compartidas[0]}»`, via: 'PIEZA' }
}

/**
 * RESOLVER CANTIDADES CON EL CAD. PURA.
 *
 * `elementos` son los que salieron de la interpretación; `cad` es la lista de mediciones (una por
 * archivo CAD). Devuelve los elementos con la repetición completada donde el CAD la sabía, y el
 * detalle de qué se resolvió y de dónde salió.
 *
 * Un elemento que YA tenía cantidad no se toca: el CAD no le gana a lo que el proyectista escribió
 * en la vista, sólo llena lo que faltaba.
 */
export function resolverConCad(elementos = [], cad = []) {
  const bloques = []
  for (const c of cad) {
    for (const b of c?.medicion?.bloques ?? []) {
      if (!b?.bloque || !(b.cantidad > 0) || /^[*_]/.test(b.bloque)) continue
      bloques.push({ ...b, archivo: c.archivo })
    }
  }
  const resueltos = []
  const ambiguos = []
  const salida = elementos.map((e) => {
    const yaTiene = e?.repeticion?.cantidad !== null && e?.repeticion?.cantidad !== undefined
    if (yaTiene) return e
    const candidatos = bloques.map((b) => ({ b, ...esElMismo(e, b) })).filter((x) => x.es)
    if (!candidatos.length) return e
    if (candidatos.length > 1) {
      // Dos bloques distintos que dicen ser el mismo elemento no se promedian ni se elige el mayor.
      ambiguos.push({ elemento: e.id, candidatos: candidatos.map((x) => `${x.b.bloque}=${x.b.cantidad} (${x.b.archivo})`), porQue: 'más de un bloque del CAD dice ser este elemento, con cantidades distintas' })
      const iguales = new Set(candidatos.map((x) => x.b.cantidad))
      if (iguales.size > 1) return e
    }
    const g = candidatos[0]
    resueltos.push({ elemento: e.id, cantidad: g.b.cantidad, bloque: g.b.bloque, archivo: g.b.archivo, via: g.via, porQue: g.porQue })
    return {
      ...e,
      repeticion: {
        ...(e.repeticion ?? {}),
        modo: 'conteo_cad',
        cantidad: dato({
          valor: g.b.cantidad, unidad: 'un', fuente: FUENTE.EXTRAIDO_PLANO,
          evidencia: evidencia({
            archivo: g.b.archivo,
            textoLiteral: `${g.b.cantidad} inserción(es) del bloque «${g.b.bloque}»${g.b.capas?.length ? ` en la(s) capa(s) ${g.b.capas.join(', ')}` : ''}`,
            ubicacion: g.b.capas?.[0] ?? null,
          }),
          nota: g.porQue,
        }),
        textoLiteral: `bloque «${g.b.bloque}» × ${g.b.cantidad} en ${g.b.archivo}`,
      },
    }
  })
  return {
    elementos: salida,
    resueltos,
    ambiguos,
    bloquesDisponibles: bloques.length,
    // Las cotas quedan CONTADAS y no usadas: 966 medidas que ninguna dice a qué elemento pertenecen.
    cotas: cad.reduce((a, c) => a + (c?.medicion?.cotas?.length ?? 0), 0),
    porQueLasCotasNoSeUsan: 'una cota del CAD no dice a qué elemento pertenece; emparejarla por cercanía produce un cómputo que parece bien y está mal. Quedan como evidencia para que las use una persona',
  }
}
