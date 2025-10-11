'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

type InvoiceFields = {
  invoiceNo?: string;
  vendorId?: string;
  vendorName?: string;
  currency?: string;
  amount?: number;
  invoiceDate?: string;
  dueDate?: string;
  poNumber?: string;
};

type Incoherence = { field: string; sap: any; email: any; suggested?: any };
type Mapping = Record<keyof InvoiceFields, string>;

const DEFAULT_MAPPING: Mapping = {
  invoiceNo: 'INVOICE_NO',
  vendorId: 'VENDOR_ID',
  vendorName: 'VENDOR_NAME',
  currency: 'CURRENCY',
  amount: 'AMOUNT',
  invoiceDate: 'INVOICE_DATE',
  dueDate: 'DUE_DATE',
  poNumber: 'PO_NUMBER'
};

const FIELD_DESCRIPTORS: Array<{ key: keyof InvoiceFields; label: string }> = [
  { key: 'invoiceNo',   label: 'Invoice #'   },
  { key: 'vendorId',    label: 'Vendor ID'   },
  { key: 'vendorName',  label: 'Vendor Name' },
  { key: 'poNumber',    label: 'PO Number'   },
  { key: 'currency',    label: 'Currency'    },
  { key: 'amount',      label: 'Amount'      },
  { key: 'invoiceDate', label: 'Invoice Date'},
  { key: 'dueDate',     label: 'Due Date'    }
];

function numOrNull(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && isFinite(v)) return v;
  const s = String(v).trim().replace(/[^\d.,-]/g, '').replace(/\.(?=.*\.)/g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : null;
}

export default function TestInvoicePage() {
  const [file, setFile] = useState<File | null>(null);
  const [mock, setMock] = useState(true);
  const [loading, setLoading] = useState(false);
  const [mapping, setMapping] = useState<Mapping>(DEFAULT_MAPPING);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load/save mapper from localStorage (per browser)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('sapFieldMapping');
      if (raw) setMapping({ ...DEFAULT_MAPPING, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);
  function saveMapping() {
    localStorage.setItem('sapFieldMapping', JSON.stringify(mapping));
  }
  function resetMapping() {
    setMapping(DEFAULT_MAPPING);
    localStorage.removeItem('sapFieldMapping');
  }

  const [result, setResult] = useState<{
    file?: { filename: string; mimetype: string; bytes: number };
    extracted?: InvoiceFields;
    sap?: Record<string, any> | null;
    matched?: boolean;
    incoherences?: Incoherence[];
    modelUsed?: string;
    tolerance?: number;
    error?: string;
  } | null>(null);

  const fnBase = process.env.NEXT_PUBLIC_FUNCTIONS_URL!;
  async function onUpload() {
    // If no file is selected, prompt the file chooser
    if (!file) {
      fileInputRef.current?.click();
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('invoice', file);
      const url = `${fnBase}/testInvoice?mock=${mock ? '1' : '0'}`;
      const res = await fetch(url, { method: 'POST', body: fd });
      const json = await res.json();
      setResult(json);
    } catch (e: any) {
      setResult({ error: String(e?.message || e) });
    } finally {
      setLoading(false);
    }
  }

  const incMap = useMemo(() => {
    const m = new Map<string, Incoherence>();
    (result?.incoherences || []).forEach(i => m.set(i.field, i));
    return m;
  }, [result]);

  const tol = result?.tolerance ?? 0.01;

  function sapValueFor(key: keyof InvoiceFields): any {
    const sap = result?.sap || {};
    const col = mapping[key] || DEFAULT_MAPPING[key];
    return (sap as any)[(col || '').toUpperCase()];
  }

  function isDateEqual(a?: any, b?: any) {
    if (!a || !b) return false;
    const A = String(a).slice(0,10);
    const B = String(b).slice(0,10);
    return A === B;
  }

  function diffBadge(key: keyof InvoiceFields, extracted: any, sapVal: any) {
    const n1 = numOrNull(extracted);
    const n2 = numOrNull(sapVal);
    if (n1 == null || n2 == null) return null;
    const d = +(n1 - n2).toFixed(2);
    const within = Math.abs(d) <= tol;
    const cls = within ? 'text-emerald-700' : 'text-red-700';
    const bg  = within ? 'bg-emerald-50' : 'bg-red-50';
    return (
      <span className={`ml-2 text-xs px-2 py-0.5 rounded ${cls} ${bg}`}>
        Δ {d >= 0 ? '+' : ''}{d.toFixed(2)}
      </span>
    );
  }

  function rowIsDifferent(key: keyof InvoiceFields, extracted: any, sapVal: any) {
    if (extracted == null || sapVal == null) return false;
    if (incMap.has(key as string)) return true;
    const n1 = numOrNull(extracted);
    const n2 = numOrNull(sapVal);
    if (n1 != null && n2 != null) return Math.abs(n1 - n2) > tol;
    if (key === 'invoiceDate' || key === 'dueDate') return !isDateEqual(extracted, sapVal);
    return String(extracted).trim().toLowerCase() !== String(sapVal).trim().toLowerCase();
  }

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Invoice Test Harness</h1>
      <p className="text-sm opacity-80">Upload a PDF or image (PNG/JPEG) invoice → extract entities → compare with SAP (HANA). Configure your HANA column names below.</p>

      {/* Upload panel */}
      <div className="rounded-md border p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <input
            ref={fileInputRef}
            id="invoice-file"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="sr-only"
            aria-label="Invoice PDF or Image (PNG/JPEG)"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} />
            Use mock SAP (no DB)
          </label>
          <Button onClick={onUpload} disabled={loading}>
            {loading ? 'Analyzing…' : (file ? 'Upload & Analyze' : 'Choose PDF/Image…')}
          </Button>
        </div>
        {file && <p className="text-xs opacity-70">Selected: {file.name} ({Math.round(file.size/1024)} KB)</p>}
      </div>

      {/* Field Mapper */}
      <div className="rounded-md border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Field Mapper (HANA columns)</h3>
          <div className="flex gap-2">
            <Button onClick={saveMapping} title="Save mapping to this browser">Save</Button>
            <Button onClick={resetMapping} title="Reset to defaults" variant="ghost">Reset</Button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-3 w-48">App Field</th>
              <th className="py-2 pr-3">HANA Column Name</th>
              <th className="py-2 pr-3">Example / Hint</th>
            </tr>
          </thead>
          <tbody>
            {FIELD_DESCRIPTORS.map(({ key, label }) => (
              <tr key={String(key)} className="border-b last:border-0">
                <td className="py-2 pr-3 font-medium">{label}</td>
                <td className="py-2 pr-3">
                  <input
                    className="w-full rounded border px-2 py-1 text-sm"
                    value={mapping[key]}
                    onChange={(e) => setMapping(m => ({ ...m, [key]: e.target.value }))}
                    placeholder={DEFAULT_MAPPING[key]}
                  />
                </td>
                <td className="py-2 pr-3 text-xs opacity-70">{DEFAULT_MAPPING[key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs opacity-70">
          The mapper only affects the **UI** lookup into the SAP row returned by the test endpoint. For production, use a HANA view or adapt the server mapping.
        </p>
      </div>

      {/* Errors */}
      {result?.error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-800">
          <b>Error:</b> {result.error}
        </div>
      )}

      {/* Results */}
      {result && !result.error && (
        <>
          {/* Summary + Incoherences list */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-md border p-4">
              <h3 className="font-semibold mb-2">Status</h3>
              <p className="text-sm">
                {result.matched ? <span className="text-green-700">Matched in SAP</span> : <span className="text-amber-700">No SAP match (mock shown if enabled)</span>}
              </p>
              <p className="text-xs opacity-70 mt-1">Model: {result.modelUsed || 'regex-only'}</p>
              {typeof result.tolerance === 'number' && (
                <p className="text-xs opacity-70 mt-1">Tolerance: {result.tolerance}</p>
              )}
              {result.file && (
                <p className="text-xs opacity-70 mt-1">File: {result.file.filename} ({Math.round(result.file.bytes/1024)} KB)</p>
              )}
            </div>

            <div className="rounded-md border p-4 md:col-span-2">
              <h3 className="font-semibold mb-2">Incoherences (from server)</h3>
              {(result.incoherences || []).length === 0 ? (
                <p className="text-sm opacity-70">None detected.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-3">Field</th>
                      <th className="py-2 pr-3">File</th>
                      <th className="py-2 pr-3">SAP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.incoherences!.map((i) => (
                      <tr key={i.field} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{i.field}</td>
                        <td className="py-2 pr-3">{String(i.email ?? '')}</td>
                        <td className="py-2 pr-3">{String(i.sap ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Extracted vs SAP (with mapper + deltas) */}
          <div className="rounded-md border p-4">
            <h3 className="font-semibold mb-3">Extracted vs. SAP (HANA)</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3 w-48">Field</th>
                  <th className="py-2 pr-3">File (extracted)</th>
                  <th className="py-2 pr-3">SAP (HANA column)</th>
                </tr>
              </thead>
              <tbody>
                {FIELD_DESCRIPTORS.map(({ key, label }) => {
                  const extracted = (result?.extracted || {})[key];
                  const sapVal = sapValueFor(key);
                  const diff = rowIsDifferent(key, extracted, sapVal);
                  const colName = mapping[key] || DEFAULT_MAPPING[key];
                  return (
                    <tr key={String(key)} className={`border-b last:border-0 ${diff ? 'bg-red-50' : ''}`}>
                      <td className="py-2 pr-3 font-medium">{label}</td>
                      <td className="py-2 pr-3">{extracted != null ? String(extracted) : <span className="opacity-50">—</span>}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center">
                          <span>{sapVal != null ? String(sapVal) : <span className="opacity-50">—</span>}</span>
                          {diffBadge(key, extracted, sapVal)}
                        </div>
                        <div className="text-xs opacity-60 mt-1">HANA: <code>{colName}</code></div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Raw JSON */}
          <details className="rounded-md border p-4">
            <summary className="cursor-pointer font-medium">Raw JSON (debug)</summary>
            <pre className="mt-3 text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>
          </details>
        </>
      )}
    </main>
  );
}
