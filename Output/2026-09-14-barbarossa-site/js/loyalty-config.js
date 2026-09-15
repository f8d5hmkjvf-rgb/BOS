/* ---- Config carte de fidélité ------------------------------------
   À remplacer par les vraies valeurs de votre projet Supabase
   (Dashboard > Project Settings > API) — voir README, section
   "Carte de fidélité". C'est la même clé publique ("anon") qu'on
   utiliserait pour n'importe quelle autre fonctionnalité Supabase du
   site ; elle n'autorise que ce que supabase/loyalty-schema.sql permet.
------------------------------------------------------------------ */
window.SUPABASE_URL = "https://VOTRE-PROJET.supabase.co";
window.SUPABASE_ANON_KEY = "VOTRE-ANON-KEY";

/* Nombre de points nécessaires pour débloquer une consommation offerte.
   À ajuster avec Barbarossa. Doit être le même partout (carte client,
   page de scan) : changez uniquement cette valeur. */
window.LOYALTY_REWARD_THRESHOLD = 8;

window.getSupabaseClient = function () {
  if (
    window.SUPABASE_URL.indexOf("VOTRE-PROJET") !== -1 ||
    window.SUPABASE_ANON_KEY.indexOf("VOTRE-ANON-KEY") !== -1
  ) {
    return null;
  }
  if (!window._supabaseClient) {
    window._supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
  return window._supabaseClient;
};
