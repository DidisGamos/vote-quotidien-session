# Sondaha isan'andro — Vote quotidien (UNFPA)

Application de vote/notation quotidienne pour une session, répartie en 4 volets :

- **Sakafo** (restauration)
- **Environnement & logistique**
- **Animation**
- **Formateur**

Chaque personne note chaque volet de **1 à 5** et peut laisser un **commentaire
libre**, une fois par jour et par volet. Aucune identité n'est enregistrée : seules
des statistiques agrégées et les commentaires (anonymes) sont conservés, **par jour
et par volet**. Les données des jours précédents ne sont jamais supprimées : elles
constituent l'historique, visible uniquement depuis la page admin — désormais
**protégée par mot de passe**.

Design basé sur les couleurs de l'identité UNFPA (orange de marque + bleu ONU), avec
un motif de points repris du logo en arrière-plan.

## Trois pages

- **`index.html`** — page publique de vote. 4 cartes, une par volet : note de 1 à 5
  + commentaire optionnel + bouton d'envoi. Un badge « Nouveau vote » s'allume tant
  que la personne n'a pas encore voté aujourd'hui sur cet appareil. Un bouton
  Actualiser (avec pastille) permet de voir les votes des autres personnes en temps
  quasi réel. **Ne reçoit et n'affiche que les données du jour courant** : l'historique
  complet n'est jamais exposé publiquement.
- **`admin.html`** — tableau de bord **protégé par mot de passe** (voir
  [Authentification admin](#authentification-admin)), avec deux onglets bien
  séparés :
  - **Aujourd'hui** : instantané du jour en cours uniquement (se vide tout seul à
    minuit, sans action manuelle).
  - **Historique** : uniquement les jours *précédents* (jamais le jour courant), avec
    sélecteur de volet et de date, et tendance sur les jours passés.
- **`login.html`** — page de connexion admin (mot de passe uniquement, pas de
  compte individuel).

## Authentification admin

- Un **seul mot de passe partagé** (variable d'environnement `ADMIN_PASSWORD`),
  pas de compte individuel — le site public reste totalement anonyme, seule
  l'équipe organisatrice a besoin de se connecter.
- `POST /api/admin/login` vérifie le mot de passe et pose un cookie de session
  `HttpOnly` signé (HMAC-SHA256, 12h de validité, sans état côté serveur).
- `GET /admin` redirige automatiquement vers `/admin/login` si la session est
  absente ou expirée.
- `GET/DELETE /api/admin/data` (lecture de l'historique complet / réinitialisation)
  exigent la même session valide, sinon renvoient `401`.
- `POST /api/admin/logout` efface le cookie.

⚠️ Définissez `ADMIN_PASSWORD` dans les variables d'environnement Vercel avant
de déployer, sinon la connexion admin renverra une erreur explicite.

## Comment ça marche

- **Un seul jeu de données**, structuré ainsi :
  ```json
  {
    "sakafo": {
      "2026-07-01": {
        "counts": { "1": 0, "2": 2, "3": 5, "4": 10, "5": 3 },
        "comments": [{ "v": 4, "text": "Très bon accueil" }]
      }
    },
    "logistique": { "2026-07-01": { "counts": { "...": "..." }, "comments": [] } },
    "animation": { "...": "..." },
    "formateur": { "...": "..." }
  }
  ```
- Stocké dans **Supabase** (Postgres), via `lib/store.js`. Repli automatique sur un
  fichier local (`/tmp`) si aucune base n'est configurée, pratique pour tester en
  local sans backend.
- Deux niveaux d'accès à l'API :
  - `GET/POST /api/votes` — **public**. `GET` ne renvoie que **le jour courant**
    (jamais l'historique). `POST` enregistre un vote.
  - `GET/DELETE /api/admin/data` — **protégé**. `GET` renvoie l'historique complet ;
    `DELETE` réinitialise tout.
- Le navigateur retient uniquement, **en local** (localStorage), la date du dernier
  vote effectué _sur cet appareil_ pour chaque volet — cela sert uniquement à
  activer/désactiver les boutons de vote et à afficher le badge « Nouveau vote »
  quand un nouveau jour commence. Ce n'est pas une identité, juste un verrou local
  anti-double-vote.
- Toutes les 25 secondes, l'appli récupère silencieusement les votes du jour ; si
  le total a augmenté (d'autres personnes ont voté), un petit point orange
  s'allume sur le bouton **Actualiser**.

### Mode hors-ligne / démo locale

Si l'API `/api/votes` n'est pas disponible (par exemple si vous ouvrez
`index.html` directement dans un navigateur sans passer par Vercel), l'application
bascule automatiquement sur un stockage `localStorage` qui simule le même format.
Cela permet de tester toute l'interface sans backend.

## Déploiement sur Vercel avec Supabase

1. Créez la table Supabase avec le SQL fourni dans [supabase/schema.sql](supabase/schema.sql).
2. Copiez `.env.example` en `.env` (local) ou renseignez les mêmes variables dans
   Vercel :
   - `SUPABASE_CONNECTION_STRING` (ou `DATABASE_URL`) — connexion Postgres.
   - `ADMIN_PASSWORD` — mot de passe de l'espace admin.
3. Déployez le projet :
   ```bash
   npm install
   npx vercel --prod
   ```
4. Une fois en ligne, testez avec plusieurs navigateurs/appareils : les votes
   s'additionnent bien dans la même base de données partagée, et `/admin` demande
   bien le mot de passe.

## Structure du projet

```
vote-app/
├── index.html                 # Page publique de vote
├── login.html                 # Page de connexion admin
├── admin.html                 # Tableau de bord admin (protégé)
├── app.js / login.js / admin.js
├── style.css
├── lib/
│   ├── store.js                # Accès aux données (Supabase + repli fichier)
│   └── auth.js                 # Mot de passe admin + session par cookie signé
├── api/
│   ├── index.js, style.js, app.js       # Servent les fichiers statiques
│   ├── admin-page.js                     # Sert admin.html (protégé)
│   ├── admin-script.js                   # Sert admin.js
│   ├── login-page.js, login-script.js    # Servent login.html / login.js
│   ├── votes.js                          # API publique (jour courant)
│   └── admin/
│       ├── data.js                       # Historique complet (protégé)
│       ├── login.js                      # Connexion (pose le cookie)
│       └── logout.js                     # Déconnexion
├── supabase/schema.sql
├── vercel.json
├── package.json
├── .env.example
└── README.md
```

## Personnalisation rapide

- **Ajouter/renommer un volet** : modifiez le tableau `CATEGORIES` dans `app.js`
  (id, libellé, sous-titre, icône, couleur), dans `admin.js`, et la liste
  `CATEGORIES` dans `lib/store.js` (validation côté serveur).
- **Changer les couleurs** : variables CSS en haut de `style.css` (`:root`).
- **Durée de la session admin** : constante `SESSION_DURATION_SECONDS` dans
  `lib/auth.js` (12h par défaut).
- **Fréquence de rafraîchissement automatique** : constante dans `setInterval(...)`
  tout en bas de `app.js` (actuellement 25 secondes).
