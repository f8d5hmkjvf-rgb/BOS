# AI HQ — entreprise d'agents IA

Deux moteurs, strictement séparés :

1. **L'orchestrateur réel.** Gaspard, le CEO IA, reçoit tes objectifs en langage naturel. Il les décompose, délègue aux 28 spécialistes, organise réunions et consultations, vérifie les livrables et te remet un rapport. Tout passe par l'API Anthropic, avec des tâches persistées dans PostgreSQL et exécutées par des workers.
2. **Le QG vivant.** Le bureau isométrique (PixiJS) où les 29 personnages vivent leur journée : toilettes et lavage des mains, café, cantine, couloirs, discussions, repos. Il **met en scène** les vraies missions : un agent sur une tâche travaille à son bureau, les participants d'une réunion convoquée par Gaspard marchent jusqu'à la salle Atlas et s'y assoient, et les répliques IA réelles y sont jouées.

> Aucun résultat IA n'est simulé. Sans `ANTHROPIC_API_KEY` ou sans `DATABASE_URL`, l'interface affiche « Configuration requise », la création de mission est refusée et le worker ne démarre pas.

## Démarrage

```bash
npm install
cp .env.example .env.local      # renseigner DATABASE_URL et ANTHROPIC_API_KEY
npm run check:anthropic         # vérifie la clé avec un appel réel (< 0,01 $)
npm run dev                     # interface + API : http://localhost:3000
npm run worker                  # dans un 2e terminal : exécute les missions
```

Le schéma PostgreSQL (`db/schema.sql`) s'applique automatiquement au démarrage. Tu peux lancer plusieurs workers en parallèle : les tâches sont réservées avec `FOR UPDATE SKIP LOCKED` et un bail renouvelé.

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
| Budget | 3 $ maximum par mission (plafond `AIHQ_MAX_MISSION_BUDGET_USD`, même quand on relève le budget à la main) et 20 $ par jour. Vérifié **avant** chaque appel (pire cas). Un dépassement met la mission en pause sans échec ; tu peux reprendre en relevant le budget. Chaque appel est tracé dans `api_usage` (tokens, cache, recherches web, coût). |
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

## Intégrations : n8n, Slack, Gmail

Les agents n'agissent jamais directement : chaque envoi crée une demande dans l'onglet **Validations**, et rien ne part tant que tu n'as pas cliqué « Autoriser ». Les demandes mal formées (adresse invalide, JSON cassé, domaine interdit) sont renvoyées à l'agent pour correction avant de te solliciter. Chaque intégration n'apparaît que si elle est configurée, et uniquement pour les rôles autorisés.

| Intégration | Configuration | Ce que l'agent peut demander | Rôles autorisés |
|---|---|---|---|
| **Slack** | Slack → *Incoming Webhooks* → `AIHQ_SLACK_WEBHOOK_URL` | publier un message (`send_slack_message`) | direction, marketing, ventes, ops, produit |
| **n8n** | Nœud *Webhook* (POST) → `AIHQ_N8N_WEBHOOK_URL`, et vérifier l'en-tête `x-aihq-secret` = `AIHQ_N8N_SECRET` | déclencher un workflow avec des données JSON (`trigger_n8n_workflow`) : `{source, missionId, workflow, data}` | direction, tech, data, ops, ventes, marketing |
| **Gmail** | Google Cloud → API Gmail + identifiants OAuth (scope `gmail.compose`) → `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER` | préparer un e-mail (`send_email`). Crée un **brouillon** par défaut (tu l'envoies depuis Gmail) ; envoi direct seulement avec `GMAIL_MODE=send`. Domaines limitables par `GMAIL_ALLOWED_DOMAINS`. | direction, ventes, marketing, ops |

Autres : webhook générique (`AIHQ_WEBHOOK_URL`, Make ou Zapier), notification de fin de mission (`AIHQ_NOTIFY_WEBHOOK_URL`), missions récurrentes (onglet Coûts : toutes les heures, chaque jour ou chaque semaine) et API pour n8n en entrée : `POST /api/missions` avec `Authorization: Bearer AIHQ_ADMIN_TOKEN`.

## Mise en ligne

Sur un serveur (VPS) avec Docker, et un nom de domaine qui pointe vers lui :

```bash
cp .env.example .env    # DOMAIN, POSTGRES_PASSWORD, ANTHROPIC_API_KEY, AIHQ_ADMIN_PASSWORD,
                        # AIHQ_SESSION_SECRET (openssl rand -base64 48), intégrations…
docker compose up -d --build
```

La pile démarre PostgreSQL (volume persistant), l'application, le worker et Caddy, qui obtient automatiquement le certificat HTTPS Let's Encrypt pour `DOMAIN` sans mettre le flux temps réel en tampon. Pour plus de capacité : `docker compose up -d --scale worker=2`. Sauvegarde de la base : `docker compose exec db pg_dump -U aihq aihq > sauvegarde.sql`.

## Tests

```bash
npm test                         # 90 tests (les tests PostgreSQL sont ignorés sans base)
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
