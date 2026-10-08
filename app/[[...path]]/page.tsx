import { Application } from "@/components/application";
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  return <Application path={(await params).path ?? []} />;
}
