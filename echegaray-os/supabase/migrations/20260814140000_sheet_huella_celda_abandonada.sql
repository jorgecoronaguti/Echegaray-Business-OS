-- EL FOOTPRINT DEL GENERADOR: LA CELDA QUE OCUPÉ Y HOY YA NO OCUPO — la cuarta evidencia (14/08).
--
-- POR QUÉ. En "Jornales por Quincena" el dueño corrigió a mano tres veces —y volvió tres veces— el
-- mismo residuo: cuando un cuadro cambia de alto, la fila que el layout nuevo ya no usa se queda con
-- lo que el layout anterior tenía ahí. El generador SÍ pide limpiarla (el centinela VACIO de
-- `cola-de-rango`), pero no podía PROBAR que la celda era suya, y sin prueba `aplicarHuella` la
-- declara ajena y `fusionar` la conserva.
--
-- La prueba se destruía sola: una celda escrita con VACIO no tiene contenido, así que no sella huella
-- nueva, y el barrido de cada corrida se llevaba la vieja — exactamente la que probaba la propiedad.
--
-- `abandonada_en` es esa prueba, y es la simétrica de `borrada_en`:
--
--   borrada_en    = la vaciaste VOS   → no la vuelvo a escribir nunca
--   abandonada_en = la dejé de ocupar YO, y la forma sellada dice qué dejé ahí
--                   → si lo que hay hoy TODAVÍA tiene esa forma, es residuo mío y se limpia
--                   → si tiene otra forma, escribiste encima y se conserva
--                   → sin registro, la celda no se toca jamás, aunque esté adentro de mi rectángulo
--
-- Como `borrada_en`, NO se limpia con el barrido de cada corrida: la corrida que no puede decidir
-- (alineación por debajo del umbral) no devuelve celdas desocupadas, y si la marca se barriera ahí el
-- residuo volvería a quedar sin dueño demostrable. Se sale de ella de una sola forma: que la celda
-- vuelva a llevar contenido propio, y entonces el upsert de `huellasDeEscritura` la levanta.

alter table public.sheet_huella_celda add column if not exists abandonada_en timestamptz;

comment on column public.sheet_huella_celda.abandonada_en is
  'El generador ocupó esta celda y su layout actual ya no la ocupa. Junto con forma, es la prueba de que un residuo publicado en esa coordenada es propio y se puede limpiar. NULL = la ocupo hoy, o nunca la ocupé.';
