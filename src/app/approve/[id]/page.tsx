import { redirect } from "next/navigation";

// Old route; the align screen replaced it.
export default async function ApprovePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/align/${encodeURIComponent(id)}`);
}
