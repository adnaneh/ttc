S/4HANA Models

Generated TypeScript interfaces for key S/4HANA business objects related to purchase orders and invoices.

Generated Files
- ts/purchase-orders.ts — `A_PurchaseOrder`, `A_PurchaseOrderItem`
- ts/invoices-supplier.ts — `A_SupplierInvoice`, `A_SupplierInvoiceItemAsset`, `A_SupplierInvoiceItemGLAcct`, `A_SupplierInvoiceItemMaterial`
- ts/invoices-billing.ts — `A_BillingDocument`, `A_BillingDocumentItem`
- ts/attachments.ts — `A_DocumentInfoRecordAttch`, `AttachmentContentSet`, `AttachmentHarmonizedOperationSet`, `AttachmentForSAPObjectNodeTypeSet`, `SAPObjectDocumentTypeSet` (generated from EDMX)

Source
- Derived from `$metadata` under `samples/s4hana/<SERVICE>/metadata.xml` using `scripts/s4hana/generate-ts-models.js`.
- Attachment service (`API_CV_ATTACHMENT_SRV`) is now parsed from its EDMX (`samples/s4hana/API_CV_ATTACHMENT_SRV/metadata.xml`).

Notes
- OData numeric types with potential precision (e.g., `Edm.Decimal`, `Edm.Int64`) are typed as `string` for safety.
- Property optionality reflects `Nullable` in the EDMX. Non-nullable properties are required.
- Regenerate models after refreshing metadata: `node scripts/s4hana/generate-ts-models.js`.
