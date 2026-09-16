import type { Metadata } from "next";
import Link from "next/link";
import {
  Database,
  FileLock2,
  Fingerprint,
  FolderLock,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { InfoSection, PublicInfo } from "@/components/public-info";

export const metadata: Metadata = {
  title: "Confidentialité",
  description:
    "Comment Orange Finance utilise les informations de compte, les opérations professionnelles et les justificatifs privés.",
};

export default function ConfidentialitePage() {
  return (
    <PublicInfo
      current="confidentialite"
      eyebrow="Vos informations, dans leur contexte"
      title="Comprendre l’usage de vos données."
      description="Orange Finance sert à suivre les opérations financières et commerciales d’une entreprise. Cette page décrit les informations utilisées par le service et les moyens de nous contacter."
    >
      <InfoSection
        title="Un accès organisé par votre entreprise"
        icon={<UsersRound size={21} />}
        highlight
      >
        <p>
          Votre entreprise crée les comptes, attribue les rôles et organise l’utilisation du
          service. Elle détermine les opérations et documents nécessaires à son activité. Votre
          administrateur est votre interlocuteur pour connaître les règles applicables à vos
          informations professionnelles et aux accès des collaborateurs.
        </p>
        <p>
          L’assistance technique est joignable depuis la{" "}
          <Link href="/assistance">page d’assistance</Link>. Une demande concernant vos données peut
          également y être transmise pour examen avec l’entreprise concernée.
        </p>
      </InfoSection>

      <InfoSection title="Informations utilisées" icon={<Database size={21} />}>
        <ul>
          <li>
            <strong>Compte et accès :</strong> nom, email, entreprise, rôles, informations de
            session et mot de passe conservé sous forme de hachage.
          </li>
          <li>
            <strong>Activité professionnelle :</strong> clients, fournisseurs, contacts renseignés,
            ventes, factures, montants, modes de règlement, caisses et demandes de dépenses.
          </li>
          <li>
            <strong>Documents et texte :</strong> photos de justificatifs, fichiers PDF, notes,
            motifs et références ajoutés aux opérations.
          </li>
          <li>
            <strong>Traçabilité et fonctionnement :</strong> auteur et date des actions, changements
            enregistrés dans l’audit, tentatives d’authentification et journaux techniques.
            L’adresse IP peut être conservée lorsqu’elle est disponible et configurée.
          </li>
          <li>
            <strong>Assistance :</strong> informations que vous choisissez de communiquer dans une
            demande de support.
          </li>
        </ul>
        <p>
          Ne renseignez que les informations nécessaires à l’opération. Le téléphone est facultatif
          dans la saisie rapide. Les champs libres et justificatifs peuvent contenir des
          informations sur d’autres personnes : vérifiez leur contenu avant de les ajouter.
        </p>
      </InfoSection>

      <InfoSection title="Pourquoi ces informations sont traitées" icon={<Fingerprint size={21} />}>
        <p>
          Elles permettent d’authentifier les collaborateurs, de limiter leurs accès, de calculer
          les soldes, de suivre les validations et paiements, de produire les documents et de
          conserver l’historique des opérations. Les journaux contribuent également à la sécurité du
          service et à la résolution des incidents.
        </p>
        <p>
          Orange Finance n’intègre pas de publicité ni d’outil de suivi publicitaire. Il enregistre
          les mouvements déclarés par les utilisateurs ; il n’exécute pas de virements bancaires et
          ne traite pas de paiements par carte.
        </p>
      </InfoSection>

      <InfoSection title="Accès, hébergement et documents" icon={<FolderLock size={21} />}>
        <p>
          Les informations sont rattachées à une entreprise et accessibles selon les permissions
          attribuées. Les commerciaux disposent d’un périmètre personnel ; les caissiers accèdent
          aux caisses qui leur sont affectées. Les documents privés ne sont pas publiés dans un
          répertoire public.
        </p>
        <p>
          Le service en ligne est hébergé sur Render, dans la région de Francfort, avec une base
          PostgreSQL et un stockage privé pour les justificatifs. Les communications avec le service
          utilisent HTTPS. Les données sont traitées côté serveur pour fournir les fonctionnalités ;
          il ne s’agit pas d’un chiffrement de bout en bout.
        </p>
        <p>
          Lorsqu’un utilisateur exporte un rapport ou partage un PDF, la copie est remise au
          destinataire ou à l’application qu’il choisit. L’accès à cette copie ne dépend plus des
          permissions Orange Finance. Les prestataires techniques nécessaires à l’hébergement et,
          lorsqu’il est configuré, à l’envoi des emails interviennent dans le fonctionnement du
          service.
        </p>
      </InfoSection>

      <InfoSection title="Session et stockage sur votre appareil" icon={<ShieldCheck size={21} />}>
        <p>
          Un cookie de session permet de rester connecté. Sa durée maximale est de huit heures ; une
          déconnexion ou une révocation d’accès peut interrompre la session plus tôt. Aucun mot de
          passe n’est conservé dans ce cookie.
        </p>
        <p>
          Le mode PWA conserve un écran public hors connexion et des icônes. Il ne conserve pas les
          pages authentifiées, les réponses financières ou les justificatifs dans son cache hors
          connexion. Les écritures financières nécessitent une connexion Internet.
        </p>
        <p>
          Les fichiers que vous téléchargez ou partagez peuvent rester sur votre appareil ou dans
          une autre application. Protégez l’accès à l’appareil et supprimez les copies dont vous
          n’avez plus besoin.
        </p>
      </InfoSection>

      <InfoSection
        title="Conservation et demandes concernant vos données"
        icon={<FileLock2 size={21} />}
      >
        <p>
          Les données métier restent enregistrées pour le suivi de l’entreprise. Une transaction
          validée est conservée avec son historique ; une correction crée une contre-écriture.
          L’application ne supprime pas automatiquement l’historique lorsqu’un compte est désactivé.
        </p>
        <p>
          Les durées et obligations de conservation dépendent des informations et de l’entreprise
          concernée. Cette page ne fixe pas une durée universelle ni un effacement automatique des
          documents financiers. Demandez à votre administrateur les règles retenues pour votre
          entreprise.
        </p>
        <p>
          Pour une demande d’accès, de rectification, de fermeture de compte ou de suppression,
          utilisez{" "}
          <Link href="/assistance#donnees">le contact dédié à votre compte et vos données</Link>.
          Une vérification peut être nécessaire pour protéger les informations. Les suites de votre
          demande et les éventuelles données à conserver doivent être précisées lors de son examen.
        </p>
      </InfoSection>
    </PublicInfo>
  );
}
