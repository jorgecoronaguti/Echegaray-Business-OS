-- «EMILIANO», «EMI», «JP», «RODRI»: EL LISTADO VIEJO DE HERRAMIENTAS APUNTA A SU USUARIO (dueño, 24/09/2026:
-- «noto nombres distintos en distintas secciones de la app»; en Herramientas salía «Emiliano» a secas
-- entre «Juan Pablo Nievas» y «Jorge Corona»).
--
-- Los 106 movimientos importados del AppSheet (`importado = true`) traían al responsable como texto
-- libre y sin usuario: «Emiliano» (38), «Rodrigo» (21), «rodrigo@ecsas.com.ar» (16), «Emi» (7), «Jp» (3),
-- «rodri» (2), «EMI», «RODRI», «JORGE», «juampi», «JUAMPI». La pantalla dibujaba el texto tal cual, y la
-- misma persona se llamaba de cuatro maneras.
--
-- Se completa `usuario_id` SÓLO cuando el texto nombra sin ambigüedad a UNA cuenta del OS:
--   · Emiliano / Emi → hys@ (Emiliano Maldonado, jefe de HyS). INFERENCIA: hay otro Emiliano en el
--     plantel (González Tobares), pero no tiene cuenta y el listado lo llevaba quien usaba el AppSheet.
--   · Jp / juampi → ingenieria@ (Juan Pablo Nievas).
--   · Rodrigo / rodri / rodrigo@ecsas.com.ar → rodrigo@.
--   · JORGE → jorge@.
-- «Seba Quiroga» y «marcelo» NO se tocan: no tienen cuenta propia (la de Quiroga es la de demo) y
-- atarlos a una sería inventar. Siguen mostrando su texto.
--
-- `usuario_texto` NO se borra: es la evidencia de lo que decía el listado. Deshacer es
-- `update activo_movimiento set usuario_id = null where importado and usuario_texto is not null`.
update public.activo_movimiento m
   set usuario_id = u.id
  from auth.users u
 where m.importado
   and m.usuario_id is null
   and u.email = (case lower(btrim(m.usuario_texto))
                   when 'emiliano' then 'hys@ecsas.com.ar'
                   when 'emi' then 'hys@ecsas.com.ar'
                   when 'jp' then 'ingenieria@ecsas.com.ar'
                   when 'juampi' then 'ingenieria@ecsas.com.ar'
                   when 'rodrigo' then 'rodrigo@ecsas.com.ar'
                   when 'rodri' then 'rodrigo@ecsas.com.ar'
                   when 'rodrigo@ecsas.com.ar' then 'rodrigo@ecsas.com.ar'
                   when 'jorge' then 'jorge@ecsas.com.ar'
                 end);
