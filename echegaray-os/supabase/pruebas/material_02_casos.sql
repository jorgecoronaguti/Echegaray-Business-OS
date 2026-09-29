-- MATERIAL: stock por lugar y remito. Cada caso corta el script si falla (raise exception).
-- Corre como el rol `authenticated` de verdad (set role), con RLS y grants, no como superusuario.
set client_min_messages to notice;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
create table t as
select (select id from public.ubicacion where tipo = 'taller') as taller,
       public.ubicacion_de_obra('ob-activa') as obra,
       public.ubicacion_de_obra('ob-otra') as otra;
grant select on t to authenticated;
insert into public.pedidos_materiales (id_pedido, obra_texto, obra_canonica_id, material, cantidad, unidad, estado)
values ('P1', 'SF', 'ob-activa', 'Cemento', 10, 'bolsa', 'PEDIDO'),
       ('P2', 'SF', 'ob-activa', 'Arena', 5, 'm3', 'PEDIDO');
set role authenticated;

-- 1 · «Llegó» parcial suma stock y deja el pedido abierto con su saldo
do $$ declare v numeric; v_e text; v_hay numeric; v_c int;
begin
  v := public.recibir_pedido_material('P1', 4);
  if v <> 4 then raise exception 'FALLÓ 1: acumulado %, esperaba 4', v; end if;
  select estado into v_e from pedidos_materiales where id_pedido = 'P1';
  if v_e = 'ENTREGADO' then raise exception 'FALLÓ 1: un parcial cerró el pedido'; end if;
  select e.cantidad into v_hay from material_existencia e join material m on m.id = e.material_id
   where m.nombre = 'Cemento' and e.ubicacion_id = (select obra from t);
  if v_hay is distinct from 4 then raise exception 'FALLÓ 1: stock en la obra %, esperaba 4', v_hay; end if;
  v := public.recibir_pedido_material('P1');   -- null = lo que falta; cierra el pedido
  select estado into v_e from pedidos_materiales where id_pedido = 'P1';
  if v <> 10 or v_e <> 'ENTREGADO' then raise exception 'FALLÓ 1: total %, estado %', v, v_e; end if;
  select count(*) into v_c from material_movimiento where tipo = 'entrada';
  if v_c <> 2 then raise exception 'FALLÓ 1: el libro tiene % entradas, esperaba 2', v_c; end if;
  raise notice 'OK 1 · llegada parcial + resto: 4 y 10, ENTREGADO recién al completar';
end $$;

-- 2 · No puede llegar más de lo que falta, ni recibirse dos veces un entregado
do $$ begin
  begin perform public.recibir_pedido_material('P2', 6); raise exception 'FALLÓ 2: aceptó 6 de 5';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.recibir_pedido_material('P1', 1); raise exception 'FALLÓ 2: recibió un pedido ya entregado';
  exception when sqlstate 'P0001' then null; end;
  raise notice 'OK 2 · no llega más de lo pedido ni se recibe dos veces';
end $$;

-- 3 · Traslado: saldo por lugar, remito 1 con sus ítems, y no se mueve más de lo que hay
do $$ declare v_mat uuid; v_r uuid; v_n int; v_o numeric; v_d numeric; v_items int;
begin
  select id into v_mat from material where nombre = 'Cemento';
  v_r := public.mover_material(jsonb_build_array(jsonb_build_object('material', v_mat, 'cantidad', 3)),
                               (select obra from t), (select taller from t), 'Pedro (taller)', 'sobrante');
  select numero into v_n from remito where id = v_r;
  if v_n <> 1 then raise exception 'FALLÓ 3: primer remito con número %', v_n; end if;
  select cantidad into v_o from material_existencia where material_id = v_mat and ubicacion_id = (select obra from t);
  select cantidad into v_d from material_existencia where material_id = v_mat and ubicacion_id = (select taller from t);
  if v_o <> 7 or v_d <> 3 then raise exception 'FALLÓ 3: obra %, taller % (esperaba 7 y 3)', v_o, v_d; end if;
  select count(*) into v_items from remito_item where remito_id = v_r and cantidad = 3;
  if v_items <> 1 then raise exception 'FALLÓ 3: el remito no lleva el ítem'; end if;
  begin
    perform public.mover_material(jsonb_build_array(jsonb_build_object('material', v_mat, 'cantidad', 8)),
                                  (select obra from t), (select otra from t));
    raise exception 'FALLÓ 3: movió 8 habiendo 7';
  exception when sqlstate 'P0001' then null; end;
  select max(numero) into v_n from remito;
  if v_n <> 1 then raise exception 'FALLÓ 3: el traslado rechazado dejó un remito (número %)', v_n; end if;
  select cantidad into v_o from material_existencia where material_id = v_mat and ubicacion_id = (select obra from t);
  if v_o <> 7 then raise exception 'FALLÓ 3: el rechazo tocó el stock (%)', v_o; end if;
  raise notice 'OK 3 · traslado deja 7/3, remito 1; el rechazo no deja rastro';
end $$;

-- 4 · El correlativo no tiene huecos: el rechazado no consumió número, el siguiente es el 2
do $$ declare v_mat uuid; v_r uuid; v_n int;
begin
  select id into v_mat from material where nombre = 'Cemento';
  v_r := public.mover_material(jsonb_build_array(jsonb_build_object('material', v_mat, 'cantidad', 2)),
                               (select obra from t), (select otra from t));
  select numero into v_n from remito where id = v_r;
  if v_n <> 2 then raise exception 'FALLÓ 4: el siguiente remito es %, esperaba 2', v_n; end if;
  raise notice 'OK 4 · correlativo sin huecos (1, 2)';
end $$;

-- 5 · «Usé» resta y no deja pasar de lo que hay; el recuento corrige y queda en el libro
do $$ declare v_mat uuid; v_hay numeric; v_c int;
begin
  select id into v_mat from material where nombre = 'Cemento';
  perform public.usar_material(v_mat, (select obra from t), 5);
  select cantidad into v_hay from material_existencia where material_id = v_mat and ubicacion_id = (select obra from t);
  if v_hay is not null then raise exception 'FALLÓ 5: quedó % en la obra (esperaba sin fila)', v_hay; end if;
  begin perform public.usar_material(v_mat, (select obra from t), 1); raise exception 'FALLÓ 5: usó lo que no había';
  exception when sqlstate 'P0001' then null; end;
  perform public.ajustar_material(v_mat, (select taller from t), 1, 'recuento', 'faltaban dos');
  select cantidad into v_hay from material_existencia where material_id = v_mat and ubicacion_id = (select taller from t);
  select count(*) into v_c from material_movimiento where tipo = 'ajuste' and origen_id is not null and cantidad = 2;
  if v_hay <> 1 or v_c <> 1 then raise exception 'FALLÓ 5: taller %, ajustes %', v_hay, v_c; end if;
  raise notice 'OK 5 · usé y recuento cierran, y el libro guarda la diferencia';
end $$;

-- 6 · La cuenta cierra: saldo total = entradas - consumos +/- ajustes
do $$ declare v_dif numeric;
begin
  select coalesce((select sum(cantidad) from material_existencia), 0) -
         coalesce((select sum(case when tipo = 'entrada' then cantidad when tipo = 'consumo' then -cantidad
                                   when tipo = 'ajuste' and destino_id is not null then cantidad
                                   when tipo = 'ajuste' then -cantidad else 0 end) from material_movimiento), 0)
    into v_dif;
  if v_dif <> 0 then raise exception 'FALLÓ 6: el saldo difiere del libro en %', v_dif; end if;
  raise notice 'OK 6 · saldo = libro';
end $$;

-- 7 · Escribir directo no se puede: ni cantidad_recibida, ni el saldo, ni el libro, ni un remito
do $$ begin
  begin update pedidos_materiales set cantidad_recibida = 99 where id_pedido = 'P2'; raise exception 'FALLÓ 7: escribió cantidad_recibida directo';
  exception when sqlstate '42501' then null; end;
  begin insert into material_existencia values ((select id from material limit 1), (select taller from t), 50); raise exception 'FALLÓ 7: escribió el saldo';
  exception when sqlstate '42501' then null; end;
  begin delete from material_movimiento; raise exception 'FALLÓ 7: borró el libro';
  exception when sqlstate '42501' then null; end;
  begin update remito set numero = 77; raise exception 'FALLÓ 7: editó un remito';
  exception when sqlstate '42501' then null; end;
  begin update remito_contador set ultimo = 0; raise exception 'FALLÓ 7: tocó el contador';
  exception when sqlstate '42501' then null; end;
  update pedidos_materiales set nota = 'ok' where id_pedido = 'P2';   -- lo que ya se hacía sigue andando
  raise notice 'OK 7 · nada de eso se escribe directo, y editar la nota del pedido sigue andando';
end $$;

-- 8 · El jefe opera; el campo no opera y no ve lo ajeno
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ declare v_mat uuid;
begin
  select id into v_mat from material where nombre = 'Cemento';
  perform public.ajustar_material(v_mat, (select taller from t), 1, 'recuento');
  raise notice 'OK 8a · el jefe de obra opera';
end $$;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', false);
do $$ declare v_mat uuid; v_ajena int;
begin
  select id into v_mat from material where nombre = 'Cemento';
  begin perform public.usar_material(v_mat, (select otra from t), 1); raise exception 'FALLÓ 8: el campo operó';
  exception when sqlstate '42501' then null; end;
  begin perform public.recibir_pedido_material('P2', 1); raise exception 'FALLÓ 8: el campo dio «Llegó»';
  exception when sqlstate '42501' then null; end;
  select count(*) into v_ajena from material_existencia where ubicacion_id in ((select otra from t), (select taller from t));
  if v_ajena <> 0 then raise exception 'FALLÓ 8: el campo ve stock del Taller o de otra obra (%)', v_ajena; end if;
  -- Los dos remitos salen de SU obra: los ve. Uno entre Taller y otra obra no lo vería (no hay ninguno para probarlo).
  if (select count(*) from remito) <> 2 then raise exception 'FALLÓ 8: el campo debería ver los 2 remitos de su obra'; end if;
  raise notice 'OK 8b · el campo no opera y no ve lo ajeno';
end $$;
reset role;
do $$ begin raise notice 'MATERIAL: todos los casos pasaron'; end $$;
