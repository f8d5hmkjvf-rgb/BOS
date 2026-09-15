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
- `soirees.html` — Soirées à thème : programme des événements, chaque
  soirée reliée à son inscription Eventbrite
- `galerie.html` — Galerie (exposition en cours + œuvres)
- `carte.html` — Carte de fidélité : inscription client + affichage de
  la carte (QR code, points)
- `reservation.html` — Réservation (formulaire complet)
- `contact.html` — Contact & infos pratiques (adresse, horaires, carte)
- `loyalty-scan.html` — Espace staff (protégé) : scanner une carte,
  ajouter un point — **non listé dans le menu**
- `loyalty-admin.html` — Espace propriétaire (protégé) : liste des
  clients fidélité — **non listé dans le menu**

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
- **Soirées** (`soirees.html`) : les 3 cartes sont un exemple — à ajuster
  (titre, description, date/heure, couleur du visuel) et à relier à un
  vrai événement Eventbrite via `data-eventbrite-id` (voir plus bas).

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

## Inscriptions aux soirées (Eventbrite)

Chaque carte de `soirees.html` a un bouton "S'inscrire" qui ouvre le
**checkout Eventbrite intégré** (une fenêtre modale fournie par
Eventbrite, pas un formulaire à nous) : billetterie, paiement éventuel,
et liste des inscrits sont entièrement gérés par Eventbrite. Barbarossa
crée et modifie ses événements directement depuis son tableau de bord
Eventbrite — il n'y a plus de base de données ni de page admin à
maintenir sur ce site.

### 1. Créer l'événement sur Eventbrite

Dans votre compte organisateur Eventbrite : créez l'événement (titre,
date, heure, places, prix ou gratuit). Une fois publié, récupérez son
**ID numérique** — visible dans l'URL de la page de gestion de
l'événement (`.../events/1234567890/manage`) ou dans *Order options →
Embed a checkout button* qui donne directement l'ID à utiliser.

### 2. Connecter la carte du site à cet événement

Dans `soirees.html`, chaque soirée est un bloc :

```html
<article class="event-card reveal" data-eventbrite-id="VOTRE-ID-EVENTBRITE-1">
  <div class="event-visual event-visual-gold"></div>
  <div class="event-body">
    <p class="event-day">Jeudi 24 septembre · 19h00</p>
    <h3 class="event-name">Vernissage &amp; Vinyles</h3>
    <p class="event-desc">Lancement d'une nouvelle exposition...</p>
    <button type="button" class="btn btn-accent btn-small" data-eventbrite-trigger>S'inscrire</button>
  </div>
</article>
```

Remplacez `VOTRE-ID-EVENTBRITE-1` par le vrai ID Eventbrite de la soirée,
et le contenu texte (jour/heure, titre, description) pour qu'il
corresponde à l'événement. Le bouton "S'inscrire" se connecte alors
automatiquement au checkout de cet événement — rien d'autre à toucher.

Tant qu'un ID commence encore par `VOTRE-ID`, le bouton correspondant
reste désactivé (grisé) plutôt que de mener nulle part.

Pour ajouter ou retirer une soirée : dupliquez ou supprimez un bloc
`<article class="event-card">` entier. `event-visual-gold` peut devenir
`event-visual-green`, `event-visual-terracotta` ou `event-visual-olive`
pour varier les couleurs des visuels (définies dans `css/style.css`).

### 3. Vérifier que tout marche

Ouvrez `soirees.html`, cliquez sur "S'inscrire" pour un événement
connecté : la fenêtre de paiement Eventbrite doit s'ouvrir par-dessus la
page. Sur un ID encore placeholder, le bouton doit rester grisé.

### Limites à connaître

- **Pas de synchronisation automatique.** Ce site n'appelle pas l'API de
  lecture d'Eventbrite (ça demanderait un serveur intermédiaire pour ne
  pas exposer de clé privée côté navigateur) : si vous changez une date
  ou un titre sur Eventbrite, pensez à faire pareil dans `soirees.html`.
- **La fenêtre de paiement est celle d'Eventbrite**, hébergée par eux
  dans un cadre isolé (iframe) : on ne peut pas en recolorer l'intérieur
  depuis ce site. Ce qu'on contrôle entièrement, c'est le bouton
  "S'inscrire" lui-même (déjà dans le style du site) — pour un rendu
  d'ensemble plus personnalisé, Eventbrite permet d'ajuster la couleur
  de marque dans les paramètres de la page organisateur (*Manage
  events → Organization settings → Branding*), qui se répercute sur la
  fenêtre de checkout.
- **Plus de rappel automatique 24h avant** (fonctionnalité de l'ancienne
  version Supabase) : Eventbrite envoie ses propres emails de
  confirmation et de rappel aux inscrits, configurables depuis son
  tableau de bord (*Manage → Emails*).

## Carte de fidélité (Supabase)

Trois pages travaillent ensemble :

- `carte.html` (public) — un client entre prénom + téléphone une seule
  fois, obtient un QR code et un lien personnels ("sa carte"), et revoit
  sa progression à chaque visite du lien.
- `loyalty-scan.html` (staff, protégé par mot de passe) — scanne le QR
  code du client (caméra du téléphone) ou le cherche par numéro, ajoute
  un point d'un clic, et affiche une alerte quand la récompense se
  débloque.
- `loyalty-admin.html` (propriétaire, même mot de passe) — liste tous
  les clients avec leurs points et leur dernière visite, pour repérer
  les habitués.

**Choix faits pendant la construction :**
- **Pas de mot de passe côté client** : la carte s'ouvre via un lien/QR
  personnel (un identifiant aléatoire, impossible à deviner), pas un
  compte avec mot de passe — ça reste un geste de 5 secondes au comptoir.
  La contrepartie : celui qui a le lien voit la carte. Ne le partagez pas,
  et ne l'indexez pas (le fichier n'est de toute façon listé nulle part).
- **Personne (même le staff) ne peut lister tous les numéros de
  téléphone via l'API publique** : la base est verrouillée pour que le
  site ne puisse lire/écrire un profil qu'à travers des fonctions
  précises (voir `supabase/loyalty-schema.sql`), jamais en vrac.
- **Seuil de récompense** réglable à un seul endroit : `js/loyalty-config.js`
  (`LOYALTY_REWARD_THRESHOLD`, 8 par défaut).

### 1. Base de données

Si vous avez déjà un projet Supabase pour ce site (voir une éventuelle
section précédente de ce README), réutilisez-le : ouvrez **SQL Editor**
→ *New query*, collez tout `supabase/loyalty-schema.sql`, et cliquez
*Run*. Sinon, créez un projet gratuit sur [supabase.com](https://supabase.com)
d'abord, puis faites la même chose.

Dans **Project Settings → API**, notez l'**URL** du projet et la clé
**`anon` `public`**.

### 2. Brancher le site

Ouvrez `js/loyalty-config.js` et remplacez :

```js
window.SUPABASE_URL = "https://VOTRE-PROJET.supabase.co";
window.SUPABASE_ANON_KEY = "VOTRE-ANON-KEY";
```

par les valeurs notées à l'étape précédente, et ajustez
`LOYALTY_REWARD_THRESHOLD` si 8 points ne convient pas.

### 3. Créer le compte staff

**Authentication → Users → Add user** dans Supabase : un email + mot de
passe, partagé par l'équipe. C'est ce compte qui ouvre `loyalty-scan.html`
et `loyalty-admin.html` — pas d'inscription publique à ces pages.

### 4. Vérifier que tout marche

- Sur `carte.html`, créez une carte de test (votre prénom, votre numéro).
- Sur `loyalty-scan.html`, connectez-vous, cherchez ce numéro, cliquez
  "+ 1 point" plusieurs fois jusqu'au seuil — l'alerte de récompense doit
  apparaître, et "Marquer la récompense utilisée" doit remettre les
  points à zéro.
- Sur `loyalty-admin.html`, ce client doit apparaître dans la liste avec
  ses points et la date du jour en "dernière visite".
- Scanner un vrai QR code demande d'ouvrir `loyalty-scan.html` sur un
  téléphone/une tablette (accès caméra) et d'autoriser la caméra au
  premier essai.

### Limites à connaître

- Le lien/QR de la carte n'est pas un compte : quelqu'un qui le
  retrouve (capture d'écran partagée, téléphone perdu) peut voir les
  points, mais ne peut rien modifier (l'ajout de points est réservé au
  staff connecté). Un client qui perd son lien peut simplement être
  recherché par téléphone depuis `loyalty-scan.html`.
- Comme pour le calendrier Eventbrite, le scan caméra a besoin de
  `https://` (ou `localhost` en test) pour accéder à la caméra — ça
  fonctionne nativement sur n'importe quel hébergement web standard.

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
index.html                     Accueil
soirees.html                   Soirées à thème (programme + inscription Eventbrite)
galerie.html                   Galerie
carte.html                     Carte de fidélité (inscription + QR code du client)
reservation.html               Réservation
contact.html                   Contact & infos pratiques
loyalty-scan.html              Espace staff : scanner/chercher un client, ajouter un point
loyalty-admin.html             Espace propriétaire : liste des clients fidélité
css/style.css                  Styles partagés (mobile-first)
js/script.js                   Nav mobile, header au scroll, reveal au scroll, formulaire réservation
js/eventbrite.js               Connecte chaque bouton "S'inscrire" au widget de checkout Eventbrite
js/loyalty-config.js           Config Supabase + seuil de récompense (fidélité)
js/loyalty-card.js             Logique de carte.html (inscription, QR code, progression)
js/loyalty-scan.js             Logique de loyalty-scan.html (auth, caméra, recherche, +1 point)
js/loyalty-admin.js            Logique de loyalty-admin.html (auth, liste, recherche)
supabase/loyalty-schema.sql    Tables + fonctions sécurisées de la fidélité (à exécuter une fois)
```
