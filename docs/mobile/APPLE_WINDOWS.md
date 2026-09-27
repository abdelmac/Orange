# Publier sur TestFlight depuis Windows

État au 26 septembre 2026 : le propriétaire confirme son compte Apple Developer **Individual** activé et le Team ID **KDHSLMD5LF**. Aucun D-U-N-S ni Mac personnel n’est nécessaire pour ce parcours. Le nom légal apparaîtra comme vendeur. Le nom **Orange Finance** et le bundle ID **com.ennearock.orangefinance** restent à confirmer avant de les enregistrer chez Apple.

Le workflow manuel `iOS — signed release and TestFlight` compile sur les machines macOS de GitHub. Les essais de compilation existants sont indépendants de ce workflow. Une exécution signée et un envoi Apple restent à valider avec les vrais certificats ; aucun build TestFlight n’a encore été envoyé par cette préparation.

La demande de certificat est déjà générée sur la machine de travail : `.local/apple-signing/distribution.certSigningRequest`, avec le libellé interne `Orange Finance Distribution` et l’email de support confirmé. Transmettre ce fichier à Apple à l’étape 2 ; ne pas régénérer la clé existante. Ce libellé de demande ne renseigne ni ne remplace l’identité légale du titulaire chez Apple.

## 1. Identifiant et fiche Apple

Depuis le navigateur Windows :

1. Dans [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list), enregistrer un **App ID → App → Explicit** avec le bundle ID définitif. Ne pas activer de capacité supplémentaire sans besoin de l’application.
2. Dans [App Store Connect](https://appstoreconnect.apple.com), créer **Apps → + → Nouvelle app → iOS** : nom définitif, français, même bundle ID et SKU interne unique, par exemple `orange-finance-ios-001`. Si la fiche existe déjà, réutiliser son identifiant exact.
3. Vérifier que le titulaire a accepté les contrats Apple requis. L’inscription seule ne remplit pas la fiche ni les déclarations de confidentialité.

## 2. Certificat de distribution sans Mac

Node.js et OpenSSL sont nécessaires. Le script sait trouver OpenSSL fourni avec Git pour Windows ; `OPENSSL_PATH` permet de préciser un autre exécutable.

Pour une nouvelle installation où la demande n’existe pas encore, depuis la racine du dépôt, remplacer les valeurs d’exemple par les coordonnées du titulaire :

```powershell
node scripts/ios/signing-material.mjs csr --name "Votre nom légal" --email "votre@email.fr"
```

Cette commande génère une clé RSA chiffrée et la demande `.local/apple-signing/distribution.certSigningRequest`. Le dossier est privé, exclu de Git, et ses fichiers existants ne sont jamais écrasés. Elle ne contacte pas Apple. Sauvegarder les fichiers privés dans un coffre approprié ; la clé sera réutilisée pour les versions suivantes.

Dans [Apple Developer → Certificates](https://developer.apple.com/account/resources/certificates/list), cliquer **+ → Apple Distribution**, puis transmettre **uniquement le fichier `.certSigningRequest`**. Télécharger le certificat `.cer` et le placer dans `.local/apple-signing/`.

```powershell
node scripts/ios/signing-material.mjs package --certificate ".local/apple-signing/distribution.cer"
```

Le script vérifie la période de validité, le nom de type Apple Distribution et la correspondance avec la clé privée. Il produit un P12 chiffré, son mot de passe et sa représentation Base64 sans les afficher. La vérification de la chaîne Apple et de la signature sera effectuée par les outils macOS lors de la compilation.

## 3. Profil App Store Connect

Dans [Apple Developer → Profiles](https://developer.apple.com/account/resources/profiles/list), créer un profil **Distribution → App Store Connect**, choisir le même App ID et le certificat Apple Distribution précédent, puis télécharger le `.mobileprovision` dans `.local/apple-signing/`.

Pour préparer sa valeur Base64 sans l’afficher :

```powershell
$iosProfileFile = Resolve-Path ".local/apple-signing/OrangeFinance.mobileprovision"
[IO.File]::WriteAllText(
  "$PWD/.local/apple-signing/profile.base64.txt",
  [Convert]::ToBase64String([IO.File]::ReadAllBytes($iosProfileFile.Path))
)
```

Le nom du fichier téléchargé peut différer : adapter la première ligne.

## 4. Clé pour l’envoi à Apple

Dans **App Store Connect → Utilisateurs et accès → Intégrations → App Store Connect API**, demander l’accès à l’API si ce bouton est affiché, puis créer une **clé d’équipe / Team Key**, nommée par exemple `Orange GitHub TestFlight`, avec le rôle **App Manager / Gestionnaire d’apps**. Cette clé sert seulement à l’envoi, sans création automatique de certificats ou de profils.

Un abonnement Apple **Individual** et une **Individual API Key** désignent deux choses différentes. Ce workflow attend une **Team Key**, son **Key ID**, son **Issuer ID** et le fichier privé `.p8`. Ne pas confondre Issuer ID et Team ID. La clé est téléchargeable une seule fois et porte sur les apps autorisées par son rôle dans le compte.

Ne transmettre ni mot de passe Apple ni fichier privé dans une conversation. Conserver le `.p8` localement sous `.local/apple-signing/` ou dans un coffre ; copier sa valeur directement dans GitHub Secrets.

## 5. Configuration GitHub

Dans le dépôt GitHub, ouvrir **Settings → Environments**, créer l’environnement **ios-release** et le limiter à la branche `main`. Ajouter les variables et secrets ci-dessous dans cet environnement. Une éventuelle règle de revue déjà configurée sur cet environnement reste applicable.

| Variables       | Valeur                                                 |
| --------------- | ------------------------------------------------------ |
| `APPLE_TEAM_ID` | `KDHSLMD5LF`                                           |
| `IOS_BUNDLE_ID` | Identifiant final exactement identique à celui d’Apple |

| Secrets                         | Valeur à copier depuis un fichier privé, jamais dans Git                        |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `IOS_DISTRIBUTION_P12_BASE64`   | Contenu de `distribution.p12.base64.txt`                                        |
| `IOS_DISTRIBUTION_P12_PASSWORD` | Contenu de `p12-password.txt`                                                   |
| `IOS_PROVISION_PROFILE_BASE64`  | Contenu de `profile.base64.txt`                                                 |
| `ASC_KEY_ID`                    | Identifiant de la Team Key App Store Connect                                    |
| `ASC_ISSUER_ID`                 | Issuer ID App Store Connect                                                     |
| `ASC_PRIVATE_KEY`               | Contenu complet du `.p8`, lignes BEGIN/END incluses, sans Base64 supplémentaire |

Le script local ne transfère pas automatiquement ces secrets à GitHub. Les trois secrets `ASC_*` ne sont nécessaires que lorsque l’envoi TestFlight est demandé. La clé de distribution est importée dans un trousseau temporaire ; le workflow vérifie profil, équipe, bundle ID et certificat avant archivage, puis nettoie les fichiers privés. Aucun profil ni P12 ni clé API ne doit être ajouté aux artefacts.

## 6. Compiler, puis envoyer

Après inclusion du workflow dans la branche `main` : **Actions → iOS — signed release and TestFlight → Run workflow**. Choisir une version (par exemple `1.0.0`) et un numéro de build encore inutilisé pour cette version dans App Store Connect.

- Sans cocher `upload_to_testflight` : tests, archive signée, export et contrôles locaux du fichier IPA. Aucun envoi Apple.
- Avec `upload_to_testflight` : mêmes contrôles, puis envoi à App Store Connect. Cette action ne soumet pas l’app à la revue publique et n’invite aucun testeur.

Le traitement Apple peut se poursuivre après la fin de la commande d’envoi. Vérifier le build dans **App Store Connect → TestFlight**, compléter les informations de chiffrement demandées et l’ajouter au groupe de test approprié. Tester sur un iPhone et un iPad avec une entreprise de démonstration isolée avant la publication. Les secrets, signatures, essais matériels et captures restent nécessaires même si les compilations de contrôle précédentes étaient vertes.

Pour la fiche publique, les déclarations et le compte de revue Apple, poursuivre avec [STORES.md](STORES.md). L’acceptation et la disponibilité sur l’App Store ne sont pas attestées par un simple envoi TestFlight.

## Vérifications de la préparation

Le 26 septembre 2026 : 20 contrôles Windows sur la génération CSR/P12 avec certificats de test locaux, 26 contrôles des entrées/profils CI et 7 contrôles simulés des exports signés réussis. Syntaxes Python/Bash et structure YAML vérifiées ; TypeScript, lint, 29 tests unitaires et build web réussis. La demande CSR destinée au titulaire a également passé la vérification cryptographique OpenSSL. Ces contrôles ne prouvent pas la validité d’un certificat réel ni un envoi Apple ; le premier archivage signé reste à exécuter après configuration des accès.

Sources : [clés API Apple](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/), [profil de distribution Apple](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile), [envoi des builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/), [signature sur GitHub macOS](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications).
