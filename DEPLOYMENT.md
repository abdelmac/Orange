# Déploiement de production sur Render

Le dépôt contient un Blueprint [render.yaml](render.yaml) pour déployer Orange à Francfort avec PostgreSQL 17 et un disque privé pour les justificatifs. Le déploiement local Docker reste disponible.

## Ressources et coût

| Ressource            | Configuration                                                      | Coût mensuel indicatif |
| -------------------- | ------------------------------------------------------------------ | ---------------------- |
| Application          | Node.js 24.14.1, 512 Mo, `0.5c-512mb`                              | 7 USD                  |
| PostgreSQL           | Version 17, 256 Mo, `0.1c-256mb`                                   | 6 USD                  |
| Stockage PostgreSQL  | 1 Go                                                               | 0,30 USD               |
| Justificatifs privés | Disque persistant de 1 Go                                          | 0,25 USD               |
| Total supplémentaire | Hors taxes, dépassements et éventuel forfait de workspace existant | **13,55 USD**          |

Tarifs vérifiés le 10 septembre 2026 : [tarifs Render](https://render.com/pricing), [stockage et facturation](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses). Aucun changement automatique de taille ni déploiement à chaque commit n’est configuré. Un disque persistant nécessite une instance payante ; les redéploiements de cette instance peuvent interrompre brièvement l’application.

## Créer les ressources

1. Activer la facturation du workspace Render et approuver le budget.
2. Ouvrir [la création du Blueprint](https://dashboard.render.com/blueprint/new?repo=https%3A%2F%2Fgithub.com%2Fabdelmac%2FOrange) et sélectionner le workspace souhaité.
3. Vérifier les deux ressources, les plans, la région et les tailles de disque avant validation.
4. Attendre le build, les migrations et le contrôle `/api/health`.

Le Blueprint utilise le runtime Node natif de Render. Cela conserve les outils Prisma nécessaires aux migrations et à l’initialisation. La compilation produit le même serveur Next.js standalone que le déploiement Docker.

Le démarrage déduit `APP_URL` de `RENDER_EXTERNAL_URL`, l’adresse HTTPS attribuée par Render. Pour un domaine personnalisé, ajouter ce domaine dans Render puis définir explicitement `APP_URL` avec son origine exacte, par exemple `https://gestion.entreprise.fr`. Aucun chemin, paramètre ni identifiant n’est accepté dans cette URL.

`DATABASE_URL` provient de la connexion interne de la base Render. La base refuse les connexions publiques (`ipAllowList: []`). `UPLOAD_DIR=/var/data/uploads` se trouve sur le disque persistant ; le serveur vérifie au démarrage qu’il peut y écrire. Les fichiers restent servis par les routes privées avec authentification.

## Premier administrateur

La base de production démarre vide. Le seed et son mot de passe de démonstration ne sont pas déployés comme comptes utilisateurs.

Dans les variables privées du service Render, fournir temporairement :

```text
COMPANY_NAME=<nom de votre entreprise>
ADMIN_NAME=<nom de l’administrateur>
ADMIN_EMAIL=<adresse email de connexion>
ADMIN_PASSWORD=<mot de passe unique généré, 12 à 128 caractères>
```

Depuis le Shell Render du service, exécuter :

```sh
npm run company:create
```

Le script crée l’entreprise, les six rôles, les permissions, l’administrateur, les catégories et une caisse principale à zéro. Il refuse de modifier un compte qui existe déjà. Retirer `ADMIN_PASSWORD` des variables Render après l’initialisation et conserver le mot de passe dans un gestionnaire de mots de passe. Les autres collaborateurs se créent depuis l’interface.

## Vérifications après déploiement

- `/api/health` retourne HTTP 200 avec `status: ok`.
- `/login`, les icônes et le manifeste PWA répondent en HTTPS.
- `/api/me` et les documents privés refusent un accès sans session.
- L’administrateur peut se connecter ; le cookie de session porte `Secure` et `HttpOnly`.
- Le tableau de bord affiche les soldes réellement calculés ; une entreprise neuve commence à zéro.
- Lors de la première opération réelle, joindre un justificatif et vérifier son téléchargement privé après un redémarrage du service.

Les suites complètes `test:http`, `test:browser` et `test:integration` créent des opérations de test immuables. Les exécuter dans une base de développement ou de staging, pas dans la base métier de production.

## Exploitation

Les migrations s’exécutent avant chaque déploiement avec `npm run db:migrate`. Le déploiement automatique est désactivé : déclencher un déploiement manuel après validation d’un commit. En cas d’échec d’une migration, corriger sa cause avant de redéployer ; ne pas remplacer les migrations par `prisma db push`.

Configurer les variables `SMTP_*` du README pour activer les emails de récupération de compte. Configurer les sauvegardes et vérifier une restauration de PostgreSQL avec celle des justificatifs. Surveiller l’occupation des deux volumes et la mémoire avant d’augmenter les ressources.

La PWA peut être installée depuis l’URL HTTPS, y compris sur Android et iPhone. Elle nécessite une connexion pour lire ou enregistrer les données financières.

Références : [Blueprints](https://render.com/docs/blueprint-spec), [disques persistants](https://render.com/docs/disks), [PostgreSQL](https://render.com/docs/postgresql-creating-connecting), [versions Node](https://render.com/docs/node-version).
