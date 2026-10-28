# Note du CFO

_Montants en **euros** ; une unité = **un client payant pendant un mois**. Hypothèses marquées dans `numbers.json`, sources dans `cfo-sources.md`._

- **La marge** : chaque client à 19 €, HT/mois laisse **12,60 €** après ses coûts directs (66 %). Le plus gros coût n'est pas l'IA (1,20 €) mais les **cotisations sociales (~4,18 €, hypothèse 22 % du CA)**. À 25 clients, la marge nette est de **60 %**.
- **Seuil de rentabilité** : **2,25 clients payants** (donc 3) couvrent les 28,35 € de frais fixes mensuels.
- **La ligne à surveiller : le nombre de clients (la montée).** À volume divisé par 2, l'année 1 tombe de 583 € à 66 € après dépenses de départ, et le remboursement passe du mois 8 au mois 11. Le prix et les coûts bougent beaucoup moins (prix −10 % : 693 € → 537 € de résultat).
- **Trésorerie nécessaire avant que ça paie : ~157 €** (110 € de départ + pertes des 3 premiers mois). Ça tient dans le budget de moins de 500 €.
- **La montée (prudente)** : 0 client en novembre 2026, 15 en octobre 2027. Contrôle avec le panel : 3 % d'achat sur des acheteurs simulés (un maximum, les IA sont trop gentilles). Pour 15 clients il faut donc toucher au moins **500 pros**, ou convertir beaucoup mieux par contact direct avec l'offre de mise en route. C'est le chiffre le plus fragile du plan.
- **Trois façons d'améliorer la marge** (chacune calculée par l'outil) :
  1. Rester sur l'offre gratuite de Neon tant qu'elle suffit : frais fixes 28,35 € → 10,85 €, seuil 2,25 → **0,86 client**, année 1 583 € → **793 €**.
  2. Passer au prix public de 24 € après les 20 fondateurs : contribution 12,60 € → **16,33 €**, année 1 → **889 €**.
  3. Vendre l'annuel (240 €) : pas de changement de marge mais 10 mois d'avance en trésorerie et moins de frais Stripe (1 paiement au lieu de 12).
- **Conditions d'argent du conseil** : « chiffrer le coût d'un client » → plafond calculé dans `marketing.md` ; « structure et titulaire Stripe avant le 1er encaissement » → **non rempli**, voir `ops.md` (étape 0).
- Le temps de Robin n'est pas compté (0 €). Pas un conseil fiscal ou juridique : un expert-comptable doit valider le statut, le taux de cotisations et la TVA avant le premier euro encaissé.

# Économie unitaire : Bouclé (appli de devis et factures, abonnement mensuel)

Chaque chiffre vient du fichier d'entrée `numbers.json`.

## Un client payant pendant un mois

| ligne | par client et par mois |
| --- | ---: |
| Prix | 19,00 € |
| IA Claude Sonnet 5.5 : ~40 devis par mois x ~0,03 € (estimation prudente) | -1,20 € |
| Frais Stripe : 1,5 % + 0,25 € par paiement de 19 € | -0,54 € |
| Envoi des mails et stockage (estimation, quasi nul au début) | -0,10 € |
| Garantie 1er mois : 20 % x 19 € étalé sur 10 mois (hypothèse) | -0,38 € |
| Cotisations sociales micro-entreprise : ~22 % du chiffre d'affaires (hypothèse, taux à confirmer) | -4,18 € |
| **Contribution** (ce que chaque client laisse pour payer les frais fixes) | **12,60 €** (66%) |

## La marge qui compte

Frais fixes : 28 € par mois (Cloudflare Workers Paid (5 $) 5 €, Base Neon, offre payante dès les premiers clients (hypothèse prudente, ~19 $) 18 €, Nom de domaine (~15 € par an) 1 €, Compte bancaire pro (hypothèse) 5 €).

- **Seuil de rentabilité : 3 clients payants par mois.** En dessous, on perd de l'argent chaque mois.
- **Marge nette au plan** (25 clients) : **60%** de chaque vente, après tous les coûts.
- Capacité : 2000 clients par mois.

## Année 1, mois par mois

| mois | clients payants par mois | chiffre d'affaires | résultat | cumul (après 110 € de départ) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | 0 € | -28 € | -138 € |
| 2 | 1 | 19 € | -16 € | -154 € |
| 3 | 2 | 38 € | -3 € | -157 € |
| 4 | 3 | 57 € | 9 € | -148 € |
| 5 | 4 | 76 € | 22 € | -126 € |
| 6 | 6 | 114 € | 47 € | -79 € |
| 7 | 7 | 133 € | 60 € | -19 € |
| 8 | 9 | 171 € | 85 € | 66 € |
| 9 | 10 | 190 € | 98 € | 164 € |
| 10 | 12 | 228 € | 123 € | 287 € |
| 11 | 13 | 247 € | 135 € | 422 € |
| 12 | 15 | 285 € | 161 € | 583 € |

- **Résultat d'exploitation de l'année 1 : 693 €** pour 1 558 € de chiffre d'affaires.
- Après les 110 € de dépenses de départ : 583 €.
- Dépenses de départ remboursées : mois 8.
- Trésorerie nécessaire avant que ça paie : **157 €**.

## Et si…

| scénario | marge au plan | seuil (clients/mois) | résultat année 1 |
| --- | ---: | ---: | ---: |
| Plan de base | 60% | 3 | 693 € |
| Prix −10 % | 56% | 3 | 537 € |
| Clients −20 % | 59% | 3 | 486 € |
| Coûts unitaires +15 % | 55% | 3 | 614 € |

Aucun signal d'alerte dans ces chiffres. Ils ne valent que ce que valent les hypothèses : vérifier chaque coût avec un vrai devis.
