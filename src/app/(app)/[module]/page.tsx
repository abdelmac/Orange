import { ModulePage } from "@/components/module-page";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
export default async function Page({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  return (
    <Suspense fallback={<Loading />}>
      <ModulePage module={module} />
    </Suspense>
  );
}
