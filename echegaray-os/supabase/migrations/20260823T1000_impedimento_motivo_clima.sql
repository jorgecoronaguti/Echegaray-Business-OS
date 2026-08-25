-- EL CLIMA ES UN MOTIVO REAL DE IMPEDIMENTO (23/08/2026 · Design canónico, pantallas 11 y M07).
--
-- El vocabulario del CHECK no lo tenía y el mobile del empleado no podía declararlo: una lluvia
-- que frena el frente entraba como «sin_clasificar», que es exactamente la clase de dato que
-- después nadie puede agregar por causa. Forward-only: se AMPLÍA el vocabulario, ninguna fila
-- existente cambia.

alter table public.obra_restriccion
  drop constraint obra_restriccion_tipo_check;

alter table public.obra_restriccion
  add constraint obra_restriccion_tipo_check check (tipo = any (array[
    'material'::text, 'informacion'::text, 'equipo'::text, 'mano_de_obra'::text,
    'trabajo_previo'::text, 'permiso'::text, 'ingenieria_cliente'::text, 'seguridad'::text,
    'acceso'::text, 'contrato'::text, 'clima'::text, 'sin_clasificar'::text, 'otro'::text
  ]));
