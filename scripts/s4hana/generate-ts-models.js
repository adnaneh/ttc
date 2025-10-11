#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const OUT_DIR = path.resolve(__dirname, '../../models/s4hana/ts');
const SAMPLES_DIR = path.resolve(__dirname, '../../samples/s4hana');

const SERVICES = {
  API_PURCHASEORDER_PROCESS_SRV: {
    sets: ['A_PurchaseOrder', 'A_PurchaseOrderItem'],
    outfile: 'purchase-orders.ts',
  },
  API_SUPPLIERINVOICE_PROCESS_SRV: {
    sets: ['A_SupplierInvoice', 'A_SuplrInvcItem'],
    outfile: 'invoices-supplier.ts',
  },
  API_BILLING_DOCUMENT_SRV: {
    sets: ['A_BillingDocument', 'A_BillingDocumentItem'],
    outfile: 'invoices-billing.ts',
  },
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function ensureArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function mapEdmToTs(edm) {
  const t = (edm || '').toLowerCase();
  if (t.endsWith('string') || t.endsWith('guid')) return 'string';
  if (t.endsWith('boolean')) return 'boolean';
  if (t.endsWith('int16') || t.endsWith('int32') || t.endsWith('byte') || t.endsWith('sbyte') || t.endsWith('double') || t.endsWith('single')) return 'number';
  if (t.endsWith('int64') || t.endsWith('decimal')) return 'string'; // keep as string to preserve precision
  if (t.endsWith('datetime') || t.endsWith('datetimeoffset') || t.endsWith('date') || t.endsWith('time') || t.endsWith('timeofday')) return 'string';
  if (t.endsWith('binary')) return 'string';
  return 'any';
}

function parseMetadata(service) {
  const xmlPath = path.join(SAMPLES_DIR, service, 'metadata.xml');
  if (!fs.existsSync(xmlPath)) throw new Error(`Missing metadata file: ${xmlPath}`);
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const j = parser.parse(xml);
  const edmx = j['edmx:Edmx'] || j.Edmx || j.edmx;
  if (!edmx) throw new Error(`Invalid EDMX in ${xmlPath}`);
  const dataServices = edmx['edmx:DataServices'] || edmx.DataServices || edmx['DataServices'];
  const schemas = ensureArray(dataServices.Schema);

  const entityTypes = new Map(); // key: Namespace.Name
  const containers = [];
  for (const s of schemas) {
    const ns = s['@_Namespace'];
    const ets = ensureArray(s.EntityType);
    for (const et of ets) {
      const name = et['@_Name'];
      const key = `${ns}.${name}`;
      const props = ensureArray(et.Property).map(p => ({
        name: p['@_Name'],
        type: p['@_Type'],
        nullable: String(p['@_Nullable'] || 'true').toLowerCase() !== 'false',
        maxLength: p['@_MaxLength'],
      }));
      entityTypes.set(key, { ns, name, fqName: key, properties: props });
    }
    const containersLocal = ensureArray(s.EntityContainer);
    if (containersLocal.length) containers.push(...containersLocal.map(c => ({ ns, c })));
  }

  const setToType = new Map();
  for (const { ns, c } of containers) {
    for (const es of ensureArray(c.EntitySet)) {
      const setName = es['@_Name'];
      const entityType = es['@_EntityType']; // usually Namespace.TypeName
      const fq = entityType.includes('.') ? entityType : `${ns}.${entityType}`;
      setToType.set(setName, fq);
    }
  }
  return { entityTypes, setToType };
}

function toInterfaceName(entitySetName, entityTypeName) {
  // Prefer entity set name as interface to align to $expand usage
  return entitySetName || entityTypeName.replace(/Type$/,'');
}

function generateServiceModels(service, sets, outfile) {
  const { entityTypes, setToType } = parseMetadata(service);
  const lines = [];
  lines.push('// Auto-generated from S/4HANA $metadata');
  lines.push(`// Service: ${service}`);
  lines.push('');
  for (const setName of sets) {
    const fqType = setToType.get(setName);
    if (!fqType) { console.warn(`[warn] Set not found in metadata: ${service}::${setName}`); continue; }
    const et = entityTypes.get(fqType);
    if (!et) { console.warn(`[warn] Entity type not found: ${fqType}`); continue; }
    const ifaceName = toInterfaceName(setName, et.name);
    lines.push(`export interface ${ifaceName} {`);
    for (const p of et.properties) {
      const tsType = mapEdmToTs(p.type);
      const optional = p.nullable ? '?' : '';
      const propName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(p.name) ? p.name : JSON.stringify(p.name);
      lines.push(`  ${propName}${optional}: ${tsType};`);
    }
    lines.push('}');
    lines.push('');
  }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, outfile);
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`[models] Wrote ${outPath}`);
}

function main() {
  for (const [service, cfg] of Object.entries(SERVICES)) {
    try {
      generateServiceModels(service, cfg.sets, cfg.outfile);
    } catch (e) {
      console.warn(`[warn] Skipped ${service}: ${e.message}`);
    }
  }
}

main();

