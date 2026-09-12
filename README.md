# Orange — gestion financière et commerciale

Application française de gestion des ventes, factures, encaissements, caisses et dépenses d’une petite entreprise. Les formulaires enregistrent réellement leurs données dans PostgreSQL. Les permissions sont vérifiées sur le serveur et chaque opération est rattachée à une entreprise.

**Application en ligne : [orange-finance.onrender.com](https://orange-finance.onrender.com).** Déployée sur Render à Francfort avec PostgreSQL et stockage privé persistant. Voir [le suivi du déploiement](DEPLOYMENT.md).

## Encaisser et travailler au quotidien

Depuis le tableau de bord, **Encaisser** ouvre une saisie courte : montant, nom de la personne, catégorie (client, chauffeur, commercial, employé, fournisseur ou autre), motif et caisse. Les espèces sont proposées par défaut. Le téléphone, la référence et la date se trouvent dans les détails facultatifs. Un commercial encaisse dans son portefeuille personnel et remet ensuite les fonds à la caisse. Le formulaire accepte les virgules françaises, évite les doublons lors d’une nouvelle tentative et propose immédiatement le reçu et une nouvelle saisie.

**Régler une facture** conserve le parcours de paiement partiel/complet existant. Un encaissement sans facture augmente la trésorerie et les encaissements, mais ne solde aucune facture et ne crée pas de vente. Pour corriger un mouvement, utiliser son annulation dans Transactions.

**Demander une dépense** permet la même saisie rapide pour un bénéficiaire. La demande attend sa validation puis son paiement dans Dépenses ; elle ne débite pas immédiatement la caisse. Le reçu n’est disponible qu’après paiement. Les caissiers retrouvent les dépenses validées à payer dans ce module.

**Journal quotidien** regroupe les mouvements du jour avec recherche par personne, téléphone, motif, numéro, référence ou montant. Les journées correspondent au fuseau de l’appareil ; les totaux couvrent tous les résultats filtrés, même sur plusieurs pages. Les transferts internes n’augmentent pas le net de l’entreprise. Les commerciaux et caissiers voient les mouvements et totaux de leurs portefeuilles ou caisses autorisés.

Les reçus PDF privés sont téléchargeables et imprimables depuis le succès d’un encaissement, le journal et les fiches transaction/paiement/dépense payée. Le numéro et les informations sont figés lors de la première émission, distincte de la date du mouvement. Toute annulation ultérieure est signalée lors d’un nouveau téléchargement. Un PDF déjà remis ne peut pas être rappelé : transmettre l’avis d’annulation et vérifier l’état actuel dans Orange. Ce reçu d’enregistrement ne remplace ni une facture ni une signature du bénéficiaire. Aucun numéro de téléphone, compte du bénéficiaire ou envoi SMS n’est obligatoire.

Utilisation sur téléphone, tablette et PC, avec une connexion Internet pour enregistrer les opérations. Les liens de justificatifs ouvrent la fiche privée pour prendre une photo ou joindre un fichier. La préparation d’une future connexion ERP est décrite dans [le contrat d’export comptable](docs/ACCOUNTING_INTEGRATION.md).

## Démarrage rapide avec Docker

Prérequis : Docker Desktop démarré (ou Docker Engine + Compose), Node.js 24 pour générer le fichier d’environnement. Les ports 3000 et 5434 doivent être libres.

```sh
node scripts/setup-env.mjs
docker compose up --build -d
docker compose --profile tools run --rm seed
```

Ouvrir **http://localhost:3000**. Le script `setup-env` crée `.env` avec des secrets aléatoires sans écraser un fichier existant. Le seed est facultatif, réservé au développement et peut être relancé : les opérations de démonstration sont idempotentes.

Les migrations sont appliquées par le service `migrate` avant que l’application démarre. Le conteneur applicatif fonctionne avec un utilisateur non privilégié. PostgreSQL et les justificatifs disposent de volumes persistants distincts.

```sh
docker compose ps
docker compose logs app --tail 100
docker compose stop
```

`docker compose down` conserve les données. L’option `--volumes` les détruit : ne l’utiliser que pour réinitialiser volontairement un environnement jetable.

## Développement local

Pour héberger l’application sur Internet, consulter [le guide Render](DEPLOYMENT.md). Le fichier [render.yaml](render.yaml) prépare un service HTTPS, PostgreSQL 17 et un disque privé persistant à Francfort.

Prérequis : Node.js 24, npm 11, PostgreSQL 17 (Docker recommandé).

```sh
npm ci
npm run setup:env
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

L’application écoute sur `0.0.0.0:3000`. La base locale est sur `localhost:5434`. Si PostgreSQL est installé séparément, adapter `DATABASE_URL`.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

Arrêter le serveur de développement avant `npm start` sur le même port. La compilation ne remplace pas les migrations.

## Comptes de démonstration

Entreprise : **Demo Entreprise SARL**. Le mot de passe commun est la valeur **`DEMO_PASSWORD` dans votre `.env` local**. Il est généré aléatoirement et n’est ni publié dans le dépôt ni envoyé au navigateur.

| Email                 | Rôle           |
| --------------------- | -------------- |
| admin@demo.local      | Administrateur |
| manager@demo.local    | Responsable    |
| comptable@demo.local  | Comptable      |
| caissier@demo.local   | Caissier       |
| commercial@demo.local | Commercial     |
| employe@demo.local    | Employé        |

Le seed crée également 10 clients, 5 fournisseurs, 3 caisses, des catégories, 10 ventes et leurs factures, des paiements, des dépenses à différents états, une remise et un transfert. Le mot de passe des comptes existants n’est pas écrasé en relançant le seed.

## Créer une entreprise réelle

Utiliser une base neuve et migrée, sans lancer le seed. Fournir `COMPANY_NAME`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` dans l’environnement serveur, puis :

```sh
npm run company:create
```

Avec Docker : définir ces variables dans `.env`, puis :

```sh
docker compose run --rm migrate npm run company:create
```

Le script crée une entreprise, ses rôles, son premier administrateur, ses catégories et une caisse vide. Il refuse d’écraser un compte existant. Retirer `ADMIN_PASSWORD` de l’environnement après l’initialisation. Les collaborateurs se créent ensuite dans **Utilisateurs** ; la création d’un utilisateur Commercial crée aussi sa fiche commerciale.

Pour reprendre une trésorerie existante, utiliser un **ajustement autorisé** motivé depuis les caisses. Aucun écran ni endpoint ne permet d’affecter directement un solde.

## Variables d’environnement

| Variable                                                      | Utilisation                                                                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                | Connexion Prisma/PostgreSQL, uniquement serveur                                                                            |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`           | Initialisation Docker PostgreSQL                                                                                           |
| `APP_URL`                                                     | Origine exacte de l’application ; contrôle CSRF, liens email et cookies sécurisés en HTTPS                                 |
| `UPLOAD_DIR`                                                  | Répertoire privé des justificatifs ; `/app/uploads` dans Docker                                                            |
| `DEMO_PASSWORD`                                               | Mot de passe de développement, au moins 12 caractères                                                                      |
| `SMTP_HOST`, `SMTP_PORT`                                      | Serveur d’envoi pour les réinitialisations ; port 587 par défaut, TLS direct avec le port 465                              |
| `SMTP_USER`, `SMTP_PASSWORD`                                  | Authentification SMTP, utilisée lorsque `SMTP_USER` est renseigné                                                          |
| `SMTP_FROM`                                                   | Expéditeur requis pour envoyer les liens ; remplacer l’adresse d’exemple par un expéditeur autorisé par votre serveur SMTP |
| `TRUST_PROXY`                                                 | Désactivé par défaut ; définir exactement `true` uniquement si le proxy de confiance réécrit les en-têtes d’adresse IP     |
| `COMPANY_NAME`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Initialisation d’une nouvelle entreprise                                                                                   |
| `E2E_BASE_URL`                                                | URL de l’application pour les tests HTTP/navigateur ; localhost:3000 par défaut                                            |

L’envoi d’un lien nécessite `SMTP_HOST`, `SMTP_FROM` et `APP_URL`. Sans cette configuration, la récupération de compte ne distribue aucun lien. La réponse publique reste neutre. Le lien expire après 30 minutes et n’est utilisable qu’une fois ; son utilisation révoque les sessions et les autres liens de récupération du compte. Le changement de mot de passe connecté reste disponible. Aucun lien de récupération n’est exposé dans les réponses API ni les journaux applicatifs.

## Architecture

```text
src/app/                Pages Next.js et route handlers API
src/components/         Navigation, dashboard, listes, formulaires, détails
src/lib/                Auth, RBAC, validation, accès aux données, montants
src/services/           Services métier et rapports
prisma/schema.prisma    Modèles et relations
prisma/migrations/      Schéma SQL et contraintes d’intégrité
prisma/seed.ts           Données de démonstration
scripts/                Initialisation de l’environnement et d’une entreprise
tests/                  Tests unitaires, PostgreSQL, HTTP et navigateur
public/                 Icônes et écran hors connexion
```

Stack : Next.js 16 / React / TypeScript strict / Tailwind CSS 4, PostgreSQL 17, Prisma 6, Zod, Decimal.js, pdf-lib. Le verrou npm fixe les versions effectivement validées. L’override `deepmerge-ts` applique la version corrigée à la dépendance de configuration Prisma.

La compilation de production utilise Webpack. Le script de build copie et vérifie explicitement le client Prisma généré et son moteur natif, que le traçage automatique de Next ne conserve pas correctement ici. Le développement conserve Turbopack. Le script retire aussi les fichiers `.env` que Next peut recopier dans son artefact local ; la configuration reste fournie au démarrage.

L’interface ne contient pas de logique d’écriture financière. Les API construisent l’identité depuis la session, contrôlent l’origine et délèguent à des services validés. Les services financiers peuvent être testés sans React.

Les codes métier restent stables en anglais (`PAID`, `APPROVED`, etc.) et sont traduits en français à l’affichage. `src/lib/i18n.ts` centralise les libellés et les langues prévues. Les traductions anglaises et arabes complètes, la mise en page RTL et une police PDF arabe seront à compléter avant d’activer ces langues.

## Fonctionnement métier

**Ventes et factures.** La validation d’une vente avec ses lignes émet sa facture dans la même transaction. Numérotation annuelle atomique `FAC-2026-000001`. Quantités, prix HT, remises et taxes sont saisis en décimal. La facture affiche total, payé, reste, échéance et peut être imprimée ou téléchargée en PDF. Dans ce MVP, une vente est immédiatement facturée ; les éditeurs de brouillons de devis/ventes ne sont pas inclus.

**Paiements.** Chaque encaissement vise une facture et une seule destination : caisse ou portefeuille commercial. Les paiements partiels mettent à jour la facture et la vente. Un dépassement du reste dû est refusé. Un commercial ne peut encaisser que pour ses factures et dans son propre portefeuille. L’accès aux autres caisses et commerciaux dépend du rôle et des permissions.

**Caisses et commerciaux.** Le solde est la somme des destinations moins les sources du registre validé, annulations comprises. Il n’existe aucune colonne de solde modifiable. Une remise débite le portefeuille et crédite la caisse. Un transfert débite une caisse et crédite l’autre. L’insuffisance de fonds est vérifiée dans la transaction.

**Dépenses.** Soumission `PENDING` → validation `APPROVED` ou refus `REJECTED` → paiement `PAID`. Seul le paiement diminue la trésorerie. Le demandeur habilité peut modifier sa demande tant qu’elle est en attente. Un responsable ne valide pas sa propre demande ; l’administrateur dispose d’une exception explicite. Le paiement est réservé au caissier de la caisse ou à un autre utilisateur habilité.

**Corrections.** Le registre financier est immuable. Une annulation crée une écriture inverse liée à l’original et réconcilie facture/paiement/dépense. Une écriture ne s’annule qu’une fois ; une annulation ne s’annule pas à son tour. Si les fonds ont déjà été remis ou utilisés, rétablir d’abord la disponibilité nécessaire. Une dépense dont le paiement est annulé redevient validée et peut être payée à nouveau.

Une facture sans paiement validé peut être annulée avec un motif par un utilisateur habilité ; sa vente est annulée simultanément et les documents sont conservés. Les coordonnées utilisées dans les PDF restent celles de la fiche client et de l’entreprise au moment du téléchargement ; conserver les PDF émis si une copie historique de ces coordonnées est nécessaire.

**Fournisseurs.** Les sommes dues sont les dépenses fournisseurs validées mais non payées. Le MVP ne comporte pas de gestion de stocks, bons de commande ou rapprochement de factures d’achat indépendant des dépenses.

**Rapports.** Dashboard, courbes ventes/dépenses, trésorerie, encaissements par commercial, répartition des dépenses, créances et dettes. Les flux sont filtrés sur une période ; les soldes et créances affichent la situation actuelle. La marge affichée est un indicateur TTC « ventes moins dépenses payées », pas un bénéfice comptable. Les commissions simples sont indicatives. Exports CSV compatibles Excel (UTF-8, séparateur `;`, protection contre les formules) et rapports PDF. Les bornes de journée des rapports sont en UTC et la devise du MVP est unique par entreprise, EUR par défaut ; aucune conversion implicite.

Les lectures du dashboard, des rapports et des exports utilisent un snapshot PostgreSQL `RepeatableRead` pour conserver une vue cohérente pendant les opérations concurrentes. Les périodes sont limitées à deux ans. Les exports acceptent au plus 10 000 lignes en CSV ou 1 000 lignes en PDF, et 20 Mio de contenu textuel avant génération : un dépassement est refusé avec une demande de réduire la période ou d’ajouter des filtres. Les exports couvrent aussi les encaissements, utilisateurs, rôles et journaux d’audit selon les permissions, sans exposer les mots de passe ni les jetons. Le détail des rapports renvoie au plus 1 000 transactions et indique `transactionsTruncated` lorsqu’il en existe davantage.

**Justificatifs.** Images JPEG/PNG/WebP et PDF, 10 Mio par fichier (10 × 1 024² octets), 20 documents maximum par opération. Le corps multipart complet est limité à 11 Mio avant son analyse, y compris sans en-tête `Content-Length`. Le quota de documents est vérifié dans une transaction avec verrou PostgreSQL pour résister aux téléversements concurrents. Photo depuis un téléphone compatible ou sélection d’un fichier. Stockage hors `public`, noms internes aléatoires, validation des signatures de fichiers, téléchargement contrôlé par la session et l’accès à l’objet. Sauvegarder le volume des justificatifs en même temps que la base.

## Précision et intégrité

- Les montants sont des `BigInt` en centimes, JSON sous forme de chaînes. Les calculs des lignes utilisent Decimal ; aucun calcul monétaire ne dépend de flottants JavaScript.
- Arrondis `HALF_UP` au centime par ligne : sous-total, puis remise, puis taxe. Les graphiques convertissent uniquement des valeurs déjà calculées pour leur rendu visuel.
- Transactions `Serializable` avec reprise des conflits, clés UUID d’idempotence et numérotation transactionnelle.
- Clés étrangères composites avec `companyId`, contraintes de cohérence, montants positifs et protection SQL du registre, de l’audit et des documents émis.
- Audit et notifications métier sont écrits dans la même transaction que l’opération concernée.
- Les documents émis et les écritures sont conservés ; pas de suppression définitive de transactions.

## Sécurité et déploiement

Les mots de passe sont hachés avec scrypt et sel aléatoire. Les cookies de session opaques sont `HttpOnly` et `SameSite=Lax`, `Secure` lorsque `APP_URL` utilise HTTPS ; seul le hash du jeton est stocké en base. Les sessions durent huit heures, les comptes désactivés sont refusés et les changements de mot de passe révoquent les sessions. Une fenêtre de 15 minutes autorise au plus 10 tentatives de connexion par adresse email, 4 demandes de réinitialisation par adresse email et 10 tentatives de changement de mot de passe par utilisateur connecté. Ces compteurs sont protégés contre la concurrence par des verrous PostgreSQL.

Chaque requête recharge les permissions RBAC depuis la base. Les identifiants d’entreprise et les permissions envoyés par le navigateur ne sont pas utilisés comme autorité. Les API refusent les mutations sans origine conforme à `APP_URL`. Les corps JSON sont limités à 1 000 000 octets réellement lus. React échappe les textes, Zod valide les entrées, Prisma paramètre les requêtes SQL. Les API et documents privés portent `Cache-Control: no-store`.

En production : utiliser HTTPS via un reverse proxy, définir l’URL canonique, configurer SMTP, des sauvegardes PostgreSQL et fichiers, superviser `/api/health`, limiter la taille et le débit au niveau du proxy et préserver les secrets dans l’environnement. N’exposer ni PostgreSQL ni le volume privé sur Internet. Les journaux IP ne sont fiables derrière un proxy qu’avec `TRUST_PROXY` correctement configuré. La signature MIME vérifie le format ; elle ne remplace pas un antivirus si votre politique d’entreprise l’exige.

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run build
npm start
```

Pour modifier le schéma en développement : `npx prisma migrate dev --name nom_de_la_modification`. Conserver les migrations SQL d’intégrité ; `prisma db push` seul ne recrée pas leurs protections. Pour déployer une migration : `npm run db:migrate`.

## Téléphone et PWA

Navigation responsive PC/tablette et actions rapides mobiles. L’installation utilise le menu du navigateur sur Android/Chrome, ou **Partager → Sur l’écran d’accueil** sur iPhone/Safari. Elle nécessite HTTPS en dehors de localhost. En local sur un autre téléphone, configurer une URL HTTPS accessible au téléphone et la même valeur dans `APP_URL`.

Le service worker conserve uniquement l’écran public hors connexion et les icônes. Aucune page authentifiée, API ni pièce jointe n’est mise en cache. Les écritures financières nécessitent une connexion : elles ne sont pas mises en attente hors ligne.

## Tests

```sh
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:quick-entries
npm run test:receipts
# Avec l’application déjà démarrée :
npm run test:http
npm run test:browser
# Parcours de saisie rapide (définir E2E_BASE_URL si différent de http://localhost:3100) :
npm run test:quick-browser
npm run build
npm audit
```

Les tests d’intégration utilisent réellement PostgreSQL et ajoutent des entreprises de vérification isolées dans la base locale. Ne pas les lancer sur une base de production. L’historique de ces entreprises est conservé puisque le registre est immuable. Utiliser une base de développement jetable pour les exécutions répétées. Les tests navigateur nécessitent Chrome installé, ou Chromium installé par Playwright ; `BROWSER_EXECUTABLE` permet de choisir son chemin.

Le scénario HTTP vérifie les 20 étapes demandées : création des collaborateurs, connexion commerciale, client, vente 10 000 €, facture, paiement 4 000 €, remise en caisse, paiement 6 000 €, dépense 1 500 €, validation et paiement par des utilisateurs différents, caisse finale **8 500 €**, historique et audit. Il vérifie aussi l’isolation, CSRF, les PDF, les justificatifs privés, les exports et les annulations.

Les tests PostgreSQL couvrent les paiements et remises concurrents, les doublons idempotents, les dépassements, les dépenses refusées et les interdictions SQL de modifier/supprimer l’historique. Les résultats de livraison sont consignés dans [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Périmètre du MVP

Le premier livrable couvre le cycle financier utilisable décrit ci-dessus. Les extensions suivantes ne sont pas présentées comme livrées : comptabilité générale/certification fiscale, stocks et achats complets, émission de devis en brouillon, facturation électronique réglementaire, conversion multidevise, application native Android/iOS, synchronisation hors ligne, traductions EN/AR complètes, moteur de commissions avancé et relances automatiques programmées. Les factures échues sont détectées à la lecture ; les notifications internes couvrent les opérations du workflow.

Références d’architecture : [Next.js App Router](https://nextjs.org/docs/app/getting-started), [transactions Prisma](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions). Les guides de la version installée sont aussi disponibles dans `node_modules/next/dist/docs`.
