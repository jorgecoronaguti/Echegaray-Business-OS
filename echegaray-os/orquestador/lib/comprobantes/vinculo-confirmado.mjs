// EL DUEÑO MIRÓ EL PAPEL Y DIJO «ES ESTA FILA» — ESTO CONVIERTE ESA FRASE EN UN PLAN VERIFICABLE.
//
// `clave-conciliada.mjs` exige que el NÚMERO coincida, y por eso no puede unir estos casos: el papel
// dice 0042-00393288 y la fila 817 dice 0042-00057984 (el bot leyó mal un dígito), o el papel trae
// CUIT y la fila no. La regla automática hace bien en negarse. Lo que falta es la otra puerta: una
// decisión humana, escrita, que se pueda auditar después — por eso el vínculo queda marcado
// `match_manual` y no se confunde nunca con `match_numero`.
//
// LA TRAMPA QUE ESTE MÓDULO EXISTE PARA EVITAR: escribir en `compra_adjunto.compra_clave` la clave
// que leyó el papel. Sería lo intuitivo y deja el papel igual de huérfano, porque la app cuelga el
// adjunto de la fila buscando `compra_sheet.clave`: si se guarda `c:30621517429|0042-00393288`, esa
// clave no existe en ninguna fila y la compra sigue diciendo «sin comprobante» con el papel adentro.
// Lo que se guarda es SIEMPRE la clave de la FILA de destino.

/** Un vínculo decidido por una persona: la clave que leyó el papel y la fila que el dueño señaló. */
export const MOTIVO = {
  ok: 'ok',
  fila_inexistente: 'fila_inexistente',   // la fila decidida no está en el espejo: no se toca nada
  sin_papel: 'sin_papel',                 // no quedan papeles sueltos con esa clave (ya vinculados)
}

const norm = (c) => String(c ?? '').trim().toLowerCase()

/**
 * @param {object} p
 * @param {Array<{file_id:string, clave:string|null, nombre?:string}>} p.papeles  adjuntos SIN vincular
 * @param {Array<{clave:string, fila:number}>} p.decisiones  lo que el dueño confirmó
 * @param {Array<{fila:number, clave:string, proveedor?:string, total?:number}>} p.filas  espejo compra_sheet
 */
export function planDeVinculos({ papeles = [], decisiones = [], filas = [] }) {
  const porFila = new Map(filas.map((f) => [Number(f.fila), f]))
  const vinculos = []
  const problemas = []

  for (const d of decisiones) {
    const destino = porFila.get(Number(d.fila))
    if (!destino || !destino.clave) {
      problemas.push({ ...d, motivo: MOTIVO.fila_inexistente })
      continue
    }
    const míos = papeles.filter((p) => norm(p.clave) === norm(d.clave))
    if (!míos.length) {
      problemas.push({ ...d, motivo: MOTIVO.sin_papel })
      continue
    }
    for (const p of míos) {
      vinculos.push({
        file_id: p.file_id,
        nombre: p.nombre ?? null,
        clave_papel: d.clave,
        fila: Number(d.fila),
        // LA CLAVE DE LA FILA, NO LA DEL PAPEL. Ver la cabecera: es todo el punto del módulo.
        compra_clave: destino.clave,
        proveedor: destino.proveedor ?? null,
        motivo: MOTIVO.ok,
      })
    }
  }
  return { vinculos, problemas }
}
