-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA FIRMA DE UN OVERRIDE NO SE REESCRIBE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `firmarOverrideDePrecio` hacía `on conflict … do update` y fallaba con permission denied (42501):
-- la tabla otorga select+insert y no hay policy de UPDATE. La única salida que el sistema le ofrece
-- al dueño para los 285 precios vencidos NO FUNCIONABA por la vía que el código provee.
--
-- Se cierra SIN agregar UPDATE, a propósito. Una firma es un hecho y §21 dice que la historia no se
-- borra: re-firmar no es corregir. Si el motivo cambió, cambió porque pasó algo nuevo, y eso es otro
-- hecho. El código pasa a `do nothing` y devuelve la firma que ya estaba, con quién y cuándo.
--
-- Esta migración NO cambia permisos ni estructura: deja escrita la decisión en el comentario de la
-- tabla, que es donde la va a leer el que se pregunte por qué no puede editar su propio motivo.

comment on table public.cotizacion_override_precio is
  'Quien asumio un precio vencido y por que. NO es un flag: autorizado_por es NOT NULL con default '
  'auth.uid(), asi que un override sin firma no se puede insertar. Es la unica forma de destrabar '
  'un PRECIO_DESACTUALIZADO. '
  'INMUTABLE POR DISENO: no hay GRANT ni policy de UPDATE, y el codigo usa on conflict do nothing. '
  'Una firma es un hecho (§21: la historia no se borra); si el motivo cambio es porque paso algo '
  'nuevo, y eso es otro hecho, no una correccion del anterior.';

comment on column public.cotizacion_override_precio.autorizado_por is
  'NOT NULL con default auth.uid(), y la policy exige autorizado_por = auth.uid(): nadie firma en '
  'nombre de otro. Es la misma regla que cotizacion_evento.actor.';
