# Connecter n8n (Cloud ou auto-hébergé) et le workflow Google Sheets

n8n reste **facultatif** : sans lui, AI HQ synchronise en **mode démonstration**, avec un tableau local clairement marqué « DÉMO », ou directement avec Google Sheets (voir `docs/GOOGLE.md`). Une seule voie est active à la fois (Paramètres → Google Sheets).

## Comment AI HQ sécurise les appels vers n8n
Chaque appel est un `POST` JSON vers l'URL de ton webhook n8n, avec trois en-têtes :

| En-tête | Rôle |
|---|---|
| `x-aihq-timestamp` | Heure d'envoi : n8n refuse un appel de plus de 5 minutes (anti-rejeu). |
| `x-aihq-signature` | `sha256=HMAC(secret, timestamp + "." + corps)` : prouve que l'appel vient d'AI HQ. |
| `x-aihq-idempotency-key` | Clé stable par événement : un même événement rejoué n'est traité qu'une fois. |

Corps envoyé : `{ source, type, workflow, idempotencyKey, sentAt, data }`, où `type` vaut `ping` (test), `sync_mission` (Google Sheets) ou `workflow` (action demandée par un agent).

Les agents ne déclenchent un workflow que s'il figure dans **ta liste autorisée** (Paramètres → n8n) **et** après ta validation dans l'onglet Validations. Chaque exécution et chaque erreur sont listées dans Paramètres → **Historique des exécutions**.

## 1. Disposer de n8n
- **n8n Cloud** (essai gratuit, puis payant, à ta décision) : https://n8n.io/
- **Auto-hébergé** (gratuit) : https://docs.n8n.io/hosting/. Il doit être joignable en HTTPS par AI HQ. Ajoute la variable `NODE_FUNCTION_ALLOW_BUILTIN=crypto` pour que la vérification de signature fonctionne.

## 2. Importer le workflow fourni
1. Dans n8n : **Workflows → Import from File** → `deploy/n8n/ai-hq-google-sheets.json`.
2. Nœud **Google Sheets : ajouter ou mettre à jour** :
   - crée ou sélectionne une connexion Google (OAuth, assistant n8n) ;
   - remplace `COLLER_ICI_L_ID_DU_TABLEUR` par l'identifiant de ton tableur (dans son URL, entre `/d/` et `/edit`) ;
   - vérifie que l'onglet s'appelle `Missions`, et que sa **première ligne** contient exactement les en-têtes : `ID mission | Date de création | Nom de la mission | Agent responsable | Département | Priorité | Statut | Progression | Résultat | Coût API (USD) | Dernière mise à jour`.
3. Ouvre le nœud **Webhook AI HQ** et copie la **Production URL** (`…/webhook/ai-hq`).
4. Active le workflow (interrupteur **Active**).

> Ce modèle a été vérifié par des tests automatiques côté AI HQ : signature, rejeu, correspondance par « ID mission ». Il n'a pas pu être importé dans une instance n8n réelle depuis cet environnement. Si une version de n8n affiche un nœud à mettre à jour, ouvre-le et enregistre-le.

## 3. Relier AI HQ et n8n
1. AI HQ → **Paramètres → n8n** : choisis Cloud ou auto-hébergé, colle la Production URL, garde `sync_mission` dans les workflows autorisés → **Enregistrer**. AI HQ génère alors un secret de signature.
2. Clique **Afficher le secret** et copie-le.
3. Dans n8n, nœud **Vérifier la signature** : remplace `COLLER_ICI_LE_SECRET_AI_HQ` par ce secret, enregistre.
4. AI HQ → **Tester (ping signé)** : le statut passe à **Connecté (testé)** seulement si n8n répond correctement.
5. Paramètres → **Google Sheets** → voie **Via n8n** → **Enregistrer** → **Tester**.
6. Clique **Tout resynchroniser** : chaque mission existante apparaît une seule fois dans le tableur.

## 4. Ajouter d'autres workflows pour les agents
1. Dans n8n, ajoute un chemin dans le même workflow (condition sur `{{$json.workflow}}`) ou crée un autre workflow de webhook.
2. Ajoute son nom (par ex. `ajouter_prospect`) dans la liste autorisée des Paramètres.
3. Les agents des rôles concernés (direction, tech, data, ops, ventes, marketing) pourront le demander. Chaque demande attend ton approbation.

Changer le secret : Paramètres → n8n → **Nouveau secret**, puis le recoller dans le nœud de vérification.
