-- LA POLÍTICA DE LA EMPRESA NO LA CAMBIA CUALQUIERA QUE VEA PRECIOS
--
-- ═══ QUÉ ENCONTRÓ LA AUDITORÍA DELTA (29/08/2026) ═══
--
-- `parametro_operativo` y `parametro_comercial` estaban cerradas con `ve_economia()`, que Dirección
-- Y Administración cumplen. El auditor entró como `administracion` y:
--
--   · reescribió `margen_objetivo_pct` a 99 — con eso NINGÚN presupuesto vuelve a marcarse bajo
--     objetivo, y nadie mira un precio antes de mandarlo;
--   · BORRÓ la fila — y la pantalla, sin umbral, deja de juzgar en silencio (que está bien: no
--     inventa un piso) pero la política de la empresa desapareció sin dejar rastro;
--   · movió `pct_beneficio` en `parametro_comercial`, que es el beneficio con el que cotiza toda
--     la empresa.
--
-- El contrato del cotizador ya lo dice: `set_global_policy` exige `GLOBAL_POLICY_WRITE`, y ese
-- permiso lo tiene SÓLO `DUENO` (`PERMISOS_DE_ROL` en `contrato.mjs`). Cambiar la política global no
-- es una escritura comercial más: es la decisión de la que cuelgan todas las demás. §17 lo separa
-- expresamente de lo comercial por cotización.
--
-- ═══ POR QUÉ ESTE ARCHIVO ES DE TRES LÍNEAS Y NO UN DISEÑO NUEVO ═══
--
-- `indirecto_concepto` —la misma clase de dato, creada el mismo día— ya quedó alineada así en la
-- `20260829T1500`. Acá se aplica ESE patrón, tal cual, a las dos tablas que quedaron afuera. Que
-- tres tablas hermanas tengan tres porteros distintos es cómo se cuela el agujero: el que se
-- olvidó.
--
-- ═══ EL `delete` SALE DEL GRANT ═══
--
-- Un umbral histórico NO se borra: se versiona. Las dos tablas tienen `version` y un índice único
-- parcial sobre `vigente`, o sea que el modelo ya sabe convivir con versiones viejas. Con `delete`
-- en el grant, la política de ayer se puede hacer desaparecer y una revisión posterior no puede
-- decir contra qué se cotizó. Se saca de las dos.
--
-- ADITIVA: no toca datos ni columnas. Sólo policies y grants.

-- ── 1 · parametro_operativo ───────────────────────────────────────────────────────────────────

drop policy if exists parametro_operativo_lectura   on public.parametro_operativo;
drop policy if exists parametro_operativo_escritura on public.parametro_operativo;

-- LA LECTURA NO SE ENDURECE: sigue por fila. Los cuatro umbrales no económicos son el motivo por el
-- que la pantalla de un jefe de obra marca una tarea, y negárselos lo dejaría sin poder entender lo
-- que está mirando. El portero envuelto en `(select ...)` corre una vez, no por fila.
create policy parametro_operativo_lectura on public.parametro_operativo
  for select to authenticated
  using (economico = false or (select public.ve_economia()));

create policy parametro_operativo_escritura on public.parametro_operativo
  for all to authenticated
  using ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE')))
  with check ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE')));

revoke delete on public.parametro_operativo from authenticated;
grant select, insert, update on public.parametro_operativo to authenticated;

-- ── 2 · parametro_comercial ───────────────────────────────────────────────────────────────────

drop policy if exists parametro_comercial_economia   on public.parametro_comercial;
drop policy if exists parametro_comercial_lectura    on public.parametro_comercial;
drop policy if exists parametro_comercial_escritura  on public.parametro_comercial;

-- La lectura SÍ es económica de punta a punta: son los ocho porcentajes con los que se cotiza.
create policy parametro_comercial_lectura on public.parametro_comercial
  for select to authenticated
  using ((select public.ve_economia()));

create policy parametro_comercial_escritura on public.parametro_comercial
  for all to authenticated
  using ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE')))
  with check ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE')));

revoke delete on public.parametro_comercial from authenticated;
grant select, insert, update on public.parametro_comercial to authenticated;

comment on table public.parametro_operativo is
  'Los umbrales operativos de la empresa, con su fuente y su estado. Cambiarlos exige '
  'GLOBAL_POLICY_WRITE (sólo Dirección): es política de la empresa, no una edición más. No se '
  'borran — se versionan.';
