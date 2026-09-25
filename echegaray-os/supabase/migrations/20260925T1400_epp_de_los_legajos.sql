-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · LAS CONSTANCIAS DE EPP DE LOS LEGAJOS, ESTRUCTURADAS COMO ENTREGAS HISTÓRICAS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 25/09/2026: «en algunos empleados, en el legajo, está el documento de EPP; analizalo y
-- estructurá bien todo como corresponde».
--
-- Fuente: 13 constancias Res. SRT 299/11 (Anexo I) firmadas, escaneadas, en Drive
-- «administracion/PERSONAL: ALTAS - BAJAS - HM - EPP - DNI/{1. ACTIVOS | 2. INACTIVOS}/<persona>/EPP - *.pdf».
-- No tenían texto (escaneos): se leyeron página por página el 25/09 y se transcribieron acá renglón por
-- renglón. «PLANILLA DE EPP.xlsx» de la misma carpeta es la plantilla vacía (con el ejemplo de 2018): no
-- se carga.
--
-- ═══ CÓMO QUEDA CADA RENGLÓN ═══
-- Una ENTREGA HISTÓRICA: movimiento con origen null (no sale de ningún lugar: NO descuenta del stock de
-- hoy) hacia el lugar de la persona, con la fecha de la constancia, la cantidad, lo que dice el papel
-- (producto, tipo, marca, certificación) en la nota y la constancia como respaldo
-- (`respaldo_drive_file_id`). Quién entregó: el papel no lo dice → «constancia firmada».
-- El ítem es el del catálogo del mismo tipo (el producto real si coincide, si no el genérico); la marca
-- del papel queda en la nota. Sin talle en el papel → el ítem «sin talle» de ese tipo (talle null), que
-- se crea si no existe: no se elige un talle que el papel no dice.
--
-- ═══ LO QUE NO SE CARGA (dudas) ═══
--   · Peralta Alexander, renglón 5: guantes de vaqueta SG con fecha «31/11/25» (no existe).
--   · Santander Walter, renglón 5: «Guantes», modelo tachado («Soldador») y reescrito «amarillo», SG.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

alter table public.activo_movimiento add column respaldo_drive_file_id text
  check (respaldo_drive_file_id is null or respaldo_drive_file_id ~ '^[A-Za-z0-9_-]{10,80}$');
comment on column public.activo_movimiento.respaldo_drive_file_id is
  'El papel que respalda el movimiento (en Drive): la constancia SRT 299/11 firmada de una entrega histórica.';

do $$
declare
  r record; v_act uuid; v_ubic uuid; v_n int := 0; v_nuevos int := 0;
begin
  create temp table _renglon (
    orden int, persona uuid, drive text, fecha date, tipo text, talle text, cantidad int, papel text
  ) on commit drop;
  insert into _renglon values
  -- AGÜERO CRISTIAN (activo) · EPP - Agüero Cristian.pdf
  (1,  '1ff87d94-0b78-4308-aff5-e0f4c6fbd553', '19046gvCV0DW-E8Vwy9LCKPkoOFiVjzyo', '2025-05-26', 'anteojos_oscuros', null, 1, 'Gafas · oscuras · Libus · cert. sí'),
  (2,  '1ff87d94-0b78-4308-aff5-e0f4c6fbd553', '19046gvCV0DW-E8Vwy9LCKPkoOFiVjzyo', '2025-05-26', 'guantes_multiflex', null, 1, 'Guantes · m. flex · Prowork · cert. sí'),
  (3,  '1ff87d94-0b78-4308-aff5-e0f4c6fbd553', '19046gvCV0DW-E8Vwy9LCKPkoOFiVjzyo', '2025-05-28', 'botin', null, 1, 'Zapatos · p/acero · Pegaso · cert. sí'),
  (4,  '1ff87d94-0b78-4308-aff5-e0f4c6fbd553', '19046gvCV0DW-E8Vwy9LCKPkoOFiVjzyo', '2025-05-28', 'pantalon_jeans', null, 1, 'Pantalón · jean · Fullback · cert. sí'),
  (5,  '1ff87d94-0b78-4308-aff5-e0f4c6fbd553', '19046gvCV0DW-E8Vwy9LCKPkoOFiVjzyo', '2025-05-28', 'casco', null, 1, 'Casco · con arnés · Libus · cert. sí'),
  (6,  '1ff87d94-0b78-4308-aff5-e0f4c6fbd553', '19046gvCV0DW-E8Vwy9LCKPkoOFiVjzyo', '2025-05-28', 'chaleco', null, 1, 'Chaleco · reflectivo · cert. sí'),
  -- MALDONADO EMILIANO (activo) · EPP - Emiliano Maldonado.pdf
  (7,  '02533578-fcdb-43d4-b124-ced0ea0dab9a', '19tpYpScpBSkQQ1zs6QwkctUZWq2iIyTT', '2025-05-26', 'botin', null, 1, 'Zapatos · p/acero · Ombú · cert. sí'),
  (8,  '02533578-fcdb-43d4-b124-ced0ea0dab9a', '19tpYpScpBSkQQ1zs6QwkctUZWq2iIyTT', '2025-05-26', 'camisa', null, 1, 'Camisa · jean · Fullback · cert. sí'),
  (9,  '02533578-fcdb-43d4-b124-ced0ea0dab9a', '19tpYpScpBSkQQ1zs6QwkctUZWq2iIyTT', '2025-05-26', 'pantalon_jeans', null, 1, 'Pantalón · jean · Fullback · cert. sí'),
  (10, '02533578-fcdb-43d4-b124-ced0ea0dab9a', '19tpYpScpBSkQQ1zs6QwkctUZWq2iIyTT', '2025-05-26', 'casco', null, 1, 'Casco · c/arnés · Libus · cert. sí'),
  (11, '02533578-fcdb-43d4-b124-ced0ea0dab9a', '19tpYpScpBSkQQ1zs6QwkctUZWq2iIyTT', '2025-05-26', 'chaleco', null, 1, 'Chaleco · reflectivo · cert. sí'),
  -- QUIROGA SEBASTIÁN (activo) · EPP - Quiroga Sebastian.pdf
  (12, '48703f23-6bc3-4d95-a08c-b7a4a739bf50', '1Iwz43-qgbSLgbbMHRd1s1eD7i6Uo-Kan', '2025-06-24', 'guantes_multiflex', null, 1, 'Guantes · m. flex · DPS · cert. sí'),
  (13, '48703f23-6bc3-4d95-a08c-b7a4a739bf50', '1Iwz43-qgbSLgbbMHRd1s1eD7i6Uo-Kan', '2025-07-24', 'guantes_vaqueta', null, 1, 'Guantes · vaqueta · SG · cert. sí'),
  (14, '48703f23-6bc3-4d95-a08c-b7a4a739bf50', '1Iwz43-qgbSLgbbMHRd1s1eD7i6Uo-Kan', '2025-08-25', 'botin', null, 1, 'Zapatos · c/punta acero · Pegaso · cert. sí'),
  (15, '48703f23-6bc3-4d95-a08c-b7a4a739bf50', '1Iwz43-qgbSLgbbMHRd1s1eD7i6Uo-Kan', '2025-08-25', 'camisa', null, 1, 'Camisa · jean · Fullback · cert. no'),
  (16, '48703f23-6bc3-4d95-a08c-b7a4a739bf50', '1Iwz43-qgbSLgbbMHRd1s1eD7i6Uo-Kan', '2025-08-25', 'pantalon_jeans', null, 1, 'Pantalón · jean · Fullback · cert. no'),
  (17, '48703f23-6bc3-4d95-a08c-b7a4a739bf50', '1Iwz43-qgbSLgbbMHRd1s1eD7i6Uo-Kan', '2025-09-01', 'anteojos_oscuros', null, 1, 'Gafas · oscuras · Libus · cert. sí'),
  (18, '48703f23-6bc3-4d95-a08c-b7a4a739bf50', '1Iwz43-qgbSLgbbMHRd1s1eD7i6Uo-Kan', '2025-09-01', 'guantes_vaqueta', null, 1, 'Guantes · vaqueta · SG · cert. sí'),
  -- FERREYRA ALEJANDRO (inactivo) · EPP - FERREYRA A.pdf
  (19, '1c9ee7ec-a80e-4a20-9db1-c0863bdb545b', '18s9dk5ZOQOvgGm1sKgAjTBBnDG1WRzR_', '2025-05-28', 'camisa', 'M', 1, 'Camisa · jeans M · Fullback · cert. sí'),
  (20, '1c9ee7ec-a80e-4a20-9db1-c0863bdb545b', '18s9dk5ZOQOvgGm1sKgAjTBBnDG1WRzR_', '2025-05-28', 'pantalon_jeans', '44', 1, 'Pantalón · jeans 44 · Fullback · cert. sí'),
  (21, '1c9ee7ec-a80e-4a20-9db1-c0863bdb545b', '18s9dk5ZOQOvgGm1sKgAjTBBnDG1WRzR_', '2025-05-28', 'botin', null, 1, 'Zapatos · seguridad · Pampero · cert. sí'),
  (22, '1c9ee7ec-a80e-4a20-9db1-c0863bdb545b', '18s9dk5ZOQOvgGm1sKgAjTBBnDG1WRzR_', '2025-05-28', 'casco', null, 1, 'Casco · seguridad · Libus · cert. sí'),
  (23, '1c9ee7ec-a80e-4a20-9db1-c0863bdb545b', '18s9dk5ZOQOvgGm1sKgAjTBBnDG1WRzR_', '2025-05-28', 'chaleco', null, 1, 'Chaleco · reflectivo · Top Safe · cert. sí'),
  -- FERREYRA EZEQUIEL (inactivo) · EPP - FERREYRA E.pdf
  (24, 'ca63f348-d5c2-4b24-85e7-18a10d822b45', '19fu9z61SmPMlY_EXfO6pr37-Lk9kJvXw', '2025-05-28', 'camisa', 'M', 1, 'Camisa · jeans M · Fullback · cert. sí'),
  (25, 'ca63f348-d5c2-4b24-85e7-18a10d822b45', '19fu9z61SmPMlY_EXfO6pr37-Lk9kJvXw', '2025-05-28', 'pantalon_jeans', '46', 1, 'Pantalón · jeans 46 · Fullback · cert. sí'),
  (26, 'ca63f348-d5c2-4b24-85e7-18a10d822b45', '19fu9z61SmPMlY_EXfO6pr37-Lk9kJvXw', '2025-05-28', 'botin', null, 1, 'Zapatos · seguridad · Ombú · cert. sí'),
  (27, 'ca63f348-d5c2-4b24-85e7-18a10d822b45', '19fu9z61SmPMlY_EXfO6pr37-Lk9kJvXw', '2025-05-28', 'casco', null, 1, 'Casco · seguridad · Libus · cert. sí'),
  (28, 'ca63f348-d5c2-4b24-85e7-18a10d822b45', '19fu9z61SmPMlY_EXfO6pr37-Lk9kJvXw', '2025-05-28', 'chaleco', null, 1, 'Chaleco · reflectivo · Top Safe · cert. sí'),
  -- FERREYRA RODOLFO (inactivo) · EPP - FERREYRA R.pdf — el talle de la camisa no se lee
  (29, '66d3f4bc-fb0e-4a7c-a914-7748a8ab6706', '19IzKXfw0C413QGlqpjVnF5BvpmR92Ea4', '2025-05-28', 'camisa', null, 1, 'Camisa · jeans (talle ilegible: ¿L? ¿XL?) · Fullback · cert. sí'),
  (30, '66d3f4bc-fb0e-4a7c-a914-7748a8ab6706', '19IzKXfw0C413QGlqpjVnF5BvpmR92Ea4', '2025-05-28', 'pantalon_jeans', '44', 1, 'Pantalón · jeans 44 · Fullback · cert. sí'),
  (31, '66d3f4bc-fb0e-4a7c-a914-7748a8ab6706', '19IzKXfw0C413QGlqpjVnF5BvpmR92Ea4', '2025-05-28', 'botin', null, 1, 'Zapatos · seguridad · Ombú · cert. sí'),
  (32, '66d3f4bc-fb0e-4a7c-a914-7748a8ab6706', '19IzKXfw0C413QGlqpjVnF5BvpmR92Ea4', '2025-05-28', 'casco', null, 1, 'Casco · seguridad · Libus · cert. sí'),
  (33, '66d3f4bc-fb0e-4a7c-a914-7748a8ab6706', '19IzKXfw0C413QGlqpjVnF5BvpmR92Ea4', '2025-05-28', 'chaleco', null, 1, 'Chaleco · reflectivo · Top Safe · cert. sí'),
  -- GALVÁN GUADALUPE (inactivo) · EPP - GALVAN.pdf — la fecha del renglón 1 se lee «(8/05/2025)»
  (34, '5a54808d-adef-415b-bc15-20c7073b4aee', '19f_K1Og6Am_KJJcoifJA2O8eNcvcMb2H', '2025-05-28', 'botin', null, 1, 'Zapatos · seguridad · Pegaso · cert. sí · fecha leída «(8/05/2025)», probable 28/05 como los otros dos renglones'),
  (35, '5a54808d-adef-415b-bc15-20c7073b4aee', '19f_K1Og6Am_KJJcoifJA2O8eNcvcMb2H', '2025-05-28', 'casco', null, 1, 'Casco · seguridad · Libus · cert. sí'),
  (36, '5a54808d-adef-415b-bc15-20c7073b4aee', '19f_K1Og6Am_KJJcoifJA2O8eNcvcMb2H', '2025-05-28', 'chaleco', null, 1, 'Chaleco · reflectivo · Top Safe · cert. sí'),
  -- PERALTA ALEXANDER (inactivo) · EPP - PERALTA ALEXANDER.pdf — renglón 5 («31/11/25») no se carga
  (37, 'c8bfbd76-e23a-44a5-8493-8d44cff6b594', '1xUXu1wCeCxhzxrYOeZpP2doDE6d__W0g', '2025-08-25', 'guantes_descarne', null, 1, 'Guantes · descarne · Canor · cert. sí'),
  (38, 'c8bfbd76-e23a-44a5-8493-8d44cff6b594', '1xUXu1wCeCxhzxrYOeZpP2doDE6d__W0g', '2025-09-15', 'guantes_vaqueta', null, 1, 'Guantes · vaqueta · sin marca · cert. sí'),
  (39, 'c8bfbd76-e23a-44a5-8493-8d44cff6b594', '1xUXu1wCeCxhzxrYOeZpP2doDE6d__W0g', '2025-10-13', 'guantes_vaqueta', null, 1, 'Guantes · vaqueta · SG · cert. sí'),
  (40, 'c8bfbd76-e23a-44a5-8493-8d44cff6b594', '1xUXu1wCeCxhzxrYOeZpP2doDE6d__W0g', '2025-10-22', 'anteojos_oscuros', null, 1, 'Gafas · oscuras · Libus · cert. sí'),
  (41, 'c8bfbd76-e23a-44a5-8493-8d44cff6b594', '1xUXu1wCeCxhzxrYOeZpP2doDE6d__W0g', '2025-11-05', 'pantalon_jeans', null, 1, 'Pantalón · jean · Solimin · cert. no'),
  (42, 'c8bfbd76-e23a-44a5-8493-8d44cff6b594', '1xUXu1wCeCxhzxrYOeZpP2doDE6d__W0g', '2025-11-05', 'botin', null, 1, 'Zapatos · c/punta acero · Voran · cert. sí'),
  (43, 'c8bfbd76-e23a-44a5-8493-8d44cff6b594', '1xUXu1wCeCxhzxrYOeZpP2doDE6d__W0g', '2025-11-25', 'casco', null, 1, 'Casco · Milenium · Libus · cert. sí'),
  (44, 'c8bfbd76-e23a-44a5-8493-8d44cff6b594', '1xUXu1wCeCxhzxrYOeZpP2doDE6d__W0g', '2025-11-25', 'camisa', null, 1, 'Camisa · jean · Solimin · cert. no'),
  (45, 'c8bfbd76-e23a-44a5-8493-8d44cff6b594', '1xUXu1wCeCxhzxrYOeZpP2doDE6d__W0g', '2025-11-25', 'chaleco', null, 1, 'Chaleco · reflectivo · cert. no'),
  -- PERALTA RICARDO (inactivo) · EPP - PERALTA RICARDO.pdf — renglón 4: el día se lee «3» o «5»
  (46, '42c99e48-f429-45eb-8be8-fd109a299f2f', '19lyqrNO6jkaOS59jOcUgVbgUuCKFBNzJ', '2025-08-22', 'guantes_descarne', null, 1, 'Guantes · descarne · Canor · cert. sí'),
  (47, '42c99e48-f429-45eb-8be8-fd109a299f2f', '19lyqrNO6jkaOS59jOcUgVbgUuCKFBNzJ', '2025-09-16', 'guantes_descarne', null, 1, 'Guantes · descarne · Canor · cert. sí'),
  (48, '42c99e48-f429-45eb-8be8-fd109a299f2f', '19lyqrNO6jkaOS59jOcUgVbgUuCKFBNzJ', '2025-10-03', 'anteojos_oscuros', null, 1, 'Gafas · oscuras · Libus · cert. sí'),
  (49, '42c99e48-f429-45eb-8be8-fd109a299f2f', '19lyqrNO6jkaOS59jOcUgVbgUuCKFBNzJ', '2025-11-05', 'pantalon_jeans', null, 1, 'Pantalón · jean · Solimin · cert. no · el día se lee «3» o «5» (se toma 5/11, el del botín del mismo papel)'),
  (50, '42c99e48-f429-45eb-8be8-fd109a299f2f', '19lyqrNO6jkaOS59jOcUgVbgUuCKFBNzJ', '2025-11-05', 'botin', null, 1, 'Zapatos · c/punta acero · Voran · cert. sí'),
  (51, '42c99e48-f429-45eb-8be8-fd109a299f2f', '19lyqrNO6jkaOS59jOcUgVbgUuCKFBNzJ', '2025-11-06', 'guantes_descarne', null, 1, 'Guantes · soldador · Canor · cert. sí'),
  (52, '42c99e48-f429-45eb-8be8-fd109a299f2f', '19lyqrNO6jkaOS59jOcUgVbgUuCKFBNzJ', '2025-11-20', 'anteojos_oscuros', null, 1, 'Anteojos · oscuros · Libus · cert. sí'),
  (53, '42c99e48-f429-45eb-8be8-fd109a299f2f', '19lyqrNO6jkaOS59jOcUgVbgUuCKFBNzJ', '2025-11-25', 'casco', null, 1, 'Casco · Milenium · Libus · cert. sí'),
  (54, '42c99e48-f429-45eb-8be8-fd109a299f2f', '19lyqrNO6jkaOS59jOcUgVbgUuCKFBNzJ', '2025-11-25', 'camisa', null, 1, 'Camisa · jean · Solimin · cert. no'),
  (55, '42c99e48-f429-45eb-8be8-fd109a299f2f', '19lyqrNO6jkaOS59jOcUgVbgUuCKFBNzJ', '2025-11-25', 'chaleco', null, 1, 'Chaleco · reflectivo · cert. no'),
  (56, '42c99e48-f429-45eb-8be8-fd109a299f2f', '19lyqrNO6jkaOS59jOcUgVbgUuCKFBNzJ', '2025-11-27', 'guantes_descarne', null, 1, 'Guantes · soldador · Canor · cert. sí'),
  -- POBLETE LUIS (inactivo) · EPP - POBLETE.pdf
  (57, '8ceb86d2-faed-4bec-b3ec-86951fb71225', '19AtWsjllWb9RYVhZNV-FrIrAm0BKd7Cd', '2025-05-28', 'camisa', 'L', 1, 'Camisa · jeans L · Fullback · cert. sí'),
  (58, '8ceb86d2-faed-4bec-b3ec-86951fb71225', '19AtWsjllWb9RYVhZNV-FrIrAm0BKd7Cd', '2025-05-28', 'pantalon_jeans', '48', 1, 'Pantalón · jeans 48 · Fullback · cert. sí'),
  (59, '8ceb86d2-faed-4bec-b3ec-86951fb71225', '19AtWsjllWb9RYVhZNV-FrIrAm0BKd7Cd', '2025-05-28', 'botin', '42', 1, 'Zapatos · seguridad 42 · Ombú · cert. sí'),
  (60, '8ceb86d2-faed-4bec-b3ec-86951fb71225', '19AtWsjllWb9RYVhZNV-FrIrAm0BKd7Cd', '2025-05-28', 'casco', null, 1, 'Casco · seguridad · Libus · cert. sí'),
  (61, '8ceb86d2-faed-4bec-b3ec-86951fb71225', '19AtWsjllWb9RYVhZNV-FrIrAm0BKd7Cd', '2025-05-28', 'chaleco', null, 1, 'Chaleco · reflectivo · Top Safe · cert. sí'),
  -- QUIROGA JULIO CÉSAR (inactivo) · EPP - Quiroga Julio.pdf
  (62, 'af5b629a-6d71-4439-b92d-f977ec3640bf', '1ObAKtWNDYog7NFpObi0DSWD8ovCAAAM1', '2025-08-22', 'pantalon_jeans', null, 1, 'Pantalón · jean · Fullback · cert. no'),
  (63, 'af5b629a-6d71-4439-b92d-f977ec3640bf', '1ObAKtWNDYog7NFpObi0DSWD8ovCAAAM1', '2025-08-22', 'camisa', null, 1, 'Camisa · jean · Fullback · cert. no'),
  (64, 'af5b629a-6d71-4439-b92d-f977ec3640bf', '1ObAKtWNDYog7NFpObi0DSWD8ovCAAAM1', '2025-08-22', 'botin', null, 1, 'Zapatos · c/punta acero · Pegaso · cert. sí'),
  (65, 'af5b629a-6d71-4439-b92d-f977ec3640bf', '1ObAKtWNDYog7NFpObi0DSWD8ovCAAAM1', '2025-08-22', 'guantes_vaqueta', null, 1, 'Guantes · vaqueta · SG · cert. sí'),
  (66, 'af5b629a-6d71-4439-b92d-f977ec3640bf', '1ObAKtWNDYog7NFpObi0DSWD8ovCAAAM1', '2025-08-22', 'anteojos_oscuros', null, 1, 'Gafas · oscuras · Libus · cert. sí'),
  (67, 'af5b629a-6d71-4439-b92d-f977ec3640bf', '1ObAKtWNDYog7NFpObi0DSWD8ovCAAAM1', '2025-08-22', 'chaleco', null, 1, 'Chaleco · reflectivo · SG · cert. sí'),
  -- SALINAS CARLOS (inactivo) · EPP - Salinas Carlos.pdf
  (68, 'b555c1be-28d3-4647-a9b7-f8b9a2734f66', '1TDypvhLgNE0ipNs1LOfC_MYpkgCrXqe3', '2025-08-22', 'pantalon_jeans', null, 1, 'Pantalón · jean · Fullback · cert. no'),
  (69, 'b555c1be-28d3-4647-a9b7-f8b9a2734f66', '1TDypvhLgNE0ipNs1LOfC_MYpkgCrXqe3', '2025-08-22', 'camisa', null, 1, 'Camisa · jean · Fullback · cert. no'),
  (70, 'b555c1be-28d3-4647-a9b7-f8b9a2734f66', '1TDypvhLgNE0ipNs1LOfC_MYpkgCrXqe3', '2025-08-22', 'botin', null, 1, 'Zapatos · c/punta acero · Pegaso · cert. sí'),
  (71, 'b555c1be-28d3-4647-a9b7-f8b9a2734f66', '1TDypvhLgNE0ipNs1LOfC_MYpkgCrXqe3', '2025-08-22', 'guantes_vaqueta', null, 1, 'Guantes · vaqueta · SG · cert. sí'),
  (72, 'b555c1be-28d3-4647-a9b7-f8b9a2734f66', '1TDypvhLgNE0ipNs1LOfC_MYpkgCrXqe3', '2025-08-22', 'anteojos_oscuros', null, 1, 'Gafas · oscuras · Libus · cert. sí'),
  (73, 'b555c1be-28d3-4647-a9b7-f8b9a2734f66', '1TDypvhLgNE0ipNs1LOfC_MYpkgCrXqe3', '2025-08-22', 'chaleco', null, 1, 'Chaleco · reflectivo · SG · cert. sí'),
  -- SANTANDER WALTER (inactivo) · EPP - SANTANDER WALTER.pdf — renglón 5 («Guantes … amarillo») no se carga
  (74, '5f9765d7-7021-4811-bf7a-5e5ad5596c76', '1MR8kD9-ChCyyw2km86-VSKkyySyGU4Tm', '2025-08-13', 'anteojos_oscuros', null, 1, 'Gafas · oscuras · Libus · cert. sí'),
  (75, '5f9765d7-7021-4811-bf7a-5e5ad5596c76', '1MR8kD9-ChCyyw2km86-VSKkyySyGU4Tm', '2025-08-28', 'guantes_vaqueta', null, 1, 'Guantes · vaqueta · SG · cert. sí'),
  (76, '5f9765d7-7021-4811-bf7a-5e5ad5596c76', '1MR8kD9-ChCyyw2km86-VSKkyySyGU4Tm', '2025-09-12', 'guantes_vaqueta', null, 1, 'Guantes · vaqueta · SG · cert. sí'),
  (77, '5f9765d7-7021-4811-bf7a-5e5ad5596c76', '1MR8kD9-ChCyyw2km86-VSKkyySyGU4Tm', '2025-10-13', 'guantes_descarne', null, 1, 'Guantes · soldador · Canor · cert. sí'),
  (78, '5f9765d7-7021-4811-bf7a-5e5ad5596c76', '1MR8kD9-ChCyyw2km86-VSKkyySyGU4Tm', '2025-11-03', 'guantes_vaqueta', null, 1, 'Guantes · vaqueta · Segod · cert. sí'),
  (79, '5f9765d7-7021-4811-bf7a-5e5ad5596c76', '1MR8kD9-ChCyyw2km86-VSKkyySyGU4Tm', '2025-11-05', 'pantalon_jeans', null, 1, 'Pantalón · jean · Solimin · cert. no'),
  (80, '5f9765d7-7021-4811-bf7a-5e5ad5596c76', '1MR8kD9-ChCyyw2km86-VSKkyySyGU4Tm', '2025-11-05', 'botin', null, 1, 'Zapatos · c/punta acero · Voran · cert. sí'),
  (81, '5f9765d7-7021-4811-bf7a-5e5ad5596c76', '1MR8kD9-ChCyyw2km86-VSKkyySyGU4Tm', '2025-11-12', 'anteojos_oscuros', null, 1, 'Gafas · oscuras · Libus · cert. sí'),
  (82, '5f9765d7-7021-4811-bf7a-5e5ad5596c76', '1MR8kD9-ChCyyw2km86-VSKkyySyGU4Tm', '2025-11-25', 'camisa', null, 1, 'Camisa · jean · Solimin · cert. no'),
  (83, '5f9765d7-7021-4811-bf7a-5e5ad5596c76', '1MR8kD9-ChCyyw2km86-VSKkyySyGU4Tm', '2025-11-25', 'casco', null, 1, 'Casco · Milenium · Libus · cert. sí'),
  (84, '5f9765d7-7021-4811-bf7a-5e5ad5596c76', '1MR8kD9-ChCyyw2km86-VSKkyySyGU4Tm', '2025-11-25', 'chaleco', null, 1, 'Chaleco · reflectivo · cert. no');

  -- El tipo del papel → el ítem del catálogo (nombre, clase, prefijo para crear el que falte).
  create temp table _tipo (tipo text primary key, nombre text, clase text, pre text) on commit drop;
  insert into _tipo values
    ('anteojos_oscuros', 'Anteojos de seguridad oscuros', 'epp', 'ANT'),
    ('guantes_multiflex', 'Guantes multiflex', 'epp', 'GUA'),
    ('guantes_vaqueta', 'Guantes de vaqueta', 'epp', 'GUA'),
    ('guantes_descarne', 'Guantes de descarne', 'epp', 'GUA'),
    ('botin', 'Botín de seguridad', 'epp', 'BOT'),
    ('casco', 'Casco de seguridad', 'epp', 'CAS'),
    ('chaleco', 'Chaleco reflectivo', 'ropa', 'CHA'),
    ('camisa', 'Camisa de trabajo', 'ropa', 'CAM'),
    ('pantalon_jeans', 'Pantalón de trabajo jeans', 'ropa', 'PAN');

  if exists (select 1 from _renglon g left join _tipo t on t.tipo = g.tipo where t.tipo is null) then raise exception 'tipo sin ítem'; end if;
  if exists (select 1 from _renglon g where not exists (select 1 from personas p where p.id = g.persona)) then raise exception 'persona inexistente'; end if;
  if (select count(distinct drive) from _renglon g where exists (select 1 from drive_index d where d.drive_file_id = g.drive)) <> 13 then
    raise exception 'las 13 constancias tienen que estar en drive_index';
  end if;

  for r in select g.*, t.nombre, t.clase, t.pre from _renglon g join _tipo t on t.tipo = g.tipo order by g.orden loop
    select id into v_act from activo
     where clase = r.clase and lower(nombre) = lower(r.nombre) and coalesce(talle, '') = coalesce(r.talle, '') and estado <> 'baja';
    if v_act is null then
      insert into activo (codigo, clase, nombre, categoria, talle, cantidad)
      values (public._siguiente_codigo(r.pre), r.clase, r.nombre, case r.clase when 'epp' then 'EPP' else 'Ropa de trabajo' end, r.talle, 0)
      returning id into v_act;
      v_nuevos := v_nuevos + 1;
    end if;
    v_ubic := public._ubicacion_de_persona(r.persona);
    insert into activo_movimiento (activo_id, origen_id, destino_id, fecha_hora, usuario_id, usuario_texto, nota, cantidad, respaldo_drive_file_id)
    values (v_act, null, v_ubic, (r.fecha::text || ' 12:00:00-03')::timestamptz, null, 'constancia firmada',
            'entrega histórica · constancia SRT 299/11: ' || r.papel, r.cantidad, r.drive);
    insert into activo_existencia (activo_id, ubicacion_id, cantidad) values (v_act, v_ubic, r.cantidad)
    on conflict (activo_id, ubicacion_id) do update set cantidad = activo_existencia.cantidad + excluded.cantidad;
    perform public._activo_recalcular(v_act);
    v_n := v_n + 1;
  end loop;
  raise notice 'constancias: % renglones cargados, % ítems nuevos en el catálogo', v_n, v_nuevos;
end $$;

-- ── LOS TALLES QUE DICEN LOS PAPELES ────────────────────────────────────────────────────────────
insert into public.persona_talle (persona_id, camisa, pantalon, calzado, actualizado_por) values
  ('1c9ee7ec-a80e-4a20-9db1-c0863bdb545b', 'M', '44', null, null),   -- Ferreyra Alejandro
  ('ca63f348-d5c2-4b24-85e7-18a10d822b45', 'M', '46', null, null),   -- Ferreyra Ezequiel
  ('66d3f4bc-fb0e-4a7c-a914-7748a8ab6706', null, '44', null, null),  -- Ferreyra Rodolfo (camisa ilegible)
  ('8ceb86d2-faed-4bec-b3ec-86951fb71225', 'L', '48', '42', null)    -- Poblete Luis
on conflict (persona_id) do update set
  camisa = coalesce(persona_talle.camisa, excluded.camisa),
  pantalon = coalesce(persona_talle.pantalon, excluded.pantalon),
  calzado = coalesce(persona_talle.calzado, excluded.calzado);

-- ── LA CUENTA TIENE QUE CERRAR ──────────────────────────────────────────────────────────────────
do $$
declare v_m int; v_p int; v_u int;
begin
  select count(*), count(distinct u.persona_id), sum(m.cantidad) into v_m, v_p, v_u
    from activo_movimiento m join ubicacion u on u.id = m.destino_id
   where m.respaldo_drive_file_id is not null and m.origen_id is null and u.tipo = 'persona';
  if v_m <> 84 or v_p <> 13 or v_u <> 84 then raise exception 'no cierra: % renglones, % personas, % unidades', v_m, v_p, v_u; end if;
  -- Ningún stock disponible (fuera de las personas) cambió.
  if exists (select 1 from activo_movimiento m where m.respaldo_drive_file_id is not null and m.origen_id is not null) then
    raise exception 'una entrega histórica salió de un lugar';
  end if;
  raise notice 'constancias: 84 renglones de 13 personas, ninguno descuenta stock';
end $$;
