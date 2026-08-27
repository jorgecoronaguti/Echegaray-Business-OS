// DEL ELEMENTO COMPUTADO A LA PARTIDA DE LA BASE MAESTRA. Puro.
//
// ═══ POR QUÉ EL MATCHEO NO LO DECIDE UN MODELO ═══
//
// Elegir la partida es elegir el precio. Un modelo que mapea «columna metálica» a
// «COLUMNA DE CARGA H17» —las dos dicen columna— cotiza hormigón donde hay acero, y el error no se
// ve: sale un número redondo, con su APU y su respaldo. Por eso el candidato lo produce el código
// con reglas que se pueden leer, y el modelo, si interviene, sólo ELIGE ENTRE candidatos que ya
// existen. Nunca inventa una partida ni la crea.
//
// ═══ LAS TRES CERRADURAS ═══
//
// 1. **LA UNIDAD MANDA.** Un cómputo en m³ no puede ir a una partida en m². No es una preferencia:
//    multiplicar m³ por un precio por m² da un número sin significado. Unidad incompatible = no es
//    candidata, por más que el nombre coincida entero.
// 2. **EL SISTEMA CONSTRUCTIVO SEPARA.** `estructura_metalica` y `hormigon_armado` comparten casi
//    todo el vocabulario (columna, viga, base). Los términos que delatan el material valen negativo
//    cuando contradicen el sistema del elemento: eso es lo que impide el cruce de arriba.
// 3. **LA DUDA NO SE RESUELVE SOLA.** Si el primer candidato no le saca distancia al segundo, no
//    hay match: sale `PARTIDA_CANDIDATA` con los dos a la vista. Forzar un empate es la forma
//    silenciosa de contaminar la Base Maestra para que un proyecto pase.

import { SISTEMA } from './interpretar.mjs'
import { FUENTE } from './fuente.mjs'

/** Unidades del cómputo → unidades como las escribe la Base Maestra. `ml`, `ML` y `m` son la misma
 *  cosa en la planilla histórica; `un`, `UN` y `GL` no lo son y no se mezclan. */
const EQUIVALENTES = Object.freeze({
  m3: ['m3', 'M3'],
  m2: ['m2', 'M2'],
  m: ['m', 'M', 'ml', 'ML'],
  un: ['un', 'UN'],
})

/** ¿La unidad del cómputo sirve para esta partida? PURA. */
export function unidadCompatible(unidadComputo, unidadPartida) {
  const eq = EQUIVALENTES[String(unidadComputo ?? '').toLowerCase()]
  if (!eq) return false
  return eq.includes(String(unidadPartida ?? '').trim())
}

const RUIDO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'en', 'a', 'por', 'e', 'kg', 'm3', 'm2', 'ml', 'un', 'gl', 'hr'])

/** Palabras significativas, sin tildes ni signos. La misma normalización que usa el resto del OS
 *  para comparar texto humano. PURA. */
export function palabras(t) {
  return String(t ?? '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2 && !RUIDO.has(w))
}

/** Términos que DELATAN el material. Si aparecen en la partida y contradicen el sistema del
 *  elemento, restan: son justamente los que producen el cruce hormigón ↔ metal. */
const DELATORES = Object.freeze({
  [SISTEMA.HORMIGON_ARMADO]: { suman: ['hormigon', 'h17', 'h21', 'armado', 'estribos', 'hierro'], restan: ['metalica', 'metalico', 'chapa', 'cano', 'perfil', 'cercha', 'panel'] },
  [SISTEMA.METALICA]: { suman: ['metalica', 'metalico', 'cercha', 'cano', 'perfil', 'columnas'], restan: ['hormigon', 'h17', 'h21', 'ladrillon', 'mamposteria', 'revoque'] },
  [SISTEMA.MAMPOSTERIA]: { suman: ['mamposteria', 'ladrillon', 'block', 'muro'], restan: ['metalica', 'hormigon', 'chapa'] },
  [SISTEMA.CUBIERTA]: { suman: ['techo', 'cubierta', 'chapa', 'panel'], restan: ['hormigon', 'piso', 'mamposteria'] },
  [SISTEMA.PISO]: { suman: ['piso', 'contrapiso', 'platea', 'carpeta', 'fratazado'], restan: ['techo', 'cubierta', 'mamposteria'] },
  [SISTEMA.MOVIMIENTO_SUELO]: { suman: ['excavacion', 'excavaciones', 'relleno', 'compactacion', 'nivelacion', 'replanteo'], restan: ['hormigon', 'metalica', 'pintura'] },
  [SISTEMA.CARPINTERIA]: { suman: ['puerta', 'ventana', 'porton', 'banderola', 'persiana', 'aluminio', 'blindex'], restan: ['hormigon', 'excavacion'] },
  [SISTEMA.TERMINACION]: { suman: ['revoque', 'pintura', 'cielorraso', 'zocalo', 'limpieza', 'revestimiento'], restan: ['excavacion', 'fundacion'] },
  [SISTEMA.INSTALACION]: { suman: ['instalacion', 'electrica', 'sanitaria', 'gas', 'incendio', 'luminaria'], restan: ['hormigon', 'mamposteria'] },
})

/** El puntaje de una partida para un elemento: solapamiento de vocabulario ± los delatores del
 *  sistema. No pretende ser una métrica fina — pretende ser AUDITABLE. PURA. */
export function puntaje(elemento, tarea) {
  const pe = new Set([...palabras(elemento?.nombre), ...palabras(elemento?.material), ...palabras(elemento?.especificacion)])
  const pt = palabras(tarea?.nombre)
  if (!pt.length || !pe.size) return 0
  const comunes = pt.filter((w) => pe.has(w)).length
  let s = comunes / Math.max(pt.length, 1) + comunes * 0.35
  const d = DELATORES[elemento?.sistema]
  if (d) {
    for (const w of pt) {
      if (d.suman.includes(w)) s += 0.5
      if (d.restan.includes(w)) s -= 1.2
    }
  }
  return Math.round(s * 1000) / 1000
}

const UMBRAL = 0.9
const DISTANCIA = 0.25

/**
 * LA PARTIDA DE UN CÓMPUTO. Devuelve siempre algo: cuando no hay match sale
 * `PARTIDA_CANDIDATA` con los candidatos que sí existían, para que la decisión sea de una persona
 * y quede escrita — no para que desaparezca del presupuesto.
 */
export function mapearPartida(computo, tareaTipos = []) {
  const compatibles = tareaTipos
    .filter((t) => unidadCompatible(computo?.unidad, t.unidad))
    .map((t) => ({ tarea: t, puntaje: puntaje(computo, t) }))
    // El umbral de INCLUSIÓN es más bajo que el de decisión a propósito: acá se arma la lista que
    // después mira el criterio técnico, y una candidata que el vocabulario castiga puede ser la
    // correcta. Dejarla afuera le sacaría al elector la única opción buena.
    .filter((c) => c.puntaje > -0.6)
    .sort((a, b) => b.puntaje - a.puntaje)

  const top = compatibles[0]
  const segundo = compatibles[1]
  const decidido = Boolean(top) && top.puntaje >= UMBRAL && (!segundo || top.puntaje - segundo.puntaje >= DISTANCIA)

  const candidatos = compatibles.slice(0, 6).map((c) => ({ id: c.tarea.id, codigo: c.tarea.codigo, nombre: c.tarea.nombre, unidad: c.tarea.unidad, puntaje: c.puntaje }))
  if (!decidido) {
    return {
      estado: 'PARTIDA_CANDIDATA',
      elemento: computo?.id ?? null,
      tarea: null,
      candidatos,
      porQue: !top
        ? `no hay ninguna tarea de la Base Maestra en ${computo?.unidad ?? 'esa unidad'} que comparta vocabulario con «${computo?.nombre}»`
        : top.puntaje < UMBRAL
          ? `el mejor candidato (${top.tarea.codigo}) apenas se parece — ${top.puntaje} sobre ${UMBRAL} exigido`
          : `«${top.tarea.codigo}» y «${segundo.tarea.codigo}» empatan (${top.puntaje} vs ${segundo.puntaje}): la diferencia la tiene que decidir una persona`,
      fuente: FUENTE.FALTA_DATO,
    }
  }
  return {
    estado: 'MAPEADA',
    elemento: computo?.id ?? null,
    tarea: { id: top.tarea.id, codigo: top.tarea.codigo, nombre: top.tarea.nombre, unidad: top.tarea.unidad },
    candidatos,
    porQue: `vocabulario y unidad coinciden (${top.puntaje}${segundo ? `, el siguiente queda en ${segundo.puntaje}` : ', sin competencia'})`,
    fuente: FUENTE.BASE_MAESTRA,
  }
}

/** El mapeo de todos los cómputos, con el recuento de cobertura. */
export function mapearPartidas(computos = [], tareaTipos = []) {
  const mapeos = computos.filter((c) => c.cantidad !== null).map((c) => ({ computo: c, ...mapearPartida(c, tareaTipos) }))
  return {
    mapeos,
    mapeadas: mapeos.filter((m) => m.estado === 'MAPEADA').length,
    candidatas: mapeos.filter((m) => m.estado === 'PARTIDA_CANDIDATA').length,
  }
}
