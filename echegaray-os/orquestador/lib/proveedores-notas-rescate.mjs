// RESCATAR LO QUE EL DUEÑO ESCRIBIÓ EN «QUÉ HACER» ANTES DE QUE ALGUIEN TOQUE LA COLUMNA.
//
// ═══ EL DEFECTO QUE ESTO CIERRA (auditoría del 17/09/2026) ═══
//
// `proveedores-dos-cuadros.mjs` vacía A:G y `proveedores-notas-visibles.mjs` reescribe la fórmula de la
// D, los dos con `espejo: true` —que saltea la guarda central— y sin mirar si en la D había un texto
// escrito a mano. La sonda lee esas ediciones cada minuto, pero el pipeline puede correr en ese
// minuto: el texto del dueño se perdía sin aviso. Ahora los dos escritores llaman a esto ANTES de
// escribir, y si no pueden leer o guardar, frenan.
//
// ═══ UNA SOLA PUERTA PARA LA SONDA Y PARA EL PIPELINE ═══
//
// Leer la pestaña dos veces, armar la evidencia (`edicionesDelDueno`), guardar y borrar en la base y
// dejar constancia de lo retenido: si esto viviera repetido en tres scripts, la regla de qué cuenta
// como edición del dueño tendría tres versiones.
//
// ═══ LO RETENIDO SE VE EN LA APP, NO SÓLO EN EL LOG ═══
//
// Más de `TOPE_BORRADOS` celdas vaciadas a la vez no se borran. Hasta hoy eso quedaba en una línea del
// journal que nadie lee. Se registra en `proveedor_nota_cambio` con `origen = 'sheet'` y estado
// `rechazado`, y «A quién le debo» lo muestra como conflicto en la fila del proveedor. Una constancia por
// proveedor mientras la nota no cambie: la sonda corre cada minuto y no puede llenar la cola.

import { borrarNotas, guardarNotas, leerNotas } from './proveedor-notas.mjs'
import { edicionesDelDueno, observarCuadro, RANGO_PROVEEDORES } from './proveedores-notas-hoja.mjs'
import { escribirEnLaAuxiliar, planDeAuxiliar, RANGO_AUX } from './auxiliar-notas-escritura.mjs'

/** Lee la pestaña (valor y fórmula) y arma la evidencia. No escribe nada. */
export async function leerEdiciones({ google, fileId, query, anterior }) {
  const [visible, formulas] = await Promise.all([
    google.readSheetValues(fileId, RANGO_PROVEEDORES, { render: 'FORMATTED_VALUE' }),
    google.readSheetValues(fileId, RANGO_PROVEEDORES, { render: 'FORMULA' }),
  ])
  const observacion = observarCuadro({ visible: visible ?? [], formulas: formulas ?? [] })
  const enBase = await leerNotas(fileId, { query })
  return { observacion, enBase, ...edicionesDelDueno({ observacion, anterior, enBase }) }
}

/** ¿Existe la cola (20260917T1410)? Sin ella los retenidos quedan sólo en el log, y se dice. */
async function hayCola(query) {
  const r = await query("select to_regclass('public.proveedor_nota_cambio') is not null as hay")
  return r?.rows?.[0]?.hay === true
}

/** Deja visible cada borrado retenido. Devuelve cuántas constancias nuevas escribió, o null sin cola. */
export async function registrarRetenidos({ query, retenidos, enBase }) {
  if (!retenidos.length) return 0
  if (!await hayCola(query)) return null
  let nuevas = 0
  for (const clave of retenidos) {
    const v = enBase.get(clave)
    const r = await query(
      `insert into public.proveedor_nota_cambio (clave, proveedor, nota_anterior, nota_nueva, estado, motivo, origen)
       select $1, $2, $3, '', 'rechazado', $4, 'sheet'
        where not exists (
          select 1 from public.proveedor_nota_cambio c
           where c.clave = $1 and c.origen = 'sheet'
             and c.creado_at >= coalesce((select max(n.actualizado_en) from public.proveedor_notas n where n.clave = $1), '-infinity'))
       returning id`,
      [clave, v?.proveedor ?? clave, v?.nota ?? '',
        `conflicto: en el Sheet la nota aparece borrada junto con ${retenidos.length - 1} más en la misma lectura. `
        + 'No la borro sin confirmación: si la borraste vos, borrala desde acá.'])
    nuevas += r?.rows?.length ?? 0
  }
  return nuevas
}

/**
 * LEE, GUARDA Y BORRA. Tira si no puede leer o guardar: quien llama no escribe la columna sin esto.
 * @returns {Promise<object>} lo de `edicionesDelDueno` más `constancias`
 */
export async function rescatarNotas({ google, fileId, query, anterior, escribir = true }) {
  const r = await leerEdiciones({ google, fileId, query, anterior })
  if (r.sinEvidencia || !escribir) return { ...r, constancias: 0 }
  await guardarNotas(fileId, r.guardar, { query })
  await borrarNotas(fileId, r.borrar, { query })
  return { ...r, constancias: await registrarRetenidos({ query, retenidos: r.retenidos, enBase: r.enBase }) }
}

/**
 * LA PUERTA DEL PIPELINE. Rescata y decide si se puede escribir la columna.
 *
 * Frena (tira) si hay borrados retenidos —la evidencia está en la pestaña AHORA, y reponer la fórmula
 * los haría reaparecer— o si el bloque no tiene fórmulas pero sí textos: no se puede saber de quién son.
 */
export async function antesDeEscribirLaColumna({ google, fileId, query, anterior, log = () => {} }) {
  const r = await rescatarNotas({ google, fileId, query, anterior })
  const textos = r.observacion.filas.filter((f) => f.clave && f.tipo === 'texto')
  if (r.sinEvidencia && textos.length) {
    throw new Error(`«Qué hacer» no tiene fórmulas y tiene ${textos.length} texto(s) a mano (${textos.map((f) => `fila ${f.fila}`).join(', ')}): `
      + 'no sé de quién son y no los piso. Frenado.')
  }
  if (r.retenidos.length) {
    throw new Error(`«Qué hacer» muestra ${r.retenidos.length} notas borradas a la vez (${r.retenidos.join(', ')}): quedan como conflicto `
      + 'en la app y NO repongo la fórmula encima. Frenado.')
  }
  // ═══ Y LA AUXILIAR QUEDA COMO LA BASE, ANTES DE REPONER LA FÓRMULA (R1, 17/09/2026) ═══
  //
  // `proveedores-cuenta-corriente` ya escribió la auxiliar desde la base en este pipeline, ANTES de este
  // rescate. Sin esto la fórmula repuesta en la D busca la nota vieja y el dueño ve desaparecer lo que
  // escribió hasta la corrida siguiente. Si no se puede escribir o no aterriza, frena: la D no se toca.
  if (r.guardar.length || r.borrar.length) {
    const aux = await google.readSheetValues(fileId, RANGO_AUX, { render: 'FORMATTED_VALUE' })
    const w = await escribirEnLaAuxiliar({ google, fileId, plan: planDeAuxiliar({ aux: aux ?? [], guardar: r.guardar, borrar: r.borrar }) })
    if (w.estado !== 'escrito') {
      throw new Error(`«Qué hacer»: guardé en la base pero no pude llevarlo a la auxiliar (${w.estado}: ${w.detalle}). `
        + 'No repongo la fórmula: mostraría la nota vieja. Frenado.')
    }
    log(`«Qué hacer» en la auxiliar: ${w.detalle}`)
  }
  log(`«Qué hacer» rescatado antes de escribir: ${r.guardar.length} guardada(s) · ${r.borrar.length} borrada(s)`
    + `${r.desplazadas.length ? ` · ${r.desplazadas.length} movida(s) por la dinámica` : ''}`)
  return r
}
