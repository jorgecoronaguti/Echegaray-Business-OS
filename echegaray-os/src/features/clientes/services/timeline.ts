// LA ACTIVIDAD DEL CLIENTE — DERIVADA, NUNCA REGISTRADA.
//
// ═══ POR QUÉ NO HAY UNA TABLA DE EVENTOS ═══
//
// Una tabla de auditoría nueva arranca vacía. El día que se enciende, ARCOR —cliente desde julio,
// con obra en curso— aparece con «sin actividad», y eso no es un dato faltante: es una afirmación
// falsa con formato de dato. Los hechos ya están guardados con su fecha en cinco lugares distintos;
// lo único que faltaba era leerlos juntos y en orden.
//
// ═══ LA REGLA DURA: SIN FECHA NO HAY EVENTO ═══
//
// Un registro sin fecha NO se muestra con la fecha de otra cosa, ni al final, ni «sin fecha». Se
// descarta y se CUENTA: `sinFecha` viaja en el resultado para que la pantalla pueda decir cuántos
// quedaron afuera. Una línea de tiempo que omite en silencio miente por omisión.
//
// ═══ LO QUE ESTA FUNCIÓN NO PUEDE SABER, Y POR ESO NO DICE ═══
//
// · QUIÉN hizo cada cosa. `clientes.creado_por` existe pero está en null en las cinco filas reales.
// · CADA edición de la ficha. La base guarda `updated_at`, que es la ÚLTIMA. Por eso el evento se
//   llama «Última modificación» y no «Ficha editada»: decir «editada» en singular sugeriría que fue
//   la única vez.
// · Si una obra se CREÓ para este cliente o se VINCULÓ después. No hay columna que lo distinga, así
//   que el evento dice «Alta de la obra», que es lo único que consta.

// NO FORMATEA NADA. Los importes salen como número y las fechas como vinieron: el peso con
// separadores y la fecha en dd/mm/aa son decisiones de la pantalla. Una función pura que devuelve
// '$1.500.000' ya no se puede sumar, comparar ni probar sin escribir el separador en el test.

import type { EventoCliente, FuentesActividad, LineaDeTiempo } from '../types'

/** Sin fecha no hay evento. Devuelve la clave de orden, o null si el registro no la tiene. */
function alOrden(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  return Number.isNaN(t) ? null : t
}

/** Agrega un evento si —y sólo si— la fecha existe. Devuelve 1 cuando lo descartó, para contarlo. */
function agregar(
  destino: EventoCliente[],
  fecha: string | null | undefined,
  evento: Omit<EventoCliente, 'fecha' | 'orden'>,
): number {
  const orden = alOrden(fecha)
  if (orden == null) return 1
  destino.push({ ...evento, fecha: fecha as string, orden })
  return 0
}

function deLaFicha(f: FuentesActividad, out: EventoCliente[]): number {
  let sin = agregar(out, f.cliente.creado_en, {
    clave: 'cliente-alta',
    tipo: 'cliente_alta',
    titulo: 'Alta del cliente',
    detalle: f.cliente.nombre,
    href: null,
    fuente: 'Ficha',
  })
  // Sólo si la ficha cambió DESPUÉS del alta. Cuando son iguales —un cliente creado y nunca tocado—
  // un segundo evento en la misma fecha diría que pasó algo que no pasó.
  const alta = alOrden(f.cliente.creado_en)
  const cambio = alOrden(f.cliente.actualizado_en)
  if (cambio != null && (alta == null || cambio > alta)) {
    sin += agregar(out, f.cliente.actualizado_en, {
      clave: 'cliente-editado',
      tipo: 'cliente_actualizado',
      titulo: 'Última modificación de la ficha',
      detalle: null,
      href: null,
      fuente: 'Ficha',
    })
  }
  return sin
}

function deLosContactos(f: FuentesActividad, out: EventoCliente[]): number {
  let sin = 0
  for (const c of f.contactos) {
    sin += agregar(out, c.creado_en, {
      clave: `contacto-${c.id}`,
      tipo: 'contacto_alta',
      titulo: `Contacto agregado: ${c.nombre}`,
      detalle: c.rol,
      href: null,
      fuente: 'Contactos',
    })
  }
  return sin
}

function deLasObras(f: FuentesActividad, out: EventoCliente[]): number {
  let sin = 0
  for (const o of f.obras) {
    const href = `/obras/${o.obra_id}`
    sin += agregar(out, o.creada_en, {
      clave: `obra-alta-${o.obra_id}`,
      tipo: 'obra_alta',
      titulo: `Alta de la obra: ${o.nombre}`,
      detalle: null,
      href,
      fuente: 'Obras',
    })
    // Inicio y fin REALES, no los planificados: un plan es una intención, no un hecho ocurrido.
    if (o.fecha_inicio_real) {
      sin += agregar(out, o.fecha_inicio_real, {
        clave: `obra-inicio-${o.obra_id}`, tipo: 'obra_inicio',
        titulo: `Arranque de obra: ${o.nombre}`, detalle: null, href, fuente: 'Obras',
      })
    }
    if (o.fecha_fin_real) {
      sin += agregar(out, o.fecha_fin_real, {
        clave: `obra-fin-${o.obra_id}`, tipo: 'obra_fin',
        titulo: `Fin de obra: ${o.nombre}`, detalle: null, href, fuente: 'Obras',
      })
    }
  }
  return sin
}

/**
 * Los documentos, con UNA distinción que cambia la lectura de toda la solapa.
 *
 * ═══ POR QUÉ LO QUE COLGÓ EL SINCRONIZADOR SE AGRUPA POR DÍA ═══
 *
 * Los 214 vínculos que existen hoy los puso el sincronizador de Drive de una sola pasada, todos con
 * el mismo `creado_en`. Sin agrupar, la ficha de La Estrella abre con NOVENTA Y TRES renglones
 * idénticos del 17/08 y el alta de sus obras queda enterrada tres pantallas más abajo. La línea de
 * tiempo pasa a ser un volcado de una tabla, que es justo lo contrario de para qué existe.
 *
 * Agrupar NO inventa nada: el conteo es de filas reales y la fecha es la de esas filas. Lo que se
 * pierde es el nombre de cada archivo, y ese está —entero y buscable— en la solapa Documentos.
 *
 * Lo que una PERSONA vinculó a mano NO se agrupa: son pocos, y que alguien haya decidido colgar el
 * contrato es un hecho de la relación, no un movimiento de sincronización.
 */
function deLosDocumentos(f: FuentesActividad, out: EventoCliente[]): number {
  let sin = 0
  const porDia = new Map<string, { n: number; ultimo: string; nombre: string | null }>()

  for (const d of f.documentos) {
    if (d.origen === 'manual') {
      sin += agregar(out, d.creado_en, {
        clave: `doc-${d.drive_file_id}`,
        tipo: 'documento_alta',
        // Sin nombre se muestra el id: es feo y es la verdad. Un rótulo inventado sería peor.
        titulo: `Documento vinculado: ${d.name ?? d.drive_file_id}`,
        detalle: d.rol,
        href: null,
        fuente: 'Documentos',
      })
      continue
    }
    const orden = alOrden(d.creado_en)
    if (orden == null) { sin += 1; continue }
    const dia = (d.creado_en as string).slice(0, 10)
    const g = porDia.get(dia)
    // La fecha del grupo es la del ÚLTIMO vínculo de ese día: sigue siendo un instante real de una
    // fila real, y no una fecha promedio, que no existiría en ningún lado.
    if (!g) porDia.set(dia, { n: 1, ultimo: d.creado_en as string, nombre: d.name })
    else {
      g.n += 1
      if (orden > (alOrden(g.ultimo) ?? 0)) g.ultimo = d.creado_en as string
    }
  }

  for (const [dia, g] of porDia) {
    agregar(out, g.ultimo, {
      clave: `docs-${dia}`,
      tipo: 'documento_alta',
      titulo: g.n === 1
        ? `Documento vinculado: ${g.nombre ?? 'sin nombre en el índice de Drive'}`
        : `${g.n} documentos vinculados desde la carpeta de Drive`,
      detalle: null,
      href: null,
      fuente: 'Documentos',
    })
  }
  return sin
}

/** Los eventos CONTRACTUALES: certificar, facturar y cobrar son tres hechos distintos y tres
 *  fechas distintas. Colapsarlos en uno solo borraría justamente el plazo que importa. */
function deLosCertificados(f: FuentesActividad, out: EventoCliente[]): number {
  let sin = 0
  for (const c of f.certificados) {
    const n = c.numero ? `N° ${c.numero}` : 'sin número'
    const href = c.obra_id ? `/obras/${c.obra_id}?vista=economia` : null
    sin += agregar(out, c.fecha_certificacion, {
      clave: `cert-${c.id}`, tipo: 'certificacion',
      titulo: `Certificación ${n} · ${c.obra_nombre}`, detalle: null, monto: c.monto_certificado,
      href, fuente: 'Certificación',
    })
    if (c.fecha_facturacion) {
      sin += agregar(out, c.fecha_facturacion, {
        clave: `fact-${c.id}`, tipo: 'facturacion',
        titulo: `Facturación ${n} · ${c.obra_nombre}`, detalle: null, monto: c.monto_facturado,
        href, fuente: 'Certificación',
      })
    }
    if (c.fecha_cobranza) {
      sin += agregar(out, c.fecha_cobranza, {
        clave: `cobro-${c.id}`, tipo: 'cobranza',
        titulo: `Cobranza ${n} · ${c.obra_nombre}`, detalle: null, monto: c.monto_cobrado,
        href, fuente: 'Certificación',
      })
    }
  }
  return sin
}

/**
 * La línea de tiempo del cliente: lo más reciente arriba.
 *
 * El desempate NO es el orden en que llegaron las filas: dos hechos del mismo día tienen que salir
 * siempre en la misma posición, o la pantalla se reordena sola entre dos recargas idénticas y nadie
 * confía en lo que ve. Se desempata por la clave, que es única y estable.
 */
export function construirLineaDeTiempo(f: FuentesActividad): LineaDeTiempo {
  const eventos: EventoCliente[] = []
  const sinFecha =
    deLaFicha(f, eventos) +
    deLosContactos(f, eventos) +
    deLasObras(f, eventos) +
    deLosDocumentos(f, eventos) +
    deLosCertificados(f, eventos)

  eventos.sort((a, b) => (b.orden - a.orden) || a.clave.localeCompare(b.clave))
  return { eventos, sinFecha }
}
