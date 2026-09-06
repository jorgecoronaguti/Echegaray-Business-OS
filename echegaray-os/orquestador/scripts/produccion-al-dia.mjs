#!/usr/bin/env node
// PONER EL CHECKOUT DE PRODUCCIÓN AL DÍA ANTES DE QUE EL TIMER ESCRIBA EL SHEET.
//
// ═══ EL DEFECTO, MEDIDO EL 06/09/2026 ═══
//
// El timer `echegaray-flujo-caja` corre `flujo-caja-rehacer-todo.mjs` desde
// `/home/jorge/echegaray-os/produccion/echegaray-os` — un checkout DISTINTO del que se desarrolla. Ese
// checkout no se actualizaba solo, y quedó clavado en un commit de días atrás.
//
// Consecuencia real, no hipotética: se aplicaron 115 fórmulas a la pestaña «Plantel» del Sheet, el
// timer corrió a las 10:51 con el generador VIEJO, y las pisó todas. El dueño abrió el archivo y no
// había cambiado nada. Pushear a GitHub actualiza la web —Vercel lee de ahí— pero no este checkout.
//
// El trabajo desaparecía sin un error, sin un log rojo y sin que nadie se enterara hasta abrir el
// Sheet. Es el peor tipo de falla: silenciosa y que borra trabajo hecho.
//
// ═══ POR QUÉ UN SCRIPT Y NO UN `git pull` EN EL UNIT ═══
//
// Porque tiene reglas, y una regla dentro de una línea de shell en un `.service` no se puede probar
// ni leer. Las reglas son tres:
//
//   1. `--ff-only`. Si producción divergió, NO se fuerza: se avisa y se sigue con lo que hay. Un
//      merge automático en el checkout que escribe el Sheet es exactamente cómo se pierde una
//      pestaña.
//   2. Si el árbol está sucio, NO se toca. Alguien puede estar depurando ahí.
//   3. NUNCA frena el pipeline. Si no hay red, si GitHub no responde o si el fetch falla, se corre
//      con el código que haya: es peor no actualizar el Flujo de Caja que actualizarlo con código de
//      ayer. El aviso queda en el log del servicio.

import { execFileSync } from 'node:child_process'

const REPO = process.argv[2] ?? '/home/jorge/echegaray-os/produccion/echegaray-os'

/** NÚCLEO PURO: qué hacer, dado el estado del checkout. Separado para poder probarlo sin git. */
export function decidir({ sucio, alDia, puedeAvanzar }) {
  if (sucio) return { accion: 'no-tocar', porQue: 'el árbol tiene cambios sin commitear: alguien puede estar trabajando ahí' }
  if (alDia) return { accion: 'nada', porQue: 'ya está en el commit de origin/main' }
  if (!puedeAvanzar) return { accion: 'avisar', porQue: 'producción divergió de main: hace falta una persona, no un merge automático' }
  return { accion: 'avanzar', porQue: 'avance directo, sin merge' }
}

function git(args) {
  return execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim()
}

function main() {
  let estado
  try {
    git(['fetch', '--quiet', 'origin'])
    const local = git(['rev-parse', 'HEAD'])
    const remoto = git(['rev-parse', 'origin/main'])
    estado = {
      sucio: git(['status', '--porcelain']).length > 0,
      alDia: local === remoto,
      // `merge-base --is-ancestor` sale 0 cuando el local es ancestro del remoto, o sea que el
      // avance es directo. Cualquier otra cosa es divergencia.
      puedeAvanzar: (() => {
        try { git(['merge-base', '--is-ancestor', local, remoto]); return true } catch { return false }
      })(),
    }
  } catch (e) {
    // SIN RED NO SE FRENA EL PIPELINE. Se avisa y se sigue con el código que haya.
    console.warn(`producción-al-día: no pude consultar el remoto (${String(e?.message ?? e).slice(0, 120)}) — sigo con el código actual`)
    return
  }

  const { accion, porQue } = decidir(estado)
  if (accion === 'avanzar') {
    git(['merge', '--ff-only', 'origin/main'])
    console.log(`producción-al-día: actualizado a ${git(['log', '--oneline', '-1'])}`)
    return
  }
  console.log(`producción-al-día: ${accion} — ${porQue}`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
