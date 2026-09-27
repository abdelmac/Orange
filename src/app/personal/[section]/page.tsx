import { notFound } from "next/navigation";
import { PersonalWorkspace } from "@/components/personal/workspace";
const sections = [
  "transactions",
  "depenses",
  "revenus",
  "budgets",
  "categories",
  "comptes",
  "statistiques",
  "parametres",
];
export default async function PersonalSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  return <PersonalWorkspace key={section} section={section} />;
}
