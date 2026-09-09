-- LA MISMA TRANSFERENCIA NO PUEDE ESTAR DOS VECES EN LA MISMA FICHA
--
-- La llave (gmail_message_id, gmail_attachment_id) de la migración de las 18:20 impide que una
-- segunda CORRIDA duplique. No impide lo otro, que ya pasó en el buzón real: el MISMO PDF
-- (`Comprobante_16625885.pdf`, comprobante 88101787) llega en DOS mails distintos —el enviado y su
-- copia en el hilo—, con message_id distinto. Para esa llave son dos archivos; para el proveedor es
-- un solo pago.
--
-- Lo que identifica un comprobante es su NÚMERO. Dos filas con el mismo número en la misma ficha
-- serían el mismo pago contado dos veces, y quien mire la ficha va a leer que se pagó el doble.
--
-- Los `comprobante_numero` en null no entran al índice (Postgres los considera distintos entre sí):
-- un papel del que no se pudo leer el número no bloquea a otro.
create unique index if not exists proveedor_documento_transferencia_numero_uidx
  on public.proveedor_documento (proveedor_id, comprobante_numero)
  where categoria = 'transferencia' and comprobante_numero is not null;
