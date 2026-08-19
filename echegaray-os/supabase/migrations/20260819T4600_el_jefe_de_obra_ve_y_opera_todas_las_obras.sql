-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL CORTE ES ECONÓMICO, NO POR OBRA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El dueño, textual (19/08/2026): *"necesito que si dice «jefe de obra» en el permiso de usuario,
-- pueda ver todas las obras"* · *"y editar"* · *"administración tiene acceso a todo lo relacionado a
-- económico, es decir montos de ventas y cotizaciones. jefes de obra puede acceder a todo lo demás"*.
--
-- Hasta hoy `ve_obra()` le daba a un jefe SÓLO las obras que alguien le hubiera vinculado en
-- `usuario_obra`. Esa tabla nunca se cargó del todo, así que en la práctica un jefe entraba a la app
-- y no veía nada — y el modelo tampoco era el que la empresa quiere: acá los tres jefes rotan entre
-- las ocho obras.
--
-- ═══ LO QUE NO CAMBIA: LO ECONÓMICO SIGUE CERRADO ═══
--
-- Esto abre lo OPERATIVO —cronograma, ejecución, personal asignado, HH, impedimentos, documentos—.
-- No toca una sola de las barreras económicas, que viven en otro lado y siguen igual:
--
--   · `obra_canonica.monto_contratado` no tiene GRANT de SELECT para `authenticated`.
--   · `personas.retribucion_pactada`, `notas` y `drive_folder_id`, tampoco (lista blanca).
--   · Certificados, márgenes y costo real se leen por vistas con `es_administracion()` adentro.
--
-- Un jefe que pueda planificar las ocho obras sigue sin poder ver cuánto se vendió ninguna.
--
-- ═══ POR QUÉ SE MANTIENE LA RAMA DE `usuario_obra` ═══
--
-- No sobra: es el mecanismo para un rol acotado que todavía no existe —un contratista, un cliente
-- mirando su obra—. Borrarla hoy obligaría a reinventarla el día que haga falta, y no cuesta nada.

create or replace function public.ve_obra(p_obra text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select public.es_administracion()
      -- El jefe de obra opera TODAS las obras. Lo económico no pasa por acá.
      or public.current_rol() = 'jefe_obra'
      or exists (
        select 1 from public.usuario_obra uo
        where uo.usuario_id = auth.uid()
          and uo.obra_canonica_id = p_obra
      )
$function$;

comment on function public.ve_obra(text) is
  'Si el usuario puede OPERAR esta obra. Administración y Dirección, todas; jefe de obra, todas; '
  'cualquier otro rol, sólo las vinculadas en usuario_obra. NO habilita nada económico: eso se '
  'cierra por grants de columna y por vistas con es_administracion() adentro.';
