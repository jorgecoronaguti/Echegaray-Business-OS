-- UNA COMPOSICIÓN CONGELADA NO SE REESCRIBE.
--
-- ═══ QUÉ ENCONTRÓ LA AUDITORÍA ═══
--
-- `FROZEN ≠ MUTABLE` es uno de los invariantes que el programa exige con test negativo, y en la base
-- no existía. La única policy sobre `cotizacion_partida_composicion` era:
--
--     cotizacion_composicion_economia · cmd ALL · qual (select ve_economia())
--
-- O sea: cualquiera con permiso de economía podía UPDATE o DELETE sobre las líneas de una cotización
-- YA CONGELADA. Y el congelado es exactamente el acto que dice «esto no cambia más»: la oferta que
-- se le mandó al cliente sale de ahí, la obra hereda su plan de ahí, y la huella que certifica la
-- versión se calcula sobre eso. Reescribir una línea congelada no rompe un dato: rompe la palabra
-- dada, y en silencio — nada en el sistema lo habría notado.
--
-- El motor ya se negaba a congelar sin gate. Lo que faltaba era que, DESPUÉS de congelar, la base
-- sostuviera sola lo que el motor prometió. Un control que vive sólo en el código no protege a la
-- tabla de quien entra por otra puerta.
--
-- ═══ POR QUÉ UN TRIGGER Y NO UNA POLICY ═══
--
-- Una policy `with check` sobre UPDATE se puede satisfacer con la fila resultante y no alcanza a
-- DELETE sin duplicar la condición. El trigger corre para las dos operaciones, mira la cotización
-- padre y no depende del rol: vale para `authenticated`, para el rol de servicio y para cualquiera
-- que llegue mañana. Lo que se congeló, se congeló para todos.
--
-- No bloquea INSERT: agregar una línea a una cotización congelada ya lo impide el gate del motor, y
-- una revisión nueva se crea copiando, no insertando sobre la vieja.

create or replace function public.una_composicion_congelada_no_se_reescribe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_congelada timestamptz;
  v_numero    text;
begin
  select c.congelada_en, c.numero
    into v_congelada, v_numero
    from public.cotizaciones c
   where c.id = coalesce(old.cotizacion_id, new.cotizacion_id);

  if v_congelada is not null then
    raise exception
      'la cotizacion % esta congelada desde el % y su composicion no se reescribe: para cambiarla se crea una revision nueva',
      coalesce(v_numero, '?'), v_congelada
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.una_composicion_congelada_no_se_reescribe is
  'FROZEN != MUTABLE. Antes de esto, cualquiera con ve_economia() podia UPDATE/DELETE sobre las '
  'lineas de una cotizacion congelada - la misma de la que salio la oferta al cliente y el plan de '
  'la obra. La auditoria lo midio preguntandole a la base, no leyendo el codigo.';

drop trigger if exists composicion_congelada_no_se_reescribe on public.cotizacion_partida_composicion;

create trigger composicion_congelada_no_se_reescribe
  before update or delete on public.cotizacion_partida_composicion
  for each row execute function public.una_composicion_congelada_no_se_reescribe();
