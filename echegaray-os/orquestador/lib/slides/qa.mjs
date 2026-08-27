// EL CONTROL DE CALIDAD QUE CORRE ANTES DE QUE LA PRESENTACIÓN EXISTA.
//
// ═══ POR QUÉ ANTES Y NO DESPUÉS ═══
//
// Mirar el PDF exportado es la prueba final y no se negocia (la hace `motor.mjs` con las
// miniaturas que renderiza Google). Pero cuando el PDF muestra el defecto, la presentación YA
// está en Drive y ya tiene link. Este módulo mide sobre las cajas —geometría y texto, sin API— y
// deja que el motor corrija antes de escribir nada.
//
// Un control nunca se valida contra la misma información que produce: por eso son DOS controles
// distintos. Éste mira las medidas que el motor calculó; el del PDF mira los píxeles que dibujó
// Google. Si los dos dicen que está bien, están de acuerdo dos fuentes independientes.
//
// PURO.

import { CONTENIDO, COLOR, MARGEN, PAGINA, contraste } from './marca.mjs'
import { medirBullets, medirTexto, seSuperponen } from './layout.mjs'

export const SEVERIDAD = { BLOQUEANTE: 'bloqueante', AVISO: 'aviso' }

const TOLERANCIA = 1.5     // pt: un texto que sobra medio punto no es un defecto, es la medición
const CONTRASTE_MINIMO = 4.5
const CONTRASTE_MINIMO_GRANDE = 3.0   // WCAG: a partir de 18 pt en negrita alcanza 3:1
const BULLETS_MAXIMO = 7
const CARACTERES_MAXIMO = 460

/** Alto real que va a ocupar el contenido de una caja de texto o de bullets. PURA. */
export function altoReal(c) {
  if (c.tipo === 'texto') return medirTexto(c.contenido, { ancho: c.ancho, tamano: c.estilo.tamano, alto: c.estilo.alto, negrita: c.estilo.negrita }).altoPt
  if (c.tipo === 'bullets') return medirBullets(c.items, { ancho: c.ancho, tamano: c.estilo.tamano, alto: c.estilo.alto, negrita: c.estilo.negrita }).altoPt
  return c.alto
}

/** El color que va a quedar DETRÁS de una caja: el último rectángulo de fondo que la contiene, o
 *  el fondo de la lámina. Es lo que hace verificable el contraste sin abrir la presentación. PURA. */
export function fondoDetras(caja, lamina) {
  let fondo = lamina.fondo || COLOR.papel
  for (const r of lamina.cajas) {
    if (r === caja || r.tipo !== 'rect' || !r.relleno) continue
    const contiene = r.x <= caja.x + 1 && r.y <= caja.y + 1
      && r.x + r.ancho >= caja.x + caja.ancho - 1 && r.y + r.alto >= caja.y + caja.alto - 1
    if (contiene) fondo = r.relleno
  }
  return fondo
}

function hallazgo(severidad, tipo, lamina, detalle, extra = {}) {
  return { severidad, tipo, lamina: lamina.numero, nombre: lamina.nombre, detalle, ...extra }
}

/** Revisa UNA lámina compuesta. Devuelve la lista de hallazgos, vacía si está bien. PURA. */
export function revisarLamina(lamina) {
  const out = []
  const textos = lamina.cajas.filter((c) => c.tipo === 'texto' || c.tipo === 'bullets')

  for (const c of textos) {
    const alto = altoReal(c)
    if (alto > c.alto + TOLERANCIA) {
      out.push(hallazgo(SEVERIDAD.BLOQUEANTE, 'desborde', lamina,
        `«${(c.contenido || c.items?.join(' · ') || '').slice(0, 60)}…» necesita ${alto.toFixed(0)} pt y tiene ${c.alto.toFixed(0)}`,
        { caja: c.id, falta: Number((alto - c.alto).toFixed(1)) }))
    }
    const fondo = fondoDetras(c, lamina)
    const ratio = contraste(c.estilo.color, fondo)
    const minimo = c.estilo.tamano >= 18 && c.estilo.negrita ? CONTRASTE_MINIMO_GRANDE : CONTRASTE_MINIMO
    if (ratio < minimo) {
      out.push(hallazgo(SEVERIDAD.BLOQUEANTE, 'contraste', lamina,
        `texto ${c.estilo.color} sobre ${fondo}: ${ratio.toFixed(2)}:1, mínimo ${minimo}:1`, { caja: c.id }))
    }
  }

  for (const c of lamina.cajas) {
    if (c.x < -0.5 || c.y < -0.5 || c.x + c.ancho > PAGINA.ancho + 0.5 || c.y + c.alto > PAGINA.alto + 0.5) {
      out.push(hallazgo(SEVERIDAD.BLOQUEANTE, 'fuera_de_lamina', lamina,
        `${c.tipo} en (${c.x.toFixed(0)},${c.y.toFixed(0)}) ${c.ancho.toFixed(0)}×${c.alto.toFixed(0)} se sale de ${PAGINA.ancho}×${PAGINA.alto}`, { caja: c.id }))
    }
    if (c.capa === 'contenido' && (c.x < MARGEN.izq - 0.5 || c.x + c.ancho > PAGINA.ancho - MARGEN.der + 0.5)) {
      out.push(hallazgo(SEVERIDAD.AVISO, 'fuera_de_margen', lamina, `${c.tipo} rompe el margen lateral`, { caja: c.id }))
    }
  }

  const contenido = lamina.cajas.filter((c) => c.capa === 'contenido')
  for (let i = 0; i < contenido.length; i += 1) {
    for (let j = i + 1; j < contenido.length; j += 1) {
      const a = { ...contenido[i], alto: Math.max(contenido[i].alto, altoReal(contenido[i])) }
      const b = { ...contenido[j], alto: Math.max(contenido[j].alto, altoReal(contenido[j])) }
      if (seSuperponen(a, b, 1.5)) {
        out.push(hallazgo(SEVERIDAD.BLOQUEANTE, 'superposicion', lamina,
          `${a.tipo} ${a.id} se pisa con ${b.tipo} ${b.id}`, { caja: a.id, contra: b.id }))
      }
    }
  }

  const listas = lamina.cajas.filter((c) => c.tipo === 'bullets')
  for (const l of listas) {
    if (l.items.length > BULLETS_MAXIMO) {
      out.push(hallazgo(SEVERIDAD.AVISO, 'densidad', lamina, `${l.items.length} viñetas: más de ${BULLETS_MAXIMO} no se leen en una sala`, { caja: l.id }))
    }
  }
  const caracteres = textos.reduce((n, c) => n + (c.contenido?.length ?? c.items?.join(' ').length ?? 0), 0)
  if (caracteres > CARACTERES_MAXIMO && lamina.nombre !== 'fuentes') {
    out.push(hallazgo(SEVERIDAD.AVISO, 'densidad', lamina, `${caracteres} caracteres en una lámina: es un documento, no una diapositiva`))
  }
  return out
}

/** Revisa el mazo entero. Devuelve `{ok, hallazgos, bloqueantes, avisos}`. PURA. */
export function revisarDeck(compuesto) {
  const hallazgos = compuesto.laminas.flatMap((l, i) => revisarLamina({ ...l, numero: i + 1 }))
  const bloqueantes = hallazgos.filter((h) => h.severidad === SEVERIDAD.BLOQUEANTE)
  return { ok: bloqueantes.length === 0, hallazgos, bloqueantes: bloqueantes.length, avisos: hallazgos.length - bloqueantes.length }
}

/**
 * CORRIGE lo que se puede corregir sin cambiar el contenido: baja el cuerpo del texto que
 * desborda, hasta el piso que fija `ajustarTamano`. Lo que NO se corrige acá —una superposición,
 * un contraste malo— es un defecto de la plantilla, y se reporta para arreglarlo en el código, no
 * escondiéndolo en la lámina. Devuelve `{compuesto, correcciones}`. PURA.
 */
export function corregirDeck(compuesto) {
  const correcciones = []
  const laminas = compuesto.laminas.map((lamina, i) => {
    const cajas = lamina.cajas.map((c) => {
      if (c.tipo !== 'texto' && c.tipo !== 'bullets') return c
      const alto = altoReal(c)
      if (alto <= c.alto + TOLERANCIA) return c
      const contenido = c.tipo === 'texto' ? c.contenido : c.items.join('\n')
      let tamano = c.estilo.tamano
      while (tamano > Math.max(8, c.estilo.tamano * 0.8)) {
        tamano -= 0.5
        const prueba = { ...c, estilo: { ...c.estilo, tamano } }
        if (altoReal(prueba) <= c.alto) break
      }
      correcciones.push({ lamina: i + 1, caja: c.id, de: c.estilo.tamano, a: Number(tamano.toFixed(1)), texto: contenido.slice(0, 40) })
      return { ...c, estilo: { ...c.estilo, tamano: Number(tamano.toFixed(1)) } }
    })
    return { ...lamina, cajas }
  })
  return { compuesto: { ...compuesto, laminas }, correcciones }
}

/** Resumen legible para el informe que el OS le devuelve al dueño. PURA. */
export function informeQa(revision, correcciones = []) {
  const porTipo = {}
  for (const h of revision.hallazgos) porTipo[h.tipo] = (porTipo[h.tipo] || 0) + 1
  return {
    ok: revision.ok,
    bloqueantes: revision.bloqueantes,
    avisos: revision.avisos,
    por_tipo: porTipo,
    correcciones_automaticas: correcciones.length,
    detalle: revision.hallazgos.slice(0, 20).map((h) => `L${h.lamina} (${h.nombre}) ${h.severidad} · ${h.tipo}: ${h.detalle}`),
    area_util: `${CONTENIDO.ancho}×${CONTENIDO.alto} pt dentro de ${PAGINA.ancho}×${PAGINA.alto}`,
  }
}
