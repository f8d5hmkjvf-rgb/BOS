# AI HQ — entreprise d'agents IA

Deux moteurs, strictement séparés :

1. **L'orchestrateur réel.** Gaspard, le CEO IA, reçoit tes objectifs en langage naturel. Il les décompose, délègue aux 28 spécialistes, organise réunions et consultations, vérifie les livrables et te remet un rapport. Tout passe par l'API Anthropic, avec des tâches persistées dans PostgreSQL et exécutées par des workers.
2. **Le QG vivant.** Le bureau isométrique (PixiJS) où les 29 personnages vivent leur journée : toilettes et lavage des mains, café, cantine, couloirs, discussions, repos. Il **met en scène** les vraies missions : un agent sur une tâche travaille à son bureau, les participants d'une réunion convoquée par Gaspard marchent jusqu'à la salle Atlas et s'y assoient, et les répliques IA réelles y sont jouées.

> Aucun résultat IA n'est simulé. Sans `ANTHROPIC_API_KEY` ou sans `DATABASE_URL`, l'interface affiche « Configuration requise », la création de mission est refusée et le worker ne démarre pas.

## Démarrage

**Sur ton ordinateur, sans serveur ni domaine (recommandé)** : suis `docs/HEBERGEMENT.md`. En résumé :

```bash
cp .env.example .env            # mots de passe, clés (openssl rand…), ANTHROPIC_API_KEY
docker compose up -d --build    # PostgreSQL + application + worker
# → http://localhost:3000 ; accès téléphone en HTTPS privé via Tailscale
```

**Pour développer** : `npm install`, puis `.env.local` avec `DATABASE_URL` et `ANTHROPIC_API_KEY`, puis `npm run dev` et `npm run worker` dans deux terminaux. `npm run check:anthropic` vérifie la clé par un appel réel (moins de 0,01 $).

| Guide | Contenu |
|---|---|
| `docs/HEBERGEMENT.md` | Mise en ligne pas à pas : ordinateur + Tailscale (0 €), puis serveur optionnel |
| `docs/GOOGLE.md` | Projet Google Cloud, écran de consentement OAuth, Gmail, Google Sheets direct |
| `docs/N8N.md` | n8n Cloud ou auto-hébergé, webhooks signés, workflow Google Sheets fourni |

## Ce que fait Gaspard

```
Objectif (langage naturel)
  └─ plan        Gaspard analyse, choisit les spécialistes, fixe les dépendances (schéma strict + validation : cycles, assignés, doublons)
     ├─ meeting  Réunion de lancement si utile : chaque participant parle avec sa personnalité, Gaspard conclut (compte rendu transmis aux tâches)
     ├─ execute  Chaque spécialiste travaille avec SES outils : recherche web, consultation d'un collègue, envoi externe (validation humaine), remise du livrable
     ├─ review   Gaspard vérifie chaque livrable : accepte ou demande une révision (2 tours max, la révision prolonge la conversation de l'agent)
     └─ report   Rapport final : résultat, livrables, décisions, prochaines actions pour toi
```

Chaque agent a une personnalité, des compétences, des instructions système, une liste blanche d'outils et un historique persistant de tous ses échanges avec l'API (`GET /api/agents/:id`).

## Sécurité, permissions, coûts

| Garde-fou | Mise en œuvre |
|---|---|
| Clé API | Lue côté serveur uniquement, jamais envoyée au navigateur. L'URL de l'API est explicite (`AIHQ_ANTHROPIC_BASE_URL`, par défaut `https://api.anthropic.com`). |
| Actions sensibles | `send_webhook` crée une demande de validation. Rien ne part tant que tu n'as pas cliqué « Autoriser » et confirmé. La décision est unique et verrouillée en base, et l'agent reprend ensuite exactement où il en était. |
| Outils | Liste blanche par agent ; un outil non autorisé est refusé et l'agent en est informé. |
| Budget | Avertissement à 80 % (mission et journée), blocage des appels au plafond. 3 $ maximum par mission (plafond `AIHQ_MAX_MISSION_BUDGET_USD`, même quand on relève le budget à la main) et 20 $ par jour. Vérifié **avant** chaque appel (pire cas). Un dépassement met la mission en pause sans échec ; tu peux reprendre en relevant le budget. Chaque appel est tracé dans `api_usage` (tokens, cache, recherches web, coût). |
| Erreurs | Les erreurs 429, 5xx et réseau sont retentées avec un backoff exponentiel. Les erreurs 400, 401, un refus du modèle ou un budget dépassé arrêtent la tâche sans réessai, avec un message clair. Si un worker meurt, son bail expire et un autre worker reprend la tâche. |
| Accès | Mot de passe obligatoire en production (`AIHQ_ADMIN_PASSWORD`), session signée (cookie `httpOnly`, `Secure`, 7 jours), 5 tentatives par 15 min et par IP, protection CSRF par vérification de l'origine, en-têtes de sécurité (CSP stricte, HSTS, anti-iframe). Jeton d'API optionnel (`AIHQ_ADMIN_TOKEN`) pour n8n ou tes scripts. Sans mot de passe configuré, le serveur de production refuse tout accès. |
| Repli | `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) : si le modèle décline une requête, l'API la rejoue sur le modèle de repli recommandé. |

**Modèles** : le modèle économique `claude-sonnet-5-5` sert par défaut (exécution des tâches, réunions, consultations). Le modèle avancé `claude-opus-5-5` est réservé à Gaspard (plan, revue, rapport) et aux tâches qu'il marque `complex` dans son plan. Les deux sont configurables (`AIHQ_MODEL_ECONOMY`, `AIHQ_MODEL_ADVANCED`).

## Synchronisation missions ↔ QG

Le worker publie des événements (`events`) diffusés en SSE (`/api/events`), que l'interface traduit en comportements :

| Événement réel | Dans le QG |
|---|---|
| Tâche en cours | L'agent quitte sa pause et travaille à son bureau. S'il était rentré chez lui, il revient. |
| Attente de validation | Pastille orange sur l'agent, onglet « Validations ». |
| Réunion convoquée | Les participants marchent jusqu'à la salle Atlas et s'assoient. Une réunion de routine en cours est écourtée. |
| Réplique de réunion | Bulle sur l'orateur, dans l'ordre réel, avec le texte complet dans le journal et la mission. |
| Consultation | L'agent va au poste du collègue, l'échange réel est joué, puis il retourne travailler. |

Les besoins physiologiques restent prioritaires (une vessie pleine passe avant tout), et les bavardages de couloir restent générés par des modèles écrits, sans aucun appel API.

**Sauvegarde complète** : l'état du QG est sauvegardé dans PostgreSQL toutes les 60 s (ou dans le navigateur, faute de base), puis rechargé au démarrage. Il couvre les positions, les besoins, les relations, les tâches en cours, les files d'attente, les réservations, les conversations, les réunions et les consultations. La reprise est exacte : sauvegarder, recharger et continuer donne la même suite qu'une simulation ininterrompue (testé). Missions, tâches, conversations, validations et coûts vivent dans PostgreSQL.

## Premier workflow : AI HQ → Gaspard → agents → Google Sheets

1. Tu confies une mission à Gaspard, avec une priorité.
2. Il planifie, délègue et vérifie ; les agents exécutent les tâches autorisées.
3. À chaque changement (statut, progression, coût, résultat vérifié), la mission entre dans une file de synchronisation : **une entrée par mission**, version croissante, regroupée sur 3 secondes.
4. Le worker pousse la dernière version par **une seule voie**, choisie dans Paramètres → Google Sheets :

| Voie | Quand | Statut affiché |
|---|---|---|
| **Démonstration** (par défaut) | aucun identifiant | « MODE DÉMONSTRATION » : tableau local dans AI HQ, clairement marqué |
| **Via n8n** | n8n connecté (testé) | appel signé HMAC vers ton workflow n8n (modèle fourni : `deploy/n8n/ai-hq-google-sheets.json`) |
| **Directe** | Google connecté avec l'accès Sheets | API Google Sheets, sans n8n |

L'upsert par **ID mission** rend la synchronisation idempotente : la rejouer ne crée jamais de doublon (testé). Colonnes : ID mission, date de création, nom, agent responsable, département, priorité, statut, progression, résultat, coût API, dernière mise à jour. Chaque exécution et chaque erreur sont visibles dans Paramètres → Historique des exécutions, avec reprise automatique (backoff).

## Connecteurs (Paramètres)

Un connecteur n'est affiché **« Connecté (testé) »** qu'après un test réel réussi. C'est aussi seulement à ce moment que ses outils sont proposés aux agents, et uniquement pour les rôles autorisés. Les identifiants sont chiffrés (AES-256-GCM, `AIHQ_ENCRYPTION_KEY`) et ne sont jamais renvoyés au navigateur.

| Connecteur | Ce que les agents peuvent faire | Validation humaine |
|---|---|---|
| **Gmail** (OAuth 2.0, jamais de mot de passe) | rechercher et lire **uniquement** les e-mails de ton filtre (`label:ai-hq` par défaut), préparer des brouillons | **envoi** : toujours |
| **n8n** (Cloud ou auto-hébergé) | demander un workflow de ta liste autorisée | toujours |
| **Slack** (webhook entrant) | publier un message | toujours |

La connexion Google est révocable en un clic : le jeton est invalidé chez Google et effacé d'AI HQ.

## Mise en ligne

Voir `docs/HEBERGEMENT.md`. Option gratuite : ton ordinateur avec Docker, plus Tailscale pour un accès HTTPS privé depuis ton téléphone. Option serveur, plus tard et à ta décision : `docker compose --profile public up -d --build`, Caddy fournissant le HTTPS automatique. Rien n'est déployé publiquement ni acheté automatiquement.

**QG interactif** : clique sur la machine à café, une cabine ou une fontaine pour voir son état et sa file d'attente. Le voyant de la machine est vert si elle est libre, ambre pendant la préparation, avec de la vapeur. Le bouton « Offrir une pause café » fonctionne en pure simulation, sans aucun appel IA. L'occupant d'une cabine n'est jamais nommé.

## Tests

```bash
npm test                         # 106 tests (les tests PostgreSQL sont ignorés sans base)
TEST_DATABASE_URL=postgres://…/aihq_test npm test   # suite complète sur une vraie base
npm run bench -- 2               # 2 jours simulés, invariants de collision
```

Les tests d'orchestration tournent sur un vrai PostgreSQL. Seul le modèle y est remplacé par une doublure scriptée (`tests/helpers/fakeLlm.ts`, réservée aux tests), qui couvre plan, réunion, consultation, révision, validation humaine, budget, reprise après erreur, refus du modèle et outils interdits. `tests/e2e/scripted-worker.ts` permet de vérifier l'interface et les animations sans clé : ses sorties sont marquées `[TEST SCRIPTÉ]`.

## Architecture

```
src/orchestrator/  config · db (pg) · store (missions, tâches, historique, conversations, validations, coûts, événements, automatisations)
                   llm (SDK Anthropic + contrôle des coûts) · loop (boucle agentique persistante et reprenable)
                   agents (29 fiches) · tools · ceo (plan, revue, rapport, avancement) · executor · meeting · actions · worker
src/sim/           moteur du QG, déterministe et à pas fixe (A*, HFSM, Utility AI, ressources, besoins, social, réunions, consultations, sauvegarde v2)
src/render/        rendu PixiJS isométrique
src/components/    interface React : panneaux Gaspard, Validations, QG, Coûts, et pont SSE → simulation
app/api/           missions · approvals · agents · automations · events (SSE) · saves · status
scripts/           worker · check-anthropic · bench
```
