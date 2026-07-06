import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="min-h-screen">
      <Nav email={user.email ?? ""} />
      <main className="md:ml-56 pb-20 md:pb-0 p-4 md:p-8 max-w-6xl">
        {children}
      </main>
    </div>
  );
}
