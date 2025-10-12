#!/usr/bin/env bash
set -euo pipefail

# Simple fetcher for SAP S/4HANA sandbox OData (SAP API Business Hub)
# Requires env var SAP_API_KEY to be set (API Business Hub key)
# Usage examples:
#   SAP_API_KEY=xxx ./scripts/s4hana/fetch.sh all
#   SAP_API_KEY=xxx ./scripts/s4hana/fetch.sh metadata API_BUSINESS_PARTNER
#   SAP_API_KEY=xxx ./scripts/s4hana/fetch.sh samples API_SALES_ORDER_SRV

if [[ "${SAP_API_KEY:-}" == "" ]]; then
  echo "Error: SAP_API_KEY not set. Get a key from https://api.sap.com and export SAP_API_KEY."
  exit 1
fi

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_ROOT="${BASE_DIR%/scripts/s4hana}/samples/s4hana"
mkdir -p "$OUT_ROOT"

# Define services and a few useful entity sets (bash 3-compatible)
SERVICES=(
  API_BUSINESS_PARTNER
  API_SALES_ORDER_SRV
  API_PRODUCT_SRV
  API_PURCHASEORDER_PROCESS_SRV
  API_SUPPLIERINVOICE_PROCESS_SRV
  API_BILLING_DOCUMENT_SRV
  API_CV_ATTACHMENT_SRV
)

get_base() {
  case "$1" in
    API_BUSINESS_PARTNER)
      echo "https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/API_BUSINESS_PARTNER" ;;
    API_SALES_ORDER_SRV)
      echo "https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/API_SALES_ORDER_SRV" ;;
    API_PRODUCT_SRV)
      echo "https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/API_PRODUCT_SRV" ;;
    API_PURCHASEORDER_PROCESS_SRV)
      echo "https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV" ;;
    API_SUPPLIERINVOICE_PROCESS_SRV)
      echo "https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/API_SUPPLIERINVOICE_PROCESS_SRV" ;;
    API_BILLING_DOCUMENT_SRV)
      echo "https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/API_BILLING_DOCUMENT_SRV" ;;
    API_CV_ATTACHMENT_SRV)
      echo "https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/API_CV_ATTACHMENT_SRV" ;;
    *) return 1 ;;
  esac
}

get_sets() {
  case "$1" in
    API_BUSINESS_PARTNER)
      echo "A_BusinessPartner A_BusinessPartnerAddress" ;;
    API_SALES_ORDER_SRV)
      echo "A_SalesOrder A_SalesOrderItem" ;;
    API_PRODUCT_SRV)
      echo "A_Product A_ProductText" ;;
    API_PURCHASEORDER_PROCESS_SRV)
      echo "A_PurchaseOrder A_PurchaseOrderItem" ;;
    API_SUPPLIERINVOICE_PROCESS_SRV)
      echo "A_SupplierInvoice A_SupplierInvoiceItemAsset A_SupplierInvoiceItemGLAcct A_SupplierInvoiceItemMaterial" ;;
    API_BILLING_DOCUMENT_SRV)
      echo "A_BillingDocument A_BillingDocumentItem" ;;
    API_CV_ATTACHMENT_SRV)
      echo "A_DocumentInfoRecordAttch AttachmentContentSet" ;;
    *) return 1 ;;
  esac
}

curl_json() {
  local url="$1"
  curl -sS --compressed \
    -H "APIKey: ${SAP_API_KEY}" \
    -H "Accept: application/json" \
    --fail \
    "$url"
}

curl_xml() {
  local url="$1"
  curl -sS --compressed \
    -H "APIKey: ${SAP_API_KEY}" \
    -H "Accept: application/xml" \
    --fail \
    "$url"
}

fetch_metadata() {
  local service="$1"
  local base
  base="$(get_base "$service")" || true
  if [[ -z "${base:-}" ]]; then
    echo "Unknown service: $service" >&2
    return 1
  fi
  local out_dir="$OUT_ROOT/$service"
  mkdir -p "$out_dir"
  echo "[metadata] $service -> $out_dir/metadata.xml"
  curl_xml "${base}/\$metadata" >"$out_dir/metadata.xml"
}

fetch_samples() {
  local service="$1"
  local base sets
  base="$(get_base "$service")" || true
  sets="$(get_sets "$service")" || true
  if [[ -z "${base:-}" ]]; then
    echo "Unknown service: $service" >&2
    return 1
  fi
  if [[ -z "${sets:-}" ]]; then
    echo "No entity sets configured for service: $service" >&2
    return 1
  fi
  local out_dir="$OUT_ROOT/$service"
  mkdir -p "$out_dir"
  for set in $sets; do
    local url="${base}/${set}?\$format=json&\$top=5"
    local out_file="$out_dir/${set}.json"
    echo "[sample] $service::$set -> $out_file"
    curl_json "$url" >"$out_file" || {
      echo "Warning: failed to fetch $url" >&2
    }
  done
}

fetch_all() {
  for service in "${SERVICES[@]}"; do
    fetch_metadata "$service" || true
    fetch_samples "$service" || true
  done
}

cmd="${1:-help}"
case "$cmd" in
  all)
    fetch_all
    ;;
  metadata)
    svc="${2:-}"
    if [[ -z "$svc" ]]; then
      echo "Usage: $0 metadata <SERVICE>" >&2; exit 2
    fi
    fetch_metadata "$svc"
    ;;
  samples)
    svc="${2:-}"
    if [[ -z "$svc" ]]; then
      echo "Usage: $0 samples <SERVICE>" >&2; exit 2
    fi
    fetch_samples "$svc"
    ;;
  list)
    echo "Available services:"
    for s in "${SERVICES[@]}"; do
      echo "- $s -> $(get_base "$s")"
    done
    ;;
  help|*)
    cat <<EOF
Usage:
  SAP_API_KEY=... $0 list
  SAP_API_KEY=... $0 metadata <SERVICE>
  SAP_API_KEY=... $0 samples <SERVICE>
  SAP_API_KEY=... $0 all

Services included:
  - API_BUSINESS_PARTNER
  - API_SALES_ORDER_SRV
  - API_PRODUCT_SRV
  - API_PURCHASEORDER_PROCESS_SRV

Outputs go to: $(realpath -- "$OUT_ROOT" 2>/dev/null || echo "$OUT_ROOT")
EOF
    ;;
esac
