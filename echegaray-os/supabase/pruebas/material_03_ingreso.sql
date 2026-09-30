-- MATERIAL: ingreso sin pedido (20260930T1500). Corre DESPUÉS de material_02_casos.sql, sobre su estado,
-- como el rol `authenticated` de verdad (set role), con RLS y grants.
set client_min_messages to notice;
set role authenticated;

-- 11 · El jefe ingresa stock inicial al Taller: suma saldo, crea el material y deja una entrada sin pedido
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ declare v_mat uuid; v_hay numeric; v_c int; v_antes numeric; v_mat2 uuid;
begin
  select coalesce(sum(cantidad), 0) into v_antes from material_existencia;
  v_mat := public.ingresar_material('Hierro del 8', 'tira', (select taller from t), 12.5, 'stock inicial del Taller');
  select cantidad into v_hay from material_existencia where material_id = v_mat and ubicacion_id = (select taller from t);
  if v_hay is distinct from 12.5 then raise exception 'FALLÓ 11: saldo %, esperaba 12.5', v_hay; end if;
  select count(*) into v_c from material_movimiento where material_id = v_mat and tipo = 'entrada' and pedido_id is null and nota = 'stock inicial del Taller';
  if v_c <> 1 then raise exception 'FALLÓ 11: % entradas sin pedido, esperaba 1', v_c; end if;
  -- el mismo nombre con otra caja y espacios es el MISMO material (catálogo por nombre+unidad)
  v_mat2 := public.ingresar_material('  hierro DEL 8 ', 'Tira', (select obra from t), 3, 'compra directa');
  if v_mat2 <> v_mat then raise exception 'FALLÓ 11: duplicó el material en el catálogo'; end if;
  raise notice 'OK 11 · ingreso sin pedido suma saldo, usa el catálogo y queda en el libro con su origen';
end $$;

-- 12 · Sin origen, cantidad cero o un lugar que no es depósito: se rechaza y no queda nada
do $$ declare v_c0 int; v_c1 int;
begin
  select count(*) into v_c0 from material_movimiento;
  begin perform public.ingresar_material('Cal', 'bolsa', (select taller from t), 2, '  '); raise exception 'FALLÓ 12: ingresó sin origen';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.ingresar_material('Cal', 'bolsa', (select taller from t), 0, 'compra'); raise exception 'FALLÓ 12: ingresó cero';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.ingresar_material('Cal', 'bolsa', gen_random_uuid(), 2, 'compra'); raise exception 'FALLÓ 12: ingresó a un lugar inexistente';
  exception when sqlstate 'P0001' then null; end;
  select count(*) into v_c1 from material_movimiento;
  if v_c1 <> v_c0 then raise exception 'FALLÓ 12: un rechazo dejó % asientos', v_c1 - v_c0; end if;
  raise notice 'OK 12 · sin origen, cero o lugar inválido: rechazado y sin rastro';
end $$;

-- 13 · El campo no ingresa
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', false);
do $$ begin
  begin perform public.ingresar_material('Cal', 'bolsa', (select obra from t), 2, 'compra directa'); raise exception 'FALLÓ 13: el campo ingresó stock';
  exception when sqlstate '42501' then null; end;
  raise notice 'OK 13 · el campo no ingresa';
end $$;

-- 14 · El libro sigue cerrando contra el saldo con las entradas sin pedido adentro
reset role;
do $$ declare v_dif numeric;
begin
  select coalesce((select sum(cantidad) from material_existencia), 0) -
         coalesce((select sum(case when tipo = 'entrada' then cantidad when tipo in ('consumo', 'anulacion') then -cantidad
                                   when tipo = 'ajuste' and destino_id is not null then cantidad
                                   when tipo = 'ajuste' then -cantidad else 0 end) from material_movimiento), 0)
    into v_dif;
  if v_dif <> 0 then raise exception 'FALLÓ 14: saldo y libro difieren en %', v_dif; end if;
  raise notice 'OK 14 · el libro cierra con los ingresos sin pedido';
end $$;
do $$ begin raise notice 'MATERIAL INGRESO: todos los casos pasaron'; end $$;
