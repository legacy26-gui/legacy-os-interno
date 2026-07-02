"use client";

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function TrafficCharts({
  monthly,
  yearly,
}: {
  monthly: { label: string; investimento: number; leads: number }[];
  yearly: { label: string; investimento: number; leads: number }[];
}) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs uppercase text-foreground-muted font-medium mb-4">Comparação mensal</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" stroke="var(--color-foreground-muted)" fontSize={12} />
            <YAxis stroke="var(--color-foreground-muted)" fontSize={12} />
            <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", fontSize: 12 }} />
            <Bar dataKey="investimento" fill="var(--color-accent)" radius={[4, 4, 0, 0]} name="Investimento (R$)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs uppercase text-foreground-muted font-medium mb-4">Comparação anual (leads)</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={yearly}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" stroke="var(--color-foreground-muted)" fontSize={12} />
            <YAxis stroke="var(--color-foreground-muted)" fontSize={12} />
            <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", fontSize: 12 }} />
            <Line type="monotone" dataKey="leads" stroke="var(--color-accent)" strokeWidth={2} name="Leads" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
