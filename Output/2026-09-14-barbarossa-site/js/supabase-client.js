/* ---- Config Supabase --------------------------------------------
   À remplacer par les vraies valeurs de votre projet Supabase
   (Dashboard > Project Settings > API). L'anon key est publique par
   conception — elle n'autorise que ce que les règles RLS permettent
   (voir supabase/schema.sql) — mais ne mettez jamais la clé
   "service_role" ici.
------------------------------------------------------------------ */
window.SUPABASE_URL = "https://VOTRE-PROJET.supabase.co";
window.SUPABASE_ANON_KEY = "VOTRE-ANON-KEY";

window.getSupabaseClient = function () {
  if (
    window.SUPABASE_URL.includes("VOTRE-PROJET") ||
    window.SUPABASE_ANON_KEY.includes("VOTRE-ANON-KEY")
  ) {
    return null;
  }
  if (!window._supabaseClient) {
    window._supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
  return window._supabaseClient;
};
