"use client";

import { useEffect, useState } from "react";
import { Users, Search } from "lucide-react";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/usage");
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users || []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = users.filter((u) =>
    (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase">Email</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase">Role</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase">Company</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-zinc-500 text-sm">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-zinc-500 text-sm">No users found</td></tr>
            ) : (
              filtered.map((user, i) => (
                <tr key={i} className="hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-sm text-white">{user.email || "—"}</td>
                  <td className="px-5 py-3 text-sm text-zinc-400">{user.role || "member"}</td>
                  <td className="px-5 py-3 text-sm text-zinc-400">{user.company_name || "—"}</td>
                  <td className="px-5 py-3 text-sm text-zinc-500">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
