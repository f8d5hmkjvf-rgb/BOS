# Moteur vidéo « Dossiers » (noir & or)

Pipeline de génération 100 % code pour les vidéos TikTok de la série.

1. `script.py` : le texte, découpé en scènes `(nom_de_scène, phrase)`.
2. `tts_cont.py VOIX VITESSE p1` (ou `tts_chunks.py VOIX VITESSE p2 0,4,8` si le service bloque) : voix off d'un seul trait, avec le minutage de chaque mot → `vo.json`.
3. `audio.py p1` : mixage de la voix, de la musique synthétisée et des bruitages calés sur les mots.
4. `render.py p1` : rendu 1080x1920 à 30 i/s (scènes dans `scenes.py` et `scenes2.py`, personnages articulés dans `puppet.py`).
5. Assemblage ffmpeg (loudnorm -14 LUFS).

Pour un nouveau dossier : réécrire `script.py` et les fonctions de scène, puis réutiliser `puppet.py`, `core.py` et `audio.py` tels quels.
