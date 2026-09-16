import type { Metadata } from "next";
import Link from "next/link";
import { CircleHelp, FileText, KeyRound, Mail, UserRound } from "lucide-react";
import { InfoSection, PublicInfo, SUPPORT_EMAIL, SupportLink } from "@/components/public-info";

export const metadata: Metadata = {
  title: "Assistance",
  description:
    "Contacter le support Orange Finance, retrouver son accès et demander de l’aide pour son compte professionnel.",
};

export default function AssistancePage() {
  return (
    <PublicInfo
      current="assistance"
      eyebrow="Un point de contact pour vous aider"
      title="Besoin d’un coup de main ?"
      description="Retrouvez les informations utiles pour votre accès, vos opérations et vos documents. Cette page reste accessible même lorsque vous n’êtes pas connecté."
    >
      <InfoSection title="Contacter l’assistance" icon={<Mail size={21} />} highlight>
        <p>
          Écrivez à <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> en indiquant le nom de
          votre entreprise, l’écran concerné et ce que vous essayez de faire. Pour un problème
          mobile, précisez le modèle de l’appareil et la version de l’application si vous la
          connaissez.
        </p>
        <p>
          <strong>Ne transmettez pas votre mot de passe.</strong> Masquez les informations de tiers
          dans les captures et évitez de joindre des documents financiers au premier message.
        </p>
        <SupportLink subject="Orange Finance — demande d’assistance">Écrire au support</SupportLink>
      </InfoSection>

      <InfoSection title="Retrouver mon accès" icon={<KeyRound size={21} />}>
        <p>
          Votre compte est créé par l’administrateur de votre entreprise. Contactez-le si vous ne
          possédez pas encore de compte, si votre accès a été désactivé ou si une fonction ne vous
          est pas autorisée.
        </p>
        <p>
          Vous pouvez utiliser <Link href="/forgot-password">Mot de passe oublié</Link>. La
          réception d’un lien dépend de la configuration email du service. Si aucun message
          n’arrive, vérifiez les courriers indésirables puis contactez votre administrateur ou le
          support.
        </p>
      </InfoSection>

      <InfoSection title="Comprendre une opération" icon={<CircleHelp size={21} />}>
        <p>
          Un encaissement sans facture enregistre une entrée d’argent ; il ne règle pas
          automatiquement une facture existante. Une demande de dépense attend sa validation et son
          paiement avant de modifier la caisse.
        </p>
        <p>
          En cas d’erreur, demandez à une personne habilitée d’examiner l’opération. Une écriture
          financière validée se corrige par une annulation tracée, afin de conserver son historique.
        </p>
      </InfoSection>

      <InfoSection title="Joindre ou retrouver un document" icon={<FileText size={21} />}>
        <p>
          Depuis la fiche d’une opération autorisée, ajoutez une photo ou un fichier PDF, JPEG, PNG
          ou WebP de 10 Mo maximum. Le reçu d’une dépense est disponible après son paiement. Les
          documents privés nécessitent une session et les droits correspondants.
        </p>
        <p>
          Un document que vous téléchargez ou partagez quitte l’espace privé de l’application.
          Vérifiez son destinataire avant de l’envoyer.
        </p>
      </InfoSection>

      <InfoSection id="donnees" title="Mon compte et mes données" icon={<UserRound size={21} />}>
        <p>
          Pour demander la fermeture de votre accès, la rectification d’une information ou la
          suppression de données vous concernant, contactez l’administrateur de votre entreprise ou
          écrivez au support. Indiquez l’adresse email de votre compte, votre entreprise et l’objet
          de votre demande, sans communiquer votre mot de passe.
        </p>
        <p>
          La demande est examinée avec l’entreprise concernée ; une vérification de votre identité
          peut être nécessaire. La désactivation d’un accès n’efface pas automatiquement les
          écritures financières ni leur audit. Les données à supprimer et celles à conserver doivent
          être déterminées selon la demande et les obligations de l’entreprise.
        </p>
        <p>
          <Link href="/confidentialite">Consulter les informations de confidentialité</Link>.
        </p>
        <SupportLink subject="Orange Finance — demande concernant mon compte ou mes données">
          Envoyer une demande
        </SupportLink>
      </InfoSection>
    </PublicInfo>
  );
}
