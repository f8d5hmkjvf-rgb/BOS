# Connecter Gmail (adresse @gmail.com) et Google Sheets

AI HQ utilise **OAuth 2.0** : tu te connectes **chez Google**, et AI HQ ne voit ni ne stocke jamais ton mot de passe Gmail. Il ne conserve qu'un jeton révocable, chiffré côté serveur.

## Ce que les agents peuvent faire
| Action | Condition |
|---|---|
| Rechercher et lire des e-mails | Option « Autoriser la lecture » cochée, et **uniquement** les e-mails qui correspondent à ton filtre (par défaut `label:ai-hq` : seuls ceux auxquels tu as donné le libellé « ai-hq »). |
| Préparer un brouillon | Le brouillon apparaît dans Gmail. Rien n'est envoyé. |
| Envoyer un e-mail | **Jamais sans ton approbation explicite** : le contenu exact s'affiche dans l'onglet Validations, et tu cliques « Autoriser ». |
| Mettre à jour Google Sheets | Seulement en mode Sheets « direct » (voir plus bas). |

## 1. Créer le projet Google Cloud (gratuit)
1. Ouvre https://console.cloud.google.com/ avec ton compte Gmail.
2. En haut, sélecteur de projet → **Nouveau projet** → nom « AI HQ » → **Créer**. Aucune facturation n'est nécessaire.
3. Active les API :
   - Gmail : https://console.cloud.google.com/apis/library/gmail.googleapis.com → **Activer**
   - (si tu veux la voie Sheets directe) Google Sheets : https://console.cloud.google.com/apis/library/sheets.googleapis.com → **Activer**

## 2. Écran de consentement OAuth
1. Ouvre https://console.cloud.google.com/auth/overview (Google Auth Platform) → **Commencer**.
2. Informations :
   - nom de l'application : `AI HQ` ;
   - e-mail d'assistance : ton adresse Gmail ;
   - **Audience : Externe** (obligatoire pour une adresse @gmail.com) ;
   - coordonnées du développeur : ton adresse Gmail.
3. **Audience** → section *Utilisateurs de test* → **Ajouter des utilisateurs** → ton adresse Gmail. Laisse l'application en mode **Test**.
4. **Accès aux données** → **Ajouter ou retirer des champs d'application**, puis ajoute :
   - `https://www.googleapis.com/auth/gmail.compose` (brouillons et envoi) ;
   - `https://www.googleapis.com/auth/gmail.readonly` (seulement si tu autorises la lecture) ;
   - `https://www.googleapis.com/auth/spreadsheets` (seulement pour la voie Sheets directe).

> **Bon à savoir (mode Test).** Google affiche « Google n'a pas validé cette application » : c'est normal pour ta propre application. Clique **Paramètres avancés → Accéder à AI HQ**. En mode Test, Google invalide la connexion au bout de **7 jours** : il suffit alors de cliquer « Reconnecter » dans les Paramètres d'AI HQ. Reste en mode Test, sans vérification Google : c'est le cadre prévu pour un usage personnel.

## 3. Créer l'identifiant OAuth
1. Ouvre https://console.cloud.google.com/apis/credentials → **Créer des identifiants → ID client OAuth**.
2. Type : **Application Web**. Nom : `AI HQ`.
3. **URI de redirection autorisés** → ajoute **exactement** l'adresse affichée dans AI HQ (Paramètres → Google), par exemple :
   - `http://localhost:3000/api/connectors/google/callback` (sur ton ordinateur) ;
   - `https://mon-pc.mon-reseau.ts.net/api/connectors/google/callback` (si tu utilises Tailscale ; ajoute les deux).
4. **Créer**, puis copie l'**ID client** et le **Code secret du client**.

## 4. Connecter depuis AI HQ
1. AI HQ → onglet **Paramètres** → bloc **Google**.
2. Colle l'ID client et le code secret, choisis tes options (lecture, filtre, envoi) → **Enregistrer**.
3. Clique **Connecter Google**, choisis ton compte, accepte les autorisations.
4. De retour dans AI HQ, le statut affiche **Connecté (testé) · ton@gmail.com**. Le bouton **Tester** refait la vérification à tout moment.

Si tu changes les options (lecture, voie Sheets), clique **Reconnecter** : Google te demandera seulement les nouvelles autorisations.

## 5. Révoquer
- Dans AI HQ : Paramètres → Google → **Révoquer**. Le jeton est invalidé chez Google ET effacé d'AI HQ.
- Vérification ou révocation côté Google à tout moment : https://myaccount.google.com/permissions

## 6. Voie Google Sheets directe (sans n8n)
1. Crée un tableur sur https://sheets.google.com et nomme un onglet `Missions`.
2. Copie son identifiant dans l'URL : `https://docs.google.com/spreadsheets/d/`**`IDENTIFIANT`**`/edit`.
3. AI HQ → Paramètres → **Google Sheets** → voie **Directement avec Google Sheets**, colle l'identifiant → **Enregistrer**.
4. **Reconnecter Google**, pour ajouter l'autorisation Sheets.
5. **Tester** : le statut devient « Connecté (testé) ». AI HQ écrit la ligne d'en-têtes puis une ligne par mission, mise à jour sans doublon.
