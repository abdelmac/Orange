# Validation des versions mobiles

État au **16 septembre 2026**. Les projets sont reliés au serveur HTTPS existant ; aucune donnée financière de test n’a été créée dans la production pendant ce travail. Il s’agit d’une préparation technique à la publication, pas d’une disponibilité dans les boutiques.

## Vérifications exécutées

Le [workflow final est réussi](https://github.com/abdelmac/Orange/actions/runs/35139516655) pour la source `e4fdb113765d6a78bae83d3d123d077b99b0f63c` : deux jobs verts, Android et iOS. Les commits de documentation qui suivent ne changent pas les binaires.

| Vérification    | Résultat constaté                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application web | TypeScript, ESLint, 29 tests unitaires et build de production réussis                                                                                                                                               |
| Pages publiques | Assistance, confidentialité et connexion contrôlées à 390, 768 et 1440 px ; liens fonctionnels, aucun débordement horizontal ni erreur JavaScript                                                                   |
| Android         | Compilation debug/release, six tests JUnit, lint, APK de développement et AAB release réussis dans le job [104940542242](https://github.com/abdelmac/Orange/actions/runs/35139516655/job/104940542242)              |
| iOS simulateur  | Compilation, installation, lancement et neuf tests XCTest réussis dans le job [104940541888](https://github.com/abdelmac/Orange/actions/runs/35139516655/job/104940541888)                                          |
| iOS appareil    | Configuration Release compilée avec le SDK iphoneos dans le même job ; signature de distribution non configurée                                                                                                     |
| Connexion iOS   | Un test XCUITest réussi en 20,8 secondes : champs email/mot de passe présents et bouton de connexion actif dans WKWebView ; capture exportée et examinée visuellement. Aucun identifiant saisi ni formulaire soumis |
| Revue native    | Origine HTTPS exacte, appels API limités, calculs textuels/décimaux, reprise idempotente, purge des sessions, téléchargements privés bornés et sans redirection examinés                                            |

Les correctifs relevés pendant la revue et les premières compilations sont intégrés : reprise après rotation Android, conservation du corps d’une tentative incertaine, détection des déconnexions SPA, rejet des anciennes réponses iOS après changement d’utilisateur, téléchargement des justificatifs image et rapports PDF, compatibilité Android 8.0 et suppression du doublon de navigation web/native. Les onglets iOS Accueil et Journal rechargent les données du serveur à leur sélection après une saisie native.

## Artefacts Android disponibles

L’archive du job Android contient `apk/debug/app-debug.apk` et `bundle/release/app-release.aab`. Elle est disponible dans les [artefacts du run](https://github.com/abdelmac/Orange/actions/runs/35136942069) jusqu’au 30 septembre 2026 selon la conservation configurée. Une connexion GitHub peut être nécessaire pour télécharger ; le workflow peut être relancé ensuite.

Une copie vérifiée est conservée localement hors Git sous `.local/mobile-artifacts/a319e1a/android/`, avec une copie identique nommée `.local/mobile-artifacts/Orange-Finance-Android-test.apk` pour les essais. SHA-256 de l’APK : `fe9d01b0d16f8f8ecd628cc99799f3c80aa8133f4e7519d4c4cc09f436b17a86`. La somme de l’archive téléchargée a aussi été comparée à celle fournie par GitHub. Le code Android n’a pas changé dans les commits iOS suivants.

L’APK est signé avec une **clé de développement** du runner ; l’AAB est **non signé**. Ils ne sont pas publiables en l’état. Une clé de développement peut changer entre builds : désinstaller l’ancienne version d’essai peut être nécessaire avant d’installer un autre build ou la future version des boutiques. Les données métier restent sur le serveur ; ces essais doivent utiliser une entreprise et un compte de test.

## Artefact iOS disponible

L’application pour simulateur du [run final réussi](https://github.com/abdelmac/Orange/actions/runs/35139516655) est aussi conservée localement dans `.local/mobile-artifacts/e4fdb11/ios/OrangeFinance-simulator.zip`, après vérification de la somme de l’archive GitHub. Ce fichier s’installe uniquement dans un simulateur iOS sur Mac. Il ne s’agit pas d’un IPA signé pour iPhone, TestFlight ou l’App Store.

Le même run contient les rapports XCTest et la capture réelle de connexion dans `ios-ui-screenshots`. La copie locale est dans `.local/mobile-artifacts/e4fdb11/capture/`. La capture montre le formulaire chargé dans l’application native, sans données privées. Les visuels finaux des fiches doivent encore montrer les fonctions métier avec des données de démonstration.

## Limites de cette validation

Les tests JUnit/XCTest couvrent les montants, origines, chemins autorisés et protections du pont web. Le cycle financier serveur avait été validé dans le MVP ; ce travail n’a pas rejoué ce cycle sur des appareils physiques. La capture photo, le partage avec les applications installées, l’impression, les pertes de réseau pendant une écriture et le parcours complet multi-rôles doivent encore être contrôlés sur Android, iPhone et iPad avec des données isolées. La compilation ne suffit pas à valider ces interactions matérielles.

Les pages `/assistance` et `/confidentialite` passent les tests locaux mais restent à déployer : l’authentification Render disponible a expiré et retourne 401. Aucune migration n’est ajoutée par les clients mobiles.

La [checklist boutiques](STORES.md#8-checklist-avant-publication) reste applicable : comptes développeur absents, identité juridique et mode de distribution à confirmer, signature de distribution, politique finale et traitement des demandes de suppression, environnement de revue, captures, essais et approbation des boutiques. L’adresse de support confirmée est `ennearock@gmail.com`.
