# AI HQ — siège vivant

Simulateur d'entreprise : **29 agents IA autonomes** vivent leur journée dans un bureau isométrique (PixiJS). Ils travaillent, ont des besoins, font la queue au café, vont aux toilettes, discutent, déjeunent et se réunissent quand le CEO convoque.

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # 51 tests (vitest)
npm run bench -- 2     # 2 jours simulés en headless + invariants
```

Variables optionnelles :

| Variable | Effet |
|---|---|
| `DATABASE_URL` | Active PostgreSQL (schéma auto-appliqué depuis `db/schema.sql`). Sans elle, les sauvegardes restent dans le navigateur. |
| `MISSIONS_DEMO=1` | Flux de démonstration qui fait varier les statuts de missions (aucune action réelle). |
| `MISSIONS_TOKEN` | Protège `POST /api/missions` (Bearer). |

## Architecture

```
src/sim/          Moteur pur TypeScript, déterministe, sans DOM ni réseau
  engine.ts       World : pas de temps fixe (50 ms = 1 s simulée), vitesse 0/1/2/5, sauvegarde
  agent.ts        HFSM niveau 1 (off_duty → arriving → deciding ⇄ task ⇄ conversation → leaving)
                  et niveau 2 dans `task` (navigating → queueing → performing)
  utility.ts      Utility AI : courbes de réponse sur les besoins × personnalité × planning − coût d'accès
  activities.ts   Activités data-driven (étapes : ressource, animation, durée, effet, objet tenu, intimité)
  pathfinding.ts  A* 8 directions, sans coupure de coin, heuristique octile, tas binaire
  grid.ts         Murs, mobilier, obstacles dynamiques (portes de cabine)
  resources.ts    Réservation exclusive, occupation, files FIFO (partagées par cabines), expiration, annulation
  needs.ts        Énergie, fatigue, faim, soif, vessie, stress, sociabilité ; café modéré et dégressif
  social.ts       Matrice 29×29 d'affinité/familiarité, compatibilité de personnalité
  meetings.ts     Planning quotidien du CEO + réunion ad hoc si une équipe est stressée
  dialogue.ts     Répliques contextuelles par gabarits (aucun appel IA par frame)
  actionGate.ts   Barrière simulation ↔ monde réel
src/render/       PixiJS : projection iso, tri en profondeur, agents procéduraux, overlay debug
src/persistence/  SaveAdapter (mémoire, navigateur, HTTP→PostgreSQL, repli automatique)
src/server/       PostgreSQL (pg) et store temps réel des missions
app/api/          saves/[slot] · missions (POST de l'orchestrateur réel) · missions/stream (SSE) · intents
```

### Garanties

- **Collisions** : chaque agent possède sa case et réserve la suivante avant d'y entrer. En cas de blocage : attente, contournement (A* qui évite les agents immobiles), puis passage en douceur si interblocage. Jamais de téléportation, sauf la **récupération contrôlée** d'un état invalide (position dans un mur après chargement), tracée dans le journal.
- **Toilettes** : 4 cabines, une file partagée, porte qui se ferme (obstacle dynamique), agent masqué pendant l'utilisation, lavage des mains ensuite, aucune conversation aux sanitaires.
- **Séparation simulation / réel** : la simulation *lit* le statut des missions réelles (via SSE) mais ne peut que *proposer* des intentions. Le moteur ne détient aucun exécuteur : il n'est fourni qu'au clic humain « Autoriser » (avec confirmation), et l'API refuse toute requête sans `humanConfirmed`.
- **Performance** : environ 0,02 ms par pas pour 29 agents en headless. L'accélération est bornée (pas de spirale de la mort).
- **Accessibilité** : `prefers-reduced-motion` coupe le balancement, les gestes, la vapeur et les gouttes ; jauges ARIA ; raccourcis clavier (Espace, 1/2/5, D, Échap).

### Brancher l'orchestrateur réel

```bash
curl -X POST localhost:3000/api/missions -H 'content-type: application/json' \
  -d '{"agentId":"grace","status":"blocked","taskTitle":"Migration base de données"}'
```

Statuts : `idle`, `busy`, `blocked`, `awaiting_approval`, `offline`. Une intention autorisée arrive sur `POST /api/intents` : c'est là qu'il faut brancher l'exécution réelle (aujourd'hui, elle est seulement tracée dans `authorized_intents`).

## Limites connues

- Un chargement repart de l'état « réfléchit » à la position sauvegardée : les tâches en cours ne sont pas sérialisées.
- Les répliques viennent de gabarits. Un fournisseur IA peut implémenter `DialogueProvider`, à réserver aux interactions utiles.
