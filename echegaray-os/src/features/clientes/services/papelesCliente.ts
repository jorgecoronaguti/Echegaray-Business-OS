// LOS PAPELES DEL CLIENTE, AGRUPADOS UNA SOLA VEZ — OC, OP, retenciones y facturas nuestras.
//
// ═══ POR QUÉ EXISTE ESTE ARCHIVO ═══
//
// Las tres pantallas que muestran órdenes —la lista `/clientes`, la ficha del cliente y la solapa
// Documentos de la obra— tienen que decir LO MISMO. Hasta hoy cada una agrupaba a su manera: la
// lista mezclaba OC y OP en un mismo rótulo («OP 5146 · 03/09 · $15.328.174 · OC 2162 · +8»), la
// ficha no mostraba ninguna y la obra las listaba planas. Tres agrupaciones parecidas se separan en
// cuanto una aprende algo. Acá se agrupa UNA vez, en una función pura, y las tres dibujan.
//
// LA DEFINICIÓN, EN UNA LÍNEA CADA UNA (`docs/engineering/DISENO-FICHA-CLIENTE-v3.md`):
//   ORDEN DE COMPRA   la emite el cliente y ENCARGA el trabajo. Se identifica por su NÚMERO: la
//                     misma OC puede llegar en dos mails y sigue siendo una sola orden y un solo
//                     importe.
//   ORDEN DE PAGO     la emite el cliente y ORDENA pagar facturas nuestras. No prueba el cobro:
//                     eso lo prueba el extracto del banco.
//   RETENCIÓN         el comprobante de retención que acompaña a una OP. LLEVA EL NÚMERO DE ESA OP
//                     (`O_P_0000000005156_G00002353.pdf`) y por eso es el papel más peligroso del
//                     conjunto: contado como OP duplica lo cobrado. NUNCA es una OP.
//   FACTURA           la emitimos NOSOTROS y cita la OC que factura. No es una orden del cliente:
//                     contarla como OC duplicaba lo vendido (defecto real, corregido el 10/09).

/** Lo que llega de `cliente_orden`. `cita` y `nombre_archivo` son opcionales porque la lectura de
 *  la cartera entera no los trae: la lista sólo necesita número, fecha e importe. */
export interface PapelCrudo {
  id: string
  tipo: string
  numero: string | null
  fecha: string | null
  importe: number | null
  moneda: string | null
  obra_id: string | null
  cita?: string | null
  nombre_archivo?: string | null
}

export type ClasePapel = 'oc' | 'op' | 'retencion' | 'factura' | 'otro'

/** «00002-00002162» → «2-2162». Une el mismo número escrito de tres formas distintas. Es la MISMA
 *  regla que `ordenesCliente.canonico` y que `orquestador/lib/ordenes-cliente.mjs`; los tres tienen
 *  los mismos casos clavados en sus tests para que no se separen en silencio. */
export function canonico(numero: string | null | undefined): string | null {
  const tramos = String(numero ?? '').match(/\d+/g)
  if (!tramos) return null
  const limpios = tramos.map((t) => t.replace(/^0+/, '') || '0').filter((t) => t !== '0')
  return limpios.length ? limpios.join('-') : null
}

/** El último tramo sin ceros: «2162». Es lo que se dibuja. */
export function corto(numero: string | null | undefined): string | null {
  return canonico(numero)?.split('-').pop() ?? null
}

/**
 * ¿ES UN COMPROBANTE DE RETENCIÓN POR SU NOMBRE DE ARCHIVO?
 *
 * El proveedor los emite como `O_P_<número de la orden de pago>_G<número del comprobante>.pdf`
 * (verificado el 10/09/2026 abriendo el PDF: dice «Comprobante de Retención», «O/P: 0000000005156»
 * y «Código de Régimen: 78»).
 *
 * ES LA MISMA MARCA QUE USA `orquestador/lib/ordenes-cliente.mjs` (`/_g\d{5,}…/`) para escribir
 * `tipo = 'retencion'` al bajar el adjunto — se repite acá porque `src/` no importa del
 * orquestador, con el mismo patrón y un test que lo clava, igual que el número canónico.
 */
export function esRetencion(nombreArchivo: string | null | undefined): boolean {
  return /_g\d{5,}(?:\.[a-z0-9]+)?$/i.test(String(nombreArchivo ?? ''))
}

/**
 * QUÉ ES CADA PAPEL. El `tipo` de la fila manda cuando dice `retencion`; el NOMBRE DEL ARCHIVO es
 * la red: doce certificados de Messina están guardados como `otro` —y algunos llegaron a estar como
 * `orden_pago`, declarando dos pagos donde hubo uno—. Un certificado lleva el número de SU orden,
 * así que contado como orden duplica el dinero cobrado sin que nada se ponga rojo.
 *
 * Por eso la marca del archivo GANA sobre el `tipo`, y hay un test que lo prueba con la fila tipada
 * como `orden_pago`. Cuando la reclasificación de la base (migración
 * `20260910T2010_la_retencion_no_es_una_orden…`) termine de correr, las dos vías dirán lo mismo.
 */
export function clasePapel(p: PapelCrudo): ClasePapel {
  if (p.tipo === 'retencion' || esRetencion(p.nombre_archivo)) return 'retencion'
  if (p.tipo === 'orden_compra') return 'oc'
  if (p.tipo === 'orden_pago') return 'op'
  if (p.tipo === 'factura') return 'factura'
  return 'otro'
}

/**
 * DE QUÉ ORDEN DE PAGO ES ESTE CERTIFICADO — sale del NOMBRE DEL ARCHIVO, que es la evidencia.
 *
 * `O_P_0000000004865_G00002208.pdf` = la orden de pago 4865, comprobante G00002208. Los dos números
 * viven en el mismo nombre y son cosas distintas.
 *
 * POR QUÉ NO SE USA `numero` (10/09/2026): la re-atribución del orquestador guarda en `numero` unas
 * veces el de la ORDEN (`0000000005156`) y otras el del COMPROBANTE (`G00002353`) — el mismo PDF
 * quedó dos veces con los dos números. Rotular con `numero` decía «Retención · OP 2353», que es una
 * orden de pago que no existe. El nombre del archivo dice las dos cosas y no cambió nunca.
 *
 * `null` cuando el nombre no lo dice: entonces se cae al número de la fila, y si tampoco está, «s/n».
 */
export function opDeRetencion(nombreArchivo: string | null | undefined): string | null {
  const m = /o_?p_?[ -]*(\d{3,})_g\d+/i.exec(String(nombreArchivo ?? ''))
  return m ? corto(m[1]) : null
}

/** Un papel ya clasificado, con su número corto resuelto. */
export interface Papel extends PapelCrudo {
  clase: ClasePapel
  numeroCorto: string | null
  numeroCanonico: string | null
}

/** La marca de que una orden de pago cubre trabajo de más de una obra. Es un valor y no un `null`
 *  porque «no sé de qué obra es» y «es de varias» son dos cosas distintas en pantalla. */
export const VARIAS_OBRAS = 'varias-obras'

/** Una orden —de compra o de pago— con todo lo que la explica. Un grupo = una orden real, aunque
 *  hayan llegado dos copias del mismo PDF. */
export interface Orden {
  clave: string
  clase: 'oc' | 'op'
  numeroCorto: string | null
  numeroCanonico: string | null
  fecha: string | null
  importe: number | null
  moneda: string | null
  /** `null` = no se pudo atribuir. `VARIAS_OBRAS` = la orden cubre más de una. */
  obraId: string | null
  /** El papel que se descarga: `/api/clientes/orden/<id>`. */
  archivoId: string
  /** Todas las copias que llegaron de esta misma orden. */
  ids: string[]
  /** OC: las facturas que la citan. OP: las facturas que paga (hoy vacío, ver el pie del archivo). */
  facturas: Papel[]
  /** Sólo OP: su comprobante de retención, si llegó. */
  retenciones: Papel[]
  /** Sólo OC: los números de las OP que la pagan, deducidos por las citas. */
  pagadaPor: string[]
  /** Lo que el papel dice que paga o factura, en canónico. Hoy sólo lo traen las facturas. */
  cita: string | null
}

export interface Total { n: number; importe: number | null; parcial: boolean }

export interface ResumenDeObra { oc: Orden[]; op: Orden[]; totalOC: Total; totalOP: Total }

export interface PapelesDelCliente {
  oc: Orden[]
  op: Orden[]
  facturas: Papel[]
  retenciones: Papel[]
  otros: Papel[]
  /** obra_id → sus órdenes y sus totales. Incluye obras cerradas: un papel no desaparece porque la
   *  obra terminó. */
  porObra: Map<string, ResumenDeObra>
  /** Lo que no se pudo atribuir a ninguna obra. Se muestra igual: es trabajo pendiente. */
  sinObra: { oc: Orden[]; op: Orden[] }
  totalOC: Total
  totalOP: Total
}

/** Suma que distingue «nadie cargó el importe» de «cero». Misma regla que `sumaConHuecos`. */
function totalDe(ordenes: Orden[]): Total {
  const con = ordenes.map((o) => o.importe).filter((v): v is number => v != null)
  return {
    n: ordenes.length,
    importe: con.length ? con.reduce((a, b) => a + b, 0) : null,
    parcial: con.length > 0 && con.length < ordenes.length,
  }
}

function papelDe(p: PapelCrudo): Papel {
  return { ...p, clase: clasePapel(p), numeroCorto: corto(p.numero), numeroCanonico: canonico(p.numero) }
}

/**
 * AGRUPA TODOS LOS PAPELES DE UN CLIENTE. Es puro: la pantalla no decide nada.
 *
 * Las órdenes se agrupan por (clase, número canónico). Las que no tienen número NO se agrupan entre
 * sí: dos papeles sin número no son el mismo papel.
 *
 * LA FECHA Y EL IMPORTE DEL GRUPO SON LOS DE LA COPIA MÁS VIEJA. Una orden se emitió una vez; la
 * copia que llegó después no la vuelve más nueva ni suma su importe otra vez. (Medido: la OC 2162
 * de Messina llegó en dos mails.)
 */
export function agruparPapeles(crudos: readonly PapelCrudo[]): PapelesDelCliente {
  const papeles = crudos.map(papelDe)
  const facturas = papeles.filter((p) => p.clase === 'factura')
  const retenciones = papeles.filter((p) => p.clase === 'retencion')
  const otros = papeles.filter((p) => p.clase === 'otro')

  const oc = agruparOrdenes(papeles.filter((p) => p.clase === 'oc'), 'oc')
  const op = agruparOrdenes(papeles.filter((p) => p.clase === 'op'), 'op')

  // ── LOS VÍNCULOS ────────────────────────────────────────────────────────────────────────────
  // La factura cita la OC que factura (`cita = '2-1864'`). Es el único vínculo que la base tiene
  // lleno hoy, y de él salen los demás por transitividad.
  for (const o of oc) {
    o.facturas = facturas.filter((f) => canonico(f.cita) && canonico(f.cita) === o.numeroCanonico)
  }
  for (const o of op) {
    // El certificado se ata a su orden por el NOMBRE DEL ARCHIVO y, si no lo dice, por su número.
    o.retenciones = retenciones.filter(
      (r) => (opDeRetencion(r.nombre_archivo) ?? r.numeroCanonico) === o.numeroCanonico,
    )
    // Una OP puede citar la factura que paga o, directamente, la OC. Se aceptan las dos formas: el
    // día que el extractor lea el detalle del PDF, esto funciona sin tocar la pantalla.
    const citada = canonico(o.cita)
    o.facturas = citada
      ? facturas.filter((f) => f.numeroCanonico === citada || canonico(f.cita) === citada)
      : []
    // De qué obra es una OP sin `obra_id`: la de las facturas que paga. Si son de varias, lo dice.
    if (!o.obraId) {
      const obras = new Set(o.facturas.map((f) => f.obra_id).filter((x): x is string => Boolean(x)))
      o.obraId = obras.size > 1 ? VARIAS_OBRAS : obras.size === 1 ? [...obras][0] : null
    }
  }
  // Qué OP paga cada OC: la que cita esa OC, o la que paga una factura que la cita.
  for (const o of oc) {
    const numerosDeSusFacturas = new Set(o.facturas.map((f) => f.numeroCanonico))
    o.pagadaPor = op
      .filter((p) => p.facturas.some((f) => numerosDeSusFacturas.has(f.numeroCanonico)
        || canonico(f.cita) === o.numeroCanonico))
      .map((p) => p.numeroCorto ?? 's/n')
  }

  const porObra = new Map<string, ResumenDeObra>()
  const enObra = (id: string): ResumenDeObra => {
    const ya = porObra.get(id)
    if (ya) return ya
    const nuevo: ResumenDeObra = { oc: [], op: [], totalOC: totalDe([]), totalOP: totalDe([]) }
    porObra.set(id, nuevo)
    return nuevo
  }
  for (const o of oc) if (o.obraId && o.obraId !== VARIAS_OBRAS) enObra(o.obraId).oc.push(o)
  for (const o of op) if (o.obraId && o.obraId !== VARIAS_OBRAS) enObra(o.obraId).op.push(o)
  for (const r of porObra.values()) { r.totalOC = totalDe(r.oc); r.totalOP = totalDe(r.op) }

  return {
    oc,
    op,
    facturas,
    retenciones,
    otros,
    porObra,
    sinObra: {
      oc: oc.filter((o) => !o.obraId || o.obraId === VARIAS_OBRAS),
      op: op.filter((o) => !o.obraId || o.obraId === VARIAS_OBRAS),
    },
    // LOS TOTALES DEL CLIENTE SON DE TODAS SUS ÓRDENES, con obra y sin ella. Si sumaran sólo las
    // atribuidas, atribuir peor haría subir el total y atribuir mejor lo haría bajar.
    totalOC: totalDe(oc),
    totalOP: totalDe(op),
  }
}

/** Agrupa por número canónico y ordena de la más nueva a la más vieja. */
function agruparOrdenes(papeles: Papel[], clase: 'oc' | 'op'): Orden[] {
  const porClave = new Map<string, Orden>()
  const salida: Orden[] = []
  for (const p of papeles) {
    const clave = p.numeroCanonico ? `${clase}::${p.numeroCanonico}` : `sola::${p.id}`
    const ya = p.numeroCanonico ? porClave.get(clave) : undefined
    if (ya) {
      ya.ids.push(p.id)
      if (p.fecha && (!ya.fecha || p.fecha < ya.fecha)) {
        ya.fecha = p.fecha
        ya.importe = p.importe
        ya.moneda = p.moneda
        ya.archivoId = p.id
      }
      // La obra la aporta cualquiera de las copias: si una llegó atribuida y la otra no, la orden
      // ES de esa obra. Perderla porque la segunda copia vino vacía sería esconder el papel.
      if (!ya.obraId && p.obra_id) ya.obraId = p.obra_id
      continue
    }
    const orden: Orden = {
      clave,
      clase,
      numeroCorto: p.numeroCorto,
      numeroCanonico: p.numeroCanonico,
      fecha: p.fecha,
      importe: p.importe,
      moneda: p.moneda,
      obraId: p.obra_id,
      archivoId: p.id,
      ids: [p.id],
      facturas: [],
      retenciones: [],
      pagadaPor: [],
      cita: p.cita ?? null,
    }
    if (p.numeroCanonico) porClave.set(clave, orden)
    salida.push(orden)
  }
  // Las más nuevas primero; las sin fecha al final: una orden sin fecha no es la más vieja.
  return salida.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
}

// LO QUE ESTA FUNCIÓN NO PUEDE DECIR (medido el 10/09/2026 sobre la tabla entera):
// las 12 órdenes de pago tienen `cita` en NULL —el dato de qué facturas paga cada una vive en el
// texto del PDF, que el extractor todavía no lee—, así que «paga la factura X» y «OP que paga esta
// OC» salen vacíos y la pantalla escribe «no consta». Emparejar por importe acertaría en 2 de 12 y
// dibujaría una inferencia como si fuera un hecho.
