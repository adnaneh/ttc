'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Invoice = {
  id: string;
  INVOICE_NO: string;
  VENDOR_ID?: string;
  VENDOR_NAME?: string;
  CURRENCY?: string;
  AMOUNT?: number;
  INVOICE_DATE?: string; // YYYY-MM-DD
  DUE_DATE?: string;
  PO_NUMBER?: string;
  UPDATED_AT?: number;
};

async function listInvoices(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/admin/mock-invoices?${qs}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ items: Invoice[]; nextCursor?: string | null }>;
}

async function updateInvoice(id: string, patch: Partial<Invoice>) {
  const res = await fetch(`/api/admin/mock-invoices/${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: true; item: Invoice }>;
}

export default function AdminMockInvoices() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ vendorId: '', invoiceNo: '', currency: '', minAmount: '', maxAmount: '' });
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['mock-invoices', filters, cursor],
    queryFn: () => listInvoices({ ...filters, limit: '25', ...(cursor ? { cursor } : {}) })
  });

  useEffect(() => { setCursor(undefined); }, [filters.vendorId, filters.invoiceNo, filters.currency, filters.minAmount, filters.maxAmount]);

  const items = data?.items || [];
  const next = data?.nextCursor || undefined;

  const [editing, setEditing] = useState<Record<string, Partial<Invoice>>>({});
  const mut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Invoice> }) => updateInvoice(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mock-invoices'] })
  });

  function setEdit(id: string, patch: Partial<Invoice>) {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }
  function save(id: string) {
    const p = editing[id];
    if (!p) return;
    mut.mutate({ id, patch: p });
  }

  const Rows = useMemo(() => items.map((inv) => {
    return (
      <tr key={inv.id} className="border-b align-top">
        <td className="py-2 px-2">{inv.id}</td>
        <td className="py-2 px-2">{inv.INVOICE_NO}</td>
        <td className="py-2 px-2">{inv.VENDOR_ID}</td>
        <td className="py-2 px-2 w-28">
          <Input defaultValue={inv.AMOUNT != null ? String(inv.AMOUNT) : ''}
                 onChange={(ev) => setEdit(inv.id, { AMOUNT: ev.currentTarget.value ? Number(ev.currentTarget.value) : undefined })} />
        </td>
        <td className="py-2 px-2 w-28">
          <Input defaultValue={inv.CURRENCY ?? ''} onChange={(ev) => setEdit(inv.id, { CURRENCY: ev.currentTarget.value })} />
        </td>
        <td className="py-2 px-2 w-36">
          <Input defaultValue={inv.INVOICE_DATE ?? ''} onChange={(ev) => setEdit(inv.id, { INVOICE_DATE: ev.currentTarget.value })} />
        </td>
        <td className="py-2 px-2 w-36">
          <Input defaultValue={inv.DUE_DATE ?? ''} onChange={(ev) => setEdit(inv.id, { DUE_DATE: ev.currentTarget.value })} />
        </td>
        <td className="py-2 px-2 w-36">
          <Input defaultValue={inv.PO_NUMBER ?? ''} onChange={(ev) => setEdit(inv.id, { PO_NUMBER: ev.currentTarget.value })} />
        </td>
        <td className="py-2 px-2 text-xs opacity-70">{inv.UPDATED_AT ? new Date(inv.UPDATED_AT).toLocaleString() : ''}</td>
        <td className="py-2 px-2">
          <div className="flex gap-2">
            <Button onClick={() => save(inv.id)} disabled={mut.isPending}>Save</Button>
            <Button variant="ghost" onClick={() => setEdit(inv.id, {})}>Reset</Button>
          </div>
        </td>
      </tr>
    );
  }), [items, editing, mut.isPending]);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <h1 className="text-2xl font-semibold">Mock Invoices Admin</h1>
      <p className="text-sm opacity-80 mb-4">Browse and edit invoices in the mock DB (Firestore).</p>

      <div className="grid grid-cols-6 gap-2 mb-3">
        <Input placeholder="Vendor ID" value={filters.vendorId} onChange={(e) => setFilters((f) => ({ ...f, vendorId: e.target.value }))} />
        <Input placeholder="Invoice No" value={filters.invoiceNo} onChange={(e) => setFilters((f) => ({ ...f, invoiceNo: e.target.value }))} />
        <Input placeholder="Currency" value={filters.currency} onChange={(e) => setFilters((f) => ({ ...f, currency: e.target.value }))} />
        <Input placeholder="Min Amount" value={filters.minAmount} onChange={(e) => setFilters((f) => ({ ...f, minAmount: e.target.value }))} />
        <Input placeholder="Max Amount" value={filters.maxAmount} onChange={(e) => setFilters((f) => ({ ...f, maxAmount: e.target.value }))} />
        <div className="flex items-center gap-2">
          <Button onClick={() => refetch()} disabled={isFetching}>Search</Button>
          <Button variant="ghost" onClick={() => setFilters({ vendorId: '', invoiceNo: '', currency: '', minAmount: '', maxAmount: '' })}>Clear</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="py-2 px-2">ID</th>
              <th className="py-2 px-2">Invoice</th>
              <th className="py-2 px-2">Vendor</th>
              <th className="py-2 px-2">Amount</th>
              <th className="py-2 px-2">Currency</th>
              <th className="py-2 px-2">Invoice Date</th>
              <th className="py-2 px-2">Due Date</th>
              <th className="py-2 px-2">PO</th>
              <th className="py-2 px-2">Updated</th>
              <th className="py-2 px-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {Rows}
            {items.length === 0 && (
              <tr><td colSpan={10} className="p-4 text-center opacity-70">No results</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button onClick={() => setCursor(next)} disabled={!next || isFetching}>{next ? 'Load more' : 'No more'}</Button>
      </div>
    </main>
  );
}

