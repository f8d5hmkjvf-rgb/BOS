# Opérations de Bouclé

_Une appli en ligne : pas de local, pas de stock. Ce qui doit tourner : les comptes clients, la mise en route, le support, les paiements, l'administratif. Pas un avis juridique : chaque point légal est à confirmer avec la source officielle ou un professionnel._

## Étape 0 (bloquante) : qui encaisse l'argent, quand on a 16 ans

Robin a 16 ans et n'est pas émancipé. D'après la fiche officielle « Mineur et création d'entreprise » (entreprendre.service-public.fr/vosdroits/F31627) et plusieurs guides juridiques (LegalPlace, Legalstart, Keobiz, Portail auto-entrepreneur) :
- un mineur **non émancipé ne peut pas être micro-entrepreneur** ni commerçant en nom propre ;
- il **peut** être associé unique d'une **SASU ou EURL**, avec l'autorisation écrite de ses deux représentants légaux (ou d'un acte notarié) ;
- un mineur **émancipé** (décision du juge, possible dès 16 ans) peut être micro-entrepreneur.

Et en pratique :
- **Stripe** : selon son aide en ligne, un compte pour un moins de 18 ans doit être ouvert **au nom d'un parent ou tuteur légal**.
- **Directeur de la publication** du site (mentions légales, loi LCEN) : doit être une personne majeure d'après les guides consultés, donc un parent (à confirmer).

| Option | Coût | Délai | Pour | Contre |
|---|---|---|---|---|
| **A. Un parent porte l'activité** (micro-entreprise à son nom, ou ajout de l'activité à la sienne) — **recommandé maintenant** | 0 € de création | 1 à 4 semaines pour le SIRET (guichet unique : formalites.entreprises.gouv.fr) | Le plus simple et gratuit ; Stripe, banque et mentions légales au nom du parent | Juridiquement, l'activité et les revenus sont au parent (impôts du foyer) ; à écrire noir sur blanc en famille |
| B. SASU ou EURL au nom de Robin, avec autorisation des parents | ~250 € de création + comptable (~50-100 €/mois) | 2 à 4 semaines | C'est « ta » société | Plus cher que tout le budget de départ ; Stripe et directeur de publication restent au parent |
| C. Émancipation puis micro-entreprise | 0 à quelques centaines d'€ | plusieurs mois (juge) | Autonomie complète | Décision familiale lourde, pas à prendre pour une raison business |

**Recommandation** : option A dès cette semaine, passage à ta propre micro-entreprise à tes 18 ans. À valider avec tes parents et, si possible, un comptable (1 rendez-vous).

**Règle absolue** : aucun paiement de client tant que l'étape 0 n'est pas faite. Les essais gratuits (sans carte) peuvent démarrer avant.

## 1. Le cycle quotidien (≈ 20 min par jour, après les cours)
1. Lire les nouvelles inscriptions et le mail de bienvenue envoyé (vu par le client).
2. Proposer un créneau de mise en route à chaque nouvel inscrit (vu par le client).
3. Répondre au support (objectif : sous 24 h ouvrées ; vu par le client).
4. Regarder les erreurs de l'appli (journal Cloudflare) et les devis préparés qui ont échoué.
5. Envoyer les messages de prospection du jour (préparés par BOS).

## 2. Fournisseurs (les « matières premières »)
| Besoin | Fournisseur | Prix public | Alternative |
|---|---|---|---|
| Hébergement | Cloudflare Workers | 5 $/mois (offre Paid) | Offre gratuite (limites de calcul) |
| Base de données | Neon (Postgres) | Gratuit au départ, ~19 $/mois ensuite (hypothèse) | Supabase (offre gratuite) |
| IA | API Claude (Anthropic), modèle Sonnet 5.5 | 2 $ / 10 $ par million de tokens (entrée / sortie) | Haiku 5.5 bien moins cher (0,10 $ / 0,50 $) si la qualité suffit : à tester, ça diviserait le coût IA par ~20 |
| Mails | Brevo | Gratuit jusqu'à 300 mails/jour | — |
| Paiements | Stripe | 1,5 % + 0,25 € par carte européenne | — |
| Nom de domaine | Registrar .fr (ex. OVHcloud, Gandi) | ~10-15 €/an | — |
Aucun minimum de commande, aucun délai de livraison. Rien ne change dans `numbers.json`.

## 3. Les personnes
- **Robin, 10 h/semaine** : 4 h prospection et contenu (textes préparés par BOS), 3 h mises en route et support, 2 h produit et bugs, 1 h administratif.
- **Le parent titulaire** : ~1 h par mois (déclaration URSSAF du chiffre d'affaires, compte Stripe et banque).
- Pas de salarié, pas de salaire. Au-delà de ~20 clients, la mise en route manuelle ne tient plus en 10 h : la faire payer (49 €) ou l'automatiser.

## 4. Les routines (une page chacune)
**Mise en route d'un client (45 min)**
1. Le client envoie 3 anciens devis ou son fichier de prix.
2. Créer ses prestations dans « Réglages » (nom, unité, prix HT) ; mettre son logo et ses mentions.
3. En appel (téléphone ou visio, 20 min) : coller ensemble une vraie demande récente, vérifier le devis préparé ligne par ligne.
4. Lui montrer comment transférer un mail et coller un WhatsApp depuis son téléphone.
5. Noter le temps qu'il mettait avant pour un devis (la preuve pour plus tard).

**Fin d'essai (J+12)** : message personnel « Ton essai se termine dans 2 jours. Combien de devis préparés ? Tu continues à 19 € ? » ; appel si pas de réponse.

**Réclamation** : répondre sous 24 h, signer Robin ; corriger ou expliquer ; si le client ne gagne pas de temps : rembourser le 1er mois (garantie) sans discuter, et noter pourquoi.

**Fin de mois** : tenir le livre des recettes (date, client, montant, mode de paiement) ; vérifier les virements Stripe ; déclaration du chiffre d'affaires à l'URSSAF par le parent (mensuelle ou trimestrielle) ; export CSV des factures.

**Chaque semaine** : vérifier qu'une sauvegarde de la base existe (Neon garde un historique de restauration) ; relire les 3 chiffres de `marketing.md`.

## 5. Les outils
Tout existe déjà : l'appli Bouclé, Stripe (paiements), Brevo (mails), Cloudflare (hébergement et réception des mails), Neon (base), un tableur pour le livre des recettes. Pas d'outil de plus.

## 6. Obligations à vérifier (liste, pas un avis juridique)
| Point | Ce qu'il faut faire | Où vérifier |
|---|---|---|
| Statut et SIRET | Étape 0 ci-dessus | formalites.entreprises.gouv.fr, entreprendre.service-public.fr |
| TVA | En franchise en base, prix sans TVA et mention « TVA non applicable, art. 293 B du CGI » sur les factures de Bouclé ; seuil ~37 500 € pour les services (à vérifier) | impots.gouv.fr |
| Mentions légales, CGU, confidentialité | Pages déjà en ligne dans l'appli ; **remplacer les infos par celles du parent titulaire** (nom, SIREN, adresse, directeur de publication) | Loi LCEN, cnil.fr |
| Données personnelles (RGPD) | Bouclé traite les données des clients des pros (noms, mails, détails d'événements) : clause de sous-traitance (article 28) dans les CGU, registre des traitements, mention des transferts (Anthropic, Cloudflare) dans la politique de confidentialité, région de la base Neon en Europe | cnil.fr |
| Facture électronique | Réception obligatoire pour toutes les entreprises depuis septembre 2026 ; **émission obligatoire pour les petites entreprises en septembre 2027**. Bouclé émet les factures de ses clients : il devra passer par une plateforme agréée (connexion API) ou laisser le client déposer ses factures sur la sienne. Décision promise aux clients avant mars 2027 | impots.gouv.fr, economie.gouv.fr |
| Abonnement entre pros | Pas de droit de rétractation (clients pros) ; reconduction et résiliation claires (déjà sur la page d'abonnement) | — |
| Assurance | Responsabilité civile pro : pas obligatoire pour un logiciel, à envisager après 10 clients | assureur |

## 7. Registre des risques
| Risque | Probabilité | Gravité | Plan |
|---|---|---|---|
| Pas de structure pour encaisser à la date du lancement | Moyenne | Forte | Étape 0 cette semaine ; essais gratuits en attendant, jamais d'encaissement « au noir » |
| L'IA se trompe sur un devis envoyé | Moyenne | Forte | Validation obligatoire avant envoi (déjà) ; prix toujours du catalogue ; garantie |
| Panne Cloudflare, Neon ou Anthropic | Faible | Moyenne | Message honnête aux clients ; devis manuel toujours possible dans l'appli |
| Facture électronique pas prête en 2027 | Moyenne | Forte | Choisir une plateforme agréée partenaire en janvier 2027 ; sinon retirer la facturation et rester « l'outil de devis » |
| Robin n'a plus le temps (examens, bac) | Forte | Moyenne | Limiter à 20 clients fondateurs ; routines écrites ; prévenir les clients à l'avance |
| Personne ne répond aux messages | Moyenne | Forte | Changer d'accroche après 30 messages ; puis de métier (photographes, DJ) |
| Un gros concurrent lance la même chose | Moyenne | Moyenne | Avancer vite sur les traiteurs, catalogues types, relation directe |
| Fuite ou perte de données | Faible | Forte | Mots de passe forts, accès limité, sauvegardes Neon, plan de notification CNIL sous 72 h |
| Client mécontent qui publie un avis négatif | Moyenne | Moyenne | Réponse sous 24 h signée Robin, remboursement de la garantie |
| Coût IA plus élevé que prévu | Faible | Faible | Suivre la consommation ; tester Haiku 5.5 |
