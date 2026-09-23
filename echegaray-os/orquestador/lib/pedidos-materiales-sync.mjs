// LO QUE EL SYNC DEL SHEET PUEDE Y NO PUEDE TOCAR EN `pedidos_materiales`.
//
// Desde el 23/09/2026 la tabla tiene tres procedencias: `appsheet_sheet` (el espejo del Sheet), `os` (un
// pedido del Sheet decidido acá) y `app` (pedido desde la app, teléfono o computadora). El sync sólo
// manda sobre la primera. La regla vive en el SQL y acá se declara sola para que un test la afirme
// sin correr el script (`sync-pedidos-materiales.mjs` ejecuta `main()` al importarse).

/** La única procedencia que el sync escribe. Lo demás no es suyo. */
export const ORIGEN_DEL_SHEET = 'appsheet_sheet'

/** El prefijo de un `id_pedido` cargado desde la app (`pedir_material`). El Sheet usa números y hashes. */
export const PREFIJO_ID_APP = 'APP-'

/**
 * El upsert del sync: inserta lo nuevo y actualiza SÓLO lo que ya era del Sheet. Nunca borra.
 * Parámetros: $1 id_pedido · $2 obra_texto · $3 obra_id · $4 fecha · $5 material · $6 cantidad · $7 estado.
 */
export const SQL_UPSERT_PEDIDO = `insert into public.pedidos_materiales (id_pedido, obra_texto, obra_id, fecha, material, cantidad, estado, origen, sincronizado_en)
       values ($1,$2,$3,$4,$5,$6,$7,'${ORIGEN_DEL_SHEET}', now())
       on conflict (id_pedido) do update set
         obra_texto=excluded.obra_texto, obra_id=excluded.obra_id, fecha=excluded.fecha,
         material=excluded.material, cantidad=excluded.cantidad, estado=excluded.estado,
         sincronizado_en=now()
       where public.pedidos_materiales.origen = '${ORIGEN_DEL_SHEET}'`

/** ¿Este id puede ser una fila del Sheet? Un id de la app nunca entra por el sync. */
export const esIdDelSheet = (idPedido) => !String(idPedido ?? '').startsWith(PREFIJO_ID_APP)
