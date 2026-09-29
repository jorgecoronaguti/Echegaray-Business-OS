-- EL NOMBRE PARA MOSTRAR PASA A «APELLIDO NOMBRE» (dueño, 29/09/2026: «reorganices todo el orden de los
-- nombres en todos los lugares posibles donde pueden aparecer siendo primero apellido y después nombre
-- ... tienen que consumir de la misma tabla de supabase y ordenarse como digo»). Reemplaza lo aprobado
-- el 24/09 («Emiliano Maldonado»).
--
-- POR QUÉ SE REESCRIBE LA COLUMNA Y NO SE AGREGA OTRA: `personas.nombre_para_mostrar` ya es la única
-- fuente de lo que se muestra; la leen las vistas, las RPC (nombres_de_usuarios, hh_de_obra_en_vivo,
-- costo_de_obras...), la app y el bot. Reescribirla cambia TODAS las caras a la vez sin tocar una sola
-- función ni vista. Una columna nueva habría dejado dos definiciones del mismo concepto (REALIDAD ÚNICA).
--
-- CÓMO: cada valor curado era «Nombre Apellido» (una sola palabra de apellido; ninguno compuesto: la
-- precarga del 24/09 tomó siempre primer nombre + primer apellido), así que el nuevo es la última palabra
-- primero: «Cristian Aguero» -> «Aguero Cristian», «Juan Pablo Nievas» -> «Nievas Juan Pablo». Revisado
-- contra el legajo (nombre_completo, apellido primero): en las 76 filas la primera palabra del nuevo
-- coincide con la del legajo, salvo FACUNDO BUTIERREZ (único legajo cargado Nombre Apellido: el legajo
-- está al revés; «Butierrez Facundo» es lo correcto). Sin duplicados: los dos Emilianos quedan
-- «Gonzalez Emiliano» y «Maldonado Emiliano».
--
-- IDEMPOTENTE: cada UPDATE lleva el valor viejo en el WHERE; correrlo dos veces no da vuelta lo dado
-- vuelta, y no pisa lo que alguien corrija a mano en la ficha entre la lectura y la aplicación.
-- Sólo datos y una función (sin DDL de tablas). Vuelta atrás: supabase/rollback/20260929T1000_nombre_para_mostrar_apellido_primero.down.sql
--
-- orden_de_usuarios() pasa a ordenar por el nombre para mostrar (ya empieza por apellido) y cae al
-- legajo: una lista ordena por lo mismo que dibuja, y el legajo mal cargado de Butierrez no lo manda a la F.

update public.personas set nombre_para_mostrar = 'Aballay Diego' where id = '58168449-cbb4-4ca9-901e-39d2674394d9' and nombre_para_mostrar = 'Diego Aballay'; -- ABALLAY DIEGO
update public.personas set nombre_para_mostrar = 'Aballay Jose' where id = 'f8b4776e-e7fe-4e14-b784-ffd3c0e92ca3' and nombre_para_mostrar = 'Jose Aballay'; -- ABALLAY JOSE
update public.personas set nombre_para_mostrar = 'Aguero Cristian' where id = '1ff87d94-0b78-4308-aff5-e0f4c6fbd553' and nombre_para_mostrar = 'Cristian Aguero'; -- AGUERO CRISTIAN DOMINGO
update public.personas set nombre_para_mostrar = 'Aguirre Leandro' where id = '0d1b4567-534a-4d45-93a2-08f567205813' and nombre_para_mostrar = 'Leandro Aguirre'; -- AGUIRRE LEANDRO
update public.personas set nombre_para_mostrar = 'Ahumada Santiago' where id = '36b66956-aea0-452c-acc5-a9335375e8d3' and nombre_para_mostrar = 'Santiago Ahumada'; -- AHUMADA SANTIAGO
update public.personas set nombre_para_mostrar = 'Alaniz Emanuel' where id = '17fdcfb1-281a-40c5-bc3c-eeb0b1abc5b6' and nombre_para_mostrar = 'Emanuel Alaniz'; -- ALANIZ EMANUEL ARIEL
update public.personas set nombre_para_mostrar = 'Avila Alejandro' where id = '93dfb9f3-971e-417f-9efa-bf22be4bf7ba' and nombre_para_mostrar = 'Alejandro Avila'; -- AVILA ALEJANDRO LUIS
update public.personas set nombre_para_mostrar = 'Balmaceda Maximiliano' where id = '8b63eaff-a639-4423-b0e6-76d4d7dd3f28' and nombre_para_mostrar = 'Maximiliano Balmaceda'; -- BALMACEDA GONZALEZ MAXIMILIANO A
update public.personas set nombre_para_mostrar = 'Bazan Juan' where id = 'eaf3313a-ecfd-4c9d-8527-7ee3ac83b916' and nombre_para_mostrar = 'Juan Bazan'; -- BAZAN JUAN
update public.personas set nombre_para_mostrar = 'Bronia Rodrigo' where id = '31b5a856-3e4f-4f8b-97fe-0f7d2e294546' and nombre_para_mostrar = 'Rodrigo Bronia'; -- BRONIA JOFRE RODRIGO EMANUEL
update public.personas set nombre_para_mostrar = 'Bustos Jonathan' where id = '322ab3cc-9ab2-4283-b4a9-5004852c39ac' and nombre_para_mostrar = 'Jonathan Bustos'; -- BUSTOS OROSCO JONATHAN ERICK
update public.personas set nombre_para_mostrar = 'Capelli Cesar' where id = '2dc1eb40-2e52-4ce6-adb1-a1545714d7da' and nombre_para_mostrar = 'Cesar Capelli'; -- CAPELLI CESAR
update public.personas set nombre_para_mostrar = 'Castillo Carlos' where id = '82d2cb78-9411-4a5e-851c-cc9d8e66e0b7' and nombre_para_mostrar = 'Carlos Castillo'; -- CASTILLO BENITEZ JUAN CARLOS
update public.personas set nombre_para_mostrar = 'Castro Gerson' where id = '78802957-ac55-4d4f-9dad-93685f7326be' and nombre_para_mostrar = 'Gerson Castro'; -- CASTRO GALVAN GERSON ULISES
update public.personas set nombre_para_mostrar = 'Castro Heber' where id = '2802b05f-420a-4ec1-80f2-91ebae4ab3fc' and nombre_para_mostrar = 'Heber Castro'; -- CASTRO GALVAN HEBER LUCAS
update public.personas set nombre_para_mostrar = 'Castro Juan' where id = '8cee8ce6-4e7b-4b8b-a64c-92e72c3c5efb' and nombre_para_mostrar = 'Juan Castro'; -- CASTRO JUAN MARCELO
update public.personas set nombre_para_mostrar = 'Castro Roberto' where id = '310b5e90-6335-44a2-859e-210847972326' and nombre_para_mostrar = 'Roberto Castro'; -- CASTRO ROBERTO
update public.personas set nombre_para_mostrar = 'Contreras Javier' where id = '4bd25b10-74b5-4ba0-a106-a31d252d69e9' and nombre_para_mostrar = 'Javier Contreras'; -- CONTRERAS JAVIER
update public.personas set nombre_para_mostrar = 'Corona Jorge' where id = 'afbb6549-ea0c-40c1-88a6-107eb08b4447' and nombre_para_mostrar = 'Jorge Corona'; -- CORONA GUTIERREZ JORGE
update public.personas set nombre_para_mostrar = 'Diaz Braian' where id = '93d13cca-4751-49cc-8494-61e14d9368f0' and nombre_para_mostrar = 'Braian Diaz'; -- DIAZ BRAIAN
update public.personas set nombre_para_mostrar = 'Diaz Carlos' where id = 'aba25379-a74a-41dc-9da3-9f19c8f7fd67' and nombre_para_mostrar = 'Carlos Diaz'; -- DIAZ CARLOS
update public.personas set nombre_para_mostrar = 'Diaz Ramon' where id = '45934936-5f81-4656-b4f6-6d4cb5577f3e' and nombre_para_mostrar = 'Ramon Diaz'; -- DIAZ RAMON ORLANDO
update public.personas set nombre_para_mostrar = 'Echegaray Rodrigo' where id = 'f1e5a5c6-4acd-4f35-8f86-af9b0dc28905' and nombre_para_mostrar = 'Rodrigo Echegaray'; -- ECHEGARAY RODRIGO
update public.personas set nombre_para_mostrar = 'Butierrez Facundo' where id = 'ed47f3ef-f222-4561-8fa0-7e639d315bec' and nombre_para_mostrar = 'Facundo Butierrez'; -- FACUNDO BUTIERREZ
update public.personas set nombre_para_mostrar = 'Fernandez Javier' where id = 'ec3f6b5f-239e-4300-b4ff-f1c2a38a9bac' and nombre_para_mostrar = 'Javier Fernandez'; -- FERNANDEZ JAVIER
update public.personas set nombre_para_mostrar = 'Ferreyra Alejandro' where id = '1c9ee7ec-a80e-4a20-9db1-c0863bdb545b' and nombre_para_mostrar = 'Alejandro Ferreyra'; -- FERREYRA ALEJANDRO
update public.personas set nombre_para_mostrar = 'Ferreyra Ezequiel' where id = 'ca63f348-d5c2-4b24-85e7-18a10d822b45' and nombre_para_mostrar = 'Ezequiel Ferreyra'; -- FERREYRA EZEQUIEL
update public.personas set nombre_para_mostrar = 'Ferreyra Rodolfo' where id = '66d3f4bc-fb0e-4a7c-a914-7748a8ab6706' and nombre_para_mostrar = 'Rodolfo Ferreyra'; -- FERREYRA RODOLFO
update public.personas set nombre_para_mostrar = 'Flores Alejandro' where id = '61c6fc62-6cd6-40da-9dad-60a28bc8fefb' and nombre_para_mostrar = 'Alejandro Flores'; -- FLORES ALEJANDRO NAZARENO
update public.personas set nombre_para_mostrar = 'Galvan Guadalupe' where id = '5a54808d-adef-415b-bc15-20c7073b4aee' and nombre_para_mostrar = 'Guadalupe Galvan'; -- GALVAN GUADALUPE
update public.personas set nombre_para_mostrar = 'Gonzales Abel' where id = 'c267f77a-ff35-4551-864c-aed021f66161' and nombre_para_mostrar = 'Abel Gonzales'; -- GONZALES ABEL VALENTIN
update public.personas set nombre_para_mostrar = 'Gonzalez Carlos' where id = 'bf59433b-fde2-438e-beb4-8b6910926d44' and nombre_para_mostrar = 'Carlos Gonzalez'; -- GONZALEZ CARLOS SAMUEL
update public.personas set nombre_para_mostrar = 'Gonzalez Emiliano' where id = 'e3e21a50-5235-40de-b265-e8a1ab64ab90' and nombre_para_mostrar = 'Emiliano Gonzalez'; -- GONZALEZ TOBARES EMILIANO
update public.personas set nombre_para_mostrar = 'Gonzalez Juan' where id = 'a7af0d4d-d79d-4ee0-bb87-c636fc76a3e3' and nombre_para_mostrar = 'Juan Gonzalez'; -- GONZALEZ TOBARES JUAN GUILLERMO
update public.personas set nombre_para_mostrar = 'Gordillo Alejandro' where id = '8ea81af1-ba17-432e-b739-1f12e4c552c1' and nombre_para_mostrar = 'Alejandro Gordillo'; -- GORDILLO ALEJANDRO
update public.personas set nombre_para_mostrar = 'Isaguirre Pablo' where id = '28e64911-e536-43ae-a965-ebdd6423a253' and nombre_para_mostrar = 'Pablo Isaguirre'; -- ISAGUIRRE PABLO MARCOS
update public.personas set nombre_para_mostrar = 'Jofre Ismael' where id = '04be96ba-4208-4646-a7ea-5c7a7a608103' and nombre_para_mostrar = 'Ismael Jofre'; -- JOFRE ISMAEL
update public.personas set nombre_para_mostrar = 'Lara Sergio' where id = 'af1631a0-0f60-4e2c-bfc3-4834d6834c60' and nombre_para_mostrar = 'Sergio Lara'; -- LARA SERGIO
update public.personas set nombre_para_mostrar = 'Maldonado Emiliano' where id = '02533578-fcdb-43d4-b124-ced0ea0dab9a' and nombre_para_mostrar = 'Emiliano Maldonado'; -- MALDONADO BATISTA EMILIANO MIGUEL
update public.personas set nombre_para_mostrar = 'Moreno Julio' where id = '78bc2148-2302-4576-b787-e48d469747a9' and nombre_para_mostrar = 'Julio Moreno'; -- MORENO JULIO MIGUEL
update public.personas set nombre_para_mostrar = 'Narbaez Facundo' where id = 'b736992b-ffd7-4b12-89e1-25165798c580' and nombre_para_mostrar = 'Facundo Narbaez'; -- NARBAEZ FACUNDO S
update public.personas set nombre_para_mostrar = 'Navarro Matias' where id = '2fedd608-ab28-45c6-bcc6-e031885d2bbd' and nombre_para_mostrar = 'Matias Navarro'; -- NAVARRO MATIAS JESUS
update public.personas set nombre_para_mostrar = 'Nievas Ignacio' where id = 'd25bc84f-bc3e-4f88-b4d0-2465a2089776' and nombre_para_mostrar = 'Ignacio Nievas'; -- NIEVAS IGNACIO
update public.personas set nombre_para_mostrar = 'Nievas Juan Pablo' where id = '518df458-3dc7-40ef-b49b-d33d26c1d4d3' and nombre_para_mostrar = 'Juan Pablo Nievas'; -- NIEVAS VILLEGAS JUAN PABLO
update public.personas set nombre_para_mostrar = 'Ochoa Eduardo' where id = '67129902-4c36-4610-a58f-f4dc5454aed6' and nombre_para_mostrar = 'Eduardo Ochoa'; -- OCHOA EDUARDO ARIEL
update public.personas set nombre_para_mostrar = 'Ochoa Nicolas' where id = 'ac4173b2-1874-4bbe-b68e-13770a1e07e3' and nombre_para_mostrar = 'Nicolas Ochoa'; -- OCHOA NICOLAS
update public.personas set nombre_para_mostrar = 'Olivar Jaime' where id = '1e364e7f-71c5-44e7-a2a6-b4c60c320804' and nombre_para_mostrar = 'Jaime Olivar'; -- OLIVAR JAIME
update public.personas set nombre_para_mostrar = 'Olivar Jose' where id = 'eb03101f-7a64-4d7d-b1ee-0d96c33c6000' and nombre_para_mostrar = 'Jose Olivar'; -- OLIVAR JOSE RAMON
update public.personas set nombre_para_mostrar = 'Palacios Ruben' where id = '1831cf88-5f5f-4aad-9d31-f6eaa42b2de6' and nombre_para_mostrar = 'Ruben Palacios'; -- PALACIOS RUBEN
update public.personas set nombre_para_mostrar = 'Pastran Marcelo' where id = '1fee0bee-a2ef-4470-9afc-e4a0bbfa768d' and nombre_para_mostrar = 'Marcelo Pastran'; -- PASTRAN MARCELO IVAN
update public.personas set nombre_para_mostrar = 'Peralta Alexander' where id = 'c8bfbd76-e23a-44a5-8493-8d44cff6b594' and nombre_para_mostrar = 'Alexander Peralta'; -- PERALTA ALEXANDER RICARDO
update public.personas set nombre_para_mostrar = 'Peralta Ricardo' where id = '42c99e48-f429-45eb-8be8-fd109a299f2f' and nombre_para_mostrar = 'Ricardo Peralta'; -- PERALTA RICARDO
update public.personas set nombre_para_mostrar = 'Petina Jairo' where id = '61947a1c-71a6-4295-8932-158c80ec30f8' and nombre_para_mostrar = 'Jairo Petina'; -- PETINA RODRIGUEZ JAIRO EMANUEL
update public.personas set nombre_para_mostrar = 'Poblete Luis' where id = '8ceb86d2-faed-4bec-b3ec-86951fb71225' and nombre_para_mostrar = 'Luis Poblete'; -- POBLETE LUIS
update public.personas set nombre_para_mostrar = 'Posse Jeremias' where id = '655828d4-707f-4d1d-b51b-35871795e3c1' and nombre_para_mostrar = 'Jeremias Posse'; -- POSSE OROSCO JEREMIAS GABRIEL
update public.personas set nombre_para_mostrar = 'Quiroga Alexander' where id = 'cb03b834-b0a7-4645-acc8-20f7ef218555' and nombre_para_mostrar = 'Alexander Quiroga'; -- QUIROGA ALEXANDER SEBASTIAN
update public.personas set nombre_para_mostrar = 'Quiroga Julio' where id = 'af5b629a-6d71-4439-b92d-f977ec3640bf' and nombre_para_mostrar = 'Julio Quiroga'; -- QUIROGA JULIO CESAR
update public.personas set nombre_para_mostrar = 'Quiroga Mauricio' where id = 'bba061ce-3681-4a6d-a5d7-5335fbc0d659' and nombre_para_mostrar = 'Mauricio Quiroga'; -- QUIROGA MAURICIO
update public.personas set nombre_para_mostrar = 'Quiroga Sebastian' where id = '48703f23-6bc3-4d95-a08c-b7a4a739bf50' and nombre_para_mostrar = 'Sebastian Quiroga'; -- QUIROGA SEBASTIAN ADOLFO
update public.personas set nombre_para_mostrar = 'Quiroz Facundo' where id = '57960478-e253-42ac-834c-16a5b493a075' and nombre_para_mostrar = 'Facundo Quiroz'; -- QUIROZ FACUNDO MIGUEL
update public.personas set nombre_para_mostrar = 'Ramos Facundo' where id = '96067b81-c1b6-44fd-ba4c-c1ac48980a84' and nombre_para_mostrar = 'Facundo Ramos'; -- RAMOS FACUNDO
update public.personas set nombre_para_mostrar = 'Reta Sebastian' where id = 'b7f61a6e-8c14-43f7-832b-fbed3c03fdd6' and nombre_para_mostrar = 'Sebastian Reta'; -- RETA RAMON HECTOR SEBASTIAN
update public.personas set nombre_para_mostrar = 'Rios Fernando' where id = 'f0e1a2fe-c321-4c9e-b8a1-3d41e9e53b98' and nombre_para_mostrar = 'Fernando Rios'; -- RIOS FERNANDO
update public.personas set nombre_para_mostrar = 'Rosales Carlos' where id = 'a3fda1c9-e9f8-4e6c-ab70-2d9ff89d366f' and nombre_para_mostrar = 'Carlos Rosales'; -- ROSALES CARLOS ENRIQUE
update public.personas set nombre_para_mostrar = 'Rosales Diego' where id = '4d0372ce-f299-4034-9c7f-846ddd0b8765' and nombre_para_mostrar = 'Diego Rosales'; -- ROSALES DIEGO JOSE
update public.personas set nombre_para_mostrar = 'Rosales Ivan' where id = '0805d266-f645-4b21-8a26-33b157149c25' and nombre_para_mostrar = 'Ivan Rosales'; -- ROSALES IVAN
update public.personas set nombre_para_mostrar = 'Ruartes Facundo' where id = '71c3cdb1-a3ab-4281-9e44-b246685621f5' and nombre_para_mostrar = 'Facundo Ruartes'; -- RUARTES FACUNDO OSCAR
update public.personas set nombre_para_mostrar = 'Saavedra Mauricio' where id = '273215c4-57e2-45bc-95ee-6cd1c0f63ab1' and nombre_para_mostrar = 'Mauricio Saavedra'; -- SAAVEDRA MAURICIO MIGUEL
update public.personas set nombre_para_mostrar = 'Salinas Carlos' where id = 'b555c1be-28d3-4647-a9b7-f8b9a2734f66' and nombre_para_mostrar = 'Carlos Salinas'; -- SALINAS CARLOS
update public.personas set nombre_para_mostrar = 'Sanchez Leonardo' where id = '9ebf35a8-ccd3-4611-b477-837d15ffdddd' and nombre_para_mostrar = 'Leonardo Sanchez'; -- SANCHEZ ACOSTA LEONARDO G
update public.personas set nombre_para_mostrar = 'Santander Walter' where id = '5f9765d7-7021-4811-bf7a-5e5ad5596c76' and nombre_para_mostrar = 'Walter Santander'; -- SANTANDER WALTER
update public.personas set nombre_para_mostrar = 'Sosa Raul' where id = 'b8c1cad7-af7e-48b6-ba60-d17181032a8d' and nombre_para_mostrar = 'Raul Sosa'; -- SOSA NESTOR RAUL
update public.personas set nombre_para_mostrar = 'Tello Juan' where id = '7c4875a8-2a54-49a5-962d-21105423c7b9' and nombre_para_mostrar = 'Juan Tello'; -- TELLO JUAN ALBERTO
update public.personas set nombre_para_mostrar = 'Videla Isaias' where id = 'a6706975-41da-4dce-9e24-826752b978ed' and nombre_para_mostrar = 'Isaias Videla'; -- VIDELA ISAIAS
update public.personas set nombre_para_mostrar = 'Videla Santiago' where id = 'f00aa51e-1d59-449c-9d9f-dcf7585dac24' and nombre_para_mostrar = 'Santiago Videla'; -- VIDELA SANTIAGO
update public.personas set nombre_para_mostrar = 'Zogbe Leonardo' where id = '04c6c965-b50c-4cde-9eb0-4fa944483ef1' and nombre_para_mostrar = 'Leonardo Zogbe'; -- ZOGBE RAMOS WALTER LEONARDO

create or replace function public.orden_de_usuarios()
returns table (usuario_id uuid, clave_orden text)
language sql
stable
security definer
set search_path = public
as $$
  select pf.id as usuario_id,
         translate(
           lower(regexp_replace(btrim(coalesce(
             nullif(btrim(pe.nombre_para_mostrar), ''),
             nullif(btrim(pe.nombre_completo), ''),
             nullif(btrim(pf.nombre), ''),
             ''
           )), '\s+', ' ', 'g')),
           'áàâäãéèêëíìîïóòôöõúùûüç',
           'aaaaaeeeeiiiiooooouuuuc'
         ) as clave_orden
    from public.perfiles pf
    left join public.personas pe on pe.id = pf.persona_id
   where (select auth.uid()) is not null or (select auth.role()) = 'service_role'
$$;

revoke all on function public.orden_de_usuarios() from public, anon;
grant execute on function public.orden_de_usuarios() to authenticated, service_role;
