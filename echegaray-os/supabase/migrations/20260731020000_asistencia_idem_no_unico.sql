-- LA CLAVE DE IDEMPOTENCIA DEJA DE SER ÚNICA PARA SIEMPRE.
--
-- POR QUÉ (31/07/2026, defecto encontrado en la primera prueba real desde Mattermost).
--
-- La clave es una función pura de archivo + pestaña + fecha + obra + quién + horas: para la
-- misma obra y el mismo día da SIEMPRE la misma. Con un índice ÚNICO sobre las sesiones
-- confirmadas, la primera carga de una obra en una fecha se quedaba con la clave para siempre,
-- y cualquier carga legítima posterior moría con `duplicate key value violates unique
-- constraint`. Pasó en producción: a la mañana se cargó Taller, después una persona vació la
-- celda a mano, y a la noche la carga nueva —celda vacía, acción 'nueva'— no podía entrar.
--
-- Es la misma familia de defecto que el auto-candado de pestaña: una protección que convierte
-- un falso positivo en una falla PERMANENTE en vez de una molestia pasajera.
--
-- QUÉ PROTEGE AHORA CADA COSA:
--   · que apretar Registrar dos veces no escriba dos veces → `asistencia_sesiones_una_abierta_idx`
--     (una sola sesión abierta por persona) y el `update ... where estado = 'abierta'`: el
--     segundo click pierde la carrera. Eso NO cambia.
--   · que una carga repetida no duplique horas → la PLANILLA: el núcleo relee cada celda y
--     compara su huella; si ya tiene lo mismo, queda `sin_cambio` y no se escribe nada.
--     Protege la celda, que es la unidad que importa, en vez de la memoria de una clave.
--
-- El índice sigue existiendo, no único: se usa para buscar por clave en la auditoría.

drop index if exists comunicacion.asistencia_sesiones_idem_idx;

create index if not exists asistencia_sesiones_idem_idx
  on comunicacion.asistencia_sesiones (idempotency_key)
  where idempotency_key is not null;

comment on index comunicacion.asistencia_sesiones_idem_idx is
  'Búsqueda por clave de idempotencia (trazabilidad). NO es único a propósito: la misma obra en la misma fecha genera siempre la misma clave, y una carga legítima posterior tiene que poder entrar. Quien evita la doble escritura es la huella de celda del núcleo.';
