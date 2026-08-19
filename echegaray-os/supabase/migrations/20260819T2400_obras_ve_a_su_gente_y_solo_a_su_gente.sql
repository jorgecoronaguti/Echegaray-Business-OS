-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- OBRAS VE A SU GENTE, Y SÓLO A SU GENTE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ DOS INSTRUCCIONES DEL MISMO DÍA QUE HAY QUE CONCILIAR ═══
--
-- 19/08, mañana: *"Un usuario Obras debe poder consultar clientes, contactos, personas,
-- proveedores… VER INFORMACIÓN OPERATIVA ≠ ADMINISTRAR EL MAESTRO."* Con eso se puso
-- `personas_select using (true)`: cualquier autenticado leía las 30 filas del legajo.
--
-- 19/08, tarde (módulo PERSONAL / HH): *"OBRAS: **ve las personas relacionadas con SUS obras**; ve
-- la información operativa necesaria… **Obras NO debe recibir información laboral sensible que no
-- necesita**."*
--
-- La segunda es más específica y no contradice a la primera: sigue siendo "ver ≠ administrar", pero
-- acota QUÉ FILAS. Un jefe de obra necesita el legajo operativo de la gente que trabaja en su obra;
-- no necesita el de los otros siete equipos. Y ESO SÍ lo puede hacer la RLS, porque es una decisión
-- de filas — que es lo único que la RLS decide.
--
-- La migración `T2200` había dejado `personas_select` en `es_administracion()` a secas. Eso rompe la
-- primera instrucción sin necesidad: cierra el legajo operativo de su propia gente al jefe que la
-- dirige. Se corrige acá.
--
-- ═══ LO QUE ESTE `where` NO HACE ═══
--
-- No abre una sola columna. `dni`, `cuil` y `retribucion_pactada` siguen fuera del grant por columna
-- (`T2300`), así que un jefe de obra que pida `select=*` sobre su propia gente recibe 42501, no un
-- legajo. Lo que ve es lo operativo, y de los suyos.
--
-- Y NO ES EL CAMINO DEL SELECTOR DE ASIGNACIÓN: para asignar a alguien por PRIMERA vez hay que poder
-- elegirlo de una lista donde todavía no está asignado. Eso lo sigue resolviendo `persona_plantel`,
-- que publica cinco columnas no sensibles y está declarada como desescalada en
-- `orquestador/lib/vistas-security-invoker.test.mjs`. Sin esa lista no existe la primera asignación.

drop policy if exists personas_select on public.personas;
create policy personas_select on public.personas
  for select to authenticated
  using (
    public.es_administracion()
    -- RELACIONADA CON SUS OBRAS = tiene una asignación en una obra que este usuario ve. Se cuentan
    -- también las asignaciones CERRADAS: quien trabajó en la obra el mes pasado sigue siendo parte
    -- de su historia, y su nombre tiene que poder resolverse en las horas ya imputadas.
    or exists (
      select 1 from public.obra_asignacion oa
      where oa.persona_id = personas.id
        and public.ve_obra(oa.obra_id)
    )
    -- O tiene horas imputadas en una obra que este usuario ve. Sin esto, cerrar una asignación
    -- dejaría las horas de esa persona con el nombre en blanco en la pantalla de la obra donde las
    -- trabajó — un dato que existe, mostrado como si faltara.
    or exists (
      select 1 from public.registros_hh h
      where h.persona_id = personas.id
        and h.obra_canonica_id is not null
        and public.ve_obra(h.obra_canonica_id)
    )
  );
