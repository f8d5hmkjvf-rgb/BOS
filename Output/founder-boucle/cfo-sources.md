# Sources des chiffres du CFO

| Ligne | Montant | Source ou raisonnement | Statut |
|---|---|---|---|
| Prix | 19 € HT/mois (année 1), 24 € ensuite | `pricing.md` (offre fondateurs pour les 20 premiers) | Décision |
| IA par client | 1,20 €/mois | Bouclé utilise Claude Sonnet 5.5 (`lib/analyse.ts`). Tarif public : 2 $ / million de tokens en entrée, 10 $ en sortie. Un devis ≈ 3 000 tokens lus + 1 500 écrits ≈ 0,021 $. Arrondi prudemment à 0,03 € × 40 devis/mois | Estimation |
| Frais Stripe | 1,5 % + 0,25 € par paiement | Grille publique Stripe France, cartes de l'Espace économique européen (stripe.com/fr/pricing) | Prix public, à revérifier |
| Mails et stockage | 0,10 €/client | Brevo gratuit jusqu'à 300 mails/jour ; stockage négligeable | Estimation |
| Garantie | 0,38 €/client-mois | 20 % des nouveaux clients remboursés de 19 €, étalé sur 10 mois de durée de vie | Hypothèse |
| Cotisations sociales | 22 % du CA (4,18 €) | Ordre de grandeur des taux micro-entreprise pour les prestations de services (21,2 % en BIC, plus en BNC). Le bon taux dépend du statut choisi (voir `ops.md`) | Hypothèse à confirmer par l'URSSAF ou un comptable |
| Cloudflare Workers Paid | 4,60 €/mois | 5 $/mois, page de prix Cloudflare Workers | Prix public |
| Neon (base de données) | 17,50 €/mois | ~19 $/mois pour l'offre payante d'entrée ; l'offre gratuite peut suffire au début (scénario calculé dans `cfo.md`) | Hypothèse prudente |
| Nom de domaine | 1,25 €/mois | ~15 €/an pour un .fr | Prix courant, estimation |
| Compte bancaire | 5 €/mois | Compte dédié en ligne, entrée de gamme | Hypothèse |
| Crédit API de départ | 10 € | Recharge minimale de départ | Estimation |
| Test publicité | 100 € | Réservé, dépensé seulement après 3 clients payants (`marketing.md`) | Décision |
| Statut juridique | 0 € | Activité portée par un parent en micro-entreprise : création gratuite sur le guichet unique (formalites.entreprises.gouv.fr). Une société (SASU) coûterait ~250 € de plus + un comptable | Voir `ops.md` |
| Montée en clients | 0 → 15 en 12 mois | Prudente ; voir la note du CFO sur le panel à 3 % | Hypothèse, la plus fragile |
