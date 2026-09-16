# Publication App Store et Google Play

Vérification documentaire : **16 septembre 2026**. Ce dossier prépare la publication ; il ne constitue ni une soumission ni une approbation des stores. L’utilisateur a confirmé ne posséder aucun compte développeur Apple/Google. Contact de support confirmé : **ennearock@gmail.com**. Le nom juridique de l’éditeur, son adresse et ses comptes développeur restent à fournir.

Le nom proposé est **Orange Finance**, avec l’identifiant provisoire `com.ennearock.orangefinance`. Le propriétaire doit confirmer le nom, les droits sur la marque et l’identifiant avant le premier envoi. Les valeurs non confirmées sont explicites dans [listing.fr-FR.draft.json](listing.fr-FR.draft.json) ; ne pas importer ce brouillon automatiquement dans un store.

## 1. Choisir la distribution

Les projets et preuves de compilation sont décrits dans [VALIDATION.md](VALIDATION.md). Les [visuels fournis](assets/README.md) comprennent les icônes et la bannière Google Play ; les captures de fiche doivent être faites sur les versions réellement exécutées avec des données de démonstration.

La préparation vise par défaut une fiche publique, conformément à la demande de présence sur les deux stores. La connexion reste réservée aux utilisateurs créés par leur entreprise : rendre l’application publique ne rend pas les données publiques.

| Besoin                                                                    | Apple                                                                            | Android                                                                                                                           |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Application téléchargeable par tout le monde, accès métier sur invitation | App Store public, description annonçant le compte professionnel requis           | Google Play public, même précision                                                                                                |
| Collaborateurs uniquement, appareils gérés                                | Custom App privée vers les organisations Apple Business/School Manager désignées | Application privée Managed Google Play, organisations et gestion EMM configurées                                                  |
| Lien accessible sur appareils personnels, sans recherche publique         | Distribution Apple non répertoriée, sur demande après soumission                 | Choisir le public ou Managed Google Play selon l’environnement ; une piste de test ne remplace pas une distribution de production |

Chez Apple, un lien non répertorié peut être transmis : l’authentification reste indispensable. Le passage privé/public après approbation exige un nouvel enregistrement d’application, sauf passage public vers non répertorié. Décider avant la soumission. [Distribution Apple](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods), [distribution Android d’entreprise](https://support.google.com/googleplay/work/answer/10637198?hl=en), [applications privées Managed Google Play](https://support.google.com/work/android/answer/9563481?hl=en).

## 2. Comptes, identité et signature indispensables

| Élément                      | Apple                                                                                                                | Google Play                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Compte à créer               | Apple Developer Program, Apple Account avec double authentification                                                  | Play Console, identité et coordonnées vérifiées                                   |
| Tarif officiel indicatif     | **99 USD par an**, prix local proposé à l’inscription                                                                | **25 USD une fois** pour le compte Play Console public                            |
| Publication pour une société | Entité juridique, représentant habilité, D-U-N-S sauf exception officielle, site et coordonnées de l’organisation    | Compte Organisation pour l’entreprise ; D-U-N-S et vérification de l’organisation |
| Identité de signature        | Team ID, App ID explicite, certificat Apple Distribution et profil App Store Connect, ou signature automatique Xcode | Identifiant de package final, clé d’envoi protégée et Play App Signing            |
| Artefact à publier           | Archive de distribution iOS signée, transmise à App Store Connect                                                    | Android App Bundle `.aab` de release signé pour l’envoi                           |

Les prix et pièces nécessaires proviennent de [l’inscription Apple](https://developer.apple.com/programs/enroll/), [l’inscription Google Play](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en) et [du choix du compte Google](https://support.google.com/googleplay/android-developer/answer/13634885?hl=en). Ils n’incluent pas l’hébergement existant ni un éventuel Mac/service de compilation. Ne pas choisir un compte personnel uniquement pour éviter une vérification d’entreprise.

La signature iOS peut être gérée par Xcode ; elle exige toujours une équipe et un App ID autorisés. Google Play requiert l’AAB et Play App Signing pour les nouvelles applications publiques. Conserver les clés et secrets dans le coffre de l’éditeur ou les secrets CI, jamais dans Git. Une compilation CI non signée ne remplace pas ces prérequis. [Profil Apple](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile), [AAB](https://developer.android.com/guide/app-bundle), [signature Play](https://developer.android.com/guide/app-bundle/faq).

Si un **compte Google personnel créé après le 13 novembre 2023** est retenu, prévoir un test fermé avec **au moins 12 testeurs inscrits continuellement pendant 14 jours**, puis une demande d’accès à la production. Le délai ne garantit pas l’acceptation automatique. [Exigences Google pour les nouveaux comptes personnels](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB).

## 3. Exigences techniques de soumission

- **Apple : Xcode 26 ou ultérieur avec SDK iOS/iPadOS 26 ou ultérieur**, obligatoire depuis le 28 avril 2026. La compilation et l’archivage iOS nécessitent un environnement macOS/Xcode local ou CI. Le SDK de compilation n’impose pas à lui seul de limiter les utilisateurs à iOS 26. [Exigences Apple](https://developer.apple.com/news/upcoming-requirements/).
- **Google Play : Android 16, `targetSdkVersion` 36 ou supérieur**, pour les nouvelles apps et mises à jour depuis le 31 août 2026. Ne pas prendre une éventuelle prolongation comme configuration cible de cette nouvelle app. [API cible Google Play](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).
- Vérifier la compatibilité avec les pages mémoire Android de **16 Ko**, y compris les bibliothèques natives transitives si le binaire en contient. [Compatibilité Android](https://developer.android.com/guide/practices/page-sizes).
- Tester les permissions caméra/photos au moment de l’action, le refus de permission, le sélecteur système de fichiers et le partage PDF. Pour joindre ponctuellement un justificatif, utiliser les sélecteurs système ; ne pas demander l’accès global aux fichiers ou à toute la photothèque. [Photos Google](https://support.google.com/googleplay/android-developer/answer/15800983?hl=en), [accès aux fichiers](https://support.google.com/googleplay/android-developer/answer/10467955?hl=en).
- Examiner l’archive iOS finale, les SDK inclus et les API à justification obligatoire ; compléter le manifeste de confidentialité selon les usages réels. Les déclarations de la fiche et celles du binaire doivent correspondre. [Manifestes Apple](https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests).

Architecture retenue pour ce projet : Android Kotlin/WebView et iOS Swift/WKWebView, navigation native, saisie d’encaissement native, capture de justificatifs et partage/impression des PDF privés. Le serveur HTTPS existant conserve l’authentification et les contrôles métier. Ces fonctions doivent être démontrées sur le binaire livré ; leur simple mention dans ce document n’atteste pas leur validation.

**Apple 4.2 :** une page web simplement réemballée peut être refusée. Montrer une utilité mobile réelle : saisie native utilisable au clavier, retour/navigation adaptés, photo attachée à une opération et partage natif d’un reçu authentifié. Ce sont des choix produit, pas une liste officielle garantissant l’acceptation. Aucun changement distant ne doit masquer des fonctions à la revue. [App Review Guidelines, 4.2 et 2.3](https://developer.apple.com/app-store/review/guidelines/).

## 4. Fiche française proposée

Ces textes sont un **brouillon à confronter au binaire final**. Ils ne promettent ni traitement bancaire, ni paiement par carte, ni comptabilité certifiée, ni fonctionnement financier hors connexion.

| Champ                         | Proposition                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| Nom                           | Orange Finance                                                                                     |
| Sous-titre Apple              | Caisse, dépenses et reçus                                                                          |
| Description courte Google     | Suivez encaissements, dépenses et caisses avec votre équipe.                                       |
| Catégorie principale proposée | Économie et entreprise / Business                                                                  |
| Langue initiale               | Français (`fr-FR`)                                                                                 |
| Support confirmé              | `ennearock@gmail.com`                                                                              |
| Prix proposé                  | Téléchargement gratuit ; accès métier fourni par l’entreprise, à confirmer                         |
| Public visé                   | Collaborateurs d’entreprises disposant déjà d’un compte ; pas une application destinée aux enfants |

Nom et sous-titre Apple sont limités à 30 caractères. Google autorise 30 caractères pour le nom, 80 pour la description courte et 4 000 pour la description complète. [Champs Apple](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information), [fiche Google](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en).

### Description complète

Orange Finance accompagne les équipes dans le suivi quotidien de l’argent de leur entreprise. Un compte professionnel fourni par votre administrateur est nécessaire.

Enregistrez un encaissement avec ou sans facture, retrouvez les opérations dans le journal quotidien et consultez les montants disponibles dans vos caisses ou votre portefeuille commercial. Le nom de la personne et le motif identifient chaque saisie ; le téléphone reste facultatif.

Créez des demandes de dépenses, ajoutez un justificatif et suivez leur validation puis leur paiement. Les accès dépendent des autorisations attribuées par l’entreprise : administrateur, responsable, comptable, caissier, commercial ou employé.

Retrouvez vos clients, ventes, factures et paiements partiels. Téléchargez les reçus PDF et consultez l’historique des mouvements. Les corrections financières conservent la trace de l’opération initiale et de son annulation.

Une connexion Internet est nécessaire. Orange Finance enregistre les opérations déclarées par votre entreprise ; l’application n’exécute pas de virements bancaires et ne traite pas les paiements par carte. Les fonctionnalités visibles varient selon votre rôle.

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

| Données effectivement gérées par Orange                                                       | Usage métier et déclaration à examiner                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Nom, email, identifiants de compte ; téléphone/adresse de tiers lorsqu’ils sont saisis        | Authentification, collaborateurs, clients/fournisseurs ; données généralement liées à l’identité |
| Factures, montants, dettes, modes de règlement, coordonnées bancaires fournisseur éventuelles | Informations financières et, selon le champ, informations de paiement/historique commercial      |
| Photos de justificatifs, PDF, notes et motifs                                                 | Photos, fichiers/documents, autres contenus utilisateur                                          |
| Historique d’actions, auteur, date et éventuelle IP ; journaux d’hébergement                  | Fonctionnement, sécurité et audit ; qualifier précisément les données conservées                 |
| Demandes au support                                                                           | Coordonnées et contenu fournis pour résoudre le problème                                         |

Ce tableau décrit le projet, pas des cases à cocher automatiquement. L’absence de publicité/analytics ne signifie pas absence de collecte : les données sont transmises au serveur et conservées. Déclarer les finalités et le lien à l’utilisateur, examiner les prestataires et distinguer traitement pour compte de l’entreprise et partage au sens de chaque store. Pas de publicité, suivi publicitaire ou SDK analytics prévus. Ne pas annoncer un chiffrement de bout en bout : HTTPS protège le transport, le serveur traite les données. [Confidentialité Apple](https://developer.apple.com/app-store/app-privacy-details/), [Data safety Google](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

**Comptes et suppression.** Pas d’inscription publique, comptes créés par l’administrateur. Il faut toutefois vérifier si le parcours natif/WebView permet une création de compte, notamment via Utilisateurs. Ne pas déduire une exemption de la seule absence d’écran « S’inscrire ». Si la création est dans le périmètre, Apple exige un parcours pour initier la suppression ; Google demande aussi une ressource web. La simple désactivation ne suffit pas. Définir traitement des demandes, données effacées et conservation légitime des écritures financières/audits avec l’éditeur, sans promettre de supprimer le registre. Google documente une exception pour les applications durablement privées et celles de gestion d’appareils d’entreprise ; ce n’est pas une exemption générale pour toute fiche publique B2B. [Apple](https://developer.apple.com/support/offering-account-deletion-in-your-app), [Google](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Compléter honnêtement les questionnaires d’âge/contenu et la déclaration Google **Financial features**, même si l’app n’exécute aucun paiement. Décrire le suivi de caisse et la tenue du registre ; ne pas qualifier automatiquement le portefeuille commercial de portefeuille bancaire/crypto. La catégorie « Other » ou l’absence de fonctionnalité réglementée doit être arrêtée selon le questionnaire et le produit final, pas préremplie ici. [Déclaration financière Google](https://support.google.com/googleplay/android-developer/answer/13849271?hl=en).

Pour une diffusion dans l’Union européenne, le titulaire doit déterminer son statut professionnel et fournir les coordonnées vérifiables demandées. Apple peut publier adresse, téléphone et email du professionnel. Aucun statut juridique n’est présumé dans ce dépôt. [Informations DSA Apple](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements).

## 7. Accès des équipes de revue

Préparer une entreprise de démonstration hébergée, distincte des données réelles, avec des comptes de revue stables et les rôles utiles. Les fournir uniquement dans **App Review Information** et **App access**, jamais dans Git, les captures ou la description publique. Le serveur doit rester accessible pendant la revue. [Accès Apple](https://developer.apple.com/app-store/review/guidelines/), [préparation Google](https://support.google.com/googleplay/android-developer/answer/9859455?hl=en).

Notes proposées, à adapter après recette :

> Application de gestion interne pour les collaborateurs d’une entreprise. Les comptes sont provisionnés par son administrateur ; aucune inscription ou souscription n’est vendue dans l’application. Les montants représentent un registre d’opérations, sans transfert de fonds ni traitement de carte bancaire. Les identifiants ci-joints donnent accès à une entreprise de démonstration isolée. Depuis Encaisser, enregistrer une entrée fictive ; consulter Journal puis le reçu PDF ; utiliser l’appareil photo pour joindre un justificatif et la feuille de partage pour exporter le document. Les demandes de dépenses nécessitent validation puis paiement par les rôles autorisés. Une connexion Internet est requise.

Joindre les étapes exactes de connexion et le parcours des fonctions natives, les restrictions de rôle et un justificatif fictif. Tester depuis un nouvel appareil sans session, sans accès VPN ni intervention manuelle du propriétaire.

## 8. Checklist avant publication

- [ ] Identité du titulaire, type de compte, nom définitif et distribution confirmés.
- [ ] Comptes Apple/Google créés, vérifiés et contrats acceptés ; budget de compte validé.
- [ ] Identifiants définitifs réservés ; signature iOS et clé d’envoi Android configurées hors Git.
- [ ] Version release compilée avec les SDK requis ; `.aab` signé et archive iOS validée.
- [ ] Recette sur iPhone, iPad, Android téléphone et tablette : connexion/déconnexion, rôle, saisie, refus de permission, photo/PDF, partage/impression, réseau coupé, reprise et rotation.
- [ ] Vérification qu’aucun document privé, cookie ou mot de passe n’est journalisé ni partagé avec une autre origine ; fichiers temporaires protégés et nettoyés.
- [ ] Démonstration isolée et accès de revue opérationnels ; données réelles absentes des captures.
- [ ] Politique et support publics finalisés avec identité réelle ; déclarations de collecte, conservation et suppression cohérentes.
- [ ] Descriptions et captures correspondent au binaire final ; fonctions natives démontrées pour Apple 4.2.
- [ ] Tests internes/TestFlight terminés ; test fermé Google et demande production si compte personnel concerné.
- [ ] Questionnaires de contenu, âge, confidentialité, chiffrement Apple et fonctionnalités financières Google complétés selon le binaire.
- [ ] Soumission manuelle revue par le titulaire, puis suivi des retours Apple/Google ; publication seulement après leur approbation.

À ce stade, **les comptes et signatures ne sont pas disponibles**. La documentation, les projets natifs et les builds de contrôle peuvent être préparés ; aucune installation via un store public ne peut être annoncée avant signature, soumission et approbation.
