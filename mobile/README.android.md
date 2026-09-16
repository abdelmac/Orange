# Orange Finance — Android

Application native Kotlin pour Android 8 et versions suivantes, identifiant `com.ennearock.orangefinance`, version `1.0.0` (code `1`). L’application se connecte exclusivement à `https://orange-finance.onrender.com`.

La navigation Accueil / Encaisser / Journal / Plus est native. Encaisser contient un véritable formulaire Android d’encaissement : montant exact, tiers, motif, mode, caisse autorisée ou portefeuille personnel du commercial, téléphone facultatif. Les autres modules restent accessibles avec leur interface web responsive et leurs permissions serveur. Les PDF et justificatifs peuvent être ouverts ou partagés avec une autre application sur demande ; le sélecteur système permet de joindre une image, un PDF ou une photo prise avec l’application photo du téléphone.

## Compiler

Prérequis : JDK 17, Android SDK Platform 36, Android SDK Build-Tools 35.0.0, Android SDK Command-line Tools. Android Studio peut installer ces composants. Définir `ANDROID_HOME` ou `sdk.dir` dans un `local.properties` local non versionné.

```sh
cd mobile/android
./gradlew testDebugUnitTest lintDebug assembleDebug bundleRelease
```

Sous Windows, utiliser `gradlew.bat`. Le wrapper Gradle 8.13 est contrôlé par le SHA-256 de sa distribution. Le projet utilise AGP 8.13.2, Kotlin 2.1.21, AndroidX WebKit 1.14.0 et Java 17. Les dépendances proviennent de Google Maven, Maven Central et du portail Gradle.

Artefacts :

- APK de développement : `app/build/outputs/apk/debug/app-debug.apk`.
- Bundle de publication : `app/build/outputs/bundle/release/app-release.aab`.
- Rapports : `app/build/reports/tests/testDebugUnitTest/` et `app/build/reports/lint-results-debug.html`.

La CI `.github/workflows/mobile.yml` compile et conserve les artefacts. Un bundle sans variables de signature reste **non signé** et ne peut pas être publié tel quel. Le projet ne contient aucune clé de publication.

## Signature de publication

Configurer ensemble, uniquement dans l’environnement de compilation ou les secrets CI :

```text
ANDROID_KEYSTORE_PATH
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Le chemin désigne un keystore privé extérieur au dépôt. Fournir une configuration partielle arrête la compilation. Le compte Google Play, la clé de signature, la fiche boutique, la politique de confidentialité et la validation sur téléphones réels sont nécessaires avant publication. Aucun envoi en boutique n’est effectué par ce projet.

## Session, opérations et confidentialité

- Les identifiants sont saisis dans la page HTTPS `/login`. Les cookies de session restent gérés par WebView. Aucun mot de passe n’est stocké par le code natif.
- Le formulaire appelle l’API depuis la page de la même origine avec `fetch`, `credentials: same-origin`, `redirect: error`. Les protections CSRF, RBAC et entreprise du serveur continuent de s’appliquer.
- La passerelle `WebViewCompat.addWebMessageListener` accepte uniquement l’origine exacte, le cadre principal et une réponse avec nonce créé par Android. Elle n’expose aucune commande native aux pages.
- Le montant utilise `BigDecimal` et une chaîne décimale. La clé UUID d’idempotence reste identique lors d’une nouvelle tentative. Aucune écriture n’est mise en file d’attente hors connexion, ni rejouée automatiquement.
- Les formulaires et réponses ne sont pas enregistrés sur disque. Une fermeture du processus abandonne la saisie ; consulter le journal si une demande a pu atteindre le serveur avant l’interruption.
- Cookies tiers, HTTP, contenu mixte, accès aux fichiers locaux, nouvelles fenêtres automatiques et erreurs de certificat sont refusés. Les liens externes HTTPS/téléphone/email exigent une action utilisateur et une confirmation. Le débogage WebView est désactivé en release.
- Les PDF sont limités aux routes de reçus, factures, justificatifs et exports PDF explicitement autorisés de cette origine. Seul le cookie de session est envoyé, les redirections sont refusées, les téléchargements sont plafonnés à 20 Mo et les PDF doivent commencer par `%PDF-`.
- Les fichiers restent dans des sous-dossiers privés du cache. Le partage utilise FileProvider avec une autorisation de lecture temporaire. Ce cache est purgé au lancement et à la déconnexion. Une application choisie explicitement pour le partage peut conserver sa propre copie.
- La sauvegarde et le transfert des données sont désactivés. `FLAG_SECURE` masque les captures et l’aperçu du sélecteur d’applications.
- La photo utilise l’application photo du système, sans permission caméra demandée par Orange Finance. Aucun accès général au stockage n’est demandé. Les justificatifs sélectionnés sont copiés dans un cache privé et limités à 10 Mo, puis revérifiés par le serveur.

## Vérification avant livraison

Les tests JUnit couvrent l’origine exacte, les hôtes ressemblants, les schémas exécutables, les routes documentaires, les routes limitées de la passerelle et les montants décimaux.

Sur un appareil ou émulateur Android 8 puis Android 16, avec une **entreprise de test explicitement autorisée** :

1. Se connecter ; ouvrir Encaisser, créer un encaissement `4 000,25`, vérifier le journal et partager le PDF.
2. Vérifier un commercial (portefeuille personnel) et un caissier (caisses affectées), puis un employé sans permission d’encaisser.
3. Couper le réseau avant la validation : aucune opération ne doit apparaître. Simuler une interruption après l’envoi, puis réessayer : une seule opération doit exister.
4. Joindre une photo et un PDF à une dépense ; refuser un fichier trop volumineux ou d’un type non admis.
5. Ouvrir un lien externe et vérifier la confirmation ; une URL HTTP ou `intent:` doit rester bloquée.
6. Se déconnecter : le cache documentaire et la saisie doivent être effacés, l’ancien reçu ne doit plus être accessible via la session.
7. Vérifier le clavier, TalkBack, le grand texte, la rotation et le retour Android sur téléphone et tablette.

La compilation et les tests unitaires ne remplacent pas ces essais d’intégration sur appareil ; ne pas créer d’opérations financières de test dans l’entreprise de production.

## Références officielles

- [Compatibilité AGP 8.13](https://developer.android.com/build/releases/agp-8-13-0-release-notes)
- [WebViewCompat et passerelle par messages](https://developer.android.com/reference/androidx/webkit/WebViewCompat)
- [Versions AndroidX WebKit](https://developer.android.com/jetpack/androidx/releases/webkit)
- [Partage sécurisé avec FileProvider](https://developer.android.com/training/secure-file-sharing/setup-sharing)
- [Réduire les permissions demandées](https://developer.android.com/privacy-and-security/minimize-permission-requests)
