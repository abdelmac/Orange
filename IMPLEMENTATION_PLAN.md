# Orange — plan d’implémentation

## Évolution FREE / PRO et finances personnelles — 27 septembre 2026

Inspection : Next.js App Router, sessions PostgreSQL avec cookie HttpOnly, utilisateur actuellement rattaché à une seule entreprise, RBAC par rôle/permission, registre financier en unités mineures immuable, factures émises avec les ventes et PDF pdf-lib. Réutiliser ces modules et conserver leurs routes métier.

1. Étendre le schéma et créer une migration conservatrice : usage BUSINESS par défaut pour les utilisateurs existants ; adhésions multi-entreprises sans déplacer les comptes ; abonnements/plans ; invitations ; réglages et instantanés de facture ; comptes, catégories, transactions, budgets et fichiers personnels liés directement au User.
2. Centraliser FREE / PRO (400 centimes EUR par mois), fonctions et quotas côté serveur. Les nouvelles inscriptions démarrent FREE sans carte ; les entreprises existantes conservent les fonctions déjà disponibles dans un plan interne LEGACY non commercialisé. Les données ne sont jamais supprimées lors d’un déclassement.
3. Implémenter Stripe Checkout/portail/annulation/réactivation et webhooks signés/idempotents. Les événements font relire l’abonnement actuel chez Stripe pour éviter les retours en arrière dus à l’ordre de livraison. Sans clés Stripe configurées, FREE reste utilisable ; aucune activation PRO depuis le navigateur.
4. Personnaliser les factures PRO avec une configuration validée, logo privé, modèles/couleurs/champs, aperçu PDF identique au téléchargement/à l’impression, numérotation sans remise à zéro et instantané des nouvelles factures. Les documents déjà émis restent inchangés.
5. Ajouter inscription/onboarding BUSINESS/PERSONAL/BOTH, adhésions/invitations à jetons hachés, gestion des rôles et permissions par le propriétaire. Une invitation à un compte existant doit être acceptée par l’identité correspondante. La suppression d’un membre désactive uniquement son adhésion, jamais son identité ni l’historique financier.
6. Livrer l’espace /personal : revenus, dépenses, transferts atomiques, comptes, catégories, budgets et tableau de bord. Clés étrangères composites par userId et contrôles sur chaque lecture/écriture/fichier. Un administrateur d’entreprise n’a aucune autorité sur cet espace.
7. Intégrer le sélecteur d’espace, les pages tarifaires/abonnement/équipe/factures et le geste de bord mobile/tablette avec seuil et exclusion des composants défilants, overlay, fermeture tactile/Escape et hamburger conservé.
8. Valider migrations et scénarios A–E avec PostgreSQL local, tests d’isolation et de Stripe simulé/signé, contrôles navigateur mobile/desktop, TypeScript, lint, tests et build. Documenter configuration, choix de compatibilité et limites externes réelles.

Décisions : FREE sans limite artificielle de clients/factures, une place d’équipe ; PRO jusqu’à 25 membres, limites centralisées modifiables. Une entreprise garde sa devise de registre ; aucune conversion implicite. Les achats Stripe concernent le web/PWA ; la publication des clients de boutique et leur parcours d’achat demandent une validation dédiée avant soumission. Aucun déploiement ni migration de production pendant cette évolution.

## Objectif et état initial

### Validation de l’évolution du 27 septembre 2026

Les huit étapes de l’évolution FREE/PRO et personnelle sont implémentées. Vérifications exécutées : TypeScript, ESLint, 49 tests unitaires, build Next.js de production et vérification de l’artefact standalone sans configuration privée. Les tests PostgreSQL couvrent comptes/équipes, permissions par entreprise, factures personnalisées, webhooks Stripe signés, finances personnelles, rapports et un cycle complet pour le propriétaire FREE (100 € encaissés, 15 € dépensés, solde 85 €).

Non-régression : les 26 contrôles financiers initiaux, les 18 contrôles de saisie rapide et les 25 contrôles HTTP du scénario complet passent sur des schémas PostgreSQL locaux isolés. Une migration depuis l’ancien schéma peuplé compare dix tables avant/après, conserve les écritures et valide les 27 références aux appartenances. Les parcours navigateur réels vérifient inscriptions/invitations, documents PDF, budgets, justificatifs, changement d’espace, mode sombre et affichage entre 320 et 1 440 px. Les gestes du menu sont testés à 390, 820 et 1 440 px, y compris les tableaux horizontaux, Échap et l’overlay.

Stripe est exercé avec un adaptateur simulé et des signatures réelles ; il reste à fournir les variables privées du compte Stripe et à effectuer une recette Checkout en mode test avant paiement réel. Les adaptations des clients iOS/Android et leurs tests sont ajoutés, mais leur compilation native n’a pas été exécutée dans cet environnement Windows sans Java/Xcode. Aucun déploiement ni migration de production n’a été effectué. Configuration et reproduction : [docs/PLANS_AND_WORKSPACES.md](docs/PLANS_AND_WORKSPACES.md).

## Extension boutiques mobiles — 16 septembre 2026

La demande de publication ajoute deux clients natifs au MVP web existant. L’utilisateur confirme ne pas encore avoir de compte Apple Developer ni Google Play Console ; le contact des boutiques est `ennearock@gmail.com`.

1. Ajouter les clients Kotlin/Android et Swift/UIKit avec navigation, saisie d’encaissement, capture des justificatifs et partage des reçus. Réutiliser les API financières, l’authentification et les permissions existantes.
2. Restreindre la navigation et les téléchargements à l’origine HTTPS autorisée, préserver l’idempotence et interdire les écritures hors ligne. Tester les montants et les politiques d’URL.
3. Compiler Android (APK d’essai et AAB non signé) et iOS (simulateur et compilation device sans signature) dans GitHub Actions ; corriger les erreurs constatées. Vérifier que le web continue de compiler et de passer ses tests.
4. Préparer les icônes, pages publiques d’assistance/confidentialité, fiches françaises et instructions de signature. Documenter la recette sur appareils et les obligations de suppression des comptes selon les parcours retenus.
5. Après inscription de l’éditeur et confirmation de son identité/distribution : configurer signatures, environnement de revue et captures réelles, effectuer les tests requis puis soumettre aux boutiques. Cette étape dépend des comptes de l’utilisateur et de l’acceptation des boutiques ; aucune publication ne peut être déclarée avant celle-ci.

Les clients Android/iOS, la saisie native, le partage des reçus, les builds CI et les pages publiques de support/confidentialité sont implémentés. Les résultats exécutés sont consignés dans [docs/mobile/VALIDATION.md](docs/mobile/VALIDATION.md), les instructions de compilation dans [mobile/README.md](mobile/README.md) et les étapes de distribution restantes dans [docs/mobile/STORES.md](docs/mobile/STORES.md).

## État au démarrage du MVP web

Le dépôt est vide. Construire un MVP réellement connecté à PostgreSQL et vérifier le scénario métier demandé, depuis la création d’un commercial jusqu’au paiement d’une dépense. Aucune donnée de démonstration ne sera utilisée comme remplacement silencieux d’une base indisponible.

## Architecture retenue

- Next.js 16, React, TypeScript strict, Tailwind CSS ; interface française, responsive, navigation PC et actions mobiles, PWA sans cache des données privées.
- API REST Next.js dans `src/app/api`, services métier dans `src/services`, contrôles partagés dans `src/lib`.
- PostgreSQL 17, Prisma ORM 6 ; montants en centimes `BigInt`, quantités/prix/taxes calculés avec Decimal et arrondis explicitement au centime. La devise du MVP est celle de l’entreprise (EUR par défaut), sans conversion implicite.
- Sessions opaques conservées en base, cookie HttpOnly/SameSite, mots de passe scrypt ; permissions chargées côté serveur, périmètre entreprise et restrictions commerciales/caisse.
- Registre financier immuable : chaque mouvement indique une source et une destination ; soldes dérivés des mouvements validés. Annulation par écriture inverse, jamais par suppression.
- Transactions PostgreSQL `Serializable` avec reprise des conflits pour paiement, remise, transfert, dépense et annulation. Audit écrit dans la même transaction.
- Pièces jointes dans un volume privé, accessibles seulement après authentification et vérification du périmètre de l’objet.

## Phases

### Évolution — saisie quotidienne et reçus (12 septembre 2026)

- [x] Saisie rapide d’un encaissement sans facture : montant, personne et motif ; téléphone facultatif, caisse ou portefeuille autorisé, aucune vente artificielle.
- [x] Demande de sortie rapide avec bénéficiaire (chauffeur, commercial, client, employé, fournisseur ou autre), puis validation et paiement selon les droits existants.
- [x] Reçus privés numérotés et imprimables : instantané immuable à la première émission, historique et mention visible après annulation.
- [x] Journal quotidien sur téléphone, tablette et PC : recherche, journées locales, totaux calculés sur tout le résultat et détail des mouvements.
- [x] Contrat d’export JSON versionné pour préparer une future connexion ERP, avec identifiants stables et annulations ; aucun connecteur externe encore configuré.
- [x] Tests PostgreSQL, permissions, reçus, parcours navigateur et compilation finale réussis ; version publiée sur le service Render existant le 12 septembre.

Décisions : une connexion Internet reste nécessaire pour enregistrer les mouvements. Le téléphone peut servir d’appareil de saisie ; aucun numéro de téléphone n’est obligatoire. Un reçu atteste l’enregistrement d’un mouvement et ne remplace ni une facture ni une signature. Les sorties rapides restent des demandes jusqu’à leur validation et paiement. Le journal distingue les flux externes des transferts internes pour éviter de doubler la trésorerie.

Validation du 12 septembre : 29 tests unitaires (dont six contrôles PDF), 26 contrôles PostgreSQL du cycle initial, 18 contrôles PostgreSQL saisie/journal/export, 15 contrôles PostgreSQL reçus, 25 contrôles HTTP du cycle initial et neuf contrôles navigateur du nouveau parcours en 390/768/1440 px. Les tests couvrent les tentatives concurrentes, les annulations, les reçus privés figés, les droits des employés et commerciaux, le téléphone facultatif, la saisie avec virgule et les journées du fuseau Europe/Paris. Les opérations de test sont créées uniquement dans des entreprises isolées de la base locale. Le contrôle du mode historique d’une dépense payée à nouveau et du statut d’un encaissement rejoué après annulation est inclus.

### 1 — Fondations

- [x] Configuration Next.js/TypeScript/lint, dépendances verrouillées.
- [x] Modèles Prisma, migrations, contraintes SQL, Docker et environnement configurés ; validation finale de l’image Docker en cours.
- [x] Authentification, sessions, entreprises, utilisateurs, rôles et permissions.

### 2 — Interface et référentiels

- [x] Shell responsive, navigation selon permissions, dashboard calculé.
- [x] Clients, fournisseurs, commerciaux, recherche et filtres.

### 3 — Cycle commercial

- [x] Ventes avec lignes, facture numérotée, consultation, PDF et annulation motivée sans paiement actif.
- [x] Paiements partiels/complets, encaissement par commercial ou caisse.

### 4 — Trésorerie

- [x] Caisses et soldes calculés, registre, transferts atomiques, ajustements autorisés et motivés.
- [x] Remises commerciales et annulations traçables.

### 5 — Dépenses et documents

- [x] Demande, modification en attente, validation/refus, paiement autorisé.
- [x] Téléversement et téléchargement de justificatifs privés.

### 6 — Pilotage

- [x] Rapports simples, exports CSV/PDF, audit, notifications internes.

### 7 — Validation et livraison

- [x] Seed de développement avec les six rôles ; script distinct d’initialisation d’une entreprise réelle.
- [x] Tests unitaires des montants, permissions et protections partagées : 23 tests réussis.
- [x] Tests PostgreSQL : scénario de référence, isolation, droits, concurrence et immutabilité ; 26 contrôles réussis.
- [x] Compilation locale de production réussie.
- [x] Vérifications finales TypeScript/lint, 25 contrôles HTTP, 12 contrôles navigateur et image Docker.
- [x] PWA, README, limites et exploitation documentées ; manifeste, cache public et rendu responsive vérifiés dans Chrome.

## Contrat de développement

Tous les endpoints `/api/*` retournent JSON (`{error: string}` pour les erreurs). Les montants monétaires sont des chaînes décimales en euros à l’entrée (`amount: "4000.00"`), et des chaînes de centimes à la sortie (`amountMinor: "400000"`). Les dates sont ISO. GET `/api/me` expose `{user, permissions, company}`. Les listes sont sous `{items: [...]}`. Les opérations financières reçoivent un `idempotencyKey` UUID afin d’éviter les doublons.

Collections : `clients`, `suppliers`, `users`, `salespeople`, `cash-accounts`, `sales`, `invoices`, `payments`, `expenses`, `transactions`, `audit`, `notifications`. Routes métier : POST `/api/sales`, POST `/api/payments`, POST `/api/invoices/:id/cancel`, POST `/api/expenses`, POST `/api/expenses/:id/approve|reject|pay`, POST `/api/cash/transfers`, POST `/api/cash/handovers`, POST `/api/cash/adjustments`, POST `/api/transactions/:id/reverse`. GET `/api/dashboard`, `/api/reports`, `/api/search?q=…`, `/api/invoices/:id/pdf`, `/api/exports?type=…&format=csv|pdf`.

## Décisions de périmètre

Le MVP n’est pas un logiciel de comptabilité générale ni une certification fiscale. Il gère la trésorerie, les créances et les dépenses fournisseurs ; les achats/stocks et les règles de commission avancées sont hors premier livrable. CSV compatible Excel. Pas de transactions hors ligne : une connexion est nécessaire pour préserver l’intégrité financière. Le rétablissement de mot de passe nécessite un SMTP configuré ; aucune réinitialisation secrète ou lien public de développement en production.

Les limites détaillées figurent dans [le périmètre du MVP](README.md#périmètre-du-mvp) et [le fonctionnement métier](README.md#fonctionnement-métier) : ventes immédiatement facturées sans éditeur de devis en brouillon, devise unique sans conversion, coordonnées légales des PDF issues des fiches courantes, marge TTC indicative, rapports bornés en UTC, commissions simples indicatives, achats représentés par les dépenses fournisseurs. Comptabilité générale, facturation électronique réglementaire, stocks, applications natives, synchronisation hors ligne, traductions EN/AR complètes et relances programmées restent hors livraison. L’installation PWA nécessite HTTPS hors localhost ; la récupération de compte nécessite SMTP. Les limites des exports et pièces jointes sont documentées dans le README.

## Critère de sortie

Vente 10 000 € → facture → paiement commercial 4 000 € → reste 6 000 € → remise 4 000 € → portefeuille 0 € → paiement caisse 6 000 € → facture payée → dépense 1 500 € validée par responsable et payée par caissier → caisse +8 500 €, historique et audit complets. Ce cycle financier est validé par les services PostgreSQL, les 20 étapes HTTP et les formulaires dans Chrome sur l’application Docker de production.

## Validation du MVP — 10 septembre 2026

Les contrôles ci-dessous ont été exécutés. L’application et PostgreSQL restent démarrés et sains dans Docker, sur http://localhost:3000.

| Vérification           | Résultat constaté    | Portée                                                                                                                                                                                |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests unitaires        | 23 réussis           | Montants exacts, permissions, mots de passe et protections partagées                                                                                                                  |
| Intégration PostgreSQL | 26 contrôles réussis | Cycle financier avec caisse finale de 8 500 €, paiements partiels/complets, dépenses validées/refusées, isolation, idempotence, concurrence, annulations, protections SQL et rollback |
| Build local            | Réussi               | Compilation de production de l’application                                                                                                                                            |
| Suite HTTP             | 25 contrôles réussis | Sessions, création des collaborateurs, scénario de 20 étapes, fichiers privés, PDF, exports, annulations et refus d’accès                                                             |
| Navigateur responsive  | 12 contrôles réussis | Parcours financier par les formulaires, cinq rôles connectés, 14 modules, vues 390/768/1440 px, formulaire mobile, aucune erreur JavaScript                                           |
| PWA                    | Réussi dans Chrome   | Manifeste installable, service worker actif, écran hors connexion ; seuls l’icône et l’écran public sont en cache                                                                     |
| Docker                 | Réussi               | Images construites, migrations appliquées, app et PostgreSQL sains, UID applicatif 1000, moteur Prisma inclus, aucun fichier .env embarqué                                            |
| Initialisation         | Réussie dans Docker  | Seed idempotent relancé ; entreprise neuve créée sans seed, connexion du premier administrateur et caisse à zéro                                                                      |
| Qualité                | Réussie              | TypeScript, lint, formatage ; audit npm : zéro vulnérabilité signalée au moment de la validation                                                                                      |

Les suites concernées sont conservées dans [tests](tests). Les tests PostgreSQL utilisent de vraies écritures dans des entreprises de vérification isolées ; leur historique demeure présent puisque le registre et l’audit sont immuables. Les exécuter sur une base de développement, comme indiqué dans [les instructions de tests](README.md#tests). Les résultats détaillés et captures de cette exécution sont conservés localement sous `.local/` et exclus de Git. Les dimensions mobiles sont vérifiées par émulation Chrome ; aucun essai sur appareil physique Android/iPhone n’est revendiqué. L’envoi SMTP n’a pas été testé avec un fournisseur réel non configuré.
