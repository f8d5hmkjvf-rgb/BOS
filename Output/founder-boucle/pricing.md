# Prix de Bouclé

_27 octobre 2026. Sources : `pricing-curve.md` (réponses de prix des 100 acheteurs simulés), `competitors.md` (prix publics), `numbers.json` + `unit_economics.py` (marges). Les réponses d'acheteurs simulés servent à choisir quoi tester, pas de preuve._

## 1. Le prix : **24 € HT par mois** (240 € HT par an, soit 2 mois offerts)

Pourquoi 24 € et plus 39 € :

- **Ce que les acheteurs ont dit** (panel de 100) : fourchette acceptable **9 à 29 € HT/mois** (PMC 8,98 €, PME 29,10 €). Le point d'équilibre (autant de « bonne affaire » que de « ça devient cher ») est à **18,81 €**. 39 € est **au-dessus** de ce que la majorité accepte : c'est la 2e raison de refus (24 acheteurs sur 97).
- **Les bons clients acceptent plus** : les acheteurs « débordés, veulent gagner du temps » et « technophiles » placent le « ça devient cher » à **30 €** et le « trop cher » à **50 €**. Ceux qui utilisent un outil gratuit le placent à 15 €. 24 € vise les premiers sans faire fuir tout le monde.
- **Face aux concurrents** : médiane des outils payants comparables 25 à 29 € HT (Tolteck, FlowDevis, MonDevisAI) ; outils IA « tout-en-un » à 49 € (MonArtisan, iArtisan). À 24 €, Bouclé est **sous la médiane et à moitié prix des outils IA**, sans se battre contre le gratuit (Henrri, Tiime, Abby) sur leur terrain.
- **La marge** (calcul `unit_economics.py`, hypothèses dans `numbers.json`) :

| Prix HT/mois | Coût variable par client | Marge par client | Clients pour couvrir les frais fixes | Résultat année 1 (montée prudente) |
|---|---|---|---|---|
| 19 € | 1,84 € | 17,16 € (90 %) | 2 | 957 € |
| **24 €** | 1,84 € | **22,16 € (92 %)** | **2** | **1 367 €** |
| 29 € | 1,84 € | 27,16 € (94 %) | 2 | 1 777 € |
| 39 € | 1,84 € | 37,16 € (95 %) | 1 | 2 597 € (mais 39 € fait fuir, voir ci-dessus) |

Le coût d'un client est minuscule (IA + frais Stripe ≈ 1,84 €). **Le prix ne se décide donc pas sur les coûts mais sur ce que les clients acceptent.** Le vrai risque n'est pas la marge, c'est le nombre de clients.

## 2. L'échelle de prix (simple : deux marches)

| Offre | Prix | Pour qui | Pourquoi monter d'un cran |
|---|---|---|---|
| **Bouclé** | 24 € HT/mois, ou 240 € HT/an | Tout pro qui reçoit des demandes de devis par mail | Le cœur : demande → devis avec vos prix → facture → relances |
| **Mise en route faite pour vous** | 49 € HT une fois (option) | Celui qui n'a « pas le temps de saisir son catalogue » | On crée votre catalogue à partir de 3 anciens devis ou de votre fichier Excel, et on règle votre premier devis avec vous. Répond à l'objection n°1 « je n'ai pas le temps de tout saisir » |

Pas d'offre gratuite permanente au lancement : elle attirerait les 18 % qui ne paieront jamais et ajouterait du support. L'essai de 14 jours sans carte remplit ce rôle. À revoir si le test montre que les petits volumes (2 à 5 devis par semaine) bloquent tous sur le prix : un palier « 10 devis par mois à 9 € » serait alors l'option (comme MonDevisAI).

## 3. L'offre d'ouverture (avec une vraie date de fin)

- **Tarif fondateur : 19 € HT/mois à vie** (au lieu de 24 €) **+ mise en route offerte** (valeur 49 €), pour les **20 premiers clients** ou jusqu'au **31 décembre 2026**, au premier des deux.
- Le prix fondateur reste à vie pour ces clients, et ne revient jamais ensuite : pas de « promo » répétée, donc personne n'apprend à attendre une réduction.
- Pas de faux prix barré : 24 € n'est affiché comme prix normal qu'à partir du moment où il est réellement appliqué aux nouveaux clients.

## 4. Ce qu'il faut tester avec de vrais acheteurs

| Test | Comment | Ce qu'on regarde |
|---|---|---|
| **19 € contre 29 €** (deux prix dans la fourchette) | Dans les messages directs aux traiteurs et pros de l'événementiel : un sur deux reçoit l'offre à 19 €, l'autre à 29 € (même texte, même lien d'essai, deux codes) | Taux de démarrage d'essai, puis taux de passage au payant à J+14 |
| **Mise en route payante ou non** | 10 premiers essais : proposer la mise en route à 49 € ; 10 suivants : offerte | Combien la prennent ; est-ce que les clients avec catalogue rempli par nous restent plus |
| **Mensuel ou annuel** | Afficher les deux sur la page d'abonnement | Part qui choisit l'annuel (trésorerie d'avance) |

Seuil de décision : à 30 essais démarrés, garder le prix qui donne le plus de **clients payants** (pas le plus d'essais).

## 5. Les trois objections de prix (mot pour mot, panel simulé, pour le marketing)

1. **« Pourquoi payer alors que c'est gratuit ailleurs ? »** — « 39 € par mois, c'est presque 500 € par an alors que Henrri ou Tiime me font mes devis et mes factures gratuitement. » (P024)
2. **« Encore un abonnement pour un truc que je fais déjà »** — « Encore un abonnement, et à 39 € HT par mois ça fait 468 € par an pour un truc que je fais déjà avec mon modèle Word le soir ou le dimanche. » (P015)
3. **« Trop cher pour mon petit volume »** — « 39 € par mois pour 2 à 5 devis par semaine, alors que Henrri et Tiime sont gratuits, je ne vois pas pourquoi je paierais. » (P049)

Réponse à porter partout : Bouclé ne remplace pas un outil de facturation gratuit, il **répond aux demandes avant les concurrents**. Un seul événement gagné (un traiteur facture 1 500 à 5 000 € par mariage) paie des années d'abonnement. Et le calcul en temps : 1 h par devis gagnée × 8 devis par mois = 8 h rendues pour 24 €.

## Règles respectées
- Aucun prix sous le coût variable (1,84 €).
- Pas de prix d'appel fictif ni de prix barré jamais pratiqué.
- `numbers.json` mis à jour au prix de 24 €.
