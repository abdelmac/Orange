# Déploiement de production sur Render

Le dépôt contient un Blueprint [render.yaml](render.yaml) pour déployer Orando à Francfort avec PostgreSQL 17 et un disque privé pour les justificatifs. Le déploiement local Docker reste disponible.

## Renommage Orando — 11 octobre 2026

Le nom affiché devient **Orando Finance**, avec **Orando** comme nom court. Les écrans web, métadonnées, manifeste PWA, page hors connexion, nouveaux documents générés, noms de téléchargements, libellés iOS/Android et visuels des boutiques sont adaptés. Le cache hors connexion est renouvelé avec suppression de ses versions précédentes.

Le produit et le portail Stripe réels ont été renommés **Orando Finance PRO** à 17:20 UTC. Le tarif, les identifiants, les abonnements et les réglages du portail sont conservés. Le nom public du compte Stripe contient encore l’ancienne marque : sa modification utilise le [Dashboard Stripe](https://dashboard.stripe.com/settings/account), selon [la documentation de l’API](https://docs.stripe.com/api/accounts/update). Aucun achat ou débit n’a été créé pendant le renommage.

Validation locale : TypeScript, lint, 49 tests unitaires, build de production, sept contrôles PostgreSQL de factures dans un schéma isolé et contrôles Chrome des cinq pages publiques, du manifeste et de la page hors connexion réussis. Les identifiants de connexion, clés d’idempotence Stripe, schémas d’export, identifiants des applications, nom de base et URLs existantes restent stables ; aucune migration n’est nécessaire. Le renommage du code ne modifie pas l’identité juridique des entreprises ni les pièces déjà remises. La publication de cette révision doit être confirmée ci-dessous après déploiement.

## Stripe en production — 11 octobre 2026

La configuration Stripe réelle est déployée sur **https://orange-finance.onrender.com**, page **[/abonnement](https://orange-finance.onrender.com/abonnement)**. Le déploiement Render `dep-db5ebrtckfvc739tpeeg` est `live` depuis **01:30:10 UTC (03:30:10 à Paris)**, sur la révision existante `d1d0e891fc1116d25935d921c570e83d9381d8dc`. La compilation, la phase préalable au déploiement et le redémarrage ont réussi. Aucun changement de code applicatif ou de schéma n’a été ajouté pour cette activation.

- Tarif réel actif : `price_1UPAxYIzz0i5GW38YVHlLMb1`, **4,00 EUR par mois**, quantité 1. Le compte Stripe accepte les paiements et les versements.
- Webhook réel `we_1UPBWyIzz0i5GW38pANvOpWf`, activé vers `https://orange-finance.onrender.com/api/billing/webhook`, événements snapshot en version `2026-08-26.dahlia` : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
- Portail client réel par défaut `bpc_1UPBWzIzz0i5GW387CVkhh9V` : historique des factures, modification du moyen de paiement et résiliation en fin de période sans prorata. Les changements de tarif et de quantité sont désactivés.
- Variables privées mises à jour sur le service Render : `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`. Les autres variables sont conservées. Cette mise à jour a déclenché le déploiement ci-dessus ; le déploiement automatique depuis Git reste désactivé.

**Vérifications réussies à 01:30:40 UTC :** santé PostgreSQL, `/login`, connexion administrateur avec cookie Secure/HttpOnly, accès authentifié à `/api/me`, `/api/dashboard`, `/api/billing` et `/abonnement`, configuration de facturation reconnue et refus des accès anonymes. Une sonde synthétique d’un type d’événement ignoré par le métier est acceptée avec la bonne signature, et refusée sans signature ou avec un corps modifié. Le tarif, le webhook et le portail par défaut ont aussi été relus via l’API Stripe réelle.

Ces contrôles ne constituent **ni un achat réel, ni une livraison d’événement depuis Stripe**. Aucune session Checkout, aucun abonnement et aucun paiement réels n’ont été créés pour ces vérifications. L’activation PRO consécutive à un premier achat réel reste à confirmer. La connexion de contrôle crée puis ferme sa session ; la lecture de facturation peut initialiser les métadonnées locales de plan, sans écriture financière.

La préparation privée est conservée dans `.local/stripe-production.env`, ignoré par Git et non chargé par le serveur local. La clé réelle accidentellement placée dans `.env` a été déplacée vers ce fichier ; `STRIPE_SECRET_KEY` local est désormais vide. **Restaurer une clé de test `sk_test_…` dans `.env` avant les prochains essais locaux**, en conservant le tarif de test et le secret du listener local. Aucun secret ne figure dans ce document. Le rapport de contrôle sans secrets se trouve dans `.local/stripe-live-verification.json`, également ignoré par Git.

## Incident résolu — 11 octobre 2026

**Le site public est de nouveau disponible : https://orange-finance.onrender.com.** La reprise de la base existante depuis le Dashboard Render a rétabli l’accès. Avant cette reprise, `/login` et `/api/health` retournaient HTTP 502 et les journaux indiquaient que l’application ne pouvait pas joindre PostgreSQL.

Constats du diagnostic auprès de Render :

- La base `dpg-dai023ijnfac73acjtpg-a` était `suspended`, avec `suspenders: ["user"]`. Sa métadonnée `updatedAt` valait `2026-10-06T12:12:53Z` ; elle ne prouve pas l’heure exacte de début de suspension.
- Au moment du rétablissement, la révision marquée `live` était `d1d0e891fc1116d25935d921c570e83d9381d8dc`, déploiement `dep-dask5vnpn0mc738pa1bg` terminé le 27 septembre 2026 à 16:26:47 UTC. Aucun nouveau déploiement n’a été nécessaire pour ce rétablissement. Le redéploiement Stripe décrit ci-dessus a eu lieu ensuite.
- La tentative manuelle du 10 octobre 2026 à 23:46 UTC, `dep-db5csprrjlhs73d7p8rg`, a échoué en `pre_deploy_failed` parce que la base était inaccessible.

**Rétablissement confirmé à 00:24 UTC (02:24 à Paris) :** l’utilisateur a lancé **Resume Database** dans la [base Render existante](https://dashboard.render.com/d/dpg-dai023ijnfac73acjtpg-a). PostgreSQL est désormais `available`, `not_suspended`, sans suspendeur. Le plan et le stockage sont inchangés. Aucun remplacement de base ni aucune migration n’ont été effectués pour cette réparation. Le connecteur MCP disponible ne propose pas l’action de reprise et le jeton CLI local reste expiré ; une future reprise manuelle utilise **Info → Resume Database**. Voir la [procédure Render](https://render.com/docs/postgresql-creating-connecting#running-out-of-storage).

Vérifications après reprise réussies : HTTP 200 et `status: ok` sur `/api/health`, HTTP 200 sur `/login`, connexion administrateur avec cookie Secure/HttpOnly, lecture authentifiée de `/api/me`, `/api/dashboard` et `/api/daybook`, refus HTTP 401 de `/api/me` sans session, puis déconnexion de la session de contrôle. Aucune opération financière de test n’a été créée. Le rapport sans identifiants est conservé dans `.local/production-recovery-verification.json`, exclu de Git. Aucun nouveau message d’erreur applicatif ni PostgreSQL `ERROR/FATAL/PANIC` n’a été observé entre 00:13 et 00:23:51 UTC.

Les sections datées ci-dessous conservent l’historique des vérifications de l’époque. Leurs affirmations sur les versions encore non publiées et le « dernier déploiement confirmé » ne décrivent plus l’état actuel ; seules les constatations ci-dessus ont été revérifiées le 11 octobre.

## État du déploiement — 25 septembre 2026

Les thèmes clair/sombre/système, le bouton **Thème** visible, le choix **Menu → Apparence** sur téléphone, la recherche avec une seule loupe et l’accès permanent **Saisir** sont présents dans le dépôt. **Cette mise à jour n’est pas encore publiée sur Render.** La page `/login` en ligne répond HTTP 200 mais ne contient pas le nouveau sélecteur de thème. L’API Render retourne toujours 401 avec l’authentification locale disponible ; l’identifiant exact du déploiement courant ne peut donc pas être confirmé par cette API.

Reconnecter Render pour publier le commit validé, ou lancer un déploiement manuel depuis le [service existant](https://dashboard.render.com/web/srv-dai090bm8hqs73dkpgk0). Le déploiement automatique reste désactivé. Aucune migration n’est ajoutée par ces corrections d’interface.

Validation locale de cette mise à jour : TypeScript, lint, formatage des fichiers d’interface modifiés, 29 tests unitaires et build réussis. Sur le build de production, 73 contrôles de recherche/navigation/saisie mobile et 184 contrôles de thème passent, notamment la persistance, les permissions de navigation, l’impression et le repli PWA hors connexion. Les contrôles visuels utilisent des réponses API simulées et ne créent aucune opération financière.

## Dernier déploiement confirmé — 12 septembre 2026

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
- Entreprise initialisée : **Orange** (nom historique enregistré le 11 septembre 2026), une caisse vide et un administrateur utilisant l’adresse du compte Render authentifié. Les données locales de démonstration et de test n’ont pas été importées.

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
