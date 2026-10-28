# Dossier pour le conseil : Bouclé

## L'idée
Bouclé est une appli en ligne (SaaS, abonnement mensuel) pour les indépendants et TPE français qui reçoivent des demandes de devis par mail.

Fonctionnement :
1. Le professionnel transfère le mail de son client à son adresse Bouclé (ex. `traiteur-dupont-x7k2@demandes.boucle.app`), ou programme un transfert automatique depuis Gmail ou Outlook.
2. Une IA (Claude, d'Anthropic) lit la demande, résume le besoin, liste les informations manquantes et choisit les lignes du devis dans le catalogue de tarifs du professionnel. Les prix viennent toujours du catalogue, jamais de l'IA. Elle rédige aussi le mail de réponse.
3. Le professionnel relit, modifie et envoie le devis (PDF à son logo).
4. Devis accepté : facture conforme en un clic (numérotation continue, mentions légales françaises, TVA ou franchise).
5. Relances de devis et de factures rédigées automatiquement ; suivi des paiements, tableau de bord, export CSV des factures.

## Client cible
Indépendants et TPE (1 à 5 personnes) en France, de tous métiers de services qui font des devis : traiteurs, artisans du bâtiment, photographes, paysagistes, DJ, fleuristes, graphistes… Le fondateur a choisi de viser tous les métiers, France entière, plutôt qu'une niche.

## Prix envisagé
- 39 € HT par mois, ou 390 € HT par an.
- Tarif fondateur : 29 € HT par mois à vie pour les 10 premiers clients.
- 14 jours d'essai gratuit sans carte bancaire.
- Option envisagée : mise en route accompagnée à 149 € (une fois).

## Coûts connus (estimations du fondateur, à vérifier)
- Hébergement Cloudflare Workers : environ 5 $ par mois.
- Base de données Neon : 0 à 19 $ par mois au début.
- IA (API Claude) : quelques centimes d'euro par devis préparé.
- Envoi de mails (Brevo) : gratuit jusqu'à 300 mails par jour.
- Paiement Stripe : 1,5 % + 0,25 € par paiement (cartes européennes).
- Nom de domaine : environ 15 € par an.

## Ce qui existe déjà
- Appli complète construite et testée (multi-comptes, inscription, essai, abonnement Stripe, réception des mails, devis, factures, relances, PDF, mobile). Pas encore mise en ligne.
- Logo, nom (« Bouclé », pas de marque déposée identique trouvée en classes 9 et 42), une vidéo de présentation de 33 secondes pour les réseaux.
- 0 client payant. 1 cliente potentielle : un traiteur à Salernes (Var), déjà cliente de l'agence web du fondateur, pour qui l'appli a d'abord été conçue.
- Concurrents cités par le fondateur (non vérifiés) : Tolteck, Obat, Abby, Henrri (logiciels de devis et factures où la saisie est manuelle).

## Le fondateur et ses contraintes
- 16 ans, seul, environ 10 heures par semaine, budget de départ inférieur à 500 €.
- Pas de statut juridique : mineur non émancipé, il ne peut pas être micro-entrepreneur à son nom (options : SASU ou EURL avec autorisation écrite des parents, émancipation par le juge des tutelles, ou activité portée par un parent).
- Les services de paiement (Stripe) exigent un titulaire majeur ou un représentant légal.
- Pas d'objectif de revenu chiffré (« avoir des clients »). Réseau de professionnels : inconnu.

## Contexte réglementaire
- Facturation électronique : réception obligatoire pour toutes les entreprises depuis le 1er septembre 2026 ; émission obligatoire pour les TPE et micro-entreprises au 1er septembre 2027, via une plateforme agréée. Bouclé devra produire du Factur-X et se connecter à une plateforme agréée avant septembre 2027.
