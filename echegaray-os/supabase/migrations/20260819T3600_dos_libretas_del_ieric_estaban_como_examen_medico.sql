-- El tipo de cada papel se deduce del NOMBRE del archivo, y el nombre puede mentir. Dos lo hacen:
--
--   · `HM - QUIROGA S..pdf`         (1KWC5eoeWnVcDayBclpeO6I5RT7Q4q-1k)
--   · `HM - QUIROGA SEBASTIAN.pdf`  (1gYZBpWiW4FnAyVTW6Gdo5mCwSkfaRWaK)
--
-- Los dos empiezan con «HM» —así se llama el examen médico en este data room— y los dos son, leídos
-- adentro, la LIBRETA DE FONDO DE CESE LABORAL del IERIC (Ley 22.250), original N° 000004977978,
-- CUIL 20-30501290-5. Son dos escaneos del mismo documento.
--
-- No es una etiqueta mal puesta: con el tipo equivocado, el legajo de QUIROGA SEBASTIAN ADOLFO
-- —que trabaja hoy— figuraba con apto médico presente y sin libreta, que es exactamente al revés.
-- La lista de lo que falta se calcula con este campo.
--
-- El archivo NO se renombra: ponerle otro nombre al papel de alguien es una decisión suya. Lo que se
-- corrige es el dato con el que el módulo decide.

update public.documentacion_legajo
   set tipo_documento = 'libreta_fondo_cese'
 where drive_file_id in ('1KWC5eoeWnVcDayBclpeO6I5RT7Q4q-1k', '1gYZBpWiW4FnAyVTW6Gdo5mCwSkfaRWaK');
