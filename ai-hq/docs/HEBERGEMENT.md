# Mettre AI HQ en ligne — sans serveur ni domaine

Ce guide ne suppose **ni serveur, ni nom de domaine, ni achat**. Aucune étape ne déploie quoi que ce soit publiquement à ta place.

## Ce qui existe déjà dans le dépôt

| Fichier | Rôle |
|---|---|
| `Dockerfile` | Une seule image pour l'application web et le worker. |
| `docker-compose.yml` | PostgreSQL (données persistantes), application, worker (relance automatique), et Caddy en option (`--profile public`). |
| `deploy/Caddyfile` | HTTPS automatique Let's Encrypt, seulement si tu as un jour un serveur et un domaine. |
| `.env.example` | Toutes les variables à remplir. |

Aucune configuration propre à un hébergeur (Vercel, Render…) : AI HQ a besoin d'un worker permanent et de PostgreSQL, ce que ces offres gratuites ne fournissent pas simplement.

## Option recommandée (0 €) : ton ordinateur + Tailscale

- **Pourquoi ?** C'est gratuit, sans domaine, avec HTTPS. AI HQ reste **privé** : seuls tes appareils connectés à ton compte Tailscale y accèdent (ordinateur, téléphone).
- **Limite :** AI HQ tourne tant que l'ordinateur est allumé. Le QG et les missions reprennent exactement où ils en étaient au redémarrage (état sauvegardé dans PostgreSQL).

### Étape 1 — Installer Docker Desktop
1. Télécharge Docker Desktop : https://www.docker.com/products/docker-desktop/ (gratuit pour un usage personnel).
2. Lance-le, puis attends l'indication « Engine running ».

### Étape 2 — Préparer la configuration
Dans un terminal, dans le dossier `ai-hq` :

```bash
cp .env.example .env
openssl rand -base64 48   # → copie le résultat dans AIHQ_SESSION_SECRET
openssl rand -base64 32   # → copie le résultat dans AIHQ_ENCRYPTION_KEY
```

Puis complète `.env` :
- `POSTGRES_PASSWORD` : un mot de passe que tu inventes ;
- `AIHQ_ADMIN_PASSWORD` : ton mot de passe de connexion à AI HQ (12 caractères minimum) ;
- `ANTHROPIC_API_KEY` : ta clé, créée sur https://console.anthropic.com/settings/keys. Tu peux aussi la laisser vide pour l'instant : le QG fonctionne, et les missions affichent « Configuration requise ».

> Windows sans `openssl` : génère ces deux valeurs dans PowerShell avec `[Convert]::ToBase64String((1..48 | % {Get-Random -Max 256}))` (48 pour la session, 32 pour la clé).

### Étape 3 — Démarrer

```bash
docker compose up -d --build
```

La première construction prend quelques minutes. Ouvre ensuite **http://localhost:3000** et connecte-toi avec `AIHQ_ADMIN_PASSWORD`.

> Si la connexion boucle sur la page de login avec Safari en `http://localhost`, ajoute `AIHQ_INSECURE_COOKIE=1` dans `.env`, puis `docker compose up -d`. Réserve cette option à l'accès local : ne l'utilise pas avec l'accès téléphone.

### Étape 4 — Accès depuis ton téléphone, en HTTPS et en privé
1. Crée un compte gratuit et installe Tailscale sur l'ordinateur ET sur le téléphone : https://tailscale.com/download
2. Dans la console Tailscale, active **MagicDNS** et **HTTPS Certificates** (page DNS) : https://login.tailscale.com/admin/dns
3. Sur l'ordinateur :
   ```bash
   tailscale serve --bg 3000
   ```
   La commande affiche l'adresse, du type `https://mon-pc.mon-reseau.ts.net`. Documentation : https://tailscale.com/kb/1312/serve
4. Ajoute cette adresse dans `.env` (`AIHQ_PUBLIC_URL=https://mon-pc.mon-reseau.ts.net`), puis relance avec `docker compose up -d`.
5. Sur le téléphone, Tailscale activé, ouvre cette adresse : tu arrives sur la page de connexion d'AI HQ.

`tailscale serve` ne publie rien sur Internet : seuls tes appareils y ont accès. N'utilise **pas** `tailscale funnel`, qui rendrait AI HQ public.

### Gestion courante

| Action | Commande |
|---|---|
| État des services | `docker compose ps` |
| Journaux du worker | `docker compose logs -f worker` |
| Mise à jour du code | `git pull && docker compose up -d --build` |
| Sauvegarde de la base | `docker compose exec db pg_dump -U aihq aihq > sauvegarde.sql` |
| Arrêt (données conservées) | `docker compose down` |

## Plus tard : serveur 24 h/24 (payant, à ta décision)

Quand tu voudras que les missions tournent ordinateur éteint :
1. Un petit serveur Linux (VPS, environ 4 à 6 €/mois, 2 Go de RAM suffisent), avec Docker installé.
2. Un nom de domaine, ou un sous-domaine gratuit (par exemple https://www.duckdns.org/), qui pointe vers l'IP du serveur.
3. Dans `.env` : `DOMAIN=hq.mondomaine.fr` et `AIHQ_PUBLIC_URL=https://hq.mondomaine.fr`.
4. `docker compose --profile public up -d --build` : Caddy obtient le certificat HTTPS automatiquement.

Ne fais cette étape que lorsque tu l'auras décidée : rien dans AI HQ ne l'enclenche à ta place.

## Sécurité en place quel que soit l'hébergement
- Mot de passe obligatoire en production. Sans lui, l'application refuse tout accès.
- Session signée en cookie `httpOnly` (`Secure` en HTTPS), 5 essais par 15 minutes, protection CSRF, en-têtes de sécurité (CSP stricte, anti-iframe, HSTS).
- Secrets des connecteurs (jetons Google, secret n8n, webhook Slack) chiffrés en AES-256-GCM dans PostgreSQL. Ils ne sont jamais renvoyés au navigateur.
- Application exposée seulement sur `127.0.0.1:3000` : l'accès distant passe obligatoirement par Tailscale ou Caddy (HTTPS).
- Budgets : 3 $ par mission, 20 $ par jour, avertissement à 80 %, blocage des appels au plafond.
