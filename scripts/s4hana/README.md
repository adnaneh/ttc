S/4HANA Sandbox Fetcher

This helper pulls S/4HANA OData $metadata and a few sample records from the SAP API Business Hub sandbox for quick model discovery.

Prerequisites
- SAP API Business Hub account and API Key: https://api.sap.com
- Export your key to the shell: `export SAP_API_KEY=YOUR_KEY`

Usage
- List services: `SAP_API_KEY=... ./scripts/s4hana/fetch.sh list`
- Fetch $metadata only: `SAP_API_KEY=... ./scripts/s4hana/fetch.sh metadata API_BUSINESS_PARTNER`
- Fetch sample records only: `SAP_API_KEY=... ./scripts/s4hana/fetch.sh samples API_SALES_ORDER_SRV`
- Fetch everything: `SAP_API_KEY=... ./scripts/s4hana/fetch.sh all`

Outputs
- Files are saved under `samples/s4hana/<SERVICE>/`:
  - `metadata.xml` — OData EDMX model (entities, properties, nav props)
  - `<EntitySet>.json` — Top 5 records for selected entity sets

Included Services (editable in the script)
- `API_BUSINESS_PARTNER` → Business partners and addresses
- `API_SALES_ORDER_SRV` → Sales orders and items
- `API_PRODUCT_SRV` → Product master and texts
- `API_PURCHASEORDER_PROCESS_SRV` → Purchase orders and items

Tips
- The `$metadata` file is XML; open in an editor to inspect entity types, keys, and navigation properties.
- For quick JSON peeks: `jq '.d.results | length' samples/s4hana/API_BUSINESS_PARTNER/A_BusinessPartner.json`
- Add more entity sets by editing `SERVICE_SETS` in `scripts/s4hana/fetch.sh`.

