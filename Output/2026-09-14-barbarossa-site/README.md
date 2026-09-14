# Site vitrine — Barbarossa

Site statique multi-pages (HTML/CSS/JS, sans framework, sans backend) pour
Barbarossa, bar à soirées à thème et galerie d'art à Salernes (Var).

## Aperçu

Ouvrir `index.html` dans un navigateur, ou lancer un petit serveur local :

```bash
cd Output/2026-09-14-barbarossa-site
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Pages

- `index.html` — Accueil (hero, présentation bar + galerie, teasers)
- `soirees.html` — Soirées à thème : calendrier des événements à venir,
  chargé en direct depuis Supabase, avec inscription par soirée
- `galerie.html` — Galerie (exposition en cours + œuvres)
- `reservation.html` — Réservation (formulaire complet)
- `contact.html` — Contact & infos pratiques (adresse, horaires, carte)
- `admin.html` — Espace privé (protégé par mot de passe) pour gérer les
  soirées et voir les inscrits — **non listé dans le menu**, à garder pour
  vous (voir section Supabase ci-dessous)

Chaque page partage le même header (navigation + bouton "Réserver" mis en
avant), le même footer, et les mêmes `css/style.css` / `js/script.js`.

## À personnaliser avant mise en ligne

Placeholders à remplacer (recherchez-les dans les fichiers `.html`) :

- **Adresse** (`contact.html`, `reservation.html`) : `[Adresse à compléter]`
- **Téléphone** (`contact.html`, `reservation.html`) : `[À compléter]` /
  `[Téléphone à compléter]`, et les liens `tel:+33400000000`
- **Email de contact** : `contact@barbarossa-salernes.fr` (à remplacer
  partout par la vraie adresse, y compris dans `js/script.js`)
- **Réseaux sociaux** : liens `href="#"` sur Instagram/Facebook (header et
  footer de chaque page), à remplacer par les vraies URLs
- **Horaires** : tables indicatives à ajuster (`contact.html` et
  `reservation.html`)
- **Exposition en cours** (`galerie.html`) : `[Titre de l'exposition]`,
  `[Nom de l'artiste]` et le texte de présentation
- **Photos** : le hero et la galerie utilisent des textures/couleurs
  générées en CSS en attendant de vraies photos du bar et des œuvres
  exposées. Remplacer les blocs `.frame` (galerie) par de vraies images.
- **Soirées** : ne se modifient plus dans le HTML — elles se gèrent depuis
  `admin.html` une fois Supabase configuré (voir plus bas).

## Réservation en ligne

La page `reservation.html` contient un vrai formulaire (date, nombre de
personnes, nom, téléphone, message) envoyé via **FormSubmit**
(https://formsubmit.co), un service gratuit qui transmet le formulaire par
email sans backend à héberger.

**Étape obligatoire :** dans `js/script.js`, remplacer :

```js
var RESERVATION_EMAIL = "contact@barbarossa-salernes.fr";
```

par la vraie adresse email du bar. La toute première réservation envoyée
déclenchera un email de confirmation FormSubmit à cette adresse — il faut
cliquer sur le lien de confirmation une fois pour activer l'envoi
automatique ensuite.

**Si le bar a déjà un outil de réservation** (Zenchef, TheFork Manager,
LaFourchette, etc.) : le plus simple est de remplacer le contenu du
formulaire dans `reservation.html` par l'iframe ou le widget fourni par cet
outil, et de garder les boutons "Réserver" tels quels (ils pointent tous
vers cette page).

## Calendrier des soirées & inscriptions (Supabase)

La page `soirees.html` affiche les événements à venir depuis une base
Supabase (gratuite), permet au public de s'inscrire, et un rappel par
email part automatiquement 24h avant chaque soirée. `admin.html` est
l'interface privée pour gérer tout ça.

**Choix fait pendant la construction :** le formulaire d'inscription
demande un **email obligatoire** (plutôt que "téléphone ou email" au
choix), parce que le rappel automatique n'existe pour l'instant que par
email — un inscrit qui n'aurait laissé qu'un numéro ne recevrait jamais
rien. Le téléphone reste un champ optionnel, utile si vous voulez
rappeler quelqu'un vous-même. Le SMS (Twilio) n'est pas branché : c'est
un service payant, à ajouter plus tard si besoin — voir tout en bas.

### 1. Créer le projet Supabase (5 min)

1. Allez sur [supabase.com](https://supabase.com), créez un compte gratuit.
2. "New project" → choisissez un nom, un mot de passe de base de données
   (à garder de côté), une région proche (Europe).
3. Une fois le projet créé, ouvrez **SQL Editor** (menu de gauche) → *New
   query*, collez tout le contenu de `supabase/schema.sql` de ce dossier,
   et cliquez *Run*. Ça crée les tables `events` et `registrations` avec
   les bonnes règles de sécurité.
4. Allez dans **Project Settings → API** : notez l'**URL** du projet et la
   clé **`anon` `public`**.

### 2. Brancher le site à Supabase

Ouvrez `js/supabase-client.js` et remplacez :

```js
window.SUPABASE_URL = "https://VOTRE-PROJET.supabase.co";
window.SUPABASE_ANON_KEY = "VOTRE-ANON-KEY";
```

par les deux valeurs notées à l'étape précédente. C'est la seule
modification nécessaire pour que `soirees.html` et `admin.html`
fonctionnent (formulaire public + interface de gestion). La clé `anon`
est faite pour être publique — elle n'autorise que ce que les règles du
fichier `schema.sql` permettent.

### 3. Créer votre compte admin

Toujours dans Supabase : **Authentication → Users → Add user**, entrez
votre email et un mot de passe. C'est ce compte qui se connecte sur
`admin.html`. Il n'y a pas d'inscription publique à cette page — un seul
compte (le vôtre) suffit.

Ouvrez ensuite `admin.html` dans le navigateur, connectez-vous, et
ajoutez vos premières soirées (titre, description, date, heure, couleur
du visuel). Elles apparaissent aussitôt sur `soirees.html`.

### 4. Activer les rappels automatiques par email

**a) Créer un compte Resend** (gratuit jusqu'à 3 000 emails/mois) sur
[resend.com](https://resend.com), récupérez une clé API
(*API Keys → Create API Key*).

**b) Déployer la fonction de rappel.** Elle est déjà écrite
(`supabase/functions/send-reminders/index.ts`) — il faut juste l'envoyer
sur votre projet avec la CLI Supabase :

```bash
npm install -g supabase
supabase login
supabase link --project-ref VOTRE-REF-DE-PROJET   # visible dans l'URL du dashboard
supabase secrets set RESEND_API_KEY=re_votre_cle
supabase secrets set REMINDER_FROM="Barbarossa <resa@votredomaine.fr>"
supabase functions deploy send-reminders
```

Sans domaine email vérifié dans Resend, utilisez temporairement
`REMINDER_FROM="Barbarossa <onboarding@resend.dev>"` (adresse de test
fournie par Resend) — les emails partiront, juste avec cet expéditeur
générique en attendant de vérifier votre propre domaine dans Resend.

**c) Planifier l'envoi quotidien.** Dans Supabase : **Database →
Extensions**, activez `pg_cron` et `pg_net`. Puis, dans le **SQL
Editor**, une dernière requête (remplacez les deux `<...>`) :

```sql
select cron.schedule(
  'send-event-reminders',
  '0 10 * * *', -- tous les jours à 10h UTC (~12h en France)
  $$
  select net.http_post(
    url := 'https://<VOTRE-REF-DE-PROJET>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <VOTRE-SERVICE-ROLE-KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

La clé `service_role` se trouve au même endroit que la clé `anon`
(*Project Settings → API*) — gardez-la secrète, elle ne va nulle part
dans le code du site, seulement dans cette requête SQL exécutée une
fois.

C'est tout : chaque jour, la fonction cherche les soirées du lendemain et
envoie un email aux inscrits qui n'en ont pas encore reçu.

### Et le SMS ?

Pas branché pour l'instant — Twilio (le service qui permettrait d'envoyer
des SMS) est payant dès le premier message, contrairement à Resend qui
est gratuit sur ce volume. Si vous voulez l'ajouter plus tard, la même
fonction `send-reminders` peut être étendue pour appeler l'API Twilio en
plus de Resend, à condition d'avoir un compte Twilio et un budget SMS.

### Vérifier que tout marche

- `admin.html` : connectez-vous, ajoutez une soirée avec la date
  d'aujourd'hui ou demain pour tester rapidement.
- `soirees.html` : la soirée doit apparaître ; inscrivez-vous avec une
  vraie adresse email à vous.
- Pour tester le rappel sans attendre le cron (la fonction refuse les
  requêtes sans authentification, un simple lien dans le navigateur ne
  suffit pas) :
  ```bash
  supabase functions invoke send-reminders
  ```
  Si une soirée est prévue demain, l'email de rappel part immédiatement.

## Design

Direction calibrée sur le site de Château de Berne (chateauberne.com),
donné comme référence de style — un domaine provençal clair et lumineux
(pierre, crème, vert forêt, tomettes terracotta), pas un thème sombre.

- **Palette** : fond crème/pierre (`--paper`, `--card`) avec deux accents
  puisés dans la vraie identité de la référence — un vert forêt profond
  (`--green`, logo de Château de Berne) pour les boutons/icônes/nav, et un
  or mat (`--gold`) en touche secondaire pour les liens et les italiques.
  Une pointe de terracotta (`--terracotta`) évoque les tomettes. Tokens
  définis en haut de `css/style.css`.
- **Typographie** : « Spectral » (serif élégante) pour les titres,
  « Karla » pour le texte courant — les deux polices réellement utilisées
  par la référence. Chargées depuis Google Fonts.
- **Espacements** : échelle généreuse (`--space-*`), sections aérées, pour
  retrouver le calme de la référence.
- **Animations** : apparition en fondu au scroll (`.reveal`, via
  `IntersectionObserver` dans `js/script.js`, désactivée si
  `prefers-reduced-motion`), survols sur boutons/liens/cartes, menu mobile
  en tiroir avec liens qui apparaissent en cascade.

## Déploiement

Le site est 100% statique : il peut être déposé tel quel sur Netlify,
Vercel, GitHub Pages, ou n'importe quel hébergement mutualisé classique
(pas besoin de base de données ni de serveur applicatif).

## Structure

```
index.html                              Accueil
soirees.html                            Soirées à thème (calendrier + inscription)
galerie.html                            Galerie
reservation.html                        Réservation
contact.html                            Contact & infos pratiques
admin.html                              Espace privé : gérer soirées + inscrits
css/style.css                           Styles partagés (mobile-first)
js/script.js                            Nav mobile, header au scroll, reveal au scroll
js/supabase-client.js                   Config + client Supabase (URL/clé à renseigner)
js/soirees.js                           Chargement des événements + inscription
js/admin.js                             Connexion admin + gestion des soirées/inscrits
supabase/schema.sql                     Tables + règles de sécurité (à exécuter une fois)
supabase/functions/send-reminders/      Fonction d'envoi des rappels (email, via Resend)
```
