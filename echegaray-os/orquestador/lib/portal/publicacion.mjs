// CÓMO NACE UNA FILA DE `esquema_pago` QUE EL SYNC TRAJO DEL SHEET — definido UNA sola vez.
//
// ═══ EL DEFECTO QUE EXISTE PARA QUE NO SE REPITA (07/09/2026) ═══
//
// `esquema_pago` tiene DOS escritores, los dos con `origen = 'sync_cobranzas'`, y hasta hoy decían
// cosas opuestas sobre lo mismo:
//
//   scripts/portal-sembrar.mjs      insert (… origen, visible_portal, publicado_at)
//                                   values (… 'sync_cobranzas', true, now())      ← nace publicada
//   scripts/sync-esquema-cliente    insert (… origen) values (… 'sync_cobranzas') ← nace INVISIBLE
//                                   (`visible_portal boolean not null default false`)
//
// El segundo empezó a insertar de verdad el 05/09/2026 —antes se caía entero por el índice único de
// `orden`, ver su propio comentario— y desde entonces cada cobro NUEVO del Sheet nace oculto. Medido
// contra la base el 07/09: las 29 filas creadas ese día tienen `publicado_at` nulo, SIN UNA SOLA
// EXCEPCIÓN, y entre ellas hay 6 cobros ya percibidos por $105.876.355,81 en tres clientes.
//
// No se recuperan solas. `publicarEsquema` (pantalla 32) sella `publicado_at` con
// `.eq('visible_portal', true)`: una fila que nace en `false` queda fuera del filtro, así que
// administración puede volver a publicar el esquema del cliente todas las veces que quiera y esa
// fila nunca entra. Es invisible por construcción y de forma permanente.
//
// Efecto en la cara del cliente, medido en San Francisco: Cobranzas dice $141.865.646 cobrados en
// 2026 y el portal publica $133.797.709,50 — y encima, para el mismo dinero, sigue mostrando la
// línea vieja «saldo del anticipo · 1ª de 2 cuotas» como *a vencer*. Le reclama lo que ya cobró.
//
// ═══ POR QUÉ EL CRITERIO SE IMPORTA Y NO SE COPIA ═══
//
// Realidad única: el criterio de si una fila del sync nace visible existía ya —el del sembrador— y
// lo correcto es que los dos escritores lean el MISMO. Escribirlo de nuevo en el otro script deja
// otra vez dos definiciones, que es exactamente lo que produjo este defecto.

import { estadoAGuardar } from './cobranzas-a-cliente.mjs'

/**
 * CON QUÉ VISIBILIDAD NACE UNA FILA QUE EL SYNC TRAE DEL SHEET.
 *
 * `true` y publicada, igual que en `portal-sembrar.mjs`. La razón no es comodidad: un cobro del
 * Sheet no es una propuesta que administración tenga que aprobar antes de comunicar — es un hecho
 * que el cliente conoce mejor que nosotros, porque lo pagó él. Esconderlo no protege nada y deja al
 * portal reclamando plata ya cobrada.
 *
 * SÓLO RIGE EN EL `insert`. Apagar una línea publicada es una decisión de administración y una
 * corrida del sync no puede deshacerla: por eso `visible_portal` y `publicado_at` NO están —ni
 * pueden estar— en el `do update set`.
 */
export const NACE_VISIBLE_AL_CLIENTE = true

/**
 * ¿ESTA FILA ES UN COBRO QUE EL CLIENTE NO PUEDE VER?
 *
 * El predicado de publicación es el de la policy `esquema_pago_select` —`visible_portal AND
 * publicado_at IS NOT NULL`— y se pregunta por el mismo lado que lo pregunta el portal
 * (`publicadoAlPortal` en `src/app/portal/esquema.ts`). Preguntarlo distinto acá haría que el
 * control diga que está todo bien mientras el cliente ve otra cosa.
 *
 * Se mira SÓLO `estado = 'cobrado'`: una línea proyectada que todavía no se publicó es trabajo
 * pendiente de administración, no un defecto. Una COBRADA que no se publicó es plata que entró y
 * que el portal no refleja, que es lo que este control existe para encontrar.
 */
export function esCobroOculto(fila) {
  if (String(fila?.estado ?? '') !== 'cobrado') return false
  return !(fila?.visible_portal === true && fila?.publicado_at != null)
}

/**
 * LOS COBROS QUE EL PORTAL NO ESTÁ REFLEJANDO, agrupados por cliente y con su plata.
 *
 * Núcleo puro a propósito: es el control, y un control que sólo se puede correr contra la base
 * productiva no se puede probar en rojo. Ver `publicacion.test.mjs`.
 *
 * @param filas `[{ cliente_id, cliente, estado, monto, visible_portal, publicado_at, … }]`
 * @returns `[{ cliente_id, cliente, n, total, filas }]`, de más plata oculta a menos.
 */
export function cobrosOcultos(filas = []) {
  const porCliente = new Map()
  for (const f of filas) {
    if (!esCobroOculto(f)) continue
    const clave = String(f?.cliente_id ?? '')
    const previo = porCliente.get(clave)
      ?? { cliente_id: clave, cliente: f?.cliente ?? null, n: 0, total: 0, filas: [] }
    previo.n += 1
    // Un monto que no es número NO suma cero en silencio: sumarlo como 0 haría que el control
    // informe menos plata oculta de la que hay, que es la dirección equivocada para equivocarse.
    const m = Number(f?.monto)
    previo.total += Number.isFinite(m) ? m : 0
    previo.filas.push(f)
    porCliente.set(clave, previo)
  }
  return [...porCliente.values()].sort((a, b) => b.total - a.total)
}

/** La plata total que los cobros ocultos representan. `0` cuando no hay ninguno. */
export const plataOculta = (grupos = []) => grupos.reduce((s, g) => s + g.total, 0)

/**
 * GUARDA UN PAGO QUE EL SYNC TRAJO DEL SHEET. La sentencia vive acá y no en el script para que el
 * criterio de nacimiento y el `insert` que lo aplica no puedan volver a separarse.
 *
 * IDEMPOTENTE por `cobranza_fila`. Es UPSERT y nunca delete+insert: `esquema_pago` tiene columnas
 * PROPIAS de la app (`visible_portal`, `aviso_dias`, `nota_interna`, `orden`, `publicado_at`) que
 * el Sheet no conoce, y rehacer la fila borraría el trabajo de la pantalla 32 en cada corrida.
 *
 * QUÉ ESTÁ Y QUÉ NO ESTÁ EN EL `do update set`, y por qué importa:
 *
 *   · `visible_portal` y `publicado_at` van SÓLO en el `insert`. Apagar o despublicar una línea es
 *     una decisión de administración y el sync no puede deshacerla — ni siquiera para «corregir».
 *   · `orden` tampoco: la pantalla 32 deja reordenar a mano.
 *   · `estado` y `medio` SÍ: los declara la columna O del Sheet, que es su fuente.
 *
 * @param query el ejecutor. Se inyecta para que el test pueda correr dentro de una transacción que
 *   termina en ROLLBACK, en vez de tener que escribir en la base productiva para probar el efecto.
 */
export async function guardarPagoDelSync(p, { query }) {
  return await query(
    `insert into public.esquema_pago
       (cliente_id, cobranza_fila, huella_comprobante, huella_monto, concepto, fecha, monto,
        estado, medio, orden, origen, sincronizado_en, visible_portal, publicado_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'sync_cobranzas',now(),$11,
             case when $11 then now() else null end)
     on conflict (cobranza_fila) where cobranza_fila is not null do update
       set concepto = excluded.concepto, fecha = excluded.fecha, monto = excluded.monto,
           estado = excluded.estado, medio = excluded.medio,
           huella_comprobante = excluded.huella_comprobante, huella_monto = excluded.huella_monto,
           -- Cambió algo que el cliente ya había visto: se marca para que el admin lo publique.
           cambio_pendiente = (public.esquema_pago.publicado_at is not null
                               and (public.esquema_pago.fecha is distinct from excluded.fecha
                                    or public.esquema_pago.monto is distinct from excluded.monto)),
           sincronizado_en = now(), actualizado_at = now()
     where public.esquema_pago.origen = 'sync_cobranzas'`,
    [p.cliente_id, p.cobranza_fila, p.huella_comprobante, p.huella_monto, p.concepto, p.fecha,
      p.monto, p.estado, p.medio, p.orden ?? 0, NACE_VISIBLE_AL_CLIENTE],
  )
}

/**
 * EL UPSERT DEL CERTIFICADO — el documento que el cliente ve en la ficha y en el portal.
 *
 * Vive acá y no en el script por la misma razón que `guardarPagoDelSync`: es la regla de qué pisa y
 * qué respeta una corrida del sync, y desde el script no se puede probar sin escribir en la base
 * productiva.
 *
 * QUÉ CAMBIÓ EL 10/09/2026 Y POR QUÉ. El `do update` no tocaba `estado`. La factura 01-00000225 de
 * Messina está `Cobrado` en Cobranzas desde el 03/09 y el certificado seguía `emitido`: la ficha
 * pedía «Enviar recordatorio» por $6.060.479 ya cobrados. El estado del COBRO lo declara el Sheet y
 * ahora se refresca; el de APROBACIÓN —lo que el cliente contestó del documento— se respeta. Quién
 * gana en cada caso lo decide `estadoAGuardar`, que es puro y tiene test.
 *
 * `observacion` sigue sin tocarse: es texto que escribió el cliente y el Sheet no lo conoce.
 *
 * El estado guardado se lee ANTES del insert en vez de resolverse con un `case` en SQL para que la
 * regla exista una sola vez —en JavaScript, probada— y no dos, una de ellas escondida en el
 * `on conflict`.
 */
export async function guardarCertificadoDelSync(c, { query }) {
  // Sin `cobranza_fila` no hay conflicto posible (el índice único es parcial): la fila es nueva y el
  // estado proyectado es el que corresponde.
  const previo = c.cobranza_fila == null
    ? null
    : await query('select estado from public.certificado_cliente where cobranza_fila = $1',
      [c.cobranza_fila]).then((r) => r.rows[0]?.estado ?? null)
  const estado = estadoAGuardar(c.estado, previo)
  return await query(
    `insert into public.certificado_cliente
       (cliente_id, numero, factura, monto, emitido_at, vence, estado, cobranza_fila,
        huella_comprobante, huella_monto, origen, sincronizado_en)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'sync_cobranzas',now())
     on conflict (cobranza_fila) where cobranza_fila is not null do update
       set numero = excluded.numero, factura = excluded.factura, monto = excluded.monto,
           emitido_at = excluded.emitido_at, vence = excluded.vence, estado = excluded.estado,
           huella_comprobante = excluded.huella_comprobante, huella_monto = excluded.huella_monto,
           sincronizado_en = now(), actualizado_at = now()
     where public.certificado_cliente.origen = 'sync_cobranzas'`,
    [c.cliente_id, c.numero, c.factura, c.monto, c.emitido_at, c.vence, estado, c.cobranza_fila,
      c.huella_comprobante, c.huella_monto],
  )
}

/**
 * LA OTRA MITAD DEL MISMO PROBLEMA: filas que el sync YA NO PUEDE MANTENER.
 *
 * `sync-esquema-cliente.mjs` concilia por `cobranza_fila`; `portal-sembrar.mjs` concilia por
 * `(obra_id, orden)` y NO escribe `cobranza_fila`. Las filas que dejó el segundo son invisibles para
 * el primero: quedan congeladas en el estado del día que se sembraron, y son justo las que el
 * cliente ve.
 *
 * En San Francisco eso se lee así, el 07/09/2026: el portal publica «saldo del anticipo · 1ª de 2
 * cuotas» por $9.034.356,20 como *a vencer* (sembrada el 26/08, sin `cobranza_fila`), mientras la
 * fila 94 del Sheet dice que ese saldo se cobró el 04/09 por $8.067.936,50. El mismo dinero, dos
 * veces, y la copia que está al día es la que no se ve.
 *
 * POR QUÉ ESTO SE INFORMA Y NO SE ARREGLA SOLO: emparejar las dos representaciones exigiría un
 * criterio que no existe. Los montos no coinciden —el sembrador partió el saldo en dos mitades
 * iguales y el Sheet lo partió distinto— así que cualquier emparejamiento automático sería inventado.
 * Y publicar la fila nueva SIN retirar la vieja le mostraría al cliente el mismo cobro dos veces.
 */
export function filasQueElSyncNoAlcanza(filas = []) {
  return filas.filter((f) => f?.origen === 'sync_cobranzas' && f?.cobranza_fila == null)
}

/**
 * REPARA LOS COBROS QUE NACIERON OCULTOS POR EL DEFECTO — nunca automática.
 *
 * ═══ POR QUÉ SÓLO LOS COBRADOS, Y POR QUÉ ESO NO ES TIMIDEZ ═══
 *
 * Publicar en bloque TODO lo que el sync dejó sin publicar rompe el otro lado del portal, y está
 * medido contra la base el 07/09/2026 (transacción + rollback), en San Francisco:
 *
 *   en bloque (29 filas)     cobrado 133.797.709,50 → 141.865.646   PENDIENTE 77.660.038,90 → 87.660.814,80
 *   sólo cobrados (6 filas)  cobrado 133.797.709,50 → 141.865.646   PENDIENTE 77.660.038,90 → 77.660.038,90
 *
 * Los $10.000.775,90 que aparecen en el pendiente de la primera variante son la fila 95 del Sheet
 * publicándose AL LADO de las dos líneas viejas del sembrador ($9.034.356,20 cada una) que hablan
 * del mismo saldo. Es el mismo dinero reclamado dos veces — ver `filasQueElSyncNoAlcanza`. Corregir
 * lo que el cliente ya pagó no puede pagarse inventándole deuda.
 *
 * Un cobro percibido no tiene ese problema: no hay nada que reclamar y el cliente lo conoce mejor
 * que nosotros. El predicado es el MISMO de `esCobroOculto`, escrito en SQL: si los dos se
 * separaran, el control diría que quedó limpio mientras la reparación tocó otra cosa.
 *
 * NO alcanza a una línea que administración apagó a mano: ésa tiene `publicado_at` sellado de
 * cuando se publicó su esquema, y el `publicado_at is null` la deja afuera.
 *
 * ES NIVEL E: publica hacia afuera. Nunca se llama desde el timer — sólo con la bandera explícita
 * `--reparar-cobros-ocultos`, y la autoriza el dueño.
 */
export async function repararCobrosOcultos({ query }) {
  const { rows } = await query(
    `update public.esquema_pago
        set visible_portal = true, publicado_at = now(), actualizado_at = now()
      where origen = 'sync_cobranzas'
        and estado = 'cobrado'
        and publicado_at is null
        and visible_portal = false
      returning cliente_id, concepto, monto, fecha`)
  return rows
}
