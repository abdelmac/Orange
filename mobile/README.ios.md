# Orange Finance pour iPhone et iPad

Application UIKit/Swift pour iOS 16 et ultérieur, à compiler avec Xcode 26. Le serveur utilisé est exclusivement `https://orange-finance.onrender.com`. Aucun secret, mot de passe de démonstration ou jeton de connexion n’est intégré au binaire.

## Fonctions natives

- Onglets Accueil, Encaisser, Journal et Plus, zones de sécurité iPhone/iPad et tailles de texte système.
- Formulaire d’encaissement natif : validation textuelle précise du montant français, choix du payeur et du mode de règlement, caisses actives autorisées ou portefeuille personnel du commercial.
- Confirmation avant écriture, réponse réelle du serveur et numéro d’opération. Une reprise conserve exactement les données et l’UUID d’idempotence pendant la vie du formulaire. Un résultat annulé reste présenté comme annulé.
- Téléchargement privé des reçus PDF et justificatifs PDF/JPEG/PNG/WebP, partage système et impression explicites. Le téléchargement est borné à 20 Mo, y compris sans Content-Length. L’impression est proposée seulement si iOS reconnaît le document comme imprimable.
- Après encaissement, bouton vers la fiche permettant de photographier ou choisir un justificatif avec le sélecteur système de WKWebView. Seule l’autorisation caméra est demandée ; aucun accès global à la photothèque, aux contacts, à la localisation ou au microphone.
- Écran natif de reprise en cas d’échec réseau et masquage des informations dans le sélecteur d’applications.

## Installation et compilation sur Mac

Prérequis : macOS compatible, Xcode 26 et ses outils de ligne de commande, simulateur iOS installé, XcodeGen (`brew install xcodegen`). Aucun CocoaPod ni SDK tiers n’est nécessaire.

```sh
cd mobile/ios
xcodegen generate
xcodebuild -project OrangeFinance.xcodeproj -scheme OrangeFinance \
  -sdk iphonesimulator -configuration Debug \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= build
xcodebuild -project OrangeFinance.xcodeproj -scheme OrangeFinanceTests \
  -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= test
xcodebuild -project OrangeFinance.xcodeproj -scheme OrangeFinance \
  -sdk iphoneos -configuration Release CODE_SIGNING_ALLOWED=NO build
```

Adapter le nom du simulateur à `xcrun simctl list devices available`. Le projet Xcode est généré à partir de `project.yml` et n’est pas versionné. L’icône opaque 1024×1024 est dans `OrangeFinance/Assets.xcassets/AppIcon.appiconset/`.

Identifiant provisoire : `com.ennearock.orangefinance`. Version 1.0.0, build 1. Le simulateur utilise une signature ad hoc locale (`-`), sans compte Apple ni certificat de distribution. Pour signer un build destiné à un appareil plus tard, configurer l’équipe dans Xcode ou ajouter `DEVELOPMENT_TEAM="$APPLE_TEAM_ID"` à la commande ; aucun identifiant d’équipe n’est imposé dans le dépôt. Le build `iphoneos` sans signature valide la compilation, mais ne produit pas une application distribuable sur un iPhone réel. Il faut un Mac/Xcode pour les tests natifs ; Windows ne peut pas valider leur compilation.

## Sécurité et sessions

La connexion reste la page `/login` sécurisée. Les WebViews partagent le même `WKWebsiteDataStore` et les cookies HttpOnly du serveur. Le formulaire utilise `WKWebView.callAsyncJavaScript` dans le cadre principal et le monde `.page`, avec arguments structurés, sans interpolation de données dans JavaScript. Les seuls appels natifs autorisés sont `GET /api/me`, `GET /api/cash-accounts`, `POST /api/quick-entries` et `POST /api/auth/logout`. Le `fetch` de même origine conserve les cookies et envoie automatiquement l’Origin du POST pour la protection CSRF ; les autorisations effectives restent contrôlées par le serveur.

La navigation intégrée exige HTTPS, l’hôte exact, le port 443 et aucun identifiant URL. Les liens externes HTTP(S), téléphone ou email ne s’ouvrent qu’après un clic et une confirmation système native. Les fenêtres arbitraires, schémas `javascript:`/`file:` et redirections de téléchargement sont refusés. ATS et la validation TLS système restent actifs, sans exception ni certificat accepté manuellement.

Les téléchargements WKDownload sont interceptés puis transférés par un URLSession éphémère pour contrôler chaque fragment et sa taille avant écriture. Seul le cookie `orange_session`, sécurisé, non expiré, de l’hôte exact et du chemin `/`, est copié pour ces GET autorisés. Aucun cookie n’est envoyé après une redirection. MIME et signature PDF/image sont vérifiés. Les noms distants sont ignorés au profit d’UUID, dans un sous-dossier fixe de Caches protégé par le verrouillage iOS et exclu des sauvegardes. Les fichiers sont effacés après partage/impression, à la connexion/changement de session/déconnexion et au lancement. Le partage explicite peut créer une copie hors de l’application que celle-ci ne peut plus supprimer.

La déconnexion native est bloquée pendant une écriture active et demande une confirmation supplémentaire si sa réponse est incertaine. Une déconnexion supprime les documents privés, champs du formulaire, pages WebView et historiques de navigation. La perte de cookie, une réponse 401, la navigation SPA vers `/login` et la vérification lors du retour au premier plan ou d’un changement d’onglet contribuent à détecter l’expiration. Hors réseau, la déconnexion locale reste possible ; la révocation distante dépend de la réussite de la requête au serveur.

Il n’existe aucune file d’écritures hors ligne ni reprise automatique. Après fermeture forcée, redémarrage ou expiration de session, la clé en mémoire disparaît : vérifier le journal avant de saisir à nouveau une opération dont la réponse était incertaine. Le chargement des caisses est paginé et refuse explicitement une liste dépassant 10 000 lignes.

## Confidentialité et vérification

`PrivacyInfo.xcprivacy` décrit les catégories fonctionnelles envoyées au serveur : identité, coordonnées, identifiant utilisateur, données financières et justificatifs. Aucun suivi publicitaire, analyse d’usage ou SDK tiers n’est ajouté. La liste Required Reason APIs est vide : le code n’emploie ni UserDefaults, horodatages de fichiers, espace disque, ni temps depuis le démarrage. Le manifeste ne remplace pas les déclarations et la politique de confidentialité à fournir dans App Store Connect.

Les tests XCTest couvrent la politique d’origine, les chemins API/document, les cookies transmis, le montant sans flottants et le refus d’appels sans page de confiance. Compléter sur simulateur puis appareil réel : connexion pour chaque rôle, saisie commerciale et caissier, échec réseau après validation, reprise sans doublon, photo d’un justificatif, PDF et image, impression/partage iPad, changement d’utilisateur, expiration et retour arrière après déconnexion. Les tests de compilation CI ne prouvent pas à eux seuls ces scénarios matériels.

Le schéma distinct `OrangeFinanceUITests` vérifie le chargement réel de la connexion distante dans WKWebView sur un simulateur sans session. Il attend au maximum 120 secondes les champs email/mot de passe et le bouton « Se connecter » actif, sans saisir d’identifiants ni soumettre le formulaire. Une capture est conservée dans le résultat XCTest, même en cas de succès. Ce test exige un réseau fonctionnel et le serveur disponible ; conserver une limite d’exécution XCTest supérieure au délai d’attente :

```sh
xcodebuild -project OrangeFinance.xcodeproj -scheme OrangeFinanceUITests \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -resultBundlePath build/LoginUI.xcresult -parallel-testing-enabled NO \
  -test-timeouts-enabled YES -default-test-execution-time-allowance 180 \
  -maximum-test-execution-time-allowance 180 \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= test
```

Un compte Apple Developer, la signature, App Store Connect et la revue Apple restent nécessaires pour une distribution publique. L’acceptation en boutique n’est pas garantie par la présence des fonctions natives. Aucun IPA signé ni publication n’est annoncé par ce projet.

Références Apple : [callAsyncJavaScript](<https://developer.apple.com/documentation/webkit/wkwebview/callasyncjavascript(_:arguments:in:contentworld:completionhandler:)>), [WKDownloadDelegate](https://developer.apple.com/documentation/webkit/wkdownloaddelegate), [partage système](https://developer.apple.com/documentation/uikit/uiactivityviewcontroller), [impression](https://developer.apple.com/documentation/uikit/uiprintinteractioncontroller), [caméra](https://developer.apple.com/documentation/bundleresources/information-property-list/nscamerausagedescription), [Required Reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api).
