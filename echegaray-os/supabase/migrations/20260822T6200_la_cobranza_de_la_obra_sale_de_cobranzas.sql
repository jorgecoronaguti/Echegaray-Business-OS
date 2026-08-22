-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LO QUE LA OBRA COBRÓ SALE DE COBRANZAS, NO DE UNA TABLA VACÍA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL DEFECTO, MEDIDO EN PRODUCCIÓN (22/08/2026) ═══
--
-- `obra_plan_vs_real` saca `certificado`, `facturado` y `cobrado` de la tabla `certificados`, que
-- tiene CERO filas. La cobranza real vive en `public.cobranzas` (origen `cobranzas_sheet`) con la
-- obra en TEXTO LIBRE en `obra_cliente` y sin `obra_canonica_id`. Resultado medido sobre la obra
-- `quattropani` (Salón Comercial):
--
--     panel:      cobrado NULL · pendiente_cobrar 0
--     cobranzas:  13 filas · $79.333.819,31 ya cobrados · $59.078.250 por cobrar
--
-- El «0» es lo peor de los dos: `cobrado NULL` al menos dice «no sé». `pendiente_cobrar = 0` es
-- `coalesce(certificado,0) - coalesce(cobrado,0)` sobre una tabla vacía, y AFIRMA que no queda nada
-- por cobrar mientras hay $59M en el calendario. Un cero calculado sobre dos ausencias no es un
-- dato: es una ausencia con cara de dato.
--
-- ═══ CERTIFICADO ≠ FACTURADO ≠ COBRADO — TRES HECHOS, TRES FUENTES ═══
--
-- No se fusionan. `certificados` sigue siendo la fuente de CERTIFICADO y FACTURADO (lo que el
-- cliente reconoció y lo que se le facturó). `cobranzas` es la fuente de COBRADO y POR COBRAR (lo
-- que entró y lo que está agendado para entrar). Que hoy la primera esté vacía no autoriza a que la
-- segunda conteste por ella: si el día de mañana alguien carga un certificado, las dos magnitudes
-- tienen que poder discrepar — esa discrepancia es exactamente la lectura «físico > certificado» que
-- anticipa un conflicto de cobro.
--
-- ═══ CÓMO SE RESUELVE LA OBRA: EL MISMO DICCIONARIO QUE EL COSTO ═══
--
-- `norm_obra(cobranzas.obra_cliente) = obra_alias.alias`, exactamente el criterio de
-- `obra_costo_real` (20260719160000) y de `ve_obra_texto`. UN solo criterio de resolución en toda la
-- casa: un `like` o un «contiene» propio de esta vista emparejaría
-- «IMOTOR/San Francisco/JAVI SANCHEZ» con San Francisco por parecido, y adivinar en la dirección de
-- afirmar plata cobrada es la peor dirección posible.
--
-- Sólo entran los alias con `clasificacion in ('obra','mantenimiento')`: `indirecto` es Estructura y
-- no tiene contrato que cobrar.
--
-- LO QUE NO RESUELVE, NO RESUELVE — y por eso la vista publica `n_cobranzas`. Medido hoy, dos
-- rótulos del Sheet no están en el diccionario y sus cobranzas no llegan a ninguna obra:
--
--     «LA ESTRELLA /ALIMENTOS DEL SUR SAS»  → norm: «estrella alimentos sur sas»  (17 filas)
--     «IMOTOR/San Francisco/JAVI SANCHEZ»   → norm: «imotor san francisco javi sanchez» (9 filas)
--
-- Se arregla agregando dos filas a `obra_alias`, que es declarar «este rótulo es esta obra». Eso lo
-- firma una persona, no una migración: nadie más que el dueño puede decir que ese texto compuesto
-- pertenece a una obra y no a otra.
--
-- ═══ EL SIGNO DE «COBRADO»: EL ESTADO MANDA, PERO LA FECHA VETA ═══
--
-- `estado = 'Cobrado'` con `fecha_cobro` en el futuro es percibido imposible —el mismo control que
-- ya hace `repasar-cobranzas-y-caja.mjs` con el rótulo «COBRADOS con fecha de cobro FUTURA»—. Esa
-- fila cae en POR COBRAR, no en COBRADO: ante una contradicción del origen, la vista elige el lado
-- que no afirma plata que todavía no entró.
--
-- ═══ BRUTO Y NETO SE PUBLICAN LOS DOS, PORQUE MIDEN COSAS DISTINTAS ═══
--
-- `total_bruto` lleva IVA y es lo que entra al banco: ése es el número de CAJA (percibido).
-- `monto_neto` es la venta sin IVA y es el único comparable contra `monto_contratado`, que es neto.
-- Restar un cobrado con IVA de un contrato sin IVA es mezclar dos criterios (regla de oro 3), y da
-- una obra que «ya cobró más de lo que vendió». Se publican los dos, con el nombre puesto.
--
-- Y hay filas donde `monto_neto` es NULL y `iva` no —la fila «IVA de Factura 220» de quattropani,
-- $6.510.000—: el neto se cobró en otra fila y ésta es sólo su IVA. Por eso `cobrado_neto` NO es
-- `cobrado` menos algo: es su propia suma, y puede tener menos filas detrás.
--
-- ═══ POR QUÉ `security_invoker = false` CON PORTERO ADENTRO ═══
--
-- `authenticated` NO tiene `select` sobre `cobranzas` (verificado: sólo TRUNCATE/REFERENCES/TRIGGER).
-- Una vista invoker daría «permission denied» a la web entera. La alternativa —dar `grant select` a
-- `authenticated`— abriría la tabla de ventas a todo el que tenga sesión, y esta migración no está
-- para ensanchar permisos. Corre como dueña y lleva `ve_economia()` en el `where`, igual que
-- `obra_forecast_economico`: quien no ve la plata no recibe filas, y ningún grant se mueve.

create or replace view public.obra_cobranza with (security_invoker = false) as
with clasificada as (
  select a.obra_id,
         (lower(btrim(coalesce(cb.estado, ''))) = 'cobrado'
          and (cb.fecha_cobro is null or cb.fecha_cobro <= current_date)) as esta_cobrada,
         cb.total_bruto,
         cb.monto_neto
    from public.cobranzas cb
    join public.obra_alias a
      on a.alias = public.norm_obra(cb.obra_cliente)
   where a.obra_id is not null
     and a.clasificacion in ('obra', 'mantenimiento')
), por_obra as (
  select obra_id,
         count(*)::int                                            as n_cobranzas,
         count(*) filter (where esta_cobrada)::int                as n_cobradas,
         sum(total_bruto) filter (where esta_cobrada)             as cobrado,
         sum(monto_neto)  filter (where esta_cobrada)             as cobrado_neto,
         sum(total_bruto) filter (where not esta_cobrada)         as por_cobrar_proyectado
    from clasificada
   group by obra_id
)
select oc.id                                as obra_id,
       oc.nombre                            as obra,
       coalesce(p.n_cobranzas, 0)           as n_cobranzas,
       coalesce(p.n_cobradas, 0)            as n_cobradas,
       -- SIN FILAS, NULL. Una obra sin ninguna cobranza cargada no cobró «$0»: no se sabe. El 0 es
       -- el dato sólo cuando hay filas y ninguna está cobrada — y ahí sí lo dice `n_cobranzas`.
       p.cobrado,
       p.cobrado_neto,
       p.por_cobrar_proyectado
  from public.obra_canonica oc
  left join por_obra p on p.obra_id = oc.id
 where public.ve_economia();

comment on view public.obra_cobranza is
  'FUENTE ÚNICA de lo COBRADO y lo POR COBRAR de cada obra. Sale de `cobranzas` resuelta por '
  '`norm_obra(obra_cliente) = obra_alias.alias` —el mismo diccionario que `obra_costo_real`, sin un '
  'segundo criterio—. `cobrado` es bruto (lo que entra al banco); `cobrado_neto` es sin IVA y es el '
  'único comparable contra el contrato. Una fila «Cobrado» con fecha futura cuenta como POR COBRAR. '
  'Sin filas, NULL: no cobró $0, no se sabe. Corre como dueña con ve_economia() en el WHERE porque '
  '`authenticated` no tiene select sobre `cobranzas`.';

grant select on public.obra_cobranza to authenticated;
grant select on public.obra_cobranza to service_role;
