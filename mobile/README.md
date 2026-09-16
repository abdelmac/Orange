# Applications Android et iOS

Les applications se connectent à `https://orange-finance.onrender.com`. Le serveur Next.js/PostgreSQL reste l’autorité pour les permissions, les calculs, les justificatifs et l’audit. Aucun secret ni compte de démonstration n’est embarqué.

## Architecture

- Android : Kotlin, WebView AndroidX, formulaire et navigation natifs, caméra/sélecteur de fichiers système, partage de PDF par FileProvider.
- iOS/iPadOS : Swift/UIKit, WKWebView, formulaire et navigation natifs, capture/sélecteur système, partage et impression des PDF.
- Les appels financiers partent de la page HTTPS authentifiée. Les cookies restent HttpOnly ; il n’y a ni copie du mot de passe ni nouveau jeton dans un stockage natif. Les règles serveur existantes de session, d’entreprise, de permissions et de CSRF s’appliquent.
- Les montants sont transmis comme chaînes décimales. Une saisie reçoit une clé d’idempotence réutilisée lors d’une reprise explicite. Aucune écriture financière n’est mise en file hors ligne.
- Les documents privés sont téléchargés seulement depuis les routes autorisées du serveur, avec contrôle de taille et refus des redirections. Les copies temporaires servent au partage demandé par l’utilisateur. Les copies transmises à une autre application restent sous le contrôle de cette application.

Le nom « Orange Finance » reprend l’application existante. L’identifiant `com.ennearock.orangefinance` est une proposition à confirmer **avant la première publication**, avec l’identité légale de l’éditeur et le mode de distribution. Le contact d’assistance confirmé est `ennearock@gmail.com`.

## Compiler et tester

Voir [Android](README.android.md) et [iOS](README.ios.md). Le workflow [Mobile builds](../.github/workflows/mobile.yml) compile et teste les deux projets sur les plateformes appropriées. Il n’utilise aucune clé de publication.

Les artefacts attendus sont un APK Android de développement installable pour essais, un AAB Android **non signé**, et une application iOS **pour simulateur**. Un build device iOS sans signature contrôle aussi la compilation pour iPhone/iPad ; il ne produit pas une application distribuable. Ces artefacts ne constituent pas une publication en boutique.

L’APK de développement se connecte au service réel : utiliser un compte et une entreprise de test pour toute saisie. Ne jamais exécuter le scénario de recette financière dans les données métier d’une entreprise réelle.

Les clés Android, certificats Apple, profils et fichiers de signature doivent rester hors Git. Les comptes développeur ne sont pas encore créés. Le dossier [publication boutiques](../docs/mobile/STORES.md) décrit les démarches restantes, les déclarations de confidentialité et la recette sur appareils. L’acceptation appartient aux boutiques.

## Icônes

`node scripts/generate-mobile-icons.mjs` régénère les icônes natives et celles des fiches depuis le logo SVG existant. Les PNG produits sont versionnés ; cette commande n’est pas nécessaire à chaque build mobile.

## Compatibilité serveur

Les clients utilisent `/api/me`, `/api/cash-accounts`, `/api/quick-entries` et les routes privées de documents déjà déployées. Conserver ces contrats lors des évolutions du serveur. Le reste des modules utilise l’interface web responsive dans la vue authentifiée. Une migration d’URL demande une nouvelle version des applications et une vérification des cookies, du stockage et des politiques de navigation.
