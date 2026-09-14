# Site vitrine — Barbarossa

Site statique (HTML/CSS/JS, sans framework, sans backend) pour Barbarossa,
bar à soirées à thème et galerie d'art à Salernes (Var).

## Aperçu

Ouvrir `index.html` dans un navigateur, ou lancer un petit serveur local :

```bash
cd Output/2026-09-14-barbarossa-site
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## À personnaliser avant mise en ligne

Tout ce qui suit est un placeholder à remplacer dans `index.html` :

- **Adresse** (section Infos pratiques) : `[Adresse à compléter]`
- **Téléphone** : `[À compléter]` (2 endroits : Infos pratiques + modale de réservation) et les liens `tel:+33400000000`
- **Email de contact** : `contact@barbarossa-salernes.fr` (à remplacer partout par la vraie adresse)
- **Réseaux sociaux** : liens `href="#"` sur Instagram/Facebook, à remplacer par les vraies URLs
- **Horaires** : table indicative à ajuster
- **Exposition en cours** (section Galerie) : `[Titre de l'exposition]`, `[Nom de l'artiste]` et le texte de présentation
- **Photos** : le hero et la galerie utilisent des textures/couleurs générées en CSS en attendant de vraies photos du bar et des œuvres exposées. Remplacer les blocs `.frame` (galerie) par de vraies images, et ajouter une photo d'ambiance en fond du hero (`.hero` dans `css/style.css`) dès qu'elles sont disponibles.
- **Programmation des soirées** : les 4 cartes (jeudi à dimanche) sont un exemple de programme type — à ajuster selon la vraie programmation, et à mettre à jour chaque semaine/mois (thème du samedi, artiste invité, etc.)

## Réservation en ligne

Le bouton "Réserver" ouvre une modale avec un petit formulaire (date, nombre
de personnes, nom, téléphone). L'envoi se fait via **FormSubmit**
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
LaFourchette, etc.) : le plus simple est de remplacer le contenu de la
modale (`#reservation-modal` dans `index.html`) par l'iframe ou le lien
fourni par cet outil, et de garder les boutons "Réserver" tels quels.

## Déploiement

Le site est 100% statique : il peut être déposé tel quel sur Netlify,
Vercel, GitHub Pages, ou n'importe quel hébergement mutualisé classique
(pas besoin de base de données ni de serveur applicatif).

## Structure

```
index.html        Contenu et structure de la page
css/style.css      Styles (mobile-first)
js/script.js       Menu mobile, header au scroll, modale + envoi du formulaire
```
