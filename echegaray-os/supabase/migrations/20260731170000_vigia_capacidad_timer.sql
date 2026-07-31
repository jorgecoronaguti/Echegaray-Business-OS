-- EL VIGÍA TAMBIÉN VIGILA AL OS (31/07/2026)
--
-- POR QUÉ. El dueño: "proveedores sigue sin ser una pestaña viva, se siguen cargando compras y la
-- seccion 1 de proveedores y deuda no se actualiza". Se rediseñó la pestaña entera y la causa era
-- otra: `echegaray-proveedores.timer` estaba `enabled` y DETENIDO desde el 27/07 a las 16:48. La
-- pestaña se refrescaba sola cada 2 horas y dejó de hacerlo sin un solo aviso. Al arrancarlo, la
-- misma pestaña de siempre se refrescó sola y sin errores.
--
-- Al mirar el resto aparecieron CINCO timers más en el mismo estado, uno de ellos
-- `echegaray-orq-health.timer`: el que avisaría que los timers se murieron estaba entre los muertos.
--
-- `enabled` NO significa que corra: significa que arrancaría en el próximo arranque de la sesión. Un
-- timer enabled + inactive es una capacidad muerta que se ve viva en la lista de unidades. Vigilar
-- los datos y no vigilar lo que los trae deja el agujero exactamente donde nadie mira.
--
-- Los dos CHECK existían y rechazaron la escritura, que es lo correcto: el esquema decide qué tipos
-- hay. Esta migración agrega los dos que faltaban.

alter table public.vigia_fuentes drop constraint if exists vigia_fuentes_tipo_check;
alter table public.vigia_fuentes add constraint vigia_fuentes_tipo_check
  check (tipo = any (array[
    'drive_carpeta',
    'sheet_vinculado',
    'arca',
    'uocra_cct',
    'banco',
    -- una capacidad del OS que depende de un timer de systemd
    'capacidad_timer'
  ]));

alter table public.vigia_novedades drop constraint if exists vigia_novedades_tipo_check;
alter table public.vigia_novedades add constraint vigia_novedades_tipo_check
  check (tipo = any (array[
    'archivo_nuevo',
    'archivo_modificado',
    'sin_correlato',
    'sheet_modificado',
    'cobertura_atrasada',
    'valor_cambiado',
    'silencio',
    'ciega',
    -- un timer habilitado que no corre: lo que mantiene muestra el pasado como si fuera hoy
    'capacidad_muerta'
  ]));

comment on column public.vigia_fuentes.tipo is
  'Qué clase de fuente es. "capacidad_timer" no es un dato del negocio: es el OS vigilándose a sí mismo — un timer detenido deja una pestaña congelada sin dar ningún error.';
