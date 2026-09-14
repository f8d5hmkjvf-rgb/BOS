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
- `soirees.html` — Soirées à thème (programme hebdomadaire)
- `galerie.html` — Galerie (exposition en cours + œuvres)
- `reservation.html` — Réservation (formulaire complet)
- `contact.html` — Contact & infos pratiques (adresse, horaires, carte)

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
- **Programmation des soirées** (`soirees.html`) : les 4 cartes (jeudi à
  dimanche) sont un exemple de programme type — à ajuster et mettre à jour
  chaque semaine/mois (thème du samedi, artiste invité, etc.)

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

## Design

Direction calibrée sur le site de Château de Berne (chateauberne.com),
donné comme référence de style — un domaine provençal de luxe discret —
adaptée à l'ambiance bar de nuit + galerie de Barbarossa.

- **Palette** : anthracite chaud (`--ink`, `--ink-raised`) avec un seul
  accent — un or mat (`--gold` / `--gold-deep` pour les boutons), repris
  directement du ton signature de la référence plutôt qu'un cuivre vif.
  Tokens définis en haut de `css/style.css`.
- **Typographie** : « Spectral » (serif élégante) pour les titres,
  « Karla » pour le texte courant — les deux polices réellement utilisées
  par la référence. Chargées depuis Google Fonts.
- **Espacements** : échelle généreuse (`--space-*`), sections plus aérées
  qu'avant, pour retrouver le calme et la respiration de la référence.
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
index.html          Accueil
soirees.html         Soirées à thème
galerie.html         Galerie
reservation.html     Réservation
contact.html         Contact & infos pratiques
css/style.css        Styles partagés (mobile-first)
js/script.js         Nav mobile, header au scroll, reveal au scroll, formulaire
```
