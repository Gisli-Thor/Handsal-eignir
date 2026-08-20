import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { roleHome } from "@/lib/auth-guards";

export default async function RootPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(roleHome(session));
}
