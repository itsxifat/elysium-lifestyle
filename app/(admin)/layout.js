import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/layout/AdminSidebar";

export const metadata = {
  title: { default: "Admin", template: "%s | Elysium Admin" },
};

export default async function AdminLayout({ children }) {
  const session = await getServerSession(authOptions);

  if (!session) redirect("/admin/login");
  if (session.user.role !== "admin") redirect("/admin/login?error=access_denied");

  return (
    <div className="flex min-h-screen bg-[#F6F2EC]">
      <AdminSidebar user={session.user} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Spacer for fixed mobile topbar */}
        <div className="h-14 lg:hidden flex-shrink-0" />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
