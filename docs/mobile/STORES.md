# Publication App Store et Google Play

Vérification documentaire initiale : **16 septembre 2026**. Le titulaire confirme son compte Apple Developer individuel activé le **26 septembre 2026**, puis son compte Google Play Console **personnel** activé le **11 octobre 2026**. Ces accès n’ont pas été vérifiés par API. Le **11 octobre 2026**, il choisit également l’achat de PRO directement dans les applications iOS et Android. L’intégration de ces achats reste à réaliser. Ce dossier prépare la publication ; il ne constitue ni une soumission ni une approbation des stores. Contact de support confirmé : **ennearock@gmail.com**. Le nom juridique et l’adresse de l’éditeur restent à fournir.

Le nom **Orando Finance** est confirmé par la demande de changement de marque du propriétaire le **11 octobre 2026**. L’identifiant provisoire reste `com.ennearock.orangefinance` ; les droits sur la marque et l’identifiant définitif restent à vérifier avant le premier envoi. Les valeurs non confirmées sont explicites dans [listing.fr-FR.draft.json](listing.fr-FR.draft.json) ; ne pas importer ce brouillon automatiquement dans un store.

**Choix confirmé le 26 septembre 2026 : publication Apple au nom personnel du propriétaire, avec un compte Individual activé selon sa confirmation.** Aucun D-U-N-S n’est nécessaire pour ce type de compte ; le nom légal du titulaire apparaîtra comme vendeur. Le propriétaire ne dispose pas de Mac personnel : le [parcours depuis Windows](APPLE_WINDOWS.md) utilise les machines macOS de GitHub Actions. Le nom légal exact et les accès de signature restent à compléter. Le compte Google Play personnel a été confirmé séparément le 11 octobre 2026. [Inscription Apple](https://developer.apple.com/programs/enroll/).

## Nom de l’application — 11 octobre 2026

Le nom affiché devient **Orando**, ou **Orando Finance** pour les fiches des boutiques et l’offre PRO. Les identifiants techniques existants restent stables : origine `https://orange-finance.onrender.com`, dépôt GitHub `abdelmac/Orange`, bundle/package `com.ennearock.orangefinance`, projets et schémas Xcode `OrangeFinance`, marqueur natif `OrangeFinanceNative`, cookie `orange_session` et contrat ERP `orange.accounting.v1`. Les identifiants proposés pour les abonnements ci-dessous restent inchangés et ne sont pas attestés comme créés.

Ce changement de nom dans le dépôt ne renomme pas les ressources Render, le produit Stripe, une entreprise déjà enregistrée, les certificats existants ou les fiches distantes des boutiques. Aucune publication ni mise à jour distante n’est attestée par cette modification. Les preuves et noms de fichiers d’archives conservent leur nom historique.

## 1. Choisir la distribution

Les projets et preuves de compilation sont décrits dans [VALIDATION.md](VALIDATION.md). Les [visuels fournis](assets/README.md) comprennent les icônes et la bannière Google Play ; les captures de fiche doivent être faites sur les versions réellement exécutées avec des données de démonstration.

La préparation vise par défaut une fiche publique, conformément à la demande de présence sur les deux stores. L’inscription gratuite permet de créer un espace entreprise, personnel ou les deux ; les collaborateurs peuvent aussi rejoindre une entreprise sur invitation. L’authentification, l’isolation des espaces et les permissions protègent les données. PRO concerne l’entreprise sélectionnée ; l’espace personnel reste gratuit.

| Besoin                                                                    | Apple                                                                            | Android                                                                                                                           |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Application téléchargeable par tout le monde, inscription gratuite et invitations | App Store public, accès FREE et abonnement PRO d’entreprise | Google Play public, même modèle |
| Collaborateurs uniquement, appareils gérés                                | Custom App privée vers les organisations Apple Business/School Manager désignées | Application privée Managed Google Play, organisations et gestion EMM configurées                                                  |
| Lien accessible sur appareils personnels, sans recherche publique         | Distribution Apple non répertoriée, sur demande après soumission                 | Choisir le public ou Managed Google Play selon l’environnement ; une piste de test ne remplace pas une distribution de production |

Chez Apple, un lien non répertorié peut être transmis : l’authentification reste indispensable. Le passage privé/public après approbation exige un nouvel enregistrement d’application, sauf passage public vers non répertorié. Décider avant la soumission. [Distribution Apple](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods), [distribution Android d’entreprise](https://support.google.com/googleplay/work/answer/10637198?hl=en), [applications privées Managed Google Play](https://support.google.com/work/android/answer/9563481?hl=en).

## 2. Comptes, identité et signature indispensables

| Élément                      | Apple                                                                                                                | Google Play                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Compte confirmé par le titulaire | Apple Developer Program Individual activé ; double authentification et contrats à contrôler | Play Console personnel activé ; identité, coordonnées et contrats à contrôler |
| Tarif officiel indicatif     | **99 USD par an**, prix local proposé à l’inscription                                                                | **25 USD une fois** pour le compte Play Console public                            |
| Publication pour une société | Entité juridique, représentant habilité, D-U-N-S sauf exception officielle, site et coordonnées de l’organisation    | Compte Organisation pour l’entreprise ; D-U-N-S et vérification de l’organisation |
| Identité de signature        | Team ID, App ID explicite, certificat Apple Distribution et profil App Store Connect, ou signature automatique Xcode | Identifiant de package final, clé d’envoi protégée et Play App Signing            |
| Artefact à publier           | Archive de distribution iOS signée, transmise à App Store Connect                                                    | Android App Bundle `.aab` de release signé pour l’envoi                           |

Les prix et pièces nécessaires proviennent de [l’inscription Apple](https://developer.apple.com/programs/enroll/), [l’inscription Google Play](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en) et [du choix du compte Google](https://support.google.com/googleplay/android-developer/answer/13634885?hl=en). Ils n’incluent pas l’hébergement existant ni un éventuel Mac/service de compilation. Ne pas choisir un compte personnel uniquement pour éviter une vérification d’entreprise.

La signature iOS peut être gérée par Xcode ; elle exige toujours une équipe et un App ID autorisés. Google Play requiert l’AAB et Play App Signing pour les nouvelles applications publiques. Conserver les clés et secrets dans le coffre de l’éditeur ou les secrets CI, jamais dans Git. Une compilation CI non signée ne remplace pas ces prérequis. [Profil Apple](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile), [AAB](https://developer.android.com/guide/app-bundle), [signature Play](https://developer.android.com/guide/app-bundle/faq).

Le compte Google personnel est confirmé ; sa date de création reste à vérifier. Pour un **compte personnel créé après le 13 novembre 2023**, prévoir un test fermé avec **au moins 12 testeurs inscrits continuellement pendant 14 jours**, puis une demande d’accès à la production. Le délai ne garantit pas l’acceptation automatique. [Exigences Google pour les nouveaux comptes personnels](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB).

### Achat de PRO dans l’application — choix du 11 octobre 2026

Stripe continue de gérer les abonnements achetés sur le site. Les versions natives actuelles masquent les commandes d’achat et refusent les appels Stripe depuis leur interface : **aucun achat StoreKit ou Google Play Billing n’est encore implémenté**. La réussite de Stripe sur le site ne valide pas les achats des boutiques.

Préparer un abonnement mensuel dans chaque console, après confirmation de l’identifiant définitif de l’application et des contrats, coordonnées bancaires et informations fiscales requis. Les identifiants suivants sont des **propositions, non créées ni réservées** :

| Boutique | Produit proposé | Configuration proposée |
| --- | --- | --- |
| Apple | `com.ennearock.orangefinance.pro.monthly` | Abonnement à renouvellement automatique, groupe « Orando Finance PRO », durée un mois |
| Google Play | `orange_finance_pro` | Abonnement avec forfait de base `monthly`, renouvellement automatique mensuel |

Le tarif web est 4 EUR/mois. Choisir les prix et territoires dans chaque console, puis afficher dans l’application le prix localisé renvoyé par la boutique ; ne pas promettre un prix mobile identique avant configuration. Guides : [abonnements Apple](https://developer.apple.com/help/app-store-connect/manage-subscriptions/offer-auto-renewable-subscriptions/), [abonnements Google Play](https://support.google.com/googleplay/android-developer/answer/140504?hl=fr).

Travaux nécessaires avant une soumission annonçant ces achats :

- Ajouter StoreKit 2 dans iOS et Google Play Billing dans Android : achat, attente/annulation, restauration et gestion de l’abonnement ; finaliser les transactions après validation serveur.
- Vérifier les achats côté serveur et traiter les notifications Apple/Google authentifiées : renouvellement, expiration, échec, remboursement et révocation. Dédupliquer les événements et relire l’état actuel avant de modifier les droits.
- Réserver l’achat au propriétaire de l’entreprise sélectionnée. Rattacher chaque achat vérifié à cette entreprise ; une restauration ou un changement de compte ne doit pas réattribuer un achat à un autre espace. Prévenir les doubles abonnements Stripe/Apple/Google et diriger la gestion vers le fournisseur d’origine.
- Tester avec Apple Sandbox/TestFlight et les comptes de test Google : achat, restauration, renouvellement, expiration, remboursement, changement d’appareil et isolation entre entreprises. Ces essais n’ont pas encore été réalisés.

## 3. Exigences techniques de soumission

- **Apple : Xcode 26 ou ultérieur avec SDK iOS/iPadOS 26 ou ultérieur**, obligatoire depuis le 28 avril 2026. La compilation et l’archivage iOS nécessitent un environnement macOS/Xcode local ou CI. Le SDK de compilation n’impose pas à lui seul de limiter les utilisateurs à iOS 26. [Exigences Apple](https://developer.apple.com/news/upcoming-requirements/).
- **Google Play : Android 16, `targetSdkVersion` 36 ou supérieur**, pour les nouvelles apps et mises à jour depuis le 31 août 2026. Ne pas prendre une éventuelle prolongation comme configuration cible de cette nouvelle app. [API cible Google Play](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).
- Vérifier la compatibilité avec les pages mémoire Android de **16 Ko**, y compris les bibliothèques natives transitives si le binaire en contient. [Compatibilité Android](https://developer.android.com/guide/practices/page-sizes).
- Tester les permissions caméra/photos au moment de l’action, le refus de permission, le sélecteur système de fichiers et le partage PDF. Pour joindre ponctuellement un justificatif, utiliser les sélecteurs système ; ne pas demander l’accès global aux fichiers ou à toute la photothèque. [Photos Google](https://support.google.com/googleplay/android-developer/answer/15800983?hl=en), [accès aux fichiers](https://support.google.com/googleplay/android-developer/answer/10467955?hl=en).
- Examiner l’archive iOS finale, les SDK inclus et les API à justification obligatoire ; compléter le manifeste de confidentialité selon les usages réels. Les déclarations de la fiche et celles du binaire doivent correspondre. [Manifestes Apple](https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests).

Architecture retenue pour ce projet : Android Kotlin/WebView et iOS Swift/WKWebView, navigation native, saisie d’encaissement native, capture de justificatifs et partage/impression des PDF privés. Le serveur HTTPS existant conserve l’authentification et les contrôles métier. Ces fonctions doivent être démontrées sur le binaire livré ; leur simple mention dans ce document n’atteste pas leur validation.

**Apple 4.2 :** une page web simplement réemballée peut être refusée. Montrer une utilité mobile réelle : saisie native utilisable au clavier, retour/navigation adaptés, photo attachée à une opération et partage natif d’un reçu authentifié. Ce sont des choix produit, pas une liste officielle garantissant l’acceptation. Aucun changement distant ne doit masquer des fonctions à la revue. [App Review Guidelines, 4.2 et 2.3](https://developer.apple.com/app-store/review/guidelines/).

## 4. Fiche française proposée

Ces textes sont un **brouillon à confronter au binaire final**. Ils ne promettent ni exécution de virements pour les clients de l’entreprise, ni encaissement de leurs cartes bancaires, ni comptabilité certifiée, ni fonctionnement financier hors connexion. L’achat de l’abonnement PRO est un parcours distinct, à finaliser avant de l’annoncer comme disponible dans les boutiques.

| Champ                         | Proposition                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| Nom                           | Orando Finance                                                                                     |
| Sous-titre Apple              | Caisse, dépenses et reçus                                                                          |
| Description courte Google     | Suivez encaissements, dépenses et caisses avec votre équipe.                                       |
| Catégorie principale proposée | Économie et entreprise / Business                                                                  |
| Langue initiale               | Français (`fr-FR`)                                                                                 |
| Support confirmé              | `ennearock@gmail.com`                                                                              |
| Prix proposé                  | Téléchargement gratuit, offre FREE ; abonnement PRO d’entreprise avec achats intégrés choisis, intégration en attente |
| Public visé                   | Propriétaires, collaborateurs et utilisateurs d’un espace personnel ; pas une application destinée aux enfants |

Nom et sous-titre Apple sont limités à 30 caractères. Google autorise 30 caractères pour le nom, 80 pour la description courte et 4 000 pour la description complète. [Champs Apple](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information), [fiche Google](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en).

### Description complète

Orando Finance accompagne les équipes dans le suivi quotidien de l’argent de leur entreprise et propose un espace séparé pour les finances personnelles. Créez gratuitement votre compte, choisissez vos espaces ou rejoignez une entreprise sur invitation.

Enregistrez un encaissement avec ou sans facture, retrouvez les opérations dans le journal quotidien et consultez les montants disponibles dans vos caisses ou votre portefeuille commercial. Le nom de la personne et le motif identifient chaque saisie ; le téléphone reste facultatif.

Créez des demandes de dépenses, ajoutez un justificatif et suivez leur validation puis leur paiement. Les accès dépendent des autorisations attribuées par l’entreprise : administrateur, responsable, comptable, caissier, commercial ou employé.

Retrouvez vos clients, ventes, factures et paiements partiels. Téléchargez les reçus PDF et consultez l’historique des mouvements. Les corrections financières conservent la trace de l’opération initiale et de son annulation.

Suivez aussi vos revenus, dépenses, comptes et budgets dans votre espace personnel. L’offre FREE inclut les fonctions de base ; PRO ajoute la personnalisation des factures, la gestion d’équipe et les rapports avancés pour l’entreprise abonnée. Le parcours et le prix des achats intégrés devront être précisés dans la fiche une fois l’intégration native validée.

Une connexion Internet est nécessaire. Orando Finance enregistre les opérations déclarées par votre entreprise ; l’application n’exécute pas de virements bancaires et n’encaisse pas les cartes de vos clients. Les fonctionnalités visibles varient selon votre rôle et l’offre de l’entreprise.

Assistance : ennearock@gmail.com.

## 5. Visuels à produire depuis l’application

Réutiliser le dessin vectoriel existant `public/icon.svg` comme source. Les PNG PWA de 192/512 px ne constituent pas à eux seuls le catalogue d’icônes natives. Pour iOS, préparer l’icône dans le catalogue Xcode, notamment la source App Store 1 024 × 1 024 px ; valider l’asset final dans Xcode/App Store Connect. [Ajout de l’icône Apple](https://developer.apple.com/help/app-store-connect/manage-app-information/add-an-app-icon).

| Destination                 | Livrables proposés                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| iPhone                      | 5 captures réelles portrait **1 320 × 2 868 px** ; format admis dans le groupe 6,9 pouces                                                           |
| iPad, si distribué sur iPad | 5 captures réelles **2 064 × 2 752 px**, groupe 13 pouces                                                                                           |
| Google Play                 | Icône **512 × 512 px**, PNG 32 bits, ≤ 1 024 Ko ; image de présentation **1 024 × 500 px** ; au moins 2 captures, prévoir 5 téléphone et 2 tablette |

Apple accepte 1 à 10 captures JPEG/PNG, sans transparence ; le groupe iPad 13 pouces est requis pour une app iPad. [Spécifications Apple](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications). Google accepte des captures JPEG/PNG 24 bits sans alpha, de 320 à 3 840 px, dont le grand côté ne dépasse pas deux fois le petit. Des captures Android 1 080 × 1 920 px conviennent si elles proviennent réellement de l’appareil/émulateur utilisé. [Visuels Google](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en-GB).

Séquence proposée : saisie d’encaissement, journal, détail et partage d’un reçu, demande avec justificatif, caisse/portefeuille. Utiliser une entreprise de démonstration isolée et des personnes fictives. Ne pas présenter une capture du navigateur comme une capture de l’application native. Aucun identifiant, email réel de client ou solde réel dans les visuels.

## 6. Confidentialité et déclarations

Publier une politique HTTPS accessible sans connexion et un support public, puis saisir leurs URL réelles dans les deux consoles. Le contact confirmé ne remplace pas l’identité de l’éditeur ni les durées de conservation : ces informations doivent être fournies avant de finaliser les déclarations.

Les pages `/assistance` et `/confidentialite` sont préparées dans le dépôt. Leurs URL de production figurent dans le brouillon avec le statut **déploiement à vérifier et identité de l’éditeur à compléter**. `/assistance#donnees` permet de contacter le support pour une demande concernant son compte ; ce contact ne constitue pas à lui seul une attestation de conformité aux exigences de suppression des stores. L’identité juridique et les règles de conservation restent à finaliser avec le titulaire avant soumission.

Inventaire **à vérifier sur le binaire et l’hébergement finaux** :

| Données effectivement gérées par Orando                                                       | Usage métier et déclaration à examiner                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Nom, email, identifiants de compte ; téléphone/adresse de tiers lorsqu’ils sont saisis        | Authentification, collaborateurs, clients/fournisseurs ; données généralement liées à l’identité |
| Factures, montants, dettes, modes de règlement, coordonnées bancaires fournisseur éventuelles | Informations financières et, selon le champ, informations de paiement/historique commercial      |
| Photos de justificatifs, PDF, notes et motifs                                                 | Photos, fichiers/documents, autres contenus utilisateur                                          |
| Historique d’actions, auteur, date et éventuelle IP ; journaux d’hébergement                  | Fonctionnement, sécurité et audit ; qualifier précisément les données conservées                 |
| Demandes au support                                                                           | Coordonnées et contenu fournis pour résoudre le problème                                         |

Ce tableau décrit le projet, pas des cases à cocher automatiquement. L’absence de publicité/analytics ne signifie pas absence de collecte : les données sont transmises au serveur et conservées. Déclarer les finalités et le lien à l’utilisateur, examiner les prestataires et distinguer traitement pour compte de l’entreprise et partage au sens de chaque store. Pas de publicité, suivi publicitaire ou SDK analytics prévus. Ne pas annoncer un chiffrement de bout en bout : HTTPS protège le transport, le serveur traite les données. [Confidentialité Apple](https://developer.apple.com/app-store/app-privacy-details/), [Data safety Google](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

**Comptes et suppression.** L’inscription publique existe sur `/inscription` et peut être ouverte dans la WebView. Il faut implémenter un parcours permettant d’initier la suppression du compte depuis l’application et une ressource web adaptée pour Google ; le renvoi actuel vers le support et la simple désactivation ne suffisent pas. Définir le traitement des demandes, les données effacées et la conservation légitime des écritures financières/audits avec l’éditeur, sans promettre de supprimer le registre. Traiter également les espaces personnels, appartenances et responsabilités du propriétaire, et distinguer la suppression du compte de la résiliation chez le fournisseur de l’abonnement. Ce parcours reste un prérequis de publication. [Apple](https://developer.apple.com/support/offering-account-deletion-in-your-app), [Google](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Compléter honnêtement les questionnaires d’âge/contenu et la déclaration Google **Financial features**, même si l’app n’exécute aucun paiement. Décrire le suivi de caisse et la tenue du registre ; ne pas qualifier automatiquement le portefeuille commercial de portefeuille bancaire/crypto. La catégorie « Other » ou l’absence de fonctionnalité réglementée doit être arrêtée selon le questionnaire et le produit final, pas préremplie ici. [Déclaration financière Google](https://support.google.com/googleplay/android-developer/answer/13849271?hl=en).

Pour une diffusion dans l’Union européenne, le titulaire doit déterminer son statut professionnel et fournir les coordonnées vérifiables demandées. Apple peut publier adresse, téléphone et email du professionnel. Aucun statut juridique n’est présumé dans ce dépôt. [Informations DSA Apple](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements).

## 7. Accès des équipes de revue

Préparer une entreprise de démonstration hébergée, distincte des données réelles, avec des comptes de revue stables et les rôles utiles. Les fournir uniquement dans **App Review Information** et **App access**, jamais dans Git, les captures ou la description publique. Le serveur doit rester accessible pendant la revue. [Accès Apple](https://developer.apple.com/app-store/review/guidelines/), [préparation Google](https://support.google.com/googleplay/android-developer/answer/9859455?hl=en).

Notes proposées pour les fonctions actuelles, à compléter après la recette des achats natifs et de la suppression de compte :

> Application de gestion d’entreprise et de finances personnelles. L’inscription gratuite permet de choisir ses espaces ; les collaborateurs peuvent rejoindre une entreprise sur invitation. Les montants métier représentent un registre d’opérations, sans transfert de fonds ni encaissement des cartes des clients. Les identifiants ci-joints donnent accès à une entreprise de démonstration isolée. Depuis Encaisser, enregistrer une entrée fictive ; consulter Journal puis le reçu PDF ; utiliser l’appareil photo pour joindre un justificatif et la feuille de partage pour exporter le document. Les demandes de dépenses nécessitent validation puis paiement par les rôles autorisés. Une connexion Internet est requise.

Avant soumission, ajouter les étapes exactes de l’achat natif et de la restauration de PRO pour le propriétaire, les produits réellement configurés et le parcours de suppression. Ne pas soumettre ces notes comme si ces fonctions étaient déjà implémentées.

Joindre les étapes exactes de connexion et le parcours des fonctions natives, les restrictions de rôle et un justificatif fictif. Tester depuis un nouvel appareil sans session, sans accès VPN ni intervention manuelle du propriétaire.

## 8. Checklist avant publication

- [ ] Identité du titulaire, type de compte, nom définitif et distribution confirmés.
- [ ] Comptes Apple/Google créés, vérifiés et contrats acceptés ; budget de compte validé.
- [ ] Identifiants définitifs réservés ; signature iOS et clé d’envoi Android configurées hors Git.
- [ ] Produits mensuels Apple/Google créés et actifs pour les tests ; achats natifs, validation serveur, notifications et gestion des abonnements implémentés.
- [ ] Achat, restauration, renouvellement, expiration, remboursement et prévention des doubles abonnements testés avec les environnements des boutiques.
- [ ] Version release compilée avec les SDK requis ; `.aab` signé et archive iOS validée.
- [ ] Recette sur iPhone, iPad, Android téléphone et tablette : connexion/déconnexion, rôle, saisie, refus de permission, photo/PDF, partage/impression, réseau coupé, reprise et rotation.
- [ ] Vérification qu’aucun document privé, cookie ou mot de passe n’est journalisé ni partagé avec une autre origine ; fichiers temporaires protégés et nettoyés.
- [ ] Démonstration isolée et accès de revue opérationnels ; données réelles absentes des captures.
- [ ] Politique et support publics finalisés avec identité réelle ; déclarations de collecte, conservation et suppression cohérentes.
- [ ] Suppression de compte disponible dans l’application et via la ressource web requise ; conservation financière et résiliation expliquées.
- [ ] Descriptions et captures correspondent au binaire final ; fonctions natives démontrées pour Apple 4.2.
- [ ] Tests internes/TestFlight terminés ; test fermé Google et demande production si compte personnel concerné.
- [ ] Questionnaires de contenu, âge, confidentialité, chiffrement Apple et fonctionnalités financières Google complétés selon le binaire.
- [ ] Soumission manuelle revue par le titulaire, puis suivi des retours Apple/Google ; publication seulement après leur approbation.

Au **11 octobre 2026**, le titulaire confirme ses comptes Apple individuel et Google Play personnel activés, ainsi que son choix d’achats directement dans l’application. Ces confirmations ne prouvent pas la configuration des consoles. Les achats natifs, la suppression de compte, les signatures et les recettes restent à finaliser. Aucune installation via un store public ne peut être annoncée avant signature, soumission et approbation.
