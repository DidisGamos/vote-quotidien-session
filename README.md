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
constituent l'historique, visible uniquement depuis la page admin.

Design basé sur les couleurs de l'identité UNFPA (orange de marque + bleu ONU), avec
un motif de points repris du logo en arrière-plan.

## Deux pages

- **`index.html`** — page publique de vote. 4 cartes, une par volet : note de 1 à 5
  - commentaire optionnel + bouton d'envoi. Un badge « Nouveau vote » s'allume tant
    que la personne n'a pas encore voté aujourd'hui sur cet appareil. Un bouton
    Actualiser (avec pastille) permet de voir les votes des autres personnes en temps
    quasi réel.
- **`admin.html`** — page d'historique complet, **non authentifiée** et **non liée**
  depuis la page publique (accessible uniquement à qui a l'URL). Elle affiche, pour
  chaque volet, la répartition des notes jour par jour et tous les commentaires
  laissés. C'est ici qu'est centralisé tout l'historique (il n'y a plus d'onglet
  Historique sur la page publique).

  ⚠️ Gardez le lien `/admin.html` privé (ne le partagez qu'avec l'équipe
  organisatrice) : n'importe qui possédant l'URL peut consulter l'historique et les
  commentaires, puisqu'il n'y a volontairement pas de mot de passe.

## Comment ça marche

- **Un seul fichier JSON**, structuré ainsi :
  ```json
  {
    "sakafo": {
      "2026-07-01": {
        "counts": { "1": 0, "2": 2, "3": 5, "4": 10, "5": 3 },
        "comments": [{ "v": 4, "text": "Très bon accueil" }]
      }
    },
    "logistique": {
      "2026-07-01": { "counts": { "...": "..." }, "comments": [] }
    },
    "animation": { "...": "..." },
    "formateur": { "...": "..." }
  }
  ```
- Ce fichier vit côté serveur, dans **Netlify Blobs** (stockage clé/valeur natif à
  Netlify, persistant entre les déploiements). Il est lu/écrit par la fonction
  `netlify/functions/votes.js`, exposée sur `/api/votes`.
- Les deux pages front appellent cette API :
  - `GET /api/votes` → renvoie le JSON complet (agrégé, multi-utilisateurs).
  - `POST /api/votes` `{ category, value, date, comment }` → incrémente le compteur
    du jour, ajoute le commentaire s'il est non vide, et renvoie le JSON à jour.
- Le navigateur retient uniquement, **en local** (localStorage), la date du dernier
  vote effectué _sur cet appareil_ pour chaque volet — cela sert uniquement à
  activer/désactiver les boutons de vote et à afficher le badge « Nouveau vote »
  quand un nouveau jour commence. Ce n'est pas une identité, juste un verrou local
  anti-double-vote.
- Toutes les 25 secondes, l'appli récupère silencieusement les votes à jour ; si le
  total global a augmenté (d'autres personnes ont voté), un petit point orange
  s'allume sur le bouton **Actualiser**.

### Mode hors-ligne / démo locale

Si l'API `/api/votes` n'est pas disponible (par exemple si vous ouvrez
`index.html` directement dans un navigateur sans passer par Netlify), l'application
bascule automatiquement sur un stockage `localStorage` (clé `voteapp_fallback_data_v1`)
qui simule le même JSON. Cela permet de tester toute l'interface sans backend, avec
la limite que les données restent alors propres à ce navigateur.

## Déploiement sur Vercel avec Supabase

1. Créez la table Supabase avec le SQL fourni dans [supabase/schema.sql](supabase/schema.sql).
2. Ajoutez la variable d'environnement suivante dans Vercel :
   - `SUPABASE_CONNECTION_STRING` = votre chaîne de connexion Postgres
3. Déployez le projet :
   ```bash
   npm install
   npx vercel --prod
   ```
4. Une fois en ligne, testez avec plusieurs navigateurs/appareils : les votes
   s'additionnent bien dans la même base de données partagée.

### Variables d'environnement utiles
- `SUPABASE_CONNECTION_STRING`
- `DATABASE_URL` (alternative si vous préférez)

Si aucune base n'est configurée, l’API utilise un fichier de secours local pour éviter les erreurs de service.

## Structure du projet

```
vote-app/
├── index.html                 # Structure de la page (onglets Voter / Historique)
├── style.css                  # Design (palette forêt/or/corail, jauges en éventail)
├── app.js                     # Logique front (état, appels API, rendu)
├── netlify/
│   └── functions/
│       └── votes.js           # API GET/POST /api/votes (Netlify Blobs)
├── netlify.toml                # Config de build/déploiement Netlify
├── package.json                # Dépendance @netlify/blobs
└── README.md
```

## Personnalisation rapide

- **Ajouter/renommer un volet** : modifiez le tableau `CATEGORIES` en haut de
  `app.js` (id, libellé, sous-titre, icône, couleur), et la liste `CATEGORIES`
  correspondante dans `netlify/functions/votes.js` (validation côté serveur).
- **Changer les couleurs** : variables CSS en haut de `style.css` (`:root`).
- **Fréquence de rafraîchissement automatique** : constante dans `setInterval(...)`
  tout en bas de `app.js` (actuellement 25 secondes).
