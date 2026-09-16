# Validation des versions mobiles

État au **16 septembre 2026**. Les projets sont reliés au serveur HTTPS existant ; aucune donnée financière de test n’a été créée dans la production pendant ce travail. Il s’agit d’une préparation technique à la publication, pas d’une disponibilité dans les boutiques.

## Vérifications exécutées

| Vérification    | Résultat constaté                                                                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application web | TypeScript, ESLint, 29 tests unitaires et build de production réussis                                                                                                                                                                                     |
| Pages publiques | Assistance, confidentialité et connexion contrôlées à 390, 768 et 1440 px ; liens fonctionnels, aucun débordement horizontal ni erreur JavaScript                                                                                                         |
| Android         | Compilation debug/release, six tests JUnit, lint, APK de développement et AAB release réussis dans le job [104931754629](https://github.com/abdelmac/Orange/actions/runs/35136942069/job/104931754629), source `a319e1a8c5651c432c49b5c5e053df1a3e2275b4` |
| iOS simulateur  | Compilation, installation, lancement et neuf tests XCTest réussis dans le job [104934055998](https://github.com/abdelmac/Orange/actions/runs/35137633799/job/104934055998), source `4e801c5edc6dc48577f004b0ab45c2b955471db1`                             |
| iOS appareil    | Configuration Release compilée avec le SDK iphoneos dans le même job ; signature de distribution non configurée                                                                                                                                           |
| Revue native    | Origine HTTPS exacte, appels API limités, calculs textuels/décimaux, reprise idempotente, purge des sessions, téléchargements privés bornés et sans redirection examinés                                                                                  |

Les correctifs relevés pendant la revue et les premières compilations sont intégrés : reprise après rotation Android, conservation du corps d’une tentative incertaine, détection des déconnexions SPA, rejet des anciennes réponses iOS après changement d’utilisateur, téléchargement des justificatifs image et rapports PDF, compatibilité Android 8.0 et suppression du doublon de navigation web/native. Les onglets iOS Accueil et Journal rechargent les données du serveur à leur sélection après une saisie native.

## Artefacts Android disponibles

L’archive du job Android contient `apk/debug/app-debug.apk` et `bundle/release/app-release.aab`. Elle est disponible dans les [artefacts du run](https://github.com/abdelmac/Orange/actions/runs/35136942069) jusqu’au 30 septembre 2026 selon la conservation configurée. Une connexion GitHub peut être nécessaire pour télécharger ; le workflow peut être relancé ensuite.

Une copie vérifiée est conservée localement hors Git sous `.local/mobile-artifacts/a319e1a/android/`, avec une copie identique nommée `.local/mobile-artifacts/Orange-Finance-Android-test.apk` pour les essais. SHA-256 de l’APK : `fe9d01b0d16f8f8ecd628cc99799f3c80aa8133f4e7519d4c4cc09f436b17a86`. La somme de l’archive téléchargée a aussi été comparée à celle fournie par GitHub. Le code Android n’a pas changé dans les commits iOS suivants.

L’APK est signé avec une **clé de développement** du runner ; l’AAB est **non signé**. Ils ne sont pas publiables en l’état. Une clé de développement peut changer entre builds : désinstaller l’ancienne version d’essai peut être nécessaire avant d’installer un autre build ou la future version des boutiques. Les données métier restent sur le serveur ; ces essais doivent utiliser une entreprise et un compte de test.

## Artefact iOS disponible

L’application pour simulateur du [run réussi](https://github.com/abdelmac/Orange/actions/runs/35137633799) est aussi conservée localement dans `.local/mobile-artifacts/4e801c5/ios/OrangeFinance-simulator.zip`, après vérification de la somme de l’archive GitHub. Ce fichier s’installe uniquement dans un simulateur iOS sur Mac. Il ne s’agit pas d’un IPA signé pour iPhone, TestFlight ou l’App Store. La première capture automatisée montrait encore le chargement web ; elle ne constitue pas une capture de fiche boutique.

## Limites de cette validation

Les tests JUnit/XCTest couvrent les montants, origines, chemins autorisés et protections du pont web. Le cycle financier serveur avait été validé dans le MVP ; ce travail n’a pas rejoué ce cycle sur des appareils physiques. La capture photo, le partage avec les applications installées, l’impression, les pertes de réseau pendant une écriture et le parcours complet multi-rôles doivent encore être contrôlés sur Android, iPhone et iPad avec des données isolées. La compilation ne suffit pas à valider ces interactions matérielles.

Les pages `/assistance` et `/confidentialite` passent les tests locaux mais restent à déployer : l’authentification Render disponible a expiré et retourne 401. Aucune migration n’est ajoutée par les clients mobiles.

La [checklist boutiques](STORES.md#8-checklist-avant-publication) reste applicable : comptes développeur absents, identité juridique et mode de distribution à confirmer, signature de distribution, politique finale et traitement des demandes de suppression, environnement de revue, captures, essais et approbation des boutiques. L’adresse de support confirmée est `ennearock@gmail.com`.
