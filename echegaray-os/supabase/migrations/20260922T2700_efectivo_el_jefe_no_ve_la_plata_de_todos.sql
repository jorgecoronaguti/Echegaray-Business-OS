-- EL EFECTIVO EN LA MANO DE CADA UNO DEJA DE SER LECTURA GENERAL (auditoría de permisos, 22/09/2026).
--
-- ═══ EL AGUJERO, MEDIDO ═══
--
-- La 20260922T1500 abrió `efectivo_entrega` a `es_administracion()`, que desde el 19/08/2026 INCLUYE al
-- Jefe de obra (migración 20260819T4900, decisión del dueño). La pantalla «Mi efectivo» del nivel Obras
-- filtra por persona en la CONSULTA (`.eq('persona_id', …)` en `features/efectivo/campo/datos.ts`), y el
-- propio archivo lo dejaba escrito: «SÓLO LO SUYO, Y LO FILTRA LA CONSULTA — NO LA BASE». PostgREST no
-- filtra nada. Medido contra producción con el token de los dos jefes de obra reales:
--
--   GET /rest/v1/efectivo_entrega?select=codigo,persona_id,monto  (token de ingenieria@ecsas.com.ar,
--   rol jefe_obra, SIN una sola entrega propia) → 200
--   [{"codigo":"ER-0001",…},{"codigo":"ER-0002",…},{"codigo":"ER-0004","persona_id":"02533578-…","monto":100.00}]
--
--   GET /rest/v1/efectivo_entrega_saldo?select=codigo,persona,en_su_poder → 200
--   [{"codigo":"ER-0004","persona":"MALDONADO BATISTA EMILIANO MIGUEL","en_su_poder":100.00}]
--
-- Un jefe de obra leía, con nombre y apellido, cuánta plata de la empresa tiene en la mano cualquier
-- persona del plantel. Una pantalla no es una cerradura.
--
-- ═══ POR QUÉ NO SE CIERRA «POR SU OBRA» ═══
--
-- Parecía el criterio natural —el jefe ve el efectivo de SU gente en SU obra— y NO SIRVE como cerradura:
-- `ve_obra()` devuelve true para TODAS las obras cuando el rol es `jefe_obra` (migración 20260819T4600,
-- también del dueño: «si dice jefe de obra en el permiso, pueda ver todas las obras»). Cerrar por obra
-- sería cerrar por nada: escribiría una barrera que no barre y dejaría el agujero exactamente igual, con
-- la apariencia de estar tapado. Con la distinción ambigua, se cierra a lo propio y se declara; el dueño
-- desempata después si quiere abrirlo a la gente asignada a la obra (haría falta un criterio nuevo, no
-- `ve_obra`).
--
-- ═══ EL CRITERIO ═══
--
--   · `ve_economia()`  → Dirección y Administración ven TODO, como hasta ahora. Es la función que ya
--     separa «administrar los maestros» de «ver la plata», y la plata en la mano de una persona es plata.
--   · Mi persona        → cada uno ve SUS entregas. Es lo que sostiene todo el teléfono.
--   · `entregada_por`   → quien ENTREGÓ la plata ve esa entrega. Un jefe de obra puede entregar efectivo
--     (`_efectivo_exigir_administracion()`, sin cambios acá): si no pudiera leer lo que él mismo entregó,
--     la pantalla se le rompería en el renglón siguiente al de entregar.
--
-- ═══ LA TRAMPA QUE YA MORDIÓ HOY (migración 2100) ═══
--
-- Cerrar de más deja a la gente sin ver SU PROPIA plata. La rama `p_persona = mi_persona_id()` es la
-- primera que se mide después de aplicar esto, con el token del dueño de la entrega, contra PostgREST.
-- Nada se toca de `efectivo_entrega_saldo` ni de `efectivo_comprobante_estado`: son `security_invoker` y
-- heredan exactamente esta cerradura — por eso el arreglo va acá y no en las vistas.
--
-- ═══ LO QUE NO CAMBIA ═══
--
-- Ninguna función de escritura. Entregar, firmar, devolver, observar, descartar e imputar siguen pidiendo
-- `es_administracion()` — la decisión del dueño del 22/09 («los mismos permisos que Compras») es sobre
-- quién OPERA el módulo, y este archivo es sobre quién LEE la plata ajena.
--
-- Sin DDL pesado: son cuatro policies y una función. No toma locks sobre datos.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create or replace function public.ve_efectivo_entrega(p_persona uuid, p_entregada_por uuid)
returns boolean
language sql stable
set search_path = public as $$
  select coalesce(
       public.ve_economia()
    or p_persona = public.mi_persona_id()
    or p_entregada_por = (select auth.uid()),
  false)
$$;

comment on function public.ve_efectivo_entrega(uuid, uuid) is
  'Si el usuario puede LEER una entrega de efectivo: Dirección y Administración (ve_economia()), la '
  'persona que la recibió, y quien la entregó. NO usa ve_obra(): para jefe_obra devuelve true en toda '
  'obra, así que cerrar por obra no cerraría nada.';

revoke all on function public.ve_efectivo_entrega(uuid, uuid) from public, anon;
grant execute on function public.ve_efectivo_entrega(uuid, uuid) to authenticated;

drop policy if exists efectivo_entrega_select on public.efectivo_entrega;
create policy efectivo_entrega_select on public.efectivo_entrega for select to authenticated
  using (public.ve_efectivo_entrega(persona_id, entregada_por));

-- Las tres derivadas siguen a su entrega: se ve la devolución, la rendición y el ticket de las entregas
-- que se pueden ver, y de ninguna otra. Hoy las tres tienen CERO filas — un permiso que todavía no
-- filtró nada porque la tabla está vacía no es un permiso correcto: es una bomba con la mecha apagada.
drop policy if exists efectivo_devolucion_select on public.efectivo_devolucion;
create policy efectivo_devolucion_select on public.efectivo_devolucion for select to authenticated
  using (public.ve_economia() or exists (
    select 1 from public.efectivo_entrega e
     where e.id = entrega_id and public.ve_efectivo_entrega(e.persona_id, e.entregada_por)));

drop policy if exists efectivo_rendicion_select on public.efectivo_rendicion;
create policy efectivo_rendicion_select on public.efectivo_rendicion for select to authenticated
  using (public.ve_economia() or exists (
    select 1 from public.efectivo_entrega e
     where e.id = entrega_id and public.ve_efectivo_entrega(e.persona_id, e.entregada_por)));

drop policy if exists efectivo_comprobante_select on public.efectivo_comprobante;
create policy efectivo_comprobante_select on public.efectivo_comprobante for select to authenticated
  using (public.ve_economia() or exists (
    select 1 from public.efectivo_entrega e
     where e.id = entrega_id and public.ve_efectivo_entrega(e.persona_id, e.entregada_por)));

notify pgrst, 'reload schema';
