# Déploiement de production sur Render

Le dépôt contient un Blueprint [render.yaml](render.yaml) pour déployer Orange à Francfort avec PostgreSQL 17 et un disque privé pour les justificatifs. Le déploiement local Docker reste disponible.

## Mise à jour active — 12 septembre 2026

### Préparation des boutiques — 16 septembre 2026

Les projets Android/iOS, leurs builds et les pages publiques `/assistance` et `/confidentialite` sont ajoutés au dépôt. **Ces deux nouvelles pages ne sont pas encore déployées sur Render.** L’accès CLI utilisé précédemment a expiré le 14 septembre 2026 à 21:14 UTC ; la vérification de l’API retourne 401. Reconnecter Render, puis déployer le commit validé sur le service existant. Le travail mobile n’a modifié ni la base ni les données de production. Les applications utilisent les API déjà en ligne.

Voir [la validation mobile](docs/mobile/VALIDATION.md) et [les étapes de publication](docs/mobile/STORES.md). Aucune fiche App Store ou Google Play n’est publiée : les comptes développeur, l’identité de l’éditeur, la signature et les validations de boutique restent nécessaires.

### Version applicative en ligne

Version applicative `4eb7a0e0210642d314223aa711032a7e8b46724a`, publiée sur le service existant à 16:42 UTC (18:42 à Paris). Déploiement Render `dep-daio0m0jo6nc73fmf9pg`, état `live`. La migration additive `20260912120000_quick_entries_receipts` a été appliquée avec succès ; l’entreprise existante et son registre sont conservés.

Nouveautés : `/saisie` pour les encaissements sans facture et les demandes de dépenses par bénéficiaire ; `/journal` pour le suivi quotidien ; reçus PDF privés numérotés et imprimables ; export JSON versionné pour une future connexion ERP. Le téléphone est facultatif. Les sorties restent soumises à validation et paiement. Voir [le fonctionnement quotidien](README.md#encaisser-et-travailler-au-quotidien) et [le contrat ERP](docs/ACCOUNTING_INTEGRATION.md).

Validation locale : 29 tests unitaires, 59 contrôles PostgreSQL (26 initiaux, 18 saisie/journal/export, 15 reçus), 25 contrôles HTTP et neuf contrôles navigateur, avec nouveau passage de ces neuf contrôles sur le serveur standalone de production. Lint, formatage, TypeScript et build réussis. Les tests financiers ont utilisé exclusivement des entreprises de vérification locales.

Vérifications après publication réussies : connexion administrateur, PostgreSQL, nouveaux endpoints privés sans session, saisie rapide avec téléphone facultatif, journal connecté au schéma migré, vues mobile/PC sans erreur JavaScript. Aucune opération financière de test n’a été créée en production. Rapport local exclu de Git : `.local/production-quick-verification.json` ; captures `.local/production-quick-mobile.png` et `.local/production-journal-*.png`.

## Installation initiale — 11 septembre 2026

- Application : **https://orange-finance.onrender.com**.
- [Service Render existant](https://dashboard.render.com/web/srv-dai090bm8hqs73dkpgk0).
- [Base PostgreSQL existante](https://dashboard.render.com/d/dpg-dai023ijnfac73acjtpg-a), accès réseau privé uniquement.
- Région : Francfort ; disque privé monté sur `/var/data`, capacité 1 Go.
- Version initiale : `f38f8b1777493bb348a2154e60a7fc5ef1a8da06` ; remplacée par la mise à jour décrite ci-dessus.
- Entreprise initialisée : **Orange**, une caisse vide et un administrateur utilisant l’adresse du compte Render authentifié. Les données locales de démonstration et de test n’ont pas été importées.

Les ressources ont été créées via l’API Render avec la configuration de `render.yaml`. Pour mettre cette installation à jour, redéployer le service existant ; ne pas recréer la base ni relancer l’initialisation de l’entreprise.

Les identifiants de connexion sont conservés sur la machine de déploiement dans `.local/production-access.json`, fichier exclu de Git et protégé par les permissions Windows. Aucun mot de passe n’est publié dans le dépôt. Les quatre variables temporaires de création de l’administrateur ont été retirées du service après la réussite de l’initialisation.

Contrôles réalisés sur l’URL de production : connexion PostgreSQL, login administrateur, cookie Secure/HttpOnly/SameSite, refus des accès financiers anonymes, protection contre les mutations depuis une origine étrangère, tableau de bord à zéro, interface Chrome ordinateur et mobile sans erreur JavaScript, manifeste PWA et absence de données privées dans son cache. Aucune opération financière de test n’a été ajoutée à la base de production. Les résultats et captures sont conservés localement sous `.local/`.

SMTP reste à configurer pour les emails de récupération de mot de passe. Le premier justificatif réel devra aussi faire l’objet du contrôle de persistance après redémarrage décrit ci-dessous.

## Ressources et coût

| Ressource            | Configuration                                                      | Coût mensuel indicatif |
| -------------------- | ------------------------------------------------------------------ | ---------------------- |
| Application          | Node.js 24.14.1, 512 Mo, `0.5c-512mb`                              | 7 USD                  |
| PostgreSQL           | Version 17, 256 Mo, `0.1c-256mb`                                   | 6 USD                  |
| Stockage PostgreSQL  | 1 Go                                                               | 0,30 USD               |
| Justificatifs privés | Disque persistant de 1 Go                                          | 0,25 USD               |
| Total supplémentaire | Hors taxes, dépassements et éventuel forfait de workspace existant | **13,55 USD**          |

Tarifs vérifiés le 10 septembre 2026 : [tarifs Render](https://render.com/pricing), [stockage et facturation](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses). Aucun changement automatique de taille ni déploiement à chaque commit n’est configuré. Un disque persistant nécessite une instance payante ; les redéploiements de cette instance peuvent interrompre brièvement l’application.

## Créer les ressources pour une nouvelle installation

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

Les versions mobiles Android/iOS sont préparées dans [mobile](mobile/README.md). Leur compilation est indépendante du déploiement Render : les applications utilisent les API HTTPS existantes. Voir le [dossier App Store / Google Play](docs/mobile/STORES.md) pour les inscriptions, signatures, essais et soumissions. Un APK d’essai, un AAB non signé ou une application de simulateur ne signifie pas que l’application est publiée.

Les migrations s’exécutent avant chaque déploiement avec `npm run db:migrate`. Le déploiement automatique est désactivé : déclencher un déploiement manuel après validation d’un commit. En cas d’échec d’une migration, corriger sa cause avant de redéployer ; ne pas remplacer les migrations par `prisma db push`.

Configurer les variables `SMTP_*` du README pour activer les emails de récupération de compte. Configurer les sauvegardes et vérifier une restauration de PostgreSQL avec celle des justificatifs. Surveiller l’occupation des deux volumes et la mémoire avant d’augmenter les ressources.

La PWA peut être installée depuis l’URL HTTPS, y compris sur Android et iPhone. Elle nécessite une connexion pour lire ou enregistrer les données financières.

Références : [Blueprints](https://render.com/docs/blueprint-spec), [disques persistants](https://render.com/docs/disks), [PostgreSQL](https://render.com/docs/postgresql-creating-connecting), [versions Node](https://render.com/docs/node-version).
