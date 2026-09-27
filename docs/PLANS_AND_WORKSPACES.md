# Offres, équipes et finances personnelles

## Utilisation

`/inscription` ouvre un parcours gratuit : identité, choix **Entreprise / Personnel / Les deux**, nom de l’entreprise si nécessaire, devise, confirmation FREE. Aucun numéro de carte n’est demandé. `/onboarding` permet ensuite de modifier son nom, d’activer l’espace personnel et de créer un espace entreprise. Une inscription PERSONAL ne crée aucune entreprise fictive.

Le sélecteur en haut du menu change d’entreprise ou ouvre **Mes finances personnelles**. Sur téléphone et tablette jusqu’à 1 020 px, un glissement depuis les 26 premiers pixels du bord gauche ouvre le menu. Un déplacement d’au moins 75 px, principalement horizontal, est nécessaire. Les champs et zones défilantes horizontalement sont ignorés. Le geste inverse, Échap et l’overlay ferment le menu ; le bouton menu reste disponible. Au-delà de 1 020 px, la barre latérale reste fixe.

| Fonction                                                         | FREE           | PRO, 4 EUR/mois                  |
| ---------------------------------------------------------------- | -------------- | -------------------------------- |
| Clients, factures et PDF                                         | Sans quota     | Sans quota                       |
| Encaissements, dépenses, caisses et rapports simples             | Inclus         | Inclus                           |
| Finances personnelles et budgets                                 | Inclus         | Inclus                           |
| Branding sur les nouvelles factures                              | Obligatoire    | Supprimable                      |
| Logo, modèles, couleurs, champs et mentions de facture           | Standard       | Personnalisables                 |
| Membres d’entreprise                                             | 1 propriétaire | 25 membres, propriétaire compris |
| Rapports avancés : évolution annuelle et ancienneté des créances | —              | Inclus                           |

Les invitations non expirées réservent une place. Le quota est vérifié côté serveur dans une transaction. Les clients et factures n’ont volontairement pas de limite arbitraire. Pour ajouter une offre, modifier la définition centrale `src/lib/plans.ts`, provisionner `SubscriptionPlan` et étendre le catalogue de paiement côté serveur. `hasFeature`, `getPlanLimits`, `getEntitlements` et `requireFeature` centralisent les droits ; RBAC reste vérifié indépendamment.

Les entreprises antérieures à la migration reçoivent un accès interne **LEGACY**, absent de la page tarifaire, qui conserve leur équipe et leurs rapports. Cet accès n’offre pas la nouvelle personnalisation de factures. Le seed de démonstration utilise cet accès pour conserver ses six rôles. Les nouvelles entreprises et le script `company:create` démarrent en FREE.

## Factures

**Paramètres → Personnaliser mes factures** (`/parametres/factures`) propose trois modèles, couleurs, coordonnées et identité commerciale, informations légales/bancaires, en-tête, pied de page, conditions, notes, remerciements, colonnes, champs personnalisés et délai de paiement. Le logo PNG/JPEG est limité à 1 Mo et 2 400 px par côté, décodé et stocké en base privée. L’aperçu utilise le même rendu PDF que l’impression et le téléchargement. Sur téléphone, il s’ouvre dans un onglet dédié de l’éditeur.

Les paramètres sont figés dans chaque nouvelle facture au moment de son émission, logo inclus. Une modification ultérieure ou l’expiration de PRO n’altère donc pas un document émis. Les anciennes factures sans snapshot continuent à utiliser leur présentation standard. La numérotation utilise le compteur annuel FAC existant, même après changement de préfixe ; changer de modèle ne remet jamais le compteur à zéro. Les nouvelles factures FREE rétablissent les réglages standard et la mention de l’application.

La devise des factures correspond à celle de l’entreprise : aucun taux de change implicite. La configuration de marque affichée est centralisée dans `src/lib/brand.ts`. Les identifiants techniques historiques (cookies, exports comptables, application native) restent stables.

## Invitations et permissions

**Paramètres → Mon équipe** est réservé au propriétaire. SMTP est nécessaire pour envoyer une invitation ; configurer `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` et `APP_URL`. Le lien expire après sept jours. Seul son SHA-256 est conservé ; il n’apparaît jamais dans l’audit. Le propriétaire peut renvoyer/annuler une invitation, modifier le rôle et les permissions ou retirer un membre.

Un destinataire existant se connecte avec l’adresse invitée ; un nouveau destinataire crée son compte lors de l’acceptation. L’invitation consommée ne peut plus servir. Retirer un membre désactive son appartenance et ses sessions pour cette entreprise, sans désactiver son identité globale ni ses accès personnels ou à d’autres entreprises. Les données financières historiques restent consultables par les personnes habilitées, y compris les sommes détenues par un commercial retiré.

`CompanyMembership` représente les appartenances ; `User.companyId` est uniquement une entreprise d’origine conservée pour compatibilité. `Session.companyId` désigne l’espace professionnel actif, ou `null` pour le personnel. Les rôles et permissions sont évalués dans cette entreprise. `isOwner`, distinct du rôle ADMIN, protège la facturation et la gestion d’équipe. `MembershipPermission` porte les dérogations individuelles. Les clés étrangères composites vers les appartenances empêchent d’attribuer une opération à un utilisateur extérieur à l’entreprise.

Les identités déjà désactivées globalement avant la migration restent désactivées. Réactiver leur appartenance ne contourne pas ce blocage : leur récupération nécessite une intervention serveur vérifiée. Les désactivations réalisées dans la nouvelle interface Équipe portent uniquement sur l’appartenance. Le propriétaire conserve les droits financiers complets de l’administrateur, dont l’examen de ses propres dépenses ; les responsables ordinaires conservent l’obligation de validation par une autre personne.

## Finances personnelles

Routes `/personal`, `/personal/transactions`, `/personal/depenses`, `/personal/revenus`, `/personal/budgets`, `/personal/categories`, `/personal/comptes`, `/personal/statistiques`, `/personal/parametres`.

Chaque ligne porte `userId`, contrôlé depuis la session serveur. Les références compte/catégorie/justificatif sont protégées par des clés étrangères composites incluant `userId`. Aucune permission d’entreprise, même ADMIN/OWNER, n’autorise l’accès aux finances personnelles d’autrui.

Les soldes sont le solde initial plus les mouvements exacts en unités mineures. Le solde initial reste immuable après création. Un transfert constitue une seule écriture atomique avec source et destination et ne gonfle pas les revenus ou dépenses mensuels. Les comptes archivés restent dans l’historique et le total. Les découverts personnels sont autorisés. Tous les comptes utilisent la devise personnelle choisie à l’inscription ; les conversions ne sont pas proposées.

Les budgets mensuels affichent des alertes à 80 % et 100 %, calculées à partir des dépenses de la catégorie. L’édition d’une transaction utilise `updatedAt` pour refuser l’écrasement d’une modification concurrente. Les doubles soumissions utilisent une clé d’idempotence. Les justificatifs personnels sont dans un espace de stockage privé distinct ; un lien exige toujours la session du propriétaire.

## Activation de Stripe

1. Dans votre compte Stripe, créer un produit **PRO** avec un prix récurrent de **4,00 EUR tous les mois**, quantité 1, sans transformation de quantité. Utiliser d’abord le mode test. Le serveur refuse un tarif différent.
2. Dans l’environnement privé du serveur, renseigner `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` et l’adresse HTTPS publique `APP_URL`. Aucune clé Stripe publique n’est nécessaire : Checkout est hébergé par Stripe. Ne jamais commiter ces valeurs.
3. Configurer le portail client Stripe : moyen de paiement, historique des factures et résiliation. Ne pas proposer de changement vers un prix arbitraire ni de changement de quantité.
4. Ajouter un endpoint **snapshot** vers `https://votre-domaine/api/billing/webhook`, version **2026-08-26.dahlia** (version du SDK épinglée par `package-lock.json`). Activer : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
5. Redémarrer le serveur et ouvrir `/abonnement` avec le propriétaire de l’entreprise. Effectuer un paiement test ; vérifier le webhook, l’activation PRO, un renouvellement, un échec, une résiliation et une reprise avant de passer en mode réel.

En local, utiliser `stripe listen --forward-to localhost:3000/api/billing/webhook` et le secret de signature affiché par ce listener dans l’environnement local. Un endpoint de production utilise son propre secret. Guide officiel : [webhooks Stripe](https://docs.stripe.com/webhooks).

La page de retour de Checkout n’active aucun droit. Seuls les webhooks signés synchronisent l’abonnement en relisant son état actuel chez Stripe. Les événements sont idempotents et sérialisés ; les doublons et livraisons dans le désordre ne restaurent pas d’anciens droits. Le client Stripe, le tarif et l’identifiant local doivent correspondre. Les périodes sont lues sur l’item de l’abonnement, conformément à la [documentation Stripe](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end).

PRO est utilisable uniquement lorsque le statut est ACTIVE et la période payée non expirée. PAST_DUE suspend les fonctions PRO sans supprimer de données. Une résiliation demandée conserve les droits jusqu’à la fin de période ; une reprise réactive le renouvellement. Après résiliation effective, une nouvelle souscription peut être créée. Le personnel seul reste gratuit : le paiement PRO vise une entreprise sélectionnée.

Les achats sont proposés sur le site/PWA. Les wrappers natifs identifiés par `OrangeFinanceNative` n’ouvrent pas Stripe Checkout ni le portail : les achats natifs et leurs règles de publication doivent faire l’objet d’une intégration dédiée avant publication. Cette évolution ne constitue pas une nouvelle publication App Store/Play Store.

## Migration et vérification

Sauvegarder la base puis exécuter `npm run db:migrate` avant de démarrer le nouveau code. La migration `20260927090000_plans_personal_workspaces` est transactionnelle. Elle conserve les utilisateurs existants en BUSINESS, crée les appartenances, désigne le plus ancien ADMIN actif de chaque entreprise comme propriétaire, conserve les rôles existants et attribue LEGACY. Une entreprise sans ADMIN actif ne reçoit pas automatiquement de propriétaire : un opérateur doit vérifier son propriétaire puis renseigner l’appartenance correspondante par une intervention serveur tracée.

Les services réutilisent l’authentification, les calculs exacts et le registre existants. Aucune table financière ni écriture validée n’est effacée. Les tests de migration comparent les données avant/après dans un schéma jetable distinct.

```sh
npm run typecheck
npm run lint
npm test
npm run test:accounts
npm run test:free-owner
npm run test:personal
npm run test:invoice-customization
npm run test:billing
npm run test:workspaces
npm run test:advanced-reports
npm run test:migration-upgrade
npm run build
```

Ces commandes lisent le PostgreSQL **local** de `.env`, remplacent uniquement son schéma par `plans_qa_suite`, appliquent les migrations et ajoutent des fixtures identifiées. Elles ne réinitialisent ni la base ni le schéma public. `TEST_DATABASE_SCHEMA` permet un autre nom commençant par `plans_qa_`. Le lanceur configure `ALLOW_PERSONAL_TESTS=true`. `npm run test:extensions` exécute les sept suites. `test:migration-upgrade` crée son propre schéma local avec les anciennes migrations, y ajoute des données puis applique la nouvelle migration. Les tests Stripe utilisent de vraies signatures mais un adaptateur Stripe simulé : ils ne facturent aucune carte et ne remplacent pas la vérification de votre compte Stripe test.

Pour les contrôles navigateur, `npm run test:workspace-server` migre/seed le schéma isolé puis lance Next sur `http://localhost:3107`. `DEMO_PASSWORD` doit être configuré. Dans un second terminal, lancer `npm run test:workspace-browser` et `npm run test:personal-browser`. Le premier accepte `E2E_BASE_URL`, le second `PERSONAL_TEST_URL`. Les tests `accounts-team.browser.mjs` et `invoice-browser.mjs` nécessitent également `DATABASE_URL` pointant explicitement vers ce schéma de test. Captures et résultats restent dans `.local/`, ignoré par Git.
