# Préparer la connexion à un ERP comptable

Orange conserve le registre des mouvements. Le futur ERP pourra assurer la comptabilité générale, les plans de comptes, rapprochements, déclarations et clôtures. Aucun fournisseur ERP ni compte comptable n’est imposé à ce stade.

## Export disponible

`GET /api/integrations/accounting/export?from=2026-09-11T22%3A00%3A00.000Z&to=2026-09-12T22%3A00%3A00.000Z&page=1&pageSize=250`

Authentification par la session privée Orange, contrôles serveur `reports.export` et `transactions.view`, isolation de l’entreprise et du périmètre du collaborateur. Aucun accès anonyme ou clé intégrée au navigateur. Chaque téléchargement est audité. Les bornes ISO incluent `from` et excluent `to` ; maximum 366 jours. Le journal utilise les minuits du fuseau de l’appareil, y compris lors d’un changement d’heure.

La réponse utilise `schemaVersion: "orange.accounting.v1"` :

| Champ                                   | Convention                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `companyId`, `items[].id`               | UUID stables ; clé de dédoublonnage `(companyId, id)`                                                                                                         |
| `number`                                | Numéro lisible, jamais utilisé seul comme clé d’intégration                                                                                                   |
| `occurredAt`, `recordedAt`              | Date du mouvement et date de création, ISO UTC                                                                                                                |
| `amount.minor`                          | Montant strictement positif en unités mineures, représenté par une chaîne ; le sens est défini par la source et la destination, y compris pour une annulation |
| `amount.exponent`                       | `2` pour la devise unique de l’entreprise ; aucun calcul avec des flottants                                                                                   |
| `source`, `destination`                 | `CASH_ACCOUNT`, `SALESPERSON_WALLET` ou `EXTERNAL` ; sens porté par ces deux champs                                                                           |
| `counterparty`                          | Nom, catégorie, téléphone facultatif et liens client/fournisseur lorsqu’ils existent                                                                          |
| `documents`                             | Références facture, dépense, paiement et reçu déjà émis                                                                                                       |
| `createdBy`, `validatedBy`              | Identité de l’auteur et du validateur                                                                                                                         |
| `reversalOfId`, `reversedById`          | Liens explicites d’annulation ; conserver les deux écritures                                                                                                  |
| `page`, `pageSize`, `total`, `nextPage` | Pagination explicite ; 250 lignes par défaut, maximum 500 par page                                                                                            |

L’export JSON ne génère pas les reçus manquants. Un encaissement libre `CASH_RECEIPT` n’est ni une vente ni un règlement d’une facture existante ; une qualification comptable sera nécessaire dans l’ERP. Les dépenses n’apparaissent dans ce registre qu’une fois payées. Les remises commerciales et transferts restent des mouvements internes : ne pas les comptabiliser une deuxième fois en revenu ou en dépense. Le CSV humain existant reste accessible dans Transactions/Rapports et contient aussi le tiers et les identifiants des nouvelles saisies.

## Contrat de synchronisation futur

Cet endpoint est un export paginé, pas une synchronisation automatique. La lecture est cohérente par page, mais plusieurs pages ne constituent pas un instantané commun si des opérations sont ajoutées pendant le téléchargement. Le futur connecteur devra importer de façon idempotente, relire une période avec recouvrement, traiter les écritures antidatées et rapprocher périodiquement l’ensemble des UUID et des montants. Il ne devra jamais utiliser uniquement la dernière date de mouvement comme curseur.

Avant d’activer des échanges automatiques : définir le mapping des caisses/portefeuilles et tiers vers l’ERP ; ajouter des comptes de service à portée explicite et des secrets conservés côté serveur ; enregistrer une file d’événements dans la même transaction SQL que les écritures ; traiter les reprises avec identifiant d’événement unique, accusé de réception et journal des erreurs ; prévoir une réconciliation et une supervision. Les appels réseau devront rester en dehors de la transaction financière. Les annulations produiront une contre-écriture dans l’ERP, jamais une suppression.

Les noms libres de chauffeurs et autres bénéficiaires ne créent pas de comptes utilisateurs. Ils désignent le tiers de l’opération et ne lui donnent aucun accès à Orange. Le reçu PDF privé peut lui être remis par téléchargement ou impression par un collaborateur autorisé. Aucun SMS ni envoi à un tiers n’est automatique.
